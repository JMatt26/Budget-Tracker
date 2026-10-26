import type { Category, TransactionType } from "./types";

export const formatMoney = (value: number | string | null | undefined) => {
  const n = Number(value ?? 0);
  const abs = Math.abs(n).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${n < 0 ? "−" : ""}$${abs}`;
};

// "+$12.00" for money in, "−$12.00" for money out, plain for investments.
export const formatSignedMoney = (
  value: number | string,
  type: TransactionType
) => {
  const base = formatMoney(Math.abs(Number(value ?? 0)));
  if (type === "income") return `+${base}`;
  if (type === "expense") return `−${base}`;
  return base;
};

export const TYPE_META: Record<
  TransactionType,
  { label: string; text: string; bg: string; dot: string }
> = {
  income: { label: "Saved", text: "text-saved", bg: "bg-saved-soft", dot: "bg-saved" },
  expense: { label: "Expense", text: "text-spend", bg: "bg-spend-soft", dot: "bg-spend" },
  investment: { label: "Investment", text: "text-invest", bg: "bg-invest-soft", dot: "bg-invest" },
};

export const TYPE_LABELS: Record<TransactionType, string> = {
  income: "Income",
  expense: "Expense",
  investment: "Investment",
};

const PALETTE = [
  "#1D4ED8",
  "#0E7A6B",
  "#C2410C",
  "#A21CAF",
  "#6741D9",
  "#B45309",
  "#475467",
  "#15803D",
  "#BE123C",
  "#0369A1",
];

// Uses the category's stored color when it has one, else a stable pick
// from the palette so the same category always gets the same color.
export const categoryColor = (
  category?: Pick<Category, "id" | "color"> | null,
  fallbackIndex = 0
) => {
  if (category?.color) return category.color;
  const idx = category ? category.id : fallbackIndex;
  return PALETTE[Math.abs(idx) % PALETTE.length];
};

export const paletteColor = (index: number) => PALETTE[index % PALETTE.length];

export const formatShortDate = (iso: string | null | undefined) => {
  if (!iso) return "";
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
};

export const toLocalISODate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

// Human label for a transaction's day: "Today", "Yesterday" or a weekday + date.
export const dayLabel = (iso: string) => {
  const key = iso.slice(0, 10);
  const today = toLocalISODate(new Date());
  const y = new Date();
  y.setDate(y.getDate() - 1);
  const d = new Date(`${key}T00:00:00`);
  const pretty = d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  if (key === today) return `Today · ${pretty}`;
  if (key === toLocalISODate(y)) return `Yesterday · ${pretty}`;
  return pretty;
};

// Monthly / Weekly / date range, inferred from a budget's dates.
export const describeBudgetPeriod = (startISO: string, endISO: string) => {
  const start = new Date(`${startISO.slice(0, 10)}T00:00:00`);
  const end = new Date(`${endISO.slice(0, 10)}T00:00:00`);
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  const lastOfMonth = new Date(start.getFullYear(), start.getMonth() + 1, 0);
  if (start.getDate() === 1 && end.getTime() === lastOfMonth.getTime()) return "Monthly";
  if (days === 7) return "Weekly";
  const fmt = (d: Date) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${fmt(start)} – ${fmt(end)}`;
};
