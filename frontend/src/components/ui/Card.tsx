import type { ReactNode } from "react";
import clsx from "clsx";
import React from "react";

export const Card = ({
  className,
  children,
}: {
  className?: string;
  children?: ReactNode;
}) => (
  <div
    className={clsx(
      "rounded-2xl border border-slate-800 bg-slate-900/60 p-4 shadow-lg shadow-slate-900/40 backdrop-blur",
      className
    )}
  >
    {children}
  </div>
);
