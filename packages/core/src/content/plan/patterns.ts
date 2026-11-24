/**
 * What a business's own posts have shown (the content loop PRD's 9.4; call 17): over the last 90 days, for each place
 * and kind, the posts told apart by one thing at a time (the hour they went up, a weekday or the weekend, a clip's
 * length, what the footage shows), each cohort set against the rest by the middle of their reach at seven days.
 *
 *  - Fewer than 12 comparable posts on either side: too little, and nothing is claimed.
 *  - 12 to 30: an early sign, tried once and said as a try.
 *  - More than 30, with the cohort ahead in both halves of the window: a pattern, and the plan's weights move.
 *  - A post whose numbers came while it also ran as an ad is left out: paid reach is never set beside organic.
 *  - A cohort that differs from the rest in a second thing as well (the evening reels were also the ones showing
 *    balayage) is credited to neither: it says what it moved with, and nothing leans on it.
 *  - A difference under a fifth is no difference, and is not said.
 *
 * Pure: the posts and the business's zone in, the differences out, strongest and surest first.
 */
import {
  PATTERN_AT,
  PATTERN_DIMENSIONS,
  PATTERN_EARLY_AT,
  zoneParts,
  type ContentPattern,
  type PatternDimension,
  type PatternLevel,
  type PlanPlace,
  type PostKind,
  type PostOutcome,
} from "@chanlytics/contracts";

/** The least a cohort's middle reach must pass the rest's by to be a difference at all. */
const LIFT_AT_LEAST = 1.2;
/** How much more of a cohort than of the rest shares a second thing before the two are said to have moved together. */
const MOVED_TOGETHER_BY = 0.5;

/** A post's hour, as the plan sets one: morning, midday, evening, late. */
const hourBandOf = (hh: number): string => {
  if (hh >= 5 && hh < 11) return "morning";
  if (hh >= 11 && hh < 15) return "midday";
  if (hh >= 15 && hh < 22) return "evening";
  return "late";
};

/** A clip's length: under 15 seconds, up to 30, longer. A picture has none. */
const lengthBandOf = (seconds: number | null): string | null => {
  if (seconds === null) return null;
  if (seconds < 15) return "short";
  return seconds <= 30 ? "medium" : "long";
};

/** What a post's footage shows, as compared: each of the look's phrases, in lower case. */
const showsOf = (post: PostOutcome): string[] => [
  ...new Set(post.shows.map((s) => s.trim().toLowerCase()).filter(Boolean)),
];

/** A compared post: its reach, and its one value for each thing it is told apart by (`shows` is several). */
interface Compared {
  at: number;
  reach: number;
  hour: string;
  day: string;
  length: string | null;
  shows: string[];
}

function comparedOf(post: PostOutcome & { reach: number }, zone: string): Compared {
  const at = Date.parse(post.at);
  const parts = zoneParts(zone, at);
  return {
    at,
    reach: post.reach,
    hour: hourBandOf(parts.hh),
    day: parts.weekday === "sat" || parts.weekday === "sun" ? "weekend" : "weekday",
    length: lengthBandOf(post.seconds),
    shows: showsOf(post),
  };
}

/** Whether a compared post is in the cohort of one value of one thing. */
const isIn = (post: Compared, dimension: PatternDimension, value: string): boolean =>
  dimension === "shows" ? post.shows.includes(value) : post[dimension] === value;

/** The values a thing takes among these posts, each once: a phrase counts once it is in enough posts to be compared. */
function valuesOf(posts: readonly Compared[], dimension: PatternDimension): string[] {
  if (dimension !== "shows") return [...new Set(posts.map((p) => p[dimension]).filter((v): v is string => v !== null))];
  const count = new Map<string, number>();
  for (const phrase of posts.flatMap((p) => p.shows)) count.set(phrase, (count.get(phrase) ?? 0) + 1);
  return [...count].filter(([, n]) => n >= PATTERN_EARLY_AT).map(([phrase]) => phrase);
}

const middleOf = (values: readonly number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? (sorted[mid] ?? 0) : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
};

/** The cohort's middle reach over the rest's, or null where the rest reached nobody to compare with. */
function liftOf(cohort: readonly Compared[], rest: readonly Compared[]): number | null {
  const below = middleOf(rest.map((p) => p.reach));
  if (cohort.length === 0 || rest.length === 0 || below <= 0) return null;
  return Math.round((middleOf(cohort.map((p) => p.reach)) / below) * 100) / 100;
}

/** Whether the cohort was ahead of the rest in the older half of the window and in the newer half alike. */
function holdsInBothHalves(cohort: readonly Compared[], rest: readonly Compared[]): boolean {
  const split = middleOf([...cohort, ...rest].map((p) => p.at));
  const ahead = (side: (p: Compared) => boolean): boolean => {
    const lift = liftOf(cohort.filter(side), rest.filter(side));
    return lift !== null && lift > 1;
  };
  return ahead((p) => p.at < split) && ahead((p) => p.at >= split);
}

/** The second thing a cohort moved with, where one did: most of the cohort shares it, and far fewer of the rest. */
function movedWithOf(
  cohort: readonly Compared[],
  rest: readonly Compared[],
  dimension: PatternDimension,
): PatternDimension | null {
  for (const other of PATTERN_DIMENSIONS) {
    if (other === dimension) continue;
    // Every value the cohort holds, a phrase however few posts show it: a second change is looked for wherever it is.
    const held: string[] =
      other === "shows"
        ? cohort.flatMap((p) => p.shows)
        : cohort.map((p) => p[other]).filter((v): v is string => v !== null);
    for (const value of new Set(held)) {
      const share = (posts: readonly Compared[]) => posts.filter((p) => isIn(p, other, value)).length / posts.length;
      if (share(cohort) - share(rest) >= MOVED_TOGETHER_BY) return other;
    }
  }
  return null;
}

const levelOf = (n: { better: number; rest: number }, stable: boolean): PatternLevel => {
  const fewest = Math.min(n.better, n.rest);
  if (fewest < PATTERN_EARLY_AT) return "too_little";
  return fewest > PATTERN_AT && stable ? "pattern" : "early";
};

/** A kind's plural, as an owner says it. */
const KIND_PLURALS: Readonly<Record<PostKind, string>> = { reel: "reels", picture: "posts", story: "stories" };
const PLACE_WORDS: Readonly<Record<PlanPlace, string>> = { instagram: "Instagram", google: "Google" };

/** How a cohort is named before its kind: "evening reels", "short reels", "reels showing a blow-dry". */
function cohortWords(dimension: PatternDimension, value: string, kind: PostKind): string {
  const plural = KIND_PLURALS[kind];
  if (dimension === "shows") return `${plural} showing ${value}`;
  if (dimension === "length")
    return `${{ short: "short", medium: "15 to 30 second", long: "longer" }[value] ?? value} ${plural}`;
  if (dimension === "hour") return `${value === "late" ? "late-night" : value} ${plural}`;
  return `${value} ${plural}`;
}

/** The sentence a difference is said in, with how many posts it rests on. */
function saysOf(p: Omit<ContentPattern, "says">): string {
  const plural = KIND_PLURALS[p.kind];
  const cohort = cohortWords(p.dimension, p.better, p.kind);
  return (
    `On ${PLACE_WORDS[p.place]}, ${cohort} reached ${p.lift} times as many people as your other ${plural} ` +
    `(${p.n.better} and ${p.n.rest} ${plural})`
  );
}

/** The strongest cohort of one thing among one place's and kind's posts, set against the rest; null where none differs. */
function strongestOf(
  posts: readonly Compared[],
  group: { place: PlanPlace; kind: PostKind },
  dimension: PatternDimension,
): ContentPattern | null {
  let best: ContentPattern | null = null;
  const told = posts.filter((p) => dimension !== "length" || p.length !== null);
  for (const value of valuesOf(told, dimension)) {
    const cohort = told.filter((p) => isIn(p, dimension, value));
    const rest = told.filter((p) => !isIn(p, dimension, value));
    const lift = liftOf(cohort, rest);
    if (lift === null || lift < LIFT_AT_LEAST || (best && best.lift >= lift)) continue;
    const n = { better: cohort.length, rest: rest.length };
    const found = {
      ...group,
      dimension,
      better: value,
      n,
      lift,
      level: levelOf(n, holdsInBothHalves(cohort, rest)),
      movedWith: movedWithOf(cohort, rest, dimension),
    };
    best = { ...found, says: saysOf(found) };
  }
  return best;
}

const LEVEL_ORDER: Readonly<Record<PatternLevel, number>> = { pattern: 0, early: 1, too_little: 2 };

/** What a business's organic posts have shown, by place and kind, surest and strongest first (PRD 9.4). */
export function contentPatternsOf(posts: readonly PostOutcome[], zone: string): ContentPattern[] {
  const groups = new Map<string, { place: PlanPlace; kind: PostKind; posts: Compared[] }>();
  for (const post of posts) {
    if (post.paid || post.reach === null || !Number.isFinite(Date.parse(post.at))) continue;
    const key = `${post.place}:${post.kind}`;
    const group = groups.get(key) ?? { place: post.place, kind: post.kind, posts: [] };
    group.posts.push(comparedOf({ ...post, reach: post.reach }, zone));
    groups.set(key, group);
  }
  const found: ContentPattern[] = [];
  for (const { place, kind, posts: compared } of groups.values())
    for (const dimension of PATTERN_DIMENSIONS) {
      const one = strongestOf(compared, { place, kind }, dimension);
      if (one) found.push(one);
    }
  return found.sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] || b.lift - a.lift);
}

export { lengthBandOf };
