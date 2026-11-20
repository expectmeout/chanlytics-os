/**
 * A workspace's preview of the Ads as its own (6 Nov 2026): the example ads and people, around the business the workspace says it is,
 * and an ad's preview that draws the picture it keeps from Files, a post Ask made among them. The real components and models run on
 * the stub React, over the settings surface a page reads. A made-up business throughout.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { installStubReact, fresh, again, byTestId, find } from "../_stub-react.mjs";
import { ADS_EXAMPLES } from "../../apps/dashboard/src/surfaces/campaigns/ads/model/words.ts";
import { adsModel } from "../../apps/dashboard/src/surfaces/campaigns/ads/model/page.ts";
import { adModel } from "../../apps/dashboard/src/surfaces/campaigns/ads/model/drawer/view.ts";
import { starterCopy } from "../../apps/dashboard/src/surfaces/campaigns/ads/model/starter-copy.ts";

installStubReact({
  CHANLY: { nav() {} },
  location: {
    pathname: "/w/birch-lane",
    hash: "",
    host: "app.example.org",
    origin: "https://app.example.org",
    assign() {},
    replace() {},
    reload() {},
  },
});
const S = "../../apps/dashboard/src";
(await import(`${S}/surfaces/frame/frame-globals.ts`)).installFrameGlobals();
const ads = await import("@chanlytics/contracts");
const { exampleAt } = await import(`${S}/surfaces/campaigns/ads/examples.ts`);
const { adsOwnHere } = await import(`${S}/surfaces/campaigns/ads/own.ts`);
const { CONFIG, SPRING } = await import(`${S}/surfaces/campaigns/ads/sample.ts`);
const { useAdsStore } = await import(`${S}/surfaces/campaigns/ads/store.ts`);
const { AdPreview } = await import(`${S}/surfaces/campaigns/ads/drawer/preview.tsx`);
const { adsDemoFold } = await import(`${S}/surfaces/reports/ads-demo.ts`);
const { withChoices } = await import(`${S}/surfaces/settings/connections/ad-accounts-mock.ts`);
const { setSurfaceValue } = await import(`${S}/surfaces/surface-values.ts`);

const fact = (value) => ({ value, source: "typed" });
const NO_FACT = fact(null);
/** What a workspace says of itself, and what Settings holds of it, as the settings surface hands it to a page. */
const settingsOf = (facts = {}, profile = {}) => ({
  settings: {
    config: {
      brain: {
        profile: {
          hours: {
            mon: { open: "09:00", close: "17:00" },
            tue: { open: "09:00", close: "17:00" },
            wed: { open: "09:00", close: "17:00" },
            thu: { open: "09:00", close: "17:00" },
            fri: { open: "09:00", close: "17:00" },
            sat: {},
            sun: {},
          },
          services: [{ name: "First visit", price_note: "from $30" }, { name: "Follow-up" }],
          guardrails: { never_quote_prices: true },
          ...profile,
        },
      },
    },
  },
  facts: {
    facts: {
      business_name: fact("Birch Lane Co"),
      phone_display: fact("(555) 010-0199"),
      address: fact("44 Birch Ln, Trenton, NJ 08608"),
      website: fact("https://www.example.org/"),
      kept_line: NO_FACT,
      voice_line: NO_FACT,
      whatsapp_line: NO_FACT,
      ...facts,
    },
    conflicts: [],
  },
});
const WORKSPACE = {
  id: "w1",
  slug: "birch-lane",
  name: "Birch Lane Co",
  status: "active",
  role: "owner",
  timezone: "America/Chicago",
  appointment_word: "visit",
};
globalThis.__WORKSPACES = [WORKSPACE];
globalThis.__ACTIVE_WORKSPACE = "w1";

/** Run with the workspace's settings held, as a page's are. */
function holding(settings, run) {
  setSurfaceValue("settings", settings);
  try {
    return run();
  } finally {
    setSurfaceValue("settings", undefined);
  }
}
const ownNow = (facts, profile) => holding(settingsOf(facts, profile), () => adsOwnHere());

const NOW = Date.parse("2031-03-15T15:05:00Z");
const theirs = () => ownNow();

// ---------------------------------------------------------------------------------------------------------------------
// The business

test("a preview's sample is the business the workspace says it is, in every example, and no word of the made-up studio is left", () => {
  const own = theirs();
  assert.deepEqual(
    { ...own, services: undefined },
    {
      name: "Birch Lane Co",
      address: "44 Birch Ln, Trenton, NJ 08608",
      street: "44 Birch Ln",
      line: "(555) 010-0199",
      site: "www.example.org",
      hours: "Mon–Fri 9 AM – 5 PM",
      page: "app.example.org/b/birch-lane",
      timezone: "America/Chicago",
      appointmentWord: "visit",
      neverQuotePrices: true,
      services: undefined,
    },
  );
  for (const example of ADS_EXAMPLES) {
    const read = exampleAt(example, NOW, own);
    assert.doesNotMatch(JSON.stringify(read), /harbor/i, `${example}: no word of the studio`);
    assert.equal(read.business.name, "Birch Lane Co", example);
    assert.equal(read.business.street, "44 Birch Ln", example);
    assert.equal(read.business.page, "app.example.org/b/birch-lane", example);
    assert.equal(read.timezone, "America/Chicago", example);
    assert.equal(read.appointmentWord, "visit", example);
    assert.deepEqual(
      read.services.map((s) => [s.name, s.note]),
      [
        ["First visit", "from $30"],
        ["Follow-up", ""],
      ],
      example,
    );
    for (const ad of read.ads) {
      assert.equal(ad.shownAs.name, "Birch Lane Co", `${example}: ${ad.name}`);
      assert.equal(ad.shownAs.handle, null, "no handle is made up for it");
    }
    assert.deepEqual(read.posts, [], "no posts are made up for it: none has been read");
    assert.equal(read.rating, null, "nor a rating");
    assert.equal(read.neverQuotePrices, true);
  }
});

test("the ads, their numbers and the people stay the example's: only whose they are changes", () => {
  const own = theirs();
  for (const example of ["running", "needs-you", "finished", "setting-up"]) {
    const mine = adsModel(exampleAt(example, NOW, own), CONFIG);
    const sample = adsModel(exampleAt(example, NOW, null), CONFIG);
    assert.deepEqual(
      mine.figures.map((f) => f.value),
      sample.figures.map((f) => f.value),
      example,
    );
    assert.equal(mine.groups.flatMap((g) => g.rows).length, sample.groups.flatMap((g) => g.rows).length, example);
  }
  const read = exampleAt("running", NOW, own);
  const raw = exampleAt("running", NOW, null);
  assert.deepEqual(
    read.people.map((p) => p.name),
    raw.people.map((p) => p.name),
  );
});

test("the accounts stay plainly examples beside a real name, since none is connected, and Connections offers no studio's", () => {
  const own = theirs();
  const read = exampleAt("running", NOW, own);
  assert.deepEqual(
    read.accounts.map((a) => a.name),
    ["Example ad account", "Example Google Ads account", "Example TikTok account"],
  );
  const meta = read.accounts.find((a) => a.platform === "meta");
  const offered = holding(settingsOf(), () => withChoices(meta)).choices.map((c) => c.name);
  assert.ok(offered.length > 1, "there is another to change to");
  assert.ok(
    offered.every((name) => name.startsWith("Example")),
    offered.join(),
  );
  assert.equal(new Set(offered).size, offered.length, "and its own account is not offered twice");
});

test("an ad reads as the business's: the frame's name, the sentence's street, the words it opens with and its word for an appointment", () => {
  const read = exampleAt("running", NOW, theirs());
  const spring = read.ads.find((a) => a.id === SPRING);
  const vm = adModel(spring, read, CONFIG);
  assert.equal(vm.preview.business, "Birch Lane Co");
  assert.match(vm.preview.text, /Book your first visit at Birch Lane Co/);
  assert.match(vm.preview.thread.greeting, /Birch Lane Co/);
  const near = read.ads.find((a) => a.platform === "google");
  assert.equal(near.name, "Visits near me", "a name the sample wrote the word into says the workspace's");
  assert.match(near.copy.lines.join(" "), /Open Mon–Fri 9 AM – 5 PM\. 44 Birch Ln, Trenton, NJ 08608\./);
  assert.ok(
    JSON.stringify(adModel(near, read, CONFIG).sentence).includes("44 Birch Ln"),
    "where its area is said around",
  );
  assert.equal(near.opensUrl, "app.example.org/b/birch-lane");
});

test("what it has not said reads as missing, never as the studio's; with no name the sample stands whole", () => {
  const own = ownNow(
    { phone_display: NO_FACT, address: NO_FACT, website: NO_FACT },
    { hours: undefined, services: [], guardrails: { never_quote_prices: false } },
  );
  assert.equal(own.neverQuotePrices, false, "a business that says it may quote may");
  const read = exampleAt("running", NOW, own);
  assert.doesNotMatch(JSON.stringify(read), /harbor/i);
  assert.equal(read.business.address, "your address");
  assert.equal(read.business.street, "your address");
  assert.equal(read.business.hours, "your hours");
  assert.equal(read.business.site, "example.com", "a reserved example, which claims nothing");
  assert.equal(read.business.line, "(555) 013-0042", "and a number that rings nowhere");
  assert.ok(read.services.length > 0, "with no Services of its own, the sample's still let a draft be drawn");
  assert.equal(
    ownNow({ business_name: NO_FACT }),
    null,
    "no name: the sample stands, and nothing half of it pretends to be theirs",
  );
  assert.equal(
    holding(null, () => adsOwnHere()),
    null,
  );
});

test("a line is what the receptionist tells customers to call, then the line it answers, and never the number it hands over to", () => {
  assert.equal(ownNow({ phone_display: NO_FACT, voice_line: fact("+15550100188") }).line, "+15550100188");
  assert.equal(ownNow({ phone_display: NO_FACT, handoff_number: fact("+15550100177") }).line, null);
});

test("one pass of the words: a real name holding the studio's, or the word itself, is left as the business wrote it", () => {
  const own = ownNow({ business_name: fact("Harbor Street Appointment Room") });
  const read = exampleAt("running", NOW, own);
  assert.equal(read.business.name, "Harbor Street Appointment Room");
  assert.equal(read.ads[0].shownAs.name, "Harbor Street Appointment Room");
  assert.match(read.ads[0].copy.text, /at Harbor Street Appointment Room\./);
});

test("the store a page draws is the workspace's own, and so is Reports' fold, in the workspace's zone and word", (t) => {
  // The hour New York has turned the day and Chicago has not: the one moment a day counted in New York reads a day off. At
  // any other hour the two zones say the same day, and a fold or a store that took the wrong one would pass.
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse("2031-01-15T05:10:00Z") });
  fresh();
  const { read } = holding(settingsOf(), () => useAdsStore());
  assert.equal(read.business.name, "Birch Lane Co");
  assert.equal(read.today, "2031-01-14", "Chicago's day, while New York's is the 15th");
  const at = Date.now();
  const raw = adsDemoFold("30d", ads.ADS_SCOPE_ALL, read.today, at);
  const own = holding(settingsOf(), () => adsDemoFold("30d", ads.ADS_SCOPE_ALL, read.today, at));
  assert.equal(own.empty, null, "its days hold the ads");
  assert.deepEqual(
    own.figures.map((f) => f.value),
    raw.figures.map((f) => f.value),
    "the same example numbers",
  );
  assert.ok(JSON.stringify(own).includes("a visit"), "said in the workspace's word");
  // A preview whose business has said no name keeps the sample whole, in New York, and Reports reads it on the workspace's days all
  // the same, as it reads the named business's.
  const nameless = holding(settingsOf({ business_name: NO_FACT }), () =>
    adsDemoFold("30d", ads.ADS_SCOPE_ALL, read.today, at),
  );
  assert.deepEqual(
    nameless.figures.map((f) => f.value),
    own.figures.map((f) => f.value),
    "the same example numbers where the business has said no name",
  );
});

test("a Service with no price says its name alone, with no comma left hanging", () => {
  const read = exampleAt("running", NOW, theirs());
  const words = (price) =>
    starterCopy({ service: "Follow-up", price, business: read.business, door: "whatsapp", word: read.appointmentWord });
  assert.equal(words("").headline, "Follow-up");
  assert.equal(words("from $30").headline, "Follow-up, from $30");
});

// ---------------------------------------------------------------------------------------------------------------------
// A picture from Files

test("an ad's picture from Files is what its preview draws: a photo sized for the frame, a post in the frame's own shape", () => {
  const read = exampleAt("running", NOW, theirs());
  const spring = read.ads.find((a) => a.id === SPRING);
  const pick = { fileId: "a", name: "storefront-dusk", made: false };
  const { preview } = adModel({ ...spring, media: { kind: "file", ...pick } }, read, CONFIG);
  assert.deepEqual(preview.picture, pick);

  const framed = (shown, frame) => {
    fresh();
    return AdPreview({ preview: shown, frame });
  };
  const picture = (tree) => byTestId(tree, "ads-frame-picture");
  assert.equal(picture(framed(preview, "feed")).props.src, "/api/v1/files/a/view?w=720");
  assert.equal(picture(framed(preview, "feed")).props.alt, "Storefront dusk");
  const post = { ...preview, picture: { fileId: "p", name: "spring", made: true } };
  assert.equal(picture(framed(post, "feed")).props.src, "/api/v1/files/p/view?shape=portrait");
  assert.equal(picture(framed(post, "story")).props.src, "/api/v1/files/p/view?shape=story");

  // One that cannot be drawn leaves the flat tile, never a broken glyph.
  fresh();
  const draw = () => AdPreview({ preview, frame: "feed" });
  find(draw(), (n) => n.props?.["data-testid"] === "ads-frame-picture").props.onError();
  assert.equal(picture(again(draw)), null);
  assert.ok(find(again(draw), (n) => n.props?.className === "ads-photo"));
});
