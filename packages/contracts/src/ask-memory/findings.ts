/**
 * What Ask notices from the workspace's own facts, with no model (decision 0087): a sequence whose replies fell, and one
 * whose batches keep going out. Derived on each read and stored nowhere, so a finding closes itself when its
 * facts move and every member sees the same one, ready on arrival and at no cost. The morning's turn is left to what takes
 * judgement.
 *
 * Pure: the server reads the sequences and their batches, and the tests read the same fold.
 */
import { sequenceRoute } from "../sequences/sequence-address";
import type { BroadcastCounts, BroadcastState } from "../broadcasts/broadcasts";
import { plural } from "../shared/words";
import { ASK_IDEA_REST_DAYS, dayAfterDays } from "./lately";
import type { AskMorningCard } from "./morning";

/** How many batches in a row, none of them stopped, make a sequence worth asking less about. */
const STEADY_BATCHES = 3;

/** How many emails a batch needs behind it, and those before it together, for a change in replies to mean anything. */
const FELL_SENT = 10;
const FELL_BEFORE_SENT = 20;

/** How many batches stand for how it was going, and how far under them the last must fall. */
const FELL_BEFORE = 3;
const FELL_UNDER = 0.5;

/** A sequence as the fold reads it. */
interface FindingSequence {
  id: string;
  name: string;
  state: string;
  mode: string | null;
  first: { id: string } | null;
}

/** A batch as the fold reads it. */
interface FindingRun {
  sequence_id: string;
  state: BroadcastState;
  created_at: string;
  counts: Pick<BroadcastCounts, "sent" | "replied">;
}

/** Replies and emails, added up over batches. */
interface Earned {
  sent: number;
  replied: number;
}

/** What the fold found, the most worth acting on first. */
export type AskFinding =
  | { key: string; kind: "replies_fell"; sequenceId: string; name: string; last: Earned; before: Earned }
  | { key: string; kind: "steady"; sequenceId: string; name: string; stepId: string; batches: number };

/** A member's rests of what Ask noticed, by the card's id, each until a day (memberships.views, page `ask_found`). */
export type AskRested = Record<string, string>;

/** The page of memberships.views a member's rests are kept under (PUT views/:page). */
export const ASK_FOUND_VIEW = "ask_found";

/** The words of what Ask noticed: what happened, and what it asks. */
export const ASK_FINDING_WORDS = {
  repliesFell: {
    title: (name: string) => `Replies fell on ${name}`,
    line: (last: Earned, before: Earned) =>
      `${last.replied} of ${last.sent} replied to the last batch, ${before.replied} of ${before.sent} to those before it.`,
    door: "Look at it",
  },
  steady: {
    line: (batches: number) =>
      `Your last ${plural(batches, "batch", "batches")} all went out. Each could wait for you to stop it instead of asking.`,
  },
} as const;

/** A sequence's batches that finished, newest first: sent, or stopped before they went. */
const finishedOf = (runs: readonly FindingRun[], id: string): FindingRun[] =>
  runs
    .filter((r) => r.sequence_id === id && (r.state === "sent" || r.state === "canceled"))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

const earnedOver = (runs: readonly FindingRun[]): Earned => ({
  sent: runs.reduce((n, r) => n + r.counts.sent, 0),
  replied: runs.reduce((n, r) => n + r.counts.replied, 0),
});

/** Whether the last batch drew under half what the ones before it drew, with enough sent on both sides to say so. */
function repliesFell(last: Earned, before: Earned): boolean {
  if (last.sent < FELL_SENT || before.sent < FELL_BEFORE_SENT || before.replied === 0) return false;
  return last.replied / last.sent < (before.replied / before.sent) * FELL_UNDER;
}

/** What the sequences and their batches say, what hurts results first. */
export function askFindingsOf(sequences: readonly FindingSequence[], runs: readonly FindingRun[]): AskFinding[] {
  const fell: AskFinding[] = [];
  const steady: AskFinding[] = [];
  for (const s of sequences) {
    if (s.state !== "on") continue;
    const done = finishedOf(runs, s.id).filter((r) => r.counts.sent > 0 || r.state === "canceled");
    const [newest] = done;
    const sent = done.filter((r) => r.state === "sent");
    const [lastSent, ...rest] = sent;
    if (newest?.state === "sent" && lastSent) {
      const last = earnedOver([lastSent]);
      const before = earnedOver(rest.slice(0, FELL_BEFORE));
      if (repliesFell(last, before))
        fell.push({ key: `fell-${s.id}`, kind: "replies_fell", sequenceId: s.id, name: s.name, last, before });
    }
    const lastFew = done.slice(0, STEADY_BATCHES);
    if (s.mode === "ask" && s.first && lastFew.length === STEADY_BATCHES && lastFew.every((r) => r.state === "sent"))
      steady.push({
        key: `steady-${s.id}`,
        kind: "steady",
        sequenceId: s.id,
        name: s.name,
        stepId: s.first.id,
        batches: STEADY_BATCHES,
      });
  }
  return [...fell, ...steady];
}

/** What a finding's card id starts with: no turn holds one, so its outcome and its rest are kept elsewhere. */
const FINDING_ID = "finding-";

/** A finding's card id: stable, so its row keeps its place and a rest finds it again. */
export const findingCardId = (f: Pick<AskFinding, "key">): string => `${FINDING_ID}${f.key}`;

/** Whether a card is a finding's rather than a morning's. */
export const isFindingCard = (card: Pick<AskMorningCard, "id">): boolean => card.id.startsWith(FINDING_ID);

/** Replies falling, as a card: nothing to approve, only the door to where the sequence is changed (a `fix` card). */
export function repliesFellCard(f: Extract<AskFinding, { kind: "replies_fell" }>): AskMorningCard {
  const W = ASK_FINDING_WORDS.repliesFell;
  const line = W.line(f.last, f.before);
  return {
    id: findingCardId(f),
    kind: "fix",
    needs: "operator",
    title: W.title(f.name),
    summary: line,
    line,
    payload: { door: W.door, to: sequenceRoute(f.sequenceId) },
    undo: null,
  };
}

/** A member's rests as kept, or none where the view holds anything else. */
export function restedOf(view: unknown): AskRested {
  const rested: unknown = view && typeof view === "object" ? Reflect.get(view, "rested") : null;
  if (!rested || typeof rested !== "object") return {};
  const kept = Object.entries(rested as Record<string, unknown>);
  return Object.fromEntries(kept.filter((e): e is [string, string] => typeof e[1] === "string"));
}

/** Whether a member has set this card aside for now. */
export const isRested = (rested: AskRested, id: string, today: string): boolean => (rested[id] ?? "") > today;

/** The rests with this one added until a week from `today`, those that have run out let go. */
export function restedWith(rested: AskRested, id: string, today: string): AskRested {
  const live = Object.entries(rested).filter(([, until]) => until > today);
  return Object.fromEntries([...live, [id, dayAfterDays(today, ASK_IDEA_REST_DAYS)]]);
}
