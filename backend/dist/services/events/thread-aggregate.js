"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.streamAggregatedThreadEvents = streamAggregatedThreadEvents;
const service_1 = require("../threads/service");
const KEEPALIVE_INTERVAL_MS = 15_000;
async function streamAggregatedThreadEvents({ request, reply, hostClient, workspaceId, selectedThreadId, limit = 100, }) {
    const rows = await (0, service_1.listThreadsForWorkspace)({
        hostClient,
        workspaceId,
        state: "active",
        limit,
    });
    const threadIds = dedupeThreadIds([
        ...rows.map((row) => row.threadId),
        selectedThreadId || null,
    ]);
    reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
    });
    if (typeof reply.raw.flushHeaders === "function") {
        reply.raw.flushHeaders();
    }
    let closed = false;
    const abortControllers = [];
    const teardown = () => {
        if (closed) {
            return;
        }
        closed = true;
        for (const controller of abortControllers) {
            controller.abort();
        }
        if (!reply.raw.writableEnded) {
            reply.raw.end();
        }
    };
    request.raw.on("close", teardown);
    request.raw.on("aborted", teardown);
    reply.raw.on("close", teardown);
    const keepAlive = setInterval(() => {
        if (!closed && !reply.raw.writableEnded) {
            reply.raw.write(": keep-alive\n\n");
        }
    }, KEEPALIVE_INTERVAL_MS);
    const sendEvent = (eventName, payload) => {
        if (closed || reply.raw.writableEnded) {
            return;
        }
        reply.raw.write(`event: ${eventName}\n`);
        reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`);
    };
    sendEvent("thread.feed.ready", {
        workspaceId: workspaceId || null,
        threadIds,
        mode: "fallback",
    });
    const tasks = threadIds.map(async (threadId) => {
        const controller = new AbortController();
        abortControllers.push(controller);
        try {
            const upstream = await hostClient.subscribeThreadEvents(threadId, {
                includeTurns: false,
                signal: controller.signal,
            });
            await pumpSse(upstream, (eventName, payload) => {
                sendEvent(eventName, payload);
            });
        }
        catch (error) {
            if (controller.signal.aborted || closed) {
                return;
            }
            sendEvent("thread.aggregate.error", {
                threadId,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    });
    try {
        await Promise.race([
            Promise.allSettled(tasks),
            waitForRequestClose(request.raw),
        ]);
    }
    finally {
        clearInterval(keepAlive);
        teardown();
    }
}
async function pumpSse(upstream, onEvent) {
    const reader = upstream.body?.getReader();
    if (!reader) {
        return;
    }
    const decoder = new TextDecoder();
    let buffer = "";
    let eventName = "message";
    let dataLines = [];
    const dispatch = () => {
        if (!dataLines.length) {
            eventName = "message";
            return;
        }
        const raw = dataLines.join("\n");
        dataLines = [];
        let payload = null;
        try {
            payload = JSON.parse(raw);
        }
        catch {
            payload = { raw };
        }
        onEvent(eventName, payload);
        eventName = "message";
    };
    while (true) {
        const { done, value } = await reader.read();
        if (done) {
            break;
        }
        buffer += decoder.decode(value, { stream: true });
        let newlineIndex = buffer.indexOf("\n");
        while (newlineIndex >= 0) {
            let line = buffer.slice(0, newlineIndex);
            buffer = buffer.slice(newlineIndex + 1);
            if (line.endsWith("\r")) {
                line = line.slice(0, -1);
            }
            if (!line) {
                dispatch();
            }
            else if (!line.startsWith(":")) {
                const separatorIndex = line.indexOf(":");
                const field = separatorIndex >= 0 ? line.slice(0, separatorIndex) : line;
                let valueText = separatorIndex >= 0 ? line.slice(separatorIndex + 1) : "";
                if (valueText.startsWith(" ")) {
                    valueText = valueText.slice(1);
                }
                if (field === "event") {
                    eventName = valueText || "message";
                }
                else if (field === "data") {
                    dataLines.push(valueText);
                }
            }
            newlineIndex = buffer.indexOf("\n");
        }
    }
    if (buffer.trim().length > 0 || dataLines.length > 0) {
        if (buffer.trim().length > 0) {
            dataLines.push(buffer.trim());
        }
        dispatch();
    }
    reader.releaseLock();
}
function dedupeThreadIds(values) {
    const seen = new Set();
    const result = [];
    for (const value of values) {
        const normalized = typeof value === "string" ? value.trim() : "";
        if (!normalized || seen.has(normalized)) {
            continue;
        }
        seen.add(normalized);
        result.push(normalized);
    }
    return result;
}
function waitForRequestClose(request) {
    return new Promise((resolve) => {
        request.once("close", () => resolve());
        request.once("aborted", () => resolve());
    });
}
