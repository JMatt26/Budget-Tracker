import { Link } from "react-router-dom";
import { Card, CardHeader } from "../../components/ui/Card";
import type { Income, IncomeFrequency } from "../../lib/types";
import { sumProjections, type ProjectionView } from "../../lib/incomeProjections";
import { formatMoney } from "../../lib/format";

const VIEW_LABELS: Record<ProjectionView, string> = {
  weekly: "Per week",
  monthly: "Per month",
  yearly: "Per year",
};

export const FREQUENCY_TEXT: Record<IncomeFrequency, string> = {
  weekly: "every week",
  biweekly: "every two weeks",
  monthly: "every month",
  yearly: "every year",
};

export const IncomeProjections = ({
  incomes,
  showEditLink = false,
  title = "Earnings projection",
}: {
  incomes: Income[];
  showEditLink?: boolean;
  title?: string;
}) => {
  const editLink = showEditLink ? (
    <Link to="/income" className="text-[13px] font-medium text-accent hover:text-accent-hover">
      {incomes.length ? "Edit income" : "Set up income"}
    </Link>
  ) : undefined;

  if (incomes.length === 0) {
    return (
      <Card>
        <CardHeader title={title} action={editLink} />
        <p className="text-sm text-muted">
          Add an income source to see weekly, monthly, and yearly projections.
        </p>
      </Card>
    );
  }

  const projections = sumProjections(incomes);
  const subtitle =
    incomes.length === 1
      ? `${formatMoney(incomes[0].amount)} paid ${FREQUENCY_TEXT[incomes[0].frequency]}`
      : `Combined from ${incomes.length} income sources`;

  return (
    <Card>
      <CardHeader title={title} subtitle={subtitle} action={editLink} />
      <div className="flex flex-col">
        {(Object.keys(VIEW_LABELS) as ProjectionView[]).map((key) => (
          <div
            key={key}
            className="flex items-baseline justify-between border-t border-line-soft py-3.5"
          >
            <span className="text-sm text-muted">{VIEW_LABELS[key]}</span>
            <span className="text-lg font-semibold tracking-tight text-saved">
              {formatMoney(projections[key])}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
};
