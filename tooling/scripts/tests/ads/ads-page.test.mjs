/**
 * The Ads page, every state it can be in (11 Oct 2026): the one model over each example fixture, the demo store's verbs for the
 * Ask line and for choosing an account, and the ledger's keys. The model is contracts' (src/ads/page.ts, page-parts.ts), the
 * fixtures and the store the dashboard's (surfaces/campaigns/ads); the real code runs.
 *
 *   needs-you    amber rows with the cause in words, the Ask line proposes the fix; a price that changed leaves the ad on
 *   finished     ended and finished rows keep their second lines; the figures still count them
 *   no-calendar  Booked is a dash with its reason and a door to where the link is added
 *   setting-up   "Setting up" and "Couldn't finish" in amber, and the choice of grouping from seven ads
 *   no-ads       the first ad's card is stopped by the payment need, with the door that mends it
 *   choose       the account to choose lists its choices with the currency; choosing makes it the connected one
 *   reading      the pane says it, spend and the cost wait as dashes, people are still counted
 *   failed       a line says it could not be read, as of when; the platform's rows hold their last numbers
 *   doors        a waiting person opens their conversation, else their page; the phone says who by name
 *   ask          the platform's rules: TikTok's 30%, Google's 90 days; a move changes both ads and Undo puts them back
 *   keys         a ledger with no search leaves "/" to the page
 */
import { test } from "node:test";
import assert from "node:assert/strict";

const page = await import("@chanlytics/contracts/ads-page");
const { EXAMPLE_READS, withAccount } =
  await import("../../../../apps/dashboard/src/surfaces/campaigns/ads/examples.ts");
const { CONFIG, SPRING, NEAR_ME, SATURDAY, WEEKEND, OLD_BOOST, dailyRows, NEAR_ME_ROWS } =
  await import("../../../../apps/dashboard/src/surfaces/campaigns/ads/sample.ts");
const { makeVerbs } = await import("../../../../apps/dashboard/src/surfaces/campaigns/ads/store.ts");
const keys = await import("../../../../apps/dashboard/src/surfaces/campaigns/parts/ledger-keys.ts");

const model = (example, by) => page.adsModel(EXAMPLE_READS[example](), CONFIG, by);
const rowsOf = (vm) => vm.groups.flatMap((g) => g.rows);
const rowOf = (vm, id) => rowsOf(vm).find((r) => r.id === id);
const world = (read) => {
  const w = { read, get: () => w.read, put: (next) => (w.read = next) };
  return w;
};

test("needs-you: amber rows say what is wrong, the Ask line proposes the fix, a price that changed leaves the ad on", () => {
  const vm = model("needs-you");
  const spring = rowOf(vm, SPRING);
  assert.deepEqual([spring.state.word, spring.state.tone], ["Needs you", "warn"]);
  assert.equal(spring.state.second, "Add a payment method in Meta", "payment, in the words that mend it");
  assert.equal(rowOf(vm, WEEKEND).state.second, "Meta turned it down");
  assert.equal(rowOf(vm, SATURDAY).state.second, "Paused in TikTok, not here");
  // The price that changed does not stop the ad: it is still On, and says so where it would say when it ends.
  const near = rowOf(vm, NEAR_ME);
  assert.deepEqual([near.state.word, near.state.tone, near.alert], ["On", "ok", true]);
  assert.equal(near.state.second, "Your price changed in Services");
  assert.equal(rowOf(model("running"), NEAR_ME).alert, false);
  // The proposal says why, by the code, and its press opens the ad.
  assert.equal(vm.ask?.kind, "fix");
  assert.equal(vm.ask?.text, "Spring offer stopped: Meta couldn't charge your card.");
  assert.equal(vm.ask?.press, "Fix it");
  assert.equal(vm.ask?.apply, null, "a fix changes nothing here: it opens the ad");
  // TikTok's post permission runs out in three days: its standing is amber.
  const tiktok = vm.standing.find((s) => s.id === "tiktok");
  assert.equal(tiktok?.state, "warn");
  assert.ok(tiktok?.rows.some((r) => r.tone === "warn" && /Post permission runs to Wed 14 Oct/.test(r.text)));
});

test("finished: ended and finished rows keep their second lines, and the figures still count them within the window", () => {
  const vm = model("finished");
  const spring = rowOf(vm, SPRING);
  assert.equal(spring.state.word, "Ended");
  assert.match(spring.state.second, /^Ended Fri 9 Oct · \d+ booked, \$\d+ each$/);
  const near = rowOf(vm, NEAR_ME);
  assert.deepEqual([near.state.word, near.state.second], ["Finished", "Spent its $94"]);
  const read = EXAMPLE_READS.finished();
  const spent = read.ads
    .flatMap((ad) => ad.days.filter((d) => d.day >= read.window.from && d.day <= read.window.to))
    .reduce((all, d) => all + d.spendMinor, 0);
  assert.equal(vm.figures[0].value, page.moneyOf(spent, "USD"), "Spent counts the ended ads' days");
  // They come last in their group, after what is on.
  const whatsapp = vm.groups.find((g) => g.key === "whatsapp");
  assert.equal(whatsapp?.rows.at(-1)?.state.word === "Paused" || whatsapp?.rows.at(-1)?.state.word === "Ended", true);
});

test("no-calendar: Booked is a dash that says why, with a door to where the link is added; the cost falls back to people in touch", () => {
  const vm = model("no-calendar");
  const booked = vm.figures.find((f) => f.id === "booked");
  assert.equal(booked?.value, "—");
  assert.equal(booked?.meta, page.FIGURES.needsLink);
  assert.deepEqual(vm.link, { words: "Open Settings › Business", to: "admin/workspace/calendar" });
  assert.equal(vm.figures.find((f) => f.id === "each")?.label, "For each person in touch");
  const spring = rowOf(vm, SPRING);
  assert.deepEqual([spring.booked.value, spring.each.value], ["—", "—"]);
  assert.equal(spring.booked.why, page.FIGURES.needsLink);
  assert.equal(model("running").link, null, "a linked calendar needs no door");
  // What came back says the same, and draws no zero: it is not a count where no calendar can say who booked.
  assert.deepEqual([vm.tiles?.cameBack.linked, vm.tiles?.cameBack.rows, vm.tiles?.cameBack.line], [false, [], null]);
  assert.equal(vm.tiles?.cameBack.nudge, page.FIGURES.needsLink);
  assert.equal(model("running").tiles?.cameBack.linked, true);
});

test("setting-up: Setting up, and Couldn't finish in amber with where it stands; seven ads offer how to group them", () => {
  const vm = model("setting-up");
  const making = rowsOf(vm).find((r) => r.name === "First appointment · 12 Oct");
  assert.deepEqual([making?.state.word, making?.state.tone], ["Setting up", "plain"]);
  const stuck = rowsOf(vm).find((r) => r.name === "Call ad · 12 Oct");
  assert.deepEqual([stuck?.state.word, stuck?.state.tone], ["Couldn't finish", "warn"]);
  assert.equal(stuck?.state.second, "Paused on Google · nothing spent");
  assert.equal(rowsOf(vm).length, 7);
  assert.deepEqual(
    vm.groupBy,
    {
      label: "Group",
      value: "door",
      options: [
        { value: "door", label: "By what they ask" },
        { value: "platform", label: "By platform" },
      ],
    },
    "the choice is offered from seven ads",
  );
  assert.equal(model("running").groupBy, null, "five ads need no choice");
  // By platform: the same ads under the platform they run on, in a plain glyph and the platform's own words.
  const byPlatform = model("setting-up", "platform");
  assert.deepEqual(
    byPlatform.groups.map((g) => [g.key, g.caps, g.rows.length]),
    [
      ["meta", "Facebook and Instagram", 4],
      ["google", "Google", 2],
      ["tiktok", "TikTok", 1],
    ],
  );
  assert.equal(byPlatform.groupBy?.value, "platform");
  assert.equal(rowsOf(byPlatform).length, 7);
  // Below seven the choice is not honoured: the ads stay grouped by what they ask.
  assert.deepEqual(
    model("running", "platform").groups.map((g) => g.key),
    ["whatsapp", "call", "form"],
  );
});

test("an ad the owner made on the platform itself says where in its hint", () => {
  const vm = model("running");
  assert.match(rowOf(vm, OLD_BOOST).hint, /^Made in Meta Ads Manager · about \$4 a day · since 16 Sep$/);
  assert.match(rowOf(vm, OLD_BOOST).phone.line, /^Made in Meta Ads Manager · WhatsApp$/);
  assert.match(rowOf(vm, SPRING).hint, /^Facebook and Instagram · about \$15 a day/);
});

test("no-ads: the first ad's card waits on the payment need, with the door that mends it", () => {
  const vm = model("no-ads");
  assert.equal(vm.mode, "none");
  assert.deepEqual(vm.noAds?.blocked, {
    text: "Add a payment method in Meta to set up your first ad",
    door: { words: "Open Settings › Connections", to: "admin/integrations" },
  });
  assert.equal(vm.noAds?.checklist.find((r) => r.tone === "warn")?.text, "Payment method in Meta");
  assert.deepEqual(vm.noAds?.choose, []);
});

test("choose: the card lists the choices with their currency, and choosing makes the account the connected one", () => {
  const w = world(EXAMPLE_READS.choose());
  const before = page.adsModel(w.read, CONFIG);
  assert.equal(before.noAds?.choose.length, 1);
  const card = before.noAds?.choose[0];
  assert.equal(card?.title, "Choose your Meta ad account");
  assert.deepEqual(
    card?.choices.map((c) => c.label),
    ["Harbor Studio ad account · USD", "Harbor Studio second account · USD", "Harbor Studio UK · GBP"],
  );
  assert.equal(before.standing.find((s) => s.id === "meta")?.word, "Choose an account");
  const verbs = makeVerbs(w, CONFIG);
  assert.equal(verbs.chooseAccount("meta", "nope").ok, false, "an account that is not on the list is refused");
  const uk = card?.choices.find((c) => c.label.endsWith("GBP"));
  const out = verbs.chooseAccount("meta", uk?.externalId ?? "");
  assert.equal(out.ok, true);
  const meta = w.read.accounts.find((a) => a.platform === "meta");
  assert.deepEqual([meta?.status, meta?.name, meta?.currency], ["connected", "Harbor Studio UK", "GBP"]);
  // The page moves on to the first ad's card, in the account's currency, stopped by the payment method.
  const after = page.adsModel(w.read, CONFIG);
  assert.deepEqual(after.noAds?.choose, []);
  assert.match(after.noAds?.line ?? "", /£10 a day for 7 days · up to £70$/);
  assert.match(after.noAds?.blocked?.text ?? "", /Add a payment method in Meta/);
  out.undo();
  assert.equal(w.read.accounts.find((a) => a.platform === "meta")?.status, "choose", "Undo puts the choice back");
});

test("reading: the pane says it, spend and the cost wait as dashes with their reason, people are still counted", () => {
  const vm = model("reading");
  assert.equal(vm.pane, "Reading Meta and Google…");
  assert.equal(vm.reading, true);
  const fig = (id) => vm.figures.find((f) => f.id === id);
  assert.deepEqual([fig("spent").value, fig("spent").meta], ["—", "reading Meta and Google"]);
  // The cost for each person is of the ads Chanlytics counts: a Google ad's calls are not in it, so only Meta is waited on.
  assert.deepEqual([fig("each").value, fig("each").meta], ["—", "reading Meta"]);
  assert.equal(fig("touch").value, "114", "people are Chanlytics' own count: not waiting");
  assert.equal(fig("booked").value, "26");
  // The ledger: a reading platform's spend is a dash that says so; the other platform's is a number.
  const spring = rowOf(vm, SPRING);
  assert.deepEqual([spring.spent.value, spring.spent.unit, spring.spent.why], ["—", "reading", "Reading Meta now."]);
  assert.equal(spring.booked.value, "23");
  assert.equal(rowOf(vm, SATURDAY).spent.value, "$148", "TikTok is not being read");
  // A Google ad's calls are Google's count: they wait with Google.
  assert.equal(rowOf(vm, NEAR_ME).inTouch.value, "—");
  assert.equal(vm.tiles?.coming.total, "Reading what is left to spend");
  assert.equal(vm.ask, null, "no extension is proposed on a spend that is not read");
  assert.match(vm.counted?.quiet ?? "", /appear as each platform is read/);
  // Never a zero: no cell of a reading platform says 0.
  for (const row of rowsOf(vm).filter((r) => r.id === SPRING || r.id === NEAR_ME)) {
    assert.notEqual(row.spent.value, "$0");
  }
});

test("failed: a line says it could not be read and as of when; that platform's rows hold their last numbers", () => {
  const vm = model("failed");
  assert.deepEqual(vm.failed, [
    { platform: "meta", line: "Meta's numbers could not be read · as of Sat 6 PM", again: "Try again" },
  ]);
  const spring = rowOf(vm, SPRING);
  assert.deepEqual(
    [spring.spent.value, spring.spent.unit],
    ["$412", "as of Sat 6 PM"],
    "its last numbers, said as of when",
  );
  assert.equal(spring.phone.line, "Facebook and Instagram · WhatsApp · as of Sat 6 PM");
  assert.equal(rowOf(vm, SATURDAY).spent.unit, null, "TikTok was read");
  const meta = vm.standing.find((s) => s.id === "meta");
  assert.deepEqual([meta?.state, meta?.word], ["warn", "Could not be read"]);
  assert.match(vm.figures[0].meta ?? "", /^across 4 ads · Meta as of Sat 6 PM$/);
  // Read again: the failed line goes with the failure.
  const read = withAccount(EXAMPLE_READS.failed(), "meta", { read: "ok" });
  assert.deepEqual(page.adsModel(read, CONFIG).failed, []);
  assert.deepEqual(model("running").failed, []);
});

test("doors: a waiting person opens their conversation, else their page; the phone says who waits by name and the longest wait", () => {
  const vm = model("running");
  const waiting = vm.tiles?.waiting.rows ?? [];
  const jordan = waiting.find((r) => r.name === "Jordan P.");
  const amy = waiting.find((r) => r.name === "Amy G.");
  assert.deepEqual([jordan?.open, jordan?.tip], ["inbox/th-jordan-discount", "Open the conversation"]);
  assert.deepEqual([amy?.open, amy?.tip], ["clients/c-amy", "Open their page"], "no conversation: their page");
  assert.deepEqual(
    [vm.phone?.needs, vm.phone?.names, vm.phone?.since],
    ["2 people from your ads are waiting on you", "Jordan P. · Amy G.", "6 days"],
  );
  assert.equal(page.PHONE.names(["A", "B", "C", "D"]), "A · B · 2 more");
});

test("the counted popover says how long it is kept, and calls are Google's count", () => {
  const items = model("running").counted?.items.map((i) => i.text) ?? [];
  assert.ok(items.some((t) => /25 months/.test(t) && /90 days/.test(t)));
  assert.ok(items.some((t) => /^Calls are Google's count/.test(t)));
});

test("ask: a TikTok total changes by at most 30% at a time, Google's covers at most 90 days", () => {
  // A TikTok ad that ends tomorrow with enough booked: the extension is cut to what 30% allows.
  const read = EXAMPLE_READS.running();
  const tiktok = {
    ...read.ads.find((ad) => ad.id === SATURDAY),
    endDay: "2026-10-12",
    days: dailyRows("2026-10-05", [
      [23, 4, 3],
      [26, 4, 3],
      [25, 4, 3],
      [24, 4, 3],
      [27, 4, 3],
      [23, 4, 3],
    ]),
  };
  const withTikTok = { ...read, ads: [tiktok] };
  const ask = page.adsModel(withTikTok, CONFIG).ask;
  assert.equal(ask?.kind, "extend");
  const total = tiktok.budget.amountMinor;
  assert.equal(ask?.apply?.kind, "extend");
  const raised = ask?.apply?.kind === "extend" ? ask.apply.totalMinor : 0;
  assert.ok(raised > total && raised <= total * 1.3, `TikTok: ${raised} is at most 30% over ${total}`);
  assert.equal(raised, total + tiktok.aboutADayMinor * 4, "4 days of $25 is the most 30% of $350 allows");
  // Google: a 30-day total may be extended by 30 days (60 of the 90), but not past the 90.
  const near = read.ads.find((ad) => ad.id === NEAR_ME);
  const long = { ...near, startDay: "2026-07-20", days: dailyRows("2026-09-13", NEAR_ME_ROWS) };
  const longAsk = page.adsModel({ ...read, ads: [long] }, CONFIG).ask;
  assert.equal(longAsk?.kind, "extend");
  const end = longAsk?.apply?.kind === "extend" ? longAsk.apply.endDay : "";
  assert.ok(
    page.dayWord(end) &&
      (Date.parse(`${end}T12:00:00Z`) - Date.parse(`${long.startDay}T12:00:00Z`)) / 86_400_000 + 1 <= 90,
    "Google's total covers at most 90 days",
  );
  // A Google ad already at 90 days is not offered more.
  const full = { ...long, startDay: "2026-07-14" };
  assert.equal(page.adsModel({ ...read, ads: [full] }, CONFIG).ask, null);
});

test("ask: a move changes both ads by the step, says nothing it did not do, and Undo puts both back", () => {
  const read = EXAMPLE_READS.running();
  const spring = read.ads.find((ad) => ad.id === SPRING);
  const dear = {
    ...spring,
    id: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
    name: "Spring offer, second",
    days: spring.days.map((d) => ({ ...d, spendMinor: d.spendMinor * 2 })),
  };
  const w = world({ ...read, ads: [spring, dear] });
  const ask = page.adsModel(w.read, CONFIG).ask;
  assert.equal(ask?.kind, "move");
  assert.equal(ask?.apply?.kind, "move");
  const verbs = makeVerbs(w, CONFIG);
  const before = w.read.ads.map((a) => [a.id, a.aboutADayMinor, a.budget.amountMinor]);
  const out = verbs.answerAsk(ask);
  assert.equal(out.ok, true);
  const now = (id) => w.read.ads.find((a) => a.id === id);
  assert.equal(now(spring.id).aboutADayMinor, spring.aboutADayMinor + 500, "the cheaper ad gets the step");
  assert.equal(now(dear.id).aboutADayMinor, dear.aboutADayMinor - 500, "the dearer ad gives it");
  assert.equal(
    now(spring.id).budget.amountMinor - spring.budget.amountMinor,
    spring.budget.amountMinor - now(dear.id).budget.amountMinor,
    "the money moved is the same from one to the other",
  );
  assert.equal(now(spring.id).budgetChangedDay, "2026-10-11", "an amount that moved keeps the day, for TikTok's wait");
  out.undo();
  assert.deepEqual(
    w.read.ads.map((a) => [a.id, a.aboutADayMinor, a.budget.amountMinor]),
    before,
    "Undo puts both ads back",
  );
  // TikTok's rule: a step of $5 is more than 30% of a $10 day, so no move is proposed on it.
  const small = { ...dear, platform: "tiktok", aboutADayMinor: 1000 };
  assert.equal(page.adsModel({ ...read, ads: [spring, small] }, CONFIG).ask, null);
});

test("an amount that changes keeps the day it did; a change of anything else does not", () => {
  const w = world(EXAMPLE_READS.running());
  const verbs = makeVerbs(w, CONFIG);
  const ad = () => w.read.ads.find((x) => x.id === SATURDAY);
  assert.equal(ad().budgetChangedDay, "2026-10-10", "the running example's TikTok amount changed yesterday");
  assert.equal(verbs.rename(SATURDAY, ad().version, "Saturday reel").ok, true);
  assert.equal(ad().budgetChangedDay, "2026-10-10");
  const out = verbs.setBudget(SATURDAY, ad().version, 40000);
  assert.equal(out.ok, true);
  assert.equal(ad().budgetChangedDay, "2026-10-11");
  out.undo();
  assert.equal(ad().budgetChangedDay, "2026-10-10", "Undo puts the day back with the amount");
  assert.equal(verbs.save(SATURDAY, ad().version, { amountMinor: 38000 }).ok, true);
  assert.equal(ad().budgetChangedDay, "2026-10-11");
});

test("keys: a ledger with no search leaves '/' to the page; one with a search still takes it", () => {
  const press = (k) => ({
    key: k,
    target: { nodeType: 1, tagName: "DIV", closest: () => null, getAttribute: () => null },
    defaultPrevented: false,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    repeat: false,
    prevented: false,
    preventDefault() {
      this.prevented = true;
    },
  });
  globalThis.document = { querySelector: () => null, activeElement: null };
  try {
    const did = [];
    const doors = {
      ids: ["a", "b"],
      cursor: null,
      move: (step) => did.push(["move", step]),
      open: (id) => did.push(["open", id]),
      narrowed: false,
      clearOne: () => did.push(["clear"]),
      sheetOpen: false,
    };
    const slash = press("/");
    keys.onLedgerKey(doors, slash);
    assert.equal(slash.prevented, false, "Ads has no search: '/' is not taken from the page");
    keys.onLedgerKey(doors, press("j"));
    keys.onLedgerKey({ ...doors, cursor: "b" }, press("Enter"));
    assert.deepEqual(did, [
      ["move", 1],
      ["open", "b"],
    ]);
    const withSearch = press("/");
    keys.onLedgerKey({ ...doors, focusSearch: () => did.push(["search"]) }, withSearch);
    assert.equal(withSearch.prevented, true);
    assert.deepEqual(did.at(-1), ["search"]);
  } finally {
    delete globalThis.document;
  }
});
