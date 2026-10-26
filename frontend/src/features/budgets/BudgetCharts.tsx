import { useState } from "react";
import clsx from "clsx";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Cell,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardHeader } from "../../components/ui/Card";
import { ProgressBar, budgetTone, TONE_TEXT } from "../../components/ui/Progress";
import { categoryColor, formatMoney } from "../../lib/format";

const UNCATEGORIZED_COLOR = "#98A2B3";
const AXIS_TICK = { fill: "#667085", fontSize: 11 };

const EmptyState = ({ children }: { children: string }) => (
  <div className="flex h-56 items-center justify-center rounded-xl border border-dashed border-line bg-canvas/50 px-6">
    <p className="max-w-xs text-center text-sm text-muted">{children}</p>
  </div>
);

const TooltipShell = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="min-w-[150px] rounded-xl border border-line bg-surface px-3.5 py-3 shadow-lift">
    <p className="mb-1.5 text-[13px] font-semibold text-ink">{title}</p>
    <div className="flex flex-col gap-1">{children}</div>
  </div>
);

const TooltipRow = ({ color, label, value }: { color: string; label: string; value: string }) => (
  <div className="flex items-center justify-between gap-4 text-xs">
    <span className="flex items-center gap-1.5 text-muted">
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
    <span className="font-medium text-ink">{value}</span>
  </div>
);

// ---------------------------------------------------------------------------
// Expense breakdown: donut + ranked list, linked by hover.
// ---------------------------------------------------------------------------

export type BreakdownRow = {
  key: string;
  name: string;
  total: number;
  color: string;
};

export const toBreakdownRows = (
  items: { category_id: number | null; category_name: string; total: number | string }[]
): BreakdownRow[] =>
  items
    .map((item) => ({
      key: String(item.category_id ?? "uncategorized"),
      name: item.category_name,
      total: Number(item.total),
      color:
        item.category_id == null
          ? UNCATEGORIZED_COLOR
          : categoryColor({ id: item.category_id, color: null }),
    }))
    .filter((row) => row.total > 0)
    .sort((a, b) => b.total - a.total);

export const ExpenseBreakdownCard = ({
  rows,
  subtitle,
}: {
  rows: BreakdownRow[];
  subtitle?: string;
}) => {
  const [hovered, setHovered] = useState<string | null>(null);
  const total = rows.reduce((sum, r) => sum + r.total, 0);
  const active = rows.find((r) => r.key === hovered) ?? null;

  return (
    <Card>
      <CardHeader title="Expense breakdown" subtitle={subtitle ?? "Where your spending went, by category"} />
      {rows.length === 0 ? (
        <EmptyState>No expenses in this period yet. Log an expense to this budget to see the breakdown.</EmptyState>
      ) : (
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center">
          <div className="relative h-52 w-52 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={rows}
                  dataKey="total"
                  nameKey="name"
                  innerRadius="68%"
                  outerRadius="100%"
                  paddingAngle={rows.length > 1 ? 2 : 0}
                  cornerRadius={4}
                  stroke="none"
                  animationDuration={700}
                  onMouseEnter={(_, i) => setHovered(rows[i]?.key ?? null)}
                  onMouseLeave={() => setHovered(null)}
                >
                  {rows.map((r) => (
                    <Cell
                      key={r.key}
                      fill={r.color}
                      fillOpacity={hovered && hovered !== r.key ? 0.3 : 1}
                      style={{ transition: "fill-opacity 0.2s ease", outline: "none" }}
                    />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-8 text-center">
              <span className="max-w-full truncate text-xs text-muted">
                {active ? active.name : "Total spent"}
              </span>
              <span className="text-xl font-semibold tracking-tight text-ink">
                {formatMoney(active ? active.total : total)}
              </span>
              {active && total > 0 && (
                <span className="text-xs font-medium text-muted">
                  {((active.total / total) * 100).toFixed(1)}%
                </span>
              )}
            </div>
          </div>

          <ul className="flex w-full min-w-0 flex-1 flex-col gap-1" onMouseLeave={() => setHovered(null)}>
            {rows.map((r) => {
              const pct = total > 0 ? (r.total / total) * 100 : 0;
              return (
                <li
                  key={r.key}
                  onMouseEnter={() => setHovered(r.key)}
                  className={clsx(
                    "rounded-lg px-2.5 py-2 transition",
                    hovered === r.key ? "bg-canvas" : "",
                    hovered && hovered !== r.key ? "opacity-50" : ""
                  )}
                >
                  <div className="flex items-center gap-2 text-sm">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ backgroundColor: r.color }} />
                    <span className="min-w-0 flex-1 truncate text-ink">{r.name}</span>
                    <span className="font-medium text-ink">{formatMoney(r.total)}</span>
                    <span className="w-12 text-right text-xs text-muted">{pct.toFixed(1)}%</span>
                  </div>
                  <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-line-soft">
                    <div
                      className="h-full rounded-full transition-[width] duration-500 ease-out"
                      style={{ width: `${pct}%`, backgroundColor: r.color }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Card>
  );
};

// ---------------------------------------------------------------------------
// Category spending against each category's limit.
// ---------------------------------------------------------------------------

export type LimitRow = {
  key: string;
  name: string;
  color: string;
  spent: number;
  limit: number;
};

export const CategoryLimitsCard = ({
  rows,
  subtitle,
}: {
  rows: LimitRow[];
  subtitle?: string;
}) => (
  <Card>
    <CardHeader title="Spending vs category limits" subtitle={subtitle ?? "How much of each category's limit is used"} />
    {rows.length === 0 ? (
      <EmptyState>No categories added yet. Add a category with a limit to track it here.</EmptyState>
    ) : (
      <ul className="flex flex-col gap-4">
        {rows.map((r) => {
          const pct = r.limit > 0 ? (r.spent / r.limit) * 100 : 0;
          const tone = budgetTone(r.spent, r.limit);
          const diff = r.limit - r.spent;
          return (
            <li key={r.key} className="flex flex-col gap-1.5">
              <div className="flex items-baseline gap-2 text-sm">
                <span className="h-2.5 w-2.5 shrink-0 translate-y-px rounded-[3px]" style={{ backgroundColor: r.color }} />
                <span className="min-w-0 flex-1 truncate font-medium text-ink">{r.name}</span>
                <span className="font-semibold text-ink">{formatMoney(r.spent)}</span>
                <span className="text-xs text-muted">/ {formatMoney(r.limit)}</span>
              </div>
              <ProgressBar value={pct} tone={tone} />
              <span className={clsx("text-xs", TONE_TEXT[tone])}>
                {r.limit <= 0
                  ? "No limit set"
                  : diff < 0
                  ? `Over by ${formatMoney(-diff)}`
                  : `${formatMoney(diff)} left · ${Math.round(pct)}% used`}
              </span>
            </li>
          );
        })}
      </ul>
    )}
  </Card>
);

// ---------------------------------------------------------------------------
// Cumulative timeline: spending and investing against an even pace. Days
// after today are projected and drawn dotted.
// ---------------------------------------------------------------------------

// Dotted stroke used for everything projected past today.
const PROJECTED_DASH = "1 6";
const yTick = (v: number) => {
  const abs = Math.abs(v);
  const text = abs >= 1000 ? `$${(abs / 1000).toFixed(abs % 1000 === 0 ? 0 : 1)}k` : `$${abs}`;
  return v < 0 ? `−${text}` : text;
};

const ProjectedKey = () => (
  <span className="flex items-center gap-1.5">
    <span className="h-0 w-4 border-t-2 border-dotted border-muted" /> Projected
  </span>
);

export type TimelinePoint = {
  date: string; // YYYY-MM-DD
  label: string;
  spent: number | null;
  invested: number | null;
  spentProjected: number | null;
  investedProjected: number | null;
  pace: number;
};

export const SpendingTimelineCard = ({
  points,
  title,
  subtitle,
}: {
  points: TimelinePoint[];
  title: string;
  subtitle?: string;
}) => {
  const hasActivity = points.some((p) => (p.spent ?? 0) > 0 || (p.invested ?? 0) > 0);
  const hasProjection = points.some((p) => p.spent === null);
  return (
    <Card>
      <CardHeader title={title} subtitle={subtitle} />
      {!hasActivity ? (
        <EmptyState>Nothing logged in this period yet. Spending and investments will build up here day by day.</EmptyState>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-muted">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-spend" /> Spent
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-invest" /> Invested
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-0 w-4 border-t-2 border-dashed border-muted/70" /> Even pace to limit
            </span>
            {hasProjection && <ProjectedKey />}
          </div>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={points} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="spentFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#C2410C" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="#C2410C" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#EEF0F3" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={AXIS_TICK}
                  tickLine={false}
                  axisLine={{ stroke: "#E4E7EC" }}
                  minTickGap={24}
                  tickMargin={8}
                />
                <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={52} tickFormatter={yTick} />
                <Tooltip
                  cursor={{ stroke: "#98A2B3", strokeDasharray: "3 3" }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const p = payload[0].payload as TimelinePoint;
                    const projected = p.spent === null;
                    return (
                      <TooltipShell title={projected ? `${p.label} · projected` : p.label}>
                        <TooltipRow color="#C2410C" label="Spent" value={formatMoney(p.spent ?? p.spentProjected ?? 0)} />
                        <TooltipRow color="#6741D9" label="Invested" value={formatMoney(p.invested ?? p.investedProjected ?? 0)} />
                        <TooltipRow color="#98A2B3" label="Even pace" value={formatMoney(p.pace)} />
                      </TooltipShell>
                    );
                  }}
                />
                <Line
                  dataKey="pace"
                  stroke="#98A2B3"
                  strokeWidth={1.5}
                  strokeDasharray="5 5"
                  dot={false}
                  activeDot={false}
                  isAnimationActive={false}
                />
                <Area
                  dataKey="spent"
                  type="monotone"
                  stroke="#C2410C"
                  strokeWidth={2.5}
                  fill="url(#spentFill)"
                  dot={false}
                  activeDot={{ r: 5, strokeWidth: 2, stroke: "#fff" }}
                  animationDuration={700}
                />
                <Line
                  dataKey="spentProjected"
                  stroke="#C2410C"
                  strokeWidth={2.5}
                  strokeDasharray={PROJECTED_DASH}
                  strokeLinecap="round"
                  dot={false}
                  activeDot={false}
                  isAnimationActive={false}
                />
                <Line
                  dataKey="invested"
                  type="monotone"
                  stroke="#6741D9"
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 5, strokeWidth: 2, stroke: "#fff" }}
                  animationDuration={700}
                />
                <Line
                  dataKey="investedProjected"
                  stroke="#6741D9"
                  strokeWidth={2.5}
                  strokeDasharray={PROJECTED_DASH}
                  strokeLinecap="round"
                  dot={false}
                  activeDot={false}
                  isAnimationActive={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </Card>
  );
};

// ---------------------------------------------------------------------------
// One metric (spent, invested or saved) against its target: clickable tiles
// pick the metric, the chart shows actual vs an even pace to the target.
// ---------------------------------------------------------------------------

export type MetricTile = {
  key: string;
  label: string;
  color: string;
  actual: number;
  projected: number;
  target: number | null;
};

export const MetricTiles = ({
  tiles,
  selected,
  onSelect,
}: {
  tiles: MetricTile[];
  selected: string;
  onSelect: (key: string) => void;
}) => (
  <div role="group" aria-label="Metric" className="grid gap-3 sm:grid-cols-3">
    {tiles.map((t) => {
      const active = t.key === selected;
      return (
        <button
          key={t.key}
          type="button"
          aria-pressed={active}
          onClick={() => onSelect(t.key)}
          className={clsx(
            "flex flex-col gap-1 rounded-2xl border bg-surface p-4 text-left transition",
            active ? "shadow-pop" : "border-line hover:border-muted/40"
          )}
          style={active ? { borderColor: t.color, boxShadow: `0 0 0 1px ${t.color}` } : undefined}
        >
          <span className="flex items-center gap-1.5 text-xs font-medium text-muted">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: t.color }} />
            {t.label}
          </span>
          <span className="text-lg font-semibold tracking-tight text-ink">
            {formatMoney(t.actual)}
            <span className="text-sm font-normal text-muted">
              {" "}
              / {t.target != null ? formatMoney(t.target) : "no target"}
            </span>
          </span>
          <span className="text-xs text-muted">Projected {formatMoney(t.projected)}</span>
        </button>
      );
    })}
  </div>
);

export type MetricPoint = {
  date: string;
  label: string;
  actual: number | null;
  projected: number | null;
  target: number | null;
};

export const MetricTargetCard = ({
  points,
  label,
  color,
  subtitle,
  target,
}: {
  points: MetricPoint[];
  label: string;
  color: string;
  subtitle?: string;
  target: number | null;
}) => {
  const hasProjection = points.some((p) => p.actual === null);
  const gradientId = `metricFill-${label}`;
  return (
    <Card>
      <CardHeader
        title={`${label} vs target`}
        subtitle={subtitle}
        action={
          target == null ? (
            <span className="text-xs text-muted">Set a target in the Targets tab to compare.</span>
          ) : undefined
        }
      />
      <div className="mb-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} /> Actual
        </span>
        {target != null && (
          <span className="flex items-center gap-1.5">
            <span className="h-0 w-4 border-t-2 border-dashed border-muted/70" /> Even pace to target
          </span>
        )}
        {hasProjection && <ProjectedKey />}
      </div>
      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={points} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.24} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#EEF0F3" vertical={false} />
            <XAxis
              dataKey="label"
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={{ stroke: "#E4E7EC" }}
              minTickGap={24}
              tickMargin={8}
            />
            <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={52} tickFormatter={yTick} />
            <Tooltip
              cursor={{ stroke: "#98A2B3", strokeDasharray: "3 3" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload as MetricPoint;
                const projected = p.actual === null;
                return (
                  <TooltipShell title={projected ? `${p.label} · projected` : p.label}>
                    <TooltipRow
                      color={color}
                      label={projected ? "Projected" : label}
                      value={formatMoney(p.actual ?? p.projected ?? 0)}
                    />
                    {p.target != null && (
                      <TooltipRow color="#98A2B3" label="Target pace" value={formatMoney(p.target)} />
                    )}
                  </TooltipShell>
                );
              }}
            />
            {target != null && (
              <Line
                dataKey="target"
                stroke="#98A2B3"
                strokeWidth={1.5}
                strokeDasharray="5 5"
                dot={false}
                activeDot={false}
                isAnimationActive={false}
              />
            )}
            <Area
              dataKey="actual"
              type="monotone"
              stroke={color}
              strokeWidth={2.5}
              fill={`url(#${gradientId})`}
              dot={false}
              activeDot={{ r: 5, strokeWidth: 2, stroke: "#fff" }}
              animationDuration={700}
            />
            <Line
              dataKey="projected"
              stroke={color}
              strokeWidth={2.5}
              strokeDasharray={PROJECTED_DASH}
              strokeLinecap="round"
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: "#fff" }}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
};
