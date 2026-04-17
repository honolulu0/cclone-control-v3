"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadConfig = loadConfig;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
function loadConfig() {
    const projectRoot = node_path_1.default.resolve(__dirname, "..", "..");
    const workspaceRoot = node_path_1.default.resolve(projectRoot, "..");
    const dataDir = normalizeOptionalString(process.env.CCLONE_CONTROL_V3_DATA_DIR)
        ? node_path_1.default.resolve(String(process.env.CCLONE_CONTROL_V3_DATA_DIR))
        : node_path_1.default.join(projectRoot, "data");
    const logsDir = node_path_1.default.join(dataDir, "logs");
    const uploadsDir = node_path_1.default.join(dataDir, "uploads");
    const frontendDir = node_path_1.default.join(projectRoot, "backend", "dist", "public");
    node_fs_1.default.mkdirSync(dataDir, { recursive: true });
    node_fs_1.default.mkdirSync(logsDir, { recursive: true });
    node_fs_1.default.mkdirSync(uploadsDir, { recursive: true });
    return {
        projectRoot,
        workspaceRoot,
        dataDir,
        logsDir,
        uploadsDir,
        frontendDir,
        port: parsePort(process.env.CCLONE_CONTROL_V3_PORT, 8796),
        hostApiBaseUrl: normalizeOptionalString(process.env.CCLONE_API_BASE_URL) || "http://127.0.0.1:8765",
        hostApiToken: normalizeOptionalString(process.env.CCLONE_API_TOKEN),
        databasePath: node_path_1.default.join(dataDir, "control-v3.db"),
        sseEventLogPath: node_path_1.default.join(logsDir, "sse-events.ndjson")
    };
}
function parsePort(value, fallback) {
    const parsed = Number.parseInt(String(value || ""), 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
function normalizeOptionalString(value) {
    if (typeof value !== "string") {
        return null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}
