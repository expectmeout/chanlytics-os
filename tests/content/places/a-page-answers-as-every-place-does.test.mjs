/**
 * The adapter contract, once for every place that has a fake of its own (the content loop PRD's 7 and 15.1): a send is
 * sent, refused in the owner's words, or unknown when no answer came; a send whose answer was lost is found afterwards by
 * its words, and one another placement keeps is never it; a post asked for by its own id is up, gone only where the
 * place's own list reads without it, or unknown; a take-down is done only on the place's own yes, waits when no answer
 * came, goes to a person when refused, and cannot be asked of a post with no id. Instagram answers as Meta answered the
 * first-post sitting; a Page answers as Meta's Pages guide says it does (23 Nov 2026), since no real Page has yet.
 *
 * Then a Page's own: its token is asked once with the link's and never kept; a picture and a story begin as a photo kept
 * unpublished; a reel is begun, fetched by Meta from its address and finished; where a reel stands; Meta's refusals in
 * the owner's sentences; and the place's capabilities, none of them proved.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resetBreakers } from "@chanlytics/channels/shared";
import { pageRefusalOf, parsePageReel } from "@chanlytics/channels/facebook";
import { ON_FACEBOOK, ON_INSTAGRAM, PLACE_CAPABILITIES, placeDeletes, placeTakes } from "@chanlytics/contracts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { instagramPlace } = await import(at("apps/edge/lib/instagram/place.ts"));
const { facebookPlace } = await import(at("apps/edge/lib/facebook/place.ts"));

const SENT_AT = new Date(Date.now() - 60_000).toISOString();
const NOW = () => new Date().toISOString();

/** A place's network, answering each call by `routes`; "silent" never answers (the network drops it). */
function network(routes) {
  const calls = [];
  const fetch = async (url, init = {}) => {
    const u = new URL(String(url));
    const method = init.method ?? "GET";
    const route = `${method} ${u.pathname.replace("/v27.0", "")}`;
    const body = typeof init.body === "string" ? Object.fromEntries(new URLSearchParams(init.body)) : {};
    calls.push({ route, host: u.host, body, query: Object.fromEntries(u.searchParams), headers: { ...init.headers } });
    const answer = routes[route];
    if (answer === "silent") throw new TypeError("fetch failed");
    const [status, json] = answer ?? [404, { error: { message: "no such route", code: 803 } }];
    return new Response(JSON.stringify(json), { status, headers: { "content-type": "application/json" } });
  };
  return { fetch, calls };
}

const REFUSED_BY_ID = [400, { error: { message: "Object does not exist", code: 100, error_subcode: 33 } }];
const NO_PERMISSION = [403, { error: { message: "(#200) Permissions error", code: 200 } }];
const picture = {
  postId: "p1",
  kind: "picture",
  caption: "Open late on Fridays.",
  mediaUrl: "https://files.example.com/p.jpg?token=x",
  says: "Open late",
  language: null,
  book: false,
};

/**
 * Each place, as the contract asks it: its adapter over a network, the draft a send publishes, the id a post is kept by
 * there, and the routes that make each of the contract's answers.
 */
const PLACES = {
  instagram: (() => {
    const ACCOUNT = "17841400000000001";
    const MEDIA = "17900000000000001";
    const KEPT = "17900000000000009";
    const listed = (items) => [200, { data: items.map((m) => ({ ...m, timestamp: NOW() })) }];
    return {
      adapter: (fetch, more = {}) =>
        instagramPlace({ token: "bisu-token", appSecret: "meta-secret", accountId: ACCOUNT }, { fetch, ...more }),
      ref: "18000000000000001",
      id: MEDIA,
      kept: KEPT,
      words: ON_INSTAGRAM,
      sent: {
        [`POST /${ACCOUNT}/media_publish`]: [200, { id: MEDIA }],
        [`GET /${MEDIA}`]: [200, { id: MEDIA, permalink: "https://www.instagram.com/p/abc/", timestamp: NOW() }],
      },
      refused: {
        [`POST /${ACCOUNT}/media_publish`]: [400, { error: { message: "Media bad", code: 36003 } }],
      },
      publishSilent: { [`POST /${ACCOUNT}/media_publish`]: "silent" },
      listedWith: (caption) => ({
        [`GET /${ACCOUNT}/media`]: listed([
          { id: KEPT, caption, permalink: "https://www.instagram.com/p/kept/" },
          { id: MEDIA, caption, permalink: "https://www.instagram.com/p/abc/" },
        ]),
      }),
      listedEmpty: { [`GET /${ACCOUNT}/media`]: [200, { data: [] }] },
      listSilent: { [`GET /${ACCOUNT}/media`]: "silent" },
      byId: {
        [`GET /${MEDIA}`]: [200, { id: MEDIA, permalink: "https://www.instagram.com/p/abc/", timestamp: NOW() }],
      },
      byIdRefused: { [`GET /${MEDIA}`]: REFUSED_BY_ID },
      deleteRoute: `DELETE /${MEDIA}`,
    };
  })(),
  facebook: (() => {
    const PAGE = "100200300400500";
    const POST = `${PAGE}_900800700600500`;
    const KEPT = `${PAGE}_900800700600599`;
    const PHOTO = "555000111222333";
    const token = { [`GET /${PAGE}`]: [200, { access_token: "page-token", id: PAGE }] };
    const listed = (items) => [200, { data: items.map((p) => ({ ...p, created_time: NOW() })) }];
    return {
      adapter: (fetch, more = {}) =>
        facebookPlace({ token: "bisu-token", appSecret: "meta-secret", pageId: PAGE }, { fetch, ...more }),
      ref: PHOTO,
      id: POST,
      kept: KEPT,
      words: ON_FACEBOOK,
      sent: {
        ...token,
        [`POST /${PAGE}/feed`]: [200, { id: POST }],
        [`GET /${POST}`]: [200, { id: POST, permalink_url: "https://www.facebook.com/x/posts/1", created_time: NOW() }],
      },
      refused: { ...token, [`POST /${PAGE}/feed`]: [400, { error: { message: "Invalid image", code: 324 } }] },
      publishSilent: { ...token, [`POST /${PAGE}/feed`]: "silent" },
      listedWith: (caption) => ({
        ...token,
        [`GET /${PAGE}/published_posts`]: listed([
          { id: KEPT, message: caption, permalink_url: "https://www.facebook.com/x/posts/9" },
          { id: POST, message: caption, permalink_url: "https://www.facebook.com/x/posts/1" },
        ]),
      }),
      listedEmpty: { ...token, [`GET /${PAGE}/published_posts`]: [200, { data: [] }] },
      listSilent: { ...token, [`GET /${PAGE}/published_posts`]: "silent" },
      byId: {
        ...token,
        [`GET /${POST}`]: [200, { id: POST, permalink_url: "https://www.facebook.com/x/posts/1", created_time: NOW() }],
      },
      byIdRefused: { ...token, [`GET /${POST}`]: REFUSED_BY_ID },
      deleteRoute: `DELETE /${POST}`,
      token,
      PAGE,
      PHOTO,
    };
  })(),
};

beforeEach(() => resetBreakers());

for (const [name, place] of Object.entries(PLACES)) {
  const sentPost = { postId: "p1", kind: "picture", externalId: place.id, caption: null, sentAt: SENT_AT };

  test(`${name}: sent is the post's id, its address and its time, read back from the place`, async () => {
    const sent = await place.adapter(network(place.sent).fetch).publish(picture, place.ref);
    assert.equal(sent.is, "sent");
    assert.equal(sent.media.externalId, place.id);
    assert.match(sent.media.permalink, /^https:\/\//);
    assert.equal(sent.seen, true);
  });

  test(`${name}: refused is the owner's sentence for what was sent, with the place's own code kept`, async () => {
    const sent = await place.adapter(network(place.refused).fetch).publish(picture, place.ref);
    assert.equal(sent.is, "refused");
    assert.equal(sent.refusal.words, place.words.refused.picture);
    assert.equal(typeof sent.refusal.code, "number");
    assert.equal(sent.refusal.busy, false);
  });

  test(`${name}: no answer is unknown, never a refusal`, async () => {
    const sent = await place.adapter(network(place.publishSilent).fetch).publish(picture, place.ref);
    assert.equal(sent.is, "unknown");
  });

  test(`${name}: a send whose answer was lost is found by its words, never one another placement keeps`, async () => {
    const lost = { postId: "p1", kind: "picture", externalId: null, caption: picture.caption, sentAt: SENT_AT };
    const found = await place
      .adapter(network(place.listedWith(picture.caption)).fetch, { keptElsewhere: async () => [place.kept] })
      .status(lost);
    assert.equal(found.is, "up");
    assert.equal(found.media.externalId, place.id);
    assert.equal((await place.adapter(network(place.listedEmpty).fetch).status(lost)).is, "not_up");
    assert.equal((await place.adapter(network(place.listSilent).fetch).status(lost)).is, "unknown");
  });

  test(`${name}: a post with its own id is up, gone only where the place's list reads without it, else unknown`, async () => {
    assert.equal((await place.adapter(network(place.byId).fetch).status(sentPost)).is, "up");
    const gone = network({ ...place.byIdRefused, ...place.listedEmpty });
    assert.equal((await place.adapter(gone.fetch).status(sentPost)).is, "not_up");
    assert.equal((await place.adapter(network(place.byIdRefused).fetch).status(sentPost)).is, "unknown");
  });

  test(`${name}: a take-down is done on the place's own yes, waits on no answer, goes to a person when refused`, async () => {
    const extra = place.token ?? {};
    const done = await place
      .adapter(network({ ...extra, [place.deleteRoute]: [200, { success: true }] }).fetch)
      .takeDown(sentPost);
    assert.equal(done.outcome, "done");
    const waits = await place.adapter(network({ ...extra, [place.deleteRoute]: "silent" }).fetch).takeDown(sentPost);
    assert.equal(waits.outcome, "pending");
    const refused = await place
      .adapter(network({ ...extra, [place.deleteRoute]: NO_PERMISSION }).fetch)
      .takeDown(sentPost);
    assert.equal(refused.outcome, "needs_person");
    assert.equal(refused.said, place.words.takeDown.byHand);
    const noId = await place.adapter(network({}).fetch).takeDown({ ...sentPost, externalId: null });
    assert.equal(noId.outcome, "not_possible");
    assert.equal(noId.said, place.words.takeDown.noId);
  });
}

/* ------------------------------------------------------------------ a Page's own */

const fb = PLACES.facebook;
const { PAGE, PHOTO } = fb;
const reel = {
  ...picture,
  kind: "reel",
  caption: "Calls answered for you.",
  mediaUrl: "https://files.example.com/v.mp4?token=x",
};

test("a Page's token is asked once, with the link's token and its proof, and nothing of its answer is kept", async () => {
  const m = network({
    ...fb.token,
    [`POST /${PAGE}/photos`]: [200, { id: PHOTO }],
    [`GET /${PHOTO}`]: [200, { id: PHOTO }],
  });
  const place = fb.adapter(m.fetch);
  const made = await place.prepare(picture);
  await place.preparedState(PHOTO, "picture");
  const asked = m.calls.filter((c) => c.route === `GET /${PAGE}`);
  assert.equal(asked.length, 1, "asked once per adapter");
  assert.equal(asked[0].query.fields, "access_token");
  assert.equal(asked[0].query.access_token, "bisu-token");
  assert.match(asked[0].query.appsecret_proof, /^[0-9a-f]{64}$/);
  // Every call to the Page carries the Page's own token, never the link's.
  const photo = m.calls.find((c) => c.route === `POST /${PAGE}/photos`);
  assert.equal(photo.body.access_token, "page-token");
  assert.ok(!JSON.stringify(made.kept).includes("page-token"));
});

test("a Page that will not give its token holds the send in Facebook's words; no answer is unknown", async () => {
  const refused = await fb.adapter(network({ [`GET /${PAGE}`]: NO_PERMISSION }).fetch).prepare(picture);
  assert.equal(refused.is, "refused");
  assert.equal(refused.refusal.words, ON_FACEBOOK.refused.permission);
  assert.equal(refused.refusal.connectionLost, true);
  assert.equal(refused.kept.json, null, "nothing of the token's answer is kept");
  const lapsed = await fb
    .adapter(network({ [`GET /${PAGE}`]: [400, { error: { message: "expired", code: 190 } }] }).fetch)
    .prepare(picture);
  assert.equal(lapsed.refusal.words, ON_FACEBOOK.refused.token);
  const silent = await fb.adapter(network({ [`GET /${PAGE}`]: "silent" }).fetch).prepare(picture);
  assert.equal(silent.is, "unknown");
});

test("a picture begins as a photo Meta fetches and keeps unpublished, and goes up as a post with its words", async () => {
  const m = network({
    ...fb.sent,
    [`POST /${PAGE}/photos`]: [200, { id: PHOTO }],
  });
  const place = fb.adapter(m.fetch);
  const made = await place.prepare(picture);
  assert.deepEqual([made.is, made.ref], ["made", PHOTO]);
  const photo = m.calls.find((c) => c.route === `POST /${PAGE}/photos`);
  assert.deepEqual([photo.body.url, photo.body.published], [picture.mediaUrl, "false"]);
  assert.equal(photo.body.caption, undefined, "the words go with the post, not the photo");
  await place.publish(picture, PHOTO);
  const post = m.calls.find((c) => c.route === `POST /${PAGE}/feed`);
  assert.deepEqual(JSON.parse(post.body["attached_media[0]"]), { media_fbid: PHOTO });
  assert.equal(post.body.message, picture.caption);
});

test("a story is the kept photo put up as the Page's story, seen among its stories", async () => {
  const STORY = "700000000000001";
  const m = network({
    ...fb.token,
    [`POST /${PAGE}/photo_stories`]: [200, { success: true, post_id: STORY }],
    [`GET /${PAGE}/stories`]: [
      200,
      {
        data: [
          {
            post_id: STORY,
            media_id: PHOTO,
            status: "PUBLISHED",
            creation_time: 1795000000,
            url: "https://www.facebook.com/stories/1",
          },
        ],
      },
    ],
  });
  const sent = await fb.adapter(m.fetch).publish({ ...picture, kind: "story", caption: null }, PHOTO);
  assert.equal(sent.is, "sent");
  assert.equal(sent.media.externalId, STORY);
  assert.equal(sent.seen, true);
  assert.equal(m.calls.find((c) => c.route === `POST /${PAGE}/photo_stories`).body.photo_id, PHOTO);
  // A story already up from this photo is the draft published: a second send is never made of it.
  const state = await fb.adapter(m.fetch).preparedState(PHOTO, "story");
  assert.equal(state.is, "published");
});

test("a reel is begun, fetched by Meta from its address (no bytes through us), and finished with its words", async () => {
  const VIDEO = "880000000000001";
  const m = network({
    ...fb.token,
    [`POST /${PAGE}/video_reels`]: [
      200,
      { video_id: VIDEO, upload_url: `https://rupload.facebook.com/video-upload/v27.0/${VIDEO}` },
    ],
    [`POST /video-upload/${VIDEO}`]: [200, { success: true }],
  });
  const made = await fb.adapter(m.fetch).prepare(reel);
  assert.deepEqual([made.is, made.ref], ["made", VIDEO]);
  const fetched = m.calls.find((c) => c.host === "rupload.facebook.com");
  assert.equal(fetched.headers.file_url, reel.mediaUrl);
  assert.equal(fetched.headers.Authorization, "OAuth page-token");
  assert.deepEqual(m.calls.find((c) => c.route === `POST /${PAGE}/video_reels`).body.upload_phase, "start");

  const finish = network({ ...fb.token, [`POST /${PAGE}/video_reels`]: [200, { success: true }] });
  const sent = await fb.adapter(finish.fetch).publish(reel, VIDEO);
  assert.equal(sent.is, "sent");
  assert.equal(sent.media.externalId, VIDEO, "Meta names no post for a reel: its own id is kept");
  assert.equal(sent.seen, false, "seen only once Meta says it is published");
  const body = finish.calls.find((c) => c.route === `POST /${PAGE}/video_reels`).body;
  assert.deepEqual([body.upload_phase, body.video_state, body.description], ["finish", "PUBLISHED", reel.caption]);
});

test("a reel's fetch refused, or never answered, leaves nothing to publish", async () => {
  const VIDEO = "880000000000002";
  const start = { [`POST /${PAGE}/video_reels`]: [200, { video_id: VIDEO }] };
  const refused = await fb
    .adapter(
      network({
        ...fb.token,
        ...start,
        [`POST /video-upload/${VIDEO}`]: [400, { error: { message: "fetch", code: 389 } }],
      }).fetch,
    )
    .prepare(reel);
  assert.equal(refused.is, "refused");
  assert.equal(refused.refusal.words, ON_FACEBOOK.refused.video);
  const silent = await fb
    .adapter(network({ ...fb.token, ...start, [`POST /video-upload/${VIDEO}`]: "silent" }).fetch)
    .prepare(reel);
  assert.equal(silent.is, "unknown");
});

test("where a reel stands, from Meta's three phases, as the jobs read a draft", async () => {
  const phases = (uploading, processing, publishing, extra = {}) => ({
    status: {
      video_status: extra.video ?? "processing",
      uploading_phase: { status: uploading },
      processing_phase: { status: processing, ...(extra.fault ? { error: { message: extra.fault } } : {}) },
      publishing_phase: { status: publishing, ...(extra.said ? { publish_status: extra.said } : {}) },
    },
  });
  assert.equal(parsePageReel(phases("in_progress", "not_started", "not_started")).state, "fetching");
  assert.equal(parsePageReel(phases("complete", "not_started", "not_started")).state, "fetched");
  assert.equal(parsePageReel(phases("complete", "in_progress", "not_started")).state, "fetched");
  assert.equal(parsePageReel(phases("complete", "in_progress", "in_progress")).state, "publishing");
  assert.equal(
    parsePageReel(phases("complete", "complete", "complete", { said: "published", video: "ready" })).state,
    "published",
  );
  // Meta writes a phase done as `completed` in its table and `complete` in its example: both are read.
  assert.equal(parsePageReel(phases("completed", "completed", "completed", { said: "published" })).state, "published");
  const failed = parsePageReel(phases("complete", "error", "not_started", { fault: "Resolution too low." }));
  assert.deepEqual([failed.state, failed.fault], ["failed", "Resolution too low."]);
  assert.equal(parsePageReel({ status: { video_status: "expired" } }).state, "expired");

  const VIDEO = "880000000000003";
  const ask = (answer) =>
    fb.adapter(network({ ...fb.token, [`GET /${VIDEO}`]: answer }).fetch).preparedState(VIDEO, "reel");
  assert.equal((await ask([200, phases("complete", "not_started", "not_started")])).is, "ready");
  assert.equal((await ask([200, phases("in_progress", "not_started", "not_started")])).is, "in_progress");
  assert.equal((await ask([200, phases("complete", "in_progress", "in_progress")])).is, "published");
  const bad = await ask([200, phases("complete", "error", "not_started", { fault: "Resolution too low." })]);
  assert.deepEqual([bad.is, bad.refusal.words], ["failed", ON_FACEBOOK.refused.video]);
  assert.equal((await ask(REFUSED_BY_ID)).is, "gone");
  assert.equal((await ask("silent")).is, "unknown");
});

test("Meta's codes for a Page, in the owner's sentences", () => {
  const answer = (code, status = 400) => ({ status, json: { error: { message: "x", code } } });
  assert.equal(pageRefusalOf(answer(190), "picture").refusal, "token");
  assert.equal(pageRefusalOf(answer(200), "picture").refusal, "permission");
  assert.equal(pageRefusalOf(answer(283), "picture").refusal, "permission");
  assert.equal(pageRefusalOf(answer(10), "picture").refusal, "permission");
  assert.equal(pageRefusalOf(answer(324), "picture").refusal, "picture");
  assert.equal(pageRefusalOf(answer(1363128), "reel").refusal, "video");
  assert.equal(pageRefusalOf(answer(389), "reel").refusal, "video");
  assert.equal(pageRefusalOf(answer(80001), "picture").refusal, "busy");
  assert.equal(pageRefusalOf({ status: 429, json: {} }, "picture").refusal, "busy");
  assert.equal(pageRefusalOf(answer(368), "picture").refusal, "other");
});

test("a Page's capabilities: what is sent by code reads built, nothing reads proved, and the rest is to prove", () => {
  const page = PLACE_CAPABILITIES.facebook;
  const lines = Object.entries(page).filter(([, c]) => c && typeof c === "object" && "is" in c);
  assert.ok(lines.length >= 9);
  assert.ok(
    [...lines.map(([, c]) => c), ...Object.values(page.formats)].every((c) => c.is !== "proved" && c.is !== "by_hand"),
    "no real Page has shown anything yet",
  );
  for (const key of ["directPublish", "remoteDelete", "remoteStatusCheck"]) assert.equal(page[key].is, "built", key);
  for (const key of ["perPostMetrics", "commentRead", "commentReply", "editAfterPublish", "linkInCaption"])
    assert.equal(page[key].is, "to_prove", key);
  assert.equal(page.scheduling.is, "not_so");
  for (const kind of ["picture", "story", "reel"]) assert.equal(placeTakes("facebook", kind), true, kind);
  assert.equal(placeDeletes("facebook"), "yes");
  assert.equal(page.limits.video.maxMs, 90_000, "a Page's reel is 3 to 90 seconds");
});
