/**
 * What Ask's states page (ask-states.tsx) draws: a stand-in for Ask's routes, built on the bridge's real palette and
 * contracts' real readers, so only the wire is scripted and every sentence the page draws is made as the app makes it.
 *
 * Each state is one thing a person sees, opened the way the shell opens it (`ask:seed`), and each answers from here, so a
 * recording of the page is the same every time: no model, no network, and no clock but the page's own. A fixture takes
 * made-up values (CLAUDE.md, "No customer in the code").
 */
import {
  answerBlocks,
  answerCopy,
  answerRuns,
  answerSpoken,
  answerText,
  planGroupOf,
  type AskAnswer,
  type AskMessageVM,
  type AskProposal,
  type AskThreadVM,
} from "@chanlytics/contracts";
import type { AskApi } from "@/bridge/ask";
import { askPalette } from "@/bridge/ask/palette";

/** How a state's Line is opened, as the shell opens one (bridge/ask/line.tsx, `ask:seed`). */
export interface AskSeed {
  prompt?: string;
  thread?: string;
  about?: { kind: string; id: string; label: string };
}

/** The moment every message of the page is stamped with: an hour before the clock the recorder stands the page at. */
const AT_MS = Date.UTC(2026, 8, 28, 19, 2, 0);

const message = (id: string, role: "user" | "assistant", said: string, more: Partial<AskMessageVM> = {}) =>
  ({
    id,
    role,
    text: said,
    at: new Date(AT_MS).toISOString(),
    atMs: AT_MS,
    citations: [],
    followups: [],
    navigate: null,
    proposals: [],
    language: "en",
    ungrounded: false,
    tools: [],
    latencyMs: null,
    failed: false,
    ...more,
  }) as AskMessageVM;

const source = (label: string, to: string, kind = "person", door = true) => ({ label, kind, to, door });

/** An answer as the route stores one, which the Line reads as it stands (palette.ts `answer`). */
const answered = (say: { headline: string; detail?: string }, show = {}, doing = {}) => {
  const answer = {
    v: 2,
    form: "structured",
    say: { headline: say.headline, detail: say.detail ?? "", body: [] },
    show: { figures: [], items: [], breakdown: null, ...show },
    do: { open: null, next: [], ...doing },
    language: "en",
  } as unknown as AskAnswer;
  return { text: answerText(answer), answer };
};

/** The words of an answer that hold every block the Line draws: a heading, a list, a table, a quote, a callout. */
const RICH_WORDS = [
  "**Two people** wrote overnight, and *one* asked about Saturday.",
  "",
  "## Who to answer first",
  "",
  "1. [Ana Reyes](ask:clients/c-ana), who asked for Saturday",
  "2. Sam Ortiz, whose call was missed",
  "   - He left no message",
  "",
  "| Who | Waiting | Calls |",
  "| --- | --- | ---: |",
  "| Ana Reyes | 2 hours | 1 |",
  "| Sam Ortiz | 5 hours | 3 |",
  "",
  "> Do you have anything on Saturday morning?",
  "",
  "> [!WARNING] Saturday closes at noon.",
].join("\n");

const rich = answered(
  { headline: "Two people are waiting on you, both since this morning.", detail: RICH_WORDS },
  {
    list: { style: "bullets", entries: ["Ana Reyes asked about Saturday", "Sam Ortiz's call was missed"] },
    breakdown: {
      total: 12,
      label: "conversations this week",
      parts: [
        { label: "Answered", value: 9 },
        { label: "Waiting", value: 3, warn: true },
      ],
      source: source("Reports", "reports", "report"),
    },
    chart: {
      kind: "bars",
      label: "Calls by day",
      series: ["Calls"],
      points: [
        { label: "Mon", values: [4] },
        { label: "Tue", values: [7] },
      ],
      source: source("Reports", "reports", "report"),
    },
    figures: [
      { value: "12", label: "calls today", note: "3 missed", source: source("Live", "live", "call") },
      { value: "4", label: "booked", note: null, source: null },
    ],
    items: [
      {
        title: "Ana Reyes",
        meta: "2h ago",
        line: "Do you have anything on Saturday morning?",
        source: source("Ana Reyes", "clients/c-ana"),
      },
      { title: "Sam Ortiz", meta: "5h ago", line: "Missed call", source: source("Sam Ortiz", "clients/c-sam") },
      {
        title: "Sam Ortiz",
        meta: null,
        line: "The same person again",
        source: source("Sam", "clients/c-sam", "person", false),
      },
    ],
  },
  { open: { label: "Open the Inbox", to: "inbox", now: false }, next: ["Who else is waiting?", "Draft both replies?"] },
);

/** A reply, drawn as the bubble it will be; a campaign, as its sheet; a fix, with its door. */
const CARDS: AskProposal[] = [
  {
    id: "p-reply",
    kind: "reply",
    needs: "operator",
    title: "Reply to Ana Reyes",
    summary: "Yes, we have 10:30 on Saturday. Shall I hold it for you?",
    payload: { conversation_id: "c-1", text: "Yes, we have 10:30 on Saturday. Shall I hold it for you?" },
    undo: null,
    made_at: new Date(AT_MS).toISOString(),
  } as unknown as AskProposal,
  {
    id: "p-campaign",
    kind: "playbook",
    needs: "operator",
    title: "Campaign: Reminder",
    summary: "The day before an appointment · Daily, 10:00 AM · 6 people tomorrow",
    payload: { trigger: "quiet_30", name: "Reminder", channels: ["whatsapp"] },
    undo: "Pause it",
    made_at: new Date(AT_MS).toISOString(),
    sheet: {
      holds: ["WhatsApp waits: its version goes to WhatsApp for review when you approve."],
      rows: [
        { label: "Moment", value: "The day before an appointment" },
        { label: "Runs", value: "Daily, 10:00 AM" },
      ],
      quotes: [{ label: "WhatsApp", words: "Hi Ana, see you tomorrow at 10:30 at Harbor Studio." }],
    },
  } as unknown as AskProposal,
  {
    id: "p-fix",
    kind: "fix",
    needs: "operator",
    title: "Connect your calendar",
    summary: "Ask reads your openings from it.",
    payload: { to: "admin/integrations", door: "Open Connections" },
    undo: null,
    made_at: new Date(AT_MS).toISOString(),
  } as unknown as AskProposal,
];

const outcome = (state: string, receipt: string, undo: unknown = null) => ({ state, receipt, atMs: AT_MS, undo });

/** The same cards as they stand once acted on: sent with its take-back open, approved with its undo, and set aside. */
const DECIDED: AskProposal[] = [
  { ...CARDS[0], undo: "Undo", outcome: outcome("done", "Sent to Ana Reyes.", { kind: "send" }) },
  { ...CARDS[1], outcome: outcome("done", "Reminder is on.", { kind: "playbook" }) },
  { ...CARDS[2], outcome: outcome("dismissed", "Not now") },
  { ...CARDS[0], id: "p-failed", outcome: outcome("failed", "That thread has closed.") },
] as AskProposal[];

const card = answered(
  { headline: "Ana asked about Saturday, and I have drafted the reply." },
  {},
  {
    next: ["Change the time?"],
  },
);
const receipt = answered({ headline: "Done: the reply went and the reminder is on." });

/** A long thread, so its newest question can stand out of sight and Latest is offered. */
const longer = Array.from({ length: 6 }, (_, k) => [
  message(`u-${k}`, "user", `Question ${k + 1} about this week?`),
  message(`a-${k}`, "assistant", "", answered({ headline: `Answer ${k + 1}, in a line of its own.` })),
]).flat();

const thread = (id: string, title: string, messages: AskMessageVM[]) => ({
  thread: { id, title, scope: null, lastAtMs: AT_MS, createdAtMs: AT_MS },
  messages,
});

const THREADS = {
  "th-answer": thread("th-answer", "Who needs me right now?", [
    message("u-1", "user", "Who needs me right now?"),
    message("a-1", "assistant", "", rich),
  ]),
  "th-card": thread("th-card", "Answer Ana for me", [
    message("u-2", "user", "Answer Ana for me"),
    message("a-2", "assistant", "", { ...card, proposals: CARDS }),
  ]),
  "th-receipt": thread("th-receipt", "Answer Ana for me", [
    message("u-3", "user", "Answer Ana for me"),
    message("a-3", "assistant", "", { ...receipt, proposals: DECIDED }),
  ]),
  "th-long": thread("th-long", "This week", longer),
} as Record<string, { thread: AskThreadVM; messages: AskMessageVM[] }>;

const LISTED = Object.values(THREADS).map((t) => t.thread);

/** The question that streams and never lands, and the one whose connection drops. */
export const STREAMING = "Who called today?";
export const DROPPED = "Is anyone waiting?";

/** A turn's script: what its stream sends, and whether it ever ends. */
const scripted = (text: string, on: (ev: never) => void): Promise<void> => {
  if (text === DROPPED) {
    on({ t: "thread", id: "th-dropped", title: text } as never);
    on({ t: "error", text: "Network error — nothing was asked." } as never);
    return Promise.resolve();
  }
  on({ t: "thread", id: "th-streaming", title: text } as never);
  on({ t: "trace", text: "Read today's calls" } as never);
  on({ t: "say", headline: "Three people called today, and", detail: "" } as never);
  on({ t: "delta", text: "" } as never);
  return new Promise(() => undefined);
};

/** Today's queue, as the palette reads who is waiting: two people, so the home draws its pills and Brief me. */
const TODAY = {
  queue: {
    rows: [
      {
        id: "q-1",
        kind: "hold",
        conversationId: "c-1",
        callId: null,
        who: "Ana Reyes",
        channel: "sms",
        when: "2h",
        sentence: "Ana Reyes asked about Saturday",
        quoted: null,
        cta: { to: "inbox/th-c-1" },
      },
      {
        id: "q-2",
        kind: "hold",
        conversationId: "c-2",
        callId: null,
        who: "Sam Ortiz",
        channel: "sms",
        when: "5h",
        sentence: "Sam Ortiz's call was missed",
        quoted: null,
        cta: { to: "inbox/th-c-2" },
      },
    ],
  },
  needsYou: { count: 2 },
};

/** A storage of the page's own, so no state leaves anything for the next. */
const memoryStorage = (): Storage => {
  const kept = new Map<string, string>();
  return {
    getItem: (k: string) => kept.get(k) ?? null,
    setItem: (k: string, v: string) => void kept.set(k, v),
    removeItem: (k: string) => void kept.delete(k),
  } as Storage;
};

/** Ask's calls, as installAsk composes them, with the wire scripted. */
export function askWorld(win: Window): AskApi {
  Object.assign(win, { TODAY_DATA: TODAY });
  const palette = askPalette(win, memoryStorage());
  const quiet = () => undefined;
  return {
    ...palette,
    answerText,
    answerBlocks,
    answerRuns,
    answerCopy,
    answerSpoken,
    planGroupOf,
    quick: () => null,
    threads: async () => LISTED,
    thread: async (id: string) => THREADS[id] ?? { missing: true },
    send: (input: { text: string }, on: (ev: never) => void) => scripted(input.text, on),
    deleteThread: async () => true,
    outcome: async () => true,
    context: () => null,
    warm: async () => undefined,
    warmModel: quiet,
    keepQuick: async () => null,
    commit: async () => ({ ok: true, receipt: "Done." }),
    commitPlan: async () => ({ steps: [] }),
    undo: async () => ({ ok: true, receipt: "Undone." }),
    undoOpen: () => true,
    cardOpenRoute: () => "inbox",
    editReply: quiet,
    canSpeak: () => true,
    state: () => "idle",
    watchSpeech: () => quiet,
    stopSpeaking: quiet,
    readySpeech: quiet,
    speak: async () => undefined,
    waitAloud: quiet,
    answerAloud: async () => undefined,
    followUpsDue: () => [],
    readFollowUps: async () => [],
  } as unknown as AskApi;
}
