/**
 * The Week, as its page draws it (the content loop PRD's 21.2; the approved boards, Week 1-12, canvas 1795421968-f15f):
 * which of its states it stands in, its head, its groups of rows, each creative once with its places as marks or its one
 * fix, and what to film at its foot. Pure, so the page, its tests and AI read one Week. Every sentence is WEEK_WORDS'.
 */
import { clockDate, clockTime, wallClockAt, zoneDayKey } from "../../shared/clock";
import { shiftKey } from "../../shared/zone/day-keys";
import { placementStandingOf, standingOnItsWay, type PlacementStanding } from "../placements/standing";
import { STANDING_WORDS } from "../placements/standing-words";
import { postStoppedWhyOf, type PostDto, type PostKind, type PostPlace } from "../posts";
import { creativesOf, weekdayShortOf, weekSizeSaid, type PlanSlotDto } from "./week";
import { slotTimePassed, weekApprovedByAI, weekEndingOf, weekEndingSaid, weekLeftOut } from "./week-endings";
import type { WeekPageDto, WeekPieceDto } from "./week-page";
import { WEEK_WORDS as W, weekDaysSaid } from "./words";

/** Where the Week stands, one of the board's nine (the week that passed is pass 2's line over any of them). */
export type WeekState = "unconnected" | "unplanned" | "nothing" | "drafting" | "ready" | "approved" | "paused";

/** A place as a mark on a row: what it goes as there, and its dot where it is not plain (amber needs you, green up). */
export interface WeekMark {
  glyph: "reel" | "story" | "post" | "pin";
  dot: "" | "you" | "ok";
}

/** A row's one fix, where it waits on the owner (`time`: another time picked for a slot whose own has passed). */
export interface WeekFix {
  act: "offer" | "again" | "post" | "connect" | "open" | "time";
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
  act: "approve" | "stop" | "resume" | "plan" | null;
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

/** A slot with the post it was made into, and where that post stands (placements/standing.ts: the one reading). */
interface SlotStands {
  slot: PlanSlotDto;
  post: PostDto;
  standing: PlacementStanding;
}

/** Where a slot's post stands, where the slot was made into one. */
function slotStandsOf(slot: PlanSlotDto, making: Made, nowMs: number): SlotStands | null {
  const post = slot.post_id ? making.posts.get(slot.post_id) : undefined;
  return post ? { slot, post, standing: placementStandingOf(post, null, nowMs) } : null;
}

/** A post that did not go and waits on its owner: held or refused, or let go because its day passed. */
const didNotGo = (standing: PlacementStanding): boolean =>
  standing.is === "stopped" || (standing.is === "let_go" && standing.late);

/** A slot's dot: amber where its post needs its owner, green while it is up, plain otherwise. */
function dotOf(slot: PlanSlotDto, making: Made, nowMs: number): WeekMark["dot"] {
  const at = slotStandsOf(slot, making, nowMs);
  if (!at) return slot.state === "blocked" ? "you" : "";
  if (at.standing.is === "up") return "ok";
  return didNotGo(at.standing) || at.standing.is === "unconfirmed" ? "you" : "";
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

type RowStands = Pick<WeekRow, "line" | "tone" | "fix" | "moving">;

/** A row's line where it only says where it stands: no fix, nothing moving. */
const rowSays = (line: string, tone: WeekRow["tone"] = ""): RowStands => ({ line, tone, fix: null, moving: false });

/** A row whose post needs its owner: its line in amber, and Open. */
const rowNeeds = (line: string): RowStands => ({
  line,
  tone: "you",
  fix: { act: "open", label: W.fix.open },
  moving: false,
});

/**
 * A creative's line from the posts its slots were made into, or null where none says anything yet. What needs its
 * owner first, then what is still on its way, then what is up, then what last happened: a post that came down or a
 * story that ran its day never reads "Goes up Sat 9:00" (the review of 24 Nov 2026, A8).
 */
function postsStandOf(
  first: PlanSlotDto,
  stands: readonly SlotStands[],
  at: { zone: string; paused: boolean },
): RowStands | null {
  const stopped = stands.find((s) => didNotGo(s.standing));
  if (stopped) return rowNeeds(STANDING_WORDS.stopped.week(stopped.post.place, postStoppedWhyOf(stopped.post) ?? ""));
  const unsure = stands.find((s) => s.standing.is === "unconfirmed");
  if (unsure) return rowNeeds(STANDING_WORDS.unconfirmed.week(unsure.post.place));
  if (at.paused && first.state !== "proposed") return rowSays(W.waits(slotWhenSaid(first.at, at.zone)));
  const moving = stands.find((s) => standingOnItsWay(s.standing));
  if (moving) return rowSays(STANDING_WORDS.waiting.week(slotWhenSaid(moving.slot.at, at.zone)));
  const up = stands.filter((s) => s.standing.is === "up");
  if (up.length > 0)
    return rowSays(
      STANDING_WORDS.up.week(
        up.map((s) => s.post.place),
        weekdayShortOf(zoneDayKey(Date.parse(first.at), at.zone)),
      ),
      "ok",
    );
  const last =
    stands.find((s) => s.standing.is === "came_down") ??
    stands.find((s) => s.standing.is === "ended") ??
    stands.find((s) => s.standing.is === "let_go");
  if (!last) return null;
  if (last.standing.is === "ended") return rowSays(STANDING_WORDS.ended.week);
  if (last.standing.is !== "came_down") return rowSays(STANDING_WORDS.let_go.week);
  return rowSays(last.standing.there ? STANDING_WORDS.removed.week(last.post.place) : STANDING_WORDS.came_down.week);
}

/** One creative's line, tone and fix, as its slots and what they were made into stand. */
function standOf(
  first: PlanSlotDto,
  slots: readonly PlanSlotDto[],
  making: Made,
  at: { zone: string; paused: boolean; nowMs: number },
): RowStands {
  const when = slotWhenSaid(first.at, at.zone);
  const held = slots.find((s) => s.state === "blocked");
  if (held) return { line: held.blocked_reason ?? W.fix.open, tone: "you", fix: fixOfHeld(held), moving: false };
  // No approval puts up a slot whose time has passed (week-endings.ts): it says so, and its one fix picks another.
  if (slots.some((s) => s.state === "proposed" && slotTimePassed(s.at, at.nowMs)))
    return { line: W.timePassed, tone: "you", fix: { act: "time", label: W.fix.time }, moving: false };
  const stands = slots.flatMap((s) => slotStandsOf(s, making, at.nowMs) ?? []);
  const posted = postsStandOf(first, stands, at);
  if (posted) return posted;
  if (first.state !== "approved") return { line: when, tone: "", fix: null, moving: false };
  const piece = first.piece_id ? making.pieces.get(first.piece_id) : undefined;
  if (piece?.status === "failed")
    return { line: W.videoFailed, tone: "you", fix: { act: "again", label: W.fix.again }, moving: false };
  if (piece?.status === "made")
    return { line: W.videoMade(when), tone: "you", fix: { act: "post", label: W.fix.post }, moving: false };
  return { line: piece ? W.videoMaking : W.making, tone: "", fix: null, moving: true };
}

/** Each creative of a week once, in time order, with the slots asking for footage and those left out aside. */
export function weekRowsOf(
  page: Pick<WeekPageDto, "week" | "made" | "pieces" | "zone" | "paused_at">,
  nowMs: number,
): WeekRow[] {
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
        marks: slots.map((s) => ({ glyph: glyphOf(s.place, s.kind), dot: dotOf(s, making, nowMs) })),
        still: opens ?? first.file_id,
        opens,
        slots,
        ...standOf(first, slots, making, { zone: page.zone, paused: page.paused_at !== null, nowMs }),
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

/** A ready week's head that is not held to a time: why AI did not approve it, where it did not; else how often it goes. */
function readyHead(page: WeekPageDto, head: Pick<WeekView, "title" | "line">, nowMs: number) {
  const ending = weekEndingOf(page.week, { rung: page.rung, paused: false, nowMs });
  const ended = ending ? weekEndingSaid(ending, "").head : null;
  return { ...head, line: ended ?? head.line, act: ending?.is === "nothing" ? null : ("approve" as const) };
}

/** An approved week's line: who approved it (AI, where nobody's press did), when, and whether anything was left out. */
function approvedLine(page: WeekPageDto, when: string, nowMs: number): string {
  const plan = page.week.plan;
  const ending =
    plan && weekApprovedByAI(plan) ? weekEndingOf(page.week, { rung: page.rung, paused: false, nowMs }) : null;
  if (ending) return weekEndingSaid(ending, when).head ?? "";
  const left = weekLeftOut(page.week.slots, nowMs);
  return `${W.approvedBy.owner(when)} ${left > 0 ? W.leftOut(left) : W.eachGoes}`;
}

/** The Week as its page draws it. */
export function weekViewOf(page: WeekPageDto, nowMs: number): WeekView {
  const rows = weekRowsOf(page, nowMs);
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
  // A week AI may approve, held to its time (00714, board B5): the head says when, and its one press stops it.
  if (state === "ready" && plan?.goes_at)
    return { ...base, title: head.title, line: W.held(clockTime(Date.parse(plan.goes_at), page.zone)), act: "stop" };
  if (state === "ready") return { ...base, ...readyHead(page, head, nowMs) };
  return { ...base, title: W.approvedTitle(head.title), line: approvedLine(page, at(plan?.approved_at), nowMs) };
}

/** Whether the Week moves: drafting, or something approved being made. The page asks again while it does. */
export const weekMoving = (view: Pick<WeekView, "moving" | "groups">): boolean =>
  view.moving || view.groups.some((g) => g.rows.some((r) => r.moving));
