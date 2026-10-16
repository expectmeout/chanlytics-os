/**
 * The Ads view's foundation (11 Oct 2026): the DTO's addresses, money and rules, the models over every example fixture, the
 * demo store's verbs behind their port, and the gate that keeps Ads out of a real workspace. The models are contracts'
 * (src/ads), the fixtures and the store the dashboard's (surfaces/campaigns/ads); the real code runs.
 *
 *   addresses  campaigns/ads, :ad:<id>, :new[:door], :new:<how>:<id>, :results; a word the view does not know is the page
 *   money      minor units and a currency; whole units from 10, cents under; two currencies are two sums, never converted
 *   examples   ten fixtures of AdsRead, each drawn by the one model; the default's figures tie to its daily rows
 *   verbs      a press carries the version it was drawn from; a stale one, and an ad made elsewhere, are refused; Undo restores
 *   gate       a real workspace's Campaigns chrome has no strip and takes an Ads address as the home
 */
import { test } from "node:test";
import assert from "node:assert/strict";

const ads = await import("@chanlytics/contracts");
const page = await import("@chanlytics/contracts/ads-page");
const { EXAMPLE_READS } = await import("../../../../apps/dashboard/src/surfaces/campaigns/ads/examples.ts");
const { CONFIG, SPRING, NEAR_ME, SATURDAY, OLD_BOOST, connected } =
  await import("../../../../apps/dashboard/src/surfaces/campaigns/ads/sample.ts");
const { makeVerbs } = await import("../../../../apps/dashboard/src/surfaces/campaigns/ads/store.ts");
const { campaignsChrome } = await import("../../../../apps/dashboard/src/surfaces/campaigns/routes.ts");

/** A store over a plain variable, the way a test stands in for the hook's ref. */
function world(read) {
  const w = { read, get: () => w.read, put: (next) => (w.read = next) };
  return w;
}

test("an Ads address says the page, an ad open, the composer on a door or from an ad, or the Results sheet", () => {
  const none = { ad: null, compose: null, results: false };
  assert.deepEqual(ads.parseAds("ads"), none);
  assert.deepEqual(ads.parseAds("ads:ad:abc"), { ...none, ad: "abc" });
  assert.deepEqual(ads.parseAds("ads:new"), { ...none, compose: { door: "whatsapp", from: null } });
  assert.deepEqual(ads.parseAds("ads:new:call"), { ...none, compose: { door: "call", from: null } });
  assert.deepEqual(ads.parseAds("ads:new:copy:abc").compose, { door: "whatsapp", from: { how: "copy", id: "abc" } });
  assert.deepEqual(ads.parseAds("ads:new:again:abc").compose?.from, { how: "again", id: "abc" });
  assert.deepEqual(ads.parseAds("ads:new:google:abc").compose, { door: "call", from: { how: "google", id: "abc" } });
  assert.deepEqual(ads.parseAds("ads:results"), { ...none, results: true });
  // A word the view does not know is the page: a link never lands on nothing.
  for (const odd of ["ads:surprise", "ads:ad:", "ads:new:copy", "ads:new:elsewhere"]) {
    const at = ads.parseAds(odd);
    assert.equal(at.ad, null, odd);
    assert.equal(at.results, false, odd);
  }
  assert.deepEqual(ads.parseAds("ads:new:copy"), { ...none, compose: { door: "whatsapp", from: null } });
  // And each address spells back to the same words.
  assert.equal(ads.adRoute("abc"), "campaigns/ads:ad:abc");
  assert.equal(ads.newAdRoute(), "campaigns/ads:new");
  assert.equal(ads.newAdRoute("form"), "campaigns/ads:new:form");
  assert.equal(ads.newAdFromRoute("again", "abc"), "campaigns/ads:new:again:abc");
  assert.equal(ads.adsResultsRoute(), "campaigns/ads:results");
  assert.equal(ads.parseAds(ads.newAdFromRoute("google", "x").split("/")[1]).compose?.from?.how, "google");
  assert.ok(
    ads.isAdsParam("ads") && ads.isAdsParam("ads:new") && !ads.isAdsParam("adsense") && !ads.isAdsParam("moment:ads"),
  );
});

test("money is minor units in the account's currency: whole from 10, cents under, two currencies side by side", () => {
  assert.equal(page.moneyOf(1400, "USD"), "$14");
  assert.equal(page.moneyOf(72000, "USD"), "$720");
  assert.equal(page.moneyOf(128400, "USD"), "$1,284");
  assert.equal(page.moneyOf(500, "USD"), "$5", "a whole number is whole");
  assert.equal(page.moneyOf(550, "USD"), "$5.50", "cents under 10 where there are some");
  assert.equal(page.moneyOf(23000, "GBP"), "£230");
  assert.equal(page.perDayOf(1500, "USD"), "$15 a day");
  assert.equal(page.leftOfMoney(30800, 72000, "USD"), "$308 left of $720");
  assert.equal(
    page.sumMoney([
      { minor: 41200, currency: "USD" },
      { minor: 28700, currency: "USD" },
    ]),
    "$699",
  );
  assert.equal(
    page.sumMoney([
      { minor: 84700, currency: "USD" },
      { minor: 23000, currency: "GBP" },
      { minor: 100, currency: "USD" },
    ]),
    "$848 + £230",
    "never converted",
  );
  assert.equal(page.currencySymbol("GBP"), "£");
  assert.equal(
    ads.aboutADayAfter({
      ad: EXAMPLE_READS.running().ads[0],
      amountMinor: 90000,
      endDay: "2026-10-31",
      today: "2026-10-11",
    }),
    2300,
  );
});

test("the rules are data: a daily amount's limits per platform, the schedule, and what a door needs", () => {
  assert.deepEqual(page.BUDGET_RULES.tiktok, {
    maxStep: 0.3,
    waitDays: 2,
    totalMaxDays: null,
    dailyIsAverage: false,
    changeRelearns: true,
  });
  assert.equal(page.BUDGET_RULES.google.totalMaxDays, 90);
  assert.deepEqual(page.SCHEDULE_NEEDS_TOTAL, { meta: true, google: false, tiktok: false });
  assert.equal(page.countedDoor("call"), false, "a Google call is Google's count");
  assert.equal(page.countedDoor("form") && page.countedDoor("whatsapp"), true);
  // A connected account lists every check a door asks of it: nothing a door needs is missing from a read.
  for (const [door, byPlatform] of Object.entries(page.DOOR_NEEDS)) {
    for (const [platform, ids] of Object.entries(byPlatform)) {
      const listed = connected(platform).checks.map((c) => c.id);
      for (const id of ids) assert.ok(listed.includes(id), `${door} on ${platform} needs ${id}`);
    }
  }
});

test("every example is an AdsRead the one model draws, and the default's figures tie to its daily rows", () => {
  const modes = {};
  for (const [id, make] of Object.entries(EXAMPLE_READS)) {
    const read = make();
    const vm = page.adsModel(read, CONFIG);
    modes[id] = vm.mode;
    assert.ok(vm.head.rest.length > 0, id);
    assert.equal(vm.standing.length, 3, id);
    for (const ad of read.ads) page.adModel(ad, read, CONFIG);
    page.newAdModel(page.newAdDefaults(read, CONFIG), read, CONFIG);
  }
  assert.deepEqual(Object.keys(modes).sort(), [...page.ADS_EXAMPLES].sort(), "an example for each id the menu lists");
  assert.equal(modes.v0, "v0");
  assert.equal(modes["no-ads"], "none");
  assert.equal(modes.choose, "none");
  assert.equal(modes.running, "ads");

  const read = EXAMPLE_READS.running();
  const vm = page.adsModel(read, CONFIG);
  const sum = (xs) => xs.reduce((a, b) => a + b, 0);
  const inWindow = (ad) => ad.days.filter((d) => d.day >= read.window.from && d.day <= read.window.to);
  const spent = sum(read.ads.flatMap((ad) => inWindow(ad).map((d) => d.spendMinor)));
  assert.equal(vm.figures[0].value, page.moneyOf(spent, "USD"), "Spent is the sum of every ad's daily rows");
  assert.equal(vm.figures[1].value, "114");
  assert.equal(vm.figures[2].value, "26");
  assert.equal(vm.head.strong, "26 of 114");
  assert.match(vm.pane, /^Last 30 days · read 9:19 AM$/);
  assert.ok(
    read.ads.every((ad) => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(ad.id)),
    "ids are uuids",
  );
});

test("an ad's reach line says when the last number arrived from the person who arrived, not from typed text", () => {
  const read = EXAMPLE_READS.running();
  const saturday = read.ads.find((ad) => ad.id === SATURDAY);
  const drawer = page.adModel(saturday, read, CONFIG);
  assert.deepEqual(drawer.reach.parts.at(-1), "last number arrived 9:02 AM today");
  const arrived = read.people.find((p) => p.adId === SATURDAY && p.day === read.today);
  assert.ok(arrived && arrived.at && saturday.todaySoFar === 1, "someone did arrive today, and the bar says one");
  // Without the arrival the line falls back to what the ad stands on.
  const quiet = page.adModel({ ...saturday, lastArrivalAt: null }, read, CONFIG);
  assert.deepEqual(quiet.reach.parts.at(-1), "TikTok account linked");
});

test("a verb carries the version it was drawn from; a stale press and an ad made elsewhere are refused; Undo restores", () => {
  const w = world(EXAMPLE_READS.running());
  const verbs = makeVerbs(w, CONFIG);
  const spring = () => w.read.ads.find((ad) => ad.id === SPRING);
  const v1 = spring().version;
  const paused = verbs.pause(SPRING, v1);
  assert.equal(paused.ok, true);
  assert.equal(spring().state, "paused");
  assert.equal(spring().version, v1 + 1, "every change bumps the version");
  const stale = verbs.resume(SPRING, v1);
  assert.deepEqual(stale, { ok: false, why: page.REFUSED.stale });
  paused.undo();
  assert.equal(spring().state, "on", "Undo puts the ad back");
  assert.ok(spring().version > v1 + 1, "and is a change of its own");
  assert.deepEqual(verbs.pause("nope", 1), { ok: false, why: page.REFUSED.gone });
  // An ad the owner made on the platform itself: only Pause and Resume are here.
  const boost = () => w.read.ads.find((ad) => ad.id === OLD_BOOST);
  assert.equal(boost().madeHere, false);
  assert.deepEqual(verbs.end(OLD_BOOST, boost().version), { ok: false, why: page.REFUSED.adopted });
  assert.deepEqual(verbs.rename(OLD_BOOST, boost().version, "Mine"), { ok: false, why: page.REFUSED.adopted });
  assert.equal(verbs.resume(OLD_BOOST, boost().version).ok, true);
  assert.equal(boost().state, "on");
  // A raise of the total moves what is spent a day with it; a change of the area sends the ad back to be checked.
  const raised = verbs.setBudget(SPRING, spring().version, 90000);
  assert.equal(raised.ok, true);
  assert.equal(spring().budget.amountMinor, 90000);
  assert.equal(spring().aboutADayMinor, 2300, "$488 left over the 21 days to its end");
  const moved = verbs.setArea(SPRING, spring().version, { kind: "radius", miles: 8 });
  assert.equal(moved.ok, true);
  assert.equal(spring().state, "review");
  moved.undo();
  assert.equal(spring().state, "on");
});

test("Turn on is stopped while the account is not ready, and lands a Google ad in review sent to Google", () => {
  const blockedRead = EXAMPLE_READS["no-ads"]();
  const draft = page.newAdDefaults(blockedRead, CONFIG);
  const vm = page.newAdModel(draft, blockedRead, CONFIG);
  assert.ok(vm.blocked, "no payment method blocks Turn on");
  assert.match(vm.blocked.text, /Add a payment method in Meta/);
  assert.equal(vm.blocked.door.to, "admin/integrations");
  assert.equal(vm.needs.find((r) => r.tone === "warn")?.text, "Payment method in Meta");
  const refused = makeVerbs(world(blockedRead), CONFIG).turnOn(draft, vm.totalMinor);
  assert.equal(refused.ok, false);

  const w = world(EXAMPLE_READS.running());
  const verbs = makeVerbs(w, CONFIG);
  const google = {
    ...page.newAdDefaults(w.read, CONFIG),
    door: "call",
    platform: "google",
    mode: "daily",
    presetId: "own",
  };
  const gvm = page.newAdModel(google, w.read, CONFIG);
  assert.equal(gvm.blocked, null);
  assert.deepEqual(verbs.turnOn(google, 1).ok, false, "the maximum it can spend is the owner's to have read");
  const out = verbs.turnOn(google, gvm.totalMinor);
  assert.equal(out.ok, true);
  const landed = w.read.ads.find((ad) => ad.id === out.id);
  assert.equal(landed.state, "review");
  assert.equal(landed.platform, "google");
  const row = page
    .adsModel(w.read, CONFIG)
    .groups.flatMap((g) => g.rows)
    .find((r) => r.id === out.id);
  assert.match(row.hint, /sent to Google today$/, "never a hard-coded Meta");
  out.undo();
  assert.equal(w.read.ads.find((ad) => ad.id === out.id).state, "paused", "Undo pauses it: nothing is spent");
});

test("New ad starts from an ad: a copy keeps its door and platform, Google keeps its offer on the Call door", () => {
  const read = EXAMPLE_READS.running();
  const spring = read.ads.find((ad) => ad.id === SPRING);
  const copy = page.newAdFrom(spring, "copy", read);
  assert.equal(copy.door, "whatsapp");
  assert.equal(copy.platform, "meta");
  assert.equal(copy.serviceId, spring.serviceId);
  const google = page.newAdFrom(spring, "google", read);
  assert.deepEqual([google.door, google.platform, google.serviceId], ["call", "google", spring.serviceId]);
  const near = read.ads.find((ad) => ad.id === NEAR_ME);
  assert.equal(page.newAdFrom(near, "again", read).door, "call");
});

test("a real workspace's Campaigns has no Ads tab, and an Ads address is Sequences'", () => {
  // No window stands here: a real workspace's answer, Sequences with Messages beside it (decision 0060).
  const home = campaignsChrome({ param: null });
  assert.deepEqual(home.crumbs, ["Campaigns"]);
  assert.deepEqual(
    home.views?.tabs.map((t) => t.id),
    ["sequences", "messages"],
    "no Ads tab in a real workspace",
  );
  assert.deepEqual(campaignsChrome({ param: "ads" }), home);
  assert.deepEqual(campaignsChrome({ param: "ads:ad:abc" }), home);
  // A demo session has the Ads tab, and the Ads crumbs.
  globalThis.window = { __DEMO_MODE: true, location: { pathname: "/w/demo/campaigns" } };
  try {
    assert.equal(campaignsChrome({ param: null }).views?.picked, "sequences");
    assert.deepEqual(
      campaignsChrome({ param: null }).views?.tabs.map((t) => t.id),
      ["sequences", "messages", "ads"],
    );
    const at = campaignsChrome({ param: "ads" });
    assert.equal(at.views?.picked, "ads");
    assert.deepEqual(at.crumbs, [{ label: "Campaigns", to: "campaigns/sequences" }, "Ads"]);
    assert.deepEqual(campaignsChrome({ param: "ads:new" }).crumbs.at(-1), "New ad");
  } finally {
    delete globalThis.window;
  }
});

test("a workspace's Ads preview is on only where its config says features.ads_preview is true, and the schema keeps the key", () => {
  assert.equal(ads.adsPreviewOf({ features: { ads_preview: true } }), true);
  for (const off of [
    null,
    undefined,
    {},
    { features: null },
    { features: {} },
    { features: { ads_preview: "true" } },
    { features: { ads_preview: false } },
  ])
    assert.equal(ads.adsPreviewOf(off), false, JSON.stringify(off));
  // A save of the settings parses the config: the switch survives it, so the next save does not drop it.
  assert.deepEqual(ads.FeaturesConfigSchema.parse({ vision: true, ads_preview: true }), {
    vision: true,
    ads_preview: true,
  });
});
