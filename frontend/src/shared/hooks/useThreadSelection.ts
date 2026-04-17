import { useMemo, useState } from "react";

import type { ThreadSummary, WorkspaceSummary } from "../types";
import { parseTimestamp } from "../utils/time";

export function useThreadSelection(workspaces: WorkspaceSummary[], threads: ThreadSummary[]) {
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [expandedWorkspaceIds, setExpandedWorkspaceIds] = useState<string[]>([]);

  const latestWorkspaceActivity = useMemo(() => {
    const activity = new Map<string, number>();
    for (const workspace of workspaces) {
      activity.set(workspace.id, parseTimestamp(workspace.updatedAt)?.getTime() || 0);
    }
    for (const thread of threads) {
      if (!thread.cwd) continue;
      const threadTime = parseTimestamp(thread.updatedAt || thread.createdAt)?.getTime() || 0;
      for (const workspace of workspaces) {
        if (thread.cwd.startsWith(workspace.cwd)) {
          activity.set(workspace.id, Math.max(activity.get(workspace.id) || 0, threadTime));
        }
      }
    }
    return activity;
  }, [threads, workspaces]);

  const orderedWorkspaces = useMemo(
    () => [...workspaces].sort((left, right) => (latestWorkspaceActivity.get(right.id) || 0) - (latestWorkspaceActivity.get(left.id) || 0)),
    [latestWorkspaceActivity, workspaces]
  );

  const selectedWorkspace = orderedWorkspaces.find((workspace) => workspace.id === selectedWorkspaceId) || null;

  return {
    expandedWorkspaceIds,
    orderedWorkspaces,
    selectedThreadId,
    selectedWorkspace,
    selectedWorkspaceId,
    setExpandedWorkspaceIds,
    setSelectedThreadId,
    setSelectedWorkspaceId
  };
}
