/**
 * A playbook's totals, a run's counts and a message's sends, counted where they are (00362), proved against seeded
 * truth on a real Postgres -- never against the fold they replace, which is wrong past its caps and for a thread two
 * people on one run share (apps/dashboard/src/server/campaigns/broadcasts.ts countRecipients):
 *
 *   1. A salon (A) whose numbers the fold counts right: three moment playbooks and a reach-out chain; forty runs of
 *      Win-back across every state, one waiting; skipped and failed people, a failed one with a message; replies inside
 *      and outside the 72 hours, at the window's edge and a second past it, an automatic reply and a booking tool's
 *      notice inside them, a call's note, a reply before the send; a thread on two runs; a one-off broadcast and a
 *      template the Inbox sent. Each number is the hand count beside its seed.
 *   2. A shop (B) past the fold's caps: 1,050 runs on one playbook, and eleven runs of 2,000 people in the newest chunk
 *      of two hundred runs.
 *   3. A studio (C) whose one run reached two people on one thread: the reply came an hour after the first send.
 *   4. The floor: an empty workspace answers {}, and a signed-in member of another workspace reads {} of the salon's (the
 *      suites run as the service role, which row security never stops). The window is contracts' REPLY_WINDOW_MS, and
 *      campaign_series reads it.
 *   5. At scale (spec §4.7): 3,600 runs of 25 people answer a signed-in member inside the 8 seconds a member's statement
 *      has (00283), as GET playbooks asks it. A playbook's totals that carried every run's counts on each run's row took
 *      half a minute here, and a timeout is no missing function: the dashboard would have had no fold to fall back to.
 *      Then the same workspace talks: 1,800 more messages of its people's own, none a reply, and the answer comes inside
 *      half those 8 seconds. Before run_counts' fence its replied step weighed every thread against every inbound
 *      message, and this case hit the member's 8 seconds.
 *   6. The dashboard's own reads on the stack: GET playbooks and Sent say the same bytes counted by the database as by the
 *      fold a database before 00362 leaves them, where the fold counts right (the salon), and the fold's wrong answers
 *      where it does not (the shop, the studio); the fake database's twins say what the SQL says.
 *
 * Local stack only: it makes workspaces, people, runs and users.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { REPLY_WINDOW_MS, isPlaybookTotalsDto, isReplyTo, runCountsOf, templateSendsOf } from "@chanlytics/contracts";
import { fakeDb } from "../../_fake-db.mjs";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const CLI = process.env.SUPABASE_CLI || "supabase";
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite makes workspaces, runs and users"
      : !ANON
        ? "no SUPABASE_ANON_KEY in env: the members this suite signs in as need it"
        : false;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");

// The dashboard's own reads, run on the stack: modules that build a service client on first use read these.
process.env.NEXT_PUBLIC_SUPABASE_URL ??= URL_ ?? "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const P = await import(at("apps/dashboard/src/server/campaigns/playbooks.ts"));
const Bc = await import(at("apps/dashboard/src/server/campaigns/broadcasts.ts"));

/**
 * The session client as a database before 00362 answers it: the named functions are not there (PostgREST's PGRST202),
 * so the dashboard reads the old way, as it will for one release. Everything else is the client's own.
 */
const before00362 = (client, names) =>
  new Proxy(client, {
    get(target, prop) {
      if (prop === "rpc")
        return (name, args, opts) =>
          names.includes(name)
            ? Promise.resolve({
                data: null,
                error: { code: "PGRST202", message: `Could not find the function public.${name}` },
              })
            : target.rpc(name, args, opts);
      const value = Reflect.get(target, prop, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });

/** One SQL read of the local stack, for what PostgREST does not serve (pg_proc, an interval's seconds). */
function query(sql) {
  const r = spawnSync(CLI, ["db", "query", "--local", "--output-format", "json", sql], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (r.error) throw new Error(`could not run ${CLI} (${r.error.message}); set SUPABASE_CLI to the supabase binary`);
  if (r.status !== 0) throw new Error(`${CLI} db query failed: ${[r.stderr, r.stdout].join("\n").trim().slice(-800)}`);
  const out = r.stdout;
  const start = out.search(/[[{]/);
  if (start < 0) return [];
  const parsed = JSON.parse(out.slice(start, out.lastIndexOf(out[start] === "{" ? "}" : "]") + 1));
  return Array.isArray(parsed) ? parsed : (parsed.rows ?? []);
}

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const NOW = Date.now();
const iso = (ms) => new Date(ms).toISOString();
const dayOf = (ms) => iso(ms).slice(0, 10);
const RUN = `${NOW.toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
const uuid = () => crypto.randomUUID();

const db = skip ? null : createClient(URL_, KEY, { auth: { persistSession: false } });
const tenants = [];
const users = [];
const ok = (res, what = "the read") => {
  assert.equal(res.error, null, `${what}: ${res.error?.message}`);
  return res.data;
};

/** Rows written a thousand at a time; every row of one call carries the same keys, as PostgREST's bulk insert wants. */
async function insertAll(table, rows) {
  for (let i = 0; i < rows.length; i += 1000)
    ok(await db.from(table).insert(rows.slice(i, i + 1000)), `${table} written`);
}
/** A workspace in UTC, so the hours are the fixture's. */
async function workspace(label) {
  const id = ok(
    await db
      .from("tenants")
      .insert({ slug: `totals-${label}-${RUN}`, name: `Totals ${label}`, timezone: "UTC" })
      .select("id")
      .single(),
  ).id;
  tenants.push(id);
  return id;
}
async function template(tenant, name, channel = "whatsapp") {
  return ok(
    await db
      .from("templates")
      .insert({ tenant_id: tenant, channel, name, language: "en_US", meta_status: "approved" })
      .select("id")
      .single(),
  ).id;
}
async function moment(tenant, tpl, { name, trigger, policy_class, template_name }) {
  return ok(
    await db
      .from("playbooks")
      .insert({
        tenant_id: tenant,
        name,
        trigger,
        template_id: tpl,
        template_name,
        template_language: "en_US",
        params: [],
        policy_class,
        state: "running",
      })
      .select("id")
      .single(),
  ).id;
}
/** People, each with a thread of their own. */
async function people(tenant, n) {
  const out = Array.from({ length: n }, () => ({ contact: uuid(), thread: uuid() }));
  await insertAll(
    "contacts",
    out.map((p) => ({ id: p.contact, tenant_id: tenant })),
  );
  await insertAll(
    "conversations",
    out.map((p) => ({ id: p.thread, tenant_id: tenant, contact_id: p.contact })),
  );
  return out;
}
/** A member signed in: the functions run on the caller's rights, so who calls decides what they read. */
async function member(tenant, role) {
  const email = `totals-${role}-${RUN}-${users.length}@example.com`;
  const password = `pw-${RUN}-${role}-Aa1!`;
  const made = await db.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(made.error, null, made.error?.message);
  users.push(made.data.user.id);
  ok(await db.from("memberships").insert({ tenant_id: tenant, user_id: made.data.user.id, role }), "the membership");
  const c = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  ok(await c.auth.signInWithPassword({ email, password }), "the sign-in");
  return c;
}

/** A message row; every one carries the same keys (template_name and external_id null unless the Inbox sent a template). */
const message = (tenant, who, at, over) => ({
  id: uuid(),
  tenant_id: tenant,
  conversation_id: who.thread,
  contact_id: who.contact,
  channel: "whatsapp",
  direction: "outbound",
  sender: "human",
  type: "template",
  body: "We miss you",
  status: "delivered",
  meta: { source: "broadcast" },
  template_name: null,
  external_id: null,
  created_at: iso(at),
  ...over,
});

/** The salon (A): its playbooks, its runs and its people's words, each seed beside what it counts. */
async function salon() {
  const tenant = await workspace("salon");
  const winbackTpl = await template(tenant, "winback_offer");
  const welcomeTpl = await template(tenant, "welcome_note");
  const reachTpl = await template(tenant, "reach_hello", "email");
  const winback = await moment(tenant, winbackTpl, {
    name: "Win-back",
    trigger: "quiet_30",
    policy_class: "reengage",
    template_name: "winback_offer",
  });
  const welcome = await moment(tenant, welcomeTpl, {
    name: "Welcome",
    trigger: "new_week",
    policy_class: "campaign",
    template_name: "welcome_note",
  });
  const lapsed = await moment(tenant, winbackTpl, {
    name: "Lapsed",
    trigger: "lapsed",
    policy_class: "reengage",
    template_name: "winback_offer",
  });
  const search = ok(
    await db
      .from("lead_searches")
      .insert({
        tenant_id: tenant,
        via: "people",
        card: "movers",
        name: "Movers · Austin",
        asked: "movers in Austin",
        plan: {},
      })
      .select("id")
      .single(),
  ).id;
  const chain = ok(
    await db
      .from("playbooks")
      .insert({
        tenant_id: tenant,
        kind: "reach_out",
        trigger: "lead_first",
        name: "Reach out · Movers",
        template_id: reachTpl,
        template_name: "reach_hello",
        template_language: "en_US",
        params: [],
        policy_class: "outreach",
        gap_minutes: 12,
        lead_search_id: search,
        state: "running",
      })
      .select("id")
      .single(),
  ).id;
  const folk = await people(tenant, 150);
  let next = 0;
  const fresh = () => folk[next++];
  const T0 = NOW - 45 * DAY;
  const runs = [];
  const recipients = [];
  const messages = [];
  const runOf = (playbook, i, at, over = {}) => {
    const r = {
      id: uuid(),
      tenant_id: tenant,
      name: `Run ${i}`,
      template_id: winbackTpl,
      template_name: "winback_offer",
      template_language: "en_US",
      audience: { kind: "playbook", id: playbook, label: "Win-back", trigger: "quiet_30" },
      state: "sent",
      scheduled_for: iso(at),
      recipient_count: 0,
      playbook_id: playbook,
      run_for: dayOf(at),
      created_at: iso(at),
      ...over,
    };
    runs.push(r);
    return r;
  };
  /** One person on a run: with a message of the run's in their thread when `status` names its receipt. */
  const on = (run, who, state, { sentAt = null, status = null, channel = null } = {}) => {
    const sent = status ? message(tenant, who, sentAt, { status, channel: channel ?? "whatsapp" }) : null;
    if (sent) messages.push(sent);
    recipients.push({
      broadcast_id: run.id,
      contact_id: who.contact,
      tenant_id: tenant,
      state,
      reason: state === "skipped" ? "opted_out" : null,
      message_id: sent?.id ?? null,
      sent_at: sentAt === null ? null : iso(sentAt),
      channel,
    });
    run.recipient_count += 1;
  };
  /** What a person wrote: on their thread, at `at`. */
  const wrote = (who, at, over = {}) =>
    messages.push(
      message(tenant, who, at, {
        direction: "inbound",
        sender: "customer",
        type: "text",
        body: "Yes please",
        status: "received",
        meta: {},
        ...over,
      }),
    );

  // Win-back, runs 0-29, sent: three people sent (read, delivered, sent) and one held back. Run 7's second went by
  // email, run 8's first by text (a carrier's "read" is no read).
  const slots = {};
  for (let i = 0; i < 30; i += 1) {
    const at = T0 + i * DAY;
    const run = runOf(winback, i, at);
    const first = fresh();
    const second = fresh();
    slots[i] = { first, second, at };
    on(run, first, "sent", { sentAt: at, status: "read", channel: i === 8 ? "sms" : null });
    on(run, second, "sent", { sentAt: at + MIN, status: "delivered", channel: i === 7 ? "email" : null });
    on(run, fresh(), "sent", { sentAt: at + 2 * MIN, status: "sent" });
    on(run, fresh(), "skipped");
  }
  // Runs 30-39: three scheduled, one sending, two failed, three canceled, the newest waiting for a person.
  for (let i = 30; i < 40; i += 1) {
    const at = T0 + i * DAY;
    const state =
      i <= 32 ? "scheduled" : i === 33 ? "sending" : i <= 35 ? "failed" : i <= 38 ? "canceled" : "pending_approval";
    const run = runOf(winback, i, at, { state });
    if (state === "scheduled" || state === "pending_approval") {
      on(run, fresh(), "queued");
      on(run, fresh(), "queued");
    }
    if (state === "sending") {
      on(run, fresh(), "sent", { sentAt: at, status: "sent" });
      on(run, fresh(), "queued");
    }
    if (i === 34) {
      const first = fresh();
      slots[34] = { first, at };
      on(run, first, "failed", { sentAt: at, status: "delivered" });
      on(run, fresh(), "failed");
    }
    if (i === 35) {
      on(run, fresh(), "failed");
      on(run, fresh(), "failed");
    }
  }
  // One person on runs 20 and 24, four days apart: each answered by its own send.
  const x = fresh();
  for (const i of [20, 24])
    on(
      runs.find((r) => r.name === `Run ${i}`),
      x,
      "sent",
      { sentAt: T0 + i * DAY + 3 * MIN, status: "delivered" },
    );
  wrote(x, T0 + 20 * DAY + 3 * MIN + 2 * HOUR);
  wrote(x, T0 + 24 * DAY + 3 * MIN + HOUR);
  // What came back on the sent runs' first threads.
  wrote(slots[0].first, slots[0].at + HOUR); // a reply: counted
  wrote(slots[1].first, slots[1].at + 73 * HOUR); // past the 72 hours: not
  wrote(slots[2].first, slots[2].at + 2 * HOUR, { channel: "email", meta: { email: { claim: "auto_reply" } } }); // an out-of-office: not
  wrote(slots[3].first, slots[3].at + 2 * HOUR, { channel: "email", meta: { email: { claim: "booking_notice" } } }); // a booking tool's notice: not (00361)
  wrote(slots[4].first, slots[4].at + REPLY_WINDOW_MS); // at the window's edge: counted
  wrote(slots[5].first, slots[5].at + REPLY_WINDOW_MS + 1000); // a second past it: not
  wrote(slots[6].first, slots[6].at + HOUR); // twice on one thread: counted once
  wrote(slots[6].first, slots[6].at + 2 * HOUR);
  wrote(slots[7].second, slots[7].at + MIN + HOUR, { channel: "email", meta: { email: { claim: "person" } } }); // by email, their own words: counted
  wrote(slots[8].first, slots[8].at + HOUR, { channel: "voice", sender: "system", type: "call_summary" }); // a call's note: not
  wrote(slots[9].first, slots[9].at - HOUR); // before the send: not
  wrote(slots[34].first, slots[34].at + 3 * HOUR); // a failed person with a message, answered: counted
  // Welcome: three runs of two, delivered, nobody answered.
  for (let i = 0; i < 3; i += 1) {
    const at = T0 + i * DAY + 12 * HOUR;
    const run = runOf(welcome, 100 + i, at, {
      template_id: welcomeTpl,
      template_name: "welcome_note",
      audience: { kind: "playbook", id: welcome, label: "Welcome", trigger: "new_week" },
    });
    on(run, fresh(), "sent", { sentAt: at, status: "delivered" });
    on(run, fresh(), "sent", { sentAt: at + MIN, status: "delivered" });
  }
  // The chain's step run, a one-off broadcast, and the Inbox's template: none is a moment's run.
  const chainRun = runOf(chain, 200, T0 + 5 * HOUR, {
    template_id: reachTpl,
    template_name: "reach_hello",
    audience: { kind: "reach_out", root_id: chain, step_id: chain },
  });
  on(chainRun, fresh(), "sent", { sentAt: T0 + 5 * HOUR, status: "delivered", channel: "email" });
  const oneOff = runOf(null, 300, T0 + 7 * HOUR, {
    playbook_id: null,
    run_for: null,
    audience: { kind: "everyone", id: null, label: "Everyone" },
  });
  on(oneOff, fresh(), "sent", { sentAt: T0 + 7 * HOUR, status: "delivered" });
  on(oneOff, fresh(), "sent", { sentAt: T0 + 7 * HOUR + MIN, status: "read" });
  const inboxWho = fresh();
  messages.push(
    message(tenant, inboxWho, T0 + 30 * DAY, {
      meta: {},
      template_name: "winback_offer",
      external_id: `wamid.salon-${RUN}`,
    }),
  );
  messages.push(
    message(tenant, inboxWho, T0 + 31 * DAY, { meta: {}, status: "queued", template_name: "winback_offer" }),
  ); // still in its veto window: not sent
  await insertAll("broadcasts", runs);
  await insertAll("messages", messages);
  await insertAll("broadcast_recipients", recipients);
  return {
    tenant,
    winback,
    welcome,
    lapsed,
    chain,
    runs,
    slots,
    T0,
    run: (playbook, i) => runs.find((r) => r.playbook_id === playbook && r.name === `Run ${i}`),
  };
}

/** The shop (B), past the fold's caps: 1,050 runs on Big, the oldest; eleven runs of 2,000 people on Wide, the newest. */
async function shop() {
  const tenant = await workspace("shop");
  const tpl = await template(tenant, "winback_offer");
  const big = await moment(tenant, tpl, {
    name: "Big",
    trigger: "lapsed",
    policy_class: "reengage",
    template_name: "winback_offer",
  });
  const wide = await moment(tenant, tpl, {
    name: "Wide",
    trigger: "new_week",
    policy_class: "campaign",
    template_name: "winback_offer",
  });
  const [alone] = await people(tenant, 1);
  const crowd = await people(tenant, 2000);
  const T0 = NOW - 30 * DAY;
  const runs = [];
  const recipients = [];
  const runOf = (playbook, name, at, runFor, count) => {
    const id = uuid();
    runs.push({
      id,
      tenant_id: tenant,
      name,
      template_id: tpl,
      template_name: "winback_offer",
      template_language: "en_US",
      audience: { kind: "playbook", id: playbook, label: name, trigger: "lapsed" },
      state: "sent",
      scheduled_for: iso(at),
      recipient_count: count,
      playbook_id: playbook,
      run_for: runFor,
      created_at: iso(at),
    });
    return id;
  };
  for (let i = 0; i < 1050; i += 1) {
    const at = T0 + i * MIN;
    const id = runOf(big, `Big ${i}`, at, dayOf(T0 - i * DAY), 1);
    recipients.push({
      broadcast_id: id,
      contact_id: alone.contact,
      tenant_id: tenant,
      state: "sent",
      sent_at: iso(at),
    });
  }
  for (let j = 0; j < 11; j += 1) {
    const at = T0 + (1100 + j) * MIN;
    const id = runOf(wide, `Wide ${j}`, at, dayOf(T0 - j * DAY), 2000);
    for (const p of crowd)
      recipients.push({ broadcast_id: id, contact_id: p.contact, tenant_id: tenant, state: "sent", sent_at: iso(at) });
  }
  await insertAll("broadcasts", runs);
  await insertAll("broadcast_recipients", recipients);
  return { tenant, big, wide };
}

/** The studio (C): one run, two people on one thread, the second sent 80 hours after the first; a reply an hour after the first. */
async function studio() {
  const tenant = await workspace("studio");
  const tpl = await template(tenant, "winback_offer");
  const pb = await moment(tenant, tpl, {
    name: "Shared",
    trigger: "quiet_30",
    policy_class: "reengage",
    template_name: "winback_offer",
  });
  // The fold keeps the thread's send of the person whose id sorts last: the later send goes to that one.
  const [early, late] = [uuid(), uuid()].sort();
  await insertAll("contacts", [
    { id: early, tenant_id: tenant },
    { id: late, tenant_id: tenant },
  ]);
  const thread = uuid();
  await insertAll("conversations", [{ id: thread, tenant_id: tenant, contact_id: early }]);
  const T = NOW - 10 * DAY;
  const run = uuid();
  await insertAll("broadcasts", [
    {
      id: run,
      tenant_id: tenant,
      name: "Shared run",
      template_id: tpl,
      template_name: "winback_offer",
      template_language: "en_US",
      audience: { kind: "playbook", id: pb, label: "Shared", trigger: "quiet_30" },
      state: "sent",
      scheduled_for: iso(T),
      recipient_count: 2,
      playbook_id: pb,
      run_for: dayOf(T),
      created_at: iso(T),
    },
  ]);
  const first = message(tenant, { contact: early, thread }, T);
  const second = message(tenant, { contact: late, thread }, T + 80 * HOUR);
  const reply = message(tenant, { contact: early, thread }, T + HOUR, {
    direction: "inbound",
    sender: "customer",
    type: "text",
    body: "Yes please",
    status: "received",
    meta: {},
  });
  await insertAll("messages", [first, second, reply]);
  await insertAll("broadcast_recipients", [
    { broadcast_id: run, contact_id: early, tenant_id: tenant, state: "sent", message_id: first.id, sent_at: iso(T) },
    {
      broadcast_id: run,
      contact_id: late,
      tenant_id: tenant,
      state: "sent",
      message_id: second.id,
      sent_at: iso(T + 80 * HOUR),
    },
  ]);
  return { tenant, pb, run };
}

let W;
/** Built once, whether it lands or fails: every test that needs it says the same thing. */
const world = () => (W ??= build());
async function build() {
  const A = await salon();
  const B = await shop();
  const C = await studio();
  const E = await workspace("empty");
  return { A, B, C, E };
}

/**
 * A busy workspace's year and a half, written in SQL in one statement: six moments of 600 daily runs, each run sending
 * 24 people (20 delivered, 3 read, one only sent) and skipping one. The people come in four groups of 150, so each is
 * written to every fourth day and a reply an hour after a send answers that send alone; the first person of every fifth
 * run replies. So each moment is 600 runs, 14,400 sent, 13,800 delivered, 600 held and 120 replied.
 */
const SCALE = { moments: 6, runs: 600, people: 25 };
const scaled = [];
function atScale() {
  const tenant = uuid();
  scaled.push(tenant);
  const person = (p) => `md5(t || ':person:' || (${p}))::uuid`;
  const thread = (p) => `md5(t || ':thread:' || (${p}))::uuid`;
  const who = "(j % 4) * 150 + p * 25 + k";
  const at = "t0 + j * interval '1 day' + p * interval '1 minute'";
  query(`do $$
declare
  t uuid := '${tenant}';
  tpl uuid := md5('${tenant}' || ':template')::uuid;
  t0 timestamptz := date_trunc('day', now()) - interval '700 days';
begin
  insert into public.tenants (id, slug, name, timezone) values (t, 'totals-scale-${RUN}', 'Totals at scale', 'UTC');
  insert into public.templates (id, tenant_id, channel, name, language, meta_status)
    values (tpl, t, 'whatsapp', 'scale_offer', 'en_US', 'approved');
  insert into public.playbooks (id, tenant_id, name, trigger, template_id, template_name, template_language, policy_class)
    select md5(t || ':moment:' || p)::uuid, t, 'Moment ' || p, 'quiet_30', tpl, 'scale_offer', 'en_US', 'reengage'
      from generate_series(0, ${SCALE.moments - 1}) p;
  insert into public.contacts (id, tenant_id) select ${person("c")}, t from generate_series(0, 599) c;
  insert into public.conversations (id, tenant_id, contact_id)
    select ${thread("c")}, t, ${person("c")} from generate_series(0, 599) c;
  insert into public.broadcasts (id, tenant_id, name, template_id, template_name, template_language, audience, state,
                                 scheduled_for, recipient_count, playbook_id, run_for, created_at)
    select md5(t || ':run:' || p || ':' || j)::uuid, t, 'Run ' || j, tpl, 'scale_offer', 'en_US',
           jsonb_build_object('kind', 'playbook', 'id', md5(t || ':moment:' || p)::uuid, 'label', 'Moment ' || p,
                              'trigger', 'quiet_30'),
           'sent', ${at}, ${SCALE.people}, md5(t || ':moment:' || p)::uuid, (t0 + j * interval '1 day')::date, ${at}
      from generate_series(0, ${SCALE.moments - 1}) p, generate_series(0, ${SCALE.runs - 1}) j;
  insert into public.messages (id, tenant_id, conversation_id, contact_id, channel, direction, sender, type, body, status,
                               meta, created_at)
    select md5(t || ':sent:' || p || ':' || j || ':' || k)::uuid, t, ${thread(who)}, ${person(who)},
           'whatsapp', 'outbound', 'human', 'template', 'We miss you',
           case when k < 20 then 'delivered' when k < 23 then 'read' else 'sent' end,
           jsonb_build_object('source', 'broadcast'), ${at} + k * interval '1 second'
      from generate_series(0, ${SCALE.moments - 1}) p, generate_series(0, ${SCALE.runs - 1}) j,
           generate_series(0, ${SCALE.people - 2}) k;
  insert into public.broadcast_recipients (broadcast_id, contact_id, tenant_id, state, reason, message_id, sent_at)
    select md5(t || ':run:' || p || ':' || j)::uuid, ${person(who)}, t,
           case when k < ${SCALE.people - 1} then 'sent' else 'skipped' end,
           case when k < ${SCALE.people - 1} then null else 'opted_out' end,
           case when k < ${SCALE.people - 1} then md5(t || ':sent:' || p || ':' || j || ':' || k)::uuid end,
           case when k < ${SCALE.people - 1} then ${at} + k * interval '1 second' end
      from generate_series(0, ${SCALE.moments - 1}) p, generate_series(0, ${SCALE.runs - 1}) j,
           generate_series(0, ${SCALE.people - 1}) k;
  insert into public.messages (tenant_id, conversation_id, contact_id, channel, direction, sender, type, body, status,
                               meta, created_at)
    select t, ${thread("(j % 4) * 150 + p * 25")}, ${person("(j % 4) * 150 + p * 25")}, 'whatsapp', 'inbound', 'customer',
           'text', 'Yes please', 'received', '{}'::jsonb, ${at} + interval '1 hour'
      from generate_series(0, ${SCALE.moments - 1}) p, generate_series(0, ${SCALE.runs - 1}, 5) j;
end $$`);
  return tenant;
}
let busy;
/** The busy workspace, seeded once: the scale case reads it as written, then the talking case adds to it. */
const busyWorkspace = () => (busy ??= atScale());

after(async () => {
  if (skip) return;
  for (const id of tenants) await db.from("tenants").delete().eq("id", id);
  // A workspace of 90,000 people on runs goes as it came, in SQL, past the service role's 30 seconds.
  for (const id of scaled) query(`delete from public.tenants where id = '${id}'`);
  for (const id of users) await db.auth.admin.deleteUser(id).catch(() => {});
});

test(
  "the salon: playbook_totals says what every Win-back and Welcome run earned, the run that waits and the newest ten, and nothing of a playbook that never ran or of a reach-out's step",
  { skip },
  async () => {
    const w = await world();
    const got = ok(await db.rpc("playbook_totals", { p_tenant_id: w.A.tenant, p_history: 10 }), "playbook_totals");
    // The guard the dashboard reads it through takes it: every count a whole number, as contracts' isCount asks.
    assert.equal(isPlaybookTotalsDto(got), true, "contracts' guard takes the database's answer");
    assert.deepEqual(
      Object.keys(got).sort(),
      [w.A.winback, w.A.welcome].sort(),
      "the two moments that ran: not Lapsed, never the chain",
    );
    const run = (i) => w.A.run(w.A.winback, i);
    const t = got[w.A.winback];
    // Sent: 30 runs x 3, the person on two runs, run 33's one. Delivered: two of three on each sent run, that person's
    // two, run 34's failed person with a delivered message. Replied: runs 0, 4, 6, 7, 20, 24 and 34. Held: 30 skipped, 4 failed.
    assert.deepEqual([t.runs, t.sent, t.delivered, t.replied, t.held], [40, 93, 63, 7, 34]);
    assert.deepEqual(t.last_run, {
      id: run(39).id,
      state: "pending_approval",
      run_for: run(39).run_for,
      recipient_count: 2,
    });
    assert.deepEqual(t.waiting, {
      id: run(39).id,
      recipient_count: 2,
      name: "Run 39",
      run_for: run(39).run_for,
      trigger: "quiet_30",
    });
    assert.deepEqual(
      t.history.map((h) => [h.id, h.state, h.recipient_count, h.sent, h.held, h.delivered, h.replied]),
      [
        [run(39).id, "pending_approval", 2, 0, 0, 0, 0],
        [run(38).id, "canceled", 0, 0, 0, 0, 0],
        [run(37).id, "canceled", 0, 0, 0, 0, 0],
        [run(36).id, "canceled", 0, 0, 0, 0, 0],
        [run(35).id, "failed", 2, 0, 2, 0, 0],
        [run(34).id, "failed", 2, 0, 2, 1, 1],
        [run(33).id, "sending", 2, 1, 0, 0, 0],
        [run(32).id, "scheduled", 2, 0, 0, 0, 0],
        [run(31).id, "scheduled", 2, 0, 0, 0, 0],
        [run(30).id, "scheduled", 2, 0, 0, 0, 0],
      ],
    );
    for (const h of t.history) {
      const seeded = w.A.runs.find((r) => r.id === h.id);
      assert.equal(Date.parse(h.scheduled_for), Date.parse(seeded.scheduled_for), "a run's time, as it was set");
      assert.equal(h.run_for, seeded.run_for);
    }
    const welcome = got[w.A.welcome];
    assert.deepEqual(
      [welcome.runs, welcome.sent, welcome.delivered, welcome.replied, welcome.held, welcome.waiting],
      [3, 6, 6, 0, 0, null],
    );
    assert.equal(welcome.last_run.id, w.A.run(w.A.welcome, 102).id);
    assert.equal(welcome.history.length, 3);
    const three = ok(await db.rpc("playbook_totals", { p_tenant_id: w.A.tenant, p_history: 3 }), "three");
    assert.deepEqual(
      three[w.A.winback].history.map((h) => h.id),
      [run(39).id, run(38).id, run(37).id],
      "p_history is the card's ten, said by the caller",
    );
  },
);

test(
  "the salon: run_counts says each run's people, receipts and replies as Sent and a run's sheet say them -- each thread once from its first send, the 72 hours to the second, a person's own words alone -- and nothing of a run nobody is on",
  { skip },
  async () => {
    const w = await world();
    const id = (i) => w.A.run(w.A.winback, i).id;
    const got = ok(
      await db.rpc("run_counts", { p_tenant_id: w.A.tenant, p_run_ids: [0, 4, 5, 7, 8, 20, 34, 36, 39].map(id) }),
      "run_counts",
    );
    assert.notEqual(runCountsOf(got), null, "contracts' reader takes the database's answer");
    const counts = (queued, sent, skipped, failed, delivered, read, replied, whatsapp, sms, email) => ({
      queued,
      sent,
      skipped,
      failed,
      delivered,
      read,
      replied,
      sent_by: { whatsapp, sms, email },
    });
    assert.deepEqual(got[id(0)], counts(0, 3, 1, 0, 2, 1, 1, 3, 0, 0), "a reply an hour after");
    assert.deepEqual(got[id(4)], counts(0, 3, 1, 0, 2, 1, 1, 3, 0, 0), "a reply at the window's edge");
    assert.deepEqual(got[id(5)], counts(0, 3, 1, 0, 2, 1, 0, 3, 0, 0), "a second past it");
    assert.deepEqual(got[id(7)], counts(0, 3, 1, 0, 2, 1, 1, 2, 0, 1), "by email, in their own words");
    assert.deepEqual(
      got[id(8)],
      counts(0, 3, 1, 0, 2, 0, 0, 2, 1, 0),
      "a text a carrier read is no read; a call's note no reply",
    );
    assert.deepEqual(
      got[id(20)],
      counts(0, 4, 1, 0, 3, 1, 1, 4, 0, 0),
      "the thread on two runs answers this one by its own send",
    );
    assert.deepEqual(got[id(34)], counts(0, 0, 0, 2, 1, 0, 1, 0, 0, 0), "a failed person with a message, answered");
    assert.deepEqual(got[id(39)], counts(2, 0, 0, 0, 0, 0, 0, 0, 0, 0), "a run that waits: its people queued");
    assert.equal(got[id(36)], undefined, "a run nobody is on is absent: the dashboard says it as zeros");
    // The window is contracts' to the second: the edge counts and a second past it does not, as isReplyTo says.
    const edge = w.A.slots[4].at;
    const past = w.A.slots[5].at;
    assert.equal(isReplyTo(iso(edge), iso(edge + REPLY_WINDOW_MS)), true);
    assert.equal(isReplyTo(iso(past), iso(past + REPLY_WINDOW_MS + 1000)), false);
  },
);

test(
  "the salon: template_sends says how many of each message went out -- a person a run sent, or a template the Inbox sent that WhatsApp took -- and when the latest did",
  { skip },
  async () => {
    const w = await world();
    const got = ok(await db.rpc("template_sends", { p_tenant_id: w.A.tenant }), "template_sends");
    assert.notEqual(templateSendsOf(got), null, "contracts' reader takes the database's answer");
    assert.deepEqual(Object.keys(got).sort(), ["reach_hello", "welcome_note", "winback_offer"]);
    // Win-back's 93, the one-off's 2 and the Inbox's one that left; not the one still in its veto window.
    assert.deepEqual([got.winback_offer.count, got.welcome_note.count, got.reach_hello.count], [96, 6, 1]);
    assert.equal(
      Date.parse(got.winback_offer.last_at),
      w.A.T0 + 33 * DAY,
      "run 33's send, after the Inbox's on day 30",
    );
    assert.equal(Date.parse(got.welcome_note.last_at), w.A.T0 + 2 * DAY + 12 * HOUR + MIN);
    assert.equal(Date.parse(got.reach_hello.last_at), w.A.T0 + 5 * HOUR);
  },
);

test(
  "the shop, past the fold's caps: 1,050 runs on one playbook and eleven runs of 2,000 people, every run and every person counted",
  { skip },
  async () => {
    const w = await world();
    const got = ok(await db.rpc("playbook_totals", { p_tenant_id: w.B.tenant, p_history: 10 }), "playbook_totals");
    assert.deepEqual([got[w.B.big].runs, got[w.B.big].sent, got[w.B.big].history.length], [1050, 1050, 10]);
    assert.deepEqual([got[w.B.wide].runs, got[w.B.wide].sent], [11, 22000]);
  },
);

test(
  "the studio: a thread two people on one run share is answered from the run's first send there",
  { skip },
  async () => {
    const w = await world();
    const got = ok(await db.rpc("playbook_totals", { p_tenant_id: w.C.tenant, p_history: 10 }), "playbook_totals");
    const t = got[w.C.pb];
    assert.deepEqual([t.runs, t.sent, t.delivered, t.replied], [1, 2, 2, 1]);
  },
);

test(
  "the floor: an empty workspace answers {}, and a member of another workspace reads {} of the salon's, where its own member reads what the service role reads",
  { skip },
  async () => {
    const w = await world();
    assert.deepEqual(ok(await db.rpc("playbook_totals", { p_tenant_id: w.E })), {});
    assert.deepEqual(ok(await db.rpc("template_sends", { p_tenant_id: w.E })), {});
    assert.deepEqual(ok(await db.rpc("run_counts", { p_tenant_id: w.E, p_run_ids: [] })), {});
    const stranger = await member(w.E, "owner");
    const ids = w.A.runs.map((r) => r.id);
    assert.deepEqual(
      ok(await stranger.rpc("playbook_totals", { p_tenant_id: w.A.tenant })),
      {},
      "row security is the floor",
    );
    assert.deepEqual(ok(await stranger.rpc("run_counts", { p_tenant_id: w.A.tenant, p_run_ids: ids })), {});
    assert.deepEqual(ok(await stranger.rpc("template_sends", { p_tenant_id: w.A.tenant })), {});
    const own = await member(w.A.tenant, "viewer");
    assert.deepEqual(
      ok(await own.rpc("playbook_totals", { p_tenant_id: w.A.tenant })),
      ok(await db.rpc("playbook_totals", { p_tenant_id: w.A.tenant })),
      "a member reads its own workspace whole, p_history the card's ten by default",
    );
    assert.deepEqual(
      ok(await own.rpc("template_sends", { p_tenant_id: w.A.tenant })),
      ok(await db.rpc("template_sends", { p_tenant_id: w.A.tenant })),
    );
  },
);

test(
  "the window is said once in SQL, contracts' 72 hours, and campaign_series reads it: Reports counts the salon's replies by it",
  { skip },
  async () => {
    const w = await world();
    const [{ ms }] = query("select (extract(epoch from public.campaign_reply_window()) * 1000)::bigint as ms");
    assert.equal(Number(ms), REPLY_WINDOW_MS);
    const [{ reads, literal }] = query(
      `select p.prosrc ~ 'public\\.campaign_reply_window\\(\\)' as reads, p.prosrc ~ '72 hours' as literal
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'campaign_series'`,
    );
    assert.deepEqual(
      [reads, literal],
      [true, false],
      "campaign_series reads the window, and writes no 72 hours of its own",
    );
    const series = ok(await db.rpc("campaign_series", { p_tenant_id: w.A.tenant, p_days: 90 }), "campaign_series");
    const src = series.sources.find((s) => s.id === w.A.winback);
    // Per person sent (a failed one is not): runs 0, 4 (the edge), 6, 7 and the person on runs 20 and 24.
    assert.deepEqual([src.sent, src.replied], [93, 6]);
  },
);

test(
  "at scale: 3,600 runs of 25 people answer a signed-in member inside a member's 8 seconds, every run, person and reply counted",
  { skip },
  async (t) => {
    const tenant = busyWorkspace();
    const [{ setconfig }] = query(
      `select s.setconfig from pg_db_role_setting s join pg_roles r on r.oid = s.setrole
        where r.rolname = 'authenticated' and s.setdatabase = 0`,
    );
    assert.ok(
      setconfig.includes("statement_timeout=8s"),
      "a member's statement stops at 8 seconds, as production's do",
    );
    const own = await member(tenant, "viewer");
    const started = performance.now();
    const got = ok(await own.rpc("playbook_totals", { p_tenant_id: tenant }), "playbook_totals at scale, as a member");
    t.diagnostic(`playbook_totals over 3,600 runs of 25, as a member: ${Math.round(performance.now() - started)} ms`);
    assert.equal(Object.keys(got).length, SCALE.moments);
    for (const totals of Object.values(got)) {
      assert.deepEqual(
        [totals.runs, totals.sent, totals.delivered, totals.held, totals.replied, totals.history.length],
        [600, 14_400, 13_800, 600, 120, 10],
      );
    }
    // The same, counted straight off the rows.
    const [direct] = query(
      `select count(distinct r.broadcast_id) as runs,
              count(*) filter (where r.state = 'sent') as sent,
              count(*) filter (where m.status in ('delivered', 'read')) as delivered,
              count(*) filter (where r.state in ('skipped', 'failed')) as held,
              (select count(*) from public.messages i where i.tenant_id = '${tenant}' and i.direction = 'inbound') as replies
         from public.broadcast_recipients r left join public.messages m on m.id = r.message_id
        where r.tenant_id = '${tenant}'`,
    );
    const sum = (k) => Object.values(got).reduce((n, x) => n + x[k], 0);
    assert.deepEqual(
      [sum("runs"), sum("sent"), sum("delivered"), sum("held"), sum("replied")],
      [direct.runs, direct.sent, direct.delivered, direct.held, direct.replies].map(Number),
      "each reply answers one run's send",
    );
  },
);

test(
  "at scale, a workspace that talks: 1,800 more messages its people wrote, none a reply, and playbook_totals still answers inside half a member's 8 seconds, every count as it was",
  { skip },
  async (t) => {
    const tenant = busyWorkspace();
    // Three more of each person's own, all before the first run: 2,520 inbound in all with the 720 replies. Without
    // run_counts' fence its replied step weighed every thread a run reached against every one of them, and took 8 s here.
    query(`insert into public.messages (tenant_id, conversation_id, contact_id, channel, direction, sender, type, body,
                                        status, meta, created_at)
           select t, md5(t || ':thread:' || c)::uuid, md5(t || ':person:' || c)::uuid, 'whatsapp', 'inbound', 'customer',
                  'text', 'Is Saturday free?', 'received', '{}'::jsonb,
                  date_trunc('day', now()) - interval '701 days' - (c * 3 + n) * interval '1 minute'
             from (select '${tenant}'::uuid as t) w, generate_series(0, 599) c, generate_series(1, 3) n`);
    // Counted as production counts them, on its tables' statistics.
    query("analyze public.messages, public.broadcasts, public.broadcast_recipients, public.playbooks");
    const [{ inbound }] = query(
      `select count(*) as inbound from public.messages where tenant_id = '${tenant}' and direction = 'inbound'`,
    );
    assert.equal(Number(inbound), 2520);
    // As GET playbooks asks it: a signed-in member, under row security, whose statement stops at 8 seconds.
    const own = await member(tenant, "viewer");
    const started = performance.now();
    const got = ok(await own.rpc("playbook_totals", { p_tenant_id: tenant }), "playbook_totals, as a member");
    const ms = Math.round(performance.now() - started);
    t.diagnostic(`playbook_totals over 3,600 runs of 25 and 2,520 inbound messages, as a member: ${ms} ms`);
    assert.ok(ms < 4000, `half a member's 8 seconds, for margin: ${ms} ms`);
    assert.equal(Object.keys(got).length, SCALE.moments);
    for (const totals of Object.values(got))
      assert.deepEqual(
        [totals.runs, totals.sent, totals.delivered, totals.held, totals.replied, totals.history.length],
        [600, 14_400, 13_800, 600, 120, 10],
        "not one of them a reply",
      );
  },
);

/* ---- the dashboard's own reads on the stack: the database's count, else the fold, for one release ---- */

test(
  "GET playbooks' rows are the same bytes counted by the database as by the fold where the fold counts right -- the salon, as the service role and as its own member -- and so are Sent's",
  { skip },
  async () => {
    const w = await world();
    const fold = await P.listPlaybooks({ supabase: before00362(db, ["playbook_totals", "run_counts"]) }, w.A.tenant);
    const sql = await P.listPlaybooks({ supabase: db }, w.A.tenant);
    assert.equal(JSON.stringify(sql), JSON.stringify(fold), "byte for byte");
    const own = await member(w.A.tenant, "operator");
    assert.equal(
      JSON.stringify(await P.listPlaybooks({ supabase: own }, w.A.tenant)),
      JSON.stringify(fold),
      "and for a member, under row security",
    );
    assert.deepEqual(
      sql.find((p) => p.id === w.A.lapsed).totals,
      { runs: 0, sent: 0, delivered: 0, replied: 0, held: 0, lastRun: null, waiting: null, history: [] },
      "a playbook that never ran",
    );
    assert.equal(
      sql.some((p) => p.id === w.A.chain),
      false,
      "a reach-out is its own sheet's",
    );
    const t = sql.find((p) => p.id === w.A.winback).totals;
    assert.deepEqual([t.runs, t.sent, t.delivered, t.replied, t.held], [40, 93, 63, 7, 34], "the hand count");
    const listed = await Bc.listBroadcasts({ supabase: db }, w.A.tenant);
    const folded = await Bc.listBroadcasts({ supabase: before00362(db, ["run_counts"]) }, w.A.tenant);
    assert.equal(JSON.stringify(listed), JSON.stringify(folded), "Sent's fifty, counted by run_counts and by the fold");
  },
);

test(
  "past its caps the fold reads short, which is why seeded truth is the oracle: the shop's newest thousand runs, and a chunk of two hundred cut at 20,000 people",
  { skip },
  async () => {
    const w = await world();
    const fold = await P.listPlaybooks({ supabase: before00362(db, ["playbook_totals", "run_counts"]) }, w.B.tenant);
    const sql = await P.listPlaybooks({ supabase: db }, w.B.tenant);
    const of = (rows, id) => rows.find((p) => p.id === id).totals;
    assert.deepEqual(
      [of(sql, w.B.big).runs, of(sql, w.B.big).sent, of(sql, w.B.wide).runs, of(sql, w.B.wide).sent],
      [1050, 1050, 11, 22000],
      "the database: every run and every person",
    );
    assert.equal(of(fold, w.B.big).runs, 989, "the fold: the newest thousand runs, eleven of them Wide's");
    assert.ok(
      of(fold, w.B.wide).sent <= 20000,
      `the fold: the first chunk cut at 20,000 people (${of(fold, w.B.wide).sent})`,
    );
    assert.deepEqual(
      of(sql, w.B.big).history.map((h) => h.id),
      of(fold, w.B.big).history.map((h) => h.id),
      "the newest ten are the same runs: only the totals read short",
    );
  },
);

test(
  "the studio: the fold timed a thread two people share from its later send and missed the reply the database counts",
  { skip },
  async () => {
    const w = await world();
    const fold = await P.listPlaybooks({ supabase: before00362(db, ["playbook_totals", "run_counts"]) }, w.C.tenant);
    const sql = await P.listPlaybooks({ supabase: db }, w.C.tenant);
    assert.deepEqual([sql[0].totals.replied, fold[0].totals.replied], [1, 0]);
  },
);

test(
  "the fake database's twins (_fake-db.mjs) answer what the SQL answers, over the salon's own rows",
  { skip },
  async () => {
    const w = await world();
    const rows = async (table) => ok(await db.from(table).select("*").eq("tenant_id", w.A.tenant), table);
    const tables = {
      playbooks: await rows("playbooks"),
      broadcasts: await rows("broadcasts"),
      broadcast_recipients: await rows("broadcast_recipients"),
      messages: await rows("messages"),
    };
    const fake = fakeDb(tables);
    const ids = tables.broadcasts.map((b) => b.id);
    for (const [name, args] of [
      ["playbook_totals", { p_tenant_id: w.A.tenant, p_history: 10 }],
      ["run_counts", { p_tenant_id: w.A.tenant, p_run_ids: ids }],
      ["template_sends", { p_tenant_id: w.A.tenant }],
    ]) {
      const real = ok(await db.rpc(name, args), name);
      const twin = await fake.rpc(name, args);
      assert.equal(twin.error, null, `${name}: ${twin.error?.message}`);
      assert.deepEqual(twin.data, real, `${name}: the twin says what SQL says`);
    }
  },
);
