/**
 * After Turn on, on the Ads page and in an ad's drawer (the Ads plan's 4.5 and 4.7; decision 0050, calls 6 and 9): an
 * ad made here as the page's model says it (surfaces/campaigns/ads/live/model.ts), from the badge worked out once
 * (contracts adStateOfRow) and the turn-back-on rule (adResumeRule).
 *
 * What must hold. Setting up, Couldn't finish with what was left, Couldn't confirm it's on with Check, In review, On
 * and Meta turned it down are each said in a word and a line, never a system's word. An ad made here reads as made
 * here, with this app's own presses, never "Made in Meta Ads Manager". Its drawer says where it shows. Paused, it turns
 * back on here with the most it can cost named; while AI is stopped it does not.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { liveModel, sheetModel } = await import(at("apps/dashboard/src/surfaces/campaigns/ads/live/model.ts"));
const { adLeftOn, adResumeRule, adStateOfRow } = await import(at("packages/contracts/src/ads/live.ts"));

const SAID = { timezone: "America/New_York" };
const NOW = Date.parse("2026-11-21T15:00:00Z");

/** An ad made here, as the page's read answers it. */
const ad = (over = {}) => ({
  id: "first",
  name: "First visit",
  made_in_platform: false,
  shown_on: ["facebook"],
  launch: { stopped: null, said: null, left: [] },
  opens: "whatsapp",
  state: "on",
  needs: null,
  issue: null,
  ends_at: "2026-12-04T04:59:00Z",
  budget: { kind: "total", minor: 7500, left_minor: 6200, shared: false },
  pending: null,
  version: 2,
  resume: { ok: false, why: "not_paused" },
  people: 0,
  booked: 0,
  spend_minor: 1300,
  settling: true,
  theirs: { impressions: 900, clicks: 12, results: 4 },
  ...over,
});
const page = (ads, over = {}) => ({
  account: {
    status: "connected",
    name: "Harbor ads",
    currency: "USD",
    timezone: "America/New_York",
    read_at: "2026-11-21T14:00:00Z",
    read_failed: false,
    revoked_at: null,
    disconnected_at: null,
  },
  window: { from: "2026-10-23", to: "2026-11-21" },
  today: "2026-11-21",
  ads,
  unnamed: { people: 0, booked: 0 },
  elsewhere: { people: 0, booked: 0 },
  can_press: true,
  stopped_at: null,
  ...over,
});
const rowOf = (one, over) => liveModel(page([one], over), SAID).rows[0];
const drawerOf = (one, over) => sheetModel(page([one], over), one.id, SAID);

test("an ad made here reads as made here: where it shows, this app's own press, never Made in Meta Ads Manager", () => {
  const drawer = drawerOf(ad());
  assert.deepEqual([drawer.over, drawer.name, drawer.made], ["Facebook · WhatsApp", "First visit", null]);
  assert.equal(drawer.line, "On · ends Thu 3 Dec · $62 left");
  assert.deepEqual(drawer.foot, { kind: "pause", body: "It stops showing. Meta still bills what it already showed." });
  const row = rowOf(ad());
  assert.equal(row.line, "On · ends Thu 3 Dec · $62 left");
  assert.ok(!row.line.includes("made in Meta"));
  assert.deepEqual(liveModel(page([ad()]), SAID).notes, [], "no note about ads made in Meta: there are none");
});

test("Setting up: said as it is, with nothing to press while Turn on's job has it", () => {
  const setting = ad({
    state: "setting-up",
    spend_minor: 0,
    budget: { kind: "total", minor: 7500, left_minor: 7500, shared: false },
  });
  assert.deepEqual(
    [rowOf(setting).line, rowOf(setting).tone],
    ["Setting up · Meta checks it before anyone sees it", "plain"],
  );
  const drawer = drawerOf(setting);
  assert.equal(drawer.line, "Setting up · Meta checks it before anyone sees it");
  assert.deepEqual(drawer.foot, {
    kind: "none",
    line: "Chanlytics is making it at Meta, paused, then checking it against what you approved before turning it on.",
  });
});

test("Couldn't finish: why in a word, Meta's own reason in quotes, what was left in Meta with Open Meta, nothing spent", () => {
  const stopped = ad({
    state: "couldnt-finish",
    spend_minor: 0,
    launch: {
      stopped: "refused",
      said: "Your ad's words don't follow our Advertising Standards.",
      left: ["campaign", "set"],
    },
  });
  const row = rowOf(stopped);
  assert.deepEqual([row.line, row.tone], ["Couldn't finish · Meta turned it down. Nothing was spent", "warn"]);
  const drawer = drawerOf(stopped);
  assert.deepEqual(drawer.reason, {
    label: "Meta's reason",
    words: "Your ad's words don't follow our Advertising Standards.",
    note: "It never ran, so Meta charged nothing for it.",
  });
  assert.deepEqual(drawer.foot, {
    kind: "left",
    line: "Its campaign and ad set are left in Meta, paused, so nothing runs or is spent. Remove them in Meta.",
  });
  // Removed whole: nothing left there, and nothing to open.
  const removed = drawerOf(ad({ state: "couldnt-finish", launch: { stopped: "differs", said: null, left: [] } }));
  assert.deepEqual(removed.foot, {
    kind: "none",
    line: "Nothing of it was left at Meta, and nothing was spent. Make it again from + New.",
  });
  assert.equal(removed.reason, null);
  assert.equal(
    rowOf(
      ad({ state: "couldnt-finish", launch: { stopped: "disconnected", said: null, left: ["campaign", "set", "ad"] } }),
    ).line,
    "Couldn't finish · the ad account was disconnected. Nothing was spent",
  );
  assert.equal(
    drawerOf(
      ad({ state: "couldnt-finish", launch: { stopped: "ai_stopped", said: null, left: ["campaign", "set", "ad"] } }),
    ).foot.line,
    "Its campaign, ad set and ads are left in Meta, paused, so nothing runs or is spent. Remove them in Meta.",
  );
});

test("Couldn't confirm it's on: said in amber, with Check for the owner, and left on for a disconnect to pause first", () => {
  const unsure = ad({ state: "unconfirmed" });
  assert.deepEqual([rowOf(unsure).line, rowOf(unsure).tone], ["Couldn't confirm it's on · Meta didn't answer", "warn"]);
  assert.deepEqual(drawerOf(unsure).foot, {
    kind: "check",
    line: "Meta didn't answer when Chanlytics turned it on, so it may be on or still paused. Check asks Meta now.",
  });
  assert.deepEqual(drawerOf(unsure, { can_press: false }).foot, {
    kind: "none",
    line: "Only the owner can pause an ad or turn one back on.",
  });
  assert.equal(adLeftOn("unconfirmed"), true, "it may be running: a disconnect pauses it first");
});

test("In review, then On; Meta turned it down says Meta's words: each read from the row once", () => {
  const nowAt = { nowMs: NOW, timezone: "America/New_York" };
  const row = (over = {}) => ({
    platform: "meta",
    origin: "chanlytics",
    status: "made",
    intent: "on",
    platform_state: "PENDING_REVIEW",
    ends_at: "2026-12-04T04:59:00Z",
    budget_kind: "total",
    budget_minor: 7500,
    budget_left_minor: 7500,
    launch: { step: "done" },
    ...over,
  });
  assert.equal(adStateOfRow(row({ status: "sending", launch: { step: "make" } }), nowAt), "setting-up");
  assert.equal(adStateOfRow(row({ status: "failed" }), nowAt), "couldnt-finish");
  assert.equal(adStateOfRow(row(), nowAt), "review");
  assert.equal(adStateOfRow(row({ platform_state: "ACTIVE" }), nowAt), "on");
  assert.equal(adStateOfRow(row({ platform_state: "DISAPPROVED" }), nowAt), "needs-you");
  // Its last switch went unanswered: followed a few minutes, then said; a read since settles it.
  const unanswered = (minutes) =>
    row({ launch: { step: "done", unknown_at: new Date(NOW - minutes * 60_000).toISOString() } });
  assert.equal(adStateOfRow(unanswered(2), nowAt), "setting-up");
  assert.equal(adStateOfRow(unanswered(6), nowAt), "unconfirmed");
  assert.equal(adStateOfRow(row({ launch: { step: "done", unknown_at: null } }), nowAt), "review");
  // Paused here, its campaign paused at Meta: paused, never Needs you.
  assert.equal(adStateOfRow(row({ intent: "paused", platform_state: "CAMPAIGN_PAUSED" }), nowAt), "paused");
  // Turned down: Meta's own words, in quotes, and that it never ran.
  const refused = drawerOf(
    ad({
      state: "needs-you",
      needs: "refused",
      issue: "Your ad's words don't follow our Advertising Standards.",
      spend_minor: 0,
    }),
  );
  assert.equal(refused.reason.words, "Your ad's words don't follow our Advertising Standards.");
});

test("paused here, it turns back on here naming what is left and until when; while AI is stopped it stays paused", () => {
  const facts = (over = {}) => ({
    origin: "chanlytics",
    intent: "paused",
    platform_state: "CAMPAIGN_PAUSED",
    budget_kind: "total",
    budget_left_minor: 6200,
    budget_shared: false,
    ends_at: "2026-12-04T04:59:00Z",
    ...over,
  });
  assert.deepEqual(adResumeRule(facts(), NOW), { ok: true, left_minor: 6200, ends_at: "2026-12-04T04:59:00Z" });
  assert.deepEqual(adResumeRule(facts({ intent: "on" }), NOW), { ok: false, why: "not_paused" });
  assert.deepEqual(adResumeRule(facts({ budget_left_minor: 0 }), NOW), { ok: false, why: "nothing_left" });
  assert.deepEqual(adResumeRule(facts({ ends_at: "2026-11-21T14:00:00Z" }), NOW), { ok: false, why: "ended" });
  const paused = ad({ state: "paused", resume: adResumeRule(facts(), NOW) });
  const drawer = drawerOf(paused);
  assert.equal(drawer.foot.kind, "resume");
  assert.equal(drawer.foot.press, "Turn back on · up to $62 left, ends 3 Dec");
  assert.deepEqual(drawerOf(paused, { stopped_at: "2026-11-21T14:30:00Z" }).foot, {
    kind: "none",
    line: "AI is stopped, so this ad stays paused until AI runs again.",
  });
});
