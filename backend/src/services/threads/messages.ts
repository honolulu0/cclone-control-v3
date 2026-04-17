import type { ProfileRecord, V3Store } from "../../db/store";
import type { HostClient } from "../host/client";

export async function sendMessage({
  hostClient,
  store,
  workspaceId,
  threadId,
  cwdOverride,
  message,
  attachments,
  profile,
  planMode
}: {
  hostClient: HostClient;
  store: V3Store;
  workspaceId?: string | null;
  threadId?: string | null;
  cwdOverride?: string | null;
  message?: string | null;
  attachments?: Array<Record<string, unknown>>;
  profile?: ProfileRecord | null;
  planMode?: boolean;
}): Promise<any> {
  const textParts = [
    normalizeOptionalString(profile?.prependText),
    normalizeOptionalString(message),
    normalizeOptionalString(profile?.appendText)
  ].filter(Boolean);

  const payload = {
    threadId: normalizeOptionalString(threadId),
    message: textParts.join("\n\n") || null,
    cwd: normalizeOptionalString(cwdOverride) || normalizeOptionalString(workspaceId) || null,
    model: normalizeOptionalString(profile?.model),
    reasoningEffort: normalizeOptionalString(profile?.reasoningEffort),
    approvalPolicy: normalizeOptionalString(profile?.approvalPolicy),
    sandbox: normalizeOptionalString(profile?.sandboxMode),
    serviceTier: normalizeOptionalString(profile?.serviceTier),
    personality: normalizeOptionalString(profile?.personality),
    waitForCompletion: false,
    planMode: planMode === true,
    attachments: attachments || []
  };

  const result = payload.threadId
    ? await hostClient.sendThreadMessage(payload.threadId, payload)
    : await hostClient.chat(payload);

  store.recordHistory({
    workspaceId: normalizeOptionalString(workspaceId),
    threadId: result?.threadId || payload.threadId || "",
    turnId: normalizeOptionalString(result?.turnId),
    requestBody: payload,
    status: normalizeOptionalString(result?.status) || "accepted"
  });

  return result;
}

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
