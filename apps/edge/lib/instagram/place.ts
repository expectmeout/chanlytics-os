/**
 * Instagram behind the place adapter (the content loop PRD's section 7, pass 1b): each method one ask of Meta through the
 * Meta link's own token, read into the outcomes every place shares. The post jobs (instagram/post-ready.ts, post-send.ts)
 * keep what each ask came to and decide when to ask again, as they did before this seam: a send that got no answer is
 * `unknown` here and Checking there, and is never sent again blind.
 *
 * A picture, a story and a reel go the same two calls (a container Instagram fetches the media for, then its publish); a
 * reel's container takes longer to be ready (the sitting's, 47 seconds) and its fault shows only in the container's
 * status, never at the call (metaContainerErrorOf).
 */
import {
  ON_INSTAGRAM,
  PLACE_CAPABILITIES,
  type InstagramPostKind,
  type PlaceAdapter,
  type PlaceAnswerKept,
  type PlaceRefusal,
  type PlacedMedia,
  type PostKind,
  type PreparedState,
} from "@chanlytics/contracts";
import {
  callInstagram,
  metaContainerErrorOf,
  metaContainerFields,
  metaContainerRequest,
  metaContainerStatusRequest,
  metaDeleteRequest,
  metaMediaReadRequest,
  metaMediaSentBy,
  metaNewestMediaRequest,
  metaPostLimitRequest,
  metaPostRefusalOf,
  metaPublishRequest,
  parseMetaContainerStatus,
  parseMetaCreatedId,
  parseMetaDeleted,
  parseMetaMedia,
  parseMetaMediaList,
  parseMetaPostLimit,
  type InstagramAnswer,
  type InstagramDeps,
  type MetaMedia,
  type MetaPoster,
} from "@chanlytics/channels/instagram";

/** The longest one call to Instagram waits (KIND_POLICY longestCallMs is 20 s). */
export const INSTAGRAM_CALL_MS = 15_000;

/** What the adapter is handed besides the poster: the network, and which of the account's posts another placement keeps. */
export interface InstagramPlaceDeps extends InstagramDeps {
  /** Of these ids, those another placement of this workspace already keeps: never this post. */
  keptElsewhere?: (ids: readonly string[]) => Promise<readonly string[]>;
}

const answerKeptOf = (answer: InstagramAnswer): PlaceAnswerKept => ({
  status: answer.status || null,
  json: answer.json,
});

/** Instagram's refusal, in the owner's sentence for what was sent. */
function instagramRefusalOf(answer: Pick<InstagramAnswer, "status" | "json">, kind: PostKind): PlaceRefusal {
  const r = metaPostRefusalOf(answer, kind);
  return { words: ON_INSTAGRAM.refused[r.refusal], code: r.code, subcode: r.subcode, busy: r.refusal === "busy" };
}

const placedOf = (media: Pick<MetaMedia, "id"> & Partial<MetaMedia>): PlacedMedia => ({
  externalId: media.id,
  permalink: media.permalink ?? null,
  publishedAt: media.timestamp ?? null,
});

/** The account's day of posts, asked before a container is made; null where it could not be read (the post goes on). */
async function dayUsed(poster: MetaPoster, deps: InstagramDeps): Promise<boolean> {
  const read = await callInstagram(metaPostLimitRequest(poster), { timeoutMs: INSTAGRAM_CALL_MS }, deps);
  const limit = read.outcome === "ok" ? parseMetaPostLimit(read.json) : null;
  return !!limit && limit.used >= limit.total;
}

/** Where a container stands, as Instagram says it. */
function preparedStateOf(answer: InstagramAnswer, kind: InstagramPostKind): PreparedState {
  const kept = answerKeptOf(answer);
  if (answer.outcome === "refused") return { is: "gone", kept };
  if (answer.outcome !== "ok") return { is: "unknown", kept };
  const status = parseMetaContainerStatus(answer.json);
  if (status.code === "FINISHED") return { is: "ready", kept };
  if (status.code === "IN_PROGRESS") return { is: "in_progress", kept };
  if (status.code === "PUBLISHED") return { is: "published", kept };
  if (status.code === "EXPIRED") return { is: "expired", kept };
  if (status.code === "ERROR") {
    const r = metaContainerErrorOf(status.detail, kind);
    return {
      is: "failed",
      refusal: { words: ON_INSTAGRAM.refused[r.refusal], code: r.code, subcode: r.subcode, busy: false },
      kept,
    };
  }
  // An answer that names no state it can read is still being made ready, as the jobs always read one.
  return { is: "in_progress", kept };
}

/** Instagram's adapter, over the account the Meta link connected and its token. */
export function instagramPlace(poster: MetaPoster, deps: InstagramPlaceDeps = {}): PlaceAdapter {
  const call = (request: Parameters<typeof callInstagram>[0]) =>
    callInstagram(request, { timeoutMs: INSTAGRAM_CALL_MS }, deps);
  return {
    place: "instagram",
    capabilities: PLACE_CAPABILITIES.instagram,

    async prepare(post) {
      if (await dayUsed(poster, deps)) {
        const refusal = { words: ON_INSTAGRAM.refused.limit, code: null, subcode: 2207042, busy: false };
        return { is: "refused", refusal, kept: { status: null, json: null } };
      }
      const fields = metaContainerFields(post.kind, post.mediaUrl, {
        caption: post.caption,
        says: post.says,
      });
      const container = await call(metaContainerRequest(poster, fields));
      if (container.outcome === "refused")
        return { is: "refused", refusal: instagramRefusalOf(container, post.kind), kept: answerKeptOf(container) };
      if (container.outcome !== "ok") return { is: "unknown", kept: answerKeptOf(container) };
      return { is: "made", ref: parseMetaCreatedId(container.json), kept: answerKeptOf(container) };
    },

    async preparedState(ref, kind) {
      return preparedStateOf(await call(metaContainerStatusRequest(poster, ref)), kind);
    },

    async publish(post, ref) {
      if (!ref) throw new Error(`post ${post.postId}: no container to publish`);
      const sent = await call(metaPublishRequest(poster, ref));
      if (sent.outcome === "refused")
        return { is: "refused", refusal: instagramRefusalOf(sent, post.kind), kept: answerKeptOf(sent) };
      if (sent.outcome !== "ok") return { is: "unknown", kept: answerKeptOf(sent) };
      const mediaId = parseMetaCreatedId(sent.json);
      // Its address, for the sheet's See it, read back from the account: a read that fails leaves it up without one.
      const read = await call(metaMediaReadRequest(poster, mediaId));
      const media = (read.outcome === "ok" ? parseMetaMedia(read.json) : null) ?? { id: mediaId };
      return { is: "sent", media: placedOf(media), kept: answerKeptOf(sent), seen: read.outcome === "ok" };
    },

    async status(post) {
      // Its own id is known: asked for by it.
      if (post.externalId) {
        const read = await call(metaMediaReadRequest(poster, post.externalId));
        const media = read.outcome === "ok" ? parseMetaMedia(read.json) : null;
        if (media) return { is: "up", media: placedOf(media), kept: answerKeptOf(read) };
        if (read.outcome !== "refused") return { is: "unknown", kept: answerKeptOf(read) };
        // Refused by its id: Meta says the same of a post that is gone and of one this connection may not read. The
        // account's own list, read with the same connection, settles it: readable and without the post, it is gone.
        const account = await call(metaNewestMediaRequest(poster, post.kind));
        if (account.outcome !== "ok") return { is: "unknown", kept: answerKeptOf(account) };
        const there = parseMetaMediaList(account.json).some((m) => m.id === post.externalId);
        return { is: there ? "unknown" : "not_up", kept: answerKeptOf(account) };
      }
      // Not known yet (a send whose answer never came): looked for on the account by its time and its words.
      const listed = await call(metaNewestMediaRequest(poster, post.kind));
      if (listed.outcome !== "ok") return { is: "unknown", kept: answerKeptOf(listed) };
      const newest = parseMetaMediaList(listed.json);
      const kept = deps.keptElsewhere ? await deps.keptElsewhere(newest.map((m) => m.id)) : [];
      const found = metaMediaSentBy(
        newest.filter((m) => !kept.includes(m.id)),
        { at: post.sentAt, caption: post.caption },
      );
      return found
        ? { is: "up", media: placedOf(found), kept: answerKeptOf(listed) }
        : { is: "not_up", kept: answerKeptOf(listed) };
    },

    async takeDown(post) {
      if (!post.externalId)
        return { outcome: "not_possible", said: ON_INSTAGRAM.takeDown.noId, kept: { status: null, json: null } };
      const removal = await callInstagram(
        metaDeleteRequest(poster, post.externalId),
        { timeoutMs: INSTAGRAM_CALL_MS },
        deps,
      );
      const kept = answerKeptOf(removal);
      if (removal.outcome === "ok" && parseMetaDeleted(removal.json)) return { outcome: "done", said: null, kept };
      // No answer proves nothing: it may be gone. The action waits, and the post is asked about again.
      if (removal.outcome !== "ok" && removal.outcome !== "refused") return { outcome: "pending", said: null, kept };
      // Meta refused the connection the delete (its permission, or the post is not this account's to delete): by hand.
      return { outcome: "needs_person", said: ON_INSTAGRAM.takeDown.byHand, kept };
    },
  };
}
