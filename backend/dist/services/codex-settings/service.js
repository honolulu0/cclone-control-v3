"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.readCodexSettings = readCodexSettings;
exports.readCodexSettingsSchema = readCodexSettingsSchema;
exports.writeCodexSettings = writeCodexSettings;
const node_path_1 = __importDefault(require("node:path"));
const codex_config_schema_json_1 = __importDefault(require("../../schemas/codex-config.schema.json"));
const http_error_1 = require("../../http-error");
const schemaRoot = codex_config_schema_json_1.default;
async function readCodexSettings(hostClient) {
    const [configPayload] = await Promise.all([
        hostClient.getConfig({ includeLayers: true }),
        hostClient.getConfigRequirements().catch(() => null),
    ]);
    const configRoot = extractConfigRoot(configPayload);
    const origins = extractOrigins(configPayload);
    const saveTarget = inferSaveTarget(configPayload);
    const fields = Object.entries(schemaRoot.properties || {})
        .map(([configKey, rawNode]) => buildFieldFromSchema(configKey, rawNode, configRoot, origins, saveTarget))
        .sort((left, right) => compareGroup(left.group, right.group) || left.label.localeCompare(right.label, "zh-CN"));
    return {
        fields,
        rawConfig: configPayload
    };
}
function compareGroup(left, right) {
    const order = ["instructions", "model", "runtime", "behavior", "integration", "advanced"];
    return order.indexOf(left) - order.indexOf(right);
}
async function readCodexSettingsSchema(hostClient) {
    const snapshot = await readCodexSettings(hostClient);
    return {
        fields: snapshot.fields.map(({ value: _value, source: _source, ...field }) => field)
    };
}
async function writeCodexSettings(hostClient, patch) {
    const schema = await readCodexSettingsSchema(hostClient);
    const schemaByKey = new Map(schema.fields.map((field) => [field.key, field]));
    const edits = [];
    for (const [key, value] of Object.entries(patch)) {
        const field = schemaByKey.get(key);
        if (!field) {
            throw (0, http_error_1.createHttpError)(400, `Unsupported Codex setting: ${key}`);
        }
        if (!field.editable) {
            throw (0, http_error_1.createHttpError)(400, `Codex setting is read-only: ${key}`);
        }
        edits.push({
            keyPath: field.configKey,
            value,
            mergeStrategy: "upsert"
        });
    }
    await hostClient.batchWriteConfig({
        edits,
        filePath: null,
        expectedVersion: null
    });
    return readCodexSettings(hostClient);
}
function buildFieldFromSchema(configKey, rawNode, configRoot, origins, saveTarget) {
    const node = resolveSchemaNode(rawNode);
    const value = getPathValue(configRoot, configKey);
    const type = inferFieldType(configKey, node, value);
    const options = extractOptions(configKey, node);
    const label = labelForKey(configKey);
    const description = describeField(configKey, node.description || "");
    const usage = usageForField(configKey, type, options);
    const sourceInfo = inferSource(origins, configKey);
    const cliInfo = inferCliCommand(configKey);
    return {
        key: configKey,
        configKey,
        group: inferGroup(configKey),
        label,
        description,
        usage,
        type,
        editable: true,
        ...sourceInfo,
        ...saveTarget,
        ...cliInfo,
        value,
        options: options.length > 0 ? options : undefined,
        validation: { required: false }
    };
}
function resolveSchemaNode(node) {
    if (!node) {
        return {};
    }
    let current = { ...node };
    if (current.$ref) {
        const ref = String(current.$ref);
        current = {
            ...resolveSchemaRef(ref),
            ...omit(current, ["$ref"])
        };
    }
    if (Array.isArray(current.allOf) && current.allOf.length > 0) {
        const merged = current.allOf.reduce((acc, entry) => ({ ...acc, ...resolveSchemaNode(entry) }), {});
        current = { ...merged, ...omit(current, ["allOf"]) };
    }
    return current;
}
function resolveSchemaRef(ref) {
    const prefix = "#/definitions/";
    if (!ref.startsWith(prefix)) {
        return {};
    }
    const key = ref.slice(prefix.length);
    return resolveSchemaNode(schemaRoot.definitions?.[key] || {});
}
function inferFieldType(configKey, node, value) {
    if (configKey === "approval_policy") {
        return value && typeof value === "object" ? "json" : "select";
    }
    if (hasEnum(node))
        return "select";
    if (node.type === "boolean")
        return "checkbox";
    if (node.type === "array" || node.type === "object" || node.properties || node.additionalProperties)
        return "json";
    if (configKey.includes("instructions") || configKey.includes("prompt"))
        return "textarea";
    return "text";
}
function extractOptions(configKey, node) {
    if (configKey === "approval_policy") {
        return [
            { value: "untrusted", label: "Untrusted · 仅自动放行安全只读命令" },
            { value: "on-failure", label: "On failure · 先在沙箱执行，失败后再请求升级" },
            { value: "on-request", label: "On request · 由模型按需发起审批" },
            { value: "never", label: "Never · 不请求审批，失败直接返回模型" },
        ];
    }
    if (Array.isArray(node.enum)) {
        return node.enum.map((value) => ({ label: String(value), value: String(value) }));
    }
    for (const branchKey of ["oneOf", "anyOf"]) {
        const branches = node[branchKey];
        if (!Array.isArray(branches))
            continue;
        const options = branches
            .map((entry) => resolveSchemaNode(entry))
            .flatMap((entry) => Array.isArray(entry.enum)
            ? entry.enum.map((value) => ({
                label: entry.description ? `${String(value)} - ${String(entry.description)}` : String(value),
                value: String(value)
            }))
            : []);
        if (options.length > 0) {
            return options;
        }
    }
    return [];
}
function hasEnum(node) {
    if (Array.isArray(node.enum) && node.enum.length > 0) {
        return true;
    }
    return ["oneOf", "anyOf"].some((key) => Array.isArray(node[key]) &&
        node[key].every((entry) => {
            const resolved = resolveSchemaNode(entry);
            return Array.isArray(resolved.enum) && resolved.enum.length > 0;
        }));
}
function describeField(configKey, baseDescription) {
    if (configKey === "instructions") {
        return `${baseDescription} 这是官方 config.toml 的 instructions 键，在宿主 thread/start 运行时会映射为 baseInstructions。`;
    }
    if (configKey === "developer_instructions") {
        return `${baseDescription} 这是开发者层默认指令，会写回用户级 Codex 配置。`;
    }
    return baseDescription || "官方 schema 未提供额外说明。";
}
function usageForField(configKey, type, options) {
    if (configKey === "instructions") {
        return "用于设置系统级默认指令，适合放长期稳定的全局原则或高层行为要求。";
    }
    if (configKey === "developer_instructions") {
        return "用于设置开发者层默认指令，适合放工程规范、执行方式和长期固定的工作偏好。";
    }
    if (configKey === "approval_policy") {
        if (type === "json") {
            return "用于控制命令审批策略。当前值是 granular 细粒度对象，需要按 JSON 结构编辑；修改前请先确认每个审批分支的含义。";
        }
        return "用于控制命令审批策略。常用选项包括 Untrusted、On failure、On request、Never；只有在你明确理解自动审批边界时才应放宽。";
    }
    if (configKey === "sandbox_mode") {
        return "用于控制默认沙箱模式。生产环境下建议按最小权限原则选择。";
    }
    if (configKey === "personality") {
        return "用于设置默认人格，影响 Codex 的默认表达与执行风格。";
    }
    if (type === "select" && options.length > 0) {
        return `从官方 schema 提供的可选值中选择：${options.map((option) => option.value).join(" / ")}。`;
    }
    if (type === "checkbox") {
        return "布尔开关项，开启或关闭该行为。";
    }
    if (type === "json") {
        return "复杂结构项，使用 JSON 形式编辑；仅在你明确理解字段结构时再修改。";
    }
    if (type === "textarea") {
        return "多行文本项，适合长说明、规则或模板内容。";
    }
    return "基础标量项，按官方 schema 允许的值填写。";
}
function inferGroup(configKey) {
    if (configKey.includes("instruction") || configKey.includes("prompt"))
        return "instructions";
    if (configKey === "model" || configKey.startsWith("model_") || configKey === "review_model" || configKey === "service_tier")
        return "model";
    if (configKey.includes("approval") || configKey.includes("sandbox") || configKey === "permissions" || configKey === "default_permissions")
        return "runtime";
    if (configKey === "personality" || configKey.includes("history") || configKey.includes("memories"))
        return "behavior";
    if (configKey.includes("mcp") || configKey.includes("plugin") || configKey.includes("tool") || configKey.includes("app") || configKey.includes("market") || configKey.includes("project"))
        return "integration";
    return "advanced";
}
function inferSource(origins, configKey) {
    const origin = origins[configKey];
    const filePath = typeof origin?.name?.file === "string" ? origin.name.file : null;
    if (filePath) {
        const fileName = node_path_1.default.basename(filePath);
        return {
            source: "file",
            sourceLabel: fileName,
            sourcePath: filePath,
            sourceDetail: `当前值来自配置文件 ${fileName}。`
        };
    }
    return {
        source: "untracked",
        sourceLabel: "未标注到配置文件",
        sourcePath: null,
        sourceDetail: "宿主没有返回该项来自哪个具体配置文件，也没有返回任何具体命令来源。这里不再伪造“模型命令”。"
    };
}
function labelForKey(key) {
    const overrides = {
        instructions: "基础指令",
        developer_instructions: "开发者指令",
        model: "默认模型",
        model_reasoning_effort: "默认推理强度",
        approval_policy: "默认审批策略",
        approvals_reviewer: "审批审阅者",
        sandbox_mode: "默认沙箱模式",
        sandbox_workspace_write: "工作区写入沙箱",
        personality: "默认人格",
        service_tier: "服务等级"
    };
    return overrides[key] || key;
}
function extractConfigRoot(payload) {
    if (payload && typeof payload.config === "object" && payload.config) {
        return payload.config;
    }
    if (payload && typeof payload.data === "object" && payload.data) {
        return payload.data;
    }
    if (payload && typeof payload === "object") {
        return payload;
    }
    return {};
}
function extractOrigins(payload) {
    return payload && typeof payload.origins === "object" && payload.origins
        ? payload.origins
        : {};
}
function inferSaveTarget(payload) {
    const userConfigPath = extractUserConfigPath(payload);
    const saveTargetLabel = userConfigPath ? node_path_1.default.basename(userConfigPath) : "config.toml";
    return {
        saveTargetLabel,
        saveTargetPath: userConfigPath,
        saveTargetDetail: userConfigPath
            ? `保存时会写回 ${saveTargetLabel}。`
            : "保存时会写回用户级 config.toml。"
    };
}
function inferCliCommand(configKey) {
    const dedicated = {
        model: {
            command: "codex --model <MODEL>",
            detail: "也可用短参数：codex -m <MODEL>"
        },
        sandbox_mode: {
            command: "codex --sandbox <read-only|workspace-write|danger-full-access>",
            detail: "也可用短参数：codex -s <...>"
        },
        approval_policy: {
            command: "codex --ask-for-approval <untrusted|on-failure|on-request|never>",
            detail: "也可用短参数：codex -a <...>"
        }
    };
    if (dedicated[configKey]) {
        return {
            cliCommand: dedicated[configKey].command,
            cliCommandDetail: dedicated[configKey].detail
        };
    }
    return {
        cliCommand: `codex -c '${configKey}=\"...\"'`,
        cliCommandDetail: "这是 Codex CLI 的通用配置覆盖方式。"
    };
}
function extractUserConfigPath(payload) {
    const layers = Array.isArray(payload?.layers) ? payload.layers : [];
    const userLayer = layers.find((layer) => layer?.name?.type === "user");
    return typeof userLayer?.name?.file === "string" ? userLayer.name.file : null;
}
function getPathValue(source, path) {
    const parts = path.split(".");
    let current = source;
    for (const part of parts) {
        if (!current || typeof current !== "object") {
            return undefined;
        }
        current = current[part];
    }
    return current;
}
function omit(value, keys) {
    const next = { ...value };
    for (const key of keys) {
        delete next[key];
    }
    return next;
}
