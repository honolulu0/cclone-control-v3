export function ListRow({
  title,
  meta,
  preview,
  status,
  selected,
  onClick
}: {
  title: string;
  meta?: string;
  preview: string;
  status?: string;
  selected?: boolean;
  onClick?: () => void;
}) {
  return (
    <button type="button" className={`listRow ${selected ? "is-selected" : ""}`} onClick={onClick}>
      <div className="listRowHeader">
        <div className="listRowTitle">{title}</div>
        {status ? <span className={`statusPill ${status === "运行时" ? "status-running" : ""}`}>{status}</span> : null}
      </div>
      {meta ? <div className="listRowMeta">{meta}</div> : null}
      <div className="listRowBody">{preview}</div>
    </button>
  );
}
