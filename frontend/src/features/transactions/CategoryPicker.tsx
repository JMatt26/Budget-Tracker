import React from "react";
import clsx from "clsx";
import type { Category, TransactionType } from "../../lib/types";
import { categoryColor } from "../../lib/format";

// Chips for picking any number of categories. "None" clears the selection.
export const CategoryPicker = ({
  categories,
  type,
  value,
  onChange,
}: {
  categories: Category[];
  type: TransactionType;
  value: number[];
  onChange: (ids: number[]) => void;
}) => {
  const [showAll, setShowAll] = React.useState(false);

  // Show categories that match the chosen type first, plus whichever
  // categories are already selected so editing never hides them.
  const visible = categories.filter((c) => c.type === type || value.includes(c.id));
  const others = categories.filter((c) => !visible.includes(c));
  const chips = showAll ? [...visible, ...others] : visible;

  const toggle = (id: number) =>
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);

  return (
    <div className="flex flex-col gap-2.5">
      <span className="text-[13px] font-medium text-muted">
        Categories
        <span className="font-normal"> · pick any</span>
      </span>
      <div className="flex flex-wrap gap-2">
        <CategoryChip
          label="None"
          color="#98A2B3"
          active={value.length === 0}
          onClick={() => onChange([])}
        />
        {chips.map((c) => (
          <CategoryChip
            key={c.id}
            label={c.name}
            color={categoryColor(c)}
            active={value.includes(c.id)}
            onClick={() => toggle(c.id)}
          />
        ))}
        {others.length > 0 && (
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="min-h-[38px] rounded-full px-3 text-[13px] font-medium text-accent hover:bg-accent-soft"
          >
            {showAll ? "Show fewer" : `+${others.length} more`}
          </button>
        )}
      </div>
    </div>
  );
};

const CategoryChip = ({
  label,
  color,
  active,
  onClick,
}: {
  label: string;
  color: string;
  active: boolean;
  onClick: () => void;
}) => (
  <button
    type="button"
    aria-pressed={active}
    onClick={onClick}
    className={clsx(
      "flex min-h-[38px] items-center gap-2 rounded-full border-[1.5px] px-3.5 text-[13px] font-medium text-ink transition",
      active ? "" : "border-line bg-surface hover:border-ink/25"
    )}
    style={active ? { borderColor: color, backgroundColor: `${color}14` } : undefined}
  >
    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
    {label}
  </button>
);
