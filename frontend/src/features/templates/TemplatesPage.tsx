import { useEffect, useState } from "react";

import { ListRow } from "../../shared/components/ListRow";
import { SectionCard } from "../../shared/components/SectionCard";
import { usePromptTemplates } from "../../shared/hooks/usePromptTemplates";
import type { TemplateRecord } from "../../shared/types";

export function TemplatesPage() {
  const { templatesQuery, createMutation, updateMutation, deleteMutation } = usePromptTemplates();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [draft, setDraft] = useState({ name: "", tags: "", content: "" });
  const templates = templatesQuery.data || [];
  const selected = templates.find((item) => item.id === selectedId) || null;
  const canSubmit = draft.name.trim().length > 0 && draft.content.trim().length > 0;

  useEffect(() => {
    if (!isCreating && !selectedId && templates[0]) {
      setSelectedId(templates[0].id);
    }
  }, [isCreating, selectedId, templates]);

  useEffect(() => {
    if (!selected) {
      setDraft({ name: "", tags: "", content: "" });
      return;
    }
    setDraft({
      name: selected.name,
      tags: selected.tags.join(", "),
      content: selected.content
    });
  }, [selected]);

  return (
    <div className="pageGrid">
      <main className="pagePane pagePane-main">
        <SectionCard eyebrow="回复模板库" title="回复模板">
          <div className="formActions">
            <button
              type="button"
              className="denseButton denseButton-accent"
              onClick={() => {
                setIsCreating(true);
                setSelectedId(null);
                setDraft({ name: "", tags: "", content: "" });
              }}
            >
              新建模板
            </button>
          </div>
          <div className="scrollRegion listStack">
            {templates.length ? templates.map((template) => (
              <ListRow
                key={template.id}
                title={template.name}
                meta={`${template.tags.length} 个标签`}
                preview={template.content}
                selected={!isCreating && selectedId === template.id}
                onClick={() => {
                  setIsCreating(false);
                  setSelectedId(template.id);
                }}
              />
            )) : <div className="emptyStateCard mutedText">当前还没有回复模板，先新建一个。</div>}
          </div>
        </SectionCard>
      </main>
      <aside className="pagePane pagePane-right">
        <SectionCard eyebrow="回复模板编辑器" title={isCreating ? "新模板" : (selected?.name || "新模板")}>
          <form className="formGrid" onSubmit={(event) => {
            event.preventDefault();
            if (!canSubmit) {
              return;
            }
            const payload = {
              name: draft.name.trim(),
              content: draft.content.trim(),
              tags: draft.tags.split(",").map((item) => item.trim()).filter(Boolean)
            };
            if (!isCreating && selectedId) {
              void updateMutation.mutateAsync({ id: selectedId, body: payload });
            } else {
              void createMutation.mutateAsync(payload).then((created: TemplateRecord) => {
                setIsCreating(false);
                setSelectedId(created.id);
              });
            }
          }}>
            <label><span>名称</span><input value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} /></label>
            <label><span>标签</span><input value={draft.tags} onChange={(event) => setDraft((current) => ({ ...current, tags: event.target.value }))} /></label>
            <label><span>内容</span><textarea value={draft.content} onChange={(event) => setDraft((current) => ({ ...current, content: event.target.value }))} /></label>
            <div className="pageHeaderMeta">名称和内容是必填项；为空时不会提交。</div>
            <div className="formActions">
              <button type="submit" className="denseButton denseButton-accent" disabled={!canSubmit || createMutation.isPending || updateMutation.isPending}>{isCreating ? "创建模板" : "保存模板"}</button>
              {isCreating ? (
                <button
                  type="button"
                  className="denseButton"
                  onClick={() => {
                    setIsCreating(false);
                    setSelectedId(templates[0]?.id || null);
                  }}
                >
                  取消新建
                </button>
              ) : null}
              {!isCreating && selectedId ? <button type="button" className="denseButton" onClick={() => void deleteMutation.mutateAsync(selectedId).then(() => setSelectedId(null))}>删除</button> : null}
            </div>
          </form>
        </SectionCard>
      </aside>
    </div>
  );
}
