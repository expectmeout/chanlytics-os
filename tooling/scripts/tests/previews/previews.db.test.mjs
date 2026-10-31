/**
 * 00497 on the database (decision 0079): a lead's own receptionist before they sign up.
 *
 *   1. Made: a workspace marked ours makes a lead's preview, a workspace of its own (status preview, no member, its
 *      config and policies by 00017's trigger) and a building row with its token; a second ask answers the same row; a
 *      workspace not ours, a company's lead, a closed lead and an erased one are refused.
 *   2. Its clock: built is ready with thirty days, or failed with why; the first email that carries it starts them again.
 *   3. What it is asked: twenty messages and their answers, then the limit; a call's seconds; ten lines not right.
 *   4. Made theirs: the claimer owns it, active, under the business's slug; the lead is converted, its place leaves the
 *      sequence and its planned email is skipped (made_it_theirs); the first claim wins, also two at once; ten owned
 *      refuses.
 *   5. Ended: its workspace erased, its words cleared, its counts kept; a lead deleted takes its preview's workspace.
 *   6. Who reads it: the sender's members; nobody writes it but the doors.
 *   7. A call's start (every workspace's rehearsal, a preview's among them): one at a time, held by the row's unique call id.
 *
 * Local stack only: it makes workspaces, members, leads and a sequence with the service key, and removes them.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite makes users and workspaces"
      : !ANON
        ? "no SUPABASE_ANON_KEY in env: the sessions this suite signs in with need it"
        : false;

const ok = (r) => {
  assert.equal(r.error, null, r.error?.message);
  return r.data;
};
const one = async (q) => ok(await q.select("id").single()).id;

let db;
const stamp = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
const at = (who) => `${who}-${stamp}@example.com`;
const users = [];
const tenants = [];
/** Chanlytics' own (ours), and an ordinary workspace. */
let A;
let B;
/** The sender's owner, another workspace's owner, and two people who will claim. */
const as = {};
let n = 0;

async function person(role, tenant, name = role) {
  const password = `pw-${Math.random().toString(36).slice(2)}-Aa1!`;
  const made = await db.auth.admin.createUser({ email: at(name), password, email_confirm: true });
  assert.equal(made.error, null, made.error?.message);
  users.push(made.data.user.id);
  if (tenant) ok(await db.from("memberships").insert({ tenant_id: tenant, user_id: made.data.user.id, role }));
  const c = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  ok(await c.auth.signInWithPassword({ email: at(name), password }));
  return { id: made.data.user.id, c };
}

const lead = (over = {}, tenant = A) => {
  n += 1;
  return one(
    db.from("leads").insert({
      tenant_id: tenant,
      place_id: `ChIJfixturePreview${stamp}${n}`,
      business_name: `Fixture Barbers ${n}`,
      city: "Austin",
      region: "TX",
      stage: "ready",
      email: at(`l${n}`),
      email_state: "ok",
      ...over,
    }),
  );
};

const make = (leadId, over = {}) =>
  db.rpc("preview_make", {
    p_tenant_id: A,
    p_lead_id: leadId,
    p_name: "Fixture Barbers",
    p_timezone: "America/Chicago",
    p_by: null,
    ...over,
  });
const rowOf = async (id) => ok(await db.from("lead_previews").select("*").eq("id", id).single());
const tenantOf = async (id) => ok(await db.from("tenants").select("*").eq("id", id).maybeSingle());

/** A preview made and built ready, for the tests that start from one. */
async function ready(over = {}) {
  const leadId = await lead(over);
  const p = ok(await make(leadId));
  tenants.push(p.preview_tenant_id);
  assert.equal(ok(await db.rpc("preview_built", { p_id: p.id, p_ok: true })), true);
  return { ...p, leadId };
}

/** The sequence a claimed lead is planned in: a list, its reach-out and its first run. */
let W;
before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  A = await one(
    db
      .from("tenants")
      .insert({ slug: `preview-a-${stamp}`, name: "Chanlytics", timezone: "America/New_York", ours: true }),
  );
  ok(await db.rpc("provision_tenant", { p_tenant_id: A }));
  B = await one(db.from("tenants").insert({ slug: `preview-b-${stamp}`, name: "Elsewhere Co" }));
  tenants.push(A, B);
  as.owner = await person("owner", A);
  as.stranger = await person("owner", B, "stranger");
  as.first = await person(null, null, "first");
  as.second = await person(null, null, "second");
  W = {};
  W.template = await one(
    db.from("templates").insert({ tenant_id: A, channel: "email", name: "fixture_preview_1", language: "en" }),
  );
  W.F = await one(
    db
      .from("lead_searches")
      .insert({ tenant_id: A, via: "people", card: "local_businesses", name: "Barbers", asked: "", plan: {} }),
  );
});

after(async () => {
  if (skip) return;
  for (const id of tenants.filter(Boolean)) {
    await db.from("events").delete().eq("tenant_id", id);
    await db.from("tenants").delete().eq("id", id);
  }
  for (const u of users) await db.auth.admin.deleteUser(u).catch(() => {});
});

test("made: a workspace of its own with no member, its config provisioned, and a building row", { skip }, async () => {
  const leadId = await lead();
  const p = ok(await make(leadId, { p_by: as.owner.id }));
  tenants.push(p.preview_tenant_id);
  assert.equal(p.made, true);
  assert.equal(p.state, "building");
  assert.match(p.token, /^[A-Za-z0-9_-]{22}$/);
  const t = await tenantOf(p.preview_tenant_id);
  assert.equal(t.status, "preview");
  assert.equal(t.name, "Fixture Barbers");
  assert.equal(t.timezone, "America/Chicago");
  assert.match(t.slug, /^preview-[0-9a-f]{32}$/, "it holds no business's name on /b/");
  assert.equal(ok(await db.from("memberships").select("user_id").eq("tenant_id", t.id)).length, 0);
  assert.equal(ok(await db.from("tenant_config").select("tenant_id").eq("tenant_id", t.id)).length, 1);
  const row = await rowOf(p.id);
  assert.equal(row.made_by, as.owner.id);
  assert.ok(Date.parse(row.ends_at) > Date.now() + 29 * 86_400_000, "a preview never built still ends");
  const again = ok(await make(leadId));
  assert.equal(again.made, false);
  assert.equal(again.id, p.id);
  assert.equal(again.token, p.token);
  const news = ok(await db.from("events").select("kind, data").eq("tenant_id", A).eq("subject_id", leadId));
  assert.deepEqual(
    news.map((e) => e.kind),
    ["preview.made"],
  );
});

test("made only by a workspace marked ours, for a business's lead that is still open", { skip }, async () => {
  const theirs = await lead({}, B);
  const notOurs = await db.rpc("preview_make", {
    p_tenant_id: B,
    p_lead_id: theirs,
    p_name: "Fixture Barbers",
    p_timezone: "",
    p_by: null,
  });
  assert.equal(notOurs.error?.code, "42501");
  const company = await make(
    await lead({ kind: "company", place_id: null, source: "people_at_companies", source_key: `co-${stamp}` }),
  );
  assert.equal(company.error?.code, "22023");
  const closed = await make(await lead({ stage: "archived" }));
  assert.equal(closed.error?.code, "22023");
  const erased = await make(await lead({ erased_at: new Date().toISOString() }));
  assert.equal(erased.error?.code, "P0002");
  const noName = await make(await lead(), { p_name: " " });
  assert.equal(noName.error?.code, "22023");
  const unknownZone = ok(await make(await lead(), { p_timezone: "Mars/Olympus" }));
  tenants.push(unknownZone.preview_tenant_id);
  assert.equal((await tenantOf(unknownZone.preview_tenant_id)).timezone, "America/New_York");
});

test("its clock: built is thirty days, failed says why, the first email starts them again", { skip }, async () => {
  const p = await ready();
  const built = await rowOf(p.id);
  assert.equal(built.state, "ready");
  assert.ok(built.built_at);
  assert.equal(ok(await db.rpc("preview_built", { p_id: p.id, p_ok: true })), false, "only a building one moves");
  assert.equal(ok(await db.rpc("preview_sent", { p_id: p.id })), true);
  const sent = await rowOf(p.id);
  assert.ok(sent.first_sent_at);
  assert.ok(Math.abs(Date.parse(sent.ends_at) - (Date.parse(sent.first_sent_at) + 30 * 86_400_000)) < 1000);
  assert.equal(ok(await db.rpc("preview_sent", { p_id: p.id })), false, "stamped once");

  const failing = ok(await make(await lead()));
  tenants.push(failing.preview_tenant_id);
  ok(await db.rpc("preview_built", { p_id: failing.id, p_ok: false, p_why: "no_name" }));
  const failed = await rowOf(failing.id);
  assert.equal(failed.state, "failed");
  assert.equal(failed.failed_why, "no_name");
});

test("what it is asked: twenty messages and their answers, then the limit", { skip }, async () => {
  const p = await ready();
  const then = { tone: "sends", text: "On a real chat: sent at once" };
  for (let i = 1; i <= 20; i += 1) {
    const count = ok(
      await db.rpc("preview_said", {
        p_id: p.id,
        p_text: `Are you open on Sunday? ${i}`,
        p_reply: { text: "Yes", then },
      }),
    );
    assert.equal(count, i);
  }
  const over = await db.rpc("preview_said", { p_id: p.id, p_text: "One more", p_reply: { text: "Yes" } });
  assert.equal(over.error?.code, "54000");
  const row = await rowOf(p.id);
  assert.equal(row.asked_count, 20);
  assert.equal(row.turns.length, 40);
  assert.deepEqual(
    { role: row.turns[0].role, content: row.turns[0].content },
    { role: "user", content: "Are you open on Sunday? 1" },
  );
  assert.deepEqual(row.turns[1].then, then);
  assert.ok(row.tried_at);
  const empty = await db.rpc("preview_said", { p_id: p.id, p_text: "", p_reply: { text: "Yes" } });
  assert.equal(empty.error?.code, "22023");
});

test("a call's seconds, and ten lines not right at most", { skip }, async () => {
  const p = await ready();
  assert.equal(ok(await db.rpc("preview_called", { p_preview_tenant_id: p.preview_tenant_id, p_seconds: 64 })), true);
  const called = await rowOf(p.id);
  assert.equal(called.call_count, 1);
  assert.equal(called.call_seconds, 64);
  assert.ok(called.tried_at);
  for (let i = 1; i <= 10; i += 1)
    assert.equal(
      ok(await db.rpc("preview_not_right", { p_id: p.id, p_fact: "Saturday hours", p_said: `9 to ${i}` })),
      i,
    );
  const over = await db.rpc("preview_not_right", { p_id: p.id, p_fact: "Saturday hours", p_said: null });
  assert.equal(over.error?.code, "54000");
});

test(
  "made theirs: owned, active under the business's slug; the lead converted and its sequence ended",
  { skip },
  async () => {
    const p = await ready();
    ok(
      await db.from("lead_search_members").insert({
        search_id: W.F,
        lead_id: p.leadId,
        tenant_id: A,
        class: "qualified",
        counted: true,
        counted_month: new Date().toISOString().slice(0, 7),
        fit: "strong",
        reason: "",
        judgment: { answer: "yes", reasons: [], shares: [] },
      }),
    );
    const chosen = ok(
      await as.owner.c.rpc("lead_search_choose", {
        p_tenant_id: A,
        p_name: `Austin barbers ${stamp}`,
        p_lead_ids: [p.leadId],
      }),
    );
    const step = await one(
      db.from("sequence_steps").insert({
        tenant_id: A,
        kind: "reach_out",
        name: "Austin barbers",
        trigger: "lead_first",
        policy_class: "outreach",
        state: "running",
        lead_search_id: chosen.search_id,
        gap_minutes: 12,
        template_id: W.template,
        template_language: "en",
        template_name: "fixture_preview_1",
      }),
    );
    const send = crypto.randomUUID();
    ok(
      await db.rpc("reach_out_plan_run", {
        p_run: {
          id: crypto.randomUUID(),
          tenant_id: A,
          playbook_id: step,
          run_for: new Date().toISOString().slice(0, 10),
          name: "Run",
          template_id: W.template,
          template_name: "fixture_preview_1",
          template_language: "en",
          state: "pending_approval",
          scheduled_for: new Date(Date.now() + 3_600_000).toISOString(),
          recipient_count: 1,
          audience: { kind: "reach_out", root_id: step, step_id: step, search_id: chosen.search_id },
        },
        p_sends: [
          {
            id: send,
            lead_id: p.leadId,
            contact_id: null,
            send_at: new Date(Date.now() + 3_600_000).toISOString(),
            state: "planned",
          },
        ],
      }),
    );

    const claimed = ok(await as.first.c.rpc("preview_claim", { p_token: p.token }));
    assert.equal(claimed.length, 1);
    assert.equal(claimed[0].id, p.preview_tenant_id);
    assert.equal(claimed[0].status, "active");
    assert.match(claimed[0].slug, /^fixture-barbers(-\d+)?$/);
    const seats = ok(await db.from("memberships").select("user_id, role").eq("tenant_id", p.preview_tenant_id));
    assert.deepEqual(seats, [{ user_id: as.first.id, role: "owner" }]);
    const row = await rowOf(p.id);
    assert.equal(row.state, "claimed");
    assert.equal(row.claimed_by, as.first.id);
    const theLead = ok(await db.from("leads").select("stage, converted_at").eq("id", p.leadId).single());
    assert.equal(theLead.stage, "converted");
    const converted = ok(
      await db.from("events").select("data").eq("tenant_id", A).eq("subject_id", p.leadId).eq("kind", "lead.converted"),
    );
    assert.equal(converted[0].data.how, "claimed");
    const places = ok(await db.from("sequence_enrollments").select("state, why").eq("lead_id", p.leadId));
    assert.deepEqual(places, [{ state: "left", why: "made_it_theirs" }]);
    const sends = ok(await db.from("sequence_sends").select("state, reason").eq("id", send));
    assert.deepEqual(sends, [{ state: "skipped", reason: "made_it_theirs" }]);

    const again = await as.second.c.rpc("preview_claim", { p_token: p.token });
    assert.equal(again.error?.code, "55000");
    assert.match(again.error?.message ?? "", /Fixture Barbers is already set up\./);
  },
);

test("the first claim wins when two press at once", { skip }, async () => {
  const p = await ready();
  const [x, y] = await Promise.all([
    as.first.c.rpc("preview_claim", { p_token: p.token }),
    as.second.c.rpc("preview_claim", { p_token: p.token }),
  ]);
  assert.deepEqual(
    [x.error, y.error].filter(Boolean).map((e) => e.code),
    ["55000"],
  );
  assert.equal(ok(await db.from("memberships").select("user_id").eq("tenant_id", p.preview_tenant_id)).length, 1);
});

test("a claim is refused unknown, unready, ended, to nobody signed in, and past ten owned", { skip }, async () => {
  assert.equal((await as.first.c.rpc("preview_claim", { p_token: "x".repeat(22) })).error?.code, "P0002");
  const building = ok(await make(await lead()));
  tenants.push(building.preview_tenant_id);
  assert.equal((await as.first.c.rpc("preview_claim", { p_token: building.token })).error?.code, "55000");
  const anon = createClient(URL_, ANON, { auth: { persistSession: false } });
  const p = await ready();
  const nobody = await anon.rpc("preview_claim", { p_token: p.token });
  assert.ok(nobody.error, "anon holds no EXECUTE");

  const many = await person(null, null, "many");
  for (let i = 0; i < 10; i += 1) {
    const t = await one(db.from("tenants").insert({ slug: `preview-own-${stamp}-${i}`, name: `Owned ${i}` }));
    tenants.push(t);
    ok(await db.from("memberships").insert({ tenant_id: t, user_id: many.id, role: "owner" }));
  }
  assert.equal((await many.c.rpc("preview_claim", { p_token: p.token })).error?.code, "54000");
  assert.equal((await rowOf(p.id)).state, "ready");
});

test("ended: its workspace erased, its words cleared, its counts kept; never a claimed one", { skip }, async () => {
  const p = await ready();
  ok(await db.rpc("preview_said", { p_id: p.id, p_text: "Hi", p_reply: { text: "Hello" } }));
  ok(await db.rpc("preview_called", { p_preview_tenant_id: p.preview_tenant_id, p_seconds: 30 }));
  ok(await db.rpc("preview_not_right", { p_id: p.id, p_fact: "Phone", p_said: null }));
  ok(
    await db
      .from("rehearsals")
      .insert({ tenant_id: p.preview_tenant_id, kind: "call", retell_call_id: `call_${stamp}` }),
  );
  assert.equal(ok(await db.rpc("preview_end", { p_id: p.id })), true);
  const row = await rowOf(p.id);
  assert.equal(row.state, "ended");
  assert.ok(row.ended_at);
  assert.deepEqual([row.turns, row.not_right], [[], []]);
  assert.deepEqual([row.asked_count, row.call_count, row.call_seconds], [1, 1, 30]);
  assert.equal(row.preview_tenant_id, null);
  assert.equal(await tenantOf(p.preview_tenant_id), null);
  assert.equal(ok(await db.from("rehearsals").select("id").eq("tenant_id", p.preview_tenant_id)).length, 0);
  assert.equal(ok(await db.rpc("preview_end", { p_id: p.id })), false);
  assert.equal(
    (await db.rpc("preview_said", { p_id: p.id, p_text: "Hi", p_reply: { text: "Hello" } })).error?.code,
    "P0002",
  );

  const mine = await ready();
  ok(await as.first.c.rpc("preview_claim", { p_token: mine.token }));
  assert.equal(ok(await db.rpc("preview_end", { p_id: mine.id })), false);
  assert.equal((await tenantOf(mine.preview_tenant_id)).status, "active");
});

test("a lead deleted takes its preview's workspace with it", { skip }, async () => {
  const p = await ready();
  ok(await db.from("leads").delete().eq("id", p.leadId));
  assert.equal(await tenantOf(p.preview_tenant_id), null);
});

test("a lead erased ends its preview at once: its words cleared, its workspace gone", { skip }, async () => {
  const p = await ready();
  ok(await db.rpc("preview_said", { p_id: p.id, p_text: "Do you take walk-ins?", p_reply: { text: "We do" } }));
  ok(await as.owner.c.rpc("lead_erase", { p_lead_id: p.leadId }));
  const row = await rowOf(p.id);
  assert.equal(row.state, "ended");
  assert.deepEqual(row.turns, []);
  assert.equal(row.asked_count, 1, "the count stays");
  assert.equal(await tenantOf(p.preview_tenant_id), null);
});

test(
  "the sender's members read it; another workspace reads nothing; nobody writes it but the doors",
  { skip },
  async () => {
    const p = await ready();
    const mine = ok(await as.owner.c.from("lead_previews").select("id, token, state").eq("id", p.id));
    assert.deepEqual(mine, [{ id: p.id, token: p.token, state: "ready" }]);
    assert.deepEqual(ok(await as.stranger.c.from("lead_previews").select("id").eq("id", p.id)), []);
    const write = await as.owner.c.from("lead_previews").update({ state: "claimed" }).eq("id", p.id).select("id");
    assert.ok(write.error || write.data.length === 0, "no member update");
    assert.equal((await rowOf(p.id)).state, "ready");
    const door = await as.owner.c.rpc("preview_make", {
      p_tenant_id: A,
      p_lead_id: p.leadId,
      p_name: "x",
      p_timezone: "",
      p_by: null,
    });
    assert.ok(door.error, "the service role's door");
  },
);

test("create_workspace_for keeps its slug rule now that the rule has its own name", { skip }, async () => {
  const u = await person(null, null, "slugs");
  const first = ok(await u.c.rpc("create_workspace", { p_name: `Café Ñandú ${stamp}` }));
  const second = ok(await u.c.rpc("create_workspace", { p_name: `Café Ñandú ${stamp}` }));
  tenants.push(first[0].id, second[0].id);
  assert.equal(first[0].slug, `cafe-nandu-${stamp}`);
  assert.equal(second[0].slug, `cafe-nandu-${stamp}-1`);
  const blank = ok(await u.c.rpc("create_workspace", { p_name: "--  --" }));
  tenants.push(blank[0].id);
  assert.match(blank[0].slug, /^workspace(-\d+)?$/);
});

test(
  "a call's start holds its workspace's one start on the row's unique call id: a second at once is refused, one given back or left as it died frees it, and a named one leaves the minutes to say it runs",
  { skip },
  async () => {
    const { reserveRehearsalCall, releaseRehearsalCall, keepRehearsalCall, rehearsalSpokenMs } =
      await import("@chanlytics/db");
    const MIN = 60_000;
    const now = new Date();
    const ids = Array.from({ length: 4 }, () => crypto.randomUUID());
    const reserve = (id) => reserveRehearsalCall(db, { id, tenantId: B, createdBy: null, now });
    const spoken = (except) =>
      rehearsalSpokenMs(db, B, { since: null, now, runningMs: 5 * MIN, callMs: 3 * MIN, except });

    assert.equal(await reserve(ids[0]), true);
    assert.equal(await reserve(ids[1]), false, "a second start at the same moment: the unique call id refuses it");
    assert.deepEqual(
      await spoken(ids[0]),
      { spentMs: 0, running: false },
      "a start's own reservation is no other call",
    );
    assert.equal((await spoken(null)).running, true, "to anyone else, a call is being made");

    await releaseRehearsalCall(db, B, ids[0]);
    assert.equal(await reserve(ids[1]), true, "given back, the next start holds it");
    ok(
      await db
        .from("rehearsals")
        .update({ created_at: new Date(now.getTime() - 10 * MIN).toISOString() })
        .eq("id", ids[1]),
    );
    assert.equal(await reserve(ids[2]), true, "one left ten minutes ago by a start that died is given up");
    assert.deepEqual(ok(await db.from("rehearsals").select("id").eq("id", ids[1])), []);

    const named = {
      tenantId: B,
      agentId: "agent_fixture",
      configVersion: null,
      instructions: "Fixture Barbers' facts",
    };
    await keepRehearsalCall(db, { ...named, id: ids[2], retellCallId: `call_fixture_${stamp}` });
    assert.deepEqual(ok(await db.from("rehearsals").select("retell_call_id, agent_id").eq("id", ids[2]).single()), {
      retell_call_id: `call_fixture_${stamp}`,
      agent_id: "agent_fixture",
    });
    assert.equal(await reserve(ids[3]), true, "named for its call, the start is free again");
    assert.equal((await spoken(ids[3])).running, true, "and the minutes say that call runs");
    await releaseRehearsalCall(db, B, ids[3]);
    await assert.rejects(
      keepRehearsalCall(db, { ...named, id: ids[3], retellCallId: `call_fixture_late_${stamp}` }),
      /its reservation is gone/,
    );
  },
);
