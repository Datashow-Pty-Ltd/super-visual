import { useEffect, useMemo, useState, type ReactElement } from "react";
import type { ReportApplicationProps } from "./reportRuntime";

interface CatalogRow {
  type: string;
  parent: string;
  entity: string;
}

const TYPE_ORDER = ["Model", "Table", "Column", "Measure", "Hierarchy", "Hierarchy level", "Relationship", "Parameter"];
const TYPE_PLURALS: Record<string, string> = { Hierarchy: "Hierarchies", "Hierarchy level": "Hierarchy levels" };

export function ReportApplication({ model, onVisibleDatasetsChange }: ReportApplicationProps): ReactElement {
  const [query, setQuery] = useState("");
  useEffect(() => onVisibleDatasetsChange?.(["model-catalog"]), [onVisibleDatasetsChange]);

  const dataset = model.datasets["model-catalog"];
  const rows = useMemo<CatalogRow[]>(() => (dataset?.points ?? [])
    .map((point) => ({
      type: point.dimensions[0]?.label ?? "Entity",
      parent: point.dimensions[1]?.label ?? "",
      entity: point.dimensions[2]?.label ?? point.label,
    }))
    .sort((left, right) => (TYPE_ORDER.indexOf(left.type) - TYPE_ORDER.indexOf(right.type))
      || left.parent.localeCompare(right.parent)
      || left.entity.localeCompare(right.entity)), [dataset]);

  const normalizedQuery = query.trim().toLowerCase();
  const visibleRows = normalizedQuery
    ? rows.filter((row) => [row.type, row.parent, row.entity].some((value) => value.toLowerCase().includes(normalizedQuery)))
    : rows;
  const counts = rows.reduce<Record<string, number>>((result, row) => {
    result[row.type] = (result[row.type] ?? 0) + 1;
    return result;
  }, {});
  const countTypes = [...TYPE_ORDER.filter((type) => counts[type] !== undefined), ...Object.keys(counts).filter((type) => !TYPE_ORDER.includes(type)).sort()];
  const connected = rows.length > 0;

  return <main className="hello-world">
    <header className="hero">
      <div>
        <p className="eyebrow">Super Visual / connectivity proof</p>
        <h1>Hello, semantic model.</h1>
        <p className="lede">This searchable catalog arrived through the same governed semantic provider used by every Super Visual application.</p>
      </div>
      <p className={connected ? "connection connected" : "connection waiting"} role="status">
        <span aria-hidden="true" />
        {connected ? "Connected · " + rows.length + " entities" : "Waiting for semantic data…"}
      </p>
    </header>

    <section className="summary" aria-label="Semantic model summary">
      {countTypes.map((type) => <div key={type}><strong>{counts[type]}</strong><span>{counts[type] === 1 ? type : TYPE_PLURALS[type] ?? `${type}s`}</span></div>)}
    </section>

    <section className="catalog" aria-labelledby="catalog-title">
      <div className="catalog-heading">
        <div><h2 id="catalog-title">Semantic model entities</h2><p>Tables, columns, measures, hierarchies, relationships, and parameters declared by the model.</p></div>
        <label className="search"><span>Search entities</span><input type="search" value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder="Search type, parent, or name" /></label>
      </div>
      {!connected ? <p className="empty">The page will populate when the selected semantic model returns its first rows.</p>
        : visibleRows.length === 0 ? <p className="empty">No semantic entities match “{query}”.</p>
        : <div className="table-scroll"><table>
          <thead><tr><th scope="col">Type</th><th scope="col">Parent</th><th scope="col">Entity</th></tr></thead>
          <tbody>{visibleRows.map((row) => <tr key={[row.type, row.parent, row.entity].join("\u0000")}><td><span className="type">{row.type}</span></td><td>{row.parent || "—"}</td><th scope="row">{row.entity}</th></tr>)}</tbody>
        </table></div>}
    </section>
  </main>;
}
