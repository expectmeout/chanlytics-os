/**
 * A reach-out step's run on the database (00185, Reach out Part 3 PR 4): the run and its sends written whole under the
 * run's own id, never a run with nothing planned in it; a replay or another tick answered {exists}; the sends kept to
 * the run's workspace; and a step's followers kept to the ones the door would write to before their limit, so a lead
 * that may not be written to never heads the page ahead of those behind it. Local stack only: it makes workspaces.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { buildEmailRequest, ownDomainIdentity } from "@chanlytics/channels";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite makes workspaces"
      : false;

const DAY = 86_400_000;
const stamp = Date.now().toString(36);
const MAILBOX = { local_part: "harbor", reply_token: "c".repeat(24), from_name: "Harbor" };
const iso = (ms) => new Date(ms).toISOString();

let db;
let A;
let B;
let template;
let search;
let root;
let step;
let domain;
let host;
let n = 0;
const ok = (res) => {
  assert.equal(res.error, null, res.error?.message);
  return res.data;
};
const one = async (q) => ok(await q.select("id").single()).id;

const lead = (tenant = A, over = {}) => {
  n += 1;
  return one(
    db.from("leads").insert({
      tenant_id: tenant,
      place_id: `ChIJfixtureRun${stamp}${n}`,
      business_name: `Fixture Movers ${n}`,
      city: "Austin",
      region: "TX",
      email: `owner-${stamp}-${n}@fixture-run.example`,
      email_state: "ok",
      stage: "ready",
      ...over,
    }),
  );
};
const runRow = (over = {}) => ({
  id: crypto.randomUUID(),
  tenant_id: A,
  playbook_id: root,
  run_for: "2026-09-28",
  name: "Movers in Austin · 2026-09-28",
  template_id: template,
  template_name: `reach_first_${stamp}`,
  template_language: "en",
  state: "pending_approval",
  scheduled_for: iso(Date.now() + DAY),
  recipient_count: 2,
  audience: { kind: "reach_out", root_id: root, step_id: root, search_id: search },
  ...over,
});
const planned = (leadId, over = {}) => ({
  id: crypto.randomUUID(),
  lead_id: leadId,
  contact_id: null,
  domain_id: domain,
  send_at: iso(Date.now() + DAY),
  state: "planned",
  reason: null,
  ...over,
});
const plan = (run, sends) => db.rpc("reach_out_plan_run", { p_run: run, p_sends: sends });

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  A = await one(db.from("tenants").insert({ slug: `run-a-${stamp}`, name: "Run A" }));
  B = await one(db.from("tenants").insert({ slug: `run-b-${stamp}`, name: "Run B" }));
  search = await one(
    db.from("lead_searches").insert({
      tenant_id: A,
      via: "people",
      card: "movers",
      name: "Movers in Austin",
      asked: "movers in Austin",
      plan: {},
    }),
  );
  template = await one(
    db.from("templates").insert({
      tenant_id: A,
      channel: "email",
      source: "chanlytics",
      name: `reach_first_${stamp}`,
      language: "en",
      category: "marketing",
      meta_status: "approved",
      components: [{ type: "BODY", text: "Hi {{business}}" }],
    }),
  );
  const chain = {
    tenant_id: A,
    kind: "reach_out",
    policy_class: "outreach",
    gap_minutes: 12,
    template_id: template,
    template_name: `reach_first_${stamp}`,
    template_language: "en",
    params: [],
  };
  root = await one(
    db.from("playbooks").insert({ ...chain, name: "Movers", trigger: "lead_first", lead_search_id: search }),
  );
  step = await one(
    db
      .from("playbooks")
      .insert({ ...chain, name: "Nudge", trigger: "after_step", after_playbook_id: root, after_days: 3 }),
  );
  host = `run-${stamp}.example`;
  domain = await one(
    db.from("sending_domains").insert({
      tenant_id: A,
      host,
      from_local: "sam",
      from_name: "Sam at Harbor",
      state: "verified",
      provider_status: "verified",
      dmarc: "found",
      verified_at: iso(Date.now() - 10 * DAY),
      clean_since: iso(Date.now() - 10 * DAY),
    }),
  );
});
after(async () => {
  if (skip) return;
  for (const t of [A, B].filter(Boolean)) ok(await db.from("tenants").delete().eq("id", t));
});

test("a run and its sends are written whole, under the run's own id, the sends the run's", { skip }, async () => {
  const [a, b, c] = [await lead(), await lead(), await lead()];
  const run = runRow();
  const sends = [
    planned(a),
    planned(b),
    planned(c, { state: "skipped", domain_id: null, send_at: null, reason: "closed_every_day" }),
  ];
  assert.deepEqual(ok(await plan(run, sends)), { id: run.id });
  const b0 = ok(
    await db.from("broadcasts").select("id, state, playbook_id, run_for, audience").eq("id", run.id).single(),
  );
  assert.deepEqual(
    [b0.state, b0.playbook_id, b0.run_for, b0.audience.kind],
    ["pending_approval", root, "2026-09-28", "reach_out"],
  );
  const rows = ok(
    await db
      .from("reach_out_sends")
      .select("id, tenant_id, broadcast_id, playbook_id, root_id, lead_id, state, reason, domain_id")
      .eq("broadcast_id", run.id)
      .order("state"),
  );
  assert.equal(rows.length, 3);
  for (const r of rows)
    assert.deepEqual([r.tenant_id, r.broadcast_id, r.playbook_id, r.root_id], [A, run.id, root, root]);
  // By lead, whatever order the rows come back in: one state is no order within it.
  const byLead = Object.fromEntries(rows.map((r) => [r.lead_id, [r.state, r.reason]]));
  assert.deepEqual(byLead, {
    [a]: ["planned", null],
    [b]: ["planned", null],
    [c]: ["skipped", "closed_every_day"],
  });
  // A replay (the same id) and another tick's run for the step's day (another id) meet what was made, and add nothing.
  assert.deepEqual(ok(await plan(run, [planned(await lead())])), { exists: true });
  assert.deepEqual(ok(await plan(runRow(), [planned(await lead())])), { exists: true });
  assert.equal(ok(await db.from("reach_out_sends").select("id").eq("broadcast_id", run.id)).length, 3);
});

test(
  "a run whose sends cannot all be written is not made at all: never a run with nothing planned in it",
  { skip },
  async () => {
    const run = runRow({ run_for: "2026-09-29" });
    // A planned send with no time breaks reach_out_sends_planned_is_timed: the whole call fails.
    const r = await plan(run, [planned(await lead()), planned(await lead(), { send_at: null })]);
    assert.match(r.error?.message ?? "", /reach_out_sends_planned_is_timed/);
    assert.deepEqual(ok(await db.from("broadcasts").select("id").eq("id", run.id)), [], "no run left behind");
    // And the next tick makes it whole.
    assert.deepEqual(ok(await plan(run, [planned(await lead())])), { id: run.id });
  },
);

test(
  "the sends are the run's workspace's: another's lead or domain is left out, another's step refused",
  { skip },
  async () => {
    const theirs = await lead(B);
    const theirDomain = await one(
      db
        .from("sending_domains")
        .insert({ tenant_id: B, host: `b-${stamp}.example`, from_local: "sam", from_name: "Sam", state: "records" }),
    );
    const mine = await lead();
    const run = runRow({ run_for: "2026-09-30" });
    ok(await plan(run, [planned(mine), planned(theirs), planned(await lead(), { domain_id: theirDomain })]));
    assert.deepEqual(
      ok(await db.from("reach_out_sends").select("lead_id").eq("broadcast_id", run.id)).map((r) => r.lead_id),
      [mine],
    );
    const across = await plan(runRow({ tenant_id: B, run_for: "2026-10-01" }), [planned(theirs)]);
    assert.match(across.error?.message ?? "", /no reach-out of workspace/);
    const notReach = await plan(runRow({ run_for: "2026-10-02", audience: { kind: "playbook" } }), []);
    assert.match(notReach.error?.message ?? "", /says so in its audience/);
  },
);

test(
  "a step's followers are the ones the door would write to, before the limit: a refused one never heads the page",
  { skip },
  async () => {
    const person = async (l) => ok(await db.rpc("reach_out_person", { p_tenant_id: A, p_lead_id: l }));
    const firstRun = runRow({ run_for: "2026-09-01" });
    ok(await plan(firstRun, []));
    const sentTo = async (daysAgo, over = {}) => {
      const l = await lead();
      const p = await person(l);
      const id = crypto.randomUUID();
      const request = buildEmailRequest({
        identity: ownDomainIdentity({ host, from_local: "sam", from_name: "Sam" }, MAILBOX, "mail.chanlytics.com"),
        to: `x-${stamp}@fixture-run.example`,
        parent: null,
        subject: "Your moving quotes",
        body: "Saw your shop on the map.",
        signature: null,
        actor: "ai",
        campaign: {
          unsubscribeUrl: "https://app.chanlytics.com/u/t",
          footer: "Unsubscribe: https://app.chanlytics.com/u/t",
        },
        messageId: id,
        tenantId: A,
      });
      ok(
        await db.from("messages").insert({
          id,
          tenant_id: A,
          conversation_id: p.conversation_id,
          channel: "email",
          direction: "outbound",
          sender: "ai",
          type: "text",
          body: "Saw your shop on the map.",
          status: "sent",
          meta: { email: { subject: request.subject, to: request.to[0], request } },
        }),
      );
      const s = crypto.randomUUID();
      ok(
        await db.from("reach_out_sends").insert({
          id: s,
          tenant_id: A,
          broadcast_id: firstRun.id,
          playbook_id: root,
          root_id: root,
          lead_id: l,
          contact_id: p.contact_id,
          domain_id: domain,
          send_at: iso(Date.now() - daysAgo * DAY),
          // Checked before it went (00197): a claim takes a checked send only.
          checked_at: iso(Date.now() - daysAgo * DAY),
        }),
      );
      for (const patch of [
        { state: "claimed", claimed_at: iso(Date.now()) },
        { state: "queued", message_id: id },
        { state: "sent", sent_at: iso(Date.now() - daysAgo * DAY) },
      ])
        ok(await db.from("reach_out_sends").update(patch).eq("id", s));
      if (over.stage) ok(await db.from("leads").update({ stage: over.stage, closed_reason: "not_a_fit" }).eq("id", l));
      if (over.wrote)
        ok(
          await db.from("messages").insert({
            tenant_id: A,
            conversation_id: p.conversation_id,
            channel: "email",
            direction: "inbound",
            sender: "customer",
            type: "text",
            body: "No thanks.",
            status: "received",
            meta: { email: { subject: "Re: Your moving quotes" } },
          }),
        );
      return l;
    };
    // The two oldest may not be written to again; the third may.
    await sentTo(9, { wrote: true });
    await sentTo(8, { stage: "archived" });
    const due = await sentTo(7);
    const rows = ok(
      await db.rpc("reach_out_followers", {
        p_tenant_id: A,
        p_step_id: step,
        p_parent_id: root,
        p_after_days: 3,
        p_limit: 1,
      }),
    );
    assert.deepEqual(
      rows.map((r) => r.lead_id),
      [due],
      "at a limit of one, the one the door would write to, not the oldest",
    );
    assert.deepEqual(rows[0].facts, {
      lead_stage: "ready",
      suppressed: false,
      wrote_back: false,
      away: false,
      stopped: false,
    });
  },
);
