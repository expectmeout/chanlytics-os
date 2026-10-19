import { foldName, needsConsultation, serviceNamedIn } from "../calendar/service-offer.js";
import { DAY_MS } from "../shared/time.js";
import { dealIsOpen } from "./deal-vm.js";
export const CONSULT_FOLLOW_DAYS = 7;
export function consultServiceOf(title, services, rules) {
  return serviceNamedIn(title, services, (name) => needsConsultation(name, rules));
}
export function isConsultationTitle(title, services, rules) {
  const t = foldName(String(title ?? "").trim());
  if (!t) return false;
  if (t.includes("consult")) return true;
  return consultServiceOf(title, services, rules) !== null;
}
export function consultationHappened(visit) {
  return visit?.status !== "missed" && visit?.status !== "cancelled";
}
export function noProposalSince(deal, endedMs) {
  if (!deal) return true;
  if (dealIsOpen(deal)) return false;
  return deal.sinceMs !== null && deal.sinceMs < endedMs;
}
export function consultationHeld(r, nowMs) {
  const at = r.consultedMs;
  if (typeof at !== "number" || !Number.isFinite(at)) return false;
  if (at > nowMs || nowMs - at > CONSULT_FOLLOW_DAYS * DAY_MS) return false;
  if (r.nextVisitMs !== null) return false;
  return noProposalSince(r.deal, at);
}
export function dealStageOf(r, nowMs) {
  if (consultationHeld(r, nowMs)) return "consultation";
  const d = r.deal;
  if (d && (d.stage === "proposed" || d.stage === "won")) return d.stage;
  if (r.consultAhead) return "consultation";
  return d ? d.stage : null;
}
export function dealStagesOf(stage, open) {
  const theirs = open.map((d) => d.stage).filter((s) => s === "proposed" || s === "won");
  return [...new Set(stage ? [stage, ...theirs] : theirs)];
}
export function consultationsWithoutProposal(rows, nowMs) {
  const endOf = (r) => r.consultedMs;
  return rows.filter((r) => consultationHeld(r, nowMs)).sort(
    (a, b) => endOf(a) - endOf(b) || String(a.name ?? "").localeCompare(String(b.name ?? "")) || String(a.id ?? "").localeCompare(String(b.id ?? ""))
  );
}
export function consultsHeldWords(n) {
  return `${n} ended in the last week, nothing since`;
}
