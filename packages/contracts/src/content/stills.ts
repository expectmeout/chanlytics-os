/**
 * A still from a video (the content redesign's stage 3): one moment of a clip or a video Ask made, kept as a photo of the
 * library, as one taken would be, so a post can be made from it like any photo, and the look reads it. The moments offered
 * are spread across the video; each is the picture the edge cuts of it (files/kinds.ts fileFramePathOf), the one a post
 * from that moment would be drawn from.
 */
import { postMomentWont } from "../files/post";

/** Where across a video the offered moments stand, first to last. */
const STILL_SPREAD = [0.1, 0.3, 0.5, 0.7, 0.9] as const;

/** The moments a video offers as stills, in seconds to the tenth: none for one that is not ready, or has no length yet. */
export function stillMomentsOf(video: { kind: string; media_status: string | null; seconds: number | null }): number[] {
  if (video.kind !== "video" || video.media_status !== "ready" || !video.seconds) return [];
  const seconds = video.seconds;
  return STILL_SPREAD.map((at) => Math.round(seconds * at * 10) / 10);
}

/** Whether a moment can be kept as a still of this video: it is one, and the moment is inside it. */
export const stillWont = (video: { kind: string; seconds: number | null }, at: number): boolean =>
  video.kind !== "video" || postMomentWont(video, at) !== null;

/** A still's name: the video's, and where in it, so two stills of one clip are told apart (`wash-day-at-0-12`). */
export function stillNameOf(videoName: string, at: number): string {
  const whole = Math.floor(at);
  return `${videoName}-at-${Math.floor(whole / 60)}-${String(whole % 60).padStart(2, "0")}`;
}

/** What the still's panel says. */
export const STILL_WORDS = {
  open: "Save a still",
  says: "Pick a moment. It's kept as a photo in your Library, ready to make a post from.",
  moment: (clock: string) => `The moment at ${clock}`,
  keep: "Keep this still",
  cancel: "Cancel",
  kept: "Kept in your Library.",
  pick: "Pick a moment first.",
  wont: "That moment isn't in this video.",
  notReady: "This video isn't ready yet. Try again once it plays.",
} as const;
