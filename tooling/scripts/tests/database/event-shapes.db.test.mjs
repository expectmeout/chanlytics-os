/**
 * Three event kinds have a writer on each side, TypeScript and SQL, and each has ONE declared shape and version
 * (contracts workspace/event-data.ts: SHARED_EVENT_SHAPES, SHARED_EVENT_VERSIONS). This runs every SQL function that
 * writes one of them on a real Postgres, as the caller each needs, and holds its row to the declaration: the data
 * parses as the kind's shape, and the row's version is the declared one.
 *
 * Before this the declared shape was the calendar sweep's alone while a dozen functions wrote something else under the
 * same version (scorecard defect A:0), so a reader could not tell an old row from a new one. The shapes are now the
 * union of what the writers write, told apart by their own field; what this holds:
 *   - contact.added <- create_person (manual, calendar with a title, lead), import_person, lead_set_stage (a lead
 *     converted, with a phone and without), the lead-insert trigger lead_link_contact, reach_out_person;
 *   - contact.consent_changed <- ingest_inbound (a STOP and a START), set_contact_consent, set_marketing_consent,
 *     set_email_marketing (a no, and a reply's no taken back);
 *   - platform.acted <- partner_status_set, partner_standing_set, partner_second_factor_reset (a platform admin's).
 * And the list of writers is not this file's word for it: the catalog is asked which functions insert into events with
 * one of the three kinds named in them, and the answer must be the list above, so a new SQL writer fails here until it
 * is run; a function that inserts an event without naming its kind would hide from that question, so there is none.
 * The shapes still refuse a row with no `source`, no `consent`, no `action`.
 *
 * Runs the way tenancy.db.test.mjs does: its own workspaces, users and rows, made with the service key and removed
 * after, against the database `supabase start` builds on this machine, never production. The sessions are real. The
 * catalog is read through the CLI (SUPABASE_CLI names the binary when `supabase` is not on PATH; SUPABASE_DB_URL aims it).
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { SHARED_EVENT_SHAPES, SHARED_EVENT_VERSIONS } from "@chanlytics/contracts";
import { showSecondFactor } from "../_second-factor.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const CLI = process.env.SUPABASE_CLI || "supabase";
// The database the CLI is pointed at: the one the environment names when it is on this machine, else the stack
// `supabase start` runs here.
const DB_URL = process.env.SUPABASE_DB_URL;
const CLI_TARGET =
  DB_URL && /^postgres(ql)?:\/\/[^@]*@(127\.0\.0\.1|localhost)[:/]/.test(DB_URL)
    ? ["--db-url", `${DB_URL}${DB_URL.includes("?") ? "&" : "?"}sslmode=disable`]
    : ["--local"];
const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite makes users, workspaces, people, leads and events"
      : !ANON
        ? "no SUPABASE_ANON_KEY in env: the sessions this suite signs in with need it"
        : false;

/** Every SQL writer of each shared kind, by function name: what the catalog must answer, and what the tests run. */
const WRITERS = {
  "contact.added": ["create_person", "import_person", "lead_link_contact", "lead_set_stage", "reach_out_person"],
  "contact.consent_changed": ["ingest_inbound", "set_contact_consent", "set_email_marketing", "set_marketing_consent"],
  "platform.acted": ["partner_second_factor_reset", "partner_standing_set", "partner_status_set"],
};
/** Where each kind files in the ledger (packages/db events.ts WRITES). */
const CATEGORY = { "contact.added": "contact", "contact.consent_changed": "contact", "platform.acted": "platform" };
/** Which writers have been run, by kind: the last test holds it to WRITERS. */
const ran = Object.fromEntries(Object.keys(WRITERS).map((k) => [k, new Set()]));

let db;
const made = { users: [], tenants: [], admins: [] };
const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
let serial = 0;
const w = {};

const ok = (r, what) => {
  assert.equal(r.error, null, `${what}: ${r.error?.message}`);
  return r.data;
};
/** A made-up US number: 555-01xx is reserved for fiction; the tail is this run's own. */
const phone = () => `+1555010${String(++serial).padStart(4, "0")}`;

/** A signed-in session for a fresh user; `factor` shows the second factor a partner's seat asks for. */
async function person(label, { factor = false } = {}) {
  const email = `shapes-${label}-${++serial}-${RUN}@example.com`;
  const password = `pw-${RUN}-${serial}-Aa1!`;
  const u = ok(await db.auth.admin.createUser({ email, password, email_confirm: true }), "user").user;
  made.users.push(u.id);
  const client = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const s = await client.auth.signInWithPassword({ email, password });
  assert.equal(s.error, null, s.error?.message);
  if (factor) await showSecondFactor(client);
  return { client, id: u.id, email };
}

async function workspace(tag) {
  const t = ok(
    await db
      .from("tenants")
      .insert({ name: `Shapes ${tag} ${RUN}`, slug: `shapes-${tag}-${++serial}-${RUN}` })
      .select("id")
      .single(),
    "workspace",
  ).id;
  made.tenants.push(t);
  return t;
}

const eventsOf = async (t, kind) =>
  ok(
    await db
      .from("events")
      .select("id, tenant_id, kind, category, version, subject_type, subject_id, data")
      .eq("tenant_id", t)
      .eq("kind", kind)
      .order("created_at"),
    kind,
  );

/** The rows of `kind` in `t` that `act` wrote, and what it answered. */
async function wrote(t, kind, act) {
  const known = new Set((await eventsOf(t, kind)).map((r) => r.id));
  const answered = await act();
  return { answered, rows: (await eventsOf(t, kind)).filter((r) => !known.has(r.id)) };
}

/** Each row is the kind's declared shape at its declared version; answers the parsed data. */
function holds(kind, writer, rows, expected = rows.length) {
  assert.equal(rows.length, expected, `${writer} wrote ${rows.length} ${kind} rows, expected ${expected}`);
  for (const row of rows) {
    const parsed = SHARED_EVENT_SHAPES[kind].safeParse(row.data);
    assert.ok(
      parsed.success,
      `${writer}'s ${kind} row does not parse as the declared shape: ${JSON.stringify(row.data)}`,
    );
    assert.equal(row.version, SHARED_EVENT_VERSIONS[kind], `${writer}'s ${kind} row is version ${row.version}`);
    assert.equal(row.category, CATEGORY[kind], `${writer}'s ${kind} row files under ${row.category}`);
  }
  if (rows.length) ran[kind].add(writer);
  return rows.map((r) => r.data);
}

const lead = async (t, fields) =>
  ok(
    await db
      .from("leads")
      .insert({ tenant_id: t, place_id: `shapes-${++serial}-${RUN}`, business_name: "Made-up Salon", ...fields })
      .select("id")
      .single(),
    "lead",
  ).id;
const contact = async (t, fields = {}) =>
  ok(
    await db
      .from("contacts")
      .insert({ tenant_id: t, phone_e164: phone(), ...fields })
      .select("id")
      .single(),
    "contact",
  ).id;

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  w.t = await workspace("a");
  w.owner = await person("owner");
  ok(await db.from("memberships").insert({ tenant_id: w.t, user_id: w.owner.id, role: "owner" }), "owner's seat");

  // A workspace a partner brought, a platform admin, and the partner (as second-factor.db.test.mjs sets them up).
  w.partner = await person("partner", { factor: true });
  w.partner.code = `sh-${Math.random().toString(36).slice(2, 8)}`;
  w.partner.id = ok(await w.partner.client.rpc("partner_become", { p_code: w.partner.code }), "partner_become").id;
  w.brought = await person("brought");
  const brought = ok(
    await w.brought.client
      .rpc("create_workspace", { p_name: "Shapes Shop", p_timezone: "America/Chicago", p_partner_code: w.partner.code })
      .single(),
    "create_workspace",
  );
  w.tp = brought.id;
  made.tenants.push(w.tp);
  w.admin = await person("admin");
  ok(await db.from("platform_admins").insert({ user_id: w.admin.id }), "platform admin");
  made.admins.push(w.admin.id);
});

after(async () => {
  if (skip) return;
  for (const id of made.admins) await db.from("platform_admins").delete().eq("user_id", id);
  for (const id of made.tenants) {
    await db.from("events").delete().eq("tenant_id", id);
    await db.from("tenants").delete().eq("id", id);
  }
  for (const id of made.users) await db.auth.admin.deleteUser(id).catch(() => undefined);
});

/* ------------------------------------------------------------------------------------------ contact.added */

test("create_person: a person added by hand, by a calendar guest and by a lead", { skip }, async () => {
  const add = (source, title) =>
    wrote(w.t, "contact.added", async () =>
      ok(
        await w.owner.client.rpc("create_person", {
          p_tenant_id: w.t,
          p_phone_e164: phone(),
          p_display_name: "Made Up",
          p_source: source,
          ...(title ? { p_title: title } : {}),
        }),
        `create_person ${source}`,
      ),
    );
  const [manual] = holds("contact.added", "create_person", (await add("manual")).rows);
  assert.equal(manual.source, "manual");
  assert.equal(manual.by, w.owner.id, "by names the member");
  const [calendar] = holds("contact.added", "create_person", (await add("calendar", "Consultation")).rows);
  assert.deepEqual(
    [calendar.source, calendar.title],
    ["calendar", "Consultation"],
    "the appointment's title rides along",
  );
  const [fromLead] = holds("contact.added", "create_person", (await add("lead")).rows);
  assert.equal(fromLead.source, "lead");
  // The word the hand gave, whatever it is, is the source.
  const [own] = holds("contact.added", "create_person", (await add("front desk")).rows);
  assert.equal(own.source, "front desk");
});

test("import_person: a person from a client list, with a number and with only an address", { skip }, async () => {
  const imp = (fields) =>
    wrote(w.t, "contact.added", async () =>
      ok(await w.owner.client.rpc("import_person", { p_tenant_id: w.t, p_name: "Listed Person", ...fields }), "import"),
    );
  const byPhone = await imp({ p_phone_e164: phone(), p_email: null });
  const byEmail = await imp({ p_phone_e164: null, p_email: `listed-${RUN}@example.com` });
  for (const [data] of [byPhone, byEmail].map((r) => holds("contact.added", "import_person", r.rows, 1)))
    assert.deepEqual([data.source, data.by], ["import", w.owner.id]);
});

test("lead_set_stage: a lead converted, with a number and without one", { skip }, async () => {
  const convert = (fields) =>
    lead(w.t, fields).then((id) =>
      wrote(w.t, "contact.added", async () =>
        ok(await w.owner.client.rpc("lead_set_stage", { p_lead_id: id, p_outcome: "interested" }), "lead_set_stage"),
      ),
    );
  // With a number the person is made by create_person, told the source is a lead; its row is the same shape.
  const withPhone = await convert({ phone_e164: phone(), email: `lead-a-${RUN}@example.com` });
  const [a] = holds("contact.added", "create_person", withPhone.rows, 1);
  assert.equal(a.source, "lead");
  // Without one, lead_set_stage writes the row itself.
  const withoutPhone = await convert({ phone_e164: null, email: `lead-b-${RUN}@example.com` });
  const [b] = holds("contact.added", "lead_set_stage", withoutPhone.rows, 1);
  assert.deepEqual([b.source, b.by], ["lead", w.owner.id]);
});

test("lead_link_contact: a person who arrives with a lead's number is that lead, and says so", { skip }, async () => {
  const number = phone();
  await lead(w.t, { phone_e164: number });
  // No session: the edge writing a person a customer's first message made.
  const { rows } = await wrote(w.t, "contact.added", async () =>
    ok(await db.from("contacts").insert({ tenant_id: w.t, phone_e164: number }).select("id").single(), "contact"),
  );
  const [data] = holds("contact.added", "lead_link_contact", rows, 1);
  assert.equal(data.source, "lead");
});

test("reach_out_person: the person a reach-out email is written to", { skip }, async () => {
  const id = await lead(w.t, { email: `reach-${RUN}@example.com` });
  const { rows, answered } = await wrote(w.t, "contact.added", async () =>
    ok(await db.rpc("reach_out_person", { p_tenant_id: w.t, p_lead_id: id }), "reach_out_person"),
  );
  assert.equal(answered.made, true, "the person was made");
  const [data] = holds("contact.added", "reach_out_person", rows, 1);
  assert.deepEqual([data.source, data.by, data.lead_id], ["lead", "reach_out", id]);
});

/* ------------------------------------------------------------------------------- contact.consent_changed */

test("ingest_inbound: a STOP and a START texted by a customer", { skip }, async () => {
  const number = phone();
  const text = (body, flags, id) =>
    wrote(w.t, "contact.consent_changed", async () =>
      ok(
        await db.rpc("ingest_inbound", {
          p_tenant_id: w.t,
          p_channel: "sms",
          p_identity_external_id: number,
          p_phone_e164: number,
          p_wa_profile_name: null,
          p_message_external_id: `shapes-${id}-${RUN}`,
          p_type: "text",
          p_body: body,
          p_channel_ts: new Date().toISOString(),
          ...flags,
        }),
        `ingest_inbound ${body}`,
      ),
    );
  const [stop] = holds(
    "contact.consent_changed",
    "ingest_inbound",
    (await text("STOP", { p_opt_out: true }, "stop")).rows,
    1,
  );
  assert.deepEqual(
    [stop.consent, stop.source, stop.channel, stop.words],
    ["opted_out", "customer_message", "sms", "STOP"],
    "what they texted, in their words",
  );
  const [start] = holds(
    "contact.consent_changed",
    "ingest_inbound",
    (await text("START", { p_opt_in: true }, "start")).rows,
    1,
  );
  assert.deepEqual([start.consent, start.source], ["opted_in", "customer_message"]);
});

test(
  "set_contact_consent: a member records an answer, with a note and with the customer's own message",
  { skip },
  async () => {
    const c = await contact(w.t);
    const said = (fields) =>
      wrote(w.t, "contact.consent_changed", async () =>
        ok(await w.owner.client.rpc("set_contact_consent", { p_contact_id: c, ...fields }), "set_contact_consent"),
      );
    const [noted] = holds(
      "contact.consent_changed",
      "set_contact_consent",
      (await said({ p_consent: "opted_out", p_source: "operator", p_note: "asked at the front desk" })).rows,
      1,
    );
    assert.deepEqual(
      [noted.consent, noted.source, noted.previous, noted.by, noted.note],
      ["opted_out", "operator", "unknown", w.owner.id, "asked at the front desk"],
    );
    const [bare] = holds(
      "contact.consent_changed",
      "set_contact_consent",
      (await said({ p_consent: "unknown", p_source: "phone" })).rows,
      1,
    );
    assert.equal(bare.note, null, "no note is a null, which the shape allows");

    // Their own message names itself, its channel, its wire id and their first words.
    const conversation = ok(
      await db.from("conversations").insert({ tenant_id: w.t, contact_id: c }).select("id").single(),
      "thread",
    ).id;
    const message = ok(
      await db
        .from("messages")
        .insert({
          tenant_id: w.t,
          conversation_id: conversation,
          contact_id: c,
          channel: "sms",
          direction: "inbound",
          sender: "customer",
          type: "text",
          body: "yes please keep me posted",
          external_id: `shapes-msg-${RUN}`,
          status: "received",
          meta: {},
        })
        .select("id")
        .single(),
      "their message",
    ).id;
    const [evidence] = holds(
      "contact.consent_changed",
      "set_contact_consent",
      (await said({ p_consent: "opted_in", p_source: "customer_message", p_message_id: message })).rows,
      1,
    );
    assert.deepEqual(
      [evidence.message_id, evidence.channel, evidence.message_external_id, evidence.words],
      [message, "sms", `shapes-msg-${RUN}`, "yes please keep me posted"],
    );
  },
);

test(
  "set_marketing_consent: the edge's answer with its evidence, a member's form, a member naming their message",
  { skip },
  async () => {
    const c = await contact(w.t);
    const conversation = ok(
      await db.from("conversations").insert({ tenant_id: w.t, contact_id: c }).select("id").single(),
      "thread",
    ).id;
    const message = ok(
      await db
        .from("messages")
        .insert({
          tenant_id: w.t,
          conversation_id: conversation,
          contact_id: c,
          channel: "whatsapp",
          direction: "inbound",
          sender: "customer",
          type: "text",
          body: "send me offers",
          status: "received",
          meta: {},
        })
        .select("id")
        .single(),
      "their message",
    ).id;
    const edge = await wrote(w.t, "contact.consent_changed", async () =>
      ok(
        await db.rpc("set_marketing_consent", {
          p_tenant_id: w.t,
          p_contact_id: c,
          p_consent: "opted_out",
          p_source: "customer_message",
          p_note: null,
          p_evidence: { channel: "sms", message_external_id: `edge-${RUN}`, words: "no offers" },
        }),
        "the edge",
      ),
    );
    const [fromEdge] = holds("contact.consent_changed", "set_marketing_consent", edge.rows, 1);
    assert.deepEqual(
      [fromEdge.purpose, fromEdge.consent, fromEdge.source, fromEdge.channel],
      ["marketing", "opted_out", "customer_message", "sms"],
    );
    const form = await wrote(w.t, "contact.consent_changed", async () =>
      ok(
        await w.owner.client.rpc("set_marketing_consent", {
          p_tenant_id: w.t,
          p_contact_id: c,
          p_consent: "opted_in",
          p_source: "form",
          p_note: "signed the paper form",
        }),
        "a member's form",
      ),
    );
    const [formed] = holds("contact.consent_changed", "set_marketing_consent", form.rows, 1);
    assert.deepEqual([formed.purpose, formed.consent, formed.note], ["marketing", "opted_in", "signed the paper form"]);
    const named = await wrote(w.t, "contact.consent_changed", async () =>
      ok(
        await w.owner.client.rpc("set_marketing_consent", {
          p_tenant_id: w.t,
          p_contact_id: c,
          p_consent: "opted_in",
          p_source: "customer_message",
          p_message_id: message,
        }),
        "a member naming their message",
      ),
    );
    const [evidenced] = holds("contact.consent_changed", "set_marketing_consent", named.rows, 1);
    assert.deepEqual(
      [evidenced.message_id, evidenced.channel, evidenced.words],
      [message, "whatsapp", "send me offers"],
    );
  },
);

test(
  "set_email_marketing: a no from a link, from a reply with the answer it found, and a reply's no taken back",
  { skip },
  async () => {
    const say = (c, state, source, extra = {}) =>
      wrote(w.t, "contact.consent_changed", async () =>
        ok(
          await db.rpc("set_email_marketing", {
            p_tenant_id: w.t,
            p_contact_id: c,
            p_state: state,
            p_source: source,
            ...extra,
          }),
          `set_email_marketing ${source}`,
        ),
      );
    const unsubscribed = await say(
      await contact(w.t, { email: `unsub-${RUN}@example.com` }),
      "opted_out",
      "unsubscribe",
      {
        p_message_id: crypto.randomUUID(),
        p_evidence: { channel: "email", words: "unsubscribe" },
      },
    );
    const [link] = holds("contact.consent_changed", "set_email_marketing", unsubscribed.rows, 1);
    assert.deepEqual([link.purpose, link.consent, link.source], ["email_marketing", "opted_out", "unsubscribe"]);

    const replier = await contact(w.t, { email: `reply-${RUN}@example.com` });
    const replied = await say(replier, "opted_out", "reply");
    const [reply] = holds("contact.consent_changed", "set_email_marketing", replied.rows, 1);
    assert.deepEqual([reply.source, reply.previous], ["reply", "unknown"], "a reply's no keeps the answer it found");

    const undone = await say(replier, "unknown", "reply_undone");
    const [back] = holds("contact.consent_changed", "set_email_marketing", undone.rows, 1);
    assert.deepEqual([back.consent, back.source, back.purpose], ["unknown", "reply_undone", "email_marketing"]);
  },
);

/* ------------------------------------------------------------------------------------------ platform.acted */

test("the partner functions: a status set, a standing set, a second factor reset", { skip }, async () => {
  const paused = await wrote(w.tp, "platform.acted", async () =>
    ok(
      await w.admin.client.rpc("partner_status_set", {
        p_partner: w.partner.id,
        p_status: "paused",
        p_why: "made-up reason",
      }),
      "paused",
    ),
  );
  const [pause] = holds("platform.acted", "partner_status_set", paused.rows, 1);
  assert.deepEqual(
    [pause.action, pause.status, pause.from, pause.by],
    ["partner_status", "paused", "active", w.admin.id],
  );
  const restored = await wrote(w.tp, "platform.acted", async () =>
    ok(
      await w.admin.client.rpc("partner_status_set", {
        p_partner: w.partner.id,
        p_status: "active",
        p_why: "made-up reason",
      }),
      "restored",
    ),
  );
  const [restore] = holds("platform.acted", "partner_status_set", restored.rows, 1);
  assert.deepEqual([restore.status, restore.from], ["active", "paused"]);

  const stood = await wrote(w.tp, "platform.acted", async () =>
    ok(
      await w.admin.client.rpc("partner_standing_set", {
        p_tenant: w.tp,
        p_standing: "review",
        p_why: "made-up reason",
      }),
      "standing",
    ),
  );
  const [standing] = holds("platform.acted", "partner_standing_set", stood.rows, 1);
  assert.deepEqual([standing.action, standing.standing, standing.by], ["partner_standing", "review", w.admin.id]);

  const reset = await wrote(w.tp, "platform.acted", async () =>
    ok(
      await w.admin.client.rpc("partner_second_factor_reset", { p_partner: w.partner.id, p_why: "made-up reason" }),
      "reset",
    ),
  );
  const [factor] = holds("platform.acted", "partner_second_factor_reset", reset.rows, 1);
  assert.deepEqual(
    [factor.action, factor.partner_id, factor.by],
    ["partner_second_factor_reset", w.partner.id, w.admin.id],
  );
});

/* ------------------------------------------------------------------------------------------- the list */

/** One statement through `supabase db query`, and the rows it returned (as privileges.db.test.mjs reads the catalog). */
function query(sql) {
  const r = spawnSync(CLI, ["db", "query", ...CLI_TARGET, "--output-format", "json", sql], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (r.error) throw new Error(`could not run ${CLI} (${r.error.message}); set SUPABASE_CLI to the supabase binary`);
  if (r.status !== 0) {
    const said = [r.stderr, r.stdout]
      .map((s) => (s ?? "").trim())
      .filter(Boolean)
      .join("\n");
    throw new Error(`supabase db query exited ${r.status}: ${said.slice(-800)}`);
  }
  const out = r.stdout;
  const start = out.search(/[[{]/);
  if (start < 0) return [];
  const end = out.lastIndexOf(out[start] === "{" ? "}" : "]");
  const parsed = JSON.parse(out.slice(start, end + 1));
  return Array.isArray(parsed) ? parsed : (parsed.rows ?? []);
}

test("the catalog's writers of the three kinds are the ones run here, and none hides", { skip }, () => {
  const writers = query(`
    select k.kind, coalesce(array_agg(distinct p.proname::text order by p.proname::text) filter (where p.proname is not null), '{}') as fns
      from (values ('contact.added'), ('contact.consent_changed'), ('platform.acted')) as k(kind)
      left join pg_proc p on p.pronamespace = 'public'::regnamespace
       and p.prosrc like '%''' || k.kind || '''%'
       and p.prosrc ~* 'insert\\s+into\\s+(public\\.)?events'
     group by k.kind`);
  assert.deepEqual(
    Object.fromEntries(writers.map((r) => [r.kind, r.fns])),
    WRITERS,
    "a SQL function that writes one of these kinds is not in this suite: run it above, hold its row to the shape, and list it",
  );
  const unnamed = query(`
    select p.oid::regprocedure::text as fn
      from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and p.prosrc ~* 'insert\\s+into\\s+(public\\.)?events'
       and p.prosrc !~ '''[a-z_]+\\.[a-z_]+'''
     order by 1`);
  assert.deepEqual(
    unnamed.map((r) => r.fn),
    [],
    "a function inserts an event without naming its kind as a literal, so the question above cannot see what it writes",
  );
});

test("every listed writer was run, and the shapes still refuse a row that says nothing", { skip }, () => {
  for (const [kind, fns] of Object.entries(WRITERS))
    assert.deepEqual([...ran[kind]].sort(), fns, `${kind}: every writer was run and wrote a row that holds`);
  const refused = [
    ["contact.added", { title: "Consultation", by: "someone" }],
    ["contact.added", {}],
    ["contact.consent_changed", { source: "operator", by: "someone" }],
    ["contact.consent_changed", { consent: "opted_out" }],
    ["platform.acted", { by: "someone" }],
    ["platform.acted", { action: "partner_status" }],
    ["platform.acted", { action: 7, by: "someone" }],
  ];
  for (const [kind, data] of refused)
    assert.equal(SHARED_EVENT_SHAPES[kind].safeParse(data).success, false, `${kind} accepted ${JSON.stringify(data)}`);
  // What the writers add beyond the declared fields is let through, as evidence is.
  assert.equal(
    SHARED_EVENT_SHAPES["contact.consent_changed"].safeParse({ consent: "opted_in", source: "x", odd: 1 }).success,
    true,
  );
  assert.equal(Object.keys(SHARED_EVENT_VERSIONS).length, 3);
});
