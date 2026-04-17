import type { ThreadDetail, TurnItem, TurnRecord } from "../types";

export function parseSsePayload(event: MessageEvent<string>): any {
  if (!event?.data) return null;
  try {
    return JSON.parse(event.data);
  } catch {
    return null;
  }
}

export function applyThreadEvent(threadDetail: ThreadDetail | null, eventName: string, payload: any): ThreadDetail | null {
  const nextDetail = ensureThreadDetail(threadDetail, payload?.threadId);
  if (!nextDetail) {
    return threadDetail;
  }

  const nextTurns = Array.isArray(nextDetail.turns) ? [...nextDetail.turns] : [];
  nextDetail.turns = nextTurns;

  switch (eventName) {
    case "thread.status":
      nextDetail.status = payload.status ?? nextDetail.status;
      return nextDetail;
    case "turn.accepted": {
      const turn = upsertTurn(nextTurns, payload.turnId, payload.turn);
      turn.status = normalizeEventStatus(payload.turn?.status) || normalizeEventStatus(turn.status) || "waiting";
      nextDetail.status = normalizeEventStatus(nextDetail.status) || turn.status;
      return nextDetail;
    }
    case "turn.started": {
      const turn = upsertTurn(nextTurns, payload.turnId, payload.turn);
      turn.status = normalizeEventStatus(payload.turn?.status) || normalizeEventStatus(turn.status) || "running";
      nextDetail.status = turn.status;
      return nextDetail;
    }
    case "turn.completed": {
      const turn = upsertTurn(nextTurns, payload.turnId, payload.turn);
      turn.status = normalizeEventStatus(payload.turn?.status) || normalizeEventStatus(turn.status) || "completed";
      if (payload.turn?.error !== undefined) turn.error = payload.turn.error;
      nextDetail.status = turn.status;
      return nextDetail;
    }
    case "item.started": {
      const turn = upsertTurn(nextTurns, payload.turnId, null);
      turn.status = normalizeEventStatus(turn.status) || "running";
      nextDetail.status = turn.status;
      upsertTurnItem(turn, payload.item);
      return nextDetail;
    }
    case "item.completed": {
      const turn = upsertTurn(nextTurns, payload.turnId, null);
      turn.status = normalizeEventStatus(turn.status) || "running";
      upsertTurnItem(turn, payload.item, { replace: true });
      return nextDetail;
    }
    case "item.delta": {
      const turn = upsertTurn(nextTurns, payload.turnId, null);
      turn.status = "running";
      nextDetail.status = turn.status;
      const item = upsertTurnItem(turn, { id: payload.itemId, type: "agentMessage", text: "" });
      item.text = `${String(item.text || "")}${String(payload.delta || "")}`;
      return nextDetail;
    }
    case "thread.error": {
      const turn = upsertTurn(nextTurns, payload.turnId, null);
      turn.error = payload.error ?? turn.error;
      turn.status = normalizeEventStatus(turn.status) || "failed";
      nextDetail.status = "failed";
      return nextDetail;
    }
    default:
      return nextDetail;
  }
}

export function mergeThreadDetail(
  current: ThreadDetail | null,
  incoming: unknown,
  options: { threadId?: string | null } = {},
): ThreadDetail | null {
  const nextIncoming = normalizeThreadDetail(incoming, options.threadId);
  if (!nextIncoming) {
    return current;
  }

  const nextDetail: ThreadDetail = {
    ...(current || {}),
    ...nextIncoming,
  };

  if (Array.isArray(nextIncoming.turns)) {
    nextDetail.turns = [...nextIncoming.turns];
  } else if (Array.isArray(current?.turns)) {
    nextDetail.turns = [...current.turns];
  }

  if (!nextDetail.threadId && options.threadId) {
    nextDetail.threadId = options.threadId;
  }
  if (!nextDetail.id && options.threadId) {
    nextDetail.id = options.threadId;
  }

  return nextDetail;
}

function upsertTurn(turns: TurnRecord[], turnId: string | null | undefined, patch: any): TurnRecord {
  const resolvedId = patch?.turnId || patch?.id || turnId || null;
  const index = turns.findIndex((turn) => (turn.turnId || turn.id) === resolvedId);
  if (index >= 0) {
    const nextTurn: TurnRecord = {
      ...turns[index],
      ...(patch || {}),
      items: Array.isArray(turns[index]?.items)
        ? [...(turns[index]?.items || [])]
        : Array.isArray(patch?.items)
          ? [...patch.items]
          : []
    };
    turns[index] = nextTurn;
    return nextTurn;
  }

  const created: TurnRecord = {
    id: resolvedId || undefined,
    ...(patch || {}),
    items: Array.isArray(patch?.items) ? [...patch.items] : []
  };
  turns.push(created);
  return created;
}

function upsertTurnItem(turn: TurnRecord, item: any, options: { replace?: boolean } = {}): TurnItem {
  const items = Array.isArray(turn.items) ? turn.items : [];
  turn.items = items;
  const index = items.findIndex((entry) => entry?.id === item?.id);
  if (index >= 0) {
    const nextItem = options.replace ? { ...item } : { ...items[index], ...(item || {}) };
    items[index] = nextItem;
    return nextItem;
  }
  const nextItem = { ...(item || {}) };
  items.push(nextItem);
  return nextItem;
}

function normalizeEventStatus(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }

  if (value && typeof value === "object") {
    const type = (value as Record<string, unknown>).type;
    if (typeof type === "string" && type.trim()) {
      return type.trim();
    }
  }

  return null;
}

function ensureThreadDetail(
  current: ThreadDetail | null,
  threadId: string | null | undefined,
): ThreadDetail | null {
  if (current) {
    return {
      ...current,
      turns: Array.isArray(current.turns) ? [...current.turns] : [],
    };
  }

  const normalizedThreadId = typeof threadId === "string" && threadId.trim() ? threadId.trim() : null;
  if (!normalizedThreadId) {
    return null;
  }

  return {
    id: normalizedThreadId,
    threadId: normalizedThreadId,
    turns: [],
  };
}

function normalizeThreadDetail(
  value: unknown,
  fallbackThreadId: string | null | undefined,
): ThreadDetail | null {
  if (!value || typeof value !== "object") {
    const normalizedThreadId = typeof fallbackThreadId === "string" && fallbackThreadId.trim()
      ? fallbackThreadId.trim()
      : null;
    if (!normalizedThreadId) {
      return null;
    }

    return {
      id: normalizedThreadId,
      threadId: normalizedThreadId,
    };
  }

  const detail = { ...(value as Record<string, unknown>) } as ThreadDetail;
  if (!detail.threadId && fallbackThreadId) {
    detail.threadId = fallbackThreadId;
  }
  if (!detail.id && fallbackThreadId) {
    detail.id = fallbackThreadId;
  }
  return detail;
}
