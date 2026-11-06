/**
 * What the model is told on Campaigns › Ads, and what the Line offers there (6 Nov 2026). Until the Ads read is wired (0049) no tool
 * makes or reads an ad and the page's examples are made up, so the words must say that, and an ad's own Ask press must not send the
 * model to read something that cannot be read. No model runs here: these are the words it would be given.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildAskSuggestions } from "@chanlytics/contracts";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const { turnWords } = await import(pathToFileURL(path.join(ROOT, "apps/dashboard/src/server/ask/prompt.ts")).href);

const facts = {
  role: "owner",
  personLabel: "Ada",
  surface: "campaigns",
  timezone: "America/New_York",
  closures: [],
  now: new Date("2031-03-15T14:05:00Z"),
};

test("on the Ads page the model is told it is a preview and what it may offer, and not to propose sequences for every offer", () => {
  const words = turnWords({ ...facts, onAds: true });
  assert.match(words, /They are on Campaigns › Ads/);
  assert.match(words, /no account can be connected yet, no ad of theirs exists, nothing runs and nothing is spent/);
  assert.match(words, /no tool makes or changes an ad/);
  assert.match(words, /never say one of its ads, numbers or people as theirs/);
  assert.match(words, /a sequence to the people they have, or a post/);
  assert.doesNotMatch(words, /They are on Campaigns, which lists/, "REGRESSION: it was told it was on Sequences");
});

test("what it counts is said as the product counts it: Meta naming the ad, on WhatsApp or Instagram", () => {
  const words = turnWords({ ...facts, onAds: true });
  assert.match(words, /only when Meta names the ad in their first message on WhatsApp or Instagram/);
  assert.match(words, /an ad that rings a phone, or one elsewhere, is not counted/);
});

test("anywhere else on Campaigns the line is Campaigns'", () => {
  const words = turnWords(facts);
  assert.match(words, /They are on Campaigns, which lists/);
  assert.doesNotMatch(words, /Campaigns › Ads/);
});

test("an ad as the scope says it is an example with nothing to read; a row that has a read is still sent to it", () => {
  const scope = { kind: "ad", id: "2d8f4e67-1a93-4c05-b8e2-9a7d3c5f1e08", label: "Spring opening" };
  const words = turnWords({ ...facts, onAds: true, scope });
  assert.match(words, /They are looking at/);
  assert.match(
    words,
    /It is an example on the page, made up, and no ad of theirs, and there is nothing to read about it/,
  );
  assert.doesNotMatch(words, /Read it before answering/, "REGRESSION: it was sent to read an ad, with no read to make");
  const person = turnWords({ ...facts, scope: { kind: "person", id: "p-1", label: "Rosa" } });
  assert.match(person, /Read it before answering about it/);
});

test("the Line's chips on the Ads page are about ads, and a campaign's chips stay on Campaigns", () => {
  const base = { surface: "campaigns", needsYou: 0, heldDrafts: 0, missedToday: 0, liveNow: 0, hasCalendar: false };
  const asks = (over) => buildAskSuggestions({ ...base, language: "en", ...over }).map((s) => s.q);
  const empty = { rows: [] };
  const onAds = asks({ onAds: true, campaigns: empty });
  assert.ok(onAds.includes("How are new people finding me?"));
  assert.ok(onAds.includes("Can I run an ad yet?"));
  assert.ok(!onAds.includes("Set up my campaigns"), "REGRESSION: the Ads page offered to set up campaigns");
  assert.ok(asks({ campaigns: empty }).includes("Set up my campaigns"));
  const spanish = buildAskSuggestions({ ...base, language: "es", onAds: true }).map((s) => s.q);
  assert.ok(spanish.includes("¿Ya puedo poner un anuncio?"));
});
