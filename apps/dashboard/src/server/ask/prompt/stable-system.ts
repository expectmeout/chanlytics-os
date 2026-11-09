/** Prompt: stable system. */

import "server-only";
import {
  BREATH_WHY,
  DAYS,
  POLICY_CLASSES,
  POLICY_CLASS_WORDS,
  PLAYBOOK_CARD_WORDS,
  PLAYBOOK_VETO_DELAY_WORDS,
  bookingToolName,
  guardrailsInForce,
  hoursRuns,
  noteAsTold,
  notesInForce,
  parseTenantConfig,
  type TenantConfig,
  calendarFeedKeyOf,
} from "@chanlytics/contracts";
import type { Note } from "@chanlytics/contracts";
import { ANSWER_TOOL_RULES, ASK_SECTIONS } from "../prompt-rules";

/** Every rule, in the order the sections say them (prompt-rules.ts). */
export const ASK_RULES: readonly string[] = ASK_SECTIONS.flatMap((s) => s.rules);

/**
 * What the assistant is told, and in what order.
 *
 * The system block is the same for every turn in a workspace for as long as
 * its settings stand, and it is cached: the rules, the definitions, and the
 * business facts (the shape of the workspace follows it, cached too, in
 * loop.ts). This turn's words -- the clock, the person, the page, the scope,
 * the language -- ride in the user's message after the page's data. The
 * customer's words never appear in system; they arrive as data blocks and
 * inside tool results.
 */

/** The words the pages use, so the assistant uses the same ones. */
export const ASK_DEFINITIONS: Record<string, string> = {
  "needs you":
    "A thread the receptionist handed to a person: the customer asked for one, the receptionist was unsure, or a rule said so. It waits in the Inbox until someone takes it over, replies, or resolves it.",
  "you have it": "A thread you have taken over. The receptionist stays quiet on it until it is handed back.",
  "a teammate is answering":
    "A thread another member of the team has taken over: theirs to answer. The receptionist stays quiet on it until they hand it back.",
  "held draft":
    "A reply the receptionist wrote but did not send: either it was not sure enough (below the confidence dial) or the reply policy holds every draft for a short window. It sends itself when the window ends unless someone edits, holds or takes over.",
  "waiting on them":
    "The next move is theirs: nothing has come back yet from what was sent, and nothing is owed to them.",
  answering: "The receptionist is replying on its own on that thread.",
  snoozed: "A thread put aside until a chosen time; it wakes on its own.",
  "opted out": "The customer asked not to be messaged. Nothing goes out to them except a reply to something they send.",
  "24-hour window":
    "WhatsApp delivers a free-form reply only within 24 hours of the customer's last message. Outside it, only an approved template can be sent. Only WhatsApp has a window — a text or an email may be answered whenever, so `window_open` on a thread is this question answered for that thread's own wire.",
  escalation:
    "The record that a thread needed a person, with the reason. Resolving it closes the record; the thread itself stays.",
  "confidence dial":
    "The minimum confidence the receptionist needs to send a reply alone. Below it, the reply is held for a person.",
  "token budget":
    "A daily cap on the receptionist's model usage. When spent, the receptionist holds replies for a person instead of answering.",
  "veto window": "The reply policy mode where every draft waits a short while before sending, so a person can stop it.",
  "missed call":
    "A call a customer made that never connected: the receptionist did not answer, so nobody spoke. A call the receptionist placed that nobody answered is not missed: it did not connect (its outcome is not_connected, its direction outbound). A caller who reached the receptionist and hung up within seconds is abandoned, never missed.",
  "median reply time":
    "The middle value of how long a customer waited for the receptionist's answer over the period; half the replies were faster. Where the reply policy holds each reply (the hold window the owner set), that wait is part of it: the hold is the owner's setting, not the receptionist's speed, so say it, and use the report's reply_time.hold for how many went out as the hold ended and how many took longer.",
  "said yes":
    "A recorded answer that the person wants offers and news by WhatsApp: the desk recorded it on their profile, or they sent YES OFFERS or START themselves. Only these people can be on a broadcast.",
  broadcast:
    "One message sent to the people on a list who said yes — everyone, a People list, or a list kept by hand. A message is a name with a version for each channel it is written for (WhatsApp, which WhatsApp approves; email and text, ready when saved) and goes on the channels it holds, each person once. Sent now or at a time, 25 at a time; replies land in the Inbox, where the receptionist answers them.",
  "held back":
    "A person on a broadcast the send skipped at the wire: no recorded yes, asked to stop, no number, or a person had their thread.",
  calendar:
    "The owner's calendar as the receptionist reads it: an iCal feed of what is taken, the business's hours and closures, and the booking rules. The receptionist offers only the open windows, then sends the booking link, or takes their details where there is none; it never books, moves or cancels anything itself.",
  "freed time":
    "A time a cancellation, a move or a vanished calendar entry freed, offered to the people who asked in the last 30 days and never booked, by the campaign Fill a cancellation (moment slot_opened); its batch goes as every campaign's does, under its own mode. A reply is answered by the receptionist, and a booking stays the owner's to confirm where the workspace takes requests.",
  playbook: `A standing rule that sends one message to newly eligible people who said yes: win-back (by appointments where a calendar is connected, by 30 days of silence where not), the month's offer (everyone who said yes, on a cadence), a reminder before an appointment and a check after one, and the proposal follow-up (one nudge per proposal waiting past the workspace's pace, with its link, once). It runs at its hour by the business's clock, reaches a person once within its gap, and holds whoever hears ${BREATH_WHY}, by a message already sent or one due, for a later run (the reminder and the check go one per appointment, ${PLAYBOOK_CARD_WORDS.appointmentBreath}), under its own mode, its "Before each batch" (decision 0064) — auto sends each batch, veto sends it ${PLAYBOOK_VETO_DELAY_WORDS} later unless stopped, ask leaves it waiting for a person on Today; a new one takes the mode its class's Autonomy row says, and a batch of a step whose words are new to the owner (its first, and its first after new words) waits for their OK whatever the mode. A person calls it a campaign: in every word they read, say campaign, never playbook; the tools' names, actions and fields keep playbook.`,
};

const NOTHING = { kind: "none", id: "", label: "" };

const NO_BREAKDOWN = { label: "", total: 0, parts: [], source: NOTHING };

const NO_CHART = { kind: "bars", label: "", series: [], points: [], source: NOTHING };

const NO_LIST = { style: "bullets", entries: [] };

const REPORTS = { kind: "page", id: "reports", label: "Reports, past 7 days" };

/**
 * Answers as the format has them (spec 5.9), deliberately varied, since the model matches its examples' length and
 * shape: a count, a who, and an open answered from the row already read (the eval set measured an open that read the
 * call first: a round for nothing); the shapes asked for, a numbered list of rows (the items, numbered) and a list of
 * words; and two long ones, a comparison as a table and a plan as steps with points under them. The names are made up;
 * an id is given.
 */
export const ASK_EXAMPLES = [
  // An offer's answer: one sentence, the reason it has this shape; its chips are filled from the plan, and the card says the rest.
  [
    "Offer a free posture check by email until the 30th",
    {
      say: { headline: "More people said yes than you have room for, so I paced it.", detail: "" },
      show: { figures: [], items: [], breakdown: NO_BREAKDOWN, chart: NO_CHART, list: NO_LIST },
      do: { open: { source: NOTHING, label: "", now: false }, next: [] },
      language: "en",
    },
  ],
  [
    "How did the week go?",
    {
      say: {
        headline: "6 of 16 customer messages went unanswered this week.",
        detail: "Most of them came in after hours.",
      },
      show: {
        figures: [{ value: "5", label: "times it needed a person", note: "up from 1", source: REPORTS }],
        items: [],
        breakdown: {
          label: "customer messages",
          total: 16,
          parts: [
            { label: "Receptionist", value: 7, warn: false },
            { label: "Your team", value: 3, warn: false },
            { label: "Unanswered", value: 6, warn: true },
          ],
          source: REPORTS,
        },
        chart: NO_CHART,
        list: NO_LIST,
      },
      do: {
        open: {
          source: { kind: "page", id: "reports", label: "Reports" },
          label: "Open the week in Reports",
          now: false,
        },
        next: ["What caused the unanswered messages?"],
      },
      language: "en",
    },
  ],
  [
    "Who needs me right now?",
    {
      say: { headline: "Two people have waited three days for you.", detail: "" },
      show: {
        figures: [],
        items: [
          {
            title: "Ana Lima",
            meta: "WhatsApp · 3 days",
            line: "Sent a photo the receptionist can't read.",
            source: { kind: "thread", id: "<the conversation_id a tool returned>", label: "Ana Lima" },
          },
          {
            title: "Sam Ortiz",
            meta: "Text · 3 days",
            line: "Wants a call back about a quote.",
            source: { kind: "thread", id: "<the conversation_id a tool returned>", label: "Sam Ortiz" },
          },
        ],
        breakdown: NO_BREAKDOWN,
        chart: NO_CHART,
        list: NO_LIST,
      },
      do: { open: { source: NOTHING, label: "", now: false }, next: ["What did the receptionist tell Ana?"] },
      language: "en",
    },
  ],
  [
    "Open the transcript of the most recent call",
    {
      say: { headline: "Opening Casey Lin's call from 3:34 PM.", detail: "" },
      show: { figures: [], items: [], breakdown: NO_BREAKDOWN, chart: NO_CHART, list: NO_LIST },
      do: {
        open: {
          source: { kind: "call", id: "<the call_id the calls above gave>", label: "Casey Lin's call" },
          label: "Open the call",
          now: true,
        },
        next: [],
      },
      language: "en",
    },
  ],
  [
    "Who needs me? As a numbered list",
    {
      say: { headline: "Two people need you, the longest wait first.", detail: "" },
      show: {
        figures: [],
        items: [
          {
            title: "Ana Lima",
            meta: "WhatsApp · 3 days",
            line: "Sent a photo the receptionist can't read.",
            source: { kind: "thread", id: "<the conversation_id a tool returned>", label: "Ana Lima" },
          },
          {
            title: "Sam Ortiz",
            meta: "Text · 1 day",
            line: "Wants a call back about a quote.",
            source: { kind: "thread", id: "<the conversation_id a tool returned>", label: "Sam Ortiz" },
          },
        ],
        breakdown: NO_BREAKDOWN,
        chart: NO_CHART,
        list: { style: "numbers", entries: [] },
      },
      do: { open: { source: NOTHING, label: "", now: false }, next: [] },
      language: "en",
    },
  ],
  [
    "How do I answer a bad review? Bullet points",
    {
      say: { headline: "Answer it soon, briefly, and in public, then take it offline.", detail: "" },
      show: {
        figures: [],
        items: [],
        breakdown: NO_BREAKDOWN,
        chart: NO_CHART,
        list: {
          style: "bullets",
          entries: [
            "Thank them and name what went wrong, without excuses.",
            "Say what you changed, in one line.",
            "Offer to talk it through by phone.",
          ],
        },
      },
      do: { open: { source: NOTHING, label: "", now: false }, next: [] },
      language: "en",
    },
  ],
  [
    "Compare the channels this month as a table",
    {
      say: {
        headline: "WhatsApp brought the most bookings this month; calls were answered fastest.",
        detail:
          "| Channel | Conversations | Booked | Median reply |\n|---|---|---|---|\n| WhatsApp | 42 | **18** | 1 min |\n| Calls | 25 | 9 | 0 min |\n| Text | 11 | 3 | 4 min |\n\nText books least: **3 of 11**, and most of the rest asked about prices.",
      },
      show: { figures: [], items: [], breakdown: NO_BREAKDOWN, chart: NO_CHART, list: NO_LIST },
      do: {
        open: { source: { kind: "page", id: "reports", label: "Reports" }, label: "Open Reports", now: false },
        next: ["Why does text book less?"],
      },
      language: "en",
    },
  ],
  [
    "What should I do about the unanswered messages? Step by step",
    {
      say: {
        headline: "Answer the oldest first, then give the receptionist what it was missing.",
        detail:
          "### Today\n1. Open **Needs you** in the Inbox and answer the oldest first.\n2. For each one the receptionist could not answer:\n  - add the missing fact to its notes, so it answers the next one itself\n  - take the thread over when it needs a person\n\n### This week\n- Check that the hours and services it answers from are right.",
      },
      show: { figures: [], items: [], breakdown: NO_BREAKDOWN, chart: NO_CHART, list: NO_LIST },
      do: {
        open: { source: { kind: "page", id: "inbox", label: "Inbox" }, label: "Open the Inbox", now: false },
        next: ["Which facts was it missing?"],
      },
      language: "en",
    },
  ],
] as const;

export interface WorkspaceFacts {
  /** What the business's files are, in a line (contracts filesLineOf); none where they could not be read. */
  filesLine?: string | null;
  businessName: string;
  timezone: string;
  hoursLines: string[];
  closures: Array<{ date: string; until?: string; note?: string }>;
  services: Array<{ name: string; duration_min?: number; price_note?: string }>;
  languages: string[];
  guardrails: string[];
  /** The notes the receptionist is told today (contracts notesInForce), each with its last day where it has one. */
  notes: Note[];
  bookingNotes: string[];
  hasCalendar: boolean;
  /** The booking tool whose emails become appointments, as the product says it; null for none named. */
  bookingTool: string | null;
  /** The owner's word that they take bookings themselves. */
  booksByHand: boolean;
  visionOn: boolean;
  /** The Autonomy rows, "Replies: auto" each, in the matrix's order; empty when the rows could not be read. */
  autonomy: string[];
}

/** What the calendar is fed by, as the settings alone say it: a link, a booking tool's emails, or the owner's own hands. */
const calendarFactsOf = (
  cfg: TenantConfig | null,
): Pick<WorkspaceFacts, "hasCalendar" | "bookingTool" | "booksByHand"> => ({
  hasCalendar: !!calendarFeedKeyOf(cfg),
  bookingTool: bookingToolName(cfg?.bookings?.tool),
  booksByHand: !!cfg?.bookings?.by_hand,
});

/**
 * The facts the receptionist itself runs on, in a few lines. `now` is the clock they are true at (a turn's, rc.now):
 * the notes are the ones the composer tells the receptionist on the workspace's day then, so Ask never claims a note
 * whose last day has passed.
 */
export function workspaceFacts(
  name: string,
  timezone: string,
  rawConfig: unknown,
  now: Date,
  policies: ReadonlyArray<{ class: string; mode: string }> = [],
): WorkspaceFacts {
  const cfg: TenantConfig | null = parseTenantConfig(rawConfig);
  const profile = cfg?.brain?.profile;
  const guardrails: string[] = [];
  // The composer's own reading of the four, so Ask never claims a rule the receptionist was not given.
  const result = guardrailsInForce(profile?.guardrails);
  guardrails.push(
    result.never_quote_prices
      ? "never quotes or confirms a price"
      : "says only the prices the business wrote, never another",
  );
  if (result.never_confirm_booking) guardrails.push("never confirms a booking itself");
  // Always (decision 0051): a call's greeting says it, a new text conversation opens with it, and it says so when asked.
  guardrails.push("always says it is the business's automated assistant, never a person");
  if (result.no_health_advice) guardrails.push("gives no health advice");
  return {
    businessName: cfg?.brain?.business_name || name,
    timezone,
    hoursLines: hoursRuns(profile?.hours).map((r) =>
      r.from === r.to ? `${r.from}: ${r.text}` : `${r.from}–${r.to}: ${r.text}`,
    ),
    closures: (profile?.closures ?? []).slice(0, 12),
    services: (profile?.services ?? []).slice(0, 40),
    languages: profile?.languages ?? [],
    guardrails,
    // The composer's own rule and day (contracts notesInForce), then the ten Ask is told of.
    notes: notesInForce(profile?.notes, timezone, now).slice(0, 10),
    bookingNotes: profile?.booking_rules?.notes ?? [],
    ...calendarFactsOf(cfg),
    visionOn: !!cfg?.features?.vision,
    autonomy: POLICY_CLASSES.flatMap((cls) => {
      const mode = policies.find((p) => p.class === cls)?.mode;
      return mode ? [`${POLICY_CLASS_WORDS[cls].short}: ${mode}`] : [];
    }),
  };
}

export function factsBlock(workspaceFacts: WorkspaceFacts): string {
  const lines: string[] = [];
  lines.push(`Business: ${workspaceFacts.businessName}. Time zone: ${workspaceFacts.timezone}.`);
  if (workspaceFacts.hoursLines.length)
    lines.push(`Hours (${DAYS.join("/")}): ${workspaceFacts.hoursLines.join("; ")}.`);
  if (workspaceFacts.closures.length)
    lines.push(
      `Closures: ${workspaceFacts.closures.map((c) => `${c.date}${c.until ? `–${c.until}` : ""}${c.note ? ` (${c.note})` : ""}`).join(", ")}.`,
    );
  if (workspaceFacts.services.length)
    lines.push(
      `Services: ${workspaceFacts.services.map((s) => `${s.name}${s.duration_min ? ` ${s.duration_min}min` : ""}${s.price_note ? ` (${s.price_note})` : ""}`).join(", ")}.`,
    );
  if (workspaceFacts.languages.length)
    lines.push(`Languages the receptionist answers in: ${workspaceFacts.languages.join(", ")}.`);
  if (workspaceFacts.guardrails.length) lines.push(`The receptionist ${workspaceFacts.guardrails.join(", ")}.`);
  if (workspaceFacts.autonomy.length)
    lines.push(
      `Autonomy, class by class (auto: on its own · veto: after a short hold unless someone stops it · ask: waits for a person · never: not at all): ${workspaceFacts.autonomy.join("; ")}. Money is always never, by charter.`,
    );
  if (workspaceFacts.notes.length)
    // Each as the receptionist's prompt says it (contracts noteAsTold): a note with an end says it.
    lines.push(`Notes the receptionist follows: ${workspaceFacts.notes.map(noteAsTold).join(" | ")}.`);
  if (workspaceFacts.bookingNotes.length) lines.push(`Booking notes: ${workspaceFacts.bookingNotes.join("; ")}.`);
  lines.push(calendarFact(workspaceFacts));
  if (workspaceFacts.filesLine) lines.push(workspaceFacts.filesLine);
  return lines.join("\n");
}

/**
 * Whether openings can be read, and what the calendar is fed by where they cannot. The two sentences a workspace with
 * neither a tool nor its own word gets are the ones every workspace got; a tool named or "by hand" adds what is true of
 * it, so Ask does not tell a business whose bookings are on its board that it has no calendar.
 */
function calendarFact(f: WorkspaceFacts): string {
  if (f.hasCalendar) return "A calendar feed is connected: openings can be read with calendar with action openings.";
  const noOpenings = "openings cannot be read; the business's hours are the only availability fact.";
  if (f.bookingTool)
    return `Bookings arrive by email from ${f.bookingTool} and are on the calendar (calendar with action week). No calendar link is connected, so ${noOpenings}`;
  if (f.booksByHand) return `The business takes bookings by hand and connects no calendar, so ${noOpenings}`;
  return `No calendar feed is connected, so ${noOpenings}`;
}

export function definitionsBlock(): string {
  return Object.entries(ASK_DEFINITIONS)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
}

/**
 * The cached block, each part under its label: the rules' sections (and the answer tool's, when the answer is written
 * through it), the example answers, definitions, facts. Same text for every turn until settings change.
 */
export function stableSystem(workspaceFacts: WorkspaceFacts, answerTool: boolean): string {
  const section = (title: string, lines: readonly string[]) => [`## ${title}`, ...lines].join("\n");
  return [
    ...ASK_SECTIONS.map((s) => section(s.title, s.rules)),
    ...(answerTool ? [section("The answer tool", ANSWER_TOOL_RULES)] : []),
    section("Answers, as illustrations of the format", [
      "Each answer takes the shape and length its own question needs.",
      ...ASK_EXAMPLES.map(([q, a]) => `"${q}"\n${JSON.stringify(a)}`),
    ]),
    section("Definitions (the workspace's own words)", [definitionsBlock()]),
    section("The workspace", [factsBlock(workspaceFacts)]),
  ].join("\n\n");
}
