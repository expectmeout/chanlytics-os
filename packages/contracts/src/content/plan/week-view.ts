/**
 * The Week, as its page draws it (the content loop PRD's 21.2; the approved boards, Week 1-12, canvas 1795421968-f15f):
 * which of its states it stands in, its head, its groups of rows, each creative once with its places as marks or its one
 * fix, and what to film at its foot. Pure, so the page, its tests and AI read one Week. Every sentence is WEEK_WORDS'.
 */
import { clockDate, clockTime, wallClockAt, zoneDayKey } from "../../shared/clock";
import { shiftKey } from "../../shared/zone/day-keys";
import { postStoppedWhyOf, type PostDto, type PostKind, type PostPlace } from "../posts";
import { creativesOf, weekdayShortOf, weekSizeSaid, type PlanSlotDto } from "./week";
import type { WeekPageDto, WeekPieceDto } from "./week-page";
import { WEEK_WORDS as W, weekDaysSaid } from "./words";

/** Where the Week stands, one of the board's nine (the week that passed is pass 2's line over any of them). */
export type WeekState = "unconnected" | "unplanned" | "nothing" | "drafting" | "ready" | "approved" | "paused";

/** A place as a mark on a row: what it goes as there, and its dot where it is not plain (amber needs you, green up). */
export interface WeekMark {
  glyph: "reel" | "story" | "post" | "pin";
  dot: "" | "you" | "ok";
}

/** A row's one fix, where it waits on the owner. */
export interface WeekFix {
  act: "offer" | "again" | "post" | "connect" | "open";
  label: string;
}

/** One creative once: its still, its name, one line, and its places as marks or its one fix. */
export interface WeekRow {
  creative: string;
  title: string;
  line: string;
  tone: "" | "you" | "ok";
  marks: WeekMark[];
  fix: WeekFix | null;
  /** The file its still is drawn from: what it was made into, else its footage. */
  still: string | null;
  /** The made piece it opens, where it was made; else it opens as planned. */
  opens: string | null;
  /** Its slots, in time order. */
  slots: PlanSlotDto[];
  /** Whether it is being made now: the page asks again while one is. */
  moving: boolean;
}

export interface WeekGroup {
  name: string;
  tone: "" | "you";
  rows: WeekRow[];
}

export interface WeekView {
  state: WeekState;
  kicker: string;
  title: string;
  line: string;
  /** The head's one act. */
  act: "approve" | "resume" | "plan" | null;
  /** The head's mark moves while AI drafts. */
  moving: boolean;
  groups: WeekGroup[];
  film: { what: string; why: string }[];
  filmHead: string;
}

/** How a place takes a slot, as its mark: Instagram's reel, story or post, Google's pin. */
const glyphOf = (place: PostPlace, kind: PostKind): WeekMark["glyph"] =>
  place === "google" ? "pin" : kind === "reel" ? "reel" : kind === "story" ? "story" : "post";

/** "Tue 6:00 PM", in the business's zone. */
export const slotWhenSaid = (at: string, zone: string): string =>
  `${weekdayShortOf(zoneDayKey(Date.parse(at), zone))} ${clockTime(Date.parse(at), zone)}`;

/** "Dec 1 to 7": the week's Monday and Sunday, in its zone. */
function weekSpanSaid(weekOf: string, zone: string, nowMs: number): string {
  const monday = clockDate(wallClockAt(zone, weekOf, 12, 0), zone, nowMs);
  const sunday = shiftKey(weekOf, 6);
  const sundaySaid = clockDate(wallClockAt(zone, sunday, 12, 0), zone, nowMs);
  return sunday.slice(0, 7) === weekOf.slice(0, 7)
    ? `${monday} to ${Number(sunday.slice(8))}`
    : `${monday} to ${sundaySaid}`;
}

/** What the Week reads of a slot's making: its post, the piece it is, and that piece's made file. */
interface Made {
  posts: Map<string, PostDto>;
  fileOfPost: Map<string, string>;
  pieces: Map<string, WeekPieceDto>;
}

function madeOf(page: Pick<WeekPageDto, "made" | "pieces">): Made {
  const posts = new Map<string, PostDto>();
  const fileOfPost = new Map<string, string>();
  for (const piece of page.made)
    for (const post of piece.posts) {
      posts.set(post.id, post);
      fileOfPost.set(post.id, piece.file.id);
    }
  return { posts, fileOfPost, pieces: new Map(page.pieces.map((p) => [p.id, p])) };
}

/** A slot's dot: amber where its post stopped, green once up, plain otherwise. */
function dotOf(slot: PlanSlotDto, making: Made): WeekMark["dot"] {
  const post = slot.post_id ? making.posts.get(slot.post_id) : undefined;
  if (!post) return slot.state === "blocked" ? "you" : "";
  if (post.status === "published") return "ok";
  return postStoppedWhyOf(post) !== null ? "you" : "";
}

/** The fix a held slot offers: an offer to add, a try again, a connection to make. */
const fixOfHeld = (slot: PlanSlotDto): WeekFix =>
  slot.blocked_why === "claim"
    ? { act: "offer", label: W.fix.offer }
    : slot.blocked_why === "disconnected" || slot.blocked_why === "line_off"
      ? { act: "connect", label: W.fix.connect }
      : slot.blocked_why === "unmade"
        ? { act: "again", label: W.fix.again }
        : { act: "open", label: W.fix.open };

/** One creative's line, tone and fix, as its slots and what they were made into stand. */
function standOf(
  first: PlanSlotDto,
  slots: readonly PlanSlotDto[],
  making: Made,
  at: { zone: string; paused: boolean },
): Pick<WeekRow, "line" | "tone" | "fix" | "moving"> {
  const when = slotWhenSaid(first.at, at.zone);
  const held = slots.find((s) => s.state === "blocked");
  if (held) return { line: held.blocked_reason ?? W.fix.open, tone: "you", fix: fixOfHeld(held), moving: false };
  const posts = slots.flatMap((s) => (s.post_id ? [making.posts.get(s.post_id)].filter((p): p is PostDto => !!p) : []));
  const stopped = posts.find((p) => postStoppedWhyOf(p) !== null);
  if (stopped)
    return {
      line: W.didNotPost(stopped.place, postStoppedWhyOf(stopped) ?? ""),
      tone: "you",
      fix: { act: "open", label: W.fix.open },
      moving: false,
    };
  if (at.paused && first.state !== "proposed") return { line: W.waits(when), tone: "", fix: null, moving: false };
  if (posts.length > 0 && posts.every((p) => p.status === "published"))
    return {
      line: W.upOn(
        posts.map((p) => p.place),
        weekdayShortOf(zoneDayKey(Date.parse(first.at), at.zone)),
      ),
      tone: "ok",
      fix: null,
      moving: false,
    };
  if (posts.length > 0) return { line: W.goesUp(when), tone: "", fix: null, moving: false };
  if (first.state !== "approved") return { line: when, tone: "", fix: null, moving: false };
  const piece = first.piece_id ? making.pieces.get(first.piece_id) : undefined;
  if (piece?.status === "failed")
    return { line: W.videoFailed, tone: "you", fix: { act: "again", label: W.fix.again }, moving: false };
  if (piece?.status === "made")
    return { line: W.videoMade(when), tone: "you", fix: { act: "post", label: W.fix.post }, moving: false };
  return { line: piece ? W.videoMaking : W.making, tone: "", fix: null, moving: true };
}

/** Each creative of a week once, in time order, with the slots asking for footage and those left out aside. */
export function weekRowsOf(page: Pick<WeekPageDto, "week" | "made" | "pieces" | "zone" | "paused_at">): WeekRow[] {
  const making = madeOf(page);
  const byCreative = new Map<string, PlanSlotDto[]>();
  for (const slot of page.week.slots) {
    if (slot.state === "needs_footage" || slot.state === "removed") continue;
    byCreative.set(slot.creative, [...(byCreative.get(slot.creative) ?? []), slot]);
  }
  return [...byCreative.values()].flatMap((slots) => {
    const [first] = slots;
    if (!first) return [];
    const madeFile = slots.map((s) => (s.post_id ? making.fileOfPost.get(s.post_id) : undefined)).find(Boolean);
    const pieceFile = first.piece_id ? (making.pieces.get(first.piece_id)?.file_id ?? null) : null;
    const opens = madeFile ?? pieceFile ?? null;
    return [
      {
        creative: first.creative,
        title: first.title,
        marks: slots.map((s) => ({ glyph: glyphOf(s.place, s.kind), dot: dotOf(s, making) })),
        still: opens ?? first.file_id,
        opens,
        slots,
        ...standOf(first, slots, making, { zone: page.zone, paused: page.paused_at !== null }),
      },
    ];
  });
}

/** The rows that need the owner apart, at the top, and the rest under the state's own name. */
function groupsOf(rows: readonly WeekRow[], state: WeekState): WeekGroup[] {
  const needs = rows.filter((r) => r.tone === "you");
  const rest = rows.filter((r) => r.tone !== "you");
  if (state === "paused") return rows.length ? [{ name: W.waiting, tone: "", rows: [...rows] }] : [];
  const restName =
    state === "approved"
      ? rest.some((r) => r.tone === "ok")
        ? W.upAndGoing
        : W.goingUpGroup
      : state === "drafting"
        ? W.soFar
        : needs.length
          ? W.ready
          : W.inOrder;
  return [
    ...(needs.length ? [{ name: W.needsYou, tone: "you" as const, rows: needs }] : []),
    ...(rest.length ? [{ name: restName, tone: "" as const, rows: rest }] : []),
  ];
}

function stateOf(page: WeekPageDto, rows: readonly WeekRow[]): WeekState {
  const plan = page.week.plan;
  if (!page.places.instagram && !page.places.google && !plan) return "unconnected";
  if (page.paused_at && plan && plan.status !== "drafting") return "paused";
  if (!plan) return "unplanned";
  if (plan.status === "drafting") return "drafting";
  if (rows.length === 0) return "nothing";
  return plan.status === "ready" ? "ready" : "approved";
}

/** The places a week goes up on, said: "Instagram and Google". */
const placesSaid = (slots: readonly PlanSlotDto[]): string =>
  [...new Set(slots.map((s) => s.place))].map((p) => W.place[p]).join(" and ");

/** The head of a week that has creatives: its size and days, and how often it goes up and where. */
function sizeHead(page: WeekPageDto, rows: readonly WeekRow[]): Pick<WeekView, "title" | "line"> {
  const live = rows.flatMap((r) => r.slots);
  const size = weekSizeSaid(creativesOf(live));
  const days = weekDaysSaid(live.map((s) => zoneDayKey(Date.parse(s.at), page.zone)));
  return { title: `${size}, ${days}`, line: W.goingUp(live.length, placesSaid(live)) };
}

/** The Week as its page draws it. */
export function weekViewOf(page: WeekPageDto, nowMs: number): WeekView {
  const rows = weekRowsOf(page);
  const state = stateOf(page, rows);
  const plan = page.week.plan;
  const asks = page.week.slots.filter((s) => s.state === "needs_footage" && s.ask);
  const film = asks.map((s) => ({ what: s.ask?.what ?? s.title, why: s.reason ?? "" }));
  const base = {
    state,
    kicker: W.kicker(weekSpanSaid(page.week_of, page.zone, nowMs)),
    act: null,
    moving: false,
    groups: groupsOf(rows, state),
    film,
    filmHead: state === "nothing" ? W.film : W.filmNext,
  };
  const at = (iso: string | null | undefined) => (iso ? slotWhenSaid(iso, page.zone) : "");
  if (state === "unconnected" || state === "unplanned")
    return {
      ...base,
      title: W.empty[state].title,
      line: W.empty[state].line,
      act: state === "unplanned" ? "plan" : null,
    };
  if (state === "drafting") return { ...base, title: W.drafting, line: W.draftingBy, moving: true };
  if (state === "nothing") return { ...base, title: W.nothing, line: W.filmWhy };
  if (state === "paused") return { ...base, title: W.paused, line: W.pausedSince(at(page.paused_at)), act: "resume" };
  const head = sizeHead(page, rows);
  if (state === "ready") return { ...base, ...head, act: "approve" };
  return { ...base, title: W.approvedTitle(head.title), line: W.approved(at(plan?.approved_at)) };
}

/** Whether the Week moves: drafting, or something approved being made. The page asks again while it does. */
export const weekMoving = (view: Pick<WeekView, "moving" | "groups">): boolean =>
  view.moving || view.groups.some((g) => g.rows.some((r) => r.moving));
