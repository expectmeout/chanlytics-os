/**
 * Requests (decision 0066, 6): what the data-deletion page promises in public, kept with its clock. A workspace is gone
 * within thirty days of its owner asking from the address on the account; a person who wrote to a business is passed to
 * that business, which is the one who deletes them; a copy of everything is sent. Each request keeps its steps, and
 * outlives the workspace it was about (privacy_requests keeps its name and slug).
 */
import type { Tone } from "../shell/tone";
import { DAY_MS } from "../shared/time";
import { clockDateYear } from "../shared/clock";

export const REQUEST_KINDS = ["delete_workspace", "delete_person", "copy"] as const;
export type RequestKind = (typeof REQUEST_KINDS)[number];

export const REQUEST_KIND_WORDS: Record<RequestKind, string> = {
  delete_workspace: "Delete a workspace",
  delete_person: "A person asks to be deleted",
  copy: "A copy of everything",
};

/** The page's promise: answered within thirty days. */
const REQUEST_DUE_DAYS = 30;

/** Every step a request may have. */
export const REQUEST_STEP_KEYS = [
  "confirmed",
  "copy_sent",
  "number_released",
  "dry_run",
  "deleted",
  "passed_on",
  "answered",
  "sent",
  "told",
] as const;
export type RequestStep = (typeof REQUEST_STEP_KEYS)[number];

/** Each kind's steps, in order. The delete itself is `tooling/scripts/ops/delete-tenant.mjs` until the next tier. */
export const REQUEST_STEPS: Record<RequestKind, readonly RequestStep[]> = {
  delete_workspace: ["confirmed", "copy_sent", "number_released", "dry_run", "deleted", "told"],
  delete_person: ["passed_on", "answered", "told"],
  copy: ["confirmed", "sent", "told"],
};

const REQUEST_STEP_WORDS: Record<RequestStep, { title: string; hint: string }> = {
  confirmed: { title: "They confirmed", hint: "From the address on the account" },
  copy_sent: { title: "Their copy, sent", hint: "People, conversations, calls and consent, from Settings › Billing" },
  number_released: { title: "Its number, given back", hint: "From its line, on Setup and lines" },
  dry_run: { title: "A dry run, and a backup", hint: "ops/delete-tenant.mjs without --apply: counts every row" },
  deleted: { title: "Deleted, for good", hint: "ops/delete-tenant.mjs with --apply, after the dry run" },
  passed_on: { title: "Passed to the business", hint: "The owner is the one who deletes them" },
  answered: { title: "The business answered", hint: "What they did, in the note" },
  sent: { title: "Sent", hint: "What the export doesn't hold, by hand" },
  told: { title: "They were told", hint: "A reply from the inbox" },
};

/** One request as privacy_requests keeps it. */
export interface PrivacyRequestDto {
  id: string;
  number: number;
  kind: RequestKind;
  tenant_id: string | null;
  slug: string | null;
  name: string | null;
  asked_by: string;
  asked_at: string;
  ticket: string | null;
  note: string | null;
  due_at: string;
  /** Each step done, and when: a step not yet done is absent. */
  steps: Partial<Record<RequestStep, string>>;
  closed_at: string | null;
  created_at: string;
}

/** When a request asked at this moment is due: the promise's thirty days. */
export function requestDueAt(askedAtIso: string): string {
  return new Date(Date.parse(askedAtIso) + REQUEST_DUE_DAYS * DAY_MS).toISOString();
}

/** How long a request has left, in words and the tone it is said in: amber in its last ten days, red once late. */
export function requestClock(
  dueAtIso: string,
  closedAtIso: string | null,
  nowMs: number,
): { days: number; words: string; tone: Tone } {
  if (closedAtIso) return { days: 0, words: "Closed", tone: "ok" };
  const days = Math.ceil((Date.parse(dueAtIso) - nowMs) / DAY_MS);
  if (days < 0) return { days, words: `${-days} day${days === -1 ? "" : "s"} late`, tone: "danger" };
  if (days === 0) return { days, words: "Due today", tone: "danger" };
  return { days, words: `${days} day${days === 1 ? "" : "s"} left`, tone: days <= 10 ? "warn" : "plain" };
}

/** A request's Q-number, as the inbox and the log say it. */
export function requestCode(n: number): string {
  return `Q-${n}`;
}

export interface RequestStepVM {
  step: RequestStep;
  title: string;
  hint: string;
  doneAt: string | null;
  /** "Done Oct 20, 2026" by the reader's calendar, or the step's hint while it waits. */
  says: string;
}

export interface PrivacyRequestVM {
  id: string;
  code: string;
  kind: RequestKind;
  title: string;
  /** The workspace, by the name it had when the request was filed. */
  workspace: string;
  slug: string | null;
  askedBy: string;
  askedAt: string;
  /** "Asked by dana@example.com, Oct 1, 2026" by the reader's calendar. */
  asked: string;
  ticket: string | null;
  note: string | null;
  clock: { days: number; words: string; tone: Tone };
  steps: RequestStepVM[];
  /** The first step not yet done, or null when all are. */
  next: RequestStep | null;
  open: boolean;
}

/** A request, in words, with its clock and its steps in order. */
/** A request as its screen says it, its dates by the reader's calendar (`tz`). */
export function privacyRequestOf(dto: PrivacyRequestDto, nowMs: number, tz: string): PrivacyRequestVM {
  const steps = REQUEST_STEPS[dto.kind].map((step) => {
    const doneAt = dto.steps[step] ?? null;
    const done = doneAt ? requestDayWords(doneAt, tz) : "";
    return {
      step,
      title: REQUEST_STEP_WORDS[step].title,
      hint: REQUEST_STEP_WORDS[step].hint,
      doneAt,
      says: done ? `Done ${done}` : REQUEST_STEP_WORDS[step].hint,
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
    open: !dto.closed_at,
  };
}

/** Open requests first, the soonest due first; then the closed, the latest closed first. */
export function requestsInOrder(rows: readonly PrivacyRequestDto[], nowMs: number, tz: string): PrivacyRequestVM[] {
  const open = rows.filter((r) => !r.closed_at).sort((a, b) => Date.parse(a.due_at) - Date.parse(b.due_at));
  const closed = rows
    .filter((r) => r.closed_at)
    .sort((a, b) => Date.parse(b.closed_at ?? "") - Date.parse(a.closed_at ?? ""));
  return [...open, ...closed].map((r) => privacyRequestOf(r, nowMs, tz));
}

/** A day a request names ("Oct 1, 2026"), by the reader's calendar; empty for one that is not a date. */
export function requestDayWords(iso: string, tz: string): string {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? clockDateYear(ms, tz) : "";
}

/** Whether a step belongs to a kind: a route refuses one that does not. */
function requestHasStep(kind: RequestKind, step: string): step is RequestStep {
  return (REQUEST_STEPS[kind] as readonly string[]).includes(step);
}

/**
 * What marking a step done or not done, or closing, does to a request: its steps written whole, or the words it is
 * refused in. A request closes once every step of its kind is done; a closed one changes no more.
 */
export function requestStepChange(
  dto: Pick<PrivacyRequestDto, "kind" | "steps" | "closed_at">,
  step: RequestStep | "close",
  done: boolean,
  nowIso: string,
): { steps: Partial<Record<RequestStep, string>>; closedAt: string | null } | { refused: string } {
  if (dto.closed_at) return { refused: "This request is closed already." };
  if (step === "close") {
    const left = REQUEST_STEPS[dto.kind].find((s) => !dto.steps[s]);
    if (left) return { refused: `Mark each step first: “${REQUEST_STEP_WORDS[left].title}” is not done.` };
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
  scriptNote: "The delete stays the script until the next tier: run it, then mark the step.",
} as const;
