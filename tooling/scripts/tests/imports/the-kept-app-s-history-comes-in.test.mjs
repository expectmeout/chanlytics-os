/**
 * What a kept WhatsApp Business app brings (coexistence; decision 0073, R12, R21), run: Meta's wire read
 * (channels sharedHistoryOf, contactsSyncedOf), the ledger's words for it (contracts whatsappPartsOf, importLineOf), and
 * the history job's two WhatsApp runners over a database in memory, called as the job runner calls them
 * (lib/imports/history-import.ts historyImports): the ask of Meta as the number connects, its settling a day later,
 * and a kept delivery's chats and contacts brought a slice a part. Every claim below is something the code returned,
 * wrote or sent.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { contactsSyncedOf, sharedHistoryOf, WA_HISTORY_NOT_SHARED } from "@chanlytics/channels";
import {
  DAY_MS,
  IMPORT_STOPPED_WORDS,
  importLineOf,
  whatsappPartsOf,
  WHATSAPP_PART_WORDS,
} from "@chanlytics/contracts";
import { fakeDb } from "../_fake-db.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { historyImports, startWhatsappHistory } = await import(at("apps/edge/lib/imports/history-import.ts"));
const { SETTLE_AFTER_MS, HISTORY_PARTS } = await import(at("apps/edge/lib/imports/whatsapp-history.ts"));
const { GRAPH_VERSION } = await import(at("apps/edge/lib/whatsapp/meta-graph.ts"));

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CHANNEL = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const PHONE_ID = "1234567890123";
const OTHER_PHONE_ID = "9876543210987";
const BUSINESS = "15555550100";
const KEY = "sha256:" + "ab".repeat(32);
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

/** The job's log lines, kept instead of printed. */
const real = { log: console.log, warn: console.warn, error: console.error };
const lines = [];
for (const k of Object.keys(real)) console[k] = (...a) => lines.push(a.map(String).join(" "));
after(() => Object.assign(console, real));

/* ------------------------------------------------------------------ Meta's wire, read */

/** A message of a shared chat, as Meta's `history` webhook carries one. */
const said = (id, secs, from, over = {}) => ({
  id,
  timestamp: String(secs),
  from,
  type: "text",
  text: { body: `words ${id}` },
  ...over,
});

test("a history chunk read: each message named by its chat, the business's own told by its `to` or by its number, words or a caption, media kept as media, and what has no id or no time left out", () => {
  const v = {
    metadata: { phone_number_id: PHONE_ID, display_phone_number: "+1 555-555-0100" },
    history: [
      {
        metadata: { phase: 1, chunk_order: 2, progress: 40 },
        threads: [
          {
            id: "15555550111",
            messages: [
              said("wamid.1", 1760000000, "15555550111"),
              said("wamid.2", 1760000100, BUSINESS, { to: "15555550111" }),
              said("wamid.3", 1760000200, BUSINESS),
              {
                id: "wamid.4",
                timestamp: "1760000300",
                from: "15555550111",
                type: "image",
                image: { caption: " a photo " },
              },
              { id: "wamid.5", timestamp: "1760000400", from: "15555550111", type: "media_placeholder" },
              { timestamp: "1760000500", from: "15555550111", type: "text", text: { body: "no id" } },
              { id: "wamid.7", from: "15555550111", type: "text", text: { body: "no time" } },
            ],
          },
        ],
      },
      { metadata: { phase: 0, progress: 20 }, threads: [{ id: "", messages: [said("wamid.8", 1760000600, "1")] }] },
    ],
  };
  const h = sharedHistoryOf(v);
  assert.equal(h.phase, 1, "the furthest phase any chunk says");
  assert.equal(h.progress, 40);
  assert.equal(h.declined, false);
  assert.deepEqual(
    h.messages.map((m) => [m.messageId, m.thread, m.direction, m.type, m.body]),
    [
      ["wamid.1", "15555550111", "inbound", "text", "words wamid.1"],
      ["wamid.2", "15555550111", "outbound", "text", "words wamid.2"],
      ["wamid.3", "15555550111", "outbound", "text", "words wamid.3"],
      ["wamid.4", "15555550111", "inbound", "media", "a photo"],
      ["wamid.5", "15555550111", "inbound", "media", null],
    ],
    "a chat with no id is nobody's, and a message with no id or no time is never kept",
  );
  assert.equal(h.messages[0].at, new Date(1760000000 * 1000).toISOString());
});

test("a history the business declined to share (Meta's 2593109) is said as declined, on the value or on a chunk", () => {
  const notShared = {
    code: WA_HISTORY_NOT_SHARED,
    title: "History sync is turned off by the business from the WhatsApp Business App",
  };
  assert.equal(sharedHistoryOf({ errors: [notShared] }).declined, true);
  assert.equal(sharedHistoryOf({ history: [{ errors: [notShared] }] }).declined, true);
  assert.equal(
    sharedHistoryOf({ history: [{ errors: [{ code: 131000 }] }] }).declined,
    false,
    "another error is not a no",
  );
});

test("the app's contacts read: what is added, with its number dialled and its name; a removal, a short number and what is no contact change nothing", () => {
  assert.deepEqual(
    contactsSyncedOf({
      state_sync: [
        { type: "contact", action: "add", contact: { full_name: "Dana Reyes", phone_number: "15555550112" } },
        { type: "contact", action: "add", contact: { first_name: "Sam", phone_number: "+1 (555) 555-0113" } },
        { type: "contact", action: "add", contact: { phone_number: "15555550114" } },
        { type: "contact", action: "remove", contact: { phone_number: "15555550115" } },
        { type: "contact", action: "add", contact: { full_name: "Too short", phone_number: "555" } },
        { type: "group", action: "add", contact: { phone_number: "15555550116" } },
      ],
    }),
    [
      { phone: "+15555550112", name: "Dana Reyes" },
      { phone: "+15555550113", name: "Sam" },
      { phone: "+15555550114", name: null },
    ],
  );
});

/* ------------------------------------------------------------------ the ledger's words */

/** A row of the imports ledger, as the page reads it. */
const row = (over = {}) => ({
  source: "whatsapp_history",
  state: "running",
  counts: {},
  parts_done: 0,
  parts_total: HISTORY_PARTS,
  oldest: null,
  started_at: "2026-10-25T12:00:00Z",
  finished_at: null,
  last_error: null,
  via: "whatsapp",
  ...over,
});

test("the chats in Meta's three parts (5B·i): in, coming in or next by the parts Meta finished, each reaching back from when the run started; none for a run that stopped", () => {
  const W = WHATSAPP_PART_WORDS;
  assert.deepEqual(
    whatsappPartsOf(row({ parts_done: 1 })).map((p) => [p.key, p.state, p.stand]),
    [
      ["day", "done", W.in],
      ["quarter", "running", W.coming],
      ["half", "next", W.next],
    ],
  );
  const parts = whatsappPartsOf(row({ parts_done: 1 }));
  assert.equal(parts[0].says, W.lastDay);
  assert.match(parts[1].says, /^Back to /);
  assert.ok(
    whatsappPartsOf(row({ state: "done" })).every((p) => p.state === "done"),
    "a done run is in, whole",
  );
  assert.deepEqual(whatsappPartsOf(row({ state: "failed" })), []);
  assert.deepEqual(whatsappPartsOf(row({ source: "mailbox" })), []);
  assert.deepEqual(whatsappPartsOf(null), []);
});

test("a stop on what Meta offers once has no Try again; a mailbox's stop has one", () => {
  const stopped = importLineOf(row({ state: "failed", last_error: IMPORT_STOPPED_WORDS.notShared }));
  assert.equal(stopped.retry, false);
  assert.equal(stopped.says, IMPORT_STOPPED_WORDS.notShared);
  assert.equal(importLineOf(row({ source: "whatsapp_contacts", state: "failed" })).retry, false);
  assert.equal(importLineOf(row({ source: "mailbox", state: "failed" })).retry, true);
});

/* ------------------------------------------------------------------ the runners, over a database in memory */

/**
 * The database the runners find: the workspace's number (and another workspace's), the ledger's rows, the jobs, and
 * the deliveries the intake ledger kept. ingest_before and import_ledger_note answer from memory and keep what they
 * were asked; get_channel_credentials hands the number's token.
 */
function world(over = {}) {
  const kept = [];
  const notes = [];
  const tables = {
    tenants: [
      { id: A, slug: "a", name: "A", timezone: "America/New_York", status: "active" },
      { id: B, slug: "b", name: "B", timezone: "America/New_York", status: "active" },
    ],
    tenant_channels: [
      {
        id: CHANNEL,
        tenant_id: A,
        kind: "whatsapp",
        external_id: PHONE_ID,
        status: "active",
        credentials_ref: "vault-a",
        number_e164: "+15555550100",
        config: {},
        created_at: "2026-10-25T11:00:00Z",
      },
      {
        id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        tenant_id: B,
        kind: "whatsapp",
        external_id: OTHER_PHONE_ID,
        status: "active",
        credentials_ref: "vault-b",
        number_e164: "+15555550199",
        config: {},
        created_at: "2026-10-25T11:00:00Z",
      },
    ],
    imports: [],
    jobs: [],
    provider_events: [],
    contacts: [],
    contact_identities: [],
    ...over,
  };
  const db = fakeDb(
    tables,
    {},
    {
      ingest_before: (args) => {
        kept.push(args);
        return {
          is_new: true,
          conversation_id: "c-" + args.p_external,
          contact_id: "p-" + args.p_external,
          person: kept.filter((k) => k.p_external === args.p_external).length === 1 ? "new" : "known",
        };
      },
      import_ledger_note: (args) => {
        notes.push(args);
        const i = tables.imports.findIndex((r) => r.tenant_id === args.p_tenant_id && r.source === args.p_source);
        const was = i >= 0 ? tables.imports[i] : null;
        const next = {
          tenant_id: args.p_tenant_id,
          source: args.p_source,
          state: args.p_state,
          counts: args.p_counts ?? {},
          parts_done: args.p_parts_done ?? was?.parts_done ?? 0,
          parts_total: args.p_parts_total ?? was?.parts_total ?? null,
          oldest: args.p_oldest ?? was?.oldest ?? null,
          via: args.p_via ?? was?.via ?? null,
          job_cursor: args.p_cursor ?? was?.job_cursor ?? null,
          started_at: was?.started_at ?? "2026-10-25T12:00:00Z",
          finished_at: null,
          last_error: args.p_state === "failed" ? (args.p_error ?? null) : null,
          updated_at: "2026-10-25T12:00:00Z",
        };
        if (i >= 0) tables.imports[i] = next;
        else tables.imports.push(next);
        return null;
      },
      get_channel_credentials: () => ({ access_token: "EAAB-token-nobody-may-see", phone_id: PHONE_ID }),
    },
  );
  return { db, tables, kept, notes };
}

/** One part, as the job runner hands it. */
const job = (source, connectionId, n = 1) => ({
  id: `job-${source}-${n}`,
  tenant_id: A,
  kind: "history_import",
  payload: { source, seq: `run:${n}`, connection_id: connectionId },
});
const runPart = (db, j) => historyImports(db).part(j, Date.now() + 30_000);

/** A delivery Meta made, as the intake ledger kept it under its key. */
const delivery = (changes, key = KEY) => ({
  provider: "meta",
  provider_event_id: key,
  door: "/api/whatsapp",
  url: "https://edge.example.com/api/whatsapp",
  tenant_id: null,
  headers: {},
  body: JSON.stringify({ object: "whatsapp_business_account", entry: [{ id: "waba", changes }] }),
  verified: true,
  received_at: "2026-10-25T12:05:00Z",
});
const historyChange = (number, chunk) => ({
  field: "history",
  value: {
    messaging_product: "whatsapp",
    metadata: { phone_number_id: number, display_phone_number: BUSINESS },
    history: [chunk],
  },
});

/** Meta's Graph, as far as the ask sees it: smb_app_data answered from a script, each request kept. */
function meta(answer = () => ({ status: 200, body: { request_id: "req-1" } })) {
  const seen = [];
  const before = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const req = { url: String(url), method: init?.method ?? "GET", body: init?.body ? JSON.parse(init.body) : null };
    seen.push(req);
    const a = answer(req);
    return new Response(JSON.stringify(a.body ?? {}), { status: a.status ?? 200 });
  };
  return { seen, restore: () => (globalThis.fetch = before) };
}

test("a number that kept its app: both rows queued with the number and the moment, each source's ask now and its settling a day and two hours on, once", async () => {
  const { db, tables, notes } = world();
  const nowMs = Date.parse("2026-10-25T12:00:00Z");
  await startWhatsappHistory(db, { tenantId: A, channelId: CHANNEL, nowMs, log: { error: () => {} } });
  assert.deepEqual(
    notes.map((n) => [n.p_source, n.p_state, n.p_parts_total ?? null, n.p_cursor.channel]),
    [
      ["whatsapp_contacts", "queued", null, CHANNEL],
      ["whatsapp_history", "queued", HISTORY_PARTS, CHANNEL],
    ],
  );
  const due = tables.jobs.map((j) => [j.payload.source, j.payload.seq, Date.parse(j.due_at) - nowMs]);
  assert.deepEqual(due, [
    ["whatsapp_contacts", `${nowMs}:1`, 0],
    ["whatsapp_contacts", `${nowMs}:2`, SETTLE_AFTER_MS],
    ["whatsapp_history", `${nowMs}:1`, 0],
    ["whatsapp_history", `${nowMs}:2`, SETTLE_AFTER_MS],
  ]);
  assert.ok(tables.jobs.every((j) => j.kind === "history_import" && j.payload.connection_id === CHANNEL));
});

test("the ask: Meta is asked for the source once, with the number's own token, and the row keeps its request id; asked again, nothing is sent twice", async () => {
  const { db, tables } = world();
  await startWhatsappHistory(db, { tenantId: A, channelId: CHANNEL, nowMs: Date.now(), log: { error: () => {} } });
  const m = meta();
  try {
    await runPart(db, job("whatsapp_history", CHANNEL, 1));
    await runPart(db, job("whatsapp_history", CHANNEL, 1));
  } finally {
    m.restore();
  }
  assert.equal(m.seen.length, 1, "asked once");
  assert.equal(m.seen[0].url, `${GRAPH}/${PHONE_ID}/smb_app_data`);
  assert.deepEqual(m.seen[0].body, { messaging_product: "whatsapp", sync_type: "history" });
  const r = tables.imports.find((x) => x.source === "whatsapp_history");
  assert.equal(r.state, "running");
  assert.equal(r.job_cursor.request_id, "req-1");
  assert.ok(!lines.some((l) => l.includes("EAAB-token-nobody-may-see")), "the token is never logged");
});

test("the ask past Meta's day, refused by Meta, or for a number no longer connected: said on the row, nothing asked; Meta busy or down is asked again by the job ledger", async () => {
  // Past the window: the row says Meta offers it once.
  const late = world();
  await startWhatsappHistory(late.db, {
    tenantId: A,
    channelId: CHANNEL,
    // Meta offers a kept app's history for a day after the number connects.
    nowMs: Date.now() - DAY_MS - 1000,
    log: { error: () => {} },
  });
  const m1 = meta();
  try {
    await runPart(late.db, job("whatsapp_contacts", CHANNEL, 1));
  } finally {
    m1.restore();
  }
  assert.equal(m1.seen.length, 0);
  const lateRow = late.tables.imports.find((x) => x.source === "whatsapp_contacts");
  assert.deepEqual([lateRow.state, lateRow.last_error], ["failed", IMPORT_STOPPED_WORDS.offeredOnce]);

  // Meta's own no.
  const refused = world();
  await startWhatsappHistory(refused.db, {
    tenantId: A,
    channelId: CHANNEL,
    nowMs: Date.now(),
    log: { error: () => {} },
  });
  const m2 = meta(() => ({ status: 400, body: { error: { message: "Sync already requested", code: 100 } } }));
  try {
    await runPart(refused.db, job("whatsapp_contacts", CHANNEL, 1));
  } finally {
    m2.restore();
  }
  assert.equal(
    refused.tables.imports.find((x) => x.source === "whatsapp_contacts").last_error,
    IMPORT_STOPPED_WORDS.offeredOnce,
  );

  // Meta down: the part throws, so the job ledger tries it again inside the window; the row still waits.
  const down = world();
  await startWhatsappHistory(down.db, { tenantId: A, channelId: CHANNEL, nowMs: Date.now(), log: { error: () => {} } });
  const m3 = meta(() => ({ status: 503, body: { error: { message: "Service unavailable", code: 2 } } }));
  try {
    await assert.rejects(runPart(down.db, job("whatsapp_history", CHANNEL, 1)), /smb_app_data history/);
  } finally {
    m3.restore();
  }
  assert.equal(down.tables.imports.find((x) => x.source === "whatsapp_history").state, "queued");

  // The number disconnected since.
  const gone = world();
  gone.tables.tenant_channels[0].status = "disabled";
  await startWhatsappHistory(gone.db, { tenantId: A, channelId: CHANNEL, nowMs: Date.now(), log: { error: () => {} } });
  const m4 = meta();
  try {
    await runPart(gone.db, job("whatsapp_history", CHANNEL, 1));
  } finally {
    m4.restore();
  }
  assert.equal(m4.seen.length, 0);
  assert.equal(
    gone.tables.imports.find((x) => x.source === "whatsapp_history").last_error,
    IMPORT_STOPPED_WORDS.numberGone,
  );
});

test("a kept delivery's chats: each message into its person's thread as before Chanlytics, another workspace's number left alone, and the row counting what came, how far back, and Meta's parts", async () => {
  const chunk = {
    metadata: { phase: 1, chunk_order: 1, progress: 60 },
    threads: [
      {
        id: "15555550111",
        messages: [
          said("wamid.a", 1750000000, "15555550111"),
          said("wamid.b", 1750000100, BUSINESS, { to: "15555550111" }),
        ],
      },
      { id: "15555550112", messages: [said("wamid.c", 1749000000, "15555550112")] },
    ],
  };
  const other = {
    metadata: { phase: 1 },
    threads: [{ id: "15555550199", messages: [said("wamid.z", 1750000000, "15555550199")] }],
  };
  const { db, tables, kept } = world({
    provider_events: [delivery([historyChange(PHONE_ID, chunk), historyChange(OTHER_PHONE_ID, other)])],
  });
  await runPart(db, job("whatsapp_history", KEY, 1));
  assert.deepEqual(
    kept.map((k) => [k.p_message_external_id, k.p_external, k.p_phone, k.p_direction, k.p_channel]),
    [
      ["wamid.a", "15555550111", "+15555550111", "inbound", "whatsapp"],
      ["wamid.b", "15555550111", "+15555550111", "outbound", "whatsapp"],
      ["wamid.c", "15555550112", "+15555550112", "inbound", "whatsapp"],
    ],
    "the other workspace's chat is not this workspace's to keep",
  );
  assert.ok(kept.every((k) => k.p_tenant_id === A && k.p_meta.history_phase === 1));
  const r = tables.imports.find((x) => x.source === "whatsapp_history");
  assert.equal(r.state, "running", "Meta has not said it is all in");
  assert.deepEqual(r.counts, { messages: 3, people: 2 });
  assert.equal(r.parts_done, 1, "phase 1 arriving says the day before is in");
  assert.equal(r.oldest, new Date(1749000000 * 1000).toISOString());
});

test("a chunk of any size is brought a slice a part: the next part scheduled while there is more, and the last part with Meta's 100 calls the run done, all three parts in", async () => {
  const many = Array.from({ length: 85 }, (_, i) => said(`wamid.m${i}`, 1750000000 + i, "15555550111"));
  const { db, tables, kept } = world({
    provider_events: [
      delivery([
        historyChange(PHONE_ID, {
          metadata: { phase: 2, progress: 100 },
          threads: [{ id: "15555550111", messages: many }],
        }),
      ]),
    ],
  });
  await runPart(db, job("whatsapp_history", KEY, 1));
  assert.equal(kept.length, 80, "a part's slice");
  assert.equal(tables.imports.find((x) => x.source === "whatsapp_history").state, "running");
  const next = tables.jobs.filter((j) => j.payload.connection_id === KEY);
  assert.deepEqual(
    next.map((j) => j.payload.seq),
    ["run:2"],
  );
  await runPart(db, job("whatsapp_history", KEY, 2));
  assert.equal(kept.length, 85);
  const r = tables.imports.find((x) => x.source === "whatsapp_history");
  assert.deepEqual([r.state, r.parts_done], ["done", HISTORY_PARTS]);
});

test("a delivery saying the business declined to share: the row stops with its words and no Try again; a delivery the intake ledger no longer holds is said in the log", async () => {
  const { db, tables } = world({
    provider_events: [
      delivery([
        {
          field: "history",
          value: { metadata: { phone_number_id: PHONE_ID }, history: [{ errors: [{ code: WA_HISTORY_NOT_SHARED }] }] },
        },
      ]),
    ],
  });
  await runPart(db, job("whatsapp_history", KEY, 1));
  const r = tables.imports.find((x) => x.source === "whatsapp_history");
  assert.deepEqual([r.state, r.last_error], ["failed", IMPORT_STOPPED_WORDS.notShared]);
  assert.equal(importLineOf({ ...r, counts: r.counts ?? {} }).retry, false);

  const empty = world();
  lines.length = 0;
  await runPart(empty.db, job("whatsapp_history", "sha256:" + "cd".repeat(32), 1));
  assert.ok(lines.some((l) => l.includes("wa_history_delivery_gone")));
  assert.equal(empty.tables.imports.length, 0);
});

test("a kept delivery's contacts: each into People as a client list's are, the row done with the people added; a removal adds nobody", async () => {
  const { db, tables } = world({
    provider_events: [
      delivery([
        {
          field: "smb_app_state_sync",
          value: {
            metadata: { phone_number_id: PHONE_ID },
            state_sync: [
              { type: "contact", action: "add", contact: { full_name: "Dana Reyes", phone_number: "15555550112" } },
              { type: "contact", action: "add", contact: { full_name: "Sam Lee", phone_number: "15555550113" } },
              { type: "contact", action: "remove", contact: { phone_number: "15555550114" } },
            ],
          },
        },
      ]),
    ],
  });
  await runPart(db, job("whatsapp_contacts", KEY, 1));
  assert.deepEqual(
    tables.contacts
      .filter((c) => c.tenant_id === A)
      .map((c) => c.phone_e164)
      .sort(),
    ["+15555550112", "+15555550113"],
  );
  const r = tables.imports.find((x) => x.source === "whatsapp_contacts");
  assert.deepEqual([r.state, r.counts], ["done", { people: 2 }]);
});

test("settling a day and two hours on: a run still coming in is done with what came, all parts in; one never asked is said as offered once; a done run is left as it is", async () => {
  const { db, tables } = world();
  await startWhatsappHistory(db, { tenantId: A, channelId: CHANNEL, nowMs: Date.now(), log: { error: () => {} } });
  // Asked and running, with one part in.
  tables.imports.find((x) => x.source === "whatsapp_history").state = "running";
  await runPart(db, job("whatsapp_history", CHANNEL, 2));
  await runPart(db, job("whatsapp_contacts", CHANNEL, 2));
  const h = tables.imports.find((x) => x.source === "whatsapp_history");
  const c = tables.imports.find((x) => x.source === "whatsapp_contacts");
  assert.deepEqual([h.state, h.parts_done], ["done", HISTORY_PARTS]);
  assert.deepEqual([c.state, c.last_error], ["failed", IMPORT_STOPPED_WORDS.offeredOnce], "never asked: still queued");
  await runPart(db, job("whatsapp_history", CHANNEL, 2));
  assert.equal(tables.imports.find((x) => x.source === "whatsapp_history").state, "done");
});
