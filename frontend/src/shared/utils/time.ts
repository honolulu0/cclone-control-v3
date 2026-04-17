export function parseTimestamp(value: string | number | null | undefined): Date | null {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) {
    const date = new Date(numeric > 10_000_000_000 ? numeric : numeric * 1000);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatTimestamp(value: string | number | null | undefined): string {
  const date = parseTimestamp(value);
  if (!date) return "";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

export function formatDetailedTimestamp(value: string | number | null | undefined): string {
  const date = parseTimestamp(value);
  if (!date) return "";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(date);
}

export function relativeTime(value: string | number | null | undefined): string {
  const date = parseTimestamp(value);
  if (!date) return "";
  const diffMinutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
  if (diffMinutes < 1) return "刚刚";
  if (diffMinutes < 60) return `${diffMinutes} 分钟前`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} 小时前`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} 天前`;
}

export function threadTimeLabel(value: string | number | null | undefined): string {
  const relative = relativeTime(value);
  const absolute = formatTimestamp(value);
  if (relative && absolute) return `${relative} · ${absolute}`;
  return relative || absolute;
}
