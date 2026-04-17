"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_path_1 = __importDefault(require("node:path"));
const node_sqlite_1 = require("node:sqlite");
const config_1 = require("../config");
const store_1 = require("../db/store");
async function main() {
    const config = (0, config_1.loadConfig)();
    const fromPath = process.argv[2]
        ? node_path_1.default.resolve(process.argv[2])
        : node_path_1.default.resolve(config.workspaceRoot, "cclone-control-v2", "data", "control.db");
    const v2 = new node_sqlite_1.DatabaseSync(fromPath);
    const store = new store_1.V3Store(config.databasePath);
    const templates = v2.prepare(`
    SELECT name, content, tags_json
    FROM prompts
  `).all();
    for (const template of templates) {
        try {
            store.createTemplate({
                name: template.name,
                content: template.content,
                tags: safeParseArray(template.tags_json)
            });
        }
        catch {
            // repeated import
        }
    }
    const profiles = v2.prepare(`
    SELECT name, prepend_text, append_text, model, reasoning_effort, approval_policy, sandbox_mode, service_tier
    FROM send_profiles
  `).all();
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
        }
        catch {
            // repeated import
        }
    }
    console.log(`Imported templates=${templates.length} profiles=${profiles.length} from ${fromPath}`);
}
function safeParseArray(value) {
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed.map((entry) => String(entry)) : [];
    }
    catch {
        return [];
    }
}
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
