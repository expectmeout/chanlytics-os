/**
 * How the bell draws an owner's ads (decision 0050, call 15; the Ads plan's 4.10 and G9): five kinds, each a line on the
 * bell, the two that stop an ad also mailed (Ruben, 20 Nov 2026), each row naming one ad and opening its drawer, the two that
 * wait on the owner drawn as warnings and the three that are news drawn plain, and Today's away card counting them as
 * ads. What the database writes, and when it rings and closes, is held by the-bell-rings-for-an-owner-s-ads.db.test.mjs.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;

const { serverNotificationRows } = await import(at("packages/contracts/src/today/notifications/feed.ts"));
const { NOTICE_ENDS } = await import(at("packages/contracts/src/waits/notice-closes.ts"));
const { EMAILED_NOTIFICATION_KINDS, BELL_LINE_KINDS, ALERT_TOPICS, emailsFor } = await import(
  at("packages/contracts/src/today/notification-kinds.ts")
);
const { PUSH_KINDS } = await import(at("packages/contracts/src/today/push.ts"));
const { parseAds, adRoute } = await import(at("packages/contracts/src/ads/address.ts"));

const AD = "3f2a9c1e-5b7d-4e8a-9c0b-1d2e3f4a5b6c";
const KINDS = ["ad_refused", "ad_unpaid", "ad_ended", "ad_spent", "ad_quiet"];

/** A row as the database writes it (00658 ad_bell_ring). */
const kept = (kind, title, over = {}) => ({
  id: `n-${kind}`,
  kind,
  title,
  body: "…",
  route: `campaigns/ads:ad:${AD}`,
  subject_type: "ad",
  subject_id: AD,
  created_at: "2026-11-20T15:00:00.000Z",
  read: false,
  dismissed: false,
  closed_at: null,
  ...over,
});
const draw = (...rows) => serverNotificationRows({ notifications: rows, seen_at: null });

test("the two that stop an ad are mailed as the business chooses; the three that are news stay on the bell", () => {
  const MAILED = ["ad_refused", "ad_unpaid"];
  for (const kind of KINDS) {
    const mailed = MAILED.includes(kind);
    assert.equal(EMAILED_NOTIFICATION_KINDS.includes(kind), mailed, `${kind}: ${mailed ? "mailed" : "no mail"}`);
    assert.equal(emailsFor({ email_off: [] }, kind), mailed);
    // Mailed ones are a topic of their own (Settings › Notifications says so), the rest the bell's own line.
    assert.equal(BELL_LINE_KINDS.includes(kind), !mailed, `${kind}: ${mailed ? "a topic" : "a line on the bell"}`);
    assert.ok(!PUSH_KINDS.includes(kind), `${kind}: no phone until a topic offers it`);
    assert.equal(NOTICE_ENDS[kind].ends, "news", `${kind}: closed by the database, never judged by a page`);
  }
  // The business may turn the mail off, as any choice: the bell keeps the row.
  for (const kind of MAILED) assert.equal(emailsFor({ email_off: [kind] }, kind), false, `${kind}: turned off`);
  const topic = ALERT_TOPICS.find((t) => t.key === "ads");
  assert.deepEqual([topic.group, topic.email, topic.phone, topic.ads], ["needs_you", "choice", false, true]);
});

test("a row opens its ad's drawer, and says so", () => {
  const [row] = draw(kept("ad_refused", "“Spring offer” not approved by Meta"));
  assert.equal(row.to, adRoute(AD));
  assert.equal(parseAds(row.to.replace(/^campaigns\//, "")).ad, AD, "the Ads page reads the drawer's ad from it");
  assert.equal(row.action, "Open the ad");
  assert.deepEqual(row.about, { type: "ad", id: AD });
});

test("what waits on the owner is a warning; an ad that ended, spent its total or went quiet is news", () => {
  const rows = draw(
    kept("ad_refused", "“A” not approved by Meta"),
    kept("ad_unpaid", "“A” can't run"),
    kept("ad_ended", "“A” ended"),
    kept("ad_spent", "“A” spent its total"),
    kept("ad_quiet", "“A” brought no one in 7 days"),
  );
  assert.deepEqual(
    rows.map((r) => [r.kind, r.tone]),
    [
      ["ad_refused", "warn"],
      ["ad_unpaid", "warn"],
      ["ad_ended", ""],
      ["ad_spent", ""],
      ["ad_quiet", ""],
    ],
  );
  for (const row of rows) assert.equal(row.unread, true);
});

test("a row the database closed reads as read and wears no warning", () => {
  const [row] = draw(kept("ad_refused", "“A” not approved by Meta", { closed_at: "2026-11-20T16:00:00.000Z" }));
  assert.equal(row.unread, false);
  assert.notEqual(row.tone, "warn");
});
