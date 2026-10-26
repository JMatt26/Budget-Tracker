import { describe, expect, it } from "vitest";
import type { Transaction } from "../../lib/types";
import {
  TARGET_METRICS,
  buildDailySeries,
  splitActualProjected,
  toLocalDateString,
} from "./projection";

const tx = (date: string, type: Transaction["type"], amount: number): Transaction => ({
  id: Math.floor(Math.random() * 1e9),
  amount,
  date,
  type,
});

const OCT = ["2026-10-01", "2026-10-10"] as const;

describe("buildDailySeries", () => {
  const transactions = [
    tx("2026-10-01", "income", 1000),
    tx("2026-10-02", "expense", 50),
    tx("2026-10-03", "investment", 30),
    tx("2026-10-04", "expense", 50),
  ];

  it("has one entry per day of the period, inclusive", () => {
    const s = buildDailySeries(transactions, ...OCT, 2000, "2026-10-05");
    expect(s.days).toHaveLength(10);
    expect(s.days[0]).toBe("2026-10-01");
    expect(s.days[9]).toBe("2026-10-10");
    for (const key of ["spent", "invested", "saved"] as const) {
      expect(s.values[key]).toHaveLength(10);
    }
  });

  it("accumulates actual totals up to today", () => {
    const s = buildDailySeries(transactions, ...OCT, 2000, "2026-10-05");
    expect(s.todayIndex).toBe(4);
    expect(s.values.spent.slice(0, 5)).toEqual([0, 50, 50, 100, 100]);
    expect(s.values.invested.slice(0, 5)).toEqual([0, 0, 30, 30, 30]);
    // saved = earned - spent - invested
    expect(s.values.saved[4]).toBe(1000 - 100 - 30);
  });

  it("projects spending and investing at the average daily rate so far", () => {
    const s = buildDailySeries(transactions, ...OCT, 2000, "2026-10-05");
    // 100 spent over 5 days = 20/day; 5 more days -> 200
    expect(s.values.spent[9]).toBe(200);
    expect(s.values.spent[5]).toBe(120);
    expect(s.values.invested[9]).toBe(60);
  });

  it("ramps income up to the expected amount by the end of the period", () => {
    const s = buildDailySeries(transactions, ...OCT, 2000, "2026-10-05");
    expect(s.values.saved[9]).toBe(2000 - 200 - 60);
  });

  it("never projects income below what was already earned", () => {
    const s = buildDailySeries(transactions, ...OCT, 500, "2026-10-05");
    // earned 1000 already, expected only 500: stays at 1000
    expect(s.values.saved[9]).toBe(1000 - 200 - 60);
  });

  it("ignores transactions outside the period", () => {
    const s = buildDailySeries(
      [...transactions, tx("2026-09-30", "expense", 999), tx("2026-10-11", "expense", 999)],
      ...OCT,
      2000,
      "2026-10-05"
    );
    expect(s.values.spent[4]).toBe(100);
  });

  it("is all projection before the period has started", () => {
    const s = buildDailySeries([], ...OCT, 1000, "2026-09-20");
    expect(s.todayIndex).toBe(-1);
    expect(s.values.spent.every((v) => v === 0)).toBe(true);
    expect(s.values.saved[9]).toBe(1000);
  });

  it("is all actual after the period has ended", () => {
    const s = buildDailySeries(transactions, ...OCT, 2000, "2026-11-30");
    expect(s.todayIndex).toBe(9);
    expect(s.values.spent[9]).toBe(100);
    expect(s.values.saved[9]).toBe(1000 - 100 - 30);
  });

  it("includes the last day as 'today' on the final day of the period", () => {
    const s = buildDailySeries(transactions, ...OCT, 2000, "2026-10-10");
    expect(s.todayIndex).toBe(9);
  });

  it("handles a leap day", () => {
    const s = buildDailySeries([], "2028-02-27", "2028-03-02", 0, "2028-02-28");
    expect(s.days).toEqual(["2028-02-27", "2028-02-28", "2028-02-29", "2028-03-01", "2028-03-02"]);
  });

  it("handles a period crossing a year boundary", () => {
    const s = buildDailySeries([], "2026-12-30", "2027-01-02", 0, "2026-12-31");
    expect(s.days).toEqual(["2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02"]);
  });

  it("accepts string amounts from the API", () => {
    const s = buildDailySeries(
      [{ ...tx("2026-10-01", "expense", 0), amount: "12.50" as unknown as number }],
      ...OCT,
      0,
      "2026-10-01"
    );
    expect(s.values.spent[0]).toBe(12.5);
  });

  it("rounds to cents", () => {
    const s = buildDailySeries([tx("2026-10-01", "expense", 10)], ...OCT, 0, "2026-10-03");
    for (const v of s.values.spent) expect(Math.round(v * 100) / 100).toBe(v);
  });
});

describe("splitActualProjected", () => {
  const s = buildDailySeries([tx("2026-10-02", "expense", 50)], ...OCT, 1000, "2026-10-05");

  it("reports actual values through today and nothing after", () => {
    expect(splitActualProjected(s, "spent", 2).actual).not.toBeNull();
    expect(splitActualProjected(s, "spent", 4).actual).not.toBeNull();
    expect(splitActualProjected(s, "spent", 5).actual).toBeNull();
  });

  it("starts the projected line at today so the two lines meet", () => {
    expect(splitActualProjected(s, "spent", 3).projected).toBeNull();
    expect(splitActualProjected(s, "spent", 4).projected).toBe(s.values.spent[4]);
    expect(splitActualProjected(s, "spent", 9).projected).toBe(s.values.spent[9]);
  });

  it("has no projected line when the period is over", () => {
    const done = buildDailySeries([], ...OCT, 0, "2026-12-01");
    expect(splitActualProjected(done, "spent", 9).projected).toBeNull();
  });
});

describe("misc", () => {
  it("toLocalDateString pads and uses the local day", () => {
    expect(toLocalDateString(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(toLocalDateString(new Date(2026, 9, 26, 23, 59))).toBe("2026-10-26");
  });

  it("spending is a ceiling while investing and saving are goals", () => {
    const kinds = Object.fromEntries(TARGET_METRICS.map((m) => [m.key, m.kind]));
    expect(kinds).toEqual({ spent: "ceiling", invested: "goal", saved: "goal" });
  });
});
