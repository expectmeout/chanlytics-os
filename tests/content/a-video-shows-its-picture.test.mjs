/**
 * A video's picture where it is drawn, on Files' tile and on its card (decision 0099, stage B; decision 0122): the platform says a
 * video can be played some seconds before its poster is cut (the digest's sheet step, then the look's own frame), and a page on
 * screen draws at once. Seen on production 11 Nov 2026: a video made by Ask came ready at 06:26:14, its first poster at 06:26:22,
 * and the tile drawn between stood blank for good. A tile whose picture is not there yet says it is getting ready, never its bare
 * name, and looks again once Ask has looked at it; a card drawn afresh in those seconds says its poster did not come, so its
 * first still stands in. Drawn by the real components on the stub React.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { installStubReact, fresh, again, byTestId, find, textOf } from "../_stub-react.mjs";

installStubReact({ __DEMO_MODE: false, CHANLY: { nav() {} } });
const S = "../../apps/dashboard/src";
const { createElement } = globalThis.React;
const { Photo } = await import(`${S}/surfaces/files/photo.tsx`);
const { AskPieceCard } = await import(`${S}/surfaces/ask/card-piece.tsx`);
const { askText } = await import(`${S}/surfaces/ask/words.ts`);
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
