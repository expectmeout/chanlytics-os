/**
 * A proposal follow-up: who it is for, the breath after a touch, when it would run, and the words for it. Moved whole
 * from playbooks.ts (Reach out Part 2.5), which re-exports it.
 */
import { shiftKey } from "../calendar/calendar";
import { clockNear, wallClockAt, zoneDayKey } from "../shared/clock";
import { type AskedPurpose, purposeOfPlaybook } from "../consent/consent";
import { SELLS_BY_QUESTION, SELLS_BY_WORDS } from "../deals/sells-by";
import { type DealPaceVM, waitingOnProposal } from "../deals/deal-waits";
import { type PersonRowVM, whyNotReceive } from "../people/people";
import { runDueNow } from "./playbook-schedule";
import { DAY_MS, sweepTickAtOrAfter } from "./playbook-time";
import { PLAYBOOK_BREATH_MS } from "./playbook-triggers";

/** Why a proposal follow-up is not made or run here: deals are off. The check, a run now and Ask say it alike. */
export const FOLLOW_UP_NEEDS_DEALS = `Proposal follow-ups need deals: in Settings › Business, answer “${SELLS_BY_QUESTION}” with “${SELLS_BY_WORDS.proposal.label}”.`;

/** Why a follow-up must carry its proposal's link (0006): without it the nudge is a bare "just checking in". */
export const FOLLOW_UP_NEEDS_LINK =
  "A proposal follow-up carries the proposal's link: pick a message with a slot for it, and fill that slot with their proposal's link.";

/** Why a second proposal follow-up is refused (00167): two would each owe every proposal its nudge. */
export const FOLLOW_UP_ONE =
  "This workspace already has a proposal follow-up. Change that one rather than starting another.";

/**
 * How far back a touch can still hold somebody back: the longest gap a playbook may set (365 days, core
 * check-playbook), plus the week's breath. The sweep reads its touches this far back, and a proposal is followed up
 * only while its follow-up would still be among them (0006): past it, a second nudge could not be told from a first.
 */
export const PLAYBOOK_TOUCH_WINDOW_MS = (365 + 7) * DAY_MS;

/**
 * Who the proposal follow-up names (0006): waiting on a proposal, by Today's own rule and the workspace's pace, with a
 * link to carry -- without one the nudge would be a bare "just checking in", which is a person's to write -- and out
 * no longer than the touches are read, so its follow-up, whenever it went, is still seen. The run's reach
 * (playbookRunReach) and each person's standing (followUpStandOf) both ask it.
 */
export function followUpNames(
  r: Pick<PersonRowVM, "deal" | "askedMs">,
  nowMs: number,
  pace: Pick<DealPaceVM, "waitDays"> | null,
): boolean {
  return (
    waitingOnProposal(r, nowMs, pace) &&
    !!r.deal?.proposal?.url &&
    nowMs - (r.deal.sinceMs ?? Number.NEGATIVE_INFINITY) <= PLAYBOOK_TOUCH_WINDOW_MS
  );
}

/**
 * The proposal follow-up as People and Today read it (0006), answered by the People read where deals are on and a
 * follow-up runs under a mode other than never: its clock, whether its runs wait for a person, and, from any
 * playbook's runs since the oldest proposal out, who had theirs and who is in a run on its way or waiting; and who
 * heard from any run this week, whom the week's breath holds. Contact id -> when.
 */
export interface FollowUpFactsDto {
  run_hour: number;
  last_run_for: string | null;
  /** Its class is ask: each run it makes waits for a person on Today. */
  asks: boolean;
  /** What its template is for, as the send judges a yes (consent purposeOfTemplate, from Meta's category). */
  purpose: AskedPurpose;
  /** Contact id -> when their follow-up went. */
  had: Record<string, string>;
  /** Contact id -> when the run they are in, on its way, goes. */
  queued: Record<string, string>;
  /** Contact id -> when the run they are in was made to wait for a person. */
  held: Record<string, string>;
  /** Contact id -> their latest message from any run, while the week's breath still holds it. */
  heard: Record<string, string>;
}

/** Where one person stands with the follow-up: in a run to come -- when, and whether it waits on the owner -- or had it. */
export type FollowUpStand = { kind: "will"; atMs: number; asks: boolean } | { kind: "had"; atMs: number };

/** When a message sent at `atMs` stops holding its person back: one playbook message a person a week, across all. */
export function breathEndsAt(atMs: number): number {
  return atMs + PLAYBOOK_BREATH_MS;
}

/** Whether a message sent at `atMs` still holds its person back at `nowMs` (the week's breath). */
export function breathHolds(atMs: number, nowMs: number): boolean {
  return nowMs < breathEndsAt(atMs);
}

/** Whether a follow-up at `atMs` is the one this person's proposal was owed: one since it went (0006). */
export function followUpIsFor(r: { deal: { sinceMs: number | null } | null }, atMs: number): boolean {
  return atMs >= (r.deal?.sinceMs ?? Number.POSITIVE_INFINITY);
}

/**
 * Why a playbook's run sends nothing today whoever it would reach, before anyone is drawn: its template is not one
 * Meta approved, or its number is one Meta will not let send. Core's run stops on it, and the follow-up's words on
 * People and Today ask it too (0006), so they never promise a run that stops. Null: it may send.
 */
export function playbookRunStop(o: {
  templateStatus: string | null;
  canSend: boolean;
}): "template_not_approved" | "number_flagged" | null {
  if (o.templateStatus !== "approved") return "template_not_approved";
  if (!o.canSend) return "number_flagged";
  return null;
}

/**
 * The follow-up's first run that reaches someone clear from `fromMs` on (0006), as the sweep keeps it: one run a
 * day, at the first tick it is due (runDueNow: its hour come, the hours open, not run that day), reaching whoever
 * is clear at that moment. Today's, if still to come and they are clear by it; else the first day to come whose
 * run, at its hour's tick, finds them clear.
 */
export function followUpRunAt(
  f: Pick<FollowUpFactsDto, "run_hour" | "last_run_for">,
  tz: string,
  fromMs: number,
  nowMs: number,
): number {
  const today = zoneDayKey(nowMs, tz);
  const p = { state: "running" as const, run_hour: f.run_hour, last_run_for: f.last_run_for };
  if (f.last_run_for !== today) {
    const tick = sweepTickAtOrAfter(Math.max(nowMs, wallClockAt(tz, today, f.run_hour, 0)));
    if (zoneDayKey(tick, tz) === today && runDueNow(p, tz, new Date(tick)) && fromMs <= tick) return tick;
  }
  let day = shiftKey(today, 1);
  for (let i = 0; i < 400; i++, day = shiftKey(day, 1)) {
    const tick = sweepTickAtOrAfter(wallClockAt(tz, day, f.run_hour, 0));
    if (fromMs <= tick) return tick;
  }
  return sweepTickAtOrAfter(fromMs);
}

/**
 * Where one person stands with the follow-up (0006), by its run's own rules: named (followUpNames), with the yes to
 * hearing from the business and a number (whyNotReceive), and whether a follow-up for this proposal went or is in a
 * run already made. Otherwise in a run to come: the next, or the first after the week's breath lets them go. Null
 * for anyone it will not reach: not waiting, no link, no yes, no number, or asked to stop. The cap is not counted: a
 * run over it reaches the rest the day after.
 */
export function followUpStandOf(
  r: Pick<PersonRowVM, "id" | "deal" | "askedMs" | "consent" | "phone">,
  f: FollowUpFactsDto,
  tz: string,
  nowMs: number,
  pace: Pick<DealPaceVM, "waitDays"> | null,
): FollowUpStand | null {
  if (!followUpNames(r, nowMs, pace)) return null;
  // The run enrols on its class's yes; the send then judges its template's (deliver.ts): a follow-up Meta filed as
  // marketing reaches only whoever said yes to offers too.
  if (whyNotReceive(r, purposeOfPlaybook("follow_up")) !== null) return null;
  if (f.purpose === "marketing" && whyNotReceive(r, "marketing") !== null) return null;
  const when = (m: Record<string, string>): number | null => {
    const ms = m[r.id] ? Date.parse(m[r.id]) : Number.NaN;
    return Number.isFinite(ms) ? ms : null;
  };
  // One follow-up per proposal: this proposal's went, or is in a run on its way, or waiting for a person.
  const had = when(f.had);
  if (had !== null && followUpIsFor(r, had)) return { kind: "had", atMs: had };
  const queued = when(f.queued);
  if (queued !== null && followUpIsFor(r, queued)) return { kind: "will", atMs: queued, asks: false };
  const held = when(f.held);
  if (held !== null && followUpIsFor(r, held)) return { kind: "will", atMs: held, asks: true };
  // The week's breath holds them to its end; the run that finds them clear is theirs.
  const heard = when(f.heard);
  const free = heard !== null ? breathEndsAt(heard) : nowMs;
  return { kind: "will", atMs: followUpRunAt(f, tz, free, nowMs), asks: f.asks };
}

/**
 * The words for a proposal the follow-up has in hand (0006), on the Pipeline's row and the deal card alike: the
 * day its run goes -- never the hour, since the breath and the cap can move a person a run -- and, where that run
 * waits for a person, that the owner approves it.
 */
export function followUpWords(s: Extract<FollowUpStand, { kind: "will" }>, tz: string, nowMs: number): string {
  const day = clockNear(s.atMs, tz, nowMs);
  return s.asks ? `Follow-up to approve ${day}` : `Follow-up ${day}`;
}
