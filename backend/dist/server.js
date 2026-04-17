"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const cors_1 = __importDefault(require("@fastify/cors"));
const static_1 = __importDefault(require("@fastify/static"));
const fastify_1 = __importDefault(require("fastify"));
const zod_1 = require("zod");
const config_1 = require("./config");
const store_1 = require("./db/store");
const sse_1 = require("./services/events/sse");
const service_1 = require("./services/history/service");
const client_1 = require("./services/host/client");
const service_2 = require("./services/profiles/service");
const service_3 = require("./services/templates/service");
const service_4 = require("./services/threads/service");
const messages_1 = require("./services/threads/messages");
const service_5 = require("./services/workspaces/service");
const service_6 = require("./services/codex-settings/service");
const http_error_1 = require("./http-error");
const config = (0, config_1.loadConfig)();
const store = new store_1.V3Store(config.databasePath);
const hostClient = (0, client_1.createHostClient)(config.hostApiBaseUrl, config.hostApiToken);
const templateService = (0, service_3.createTemplateService)(store);
const profileService = (0, service_2.createProfileService)(store);
const historyService = (0, service_1.createHistoryService)(store);
const app = (0, fastify_1.default)({ logger: true });
app.setErrorHandler((error, _request, reply) => {
    if (error instanceof zod_1.z.ZodError) {
        reply.code(400).send({
            error: "Invalid request",
            issues: error.issues
        });
        return;
    }
    if (error instanceof http_error_1.AppError) {
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
void app.register(cors_1.default, { origin: true });
void app.register(static_1.default, {
    root: node_path_1.default.join(config.frontendDir, "assets"),
    prefix: "/assets/"
});
app.get("/api/health", async () => {
    const host = await hostClient.health().catch((error) => ({ ok: false, error: error.message }));
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
app.get("/api/workspaces", async () => ({ data: await (0, service_5.listWorkspaces)(hostClient) }));
app.get("/api/threads", async (request) => {
    const query = zod_1.z.object({
        workspaceId: zod_1.z.string().optional(),
        state: zod_1.z.enum(["active", "archived"]).default("active"),
        search: zod_1.z.string().optional(),
        limit: zod_1.z.coerce.number().int().positive().max(200).default(100)
    }).parse(request.query);
    return {
        data: await (0, service_4.listThreadsForWorkspace)({
            hostClient,
            workspaceId: query.workspaceId,
            state: query.state,
            search: query.search,
            limit: query.limit
        })
    };
});
app.get("/api/threads/:threadId", async (request) => {
    const params = zod_1.z.object({ threadId: zod_1.z.string().min(1) }).parse(request.params);
    return (0, service_4.readThreadDetail)(hostClient, params.threadId);
});
app.get("/api/threads/:threadId/events", async (request, reply) => {
    const params = zod_1.z.object({ threadId: zod_1.z.string().min(1) }).parse(request.params);
    const query = zod_1.z.object({ includeTurns: zod_1.z.coerce.boolean().default(true) }).parse(request.query);
    const abortController = new AbortController();
    request.raw.on("close", () => abortController.abort());
    request.raw.on("aborted", () => abortController.abort());
    const upstream = await hostClient.subscribeThreadEvents(params.threadId, {
        includeTurns: query.includeTurns,
        signal: abortController.signal
    });
    await (0, sse_1.proxySseResponse)({
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
        await (0, sse_1.proxySseResponse)({
            request,
            reply,
            upstream,
            logPath: config.sseEventLogPath,
            streamName: "thread-feed"
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const normalizedMessage = message.trim().toLowerCase();
        const isNotFound = message.includes("404") || normalizedMessage === "not found";
        if (isNotFound) {
            throw new http_error_1.AppError(503, "Host global thread event stream is unavailable. Restart the host app to load the updated external API.");
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
        await (0, sse_1.proxySseResponse)({
            request,
            reply,
            upstream,
            logPath: config.sseEventLogPath,
            streamName: "thread-requests"
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const normalizedMessage = message.trim().toLowerCase();
        const isNotFound = message.includes("404") || normalizedMessage === "not found";
        if (isNotFound) {
            throw new http_error_1.AppError(503, "Host thread request stream is unavailable. Restart the host app to load the updated external API.");
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
    const storedPath = node_path_1.default.join(config.uploadsDir, `${Date.now()}-${safeName}`);
    node_fs_1.default.writeFileSync(storedPath, buffer);
    return {
        id: node_path_1.default.basename(storedPath),
        kind: mediaType.startsWith("image/") ? "image" : "file",
        source: "upload",
        name: fileName,
        mediaType,
        path: storedPath,
        storedPath
    };
});
app.post("/api/messages", async (request, reply) => {
    const body = zod_1.z.object({
        workspaceId: zod_1.z.string().nullable().optional(),
        threadId: zod_1.z.string().nullable().optional(),
        cwdOverride: zod_1.z.string().nullable().optional(),
        message: zod_1.z.string().nullable().optional(),
        attachments: zod_1.z.array(zod_1.z.record(zod_1.z.string(), zod_1.z.unknown())).optional(),
        profileId: zod_1.z.string().nullable().optional(),
        planMode: zod_1.z.boolean().optional()
    }).parse(request.body);
    const profile = body.profileId ? profileService.read(body.profileId) : null;
    if (body.profileId && !profile) {
        reply.code(404);
        return { error: `Profile not found: ${body.profileId}` };
    }
    return (0, messages_1.sendMessage)({
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
app.post("/api/templates", async (request) => templateService.create(zod_1.z.object({
    name: zod_1.z.string().min(1),
    content: zod_1.z.string().min(1),
    tags: zod_1.z.array(zod_1.z.string()).optional()
}).parse(request.body)));
app.put("/api/templates/:id", async (request, reply) => {
    const params = zod_1.z.object({ id: zod_1.z.string().min(1) }).parse(request.params);
    const updated = templateService.update(params.id, zod_1.z.object({
        name: zod_1.z.string().min(1).optional(),
        content: zod_1.z.string().min(1).optional(),
        tags: zod_1.z.array(zod_1.z.string()).optional()
    }).parse(request.body));
    if (!updated) {
        reply.code(404);
        return { error: "Template not found" };
    }
    return updated;
});
app.delete("/api/templates/:id", async (request, reply) => {
    const params = zod_1.z.object({ id: zod_1.z.string().min(1) }).parse(request.params);
    const deleted = templateService.remove(params.id);
    if (!deleted) {
        reply.code(404);
        return { error: "Template not found" };
    }
    return { ok: true };
});
app.get("/api/profiles", async () => ({ data: profileService.list() }));
app.post("/api/profiles", async (request) => (() => {
    const body = zod_1.z.object({
        name: zod_1.z.string().min(1),
        prependText: zod_1.z.string().nullable().optional(),
        appendText: zod_1.z.string().nullable().optional(),
        model: zod_1.z.string().nullable().optional(),
        reasoningEffort: zod_1.z.string().nullable().optional(),
        approvalPolicy: zod_1.z.string().nullable().optional(),
        sandboxMode: zod_1.z.string().nullable().optional(),
        serviceTier: zod_1.z.string().nullable().optional(),
        personality: zod_1.z.string().nullable().optional()
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
})());
app.put("/api/profiles/:id", async (request, reply) => {
    const params = zod_1.z.object({ id: zod_1.z.string().min(1) }).parse(request.params);
    const updated = profileService.update(params.id, zod_1.z.object({
        name: zod_1.z.string().min(1).optional(),
        prependText: zod_1.z.string().nullable().optional(),
        appendText: zod_1.z.string().nullable().optional(),
        model: zod_1.z.string().nullable().optional(),
        reasoningEffort: zod_1.z.string().nullable().optional(),
        approvalPolicy: zod_1.z.string().nullable().optional(),
        sandboxMode: zod_1.z.string().nullable().optional(),
        serviceTier: zod_1.z.string().nullable().optional(),
        personality: zod_1.z.string().nullable().optional()
    }).parse(request.body));
    if (!updated) {
        reply.code(404);
        return { error: "Profile not found" };
    }
    return updated;
});
app.delete("/api/profiles/:id", async (request, reply) => {
    const params = zod_1.z.object({ id: zod_1.z.string().min(1) }).parse(request.params);
    const deleted = profileService.remove(params.id);
    if (!deleted) {
        reply.code(404);
        return { error: "Profile not found" };
    }
    return { ok: true };
});
app.get("/api/history", async () => ({ data: historyService.list() }));
app.get("/api/codex-settings", async () => (0, service_6.readCodexSettings)(hostClient));
app.get("/api/codex-settings/schema", async () => (0, service_6.readCodexSettingsSchema)(hostClient));
app.put("/api/codex-settings", async (request) => {
    const body = zod_1.z.record(zod_1.z.string(), zod_1.z.union([zod_1.z.string(), zod_1.z.null()])).parse(request.body);
    return (0, service_6.writeCodexSettings)(hostClient, body);
});
app.setNotFoundHandler(async (request, reply) => {
    if (request.url.startsWith("/api/")) {
        reply.code(404);
        return { error: "Not found" };
    }
    const indexPath = node_path_1.default.join(config.frontendDir, "index.html");
    reply.type("text/html; charset=utf-8");
    return node_fs_1.default.readFileSync(indexPath, "utf8");
});
app.listen({ host: "127.0.0.1", port: config.port })
    .then(() => {
    app.log.info(`cclone-control-v3 listening on http://127.0.0.1:${config.port}`);
})
    .catch((error) => {
    app.log.error(error);
    process.exitCode = 1;
});
function readBinaryBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        req.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        req.on("end", () => resolve(Buffer.concat(chunks)));
        req.on("error", reject);
    });
}
function readErrorStatusCode(error) {
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
