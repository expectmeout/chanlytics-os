/**
 * What Ask has offered lately, across every member's mornings (decision 0087). A morning is a thread of its member's own,
 * so what became of a card reached no later morning and no teammate: a card set aside on Monday came back on Tuesday, and
 * two operators were each offered the same thing. Read before a morning, it is told what not to offer again; read on
 * Today, it leaves out what was settled and says what came of what was approved.
 *
 * Pure: the server reads the mornings, and the tests read the same fold.
 */
import type { AskProposal, AskProposalOutcome } from "../thread-words";
import type { BroadcastCounts } from "../../campaigns/broadcasts/broadcasts";

/** How long an idea set aside rests: a week, as every "not now" Today offers (setup/put-off.ts). */
export const ASK_IDEA_REST_DAYS = 7;

/** How far back a morning looks: long enough to outlast a rest. */
export const ASK_LATELY_DAYS = 14;

/** How many lines a morning is told, newest first, and how many Today shows of what came of it. */
const LATELY_TOLD = 12;
const LATELY_SHOWN = 3;

/** How much of a title a morning is told: enough to know it again. */
const TITLE_TOLD = 90;

/** One morning as the server read it: its day, whether it is this member's, and the cards its answer holds. */
export interface AskMorningRead {
  day: string;
  mine: boolean;
  proposals: unknown;
}

/** A card a morning offered, and what became of it. */
export interface AskIdeaSeen {
  title: string;
  day: string;
  mine: boolean;
  state: AskProposalOutcome["state"] | "waiting";
  receipt: string;
  made: { kind: string; id: string } | null;
  /** What came of it, read off what it made ("Last batch: 20 sent, 3 replied"); null where nothing says. */
  result: string | null;
}

/** What came of an idea approved lately, as Ask found says it. */
export interface AskLately {
  title: string;
  said: string;
}

/** A stored card with a title and a kind; anything else is no card. */
const isCardRead = (v: unknown): v is AskProposal =>
  !!v &&
  typeof v === "object" &&
  typeof Reflect.get(v, "title") === "string" &&
  typeof Reflect.get(v, "kind") === "string";

/** The cards of the mornings read, newest first. */
export function ideasSeenOf(mornings: readonly AskMorningRead[]): AskIdeaSeen[] {
  return [...mornings]
    .sort((a, b) => b.day.localeCompare(a.day))
    .flatMap((m) =>
      (Array.isArray(m.proposals) ? m.proposals : []).filter(isCardRead).map((p) => ({
        title: p.title,
        day: m.day,
        mine: m.mine,
        state: p.outcome?.state ?? "waiting",
        receipt: p.outcome?.receipt ?? "",
        made: p.outcome?.made ?? null,
        result: null,
      })),
    );
}

/** A day `n` days after another, both YYYY-MM-DD. */
export function dayAfterDays(day: string, count: number): string {
  const [y = 1970, m = 1, d = 1] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + count)).toISOString().slice(0, 10);
}

/** A batch as what came of an idea reads it. */
interface ResultRun {
  sequence_id: string;
  created_at: string;
  counts: Pick<BroadcastCounts, "sent" | "replied">;
}

/** What each idea approved earned so far, where what it made is a sequence with a batch that has sent. */
export function ideasWithResults(seen: readonly AskIdeaSeen[], runs: readonly ResultRun[]): AskIdeaSeen[] {
  const sent = runs.filter((r) => r.counts.sent > 0).sort((a, b) => b.created_at.localeCompare(a.created_at));
  return seen.map((s) => {
    const created = s.state === "done" ? s.made : null;
    const last = created ? sent.find((r) => r.sequence_id === created.id) : undefined;
    return last ? { ...s, result: `Last batch: ${last.counts.sent} sent, ${last.counts.replied} replied` } : s;
  });
}

/** Titles Today leaves out on `today`: set aside within their rest, or already approved by anyone within it. */
export function settledTitles(seen: readonly AskIdeaSeen[], today: string): ReadonlySet<string> {
  return new Set(
    seen
      .filter((s) => (s.state === "dismissed" || s.state === "done") && dayAfterDays(s.day, ASK_IDEA_REST_DAYS) > today)
      .map((s) => s.title),
  );
}

/** A state in the words a morning is told it. */
const LATELY_WORDS: Record<AskIdeaSeen["state"], string> = {
  waiting: "not answered",
  dismissed: "set aside",
  done: "approved",
  undone: "approved, then undone",
  failed: "tried, and it failed",
};

/** What a morning is told of the mornings before it and of a teammate's today, or "" where there were none. */
export function latelySaid(seen: readonly AskIdeaSeen[]): string {
  return seen
    .slice(0, LATELY_TOLD)
    .map((s) => {
      const person = s.mine ? "" : ", a teammate's";
      const arrived = s.result ? `: ${s.result}` : "";
      return `${s.title.slice(0, TITLE_TOLD)} (${s.day}${person}, ${LATELY_WORDS[s.state]}${arrived})`;
    })
    .join("; ");
}

/** What came of the ideas approved within a rest, newest first: what they earned, else what the press did. */
export function latelyRows(seen: readonly AskIdeaSeen[], today: string): AskLately[] {
  return seen
    .filter((s) => s.state === "done" && dayAfterDays(s.day, ASK_IDEA_REST_DAYS) > today && (s.result || s.receipt))
    .slice(0, LATELY_SHOWN)
    .map((s) => ({ title: s.title, said: s.result ?? s.receipt }));
}
