/**
 * Where a piece goes, a line a placement, and who is in it (the content loop PRD's 8.2, 8.3, 21.3 and 15.1; the journey
 * canvas, board Piece): each state in the owner's words with its one fix. "On Instagram" is said only once the account
 * was seen holding the post; a story says when it ended by itself; a post held for a person names them and asks them; a
 * take-down says what the place said and never that a post is down before it did; a reader is offered nothing to press.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  GOES_WORDS,
  ON_INSTAGRAM,
  TAKE_DOWN_WORDS,
  goesLinesOf,
  goesPillOf,
  personInitialsOf,
  personSaidOf,
  personStandsOf,
  personToAskOf,
  takeDownWillOf,
} from "@chanlytics/contracts";

const NOW = Date.parse("2026-12-01T18:00:00Z");
const ago = (ms) => new Date(NOW - ms).toISOString();
const ahead = (ms) => new Date(NOW + ms).toISOString();
const MIN = 60_000;
const HOUR = 60 * MIN;
let seq = 0;
const post = (over = {}) => ({
  id: `post-${++seq}`,
  place: "instagram",
  kind: "reel",
  caption: "Forty-five minutes, one round brush.",
  status: "published",
  held_reason: null,
  held_why: null,
  permalink: "https://www.instagram.com/reel/abc/",
  scheduled_for: ago(HOUR),
  published_at: ago(HOUR),
  verified_at: ago(HOUR),
  good_until: null,
  error: null,
  created_at: ago(2 * HOUR),
  ...over,
});
const person = (over = {}) => ({
  id: "subject-1",
  file_id: "file-1",
  name: "Paola Ruiz",
  label: "client",
  contact_id: "contact-1",
  conversation: { id: "conv-1", channel: "whatsapp" },
  yes: [],
  took_back: [],
  asked: null,
  said_no_at: null,
  answered: null,
  ...over,
});
const known = (over = {}) => ({
  people: null,
  takeDown: null,
  when: (iso) => `@${iso.slice(11, 16)}`,
  nowMs: NOW,
  may: true,
  ...over,
});
const one = (p, over) => goesLinesOf([p], known(over))[0];
const acts = (line) => line.acts.map((a) => a.is);

test("up is said only once the account was seen holding it, and a story says when it ended by itself", () => {
  const seen = one(post());
  assert.equal(seen.name, "Instagram reel");
  assert.equal(seen.said, "On Instagram · @17:00");
  assert.equal(seen.tone, "ok");
  assert.deepEqual(seen.acts, [{ is: "see", href: "https://www.instagram.com/reel/abc/" }]);
  const unseen = one(post({ verified_at: null }));
  assert.equal(unseen.said, ON_INSTAGRAM.unverified);
  assert.notEqual(unseen.tone, "ok", "sent is not yet up");
  const google = one(post({ place: "google", kind: "picture", verified_at: null }));
  assert.equal(google.said, "On Google · @17:00");
  const story = one(post({ kind: "story", published_at: ago(26 * HOUR) }));
  assert.equal(story.said, "Was on Instagram for a day · @16:00");
  assert.equal(story.tone, "gone");
  assert.deepEqual(story.acts, []);
});

test("on its way: set for its time with its two acts, then each step as it is reached", () => {
  const timed = one(post({ status: "queued", scheduled_for: ahead(3 * HOUR), published_at: null }));
  assert.equal(timed.said, "Goes up @21:00");
  assert.deepEqual(acts(timed), ["move", "pull"]);
  assert.equal(timed.acts[1].says, GOES_WORDS.dontPost);
  const ready = one(post({ status: "preparing", scheduled_for: ahead(MIN), published_at: null }));
  assert.equal(ready.said, "Instagram is getting it ready");
  assert.ok(ready.moving);
  assert.equal(one(post({ status: "publishing", published_at: null })).said, "Posting to Instagram");
  const checking = one(post({ place: "google", kind: "picture", status: "checking", published_at: null }));
  assert.equal(checking.said, "Checking with Google");
  assert.match(checking.note, /It won't post twice/);
  // A reader sees where it stands, and nothing to press.
  assert.deepEqual(one(post({ status: "queued", scheduled_for: ahead(3 * HOUR) }), { may: false }).acts, []);
});

test("held for a person: the line names them, its fix asks them, and the piece's one status says who", () => {
  const paola = person();
  const held = post({
    status: "held",
    held_why: "rights",
    held_reason: "Paola Ruiz hasn't said yes.",
    published_at: null,
  });
  const lines = goesLinesOf([held], known({ people: { state: "named", people: [paola] } }));
  assert.equal(lines[0].said, "Paola Ruiz hasn't said yes to posts");
  assert.equal(lines[0].tone, "you");
  assert.deepEqual(acts(lines[0]), ["ask_person", "tell_ai"]);
  assert.equal(lines[0].acts[0].person.id, "subject-1");
  assert.equal(lines[0].acts[1].prompt, "Make it again without Paola Ruiz");
  assert.deepEqual(goesPillOf(lines), { said: "Paola Ruiz hasn't said yes", tone: "you", moving: false });
  // Nobody has said who is in it: the fix is to say so.
  const unsure = one(held, { people: { state: "unsure", people: [] } });
  assert.equal(unsure.said, GOES_WORDS.sayWho);
});

test("held since it was approved, for its reason, or by its place: each with its own way on, never post anyway", () => {
  const changed = one(post({ status: "held", held_why: "changed", held_reason: ON_INSTAGRAM.held.changed }));
  assert.equal(changed.said, "Changed since you approved it");
  assert.deepEqual(changed.acts, [{ is: "approve", says: "Look again" }]);
  const passed = one(
    post({ status: "held", held_why: "reason_passed", held_reason: "“20% off” has ended since you approved this." }),
  );
  assert.equal(passed.said, "“20% off” has ended since you approved this.");
  assert.deepEqual(
    passed.acts.map((a) => a.says ?? a.hint),
    ["Leave it out", "Change the words", "Tell AI it still stands"],
  );
  assert.deepEqual(passed.acts[2], { is: "say_ai", hint: "Tell AI it still stands", begin: "It still stands: " });
  const lost = one(post({ status: "held", held_why: "disconnected", held_reason: ON_INSTAGRAM.held.disconnected }));
  assert.equal(lost.said, "Instagram needs connecting again");
  assert.deepEqual(acts(lost), ["connect"]);
  assert.equal(
    one(post({ status: "held", held_why: "stopped", held_reason: "x" })).said,
    "AI is paused · nothing posts",
  );
});

test("didn't post: the place's reason, and the one thing to do", () => {
  const long = one(post({ status: "failed", error: ON_INSTAGRAM.refused.words, published_at: null }));
  assert.equal(long.said, `Didn't post · ${ON_INSTAGRAM.refused.words}`);
  assert.deepEqual(long.acts[0], { is: "words", says: "Shorten it" });
  const video = one(post({ status: "failed", error: ON_INSTAGRAM.refused.video, published_at: null }));
  assert.equal(video.acts[0].says, "Make it again");
  const other = one(post({ status: "failed", error: ON_INSTAGRAM.refused.other, published_at: null }));
  assert.deepEqual(other.acts[0], { is: "approve", says: "Try again" });
});

test("too late is said and never sent; a post the owner let go says nothing, and the one up under it still does", () => {
  const late = one(
    post({
      status: "pulled",
      held_why: "late",
      held_reason: "Too late to post. Thursday has passed.",
      published_at: null,
    }),
  );
  assert.equal(late.said, "Too late to post · Thursday has passed");
  assert.equal(late.tone, "gone");
  assert.deepEqual(late.acts, []);
  assert.deepEqual(goesLinesOf([post({ status: "pulled", published_at: null })], known()), []);
  const up = post({ kind: "picture", created_at: ago(30 * HOUR) });
  const letGo = post({ kind: "picture", status: "pulled", published_at: null, created_at: ago(HOUR) });
  assert.deepEqual(
    goesLinesOf([letGo, up], known()).map((l) => l.said),
    ["On Instagram · @17:00"],
  );
  // A newer one that stopped does not hide the one that is up.
  const stopped = post({ kind: "picture", status: "failed", error: "x", published_at: null, created_at: ago(MIN) });
  assert.deepEqual(
    goesLinesOf([stopped, up], known()).map((l) => l.tone),
    ["you", "ok"],
  );
});

test("a take-down says what the place said: asked, by hand with the place's link, a day with no answer, then down", () => {
  const up = post();
  const action = (over) => ({
    id: "action-1",
    target: "post",
    target_id: up.id,
    act: "take_down",
    outcome: "pending",
    said: null,
    started_at: ago(MIN),
    finished_at: null,
    name: null,
    ...over,
  });
  const down = (over) => ({
    takeDown: { cause: "owner_removed", asked_at: ago(MIN), finished_at: null, actions: [action(over)] },
  });
  const asking = one(up, down());
  assert.equal(asking.said, "Taking it down from Instagram");
  assert.ok(asking.moving);
  const byHand = one(up, down({ outcome: "needs_person", said: ON_INSTAGRAM.takeDown.byHand, finished_at: ago(0) }));
  assert.equal(byHand.said, "Chanlytics can't take this down from Instagram");
  assert.equal(byHand.note, "Open the reel in Instagram, then Delete. Chanlytics checks it's gone.");
  assert.deepEqual(acts(byHand), ["open_place", "deleted"]);
  assert.equal(byHand.acts[0].href, up.permalink);
  const stillUp = one(
    up,
    down({ outcome: "needs_person", said: TAKE_DOWN_WORDS.stillUp("instagram"), finished_at: ago(0) }),
  );
  assert.equal(stillUp.note, TAKE_DOWN_WORDS.stillUp("instagram"));
  const quiet = one(up, down({ started_at: ago(25 * HOUR) }));
  assert.equal(quiet.said, "Instagram hasn't confirmed it's gone · Chanlytics is on it");
  assert.deepEqual(quiet.acts, [], "nothing is the owner's to do");
  const gone = one({ ...up, status: "taken_down" }, down({ outcome: "done", finished_at: ago(0) }));
  assert.equal(gone.said, "Taken down · @18:00");
  assert.equal(gone.tone, "gone");
});

test("the piece's one status leads with what needs the owner, then what moves, and counts what is set", () => {
  const timed = (kind, place = "instagram") =>
    post({ place, kind, status: "queued", scheduled_for: ahead(3 * HOUR), published_at: null });
  const set = goesLinesOf([timed("reel"), timed("story"), timed("picture", "google")], known());
  assert.deepEqual(goesPillOf(set), { said: "Goes up @21:00 · 3 places", tone: "", moving: false });
  const mixed = goesLinesOf([post(), post({ kind: "story", status: "publishing", published_at: null })], known());
  assert.equal(goesPillOf(mixed).said, "Posting to Instagram");
  assert.ok(goesPillOf(mixed).moving);
  const changed = goesLinesOf([post({ status: "held", held_why: "changed", held_reason: "x" })], known());
  assert.equal(goesPillOf(changed).said, "Changed · approve it again");
  assert.equal(goesPillOf([]), null);
});

test("what the confirm says the press will do, a line a placement", () => {
  const will = takeDownWillOf(
    [
      post({ id: "a" }),
      post({ id: "b", kind: "story", published_at: ago(30 * HOUR) }),
      post({ id: "c", place: "google", kind: "picture" }),
      post({ id: "d", kind: "picture", status: "queued", published_at: null }),
      post({ id: "e", kind: "picture", status: "pulled", published_at: null }),
    ],
    (place) => place === "google",
    NOW,
  );
  assert.deepEqual(
    will.map((w) => [w.name, w.will]),
    [
      ["Instagram reel", "You delete it in Instagram; Chanlytics checks it's gone"],
      ["Instagram story", "Gone already: a story lasts a day"],
      ["Google", "Chanlytics takes it down"],
      ["Instagram post", "Won't go up"],
    ],
  );
});

test("who is in it: where each person's yes for this use stands, in the owner's words", () => {
  const when = (iso) => `@${iso.slice(11, 16)}`;
  const channel = (via) => (via === "whatsapp" ? "WhatsApp" : via);
  const line = (p, use = "post") => personSaidOf(p, personStandsOf(p, use), use, { when, channel });
  assert.deepEqual(line(person()), { line: "Hasn't said yes to posts", tone: "you" });
  const asked = person({ asked: { at: ago(HOUR), via: "whatsapp", uses: ["post"] } });
  assert.equal(line(asked).line, "Asked @17:00 on WhatsApp · no answer yet");
  const answered = person({ ...asked, answered: { at: ago(MIN), words: "Yes of course!!", message_id: "m1" } });
  assert.deepEqual(personStandsOf(answered, "post"), {
    is: "answered",
    at: ago(MIN),
    words: "Yes of course!!",
    messageId: "m1",
  });
  const yes = person({ ...asked, yes: [{ use: "post", said_in: "message", at: ago(MIN), quote: "Yes of course!!" }] });
  assert.deepEqual(line(yes), { line: "Said yes to posts · @17:59", tone: "ok" });
  assert.equal(line(yes, "ad").line, "Hasn't said yes to ads", "a yes for posts never covers an ad");
  const inPerson = person({ yes: [{ use: "post", said_in: "in_person", at: ago(MIN), quote: null }] });
  assert.equal(line(inPerson).line, "Said yes to posts in person · @17:59");
  const team = person({
    label: "staff",
    yes: [
      { use: "post", said_in: "ai", at: ago(MIN), quote: null },
      { use: "ad", said_in: "ai", at: ago(MIN), quote: null },
    ],
  });
  assert.equal(line(team).line, "On your team · said yes to posts and ads");
  assert.equal(line(person({ said_no_at: ago(MIN) })).line, "Said no · @17:59");
  const back = person({ took_back: [{ use: "post", at: ago(MIN) }] });
  assert.deepEqual(line(back), { line: "Took back their yes · @17:59", tone: "you" });
  // Asked again since: the ask is what stands.
  assert.equal(personStandsOf({ ...back, asked: { at: ago(0), via: "sms", uses: ["post"] } }, "post").is, "asked");
  assert.equal(
    personToAskOf({ state: "named", people: [yes, person({ id: "s2", name: "Maria" })] }, "post").name,
    "Maria",
  );
  assert.equal(personToAskOf({ state: "named", people: [yes] }, "post"), null);
  assert.deepEqual(["Paola Ruiz", "Maria", " "].map(personInitialsOf), ["PR", "MA", "?"]);
});
