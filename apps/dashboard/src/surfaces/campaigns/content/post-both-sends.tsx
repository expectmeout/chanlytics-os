/**
 * What the post sheet's presses do (post-both.tsx holds its draft and draws it): one press sent to each place through that
 * place's own door, a post set for its time moved to another, and what the sheet opens holding. Apart from the sheet, so
 * each is short enough to follow.
 */
import { useState } from "react";
import {
  CONTENT_SHEET_WORDS,
  POST_PLACES,
  newestAtEachPlace,
  postPlaceTakenOf,
  type InstagramPostKind,
  type PostDto,
  type PostPlace,
} from "@chanlytics/contracts";
import { pageClock } from "@/bridge/zone";
import type { FrameFlash } from "../../frame-verbs";
import { fileVerbs, postDoors } from "../../files/verbs";
import { postBothBegins, type PostBothDraft } from "./model/post-both";
import { instagramAsOf, instagramKindsFree, pieceStandsAt, type PieceTakes } from "./model/piece-open";

/** Why each place that refused a post did, in its own words. */
export type Refusals = Partial<Record<PostPlace, string>>;

/** A post set for its time, being moved to another: which post, where, as what, and the time picked for it. */
interface PostMoving {
  post: string;
  place: PostPlace;
  kind: InstagramPostKind;
  at: number;
}

/**
 * One press, through each place's own door at once: the places that took it, and why each other one did not. `words` are the
 * words on screen, which each door keeps on the piece as it posts.
 */
export async function sendToEach(
  id: string,
  sending: PostBothDraft,
  words: string,
  when?: string,
): Promise<{ sent: PostPlace[]; refused: Refusals; kept: string | null }> {
  const places = POST_PLACES.filter((place) => sending[place]);
  const answers = await Promise.all(places.map((place) => postDoors[place].begin(id, sending.as, words, when)));
  const sent: PostPlace[] = [];
  const refused: Refusals = {};
  places.forEach((place, i) => {
    const answer = answers[i];
    if (answer?.ok) sent.push(place);
    else if (answer) refused[place] = answer.message;
  });
  // A story carries no words, so its door keeps none: only Google's, or Instagram's picture, kept these on the piece.
  const carried = sent.includes("google") || (sent.includes("instagram") && sending.as === "picture");
  return { sent, refused, kept: carried ? words : null };
}

/**
 * Change time (00621): a post set for its time, moved to another in the foot. The same post in one step, through its file's
 * one door for it, whatever its place; refused, it keeps its time, and why is said under its place.
 */
export function usePostMove(
  piece: { id: string; posts: readonly PostDto[] },
  tell: {
    done: (places: readonly PostPlace[]) => void;
    flash: (f: FrameFlash) => void;
    refused: (why: Refusals) => void;
  },
) {
  const [moving, setMoving] = useState<PostMoving | null>(null);
  const [busy, setBusy] = useState(false);
  const move = async (m: PostMoving) => {
    setBusy(true);
    const moved = await fileVerbs.movePost(piece.id, m.post, new Date(m.at).toISOString());
    setBusy(false);
    setMoving(null);
    tell.refused(moved.ok ? {} : { [m.place]: moved.message });
    if (moved.ok) tell.flash({ msg: <>{CONTENT_SHEET_WORDS.places.moved(m.place, pageClock().when(m.at))}</> });
    tell.done(moved.ok ? [m.place] : []);
  };
  return {
    moving,
    busy,
    /** Change time, beside a post set for its time: the foot asks for another, starting from its own. */
    begin: (postId: string) => {
      const post = piece.posts.find((p) => p.id === postId);
      if (!post) return;
      tell.refused({});
      const kind = post.kind === "story" ? "story" : "picture";
      setMoving({ post: post.id, place: post.place, kind, at: Date.parse(post.scheduled_for) });
    },
    to: (at: number) => setMoving((m) => (m ? { ...m, at } : m)),
    stop: () => setMoving(null),
    /** Moves it to the time picked; answers once its door has. */
    move: (): Promise<void> => (moving && moving.at > Date.now() ? move(moving) : Promise.resolve()),
  };
}

/**
 * What the list opens holding (usePostBoth begin): what stopped, alone, where it can take a post again; else every place that
 * can take it and holds nothing of the piece yet. One it is up at, or on its way to (Instagram, where a story could still go
 * beside a post that waits: 00620), is switched on by hand, never by opening the list. A place that stopped and can take none
 * now (disconnected since) leaves nothing on: Post again was pressed for it, so another place is never switched on in its stead.
 */
export function postBothOpening(open: PieceTakes, posts: readonly PostDto[], nowMs: number): PostBothDraft {
  const begun = postBothBegins(open);
  const stands = (place: PostPlace) => pieceStandsAt(posts, place, nowMs).is;
  const stopped = POST_PLACES.filter((place) => stands(place) === "stuck");
  const fresh = (place: PostPlace) => stands(place) !== "up" && !postPlaceTakenOf(posts, place);
  const on = (place: PostPlace) =>
    stopped.length > 0 ? begun[place] && stopped.includes(place) : begun[place] && fresh(place);
  // A story that stopped is tried again as a story; else the kind Instagram can take now, a post before a story.
  const last = newestAtEachPlace(posts).find((p) => p.place === "instagram");
  const again = stopped.includes("instagram") && last?.kind === "story" ? "story" : begun.as;
  return { as: instagramAsOf(instagramKindsFree(posts), again), instagram: on("instagram"), google: on("google") };
}
