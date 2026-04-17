import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { loadConfig } from "../config";
import { V3Store } from "../db/store";

async function main() {
  const config = loadConfig();
  const fromPath = process.argv[2]
    ? path.resolve(process.argv[2])
    : path.resolve(config.workspaceRoot, "cclone-control-v2", "data", "control.db");

  const v2 = new DatabaseSync(fromPath);
  const store = new V3Store(config.databasePath);

  const templates = v2.prepare(`
    SELECT name, content, tags_json
    FROM prompts
  `).all() as Array<any>;

  for (const template of templates) {
    try {
      store.createTemplate({
        name: template.name,
        content: template.content,
        tags: safeParseArray(template.tags_json)
      });
    } catch {
      // repeated import
    }
  }

  const profiles = v2.prepare(`
    SELECT name, prepend_text, append_text, model, reasoning_effort, approval_policy, sandbox_mode, service_tier
    FROM send_profiles
  `).all() as Array<any>;

  for (const profile of profiles) {
    try {
      store.createProfile({
        name: profile.name,
        prependText: profile.prepend_text,
        appendText: profile.append_text,
        model: profile.model,
        reasoningEffort: profile.reasoning_effort,
        approvalPolicy: profile.approval_policy,
        sandboxMode: profile.sandbox_mode,
        serviceTier: profile.service_tier,
        personality: null
      });
    } catch {
      // repeated import
    }
  }

  console.log(`Imported templates=${templates.length} profiles=${profiles.length} from ${fromPath}`);
}

function safeParseArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map((entry) => String(entry)) : [];
  } catch {
    return [];
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
