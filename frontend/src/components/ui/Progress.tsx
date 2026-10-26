import clsx from "clsx";
import React from "react";
import { TYPE_META } from "../../lib/format";
import type { TransactionType } from "../../lib/types";

export type BudgetTone = "ok" | "near" | "over";

export const budgetTone = (spent: number, limit: number): BudgetTone => {
  if (limit > 0 && spent > limit) return "over";
  if (limit > 0 && spent / limit >= 0.85) return "near";
  return "ok";
};

const TONE_BAR: Record<BudgetTone, string> = {
  ok: "bg-accent",
  near: "bg-warn",
  over: "bg-spend",
};

export const TONE_TEXT: Record<BudgetTone, string> = {
  ok: "text-muted",
  near: "text-warn",
  over: "text-spend",
};

export const ProgressBar = ({
  value,
  tone = "ok",
  className,
  barClassName,
}: {
  value: number;
  tone?: BudgetTone;
  className?: string;
  barClassName?: string;
}) => (
  <div
    className={clsx("h-2 w-full overflow-hidden rounded-full bg-line-soft", className)}
    role="progressbar"
    aria-valuemin={0}
    aria-valuemax={100}
    aria-valuenow={Math.round(value)}
  >
    <div
      className={clsx(
        "h-full rounded-full transition-[width] duration-500 ease-out",
        barClassName ?? TONE_BAR[tone]
      )}
      style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
    />
  </div>
);

export const ProgressRing = ({
  value,
  tone = "ok",
  size = 148,
  label,
}: {
  value: number;
  tone?: BudgetTone;
  size?: number;
  label: string;
}) => {
  const stroke = 14;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value));
  const color = { ok: "#3451D1", near: "#B45309", over: "#C2410C" }[tone];
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#F0F2F5" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${(circ * pct) / 100} ${circ}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: "stroke-dasharray 0.6s cubic-bezier(0.2,0.8,0.2,1)" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-semibold text-ink">{Math.round(value)}%</span>
        <span className="text-xs text-muted">used</span>
      </div>
    </div>
  );
};

export const TypeBadge = ({ type }: { type: TransactionType }) => {
  const meta = TYPE_META[type];
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium capitalize",
        meta.bg,
        meta.text
      )}
    >
      {type}
    </span>
  );
};

export const CategoryAvatar = ({
  name,
  color,
  size = "md",
}: {
  name?: string | null;
  color: string;
  size?: "sm" | "md" | "lg";
}) => (
  <span
    aria-hidden="true"
    className={clsx(
      "flex shrink-0 items-center justify-center font-semibold",
      size === "sm" && "h-9 w-9 rounded-[10px] text-[13px]",
      size === "md" && "h-10 w-10 rounded-xl text-sm",
      size === "lg" && "h-11 w-11 rounded-xl text-[15px]"
    )}
    style={{ backgroundColor: `${color}1A`, color }}
  >
    {(name ?? "?").trim().charAt(0).toUpperCase() || "?"}
  </span>
);
