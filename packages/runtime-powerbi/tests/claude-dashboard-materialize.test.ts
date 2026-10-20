import { describe, expect, it } from "vitest";
import { materializeClaudeRows, materializedColumns } from "../src/claudeDashboard/materialize";
import type { WidgetDataset } from "../src/model";

describe("Claude Dashboard row materializer", () => {
  it("pivots governed long-table points into dashboard row objects", () => {
    const dataset: WidgetDataset = {
      key: "performance", categoryDisplayName: "Period", measureDisplayName: "Sales · Margin",
      series: [{ key: "sales", label: "Sales" }, { key: "margin", label: "Margin" }],
      points: [
        { key: "sales-2025-online", axisKey: "2025␟Online", label: "Online", sort: 1, seriesKey: "sales", seriesLabel: "Sales", value: 36.5, color: "#000", dimensions: [{ key: "2025", label: "2025" }, { key: "online", label: "Online" }] },
        { key: "margin-2025-online", axisKey: "2025␟Online", label: "Online", sort: 1, seriesKey: "margin", seriesLabel: "Margin", value: 7.7, color: "#000", dimensions: [{ key: "2025", label: "2025" }, { key: "online", label: "Online" }] },
      ],
    };
    const binding = {
      id: "performance",
      dimensions: [{ column: "year", dimensionIndex: 0, use: "key" as const, valueType: "number" as const }, { column: "channel", dimensionIndex: 1, use: "label" as const }],
      measures: [{ column: "sales", seriesKey: "sales" }, { column: "gross_margin", seriesKey: "margin" }],
    };
    expect(materializedColumns(binding)).toEqual(["year", "channel", "sales", "gross_margin"]);
    expect(materializeClaudeRows(dataset, binding)).toEqual([{ year: 2025, channel: "Online", sales: 36.5, gross_margin: 7.7 }]);
  });
});
