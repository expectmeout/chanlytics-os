import { stepIsDue } from "../../notes/steps.js";
import { waitingOnProposal } from "../deal-waits.js";
import {
  PIPELINE_GROUPS
} from "./pipeline-vm.js";
import { GROUP_WORDS, PIPELINE_WORDS } from "./pipeline-words.js";
const VIEW_KINDS = /* @__PURE__ */ (() => [
  "all",
  ...PIPELINE_GROUPS,
  "waiting",
  "lapsed",
  "steps"
])();
export function isPipelineView(s) {
  return typeof s === "string" && (VIEW_KINDS.includes(s) || s.startsWith("svc:") && s.slice(4).trim() !== "");
}
export function serviceOf(view) {
  return view.startsWith("svc:") ? view.slice(4) : null;
}
const waitingLabel = (pace) => pace ? PIPELINE_WORDS.rail.waitingPaced(pace.waitDays) : PIPELINE_WORDS.rail.waiting;
export function pipelineViewLabel(view, pace) {
  const svc = serviceOf(view);
  if (svc !== null) return svc;
  if (view === "waiting") return waitingLabel(pace);
  if (view === "lapsed") return PIPELINE_WORDS.rail.lapsed;
  if (view === "steps") return PIPELINE_WORDS.rail.steps;
  if (view === "all") return PIPELINE_WORDS.rail.all;
  return GROUP_WORDS[view];
}
const PEEK_ID = /^[A-Za-z0-9_-]{1,80}$/;
export function pipelineRoute(v = {}) {
  const parts = ["clients/pipeline"];
  const view = v.view && isPipelineView(v.view) ? v.view : "all";
  const svc = serviceOf(view);
  if (svc !== null) parts.push(`v-s.${encodeURIComponent(svc)}`);
  else if (view !== "all") parts.push(`v-${view}`);
  if (v.peek && PEEK_ID.test(v.peek)) parts.push(`p-${v.peek}`);
  return parts.join(":");
}
export function parsePipelineRoute(route) {
  const [head, ...segs] = String(route ?? "").split(":");
  if (head !== "clients/pipeline" && head !== "pipeline") return null;
  let view = "all";
  let peek = null;
  for (const s of segs) {
    if (s.startsWith("v-s.")) {
      let name;
      try {
        name = decodeURIComponent(s.slice(4));
      } catch {
        continue;
      }
      if (name.trim()) view = `svc:${name}`;
    } else if (s.startsWith("v-")) {
      const k = s.slice(2);
      if (VIEW_KINDS.includes(k)) view = k;
    } else if (s.startsWith("p-") && PEEK_ID.test(s.slice(2))) peek = s.slice(2);
  }
  return { view, peek };
}
export const stepDue = (r) => stepIsDue(r.next);
export const PIPELINE_RAIL_SERVICES = 8;
export function pipelineRail(vm, nowMs) {
  const count = (key) => vm.groups.find((g) => g.key === key)?.count ?? 0;
  const deals = [
    { view: "all", label: PIPELINE_WORDS.rail.all, count: vm.groups.reduce((n, g) => n + g.count, 0), tone: null },
    ...PIPELINE_GROUPS.map((key) => ({
      view: key,
      label: GROUP_WORDS[key],
      count: count(key),
      tone: null
    }))
  ];
  const proposals = vm.groups.find((g) => g.key === "proposals")?.rows ?? [];
  const waiting = proposals.filter(
    (r) => waitingOnProposal({ deal: r.deal, askedMs: r.person.askedMs }, nowMs, vm.pace)
  ).length;
  const lapsed = proposals.filter((r) => !!r.deal?.validUntil?.lapsed).length;
  const steps = vm.groups.reduce((n, g) => n + g.rows.filter(stepDue).length, 0);
  const waits = [
    { view: "waiting", label: waitingLabel(vm.pace), count: waiting, tone: "warn" },
    { view: "lapsed", label: PIPELINE_WORDS.rail.lapsed, count: lapsed, tone: "warn" },
    // A next step whose day has come (0007, amended), on anyone the Pipeline holds.
    { view: "steps", label: PIPELINE_WORDS.rail.steps, count: steps, tone: "warn" }
  ].filter((r) => r.count > 0);
  const bySvc = /* @__PURE__ */ new Map();
  for (const g of vm.groups) {
    if (g.key === "consultations") continue;
    for (const r of g.rows) if (r.service) bySvc.set(r.service, (bySvc.get(r.service) ?? 0) + 1);
  }
  const services = [...bySvc.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, PIPELINE_RAIL_SERVICES).map(([name, n]) => ({ view: `svc:${name}`, label: name, count: n, tone: null }));
  return [
    { key: "deals", label: PIPELINE_WORDS.rail.deals, rows: deals },
    { key: "waiting", label: PIPELINE_WORDS.rail.toFollowUp, rows: waits },
    { key: "services", label: PIPELINE_WORDS.rail.services, rows: services }
  ].filter((s) => s.rows.length > 0);
}
