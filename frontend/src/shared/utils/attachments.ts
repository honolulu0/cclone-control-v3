import type { AttachmentDraft } from "../types";

export function mapAttachmentsForSend(attachments: AttachmentDraft[]): Array<Record<string, unknown>> {
  return attachments.map((attachment) => (
    attachment.kind === "image"
      ? {
          kind: "image",
          source: "local",
          name: attachment.name,
          path: attachment.storedPath,
          mediaType: attachment.mediaType
        }
      : {
          kind: "file",
          name: attachment.name,
          path: attachment.storedPath
        }
  ));
}
