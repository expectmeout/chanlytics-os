/**
 * Reach out, end to end, on a replayed stack (Part 3's proof): one workspace, one chain (a first email, and a nudge
 * three days on), one lead search, one own domain. Every step runs the real code over the real database, with only
 * the mail provider's HTTP stubbed:
 *
 *   1. the step's run (the edge's run context and core runReachOut) plans a first run that waits for its owner, with
 *      the two leads it may write to, never the one whose address a person already has, and tells the owner;
 *   2. the owner approves it (core approveRun with the dashboard's own ports);
 *   3. the clock claims both and writes them: two people made (their leads stay ready), two queued rows naming their
 *      leads, two outbound_send jobs;
 *   4. the jobs send them through the one door, from the own domain on the cold key, each unsubscribe sealed for its
 *      person, marked auto-generated;
 *   5. their receipts stamp the Message-IDs, and the clock reads them sent: both leads written to (nurture, emailed);
 *   6. three days on, the nudge: the lead who wrote back is not written to; the other is, "Re:" and threaded under
 *      the first email;
 *   7. the nudge bounces for good: its lead's address is invalid, and its run waits on it;
 *   8. the clock reads the bounce and finishes the nudge's run (the first run finished at 5);
 *   9. at the domain's day's share, a due send is not claimed, and a cold email written at it by hand is refused at
 *      the door as sending_domain_at_cap and planned again by the clock, never skipped.
 *
 * Each tick checks before it claims (Part 4): the check's own tick (lib/reach-out/check.ts) runs first, over a model
 * that is never asked, since these words name no opening; the claim takes only what it checked.
 *
 * The second test is Part 4's proof, from the sheet's door, in a workspace of its own and from its owner's session:
 *
 *   1. reach_out_save makes a two-step chain whose words name {{opening}}, {{your name}} and {{booking link}}, over a
 *      search with two ready businesses, one of which shares its website with two more of the workspace's leads;
 *   2. runReachOutStep (what Start asks through the run-now door) plans the first run, which waits for its owner;
 *   3. the check's tick (checkSends), over a scripted model, writes and reads an opening for each: one is planned with
 *      its opening, the other held `chain`;
 *   4. the dashboard's reachOutRunOf, on the owner's session, answers one for today, one held with its words, and the
 *      first email as it reads, its opening in;
 *   5. reach_out_send_decide(include) puts the held one back, checked, its opening kept;
 *   6. approved, ticked and its jobs run: both emails leave, each body opening with its own sentence and ending with the
 *      name it signs with, the booking link filled in;
 *   7. reach_out_remove is refused: the chain wrote.
 *
 * Each is kept to its own workspace (every clock and claim call takes it). Local stack only: they make workspaces and
 * users.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { emailReceiptFrom, verifyUnsubscribeToken } from "@chanlytics/channels";
import { REACH_OUT_REFUSALS, ReachOutChainSchema, holdWords, validateReachOutChain } from "@chanlytics/contracts";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite makes workspaces"
      : false;
const ANON = process.env.SUPABASE_ANON_KEY;
const skipSheet = skip || (!ANON ? "no SUPABASE_ANON_KEY in env: the owner this proof signs in as needs it" : false);

// The deployment's email, for this process: the platform's and the cold account's keys (the fetch below answers for
// both), the mail domain the replies come back on, the seal. Made-up values.
process.env.EMAIL_DOMAIN = "mail.chanlytics.com";
process.env.RESEND_API_KEY = "platform-key-for-this-suite";
process.env.RESEND_COLD_API_KEY = "cold-key-for-this-suite";
process.env.RESEND_COLD_WEBHOOK_SECRET = "cold-webhook-for-this-suite";
const SEAL = "unsubscribe-seal-for-this-suite";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const MIN = 60_000;
const DAY = 86_400_000;
const stamp = Date.now().toString(36);
const iso = (ms) => new Date(ms).toISOString();
const HOST = `e2e-${stamp}.example`;
const LANE = {
  unsubscribeSecret: SEAL,
  unsubscribeOrigin: "https://app.chanlytics.com",
  replyDomain: "mail.chanlytics.com",
};

let db;
let A;
let user;
let root;
let step;
let search;
let domain;
let lib;
let dash;
let L;
const leads = {};
const ok = (res) => {
  assert.equal(res.error, null, res.error?.message);
  return res.data;
};
const one = async (q) => ok(await q.select("id").single()).id;

/**
 * Every send to the mail provider, answered as it answers one, its id kept by the row its tag names. Any other call
 * to the provider fails the suite: nothing else here may reach it.
 */
const sent = [];
const providerIdOf = new Map();
const realFetch = globalThis.fetch;
function stubProvider() {
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    if (u === "https://api.resend.com/emails" && init?.method === "POST") {
      const body = JSON.parse(init.body);
      sent.push({ key: init.headers.Authorization, idempotency: init.headers["Idempotency-Key"], body });
      const id = `re_${sent.length}`;
      providerIdOf.set(body.tags?.find((t) => t.name === "cl_message")?.value, id);
      return new Response(JSON.stringify({ id }), { status: 200 });
    }
    if (u.startsWith("https://api.resend.com")) throw new Error(`the suite does not answer ${init?.method} ${u}`);
    return realFetch(url, init);
  };
}
const coldSent = () => sent.filter((s) => s.key === `Bearer ${process.env.RESEND_COLD_API_KEY}`);

/** A receipt, as the webhook hands it on: the provider's id for the email, and its tags naming the row. */
const receipt = (type, m, over = {}) =>
  emailReceiptFrom({
    type: `email.${type}`,
    created_at: iso(Date.now()),
    data: {
      email_id: providerIdOf.get(m.id) ?? assert.fail(`the provider never took ${m.id}`),
      message_id: `<${m.id}@${HOST}>`,
      from: m.meta.email.request.from,
      to: m.meta.email.request.to,
      subject: m.meta.email.request.subject,
      tags: { cl_message: m.id, cl_tenant: A },
      ...over,
    },
  });

async function sendsOf(runId) {
  return ok(await db.from("reach_out_sends").select("*").eq("broadcast_id", runId));
}
async function leadOf(id) {
  return ok(await db.from("leads").select("*").eq("id", id).single());
}
/** The workspace's send jobs, taken as the runner takes them (fired, leased) in one update, run, and marked done. */
async function runJobs(tenantId = A) {
  const now = Date.now();
  const jobs = ok(
    await db
      .from("jobs")
      .update({ state: "fired", fired_at: iso(now), lease_until: iso(now + MIN) })
      .eq("tenant_id", tenantId)
      .eq("kind", "outbound_send")
      .eq("state", "scheduled")
      .select("*"),
  );
  const wire = { email: await lib.emailWireFor(db, tenantId) };
  for (const j of jobs) {
    await lib.dispatchJob(
      { db, wire, alert: async () => {}, schedule: async () => {}, deadline: Date.now() + 60_000 },
      { id: j.id, tenant_id: j.tenant_id, kind: j.kind, payload: j.payload },
    );
    ok(await db.from("jobs").update({ state: "done" }).eq("id", j.id));
  }
  return jobs.length;
}
/** No model: these words name no opening, so the check asks nothing, and a call would be a failure here. */
const noModel = async () => {
  throw new Error("the check asked a model about words that name no opening");
};
const tick = async (now = new Date()) => {
  const checked = await lib.checkSends({ db, now, started: Date.now(), log: L, tenantId: A, ask: noModel });
  assert.deepEqual([checked.calls, checked.errors], [0, 0], JSON.stringify(checked));
  await lib.reachOutClock(db, now, L, Date.now(), A);
  return lib.claimAndWrite({ db, now, started: Date.now(), lane: LANE, log: L, tenantId: A });
};

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  stubProvider();
  lib = {
    ...(await import(at("apps/edge/lib/reach-out/run-context.ts"))),
    ...(await import(at("apps/edge/lib/reach-out/run-step.ts"))),
    ...(await import(at("apps/edge/lib/reach-out/clock.ts"))),
    ...(await import(at("apps/edge/lib/reach-out/check.ts"))),
    ...(await import(at("apps/edge/lib/reach-out/sender.ts"))),
    ...(await import(at("apps/edge/lib/reach-out/request.ts"))),
    ...(await import(at("apps/edge/lib/email/email.ts"))),
    ...(await import(at("apps/edge/lib/email/email-receipts.ts"))),
    ...(await import(at("apps/dashboard/src/server/ports/campaign-ports.ts"))),
    ...(await import(at("packages/core/dist/index.js"))),
    ...(await import(at("packages/jobs/dist/index.js"))),
    ...(await import(at("packages/db/dist/index.js"))),
  };
  // The dashboard's own reads behind the approval sheet (GET broadcasts/[id]'s reach_out block).
  dash = await import(at("apps/dashboard/src/server/campaigns/reach-outs.ts"));
  L = (await import(at("apps/edge/lib/log.ts"))).logger({ suite: "reach_out_e2e" });

  A = await one(
    db.from("tenants").insert({ slug: `e2e-${stamp}`, name: "Harbor Moving Co", timezone: "America/Chicago" }),
  );
  const email = `owner-${stamp}@fixture-e2e.example`;
  user = ok(await db.auth.admin.createUser({ email, password: `pw-${stamp}-Aa1!`, email_confirm: true })).user.id;
  ok(await db.from("memberships").insert({ tenant_id: A, user_id: user, role: "owner" }));
  ok(await db.from("billing_accounts").upsert({ tenant_id: A, mode: "direct", status: "active" }));
  ok(
    await db
      .from("policies")
      .upsert(
        { tenant_id: A, class: "outreach", mode: "veto", limits: {} },
        { onConflict: "tenant_id,class,subject_type,subject_id" },
      ),
  );
  ok(
    await db.from("tenant_config").upsert({
      tenant_id: A,
      config: {
        notifications: { escalation_emails: [email] },
        brain: {
          business_name: "Harbor Moving Co",
          system_prompt: "You answer for Harbor Moving Co, a moving company in Austin, Texas.",
          fallbacks: { greeting: "g", error: "e", non_text: "n" },
          profile: { address: "100 Example St, Austin, TX 78701" },
        },
      },
    }),
  );
  const token = Array.from(
    crypto.getRandomValues(new Uint8Array(24)),
    (b) => "abcdefghijklmnopqrstuvwxyz234567"[b % 32],
  ).join("");
  ok(
    await db
      .from("mailboxes")
      .insert({ tenant_id: A, local_part: `e2e-${stamp}`, reply_token: token, from_name: "Harbor Moving Co" }),
  );
  domain = await one(
    db.from("sending_domains").insert({
      tenant_id: A,
      host: HOST,
      from_local: "sam",
      from_name: "Sam at Harbor",
      state: "verified",
      provider_status: "verified",
      dmarc: "found",
      verified_at: iso(Date.now() - 40 * DAY),
      clean_since: iso(Date.now() - 40 * DAY),
      counted_since: iso(Date.now() - 40 * DAY),
      provider_domain_id: `pd-${stamp}`,
    }),
  );
  search = await one(
    db
      .from("lead_searches")
      .insert({ tenant_id: A, via: "people", card: "movers", name: "Movers", asked: "movers", plan: {} }),
  );
  const template = (name, components) =>
    one(
      db.from("templates").insert({
        tenant_id: A,
        channel: "email",
        source: "chanlytics",
        name: `${name}_${stamp}`,
        language: "en",
        category: "marketing",
        meta_status: "approved",
        components,
      }),
    );
  const first = await template("reach_first", [
    { type: "HEADER", format: "TEXT", text: "A moving quote for {{business}}" },
    { type: "BODY", text: "Hi {{business}}, movers in {{city}} ask us for quotes like yours." },
  ]);
  const nudge = await template("reach_nudge", [{ type: "BODY", text: "Just following up, {{business}}." }]);
  const chain = {
    tenant_id: A,
    kind: "reach_out",
    policy_class: "outreach",
    gap_minutes: 5,
    template_language: "en",
    params: [],
  };
  root = await one(
    db.from("playbooks").insert({
      ...chain,
      name: "Movers",
      trigger: "lead_first",
      lead_search_id: search,
      template_id: first,
      template_name: `reach_first_${stamp}`,
    }),
  );
  step = await one(
    db.from("playbooks").insert({
      ...chain,
      name: "Movers, a nudge",
      trigger: "after_step",
      after_playbook_id: root,
      after_days: 3,
      template_id: nudge,
      template_name: `reach_nudge_${stamp}`,
    }),
  );
  // Three qualified members: Texas, California, and one whose address a person in People already has. The person is
  // there first, so the lead is found and stays ready: only the run's own rule keeps it out.
  ok(await db.from("contacts").insert({ tenant_id: A, email: `owner@dallas-movers-${stamp}.example` }));
  const lead = async (key, region, city, emailAddress) => {
    leads[key] = await one(
      db.from("leads").insert({
        tenant_id: A,
        place_id: `ChIJfixtureE2E${stamp}${key}`,
        business_name: `${city} Movers`,
        city,
        region,
        email: emailAddress,
        email_state: "ok",
        stage: "ready",
      }),
    );
    ok(
      await db.from("lead_search_members").insert({
        tenant_id: A,
        search_id: search,
        lead_id: leads[key],
        class: "qualified",
        counted: true,
        counted_month: new Date().toISOString().slice(0, 7),
        fit: "strong",
        judgment: {},
      }),
    );
  };
  await lead("tx", "TX", "Austin", `owner@austin-movers-${stamp}.example`);
  await lead("ca", "CA", "Fresno", `owner@fresno-movers-${stamp}.example`);
  await lead("customer", "TX", "Dallas", `owner@dallas-movers-${stamp}.example`);
});
after(async () => {
  globalThis.fetch = realFetch;
  if (skip) return;
  if (A) ok(await db.from("tenants").delete().eq("id", A));
  if (user) await db.auth.admin.deleteUser(user);
});

const playbook = async (id) => ok(await db.from("playbooks").select("*").eq("id", id).single());
const runOf = async (stepId) =>
  ok(await db.from("broadcasts").select("*").eq("tenant_id", A).eq("playbook_id", stepId).single());
const stepRun = async (stepId) => {
  const now = new Date();
  const ctx = await lib.reachOutRunContext(db, await playbook(stepId), now);
  assert.ok(!("error" in ctx), JSON.stringify(ctx));
  const runFor = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(now);
  return lib.runReachOut(ctx.ports, ctx.step, { runFor });
};
const due = async (runId) => {
  for (const s of await sendsOf(runId))
    if (s.state === "planned")
      ok(
        await db
          .from("reach_out_sends")
          .update({ send_at: iso(Date.now() - MIN) })
          .eq("id", s.id),
      );
};

test(
  "a reach-out, end to end: planned, approved, claimed, sent, read, nudged, bounced, finished, held at its cap",
  { skip },
  async () => {
    // 1. The first step's run: planned whole, waiting for its owner, who is told.
    const customer = await leadOf(leads.customer);
    assert.deepEqual(
      [customer.stage, customer.contact_id],
      ["ready", null],
      "the customer's lead is still one to write",
    );
    const r1 = await stepRun(root);
    assert.deepEqual([r1.outcome, r1.reason, r1.planned], ["held", "waiting_for_you", 2]);
    const run1 = await runOf(root);
    assert.equal(run1.state, "pending_approval");
    const planned1 = await sendsOf(run1.id);
    assert.deepEqual(planned1.map((s) => s.lead_id).sort(), [leads.tx, leads.ca].sort(), "never a customer's address");
    const told = ok(await db.from("notifications").select("title").eq("tenant_id", A));
    assert.ok(
      told.some((n) => n.title.startsWith("A reach-out waits for you")),
      JSON.stringify(told),
    );

    // 2. Approved, with the dashboard's own ports; its sends made due.
    const ctx = { supabase: db, userId: user, email: undefined, metadata: {} };
    const approved = await lib.approveRun(lib.approveRunPorts(ctx, A), { row: run1, now: new Date() });
    assert.equal(approved.state, "scheduled");
    await due(run1.id);

    // 3. The clock claims both, makes their people, writes their emails and jobs. The leads stay ready.
    const c3 = await tick();
    assert.deepEqual([c3.claimed, c3.written, c3.errors], [2, 2, 0]);
    const queued = await sendsOf(run1.id);
    assert.deepEqual(
      queued.map((s) => s.state),
      ["queued", "queued"],
    );
    for (const s of queued) {
      const lead = await leadOf(s.lead_id);
      assert.deepEqual([lead.stage, lead.contact_id], ["ready", s.contact_id], "a person made, the lead not converted");
      const m = ok(await db.from("messages").select("*").eq("id", s.message_id).single());
      assert.deepEqual([m.status, m.meta.reach_out.lead_id], ["queued", s.lead_id]);
    }

    // 4. The jobs send them through the door: the own domain, the cold key, each unsubscribe sealed for its person.
    assert.equal(await runJobs(), 2);
    const first = coldSent();
    assert.equal(first.length, 2);
    for (const s of first) {
      assert.match(s.body.from, new RegExp(`<sam@${HOST.replace(/\./g, "\\.")}>$`));
      assert.equal(s.body.headers["Auto-Submitted"], "auto-generated");
      const tokenOf = /\/u\/([A-Za-z0-9_-]{87})>$/.exec(s.body.headers["List-Unsubscribe"])[1];
      const claims = verifyUnsubscribeToken([SEAL], tokenOf);
      const send = queued.find((q) => q.message_id === claims.messageId);
      assert.deepEqual(
        [claims.tenantId, claims.contactId],
        [A, send.contact_id],
        "sealed for its person and its email",
      );
    }

    // 5. Their receipts, then the clock: both sent, both leads written to.
    for (const s of queued) {
      const m = ok(await db.from("messages").select("*").eq("id", s.message_id).single());
      assert.equal(m.status, "sent");
      for (const type of ["sent", "delivered"])
        assert.equal(await lib.applyEmailReceipt(db, receipt(type, m), iso(Date.now())), "applied");
    }
    await tick();
    for (const s of await sendsOf(run1.id)) {
      assert.equal(s.state, "sent");
      const lead = await leadOf(s.lead_id);
      assert.deepEqual([lead.stage, lead.last_outcome], ["nurture", "emailed"]);
    }
    const state = async (id) => ok(await db.from("broadcasts").select("state").eq("id", id).single()).state;
    assert.equal(await state(run1.id), "sent", "the first run finished: every send in it went");

    // 6. Three days on. The Texas business wrote back, answering the first email: it is not written to again. The
    // California one is, as the same thread.
    for (const s of await sendsOf(run1.id))
      ok(
        await db
          .from("reach_out_sends")
          .update({ sent_at: iso(Date.now() - 4 * DAY) })
          .eq("id", s.id),
      );
    const tx = queued.find((s) => s.lead_id === leads.tx);
    const txEmail = ok(await db.from("messages").select("*").eq("id", tx.message_id).single());
    ok(
      await db.from("messages").insert({
        tenant_id: A,
        conversation_id: txEmail.conversation_id,
        contact_id: tx.contact_id,
        channel: "email",
        direction: "inbound",
        sender: "customer",
        type: "text",
        body: "No thanks, we have a mover.",
        status: "received",
        meta: {
          email: {
            from: `owner@austin-movers-${stamp}.example`,
            in_reply_to: txEmail.meta.email.message_id,
            claim: "person",
          },
        },
      }),
    );
    const r6 = await stepRun(step);
    assert.deepEqual([r6.outcome, r6.planned], ["sent", 1], "a later run under veto goes ahead on its own");
    const run2 = await runOf(step);
    const nudges = await sendsOf(run2.id);
    assert.deepEqual(
      nudges.filter((s) => s.state === "planned").map((s) => s.lead_id),
      [leads.ca],
    );
    await due(run2.id);
    const c6 = await tick();
    assert.equal(c6.written, 1);
    assert.equal(await runJobs(), 1);
    const nudge = coldSent().at(-1).body;
    const ca = queued.find((s) => s.lead_id === leads.ca);
    const caEmail = ok(await db.from("messages").select("*").eq("id", ca.message_id).single());
    assert.equal(nudge.subject, `Re: ${caEmail.meta.email.request.subject}`);
    assert.equal(nudge.headers["In-Reply-To"], caEmail.meta.email.message_id);

    // 7. The nudge bounces for good: the California lead's address is invalid.
    const [nudgeSend] = (await sendsOf(run2.id)).filter((s) => s.state === "queued");
    const nudgeRow = ok(await db.from("messages").select("*").eq("id", nudgeSend.message_id).single());
    const bounce = { bounce: { type: "Permanent", subType: "General", message: "550 5.1.1 no such user" } };
    assert.equal(await lib.applyEmailReceipt(db, receipt("bounced", nudgeRow, bounce), iso(Date.now())), "applied");
    assert.equal((await leadOf(leads.ca)).email_state, "invalid");
    assert.equal(await state(run2.id), "sending", "the nudge's run waits on its one open send");

    // 8. The clock reads the bounce (its send failed), then finishes the nudge's run; the first stays finished.
    await tick();
    await tick();
    const after = ok(await db.from("reach_out_sends").select("state, reason").eq("id", nudgeSend.id).single());
    assert.deepEqual([after.state, after.reason], ["failed", "bounced"]);
    for (const id of [run1.id, run2.id]) assert.equal(await state(id), "sent", id);

    // 9. At the domain's day's share (30 on its first ramp step: the three above, and twenty-seven more): a due send is
    // not claimed; one written at the share by hand is refused at the door, and the clock plans it again, never skips it.
    const other = await one(db.from("contacts").insert({ tenant_id: A, email: `bulk-${stamp}@fixture-e2e.example` }));
    const thread = await one(db.from("conversations").insert({ tenant_id: A, contact_id: other }));
    ok(
      await db.from("messages").insert(
        Array.from({ length: 27 }, () => ({
          tenant_id: A,
          conversation_id: thread,
          contact_id: other,
          channel: "email",
          direction: "outbound",
          sender: "human",
          type: "text",
          body: "Earlier today.",
          status: "sent",
          meta: {
            source: "reach_out",
            email: { request: { from: `"Sam at Harbor" <sam@${HOST}>`, to: [`bulk-${stamp}@fixture-e2e.example`] } },
            status_at: { sent: iso(Date.now() - 60 * MIN) },
          },
        })),
      ),
    );
    const late = await one(
      db.from("leads").insert({
        tenant_id: A,
        place_id: `ChIJfixtureE2E${stamp}late`,
        business_name: "Waco Movers",
        city: "Waco",
        region: "TX",
        email: `owner@waco-movers-${stamp}.example`,
        email_state: "ok",
        stage: "ready",
      }),
    );
    const run3 = crypto.randomUUID();
    const sendId = crypto.randomUUID();
    ok(
      await db.rpc("reach_out_plan_run", {
        p_run: {
          id: run3,
          tenant_id: A,
          playbook_id: root,
          run_for: "2099-01-01",
          name: "Movers · 2099-01-01",
          template_id: (await playbook(root)).template_id,
          template_name: `reach_first_${stamp}`,
          template_language: "en",
          state: "scheduled",
          scheduled_for: iso(Date.now()),
          recipient_count: 1,
          audience: { kind: "reach_out", root_id: root, step_id: root, search_id: search },
        },
        p_sends: [
          {
            id: sendId,
            lead_id: late,
            contact_id: null,
            domain_id: domain,
            send_at: iso(Date.now() - MIN),
            state: "planned",
            reason: null,
          },
        ],
      }),
    );
    // The three emails above were stamped by the database's clock, which may run a moment ahead of this machine's: the
    // claim reads the day from a moment past the last of them, or it could miss one and claim into the share.
    const { last_sent_at } = ok(
      await db.rpc("sending_domain_capacity", { p_domain_id: domain, p_at: iso(Date.now() + MIN) }),
    );
    const c9 = await tick(new Date(Math.max(Date.now(), Date.parse(last_sent_at) + 1)));
    assert.equal(c9.claimed, 0, "the domain's day is spent: nothing is claimed");
    // By hand, at the share: the send claimed and its email written as the writer writes one.
    ok(
      await db
        .from("reach_out_sends")
        .update({ state: "claimed", claimed_at: iso(Date.now()) })
        .eq("id", sendId),
    );
    const person = ok(await db.rpc("reach_out_person", { p_tenant_id: A, p_lead_id: late }));
    const messageId = await lib.sendMessageId(sendId, 0);
    const r = lib.reachOutRequest({
      tenantId: A,
      messageId,
      contactId: person.contact_id,
      to: `owner@waco-movers-${stamp}.example`,
      words: { subject: "A moving quote for {{business}}", body: "Hi {{business}}." },
      lead: { business_name: "Waco Movers", city: "Waco" },
      workspace: { businessName: "Harbor Moving Co", address: "100 Example St, Austin, TX 78701" },
      domain: { host: HOST, from_local: "sam", from_name: "Sam at Harbor" },
      mailbox: { reply_token: (await lib.mailboxOfTenant(db, A)).reply_token },
      replyDomain: "mail.chanlytics.com",
      unsubscribe: { secret: SEAL, origin: LANE.unsubscribeOrigin },
      parent: null,
    });
    assert.equal(r.ok, true);
    ok(
      await db.from("messages").insert({
        id: messageId,
        tenant_id: A,
        conversation_id: person.conversation_id,
        contact_id: person.contact_id,
        channel: "email",
        direction: "outbound",
        sender: "human",
        type: "text",
        body: r.body,
        status: "queued",
        meta: {
          source: "reach_out",
          email: { subject: r.subject, to: r.request.to, request: r.request },
          reach_out: { lead_id: late, send_id: sendId },
        },
      }),
    );
    await lib.scheduleJob(db, {
      tenantId: A,
      kind: "outbound_send",
      dueAt: new Date(),
      payload: {
        message_id: messageId,
        conversation_id: person.conversation_id,
        to_email: `owner@waco-movers-${stamp}.example`,
        purpose: "outreach",
        proactive: true,
      },
    });
    ok(
      await db
        .from("reach_out_sends")
        .update({ state: "queued", message_id: messageId, contact_id: person.contact_id })
        .eq("id", sendId),
    );
    const before9 = coldSent().length;
    await runJobs();
    assert.equal(coldSent().length, before9, "nothing leaves once the share is spent");
    const refused = ok(await db.from("messages").select("status, error").eq("id", messageId).single());
    assert.deepEqual([refused.status, refused.error], ["canceled", { reason: "sending_domain_at_cap" }]);
    await tick();
    const waiting = ok(
      await db.from("reach_out_sends").select("state, reason, attempts, message_id").eq("id", sendId).single(),
    );
    assert.deepEqual(
      [waiting.state, waiting.reason, waiting.attempts, waiting.message_id],
      ["planned", null, 1, null],
      "planned again, its next email a new one: a wait, never an end",
    );
  },
);

/* ---- Part 4's proof: from the sheet's door to two emails, each with its own opening ---- */

let B;
const bUsers = [];
after(async () => {
  if (skipSheet) return;
  if (B) ok(await db.from("tenants").delete().eq("id", B));
  for (const u of bUsers) await db.auth.admin.deleteUser(u);
});

const BOOKING = "https://book.example.com/harbor";
const SIGNED = "Sam";
/** What the scripted writer says of each business, by its name in the record: an opening, an angle, the facts used. */
const OPENINGS = {
  "Austin Movers": {
    opening: "Saw Austin Movers is rated 4.8 by customers in Austin.",
    angle: "their rating",
    facts_used: ["rating", "city"],
  },
  "Fresno Movers": {
    opening: "Saw Fresno Movers is a moving company in Fresno.",
    angle: "their trade",
    facts_used: ["category", "city"],
  },
};

/**
 * The model, scripted: the writer answers each business's opening by the name its record gives; the reader finds it
 * backed, no pitch, in English. Every call is kept, so the proof counts what the check asked.
 */
function scriptedModel() {
  const calls = [];
  const ask = async (system, user, schema) => {
    const writer = "opening" in (schema.properties ?? {});
    const name = /^name: (.+)$/m.exec(user)?.[1]?.trim();
    calls.push({ writer, name });
    if (!writer)
      return { answer: { backed: true, unbacked: "", pitch: false, language: "en" }, tokens: { input: 1, output: 1 } };
    const o = OPENINGS[name] ?? assert.fail(`the writer was asked about a business the proof does not know: ${name}`);
    return { answer: o, tokens: { input: 1, output: 1 } };
  };
  return { ask, calls };
}

test(
  "Part 4, end to end from the sheet's door: saved, planned, checked, held, read, included, approved, sent with their openings, not removable",
  { skip: skipSheet },
  async () => {
    const HOST_B = `e2e-sheet-${stamp}.example`;
    B = await one(
      db.from("tenants").insert({ slug: `e2e-sheet-${stamp}`, name: "Harbor Moving Co", timezone: "America/Chicago" }),
    );
    // The owner, signed in: the session the sheet, the approval sheet and a held email's doors run on.
    const email = `owner-sheet-${stamp}@fixture-e2e.example`;
    const password = `pw-${stamp}-sheet-Aa1!`;
    const owner = ok(await db.auth.admin.createUser({ email, password, email_confirm: true })).user.id;
    bUsers.push(owner);
    ok(await db.from("memberships").insert({ tenant_id: B, user_id: owner, role: "owner" }));
    const session = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
    ok(await session.auth.signInWithPassword({ email, password }));
    const ctx = { supabase: session, userId: owner, email, metadata: {} };

    ok(await db.from("billing_accounts").upsert({ tenant_id: B, mode: "direct", status: "active" }));
    ok(
      await db
        .from("policies")
        .upsert(
          { tenant_id: B, class: "outreach", mode: "veto", limits: {} },
          { onConflict: "tenant_id,class,subject_type,subject_id" },
        ),
    );
    ok(
      await db.from("tenant_config").upsert({
        tenant_id: B,
        config: {
          brain: {
            business_name: "Harbor Moving Co",
            system_prompt: "You answer for Harbor Moving Co, a moving company in Austin, Texas.",
            fallbacks: { greeting: "g", error: "e", non_text: "n" },
            booking_link: BOOKING,
            profile: { address: "100 Example St, Austin, TX 78701" },
          },
        },
      }),
    );
    const token = Array.from(
      crypto.getRandomValues(new Uint8Array(24)),
      (b) => "abcdefghijklmnopqrstuvwxyz234567"[b % 32],
    ).join("");
    ok(
      await db
        .from("mailboxes")
        .insert({ tenant_id: B, local_part: `e2e-sheet-${stamp}`, reply_token: token, from_name: "Harbor Moving Co" }),
    );
    ok(
      await db.from("sending_domains").insert({
        tenant_id: B,
        host: HOST_B,
        from_local: "sam",
        from_name: "Sam at Harbor",
        state: "verified",
        provider_status: "verified",
        dmarc: "found",
        verified_at: iso(Date.now() - 40 * DAY),
        clean_since: iso(Date.now() - 40 * DAY),
        counted_since: iso(Date.now() - 40 * DAY),
        provider_domain_id: `pd-sheet-${stamp}`,
      }),
    );
    const s = await one(
      db
        .from("lead_searches")
        .insert({ tenant_id: B, via: "people", card: "movers", name: "Movers", asked: "movers", plan: {} }),
    );
    // Two ready businesses in the search. Fresno's website is shared by two more of the workspace's leads, found by
    // another search: three listings, one site, so it reads like a chain (F4).
    const ids = {};
    let n = 0;
    const leadIn = async (name, over, member) => {
      n += 1;
      const id = await one(
        db.from("leads").insert({
          tenant_id: B,
          place_id: `ChIJfixtureSheet${stamp}${n}`,
          business_name: name,
          category: "Moving company",
          region: over.region ?? "TX",
          email_state: "ok",
          stage: "ready",
          ...over,
        }),
      );
      if (member)
        ok(
          await db.from("lead_search_members").insert({
            tenant_id: B,
            search_id: s,
            lead_id: id,
            class: "qualified",
            counted: true,
            counted_month: new Date().toISOString().slice(0, 7),
            fit: "strong",
            judgment: {},
          }),
        );
      return id;
    };
    const fresnoSite = `fresno-movers-${stamp}.example`;
    ids.austin = await leadIn(
      "Austin Movers",
      {
        city: "Austin",
        rating: 4.8,
        website_host: `austin-movers-${stamp}.example`,
        email: `owner@austin-movers-${stamp}.example`,
      },
      true,
    );
    ids.fresno = await leadIn(
      "Fresno Movers",
      { city: "Fresno", region: "CA", website_host: fresnoSite, email: `owner@fresno-movers-${stamp}.example` },
      true,
    );
    for (const [name, city] of [
      ["Clovis Relocation", "Clovis"],
      ["Madera Relocation", "Madera"],
    ])
      await leadIn(name, { city, region: "CA", website_host: `www.${fresnoSite}`, email_state: "none" }, false);

    // 1. The chain, as the sheet sends it: validated as the route validates it, then saved whole by the service role
    // with the owner's id (R15).
    const chain = {
      name: "Movers",
      search_id: s,
      include_unconfirmed: false,
      gap_minutes: 5,
      domain_ids: [],
      signed_by: SIGNED,
      steps: [
        {
          subject: "A quick one for {{business}}",
          body: "{{opening}}\n\nWe help movers in {{city}} fill their quiet weeks. Pick a time: {{booking link}}\n\n{{your name}}",
          after_days: null,
        },
        { subject: null, body: "Just following up, {{business}}.\n\n{{your name}}", after_days: 4 },
      ],
    };
    assert.deepEqual(validateReachOutChain(ReachOutChainSchema.parse(chain), { bookingLink: true }), []);
    const saved = ok(await db.rpc("reach_out_save", { p_tenant_id: B, p_user_id: owner, p_chain: chain }));
    assert.equal(saved.step_ids.length, 2);
    const root = saved.root_id;

    // 2. Start: the first step's run, planned now, waiting for its owner.
    const started = await lib.runReachOutStep(db, await playbook(root), new Date(), "America/Chicago", L);
    assert.deepEqual([started.outcome, started.reason, started.planned], ["held", "waiting_for_you", 2]);
    const run = ok(await db.from("broadcasts").select("*").eq("id", started.runId).single());
    assert.equal(run.state, "pending_approval");
    const sendFor = async (leadId) => (await sendsOf(run.id)).find((x) => x.lead_id === leadId);
    for (const id of [ids.austin, ids.fresno]) {
      const x = await sendFor(id);
      assert.deepEqual([x.state, x.checked_at, x.opening], ["planned", null, null], "planned, not yet checked");
    }

    // 3. The check's tick, over the scripted model: a writer's and a reader's call for each business. Austin's opening
    // is backed, and it is planned with it; Fresno's is too, but the business reads like a chain, so it is held.
    const model = scriptedModel();
    const c3 = await lib.checkSends({ db, now: new Date(), started: Date.now(), log: L, tenantId: B, ask: model.ask });
    assert.deepEqual(
      [c3.read, c3.checked, c3.held, c3.failed, c3.errors, c3.calls],
      [2, 2, 1, 0, 0, 4],
      JSON.stringify(c3),
    );
    assert.deepEqual(model.calls.map((c) => `${c.writer ? "writer" : "reader"}:${c.name}`).sort(), [
      "reader:Austin Movers",
      "reader:Fresno Movers",
      "writer:Austin Movers",
      "writer:Fresno Movers",
    ]);
    const austin = await sendFor(ids.austin);
    assert.deepEqual(
      [austin.state, austin.opening, austin.angle, austin.facts_used],
      ["planned", OPENINGS["Austin Movers"].opening, "their rating", ["rating", "city"]],
    );
    assert.ok(austin.checked_at && austin.checked_words, "checked, against the words as they stand");
    const fresno = await sendFor(ids.fresno);
    assert.deepEqual(
      [fresno.state, fresno.reason, fresno.hold_detail, fresno.opening],
      ["held", "chain", "site:3", OPENINGS["Fresno Movers"].opening],
      "held for the business, its opening kept for an Include",
    );
    await due(run.id);

    // 4. The approval sheet's read, on the owner's session: one today, one held with its words, the first email as it
    // reads.
    const r4 = await dash.reachOutRunOf(ctx, B, run);
    assert.deepEqual([r4.root_id, r4.step_n, r4.today, r4.later, r4.checking], [root, 0, 1, 0, 0], JSON.stringify(r4));
    assert.deepEqual(
      r4.held.map((h) => [h.business_name, h.reason, holdWords(h.reason, h.detail), h.opening]),
      [
        [
          "Fresno Movers",
          "chain",
          "reads like a chain: 3 listings share their website",
          OPENINGS["Fresno Movers"].opening,
        ],
      ],
    );
    assert.deepEqual(
      [r4.first.business_name, r4.first.subject, r4.first.opening],
      ["Austin Movers", "A quick one for Austin Movers", OPENINGS["Austin Movers"].opening],
    );
    assert.equal(
      r4.first.body,
      `${OPENINGS["Austin Movers"].opening}\n\nWe help movers in Austin fill their quiet weeks. Pick a time: ${BOOKING}\n\n${SIGNED}`,
    );
    assert.deepEqual(
      r4.domains.map((d) => d.host),
      [HOST_B],
    );

    // 5. The owner includes the held one: planned again, still checked, its opening kept; never held for it again (R7).
    ok(await session.rpc("reach_out_send_decide", { p_send_id: fresno.id, p_decision: "include" }));
    const included = await sendFor(ids.fresno);
    assert.deepEqual(
      [included.state, included.reason, included.included_for, included.opening],
      ["planned", null, ["chain"], OPENINGS["Fresno Movers"].opening],
    );
    assert.ok(included.checked_at, "an Include is no new check");
    await due(run.id);
    const r5 = await dash.reachOutRunOf(ctx, B, run);
    assert.deepEqual([r5.today, r5.held.length, r5.checking], [2, 0, 0]);

    // 6. Approved on the owner's session, then the ticks: nothing left to check, both claimed and written, their jobs
    // run. Each email opens with its own sentence and ends with the name it signs with, the booking link filled in.
    const approved = await lib.approveRun(lib.approveRunPorts(ctx, B), { row: run, now: new Date() });
    assert.equal(approved.state, "scheduled");
    await due(run.id);
    const again = await lib.checkSends({
      db,
      now: new Date(),
      started: Date.now(),
      log: L,
      tenantId: B,
      ask: model.ask,
    });
    assert.deepEqual([again.read, again.calls, model.calls.length], [0, 0, 4], "nothing is checked twice");
    await lib.reachOutClock(db, new Date(), L, Date.now(), B);
    const c6 = await lib.claimAndWrite({ db, now: new Date(), started: Date.now(), lane: LANE, log: L, tenantId: B });
    assert.deepEqual([c6.claimed, c6.written, c6.errors], [2, 2, 0], JSON.stringify(c6));
    const before6 = coldSent().length;
    assert.equal(await runJobs(B), 2);
    const out = coldSent().slice(before6);
    assert.equal(out.length, 2);
    for (const [key, id] of [
      ["Austin Movers", ids.austin],
      ["Fresno Movers", ids.fresno],
    ]) {
      const x = await sendFor(id);
      assert.equal(x.state, "queued");
      const m = ok(await db.from("messages").select("body, meta").eq("id", x.message_id).single());
      assert.ok(m.body.startsWith(`${OPENINGS[key].opening}\n\n`), m.body);
      assert.ok(m.body.includes(`Pick a time: ${BOOKING}`), m.body);
      assert.ok(m.body.endsWith(`\n\n${SIGNED}`), m.body);
      assert.equal(m.meta.email.request.subject, `A quick one for ${key}`);
      const wire = out.find((o) => o.body.subject === `A quick one for ${key}`);
      assert.ok(wire, `the provider took ${key}'s email`);
      assert.match(wire.body.from, new RegExp(`<sam@${HOST_B.replace(/\./g, "\\.")}>$`));
      assert.ok(wire.body.text.startsWith(OPENINGS[key].opening), wire.body.text);
    }

    // 7. The chain wrote, so it is not removed: its owner pauses it instead (R16).
    const removed = await session.rpc("reach_out_remove", { p_tenant_id: B, p_root_id: root });
    assert.equal(removed.error?.code, "23503", removed.error?.message);
    assert.equal(removed.error.message, REACH_OUT_REFUSALS.wrote);
    assert.equal(ok(await db.from("playbooks").select("id").eq("id", root)).length, 1, "the chain stands");
  },
);
