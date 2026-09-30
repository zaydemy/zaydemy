import type { ReactNode } from "react";

/** A settings-style card: title row with optional meta and action, then content. */
export function Section({
  title,
  meta,
  action,
  children,
}: {
  title: string;
  meta?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-card border border-line bg-card shadow-card">
      <div className="flex min-h-12 items-center gap-3 border-b border-line px-4 py-2.5">
        <h2 className="text-[15px] font-medium">{title}</h2>
        {meta ? <span className="text-[12px] text-muted">{meta}</span> : null}
        {action ? <div className="ms-auto">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="text-[13px] leading-snug text-danger">
      {children}
    </p>
  );
}
