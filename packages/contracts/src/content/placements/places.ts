/**
 * What each place can do, as a real account showed it (the content loop PRD's section 7, principle 11: what a place
 * really sends sets the table, not its documentation), and the one shape every place's sender takes at the edge.
 *
 * Each capability says how it stands and how that is known: `proved` (done as Chanlytics does it, through its own
 * connection), `by_hand` (done by hand on the same account through another sign-in, Meta's Graph API Explorer),
 * `built` (Chanlytics sends it, and no real account has shown it yet), `not_so` (the place said no, or its own page
 * offers no way) or `to_prove`. A place's `edition` moves when a capability is proved or lost; a placement keeps the
 * edition it was approved under (posts.capability_edition).
 *
 * Instagram's column is the first-post sitting's (docs 2026-11-22, 21 Nov 2026 on @chanlytics) and pass 1b's first test
 * (22 Nov: the Meta link's own token reads a post's caption, its kind, its saves and its shares). Google's stays as the
 * code holds it until a customer's listing proves it: Chanlytics meets nobody in person, so it has no listing of its own.
 */
import { MIN_MS } from "../../shared/time";
import type { PostKind, PostPlace } from "../posts";
import type { Observation } from "../results/observe";

/** How a capability stands at a place, and how that is known. */
export type CapabilityStanding = "proved" | "by_hand" | "built" | "not_so" | "to_prove";

/** One capability: how it stands, the day that was seen (null where it never was), and what showed it. */
export interface CapabilityProof {
  is: CapabilityStanding;
  on: string | null;
  how: string;
}

/** What a place can do beside the kinds it takes. */
export type PlaceCapabilityKey =
  | "directPublish"
  | "scheduling"
  | "remoteDelete"
  | "editAfterPublish"
  | "perPostMetrics"
  | "commentRead"
  | "commentReply"
  | "remoteStatusCheck"
  | "linkInCaption";

/** A video a place takes: how long, how big, and in which containers. */
interface PlaceVideoLimits {
  minMs: number;
  maxMs: number;
  maxBytes: number;
  mimes: readonly string[];
}

/** A place's own limits, checked by Chanlytics before anything is sent. */
export interface PlaceLimits {
  captionMax: number;
  /** Posts the account may make by the API in a moving day; null where the place says none. */
  perDay: number | null;
  video: PlaceVideoLimits | null;
}

export type PlaceCapabilities = Readonly<
  Record<PlaceCapabilityKey, CapabilityProof> & {
    edition: number;
    /** The kinds a press may send there, each with its own proof; a kind not named is not taken. */
    formats: Readonly<Partial<Record<PostKind, CapabilityProof>>>;
    limits: PlaceLimits;
  }
>;

const SITTING = "2026-11-21";
const FIRST_TEST = "2026-11-22";

/** Meta's reel rules as the sitting met them: 3 seconds to 15 minutes, 300 MB, MP4 or MOV (a silent one is taken). */
const INSTAGRAM_VIDEO: PlaceVideoLimits = {
  minMs: 3_000,
  maxMs: 15 * MIN_MS,
  maxBytes: 300 * 1024 * 1024,
  mimes: ["video/mp4", "video/quicktime"],
};

/**
 * Meta's reel rules for a Page (its Reels publishing guide, read 23 Nov 2026): 3 to 90 seconds, MP4 advised. Meta names no
 * size; Instagram's 300 MB is kept, since one made video goes to both.
 */
const FACEBOOK_VIDEO: PlaceVideoLimits = {
  minMs: 3_000,
  maxMs: 90_000,
  maxBytes: 300 * 1024 * 1024,
  mimes: ["video/mp4", "video/quicktime"],
};

/** Built from Meta's Pages guide (23 Nov 2026) and sent by code; no real Page has shown it yet. */
const FACEBOOK_BUILT = "Sent by code from Meta's Pages guide. No real Page has shown it yet.";

// screen-word: each `how` is the evidence a capability stands on, read by whoever builds a place, never shown on a page
export const PLACE_CAPABILITIES: Readonly<Record<PostPlace, PlaceCapabilities>> = {
  instagram: {
    edition: 1,
    formats: {
      picture: { is: "proved", on: SITTING, how: "Sent through the publisher on @chanlytics, up in 11 seconds." },
      story: { is: "proved", on: SITTING, how: "Sent through the publisher on @chanlytics, up in 13 seconds." },
      reel: {
        is: "by_hand",
        on: SITTING,
        how: "Sent by hand with Meta's own calls; ready in 47 seconds. Meta took a video with no sound track.",
      },
    },
    directPublish: {
      is: "proved",
      on: SITTING,
      how: "The Meta link's token publishes with no review, under the app's roles.",
    },
    scheduling: { is: "not_so", on: null, how: "Chanlytics holds the time and sends at it." },
    remoteDelete: {
      is: "to_prove",
      on: null,
      how: "Meta's call needs instagram_manage_contents, which the Meta link's token does not hold.",
    },
    editAfterPublish: {
      is: "not_so",
      on: SITTING,
      how: "Meta's page offers only turning comments on or off after a post is up.",
    },
    perPostMetrics: {
      is: "proved",
      on: FIRST_TEST,
      how: "The Meta link's token reads reach, views, likes, comments, saves and shares. A story under 5 viewers has none.",
    },
    commentRead: {
      is: "proved",
      on: SITTING,
      how: "Meta delivers a comment in about 4 seconds, naming the post by the id Chanlytics keeps.",
    },
    commentReply: { is: "to_prove", on: null, how: "No reply has been sent by the API yet." },
    remoteStatusCheck: {
      is: "proved",
      on: FIRST_TEST,
      how: "A container's status, and the account's posts with their captions, through the Meta link's token.",
    },
    linkInCaption: { is: "not_so", on: SITTING, how: "A link in a caption shows as plain text." },
    limits: { captionMax: 2200, perDay: 100, video: INSTAGRAM_VIDEO },
  },
  google: {
    edition: 1,
    formats: {
      picture: {
        is: "built",
        on: null,
        how: "Sent by code; no real listing has shown it. Chanlytics has none of its own.",
      },
    },
    directPublish: { is: "built", on: null, how: "Sent by code; no real listing has shown it." },
    scheduling: { is: "not_so", on: null, how: "Chanlytics holds the time and sends at it." },
    remoteDelete: { is: "built", on: null, how: "Google's own delete, sent by code; no real listing has shown it." },
    editAfterPublish: { is: "to_prove", on: null, how: "Not tried." },
    perPostMetrics: { is: "to_prove", on: null, how: "Google's page lists numbers for a post; not tried." },
    commentRead: { is: "not_so", on: null, how: "A Google post takes no comments." },
    commentReply: { is: "not_so", on: null, how: "A Google post takes no comments." },
    remoteStatusCheck: { is: "to_prove", on: null, how: "Google's page lists a post's state; nothing reads it yet." },
    linkInCaption: { is: "to_prove", on: null, how: "Only a Call button is built." },
    limits: { captionMax: 1500, perDay: null, video: null },
  },
  // The content loop PRD's pass 5: a Page the Meta link reaches, through the Page's own token. Nothing here has been seen
  // on a real Page; the sitting (docs 2026-11-23-facebook-sitting) proves each line and moves the edition.
  facebook: {
    edition: 1,
    formats: {
      picture: {
        is: "built",
        on: null,
        how: `${FACEBOOK_BUILT} A photo kept unpublished, then posted with its words.`,
      },
      story: {
        is: "built",
        on: null,
        how: `${FACEBOOK_BUILT} A photo kept unpublished, then put up as the Page's story.`,
      },
      reel: {
        is: "built",
        on: null,
        how: `${FACEBOOK_BUILT} Meta fetches the video, then it is published. Meta asks for a sound track; ours has none.`,
      },
    },
    directPublish: { is: "built", on: null, how: FACEBOOK_BUILT },
    scheduling: { is: "not_so", on: null, how: "Chanlytics holds the time and sends at it." },
    remoteDelete: { is: "built", on: null, how: `${FACEBOOK_BUILT} A story's delete is not on Meta's page.` },
    editAfterPublish: {
      is: "to_prove",
      on: null,
      how: "Meta's guide lets a post this app made take new words; not built.",
    },
    perPostMetrics: {
      is: "to_prove",
      on: null,
      how: "Meta's insights need read_insights and a Page with 100 likes or more; not built.",
    },
    commentRead: { is: "to_prove", on: null, how: "Not built: no Page webhook is subscribed." },
    commentReply: { is: "to_prove", on: null, how: "Not built." },
    remoteStatusCheck: {
      is: "built",
      on: null,
      how: `${FACEBOOK_BUILT} A post by its id, a story among the Page's stories, a reel by its status.`,
    },
    linkInCaption: { is: "to_prove", on: null, how: "Not tried." },
    // Meta names no caption length for a Page; one caption box serves every place, and it stops at Instagram's 2,200.
    limits: { captionMax: 2200, perDay: null, video: FACEBOOK_VIDEO },
  },
};

/** Whether a capability may be acted on: what a place said no to, or nobody has seen, is not. */
export const capabilityStands = (proof: CapabilityProof | undefined): boolean =>
  !!proof && proof.is !== "not_so" && proof.is !== "to_prove";

/** Whether a place takes a delete from here, by its table: proved or built, known not to, or not proved yet. */
export const placeDeletes = (place: PostPlace): "yes" | "no" | "unproved" => {
  const proof = PLACE_CAPABILITIES[place].remoteDelete;
  return capabilityStands(proof) ? "yes" : proof.is === "to_prove" ? "unproved" : "no";
};

/** Whether a place takes a kind now, by its table. */
export const placeTakes = (place: PostPlace, kind: PostKind): boolean =>
  capabilityStands(PLACE_CAPABILITIES[place].formats[kind]);

/* ------------------------------------------------------------------ the adapter every place's sender takes */

/** A place's answer as it came, kept on the send's row (publish_attempts.answer, http_status). */
export interface PlaceAnswerKept {
  status: number | null;
  json: unknown;
}

/** A place's refusal: its sentence for the owner, its own code, and whether it was only busy (tried once more). */
export interface PlaceRefusal {
  words: string;
  code: number | null;
  subcode: number | null;
  busy: boolean;
  /** The connection itself is gone (not connected, its token lost): nothing was sent, and it waits for the owner. */
  connectionLost?: boolean;
}

/** What a placement hands its place: the post, what it shows, and where the place fetches it from. */
export interface PlacementToSend {
  postId: string;
  kind: PostKind;
  caption: string | null;
  /** A link the place fetches the picture or video from, signed for a day. */
  mediaUrl: string;
  /** What the picture says, for someone who cannot see it. */
  says: string | null;
  /** The language its words are in, where the place asks (Google). */
  language: string | null;
  /** Whether it carries the business's Book button where the place has one (Google's Call). */
  book: boolean;
}

/** A placement made ready at its place: its draft there (Instagram's container), or nothing where a place has none. */
export type Prepared =
  | { is: "made"; ref: string; kept: PlaceAnswerKept }
  | { is: "refused"; refusal: PlaceRefusal; kept: PlaceAnswerKept }
  | { is: "unknown"; kept: PlaceAnswerKept };

/** Where a draft at the place stands, asked between making it and sending it; `gone` where the place no longer has it. */
export type PreparedState =
  | { is: "in_progress" | "ready" | "published" | "expired" | "gone"; kept: PlaceAnswerKept }
  | { is: "failed"; refusal: PlaceRefusal; kept: PlaceAnswerKept }
  | { is: "unknown"; kept: PlaceAnswerKept };

/** A post as a place keeps it: its id there, its address and its own time, where they are known. */
export interface PlacedMedia {
  externalId: string;
  permalink: string | null;
  publishedAt: string | null;
}

/** What a send came to: up, refused in words, or no answer, which proves nothing and is Checking (PRD 8.2). */
export type SendOutcome =
  /** `seen`: the place was read back holding it (posts.verified_at), not only told it was taken. */
  | { is: "sent"; media: PlacedMedia; kept: PlaceAnswerKept; seen: boolean }
  | { is: "refused"; refusal: PlaceRefusal; kept: PlaceAnswerKept }
  | { is: "unknown"; kept: PlaceAnswerKept };

/** What a place holds of a post: up (verified there), not there, or a read that got no answer. */
export type RemoteState =
  | { is: "up"; media: PlacedMedia; kept: PlaceAnswerKept }
  | { is: "not_up"; kept: PlaceAnswerKept }
  | { is: "unknown"; kept: PlaceAnswerKept };

/** A post that went up, as its place is asked about it. */
export interface SentPlacement {
  postId: string;
  kind: PostKind;
  externalId: string | null;
  caption: string | null;
  /** When its first send was asked: a post of it at the place is no older. */
  sentAt: string;
}

/** What asking a place to take a post down came to, in the remediation's own outcomes (PRD 8.3). */
export interface TakeDownAnswer {
  outcome: "done" | "pending" | "blocked" | "not_possible" | "needs_person";
  said: string | null;
  kept: PlaceAnswerKept;
}

/** A read of a post's numbers: one row for every number Chanlytics names, and the place's answer as it came. */
export interface ObservedPost {
  observations: Observation[];
  kept: PlaceAnswerKept;
}

/** What posting a public answer under a comment came to: up with its id, refused in words, or no answer. */
export type CommentAnswerSent =
  | { is: "sent"; externalId: string; kept: PlaceAnswerKept }
  | { is: "refused"; refusal: PlaceRefusal; kept: PlaceAnswerKept }
  | { is: "unknown"; kept: PlaceAnswerKept };

/**
 * One place's sender, assembled at the edge over its wire (apps/edge/lib/<place>/place.ts), each method one ask of
 * the place, read into these outcomes; what is kept of each send, and when to ask again, stays the post jobs'. A place
 * with no draft of its own (Google) has no `prepare` or `preparedState`; a place that cannot be asked what it holds has
 * no `status`; one with no delete of its own has no `takeDown`, and a take-down there is a step by hand shown before the
 * press. A place that gives a post's numbers has `observe` (pass 2); one whose comments may be answered from here has
 * `answerComment`. Comments themselves are delivered (Meta's webhook), never read by the adapter.
 */
export interface PlaceAdapter {
  readonly place: PostPlace;
  readonly capabilities: PlaceCapabilities;
  prepare?(post: PlacementToSend): Promise<Prepared>;
  preparedState?(ref: string, kind: PostKind): Promise<PreparedState>;
  publish(post: PlacementToSend, ref: string | null): Promise<SendOutcome>;
  /** Whether the account holds this post (a send with no answer asks it before anything is sent again). */
  status?(post: SentPlacement): Promise<RemoteState>;
  takeDown?(post: SentPlacement): Promise<TakeDownAnswer>;
  /** The post's numbers now, each a running total since it went up, a missing one said (perPostMetrics). */
  observe?(post: SentPlacement): Promise<ObservedPost>;
  /** A public answer posted under a comment, as the business (commentReply). */
  answerComment?(commentId: string, words: string): Promise<CommentAnswerSent>;
}
