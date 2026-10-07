/**
 * A proposal follow-up: who it is for, the breath after a touch, when it would run, and the words for it. Moved whole
 * from playbooks.ts (Reach out Part 2.5), which re-exports it.
 */
import { shiftKey } from "../calendar/day-keys";
import { clockNear, wallClockAt, zoneDayKey } from "../shared/clock";
import { type AskedPurpose, purposeOfPlaybook } from "../consent/consent";
import { SELLS_BY_QUESTION, SELLS_BY_WORDS } from "../deals/sells-by";
import { type DealPaceVM, waitingOnProposal } from "../deals/deal-waits";
import type { PersonRowVM } from "../people/person-row";
import type { DealVM } from "../deals/deal-vm";
import { readyOrWhatsApp } from "../broadcasts/reach-any";
import { type ChannelsReady, DEFAULT_CAMPAIGN_CHANNELS, type ReachRow, reachFor } from "../broadcasts/reach-for";
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
  /**
   * The channels its playbook ticks (step 3). Absent, as on a read from before the channels were: WhatsApp alone, as every
   * playbook went (DEFAULT_CAMPAIGN_CHANNELS). Who it reaches is judged over these (followUpStandOf).
   */
  channels?: readonly string[];
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

/**
 * What a follow-up was about, as one key (0029): the deal its words were written for (facts.deal_id), else the link
 * they carried (a follow-up from before the deal was kept), else "bare" (one that kept neither). The one spelling of it,
 * for the database's reading of the touches (packages/db touchIndex) and a run's own (touchesAfterRun).
 */
export function followUpKey(about: { deal: string | null; link: string | null }): string {
  return about.deal ? `deal:${about.deal}` : about.link ? `link:${about.link}` : "bare";
}

/**
 * What a person has had of the proposal follow-up (0006): the latest, whatever it was about, and the latest by what each
 * was about (followUpKey, 0029). `keys` absent: none read for them, so the latest alone answers, as it always did.
 */
export interface FollowUpsHad {
  at: number | undefined;
  keys: ReadonlyMap<string, number> | undefined;
}

/**
 * Whether this proposal has had its follow-up (0006, one per proposal): one since it went that was about its deal, or
 * that carried its link and kept no deal (one from before the deal was kept), or that kept neither (read as before:
 * any follow-up since it went, followUpIsFor). A link edited since its follow-up does not owe it another: the deal is
 * the same.
 */
export function followUpCovers(d: Pick<DealVM, "id" | "sinceMs" | "proposal">, had: FollowUpsHad): boolean {
  if (!had.keys) return had.at !== undefined && followUpIsFor({ deal: d }, had.at);
  const since = d.sinceMs ?? Number.POSITIVE_INFINITY;
  const at = [
    d.id ? had.keys.get(followUpKey({ deal: d.id, link: null })) : undefined,
    d.proposal?.url ? had.keys.get(followUpKey({ deal: null, link: d.proposal.url })) : undefined,
    had.keys.get(followUpKey({ deal: null, link: null })),
  ];
  return at.some((x) => x !== undefined && x >= since);
}

/**
 * The proposal a follow-up is about now (0029): of the person's open proposals the follow-up names (followUpNames),
 * the one waiting longest that has not had its own, else the one waiting longest (which has: the run counts it as
 * heard, as it always did). Null when none is named. A person's second proposal out is followed up in its turn, with
 * its own link, never covered by the first's.
 */
export function followUpDealOf(
  r: Pick<PersonRowVM, "deal" | "openDeals" | "askedMs">,
  nowMs: number,
  pace: Pick<DealPaceVM, "waitDays"> | null,
  had: FollowUpsHad,
): DealVM | null {
  const open = r.openDeals && r.openDeals.length ? r.openDeals : r.deal ? [r.deal] : [];
  const named = open
    .filter((d) => d.stage === "proposed" && followUpNames({ deal: d, askedMs: r.askedMs }, nowMs, pace))
    .sort((a, b) => (a.sinceMs ?? 0) - (b.sinceMs ?? 0));
  return named.find((d) => !followUpCovers(d, had)) ?? named[0] ?? null;
}

/** Whether a follow-up at `atMs` is the one this person's proposal was owed: one since it went (0006). */
export function followUpIsFor(r: { deal: { sinceMs: number | null } | null }, atMs: number): boolean {
  return atMs >= (r.deal?.sinceMs ?? Number.POSITIVE_INFINITY);
}

/**
 * Why a playbook's run sends nothing today whoever it would reach, before anyone is drawn: its template is not one
 * Meta approved, or its number is one Meta will not let send. Core's run stops on it, and the follow-up's words on
 * People and Today ask it too (0006), so they never promise a run that stops. Null: it may send.
 *
 * `byOthers`: the playbook also ticks email or text, which a WhatsApp template does not gate. Its template then stops
 * the run only once the people are drawn and none of them is on email or text (core run-playbook): until then the run
 * goes on for them, and WhatsApp's people are held (the number's health still stops it, as it does the whole run).
 */
export function playbookRunStop(o: {
  templateStatus: string | null;
  canSend: boolean;
  byOthers?: boolean;
}): "template_not_approved" | "number_flagged" | null {
  if (o.templateStatus !== "approved" && !o.byOthers) return "template_not_approved";
  if (!o.canSend) return "number_flagged";
  return null;
}

/**
 * The same stop for a playbook as its ticks say it: which channels it goes by, the template Meta has, and whether the
 * WhatsApp number can send (false for none). THE one reading of how the ticks change the stop, so the run (core
 * run-playbook) and the follow-up's words on People and Today (the dashboard's followUpFacts) never read it twice:
 * the number's health stops the run only when it ticks WhatsApp (a run that does not tick it never asks), and a template
 * Meta does not approve stops it only when WhatsApp is all it goes by (`byOthers`: it also ticks email or text, so the
 * run goes on for them).
 */
export function playbookStopBy(o: {
  channels: readonly string[];
  templateStatus: string | null;
  numberCanSend: boolean;
}): "template_not_approved" | "number_flagged" | null {
  return playbookRunStop({
    templateStatus: o.templateStatus,
    canSend: !o.channels.includes("whatsapp") || o.numberCanSend,
    byOthers: o.channels.some((c) => c !== "whatsapp"),
  });
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
 * hearing from the business and a way to reach them on a channel the follow-up goes by and the workspace can send on
 * now (reachFor), and whether a follow-up for this proposal went or is in a run already made. Otherwise in a run to
 * come: the next, or the first after the week's breath lets them go. Null for anyone it will not reach: not waiting,
 * no link, no yes, no way to reach them, or asked to stop. The cap is not counted: a run over it reaches the rest the
 * day after.
 */
export function followUpStandOf(
  r: Pick<PersonRowVM, "id" | "deal" | "askedMs"> & ReachRow,
  f: FollowUpFactsDto,
  tz: string,
  nowMs: number,
  pace: Pick<DealPaceVM, "waitDays"> | null,
  /**
   * What the workspace can send on now (channels-ready.ts), which the follow-up's channels are judged against; null
   * where it could not be read (readyOrWhatsApp). Required, as the pace is: no caller may leave the workspace out.
   */
  ready: ChannelsReady | null,
): FollowUpStand | null {
  if (!followUpNames(r, nowMs, pace)) return null;
  // The run enrols on its class's yes; the send then judges its template's (deliver.ts): a follow-up Meta filed as
  // marketing reaches only whoever said yes to offers too.
  // A follow-up is about the proposal their deal waits on: theirs (consent.ts MessageAbout).
  const how = {
    channels: f.channels ?? DEFAULT_CAMPAIGN_CHANNELS,
    ready: readyOrWhatsApp(ready),
    about: "theirs" as const,
  };
  if (reachFor(r, purposeOfPlaybook("follow_up"), how).channel === null) return null;
  if (f.purpose === "marketing" && reachFor(r, "marketing", how).channel === null) return null;
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
