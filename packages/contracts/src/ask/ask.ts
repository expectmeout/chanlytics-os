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
 * This module holds the limits, the message and its cards (and what became of each), and where a question is asked
 * from: the row in view (AskScope, scopeFromRoute) and the pages Ask knows it is on (ASK_SURFACES). The rest is beside
 * it: the languages and the guess at a question's (ask-language.ts), the rules an answer's text passes
 * (answer-text.ts), the jump index (ask-jump.ts), the suggestions (ask-suggestions.ts), the three questions answered
 * without a model (ask-fast-paths.ts) and the settings a card may change (ask-settings-change.ts).
 */
import type { SchemaSet } from "../shared/schema-sets";
import { z } from "zod";
import type { AskAnswer } from "./ask-answer";
import type { AskCitation } from "./citations";
import type { ProposalNeeds } from "../ask-proposals/spec";
import { parseLeadsRoute } from "../leads/lead-plan";
import { parsePipelineRoute } from "../deals/pipeline/pipeline-views";
import type { AskLanguage } from "./ask-language";

/* ------------------------------------------------------------------ limits */

/** One question, in characters. Longer than this is a document, not a question. */
export const ASK_MAX_CHARS = 1000;
/** Tool rounds per turn: reads, then the answer, the last forced to finish. Three since the page rides in (D10). */
export const ASK_MAX_ROUNDS = 3;
/** End to end, under the route's sixty-second ceiling. */
export const ASK_TURN_BUDGET_MS = 45_000;
/**
 * The most one round may write: its thinking, its tool calls and its answer
 * together. One number, read by the loop's request and by the edge's clamp on
 * Ask, so the two cannot drift again: the loop asked for 2400 while the edge
 * clamped every request to 2000, so 2000 was the ceiling a round really had.
 * 4000 since the lead plan's card was cut mid-argument at 2000 (D10); an older edge clamps to its own copy.
 */
export const ASK_MAX_TOKENS = 4000;
/**
 * Ask's own daily token budget per workspace, apart from the receptionist's.
 * Counted on uncached input plus output. With the page's context riding into
 * every round behind its own cache breakpoint (a cache read is not counted),
 * a turn costs two to eight thousand such tokens; a busy owner
 * asking sixty questions stays well under this, and an eval run of the whole
 * case set fits several times over. The first cap (400k) was spent by a day
 * of eval runs and refused the palette until the window rolled.
 */
export const ASK_TOKENS_DAY = 1_500_000;
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
    | "deal"
    | "note"
    | "person_details"
    | "list"
    | "run";
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
  /** Set once the person acted on the card. */
  outcome?: AskProposalOutcome | null;
}

/** What became of a card, kept with the turn that proposed it. */
export interface AskProposalOutcome {
  state: "done" | "dismissed" | "failed" | "undone";
  /** One line: "Sent to Rosa", "Closed on Friday". */
  receipt: string;
  atMs: number;
  /** What Undo needs, when the verb has one: an id, a previous value. */
  undo?: Record<string, unknown> | null;
}

/** How long a committed card's undo stays open, for every verb whose route sets no window of its own (askUndoOpen). */
export const ASK_UNDO_MS = 10 * 60_000;

export const AskProposalOutcomeSchema = z.object({
  state: z.enum(["done", "dismissed", "failed", "undone"]),
  receipt: z.string().max(300).catch(""),
  atMs: z.number().catch(0),
  undo: z.record(z.string(), z.unknown()).nullable().optional(),
});

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
 * looking at, a fact about the turn; a citation is a claim about a row read, and builds the answer's grammar.
 */
export const ASK_SCOPE_KINDS = ["thread", "conversation", "call", "person", "page", "lead", "search", "run"] as const;
export type AskScopeKind = (typeof ASK_SCOPE_KINDS)[number];

/** What the person was looking at when they asked. Carried into the turn as a fact. */
export interface AskScope {
  kind: AskScopeKind;
  id: string;
  label: string;
}

const UUID = /^[0-9a-f-]{36}$/;

/**
 * The scope a route implies, when it names a row: every address a page opens a row at. Conversations writes
 * `<tab>:<id>` as a row opens (pages/conversations.jsx cvRoute), Live `live/<callId>`, a run `broadcasts/run:<id>`;
 * the Leads and Pipeline peeks are read by their own pages' parsers (lead-plan.ts, pipeline.ts), never a second one.
 */
export function scopeFromRoute(page: string, param: string | null | undefined, label?: string | null): AskScope | null {
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
  if (page === "clients") {
    const leads = parseLeadsRoute(`clients/${param}`);
    if (leads) {
      if (leads.peek) return { kind: "lead", id: leads.peek, label: label || "this lead" };
      if (leads.searchId) return { kind: "search", id: leads.searchId, label: label || "this search" };
      return null;
    }
    const pipeline = parsePipelineRoute(`clients/${param}`);
    if (pipeline) return pipeline.peek ? { kind: "person", id: pipeline.peek, label: label || "this person" } : null;
    if (UUID.test(param)) return { kind: "person", id: param, label: label || "this person" };
  }
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
