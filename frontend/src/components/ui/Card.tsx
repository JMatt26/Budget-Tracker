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
      "rounded-2xl border border-line bg-surface p-5 sm:p-6",
      className
    )}
    {...props}
  >
    {children}
  </div>
);

export const CardHeader = ({
  title,
  subtitle,
  action,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  className?: string;
}) => (
  <div
    className={clsx(
      "mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1",
      className
    )}
  >
    <div>
      <h2 className="text-base font-semibold text-ink">{title}</h2>
      {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
    </div>
    {action}
  </div>
);

export const Skeleton = ({ className }: { className?: string }) => (
  <div className={clsx("animate-pulse rounded-2xl bg-line-soft", className)} />
);
