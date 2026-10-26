import { Outlet, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { QuickAddProvider, useQuickAdd } from "./QuickAdd";
import { Icon } from "../ui/Icon";
import React from "react";

const FloatingAdd = () => {
  const { openTransaction } = useQuickAdd();
  return (
    <button
      type="button"
      onClick={() => openTransaction(null)}
      aria-label="Add transaction"
      className="fixed bottom-5 right-5 z-30 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-white shadow-[0_10px_24px_rgba(52,81,209,0.35)] transition hover:bg-accent-hover lg:hidden"
    >
      <Icon name="plus" size={24} strokeWidth={2.4} />
    </button>
  );
};

export const AppLayout = () => {
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  return (
    <QuickAddProvider>
      <div className="flex h-screen bg-canvas text-ink">
        <div className="hidden lg:block">
          <Sidebar />
        </div>

        {menuOpen && (
          <div className="fixed inset-0 z-40 flex animate-fadein lg:hidden">
            <button
              type="button"
              aria-label="Close menu"
              onClick={() => setMenuOpen(false)}
              className="absolute inset-0 bg-ink/30"
            />
            <div className="relative h-full animate-slidein">
              <Sidebar onNavigate={() => setMenuOpen(false)} />
            </div>
          </div>
        )}

        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 pb-24 pt-6 sm:px-8 lg:pb-16 lg:pt-8">
            <TopBar onMenu={() => setMenuOpen(true)} />
            <div key={location.pathname} className="animate-rise">
              <Outlet />
            </div>
          </div>
        </main>
        <FloatingAdd />
      </div>
    </QuickAddProvider>
  );
};
