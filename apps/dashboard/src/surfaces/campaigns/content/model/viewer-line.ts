/**
 * What a piece opened on a phone says of itself (the content canvas, board PhView): the line under its name (or why a post
 * stopped), its words, what it was made from, its days, what a place's row says, and Details' rows, each from what its
 * records hold (the piece, its posts, GET files/[id]). Pure: the viewer (viewer/viewer.tsx) draws what these say. Nothing is
 * said before it is known, and nothing waits on the record: before it has come, the line says what it is and when it was
 * made; a video's clips are counted once its plan has been read (`video.plan`), and a post says the photo it came from only
 * while that photo is still here.
 */
import {
  CONTENT_WORDS,
  FILE_WORDS,
  MIN_MS,
  clockDate,
  clockNear,
  clockOf,
  clockTime,
  localDaysBetween,
  pieceCountOf,
  pieceFileIdsOf,
  postCaptionOf,
  type FileDto,
  type FileMade,
  type PiecePlan,
  type PostDto,
} from "@chanlytics/contracts";
import type { PieceStandsAt } from "./piece-open";

const W = CONTENT_WORDS.viewer;

/** How many days either side of today a day is said by its weekday, past which its date. */
const WEEKDAY_SPAN = 6;

/** How long a post that went up is said to have gone up "just now", as the press that sent it is still in mind. */
const JUST_NOW_MS = 5 * MIN_MS;

/**
 * A day near the business's today, as the viewer says it: "today", "yesterday", "tomorrow", its whole weekday within six
 * days ("Monday"), else its date ("Nov 3"). Lower case: the words it sits in start the sentence ("Posted Monday").
 */
export function viewerDayOf(atMs: number, zone: string, nowMs: number): string {
  const gap = localDaysBetween(nowMs, atMs, zone);
  if (Math.abs(gap) <= 1) return clockNear(atMs, zone, nowMs);
  if (Math.abs(gap) <= WEEKDAY_SPAN)
    return new Intl.DateTimeFormat("en-US", { timeZone: zone, weekday: "long" }).format(new Date(atMs));
  return clockDate(atMs, zone, nowMs);
}

/** "Sat, 9:00 AM", "tomorrow, 9:00 AM": when a post that waits for its time goes up. */
export function viewerAheadOf(atMs: number, zone: string, nowMs: number): string {
  return W.at(clockNear(atMs, zone, nowMs), clockTime(atMs, zone));
}

/** "Today at 9:41", "Monday at 9:41": when a piece was made, for Details. */
function viewerMadeAtOf(atMs: number, zone: string, nowMs: number): string {
  return W.dayAt(viewerDayOf(atMs, zone, nowMs), clockTime(atMs, zone));
}

/** "today, 9:41", "Monday, 9:41": the same, inside a line ("Made today, 9:41"), where a capital read as a stray. */
function viewerMadeInLineOf(atMs: number, zone: string, nowMs: number): string {
  return W.at(viewerDayOf(atMs, zone, nowMs), clockTime(atMs, zone));
}

/** How the viewer says a day and a time ahead, by the business's own clock (viewerDayOf, viewerAheadOf). */
export interface ViewerClock {
  day: (at: string) => string;
  ahead: (at: string) => string;
}

/** What a piece was made from, as its record says: the files a video's plan names, or the photo a post came from. */
interface ViewerFrom {
  /** "4 of your clips", "one of your photos". */
  said: string;
  /** The files it was made from, in the order the plan first names them: their pictures in Details. */
  ids: string[];
}

/** What a piece was made from, or null where its record says nothing (not read yet, or gone with the card that asked). */
function viewerFromOf(record: { video: PiecePlan | null; made: FileMade | null }): ViewerFrom | null {
  if (record.video) {
    const count = pieceCountOf(record.video);
    if (count.clips + count.photos === 0) return null;
    return { said: W.from(count.clips, count.photos), ids: pieceFileIdsOf(record.video) };
  }
  const from = record.made?.from;
  if (!from || !record.made) return null;
  // A post drawn from a moment of a video came from a clip; any other from a photo.
  return { said: record.made.plan.at === null ? W.from(0, 1) : W.fromClip, ids: [from.id] };
}

/** What it is: "Video · 0:10", "Picture post", "Photo", "Clip · 0:12". */
function viewerKindOf(file: Pick<FileDto, "kind" | "source" | "seconds">): string {
  const clock = file.seconds !== null ? clockOf(file.seconds) : null;
  const piece = CONTENT_WORDS.piece;
  if (file.source !== "made") return file.kind === "video" && clock ? piece.clip(clock) : piece.photo;
  return file.kind === "video" && clock ? piece.video(clock) : piece.picture;
}

/**
 * The line under the name: what it is, when Ask made it and from what ("Video · 0:10 · made today from 4 of your clips",
 * "Picture post · made yesterday from one of your photos"). A file of the Library says what it is alone.
 */
function viewerLineOf(
  file: Pick<FileDto, "kind" | "source" | "seconds">,
  origin: { day: string; from: ViewerFrom | null },
): string {
  const kind = viewerKindOf(file);
  if (file.source !== "made") return kind;
  const when = origin.from ? `${W.made(origin.day)} ${W.madeFrom(origin.from.said)}` : W.made(origin.day);
  return `${kind} · ${when}`;
}

/**
 * What a place's row says in the list of places (post-both.tsx): Not yet, Posting, Posted just now, Posted Monday, Didn't
 * post, or when one that waits goes up.
 */
export function viewerStandsSaid(stands: PieceStandsAt, clock: ViewerClock): string {
  const words = CONTENT_WORDS.piece.stands;
  if (stands.is === "up" && stands.at && Date.now() - Date.parse(stands.at) < JUST_NOW_MS) return words.justNow;
  if (stands.is === "up") return words.up(stands.at ? clock.day(stands.at) : null);
  if (stands.is === "timed") return clock.ahead(stands.at);
  return words[stands.is];
}

/** What the viewer reads of the piece's record. */
export interface ViewerRecord {
  made: FileMade | null;
  video: PiecePlan | null;
}

/** One row of Details: what it says of the piece, and what is true of it. */
interface ViewerFact {
  label: string;
  said: string;
  /** The same said inside a line after its label (a post's one sheet: "Made today, 9:41"), where it differs. */
  inLine?: string;
}

/** What Details shows: the piece, its name and what it is, its words, what it was made from, and its rows. */
export interface ViewerDetailsShown {
  file: FileDto;
  name: string;
  /** "Video · 0:10 · 1080 × 1920". */
  sub: string;
  /** The words that go with it, where it has any. */
  words: string | null;
  from: ViewerFrom | null;
  facts: readonly ViewerFact[];
}

/**
 * The words that go with a piece: a post's, the caption as the owner wrote it in Details (none, where they cleared it), else
 * what went with it to a place, newest first, else what Ask wrote from the picture (the composer's start, model/post-both.ts);
 * a video's, its caption (pieces.ts PiecePlan), which the owner's words are kept over, none on one made before Ask wrote
 * them; a photo of the Library's, none.
 */
function viewerWordsOf(file: FileDto, posts: readonly PostDto[], record: ViewerRecord): string | null {
  if (file.source !== "made") return null;
  if (file.kind === "video") return record.video?.caption ?? null;
  // One reading, in contracts: what Details says is what Post it sends and what Ask's card proposes.
  return postCaptionOf(posts, record.made);
}

/**
 * Details' rows: when it was made, and by whom; a video's sound. Where it stands at each place is the status row's and its
 * list's alone (model/places.ts), said once.
 */
function viewerRowsOf(file: FileDto, clock: { madeAt: string; madeInLine: string }): ViewerFact[] {
  const facts = W.facts;
  if (file.source !== "made")
    return [{ label: facts.added, said: `${clock.madeAt} · ${FILE_WORDS.sources[file.source]}` }];
  // When, alone: every piece here is Ask's, so "by Ask" said nothing.
  const rows: ViewerFact[] = [{ label: facts.made, said: clock.madeAt, inLine: clock.madeInLine }];
  if (file.kind === "video") rows.push({ label: facts.sound, said: file.sound_said ?? FILE_WORDS.video.notHeardYet });
  return rows;
}

/** What the viewer says of a piece: the line under its name, its words, and what Details shows. */
interface ViewerSays {
  line: string;
  words: string | null;
  details: ViewerDetailsShown;
}

export function viewerSaidOf(
  piece: { file: FileDto; posts: readonly PostDto[]; name: string },
  record: ViewerRecord,
  clock: ViewerClock & { zone: string },
): ViewerSays {
  const { file, posts, name } = piece;
  const now = Date.now();
  const created = Date.parse(file.created_at);
  const from = viewerFromOf(record);
  const words = viewerWordsOf(file, posts, record);
  // What it is: why a post stopped is the status row's list's to say, beside its place (Ruben, 12 Nov 2026: said once).
  const line = viewerLineOf(file, { day: clock.day(file.created_at), from });
  const kind = viewerKindOf(file);
  const size = file.width && file.height ? ` · ${W.size(file.width, file.height)}` : "";
  return {
    line,
    words,
    details: {
      file,
      name,
      sub: `${kind}${size}`,
      words,
      from,
      facts: viewerRowsOf(file, {
        madeAt: viewerMadeAtOf(created, clock.zone, now),
        madeInLine: viewerMadeInLineOf(created, clock.zone, now),
      }),
    },
  };
}
