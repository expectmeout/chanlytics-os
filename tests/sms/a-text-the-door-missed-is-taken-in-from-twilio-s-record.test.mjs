/**
 * The texts sweep (apps/edge/lib/sms/texts-sweep.ts, the inbound review of 3 Nov 2026, B2; decision 0115, 00605), both
 * halves. The clock hands each workspace with a line that texts one texts_read job, one a workspace while one waits, and
 * reads no record itself. The job reads its own workspace's lines from Twilio's record and knocks on the door again only
 * for a text the database never heard: not one a message holds, not one a kept delivery holds, not a one-time code (the
 * door keeps none), and not one young enough that the door may be taking it in now. The knock is signed with the line's
 * own token over the door's URL and every field, as Twilio signs. That the real door takes it in, and holds a late one as
 * late, is run in sms-door.test.mjs.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { signTwilio } from "@chanlytics/channels/lines";
import { fakeDb } from "../_fake-db.mjs";
import { logLineOf } from "../_log-lines.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const { sweepUnheardTexts, textsReader } = await import(
  pathToFileURL(path.join(ROOT, "apps/edge/lib/sms/texts-sweep.ts")).href
);

/** How young a text the sweep leaves to the door, and the door it knocks on, as texts-sweep.ts says them. */
const TEXTS_SETTLE_MS = 2 * 60_000;
const TEXT_DOOR_PATH = "/api/inbound-sms";
const T = "aaaaaaaa-0000-4000-8000-0000000000a1";
const OTHER = "aaaaaaaa-0000-4000-8000-0000000000a2";
const CARRIER_ONLY = "aaaaaaaa-0000-4000-8000-0000000000a3";
const LINE = {
  id: "11111111-0000-4000-8000-000000000001",
  tenant_id: T,
  e164: "+13055550111",
  provider: "twilio",
  subaccount_sid: "AC00000000000000000000000000000001",
  messaging_service_sid: "MG00000000000000000000000000000001",
  sms_state: "active",
  voice_state: "active",
  created_at: "2026-10-01T00:00:00Z",
};
/** Another workspace's line, and a number a third kept at its carrier: no record of ours to read. */
const OTHERS_LINE = { ...LINE, id: "11111111-0000-4000-8000-000000000003", tenant_id: OTHER, e164: "+13055550113" };
const KEPT_AT_CARRIER = {
  ...LINE,
  id: "11111111-0000-4000-8000-000000000002",
  tenant_id: CARRIER_ONLY,
  e164: "+13055550112",
  provider: "carrier",
};
const TOKEN = "line-token-for-this-file";
const ORIGIN = "https://edge.example";
const NOW = Date.parse("2026-11-03T12:00:00Z");
const ago = (ms) => NOW - ms;

/** A received text in Twilio's record. */
const text = (sid, over = {}) => ({
  sid,
  from: "+16465550142",
  body: "Are you open Saturday?",
  atMs: ago(60 * 60_000),
  ...over,
});

/** The edge's log lines a call wrote, read back. */
async function logged(fn) {
  const lines = [];
  const real = { log: console.log, warn: console.warn, error: console.error };
  for (const k of Object.keys(real)) console[k] = (...args) => lines.push(args);
  try {
    return { result: await fn(), lines: lines.map(logLineOf).filter(Boolean) };
  } finally {
    Object.assign(console, real);
  }
}

function world({ record = [], heard = [], kept = [], read } = {}) {
  const tables = {
    lines: [LINE, OTHERS_LINE, KEPT_AT_CARRIER],
    messages: heard.map((sid, i) => ({ id: `m${i}`, tenant_id: T, external_id: sid, channel: "sms" })),
    provider_events: kept.map((sid) => ({ provider: "twilio", provider_event_id: sid, door: TEXT_DOOR_PATH })),
    jobs: [],
  };
  const db = fakeDb(
    tables,
    {},
    { get_line_credentials: ({ p_line_id }) => (p_line_id === LINE.id ? { auth_token: TOKEN } : {}) },
  );
  const knocks = [];
  const asked = [];
  const edge = {
    door: async (request) => {
      knocks.push(request);
      return new Response("<Response/>", { status: 200 });
    },
    provider: {
      name: "twilio",
      provider: {
        recentTexts: async (acct, to, since) => {
          asked.push({ acct, to, since });
          if (read) throw read;
          return record;
        },
      },
    },
    origin: ORIGIN,
    now: () => NOW,
  };
  const clockLines = [];
  const L = {
    info: (e, f) => clockLines.push([e, f]),
    warn: (e, f) => clockLines.push([e, f]),
    error: (e, f) => clockLines.push([e, f]),
  };
  return {
    tables,
    knocks,
    asked,
    clockLines,
    tick: () => sweepUnheardTexts({ db, L, started: NOW }, edge),
    job: (deadline = NOW + 45_000) => logged(() => textsReader(db, edge).read({ tenant_id: T }, deadline)),
  };
}

/** A knock's form, read back, and whether its signature is the one Twilio would have sent. */
async function opened(request) {
  const form = Object.fromEntries(new URLSearchParams(await request.text()));
  const signed = request.headers.get("x-twilio-signature") === (await signTwilio(TOKEN, request.url, form));
  return { url: request.url, form, signed };
}

test("the clock hands each workspace with a line that texts one texts_read, reads no record, and hands none twice", async () => {
  const w = world({ record: [text("SMunheard")] });
  assert.deepEqual(await (await w.tick()).json(), { ok: true, workspaces: 2, handed: 2 });
  assert.deepEqual(
    w.tables.jobs.map((j) => [j.kind, j.tenant_id, j.payload]).sort((a, b) => a[1].localeCompare(b[1])),
    [
      ["texts_read", T, {}],
      ["texts_read", OTHER, {}],
    ],
    "one job a workspace with a line that texts; a number kept at its carrier is none",
  );
  assert.deepEqual([w.asked, w.knocks], [[], []], "the clock reads no record and knocks for nothing");
  assert.deepEqual(
    await (await w.tick()).json(),
    { ok: true, workspaces: 2, handed: 0 },
    "one a workspace while one waits",
  );
  assert.deepEqual(
    w.clockLines.map(([e, f]) => [e, f.handed]),
    [
      ["texts_swept", 2],
      ["texts_swept", 0],
    ],
  );
});

test("a job knocks only for its own workspace's settled text nobody heard, signed as Twilio signs, carrying when it was sent", async () => {
  const w = world({
    record: [
      text("SMunheard"),
      text("SMmessage"),
      text("SMkept"),
      text("SMcode", { body: "Your Apple ID Code is: 123456. Don't share it with anyone." }),
      text("SMyoung", { atMs: ago(TEXTS_SETTLE_MS / 2) }),
    ],
    heard: ["SMmessage"],
    kept: ["SMkept"],
  });
  const { result, lines } = await w.job();
  assert.deepEqual(result, { read: { lines: 1, read: 5, unheard: 1, taken: 1, failed: 0, left: 0 } });
  assert.deepEqual(
    w.asked.map((a) => [a.acct.sid, a.to, a.since]),
    [[LINE.subaccount_sid, LINE.e164, ago(24 * 60 * 60_000)]],
    "the workspace's own line, its account, its number, the last day; another workspace's line is its own job's",
  );
  assert.equal(w.knocks.length, 1);
  const k = await opened(w.knocks[0]);
  assert.equal(k.url, `${ORIGIN}${TEXT_DOOR_PATH}`, "the door Twilio posts to");
  assert.ok(k.signed, "signed with the line's token over the URL and every field");
  assert.deepEqual(k.form, {
    MessageSid: "SMunheard",
    AccountSid: LINE.subaccount_sid,
    From: "+16465550142",
    To: LINE.e164,
    Body: "Are you open Saturday?",
    NumMedia: "0",
    DateSent: new Date(ago(60 * 60_000)).toISOString(),
    MessagingServiceSid: LINE.messaging_service_sid,
  });
  const said = JSON.stringify(lines);
  assert.ok(!said.includes("+16465550142") && !said.includes("Saturday"), "the lines name no number and no words");
  assert.deepEqual(
    lines.map((l) => l.event),
    ["text_unheard_taken_in", "texts_read"],
  );
});

test("everything heard: nothing is knocked for", async () => {
  const w = world({ record: [text("SMa"), text("SMb")], heard: ["SMa"], kept: ["SMb"] });
  assert.deepEqual((await w.job()).result, {
    read: { lines: 1, read: 2, unheard: 0, taken: 0, failed: 0, left: 0 },
  });
  assert.equal(w.knocks.length, 0);
});

test("a record that cannot be read is said, counted, and costs only its line", async () => {
  const w = world({ read: new Error("provider timeout") });
  const { result, lines } = await w.job();
  assert.deepEqual(result, { read: { lines: 1, read: 0, unheard: 0, taken: 0, failed: 1, left: 0 } });
  assert.deepEqual(
    lines.map((l) => [l.event, l.line ?? null]),
    [
      ["texts_read_failed", LINE.id],
      ["texts_read", null],
    ],
  );
});

test("a job past its deadline starts no line: the line is left for the next tick", async () => {
  const w = world({ record: [text("SMunheard")] });
  assert.deepEqual((await w.job(NOW - 1)).result, {
    read: { lines: 0, read: 0, unheard: 0, taken: 0, failed: 0, left: 1 },
  });
  assert.deepEqual([w.asked, w.knocks], [[], []]);
});

test("no line provider, or no origin to knock at: the clock hands out nothing, and a job reads nothing", async () => {
  for (const [edge, skipped] of [
    [{ provider: null, origin: ORIGIN }, "no_line_provider"],
    [{ provider: { name: "twilio", provider: {} }, origin: null }, "no_origin"],
  ]) {
    const lines = [];
    const L = { info: (e, f) => lines.push([e, f]), warn() {}, error() {} };
    const db = fakeDb({ lines: [LINE], jobs: [] });
    const world_ = { door: async () => assert.fail("no knock"), now: () => NOW, ...edge };
    const answer = await sweepUnheardTexts({ db, L, started: NOW }, world_);
    assert.deepEqual([answer.status, lines[0][1].skipped], [200, skipped]);
    assert.deepEqual(await textsReader(db, world_).read({ tenant_id: T }, NOW + 45_000), {
      skipped: "no line that texts",
    });
  }
});
