"use client";

import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, type ReactNode } from "react";

/**
 * Modal dialog on the native <dialog> element: focus trapping, Escape and the
 * backdrop come from the browser. Controlled with `open` / `onClose`.
 */
export function Dialog({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const t = useTranslations("Common");
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      // A click on the backdrop lands on the dialog element itself.
      onClick={(event) => event.target === ref.current && onClose()}
      aria-labelledby="dialog-title"
      className="m-auto w-[min(100vw-2rem,480px)] rounded-card border border-line bg-card p-0 text-body shadow-layer backdrop:bg-[rgb(23_23_23/40%)]"
    >
      <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
        <h2 id="dialog-title" className="text-[15px] font-medium">
          {title}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("close")}
          className="flex size-8 items-center justify-center rounded-chip text-muted hover:bg-subtle-2 hover:text-body"
        >
          <X size={16} strokeWidth={1.75} />
        </button>
      </div>
      <div className="p-5">{open ? children : null}</div>
    </dialog>
  );
}
