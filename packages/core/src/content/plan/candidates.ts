/**
 * A week's candidates (the content loop PRD's 10.2, steps 2 and 3): for each reason to post and each goal, the story it
 * could tell with the footage at hand, scored openly, each part 0 to 1 with its reason. What no clip can tell becomes an
 * ask to film. Pure: the plan job (plan-week.ts) picks from what this answers.
 */
import {
  keysOf,
  type ContentGoal,
  type Opportunity,
  type PieceIntent,
  type PostKind,
  type ScorePart,
  type SlotScore,
} from "@chanlytics/contracts";

/** A photo or a clip the week could be made from, as the plan reads it. */
export interface FootageFact {
  id: string;
  kind: "image" | "video";
  /** What its look said it shows, a few words each. */
  shows: readonly string[];
  /** Its name, as the Library says it. */
  name: string;
  /** What its look found that would stop it being posted as it is ("too dark"); empty when nothing. */
  issues: readonly string[];
  /** When it came in. */
  at: string;
  /** Whether it went out in a post in the last 21 days. */
  postedRecently: boolean;
  /** Its best moments, where a clip has them (file_moments, or the look's own). */
  moments: number;
}

/** A goal as the plan reads it. */
export interface GoalFact {
  goal: ContentGoal;
  service: string | null;
  days: readonly string[];
  weight: number;
}

/** One story the week could tell: what it shows, why, from which footage, and how it scored. */
export interface Candidate {
  title: string;
  reason: string | null;
  kind: PostKind;
  fileId: string | null;
  opportunity: Opportunity | null;
  intent: PieceIntent;
  score: SlotScore;
  /** The day it is about, where it is about one. */
  day: string | null;
}

/** What a goal or a reason asks to be filmed when no clip can tell it. */
export interface FilmAsk {
  what: string;
  seconds: number;
  reason: string | null;
  opportunity: Opportunity | null;
}

const scorePart = (value: number, reason: string): { value: number; why: string } => ({
  value: Math.max(0, Math.min(1, Math.round(value * 100) / 100)),
  why: reason,
});

/** How much each part counts toward the total. Eligibility is a gate: a candidate no place takes scores nothing. */
const WEIGHTS: Readonly<Record<Exclude<ScorePart, "eligibility">, number>> = {
  relevance: 0.25,
  footage_fit: 0.25,
  novelty: 0.15,
  timeliness: 0.15,
  effort: 0.1,
  audience_fit: 0.05,
  expected_value: 0.05,
};

const totalOf = (parts: SlotScore["parts"]): number => {
  if (parts.eligibility.value === 0) return 0;
  const sum = keysOf(WEIGHTS).reduce((n, k) => n + parts[k].value * WEIGHTS[k], 0);
  return Math.round(sum * 100) / 100;
};

/** The goal an opportunity serves most, of those the owner set. */
const GOAL_OF: Readonly<Record<Opportunity["kind"], ContentGoal>> = {
  open_capacity: "fill_slow_days",
  new_review: "reviews",
  fresh_footage: "awareness",
  offer: "fill_slow_days",
  new_service: "introduce_service",
};

const goalFor = (goals: readonly GoalFact[], opportunity: Opportunity | null): GoalFact | null =>
  goals.find((g) => opportunity && g.goal === GOAL_OF[opportunity.kind]) ?? null;

const wordsOfService = (text: string): string[] =>
  text
    .toLowerCase()
    .split(/[^a-záéíóúñü0-9]+/i)
    .filter((w) => w.length > 2);

/** Whether a clip shows a service, by the words its look gave it. */
const shows = (file: FootageFact, service: string): boolean => {
  const want = wordsOfService(service);
  const has = new Set(file.shows.flatMap(wordsOfService));
  return want.length > 0 && want.every((w) => has.has(w));
};

/** How well a piece of footage could tell a story: a clip with moments best, a photo next, one with issues poorly. */
function footageFit(file: FootageFact): { value: number; why: string } {
  if (file.issues.length > 0) return scorePart(0.3, `Its look found: ${file.issues[0]}`);
  if (file.kind === "video")
    return file.moments > 0
      ? scorePart(0.9, "A clip with moments worth using")
      : scorePart(0.7, "A clip, no moment read yet");
  return scorePart(0.7, "A photo");
}

/** What a scored candidate reads to score it. */
interface ScoreAsked {
  opportunity: Opportunity | null;
  goal: GoalFact | null;
  file: FootageFact | null;
  kind: PostKind;
  eligible: { value: boolean; why: string };
  /** Whether the reason was used in a post in the last 21 days. */
  reasonUsed: boolean;
}

/** A candidate's score, each part with its reason (PRD 10.2, step 3). */
export function candidateScoreOf(given: ScoreAsked): SlotScore {
  const { opportunity, goal, file } = given;
  const relevance = opportunity
    ? scorePart(
        opportunity.strength * (goal ? 1 : 0.7),
        goal ? `${opportunity.says}, which serves a goal you set` : opportunity.says,
      )
    : scorePart(
        goal ? 0.5 * goal.weight + 0.2 : 0.3,
        goal ? "It serves a goal you set" : "No reason this week but to be seen",
      );
  const parts: SlotScore["parts"] = {
    relevance,
    footage_fit: file ? footageFit(file) : scorePart(0.8, "Drawn from words, so no clip is needed"),
    eligibility: scorePart(given.eligible.value ? 1 : 0, given.eligible.why),
    novelty:
      (file?.postedRecently ?? false) || given.reasonUsed
        ? scorePart(0.3, "It went out in the last three weeks")
        : scorePart(1, "Not posted in the last three weeks"),
    audience_fit: scorePart(0.5, "Not known yet: no post has been measured"),
    effort:
      given.kind === "reel"
        ? scorePart(0.6, "A reel takes the most to make")
        : scorePart(0.8, "A picture is quick to make"),
    expected_value: scorePart(0.5, "Not known yet: too few posts to compare"),
    timeliness: opportunity?.day
      ? scorePart(1, `About ${opportunity.says.split(" ")[0] ?? "its day"}`)
      : scorePart(0.6, "Not tied to a day"),
  };
  return { total: totalOf(parts), parts };
}

/** The candidates' parts that say why a weak one was left out: its weakest part's reason. */
export const weakestWhy = (score: SlotScore): string =>
  (Object.values(score.parts).sort((a, b) => a.value - b.value)[0] ?? { why: "" }).why;

/** A title for what a clip or photo shows, as a row says it: its look's first words, else its own name. */
export const footageTitleOf = (file: FootageFact): string => {
  const first = file.shows[0];
  const raw = first ? first.charAt(0).toUpperCase() + first.slice(1) : file.name;
  return raw.length > 60 ? `${raw.slice(0, 59).trimEnd()}…` : raw;
};

/** The intent a candidate's piece carries (PRD 5.2): the goal, the reason, the day, the offer, the service. */
export const candidateIntentOf = (opportunity: Opportunity | null, goal: GoalFact | null): PieceIntent => ({
  goal: goal?.goal ?? (opportunity ? GOAL_OF[opportunity.kind] : "awareness"),
  opportunity_id: opportunity?.key ?? null,
  call_to_action: "message",
  day: opportunity?.kind === "open_capacity" ? opportunity.day : null,
  offer: opportunity?.kind === "offer" ? { says: opportunity.says, until: opportunity.until } : null,
  service: opportunity?.service ?? goal?.service ?? null,
});

/** What to film for a reason no clip can tell (PRD 10.2, step 5): a sentence and a length, never one trade's words. */
export function filmAskOf(opportunity: Opportunity | null, goal: GoalFact | null): FilmAsk {
  const service = opportunity?.service ?? goal?.service ?? null;
  if (service)
    return {
      what: `15 seconds of ${service}, start to finish`,
      seconds: 15,
      reason: opportunity?.says ?? null,
      opportunity,
    };
  if (opportunity?.kind === "open_capacity")
    return {
      what: "10 seconds of your work, from start to the finished look",
      seconds: 10,
      reason: opportunity.says,
      opportunity,
    };
  return {
    what: "10 seconds of the place as a client first sees it",
    seconds: 10,
    reason: opportunity?.says ?? null,
    opportunity,
  };
}

export { goalFor, shows };
