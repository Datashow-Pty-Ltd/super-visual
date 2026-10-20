import type { DatasetKey } from "./model.js";

export interface WidgetManifestEntry {
  id: DatasetKey;
  order: "axis" | "value";
  selectable: boolean;
}

export const WIDGET_MANIFEST: Record<DatasetKey, WidgetManifestEntry> = {};
