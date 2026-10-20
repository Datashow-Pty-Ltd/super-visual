import { useEffect, type ReactElement } from "react";
import type { ReportApplicationProps } from "./reportRuntime";

export function ReportApplication({ model, onVisibleDatasetsChange }: ReportApplicationProps): ReactElement {
  useEffect(() => onVisibleDatasetsChange?.(["sales"]), [onVisibleDatasetsChange]);
  const dataset = model.datasets.sales;
  const maximum = Math.max(1, ...(dataset?.points.map((point) => point.value) ?? [1]));
  const total = dataset?.points.reduce((sum, point) => sum + point.value, 0) ?? 0;

  return <main className="hello-world">
    <p className="eyebrow">Super Visual / minimal example</p>
    <h1>Hello, governed data.</h1>
    <p className="lede">This React page is bound only through ReportApplicationProps.</p>
    <section aria-labelledby="total-sales">
      <h2 id="total-sales">Total sales</h2>
      <strong className="total">{new Intl.NumberFormat(undefined, { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(total)}</strong>
    </section>
    <section aria-labelledby="sales-by-category">
      <h2 id="sales-by-category">Sales by category</h2>
      {!dataset?.points.length ? <p>Waiting for Power BI data…</p> : <ol className="bars">
        {dataset.points.map((point) => <li key={point.key}>
          <span>{point.label}</span>
          <span className="track"><span className="bar" style={{ width: `${Math.max(2, (point.value / maximum) * 100)}%` }} /></span>
          <strong>{new Intl.NumberFormat().format(point.value)}</strong>
        </li>)}
      </ol>}
    </section>
  </main>;
}
