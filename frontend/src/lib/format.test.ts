import { afterEach, describe, expect, it, vi } from "vitest";
import {
  categoryColor,
  dayLabel,
  describeBudgetPeriod,
  formatMoney,
  formatShortDate,
  formatSignedMoney,
  paletteColor,
  toLocalISODate,
} from "./format";

describe("formatMoney", () => {
  it("groups thousands and always shows cents", () => {
    expect(formatMoney(1234.5)).toBe("$1,234.50");
    expect(formatMoney(0)).toBe("$0.00");
    expect(formatMoney(1_000_000)).toBe("$1,000,000.00");
  });

  it("accepts the numeric strings the API sends", () => {
    expect(formatMoney("12")).toBe("$12.00");
    expect(formatMoney("2000.00")).toBe("$2,000.00");
  });

  it("treats missing values as zero", () => {
    expect(formatMoney(null)).toBe("$0.00");
    expect(formatMoney(undefined)).toBe("$0.00");
  });

  it("puts a real minus sign in front of negatives", () => {
    expect(formatMoney(-5)).toBe("−$5.00");
    expect(formatMoney("-1234.5")).toBe("−$1,234.50");
  });

  it("rounds to cents", () => {
    expect(formatMoney(0.005 + 1)).toBe("$1.01");
    expect(formatMoney(2.499)).toBe("$2.50");
  });
});

describe("formatSignedMoney", () => {
  it("signs by transaction type", () => {
    expect(formatSignedMoney(12, "income")).toBe("+$12.00");
    expect(formatSignedMoney(12, "expense")).toBe("−$12.00");
    expect(formatSignedMoney(12, "investment")).toBe("$12.00");
  });

  it("ignores the sign of the stored amount", () => {
    expect(formatSignedMoney(-12, "income")).toBe("+$12.00");
    expect(formatSignedMoney("-12", "expense")).toBe("−$12.00");
  });
});

describe("categoryColor", () => {
  it("prefers the category's own color", () => {
    expect(categoryColor({ id: 3, color: "#123456" })).toBe("#123456");
  });

  it("picks a stable palette color from the id otherwise", () => {
    const a = categoryColor({ id: 7, color: null });
    expect(categoryColor({ id: 7, color: null })).toBe(a);
    expect(categoryColor({ id: 7 + 10, color: null })).toBe(a); // palette has 10 entries
    expect(categoryColor({ id: 8, color: null })).not.toBe(a);
  });

  it("falls back to the index when there is no category", () => {
    expect(categoryColor(null, 2)).toBe(paletteColor(2));
    expect(categoryColor(undefined)).toBe(paletteColor(0));
  });

  it("handles negative ids without going out of range", () => {
    expect(categoryColor({ id: -3, color: null })).toMatch(/^#[0-9A-F]{6}$/i);
  });

  it("wraps the palette", () => {
    expect(paletteColor(0)).toBe(paletteColor(10));
  });
});

describe("dates", () => {
  afterEach(() => vi.useRealTimers());

  it("toLocalISODate zero-pads month and day", () => {
    expect(toLocalISODate(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(toLocalISODate(new Date(2026, 11, 31))).toBe("2026-12-31");
  });

  it("toLocalISODate uses the local day, not the UTC day", () => {
    // 22:30 in Toronto on Oct 26 is already Oct 27 in UTC
    const lateEvening = new Date(2026, 9, 26, 22, 30);
    expect(toLocalISODate(lateEvening)).toBe("2026-10-26");
  });

  it("formatShortDate renders the calendar day without timezone drift", () => {
    const out = formatShortDate("2026-10-01T00:00:00");
    expect(out).toContain("2026");
    expect(out).toContain("1");
    expect(formatShortDate("2026-10-01")).toBe(out);
  });

  it("formatShortDate tolerates empty and invalid input", () => {
    expect(formatShortDate(null)).toBe("");
    expect(formatShortDate(undefined)).toBe("");
    expect(formatShortDate("not-a-date")).toBe("not-a-date");
  });

  it("dayLabel names today and yesterday", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 26, 12, 0));
    expect(dayLabel("2026-10-26")).toMatch(/^Today · /);
    expect(dayLabel("2026-10-25")).toMatch(/^Yesterday · /);
    expect(dayLabel("2026-10-20")).not.toMatch(/Today|Yesterday/);
  });

  it("dayLabel handles yesterday across a month boundary", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 1, 9, 0));
    expect(dayLabel("2026-10-31")).toMatch(/^Yesterday · /);
  });
});

describe("describeBudgetPeriod", () => {
  it("recognises a calendar month, including February in a leap year", () => {
    expect(describeBudgetPeriod("2026-10-01", "2026-10-31")).toBe("Monthly");
    expect(describeBudgetPeriod("2028-02-01", "2028-02-29")).toBe("Monthly");
    expect(describeBudgetPeriod("2027-02-01", "2027-02-28")).toBe("Monthly");
  });

  it("recognises a seven day week", () => {
    expect(describeBudgetPeriod("2026-10-19", "2026-10-25")).toBe("Weekly");
  });

  it("ignores a time suffix on the dates", () => {
    expect(describeBudgetPeriod("2026-10-01T00:00:00", "2026-10-31T00:00:00")).toBe("Monthly");
  });

  it("labels anything else as a date range", () => {
    const label = describeBudgetPeriod("2026-10-03", "2026-10-20");
    expect(label).toContain("–");
    expect(label).not.toBe("Monthly");
    expect(label).not.toBe("Weekly");
  });

  it("does not call a partial month 'Monthly'", () => {
    expect(describeBudgetPeriod("2026-10-01", "2026-10-30")).not.toBe("Monthly");
    expect(describeBudgetPeriod("2026-10-02", "2026-10-31")).not.toBe("Monthly");
  });
});
