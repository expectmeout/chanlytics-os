/**
 * Where a made piece stands, as its tile says it (Campaigns › Content): the piece's one standing
 * (standing.ts pieceStandingOf) turned into the tile's mark, its words and its tone, and whether the page should ask
 * again while a post moves. Apart from the page's words (../page.ts), which the frame reads on every page for a tab's
 * name: only the Content page reads a mark, and only it carries the standing's rules.
 */
import type { FileDto } from "../../files/views";
import { CONTENT_WORDS, type ContentPageDto } from "../page";
import { linkPlaceSaid, type HandPostDto, type PostDto, type PostPlace } from "../posts";
import { pieceStandingOf, videoIsSavedOnly } from "./standing";
import { TAKE_DOWN_WORDS } from "./take-down";

/** Where a made piece stands, as its tile says it. */
export type ContentMark =
  | { is: "ready" }
  /** A video AI made that has no road from here (Instagram takes no reel from this workspace now): saved, and posted from the phone. */
  | { is: "save" }
  | { is: "going"; place: PostPlace }
  /** Set for its time at a place, and that time: the soonest, where two wait. Not moving yet, so nothing turns. */
  | { is: "timed"; place: PostPlace; at: string }
  /** Up, at each place, and when the newest of them went up (null where no time is kept). */
  | { is: "posted"; places: PostPlace[]; at: string | null }
  /** Held before its send, or refused: the file's own sheet says why. */
  | { is: "stuck"; place: PostPlace }
  /** Sent, and its place was never seen holding it: nobody can say it is up. */
  | { is: "unsure"; place: PostPlace }
  /** Nothing of it is up any more, and the last of it was a story that ran its day: where, and when it ended. */
  | { is: "ended"; place: PostPlace; at: string | null }
  /** Nothing of it is up any more, and the last of it came down: where, and when, where that was kept. */
  | { is: "down"; place: PostPlace; at: string | null }
  /** Posted by its owner's own hand, as they said (00620): when they said so, and where its link says, if it has one. */
  | { is: "by_hand"; at: string; where: string | null };

/**
 * Where a made piece stands, as its tile, its row and Today count it: where its posts say (contentMarkOf); with none
 * out from here, what its owner said they posted themselves; and a video with no road from here is to be saved, never
 * "ready to post". `reels`: whether Instagram takes a reel from this workspace now, as the page's read says.
 */
export function contentPieceMarkOf(
  piece: { file: Pick<FileDto, "kind">; posts: readonly PostDto[]; by_hand?: HandPostDto | null },
  nowMs: number,
  reels: boolean,
): ContentMark {
  const mark = contentMarkOf(piece.posts, nowMs);
  if (mark.is !== "ready" && mark.is !== "ended" && mark.is !== "down") return mark;
  // Nothing sent from here stands anywhere: what its owner said they posted themselves is where it stands.
  if (piece.by_hand) return { is: "by_hand", at: piece.by_hand.at, where: linkPlaceSaid(piece.by_hand.link) };
  if (mark.is !== "ready") return mark;
  return videoIsSavedOnly(piece.file, piece.posts, reels) ? { is: "save" } : mark;
}

/**
 * Where a made piece stands, from its posts: the piece's one standing (standing.ts pieceStandingOf), as a
 * tile says it. What needs the owner first, then what is going up now, then what waits for its time, then what is up,
 * then what last happened where nothing of it is up any more; "ready" only for a piece that never went out.
 */
export function contentMarkOf(posts: readonly PostDto[], nowMs: number): ContentMark {
  const { lead } = pieceStandingOf(posts, null, nowMs);
  if (lead.is === "never") return { is: "ready" };
  const { place } = lead.at;
  if (lead.is === "stopped") return { is: "stuck", place };
  if (lead.is === "unconfirmed") return { is: "unsure", place };
  if (lead.is === "going_up") return { is: "going", place };
  if (lead.is === "waiting") return { is: "timed", place, at: lead.when };
  if (lead.is === "up") return { is: "posted", places: [...new Set(lead.all.map((at) => at.place))], at: lead.when };
  return { is: lead.is === "ended" ? "ended" : "down", place, at: lead.when };
}

/**
 * A mark in the owner's words. A made video is ready to save only where it has no road from here (contentPieceMarkOf).
 * `dayOf` says a day by the business's own clock.
 */
export function contentMarkSaid(mark: ContentMark, dayOf: (at: string) => string): string {
  if (mark.is === "going") return CONTENT_WORDS.mark.going(mark.place);
  if (mark.is === "unsure") return CONTENT_WORDS.mark.unsure(mark.place);
  if (mark.is === "ended") return CONTENT_WORDS.mark.ended(mark.at ? dayOf(mark.at) : null);
  if (mark.is === "down") return TAKE_DOWN_WORDS.cameDown(mark.at ? dayOf(mark.at) : null);
  if (mark.is === "timed") return CONTENT_WORDS.mark.timed(dayOf(mark.at));
  if (mark.is === "posted") return CONTENT_WORDS.mark.posted(mark.places, mark.at ? dayOf(mark.at) : null);
  if (mark.is === "stuck") return CONTENT_WORDS.mark.stuck;
  if (mark.is === "by_hand") return CONTENT_WORDS.mark.byHand(mark.where, dayOf(mark.at));
  if (mark.is === "save") return CONTENT_WORDS.mark.save;
  return CONTENT_WORDS.mark.ready;
}

/**
 * A mark's tone, as its dot draws it: grey ready, and grey too where nothing of it is up any more; the accent turning
 * while it moves, the accent still while it waits for its time, green out, amber where it needs the owner.
 */
export type ContentMarkTone = "ready" | "going" | "timed" | "up" | "need";

export const contentMarkToneOf = (mark: ContentMark): ContentMarkTone => {
  if (mark.is === "posted" || mark.is === "by_hand") return "up";
  if (mark.is === "stuck" || mark.is === "unsure") return "need";
  return mark.is === "going" || mark.is === "timed" ? mark.is : "ready";
};

/**
 * Whether the page should be read again on its own: a video still being made, or a post going up now. Neither is told to a
 * page by the feed (00611, 00613), so the page asks while one moves and stops when none does. A post set for later is not
 * moving: the page does not ask all week for it. A place read for its photos and videos is not asked after either: what it
 * brings, its ledger's run and the website's read are told by the feed as they land (00480, 00551), and the card reads itself
 * once more where a run ends unheard (sources.ts `reading_until`).
 */
export function contentMoving(page: ContentPageDto, nowMs: number): boolean {
  return (
    page.making.some((m) => m.status === "making") ||
    page.made.some((m) => contentMarkOf(m.posts, nowMs).is === "going")
  );
}
