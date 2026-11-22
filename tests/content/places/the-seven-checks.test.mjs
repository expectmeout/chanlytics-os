/**
 * The seven checks, each alone with its words, and `evaluate` composing them (the content loop PRD's 6.1, 6.3, 15.1;
 * packages/core/src/content/policy). A piece whose words name a day and that carries no intent cannot be approved; a
 * weekday said again and again dates nothing; a reason that passed offers three ways on and never "post anyway".
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  automationAllows,
  budgetAllows,
  datedPhraseIn,
  evaluate,
  evaluateClaimPolicy,
  mayAct,
  placeAllows,
  reasonStands,
  rightsFor,
  verdictWords,
} from "@chanlytics/core";
import { CHECK_WORDS, ON_INSTAGRAM, goodUntilOf } from "@chanlytics/contracts";

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
const asked = (part) => ({
  intent: null,
  goodUntil: null,
  nowMs: NOW,
  zone: ZONE,
  notes: [],
  services: [],
  facts: [],
  words: "",
  moment: "approve",
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

test("authorization: whoever acts may still act for the business", () => {
  assert.equal(mayAct({ may: true, approving: true }), null);
  assert.equal(mayAct({ may: false, approving: true }).words, CHECK_WORDS.mayNot);
  assert.equal(mayAct({ may: false, approving: false }).code, "approver");
});

test("rights: a yes for posts taken back stops every new use", () => {
  assert.equal(rightsFor({ takenBack: false }), null);
  assert.deepEqual(rightsFor({ takenBack: true }), { check: "rights", code: "rights", words: CHECK_WORDS.takenBack });
});

test("claims: AI's words are held to the owner's; the owner's own words are theirs", () => {
  assert.equal(evaluateClaimPolicy({ aiWrote: true, problem: null }), null);
  assert.equal(evaluateClaimPolicy({ aiWrote: false, problem: "“20% off” isn't one of your offers." }), null);
  assert.match(evaluateClaimPolicy({ aiWrote: true, problem: "“20% off” isn't one of your offers." }).words, /20% off/);
});

test("publishing: the place takes the kind, the connection allows it, the words and the video fit", () => {
  assert.equal(placeAllows(place({})), null);
  assert.equal(placeAllows(place({ kind: "reel" })).words, ON_INSTAGRAM.wrongKind, "a picture is no reel");
  assert.equal(placeAllows(place({ kind: "picture", fileKind: "video" })).words, ON_INSTAGRAM.wrongKind);
  assert.equal(
    placeAllows(place({ kind: "reel", fileKind: "video", video: { mime: "video/mp4", bytes: 1e6, ms: 13_000 } })),
    null,
  );
  assert.equal(
    placeAllows(place({ kind: "reel", fileKind: "video", video: { mime: "video/mp4", bytes: 1e6, ms: 2_000 } })).words,
    CHECK_WORDS.video,
  );
  assert.equal(
    placeAllows(place({ kind: "reel", fileKind: "video", video: { mime: "video/webm", bytes: 1e6, ms: 13_000 } }))
      .words,
    CHECK_WORDS.video,
  );
  assert.equal(placeAllows(place({ place: "google", kind: "picture", fileKind: "video" })).check, "publishing");
  assert.equal(placeAllows(place({ connection: "not_connected" })).code, "disconnected");
  assert.equal(placeAllows(place({ connection: "line_off" })).words, CHECK_WORDS.lineOff);
  assert.equal(
    placeAllows(place({ place: "google", caption: "x".repeat(1501) })).words,
    CHECK_WORDS.tooLong("google", 1500),
  );
  assert.match(placeAllows(place({ caption: "#a ".repeat(31) })).words, /30 hashtags/);
});

test("money and automation: within the limit; nothing goes while AI is paused, and AI never posts alone", () => {
  assert.equal(budgetAllows({ costCents: 0, leftCents: 0, limitCents: 4000 }), null);
  assert.equal(budgetAllows({ costCents: 500, leftCents: 100, limitCents: 4000 }).words, CHECK_WORDS.money(40));
  assert.equal(budgetAllows({ costCents: 500, leftCents: null, limitCents: null }), null);
  assert.equal(automationAllows({ stopped: true, pressedBy: "owner" }).words, CHECK_WORDS.stopped);
  assert.equal(automationAllows({ stopped: false, pressedBy: "ai" }).words, CHECK_WORDS.aiAlone);
  assert.equal(automationAllows({ stopped: false, pressedBy: "owner" }), null);
});

test("words that date something need an intent before they are approved; a standing weekday dates nothing", () => {
  assert.deepEqual(datedPhraseIn("Thursday has 3 open chairs"), { is: "day", phrase: "Thursday" });
  assert.deepEqual(datedPhraseIn("Book today, we have room"), { is: "day", phrase: "today" });
  assert.equal(datedPhraseIn("Open late on Fridays")?.is, undefined);
  assert.equal(datedPhraseIn("Every message answered, every booking in one place"), null);
  assert.equal(datedPhraseIn("20% off every colour")?.is, "offer");
  assert.equal(datedPhraseIn("Abierto hasta tarde todos los viernes"), null);
  const refused = reasonStands(asked({ words: "Thursday has 3 open chairs" }));
  assert.equal(refused.words, CHECK_WORDS.needsDay("Thursday"));
  assert.equal(refused.code, "reason_passed");
  // With the intent that names its day, it passes; after approval the intent the approval kept is what is read.
  assert.equal(
    reasonStands(asked({ words: "Thursday has 3 open chairs", intent: intent({ day: "2026-11-26" }) })),
    null,
  );
  assert.equal(reasonStands(asked({ words: "Thursday has 3 open chairs", moment: "send" })), null);
});

test("the reason: a passed day is late; an ended offer and a service gone each offer three ways on, never post anyway", () => {
  const thursday = intent({ day: "2026-11-19" });
  const late = reasonStands(asked({ intent: thursday, goodUntil: goodUntilOf(thursday, ZONE), moment: "send" }));
  assert.equal(late.code, "late");
  assert.equal(late.words, CHECK_WORDS.late("Thursday"));
  const offer = intent({ offer: { says: "20% off", until: null } });
  const ended = reasonStands(asked({ intent: offer, moment: "send" }));
  assert.equal(ended.words, CHECK_WORDS.offerEnded("20% off"));
  assert.match(ended.words, /Leave it out, change the words, or tell AI/);
  assert.doesNotMatch(ended.words, /anyway/i);
  assert.equal(
    reasonStands(asked({ intent: offer, notes: ["Winter deal 20% off every colour"], moment: "send" })),
    null,
  );
  // A last day passed ends it, whatever the note still says.
  assert.equal(
    reasonStands(asked({ intent: intent({ offer: { says: "20% off", until: "2026-11-20" } }), notes: ["20% off"] }))
      .code,
    "reason_passed",
  );
  // The owner's own word, kept until its day ends, stands for it.
  assert.equal(
    reasonStands(asked({ intent: offer, facts: [{ says: "20% off still runs", until: "2026-11-24" }] })),
    null,
  );
  const service = intent({ service: "Balayage" });
  assert.equal(reasonStands(asked({ intent: service, services: ["balayage", "Cut"] })), null);
  assert.equal(reasonStands(asked({ intent: service, services: ["Cut"] })).words, CHECK_WORDS.serviceGone("Balayage"));
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
    rights: { takenBack: true },
    publishing: place({ connection: "not_connected" }),
    automation: { stopped: true, pressedBy: "owner" },
    reason: asked({ words: "Thursday has 3 open chairs" }),
  });
  assert.equal(verdict.ok, false);
  assert.deepEqual(
    verdict.refusals.map((r) => r.check),
    ["rights", "publishing", "automation", "reason"],
  );
  assert.equal(
    verdictWords(verdict),
    [
      CHECK_WORDS.takenBack,
      CHECK_WORDS.notConnected("instagram"),
      CHECK_WORDS.stopped,
      CHECK_WORDS.needsDay("Thursday"),
    ].join(" "),
  );
});
