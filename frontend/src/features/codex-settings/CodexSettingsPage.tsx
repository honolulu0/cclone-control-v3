import { useEffect, useMemo, useState } from "react";

import { SectionCard } from "../../shared/components/SectionCard";
import { useCodexSettings } from "../../shared/hooks/useCodexSettings";
import type { CodexSettingField } from "../../shared/types";

export function CodexSettingsPage() {
  const { snapshotQuery, schemaQuery, updateMutation } = useCodexSettings();
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [view, setView] = useState<"common" | "advanced" | "integrations">("common");
  const fields = snapshotQuery.data?.fields || [];
  const changedFields = fields.filter((field) => serializeFieldValue(field, draft[field.key]) !== serializeFieldValue(field, field.value));
  const writableFields = fields.filter((field) => field.editable);
  const readonlyFields = fields.filter((field) => !field.editable);
  const userConfigPath = findUserConfigPath(snapshotQuery.data?.rawConfig);

  useEffect(() => {
    const nextDraft = Object.fromEntries((snapshotQuery.data?.fields || []).map((field) => [field.key, toEditorValue(field, field.value)]));
    setDraft(nextDraft);
  }, [snapshotQuery.data]);

  const visibleFields = useMemo(() => fields.filter((field) => matchesView(field, view)), [fields, view]);
  const focusFields = useMemo(() => visibleFields.filter((field) => isFocusField(field.key)), [visibleFields]);
  const grouped = useMemo(() => {
    const groups = new Map<string, CodexSettingField[]>();
    for (const field of visibleFields.filter((field) => !isFocusField(field.key))) {
      const current = groups.get(field.group) || [];
      current.push(field);
      groups.set(field.group, current);
    }
    return groups;
  }, [visibleFields]);

  return (
    <div className="pageGrid pageGrid-settings">
      <main className="pagePane pagePane-main">
        <SectionCard eyebrow="变更摘要" title="待保存变更">
          <div className="scrollRegion listStack">
            {changedFields.length ? changedFields.map((field) => (
              <div key={field.key} className="historyRow">
                <strong>{field.label}</strong>
                <div className="listRowMeta">{groupLabel(field.group)}</div>
                <div className="listRowBody">从 {formatDisplayValue(field.value)} 改为 {formatDisplayValue(draft[field.key])}</div>
              </div>
            )) : <div className="emptyStateCard mutedText">当前没有待保存的改动。</div>}
          </div>
        </SectionCard>
        <SectionCard eyebrow="操作" title="保存与重置">
          <div className="formActions">
            <button
              type="button"
              className="denseButton denseButton-accent"
              onClick={() => {
                const patch = Object.fromEntries(
                  fields
                    .filter((field) => field.editable && serializeFieldValue(field, draft[field.key]) !== serializeFieldValue(field, field.value))
                    .map((field) => [field.key, toSubmitValue(field, draft[field.key])]),
                );
                if (Object.keys(patch).length > 0) {
                  void updateMutation.mutateAsync(patch);
                }
              }}
              disabled={updateMutation.isPending || changedFields.length === 0}
            >
              保存 Codex 设置
            </button>
            <button
              type="button"
              className="denseButton"
              onClick={() => setDraft(Object.fromEntries(fields.map((field) => [field.key, toEditorValue(field, field.value)])))}
              disabled={changedFields.length === 0}
            >
              放弃未保存变更
            </button>
          </div>
          <div className="pageHeaderMeta">
            保存只会提交“可编辑且确实发生变化”的字段。只读字段不会进入写入请求。
          </div>
        </SectionCard>
      </main>
      <aside className="pagePane pagePane-right pagePane-settingsRight">
        <SectionCard eyebrow="Codex 设置" title="设置视图">
          <div className="pageHeaderMeta">
            这里只管理 Codex 宿主真实支持的默认配置。来源只展示真实能确认的信息：具体配置文件名，或“未标注到配置文件”。保存目标只展示真实写回的用户级配置文件。
            {userConfigPath ? ` 当前用户级配置文件：${userConfigPath}` : ""}
          </div>
          <div className="chipRow">
            <button type="button" className={`navButton ${view === "common" ? "is-selected" : ""}`} onClick={() => setView("common")}>常用</button>
            <button type="button" className={`navButton ${view === "advanced" ? "is-selected" : ""}`} onClick={() => setView("advanced")}>高级</button>
            <button type="button" className={`navButton ${view === "integrations" ? "is-selected" : ""}`} onClick={() => setView("integrations")}>集成</button>
          </div>
        </SectionCard>
        {focusFields.length ? (
          <SectionCard eyebrow="重点设置" title="高频设置">
            <div className="formGrid">
              {focusFields.map((field) => (
                <FieldEditor key={field.key} field={field} draftValue={draft[field.key]} onDraftChange={(value) => setDraft((current) => ({ ...current, [field.key]: value }))} />
              ))}
            </div>
          </SectionCard>
        ) : null}
        {Array.from(grouped.entries()).map(([group, fields]) => (
          <SectionCard key={group} eyebrow="Codex 设置" title={groupLabel(group)}>
            <div className="pageHeaderMeta">{groupDescription(group)}</div>
            <div className="formGrid">
              {fields.map((field) => (
                <FieldEditor key={field.key} field={field} draftValue={draft[field.key]} onDraftChange={(value) => setDraft((current) => ({ ...current, [field.key]: value }))} />
              ))}
            </div>
          </SectionCard>
        ))}
        <SectionCard eyebrow="Codex 设置" title="默认设置总览">
          <div className="settingsSummaryGrid">
            <div className="settingsSummaryCard">
              <strong>{fields.length}</strong>
              <span>总设置项</span>
            </div>
            <div className="settingsSummaryCard">
              <strong>{writableFields.length}</strong>
              <span>可编辑</span>
            </div>
            <div className="settingsSummaryCard">
              <strong>{readonlyFields.length}</strong>
              <span>只读/未接入</span>
            </div>
            <div className="settingsSummaryCard">
              <strong>{changedFields.length}</strong>
              <span>待保存变更</span>
            </div>
          </div>
        </SectionCard>
        <SectionCard eyebrow="设置契约" title="Schema 摘要">
          <div className="metaGrid">
            <span>字段数</span><strong>{schemaQuery.data?.fields.length || 0}</strong>
            <span>可写数</span><strong>{schemaQuery.data?.fields.filter((field) => field.editable).length || 0}</strong>
            <span>只读数</span><strong>{schemaQuery.data?.fields.filter((field) => !field.editable).length || 0}</strong>
          </div>
        </SectionCard>
      </aside>
    </div>
  );
}

function FieldEditor({
  field,
  draftValue,
  onDraftChange
}: {
  field: CodexSettingField;
  draftValue: unknown;
  onDraftChange: (value: unknown) => void;
}) {
  return (
    <label className={`settingsFieldCard ${isFocusField(field.key) ? "settingsFieldCard-focus" : ""}`}>
      <div className="settingsFieldHeader">
        <span>{field.label}</span>
        <div className="settingsFieldBadges">
          <span className={`settingsBadge settingsBadge-${field.source}`}>{field.sourceLabel}</span>
          <span className={`settingsBadge ${field.editable ? "settingsBadge-editable" : "settingsBadge-readonly"}`}>{field.editable ? "可编辑" : "只读"}</span>
          {serializeFieldValue(field, draftValue) !== serializeFieldValue(field, field.value) ? <span className="settingsBadge settingsBadge-dirty">未保存</span> : null}
        </div>
      </div>
      {field.type === "textarea" || field.type === "json" ? (
        <textarea value={String(draftValue ?? "")} disabled={!field.editable} onChange={(event) => onDraftChange(event.target.value || null)} />
      ) : field.type === "checkbox" ? (
        <input type="checkbox" checked={Boolean(draftValue)} disabled={!field.editable} onChange={(event) => onDraftChange(event.target.checked)} />
      ) : field.type === "select" ? (
        <select value={String(draftValue ?? "")} disabled={!field.editable} onChange={(event) => onDraftChange(event.target.value || null)}>
          <option value="">未设置</option>
          {(field.options || []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      ) : (
        <input value={String(draftValue ?? "")} disabled={!field.editable} onChange={(event) => onDraftChange(event.target.value || null)} />
      )}
      <div className="pageHeaderMeta">
        {field.description}
        {field.key === "developer_instructions" ? " · 写回用户级 Codex 配置文件中的 developer_instructions。" : ""}
        {field.key === "personality" ? " · 写回用户级 Codex 配置文件中的 personality。" : ""}
        {field.key === "instructions" ? " · 官方 config.toml 键名是 instructions，在宿主运行时会映射到 baseInstructions。" : ""}
      </div>
      <div className="pageHeaderMeta">
        来源：{field.sourceLabel}{field.sourcePath ? ` · ${field.sourcePath}` : ""}
      </div>
      <div className="pageHeaderMeta">
        命令行：{field.cliCommand}
      </div>
      <div className="pageHeaderMeta">
        保存到：{field.saveTargetLabel}{field.saveTargetPath ? ` · ${field.saveTargetPath}` : ""}
      </div>
      <div className="pageHeaderMeta">用法：{field.usage}</div>
      {riskHint(field)}
      {fieldOptionGuide(field)}
      <div className="settingsFieldFooter">
        <span>写回键名：{field.configKey}</span>
        <span>{field.sourceDetail}</span>
        <span>{field.cliCommandDetail}</span>
        <span>{field.saveTargetDetail}</span>
        <span>当前值：{formatDisplayValue(field.value)}</span>
      </div>
    </label>
  );
}

function groupLabel(group: string): string {
  return {
    instructions: "指令层",
    model: "模型层",
    runtime: "运行层",
    behavior: "行为层"
  }[group] || group;
}

function groupDescription(group: string): string {
  return {
    instructions: "控制 Codex 默认携带的基础/开发者指令。这些项通常直接影响所有新会话的行为。",
    model: "控制默认模型与推理强度，是最直接的全局执行策略。",
    runtime: "控制审批、沙箱等运行时默认约束。未接入宿主写入能力时会保持只读。",
    behavior: "控制人格与交互行为层偏好。"
  }[group] || "";
}

function matchesView(field: CodexSettingField, view: "common" | "advanced" | "integrations"): boolean {
  if (view === "advanced") {
    return field.group === "advanced";
  }
  if (view === "integrations") {
    return field.group === "integration";
  }
  return ["instructions", "model", "runtime", "behavior"].includes(field.group);
}

function isFocusField(key: string): boolean {
  return [
    "instructions",
    "developer_instructions",
    "model",
    "model_reasoning_effort",
    "approval_policy",
    "sandbox_mode",
    "personality"
  ].includes(key);
}

function riskHint(field: CodexSettingField) {
  if (field.key === "approval_policy") {
    return <div className="settingsRiskHint">风险提示：审批策略会直接影响命令执行边界。放宽前请确认你的运行环境和审计要求。</div>;
  }
  if (field.key === "sandbox_mode") {
    return <div className="settingsRiskHint">风险提示：沙箱模式决定默认权限边界。生产环境建议优先最小权限。</div>;
  }
  if (field.key === "instructions" || field.key === "developer_instructions") {
    return <div className="settingsRiskHint">影响范围：修改后会影响新的 Codex 会话默认指令行为。</div>;
  }
  return null;
}

function fieldOptionGuide(field: CodexSettingField) {
  if (field.key !== "approval_policy" || field.type !== "select") {
    return null;
  }

  return (
    <div className="settingsOptionGuide">
      <strong>选项说明</strong>
      <div className="settingsOptionRow">
        <span>Untrusted</span>
        <span>仅自动放行安全只读命令，其他操作都要求审批。</span>
      </div>
      <div className="settingsOptionRow">
        <span>On failure</span>
        <span>先在受限环境执行，失败后再申请升级。适合兼顾效率和边界。</span>
      </div>
      <div className="settingsOptionRow">
        <span>On request</span>
        <span>由模型按需发起审批，是当前最均衡的默认策略。</span>
      </div>
      <div className="settingsOptionRow">
        <span>Never</span>
        <span>不向用户请求审批，失败直接返回模型。仅适合你完全接受自动执行时使用。</span>
      </div>
    </div>
  );
}

function findUserConfigPath(rawConfig: unknown): string | null {
  const layers = Array.isArray((rawConfig as any)?.layers) ? (rawConfig as any).layers : [];
  const userLayer = layers.find((layer: any) => layer?.name?.type === "user");
  return typeof userLayer?.name?.file === "string" ? userLayer.name.file : null;
}

function toEditorValue(field: CodexSettingField, value: unknown): string | boolean | null {
  if (field.type === "checkbox") {
    return Boolean(value);
  }
  if (field.type === "json") {
    return value == null ? "" : JSON.stringify(value, null, 2);
  }
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function toSubmitValue(field: CodexSettingField, value: unknown): unknown {
  if (field.type === "checkbox") {
    return Boolean(value);
  }
  if (field.type === "json") {
    const normalized = String(value ?? "").trim();
    return normalized ? JSON.parse(normalized) : null;
  }
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : null;
}

function serializeFieldValue(field: CodexSettingField, value: unknown): string {
  if (field.type === "checkbox") {
    return String(Boolean(value));
  }
  if (field.type === "json") {
    try {
      return JSON.stringify(typeof value === "string" ? JSON.parse(value) : value);
    } catch {
      return String(value ?? "");
    }
  }
  return String(value ?? "");
}

function formatDisplayValue(value: unknown): string {
  if (value == null || value === "") {
    return "未设置";
  }
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value);
}
