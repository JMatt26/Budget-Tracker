import clsx from "clsx";
import React from "react";

export type SegmentOption<T extends string> = { value: T; label: string };

// iOS-style segmented control: a pill track with the active option raised.
export const Segmented = <T extends string>({
  options,
  value,
  onChange,
  label,
  size = "md",
  fullWidth = false,
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  size?: "sm" | "md";
  fullWidth?: boolean;
}) => (
  <div
    role="group"
    aria-label={label}
    className={clsx(
      "gap-1 rounded-xl bg-line-soft p-1",
      fullWidth ? "grid" : "inline-flex"
    )}
    style={
      fullWidth
        ? { gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }
        : undefined
    }
  >
    {options.map((opt) => {
      const active = opt.value === value;
      return (
        <button
          key={opt.value}
          type="button"
          aria-pressed={active}
          onClick={() => onChange(opt.value)}
          className={clsx(
            "rounded-[9px] font-medium transition",
            size === "sm" ? "min-h-[30px] px-3 text-xs" : "min-h-[36px] px-4 text-[13px]",
            active
              ? "bg-surface text-ink shadow-pop"
              : "text-muted hover:text-ink"
          )}
        >
          {opt.label}
        </button>
      );
    })}
  </div>
);

// Rounded filter chips; the active one is filled.
export const ChipGroup = <T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) => (
  <div role="group" aria-label={label} className="flex flex-wrap gap-2">
    {options.map((opt) => {
      const active = opt.value === value;
      return (
        <button
          key={opt.value}
          type="button"
          aria-pressed={active}
          onClick={() => onChange(opt.value)}
          className={clsx(
            "min-h-[38px] rounded-full border px-4 text-[13px] font-medium transition",
            active
              ? "border-ink bg-ink text-white"
              : "border-line bg-surface text-ink hover:border-ink/30"
          )}
        >
          {opt.label}
        </button>
      );
    })}
  </div>
);

// Underlined tab strip.
export const Tabs = <T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) => (
  <div role="tablist" aria-label={label} className="flex gap-6 border-b border-line">
    {options.map((opt) => {
      const active = opt.value === value;
      return (
        <button
          key={opt.value}
          type="button"
          role="tab"
          aria-selected={active}
          onClick={() => onChange(opt.value)}
          className={clsx(
            "-mb-px min-h-[44px] border-b-2 px-0.5 text-sm font-medium transition",
            active
              ? "border-accent text-ink"
              : "border-transparent text-muted hover:text-ink"
          )}
        >
          {opt.label}
        </button>
      );
    })}
  </div>
);
