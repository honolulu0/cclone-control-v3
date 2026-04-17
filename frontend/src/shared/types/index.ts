export interface WorkspaceSummary {
  id: string;
  name: string;
  cwd: string;
  updatedAt: string | number | null;
  threadCount: number;
}

export interface ThreadSummary {
  id: string;
  threadId: string;
  title: string;
  preview: string;
  cwd: string | null;
  updatedAt: string | number | null;
  createdAt: string | number | null;
  state: "active" | "archived";
  runtimeStatus: string | null;
}

export interface TemplateRecord {
  id: string;
  name: string;
  content: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ProfileRecord {
  id: string;
  name: string;
  prependText: string | null;
  appendText: string | null;
  model: string | null;
  reasoningEffort: string | null;
  approvalPolicy: string | null;
  sandboxMode: string | null;
  serviceTier: string | null;
  personality: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface HistoryRecord {
  id: string;
  workspaceId: string | null;
  threadId: string;
  turnId: string | null;
  requestBody: unknown;
  status: string;
  createdAt: string;
}

export interface TurnItem {
  id?: string;
  type?: string;
  text?: string;
  content?: unknown;
  [key: string]: unknown;
}

export interface TurnRecord {
  id?: string;
  turnId?: string;
  status?: string;
  error?: unknown;
  createdAt?: string | number | null;
  updatedAt?: string | number | null;
  items?: TurnItem[];
  [key: string]: unknown;
}

export interface ThreadDetail {
  id?: string;
  threadId?: string;
  cwd?: string | null;
  status?: unknown;
  createdAt?: string | number | null;
  updatedAt?: string | number | null;
  turns?: TurnRecord[];
  [key: string]: unknown;
}

export interface ThreadRequestRecord {
  id: string;
  method: string;
  kind: "commandApproval" | "fileApproval" | "userInput" | "mcpElicitation" | "other";
  threadId: string | null;
  turnId: string | null;
  itemId: string | null;
  createdAt: string;
  params: Record<string, unknown>;
}

export interface AttachmentDraft {
  id: string;
  name: string;
  kind: "image" | "file";
  storedPath: string;
  mediaType: string | null;
  previewUrl: string | null;
}

export interface CodexSettingField {
  key: string;
  configKey: string;
  group: "instructions" | "model" | "runtime" | "behavior" | "integration" | "advanced";
  label: string;
  description: string;
  usage: string;
  type: "text" | "textarea" | "select" | "checkbox" | "json";
  editable: boolean;
  source: "file" | "untracked";
  sourceLabel: string;
  sourcePath: string | null;
  sourceDetail: string;
  saveTargetLabel: string;
  saveTargetPath: string | null;
  saveTargetDetail: string;
  cliCommand: string;
  cliCommandDetail: string;
  value: unknown;
  options?: Array<{ label: string; value: string }>;
  validation?: { required?: boolean };
}

export interface CodexSettingsSnapshot {
  fields: CodexSettingField[];
  rawConfig: unknown;
}

export interface CodexSettingsSchema {
  fields: Array<Omit<CodexSettingField, "value" | "source" | "sourceLabel" | "sourcePath" | "sourceDetail">>;
}
