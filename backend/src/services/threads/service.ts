import type { HostClient, HostThreadSummary } from "../host/client";
import { compareTimestampDesc, filterThreadsForWorkspace } from "../workspaces/service";

export interface ThreadSummary {
  id: string;
  threadId: string;
  title: string;
  preview: string;
  cwd: string | null;
  updatedAt: string | number | null;
  createdAt: string | number | null;
  state: "active" | "archived";
  runtimeStatus: string | null;
}

export async function listThreadsForWorkspace({
  hostClient,
  workspaceId,
  state,
  search,
  limit
}: {
  hostClient: HostClient;
  workspaceId?: string;
  state: "active" | "archived";
  search?: string;
  limit?: number;
}): Promise<ThreadSummary[]> {
  const result = await hostClient.listThreads({
    limit: limit || 100,
    archived: state === "archived",
    sortKey: "updated_at",
    search
  });

  const rows = workspaceId
    ? filterThreadsForWorkspace(result.data || [], workspaceId)
    : result.data || [];

  return rows.map((thread) => mapThreadSummary(thread, state))
    .sort((left, right) => compareTimestampDesc(left.updatedAt, right.updatedAt));
}

export async function readThreadDetail(hostClient: HostClient, threadId: string): Promise<any> {
  return hostClient.readThread(threadId, { includeTurns: true });
}

function mapThreadSummary(thread: HostThreadSummary, state: "active" | "archived"): ThreadSummary {
  return {
    id: thread.id,
    threadId: thread.id,
    title: normalizeOptionalString(thread.name) || normalizeOptionalString(thread.preview) || thread.id,
    preview: normalizeOptionalString(thread.preview) || "",
    cwd: normalizeOptionalString(thread.cwd),
    updatedAt: thread.updatedAt || thread.createdAt || null,
    createdAt: thread.createdAt || null,
    state,
    runtimeStatus: normalizeRuntimeStatus(thread.status)
  };
}

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeRuntimeStatus(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (value && typeof value === "object") {
    const rawActiveFlags = (value as Record<string, unknown>).activeFlags;
    const activeFlags = Array.isArray(rawActiveFlags)
      ? rawActiveFlags.filter((flag): flag is string => typeof flag === "string")
      : [];
    if (activeFlags.includes("waitingOnApproval")) {
      return "waitingOnApproval";
    }

    const nestedType = (value as Record<string, unknown>).type;
    if (typeof nestedType === "string" && nestedType.trim()) {
      return nestedType.trim();
    }
  }

  return null;
}
