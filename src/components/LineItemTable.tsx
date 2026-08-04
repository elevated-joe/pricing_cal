import type { LineItem } from "../lib/pricing";
import { money, percent, qty } from "../lib/format";

interface Props {
  lines: LineItem[];
  /** Show the ext-price and GM columns (hidden for cost-only sections like tools/labor). */
  showPrice?: boolean;
  footer?: { label: string; extCost: number; extPrice?: number };
}

export function LineItemTable({ lines, showPrice = true, footer }: Props) {
  return (
    <div className="table-scroll">
      <table className="line-table">
        <thead>
          <tr>
            <th className="col-label">Item</th>
            <th className="num">Unit</th>
            <th className="num">Cost</th>
            <th className="num">Ext Cost</th>
            {showPrice && <th className="num">Ext Price</th>}
            {showPrice && <th className="num">GM%</th>}
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i}>
              <td className="col-label">{l.label}</td>
              <td className="num">{qty(l.unit)}</td>
              <td className="num">{money(l.unitCost)}</td>
              <td className="num">{money(l.extCost)}</td>
              {showPrice && <td className="num">{money(l.extPrice)}</td>}
              {showPrice && <td className="num">{percent(l.gm)}</td>}
            </tr>
          ))}
        </tbody>
        {footer && (
          <tfoot>
            <tr>
              <td className="col-label">{footer.label}</td>
              <td className="num" />
              <td className="num" />
              <td className="num">{money(footer.extCost)}</td>
              {showPrice && <td className="num">{footer.extPrice != null ? money(footer.extPrice) : ""}</td>}
              {showPrice && <td className="num" />}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
