/**
 * A post on its way to a place, and where it stands there (decision 0121; 00611's `posts`): one record per place a made post
 * goes, so the sheet that shows the post says whether it is on Instagram, on its way, held or refused, in these words.
 */
import { MIN_MS } from "../shared/time";

/** Where a post can go. TikTok joins when its door exists. */
export const POST_PLACES = ["instagram", "google"] as const;
export type PostPlace = (typeof POST_PLACES)[number];

/**
 * Where a post can be, as the database keeps it (posts.place): the places a press sends it, and `hand`, one the owner put up
 * themselves and said so (00620 post_report). A post by hand is never a PostDto: it is read apart (HandPostDto), since it has
 * no place of ours, no send and nothing to stop.
 */
export const POSTED_PLACES = [...POST_PLACES, "hand"] as const;

/** A piece its owner said they posted themselves (00620): when they said so, and its link where they gave one. */
export interface HandPostDto {
  id: string;
  at: string;
  link: string | null;
}

/** The longest link a post by hand keeps (00620 post_report). */
export const HAND_LINK_MAX = 500;

/** Where a link says a post is, by its host: "TikTok", "Instagram"; null where it names none of them, or there is no link. */
export function linkPlaceSaid(link: string | null | undefined): string | null {
  let host: string;
  try {
    host = new URL(link ?? "").hostname.toLowerCase();
  } catch {
    // No link, or none a browser would open: it names no place.
    return null;
  }
  const at = (domain: string) => host === domain || host.endsWith(`.${domain}`);
  if (at("instagram.com")) return "Instagram";
  if (at("tiktok.com")) return "TikTok";
  if (at("facebook.com") || at("fb.watch")) return "Facebook";
  if (at("youtube.com") || at("youtu.be")) return "YouTube";
  return null;
}

/** A place as a sentence says it. */
export const POST_PLACE_SAID = { instagram: "Instagram", google: "Google" } as const satisfies Record<
  PostPlace,
  string
>;

/** What it is there: a picture in the feed, a story, or a reel (a video made here, since pass 1b of the content loop). */
export const POST_KINDS = ["picture", "story", "reel"] as const;
export type PostKind = (typeof POST_KINDS)[number];

/** What a press may send to Instagram. */
export const INSTAGRAM_POST_KINDS = ["picture", "story", "reel"] as const satisfies readonly PostKind[];
export type InstagramPostKind = (typeof INSTAGRAM_POST_KINDS)[number];

/** How a made file goes on Instagram, by its kind as the file keeps it (files.kind): an image as a post or a story, a video as a reel. */
export const instagramKindsFor = (fileKind: string): readonly InstagramPostKind[] =>
  fileKind === "video" ? ["reel"] : ["picture", "story"];

/**
 * Why a post was held or let go before it went (posts.held_why, beside held_reason's words): the recheck's reasons, one of
 * the seven checks' (the content loop PRD's 6.1), a change since it was approved, or a reason that passed (`late`: its day
 * went by before it could be sent, and it is let go, never sent late).
 */
export const POST_HELD_WHYS = [
  "approver",
  "disconnected",
  "line_off",
  "removed",
  "stopped",
  "changed",
  "rights",
  "claim",
  "place",
  "money",
  "reason_passed",
  "late",
] as const;
export type PostHeldWhy = (typeof POST_HELD_WHYS)[number];

/** Who approved it: a person's press on the file, or their Approve on Ask's card. */
export const POST_VIAS = ["press", "card"] as const;

/** Where a post stands, in the order it moves. */
export const POST_STATUSES = [
  "queued",
  "preparing",
  "publishing",
  "checking",
  "published",
  "held",
  "failed",
  "pulled",
  "taken_down",
] as const;
export type PostStatus = (typeof POST_STATUSES)[number];

/** The statuses of a post still on its way: one at a time per file and place (00611 posts_one_on_its_way). */
export const POST_ON_ITS_WAY: readonly PostStatus[] = ["queued", "preparing", "publishing", "checking"];

/** Up to here the owner can still say Don't post: nothing has been sent (00611 post_pull). */
export const POST_PULLABLE: readonly PostStatus[] = ["queued", "preparing"];

/** Instagram's own limits on a caption (the content publishing reference). */
export const POST_CAPTION_MAX = 2200;
const HASHTAGS_MAX = 30;
const MENTIONS_MAX = 20;

/** How far ahead a post may be set to go (00681 post_approve). */
export const POST_AHEAD_DAYS_MAX = 30;

/**
 * A post set for no later than this from now goes as it is pressed; later, it waits for its time (00681 post_approve's own two
 * minutes). The one line every reader draws: the page, Today, Ask's card and the doors.
 */
export const POST_SOON_MS = 2 * MIN_MS;

/** Whether a post waits for its time: on its way, and set for later than soon. */
export const postWaitsForItsTime = (post: Pick<PostDto, "status" | "scheduled_for">, nowMs: number): boolean =>
  POST_ON_ITS_WAY.includes(post.status) && Date.parse(post.scheduled_for) - nowMs > POST_SOON_MS;

/** What already holds a place: a post on its way there (now, or set for its time), or, on Google, one that is up. */
type PostPlaceTaken = { is: "on_its_way"; scheduled_for: string } | { is: "up" };

/**
 * What stands in the way of another post of a piece at a place, or null where one can go: one of the same kind on its way
 * there, since a place takes one of each kind at a time (00620 posts_one_on_its_way: a picture post and a story wait apart),
 * and on Google one that is up, since a second would be the same post twice on the profile. Instagram takes a second (a story
 * after the post). With no kind, any kind on its way holds the place. The page's switches and Ask's card ask it alike.
 */
export function postPlaceTakenOf(
  posts: readonly Pick<PostDto, "place" | "kind" | "status" | "scheduled_for">[],
  place: PostPlace,
  kind?: PostKind,
): PostPlaceTaken | null {
  const onItsWay = posts.find(
    (p) => p.place === place && (kind === undefined || p.kind === kind) && POST_ON_ITS_WAY.includes(p.status),
  );
  if (onItsWay) return { is: "on_its_way", scheduled_for: onItsWay.scheduled_for };
  if (place === "google" && posts.some((p) => p.place === "google" && p.status === "published")) return { is: "up" };
  return null;
}

/** A post, as the file's sheet reads it. `error` is the refusal in words, never Instagram's code. */
export interface PostDto {
  id: string;
  place: PostPlace;
  kind: PostKind;
  caption: string | null;
  status: PostStatus;
  held_reason: string | null;
  /** What held or let it go, beside its words: the one the page acts on (POST_HELD_WHYS). */
  held_why: PostHeldWhy | null;
  permalink: string | null;
  scheduled_for: string;
  published_at: string | null;
  /** When the place was seen holding it; "On Instagram" is said only from then (PRD 8.2). */
  verified_at: string | null;
  /** The last moment it is still worth sending; null where nothing dates it. */
  good_until: string | null;
  error: string | null;
  created_at: string;
}

/**
 * Why a post did not go out, in words, where it says: held by the recheck right before the send (its reason), or refused by
 * the place (its error, never a code). None for a post that did not stop. The one reading of it: a tile, a line, Today's card
 * and the file's sheet each say it so.
 */
export const postStoppedWhyOf = (post: Pick<PostDto, "status" | "held_reason" | "error">): string | null =>
  post.status === "held" || post.status === "pulled" ? post.held_reason : post.status === "failed" ? post.error : null;

/** Whether this workspace's Instagram can take a post now, and if not, the one reason the sheet says. */
export type InstagramPostable = "yes" | "not_connected" | "line_off";

export const ON_INSTAGRAM = {
  post: "Post to Instagram",
  asPicture: "Post",
  asStory: "Story",
  asReel: "Reel",
  asWhat: "How it goes on Instagram",
  caption: "Caption",
  captionNeeded: "Write a caption to go with it.",
  storyNoCaption: "A story shows no caption.",
  send: "Post now",
  cancel: "Cancel",
  sent: "On its way to Instagram. It goes up in a minute or two.",
  busy: "This post is already on its way to Instagram.",
  notConnected: "Connect Meta in Settings, under Connections, to post here.",
  lineOff: "Instagram did not allow posting. Connect Meta again and allow it.",
  notAPost: "Only a post or a video made here can go on Instagram.",
  gone: "This post was deleted.",
  /** A made video sent as a picture or a story, or a picture as a reel: each file goes the one way it can. */
  wrongKind: "A video goes on Instagram as a reel, and a picture as a post or a story.",
  notSent: "The post did not go through. Try again.",
  /** The door to it on Instagram, beside where it says it is up there: the place is named by its row. */
  see: "See it",
  pull: "Don't post",
  pulledFlash: "It won't be posted.",
  pullLate: "It is already being posted, so it can't be stopped here.",
  /** Change time, too late: Instagram is already making it ready, or it is being sent (00621 post_move). */
  moveLate: "It is already being made ready to go, so its time can't change now.",
  tryAgain: "Post again",
  status: {
    queued: "Waiting to go on Instagram",
    preparing: "Instagram is getting it ready",
    publishing: "Posting on Instagram",
    checking: "Checking with Instagram whether it went up",
    published: "On Instagram",
    held: "Held, not posted",
    failed: "Not posted",
    pulled: "Not posted: you said not to",
    taken_down: "Taken down",
  } satisfies Record<PostStatus, string>,
  kind: { picture: "a post", story: "a story", reel: "a reel" } satisfies Record<PostKind, string>,
  /** Why the recheck right before the send stopped it (00611 held_reason). */
  held: {
    approver: "Whoever approved it can no longer post for this business.",
    disconnected: "Instagram is no longer connected. Connect Meta again, then post it again.",
    lineOff: "Instagram no longer allows posting. Connect Meta again and allow it.",
    removed: "The post was deleted.",
    /** Its owner stopped everything (Stop everything): a post never goes up late by itself, so it is theirs to post again. */
    stopped: "Everything is stopped, so this was not posted. Resume sending, then post it again.",
    /** Its words, its picture or its version moved since the owner approved it (the approval's hash, PRD 5.3). */
    changed: "Changed since you approved it. Look again.",
  },
  /** Taking a post down, where Instagram itself must be the way (the remediation's needs_person, not_possible). */
  takeDown: {
    byHand: "Instagram didn't let Chanlytics take it down. Delete it in the Instagram app.",
    noId: "Chanlytics has no record of where this is on Instagram. Delete it in the Instagram app.",
  },
  /** What a refusal says, by what Instagram answered (decision 0121): the sheet's line and the bell's. */
  refused: {
    limit: "Instagram allows only so many posts a day, and this account has used them. Post it again tomorrow.",
    picture: "Instagram couldn't take this picture. Make a new version and post that.",
    video: "Instagram couldn't take this video. Make a new version and post that.",
    words: "Instagram takes up to 2,200 characters. Shorten the words, then post it again.",
    token: "Instagram no longer accepts the connection. Connect Meta again, then post it again.",
    busy: "Instagram is busy right now. Post it again in a few minutes.",
    other: "Instagram did not take the post.",
    unknown: "Instagram did not say whether this went up. Look at the account before posting it again.",
  },
} as const;

/**
 * Where a post stands, in the sheet's words: still posting for one Instagram took and the account has not been read
 * holding yet, "On Instagram" once it was seen there, with no word between the two (the content loop PRD's 8.2 as the
 * journey canvas's call 7 took it, 22 Nov 2026); every other standing as it is.
 */
export const postStandsSaid = (post: Pick<PostDto, "status" | "place" | "verified_at">): string =>
  post.status === "published" && post.place === "instagram" && !post.verified_at
    ? ON_INSTAGRAM.status.publishing
    : ON_INSTAGRAM.status[post.status];

/** Why a caption cannot go to Instagram as written, in words; null when it can. */
export function postCaptionProblem(caption: string): string | null {
  if (caption.length > POST_CAPTION_MAX) return "Instagram takes up to 2,200 characters.";
  if ((caption.match(/#[\p{L}\p{N}_]+/gu) ?? []).length > HASHTAGS_MAX) return "Instagram takes up to 30 hashtags.";
  if ((caption.match(/@[\p{L}\p{N}_.]+/gu) ?? []).length > MENTIONS_MAX) return "Instagram takes up to 20 @mentions.";
  return null;
}
