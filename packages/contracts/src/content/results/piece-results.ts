/**
 * A piece's How it did and What it brought (the content loop PRD's 21.3, parts 3 and 4; the journey canvas, Piece cell
 * 10 and desk cell 32): what the server reads (PieceResultsDto: each placement's newest numbers, the people its posts
 * brought with what they did and what their visit is put down to, its link's opens), and every sentence the sheet says
 * of it. A number a place does not give is said as not available, never a zero; comments are "as Instagram counts
 * them"; opens of a link are opens, never people, and never credited. Where no later read of a post's numbers will
 * come (it came down, its story's day ended, or its last step was read), nothing says "this time" or names a next read
 * (the content status review of 24 Nov 2026, A7). Pure.
 */
import { clockTime } from "../../shared/clock";
import { groupedPlural } from "../../shared/words";
import { dayInZone } from "../../shared/zone/math";
import { CREDIT_WINDOW_DAYS } from "./credit";
import { storyRanItsDay } from "../placements/story-day";
import { nextObserveStep } from "./observe";
import type {
  CreditClass,
  LinkLands,
  MetricAvailability,
  ObserveStep,
  PostMetric,
  TimedObserveStep,
  TouchKind,
} from "./sets";

/** One placement's newest numbers, as read; empty before the first read. */
export interface PostNumbersDto {
  post_id: string;
  place: "instagram" | "google";
  kind: "picture" | "story" | "reel";
  /** When it went up, and whether it was taken down since (pass 6: New ad's band says where it came from). */
  published_at?: string;
  down?: boolean;
  step: ObserveStep | null;
  read_at: string | null;
  numbers: Array<{ metric: PostMetric; value: number | null; availability: MetricAvailability }>;
}

/** A person a piece's posts brought: what they did, and their visit and what it is put down to, where there is one. */
export interface BroughtPersonDto {
  contact_id: string;
  name: string | null;
  new_person: boolean;
  touch: TouchKind | "ad_message";
  touched_at: string;
  /** A comment's words, where the touch was a comment and its person is still here. */
  words?: string | null;
  /**
   * What their booking is put down to, of this piece's posts (00732): `direct`, a post is its main source (what the
   * booking answered or the first thing they touched); `assisted`, a post helped and something else is; `none`.
   */
  class: CreditClass;
  /** Whether the booking itself names the post (asked for in the conversation the post opened). Absent on an older read. */
  tied?: boolean;
  visit: { starts_at: string; status: string } | null;
  /**
   * Where the steps from its post to the chair live (pass 6; the canvas's Loop3): the conversation it wrote in, its
   * visit and when it was asked for, and the review ask it was sent after the visit, where one went.
   */
  chain?: {
    conversation_id: string | null;
    visit: { id: string; asked_at: string } | null;
    review_ask: { at: string; conversation_id: string | null } | null;
  };
}

export interface PieceResultsDto {
  posts: PostNumbersDto[];
  /** People who wrote about it: replied, commented, or wrote from its link. */
  conversations: number;
  direct: number;
  assisted: number;
  people: BroughtPersonDto[];
  link: { code: string; lands: LinkLands; opens: number } | null;
  window_days: number;
}

/** One person's row, as the sheet draws it. */
export interface BroughtSaid {
  contactId: string;
  name: string;
  line: string;
}

/** Every sentence the sheet says of the piece's results. */
export interface PieceResultsSaid {
  howItDid: { lines: string[]; missing: string[]; fine: string };
  whatItBrought: { head: string; newPeople: BroughtSaid[]; known: BroughtSaid[]; fine: string };
}

/** The words of a number on the sheet, by kind: a reel's views are plays. */
function numberWords(metric: PostMetric, value: number, kind: PostNumbersDto["kind"]): string {
  if (metric === "views") return groupedPlural(value, kind === "picture" ? "view" : "play");
  if (metric === "reach") return `${value.toLocaleString("en-US")} reached`;
  const one: Readonly<Partial<Record<PostMetric, string>>> = {
    saves: "save",
    likes: "like",
    comments: "comment",
    shares: "share",
    follows: "follow",
    profile_visits: "profile view",
    link_opens: "link open",
  };
  return groupedPlural(value, one[metric] ?? metric);
}

/** The two lines the canvas draws: reach, plays and saves; then likes, comments and shares. */
const LINES: ReadonlyArray<readonly PostMetric[]> = [
  ["reach", "views", "saves"],
  ["likes", "comments", "shares"],
];

/** The placement whose numbers lead: the first with a number there. */
const leading = (posts: readonly PostNumbersDto[]) =>
  posts.find((post) => post.numbers.some((number) => number.availability === "available")) ?? null;

const PLACE_NAME = { instagram: "Instagram", google: "Google" } as const;
const KIND_NAME = { picture: "Post", story: "Story", reel: "Reel" } as const;

/** Whether a story's day has ended (placements/story-day.ts): never said of one whose time up was not read. */
const storyEnded = (post: PostNumbersDto, nowMs: number): boolean =>
  post.published_at !== undefined &&
  storyRanItsDay({ kind: post.kind, published_at: post.published_at, scheduled_for: post.published_at }, nowMs);

/**
 * Why the clock reads this post's numbers no more, or null while it still does: it came down (a take-down's own read is
 * its last), its story's day ended, or its last step was read.
 */
function readsEndedBy(post: PostNumbersDto, nowMs: number): "down" | "story" | "last" | null {
  if (post.down || post.step === "last") return "down";
  if (storyEnded(post, nowMs)) return "story";
  return nextObserveStep(post.step, post.kind) ? null : "last";
}

/** A number that could not be read and never will be now, by why no read comes: said once, in the past. */
const NEVER_READ = {
  down: "its numbers couldn't be read before it came down",
  story: "its numbers couldn't be read before it ended",
  last: "its numbers couldn't be read",
} as const;

/**
 * What a placement with no number at all says: kept back for a small story, or not given by the place; else that the
 * read did not get them, "this time" only while another read comes.
 */
function missingOf(post: PostNumbersDto, nowMs: number): string | null {
  if (post.numbers.length === 0 || post.numbers.some((number) => number.availability === "available")) return null;
  if (post.numbers.some((number) => number.availability === "withheld"))
    return `${KIND_NAME[post.kind]}: not available · fewer than 5 people saw it`;
  if (post.numbers.every((number) => number.availability === "unsupported"))
    return `${PLACE_NAME[post.place]}: not available`;
  const ended = readsEndedBy(post, nowMs);
  return `${KIND_NAME[post.kind]}: ${ended ? NEVER_READ[ended] : "couldn't be read this time"}`;
}

const STEP_WORDS: Readonly<Record<TimedObserveStep, string>> = {
  "1h": "an hour",
  "1d": "a day",
  "3d": "3 days",
  "7d": "7 days",
  "28d": "28 days",
};

/**
 * When the numbers shown were read, and whether more come: the clock's next step (a story's day read is taken before
 * it ends, not at a day), or none: after a take-down's read, once it came down or its story ended, or past its last.
 */
function whenReadOf(post: PostNumbersDto, nowMs: number): string {
  if (post.step === "last") return "Read just before you took it down.";
  if (post.down) return "Read while it was up.";
  if (storyEnded(post, nowMs)) return "Read before the story ended.";
  const next = nextObserveStep(post.step, post.kind);
  if (!next) return "Read for the last time.";
  return post.kind === "story" && next === "1d" ? "Next before the story ends." : `Next at ${STEP_WORDS[next]}.`;
}

/** What is said where no number was ever read: when they come, or, with no read left to come, that none was. */
function unreadSaid(posts: readonly PostNumbersDto[], nowMs: number): string {
  if (posts.some((post) => post.read_at)) return "";
  return posts.some((post) => readsEndedBy(post, nowMs) === null)
    ? "Its numbers come an hour after it went up."
    : "Its numbers weren't read while it was up.";
}

function howItDidOf(posts: readonly PostNumbersDto[], nowMs: number): PieceResultsSaid["howItDid"] {
  const lead = leading(posts);
  const missing = posts.flatMap((post) => missingOf(post, nowMs) ?? []);
  if (!lead) return { lines: [], missing, fine: unreadSaid(posts, nowMs) };
  const there = new Map(
    lead.numbers.flatMap((number) =>
      number.availability === "available" && number.value !== null ? [[number.metric, number.value] as const] : [],
    ),
  );
  const lines = LINES.map((metrics) =>
    metrics.flatMap((metric) => {
      const value = there.get(metric);
      return value === undefined ? [] : [numberWords(metric, value, lead.kind)];
    }),
  )
    .filter((parts) => parts.length > 0)
    .map((parts) => parts.join(" · "));
  const comments = there.has("comments") ? "Comments as Instagram counts them, your own replies included. " : "";
  return { lines, missing, fine: `${comments}${whenReadOf(lead, nowMs)}` };
}

const TOUCH_WORDS: Readonly<Record<BroughtPersonDto["touch"], (kind: string) => string>> = {
  reply: (kind) => `Replied to the ${kind}`,
  story_reply: () => "Replied to the story",
  comment: () => "Commented",
  dm: () => "Wrote about it",
  mention: () => "Named you under it",
  coded_message: () => "Wrote from the post's link",
  ad_message: () => "Wrote from an ad",
};

function dayTime(atMs: number, tz: string): string {
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(new Date(atMs));
  return `${weekday} ${clockTime(atMs, tz)}`;
}

function broughtRowOf(person: BroughtPersonDto, kind: string, tz: string): BroughtSaid {
  const did =
    person.touch === "comment" && person.words ? `Commented “${person.words}”` : TOUCH_WORDS[person.touch](kind);
  const visit =
    person.visit && person.class !== "none" ? ` · booked ${dayTime(Date.parse(person.visit.starts_at), tz)}` : "";
  // A booking put down to something else they touched says so; one this post is the main source of says only when.
  const helped = person.class === "assisted" ? " another way · it helped" : "";
  return { contactId: person.contact_id, name: person.name ?? "Someone", line: `${did}${visit}${helped}` };
}

function broughtOf(dto: PieceResultsDto, tz: string): PieceResultsSaid["whatItBrought"] {
  const kind = KIND_NAME[dto.posts[0]?.kind ?? "picture"].toLowerCase();
  const parts = [
    groupedPlural(dto.conversations, "conversation"),
    ...(dto.direct ? [`${dto.direct} booked from this post`] : []),
    ...(dto.assisted ? [`${dto.assisted} it helped`] : []),
  ];
  const head = dto.conversations || dto.direct || dto.assisted ? parts.join(" · ") : "No one has written about it yet";
  const rows = (isNew: boolean) =>
    dto.people.filter((p) => p.new_person === isNew).map((p) => broughtRowOf(p, kind, tz));
  const days = dto.window_days || CREDIT_WINDOW_DAYS;
  const helped = `A booking counts when it was made in the ${days} days after they answered or wrote about it. It is from this post where the post is what they booked through, or the first thing they touched. “It helped” where that was something else.`;
  const link = dto.link
    ? dto.link.lands === "booking"
      ? ` Your booking link was opened ${groupedPlural(dto.link.opens, "time")}: bookings made there can't be traced to a post.`
      : ` Its link was opened ${groupedPlural(dto.link.opens, "time")}.`
    : "";
  return { head, newPeople: rows(true), known: rows(false), fine: `${helped}${link}` };
}

/** Every sentence the sheet says of a piece's results, in the business's zone, as of now. */
export function pieceResultsSaid(dto: PieceResultsDto, tz: string, nowMs: number): PieceResultsSaid {
  return { howItDid: howItDidOf(dto.posts, nowMs), whatItBrought: broughtOf(dto, tz) };
}

/** A piece of the one line: words, or a number the line sets apart. */
export type ResultLinePart = string | { number: string };

/**
 * The one line beside Run as an ad, on the piece's foot and in New ad opened from it (the content loop's pass 6; the
 * canvas's Loop1, approved by Ruben on 24 Nov 2026): what its posts already did, in How it did's and What it brought's
 * words: who it reached and where, the people who wrote, the visits booked from it. A reach a place keeps back says why,
 * never a zero; none read yet says when it comes, or that none was where no read is left to come; a post taken down
 * says it in the past. Null before any post went up.
 */
export function pieceResultLineOf(dto: PieceResultsDto, at: { down: boolean; nowMs: number }): ResultLinePart[] | null {
  if (dto.posts.length === 0) return null;
  const lead = leading(dto.posts);
  const reach = lead?.numbers.find((one) => one.metric === "reach" && one.availability === "available")?.value ?? null;
  const missing = dto.posts.map((post) => missingOf(post, at.nowMs)).find((line) => line !== null) ?? null;
  if (reach === null && missing === null)
    return [howItDidOf(dto.posts, at.nowMs).fine || "Its numbers aren't read yet."];
  const reached: ResultLinePart[] =
    lead && reach !== null
      ? [
          "Reached ",
          { number: reach.toLocaleString("en-US") },
          at.down ? " while it was up" : ` on ${PLACE_NAME[lead.place]}`,
        ]
      : [missing ?? ""];
  return [
    ...reached,
    " · ",
    { number: dto.conversations.toLocaleString("en-US") },
    dto.conversations === 1 ? " conversation" : " conversations",
    ...(dto.direct > 0 ? [" · ", { number: dto.direct.toLocaleString("en-US") }, " booked from it"] : []),
  ];
}

/** The one line as plain words: what a test reads, and what AI is told. */
export const resultLineText = (parts: readonly ResultLinePart[]): string =>
  parts.map((part) => (typeof part === "string" ? part : part.number)).join("");

/** What a step of a person's chain opens: the conversation, or the visit on its day. */
export type ChainOpens = { kind: "conversation"; id: string } | { kind: "visit"; id: string; day: string };

/** One step of a person's chain: what happened, when, and the record it opens. */
export interface ChainStep {
  words: string;
  when: string;
  opens: ChainOpens | null;
  /** Whether it is done; a time still waiting to be confirmed, or a missed visit, is not. */
  done: boolean;
}

const dayKeyIn = (atMs: number, tz: string): string => dayInZone(tz, atMs).key;

/** What a visit's asking says of where it stands: confirmed, waiting, or called off. */
const ASKED_STANDS: Readonly<Record<string, string>> = {
  proposed: "waiting to be confirmed",
  booked: "confirmed",
  kept: "confirmed",
  missed: "confirmed",
  cancelled: "cancelled",
};

/**
 * A person's chain, from the post to the review ask (the content loop's pass 6; the canvas's Loop3, approved by Ruben on
 * 24 Nov 2026): what they did, the time they asked for and whether it was confirmed, the visit kept or missed, and the
 * review ask sent after it. It says only what the record holds and ends at the ask: a review on Google names its writer
 * by display name only, and Chanlytics never works out who someone is. Null for a person with no visit.
 */
export function broughtChainOf(
  person: BroughtPersonDto,
  kind: string,
  tz: string,
): { steps: ChainStep[]; fine: string | null } | null {
  const chain = person.chain;
  if (!chain || !person.visit || !chain.visit) return null;
  const startsMs = Date.parse(person.visit.starts_at);
  const visitOpens: ChainOpens = { kind: "visit", id: chain.visit.id, day: dayKeyIn(startsMs, tz) };
  const did =
    person.touch === "comment" && person.words ? `Commented “${person.words}”` : TOUCH_WORDS[person.touch](kind);
  const steps: ChainStep[] = [
    {
      words: did,
      when: dayTime(Date.parse(person.touched_at), tz),
      opens: chain.conversation_id ? { kind: "conversation", id: chain.conversation_id } : null,
      done: true,
    },
    {
      words: `Asked for ${dayTime(startsMs, tz)} · ${ASKED_STANDS[person.visit.status] ?? "asked"}`,
      when: dayTime(Date.parse(chain.visit.asked_at), tz),
      opens: visitOpens,
      done: person.visit.status !== "proposed",
    },
  ];
  if (person.visit.status === "kept" || person.visit.status === "missed")
    steps.push({
      words: person.visit.status === "kept" ? "Kept" : "Missed",
      when: dayTime(startsMs, tz),
      opens: visitOpens,
      done: person.visit.status === "kept",
    });
  const ask = chain.review_ask;
  if (person.visit.status === "kept" && ask)
    steps.push({
      words: "Asked for a review",
      when: dayTime(Date.parse(ask.at), tz),
      opens: ask.conversation_id ? { kind: "conversation", id: ask.conversation_id } : null,
      done: true,
    });
  const endsAtTheAsk = steps.at(-1)?.words === "Asked for a review";
  return {
    steps,
    fine: endsAtTheAsk ? "Chanlytics can't tell who wrote a review on Google, so it ends at the ask." : null,
  };
}
