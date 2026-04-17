import type { AttachmentDraft, ProfileRecord, ThreadSummary, WorkspaceSummary } from "../../shared/types";
import { SectionCard } from "../../shared/components/SectionCard";

export function ComposerPanel({
  sendTargetMode,
  onSendTargetModeChange,
  selectedProfileId,
  profiles,
  onSelectProfile,
  planMode,
  onTogglePlanMode,
  composeMessage,
  onComposeMessageChange,
  onComposeKeyDown,
  onComposePaste,
  isComposeDragActive,
  onComposeDragOver,
  onComposeDragLeave,
  onComposeDrop,
  isUploading,
  isSending,
  composeAttachments,
  onRemoveAttachment,
  composeCwdOverride,
  onComposeCwdOverrideChange,
  selectedThread,
  selectedWorkspace,
  canSend,
  onSend
}: {
  sendTargetMode: "selected" | "new";
  onSendTargetModeChange: (next: "selected" | "new") => void;
  selectedProfileId: string | null;
  profiles: ProfileRecord[];
  onSelectProfile: (id: string | null) => void;
  planMode: boolean;
  onTogglePlanMode: () => void;
  composeMessage: string;
  onComposeMessageChange: (value: string) => void;
  onComposeKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onComposePaste: (event: React.ClipboardEvent<HTMLTextAreaElement>) => void;
  isComposeDragActive: boolean;
  onComposeDragOver: (event: React.DragEvent<HTMLDivElement>) => void;
  onComposeDragLeave: (event: React.DragEvent<HTMLDivElement>) => void;
  onComposeDrop: (event: React.DragEvent<HTMLDivElement>) => void;
  isUploading: boolean;
  isSending: boolean;
  composeAttachments: AttachmentDraft[];
  onRemoveAttachment: (id: string) => void;
  composeCwdOverride: string;
  onComposeCwdOverrideChange: (value: string) => void;
  selectedThread: ThreadSummary | null;
  selectedWorkspace: WorkspaceSummary | null;
  canSend: boolean;
  onSend: () => void;
}) {
  return (
    <SectionCard eyebrow="发送工作台" title="发送工作区">
      <div className="chipRow">
        <button type="button" className={`navButton ${sendTargetMode === "selected" ? "is-selected" : ""}`} onClick={() => onSendTargetModeChange("selected")}>发送到选中线程</button>
        <button type="button" className={`navButton ${sendTargetMode === "new" ? "is-selected" : ""}`} onClick={() => onSendTargetModeChange("new")}>新建线程</button>
      </div>
      <div className="formGrid">
        <div className="formGridColumns">
          <label>
            <span>发送配置</span>
            <select value={selectedProfileId || ""} onChange={(event) => onSelectProfile(event.target.value || null)}>
              <option value="">默认</option>
              {profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
            </select>
          </label>
          <label className="toggleField">
            <span>协作模式</span>
            <button type="button" className={`toggleSwitch ${planMode ? "is-checked" : ""}`} aria-pressed={planMode} onClick={onTogglePlanMode}>
              <span className="toggleSwitchLabel">计划模式</span>
              <span className="toggleSwitchTrack"><span className="toggleSwitchThumb" /></span>
            </button>
          </label>
        </div>
        <label>
          <span>消息</span>
          <div className={`composeDropZone ${isComposeDragActive ? "is-active" : ""}`} onDragOver={onComposeDragOver} onDragLeave={onComposeDragLeave} onDrop={onComposeDrop}>
            <textarea value={composeMessage} onChange={(event) => onComposeMessageChange(event.target.value)} onKeyDown={onComposeKeyDown} onPaste={onComposePaste} placeholder="输入要发送的消息。Enter 发送，Shift+Enter 换行。" />
            <div className="composeDropHint">{isUploading ? "正在上传附件…" : "支持拖放文件/图片，或直接粘贴图片。"}</div>
            {composeAttachments.length ? (
              <div className="composeAttachmentList">
                {composeAttachments.map((attachment) => (
                  <div key={attachment.id} className="composeAttachmentCard">
                    {attachment.previewUrl ? <img className="composeAttachmentPreview" src={attachment.previewUrl} alt={attachment.name} /> : <div className="composeAttachmentFile">文件</div>}
                    <div className="composeAttachmentMeta">
                      <strong>{attachment.name}</strong>
                      <span>{attachment.kind === "image" ? "图片" : "文件"}</span>
                    </div>
                    <button type="button" className="denseButton" onClick={() => onRemoveAttachment(attachment.id)}>移除</button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </label>
        <label>
          <span>项目地址（cwd）</span>
          <input value={composeCwdOverride} onChange={(event) => onComposeCwdOverrideChange(event.target.value)} placeholder={selectedThread?.cwd || selectedWorkspace?.cwd || "默认使用当前选中线程/工作区的 cwd；也可手动填写"} />
        </label>
      </div>
      <div className="pageHeaderMeta">
        新建线程时，项目地址只会使用当前选中线程/工作区的 `cwd`，或你手动填写的地址。
      </div>
      <div className="formActions">
        <button type="button" className="denseButton denseButton-accent" onClick={onSend} disabled={isSending || isUploading || !canSend}>
          {isSending ? "发送中…" : isUploading ? "上传中…" : "发送到 Codex"}
        </button>
      </div>
    </SectionCard>
  );
}
