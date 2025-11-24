import type { ButtonHTMLAttributes, ReactNode } from "react";
import clsx from "clsx";
import React from "react";

interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "ghost";
  children: ReactNode;
}

export const Button = ({
  variant = "primary",
  className,
  children,
  ...rest
}: ButtonProps) => {
  return (
    <button
      className={clsx(
        "inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition",
        "focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 focus:ring-offset-slate-950",
        variant === "primary" &&
          "bg-sky-500 text-white hover:bg-sky-600",
        variant === "ghost" &&
          "bg-transparent text-slate-200 hover:bg-slate-800",
        className
      )}
      {...rest}
    >
      {children}
    </button>
  );
};
