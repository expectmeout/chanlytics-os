/**
 * A person's page, card by card: the context every card reads, computed once (the list row corrected by the
 * profile's own rows, its row view model, the clock, the deal in view, the wire a reply goes on, the proposal), and
 * one builder per card over it -- the last exchange, Right now, the facts strip, the About rail, and the rail's small
 * pieces. Each is a pure function of the context; toPersonVM (person-profile.ts) composes them, and the timeline's
 * builders are person-timeline.ts. Decomposed from toPersonVM (Phase 2 of the organization plan), proven equal by
 * value. index.ts names the card types; the builders are internal.
 */
import { visitDay, visitLine, visitTime } from "../calendar/calendar-people";
import { clockDate, clockDateYear, clockDayLabel, clockTime } from "../shared/clock";
import { type DealVM, proposalLinkOf, toDealVM } from "../deals/deal-vm";
import { leadsRoute } from "../leads/leads";
import { linkHost } from "../shared/link";
import { listRuleWhy } from "./list-rules";
import { PEOPLE_LISTS } from "./lists";
import {
  ago,
  asPersonMode,
  bookingLinkAction,
  isOwned,
  PERSON_MODE_WORDS,
  type PersonDetailDto,
  type PersonMode,
  type PersonProposalVM,
  type PersonRowDto,
  type PersonRowVM,
  reasonShort,
  type ReceptionistTone,
  repliesWords,
  toPersonRowVM,
  visitTitleFor,
} from "./people";
import { addedBy, proposalSending, proposalSent, replyChannelOfThreads, ts } from "./person-helpers";
import { capitalize } from "../shared/words";
import { PERSON_CHANNEL_WORDS, REPLY_VIA } from "./person-words";
import { replyWindow } from "../config/policy";
import { messageAt, type MessageDto } from "../conversations/thread-dto";
import { messageText } from "../conversations/message-words";
import { shortTime } from "../conversations/thread-clock";
import { writtenChannelOf } from "../conversations/thread-channel";
import { HOUR_MS } from "../shared/time";

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

/** The customer's last line and the last reply, verbatim. */
export interface PersonLastExchange {
  customer: { text: string; at: string } | null;
  reply: { text: string; at: string; who: "Receptionist" | "You" } | null;
}

/** The wire a reply goes out on, exactly, and WhatsApp's window on it as the row says it. */
interface PersonReply {
  via: "whatsapp" | "sms" | "email";
  window: { open: boolean; hoursLeft: number };
}

/** What every card of a person's page reads, computed once. */
export interface PersonCardContext {
  /** What the profile read: this person's rows in full, every thread, call, escalation and decision. */
  profile: PersonDetailDto;
  tz: string;
  now: Date;
  nowMs: number;
  /** The list row, corrected by the profile's own rows (personRowOf). */
  row: PersonRowDto;
  /** The row view model the page extends, built for the member looking. */
  base: PersonRowVM;
  /** A timestamp's time and day, by the business's clock. */
  stamp: (t: number) => { time: string; day: string };
  /**
   * Whether deals are on here (dealsAreOn, 0008): where they are off, nothing on the page says a deal -- no fact, no
   * timeline line, no proposal -- whatever the database holds.
   */
  dealsOn: boolean;
  /** Their deals, newest first, as the page says them (0004); empty where deals are off. */
  deals: DealVM[];
  /** The deal the page acts on: the listed copy of the row's, else the row's own; null where deals are off. */
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
function personRowOf(d: PersonDetailDto): PersonRowDto {
  const openEsc = d.escalations
    .filter((e) => e.state === "open")
    .sort((a, b) => (ts(b.created_at) ?? 0) - (ts(a.created_at) ?? 0))[0];
  return {
    ...d.row,
    open_escalation_reason: openEsc?.reason ?? d.row.open_escalation_reason,
    open_escalation_since: openEsc?.created_at ?? d.row.open_escalation_since,
    conversation_count: d.conversations.length || d.row.conversation_count,
    // A dial that never connected is not a call; people_list agrees, and the
    // profile used to count one more than the list.
    call_count: d.calls.length ? d.calls.filter((k) => k.status !== "not_connected").length : d.row.call_count,
    call_seconds: d.calls.length
      ? Math.round(
          d.calls.filter((k) => k.status !== "not_connected").reduce((a, k) => a + (k.duration_ms ?? 0), 0) / 1000,
        )
      : d.row.call_seconds,
    escalation_count: d.escalations.length || d.row.escalation_count,
    visits: d.visits ?? d.row.visits ?? null,
  };
}

/**
 * Their deals as the page lists them (0004): each row through the one view model the People row uses, and each
 * proposal's link with whether it went (0008), read from the thread's own messages as the person's proposal is: the
 * deal card says it for every proposal out, not only the one the page's head acts on.
 */
function dealsListOf(d: PersonDetailDto, tz: string, nowMs: number): DealVM[] {
  return (d.deals ?? [])
    .map((x) => toDealVM(x, tz, nowMs))
    .filter((x): x is DealVM => !!x)
    .map((x) => {
      if (!x.proposal) return x;
      const url = x.proposal.url;
      const sent = proposalSent(d.conversations, url);
      return { ...x, proposal: { ...x.proposal, sent, sending: proposalSending(d.conversations, url) } };
    });
}

/**
 * The wire the first contact actually came on. It was two-valued -- a call,
 * else "WhatsApp" -- so a person whose first word was an email was introduced
 * as having arrived on WhatsApp. The profile has every message; it asks them.
 */
function firstChannelOf(d: PersonDetailDto, base: PersonRowVM): string {
  const firstIsCall = d.calls.some((k) => k.started_at && ts(k.started_at) === base.firstContact.ts);
  const firstWritten = d.conversations
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
 * Where a reply goes, exactly: the profile knows their last written words, the
 * row only which wires they have used (replyChannelOfRow says why it reads the
 * strictest window when it cannot tell). With the window on that wire (replyWindow) and the hours it has left.
 */
function replyOf(
  d: PersonDetailDto,
  row: PersonRowDto,
  base: PersonRowVM,
  now: Date,
  nowMs: number,
): PersonReply | null {
  const via =
    replyChannelOfThreads(d.conversations) ?? (base.replyVia === "Email" ? "email" : base.replyVia ? "whatsapp" : null);
  const exactWindow = via ? replyWindow(via, row.latest_wa_inbound_at, now) : null;
  if (!via || !exactWindow) return null;
  const hoursLeft = exactWindow.closesAtIso
    ? Math.max(0, Math.round((new Date(exactWindow.closesAtIso).getTime() - nowMs) / HOUR_MS))
    : 0;
  return { via, window: { open: exactWindow.open, hoursLeft } };
}

/**
 * Their proposal (proposalLinkOf, 0008): the link on the deal they are deciding on while it is a proposal out, none
 * for any other deal, the person's own only with no deal at all; nothing where deals are off. Its host for the row,
 * whether it went out, and the words for when it did.
 */
function proposalOf(
  d: PersonDetailDto,
  dealsOn: boolean,
  current: DealVM | null,
  tz: string,
): Pick<PersonCardContext, "proposal" | "sentWords"> {
  const proposalUrl = dealsOn ? proposalLinkOf(current, d.proposal_url) : null;
  const proposal: PersonProposalVM | null = proposalUrl
    ? { url: proposalUrl, host: linkHost(proposalUrl), sent: proposalSent(d.conversations, proposalUrl) }
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
  d: PersonDetailDto,
  tz: string,
  now: Date,
  viewerId: string | null,
): PersonCardContext {
  const nowMs = now.getTime();
  const row = personRowOf(d);
  const base = toPersonRowVM(row, tz, now, viewerId);
  const dealsOn = !!d.deals_on;
  const deals = dealsOn ? dealsListOf(d, tz, nowMs) : [];
  // The row's columns say WHICH deal shows (people_list's lateral join, pickCurrentDeal's rule); the listed copy of it
  // carries the version a move is checked against, which the columns do not.
  const current = dealsOn ? (deals.find((x) => x.id === base.deal?.id) ?? base.deal) : null;
  return {
    profile: d,
    tz,
    now,
    nowMs,
    row,
    base,
    stamp: (t: number) => ({ time: clockTime(t, tz), day: clockDayLabel(t, tz, nowMs) }),
    dealsOn,
    deals,
    current,
    firstChannel: firstChannelOf(d, base),
    reply: replyOf(d, row, base, now, nowMs),
    ...proposalOf(d, dealsOn, current, tz),
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
    for (let i = latestConv.messages.length - 1; i >= 0; i--) {
      const m: MessageDto = latestConv.messages[i];
      if (m.type === "call_summary") continue;
      const t = ts(messageAt(m));
      if (t === null) continue;
      if (!customer && m.direction === "inbound" && m.body)
        customer = { text: m.body, at: `${stamp(t).time} ${stamp(t).day}` };
      if (
        !reply &&
        m.direction === "outbound" &&
        m.status !== "canceled" &&
        (m.sender === "ai" || m.sender === "human")
      ) {
        reply = {
          text: messageText(m),
          at: `${stamp(t).time} ${stamp(t).day}`,
          who: m.sender === "ai" ? "Receptionist" : "You",
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
export function rightNowOf({ profile, tz, now, nowMs, row: r, base }: PersonCardContext): PersonRightNow {
  const threadTo = r.latest_conversation_id ? `inbox/th-${r.latest_conversation_id}` : null;
  // One door, one label: the header's "Open thread" and this card's "Open in Inbox" went to the same thread.
  const openThread = threadTo ? { label: "Open the thread", to: threadTo } : null;
  // A thread a person owns is theirs, whatever flagged it: receptionistOf's
  // order, so this card and the Receptionist fact cannot disagree. It asked
  // needs_human first, and an owner who had just answered an email -- a reply
  // claims the thread, and its state stays needs_human until handed back --
  // read "Needs you · Stopped, and nobody has taken the thread yet".
  if (isOwned(r, nowMs)) {
    return {
      tone: "paused",
      title: "Paused, a person owns this thread",
      detail: "A person owns this thread; automatic replies resume when it is handed back.",
      cta: openThread,
    };
  }
  if (r.open_escalation_reason) {
    const since = r.open_escalation_since ? shortTime(r.open_escalation_since, tz, now) : null;
    return {
      tone: "escalated",
      title: `Escalated · ${reasonShort(r.open_escalation_reason)}`,
      detail: `${capitalize(reasonShort(r.open_escalation_reason))}${since ? ` · since ${since}` : ""}. Paused until someone answers.`,
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
  if (r.queued_reply_at) {
    const q = ts(r.queued_reply_at);
    return {
      tone: "queued",
      title: "Reply sending",
      detail: `A reply is queued${q !== null ? `, ${ago(q, tz, nowMs)}` : ""} — it can still be stopped from the Inbox.`,
      cta: openThread,
    };
  }
  if (base.receptionist.tone === "snoozed") {
    return {
      tone: "snoozed",
      title: "Snoozed",
      detail: `Wakes ${shortTime(r.latest_snooze_until ?? null, tz, now)}.`,
      cta: openThread,
    };
  }
  if (base.consent.state === "opted_out") {
    // The consent ask on the rail carries the date and the words; here, only what it means for the thread.
    return {
      tone: "silent",
      title: "Silent, they opted out",
      detail: "They said stop — nothing goes out to them until they ask again.",
      cta: null,
    };
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

/** "Held for you" is the word the People row puts beside the state, for a thread a person owns or a mode that holds. */
const TONE_WORD: Record<ReceptionistTone, string> = {
  answering: "Answering",
  escalated: "Waiting",
  queued: "Queued",
  snoozed: "Snoozed",
  paused: "Held for you",
  silent: "Silent",
};

/** Under the word, what the label says after it ("set to Never", "a person owns the thread"), not the label again. */
const receptionistMeta = (label: string) =>
  label.includes(", ") ? label.slice(label.indexOf(", ") + 2) : label.toLowerCase();

/** Facts strip: first and last contact, conversations, calls, the receptionist's standing, the deal, the next visit. */
export function personFactsOf({ profile, tz, nowMs, base, current, firstChannel }: PersonCardContext): PersonFact[] {
  const lc = base.lastContact;
  const lastMeta =
    lc.who === "they"
      ? lc.kind === "call"
        ? "they phoned"
        : "they wrote"
      : lc.who === "you"
        ? "you replied"
        : lc.who === "receptionist"
          ? "receptionist replied"
          : lc.who === "system"
            ? "we sent"
            : "";
  const facts: PersonFact[] = [
    { label: "First contact", value: base.firstContact.label, meta: firstChannel },
    { label: "Last contact", value: lc.ts !== null ? ago(lc.ts, tz, nowMs) : "—", meta: lastMeta },
    {
      label: "Conversations",
      value: base.threads,
      meta: base.escalations ? `${base.escalations} needed you` : "none needed you",
    },
    {
      label: "Calls",
      value: base.calls,
      meta: base.calls ? `${Math.max(1, Math.round(base.callSeconds / 60))} min total` : "no calls",
    },
    // Consent is the two asks on the rail, each with how it was given. A fact, an About row and a pill said it
    // again, five times on one profile.
    {
      label: "Receptionist",
      value: TONE_WORD[base.receptionist.tone],
      meta: base.receptionist.tone === "escalated" ? "for you" : receptionistMeta(base.receptionist.label),
    },
    // The deal they are deciding on or took (0004): the stage word, and its line with the service and the amount.
    ...(current ? [{ label: "Deal", value: current.word, meta: current.line, tone: "" as const }] : []),
  ];
  // Their appointments, when the workspace's calendar is connected: the next
  // one is the fact an owner asks for first, and the one the receptionist
  // is given when they call.
  if (profile.visits) {
    const v = profile.visits;
    facts.push({
      label: "Next visit",
      value: v.next ? visitDay(v.next.start, v.timezone, nowMs) : "—",
      // The cell is narrow: the time here, the service in About.
      meta: v.next
        ? `${visitTime(v.next, v.timezone)}${v.next.via === "name" ? " · by name" : ""}`
        : v.state === "ok"
          ? "none booked"
          : "could not be read",
    });
  }
  return facts;
}

/** About rail: the wires, the proposal's host, first contact, channels, where a reply may go, their visits, when they were added. */
export function aboutOf({
  profile,
  tz,
  nowMs,
  base,
  firstChannel,
  reply,
  proposal,
}: PersonCardContext): { k: string; v: string }[] {
  const about: { k: string; v: string }[] = [];
  if (base.phone) about.push({ k: "Phone", v: base.phone });
  if (base.email) about.push({ k: "Email", v: base.email });
  if (proposal) about.push({ k: "Proposal", v: proposal.host });
  if (base.waName) about.push({ k: "WhatsApp name", v: base.waName });
  about.push({
    k: "First contact",
    v:
      base.firstContact.ts !== null
        ? `${base.firstContact.estimate ? "Before " : ""}${clockDateYear(base.firstContact.ts, tz)} · ${firstChannel}`
        : "—",
  });
  about.push({ k: "Channels", v: base.channels.map((c) => PERSON_CHANNEL_WORDS[c]).join(" · ") || "—" });
  if (base.hasChat && reply) {
    const v = repliesWords(REPLY_VIA[reply.via], reply.window);
    if (v) about.push({ k: "Replies", v });
  }
  if (profile.visits) {
    const v = profile.visits;
    const nextLine = v.next
      ? `${visitLine(v.next, v.timezone, nowMs)} · ${visitTitleFor(v.next.title, base.name)}`
      : v.state === "ok"
        ? "Nothing on the calendar"
        : "Calendar could not be read";
    about.push({ k: "Next visit", v: nextLine });
    if (v.last)
      about.push({
        k: "Last visit",
        v: `${visitLine(v.last, v.timezone, nowMs)} · ${visitTitleFor(v.last.title, base.name)}`,
      });
  }
  if (profile.added) {
    const at = ts(profile.added.at);
    about.push({
      k: "Added",
      v: `${at !== null ? clockDateYear(at, tz) : "—"} · ${addedBy(profile.added).how}`,
    });
  } else if (profile.lead) {
    // Found as a lead, with no row saying when they were added: the lead's own day says it.
    const found = ts(profile.lead.found_at);
    about.push({
      k: "Added",
      v: `${found !== null ? clockDateYear(found, tz) : "—"} · ${addedBy({ source: "lead", title: null }).how}`,
    });
  }
  return about;
}

/** "Since Jul 14" / "Since before Aug 27" / "" */
export function sinceWords(base: PersonRowVM): string {
  return base.firstContact.label === "—"
    ? ""
    : base.firstContact.estimate
      ? `Since ${base.firstContact.label.charAt(0).toLowerCase()}${base.firstContact.label.slice(1)}`
      : `Since ${base.firstContact.label}`;
}

/** The row's reply fields made exact by the profile: the wire in words, its window, and the booking link's words for it. */
export function replyFields(reply: PersonReply): Pick<PersonRowVM, "replyVia" | "replyWindow" | "bookingLinkAction"> {
  return {
    replyVia: REPLY_VIA[reply.via],
    replyWindow: reply.window,
    bookingLinkAction: bookingLinkAction(REPLY_VIA[reply.via], reply.window),
  };
}

/**
 * The person's own setting (null = following the workspace) and the workspace's mode, so the rail can say which is
 * in force. 'veto' at the workspace level still answers, after a hold, so it reads as "Answer".
 */
export function receptionistModeOf(d: PersonDetailDto): { person: PersonMode | null; workspace: PersonMode | null } {
  return {
    person: asPersonMode(d.receptionist_mode),
    workspace: d.workspace_reply_mode === "veto" ? "auto" : asPersonMode(d.workspace_reply_mode),
  };
}

/**
 * The People lists that keep themselves current and have them on today, by the rail's own tests (PEOPLE_LISTS): the
 * ones this page does not already say another way, and a calendar's only with a calendar. Each says why it has them,
 * in the rule's own words (listRuleWhy): the facts they meet today.
 */
export function smartListsOf(d: PersonDetailDto, base: PersonRowVM): { id: string; label: string; why: string }[] {
  return PEOPLE_LISTS.filter(
    (l) => l.onProfile !== false && (!l.needsCalendar || d.visits?.state === "ok") && l.test(base),
  ).map((l) => ({ id: l.id, label: l.label, why: listRuleWhy(l.rule, base) }));
}

/** The lead they were found as, with the door to it on Leads; null when they were never one. */
export function leadOf(
  d: PersonDetailDto,
  base: PersonRowVM,
  tz: string,
  nowMs: number,
): { id: string; name: string; found: string; to: string } | null {
  return d.lead
    ? {
        id: d.lead.id,
        name: d.lead.business_name || base.name,
        found: ts(d.lead.found_at) !== null ? clockDate(ts(d.lead.found_at)!, tz, nowMs) : "—",
        to: leadsRoute({ peek: d.lead.id }),
      }
    : null;
}
