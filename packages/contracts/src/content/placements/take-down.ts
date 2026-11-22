/**
 * A post taken down (00692; the content loop PRD's 5.3 and 8.3; the journey canvas, board Piece, cells 23, 24 and 36 to
 * 40): a remediation, one action for each thing it reached, pending until the place says. Chanlytics asking and the place
 * confirming are two times, kept apart, and a post is taken down only once its place said so. Never an Undo: a post
 * taken down is posted again as a new post.
 */
import { asText, type ProposalSpecAboveOperator } from "../../ask/proposals/spec";
import { DAY_MS } from "../../shared/time";
import { contentRouteOf } from "../address";
import { POST_PLACE_SAID, type PostDto, type PostKind, type PostPlace } from "../posts";

/** What a remediation's action came to (00676 remediation_actions.outcome). */
export const REMEDIATION_OUTCOMES = ["done", "pending", "blocked", "not_possible", "needs_person"] as const;
export type RemediationOutcome = (typeof REMEDIATION_OUTCOMES)[number];

/** What a remediation does to what it reached (00676 remediation_actions.act). */
export const REMEDIATION_ACTS = ["cancel", "pause", "take_down"] as const;
export type RemediationAct = (typeof REMEDIATION_ACTS)[number];

/** What a remediation reaches (00676 remediation_actions.target_type). */
export const REMEDIATION_TARGETS = ["post", "ad", "scheduled_post"] as const;
export type RemediationTarget = (typeof REMEDIATION_TARGETS)[number];

/** What a take-down job's door answers a place can give: everything but still waiting. */
export type TakeDownSettled = Exclude<RemediationOutcome, "pending">;

/** After this long with no answer from a place, a take-down is Chanlytics's to chase, and the piece says so. */
export const TAKE_DOWN_UNCONFIRMED_MS = DAY_MS;

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
  /** An ad's name, where the action is an ad's. */
  name: string | null;
}

/** The newest take-down of a piece: why it began, when it was asked, and each thing it reached. */
export interface PieceTakeDownDto {
  cause: "owner_removed" | "yes_taken_back" | "person_erased";
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

/** Where a post stands in being taken down, from its newest action; null where none is, or it came down. */
export function postComingDownOf(
  post: Pick<PostDto, "id">,
  takeDown: PieceTakeDownDto | null,
  nowMs: number,
): PostComingDown | null {
  const action = takeDown?.actions.find((a) => a.target === "post" && a.target_id === post.id && a.act === "take_down");
  if (!action || action.outcome === "done") return null;
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
  place === "instagram" ? `Instagram ${kind === "picture" ? "post" : kind}` : POST_PLACE_SAID[place];

/** One line of the confirm: a placement, or the ad that shows the piece, and what the press does to it. */
export interface TakeDownWill {
  key: string;
  glyph: "reel" | "story" | "post" | "google" | "ad";
  name: string;
  will: string;
}

const STORY_LASTS_MS = DAY_MS;

export const TAKE_DOWN_WORDS = {
  act: "Take down",
  title: (piece: string) => `Take down “${piece}”?`,
  /** What comes off, what stays, and that it cannot be undone. */
  body: (places: readonly string[]) =>
    `It comes off ${places.join(" and ")}. Its numbers and what it brought stay here. This can't be undone.`,
  bodyNowhere: "Nothing of it is up. What waits for its time won't go up.",
  yes: "Take it down",
  no: "Keep",
  will: {
    takeDown: "Chanlytics takes it down",
    /** A place whose delete from here is not proved yet: asked, and the owner's to do where it does not let it. */
    asks: (place: string) => `Chanlytics asks ${place}. If it can't, you delete it there`,
    byHand: (place: string) => `You delete it in ${place}; Chanlytics checks it's gone`,
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
  checking: (place: PostPlace) => `Checking with ${POST_PLACE_SAID[place]}`,
  unconfirmed: (place: PostPlace) => `${POST_PLACE_SAID[place]} hasn't confirmed it's gone · Chanlytics is on it`,
  unconfirmedNote: (when: string) => `Asked ${when}. Chanlytics keeps checking and says here when it's gone.`,
  stillUp: (place: PostPlace) => `It's still on ${POST_PLACE_SAID[place]}. Delete it there, then say so here.`,
  adPaused: (when: string | null) => (when ? `Paused · ${when}` : "Paused"),
  adShowing: "The ad showing it",
  wontGoUp: "Won't go up",
  nothing: "Nothing of it is up or waiting.",
  begun: "Taking it down.",
} as const;

/**
 * What the bell says of a take-down (00692; the canvas's Today 6): a piece gone from every place it was asked down from,
 * and one a place would not take down for Chanlytics, which its owner deletes there. A piece that cannot be named is
 * "Your post", never a blank title. The second is closed by the first (waits/notice-mends.ts holds both titles).
 */
export const TAKE_DOWN_BELL = {
  down: (piece: string) => `Taken down · ${piece || "Your post"}`,
  downFrom: (places: readonly PostPlace[]) => `From ${places.map((place) => POST_PLACE_SAID[place]).join(" and ")}`,
  byHand: (place: PostPlace, piece: string) => `Delete it in ${POST_PLACE_SAID[place]} · ${piece || "Your post"}`,
  byHandWhy: "Chanlytics couldn't take it down there",
} as const;

/**
 * What the confirm says the press will do, a line a placement (the canvas's cell 36): a post up is asked down where the
 * place takes that from here, is asked where that is not proved yet, or is the owner's to delete there; a story a day
 * old is gone already; one still waiting
 * will not go up. A post the owner put up by hand is theirs, and is no post of these.
 */
export function takeDownWillOf(
  posts: readonly Pick<PostDto, "id" | "place" | "kind" | "status" | "published_at">[],
  /** Whether a place takes a delete from here: it does, it does not, or nobody has seen it do so yet (`unproved`). */
  can: (place: PostPlace) => "yes" | "no" | "unproved",
  nowMs: number,
): TakeDownWill[] {
  const W = TAKE_DOWN_WORDS.will;
  // In the order the piece lists its placements: a reel, a post, a story, then Google.
  const rank = (post: (typeof posts)[number]) =>
    post.place === "google" ? 3 : ["reel", "picture", "story"].indexOf(post.kind);
  return [...posts]
    .sort((a, b) => rank(a) - rank(b))
    .flatMap((post): TakeDownWill[] => {
      const place = post.place;
      const name = placementSaid(place, post.kind);
      const glyph = place === "google" ? "google" : post.kind === "picture" ? "post" : post.kind;
      const line = (will: string): TakeDownWill[] => [{ key: post.id, glyph, name, will }];
      if (post.status === "published") {
        const gone = post.kind === "story" && nowMs - Date.parse(post.published_at ?? "") > STORY_LASTS_MS;
        if (gone) return line(W.storyGone);
        const takes = can(place);
        const placeName = POST_PLACE_SAID[place];
        return line(takes === "yes" ? W.takeDown : takes === "no" ? W.byHand(placeName) : W.asks(placeName));
      }
      if (post.status === "publishing" || post.status === "checking") return line(W.takeDown);
      if (post.status === "queued" || post.status === "preparing") return line(W.cancel);
      return [];
    });
}

/** AI's card to take a piece down (the PRD's 12.1 act/take_down): the same press as the sheet's, and its receipt. */
export const takeDownSpec: ProposalSpecAboveOperator = {
  needs: "partner",
  doing: "take a post down",
  gate: "settings",
  commit: ({ payload }) => ({ route: "DELETE files/[id]/posts", params: { id: asText(payload.file_id) } }),
  receipt: () => "Asked. Each place says here when it's gone.",
  open: ({ payload }) => {
    const id = asText(payload.file_id);
    return id ? contentRouteOf({ list: "made", view: "all", open: id }) : null;
  },
};
