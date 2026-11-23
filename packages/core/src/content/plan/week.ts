/**
 * The week, planned (the content loop PRD's 10.2): from the reasons to post now, the goals, the cadence and the footage at
 * hand, the candidates are made and scored openly, the week is picked within the cadence, FEWER when the candidates are
 * weak and the week says why, and what no clip can tell becomes an ask to film (a sentence and a length, at most three a
 * week). Each pick is one creative at each place it goes, at a time on a day that is not quiet. Nothing is made and no
 * model is asked: drafting spends nothing (PRD 10.2.6, 13). The checks at the propose moment run over the slots as
 * drafted (the place takes it, the connection allows it), and a slot one refuses is blocked with its words and fix.
 *
 * Pure: the ids it gives creatives come from `newId`, and the clock is the input's.
 */
import {
  FOOTAGE_ASKS_MOST,
  cadenceOf,
  dayInZone,
  localToUtcMs,
  shiftKey,
  weekdayShortOf,
  type ContentCadence,
  type InstagramPostable,
  type Opportunity,
  type PostHeldWhy,
  type PostKind,
  type PostPlace,
  type SlotScore,
  type SlotState,
  type PieceIntent,
} from "@chanlytics/contracts";
import { evaluate, verdictWords } from "../policy/evaluate";
import {
  filmAskOf,
  goalFor,
  candidateIntentOf,
  candidateScoreOf,
  shows,
  footageTitleOf,
  weakestWhy,
  type Candidate,
  type FilmAsk,
  type FootageFact,
  type GoalFact,
} from "./candidates";

/** Below this a candidate is weak: the week leaves it out rather than fill the cadence with it. */
const WEAK_BELOW = 0.5;

/** What the plan reads, for one workspace and one week. */
export interface WeekAsked {
  zone: string;
  nowMs: number;
  /** The Monday the week starts on. */
  weekOf: string;
  cadence: ContentCadence | undefined;
  quietDays: readonly string[];
  /** Whether each place's connection takes a post now; a place not connected is planned for nowhere. */
  places: Readonly<Partial<Record<PostPlace, InstagramPostable>>>;
  goals: readonly GoalFact[];
  opportunities: readonly Opportunity[];
  footage: readonly FootageFact[];
  /** The reasons a post went out for in the last 21 days (an intent's opportunity_id). */
  usedReasons: ReadonlySet<string>;
}

/** One slot, as content_plan_write keeps it. */
export interface DraftedSlot {
  creative: string;
  place: PostPlace;
  kind: PostKind;
  at: string;
  title: string;
  reason: string | null;
  file_id: string | null;
  intent: PieceIntent | null;
  state: SlotState;
  blocked_why: PostHeldWhy | null;
  blocked_reason: string | null;
  ask: { what: string; seconds: number; opportunity_id: string | null } | null;
  score: SlotScore | null;
}

/** The week: its slots, and why it is smaller than the cadence asks, where it is. */
export interface WeekDrafted {
  slots: DraftedSlot[];
  fewer: string | null;
}

const connected = (given: WeekAsked, place: PostPlace): boolean =>
  (given.places[place] ?? "not_connected") !== "not_connected";

/** The footage that best tells a reason: a clip showing its service where it names one, else the best usable one. */
function footageFor(given: WeekAsked, opportunity: Opportunity | null, goal: GoalFact | null): FootageFact | null {
  const service = opportunity?.service ?? goal?.service ?? null;
  const pool = service ? given.footage.filter((f) => shows(f, service)) : given.footage;
  if (opportunity?.kind === "fresh_footage")
    return given.footage.find((f) => f.id === opportunity.evidence.file_id) ?? null;
  const ranked = [...pool].sort(
    (a, b) =>
      Number(a.postedRecently) - Number(b.postedRecently) ||
      a.issues.length - b.issues.length ||
      Number(b.kind === "video") - Number(a.kind === "video") ||
      b.at.localeCompare(a.at),
  );
  return ranked[0] ?? null;
}

/** The kind a candidate goes as: a clip a reel, a photo or words a picture post. */
const postKindOf = (file: FootageFact | null): PostKind => (file?.kind === "video" ? "reel" : "picture");

/** The reasons and goals the week tries to tell, each once: every opportunity, then each goal no opportunity served. */
function weekReasonsOf(given: WeekAsked): { opportunity: Opportunity | null; goal: GoalFact | null }[] {
  const byOpportunity = given.opportunities.map((opportunity) => ({
    opportunity,
    goal: goalFor(given.goals, opportunity),
  }));
  const served = new Set(byOpportunity.map((r) => r.goal?.goal).filter(Boolean));
  const goalsLeft = given.goals
    .filter((goal) => !served.has(goal.goal) && goal.goal !== "reviews")
    .map((goal) => ({ opportunity: null, goal }));
  return [...byOpportunity, ...goalsLeft];
}

/** Whether a connected place takes a post of this kind: a reel Instagram, a picture Instagram or Google. */
const eligibleOf = (given: WeekAsked, kind: PostKind): { value: boolean; why: string } => {
  const value =
    kind === "reel" ? connected(given, "instagram") : connected(given, "instagram") || connected(given, "google");
  return { value, why: value ? "A connected place takes it" : "No connected place takes it" };
};

/** How a row says a candidate: a review by its words, open time by its day, footage by what it shows. */
function candidateTitleOf(opportunity: Opportunity | null, file: FootageFact | null): string {
  if (opportunity?.kind === "new_review") return opportunity.says;
  if (opportunity?.kind === "open_capacity") return `${opportunity.says.split(" ")[0] ?? "This day"} has openings`;
  return file ? footageTitleOf(file) : "A post";
}

/** One reason as a candidate, scored; or what to film for it where no footage can tell it; or nothing. */
function candidateFor(
  given: WeekAsked,
  reason: { opportunity: Opportunity | null; goal: GoalFact | null },
  usedFiles: Set<string>,
): Candidate | FilmAsk | null {
  const { opportunity, goal } = reason;
  const quote = opportunity?.kind === "new_review";
  const file = quote ? null : footageFor(given, opportunity, goal);
  if (!quote && (!file || usedFiles.has(file.id)))
    return opportunity?.kind === "fresh_footage" ? null : filmAskOf(opportunity, goal);
  if (file) usedFiles.add(file.id);
  const kind = postKindOf(file);
  return {
    title: candidateTitleOf(opportunity, file),
    reason: opportunity?.says ?? null,
    kind,
    fileId: file?.id ?? null,
    opportunity,
    intent: candidateIntentOf(opportunity, goal),
    score: candidateScoreOf({
      opportunity,
      goal,
      file,
      kind,
      eligible: eligibleOf(given, kind),
      reasonUsed: !!opportunity && given.usedReasons.has(opportunity.key),
    }),
    day: opportunity?.day ?? null,
  };
}

/** Every candidate, scored; and what to film for a reason no footage can tell. */
function candidatesOf(given: WeekAsked): { candidates: Candidate[]; asks: FilmAsk[] } {
  const candidates: Candidate[] = [];
  const asks: FilmAsk[] = [];
  const usedFiles = new Set<string>();
  for (const reason of weekReasonsOf(given)) {
    const one = candidateFor(given, reason, usedFiles);
    if (one && "score" in one) candidates.push(one);
    else if (one) asks.push(one);
  }
  candidates.push(...beSeen(given, usedFiles));
  return { candidates: candidates.sort((a, b) => b.score.total - a.score.total), asks };
}

/** The goal every week serves where the owner set none, or none another reason served: to be seen. */
const BE_SEEN: GoalFact = { goal: "awareness", service: null, days: [], weight: 0.5 };

/**
 * The footage no reason used, as candidates of being seen (PRD 10.2, step 2): the best of what came in, scored lower than a
 * reason, so a week with good footage and few reasons still fills its cadence, and a week with neither says fewer.
 */
function beSeen(given: WeekAsked, usedFiles: Set<string>): Candidate[] {
  const goal = given.goals.find((g) => g.goal === "awareness") ?? BE_SEEN;
  return given.footage
    .filter((file) => !usedFiles.has(file.id))
    .slice(0, 6)
    .map((file) => {
      const kind = postKindOf(file);
      return {
        title: footageTitleOf(file),
        reason: null,
        kind,
        fileId: file.id,
        opportunity: null,
        intent: candidateIntentOf(null, goal),
        score: candidateScoreOf({
          opportunity: null,
          goal,
          file,
          kind,
          eligible: eligibleOf(given, kind),
          reasonUsed: false,
        }),
        day: null,
      };
    });
}

/** The days a post may go up this week: from tomorrow (or Monday), not quiet. */
function openDays(given: WeekAsked): string[] {
  const today = dayInZone(given.zone, given.nowMs).key;
  const days: string[] = [];
  for (let i = 0; i < 7; i += 1) {
    const day = shiftKey(given.weekOf, i);
    if (day <= today) continue;
    if (given.quietDays.includes(weekdayShortOf(day).toLowerCase())) continue;
    days.push(day);
  }
  return days;
}

/** The hour each kind goes up at, in the business's zone: a reel in the evening, a picture at midday, Google in the morning. */
const HOUR_OF: Readonly<Record<PostPlace, Record<PostKind, number>>> = {
  instagram: { reel: 18, picture: 12, story: 17 },
  google: { reel: 10, picture: 10, story: 10 },
};

const instantOf = (zone: string, day: string, hour: number): string => {
  const [y = 0, m = 1, d = 1] = day.split("-").map(Number);
  return new Date(localToUtcMs(zone, y, m, d, hour, 0)).toISOString();
};

/** The day a pick goes up: the evening before the day it is about, else the open day used least. */
function dayFor(candidate: Candidate, days: readonly string[], used: Map<string, number>): string | null {
  if (candidate.day) {
    const before = shiftKey(candidate.day, -1);
    if (days.includes(before)) return before;
    if (days.includes(candidate.day)) return candidate.day;
    return null;
  }
  return [...days].sort((a, b) => (used.get(a) ?? 0) - (used.get(b) ?? 0) || a.localeCompare(b))[0] ?? null;
}

/** The checks at the propose moment (PRD 6.2): the place takes it and the connection allows it. */
function proposeVerdict(given: WeekAsked, place: PostPlace, kind: PostKind, fileKind: string) {
  return evaluate({
    publishing: {
      place,
      kind,
      fileKind,
      connection: given.places[place] ?? "not_connected",
      caption: null,
      video: null,
    },
  });
}

/** The places a pick goes to, within what is left of the cadence for each. */
function placesFor(candidate: Candidate, given: WeekAsked, left: Map<string, number>): PostPlace[] {
  const out: PostPlace[] = [];
  if (connected(given, "instagram") && (left.get(`instagram:${candidate.kind}`) ?? 0) > 0) out.push("instagram");
  if (candidate.kind === "picture" && connected(given, "google") && (left.get("google:picture") ?? 0) > 0)
    out.push("google");
  return out;
}

/** What is left of the cadence's high end, per place and kind. */
function cadenceLeft(given: WeekAsked): Map<string, number> {
  const cadence = cadenceOf(given.cadence);
  return new Map([
    ["instagram:reel", cadence.instagram.reel[1]],
    ["instagram:picture", cadence.instagram.picture[1]],
    ["google:picture", cadence.google.picture[1]],
  ]);
}

/** The slots of one pick, one a place, each through the propose moment's checks. */
function slotsOf(candidate: Candidate, given: WeekAsked, at: { day: string; places: PostPlace[]; creative: string }) {
  return at.places.map((place): DraftedSlot => {
    const verdict = proposeVerdict(given, place, candidate.kind, candidate.kind === "reel" ? "video" : "image");
    const [first] = verdict.ok ? [] : verdict.refusals;
    return {
      creative: at.creative,
      place,
      kind: candidate.kind,
      at: instantOf(given.zone, at.day, HOUR_OF[place][candidate.kind]),
      title: candidate.title,
      reason: candidate.reason,
      file_id: candidate.fileId,
      intent: candidate.intent,
      state: first ? "blocked" : "proposed",
      blocked_why: first ? first.code : null,
      blocked_reason: first ? verdictWords(verdict) : null,
      ask: null,
      score: candidate.score,
    };
  });
}

/** An ask to film, as a slot that waits for footage (PRD 10.2, step 5). */
const askSlot = (ask: FilmAsk, given: WeekAsked, day: string, creative: string): DraftedSlot => ({
  creative,
  place: connected(given, "instagram") ? "instagram" : "google",
  kind: connected(given, "instagram") ? "reel" : "picture",
  at: instantOf(given.zone, day, 18),
  title: ask.what.charAt(0).toUpperCase() + ask.what.slice(1),
  reason: ask.reason,
  file_id: null,
  intent: ask.opportunity ? candidateIntentOf(ask.opportunity, null) : null,
  state: "needs_footage",
  blocked_why: null,
  blocked_reason: null,
  ask: { what: ask.what, seconds: ask.seconds, opportunity_id: ask.opportunity?.key ?? null },
  score: null,
});

/**
 * Why the week is smaller than the cadence asks, in a sentence; null where it is not. It is smaller where it falls under
 * the cadence's low end, or under its high end with a candidate left out for being weak.
 */
function fewerOf(
  picked: number,
  wanted: { low: number; high: number },
  weak: Candidate[],
  asks: number,
): string | null {
  if (picked >= wanted.high || (picked >= wanted.low && weak.length === 0)) return null;
  if (picked === 0)
    return asks > 0
      ? "Nothing to post this week: no clip fits what this week needs. Film these, and AI makes the week from them."
      : "Nothing to post this week: no clip or reason is strong enough yet.";
  const reasonLeft = weak[0] ? weakestWhy(weak[0].score) : "the footage at hand tells nothing more this week";
  return `Only ${picked} this week: ${reasonLeft.charAt(0).toLowerCase()}${reasonLeft.slice(1)}.`;
}

/** The week, planned (PRD 10.2): the slots to write, and why it is fewer where it is. */
export function planWeek(given: WeekAsked, newId: () => string): WeekDrafted {
  const { candidates, asks } = candidatesOf(given);
  const days = openDays(given);
  const left = cadenceLeft(given);
  const cadence = cadenceOf(given.cadence);
  const ends = (end: 0 | 1): number =>
    (connected(given, "instagram") ? cadence.instagram.reel[end] + cadence.instagram.picture[end] : 0) ||
    cadence.google.picture[end];
  const wanted = { low: ends(0), high: ends(1) };
  const used = new Map<string, number>();
  const slots: DraftedSlot[] = [];
  let picked = 0;
  for (const candidate of candidates.filter((one) => one.score.total >= WEAK_BELOW)) {
    const places = placesFor(candidate, given, left);
    const day = places.length > 0 ? dayFor(candidate, days, used) : null;
    if (!day) continue;
    for (const place of places)
      left.set(`${place}:${candidate.kind}`, (left.get(`${place}:${candidate.kind}`) ?? 0) - 1);
    used.set(day, (used.get(day) ?? 0) + 1);
    slots.push(...slotsOf(candidate, given, { day, places, creative: newId() }));
    picked += 1;
  }
  const askDay = days.at(-1) ?? shiftKey(given.weekOf, 6);
  const askSlots = asks.slice(0, FOOTAGE_ASKS_MOST).map((ask) => askSlot(ask, given, askDay, newId()));
  const weak = candidates.filter((one) => one.score.total < WEAK_BELOW);
  return { slots: [...slots, ...askSlots], fewer: fewerOf(picked, wanted, weak, askSlots.length) };
}
