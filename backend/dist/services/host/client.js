"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createHostClient = createHostClient;
function createHostClient(baseUrl, token) {
    const normalizedBaseUrl = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
    async function requestJson(method, pathname, body) {
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
    async function openEventStream(pathname, options = {}) {
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
        readThread: (threadId, options = {}) => requestJson("GET", `/api/threads/${encodeURIComponent(threadId)}?includeTurns=${options.includeTurns ? "true" : "false"}`),
        sendThreadMessage: (threadId, body) => requestJson("POST", `/api/threads/${encodeURIComponent(threadId)}/messages`, body),
        chat: (body) => requestJson("POST", "/api/chat", body),
        subscribeThreadEvents: (threadId, options = {}) => openEventStream(`/api/threads/${encodeURIComponent(threadId)}/events${options.includeTurns ? "?includeTurns=true" : ""}`, { signal: options.signal }),
        subscribeGlobalThreadEvents: (options = {}) => openEventStream("/api/thread-events", { signal: options.signal }),
        subscribeThreadRequests: (options = {}) => openEventStream("/api/thread-requests", { signal: options.signal }),
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
function tryParseJson(text) {
    try {
        return JSON.parse(text);
    }
    catch {
        return { raw: text };
    }
}
