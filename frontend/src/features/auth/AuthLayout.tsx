import type { ReactNode } from "react";
import React from "react";
import { Brand } from "../../components/layout/Sidebar";

export const AuthLayout = ({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}) => (
  <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-canvas px-4 py-12">
    <Brand />
    <div className="w-full max-w-md animate-rise rounded-3xl border border-line bg-surface p-7 shadow-lift sm:p-9">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
      <p className="mb-7 mt-1.5 text-sm text-muted">{subtitle}</p>
      {children}
    </div>
    <p className="text-sm text-muted">{footer}</p>
  </div>
);
