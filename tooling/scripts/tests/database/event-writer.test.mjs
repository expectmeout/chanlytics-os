/**
 * The ledger's one writer (packages/db events.ts), run over a database in memory: a kind files under its own category
 * at its own version, never a caller's; the subject is a row or nothing; a writer whose next step needs the row hears
 * when it did not land (recordEvent), and a best-effort one never throws (emitEvent). What the compiler holds -- each
 * kind's data, and that every kind written is declared -- is events.type-test.ts's.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { DB_REQUEST_HEADER, emitEvent, namedFetch, observeDb, recordEvent } from "@chanlytics/db";
import { logger, requestId, withRequestId } from "@chanlytics/channels";
import { SHARED_EVENT_SHAPES, SHARED_EVENT_VERSIONS } from "@chanlytics/contracts";
import { fakeDb } from "../_fake-db.mjs";
import { createBearerClient } from "../../../../apps/dashboard/src/lib/supabase/server.ts";
import { fieldsOf, logLineOf } from "../_log-lines.mjs";

const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

test("a kind files under its own category, at its own version, about its subject", async () => {
  const t = { events: [] };
  const db = fakeDb(t);
  await emitEvent(db, T, "line.failed", "line", "l1", { step: "buy", error: "x", provider: "twilio", by: null });
  await emitEvent(db, T, "ingest.unroutable", null, null, { channel: "email", addresses: ["a@example.com"] });
  await emitEvent(db, T, "channel.account_update", "channel", "c1", { waba_id: "w1", event: "x" });
  assert.deepEqual(
    t.events.map((e) => [e.kind, e.category, e.version, e.subject_type, e.subject_id]),
    [
      ["line.failed", "setup", 1, "line", "l1"],
      ["ingest.unroutable", "ingest", 1, null, null],
      ["channel.account_update", "system", 1, "channel", "c1"],
    ],
    "the category and the version are the kind's, from the one table",
  );
  assert.deepEqual(t.events[0].data, { step: "buy", error: "x", provider: "twilio", by: null }, "the data as given");
});

test("a writer that needs the row hears when it did not land; a best-effort one logs it and carries on", async () => {
  const db = fakeDb({ events: [] }, { "events.insert": { message: "permission denied for table events" } });
  const r = await recordEvent(db, T, "platform.acted", "line", "l1", { action: "retry", by: "u1", by_email: null });
  assert.deepEqual(r, { error: "permission denied for table events" });
  const said = [];
  const real = console.error;
  console.error = (...a) => said.push(logLineOf(a));
  try {
    await emitEvent(db, T, "message.sent", "message", "m1", { sender: "human" });
  } finally {
    console.error = real;
  }
  assert.deepEqual(
    said.map((l) => [l.level, l.event, fieldsOf(l)]),
    [
      [
        "error",
        "emit_event_failed",
        { tenant_id: T, kind: "message.sent", error: "permission denied for table events" },
      ],
    ],
    "one logger line, the workspace and the kind named, not positional values",
  );
  const fine = await recordEvent(fakeDb({ events: [] }), T, "lead.emailed", "lead", "d1", {
    by: "reach_out",
    send_id: "s1",
  });
  assert.deepEqual(fine, { error: null });
});

test("the three kinds with a writer on each side are filed at the one declared version, and what TypeScript writes is the declared shape", async () => {
  const t = { events: [] };
  const db = fakeDb(t);
  // The three callers as they are: the calendar sweep, the carrier's opt-out, a line the back office retried.
  await emitEvent(db, T, "contact.added", "contact", "c1", {
    source: "calendar",
    title: "Fitting",
    uid: "u1@example.com",
    start: "2026-09-30T14:00:00.000Z",
  });
  await emitEvent(db, T, "contact.consent_changed", "contact", "c1", {
    consent: "opted_out",
    previous: "opted_in",
    source: "carrier_stop",
    channel: "sms",
  });
  await emitEvent(db, T, "platform.acted", "line", "l1", { action: "retry", by: "u1", by_email: "ops@example.com" });
  assert.deepEqual(
    t.events.map((e) => [e.kind, e.version]),
    Object.entries(SHARED_EVENT_VERSIONS),
    "each files at the version contracts declares: the one place a version is written",
  );
  for (const e of t.events) {
    const parsed = SHARED_EVENT_SHAPES[e.kind].safeParse(e.data);
    assert.ok(parsed.success, `${e.kind}: ${parsed.success ? "" : parsed.error.message}`);
  }
});

test("a row says the request it was written in: the writer stamps it, and every call the database client makes names it", async () => {
  // What an app does as its logger loads (apps/edge/lib/log.ts, apps/dashboard/src/server/log.ts).
  observeDb({ log: logger(), requestId });
  const t = { events: [] };
  const db = fakeDb(t);
  await emitEvent(db, T, "message.sent", "message", "m0", { sender: "human" });
  await withRequestId("iad1::req-0123456789", () =>
    emitEvent(db, T, "message.sent", "message", "m1", { sender: "human" }),
  );
  assert.deepEqual(
    t.events.map((e) => [e.subject_id, e.request_id]),
    [
      ["m0", undefined],
      ["m1", "iad1::req-0123456789"],
    ],
    "outside a request there is nothing to say; inside one the row names it",
  );
  // The same name rides to the database on every call, so a SQL function writing to the ledger in that request can say
  // it too (00279: events.request_id's default reads it from the header).
  const sent = [];
  const fetch = namedFetch(async (url, init) => {
    sent.push(new Headers(init?.headers).get(DB_REQUEST_HEADER));
    return new Response("{}");
  });
  await fetch("https://db.example.com/rest/v1/events", { headers: { apikey: "k" } });
  await withRequestId("iad1::req-0123456789", () =>
    fetch("https://db.example.com/rest/v1/events", { headers: { apikey: "k" } }),
  );
  assert.deepEqual(sent, [null, "iad1::req-0123456789"]);
});

test("the member's own client names the request too: a SQL function a click calls writes the ledger's row under the click's name", async () => {
  const env = { url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY };
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:1";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-for-this-case";
  const realFetch = globalThis.fetch;
  const sent = [];
  globalThis.fetch = async (_url, init) => {
    sent.push(new Headers(init?.headers).get(DB_REQUEST_HEADER));
    return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const member = createBearerClient("a.token.value");
    await withRequestId("iad1::req-0123456789", async () => await member.rpc("set_contact_consent", {}));
    await member.rpc("set_contact_consent", {});
  } finally {
    globalThis.fetch = realFetch;
    if (env.url === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = env.url;
    if (env.key === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = env.key;
  }
  assert.deepEqual(sent, ["iad1::req-0123456789", null], "named inside a request, as it came outside one");
});

test("a database the migration has not reached still takes the row: without the request's name, once, and only for that refusal", async () => {
  observeDb({ log: logger(), requestId });
  const stubbed = (...answers) => {
    const inserted = [];
    const db = {
      from: () => ({
        insert: async (row) => {
          inserted.push(row);
          return { error: answers.shift() ?? null };
        },
      }),
    };
    return { db, inserted };
  };
  const noColumn = {
    code: "PGRST204",
    message: "Could not find the 'request_id' column of 'events' in the schema cache",
  };
  const before = stubbed(noColumn);
  const written = await withRequestId("iad1::req-0123456789", () =>
    recordEvent(before.db, T, "message.sent", "message", "m1", { sender: "human" }),
  );
  assert.deepEqual(written, { error: null });
  assert.deepEqual(
    before.inserted.map((row) => "request_id" in row),
    [true, false],
    "tried with the name, then without it",
  );
  // Any other refusal is the row's own: not asked twice.
  const refused = stubbed({ code: "42501", message: "permission denied for table events" });
  const out = await withRequestId("iad1::req-0123456789", () =>
    recordEvent(refused.db, T, "message.sent", "message", "m2", { sender: "human" }),
  );
  assert.deepEqual([out, refused.inserted.length], [{ error: "permission denied for table events" }, 1]);
});
