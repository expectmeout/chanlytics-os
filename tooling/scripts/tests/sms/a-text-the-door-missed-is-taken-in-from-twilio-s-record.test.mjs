/**
 * The texts sweep (apps/edge/lib/sms/texts-sweep.ts, the inbound review of 3 Nov 2026, B2): what it reads and what it
 * knocks on the door again for. Twilio retries nothing, so a text the door could not take in is read back from Twilio's
 * own record of the line, and only a text the database never heard is knocked for: not one a message holds, not one a
 * kept delivery holds, not a one-time code (the door keeps none), and not one young enough that the door may be taking it
 * in now. The knock is signed with the line's own token over the door's URL and every field, as Twilio signs. That the
 * real door takes it in, and holds a late one as late, is run in sms-door.test.mjs.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { twilioSignature } from "@chanlytics/channels";
import { fakeDb } from "../_fake-db.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const { sweepUnheardTexts } = await import(pathToFileURL(path.join(ROOT, "apps/edge/lib/sms/texts-sweep.ts")).href);

/** How young a text the sweep leaves to the door, and the door it knocks on, as texts-sweep.ts says them. */
const TEXTS_SETTLE_MS = 2 * 60_000;
const TEXT_DOOR_PATH = "/api/inbound-sms";
const T = "aaaaaaaa-0000-4000-8000-0000000000a1";
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
/** A number the business kept at its carrier: no record of ours to read. */
const KEPT_AT_CARRIER = {
  ...LINE,
  id: "11111111-0000-4000-8000-000000000002",
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

function world({ record, heard = [], kept = [], read } = {}) {
  const tables = {
    lines: [LINE, KEPT_AT_CARRIER],
    messages: heard.map((sid, i) => ({ id: `m${i}`, tenant_id: T, external_id: sid, channel: "sms" })),
    provider_events: kept.map((sid) => ({ provider: "twilio", provider_event_id: sid, door: TEXT_DOOR_PATH })),
  };
  const db = fakeDb(
    tables,
    {},
    { get_line_credentials: ({ p_line_id }) => (p_line_id === LINE.id ? { auth_token: TOKEN } : {}) },
  );
  const knocks = [];
  const asked = [];
  const lines = [];
  const L = {
    info: (e, f) => lines.push([e, f]),
    warn: (e, f) => lines.push([e, f]),
    error: (e, f) => lines.push([e, f]),
  };
  const sweep = () =>
    sweepUnheardTexts(
      { db, L, started: NOW },
      {
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
      },
    );
  return { sweep, knocks, asked, lines };
}

/** A knock's form, read back, and whether its signature is the one Twilio would have sent. */
async function opened(request) {
  const form = Object.fromEntries(new URLSearchParams(await request.text()));
  const signed = request.headers.get("x-twilio-signature") === (await twilioSignature(TOKEN, request.url, form));
  return { url: request.url, form, signed };
}

test("only a settled text nobody heard is knocked for, signed as Twilio signs, carrying when it was sent", async () => {
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
  const answer = await w.sweep();
  assert.deepEqual(await answer.json(), { ok: true, lines: 1, read: 5, unheard: 1, taken: 1, failed: 0 });
  assert.deepEqual(
    w.asked.map((a) => [a.acct.sid, a.to, a.since]),
    [[LINE.subaccount_sid, LINE.e164, ago(24 * 60 * 60_000)]],
    "the line's own account, its number, the last day; a number kept at its carrier is not read",
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
  const said = JSON.stringify(w.lines);
  assert.ok(!said.includes("+16465550142") && !said.includes("Saturday"), "the lines name no number and no words");
  assert.deepEqual(
    w.lines.map(([e]) => e),
    ["text_unheard_taken_in", "texts_swept"],
  );
});

test("everything heard: nothing is knocked for", async () => {
  const w = world({ record: [text("SMa"), text("SMb")], heard: ["SMa"], kept: ["SMb"] });
  assert.deepEqual(await (await w.sweep()).json(), { ok: true, lines: 1, read: 2, unheard: 0, taken: 0, failed: 0 });
  assert.equal(w.knocks.length, 0);
});

test("a record that cannot be read is said, counted, and costs only its line", async () => {
  const w = world({ record: [], read: new Error("provider timeout") });
  assert.deepEqual(await (await w.sweep()).json(), { ok: true, lines: 1, read: 0, unheard: 0, taken: 0, failed: 1 });
  assert.deepEqual(
    w.lines.map(([e, f]) => [e, f.line ?? null]),
    [
      ["texts_read_failed", LINE.id],
      ["texts_swept", null],
    ],
  );
});

test("no line provider, or no origin to knock at: nothing is read", async () => {
  for (const [world_, skipped] of [
    [{ provider: null, origin: ORIGIN }, "no_line_provider"],
    [{ provider: { name: "twilio", provider: {} }, origin: null }, "no_origin"],
  ]) {
    const lines = [];
    const L = { info: (e, f) => lines.push([e, f]), warn() {}, error() {} };
    const answer = await sweepUnheardTexts(
      { db: fakeDb({}), L, started: NOW },
      { door: async () => assert.fail("no knock"), now: () => NOW, ...world_ },
    );
    assert.equal(answer.status, 200);
    assert.equal(lines[0][1].skipped, skipped);
  }
});
