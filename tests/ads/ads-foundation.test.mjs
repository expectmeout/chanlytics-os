/**
 * The Ads view's foundation: its addresses, its money, and the one switch that draws it. The real code runs.
 *
 *   addresses  campaigns/ads, :ad:<id>, :new[:door], :new:<how>:<id>; a word the view does not know is the page
 *   money      each currency's own minor units, said exact; only an average is rounded
 *   the switch Ads is drawn only where the settings read says so (the server's readAdsShown); the workspace flag that
 *              drew the mockup is gone, and a config that still holds it parses to one without it
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { aboutMoneyOf, minorOfUnits, moneyOf } from "../../apps/dashboard/src/surfaces/campaigns/ads/model/money.ts";

const ads = await import("@chanlytics/contracts");
const { campaignsChrome } = await import("../../apps/dashboard/src/surfaces/campaigns/routes.ts");
const { adsShown } = await import("../../apps/dashboard/src/surfaces/campaigns/ads/shown.ts");
const { setSurfaceValue } = await import("../../apps/dashboard/src/surfaces/surface-values.ts");

test("an Ads address says the page, an ad open, or the composer on a door or from an ad", () => {
  const none = { ad: null, compose: null };
  assert.deepEqual(ads.parseAds("ads"), none);
  assert.deepEqual(ads.parseAds("ads:ad:abc"), { ...none, ad: "abc" });
  assert.deepEqual(ads.parseAds("ads:new"), { ...none, compose: { door: "whatsapp", from: null } });
  assert.deepEqual(ads.parseAds("ads:new:call"), { ...none, compose: { door: "call", from: null } });
  assert.deepEqual(ads.parseAds("ads:new:copy:abc").compose, { door: "whatsapp", from: { how: "copy", id: "abc" } });
  assert.deepEqual(ads.parseAds("ads:new:again:abc").compose?.from, { how: "again", id: "abc" });
  assert.deepEqual(ads.parseAds("ads:new:google:abc").compose, { door: "call", from: { how: "google", id: "abc" } });
  // A word the view does not know is the page: a link never lands on nothing.
  // The Results sheet went with the mockup (20 Nov 2026): its old address is the page.
  for (const odd of ["ads:surprise", "ads:ad:", "ads:results", "ads:new:copy", "ads:new:elsewhere"])
    assert.equal(ads.parseAds(odd).ad, null, odd);
  assert.deepEqual(ads.parseAds("ads:results"), none);
  assert.deepEqual(ads.parseAds("ads:new:copy"), { ...none, compose: { door: "whatsapp", from: null } });
  // And each address spells back to the same words.
  assert.equal(ads.adRoute("abc"), "campaigns/ads:ad:abc");
  assert.equal(ads.newAdRoute(), "campaigns/ads:new");
  assert.equal(ads.newAdRoute("form"), "campaigns/ads:new:form");
  assert.equal(ads.newAdFromRoute("again", "abc"), "campaigns/ads:new:again:abc");
  assert.equal(ads.parseAds(ads.newAdFromRoute("google", "x").split("/")[1]).compose?.from?.how, "google");
  assert.ok(
    ads.isAdsParam("ads") && ads.isAdsParam("ads:new") && !ads.isAdsParam("adsense") && !ads.isAdsParam("moment:ads"),
  );
});

/** An amount as the runtime writes it, with a plain space where it puts one that does not break. */
const plain = (words) => words.replaceAll(String.fromCharCode(0xa0), " ");

test("money is the currency's own minor units, said exact: a hundred to the dollar, one to the yen, a thousand to the dinar", () => {
  assert.deepEqual(["USD", "GBP", "JPY", "KWD"].map(ads.minorPerUnit), [100, 100, 1, 1000]);
  // ISO 4217's own count, the same on every runtime: a runtime's currency table says a hundred to the forint and the
  // Colombian peso in one version and one in the next, and an amount kept by the edge is said by a browser of any age.
  assert.deepEqual(
    ["HUF", "COP", "TWD", "IDR", "CLP", "ISK", "BHD", "CLF", "usd"].map(ads.minorPerUnit),
    [100, 100, 100, 100, 1, 1, 1000, 10000, 100],
  );
  assert.equal(ads.minorPerUnit(""), 100, "a code that is no currency never throws");
  assert.equal(ads.minorPerUnit("dollars"), 100);
  assert.equal(moneyOf(1400, "USD"), "$14");
  assert.equal(moneyOf(72000, "USD"), "$720");
  assert.equal(moneyOf(128400, "USD"), "$1,284");
  assert.equal(moneyOf(500, "USD"), "$5", "a whole number is whole");
  assert.equal(moneyOf(550, "USD"), "$5.50");
  assert.equal(moneyOf(128450, "USD"), "$1,284.50", "an amount an owner approved is never rounded to a unit");
  assert.equal(moneyOf(23000, "GBP"), "£230");
  // A yen is its own smallest unit: 1,284 is ¥1,284, never ¥12.84 and never ¥13.
  assert.equal(moneyOf(1284, "JPY"), "¥1,284");
  // A dinar holds a thousand fils, and keeps three digits where there are some.
  assert.equal(plain(moneyOf(1250, "KWD")), "KWD 1.250");
  assert.equal(plain(moneyOf(15000, "KWD")), "KWD 15");
  assert.deepEqual(
    ["USD", "JPY", "KWD"].map((currency) => minorOfUnits(15, currency)),
    [1500, 15, 15000],
    "what an owner types is whole units of the account's own currency",
  );
  // Only an average nobody approved is rounded: the cost for each person, from 10 units up.
  assert.equal(aboutMoneyOf(128450 / 3, "USD"), "$428");
  assert.equal(aboutMoneyOf(2500 / 3, "USD"), "$8.33");
  assert.equal(aboutMoneyOf(128450 / 3, "JPY"), "¥42,817");
  assert.equal(plain(aboutMoneyOf(128450 / 3, "KWD")), "KWD 43");
});

test("a real workspace's Campaigns has no Ads tab, and an Ads address is Sequences'", () => {
  // No window stands here: a real workspace's answer, Sequences with Content beside it (decision 0060; Messages folded in).
  const home = campaignsChrome({ param: null });
  assert.deepEqual(home.crumbs, ["Campaigns"]);
  assert.deepEqual(
    home.views?.tabs.map((t) => t.id),
    ["sequences", "content"],
    "no Ads tab in a real workspace; Content is every workspace's (decision 0125)",
  );
  assert.deepEqual(campaignsChrome({ param: "ads" }), home);
  assert.deepEqual(campaignsChrome({ param: "ads:ad:abc" }), home);
  // Where the settings read says Ads is here (the server's one answer), the Ads tab and the Ads crumbs.
  globalThis.window = { location: { pathname: "/w/harbor/campaigns" } };
  setSurfaceValue("settings", { settings: { ads: true } });
  try {
    assert.equal(campaignsChrome({ param: null }).views?.picked, "sequences");
    assert.deepEqual(
      campaignsChrome({ param: null }).views?.tabs.map((t) => t.id),
      ["sequences", "content", "ads"],
    );
    const at = campaignsChrome({ param: "ads" });
    assert.equal(at.views?.picked, "ads");
    assert.deepEqual(at.crumbs, [{ label: "Campaigns", to: "campaigns/sequences" }, "Ads"]);
    assert.deepEqual(campaignsChrome({ param: "ads:new" }).crumbs.at(-1), "New ad");
  } finally {
    setSurfaceValue("settings", undefined);
    delete globalThis.window;
  }
});

test("Ads is drawn where the settings read says it, nowhere else, and the old workspace flag draws nothing", () => {
  globalThis.window = { location: { pathname: "/w/harbor/campaigns" } };
  try {
    for (const [settings, drawn] of [
      [undefined, false],
      [{ settings: { ads: false } }, false],
      [{ settings: { ads: true } }, true],
      // The flag that drew the mockup gave way to the edge's list (the Ads plan's 6.2): a config holding it draws nothing.
      [{ settings: { ads: false, config: { features: { ads_preview: true } } } }, false],
    ]) {
      setSurfaceValue("settings", settings);
      assert.equal(adsShown(), drawn, JSON.stringify(settings));
    }
  } finally {
    setSurfaceValue("settings", undefined);
    delete globalThis.window;
  }
  // A config that still holds the flag parses, and a save writes it back without it.
  assert.deepEqual(ads.FeaturesConfigSchema.parse({ vision: true, ads_preview: true }), { vision: true });
  assert.equal("adsPreviewOf" in ads, false, "no reader of the flag is left");
});
