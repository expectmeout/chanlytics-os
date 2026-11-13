/**
 * The daily text canary (apps/edge/lib/sms/canary.ts, the inbound review of 3 Nov 2026, D6), run every way over a
 * database in memory and a provider that keeps a record: off until both its settings are set; the first tick of the day
 * sends the canary's words from its Messaging Service to the platform's line; a tick soon after waits; a later one asks
 * the database what became of the text and passes, or pages under the key that says what failed: never taken in, nothing
 * answered it, or its answer did not leave. And a check that is not checking is no pass: off where a line texts, or a
 * record that could not be read, is told to the platform, once a day.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../_fake-db.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { sweepCanary } = await import(at("apps/edge/lib/sms/canary.ts"));
const { pageOperator } = await import(at("apps/edge/lib/shared/alerts/page-operator.ts"));

/** The canary's words and its two waits, as canary.ts says them: held here so a change to them is a change seen. */
const CANARY_WORDS = "Hi! Are you open today? (a daily check from Chanlytics)";
const CHECK_AFTER_MS = 10 * 60_000;
const CHECK_WITHIN_MS = 45 * 60_000;
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

/**
 * A world: the lines on file, the canary line's record of texts (or a read of it that fails), the messages the database
 * holds, whether this deployment holds a line provider, and what was sent and paged.
 */
function world({
  record = [],
  messages = [],
  set = true,
  refuse = false,
  lines: onFile = [LINE],
  provider = true,
  unreadable = false,
  tables = {},
  page = null,
} = {}) {
  const db = fakeDb(
    { lines: onFile, messages, ...tables },
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
  const run = (now = NOW) =>
    sweepCanary(
      { db, L, started: now },
      {
        provider: provider
          ? {
              name: "twilio",
              master: MASTER,
              provider: {
                recentTexts: async (acct, to, since) => {
                  assert.deepEqual([acct.sid, to, since], [LINE.subaccount_sid, TO, now - CHECK_WITHIN_MS]);
                  if (unreadable) throw new Error("twilio 503 (secret-ish)");
                  return record;
                },
                sendSms: async (acct, o) => {
                  sent.push({ acct, ...o });
                  return refuse ? { ok: false, sid: null, status: 400 } : { ok: true, sid: "SMcanary", status: 201 };
                },
              },
            }
          : null,
        service: set ? SERVICE : null,
        to: set ? TO : null,
        now: () => now,
        page: page
          ? (key, subject, body) => page(db, now, key, subject, body)
          : async (key, subject, body) => pages.push({ key, subject, body }),
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

test("off until both its settings are set, and with no line that texts it is silent: nothing is sent or paged", async () => {
  for (const onFile of [[], [{ ...LINE, provider: "carrier" }], [{ ...LINE, voice_state: "failed" }]]) {
    const w = world({ set: false, lines: onFile });
    assert.deepEqual(await (await w.run()).json(), { ok: true, off: "not_set" });
    assert.deepEqual([w.sent, w.pages], [[], []], JSON.stringify(onFile[0]?.provider ?? "no line"));
  }
});

test("REGRESSION: switched off where a line texts is told, not passed -- the check ran green every day having never checked anything", async () => {
  // Off for want of its two settings, the state production was in on 13 Nov 2026: a clock that answered 200 daily and
  // a line that texts, with no canary ever sent. The platform is told what to set; nothing is sent.
  const unset = world({ set: false });
  assert.deepEqual(await (await unset.run()).json(), { ok: true, off: "not_set" });
  assert.deepEqual(unset.sent, []);
  assert.deepEqual(
    unset.pages.map((p) => [p.key, p.subject]),
    [["text_canary_off", "The daily text check is not checking"]],
  );
  assert.match(unset.pages[0].body, /CANARY_SMS_SERVICE/);
  assert.match(unset.pages[0].body, /CANARY_SMS_TO/);

  // Set, but naming no line on file, while another line texts: off all the same, and said in its own words.
  const elsewhere = world({ lines: [{ ...LINE, e164: "+13055550161" }] });
  assert.deepEqual(await (await elsewhere.run()).json(), { ok: true, off: "no_line" });
  assert.deepEqual(
    elsewhere.pages.map((p) => p.key),
    ["text_canary_off"],
  );
  assert.match(elsewhere.pages[0].body, /names no line on file/);
  assert.notEqual(elsewhere.pages[0].body, unset.pages[0].body, "each reason says what to do about it");

  // And a deployment that holds no line provider cannot check the lines it has on file.
  const keyless = world({ provider: false });
  assert.deepEqual(await (await keyless.run()).json(), { ok: true, off: "no_line_provider" });
  assert.deepEqual(
    keyless.pages.map((p) => p.key),
    ["text_canary_off"],
  );
});

test("REGRESSION: a record that could not be read is told and is no pass -- it answered ok and said nothing to anyone", async () => {
  const w = world({ unreadable: true });
  const answer = await (await w.run()).json();
  assert.deepEqual(answer, { ok: true, step: "read_failed" });
  assert.equal(answer.passed, undefined, "nothing was judged");
  assert.deepEqual(w.sent, [], "nothing is sent blind");
  assert.deepEqual(
    w.pages.map((p) => [p.key, p.subject]),
    [["text_canary_unread", "The daily text check could not read the line's record"]],
  );
  assert.ok(!JSON.stringify(w.pages).includes("secret-ish"), "the provider's own words stay in the log");
});

test("off is told once a day: the day's two ticks are one page, by the pager's own window, and the next day's is another", async () => {
  process.env.LEAD_TO = "ops@platform.test";
  process.env.LEAD_FROM = "Pager <pager@platform.test>";
  const mail = [];
  const page = (db, now, key, subject, body) =>
    pageOperator({ db, now: () => now, send: async (_from, _to, s) => (mail.push(s), true) }, key, subject, body);
  const w = world({ set: false, tables: { operator_pages: [] }, page });
  await w.run(NOW - 15 * 60_000); // 14:00
  await w.run(NOW); // 14:15
  assert.deepEqual(mail, ["[Chanlytics] The daily text check is not checking"]);
  await w.run(NOW + 24 * 3600_000 - 15 * 60_000); // the next day's 14:00
  assert.equal(mail.length, 2);
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
    ["text_canary_send_failed"],
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
    [[], false, "text_canary_not_taken_in"],
    [[inbound], false, "text_canary_no_reply"],
    [[inbound, reply("failed")], false, "text_canary_reply_failed"],
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
