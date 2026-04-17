import { SectionCard } from "../../shared/components/SectionCard";
import type { TemplateRecord } from "../../shared/types";

export function PromptTemplatePanel({
  templates,
  isBusy,
  onAttach,
  onSend
}: {
  templates: TemplateRecord[];
  isBusy: boolean;
  onAttach: (template: TemplateRecord) => void;
  onSend: (template: TemplateRecord) => void;
}) {
  return (
    <SectionCard eyebrow="回复模板" title="回复模板">
      <div className="scrollRegion listStack">
        {templates.length
          ? templates.map((template) => (
              <div key={template.id} className="historyRow">
                <strong>{template.name || "未命名模板"}</strong>
                <div className="listRowMeta">{template.tags?.length ? template.tags.join(" · ") : "全局回复模板"}</div>
                <div className="listRowBody">{String(template.content || "").split(/\r?\n/, 1)[0] || "空模板"}</div>
                <div className="formActions">
                  <button type="button" className="denseButton" onClick={() => onAttach(template)}>附加</button>
                  <button type="button" className="denseButton denseButton-accent" onClick={() => onSend(template)} disabled={isBusy}>发送</button>
                </div>
              </div>
            ))
          : <div className="emptyStateCard mutedText">还没有可用的回复模板。</div>}
      </div>
    </SectionCard>
  );
}
