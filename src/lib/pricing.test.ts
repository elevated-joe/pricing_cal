import { describe, expect, it } from "vitest";
import { calculatePricing, DEFAULT_INPUTS, type PricingInputs } from "./pricing";

/**
 * Unit quantities are rounded to whole numbers (you can't buy a fraction of a
 * device or bill a fractional hour), so the engine intentionally diverges from
 * the raw spreadsheet's fractional cells. These tests lock in the rounded
 * model and its structural invariants.
 *
 * Baseline scenario mirrors the spreadsheet inputs (25 users, 1 location, no
 * travel, 1.25 devices/user) with O365 = 0 seats and no Datto.
 */
const BASE: PricingInputs = {
  users: 25,
  locations: 1,
  travelRequired: false,
  deviceMultiplier: 1.25,
  o365Seats: 0,
  dattoOption: "none",
};

const near = (a: number, b: number) => expect(a).toBeCloseTo(b, 4);

const allLines = (r: ReturnType<typeof calculatePricing>) => [
  ...r.hardware.lines,
  ...r.tools.lines,
  ...r.labor.flatMap((t) => t.lines),
  r.orr.o365,
  r.orr.datto,
];

describe("pricing engine — whole-unit invariants", () => {
  const r = calculatePricing({ ...DEFAULT_INPUTS, deviceMultiplier: 1.25 });

  it("every displayed unit is a whole number", () => {
    for (const line of allLines(r)) {
      expect(Number.isInteger(line.unit), `${line.label} unit=${line.unit}`).toBe(true);
    }
  });

  it("device driver is rounded (25 × 1.25 = 31.25 → 31)", () => {
    expect(r.deviceCount).toBe(31);
  });

  it("unit × cost equals ext cost on hardware and tool lines", () => {
    for (const line of [...r.hardware.lines, ...r.tools.lines]) {
      near(line.unit * line.unitCost, line.extCost);
    }
  });

  it("every quoted price is a whole dollar amount", () => {
    const prices = [
      r.hardware.extPrice,
      r.hardware.monthlyPrice,
      ...r.hardware.lines.map((l) => l.extPrice),
      r.orr.o365.extPrice,
      r.orr.datto.extPrice,
      ...r.plans.flatMap((p) => [
        p.perUserPrice,
        p.mrrPrice,
        p.orrO365,
        p.orrDatto,
        p.orrHaaS,
        p.setupFee,
        p.totalMonthly,
      ]),
    ];
    for (const price of prices) expect(Number.isInteger(price)).toBe(true);
  });
});

describe("pricing engine — rounded baseline numbers", () => {
  const r = calculatePricing(BASE);

  it("hardware totals", () => {
    near(r.hardware.extCost, 66941.68);
    expect(r.hardware.extPrice).toBe(104874); // sum of whole-dollar line prices
    near(r.hardware.monthlyCost, 1115.6946666666665);
    expect(r.hardware.monthlyPrice).toBe(2097);
  });

  it("managed tools total", () => {
    near(r.tools.extCost, 636.95);
  });

  it("labor tier totals (no travel)", () => {
    const byKey = Object.fromEntries(r.labor.map((t) => [t.key, t.monthlyCost]));
    near(byKey.coManaged, 392.3333333333333);
    near(byKey.remote, 464.3333333333333);
    near(byKey.standardEnterprise, 715);
  });

  it("plan totals (whole dollars)", () => {
    const byKey = Object.fromEntries(r.plans.map((p) => [p.key, p]));
    expect(byKey.coManaged.totalMonthly).toBe(3425);
    expect(byKey.remote.totalMonthly).toBe(3675);
    expect(byKey.standard.totalMonthly).toBe(4500);
    expect(byKey.enterprise.totalMonthly).toBe(6597); // includes HaaS
  });

  it("per-user price rounds to whole dollars near the 70% target margin", () => {
    const std = r.plans.find((p) => p.key === "standard")!;
    expect(std.perUserPrice).toBe(180);
    // rounding nudges the realized margin a hair off the 70% target
    expect((std.perUserPrice - std.perUserCost) / std.perUserPrice).toBeCloseTo(0.7, 2);
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
    const withSeats = calculatePricing({ ...BASE, o365Seats: 25 });
    near(withSeats.orr.o365.extPrice, 18 * 25 * 1.2); // 540
    for (const p of withSeats.plans) near(p.orrO365, 540);
  });

  it("Datto selection prices at the licensing multiplier (rounded)", () => {
    const withDatto = calculatePricing({ ...BASE, dattoOption: "4t" });
    expect(withDatto.orr.datto.extPrice).toBe(Math.round(581.9 * 1.42)); // 826
  });

  it("scales with users (more users => higher MRR)", () => {
    const small = calculatePricing({ ...DEFAULT_INPUTS, users: 10 });
    const big = calculatePricing({ ...DEFAULT_INPUTS, users: 100 });
    const s = small.plans.find((p) => p.key === "standard")!.mrrPrice;
    const b = big.plans.find((p) => p.key === "standard")!.mrrPrice;
    expect(b).toBeGreaterThan(s);
  });

  it("keeps units whole even with an odd device multiplier", () => {
    const r = calculatePricing({ ...DEFAULT_INPUTS, deviceMultiplier: 1.33, o365Seats: 7 });
    for (const line of allLines(r)) expect(Number.isInteger(line.unit)).toBe(true);
  });

  it("handles zero users without dividing by zero", () => {
    const r = calculatePricing({ ...DEFAULT_INPUTS, users: 0 });
    for (const p of r.plans) expect(Number.isFinite(p.totalMonthly)).toBe(true);
  });
});
