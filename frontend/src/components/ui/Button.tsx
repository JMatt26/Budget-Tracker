import type { ButtonHTMLAttributes, ReactNode } from "react";
import clsx from "clsx";
import React from "react";

interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "dark" | "danger";
  size?: "sm" | "md" | "lg";
  children: ReactNode;
}

export const Button = ({
  variant = "primary",
  size = "md",
  className,
  children,
  type = "button",
  ...rest
}: ButtonProps) => {
  return (
    <button
      type={type}
      className={clsx(
        "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
        "disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" && "min-h-[36px] px-3 text-[13px]",
        size === "md" && "min-h-[42px] px-4 text-sm",
        size === "lg" && "min-h-[50px] px-5 text-[15px] font-semibold",
        variant === "primary" && "bg-accent text-white hover:bg-accent-hover",
        variant === "dark" && "bg-ink text-white hover:bg-ink-2",
        variant === "secondary" &&
          "border border-line bg-surface text-ink hover:bg-canvas",
        variant === "ghost" && "bg-transparent text-ink-2 hover:bg-line-soft",
        variant === "danger" && "bg-transparent text-spend hover:bg-spend-soft",
        className
      )}
      {...rest}
    >
      {children}
    </button>
  );
};

export const IconButton = ({
  label,
  className,
  children,
  type = "button",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  children: ReactNode;
}) => (
  <button
    type={type}
    aria-label={label}
    title={label}
    className={clsx(
      "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted transition hover:bg-line-soft hover:text-ink",
      "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40",
      className
    )}
    {...rest}
  >
    {children}
  </button>
);
