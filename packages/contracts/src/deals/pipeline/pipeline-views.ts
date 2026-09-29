/**
 * The Pipeline's own views (0008): what the rail picks and the address carries (PipelineView), the address itself
 * (pipelineRoute, parsePipelineRoute), and the rail of its groups, its waits and its services (pipelineRail). The
 * Pipeline they are views of is pipeline.ts's.
 */
import { stepIsDue } from "../../notes/steps";
import { waitingOnProposal, type DealPaceVM } from "../deal-waits";
import {
  PIPELINE_GROUPS,
  type PipelineGroupKey,
  type PipelineNextVM,
  type PipelineSource,
  type PipelineVM,
} from "./pipeline-vm";
import { GROUP_WORDS, PIPELINE_WORDS } from "./pipeline-words";

/* ------------------------------------------------ the Pipeline's own views: the rail and the address */

/**
 * What the rail picks and the address carries: the whole Pipeline, one group, what waits on the owner (nothing back in
 * a week, lapsed), or one service's deals (`svc:<its name>`).
 */
export type PipelineView = "all" | PipelineGroupKey | "waiting" | "lapsed" | "steps" | `svc:${string}`;

// Built inside a call marked pure, as GROUP_WORDS is: a spread is a side effect to the bundler, and unmarked this
// list, and the groups with it, stayed in the channels, core, db and jobs dists.
const VIEW_KINDS: readonly string[] = /* @__PURE__ */ (() => [
  "all",
  ...PIPELINE_GROUPS,
  "waiting",
  "lapsed",
  "steps",
])();

export function isPipelineView(s: unknown): s is PipelineView {
  return typeof s === "string" && (VIEW_KINDS.includes(s) || (s.startsWith("svc:") && s.slice(4).trim() !== ""));
}

/** The service a view is of; null for any other view. */
export function serviceOf(view: PipelineView): string | null {
  return view.startsWith("svc:") ? view.slice(4) : null;
}

/** What waits on the owner, by the workspace's pace: past a week, or past its pace once it has one. */
const waitingLabel = (pace: DealPaceVM | null): string =>
  pace ? PIPELINE_WORDS.rail.waitingPaced(pace.waitDays) : PIPELINE_WORDS.rail.waiting;

/** A view in the owner's words: the rail's own label for it, the phone's button says the same. */
export function pipelineViewLabel(view: PipelineView, pace: DealPaceVM | null): string {
  const svc = serviceOf(view);
  if (svc !== null) return svc;
  if (view === "waiting") return waitingLabel(pace);
  if (view === "lapsed") return PIPELINE_WORDS.rail.lapsed;
  if (view === "steps") return PIPELINE_WORDS.rail.steps;
  if (view === "all") return PIPELINE_WORDS.rail.all;
  return GROUP_WORDS[view as PipelineGroupKey];
}

/** A person's id as the address may carry it: a person's id is a uuid, and nothing with a separator in it is one. */
const PEEK_ID = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * The Pipeline's address, as Leads spells its own (contracts leadsRoute): `clients/pipeline`, then the view
 * (`v-proposals`, or a service as `v-s.<its name, encoded>`), then the person open over it (`p-<id>`). The shell reads
 * the hash as it stands, so an encoded name keeps its colons and slashes out of the separators.
 */
export function pipelineRoute(v: { view?: PipelineView | null; peek?: string | null } = {}): string {
  const parts = ["clients/pipeline"];
  const view = v.view && isPipelineView(v.view) ? v.view : "all";
  const svc = serviceOf(view);
  if (svc !== null) parts.push(`v-s.${encodeURIComponent(svc)}`);
  else if (view !== "all") parts.push(`v-${view}`);
  if (v.peek && PEEK_ID.test(v.peek)) parts.push(`p-${v.peek}`);
  return parts.join(":");
}

/** The view and the person an address names; null for an address that is not the Pipeline's. Anything else is left. */
export function parsePipelineRoute(
  route: string | null | undefined,
): { view: PipelineView; peek: string | null } | null {
  const [head, ...segs] = String(route ?? "").split(":");
  if (head !== "clients/pipeline" && head !== "pipeline") return null;
  let view: PipelineView = "all";
  let peek: string | null = null;
  for (const s of segs) {
    if (s.startsWith("v-s.")) {
      let name: string;
      try {
        name = decodeURIComponent(s.slice(4));
      } catch {
        continue;
      }
      if (name.trim()) view = `svc:${name}`;
    } else if (s.startsWith("v-")) {
      const k = s.slice(2);
      if (VIEW_KINDS.includes(k)) view = k as PipelineView;
    } else if (s.startsWith("p-") && PEEK_ID.test(s.slice(2))) peek = s.slice(2);
  }
  return { view, peek };
}

/** A row whose next step's day has come: today, or before it. */
export const stepDue = (r: { next: PipelineNextVM | null }): boolean => stepIsDue(r.next);

/** One row of the Pipeline's rail: the view it picks, its words, how many, and warn where it counts what waits. */
export interface PipelineRailRow {
  view: PipelineView;
  label: string;
  count: number;
  tone: "warn" | null;
}

export interface PipelineRailSection {
  key: "deals" | "waiting" | "services";
  label: string;
  rows: PipelineRailRow[];
}

/** How many services the rail lists: the busiest, then by name. */
export const PIPELINE_RAIL_SERVICES = 8;

/**
 * The Pipeline's own rail, from the whole Pipeline (`pipelineOf` with no view): All deals and each group, always, so the
 * rail keeps its shape; what waits on the owner, each only when there is some; and each service a deal is for, the
 * busiest first. A consultation has no deal yet, so it counts under its group and All deals, never a service.
 */
export function pipelineRail<T extends PipelineSource>(vm: PipelineVM<T>, nowMs: number): PipelineRailSection[] {
  const count = (key: PipelineGroupKey) => vm.groups.find((g) => g.key === key)?.count ?? 0;
  const deals: PipelineRailRow[] = [
    { view: "all", label: PIPELINE_WORDS.rail.all, count: vm.groups.reduce((n, g) => n + g.count, 0), tone: null },
    ...PIPELINE_GROUPS.map((key) => ({
      view: key,
      label: GROUP_WORDS[key],
      count: count(key),
      tone: null,
    })),
  ];
  const proposals = vm.groups.find((g) => g.key === "proposals")?.rows ?? [];
  const waiting = proposals.filter((r) => waitingOnProposal(r.person, nowMs, vm.pace)).length;
  const lapsed = proposals.filter((r) => !!r.person.deal?.validUntil?.lapsed).length;
  const steps = vm.groups.reduce((n, g) => n + g.rows.filter(stepDue).length, 0);
  const waits: PipelineRailRow[] = [
    { view: "waiting" as PipelineView, label: waitingLabel(vm.pace), count: waiting, tone: "warn" as const },
    { view: "lapsed" as PipelineView, label: PIPELINE_WORDS.rail.lapsed, count: lapsed, tone: "warn" as const },
    // A next step whose day has come (0007, amended), on anyone the Pipeline holds.
    { view: "steps" as PipelineView, label: PIPELINE_WORDS.rail.steps, count: steps, tone: "warn" as const },
  ].filter((r) => r.count > 0);
  const bySvc = new Map<string, number>();
  for (const g of vm.groups) {
    if (g.key === "consultations") continue;
    for (const r of g.rows) if (r.service) bySvc.set(r.service, (bySvc.get(r.service) ?? 0) + 1);
  }
  const services: PipelineRailRow[] = [...bySvc.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, PIPELINE_RAIL_SERVICES)
    .map(([name, n]) => ({ view: `svc:${name}` as PipelineView, label: name, count: n, tone: null }));
  return [
    { key: "deals" as const, label: PIPELINE_WORDS.rail.deals, rows: deals },
    { key: "waiting" as const, label: PIPELINE_WORDS.rail.waitingOnYou, rows: waits },
    { key: "services" as const, label: PIPELINE_WORDS.rail.services, rows: services },
  ].filter((s) => s.rows.length > 0);
}
