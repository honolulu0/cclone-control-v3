"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.V3Store = void 0;
const node_crypto_1 = require("node:crypto");
const node_sqlite_1 = require("node:sqlite");
class V3Store {
    db;
    constructor(databasePath) {
        this.db = new node_sqlite_1.DatabaseSync(databasePath);
        this.db.exec("PRAGMA journal_mode = WAL;");
        this.db.exec("PRAGMA foreign_keys = ON;");
        this.db.exec(`
      CREATE TABLE IF NOT EXISTS templates (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        content TEXT NOT NULL,
        tags_json TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS profiles (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        prepend_text TEXT NULL,
        append_text TEXT NULL,
        model TEXT NULL,
        reasoning_effort TEXT NULL,
        approval_policy TEXT NULL,
        sandbox_mode TEXT NULL,
        service_tier TEXT NULL,
        personality TEXT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS history (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NULL,
        thread_id TEXT NOT NULL,
        turn_id TEXT NULL,
        request_body_json TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);
    }
    listTemplates() {
        return this.db.prepare(`
      SELECT id, name, content, tags_json, created_at, updated_at
      FROM templates
      ORDER BY updated_at DESC, name ASC
    `).all().map((row) => mapTemplate(row));
    }
    readTemplate(id) {
        const row = this.db.prepare(`
      SELECT id, name, content, tags_json, created_at, updated_at
      FROM templates
      WHERE id = ?
    `).get(id);
        return row ? mapTemplate(row) : null;
    }
    createTemplate(input) {
        const now = new Date().toISOString();
        const record = {
            id: (0, node_crypto_1.randomUUID)(),
            name: requireText(input.name, "name"),
            content: requireText(input.content, "content"),
            tags: normalizeTags(input.tags),
            createdAt: now,
            updatedAt: now
        };
        this.db.prepare(`
      INSERT INTO templates (id, name, content, tags_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(record.id, record.name, record.content, JSON.stringify(record.tags), record.createdAt, record.updatedAt);
        return record;
    }
    updateTemplate(id, patch) {
        const existing = this.readTemplate(id);
        if (!existing) {
            return null;
        }
        const updated = {
            ...existing,
            name: patch.name === undefined ? existing.name : requireText(patch.name, "name"),
            content: patch.content === undefined ? existing.content : requireText(patch.content, "content"),
            tags: patch.tags === undefined ? existing.tags : normalizeTags(patch.tags),
            updatedAt: new Date().toISOString()
        };
        this.db.prepare(`
      UPDATE templates
      SET name = ?, content = ?, tags_json = ?, updated_at = ?
      WHERE id = ?
    `).run(updated.name, updated.content, JSON.stringify(updated.tags), updated.updatedAt, id);
        return updated;
    }
    deleteTemplate(id) {
        return this.db.prepare("DELETE FROM templates WHERE id = ?").run(id).changes > 0;
    }
    listProfiles() {
        return this.db.prepare(`
      SELECT id, name, prepend_text, append_text, model, reasoning_effort, approval_policy, sandbox_mode, service_tier, personality, created_at, updated_at
      FROM profiles
      ORDER BY updated_at DESC, name ASC
    `).all().map((row) => mapProfile(row));
    }
    readProfile(id) {
        const row = this.db.prepare(`
      SELECT id, name, prepend_text, append_text, model, reasoning_effort, approval_policy, sandbox_mode, service_tier, personality, created_at, updated_at
      FROM profiles
      WHERE id = ?
    `).get(id);
        return row ? mapProfile(row) : null;
    }
    createProfile(input) {
        const now = new Date().toISOString();
        const record = {
            id: (0, node_crypto_1.randomUUID)(),
            name: requireText(input.name, "name"),
            prependText: normalizeOptionalString(input.prependText),
            appendText: normalizeOptionalString(input.appendText),
            model: normalizeOptionalString(input.model),
            reasoningEffort: normalizeOptionalString(input.reasoningEffort),
            approvalPolicy: normalizeOptionalString(input.approvalPolicy),
            sandboxMode: normalizeOptionalString(input.sandboxMode),
            serviceTier: normalizeOptionalString(input.serviceTier),
            personality: normalizeOptionalString(input.personality),
            createdAt: now,
            updatedAt: now
        };
        this.db.prepare(`
      INSERT INTO profiles (id, name, prepend_text, append_text, model, reasoning_effort, approval_policy, sandbox_mode, service_tier, personality, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(record.id, record.name, record.prependText, record.appendText, record.model, record.reasoningEffort, record.approvalPolicy, record.sandboxMode, record.serviceTier, record.personality, record.createdAt, record.updatedAt);
        return record;
    }
    updateProfile(id, patch) {
        const existing = this.readProfile(id);
        if (!existing) {
            return null;
        }
        const updated = {
            ...existing,
            name: patch.name === undefined ? existing.name : requireText(patch.name, "name"),
            prependText: patch.prependText === undefined ? existing.prependText : normalizeOptionalString(patch.prependText),
            appendText: patch.appendText === undefined ? existing.appendText : normalizeOptionalString(patch.appendText),
            model: patch.model === undefined ? existing.model : normalizeOptionalString(patch.model),
            reasoningEffort: patch.reasoningEffort === undefined ? existing.reasoningEffort : normalizeOptionalString(patch.reasoningEffort),
            approvalPolicy: patch.approvalPolicy === undefined ? existing.approvalPolicy : normalizeOptionalString(patch.approvalPolicy),
            sandboxMode: patch.sandboxMode === undefined ? existing.sandboxMode : normalizeOptionalString(patch.sandboxMode),
            serviceTier: patch.serviceTier === undefined ? existing.serviceTier : normalizeOptionalString(patch.serviceTier),
            personality: patch.personality === undefined ? existing.personality : normalizeOptionalString(patch.personality),
            updatedAt: new Date().toISOString()
        };
        this.db.prepare(`
      UPDATE profiles
      SET name = ?, prepend_text = ?, append_text = ?, model = ?, reasoning_effort = ?, approval_policy = ?, sandbox_mode = ?, service_tier = ?, personality = ?, updated_at = ?
      WHERE id = ?
    `).run(updated.name, updated.prependText, updated.appendText, updated.model, updated.reasoningEffort, updated.approvalPolicy, updated.sandboxMode, updated.serviceTier, updated.personality, updated.updatedAt, id);
        return updated;
    }
    deleteProfile(id) {
        return this.db.prepare("DELETE FROM profiles WHERE id = ?").run(id).changes > 0;
    }
    listHistory() {
        return this.db.prepare(`
      SELECT id, workspace_id, thread_id, turn_id, request_body_json, status, created_at
      FROM history
      ORDER BY created_at DESC
      LIMIT 200
    `).all().map((row) => mapHistory(row));
    }
    recordHistory(input) {
        const record = {
            id: (0, node_crypto_1.randomUUID)(),
            workspaceId: normalizeOptionalString(input.workspaceId),
            threadId: requireText(input.threadId, "threadId"),
            turnId: normalizeOptionalString(input.turnId),
            requestBody: input.requestBody,
            status: requireText(input.status, "status"),
            createdAt: new Date().toISOString()
        };
        this.db.prepare(`
      INSERT INTO history (id, workspace_id, thread_id, turn_id, request_body_json, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(record.id, record.workspaceId, record.threadId, record.turnId, JSON.stringify(record.requestBody ?? null), record.status, record.createdAt);
        return record;
    }
}
exports.V3Store = V3Store;
function mapTemplate(row) {
    return {
        id: row.id,
        name: row.name,
        content: row.content,
        tags: parseJsonArray(row.tags_json),
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}
function mapProfile(row) {
    return {
        id: row.id,
        name: row.name,
        prependText: row.prepend_text,
        appendText: row.append_text,
        model: row.model,
        reasoningEffort: row.reasoning_effort,
        approvalPolicy: row.approval_policy,
        sandboxMode: row.sandbox_mode,
        serviceTier: row.service_tier,
        personality: row.personality,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}
function mapHistory(row) {
    return {
        id: row.id,
        workspaceId: row.workspace_id,
        threadId: row.thread_id,
        turnId: row.turn_id,
        requestBody: parseJsonObject(row.request_body_json),
        status: row.status,
        createdAt: row.created_at
    };
}
function normalizeTags(value) {
    return (value || []).map((entry) => requireText(entry, "tags[]"));
}
function parseJsonArray(value) {
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed.map((entry) => String(entry)) : [];
    }
    catch {
        return [];
    }
}
function parseJsonObject(value) {
    try {
        return JSON.parse(value);
    }
    catch {
        return null;
    }
}
function requireText(value, field) {
    const normalized = normalizeOptionalString(value);
    if (!normalized) {
        throw new Error(`${field} is required.`);
    }
    return normalized;
}
function normalizeOptionalString(value) {
    if (typeof value !== "string") {
        return null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}
