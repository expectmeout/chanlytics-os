/**
 * Campaigns › Ads, New ad's fold (11 Oct 2026): what the five steps say that depends on the account, the Services, the
 * business and the platform's rules. The model is contracts' (src/ads/new-ad.ts and new-ad-parts.ts), the fixtures the
 * dashboard's (surfaces/campaigns/ads); the real code runs, over the built contracts.
 *
 *   blocked    a door whose need the account does not meet is a red row that stops Turn on, with that need's words
 *   opens      a Google ad opens the Chanlytics page (the number is always on it) or the owner's site (the account's check)
 *   schedule   "Only while you're open": Meta only with a set number of days; Google's call button follows the hours
 *   budget     each platform's quiet lines; a Google daily amount never says "at most" or "up to" a day
 *   from       a copy, the same ad again, and the same offer on Google carry the ad's door, platform, offer and a name
 *   shown/ages who the ad is shown as, what people search, the age floor
 */
import { test } from "node:test";
import assert from "node:assert/strict";

const ads = await import("@chanlytics/contracts");
const page = await import("@chanlytics/contracts/ads-page");
const { EXAMPLE_READS } = await import("../../../../apps/dashboard/src/surfaces/campaigns/ads/examples.ts");
const { CONFIG, SPRING, NEAR_ME, SATURDAY } =
  await import("../../../../apps/dashboard/src/surfaces/campaigns/ads/sample.ts");

/** The default draft of a read, bent to a door and a platform (what the steps do when the owner presses them). */
function draftOn(read, door, platform, more = {}) {
  const base = page.newAdDefaults(read, CONFIG);
  const format = platform === "tiktok" ? "video" : "photo";
  const post = page.newestPostFor(read.posts, platform, format);
  return { ...base, door, platform, format, postId: post ? post.id : null, ...more };
}

/** A read in which one check of one platform's account is not met. */
function without(read, platform, id) {
  return {
    ...read,
    accounts: read.accounts.map((a) =>
      a.platform === platform ? { ...a, checks: a.checks.map((c) => (c.id === id ? { ...c, ok: false } : c)) } : a,
    ),
  };
}

test("a door whose need the account does not meet is a red row that stops Turn on, with that need's words and its door", () => {
  const read = without(EXAMPLE_READS.running(), "meta", "lead-terms");
  const draft = draftOn(read, "form", "meta");
  const vm = page.newAdModel(draft, read, CONFIG);
  assert.ok(vm.blocked, "an unmet need blocks");
  assert.equal(vm.blocked.text, "Accept the lead ads terms to continue");
  assert.equal(vm.blocked.door.to, "admin/integrations");
  const red = vm.checked.rows.filter((r) => r.tone === "fail");
  assert.deepEqual(
    red.map((r) => r.text),
    ["Lead ads terms accepted"],
    "one red row, in the platform's own words",
  );
  assert.equal(red[0].door.to, "admin/integrations");
  // The same ad on a connected, ready account is not stopped.
  const ready = page.newAdModel(draftOn(EXAMPLE_READS.running(), "form", "meta"), EXAMPLE_READS.running(), CONFIG);
  assert.equal(ready.blocked, null);
  assert.ok(ready.checked.rows.every((r) => r.tone !== "fail"));

  // An account not connected, one still to choose, and one that lapsed each stop it at the account, in one row.
  const none = EXAMPLE_READS.v0();
  const metaNone = page.newAdModel(draftOn(none, "whatsapp", "meta"), none, CONFIG);
  assert.equal(metaNone.blocked?.text, "Connect your Meta account to continue");
  assert.equal(metaNone.checked.rows.at(0)?.text, "Meta account connected");
  const choose = EXAMPLE_READS.choose();
  assert.equal(
    page.newAdModel(draftOn(choose, "whatsapp", "meta"), choose, CONFIG).blocked?.text,
    "Choose your Meta ad account to continue",
  );
  const lapsed = {
    ...EXAMPLE_READS.running(),
    accounts: EXAMPLE_READS.running().accounts.map((a) => (a.platform === "google" ? { ...a, status: "lapsed" } : a)),
  };
  assert.equal(
    page.newAdModel(draftOn(lapsed, "call", "google"), lapsed, CONFIG).blocked?.text,
    "Connect your Google account again to continue",
  );

  // TikTok needs its identity linked and, for a post, the post permission.
  const tt = without(without(EXAMPLE_READS.running(), "tiktok", "identity"), "tiktok", "post-permission");
  const withPost = page.newAdModel(draftOn(tt, "form", "tiktok"), tt, CONFIG);
  assert.ok(withPost.checked.rows.some((r) => r.text === "TikTok identity linked" && r.tone === "fail"));
  assert.ok(withPost.checked.rows.some((r) => r.text === "Post permission" && r.tone === "fail"));
  const noPost = page.newAdModel(draftOn(tt, "form", "tiktok", { postId: null }), tt, CONFIG);
  assert.ok(
    !noPost.checked.rows.some((r) => r.text === "Post permission"),
    "a video of their own needs no post permission",
  );

  // The count is of what is ready among what is checked.
  assert.match(vm.checked.said, /^\d+ of \d+ ready$/);
  assert.equal(vm.checked.of, vm.checked.rows.length);
  assert.equal(vm.checked.met, vm.checked.rows.filter((r) => r.tone === "ok").length);
  assert.ok(vm.checked.met < vm.checked.of, "a red row is not ready");
});

test("the Chanlytics page always has the number as text; on the owner's own site it is the account's check", () => {
  const read = without(EXAMPLE_READS.running(), "google", "number-on-page");
  const page_ = page.newAdModel(draftOn(read, "call", "google", { opens: "page" }), read, CONFIG);
  assert.equal(page_.blocked, null, "the hosted page has the number whatever the account says of the site");
  const hosted = page_.needs.find((r) => r.text === "Your number is on the page it opens, as text");
  assert.equal(hosted?.tone, "ok");
  assert.equal(hosted?.note, "Chanlytics puts it there", "the sub-line says who puts it there");
  assert.ok(page_.checked.rows.some((r) => r.text === hosted.text && r.tone === "ok"));
  assert.equal(page_.ad.opensUrl, read.business.page);
  assert.equal(page_.ad.copy.path, "chanlytics.com › book", "the display path follows the page it opens");

  const site = page.newAdModel(draftOn(read, "call", "google", { opens: "site" }), read, CONFIG);
  assert.equal(site.needs.find((r) => r.text === hosted.text)?.tone, "warn");
  assert.equal(site.blocked?.text, "Put your number on your website as text to continue");
  assert.equal(site.ad.opensUrl, read.business.site);
  assert.equal(site.ad.copy.path, "example.com › book");

  // With the number on the site the choice is free.
  const fine = page.newAdModel(
    draftOn(EXAMPLE_READS.running(), "call", "google", { opens: "site" }),
    EXAMPLE_READS.running(),
    CONFIG,
  );
  assert.equal(fine.blocked, null);
  // Only Google asks where the ad opens.
  assert.equal(page.newAdModel(draftOn(read, "whatsapp", "meta"), read, CONFIG).opens, null);
  assert.deepEqual(
    page_.opens?.choices.map((c) => c.id),
    ["page", "site"],
  );
});

test("Only while you're open: Meta can keep to the hours only with a set number of days, Google's call button always does", () => {
  const read = EXAMPLE_READS.running();
  const total = draftOn(read, "whatsapp", "meta", { mode: "total", schedule: "open-hours" });
  const on = page.newAdModel(total, read, CONFIG);
  assert.equal(on.schedule.kind, "switch");
  assert.deepEqual([on.schedule.on, on.schedule.locked], [true, false]);
  assert.equal(on.schedule.label, "Only while you're open (Mon to Sat, 9 AM to 6 PM)");
  assert.equal(on.ad.schedule, "open-hours");

  const daily = page.newAdModel({ ...total, mode: "daily" }, read, CONFIG);
  assert.deepEqual([daily.schedule.on, daily.schedule.locked], [false, true], "off and locked with a daily amount");
  assert.match(daily.schedule.hint, /Meta can keep to your hours only with a set number of days/);
  assert.equal(daily.ad.schedule, "always", "an ad that cannot keep to the hours does not say it does");
  // The choice is kept for when the owner goes back to a set number of days.
  assert.equal(page.newAdModel({ ...total, mode: "total" }, read, CONFIG).schedule.on, true);

  const google = page.newAdModel(draftOn(read, "call", "google", { mode: "daily" }), read, CONFIG);
  assert.equal(google.schedule.kind, "line");
  assert.match(google.schedule.text, /call button follows your hours/);
  assert.equal(google.ad.schedule, "always");

  for (const mode of ["total", "daily"]) {
    const tiktok = page.newAdModel(draftOn(read, "form", "tiktok", { mode, schedule: "open-hours" }), read, CONFIG);
    assert.deepEqual(
      [tiktok.schedule.on, tiktok.schedule.locked],
      [true, false],
      `TikTok keeps to the hours with ${mode}`,
    );
  }
});

test("each platform's quiet lines under the amounts; a Google daily amount never says at most or up to a day", () => {
  const read = EXAMPLE_READS.running();
  const tiktok = page.newAdModel(draftOn(read, "form", "tiktok"), read, CONFIG);
  assert.ok(
    tiktok.lines.some((l) => /up to 30% at a time, once every 2 days/.test(l)),
    tiktok.lines.join(" | "),
  );
  assert.ok(
    tiktok.lines.some((l) => /\$20 a day/.test(l)),
    "TikTok's floor a day",
  );

  const meta = page.newAdModel(draftOn(read, "whatsapp", "meta"), read, CONFIG);
  assert.ok(meta.lines.some((l) => /back to learning for a few days/.test(l)));

  const total = page.newAdModel(draftOn(read, "call", "google", { mode: "total" }), read, CONFIG);
  assert.ok(
    total.lines.some((l) => /3 to 90 days/.test(l)),
    "a set number of days can be at most 90",
  );

  const daily = page.newAdModel(draftOn(read, "call", "google", { mode: "daily" }), read, CONFIG);
  assert.ok(
    daily.lines.some((l) =>
      /an average: a day can spend up to twice it, never more than 30\.4 times it in a month/.test(l),
    ),
  );
  // What the ad says of its own amount is an average, never a ceiling a day.
  for (const said of [daily.turnOn, daily.forecast, daily.lines[0], daily.ownRest ?? ""]) {
    assert.doesNotMatch(said, /at most|up to/i, said);
  }
  assert.match(daily.turnOn, /^Turn on · about \$\d+ a day$/);
  // A total is the one number the platform enforces: that one says up to.
  assert.match(total.turnOn, /^Turn on · up to \$\d+$/);
});

test("New ad starts from an ad: a copy, the same ad again, and its offer on Google, each with a name that says where it came from", () => {
  const read = EXAMPLE_READS.running();
  const spring = read.ads.find((ad) => ad.id === SPRING);
  const copy = page.newAdFrom(spring, "copy", read);
  assert.equal(copy.name, "A copy of Spring offer");
  assert.deepEqual([copy.door, copy.platform, copy.serviceId], ["whatsapp", "meta", spring.serviceId]);
  assert.equal(copy.ownPerDayMinor, spring.aboutADayMinor);
  assert.equal(copy.headline, spring.copy.headline);
  const again = page.newAdFrom(spring, "again", read);
  assert.equal(again.name, "Spring offer, again");
  const google = page.newAdFrom(spring, "google", read);
  assert.equal(google.name, "Spring offer on Google");
  assert.deepEqual([google.door, google.platform, google.serviceId], ["call", "google", spring.serviceId]);
  assert.equal(google.alsoGoogle, false);

  // The name is the ad's, and the model carries it into the row it lands as.
  const vm = page.newAdModel(google, read, CONFIG);
  assert.equal(vm.ad.name, "Spring offer on Google");
  assert.equal(vm.ad.offer, spring.offer);
  assert.equal(vm.ad.platform, "google");
  assert.equal(vm.blocked, null, "a Google account that is ready lets it be turned on");

  // A TikTok video stays a video; a Google ad copied keeps the page it opens.
  const video = read.ads.find((ad) => ad.id === SATURDAY);
  const videoCopy = page.newAdFrom(video, "copy", read);
  assert.deepEqual([videoCopy.platform, videoCopy.format, videoCopy.postId], ["tiktok", "video", video.media.postId]);
  const near = read.ads.find((ad) => ad.id === NEAR_ME);
  assert.equal(page.newAdFrom(near, "copy", read).opens, "page");
  assert.equal(page.newAdFrom({ ...near, opensUrl: read.business.site }, "copy", read).opens, "site");
});

test("Also run on Google hands the page the Google ad from the new one; only a Meta ad that asked for it does", () => {
  const read = EXAMPLE_READS.running();
  const meta = draftOn(read, "whatsapp", "meta", { alsoGoogle: true });
  assert.equal(page.adFollowOn(meta, "abc"), ads.newAdFromRoute("google", "abc"));
  assert.equal(page.adFollowOn({ ...meta, alsoGoogle: false }, "abc"), null);
  assert.equal(
    page.adFollowOn({ ...meta, platform: "google", door: "call" }, "abc"),
    null,
    "a Google ad has no Google to follow",
  );
});

test("who the ad is shown as, what people search, and the age floor are read, not typed", () => {
  const read = EXAMPLE_READS.running();
  const meta = page.newAdModel(draftOn(read, "whatsapp", "meta"), read, CONFIG);
  assert.equal(meta.shownAs.line, "Harbor Studio · @harborstudio");
  assert.equal(meta.shownAs.limit, null);
  assert.equal(meta.shownAs.door.to, "admin/integrations");
  assert.equal(meta.ad.shownAs.handle, "@harborstudio");

  const long = { ...read, business: { ...read.business, name: "Harbor Studio of the Northern Quarter" } };
  const noAds = { ...long, ads: [] };
  const google = page.newAdModel(draftOn(noAds, "call", "google"), noAds, CONFIG);
  assert.ok(google.ad.shownAs.name.length <= 25, "Google's business name counts to 25");
  assert.equal(google.shownAs.limit, "Up to 25 characters");
  const tiktok = page.newAdModel(draftOn(noAds, "form", "tiktok"), noAds, CONFIG);
  assert.ok(tiktok.ad.shownAs.name.length <= 20, "TikTok's display name counts to 20");
  assert.equal(tiktok.shownAs.limit, "Up to 20 characters");

  // What people search comes from the Service, with "near me" and the open times; what is left out is Chanlytics'.
  const g = page.newAdModel(draftOn(read, "call", "google"), read, CONFIG);
  assert.deepEqual(g.search?.themes, ["first appointment near me", "book an appointment", "open times this week"]);
  assert.equal(g.search?.leftOut, "Left out for you: jobs, free, courses, how to");
  assert.match(g.search?.note ?? "", /Google groups searches/);
  assert.deepEqual(g.ad.leftOut, ["jobs", "free", "courses", "how to"]);
  assert.equal(meta.search, null);
  assert.deepEqual(meta.ad.searchThemes, []);

  // Eighteen and over everywhere it is set, locked, with its why; twenty-five for a cosmetic Service on TikTok.
  assert.deepEqual([meta.ages?.line, meta.ages?.floor], ["18 and over", 18]);
  assert.match(meta.ages?.why ?? "", /Meta shows ads like this to adults only/);
  const special = page.newAdModel(draftOn(read, "whatsapp", "meta", { special: true }), read, CONFIG);
  assert.equal(special.ages?.why, "Meta limits this kind of ad to adults.");
  assert.equal(g.ages, null, "Google sets no age");
  const cosmetic = {
    ...read,
    services: read.services.map((s, i) => (i === 0 ? { ...s, name: "Cosmetic consult" } : s)),
  };
  const tt = page.newAdModel(draftOn(cosmetic, "form", "tiktok"), cosmetic, CONFIG);
  assert.deepEqual([tt.ages?.line, tt.ages?.floor], ["25 and over", 25]);
  assert.match(tt.ages?.why ?? "", /25 and over/);
  const flagged = { ...read, services: read.services.map((s, i) => (i === 0 ? { ...s, cosmetic: true } : s)) };
  assert.equal(
    page.newAdModel(draftOn(flagged, "form", "tiktok"), flagged, CONFIG).ages?.floor,
    25,
    "a Service marked cosmetic",
  );
  assert.equal(
    page.newAdModel(draftOn(cosmetic, "whatsapp", "meta"), cosmetic, CONFIG).ages?.floor,
    18,
    "Meta's floor stays 18",
  );
});

test("a Meta video is drawn in the vertical frame and is a video of their own; a photo keeps the feed's shapes", () => {
  const read = EXAMPLE_READS.running();
  const photo = page.newAdModel(draftOn(read, "whatsapp", "meta", { postId: null, format: "photo" }), read, CONFIG);
  assert.equal(photo.drawer.preview.frame, "feed");
  assert.deepEqual(photo.drawer.preview.frames, ["Feed", "Story", "Reel"]);
  assert.deepEqual(photo.ad.media, { kind: "photo", label: "" });
  const video = page.newAdModel(draftOn(read, "whatsapp", "meta", { postId: null, format: "video" }), read, CONFIG);
  assert.equal(video.drawer.preview.frame, "video");
  assert.deepEqual(video.drawer.preview.frames, []);
  assert.deepEqual(video.ad.media, { kind: "video", label: "", vertical: true });
  // The newest post of a kind: the fixtures hold Instagram photos, an Instagram reel and a TikTok video.
  assert.equal(page.newestPostFor(read.posts, "meta", "photo")?.kind, "photo");
  assert.equal(page.newestPostFor(read.posts, "meta", "video")?.label, "Instagram reel");
  assert.equal(page.newestPostFor(read.posts, "tiktok", "video")?.kind, "video");
  assert.equal(page.newestPostFor(read.posts, "google"), undefined);
});

test("what Chanlytics set for the owner is one list a platform, read from what the draft chose", () => {
  const read = EXAMPLE_READS.running();
  const meta = page.newAdModel(draftOn(read, "whatsapp", "meta"), read, CONFIG);
  assert.equal(meta.setFor.label, "What Chanlytics set for you");
  assert.deepEqual(meta.setFor.rows, [
    "Feeds, Stories and Reels, not WhatsApp Status or the Audience Network",
    "People who live in or were recently in the area, 18 and over",
    "Meta's automatic style changes are off",
    "The lowest cost for each chat",
    "All hours",
  ]);
  const adjusted = page.newAdModel(
    draftOn(read, "whatsapp", "meta", { adjust: true, schedule: "open-hours" }),
    read,
    CONFIG,
  );
  assert.ok(adjusted.setFor.rows.includes("Meta may adjust your photo and wording, as you chose"));
  assert.ok(adjusted.setFor.rows.includes("Only while you're open (Mon to Sat, 9 AM to 6 PM)"));
  const form = page.newAdModel(draftOn(read, "form", "meta"), read, CONFIG);
  assert.ok(form.setFor.rows.includes("The lowest cost for each number"));

  const google = page.newAdModel(draftOn(read, "call", "google"), read, CONFIG);
  assert.deepEqual(google.setFor.rows, [
    "Search only, with search partners off",
    "People in the area",
    "10 headlines and 3 descriptions, written from your Services",
    "The call button follows your hours (Mon to Sat, 9 AM to 6 PM)",
    "A call counts past 60 seconds",
    "Most clicks to start",
    "Searches for jobs, free, courses and how to left out",
  ]);
  const tiktok = page.newAdModel(draftOn(read, "form", "tiktok"), read, CONFIG);
  assert.deepEqual(tiktok.setFor.rows, [
    "TikTok and its partner apps",
    "18 and over",
    "Name and phone, with a confirm step",
    "The most results for the amount",
    "A lead counts within 7 days of a tap, and views are not counted",
  ]);
  const plain = page.newAdModel(draftOn(read, "form", "tiktok", { doubleCheck: false }), read, CONFIG);
  assert.ok(plain.setFor.rows.includes("Name and phone"));
});

test("the checks name what is wrong with the words and the price, in amber, and do not stop Turn on", () => {
  const read = EXAMPLE_READS.running();
  // The first post says $45; the Spring offer Service says from $60.
  const spring = read.services.find((s) => s.name === "Spring offer");
  const draft = draftOn(read, "whatsapp", "meta", { serviceId: spring.id });
  const vm = page.newAdModel(draft, read, CONFIG);
  const price = vm.checked.rows.find((r) => /^The ad says \$45\. Services says from \$60\.$/.test(r.text));
  assert.equal(price?.tone, "warn");
  assert.equal(vm.blocked, null, "an amber row never stops the press");
  // Words over Meta's limit.
  const long = page.newAdModel(
    draftOn(read, "whatsapp", "meta", { postId: null, headline: "A headline that is far longer than the feed shows" }),
    read,
    CONFIG,
  );
  assert.ok(
    long.checked.rows.some(
      (r) => /^The headline is \d+ characters\. Facebook shows the first 27\.$/.test(r.text) && r.tone === "warn",
    ),
  );
  // The receptionist never quotes a price: the ad that does is amber.
  const never = { ...read, neverQuotePrices: true };
  const quoted = page.newAdModel(draftOn(never, "call", "google"), never, CONFIG);
  assert.ok(quoted.checked.rows.some((r) => /never quote prices/.test(r.text) && r.tone === "warn"));
  // A form's thank-you line is a choice; it defaults to not promising a message.
  const form = draftOn(read, "form", "meta");
  assert.equal(page.newAdModel(form, read, CONFIG).ad.copy.thanks, "We'll get back to you");
  assert.equal(
    page.newAdModel({ ...form, thanks: true }, read, CONFIG).ad.copy.thanks,
    "We'll message you within a few minutes",
  );
});

test("every door on every platform it runs on draws in every example, with the new fields", () => {
  for (const [id, make] of Object.entries(EXAMPLE_READS)) {
    const read = make();
    for (const [door, platform] of [
      ["whatsapp", "meta"],
      ["call", "google"],
      ["form", "meta"],
      ["form", "tiktok"],
    ]) {
      for (const mode of ["total", "daily"]) {
        const vm = page.newAdModel(draftOn(read, door, platform, { mode }), read, CONFIG);
        const where = `${id} ${door} ${platform} ${mode}`;
        assert.ok(vm.checked.rows.length > 0, where);
        assert.equal(
          vm.blocked === null,
          vm.checked.rows.every((r) => r.tone !== "fail"),
          where,
        );
        assert.ok(vm.setFor.rows.length > 0, where);
        assert.equal(vm.opens !== null, platform === "google", where);
        assert.equal(vm.search !== null, platform === "google", where);
      }
    }
  }
});
