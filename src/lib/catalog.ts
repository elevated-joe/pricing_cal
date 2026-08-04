/**
 * Pricing catalog — all rates, costs and multipliers live here.
 *
 * This is the "template" you edit when prices change. The pricing engine
 * (pricing.ts) is generic and reads everything from this file, so updating a
 * cost is a one-line change with no logic to touch.
 *
 * All figures are ported directly from the source spreadsheet
 * (Pricing_Calc 2026 — "Enterprise - HaaS" sheet).
 */

/** Global multipliers / constants used across the model. */
export const CONSTANTS = {
  /** Markup applied to hardware ext-cost to get ext-price (E = D * 1.42). */
  HARDWARE_PRICE_MULT: 1.42,
  /** Flat monthly price per "LAB" (labor-to-rack) unit. */
  LAB_UNIT_PRICE: 185,
  /** Hardware-as-a-Service is amortized over this many months. */
  HAAS_MONTHS: 60,
  /** Extra uplift applied to the monthly HaaS price ((E15/60) * 1.2). */
  HAAS_MONTHLY_PRICE_MULT: 1.2,
  /** Price multiplier for O365 seats (E = D * 1.2). */
  O365_PRICE_MULT: 1.2,
  /** Price multiplier for Datto hardware (E = D * 1.25). */
  DATTO_HW_PRICE_MULT: 1.25,
  /** Price multiplier for Datto licensing (E = D * 1.42). */
  DATTO_LIC_PRICE_MULT: 1.42,
  /** Target gross margin used to price managed services: price = cost / (1 - GM). */
  TARGET_GROSS_MARGIN: 0.7,
} as const;

/** How a hardware line's ext-price is derived. */
export type HardwarePriceRule = "markup" | "lab";

export interface HardwareItem {
  key: string;
  label: string;
  /** Cost per unit. */
  cost: number;
  /**
   * How many units, expressed relative to the model drivers.
   * `base` picks the driver, `factor` scales it.
   *  - locations: number of sites
   *  - devices:   users * deviceMultiplier
   *  - fixed:     a constant count
   */
  unit:
    | { base: "locations"; factor?: number }
    | { base: "devices"; factor?: number }
    | { base: "fixed"; value: number };
  priceRule: HardwarePriceRule;
}

/**
 * Hardware bundle (HaaS). Firewalls/switches/APs scale with locations,
 * computers scale with the device count, and "LAB" lines are the
 * install-labor rack lines priced at a flat per-unit rate.
 */
export const HARDWARE: HardwareItem[] = [
  { key: "fw", label: "Firewall 5yr", cost: 2950.04, unit: { base: "locations" }, priceRule: "markup" },
  { key: "fwLog", label: "Firewall LOG 5yr", cost: 746.17, unit: { base: "locations" }, priceRule: "markup" },
  { key: "fwLab", label: "Firewall LAB", cost: 68, unit: { base: "locations", factor: 8 }, priceRule: "lab" },
  { key: "sw", label: "Switch 48 port", cost: 1357.65, unit: { base: "locations" }, priceRule: "markup" },
  { key: "swLic", label: "Switch LIC 5yr", cost: 928.99, unit: { base: "locations" }, priceRule: "markup" },
  { key: "swLab", label: "Switch LAB", cost: 68, unit: { base: "locations", factor: 6 }, priceRule: "lab" },
  { key: "ap", label: "AP", cost: 502.8, unit: { base: "locations" }, priceRule: "markup" },
  { key: "apLic", label: "AP LIC 5yr", cost: 343.5, unit: { base: "locations" }, priceRule: "markup" },
  { key: "apLab", label: "AP LAB", cost: 68, unit: { base: "locations", factor: 4 }, priceRule: "lab" },
  { key: "pc", label: "Computer", cost: 1571.84, unit: { base: "devices" }, priceRule: "markup" },
  { key: "pcLic", label: "Computer LIC 5yr", cost: 123.79, unit: { base: "devices" }, priceRule: "markup" },
  { key: "pcLab", label: "Computer LAB", cost: 68, unit: { base: "devices", factor: 3 }, priceRule: "lab" },
];

export interface ToolItem {
  key: string;
  label: string;
  cost: number;
  /**
   * Unit basis:
   *  - devices: users * deviceMultiplier
   *  - users:   number of users
   *  - fixed:   a constant count (per-tenant tools)
   */
  unit: { base: "devices" } | { base: "users" } | { base: "fixed"; value: number };
}

/** Per-month managed tooling (RMM/EDR, security, documentation …). */
export const TOOLS: ToolItem[] = [
  { key: "k365", label: "K365 Endpoint (RMM/EDR/AV/RC)", cost: 6.4, unit: { base: "devices" } },
  { key: "vpen", label: "vPen Seat", cost: 0.8, unit: { base: "devices" } },
  { key: "kaseya", label: "Kaseya User (Inky/SaaS Alert&Protect)", cost: 4.99, unit: { base: "users" } },
  { key: "archtitan", label: "ArchTitan Archive", cost: 3, unit: { base: "users" } },
  { key: "duo", label: "Duo Seat", cost: 2.7, unit: { base: "users" } },
  { key: "bsn", label: "BSN (Training/DarkWeb)", cost: 50, unit: { base: "fixed", value: 1 } },
  { key: "itg", label: "ITG/MyITProcess", cost: 64.5, unit: { base: "fixed", value: 1 } },
  { key: "vulscan", label: "Vulscan Client", cost: 10, unit: { base: "fixed", value: 1 } },
  { key: "netdetective", label: "NetworkDetective", cost: 22, unit: { base: "fixed", value: 1 } },
];

export interface LaborItem {
  label: string;
  /** Budgeted hours for this role. */
  hours: number | { base: "devices"; factor: number };
  /** Blended hourly cost. */
  rate: number;
  /**
   * true  -> already a monthly figure (Support / RHEM lines): E = rate * hours
   * false -> annual hours amortized to monthly:              E = rate * hours / 12
   */
  alreadyMonthly: boolean;
}

export interface LaborTier {
  key: "coManaged" | "remote" | "standardEnterprise";
  label: string;
  noTravel: LaborItem[];
  travel: LaborItem[];
}

/**
 * Labor tiers. Each tier has a no-travel and a travel variant; the engine
 * picks one based on the "Travel Required" input. Support lines scale with the
 * device count (RHEM factor); TAM/vCIO are fixed annual hour budgets.
 */
export const LABOR: LaborTier[] = [
  {
    key: "coManaged",
    label: "Co-Managed",
    noTravel: [
      { label: "Co-Managed TAM (4x6)", hours: 24, rate: 37, alreadyMonthly: false },
      { label: "Co-Managed vCIO ((2x4)+(2x6))", hours: 20, rate: 80, alreadyMonthly: false },
      { label: "Co-Managed Support (POC 0.15)", hours: { base: "devices", factor: 0.15 }, rate: 37, alreadyMonthly: true },
    ],
    travel: [
      { label: "Co-Managed TAM (4x8)", hours: 32, rate: 37, alreadyMonthly: false },
      { label: "Co-Managed vCIO (4x7)", hours: 28, rate: 80, alreadyMonthly: false },
      { label: "Co-Managed Support (POC 0.15)", hours: { base: "devices", factor: 0.15 }, rate: 37, alreadyMonthly: true },
    ],
  },
  {
    key: "remote",
    label: "Remote",
    noTravel: [
      { label: "Remote TAM (1x8)", hours: 8, rate: 37, alreadyMonthly: false },
      { label: "Remote vCIO (4x4)", hours: 16, rate: 80, alreadyMonthly: false },
      { label: "Remote Support (0.3 RHEM)", hours: { base: "devices", factor: 0.3 }, rate: 37, alreadyMonthly: true },
    ],
    travel: [
      { label: "Remote TAM (1x12)", hours: 12, rate: 37, alreadyMonthly: false },
      { label: "Remote vCIO (4x4)", hours: 16, rate: 80, alreadyMonthly: false },
      { label: "Remote Support (0.3 RHEM)", hours: { base: "devices", factor: 0.3 }, rate: 37, alreadyMonthly: true },
    ],
  },
  {
    key: "standardEnterprise",
    label: "Standard / Enterprise",
    noTravel: [
      { label: "Std/Ent TAM (12x6)", hours: 72, rate: 37, alreadyMonthly: false },
      { label: "Std/Ent vCIO (4x6)", hours: 24, rate: 80, alreadyMonthly: false },
      { label: "Std/Ent Support (0.3 RHEM)", hours: { base: "devices", factor: 0.3 }, rate: 37, alreadyMonthly: true },
    ],
    travel: [
      { label: "Std/Ent TAM (12x9)", hours: 108, rate: 37, alreadyMonthly: false },
      { label: "Std/Ent vCIO (4x9)", hours: 36, rate: 80, alreadyMonthly: false },
      { label: "Std/Ent Support (0.3 RHEM)", hours: { base: "devices", factor: 0.3 }, rate: 37, alreadyMonthly: true },
    ],
  },
];

/** Datto backup options (licensing cost/month) from the spreadsheet notes. */
export interface DattoOption {
  key: string;
  label: string;
  /** Monthly licensing cost; priced at DATTO_LIC_PRICE_MULT. */
  licCost: number;
}

export const DATTO_OPTIONS: DattoOption[] = [
  { key: "none", label: "None", licCost: 0 },
  { key: "4t", label: "Datto 4TB (ICR)", licCost: 581.9 },
  { key: "6t", label: "Datto 6TB (ICR)", licCost: 823.9 },
  { key: "8t", label: "Datto 8TB (ICR)", licCost: 955.9 },
];

/** Cost per O365 E3 + Teams seat / month. */
export const O365_SEAT_COST = 18;

/**
 * The four sellable plans. Each maps to a labor tier, and only Enterprise
 * bundles the HaaS hardware into the recurring price.
 */
export interface PlanDef {
  key: string;
  label: string;
  laborTier: LaborTier["key"];
  includeHaaS: boolean;
}

export const PLANS: PlanDef[] = [
  { key: "coManaged", label: "Co-Managed", laborTier: "coManaged", includeHaaS: false },
  { key: "remote", label: "Remote", laborTier: "remote", includeHaaS: false },
  { key: "standard", label: "Standard", laborTier: "standardEnterprise", includeHaaS: false },
  { key: "enterprise", label: "Enterprise (HaaS)", laborTier: "standardEnterprise", includeHaaS: true },
];

/**
 * The editable portion of the catalog — the item lists the pricing engine reads.
 * The frontend can edit a copy of this (costs, add/remove items) and export an
 * updated catalog.ts to commit. Types/constants/plans above stay code.
 */
export interface Catalog {
  hardware: HardwareItem[];
  tools: ToolItem[];
  labor: LaborTier[];
}

/** Built-in defaults, ported from the source spreadsheet. */
export const DEFAULT_CATALOG: Catalog = {
  hardware: HARDWARE,
  tools: TOOLS,
  labor: LABOR,
};
