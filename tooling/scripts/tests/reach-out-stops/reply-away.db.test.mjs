/**
 * 00226 on the database (Reach out Part 5, PR 4; G8, N1, G15): an automatic out-of-office read as away keeps its lead
 * out of the chain until the day it names, and a person's reply records how it left.
 *
 *   1. the facts say `away` for an automatic reply whose day is ahead, from the person or answering the lead, and the
 *      step's followers leave the lead out;
 *   2. once the day has passed, or the reading was undone, the lead is not away and the followers take it back, even
 *      though the door skipped its send on this step `outreach_away`; any other skip still keeps it off the step;
 *   3. a person's own "away" never pauses: the table keeps until_at to an automatic reply's reading;
 *   4. the re-created bodies are 00220's and 00185's but for the away;
 *   5. stamp_email_left_as merges how a reply left into meta.email, and writes nothing else.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite makes workspaces, people and leads"
      : false;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
/** A body with LF line endings: a checkout on Windows writes CRLF, the migration is applied as written, and pg_proc keeps what it was given. */
const lf = (text) => text.replaceAll("\r\n", "\n");
const migration = (n) => {
  const dir = path.join(ROOT, "supabase/migrations");
  return lf(
    fs.readFileSync(
      path.join(
        dir,
        fs.readdirSync(dir).find((f) => f.startsWith(`${n}_`)),
      ),
      "utf8",
    ),
  );
};
const CLI = process.env.SUPABASE_CLI || "supabase";
/** One SQL read of the local stack, for what PostgREST does not serve (pg_proc). */
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
const liveBody = (name) =>
  query(
    `select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = '${name}'`,
  )[0]?.prosrc?.replaceAll("\r\n", "\n");
const bodyIn = (src, header) => {
  const at = src.indexOf(header);
  assert.ok(at >= 0, `no ${header}`);
  const open = src.indexOf("as $$", at) + "as $$".length;
  return src.slice(open, src.indexOf("$$", open));
};

const DAY = 86_400_000;
const stamp = Date.now().toString(36);
const iso = (ms) => new Date(ms).toISOString();
let db;
let A;
let template;
let n = 0;
let days = 0;
const ok = (res) => {
  assert.equal(res.error, null, res.error?.message);
  return res.data;
};
const one = async (q) => ok(await q.select("id").single()).id;

/** A reach-out playbook over a search of its own (a search has one chain, 00197). */
async function playbook() {
  const search = await one(
    db
      .from("lead_searches")
      .insert({ tenant_id: A, via: "people", card: "movers", name: "Movers", asked: "movers", plan: {} }),
  );
  return one(
    db.from("playbooks").insert({
      tenant_id: A,
      kind: "reach_out",
      policy_class: "outreach",
      gap_minutes: 5,
      template_id: template,
      template_name: `reach_away_${stamp}`,
      template_language: "en",
      params: [],
      name: "Movers",
      trigger: "lead_first",
      lead_search_id: search,
      state: "running",
      signed_by: "Sam",
    }),
  );
}
const runOf = (pb, state) =>
  one(
    db.from("broadcasts").insert({
      tenant_id: A,
      name: `Movers · ${state}`,
      template_id: template,
      template_name: `reach_away_${stamp}`,
      template_language: "en",
      audience: { kind: "reach_out", root_id: pb, step_id: pb },
      state,
      scheduled_for: iso(Date.now()),
      playbook_id: pb,
      run_for: new Date(Date.now() - (days += 1) * DAY).toISOString().slice(0, 10),
    }),
  );

/** A business the chain's first step wrote to two days ago, and the next step (its followers are asked of it). */
async function wroteTo() {
  n += 1;
  const address = `office-${n}@away-${stamp}.example`;
  const person = await one(db.from("contacts").insert({ tenant_id: A, email: address, display_name: `Fixture ${n}` }));
  const lead = await one(
    db.from("leads").insert({
      tenant_id: A,
      place_id: `ChIJfixtureAway${stamp}${n}`,
      business_name: `Fixture Movers ${n}`,
      city: "Austin",
      region: "TX",
      email: address,
      email_state: "ok",
      stage: "nurture",
      contact_id: person,
      website_host: `away-${stamp}.example`,
    }),
  );
  const root = await playbook();
  const step = await playbook();
  const thread = await one(db.from("conversations").insert({ tenant_id: A, contact_id: person }));
  const sent = await one(
    db.from("messages").insert({
      tenant_id: A,
      conversation_id: thread,
      contact_id: person,
      channel: "email",
      direction: "outbound",
      sender: "ai",
      type: "text",
      body: "Saw your shop on the map, and had a quick question.",
      status: "sent",
      meta: { email: { message_id: `<away-${stamp}-${n}@send.example>` } },
      created_at: iso(Date.now() - 2 * DAY),
    }),
  );
  ok(
    await db.from("reach_out_sends").insert({
      id: crypto.randomUUID(),
      tenant_id: A,
      broadcast_id: await runOf(root, "sent"),
      playbook_id: root,
      root_id: root,
      lead_id: lead,
      contact_id: person,
      state: "sent",
      send_at: iso(Date.now() - 2 * DAY),
      sent_at: iso(Date.now() - 2 * DAY),
      message_id: sent,
    }),
  );
  return { address, person, lead, root, step, thread, sent };
}

/**
 * An automatic reply read as away until `until`, written from its own thread (an out-of-office is not the person
 * writing back), naming the person or only the lead.
 */
async function away(ro, { until, by = "person", undone = false }) {
  const robot = await one(
    db.from("contacts").insert({ tenant_id: A, email: `noreply-${(n += 1)}-${stamp}@example.com` }),
  );
  const thread = await one(db.from("conversations").insert({ tenant_id: A, contact_id: robot }));
  const message = await one(
    db.from("messages").insert({
      tenant_id: A,
      conversation_id: thread,
      contact_id: robot,
      channel: "email",
      direction: "inbound",
      sender: "customer",
      type: "text",
      body: "I am out of the office until Monday.",
      status: "received",
    }),
  );
  ok(
    await db.from("reach_out_replies").insert({
      message_id: message,
      tenant_id: A,
      conversation_id: thread,
      contact_id: by === "person" ? ro.person : robot,
      lead_id: ro.lead,
      lead_contact_id: ro.person,
      claim: "auto_reply",
      intent: "away",
      until_at: iso(until),
      ...(undone ? { undone_at: iso(Date.now()) } : {}),
    }),
  );
}
const facts = async (ro, lead = ro.lead) =>
  ok(
    await db.rpc("outreach_lead_facts", {
      p_tenant_id: A,
      p_contact_id: ro.person,
      p_to: ro.address,
      p_lead_id: lead,
    }),
  );
const followers = async (ro) =>
  ok(
    await db.rpc("reach_out_followers", {
      p_tenant_id: A,
      p_step_id: ro.step,
      p_parent_id: ro.root,
      p_after_days: 1,
      p_limit: 50,
    }),
  ).map((f) => f.lead_id);
async function skippedOnStep(ro, reason) {
  ok(
    await db.from("reach_out_sends").insert({
      id: crypto.randomUUID(),
      tenant_id: A,
      broadcast_id: await runOf(ro.step, "sent"),
      playbook_id: ro.step,
      root_id: ro.root,
      lead_id: ro.lead,
      contact_id: ro.person,
      state: "skipped",
      reason,
    }),
  );
}

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  A = await one(
    db.from("tenants").insert({ slug: `away-a-${stamp}`, name: "Harbor Moving Co", timezone: "America/Chicago" }),
  );
  template = await one(
    db.from("templates").insert({
      tenant_id: A,
      channel: "email",
      source: "chanlytics",
      name: `reach_away_${stamp}`,
      language: "en",
      category: "marketing",
      meta_status: "approved",
      components: [
        { type: "HEADER", format: "TEXT", text: "A quick question" },
        { type: "BODY", text: "Hi {{business}}, a quick question." },
      ],
    }),
  );
});
after(async () => {
  if (skip) return;
  await db.from("events").delete().eq("tenant_id", A);
  await db.from("tenants").delete().eq("id", A);
});

test(
  "an automatic out-of-office whose day is ahead: the facts say away, and the step leaves the lead out",
  { skip },
  async () => {
    const ro = await wroteTo();
    assert.equal((await facts(ro)).away, false, "nothing read yet");
    assert.deepEqual(await followers(ro), [ro.lead]);
    await away(ro, { until: Date.now() + 3 * DAY });
    assert.equal((await facts(ro)).away, true);
    assert.equal((await facts(ro)).wrote_back, false, "an out-of-office is not the person writing back");
    assert.deepEqual(await followers(ro), []);
  },
);

test("answering the lead from another address of the business pauses it too", { skip }, async () => {
  const ro = await wroteTo();
  await away(ro, { until: Date.now() + 3 * DAY, by: "robot" });
  assert.equal((await facts(ro)).away, true, "by the lead");
  assert.equal((await facts(ro, null)).away, false, "a send that names no lead asks only the person");
  assert.deepEqual(await followers(ro), []);
});

test(
  "after the day, or once undone, the lead is taken back, past the door's outreach_away skip and no other",
  { skip },
  async () => {
    const past = await wroteTo();
    await away(past, { until: Date.now() - 60_000 });
    await skippedOnStep(past, "outreach_away");
    assert.equal((await facts(past)).away, false);
    assert.deepEqual(await followers(past), [past.lead], "the away skip does not keep it off the step");

    const undone = await wroteTo();
    await away(undone, { until: Date.now() + 3 * DAY, undone: true });
    assert.equal((await facts(undone)).away, false);
    assert.deepEqual(await followers(undone), [undone.lead]);

    const other = await wroteTo();
    await skippedOnStep(other, "owner_skipped");
    assert.deepEqual(await followers(other), [], "any other skip is the lead being on the step");
  },
);

test("only an automatic reply's reading carries a day to wait for (N1)", { skip }, async () => {
  const ro = await wroteTo();
  const message = await one(
    db.from("messages").insert({
      tenant_id: A,
      conversation_id: ro.thread,
      contact_id: ro.person,
      channel: "email",
      direction: "inbound",
      sender: "customer",
      type: "text",
      body: "Travelling this week, back on the 12th.",
      status: "received",
    }),
  );
  const res = await db.from("reach_out_replies").insert({
    message_id: message,
    tenant_id: A,
    conversation_id: ro.thread,
    contact_id: ro.person,
    lead_id: ro.lead,
    lead_contact_id: ro.person,
    claim: "person",
    intent: "away",
    until_at: iso(Date.now() + 3 * DAY),
  });
  assert.match(res.error?.message ?? "", /reach_out_replies_away_has_until/);
});

test("the re-created bodies are 00220's and 00185's, but for the away", { skip }, async () => {
  const src = migration("00226");
  const facts226 = bodyIn(src, "create or replace function public.outreach_lead_facts(");
  const awayArm = facts226.slice(
    facts226.indexOf(",\n    -- An automatic out-of-office"),
    facts226.lastIndexOf("\n  )"),
  );
  assert.equal(
    facts226.replace(awayArm, ""),
    bodyIn(migration("00220"), "create or replace function public.outreach_lead_facts("),
  );
  const f223 = bodyIn(src, "create or replace function public.reach_out_followers(");
  const f185 = bodyIn(migration("00185"), "create or replace function public.reach_out_followers(");
  const back = f223
    .replace(/\n\s+and not \(x\.state = 'skipped' and x\.reason = 'outreach_away'\)\)/, ")")
    .replace(/\n\s+and not coalesce\(\(f\.facts->>'away'\)::boolean, false\)/, "")
    .replace(/\(select 1 from public\.reach_out_sends x\n\s+where/, "(select 1 from public.reach_out_sends x where");
  assert.equal(back, f185);
  // 00241 re-creates both whole with the stop (Reach out Part 6), and what-comes-back.db.test.mjs holds it to these.
  const now = migration("00241");
  assert.equal(liveBody("outreach_lead_facts"), bodyIn(now, "create or replace function public.outreach_lead_facts("));
  assert.equal(liveBody("reach_out_followers"), bodyIn(now, "create or replace function public.reach_out_followers("));
});

test("stamp_email_left_as merges how a reply left into meta.email, and nothing else", { skip }, async () => {
  const ro = await wroteTo();
  const reply = await one(
    db.from("messages").insert({
      tenant_id: A,
      conversation_id: ro.thread,
      contact_id: ro.person,
      channel: "email",
      direction: "outbound",
      sender: "human",
      type: "text",
      body: "Thanks, Monday works.",
      status: "sent",
      meta: {
        email: { request: { from: "a@example.com" }, message_id: "<r1@example.com>" },
        reach_out: { lead_id: ro.lead },
      },
    }),
  );
  const stamp_ = (left, why) =>
    db.rpc("stamp_email_left_as", { p_tenant_id: A, p_message_id: reply, p_left_as: left, p_why: why });
  assert.equal(ok(await stamp_("mailbox", "domain_has_no_route")), true);
  const meta = ok(await db.from("messages").select("meta").eq("id", reply).single()).meta;
  assert.deepEqual(meta, {
    email: {
      request: { from: "a@example.com" },
      message_id: "<r1@example.com>",
      left_as: "mailbox",
      left_as_why: "domain_has_no_route",
    },
    reach_out: { lead_id: ro.lead },
  });
  assert.equal(ok(await stamp_("sideways", null)), false, "only own or mailbox");
  assert.equal(
    ok(await db.rpc("stamp_email_left_as", { p_tenant_id: A, p_message_id: ro.sent, p_left_as: "own", p_why: null })),
    true,
  );
  const inbound = ok(
    await db
      .from("messages")
      .insert({
        tenant_id: A,
        conversation_id: ro.thread,
        contact_id: ro.person,
        channel: "email",
        direction: "inbound",
        sender: "customer",
        type: "text",
        body: "Hello",
        status: "received",
      })
      .select("id")
      .single(),
  ).id;
  assert.equal(
    ok(await db.rpc("stamp_email_left_as", { p_tenant_id: A, p_message_id: inbound, p_left_as: "own", p_why: null })),
    false,
    "an inbound email left nowhere",
  );
});
