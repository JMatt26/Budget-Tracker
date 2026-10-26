import type { ReactNode } from "react";
import clsx from "clsx";
import React from "react";

// Label + control + optional hint/error, stacked.
export const Field = ({
  label,
  error,
  hint,
  children,
  className,
}: {
  label: ReactNode;
  error?: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) => (
  <label className={clsx("flex flex-col gap-1.5", className)}>
    <span className="text-[13px] font-medium text-muted">{label}</span>
    {children}
    {hint && !error && <span className="text-xs text-muted">{hint}</span>}
    {error && <span className="text-xs text-spend">{error}</span>}
  </label>
);

export const FormError = ({ children }: { children: ReactNode }) => (
  <div className="rounded-xl border border-spend/20 bg-spend-soft px-3 py-2 text-sm text-spend">
    {children}
  </div>
);

export const FormActions = ({ children }: { children: ReactNode }) => (
  <div className="flex justify-end gap-2 pt-2">{children}</div>
);
