import { DATASET_KEYS, type DatasetKey } from "./model.js";
import { SELECTION_DEPENDENCIES } from "./dependencyManifest.js";

function contextParts(context: string): Record<string, string> {
  return Object.fromEntries(context.split(";").map((part) => {
    const separator = part.indexOf("=");
    return separator < 0 ? [part, ""] : [part.slice(0, separator), part.slice(separator + 1)];
  }));
}

export function contextValue(context: string, key: string): string {
  return contextParts(context)[key] ?? "";
}

export function businessContextMatches(
  context: string,
  source: DatasetKey,
  expectedValue: string | number | boolean | null,
  previousValue: string | number | boolean | null,
): boolean {
  const observed = contextValue(context, source);
  if (!observed) return false;
  if (expectedValue === null) return previousValue !== null && observed !== String(previousValue);
  return observed === String(expectedValue);
}

export function dependentWidgets(source: DatasetKey): DatasetKey[] {
  return [...(SELECTION_DEPENDENCIES[source] ?? DATASET_KEYS.filter((key) => key !== source))];
}

/**
 * The deliberately small POC dependency matrix. Unknown or missing context is
 * conservative: every cached widget is invalidated rather than serving data
 * under a context we cannot prove equivalent.
 */
export function invalidatedWidgets(previousContext: string, nextContext: string): DatasetKey[] {
  if (!previousContext || !nextContext) return [...DATASET_KEYS];
  const previous = contextParts(previousContext);
  const next = contextParts(nextContext);
  const changedSources = DATASET_KEYS.filter((key) => previous[key] !== next[key]);
  if (changedSources.length === 0) return [];
  const invalidated = new Set<DatasetKey>();
  for (const source of changedSources) {
    for (const dependant of dependentWidgets(source)) invalidated.add(dependant);
  }
  return DATASET_KEYS.filter((key) => invalidated.has(key));
}
