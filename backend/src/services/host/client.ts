export interface HostThreadSummary {
  id: string;
  preview: string;
  createdAt?: number | string | null;
  updatedAt?: number | string | null;
  cwd?: string | null;
  name?: string | null;
  status?: unknown;
  archived?: boolean;
}

export interface HostClient {
  health(): Promise<unknown>;
  listModels(): Promise<any>;
  listCollaborationModes(): Promise<any>;
  listThreads(options?: Record<string, unknown>): Promise<{ data?: HostThreadSummary[]; nextCursor?: string | null }>;
  readThread(threadId: string, options?: { includeTurns?: boolean }): Promise<any>;
  sendThreadMessage(threadId: string, body: unknown): Promise<any>;
  chat(body: unknown): Promise<any>;
  subscribeThreadEvents(threadId: string, options?: { includeTurns?: boolean; signal?: AbortSignal }): Promise<Response>;
  subscribeGlobalThreadEvents(options?: { signal?: AbortSignal }): Promise<Response>;
  subscribeThreadRequests(options?: { signal?: AbortSignal }): Promise<Response>;
  getConfig(options?: { includeLayers?: boolean; cwd?: string | null }): Promise<any>;
  getConfigRequirements(): Promise<any>;
  batchWriteConfig(body: unknown): Promise<any>;
}

export function createHostClient(baseUrl: string, token: string | null): HostClient {
  const normalizedBaseUrl = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;

  async function requestJson(method: string, pathname: string, body?: unknown): Promise<any> {
    const response = await fetch(new URL(pathname, normalizedBaseUrl), {
      method,
      headers: {
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });

    const text = await response.text();
    const payload = text ? tryParseJson(text) : null;
    if (!response.ok) {
      throw new Error(payload?.error || payload?.message || `${response.status} ${response.statusText}`);
    }
    return payload;
  }

  async function openEventStream(pathname: string, options: { signal?: AbortSignal } = {}): Promise<Response> {
    const response = await fetch(new URL(pathname, normalizedBaseUrl), {
      method: "GET",
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      signal: options.signal
    });

    if (!response.ok) {
      const text = await response.text();
      const payload = text ? tryParseJson(text) : null;
      throw new Error(payload?.error || payload?.message || `${response.status} ${response.statusText}`);
    }

    if (!response.body) {
      throw new Error("Host SSE response has no body.");
    }

    return response;
  }

  return {
    health: () => requestJson("GET", "/api/health"),
    listModels: () => requestJson("GET", "/api/models"),
    listCollaborationModes: () => requestJson("GET", "/api/collaboration-modes"),
    listThreads: (options = {}) => {
      const searchParams = new URLSearchParams();
      for (const [key, value] of Object.entries(options)) {
        if (value === undefined || value === null || value === "") {
          continue;
        }
        searchParams.set(key, String(value));
      }
      return requestJson("GET", `/api/threads${searchParams.toString() ? `?${searchParams.toString()}` : ""}`);
    },
    readThread: (threadId, options = {}) =>
      requestJson("GET", `/api/threads/${encodeURIComponent(threadId)}?includeTurns=${options.includeTurns ? "true" : "false"}`),
    sendThreadMessage: (threadId, body) =>
      requestJson("POST", `/api/threads/${encodeURIComponent(threadId)}/messages`, body),
    chat: (body) => requestJson("POST", "/api/chat", body),
    subscribeThreadEvents: (threadId, options = {}) =>
      openEventStream(
        `/api/threads/${encodeURIComponent(threadId)}/events${options.includeTurns ? "?includeTurns=true" : ""}`,
        { signal: options.signal }
      ),
    subscribeGlobalThreadEvents: (options = {}) =>
      openEventStream("/api/thread-events", { signal: options.signal }),
    subscribeThreadRequests: (options = {}) =>
      openEventStream("/api/thread-requests", { signal: options.signal }),
    getConfig: (options = {}) => {
      const searchParams = new URLSearchParams();
      if (options.includeLayers === true) {
        searchParams.set("includeLayers", "true");
      }
      if (options.cwd) {
        searchParams.set("cwd", options.cwd);
      }
      return requestJson("GET", `/api/config${searchParams.toString() ? `?${searchParams.toString()}` : ""}`);
    },
    getConfigRequirements: () => requestJson("GET", "/api/config/requirements"),
    batchWriteConfig: (body) => requestJson("PUT", "/api/config", body)
  };
}

function tryParseJson(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}
