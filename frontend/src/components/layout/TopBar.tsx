import React from "react";
import { useLocation } from "react-router-dom";
import { Icon } from "../ui/Icon";

const titles: Record<string, { title: string; subtitle: string }> = {
  "/": { title: "Dashboard", subtitle: "Personal finance, without the chaos." },
  "/transactions": { title: "Transactions", subtitle: "Everything coming in and going out" },
  "/budgets": { title: "Budgets", subtitle: "Plan your spending and track your limits" },
  "/income": { title: "Income", subtitle: "Every source, on its own schedule" },
  "/categories": { title: "Categories", subtitle: "Organize your money" },
  "/reports": { title: "Reports", subtitle: "Totals and breakdowns for any range" },
};

const resolveTitle = (pathname: string) => {
  if (titles[pathname]) return titles[pathname];
  if (pathname.startsWith("/budgets/"))
    return { title: "Budget", subtitle: "Budget details" };
  if (pathname.startsWith("/projections/"))
    return { title: "Projections", subtitle: "Based on this month's activity" };
  return { title: "Budget App", subtitle: "Personal finance, without the chaos." };
};

export const TopBar = ({ onMenu }: { onMenu: () => void }) => {
  const location = useLocation();
  const { title, subtitle } = resolveTitle(location.pathname);

  return (
    <header className="flex items-center gap-3">
      <button
        type="button"
        onClick={onMenu}
        aria-label="Open menu"
        className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-line bg-surface text-ink lg:hidden"
      >
        <Icon name="menu" />
      </button>
      <div className="min-w-0">
        <p className="text-[13px] text-muted">{subtitle}</p>
        <h1 className="truncate text-2xl font-semibold tracking-tight text-ink sm:text-[28px]">
          {title}
        </h1>
      </div>
    </header>
  );
};
