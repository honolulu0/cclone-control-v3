import { useEffect, useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "../../shared/api/client";
import { ListRow } from "../../shared/components/ListRow";
import { SectionCard } from "../../shared/components/SectionCard";
import type { ProfileRecord } from "../../shared/types";

export function ProfilesPage() {
  const queryClient = useQueryClient();
  const profilesQuery = useQuery({
    queryKey: ["profiles"],
    queryFn: async () => (await api.profiles()).data
  });
  const modelsQuery = useQuery({
    queryKey: ["models"],
    queryFn: api.models
  });
  const createMutation = useMutation({
    mutationFn: (body: Omit<ProfileRecord, "id" | "createdAt" | "updatedAt">) => api.createProfile(body),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["profiles"] })
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<Omit<ProfileRecord, "id" | "createdAt" | "updatedAt">> }) => api.updateProfile(id, body),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["profiles"] })
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteProfile(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["profiles"] })
  });

  const profiles = profilesQuery.data || [];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [draft, setDraft] = useState<Omit<ProfileRecord, "id" | "createdAt" | "updatedAt">>({
    name: "",
    prependText: null,
    appendText: null,
    model: null,
    reasoningEffort: null,
    approvalPolicy: null,
    sandboxMode: null,
    serviceTier: null,
    personality: null
  });
  const canSubmit = draft.name.trim().length > 0;

  const selected = profiles.find((profile) => profile.id === selectedId) || null;
  useEffect(() => {
    if (!isCreating && !selectedId && profiles[0]) setSelectedId(profiles[0].id);
  }, [isCreating, profiles, selectedId]);
  useEffect(() => {
    if (!selected) {
      setDraft({
        name: "",
        prependText: null,
        appendText: null,
        model: null,
        reasoningEffort: null,
        approvalPolicy: null,
        sandboxMode: null,
        serviceTier: null,
        personality: null
      });
      return;
    }
    setDraft({
      name: selected.name,
      prependText: selected.prependText,
      appendText: selected.appendText,
      model: selected.model,
      reasoningEffort: selected.reasoningEffort,
      approvalPolicy: selected.approvalPolicy,
      sandboxMode: selected.sandboxMode,
      serviceTier: selected.serviceTier,
      personality: selected.personality
    });
  }, [selected]);

  return (
    <div className="pageGrid">
      <main className="pagePane pagePane-main">
        <SectionCard eyebrow="发送配置" title="发送配置列表">
          <div className="formActions">
            <button
              type="button"
              className="denseButton denseButton-accent"
              onClick={() => {
                setIsCreating(true);
                setSelectedId(null);
                setDraft({
                  name: "",
                  prependText: null,
                  appendText: null,
                  model: null,
                  reasoningEffort: null,
                  approvalPolicy: null,
                  sandboxMode: null,
                  serviceTier: null,
                  personality: null
                });
              }}
            >
              新建配置
            </button>
          </div>
          <div className="scrollRegion listStack">
            {profiles.length ? profiles.map((profile) => (
              <ListRow
                key={profile.id}
                title={profile.name}
                meta={profile.model || "默认"}
                preview={[profile.reasoningEffort, profile.approvalPolicy, profile.sandboxMode].filter(Boolean).join(" · ") || "无额外运行参数"}
                selected={!isCreating && selectedId === profile.id}
                onClick={() => {
                  setIsCreating(false);
                  setSelectedId(profile.id);
                }}
              />
            )) : <div className="emptyStateCard mutedText">当前还没有发送配置，先新建一个。</div>}
          </div>
        </SectionCard>
      </main>
      <aside className="pagePane pagePane-right">
        <SectionCard eyebrow="发送配置编辑器" title={isCreating ? "新配置" : (selected?.name || "新配置")}>
          <form className="formGrid" onSubmit={(event) => {
            event.preventDefault();
            if (!canSubmit) {
              return;
            }
            const payload = {
              ...draft,
              name: draft.name.trim()
            };
            if (!isCreating && selectedId) {
              void updateMutation.mutateAsync({ id: selectedId, body: payload });
            } else {
              void createMutation.mutateAsync(payload).then((created) => {
                setIsCreating(false);
                setSelectedId(created.id);
              });
            }
          }}>
            <label><span>名称</span><input value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} /></label>
            <div className="formGridColumns">
              <label><span>模型</span><select value={draft.model || ""} onChange={(event) => setDraft((current) => ({ ...current, model: event.target.value || null }))}><option value="">默认</option>{(modelsQuery.data?.data || []).map((model: any) => <option key={model.id || model.model} value={model.model || model.id}>{model.displayName || model.model || model.id}</option>)}</select></label>
              <label><span>推理强度</span><select value={draft.reasoningEffort || ""} onChange={(event) => setDraft((current) => ({ ...current, reasoningEffort: event.target.value || null }))}><option value="">默认</option>{["minimal", "low", "medium", "high", "xhigh"].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
              <label><span>审批策略</span><select value={draft.approvalPolicy || ""} onChange={(event) => setDraft((current) => ({ ...current, approvalPolicy: event.target.value || null }))}><option value="">默认</option>{["never", "on-request"].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
              <label><span>沙箱模式</span><select value={draft.sandboxMode || ""} onChange={(event) => setDraft((current) => ({ ...current, sandboxMode: event.target.value || null }))}><option value="">默认</option>{["read-only", "workspace-write", "danger-full-access"].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
            </div>
            <div className="pageHeaderMeta">
              前置文本会在用户消息之前自动拼接，适合放长期固定的角色、约束、输出格式要求；后置文本会追加在用户消息之后，适合放结尾补充说明、检查清单或必须再次提醒的收尾约束。
            </div>
            <label><span>前置文本</span><textarea value={draft.prependText || ""} onChange={(event) => setDraft((current) => ({ ...current, prependText: event.target.value || null }))} /></label>
            <label><span>后置文本</span><textarea value={draft.appendText || ""} onChange={(event) => setDraft((current) => ({ ...current, appendText: event.target.value || null }))} /></label>
            <div className="pageHeaderMeta">名称是必填项；为空时不会提交。</div>
            <div className="formActions">
              <button type="submit" className="denseButton denseButton-accent" disabled={!canSubmit || createMutation.isPending || updateMutation.isPending}>{isCreating ? "创建配置" : "保存配置"}</button>
              {isCreating ? (
                <button
                  type="button"
                  className="denseButton"
                  onClick={() => {
                    setIsCreating(false);
                    setSelectedId(profiles[0]?.id || null);
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
