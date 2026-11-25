/**
 * A post taken down (00682; the content loop PRD's 5.3 and 8.3; the journey canvas, board Piece, cells 23, 24 and 36 to
 * 40): a remediation, one action for each thing it reached, pending until the place says. Chanlytics asking and the place
 * confirming are two times, kept apart, and a post is taken down only once its place said so. Never an Undo: a post
 * taken down is posted again as a new post.
 */
import { POST_PLACE_SAID, type PostDto, type PostKind, type PostPlace } from "../posts";
import type { RemediationAct, RemediationOutcome, RemediationTarget } from "./sets";
import { TAKE_DOWN_UNCONFIRMED_MS, takeDownUnconfirmedSaid } from "./take-down-late";

/** What a take-down job's door answers a place can give: everything but still waiting, and the owner's own word. */
export type TakeDownSettled = Exclude<RemediationOutcome, "pending" | "left_up">;

/** One thing a take-down reached, as the piece's sheet draws it. */
export interface TakeDownActionDto {
  id: string;
  target: RemediationTarget;
  /** The post, or the ad, it reached. */
  target_id: string;
  act: RemediationAct;
  outcome: RemediationOutcome;
  /** The place's own words, where it gave any. */
  said: string | null;
  /** When Chanlytics asked, and when the place said what came of it. */
  started_at: string;
  finished_at: string | null;
  /**
   * Who chose to leave the post up, on an action that says left_up (00689) and on no other, as its line names them
   * (docs/words.md, "Who did it"): the member reading, or a teammate by the name the roster has; no name where they
   * gave none or have left the workspace since. When is finished_at.
   */
  left_up_by: { you: boolean; name: string | null } | null;
  /** An ad's name, where the action is an ad's. */
  name: string | null;
}

/** The newest take-down of a piece: why it began, when it was asked, and each thing it reached. */
export interface PieceTakeDownDto {
  cause: "owner_removed";
  asked_at: string;
  finished_at: string | null;
  actions: TakeDownActionDto[];
}

/** Where a post stands in being taken down, for its line: asked and waiting, the owner's to do, or late with no answer. */
export type PostComingDown =
  | { is: "asking"; since: string }
  | { is: "unconfirmed"; since: string }
  | { is: "by_hand"; said: string | null }
  | { is: "refused"; said: string | null };

/**
 * Where a post stands in being taken down, from its newest action; null where none is, it came down, or its owner
 * chose to leave it up (its line says who kept it: the dashboard's model/goes.ts).
 */
export function postComingDownOf(
  post: Pick<PostDto, "id">,
  takeDown: PieceTakeDownDto | null,
  nowMs: number,
): PostComingDown | null {
  const action = takeDown?.actions.find((a) => a.target === "post" && a.target_id === post.id && a.act === "take_down");
  if (!action || action.outcome === "done" || action.outcome === "left_up") return null;
  if (action.outcome === "pending")
    return nowMs - Date.parse(action.started_at) > TAKE_DOWN_UNCONFIRMED_MS
      ? { is: "unconfirmed", since: action.started_at }
      : { is: "asking", since: action.started_at };
  if (action.outcome === "needs_person") return { is: "by_hand", said: action.said };
  return { is: "refused", said: action.said };
}

/** When a post came down, as its take-down kept it; null where nothing did. */
export const postCameDownAt = (post: Pick<PostDto, "id">, takeDown: PieceTakeDownDto | null): string | null =>
  takeDown?.actions.find((a) => a.target_id === post.id && a.outcome === "done")?.finished_at ?? null;

/** What a place's kind is called in a list: "Instagram reel", "Instagram story", "Instagram post", "Google". */
export const placementSaid = (place: PostPlace, kind: PostKind): string =>
  place === "google" ? POST_PLACE_SAID[place] : `${POST_PLACE_SAID[place]} ${kind === "picture" ? "post" : kind}`;

export const TAKE_DOWN_WORDS = {
  act: "Take down",
  title: (piece: string) => `Take down “${piece}”?`,
  /** What comes off, what stays, and that it cannot be undone. */
  body: (places: readonly string[]) =>
    `It comes off ${places.join(" and ")}, for good. Its numbers and what it brought stay here.`,
  bodyNowhere: "Nothing of it is up. What waits for its time won't go up.",
  yes: "Take it down",
  no: "Keep",
  will: {
    takeDown: "Chanlytics takes it down",
    /** A place whose delete from here is not proved yet: asked, and the owner's to do where it does not let it. */
    asks: (place: string) => `Chanlytics asks ${place}. If it can't, you delete it there`,
    byHand: (place: string) => `You delete it in ${place}, and Chanlytics checks it's gone`,
    storyGone: "Gone already: a story lasts a day",
    cancel: "Won't go up",
    ad: "Paused, so it stops spending",
  },
  /** The receipt's head: asked, then done. */
  asked: (when: string) => `Taking it down · asked ${when}`,
  done: (when: string) => `Taken down · ${when}`,
  pill: { asking: "Taking it down", byHand: (place: string) => `${place} needs you`, done: "Taken down" },
  /** A placement's line while its take-down runs, and after. */
  asking: (place: PostPlace) => `Taking it down from ${POST_PLACE_SAID[place]}`,
  cameDown: (when: string | null) => (when ? `Taken down · ${when}` : "Taken down"),
  cant: (place: PostPlace) => `Chanlytics can't take this down from ${POST_PLACE_SAID[place]}`,
  cantHow: (place: PostPlace, kind: string) =>
    `Open the ${kind} in ${POST_PLACE_SAID[place]}, then Delete. Chanlytics checks it's gone.`,
  open: (place: PostPlace) => `Open in ${POST_PLACE_SAID[place]}`,
  deleted: "I deleted it",
  /** The third press where a place left the delete to the owner (the canvas's Piece 34): the post stays up. */
  keep: "Keep it up",
  /**
   * A post its owner chose to leave up (Piece 35): who kept it and when, so a teammate reads a choice, never a failure.
   * "Kept up by you · Fri 4:02 PM"; a teammate's reads "Kept up by Sofia".
   */
  keptUp: (by: TakeDownActionDto["left_up_by"], when: string | null) =>
    `Kept up by ${by?.you ? "you" : by?.name || "a teammate"}${when ? ` · ${when}` : ""}`,
  checking: (place: PostPlace) => `Checking with ${POST_PLACE_SAID[place]}`,
  unconfirmed: takeDownUnconfirmedSaid,
  unconfirmedNote: (when: string) => `Asked ${when}. Chanlytics keeps checking and says here when it's gone.`,
  stillUp: (place: PostPlace) => `It's still on ${POST_PLACE_SAID[place]}. Delete it there, then say so here.`,
  adPaused: (when: string | null) => (when ? `Paused · ${when}` : "Paused"),
  adShowing: "The ad showing it",
  wontGoUp: "Won't go up",
  nothing: "Nothing of it is up or waiting.",
  begun: "Taking it down.",
} as const;

/**
 * What the bell says of a take-down (00682; the canvas's Today 6): a piece gone from every place it was asked down from,
 * and one a place would not take down for Chanlytics, which its owner deletes there. A piece that cannot be named is
 * "A post", never a blank title. The second is closed by the first (waits/notice-mends.ts holds both titles).
 */
export const TAKE_DOWN_BELL = {
  down: (piece: string) => `Taken down · ${piece || "A post"}`,
  downFrom: (places: readonly PostPlace[]) => `From ${places.map((place) => POST_PLACE_SAID[place]).join(" and ")}`,
  byHand: (place: PostPlace, piece: string) => `Delete it in ${POST_PLACE_SAID[place]} · ${piece || "A post"}`,
  byHandWhy: "Chanlytics couldn't take it down there",
} as const;
