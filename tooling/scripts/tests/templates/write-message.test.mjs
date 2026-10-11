/**
 * POST templates/message: a message written whole, a version per channel, filed as a starter is filed (Ask's message
 * card commits through it). Run through route() with the database in memory, a model of the two doors a version is
 * filed through (save_template_version on the member's session, create_message_version on the service role's; their
 * SQL is proved on Postgres in template-versions.db.test.mjs), and the edge stubbed with the provider guard open, so a
 * submission to Meta is a call this file counts and nothing leaves the machine.
 *
 * What is proved: every check comes before anything is filed (a text of an offer, a twin, words a channel refuses);
 * the email and text versions are filed first, at once and approved, and WhatsApp's last, in review; a WhatsApp version
 * the edge refuses leaves the others filed and is answered under `refused`, never thrown.
 */
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../_fake-db.mjs";
import { LIBRARY_WORDS, channelNeverCarries } from "@chanlytics/contracts";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
// The provider guard is read once, as its module loads: open it before the route is imported, onto a stubbed edge.
process.env.EDGE_PROVIDERS = "live";
process.env.EDGE_URL = "https://edge.example.com";
process.env.EDGE_CALL_SECRET = "edge-secret-for-this-file";
delete process.env.DIAG_KEY;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/rate-limit.ts"));
const { setServiceClient } = await import(at("apps/dashboard/src/server/service-db.ts"));
const route = await import(at("apps/dashboard/app/api/v1/templates/message/route.ts"));

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const USER = "u1";
const id = (n) => `77777777-7777-4777-8777-${String(n).padStart(12, "0")}`;

/** What submitTemplate says of a name and language already on file, which a twin is answered in. */
const TWIN = "A template with that name and language already exists. Pick another name.";

/** A template row as the table holds it. */
const tpl = (n, over = {}) => ({
  id: id(n),
  tenant_id: B,
  channel: "whatsapp",
  name: "spring_colour",
  language: "en_US",
  body_preview: "Hi {{1}}",
  variables: [],
  category: "marketing",
  meta_status: "approved",
  quality: null,
  rejected_reason: null,
  synced_at: null,
  source: "chanlytics",
  hidden_at: null,
  title: null,
  ...over,
});

/** The message's two values, as Ask's card names them: a first name and the business's name. */
const SLOTS = [
  { position: 1, label: "First name", example: "Dani", kind: "first_name" },
  { position: 2, label: "Business name", example: "Luna Studio", kind: "business_name" },
];
const EMAIL = { subject: "Spring at {{2}}", body: "Hi {{1}}, spring colour is 10% off at {{2}} this month." };
const SMS = { body: "Hi {{1}}, thank you for coming to {{2}} today." };
const WHATSAPP = {
  body: "Hi {{1}}, spring colour is 10% off at {{2}} this month. Reply to book a time.",
  footer: "Reply STOP to opt out",
};
/** A written message's body: an offer by default, its versions named by each case. */
const message = (over = {}) => ({
  name: "spring_colour",
  language: "en_US",
  category: "marketing",
  versions: {},
  slots: SLOTS,
  ...over,
});

/**
 * The two doors a version is filed through, over the same tables: a version beside the message's rows takes their
 * category and values (save_template_version); the first version of a name says them itself, as the member it acts for,
 * and is refused where any row of the name is on file (create_message_version). Each call is said, in order, in `order`.
 */
function doors(tables, order) {
  let next = 900;
  const version = (a, over) => {
    const row = tpl(next++, {
      tenant_id: a.p_tenant_id,
      channel: a.p_channel,
      name: a.p_name,
      language: a.p_language,
      body_preview: a.p_body,
      ...over,
    });
    tables.templates.push(row);
    return { id: row.id, channel: row.channel, name: row.name, language: row.language };
  };
  return {
    session: {
      save_template_version(a) {
        order.push(`save:${a.p_channel}`);
        const source = tables.templates.find((t) => t.tenant_id === a.p_tenant_id && t.name === a.p_name);
        if (!source) throw Object.assign(new Error("Message not found."), { code: "P0002" });
        return version(a, { category: source.category, variables: source.variables });
      },
    },
    service: {
      create_message_version(a) {
        order.push(`create:${a.p_channel}`);
        const seat = tables.memberships.find((m) => m.tenant_id === a.p_tenant_id && m.user_id === a.p_user);
        if (!seat || !["owner", "operator", "partner"].includes(seat.role))
          throw Object.assign(new Error("Message not found."), { code: "P0002" });
        if (tables.templates.some((t) => t.tenant_id === a.p_tenant_id && t.name === a.p_name))
          throw Object.assign(new Error("This message already exists."), { code: "23505" });
        return version(a, { category: a.p_category, variables: a.p_variables, created_by: a.p_user });
      },
    },
  };
}

/**
 * The edge's template submission, stubbed. Taken (the default), Meta has it for review and the edge writes the row as it
 * does (apps/edge/lib/whatsapp/template-admin.ts: pending, its values numbered from the body with their labels and
 * examples); refused, the edge answers its status and code as its door does. Every call is kept with its body; any other
 * address is no address this file may reach.
 */
function stubMeta(tables, order, answer = null) {
  const calls = [];
  const real = globalThis.fetch;
  let next = 800;
  globalThis.fetch = async (url, init) => {
    const where = String(url);
    if (!where.endsWith("/api/admin/whatsapp/templates-create")) throw new Error(`nothing else is reachable: ${where}`);
    const b = JSON.parse(String(init?.body ?? "{}"));
    calls.push(b);
    order.push("meta");
    if (answer) return new Response(JSON.stringify({ ok: false, ...answer.body }), { status: answer.status });
    const positions = [...new Set([...b.body.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1])))];
    const row = tpl(next++, {
      tenant_id: b.tenant_id,
      name: b.name,
      language: b.language,
      category: String(b.category).toLowerCase(),
      body_preview: b.body,
      meta_status: "pending",
      variables: positions.map((n) => ({ position: n, label: b.labels[n - 1], example: b.examples[n - 1] ?? null })),
      created_by: b.user_id,
    });
    tables.templates.push(row);
    return new Response(JSON.stringify({ ok: true, id: row.id, meta_id: "meta-1", meta_status: "pending" }), {
      status: 200,
    });
  };
  return { calls, restore: () => (globalThis.fetch = real) };
}

let meta;
beforeEach(() => setRateStore(memoryStore()));
afterEach(() => {
  meta?.restore();
  setServiceClient(null);
});

/** A world: B, where the member is an operator with a WhatsApp number; A, where they only look. */
function open({ templates = [], edge = null } = {}) {
  const tables = {
    memberships: [
      { user_id: USER, tenant_id: A, role: "viewer", tenants: { slug: "harbor" }, created_at: "2026-01-01T00:00:00Z" },
      {
        user_id: USER,
        tenant_id: B,
        role: "operator",
        tenants: { slug: "bayside" },
        created_at: "2026-02-01T00:00:00Z",
      },
    ],
    tenant_channels: [
      { id: "ch-wa", tenant_id: B, kind: "whatsapp", status: "active", config: {}, number_e164: "+15550100" },
    ],
    templates: [...templates],
    events: [],
  };
  const order = [];
  const d = doors(tables, order);
  setServiceClient(fakeDb(tables, {}, d.service));
  meta = stubMeta(tables, order, edge);
  const ctx = { supabase: fakeDb(tables, {}, d.session), userId: USER, email: "ada@example.com", params: {} };
  const post = (body, workspace = B) =>
    route.POST.run(
      new Request(`http://localhost/api/v1/x?workspace=${workspace}`, { method: "POST", body: JSON.stringify(body) }),
      ctx,
    );
  const filed = (name = "spring_colour") =>
    tables.templates.filter((t) => t.name === name).map((t) => [t.channel, t.meta_status]);
  return { tables, order, meta, post, filed };
}

async function refused(p, code, status, words) {
  await assert.rejects(p, (e) => {
    assert.equal(e.code, code, e.message);
    assert.equal(e.status, status, e.message);
    assert.ok(e.message.includes(words), `${JSON.stringify(e.message)} should say ${JSON.stringify(words)}`);
    return true;
  });
}

test("POST templates/message declares its policy as POST templates does, and has a minute for its round trip to Meta", async () => {
  assert.deepEqual(route.POST.policy, {
    kind: "write",
    scope: "workspace",
    role: "operator",
    rate: "settings",
    spend: false,
  });
  assert.equal(route.maxDuration, 60);
  const w = open();
  await refused(w.post(message({ versions: { email: EMAIL } }), A), "forbidden", 403, "");
  assert.deepEqual(w.order, [], "a member who only looks files nothing");
});

test("(a) an email and a text version: two rows filed at once, approved, the first beginning the message with its category and values, the second beside it; Meta is not asked", async () => {
  const w = open();
  const r = await w.post(message({ name: "visit_thanks", category: "utility", versions: { email: EMAIL, sms: SMS } }));
  const rows = w.tables.templates.filter((t) => t.name === "visit_thanks");
  assert.deepEqual(
    rows.map((t) => [t.channel, t.meta_status, t.category]),
    [
      ["email", "approved", "utility"],
      ["sms", "approved", "utility"],
    ],
  );
  assert.deepEqual(r, {
    name: "visit_thanks",
    language: "en_US",
    versions: [
      { channel: "email", id: rows[0].id, state: "approved" },
      { channel: "sms", id: rows[1].id, state: "approved" },
    ],
  });
  assert.deepEqual(
    w.order,
    ["create:email", "save:sms"],
    "the email begins the message, the text is written beside it",
  );
  assert.deepEqual(
    rows[0].variables,
    SLOTS.map((s) => ({ position: s.position, label: s.label, example: s.example })),
    "the message's values, as a WhatsApp row's are filed",
  );
  assert.equal(rows[0].created_by, USER, "the first version is the member's, on the service role's door");
  assert.deepEqual(w.meta.calls, [], "no WhatsApp version: nothing asked of Meta");
});

test("(b) an email and a WhatsApp version with the edge taking it: the email is filed first and approved, then WhatsApp's goes to Meta and is in review", async () => {
  const w = open();
  const r = await w.post(message({ versions: { email: EMAIL, whatsapp: WHATSAPP } }));
  assert.deepEqual(w.order, ["create:email", "meta"], "the email first, WhatsApp last");
  assert.deepEqual(w.filed(), [
    ["email", "approved"],
    ["whatsapp", "pending"],
  ]);
  const wa = w.tables.templates.find((t) => t.channel === "whatsapp");
  assert.deepEqual(r, {
    name: "spring_colour",
    language: "en_US",
    versions: [
      { channel: "email", id: w.tables.templates.find((t) => t.channel === "email").id, state: "approved" },
      { channel: "whatsapp", id: wa.id, state: "pending" },
    ],
  });
  assert.equal(w.meta.calls.length, 1);
  const sent = w.meta.calls[0];
  assert.deepEqual(
    [sent.tenant_id, sent.user_id, sent.name, sent.language, sent.category, sent.body],
    [B, USER, "spring_colour", "en_US", "marketing", WHATSAPP.body],
  );
  assert.deepEqual(sent.examples, ["Dani", "Luna Studio"], "each value's example, which WhatsApp's reviewers read");
  assert.deepEqual(sent.labels, ["First name", "Business name"], "each value's name, kept on the row");
  assert.ok(
    sent.components.some((c) => c.type === "FOOTER" && c.text === WHATSAPP.footer),
    "the footer travels with the body",
  );
});

test("(c) WhatsApp's version refused at the edge leaves the email filed and is answered under `refused`, in the words POST templates says, never thrown", async () => {
  // The edge finds no number to make it for (its 409, no_channel).
  const w = open({ edge: { status: 409, body: { error: "no_channel" } } });
  const r = await w.post(message({ versions: { email: EMAIL, whatsapp: WHATSAPP } }));
  assert.deepEqual(w.order, ["create:email", "meta"]);
  assert.deepEqual(w.filed(), [["email", "approved"]], "the email stays filed; no WhatsApp row");
  assert.deepEqual(r, {
    name: "spring_colour",
    language: "en_US",
    versions: [{ channel: "email", id: w.tables.templates[0].id, state: "approved" }],
    refused: { channel: "whatsapp", words: LIBRARY_WORDS.writeNeedsNumber },
  });

  // Meta itself refuses it (the edge's 502, meta_refused, with Meta's reason).
  const m = open({
    edge: { status: 502, body: { error: "meta_refused", detail: "Too many variables for its length" } },
  });
  const said = await m.post(message({ versions: { email: EMAIL, whatsapp: WHATSAPP } }));
  assert.equal(said.refused.channel, "whatsapp");
  assert.match(said.refused.words, /^WhatsApp did not accept it: Too many variables for its length\./);
  assert.deepEqual(m.filed(), [["email", "approved"]]);
});

test("(d) a marketing message with a text version is refused in the product's words before anything is filed", async () => {
  const w = open();
  await refused(
    w.post(message({ versions: { email: EMAIL, sms: SMS, whatsapp: WHATSAPP } })),
    "validation",
    400,
    channelNeverCarries("sms", "marketing"),
  );
  assert.deepEqual(w.order, [], "no door was called and Meta was not asked");
  assert.deepEqual(w.tables.templates, []);
});

test("(e) a twin, a message of the same name and language on file on any channel, is answered 409 before anything is filed", async () => {
  for (const channel of ["whatsapp", "email"]) {
    const w = open({ templates: [tpl(1, { channel })] });
    await refused(w.post(message({ versions: { email: EMAIL, whatsapp: WHATSAPP } })), "conflict", 409, TWIN);
    assert.deepEqual(w.order, [], `a ${channel} twin: nothing filed, Meta not asked`);
    assert.equal(w.tables.templates.length, 1);
  }
});

test("every version's words are checked before any is filed: a WhatsApp version Meta would refuse files no email either", async () => {
  const w = open();
  // A value with no example: WhatsApp's reviewers read one for each.
  const bare = SLOTS.map((s, i) => (i === 1 ? { position: s.position, label: s.label, kind: s.kind } : s));
  await refused(
    w.post(message({ versions: { email: EMAIL, whatsapp: WHATSAPP }, slots: bare })),
    "validation",
    400,
    "Every example needs words",
  );
  // An email naming a value the message does not have.
  await refused(
    w.post(message({ versions: { email: { subject: "Hi", body: "Hi {{3}}" }, whatsapp: WHATSAPP } })),
    "validation",
    400,
    "{{3}} is not one of this message's values",
  );
  assert.deepEqual(w.order, []);
  assert.deepEqual(w.tables.templates, []);
});
