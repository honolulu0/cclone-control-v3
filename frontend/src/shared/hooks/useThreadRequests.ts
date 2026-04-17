import { useEffect, useRef, useState } from "react";

import { api } from "../api/client";
import type { ThreadRequestRecord } from "../types";

type ThreadRequestMap = Record<string, ThreadRequestRecord>;

export function useThreadRequests() {
  const [requests, setRequests] = useState<ThreadRequestMap>({});
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const eventSource = new EventSource(api.threadRequestsUrl());
    eventSourceRef.current = eventSource;

    const handleSnapshot = (event: MessageEvent<string>) => {
      const payload = parseJson(event.data);
      const nextRequests = Array.isArray(payload?.requests) ? payload.requests as ThreadRequestRecord[] : [];
      setRequests(Object.fromEntries(nextRequests.map((request) => [request.id, request])));
    };

    const handleCreated = (event: MessageEvent<string>) => {
      const payload = parseJson(event.data) as ThreadRequestRecord | null;
      if (!payload?.id) {
        return;
      }
      setRequests((current) => ({
        ...current,
        [payload.id]: payload,
      }));
    };

    const handleResolved = (event: MessageEvent<string>) => {
      const payload = parseJson(event.data) as { requestId?: string | null } | null;
      const requestId = typeof payload?.requestId === "string" ? payload.requestId : null;
      if (!requestId) {
        return;
      }
      setRequests((current) => {
        if (!(requestId in current)) {
          return current;
        }
        const { [requestId]: _removed, ...rest } = current;
        return rest;
      });
    };

    eventSource.addEventListener("request.snapshot", handleSnapshot as EventListener);
    eventSource.addEventListener("request.created", handleCreated as EventListener);
    eventSource.addEventListener("request.resolved", handleResolved as EventListener);

    return () => {
      eventSource.removeEventListener("request.snapshot", handleSnapshot as EventListener);
      eventSource.removeEventListener("request.created", handleCreated as EventListener);
      eventSource.removeEventListener("request.resolved", handleResolved as EventListener);
      eventSource.close();
      if (eventSourceRef.current === eventSource) {
        eventSourceRef.current = null;
      }
    };
  }, []);

  return {
    requests,
  };
}

function parseJson(data: string | null | undefined): any {
  if (!data) {
    return null;
  }
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}
