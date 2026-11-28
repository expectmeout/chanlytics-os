/**
 * A webhook door that refuses signed knocks tells somebody (the edge's door(), lane 8 of the "prove it works" plan on
 * lane 16's design, 28 Nov 2026). WhatsApp's door and Instagram's refused a knock whose signature failed and wrote
 * nothing: a signing secret that stopped matching would have refused every customer's message, Meta would have stopped
 * delivering, and nothing would have said so. Now each door counts the refusals of knocks that carried a credential, in
 * a row; three with none let in note the door in the pager's memory, which the health sweep pages once a window. Run
 * here with the doors' real wrapper and receivers, a database in memory and the pager handed in.
 */
import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { DOOR_REFUSING_PAGE } from "@chanlytics/db/ops";
import { importSrc } from "../../_source.mjs";
import { fakeDb } from "../../_fake-db.mjs";
import { linesOf } from "../../_log-lines.mjs";

process.env.META_APP_SECRET = "meta-secret-for-this-file";
const { door } = await importSrc("apps/edge/lib/shared/log.ts");
const { refuse, json } = await importSrc("apps/edge/lib/shared/http.ts");
const { setPg } = await importSrc("apps/edge/lib/shared/pg.ts");
const { watchRefusingDoors } = await importSrc("apps/edge/lib/ops/cap-watch.ts");
const { receiveWhatsappEvent } = await importSrc("apps/edge/lib/intake/whatsapp.ts");
const { instagramReceiver } = await importSrc("apps/edge/lib/instagram/webhook.ts");

let tables;
beforeEach(() => {
  tables = { operator_pages: [] };
  setPg(fakeDb(tables));
});

let serial = 0;
/** A door whose every answer is `answer`, at its own path so each case counts afresh. */
const doorAt = (answer) => {
  const path = `/api/test-door-${++serial}`;
  return { path, knock: door(async () => answer()), url: `https://edge.test${path}` };
};
const knock = (url, headers = {}) => new Request(url, { method: "POST", headers, body: "{}" });
const SIGNED = { "x-hub-signature-256": "sha256=0000" };
const noted = () => tables.operator_pages.map((r) => [r.key, r.count]);

test("three signed knocks refused in a row, none let in, note the door for the pager once, and say so", async () => {
  const d = doorAt(() => refuse(401, "bad_signature"));
  const { lines } = await linesOf(async () => {
    for (let i = 0; i < 4; i++) assert.equal((await d.knock(knock(d.url, SIGNED))).status, 401);
  });
  const said = lines.filter((l) => l.event === "door_refuses_signed_knocks");
  assert.equal(said.length, 1, "said once, at the third");
  assert.deepEqual([said[0].level, said[0].door, said[0].refused], ["error", d.path, 3]);
  assert.deepEqual(noted(), [[`${DOOR_REFUSING_PAGE}:${d.path}`, 1]], "noted once, not again at the fourth");
});

test("a stranger's knock with no credential is never counted, so a scanner cannot trip it", async () => {
  const d = doorAt(() => refuse(401, "bad_signature"));
  for (let i = 0; i < 6; i++) await d.knock(knock(d.url));
  assert.deepEqual(noted(), []);
});

test("a knock let in sets the door's count back to nothing", async () => {
  let answer = () => refuse(401, "bad_signature");
  const d = doorAt(() => answer());
  for (let i = 0; i < 2; i++) await d.knock(knock(d.url, SIGNED));
  answer = () => json(200, { ok: true });
  await d.knock(knock(d.url, SIGNED));
  answer = () => refuse(401, "bad_signature");
  for (let i = 0; i < 2; i++) await d.knock(knock(d.url, SIGNED));
  assert.deepEqual(noted(), [], "two, one let in, two: never three in a row");
});

test("a door's answer about the act itself is not a refused credential; Twilio's TwiML and Stripe's 400 are", async () => {
  const business = doorAt(() => refuse(403, "ad_account_not_owner"));
  for (let i = 0; i < 3; i++) await business.knock(knock(business.url, { "x-edge-token": "t" }));
  assert.deepEqual(noted(), [], "an owner's press refused for whose account it is pages nobody");

  const twilio = doorAt(() => new Response("<Response/>", { status: 403, headers: { "content-type": "text/xml" } }));
  for (let i = 0; i < 3; i++) await twilio.knock(knock(twilio.url, { "x-twilio-signature": "s" }));
  const stripe = doorAt(() => refuse(400, "signature"));
  for (let i = 0; i < 3; i++) await stripe.knock(knock(stripe.url, { "stripe-signature": "t=1,v1=0" }));
  const admin = doorAt(() => refuse(403, "token_signature"));
  for (let i = 0; i < 3; i++) await admin.knock(knock(admin.url, { "x-edge-token": "t" }));
  assert.deepEqual(
    noted().map(([key]) => key),
    [twilio.path, stripe.path, admin.path].map((p) => `${DOOR_REFUSING_PAGE}:${p}`),
  );
});

test("the health sweep pages each door noted inside the window and told of by no page, and none other", async () => {
  const NOW = Date.parse("2026-11-28T20:00:00Z");
  const HOUR = 3_600_000;
  const iso = (ms) => new Date(ms).toISOString();
  const row = (key, lastAgoMs, alertedAgoMs = null) => ({
    key,
    first_at: iso(NOW - 2 * HOUR),
    last_at: iso(NOW - lastAgoMs),
    count: 1,
    alerted_at: alertedAgoMs === null ? null : iso(NOW - alertedAgoMs),
  });
  const db = fakeDb({
    operator_pages: [
      row(`${DOOR_REFUSING_PAGE}:/api/whatsapp`, HOUR),
      row(`${DOOR_REFUSING_PAGE}:/api/inbound-sms`, HOUR, HOUR / 2),
      row(`${DOOR_REFUSING_PAGE}:/api/instagram`, 7 * HOUR),
      row("db_answer_at_cap:contacts", HOUR),
    ],
  });
  const paged = [];
  const page = async (_ports, key, subject, body) => {
    paged.push({ key, subject, body });
    return "sent";
  };
  assert.equal(await watchRefusingDoors(db, { now: NOW, page }), 1);
  assert.deepEqual(
    paged.map((p) => [p.key, p.subject]),
    [[`${DOOR_REFUSING_PAGE}:/api/whatsapp`, "A door is refusing signed knocks: /api/whatsapp"]],
  );
  assert.match(paged[0].body, /no customer's message/);
  assert.match(paged[0].body, /META_APP_SECRET/);
});

test("WhatsApp's and Instagram's receivers say a refused signature in a line of their own", async () => {
  const bad = () =>
    new Request("https://edge.test/api/whatsapp", {
      method: "POST",
      headers: { "x-hub-signature-256": "sha256=0000" },
      body: JSON.stringify({ object: "whatsapp_business_account", entry: [] }),
    });
  const { result: wa, lines: waLines } = await linesOf(() => receiveWhatsappEvent(bad()));
  assert.equal(wa.status, 401);
  assert.deepEqual(
    waLines.filter((l) => l.event === "whatsapp_bad_signature").map((l) => [l.level, l.signed]),
    [["warn", true]],
  );
  const { result: ig, lines: igLines } = await linesOf(() => instagramReceiver(0)(bad()));
  assert.equal(ig.status, 401);
  assert.deepEqual(
    igLines.filter((l) => l.event === "instagram_bad_signature").map((l) => [l.level, l.signed]),
    [["warn", true]],
  );
});
