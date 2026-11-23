/**
 * A piece's How it did and What it brought (the content loop PRD's 21.3, parts 3 and 4; the journey canvas, Piece cell
 * 10 and desk cell 32): what the server reads (PieceResultsDto: each placement's newest numbers, the people its posts
 * brought with what they did and what their visit is put down to, its link's opens), and every sentence the sheet says
 * of it. A number a place does not give is said as not available, never a zero; comments are "as Instagram counts
 * them"; opens of a link are opens, never people, and never credited. Pure.
 */
import { clockTime } from "../../shared/clock";
import { groupedPlural } from "../../shared/words";
import { CREDIT_WINDOW_DAYS } from "./credit";
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
  class: CreditClass;
  visit: { starts_at: string; status: string } | null;
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

/** What a placement with no number at all says: kept back for a small story, or not given by the place. */
function missingOf(post: PostNumbersDto): string | null {
  if (post.numbers.length === 0 || post.numbers.some((number) => number.availability === "available")) return null;
  if (post.numbers.some((number) => number.availability === "withheld"))
    return `${KIND_NAME[post.kind]}: not available · fewer than 5 people saw it`;
  if (post.numbers.every((number) => number.availability === "unsupported"))
    return `${PLACE_NAME[post.place]}: not available`;
  return `${KIND_NAME[post.kind]}: couldn't be read this time`;
}

const STEP_WORDS: Readonly<Record<TimedObserveStep, string>> = {
  "1h": "an hour",
  "1d": "a day",
  "3d": "3 days",
  "7d": "7 days",
  "28d": "28 days",
};

/** When the numbers shown were read, and whether more come: the clock's next step, or none after a take-down's read. */
function whenReadOf(step: ObserveStep | null): string {
  if (step === "last") return "Read just before you took it down.";
  const next = nextObserveStep(step);
  return next ? `Next at ${STEP_WORDS[next]}.` : "Read for the last time.";
}

function howItDidOf(posts: readonly PostNumbersDto[]): PieceResultsSaid["howItDid"] {
  const lead = leading(posts);
  const missing = posts.flatMap((post) => missingOf(post) ?? []);
  if (!lead) {
    const read = posts.some((post) => post.read_at);
    return { lines: [], missing, fine: read ? "" : "Its numbers come an hour after it went up." };
  }
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
  return { lines, missing, fine: `${comments}${whenReadOf(lead.step)}` };
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
  const helped = `“It helped” counts people who answered or wrote about it in the ${dto.window_days || CREDIT_WINDOW_DAYS} days before they booked another way.`;
  const link = dto.link
    ? dto.link.lands === "booking"
      ? ` Your booking link was opened ${groupedPlural(dto.link.opens, "time")}: bookings made there can't be traced to a post.`
      : ` Its link was opened ${groupedPlural(dto.link.opens, "time")}.`
    : "";
  return { head, newPeople: rows(true), known: rows(false), fine: `${helped}${link}` };
}

/** Every sentence the sheet says of a piece's results, in the business's zone. */
export function pieceResultsSaid(dto: PieceResultsDto, tz: string): PieceResultsSaid {
  return { howItDid: howItDidOf(dto.posts), whatItBrought: broughtOf(dto, tz) };
}
