/**
 * A workspace's preview of the Ads against a demo's (6 Nov 2026): one sample, drawn by the real components on the stub React. A
 * preview stands among the workspace's real pages, so it owes what a demo does not: it says what it is wherever it draws the sample,
 * the people it names open nothing, and no fact of it joins a real report. And the sample reads as of today on every page, in both.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  installStubReact,
  fresh,
  again,
  all,
  byTestId,
  classes,
  find,
  redrawWanted,
  textOf,
  press,
} from "../_stub-react.mjs";
import { until } from "../shared/_until.mjs";

installStubReact({ __DEMO_MODE: false, CHANLY: { nav() {} } });
const S = "../../apps/dashboard/src";
(await import(`${S}/surfaces/frame/frame-globals.ts`)).installFrameGlobals();
const ads = await import("@chanlytics/contracts");
const page = await import("@chanlytics/contracts/ads-page");
const { toPeopleReportVM } = await import("@chanlytics/contracts/report-lens");
const { EXAMPLE_READS, exampleAt } = await import(`${S}/surfaces/campaigns/ads/examples.ts`);
const { CONFIG, SPRING, SATURDAY } = await import(`${S}/surfaces/campaigns/ads/sample.ts`);
const { makeVerbs, useAdsStore } = await import(`${S}/surfaces/campaigns/ads/store.ts`);
const { AdsPage } = await import(`${S}/surfaces/campaigns/ads/ads-page.tsx`);
const { AdDrawer } = await import(`${S}/surfaces/campaigns/ads/drawer/drawer.tsx`);
const { AdPeople } = await import(`${S}/surfaces/campaigns/ads/drawer/people.tsx`);
const { AdsPhone } = await import(`${S}/surfaces/campaigns/ads/ledger/phone.tsx`);
const { NewAd } = await import(`${S}/surfaces/campaigns/ads/new/new-ad.tsx`);
const { ResultsSheet } = await import(`${S}/surfaces/campaigns/ads/results/results-sheet.tsx`);
const { WaitingBlock } = await import(`${S}/surfaces/campaigns/ads/tiles.tsx`);
const { adsDemoFold } = await import(`${S}/surfaces/reports/ads-demo.ts`);
const { AdsLens } = await import(`${S}/surfaces/reports/lenses/ads.tsx`);
const { useAdsLens } = await import(`${S}/surfaces/reports/lenses/ads-load.ts`);
const { PeopleLens } = await import(`${S}/surfaces/reports/lenses/people.tsx`);
const { peopleSample, reportsSample } = await import(`${S}/surfaces/reports/sample.ts`);
const { AdAccounts } = await import(`${S}/surfaces/settings/connections/ad-accounts.tsx`);
const { setSurfaceValue } = await import(`${S}/surfaces/surface-values.ts`);

/** Saturday 15 March 2031, 10:05 AM in New York: no date a fixture holds can be mistaken for it. */
const NOW = Date.parse("2031-03-15T14:05:00Z");
const TODAY = "2031-03-15";
const ALL = ads.ADS_SCOPE_ALL;
const NOTE = "ads-preview-note";

/** Draw under a session that is, or is not, a demo. */
function session(demo, draw) {
  const was = globalThis.__DEMO_MODE;
  globalThis.__DEMO_MODE = demo;
  try {
    fresh();
    return draw();
  } finally {
    globalThis.__DEMO_MODE = was;
  }
}
const preview = (draw) => session(false, draw);
const demo = (draw) => session(true, draw);

const links = (tree) => all(tree, (n) => n.type === "a" && n.props?.href);
/** The elements a page draws with a test id: a component handed one and what it renders would each be found otherwise. */
const drawn = (tree, id) => all(tree, (n) => typeof n.type === "string" && n.props?.["data-testid"]?.startsWith(id));
const rowsOf = (vm) => vm.groups.flatMap((g) => g.rows);
const world = (read) => ({ get: () => read, put() {} });

// ---------------------------------------------------------------------------------------------------------------------
// As of now

test("every example reads as of now: no date a fixture is written with is left in it, its today is the business's, and it was read just now", () => {
  for (const example of page.ADS_EXAMPLES) {
    const read = exampleAt(example, NOW);
    assert.equal(read.today, TODAY, example);
    assert.equal(Date.parse(read.readAt), NOW, `${example}: read at this moment`);
    assert.deepEqual(read.window, { from: "2031-02-13", to: "2031-03-14" }, `${example}: 30 days ending yesterday`);
    const said = JSON.stringify(read);
    assert.doesNotMatch(said, /2026-\d\d-\d\d/, `${example}: no day or moment is left behind`);
    assert.doesNotMatch(said, /\b\d{1,2} (Sep|Oct|Nov)\b/, `${example}: nor a day in words`);
  }
});

test("nothing it says has happened is still to come, at any hour, and each day keeps its distance from today", () => {
  const moments = (read) => JSON.stringify(read).match(/\d{4}-\d\d-\d\dT[^"]+/g) ?? [];
  const before = Date.parse("2031-03-15T04:30:00Z"); // 12:30 AM there, well before the 9:19 AM it was written at
  for (const now of [NOW, before]) {
    for (const example of page.ADS_EXAMPLES) {
      const late = moments(exampleAt(example, now)).filter((m) => Date.parse(m) > now);
      assert.deepEqual(late, [], `${example} at ${new Date(now).toISOString()}`);
    }
  }
  const raw = EXAMPLE_READS["needs-you"]();
  const read = exampleAt("needs-you", NOW);
  const left = (r, day) => ads.daysBetween(r.today, day);
  read.ads.forEach((ad, at) => {
    assert.equal(left(read, ad.endDay), left(raw, raw.ads[at].endDay), ad.name);
    assert.equal(left(read, ad.startDay), left(raw, raw.ads[at].startDay), ad.name);
  });
  const lapses = (r) => r.accounts.find((a) => a.platform === "tiktok").permissionEnd;
  assert.equal(left(read, lapses(read)), left(raw, lapses(raw)));
  assert.equal(read.people.length, raw.people.length);
});

test("a fixture is only moved: its own moment moves nothing, and a test still reads it as written", () => {
  const raw = EXAMPLE_READS["setting-up"]();
  const same = exampleAt("setting-up", Date.parse(raw.readAt));
  const days = (r) => r.ads.map((a) => [a.name, a.startDay, a.endDay, a.approvedDay]);
  assert.deepEqual(days(same), days(raw));
  assert.deepEqual(same.window, raw.window);
  assert.equal(raw.today, "2026-10-11", "the fixture keeps its date");
  // A new ad's name says the day it starts: that follows it.
  const named = exampleAt("setting-up", NOW).ads.find((a) => a.state === "setting-up");
  assert.equal(named.name, `First appointment · ${page.dayShort(named.startDay)}`);
  assert.equal(named.startDay, "2031-03-16");
});

test("the page says today: the pane line's read, the month-away permission, and an ad sent this morning", () => {
  const read = exampleAt("running", NOW);
  const vm = page.adsModel(read, CONFIG);
  assert.match(vm.pane, /read 10:05 AM/);
  const tiktok = vm.standing.find((s) => s.id === "tiktok");
  assert.ok(
    tiktok.rows.some((r) => r.text.includes(page.dayWord("2031-04-08"))),
    "the permission lapses as far off as it was written",
  );
  const coming = vm.tiles.coming.rows.flatMap((r) => r.when).join(" ");
  assert.doesNotMatch(coming, /Oct/);
  assert.match(rowsOf(vm).find((r) => r.name === "Weekend offer").hint, /sent to Meta today/);
});

test("an ad says the same days on the page and in Reports, whose days hold it: the door from the sheet lands on something", () => {
  const read = exampleAt("running", NOW);
  const days = { from: read.window.from, to: read.window.to };
  const lens = adsDemoFold(days, ALL, TODAY, NOW);
  const sheet = page.adsResultsOf(read, CONFIG, { ...days, scope: ALL });
  assert.equal(lens.empty, null, "REGRESSION: the sheet's door named 30 days of October, where Reports' ads were not");
  assert.deepEqual(lens.byAd, sheet.byAd);
  assert.deepEqual(lens.byAd, rowsOf(page.adsModel(read, CONFIG)), "and the ledger's own rows, to the word");
  assert.equal(lens.pane, sheet.pane);
  const hints = lens.byAd.map((r) => r.hint).join(" | ");
  assert.doesNotMatch(hints, /Oct|Sep/, "REGRESSION: Reports said an ad was sent to Meta on 11 Oct");
});

test("the store a page draws reads as of the clock, whichever example is chosen", () => {
  fresh();
  const today = ads.zoneDayKey(Date.now(), "America/New_York");
  const store = useAdsStore();
  assert.equal(store.read.today, today);
  store.setExample("needs-you");
  const next = again(() => useAdsStore());
  assert.equal(next.example, "needs-you");
  assert.equal(next.read.today, today);
  globalThis.sessionStorage.removeItem("ads-mock-scenario");
});

// ---------------------------------------------------------------------------------------------------------------------
// It says what it is

const read = exampleAt("running", NOW);
const fold = page.adsResultsOf(read, CONFIG, { from: read.window.from, to: read.window.to, scope: ALL });
const surfaces = {
  "the page": () => AdsPage({ param: "ads" }),
  "an ad's drawer": () =>
    AdDrawer({
      id: SPRING,
      read,
      config: CONFIG,
      verbs: makeVerbs(world(read), CONFIG),
      onClose() {},
      flash() {},
    }),
  "New ad": () =>
    NewAd({
      compose: ads.parseAds("ads:new").compose,
      read,
      config: CONFIG,
      onClose() {},
      onTurnOn: () => true,
      flash() {},
    }),
  "the Results sheet": () => ResultsSheet({ open: true, read, config: CONFIG, onClose() {} }),
  "Reports' lens": () => AdsLens({ fold, onScope() {} }),
  "Connections' card": () => AdAccounts({ flash() {} }),
};

/** Draw with an example kept for the tab: a workspace's page is not about the sample until one is chosen. */
function keeping(example, draw) {
  const kept = "ads-mock-scenario";
  globalThis.sessionStorage.setItem(kept, example);
  try {
    return draw();
  } finally {
    globalThis.sessionStorage.removeItem(kept);
  }
}

for (const [name, draw] of Object.entries(surfaces)) {
  test(`${name} says it is a preview in a workspace, in the words of contracts, and says nothing more in a demo`, () => {
    const note = byTestId(
      keeping("running", () => preview(draw)),
      NOTE,
    );
    assert.ok(note, "the note is drawn");
    assert.equal(textOf(note), `${page.EXAMPLE.preview.word} ${page.EXAMPLE.preview.said}`);
    assert.equal(byTestId(demo(draw), NOTE), null);
  });
}

test("Connections' card says it in the note, which a phone draws, and not in its second line, which a phone does not", () => {
  const sub = (tree) => all(tree, (n) => n.type === "span" && classes(n).includes("rec-card-sub"));
  const card = surfaces["Connections' card"];
  assert.deepEqual(
    sub(keeping("running", () => preview(card))),
    [],
    "REGRESSION: on a phone the sample accounts said Connected, unlabelled",
  );
  assert.equal(textOf(sub(demo(card))[0]), page.CONNECT.sub, "a demo's card keeps its line");
});

// ---------------------------------------------------------------------------------------------------------------------
// Its people open nothing

test("Waiting on you: a demo's names are links to the demo's people; a preview's are names, on a row no press opens", () => {
  const tile = page.adsModel(read, CONFIG).tiles.waiting;
  assert.ok(tile.rows.length > 1, "the sample has people waiting");
  const linked = demo(() => WaitingBlock({ tile }));
  assert.deepEqual(
    links(linked).map((a) => a.props.href),
    tile.rows.map((r) => `#/${r.open}`),
  );
  const plain = preview(() => WaitingBlock({ tile }));
  assert.deepEqual(links(plain), [], "REGRESSION: Amy G. opened 'This person is not in your workspace'");
  assert.deepEqual(
    all(plain, (n) => n.props?.["data-testid"] === "ads-waiting-name").map(textOf),
    tile.rows.map((r) => r.name),
  );
  assert.equal(byTestId(plain, "ads-waiting-door"), null);
  for (const row of all(plain, (n) => n.props?.["data-testid"] === "ads-waiting-row")) {
    assert.equal(all(row, (n) => n.props?.onClick).length, 0, "and nothing on the row waits for a press");
  }
});

test("An ad's people: a demo's rows are links and a door goes to all of them; a preview's rows are rows, and no door promises a list no page holds", () => {
  const vm = page.adModel(
    read.ads.find((a) => a.id === SATURDAY),
    read,
    CONFIG,
  );
  const shown = (tree) => drawn(tree, "ads-person-");
  const linked = demo(() => AdPeople({ people: vm.people }));
  assert.ok(shown(linked).length > 0);
  assert.ok(byTestId(linked, "ads-people-all"), "the door to all of them");
  assert.ok(shown(linked).every((row) => row.type === "a" && row.props.href));
  const plain = preview(() => AdPeople({ people: vm.people }));
  assert.equal(shown(plain).length, shown(linked).length, "the same people");
  assert.deepEqual(links(plain), []);
  assert.equal(byTestId(plain, "ads-people-all"), null);
});

test("A phone's one amber row opens the people who wait: doors with where they go in a demo, names alone in a preview, even for one", () => {
  const vm = page.adsModel(read, CONFIG);
  const props = { vm, ask: null, onOpen() {}, onYes() {}, onNo() {}, arrived: null };
  const opened = (draw) => {
    press(byTestId(draw(), "ads-needs-row"));
    return again(draw);
  };
  const draw = () => AdsPhone(props);
  const doors = (tree) => drawn(tree, "ads-needs-door");
  const names = (tree) => drawn(tree, "ads-needs-name");
  const inDemo = demo(() => opened(draw));
  assert.equal(doors(inDemo).length, vm.tiles.waiting.rows.length);
  assert.equal(names(inDemo).length, 0);
  const inPreview = preview(() => opened(draw));
  assert.equal(doors(inPreview).length, 0);
  assert.equal(names(inPreview).length, vm.tiles.waiting.rows.length);
  for (const [at, row] of vm.tiles.waiting.rows.entries()) {
    assert.ok(textOf(names(inPreview)[at]).startsWith(row.name), row.name);
    assert.ok(!textOf(inPreview).includes(row.tip), "no line says where a press would go");
  }
  // One person is a door in a demo, and in a preview still only a row that opens to their name.
  const one = {
    ...vm,
    tiles: { ...vm.tiles, waiting: { ...vm.tiles.waiting, rows: vm.tiles.waiting.rows.slice(0, 1) } },
  };
  const single = () => AdsPhone({ ...props, vm: one });
  assert.ok(demo(() => byTestId(single(), "ads-needs-row")).props.href, "a demo's single row is a link");
  const alone = preview(() => opened(single));
  assert.equal(byTestId(alone, "ads-needs-row").props.href, undefined);
  assert.equal(names(alone).length, 1);
});

// ---------------------------------------------------------------------------------------------------------------------
// No fact of it joins a real report

/** Reports as useAdsLens reads it, on the clock's today as the sample is. */
const R = { range: "30d", vm: { today: ads.zoneDayKey(Date.now(), "America/New_York") } };
const NOTHING = { head: null, fact: null, draw: null };

test("Reports' Overview takes no fact from a preview, cold or with the Ads already in hand; a preview's Ads lens draws, and a demo's Overview keeps its fact", async () => {
  const ask = (lens) => useAdsLens(lens, {}, R);
  const was = globalThis.__DEMO_MODE;
  setSurfaceValue("settings", { settings: { config: { features: { ads_preview: true } } } });
  try {
    globalThis.__DEMO_MODE = false;
    fresh();
    assert.deepEqual(ask("overview"), NOTHING, "REGRESSION: a sample line among real numbers");
    assert.equal(redrawWanted(), false, "and nothing is on its way for it");
    again(() => ask("ads"));
    await until(redrawWanted, "the lens's chunk to land");
    const lens = again(() => ask("ads"));
    assert.ok(lens.draw, "the lens itself draws");
    assert.ok(lens.head.head);
    assert.equal(lens.fact, null);
    assert.deepEqual(
      again(() => ask("overview")),
      NOTHING,
      "and back on the Overview, with the fold there to be asked, it is not",
    );
    globalThis.__DEMO_MODE = true;
    fresh();
    ask("overview");
    await until(redrawWanted, "the demo's chunk to land");
    assert.ok(again(() => ask("overview")).fact, "the demo's Overview keeps its one fact");
  } finally {
    globalThis.__DEMO_MODE = was;
    setSurfaceValue("settings", undefined);
  }
});

test("Reports' People: a real count of 'An ad' is no door into a preview's sample, which never brought those people; a demo's is", () => {
  globalThis.__WORKSPACES = [{ id: "w1", slug: "harbor", name: "Harbor Studio", status: "active", role: "owner" }];
  globalThis.__ACTIVE_WORKSPACE = "w1";
  const report = reportsSample("30d", TODAY);
  const people = toPeopleReportVM(peopleSample("30d", TODAY).dto);
  const draw = () => PeopleLens({ R: report, own: { state: "current" }, fold: people });
  const onPick = (tree) =>
    find(byTestId(tree, "chart-people-first"), (n) => n.props?.onPick !== undefined)?.props.onPick;
  assert.equal(typeof demo(() => onPick(draw())), "function", "a demo's row opens the demo's Ads");
  setSurfaceValue("settings", { settings: { config: { features: { ads_preview: true } } } });
  try {
    assert.equal(
      preview(() => onPick(draw())),
      null,
      "the tab is on, and the row is still no door",
    );
  } finally {
    setSurfaceValue("settings", undefined);
  }
});
