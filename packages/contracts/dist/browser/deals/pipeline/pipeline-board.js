import { DEAL_LOST_REASONS, DEAL_LOST_REASON_WORDS } from "../deal-words.js";
import { GROUP_WORDS, PIPELINE_WORDS } from "./pipeline-words.js";
import { csvCell } from "../../imports/csv.js";
export function pipelineMove(from, to, row) {
  if (from === to) return null;
  const deal = row.deal;
  if (from === "consultations" && to === "proposals") return { mode: "propose", dealId: null };
  if (from === "proposals" && deal?.stage === "proposed") {
    if (to === "clients") return { mode: "won", dealId: deal.id };
    if (to === "closed") return { mode: "lost", dealId: deal.id };
  }
  if (from === "clients" && to === "closed" && deal?.stage === "won") return { mode: "ended", dealId: deal.id };
  if (from === "closed" && to === "proposals" && deal)
    return deal.stage === "lost" ? { mode: "again", dealId: deal.id } : { mode: "propose", dealId: null };
  return null;
}
export const PIPELINE_SORTS = ["stage", "value", "name", "next"];
export const PIPELINE_PHONE_SORTS = [
  { by: "stage", dir: "asc", label: "By stage" },
  { by: "value", dir: "desc", label: "Highest value first" },
  { by: "next", dir: "asc", label: "Next step soonest" },
  { by: "name", dir: "asc", label: "Name, A to Z" }
];
export function pipelineCsv(rows) {
  const head = ["Name", "Phone", "Email", "Stage", "Service", "Value", "Standing", "In stage", "Next step"];
  const lines = rows.map(
    (r) => [
      r.name,
      r.person.phone || "",
      r.person.email || "",
      GROUP_WORDS[r.group],
      r.service || "",
      r.value || "",
      r.chip ? r.chip.words : "",
      r.inStage,
      r.next ? `${r.next.words} (${r.next.when})` : ""
    ].map(csvCell).join(",")
  );
  return [head.map(csvCell).join(","), ...lines].join("\r\n");
}
function yearCents(d) {
  if (!d || d.amountCents === null || !Number.isFinite(d.amountCents)) return null;
  return d.per === "month" ? d.amountCents * 12 : d.amountCents;
}
export function pipelineSorted(vm, by, dir) {
  const sort = PIPELINE_SORTS.includes(by ?? "") ? by : "stage";
  if (sort === "stage" && dir !== "desc") return vm;
  const sign = dir === "desc" ? -1 : 1;
  const groups = vm.groups.map((g) => {
    const ranked = g.rows.map((r, i) => ({ r, i }));
    ranked.sort((a, b) => {
      if (sort === "stage") return sign * (a.i - b.i);
      if (sort === "name") return sign * a.r.name.localeCompare(b.r.name) || a.i - b.i;
      if (sort === "next") {
        const x2 = a.r.next?.day ?? null;
        const y2 = b.r.next?.day ?? null;
        if (x2 === y2) return a.i - b.i;
        if (x2 === null) return 1;
        if (y2 === null) return -1;
        return sign * x2.localeCompare(y2);
      }
      const x = a.r.value === null ? null : yearCents(a.r.deal);
      const y = b.r.value === null ? null : yearCents(b.r.deal);
      if (x === y) return a.i - b.i;
      if (x === null) return 1;
      if (y === null) return -1;
      return sign * (x - y);
    });
    return { ...g, rows: ranked.map((x) => x.r) };
  });
  return { ...vm, groups };
}
export const PIPELINE_PASS_MAX = 50;
export function pipelinePassMany(rows) {
  const out = rows.filter((r) => r.deal && r.deal.stage === "proposed" && r.deal.id).map((r) => ({ personId: r.id, dealId: r.deal.id, rowId: r.rowId ?? r.id }));
  const deals = out.slice(0, PIPELINE_PASS_MAX);
  const later = out.length - deals.length;
  const k = rows.length - out.length;
  return {
    deals,
    button: deals.length ? `${PIPELINE_WORDS.pass.button} \xB7 ${deals.length}` : null,
    words: deals.length ? `Mark ${deals.length} as passed` : null,
    more: later ? `${later} more stay selected, fifty at a time` : null,
    rest: k ? k === 1 ? "1 is not a proposal out and stays as it is" : `${k} are not proposals out and stay as they are` : null,
    reasons: DEAL_LOST_REASONS.map((code) => ({ code, words: DEAL_LOST_REASON_WORDS[code] }))
  };
}
export function pipelinePassDone(done, changed, failed = 0) {
  const parts = [];
  if (done || !changed && !failed) parts.push(done === 1 ? "1 marked as passed" : `${done} marked as passed`);
  if (changed)
    parts.push(
      changed === 1 ? "1 had changed, and was left as it is" : `${changed} had changed, and were left as they are`
    );
  if (failed) parts.push(failed === 1 ? "1 could not be marked" : `${failed} could not be marked`);
  return { words: parts.join(" \xB7 "), tone: failed && !done ? "danger" : changed || failed ? "warn" : "ok" };
}
export const PIPELINE_BOARD_CAP = 20;
export function pipelineBoardMore(n) {
  return `Show ${n} more`;
}
