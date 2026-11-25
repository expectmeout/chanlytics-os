/**
 * Facebook behind the place adapter (the content loop PRD's pass 5): each method one ask of a business's Page through the
 * Page's own token, which the Meta link's token is asked for once per adapter, read into the outcomes every place shares.
 * The post jobs keep what each ask came to and decide when to ask again, as they do for Instagram: a send that got no
 * answer is `unknown` here and Checking there, and is never sent again blind.
 *
 * A picture and a story begin as a photo Meta fetches and keeps unpublished (the draft, as Instagram's container is); a
 * reel begins as a reel whose video Meta fetches from its address. Publishing makes the post, the story, or the reel
 * public. Built from Meta's Pages guide (23 Nov 2026); no real Page has shown any of it yet (PLACE_CAPABILITIES says so).
 */
import {
  ON_FACEBOOK,
  PLACE_CAPABILITIES,
  type PlaceAdapter,
  type PlaceAnswerKept,
  type PlaceRefusal,
  type PlacedMedia,
  type PlacementToSend,
  type PostKind,
  type Prepared,
  type PreparedState,
  type RemoteState,
  type SendOutcome,
  type SentPlacement,
  type TakeDownAnswer,
} from "@chanlytics/contracts";
import {
  callFacebook,
  pageDeleteRequest,
  pagePhotoReadRequest,
  pagePhotoRequest,
  pagePostReadRequest,
  pagePostRequest,
  pagePostSentBy,
  pagePostsRequest,
  pagePostsSinceRequest,
  pageReelFetchRequest,
  pageReelFinishRequest,
  pageReelStartRequest,
  pageReelsRequest,
  pageRefusalLosesConnection,
  pageRefusalOf,
  pageStoriesRequest,
  pageStoryRequest,
  pageTokenRequest,
  pageVideoStatusRequest,
  parsePageIds,
  parsePageListedPage,
  parsePageMade,
  parsePagePost,
  parsePagePosts,
  parsePageReel,
  parsePageStories,
  parsePageSuccess,
  parsePageToken,
  type FacebookAnswer,
  type FacebookDeps,
  type PageHand,
  type PagePoster,
  type PageReel,
} from "@chanlytics/channels/facebook";
import { listedPageOfMeta, type ListedPage } from "../content/place-list.js";

/** One request to a Page, as the wire builds it. */
type PageRequest = Parameters<typeof callFacebook>[0];

/** Where a list's next page begins, as the wire names it. */
type MetaNextPage = NonNullable<Parameters<typeof pagePostsSinceRequest>[1]["next"]>;

/** The longest one call to a Page waits (KIND_POLICY longestCallMs is 20 s). */
const FACEBOOK_CALL_MS = 15_000;

/** What the adapter is handed besides the poster: the network, and which of the Page's posts another placement keeps. */
export interface FacebookPlaceDeps extends FacebookDeps {
  /** Of these ids, those another placement of this workspace already keeps: never this post. */
  keptElsewhere?: (ids: readonly string[]) => Promise<readonly string[]>;
}

const NOTHING_KEPT: PlaceAnswerKept = { status: null, json: null };
const keptOf = (answer: FacebookAnswer): PlaceAnswerKept => ({ status: answer.status || null, json: answer.json });

/** Facebook's refusal, in the owner's sentence for what was sent. */
function placeRefusalOf(answer: FacebookAnswer, kind: PostKind): PlaceRefusal {
  const r = pageRefusalOf(answer, kind);
  return {
    words: ON_FACEBOOK.refused[r.refusal],
    code: r.code,
    subcode: r.subcode,
    busy: r.refusal === "busy",
    ...(pageRefusalLosesConnection(r.refusal) ? { connectionLost: true } : {}),
  };
}

/** The Page's token, once per adapter, or how asking for it went: refused (said), or no answer. */
type HandOrNot =
  | { is: "hand"; hand: PageHand }
  | { is: "refused"; refusal: PlaceRefusal; kept: PlaceAnswerKept }
  | { is: "unknown"; kept: PlaceAnswerKept };

/** What each of the adapter's asks is handed: the Page's token (asked once), and its one bounded call. */
interface PageHands {
  hand: () => Promise<HandOrNot>;
  call: (request: PageRequest) => Promise<FacebookAnswer>;
  deps: FacebookPlaceDeps;
}

/**
 * The Page's token asked with the link's. Its answer holds the token, so none of it is ever kept: only its status. Busy is
 * tried again; any other refusal, or an answer with no token, means the link may not act for this Page: nothing is sent,
 * and it waits for the owner to connect again.
 */
async function askPageToken(poster: PagePoster, call: PageHands["call"]): Promise<HandOrNot> {
  const answer = await call(pageTokenRequest(poster));
  const token = answer.outcome === "ok" ? parsePageToken(answer.json) : null;
  if (token) return { is: "hand", hand: { pageToken: token, appSecret: poster.appSecret, pageId: poster.pageId } };
  const kept = { status: answer.status || null, json: null };
  if (answer.outcome !== "ok" && answer.outcome !== "refused") return { is: "unknown", kept };
  const refused = answer.outcome === "refused" ? placeRefusalOf(answer, "picture") : null;
  if (refused?.busy) return { is: "refused", refusal: refused, kept };
  const words = refused?.code === 190 ? ON_FACEBOOK.refused.token : ON_FACEBOOK.refused.permission;
  const refusal = { words, code: refused?.code ?? null, subcode: refused?.subcode ?? null, busy: false };
  return { is: "refused", refusal: { ...refusal, connectionLost: true }, kept };
}

/* ------------------------------------------------------------------ making it ready */

/** A photo kept unpublished for a picture or a story: Meta fetches it now, so a fault in it shows well before its time. */
async function photoOf(h: PageHands, hand: PageHand, post: PlacementToSend): Promise<Prepared> {
  const made = await h.call(pagePhotoRequest(hand, post.mediaUrl));
  if (made.outcome === "refused")
    return { is: "refused", refusal: placeRefusalOf(made, post.kind), kept: keptOf(made) };
  const id = made.outcome === "ok" ? parsePageMade(made.json, "id") : null;
  return id ? { is: "made", ref: id, kept: keptOf(made) } : { is: "unknown", kept: keptOf(made) };
}

/** A reel begun, and Meta asked to fetch its video from its address. No answer to either: made afresh next time. */
async function reelOf(h: PageHands, hand: PageHand, post: PlacementToSend): Promise<Prepared> {
  const started = await h.call(pageReelStartRequest(hand));
  if (started.outcome === "refused")
    return { is: "refused", refusal: placeRefusalOf(started, "reel"), kept: keptOf(started) };
  const videoId = started.outcome === "ok" ? parsePageMade(started.json, "video_id") : null;
  if (!videoId) return { is: "unknown", kept: keptOf(started) };
  const fetched = await h.call(pageReelFetchRequest(hand, videoId, post.mediaUrl));
  if (fetched.outcome === "refused")
    return { is: "refused", refusal: placeRefusalOf(fetched, "reel"), kept: keptOf(fetched) };
  if (fetched.outcome !== "ok" || !parsePageSuccess(fetched.json)) return { is: "unknown", kept: keptOf(fetched) };
  return { is: "made", ref: videoId, kept: keptOf(started) };
}

async function prepareOn(h: PageHands, post: PlacementToSend): Promise<Prepared> {
  const got = await h.hand();
  if (got.is !== "hand") return got;
  return post.kind === "reel" ? reelOf(h, got.hand, post) : photoOf(h, got.hand, post);
}

/** Where a reel stands, as the jobs read a draft: fetched is ready to publish; being made ready after it, published. */
function reelStateOf(answer: FacebookAnswer): PreparedState {
  const kept = keptOf(answer);
  if (answer.outcome === "refused") return { is: "gone", kept };
  if (answer.outcome !== "ok") return { is: "unknown", kept };
  const reel = parsePageReel(answer.json);
  if (reel.state === "fetched") return { is: "ready", kept };
  // Asked to go up already (its publishing phase began): the send landed, whatever Meta is still doing with it.
  if (reel.state === "published" || reel.state === "publishing") return { is: "published", kept };
  if (reel.state === "expired") return { is: "expired", kept };
  if (reel.state === "failed") {
    const refusal = { words: ON_FACEBOOK.refused.video, code: null, subcode: null, busy: false };
    return { is: "failed", refusal, kept };
  }
  return { is: "in_progress", kept };
}

/** Where a kept photo stands: up as a story already, still kept (ready), or gone. */
async function photoStateOn(h: PageHands, hand: PageHand, ref: string, kind: PostKind): Promise<PreparedState> {
  if (kind === "story") {
    const stories = await h.call(pageStoriesRequest(hand));
    if (stories.outcome === "ok" && parsePageStories(stories.json).some((s) => s.mediaId === ref))
      return { is: "published", kept: keptOf(stories) };
  }
  const read = await h.call(pagePhotoReadRequest(hand, ref));
  if (read.outcome === "ok" && parsePageMade(read.json, "id")) return { is: "ready", kept: keptOf(read) };
  return { is: read.outcome === "refused" ? "gone" : "unknown", kept: keptOf(read) };
}

async function preparedStateOn(h: PageHands, ref: string, kind: PostKind): Promise<PreparedState> {
  const got = await h.hand();
  if (got.is === "refused") return { is: "failed", refusal: got.refusal, kept: got.kept };
  if (got.is === "unknown") return got;
  if (kind === "reel") return reelStateOf(await h.call(pageVideoStatusRequest(got.hand, ref)));
  return photoStateOn(h, got.hand, ref, kind);
}

/* ------------------------------------------------------------------ sending */

const placedOf = (at: { id: string; permalink: string | null; createdTime: string | null }): PlacedMedia => ({
  externalId: at.id,
  permalink: at.permalink,
  publishedAt: at.createdTime,
});

/** A post made with the kept photo, and its address read back from the Page. */
async function publishPicture(h: PageHands, hand: PageHand, post: PlacementToSend, ref: string): Promise<SendOutcome> {
  const sent = await h.call(pagePostRequest(hand, { photoId: ref, caption: post.caption }));
  if (sent.outcome === "refused")
    return { is: "refused", refusal: placeRefusalOf(sent, post.kind), kept: keptOf(sent) };
  const id = sent.outcome === "ok" ? parsePageMade(sent.json, "id") : null;
  if (!id) return { is: "unknown", kept: keptOf(sent) };
  const read = await h.call(pagePostReadRequest(hand, id));
  const found = read.outcome === "ok" ? parsePagePost(read.json) : null;
  const media = placedOf(found ?? { id, permalink: null, createdTime: null });
  return { is: "sent", media, kept: keptOf(sent), seen: found !== null };
}

/** The kept photo put up as the Page's story, and the story read back among the Page's own. */
async function publishStory(h: PageHands, hand: PageHand, ref: string): Promise<SendOutcome> {
  const sent = await h.call(pageStoryRequest(hand, ref));
  if (sent.outcome === "refused") return { is: "refused", refusal: placeRefusalOf(sent, "story"), kept: keptOf(sent) };
  const id = sent.outcome === "ok" ? parsePageMade(sent.json, "post_id") : null;
  if (!id) return { is: "unknown", kept: keptOf(sent) };
  const listed = await h.call(pageStoriesRequest(hand));
  const story =
    listed.outcome === "ok" ? parsePageStories(listed.json).find((s) => s.postId === id && s.up) : undefined;
  const media = placedOf({ id, permalink: story?.url ?? null, createdTime: story?.createdTime ?? null });
  return { is: "sent", media, kept: keptOf(sent), seen: !!story };
}

/** The fetched reel published with its words. Meta names no post for it: the reel's own id is kept, and it is seen later. */
async function publishReel(h: PageHands, hand: PageHand, post: PlacementToSend, ref: string): Promise<SendOutcome> {
  const sent = await h.call(pageReelFinishRequest(hand, { videoId: ref, caption: post.caption }));
  if (sent.outcome === "refused") return { is: "refused", refusal: placeRefusalOf(sent, "reel"), kept: keptOf(sent) };
  if (sent.outcome !== "ok" || !parsePageSuccess(sent.json)) return { is: "unknown", kept: keptOf(sent) };
  return {
    is: "sent",
    media: { externalId: ref, permalink: null, publishedAt: null },
    kept: keptOf(sent),
    seen: false,
  };
}

async function publishOn(h: PageHands, post: PlacementToSend, ref: string | null): Promise<SendOutcome> {
  if (!ref) throw new Error(`post ${post.postId}: nothing kept on the Page to publish`);
  const got = await h.hand();
  if (got.is !== "hand") return got;
  if (post.kind === "reel") return publishReel(h, got.hand, post, ref);
  return post.kind === "story" ? publishStory(h, got.hand, ref) : publishPicture(h, got.hand, post, ref);
}

/* ------------------------------------------------------------------ asking what the Page holds */

/** A reel by its own id: up once Meta says it is published; gone where the Page's reels no longer list it. */
async function reelStatus(h: PageHands, hand: PageHand, id: string): Promise<RemoteState> {
  const read = await h.call(pageVideoStatusRequest(hand, id));
  const reel: PageReel | null = read.outcome === "ok" ? parsePageReel(read.json) : null;
  if (reel?.state === "published")
    return {
      is: "up",
      media: placedOf({ id, permalink: reel.permalink, createdTime: reel.createdTime }),
      kept: keptOf(read),
    };
  if (reel?.state === "failed" || reel?.state === "expired") return { is: "not_up", kept: keptOf(read) };
  if (read.outcome !== "refused") return { is: "unknown", kept: keptOf(read) };
  const listed = await h.call(pageReelsRequest(hand));
  if (listed.outcome !== "ok") return { is: "unknown", kept: keptOf(listed) };
  return { is: parsePageIds(listed.json).includes(id) ? "unknown" : "not_up", kept: keptOf(listed) };
}

/** A story among the Page's stories: up while Meta says PUBLISHED; ended or gone otherwise. */
async function storyStatus(h: PageHands, hand: PageHand, post: SentPlacement): Promise<RemoteState> {
  const listed = await h.call(pageStoriesRequest(hand));
  if (listed.outcome !== "ok") return { is: "unknown", kept: keptOf(listed) };
  const stories = parsePageStories(listed.json);
  const after = Date.parse(post.sentAt);
  const story = post.externalId
    ? stories.find((s) => s.postId === post.externalId)
    : stories.find((s) => s.up && s.createdTime !== null && Date.parse(s.createdTime) >= after);
  if (story?.up)
    return {
      is: "up",
      media: placedOf({ id: story.postId, permalink: story.url, createdTime: story.createdTime }),
      kept: keptOf(listed),
    };
  return { is: "not_up", kept: keptOf(listed) };
}

/** A post by its id; refused by it, the Page's own list settles whether it is gone or only unreadable. */
async function postStatus(h: PageHands, hand: PageHand, post: SentPlacement): Promise<RemoteState> {
  if (post.externalId) {
    const read = await h.call(pagePostReadRequest(hand, post.externalId));
    const found = read.outcome === "ok" ? parsePagePost(read.json) : null;
    if (found) return { is: "up", media: placedOf(found), kept: keptOf(read) };
    if (read.outcome !== "refused" && read.outcome !== "ok") return { is: "unknown", kept: keptOf(read) };
  }
  const listed = await h.call(pagePostsRequest(hand));
  if (listed.outcome !== "ok") return { is: "unknown", kept: keptOf(listed) };
  const posts = parsePagePosts(listed.json);
  if (post.externalId)
    return { is: posts.some((p) => p.id === post.externalId) ? "unknown" : "not_up", kept: keptOf(listed) };
  const kept = h.deps.keptElsewhere ? await h.deps.keptElsewhere(posts.map((p) => p.id)) : [];
  const found = pagePostSentBy(
    posts.filter((p) => !kept.includes(p.id)),
    { at: post.sentAt, caption: post.caption },
  );
  return found ? { is: "up", media: placedOf(found), kept: keptOf(listed) } : { is: "not_up", kept: keptOf(listed) };
}

async function statusOn(h: PageHands, post: SentPlacement): Promise<RemoteState> {
  const got = await h.hand();
  if (got.is !== "hand") return { is: "unknown", kept: got.kept };
  if (post.kind === "reel")
    return post.externalId ? reelStatus(h, got.hand, post.externalId) : { is: "unknown", kept: NOTHING_KEPT };
  return post.kind === "story" ? storyStatus(h, got.hand, post) : postStatus(h, got.hand, post);
}

/* ------------------------------------------------------------------ taking it down */

/** The post, story or reel asked down by its id, and what Meta said of it. */
async function takeDownOn(h: PageHands, post: SentPlacement): Promise<TakeDownAnswer> {
  if (!post.externalId) return { outcome: "not_possible", said: ON_FACEBOOK.takeDown.noId, kept: NOTHING_KEPT };
  const got = await h.hand();
  if (got.is === "unknown") return { outcome: "pending", said: null, kept: got.kept };
  if (got.is === "refused") return { outcome: "needs_person", said: ON_FACEBOOK.takeDown.byHand, kept: got.kept };
  const removal = await h.call(pageDeleteRequest(got.hand, post.externalId));
  const kept = keptOf(removal);
  if (removal.outcome === "ok" && parsePageSuccess(removal.json)) return { outcome: "done", said: null, kept };
  // No answer proves nothing: it may be gone. The action waits, and the post is asked about again.
  if (removal.outcome !== "ok" && removal.outcome !== "refused") return { outcome: "pending", said: null, kept };
  return { outcome: "needs_person", said: ON_FACEBOOK.takeDown.byHand, kept };
}

/* ------------------------------------------------------------------ the Page's own list */

/**
 * One page of the Page's own posts since a time (the daily read's list, content/posts-read.ts), through the Page's token.
 * A token that could not be asked for says nothing of any post, as a refused page does.
 */
async function listedOn(h: PageHands, since: Date, next: MetaNextPage | null): Promise<ListedPage<MetaNextPage>> {
  const token = await h.hand();
  if (token.is === "refused")
    return { is: "refused", said: `${token.refusal.code ?? "-"}/${token.refusal.subcode ?? "-"}` };
  if (token.is === "unknown") return { is: "unknown", said: String(token.kept.status ?? 0) };
  return listedPageOfMeta(await h.call(pagePostsSinceRequest(token.hand, { since, next })), parsePageListedPage);
}

/** What every ask of one Page shares: its one bounded call, and its token asked for once. */
function handsOf(poster: PagePoster, deps: FacebookPlaceDeps): PageHands {
  const call = (request: PageRequest) => callFacebook(request, { timeoutMs: FACEBOOK_CALL_MS }, deps);
  let asked: Promise<HandOrNot> | null = null;
  return { call, deps, hand: () => (asked ??= askPageToken(poster, call)) };
}

const placeOver = (hands: PageHands): PlaceAdapter => ({
  place: "facebook",
  capabilities: PLACE_CAPABILITIES.facebook,
  prepare: (post) => prepareOn(hands, post),
  preparedState: (ref, kind) => preparedStateOn(hands, ref, kind),
  publish: (post, ref) => publishOn(hands, post, ref),
  status: (post) => statusOn(hands, post),
  takeDown: (post) => takeDownOn(hands, post),
});

/** Facebook's adapter, over the Page the Meta link keeps and the link's token. */
export function facebookPlace(poster: PagePoster, deps: FacebookPlaceDeps = {}): PlaceAdapter {
  return placeOver(handsOf(poster, deps));
}

/** The same adapter, and the Page's own list of posts a page at a time, both through one ask for the Page's token. */
export function facebookPlaceListed(poster: PagePoster, deps: FacebookPlaceDeps = {}) {
  const hands = handsOf(poster, deps);
  return {
    place: placeOver(hands),
    listed: (since: Date, next: MetaNextPage | null) => listedOn(hands, since, next),
  };
}
