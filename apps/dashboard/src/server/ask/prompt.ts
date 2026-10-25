import "server-only";
import { createHash } from "node:crypto";
import {
  clockStamp,
  ASK_ANSWER_CAPS,
  BREATH_WHY,
  DAYS,
  POLICY_CLASSES,
  POLICY_CLASS_WORDS,
  PLAYBOOK_CARD_WORDS,
  PLAYBOOK_VETO_DELAY_WORDS,
  answerFromV1,
  bookingToolName,
  clip as answerClip,
  describeNow,
  fenceActed,
  fencedInline,
  guardrailsInForce,
  hoursRuns,
  noteAsTold,
  notesInForce,
  parseTenantConfig,
  promptSafeName,
  type TenantConfig,
  calendarFeedKeyOf,
} from "@chanlytics/contracts";
import type { MembershipRole, Note } from "@chanlytics/contracts";
import type { AskColumn, AskMessageVM, AskProposal, AskProposalOutcome, AskScope } from "@chanlytics/contracts";
import { oneLine } from "./context/rows";
import { ANSWER_TOOL_RULES, ASK_SECTIONS } from "./prompt-rules";

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
  playbook: `A standing rule that sends one message to newly eligible people who said yes: win-back (by appointments where a calendar is connected, by 30 days of silence where not), the month's offer (everyone who said yes, on a cadence), a reminder before an appointment and a check after one, and the proposal follow-up (one nudge per proposal waiting past the workspace's pace, with its link, once). It runs at its hour by the business's clock, reaches a person once within its gap, and holds whoever hears ${BREATH_WHY}, by a message already sent or one due, for a later run (the reminder and the check go one per appointment, ${PLAYBOOK_CARD_WORDS.appointmentBreath}), under its own mode, its "Before each batch" (decision 0064) — auto sends each batch, veto sends it ${PLAYBOOK_VETO_DELAY_WORDS} later unless stopped, ask leaves it waiting for a person on Today; a new one takes the mode its class's Autonomy row says, and a batch of a step whose words are new to the owner (its first, and its first after new words) waits for their OK whatever the mode. A person calls it a campaign: in every word they read, say campaign, never playbook; the tools' names, actions and fields keep playbook.`,
};

const NOTHING = { kind: "none", id: "", label: "" };
const NO_BREAKDOWN = { label: "", total: 0, parts: [], source: NOTHING };
const NO_CHART = { kind: "bars", label: "", points: [], source: NOTHING };
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
  const g = guardrailsInForce(profile?.guardrails);
  guardrails.push(
    g.never_quote_prices
      ? "never quotes or confirms a price"
      : "says only the prices the business wrote, never another",
  );
  if (g.never_confirm_booking) guardrails.push("never confirms a booking itself");
  // Always (decision 0051): a call's greeting says it, a new text conversation opens with it, and it says so when asked.
  guardrails.push("always says it is the business's automated assistant, never a person");
  if (g.no_health_advice) guardrails.push("gives no health advice");
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

export function factsBlock(f: WorkspaceFacts): string {
  const lines: string[] = [];
  lines.push(`Business: ${f.businessName}. Time zone: ${f.timezone}.`);
  if (f.hoursLines.length) lines.push(`Hours (${DAYS.join("/")}): ${f.hoursLines.join("; ")}.`);
  if (f.closures.length)
    lines.push(
      `Closures: ${f.closures.map((c) => `${c.date}${c.until ? `–${c.until}` : ""}${c.note ? ` (${c.note})` : ""}`).join(", ")}.`,
    );
  if (f.services.length)
    lines.push(
      `Services: ${f.services.map((s) => `${s.name}${s.duration_min ? ` ${s.duration_min}min` : ""}${s.price_note ? ` (${s.price_note})` : ""}`).join(", ")}.`,
    );
  if (f.languages.length) lines.push(`Languages the receptionist answers in: ${f.languages.join(", ")}.`);
  if (f.guardrails.length) lines.push(`The receptionist ${f.guardrails.join(", ")}.`);
  if (f.autonomy.length)
    lines.push(
      `Autonomy, class by class (auto: on its own · veto: after a short hold unless someone stops it · ask: waits for a person · never: not at all): ${f.autonomy.join("; ")}. Money is always never, by charter.`,
    );
  if (f.notes.length)
    // Each as the receptionist's prompt says it (contracts noteAsTold): a note with an end says it.
    lines.push(`Notes the receptionist follows: ${f.notes.map(noteAsTold).join(" | ")}.`);
  if (f.bookingNotes.length) lines.push(`Booking notes: ${f.bookingNotes.join("; ")}.`);
  lines.push(calendarFact(f));
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
export function stableSystem(f: WorkspaceFacts, answerTool: boolean): string {
  const section = (title: string, lines: readonly string[]) => [`## ${title}`, ...lines].join("\n");
  return [
    ...ASK_SECTIONS.map((s) => section(s.title, s.rules)),
    ...(answerTool ? [section("The answer tool", ANSWER_TOOL_RULES)] : []),
    section("Answers, as illustrations of the format", [
      "Each answer takes the shape and length its own question needs.",
      ...ASK_EXAMPLES.map(([q, a]) => `"${q}"\n${JSON.stringify(a)}`),
    ]),
    section("Definitions (the workspace's own words)", [definitionsBlock()]),
    section("The workspace", [factsBlock(f)]),
  ].join("\n\n");
}

/**
 * The turn's system blocks: the rules and facts every turn in the workspace shares, and the workspace's shape, each ending
 * a cache breakpoint (the loop says why there are two).
 */
export function systemBlocks(
  rules: string,
  shape: string | null,
): Array<{ type: "text"; text: string; cache_control: { type: "ephemeral" } }> {
  const block = (text: string) => ({ type: "text" as const, text, cache_control: { type: "ephemeral" as const } });
  return [block(rules), ...(shape ? [block(shape)] : [])];
}

/** The first 16 hex of the sha256 of the system blocks: what a turn's answer was written from (AskTurnShape.prompt_hash). */
export function systemHash(blocks: Array<{ text: string }>): string {
  return createHash("sha256")
    .update(blocks.map((b) => b.text).join("\n"))
    .digest("hex")
    .slice(0, 16);
}

/** A card from earlier in the thread, and what the person did with it and when it was recorded (the Phase 5 plan, D8). */
export type CardOutcome = Pick<AskProposal, "id" | "title"> & Pick<AskProposalOutcome, "state" | "receipt" | "atMs">;
/** What a person's doing with a card is called, in the Line's words: a card done was approved. */
const DID: Record<AskProposalOutcome["state"], string> = {
  done: "was approved",
  dismissed: "was dismissed",
  failed: "failed",
  undone: "was undone",
};

export interface TurnFacts {
  role: MembershipRole;
  personLabel: string;
  scope: AskScope | null;
  surface: string | null;
  timezone: string;
  closures: WorkspaceFacts["closures"];
  now?: Date;
  /** The page's data rode in before these words (context.ts). */
  context?: boolean;
  /** Reads made for this question, of another page, rode in before these words (cross-page.ts). */
  crossPage?: boolean;
  /** The scope's row was read for this question and rode in before these words (cross-page.ts scopedRead). */
  scopeRead?: boolean;
  /**
   * The scope is the page they are on, at its address (a reach-out's drawer, contracts scopeFromRoute): no read names
   * it, and the page's data, where it rode in (`context`), holds its row.
   */
  scopeOnPage?: boolean;
  /**
   * On a live turn, what the person did with the chain's cards that no turn of it told yet (memory.ts, D8): said after
   * the clock, in this question's words, never by an edit of an earlier message.
   */
  since?: CardOutcome[];
  /**
   * On a live turn, when each earlier turn it replays was asked (memory.ts Chain.readAt): their reads are said as history,
   * with their times, so the model reads again what may have moved since (R13 X5-4).
   */
  replayedAt?: readonly number[];
  /**
   * The row their words point at, as the tab read them (PageContext.focus, the Phase 5 plan, D7): an earlier answer's
   * item by its place in an open thread, or the page's row by its place or its name; said when it is not the scope.
   */
  focus?: AskScope | null;
  /**
   * Whether this turn's read set holds the focus's row before the model is asked (loop.ts): only then may it be opened
   * or named without a read. A page's rows can be cut by its caps, or its build fail, and the words can point past them.
   */
  focusRead?: boolean;
  /**
   * The person is listening, not reading (the voice door, spec 2026-10-03 §3.4): SPOKEN_LINE is said last, after the
   * language, so the say is written for the ear and the figures still go to show.
   */
  spoken?: boolean;
  /** The column the Line draws the answer in (contracts AskColumn): columnLine, unless they are listening. */
  column?: AskColumn | null;
  /** What is above their role, so no tool of the turn's proposes it (tools/offer.ts aboveRoleWords); null for none. */
  above?: string | null;
  /** How they like answers, in their own note (Settings › Profile, contracts answerStyleOf); "" for none. */
  style?: string;
}

/**
 * The spoken register, one line in the turn's words (spec 2026-10-03 §3.4, verbatim, and a list's clause since the list
 * part): the agent starts speaking at
 * the first comma, so the opening clause is short and punctuated; the normaliser reads digits, so a time or a count
 * stays as the page shows it; an id, a route, a symbol or a tag would be read aloud as nonsense.
 */
const SPOKEN_LINE =
  "They are listening, not reading. Open with a short clause and a comma, then what matters first in one breath, in say.headline; say.detail may run to three short sentences when they asked for a summary, a reason or detail, and is empty otherwise. Say a name as a name and a time or a count as the page shows it; never an id, a route, a symbol, a bracketed tag or formatting: no headings, bold or tables, plain sentences only. Every figure and row goes in show, where the screen draws it; a list goes in show.list, whose entries are read after the say, one by one, so keep each short.";

/**
 * Where the answer is read (18 Oct 2026, after Anthropic's prompting guidance: say the surface and why it matters, and let
 * the model choose the shape): the column the Line draws it in, as the tab measured it, and about as many characters as
 * a line of the detail holds there (Mona Sans at the detail's 15px, about 7px a character; measured 18 Oct 2026). A table wider than the
 * column scrolls sideways, which a reader in a narrow panel or on a phone seldom does. Said in the turn's words, beside
 * the page; a spoken turn draws nothing, so it says none.
 */
const DETAIL_PX_PER_CHAR = 7;
function columnLine(c: AskColumn): string {
  const chars = Math.round(c.px / DETAIL_PX_PER_CHAR / 5) * 5;
  return `They read your answer in a column about ${c.px}px wide on ${c.phone ? "a phone" : "a desk"}, about ${chars} characters to a line. Lists and short paragraphs fit it well; a table wider than three short columns scrolls sideways there, so a wider comparison reads better as a list or a narrower table, unless they ask for a table.`;
}

/**
 * A row as the turn's words name it: by the label the page gave it, which is often someone else's (a customer's name,
 * a caller's, a lead's listing), set in a sentence the model is told. So it is a name as a prompt may show one and
 * fenced as a record's words (contracts ai/fence.ts); a label with nothing left names the row by its kind.
 */
function rowName(r: AskScope): string {
  const name = promptSafeName(r.label);
  return name ? fencedInline("record", name) : `this ${r.kind}`;
}

/**
 * The Campaigns line (the moment spec §4.9 A2), in the turn's words and never in system, so the cached rules stay the
 * same bytes on every page: what a sentence on Campaigns is. It names no tool (the answer canvas, A3): which tool and
 * action carry each change is the tools' own words, found by search with the page's tools first.
 */
const CAMPAIGNS_LINE =
  "They are on Campaigns, which lists what goes out on its own as a customer reaches each moment of their journey (campaigns that run by themselves) and what they send themselves. Words that describe an offer, a promotion, a setup, or a message at a moment or to a list are sequences to propose, as the rule \"Setting up sequences is a few cards\" says. Pausing, resuming, renaming, or a new hour, cap, gap or cadence, new words, a step, a last day or its mode (how its batches are decided) of one that exists is a change to that sequence, by the id the page's rows carry, and cold email to leads is a sequence too. A question about results is answered from the page's rows: a campaign's numbers are its last 30 days, and a one-off send's are that send's own, however long ago it went.";

/** Said once a card of the thread was approved since the last answer (A4): the shape is minutes old; campaigns are read. */
const AFTER_APPROVAL_LINE =
  "Cards were approved since the workspace's shape above was read: for what runs now, read the sequences again, never the shape.";

/**
 * This turn's words, in the user's message after the page's data and before
 * the question: the clock, on a live turn what happened since, who is asking,
 * where they are and the row their words point at, and that the data before
 * them needs no second read. The language is the model's to follow from the
 * person's words (the rules say so), never a guess said here. They sit after the page's breakpoint (bp3), so words that change every
 * turn never cost the page its cache; a request's last block carries the fourth
 * (bp4), so the turn's later rounds read them from the cache with the rest.
 */
/**
 * The line a live turn says of the turns it replays: when their reads were made, as history. What a read held at 10:00 is
 * what was true at 10:00; a thread taken, a run approved or a booking made since is read again before it is said as now
 * (the wiring's second audit, R13 X5-4).
 */
function replayedLine(at: readonly number[], tz: string, nowMs: number): string {
  const times = [...new Set(at.map((ms) => clockStamp(ms, tz, nowMs)))];
  const when = times.length > 1 ? `${times.slice(0, -1).join(", ")} and ${times.at(-1) ?? ""}` : (times[0] ?? "");
  return `The earlier turns above, and every read in them, were made at ${when}, by the business's clock: they are what was true then. Read again what may have changed since (who needs you, a thread's state, a run, a booking) before you say it as now.`;
}

export function turnWords(t: TurnFacts): string {
  const lines: string[] = [];
  lines.push(describeNow(t.timezone, t.now ?? new Date(), t.closures));
  if (t.since?.length) {
    const did = t.since.map((o) => `“${o.title}” (${o.id}) ${DID[o.state]}${o.receipt ? `: ${o.receipt}` : ""}`);
    lines.push(`Since the last answer, the person acted on cards from earlier in this thread: ${did.join("; ")}.`);
  }
  if (t.since?.some((o) => o.state === "done")) lines.push(AFTER_APPROVAL_LINE);
  if (t.replayedAt?.length) lines.push(replayedLine(t.replayedAt, t.timezone, (t.now ?? new Date()).getTime()));
  if (t.context)
    lines.push(
      "The page they are on is in the search results before these words (page:// its figures, then its rows in the page's order): answer from it, and read only for what it does not hold.",
    );
  if (t.crossPage)
    lines.push(
      "The reads made for this question are there too (read://): they are what it asks for of another page, so answer from them now, and call their tools again only for rows they do not hold.",
    );
  const can =
    t.role === "owner"
      ? "an owner: they can do everything on the pages, including settings, team and exports"
      : t.role === "partner"
        ? "the workspace's partner, who sets it up and runs it with its owner: they can do what an operator can and change settings, channels and lead searches, but not billing, team or exports"
        : t.role === "operator"
          ? "an operator: they can reply, take over, snooze and resolve threads and change autonomy, but not settings, team or exports"
          : "a viewer: they can read everything and change nothing";
  // Who they are, then what is above their role (aboveRoleWords), on one line: nothing more where nothing is.
  lines.push([`You are speaking with ${t.personLabel}, ${can}.`, t.above].join(" ").trimEnd());
  // Their own note on how they like answers (the answer canvas, D): what they ask in this conversation comes first.
  if (t.style)
    lines.push(
      `How they like answers, in their own note (Settings › Profile): ${fencedInline("note", t.style)}. Write to it, unless they ask otherwise in this conversation.`,
    );
  if (t.surface === "leads")
    lines.push(
      'They are on the Leads page, where the businesses Claude found for them are listed. Words that describe businesses (a kind, a place, a count) are a lead search to propose, once the searches they have are read; ask only when the kind or the place is missing. If a search on this page is waiting for an answer, words that answer its question amend it, and "this search" is the one the scope names.',
    );
  else if (t.surface === "campaigns") lines.push(CAMPAIGNS_LINE);
  else if (t.surface) lines.push(`They are on the ${t.surface} page.`);
  // Every row a scope names is read by its id (cross-page.ts scopedRead) and rides in with the question; one whose read
  // failed, like a page, is read by the model. The page they are on, at its own address, rode in as the page.
  const read = t.scopeRead
    ? "It was read for this question and is in the search results before these words (read://): answer from it, and read again only for what it does not hold."
    : t.scopeOnPage && t.context
      ? "It is the page they are on, in the search results before these words (page://): answer from its rows, and read only for what they do not hold."
      : "Read it before answering about it.";
  if (t.scope)
    lines.push(
      `They are looking at ${rowName(t.scope)} (${t.scope.kind} ${t.scope.id}); "this", "them", "here" mean that unless they say otherwise. ${read}`,
    );
  // The row their words point at, when it is not the scope: an earlier answer's item (in the read set, D5) or the page's
  // -- opened or named without a read only when the read set holds it (focusRead), else read first.
  const f = t.focus;
  const then = t.focusRead
    ? "open or name it without a read; read it for anything about it"
    : "read it first, to open or name it and for anything about it";
  if (f && (f.kind !== t.scope?.kind || f.id !== t.scope?.id))
    lines.push(`Their words point at ${rowName(f)} (${f.kind} ${f.id}): ${then}.`);
  if (t.spoken) lines.push(SPOKEN_LINE);
  else if (t.column) lines.push(columnLine(t.column));
  return lines.join("\n");
}

/**
 * A thread's title: its first question, in the person's words, never a summary and never renamed by what the answer
 * did (D9). Two threads that asked the same thing keep the same title; the rail shows when.
 */
export function titleFromQuestion(q: string): string {
  const s = q.replace(/\s+/g, " ").trim();
  return s.length > 60 ? `${s.slice(0, 57).trimEnd()}…` : s;
}

/**
 * What an answer to a search's question is about: which search, what it asked, what the owner first asked for and
 * what it leaves out, read from the search when the answer was sent (the Leads answer row sends only the search's
 * id and the owner's words). It is stored beside the owner's words on their turn, never in them: the thread shows
 * what they said, and the model is told the rest on that turn and every later one (askTurnText).
 */
export interface SearchAnswering {
  search_id: string;
  name: string;
  question: string;
  asked: string;
  leaving_out: string[];
}

const clip = (s: unknown, n: number): string =>
  typeof s === "string" ? s.replace(/\s+/g, " ").trim().slice(0, n) : "";

/** The stored shape read back, or null for a turn that answered nothing. */
export function answeringOf(v: unknown): SearchAnswering | null {
  const a = v as Partial<SearchAnswering> | null;
  if (!a || typeof a !== "object" || typeof a.search_id !== "string" || !a.search_id) return null;
  return {
    search_id: a.search_id,
    name: clip(a.name, 80),
    question: clip(a.question, 300),
    asked: clip(a.asked, 200),
    leaving_out: (Array.isArray(a.leaving_out) ? a.leaving_out : [])
      .slice(0, 8)
      .map((x) => clip(x, 80))
      .filter(Boolean),
  };
}

/**
 * A person's turn as the model reads it: their words, or, for an answer to a search's question, their words inside
 * what they answer -- which search, by id so the model can name it in `amends`, what it asked, and what to propose.
 * The same text on the turn itself and when the turn is replayed later in the thread, so a later turn still knows
 * what that answer was about.
 */
export function askTurnText(words: string, answering: SearchAnswering | null): string {
  if (!answering) return words;
  const a = answering;
  const asked = a.question ? `stopped to ask: “${a.question}”` : "stopped to ask a question";
  const leaving = a.leaving_out.length ? `, leaving out ${a.leaving_out.join(", ")}` : "";
  return (
    `On People › Leads, my search for ${a.name} (search id ${a.search_id}) ${asked} ` +
    `I had asked for: “${a.asked}”${leaving}. My answer: ${words}. ` +
    "Propose the same search with my answer applied (propose_lead_search with action find and amends set to that id), and keep everything I did not change."
  );
}

/** The most a rebuilt line says of an answer (the Phase 5 plan, D4): its cards and rows past these are "and N more". */
const LINE_CAPS = {
  cards: 3,
  title: ASK_ANSWER_CAPS.title,
  receipt: 80,
  rows: ASK_ANSWER_CAPS.items,
  label: ASK_ANSWER_CAPS.label,
  entries: 3,
  entry: 60,
} as const;
/**
 * A part of a rebuilt line, cut as an answer's own parts are (contracts clip): one line of words, never a new line, at
 * most `n` characters, a longer one ending on a whole word with an ellipsis.
 */
const linePart = (s: string | null | undefined, n: number): string => answerClip(s, n);
/**
 * A card's title as history replays it. A title is the product's own words around a name someone else chose ("Reply
 * to Rosa"), so it keeps its length; only a title the fence would act on is made a safe name, as a row's label is.
 */
const historyName = (title: string): string | null => (fenceActed(title) ? promptSafeName(title) : title);
/** What the person did with a card, as a rebuilt line says it: theirs, and never "done". */
const DID_WORD: Record<AskProposalOutcome["state"], string> = {
  done: "approved",
  dismissed: "dismissed",
  failed: "failed",
  undone: "undone",
};
function outcomeWords(o: AskProposalOutcome | null | undefined): string {
  if (!o) return "not pressed yet";
  const receipt = o.state === "done" || o.state === "failed" ? linePart(o.receipt, LINE_CAPS.receipt) : "";
  return receipt ? `${DID_WORD[o.state]}: ${receipt}` : DID_WORD[o.state];
}
/** A list in a rebuilt line: `<name>: a; b; and N more.`, or nothing for none. */
const listed = (name: string, parts: string[], more: number): string =>
  parts.length || more > 0 ? `${name}: ${[...parts, ...(more > 0 ? [`and ${more} more`] : [])].join("; ")}.` : "";

/**
 * An earlier answer as a cold turn's history says it (the Phase 5 plan, D4): one line, never a new line -- its headline
 * (a prose answer's first words), then its list's first entries as `List (<style>): a; b; and N more.`, so "the second
 * one" is answerable, then each card it made as `<id> · <kind> · <title> · <what the person did>`, then the
 * rows it named in the answer's order as `<n>. <kind> <id> <label>`, each part only when there is one; a turn that
 * failed says so first, and keeps its cards. At most `max` characters, the history's cut for a turn: a row the line has
 * no room for goes whole into "and N more", so an id is never cut. An answer of words alone, one line of 160 characters
 * at most, is the words as they were.
 */
export function answerLine(m: AskMessageVM, max: number): string {
  const a = m.answer ?? answerFromV1(m);
  const cards = m.proposals
    .slice(0, LINE_CAPS.cards)
    .map((p) =>
      [oneLine(p.id), p.kind, linePart(historyName(p.title), LINE_CAPS.title), outcomeWords(p.outcome)].join(" · "),
    );
  const entries = a.show.list.entries;
  const head = [
    m.failed ? "(This turn failed.)" : "",
    linePart(a.say.headline || a.say.detail, ASK_ANSWER_CAPS.headline),
    listed(
      `List (${a.show.list.style})`,
      entries.slice(0, LINE_CAPS.entries).map((e) => linePart(e, LINE_CAPS.entry)),
      entries.length - LINE_CAPS.entries,
    ),
    listed("Cards", cards, m.proposals.length - cards.length),
  ];
  const rows = a.show.items
    .slice(0, LINE_CAPS.rows)
    .map((it, i) =>
      [`${i + 1}.`, it.source.kind, oneLine(it.source.id), linePart(promptSafeName(it.source.label), LINE_CAPS.label)]
        .filter(Boolean)
        .join(" "),
    );
  const lineWith = (n: number) =>
    [...head, listed("Rows, in order", rows.slice(0, n), rows.length - n)].filter(Boolean).join(" ");
  let n = rows.length;
  while (n > 0 && lineWith(n).length > max) n--;
  return lineWith(n);
}

/**
 * The title of a thread an answer starts, when the search keeps no thread of the asker's: the search's name, as the
 * Leads rail names it. An answer's words ("Yes, include them") say nothing on their own in Ask's list; the search's
 * name is what the owner will look for there, and it is theirs, never the machine's sentence.
 */
export function titleFromSearch(name: string): string {
  return titleFromQuestion(name) || "A search's question";
}
