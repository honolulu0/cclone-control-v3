import { useEffect, useRef, useState } from "react";

import { api } from "../api/client";
import type { AttachmentDraft } from "../types";

export function useAttachmentUploads() {
  const [attachments, setAttachments] = useState<AttachmentDraft[]>([]);
  const [isDragActive, setIsDragActive] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const attachmentsRef = useRef<AttachmentDraft[]>([]);

  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  useEffect(() => () => {
    disposeAttachments(attachmentsRef.current);
  }, []);

  async function addFiles(files: Iterable<File>) {
    const normalized = [...files].filter((file) => file instanceof File && file.size > 0);
    if (!normalized.length) return;

    setIsUploading(true);
    try {
      const uploaded = await Promise.all(normalized.map(async (file) => {
        const result = await api.uploadFile(file);
        return {
          id: result.id,
          name: result.name,
          kind: result.kind,
          storedPath: result.storedPath,
          mediaType: result.mediaType,
          previewUrl: result.kind === "image" ? URL.createObjectURL(file) : null
        } satisfies AttachmentDraft;
      }));
      setAttachments((current) => [...current, ...uploaded]);
    } finally {
      setIsUploading(false);
    }
  }

  function removeAttachment(id: string) {
    setAttachments((current) => {
      const target = current.find((item) => item.id === id);
      if (target?.previewUrl) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return current.filter((item) => item.id !== id);
    });
  }

  function clearAttachments() {
    disposeAttachments(attachmentsRef.current);
    setAttachments([]);
  }

  function handleDragOver(event: React.DragEvent) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setIsDragActive(true);
  }

  function handleDragLeave(event: React.DragEvent) {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
      return;
    }
    setIsDragActive(false);
  }

  function handleDrop(event: React.DragEvent) {
    event.preventDefault();
    setIsDragActive(false);
    void addFiles(extractFiles(event.dataTransfer));
  }

  function handlePaste(event: React.ClipboardEvent) {
    const files = extractFiles(event.clipboardData);
    if (!files.length) return;
    event.preventDefault();
    void addFiles(files);
  }

  return {
    attachments,
    isDragActive,
    isUploading,
    setAttachments,
    clearAttachments,
    removeAttachment,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handlePaste
  };
}

function extractFiles(dataTransfer: DataTransfer | null): File[] {
  if (!dataTransfer) return [];
  const direct = Array.from(dataTransfer.files || []).filter((file) => file instanceof File && file.size > 0);
  if (direct.length) return direct;
  return Array.from(dataTransfer.items || [])
    .filter((item) => item.kind === "file")
    .map((item) => item.getAsFile())
    .filter((file): file is File => file instanceof File && file.size > 0);
}

function disposeAttachments(attachments: AttachmentDraft[]) {
  for (const attachment of attachments) {
    if (attachment.previewUrl) {
      URL.revokeObjectURL(attachment.previewUrl);
    }
  }
}
