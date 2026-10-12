/**
 * POST templates/message: a message written whole, a version per channel, filed as a starter is filed (Ask's message
 * card commits through it). Run through route() with the database in memory, a model of the two doors a version is
 * filed through (save_template_version on the member's session, create_message_version on the service role's; their
 * SQL is proved on Postgres in template-versions.db.test.mjs), and the edge stubbed with the provider guard open, so a
 * submission to Meta is a call this file counts and nothing leaves the machine.
 *
 * What is proved: every check comes before anything is filed (a text of an offer, a utility message with no WhatsApp
 * version for Meta to review, a twin, words a channel refuses); the email and text versions are filed first, at once
 * and approved, and WhatsApp's last, in review; a WhatsApp version the edge refuses leaves the others filed and is
 * answered under `refused`, never thrown.
 */
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../_fake-db.mjs";
import {
  CAMPAIGN_ROOMS,
  LIBRARY_WORDS,
  MESSAGE_BEGIN_WORDS,
  PROPOSAL_SPECS,
  channelNeverCarries,
} from "@chanlytics/contracts";

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
/** A utility message's versions: about the customer's own visit, no offer in it. */
const VISIT_EMAIL = { subject: "Your visit to {{2}}", body: "Hi {{1}}, thank you for coming to {{2}} today." };
const VISIT_WHATSAPP = { body: "Hi {{1}}, thank you for coming to {{2}} today. Reply here if anything needs a look." };
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
 * and is refused where any row of the name is on file (create_message_version). Each call is said, in order, in `order`;
 * `after.create`, where a case sets it, runs once the first version is written (a fault that comes after it).
 */
function doors(tables, order, after) {
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
        const made = version(a, { category: a.p_category, variables: a.p_variables, created_by: a.p_user });
        after.create?.();
        return made;
      },
    },
  };
}

/**
 * The edge's template submission, stubbed. Taken (the default), Meta has it for review and the edge writes the row as it
 * does (apps/edge/lib/whatsapp/template-admin.ts: pending, its values numbered from the body with their labels and
 * examples); refused, the edge answers its status and code as its door does. Taken, Meta may have answered it at once
 * (`status`: refused in its create answer, say), which the edge writes on the row and answers. Every call is kept with its
 * body; any other address is no address this file may reach.
 */
function stubMeta(tables, order, answer = null, status = "pending") {
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
      meta_status: status,
      variables: positions.map((n) => ({ position: n, label: b.labels[n - 1], example: b.examples[n - 1] ?? null })),
      created_by: b.user_id,
    });
    tables.templates.push(row);
    return new Response(JSON.stringify({ ok: true, id: row.id, meta_id: "meta-1", meta_status: status }), {
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
function open({ templates = [], edge = null, status = "pending" } = {}) {
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
  // The member's session's faults, read at each call: a case may make a read fail once something is filed.
  const faults = {};
  const after = {};
  const d = doors(tables, order, after);
  setServiceClient(fakeDb(tables, {}, d.service));
  meta = stubMeta(tables, order, edge, status);
  const ctx = { supabase: fakeDb(tables, faults, d.session), userId: USER, email: "ada@example.com", params: {} };
  const post = (body, workspace = B) =>
    route.POST.run(
      new Request(`http://localhost/api/v1/x?workspace=${workspace}`, { method: "POST", body: JSON.stringify(body) }),
      ctx,
    );
  const filed = (name = "spring_colour") =>
    tables.templates.filter((t) => t.name === name).map((t) => [t.channel, t.meta_status]);
  return { tables, order, meta, post, filed, faults, after };
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

test("(a) a utility message with an email and a text version and no WhatsApp one is refused in the product's words before anything is filed: nobody reviews a category its writer declares", async () => {
  const w = open();
  // This door takes a message about their own booking with a WhatsApp version, so its words say that one is needed,
  // never "a message you write is an offer or news" (POST templates/versions's words, where that is true).
  await refused(
    w.post(message({ name: "visit_thanks", category: "utility", versions: { email: VISIT_EMAIL, sms: SMS } })),
    "validation",
    400,
    MESSAGE_BEGIN_WORDS.utilityNeedsWhatsapp,
  );
  assert.deepEqual(w.order, [], "no door was called and Meta was not asked");
  assert.deepEqual(w.tables.templates, []);
});

test("(a1) a marketing message with an email version alone: one row filed at once and approved, beginning the message with its category and values; Meta is not asked", async () => {
  const w = open();
  const r = await w.post(message({ versions: { email: EMAIL } }));
  const rows = w.tables.templates.filter((t) => t.name === "spring_colour");
  assert.deepEqual(
    rows.map((t) => [t.channel, t.meta_status, t.category]),
    [["email", "approved", "marketing"]],
  );
  assert.deepEqual(r, {
    name: "spring_colour",
    language: "en_US",
    versions: [{ channel: "email", id: rows[0].id, state: "approved" }],
  });
  assert.deepEqual(w.order, ["create:email"], "the email begins the message");
  assert.deepEqual(
    rows[0].variables,
    SLOTS.map((s) => ({ position: s.position, label: s.label, example: s.example })),
    "the message's values, as a WhatsApp row's are filed",
  );
  assert.equal(rows[0].created_by, USER, "the first version is the member's, on the service role's door");
  assert.deepEqual(w.meta.calls, [], "no WhatsApp version: nothing asked of Meta");
});

test("(a2) a utility message with a WhatsApp version for Meta to review: its email is filed at once and approved, WhatsApp's goes to Meta and is in review; with a text too, the text is written beside the email", async () => {
  const w = open();
  const r = await w.post(
    message({ name: "visit_thanks", category: "utility", versions: { email: VISIT_EMAIL, whatsapp: VISIT_WHATSAPP } }),
  );
  assert.deepEqual(w.order, ["create:email", "meta"], "the email first, WhatsApp last");
  assert.deepEqual(w.filed("visit_thanks"), [
    ["email", "approved"],
    ["whatsapp", "pending"],
  ]);
  const row = (channel) => w.tables.templates.find((t) => t.name === "visit_thanks" && t.channel === channel);
  assert.equal(row("email").category, "utility");
  assert.equal(w.meta.calls[0].category, "utility", "the category Meta reviews is the one the message says");
  assert.deepEqual(r, {
    name: "visit_thanks",
    language: "en_US",
    versions: [
      { channel: "email", id: row("email").id, state: "approved" },
      { channel: "whatsapp", id: row("whatsapp").id, state: "pending" },
    ],
  });

  const t = open();
  const all = await t.post(
    message({
      name: "visit_thanks",
      category: "utility",
      versions: { email: VISIT_EMAIL, sms: SMS, whatsapp: VISIT_WHATSAPP },
    }),
  );
  assert.deepEqual(
    t.order,
    ["create:email", "save:sms", "meta"],
    "the email begins the message, the text is written beside it, WhatsApp's last",
  );
  assert.deepEqual(
    all.versions.map((v) => [v.channel, v.state]),
    [
      ["email", "approved"],
      ["sms", "approved"],
      ["whatsapp", "pending"],
    ],
  );
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

test("(c2) WhatsApp refusing the version in its answer to the filing is filed as refused, never as in review, and the card's receipt says so", async () => {
  const w = open({ status: "rejected" });
  const r = await w.post(message({ versions: { email: EMAIL, whatsapp: WHATSAPP } }));
  assert.deepEqual(w.filed(), [
    ["email", "approved"],
    ["whatsapp", "rejected"],
  ]);
  const wa = w.tables.templates.find((t) => t.channel === "whatsapp");
  assert.deepEqual(r.versions.at(-1), { channel: "whatsapp", id: wa.id, state: "rejected" });
  assert.equal(r.refused, undefined, "filed, and refused by WhatsApp: no version the door could not file");
  const said = PROPOSAL_SPECS.message.receipt({ kind: "message", payload: { name: "spring_colour" } }, r);
  assert.equal(
    said,
    `“spring_colour” is in the Library — its email version is ready; its WhatsApp version was refused by WhatsApp (see ${CAMPAIGN_ROOMS.home} › ${CAMPAIGN_ROOMS.library})`,
  );
  assert.doesNotMatch(said, /for review/);
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

/* ---- A language of a message held in another ---- */

/** The offer, held in English: its WhatsApp version, an offer with the two values. */
const HELD_EN = () =>
  tpl(1, { variables: SLOTS.map((s) => ({ position: s.position, label: s.label, example: s.example })) });
const ES_EMAIL = { subject: "Primavera en {{2}}", body: "Hola {{1}}, el color de primavera tiene 10% menos en {{2}}." };
const ES_WHATSAPP = {
  body: "Hola {{1}}, el color de primavera tiene 10% menos en {{2}} este mes. Responde para reservar.",
  footer: "Responde STOP para no recibir más",
};

test("(f) a Spanish body for a name held in English, the same kind and the same values, is no twin: its versions are written beside the message, WhatsApp's sent for review", async () => {
  const w = open({ templates: [HELD_EN()] });
  const r = await w.post(message({ language: "es", versions: { email: ES_EMAIL, whatsapp: ES_WHATSAPP } }));
  assert.deepEqual(w.order, ["save:email", "meta"], "written beside the message on file, never begun again");
  const es = (channel) => w.tables.templates.find((t) => t.language === "es" && t.channel === channel);
  assert.deepEqual(
    [es("email").category, es("email").variables.length, es("whatsapp").meta_status],
    ["marketing", 2, "pending"],
  );
  assert.deepEqual(r, {
    name: "spring_colour",
    language: "es",
    versions: [
      { channel: "email", id: es("email").id, state: "approved" },
      { channel: "whatsapp", id: es("whatsapp").id, state: "pending" },
    ],
  });
});

test("(g) a Spanish body for a name held in English with another number of values is refused before anything is filed, in words that say what is held", async () => {
  const w = open({ templates: [HELD_EN()] });
  await refused(
    w.post(
      message({
        language: "es",
        versions: { email: { subject: "Hola", body: "Hola {{1}}, hay novedades." } },
        slots: SLOTS.slice(0, 1),
      }),
    ),
    "conflict",
    409,
    MESSAGE_BEGIN_WORDS.heldOtherwise("marketing", 2),
  );
  assert.deepEqual(w.order, [], "no door was called and Meta was not asked");
  assert.equal(w.tables.templates.length, 1);
});

test("(h) a Spanish body for a name held in English as another kind of message is refused before anything is filed, in words that say what is held", async () => {
  const w = open({ templates: [HELD_EN()] });
  await refused(
    w.post(
      message({
        language: "es",
        category: "utility",
        versions: {
          email: { subject: "Tu visita a {{2}}", body: "Hola {{1}}, gracias por venir a {{2}}." },
          whatsapp: { body: "Hola {{1}}, gracias por venir a {{2}} hoy. Escríbenos si algo necesita un vistazo." },
        },
      }),
    ),
    "conflict",
    409,
    MESSAGE_BEGIN_WORDS.heldOtherwise("marketing", 2),
  );
  assert.match(MESSAGE_BEGIN_WORDS.heldOtherwise("marketing", 2), /an offer or news with 2 values/);
  assert.deepEqual(w.order, []);
  assert.equal(w.tables.templates.length, 1);
});

test("(i) a name held in English with no category (a row filed before categories were kept) is an offer, as a send reads it: a Spanish offer beside it is written, never refused as another kind", async () => {
  const w = open({ templates: [{ ...HELD_EN(), category: null }] });
  const r = await w.post(message({ language: "es", versions: { email: ES_EMAIL, whatsapp: ES_WHATSAPP } }));
  assert.deepEqual(w.order, ["save:email", "meta"], "written beside the message on file");
  assert.deepEqual(
    r.versions.map((v) => [v.channel, v.state]),
    [
      ["email", "approved"],
      ["whatsapp", "pending"],
    ],
  );
});

test("(j) a name held in English as a code for signing in (authentication) is refused in words of its own: no campaign sends one, so no kind of message is written beside it", async () => {
  for (const category of ["marketing", "utility"]) {
    const w = open({ templates: [{ ...HELD_EN(), category: "authentication" }] });
    const versions =
      category === "marketing"
        ? { email: ES_EMAIL, whatsapp: ES_WHATSAPP }
        : {
            email: { subject: "Tu visita a {{2}}", body: "Hola {{1}}, gracias por venir a {{2}}." },
            whatsapp: { body: "Hola {{1}}, gracias por venir a {{2}} hoy. Escríbenos si algo necesita un vistazo." },
          };
    await refused(
      w.post(message({ language: "es", category, versions })),
      "conflict",
      409,
      MESSAGE_BEGIN_WORDS.heldAuthentication,
    );
    assert.deepEqual(w.order, [], `${category}: no door was called and Meta was not asked`);
    assert.equal(w.tables.templates.length, 1);
  }
  assert.doesNotMatch(MESSAGE_BEGIN_WORDS.heldAuthentication, /offer or news|Write this language the same way/);
});

test("a fault once a version is filed is answered in one plain sentence and logged, never swallowed: the versions before it stay filed", async () => {
  const w = open();
  // The email begins the message; then the database stops answering reads, so the WhatsApp submission's own read fails.
  w.after.create = () => (w.faults["templates.select"] = { message: "connection reset by peer" });
  const lines = [];
  const was = console.error;
  console.error = (line) => {
    try {
      lines.push(JSON.parse(line));
    } catch {
      lines.push({ raw: String(line) });
    }
  };
  let r;
  try {
    r = await w.post(message({ versions: { email: EMAIL, whatsapp: WHATSAPP } }));
  } finally {
    console.error = was;
  }
  assert.deepEqual(
    r.versions.map((v) => [v.channel, v.state]),
    [["email", "approved"]],
  );
  assert.deepEqual(r.refused, {
    channel: "whatsapp",
    words: "This version could not be filed just now. Write it again from the Library.",
  });
  assert.deepEqual(w.meta.calls, [], "the submission stopped at its read: nothing reached Meta");
  const line = lines.find((l) => l.event === "message_version_not_filed");
  assert.ok(line, `the fault is logged: ${JSON.stringify(lines)}`);
  assert.deepEqual([line.level, line.tenant_id, line.channel], ["error", B, "whatsapp"]);
  assert.match(String(line.error), /connection reset by peer/);
});
