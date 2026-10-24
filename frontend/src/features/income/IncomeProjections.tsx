import { useState } from "react";
import { Card } from "../../components/ui/Card";
import type { Income } from "../../lib/types";
import { computeProjections, type ProjectionView } from "../../lib/incomeProjections";

const VIEW_LABELS: Record<ProjectionView, string> = {
  weekly: "Weekly",
  monthly: "Monthly",
  yearly: "Yearly",
};

export const IncomeProjections = ({ income }: { income: Income | null }) => {
  const [view, setView] = useState<ProjectionView>("monthly");

  if (!income) {
    return (
      <Card>
        <p className="text-xs uppercase tracking-wide text-slate-400">
          Earnings projection
        </p>
        <p className="mt-2 text-sm text-slate-400">
          Set up your income to see weekly, monthly, and yearly projections.
        </p>
      </Card>
    );
  }

  const projections = computeProjections(Number(income.amount), income.frequency);

  return (
    <Card className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-wide text-slate-400">
          Earnings projection
        </p>
        <div className="flex gap-1 rounded-lg bg-slate-800/80 p-1">
          {(Object.keys(VIEW_LABELS) as ProjectionView[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setView(key)}
              className={[
                "rounded-md px-2.5 py-1 text-xs font-medium transition",
                view === key
                  ? "bg-sky-500 text-white"
                  : "text-slate-300 hover:bg-slate-700/80 hover:text-white",
              ].join(" ")}
            >
              {VIEW_LABELS[key]}
            </button>
          ))}
        </div>
      </div>
      <p className="text-3xl font-semibold text-emerald-400">
        ${projections[view].toFixed(2)}
        <span className="ml-1 text-sm font-normal text-slate-400">
          / {view.replace("ly", "")}
        </span>
      </p>
    </Card>
  );
};
