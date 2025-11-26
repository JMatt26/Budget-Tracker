import type { ReactNode, HTMLAttributes } from "react";
import clsx from "clsx";
import React from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  className?: string;
  children?: ReactNode;
}

export const Card = ({ className, children, ...props }: CardProps) => (
  <div
    className={clsx(
      "rounded-2xl border border-slate-800 bg-slate-900/60 p-4 shadow-lg shadow-slate-900/40 backdrop-blur",
      className
    )}
    {...props}
  >
    {children}
  </div>
);
