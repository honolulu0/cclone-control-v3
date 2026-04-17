import type {
  CodexSettingsSchema,
  CodexSettingsSnapshot,
  HistoryRecord,
  ProfileRecord,
  TemplateRecord,
  ThreadDetail,
  ThreadSummary,
  WorkspaceSummary
} from "../types";

async function requestJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined && init.body !== null && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(url, {
    headers,
    ...init
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(payload?.error || `${response.status} ${response.statusText}`);
  }
  return payload as T;
}

async function uploadFile(file: File) {
  const response = await fetch("/api/uploads", {
    method: "POST",
    headers: {
      "Content-Type": file.type || "application/octet-stream",
      "X-File-Name": encodeURIComponent(file.name || "upload.bin")
    },
    body: file
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(payload?.error || `${response.status} ${response.statusText}`);
  }
  return payload as {
    id: string;
    kind: "image" | "file";
    name: string;
    storedPath: string;
    mediaType: string | null;
  };
}

export const api = {
  health: () => requestJson<any>("/api/health"),
  models: () => requestJson<any>("/api/models"),
  collaborationModes: () => requestJson<any>("/api/collaboration-modes"),
  workspaces: () => requestJson<{ data: WorkspaceSummary[] }>("/api/workspaces"),
  threads: (params: { workspaceId?: string; state?: "active" | "archived"; search?: string }) => {
    const searchParams = new URLSearchParams();
    if (params.workspaceId) searchParams.set("workspaceId", params.workspaceId);
    if (params.state) searchParams.set("state", params.state);
    if (params.search) searchParams.set("search", params.search);
    return requestJson<{ data: ThreadSummary[] }>(`/api/threads${searchParams.toString() ? `?${searchParams}` : ""}`);
  },
  threadDetail: async (threadId: string) => {
    const payload = await requestJson<any>(`/api/threads/${encodeURIComponent(threadId)}`);
    return (payload?.thread ?? payload) as ThreadDetail;
  },
  threadEventsUrl: (threadId: string) => `/api/threads/${encodeURIComponent(threadId)}/events`,
  aggregatedThreadEventsUrl: () => "/api/thread-events",
  threadRequestsUrl: () => "/api/thread-requests",
  templates: () => requestJson<{ data: TemplateRecord[] }>("/api/templates"),
  createTemplate: (body: Pick<TemplateRecord, "name" | "content" | "tags">) =>
    requestJson<TemplateRecord>("/api/templates", { method: "POST", body: JSON.stringify(body) }),
  updateTemplate: (id: string, body: Partial<Pick<TemplateRecord, "name" | "content" | "tags">>) =>
    requestJson<TemplateRecord>(`/api/templates/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteTemplate: (id: string) =>
    requestJson<{ ok: true }>(`/api/templates/${encodeURIComponent(id)}`, { method: "DELETE" }),
  profiles: () => requestJson<{ data: ProfileRecord[] }>("/api/profiles"),
  createProfile: (body: Omit<ProfileRecord, "id" | "createdAt" | "updatedAt">) =>
    requestJson<ProfileRecord>("/api/profiles", { method: "POST", body: JSON.stringify(body) }),
  updateProfile: (id: string, body: Partial<Omit<ProfileRecord, "id" | "createdAt" | "updatedAt">>) =>
    requestJson<ProfileRecord>(`/api/profiles/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteProfile: (id: string) =>
    requestJson<{ ok: true }>(`/api/profiles/${encodeURIComponent(id)}`, { method: "DELETE" }),
  history: () => requestJson<{ data: HistoryRecord[] }>("/api/history"),
  sendMessage: (body: {
    workspaceId?: string | null;
    threadId?: string | null;
    cwdOverride?: string | null;
    message?: string | null;
    attachments?: Array<Record<string, unknown>>;
    profileId?: string | null;
    planMode?: boolean;
  }) => requestJson<any>("/api/messages", { method: "POST", body: JSON.stringify(body) }),
  uploadFile,
  codexSettings: () => requestJson<CodexSettingsSnapshot>("/api/codex-settings"),
  codexSettingsSchema: () => requestJson<CodexSettingsSchema>("/api/codex-settings/schema"),
  updateCodexSettings: (body: Record<string, unknown>) =>
    requestJson<CodexSettingsSnapshot>("/api/codex-settings", { method: "PUT", body: JSON.stringify(body) })
};
