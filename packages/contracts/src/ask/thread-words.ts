/** Ask: thread words. */

import type { SchemaSet } from "../shared/schema-sets";
import { DAY_MS, MIN_MS, WEEK_MS } from "../shared/time";
import type { AskAnswer } from "./answer/shape";
import type { AskCitation } from "./citations";
import type { ProposalNeeds } from "./proposals/spec";
import type { AskLanguage } from "./language";

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
    // A message on file changed (the message sheet's review, 12 Nov 2026): its words, its name, put away, deleted.
    | "message_words"
    | "message_rename"
    | "message_away"
    | "message_delete"
    // Every verb a page commits is a card Ask may propose (the operator, 15 Oct 2026: one table, ask-proposals/).
    | "answer"
    | "answer_many"
    | "person_mode_many"
    | "note_many"
    | "person_add"
    | "person_merge"
    | "person_message"
    | "list_member"
    | "list_change"
    | "list_delete"
    | "sequence_step"
    | "sequence_step_remove"
    | "sequence_words"
    | "sequence_leave"
    | "sequence_add"
    | "sequence_move"
    | "lead_search_aim"
    | "sequence_send_decide"
    | "sequence_lead_words"
    | "sequence_send_said"
    | "sequence_draft"
    | "sequence_make"
    | "sequence_new"
    | "sequence_start"
    | "sequence_discard"
    | "sequence_end"
    | "sequence_test"
    | "sequence_voice"
    | "playbook_run"
    | "booking_request"
    | "fact_suggestion"
    | "call_hand_over"
    | "lead_stage"
    | "lead_mark"
    | "lead_later"
    | "leads_bulk"
    | "leads_check"
    | "lead_addressee"
    | "lead_list"
    | "lead_search_more"
    | "reach_out_make"
    | "reach_out_said"
    | "review_reply"
    | "review_reply_stop"
    | "follow_up"
    | "answer_style"
    // What Ask remembers (decision 0070): a line kept (Ask's own card, kept as the turn is saved), changed, forgotten.
    | "memory"
    | "memory_change"
    | "memory_forget"
    // A post made from a photo (decision 0099, step 3): the real picture, and Save.
    | "post"
    // A video made from the business's clips (decision 0122): its storyboard, and Make it.
    | "piece"
    // A made post put up at its places, now or at a time the owner said (content/publish.ts): where, when, its caption, and Post.
    | "publish"
    // A campaign that would reach no one: the one thing to fix first, with its door (playbooks campaignFixCard). It
    // commits nothing; its act is its door (the 30 Oct 2026 review, item 6).
    | "fix";
  /** The lowest role that may commit it, its spec's (ask-proposals/); the route re-checks on Approve. */
  needs: ProposalNeeds;
  title: string;
  /** The exact change, in the person's words. */
  summary: string;
  /**
   * The card in one plain line, where its maker gives one: what it does, to whom and when, as Today's row says it (a new
   * campaign's, contracts campaignLine); its sheet holds the rest, behind Details. A card without one shows its summary.
   */
  line?: string;
  /**
   * What the card does, as the database keeps it (jsonb), as any build wrote it, which each reader takes apart as it
   * reads it: the surface cache's fingerprint leaves it out (tooling/scripts/gen/surface-shapes.mjs).
   * @stored
   */
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
  /** The change as a sheet (AskCardSheet), where its maker gives one; a card without one draws its summary. */
  sheet?: AskCardSheet;
  /** Who had the idea (AskCardOrigin), absent on a card made before the stamp, which is drawn as asked and never runs alone. */
  origin?: AskCardOrigin;
  /** Set once the person acted on the card. */
  outcome?: AskProposalOutcome | null;
}

/**
 * A card's change as a sheet (the answer canvas, C1, from the 13 Oct 2026 plan's decision 4; a campaign's card was one
 * 678-character sentence): what holds it from sending, read first, then a row a fact in the order an owner checks them
 * (where, when, who it reaches, how it goes, how it sends, its message). Made from the values its summary is made of,
 * which stays its words for copy, reading aloud and a card stored before it. A row `aside` is a fact no press turns on
 * (how later batches go, what else they hear that week): the Line keeps it behind Details. What goes out, to whom, when
 * and by what channel is never aside, nor is what holds it.
 */
export interface AskCardSheet {
  holds: string[];
  rows: Array<{ label: string; value: string; aside?: boolean }>;
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
  /** What this step does, in one sentence as a person says it ("Tells your receptionist, until Nov 30."): the plan card's How it runs. */
  does?: string;
  /** What the plan's one card says of the whole, on its first step's stamp alone (AskPlanHead). */
  head?: AskPlanHead;
}

/**
 * What a plan's one card says over its steps (D2 of the answers canvas): what it is, how and until when, and the press. A
 * plan with none draws its first card's title and the plain press.
 */
export interface AskPlanHead {
  title: string;
  /** "By email, until Nov 30". */
  sub: string;
  /** Which word its press says (surfaces/ask/words.ts): an offer's "Start the offer", any other plan's "Do it". */
  press: "offer" | "plan";
  /** The message as a person reads it, by channel. */
  says: Array<{ channel: string; label: string; words: string }>;
  /** Who can hear it, where that is not everyone (contracts whoCanHearWords, D23). */
  hear?: string;
  /** What no step says: a channel left out and why, a note left for an owner, the room, the reminder. Under How it runs. */
  also?: string[];
}

/**
 * Who had the idea of a card (D33 of the answers canvas), stamped by the turn that made it: `asked`, the member's own words
 * this turn; `rule`, a rule of the business's written in code; `follow_up`, a follow-up the member set; `idea`, the model's
 * own. `strangers` says the turn read words from outside the business (a customer, a lead, a reviewer, a website, a file, an
 * outside tool) before it was made, so only a record may run alone. `from` names them, for the line that says why it waits.
 */
export interface AskCardOrigin {
  by: "asked" | "rule" | "follow_up" | "idea";
  strangers: boolean;
  from?: string | null;
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
  /**
   * A press the door refused because what the card is about has moved on (its 404 or 409): failed, and never offered
   * again, since no second press can do what the first could not. Absent on any other outcome.
   */
  moved?: boolean;
  /** A running send paused after its press (the plan card's Pause), so the card offers Resume. Absent otherwise. */
  paused?: boolean;
  /** Why it ran with no press, where a row allowed it (contracts freedomOf): the line under what it did. */
  why?: { reason: string; row: string | null };
}

/**
 * What the act door answers (POST ask/act, D15 of the answers canvas): what became of the card, as the turn now keeps it, the
 * calls it made, which the browser re-reads the surfaces for as it would had it sent them, and, where it stopped, its one
 * sentence and its one way forward (D37). `redraft`: the card is stale in a way asking again would mend.
 */
export interface AskActAnswer {
  ok: boolean;
  message: string;
  outcome: AskProposalOutcome | null;
  calls: Array<{ route: string; events: Array<{ type: string; detail?: Record<string, unknown> }> }>;
  forward: { to: string } | null;
  redraft?: boolean;
  /**
   * The door could not reach the verb's own route at all, so nothing was sent and nothing is kept: the press goes the way it
   * went from a browser, under the same key, so it can never act twice. A way down, should a deployment refuse its own calls.
   */
  walkHere?: boolean;
}

/** How long a committed card's undo stays open, for every verb whose route sets no window of its own (askUndoOpen). */
export const ASK_UNDO_MS = 10 * MIN_MS;

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
export function askCardLapsed(askProposal: Pick<AskProposal, "made_at" | "plan">, nowMs: number): boolean {
  const created = typeof askProposal.made_at === "string" ? Date.parse(askProposal.made_at) : NaN;
  return Number.isFinite(created) && nowMs - created > (askProposal.plan ? ASK_PLAN_FRESH_MS : ASK_CARD_FRESH_MS);
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
  /** Cards of earlier turns this one pressed on a yes (D18): what became of each, so the thread draws it at once. */
  pressed?: ReadonlyArray<{ messageId: string; proposalId: string; outcome: AskProposalOutcome }>;
  /** The answer as the Line draws it: set by the server from plan 3; absent on every answer made before (answerFromV1). */
  answer?: AskAnswer | null;
  /** The files a person's question came with; absent on a question with none. */
  files?: readonly AskAttached[];
}

/**
 * A file a question came with, as the thread draws it. A thread keeps the id alone, so what it says of a file is what the file
 * says now: its name after a rename, and null once it was removed.
 */
export interface AskAttached {
  id: string;
  name: string | null;
}
