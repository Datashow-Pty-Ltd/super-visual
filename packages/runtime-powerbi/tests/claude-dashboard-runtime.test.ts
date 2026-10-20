import { describe, expect, it, vi } from "vitest";
import { createClaudeDashboardRuntime } from "../src/claudeDashboard/runtime";

describe("Claude Dashboard compatibility runtime", () => {
  it("publishes data changes, keeps legacy aliases, and refreshes through the bridge", () => {
    const onRefresh = vi.fn();
    const onDatasetRead = vi.fn();
    const runtime = createClaudeDashboardRuntime({ bridge: { onRefresh, onDatasetRead } });
    const listener = vi.fn();
    runtime.onData(listener);
    const rows = [{ period: "2026-09", sales: 52 }];
    runtime.updateDataset({ id: "sales", status: "ok", data: rows });
    expect(runtime.data("sales")).toMatchObject({ status: "ok", data: rows, rows, value: rows, columns: ["period", "sales"], refreshing: false });
    runtime.data("sales");
    expect(onDatasetRead).toHaveBeenCalledTimes(1);
    runtime.refresh("sales");
    expect(runtime.data("sales")).toMatchObject({ data: rows, refreshing: true });
    expect(onRefresh).toHaveBeenCalledWith("sales");
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it("evaluates chained calculations and propagates missing input", () => {
    const runtime = createClaudeDashboardRuntime();
    runtime.calc("total", { inputs: ["sales"], title: "Total", description: "Sum", fn: (value) => (value as Array<{ sales: number }>).reduce((sum, row) => sum + row.sales, 0) });
    runtime.calc("double", { inputs: ["total"], title: "Double", description: "Twice total", fn: (value) => Number(value) * 2 });
    expect(runtime.data("double").status).toBe("missing");
    runtime.updateDataset({ id: "sales", status: "ok", data: [{ sales: 4 }, { sales: 6 }] });
    expect(runtime.data("double").data).toBe(20);
  });

  it("accepts safe parameters and resets defaults", () => {
    const onParamsChanged = vi.fn();
    const runtime = createClaudeDashboardRuntime({ defaults: { year: 2025 }, bridge: { onParamsChanged } });
    runtime.setParams({ year: 2026, category: "Bikes", bad: { nested: true }, multiline: "no\nthanks" });
    expect(runtime.params()).toEqual({ year: 2026, category: "Bikes" });
    runtime.resetParams();
    expect(runtime.params()).toEqual({ year: 2025 });
    expect(onParamsChanged).toHaveBeenCalledTimes(2);
  });
});
