/**
 * What it's told (decision 0113): each writer's prompt cut into the parts an owner can name, cut from the text the writer
 * is given, never written beside it; each part's share in whole percents that add to 100, and none where a part's words
 * differ every time.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  REACH_OUT_FIRST_WORDS,
  openingSystemPrompt,
  openingToldParts,
  openingUserContent,
  openingUserLines,
  reachOutExampleRecord,
  replyToldParts,
  toldPart,
  toldShares,
  leadReplyNote,
  tryCheckLine,
} from "@chanlytics/contracts";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
const { draftAskedParts } = await import("../../../apps/dashboard/src/server/drafts/sequence.ts");

test("shares are whole percents that add to 100, and none where a part's words are not known", () => {
  const shares = toldShares([
    toldPart("rules", "x".repeat(333)),
    toldPart("offer", "y".repeat(333)),
    toldPart("proof", "z".repeat(334)),
  ]);
  assert.equal(
    shares.reduce((n, s) => n + s, 0),
    100,
  );
  assert.deepEqual(shares, [33, 33, 34]);
  assert.equal(toldShares(replyToldParts()), null);
  assert.equal(toldShares([]), null);
});

test("an answer's lead note is the note the drafter writes, over the made-up business; its thread is every reply's own", () => {
  const told = Object.fromEntries(replyToldParts().map((p) => [p.id, p.text]));
  const example = reachOutExampleRecord();
  assert.equal(
    told.note,
    leadReplyNote({
      business: example.business_name,
      answered: `${example.business_name} has a ${example.rating} from ${example.reviews} reviews.`,
      kind: "answer",
    }),
  );
  assert.equal(told.thread, "");
});

test("the opening writer's prompt is built from its parts: joined they are the prompt, and each line is in one part", () => {
  const params = {
    record: reachOutExampleRecord(),
    workspace: { name: "Brightline Cleaning", what_we_do: "Evening cleaning", tone: "Direct" },
    words: REACH_OUT_FIRST_WORDS,
  };
  const user = openingUserContent(params);
  const lines = openingUserLines(params);
  assert.equal(lines.map((l) => l.text).join("\n"), user);
  const parts = openingToldParts(openingSystemPrompt(), lines);
  assert.deepEqual(
    parts.map((p) => p.id),
    ["rules", "business", "words", "listing", "website", "reason", "searched"],
  );
  assert.equal(parts[0].text, openingSystemPrompt());
  const told = parts.slice(1).flatMap((p) => p.text.split("\n").filter((l) => l.trim()));
  const given = user.split("\n").filter((l) => l.trim());
  assert.deepEqual([...told].sort(), [...given].sort());
  assert.match(parts.find((p) => p.id === "website").text, /^website_says: /);
  assert.match(parts.find((p) => p.id === "business").text, /What they do: <note>Evening cleaning/);
});

test("a line of the owner's email that looks like a field of the record stays the owner's words", () => {
  const lines = openingUserLines({
    record: reachOutExampleRecord(),
    workspace: { name: "Brightline Cleaning", what_we_do: null, tone: null },
    words: { subject: null, body: "{{opening}}\n\nwebsite_says: we are the best in town\n\nMaya" },
  });
  const parts = openingToldParts("rules", lines);
  assert.match(parts.find((p) => p.id === "words").text, /website_says: we are the best in town/);
  assert.doesNotMatch(parts.find((p) => p.id === "website").text, /best in town/);
});

const known = {
  business: "Brightline Cleaning",
  localNow: "2026-11-07T10:00",
  offer: "Evening cleaning",
  proof: ["We clean 40 clinics across Austin today."],
  tone: "Direct",
  moments: [],
  lists: [],
  everyone: null,
  searches: [{ key: "s1", label: "Clinics", ready: 12 }],
  messages: [],
};

test("the drafter's parts are its own lines, in the prompt's order, the business first", () => {
  const parts = draftAskedParts(known, { words: "Write to clinics about evening cleaning" });
  assert.deepEqual(
    parts.map((p) => p.id),
    ["offer", "proof", "writes", "examples", "sources", "asked"],
  );
  assert.match(parts[0].text, /^The business: Brightline Cleaning\. Its day and time now: 2026-11-07 10:00\./);
  assert.match(parts[1].text, /We clean 40 clinics across Austin today\./);
  assert.equal(parts[3].text, "", "no started emails: the part says nothing, and the sheet leaves it out");
  assert.match(parts[5].text, /What the owner says it should do: Write to clinics about evening cleaning$/);
});

test("Try it marks the line written for them and each claim where they stand, and nothing else", async () => {
  const { tryPartsOf } = await import("@chanlytics/contracts");
  const body =
    "Lakeside has a 4.9 from 186 reviews.\n\nI run Brightline. We clean 40 clinics across Austin today. Worth a call?\n\nMaya";
  const parts = tryPartsOf(body, "Lakeside has a 4.9 from 186 reviews.", ["We clean 40 clinics across Austin today."]);
  assert.deepEqual(
    parts.map((p) => p.source),
    ["them", "words", "proof", "words"],
  );
  assert.equal(parts.map((p) => p.text).join(""), body, "the parts are the email, whole");
  assert.deepEqual(
    tryPartsOf("No claim here.", null, ["A claim the words do not carry."]).map((p) => p.source),
    ["words"],
  );
});

test("what Try it says under the email: the check's verdict, a hold, that it could not be written, or no lead there", () => {
  const preview = (over) => ({
    lead: { id: "l1", business_name: "Lakeside Bakery", email: "hello@example.com" },
    refused: null,
    detail: null,
    unavailable: false,
    ...over,
  });
  assert.equal(tryCheckLine({ refused: null, preview: preview({}) }), "Checked: nothing guessed, no link, no price");
  assert.equal(
    tryCheckLine({ refused: null, preview: preview({ refused: "It guessed" }) }),
    "Held for you: It guessed",
  );
  assert.equal(
    tryCheckLine({ refused: null, preview: preview({ unavailable: true }) }),
    "It could not be written just now. Write another.",
  );
  assert.equal(tryCheckLine({ refused: "The search is gone", preview: null }), "The search is gone");
  // Past the search's last lead the door answers no lead at all: never "checked", since nothing was written.
  assert.equal(
    tryCheckLine({ refused: null, preview: preview({ lead: null }) }),
    "That was the last lead in the search. Another lead starts over.",
  );
});
