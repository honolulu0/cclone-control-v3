import { spawn } from "node:child_process";
import path from "node:path";

const cwd = path.resolve(__dirname, "..");
const port = 8800 + Math.floor(Math.random() * 200);
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
    assert(health.ok === true, "health.ok should be true");

    const workspaces = await getJson(`${baseUrl}/api/workspaces`);
    assert(Array.isArray(workspaces.data), "workspaces.data should be an array");

    const templatesBefore = await getJson(`${baseUrl}/api/templates`);
    const createdTemplate = await requestJson(`${baseUrl}/api/templates`, "POST", {
      name: "V3 Contract Template",
      content: "Reply with CONTRACT_OK only.",
      tags: ["contract", "v3"]
    });
    assert(createdTemplate.name === "V3 Contract Template", "template should be created");
    const updatedTemplate = await requestJson(`${baseUrl}/api/templates/${encodeURIComponent(createdTemplate.id)}`, "PUT", {
      name: "V3 Contract Template Updated"
    });
    assert(updatedTemplate.name === "V3 Contract Template Updated", "template should be updated");

    const createdProfile = await requestJson(`${baseUrl}/api/profiles`, "POST", {
      name: "V3 Contract Profile",
      model: "gpt-5.4",
      reasoningEffort: "medium",
      approvalPolicy: "never",
      sandboxMode: "danger-full-access"
    });
    assert(createdProfile.name === "V3 Contract Profile", "profile should be created");

    const emptyJsonDelete = await requestRaw(`${baseUrl}/api/profiles/${encodeURIComponent(createdProfile.id)}`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json"
      }
    });
    assert(emptyJsonDelete.status === 400, "empty JSON delete should be rejected as 400, not 500");

    const profiles = await getJson(`${baseUrl}/api/profiles`);
    assert(Array.isArray(profiles.data) && profiles.data.some((item: any) => item.id === createdProfile.id), "profiles should include created profile");

    const codexSettings = await getJson(`${baseUrl}/api/codex-settings`);
    const codexSchema = await getJson(`${baseUrl}/api/codex-settings/schema`);
    assert(Array.isArray(codexSettings.fields), "codex settings fields should be array");
    assert(Array.isArray(codexSchema.fields), "codex settings schema fields should be array");

    const modelField = codexSettings.fields.find((field: any) => field.key === "model");
    assert(modelField?.editable === true, "model field should be editable");
    assert(typeof modelField?.sourceLabel === "string" && modelField.sourceLabel.length > 0, "model field should expose sourceLabel");
    assert(typeof modelField?.saveTargetLabel === "string" && modelField.saveTargetLabel.length > 0, "model field should expose saveTargetLabel");
    assert(typeof modelField?.cliCommand === "string" && modelField.cliCommand.includes("--model"), "model field should expose concrete cliCommand");
    await requestJson(`${baseUrl}/api/codex-settings`, "PUT", {
      model: modelField.value
    });
    const rejectedUnknown = await requestJsonRaw(`${baseUrl}/api/codex-settings`, "PUT", {
      unsupported_key: "x"
    });
    assert(rejectedUnknown.status === 400, "unsupported codex setting should be rejected");

    const readOnlyField = codexSettings.fields.find((field: any) => field.editable === false);
    if (readOnlyField) {
      const rejectedReadOnly = await requestJsonRaw(`${baseUrl}/api/codex-settings`, "PUT", {
        [readOnlyField.key]: readOnlyField.value
      });
      assert(rejectedReadOnly.status === 400, "read-only codex setting should be rejected");
    }

    const workspace = workspaces.data[0];
    if (workspace) {
      const threads = await getJson(`${baseUrl}/api/threads?workspaceId=${encodeURIComponent(workspace.id)}&state=active`);
      assert(Array.isArray(threads.data), "threads.data should be an array");
    }

    const sendResponse = await requestJson(`${baseUrl}/api/messages`, "POST", {
      workspaceId: workspace?.id || null,
      threadId: null,
      cwdOverride: workspace?.cwd || null,
      message: "Reply with CONTRACT_OK only.",
      attachments: [],
      profileId: createdProfile.id,
      planMode: false
    });
    assert(Boolean(sendResponse.threadId), "send should return threadId");

    const threadDetail = await getJson(`${baseUrl}/api/threads/${encodeURIComponent(sendResponse.threadId)}`);
    assert(threadDetail && typeof threadDetail === "object", "thread detail should exist");

    const history = await getJson(`${baseUrl}/api/history`);
    assert(Array.isArray(history.data), "history.data should be an array");

    await requestJson(`${baseUrl}/api/templates/${encodeURIComponent(createdTemplate.id)}`, "DELETE");
    await requestJson(`${baseUrl}/api/profiles/${encodeURIComponent(createdProfile.id)}`, "DELETE");
    const templatesAfter = await getJson(`${baseUrl}/api/templates`);
    assert(Array.isArray(templatesBefore.data) && Array.isArray(templatesAfter.data), "templates endpoints should stay readable");

    const sseLines = await readSseLines(`${baseUrl}/api/threads/${encodeURIComponent(sendResponse.threadId)}/events`, 2);
    assert(sseLines.some((line) => line.includes("event: thread.snapshot")), "SSE should emit thread.snapshot");

    console.log("V3 contract tests passed.");
  } catch (error) {
    console.error(logs.join(""));
    throw error;
  } finally {
    child.kill("SIGTERM");
  }
}

async function waitForHealth() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
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

async function requestJson(url: string, method: string, body?: unknown) {
  const response = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

async function requestJsonRaw(url: string, method: string, body?: unknown) {
  const response = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  return {
    status: response.status,
    body: text ? JSON.parse(text) : null
  };
}

async function requestRaw(url: string, init: RequestInit) {
  const response = await fetch(url, init);
  const text = await response.text();
  return {
    status: response.status,
    body: text ? JSON.parse(text) : null
  };
}

async function readSseLines(url: string, maxNonEmptyLines: number) {
  const controller = new AbortController();
  const response = await fetch(url, { signal: controller.signal });
  if (!response.ok || !response.body) {
    throw new Error(`SSE request failed: ${response.status} ${response.statusText}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const lines: string[] = [];
  let buffer = "";

  try {
    while (lines.length < maxNonEmptyLines) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split(/\r?\n/);
      buffer = parts.pop() || "";
      for (const line of parts) {
        if (!line.trim()) continue;
        lines.push(line);
        if (lines.length >= maxNonEmptyLines) {
          controller.abort();
          break;
        }
      }
    }
  } catch (error) {
    if (!(error instanceof Error && error.name === "AbortError")) {
      throw error;
    }
  }

  await reader.cancel().catch(() => {});
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
