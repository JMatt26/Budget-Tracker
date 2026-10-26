import { describe, expect, it } from "vitest";
import { METRIC_CONFIG, METRIC_ORDER, type MetricKey } from "./metrics";

describe("dashboard metrics config", () => {
  it("lists every metric exactly once, in display order", () => {
    const keys = Object.keys(METRIC_CONFIG).sort();
    expect([...METRIC_ORDER].sort()).toEqual(keys);
    expect(new Set(METRIC_ORDER).size).toBe(METRIC_ORDER.length);
  });

  it("maps each metric to a field the summary report returns", () => {
    const fields = Object.values(METRIC_CONFIG).map((m) => m.field);
    for (const field of fields) {
      expect(["total_income", "total_investment", "total_expense", "net"]).toContain(field);
    }
    expect(new Set(fields).size).toBe(fields.length);
  });

  it("has a label and note for every metric", () => {
    for (const key of METRIC_ORDER as MetricKey[]) {
      expect(METRIC_CONFIG[key].label).not.toBe("");
      expect(METRIC_CONFIG[key].note).not.toBe("");
    }
  });
});
