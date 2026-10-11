/**
 * What the ads brought, in the Results sheet and Reports › Ads (11 Oct 2026): ONE fold (contracts src/ads/results.ts), drawn over
 * the Ads fixtures (surfaces/campaigns/ads) and, for Reports' demo, over the days Reports shows (surfaces/reports/ads-demo.ts).
 * The real code runs, over the built contracts.
 *
 *   the page's numbers   the sheet's four figures, head and rows are the Ads page's own for the same 30 days, to the dollar
 *   a scope              all ads, a platform or one ad narrows every number, and the platforms add back up to the whole
 *   never summed         the platforms' own numbers are a card each; money of two currencies is two sums; Google's calls are
 *                        Google's count and are in no people number
 *   other days           days end yesterday; what is only read for the page's 30 days is a dash with its reason elsewhere
 *   honest               no calendar, too few booked, nothing to report, an ad that is gone: each says so in words
 *   the doors            a scope is an address and back; the Overview's one fact; the demo seam moves the fixtures to today
 */
import { test } from "node:test";
import assert from "node:assert/strict";

const ads = await import("@chanlytics/contracts");
const page = await import("@chanlytics/contracts/ads-page");
const { EXAMPLE_READS } = await import("../../../../apps/dashboard/src/surfaces/campaigns/ads/examples.ts");
const { CONFIG, SPRING, NEAR_ME, SATURDAY, WEEKEND, OLD_BOOST } =
  await import("../../../../apps/dashboard/src/surfaces/campaigns/ads/sample.ts");
const { adsDemoFold, adsDemoFact } = await import("../../../../apps/dashboard/src/surfaces/reports/ads-demo.ts");
const { reportsSample } = await import("../../../../apps/dashboard/src/surfaces/reports/sample.ts");

const ALL = ads.ADS_SCOPE_ALL;
const running = () => EXAMPLE_READS.running();
/** The fold over the page's own 30 days, or over days asked for. */
const fold = (read, scope = ALL, over = {}) =>
  page.adsResultsOf(read, CONFIG, { from: read.window.from, to: read.window.to, scope, ...over });
const platform = (p) => ({ kind: "platform", platform: p });
const one = (id) => ({ kind: "ad", id });
const adOf = (read, id) => read.ads.find((a) => a.id === id);
/** Whole minor units an ad spent, and its people, over days (a table of the daily rows, the way a reader would hold them). */
const rowsIn = (ad, from, to) => ad.days.filter((d) => d.day >= from && d.day <= to);
const sumOf = (xs) => xs.reduce((a, b) => a + b, 0);
const spentMinor = (list, from, to) => sumOf(list.flatMap((ad) => rowsIn(ad, from, to).map((d) => d.spendMinor)));
const peopleIn = (list, from, to, key) =>
  sumOf(list.filter(page.counted).flatMap((ad) => rowsIn(ad, from, to).map((d) => d[key])));

test("the sheet's four figures, head and ad rows are the Ads page's own for the same 30 days, to the dollar, in every example that has ads", () => {
  for (const name of ["running", "needs-you", "finished", "no-calendar", "setting-up", "reading", "failed"]) {
    const read = EXAMPLE_READS[name]();
    const sheet = fold(read);
    const model = page.adsModel(read, CONFIG);
    assert.deepEqual(sheet.figures, model.figures, `${name}: the figures`);
    assert.equal(sheet.head.strong + sheet.head.rest, model.head.strong + model.head.rest, `${name}: the head`);
    assert.deepEqual(
      sheet.byAd,
      model.groups.flatMap((g) => g.rows),
      `${name}: the ad rows are the ledger's`,
    );
    assert.equal(sheet.quiet, model.counted.quiet, `${name}: and the line under the figures`);
  }
  // And the numbers an owner reads, once, so the tie above is not two empty things agreeing.
  const sheet = fold(running());
  assert.equal(sheet.head.strong, "26 of 114");
  assert.equal(sheet.head.rest, " new people from your ads have booked.");
  const [spent, touch, booked, each] = sheet.figures;
  assert.deepEqual(
    [spent.label, touch.label, booked.label, each.label],
    ["Spent", "Got in touch", "Booked", "For each person who booked"],
  );
  assert.equal(touch.value, "114");
  assert.equal(booked.value, "26");
  assert.equal(each.change, "so far", "the last two weeks are still settling");
  assert.equal(sheet.window.days, 30);
  assert.equal(sheet.pane, "11 Sep – 10 Oct · 30 days · read 9:19 AM");
});

test("what came of the appointments is the page's tile and adds up to Booked; with no calendar there is no Booked and no tile", () => {
  const read = running();
  const sheet = fold(read);
  assert.ok("tile" in sheet.cameBack);
  const tile = sheet.cameBack.tile;
  assert.deepEqual(tile, page.tilesOf(read).cameBack, "the page's tile, not a second count");
  assert.equal(
    sumOf(tile.rows.map((r) => r.n)),
    Number(sheet.figures[2].value),
    "ahead + kept + missed + past = Booked",
  );
  assert.equal(sheet.cameBack.title, "What came of the appointments");
  assert.match(tile.unmatched, /^4 appointments couldn't be matched to a person/);
  const none = fold(EXAMPLE_READS["no-calendar"]());
  assert.equal(none.figures[2].value, "—");
  assert.equal(none.figures[2].meta, page.FIGURES.needsLink);
  assert.deepEqual(none.cameBack, { title: "What came of the appointments", why: page.FIGURES.needsLink });
  assert.equal(none.head.rest, " new people got in touch through your ads.", "and the head says only who got in touch");
  assert.equal(none.funnel.find((s) => s.id === "booked").n, null);
  // The workspace's own word for an appointment, never "booking" (the glossary keeps it for the act and the link).
  for (const word of ["appointment", "visit", "meeting", "session", "lesson"]) {
    const bent = { ...read, appointmentWord: word };
    const said = JSON.stringify(fold(bent));
    assert.doesNotMatch(said, /\bbookings?\b/i, `${word}: no booking noun`);
    assert.match(fold(bent).cameBack.title, new RegExp(`^What came of the ${word}s$`));
  }
});

test("a scope narrows every number, and the platforms add back up to the whole", () => {
  const read = running();
  const all = fold(read);
  const { from, to } = read.window;
  const SCOPES = [
    [platform("meta"), read.ads.filter((a) => a.platform === "meta")],
    [platform("google"), read.ads.filter((a) => a.platform === "google")],
    [platform("tiktok"), read.ads.filter((a) => a.platform === "tiktok")],
    [one(SPRING), [adOf(read, SPRING)]],
    [one(SATURDAY), [adOf(read, SATURDAY)]],
  ];
  for (const [scope, list] of SCOPES) {
    const name = ads.adsScopeKey(scope);
    const vm = fold(read, scope);
    assert.equal(vm.empty, null, name);
    assert.deepEqual(vm.byAd.map((r) => r.id).sort(), list.map((a) => a.id).sort(), `${name}: only its ads have a row`);
    assert.equal(vm.totals.spent, page.moneyOf(spentMinor(list, from, to), "USD"), `${name}: what it spent`);
    assert.equal(vm.totals.touch, peopleIn(list, from, to, "inTouch"), `${name}: who got in touch (people only)`);
    assert.equal(vm.totals.booked, peopleIn(list, from, to, "booked"), `${name}: who booked`);
    assert.equal(
      vm.totals.calls,
      sumOf(list.filter((a) => !page.counted(a)).flatMap((a) => rowsIn(a, from, to).map((d) => d.inTouch))),
      `${name}: Google's calls, which are in no people number`,
    );
    // The lanes are the same people, day by day, and the figures are the page's own over just these ads.
    assert.equal(sumOf(vm.days.rows.map((d) => d.inTouch)), vm.totals.touch, `${name}: the lane adds up`);
    assert.equal(sumOf(vm.days.rows.map((d) => d.booked)), vm.totals.booked, `${name}: and so does the booked part`);
    assert.deepEqual(
      vm.figures,
      page.adsModel({ ...read, ads: list }, CONFIG).figures,
      `${name}: the figures are the page's over these ads`,
    );
    assert.equal(vm.scopeKey, name);
  }
  // The three platforms are the whole: nothing is lost in the narrowing, and nothing counted twice.
  const platforms = ["meta", "google", "tiktok"].map((p) => fold(read, platform(p)));
  assert.equal(sumOf(platforms.map((v) => v.totals.touch)), all.totals.touch);
  assert.equal(sumOf(platforms.map((v) => v.totals.booked)), all.totals.booked);
  assert.equal(sumOf(platforms.map((v) => v.totals.calls)), all.totals.calls);
  assert.equal(sumOf(platforms.map((v) => v.byAd.length)), all.byAd.length);
  // One ad's head names it; a platform's names the platform.
  assert.match(fold(read, one(SPRING)).head.rest, /new people from Spring offer have booked\.$/);
  assert.match(fold(read, platform("tiktok")).head.rest, /new people from your TikTok ads have booked\.$/);
  // What came of the appointments is kept for every ad together, so it says so for a part.
  assert.equal(fold(read, platform("meta")).cameBack.why, page.RESULTS.cameBack.forAll);
});

test("Google's calls are Google's count: in Spent, in no people number, and a platform of calls alone says calls", () => {
  const read = running();
  const google = fold(read, platform("google"));
  const calls = sumOf(rowsIn(adOf(read, NEAR_ME), read.window.from, read.window.to).map((d) => d.inTouch));
  assert.equal(google.totals.touch, 0);
  assert.equal(google.totals.calls, calls);
  assert.equal(google.head.strong, String(calls));
  assert.match(
    google.head.rest,
    /^ calls from your Google ads, Google's count\. Calls aren't matched to people yet\.$/,
  );
  assert.equal(google.totals.spentAny, true, "its spend is the owner's money and is in Spent");
  assert.equal(google.funnel, null, "no people, no funnel");
  const row = google.byPlatform[0];
  assert.deepEqual(row.inTouch, { value: String(calls), unit: "calls · Google's count", why: null });
  assert.equal(row.booked.value, "—");
  assert.equal(row.booked.why, page.FIGURES.callsNotMatched);
  const all = fold(read);
  assert.ok(
    all.totals.calls > 0 && !all.head.rest.includes("call"),
    "and the whole's head does not count them as people",
  );
  assert.match(all.days.notes.join(" "), /^.*Google counted aren't in the people chart/);
});

test("the platforms' own numbers are a card each, in their own columns, and never added together", () => {
  const read = running();
  const { cards, why } = fold(read).theirs;
  assert.equal(why, null);
  assert.deepEqual(
    cards.map((c) => c.platform),
    ["meta", "google", "tiktok"],
  );
  assert.deepEqual(
    cards.map((c) => c.title),
    ["Meta's own numbers", "Google's own numbers", "TikTok's own numbers"],
  );
  const by = Object.fromEntries(cards.map((c) => [c.platform, c]));
  assert.deepEqual(by.meta.columns, ["Seen by", "Taps", "Chats started", "Forms sent"]);
  assert.deepEqual(by.google.columns, ["Clicks", "Calls", "Over 60 seconds"]);
  assert.deepEqual(by.tiktok.columns, ["Seen by", "Taps", "Forms sent"]);
  const spring = by.meta.rows.find((r) => r.id === SPRING);
  assert.deepEqual(spring.cells, ["31,500", "1,284", "—", "—"], "what Meta gave, and a dash for what it did not");
  assert.deepEqual(by.google.rows[0].cells, ["214", "41", "38"]);
  assert.deepEqual(by.tiktok.rows[0].cells, ["9,400", "612", "—"]);
  // One row for each started ad, on its own platform's card; an ad in review has none, and no row is a total.
  assert.deepEqual(
    cards.flatMap((c) => c.rows.map((r) => r.id)).sort(),
    read.ads
      .filter(page.started)
      .map((a) => a.id)
      .sort(),
  );
  assert.ok(
    cards.every((c) => c.rows.every((r) => read.ads.some((a) => a.id === r.id))),
    "every row is an ad",
  );
  assert.equal(by.meta.read, "Read 9:19 AM.");
  // The platforms' counts are read for the page's 30 days: any other days say so, and draw no card.
  const other = fold(read, ALL, { from: ads.addDays(read.window.from, 3) });
  assert.deepEqual(other.theirs, { cards: [], why: page.RESULTS.theirs.window });
});

test("money of two currencies is two sums side by side, never converted, and the spend lane is not drawn as one chart", () => {
  const read = running();
  const bent = { ...read, ads: read.ads.map((a) => (a.id === SATURDAY ? { ...a, currency: "GBP" } : a)) };
  const vm = fold(bent);
  assert.match(vm.figures[0].value, /^\$[\d,]+ \+ £[\d,]+$/);
  assert.equal(vm.totals.spent, vm.figures[0].value);
  assert.deepEqual(vm.figures, page.adsModel(bent, CONFIG).figures);
  assert.equal(vm.figures[3].value, "—", "no cost for each person across two currencies");
  assert.equal(vm.days.currency, null);
  assert.ok(vm.days.rows.every((d) => d.spent === null));
  assert.ok(
    vm.days.rows.some((d) => / \+ £/.test(d.spentWords)),
    "each day still says its sums, in each currency",
  );
  assert.ok(vm.days.notes.includes(page.RESULTS.days.severalCurrencies));
  // A scope within one currency is drawn again.
  const metaOnly = fold(bent, platform("meta"));
  assert.equal(metaOnly.days.currency, "USD");
  assert.equal(
    metaOnly.days.rows[0].spent,
    spentMinor([adOf(bent, SPRING), adOf(bent, OLD_BOOST)], read.window.from, read.window.from) / 100,
  );
});

test("days end yesterday, and what is only read for the page's 30 days is a dash with its reason for any other days", () => {
  const read = running();
  const { from, to } = read.window;
  // Days that run to today are read to yesterday: a platform has no today yet.
  const toToday = fold(read, ALL, { to: read.today });
  assert.equal(toToday.window.to, to);
  assert.equal(toToday.window.days, 30);
  assert.deepEqual(toToday.figures, fold(read).figures, "and say the same as the page's own days");
  // Days of a week: every number is of those days.
  const later = ads.addDays(from, 23);
  const week = fold(read, ALL, { from: later });
  assert.equal(week.window.days, 7);
  assert.equal(week.totals.spent, page.moneyOf(spentMinor(read.ads, later, to), "USD"));
  assert.equal(week.totals.touch, peopleIn(read.ads, later, to, "inTouch"));
  assert.equal(week.days.rows.length, 7);
  assert.equal(week.days.rows[0].day, later);
  assert.deepEqual(week.cameBack, {
    title: "What came of the appointments",
    why: "Counted for the last 30 days, so it isn't shown for other days.",
  });
  assert.deepEqual(
    week.funnel.map((s) => [s.id, s.n]),
    [
      ["touch", week.totals.touch],
      ["reply", null],
      ["booked", week.totals.booked],
    ],
    "the first reply is read for 30 days: a dash, not a share of them",
  );
  assert.equal(week.funnel[1].why, page.RESULTS.funnel.replyWindow);
  // The page's own days have the reply, and it is of the people who wrote, never more than got in touch.
  const full = fold(read).funnel;
  assert.deepEqual(
    full.map((s) => s.id),
    ["touch", "reply", "booked"],
  );
  assert.equal(full[1].n, adOf(read, SPRING).reply.n);
  assert.ok(full[1].n <= full[0].n);
  // Days before any ad, or after the days there are, have nothing to say, in the lens registry's words.
  const quiet = fold(read, ALL, { from: "2026-01-01", to: "2026-01-10" });
  assert.deepEqual(
    { title: quiet.empty.title, body: quiet.empty.body },
    {
      title: "No ads in this period",
      body: "Nothing was spent on ads, and nobody got in touch through one, between 1 Jan and 10 Jan.",
    },
  );
  assert.equal(quiet.head, null);
  assert.deepEqual([quiet.figures, quiet.byAd, quiet.byPlatform, quiet.days, quiet.funnel], [[], [], [], null, null]);
});

test("a cost is a dash under five booked and says how few; no ads, an ad that is gone and nothing counted each say so", () => {
  const read = running();
  const saturday = fold(read, one(SATURDAY));
  assert.equal(saturday.totals.booked, 3);
  assert.equal(saturday.figures[3].value, "—");
  assert.equal(saturday.figures[3].n, 3, "the count it is of, so the figure greys and says only 3");
  assert.equal(saturday.byAd[0].each.unit, "only 3");
  assert.equal(saturday.byPlatform[0].each.unit, "only 3");
  assert.equal(saturday.byPlatform[0].each.why, "too few to read a cost");
  // An ad the read does not have.
  const gone = fold(read, one("0000"));
  assert.deepEqual(
    { title: gone.empty.title, body: gone.empty.body },
    { title: "This ad isn't here any more", body: "It may have been ended and cleared away." },
  );
  assert.equal(gone.head, null);
  // No ad at all.
  for (const name of ["no-ads", "choose", "v0"]) {
    const vm = fold(EXAMPLE_READS[name]());
    assert.equal(vm.empty.title, "No ads yet", name);
    assert.deepEqual(vm.byAd, [], name);
  }
  // A platform with no ad of its own: nothing to report for it.
  const noTikTok = fold({ ...read, ads: read.ads.filter((a) => a.platform !== "tiktok") }, platform("tiktok"));
  assert.equal(noTikTok.empty.title, "No ads in this period");
  // An ad still in review has been sent, not run: its row is dashes and says why.
  const weekend = fold(read, one(WEEKEND));
  assert.equal(weekend.empty?.title, "No ads in this period", "nothing is spent until a platform approves it");
});

test("the scope list is every ad, each platform that has an ad, then each ad; a key is the word the address spells", () => {
  const read = running();
  const { scopes } = fold(read);
  assert.deepEqual(
    scopes.map((s) => s.kind),
    ["all", "platform", "platform", "platform", ...read.ads.map(() => "ad")],
  );
  assert.deepEqual(
    scopes.slice(0, 4).map((s) => s.label),
    ["All ads", "Facebook and Instagram", "Google", "TikTok"],
  );
  assert.deepEqual(
    scopes.slice(4).map((s) => s.label),
    read.ads.map((a) => a.name),
  );
  for (const s of scopes) {
    assert.deepEqual(ads.adsScopeOfKey(s.key), s.scope, s.key);
    assert.equal(ads.adsScopeKey(ads.adsScopeOfKey(s.key)), s.key);
  }
  for (const no of ["", "platform:", "platform:bing", "ad:", "ads", "platform:meta:x:y"]) {
    const at = ads.adsScopeOfKey(no);
    assert.ok(at === null || at.kind === "ad" || at.kind === "platform", no);
  }
  assert.equal(ads.adsScopeOfKey("platform:bing"), null);
  assert.equal(ads.adsScopeOfKey("ad:"), null);
  // A platform that has no ad is not offered (the choose example has none).
  assert.deepEqual(
    fold(EXAMPLE_READS.choose()).scopes.map((s) => s.kind),
    ["all"],
  );
  // The sheet's foot opens the full report over the same days and scope.
  const meta = fold(read, platform("meta"));
  assert.equal(
    ads.adsReportRoute({ from: meta.window.from, to: meta.window.to }, meta.scope),
    "reports/ads:2026-09-11~2026-10-10:platform:meta",
  );
});

test("the Overview's one fact says what the ads brought over the same days, with its door; the facts it joins are unchanged where there are no ads", () => {
  const read = running();
  const vm = fold(read);
  assert.deepEqual(page.adsFactOf(vm), {
    text: "Your ads brought 114 new people",
    sub: `26 have booked · ${vm.totals.spent} spent`,
  });
  const fact = adsDemoFact(vm);
  assert.deepEqual(
    { id: fact.id, tone: fact.tone, icon: fact.icon, door: fact.door },
    { id: "ads", tone: "", icon: "users", door: { label: "Open Ads", to: "campaigns/ads" } },
  );
  assert.equal(
    adsDemoFact(fold(read, ALL, { from: "2026-01-01", to: "2026-01-10" })),
    null,
    "nothing to say, nothing said",
  );
  // Spent and nobody new: said as that, never "0 new people".
  const quietStart = {
    ...read,
    ads: [{ ...adOf(read, SATURDAY), days: adOf(read, SATURDAY).days.map((d) => ({ ...d, inTouch: 0, booked: 0 })) }],
  };
  assert.equal(page.adsFactOf(fold(quietStart)).text, "Your ads haven't brought anyone new yet");
  // It is the third of Worth knowing, after the two that most need an owner, and only when handed in.
  const R = reportsSample("30d", "2026-10-11");
  const plain = ads.reportFacts(R.vm, null);
  const withAds = ads.reportFacts(R.vm, null, fact);
  assert.deepEqual(withAds, [...plain.slice(0, 2), fact]);
  assert.ok(withAds.length <= 3);
  assert.deepEqual(ads.reportFacts(R.vm, null, null), plain, "a workspace without ads reads the facts it always did");
});

test("the demo seam moves the fixtures to the business's today and reads Reports' days as ads end: yesterday", () => {
  const read = running();
  const sheet = fold(read);
  // Days a member picked are read as picked: the sheet's own 30 days are the lens's, to the dollar.
  const picked = adsDemoFold({ from: read.window.from, to: read.window.to }, ALL, read.today);
  assert.deepEqual(picked.figures, sheet.figures);
  assert.deepEqual(picked.byAd, sheet.byAd);
  assert.deepEqual(picked.cameBack, sheet.cameBack);
  assert.equal(picked.pane, sheet.pane);
  // A period by name ends today: the same number of days, ending yesterday, which are the page's 30.
  const thirty = adsDemoFold("30d", ALL, read.today);
  assert.deepEqual(thirty.window, sheet.window);
  assert.deepEqual(thirty.figures, sheet.figures);
  assert.equal(adsDemoFold("7d", ALL, read.today).window.days, 7);
  assert.equal(adsDemoFold("7d", ALL, read.today).window.to, read.window.to);
  // On any other day the fixtures are moved with it: the same numbers over the same number of days.
  const later = adsDemoFold("30d", ALL, "2027-02-03");
  assert.deepEqual(later.window, { from: "2027-01-04", to: "2027-02-02", days: 30 });
  assert.deepEqual(later.figures, sheet.figures);
  assert.deepEqual(later.theirs, sheet.theirs);
  // And a scope narrows it as it does the sheet.
  assert.equal(
    adsDemoFold("30d", platform("meta"), read.today).totals.spent,
    fold(read, platform("meta")).totals.spent,
  );
});
