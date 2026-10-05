/**
 * 00291 on a real Postgres: a lead keeps when it entered the stage it is in and the stage it left (the Reports lenses
 * spec, K5), whoever moved it, and a lead set aside as stale (archived, closed stale: by the nightly purge or by hand) is
 * told as lead.set_aside. The writers are the real ones: the member's door (lead_set_stage), the bulk door (lead_bulk),
 * the undo door (lead_undo) and purge_leads, none of which this change restates. No row is backfilled: a lead from before
 * reads null, and a move stamps it. A ledger that cannot take the event does not take the set-aside with it (a
 * transaction on this machine's database that never commits, through the CLI, as escalation-outcome.db.test.mjs does).
 * 00292's half, the stage event's `from`, is in this file too, below. Runs against the database `supabase start` builds
 * on this machine, never production.
 *
 * purge_leads has no workspace argument: each call also sets aside, and after 180 days blanks, any other workspace's
 * qualifying lead on this stack, so these cases run only on the throwaway stack, as lead-engine.db.test.mjs does. Every
 * assertion is scoped to this suite's workspace: by its own lead ids, and its events by its tenant. A lead that must stay
 * ready is never given an old found_at, and the one that is aged is aged just before its own purge, so another run's purge
 * cannot sweep it first. The database's clock is never compared with this machine's: a stamp is read against another
 * stamp the database wrote.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { DAY_MS } from "@chanlytics/contracts";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite writes leads and events"
      : false;
// The member's doors need a signed-in owner.
const skipMember = skip || (!ANON ? "no SUPABASE_ANON_KEY in env: the owner these cases sign in needs it" : false);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const CLI = process.env.SUPABASE_CLI || "supabase";
// The database the CLI is pointed at: the one the environment names when it is on this machine, else the stack
// `supabase start` runs here.
const DB_URL = process.env.SUPABASE_DB_URL;
const CLI_TARGET =
  DB_URL && /^postgres(ql)?:\/\/[^@]*@(127\.0\.0\.1|localhost)[:/]/.test(DB_URL)
    ? ["--db-url", `${DB_URL}${DB_URL.includes("?") ? "&" : "?"}sslmode=disable`]
    : ["--local"];

const stamp = Date.now();
const users = [];
let db;
let owner;
let ownerId;
let tenantId;
let otherId;
let seq = 0;
const ok = (res) => {
  assert.equal(res.error, null, res.error?.message);
  return res.data;
};
const daysAgo = (n) => new Date(Date.now() - n * DAY_MS).toISOString();

/**
 * A transaction on this machine's database that never commits (as sweep-registry.db.test.mjs runs one): `body` runs in
 * a DO block that ends by raising what it `seen`, so everything it did, the trigger it made included, goes with it.
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

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  tenantId = ok(
    await db
      .from("tenants")
      .insert({ slug: `harbor-lead-stage-${stamp}`, name: "Harbor Lead Stage" })
      .select("id")
      .single(),
  ).id;
  otherId = ok(
    await db
      .from("tenants")
      .insert({ slug: `acme-lead-stage-${stamp}`, name: "Acme Lead Stage" })
      .select("id")
      .single(),
  ).id;
  if (!ANON) return;
  const email = `lead-stage-owner-${stamp}@example.com`;
  const password = `pw-${Math.random().toString(36).slice(2)}-Aa1!`;
  const made = await db.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(made.error, null, made.error?.message);
  ownerId = made.data.user.id;
  users.push(ownerId);
  ok(await db.from("memberships").insert({ tenant_id: tenantId, user_id: ownerId, role: "owner" }));
  owner = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const signedIn = await owner.auth.signInWithPassword({ email, password });
  assert.equal(signedIn.error, null, signedIn.error?.message);
});

after(async () => {
  if (skip) return;
  for (const id of [tenantId, otherId]) {
    if (!id) continue;
    await db.from("events").delete().eq("tenant_id", id);
    await db.from("leads").delete().eq("tenant_id", id);
    await db.from("contacts").delete().eq("tenant_id", id);
    await db.from("tenants").delete().eq("id", id);
  }
  for (const id of users) await db.auth.admin.deleteUser(id).catch(() => {});
});

const lead = async (fields = {}) =>
  ok(
    await db
      .from("leads")
      .insert({ tenant_id: tenantId, place_id: `harbor-${stamp}-${++seq}`, business_name: "Harbor Studio", ...fields })
      .select("id, stage, stage_at, stage_from, found_at")
      .single(),
  );
const rowOf = async (id) =>
  ok(await db.from("leads").select("stage, closed_reason, stage_at, stage_from").eq("id", id).single());
const stampOf = async (id) => {
  const r = await rowOf(id);
  return [r.stage_at, r.stage_from];
};
const eventsOf = async (kind, id) =>
  ok(
    await db
      .from("events")
      .select("category, subject_type, data")
      .eq("tenant_id", tenantId)
      .eq("kind", kind)
      .eq("subject_id", id)
      .order("created_at"),
  );
const setStage = async (id, stage, reason) =>
  ok(await owner.rpc("lead_set_stage", { p_lead_id: id, p_stage: stage, ...(reason ? { p_reason: reason } : {}) }));

test(
  "a lead says since when it is in its stage and which stage it left, whoever moved it; a stage set to the one it has, and another column's update, say nothing",
  { skip: skipMember },
  async () => {
    const born = await lead();
    assert.equal(born.stage_at, born.found_at, "a new lead's stage_at is its birth: the one insert's now(), twice");
    assert.equal(born.stage_from, null);
    ok(await db.from("leads").update({ last_note: "called twice" }).eq("id", born.id));
    assert.deepEqual(await stampOf(born.id), [born.stage_at, null], "another column moves nothing");
    await setStage(born.id, "ready");
    assert.deepEqual(await stampOf(born.id), [born.stage_at, null], "the stage it already has is no move");

    await setStage(born.id, "nurture");
    const moved = await rowOf(born.id);
    assert.deepEqual([moved.stage, moved.stage_from], ["nurture", "ready"]);
    assert.ok(Date.parse(moved.stage_at) > Date.parse(born.stage_at), "stamped at the move");

    // The bulk door moves many leads and writes no event per lead; the stamp is on each row all the same.
    const bulked = await lead();
    ok(await owner.rpc("lead_bulk", { p_tenant_id: tenantId, p_action: "contacted", p_ids: [bulked.id] }));
    const bulkedRow = await rowOf(bulked.id);
    assert.deepEqual([bulkedRow.stage, bulkedRow.stage_from], ["nurture", "ready"]);
    assert.deepEqual(await eventsOf("lead.stage", bulked.id), [], "one event for the act, none per lead (00142)");
  },
);

test(
  "a lead from before has no stage_at: an update that moves nothing leaves it null, a move stamps it",
  { skip },
  async () => {
    const old = await lead({ stage_at: null });
    assert.equal(old.stage_at, null);
    ok(await db.from("leads").update({ last_note: "x" }).eq("id", old.id));
    assert.deepEqual(await stampOf(old.id), [null, null], "unknown stays unknown, never now");
    ok(await db.from("leads").update({ stage: "nurture" }).eq("id", old.id));
    const moved = await rowOf(old.id);
    assert.deepEqual([moved.stage_from, moved.stage_at !== null], ["ready", true]);
  },
);

test(
  "the nightly purge sets aside the lead nobody worked, once, and says so: lead.set_aside from ready, and no lead.stage line for the Activity log",
  { skip },
  async () => {
    const untouched = await lead({ found_at: daysAgo(91) });
    const worked = await lead({ found_at: daysAgo(91), contacted_at: daysAgo(5) });
    const fresh = await lead({ found_at: daysAgo(10) });
    const nurtured = await lead({ found_at: daysAgo(91), stage: "nurture", contacted_at: daysAgo(5) });
    const already = await lead({ found_at: daysAgo(91), stage: "archived", closed_reason: "stale" });
    ok(await db.rpc("purge_leads"));

    const set = await rowOf(untouched.id);
    assert.deepEqual([set.stage, set.closed_reason, set.stage_from], ["archived", "stale", "ready"]);
    assert.ok(
      Date.parse(set.stage_at) > Date.parse(untouched.stage_at),
      "stamped when it was set aside, after its birth",
    );
    assert.deepEqual(await eventsOf("lead.set_aside", untouched.id), [
      { category: "lead", subject_type: "lead", data: { stage: "archived", reason: "stale", from: "ready" } },
    ]);
    assert.deepEqual(await eventsOf("lead.stage", untouched.id), [], "nothing the owner's Activity log would show");
    for (const l of [worked, fresh, nurtured, already])
      assert.deepEqual(await eventsOf("lead.set_aside", l.id), [], "a lead the purge did not set aside says nothing");

    ok(await db.rpc("purge_leads"));
    assert.equal((await eventsOf("lead.set_aside", untouched.id)).length, 1, "a second run finds nothing to set aside");

    // Blanking at 180 days leaves the stage alone: no new stamp, no second event.
    const before = await stampOf(untouched.id);
    ok(
      await db
        .from("leads")
        .update({ found_at: daysAgo(181) })
        .eq("id", untouched.id),
    );
    ok(await db.rpc("purge_leads"));
    const blanked = ok(await db.from("leads").select("blanked_at").eq("id", untouched.id).single());
    assert.ok(blanked.blanked_at, "blanked at 180 days");
    assert.deepEqual(await stampOf(untouched.id), before);
    assert.equal((await eventsOf("lead.set_aside", untouched.id)).length, 1);
  },
);

test(
  "a lead set to stale by hand is set aside too, and one restored and swept again says so a second time",
  { skip: skipMember },
  async () => {
    const l = await lead();
    const said = {
      category: "lead",
      subject_type: "lead",
      data: { stage: "archived", reason: "stale", from: "ready" },
    };
    const byHand = await setStage(l.id, "archived", "stale");
    assert.deepEqual(await eventsOf("lead.set_aside", l.id), [said], "by hand, the same word as the purge's");

    // Restored: the move out of the set-aside says nothing, and the lead is as untouched as it was.
    ok(await owner.rpc("lead_undo", { p_op_id: byHand.op_id, p_version: byHand.version }));
    const restored = await rowOf(l.id);
    assert.deepEqual([restored.stage, restored.closed_reason, restored.stage_from], ["ready", null, "archived"]);
    assert.equal((await eventsOf("lead.set_aside", l.id)).length, 1, "leaving the set-aside is no set-aside");

    // Old only now, so that no other purge on this stack can sweep it before this one.
    ok(
      await db
        .from("leads")
        .update({ found_at: daysAgo(91) })
        .eq("id", l.id),
    );
    ok(await db.rpc("purge_leads"));
    assert.deepEqual(await eventsOf("lead.set_aside", l.id), [said, said], "set aside again is set aside again");
    await setStage(l.id, "archived", "stale");
    assert.equal((await eventsOf("lead.set_aside", l.id)).length, 2, "set to what it already is is no move into it");

    // A move that is not into stale (said no) is another word, and says nothing here.
    const no = await lead();
    await setStage(no.id, "archived", "said_no");
    assert.deepEqual(await eventsOf("lead.set_aside", no.id), []);
    // Then closed stale with its stage where it was: nothing moved, so there is no stage it left, and `from` says so (null),
    // not the stage it left earlier (that exit is its own) and not archived.
    await setStage(no.id, "archived", "stale");
    assert.deepEqual(await eventsOf("lead.set_aside", no.id), [
      { ...said, data: { stage: "archived", reason: "stale", from: null } },
    ]);
  },
);

test("a purge that sets aside many leads writes one event for each, and none twice", { skip }, async () => {
  const rows = Array.from({ length: 120 }, (_, i) => ({
    tenant_id: tenantId,
    place_id: `harbor-${stamp}-many-${i}`,
    business_name: "Harbor Studio",
    found_at: daysAgo(95),
  }));
  const many = ok(await db.from("leads").insert(rows).select("id"));
  ok(await db.rpc("purge_leads"));
  const said = ok(
    await db
      .from("events")
      .select("subject_id")
      .eq("tenant_id", tenantId)
      .eq("kind", "lead.set_aside")
      .in(
        "subject_id",
        many.map((r) => r.id),
      ),
  );
  assert.equal(said.length, 120);
  assert.equal(new Set(said.map((e) => e.subject_id)).size, 120);
});

test(
  "a ledger that cannot take the set-aside event does not take the set-aside with it: the lead is archived and no event is written",
  { skip },
  async () => {
    const a = await lead();
    const b = await lead();
    const setAside = (id) => `update public.leads set stage = 'archived', closed_reason = 'stale' where id = '${id}';`;
    const count = (id) => `(select count(*) from public.events where kind = 'lead.set_aside' and subject_id = '${id}')`;
    const seen = rolledBack(`
      if not exists (select 1 from public.leads where id = '${a.id}') then raise exception 'not_this_database'; end if;
      ${setAside(a.id)}
      seen := seen || jsonb_build_object('control', ${count(a.id)});
      create function public.__set_aside_refused() returns trigger language plpgsql as $f$
      begin raise exception 'the ledger is unavailable'; end $f$;
      create trigger __set_aside_refused before insert on public.events
        for each row when (new.kind = 'lead.set_aside' and new.tenant_id = '${tenantId}') execute function public.__set_aside_refused();
      begin
        ${setAside(b.id)}
        seen := seen || jsonb_build_object('raised', false);
      exception when others then
        seen := seen || jsonb_build_object('raised', true, 'message', sqlerrm);
      end;
      seen := seen || jsonb_build_object('stage', (select stage from public.leads where id = '${b.id}'), 'events', ${count(b.id)});
    `);
    assert.equal(seen.control, 1, "the control: a working ledger writes it");
    assert.deepEqual([seen.raised, seen.stage, seen.events], [false, "archived", 0], JSON.stringify(seen));
    assert.equal((await rowOf(b.id)).stage, "ready", "nothing the block did was kept");
  },
);

/* ---------------------------------------- 00292: the stage event says where the lead came from ---------------------------------------- */

test(
  "a stage event says which stage the lead came from, through the member's door, back and forth; a stage set to the one it has says none",
  { skip: skipMember },
  async () => {
    const l = await lead();
    await setStage(l.id, "nurture");
    await setStage(l.id, "archived", "said_no");
    await setStage(l.id, "ready");
    assert.deepEqual(
      (await eventsOf("lead.stage", l.id)).map((e) => e.data),
      [
        { stage: "nurture", reason: null, by: ownerId, from: "ready" },
        { stage: "archived", reason: "said_no", by: ownerId, from: "nurture" },
        { stage: "ready", reason: null, by: ownerId, from: "archived" },
      ],
    );
    const still = await lead();
    await setStage(still.id, "nurture");
    await setStage(still.id, "nurture");
    const [moved, again] = await eventsOf("lead.stage", still.id);
    assert.equal(moved.data.from, "ready");
    assert.equal("from" in again.data, false, "the lead did not move this time: the old from is not this event's");
  },
);

test(
  "a person's no closes each of their leads and each event says its own lead's from, not the last one's",
  { skip },
  async () => {
    const person = ok(
      await db
        .from("contacts")
        .insert({
          tenant_id: tenantId,
          phone_e164: `+1555013${8000 + ++seq}`,
          email: `dana-${stamp}-${seq}@example.com`,
        })
        .select("id")
        .single(),
    ).id;
    const ready = await lead({ contact_id: person });
    const nurture = await lead({ contact_id: person, stage: "nurture" });
    ok(
      await db.rpc("set_email_marketing", {
        p_tenant_id: tenantId,
        p_contact_id: person,
        p_state: "opted_out",
        p_source: "reply",
      }),
    );
    const closed = ok(
      await db
        .from("events")
        .select("subject_id, data")
        .eq("tenant_id", tenantId)
        .eq("kind", "lead.stage")
        .in("subject_id", [ready.id, nurture.id]),
    );
    assert.deepEqual(Object.fromEntries(closed.map((e) => [e.subject_id, e.data.from])), {
      [ready.id]: "ready",
      [nurture.id]: "nurture",
    });
    for (const e of closed) assert.deepEqual(Object.keys(e.data).sort(), ["by", "from", "reason", "source", "stage"]);
  },
);

test("the bulk door's one event names no lead and says no from", { skip: skipMember }, async () => {
  const l = await lead();
  ok(await owner.rpc("lead_bulk", { p_tenant_id: tenantId, p_action: "contacted", p_ids: [l.id] }));
  const bulk = ok(
    await db
      .from("events")
      .select("data")
      .eq("tenant_id", tenantId)
      .eq("kind", "lead.stage")
      .contains("data", { bulk: true }),
  );
  assert.ok(bulk.length >= 1 && bulk.every((e) => !("from" in e.data)));
});

test(
  "an event for a lead that was not just moved, for one that is not there, or that already says from, is left as its writer wrote it",
  { skip },
  async () => {
    const quiet = await lead();
    const write = async (subject, data) =>
      ok(
        await db
          .from("events")
          .insert({
            tenant_id: tenantId,
            kind: "lead.stage",
            category: "lead",
            subject_type: "lead",
            subject_id: subject,
            data,
          })
          .select("data")
          .single(),
      ).data;
    assert.deepEqual(await write(quiet.id, { stage: "ready", reason: null, by: null }), {
      stage: "ready",
      reason: null,
      by: null,
    });
    assert.deepEqual(await write("00000000-0000-4000-8000-000000000000", { stage: "ready" }), { stage: "ready" });
    assert.deepEqual(await write(quiet.id, { stage: "ready", from: "nurture" }), { stage: "ready", from: "nurture" });
  },
);

test(
  "another workspace's event never borrows a lead's from; and a lookup that cannot be made costs the event nothing: it lands as written",
  { skip },
  async () => {
    const l = await lead();
    const event = (tenant, tag) => `
      insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
      values ('${tenant}', 'lead.stage', 'lead', 'lead', '${l.id}', jsonb_build_object('stage', 'nurture', 'tag', '${tag}'));`;
    const dataOf = (tag) => `(select data from public.events where subject_id = '${l.id}' and data->>'tag' = '${tag}')`;
    const seen = rolledBack(`
      if not exists (select 1 from public.leads where id = '${l.id}') then raise exception 'not_this_database'; end if;
      update public.leads set stage = 'nurture' where id = '${l.id}';
      ${event(otherId, "cross")}
      ${event(tenantId, "control")}
      seen := seen || jsonb_build_object('cross', ${dataOf("cross")}, 'control', ${dataOf("control")});
      -- The lookup fails (the carrier column is gone) with the stamp trigger out of the way.
      alter table public.leads disable trigger leads_stamp_stage;
      alter table public.leads rename column stage_from to stage_from_x;
      begin
        ${event(tenantId, "trap")}
        seen := seen || jsonb_build_object('raised', false, 'trap', ${dataOf("trap")});
      exception when others then
        seen := seen || jsonb_build_object('raised', true, 'message', sqlerrm);
      end;
    `);
    assert.equal("from" in seen.cross, false, "another workspace's event gets nothing");
    assert.equal(seen.control.from, "ready", "the control: this workspace's event gets the lead's from");
    assert.equal(seen.raised, false, JSON.stringify(seen));
    assert.equal(
      "from" in seen.trap,
      false,
      "the lookup failed, a warning in the log, and the event landed as written",
    );
  },
);

test(
  "only a stage event about a lead that moved into the stage it names is completed: not another kind, not another subject type, not another stage, and not one that already says its own from",
  { skip },
  async () => {
    const l = await lead();
    const cases = {
      control: { data: { stage: "nurture" } },
      other_kind: { kind: "lead.emailed", data: { stage: "nurture" } },
      other_subject: { subjectType: "contact", data: { stage: "nurture" } },
      other_stage: { data: { stage: "archived" } },
      own_from: { data: { stage: "nurture", from: "writer" } },
    };
    const write = (tag, { kind = "lead.stage", subjectType = "lead", data }) => `
      insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
      values ('${tenantId}', '${kind}', 'lead', '${subjectType}', '${l.id}', '${JSON.stringify({ ...data, tag })}'::jsonb);`;
    const dataOf = (tag) => `(select data from public.events where subject_id = '${l.id}' and data->>'tag' = '${tag}')`;
    const seen = rolledBack(`
      if not exists (select 1 from public.leads where id = '${l.id}') then raise exception 'not_this_database'; end if;
      update public.leads set stage = 'nurture' where id = '${l.id}';
      ${Object.entries(cases)
        .map(([tag, c]) => write(tag, c))
        .join("\n")}
      seen := seen || jsonb_build_object(${Object.keys(cases)
        .map((tag) => `'${tag}', ${dataOf(tag)}`)
        .join(", ")});
    `);
    assert.deepEqual(seen, {
      control: { stage: "nurture", tag: "control", from: "ready" },
      other_kind: { stage: "nurture", tag: "other_kind" },
      other_subject: { stage: "nurture", tag: "other_subject" },
      other_stage: { stage: "archived", tag: "other_stage" },
      own_from: { stage: "nurture", tag: "own_from", from: "writer" },
    });
  },
);
