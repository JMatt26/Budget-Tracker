import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import React from "react";

export const AppLayout = () => {
  return (
    <div className="flex h-screen bg-slate-950 text-slate-50">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <TopBar />
        <main className="flex-1 overflow-y-auto bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 px-6 py-4">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
