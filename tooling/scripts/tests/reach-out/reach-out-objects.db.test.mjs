/**
 * A reach-out's objects on the database (00183, Reach out Part 3 PR 1): the chain's shape on `playbooks`, the sends
 * and the moves their guard allows, who may read them, and the class every workspace now has. Nothing sends yet; this
 * proves the rules the engine will lean on. Local stack only: it makes workspaces and a user.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const skip =
  !URL_ || !KEY || !ANON
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite makes workspaces"
      : false;

let db;
let A;
let B;
let search;
let template;
let domain;
let root;
let run;
const users = [];
const stamp = Date.now().toString(36);
const ok = (res) => {
  assert.equal(res.error, null, res.error?.message);
  return res.data;
};

/** A reach-out's root, its shape as 00183 asks: outreach, lead_first, a search, a pace. */
const rootRow = (over = {}) => ({
  tenant_id: A,
  kind: "reach_out",
  name: "Movers in Austin",
  trigger: "lead_first",
  policy_class: "outreach",
  lead_search_id: search,
  gap_minutes: 12,
  template_id: template,
  template_name: "reach_first",
  template_language: "en",
  params: [],
  ...over,
});

let n = 0;
const lead = async (tenant = A) =>
  ok(
    await db
      .from("leads")
      .insert({
        tenant_id: tenant,
        place_id: `ChIJfixtureObjects${stamp}${++n}`,
        business_name: "Fixture Harbor",
        city: "Austin",
        region: "TX",
        email: `owner-${stamp}-${n}@fixture-objects.example`,
        email_state: "ok",
        stage: "ready",
      })
      .select("id")
      .single(),
  ).id;

const send = async (over = {}) => {
  const id = crypto.randomUUID();
  ok(
    await db.from("reach_out_sends").insert({
      id,
      tenant_id: A,
      broadcast_id: run,
      playbook_id: root,
      root_id: root,
      lead_id: await lead(),
      domain_id: domain,
      send_at: new Date().toISOString(),
      // Checked (00197): a claim takes a checked send only.
      checked_at: new Date().toISOString(),
      ...over,
    }),
  );
  return id;
};
const move = (id, patch) => db.from("reach_out_sends").update(patch).eq("id", id).select("state");

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  A = ok(
    await db
      .from("tenants")
      .insert({ slug: `objects-a-${stamp}`, name: "Objects A" })
      .select("id")
      .single(),
  ).id;
  B = ok(
    await db
      .from("tenants")
      .insert({ slug: `objects-b-${stamp}`, name: "Objects B" })
      .select("id")
      .single(),
  ).id;
  // The provisioner's own rows (00183 seeds the class for new workspaces through it).
  for (const t of [A, B]) ok(await db.rpc("provision_tenant", { p_tenant_id: t }));
  search = ok(
    await db
      .from("lead_searches")
      .insert({
        tenant_id: A,
        via: "people",
        card: "movers",
        name: "Movers in Austin",
        asked: "movers in Austin",
        plan: {},
      })
      .select("id")
      .single(),
  ).id;
  template = ok(
    await db
      .from("templates")
      .insert({
        tenant_id: A,
        channel: "email",
        source: "chanlytics",
        name: `reach_first_${stamp}`,
        language: "en",
        category: "marketing",
        meta_status: "approved",
        components: [
          { type: "HEADER", text: "Your moving quotes" },
          { type: "BODY", text: "Hi {{business}}" },
        ],
      })
      .select("id")
      .single(),
  ).id;
  domain = ok(
    await db
      .from("sending_domains")
      .insert({
        tenant_id: A,
        host: `getharbor-${stamp}.example`,
        from_local: "sam",
        from_name: "Sam at Harbor",
        state: "verified",
        provider_status: "verified",
        dmarc: "found",
        verified_at: new Date().toISOString(),
        clean_since: new Date().toISOString(),
      })
      .select("id")
      .single(),
  ).id;
  root = ok(await db.from("playbooks").insert(rootRow()).select("id").single()).id;
  run = ok(
    await db
      .from("broadcasts")
      .insert({
        tenant_id: A,
        name: "Movers in Austin",
        template_id: template,
        template_name: `reach_first_${stamp}`,
        template_language: "en",
        audience: { kind: "reach_out", root_id: root, step_id: root, search_id: search },
        state: "scheduled",
        scheduled_for: new Date().toISOString(),
        playbook_id: root,
        run_for: "2026-09-28",
      })
      .select("id")
      .single(),
  ).id;
});
after(async () => {
  if (skip) return;
  for (const t of [A, B].filter(Boolean)) ok(await db.from("tenants").delete().eq("id", t));
  for (const u of users) assert.equal((await db.auth.admin.deleteUser(u)).error, null);
});

test(
  "a reach-out's shape: a root has a search and a pace, a step a parent and a delay, a moment none of it (00183)",
  { skip },
  async () => {
    const refused = async (row, why) => {
      const r = await db.from("playbooks").insert(row);
      assert.match(r.error?.message ?? "", /playbooks_reach_out_shape/, why);
    };
    await refused(rootRow({ lead_search_id: null }), "a root without its search");
    await refused(rootRow({ gap_minutes: null }), "a reach-out without its pace");
    await refused(rootRow({ policy_class: "campaign" }), "a reach-out under a moment's class");
    await refused(
      rootRow({ trigger: "after_step", lead_search_id: null, after_playbook_id: root, after_days: 1 }),
      "a step a day after: two at least",
    );
    await refused(
      { ...rootRow(), kind: "moment", trigger: "quiet_30", policy_class: "reengage", lead_search_id: null },
      "a moment with a pace",
    );
    const step = ok(
      await db
        .from("playbooks")
        .insert(rootRow({ trigger: "after_step", lead_search_id: null, after_playbook_id: root, after_days: 3 }))
        .select("id")
        .single(),
    ).id;
    assert.ok(step);
    const second = await db
      .from("playbooks")
      .insert(rootRow({ trigger: "after_step", lead_search_id: null, after_playbook_id: root, after_days: 5 }));
    assert.match(second.error?.message ?? "", /playbooks_one_next|duplicate key/, "a chain, not a tree");
  },
);

test(
  "a send moves planned, claimed, queued, sent; waits again from claimed or queued; and stays final once done (00183)",
  { skip },
  async () => {
    const s = await send();
    assert.deepEqual(ok(await move(s, { state: "claimed", claimed_at: new Date().toISOString() })), [
      { state: "claimed" },
    ]);
    // Back to planned: a claim that could not be written, or an email the door said to wait for (C5).
    assert.deepEqual(ok(await move(s, { state: "planned" })), [{ state: "planned" }]);
    ok(await move(s, { state: "claimed" }));
    const message = ok(
      await db
        .from("conversations")
        .insert({
          tenant_id: A,
          contact_id: ok(
            await db
              .from("contacts")
              .insert({ tenant_id: A, email: `k-${stamp}@fixture-objects.example` })
              .select("id")
              .single(),
          ).id,
        })
        .select("id")
        .single(),
    ).id;
    const m = ok(
      await db
        .from("messages")
        .insert({
          tenant_id: A,
          conversation_id: message,
          channel: "email",
          direction: "outbound",
          sender: "human",
          type: "text",
          body: "Hi",
          status: "queued",
        })
        .select("id")
        .single(),
    ).id;
    // Its email row is the writer's to name (an erasure may delete it later: the clock skips a queued send without one).
    ok(await move(s, { state: "queued", message_id: m }));
    ok(await move(s, { state: "sent", sent_at: new Date().toISOString() }));
    for (const to of ["planned", "claimed", "queued", "skipped"]) {
      const r = await move(s, { state: to });
      assert.match(r.error?.message ?? "", /reach_out_sends\.state moves sent -> /, `sent -> ${to}`);
    }
    const t = await send();
    assert.match(
      (await move(t, { state: "queued" })).error?.message ?? "",
      /moves planned -> queued/,
      "never queued unclaimed",
    );
    ok(await move(t, { state: "skipped", reason: "run_canceled" }));
    assert.match((await move(t, { state: "planned" })).error?.message ?? "", /moves skipped -> planned/);
    const u = await send();
    ok(await move(u, { state: "claimed", reason: "the same state again is not a move" }));
    ok(await move(u, { state: "claimed" }));
  },
);

test(
  "a planned send knows when (its domain may be one that was removed), and one lead is in a run once",
  { skip },
  async () => {
    const noTime = await db.from("reach_out_sends").insert({
      id: crypto.randomUUID(),
      tenant_id: A,
      broadcast_id: run,
      playbook_id: root,
      root_id: root,
      lead_id: await lead(),
    });
    assert.match(noTime.error?.message ?? "", /reach_out_sends_planned_is_timed/);
    const l = await lead();
    await send({ lead_id: l });
    const twice = await db.from("reach_out_sends").insert({
      id: crypto.randomUUID(),
      tenant_id: A,
      broadcast_id: run,
      playbook_id: root,
      root_id: root,
      lead_id: l,
      domain_id: domain,
      send_at: new Date().toISOString(),
    });
    assert.match(twice.error?.message ?? "", /duplicate key/);
  },
);

test("a member reads their own workspace's sends and nobody else's, and no session writes one", { skip }, async () => {
  await send();
  const email = `objects-${stamp}@fixture-objects.example`;
  const password = `pw-${stamp}-${crypto.randomUUID()}`;
  const made = await db.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(made.error, null, made.error?.message);
  users.push(made.data.user.id);
  ok(await db.from("memberships").insert({ tenant_id: B, user_id: made.data.user.id, role: "owner" }));
  const member = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  ok(await member.auth.signInWithPassword({ email, password }));
  assert.deepEqual(
    ok(await member.from("reach_out_sends").select("id").eq("tenant_id", A)),
    [],
    "A's sends, to a member of B",
  );
  ok(await db.from("memberships").insert({ tenant_id: A, user_id: made.data.user.id, role: "owner" }));
  assert.ok(
    ok(await member.from("reach_out_sends").select("id").eq("tenant_id", A)).length > 0,
    "their own workspace's",
  );
  const write = await member.from("reach_out_sends").insert({
    id: crypto.randomUUID(),
    tenant_id: A,
    broadcast_id: run,
    playbook_id: root,
    root_id: root,
    lead_id: await lead(),
    domain_id: domain,
    send_at: new Date().toISOString(),
  });
  assert.ok(write.error, "a session never writes a send");
});

test(
  "every workspace has the class outreach, veto by default: a chain's first run waits, a later one gives thirty minutes",
  { skip },
  async () => {
    for (const t of [A, B]) {
      const rows = ok(await db.from("policies").select("mode").eq("tenant_id", t).eq("class", "outreach"));
      assert.deepEqual(rows, [{ mode: "veto" }]);
    }
  },
);

test(
  "a removed domain and an erased email leave their sends standing: the clock re-plans or skips them, nothing aborts",
  { skip },
  async () => {
    // A domain removed on Connections with a send planned on it: the send stays planned, with no domain.
    const gone = ok(
      await db
        .from("sending_domains")
        .insert({ tenant_id: A, host: `gone-${stamp}.example`, from_local: "sam", from_name: "Sam", state: "records" })
        .select("id")
        .single(),
    ).id;
    const planned = await send({ domain_id: gone });
    ok(await db.from("sending_domains").delete().eq("id", gone));
    assert.deepEqual(ok(await db.from("reach_out_sends").select("state, domain_id").eq("id", planned)), [
      { state: "planned", domain_id: null },
    ]);

    // An erasure deletes the person's messages (erase_contact): a sent send keeps when it left, a queued one waits to be skipped.
    const contact = ok(
      await db
        .from("contacts")
        .insert({ tenant_id: A, email: `erased-${stamp}@fixture-objects.example` })
        .select("id")
        .single(),
    ).id;
    const conv = ok(
      await db.from("conversations").insert({ tenant_id: A, contact_id: contact }).select("id").single(),
    ).id;
    const row = async () =>
      ok(
        await db
          .from("messages")
          .insert({
            tenant_id: A,
            conversation_id: conv,
            channel: "email",
            direction: "outbound",
            sender: "human",
            type: "text",
            body: "Hi",
            status: "queued",
          })
          .select("id")
          .single(),
      ).id;
    const sent = await send();
    const m1 = await row();
    ok(await move(sent, { state: "claimed" }));
    ok(await move(sent, { state: "queued", message_id: m1 }));
    ok(await move(sent, { state: "sent", sent_at: new Date().toISOString() }));
    const queued = await send();
    const m2 = await row();
    ok(await move(queued, { state: "claimed" }));
    ok(await move(queued, { state: "queued", message_id: m2 }));
    ok(await db.from("messages").delete().in("id", [m1, m2]));
    const after = ok(
      await db.from("reach_out_sends").select("id, state, message_id, sent_at").in("id", [sent, queued]),
    );
    const by = Object.fromEntries(after.map((r) => [r.id, r]));
    assert.deepEqual([by[sent].state, by[sent].message_id, !!by[sent].sent_at], ["sent", null, true]);
    assert.deepEqual([by[queued].state, by[queued].message_id], ["queued", null]);
  },
);

test(
  "a session makes no reach-out and rewrites none; a step's parent is its own workspace's (00183)",
  { skip },
  async () => {
    const email = `maker-${stamp}@fixture-objects.example`;
    const password = `pw-${stamp}-${crypto.randomUUID()}`;
    const made = await db.auth.admin.createUser({ email, password, email_confirm: true });
    assert.equal(made.error, null, made.error?.message);
    users.push(made.data.user.id);
    ok(await db.from("memberships").insert({ tenant_id: A, user_id: made.data.user.id, role: "owner" }));
    const member = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
    ok(await member.auth.signInWithPassword({ email, password }));
    const insert = await member.from("playbooks").insert(rootRow({ created_by: made.data.user.id }));
    assert.ok(insert.error, "no session inserts a reach-out until its sheet's door exists (Part 4)");
    const moment = ok(
      await db
        .from("playbooks")
        .insert({
          tenant_id: A,
          name: "Win-back",
          trigger: "quiet_30",
          policy_class: "reengage",
          template_id: template,
          template_name: "t",
          template_language: "en",
          params: [],
        })
        .select("id")
        .single(),
    ).id;
    for (const patch of [
      { kind: "reach_out" },
      { after_playbook_id: root },
      { lead_search_id: search },
      { gap_minutes: 12 },
    ]) {
      const r = await member.from("playbooks").update(patch).eq("id", moment).select("id");
      assert.ok(r.error, `${Object.keys(patch)[0]} is no session's to write`);
    }
    const sendUpdate = await member
      .from("reach_out_sends")
      .update({ state: "skipped" })
      .eq("tenant_id", A)
      .select("id");
    assert.ok(sendUpdate.error || sendUpdate.data.length === 0, "no session moves a send");
    // A step under another workspace's root: the composite key refuses it, whoever writes it.
    // Over a search of its own: a search has one chain (00197).
    const another = ok(
      await db
        .from("lead_searches")
        .insert({ tenant_id: A, via: "people", card: "movers", name: "Another", asked: "movers", plan: {} })
        .select("id")
        .single(),
    ).id;
    const loneRoot = ok(
      await db
        .from("playbooks")
        .insert(rootRow({ name: "Another chain", lead_search_id: another }))
        .select("id")
        .single(),
    ).id;
    const across = await db.from("playbooks").insert({
      ...rootRow({ trigger: "after_step", lead_search_id: null, after_playbook_id: loneRoot, after_days: 3 }),
      tenant_id: B,
      template_id: template,
    });
    assert.match(across.error?.message ?? "", /playbooks_after_same_workspace/);
  },
);
