/**
 * Ask: the workspace assistant, as a contract.
 *
 * What lives here is everything about Ask that is pure and shared: its limits,
 * the cards (what each kind does is its spec, in ask-proposals/), the Line's
 * jump index and suggestions, and the three questions answered without a
 * model. A citation -- its kinds, the rule that keeps it honest, where a row
 * opens -- is citations.ts's; the answer -- its shape and how it is read back
 * -- ask-answer.ts's, and the format the model writes it in answer-format.ts's.
 * The route that runs the model lives in the dashboard; the Line that shows
 * the answer lives in the legacy pages; both read from here.
 *
 * This module holds the limits, the message and its cards (and what became of each), where a question is asked
 * from: the row in view (AskScope, scopeFromRoute) and the pages Ask knows it is on (ASK_SURFACES), and the shapes of
 * what a read hands a plan of Ask's (MessageRead). The rest is beside it: the languages and the guess at a question's
 * (ask-language.ts), the rules an answer's text passes (answer-text.ts), the jump index (ask-jump.ts), the suggestions
 * (ask-suggestions.ts), the three questions answered without a model (ask-fast-paths.ts) and the settings a card may
 * change (ask-settings-change.ts).
 */
import type { SchemaSet } from "../shared/schema-sets";
import { DAY_MS, MIN_MS, WEEK_MS } from "../shared/time";
import type { AskAnswer } from "./ask-answer";
import type { AskCitation } from "./citations";
import type { ProposalNeeds } from "../ask-proposals/spec";
import { parseLeadsRoute } from "../leads/lead-plan";
import { parsePipelineRoute } from "../deals/pipeline/pipeline-views";
import { pipelinePersonOf } from "../deals/pipeline/pipeline-vm";
import { personRouteOf } from "../person-page/route";
import type { AskLanguage } from "./ask-language";
import type { ReachOutChainDto } from "../reach-out/reach-out-dtos";
import type { TemplateStatus } from "../shared/enums";
import type { VersionChannel } from "../templates/message-versions";
import type { TemplateCategoryChoice } from "../templates/templates";

/* ------------------------------------------------------------------ limits */

/** One question, in characters. Longer than this is a document, not a question. */
export const ASK_MAX_CHARS = 1000;
/** Tool rounds per turn: reads, then the answer, the last forced to finish. Three since the page rides in (D10). */
export const ASK_MAX_ROUNDS = 3;
/** End to end, under the route's sixty-second ceiling. */
export const ASK_TURN_BUDGET_MS = 45_000;
/**
 * The most the owner's tools block may be, in characters as the model is sent it (66,050 on 11 October 2026; 70,426 on
 * 12 October, after the review of Ask's campaign cards, its reads and its plan; 72,542 on 13 October, the lead search
 * proposing named people at companies too, the people card's, 00430; 73,558 on 15 October, Ask reading the sequences
 * as their page does, decision 0060; 74,273 the same day, Ask changing a sequence's steps by its page's own verbs,
 * propose_campaign's action sequence).
 */
export const ASK_TOOLS_CHARS_CEILING = 74_500;
/**
 * The longest the voice door lets pass with nothing speakable sent: ElevenLabs cuts a custom LLM whose stream goes
 * quiet for 15 s (its ceiling) and asks again, so while the model is quiet the door sends the vendor's own buffer words
 * every ten (docs/superpowers/specs/2026-10-03-ask-spoken-spike.md, runs B5 to B9).
 */
export const ASK_VOICE_PULSE_MS = 10_000;
/**
 * The longest the voice door waits for the model's first speakable words before it says "One moment… " itself (the
 * platform's own filler is off: its words reached the chat as the answer's head).
 */
export const ASK_VOICE_FIRST_WORDS_MS = 2_500;
/**
 * A spoken turn's claim may be taken again this long after it was made: the turn's budget and a margin, so a request
 * repeated just as the owner's budget ends is not run a second time.
 */
export const ASK_VOICE_CLAIM_STALE_MS = MIN_MS;
/**
 * The least life the member's token must have when a voice session starts: the session's own ceiling (ten minutes,
 * the agent's `max_duration_seconds`; elevenlabs-agent.test.mjs holds the two together) and a margin. The browser
 * refreshes a shorter one first, so the brain door opens the member to the end. It was thirty-five minutes while a
 * conversation could run thirty, which put a refresh's round trip before most presses of a one-hour token.
 */
export const ASK_VOICE_TOKEN_MIN_MS = 15 * MIN_MS;
/**
 * Ask's one voice, wherever it speaks: the agent's conversation (tooling/scripts/voice/elevenlabs-agent-config.mjs)
 * and the speech route that reads a brief or an answer aloud (apps/edge/lib/voice/ask-voice.ts). Ruben's pick, 4 Oct
 * 2026: "Mark - Natural Conversations", from the account's library. One constant, so the two never drift.
 */
export const ASK_VOICE_ID = "UgBBYS2sOqTuMpoF3BR0";
/**
 * The model Ask's voice speaks on, in both pipes (the agent's conversation and the one-way speech): Turbo v2, the
 * one of the two the vendor allows an English agent (Turbo v2 or Flash v2) that this voice is high quality on. One
 * model, so a brief and a spoken answer sound the same. The vendor marks Turbo v2 deprecated (4 Oct 2026) and still
 * serves it, and holds the agent to it regardless; a move is one constant, after a listen.
 */
export const ASK_VOICE_MODEL = "eleven_turbo_v2";
/** The most one speech request reads aloud: a brief runs 400 to 800 characters, an answer's say under 600. */
export const ASK_SPEECH_MAX_CHARS = 1500;
/** What a clip read aloud is: Today's brief, or an answer's say. For the log alone; both are read the same way. */
export const SPEECH_PURPOSES = ["brief", "answer"] as const;
export type SpeechPurpose = (typeof SPEECH_PURPOSES)[number];
/**
 * How a voice session ended, the browser's word, one of a closed set the row keeps (00300, 00302): a press
 * (Clear), a typed question, another use of the voice in its place, the Line closing, the far side
 * ending it, a start that never came up, or a minute with nothing asked (`idle`, since the hold is the one mic and the
 * session waits silently between questions). The voice doctor groups by it; "stopped" said nothing.
 */
export const VOICE_END_REASONS = ["button", "typed", "superseded", "navigated", "vendor", "start", "idle"] as const;
export type VoiceEndReason = (typeof VOICE_END_REASONS)[number];
/** Whether a word is one of the set: an older bundle's, or the vendor's own, is not, and is kept on a log line alone. */
export const isVoiceEndReason = (word: string | null | undefined): word is VoiceEndReason =>
  (VOICE_END_REASONS as readonly string[]).includes(word ?? "");
/**
 * How long a voice session waits with nothing asked before the browser ends it (`idle`): a minute, long enough for a
 * follow-up, short enough that a session left open costs a minute of the vendor's and not ten. The agent's own
 * re-engage ("..." at its turn timeout) resets the vendor's own after-last-message clock, so this clock is the end.
 */
export const ASK_VOICE_IDLE_MS = MIN_MS;
/**
 * How long a lift waits for a session that is still connecting before the words go the typed way instead (the text
 * turn, then the clip): the connection starts on the press and takes two to four seconds; most holds outlast it.
 */
export const ASK_VOICE_UP_WAIT_MS = 2_500;
/** The longest a browser's timing may claim on a session's end: ten minutes, the conversation's own ceiling. */
export const ASK_VOICE_TIMING_MAX_MS = 10 * MIN_MS;
/**
 * The most one round may write: its thinking, its tool calls and its answer
 * together. One number, read by the loop's request and by the edge's clamp on
 * Ask, so the two cannot drift again: the loop asked for 2400 while the edge
 * clamped every request to 2000, so 2000 was the ceiling a round really had.
 * 4000 since the lead plan's card was cut mid-argument at 2000 (D10); an older edge clamps to its own copy.
 */
export const ASK_MAX_TOKENS = 4000;
/**
 * The most a warm may write (server/ask/warm.ts): a warm is a turn's own head sent ahead of the question so the
 * model's cache is written before the question arrives, and what it writes back is thrown away. The API takes no
 * request for nothing at all beside an answer format and a stream, so it is the least the gateway lets a request ask
 * for; the edge clamps a warm to it, whatever the request says.
 */
export const ASK_WARM_MAX_TOKENS = 64;
/**
 * Ask's own daily token budget per workspace, apart from the receptionist's.
 * Counted on uncached input, cache writes and output (ask_tokens_day, 00368);
 * a cache read is not counted. A write is counted because it is input the
 * model was sent, billed above uncached input: a warm (`ask_warm`) writes a
 * turn's head, some thirty thousand tokens, and counted under a hundred while
 * writes were not, so warms were the one thing the day did not bound.
 *
 * Counting them, the number doubled with them (1.5M before). A turn costs two
 * to eight thousand uncached input and output tokens, and about one question
 * in three misses the head and writes it again (the fortnight to 5 October):
 * a busy owner's sixty questions come to some 1.1M to 1.6M counted, and 1.8M
 * when every one is more than the cache's five minutes from the last. The cap
 * keeps that day inside it with room, and still stops a loop of warms at a
 * hundred heads. The first cap (400k) was spent by a day of eval runs and
 * refused the palette until the window rolled.
 */
export const ASK_TOKENS_DAY = 3_000_000;
/** How much of the workspace one read may return. The words stay the pages' words. */
export const ASK_CAPS = {
  threads: 20,
  messages: 30,
  messagesMore: 80,
  calls: 20,
  transcript: 40,
  people: 12,
  citations: 6,
  followups: 3,
  needsRows: 10,
} as const;

/* ------------------------------------------------------------ the message */

export type AskRole = SchemaSet<"ask_messages.role">;

/**
 * The Inbox verbs the assistant may propose on a thread. One list, read by
 * the proposer on the server and the committer in the browser, so a verb
 * cannot be proposable in one and unknown to the other.
 */
export const ASK_THREAD_VERBS = ["take_over", "hand_back", "snooze", "wake", "archive", "resolve"] as const;
export type AskThreadVerb = (typeof ASK_THREAD_VERBS)[number];

/** A proposal the model made; a card the person may approve. Executed by the client through the verbs. */
export interface AskProposal {
  id: string;
  kind:
    | "reply"
    | "steer"
    | "thread_verb"
    | "person_mode"
    | "policy"
    | "settings"
    | "whisper"
    | "invite"
    | "broadcast"
    | "playbook"
    | "lead_search"
    | "people_search"
    | "reach_out_add"
    | "deal"
    | "note"
    | "person_details"
    | "list"
    | "run"
    | "playbook_channels"
    | "playbook_change"
    | "message"
    | "sequence";
  /** The lowest role that may commit it, its spec's (ask-proposals/); the route re-checks on Approve. */
  needs: ProposalNeeds;
  title: string;
  /** The exact change, in the person's words. */
  summary: string;
  payload: Record<string, unknown>;
  /** What undo looks like, when the verb has one. */
  undo: string | null;
  /**
   * What a deal's card writes after the deal (0007, amended): its next step, a note of the team's with its day.
   * Beside the payload, never in it: a tab from before the step hands its payload to the deal route whole, and the
   * route refuses a key it does not know, so such a tab records the deal and leaves the step.
   */
  step?: { body: string; due_on: string } | null;
  /**
   * When the card was made (ISO), set by its builder. A card is approved while it is fresh (askCardLapsed): what it
   * would change was read then, and the list it sends to, the thread it answers and the setting it replaces all move.
   * Absent on a card made before this, which is not held to it.
   */
  made_at?: string;
  /** The plan the card is a step of, where Ask's plan made it (AskPlanStamp); absent on a card of no plan. */
  plan?: AskPlanStamp;
  /** Set once the person acted on the card. */
  outcome?: AskProposalOutcome | null;
}

/**
 * A card's place in a plan of Ask's (the marketing manager's spec §5.4): the plan's id, which step of how many it is,
 * and whether it sends nothing (silent: approved with the plan's other silent steps, commit.ts commitPlan) or is a send,
 * its own press. A step's commit goes under the step's key (`plan:<id>:<step>`), whichever way it is pressed, so the
 * plan pressed twice makes nothing twice; and a token in its payload (`@step:n`) is filled with what step n made. `after`
 * is the steps a send waits for (contracts PlanStep.after: every silent step), none for a silent one.
 */
export interface AskPlanStamp {
  id: string;
  step: number;
  of: number;
  silent: boolean;
  after: number[];
}

/** What became of a card, kept with the turn that proposed it. */
export interface AskProposalOutcome {
  state: "done" | "dismissed" | "failed" | "undone";
  /** One line: "Sent to Rosa", "Closed on Friday". */
  receipt: string;
  atMs: number;
  /** What Undo needs, when the verb has one: an id, a previous value. */
  undo?: Record<string, unknown> | null;
  /**
   * What the commit made that a later step of its plan names by its token (commit.ts CommitResult.made): kept with the
   * outcome so a plan's made is read back after a reload (planMadeOf). Null, or absent on an outcome saved before, where
   * it made nothing a token names.
   */
  made?: { kind: string; id: string } | null;
}

/** How long a committed card's undo stays open, for every verb whose route sets no window of its own (askUndoOpen). */
export const ASK_UNDO_MS = 10 * 60_000;

/** How long a card may be approved after it was made: a day. Past it, it is asked for again and made from what is true then. */
const ASK_CARD_FRESH_MS = DAY_MS;
/**
 * How long a plan's card may be approved: a week. A plan's send is set ahead (an offer's first day, at ten) and its
 * steps wait for one another, so a plan made on Monday for Friday is still approved on Thursday.
 */
const ASK_PLAN_FRESH_MS = WEEK_MS;

/**
 * Whether a card is too old to approve. A card left in a thread was approved days later against the list, the thread
 * or the setting as it stood when it was proposed: a three-day-old broadcast card sent to today's audience under
 * Monday's count. A plan's card has a week (ASK_PLAN_FRESH_MS), any other a day. False for a card that does not say when
 * it was made, or says it unreadably: nothing is refused on a guess.
 */
export function askCardLapsed(p: Pick<AskProposal, "made_at" | "plan">, nowMs: number): boolean {
  const made = typeof p.made_at === "string" ? Date.parse(p.made_at) : NaN;
  return Number.isFinite(made) && nowMs - made > (p.plan ? ASK_PLAN_FRESH_MS : ASK_CARD_FRESH_MS);
}

export interface AskMessageVM {
  id: string;
  role: AskRole;
  text: string;
  at: string;
  atMs: number;
  citations: Array<AskCitation & { to: string }>;
  followups: string[];
  navigate: { to: string; label: string; now?: boolean } | null;
  proposals: AskProposal[];
  language: AskLanguage;
  /** A figure with no read behind it. */
  ungrounded: boolean;
  /** The tools this turn ran, in order. */
  tools: string[];
  latencyMs: number | null;
  /** Model rounds the turn took; one means the page's context was enough. */
  rounds?: number | null;
  /** Set on a turn that could not be answered; the text says why. */
  failed: boolean;
  /** The answer as the Line draws it: set by the server from plan 3; absent on every answer made before (answerFromV1). */
  answer?: AskAnswer | null;
}

export interface AskThreadVM {
  id: string;
  title: string;
  lastAtMs: number;
  scope: AskScope | null;
}

/**
 * The kinds a scope may have: a page and the rows a page opens, each a kind a citation names (citations.ts) but the
 * run, a Broadcasts row, which its address spells so and a citation names a broadcast. A scope is what the person was
 * looking at, a fact about the turn; a citation is a claim about a row read, and builds the answer's grammar. A
 * playbook is a campaign open in its drawer on Campaigns (the moment spec, A1); a reach-out open there is the page at
 * that address (scopeFromRoute). An ad is one paid ad open in its drawer on Campaigns › Ads (`campaigns/ads:ad:<id>`,
 * decision 0049); nothing reads it on the server yet, so a turn about one is a turn about the page until the Ads read lands.
 */
export const ASK_SCOPE_KINDS = [
  "thread",
  "conversation",
  "call",
  "person",
  "page",
  "lead",
  "search",
  "run",
  "playbook",
  "ad",
] as const;
export type AskScopeKind = (typeof ASK_SCOPE_KINDS)[number];

/** What the person was looking at when they asked. Carried into the turn as a fact. */
export interface AskScope {
  kind: AskScopeKind;
  id: string;
  label: string;
}

const UUID = /^[0-9a-f-]{36}$/;

/**
 * The row People's address names (`clients/<param>`): a lead or a search on Leads, a person in the Pipeline's peek or on
 * their own page, on any of its tabs (`<id>/history`: person-page/route.ts personRouteOf, the one parse of a person's
 * address). The Leads and Pipeline peeks are read by their own pages' parsers (lead-plan.ts, pipeline.ts). Ask lost the
 * person on every tab but Overview (the wiring's second audit, S1-2, S5-1).
 */
function clientsScope(param: string, label: string | null | undefined): AskScope | null {
  const leads = parseLeadsRoute(`clients/${param}`);
  if (leads) {
    if (leads.peek) return { kind: "lead", id: leads.peek, label: label || "this lead" };
    if (leads.searchId) return { kind: "search", id: leads.searchId, label: label || "this search" };
    return null;
  }
  const pipeline = parsePipelineRoute(`clients/${param}`);
  // The peek names a row, and a further deal of theirs is a row of its own (0029): the person is whose it is.
  if (pipeline)
    return pipeline.peek
      ? { kind: "person", id: pipelinePersonOf(pipeline.peek), label: label || "this person" }
      : null;
  const { id } = personRouteOf(param);
  if (UUID.test(id)) return { kind: "person", id, label: label || "this person" };
  return null;
}

/** A reach-out as the page read it (GET reach-outs' chains): its first step's id, which its drawer's address names, and its name. */
type ChainRead = Pick<ReachOutChainDto, "root_id" | "name">;

/**
 * The scope a route implies, when it names a row: every address a page opens a row at. Conversations writes
 * `<tab>:<id>` as a row opens (pages/conversations.jsx cvRoute), Live `live/<callId>`, a run `broadcasts/run:<id>`,
 * a campaign `campaigns/moment:<id>`; People's, its Leads and Pipeline peeks among them, are clientsScope's, never a
 * second reading. A reach-out opens in a campaign's drawer at the same address, and no campaigns read holds it: where
 * the chains the page read (`chains`) name it, its scope is the page at that address, named for it, whose row the page's
 * context carries (the moment spec, A2), never a campaign nothing reads.
 */
export function scopeFromRoute(
  page: string,
  param: string | null | undefined,
  label?: string | null,
  chains?: readonly ChainRead[] | null,
): AskScope | null {
  if (!param) return null;
  if (page === "inbox" && param.startsWith("th-"))
    return { kind: "thread", id: param.slice(3), label: label || "this thread" };
  if (page === "conversations") {
    // A row on its tab, or a row alone (on All): the row is after the tab's colon.
    const row = param.includes(":") ? param.slice(param.indexOf(":") + 1) : param;
    if (row.startsWith("cv-")) return { kind: "call", id: row.slice(3), label: label || "this call" };
    if (UUID.test(row)) return { kind: "conversation", id: row, label: label || "this conversation" };
    return null;
  }
  if (page === "live" && UUID.test(param)) return { kind: "call", id: param, label: label || "this call" };
  if (page === "broadcasts" && param.startsWith("run:") && UUID.test(param.slice(4)))
    return { kind: "run", id: param.slice(4), label: label || "this run" };
  if (page === "campaigns" || page === "outbound") return campaignsScope(page, param, label, chains);
  if (page === "clients") return clientsScope(param, label);
  return null;
}

/**
 * Campaigns' rows: a campaign open in its drawer on the home (surfaces/campaigns/home/address.ts), and the old Playbooks
 * address it replaced; a reach-out open in the same drawer, which is the page at its address; and a paid ad open in its
 * drawer on Campaigns › Ads (contracts ads/address.ts: `ads:ad:<id>`, decision 0049).
 */
function campaignsScope(
  page: string,
  param: string,
  label: string | null | undefined,
  chains: readonly ChainRead[] | null | undefined,
): AskScope | null {
  if (param.startsWith("moment:") && UUID.test(param.slice(7))) {
    const id = param.slice(7);
    const chain = chains?.find((c) => c.root_id === id);
    if (chain) return { kind: "page", id: `campaigns/moment:${id}`, label: label || chain.name || "this reach-out" };
    return { kind: "playbook", id, label: label || "this campaign" };
  }
  if (page === "campaigns" && param.startsWith("ads:ad:") && UUID.test(param.slice(7)))
    return { kind: "ad", id: param.slice(7), label: label || "this ad" };
  return null;
}

/**
 * The pages Ask knows it is on. The route accepts exactly these; the prompt names them. Thirteen (the Phase 2 plan,
 * D1): the Pipeline, the Calendar, the campaign pages (Playbooks, Broadcasts, Messages) and Start are pages of their
 * own, no longer People's or "other".
 */
export const ASK_SURFACES = [
  "today",
  "inbox",
  "people",
  "leads",
  "conversations",
  "live",
  "reports",
  "settings",
  "pipeline",
  "calendar",
  "campaigns",
  "start",
  "other",
] as const;
export type AskSurface = (typeof ASK_SURFACES)[number];

/* ------------------------------------------------------------ what Ask reads */

/**
 * One message of the library as campaigns with action messages reads it (the dashboard's readers/templates.ts
 * messageReadsOf), and what a plan of Ask's is checked against: a name in a language, its category as a send judges a
 * yes (an authentication message is a utility one), each version on its channel with its row's status (a WhatsApp
 * version still in Meta's review among them; an email's or a text's is written approved), the numbered values it fills
 * with what each is called and most likely takes, and the campaigns that send it by name.
 */
export interface MessageRead {
  name: string;
  language: string;
  category: TemplateCategoryChoice;
  versions: { channel: VersionChannel; id: string; state: TemplateStatus }[];
  slots: { position: number; label: string; kind: string }[];
  used_by: { id: string; name: string }[];
}
