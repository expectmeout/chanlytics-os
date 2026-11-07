/** Sheet: words. */

import { clockTime, clockWhen, zoneDayKey } from "../../../shared/clock";
import { nextRunLabel } from "../../playbooks/schedule";
import { PLAYBOOK_VETO_DELAY_WORDS } from "../../playbooks/triggers/notices";
import { plural } from "../../../shared/words";
import type { ReachOutChainDto, ReachOutReachDto, ReachOutRunDto, ReachOutStartDto } from "../dtos";
import { REACH_OUT_DRAFTS_PER_DAY } from "../rules";
import type { HandKind } from "../hand";
import { pct } from "../../../shared/numbers";

// Each sentence says what an owner acts on, once, and stops (Ruben, 10 Oct 2026: the sheet said each thing at length,
// in nine notes).
export const REACH_OUT_SHEET_WORDS = {
  sub: "Your email, opened for each business, from your own mailbox. Replies come back to it, and to your Inbox.",
  who: "Ready, with a checked address, never written to. Keeps itself current.",
  opening:
    "The receptionist opens each email from the finder's record. It never invents a fact: anything it can't back is held.",
  stops: "Stops when they reply, book, unsubscribe, bounce or say no.",
  stopOne: "To stop one business, press Stop writing to them on its lead.",
  first: `Starts today. You approve the first run; after that you have ${PLAYBOOK_VETO_DELAY_WORDS} to stop each one.`,
  slotsHint: "each is filled for each business, or the email is held",
  foot: "Why they're hearing from you, your address, Unsubscribe",
  footHint: "as the law asks",
  repliesHint: "into your Inbox",
  checkLater: "Each email is checked before it goes. The first run waits for you.",
  noMailbox: "Connect the mailbox you'll write from first: Google or Microsoft, here or in Settings › Connections.",
  /** From, when its owner sends it (00429): what they are handed, and how. */
  ownerSends: `Each email is handed to you written and checked, to send from your own inbox: Gmail, Outlook or your mail app. Up to ${REACH_OUT_DRAFTS_PER_DAY} a day.`,
  /** From, with no mailbox connected: the owner sends, and a mailbox would send for them. */
  ownerNoMailbox: "Or connect Google or Microsoft, and your mailbox sends them for you.",
  anotherStep: "Another step",
  anotherStepHint: "· another email",
  /** The last step may hand each business it reaches to you instead (Part 5, G20). */
  anotherCall: "A call for you",
  anotherNote: "A note for you",
  handHint: "· ends the chain: each business it reaches is a step on your Today",
  handWords: "What to do",
  handPlaceholder: "Ask whether our quote suited them",
  remove: "Remove",
  removeNote: "Only before its first email goes; after that, pause it.",
  recheck: "Check the held again",
  /** A business on a run's sheet, held, ready or to send, opens its lead over the page (the name's tip). */
  openLead: "Open this business's lead",
} as const;

/**
 * The doors' refusals, said once: the database raises these very sentences (00211), and the routes answer them
 * (reach-out-sheet-doors.db.test.mjs holds the two to the same words).
 */
export const REACH_OUT_REFUSALS = {
  exists: "This search has a reach-out already.",
  wrote: "This reach-out has written already. Pause it instead.",
  stepWrote: "That step has written already. Pause the reach-out instead.",
  /** 00228's: a call or a note anywhere but last, and a step changed from one to the other once it has run. */
  handLast: "A call or a note ends the chain.",
  stepRan: "That step has run already. Add a new step instead.",
  outOfPlace: "A step is out of its place. Open the reach-out again.",
  notFound: "Reach-out not found.",
  workspaceNotFound: "Workspace not found.",
  oneEmail: "A reach-out has at least one email.",
  /** lead_set_stage's own, when Not a fit finds its lead missing or erased. */
  leadNotFound: "Lead not found.",
  leadGone: "This lead is gone.",
  /** 00241 reach_out_lead_stop: a lead no chain ever planned (Part 6, H10). */
  nothingWritten: "Nothing has been written to them yet.",
  /** reach_out_report (00241, 00360): any count of days Reports reads, as its other functions take them. */
  period: "A period is 1 to 90 days.",
  searchNotFound: "Search not found.",
  mailboxNotFound: "Mailbox not found.",
  sendNotFound: "Email not found.",
  runNotFound: "Run not found.",
  runOver: "That run is over.",
  gone: "That email has gone.",
  includeHeld: "Only an email the check held for a reason is included.",
  givenUp: "This email waited two weeks for your answer and was given up.",
  decision: "Include, rewrite, skip or not a fit.",
  /** 00505 reach_out_send_decide and reach_out_send_rewrite_undo: what should change, and the opening Undo puts back. */
  onlyRewriteWords: "Only a rewrite takes words.",
  changeLong: "Say it in 280 characters or fewer.",
  nothingToUndo: "There is no earlier opening to put back.",
  /** 00545 sequence_lead_words_set and reach_out_send_decide: a lead's own words at a step, and Rewrite under them. */
  stepGone: "That step has gone.",
  onlyEmailWords: "Only an email takes words.",
  yoursToSend: "It's yours to send now: change it in your mail app.",
  youWroteIt: "You wrote this email. Use the sequence's words first.",
  /** A row's CHECK refused what the words' rules let through: never expected, said plainly. */
  unsaved: "That sequence could not be saved as it is. Check its steps and try again.",
  /** DELETE playbooks/[id] on a reach-out (R16): its history is never deleted there. */
  notHere:
    "A sequence to leads is removed from its own row, and only before its first email goes. After that, pause it.",
  /** The preview on a deployment that runs nothing. */
  preview: "Previews only work on the production dashboard.",
  previewDown: "The preview could not be written just now. Try again in a moment.",
  budget: "Today's assistant budget is spent, so the preview waits until tomorrow.",
} as const;

const REFUSAL_SET = new Set<string>(Object.values(REACH_OUT_REFUSALS));

/** Whether a door's message is one of the refusals above, and so may be shown as it is. */
export function isReachOutRefusal(message: string | null | undefined): boolean {
  return REFUSAL_SET.has(message ?? "");
}

/** Who gets it (the reach block): the count, the bar, and the reasons, each with its door. */
export function reachLineOf(reachOutReach: ReachOutReachDto, includeUnconfirmed: boolean) {
  const unconfirmed = Math.max(0, reachOutReach.with_unconfirmed - reachOutReach.ready);
  const count = includeUnconfirmed ? reachOutReach.with_unconfirmed : reachOutReach.ready;
  const held = includeUnconfirmed ? 0 : unconfirmed;
  const will = pct(count, reachOutReach.of) ?? 0;
  const heldPct = pct(held, reachOutReach.of) ?? 0;
  const reason: Array<{ tone: "warn" | "plain"; text: string; door: string | null }> = [];
  if (unconfirmed > 0)
    reason.push(
      includeUnconfirmed
        ? {
            tone: "plain",
            text: `${plural(unconfirmed, "unconfirmed address", "unconfirmed addresses")}, included`,
            door: "Leave them out",
          }
        : {
            tone: "warn",
            text: `${plural(unconfirmed, "unconfirmed address", "unconfirmed addresses")}, held`,
            door: "Include them",
          },
    );
  if (reachOutReach.phone_only > 0)
    reason.push({ tone: "plain", text: `${reachOutReach.phone_only} by phone only, kept for calls`, door: null });
  return {
    count,
    of: `of ${reachOutReach.of} on the search`,
    bar: { will, held: heldPct, rest: Math.max(0, 100 - will - heldPct) },
    why: reason,
  };
}

/** The pace sentence as tokens (the odd places are the sheet's editable tokens), and why its day is what it is. */
export function paceWords(params: { share: number; mailboxes: number; rises: number | null; gapMinutes: number }) {
  const reason =
    params.rises !== null
      ? `A new mailbox starts slow and grows with the days it sends: the pace rises in ${plural(params.rises, "more day", "more days")} of sending.`
      : "As much as your mailboxes write in a day.";
  return {
    parts: [
      "",
      String(params.share),
      ` a day${params.mailboxes > 1 ? ` across ${params.mailboxes} mailboxes` : ""}, one every `,
      `${params.gapMinutes} min`,
      " or so, in each business's open hours. Never on their closed days.",
    ],
    why: reason,
  };
}

/**
 * The pace of a reach-out its owner sends (00429): its day's share, handed at once as each run goes ahead. The owner is
 * the pace, so there is no gap to choose.
 */
export function ownerPaceWords(): { line: string; why: string } {
  return {
    line: `Up to ${REACH_OUT_DRAFTS_PER_DAY} a day, handed to you as each run goes ahead. You send each when you like.`,
    why: "You are the pace: a nudge is handed to you before new businesses, so none waits behind them.",
  };
}

export function sheetFootWords(params: {
  share: number;
  gapMinutes: number;
  ready: number;
  editing: boolean;
  ownerSends?: boolean;
}): string {
  if (params.editing) return "Your changes go with the next emails. What has gone stays as it went.";
  if (params.ready === 0) return "Nobody on this search can be written to yet.";
  if (params.ownerSends)
    return `Hands you up to ${Math.min(REACH_OUT_DRAFTS_PER_DAY, params.ready)} a day to send from your inbox. The first run waits on you.`;
  return `Goes to ${Math.min(params.share, params.ready)} a day, one every ${params.gapMinutes} minutes or so as each business opens. The first run waits on you.`;
}

export function stepLabel(count: number): string {
  return count === 0 ? "Your email" : count === 1 ? "A short nudge" : `Email ${count + 1}`;
}

/** A step's label: an email's by its place, a hand step's by its kind (Part 5, G20). */
export function stepLabelOf(state: { n: number; hand?: { kind: HandKind } | null }): string {
  if (!state.hand) return stepLabel(state.n);
  return state.hand.kind === "call" ? REACH_OUT_SHEET_WORDS.anotherCall : REACH_OUT_SHEET_WORDS.anotherNote;
}

export function stepWhenWords(count: number, afterDays: number | null): string {
  return count === 0
    ? "Day one, in their hours"
    : `After ${afterDays ?? "?"} days with nothing back · in the same thread`;
}

/**
 * What Start did, said as it happened (R14): each reason in its own words. "Planned within the hour" only when the edge
 * could not be asked, since the hourly sweep then plans it.
 */
export function startWords(
  reachOutStart: ReachOutStartDto,
  ownerSends = false,
): { tone: "good" | "warn" | "plain"; text: string } {
  const phrase = plural(reachOutStart.planned, "email", "emails");
  switch (reachOutStart.outcome) {
    case "sent":
      return {
        tone: "good",
        text: ownerSends
          ? `Planned ${phrase}. Each is handed to you to send once it is checked; you have ${PLAYBOOK_VETO_DELAY_WORDS} to stop them.`
          : `Planned ${phrase}. They go in each business's hours; you have ${PLAYBOOK_VETO_DELAY_WORDS} to stop them.`,
      };
    case "held":
      switch (reachOutStart.reason) {
        case "waiting_for_you":
          return reachOutStart.planned > 0
            ? { tone: "good", text: `Planned ${phrase}. The first run waits on you: open it to approve.` }
            : { tone: "plain", text: "A run of this sequence already waits on you. Answer it first." };
        case "billing":
          return { tone: "warn", text: "Saved. Nothing is planned until billing is sorted: open Billing." };
        case "no_mailbox":
          return { tone: "warn", text: `Saved. Nothing is planned yet. ${REACH_OUT_SHEET_WORDS.noMailbox}` };
        case "no_room":
          return {
            tone: "plain",
            text: "Saved. Your mailboxes have written all they may today, so the first run is tomorrow.",
          };
        default:
          return { tone: "plain", text: "Saved. The first run is held." };
      }
    case "off":
      return reachOutStart.reason === "workspace_paused"
        ? { tone: "warn", text: "Saved. This workspace is paused, so nothing runs until it is resumed." }
        : { tone: "plain", text: "Saved. It is paused, so nothing was planned." };
    case "empty":
      return reachOutStart.reason === "already_ran"
        ? { tone: "plain", text: "Saved. It already ran today; it runs again tomorrow." }
        : { tone: "plain", text: "Saved. Nobody on this search can be written to yet; it looks again each day." };
    case "failed":
      return { tone: "warn", text: "Saved. The first run could not be planned just now; it is tried again each hour." };
    case "unreached":
      return { tone: "plain", text: "Saved. The first run is planned within the hour." };
    case "preview":
      return { tone: "plain", text: "Saved. Running only works on the production dashboard." };
  }
}

/**
 * The chain's next run (R23), as the database holds it: paused, held for billing, a run waiting for its owner, or when
 * the sweep runs it (playbook-schedule's nextRunLabel, the moments' own).
 */
export function nextRunWords(
  reachOutChain: Pick<ReachOutChainDto, "state" | "next">,
  tz: string,
  now: Date,
): { tone: "warn" | "plain"; text: string; run_id: string | null } {
  if (reachOutChain.state !== "running")
    return { tone: "plain", text: "Paused. Nothing is planned until you resume it.", run_id: null };
  if (!reachOutChain.next.may_spend)
    return { tone: "warn", text: "Held for billing: nothing is planned until billing is sorted.", run_id: null };
  if (reachOutChain.next.waiting_run_id)
    return {
      tone: "warn",
      text: "A run waits on you. Nothing more is planned until you answer it.",
      run_id: reachOutChain.next.waiting_run_id,
    };
  // A paused workspace is the chain's own line above (`may_spend`: held for billing), so the label is the moment's clock alone.
  const at = nextRunLabel(
    { state: "running", run_hour: reachOutChain.next.run_hour, last_run_for: reachOutChain.next.last_run_for },
    tz,
    now,
    false,
  );
  return { tone: "plain", text: `Next run ${at}.`, run_id: null };
}

/** The first send's time by the business's clock: contracts' one formatter (clock.ts clockTime). */
const clock = (iso: string, tz: string): string => clockTime(Date.parse(iso), tz);

/**
 * The first send's time, with its day when that is not today ("tomorrow 9:40 AM"): a run planned after hours or on a
 * closed day starts on a later day, and a bare "9:40 AM" would read as this morning. Null without one.
 */
function firstSendWhen(firstAt: string | null, tz: string, now: number): string | null {
  if (!firstAt) return null;
  const ms = Date.parse(firstAt);
  return zoneDayKey(ms, tz) === zoneDayKey(now, tz) ? clock(firstAt, tz) : clockWhen(ms, tz, now);
}

/** A live run's state, as the words of its decision read it: waiting on its owner, approved and to come, or going. */
export type RunState = "pending_approval" | "scheduled" | "sending";

/**
 * One part of a run, as its bar and the legend under it say it: ready, the coming days, held, still being checked. The
 * legend sets the number heavy and the rest plain (`rest`); `words` is the whole, for a screen reader.
 */
export interface RunPartVM {
  key: "go" | "later" | "held" | "checking";
  n: number;
  rest: string;
  words: string;
}

/**
 * When a run's first email goes, as its decision says it: "now" for a run from an earlier day or one whose first time has
 * passed (each is re-timed in their hours as it goes), its first time otherwise, with its day where that is not today;
 * null with no checked email to go.
 */
export function runFromOf(r: ReachOutRunDto, p: { timezone: string; today: string; now: number }) {
  const earlier = !!r.run_for && r.run_for < p.today;
  const passed = !earlier && !!r.first_at && Date.parse(r.first_at) <= p.now;
  return { earlier, from: earlier || passed ? "now" : firstSendWhen(r.first_at, p.timezone, p.now) };
}

/** The mailboxes a run writes from, said once under when it goes (R22); none for a run its owner sends (00429). */
export function runFromLine(r: ReachOutRunDto): string | null {
  if (r.owner_sends === true) return null;
  const [only, ...others] = r.mailboxes;
  if (!only) return null;
  // One that has not sent yet goes on its first day, never its zeroth.
  if (others.length === 0)
    return `From ${only.address} · ${only.sent_days > 0 ? plural(only.sent_days, "day of sending", "days of sending") : "its first day of sending"}`;
  const addresses = r.mailboxes.map((m) => m.address);
  return `From ${addresses.slice(0, -1).join(", ")} and ${addresses[addresses.length - 1]}`;
}

/** The parts of a run, the ones with something in them; with two or fewer the held say what held them. */
export function runPartsOf(reachOutRun: ReachOutRunDto, ready: number, state: RunState): RunPartVM[] {
  const owner = reachOutRun.owner_sends === true;
  const held = reachOutRun.held.length;
  const goWords = owner && state !== "pending_approval" ? "handed to you" : state === "sending" ? "going" : "ready";
  const part = (key: RunPartVM["key"], n: number, rest: string): RunPartVM => ({ key, n, rest, words: `${n} ${rest}` });
  const parts: RunPartVM[] = [
    part("go", ready, goWords),
    part("later", reachOutRun.later, "in the coming days"),
    part("held", held, "held"),
    part("checking", reachOutRun.checking, "being checked"),
  ];
  const shown = parts.filter((x) => x.n > 0);
  return shown.length > 2 ? shown : shown.map((x) => (x.key === "held" ? part("held", held, "held by the check") : x));
}

/** What the foot says beside its act: what goes and from when, then what else waits (a phone's dock, a desk's foot). */
export function runDockOf(
  reachOutRun: ReachOutRunDto,
  params: { ready: number; from: string | null; state: RunState },
) {
  const { ready, from, state } = params;
  const held = reachOutRun.held.length;
  // An owner's run going: what a row's Skip does while one is handed to them (the canvas's foot), else what Stop does.
  if (reachOutRun.owner_sends === true)
    return {
      lead: `${ready} to send from your inbox`,
      said:
        state === "pending_approval"
          ? null
          : (reachOutRun.drafted?.length ?? 0) > 0
            ? "Skip leaves that business out"
            : "Stop keeps the rest from being handed to you",
    };
  if (state === "sending") return { lead: "Going now", said: "Stop keeps the rest from going" };
  if (state === "scheduled")
    return { lead: from ? `Goes from ${from}` : "Goes in their hours", said: "Cancel keeps it from going" };
  // Nothing today: the coming days' go first, from their first time where it is known.
  const count = ready > 0 ? ready : reachOutRun.later;
  const lead =
    count === 0
      ? "Nothing goes yet"
      : from
        ? `${count} go from ${from}`
        : ready > 0
          ? `${count} go from now`
          : `${count} go in the coming days`;
  const sentence =
    reachOutRun.checking > 0
      ? `${reachOutRun.checking} more go once checked`
      : held > 0
        ? `${held} held ${held === 1 ? "waits" : "wait"} for you`
        : reachOutRun.later > 0 && ready > 0
          ? `${reachOutRun.later} more in the coming days`
          : null;
  return { lead, said: sentence };
}
