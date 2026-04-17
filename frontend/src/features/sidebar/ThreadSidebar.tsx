import { SectionCard } from "../../shared/components/SectionCard";
import type { ThreadSummary, WorkspaceSummary } from "../../shared/types";
import { threadTimeLabel } from "../../shared/utils/time";

interface WorkspaceNode {
  workspace: WorkspaceSummary;
  isSelected: boolean;
  isExpanded: boolean;
  threads: ThreadSummary[];
}

export function ThreadSidebar({
  threadSearch,
  onThreadSearchChange,
  selectedWorkspace,
  workspaceTree,
  selectedThreadId,
  isRefreshing,
  onRefresh,
  onWorkspaceSelection,
  onWorkspaceExpansionToggle,
  onThreadSelection
}: {
  threadSearch: string;
  onThreadSearchChange: (value: string) => void;
  selectedWorkspace: WorkspaceSummary | null;
  workspaceTree: WorkspaceNode[];
  selectedThreadId: string | null;
  isRefreshing: boolean;
  onRefresh: () => void;
  onWorkspaceSelection: (workspaceId: string) => void;
  onWorkspaceExpansionToggle: (workspaceId: string) => void;
  onThreadSelection: (workspaceId: string, threadId: string) => void;
}) {
  return (
    <SectionCard eyebrow="线程导航" title="工作区 / 线程" cardClassName="sidebarCard sidebarTreeCard">
      <div className="sidebarTreeToolbar">
        <div className="sectionHeader">
          <div className="sidebarTreeHint">
            {selectedWorkspace ? `${selectedWorkspace.name} · ${selectedWorkspace.threadCount} 条线程` : `${workspaceTree.length} 个工作区`}
          </div>
          <button type="button" className="denseButton" onClick={onRefresh} disabled={isRefreshing}>
            {isRefreshing ? "刷新中…" : "刷新"}
          </button>
        </div>
        <input
          className="filterInput"
          value={threadSearch}
          onChange={(event) => onThreadSearchChange(event.target.value)}
          placeholder="筛选工作区 / 线程"
        />
      </div>
      <div className="scrollRegion sidebarTreeList">
        {workspaceTree.length ? workspaceTree.map(({ workspace, isSelected, isExpanded, threads }) => (
          <div key={workspace.id} className={`treeNode ${isSelected ? "is-selected" : ""}`}>
            <div className="treeWorkspaceShell">
              <button
                type="button"
                className={`treeDisclosure ${isExpanded ? "is-expanded" : ""}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onWorkspaceExpansionToggle(workspace.id);
                }}
                aria-label={isExpanded ? `折叠 ${workspace.name}` : `展开 ${workspace.name}`}
              >
                {isExpanded ? "▾" : "▸"}
              </button>
              <button type="button" className={`treeWorkspaceRow ${isSelected ? "is-selected" : ""}`} onClick={() => onWorkspaceSelection(workspace.id)}>
                <div className="treeWorkspaceTop">
                  <strong className="treeWorkspaceTitle">{workspace.name}</strong>
                  <span className="treeNodeMeta">{workspace.threadCount} 线程</span>
                </div>
                <div className="treeWorkspacePath">{workspace.cwd}</div>
              </button>
            </div>
            {isExpanded ? (
              <div className="treeChildren">
                {threads.length ? threads.map((thread) => (
                  <button type="button" key={thread.threadId} className={`treeThreadRow ${selectedThreadId === thread.threadId ? "is-selected" : ""}`} onClick={() => onThreadSelection(workspace.id, thread.threadId)}>
                    <span className="treeThreadMarker" aria-hidden="true" />
                    <div className="treeThreadBody">
                      <div className="treeThreadTop">
                        <strong>{thread.title}</strong>
                        {thread.runtimeStatus ? <span className={formatThreadStatusClassName(thread.runtimeStatus)}>{formatThreadStatusLabel(thread.runtimeStatus)}</span> : null}
                      </div>
                      <div className="treeThreadMetaRow">
                        <span className="treeThreadMeta">{threadTimeLabel(thread.updatedAt)}</span>
                      </div>
                      <div className="treeThreadPreview">{formatThreadPreview(thread.runtimeStatus, thread.preview)}</div>
                    </div>
                  </button>
                )) : <div className="treeEmptyRow mutedText">当前工作区还没有线程。</div>}
              </div>
            ) : null}
          </div>
        )) : <div className="emptyStateCard mutedText">没有匹配的工作区或线程。</div>}
      </div>
    </SectionCard>
  );
}

function formatThreadStatusLabel(value: string): string {
  switch (value.trim().toLowerCase()) {
    case "waitingonapproval":
      return "待批准";
    case "accepted":
      return "已接受";
    case "queued":
      return "排队中";
    case "pending":
    case "waiting":
      return "等待中";
    case "started":
    case "running":
    case "streaming":
      return "进行中";
    case "completed":
    case "complete":
    case "succeeded":
    case "success":
      return "已完成";
    case "failed":
    case "error":
    case "cancelled":
    case "canceled":
    case "interrupted":
      return "失败";
    default:
      return value.replace(/[_-]+/g, " ").trim();
  }
}

function formatThreadStatusClassName(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (["waitingonapproval"].includes(normalized)) {
    return "statusPill treeThreadStatus status-warning";
  }
  if (["running", "in progress", "in_progress", "streaming", "started"].includes(normalized)) {
    return "statusPill treeThreadStatus status-running";
  }
  if (["accepted", "queued", "pending", "waiting"].includes(normalized)) {
    return "statusPill treeThreadStatus status-warning";
  }
  if (["failed", "error", "cancelled", "canceled", "interrupted"].includes(normalized)) {
    return "statusPill treeThreadStatus status-error";
  }
  if (["completed", "complete", "succeeded", "success"].includes(normalized)) {
    return "statusPill treeThreadStatus status-complete";
  }
  return "statusPill treeThreadStatus";
}

function formatThreadPreview(runtimeStatus: string | null, preview: string): string {
  const normalizedPreview = preview.trim();
  const statusLabel = runtimeStatus ? formatThreadStatusLabel(runtimeStatus) : "";
  const normalizedStatus = runtimeStatus?.trim().toLowerCase() || "";

  if (["waitingonapproval"].includes(normalizedStatus)) {
    return normalizedPreview ? `${statusLabel} · ${normalizedPreview}` : "待批准 · 正在等待人工批准";
  }

  if (["accepted", "queued", "pending", "waiting"].includes(normalizedStatus)) {
    return normalizedPreview ? `${statusLabel} · ${normalizedPreview}` : "等待中 · 正在等待回复";
  }

  if (["started", "running", "streaming", "in progress", "in_progress"].includes(normalizedStatus)) {
    return normalizedPreview ? `${statusLabel} · ${normalizedPreview}` : "进行中 · 正在生成回复…";
  }

  if (["failed", "error", "cancelled", "canceled", "interrupted"].includes(normalizedStatus)) {
    return normalizedPreview ? `${statusLabel} · ${normalizedPreview}` : "失败 · 本轮回复已中断";
  }

  return normalizedPreview || "无预览";
}
