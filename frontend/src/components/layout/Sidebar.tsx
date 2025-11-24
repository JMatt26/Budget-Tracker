import { NavLink } from "react-router-dom";
import { useAuth } from "../../lib/auth";
import { Button } from "../ui/Button";
import React from "react";

const navItems = [
  { to: "/", label: "Dashboard" },
  { to: "/transactions", label: "Transactions" },
  { to: "/budgets", label: "Budgets" },
  { to: "/categories", label: "Categories" },
  { to: "/reports", label: "Reports" },
];

export const Sidebar = () => {
  const { logout } = useAuth();

  return (
    <aside className="flex h-full w-64 flex-col border-r border-slate-800 bg-slate-950/70">
      <div className="px-4 py-5 text-xl font-semibold tracking-tight text-sky-400">
        Budget App
      </div>
      <nav className="flex-1 space-y-1 px-2">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className={({ isActive }) =>
              [
                "flex items-center rounded-xl px-3 py-2 text-sm font-medium transition",
                isActive
                  ? "bg-sky-500/20 text-sky-300"
                  : "text-slate-300 hover:bg-slate-800/80 hover:text-white",
              ].join(" ")
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-slate-800 px-4 py-4">
        <Button
          variant="ghost"
          className="w-full justify-center"
          onClick={logout}
        >
          Logout
        </Button>
      </div>
    </aside>
  );
};
