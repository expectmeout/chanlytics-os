/**
 * Reach out's replies, end to end, on a replayed stack (Part 5's proof, Task 12.1): §7's nightly run in its stack form.
 * One workspace, one chain (a first email, and a nudge three days on), four businesses, one own domain. Every step runs
 * the real code over the real database; what is scripted is the reader (the model that reads a reply), the brain (the
 * receptionist that drafts), the received emails the provider would hand the intake, and the mail provider's HTTP:
 *
 *   1. the chain writes to four businesses by Part 4's path: the step's run, approved, checked and claimed, its jobs
 *      run through the one door from the own domain, their receipts stamping each email's Message-ID, the clock
 *      reading them sent;
 *   2. each replies, through the intake's own job (email_ingest: core ingestEmail through packages/jobs, over the
 *      edge's intake with its provider fetch answering the scripted email), each threaded under the email it answers:
 *      one interested and one no, from a person; one automatic out-of-office that names the day they are back; one
 *      automatic "remove us";
 *   3. the reply_read jobs the intake scheduled run, over the edge's reader (lib/reach-out/reply-read.ts) with its ask
 *      scripted and its draft the edge's drafter (lib/reach-out/reply-draft.ts) over a scripted brain, so the spend,
 *      the draft's gates and the notice (notifyOnce) are the real ones. Interested is Talking, with a draft kept and one
 *      notice that carries it; the no is Said no, its address and its business's own domain on the never-again list,
 *      with one notice; the away is told nobody and the next step's followers leave it out; the automatic "remove us"
 *      is Said no, with one notice. The model is never called: any request to its API fails the suite;
 *   4. after the day they are back (the reading's until_at moved back), the next step takes the away business, and its
 *      nudge leaves;
 *   5. the owner's reply to the interested thread, through the dashboard's reply route on the owner's session, is
 *      frozen with its own twin (meta.email.own_request) and leaves through the wire's own route (the dry wire: the
 *      outbound_send job with the provider stubbed) from the own domain. A second reply, with the domain held between
 *      the freeze and the send, leaves from the mailbox, and its row says so (00226 stamp_email_left_as);
 *   6. the undo of the no, through the dashboard's undo route on the owner's session, puts the lead back to its stage
 *      and takes its addresses off the list; the chain still does not write to them, since they wrote back.
 *
 * The notice is the real one (notifyOnce): the workspace's own address is told through the stubbed provider, whose
 * sender is this process's LEAD_FROM. Kept to its own workspace: every job run, clock and claim here takes it. Local
 * stack only: it makes a workspace and a user, and the owner signs in (SUPABASE_ANON_KEY).
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { emailReceiptFrom } from "@chanlytics/channels";
import { LEAD_CLOSED_WORDS, LEAD_STAGE_WORDS } from "@chanlytics/contracts";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite makes workspaces"
      : !ANON
        ? "no SUPABASE_ANON_KEY in env: the owner this proof signs in as needs it"
        : false;

// The deployment, for this process: the platform's and the cold account's keys (the fetch below answers for both), the
// mail domain replies come back on, the platform's sender for notices, a model key so the reader's and the drafter's
// gates open (the model itself is never called), and the dashboard's service client. Made-up values.
process.env.EMAIL_DOMAIN = "mail.chanlytics.com";
process.env.RESEND_API_KEY = "platform-key-for-this-suite";
process.env.RESEND_COLD_API_KEY = "cold-key-for-this-suite";
process.env.RESEND_COLD_WEBHOOK_SECRET = "cold-webhook-for-this-suite";
process.env.LEAD_FROM = "Notices <notices@example.com>";
process.env.ANTHROPIC_API_KEY = "model-key-for-this-suite";
if (URL_) process.env.NEXT_PUBLIC_SUPABASE_URL = URL_;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const MIN = 60_000;
const DAY = 86_400_000;
const JOB_MS = MIN;
const TZ = "America/Chicago";
const stamp = Date.now().toString(36);
const iso = (ms) => new Date(ms).toISOString();
const dayIn = (ms) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(ms);
const HOST = `replies-${stamp}.example`;
const LANE = {
  unsubscribeSecret: "unsubscribe-seal-for-this-suite",
  unsubscribeOrigin: "https://app.chanlytics.com",
  replyDomain: "mail.chanlytics.com",
};
const BACK = dayIn(Date.now() + 5 * DAY);
const DRAFT = "Happy to send the details. Would Thursday at 10 suit you for a short call?\n\nSam";

let db;
let A;
let owner;
let session;
let root;
let step;
let domain;
let mailbox;
let lib;
let dash;
let L;
const leads = {};
const firstEmail = {};
const replyOf = {};
const alerts = [];
const ok = (res) => {
  assert.equal(res.error, null, res.error?.message);
  return res.data;
};
const one = async (q) => ok(await q.select("id").single()).id;

/** The four businesses, the words each replies with, and what the scripted reader reads them as. */
const BUSINESSES = {
  yes: { name: "Austin Movers", city: "Austin" },
  no: { name: "Round Rock Movers", city: "Round Rock" },
  away: { name: "Waco Movers", city: "Waco" },
  remove: { name: "Temple Movers", city: "Temple" },
};
const READS = {
  yes: {
    text: "This sounds useful. Can you send me more details?",
    answer: { intent: "interested", summary: "Wants more details", day: null, refer_to: null },
  },
  no: {
    text: "No thanks, please take us off your list.",
    answer: { intent: "no", summary: "Asks to be taken off the list", day: null, refer_to: null },
  },
  away: {
    auto: true,
    text: `I am out of the office until ${BACK}, with limited access to email.`,
    answer: { intent: "away", summary: "Out of the office for a few days", day: BACK, refer_to: null },
  },
  remove: {
    auto: true,
    text: "This mailbox is no longer monitored. Please remove us from your mailing list.",
    answer: {
      intent: "no",
      summary: "Mailbox unmonitored; asks to be removed from the list",
      day: null,
      refer_to: null,
    },
  },
};
const siteOf = (key) => `${key}-movers-${stamp}.example`;
const addressOf = (key) => `owner@${siteOf(key)}`;

/**
 * Every send to the mail provider, answered as it answers one, its id kept by the row its tag names. Any other call to
 * the provider fails the suite, and so does any call to the model's API: the reader and the brain are scripted.
 */
const sent = [];
const modelCalls = [];
const providerIdOf = new Map();
const realFetch = globalThis.fetch;
function stubProvider() {
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    if (u === "https://api.resend.com/emails" && init?.method === "POST") {
      const body = JSON.parse(init.body);
      sent.push({ key: init.headers.Authorization, body });
      const id = `re_${sent.length}`;
      providerIdOf.set(body.tags?.find((t) => t.name === "cl_message")?.value, id);
      return new Response(JSON.stringify({ id }), { status: 200 });
    }
    if (u.startsWith("https://api.resend.com")) throw new Error(`the suite does not answer ${init?.method} ${u}`);
    if (u.includes("api.anthropic.com")) {
      modelCalls.push(u);
      throw new Error("the model was called: the reader and the brain are scripted here");
    }
    return realFetch(url, init);
  };
}
const byKey = (k) => sent.filter((s) => s.key === `Bearer ${process.env[k]}`);

/** A receipt, as the webhook hands it on: the provider's id for the email, and its tags naming the row. */
const receipt = (type, m) =>
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
    },
  });

const messageRow = async (id) => ok(await db.from("messages").select("*").eq("id", id).single());
const leadOf = async (id) => ok(await db.from("leads").select("*").eq("id", id).single());
const readingOf = async (id) => ok(await db.from("reach_out_replies").select("*").eq("message_id", id).maybeSingle());
const sendsOf = async (runId) => ok(await db.from("reach_out_sends").select("*").eq("broadcast_id", runId));
const playbook = async (id) => ok(await db.from("playbooks").select("*").eq("id", id).single());
const noticesOn = async (conversationId) =>
  ok(
    await db
      .from("notifications")
      .select("title, body")
      .eq("tenant_id", A)
      .eq("kind", "reach_out_replied")
      .eq("route", `inbox/th-${conversationId}`),
  );
const suppressed = async (addresses) =>
  ok(await db.rpc("lead_addresses_suppressed", { p_tenant_id: A, p_addresses: addresses })).sort();
const followers = async () =>
  ok(
    await db.rpc("reach_out_followers", {
      p_tenant_id: A,
      p_step_id: step,
      p_parent_id: root,
      p_after_days: 3,
      p_limit: 100,
    }),
  ).map((f) => f.lead_id);

/** A job context as the tick builds one, for this workspace: its wires, the ledger's two schedulers, and `extra`. */
async function jobContext(extra) {
  return {
    db,
    wire: { email: await lib.emailWireFor(db, A) },
    alert: async (news) => {
      alerts.push(news);
    },
    schedule: async (kind, dueAt, payload) => {
      await lib.scheduleJob(db, { tenantId: A, kind, dueAt, payload });
    },
    scheduleOnce: (kind, dueAt, payload) => lib.scheduleJobOnce(db, { tenantId: A, kind, dueAt, payload }),
    deadline: Date.now() + JOB_MS,
    ...extra,
  };
}
/** The workspace's jobs of one kind, taken as the runner takes them (fired, leased) in one update, run, and marked done. */
async function runJobs(kind = "outbound_send", extra = {}) {
  const now = Date.now();
  const jobs = ok(
    await db
      .from("jobs")
      .update({ state: "fired", fired_at: iso(now), lease_until: iso(now + MIN) })
      .eq("tenant_id", A)
      .eq("kind", kind)
      .eq("state", "scheduled")
      .select("*"),
  );
  for (const j of jobs) {
    await lib.dispatchJob(await jobContext(extra), {
      id: j.id,
      tenant_id: j.tenant_id,
      kind: j.kind,
      payload: j.payload,
    });
    ok(await db.from("jobs").update({ state: "done" }).eq("id", j.id));
  }
  return jobs.length;
}
/** No model for the check: these words name no opening, so it asks nothing. */
const noModel = async () => {
  throw new Error("the check asked a model about words that name no opening");
};
const tick = async (now = new Date()) => {
  const checked = await lib.checkSends({ db, now, started: Date.now(), log: L, tenantId: A, ask: noModel });
  assert.deepEqual([checked.calls, checked.errors], [0, 0], JSON.stringify(checked));
  await lib.reachOutClock(db, now, L, Date.now(), A);
  return lib.claimAndWrite({ db, now, started: Date.now(), lane: LANE, log: L, tenantId: A });
};
const stepRun = async (stepId) => {
  const now = new Date();
  const ctx = await lib.reachOutRunContext(db, await playbook(stepId), now);
  assert.ok(!("error" in ctx), JSON.stringify(ctx));
  return lib.runReachOut(ctx.ports, ctx.step, { runFor: dayIn(now) });
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
/** The owner's session, as a route is handed it. */
const ownerCtx = (params) => ({ supabase: session, userId: owner.id, email: owner.email, params });

/** The scripted reader: each reply's reading, found by its words. Every call is kept. */
const readerCalls = [];
const scriptedAsk = async (system, user) => {
  const key = Object.keys(READS).find((k) => user.includes(READS[k].text));
  readerCalls.push({ key, automatic: /automatic: yes/.test(user) });
  return key ? READS[key].answer : assert.fail(`the reader was asked about a reply the proof does not know: ${user}`);
};
/** The scripted brain, in generateReply's shape: one draft, and its tokens. */
const brainCalls = [];
const scriptedBrain = async (history, text, system, fallback, note) => {
  brainCalls.push({ text, fallback, note });
  return { text: DRAFT, escalate: false, usage: { input_tokens: 90, output_tokens: 30 } };
};

async function makeWorkspace() {
  A = await one(db.from("tenants").insert({ slug: `replies-${stamp}`, name: "Harbor Moving Co", timezone: TZ }));
  const email = `owner-${stamp}@fixture-replies.example`;
  const password = `pw-${stamp}-Aa1!`;
  owner = { id: ok(await db.auth.admin.createUser({ email, password, email_confirm: true })).user.id, email };
  ok(await db.from("memberships").insert({ tenant_id: A, user_id: owner.id, role: "owner" }));
  session = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  ok(await session.auth.signInWithPassword({ email, password }));
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
  mailbox = await one(
    db
      .from("mailboxes")
      .insert({ tenant_id: A, local_part: `replies-${stamp}`, reply_token: token, from_name: "Harbor Moving Co" }),
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
}

async function makeChain() {
  const search = await one(
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
  const first = await template("replies_first", [
    { type: "HEADER", format: "TEXT", text: "A moving quote for {{business}}" },
    { type: "BODY", text: "Hi {{business}}, movers in {{city}} ask us for quotes like yours." },
  ]);
  const nudge = await template("replies_nudge", [{ type: "BODY", text: "Just following up, {{business}}." }]);
  const chain = { tenant_id: A, kind: "reach_out", policy_class: "outreach", gap_minutes: 5, template_language: "en" };
  root = await one(
    db.from("playbooks").insert({
      ...chain,
      params: [],
      name: "Movers",
      trigger: "lead_first",
      lead_search_id: search,
      template_id: first,
      template_name: `replies_first_${stamp}`,
    }),
  );
  step = await one(
    db.from("playbooks").insert({
      ...chain,
      params: [],
      name: "Movers, a nudge",
      trigger: "after_step",
      after_playbook_id: root,
      after_days: 3,
      template_id: nudge,
      template_name: `replies_nudge_${stamp}`,
    }),
  );
  // Four qualified businesses, each on its own site, its address on that site: a no reaches the site's domain (N6).
  let n = 0;
  for (const [key, b] of Object.entries(BUSINESSES)) {
    n += 1;
    leads[key] = await one(
      db.from("leads").insert({
        tenant_id: A,
        place_id: `ChIJfixtureReplies${stamp}${n}`,
        business_name: b.name,
        city: b.city,
        region: "TX",
        email: addressOf(key),
        email_state: "ok",
        website_host: siteOf(key),
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
  }
}

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  stubProvider();
  lib = {
    ...(await import(at("apps/edge/lib/reach-out/run-context.ts"))),
    ...(await import(at("apps/edge/lib/reach-out/clock.ts"))),
    ...(await import(at("apps/edge/lib/reach-out/check.ts"))),
    ...(await import(at("apps/edge/lib/reach-out/sender.ts"))),
    ...(await import(at("apps/edge/lib/reach-out/reply-read.ts"))),
    ...(await import(at("apps/edge/lib/reach-out/reply-draft.ts"))),
    ...(await import(at("apps/edge/lib/email/email.ts"))),
    ...(await import(at("apps/edge/lib/email/email-receipts.ts"))),
    ...(await import(at("apps/dashboard/src/server/ports/campaign-ports.ts"))),
    ...(await import(at("packages/core/dist/index.js"))),
    ...(await import(at("packages/jobs/dist/index.js"))),
    ...(await import(at("packages/db/dist/index.js"))),
  };
  // The dashboard's own doors: the Inbox's reply, and "read as no · undo".
  dash = {
    reply: await import(at("apps/dashboard/app/api/v1/conversations/[id]/reply/route.ts")),
    undo: await import(at("apps/dashboard/app/api/v1/reach-out-replies/[id]/undo/route.ts")),
  };
  L = (await import(at("apps/edge/lib/log.ts"))).logger({ suite: "reach_out_replies_e2e" });
  await makeWorkspace();
  await makeChain();
});
after(async () => {
  globalThis.fetch = realFetch;
  if (skip) return;
  if (A) {
    await db.from("events").delete().eq("tenant_id", A);
    ok(await db.from("tenants").delete().eq("id", A));
  }
  if (owner) await db.auth.admin.deleteUser(owner.id);
});

test("1. the chain writes to four businesses: planned, approved, claimed, sent, read sent", { skip }, async () => {
  const r1 = await stepRun(root);
  assert.deepEqual([r1.outcome, r1.reason, r1.planned], ["held", "waiting_for_you", 4]);
  const run = ok(await db.from("broadcasts").select("*").eq("tenant_id", A).eq("playbook_id", root).single());
  const ctx = ownerCtx({});
  assert.equal((await lib.approveRun(lib.approveRunPorts(ctx, A), { row: run, now: new Date() })).state, "scheduled");
  await due(run.id);
  const c = await tick();
  assert.deepEqual([c.claimed, c.written, c.errors], [4, 4, 0], JSON.stringify(c));
  assert.equal(await runJobs(), 4);
  assert.equal(byKey("RESEND_COLD_API_KEY").length, 4, "four cold emails, from the own domain");
  for (const s of await sendsOf(run.id)) {
    const m = await messageRow(s.message_id);
    assert.equal(m.status, "sent");
    for (const type of ["sent", "delivered"])
      assert.equal(await lib.applyEmailReceipt(db, receipt(type, m), iso(Date.now())), "applied");
    const key = Object.keys(leads).find((k) => leads[k] === s.lead_id);
    firstEmail[key] = await messageRow(s.message_id);
  }
  await tick();
  for (const s of await sendsOf(run.id)) {
    assert.equal(s.state, "sent");
    assert.equal((await leadOf(s.lead_id)).stage, "nurture", "written to");
  }
  for (const key of Object.keys(BUSINESSES))
    assert.equal(firstEmail[key].meta.email.message_id, `<${firstEmail[key].id}@${HOST}>`, "stamped by its receipt");
});

/** The email a business replies with, as the provider hands it over: threaded under the email it answers. */
function receivedFrom(key) {
  const answered = firstEmail[key];
  const r = READS[key];
  const mid = answered.meta.email.message_id;
  return {
    id: `received-${key}-${stamp}`,
    from: { address: addressOf(key), name: BUSINESSES[key].name },
    to: answered.meta.email.request.reply_to,
    cc: [],
    subject: `Re: ${answered.meta.email.request.subject}`,
    text: r.text,
    html: null,
    headers: {
      "in-reply-to": mid,
      references: mid,
      ...(r.auto ? { "auto-submitted": "auto-replied" } : {}),
    },
    messageId: `<reply-${key}-${stamp}@${siteOf(key)}>`,
    createdAt: iso(Date.now()),
    attachments: [],
  };
}

test("2. each replies through the intake's own job, threaded under the email it answers", { skip }, async () => {
  const received = new Map(Object.keys(BUSINESSES).map((k) => [`received-${k}-${stamp}`, receivedFrom(k)]));
  // The edge's intake, its provider fetch answering the scripted emails (the key is made up; nothing is fetched).
  const email = { ...lib.emailIntake(db), fetch: async (id) => received.get(id) ?? null };
  for (const id of received.keys())
    await lib.scheduleJob(db, {
      tenantId: A,
      kind: "email_ingest",
      dueAt: new Date(),
      payload: { mailbox_id: mailbox, received_id: id },
    });
  assert.equal(await runJobs("email_ingest", { email }), 4);
  for (const key of Object.keys(BUSINESSES)) {
    const [m] = ok(
      await db
        .from("messages")
        .select("*")
        .eq("tenant_id", A)
        .eq("direction", "inbound")
        .eq("channel", "email")
        .eq("meta->email->>message_id", received.get(`received-${key}-${stamp}`).messageId),
    );
    assert.ok(m, `${key}'s reply was kept`);
    assert.equal(m.conversation_id, firstEmail[key].conversation_id, `${key}: on the thread of the email it answers`);
    assert.equal(m.meta.email.in_reply_to, firstEmail[key].meta.email.message_id);
    assert.equal(m.meta.email.claim, READS[key].auto ? "auto_reply" : "person");
    replyOf[key] = m;
  }
  const scheduled = ok(
    await db.from("jobs").select("payload").eq("tenant_id", A).eq("kind", "reply_read").eq("state", "scheduled"),
  );
  assert.deepEqual(
    scheduled.map((j) => j.payload.message_id).sort(),
    Object.values(replyOf)
      .map((m) => m.id)
      .sort(),
    "one reading each, scheduled by the intake",
  );
});

test(
  "3. the jobs tick reads each: Talking with a draft, Said no, away untold, remove us Said no",
  { skip },
  async () => {
    const replies = {
      ...lib.replyReader(db, { draft: lib.replyDrafter(db, { brain: scriptedBrain }) }),
      ask: scriptedAsk,
    };
    const mailsBefore = byKey("RESEND_API_KEY").length;
    assert.equal(await runJobs("reply_read", { replies }), 4);
    assert.deepEqual(modelCalls, [], "the model's API was never called");
    assert.deepEqual(alerts, [], "no job told the workspace it stopped");
    assert.deepEqual(
      readerCalls.map((c) => `${c.key}:${c.automatic}`).sort(),
      ["away:true", "no:false", "remove:true", "yes:false"],
      "each read once, the automatic two told they are automatic",
    );

    // Interested: Talking, the draft kept on the reading, one notice that carries it.
    const yes = await leadOf(leads.yes);
    assert.equal(LEAD_STAGE_WORDS[yes.stage], "Talking");
    const yesReading = await readingOf(replyOf.yes.id);
    assert.deepEqual(
      [yesReading.intent, yesReading.claim, yesReading.draft, yesReading.draft_state],
      ["interested", "person", DRAFT, "written"],
    );
    assert.equal(brainCalls.length, 1, "only the interested reply is drafted");
    assert.equal(brainCalls[0].text, READS.yes.text);
    assert.equal(brainCalls[0].fallback, "", "no holding words");
    const yesTold = await noticesOn(replyOf.yes.conversation_id);
    assert.equal(yesTold.length, 1);
    assert.match(yesTold[0].title, /Austin Movers wrote back/);
    assert.ok(yesTold[0].body.includes("The receptionist drafted an answer"), yesTold[0].body);
    assert.ok(yesTold[0].body.includes("Happy to send the details."), yesTold[0].body);

    // No: Said no, the address and the business's own domain on the list, one notice.
    const no = await leadOf(leads.no);
    assert.deepEqual([no.stage, LEAD_CLOSED_WORDS[no.closed_reason]], ["archived", "Said no"]);
    const colleague = `dana@${siteOf("no")}`;
    assert.deepEqual(
      await suppressed([addressOf("no"), colleague, `dana@elsewhere-${stamp}.example`]),
      [addressOf("no"), colleague].sort(),
      "the address, and anyone at the business's own domain (its website is that domain)",
    );
    assert.equal((await readingOf(replyOf.no.id)).plan.suppressDomain, siteOf("no"));
    assert.equal((await noticesOn(replyOf.no.conversation_id)).length, 1);

    // Away: recorded with the day they are back, nobody told, the lead untouched.
    const away = await readingOf(replyOf.away.id);
    assert.deepEqual([away.intent, away.claim, away.told_at], ["away", "auto_reply", null]);
    assert.ok(Date.parse(away.until_at) > Date.now(), "paused until the day they are back");
    assert.equal((await noticesOn(replyOf.away.conversation_id)).length, 0, "an out-of-office tells nobody");
    assert.equal((await leadOf(leads.away)).stage, "nurture");

    // The automatic "remove us": Said no, one notice.
    const remove = await leadOf(leads.remove);
    assert.deepEqual([remove.stage, LEAD_CLOSED_WORDS[remove.closed_reason]], ["archived", "Said no"]);
    assert.deepEqual(
      [(await readingOf(replyOf.remove.id)).claim, (await readingOf(replyOf.remove.id)).intent],
      ["auto_reply", "no"],
    );
    assert.deepEqual(await suppressed([addressOf("remove")]), [addressOf("remove")]);
    assert.equal((await noticesOn(replyOf.remove.conversation_id)).length, 1);

    // The three notices reached the workspace's own address, through the provider, once each.
    const mailed = byKey("RESEND_API_KEY").slice(mailsBefore);
    assert.equal(mailed.length, 3, JSON.stringify(mailed.map((m) => m.body.subject)));
    for (const m of mailed) assert.deepEqual(m.body.to, [owner.email]);
  },
);

test(
  "4. the next step leaves the away business out until the day it is back, then writes to it",
  { skip },
  async () => {
    const run1 = ok(await db.from("broadcasts").select("id").eq("tenant_id", A).eq("playbook_id", root).single());
    for (const s of await sendsOf(run1.id))
      ok(
        await db
          .from("reach_out_sends")
          .update({ sent_at: iso(Date.now() - 4 * DAY) })
          .eq("id", s.id),
      );
    assert.deepEqual(await followers(), [], "Talking, two noes, and one away: nobody is due the nudge");

    // After the day they are back.
    ok(
      await db
        .from("reach_out_replies")
        .update({ until_at: iso(Date.now() - MIN) })
        .eq("message_id", replyOf.away.id),
    );
    assert.deepEqual(await followers(), [leads.away], "the next step takes the away business");
    const r = await stepRun(step);
    assert.deepEqual([r.outcome, r.planned], ["sent", 1], "a later run under veto goes ahead on its own");
    const run2 = ok(await db.from("broadcasts").select("id").eq("tenant_id", A).eq("playbook_id", step).single());
    assert.deepEqual(
      (await sendsOf(run2.id)).map((s) => [s.lead_id, s.state]),
      [[leads.away, "planned"]],
    );
    await due(run2.id);
    const c = await tick();
    assert.deepEqual([c.claimed, c.written], [1, 1], JSON.stringify(c));
    const before4 = byKey("RESEND_COLD_API_KEY").length;
    assert.equal(await runJobs(), 1);
    const [nudge] = byKey("RESEND_COLD_API_KEY").slice(before4);
    assert.deepEqual(nudge.body.to, [addressOf("away")]);
    assert.equal(nudge.body.headers["In-Reply-To"], firstEmail.away.meta.email.message_id, "threaded under the first");
  },
);

/** The owner's words through the Inbox's reply route, on their session: the row it queued. */
async function ownerReplies(text) {
  const conv = replyOf.yes.conversation_id;
  const req = new Request(`http://localhost/api/v1/conversations/${conv}/reply?workspace=${A}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text }),
  });
  const receipt = await dash.reply.POST.run(req, ownerCtx({ id: conv }));
  assert.equal(receipt.status, "queued");
  return messageRow(receipt.message_id);
}

test(
  "5. the owner's reply is frozen with its twin and leaves from the own domain; held, from the mailbox",
  { skip },
  async () => {
    const mailboxAddress = `replies-${stamp}@mail.chanlytics.com`;
    const row = await ownerReplies("Happy to. Thursday at 10?");
    assert.match(row.meta.email.request.from, new RegExp(`<${mailboxAddress}>$`), "the mailbox's request, as ever");
    const twin = row.meta.email.own_request;
    assert.ok(twin, "and its own twin");
    assert.match(twin.from, new RegExp(`<sam@${HOST.replace(/\./g, "\\.")}>$`));
    assert.equal(twin.idempotency_key, row.id, "frozen for this row");
    assert.equal(row.meta.email.in_reply_to, replyOf.yes.meta.email.message_id);
    assert.deepEqual(twin.to, row.meta.email.request.to);

    const cold = byKey("RESEND_COLD_API_KEY").length;
    const hosted = byKey("RESEND_API_KEY").length;
    assert.equal(await runJobs(), 1);
    const [own] = byKey("RESEND_COLD_API_KEY").slice(cold);
    assert.ok(own, "it left through the own domain's route");
    assert.equal(byKey("RESEND_API_KEY").length, hosted, "and not as the mailbox");
    assert.match(own.body.from, new RegExp(`<sam@${HOST.replace(/\./g, "\\.")}>$`));
    assert.deepEqual(own.body.to, [addressOf("yes")]);
    assert.equal(own.body.headers["In-Reply-To"], replyOf.yes.meta.email.message_id);
    const left = await messageRow(row.id);
    assert.deepEqual([left.status, left.meta.email.left_as, left.meta.email.left_as_why], ["sent", "own", null]);

    // The second: frozen while the domain is verified, held before its job runs.
    const second = await ownerReplies("One more thing: does Thursday still suit?");
    assert.ok(second.meta.email.own_request, "frozen with its twin");
    ok(
      await db
        .from("sending_domains")
        .update({ state: "held", held_why: "bounces", held_at: iso(Date.now()) })
        .eq("id", domain),
    );
    assert.equal(await runJobs(), 1);
    assert.equal(byKey("RESEND_COLD_API_KEY").length, cold + 1, "nothing more left by the own domain");
    const [mailboxSend] = byKey("RESEND_API_KEY").slice(hosted);
    assert.ok(mailboxSend, "it left as the mailbox");
    assert.match(mailboxSend.body.from, new RegExp(`<${mailboxAddress}>$`));
    const stamped = await messageRow(second.id);
    // The held domain is not among the wire's routes, and it was the workspace's only one.
    assert.deepEqual(
      [stamped.status, stamped.meta.email.left_as, stamped.meta.email.left_as_why],
      ["sent", "mailbox", "no_own_route"],
    );
  },
);

test("6. the undo of the no puts the lead back, and the chain still does not write to them", { skip }, async () => {
  const req = new Request(`http://localhost/api/v1/reach-out-replies/${replyOf.no.id}/undo?workspace=${A}`, {
    method: "POST",
  });
  const out = await dash.undo.POST.run(req, ownerCtx({ id: replyOf.no.id }));
  assert.equal(out.undone, true);
  const lead = await leadOf(leads.no);
  assert.deepEqual([lead.stage, lead.closed_reason], ["nurture", null], "back to the stage the no found");
  const r = await readingOf(replyOf.no.id);
  assert.deepEqual([r.intent, r.undone_by], ["no", owner.id]);
  assert.ok(r.undone_at);
  assert.deepEqual(await suppressed([addressOf("no"), `dana@${siteOf("no")}`]), [], "off the never-again list");

  // They wrote back: the next step's followers and the send door's facts still refuse them.
  assert.ok(!(await followers()).includes(leads.no), "the chain does not write to them");
  const facts = ok(
    await db.rpc("outreach_lead_facts", {
      p_tenant_id: A,
      p_contact_id: firstEmail.no.contact_id,
      p_to: addressOf("no"),
      p_lead_id: leads.no,
    }),
  );
  assert.deepEqual([facts.lead_stage, facts.wrote_back, facts.suppressed], ["nurture", true, false]);
});
