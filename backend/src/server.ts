import fs from "node:fs";
import path from "node:path";

import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import Fastify from "fastify";
import { z } from "zod";

import { loadConfig } from "./config";
import { V3Store } from "./db/store";
import { proxySseResponse } from "./services/events/sse";
import { createHistoryService } from "./services/history/service";
import { createHostClient } from "./services/host/client";
import { createProfileService } from "./services/profiles/service";
import { createTemplateService } from "./services/templates/service";
import { readThreadDetail, listThreadsForWorkspace } from "./services/threads/service";
import { sendMessage } from "./services/threads/messages";
import { listWorkspaces } from "./services/workspaces/service";
import { readCodexSettings, readCodexSettingsSchema, writeCodexSettings } from "./services/codex-settings/service";
import { AppError } from "./http-error";

const config = loadConfig();
const store = new V3Store(config.databasePath);
const hostClient = createHostClient(config.hostApiBaseUrl, config.hostApiToken);
const templateService = createTemplateService(store);
const profileService = createProfileService(store);
const historyService = createHistoryService(store);

const app = Fastify({ logger: true });

app.setErrorHandler((error, _request, reply) => {
  if (error instanceof z.ZodError) {
    reply.code(400).send({
      error: "Invalid request",
      issues: error.issues
    });
    return;
  }

  if (error instanceof AppError) {
    reply.code(error.statusCode).send({
      error: error.message
    });
    return;
  }

  const statusCode = readErrorStatusCode(error);
  if (statusCode) {
    reply.code(statusCode).send({
      error: error instanceof Error ? error.message : "Request failed"
    });
    return;
  }

  reply.code(500).send({
    error: error instanceof Error ? error.message : "Internal server error"
  });
});

void app.register(cors, { origin: true });
void app.register(fastifyStatic, {
  root: path.join(config.frontendDir, "assets"),
  prefix: "/assets/"
});

app.get("/api/health", async () => {
  const host = await hostClient.health().catch((error: Error) => ({ ok: false, error: error.message }));
  return {
    ok: true,
    service: "cclone-control-v3",
    timestamp: new Date().toISOString(),
    workspaceRoot: config.workspaceRoot,
    host
  };
});

app.get("/api/models", async () => hostClient.listModels());
app.get("/api/collaboration-modes", async () => hostClient.listCollaborationModes());
app.get("/api/workspaces", async () => ({ data: await listWorkspaces(hostClient) }));

app.get("/api/threads", async (request) => {
  const query = z.object({
    workspaceId: z.string().optional(),
    state: z.enum(["active", "archived"]).default("active"),
    search: z.string().optional(),
    limit: z.coerce.number().int().positive().max(200).default(100)
  }).parse(request.query);

  return {
    data: await listThreadsForWorkspace({
      hostClient,
      workspaceId: query.workspaceId,
      state: query.state,
      search: query.search,
      limit: query.limit
    })
  };
});

app.get("/api/threads/:threadId", async (request) => {
  const params = z.object({ threadId: z.string().min(1) }).parse(request.params);
  return readThreadDetail(hostClient, params.threadId);
});

app.get("/api/threads/:threadId/events", async (request, reply) => {
  const params = z.object({ threadId: z.string().min(1) }).parse(request.params);
  const query = z.object({ includeTurns: z.coerce.boolean().default(true) }).parse(request.query);
  const abortController = new AbortController();
  request.raw.on("close", () => abortController.abort());
  request.raw.on("aborted", () => abortController.abort());
  const upstream = await hostClient.subscribeThreadEvents(params.threadId, {
    includeTurns: query.includeTurns,
    signal: abortController.signal
  });
  await proxySseResponse({
    request,
    reply,
    upstream,
    logPath: config.sseEventLogPath,
    streamName: `thread:${params.threadId}`
  });
  return reply;
});

app.get("/api/thread-events", async (request, reply) => {
  const abortController = new AbortController();
  request.raw.on("close", () => abortController.abort());
  request.raw.on("aborted", () => abortController.abort());

  try {
    const upstream = await hostClient.subscribeGlobalThreadEvents({
      signal: abortController.signal
    });
    await proxySseResponse({
      request,
      reply,
      upstream,
      logPath: config.sseEventLogPath,
      streamName: "thread-feed"
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const normalizedMessage = message.trim().toLowerCase();
    const isNotFound = message.includes("404") || normalizedMessage === "not found";
    if (isNotFound) {
      throw new AppError(503, "Host global thread event stream is unavailable. Restart the host app to load the updated external API.");
    }
    throw error;
  }

  return reply;
});

app.get("/api/thread-requests", async (request, reply) => {
  const abortController = new AbortController();
  request.raw.on("close", () => abortController.abort());
  request.raw.on("aborted", () => abortController.abort());

  try {
    const upstream = await hostClient.subscribeThreadRequests({
      signal: abortController.signal
    });
    await proxySseResponse({
      request,
      reply,
      upstream,
      logPath: config.sseEventLogPath,
      streamName: "thread-requests"
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const normalizedMessage = message.trim().toLowerCase();
    const isNotFound = message.includes("404") || normalizedMessage === "not found";
    if (isNotFound) {
      throw new AppError(503, "Host thread request stream is unavailable. Restart the host app to load the updated external API.");
    }
    throw error;
  }

  return reply;
});

app.post("/api/uploads", async (request) => {
  const fileName = decodeURIComponent(String(request.headers["x-file-name"] || "upload.bin"));
  const mediaType = String(request.headers["content-type"] || "application/octet-stream");
  const buffer = await readBinaryBody(request.raw);
  const safeName = fileName.replace(/[^\w.\-]+/g, "_");
  const storedPath = path.join(config.uploadsDir, `${Date.now()}-${safeName}`);
  fs.writeFileSync(storedPath, buffer);

  return {
    id: path.basename(storedPath),
    kind: mediaType.startsWith("image/") ? "image" : "file",
    source: "upload",
    name: fileName,
    mediaType,
    path: storedPath,
    storedPath
  };
});

app.post("/api/messages", async (request, reply) => {
  const body = z.object({
    workspaceId: z.string().nullable().optional(),
    threadId: z.string().nullable().optional(),
    cwdOverride: z.string().nullable().optional(),
    message: z.string().nullable().optional(),
    attachments: z.array(z.record(z.string(), z.unknown())).optional(),
    profileId: z.string().nullable().optional(),
    planMode: z.boolean().optional()
  }).parse(request.body);

  const profile = body.profileId ? profileService.read(body.profileId) : null;
  if (body.profileId && !profile) {
    reply.code(404);
    return { error: `Profile not found: ${body.profileId}` };
  }

  return sendMessage({
    hostClient,
    store,
    workspaceId: body.workspaceId || null,
    threadId: body.threadId || null,
    cwdOverride: body.cwdOverride || null,
    message: body.message || null,
    attachments: body.attachments || [],
    profile,
    planMode: body.planMode
  });
});

app.get("/api/templates", async () => ({ data: templateService.list() }));
app.post("/api/templates", async (request) =>
  templateService.create(z.object({
    name: z.string().min(1),
    content: z.string().min(1),
    tags: z.array(z.string()).optional()
  }).parse(request.body))
);
app.put("/api/templates/:id", async (request, reply) => {
  const params = z.object({ id: z.string().min(1) }).parse(request.params);
  const updated = templateService.update(params.id, z.object({
    name: z.string().min(1).optional(),
    content: z.string().min(1).optional(),
    tags: z.array(z.string()).optional()
  }).parse(request.body));
  if (!updated) {
    reply.code(404);
    return { error: "Template not found" };
  }
  return updated;
});
app.delete("/api/templates/:id", async (request, reply) => {
  const params = z.object({ id: z.string().min(1) }).parse(request.params);
  const deleted = templateService.remove(params.id);
  if (!deleted) {
    reply.code(404);
    return { error: "Template not found" };
  }
  return { ok: true };
});

app.get("/api/profiles", async () => ({ data: profileService.list() }));
app.post("/api/profiles", async (request) =>
  (() => {
    const body = z.object({
      name: z.string().min(1),
      prependText: z.string().nullable().optional(),
      appendText: z.string().nullable().optional(),
      model: z.string().nullable().optional(),
      reasoningEffort: z.string().nullable().optional(),
      approvalPolicy: z.string().nullable().optional(),
      sandboxMode: z.string().nullable().optional(),
      serviceTier: z.string().nullable().optional(),
      personality: z.string().nullable().optional()
    }).parse(request.body);
    return profileService.create({
      name: body.name,
      prependText: body.prependText ?? null,
      appendText: body.appendText ?? null,
      model: body.model ?? null,
      reasoningEffort: body.reasoningEffort ?? null,
      approvalPolicy: body.approvalPolicy ?? null,
      sandboxMode: body.sandboxMode ?? null,
      serviceTier: body.serviceTier ?? null,
      personality: body.personality ?? null
    });
  })()
);
app.put("/api/profiles/:id", async (request, reply) => {
  const params = z.object({ id: z.string().min(1) }).parse(request.params);
  const updated = profileService.update(params.id, z.object({
    name: z.string().min(1).optional(),
    prependText: z.string().nullable().optional(),
    appendText: z.string().nullable().optional(),
    model: z.string().nullable().optional(),
    reasoningEffort: z.string().nullable().optional(),
    approvalPolicy: z.string().nullable().optional(),
    sandboxMode: z.string().nullable().optional(),
    serviceTier: z.string().nullable().optional(),
    personality: z.string().nullable().optional()
  }).parse(request.body));
  if (!updated) {
    reply.code(404);
    return { error: "Profile not found" };
  }
  return updated;
});
app.delete("/api/profiles/:id", async (request, reply) => {
  const params = z.object({ id: z.string().min(1) }).parse(request.params);
  const deleted = profileService.remove(params.id);
  if (!deleted) {
    reply.code(404);
    return { error: "Profile not found" };
  }
  return { ok: true };
});

app.get("/api/history", async () => ({ data: historyService.list() }));
app.get("/api/codex-settings", async () => readCodexSettings(hostClient));
app.get("/api/codex-settings/schema", async () => readCodexSettingsSchema(hostClient));
app.put("/api/codex-settings", async (request) => {
  const body = z.record(z.string(), z.union([z.string(), z.null()])).parse(request.body);
  return writeCodexSettings(hostClient, body);
});

app.setNotFoundHandler(async (request, reply) => {
  if (request.url.startsWith("/api/")) {
    reply.code(404);
    return { error: "Not found" };
  }

  const indexPath = path.join(config.frontendDir, "index.html");
  reply.type("text/html; charset=utf-8");
  return fs.readFileSync(indexPath, "utf8");
});

app.listen({ host: "127.0.0.1", port: config.port })
  .then(() => {
    app.log.info(`cclone-control-v3 listening on http://127.0.0.1:${config.port}`);
  })
  .catch((error) => {
    app.log.error(error);
    process.exitCode = 1;
  });

function readBinaryBody(req: NodeJS.ReadableStream): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function readErrorStatusCode(error: unknown): number | null {
  if (!error || typeof error !== "object") {
    return null;
  }

  const statusCode = Reflect.get(error, "statusCode");
  if (typeof statusCode === "number" && statusCode >= 400 && statusCode < 600) {
    return statusCode;
  }

  const status = Reflect.get(error, "status");
  if (typeof status === "number" && status >= 400 && status < 600) {
    return status;
  }

  return null;
}
