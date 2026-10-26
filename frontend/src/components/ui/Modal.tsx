import type { ReactNode } from "react";
import { useEffect } from "react";
import clsx from "clsx";
import React from "react";
import { Icon } from "./Icon";

// A dialog that either pops in the centre of the screen or slides in from
// the right as a full-height sheet. Escape and backdrop clicks close it.
export const Modal = ({
  title,
  subtitle,
  onClose,
  children,
  variant = "center",
  size = "md",
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  variant?: "center" | "sheet";
  size?: "sm" | "md" | "lg";
}) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  const sheet = variant === "sheet";

  return (
    <div
      className={clsx(
        "fixed inset-0 z-50 flex animate-fadein",
        sheet ? "justify-end" : "items-center justify-center p-4"
      )}
    >
      <button
        type="button"
        aria-label="Close dialog"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-ink/30 backdrop-blur-[2px]"
      />
      <section
        role="dialog"
        aria-modal="true"
        className={clsx(
          "relative flex flex-col bg-surface",
          sheet
            ? "h-full w-full max-w-[460px] animate-slidein shadow-sheet"
            : clsx(
                "max-h-[88vh] w-full animate-pop rounded-2xl shadow-lift",
                size === "sm" && "max-w-sm",
                size === "md" && "max-w-md",
                size === "lg" && "max-w-2xl"
              )
        )}
      >
        <header className="flex items-start justify-between gap-4 px-6 pb-2 pt-6">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-ink">{title}</h2>
            {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-line-soft text-ink transition hover:bg-line"
          >
            <Icon name="close" size={16} />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-6 pb-6 pt-2">{children}</div>
      </section>
    </div>
  );
};
