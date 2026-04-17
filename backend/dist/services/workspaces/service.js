"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listWorkspaces = listWorkspaces;
exports.filterThreadsForWorkspace = filterThreadsForWorkspace;
exports.compareTimestampDesc = compareTimestampDesc;
exports.parseTimestamp = parseTimestamp;
async function listWorkspaces(hostClient) {
    const result = await hostClient.listThreads({
        limit: 200,
        archived: false,
        sortKey: "updated_at"
    });
    const grouped = new Map();
    for (const thread of result.data || []) {
        const cwd = normalizeOptionalString(thread.cwd);
        if (!cwd) {
            continue;
        }
        const existing = grouped.get(cwd);
        const updatedAt = thread.updatedAt || thread.createdAt || null;
        if (!existing) {
            grouped.set(cwd, {
                id: cwd,
                name: lastSegment(cwd) || "workspace",
                cwd,
                updatedAt,
                threadCount: 1
            });
            continue;
        }
        existing.threadCount += 1;
        if (compareTimestampDesc(updatedAt, existing.updatedAt) < 0) {
            existing.updatedAt = updatedAt;
        }
    }
    return [...grouped.values()].sort((left, right) => compareTimestampDesc(left.updatedAt, right.updatedAt));
}
function filterThreadsForWorkspace(threads, workspaceId) {
    const normalizedWorkspace = normalizePath(workspaceId);
    return threads.filter((thread) => {
        const cwd = normalizeOptionalString(thread.cwd);
        return cwd ? normalizePath(cwd).startsWith(normalizedWorkspace) : false;
    });
}
function compareTimestampDesc(left, right) {
    return parseTimestamp(right) - parseTimestamp(left);
}
function parseTimestamp(value) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) {
        return numeric > 10_000_000_000 ? numeric : numeric * 1000;
    }
    const parsed = value ? new Date(value).getTime() : 0;
    return Number.isFinite(parsed) ? parsed : 0;
}
function lastSegment(value) {
    const normalized = value.replace(/[\\/]+$/, "");
    const parts = normalized.split(/[\\/]/);
    return parts[parts.length - 1] || normalized;
}
function normalizePath(value) {
    return value.replaceAll("\\", "/").toLowerCase();
}
function normalizeOptionalString(value) {
    if (typeof value !== "string") {
        return null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}
