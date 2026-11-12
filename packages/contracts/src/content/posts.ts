/**
 * A post on its way to a place, and where it stands there (decision 0121; 00611's `posts`): one record per place a made post
 * goes, so the sheet that shows the post says whether it is on Instagram, on its way, held or refused, in these words.
 */

/** Where a post can go. TikTok joins when its door exists. */
export const POST_PLACES = ["instagram", "google"] as const;
export type PostPlace = (typeof POST_PLACES)[number];

/** A place as a sentence says it. */
export const POST_PLACE_SAID = { instagram: "Instagram", google: "Google" } as const satisfies Record<
  PostPlace,
  string
>;

/** What it is there. A reel waits for a video's road to Instagram (decision 0121), so a press offers the first two. */
export const POST_KINDS = ["picture", "story", "reel"] as const;
export type PostKind = (typeof POST_KINDS)[number];

/** What a press may send to Instagram today. */
export const INSTAGRAM_POST_KINDS = ["picture", "story"] as const satisfies readonly PostKind[];
export type InstagramPostKind = (typeof INSTAGRAM_POST_KINDS)[number];

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

/** How far ahead a post may be set to go (00611 post_begin). */
export const POST_AHEAD_DAYS_MAX = 30;

/** A post, as the file's sheet reads it. `error` is the refusal in words, never Instagram's code. */
export interface PostDto {
  id: string;
  place: PostPlace;
  kind: PostKind;
  caption: string | null;
  status: PostStatus;
  held_reason: string | null;
  permalink: string | null;
  scheduled_for: string;
  published_at: string | null;
  error: string | null;
  created_at: string;
}

/**
 * Why a post did not go out, in words, where it says: held by the recheck right before the send (its reason), or refused by
 * the place (its error, never a code). None for a post that did not stop. The one reading of it: a tile, a line, Today's card
 * and the file's sheet each say it so.
 */
export const postStoppedWhyOf = (post: Pick<PostDto, "status" | "held_reason" | "error">): string | null =>
  post.status === "held" ? post.held_reason : post.status === "failed" ? post.error : null;

/** Whether this workspace's Instagram can take a post now, and if not, the one reason the sheet says. */
export type InstagramPostable = "yes" | "not_connected" | "line_off";

export const ON_INSTAGRAM = {
  post: "Post to Instagram",
  asPicture: "Post",
  asStory: "Story",
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
  notAPost: "Only a post made here can go on Instagram.",
  gone: "This post was deleted.",
  notYet: "Reels come once Instagram has been tried with a real account.",
  notSent: "The post did not go through. Try again.",
  /** The door to it on Instagram, beside where it says it is up there: the place is named by its row. */
  see: "See it",
  pull: "Don't post",
  pulledFlash: "It won't be posted.",
  pullLate: "It is already being posted, so it can't be stopped here.",
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
  },
  /** What a refusal says, by what Instagram answered (decision 0121): the sheet's line and the bell's. */
  refused: {
    limit: "Instagram allows only so many posts a day, and this account has used them. Post it again tomorrow.",
    picture: "Instagram could not take this picture. Make a new version and post that.",
    token: "Instagram no longer accepts the connection. Connect Meta again, then post it again.",
    busy: "Instagram is busy right now. Post it again in a few minutes.",
    other: "Instagram did not take the post.",
    unknown: "Instagram did not say whether this went up. Look at the account before posting it again.",
  },
} as const;

/** Why a caption cannot go to Instagram as written, in words; null when it can. */
export function postCaptionProblem(caption: string): string | null {
  if (caption.length > POST_CAPTION_MAX) return "Instagram takes up to 2,200 characters.";
  if ((caption.match(/#[\p{L}\p{N}_]+/gu) ?? []).length > HASHTAGS_MAX) return "Instagram takes up to 30 hashtags.";
  if ((caption.match(/@[\p{L}\p{N}_.]+/gu) ?? []).length > MENTIONS_MAX) return "Instagram takes up to 20 @mentions.";
  return null;
}
