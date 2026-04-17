"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listThreadsForWorkspace = listThreadsForWorkspace;
exports.readThreadDetail = readThreadDetail;
const service_1 = require("../workspaces/service");
async function listThreadsForWorkspace({ hostClient, workspaceId, state, search, limit }) {
    const result = await hostClient.listThreads({
        limit: limit || 100,
        archived: state === "archived",
        sortKey: "updated_at",
        search
    });
    const rows = workspaceId
        ? (0, service_1.filterThreadsForWorkspace)(result.data || [], workspaceId)
        : result.data || [];
    return rows.map((thread) => mapThreadSummary(thread, state))
        .sort((left, right) => (0, service_1.compareTimestampDesc)(left.updatedAt, right.updatedAt));
}
async function readThreadDetail(hostClient, threadId) {
    return hostClient.readThread(threadId, { includeTurns: true });
}
function mapThreadSummary(thread, state) {
    return {
        id: thread.id,
        threadId: thread.id,
        title: normalizeOptionalString(thread.name) || normalizeOptionalString(thread.preview) || thread.id,
        preview: normalizeOptionalString(thread.preview) || "",
        cwd: normalizeOptionalString(thread.cwd),
        updatedAt: thread.updatedAt || thread.createdAt || null,
        createdAt: thread.createdAt || null,
        state,
        runtimeStatus: normalizeRuntimeStatus(thread.status)
    };
}
function normalizeOptionalString(value) {
    if (typeof value !== "string") {
        return null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}
function normalizeRuntimeStatus(value) {
    if (typeof value === "string") {
        const trimmed = value.trim();
        return trimmed.length > 0 ? trimmed : null;
    }
    if (value && typeof value === "object") {
        const nestedType = value.type;
        if (typeof nestedType === "string" && nestedType.trim()) {
            return nestedType.trim();
        }
    }
    return null;
}
