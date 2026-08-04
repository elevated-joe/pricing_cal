import { useMemo, useState } from "react";
import { calculatePricing, DEFAULT_INPUTS, type PricingInputs } from "./lib/pricing";
import { money } from "./lib/format";
import { FEATURES } from "./lib/features";
import { InputsPanel } from "./components/InputsPanel";
import { PlanCards } from "./components/PlanCards";
import { LineItemTable } from "./components/LineItemTable";

function Section({
  title,
  subtitle,
  defaultOpen = false,
  children,
}: {
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details className="section" open={defaultOpen}>
      <summary>
        <span className="section-title">{title}</span>
        {subtitle && <span className="section-sub">{subtitle}</span>}
      </summary>
      <div className="section-body">{children}</div>
    </details>
  );
}

export default function App() {
  const [inputs, setInputs] = useState<PricingInputs>(DEFAULT_INPUTS);
  const result = useMemo(() => calculatePricing(inputs), [inputs]);

  const patch = (p: Partial<PricingInputs>) => setInputs((prev) => ({ ...prev, ...p }));

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>MSP Pricing Calculator</h1>
          <p className="tagline">
            Enterprise HaaS managed-services model · {Math.round(result.deviceCount)} devices ·{" "}
            {inputs.travelRequired ? "with travel" : "no travel"}
          </p>
        </div>
      </header>

      <div className="layout">
        <aside className="sidebar">
          <InputsPanel inputs={inputs} onChange={patch} onReset={() => setInputs(DEFAULT_INPUTS)} />
        </aside>

        <main className="content">
          <section>
            <h2 className="content-title">Plans</h2>
            <PlanCards plans={result.plans} />
          </section>

          <section className="details">
            <h2 className="content-title">Cost breakdown</h2>

            <Section
              title="Hardware (HaaS)"
              subtitle={`Monthly: ${money(result.hardware.monthlyPrice)} · one-time ${money(
                result.hardware.extPrice,
              )}`}
            >
              <LineItemTable
                lines={result.hardware.lines}
                footer={{
                  label: "Total",
                  extCost: result.hardware.extCost,
                  extPrice: result.hardware.extPrice,
                }}
              />
              <div className="mini-summary">
                <span>Monthly cost (÷60): {money(result.hardware.monthlyCost)}</span>
                <span>Monthly price (÷60 ×1.2): {money(result.hardware.monthlyPrice)}</span>
              </div>
            </Section>

            <Section
              title="Managed Tools"
              subtitle={`${money(result.tools.extCost)} / mo cost`}
            >
              <LineItemTable
                lines={result.tools.lines}
                showPrice={false}
                footer={{ label: "Total", extCost: result.tools.extCost }}
              />
            </Section>

            <Section
              title="Labor"
              subtitle={inputs.travelRequired ? "Travel rates" : "No-travel rates"}
            >
              {result.labor.map((tier) => (
                <div key={tier.key} className="labor-tier">
                  <h4>{tier.label}</h4>
                  <LineItemTable
                    lines={tier.lines}
                    showPrice={false}
                    footer={{ label: `${tier.label} total`, extCost: tier.monthlyCost }}
                  />
                </div>
              ))}
            </Section>

            {FEATURES.orr && (
              <Section title="O365 / Datto (ORR)" subtitle="Pass-through recurring">
                <LineItemTable lines={[result.orr.o365, result.orr.datto]} />
              </Section>
            )}
          </section>
        </main>
      </div>

      <footer className="app-footer">
        Built from the Pricing_Calc 2026 template. Edit rates in{" "}
        <code>src/lib/catalog.ts</code>.
      </footer>
    </div>
  );
}
