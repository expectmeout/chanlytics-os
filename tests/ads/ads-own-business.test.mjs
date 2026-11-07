/**
 * A workspace's preview of the Ads as its own (6 Nov 2026): the example ads and people, around the business the workspace says it is,
 * and a New ad that shows the pictures it has kept in Files, a post Ask made among them. The real components and models run on the stub
 * React, over the settings surface a page reads and a fetch where the route would be. A made-up business throughout.
 */
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { installStubReact, fresh, again, all, byTestId, find, redrawWanted, textOf, press } from "../_stub-react.mjs";
import { until } from "../shared/_until.mjs";
import { ADS_EXAMPLES } from "../../apps/dashboard/src/surfaces/campaigns/ads/model/words.ts";
import { adsModel } from "../../apps/dashboard/src/surfaces/campaigns/ads/model/page.ts";
import { adModel } from "../../apps/dashboard/src/surfaces/campaigns/ads/model/drawer/view.ts";
import {
  newAdDefaults,
  newAdModel,
  draftAd,
  newAdFrom,
} from "../../apps/dashboard/src/surfaces/campaigns/ads/model/new-ad.ts";
import { NEW_AD } from "../../apps/dashboard/src/surfaces/campaigns/ads/model/words-new.ts";

installStubReact({
  __DEMO_MODE: false,
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
const { FilesSec } = await import(`${S}/surfaces/campaigns/ads/new/step-ad-files.tsx`);
const { PostsSec } = await import(`${S}/surfaces/campaigns/ads/new/step-ad-parts.tsx`);
const { useNewAd } = await import(`${S}/surfaces/campaigns/ads/new/new-state.ts`);
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
  assert.equal(newAdDefaults(read, CONFIG).serviceId, read.services[0].id, "a new ad starts from its top Service");
});

test("what it has not said reads as missing, never as the studio's; with no name the sample stands whole, and a demo always keeps it", () => {
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
  const was = globalThis.__DEMO_MODE;
  globalThis.__DEMO_MODE = true;
  try {
    assert.equal(theirs(), null, "a demo has no business of its own");
  } finally {
    globalThis.__DEMO_MODE = was;
  }
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
  const draft = { ...newAdDefaults(read, CONFIG), serviceId: read.services[1].id, postId: null };
  assert.equal(newAdModel(draft, read, CONFIG).ad.copy.headline, "Follow-up");
});

// ---------------------------------------------------------------------------------------------------------------------
// A picture from Files

const fileOf = (id, over = {}) => ({
  id,
  status: "filed",
  source: "upload",
  name: `photo-${id}`,
  bytes: 1000,
  width: 1200,
  height: 1500,
  shows: "work",
  who_in_it: "no_one",
  people: null,
  look_status: "done",
  line: null,
  issues: [],
  looks_like_stock: false,
  created_at: "2031-03-01T10:00:00Z",
  ...over,
});
const pageOf = (files, over = {}) => ({
  files,
  shelf: "all",
  next: null,
  tally: { total: files.length, kept: files.length, waiting: 0, looking: 0, shelves: {} },
  ...over,
});

/** What the route is asked, and how it answers. */
const route = { asked: [], answer: () => pageOf([]) };
const realFetch = globalThis.fetch;
globalThis.fetch = async (input) => {
  const url = new URL(String(input instanceof Request ? input.url : input), "https://app.example.org");
  assert.equal(url.pathname, "/api/v1/files", "no other read is asked of");
  route.asked.push(url);
  const data = route.answer(url);
  if (data === null) return new Response(JSON.stringify({ ok: false, error: { message: "no" } }), { status: 500 });
  return new Response(JSON.stringify({ ok: true, data }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};
after(() => {
  globalThis.fetch = realFetch;
});

const readOwn = () => exampleAt("running", NOW, theirs());
/** New ad's photo section, as the step draws it, over a draft a press can change. */
function section(answer, draftOver = {}) {
  route.asked.length = 0;
  route.answer = answer;
  const read = readOwn();
  const held = { draft: { ...newAdDefaults(read, CONFIG), ...draftOver } };
  const props = () => ({
    state: { draft: held.draft },
    read,
    config: CONFIG,
    patch: (p) => {
      held.draft = { ...held.draft, ...p };
    },
  });
  fresh();
  const draw = () => FilesSec(props());
  return { held, tree: draw(), draw: () => again(draw) };
}
const landed = (what) => until(redrawWanted, what);

test("New ad offers the kept pictures, newest first as the read answers, each its own picture and name, a post Ask made saying so", async () => {
  const s = section(() => pageOf([fileOf("a"), fileOf("b", { source: "made", name: "spring-opening" })]));
  assert.ok(textOf(s.tree).includes(ads.FILE_WORDS.reading), "while it reads");
  await landed("the files");
  assert.equal(route.asked.length, 1);
  assert.equal(route.asked[0].searchParams.get("shelf"), "all", "what is kept: the Inbox's are not yet the business's");
  assert.equal(route.asked[0].searchParams.get("limit"), "12", "a few at a time");
  const tree = s.draw();
  const tiles = all(tree, (n) => n.type === "a" || n.type === "button").filter((n) =>
    n.props?.["data-testid"]?.startsWith("ads-new-file-"),
  );
  assert.equal(tiles.length, 2);
  const pics = all(tree, (n) => n.type === "img").map((n) => n.props.src);
  assert.deepEqual(pics, ["/api/v1/files/a/view?w=240", "/api/v1/files/b/view?w=240"]);
  const made = byTestId(tree, "ads-new-file-b");
  assert.match(textOf(made), /Spring opening/);
  assert.match(textOf(made), /Made by Ask/);
  assert.doesNotMatch(textOf(byTestId(tree, "ads-new-file-a")), /Made by Ask/);
  assert.equal(byTestId(tree, "ads-new-files-door").props.href, "#/admin/files", "and the door to where one is added");
});

test("a press picks the picture for the draft and nothing else, and says what to know of it where there is something", async () => {
  const seen = fileOf("c", {
    who_in_it: "not_asked",
    people: { count: 2, recognizable: 1 },
    looks_like_stock: true,
    issues: ["Dark on one side"],
  });
  const s = section(() => pageOf([fileOf("a"), seen]));
  await landed("the files");
  let tree = s.draw();
  assert.equal(byTestId(tree, "ads-new-file-a").props["aria-pressed"], false);
  assert.equal(byTestId(tree, "ads-new-file-note"), null, "nothing picked, nothing to know");
  press(byTestId(tree, "ads-new-file-a"));
  assert.deepEqual(s.held.draft.file, { fileId: "a", name: "photo-a", made: false });
  tree = s.draw();
  assert.equal(byTestId(tree, "ads-new-file-a").props["aria-pressed"], true);
  assert.equal(byTestId(tree, "ads-new-file-note"), null, "one the look had nothing to say of");
  press(byTestId(tree, "ads-new-file-c"));
  tree = s.draw();
  assert.deepEqual(
    all(tree, (n) => n.props?.["data-testid"] === "ads-new-file-note").map((n) => textOf(n).trim()),
    [ads.FILE_WORDS.whoAsk(2), ads.FILE_WORDS.stock, "Dark on one side"],
    "whether they agreed to be shown, first: an ad reaches strangers",
  );
  assert.equal(route.asked.length, 1, "a press reads nothing");
});

test("more comes a few at a time, from where the read stopped; with nothing kept it says so and shows the door, and one that failed offers again", async () => {
  const more = section((url) =>
    url.searchParams.get("before")
      ? pageOf([fileOf("b")], { next: null })
      : pageOf([fileOf("a")], { next: "2031-03-01T10:00:00Z|a" }),
  );
  await landed("the first few");
  let tree = more.draw();
  press(byTestId(tree, "ads-new-files-more"));
  await until(() => route.asked.length === 2, "the second read");
  assert.equal(route.asked[1].searchParams.get("before"), "2031-03-01T10:00:00Z|a");
  await until(() => byTestId(more.draw(), "ads-new-file-b"), "the next few");
  tree = more.draw();
  assert.ok(byTestId(tree, "ads-new-file-a"), "and the first stay");
  assert.equal(byTestId(tree, "ads-new-files-more"), null, "and at the last there is no more");

  const none = section(() => pageOf([]));
  await landed("an empty shelf");
  assert.equal(textOf(byTestId(none.draw(), "ads-new-files-none")), NEW_AD.step2.files.none);
  assert.ok(byTestId(none.draw(), "ads-new-files-door"));

  const waiting = section(() =>
    pageOf([], { tally: { total: 3, kept: 0, waiting: 3, looking: 0, shelves: {} }, shelf: "all" }),
  );
  await landed("an empty shelf, and a full Inbox");
  assert.equal(textOf(byTestId(waiting.draw(), "ads-new-files-none")), ads.FILE_WORDS.noneFiled);

  let up = false;
  const failed = section(() => (up ? pageOf([fileOf("a")]) : null));
  await landed("a read that failed");
  tree = failed.draw();
  assert.ok(textOf(byTestId(tree, "ads-new-files-failed")).includes(ads.FILE_WORDS.failedRead));
  up = true;
  press(byTestId(tree, "ads-new-files-again"));
  failed.draw();
  await until(() => byTestId(failed.draw(), "ads-new-file-a"), "the read again");
});

test("the section stands alone on a preview's Meta photo; a video has no Files to pick from, and a demo keeps what it drew and reads nothing", async () => {
  const read = readOwn();
  const draft = {
    ...newAdDefaults(read, CONFIG),
    door: "whatsapp",
    platform: "meta",
    format: "photo",
    postId: null,
  };
  const postsProps = (d) => ({ state: { draft: d }, read, config: CONFIG, patch() {} });
  route.asked.length = 0;
  route.answer = () => pageOf([fileOf("a")]);
  fresh();
  const tree = PostsSec(postsProps(draft));
  assert.ok(byTestId(tree, "ads-new-files-door"), "the Files section");
  assert.equal(byTestId(tree, "ads-new-post-add"), null, "with no lone Add a photo over it");
  await landed("the files");

  route.asked.length = 0;
  fresh();
  const video = PostsSec(postsProps({ ...draft, format: "video" }));
  assert.equal(byTestId(video, "ads-new-files-door"), null);
  assert.ok(byTestId(video, "ads-new-post-add"), "a video keeps its own tile");

  const was = globalThis.__DEMO_MODE;
  globalThis.__DEMO_MODE = true;
  try {
    fresh();
    const raw = exampleAt("running", NOW, null);
    const demo = PostsSec({
      state: { draft: { ...newAdDefaults(raw, CONFIG), door: "whatsapp", platform: "meta", format: "photo" } },
      read: raw,
      config: CONFIG,
      patch() {},
    });
    assert.ok(byTestId(demo, "ads-new-post-add"));
    assert.equal(byTestId(demo, "ads-new-files-door"), null);
    assert.equal(route.asked.length, 0, "no read");
  } finally {
    globalThis.__DEMO_MODE = was;
  }
});

test("the picture picked is what the preview draws and what the ad keeps: a photo sized for the frame, a post in the frame's own shape", () => {
  const read = readOwn();
  const base = {
    ...newAdDefaults(read, CONFIG),
    door: "whatsapp",
    platform: "meta",
    format: "photo",
    postId: null,
  };
  const pick = { fileId: "a", name: "storefront-dusk", made: false };
  const vm = newAdModel({ ...base, file: pick }, read, CONFIG);
  assert.deepEqual(vm.drawer.preview.picture, pick);
  assert.deepEqual(draftAd({ ...base, file: pick }, read, CONFIG, "new").media, { kind: "file", ...pick });

  const framed = (preview, frame) => {
    fresh();
    return AdPreview({ preview, frame });
  };
  const picture = (tree) => byTestId(tree, "ads-frame-picture");
  assert.equal(picture(framed(vm.drawer.preview, "feed")).props.src, "/api/v1/files/a/view?w=720");
  assert.equal(picture(framed(vm.drawer.preview, "feed")).props.alt, "Storefront dusk");
  const post = { ...vm.drawer.preview, picture: { fileId: "p", name: "spring", made: true } };
  assert.equal(picture(framed(post, "feed")).props.src, "/api/v1/files/p/view?shape=portrait");
  assert.equal(picture(framed(post, "story")).props.src, "/api/v1/files/p/view?shape=story");

  // One that cannot be drawn leaves the flat tile, never a broken glyph.
  fresh();
  const draw = () => AdPreview({ preview: vm.drawer.preview, frame: "feed" });
  find(draw(), (n) => n.props?.["data-testid"] === "ads-frame-picture").props.onError();
  assert.equal(picture(again(draw)), null);
  assert.ok(find(again(draw), (n) => n.props?.className === "ads-photo"));

  // No picture on what shows none: a video, or Google.
  assert.equal(newAdModel({ ...base, file: pick, format: "video" }, read, CONFIG).drawer.preview.picture, null);
  const google = { ...base, door: "call", platform: "google", file: pick };
  assert.equal(newAdModel(google, read, CONFIG).drawer.preview.picture, null);
  assert.equal(draftAd(google, read, CONFIG, "new").media.kind, "none");
});

test("an ad shows a post or a picture, not both, and a copy of one with a picture keeps it", () => {
  const read = { ...readOwn(), posts: exampleAt("running", NOW, null).posts };
  fresh();
  const opening = { door: "whatsapp", from: null };
  const draw = () => useNewAd({ read, config: CONFIG, opening });
  let held = draw();
  const pick = { fileId: "a", name: "storefront", made: false };
  held.patch({ postId: null, file: pick });
  held = again(draw);
  assert.deepEqual(held.state.draft.file, pick);
  held.patch({ postId: read.posts[0].id });
  held = again(draw);
  assert.equal(held.state.draft.file, null);

  const ad = { ...read.ads[0], media: { kind: "file", ...pick } };
  assert.deepEqual(newAdFrom(ad, "copy", read).file, pick);
  assert.equal(newAdFrom(ad, "google", read).file, null, "Google shows no picture");
});
