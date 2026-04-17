import { formatDetailedTimestamp } from "./time";
import type { TurnItem, TurnRecord } from "../types";

export interface TimelineEntry {
  key: string;
  turnId: string;
  turnLabel: string;
  turnMeta: string;
  turnStatus: string;
  itemId: string;
  roleLabel: string;
  tone: "user" | "assistant" | "neutral";
  isPlaceholder?: boolean;
  blocks: Array<{ type: "text" | "image"; text?: string; src?: string; alt?: string }>;
}

export function turnMessageLabel(turn: TurnRecord): string {
  return formatDetailedTimestamp(turn.createdAt || turn.updatedAt) || turn.turnId || turn.id || "turn";
}

export function turnRoundMeta(turn: TurnRecord): string {
  return formatDetailedTimestamp(turn.createdAt || turn.updatedAt);
}

export function turnItemLabel(type?: string): string {
  if (type === "userMessage") return "用户";
  if (type === "agentMessage") return "助手";
  return "消息";
}

export function turnMessageTone(type?: string): "user" | "assistant" | "neutral" {
  if (type === "userMessage") return "user";
  if (type === "agentMessage") return "assistant";
  return "neutral";
}

export function extractTurnItemBlocks(item: TurnItem): Array<{ type: "text" | "image"; text?: string; src?: string; alt?: string }> {
  return normalizeBlocks(item.content ?? item.text ?? null);
}

export function flattenTimeline(turns: TurnRecord[] | undefined): TimelineEntry[] {
  return (turns || [])
    .flatMap((turn, turnIndex) => {
      const resolvedTurnId = String(turn.turnId || turn.id || `turn-${turnIndex}`);
      const resolvedTurnLabel = turnMessageLabel(turn);
      const resolvedTurnMeta = turnRoundMeta(turn);
      const resolvedTurnStatus = normalizeTurnStatus(turn.status);
      const items: TimelineEntry[] = (turn.items || []).map((item, itemIndex) => {
        const blocks = extractTurnItemBlocks(item);
        return {
          key: `${resolvedTurnId}-${item.id || itemIndex}`,
          turnId: resolvedTurnId,
          turnLabel: resolvedTurnLabel,
          turnMeta: resolvedTurnMeta,
          turnStatus: resolvedTurnStatus,
          itemId: String(item.id || `${resolvedTurnId}-${itemIndex}`),
          roleLabel: turnItemLabel(item.type),
          tone: turnMessageTone(item.type),
          blocks
        } satisfies TimelineEntry;
      }).filter((entry) => entry.blocks.length > 0);

      if (shouldShowWaitingPlaceholder(turn, items)) {
        items.push({
          key: `${resolvedTurnId}-waiting`,
          turnId: resolvedTurnId,
          turnLabel: resolvedTurnLabel,
          turnMeta: resolvedTurnMeta,
          turnStatus: resolvedTurnStatus,
          itemId: `${resolvedTurnId}-waiting`,
          roleLabel: "助手",
          tone: "assistant",
          isPlaceholder: true,
          blocks: [{
            type: "text",
            text: waitingStatusMessage(resolvedTurnStatus)
          }]
        });
      }

      return items;
    })
    .filter((entry) => entry.blocks.length > 0);
}

function normalizeBlocks(value: unknown): Array<{ type: "text" | "image"; text?: string; src?: string; alt?: string }> {
  if (value == null) return [];
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    const text = String(value).trim();
    if (!text) return [];
    if (/^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(text)) {
      return [{ type: "image", src: text, alt: "线程图片" }];
    }
    return [{ type: "text", text }];
  }
  if (Array.isArray(value)) {
    return value.flatMap((entry) => normalizeBlocks(entry));
  }
  if (typeof value !== "object") return [];

  const record = value as Record<string, unknown>;
  const direct = [record.url, record.src, record.image, record.imageUrl, record.image_url]
    .find((entry) => typeof entry === "string" && entry.trim().length > 0) as string | undefined;
  if (direct) {
    return [{ type: "image", src: direct, alt: typeof record.type === "string" ? record.type : "线程图片" }];
  }
  if (typeof record.text === "string") {
    return [{ type: "text", text: record.text }];
  }
  return normalizeBlocks(record.content ?? record.message ?? record.input ?? null);
}

function shouldShowWaitingPlaceholder(turn: TurnRecord, items: TimelineEntry[]): boolean {
  const status = normalizeTurnStatus(turn.status);
  if (!isWaitingLikeStatus(status)) {
    return false;
  }

  return !items.some((entry) => entry.tone === "assistant");
}

function waitingStatusMessage(status: string): string {
  switch (status) {
    case "accepted":
      return "消息已接受，正在排队等待启动。";
    case "queued":
      return "消息正在队列中，等待开始处理。";
    case "pending":
      return "正在等待模型开始响应。";
    case "waiting":
      return "正在等待模型开始响应。";
    case "started":
    case "running":
    case "streaming":
      return "正在生成回复…";
    default:
      return "正在等待回复…";
  }
}

function isWaitingLikeStatus(status: string): boolean {
  return ["accepted", "queued", "pending", "waiting", "started", "running", "streaming"].includes(status);
}

function normalizeTurnStatus(value: unknown): string {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  if (value && typeof value === "object") {
    const type = (value as Record<string, unknown>).type;
    if (typeof type === "string" && type.trim()) {
      return type.trim();
    }
  }

  return "unknown";
}
