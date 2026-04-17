import { useCallback, useEffect, useRef, useState } from "react";

import { api } from "../api/client";
import type { ThreadDetail } from "../types";
import { applyThreadEvent, mergeThreadDetail, parseSsePayload } from "../utils/thread-events";

const THREAD_EVENT_NAMES = [
  "thread.snapshot",
  "thread.status",
  "turn.accepted",
  "turn.started",
  "turn.completed",
  "item.started",
  "item.completed",
  "item.delta",
  "thread.error",
  "thread.archived",
  "thread.unarchived",
] as const;

type ThreadDetailMap = Record<string, ThreadDetail | null>;

export function useThreadEvents(selectedThreadId: string | null): {
  hydrateThreadDetail: (threadId: string) => Promise<ThreadDetail | null>;
  threadDetails: ThreadDetailMap;
  selectedThreadDetail: ThreadDetail | null;
} {
  const [threadDetails, setThreadDetails] = useState<ThreadDetailMap>({});
  const eventSourceRef = useRef<EventSource | null>(null);
  const hydratedThreadIdsRef = useRef<Set<string>>(new Set());
  const pendingHydrationsRef = useRef<Map<string, Promise<ThreadDetail | null>>>(new Map());

  const updateThreadDetail = useCallback((
    threadId: string,
    updater: (current: ThreadDetail | null) => ThreadDetail | null,
  ) => {
    setThreadDetails((current) => {
      const previous = current[threadId] ?? null;
      const next = updater(previous);
      if (next === previous) {
        return current;
      }

      return {
        ...current,
        [threadId]: next,
      };
    });
  }, []);

  const hydrateThreadDetail = useCallback((threadId: string) => {
    const normalizedThreadId = typeof threadId === "string" ? threadId.trim() : "";
    if (!normalizedThreadId) {
      return Promise.resolve(null);
    }

    const pending = pendingHydrationsRef.current.get(normalizedThreadId);
    if (pending) {
      return pending;
    }

    const request = api.threadDetail(normalizedThreadId)
      .then((detail) => {
        hydratedThreadIdsRef.current.add(normalizedThreadId);
        updateThreadDetail(normalizedThreadId, (current) =>
          mergeThreadDetail(current, detail, { threadId: normalizedThreadId }),
        );
        return detail as ThreadDetail;
      })
      .catch(() => null)
      .finally(() => {
        pendingHydrationsRef.current.delete(normalizedThreadId);
      });

    pendingHydrationsRef.current.set(normalizedThreadId, request);
    return request;
  }, [updateThreadDetail]);

  useEffect(() => {
    if (!selectedThreadId || hydratedThreadIdsRef.current.has(selectedThreadId)) {
      return;
    }

    void hydrateThreadDetail(selectedThreadId);
  }, [hydrateThreadDetail, selectedThreadId]);

  useEffect(() => {
    const eventSource = new EventSource(api.aggregatedThreadEventsUrl());
    eventSourceRef.current = eventSource;

    const listeners = THREAD_EVENT_NAMES.map((eventName) => {
      const handler = (event: Event) => {
        const payload = parseSsePayload(event as MessageEvent<string>);
        if (!payload) {
          return;
        }

        const threadId = typeof payload?.threadId === "string" ? payload.threadId.trim() : "";
        if (!threadId) {
          return;
        }

        if (eventName === "thread.snapshot") {
          updateThreadDetail(threadId, (current) =>
            mergeThreadDetail(current, payload.thread || null, { threadId }),
          );
          return;
        }

        updateThreadDetail(threadId, (current) => applyThreadEvent(current, eventName, payload));
      };

      eventSource.addEventListener(eventName, handler);
      return { eventName, handler };
    });

    return () => {
      for (const listener of listeners) {
        eventSource.removeEventListener(listener.eventName, listener.handler);
      }
      eventSource.close();
      if (eventSourceRef.current === eventSource) {
        eventSourceRef.current = null;
      }
    };
  }, [updateThreadDetail]);

  useEffect(() => () => {
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
  }, []);

  return {
    hydrateThreadDetail,
    threadDetails,
    selectedThreadDetail: selectedThreadId ? threadDetails[selectedThreadId] || null : null,
  };
}
