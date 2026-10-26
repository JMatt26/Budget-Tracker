import React from "react";

const PATHS = {
  dashboard: "M3 11l9-7 9 7M5 9.5V20h14V9.5",
  transactions: "M4 6h16M4 12h16M4 18h10",
  budgets: "M12 3v9h9M21 12a9 9 0 1 1-9-9",
  income: "M3 7h15a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3H3zM3 7l12-4v4M16 14h2",
  categories: "M3 12V4h8l10 10-8 8zM7.5 8h.01",
  reports: "M4 20V11M10 20V5M16 20v-7M21 20H3",
  plus: "M12 5v14M5 12h14",
  close: "M6 6l12 12M18 6L6 18",
  logout: "M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10",
  chevronLeft: "M15 6l-6 6 6 6",
  chevronRight: "M9 6l6 6-6 6",
  arrowRight: "M5 12h14M13 6l6 6-6 6",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-3.5-3.5",
  edit: "M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4",
  trash: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13",
  filter: "M4 5h16M7 12h10M10 19h4",
  menu: "M4 6h16M4 12h16M4 18h16",
  download: "M12 4v11M7 10l5 5 5-5M5 20h14",
  check: "M5 12l5 5 9-10",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  sortAsc: "M12 19V5M6 11l6-6 6 6",
  sortDesc: "M12 5v14M6 13l6 6 6-6",
  logo: "M4 17l5-5 4 4 7-8",
} as const;

export type IconName = keyof typeof PATHS;

export const Icon = ({
  name,
  size = 18,
  strokeWidth = 1.9,
  className,
}: {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  className?: string;
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={name === "more" ? 3.2 : strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className={className}
  >
    <path d={PATHS[name]} />
  </svg>
);
