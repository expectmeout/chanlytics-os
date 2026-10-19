/**
 * 00311 on a real Postgres: a deal's events keep its amount and, for a pass, why it was lost (the Reports lenses spec,
 * K6), whoever writes the event. The writers are the real ones: deal_record (a new deal and each move) and
 * set_person_proposal (the Proposal out it opens), neither restated. An event says two keys at most, `amount_cents` and
 * `lost_reason`, each only when the deal has the thing: absent is never null, and never 0, while a stored 0 is an amount
 * (as the Deals page reads it). Never a note, a link, a `per` or a `currency`. The one trigger enters a deal.* event
 * about a deal and no other, and never together with 00310's, whose events are lead.stage. A lookup that cannot be made
 * costs the event nothing (a transaction on this machine's database that never commits, through the CLI, as
 * escalation-outcome.db.test.mjs does). Runs against the database `supabase start` builds on this machine, never
 * production.
 *
 * Runs the way deals.db.test.mjs does: its own workspaces, users and rows, made with the service key and removed after.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite makes users, workspaces, people and deals"
      : !ANON
        ? "no SUPABASE_ANON_KEY in env: the sessions this suite signs in with need it"
        : false;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const CLI = process.env.SUPABASE_CLI || "supabase";
// The database the CLI is pointed at: the one the environment names when it is on this machine, else the stack
// `supabase start` runs here.
const DB_URL = process.env.SUPABASE_DB_URL;
const CLI_TARGET =
  DB_URL && /^postgres(ql)?:\/\/[^@]*@(127\.0\.0\.1|localhost)[:/]/.test(DB_URL)
    ? ["--db-url", `${DB_URL}${DB_URL.includes("?") ? "&" : "?"}sslmode=disable`]
    : ["--local"];

/** The world: one workspace with an owner and an operator in it, and another workspace. */
const w = {};
const users = [];
const ok = (res) => {
  assert.equal(res.error, null, res.error?.message);
  return res.data;
};

/**
 * A transaction on this machine's database that never commits (as sweep-registry.db.test.mjs runs one): `body` runs in
 * a DO block that ends by raising what it `seen`, so everything it did, the trigger it changed included, goes with it.
 */
function rolledBack(body) {
  const sql = `do $$ declare seen jsonb := '{}'; begin ${body} raise exception 'seen %', encode(convert_to(seen::text, 'UTF8'), 'hex'); end $$`;
  const r = spawnSync(CLI, ["db", "query", ...CLI_TARGET, sql], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (r.error) throw new Error(`could not run ${CLI} (${r.error.message}); set SUPABASE_CLI to the supabase binary`);
  const said = [r.stdout, r.stderr]
    .map((x) => (x ?? "").trim())
    .filter(Boolean)
    .join("\n");
  const seen = /seen (7b[0-9a-f]*)/.exec(said);
  if (/not_this_database/.test(said))
    throw new Error(
      "the CLI reached a database that does not hold this suite's rows: point SUPABASE_DB_URL at the stack",
    );
  if (!seen) throw new Error(`the block did not get to say what it saw: ${said.slice(-800)}`);
  return JSON.parse(Buffer.from(seen[1], "hex").toString("utf8"));
}

/** A real session for a fresh user with this role in this workspace. */
async function member(role, tenant) {
  const email = `deal-events-${role}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
  const password = `pw-${Math.random().toString(36).slice(2)}-Aa1!`;
  const made = await w.admin.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(made.error, null, made.error?.message);
  users.push(made.data.user.id);
  ok(await w.admin.from("memberships").insert({ tenant_id: tenant, user_id: made.data.user.id, role }));
  const client = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const s = await client.auth.signInWithPassword({ email, password });
  assert.equal(s.error, null, s.error?.message);
  return client;
}

before(async () => {
  if (skip) return;
  w.admin = createClient(URL_, KEY, { auth: { persistSession: false } });
  w.seq = 0;
  w.tenant = ok(
    await w.admin
      .from("tenants")
      .insert({ slug: `harbor-deal-events-${Date.now()}`, name: "Harbor Deal Events" })
      .select("id")
      .single(),
  ).id;
  w.other = ok(
    await w.admin
      .from("tenants")
      .insert({ slug: `acme-deal-events-${Date.now()}`, name: "Acme Deal Events" })
      .select("id")
      .single(),
  ).id;
  w.owner = await member("owner", w.tenant);
  w.operator = await member("operator", w.tenant);
});

after(async () => {
  if (skip || !w.admin) return;
  if (w.tenant) {
    await w.admin.from("deals").delete().eq("tenant_id", w.tenant);
    await w.admin.from("events").delete().eq("tenant_id", w.tenant);
    await w.admin.from("contacts").delete().eq("tenant_id", w.tenant);
    await w.admin.from("tenants").delete().eq("id", w.tenant);
  }
  if (w.other) await w.admin.from("tenants").delete().eq("id", w.other);
  for (const id of users) await w.admin.auth.admin.deleteUser(id).catch(() => {});
});

/** What a deal's writers always say: the six keys of 00156 and 00160. */
const SIX = ["by", "contact_id", "deal_id", "from", "service", "stage"];
const record = (client, args) =>
  client.rpc("deal_record", args).then((r) => (r.error ? { error: r.error.message } : r.data));
const person = async () =>
  ok(
    await w.admin
      .from("contacts")
      .insert({ tenant_id: w.tenant, phone_e164: `+151255501${String(++w.seq).padStart(2, "0")}` })
      .select("id")
      .single(),
  ).id;
const eventsOf = async (dealId) =>
  ok(
    await w.admin
      .from("events")
      .select("kind, data")
      .eq("tenant_id", w.tenant)
      .eq("subject_id", dealId)
      .order("created_at"),
  );
const extras = (e) =>
  Object.keys(e.data)
    .filter((k) => !SIX.includes(k))
    .sort();

test(
  "every move of a deal says the amount it held and, for a pass, why: and only that, never a note, a link, a per or a currency",
  { skip },
  async () => {
    const c = await person();
    const made = await record(w.operator, {
      p_contact_id: c,
      p_stage: "proposed",
      p_service: "Retainer",
      p_amount_cents: 150000,
      p_per: "month",
      p_note: "Sent by email",
      p_proposal_url: "https://docs.example.com/p/k6",
    });
    const id = made.deal.id;
    let version = 1;
    for (const [stage, extra] of [
      ["won", {}],
      ["lost", { p_lost_reason: "price" }],
      ["proposed", {}],
      ["ended", {}],
    ])
      version = (
        await record(w.operator, { p_contact_id: c, p_stage: stage, p_deal_id: id, p_version: version, ...extra })
      ).deal.version;
    const events = await eventsOf(id);
    assert.deepEqual(
      events.map((e) => [e.kind, e.data.amount_cents ?? null, e.data.lost_reason ?? null]),
      [
        ["deal.proposed", 150000, null],
        ["deal.won", 150000, null],
        ["deal.lost", 150000, "price"],
        ["deal.proposed", 150000, null],
        ["deal.ended", 150000, null],
      ],
      "a reason only on the pass: proposing again clears it, and so does ending",
    );
    assert.deepEqual(
      events.map(extras),
      [["amount_cents"], ["amount_cents"], ["amount_cents", "lost_reason"], ["amount_cents"], ["amount_cents"]],
      "two keys at most: the deal's per and currency, its note and its link are read from deals when wanted",
    );
    for (const e of events)
      assert.deepEqual(
        Object.keys(e.data)
          .filter((k) => SIX.includes(k))
          .sort(),
        SIX,
      );
    assert.ok(!/Sent by email|example\.com/.test(JSON.stringify(events)), "still no words and no link");
  },
);

test(
  "a deal with no amount, or passed with no reason, says neither: absent, never null or zero",
  { skip },
  async () => {
    const c = await person();
    const made = await record(w.operator, { p_contact_id: c, p_stage: "proposed", p_service: "Quote" });
    await record(w.operator, { p_contact_id: c, p_stage: "lost", p_deal_id: made.deal.id, p_version: 1 });
    const events = await eventsOf(made.deal.id);
    assert.equal(events.length, 2);
    for (const e of events) assert.deepEqual(extras(e), [], `${e.kind}: no amount, no reason, no key at all`);
  },
);

test(
  "a deal that holds an amount of 0 says 0, as the Deals page reads it; one whose amount was cleared says no amount",
  { skip },
  async () => {
    const c = await person();
    const made = await record(w.operator, {
      p_contact_id: c,
      p_stage: "proposed",
      p_service: "Pilot",
      p_amount_cents: 0,
    });
    assert.equal(made.deal.amount_cents, 0, JSON.stringify(made));
    const won = await record(w.operator, {
      p_contact_id: c,
      p_stage: "won",
      p_deal_id: made.deal.id,
      p_version: 1,
      p_clear: ["amount"],
    });
    assert.equal(won.deal.amount_cents, null);
    const events = await eventsOf(made.deal.id);
    assert.deepEqual(
      events.map((e) => [e.kind, "amount_cents" in e.data, e.data.amount_cents]),
      [
        ["deal.proposed", true, 0],
        ["deal.won", false, undefined],
      ],
      "a stored 0 is an amount (a real $0), only no amount is no key",
    );
  },
);

test("a Proposal out opened by a link carries no amount: the deal has none", { skip }, async () => {
  const c = await person();
  ok(await w.owner.rpc("set_person_proposal", { p_contact_id: c, p_url: "https://docs.example.com/p/k6-link" }));
  const deal = ok(await w.admin.from("deals").select("id").eq("contact_id", c).single());
  const events = await eventsOf(deal.id);
  assert.deepEqual(
    events.map((e) => [e.kind, extras(e)]),
    [["deal.proposed", []]],
  );
});

test(
  "an event that already says an amount keeps it; one for a deal that is not there, or whose data is not an object, lands as written",
  { skip },
  async () => {
    const c = await person();
    const made = await record(w.operator, {
      p_contact_id: c,
      p_stage: "proposed",
      p_service: "Own",
      p_amount_cents: 5000,
    });
    const write = async (subject, data) =>
      ok(
        await w.admin
          .from("events")
          .insert({
            tenant_id: w.tenant,
            kind: "deal.won",
            category: "deal",
            subject_type: "deal",
            subject_id: subject,
            data,
          })
          .select("data")
          .single(),
      ).data;
    assert.deepEqual(await write(made.deal.id, { stage: "won", amount_cents: 1 }), { stage: "won", amount_cents: 1 });
    assert.deepEqual(await write("00000000-0000-4000-8000-000000000000", { stage: "won" }), { stage: "won" });
    assert.deepEqual(await write(made.deal.id, ["a list is not an event's data"]), ["a list is not an event's data"]);
  },
);

test(
  "only a deal.* event about a deal in its own workspace is completed, and no other event enters the function at all",
  { skip },
  async () => {
    const c = await person();
    const deal = ok(
      await w.admin
        .from("deals")
        .insert({ tenant_id: w.tenant, contact_id: c, stage: "won", amount_cents: 9000 })
        .select("id")
        .single(),
    );
    const cases = {
      control: {},
      other_kind: { kind: "contact.proposal_set" },
      other_subject: { subjectType: "contact" },
      other_workspace: { tenant: w.other },
    };
    const calls = `coalesce(pg_stat_get_xact_function_calls('public.events_complete_deal()'::regprocedure), 0)`;
    const write = (tag, { kind = "deal.won", subjectType = "deal", tenant = w.tenant }) => `
      insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
      values ('${tenant}', '${kind}', 'deal', '${subjectType}', '${deal.id}', jsonb_build_object('stage', 'won', 'tag', '${tag}'));
      seen := seen || jsonb_build_object('calls_${tag}', ${calls});`;
    const dataOf = (tag) =>
      `(select data from public.events where subject_id = '${deal.id}' and data->>'tag' = '${tag}')`;
    const seen = rolledBack(`
      if not exists (select 1 from public.deals where id = '${deal.id}') then raise exception 'not_this_database'; end if;
      set local track_functions = 'all';
      ${Object.entries(cases)
        .map(([tag, c]) => write(tag, c))
        .join("\n")}
      seen := seen || jsonb_build_object(${Object.keys(cases)
        .map((tag) => `'${tag}', ${dataOf(tag)}`)
        .join(", ")});
    `);
    assert.deepEqual(
      Object.fromEntries(Object.entries(seen).filter(([k]) => !k.startsWith("calls_"))),
      {
        control: { stage: "won", tag: "control", amount_cents: 9000 },
        other_kind: { stage: "won", tag: "other_kind" },
        other_subject: { stage: "won", tag: "other_subject" },
        other_workspace: { stage: "won", tag: "other_workspace" },
      },
      "completed: the deal's own workspace and subject, a deal.* kind; as written: everything else",
    );
    assert.deepEqual(
      [seen.calls_control, seen.calls_other_kind, seen.calls_other_subject, seen.calls_other_workspace],
      [1, 1, 1, 2],
      "the function ran for the control and for the other workspace's event (the guard turned it away), never for another kind or subject type: the WHEN costs the rest of the ledger nothing",
    );
  },
);

test(
  "a lead's stage event and a deal's event never enter each other's trigger: with one id for both, each is completed by its own alone, whichever fires first",
  { skip },
  async () => {
    const c = await person();
    const shared = randomUUID();
    const event = (kind, subject, data) => `
      insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
      values ('${w.tenant}', '${kind}', '${subject}', '${subject}', '${shared}', '${JSON.stringify(data)}'::jsonb);`;
    const dataOf = (tag) =>
      `(select data from public.events where subject_id = '${shared}' and data->>'tag' = '${tag}')`;
    const seen = rolledBack(`
      if not exists (select 1 from public.contacts where id = '${c}') then raise exception 'not_this_database'; end if;
      insert into public.deals (id, tenant_id, contact_id, stage, amount_cents) values ('${shared}', '${w.tenant}', '${c}', 'proposed', 7000);
      insert into public.leads (id, tenant_id, place_id, business_name) values ('${shared}', '${w.tenant}', 'harbor-deal-events-${shared}', 'Harbor Studio');
      update public.leads set stage = 'nurture' where id = '${shared}';
      ${event("lead.stage", "lead", { stage: "nurture", tag: "lead" })}
      ${event("deal.proposed", "deal", { stage: "proposed", tag: "deal" })}
      seen := seen || jsonb_build_object('lead', ${dataOf("lead")}, 'deal', ${dataOf("deal")});
    `);
    assert.deepEqual(seen, {
      lead: { stage: "nurture", tag: "lead", from: "ready" },
      deal: { stage: "proposed", tag: "deal", amount_cents: 7000 },
    });
  },
);

test(
  "a lookup that cannot be made costs the event nothing: it lands as written, and a working one fills it",
  { skip },
  async () => {
    const c = await person();
    const deal = ok(
      await w.admin
        .from("deals")
        .insert({ tenant_id: w.tenant, contact_id: c, stage: "lost", amount_cents: 5000, lost_reason: "timing" })
        .select("id")
        .single(),
    );
    const event = (tag) => `
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values ('${w.tenant}', 'deal.lost', 'deal', 'deal', '${deal.id}', jsonb_build_object('stage', 'lost', 'tag', '${tag}'));`;
    const dataOf = (tag) =>
      `(select data from public.events where subject_id = '${deal.id}' and data->>'tag' = '${tag}')`;
    const seen = rolledBack(`
    if not exists (select 1 from public.deals where id = '${deal.id}') then raise exception 'not_this_database'; end if;
    ${event("control")}
    seen := seen || jsonb_build_object('control', ${dataOf("control")});
    alter table public.deals rename column lost_reason to lost_reason_x;
    begin
      ${event("trap")}
      seen := seen || jsonb_build_object('raised', false, 'trap', ${dataOf("trap")});
    exception when others then
      seen := seen || jsonb_build_object('raised', true, 'message', sqlerrm);
    end;
  `);
    assert.deepEqual([seen.control.amount_cents, seen.control.lost_reason], [5000, "timing"]);
    assert.equal(seen.raised, false, JSON.stringify(seen));
    assert.deepEqual(
      extras({ data: seen.trap }).filter((k) => k !== "tag"),
      [],
      "the trap: a warning in the log, the event as written",
    );
  },
);
