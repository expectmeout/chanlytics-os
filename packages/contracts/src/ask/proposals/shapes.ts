/**
 * What each kind of card is, in one table (decision D14 of the answers canvas, 9 Nov 2026): the shape it is drawn as, how
 * far it reaches, the Autonomy row it follows, whether it may ever run alone, and the word its press says. A new kind
 * cannot ship without its row (`satisfies Record<AskProposal["kind"], ...>`), and gets its layout, its press and its place
 * in the freedom check (ask/freedom.ts) from it. Seventy-two kinds are eight things a person learns once.
 *
 * Pure, and free of any spec: a page that draws a card reads this and nothing of how the card commits.
 */
import type { PolicyClass } from "../../config/workspace-config/policy-classes";
import { SECOND_MS } from "../../shared/time";
import type { AskProposal } from "../thread-words";

/**
 * The eight shapes: words to one person (say), words to many (send), a record where nothing leaves (keep), something that
 * spends to look (find), something waiting on an answer (decide), how the business runs (change), something to look at
 * (make), and the one thing stopping it (fix).
 */
export const ASK_CARD_SHAPES = ["say", "send", "keep", "find", "decide", "change", "make", "fix"] as const;
export type AskCardShape = (typeof ASK_CARD_SHAPES)[number];

/**
 * How far a card reaches, which decides how it may run (the canvas's Autonomy board): a record kept, one person, many
 * people, the public, money, how the business works, something gone for good, a call happening now, a stop.
 */
export const ASK_REACHES = ["keeps", "one", "many", "public", "spends", "how", "removes", "live", "stops"] as const;
export type AskReach = (typeof ASK_REACHES)[number];

/**
 * Whether a card may run with no press once the member's rows allow it: `at_once` goes on the word, whatever the rows say
 * (a whisper on a live call, a stop); `keep` is a record, done with its Undo; `row` follows its Autonomy row; `press` always
 * waits for a person (money, consent, new words, cold email, settings, removing).
 */
export type AskAlone = "at_once" | "keep" | "row" | "press";

/** The word on a card's press: what it does. The words are each language's own (surfaces/ask/words.ts `press`). */
export const ASK_PRESS_WORDS = [
  "send",
  "send_to",
  "post",
  "stop",
  "whisper",
  "ring_me",
  "test",
  "start",
  "run_now",
  "make",
  "keep",
  "save",
  "add",
  "change",
  "pause",
  "resume",
  "rewrite",
  "forget",
  "list",
  "take_over",
  "hand_back",
  "snooze",
  "wake",
  "archive",
  "resolve",
  "later",
  "take_out",
  "move",
  "find",
  "find_more",
  "check",
  "booked",
  "cant",
  "let_go",
  "skip",
  "let_through",
  "invite",
  "remove",
  "end",
  "throw_away",
  "delete",
  "merge",
  "open",
] as const;
export type AskPressWord = (typeof ASK_PRESS_WORDS)[number];

/** A kind's row in the one table. `row` "own" is the row its payload names (a sequence's class); null is none. */
export interface AskKindTraits {
  shape: AskCardShape;
  reach: AskReach;
  row: PolicyClass | "own" | null;
  alone: AskAlone;
  press: AskPressWord;
  /** A card that runs alone over several people does so only under ASK_ALONE_MANY_MAX. */
  many?: true;
}

/** How long a public reply's press holds before it posts: the same fifteen seconds a reply to one person takes back in. */
export const ASK_PUBLIC_HOLD_MS = 15 * SECOND_MS;

/** The most people a `keep` card over many may touch with no press: past it, it asks. A starting value, to tune. */
export const ASK_ALONE_MANY_MAX = 25;

const t = (
  shape: AskCardShape,
  reach: AskReach,
  row: AskKindTraits["row"],
  alone: AskAlone,
  press: AskPressWord,
  many?: true,
): AskKindTraits => ({ shape, reach, row, alone, press, ...(many ? { many } : {}) });

/** Every kind, once. A new kind fails the typecheck until it has a row here. */
export const ASK_KIND_TRAITS = {
  // Say: words to one person.
  reply: t("say", "one", "reply", "row", "send"),
  person_message: t("say", "one", "reply", "row", "send"),
  steer: t("say", "one", "reply", "row", "rewrite"),
  review_reply: t("say", "public", "reviews", "row", "post"),
  review_reply_stop: t("say", "stops", null, "at_once", "stop"),
  whisper: t("say", "live", null, "at_once", "whisper"),
  call_hand_over: t("say", "live", null, "at_once", "ring_me"),
  sequence_test: t("say", "keeps", null, "keep", "test"),
  // Send: words to many.
  broadcast: t("send", "many", null, "press", "send_to"),
  playbook: t("send", "many", "own", "row", "start"),
  playbook_run: t("send", "many", "own", "row", "run_now"),
  sequence_start: t("send", "many", "own", "row", "start"),
  reach_out_make: t("send", "many", null, "press", "make"),
  // Keep: a record, and nothing leaves.
  note: t("keep", "keeps", null, "keep", "keep"),
  note_many: t("keep", "keeps", null, "keep", "keep", true),
  deal: t("keep", "keeps", null, "keep", "keep"),
  person_add: t("keep", "keeps", null, "keep", "add"),
  person_details: t("keep", "keeps", null, "keep", "keep"),
  follow_up: t("keep", "keeps", null, "keep", "keep"),
  memory: t("keep", "keeps", null, "keep", "keep"),
  memory_change: t("keep", "keeps", null, "keep", "change"),
  memory_forget: t("keep", "keeps", null, "keep", "forget"),
  answer_style: t("keep", "keeps", null, "keep", "keep"),
  list: t("keep", "keeps", null, "keep", "list"),
  list_change: t("keep", "keeps", null, "keep", "change"),
  list_member: t("keep", "keeps", null, "keep", "change"),
  thread_verb: t("keep", "keeps", null, "keep", "take_over"),
  lead_stage: t("keep", "keeps", null, "keep", "change"),
  lead_later: t("keep", "keeps", null, "keep", "later"),
  leads_bulk: t("keep", "keeps", null, "keep", "change", true),
  lead_list: t("keep", "keeps", null, "keep", "list"),
  reach_out_said: t("keep", "keeps", null, "keep", "keep"),
  sequence_send_said: t("keep", "keeps", null, "keep", "keep"),
  message: t("keep", "keeps", null, "keep", "save"),
  sequence_draft: t("keep", "keeps", null, "keep", "save"),
  sequence_new: t("keep", "keeps", null, "keep", "open"),
  sequence_make: t("keep", "keeps", null, "keep", "make"),
  sequence_voice: t("keep", "keeps", null, "keep", "save"),
  lead_search_aim: t("keep", "keeps", null, "keep", "change"),
  sequence_leave: t("keep", "stops", null, "at_once", "take_out"),
  lead_mark: t("keep", "keeps", null, "keep", "keep"),
  // Find: spends something to look.
  lead_search: t("find", "spends", null, "press", "find"),
  people_search: t("find", "spends", null, "press", "find"),
  lead_search_more: t("find", "spends", null, "press", "find_more"),
  leads_check: t("find", "spends", null, "press", "check"),
  lead_addressee: t("find", "spends", null, "press", "find"),
  // Decide: something waits on an answer.
  booking_request: t("decide", "keeps", null, "press", "booked"),
  run: t("decide", "many", "own", "row", "let_go"),
  sequence_send_decide: t("decide", "one", null, "press", "let_through"),
  fact_suggestion: t("decide", "keeps", null, "press", "keep"),
  answer: t("decide", "how", null, "press", "change"),
  answer_many: t("decide", "how", null, "press", "change"),
  // Change: how the business runs.
  settings: t("change", "how", null, "press", "change"),
  policy: t("change", "how", null, "press", "change"),
  invite: t("change", "how", null, "press", "invite"),
  person_mode: t("change", "how", null, "press", "change"),
  person_mode_many: t("change", "how", null, "press", "change"),
  playbook_change: t("change", "how", null, "press", "change"),
  playbook_channels: t("change", "how", null, "press", "change"),
  sequence_step: t("change", "how", null, "press", "change"),
  sequence_words: t("change", "how", null, "press", "change"),
  sequence_lead_words: t("change", "how", null, "press", "change"),
  reach_out_add: t("change", "many", null, "press", "add"),
  sequence_add: t("change", "many", "own", "row", "add"),
  sequence_move: t("change", "many", "own", "row", "move"),
  sequence_step_remove: t("change", "removes", null, "press", "remove"),
  sequence_end: t("change", "removes", null, "press", "end"),
  sequence_discard: t("change", "removes", null, "press", "throw_away"),
  list_delete: t("change", "removes", null, "press", "delete"),
  person_merge: t("change", "removes", null, "press", "merge"),
  // Make: something to look at.
  post: t("make", "keeps", null, "press", "save"),
  piece: t("make", "keeps", null, "press", "make"),
  // Fix: its door, nothing to press.
  fix: t("fix", "keeps", null, "press", "open"),
} satisfies Record<AskProposal["kind"], AskKindTraits>;

/** A card's row in the table; a kind stored by an older release and gone since reads as a card that asks. */
export const askTraitsOf = (kind: string): AskKindTraits =>
  Object.prototype.hasOwnProperty.call(ASK_KIND_TRAITS, kind)
    ? ASK_KIND_TRAITS[kind as AskProposal["kind"]]
    : t("change", "how", null, "press", "change");

/** The word a thread's verb presses with: each says what it does. */
const THREAD_PRESS: Readonly<Record<string, AskPressWord>> = {
  take_over: "take_over",
  hand_back: "hand_back",
  snooze: "snooze",
  wake: "wake",
  archive: "archive",
  resolve: "resolve",
};

/**
 * What a card's press says, from its kind and, where one kind does several things, its payload: a pause is "Pause it", a
 * batch "Let it go" or "Skip it", a thread's verb its own. "Approve" is gone: the press says what it does.
 */
export function askPressOf(p: Pick<AskProposal, "kind" | "payload">): AskPressWord {
  const pl = p.payload ?? {};
  if (p.kind === "thread_verb") return THREAD_PRESS[String(pl.verb)] ?? "change";
  if (p.kind === "playbook_change") {
    if (pl.state === "paused") return "pause";
    if (pl.state === "running") return "resume";
    return "change";
  }
  if (p.kind === "run") return pl.verb === "skip" ? "skip" : "let_go";
  if (p.kind === "booking_request") return pl.booked === false ? "cant" : "booked";
  if (p.kind === "sequence_send_decide") {
    if (pl.decision === "rewrite") return "rewrite";
    return pl.decision === "include" ? "let_through" : "skip";
  }
  return askTraitsOf(p.kind).press;
}

/** How many people a press says it sends to, where the card knows the number: "Send to 41". Null, it says "Send it". */
export const askPressCount = (p: Pick<AskProposal, "kind" | "payload">): number | null =>
  p.kind === "broadcast" && typeof p.payload?.count === "number" && p.payload.count > 0 ? p.payload.count : null;

/** The cards whose words a person may ask to change in place: quick changes under them (shorter, warmer, another language). */
export const askCardHasWords = (kind: string): boolean => {
  const { shape } = askTraitsOf(kind);
  return shape === "say" || shape === "send" || kind === "message" || kind === "sequence_words";
};
