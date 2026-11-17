/**
 * A video's picture where it is drawn, on Files' tile, on its card and on Today's Content card (decision 0099, stage B; decision
 * 0122): the platform says a video can be played some seconds before its poster is cut (the digest's sheet step, then the look's
 * own frame), and a page on screen draws at once. Seen on production 11 Nov 2026: a video made by Ask came ready at 06:26:14, its
 * first poster at 06:26:22, and the tile drawn between stood blank for good. A tile whose picture is not there yet says it is
 * getting ready, never its bare name, and looks again once Ask has looked at it; a card drawn afresh in those seconds says its
 * poster did not come, so its first still stands in. Today's card drew its pictures its own way and kept none of it: four videos
 * Ask made stood black tiles on Today, their lengths in the corner, while Content showed them (Ruben's phone, 17 Nov 2026).
 * Drawn by the real components on the stub React, Today's card over its own read answered as the server answers it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { installStubReact, fresh, again, byTestId, find, all, textOf } from "../_stub-react.mjs";
import { until } from "../shared/_until.mjs";

const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
/** What GET content/note answers Today's card with, as the next read finds it; and how many times it was asked. */
let note = null;
let noteReads = 0;
installStubReact({
  CHANLY: { nav() {} },
  location: { pathname: "/w/harbor/", hash: "", search: "", origin: "https://app.chanlytics.com" },
  __WORKSPACES: [{ id: T, slug: "harbor", name: "Brightline", status: "active", timezone: "America/Chicago" }],
  __ACTIVE_WORKSPACE: T,
  fetch: (url) => {
    if (String(url).includes("content/note")) noteReads += 1;
    const body = String(url).includes("content/note") ? { ok: true, data: { today: note } } : { ok: true, data: {} };
    return Promise.resolve(
      new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }),
    );
  },
});
const S = "../../apps/dashboard/src";
const { createElement } = globalThis.React;
const { Photo } = await import(`${S}/surfaces/files/photo.tsx`);
const { AskPieceCard } = await import(`${S}/surfaces/ask/card-piece.tsx`);
const { askText } = await import(`${S}/surfaces/ask/words.ts`);
const { TodayContentNote } = await import(`${S}/surfaces/today/content-note.tsx`);
const { clearReadCaches } = await import(`${S}/bridge/read-cache.ts`);
const { api } = await import(`${S}/bridge/api.ts`);
const { setSurfaceValue } = await import(`${S}/surfaces/surface-values.ts`);
const { FILE_WORDS, pieceWordsIn } = await import("@chanlytics/contracts");

const video = (look_status) => ({
  id: "made-1",
  name: "long-layers",
  line: "A stylist shows long layers.",
  kind: "video",
  media_status: "ready",
  seconds: 10.2,
  look_status,
});
const tile = (file) => again(() => createElement(Photo, { file, onOpen() {} }));
const imgOf = (tree) => find(tree, (n) => n.type === "img");

test("a video's tile whose poster is not cut yet says it is getting ready, never its bare name", () => {
  fresh();
  const first = tile(video("waiting"));
  const img = imgOf(first);
  assert.ok(img, "a ready video asks for its poster");
  img.props.onError();
  const missed = tile(video("waiting"));
  assert.equal(imgOf(missed), null, "the missing picture is not drawn broken");
  assert.ok(byTestId(missed, "fl-video-waits"), "the tile says it is getting ready");
  assert.match(textOf(byTestId(missed, "fl-video-waits")), new RegExp(FILE_WORDS.video.gettingReady));
  assert.ok(byTestId(missed, "fl-looking"), "with Ask's three while it looks");
  assert.equal(byTestId(missed, "fl-unseen"), null, "and not the name standing in for a picture");
});

test("once Ask has looked at it, the tile asks for its picture again, and draws it", () => {
  fresh();
  imgOf(tile(video("waiting"))).props.onError();
  assert.equal(imgOf(tile(video("waiting"))), null);
  const looked = tile(video("done"));
  const img = imgOf(looked);
  assert.ok(img, "the poster the look cut is asked for afresh");
  assert.match(img.props.src, /made-1[^"]*w=480/);
  assert.match(textOf(byTestId(looked, "fl-length")), /0:10/);
});

test("a photo whose picture will not come still says its name, as before", () => {
  fresh();
  const photo = { id: "p-1", name: "bench-tools", line: null, kind: "image", look_status: "done" };
  imgOf(tile(photo)).props.onError();
  assert.ok(byTestId(tile(photo), "fl-unseen"));
});

test("a card drawn afresh whose video's poster is not cut yet says so, and with its stills asks for no poster", () => {
  fresh();
  const missed = [];
  const held = (picture) => ({
    says: pieceWordsIn("en"),
    moments: 3,
    picture,
    refused: null,
    waiting: false,
    stands: { is: "ready", file: { id: "made-1", look_status: "waiting", issues: [] } },
    posterMissed: (id) => missed.push(id),
    press: { label: "Make it", disabled: false },
  });
  const card = (picture) =>
    again(() =>
      createElement(AskPieceCard, {
        p: { id: "c1", kind: "piece", title: "Video: Long layers", summary: "10 seconds, vertical.", payload: {} },
        card: held(picture),
        t: askText("en"),
        busy: false,
        onNav() {},
        onRetry: null,
      }),
    );
  const poster = byTestId(card(null), "ask-piece-poster");
  assert.ok(poster, "a card with no stills asks for the video's poster");
  poster.props.onError();
  assert.deepEqual(missed, ["made-1"], "one that does not come is said, by its video");
  // The stills it then asks for stand in: the video's own first frame, and no poster over it.
  fresh();
  assert.equal(byTestId(card("blob:stills"), "ask-piece-poster"), null);
});

/* ------------------------------------------------------------------------------------------- Today's Content card -- */

/** A piece of the week as GET content/note answers it: a video Ask made, where it stands. */
const madeVideo = (id, over = {}) => ({
  file: {
    id,
    kind: "video",
    status: "filed",
    source: "made",
    name: "long-layers",
    bytes: 1000,
    width: 1080,
    height: 1920,
    seconds: 11,
    media_status: "ready",
    sound_said: null,
    shows: null,
    who_in_it: "not_asked",
    people: null,
    look_status: "done",
    line: null,
    issues: [],
    looks_like_stock: false,
    looks_like: null,
    created_at: new Date().toISOString(),
    ...over,
  },
  posts: [],
});
const weekOf = (...week) => ({ week, making: [], ready: null, stopped: null });
const drawCard = () => again(() => createElement(TodayContentNote));
const pieceOf = (tree, id) =>
  all(tree, (n) => n.props?.["data-testid"] === "today-content-piece").find((n) => n.props.href?.includes(id)) ?? null;
const pictureOf = (piece) => (piece ? find(piece, (n) => n.type === "img") : null);

/** Today's card drawn afresh over this answer, once its read has landed and the piece `id` stands in it. */
async function cardWith(answer, id) {
  note = answer;
  clearReadCaches();
  api().forget();
  fresh();
  await until(() => !!pieceOf(drawCard(), id), "the card's read landed");
  return drawCard();
}

/** The card's next read, a minute on, as the day moves: what it asks for again. */
async function readAgain(answer, id, done) {
  note = answer;
  api().forget();
  const realNow = Date.now;
  Date.now = () => realNow() + 61_000;
  try {
    const before = noteReads;
    setSurfaceValue("today", { moved: noteReads });
    drawCard();
    await until(() => noteReads > before, "the card asked again");
    await until(() => done(drawCard()), "its answer drawn");
  } finally {
    Date.now = realNow;
  }
  return drawCard();
}

test("Today's card asks no picture of a video not ready yet, and says it is getting ready, never a black tile", async () => {
  const card = await cardWith(
    weekOf(madeVideo("today-1", { media_status: "processing", look_status: "waiting" })),
    "today-1",
  );
  const piece = pieceOf(card, "today-1");
  assert.equal(pictureOf(piece), null, "nothing is asked of a video the platform has not made ready");
  assert.match(textOf(byTestId(piece, "today-content-waits")), new RegExp(FILE_WORDS.video.gettingReady));
  assert.match(piece.props["aria-label"], new RegExp(`Long layers: ${FILE_WORDS.video.gettingReady}`));
  assert.match(textOf(piece), /0:11/, "its length still in the corner");
});

test("Today's card, whose video's poster was not cut yet, says it is getting ready and asks again once Ask has looked at it", async () => {
  const card = await cardWith(weekOf(madeVideo("today-2", { look_status: "waiting" })), "today-2");
  const img = pictureOf(pieceOf(card, "today-2"));
  assert.ok(img, "a ready video asks for its poster");
  assert.match(img.props.src, /today-2\/view\?w=/);
  img.props.onError();
  const missed = pieceOf(drawCard(), "today-2");
  assert.equal(pictureOf(missed), null, "REGRESSION: the tile stood black for good (17 Nov 2026)");
  assert.match(textOf(byTestId(missed, "today-content-waits")), new RegExp(FILE_WORDS.video.gettingReady));
  // Ask's look cuts the poster at the frame it chose: the card's next read says so, and the poster is asked for afresh.
  const looked = await readAgain(weekOf(madeVideo("today-2", { look_status: "done" })), "today-2", (tree) =>
    pictureOf(pieceOf(tree, "today-2")),
  );
  assert.ok(pictureOf(pieceOf(looked, "today-2")), "the poster the look cut is asked for");
});

test("a picture that did not come is asked for again by the card's next read, however long Today has stood open", async () => {
  const card = await cardWith(weekOf(madeVideo("today-3")), "today-3");
  pictureOf(pieceOf(card, "today-3")).props.onError();
  assert.equal(pictureOf(pieceOf(drawCard(), "today-3")), null);
  // Nothing about the video moved: the read alone asks again, so one asked a moment too soon does not stand for the day.
  const again_ = await readAgain(weekOf(madeVideo("today-3")), "today-3", (tree) =>
    pictureOf(pieceOf(tree, "today-3")),
  );
  assert.ok(pictureOf(pieceOf(again_, "today-3")));
});

test("a video the platform could not read says so on Today too, and asks for nothing", async () => {
  const card = await cardWith(weekOf(madeVideo("today-4", { media_status: "failed" })), "today-4");
  const piece = pieceOf(card, "today-4");
  assert.equal(pictureOf(piece), null);
  assert.match(textOf(byTestId(piece, "today-content-waits")), new RegExp(FILE_WORDS.video.notPrepared));
});
