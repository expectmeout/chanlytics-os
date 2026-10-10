/**
 * Erasure completeness, on a real Postgres (decision 0036, step 2; 0031's invariant 10).
 *
 * The registry (packages/db erasure-registry.ts) says, for every column of a workspace table that can hold a person's
 * words, how an erasure reaches it: with the person, scrubbed by named legs, kept as a digest, removed by age, or not
 * personal. The ratchet holds the registry to the schema; nothing held the registry to the erasure. This does: a
 * person's number and address are written into every column the registry says goes with them or is scrubbed, in a
 * row of each such table (theirs, or someone else's where the leg scrubs by needle), the real erasure route runs as
 * the owner, in the order erase-contact.ts gives it, and every one of those columns is then searched for the needles.
 * A needle left is a column the registry claims and no leg reaches. The rows are made with the service key and the
 * search is one statement through the CLI, as privileges.db.test.mjs reads the catalog (SUPABASE_CLI names the binary
 * when `supabase` is not on PATH). Runs against the local stack only; skipped without one.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { ERASURE_STRATEGIES } from "@chanlytics/db";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const CLI = process.env.SUPABASE_CLI || "supabase";
const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const skip =
  !URL_ || !KEY || !ANON
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite erases a customer it made"
      : false;
// The dashboard's server modules read these at import; the service client itself is set below.
process.env.NEXT_PUBLIC_SUPABASE_URL ??= URL_ ?? "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= KEY ?? "test-only";

const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
/** The person: a made-up number (555-01xx) and an address of this run's own. */
const PHONE = "+16465550199";
const DIGITS = "6465550199";
const EMAIL = `erase-${RUN}@example.com`;
/** What a column is seeded with: both needles, in words, so a leg that clears one and not the other shows. */
const WORDS = `Ada can be reached on ${PHONE} or ${EMAIL}`;
const URL_WITH = `https://example.com/p/${DIGITS}`;

let db;
let as;
let T;
let U;
let A;
let B;
let route;
let setServiceClient;
const made = { providerEvents: [] };
/** The Ask threads seeded, by what makes them the person's. */
const asked = {};

const ok = (r, what) => {
  assert.equal(r.error, null, `${what}: ${r.error?.message}`);
  return r.data;
};
const insert = async (table, row, what = table) => ok(await db.from(table).insert(row).select("id").single(), what).id;

/** One statement through the CLI, and its rows. */
function query(sql) {
  const r = spawnSync(CLI, ["db", "query", "--local", "--output-format", "json", sql], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (r.error) throw new Error(`could not run ${CLI} (${r.error.message}); set SUPABASE_CLI to the supabase binary`);
  if (r.status !== 0) throw new Error(`${CLI} db query failed: ${(r.stderr || r.stdout || "").slice(-800)}`);
  // The CLI wraps the rows in an envelope (a boundary, a warning); the rows are what is read, as privileges.db.test.mjs reads them.
  const out = r.stdout;
  const start = out.search(/[[{]/);
  if (start < 0) return [];
  const end = out.lastIndexOf(out[start] === "{" ? "}" : "]");
  const parsed = JSON.parse(out.slice(start, end + 1));
  return Array.isArray(parsed) ? parsed : (parsed.rows ?? []);
}

/** Every registered column an erasure must reach: with the person, or scrubbed. */
function columnsToProve() {
  const out = [];
  for (const [table, cols] of Object.entries(ERASURE_STRATEGIES))
    for (const [column, s] of Object.entries(cols))
      if (s.kind === "with_person" || s.kind === "scrubbed") out.push({ table, column, how: s.kind });
  return out;
}

/**
 * Columns whose CHECK admits no needle: seeded with a value of the shape it allows, and held empty after, since a
 * needle cannot prove them. Each says which value it took.
 */
const SHAPED = {
  "contacts.email_suppressed_reason": "hard_bounce",
  "contacts.consent_channels": ["sms"],
  "contacts.marketing_channels": ["sms"],
  "conversations.control_kind": "call",
  "leads.mark_path": `${"a".repeat(64)}.png`,
};

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  ({ setServiceClient } = await import(at("apps/dashboard/src/server/service-db.ts")));
  const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/rate-limit.ts"));
  setRateStore(memoryStore());
  setServiceClient(db);
  route = await import(at("apps/dashboard/app/api/v1/contacts/[id]/route.ts"));

  T = await insert("tenants", { slug: `erasure-complete-${RUN}`, name: "Erasure Complete" });
  const email = `owner-${RUN}@example.com`;
  const password = `pw-${RUN}-Aa1!long`;
  const user = ok(await db.auth.admin.createUser({ email, password, email_confirm: true }), "user").user;
  U = user.id;
  ok(await db.from("memberships").insert({ tenant_id: T, user_id: U, role: "owner" }), "seat");
  as = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  ok(await as.auth.signInWithPassword({ email, password }), "sign in");
});

after(async () => {
  if (skip || !T) return;
  setServiceClient?.(null);
  for (const id of made.providerEvents) await db.from("provider_events").delete().eq("provider_event_id", id);
  await db.from("events").delete().eq("tenant_id", T);
  await db.from("tenants").delete().eq("id", T);
  if (U) await db.auth.admin.deleteUser(U).catch(() => undefined);
});

/** The person, and a row in every table the registry names, each registered column carrying the needles. */
async function seed() {
  A = await insert("contacts", {
    tenant_id: T,
    phone_e164: PHONE,
    email: EMAIL,
    display_name: `Ada ${DIGITS}`,
    wa_profile_name: `Ada ${DIGITS}`,
    consent: "opted_in",
    consent_source: WORDS,
    notes: WORDS,
    marketing_consent: "opted_in",
    marketing_consent_source: WORDS,
    email_marketing: "opted_in",
    email_marketing_source: WORDS,
    consent_channels: SHAPED["contacts.consent_channels"],
    marketing_channels: SHAPED["contacts.marketing_channels"],
    email_suppressed_at: new Date().toISOString(),
    email_suppressed_reason: SHAPED["contacts.email_suppressed_reason"],
    proposal_url: URL_WITH,
  });
  B = await insert("contacts", { tenant_id: T, phone_e164: "+16465550198", display_name: "Bo Kept" });

  await insert("contact_identities", {
    tenant_id: T,
    contact_id: A,
    channel: "whatsapp",
    external_id: `1${DIGITS}`,
    raw: { name: WORDS },
  });
  // The thread is held by a call (its one free-text control: `call` names the call's id in control_ref).
  const conversation = await insert("conversations", {
    tenant_id: T,
    contact_id: A,
    control_kind: SHAPED["conversations.control_kind"],
    control_ref: WORDS,
    control_until: new Date(Date.now() + 3_600_000).toISOString(),
  });
  const message = await insert("messages", {
    tenant_id: T,
    conversation_id: conversation,
    contact_id: A,
    channel: "sms",
    direction: "inbound",
    sender: "customer",
    status: "received",
    type: "text",
    body: WORDS,
    template_name: WORDS,
    media: { caption: WORDS },
    external_id: `ext-${DIGITS}-${RUN}`,
    content_hash: `hash-${DIGITS}`,
    error: { message: WORDS },
    meta: { from: PHONE, email: EMAIL },
  });
  await insert("escalations", {
    tenant_id: T,
    conversation_id: conversation,
    reason: "human_token",
    details: WORDS,
    state: "open",
  });
  // Their reply to a reach-out, read: it hangs on their message and their thread.
  ok(
    await db.from("reach_out_replies").insert({
      message_id: message,
      tenant_id: T,
      conversation_id: conversation,
      contact_id: A,
      claim: "person",
      intent: "question",
      summary: WORDS,
      refer_to: WORDS,
      plan: { words: WORDS },
      draft: WORDS,
      draft_state: "written",
      draft_why: `${PHONE} ${EMAIL}`,
    }),
    "reach_out_replies",
  );
  await insert("calls", {
    tenant_id: T,
    retell_call_id: `call-${DIGITS}-${RUN}`,
    agent_id: WORDS,
    contact_id: A,
    conversation_id: conversation,
    direction: "inbound",
    status: "ended",
    call_type: WORDS,
    from_e164: PHONE,
    to_e164: WORDS,
    from_raw: PHONE,
    disconnection_reason: WORDS,
    sentiment: WORDS,
    summary: WORDS,
    transcript: WORDS,
    transcript_object: { words: WORDS },
    recording: { note: WORDS },
    public_log_url: URL_WITH,
    cost: { note: WORDS },
    latency: { note: WORDS },
    raw: { note: WORDS },
    wanted: WORDS,
    follow_up: WORDS,
    caller_name: WORDS,
    analysis: { note: WORDS },
  });
  await insert("deals", {
    tenant_id: T,
    contact_id: A,
    stage: "proposed",
    service: "Trim",
    note: WORDS,
    evidence: { words: WORDS },
    proposal_url: URL_WITH,
  });
  // A visit their booking tool emailed (00345): the client as the notice named them, the calendar's own words, and
  // the notice that made it, whose subject names them. Scrubbed by appointments_scrub, the route's best-effort leg.
  const visit = await insert("appointments", {
    tenant_id: T,
    contact_id: A,
    source: "booking_email",
    tool: "booksy",
    external_id: `visit-${DIGITS}-${RUN}`,
    starts_at: new Date(Date.now() + 86_400_000).toISOString(),
    ends_at: new Date(Date.now() + 90_000_000).toISOString(),
    title: WORDS,
    service: "Trim",
    note: WORDS,
    client_name: `Ada ${DIGITS}`,
    client_phone: PHONE,
    client_email: EMAIL,
    timezone: "America/New_York",
  });
  await insert("appointment_notices", {
    tenant_id: T,
    notice_id: `rcv-${DIGITS}-${RUN}`,
    tool: "booksy",
    from_address: "no-reply@booksy.com",
    subject: WORDS,
    received_at: new Date().toISOString(),
    outcome: "booked",
    appointment_id: visit,
  });
  await insert("decisions", {
    tenant_id: T,
    subject_type: "contact",
    subject_id: A,
    verb: "consent_change",
    actor_type: "user",
    actor_user_id: U,
    payload: { words: WORDS },
  });
  await insert("decisions", {
    tenant_id: T,
    subject_type: "conversation",
    subject_id: conversation,
    verb: "edit",
    actor_type: "user",
    actor_user_id: U,
    payload: { words: WORDS },
  });
  for (const [kind, data] of [
    ["contact.named", { name: WORDS, by: U }],
    ["contact.added", { source: "manual", title: WORDS, by: U }],
  ])
    await insert("events", { tenant_id: T, kind, category: "contact", subject_type: "contact", subject_id: A, data });
  // Jobs: one finished with the number, one finished with the address (the scrub by key), one scheduled naming them
  // (erase_contact cancels and scrubs it), each with a provider's refusal that quotes them. A finished row is reached
  // through the guard's own moves.
  const due = new Date(Date.now() + 3_600_000).toISOString();
  for (const payload of [
    { to_phone: PHONE, body: WORDS },
    { to_email: EMAIL, body: WORDS },
  ]) {
    const id = await insert("jobs", { tenant_id: T, kind: "outbound_send", due_at: due, payload, last_error: WORDS });
    ok(await db.from("jobs").update({ state: "fired" }).eq("id", id), "fire");
    ok(await db.from("jobs").update({ state: "done" }).eq("id", id), "finish");
  }
  await insert("jobs", {
    tenant_id: T,
    kind: "outbound_send",
    due_at: due,
    payload: { contact_id: A, body: WORDS },
    last_error: WORDS,
  });

  const search = await insert("lead_searches", {
    tenant_id: T,
    via: "people",
    card: "nearby",
    name: "Needle search",
    asked: "salons nearby",
    plan: {},
  });
  const lead = await insert("leads", {
    tenant_id: T,
    contact_id: A,
    stage: "converted",
    place_id: `place-${DIGITS}-${RUN}`,
    business_name: WORDS,
    category: WORDS,
    street: WORDS,
    city: WORDS,
    region: WORDS,
    postal_code: DIGITS,
    website_host: `${DIGITS}.example.com`,
    instagram_url: URL_WITH,
    phone_e164: PHONE,
    email: EMAIL,
    email_alternates: [EMAIL],
    last_outcome: WORDS,
    last_note: WORDS,
    about: WORDS,
    hours: [{ note: WORDS }],
    image_url: URL_WITH,
    price: WORDS,
    reviews_dist: { note: WORDS },
    facebook_url: URL_WITH,
    linkedin_url: URL_WITH,
    tiktok_url: URL_WITH,
    maps_url: URL_WITH,
    neighborhood: WORDS,
    logo_url: URL_WITH,
    mark_path: SHAPED["leads.mark_path"],
  });
  await insert("lead_places", {
    tenant_id: T,
    lead_id: lead,
    place_id: `place-${DIGITS}-${RUN}`,
    title: WORDS,
    street: WORDS,
  });
  await insert("lead_search_members", {
    tenant_id: T,
    search_id: search,
    lead_id: lead,
    judgment: { words: WORDS },
    class: "qualified",
    reason: WORDS.slice(0, 120),
    counted: false,
  });
  // A preference copied from the lead (00140), and a reach-out's run: the email it wrote the lead, from the lead's
  // record, and the person's own row in it, with the words the run kept for them (a visit's, a proposal's link).
  await insert("lead_preferences", { tenant_id: T, kind: "chain", example: WORDS, from_lead_id: lead });
  const template = await insert("templates", {
    tenant_id: T,
    channel: "email",
    source: "chanlytics",
    name: `needle_${RUN}`,
    language: "en",
    category: "marketing",
    meta_status: "approved",
    components: [{ type: "BODY", text: "Hi {{business}}." }],
  });
  const root = await insert("playbooks", {
    tenant_id: T,
    kind: "reach_out",
    policy_class: "outreach",
    gap_minutes: 5,
    template_id: template,
    template_name: `needle_${RUN}`,
    template_language: "en",
    params: [],
    name: "Needle reach-out",
    trigger: "lead_first",
    lead_search_id: search,
    state: "running",
    signed_by: "Sam",
  });
  const run = await insert("broadcasts", {
    tenant_id: T,
    name: "Needle reach-out · sent",
    template_id: template,
    template_name: `needle_${RUN}`,
    template_language: "en",
    audience: { kind: "reach_out", root_id: root, step_id: root },
    state: "sent",
    scheduled_for: new Date().toISOString(),
    playbook_id: root,
  });
  ok(
    await db.from("reach_out_sends").insert({
      id: crypto.randomUUID(),
      tenant_id: T,
      broadcast_id: run,
      playbook_id: root,
      root_id: root,
      lead_id: lead,
      contact_id: A,
      state: "sent",
      send_at: new Date().toISOString(),
      sent_at: new Date().toISOString(),
      opening: WORDS,
      angle: `Ada ${DIGITS}`,
      hold_detail: WORDS,
    }),
    "reach_out_sends",
  );
  ok(
    await db.from("broadcast_recipients").insert({
      tenant_id: T,
      broadcast_id: run,
      contact_id: A,
      channel: "email",
      facts: { visit_when: WORDS, proposal_link: URL_WITH },
    }),
    "broadcast_recipients",
  );

  // Their own note goes with them; a note about someone else that carries their number and address is scrubbed in place.
  await insert("person_notes", {
    tenant_id: T,
    contact_id: A,
    body: WORDS,
    author_kind: "member",
    state: "kept",
    source: "page",
  });
  await insert("person_notes", {
    tenant_id: T,
    contact_id: B,
    body: WORDS,
    author_kind: "member",
    state: "kept",
    source: "page",
  });

  // Two Ask threads that outlive the scrub, each with a turn that is not theirs: one their words make theirs, its title
  // and scope quoting them; one scoped to them by their id alone. Each keeps its other turn and loses its title and scope.
  asked.quoted = await insert("ask_threads", {
    tenant_id: T,
    user_id: U,
    title: WORDS,
    scope: { kind: "person", id: A, label: WORDS },
  });
  asked.scoped = await insert("ask_threads", {
    tenant_id: T,
    user_id: U,
    title: "Their booking",
    scope: { kind: "person", id: A, label: "Their booking" },
  });
  for (const [thread, text] of [
    [asked.quoted, WORDS],
    [asked.quoted, "Anything else?"],
    [asked.scoped, "Anything else?"],
  ])
    await insert("ask_messages", { thread_id: thread, tenant_id: T, user_id: U, role: "user", content: { text } });

  const pe = `pe-${RUN}`;
  made.providerEvents.push(pe);
  ok(
    await db.from("provider_events").insert({
      provider: "twilio",
      provider_event_id: pe,
      door: "inbound-sms",
      url: "/api/inbound-sms",
      tenant_id: T,
      verified: true,
      headers: {},
      body: `From=%2B1${DIGITS}&Body=${encodeURIComponent(WORDS)}`,
    }),
    "provider_events",
  );
}

/** Each registered column with the number or the address still in it, within this workspace. */
function needlesLeft() {
  const cols = columnsToProve();
  const unions = cols.map(({ table, column }) => {
    const scope = table === "provider_events" ? `(tenant_id = '${T}' or tenant_id is null)` : `tenant_id = '${T}'`;
    return `select '${table}.${column}' as col, count(*)::int as n from public.${table}
             where ${scope} and (${column}::text ilike '%${DIGITS}%' or ${column}::text ilike '%${EMAIL}%')`;
  });
  return query(unions.join("\nunion all\n"))
    .filter((r) => r.n > 0)
    .map((r) => `${r.col} (${r.n})`);
}

test("every registered column is seeded, and before the erasure each one holds the needles", { skip }, async () => {
  await seed();
  const left = needlesLeft();
  const shaped = new Set(Object.keys(SHAPED));
  const expected = columnsToProve()
    .map(({ table, column }) => `${table}.${column}`)
    .filter((c) => !shaped.has(c));
  assert.deepEqual(
    left.map((s) => s.replace(/ \(\d+\)$/, "")).sort(),
    expected.sort(),
    "a registered column with no seed here is a column this suite does not prove: seed it",
  );
});

test(
  "after the erasure no registered column holds the number or the address, and the shaped ones are empty",
  { skip },
  async () => {
    const ctx = { supabase: as, userId: U, email: `owner-${RUN}@example.com`, metadata: {}, params: { id: A } };
    const out = await route.DELETE.run(new Request("http://localhost/api/v1/contacts/x", { method: "DELETE" }), ctx);
    assert.equal(out.contact_id, A);
    assert.ok(!out.already_erased, "a live person, erased now");

    assert.deepEqual(needlesLeft(), [], "a needle left is a column the registry claims and no leg reaches");

    const [tomb] = query(
      `select erased_at is not null as erased, email_suppressed_reason, consent_channels, marketing_channels
       from public.contacts where id = '${A}'`,
    );
    assert.equal(tomb.erased, true);
    assert.equal(tomb.email_suppressed_reason, null, "the suppression's reason went with the address");
    assert.equal(tomb.consent_channels, null, "the channels they said yes on went with the answer");
    assert.equal(tomb.marketing_channels, null);
    const [lead] = query(`select mark_path, business_name from public.leads where tenant_id = '${T}'`);
    assert.deepEqual([lead.mark_path, lead.business_name], [null, ""], "the lead is blanked, its mark with it");
    const [{ n: threads }] = query(`select count(*)::int as n from public.conversations where contact_id = '${A}'`);
    assert.equal(threads, 0, "the thread, with the call that held it, went with the person");
    // A run's rows are its counts: kept, with only the words gone.
    const [send] = query(`select state, opening, angle from public.reach_out_sends where tenant_id = '${T}'`);
    assert.deepEqual(
      send,
      { state: "sent", opening: null, angle: null },
      "the reach-out's send is kept, its words gone",
    );
    const [row] = query(`select facts from public.broadcast_recipients where tenant_id = '${T}'`);
    assert.equal(row.facts, null, "the run's row for them is kept, the words it kept for them gone");
    // Their Ask threads are kept with the turns that are not theirs, the title and the scope cleared.
    const asks = query(
      `select id, title, scope, (select count(*)::int from public.ask_messages m where m.thread_id = t.id) as turns
         from public.ask_threads t where t.id in ('${asked.quoted}', '${asked.scoped}')`,
    );
    assert.deepEqual(
      asks.map((t) => [t.id === asked.quoted ? "quoted" : "scoped", t.title, t.scope, t.turns]).sort(),
      [
        ["quoted", "", null, 1],
        ["scoped", "", null, 1],
      ],
      "a thread their words or their id made theirs keeps its other turn, and loses its title and scope",
    );

    // Someone else's record is kept, with only the needles gone.
    const [note] = query(`select body from public.person_notes where contact_id = '${B}'`);
    assert.match(note.body, /\[erased\]/);
    assert.ok(!note.body.includes(DIGITS) && !note.body.includes(EMAIL));
    const [kept] = query(`select display_name, phone_e164 from public.contacts where id = '${B}'`);
    assert.deepEqual(kept, { display_name: "Bo Kept", phone_e164: "+16465550198" });
  },
);
