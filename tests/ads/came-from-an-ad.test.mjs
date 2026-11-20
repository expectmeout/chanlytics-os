/**
 * "Came from an ad" across the app: the way in People says, a person an ad added named by the ad with a door to its
 * drawer, and the deals report's sources line. The real code runs.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { importSrc } from "../_source.mjs";

const root = await import("@chanlytics/contracts");
const { addedBy } = await importSrc("packages/contracts/src/people/person-helpers.ts");

/** An ad's id, made up. */
const SPRING = "a7f0c2d4-0000-4000-8000-000000000001";

test("an ad is a way in: the words, a person added by one by name with a door to it, and the platform's words agree", () => {
  assert.equal(root.PERSON_CAME_FROM_WORDS.ad, "An ad");
  assert.deepEqual(root.cameFromOf({ came_from: "ad" }), { key: "ad", label: "An ad" });
  assert.equal(root.cameFromOf({ came_from: "fax" }), null, "a value this build does not know is still nothing");
  assert.equal(root.fromAdWords("Spring offer"), "From an ad · Spring offer");
  assert.equal(root.fromAdWords(null), "From an ad");
  const ad = { id: SPRING, name: "Spring offer", platform: "meta" };
  assert.deepEqual(root.PERSON_AD_ON, { meta: "Facebook and Instagram", google: "Google", tiktok: "TikTok" });
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
