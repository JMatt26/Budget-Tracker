import { describe, expect, it } from "vitest";
import { computeProjections, sumProjections } from "./incomeProjections";

describe("computeProjections", () => {
  it("scales each frequency to a yearly total", () => {
    expect(computeProjections(100, "weekly").yearly).toBe(5200);
    expect(computeProjections(100, "biweekly").yearly).toBe(2600);
    expect(computeProjections(100, "semimonthly").yearly).toBe(2400); // twice a month = 24 payments
    expect(computeProjections(100, "monthly").yearly).toBe(1200);
    expect(computeProjections(100, "yearly").yearly).toBe(100);
  });

  it("derives monthly and weekly equivalents from the yearly total", () => {
    const p = computeProjections(1000, "semimonthly");
    expect(p.monthly).toBe(2000);
    expect(p.weekly).toBeCloseTo(24000 / 52, 10);
  });

  it("a weekly wage is not just four times a week per month", () => {
    expect(computeProjections(100, "weekly").monthly).toBeCloseTo((100 * 52) / 12, 10);
  });

  it("returns zeros for zero income", () => {
    expect(computeProjections(0, "monthly")).toEqual({ weekly: 0, monthly: 0, yearly: 0 });
  });
});

describe("sumProjections", () => {
  it("is zero with no incomes", () => {
    expect(sumProjections([])).toEqual({ weekly: 0, monthly: 0, yearly: 0 });
  });

  it("adds every income's projection together", () => {
    const total = sumProjections([
      { amount: 2000, frequency: "monthly" },
      { amount: 500, frequency: "semimonthly" },
      { amount: 1200, frequency: "yearly" },
    ]);
    expect(total.yearly).toBe(24000 + 12000 + 1200);
    expect(total.monthly).toBeCloseTo(37200 / 12, 10);
  });

  it("accepts the numeric strings the API returns", () => {
    expect(sumProjections([{ amount: "100.50", frequency: "monthly" }]).yearly).toBeCloseTo(1206, 10);
  });
});
