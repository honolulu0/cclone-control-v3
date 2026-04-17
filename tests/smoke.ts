import { spawn } from "node:child_process";
import path from "node:path";

const cwd = path.resolve(__dirname, "..");
const port = 8797;
const baseUrl = `http://127.0.0.1:${port}`;

async function main() {
  const child = spawn("node", ["backend/dist/server.js"], {
    cwd,
    env: {
      ...process.env,
      CCLONE_CONTROL_V3_PORT: String(port)
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  const logs: string[] = [];
  child.stdout.on("data", (chunk) => logs.push(chunk.toString("utf8")));
  child.stderr.on("data", (chunk) => logs.push(chunk.toString("utf8")));

  try {
    await waitForHealth();

    const health = await getJson(`${baseUrl}/api/health`);
    assert(Boolean(health.ok), "health.ok should be true");

    const workspaces = await getJson(`${baseUrl}/api/workspaces`);
    assert(Array.isArray(workspaces.data), "workspaces.data should be an array");

    const codexSettings = await getJson(`${baseUrl}/api/codex-settings`);
    assert(Array.isArray(codexSettings.fields), "codex-settings.fields should be an array");

    const threads = await getJson(`${baseUrl}/api/threads?state=active`);
    assert(Array.isArray(threads.data), "threads.data should be an array");

    if (threads.data.length > 0) {
      const threadId = threads.data[0].threadId;
      const detail = await getJson(`${baseUrl}/api/threads/${encodeURIComponent(threadId)}`);
      assert(detail && typeof detail === "object", "thread detail should exist");
      const sseLines = await readSseLines(`${baseUrl}/api/threads/${encodeURIComponent(threadId)}/events`, 2);
      assert(sseLines.some((line) => line.includes("event: thread.snapshot")), "SSE should emit thread.snapshot");
    }

    console.log("V3 smoke passed.");
  } finally {
    child.kill("SIGTERM");
  }
}

async function waitForHealth() {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // retry
    }
    await delay(500);
  }
  throw new Error("Timed out waiting for V3 health endpoint.");
}

async function getJson(url: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

async function readSseLines(url: string, maxNonEmptyLines: number) {
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`SSE request failed: ${response.status} ${response.statusText}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const lines: string[] = [];

  while (lines.length < maxNonEmptyLines) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split(/\r?\n/);
    buffer = parts.pop() || "";
    for (const line of parts) {
      if (!line.trim()) continue;
      lines.push(line);
      if (lines.length >= maxNonEmptyLines) break;
    }
  }

  reader.cancel().catch(() => {});
  return lines;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
