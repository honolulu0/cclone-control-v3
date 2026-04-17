import fs from "node:fs";
import { once } from "node:events";

import type { FastifyReply, FastifyRequest } from "fastify";

export async function proxySseResponse({
  request,
  reply,
  upstream,
  logPath,
  streamName,
}: {
  request: FastifyRequest;
  reply: FastifyReply;
  upstream: Response;
  logPath?: string;
  streamName?: string;
}): Promise<void> {
  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no"
  });

  if (typeof reply.raw.flushHeaders === "function") {
    reply.raw.flushHeaders();
  }

  writeSseLog(logPath, {
    kind: "connection.open",
    streamName: streamName || "unknown",
    url: request.url,
    method: request.method
  });

  const reader = upstream.body?.getReader();
  if (!reader) {
    writeSseLog(logPath, {
      kind: "connection.error",
      streamName: streamName || "unknown",
      url: request.url,
      error: "SSE upstream has no body"
    });
    if (!reply.raw.writableEnded) {
      reply.raw.end();
    }
    return;
  }

  let replyClosed = false;
  reply.raw.on("close", () => {
    replyClosed = true;
  });
  reply.raw.on("error", () => {
    replyClosed = true;
  });

  let buffer = "";
  let currentEventName = "message";
  let currentDataLines: string[] = [];
  const decoder = new TextDecoder();

  const flushEvent = () => {
    if (!currentDataLines.length) {
      currentEventName = "message";
      return;
    }

    const rawData = currentDataLines.join("\n");
    currentDataLines = [];

    let payload: unknown = rawData;
    try {
      payload = JSON.parse(rawData);
    } catch {
      // Keep raw string for non-JSON SSE payloads.
    }

    writeSseLog(logPath, {
      kind: "event",
      streamName: streamName || "unknown",
      url: request.url,
      event: currentEventName,
      payload
    });
    currentEventName = "message";
  };

  const processText = (text: string) => {
    buffer += text;

    let newlineIndex = buffer.indexOf("\n");
    while (newlineIndex >= 0) {
      let line = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 1);

      if (line.endsWith("\r")) {
        line = line.slice(0, -1);
      }

      if (line.length === 0) {
        flushEvent();
      } else if (!line.startsWith(":")) {
        const separatorIndex = line.indexOf(":");
        const field = separatorIndex >= 0 ? line.slice(0, separatorIndex) : line;
        let value = separatorIndex >= 0 ? line.slice(separatorIndex + 1) : "";
        if (value.startsWith(" ")) {
          value = value.slice(1);
        }

        if (field === "event") {
          currentEventName = value || "message";
        } else if (field === "data") {
          currentDataLines.push(value);
        }
      }

      newlineIndex = buffer.indexOf("\n");
    }
  };

  let terminalError: unknown = null;

  try {
    while (!replyClosed) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      if (value && value.byteLength > 0) {
        try {
          if (!reply.raw.write(Buffer.from(value))) {
            await once(reply.raw, "drain");
          }
        } catch (error) {
          terminalError = error;
          replyClosed = true;
          break;
        }
        processText(decoder.decode(value, { stream: true }));
      }
    }

    processText(decoder.decode());
    if (buffer.trim().length > 0) {
      currentDataLines.push(buffer.trim());
      buffer = "";
    }
    flushEvent();
  } catch (error) {
    terminalError = error;
  } finally {
    await reader.cancel().catch(() => {});
  }

  if (terminalError) {
    writeSseLog(logPath, {
      kind: "connection.error",
      streamName: streamName || "unknown",
      url: request.url,
      error: formatError(terminalError)
    });
  }

  writeSseLog(logPath, {
    kind: "connection.close",
    streamName: streamName || "unknown",
    url: request.url,
    reason: replyClosed ? "client_closed" : "upstream_completed"
  });

  if (!reply.raw.writableEnded) {
    try {
      reply.raw.end();
    } catch {
      // Ignore late socket close races after SSE teardown.
    }
  }
}

function writeSseLog(logPath: string | undefined, entry: Record<string, unknown>) {
  if (!logPath) {
    return;
  }

  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    ...entry
  });
  fs.appendFileSync(logPath, `${line}\n`, "utf8");
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.stack || `${error.name}: ${error.message}`;
  }

  return String(error);
}
