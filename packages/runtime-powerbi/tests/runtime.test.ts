import { describe, expect, it, vi } from "vitest";
import type powerbi from "powerbi-visuals-api";
import { buildBasicFilter, filterValues } from "../src/filter.js";
import { buildBrokerAdapter, completeRequestedDatasets } from "../src/dataView.js";
import { materializeBrokerRows } from "../src/brokerRows.js";

function host(): powerbi.extensibility.visual.IVisualHost {
  return { colorPalette: { reset: vi.fn(), getColor: () => ({ value: "#123456" }) } } as unknown as powerbi.extensibility.visual.IVisualHost;
}

describe("Power BI broker runtime", () => {
  it("builds and reads a multi-value self filter", () => {
    const target = { table: "Widget Axis", column: "WidgetId" };
    const filter = buildBasicFilter(target, "sample", "detail");
    expect(filterValues([filter], target)).toEqual(["sample", "detail"]);
  });

  it("partitions the long-table broker and completes a requested empty dataset", () => {
    const roles = ["widgetId", "axisKey", "label", "sort", "seriesKey", "seriesLabel", "value", "context"];
    const columns = roles.map((role) => ({ displayName: role, roles: { [role]: true } }));
    const dataView = { metadata: { columns }, table: { columns, rows: [["sample", "a", "Alpha", 1, "sales", "Sales", 10, "sample=all"]] } } as unknown as powerbi.DataView;
    const result = buildBrokerAdapter([dataView], host());
    const completed = completeRequestedDatasets(result, ["sample", "empty"]);
    expect(result).toMatchObject({ receivedWidgets: ["sample"], receivedRowCount: 1, context: "sample=all", warnings: [] });
    expect(completed.sample?.points[0]).toMatchObject({ label: "Alpha", value: 10 });
    expect(completed.empty?.points).toEqual([]);
  });

  it("materializes semantic preview rows through the same broker path", () => {
    const result = materializeBrokerRows([{
      WidgetId: "sample", AxisKey: "a", Label: "Alpha", Sort: 1,
      SeriesKey: "sales", SeriesLabel: "Sales", WidgetValue: "10", BrokerContext: "sample=all",
    }], () => "#123456");
    expect(result).toMatchObject({ receivedWidgets: ["sample"], receivedRowCount: 1, context: "sample=all", warnings: [] });
    expect(result.datasets.sample?.points[0]).toMatchObject({ label: "Alpha", value: 10, color: "#123456" });
  });
});
