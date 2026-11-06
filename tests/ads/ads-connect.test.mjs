/**
 * Ad accounts in Settings › Connections, and "came from an ad" across the app (11 Oct 2026, the Ads mockup's Phase 2, agent D).
 * The words and the fold that makes the rows are contracts' (src/ads/words-connect.ts); the starting accounts are the Ads
 * page's fixtures; the presses are the demo's (surfaces/settings/connections/ad-accounts-mock.ts). The real code runs.
 *
 *   rows         a row for each platform: the account, its own currency and zone, when it was read, what is ready on it
 *   ready        the checks as Ads' standing words them; Google's manager link; TikTok's permission, amber in its last week
 *   states       connected, needs you, not connected (and what connecting does), choosing an account, a read that failed
 *   running      ads that are on, in review or being made are counted, so Disconnect can be refused (decision 8)
 *   presses      the demo's Change account and Disconnect change a copy, never the fixtures
 *   came from    "An ad" is a way in; an ad adds a person by name, with a door to it; the demo's people, threads and ads agree
 *   the pane     a real workspace's Connections draws none of it
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { importSrc } from "../_source.mjs";

const root = await import("@chanlytics/contracts");
const page = await import("@chanlytics/contracts/ads-page");
const { EXAMPLE_READS } = await importSrc("apps/dashboard/src/surfaces/campaigns/ads/examples.ts");
const { SPRING, SATURDAY, WEEKEND, NEAR_ME, OLD_BOOST, notConnected } = await importSrc(
  "apps/dashboard/src/surfaces/campaigns/ads/sample.ts",
);
const mock = await importSrc("apps/dashboard/src/surfaces/settings/connections/ad-accounts-mock.ts");
const { addedBy } = await importSrc("packages/contracts/src/people/person-helpers.ts");

const rowsOf = (example) => {
  const read = EXAMPLE_READS[example]();
  return Object.fromEntries(
    page.connectModel({ accounts: read.accounts, ads: read.ads, today: read.today }).map((r) => [r.id, r]),
  );
};

test("a row for each platform, in the Ads page's order, with the account's own name, currency, time zone and read", () => {
  const rows = page.connectModel({
    accounts: EXAMPLE_READS.running().accounts,
    ads: EXAMPLE_READS.running().ads,
    today: "2026-10-11",
  });
  assert.deepEqual(
    rows.map((r) => [r.id, r.title]),
    [
      ["meta", "Facebook and Instagram"],
      ["google", "Google"],
      ["tiktok", "TikTok"],
    ],
  );
  const meta = rows[0];
  assert.equal(meta.detail, "Harbor Studio ad account");
  assert.equal(meta.stateWords, "Connected");
  assert.equal(meta.tone, "ok");
  assert.equal(meta.facts, "USD · New York time · set by the account", "currency and zone are the account's, said so");
  assert.equal(meta.read, "Read 9:19 AM");
  assert.equal(meta.line, null, "a connected row has no sentence of what connecting does");
  assert.equal(meta.readyMark, "all in order");
  assert.notEqual(new Set(rows.map((r) => r.icon)).size, 1, "a glyph for each platform, none a brand's");
});

test("what is ready is Ads' standing in Ads' words; Google's manager link is Chanlytics' access; TikTok's permission runs until a day", () => {
  const rows = rowsOf("running");
  assert.deepEqual(
    rows.meta.ready.map((x) => x.text),
    [
      page.checkWords("account-active", "meta"),
      page.checkWords("payment", "meta"),
      page.checkWords("page-linked", "meta"),
      page.checkWords("whatsapp-linked", "meta"),
      page.checkWords("instagram-linked", "meta"),
      page.checkWords("chanlytics-whatsapp", "meta"),
    ],
    "the same words the Ads page's standing popover uses, in its order",
  );
  assert.equal(rows.google.ready[0].text, "Chanlytics' access: accepted", "the manager link comes first");
  assert.deepEqual(
    rows.google.ready.slice(1).map((x) => x.id),
    page.STANDING_CHECKS.google,
  );
  const permission = rows.tiktok.ready.at(-1);
  assert.deepEqual([permission.text, permission.tone, permission.fix], ["Post permission until Wed 4 Nov", "ok", null]);
  assert.ok(rows.meta.ready.every((x) => x.tone === "ok" && x.fix === null));
});

test("a check that is not met is amber with the step that mends it; the card says Needs you and how many", () => {
  const rows = rowsOf("needs-you");
  const payment = rows.meta.ready.find((x) => x.id === "payment");
  assert.deepEqual(
    [payment.tone, payment.text, payment.fix],
    ["warn", "Payment method in Meta", "Add a payment method in Meta"],
  );
  assert.deepEqual([rows.meta.stateWords, rows.meta.tone, rows.meta.readyMark], ["Needs you", "warn", "1 needs you"]);
  // TikTok's permission turns amber in its last week (3 days from the example's today), and says what to do.
  const permission = rows.tiktok.ready.at(-1);
  assert.deepEqual(
    [permission.text, permission.tone, permission.fix],
    ["Post permission until Wed 14 Oct", "warn", "Renew your post permission"],
  );
  assert.equal(rows.tiktok.stateWords, "Needs you");
  // A manager link not accepted is Chanlytics' access not accepted yet, with Google's own step.
  const read = EXAMPLE_READS.running();
  const google = read.accounts.find((a) => a.platform === "google");
  const unaccepted = {
    ...google,
    checks: google.checks.map((c) => (c.id === "manager-link" ? { ...c, ok: false } : c)),
  };
  const [, g] = page.connectModel({
    accounts: [read.accounts[0], unaccepted, read.accounts[2]],
    ads: read.ads,
    today: read.today,
  });
  assert.deepEqual(
    [g.ready[0].text, g.ready[0].tone, g.ready[0].fix],
    ["Chanlytics' access: not accepted yet", "warn", "Accept Chanlytics as your manager"],
  );
});

test("not connected says what connecting does and who bills; nothing is ready on it; v0 has no account anywhere", () => {
  const { meta, google, tiktok } = rowsOf("no-ads");
  assert.deepEqual(
    [meta.stateWords, meta.running],
    ["Needs you", 0],
    "Meta is connected with no ad and no payment method yet",
  );
  assert.deepEqual(
    [google.stateWords, google.tone, google.detail, google.facts, google.ready],
    ["Not connected", "plain", null, null, []],
  );
  assert.equal(
    google.line,
    "Chanlytics reads your ads and can make new ones. Google bills you; Chanlytics never holds your ad money.",
  );
  assert.match(tiktok.line, /^Chanlytics reads your ads and can make new ones\. TikTok bills you;/);
  assert.equal(page.CONNECT.line("meta").split(". ")[1], "Meta bills you; Chanlytics never holds your ad money.");
  for (const r of Object.values(rowsOf("v0")))
    assert.deepEqual([r.status, r.running, r.ready], ["not-connected", 0, []]);
  assert.equal(
    page.CONNECT.signIn("meta"),
    "This opens Meta's sign-in in the real app. Nothing was connected.",
    "Connect never claims a connection",
  );
});

test("several accounts to choose among show their currency; a read that failed or is going says so", () => {
  const meta = rowsOf("choose").meta;
  assert.deepEqual(
    [meta.status, meta.stateWords, meta.tone, meta.detail, meta.ready, meta.line],
    ["choose", "Choose an account", "info", null, [], null],
  );
  assert.deepEqual(
    meta.choices.map((c) => [c.label, c.hint]),
    [
      ["Harbor Studio ad account", "USD"],
      ["Harbor Studio second account", "USD"],
      ["Harbor Studio UK", "GBP"],
    ],
    "an account's currency is the platform's, shown, never converted",
  );
  assert.equal(rowsOf("failed").meta.read, "Could not be read · last read Sat 10 Oct, 6:00 PM");
  assert.equal(rowsOf("reading").meta.read, "Reading now");
});

test("ads that are on, in review or being made are running, and Disconnect is refused while there are any", () => {
  const running = rowsOf("running");
  assert.deepEqual([running.meta.running, running.google.running, running.tiktok.running], [2, 1, 1]);
  assert.equal(page.CONNECT.refused(2), "Pause or end your ads first: 2 are on.");
  assert.equal(page.CONNECT.refused(1), "Pause or end your ads first: 1 is on.");
  // An ad that needs you, is paused, ended or finished is not running: with none left the card asks first.
  const needs = rowsOf("needs-you");
  assert.deepEqual([needs.meta.running, needs.google.running, needs.tiktok.running], [0, 1, 0]);
  assert.equal(rowsOf("no-ads").meta.running, 0);
  assert.equal(rowsOf("finished").meta.running, 1, "the weekend offer is in review; the spring offer ended");
  const setting = rowsOf("setting-up");
  assert.equal(setting.meta.running, 3, "one being made on Meta counts with the two already there");
  assert.equal(setting.google.running, 1, "and a Google ad that could not finish does not");
});

test("ads made on the platform itself are shown in Ads, read-only, and the card says how many", () => {
  assert.equal(rowsOf("running").meta.adopted, "1 ad made in Meta Ads Manager is shown in Ads, read-only.");
  assert.equal(rowsOf("running").google.adopted, null);
  assert.equal(page.CONNECT.adopted("google", 2), "2 ads made in Google Ads are shown in Ads, read-only.");
  assert.equal(page.CONNECT.adopted("tiktok", 1), "1 ad made in TikTok Ads Manager is shown in Ads, read-only.");
  const read = EXAMPLE_READS.running();
  assert.equal(
    read.ads.find((a) => a.id === OLD_BOOST).madeHere,
    false,
    "the fixture's adopted ad is the one it counts",
  );
});

test("the owner's setting is off unless chosen, in the words the decision gave", () => {
  assert.equal(page.CONNECT.pause.label, "Pause my ads when the way in closes");
  assert.equal(
    page.CONNECT.pause.line,
    "If WhatsApp or your line stops working, Chanlytics pauses your ads instead of only telling you.",
  );
  assert.equal(page.CONNECT.sub, page.EXAMPLE.note, "the card says its data is an example");
});

test("the demo's Change account offers the owner's other Meta accounts; using one changes a copy and keeps the fixture", () => {
  const read = EXAMPLE_READS.running();
  const meta = read.accounts[0];
  assert.deepEqual(meta.choices, [], "the fixture has none to choose among");
  const offered = mock.withChoices(meta);
  assert.deepEqual(
    offered.choices.map((c) => c.name),
    ["Harbor Studio ad account", "Harbor Studio second account", "Harbor Studio UK"],
    "itself first, and no second account of its own name",
  );
  assert.equal(offered.choices[0].externalId, meta.externalId);
  assert.strictEqual(mock.withChoices(read.accounts[1]), read.accounts[1], "only Meta has other accounts to change to");
  assert.strictEqual(mock.withChoices(offered), offered, "and it is offered once");
  const uk = offered.choices[2];
  const used = mock.usingAccount(offered, uk.externalId, read.readAt);
  assert.deepEqual(
    [used.name, used.currency, used.timezone, used.status, used.read],
    ["Harbor Studio UK", "GBP", "Europe/London", "connected", "ok"],
  );
  assert.strictEqual(mock.usingAccount(offered, meta.externalId, read.readAt), offered, "the one in use is no change");
  assert.strictEqual(
    mock.usingAccount(offered, "act_nope", read.readAt),
    offered,
    "nor is an account it was not offered",
  );
  assert.equal(
    EXAMPLE_READS.running().accounts[0].name,
    "Harbor Studio ad account",
    "the fixture is a copy's, untouched",
  );
  const choosing = EXAMPLE_READS.choose().accounts[0];
  const chosen = mock.usingAccount(choosing, choosing.choices[1].externalId, read.readAt);
  assert.deepEqual([chosen.status, chosen.name], ["connected", "Harbor Studio second account"]);
  assert.ok(chosen.checks.length > 0 && chosen.checks.every((c) => c.ok));
  assert.deepEqual(mock.disconnected("tiktok"), notConnected("tiktok"));
});

test("an ad is a way in: the words, a person added by one by name with a door to it, and the platform's words agree", () => {
  assert.equal(root.PERSON_CAME_FROM_WORDS.ad, "An ad");
  assert.deepEqual(root.cameFromOf({ came_from: "ad" }), { key: "ad", label: "An ad" });
  assert.equal(root.cameFromOf({ came_from: "fax" }), null, "a value this build does not know is still nothing");
  // People's three platform words are the Ads page's, said once there; this holds the copy equal.
  for (const p of ["meta", "google", "tiktok"]) assert.equal(root.PERSON_AD_ON[p], page.PLATFORM_WORD[p], p);
  assert.equal(root.fromAdWords("Spring offer"), "From an ad · Spring offer");
  assert.equal(root.fromAdWords(null), "From an ad");
  const ad = { id: SPRING, name: "Spring offer", platform: "meta" };
  assert.deepEqual(addedBy({ source: "ad", title: null, ad }), {
    who: "Ads",
    how: "from an ad (Spring offer, on Facebook and Instagram)",
    to: `campaigns/ads:ad:${SPRING}`,
  });
  assert.deepEqual(addedBy({ source: "ad", title: null }), { who: "Ads", how: "from an ad", to: null });
  assert.equal(
    addedBy({ source: "ad", title: null, ad: { ...ad, platform: "tiktok" } }).how,
    "from an ad (Spring offer, on TikTok)",
  );
  // The others are as they were, and none has a door.
  assert.deepEqual(addedBy({ source: "calendar", title: "Balayage" }), {
    who: "Calendar",
    how: "from your calendar (Balayage)",
    to: null,
  });
  assert.deepEqual(addedBy({ source: "lead", title: null }), {
    who: "Leads",
    how: "from a lead you found",
    to: null,
  });
  assert.deepEqual(addedBy({ source: "import", title: null }), {
    who: "You",
    how: "from a spreadsheet",
    to: null,
  });
  assert.deepEqual(addedBy({ source: "manual", title: null }), { who: "You", how: "by hand", to: null });
});

test("the deals report's sources line says an ad, for one client and for several", () => {
  const dto = (clients, count) => ({
    any: true,
    sent: clients,
    won: clients,
    lost: 0,
    waiting: 0,
    clients,
    monthly_cents: 0,
    median_days_to_yes: null,
    open: { count: 0, amounts: [] },
    sources: [{ came_from: "ad", count }],
    reasons: [],
  });
  const sourcesOf = (d) => root.toDealReportVM(d, "in the last 30 days").lines.find((l) => l.id === "sources")?.text;
  assert.equal(sourcesOf(dto(1, 1)), "Your new client came from an ad.");
  assert.equal(sourcesOf(dto(3, 2)), "2 of 3 new clients came from an ad.");
});

test("the demo's people an ad brought came from an ad, and their page says which ad, with a door to it", async () => {
  const { peopleSample, samplePerson } = await importSrc("apps/dashboard/src/surfaces/people/sample.ts");
  const now = new Date("2026-10-11T14:00:00.000Z");
  const read = EXAMPLE_READS.running();
  const brought = new Map(read.people.map((p) => [p.personId, read.ads.find((a) => a.id === p.adId)]));
  assert.equal(brought.size, 10, "the Ads fixtures name ten people");
  const rows = peopleSample(now).rows;
  assert.deepEqual(
    rows
      .filter((r) => r.cameFrom && r.cameFrom.key === "ad")
      .map((r) => r.id)
      .sort(),
    [...brought.keys()].sort(),
    "the people the Ads page names are exactly those People says came from an ad",
  );
  assert.ok(rows.filter((r) => r.cameFrom?.key === "ad").every((r) => r.cameFrom.label === "An ad"));
  assert.equal(rows.find((r) => r.id === "c-thewellness").cameFrom, null, "and nobody else");
  for (const [id, adRead] of brought) {
    const p = samplePerson(id, now);
    const where = { meta: "Facebook and Instagram", tiktok: "TikTok" }[adRead.platform];
    const added = p.about.find((a) => a.k === "Added");
    assert.match(added.v, new RegExp(`from an ad \\(${adRead.name}, on ${where}\\)`), `${id}: About says the ad`);
    const item = p.timeline.find((t) => t.id === "added");
    assert.deepEqual(
      [item.who, item.text, item.link],
      [
        "Ads",
        `Added from an ad (${adRead.name}, on ${where})`,
        { label: "Open the ad", to: `campaigns/ads:ad:${adRead.id}` },
      ],
      `${id}: History says it, with the door`,
    );
  }
  // Somebody an ad did not bring is added as they were: no ad, no door.
  const wellness = samplePerson("c-thewellness", now);
  assert.ok(!wellness.timeline.some((t) => t.id === "added"));
  assert.ok(!wellness.about.some((a) => a.k === "Added"));
});

test("the two demo ads People and the Inbox name are the Ads page's, by id, name and platform", async () => {
  const { DEMO_ADS } = await importSrc("apps/dashboard/src/surfaces/demo-ads.ts");
  const ads = EXAMPLE_READS.running().ads;
  for (const [key, id] of [
    ["spring", SPRING],
    ["saturday", SATURDAY],
  ]) {
    const ad = ads.find((a) => a.id === id);
    assert.deepEqual(
      [DEMO_ADS[key].id, DEMO_ADS[key].name, DEMO_ADS[key].platform],
      [ad.id, ad.name, ad.platform],
      key,
    );
  }
});

test("the four demo threads say which ad brought them, the same ad the Ads page names; no other thread says one", async () => {
  const { NEEDING_YOU } = await importSrc("apps/dashboard/src/surfaces/inbox/sample/threads-needing-you.ts");
  const { WATCHING } = await importSrc("apps/dashboard/src/surfaces/inbox/sample/threads-watching.ts");
  const read = EXAMPLE_READS.running();
  const threads = [...NEEDING_YOU, ...WATCHING];
  const four = ["th-jordan-discount", "th-maya-recovery", "th-david-complaint", "th-aisha-refund"];
  for (const id of four) {
    const person = read.people.find((p) => p.threadId === id);
    const ad = read.ads.find((a) => a.id === person.adId);
    const said = threads.find((t) => t.id === id).fromAd;
    assert.deepEqual([said.id, said.name, said.platform], [ad.id, ad.name, ad.platform], id);
  }
  assert.deepEqual(
    threads
      .filter((t) => t.fromAd)
      .map((t) => t.id)
      .sort(),
    [...four].sort(),
  );
  assert.deepEqual(
    [SPRING, SATURDAY].map((id) => read.ads.find((a) => a.id === id).name),
    ["Spring offer", "Saturday video"],
  );
  assert.ok(![WEEKEND, NEAR_ME].some((id) => threads.some((t) => t.fromAd && t.fromAd.id === id)));
});
