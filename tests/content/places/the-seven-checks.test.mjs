/**
 * The seven checks, each asked through `evaluate` with its words, and all of them at once (the content loop PRD's 6.1,
 * 6.3, 15.1; packages/core/src/content/policy). A check is a help, never a new way to be blocked: none of them judges an
 * owner's own typed words by a guess. AI's own card is the one held to say what its words are about (`wordsNeedAbout`),
 * and it can say they date nothing. A reason that no longer stands offers three ways on and never "post anyway".
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluate, verdictWords, wordsNeedAbout } from "@chanlytics/core";
import { CONTENT_CHECK_WORDS, ON_FACEBOOK, ON_INSTAGRAM, goodUntilOf } from "@chanlytics/contracts";

const ZONE = "America/New_York";
const NOW = Date.parse("2026-11-24T15:00:00Z"); // a Tuesday morning in New York
const intent = (part) => ({
  goal: null,
  opportunity_id: null,
  call_to_action: null,
  day: null,
  offer: null,
  service: null,
  ...part,
});
const reason = (part) => ({
  intent: null,
  goodUntil: null,
  atMs: NOW,
  nowMs: NOW,
  zone: ZONE,
  says: [],
  services: [],
  facts: [],
  opportunities: null,
  moment: "before",
  ...part,
});
const place = (part) => ({
  place: "instagram",
  kind: "picture",
  fileKind: "photo",
  connection: "yes",
  caption: "Open late on Fridays.",
  video: null,
  ...part,
});
/** The one refusal a set of facts comes to, or null. */
const refused = (facts) => {
  const verdict = evaluate(facts);
  if (verdict.ok) return null;
  assert.equal(verdict.refusals.length, 1, "one refusal");
  return verdict.refusals[0];
};

test("authorization: whoever acts may still act for the business", () => {
  assert.equal(refused({ authorization: { may: true, approving: true } }), null);
  assert.equal(refused({ authorization: { may: false, approving: true } }).words, CONTENT_CHECK_WORDS.mayNot);
  assert.deepEqual(refused({ authorization: { may: false, approving: false } }), {
    check: "authorization",
    code: "approver",
    words: ON_INSTAGRAM.held.approver,
  });
});

test("content rights read no yes: nothing said of a person, or of a file's yes, holds a post", () => {
  // What a business adds is taken as cleared (Ruben, 22 November 2026): no moment hands the evaluator a yes, and facts
  // of that shape, were they handed in, refuse nothing.
  assert.deepEqual(evaluate({ rights: { takenBack: true, gap: { is: "person", name: "Paola" } } }), { ok: true });
  assert.equal(refused({ rights: { takenBack: true, gap: { is: "unsure" } } }), null);
});

const claim = (part) => ({ text: "20% off a first colour", valid_until: "2026-12-31", withdrawn_at: null, ...part });
const claims = (part) => ({ aiWrote: true, words: "", said: "", claims: [], today: "2026-11-24", ...part });

test("claims: AI's words are held to what the owner said and the claims that stand; the owner's own are theirs", () => {
  const words = "Book this week: 20% off your first colour.";
  assert.equal(refused({ claims: claims({ words: "Open late on Fridays." }) }), null, "nothing claimed");
  assert.equal(refused({ claims: claims({ words, aiWrote: false }) }), null, "the owner's own words");
  assert.equal(
    refused({ claims: claims({ words }) }).words,
    CONTENT_CHECK_WORDS.notAnOffer("20%"),
    "a share off nobody said is not one of the offers",
  );
  assert.equal(refused({ claims: claims({ words, claims: [claim({})] }) }), null, "an offer that stands is said");
  assert.equal(refused({ claims: claims({ words, said: "Say 20% off a first colour." }) }), null, "said in the chat");
  assert.equal(
    refused({ claims: claims({ words, claims: [claim({ valid_until: "2026-11-20" })] }) }).code,
    "claim",
    "an offer whose last day passed stands no more",
  );
  assert.equal(
    refused({ claims: claims({ words, claims: [claim({ withdrawn_at: "2026-11-23T10:00:00Z" })] }) }).code,
    "claim",
    "a withdrawn offer stands no more",
  );
  assert.equal(
    refused({ claims: claims({ words: "The best colour in town, guaranteed." }) }).words,
    CONTENT_CHECK_WORDS.notYours("guaranteed"),
    "a promise the owner never made",
  );
});

test("the reason: open time a piece was made for is asked again, and the owner's stated fact covers it", () => {
  const thursday = intent({ opportunity_id: "open_capacity:2026-11-26", day: "2026-11-26" });
  const asked = (part) => refused({ reason: reason({ intent: thursday, moment: "send", ...part }) });
  assert.equal(asked({ opportunities: null }), null, "a caller that read none asks nothing");
  assert.equal(asked({ opportunities: [{ key: "open_capacity:2026-11-26" }] }), null, "Thursday still has time open");
  assert.equal(asked({ opportunities: [] }).words, CONTENT_CHECK_WORDS.filledUp("Thursday"), "Thursday filled up");
  assert.equal(asked({ opportunities: [] }).code, "reason_passed");
  assert.equal(
    asked({ opportunities: [], facts: [{ says: "Thursday still has openings", until: "2026-11-26" }] }),
    null,
    "the owner said Thursday still has openings",
  );
  assert.equal(
    refused({ reason: reason({ intent: thursday, opportunities: [] }) }).words,
    CONTENT_CHECK_WORDS.noOpenings("Thursday"),
    "before it is approved, the words say what to change",
  );
});

test("publishing: the place takes the kind, the connection allows it, the words and the video fit", () => {
  const says = (part) => refused({ publishing: place(part) });
  assert.equal(says({}), null);
  assert.equal(says({ kind: "reel" }).words, ON_INSTAGRAM.wrongKind, "a picture is no reel");
  assert.equal(says({ kind: "picture", fileKind: "video" }).words, ON_INSTAGRAM.wrongKind);
  const video = (v) =>
    says({ kind: "reel", fileKind: "video", video: { mime: "video/mp4", bytes: 1e6, ms: 13_000, ...v } });
  assert.equal(video({}), null);
  assert.equal(video({ ms: 2_000 }).words, CONTENT_CHECK_WORDS.video);
  assert.equal(video({ mime: "video/webm" }).words, CONTENT_CHECK_WORDS.video);
  assert.equal(video({ bytes: 400 * 1024 * 1024 }).words, CONTENT_CHECK_WORDS.video);
  assert.equal(says({ place: "google", kind: "picture", fileKind: "video" }).check, "publishing");
  assert.equal(says({ connection: "not_connected" }).code, "disconnected");
  assert.equal(says({ connection: "line_off" }).words, CONTENT_CHECK_WORDS.lineOff);
  assert.equal(says({ place: "google", caption: "x".repeat(1501) }).words, CONTENT_CHECK_WORDS.tooLong("google", 1500));
  assert.match(says({ caption: "#a ".repeat(31) }).words, /30 hashtags/);
  // A Page (pass 5) takes what Instagram takes, said in Facebook's words; a 2-minute reel is past a Page's 90 seconds.
  assert.equal(says({ place: "facebook" }), null);
  assert.equal(says({ place: "facebook", kind: "reel" }).words, ON_FACEBOOK.wrongKind);
  const pageReel = says({
    place: "facebook",
    kind: "reel",
    fileKind: "video",
    video: { mime: "video/mp4", bytes: 1e6, ms: 120_000 },
  });
  assert.equal(pageReel.words, CONTENT_CHECK_WORDS.video);
});

test("money and automation: within the limit; nothing goes while AI is paused, and AI never posts alone", () => {
  assert.equal(refused({ money: { costCents: 0, leftCents: 0, limitCents: 4000 } }), null);
  assert.equal(
    refused({ money: { costCents: 500, leftCents: 100, limitCents: 4000 } }).words,
    CONTENT_CHECK_WORDS.money(40),
  );
  assert.equal(refused({ money: { costCents: 500, leftCents: null, limitCents: null } }), null);
  assert.equal(refused({ automation: { stopped: true, pressedBy: "owner" } }).words, CONTENT_CHECK_WORDS.stopped);
  assert.equal(refused({ automation: { stopped: false, pressedBy: "ai" } }).words, CONTENT_CHECK_WORDS.aiAlone);
  assert.equal(refused({ automation: { stopped: false, pressedBy: "owner" } }), null);
});

test("AI's own card says what its words are about, or that they date nothing; nothing plain found asks nothing", () => {
  assert.deepEqual(wordsNeedAbout("Thursday has 3 open chairs", null), { is: "day", phrase: "Thursday" });
  assert.deepEqual(wordsNeedAbout("Book today, we have room", null), { is: "day", phrase: "today" });
  assert.equal(wordsNeedAbout("20% off every colour", null)?.is, "offer");
  assert.equal(wordsNeedAbout("Cuts from $45", null)?.is, "offer");
  assert.equal(wordsNeedAbout("Every message answered, every booking in one place", null), null);
  // Words a pattern would misread stay free: no generic "off", "deal" or "special".
  assert.equal(wordsNeedAbout("A well deserved day off, and a great deal of care", null), null);
  // The card says what they are about, or that they date nothing: nothing more is asked.
  assert.equal(wordsNeedAbout("Thursday has 3 open chairs", { day: "2026-11-26" }), null);
  assert.equal(wordsNeedAbout("Open Thursday to Saturday", { nothing: true }), null);
  assert.equal(wordsNeedAbout("20% off every colour", { offer: { says: "20% off", until: "2026-11-30" } }), null);
});

test("an owner's own words are never judged by a guess: with no intent, the reason asks nothing", () => {
  assert.equal(refused({ reason: reason({}) }), null);
  assert.equal(refused({ reason: reason({ moment: "send" }) }), null);
});

test("the reason: too late, an offer or a service the business does not say, each with the three ways on at a send", () => {
  const thursday = intent({ day: "2026-11-19" });
  const late = refused({
    reason: reason({ intent: thursday, goodUntil: goodUntilOf(thursday, ZONE), moment: "send" }),
  });
  assert.deepEqual(late, { check: "reason", code: "late", words: "Too late to post. Thursday has passed." });
  // Set for a time after its day: said before anything is approved.
  const friday = intent({ day: "2026-11-27" });
  const after = refused({
    reason: reason({ intent: friday, goodUntil: goodUntilOf(friday, ZONE), atMs: Date.parse("2026-11-29T15:00:00Z") }),
  });
  assert.equal(after.words, CONTENT_CHECK_WORDS.afterItsDay);
  const offer = intent({ offer: { says: "20% off", until: null } });
  // Before it is approved, it is a claim the business does not make (PRD 6.3); at the send, it ended since.
  assert.equal(
    refused({ reason: reason({ intent: offer }) }).words,
    "“20% off” isn't one of your offers. Add it, or change the words.",
  );
  const ended = refused({ reason: reason({ intent: offer, moment: "send" }) });
  assert.equal(ended.words, CONTENT_CHECK_WORDS.offerEnded("20% off"));
  assert.match(ended.words, /Leave it out, change the words, or tell AI/);
  assert.doesNotMatch(ended.words, /anyway/i);
  assert.equal(
    refused({ reason: reason({ intent: offer, says: ["Winter deal 20% off every colour"], moment: "send" }) }),
    null,
  );
  // A last day passed ends it, whatever the business still says.
  const lapsed = intent({ offer: { says: "20% off", until: "2026-11-20" } });
  assert.equal(
    refused({ reason: reason({ intent: lapsed, says: ["20% off"], moment: "send" }) }).code,
    "reason_passed",
  );
  // The owner's own word, kept until its day ends, stands for it.
  const said = [{ says: "20% off still runs", until: "2026-11-24" }];
  assert.equal(refused({ reason: reason({ intent: offer, facts: said, moment: "send" }) }), null);
  assert.equal(
    refused({ reason: reason({ intent: offer, facts: [{ ...said[0], until: "2026-11-23" }], moment: "send" }) }).code,
    "reason_passed",
  );
  // A price the business states for a service is something it says.
  assert.equal(
    refused({ reason: reason({ intent: intent({ offer: { says: "$45", until: null } }), says: ["Cut from $45"] }) }),
    null,
  );
  const service = intent({ service: "Balayage" });
  assert.equal(refused({ reason: reason({ intent: service, services: ["balayage", "Cut"] }) }), null);
  assert.equal(
    refused({ reason: reason({ intent: service, services: ["Cut"] }) }).words,
    CONTENT_CHECK_WORDS.notAService("Balayage"),
  );
  assert.equal(
    refused({ reason: reason({ intent: service, services: ["Cut"], moment: "send" }) }).words,
    CONTENT_CHECK_WORDS.serviceGone("Balayage"),
  );
});

test("good_until is the end of the day the words are about, or of the offer's last day, whichever comes first", () => {
  assert.equal(goodUntilOf(null, ZONE), null);
  assert.equal(goodUntilOf(intent({ service: "Cut" }), ZONE), null);
  assert.equal(goodUntilOf(intent({ day: "2026-11-26" }), ZONE), "2026-11-27T04:59:59.999Z");
  assert.equal(
    goodUntilOf(intent({ day: "2026-11-26", offer: { says: "x", until: "2026-11-25" } }), ZONE),
    "2026-11-26T04:59:59.999Z",
  );
});

test("evaluate asks every check its facts reach and answers every refusal at once, in the PRD's order", () => {
  assert.deepEqual(evaluate({}), { ok: true });
  const verdict = evaluate({
    authorization: { may: true, approving: true },
    publishing: place({ connection: "not_connected" }),
    automation: { stopped: true, pressedBy: "owner" },
    reason: reason({ intent: intent({ service: "Balayage" }) }),
  });
  assert.equal(verdict.ok, false);
  assert.deepEqual(
    verdict.refusals.map((r) => r.check),
    ["publishing", "automation", "reason"],
  );
  assert.equal(
    verdictWords(verdict),
    [
      CONTENT_CHECK_WORDS.notConnected("instagram"),
      CONTENT_CHECK_WORDS.stopped,
      CONTENT_CHECK_WORDS.notAService("Balayage"),
    ].join(" "),
  );
});
