import { describe, expect, it } from "vitest";
import { calculatePricing, DEFAULT_INPUTS, type PricingInputs } from "./pricing";

/**
 * These assertions lock the engine to the source spreadsheet's numbers.
 * The spreadsheet was calculated with O365 seats = 0 and no Datto, so we
 * reproduce that exact scenario here (values pulled from the workbook cells,
 * referenced in comments as their cell coordinates).
 */
const SHEET_INPUTS: PricingInputs = {
  users: 25,
  locations: 1,
  travelRequired: false,
  deviceMultiplier: 1.25,
  o365Seats: 0,
  dattoOption: "none",
};

const near = (a: number, b: number) => expect(a).toBeCloseTo(b, 4);

describe("pricing engine — parity with source spreadsheet", () => {
  const r = calculatePricing(SHEET_INPUTS);

  it("device count driver = users * deviceMultiplier", () => {
    expect(r.deviceCount).toBe(31.25);
  });

  it("hardware totals match D15/E15", () => {
    near(r.hardware.extCost, 67416.5875); // D15
    near(r.hardware.extPrice, 105614.72425); // E15
  });

  it("hardware monthly (60mo) matches D16/E16", () => {
    near(r.hardware.monthlyCost, 1123.6097916666665); // D16
    near(r.hardware.monthlyPrice, 2112.294485); // E16
  });

  it("managed tools total matches D34", () => {
    near(r.tools.extCost, 638.75); // D34
  });

  it("labor tier totals match E40/E44/E48 (no travel)", () => {
    const byKey = Object.fromEntries(r.labor.map((t) => [t.key, t.monthlyCost]));
    near(byKey.coManaged, 380.7708333333334); // E40
    near(byKey.remote, 478.2083333333334); // E44
    near(byKey.standardEnterprise, 728.875); // E48
  });

  it("plan totals match R7..R10", () => {
    const byKey = Object.fromEntries(r.plans.map((p) => [p.key, p]));
    near(byKey.coManaged.totalMonthly, 3398.4027777777774); // R10
    near(byKey.remote.totalMonthly, 3723.1944444444443); // R9
    near(byKey.standard.totalMonthly, 4558.75); // R8
    near(byKey.enterprise.totalMonthly, 6671.044485); // R7 (includes HaaS)
  });

  it("per-user price hits the 70% target margin", () => {
    const std = r.plans.find((p) => p.key === "standard")!;
    near(std.perUserPrice, 182.35); // J8
    // price - cost over price == target GM
    near((std.perUserPrice - std.perUserCost) / std.perUserPrice, 0.7);
  });

  it("only Enterprise bundles HaaS into recurring", () => {
    const byKey = Object.fromEntries(r.plans.map((p) => [p.key, p]));
    expect(byKey.enterprise.orrHaaS).toBeGreaterThan(0);
    expect(byKey.standard.orrHaaS).toBe(0);
    expect(byKey.remote.orrHaaS).toBe(0);
    expect(byKey.coManaged.orrHaaS).toBe(0);
  });
});

describe("pricing engine — interactive behaviour", () => {
  it("travel toggle raises labor cost", () => {
    const noTravel = calculatePricing({ ...DEFAULT_INPUTS, travelRequired: false });
    const travel = calculatePricing({ ...DEFAULT_INPUTS, travelRequired: true });
    const stdNo = noTravel.labor.find((t) => t.key === "standardEnterprise")!.monthlyCost;
    const stdYes = travel.labor.find((t) => t.key === "standardEnterprise")!.monthlyCost;
    expect(stdYes).toBeGreaterThan(stdNo);
  });

  it("O365 seats flow into every plan's recurring price", () => {
    const withSeats = calculatePricing({ ...SHEET_INPUTS, o365Seats: 25 });
    near(withSeats.orr.o365.extPrice, 18 * 25 * 1.2); // 540
    for (const p of withSeats.plans) near(p.orrO365, 540);
  });

  it("Datto selection prices at the licensing multiplier", () => {
    const withDatto = calculatePricing({ ...SHEET_INPUTS, dattoOption: "4t" });
    near(withDatto.orr.datto.extPrice, 581.9 * 1.42);
  });

  it("scales with users (more users => higher MRR)", () => {
    const small = calculatePricing({ ...DEFAULT_INPUTS, users: 10 });
    const big = calculatePricing({ ...DEFAULT_INPUTS, users: 100 });
    const s = small.plans.find((p) => p.key === "standard")!.mrrPrice;
    const b = big.plans.find((p) => p.key === "standard")!.mrrPrice;
    expect(b).toBeGreaterThan(s);
  });

  it("handles zero users without dividing by zero", () => {
    const r = calculatePricing({ ...DEFAULT_INPUTS, users: 0 });
    for (const p of r.plans) expect(Number.isFinite(p.totalMonthly)).toBe(true);
  });
});
