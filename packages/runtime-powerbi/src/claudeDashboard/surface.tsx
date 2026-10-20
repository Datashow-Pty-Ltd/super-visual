import * as d3 from "d3";
import { useEffect, useRef, type ReactElement } from "react";
import type { ClaudeDashboardRuntime } from "./types";

export interface ClaudeDashboardBundle {
  html: string;
  css: string;
  mount: (context: { root: HTMLElement; dash: ClaudeDashboardRuntime; d3: typeof d3 }) => void | (() => void);
}
export interface ClaudeDashboardSurfaceProps { bundle: ClaudeDashboardBundle; runtime: ClaudeDashboardRuntime; }

export function ClaudeDashboardSurface({ bundle, runtime }: ClaudeDashboardSurfaceProps): ReactElement {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    element.replaceChildren();
    element.classList.add("sm-loading");
    element.dataset.smConfig = JSON.stringify({ animation: "wave", theme: "light", opacity: "1", borderRadius: "3" });
    const style = document.createElement("style");
    style.textContent = `${bundle.css}\n
.claude-dashboard-surface [hidden] { display: none !important; }
.claude-dashboard-surface .dashboard-structured-skeleton { background: transparent !important; background-image: none !important; }
.claude-dashboard-surface .dashboard-chart-skeleton { min-height: inherit; height: 100%; display: grid !important; grid-template-columns: repeat(8, minmax(0, 1fr)); align-items: end; gap: clamp(8px, 1.4vw, 20px); padding: clamp(22px, 4%, 42px) clamp(18px, 4%, 36px) 24px; visibility: visible !important; }
.claude-dashboard-surface .dashboard-chart-skeleton > span { display: block; min-height: 18px; visibility: visible !important; }
.claude-dashboard-surface .dashboard-table-skeleton td { padding-block: 9px; }
.claude-dashboard-surface .dashboard-table-skeleton span { display: block; height: 12px; width: var(--dashboard-skeleton-width, 72%); visibility: visible !important; }
`;
    const root = document.createElement("div");
    root.id = "dash-root";
    const parsed = new DOMParser().parseFromString(bundle.html, "text/html");
    root.append(...Array.from(parsed.body.childNodes).map((node) => document.importNode(node, true)));
    element.append(style, root);

    let skeletonSyncScheduled = false;
    const ensureChartSkeleton = (node: HTMLElement): void => {
      node.classList.add("dashboard-structured-skeleton");
      node.classList.remove("sm-item-primary");
      if (node.querySelector(":scope > .dashboard-chart-skeleton")) return;
      const scaffold = document.createElement("div");
      scaffold.className = "dashboard-chart-skeleton";
      scaffold.setAttribute("aria-hidden", "true");
      for (const height of [34, 58, 46, 76, 54, 88, 67, 42]) {
        const bar = document.createElement("span");
        bar.className = "sm-item-secondary";
        bar.style.height = `${height}%`;
        scaffold.appendChild(bar);
      }
      node.appendChild(scaffold);
    };
    const syncSkeletons = (): void => {
      skeletonSyncScheduled = false;
      root.querySelectorAll<HTMLElement>(".dash-skeleton").forEach((node) => {
        if (node.classList.contains("ax-chart") || node.hasAttribute("data-chart")) ensureChartSkeleton(node);
        else node.classList.add("sm-item-primary");
      });
      root.querySelectorAll<HTMLElement>(".sm-item-primary:not(.dash-skeleton)").forEach((node) => node.classList.remove("sm-item-primary"));
      root.querySelectorAll<HTMLElement>(".dashboard-structured-skeleton:not(.dash-skeleton)").forEach((node) => { node.classList.remove("dashboard-structured-skeleton"); node.querySelector(":scope > .dashboard-chart-skeleton")?.remove(); });
    };
    const scheduleSkeletonSync = (): void => { if (!skeletonSyncScheduled) { skeletonSyncScheduled = true; queueMicrotask(syncSkeletons); } };
    const skeletonObserver = new MutationObserver(scheduleSkeletonSync);
    skeletonObserver.observe(root, { attributes: true, attributeFilter: ["class"], childList: true, subtree: true });
    syncSkeletons();
    const resizeObserver = new ResizeObserver((entries) => runtime.setWidth(entries[0]?.contentRect.width ?? root.clientWidth));
    resizeObserver.observe(root);
    const cleanup = bundle.mount({ root, dash: runtime, d3 });
    const syncSourceStates = (): void => {
      const states = new Map<string, ReturnType<ClaudeDashboardRuntime["data"]>>();
      root.querySelectorAll<HTMLElement>("[data-source]").forEach((node) => {
        const id = node.dataset.source;
        if (!id) return;
        const state = states.get(id) ?? runtime.data(id);
        states.set(id, state);
        node.dataset.dashSourceState = state.status === "ok" ? state.refreshing ? "refreshing" : "ready" : state.status;
        if (!(node instanceof HTMLTableElement)) return;
        node.querySelectorAll("tbody > tr.dashboard-table-skeleton").forEach((row) => row.remove());
        if (state.status === "ok" || state.status === "error") return;
        const body = node.tBodies[0] ?? node.createTBody();
        const columns = Math.max(1, node.tHead?.rows[0]?.cells.length ?? 1);
        for (let rowIndex = 0; rowIndex < 5; rowIndex += 1) {
          const row = body.insertRow();
          row.className = "dashboard-table-skeleton";
          row.setAttribute("aria-hidden", "true");
          for (let columnIndex = 0; columnIndex < columns; columnIndex += 1) {
            const cell = row.insertCell();
            const line = document.createElement("span");
            line.className = columnIndex === 0 ? "sm-item-primary" : "sm-item-secondary";
            line.style.setProperty("--dashboard-skeleton-width", `${58 + (rowIndex * 13 + columnIndex * 17) % 36}%`);
            cell.appendChild(line);
          }
        }
      });
      scheduleSkeletonSync();
    };
    const unsubscribeSourceStates = runtime.onData(syncSourceStates);
    runtime.setWidth(root.clientWidth);
    return () => { skeletonObserver.disconnect(); resizeObserver.disconnect(); unsubscribeSourceStates(); cleanup?.(); element.replaceChildren(); };
  }, [bundle, runtime]);
  return <div className="claude-dashboard-surface" ref={host} />;
}
