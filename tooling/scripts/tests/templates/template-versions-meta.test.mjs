/**
 * Meta's sync and delete never touch an email or a text version.
 *
 * A message's email and text versions live in the same table as its WhatsApp one (00296), under the same name, in the
 * same language, and the table is unique on (workspace, channel, name, language). The edge's template doors are
 * Meta's: the sync upserts what Meta lists and leaves every row it does not list as it was, the delete takes one
 * WhatsApp row and its twin at Meta. This runs the real doors over a database in memory holding the same message on
 * three channels, with Meta listing it, and holds that the email and the text come out exactly as they went in.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { signEdgeToken } from "@chanlytics/channels";
import { fakeDb } from "../_fake-db.mjs";

process.env.EDGE_CALL_SECRET = "edge-secret-for-this-file";
for (const k of ["DIAG_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "WHATSAPP_PHONE_ID", "WHATSAPP_ACCESS_TOKEN"])
  delete process.env[k];

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setPg } = await import(at("apps/edge/lib/pg.ts"));
const { GRAPH_VERSION } = await import(at("apps/edge/lib/whatsapp/meta-graph.ts"));
const sync = await import(at("apps/edge/api/admin/whatsapp/templates-sync.ts"));
const del = await import(at("apps/edge/api/admin/whatsapp/templates-delete.ts"));
after(() => setPg(null));

const SYNC = "/api/admin/whatsapp/templates-sync";
const DELETE = "/api/admin/whatsapp/templates-delete";
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OWNER = "11111111-1111-4111-8111-111111111111";
const WA = "dddddddd-dddd-4ddd-8ddd-ddddddddddd1";
const EMAIL = "dddddddd-dddd-4ddd-8ddd-ddddddddddd2";
const SMS = "dddddddd-dddd-4ddd-8ddd-ddddddddddd3";
const PHONE = "1234567890123";
const WABA = "9876543210987";
const TOKEN = "EAAB-business-token-nobody-may-see";
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;
const LIST_URL = `${GRAPH}/${WABA}/message_templates?fields=id,name,language,status,category,components,quality_score,rejected_reason&limit=100`;

const knock = (door, aud, body) => {
  const raw = JSON.stringify(body);
  return door.POST(
    new Request(`http://edge${aud}`, {
      method: "POST",
      headers: {
        "x-edge-token": signEdgeToken(process.env.EDGE_CALL_SECRET, aud, { workspace: A, user: OWNER, body: raw }),
        "content-type": "application/json",
      },
      body: raw,
    }),
  );
};
const answer = async (res) => [res.status, await res.json()];

/** The one message, on three channels: the same name and the same language. */
const row = (id, channel, over = {}) => ({
  id,
  tenant_id: A,
  channel,
  name: "visit_reminder",
  language: "en_US",
  meta_status: "approved",
  category: "utility",
  meta_id: null,
  components: [{ type: "BODY", text: "Hi {{1}}." }],
  body_preview: "Hi {{1}}.",
  variables: [{ position: 1, label: "First name", example: "Dani" }],
  quality: null,
  rejected_reason: null,
  synced_at: null,
  source: "chanlytics",
  created_by: OWNER,
  hidden_at: null,
  title: "Visit reminder",
  created_at: "2026-09-01T00:00:00Z",
  ...over,
});
function world() {
  const tables = {
    tenant_channels: [
      {
        id: "wa-a",
        tenant_id: A,
        kind: "whatsapp",
        external_id: PHONE,
        number_e164: "+15551234567",
        waba_id: WABA,
        status: "active",
        credentials_ref: "wa-creds-wa-a",
        config: {},
      },
    ],
    templates: [
      row(WA, "whatsapp", {
        source: "meta",
        meta_id: "tpl_visit",
        components: [{ type: "BODY", text: "Hello {{1}}." }],
      }),
      row(EMAIL, "email", {
        components: [
          { type: "HEADER", format: "TEXT", text: "Tomorrow" },
          { type: "BODY", text: "Hi {{1}}, see you soon." },
        ],
        body_preview: "Hi {{1}}, see you soon.",
      }),
      row(SMS, "sms"),
    ],
  };
  const db = fakeDb(
    tables,
    {},
    {
      get_channel_credentials: ({ p_channel_id }) => ({
        access_token: `${TOKEN}-for-${p_channel_id}`,
        phone_id: PHONE,
      }),
    },
  );
  setPg(db);
  return { tables, db };
}
/** Meta's endpoint, answered by `reply`, every request kept. */
function meta(reply) {
  const seen = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const req = { url: String(url), method: init?.method ?? "GET" };
    seen.push(req);
    const a = reply(req) ?? {};
    return new Response(JSON.stringify(a.body ?? {}), { status: a.status ?? 200 });
  };
  return {
    seen,
    restore: () => {
      globalThis.fetch = real;
    },
  };
}
/** The doors' log lines, kept instead of printed. */
function quiet() {
  const real = { log: console.log, warn: console.warn, error: console.error };
  for (const k of Object.keys(real)) console[k] = () => {};
  return () => Object.assign(console, real);
}
const writes = (db) =>
  db.seen.filter((s) => s.table === "templates" && ["insert", "update", "upsert", "delete"].includes(s.op));

test("a sync that lists the message touches only its WhatsApp row: the email and the text, same name and language, come out as they went in", async () => {
  const { tables, db } = world();
  const emailBefore = structuredClone(tables.templates.find((t) => t.id === EMAIL));
  const smsBefore = structuredClone(tables.templates.find((t) => t.id === SMS));
  const m = meta(() => ({
    body: {
      data: [
        {
          id: "tpl_visit",
          name: "visit_reminder",
          language: "en_US",
          status: "PAUSED",
          category: "MARKETING",
          components: [{ type: "BODY", text: "Hello again {{1}}, from Meta." }],
        },
        {
          id: "tpl_visit_es",
          name: "visit_reminder",
          language: "es",
          status: "APPROVED",
          category: "UTILITY",
          components: [{ type: "BODY", text: "Hola {{1}}." }],
        },
      ],
      paging: {},
    },
  }));
  const restore = quiet();
  let status, body;
  try {
    [status, body] = await answer(await knock(sync, SYNC, { tenant_id: A }));
  } finally {
    restore();
    m.restore();
  }
  assert.equal(status, 200, JSON.stringify(body));
  assert.deepEqual(
    m.seen.map((r) => r.url),
    [LIST_URL],
  );
  assert.deepEqual(
    tables.templates.find((t) => t.id === EMAIL),
    emailBefore,
    "the email version is exactly as it was",
  );
  assert.deepEqual(
    tables.templates.find((t) => t.id === SMS),
    smsBefore,
    "and so is the text version",
  );
  const wa = tables.templates.find((t) => t.id === WA);
  assert.deepEqual(
    [wa.meta_status, wa.category, wa.body_preview],
    ["paused", "marketing", "Hello again {{1}}, from Meta."],
  );
  assert.equal(tables.templates.length, 4, "Meta's Spanish row is added, and as WhatsApp's");
  assert.equal(tables.templates.find((t) => t.language === "es").channel, "whatsapp");
  for (const w of writes(db)) {
    assert.equal(w.op, "upsert", "no delete, no blanket update");
    assert.deepEqual(w.conflict, ["tenant_id", "channel", "name", "language"]);
    for (const r of w.values) assert.equal(r.channel, "whatsapp", "every row the sync writes is WhatsApp's");
  }

  // A sync that lists nothing of the message leaves all three rows, WhatsApp's included.
  const empty = meta(() => ({ body: { data: [], paging: {} } }));
  const restore2 = quiet();
  try {
    [status] = await answer(await knock(sync, SYNC, { tenant_id: A }));
  } finally {
    restore2();
    empty.restore();
  }
  assert.equal(status, 200);
  assert.deepEqual(
    tables.templates.find((t) => t.id === EMAIL),
    emailBefore,
  );
  assert.deepEqual(
    tables.templates.find((t) => t.id === SMS),
    smsBefore,
  );
  assert.equal(tables.templates.length, 4, "a row Meta does not return is not pruned");
});

test("the delete door takes a WhatsApp row and its twin at Meta, and an email or a text version is not a template of Meta's to delete", async () => {
  const { tables } = world();
  const unreachable = meta(() => {
    throw new Error("a version that is not Meta's must not reach Meta");
  });
  const restore = quiet();
  try {
    for (const id of [EMAIL, SMS])
      assert.deepEqual(
        await answer(await knock(del, DELETE, { tenant_id: A, template_id: id })),
        [404, { ok: false, error: "not_found" }],
        "the door reads WhatsApp rows only",
      );
    assert.deepEqual(unreachable.seen, []);
    assert.equal(tables.templates.length, 3);
  } finally {
    restore();
    unreachable.restore();
  }
  // Deleting the message's WhatsApp row at Meta leaves its other versions in place: they are the workspace's own words.
  const m = meta(() => ({ body: { success: true } }));
  const restore2 = quiet();
  try {
    const [status, body] = await answer(await knock(del, DELETE, { tenant_id: A, template_id: WA }));
    assert.deepEqual([status, body.ok, body.id], [200, true, WA]);
  } finally {
    restore2();
    m.restore();
  }
  assert.deepEqual(
    tables.templates.map((t) => t.id),
    [EMAIL, SMS],
  );
});
