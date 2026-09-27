/**
 * The reach-out sheet's doors (00211, Reach out Part 4 PRs 4–5), on a real database, as the service role and as a
 * signed-in member: a chain saved whole by the service role only, for an owner or operator (R15), with its pace one the
 * sheet offers; an edit that changes words or the name signed with sends what is planned or held back to the check at
 * the words' next version, keeping what its owner included (R5, R7); a step dropped cancels its runs and skips its
 * sends before it goes, and one that wrote is kept (R17); a search's reach; an owner's answers to a held email,
 * not_a_fit atomic, Include refused past the fortnight (R10, R18); a run's unanswered holds back in one call (R18);
 * a chain's report counted once, bounces by the provider's bounce, wrote back and said no by lead (R23); a chain
 * removed only before it writes (R16); and a session that deletes moments only (R16). Every refusal says contracts'
 * own sentence. Local stack only: it makes workspaces and people.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { REACH_OUT_REFUSALS } from "@chanlytics/contracts";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite makes workspaces"
      : !ANON
        ? "no SUPABASE_ANON_KEY in env: the members this suite signs in as need it"
        : false;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const CLI = process.env.SUPABASE_CLI || "supabase";
/** One statement through `supabase db query --local` (privileges.db.test.mjs's way), and its rows. */
function query(sql) {
  const r = spawnSync(CLI, ["db", "query", "--local", "--output-format", "json", sql], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (r.error || r.status !== 0) throw new Error(`${CLI} db query failed: ${r.error?.message ?? r.stderr ?? r.stdout}`);
  const out = r.stdout;
  const start = out.search(/[[{]/);
  if (start < 0) return [];
  const parsed = JSON.parse(out.slice(start, out.lastIndexOf(out[start] === "{" ? "}" : "]") + 1));
  return Array.isArray(parsed) ? parsed : (parsed.rows ?? []);
}
const MIN = 60_000;
const DAY = 24 * 3_600_000;
const stamp = Date.now().toString(36);
const iso = (ms) => new Date(ms).toISOString();

let db;
let A;
const users = [];
const as = {};
let n = 0;
const ok = (res) => {
  assert.equal(res.error, null, res.error?.message);
  return res.data;
};
const one = async (q) => ok(await q.select("id").single()).id;
const refusedWith = (res, code, words) => {
  assert.ok(res.error, "refused");
  assert.equal(res.error.code, code, res.error.message);
  if (words) assert.equal(res.error.message, words);
};

async function person(role) {
  const email = `doors-${role}-${stamp}@fixture-doors.example`;
  const password = `pw-${stamp}-${role}-Aa1!`;
  const made = await db.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(made.error, null, made.error?.message);
  users.push(made.data.user.id);
  ok(await db.from("memberships").insert({ tenant_id: A, user_id: made.data.user.id, role }));
  const c = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  ok(await c.auth.signInWithPassword({ email, password }));
  return { id: made.data.user.id, c };
}
const newSearch = (name) =>
  one(
    db.from("lead_searches").insert({ tenant_id: A, via: "people", card: "movers", name, asked: "movers", plan: {} }),
  );
const lead = (over = {}) => {
  n += 1;
  return one(
    db.from("leads").insert({
      tenant_id: A,
      place_id: `ChIJfixtureDoors${stamp}${n}`,
      business_name: `Fixture Movers ${n}`,
      city: "Austin",
      region: "TX",
      email: `owner-${stamp}-${n}@fixture-doors.example`,
      email_state: "ok",
      stage: "ready",
      ...over,
    }),
  );
};
const member = (s, leadId) =>
  one(
    db.from("lead_search_members").insert({
      search_id: s,
      lead_id: leadId,
      tenant_id: A,
      class: "qualified",
      counted: true,
      counted_month: new Date().toISOString().slice(0, 7),
      fit: "look",
      judgment: { answer: "yes", reasons: [], shares: [] },
    }),
  );
const chainOf = (s, over = {}) => ({
  name: "Reach out · Movers",
  search_id: s,
  include_unconfirmed: false,
  gap_minutes: 12,
  domain_ids: [],
  signed_by: "Sam",
  steps: [
    { subject: "Quick one for {{business}}", body: "{{opening}}\n\n{{your name}}", after_days: null },
    { subject: null, body: "Just checking in.", after_days: 4 },
  ],
  ...over,
});
const save = (chain, userId = as.operator.id) =>
  db.rpc("reach_out_save", { p_tenant_id: A, p_user_id: userId, p_chain: chain });
let far = 0;
const runOf = async (rootId, stepId, state = "scheduled") => {
  far += 1;
  const { template_id } = ok(await db.from("playbooks").select("template_id").eq("id", stepId).single());
  return one(
    db.from("broadcasts").insert({
      tenant_id: A,
      name: "Movers",
      template_id,
      template_name: "reach_doors",
      template_language: "en",
      audience: { kind: "reach_out", root_id: rootId, step_id: stepId },
      state,
      scheduled_for: iso(Date.now()),
      playbook_id: stepId,
      run_for: new Date(Date.UTC(2098, 0, far)).toISOString().slice(0, 10),
    }),
  );
};
const sendIn = async (run, rootId, stepId, over = {}) => {
  const id = crypto.randomUUID();
  ok(
    await db.from("reach_out_sends").insert({
      id,
      tenant_id: A,
      broadcast_id: run,
      playbook_id: stepId,
      root_id: rootId,
      lead_id: over.lead_id ?? (await lead()),
      send_at: iso(Date.now() + MIN),
      ...over,
    }),
  );
  return id;
};
const sendRow = async (id) => ok(await db.from("reach_out_sends").select("*").eq("id", id).single());

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  A = await one(db.from("tenants").insert({ slug: `doors-a-${stamp}`, name: "Harbor Moving Co" }));
  ok(await db.rpc("provision_tenant", { p_tenant_id: A }));
  ok(await db.from("billing_accounts").upsert({ tenant_id: A, mode: "direct", status: "active" }));
  for (const role of ["owner", "operator", "partner", "viewer"]) as[role] = await person(role);
});
after(async () => {
  if (skip) return;
  if (A) ok(await db.from("tenants").delete().eq("id", A));
  for (const u of users) await db.auth.admin.deleteUser(u);
});

test(
  "a chain is saved whole by the service role, for an owner or operator, its pace one the sheet offers (R15)",
  { skip },
  async () => {
    const s = await newSearch("Movers A");
    refusedWith(await save(chainOf(s), as.viewer.id), "P0002");
    const denied = await as.operator.c.rpc("reach_out_save", {
      p_tenant_id: A,
      p_user_id: as.operator.id,
      p_chain: chainOf(s),
    });
    assert.ok(denied.error, "a session may not call the service role's door");
    refusedWith(await save(chainOf(s, { gap_minutes: 7 })), "23514");
    const saved = ok(await save(chainOf(s)));
    assert.equal(saved.step_ids.length, 2);
    const rows = ok(
      await db
        .from("playbooks")
        .select("id, kind, trigger, after_playbook_id, after_days, gap_minutes, signed_by, template_id, created_by")
        .in("id", saved.step_ids),
    );
    const root = rows.find((r) => r.id === saved.root_id);
    const step = rows.find((r) => r.id !== saved.root_id);
    assert.deepEqual(
      [root.kind, root.trigger, root.signed_by, root.gap_minutes, root.created_by],
      ["reach_out", "lead_first", "Sam", 12, as.operator.id],
    );
    assert.deepEqual(
      [step.trigger, step.after_playbook_id, step.after_days, step.signed_by],
      ["after_step", saved.root_id, 4, null],
    );
    const tpl = ok(await db.from("templates").select("channel, components").eq("id", root.template_id).single());
    assert.deepEqual(
      tpl.components.map((c) => [c.type, c.text]),
      [
        ["HEADER", "Quick one for {{business}}"],
        ["BODY", "{{opening}}\n\n{{your name}}"],
      ],
    );
    refusedWith(await save(chainOf(s)), "23505", REACH_OUT_REFUSALS.exists);
    refusedWith(
      await save({
        ...chainOf(s),
        root_id: saved.root_id,
        steps: [chainOf(s).steps[1], chainOf(s).steps[0]].map((x, i) => ({
          ...x,
          id: i === 0 ? saved.step_ids[1] : saved.step_ids[0],
        })),
      }),
      "22023",
      REACH_OUT_REFUSALS.outOfPlace,
    );
  },
);

test(
  "an edit's new words or new name send what is planned or held back to the check, keeping what its owner included (R5, R7)",
  { skip },
  async () => {
    const s = await newSearch("Movers B");
    const {
      root_id: root,
      step_ids: [, step2],
    } = ok(await save(chainOf(s)));
    const run1 = await runOf(root, root);
    const run2 = await runOf(root, step2);
    const first = await sendIn(run1, root, root, {
      checked_at: iso(Date.now()),
      check_gen: 3,
      included_for: ["chain"],
      opening: "Hi.",
    });
    const nudge = await sendIn(run2, root, step2, { checked_at: iso(Date.now()), check_gen: 1 });
    const ids = (await sendRow(first)) && [root, step2];
    // The first step's words change; the nudge's do not.
    const edit = chainOf(s, { steps: chainOf(s).steps.map((x, i) => ({ ...x, id: ids[i] })) });
    edit.steps[0].body = "{{opening}}\n\nWe move offices too.\n\n{{your name}}";
    const r = ok(await save({ ...edit, root_id: root }));
    assert.equal(r.rechecked, 1);
    const a = await sendRow(first);
    assert.deepEqual(
      [a.state, a.checked_at, a.check_gen, a.opening, a.included_for],
      ["planned", null, 4, null, ["chain"]],
    );
    assert.ok((await sendRow(nudge)).checked_at, "a step whose words stand is not checked again");
    // A new name to sign with: every step's planned email is checked again.
    const r2 = ok(await save({ ...edit, signed_by: "Ruben", root_id: root }));
    assert.equal(r2.rechecked, 2);
    assert.equal((await sendRow(nudge)).check_gen, 2);
  },
);

test("a step dropped takes its work with it before it goes; one that wrote is kept (R17)", { skip }, async () => {
  const s = await newSearch("Movers C");
  const {
    root_id: root,
    step_ids: [, step2],
  } = ok(await save(chainOf(s)));
  const run2 = await runOf(root, step2);
  const planned = await sendIn(run2, root, step2);
  const tpl = ok(await db.from("playbooks").select("template_id").eq("id", step2).single()).template_id;
  const only = { ...chainOf(s, { steps: [{ ...chainOf(s).steps[0], id: root }] }), root_id: root };
  const sent = await sendIn(await runOf(root, step2), root, step2, {
    state: "sent",
    sent_at: iso(Date.now()),
    checked_at: iso(Date.now()),
  });
  refusedWith(await save(only), "23503", REACH_OUT_REFUSALS.stepWrote);
  ok(await db.from("reach_out_sends").delete().eq("id", sent));
  ok(await save(only));
  assert.equal(ok(await db.from("playbooks").select("id").eq("id", step2)).length, 0);
  assert.equal(ok(await db.from("broadcasts").select("state").eq("id", run2).single()).state, "canceled");
  const gone = await sendRow(planned);
  assert.deepEqual([gone.state, gone.reason, gone.playbook_id], ["skipped", "step_removed", null]);
  assert.ok(
    ok(await db.from("templates").select("hidden_at").eq("id", tpl).single()).hidden_at,
    "its words are hidden",
  );
});

test("a search's reach, for any member", { skip }, async () => {
  const s = await newSearch("Movers D");
  await member(s, await lead());
  await member(s, await lead({ email_state: "unknown" }));
  await member(s, await lead({ email: null, email_state: "none", phone_e164: "+15125550123" }));
  const r = ok(await as.viewer.c.rpc("reach_out_reach", { p_tenant_id: A, p_search_id: s }));
  assert.deepEqual([r.of, r.phone_only, r.chain], [3, 1, null]);
  assert.ok(r.ready >= 1 && r.with_unconfirmed >= r.ready);
});

test(
  "an owner's answers to a held email: include past its reason, never past the fortnight; rewrite; skip; not a fit, atomic (R10, R18)",
  { skip },
  async () => {
    const s = await newSearch("Movers E");
    const { root_id: root } = ok(await save(chainOf(s, { steps: [chainOf(s).steps[0]] })));
    const run = await runOf(root, root, "pending_approval");
    const held = (over = {}) =>
      sendIn(run, root, root, {
        state: "held",
        reason: "chain",
        hold_detail: "site:3",
        checked_at: iso(Date.now()),
        ...over,
      });
    const decide = (id, d, c = as.operator.c) => c.rpc("reach_out_send_decide", { p_send_id: id, p_decision: d });

    const inc = await held();
    refusedWith(await decide(inc, "include", as.viewer.c), "P0002", REACH_OUT_REFUSALS.sendNotFound);
    refusedWith(await decide(inc, "archive"), "22023", REACH_OUT_REFUSALS.decision);
    ok(await decide(inc, "include"));
    const i = await sendRow(inc);
    assert.deepEqual([i.state, i.reason, i.included_for], ["planned", null, ["chain"]]);
    refusedWith(await decide(inc, "include"), "22023", REACH_OUT_REFUSALS.includeHeld);

    const down = await held({ reason: "check_unavailable", hold_detail: null });
    refusedWith(await decide(down, "include"), "22023", REACH_OUT_REFUSALS.includeHeld);
    const old = await held({ created_at: iso(Date.now() - 15 * DAY) });
    refusedWith(await decide(old, "include"), "22023", REACH_OUT_REFUSALS.givenUp);

    const re = await held({ reason: "unbacked_fact", hold_detail: "a 5.0", check_gen: 2 });
    ok(await decide(re, "rewrite"));
    const r = await sendRow(re);
    assert.deepEqual([r.state, r.checked_at, r.check_gen], ["planned", null, 3]);
    // Past its fortnight, Rewrite is refused as Include is: one predicate (reach_out_given_up).
    const oldRe = await held({ reason: "unbacked_fact", hold_detail: "a 5.0", created_at: iso(Date.now() - 15 * DAY) });
    refusedWith(await decide(oldRe, "rewrite"), "22023", REACH_OUT_REFUSALS.givenUp);

    const sk = await held();
    ok(await decide(sk, "skip"));
    assert.deepEqual([(await sendRow(sk)).state, (await sendRow(sk)).reason], ["skipped", "owner_skipped"]);

    const fitLead = await lead();
    const fit = await held({ lead_id: fitLead });
    ok(await decide(fit, "not_a_fit"));
    const l = ok(await db.from("leads").select("stage, closed_reason").eq("id", fitLead).single());
    assert.deepEqual([l.stage, l.closed_reason], ["archived", "not_a_fit"]);
    assert.deepEqual([(await sendRow(fit)).state, (await sendRow(fit)).reason], ["skipped", "not_a_fit"]);
    refusedWith(await decide(fit, "skip"), "22023", REACH_OUT_REFUSALS.gone);

    ok(await db.from("broadcasts").update({ state: "canceled" }).eq("id", run));
    refusedWith(await decide(await sendRow(inc).then((x) => x.id), "skip"), "22023", REACH_OUT_REFUSALS.runOver);
  },
);

test("a run's holds the check could not answer go back in one call (R18)", { skip }, async () => {
  const s = await newSearch("Movers F");
  const { root_id: root } = ok(await save(chainOf(s, { steps: [chainOf(s).steps[0]] })));
  const run = await runOf(root, root, "pending_approval");
  const ids = [];
  for (let i = 0; i < 3; i += 1)
    ids.push(
      await sendIn(run, root, root, { state: "held", reason: "check_unavailable", checked_at: iso(Date.now()) }),
    );
  const kept = await sendIn(run, root, root, {
    state: "held",
    reason: "chain",
    hold_detail: "site:3",
    checked_at: iso(Date.now()),
  });
  // An opening that broke a rule is held check_unavailable with its rule: its owner's Rewrite, one at a time.
  const broke = await sendIn(run, root, root, {
    state: "held",
    reason: "check_unavailable",
    hold_detail: "price",
    checked_at: iso(Date.now()),
  });
  const r = ok(await as.operator.c.rpc("reach_out_run_recheck", { p_broadcast_id: run }));
  assert.deepEqual(r, { broadcast_id: run, rechecked: 3 });
  for (const id of ids) assert.equal((await sendRow(id)).state, "planned");
  assert.equal((await sendRow(kept)).state, "held", "a hold for a reason waits for its owner");
  assert.equal((await sendRow(broke)).state, "held", "a rule broken is not the check being down");
  refusedWith(
    await as.viewer.c.rpc("reach_out_run_recheck", { p_broadcast_id: run }),
    "P0002",
    REACH_OUT_REFUSALS.runNotFound,
  );
});

test(
  "a chain's report counts each step once: bounces by the provider's bounce, wrote back and said no by lead; a chain that wrote is paused, never removed (R16, R23)",
  { skip },
  async () => {
    const s = await newSearch("Movers G");
    const {
      root_id: root,
      step_ids: [, step2],
    } = ok(await save(chainOf(s)));
    const run1 = await runOf(root, root);
    const run2 = await runOf(root, step2);
    const fresh = ok(await as.viewer.c.rpc("reach_out_chain_report", { p_tenant_id: A, p_root_id: root }));
    assert.equal(fresh.can_remove, true);

    const contact = await one(
      db.from("contacts").insert({ tenant_id: A, email: `back-${stamp}@fixture-doors.example` }),
    );
    const thread = await one(db.from("conversations").insert({ tenant_id: A, contact_id: contact }));
    const email = async (status, over = {}) =>
      one(
        db.from("messages").insert({
          tenant_id: A,
          conversation_id: thread,
          channel: "email",
          direction: "outbound",
          sender: "ai",
          type: "text",
          body: "Saw your shop.",
          status,
          ...over,
        }),
      );
    const wrote = await lead({ contact_id: contact });
    const saidNo = await lead({ stage: "archived", closed_reason: "said_no" });
    const quiet = await lead();
    const bounced = await lead();
    const at = (d) => iso(Date.now() - d * DAY);
    // Step 1 to all four; step 2 to the one who wrote back and the one who said no (their last sent step).
    await sendIn(run1, root, root, {
      lead_id: wrote,
      contact_id: contact,
      state: "sent",
      sent_at: at(6),
      message_id: await email("delivered"),
    });
    await sendIn(run1, root, root, {
      lead_id: saidNo,
      state: "sent",
      sent_at: at(6),
      message_id: await email("delivered"),
    });
    await sendIn(run1, root, root, { lead_id: quiet, state: "sent", sent_at: at(6), message_id: await email("read") });
    await sendIn(run1, root, root, {
      lead_id: bounced,
      state: "failed",
      message_id: await email("failed", { error: { provider: "bounced" } }),
    });
    await sendIn(run2, root, step2, {
      lead_id: wrote,
      contact_id: contact,
      state: "sent",
      sent_at: at(1),
      message_id: await email("sent"),
    });
    await sendIn(run2, root, step2, {
      lead_id: saidNo,
      state: "sent",
      sent_at: at(1),
      message_id: await email("sent"),
    });
    await sendIn(run2, root, step2, { lead_id: quiet });
    // They wrote back, once.
    ok(
      await db.from("messages").insert({
        tenant_id: A,
        conversation_id: thread,
        channel: "email",
        direction: "inbound",
        sender: "customer",
        type: "text",
        body: "Yes, tell me more.",
        status: "received",
      }),
    );

    const r = ok(await as.viewer.c.rpc("reach_out_chain_report", { p_tenant_id: A, p_root_id: root }));
    const counts = r.steps.map((x) => [
      x.n,
      x.written,
      x.delivered,
      x.bounced,
      x.wrote_back,
      x.said_no,
      x.waiting,
      x.held,
    ]);
    assert.deepEqual(counts, [
      [0, 3, 3, 1, 0, 0, 0, 0],
      [1, 2, 0, 0, 1, 1, 1, 0],
    ]);
    assert.equal(r.runs.length, 2);
    assert.equal(r.can_remove, false);
    refusedWith(
      await as.operator.c.rpc("reach_out_remove", { p_tenant_id: A, p_root_id: root }),
      "23503",
      REACH_OUT_REFUSALS.wrote,
    );
    refusedWith(await as.viewer.c.rpc("reach_out_remove", { p_tenant_id: A, p_root_id: root }), "P0002");
  },
);

test(
  "a chain that never wrote is removed whole: its runs canceled, its words hidden, its rows gone (R16)",
  { skip },
  async () => {
    const s = await newSearch("Movers H");
    const { root_id: root, step_ids } = ok(await save(chainOf(s)));
    const run = await runOf(root, root, "pending_approval");
    await sendIn(run, root, root);
    const tpls = ok(await db.from("playbooks").select("template_id").in("id", step_ids)).map((p) => p.template_id);
    ok(await as.operator.c.rpc("reach_out_remove", { p_tenant_id: A, p_root_id: root }));
    assert.equal(ok(await db.from("playbooks").select("id").in("id", step_ids)).length, 0);
    assert.equal(ok(await db.from("broadcasts").select("state").eq("id", run).single()).state, "canceled");
    for (const t of ok(await db.from("templates").select("hidden_at").in("id", tpls))) assert.ok(t.hidden_at);
    refusedWith(
      await as.operator.c.rpc("reach_out_remove", { p_tenant_id: A, p_root_id: root }),
      "P0002",
      REACH_OUT_REFUSALS.notFound,
    );
  },
);

test("a session deletes moments only: a chain's rows go through its door (R16)", { skip }, async () => {
  const s = await newSearch("Movers I");
  const { root_id: root } = ok(await save(chainOf(s)));
  const gone = await as.operator.c.from("playbooks").delete({ count: "exact" }).eq("id", root);
  assert.equal(gone.error, null);
  assert.equal(gone.count, 0, "RLS hides the row from the delete");
  assert.equal(ok(await db.from("playbooks").select("id").eq("id", root)).length, 1);
});

test(
  "the one reset: from a named state only, and never past a send's fortnight (R10, the sender's guard)",
  { skip },
  async () => {
    const s = await newSearch("Movers J");
    const { root_id: root } = ok(await save(chainOf(s, { steps: [chainOf(s).steps[0]] })));
    const run = await runOf(root, root);
    const planned = await sendIn(run, root, root, { checked_at: iso(Date.now()), check_gen: 1 });
    // The sender names "claimed": a send that is not claimed (another tick moved it) is left as it is.
    assert.equal(
      ok(await db.rpc("reach_out_recheck", { p_send_ids: [planned], p_tenant_id: A, p_from_state: "claimed" })),
      0,
    );
    assert.equal((await sendRow(planned)).check_gen, 1);
    assert.equal(ok(await db.rpc("reach_out_recheck", { p_send_ids: [planned], p_tenant_id: A })), 1);
    const old = await sendIn(run, root, root, { checked_at: iso(Date.now()), created_at: iso(Date.now() - 15 * DAY) });
    assert.equal(ok(await db.rpc("reach_out_recheck", { p_send_ids: [old], p_tenant_id: A })), 0);
    const o = await sendRow(old);
    assert.deepEqual([o.state, o.reason], ["skipped", "kept_waiting"], "given up, never planned again");
    assert.equal(ok(await db.rpc("reach_out_given_up", { p_created_at: iso(Date.now() - 13 * DAY) })), false);
  },
);

test("wrote back is one reading, asked for many at once or for one by the send door", { skip }, async () => {
  const wrote = await one(db.from("contacts").insert({ tenant_id: A, email: `wrote-${stamp}@fixture-doors.example` }));
  const quiet = await one(db.from("contacts").insert({ tenant_id: A, email: `quiet-${stamp}@fixture-doors.example` }));
  const thread = await one(db.from("conversations").insert({ tenant_id: A, contact_id: wrote }));
  ok(
    await db.from("messages").insert({
      tenant_id: A,
      conversation_id: thread,
      channel: "email",
      direction: "inbound",
      sender: "customer",
      type: "text",
      body: "Yes please.",
      status: "received",
    }),
  );
  const many = ok(await db.rpc("outreach_wrote_back", { p_tenant_id: A, p_contact_ids: [wrote, quiet] }));
  assert.deepEqual(many, [wrote]);
  for (const [c, want] of [
    [wrote, true],
    [quiet, false],
  ]) {
    const f = ok(await db.rpc("outreach_lead_facts", { p_tenant_id: A, p_contact_id: c, p_to: "x@example.com" }));
    assert.equal(f.wrote_back, want);
  }
  assert.ok(
    (await as.operator.c.rpc("outreach_wrote_back", { p_tenant_id: A, p_contact_ids: [wrote] })).error,
    "the service role's",
  );
});

test("a chain renamed renames its words in Templates too", { skip }, async () => {
  const s = await newSearch("Movers K");
  const { root_id: root, step_ids } = ok(await save(chainOf(s)));
  const edit = { ...chainOf(s, { name: "Reach out · Office movers" }), root_id: root };
  edit.steps = edit.steps.map((x, i) => ({ ...x, id: step_ids[i] }));
  ok(await save(edit));
  const tpls = ok(await db.from("playbooks").select("n:name, template_id").in("id", step_ids));
  const titles = ok(
    await db
      .from("templates")
      .select("title")
      .in(
        "id",
        tpls.map((t) => t.template_id),
      ),
  ).map((t) => t.title);
  assert.deepEqual(titles.sort(), ["Reach out · Office movers · a nudge", "Reach out · Office movers · your email"]);
});

test("a step's sends are read by their step, not by walking every workspace's", { skip }, async () => {
  const rows = query(
    "select indexdef from pg_indexes where schemaname = 'public' and indexname = 'reach_out_sends_step'",
  );
  assert.equal(rows.length, 1);
  assert.match(rows[0].indexdef, /\(playbook_id, state\)/);
});

test(
  "a partner acts as main's one table says (00201): saves a chain, answers its emails and removes one that never wrote",
  { skip },
  async () => {
    const s = await newSearch("Movers P");
    const { root_id: root } = ok(await save(chainOf(s, { steps: [chainOf(s).steps[0]] }), as.partner.id));
    const run = await runOf(root, root, "pending_approval");
    const id = await sendIn(run, root, root, {
      state: "held",
      reason: "chain",
      hold_detail: "site:3",
      checked_at: iso(Date.now()),
    });
    ok(await as.partner.c.rpc("reach_out_send_decide", { p_send_id: id, p_decision: "skip" }));
    assert.equal((await sendRow(id)).reason, "owner_skipped");
    ok(await as.partner.c.rpc("reach_out_remove", { p_tenant_id: A, p_root_id: root }));
    assert.equal(ok(await db.from("playbooks").select("id").eq("id", root)).length, 0);
  },
);
