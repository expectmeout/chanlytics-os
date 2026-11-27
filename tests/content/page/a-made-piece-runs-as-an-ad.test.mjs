/**
 * "Run as an ad" on a made piece in Content (the Ads plan's 6.8, join 3, with G13 and G15): what the open piece says under
 * its acts from its record's word on ads (surfaces/campaigns/content/model/run-as-ad.ts), drawn by the real part on the
 * stub React (viewer/run-as-ad.tsx), and where each press goes. The record's word itself is the server's, by Content's
 * one picture rule (tests/ads/make/new-ad-draft.test.mjs, readPieceAd), and what the press opens is New ad's
 * (tests/ads/make/new-ad-screen.test.mjs).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { installStubReact, fresh, byTestId, textOf, press } from "../../_stub-react.mjs";
import { CONTENT_SHEET_WORDS, CONTENT_WORDS, parseAds } from "@chanlytics/contracts";

installStubReact({});
const S = "../../../apps/dashboard/src/surfaces/campaigns/content";
const { runAsAdOf } = await import(`${S}/model/run-as-ad.ts`);
const { RunAsAd, runAsAdActsOf } = await import(`${S}/viewer/run-as-ad.tsx`);

const FILE = "11111111-1111-4111-8111-111111111111";
const PHOTO = { kind: "image", status: "filed" };
const VIDEO = { kind: "video", status: "filed" };

/** The line's presses, each saying where it went. */
function actsHere() {
  const went = [];
  const acts = runAsAdActsOf(FILE, (route) => went.push(route), {
    ask: () => went.push("AI asked about the piece"),
    makePost: () => went.push("a picture post asked for"),
  });
  return { went, acts };
}

test("a piece that may run offers one press, and it opens New ad drafted around it, on Ads' own address", () => {
  const line = runAsAdOf({ is: "may" }, PHOTO, true);
  assert.deepEqual(line, { is: "press", words: "Run as an ad" });
  const { went, acts } = actsHere();
  fresh();
  const drawn = RunAsAd({ line, acts, busy: false });
  assert.equal(textOf(byTestId(drawn, "cnv-ad-run")), "Run as an ad");
  assert.equal(byTestId(drawn, "cnv-ad-said"), null, "no line of why beside it");
  press(byTestId(drawn, "cnv-ad-run"));
  assert.deepEqual(went, [`campaigns/ads:new:piece:${FILE}`]);
  assert.deepEqual(parseAds(went[0].slice("campaigns/".length)).compose, {
    door: "whatsapp",
    from: { how: "piece", id: FILE },
  });
});

/** Why a piece may not run as an ad, as its line says it, by the picture rule's reason. */
const W = {
  music: "It has music, which an ad can't carry yet",
  unheard: "It isn't heard yet, and an ad needs a video with no music",
  before_after: "It sets a before beside an after, which Meta turns down in ads",
  small: "It's too small for an ad",
  shape: "Its shape doesn't fit an ad in the feed",
  length: "It runs too long or too short for an ad",
};

test("a piece that may not run says why in one line with its one act, and is never offered the press", () => {
  const post = CONTENT_SHEET_WORDS.video.picture;
  const ask = CONTENT_WORDS.piece.ask;
  const cases = [
    // What a video's sound, shape or length stops, a picture post from its best moment does not.
    [{ is: "wont", why: "music" }, VIDEO, W.music, post, "a picture post asked for"],
    [{ is: "wont", why: "unheard" }, VIDEO, W.unheard, post, "a picture post asked for"],
    [{ is: "wont", why: "shape" }, VIDEO, W.shape, post, "a picture post asked for"],
    [{ is: "wont", why: "length" }, VIDEO, W.length, post, "a picture post asked for"],
    // Anything else of a picture is AI's to make again.
    [{ is: "wont", why: "shape" }, PHOTO, W.shape, ask, "AI asked about the piece"],
    [{ is: "wont", why: "small" }, PHOTO, W.small, ask, "AI asked about the piece"],
    [{ is: "wont", why: "before_after" }, PHOTO, W.before_after, ask, "AI asked about the piece"],
    // No ad account (never, or Meta signed it out): said as New ad's one thing missing says it, with the Ads page, where
    // Connect is.
    [{ is: "no_account" }, PHOTO, "No ad account is connected", "Open Ads", "campaigns/ads"],
  ];
  for (const [stands, file, said, act, goes] of cases) {
    const line = runAsAdOf(stands, file, true);
    const name = `${stands.is} ${stands.why ?? ""} ${file.kind}`;
    assert.deepEqual([line.is, line.said, line.act.words], ["why", said, act], name);
    const { went, acts } = actsHere();
    fresh();
    const drawn = RunAsAd({ line, acts, busy: false });
    assert.equal(byTestId(drawn, "cnv-ad-run"), null, `${name}: no press offered as if it could run`);
    assert.equal(textOf(byTestId(drawn, "cnv-ad-said")), said, name);
    press(byTestId(drawn, "cnv-ad-act"));
    assert.deepEqual(went, [goes], name);
  }
});

test("nothing is said where the record says nothing, on a piece set aside, or to whoever may not draft an ad", () => {
  assert.equal(runAsAdOf(null, PHOTO, true), null, "Ads not on here, a video not ready, a photo of the Library");
  assert.equal(runAsAdOf(undefined, PHOTO, true), null, "a server from before the word on ads");
  assert.equal(runAsAdOf({ is: "may" }, { kind: "image", status: "set_aside" }, true), null, "Put it back first");
  assert.equal(runAsAdOf({ is: "may" }, PHOTO, false), null, "a reader may not draft an ad");
  assert.equal(runAsAdOf({ is: "no_account" }, PHOTO, false), null);
  const { acts } = actsHere();
  fresh();
  assert.equal(RunAsAd({ line: null, acts, busy: false }), null);
});

test("its words follow docs/words.md: short, one sentence each, no full stop, and nobody called anything but AI", () => {
  const issues = ["music", "unheard", "before_after", "small", "shape", "length"];
  const lines = [
    runAsAdOf({ is: "may" }, PHOTO, true),
    runAsAdOf({ is: "no_account" }, PHOTO, true),
    ...issues.flatMap((why) => [VIDEO, PHOTO].map((file) => runAsAdOf({ is: "wont", why }, file, true))),
  ];
  const words = lines.flatMap((line) => (line.is === "press" ? [line.words] : [line.said, line.act.words]));
  assert.deepEqual(
    issues.map((why) => runAsAdOf({ is: "wont", why }, PHOTO, true).said),
    issues.map((why) => W[why]),
    "a line for every reason the picture rule gives",
  );
  for (const said of words) {
    assert.ok(said.length <= 70, `${said}: a line under the acts`);
    // "Ask about it" is Content's own press, a verb: AI is never called by another name.
    assert.doesNotMatch(said, /[.;—]|\b(?:we|us|our|assistant|agent|receptionist|Claude)\b/i, said);
  }
});

test("who is in a piece is never a reason: footage a business provides is taken as cleared (Ruben, 22 Nov 2026)", () => {
  const lines = ["music", "unheard", "before_after", "small", "shape", "length"].flatMap((why) =>
    [VIDEO, PHOTO].map((file) => runAsAdOf({ is: "wont", why }, file, true)),
  );
  for (const line of lines) {
    assert.doesNotMatch(line.said, /yes|someone|person|people/i, line.said);
    assert.doesNotMatch(line.act.words, /yes|who/i, line.act.words);
  }
});
