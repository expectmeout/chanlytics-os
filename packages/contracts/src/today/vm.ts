/**
 * Today's view model: the shape of the brief (`TodayVM`) and of each row and figure in it. Types only; the brief
 * that builds it is today/brief.ts, over the facts (today/facts.ts) and the bands, rows and queue beside them.
 */
import type { CallDto } from "../conversations/call-dto";
import type { EscalationDto, HoldAct } from "../conversations/escalations";
import type { ConversationDto } from "../conversations/thread-dto";
import type { AppointmentWord } from "../journey/appointment-word";
import type { LeadSearchDto } from "../leads/leads";
import type { PreviewTriedDto } from "../previews/tried";
import type { VisitWord } from "../shared/enums";
import type { WaitingRun } from "../waits/waits";
import type { MetricsSummaryDto } from "./metrics";
import type { TodaySinceAnsweredDto } from "./away";
import type { TodayBackVM } from "./day/zone";

export interface TodayNeedsRowVM {
  id: string;
  conversationId: string;
  /** The hold it is, where it is one; null for a thread the rule says waits with none open (today/facts.ts OwedThread). */
  escalationId: string | null;
  who: string;
  reason: string;
  waited: string;
  warn: boolean;
  quote: string;
  meta: string;
  windowNote: string | null;
  to: string;
}

export interface TodayCallRowVM {
  id: string;
  who: string;
  at: string;
  duration: string;
  note: string;
  to: string;
}

export interface TodayFactVM {
  label: string;
  value: string;
  hint?: string;
}

export interface TodaySentenceVM {
  text: string;
  /** The day's traffic, which the recap's one line already says. The page prints the line and skips these; Ask still
   *  reads every sentence. */
  traffic?: true;
  /** True for the one line that must never read as calm: a reply that
   *  failed to deliver. */
  warn?: boolean;
  /** The record the sentence is about, when the read holds it: the thread of the newest reply that failed. */
  to?: string;
}

/**
 * One row of the queue on Today, in the strip's grammar (people.ts
 * attentionRow): who, where and when, one sentence, one state line, one
 * verb — and, where the state asks a second thing of you, a second.
 */
export interface TodayQueueRowVM {
  id: string;
  /**
   * `reply`: a reply to a reach-out, read (Reach out Part 5), in place of its thread's handoff (withReplies). `step`: a
   * person's next step come due (0007), and `steps` the one row for the rest, to People's Steps due (withSteps): both are
   * the team's own to-do and nobody waiting on a person, so neither is a person row (isPersonRow). `visit`: a visit of
   * yesterday's nobody has marked, asking "Did they come?" with Kept and Missed, and `visits` the one row for the rest, to
   * the Calendar on yesterday (withVisitsAsked, 0047): the team's to-do as a step is, and no person waiting either.
   */
  kind:
    | "handoff"
    | "callback"
    | "window"
    | "call"
    | "search"
    | "reply"
    | "step"
    | "steps"
    | "visit"
    | "visits"
    | "held"
    // A lead who tried their own receptionist (decision 0079): the team's to-do, a business and no person waiting.
    | "tried";
  /** The thread this row is about; null for a call with no thread. The away card drops a bell row about the same thread. */
  conversationId: string | null;
  /** The call this row is about: a call-back's newest call, a call worth a listen; null otherwise. */
  callId: string | null;
  /**
   * The person the row names, by their People id, where the row knows them: a thread's person, a caller on record, a
   * step's or a visit's person. The page trails their name with the business they work at, from People's rows (0052).
   * Null for a search, a count, and a caller with no record.
   */
  person_id: string | null;
  who: string;
  initials: string;
  /** The wire, in the words a row shows. It was `"WhatsApp" | "Phone"`, which is
   *  what let every escalation row be hard-coded to WhatsApp: the type could
   *  not have held an email even if the code had tried to put one there.
   *  "Leads" is a search waiting on its owner (spec G6), the one row that is not a person. "Next step" is a step due: no
   *  wire at all, the kind of row. "Calendar" is a visit to mark, which the Calendar holds. */
  channel: "WhatsApp" | "Phone" | "Text" | "Email" | "Instagram" | "Leads" | "Next step" | "Calendar";
  /** What it came through, after the wire: a reply's reach-out (00426: "Email, Early gyms"), so it is never read alone. */
  via?: string | null;
  /** "waited 2h" · "closes 5:10 PM · in 40m" · "2:14 PM · 1:35"; empty on a step, whose day is the first word of its state line. */
  when: string;
  sentence: string;
  quoted: boolean;
  /** What their email was about, said before their words (its subject without "Re:"); absent on every other wire. */
  lead?: string;
  status: string[];
  /**
   * The segment of `status` that says since when ("since Oct 19, 3:55 PM"), where it has one: a phone leaves it out, since
   * the wait beside the name says how long (his look on a phone, 29 Oct 2026).
   */
  since?: string;
  tone: "escalated" | "warn";
  warn: boolean;
  cta: { label: string; to: string };
  also: { label: string; verb: "snooze" | "resolve"; conversationId: string; escalationId: string } | null;
  /** How Mark done lets this row go, where it holds no hold to hand back: its thread is archived (today/queue.ts owedRow). */
  closes?: "archive";
  /**
   * On a `step` only: whose step it is and which note, the deal it moves and the member it is for, so the row's button can
   * mark it done (the person-notes verb the thread header uses) and Not now can move its day without changing whom it is
   * for (decision 0071). Its `cta.to` is the person, which the row opens; its `cta.label` is the verb.
   */
  step?: { person_id: string; note_id: string; deal_id: string | null; for_user_id: string | null };
  /**
   * On a `visit` only: the record's row for the visit, and the presses it is asked with (Kept, then Missed: visitLineOf's
   * `asks`), so the row's two buttons can say what became of it (POST calendar/visits/[id], the Calendar's own door). Its
   * `cta.to` is the visit on the Calendar, which the row opens.
   */
  visit?: { id: string; asks: VisitWord[] };
  /**
   * On a handoff whose hold is a time the customer picked by text (decision 0061): its thread, so the row's two buttons,
   * Booked it and Can't, answer it (POST conversations/[id]/booking-request). Its `cta.to` is the thread.
   */
  request?: { conversationId: string };
  /**
   * On a row a reply or a call answers (a handoff, a call-back, a closing window, a reach-out's reply read, a held reply;
   * decision 0071): what Ask drafts it for and where it goes. `for_message_id` is their newest message, which a kept draft
   * must answer (need-you/reply-drafts.ts); `wire` the words of the channel it goes by; `window_open` WhatsApp's free
   * reply window, open or shut (null on another wire), and `window_closes` when it shuts, on the business's clock.
   */
  writes?: {
    for_message_id: string | null;
    for_message_at_ms?: number | null;
    wire: string;
    window_open: boolean | null;
    window_closes: string | null;
  };
  /**
   * On a `held` row only (decision 0071, E5): the receptionist's reply counting down its veto window, which Stop holds
   * (POST messages/[id]/cancel-send, the Inbox's Hold) and the row may then send as the member's own. `sends_at_ms` is
   * the server's deadline (contracts draftSendsAtMs).
   */
  held?: { message_id: string; text: string; sends_at_ms: number };
  /** On a call-back: the number to ring (tel:), from the thread or the call; null where neither holds one. */
  phone?: string | null;
  /**
   * Words already written for the reply, which Ask drafts none over: a reach-out reply's draft the receptionist wrote
   * (reach-out/reply-today.ts replyRowOf). Null or absent where none was.
   */
  prepared?: string | null;
  /** Their reason for the hold in words (a handoff's, a call-back's), which a draft is written from; null for the rest. */
  reason?: string | null;
  /** For the order: the longest wait first; a window by how soon it closes; a call last. */
  waitedMs: number;
  /**
   * On a handoff: what its reason asks of you (escalations.ts holdActOf), a reply, a call back, a time to confirm, or
   * nothing that may be sent. Need you's filters read it (need-you/groups.ts needYouVerbOf).
   */
  act?: HoldAct;
  /**
   * How long until the row's clock runs out, where it has one: a reply your receptionist sends on its own, a WhatsApp
   * window that shuts. A clock under two hours puts the row before every wait (need-you/groups.ts), since a window that
   * shuts cannot be answered later and an old wait still can. Null or absent where nothing closes.
   */
  clock_ms?: number | null;
  /**
   * On a handoff of someone asking to book (a time they picked by text, decision 0061, or an ask for one): what puts it
   * before everyone else waiting (need-you/groups.ts needYouOrder). Absent on every other row.
   */
  booking?: boolean;
  /**
   * On a hold's row: why it was handed to you, in a few words ("asked for a person"), which its open card says beside the
   * name (the 10/10 read, 2 Nov 2026: it was behind an unexplained mark). Absent on every other row.
   */
  why?: string;
  /**
   * On the row of a reply that never reached them (a hold for a failed send, Today in three zones, 2 Nov 2026): the words
   * that failed, which Try again sends again as written, and why the wire refused them in a sentence (message-words.ts
   * sendFailureWords). Absent on every other row, and where the thread's failed message was not read.
   */
  failed?: { text: string; said: string };
}

/** What an empty queue MEANS for this workspace: the colour rides with a glyph and the words. */
export interface TodayQueueEmptyVM {
  title: string;
  /** The queue heading's own words when nothing is waiting: "nothing needs you" only where the receptionist is holding the floor. */
  sub: "nothing in the queue" | "nothing needs you";
  glyph: "alert" | "phone" | "mail" | "check";
  tone: "warn" | "ok" | "";
  testid: string;
}

export type TodayFigureId = "booked" | "answered" | "calls" | "new";

/**
 * One of the day's four figures: the number, its word, the clause always drawn under it, and the why behind it with
 * one door. A receipt adds to its figure and never repeats its number or its clause, so nothing is said twice and
 * nothing an owner needs lives only behind a hover.
 */
export interface TodayFigureVM {
  id: TodayFigureId;
  label: string;
  /** Null where the day's read could not count it (what was booked, when its read failed): drawn as a dash, never 0. */
  value: number | null;
  /** What the number is out of, said small after it ("31 of 34"): the customer messages answered's count is of. */
  of?: number;
  meta: string;
  receipt: { text: string; door: { label: string; to: string } | null } | null;
}

/** A thread where the customer wrote last and nothing went back for an hour or more, and nobody was handed it. */
export interface TodayNoReplyVM {
  conversationId: string;
  who: string;
  sinceMs: number;
  to: string;
}

/**
 * The calm rung's words before the runs are known (the wiring's second audit, S7-1): what the queue holds besides the
 * people (todayAlsoWaiting), the day's traffic ("3 messages from 2 people and 1 call"), whether the receptionist handled
 * all of it, and how it answered, with no subject ("answered 3 of the 3 on its own, typically in about 20s."). Kept on
 * the standing so a page that holds the runs says the head again with them (standingWithRuns), and a run waiting leads.
 */
export interface TodayCalmVM {
  also: string[];
  traffic: string | null;
  handled_all: boolean;
  answered: string | null;
}

export interface TodayVM {
  standing: {
    chips: Array<{ text: string; ok: boolean }>;
    /**
     * The wires, counted, in one sentence: "2 of 3 lines connected", "no lines
     * connected yet". `down` is true when one of them is off, the dot beside
     * it. The PAGE counted the chips, so the count could not be told about a
     * wire that is not a tenant_channels row, and email was invisible in it.
     * `short` is the same count in the sidebar's two words ("2 of 2 lines on"), which Glass draws under the
     * workspace's name as the canvases do.
     */
    lines: { text: string; short: string; down: boolean };
    alert: string | null;
    /**
     * The workspace is paused (its status, from Today's own read, which hears the plan): the band says so, and the queue's runs
     * say it instead of offering Approve, from this one flag.
     */
    paused: boolean;
    /** Ask reads these three; the page draws none of them. */
    headline: string;
    detail: string | null;
    tone: "needs" | "calm" | "alert";
    /** The calm rung's words, on the last rung and the quiet day; null on the alert and needs rungs (standingWithRuns). */
    calm: TodayCalmVM | null;
  };
  /**
   * The campaign runs waiting for your word that a word can still send (waits.ts runsThatWait), where the brief was
   * handed the runs; null where it was not (the browser's brief, whose page holds Sent's runs and says the head with them).
   */
  runs_waiting: number | null;
  /**
   * Ask's rows: the same escalations the queue draws, read once. `count` is the threads' part of the one count (holds
   * and replies counting down, waits.ts), and `holds` and `sends` its two parts: a held send has no row.
   */
  needsYou: {
    count: number;
    holds: number;
    sends: number;
    hint: string;
    rows: TodayNeedsRowVM[];
    empty: string | null;
  } | null;
  windowClosing: { label: string; hint: string; rows: Array<{ id: string; text: string; to: string }> } | null;
  /** Ask reads the sentences and the facts; the page draws the sentences that are not numbers and the receipts. */
  recap: {
    label: string;
    line: string;
    sentences: TodaySentenceVM[];
    facts: TodayFactVM[];
    receipts: Array<{ at: string; text: string; to: string }>;
  } | null;
  /**
   * The day's four figures, in order: booked, answered by the receptionist of the customer messages, calls, new people.
   * Always the four, as zeros on a day with nothing counted (the canvas of 2 Nov 2026).
   */
  figures: TodayFigureVM[];
  /** When the last message arrived and how long the answer took. Always said: on a day with traffic it is the messages figure's clause, on a quiet day the card's line. */
  proof: string;
  /** Who waits with nothing back, oldest first, for Ask found's rules to name (the wrong person left out). */
  noReply: TodayNoReplyVM[];
  calls: { line: string; rows: TodayCallRowVM[] } | null;
  /** Whether the calls read succeeded; false means the rows above omit the phone, and the card says so. */
  callsRead: boolean;
  /**
   * How many things the team dealt with today, by Need you's door ("3 done today"; Today in three zones, 2 Nov 2026): the
   * subjects the members' own decisions moved since the business's midnight (a reply sent, a hold closed or handed back, a
   * visit marked, a review answered, a run approved). Null where it was not read.
   */
  done_today: number | null;
  /** Who comes back from Not now in the next day, soonest first (today/day/zone.ts todayBackOf): the day draws today's. */
  back: TodayBackVM[];
  /**
   * Since the member last looked (Today in three zones, 2 Nov 2026): when they last opened the bell or marked it read, and
   * what the receptionist answered since; the head's line folds the bell's news in beside it (today/away.ts todaySince).
   * Null where it was not read.
   */
  since: { seen_at: string | null; answered: TodaySinceAnsweredDto | null } | null;
  /**
   * What the workspace calls an appointment (tenants.appointment_word, appointmentWordOf), as Today's own read says it:
   * the day, To do and Need you say it whether or not the playbooks are read, so a workspace with them off never reads a
   * playbook's word (the canvas of 2 Nov 2026). Null where the read did not say it (a server from before).
   */
  word: AppointmentWord | null;
  /**
   * Everything that asks for a person, in one row grammar, longest wait first: the rows, the rest as a count, and what
   * the rows hold in words. How many wait on you is the one count's (needsYou and runs_waiting; waits.ts), never a sum of
   * rows: a closing window is a window, a call worth a listen nobody waiting, and a held send has no row.
   */
  queue: {
    rows: TodayQueueRowVM[];
    /** The people past Up next and the five waiting, and the searches past the three to decide (need-you/groups.ts caps). */
    more: number;
    /** The people past Up next and the five waiting (a handoff, a call-back, a closing window, a reply read). */
    more_people: number;
    /** The calls worth a listen, drawn or not. */
    calls: number;
    /** The searches waiting for your answer, drawn or not. */
    searches: number;
    /** The reply windows closing, drawn or not: said as windows, never as people who need you. */
    windows: number;
    parts: string[];
    empty: TodayQueueEmptyVM;
  };
  /** What the head says with nobody waiting, on any day (bands.ts todayCalmHead): what is listening, and the last message. */
  calm: { headline: string; sub: string };
  quiet: {
    headline: string;
    sub: string;
    proof: Array<{ label: string; value: string }>;
    launchpad: { label: string; to: string } | null;
  } | null;
}

/**
 * GET today's answer (Today in three zones, 2 Nov 2026; the build's lane L5): the day's read whole, one request where the
 * page made six, which the page makes the day from (toTodayVM) and makes again each minute by the clock with no read. The
 * reader is Ask's (server/readers/today.ts), so the page and Ask cannot count it two ways. A part that could not be read
 * is null, never empty: the calls, the searches, the runs, the held threads, the leads who tried, what was done today and
 * what happened since the member last looked.
 */
export interface TodayReadDto {
  metrics: MetricsSummaryDto;
  /** The newest hundred. */
  conversations: ConversationDto[];
  /** The open escalations, newest first. */
  escalations: Array<EscalationDto & { conversation_id: string }>;
  calls: CallDto[] | null;
  searches: LeadSearchDto[] | null;
  /** The runs waiting for a word (toTodayVM counts those that still wait). */
  runs: WaitingRun[] | null;
  /** The threads of open holds past the hundred, read by their ids. */
  held_threads: ConversationDto[] | null;
  /** The lead previews a lead tried (readers/leads.ts previewsTried). */
  previews_tried: PreviewTriedDto[] | null;
  /** How many things the members dealt with since the business's midnight, by Need you's door. */
  done_today: number | null;
  since: TodayVM["since"];
  /** What the workspace calls an appointment. Absent from a server from before (either deploy order). */
  word?: AppointmentWord | null;
}
