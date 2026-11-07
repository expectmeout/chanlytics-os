/** Person cards: right now. */

import { isAppointmentWord, type AppointmentWord } from "../../journey/appointment-word";
import { clockDateYear, clockDayLabel, clockTime } from "../../shared/clock";
import { type DealVM, proposalLinkOf, toDealVM } from "../../deals/vm";
import { linkHost } from "../../shared/link";
import type { PersonDetailDto, PersonRowDto } from "../person-dto";
import {
  askedFor,
  heldThreadOf,
  PERSON_MODE_WORDS,
  SILENT_STOP,
  snoozedAsk,
  type HolderNames,
  type ReceptionistTone,
} from "../person-receptionist";
import { ago } from "../person-row-facts";
import { holderOf, personStanding } from "../person-state";
import type { PersonProposalVM } from "../person-reach";
import { igClockOfRow, type PersonRowVM } from "../person-row/row-facts";
import { toPersonRowVM } from "../person-row/row-vm";
import { ourWireOfThreads, proposalSending, proposalSent, replyChannelOfThreads, ts } from "../person-helpers";
import { REPLY_VIA, REPLY_WIRE } from "../person-words";
import { replyWindow } from "../../config/policy/prices";
import { windowClockOf } from "../../config/policy/reply-limits";
import { messageAt, type MessageDto } from "../../conversations/thread-dto";
import { messageText, messageWords } from "../../conversations/message-words";
import { reasonShort, reasonSummaryOf } from "../../conversations/escalations";
import { neverConnected } from "../../conversations/call-dto";
import { shortTime } from "../../conversations/thread-clock";
import { writtenChannelOf, type WrittenChannel } from "../../conversations/thread-channel";
import { HOUR_MS } from "../../shared/time";

export interface PersonRightNow {
  tone: ReceptionistTone;
  title: string;
  detail: string;
  cta: { label: string; to: string } | null;
}

export interface PersonFact {
  label: string;
  value: string | number;
  meta: string;
  tone?: "neg" | "pos" | "";
}

/**
 * One About fact. `next` marks the next appointment's, whatever the business calls one (its key is that word: "Next
 * visit", "Next appointment"), so the page puts the door to it beside the fact it is, never beside a word it guessed.
 */
export interface PersonAboutFact {
  k: string;
  v: string;
  next?: true;
}

/** The customer's last line and the last reply, verbatim. */
export interface PersonLastExchange {
  customer: { text: string; at: string } | null;
  reply: { text: string; at: string; who: "Receptionist" | "Your team" } | null;
}

/** The wire a reply goes out on, exactly, and WhatsApp's window on it as the row says it. */
export interface PersonReply {
  via: WrittenChannel;
  window: { open: boolean; hoursLeft: number };
}

/** What every card of a person's page reads, computed once. */
export interface PersonCardContext {
  /** What the profile read: this person's rows in full, every thread, call, escalation and decision. */
  profile: PersonDetailDto;
  tz: string;
  now: Date;
  nowMs: number;
  /** The member looking, or null for none: whose a thread is depends on it (holderOf). */
  viewerId: string | null;
  /** The roster, where the page has read it, or null: a teammate's thread says whose it is. */
  names: HolderNames | null;
  /** The list row, corrected by the profile's own rows (personRowOf). */
  row: PersonRowDto;
  /** The row view model the page extends, built for the member looking. */
  base: PersonRowVM;
  /** A timestamp's time and day, by the business's clock. */
  stamp: (t: number) => { time: string; day: string };
  /**
   * What the workspace calls an appointment, as the person's read says it (appointment_word, the server's
   * appointmentWordOf): every card says the one word (0041).
   */
  word: AppointmentWord;
  /** Their deals, newest first, as the page says them (0004); every workspace has deals (0008, amended 18 Oct 2026). */
  deals: DealVM[];
  /** The deal the page acts on: the listed copy of the row's, else the row's own; null with none. */
  current: DealVM | null;
  /** The wire the first contact came on, in words. */
  firstChannel: string;
  /** Where a reply goes, exactly; null for a person with no written wire. */
  reply: PersonReply | null;
  proposal: PersonProposalVM | null;
  /** "Sep 3, 2026 · WhatsApp": when the proposal went and on what wire; null until it has. */
  sentWords: string | null;
}

/**
 * The list row, corrected by the profile's own rows. The profile fetched this person's rows in full, so the arrays
 * are the ground truth here and the list row is the summary. Where they disagree (a fresh escalation between the two
 * reads) the arrays win, and every count on the page agrees with the timeline beneath it.
 */
function personRowOf(personDetail: PersonDetailDto): PersonRowDto {
  const openEsc = personDetail.escalations
    .filter((e) => e.state === "open")
    .sort((a, b) => (ts(b.created_at) ?? 0) - (ts(a.created_at) ?? 0))[0];
  return {
    ...personDetail.row,
    open_escalation_reason: openEsc?.reason ?? personDetail.row.open_escalation_reason,
    open_escalation_since: openEsc?.created_at ?? personDetail.row.open_escalation_since,
    conversation_count: personDetail.conversations.length || personDetail.row.conversation_count,
    // A dial that never connected is not a call; people_list agrees, and the
    // profile used to count one more than the list.
    call_count: personDetail.calls.length
      ? personDetail.calls.filter((k) => !neverConnected(k)).length
      : personDetail.row.call_count,
    call_seconds: personDetail.calls.length
      ? Math.round(
          personDetail.calls.filter((k) => !neverConnected(k)).reduce((a, k) => a + (k.duration_ms ?? 0), 0) / 1000,
        )
      : personDetail.row.call_seconds,
    escalation_count: personDetail.escalations.length || personDetail.row.escalation_count,
    visits: personDetail.visits ?? personDetail.row.visits ?? null,
  };
}

/**
 * Their deals as the page lists them (0004): each row through the one view model the People row uses, and each
 * proposal's link with whether it went (0008), read from the thread's own messages as the person's proposal is: the
 * deal card says it for every proposal out, not only the one the page's head acts on.
 */
function dealsListOf(personDetail: PersonDetailDto, tz: string, nowMs: number): DealVM[] {
  return (personDetail.deals ?? [])
    .map((x) => toDealVM(x, tz, nowMs))
    .filter((x): x is DealVM => !!x)
    .map((x) => {
      if (!x.proposal) return x;
      const url = x.proposal.url;
      const sent = proposalSent(personDetail.conversations, url);
      return { ...x, proposal: { ...x.proposal, sent, sending: proposalSending(personDetail.conversations, url) } };
    });
}

/**
 * The wire the first contact actually came on. It was two-valued -- a call,
 * else "WhatsApp" -- so a person whose first word was an email was introduced
 * as having arrived on WhatsApp. The profile has every message; it asks them.
 */
function firstChannelOf(personDetail: PersonDetailDto, base: PersonRowVM): string {
  const firstIsCall = personDetail.calls.some((k) => k.started_at && ts(k.started_at) === base.firstContact.ts);
  const firstWritten = personDetail.conversations
    .flatMap((c) => c.messages)
    .filter((m) => m.type !== "call_summary")
    .map((m) => ({ at: Date.parse(m.channel_ts ?? m.created_at), channel: m.channel }))
    .filter((m) => Number.isFinite(m.at))
    .sort((a, b) => a.at - b.at)[0];
  return base.firstContact.estimate
    ? "imported history"
    : firstIsCall || !base.hasChat
      ? "Phone"
      : firstWritten
        ? REPLY_VIA[writtenChannelOf(firstWritten.channel)]
        : "WhatsApp";
}

/**
 * Where a reply goes, exactly, in the reply route's own order (the dashboard's replyChannelOf): their last written
 * words among the messages the profile holds; else where the row says they last wrote (00320), a text included, where
 * this fallback knew Email and called every other word WhatsApp; else, nothing having come from their side, the wire
 * our own written words last went by, as the Inbox's box reads it (ourWireOfThreads); and with none of those the
 * row's own word (replyChannelOfRow), which is its strictest guess. With the window on that wire (replyWindow) and
 * the hours it has left.
 */
function replyOf(
  personDetail: PersonDetailDto,
  row: PersonRowDto,
  base: PersonRowVM,
  now: Date,
  nowMs: number,
): PersonReply | null {
  const rowVia = base.replyVia ? REPLY_WIRE[base.replyVia] : null;
  const via =
    replyChannelOfThreads(personDetail.conversations) ??
    (base.lastChannel ? rowVia : null) ??
    ourWireOfThreads(personDetail.conversations) ??
    rowVia;
  // Each wire's window by its own clock: a DM's from the threads that hold one (their accessor), else the row's.
  const dmClock =
    personDetail.conversations
      .map((c) => c.last_ig_inbound_at ?? "")
      .filter(Boolean)
      .sort()
      .at(-1) ?? igClockOfRow(row);
  const clocks = { whatsapp: row.latest_wa_inbound_at, instagram: dmClock };
  const exactWindow = via ? replyWindow(via, windowClockOf(via, clocks), now) : null;
  if (!via || !exactWindow) return null;
  const hoursLeft = exactWindow.closesAtIso
    ? Math.max(0, Math.round((new Date(exactWindow.closesAtIso).getTime() - nowMs) / HOUR_MS))
    : 0;
  return { via, window: { open: exactWindow.open, hoursLeft } };
}

/**
 * Their proposal (proposalLinkOf, 0008): the link on the deal they are deciding on while it is a proposal out, none
 * for any other deal, the person's own only with no deal at all. Its host for the row, whether it went out, and the
 * words for when it did.
 */
function proposalOf(
  personDetail: PersonDetailDto,
  current: DealVM | null,
  tz: string,
): Pick<PersonCardContext, "proposal" | "sentWords"> {
  const proposalUrl = proposalLinkOf(current, personDetail.proposal_url);
  const proposal: PersonProposalVM | null = proposalUrl
    ? { url: proposalUrl, host: linkHost(proposalUrl), sent: proposalSent(personDetail.conversations, proposalUrl) }
    : null;
  const sentAt = proposal?.sent ? ts(proposal.sent.at) : null;
  const sentWords =
    proposal?.sent && sentAt !== null
      ? `${clockDateYear(sentAt, tz)}${proposal.sent.via ? ` · ${proposal.sent.via}` : ""}`
      : null;
  return { proposal, sentWords };
}

/** The context every card reads, for the member looking (toPersonRowVM's viewer). */
export function personCardContext(
  personDetail: PersonDetailDto,
  tz: string,
  now: Date,
  viewerId: string | null,
  /** The roster, where the page has read it: a teammate's thread says whose it is (heldThreadOf). */
  names: HolderNames | null = null,
): PersonCardContext {
  const nowMs = now.getTime();
  const row = personRowOf(personDetail);
  // A card reads none of a row's reach facts (who can be sent what: the lists', Today's and the follow-up's), so it does
  // not carry the workspace's channels and counts them as before they were.
  const base = toPersonRowVM(row, tz, now, viewerId, null, names);
  // The workspace's word, as the server read it with the person; one from before the word reads "appointment".
  const word: AppointmentWord = isAppointmentWord(personDetail.appointment_word)
    ? personDetail.appointment_word
    : "appointment";
  const deals = dealsListOf(personDetail, tz, nowMs);
  // The row's columns say WHICH deal shows (people_list's lateral join, pickCurrentDeal's rule); the listed copy of it
  // carries the version a move is checked against, which the columns do not.
  const current = deals.find((x) => x.id === base.deal?.id) ?? base.deal;
  return {
    profile: personDetail,
    tz,
    now,
    nowMs,
    viewerId,
    names,
    row,
    base,
    stamp: (t: number) => ({ time: clockTime(t, tz), day: clockDayLabel(t, tz, nowMs) }),
    word,
    deals,
    current,
    firstChannel: firstChannelOf(personDetail, base),
    reply: replyOf(personDetail, row, base, now, nowMs),
    ...proposalOf(personDetail, current, tz),
  };
}

/** Last exchange: the customer's last line and the last reply, verbatim, from their latest thread. */
export function lastExchangeOf({ profile, stamp }: PersonCardContext): PersonLastExchange {
  const latestConv = [...profile.conversations].sort(
    (a, b) => (ts(b.last_message_at) ?? 0) - (ts(a.last_message_at) ?? 0),
  )[0];
  let customer: PersonLastExchange["customer"] = null;
  let reply: PersonLastExchange["reply"] = null;
  if (latestConv) {
    for (let index = latestConv.messages.length - 1; index >= 0; index--) {
      const message: MessageDto = latestConv.messages[index];
      if (message.type === "call_summary") continue;
      const result = ts(messageAt(message));
      if (result === null) continue;
      // Their words as the thread says them (messageWords): an email's quoted chain is not what they wrote.
      if (!customer && message.direction === "inbound" && message.body)
        customer = { text: messageWords(message), at: `${stamp(result).time} ${stamp(result).day}` };
      if (
        !reply &&
        message.direction === "outbound" &&
        message.status !== "canceled" &&
        (message.sender === "ai" || message.sender === "human")
      ) {
        reply = {
          text: messageText(message),
          at: `${stamp(result).time} ${stamp(result).day}`,
          // A person's reply is the team's (message-author.ts): the row does not say which member sent it.
          who: message.sender === "ai" ? "Receptionist" : "Your team",
        };
      }
      if (customer && reply) break;
    }
  }
  return { customer, reply };
}

/**
 * Right now: what the receptionist is doing for this person. The card names the receptionist and wears the
 * standing's own word as a pill (tone.ts, the word the People row wears), so `detail` is one sentence: the
 * reason and what happens next -- never the receptionist's name again, never the state a second time. Ask
 * reads `title` and `detail` together (server/ask/tools.ts), so the title keeps the state for it.
 */
export function rightNowOf({
  profile,
  tz,
  now,
  nowMs,
  viewerId,
  names,
  row: r,
  base,
}: PersonCardContext): PersonRightNow {
  const threadTo = r.latest_conversation_id ? `inbox/th-${r.latest_conversation_id}` : null;
  // One door, one label: the header's "Open thread" and this card's "Open in Inbox" went to the same thread.
  const openThread = threadTo ? { label: "Open the thread", to: threadTo } : null;
  const queuedCard = (): PersonRightNow => {
    const q = ts(r.queued_reply_at);
    return {
      tone: "queued",
      title: "Reply sending",
      detail: `A reply is queued${q !== null ? `, ${ago(q, tz, nowMs)}` : ""} — it can still be stopped from the Inbox.`,
      cta: openThread,
    };
  };
  // A snooze puts the thread aside whatever else is open on it (standingOf, the Inbox's rule): Snoozed, with when it wakes
  // and what it still asks for. The card tested the open escalation first and said "Needs you · Escalated" over a thread the
  // Inbox had filed away (D1-snoozed-hold). A reply counting down to send is still what the thread is doing, so it goes on.
  if (personStanding(r, nowMs, viewerId).standing === "snoozed") {
    if (r.queued_reply_at) return queuedCard();
    const asks = snoozedAsk(r);
    const wakes = base.receptionist.wakes;
    const sentence = [wakes ? `Wakes ${wakes}.` : null, asks ? `${asks} — that is still waiting for you.` : null];
    return {
      tone: "snoozed",
      title: "Snoozed",
      detail: sentence.filter(Boolean).join(" ") || "Hidden from your queue until it wakes.",
      cta: openThread,
    };
  }
  // A thread a person has is theirs, whatever flagged it: personReceptionistOf's
  // order, so this card and the Receptionist fact cannot disagree. It asked
  // needs_human first, and an owner who had just answered an email -- a reply
  // claims the thread, and its state stays needs_human until handed back --
  // read "Needs you · Stopped, and nobody has taken the thread yet". Whose it
  // is, is the Inbox's own word for it (heldThreadOf, with the teammate's name where the roster says it).
  const held = holderOf(r, nowMs, viewerId);
  if (held) {
    const holder = held === "theirs" && r.latest_assignee_user_id ? names?.(r.latest_assignee_user_id) : null;
    const { tone, title, detail } = heldThreadOf(held, holder);
    return { tone, title, detail, cta: openThread };
  }
  // A hold that waits on nobody (a STOP, opened before decision 0048) is no card of a wait: the consent card below says it.
  const request = askedFor(r);
  if (request) {
    const since = r.open_escalation_since ? shortTime(r.open_escalation_since, tz, now) : null;
    return {
      tone: "escalated",
      title: `Escalated · ${reasonShort(request)}`,
      // The operator's first sentence for the reason (the Inbox's own): "Paused until someone answers" was appended to
      // every reason, over a person who had asked to stop, where nothing may be answered (the 2 Oct 2026 audit).
      detail: `${since ? `Since ${since}. ` : ""}${reasonSummaryOf(request)}`,
      cta: openThread,
    };
  }
  if (r.needs_human) {
    return {
      tone: "escalated",
      title: "Waiting for a person",
      detail: "Stopped, and nobody has taken the thread yet.",
      cta: openThread,
    };
  }
  if (r.queued_reply_at) return queuedCard();
  if (base.consent.state === "opted_out") {
    // The consent ask on the rail carries the date and the words; here, only what it means for the thread.
    return { tone: "silent", title: SILENT_STOP.label, detail: SILENT_STOP.detail, cta: null };
  }
  if (
    ["never", "ask"].includes(profile.receptionist_mode ?? "") ||
    ["never", "ask"].includes(profile.workspace_reply_mode ?? "")
  ) {
    // "Answering" sat two inches from "Receptionist for Dani: Never".
    const theirs = ["never", "ask"].includes(profile.receptionist_mode ?? "");
    const mode = theirs ? profile.receptionist_mode : profile.workspace_reply_mode;
    const word = PERSON_MODE_WORDS[mode === "never" ? "never" : "ask"];
    return {
      tone: "paused",
      title: `Held for you, set to ${word}`,
      detail: theirs
        ? `Set to ${word} for them — their messages come straight to you.`
        : `Set to ${word} for the workspace — every message waits for a person.`,
      cta: openThread,
    };
  }
  return {
    tone: "answering",
    title: "Answering",
    detail: "New messages are answered automatically.",
    cta: base.threadId ? { label: "Open the thread", to: `inbox/${base.threadId}` } : null,
  };
}
