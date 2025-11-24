import React from "react";
import { useLocation } from "react-router-dom";

const titles: Record<string, string> = {
  "/": "Dashboard",
  "/transactions": "Transactions",
  "/budgets": "Budgets",
  "/categories": "Categories",
  "/reports": "Reports",
};

export const TopBar = () => {
  const location = useLocation();
  const title =
    titles[location.pathname] ?? "Budget App";

  return (
    <header className="flex items-center justify-between border-b border-slate-800 bg-slate-950/60 px-6 py-4">
      <h1 className="text-xl font-semibold text-slate-50">
        {title}
      </h1>
      <span className="text-sm text-slate-400">
        Personal finance, without the chaos.
      </span>
    </header>
  );
};
