/**
 * Pricing engine.
 *
 * Pure functions: given the deal inputs, produce every line item, section
 * subtotal, and per-plan monthly price. No React, no side effects — this is
 * the piece you unit-test and reuse (API, CLI, exports, etc.).
 */
import {
  CONSTANTS,
  DATTO_OPTIONS,
  HARDWARE,
  LABOR,
  O365_SEAT_COST,
  PLANS,
  TOOLS,
  type HardwareItem,
  type LaborItem,
  type LaborTier,
} from "./catalog";

export interface PricingInputs {
  /** Number of users / seats. */
  users: number;
  /** Number of physical locations / sites. */
  locations: number;
  /** Whether on-site travel labor applies. */
  travelRequired: boolean;
  /** Devices per user (e.g. 1.25 => some users have a second machine). */
  deviceMultiplier: number;
  /** O365 E3 + Teams seats to include (0 = none). */
  o365Seats: number;
  /** Selected Datto backup option key (see DATTO_OPTIONS). */
  dattoOption: string;
}

export const DEFAULT_INPUTS: PricingInputs = {
  users: 25,
  locations: 1,
  travelRequired: false,
  deviceMultiplier: 1.25,
  o365Seats: 25,
  dattoOption: "none",
};

export interface LineItem {
  label: string;
  unit: number;
  unitCost: number;
  extCost: number;
  extPrice: number;
  /** Gross margin on this line (0..1), or null when price is 0. */
  gm: number | null;
}

export interface Section {
  lines: LineItem[];
  extCost: number;
  extPrice: number;
}

export interface HaaSResult extends Section {
  /** Amortized monthly cost (extCost / 60). */
  monthlyCost: number;
  /** Amortized monthly price ((extPrice / 60) * 1.2). */
  monthlyPrice: number;
}

export interface LaborTierResult {
  key: LaborTier["key"];
  label: string;
  lines: LineItem[];
  /** Total monthly labor cost for the tier. */
  monthlyCost: number;
}

export interface PlanResult {
  key: string;
  label: string;
  perUserCost: number;
  perUserPrice: number;
  mrrCost: number;
  mrrPrice: number;
  grossMargin: number;
  orrO365: number;
  orrDatto: number;
  orrHaaS: number;
  /** One-time setup fee (mirrors spreadsheet: equals first Total Monthly). */
  setupFee: number;
  totalMonthly: number;
}

export interface PricingResult {
  inputs: PricingInputs;
  /** users * deviceMultiplier — the "device count" driver. */
  deviceCount: number;
  hardware: HaaSResult;
  tools: Section;
  labor: LaborTierResult[];
  orr: {
    o365: LineItem;
    datto: LineItem;
  };
  plans: PlanResult[];
}

const gm = (extCost: number, extPrice: number): number | null =>
  extPrice === 0 ? null : (extPrice - extCost) / extPrice;

/** Quantities are always whole units — you can't buy a fraction of a device or bill a fractional hour. */
const roundUnit = (n: number): number => Math.round(n);

/** Quoted prices are rounded to the nearest whole dollar. Costs stay exact. */
const roundPrice = (n: number): number => Math.round(n);

function hardwareUnitCount(item: HardwareItem, deviceCount: number, locations: number): number {
  switch (item.unit.base) {
    case "locations":
      return roundUnit(locations * (item.unit.factor ?? 1));
    case "devices":
      return roundUnit(deviceCount * (item.unit.factor ?? 1));
    case "fixed":
      return item.unit.value;
  }
}

function computeHardware(deviceCount: number, locations: number): HaaSResult {
  const lines: LineItem[] = HARDWARE.map((item) => {
    const unit = hardwareUnitCount(item, deviceCount, locations);
    const extCost = item.cost * unit;
    const extPrice = roundPrice(
      item.priceRule === "lab"
        ? unit * CONSTANTS.LAB_UNIT_PRICE
        : extCost * CONSTANTS.HARDWARE_PRICE_MULT,
    );
    return { label: item.label, unit, unitCost: item.cost, extCost, extPrice, gm: gm(extCost, extPrice) };
  });
  const extCost = sum(lines.map((l) => l.extCost));
  const extPrice = sum(lines.map((l) => l.extPrice));
  return {
    lines,
    extCost,
    extPrice,
    monthlyCost: extCost / CONSTANTS.HAAS_MONTHS,
    monthlyPrice: roundPrice((extPrice / CONSTANTS.HAAS_MONTHS) * CONSTANTS.HAAS_MONTHLY_PRICE_MULT),
  };
}

function computeTools(inputs: PricingInputs, deviceCount: number): Section {
  const lines: LineItem[] = TOOLS.map((item) => {
    let unit: number;
    switch (item.unit.base) {
      case "devices":
        unit = deviceCount;
        break;
      case "users":
        unit = inputs.users;
        break;
      case "fixed":
        unit = item.unit.value;
        break;
    }
    unit = roundUnit(unit);
    const extCost = item.cost * unit;
    // Tools are internal cost inputs; price is set later via target margin.
    return { label: item.label, unit, unitCost: item.cost, extCost, extPrice: extCost, gm: null };
  });
  const extCost = sum(lines.map((l) => l.extCost));
  return { lines, extCost, extPrice: extCost };
}

function laborLineMonthly(item: LaborItem, deviceCount: number): LineItem {
  const rawHours = typeof item.hours === "number" ? item.hours : deviceCount * item.hours.factor;
  const hours = roundUnit(rawHours);
  const monthly = item.alreadyMonthly ? item.rate * hours : (item.rate * hours) / 12;
  return {
    label: item.label,
    unit: hours,
    unitCost: item.rate,
    extCost: monthly,
    extPrice: monthly,
    gm: null,
  };
}

function computeLabor(travelRequired: boolean, deviceCount: number): LaborTierResult[] {
  return LABOR.map((tier) => {
    const items = travelRequired ? tier.travel : tier.noTravel;
    const lines = items.map((i) => laborLineMonthly(i, deviceCount));
    return {
      key: tier.key,
      label: tier.label,
      lines,
      monthlyCost: sum(lines.map((l) => l.extCost)),
    };
  });
}

function sum(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0);
}

export function calculatePricing(inputs: PricingInputs): PricingResult {
  // Whole devices only — round the driver once so every derived unit is whole too.
  const deviceCount = roundUnit(inputs.users * inputs.deviceMultiplier);

  const hardware = computeHardware(deviceCount, inputs.locations);
  const tools = computeTools(inputs, deviceCount);
  const labor = computeLabor(inputs.travelRequired, deviceCount);

  // --- ORR: O365 + Datto ---
  const o365Seats = roundUnit(inputs.o365Seats);
  const o365ExtCost = O365_SEAT_COST * o365Seats;
  const o365ExtPrice = roundPrice(o365ExtCost * CONSTANTS.O365_PRICE_MULT);
  const o365: LineItem = {
    label: "Office e3 Seat + Teams",
    unit: o365Seats,
    unitCost: O365_SEAT_COST,
    extCost: o365ExtCost,
    extPrice: o365ExtPrice,
    gm: gm(o365ExtCost, o365ExtPrice),
  };

  const dattoOpt = DATTO_OPTIONS.find((d) => d.key === inputs.dattoOption) ?? DATTO_OPTIONS[0];
  const dattoExtPrice = roundPrice(dattoOpt.licCost * CONSTANTS.DATTO_LIC_PRICE_MULT);
  const datto: LineItem = {
    label: `Datto LIC — ${dattoOpt.label}`,
    unit: dattoOpt.licCost === 0 ? 0 : 1,
    unitCost: dattoOpt.licCost,
    extCost: dattoOpt.licCost,
    extPrice: dattoExtPrice,
    gm: gm(dattoOpt.licCost, dattoExtPrice),
  };

  const laborByTier = new Map(labor.map((t) => [t.key, t]));
  const toolsMonthly = tools.extCost;

  const plans: PlanResult[] = PLANS.map((plan) => {
    const laborMonthly = laborByTier.get(plan.laborTier)!.monthlyCost;
    // Per-user cost = (managed tools + labor) spread across users.
    const perUserCost = inputs.users > 0 ? (toolsMonthly + laborMonthly) / inputs.users : 0;
    // Quoted prices round to whole dollars; MRR derives from the rounded
    // per-user price so the card's "per user × users" stays consistent.
    const perUserPrice = roundPrice(perUserCost / (1 - CONSTANTS.TARGET_GROSS_MARGIN));
    const mrrCost = perUserCost * inputs.users;
    const mrrPrice = roundPrice(perUserPrice * inputs.users);
    const orrHaaS = plan.includeHaaS ? hardware.monthlyPrice : 0;
    const totalMonthly = o365.extPrice + mrrPrice + orrHaaS + datto.extPrice;
    return {
      key: plan.key,
      label: plan.label,
      perUserCost,
      perUserPrice,
      mrrCost,
      mrrPrice,
      grossMargin: CONSTANTS.TARGET_GROSS_MARGIN,
      orrO365: o365.extPrice,
      orrDatto: datto.extPrice,
      orrHaaS,
      setupFee: totalMonthly,
      totalMonthly,
    };
  });

  return { inputs, deviceCount, hardware, tools, labor, orr: { o365, datto }, plans };
}
