/**
 * An ad's drawer (11 Oct 2026): every state it can be in, the lists a tapped word opens, and where its rows go. The model is
 * contracts' (src/ads: drawer.ts, drawer-parts.ts, drawer-edit.ts), the fixtures are the dashboard's (surfaces/campaigns/ads);
 * the real code runs, over the built contracts.
 *
 *   needs you   a turned-down ad quotes the platform's own words and names the platform; a card, a price, a lapse say theirs
 *   adopted     an ad made on the platform itself has no Edit, a plain sentence's flag, and one line saying where it was made
 *   amounts     TikTok takes no step beyond 30% and none within 2 days of the last; Google's daily amount is an average
 *   a raise     Edit's foot names the most a raise can spend, and its primary says it; lowering is plain Save changes
 *   ends        every end date says what it does to a day; Google's list stops at 90 days with the reason
 *   areas       TikTok's area is ZIP codes: a chip hands them back whole, and a mistake is said in words
 *   numbers     the platform's own numbers by name, never summed; what people typed on Google; the reach line from the data
 *   doors       a row goes to the conversation that waits on the owner, else the person; the report is this ad's
 */
import { test } from "node:test";
import assert from "node:assert/strict";

const ads = await import("@chanlytics/contracts");
const page = await import("@chanlytics/contracts/ads-page");
const { EXAMPLE_READS } = await import("../../../../apps/dashboard/src/surfaces/campaigns/ads/examples.ts");
const { CONFIG, SPRING, NEAR_ME, SATURDAY, WEEKEND, OLD_BOOST } =
  await import("../../../../apps/dashboard/src/surfaces/campaigns/ads/sample.ts");

const running = () => EXAMPLE_READS.running();
const adOf = (read, id) => {
  const ad = read.ads.find((a) => a.id === id);
  assert.ok(ad, `the example has ${id}`);
  return ad;
};
const drawerOf = (read, id, saved) => page.adModel(adOf(read, id), read, CONFIG, saved);
/** The ad, bent: a clone with fields changed. */
const bent = (ad, patch) => ({ ...ad, ...patch });

test("a turned-down ad quotes the platform's own words and names the platform that turned it down", () => {
  const read = EXAMPLE_READS["needs-you"]();
  const weekend = drawerOf(read, WEEKEND);
  assert.equal(weekend.callout.tone, "warn");
  assert.equal(weekend.callout.text, "Meta turned this ad down: “Ads can't make health claims about results”");
  assert.deepEqual(
    weekend.callout.acts.map((a) => [a.id, a.label]),
    [
      ["fix", "Fix it"],
      ["again", "Ask Meta to look again"],
      ["fresh", "Make a new one"],
    ],
  );
  assert.equal(weekend.callout.acts.find((a) => a.id === "again")?.done, "Asked Meta", "said once, and it rests");
  assert.equal(weekend.go.copy, `campaigns/ads:new:copy:${WEEKEND}`, "Make a new one starts from the ad");
  // Never a hard-coded Meta: the same ad on Google and on TikTok names its own platform.
  for (const [platform, owner] of [
    ["google", "Google"],
    ["tiktok", "TikTok"],
  ]) {
    const other = page.adModel(bent(adOf(read, WEEKEND), { platform }), read, CONFIG);
    assert.match(other.callout.text, new RegExp(`^${owner} turned this ad down: “`));
    assert.equal(other.callout.acts[1].label, `Ask ${owner} to look again`);
  }
  assert.match(
    page.CHANGED.asked({ owner: "Meta", within: "usually within a day" }),
    /^Asked Meta to look again\. Usually within a day\.$/,
  );
});

test("a card, a paused ad, a changed price and a lapsing permission each say their own thing, with their own press", () => {
  const read = EXAMPLE_READS["needs-you"]();
  const card = drawerOf(read, SPRING);
  assert.match(card.callout.text, /^Meta couldn't charge your card\./);
  assert.deepEqual(card.callout.door, { words: "Open Settings › Connections", to: "admin/integrations" });
  for (const [platform, said] of [
    ["google", /^Add a card in Google Ads so your ad can run\./],
    ["tiktok", /^Add balance in TikTok so your ad can run\./],
  ]) {
    assert.match(page.adModel(bent(adOf(read, SPRING), { platform }), read, CONFIG).callout.text, said);
    // The step is the account's own check's, not retyped.
    assert.ok(
      page
        .adModel(bent(adOf(read, SPRING), { platform }), read, CONFIG)
        .callout.text.startsWith(page.checkFix("payment", platform)),
    );
  }

  const paused = drawerOf(read, SATURDAY);
  assert.equal(paused.callout.text, "Paused in TikTok, not here. Turn it back on?");
  assert.deepEqual(
    paused.callout.acts.map((a) => a.id),
    ["resume"],
  );
  assert.equal(paused.mode, "paused");
  assert.deepEqual(paused.foot, ["resume", "edit"], "paused on the platform, so it is Resume that stands in the foot");

  const price = drawerOf(read, NEAR_ME);
  assert.equal(price.callout.text, "Your price changed in Services: the ad says from $45, Services now say from $50.");
  assert.deepEqual(
    price.callout.acts.map((a) => a.id),
    ["update"],
  );
  assert.match(
    price.confirm.update,
    /goes back to Google for checking, usually within a business day\.$/,
    "it says it goes to review",
  );

  // TikTok's permission to use a post lapses on the account: an ad made of that post says so a week before it does.
  const lapsing = EXAMPLE_READS.running();
  lapsing.accounts = lapsing.accounts.map((a) => (a.platform === "tiktok" ? { ...a, permissionEnd: "2026-10-14" } : a));
  const saturday = drawerOf(lapsing, SATURDAY);
  assert.equal(saturday.callout.text, "TikTok's permission to use this post ends Wed 14 Oct.");
  assert.deepEqual(saturday.callout.door, { words: "Renew in Settings › Connections", to: "admin/integrations" });
  const named = bent(adOf(lapsing, SATURDAY), {
    needs: { code: "permission-lapsing", platformWords: null, was: null, now: null },
  });
  assert.equal(
    page.adModel(named, lapsing, CONFIG).callout.text,
    saturday.callout.text,
    "stored or derived, the same words",
  );
});

test("an ad being made, and one that could not be made, say what was made and offer the two ways on", () => {
  const read = EXAMPLE_READS["setting-up"]();
  const making = read.ads.find((a) => a.state === "setting-up");
  const stuck = read.ads.find((a) => a.state === "couldnt-finish");
  const m = page.adModel(making, read, CONFIG);
  assert.equal(m.callout.text, "Setting it up on Meta, paused. This takes a minute.");
  assert.deepEqual(m.callout.acts, []);
  assert.deepEqual(m.foot, [], "nothing to press while it is made");
  const s = page.adModel(stuck, read, CONFIG);
  assert.equal(
    s.callout.text,
    "Chanlytics couldn't finish setting this up. What was made is paused on Google: the campaign and who it shows to. Nothing was spent.",
  );
  assert.deepEqual(
    s.callout.acts.map((a) => a.label),
    ["Try again", "Remove what was made"],
  );
  assert.match(s.confirm.remove, /^Remove what was made on Google\? It is deleted there\. Nothing was spent\.$/);
  assert.deepEqual(s.foot, []);
});

test("an ad that ended reads in the past and says its numbers settle; one that settled says so; a call ad is never 'booked'", () => {
  const read = EXAMPLE_READS.finished();
  const ended = drawerOf(read, SPRING);
  assert.equal(ended.callout.text, "Ended Fri 9 Oct. Numbers settle for 14 days: these may still change.");
  assert.equal(ended.sentence[0].text, "Showed ");
  const door = ended.sentence.find((p) => "text" in p && p.text.startsWith("messaged"));
  assert.ok(door, "so they messaged you on WhatsApp");
  assert.deepEqual(ended.foot, ["again"]);
  assert.equal(ended.go.again, `campaigns/ads:new:again:${SPRING}`);

  const done = drawerOf(read, NEAR_ME);
  assert.match(
    done.callout.text,
    /^Appointments near me spent its \$94 and stopped\. Google counted 13 calls from it\. Settled: 14 days have passed\.$/,
  );
  assert.doesNotMatch(done.callout.text, /booked/, "Google's calls are Google's count, not people booked");
  const live = drawerOf(running(), SPRING);
  assert.equal(live.sentence[0].text, "Show ", "a running ad reads in the present");
});

test("an ad made on the platform itself has no Edit, no End, and one line saying where it was made", () => {
  const read = running();
  const old = drawerOf(read, OLD_BOOST);
  assert.equal(old.madeHere, false);
  assert.deepEqual(old.foot, ["resume"], "Pause and Resume only: this one is paused");
  assert.equal(old.adopted, "Made in Meta Ads Manager. Chanlytics can pause and resume it; change it in Meta.");
  const on = page.adModel(bent(adOf(read, OLD_BOOST), { state: "on" }), read, CONFIG);
  assert.deepEqual(on.foot, ["pause"]);
  assert.ok(!old.foot.includes("edit") && !on.foot.includes("edit"));
  // The ad made here has them, and no such line.
  const mine = drawerOf(read, SPRING);
  assert.deepEqual(mine.foot, ["pause", "edit"]);
  assert.equal(mine.adopted, null);
  // Its numbers count like any ad's.
  assert.ok(old.results.facts.length === 4);
  // Turned down on the platform, it can be put to the platform again, but not fixed here: Chanlytics cannot edit it.
  const needs = { code: "rejected", platformWords: "Not allowed", was: null, now: null };
  const refused = page.adModel(bent(adOf(read, OLD_BOOST), { state: "needs-you", needs }), read, CONFIG);
  assert.deepEqual(
    refused.callout.acts.map((a) => a.id),
    ["again"],
  );
});

test("TikTok takes no amount beyond 30% of the one now, and none within 2 days of the last change", () => {
  // The fixture changed Saturday video's amount yesterday (TikTok's wait shows in the running example): the 30% rule is
  // read on an ad last changed long enough ago that the wait is over.
  const read = running();
  read.ads = read.ads.map((a) => (a.id === SATURDAY ? { ...a, budgetChangedDay: "2026-10-01" } : a));
  // The floor a day is "at least", on TikTok as on Meta (the platform's own fact).
  assert.equal(page.CHIPS.floor("tiktok", "$20", null), "TikTok needs at least $20 a day for this.");
  assert.equal(page.CHIPS.floor("meta", "$5", null), "Meta needs at least $5 a day for this.");
  const step = page.CHIPS.tiktokStepOut(0.3);
  assert.equal(step, "TikTok lets you change it by up to 30% at a time");
  const options = drawerOf(read, SATURDAY).edit.amounts;
  const now = adOf(read, SATURDAY).budget.amountMinor;
  assert.equal(now, 35000);
  const refused = options.filter((o) => o.refused !== null);
  assert.ok(refused.length > 0, "some amounts are drawn and refused");
  for (const o of options) {
    const beyond = o.minor < now * 0.7 || o.minor > now * 1.3;
    assert.equal(o.refused !== null, beyond, `${o.minor} is ${beyond ? "refused" : "allowed"}`);
    if (beyond) assert.equal(o.sub, step, "the reason is the platform's rule, in its words");
  }
  assert.ok(
    options.some((o) => !o.current && o.refused === null && o.raise),
    "a raise inside 30% is allowed",
  );
  assert.ok(
    drawerOf(read, SATURDAY).edit.own.maxMinor === 45500 && drawerOf(read, SATURDAY).edit.own.minMinor === 24500,
  );

  // Changed on Sunday: no change is taken until Tuesday, whatever the size.
  const lately = EXAMPLE_READS.running();
  lately.ads = lately.ads.map((a) => (a.id === SATURDAY ? { ...a, budgetChangedDay: "2026-10-11" } : a));
  const locked = drawerOf(lately, SATURDAY).edit;
  const wait = "TikTok lets you change it again on Tue 13 Oct";
  assert.equal(wait, page.CHIPS.tiktokWait(page.dayWord("2026-10-13")));
  for (const o of locked.amounts) assert.equal(o.refused, o.current ? null : wait);
  assert.equal(locked.own.refused, wait, "nothing can be typed either");
  // Three days on, it may.
  const later = EXAMPLE_READS.running();
  later.ads = later.ads.map((a) => (a.id === SATURDAY ? { ...a, budgetChangedDay: "2026-10-08" } : a));
  assert.ok(drawerOf(later, SATURDAY).edit.amounts.some((o) => !o.current && o.refused === null));
  // The platform measures from the amount it holds, never from an unsaved draft.
  const saved = adOf(read, SATURDAY);
  const draft = ads.adWith(saved, read, { amountMinor: 44000 });
  const fromDraft = drawerOf(
    { ...read, ads: read.ads.map((a) => (a.id === SATURDAY ? draft : a)) },
    SATURDAY,
    saved,
  ).edit;
  assert.equal(fromDraft.own.maxMinor, 45500, "still 30% of the $350 the platform holds");
  // Meta and Google have no such step.
  assert.ok(drawerOf(read, SPRING).edit.amounts.every((o) => o.refused === null));
});

test("a daily Google amount is an average and never 'at most'; a total says what it does to a day", () => {
  const read = running();
  const near = adOf(read, NEAR_ME);
  const daily = bent(near, { budget: { mode: "daily", amountMinor: 1000 }, aboutADayMinor: 1000 });
  const edit = page.adModel(daily, read, CONFIG).edit;
  assert.equal(edit.daily, true);
  const labels = edit.amounts.map((o) => o.label);
  assert.ok(labels.includes("about $10 a day, an average"), "the amount now");
  assert.ok(labels.includes("Raise to about $15 a day, an average"));
  assert.ok(
    labels.every((l) => !/at most|up to/i.test(l)),
    labels.join(" | "),
  );
  assert.ok(edit.notes.amount.includes(page.CHIPS.dailyOverGoogle));
  // A total names what a day becomes: lowering, raising and as it is.
  const spring = adOf(read, SPRING);
  const total = drawerOf(read, SPRING).edit.amounts;
  const dayOf = (minor) =>
    page.perDayOf(
      ads.aboutADayAfter({ ad: spring, amountMinor: minor, endDay: spring.endDay, today: read.today }),
      "USD",
    );
  const nowRow = total.find((o) => o.current);
  assert.equal(nowRow.sub, `As it is: about ${dayOf(72000)}`);
  const lower = total.find((o) => o.minor < 72000);
  assert.equal(lower.sub, `About ${dayOf(lower.minor)} for the days left`);
  const raise = total.find((o) => o.minor === 90000);
  assert.equal(raise.label, "Raise to $900 in all");
  assert.equal(raise.sub, `Up to $180 more can be spent · about ${dayOf(90000)}`);
});

test("every end date says what it does to a day; Google's list stops at 90 days from the start and says why", () => {
  const read = running();
  const spring = adOf(read, SPRING);
  const ends = drawerOf(read, SPRING).edit.ends;
  const perDay = (day) =>
    page.perDayOf(ads.aboutADayAfter({ ad: spring, amountMinor: 72000, endDay: day, today: read.today }), "USD");
  for (const e of ends) {
    const said = e.day === spring.endDay ? "As it is" : e.day < spring.endDay ? "Ends sooner" : "Ends later";
    assert.ok(e.sub.startsWith(said), `${e.day}: ${e.sub}`);
    assert.ok(e.sub.includes(perDay(e.day)), e.sub);
  }
  assert.ok(ends.some((e) => e.sub.startsWith("Ends sooner")) && ends.some((e) => e.sub.startsWith("Ends later")));
  const google = drawerOf(read, NEAR_ME).edit;
  const last = ads.addDays(adOf(read, NEAR_ME).startDay, 90);
  assert.equal(google.lastEnd, last);
  assert.ok(google.ends.every((e) => e.day <= last));
  assert.ok(google.notes.end.includes(page.CHIPS.googleLastDay({ days: 90, day: page.dayWord(last) })));
  assert.equal(drawerOf(read, SPRING).edit.lastEnd, null, "Meta has no such day");
});

test("a raise in Edit names the most it can spend, and the primary says it; lowering and the rest are plain Save changes", () => {
  const read = running();
  const spring = adOf(read, SPRING);
  const foot = (patch, n = 1) => page.editFootOf({ ad: spring, next: ads.adWith(spring, read, patch), patch, n });
  const raise = foot({ amountMinor: 90000 });
  assert.equal(raise.save, "Save · raise to $900");
  assert.match(raise.say, /^Up to \$180 more can be spent · 1 change · starts right away$/);
  assert.deepEqual(foot({ amountMinor: 54000 }), { say: "1 change · starts right away", save: "Save changes" });
  assert.deepEqual(foot({ endDay: "2026-11-07" }), { say: "1 change · starts right away", save: "Save changes" });
  const area = foot({ area: { kind: "radius", miles: 8 } });
  assert.equal(area.save, "Save changes");
  assert.match(area.say, /back with Meta for checking, usually within a day$/);
  assert.equal(foot({}, 0).say, page.EDIT.noChanges);
  // Both a raise and an area: the most is named, and the ad goes back for checking.
  const both = foot({ amountMinor: 90000, area: { kind: "radius", miles: 8 } }, 2);
  assert.equal(both.save, "Save · raise to $900");
  assert.match(both.say, /^Up to \$180 more can be spent · 2 changes · back with Meta for checking/);
  // A daily amount has no most: it says about.
  const daily = bent(spring, { budget: { mode: "daily", amountMinor: 1500 } });
  const dailyPatch = { amountMinor: 2500 };
  const up = page.editFootOf({ ad: daily, next: ads.adWith(daily, read, dailyPatch), patch: dailyPatch, n: 1 });
  assert.equal(up.save, "Save · raise to about $25 a day");
  assert.match(up.say, /^About \$10 a day more · /);
  assert.doesNotMatch(up.say, /up to/i);
  // The raise the draft makes is the same the foot names.
  assert.deepEqual(page.raiseOf(spring, ads.adWith(spring, read, { amountMinor: 90000 })), {
    total: true,
    to: 90000,
    by: 18000,
  });
  assert.equal(page.raiseOf(spring, ads.adWith(spring, read, { amountMinor: 54000 })), null);
});

test("TikTok's area is ZIP codes: a chip hands them back whole, and a mistake is said in words", () => {
  const read = running();
  const edit = drawerOf(read, SATURDAY).edit;
  assert.deepEqual(edit.zips, ["10001", "10003"]);
  assert.deepEqual(edit.areas, [], "no circle to choose");
  assert.equal(drawerOf(read, SPRING).edit.zips, null);
  const value = page.areaValueOf({ kind: "zips", zips: ["10001", "10011"] });
  assert.equal(value, "zips:10001,10011");
  assert.deepEqual(page.areaOfValue(value), { kind: "zips", zips: ["10001", "10011"] });
  assert.deepEqual(page.areaOfValue(page.areaValueOf({ kind: "radius", miles: 8 })), { kind: "radius", miles: 8 });
  assert.equal(page.zipIssue("10014", ["10001"]), null);
  assert.equal(page.zipIssue("9410", []), "A ZIP code is 5 digits.");
  assert.equal(page.zipIssue("10001x", []), "A ZIP code is 5 digits.");
  assert.equal(page.zipIssue("10001", ["10001"]), "10001 is already in the list.");
  // A ZIP list saved through the store's own rule is a change of area: back for checking, the sentence still reads.
  const next = ads.adWith(adOf(read, SATURDAY), read, { area: page.areaOfValue(value) });
  assert.equal(page.adModel(next, read, CONFIG).edit.zips?.join(), "10001,10011");
});

test("the platform's own numbers are listed by name, each 'not read yet' where none came, and never summed with ours", () => {
  const read = running();
  const meta = drawerOf(read, SPRING).quiet.theirs;
  assert.equal(meta.door, "Meta's numbers");
  assert.deepEqual(
    meta.rows.map((r) => [r.label, r.value, r.known]),
    [
      ["People who saw it", "31,500", true],
      ["Taps", "1,284", true],
      ["Chats started", "Not read yet", false],
    ],
  );
  assert.equal(meta.note, "These are Meta's counts. Chanlytics counts people once.");
  const google = drawerOf(read, NEAR_ME).quiet.theirs;
  assert.deepEqual(
    google.rows.map((r) => r.label),
    ["Impressions", "Clicks", "Calls", "Calls over 60 seconds"],
  );
  assert.deepEqual(
    google.rows.map((r) => r.value),
    ["Not read yet", "214", "41", "38"],
  );
  const tiktok = drawerOf(read, SATURDAY).quiet.theirs;
  assert.deepEqual(
    tiktok.rows.map((r) => r.label),
    ["Impressions", "People reached", "Clicks", "Numbers left"],
  );
  assert.equal(tiktok.rows[1].value, "9,400");
  // Our count of the same ad is a different line: it is never one of the platform's rows.
  assert.ok(!meta.rows.some((r) => r.value === String(drawerOf(read, SPRING).results.facts[1].value)));
  // Nothing exists to read before the platform has approved the ad.
  assert.equal(drawerOf(read, WEEKEND).quiet.theirs, null);
});

test("what people typed on Google is read from the ad, with the searches left out for the owner", () => {
  const read = running();
  const typed = drawerOf(read, NEAR_ME).quiet.typed;
  assert.equal(typed.door, "What people typed");
  assert.deepEqual(typed.themes, ["appointments near me", "book a first appointment", "open times this week"]);
  assert.deepEqual(typed.left?.terms, ["jobs", "courses", "free", "diy"]);
  assert.equal(typed.left?.title, "Left out for you");
  assert.equal(drawerOf(read, SPRING).quiet.typed, null, "Meta has none");
  assert.equal(drawerOf(read, SATURDAY).quiet.typed, null);
});

test("the reach line is the ad's own record: when the last person arrived, said by its day, never typed", () => {
  const read = running();
  assert.equal(drawerOf(read, SPRING).reach.parts.at(-1), "last message arrived 8:41 AM today");
  assert.equal(drawerOf(read, SATURDAY).reach.parts.at(-1), "last number arrived 9:02 AM today");
  const yesterday = page.adModel(
    bent(adOf(read, SATURDAY), { lastArrivalAt: "2026-10-09T18:30:00-04:00" }),
    read,
    CONFIG,
  );
  assert.equal(yesterday.reach.parts.at(-1), "last number arrived Fri 9 Oct");
  const none = page.adModel(bent(adOf(read, SPRING), { lastArrivalAt: null }), read, CONFIG);
  assert.equal(none.reach.parts.at(-1), "WhatsApp linked", "without an arrival it says what the ad stands on");
  assert.deepEqual(drawerOf(read, SPRING).reach.parts[0], "Meta approved it Mon 14 Sep");
  // In review it says when it was sent, by its day.
  assert.deepEqual(drawerOf(read, WEEKEND).reach.parts[0], "sent to Meta today 9:02 AM");
  const old = page.adModel(bent(adOf(read, WEEKEND), { sentAt: "2026-10-10T16:30:00-04:00" }), read, CONFIG);
  assert.deepEqual(old.reach.parts[0], "sent to Meta Sat 10 Oct 4:30 PM");
});

test("a row goes to the conversation that waits on the owner, else to the person; the report is this ad's", () => {
  const read = running();
  const spring = drawerOf(read, SPRING);
  const row = (vm, name) => vm.people.rows.find((r) => r.name === name);
  const waiting = row(spring, "Jordan P.");
  assert.deepEqual(waiting.door, { to: "inbox/th-jordan-discount", tip: "Opens your conversation with Jordan P." });
  // Talking, with a thread of its own: the person's page, since nothing waits on the owner.
  assert.deepEqual(row(spring, "Maya R.").door, { to: "clients/c-maya", tip: "Opens Maya R." });
  const saturday = drawerOf(read, SATURDAY);
  assert.deepEqual(row(saturday, "Amy G.").door.to, "clients/c-amy", "a number to call, with no thread: the person");
  assert.equal(spring.people.all?.words, "All 96 in Reports › People");
  assert.equal(spring.results.all?.words, "Report");
  assert.equal(spring.results.all?.to, `reports/ads:${read.window.from}~${read.window.to}:ad:${SPRING}`);
  // The same address Reports' own helper spells (the Ads lens, over the window, on this ad): one rule, held here.
  assert.equal(spring.results.all?.to, ads.adsReportRoute(read.window, { kind: "ad", id: SPRING }));
  assert.equal(drawerOf(read, WEEKEND).results.all, null, "nothing is counted before the platform approves it");
  assert.equal(spring.go.copy, `campaigns/ads:new:copy:${SPRING}`);
  assert.equal(spring.go.again, `campaigns/ads:new:again:${SPRING}`);
});
