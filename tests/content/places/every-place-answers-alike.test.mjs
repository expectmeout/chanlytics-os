/**
 * Every place's sender answers in the same outcomes (the content loop PRD's 7 and 15.1; apps/edge/lib/content/places):
 * a send is sent, refused in the owner's words, or unknown when no answer came, which proves nothing and is never read
 * as a refusal; a send whose answer was lost is found on the account afterwards by its caption; a take-down is done only
 * on the place's own yes, waits when no answer came, and goes to a person when the place refuses the connection it.
 *
 * Instagram answers here as Meta answered the first-post sitting on @chanlytics (21 Nov 2026): a reel is a container of
 * media_type REELS with its video and share_to_feed, a video that cannot be fetched fails only in the container's status,
 * with its number inside the sentence, and a caption too long is code 36004, subcode 2207010.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resetBreakers } from "@chanlytics/channels/shared";
import { metaContainerFields, metaContainerFieldsKept, metaPostRefusalOf } from "@chanlytics/channels/instagram";
import { ON_INSTAGRAM, PLACE_CAPABILITIES, placeTakes } from "@chanlytics/contracts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { instagramPlace } = await import(at("apps/edge/lib/content/places/instagram.ts"));

const ACCOUNT = "17841400000000001";
const CONTAINER = "18000000000000001";
const MEDIA = "17900000000000001";
const poster = { token: "bisu-token", appSecret: "meta-secret", accountId: ACCOUNT };
const SENT_AT = new Date(Date.now() - 60_000).toISOString();

/** Meta, answering each call by `routes`; a route set to "silent" never answers (the network drops it). */
function meta(routes) {
  const calls = [];
  const fetch = async (url, init = {}) => {
    const u = new URL(String(url));
    const method = init.method ?? "GET";
    const body = typeof init.body === "string" ? Object.fromEntries(new URLSearchParams(init.body)) : {};
    calls.push({
      route: `${method} ${u.pathname.replace("/v27.0", "")}`,
      body,
      query: Object.fromEntries(u.searchParams),
    });
    const answer = routes[`${method} ${u.pathname.replace("/v27.0", "")}`];
    if (answer === "silent") throw new TypeError("fetch failed");
    const [status, json] = answer ?? [404, { error: { message: "no such route", code: 803 } }];
    return new Response(JSON.stringify(json), { status, headers: { "content-type": "application/json" } });
  };
  return { fetch, calls };
}

const reel = {
  postId: "p1",
  kind: "reel",
  caption: "Calls answered for you.",
  mediaUrl: "https://files.example.com/v.mp4?token=x",
  says: null,
  language: null,
  book: false,
};
const picture = {
  ...reel,
  kind: "picture",
  caption: "Open late on Fridays.",
  mediaUrl: "https://files.example.com/p.jpg?token=x",
  says: "Open late",
};

beforeEach(() => resetBreakers());

test("each place has its own capabilities, and a kind it has not been seen to take is not offered", () => {
  assert.equal(PLACE_CAPABILITIES.instagram.formats.reel.is, "by_hand");
  assert.equal(placeTakes("instagram", "reel"), true);
  assert.equal(placeTakes("instagram", "picture"), true);
  assert.equal(placeTakes("google", "reel"), false);
  assert.equal(PLACE_CAPABILITIES.instagram.linkInCaption.is, "not_so");
  assert.equal(PLACE_CAPABILITIES.instagram.perPostMetrics.is, "proved");
  // Google's column is the code's until a customer's listing proves it: Chanlytics has none of its own.
  assert.ok(
    Object.values(PLACE_CAPABILITIES.google).every((c) => typeof c !== "object" || !("is" in c) || c.is !== "proved"),
  );
});

test("a reel is a container of its video, shared to the feed with its caption, and kept without its address", () => {
  const fields = metaContainerFields("reel", reel.mediaUrl, { caption: reel.caption, says: "ignored" });
  assert.deepEqual(fields, {
    media_type: "REELS",
    video_url: reel.mediaUrl,
    share_to_feed: "true",
    caption: reel.caption,
  });
  assert.deepEqual(metaContainerFieldsKept(fields), { ...fields, video_url: "files.example.com" });
});

test("sent: the post's id, its address and its time, read back from the account", async () => {
  const m = meta({
    [`POST /${ACCOUNT}/media_publish`]: [200, { id: MEDIA }],
    [`GET /${MEDIA}`]: [
      200,
      { id: MEDIA, permalink: "https://www.instagram.com/reel/abc/", timestamp: "2026-11-22T10:00:00+0000" },
    ],
  });
  const sent = await instagramPlace(poster, { fetch: m.fetch }).publish(reel, CONTAINER);
  assert.equal(sent.is, "sent");
  assert.deepEqual(sent.media, {
    externalId: MEDIA,
    permalink: "https://www.instagram.com/reel/abc/",
    publishedAt: "2026-11-22T10:00:00+0000",
  });
  assert.equal(sent.seen, true);
  assert.deepEqual(m.calls[0].body.creation_id, CONTAINER);
});

test("refused: the owner's sentence for what was sent, and Meta's own codes kept", async () => {
  const m = meta({
    [`POST /${ACCOUNT}/media_publish`]: [
      400,
      { error: { message: "Caption Too Long", code: 36004, error_subcode: 2207010 } },
    ],
  });
  const sent = await instagramPlace(poster, { fetch: m.fetch }).publish(picture, CONTAINER);
  assert.equal(sent.is, "refused");
  assert.equal(sent.refusal.words, ON_INSTAGRAM.refused.words);
  assert.equal(sent.refusal.code, 36004);
  assert.equal(sent.refusal.busy, false);
});

test("Meta's media codes are read as the code, and a video's fault says video", () => {
  const answer = (code, subcode) => ({ status: 400, json: { error: { message: "x", code, error_subcode: subcode } } });
  assert.equal(metaPostRefusalOf(answer(36003, null), "picture").refusal, "picture");
  assert.equal(metaPostRefusalOf(answer(36003, null), "reel").refusal, "video");
  assert.equal(metaPostRefusalOf(answer(36004, 2207010), "picture").refusal, "words");
  assert.equal(metaPostRefusalOf(answer(9004, 2207052), "reel").refusal, "video");
  assert.equal(metaPostRefusalOf({ status: 429, json: {} }, "reel").refusal, "busy");
});

test("no answer is unknown, never a refusal: nothing says it did not go up", async () => {
  const m = meta({ [`POST /${ACCOUNT}/media_publish`]: "silent" });
  const sent = await instagramPlace(poster, { fetch: m.fetch }).publish(picture, CONTAINER);
  assert.equal(sent.is, "unknown");
});

test("sent after a timeout: the account shows it with its caption, and one another placement keeps is never it", async () => {
  const listed = [
    {
      id: "17900000000000009",
      caption: picture.caption,
      timestamp: new Date().toISOString(),
      permalink: "https://www.instagram.com/p/kept/",
    },
    {
      id: MEDIA,
      caption: picture.caption,
      timestamp: new Date().toISOString(),
      permalink: "https://www.instagram.com/p/abc/",
    },
  ];
  const m = meta({ [`GET /${ACCOUNT}/media`]: [200, { data: listed }] });
  const place = instagramPlace(poster, { fetch: m.fetch, keptElsewhere: async () => ["17900000000000009"] });
  const state = await place.status({
    postId: "p1",
    kind: "picture",
    externalId: null,
    caption: picture.caption,
    sentAt: SENT_AT,
  });
  assert.equal(state.is, "up");
  assert.equal(state.media.externalId, MEDIA);
  // Not there: not up. A list that could not be read: unknown.
  const empty = instagramPlace(poster, { fetch: meta({ [`GET /${ACCOUNT}/media`]: [200, { data: [] }] }).fetch });
  assert.equal(
    (await empty.status({ postId: "p1", kind: "picture", externalId: null, caption: picture.caption, sentAt: SENT_AT }))
      .is,
    "not_up",
  );
  const silent = instagramPlace(poster, { fetch: meta({ [`GET /${ACCOUNT}/media`]: "silent" }).fetch });
  assert.equal(
    (
      await silent.status({
        postId: "p1",
        kind: "picture",
        externalId: null,
        caption: picture.caption,
        sentAt: SENT_AT,
      })
    ).is,
    "unknown",
  );
});

test("a reel's container that failed says the video, with the number Meta put only in its sentence", async () => {
  const m = meta({
    [`GET /${CONTAINER}`]: [
      200,
      { status_code: "ERROR", status: "Error: Media upload has failed with error code 2207076" },
    ],
  });
  const state = await instagramPlace(poster, { fetch: m.fetch }).preparedState(CONTAINER, "reel");
  assert.equal(state.is, "failed");
  assert.equal(state.refusal.words, ON_INSTAGRAM.refused.video);
  assert.equal(state.refusal.subcode, 2207076);
  // A container Instagram no longer has is gone; one still being made is in progress.
  assert.equal(
    (
      await instagramPlace(poster, {
        fetch: meta({ [`GET /${CONTAINER}`]: [400, { error: { code: 100 } }] }).fetch,
      }).preparedState(CONTAINER, "reel")
    ).is,
    "gone",
  );
  assert.equal(
    (
      await instagramPlace(poster, {
        fetch: meta({ [`GET /${CONTAINER}`]: [200, { status_code: "IN_PROGRESS" }] }).fetch,
      }).preparedState(CONTAINER, "reel")
    ).is,
    "in_progress",
  );
});

test("at the day's limit nothing is made, and the refusal says why", async () => {
  const m = meta({
    [`GET /${ACCOUNT}/content_publishing_limit`]: [200, { data: [{ quota_usage: 100, config: { quota_total: 100 } }] }],
  });
  const prepared = await instagramPlace(poster, { fetch: m.fetch }).prepare(reel);
  assert.equal(prepared.is, "refused");
  assert.equal(prepared.refusal.words, ON_INSTAGRAM.refused.limit);
  assert.ok(!m.calls.some((c) => c.route === `POST /${ACCOUNT}/media`));
});

test("a take-down is done only on Meta's own yes; no answer waits; refused goes to a person", async () => {
  const sent = { postId: "p1", kind: "picture", externalId: MEDIA, caption: null, sentAt: SENT_AT };
  const done = await instagramPlace(poster, {
    fetch: meta({ [`DELETE /${MEDIA}`]: [200, { success: true }] }).fetch,
  }).takeDown(sent);
  assert.equal(done.outcome, "done");
  const waits = await instagramPlace(poster, { fetch: meta({ [`DELETE /${MEDIA}`]: "silent" }).fetch }).takeDown(sent);
  assert.equal(waits.outcome, "pending");
  const refused = await instagramPlace(poster, {
    fetch: meta({
      [`DELETE /${MEDIA}`]: [403, { error: { message: "(#10) Application does not have permission", code: 10 } }],
    }).fetch,
  }).takeDown(sent);
  assert.equal(refused.outcome, "needs_person");
  assert.equal(refused.said, ON_INSTAGRAM.takeDown.byHand);
  // A post Chanlytics keeps no id for cannot be found to take down: by hand.
  const noId = await instagramPlace(poster, { fetch: meta({}).fetch }).takeDown({ ...sent, externalId: null });
  assert.equal(noId.outcome, "not_possible");
});
