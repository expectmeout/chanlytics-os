/**
 * A video's picture where it is drawn, on Files' tile and on its card (decision 0099, stage B; decision 0122): the platform says a video can be played some seconds before its poster is cut (the digest's sheet step, then the look's
 * own frame), and a page on screen draws at once. Seen on production 11 Nov 2026: a video made by Ask came ready at 06:26:14, its
 * first poster at 06:26:22, and the tile drawn between stood blank for good. A tile whose picture is not there yet says it is
 * getting ready, never its bare name, and looks again once Ask has looked at it; a card drawn afresh in those seconds says its
 * poster did not come, so its first still stands in. Today's card drew its pictures its own way and kept none of it: four videos
 * Ask made stood black tiles on Today, their lengths in the corner, while Content showed them (Ruben's phone, 17 Nov 2026);
 * since Today, calm (19 Nov 2026), Content is one line there, its face the newest piece's picture, which keeps the same rules.
 * Drawn by the real components on the stub React, Today's line over its own read answered as the server answers it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { installStubReact, fresh, again, byTestId, find, textOf } from "../_stub-react.mjs";
import { until } from "../shared/_until.mjs";
import { bridgeHolds } from "../shell/_bridge-holds.mjs";

const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
/** What GET content/note answers Today's line with, as the next read finds it; and how many times it was asked. */
let note = null;
let noteReads = 0;
bridgeHolds({
  who: {
    workspaces: [{ id: T, slug: "harbor", name: "Brightline", status: "active", timezone: "America/Chicago" }],
    activeWorkspaceId: T,
  },
});
installStubReact({
  location: { pathname: "/w/harbor/", hash: "", search: "", origin: "https://app.chanlytics.com" },
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
const { TodayContentLine } = await import(`${S}/surfaces/today/content-note.tsx`);
const { Icon } = await import(`${S}/surfaces/kit/icon/icon.tsx`);
const { clearReadCaches } = await import(`${S}/bridge/read-cache.ts`);
const { api } = await import(`${S}/bridge/api.ts`);
const { dayWasRead } = await import(`${S}/surfaces/today/first-draw-read.ts`);
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

/* -------------------------------------------------------------------------------------------- Today's Content line -- */

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
const drawLine = () => again(() => createElement(TodayContentLine));
const lineOf = (tree) => byTestId(tree, "today-content-line");
const pictureOf = (line) => (line ? find(line, (n) => n.type === "img") : null);
const markOf = (line) => find(line, (n) => n.type === Icon)?.props.name ?? null;

/** Today's line drawn afresh over this answer, once its read has landed. */
async function lineWith(answer) {
  note = answer;
  clearReadCaches();
  api().forget();
  fresh();
  await until(() => !!lineOf(drawLine()), "the line's read landed");
  return lineOf(drawLine());
}

test("Today's Content line asks no picture of a video not ready yet, nor of one the platform could not read: its face is the video's mark", async () => {
  for (const media_status of ["processing", "failed"]) {
    const line = await lineWith(weekOf(madeVideo(`today-${media_status}`, { media_status, look_status: "waiting" })));
    assert.equal(pictureOf(line), null, `${media_status}: nothing is asked of a video the platform has not made ready`);
    assert.equal(markOf(line), "video", "REGRESSION (17 Nov 2026): a black tile where a video stood");
  }
});

test("a ready video's picture is asked for over its mark, which stands where the picture does not come; the line is drawn afresh once Ask has looked at it", async () => {
  const line = await lineWith(weekOf(madeVideo("today-2", { look_status: "waiting" })));
  assert.match(pictureOf(line).props.src, /today-2\/view\?w=320/);
  assert.equal(markOf(line), "video", "the mark under it");
  const keyOf = (tree) => find(tree, (n) => n.type?.name === "WeekLine")?.props.key;
  const before = keyOf(drawLine());
  // Ask's look cuts the poster at the frame it chose: the line's next read, as Today's own read lands a minute on, draws it
  // afresh, so the picture is asked for again.
  note = weekOf(madeVideo("today-2", { look_status: "done" }));
  api().forget();
  const realNow = Date.now;
  Date.now = () => realNow() + 61_000;
  try {
    const reads = noteReads;
    dayWasRead(Date.now());
    drawLine();
    await until(() => noteReads > reads, "the line asked again");
    await until(() => keyOf(drawLine()) !== before, "drawn afresh");
  } finally {
    Date.now = realNow;
  }
  assert.ok(pictureOf(lineOf(drawLine())), "the poster the look cut is asked for");
});

/* ------------------------------------------------------------------------------------- Today names a take-down -- */

test("a take-down still open is a line of its own on Today: the owner's in amber, one that only waits said plainly, each opening the piece", async () => {
  const piece = (id, name) => madeVideo(id, { kind: "image", name }).file;
  note = {
    ...weekOf(),
    down: [
      { is: "by_hand", place: "instagram", file: piece("down-1", "the-finish") },
      { is: "unconfirmed", place: "google", file: piece("down-2", "warm-balayage") },
    ],
  };
  clearReadCaches();
  api().forget();
  fresh();
  const rowOf = (is) => byTestId(drawLine(), `today-content-down-${is}`);
  await until(() => !!rowOf("by_hand"), "the line's read landed");
  const mine = rowOf("by_hand");
  assert.match(textOf(mine), /Delete it in Instagram · Chanlytics couldn't/);
  assert.equal(find(mine, (n) => n.props?.["data-tone"] === "warn") !== null, true, "the owner's to finish, in amber");
  assert.match(pictureOf(mine).props.src, /down-1\/view/, "the piece is known by its picture");
  const waits = rowOf("unconfirmed");
  assert.match(textOf(waits), /Google hasn't confirmed it's gone · Chanlytics is on it/);
  assert.equal(
    find(waits, (n) => n.props?.["data-tone"] === "warn"),
    null,
    "nothing is asked of the owner",
  );
  assert.equal(lineOf(drawLine()), null, "a week that made nothing says nothing of the week");
});

test("an answer from before take-downs were named draws as it did", async () => {
  const line = await lineWith(weekOf(madeVideo("today-old")));
  assert.ok(line, "the week's line");
  assert.equal(byTestId(drawLine(), "today-content-down-by_hand"), null);
});
