/**
 * The freedom check (D17 of the answers canvas): one function, seven questions in order, one answer, and always its reason.
 * Everything that would let Ask do something with no press asks this, and it answers the same wherever it is asked: a turn
 * that ended on a card, a lock screen, a yes. Today's rules were spread across role checks, modes and a line in the prompt.
 *
 *   1. Who's asking?              Their role, and whether Stop everything is on.
 *   2. Is it locked?              Money, consent, cold email, spending, settings, the team, removing: never alone.
 *   3. Whose idea is it?          Only the member's own words, or a rule the business set, may run alone (D33). A turn that read
 *                                 a stranger's words (a customer, a lead, a reviewer, a website, a file) runs only a record.
 *      Is anything new?           New words wait for a person once.
 *   4. How far does it reach?     A record over many people runs alone only under ASK_ALONE_MANY_MAX.
 *   5. What does your row say?    Sends it runs; Holds it runs and holds; Asks you asks; Stays quiet says no. The switch is off
 *                                 by default (D10), so nothing runs alone until the owner turns it on.
 *   6. Is now a good time?        Open hours, today's limit, recent Undos, and whether what it read has moved.
 *   7. Can it be taken back?      Without a clock, a Pause or an Undo, it asks.
 *
 * Pure: what it reads comes in as a world the caller read (server/ask/act/world.ts). A row a card has none of is no reason to
 * run: it asks.
 */
import type { PolicyClass } from "../config/workspace-config/policy-classes";
import { askTraitsOf, ASK_ALONE_MANY_MAX } from "./proposals/shapes";
import type { AskCardOrigin, AskProposal } from "./thread-words";

/** Do it, do it and hold it (its own clock or half hour), wait for a press, or say no. */
export type FreedomAnswer = "run" | "hold" | "ask" | "no";

/** Why, as a key each language says in its own words (surfaces/ask/words.ts `why`) and an action's record keeps. */
export const FREEDOM_REASONS = [
  "at_once",
  "role",
  "stopped",
  "locked",
  "idea",
  "follow_up",
  "strangers",
  "new_words",
  "many",
  "switch_off",
  "keep",
  "row_auto",
  "row_veto",
  "row_ask",
  "row_never",
  "no_row",
  "closed",
  "day_limit",
  "undos",
  "moved",
  "no_way_back",
] as const;
export type FreedomReason = (typeof FREEDOM_REASONS)[number];

/** What the check is asked against, read once for a card. */
export interface FreedomWorld {
  /** Whether the member's role may commit this kind (spec.needs). */
  may: boolean;
  /** The workspace's Autonomy rows: a class's mode, or absent where it has none. */
  rows: Partial<Record<PolicyClass, string>>;
  /** The switch (Settings › Autonomy): Ask may act on its own, following these rows. */
  alone: boolean;
  /** Stop everything is on: nothing goes out on its own until it is lifted. */
  stopped: boolean;
  /** Whether the business is open now, by its own clock. */
  open: boolean;
  /** How many things Ask has done alone today. */
  aloneToday: number;
  /** How many of them were undone this week. */
  undosThisWeek: number;
  /** Whether what the card read has moved since it was made (server/ask/act/recheck.ts). */
  moved: boolean;
  /** Whether the card's kind can be taken back (its spec's undo). */
  takesBack: boolean;
  /** Whether it sends words nobody here has seen yet. */
  newWords: boolean;
  /** How many people it touches, where it knows; null where it does not. */
  count: number | null;
}

/** The most Ask does alone in a day, past which it asks. A starting value, to tune once real numbers exist. */
export const ASK_ALONE_DAY_MAX = 50;
/** Undos in a week past which it stops running alone until someone looks: it is getting things wrong. */
export const ASK_ALONE_UNDOS_MAX = 2;

const answer = (a: FreedomAnswer, why: FreedomReason, row: PolicyClass | null = null) => ({ answer: a, why, row });
export type FreedomVerdict = ReturnType<typeof answer>;

/** The Autonomy row a card follows: its kind's, or the class its payload names. */
export function rowOf(p: Pick<AskProposal, "kind" | "payload">): PolicyClass | null {
  const { row } = askTraitsOf(p.kind);
  if (row === "own") {
    const cls = p.payload?.policy_class;
    return typeof cls === "string" ? (cls as PolicyClass) : null;
  }
  return row;
}

/** Whether an idea may ever run alone: the member's own words or a rule of the business's, and no stranger read first. */
const ideaMayRun = (origin: AskCardOrigin | undefined): FreedomReason | null => {
  if (!origin || origin.by === "idea") return "idea";
  if (origin.by === "follow_up") return "follow_up";
  return null;
};

/** The seven questions, asked in order of one card. Stops at the first that keeps it from running. */
export function freedomOf(p: Pick<AskProposal, "kind" | "payload" | "origin">, world: FreedomWorld): FreedomVerdict {
  const traits = askTraitsOf(p.kind);
  // Who's asking.
  if (!world.may) return answer("no", "role");
  // A stop, and a live call: that moment, whatever else is true.
  if (traits.alone === "at_once") return answer("run", "at_once");
  if (world.stopped) return answer("ask", "stopped");
  // Is it locked.
  if (traits.alone === "press") return answer("ask", "locked");
  // Whose idea, and is anything new.
  const idea = ideaMayRun(p.origin);
  if (idea) return answer("ask", idea);
  if (p.origin?.strangers && traits.alone !== "keep") return answer("ask", "strangers");
  if (world.newWords) return answer("ask", "new_words");
  // How far it reaches.
  if (traits.many && (world.count === null || world.count > ASK_ALONE_MANY_MAX)) return answer("ask", "many");
  // What the row says.
  if (!world.alone) return answer("ask", "switch_off");
  const row = rowOf(p);
  let said: FreedomVerdict;
  if (traits.alone === "keep") said = answer("run", "keep");
  else if (row === null) return answer("ask", "no_row");
  else {
    const mode = world.rows[row];
    if (mode === "never") return answer("no", "row_never", row);
    if (mode === "auto") said = answer("run", "row_auto", row);
    else if (mode === "veto") said = answer("hold", "row_veto", row);
    else return answer("ask", "row_ask", row);
  }
  // Is now a good time.
  if (traits.reach !== "keeps" && !world.open) return answer("ask", "closed", row);
  if (world.aloneToday >= ASK_ALONE_DAY_MAX) return answer("ask", "day_limit", row);
  if (world.undosThisWeek >= ASK_ALONE_UNDOS_MAX) return answer("ask", "undos", row);
  if (world.moved) return answer("ask", "moved", row);
  // Can it be taken back.
  if (!world.takesBack) return answer("ask", "no_way_back", row);
  return said;
}
