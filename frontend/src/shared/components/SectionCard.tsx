import type { PropsWithChildren } from "react";

export function SectionCard({
  eyebrow,
  title,
  children,
  cardClassName = ""
}: PropsWithChildren<{ eyebrow: string; title: string; cardClassName?: string }>) {
  return (
    <section className={`denseCard ${cardClassName}`}>
      <div className="paneHeader">
        <div>
          <div className="paneEyebrow">{eyebrow}</div>
          <h2>{title}</h2>
        </div>
      </div>
      {children}
    </section>
  );
}
