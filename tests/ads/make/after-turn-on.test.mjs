/**
 * After Turn on, on the Ads page and in an ad's drawer (the Ads plan's 4.5 and 4.7; decision 0050, calls 6 and 9): an
 * ad made here as the page's model says it (surfaces/campaigns/ads/live/model.ts), from the badge worked out once
 * (contracts adStateOfRow) and the turn-back-on rule (adResumeRule).
 *
 * What must hold. Setting up, Couldn't finish with what was left, Couldn't confirm it's on with Check, In review, On
 * and Meta turned it down are each said in a word and a line, never a system's word. An ad made here reads as made
 * here, with this app's own presses, never "Made in Meta Ads Manager". Its drawer says where it shows. Paused, it turns
 * back on here with the most it can cost named; while AI is stopped it does not. While it is set up its owner may cancel
 * it (00676). Paused by a remediation of its picture, it is never turned back on, here or in Meta's door. On while
 * AI can't answer the people it brings, it needs its owner, says why, and AI's line is its Pause.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { liveModel, sheetModel } = await import(at("apps/dashboard/src/surfaces/campaigns/ads/live/model.ts"));
const { LIVE, SHEET } = await import(at("apps/dashboard/src/surfaces/campaigns/ads/live/words.ts"));
const { adLeftOn, adResumeRule, adStateOfRow } = await import(at("packages/contracts/src/ads/live.ts"));
const { AD_WAY_IN_SAID, adWayInRowOf } = await import(at("packages/contracts/src/ads/way-in.ts"));

const SAID = { timezone: "America/New_York" };
const NOW = Date.parse("2026-11-21T15:00:00Z");

/** An ad made here, as the page's read answers it. */
const ad = (over = {}) => ({
  id: "first",
  name: "First visit",
  made_in_platform: false,
  shown_on: ["facebook"],
  launch: { stopped: null, said: null, left: [], sending: false, cancelling: false },
  opens: "whatsapp",
  state: "on",
  needs: null,
  issue: null,
  ends_at: "2026-12-04T04:59:00Z",
  budget: { kind: "total", minor: 7500, left_minor: 6200, shared: false },
  pending: null,
  version: 2,
  paused_by: null,
  way_in: null,
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
    ready: true,
  },
  window: { from: "2026-10-23", to: "2026-11-21" },
  today: "2026-11-21",
  ads,
  unnamed: { people: 0, booked: 0 },
  elsewhere: { people: 0, booked: 0 },
  can_press: true,
  stopped_at: null,
  needs_you: { count: 0, people: [] },
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

test("Setting up: said as it is; its owner may Cancel while Turn on's job makes it, and is told once it is stopping", () => {
  const setting = ad({
    state: "setting-up",
    spend_minor: 0,
    budget: { kind: "total", minor: 7500, left_minor: 7500, shared: false },
    launch: { stopped: null, said: null, left: [], sending: true, cancelling: false },
  });
  assert.deepEqual(
    [rowOf(setting).line, rowOf(setting).tone],
    ["Setting up · Meta checks it before anyone sees it", "plain"],
  );
  const drawer = drawerOf(setting);
  assert.equal(drawer.line, "Setting up · Meta checks it before anyone sees it");
  assert.deepEqual(drawer.foot, {
    kind: "cancel",
    body: "It stops before it runs. What Chanlytics made at Meta is removed, and nothing is spent.",
  });
  // Someone who may not press is told what happens, with nothing to press.
  assert.deepEqual(drawerOf(setting, { can_press: false }).foot, {
    kind: "none",
    line: "Chanlytics is making it at Meta, paused, then checking it against what you approved before turning it on.",
  });
  // Cancelled, and the job not at its next step yet: it says it is stopping, and offers the press no more.
  const stopping = ad({ ...setting, launch: { ...setting.launch, cancelling: true } });
  assert.equal(rowOf(stopping).line, "Cancelling · nothing is turned on");
  assert.deepEqual(drawerOf(stopping).foot, { kind: "none", line: SHEET.cancelling });
  // A switch still being followed is setting up too, but the ad is made: nothing to cancel, Pause is its press then.
  const following = ad({ ...setting, launch: { ...setting.launch, sending: false } });
  assert.equal(drawerOf(following).foot.kind, "none");
  // Once its launch stopped for the cancel, it says why in a word.
  const cancelled = ad({
    state: "couldnt-finish",
    launch: { ...setting.launch, sending: false, stopped: "cancelled" },
  });
  assert.equal(rowOf(cancelled).line, "Couldn't finish · it was cancelled. Nothing was spent");
});

test("paused by a remediation of its picture: never turned back on here, nor sent to Meta to be, and no yes is named", () => {
  const held = ad({ state: "paused", paused_by: "remediation", resume: { ok: false, why: "picture" } });
  assert.deepEqual(drawerOf(held).foot, {
    kind: "held",
    head: "Its picture can't run any more",
    body: "So Chanlytics paused it, and it runs again only with another picture. Make a new ad from + New.",
  });
  const row = {
    origin: "chanlytics",
    intent: "paused",
    platform_state: "CAMPAIGN_PAUSED",
    budget_kind: "total",
    budget_left_minor: 6200,
    budget_shared: false,
    ends_at: "2026-12-04T04:59:00Z",
    paused_by: "remediation",
  };
  assert.deepEqual(adResumeRule(row, NOW), { ok: false, why: "picture" }, "the rule says so wherever it is asked");
  assert.equal(adResumeRule({ ...row, paused_by: "stop" }, NOW).ok, true, "the stop's pause is the owner's to undo");
});

test("on while AI can't answer the people it brings: Needs you, why in the drawer, its Pause, and AI's line is that Pause", () => {
  const facts = {
    platform: "meta",
    status: "made",
    intent: "on",
    platform_state: "ACTIVE",
    ends_at: "2026-12-04T04:59:00Z",
    budget_kind: "total",
    budget_minor: 7500,
    budget_left_minor: 6200,
    launch: null,
  };
  const at = { nowMs: NOW, timezone: "America/New_York" };
  assert.equal(adStateOfRow({ ...facts, way_in: null }, at), "on");
  assert.equal(adStateOfRow({ ...facts, way_in: "blocked", way_in_at: "2026-11-21T14:59:00Z" }, at), "needs-you");
  // Meta's word not known: one read that could not tell is nothing yet; an hour of it is.
  assert.equal(adStateOfRow({ ...facts, way_in: "unread", way_in_at: "2026-11-21T14:30:00Z" }, at), "on");
  assert.equal(adStateOfRow({ ...facts, way_in: "unread", way_in_at: "2026-11-21T13:59:00Z" }, at), "needs-you");
  assert.equal(
    adStateOfRow(
      { ...facts, intent: "paused", platform_state: "CAMPAIGN_PAUSED", way_in: "blocked", way_in_at: "x" },
      at,
    ),
    "paused",
    "a paused ad spends nothing: it needs no one",
  );

  const closed = ad({ state: "needs-you", needs: "way_in", way_in: "blocked" });
  assert.equal(rowOf(closed).line, LIVE.needs.way_in);
  assert.deepEqual(drawerOf(closed).foot, {
    kind: "pause",
    body: `${AD_WAY_IN_SAID.blocked} Pause it, and Meta stops charging while nobody answers.`,
  });
  const vm = liveModel(page([closed]), { ...SAID, nowMs: NOW });
  assert.deepEqual(vm.ai, {
    kind: "way_in",
    text: "First visit is on, and AI can't answer the people it brings. Pause it?",
    ad: { id: "first", version: 2 },
  });
  assert.equal(liveModel(page([closed], { can_press: false }), { ...SAID, nowMs: NOW }).ai?.kind ?? null, null);

  // The bell's row, in the read's words: what it can still spend, in the account's own money.
  assert.deepEqual(adWayInRowOf({ name: "First visit", wayIn: "blocked", leftMinor: 6420, currency: "USD" }), {
    title: "“First visit” is on, and AI can't answer it",
    body: `${AD_WAY_IN_SAID.blocked} It can still spend $64.20 of its total. Pause it, or open it to see what to mend.`,
  });
  assert.match(
    adWayInRowOf({ name: "A", wayIn: "unread", leftMinor: null, currency: "USD" }).body,
    /Meta charges while/,
  );
  assert.match(adWayInRowOf({ name: "A", wayIn: "paused", leftMinor: 7000, currency: "USD" }).body, /spend \$70 of/);
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
