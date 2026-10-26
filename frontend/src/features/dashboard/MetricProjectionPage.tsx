import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Card, Skeleton } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Icon } from "../../components/ui/Icon";
import { Segmented } from "../../components/ui/Segmented";
import { computeProjections, type ProjectionView } from "../../lib/incomeProjections";
import { fetchMonthSummary, readMetric } from "../../lib/reports-api";
import { formatMoney } from "../../lib/format";
import { METRIC_CONFIG, type MetricKey } from "./metrics";

const VIEW_OPTIONS: { value: ProjectionView; label: string }[] = [
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
];

export const MetricProjectionPage = () => {
  const { metric } = useParams<{ metric: string }>();
  const navigate = useNavigate();
  const [view, setView] = useState<ProjectionView>("monthly");

  const config = METRIC_CONFIG[metric as MetricKey];

  const { data, isLoading } = useQuery({
    queryKey: ["summary-month"],
    queryFn: fetchMonthSummary,
    enabled: !!config,
  });

  if (!config) {
    return (
      <Card>
        <p className="text-sm text-spend">Unknown projection metric.</p>
        <Button variant="secondary" className="mt-4" onClick={() => navigate("/")}>
          Back to dashboard
        </Button>
      </Card>
    );
  }

  if (isLoading || !data) {
    return <Skeleton className="h-48" />;
  }

  const monthlyAmount = readMetric(data, config.field);
  const projections = computeProjections(monthlyAmount, "monthly");
  const color = config.field === "net" ? (monthlyAmount >= 0 ? "text-saved" : "text-spend") : config.color;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="secondary" size="sm" onClick={() => navigate("/")}>
          <Icon name="chevronLeft" size={16} />
          Back to dashboard
        </Button>
      </div>

      <Card className="flex flex-col gap-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-ink">{config.label} projections</h2>
            <p className="mt-0.5 text-sm text-muted">Based on this month's activity</p>
          </div>
          <Segmented label="Projection period" options={VIEW_OPTIONS} value={view} onChange={setView} />
        </div>
        <p className={`text-5xl font-semibold tracking-tight ${color}`}>
          {formatMoney(projections[view])}
          <span className="ml-2 text-base font-normal text-muted">
            / {view.replace("ly", "")}
          </span>
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          {VIEW_OPTIONS.map((opt) => (
            <div key={opt.value} className="rounded-xl bg-canvas px-4 py-3">
              <p className="text-xs text-muted">{opt.label}</p>
              <p className="mt-1 text-lg font-semibold text-ink">{formatMoney(projections[opt.value])}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
};
