/**
 * The daily text canary (apps/edge/lib/sms/canary.ts, the inbound review of 3 Nov 2026, D6), run every way over a
 * database in memory and a provider that keeps a record: off until both its settings are set; the first tick of the day
 * sends the canary's words from its Messaging Service to the platform's line; a tick soon after waits; a later one asks
 * the database what became of the text and passes, or pages under the key that says what failed: never taken in, nothing
 * answered it, or its answer did not leave.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../_fake-db.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const { sweepCanary, CANARY_WORDS, CHECK_AFTER_MS, CHECK_WITHIN_MS } = await import(
  pathToFileURL(path.join(ROOT, "apps/edge/lib/sms/canary.ts")).href
);

const T = "aaaaaaaa-0000-4000-8000-0000000000c1";
const TO = "+13055550160";
const SERVICE = "MG00000000000000000000000000000c01";
const MASTER = { sid: "ACplatformmasteraccount", token: "master-token" };
const NOW = Date.parse("2026-11-03T14:15:00Z");
const LINE = {
  id: "11111111-0000-4000-8000-0000000000c1",
  tenant_id: T,
  e164: TO,
  provider: "twilio",
  subaccount_sid: "AC000000000000000000000000000000c1",
  messaging_service_sid: "MG000000000000000000000000000000c2",
  sms_state: "active",
  voice_state: "active",
};

/** A world: the line, its record of texts, the messages the database holds, and what was sent and paged. */
function world({ record = [], messages = [], set = true, refuse = false } = {}) {
  const db = fakeDb(
    { lines: [LINE], messages },
    {},
    { get_line_credentials: ({ p_line_id }) => (p_line_id === LINE.id ? { auth_token: "line-token" } : {}) },
  );
  const sent = [];
  const pages = [];
  const lines = [];
  const L = {
    info: (e, f) => lines.push([e, f]),
    warn: (e, f) => lines.push([e, f]),
    error: (e, f) => lines.push([e, f]),
  };
  const run = () =>
    sweepCanary(
      { db, L, started: NOW },
      {
        provider: {
          name: "twilio",
          master: MASTER,
          provider: {
            recentTexts: async (acct, to, since) => {
              assert.deepEqual([acct.sid, to, since], [LINE.subaccount_sid, TO, NOW - CHECK_WITHIN_MS]);
              return record;
            },
            sendSms: async (acct, o) => {
              sent.push({ acct, ...o });
              return refuse ? { ok: false, sid: null, status: 400 } : { ok: true, sid: "SMcanary", status: 201 };
            },
          },
        },
        service: set ? SERVICE : null,
        to: set ? TO : null,
        now: () => NOW,
        page: async (key, subject, body) => pages.push({ key, subject, body }),
      },
    );
  return { run, sent, pages, lines };
}

const canaryText = (agoMs) => ({ sid: "SMcanary", from: "+15550100199", body: CANARY_WORDS, atMs: NOW - agoMs });
const inbound = { id: "m-in", tenant_id: T, external_id: "SMcanary", direction: "inbound", meta: {} };
const reply = (status) => ({
  id: "m-out",
  tenant_id: T,
  direction: "outbound",
  status,
  meta: { reply_to: "m-in" },
  created_at: new Date(NOW - 60_000).toISOString(),
});

test("off until both its settings are set: nothing is read, sent or paged", async () => {
  const w = world({ set: false });
  assert.deepEqual(await (await w.run()).json(), { ok: true, off: "not_set" });
  assert.deepEqual([w.sent, w.pages], [[], []]);
});

test("the first tick of the day sends the canary's words from its service to the platform's line, on the master account", async () => {
  const w = world({ record: [{ sid: "SMother", from: "+16465550142", body: "a customer", atMs: NOW - 60_000 }] });
  assert.deepEqual(await (await w.run()).json(), { ok: true, step: "sent", sent: true });
  assert.deepEqual(w.sent, [{ acct: MASTER, serviceSid: SERVICE, to: TO, body: CANARY_WORDS }]);
  assert.deepEqual(w.pages, []);
});

test("a send Twilio refuses pages the platform: the answer path was not tried", async () => {
  const w = world({ refuse: true });
  await w.run();
  assert.deepEqual(
    w.pages.map((p) => p.key),
    ["canary_send_failed"],
  );
});

test("a tick soon after the send waits", async () => {
  const w = world({ record: [canaryText(CHECK_AFTER_MS / 2)] });
  assert.deepEqual(await (await w.run()).json(), { ok: true, step: "waiting" });
  assert.deepEqual([w.sent, w.pages], [[], []]);
});

test("a later tick judges the text: answered and gone passes; each failure pages under its own key", async () => {
  const late = [canaryText(CHECK_AFTER_MS + 60_000)];
  for (const [messages, passed, key] of [
    [[inbound, reply("delivered")], true, null],
    [[inbound, reply("sent")], true, null],
    [[], false, "canary_not_taken_in"],
    [[inbound], false, "canary_no_reply"],
    [[inbound, reply("failed")], false, "canary_reply_failed"],
  ]) {
    const w = world({ record: late, messages });
    const answer = await (await w.run()).json();
    assert.equal(answer.passed, passed, key ?? "passes");
    assert.deepEqual(
      w.pages.map((p) => p.key),
      key ? [key] : [],
    );
    assert.deepEqual(w.sent, [], "nothing new is sent on the day's check");
  }
});
