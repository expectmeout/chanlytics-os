/**
 * A reach-out run in Sent (Reach out, Part 4 PR 7; F13, R20–R22): the block its run draws for as long as it is
 * live, waiting for its owner or not. What approvalWordsOf says of a run waiting (its share and the rest, the held with
 * their doors, how many are still being checked, the first ready business's email), and around it what a live run says
 * whatever its state: the skipped by reason, who gets it (the checked only), and the notice the check sends the first
 * time it holds a send in a run that is not waiting. Pure: the page and the edge say every sentence from here.
 */
import { clockNear, clockWhen } from "../shared/clock";
import { HELD_REASONS } from "../broadcasts/run-words";
import { plural } from "../shared/words";
import { runDraftedEmails, runHeldEmails } from "../waits/waits";
import { RUN_OPEN_WORDS, RUN_WAITING_WORDS } from "../shell/campaign-rooms";
import { composeLinksOf, type ComposeLinks } from "./owner/compose";
import type { ReachOutDraftedSend, ReachOutRunDto } from "./reach-out-dtos";
import { holdDoors, HOLD_DOOR_WORDS, type ReachOutHold } from "./reach-out-words";
import { reachOutRootOf } from "./reach-out-rules";
import { approvalWordsOf, chainPaceOf, leadDoorOf, stepLabel } from "./reach-out-sheet";

/**
 * Why a send was skipped, as a run's block says it after the count and a lead's story says it (Part 6): the reasons
 * the engine writes, then a refusal's own short words (run-words.ts), then a plain line for anything else.
 */
export function skippedReasonWords(reason: string): string {
  switch (reason) {
    case "closed_every_day":
      return "keep no open hour all week";
    case "missing_value":
      return "missing a value your words name";
    case "owner_skipped":
      return "skipped by you";
    case "owner_stopped":
    case "outreach_stopped":
      return "you stopped writing to them";
    case "not_a_fit":
      return "marked Not a fit";
    case "kept_waiting":
      return "waited past fourteen days";
    case "step_removed":
      return "their step was removed";
    case "run_canceled":
      return "the run was stopped";
    case "owner_took_back":
      return "taken back before it was sent";
    case "draft_withdrawn":
      return "were handed to you, then taken back";
    case "erased":
      return "their record was erased";
    case "mailbox_gone":
      return "the mailbox their emails came from was removed";
    case "outreach_country":
      return "are where a cold email may not go without their say";
    // The person door's refusals when its owner said an email went (00429 reach_out_send_said).
    case "lead_closed":
      return "had closed before it went";
    case "already_yours":
      return "are already yours, in People";
    default:
      return HELD_REASONS[reason] ?? "could not be written to";
  }
}

/** The skipped, most first, one line each: "3 skipped · keep no open hour all week". */
function skippedWordsOf(skipped: Record<string, number>): string[] {
  return Object.entries(skipped)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([reason, n]) => `${n} skipped · ${skippedReasonWords(reason)}`);
}

/** A live run's state as the block's head says it; a run waiting is the approval sheet's own. */
const STATE_WORDS: Record<string, string> = {
  pending_approval: RUN_WAITING_WORDS,
  scheduled: "Scheduled",
  sending: "Sending",
};

/**
 * The block a live reach-out run draws (R20): approvalWordsOf for a run waiting on its owner, and for one that is
 * scheduled or sending, the same facts without an Approve (it was approved, or its mode was veto). `today` is the
 * workspace's day, `now` the moment it is said and `timezone` the zone; the share a day is the run's own mailboxes' (R22).
 */
export function reachOutRunWordsOf(
  r: ReachOutRunDto,
  p: { state: string; timezone: string; today: string; now: number },
) {
  const share = chainPaceOf(r).share;
  const a = approvalWordsOf(r, { timezone: p.timezone, share, today: p.today, now: p.now });
  const waiting = p.state === "pending_approval";
  const earlier = !!r.run_for && r.run_for < p.today;
  // Who gets it: only the checked, ready sends, by name and time (R21); the rest are being checked.
  const checked = r.planned.filter((x) => x.checked);
  const step = r.step_n === null ? "a step since removed" : `step ${r.step_n + 1}`;
  const owner = r.owner_sends === true;
  return {
    ...a,
    k: STATE_WORDS[p.state] ?? "Reach-out",
    sub: waiting
      ? a.sub
      : owner
        ? `Reach-out · ${step} · each handed to you to send from your inbox once it is checked`
        : `Reach-out · ${step} · ${p.state === "sending" ? "going now" : "goes"}, one every ${r.gap_minutes} minutes as each business opens`,
    approve: waiting ? a.approve : null,
    approveNote: waiting ? a.approveNote : null,
    note: waiting ? a.note : null,
    skipped: skippedWordsOf(r.skipped),
    // Today's and the coming days' as the reach line counts them: "See the 30 today and 12 later".
    see:
      checked.length === 0
        ? null
        : checked.length > r.today
          ? `See the ${r.today} today and ${checked.length - r.today} later`
          : `See the ${checked.length}`,
    // By day and time; a run from an earlier day, or a time already past, is re-timed when it goes, never a past time.
    list: checked.map((x) => {
      const ms = Date.parse(x.send_at);
      const retimed = earlier || Number.isNaN(ms) || ms <= p.now;
      return {
        id: x.send_id,
        name: x.business_name,
        // Its lead, where the name opens it (leadDoorOf).
        to: leadDoorOf(x.lead_id),
        // An owner's email is handed to them once checked, at any hour (00429), never re-timed to the lead's.
        at: owner ? HANDED : retimed ? RETIMED : clockWhen(ms, p.timezone, p.now),
      };
    }),
    skipAsk: `Skip ${r.chain_name}'s run?`,
    // What Approve released, as the flash says it: the checked sends due today, never the run's whole count (R21).
    // Nothing today (planned after hours, or on a closed day) says when they go instead of "0 emails today".
    approved: owner
      ? `${r.chain_name} approved — ${plural(r.today + r.later, "email", "emails")} to send from your inbox, handed to you as each is checked`
      : r.today === 0 && r.later > 0
        ? `${r.chain_name} approved — ${plural(r.later, "email", "emails")} in the coming days, in their hours`
        : `${r.chain_name} approved — ${plural(r.today, "email", "emails")} today, in their hours`,
    labels: REACH_OUT_RUN_LABELS,
    listHead:
      r.checking > 0 ? `Who gets it · ${plural(r.checking, "more is", "more are")} being checked` : "Who gets it",
  };
}

/** A send whose time has passed, or whose run is from an earlier day: it goes in their hours once it may. */
const RETIMED = "re-timed in their hours";
/** An owner's email (00429): handed to them once checked, whatever the hour. */
const HANDED = "handed to you once checked";

/** One email handed to its owner, as the run's To send list draws it. */
export interface ToSendRowVM {
  id: string;
  /** Its lead's id: what They wrote back… is said on. */
  leadId: string;
  /**
   * A step after the first (00429): its business may have answered the email before in the owner's own inbox, which
   * nothing here reads, so its Sent asks first whether they did, and They wrote back… stands beside it.
   */
  followUp: boolean;
  name: string;
  /** Its lead, where the name opens it (leadDoorOf). */
  to: string | null;
  angle: string | null;
  address: string;
  subject: string;
  /** The whole email, its foot included: what Copy writes, and what a link too long to carry it leaves to the clipboard. */
  text: string;
  /** When it was handed to them: "handed to you today", "handed to you Mon". */
  since: string;
  links: ComposeLinks;
}

/**
 * The emails of a reach-out its owner sends that are handed to them and not yet said to have gone (00429), oldest first:
 * each with its doors into a mail client (composeLinksOf) and the owner's Sent and Skip. Null when there are none.
 */
export function toSendWordsOf(r: ReachOutRunDto, p: { timezone: string; now: number }) {
  const drafted = r.drafted ?? [];
  if (drafted.length === 0) return null;
  return {
    head: `To send · ${drafted.length}`,
    note: REACH_OUT_TO_SEND_LABELS.note,
    rows: drafted.map((d) => toSendRowOf(d, p)),
    labels: REACH_OUT_TO_SEND_LABELS,
  };
}

/**
 * One email handed to its owner, as every To send draws it: a run's (toSendWordsOf) and a sequence's People (contracts
 * peopleNeedsOf), so a row reads and acts the same wherever it is laid out.
 */
export function toSendRowOf(d: ReachOutDraftedSend, p: { timezone: string; now: number }): ToSendRowVM {
  return {
    id: d.send_id,
    leadId: d.lead_id,
    followUp: d.follow_up === true,
    name: d.business_name,
    to: leadDoorOf(d.lead_id),
    angle: d.angle,
    address: d.to,
    subject: d.subject,
    text: d.text,
    since: `handed to you ${clockNear(Date.parse(d.drafted_at), p.timezone, p.now)}`,
    links: composeLinksOf({ to: d.to, subject: d.subject, text: d.text }),
  };
}

/**
 * What is true of a lead an owner's email went to since it was handed over (00429 reach_out_send_said's since): the
 * email is on the record all the same, and this says what follows from it.
 */
const SENT_SINCE_WORDS: Record<string, string> = {
  lead_gone: "Their lead is gone, so nothing more is written to them.",
  erased: "Their record was erased, so nothing more is written to them.",
  lead_closed: "They had closed before it went, so nothing more is written to them.",
  outreach_suppressed: "Their address is on the never-again list, so nothing more is written to them.",
  outreach_stopped: "You had stopped writing to them, so nothing more is written to them.",
  already_yours: "They are already yours, in People.",
  no_address: "Their address is gone, so nothing more is written to them.",
};

/** The To send list's own acts and what each says once done: every To send's (a run's, a sequence's People). */
export const REACH_OUT_TO_SEND_LABELS = {
  /**
   * How the list is worked, and what Skip does: the owner's word that it did not go counts as the business's first email
   * (00427's one-first rule; 0059's Risks), so neither this reach-out nor another writes to them after it.
   */
  note: "Open each in Gmail, Outlook or your mail app and send it there, then say Sent here. Skip leaves that business out: nothing more is written to them.",
  gmail: "Open in Gmail",
  outlook: "Open in Outlook",
  app: "Your mail app",
  copy: "Copy",
  copied: "Copied",
  /** A link too long to carry the words: they are copied as it opens. */
  pasteNote: "The words are copied: paste them in.",
  sent: "Sent",
  skip: "Skip",
  saying: "Saying so…",
  /** What a role that may not is told it cannot do here (gateTitle). */
  gated: "say whether an email went",
  read: "Read it",
  hide: "Hide it",
  /** The row's More, which holds Gmail, Outlook, Copy and its words. */
  more: (name: string) => `More for the email to ${name}`,
  /** Asked once the owner opened or copied one, as the lead's own draft asks (LEAD_SENT_QUESTION). */
  asked: "Did it go?",
  /** A step after the first, asked at its Sent: the business may have answered the email before in the owner's inbox. */
  noReply: "No reply from them yet?",
  noReplyYes: "No reply: it went",
  sentDone: (name: string) => `${name}: sent from your inbox`,
  /** Sent, and recorded, though its lead would be refused now (reach_out_send_said's since). */
  sentSince: (name: string, since: string) =>
    `${name}: sent from your inbox. ${SENT_SINCE_WORDS[since] ?? "Nothing more is written to them."}`,
  skippedDone: (name: string) => `${name}: left out. Nothing more is written to them.`,
  /** Left out by the clock or a reply before the owner said a word: why, in the skip's own words. */
  leftOut: (name: string, why: string) => `${name} was left out already: they ${why}.`,
  /** Another member, or another tab, said first. */
  already: (state: string) => (state === "sent" ? "Already said: it went." : "Already said: it was left out."),
} as const;

/** A run as Sent's list holds it (BroadcastVM), as far as the one To send reads it. */
export interface ToSendRunLike {
  id: string;
  state: string;
  scheduled_for: string;
  /** How many of a going run's emails are handed to its owner (waits.ts runDraftedEmails, 00429). */
  drafted?: number | null;
  /** Whose run it is: a reach-out's run names its reach-out (reachOutRootOf), so a first email and its nudge are one. */
  audience?: unknown;
}

/** One To send's numbers: the emails handed over, and the reach-outs they come from (a run's steps are one reach-out). */
export interface ToSendCount {
  count: number;
  from: number;
}

/** Sent's one To send: every email handed to its owner, from each reach-out they send themselves (00429). */
export const TO_SEND_ROUTE = "broadcasts/to-send";

/** The one To send's own words: Today's row that opens it, and Sent's pane that lists every run's emails. */
export const TO_SEND_ALL_WORDS = {
  title: "To send",
  /** Today's row and the door to it: what it opens. */
  door: "Open To send",
  meta: "Reach-out · to send",
  status: "Handed to you",
  /** "12 emails handed to you, from 3 reach-outs"; one reach-out (its first email and its nudge) says none. */
  sub: (n: number, from: number) =>
    `${plural(n, "email", "emails")} handed to you${from > 1 ? `, from ${from} reach-outs` : ""}`,
  /** Today's one row for them: what waits, and from how many reach-outs where more than one. */
  sentence: (n: number, from: number) =>
    `${plural(n, "email", "emails")} to send from your inbox${from > 1 ? `, from ${from} reach-outs` : ""}, each written and checked.`,
  /** Today's brief for them, as one run's line: "Your reach-outs are waiting for you: …". */
  brief: (from: number) =>
    from > 1
      ? { label: "Your reach-outs", verb: "are" as const, waits: "waiting for you" }
      : { label: "Your reach-out", verb: "is" as const, waits: "waiting for you" },
  note: REACH_OUT_TO_SEND_LABELS.note,
  /**
   * A run's part of the list: its reach-out, which of its emails (a first email and its nudge are two parts of one
   * reach-out), and how many wait. The step is null until the run's detail is read.
   */
  runHead: (name: string, step: number | null, n: number) =>
    step === null ? `${name} · ${n}` : `${name} · ${step === 0 ? "first email" : stepLabel(step).toLowerCase()} · ${n}`,
  openRun: RUN_OPEN_WORDS,
  /** A run's own To send, where other runs hand emails over too: the door to all of them. */
  everyRun: (n: number, from: number) => `All ${n} to send${from > 1 ? `, from ${from} reach-outs` : ""}`,
  reading: "Reading its emails…",
  unread: "Its emails could not be read just now. Open the run to see them.",
  /** Every email handed over is said: what the pane says once its list is empty. */
  none: "Nothing left to send: every email handed to you is said.",
  /** What a role that may not is told it cannot do here (gateTitle): the run's own list's words. */
  gated: REACH_OUT_TO_SEND_LABELS.gated,
} as const;

/**
 * Every going run with emails handed to its owner (00429), as one To send: the runs, the oldest first, with how many of
 * their emails wait in all. Null when none has one. Each run's own emails are its detail's (toSendWordsOf), read as its
 * part of the list is drawn.
 */
export function toSendAllOf<R extends ToSendRunLike>(runs: readonly R[]): ({ runs: R[] } & ToSendCount) | null {
  const waiting = runs
    .filter((r) => runDraftedEmails(r) > 0)
    .sort((a, b) => a.scheduled_for.localeCompare(b.scheduled_for) || a.id.localeCompare(b.id));
  if (waiting.length === 0) return null;
  return {
    runs: waiting,
    count: waiting.reduce((n, r) => n + runDraftedEmails(r), 0),
    // A reach-out's runs are its steps' (a first email, a nudge): counted as the one reach-out they are.
    from: new Set(waiting.map((r) => reachOutRootOf(r.audience) ?? r.id)).size,
  };
}

/** A run waiting for you, as the doors to the waiting runs read it: whether its check holds emails too. */
type WaitingToSend = ToSendRunLike & { held?: number | null };

/**
 * The runs waiting for you that fold into the one To send's row on Today: two or more going runs whose emails are handed
 * to their owner, none of them holding emails for a say too (a held email is answered on its run, its own row). Null
 * where fewer would fold, and each is its own run's row. The row says the list it opens: every email handed over and
 * every run with one (`count`, `from`: toSendAllOf), a run that holds emails too among them.
 */
export function toSendRunsOf<R extends WaitingToSend>(waiting: readonly R[]): ({ runs: R[] } & ToSendCount) | null {
  const folded = waiting.filter((r) => runHeldEmails(r) === 0 && runDraftedEmails(r) > 0);
  const all = toSendAllOf(waiting);
  return all && folded.length > 1 ? { runs: folded, count: all.count, from: all.from } : null;
}

/** The door from a run's own To send to the one list: where two or more runs hand emails over, its numbers. */
export function toSendEveryOf<R extends ToSendRunLike>(runs: readonly R[]): ToSendCount | null {
  const all = toSendAllOf(runs);
  return all && all.runs.length > 1 ? { count: all.count, from: all.from } : null;
}

/**
 * Where a door to the runs waiting for you goes (Today's queue, the Inbox's line): the run, where one waits; the one To
 * send, where every one waits only for its owner to send its emails; else Sent.
 */
export function waitingRunsDoor(waiting: readonly WaitingToSend[]): string {
  const [only] = waiting;
  if (waiting.length === 1 && only) return `broadcasts/run:${only.id}`;
  const toSend = toSendRunsOf(waiting);
  return toSend && toSend.runs.length === waiting.length ? TO_SEND_ROUTE : "broadcasts";
}

/** The block's own acts. */
const REACH_OUT_RUN_LABELS = {
  back: "Back to Sequences",
  approving: "Approving…",
  skip: "Skip this run",
  skipYes: "Yes, skip it",
  hide: "Hide the list",
  hideHeld: "Hide them",
  deciding: "Saying so…",
  rechecking: "Checking again…",
  gated: "decide a held email or approve a run",
} as const;

/** How often the block reads its run again while the check still has sends of it to read (R21). */
export const REACH_OUT_RUN_REREAD_MS = 15_000;

/**
 * Whether a live run is still moving under the page, so its block reads it again (R21): the check still has sends of it
 * to read, or, for a reach-out its owner sends, checked emails still wait to be handed over as drafts (00429).
 */
export function reachOutRunMoving(r: ReachOutRunDto): boolean {
  return r.checking > 0 || (r.owner_sends === true && r.today + r.later > 0);
}

/**
 * What the owner's word on a drafted email did, said at the To send list's head once the door answered (00429). Sent is
 * always recorded, since the email left their inbox: what about its lead would refuse it now is said beside it.
 */
export function toSendSaidWords(
  name: string,
  a: { said: boolean; state: string; reason?: string | null; since?: string | null; on_thread?: boolean },
): string {
  // Left out before the owner's word, by the clock or a reply (not another member's Skip): said with why.
  if (!a.said && a.state === "skipped" && a.reason && a.reason !== "owner_skipped")
    return REACH_OUT_TO_SEND_LABELS.leftOut(name, skippedReasonWords(a.reason));
  if (!a.said) return REACH_OUT_TO_SEND_LABELS.already(a.state);
  if (a.state !== "sent") return REACH_OUT_TO_SEND_LABELS.skippedDone(name);
  if (!a.since) return REACH_OUT_TO_SEND_LABELS.sentDone(name);
  const said = REACH_OUT_TO_SEND_LABELS.sentSince(name, a.since);
  return a.since === "already_yours" && a.on_thread ? `${said} It is on their thread.` : said;
}

/** The notice the check sends the first time it holds a send in a run that is not waiting on its owner (R20). */
export function heldNoticeWords(p: { name: string; held: number; reasons: ReachOutHold[] }): {
  subject: string;
  body: string;
} {
  // What the owner may do with them is what their holds offer (holdDoors), in the doors' own words.
  const doors = [...new Set(p.reasons.flatMap(holdDoors))].map((d) => HOLD_DOOR_WORDS[d].toLowerCase());
  const say = doors.length > 1 ? `${doors.slice(0, -1).join(", ")} or ${doors[doors.length - 1]}` : (doors[0] ?? "");
  return {
    subject: `The check held ${plural(p.held, "email", "emails")} in ${p.name}`,
    body: `${p.held === 1 ? "It waits" : "They wait"} for your say on its run${say ? `: ${say}` : ""}. The rest of the run goes as planned.`,
  };
}
