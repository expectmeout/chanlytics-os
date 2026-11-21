/**
 * Who may be shown, and for what (00663; the content PRD's step L4, its consent half; the Ads plan's 6.8, join 1): the
 * one rule (contracts files/yes.ts) every page, AI and New ad ask, run as it is.
 *
 * Section 9's consent gates, as the rule holds them: a person with no recorded yes is never shown, a yes for posts never
 * covers an ad, a yes taken back stops the file and every piece drawn from it, a made piece shows who its photo or clips
 * show, music stays a no for an ad until its licence is written (L8), and Ads keeps no copy of any of it: New ad's
 * picture rule reads Content's answer and judges Meta's own rules alone.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  adPictureIssue,
  fileAdRightsOf,
  fileUseMay,
  fileUseOf,
  fileYesSaidOf,
  fileYesSpec,
  whoStandsOf,
} from "@chanlytics/contracts";

/** A photo the look counted two people in, recognizable, with the yeses given. */
const shown = (over = {}) => ({
  kind: "image",
  who_in_it: "not_asked",
  look_status: "done",
  people: { count: 2, recognizable: 2 },
  yes_for: [],
  yes_back: [],
  ...over,
});
const nobody = (over = {}) => shown({ people: { count: 0, recognizable: 0 }, ...over });

test("a person with no recorded yes is shown for nothing, and the look still at it waits", () => {
  for (const use of ["post", "ad", "reply", "cold_email"]) {
    assert.deepEqual(fileUseOf(use, shown()), { is: "ask", seen: 2 }, use);
    assert.equal(fileUseMay(fileUseOf(use, shown())), false, use);
  }
  assert.deepEqual(fileUseOf("ad", shown({ look_status: "waiting", people: null })), { is: "looking" });
  assert.deepEqual(fileUseOf("ad", shown({ people: null, look_status: "failed" })), { is: "ask", seen: null });
  // Nobody who could be recognized needs no yes; nor does a file a member said holds no one.
  assert.deepEqual(fileUseOf("ad", nobody()), { is: "free" });
  assert.deepEqual(fileUseOf("ad", shown({ people: { count: 3, recognizable: 0 } })), { is: "free" });
  assert.deepEqual(fileUseOf("ad", shown({ who_in_it: "no_one" })), { is: "free" });
  // The old tick is gone: a person's word on a file is no one, or nothing.
  assert.deepEqual(whoStandsOf(shown({ who_in_it: "no_one" })), { is: "said", who: "no_one" });
});

test("a yes is for the use it names: a yes for posts never covers an ad", () => {
  const forPosts = shown({ yes_for: ["post"] });
  assert.deepEqual(fileUseOf("post", forPosts), { is: "yes" });
  assert.deepEqual(fileUseOf("ad", forPosts), { is: "ask", seen: 2 });
  assert.equal(fileAdRightsOf(forPosts, [], false), "person");
  assert.equal(fileAdRightsOf(shown({ yes_for: ["ad"] }), [], false), null, "a yes for ads is one");
  // A file read before 00663 says nothing of its yeses: none.
  assert.equal(fileAdRightsOf({ ...shown(), yes_for: undefined, yes_back: undefined }, [], false), "person");
});

test("a yes taken back stops the file, and a piece drawn from it, until one is given again on the piece", () => {
  const back = shown({ yes_back: ["ad"] });
  assert.deepEqual(fileUseOf("ad", back), { is: "taken_back" });
  assert.equal(fileAdRightsOf(back, [], false), "person");
  const piece = nobody({ who_in_it: "not_asked", people: null, look_status: "done" });
  assert.deepEqual(fileUseOf("ad", piece, [back]), { is: "taken_back" }, "the piece shows who its photo shows");
  // A yes said on the piece itself answers for it whole, and so does one taken back there.
  assert.deepEqual(fileUseOf("ad", { ...piece, yes_for: ["ad"] }, [back]), { is: "yes" });
  assert.deepEqual(fileUseOf("ad", { ...piece, yes_back: ["ad"] }, [nobody()]), { is: "taken_back" });
});

test("a made piece shows who its photo or clips show: every one fine, or the first one that is not", () => {
  const piece = shown({ people: null });
  assert.deepEqual(fileUseOf("ad", piece, [nobody(), nobody({ who_in_it: "no_one" })]), { is: "free" });
  assert.deepEqual(fileUseOf("ad", piece, [nobody(), shown({ yes_for: ["ad"] })]), { is: "yes" });
  assert.deepEqual(
    fileUseOf("ad", piece, [shown({ yes_for: ["ad"] }), shown({ yes_for: ["post"] })]),
    { is: "ask", seen: 2 },
    "one clip's person said yes to posts alone",
  );
  // A piece whose files are all gone is judged as it is.
  assert.deepEqual(fileUseOf("ad", piece, []), { is: "ask", seen: null });
});

test("music in an ad stays a no until its licence is written: a video with music, or not heard yet", () => {
  const clip = nobody({ kind: "video" });
  assert.equal(fileAdRightsOf(clip, [], false), null);
  assert.equal(fileAdRightsOf(clip, [], true), "music");
  assert.equal(fileAdRightsOf(clip, [], null), "music", "not heard yet");
  assert.equal(fileAdRightsOf(nobody(), [], null), null, "a photo has no sound");
  // Someone shown with no yes for ads is said first: it is the cause an owner mends.
  assert.equal(fileAdRightsOf(shown({ kind: "video" }), [], true), "person");
});

test("New ad keeps no copy of the rule: its picture rule reads Content's answer, then Meta's own rules", () => {
  const picture = (over) => ({
    id: "p1",
    serviceId: null,
    kind: "photo",
    width: 1080,
    height: 1080,
    seconds: null,
    rights: null,
    beforeAfter: false,
    made: false,
    ...over,
  });
  assert.equal(adPictureIssue(picture({ rights: fileAdRightsOf(shown({ yes_for: ["ad"] }), [], false) })), null);
  assert.equal(adPictureIssue(picture({ rights: fileAdRightsOf(shown({ yes_for: ["post"] }), [], false) })), "person");
  assert.equal(adPictureIssue(picture({ rights: null, width: 300, height: 300 })), "small", "Meta's rules are Ads'");
});

test("the Library says what stands and what it still needs, in plain words", () => {
  assert.deepEqual(fileYesSaidOf(shown()), {
    stands: "AI saw 2 people.",
    needs: "Before it is posted or runs as an ad, they need to say yes to posts and ads.",
  });
  assert.deepEqual(fileYesSaidOf(shown({ yes_for: ["post"] })), {
    stands: "They said yes to posts.",
    needs: "Before it runs as an ad, they need to say yes to ads.",
  });
  assert.deepEqual(fileYesSaidOf(shown({ yes_for: ["ad", "post"] })), {
    stands: "They said yes to posts and ads.",
    needs: null,
  });
  assert.deepEqual(fileYesSaidOf(shown({ yes_for: ["post"], yes_back: ["ad"] })), {
    stands: "They said yes to posts. A yes to ads was taken back.",
    needs: "Before it runs as an ad, they need to say yes to ads.",
  });
  assert.equal(fileYesSaidOf(nobody()), null, "nobody in it: nothing to say");
  assert.equal(fileYesSaidOf(shown({ look_status: "waiting", people: null })), null, "the look is still at it");
});

test("AI's card: a yes presses its door, a take-back the other, and only a yes kept has an Undo", () => {
  const card = (payload) => ({ id: "p-1", kind: "file_yes", payload, summary: "", plan: null, step: null });
  const yes = card({ file_id: "f1", uses: ["post", "ad"], who: "Ana", thread_id: "t1" });
  assert.deepEqual(fileYesSpec.commit(yes, { settings: null }), {
    route: "POST files/[id]/yes",
    params: { id: "f1" },
    body: { uses: ["post", "ad"], who: "Ana", thread_id: "t1" },
  });
  const kept = { kept: ["ad", "post"], again: [] };
  assert.equal(fileYesSpec.receipt(yes, kept), "Kept: Ana said yes to posts and ads.");
  assert.deepEqual(fileYesSpec.undo.record(yes, kept, { settings: null }), { file_id: "f1", uses: ["post", "ad"] });
  assert.equal(fileYesSpec.receipt(yes, { kept: [], again: ["post"] }), "Already kept: Ana said yes to posts.");
  assert.equal(fileYesSpec.undo.record(yes, { kept: [], again: ["post"] }, { settings: null }), null);
  const back = card({ file_id: "f1", uses: [], back: true });
  assert.deepEqual(fileYesSpec.commit(back, { settings: null }), {
    route: "POST files/[id]/yes/back",
    params: { id: "f1" },
    body: {},
  });
  const answered = {
    held: [{ post_id: "a", place: "instagram" }],
    live: [
      { post_id: "b", place: "google" },
      { post_id: "c", place: "instagram" },
    ],
  };
  assert.equal(
    fileYesSpec.receipt(back, answered),
    "Taken back. 1 waiting post held. Still up on Google and Instagram: take it down there.",
  );
  assert.equal(fileYesSpec.undo.label(back), null, "a take-back has no Undo");
  assert.equal(fileYesSpec.open(yes, null), "campaigns/content:library:f1");
});
