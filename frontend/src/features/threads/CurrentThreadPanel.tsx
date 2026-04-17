import { useEffect, useRef } from "react";

import { SectionCard } from "../../shared/components/SectionCard";
import { flattenTimeline } from "../../shared/utils/message-blocks";
import type { TurnRecord } from "../../shared/types";

export function CurrentThreadPanel({
  title,
  turns,
  isLoading = false,
}: {
  title: string;
  turns: TurnRecord[] | undefined;
  isLoading?: boolean;
}) {
  const timeline = flattenTimeline(turns);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const distanceToBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    if (distanceToBottom < 120) {
      container.scrollTop = container.scrollHeight;
    }
  }, [timeline.length]);

  return (
    <SectionCard eyebrow="当前线程" title={title} cardClassName="threadPanelCard">
      <div ref={scrollRef} className="scrollRegion threadTimeline threadPanelBody">
        {timeline.length
          ? timeline.map((entry, index) => {
              const previous = timeline[index - 1];
              const showRoundMeta = !previous || previous.turnId !== entry.turnId;
              return (
                <div key={entry.key} className="threadTimelineItem">
                  {showRoundMeta ? (
                    <div className="threadRoundMeta">
                      <span>{entry.turnLabel}</span>
                      <span className={formatTimelineStatusClassName(entry.turnStatus)}>{formatTimelineStatusLabel(entry.turnStatus)}</span>
                    </div>
                  ) : null}
                  <div className={`turnMessage turnMessage-${entry.tone}${entry.isPlaceholder ? " turnMessage-placeholder" : ""}`}>
                    <div className="turnMessageHeader">
                      <div className="turnMessageLabel">{entry.roleLabel}</div>
                      <div className="turnMessageTime">{entry.turnMeta}</div>
                    </div>
                    <div className="turnMessageBlocks">
                      {entry.blocks.map((block, blockIndex) =>
                        block.type === "image"
                          ? <img key={`${entry.itemId}-${blockIndex}`} className="turnImage" src={block.src} alt={block.alt || "线程图片"} loading="lazy" />
                          : <div key={`${entry.itemId}-${blockIndex}`} className="turnTextBlock">{block.text}</div>,
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          : <div className="emptyStateCard mutedText">{isLoading ? "正在加载线程内容…" : "选中一个线程后，这里显示最近的消息流。"}</div>}
      </div>
    </SectionCard>
  );
}

function formatTimelineStatusLabel(value: string): string {
  switch (value.trim().toLowerCase()) {
    case "accepted":
      return "已接受";
    case "queued":
      return "排队中";
    case "pending":
    case "waiting":
      return "等待中";
    case "started":
    case "running":
    case "streaming":
      return "进行中";
    case "completed":
    case "complete":
    case "succeeded":
    case "success":
      return "已完成";
    case "failed":
    case "error":
      return "失败";
    default:
      return value;
  }
}

function formatTimelineStatusClassName(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (["accepted", "queued", "pending", "waiting"].includes(normalized)) {
    return "statusPill status-warning";
  }
  if (["started", "running", "streaming"].includes(normalized)) {
    return "statusPill status-running";
  }
  if (["completed", "complete", "succeeded", "success"].includes(normalized)) {
    return "statusPill status-complete";
  }
  if (["failed", "error"].includes(normalized)) {
    return "statusPill status-error";
  }
  return "statusPill";
}
