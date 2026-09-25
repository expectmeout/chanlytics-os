/**
 * A person's page: the timeline and its filters, what is true right now, the facts, the acts, their own messages, and
 * the whole page's view model (toPersonVM). Moved whole from people.ts (Reach out Part 2.5); exported from index.ts
 * directly, since it reads people.ts's row view model.
 */
import { visitDateKey, visitDay, visitLine, visitTime } from "./calendar-people";
import { tidyCallSummary } from "./call-words";
import { clockDate, clockDateYear, clockDayLabel, clockTime } from "./clock";
import type { ConsentChange } from "./consent";
import {
  amountWords,
  DEAL_ACT_WORDS,
  DEAL_LOST_REASON_WORDS,
  DEAL_STAGE_WORDS,
  dealPaceOf,
  type DealPaceVM,
  type DealVM,
  isDealLostReason,
  proposalLinkOf,
  toDealVM,
} from "./deals";
import { leadsRoute } from "./leads";
import { linkHost } from "./link";
import { listRuleWhy } from "./list-rules";
import { PEOPLE_LISTS } from "./lists";
import {
  ago,
  asPersonMode,
  bookingLinkAction,
  isOwned,
  mayReach,
  PERSON_MODE_WORDS,
  type PersonCampaignVM,
  type PersonDetailDto,
  type PersonMode,
  type PersonProposalVM,
  type PersonRowDto,
  type PersonRowVM,
  proposalAction,
  reasonShort,
  type ReceptionistTone,
  repliesWords,
  toPersonRowVM,
  visitTitleFor,
} from "./people";
import { CONSENT_RESET_SOURCE, consentSourceLabel } from "./person-consent";
import { addedBy, capitalize, mmss, proposalSending, proposalSent, replyChannelOfThreads, ts } from "./person-helpers";
import { personNotesVM, type PersonNoteTeamDto, type PersonNoteVM } from "./person-notes";
import { PERSON_CHANNEL_WORDS, type PersonChannel, REPLY_VIA } from "./person-words";
import { replyWindow } from "./policy";
import { HELD_REASONS, isReplyTo } from "./run-words";
import {
  isIdentifierName,
  messageAt,
  messageAuthor,
  type MessageDto,
  messageText,
  messageWords,
  shortTime,
  writtenChannelOf,
} from "./viewmodels";

/* -------------------------------- profile -------------------------------- */

export type TimelineKind =
  "customer" | "receptionist" | "you" | "system" | "call" | "escalation" | "decision" | "visit" | "consent" | "deal";

/**
 * How a profile's timeline narrows: everything, or one kind of record. "Messages" is the thread itself --
 * what was said, and the escalations and decisions in it; only "All" keeps the system lines.
 */
export type TimelineFilterId = "all" | "messages" | "calls" | "visits" | "consent" | "deals";

export const TIMELINE_FILTERS: readonly {
  id: TimelineFilterId;
  label: string;
  kinds: readonly TimelineKind[] | null;
}[] = [
  { id: "all", label: "All", kinds: null },
  { id: "messages", label: "Messages", kinds: ["customer", "receptionist", "you", "escalation", "decision"] },
  { id: "calls", label: "Calls", kinds: ["call"] },
  { id: "visits", label: "Visits", kinds: ["visit"] },
  { id: "consent", label: "Consent", kinds: ["consent"] },
  { id: "deals", label: "Deals", kinds: ["deal"] },
];

/** The items a filter shows, in the order they came; an unknown filter shows everything. */
export function filterTimeline<T extends { kind: TimelineKind }>(items: readonly T[], id: string): T[] {
  const kinds = TIMELINE_FILTERS.find((f) => f.id === id)?.kinds ?? null;
  return kinds ? items.filter((i) => kinds.includes(i.kind)) : [...items];
}

/**
 * A consent change, in the words the timeline uses: what was answered, and
 * how we know. An answer the customer texted quotes them; one taken at the
 * desk names the way and the recorder's note. The words here are the only
 * ones the page has, so an owner reads "how do we know" without a database.
 */
export function consentChangeWords(c: ConsentChange): { who: string; text: string; sub?: string } {
  // Marketing email is its own answer (00174), and the one thing a person says to it is no: a press of the
  // Unsubscribe link in a campaign email. Texting and WhatsApp are untouched by it.
  if (c.purpose === "email_marketing")
    return {
      who: "Email",
      text: c.consent === "opted_out" ? "Unsubscribed from your emails" : "Marketing email: back to not asked",
      ...(c.source === "unsubscribe" ? { sub: "Pressed Unsubscribe in an email" } : {}),
    };
  const offers = c.purpose === "marketing";
  const text =
    c.consent === "opted_in"
      ? offers
        ? "Said yes to offers and news"
        : "Said yes to messages about their visit"
      : c.consent === "opted_out"
        ? offers
          ? "Said no to offers"
          : "Said stop — nothing goes out to them"
        : offers
          ? "Offers: back to not asked"
          : "Back to not asked";
  let sub: string | undefined;
  if (c.source === "customer_message") {
    const where =
      c.channel === "sms"
        ? "by text"
        : c.channel === "whatsapp"
          ? "on WhatsApp"
          : c.channel === "email"
            ? "by email"
            : "in their own message";
    sub = `In their own words ${where}${c.words ? `: “${c.words}”` : ""}`;
  } else if (c.source === CONSENT_RESET_SOURCE || !c.source) {
    sub = "Reset by staff";
  } else {
    sub = `${consentSourceLabel(c.source) ?? c.source}, recorded by staff${c.note ? ` · ${c.note}` : ""}`;
  }
  return { who: offers ? "Offers" : "Consent", text, sub };
}

export interface PersonTimelineItemVM {
  id: string;
  ts: number;
  time: string;
  day: string;
  kind: TimelineKind;
  who: string;
  text: string;
  sub?: string;
  link?: { label: string; to: string };
  /** A visit that has not ended yet: the page says it under Coming up (comingUp), not in what has happened. */
  ahead?: boolean;
}

/**
 * A visit that has not ended, as the page's Coming up draws it: a small leaf with the month and the day of the month,
 * what it is, and when. `day` is "Today", "Tomorrow" or the weekday, by the business's clock.
 */
export interface PersonVisitAheadVM {
  id: string;
  month: string;
  date: string;
  day: string;
  title: string;
  time: string;
  /** Matched to them by their name alone, which the page says, as the Next visit fact does. */
  byName: boolean;
  to: string;
}

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

export interface PersonVM extends PersonRowVM {
  /** "Since Jul 14" / "Since before Aug 27" / "" */
  since: string;
  /** "3 conversations · 2 calls" */
  metaLine: string;
  lastExchange: {
    customer: { text: string; at: string } | null;
    reply: { text: string; at: string; who: "Receptionist" | "You" } | null;
  };
  facts: PersonFact[];
  rightNow: PersonRightNow;
  timeline: PersonTimelineItemVM[];
  /** Their visits that have not ended, soonest first: the page's Coming up. Each is in `timeline` too, marked `ahead`. */
  comingUp: PersonVisitAheadVM[];
  about: { k: string; v: string }[];
  /** Their notes (0007): the receptionist's suggestions first, then newest first. */
  noteList: PersonNoteVM[];
  /** The team a note can be for; empty where the team could not be read. */
  noteTeam: PersonNoteTeamDto[];
  /** The workspace's booking link, or null when none is on file. */
  bookingLink: string | null;
  /**
   * Their proposal (proposalLinkOf, 0008): the link on their deal while it is a proposal out; for any other deal, none;
   * with no deal at all, the one on the person (00154) while it is still read. Null where deals are off, and when none
   * is on file.
   */
  proposal: PersonProposalVM | null;
  /** The send-the-proposal button's words for the wire a reply goes out on (proposalAction); `ready` false hides it. */
  proposalAction: { label: string; title: string; ready: boolean };
  /** Their deals, newest first, as the page says them (0004). */
  deals: DealVM[];
  /** Whether deals are on here (dealsAreOn): the page draws its Deal section, and offers the proposal's send, only then. */
  dealsOn: boolean;
  /** The workspace's pace (dealPaceOf): when their proposal waits, and what its card says; none until five are decided. */
  dealPace: DealPaceVM | null;
  /** The profile's service names; the picker appears only past one. */
  services: string[];
  /** The services that need a consultation first: a proposal started from one names it (deal-sheet.ts). */
  consultFirst: string[];
  /** "inbox/th-…" or null for a phone-only person. */
  openThread: string | null;
  /** The person's own setting (null = following the workspace) and the
   *  workspace's mode, so the rail can say which is in force. 'veto' at the
   *  workspace level still answers, after a hold, so it reads as "Answer". */
  receptionistMode: { person: PersonMode | null; workspace: PersonMode | null };
  /** What they have written to you, newest first: the messages an answer "in their own message" may name (00137). */
  ownMessages: OwnMessageVM[];
  /**
   * The People lists that keep themselves current and have them on today, by the rail's own tests (PEOPLE_LISTS): the
   * ones this page does not already say another way, and a calendar's only with a calendar. Each says why it has them,
   * in the rule's own words (listRuleWhy): the facts they meet today.
   */
  smartLists: { id: string; label: string; why: string }[];
  /** The runs that named them, newest first, each with what became of it. */
  campaigns: PersonCampaignVM[];
  /** The lead they were found as, with the door to it on Leads; null when they were never one. */
  lead: { id: string; name: string; found: string; to: string } | null;
  /** What the page's More menu offers for them, in order (personActs): the page keeps those its reader's role allows. */
  acts: PersonActVM[];
}

/**
 * One act in a person's More menu: a few words, the line said on hover where the act needs explaining, the group it
 * sits in (a send, a way to reach them, the delete: a line between groups), and who may press it ("any" reader, one
 * who may "record", or the "owner"). The page draws them; which exist, and their words, are here.
 */
export interface PersonActVM {
  id: "booking" | "proposal" | "call" | "copy-phone" | "copy-email" | "delete";
  label: string;
  hint: string | null;
  group: "send" | "reach" | "delete";
  needs: "any" | "record" | "owner";
  danger?: boolean;
}

/**
 * What can be done for a person from their page, besides opening their thread (the page's one primary act).
 *
 * A send opens their thread with the words ready; nothing is sent from the page. So it says so, in the wire it goes
 * on, and never names a template or a window: where WhatsApp takes only an approved message the thread offers it,
 * which is what its hover says. The labels are a few words each: with a sentence beside every one the menu was a
 * block of wrapped words cut off at its edge. No send reaches someone who said stop or is on do-not-contact, and no call reaches
 * someone on do-not-contact. A call is the member's own phone ringing them (a tel: link), never the receptionist.
 */
export function personActs(p: Omit<PersonVM, "acts">): PersonActVM[] {
  const acts: PersonActVM[] = [];
  const reach = mayReach(p);
  const on =
    p.replyVia === "Email" ? " by email" : p.replyVia === "Text" ? " as a text" : p.replyVia ? " on WhatsApp" : "";
  const ready = `Opens their thread with it ready to send${on}`;
  if (reach && p.bookingLink)
    acts.push({
      id: "booking",
      label: "Send booking link",
      hint: p.bookingLinkAction.ready
        ? ready
        : "Only an approved message reaches them until they write again; their thread offers the one with the link",
      group: "send",
      needs: "record",
    });
  // A proposal is a deal's (0008): a workspace whose customers book is never offered one to send. Its first send is
  // the deal card's next act (deal-sheet.ts dealNextAct), and no send is offered while one is on its way, so the menu
  // offers only a send the card does not: the link again once it went, or a link left on someone with no deal.
  const cardSends = p.deal?.stage === "proposed" && (!p.proposal?.sent || !!p.deal.proposal?.sending);
  if (reach && p.dealsOn && p.proposal && p.proposalAction.ready && !cardSends)
    acts.push({
      id: "proposal",
      label: p.proposal.sent ? `${DEAL_ACT_WORDS.send} again` : DEAL_ACT_WORDS.send,
      hint: ready,
      group: "send",
      needs: "record",
    });
  if (p.phone && !p.consent.dnc) {
    acts.push({ id: "call", label: "Call", hint: "From your own phone", group: "reach", needs: "any" });
    acts.push({ id: "copy-phone", label: "Copy number", hint: null, group: "reach", needs: "any" });
  }
  if (p.email) acts.push({ id: "copy-email", label: "Copy email", hint: null, group: "reach", needs: "any" });
  acts.push({ id: "delete", label: "Delete person…", hint: null, group: "delete", needs: "owner", danger: true });
  return acts;
}

/** One message a person wrote to the business, as the desk chooses it for an answer given in it. */
export interface OwnMessageVM {
  /** The message's own id: what the door is handed, and what the evidence names. */
  id: string;
  /** What they wrote, on one line: the eighty characters the evidence keeps, and an ellipsis when there were more. */
  words: string;
  /** The wire it came on, in the page's word for it. */
  via: string;
  /** When they sent it, by the business's clock. */
  when: string;
}

/** How many of a person's messages their page offers to choose from: the recent ones. */
const OWN_MESSAGE_CHOICES = 10;

/** How much of their words the evidence keeps (00110, 00137). */
const EVIDENCE_WORDS = 80;

/**
 * What a person wrote to you, newest first, judged the way the door judges it
 * (00137): an inbound message from the customer on a written wire, with words
 * in it -- its text, or a photo's caption. So nothing offered here is one the
 * door refuses. The words are said on one line and cut where the evidence
 * cuts them, so the owner chooses what will be kept.
 */
function ownMessagesOf(d: PersonDetailDto, stamp: (t: number) => { time: string; day: string }): OwnMessageVM[] {
  const found: { t: number; vm: OwnMessageVM }[] = [];
  for (const c of d.conversations) {
    for (const m of c.messages) {
      if (m.direction !== "inbound" || m.sender !== "customer" || m.channel === "voice" || m.channel === "system")
        continue;
      const said = [m.body, m.media?.caption].map((s) => (s ?? "").replace(/\s+/g, " ").trim()).find(Boolean);
      const t = ts(messageAt(m));
      if (!said || t === null) continue;
      const chars = Array.from(said);
      const at = stamp(t);
      found.push({
        t,
        vm: {
          id: m.id,
          words: chars.length > EVIDENCE_WORDS ? `${chars.slice(0, EVIDENCE_WORDS).join("")}…` : said,
          via: PERSON_CHANNEL_WORDS[m.channel as PersonChannel] ?? "",
          when: `${at.day}, ${at.time}`,
        },
      });
    }
  }
  return found
    .sort((a, b) => b.t - a.t)
    .slice(0, OWN_MESSAGE_CHOICES)
    .map((f) => f.vm);
}

const DECISION_LABELS: Record<string, { who: string; text: string }> = {
  take_over: { who: "Took over", text: "You paused the receptionist on this thread" },
  hand_back: { who: "Handed back", text: "You returned the thread to the receptionist" },
  snooze: { who: "Snoozed", text: "You snoozed the thread" },
  wake: { who: "Woke", text: "You brought the thread back" },
  resolve: { who: "Resolved", text: "You marked the escalation resolved" },
  archive: { who: "Archived", text: "You archived the thread" },
  cancel_send: { who: "Canceled a reply", text: "You stopped a reply before it sent" },
  pause_agent: { who: "Paused the receptionist", text: "You paused automatic replies" },
  resume_agent: { who: "Resumed the receptionist", text: "You resumed automatic replies" },
};

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function toPersonVM(
  d: PersonDetailDto,
  tz: string,
  now = new Date(),
  /** The member looking (toPersonRowVM's viewer). */
  viewerId: string | null = null,
): PersonVM {
  const nowMs = now.getTime();
  // The profile fetched this person's rows in full, so the arrays are the
  // ground truth here and the list row is the summary. Where they disagree
  // (a fresh escalation between the two reads) the arrays win, and every
  // count on the page agrees with the timeline beneath it.
  const openEsc = d.escalations
    .filter((e) => e.state === "open")
    .sort((a, b) => (ts(b.created_at) ?? 0) - (ts(a.created_at) ?? 0))[0];
  const row: PersonRowDto = {
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
  const base = toPersonRowVM(row, tz, now, viewerId);
  // Whether deals are on here (dealsAreOn, 0008): where they are off, nothing on the page says a deal -- no fact, no
  // timeline line, no proposal -- whatever the database holds.
  const dealsOn = !!d.deals_on;
  // Their deals as the page lists them (0004): each row through the one view model the People row uses, and each
  // proposal's link with whether it went (0008), read from the thread's own messages as the person's proposal is: the
  // deal card says it for every proposal out, not only the one the page's head acts on.
  const deals = dealsOn
    ? (d.deals ?? [])
        .map((x) => toDealVM(x, tz, nowMs))
        .filter((x): x is DealVM => !!x)
        .map((x) => {
          if (!x.proposal) return x;
          const url = x.proposal.url;
          const sent = proposalSent(d.conversations, url);
          return { ...x, proposal: { ...x.proposal, sent, sending: proposalSending(d.conversations, url) } };
        })
    : [];
  // The row's columns say WHICH deal shows (people_list's lateral join, pickCurrentDeal's rule); the listed copy of it
  // carries the version a move is checked against, which the columns do not.
  const current = dealsOn ? (deals.find((x) => x.id === base.deal?.id) ?? base.deal) : null;
  // A person we know only by number or address has no first name to shorten
  // to: "+1" as a speaker label is nobody. Keep the whole identifier.
  const first = isIdentifierName(base.name) ? base.name : base.name.split(" ")[0] || base.name;
  const stamp = (t: number) => ({ time: clockTime(t, tz), day: clockDayLabel(t, tz, nowMs) });
  const items: PersonTimelineItemVM[] = [];
  const convIds = new Set(d.conversations.map((c) => c.id));
  const runOf = new Map((d.campaigns ?? []).filter((c) => c.message_id).map((c) => [c.message_id!, c]));

  for (const c of d.conversations) {
    for (const m of c.messages) {
      if (m.type === "call_summary") continue; // the call carries its own item
      if (m.status === "canceled") continue; // never reached them
      const t = ts(messageAt(m));
      if (t === null) continue;
      const kind: TimelineKind =
        m.sender === "customer"
          ? "customer"
          : m.sender === "human"
            ? "you"
            : m.sender === "ai"
              ? "receptionist"
              : "system";
      // Who sent it, in the words the Inbox uses (messageAuthor): a person's reply is the team's, since the row does
      // not say which member sent it, and a run's message is its playbook's or its broadcast's. Every one of ours read
      // "You", a playbook's run among them.
      // A message a run sent is the run's, by its meta or by the recipient row that names it (broadcast_recipients
      // message_id): a run's row is the ledger of what it sent, whatever the message kept.
      const run = runOf.get(m.id);
      const author = messageAuthor(
        run && m.meta?.source !== "broadcast"
          ? {
              ...m,
              meta: {
                ...m.meta,
                source: "broadcast",
                broadcast_name: run.name,
                ...(run.playbook_id ? { playbook_name: run.playbook_name || run.name } : {}),
              },
            }
          : m,
      );
      const who =
        kind === "customer"
          ? first
          : !author
            ? "System"
            : author.kind === "receptionist"
              ? "Receptionist"
              : author.kind === "team"
                ? "Your team"
                : capitalize(author.words);
      const sub = m.status === "failed" ? "Not delivered" : m.status === "queued" ? "Sending" : undefined;
      items.push({
        id: `m-${m.id}`,
        ts: t,
        ...stamp(t),
        kind,
        who,
        text: messageWords(m),
        ...(sub ? { sub } : {}),
        link: { label: "Open the thread", to: `inbox/th-${c.id}` },
      });
    }
  }

  for (const k of d.calls) {
    const t = ts(k.started_at);
    if (t === null) continue;
    const dur = mmss(k.duration_ms);
    const wanted = (k.wanted || "").trim();
    const summary = tidyCallSummary(k.summary) ?? "";
    const missed = k.status === "not_connected";
    const sentence = missed
      ? "The call never connected."
      : wanted ||
        (summary
          ? (summary.split(/(?<=[.!?])\s/)[0] ?? summary)
          : k.in_voicemail
            ? "Reached voicemail."
            : "No summary from this call.");
    items.push({
      id: `k-${k.id}`,
      ts: t,
      ...stamp(t),
      kind: "call",
      who: missed
        ? "Missed call"
        : `${k.direction === "inbound" ? "Inbound" : "Outbound"} call${dur ? ` · ${dur}` : ""}`,
      text: sentence,
      sub: missed
        ? "Never connected"
        : k.recording?.fetch_state === "stored"
          ? "Recording and transcript in Conversations"
          : "Transcript in Conversations",
      link: { label: "Open", to: `conversations/cv-${k.id}` },
    });
  }

  for (const e of d.escalations) {
    const t = ts(e.created_at);
    if (t === null) continue;
    items.push({
      id: `e-${e.id}`,
      ts: t,
      ...stamp(t),
      kind: "escalation",
      who: "Escalated",
      text: capitalize(reasonShort(e.reason)) || "The receptionist stopped",
      // "Open" beside a row that opens something read as the verb; the state is what it says.
      sub: e.state === "resolved" ? "Resolved" : "Still open",
      link: { label: "Open the thread", to: `inbox/th-${e.conversation_id}` },
    });
  }

  for (const dec of d.decisions) {
    const label = DECISION_LABELS[dec.verb];
    if (!label) continue;
    const mine =
      (dec.subject_type === "conversation" && convIds.has(dec.subject_id)) ||
      (dec.subject_type === "contact" && dec.subject_id === row.id);
    if (!mine) continue;
    const t = ts(dec.created_at);
    if (t === null) continue;
    items.push({ id: `d-${dec.id}`, ts: t, ...stamp(t), kind: "decision", who: label.who, text: label.text });
  }

  // Every change to either answer, from the ledger: the evidence, on the
  // same line as what was said. The decisions ledger has no label for these
  // (DECISION_LABELS), so nothing is said twice.
  for (const c of d.consent_history ?? []) {
    const t = ts(c.at);
    if (t === null) continue;
    const w = consentChangeWords(c);
    items.push({
      id: `c-${c.id}`,
      ts: t,
      ...stamp(t),
      kind: "consent",
      who: w.who,
      text: w.text,
      ...(w.sub ? { sub: w.sub } : {}),
    });
  }

  // Their visits, from the calendar: what happened in the chair belongs on
  // the same line as what was said. A visit ahead reads as booked.
  const comingUp: { t: number; vm: PersonVisitAheadVM }[] = [];
  if (d.visits?.all?.length) {
    const tz = d.visits.timezone;
    for (const v of d.visits.all) {
      const t = Date.parse(v.start);
      if (!Number.isFinite(t)) continue;
      const ahead = Date.parse(v.end) >= nowMs;
      if (ahead) {
        const on = visitDay(t, tz, nowMs);
        comingUp.push({
          t,
          vm: {
            id: `v-${v.id}`,
            month: new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "short" }).format(new Date(t)),
            date: new Intl.DateTimeFormat("en-US", { timeZone: tz, day: "numeric" }).format(new Date(t)),
            day:
              on === "Today" || on === "Tomorrow"
                ? on
                : new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(new Date(t)),
            title: visitTitleFor(v.title, base.name),
            time: visitTime(v, tz),
            byName: v.via === "name",
            to: `calendar/${visitDateKey(v.start, tz)}`,
          },
        });
      }
      items.push({
        ...(ahead ? { ahead: true } : {}),
        id: `v-${v.id}`,
        ts: t,
        ...stamp(t),
        kind: "visit",
        who: "Calendar",
        text: `${ahead ? "Booked" : "Visited"} · ${visitTitleFor(v.title, base.name)}`,
        sub: `${visitTime(v, tz)} · from ${d.visits.source}${v.via === "name" ? " · matched by name" : ""}`,
        link: { label: "Open the day", to: `calendar/${visitDateKey(v.start, tz)}` },
      });
    }
  }
  // Each move of a deal, on the same line as what was said: what a person recorded, when (0004). The amount is the
  // proposal's value until they say yes, and then the client's, so it is said on the line it belongs to (0008); a pass
  // says why.
  for (const x of dealsOn ? (d.deals ?? []) : []) {
    const svc = x.service ? ` · ${x.service}` : "";
    const put = (id: string, at: string | null, text: string) => {
      const t = ts(at);
      if (t === null) return;
      items.push({ id, ts: t, ...stamp(t), kind: "deal", who: "You", text });
    };
    const value = amountWords(x.amount_cents, x.per, x.currency);
    const client = x.stage === "won" || x.stage === "ended";
    put(`dl-${x.id}-p`, x.proposed_at, `${DEAL_STAGE_WORDS.proposed}${svc}${value && !client ? ` · ${value}` : ""}`);
    if (client) put(`dl-${x.id}-w`, x.decided_at, `Became a client${svc}${value ? ` · ${value}` : ""}`);
    const why = isDealLostReason(x.lost_reason) ? ` · ${DEAL_LOST_REASON_WORDS[x.lost_reason]}` : "";
    if (x.stage === "lost") put(`dl-${x.id}-l`, x.decided_at, `Passed${svc}${why}`);
    if (x.stage === "ended") put(`dl-${x.id}-e`, x.ended_at, `Ended${svc}`);
  }
  if (d.added) {
    const t = ts(d.added.at);
    const by = addedBy(d.added);
    if (t !== null)
      items.push({ id: "added", ts: t, ...stamp(t), kind: "system", who: by.who, text: `Added ${by.how}` });
  }

  items.sort((a, b) => b.ts - a.ts);

  // Last exchange: the customer's last line and the last reply, verbatim.
  const latestConv = [...d.conversations].sort(
    (a, b) => (ts(b.last_message_at) ?? 0) - (ts(a.last_message_at) ?? 0),
  )[0];
  let customer: PersonVM["lastExchange"]["customer"] = null;
  let reply: PersonVM["lastExchange"]["reply"] = null;
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

  // Right now: what the receptionist is doing for this person. The card names the receptionist and wears the
  // standing's own word as a pill (tone.ts, the word the People row wears), so `detail` is one sentence: the
  // reason and what happens next -- never the receptionist's name again, never the state a second time. Ask
  // reads `title` and `detail` together (server/ask/tools.ts), so the title keeps the state for it.
  const threadTo = row.latest_conversation_id ? `inbox/th-${row.latest_conversation_id}` : null;
  // One door, one label: the header's "Open thread" and this card's "Open in Inbox" went to the same thread.
  const openThread = threadTo ? { label: "Open the thread", to: threadTo } : null;
  const r = row;
  let rightNow: PersonRightNow;
  // A thread a person owns is theirs, whatever flagged it: receptionistOf's
  // order, so this card and the Receptionist fact cannot disagree. It asked
  // needs_human first, and an owner who had just answered an email -- a reply
  // claims the thread, and its state stays needs_human until handed back --
  // read "Needs you · Stopped, and nobody has taken the thread yet".
  if (isOwned(r, nowMs)) {
    rightNow = {
      tone: "paused",
      title: "Paused, a person owns this thread",
      detail: "A person owns this thread; automatic replies resume when it is handed back.",
      cta: openThread,
    };
  } else if (r.open_escalation_reason) {
    const since = r.open_escalation_since ? shortTime(r.open_escalation_since, tz, now) : null;
    rightNow = {
      tone: "escalated",
      title: `Escalated · ${reasonShort(r.open_escalation_reason)}`,
      detail: `${capitalize(reasonShort(r.open_escalation_reason))}${since ? ` · since ${since}` : ""}. Paused until someone answers.`,
      cta: openThread,
    };
  } else if (r.needs_human) {
    rightNow = {
      tone: "escalated",
      title: "Waiting for a person",
      detail: "Stopped, and nobody has taken the thread yet.",
      cta: openThread,
    };
  } else if (r.queued_reply_at) {
    const q = ts(r.queued_reply_at);
    rightNow = {
      tone: "queued",
      title: "Reply sending",
      detail: `A reply is queued${q !== null ? `, ${ago(q, tz, nowMs)}` : ""} — it can still be stopped from the Inbox.`,
      cta: openThread,
    };
  } else if (base.receptionist.tone === "snoozed") {
    rightNow = {
      tone: "snoozed",
      title: "Snoozed",
      detail: `Wakes ${shortTime(r.latest_snooze_until ?? null, tz, now)}.`,
      cta: openThread,
    };
  } else if (base.consent.state === "opted_out") {
    // The consent ask on the rail carries the date and the words; here, only what it means for the thread.
    rightNow = {
      tone: "silent",
      title: "Silent, they opted out",
      detail: "They said stop — nothing goes out to them until they ask again.",
      cta: null,
    };
  } else if (
    ["never", "ask"].includes(d.receptionist_mode ?? "") ||
    ["never", "ask"].includes(d.workspace_reply_mode ?? "")
  ) {
    // "Answering" sat two inches from "Receptionist for Dani: Never".
    const theirs = ["never", "ask"].includes(d.receptionist_mode ?? "");
    const mode = theirs ? d.receptionist_mode : d.workspace_reply_mode;
    const word = PERSON_MODE_WORDS[mode === "never" ? "never" : "ask"];
    rightNow = {
      tone: "paused",
      title: `Held for you, set to ${word}`,
      detail: theirs
        ? `Set to ${word} for them — their messages come straight to you.`
        : `Set to ${word} for the workspace — every message waits for a person.`,
      cta: openThread,
    };
  } else {
    rightNow = {
      tone: "answering",
      title: "Answering",
      detail: "New messages are answered automatically.",
      cta: base.threadId ? { label: "Open the thread", to: `inbox/${base.threadId}` } : null,
    };
  }

  // Facts strip.
  const firstIsCall = d.calls.some((k) => k.started_at && ts(k.started_at) === base.firstContact.ts);
  // The wire the first contact actually came on. It was two-valued -- a call,
  // else "WhatsApp" -- so a person whose first word was an email was introduced
  // as having arrived on WhatsApp. The profile has every message; it asks them.
  const firstWritten = d.conversations
    .flatMap((c) => c.messages)
    .filter((m) => m.type !== "call_summary")
    .map((m) => ({ at: Date.parse(m.channel_ts ?? m.created_at), channel: m.channel }))
    .filter((m) => Number.isFinite(m.at))
    .sort((a, b) => a.at - b.at)[0];
  const firstChannel = base.firstContact.estimate
    ? "imported history"
    : firstIsCall || !base.hasChat
      ? "Phone"
      : firstWritten
        ? REPLY_VIA[writtenChannelOf(firstWritten.channel)]
        : "WhatsApp";
  // Where a reply goes, exactly: the profile knows their last written words, the
  // row only which wires they have used (replyChannelOfRow says why it reads the
  // strictest window when it cannot tell).
  const via =
    replyChannelOfThreads(d.conversations) ?? (base.replyVia === "Email" ? "email" : base.replyVia ? "whatsapp" : null);
  const exactWindow = via ? replyWindow(via, r.latest_wa_inbound_at, now) : null;
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
  // "Held for you" is the word the People row puts beside the state, for a thread a person owns or a mode that holds.
  const toneWord: Record<ReceptionistTone, string> = {
    answering: "Answering",
    escalated: "Waiting",
    queued: "Queued",
    snoozed: "Snoozed",
    paused: "Held for you",
    silent: "Silent",
  };
  // Under the word, what the label says after it ("set to Never", "a person owns the thread"), not the label again.
  const receptionistMeta = (label: string) =>
    label.includes(", ") ? label.slice(label.indexOf(", ") + 2) : label.toLowerCase();
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
      value: toneWord[base.receptionist.tone],
      meta: base.receptionist.tone === "escalated" ? "for you" : receptionistMeta(base.receptionist.label),
    },
    // The deal they are deciding on or took (0004): the stage word, and its line with the service and the amount.
    ...(current ? [{ label: "Deal", value: current.word, meta: current.line, tone: "" as const }] : []),
  ];

  // Their proposal (proposalLinkOf, 0008): the link on the deal they are deciding on while it is a proposal out, none
  // for any other deal, the person's own only with no deal at all; nothing where deals are off. Its host for the row,
  // and whether it went out.
  const proposalUrl = dealsOn ? proposalLinkOf(current, d.proposal_url) : null;
  const proposal: PersonProposalVM | null = proposalUrl
    ? { url: proposalUrl, host: linkHost(proposalUrl), sent: proposalSent(d.conversations, proposalUrl) }
    : null;
  const sentAt = proposal?.sent ? ts(proposal.sent.at) : null;
  const sentWords =
    proposal?.sent && sentAt !== null
      ? `${clockDateYear(sentAt, tz)}${proposal.sent.via ? ` · ${proposal.sent.via}` : ""}`
      : null;

  // About rail.
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
  if (base.hasChat && via && exactWindow) {
    const hours = exactWindow.closesAtIso
      ? Math.max(0, Math.round((new Date(exactWindow.closesAtIso).getTime() - nowMs) / 3_600_000))
      : 0;
    const v = repliesWords(REPLY_VIA[via], { open: exactWindow.open, hoursLeft: hours });
    if (v) about.push({ k: "Replies", v });
  }

  // Their appointments, when the workspace's calendar is connected: the next
  // one is the fact an owner asks for first, and the one the receptionist
  // is given when they call.
  if (d.visits) {
    const v = d.visits;
    const nextLine = v.next
      ? `${visitLine(v.next, v.timezone, nowMs)} · ${visitTitleFor(v.next.title, base.name)}`
      : v.state === "ok"
        ? "Nothing on the calendar"
        : "Calendar could not be read";
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
    about.push({ k: "Next visit", v: nextLine });
    if (v.last)
      about.push({
        k: "Last visit",
        v: `${visitLine(v.last, v.timezone, nowMs)} · ${visitTitleFor(v.last.title, base.name)}`,
      });
  }
  if (d.added) {
    const at = ts(d.added.at);
    about.push({
      k: "Added",
      v: `${at !== null ? clockDateYear(at, tz) : "—"} · ${addedBy(d.added).how}`,
    });
  } else if (d.lead) {
    // Found as a lead, with no row saying when they were added: the lead's own day says it.
    const found = ts(d.lead.found_at);
    about.push({
      k: "Added",
      v: `${found !== null ? clockDateYear(found, tz) : "—"} · ${addedBy({ source: "lead", title: null }).how}`,
    });
  }

  const vm: Omit<PersonVM, "proposal" | "proposalAction" | "acts"> = {
    ...base,
    ...(via && exactWindow
      ? (() => {
          const win = {
            open: exactWindow.open,
            hoursLeft: exactWindow.closesAtIso
              ? Math.max(0, Math.round((new Date(exactWindow.closesAtIso).getTime() - nowMs) / 3_600_000))
              : 0,
          };
          return {
            replyVia: REPLY_VIA[via],
            replyWindow: win,
            bookingLinkAction: bookingLinkAction(REPLY_VIA[via], win),
          };
        })()
      : {}),
    since:
      base.firstContact.label === "—"
        ? ""
        : base.firstContact.estimate
          ? `Since ${base.firstContact.label.charAt(0).toLowerCase()}${base.firstContact.label.slice(1)}`
          : `Since ${base.firstContact.label}`,
    metaLine: `${plural(base.threads, "conversation")} · ${plural(base.calls, "call")}`,
    lastExchange: { customer, reply },
    facts,
    rightNow,
    timeline: items,
    comingUp: comingUp.sort((a, b) => a.t - b.t).map((c) => c.vm),
    about,
    noteList: personNotesVM(d.person_notes, tz, nowMs),
    noteTeam: d.note_team ?? [],
    bookingLink: d.booking_link?.trim() || null,
    openThread: base.threadId ? `inbox/${base.threadId}` : null,
    receptionistMode: {
      person: asPersonMode(d.receptionist_mode),
      workspace: d.workspace_reply_mode === "veto" ? "auto" : asPersonMode(d.workspace_reply_mode),
    },
    ownMessages: ownMessagesOf(d, stamp),
    smartLists: PEOPLE_LISTS.filter(
      (l) => l.onProfile !== false && (!l.needsCalendar || d.visits?.state === "ok") && l.test(base),
    ).map((l) => ({ id: l.id, label: l.label, why: listRuleWhy(l.rule, base) })),
    campaigns: campaignsOf(d, tz, nowMs),
    lead: d.lead
      ? {
          id: d.lead.id,
          name: d.lead.business_name || base.name,
          found: ts(d.lead.found_at) !== null ? clockDate(ts(d.lead.found_at)!, tz, nowMs) : "—",
          to: leadsRoute({ peek: d.lead.id }),
        }
      : null,
    deal: current,
    deals,
    dealsOn,
    dealPace: dealsOn ? dealPaceOf(d.deal_pace) : null,
    services: d.services ?? [],
    consultFirst: d.consult_first ?? [],
  };
  // The send's words follow the wire the page has settled on, exact window included.
  const whole = {
    ...vm,
    proposal,
    proposalAction: proposalAction(vm.replyVia ?? null, vm.replyWindow ?? null, sentWords),
  };
  return { ...whole, acts: personActs(whole) };
}

/**
 * The runs that named a person, newest first, each with what became of it: sent, and answered by the run report's own
 * rule (isReplyTo) in the thread the message went to; held back, in the owner's words for why (HELD_REASONS); or not
 * sent. A person's page said nothing about what a playbook or a broadcast had sent them.
 */
function campaignsOf(d: PersonDetailDto, tz: string, nowMs: number): PersonCampaignVM[] {
  const threadOf = new Map<string, string>();
  const repliesIn = new Map<string, string[]>();
  for (const c of d.conversations) {
    for (const m of c.messages) {
      threadOf.set(m.id, c.id);
      if (m.direction === "inbound") repliesIn.set(c.id, [...(repliesIn.get(c.id) ?? []), m.created_at]);
    }
  }
  return (d.campaigns ?? []).map((c) => {
    const at = ts(c.sent_at ?? c.scheduled_for);
    const thread = c.message_id ? threadOf.get(c.message_id) : undefined;
    const sentAt = c.sent_at;
    const replied =
      c.state === "sent" && !!sentAt && !!thread && (repliesIn.get(thread) ?? []).some((x) => isReplyTo(sentAt, x));
    const why = c.reason ? HELD_REASONS[c.reason] : undefined;
    const outcome =
      c.state === "sent"
        ? replied
          ? "Replied"
          : "Sent"
        : c.state === "skipped"
          ? `Held — ${why ?? "held back"}`
          : c.state === "failed"
            ? why
              ? `Didn't send — ${why}`
              : "Didn't send"
            : "Waiting to send";
    return {
      id: c.broadcast_id,
      kind: c.playbook_id ? "playbook" : "broadcast",
      title: c.playbook_id ? c.playbook_name || c.name : c.name,
      when: at !== null ? clockDate(at, tz, nowMs) : "—",
      outcome,
      line: `${c.playbook_id ? "Playbook" : "Broadcast"} · ${outcome}`,
      tone: replied ? "ok" : c.state === "skipped" || c.state === "failed" ? "warn" : "plain",
      to: `broadcasts/run:${c.broadcast_id}`,
    };
  });
}
