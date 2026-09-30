/**
 * A row that names another row names one of its own workspace's (00284), on a real Postgres.
 *
 * A foreign key asks that the row it names exist and ignores whose it is, so a child written with the service role
 * (the edge, the jobs: no row policy stands in front of them) could name another workspace's parent as long as the id
 * was right. 00270 closed that for a member's session, in the insert policies. Each single-column key between two
 * workspace tables is now a key on (tenant_id, x_id) with the old one's delete rule: a service-role insert or update
 * that names another workspace's conversation, person, list or run is refused with a foreign-key violation, and one
 * that names its own goes through, and the reads that embed a parent still resolve. The catalog is walked too, so the
 * next key between two workspace tables that names its parent by id alone fails here.
 * Runs against the database `supabase start` builds, never production.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CLI = process.env.SUPABASE_CLI || "supabase";
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine"
      : false;

let admin;
const made = { tenants: [] };
const RUN = Date.now().toString(36);
const ok = (r, what) => {
  assert.equal(r.error, null, `${what}: ${r.error?.message}`);
  return r.data;
};
/** The foreign key's refusal: another workspace's row named, whichever key the old one or its twin. */
const notMine = (r, why) => {
  assert.ok(r.error, `REGRESSION: written: ${why}`);
  assert.equal(r.error.code, "23503", `${why}: ${r.error.message}`);
  assert.match(r.error.message, /same_workspace/, `refused by the workspace's twin, not the old key: ${why}`);
};

/** One statement through the CLI, as the privileges suite does: the catalog is not reachable through PostgREST. */
function query(sql) {
  const r = spawnSync(CLI, ["db", "query", "--local", "--output-format", "json", sql], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (r.error) throw new Error(`could not run ${CLI} (${r.error.message}); set SUPABASE_CLI to the supabase binary`);
  if (r.status !== 0) throw new Error(`supabase db query exited ${r.status}: ${(r.stdout + r.stderr).slice(-600)}`);
  const out = r.stdout;
  const start = out.search(/[[{]/);
  if (start < 0) return [];
  const end = out.lastIndexOf(out[start] === "{" ? "}" : "]");
  const parsed = JSON.parse(out.slice(start, end + 1));
  return Array.isArray(parsed) ? parsed : (parsed.rows ?? []);
}

before(async () => {
  if (skip) return;
  admin = createClient(URL_, KEY, { auth: { persistSession: false } });
});
after(async () => {
  if (skip) return;
  for (const id of made.tenants) await admin.from("tenants").delete().eq("id", id);
});

async function workspace(tag) {
  const t = ok(
    await admin
      .from("tenants")
      .insert({ name: `Same workspace ${tag}`, slug: `same-ws-${tag}-${RUN}` })
      .select("id")
      .single(),
    "tenant",
  ).id;
  made.tenants.push(t);
  const n = String(made.tenants.length).padStart(2, "0");
  const contact = ok(
    await admin
      .from("contacts")
      .insert({ tenant_id: t, phone_e164: `+155555502${n}` })
      .select("id")
      .single(),
    "contact",
  ).id;
  const conversation = ok(
    await admin.from("conversations").insert({ tenant_id: t, contact_id: contact }).select("id").single(),
    "conversation",
  ).id;
  const list = ok(
    await admin.from("segments").insert({ tenant_id: t, name: "Regulars" }).select("id").single(),
    "list",
  ).id;
  const template = ok(
    await admin
      .from("templates")
      .insert({ tenant_id: t, channel: "whatsapp", name: "visit_reminder", language: "en_US", meta_status: "approved" })
      .select("id")
      .single(),
    "template",
  ).id;
  const run = ok(
    await admin
      .from("broadcasts")
      .insert({
        tenant_id: t,
        name: "A run",
        template_id: template,
        template_name: "visit_reminder",
        template_language: "en_US",
        scheduled_for: new Date().toISOString(),
      })
      .select("id")
      .single(),
    "run",
  ).id;
  const deal = ok(
    await admin.from("deals").insert({ tenant_id: t, contact_id: contact, stage: "proposed" }).select("id").single(),
    "deal",
  ).id;
  return { t, contact, conversation, list, run, deal };
}

let a;
let b;

before(async () => {
  if (skip) return;
  a = await workspace("a");
  b = await workspace("b");
});

test(
  "a message, a call and an escalation name their own workspace's thread and person, and are refused another's",
  { skip },
  async () => {
    const message = (over) =>
      admin.from("messages").insert({
        tenant_id: a.t,
        conversation_id: a.conversation,
        contact_id: a.contact,
        channel: "whatsapp",
        direction: "inbound",
        sender: "customer",
        type: "text",
        body: "Hi",
        ...over,
      });
    ok(await message({}), "a message on its own thread and person");
    notMine(await message({ conversation_id: b.conversation }), "a message on another workspace's thread");
    notMine(await message({ contact_id: b.contact }), "a message naming another workspace's person");

    const call = (over) =>
      admin
        .from("calls")
        .insert({ tenant_id: a.t, retell_call_id: `call_${RUN}${Math.random().toString(36).slice(2, 8)}`, ...over });
    ok(await call({ contact_id: a.contact, conversation_id: a.conversation }), "a call on its own thread and person");
    notMine(await call({ conversation_id: b.conversation }), "a call on another workspace's thread");
    notMine(await call({ contact_id: b.contact }), "a call from another workspace's person");

    const escalation = (over) => admin.from("escalations").insert({ tenant_id: a.t, reason: "manual", ...over });
    ok(await escalation({ conversation_id: a.conversation }), "an escalation on its own thread");
    notMine(await escalation({ conversation_id: b.conversation }), "an escalation taking a slot on another's thread");
  },
);

test("a person's note, deal and thread name their own workspace's person, list, run and deal", { skip }, async () => {
  const note = (over) =>
    admin.from("person_notes").insert({ tenant_id: a.t, contact_id: a.contact, body: "Prefers mornings", ...over });
  ok(await note({}), "a note on its own person");
  ok(await note({ deal_id: a.deal }), "a note on its own deal");
  notMine(await note({ contact_id: b.contact }), "a note on another workspace's person");
  notMine(await note({ deal_id: b.deal }), "a note on another workspace's deal");

  notMine(
    await admin.from("deals").insert({ tenant_id: a.t, contact_id: b.contact, stage: "proposed" }),
    "a deal for another workspace's person",
  );
  notMine(
    await admin.from("conversations").insert({ tenant_id: a.t, contact_id: b.contact }),
    "a thread with another workspace's person",
  );
  notMine(
    await admin.from("segment_members").insert({ segment_id: b.list, contact_id: a.contact, tenant_id: a.t }),
    "a member added to another workspace's list",
  );
  notMine(
    await admin.from("segment_members").insert({ segment_id: a.list, contact_id: b.contact, tenant_id: a.t }),
    "another workspace's person added to a list",
  );
  ok(
    await admin.from("segment_members").insert({ segment_id: a.list, contact_id: a.contact, tenant_id: a.t }),
    "its own",
  );
  notMine(
    await admin.from("broadcast_recipients").insert({ broadcast_id: b.run, contact_id: a.contact, tenant_id: a.t }),
    "a recipient on another workspace's run",
  );
  notMine(
    await admin.from("broadcast_recipients").insert({ broadcast_id: a.run, contact_id: b.contact, tenant_id: a.t }),
    "another workspace's person on a run",
  );
});

test("an update that points a row at another workspace's parent is refused as an insert is", { skip }, async () => {
  notMine(
    await admin.from("deals").update({ contact_id: b.contact }).eq("id", a.deal),
    "moving a deal onto another workspace's person",
  );
  ok(await admin.from("deals").update({ stage: "won" }).eq("id", a.deal), "a deal's own change is not held up");
  const c = ok(
    await admin.from("contacts").insert({ tenant_id: a.t, phone_e164: "+15555550299" }).select("id").single(),
    "another person",
  );
  notMine(
    await admin.from("contacts").update({ merged_into_contact_id: b.contact }).eq("id", c.id),
    "merging a person into another workspace's",
  );
  ok(await admin.from("contacts").update({ merged_into_contact_id: a.contact }).eq("id", c.id), "into its own");
});

test(
  "a read that embeds the parent still resolves: one relationship between a pair of tables, not two",
  { skip },
  async () => {
    // Two relationships between one pair of tables make an embedded select ambiguous to PostgREST (PGRST201), so a key
    // that sat beside its twin would have broken these reads; the key REPLACES the old one.
    const thread = ok(
      await admin.from("conversations").select("id, contacts (phone_e164)").eq("id", a.conversation).single(),
      "a conversation with its person",
    );
    assert.equal(thread.contacts.phone_e164, "+15555550201");
    ok(
      await admin
        .from("broadcast_recipients")
        .select("broadcast_id, messages (conversation_id, status)")
        .eq("broadcast_id", a.run),
      "a run's people with their messages",
    );
    ok(
      await admin.from("deals").select("id, contacts (phone_e164), leads (id)").eq("id", a.deal),
      "a deal with its person and lead",
    );
  },
);

test(
  "no key between two workspace tables names a parent by its id alone: each names the workspace too",
  { skip },
  () => {
    const rows = query(`
    select cc.relname::text || '.' || ca.attname::text || ' -> ' || pc.relname::text as fk
      from pg_constraint con
      join pg_class cc on cc.oid = con.conrelid
      join pg_class pc on pc.oid = con.confrelid
      join pg_namespace n on n.oid = cc.relnamespace
      join pg_attribute ca on ca.attrelid = cc.oid and ca.attnum = con.conkey[1]
     where con.contype = 'f' and n.nspname = 'public' and cardinality(con.conkey) = 1
       and ca.attname <> 'tenant_id'
       and exists (select 1 from pg_attribute x where x.attrelid = cc.oid and x.attname = 'tenant_id' and not x.attisdropped)
       and exists (select 1 from pg_attribute x where x.attrelid = pc.oid and x.attname = 'tenant_id' and not x.attisdropped)
     order by 1`);
    assert.deepEqual(
      rows.map((r) => r.fk),
      [],
      "make it (tenant_id, x_id) references parent (tenant_id, id) as 00284 does: a unique (tenant_id, id) on the parent, a not valid key on the child replacing this one",
    );
  },
);
