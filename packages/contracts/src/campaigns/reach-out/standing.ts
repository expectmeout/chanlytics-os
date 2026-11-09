/**
 * Where cold email stands (the Cold email canvas's States board): the one thing that matters most, and what to press.
 * One answer, so the page, New, Today and Ask cannot disagree, and no email is held by surprise. Its own module, since a
 * contracts module rides whole into every page that imports it: Today reads this and none of the page's words.
 */
import { mailboxHoldWords } from "../../email/mailbox-standing";
import { leadsRoute } from "../../leads/plan";
import { dayInZone, usableZone } from "../../shared/zone/math";
import { plural } from "../../shared/words";
import { newForLeadsRoute, runRoute, sequenceRoute } from "../sequences/address";

export type ColdEmailStandingKind =
  | "no_mailbox"
  | "reconnect"
  | "held"
  | "no_address"
  | "waiting_ok"
  | "month_used"
  | "no_one_new"
  | "not_started"
  | "ready"
  | "paused"
  | "sending";

/** A running sequence, newest first; a number is null where it could not be read, and is left out, never a made-up 0. */
export interface ColdEmailRunning {
  root_id?: string;
  name: string;
  sent: number | null;
  wroteBack: number | null;
  interested: number | null;
  waitingLeads: number | null;
}

export interface ColdEmailStandingFacts {
  /** The workspace's live mailboxes (contracts mailboxIsLive). */
  mailboxes: readonly { state: string; held_why: string | null }[];
  hasAddress: boolean;
  /** Emails held for want of an address (`no_business_address`), or null where they could not be counted. */
  heldForAddress: number | null;
  waitingRun: { id: string; planned: number | null; name: string; first: boolean } | null;
  month: { sent: number | null; of: number };
  running: readonly ColdEmailRunning[];
  /** A sequence to leads exists, running or not. */
  hadSequence: boolean;
  hasSearch: boolean;
  /** Something says what the business sells (contracts reachOutOfferOf). A read that failed counts as said. */
  hasPitch: boolean;
  whoFor: string | null;
  nowMs: number;
  tz: string;
}

export interface ColdEmailStep {
  id: "mailbox" | "address" | "pitch" | "people";
  done: boolean;
  title: string;
  detail: string;
}

export interface ColdEmailStanding {
  kind: ColdEmailStandingKind;
  headline: string;
  detail: string | null;
  /** The one thing to press, or null where there is nothing to do. */
  act: string | null;
  /** Where its press goes, or null where the page opens something of its own (Connect, a step's own door). */
  to: string | null;
  /** Whether it waits on the owner: drawn amber, and what Today speaks up about. */
  needs_you: boolean;
  /** What is left before a first email, in the order a person does it. */
  steps: ColdEmailStep[];
}

/** Today's one line on cold email: what waits, the press, and where it goes. */
export interface ColdEmailNote {
  headline: string;
  act: string;
  to: string;
}

/** What refuses a new sequence to leads with no mailbox to send it, on New, on Ask's card and at the door. */
export const COLD_EMAIL_NEEDS_MAILBOX =
  "Connect your mailbox first: a sequence to leads sends from your own address. Settings › Cold email has the way.";
/** Ask's word where the mailboxes could not be read: nobody is told they have none on a read that failed. */
export const COLD_EMAIL_MAILBOX_UNREAD = "Couldn't check your mailbox just now. Try again in a moment.";
/** What a door says to a new sequence asking to be sent by hand. */
export const NO_SENDING_BY_HAND =
  "Chanlytics sends cold email from your mailbox, so sending each by hand isn't offered.";

const CONNECTIONS_PAGE = "admin/integrations";
/** Why a mailbox needs reconnecting: the top card and a refused sequence say it alike. */
const SIGN_IN_ASKED = "Google asked you to sign in again.";
const ADDRESS_ROUTE = "admin/workspace/address";

const sentence = (clause: string): string => `${clause.charAt(0).toUpperCase()}${clause.slice(1)}.`;

/** What is left before a first email: said on a new account, and read by the one that has only one thing left. */
function stepsLeftOf(f: ColdEmailStandingFacts): ColdEmailStep[] {
  return [
    {
      id: "mailbox",
      done: f.mailboxes.length > 0,
      title: "Connect your mailbox",
      detail: "Emails go out from your own address",
    },
    {
      id: "address",
      done: f.hasAddress,
      title: "Add your business address",
      detail: "The law asks for it in every email",
    },
    {
      id: "pitch",
      done: f.hasPitch,
      title: "Say what you sell",
      detail: "So your emails have something to say",
    },
    {
      id: "people",
      done: f.hasSearch,
      title: "Find businesses to write to",
      detail: f.whoFor ? `Start with ${f.whoFor}` : "Search for the kind of business you want to reach",
    },
  ];
}

/** The first of next month in the workspace's own calendar, as "December 1". */
function nextMonthWords(nowMs: number, tz: string): string {
  const { y, m } = dayInZone(usableZone(tz), nowMs);
  return new Date(Date.UTC(y, m, 1)).toLocaleDateString("en-US", { timeZone: "UTC", month: "long", day: "numeric" });
}

/** A rule's answer, or null where it says nothing and the next one speaks. */
type Answer = Omit<ColdEmailStanding, "steps"> | null;
type Rule = (f: ColdEmailStandingFacts, left: readonly ColdEmailStep[]) => Answer;

/** How many of the workspace's mailboxes send, and what to say of them beside one that does not. */
const sendersOf = (f: ColdEmailStandingFacts): number => f.mailboxes.filter((m) => m.state === "connected").length;
const othersSend = (senders: number): string =>
  senders === 1 ? "Your other mailbox still sends." : "Your other mailboxes still send.";

/** A held mailbox asks even beside one that sends: the emails planned on it wait until it is fixed. */
const heldAnswer: Rule = (f) => {
  const held = f.mailboxes.find((m) => m.state === "held");
  if (!held) return null;
  const holdReason = sentence(mailboxHoldWords(held.held_why));
  const senders = sendersOf(f);
  return {
    kind: "held",
    headline: senders > 0 ? "One mailbox is paused to protect your name" : "Sending paused to protect your name",
    detail:
      senders > 0 ? `${holdReason} ${othersSend(senders)} Fix it, then resume.` : `${holdReason} Fix it, then resume.`,
    act: "See what to fix",
    to: CONNECTIONS_PAGE,
    needs_you: true,
  };
};

const reconnectAnswer: Rule = (f) => {
  if (!f.mailboxes.some((m) => m.state === "reconnect")) return null;
  const senders = sendersOf(f);
  return {
    kind: "reconnect",
    headline: senders > 0 ? "One mailbox needs reconnecting" : "Your mailbox needs reconnecting",
    detail:
      senders > 0
        ? `${SIGN_IN_ASKED} Its emails wait until you do. ${othersSend(senders)}`
        : `${SIGN_IN_ASKED} Your emails are waiting, and they go on where they stopped.`,
    act: "Reconnect",
    to: CONNECTIONS_PAGE,
    needs_you: true,
  };
};

/**
 * Why a new sequence to leads can't be made, in the words of what is true, or null where a mailbox sends. One answer
 * for New's door and Ask's card, in the order the top card says them. A mailbox that is there and can't send is never
 * asked for again: only none at all reads COLD_EMAIL_NEEDS_MAILBOX, which is what New takes its mailbox off for.
 */
export function coldEmailCannotSendWhy(
  mailboxes: readonly { state: string; held_why?: string | null }[],
): string | null {
  if (mailboxes.some((m) => m.state === "connected")) return null;
  const held = mailboxes.find((m) => m.state === "held");
  if (held) {
    return `Your mailbox is paused to protect your name: ${mailboxHoldWords(held.held_why)}. Settings › Connections has what to fix.`;
  }
  if (mailboxes.some((m) => m.state === "reconnect")) {
    return `Your mailbox needs reconnecting: ${SIGN_IN_ASKED} Reconnect it in Settings › Connections, then start your sequence.`;
  }
  if (mailboxes.some((m) => m.state === "paused")) {
    return "Your mailbox is paused. Resume it in Settings › Connections, then start your sequence.";
  }
  return COLD_EMAIL_NEEDS_MAILBOX;
}

/** Nothing running and things left: the list, unless the mailbox alone is left, which has an answer of its own. */
const notStartedAnswer: Rule = (f, left) => {
  if (f.running.length > 0 || left.length === 0) return null;
  if (left.length === 1 && left[0]?.id === "mailbox") return null;
  return {
    kind: "not_started",
    headline: `${plural(left.length, "thing", "things")} before your first email`,
    detail: null,
    act: null,
    to: null,
    needs_you: true,
  };
};

const noMailboxAnswer: Rule = (f) =>
  f.mailboxes.length === 0
    ? {
        kind: "no_mailbox",
        headline: "Connect your mailbox to start sending",
        detail: "Emails go out from your own address, so replies come back to you. Nothing can go out without one.",
        act: "Connect Google",
        to: null,
        needs_you: true,
      }
    : null;

const noAddressAnswer: Rule = (f) => {
  if (f.hasAddress) return null;
  const held = f.heldForAddress ?? 0;
  return {
    kind: "no_address",
    headline:
      held > 0 ? `${plural(held, "email is", "emails are")} waiting for your address` : "Your emails need your address",
    detail: "The law asks for one in every cold email, so nothing goes out without it.",
    act: "Add your address",
    to: ADDRESS_ROUTE,
    needs_you: true,
  };
};

const waitingAnswer: Rule = (f) => {
  const run = f.waitingRun;
  if (!run) return null;
  const size = run.planned === null ? "" : ` ${run.planned}`;
  return {
    kind: "waiting_ok",
    headline: `Your ${run.first ? "first" : "next"}${size} emails are ready for your OK`,
    detail: `Written and checked for ${run.name}. Nothing goes out until you say so.`,
    act: "Read and approve",
    to: runRoute(run.id),
    needs_you: true,
  };
};

const monthAnswer: Rule = (f) =>
  f.month.sent !== null && f.month.sent >= f.month.of
    ? {
        kind: "month_used",
        headline: `Paused until ${nextMonthWords(f.nowMs, f.tz)}`,
        detail: `You've sent this month's ${f.month.of.toLocaleString("en-US")} first emails. Follow-ups and replies keep going.`,
        act: null,
        to: null,
        needs_you: false,
      }
    : null;

const noOneNewAnswer: Rule = (f) => {
  const dry = f.running.find((r) => r.waitingLeads === 0);
  return dry
    ? {
        kind: "no_one_new",
        headline: `${dry.name} has no one new to write to`,
        detail: "Its follow-ups keep going. Find more businesses, or try a nearby city.",
        act: "Find more businesses",
        to: leadsRoute({}),
        needs_you: true,
      }
    : null;
};

/** Every mailbox paused by its owner. It outranks a batch that waits, since an OK alone would send nothing. */
const pausedAnswer: Rule = (f) => {
  if (f.mailboxes.length === 0 || !f.mailboxes.every((m) => m.state === "paused")) return null;
  const run = f.waitingRun;
  const size = run?.planned ?? null;
  const ready = size === null ? "Emails are" : plural(size, "email is", "emails are");
  return {
    kind: "paused",
    headline: "Your mailbox is paused",
    detail: `${run ? `${ready} ready for your OK. ` : ""}Nothing goes out until you resume it.`,
    act: "Open Connections",
    to: CONNECTIONS_PAGE,
    needs_you: run !== null,
  };
};

const readyAnswer: Rule = (f) =>
  f.running.length === 0
    ? {
        kind: "ready",
        headline: f.hadSequence ? "No sequence is running" : "Ready for your first sequence",
        detail: f.hadSequence
          ? "Start one, or turn one back on in Campaigns."
          : "Pick who to write to, and Ask writes the emails from your pitch. You approve the first run before anything goes out.",
        act: "Start a sequence",
        to: newForLeadsRoute(),
        needs_you: false,
      }
    : null;

/** A running sequence's numbers, where they were read: "34 sent, 5 replies, 2 interested". */
function runningNumbersOf(r: ColdEmailRunning): string | null {
  const parts = [
    r.sent === null ? null : `${r.sent} sent`,
    r.wroteBack === null ? null : plural(r.wroteBack, "reply", "replies"),
    r.interested === null ? null : `${r.interested} interested`,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

function sendingAnswer(f: ColdEmailStandingFacts): NonNullable<Answer> {
  const newest = f.running[0];
  const numbers = newest ? runningNumbersOf(newest) : null;
  const named = newest ? (numbers ? `${newest.name}: ${numbers}` : newest.name) : null;
  const more = f.running.length - 1;
  return {
    kind: "sending",
    headline: "Sending",
    detail: named && more > 0 ? `${named}. And ${more} more running` : named,
    act: null,
    to: newest?.root_id ? sequenceRoute(newest.root_id) : "campaigns",
    needs_you: false,
  };
}

/** Where the note on Today opens: the answer's own door, else the page. */
const COLD_EMAIL_ROUTE = "admin/outreach";

/**
 * What Today says of cold email, from the one answer: where it waits on the owner, and nothing otherwise. The caller asks
 * only once a workspace has started cold email, so a business that writes none is never asked about it (decision 0113).
 */
export function coldEmailNoteOf(standing: ColdEmailStanding): ColdEmailNote | null {
  if (!standing.needs_you) return null;
  return { headline: standing.headline, act: standing.act ?? "Open", to: standing.to ?? COLD_EMAIL_ROUTE };
}

/**
 * In the order they outrank each other: a mailbox that cannot send first, since nothing said below it would go out,
 * and a thing to do before a thing to read.
 */
const ANSWERS_IN_ORDER: readonly Rule[] = [
  heldAnswer,
  reconnectAnswer,
  notStartedAnswer,
  noMailboxAnswer,
  noAddressAnswer,
  pausedAnswer,
  waitingAnswer,
  monthAnswer,
  noOneNewAnswer,
  readyAnswer,
];

/** The one answer for where cold email stands, from what the reader found. */
export function coldEmailStandingOf(f: ColdEmailStandingFacts): ColdEmailStanding {
  const steps = stepsLeftOf(f);
  const undone = steps.filter((s) => !s.done);
  // The pitch alone never holds back a workspace that has already written: its emails went without one.
  const left = f.hadSequence && undone.every((s) => s.id === "pitch") ? [] : undone;
  for (const rule of ANSWERS_IN_ORDER) {
    const answer = rule(f, left);
    if (answer) return { ...answer, steps };
  }
  return { ...sendingAnswer(f), steps };
}
