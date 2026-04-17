import { useEffect, useMemo, useState } from "react";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import { ThreadSidebar } from "../sidebar/ThreadSidebar";
import { ComposerPanel } from "./ComposerPanel";
import { CurrentThreadPanel } from "../threads/CurrentThreadPanel";
import { PromptTemplatePanel } from "../templates/PromptTemplatePanel";
import { SectionCard } from "../../shared/components/SectionCard";
import { api } from "../../shared/api/client";
import { useAttachmentUploads } from "../../shared/hooks/useAttachmentUploads";
import { useComposerState } from "../../shared/hooks/useComposerState";
import { usePromptTemplates } from "../../shared/hooks/usePromptTemplates";
import { useThreadEvents } from "../../shared/hooks/useThreadEvents";
import { useThreadRequests } from "../../shared/hooks/useThreadRequests";
import { useThreadSelection } from "../../shared/hooks/useThreadSelection";
import { mapAttachmentsForSend } from "../../shared/utils/attachments";
import { parseTimestamp } from "../../shared/utils/time";
import type { ThreadDetail, ThreadRequestRecord, ThreadSummary } from "../../shared/types";

export function WorkbenchPage() {
  const queryClient = useQueryClient();
  const [threadSearch, setThreadSearch] = useState("");
  const [isSending, setIsSending] = useState(false);

  const workspacesQuery = useQuery({
    queryKey: ["workspaces"],
    queryFn: async () => (await api.workspaces()).data
  });
  const profilesQuery = useQuery({
    queryKey: ["profiles"],
    queryFn: async () => (await api.profiles()).data
  });
  const { templatesQuery } = usePromptTemplates();

  const workspaces = workspacesQuery.data || [];
  const {
    expandedWorkspaceIds,
    orderedWorkspaces,
    selectedThreadId,
    selectedWorkspace,
    selectedWorkspaceId,
    setExpandedWorkspaceIds,
    setSelectedThreadId,
    setSelectedWorkspaceId
  } = useThreadSelection(workspaces, []);

  useEffect(() => {
    const firstWorkspace = orderedWorkspaces[0];
    if (!selectedWorkspaceId && firstWorkspace) {
      setSelectedWorkspaceId(firstWorkspace.id);
      setExpandedWorkspaceIds([firstWorkspace.id]);
    }
  }, [orderedWorkspaces, selectedWorkspaceId, setExpandedWorkspaceIds, setSelectedWorkspaceId]);

  const threadsQuery = useQuery({
    queryKey: ["threads", selectedWorkspaceId, threadSearch],
    queryFn: async () => (await api.threads({ workspaceId: selectedWorkspaceId || undefined, state: "active", search: threadSearch || undefined })).data,
    enabled: Boolean(selectedWorkspaceId)
  });
  const threads = threadsQuery.data || [];

  useEffect(() => {
    const firstThread = threads[0];
    if (!selectedThreadId && firstThread) {
      setSelectedThreadId(firstThread.threadId);
    }
  }, [selectedThreadId, setSelectedThreadId, threads]);

  const workspaceTree = useMemo(() => orderedWorkspaces.map((workspace) => ({
    workspace,
    isSelected: workspace.id === selectedWorkspaceId,
    isExpanded: expandedWorkspaceIds.includes(workspace.id),
    threads: workspace.id === selectedWorkspaceId ? threads : []
  })), [expandedWorkspaceIds, orderedWorkspaces, selectedWorkspaceId, threads]);

  const selectedThread = threads.find((thread) => thread.threadId === selectedThreadId) || null;
  const { hydrateThreadDetail, threadDetails, selectedThreadDetail } = useThreadEvents(selectedThreadId);
  const { requests } = useThreadRequests();
  const selectedThreadRequests = useMemo(
    () => Object.values(requests)
      .filter((request) => request.threadId === selectedThreadId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    [requests, selectedThreadId]
  );

  const {
    attachments,
    isDragActive,
    isUploading,
    clearAttachments,
    handleDragLeave,
    handleDragOver,
    handleDrop,
    handlePaste,
    removeAttachment
  } = useAttachmentUploads();
  const {
    composeCwdOverride,
    composeMessage,
    planMode,
    selectedProfileId,
    sendTargetMode,
    setComposeCwdOverride,
    setComposeMessage,
    setPlanMode,
    setSelectedProfileId,
    setSendTargetMode
  } = useComposerState();
  const canSend = Boolean(composeMessage.trim() || attachments.length > 0);
  const messageCount = (selectedThreadDetail?.turns || []).reduce((total, turn) => total + (turn.items || []).length, 0);

  useEffect(() => {
    if (!selectedWorkspaceId || !selectedWorkspace?.cwd) {
      return;
    }

    for (const [threadId, detail] of Object.entries(threadDetails)) {
      if (!detail) {
        continue;
      }

      const detailCwd = normalizeText(detail.cwd);
      if (!detailCwd || !isThreadWithinWorkspace(detailCwd, selectedWorkspace.cwd)) {
        continue;
      }

      const thread = threads.find((entry) => entry.threadId === threadId) || null;
      const nextSummary = buildThreadSummary({
        threadId,
        detail,
        fallbackTitle: thread?.title || null,
        fallbackPreview: thread?.preview || null,
        fallbackCwd: thread?.cwd || selectedWorkspace.cwd,
        fallbackStatus: thread?.runtimeStatus || null,
        fallbackUpdatedAt: thread?.updatedAt,
        fallbackCreatedAt: thread?.createdAt
      });

      upsertThreadInWorkspaceCaches(queryClient, selectedWorkspaceId, nextSummary);
    }
  }, [queryClient, selectedWorkspace, selectedWorkspaceId, threadDetails, threads]);

  async function handleSend(messageOverride?: string | null) {
    const draftMessage = messageOverride ?? composeMessage;
    const fallbackCwd = sendTargetMode === "new"
      ? (composeCwdOverride || selectedWorkspace?.cwd || selectedThread?.cwd || null)
      : (selectedThread?.cwd || selectedWorkspace?.cwd || null);
    setIsSending(true);
    try {
      const response = await api.sendMessage({
        workspaceId: selectedWorkspace?.id || null,
        threadId: sendTargetMode === "selected" ? selectedThreadId : null,
        cwdOverride: sendTargetMode === "new" ? fallbackCwd : null,
        message: draftMessage,
        attachments: mapAttachmentsForSend(attachments),
        profileId: selectedProfileId,
        planMode
      });
      if (response?.threadId) {
        setSelectedThreadId(response.threadId);
        setSendTargetMode("selected");
        const detail = await hydrateThreadDetail(response.threadId);
        if (selectedWorkspace?.id) {
          const hydratedSummary = buildThreadSummary({
            threadId: response.threadId,
            detail,
            fallbackTitle: selectedThread?.title || draftMessage,
            fallbackPreview: draftMessage,
            fallbackCwd,
            fallbackStatus: normalizeRuntimeStatus(response?.status),
            fallbackUpdatedAt: Date.now(),
            fallbackCreatedAt: Date.now()
          });
          upsertThreadInWorkspaceCaches(queryClient, selectedWorkspace.id, hydratedSummary);
        }
      }
      setComposeMessage("");
      setComposeCwdOverride("");
      clearAttachments();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["threads"] }),
        queryClient.invalidateQueries({ queryKey: ["history"] }),
        queryClient.invalidateQueries({ queryKey: ["workspaces"] })
      ]);
    } finally {
      setIsSending(false);
    }
  }

  async function handleRefreshNavigation() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["workspaces"] }),
      queryClient.invalidateQueries({ queryKey: ["threads"] })
    ]);
  }

  function handleComposeKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      if (!isSending && !isUploading) {
        void handleSend();
      }
    }
  }

  return (
    <div className="pageGrid">
      <aside className="pagePane pagePane-left">
        <ThreadSidebar
          threadSearch={threadSearch}
          onThreadSearchChange={setThreadSearch}
          selectedWorkspace={selectedWorkspace}
          workspaceTree={workspaceTree}
          selectedThreadId={selectedThreadId}
          isRefreshing={workspacesQuery.isFetching || threadsQuery.isFetching}
          onRefresh={() => void handleRefreshNavigation()}
          onWorkspaceSelection={(workspaceId) => {
            setSelectedWorkspaceId(workspaceId);
            setExpandedWorkspaceIds([workspaceId]);
            setSendTargetMode("new");
          }}
          onWorkspaceExpansionToggle={(workspaceId) => setExpandedWorkspaceIds((current) => current.includes(workspaceId) ? [] : [workspaceId])}
          onThreadSelection={(workspaceId, threadId) => {
            setSelectedWorkspaceId(workspaceId);
            setExpandedWorkspaceIds([workspaceId]);
            setSelectedThreadId(threadId);
            setSendTargetMode("selected");
          }}
        />
      </aside>
      <main className="pagePane pagePane-main">
        <SectionCard eyebrow="工作台上下文" title={selectedWorkspace?.name || "未选择工作区"}>
          <div className="workbenchSummaryBar">
            <span className="runtimeChip">{sendTargetMode === "selected" ? "发送到选中线程" : "新建线程"}</span>
            <span className="runtimeChip">{attachments.length} 附件</span>
            <span className="runtimeChip">{messageCount} 消息块</span>
          </div>
        </SectionCard>
        <ComposerPanel
          sendTargetMode={sendTargetMode}
          onSendTargetModeChange={setSendTargetMode}
          selectedProfileId={selectedProfileId}
          profiles={profilesQuery.data || []}
          onSelectProfile={setSelectedProfileId}
          planMode={planMode}
          onTogglePlanMode={() => setPlanMode((current) => !current)}
          composeMessage={composeMessage}
          onComposeMessageChange={setComposeMessage}
          onComposeKeyDown={handleComposeKeyDown}
          onComposePaste={handlePaste}
          isComposeDragActive={isDragActive}
          onComposeDragOver={handleDragOver}
          onComposeDragLeave={handleDragLeave}
          onComposeDrop={handleDrop}
          isUploading={isUploading}
          isSending={isSending}
          composeAttachments={attachments}
          onRemoveAttachment={removeAttachment}
          composeCwdOverride={composeCwdOverride}
          onComposeCwdOverrideChange={setComposeCwdOverride}
          selectedThread={selectedThread}
          selectedWorkspace={selectedWorkspace}
          canSend={canSend}
          onSend={() => void handleSend()}
        />
        <CurrentThreadPanel
          title={selectedThread?.title || "没有选中线程"}
          turns={selectedThreadDetail?.turns}
          isLoading={Boolean(selectedThreadId) && !Array.isArray(selectedThreadDetail?.turns)}
        />
      </main>
      <aside className="pagePane pagePane-right">
        <PromptTemplatePanel
          templates={templatesQuery.data || []}
          isBusy={isSending || isUploading}
          onAttach={(template) => setComposeMessage((current) => current.trim() ? `${current}\n\n${template.content}` : template.content)}
          onSend={(template) => void handleSend(template.content)}
        />
        <SectionCard eyebrow="检查器" title="上下文检查器">
          <div className="metaGrid">
            <span>工作区</span><strong>{selectedWorkspace?.name || "未选择"}</strong>
            <span>cwd</span><strong>{selectedWorkspace?.cwd || "—"}</strong>
            <span>线程</span><strong>{selectedThread?.threadId || "未选择"}</strong>
            <span>状态</span><strong>{formatThreadStatus(selectedThreadDetail?.status)}</strong>
            <span>待处理请求</span><strong>{selectedThreadRequests.length}</strong>
          </div>
        </SectionCard>
        <SectionCard eyebrow="请求" title="待处理请求">
          <div className="scrollRegion listStack">
            {selectedThreadRequests.length
              ? selectedThreadRequests.map((request) => (
                  <div key={request.id} className="historyRow">
                    <strong>{formatThreadRequestTitle(request)}</strong>
                    <div className="listRowMeta">{request.method}</div>
                    <div className="listRowBody">{formatThreadRequestBody(request)}</div>
                  </div>
                ))
              : <div className="emptyStateCard mutedText">当前线程没有待处理请求。</div>}
          </div>
        </SectionCard>
      </aside>
    </div>
  );
}

function formatThreadStatus(value: unknown): string {
  const normalized = normalizeRuntimeStatus(value);
  switch ((normalized || "").trim().toLowerCase()) {
    case "waitingonapproval":
      return "等待批准";
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
    case "active":
      return "活动中";
    case "idle":
      return "空闲";
    default:
      return normalized || "—";
  }
}

function formatThreadRequestTitle(request: ThreadRequestRecord): string {
  switch (request.kind) {
    case "commandApproval":
      return "命令审批";
    case "fileApproval":
      return "文件变更审批";
    case "userInput":
      return "用户输入请求";
    case "mcpElicitation":
      return "MCP 交互请求";
    default:
      return "待处理请求";
  }
}

function formatThreadRequestBody(request: ThreadRequestRecord): string {
  const params = request.params || {};

  if (request.kind === "commandApproval") {
    const command = typeof params.command === "string" ? params.command : null;
    const reason = typeof params.reason === "string" ? params.reason : null;
    return [command, reason].filter(Boolean).join("\n") || "等待命令审批";
  }

  if (request.kind === "fileApproval") {
    const grantRoot = typeof params.grantRoot === "string" ? params.grantRoot : null;
    const itemId = typeof params.itemId === "string" ? params.itemId : null;
    return [grantRoot, itemId].filter(Boolean).join("\n") || "等待文件变更审批";
  }

  if (request.kind === "userInput") {
    const questions = Array.isArray(params.questions) ? params.questions : [];
    const firstQuestion = questions.find((question) => question && typeof question === "object");
    const text = typeof firstQuestion?.question === "string" ? firstQuestion.question : null;
    return text || "等待用户输入";
  }

  if (request.kind === "mcpElicitation") {
    return JSON.stringify(params);
  }

  return JSON.stringify(params);
}

function upsertThreadInWorkspaceCaches(
  queryClient: ReturnType<typeof useQueryClient>,
  workspaceId: string,
  nextThread: ThreadSummary
) {
  for (const [queryKey, current] of queryClient.getQueriesData<ThreadSummary[]>({ queryKey: ["threads"] })) {
    if (!Array.isArray(queryKey) || queryKey[0] !== "threads") {
      continue;
    }

    const cacheWorkspaceId = typeof queryKey[1] === "string" ? queryKey[1] : null;
    if (cacheWorkspaceId !== workspaceId) {
      continue;
    }

    const search = typeof queryKey[2] === "string" ? queryKey[2].trim().toLowerCase() : "";
    const currentList = Array.isArray(current) ? current : [];
    const existing = currentList.find((entry) => entry.threadId === nextThread.threadId) || null;
    const matchesSearch = !search || matchesThreadSearch(nextThread, search);
    if (!matchesSearch && !existing) {
      continue;
    }

    const nextList = upsertThreadSummary(currentList, nextThread);
    if (nextList !== currentList) {
      queryClient.setQueryData<ThreadSummary[]>(queryKey, nextList);
    }
  }
}

function upsertThreadSummary(current: ThreadSummary[], nextThread: ThreadSummary): ThreadSummary[] {
  const index = current.findIndex((entry) => entry.threadId === nextThread.threadId);
  const existing = index >= 0 ? current[index] : null;
  if (existing && isSameThreadSummary(existing, nextThread)) {
    return current;
  }

  const nextList = [...current];
  if (index >= 0) {
    nextList[index] = {
      ...nextList[index],
      ...nextThread
    };
  } else {
    nextList.unshift(nextThread);
  }

  return nextList.sort((left, right) => {
    const rightTime = parseTimestamp(right.updatedAt || right.createdAt)?.getTime() || 0;
    const leftTime = parseTimestamp(left.updatedAt || left.createdAt)?.getTime() || 0;
    return rightTime - leftTime;
  });
}

function matchesThreadSearch(thread: ThreadSummary, search: string): boolean {
  const haystack = [thread.title, thread.preview, thread.cwd || "", thread.threadId]
    .join("\n")
    .toLowerCase();
  return haystack.includes(search);
}

function buildThreadSummary({
  threadId,
  detail,
  fallbackTitle,
  fallbackPreview,
  fallbackCwd,
  fallbackStatus,
  fallbackUpdatedAt,
  fallbackCreatedAt
}: {
  threadId: string;
  detail: ThreadDetail | null;
  fallbackTitle?: string | null;
  fallbackPreview?: string | null;
  fallbackCwd?: string | null;
  fallbackStatus?: string | null;
  fallbackUpdatedAt?: string | number | null;
  fallbackCreatedAt?: string | number | null;
}): ThreadSummary {
  const runtimeStatus = normalizeRuntimeStatus(detail?.status) || readLatestTurnStatus(detail) || normalizeRuntimeStatus(fallbackStatus);
  const preview = resolveThreadPreviewText(runtimeStatus, summarizeThreadPreview(detail) || normalizeText(fallbackPreview) || "");
  const title = normalizeText(readThreadName(detail)) || normalizeText(fallbackTitle) || preview || threadId;
  const latestTurnTime = readLatestTurnTimestamp(detail);

  return {
    id: threadId,
    threadId,
    title,
    preview,
    cwd: normalizeText(detail?.cwd) || normalizeText(fallbackCwd) || null,
    updatedAt: detail?.updatedAt || latestTurnTime || fallbackUpdatedAt || fallbackCreatedAt || null,
    createdAt: detail?.createdAt || latestTurnTime || fallbackCreatedAt || fallbackUpdatedAt || null,
    state: "active",
    runtimeStatus
  };
}

function readThreadName(detail: ThreadDetail | null): string | null {
  if (!detail || typeof detail !== "object") {
    return null;
  }

  const candidates = [
    (detail as Record<string, unknown>).name,
    (detail as Record<string, unknown>).title,
    (detail as Record<string, unknown>).preview
  ];

  for (const candidate of candidates) {
    const normalized = normalizeText(candidate);
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

function summarizeThreadPreview(detail: ThreadDetail | null): string | null {
  const turns = Array.isArray(detail?.turns) ? detail.turns : [];
  for (let turnIndex = turns.length - 1; turnIndex >= 0; turnIndex -= 1) {
    const turn = turns[turnIndex];
    const items = Array.isArray(turn?.items) ? turn.items : [];
    for (let itemIndex = items.length - 1; itemIndex >= 0; itemIndex -= 1) {
      const text = extractTextPreview(items[itemIndex]);
      if (text) {
        return text;
      }
    }
  }
  return null;
}

function extractTextPreview(item: Record<string, unknown> | undefined): string | null {
  if (!item) {
    return null;
  }

  const direct = normalizeText(item.text);
  if (direct) {
    return direct;
  }

  const content = item.content;
  if (!Array.isArray(content)) {
    return null;
  }

  for (const block of content) {
    if (!block || typeof block !== "object") {
      continue;
    }
    const maybeText = normalizeText((block as Record<string, unknown>).text);
    if (maybeText) {
      return maybeText;
    }
  }

  return null;
}

function readLatestTurnStatus(detail: ThreadDetail | null): string | null {
  const turns = Array.isArray(detail?.turns) ? detail.turns : [];
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const status = normalizeRuntimeStatus(turns[index]?.status);
    if (status) {
      return status;
    }
  }
  return null;
}

function readLatestTurnTimestamp(detail: ThreadDetail | null): string | number | null {
  const turns = Array.isArray(detail?.turns) ? detail.turns : [];
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const turn = turns[index];
    if (turn?.updatedAt != null) {
      return turn.updatedAt;
    }
    if (turn?.createdAt != null) {
      return turn.createdAt;
    }
  }
  return null;
}

function normalizeText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function isThreadWithinWorkspace(threadCwd: string, workspaceCwd: string): boolean {
  const normalizedThreadCwd = threadCwd.replaceAll("\\", "/").toLowerCase();
  const normalizedWorkspaceCwd = workspaceCwd.replaceAll("\\", "/").toLowerCase();
  return normalizedThreadCwd.startsWith(normalizedWorkspaceCwd);
}

function normalizeRuntimeStatus(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
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

function resolveThreadPreviewText(runtimeStatus: string | null, preview: string): string {
  const normalizedPreview = preview.trim();
  const normalizedStatus = runtimeStatus?.trim().toLowerCase() || "";

  if (normalizedPreview) {
    return normalizedPreview;
  }

  if (["waitingonapproval"].includes(normalizedStatus)) {
    return "等待批准";
  }

  if (["accepted", "queued", "pending", "waiting"].includes(normalizedStatus)) {
    return "正在等待回复";
  }

  if (["started", "running", "streaming", "in progress", "in_progress"].includes(normalizedStatus)) {
    return "正在生成回复…";
  }

  if (["failed", "error", "cancelled", "canceled", "interrupted"].includes(normalizedStatus)) {
    return "本轮回复已中断";
  }

  return "";
}

function isSameThreadSummary(current: ThreadSummary, nextThread: ThreadSummary): boolean {
  return current.id === nextThread.id
    && current.threadId === nextThread.threadId
    && current.title === nextThread.title
    && current.preview === nextThread.preview
    && current.cwd === nextThread.cwd
    && current.updatedAt === nextThread.updatedAt
    && current.createdAt === nextThread.createdAt
    && current.state === nextThread.state
    && current.runtimeStatus === nextThread.runtimeStatus;
}
