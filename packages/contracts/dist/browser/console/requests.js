import { DAY_MS } from "../shared/time.js";
import { clockDateYear } from "../shared/clock.js";
export const REQUEST_KINDS = ["delete_workspace", "delete_person", "copy"];
export const REQUEST_KIND_WORDS = {
  delete_workspace: "Delete a workspace",
  delete_person: "A person asks to be deleted",
  copy: "A copy of everything"
};
const REQUEST_DUE_DAYS = 30;
export const REQUEST_STEP_KEYS = [
  "confirmed",
  "copy_sent",
  "number_released",
  "dry_run",
  "deleted",
  "passed_on",
  "answered",
  "sent",
  "told"
];
export const REQUEST_STEPS = {
  delete_workspace: ["confirmed", "copy_sent", "number_released", "dry_run", "deleted", "told"],
  delete_person: ["passed_on", "answered", "told"],
  copy: ["confirmed", "sent", "told"]
};
const REQUEST_STEP_WORDS = {
  confirmed: { title: "They confirmed", hint: "From the address on the account" },
  copy_sent: { title: "Their copy, sent", hint: "People, conversations, calls and consent, from Settings \u203A Billing" },
  number_released: { title: "Its number, given back", hint: "From its line, on Setup and lines" },
  dry_run: { title: "A dry run, and a backup", hint: "ops/delete-tenant.mjs without --apply: counts every row" },
  deleted: { title: "Deleted, for good", hint: "ops/delete-tenant.mjs with --apply, after the dry run" },
  passed_on: { title: "Passed to the business", hint: "The owner is the one who deletes them" },
  answered: { title: "The business answered", hint: "What they did, in the note" },
  sent: { title: "Sent", hint: "What the export doesn't hold, by hand" },
  told: { title: "They were told", hint: "A reply from the inbox" }
};
export function requestDueAt(askedAtIso) {
  return new Date(Date.parse(askedAtIso) + REQUEST_DUE_DAYS * DAY_MS).toISOString();
}
export function requestClock(dueAtIso, closedAtIso, nowMs) {
  if (closedAtIso) return { days: 0, words: "Closed", tone: "ok" };
  const days = Math.ceil((Date.parse(dueAtIso) - nowMs) / DAY_MS);
  if (days < 0) return { days, words: `${-days} day${days === -1 ? "" : "s"} late`, tone: "danger" };
  if (days === 0) return { days, words: "Due today", tone: "danger" };
  return { days, words: `${days} day${days === 1 ? "" : "s"} left`, tone: days <= 10 ? "warn" : "plain" };
}
export function requestCode(n) {
  return `Q-${n}`;
}
export function privacyRequestOf(dto, nowMs, tz) {
  const steps = REQUEST_STEPS[dto.kind].map((step) => {
    const doneAt = dto.steps[step] ?? null;
    const done = doneAt ? requestDayWords(doneAt, tz) : "";
    return {
      step,
      title: REQUEST_STEP_WORDS[step].title,
      hint: REQUEST_STEP_WORDS[step].hint,
      doneAt,
      says: done ? `Done ${done}` : REQUEST_STEP_WORDS[step].hint
    };
  });
  return {
    id: dto.id,
    code: requestCode(dto.number),
    kind: dto.kind,
    title: REQUEST_KIND_WORDS[dto.kind],
    workspace: dto.name ?? "No workspace",
    slug: dto.slug,
    askedBy: dto.asked_by,
    askedAt: dto.asked_at,
    asked: `Asked by ${dto.asked_by}, ${requestDayWords(dto.asked_at, tz)}`,
    ticket: dto.ticket,
    note: dto.note,
    clock: requestClock(dto.due_at, dto.closed_at, nowMs),
    steps,
    next: steps.find((s) => !s.doneAt)?.step ?? null,
    open: !dto.closed_at
  };
}
export function requestsInOrder(rows, nowMs, tz) {
  const open = rows.filter((r) => !r.closed_at).sort((a, b) => Date.parse(a.due_at) - Date.parse(b.due_at));
  const closed = rows.filter((r) => r.closed_at).sort((a, b) => Date.parse(b.closed_at ?? "") - Date.parse(a.closed_at ?? ""));
  return [...open, ...closed].map((r) => privacyRequestOf(r, nowMs, tz));
}
export function requestDayWords(iso, tz) {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? clockDateYear(ms, tz) : "";
}
function requestHasStep(kind, step) {
  return REQUEST_STEPS[kind].includes(step);
}
export function requestStepChange(dto, step, done, nowIso) {
  if (dto.closed_at) return { refused: "This request is closed already." };
  if (step === "close") {
    const left = REQUEST_STEPS[dto.kind].find((s) => !dto.steps[s]);
    if (left) return { refused: `Mark each step first: \u201C${REQUEST_STEP_WORDS[left].title}\u201D is not done.` };
    return { steps: { ...dto.steps }, closedAt: nowIso };
  }
  if (!requestHasStep(dto.kind, step)) return { refused: "That step is not one this request has." };
  const steps = { ...dto.steps };
  if (done) steps[step] = steps[step] ?? nowIso;
  else delete steps[step];
  return { steps, closedAt: null };
}
export const REQUEST_WORDS = {
  title: "Requests",
  sub: "What the data-deletion page promises: a workspace gone within 30 days of its owner asking; a person's request passed to the business",
  open: "Open",
  done: "Done",
  none: "Nothing is waiting.",
  file: "File a request",
  kind: "What they asked",
  workspace: "The workspace",
  workspaceHint: "Its address, as /w/ says it",
  askedBy: "Who asked",
  askedByHint: "Their email, as it came in",
  askedAt: "When they asked",
  markDone: "Mark done",
  undo: "Not done",
  close: "Close it",
  scriptNote: "The delete stays the script until the next tier: run it, then mark the step."
};
