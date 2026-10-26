import { NavLink } from "react-router-dom";
import clsx from "clsx";
import { useAuth } from "../../lib/auth";
import { Icon, type IconName } from "../ui/Icon";
import { useQuickAdd } from "./QuickAdd";
import React from "react";

const navItems: { to: string; label: string; icon: IconName }[] = [
  { to: "/", label: "Dashboard", icon: "dashboard" },
  { to: "/transactions", label: "Transactions", icon: "transactions" },
  { to: "/budgets", label: "Budgets", icon: "budgets" },
  { to: "/income", label: "Income", icon: "income" },
  { to: "/categories", label: "Categories", icon: "categories" },
  { to: "/reports", label: "Reports", icon: "reports" },
];

export const Brand = () => (
  <div className="flex items-center gap-2.5 px-2">
    <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-accent text-white">
      <Icon name="logo" size={18} strokeWidth={2.2} />
    </span>
    <span className="text-[17px] font-semibold tracking-tight text-ink">
      Budget
    </span>
  </div>
);

export const Sidebar = ({ onNavigate }: { onNavigate?: () => void }) => {
  const { logout } = useAuth();
  const { openTransaction } = useQuickAdd();

  return (
    <aside className="flex h-full w-64 flex-col gap-5 border-r border-line bg-surface px-3.5 py-5">
      <Brand />

      <button
        type="button"
        onClick={() => {
          onNavigate?.();
          openTransaction(null);
        }}
        className="group flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-ink text-sm font-medium text-white transition hover:bg-ink-2"
      >
        <Icon name="plus" size={16} strokeWidth={2.2} />
        Add transaction
        <kbd className="ml-1 rounded border border-white/20 px-1.5 text-[11px] font-normal text-white/70">
          N
        </kbd>
      </button>

      <nav aria-label="Main" className="flex flex-1 flex-col gap-0.5">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            onClick={onNavigate}
            className={({ isActive }) =>
              clsx(
                "flex min-h-[44px] items-center gap-3 rounded-[10px] px-3 text-sm font-medium transition",
                isActive
                  ? "bg-accent-soft text-accent"
                  : "text-ink-2 hover:bg-line-soft"
              )
            }
          >
            <Icon name={item.icon} />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-line pt-3">
        <button
          type="button"
          onClick={logout}
          className="flex min-h-[44px] w-full items-center gap-3 rounded-[10px] px-3 text-sm font-medium text-ink-2 transition hover:bg-line-soft"
        >
          <Icon name="logout" />
          Log out
        </button>
      </div>
    </aside>
  );
};
