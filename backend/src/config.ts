import fs from "node:fs";
import path from "node:path";

export interface AppConfig {
  projectRoot: string;
  workspaceRoot: string;
  dataDir: string;
  logsDir: string;
  uploadsDir: string;
  frontendDir: string;
  port: number;
  hostApiBaseUrl: string;
  hostApiToken: string | null;
  databasePath: string;
  sseEventLogPath: string;
}

export function loadConfig(): AppConfig {
  const projectRoot = path.resolve(__dirname, "..", "..");
  const workspaceRoot = path.resolve(projectRoot, "..");
  const dataDir = normalizeOptionalString(process.env.CCLONE_CONTROL_V3_DATA_DIR)
    ? path.resolve(String(process.env.CCLONE_CONTROL_V3_DATA_DIR))
    : path.join(projectRoot, "data");
  const logsDir = path.join(dataDir, "logs");
  const uploadsDir = path.join(dataDir, "uploads");
  const frontendDir = path.join(projectRoot, "backend", "dist", "public");

  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(logsDir, { recursive: true });
  fs.mkdirSync(uploadsDir, { recursive: true });

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
    databasePath: path.join(dataDir, "control-v3.db"),
    sseEventLogPath: path.join(logsDir, "sse-events.ndjson")
  };
}

function parsePort(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
