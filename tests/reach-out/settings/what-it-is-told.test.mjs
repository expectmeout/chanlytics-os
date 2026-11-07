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
  reachOutExampleRecord,
  replyToldParts,
  toldPart,
  toldShares,
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

test("the opening writer's prompt is cut by its own lines' labels, and every line lands in one part", () => {
  const user = openingUserContent({
    record: reachOutExampleRecord(),
    workspace: { name: "Brightline Cleaning", what_we_do: "Evening cleaning", tone: "Direct" },
    words: REACH_OUT_FIRST_WORDS,
  });
  const parts = openingToldParts(openingSystemPrompt(), user);
  assert.deepEqual(
    parts.map((p) => p.id),
    ["rules", "business", "words", "listing", "website", "reason", "searched"],
  );
  assert.equal(parts[0].text, openingSystemPrompt());
  const told = parts.slice(1).flatMap((p) => p.text.split("\n"));
  const given = user.split("\n").filter((l) => l.trim());
  assert.deepEqual([...told].sort(), [...given].sort());
  assert.match(parts.find((p) => p.id === "website").text, /^website_says: /);
  assert.match(parts.find((p) => p.id === "business").text, /What they do: Evening cleaning/);
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
