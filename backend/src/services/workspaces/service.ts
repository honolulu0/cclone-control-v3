import type { HostClient, HostThreadSummary } from "../host/client";

export interface WorkspaceSummary {
  id: string;
  name: string;
  cwd: string;
  updatedAt: string | number | null;
  threadCount: number;
}

export async function listWorkspaces(hostClient: HostClient): Promise<WorkspaceSummary[]> {
  const result = await hostClient.listThreads({
    limit: 200,
    archived: false,
    sortKey: "updated_at"
  });

  const grouped = new Map<string, WorkspaceSummary>();
  for (const thread of result.data || []) {
    const cwd = normalizeOptionalString(thread.cwd);
    if (!cwd) {
      continue;
    }

    const existing = grouped.get(cwd);
    const updatedAt = thread.updatedAt || thread.createdAt || null;
    if (!existing) {
      grouped.set(cwd, {
        id: cwd,
        name: lastSegment(cwd) || "workspace",
        cwd,
        updatedAt,
        threadCount: 1
      });
      continue;
    }

    existing.threadCount += 1;
    if (compareTimestampDesc(updatedAt, existing.updatedAt) < 0) {
      existing.updatedAt = updatedAt;
    }
  }

  return [...grouped.values()].sort((left, right) => compareTimestampDesc(left.updatedAt, right.updatedAt));
}

export function filterThreadsForWorkspace(threads: HostThreadSummary[], workspaceId: string): HostThreadSummary[] {
  const normalizedWorkspace = normalizePath(workspaceId);
  return threads.filter((thread) => {
    const cwd = normalizeOptionalString(thread.cwd);
    return cwd ? normalizePath(cwd).startsWith(normalizedWorkspace) : false;
  });
}

export function compareTimestampDesc(left: string | number | null | undefined, right: string | number | null | undefined): number {
  return parseTimestamp(right) - parseTimestamp(left);
}

export function parseTimestamp(value: string | number | null | undefined): number {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric > 10_000_000_000 ? numeric : numeric * 1000;
  }

  const parsed = value ? new Date(value).getTime() : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

function lastSegment(value: string): string {
  const normalized = value.replace(/[\\/]+$/, "");
  const parts = normalized.split(/[\\/]/);
  return parts[parts.length - 1] || normalized;
}

function normalizePath(value: string): string {
  return value.replaceAll("\\", "/").toLowerCase();
}

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
