/**
 * The Ads page once an account is connected (the Ads plan's 4.4, 4.5, 4.8 and 4.9; decision 0049, calls 3, 5 and 7):
 * the page's model (apps/dashboard/src/surfaces/campaigns/ads/live/model.ts) and the one rule that says whether an ad
 * made in Meta may be turned back on from here (contracts adResumeRule, the plan's C1), each run on reads as the
 * server answers them.
 *
 * What must hold. The head counts every person an ad brought, the ones from an ad Chanlytics cannot name among them,
 * so the page's total is Reports › People's "An ad". The cost for each person who booked is said from five booked and
 * "so far" while Meta's days still move, over the ads whose people Chanlytics counts. An ad that opens a website
 * shows what Meta spent and says its people are not counted. An ad made in Meta says so. Signed out and after a
 * disconnect, the page says what each ad was doing when last read, and never that it is running. And the drawer
 * offers Pause on any ad, turning back on only with a total, an end date and the budget to itself, as a question that
 * names the most it can cost.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { liveModel, sheetModel } = await import(at("apps/dashboard/src/surfaces/campaigns/ads/live/model.ts"));
const { firstReadOf } = await import(at("apps/dashboard/src/surfaces/campaigns/ads/live/ai-line.ts"));
const { lensModel } = await import(at("apps/dashboard/src/surfaces/campaigns/ads/live/lens-model.ts"));
const { AD_FIND_FROM, adFilterChoicesOf, adFilterOf, adGroupsOf } = await import(
  at("apps/dashboard/src/surfaces/campaigns/ads/live/ad-list.ts")
);
const { adLeftOn, adResumeRule, adStateOfRow } = await import(at("packages/contracts/src/ads/live.ts"));

const SAID = { timezone: "America/New_York", nowMs: Date.parse("2026-11-18T19:10:00Z") };
const NOW = Date.parse("2026-11-18T19:10:00Z");

const ad = (id, over = {}) => ({
  id,
  name: `Ad ${id}`,
  made_in_platform: true,
  shown_on: ["facebook", "instagram"],
  launch: null,
  opens: "whatsapp",
  state: "on",
  needs: null,
  issue: null,
  ends_at: "2026-12-08T22:00:00Z",
  budget: { kind: "total", minor: 72000, left_minor: 30800, shared: false },
  pending: null,
  version: 3,
  resume: { ok: false, why: "not_paused" },
  people: 0,
  booked: 0,
  spend_minor: 0,
  settling: false,
  theirs: { impressions: 0, clicks: 0, results: null },
  ...over,
});
const page = (over = {}) => ({
  account: {
    status: "connected",
    name: "Harbor ads",
    currency: "USD",
    timezone: "America/New_York",
    read_at: "2026-11-18T19:00:00Z",
    read_failed: false,
    revoked_at: null,
    disconnected_at: null,
    ready: true,
  },
  window: { from: "2026-10-20", to: "2026-11-18" },
  today: "2026-11-18",
  ads: [],
  unnamed: { people: 0, booked: 0 },
  elsewhere: { people: 0, booked: 0 },
  can_press: true,
  stopped_at: null,
  needs_you: { count: 0, people: [] },
  ...over,
});

const RUNNING = page({
  ads: [
    ad("spring", {
      name: "Spring offer",
      made_in_platform: false,
      people: 100,
      booked: 23,
      spend_minor: 41400,
      settling: true,
      theirs: { impressions: 9000, clicks: 300, results: 120 },
    }),
    ad("weekend", {
      name: "Weekend offer",
      made_in_platform: false,
      state: "review",
      people: 9,
      booked: 2,
      spend_minor: 0,
    }),
    ad("boosted", { name: "Old boosted post", state: "paused", people: 2, booked: 0, spend_minor: 35700 }),
    ad("autumn", { name: "Autumn offer", opens: "website", people: 0, spend_minor: 9600 }),
  ],
  unnamed: { people: 3, booked: 1 },
});

test("an ad is left on where it runs, or where Meta still checks it with its own switch on: read from its row", () => {
  const at = { nowMs: NOW, timezone: "America/New_York" };
  const row = (over = {}) => ({
    platform: "meta",
    status: "made",
    intent: "on",
    platform_state: "ACTIVE",
    ends_at: null,
    budget_kind: null,
    budget_minor: null,
    budget_left_minor: null,
    ...over,
  });
  const leftOn = (over) => adLeftOn(adStateOfRow(row(over), at));
  assert.deepEqual([adStateOfRow(row(), at), leftOn()], ["on", true]);
  for (const word of ["PENDING_REVIEW", "IN_PROCESS", "PREAPPROVED"])
    assert.deepEqual(
      [adStateOfRow(row({ platform_state: word }), at), leftOn({ platform_state: word })],
      ["review", true],
    );
  // Its own switch off while Meta checks it: it starts nothing once approved.
  assert.equal(leftOn({ platform_state: "PENDING_REVIEW", intent: "paused" }), false);
  // Paused, refused, removed: not on. Nor is one whose last day has passed, or whose total is spent, whatever Meta's word.
  for (const word of ["PAUSED", "ADSET_PAUSED", "CAMPAIGN_PAUSED", "DISAPPROVED", "ARCHIVED"])
    assert.equal(leftOn({ platform_state: word }), false, word);
  assert.equal(leftOn({ ends_at: "2026-11-01T22:00:00Z" }), false);
  assert.equal(leftOn({ budget_kind: "total", budget_minor: 5000, budget_left_minor: 0 }), false);
});

test("after a disconnect, and while signed out, an ad Meta was checking is said as that, and named as left on", () => {
  const checking = ad("weekend", { name: "Weekend offer", state: "review" });
  const running = ad("spring", { name: "Spring offer" });
  const left = (ads) =>
    page({ ads, account: { ...page().account, status: "disconnected", disconnected_at: "2026-11-18T15:00:00Z" } });
  const alone = liveModel(left([checking]), SAID);
  assert.equal(alone.rows[0].line, "Left in Meta · Meta was checking it");
  assert.equal(alone.notice.title, "Meta was checking Weekend offer when you disconnected");
  assert.match(
    alone.notice.body,
    /If Meta approves it, it runs and Meta charges\. It can only be paused in Meta now\.$/,
  );
  const both = liveModel(left([running, checking]), SAID);
  assert.equal(both.notice.title, "Spring offer and Weekend offer were left on when you disconnected");
  assert.match(both.notice.body, /one it was checking starts when Meta approves it/);
  // Only running ones: as it was said before.
  assert.match(liveModel(left([running]), SAID).notice.title, /^Spring offer was on when you disconnected$/);
  // Signed out: the row says what the ad was doing when last read, never that it was paused.
  const out = page({
    ads: [checking],
    account: { ...page().account, status: "revoked", revoked_at: "2026-11-18T15:00:00Z" },
  });
  assert.match(liveModel(out, SAID).rows[0].line, /^Meta was checking it · Updated /);
});

test("people from an ad of an ad account connected before are counted, on a line of their own, and never listed", () => {
  const before = { people: 4, booked: 2 };
  const vm = liveModel({ ...RUNNING, elsewhere: before }, SAID);
  assert.deepEqual(vm.head, { strong: "28 of 118", rest: " new people from your ads have booked." });
  assert.equal(vm.rows.length, liveModel(RUNNING, SAID).rows.length, "no row is drawn for an ad that is not here");
  assert.equal(
    vm.notes.at(-1),
    "4 people came from an ad in an ad account you connected before this one, and 2 of them have booked.",
  );
  // Its money may be in another currency: none of it is in what was spent.
  assert.equal(vm.line, liveModel(RUNNING, SAID).line);
  // Reports' table gives them a row, counted, with no spend beside them, and does not say them twice.
  const lens = lensModel({ ...RUNNING, elsewhere: before }, SAID);
  assert.deepEqual(lens.rows.at(-1), {
    id: "elsewhere",
    name: "Ads in an ad account you connected before this one",
    came: "4",
    booked: "2",
    each: "—",
    spent: "—",
  });
  assert.equal(lens.figures[0].value, "118");
  assert.ok(!lens.notes.some((note) => note.includes("connected before")));
});

test("the head counts everyone an ad brought, the unnamed among them, and says what Meta charged", () => {
  const vm = liveModel(RUNNING, SAID);
  assert.deepEqual(vm.head, { strong: "26 of 114", rest: " new people from your ads have booked." });
  // Spent is every ad's; the cost is the counted ads' spend over the people who booked from them: (414 + 0 + 357) / 25.
  assert.equal(vm.line, "Paid · $867 spent in the last 30 days · $31 for each person who booked so far");
  const named = RUNNING.ads.reduce((sum, one) => sum + one.people, 0);
  assert.equal(named + RUNNING.unnamed.people, 114, "the ads' people and the unnamed line are the head's total");
  assert.deepEqual(vm.notes, [
    "3 people came from an ad you run in Meta that Chanlytics can't name yet, and 1 of them has booked.",
  ]);
  assert.deepEqual([vm.notice, vm.stale, vm.again], [null, null, null]);
});

test("each row says where the ad stands and what it brought, and an uncounted one what Meta spent", () => {
  const { rows } = liveModel(RUNNING, SAID);
  // In the list's order: what runs (or is on its way to), what spent most first; then what is paused.
  assert.deepEqual(
    rows.map((row) => [row.name, row.line, row.badge, row.endTop, row.endSub]),
    [
      ["Spring offer", "On · ends Tue 8 Dec · $308 left", null, "23 booked", "$18 each"],
      ["Autumn offer", "On · ends Tue 8 Dec · $308 left", null, "$96 spent", null],
      ["Weekend offer", "Meta is checking it, usually within a day", "In review", "2 booked", null],
      ["Old boosted post", "Paused · ends Tue 8 Dec · $308 left", null, "0 booked", null],
    ],
  );
  assert.deepEqual(
    rows.map((row) => [row.tone, row.group]),
    [
      ["ok", "on"],
      ["ok", "on"],
      ["plain", "on"],
      ["plain", "paused"],
    ],
  );
  assert.equal(rows[0].open, "campaigns/ads:ad:spring", "a row opens its drawer by Chanlytics' own id");
});

test("the cost for each person who booked waits for five, and says so far only while Meta's days still move", () => {
  const few = page({ ads: [ad("a", { people: 12, booked: 4, spend_minor: 9000 })] });
  assert.equal(liveModel(few, SAID).line, "Paid · $90 spent in the last 30 days", "under five booked no cost is said");
  const five = page({ ads: [ad("a", { people: 12, booked: 5, spend_minor: 9000 })] });
  assert.equal(liveModel(five, SAID).line, "Paid · $90 spent in the last 30 days · $18 for each person who booked");
  const moving = page({ ads: [ad("a", { people: 12, booked: 5, spend_minor: 9000, settling: true })] });
  assert.equal(
    liveModel(moving, SAID).line,
    "Paid · $90 spent in the last 30 days · $18 for each person who booked so far",
  );
  // A website ad's spend is in Spent, and out of the cost of a person: its people are nobody Chanlytics counted.
  const mixed = page({
    ads: [ad("a", { people: 12, booked: 5, spend_minor: 9000 }), ad("w", { opens: "website", spend_minor: 5000 })],
  });
  assert.equal(liveModel(mixed, SAID).line, "Paid · $140 spent in the last 30 days · $18 for each person who booked");
});

test("before anyone has written from an ad the page says how many ads there are, and who is charged", () => {
  const ready = page({ ads: [ad("a", { name: "Spring colour offer" }), ad("b", { state: "paused" })] });
  const vm = liveModel(ready, SAID);
  assert.deepEqual(vm.head, { strong: "2 ads", rest: " are in your Meta account." });
  assert.equal(vm.line, "Paid · Meta charges your card, never Chanlytics");
  assert.deepEqual(
    vm.rows.map((row) => row.line),
    ["On · ends Tue 8 Dec · $308 left", "Paused · ends Tue 8 Dec · $308 left"],
  );
  assert.deepEqual(liveModel(page(), SAID).head, { strong: null, rest: "Meta shows no ads in this ad account yet." });
  // Before its first read nothing is known of an account's ads, so the page never says Meta shows none: it says it is
  // reading, and where that first read failed, that the clock asks again. Reports' lens says the same head.
  const unread = (failed) => page({ account: { ...page().account, read_at: null, read_failed: failed } });
  assert.deepEqual(liveModel(unread(false), SAID).head, { strong: null, rest: "Reading your ads from Meta…" });
  assert.equal(lensModel(unread(false), SAID).head, "Reading your ads from Meta…");
  assert.deepEqual(liveModel(unread(true), SAID).head, {
    strong: null,
    rest: "Couldn't read your ads from Meta yet. Chanlytics tries again by itself.",
  });
  assert.deepEqual(
    [unread(false), unread(true), page()].map((one) => firstReadOf(one.account)),
    ["reading", "failed", null],
  );
  // People an ad brought are counted by Chanlytics, not read from Meta: they are said before the first read too.
  const counted = page({ account: unread(false).account, unnamed: { people: 3, booked: 1 } });
  assert.deepEqual(liveModel(counted, SAID).head, { strong: "1 of 3", rest: " new people from your ads have booked." });
  // A run that is over stays listed only while it has numbers to show.
  const old = page({
    ads: [ad("a"), ad("done", { state: "ended" }), ad("spent", { state: "finished", spend_minor: 100 })],
  });
  assert.deepEqual(
    liveModel(old, SAID).rows.map((row) => row.id),
    ["a", "spent"],
  );
});

test("an ad that needs its owner says why in a word, and one a press is on its way for says that", () => {
  const needing = page({
    ads: [
      ad("r", { state: "needs-you", needs: "refused" }),
      ad("u", { state: "needs-you", needs: "unpaid" }),
      ad("p", { state: "needs-you", needs: "paused_at_platform" }),
      ad("x", { state: "on", pending: "pausing" }),
      ad("y", { state: "paused", pending: "resuming" }),
    ],
  });
  const { rows } = liveModel(needing, SAID);
  assert.deepEqual(
    rows.map((row) => [row.line, row.tone]),
    [
      ["Not approved by Meta", "warn"],
      ["Meta couldn't charge your card", "warn"],
      ["Paused in Meta", "warn"],
      ["Pausing…", "ok"],
      ["Turning it back on…", "plain"],
    ],
  );
});

test("signed out: the page says when, which ad was on, and what each ad was doing when last read", () => {
  const out = page({
    account: {
      ...page().account,
      status: "revoked",
      revoked_at: "2026-11-14T15:00:00Z",
      read_at: "2026-11-14T14:00:00Z",
    },
    ads: [
      ad("s", { name: "Spring colour offer", people: 31, booked: 9, spend_minor: 21200 }),
      ad("o", { name: "Old boosted post", state: "paused" }),
    ],
    can_press: false,
  });
  const vm = liveModel(out, SAID);
  assert.deepEqual(vm.notice, {
    title: "Meta signed Chanlytics out on Sat 14 Nov.",
    body: "Spring colour offer was on then, and Meta charges while it runs. Chanlytics can't read or pause it until you connect again.",
    door: null,
  });
  assert.equal(vm.line, "Paid · $212 spent in the last 30 days · Updated Sat 14 Nov");
  assert.deepEqual(
    vm.rows.map((row) => [row.line, row.tone]),
    [
      ["Was on · Updated Sat 14 Nov", "plain"],
      ["Was paused · Updated Sat 14 Nov", "plain"],
    ],
    "never On: nobody has read it since",
  );
  assert.deepEqual(vm.notes, [], "nothing can be paused here while signed out");
  assert.equal(sheetModel(out, "s", SAID).foot.kind, "none");
});

test("after a disconnect an ad left running is said at the top, with Meta as the only place to stop it", () => {
  const left = page({
    account: { ...page().account, status: "disconnected", disconnected_at: "2026-11-18T17:00:00Z" },
    ads: [
      ad("s", { name: "Spring colour offer", people: 31, booked: 9, spend_minor: 21200 }),
      ad("o", { state: "paused" }),
    ],
    can_press: false,
  });
  const vm = liveModel(left, SAID);
  assert.deepEqual(vm.notice, {
    title: "Spring colour offer was on when you disconnected",
    body: "That was today. Meta charges while it runs. It can only be paused in Meta now.",
    door: "Open Meta",
  });
  assert.deepEqual(
    vm.rows.map((row) => row.line),
    ["Left in Meta · was on today", "Left in Meta · was paused"],
  );
  assert.equal(vm.again, "Connect to read and pause them here again.");
  // With nothing left running there is nothing to warn of.
  const quiet = { ...left, ads: [ad("o", { state: "paused" })] };
  assert.equal(liveModel(quiet, SAID).notice, null);
});

test("a read that failed keeps the last numbers and says so, quietly", () => {
  const failed = page({ account: { ...page().account, read_failed: true }, ads: [ad("a")] });
  assert.equal(liveModel(failed, SAID).stale, "Couldn't update · Updated 2:00 PM. Chanlytics tries again by itself.");
});

/* ------------------------------------------------------------------ the rule */

const facts = (over = {}) => ({
  origin: "platform",
  platform_state: "PAUSED",
  budget_kind: "total",
  budget_left_minor: 18000,
  budget_shared: false,
  ends_at: "2026-11-30T23:00:00Z",
  ...over,
});

test("an ad made in Meta turns back on from here only with a total, an end date and the budget to itself", () => {
  assert.deepEqual(adResumeRule(facts(), NOW), { ok: true, left_minor: 18000, ends_at: "2026-11-30T23:00:00Z" });
  const why = (over) => adResumeRule(facts(over), NOW);
  assert.deepEqual(why({ budget_kind: "daily" }), { ok: false, why: "no_total" });
  assert.deepEqual(why({ budget_kind: null }), { ok: false, why: "no_total" });
  assert.deepEqual(why({ ends_at: null }), { ok: false, why: "no_end" });
  assert.deepEqual(why({ budget_shared: true }), { ok: false, why: "shared" });
  assert.deepEqual(
    why({ budget_shared: null }),
    { ok: false, why: "shared" },
    "not known to be its own is not its own",
  );
  assert.deepEqual(why({ ends_at: "2026-11-18T19:00:00Z" }), { ok: false, why: "ended" });
  assert.deepEqual(why({ budget_left_minor: 0 }), { ok: false, why: "nothing_left" });
  assert.deepEqual(why({ budget_left_minor: null }), { ok: false, why: "nothing_left" });
  // Paused by its ad set or its campaign: turning the ad on here would start nothing.
  assert.deepEqual(why({ platform_state: "ADSET_PAUSED" }), { ok: false, why: "not_paused" });
  assert.deepEqual(why({ platform_state: "ACTIVE" }), { ok: false, why: "not_paused" });
});

/* ---------------------------------------------------------------- the drawer */

test("the drawer of an ad made in Meta: Pause while it runs, and its two halves each labelled as whose it is", () => {
  const vm = sheetModel(RUNNING, "spring", SAID);
  assert.deepEqual(
    [vm.where, vm.name, vm.line],
    ["Shows on Facebook and Instagram · Opens WhatsApp", "Spring offer", "On · ends Tue 8 Dec"],
  );
  // Where it shows is what Meta holds: an ad shown on Facebook alone says so, and one not read yet names Meta alone.
  const only = (shownOn) => sheetModel(page({ ads: [ad("one", { shown_on: shownOn })] }), "one", SAID).where;
  assert.equal(only(["facebook"]), "Shows on Facebook · Opens WhatsApp");
  assert.equal(only(null), "Shows on Meta · Opens WhatsApp");
  // A total is said whole, over its bar: what it spent of it, and its days; Spent is then no figure of its own.
  // Its total less what is left ($720 - $308); no start read yet, so no days are said.
  assert.deepEqual(
    [vm.spent?.said, Math.round((vm.spent?.share ?? 0) * 100), vm.days],
    ["$412 of $720 spent", 57, null],
  );
  assert.deepEqual(vm.ours, [
    { label: "Wrote to AI", value: "100" },
    { label: "Booked", value: "23" },
    { label: "For each who booked", value: "$18 so far" },
  ]);
  assert.deepEqual(vm.theirs, [
    { label: "Times shown", value: "9,000" },
    { label: "Taps", value: "300" },
    { label: "Chats Meta counted", value: "120" },
  ]);
  assert.deepEqual(vm.foot, { kind: "pause", body: "It stops showing. Meta still bills what it already showed." });
  assert.equal(sheetModel(RUNNING, "nobody", SAID), null);

  const website = sheetModel(RUNNING, "autumn", SAID);
  assert.deepEqual(
    [website.counted, website.ours, website.where],
    [false, [], "Shows on Facebook and Instagram · Opens your website"],
  );
});

test("turning one back on is a question that names what is left and until when; without a total it is done in Meta", () => {
  const paused = page({
    ads: [
      ad("old", {
        name: "Old boosted post",
        state: "paused",
        ends_at: "2026-11-30T23:00:00Z",
        budget: { kind: "total", minor: 40000, left_minor: 18000, shared: false },
        resume: { ok: true, left_minor: 18000, ends_at: "2026-11-30T23:00:00Z" },
      }),
      ad("daily", {
        name: "Spring colour offer",
        state: "paused",
        ends_at: null,
        budget: { kind: "daily", minor: 2000, left_minor: null, shared: false },
        resume: { ok: false, why: "no_total" },
      }),
    ],
  });
  const old = sheetModel(paused, "old", SAID);
  assert.equal(old.line, "Paused · it still ends Mon 30 Nov");
  assert.deepEqual(old.foot, {
    kind: "resume",
    ask: "Turn Old boosted post back on?",
    body: "Meta holds a $400 total for this ad and stops at it itself. $180 is left, until Mon 30 Nov.",
    press: "Turn back on · up to $180 left, ends 30 Nov",
  });
  const daily = sheetModel(paused, "daily", SAID);
  assert.equal(daily.line, "Paused · $20 a day, no end date");
  assert.deepEqual(daily.foot, {
    kind: "in-meta",
    head: "No total and no end date",
    body: "So there is no most to name here. This ad is turned back on in Meta, where its amount is set.",
  });
  // Anyone but the owner reads the same drawer, with no press.
  const viewer = sheetModel({ ...paused, can_press: false }, "old", SAID);
  assert.deepEqual(viewer.foot, { kind: "meta", line: "Only the owner can pause an ad or turn one back on." });
});

test("Meta's own words for an ad it will not run are quoted, and one that never ran says nothing was charged", () => {
  const refused = page({
    ads: [
      ad("w", {
        name: "Weekend offer",
        state: "needs-you",
        needs: "refused",
        issue: "Ads can't say or imply things about the person reading them.",
      }),
    ],
  });
  const vm = sheetModel(refused, "w", SAID);
  assert.equal(vm.line, "Not approved by Meta · ends Tue 8 Dec");
  assert.deepEqual(vm.reason, {
    label: "Meta's reason",
    words: "Ads can't say or imply things about the person reading them.",
    note: "It never ran, so Meta charged nothing for it.",
  });
});

/* -------------------------------------------------------------- Reports › Ads */

test("Reports › Ads says the page's own numbers: Chanlytics' count in its columns, Meta's spend in its own", async () => {
  const vm = lensModel(RUNNING, SAID);
  assert.equal(vm.head, "26 of 114 new people from your ads have booked.");
  assert.deepEqual(vm.figures, [
    { label: "New people from your ads", value: "114" },
    { label: "Booked since", value: "26" },
    { label: "For each who booked", value: "$31 so far" },
    { label: "Spent · Meta's number", value: "$867" },
  ]);
  assert.deepEqual(
    vm.rows.map((row) => [row.name, row.came, row.booked, row.each, row.spent]),
    [
      ["Spring offer", "100", "23", "$18", "$414"],
      ["Weekend offer", "9", "2", "only 2", "$0"],
      ["Old boosted post", "2", "0", "—", "$357"],
      ["Autumn offer", "—", "—", "—", "$96"],
      ["An ad you run in Meta that Chanlytics can't name yet", "3", "1", "—", "—"],
    ],
  );
  // The rows' people add up to the figure, the unnamed among them: the lens and the page cannot disagree.
  const came = vm.rows.reduce((sum, row) => sum + (Number(row.came) || 0), 0);
  assert.equal(String(came), vm.figures[0].value);
  assert.match(vm.notes[0], /counted once, for the ad they first wrote from/);
});

test("the page's read lists the connected account's ads and counts the people of an account connected before beside them", async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
  process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
  const kernel = await import(at("apps/dashboard/src/server/shared/reader.ts"));
  const { adsPage } = await import(at("apps/dashboard/src/server/readers/ads-page.ts"));
  const { fakeDb } = await import("../_fake-db.mjs");
  const T = "abababab-7777-4000-8000-000000000001";
  const HERE = "acacacac-7777-4000-8000-000000000001";
  const BEFORE = "acacacac-7777-4000-8000-000000000002";
  const account = (id, over) => ({
    id,
    tenant_id: T,
    platform: "meta",
    name: "Harbor ads",
    currency: "USD",
    timezone: "America/New_York",
    status: "connected",
    config: { scopes: ["ads_read", "ads_management"] },
    read_at: "2026-11-18T19:00:00Z",
    read_error: null,
    revoked_at: null,
    disconnected_at: null,
    ...over,
  });
  const held = (id, accountId, name) => ({
    id,
    tenant_id: T,
    account_id: accountId,
    platform: "meta",
    origin: "platform",
    name,
    door: "whatsapp",
    platform_ad_id: `2385${id.slice(-12)}`,
    status: "made",
    intent: "on",
    platform_state: "ACTIVE",
    platform_issue: null,
    budget_kind: null,
    budget_minor: null,
    budget_left_minor: null,
    budget_shared: null,
    ends_at: null,
    intent_at: null,
    told_at: null,
    version: 1,
    created_at: "2026-11-01T12:00:00Z",
  });
  const mine = held("adadadad-7777-4000-8000-000000000001", HERE, "Spring offer");
  const theirs = held("adadadad-7777-4000-8000-000000000002", BEFORE, "Last year's offer");
  const tables = {
    ad_accounts: [
      account(HERE, {}),
      account(BEFORE, { status: "disconnected", currency: "GBP", disconnected_at: "2026-11-10T12:00:00Z" }),
    ],
    ads: [mine, theirs],
  };
  const counts = {
    from: "2026-10-20",
    to: "2026-11-18",
    ads: [
      { ad_id: mine.id, people: 5, booked: 2 },
      { ad_id: theirs.id, people: 3, booked: 1 },
    ],
    unnamed: { people: 1, booked: 0 },
    spend: [
      { ad_id: mine.id, spend_minor: 1200, impressions: 10, clicks: 1, platform_results: null, settling: false },
      { ad_id: theirs.id, spend_minor: 99900, impressions: 10, clicks: 1, platform_results: null, settling: false },
    ],
  };
  const ctx = {
    supabase: fakeDb(tables, {}, { ads_page_counts: () => counts }),
    userId: "bcbcbcbc-7777-4000-8000-000000000001",
    email: "ada@example.com",
    metadata: {},
  };
  const rc = kernel.readerContext(ctx, { tenantId: T, role: "operator" });
  const { data } = await kernel.load(rc, adsPage, undefined);
  assert.deepEqual(
    data.ads.map((one) => [one.name, one.people, one.booked, one.spend_minor]),
    [["Spring offer", 5, 2, 1200]],
    "the other account's ad is not this page's to list, and its pounds are in no sum of dollars",
  );
  assert.deepEqual(data.elsewhere, { people: 3, booked: 1 });
  assert.deepEqual(data.unnamed, { people: 1, booked: 0 });
  // Everyone the counts hold is on the page: the equation with Reports › People holds whichever account an ad is of.
  const everyone = counts.ads.reduce((sum, one) => sum + one.people, 0) + counts.unnamed.people;
  assert.equal(liveModel(data, SAID).head.strong, `3 of ${everyone}`);
});

test("a post's ad shows its picture, its post, what Meta counted it did and who commented, the people it can name", () => {
  const boost = ad("boost", {
    name: "Boost: first visit",
    opens: "other",
    starts_at: "2026-11-15T15:00:00Z",
    ends_at: "2026-11-18T23:00:00Z",
    budget: { kind: "total", minor: 500, left_minor: 39, shared: false },
    spend_minor: 461,
    theirs: { impressions: 1820, clicks: 6, results: null },
    picture: { url: "https://scontent.example.com/t.jpg", small: true },
    words: "First visit? 20% off your colour.",
    post_url: "https://www.instagram.com/p/example/",
    meta_page: "https://adsmanager.facebook.com/adsmanager/manage/ads?act=1&selected_ad_ids=boost",
    engaged: { plays: 940, engaged: 61, comments: 3 },
    commenters: {
      count: 2,
      people: [
        { id: "p1", name: "Dana Reyes", at: "2026-11-18T17:00:00Z" },
        { id: "p2", name: "@lena.k", at: "2026-11-17T12:00:00Z" },
      ],
    },
  });
  const read = page({ ads: [boost] });
  const [row] = liveModel(read, SAID).rows;
  // Its row: what it spent, and under it who commented, the people it can name.
  assert.deepEqual([row.endTop, row.endSub], ["$4.61 spent", "2 commented"]);
  const vm = sheetModel(read, "boost", SAID);
  // A post's ad opens its post, which is what it shows: it says where alone.
  assert.equal(vm.where, "Shows on Facebook and Instagram");
  assert.deepEqual(vm.seen, {
    picture: "https://scontent.example.com/t.jpg",
    small: true,
    words: "First visit? 20% off your colour.",
  });
  assert.equal(vm.postUrl, "https://www.instagram.com/p/example/");
  assert.equal(vm.metaPage, "https://adsmanager.facebook.com/adsmanager/manage/ads?act=1&selected_ad_ids=boost");
  // Its total whole, over its bar, and its days: it started inside the page's window, so Meta's numbers are all of it.
  assert.deepEqual(
    [vm.spent?.said, vm.days, vm.theirsLabel],
    ["$4.61 of $5 spent", "15 Nov – today", "Meta's numbers"],
  );
  assert.deepEqual(vm.theirs, [
    { label: "Times shown", value: "1,820" },
    { label: "Plays", value: "940" },
    { label: "Engagement", value: "61" },
    { label: "Taps", value: "6" },
  ]);
  assert.deepEqual(vm.commenters, boost.commenters);
  // No one has commented: nothing is said of them.
  const quiet = sheetModel(page({ ads: [{ ...boost, commenters: { count: 0, people: [] } }] }), "boost", SAID);
  assert.equal(quiet.commenters, null);
  // A post's ad with no taps says none it never had; an ad that opens a chat says its taps, none among them.
  const untapped = { ...boost, theirs: { impressions: 195, clicks: 0, results: null } };
  assert.deepEqual(
    sheetModel(page({ ads: [untapped] }), "boost", SAID).theirs.map((figure) => figure.label),
    ["Times shown", "Plays", "Engagement"],
  );
  const chat = { ...untapped, id: "chat", opens: "whatsapp", engaged: undefined };
  assert.ok(sheetModel(page({ ads: [chat] }), "chat", SAID).theirs.some((figure) => figure.label === "Taps"));
});

test("Ads reads as a list: Needs you, On, Paused and Ended under their headings, Ended folded under the rest", () => {
  const spent = (minor) => ({ spend_minor: minor });
  const read = page({
    ads: [
      ad("old-a", { state: "ended", ends_at: "2026-11-01T22:00:00Z", ...spent(5000) }),
      ad("small", { ...spent(1000) }),
      ad("refused", { state: "needs-you", needs: "refused", issue: "x" }),
      ad("big", { ...spent(9000) }),
      ad("old-b", { state: "ended", ends_at: "2026-11-10T22:00:00Z", ...spent(500) }),
      ad("rest", { state: "paused", ...spent(200) }),
    ],
  });
  const { rows } = liveModel(read, SAID);
  // Needs you first; then what runs, what spent most first; then what is paused; then what ended, the latest first.
  assert.deepEqual(
    rows.map((row) => [row.id, row.group]),
    [
      ["refused", "needs"],
      ["big", "on"],
      ["small", "on"],
      ["rest", "paused"],
      ["old-b", "ended"],
      ["old-a", "ended"],
    ],
  );
  const all = adGroupsOf(rows, { filter: "all", about: null });
  assert.deepEqual(
    all.map((group) => [group.label, group.rows.length, group.folds]),
    [
      ["Needs you", 1, false],
      ["On", 2, false],
      ["Paused", 1, false],
      ["Ended", 2, true],
    ],
  );
  // Ended alone is not folded: there is nothing over it to read first.
  const endedOnly = liveModel(page({ ads: [ad("e", { state: "ended", ...spent(461) })] }), SAID).rows;
  assert.deepEqual(
    adGroupsOf(endedOnly, { filter: "all", about: null }).map((group) => [group.key, group.folds]),
    [["ended", false]],
  );
  // The filter: All, then each group that holds an ad, with how many, Needs you amber.
  assert.deepEqual(adFilterChoicesOf(rows), [
    { value: "all", label: "All", count: 6, owed: false },
    { value: "needs", label: "Needs you", count: 1, owed: true },
    { value: "on", label: "On", count: 2, owed: false },
    { value: "paused", label: "Paused", count: 1, owed: false },
    { value: "ended", label: "Ended", count: 2, owed: false },
  ]);
  const ended = adGroupsOf(rows, { filter: "ended", about: null });
  assert.deepEqual(
    ended.map((group) => [group.key, group.rows.length, group.folds]),
    [["ended", 2, false]],
  );
  // A filter whose group holds nothing any more shows all.
  const noNeeds = rows.filter((row) => row.group !== "needs");
  assert.equal(adFilterOf(noNeeds, "needs"), "all");
  assert.equal(adGroupsOf(noNeeds, { filter: "needs", about: null }).length, 3);
});

test("a long list of ads has a find line: an ad is found by its name, in its group, open", () => {
  const many = Array.from({ length: AD_FIND_FROM }, (_, n) =>
    ad(`a${n}`, {
      name: n === 7 ? "Spring colour offer" : `Ad ${n}`,
      state: n < 15 ? "ended" : "on",
      spend_minor: n + 1,
    }),
  );
  // Each spent something: an ended ad with no numbers is not listed.
  const { rows } = liveModel(page({ ads: many }), SAID);
  assert.equal(rows.length, AD_FIND_FROM);
  const found = adGroupsOf(rows, { filter: "all", about: "  spring COLOUR " });
  assert.deepEqual(
    found.map((group) => [group.key, group.rows.map((row) => row.name), group.folds]),
    [["ended", ["Spring colour offer"], false]],
  );
  assert.deepEqual(adGroupsOf(rows, { filter: "all", about: "nobody" }), [], "nothing found: the page says so");
  // Under twenty ads there is no find line, so words kept from before narrow nothing.
  const few = rows.slice(0, AD_FIND_FROM - 1);
  assert.equal(
    adGroupsOf(few, { filter: "all", about: "spring" }).reduce((n, group) => n + group.rows.length, 0),
    few.length,
  );
});

test("the page's figures: what was spent, who booked of who came and what each cost, and who commented on a boost", () => {
  const figures = (read, said = SAID) => liveModel(read, said).figures;
  // Ads, nobody counted: what was spent alone.
  const boost = ad("boost", { opens: "other", spend_minor: 461 });
  assert.deepEqual(figures(page({ ads: [boost] })), [{ label: "Spent · last 30 days", value: "$4.61", meta: null }]);
  // Who commented on an ad that opens no chat, once the comments are kept (00719).
  const commented = { ...boost, commenters: { count: 3, people: [] } };
  assert.deepEqual(figures(page({ ads: [commented] }))[1], { label: "Commented on ads", value: "3" });
  // People counted: who booked of who came, and what each cost from five booked.
  assert.deepEqual(figures(RUNNING), [
    { label: "Spent · last 30 days", value: "$867", meta: null },
    { label: "Booked from ads", value: "26", meta: "of 114" },
    { label: "For each who booked", value: "$31", meta: "so far" },
  ]);
  // No ads: the head's sentence says the state, and no figure stands.
  assert.equal(figures(page()), null);
  // Signed out: what was spent, and the day it was last read.
  const out = page({
    ads: [ad("a", { spend_minor: 21200 })],
    account: {
      ...page().account,
      status: "revoked",
      revoked_at: "2026-11-14T15:00:00Z",
      read_at: "2026-11-14T15:00:00Z",
    },
  });
  assert.deepEqual(figures(out)[0], { label: "Spent · last 30 days", value: "$212", meta: "Updated Sat 14 Nov" });
});
