/**
 * The ledger's whole sequence against the real jobs_guard (00098): what the heartbeat does to a row, from its claim to
 * its end, run by the real runner (packages/jobs/src/tick.ts runTick) over the ports api/jobs/tick.ts binds -- the real
 * claimNext, dispatchJob, completeJob, failJob, deferJob and settleJob, on a real service client. #1100's lesson: a
 * guard proved one move at a time passed while its writer's sequence was refused in production, so every case here
 * lets the writer make every move it makes and asserts where the row ends and that nothing it wrote was refused.
 *
 *   claimed, run, done        an outbound_send whose send Meta took: the job done, its message sent
 *   thrown, kept, done        an email_ingest whose provider failed: kept (fired, its lease put off), then done
 *   thrown to the end         the same, failing every try: failed on its third claim, its mailbox told
 *   never came back           an outbound_send whose run died mid-send: given up (never sent twice), its message
 *                             settled as an unknown outcome and its thread flagged
 *   the lease taken over      a run that comes back after its lease ran out cannot finish the row the next run holds
 *   canceled                  a withdrawn job is final: no claim takes it
 *
 * Only the providers are stubbed, at the network: Meta's Graph (a send taken, or an answer that never comes) and
 * Resend (a 503, a 404, or an answer that comes late). The owner's alert is collected rather than mailed.
 *
 * ONE QUEUE. claim_due_jobs takes the oldest due row of the whole ledger, and other database suites use the same
 * queue at the same time, so a job here is made due only for the instant of its tick: its due_at is set to 1990,
 * older than anything another suite leaves due, and the tick's claim asks the ledger only while one of those is
 * waiting. Everything else stays in the workspace this file makes and deletes.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip =
  !URL_ || !KEY
    ? "no service-role credentials in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite claims from the ledger"
      : false;

// The deployment's email, for this process: the mail domain and a made-up provider key (the fetch below answers it).
process.env.EMAIL_DOMAIN = "mail.example.com";
process.env.RESEND_API_KEY = "resend-key-for-this-suite";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const stamp = Date.now().toString(36);
/**
 * Older than anything another suite leaves due: the claim that follows takes this suite's row and no other. The
 * broadcast walk (broadcasts/a-broadcast-runs-to-its-end-through-both-guards) stamps a day later and waits for this
 * walk's rows to go, so the two never carry each other's row off.
 */
const DUE = "1990-01-01T00:00:00.000Z";
const WA = { phoneId: "100000000000001", accessToken: "graph-token-for-this-suite" };

let db;
let T;
let jobs;
let whatsappWire;
let emailIntake;
let mailboxId;
const ok = (res) => {
  assert.equal(res.error, null, res.error?.message);
  return res.data;
};

/* ---------------------------------------------------------------- the providers, at the network */

/** How Meta answers a send to each number (its digits): "ok", or "park" (the answer never comes). */
const graphScript = new Map();
const graphCalls = [];
/** How Resend answers a read of each received email, one answer per call, the last repeated: 503, 404, or "park". */
const resendScript = new Map();
const parked = [];
let wamids = 0;
const realFetch = globalThis.fetch;
const reply = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function stubProviders() {
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    if (u.startsWith("https://graph.facebook.com/")) {
      const body = JSON.parse(init.body);
      graphCalls.push(body);
      const how = graphScript.get(body.to) ?? "ok";
      if (how === "park") return new Promise((resolve) => parked.push({ to: body.to, resolve }));
      wamids += 1;
      return reply(200, {
        messaging_product: "whatsapp",
        contacts: [{ input: body.to, wa_id: body.to }],
        messages: [{ id: `wamid.fixture.${stamp}.${wamids}` }],
      });
    }
    if (u.startsWith("https://api.resend.com/emails/receiving/")) {
      const id = decodeURIComponent(u.slice(u.lastIndexOf("/") + 1));
      const answers = resendScript.get(id) ?? [404];
      const how = answers.length > 1 ? answers.shift() : answers[0];
      if (how === "park") return new Promise((resolve) => parked.push({ to: id, resolve }));
      return reply(how, how === 404 ? { name: "not_found", message: "Email not found" } : { message: "unavailable" });
    }
    if (/^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(u)) return realFetch(url, init);
    throw new Error(`this suite does not answer ${init?.method ?? "GET"} ${u}`);
  };
}

/** Wait for a provider call to be parked, as a run that is mid-call is. */
async function parkedFor(to) {
  for (let i = 0; i < 200; i += 1) {
    const hit = parked.find((p) => p.to === to);
    if (hit) return hit;
    await new Promise((r) => setTimeout(r, 25));
  }
  return assert.fail(`no call to ${to} was ever made`);
}

/* ---------------------------------------------------------------- the runner, as api/jobs/tick.ts binds it */

const alerts = [];
/** One tick's log: every line the runner writes, so a swallowed write failure is seen. */
function tickLog() {
  const lines = [];
  const at = (level) => (event, fields) => lines.push({ level, event, ...fields });
  return { lines, info: at("info"), warn: at("warn"), error: at("error") };
}
const strays = [];

/** Is a row of this suite's waiting at the front of the queue: made due for this tick, or its lease run out? */
async function oursWaiting() {
  const now = new Date().toISOString();
  const [due, lapsed] = await Promise.all([
    db.from("jobs").select("id").eq("tenant_id", T).eq("state", "scheduled").lte("due_at", DUE),
    db.from("jobs").select("id").eq("tenant_id", T).eq("state", "fired").lte("due_at", DUE).lt("lease_until", now),
  ]);
  return ok(due).length + ok(lapsed).length > 0;
}

function ctxFor(job, deadline) {
  return {
    db,
    wire: { whatsapp: whatsappWire({ outcome: "present", credentials: WA }), sms: null },
    alert: async (news) => {
      alerts.push({ job: job.id, ...news });
    },
    page: async () => undefined,
    email: emailIntake(db),
    schedule: async (kind, dueAt, payload) => {
      await jobs.scheduleJob(db, { tenantId: job.tenant_id, kind, dueAt, payload });
    },
    scheduleOnce: (kind, dueAt, payload) => jobs.scheduleJobOnce(db, { tenantId: job.tenant_id, kind, dueAt, payload }),
    deadline,
  };
}

/** One heartbeat, as the route runs it: the real ledger writes, and a claim that asks only while ours is waiting. */
function tick(log = tickLog()) {
  const ports = {
    claim: async (lease) => {
      if (!(await oursWaiting())) return null;
      const row = await jobs.claimNext(db, lease);
      if (row && row.tenant_id !== T) {
        strays.push(row);
        return null;
      }
      return row;
    },
    dispatch: (job, deadline) =>
      jobs.dispatchJob(ctxFor(job, deadline), {
        id: job.id,
        tenant_id: job.tenant_id,
        kind: job.kind,
        payload: job.payload ?? {},
      }),
    complete: (job) => jobs.completeJob(db, job),
    fail: (job, reason) => jobs.failJob(db, job, reason),
    defer: (job, untilIso, reason) => jobs.deferJob(db, job, untilIso, reason),
    settle: (job, certain) => jobs.settleJob(db, job, certain),
    alert: async (job, news) => {
      alerts.push({ job: job.id, ...news });
    },
    log,
    now: Date.now,
  };
  const run = jobs.runTick(ports, {
    claimForMs: jobs.CLAIM_FOR_MS,
    yieldAtMs: jobs.YIELD_AT_MS,
    yieldAtFor: (kind) => (kind.startsWith("lead_") ? jobs.LEAD_YIELD_AT_MS : undefined),
    leaseSeconds: jobs.LEASE_SECONDS,
  });
  return Object.assign(run, { log });
}

/** The row's time comes: due now (or its lease run out), at the front of the queue for the tick that follows. */
async function comeDue(id, { leaseRanOut = false } = {}) {
  ok(
    await db
      .from("jobs")
      .update({ due_at: DUE, ...(leaseRanOut ? { lease_until: DUE } : {}) })
      .eq("id", id),
  );
}

const jobRow = async (id) =>
  ok(await db.from("jobs").select("state, attempts, lease_until, last_error").eq("id", id).single());
const troubleIn = (log) => log.lines.filter((l) => l.level !== "info");

/* ---------------------------------------------------------------- the workspace */

let phones = 100;
/** A person who wrote in on WhatsApp and said START: their thread, as the door ingests it. */
async function person() {
  phones += 1;
  const digits = `1202555${String(phones).padStart(4, "0")}`;
  const ing = ok(
    await db.rpc("ingest_inbound", {
      p_tenant_id: T,
      p_channel: "whatsapp",
      p_identity_external_id: digits,
      p_phone_e164: `+${digits}`,
      p_wa_profile_name: "Fixture Person",
      p_message_external_id: `wamid.in.${stamp}.${phones}`,
      p_type: "text",
      p_body: "START",
      p_channel_ts: new Date().toISOString(),
      p_media: null,
      p_meta: {},
      p_opt_out: false,
      p_opt_in: true,
    }),
  );
  return { digits, contactId: ing.contact_id, conversationId: ing.conversation_id };
}

/** A reply queued from the dashboard, and the job that sends it, as the reply door leaves them. */
async function queuedReply(p, body) {
  const m = ok(
    await db
      .from("messages")
      .insert({
        tenant_id: T,
        conversation_id: p.conversationId,
        contact_id: p.contactId,
        channel: "whatsapp",
        direction: "outbound",
        sender: "human",
        type: "text",
        body,
        status: "queued",
      })
      .select("id")
      .single(),
  );
  const { jobId } = await jobs.scheduleJob(db, {
    tenantId: T,
    kind: "outbound_send",
    dueAt: new Date(Date.now() + 60_000),
    payload: { message_id: m.id, conversation_id: p.conversationId, to_phone: `+${p.digits}`, body },
  });
  return { messageId: m.id, jobId };
}

/** An email the provider told us about, and its intake job, as the Resend door schedules it. */
async function emailArrived(receivedId) {
  ok(
    await db.from("jobs").insert({
      tenant_id: T,
      kind: "email_ingest",
      due_at: new Date(Date.now() + 60_000).toISOString(),
      payload: { mailbox_id: mailboxId, received_id: receivedId },
    }),
  );
  return ok(
    await db
      .from("jobs")
      .select("id")
      .eq("tenant_id", T)
      .eq("kind", "email_ingest")
      .eq("payload->>received_id", receivedId)
      .single(),
  ).id;
}

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  jobs = await import(at("packages/jobs/src/index.ts"));
  ({ whatsappWire } = await import(at("packages/core/src/index.ts")));
  ({ emailIntake } = await import(at("apps/edge/lib/email/email.ts")));
  stubProviders();
  T = ok(
    await db
      .from("tenants")
      .insert({ slug: `ledger-sequence-${stamp}`, name: "Ledger Sequence Studio" })
      .select("id")
      .single(),
  ).id;
  mailboxId = ok(
    await db
      .from("mailboxes")
      .insert({
        tenant_id: T,
        local_part: `ledger-${stamp}`,
        reply_token: "abcdefghijklmnopqrstuvwx",
        from_name: "Ledger Sequence Studio",
      })
      .select("id")
      .single(),
  ).id;
});

after(async () => {
  globalThis.fetch = realFetch;
  if (skip || !T) return;
  await db.from("events").delete().eq("tenant_id", T);
  await db.from("tenants").delete().eq("id", T);
});

/* ---------------------------------------------------------------- the cases */

test("a job is claimed, run and done: its reply is sent, and the ledger row ends done", { skip }, async () => {
  const p = await person();
  const { messageId, jobId } = await queuedReply(p, "We have Thursday at 3.");
  await comeDue(jobId);
  const t = tick();
  const counts = await t;
  assert.deepEqual([counts.claimed, counts.done, counts.failed, counts.gaveUp, counts.deferred], [1, 1, 0, 0, 0]);
  assert.deepEqual(troubleIn(t.log), [], "no write of the runner was refused or lost");
  const row = await jobRow(jobId);
  assert.deepEqual([row.state, row.attempts, row.lease_until, row.last_error], ["done", 1, null, null]);
  const m = ok(await db.from("messages").select("status, external_id").eq("id", messageId).single());
  assert.equal(m.status, "sent");
  assert.match(m.external_id ?? "", /^wamid\.fixture\./, "the id Meta answered with is on the row");
});

test(
  "a job that throws is kept, not failed: its lease is put off, and the next claim finishes it",
  { skip },
  async () => {
    const receivedId = `rcv-kept-${stamp}`;
    resendScript.set(receivedId, [503, 503, 404]);
    const jobId = await emailArrived(receivedId);
    await comeDue(jobId);
    const first = tick();
    const c1 = await first;
    assert.deepEqual([c1.claimed, c1.deferred, c1.failed], [1, 1, 0]);
    assert.deepEqual(
      first.log.lines.filter((l) => l.level !== "info").map((l) => l.event),
      ["job_deferred"],
      "kept, and said so",
    );
    let row = await jobRow(jobId);
    assert.equal(row.state, "fired", "still the ledger's: a thrown intake is kept for its next claim");
    assert.equal(row.attempts, 1);
    assert.ok(Date.parse(row.lease_until) > Date.now() + 4 * 60_000, "its lease put off by the first wait");
    assert.match(row.last_error ?? "", /503/);

    // Five minutes on: the lease runs out, and the heartbeat claims it again.
    await comeDue(jobId, { leaseRanOut: true });
    const second = tick();
    const c2 = await second;
    assert.deepEqual([c2.claimed, c2.done, c2.deferred], [1, 1, 0]);
    assert.deepEqual(troubleIn(second.log), []);
    row = await jobRow(jobId);
    assert.deepEqual([row.state, row.attempts, row.lease_until], ["done", 2, null]);
  },
);

test(
  "a run that never came back is given up, never run again: its message is settled as an unknown outcome and its thread flagged",
  { skip },
  async () => {
    const p = await person();
    graphScript.set(p.digits, "park");
    const { messageId, jobId } = await queuedReply(p, "Your table is ready.");
    await comeDue(jobId);
    // The run starts, puts the words on the wire, and is killed there: Meta's answer never comes back to it.
    void tick();
    await parkedFor(p.digits);
    // Ninety seconds on its lease runs out, and the next heartbeat claims it: attempts 2.
    await comeDue(jobId, { leaseRanOut: true });
    const next = tick();
    const counts = await next;
    assert.deepEqual([counts.claimed, counts.gaveUp, counts.done, counts.failed], [1, 1, 0, 0]);
    assert.deepEqual(troubleIn(next.log), [], "the failure, the settle and the alert all landed");
    const row = await jobRow(jobId);
    assert.deepEqual([row.state, row.attempts, row.last_error], ["failed", 2, jobs.RUN_INTERRUPTED]);
    assert.equal(
      graphCalls.filter((c) => c.to === p.digits).length,
      1,
      "a job that speaks to a person is never run a second time",
    );
    const m = ok(await db.from("messages").select("status, error").eq("id", messageId).single());
    assert.equal(m.status, "failed");
    assert.deepEqual(
      [m.error.reason, m.error.outcome],
      ["run_interrupted", "unknown"],
      "it may have gone: an unknown outcome, never 'never sent'",
    );
    const esc = ok(
      await db.from("escalations").select("reason, state").eq("conversation_id", p.conversationId).single(),
    );
    assert.deepEqual([esc.reason, esc.state], ["send_failed", "open"], "a person is asked to look");
    const told = alerts.filter((a) => a.job === jobId);
    assert.deepEqual(
      told.map((a) => a.kind),
      ["job_failed"],
    );
    assert.match(told[0].body, /marked failed/);
  },
);

test(
  "the lease taken over: a run that comes back after its lease ran out cannot finish the row the next run holds",
  { skip },
  async () => {
    const receivedId = `rcv-late-${stamp}`;
    resendScript.set(receivedId, ["park", 404]);
    const jobId = await emailArrived(receivedId);
    await comeDue(jobId);
    const late = tick();
    const call = await parkedFor(receivedId);
    await comeDue(jobId, { leaseRanOut: true });
    const next = tick();
    const c2 = await next;
    assert.deepEqual([c2.claimed, c2.done], [1, 1], "the second claim runs it (attempts 2) and finishes it");
    assert.deepEqual(troubleIn(next.log), []);
    // The first run's answer comes back at last: it finished its work, and its exit finds the row taken.
    call.resolve(reply(404, { name: "not_found" }));
    const c1 = await late;
    assert.deepEqual([c1.claimed, c1.done], [1, 0]);
    assert.deepEqual(
      troubleIn(late.log).map((l) => [l.event, l.attempts]),
      [["job_complete_lost_race", 1]],
      "its compare-and-swap on the claim matched nothing, and it says so",
    );
    const row = await jobRow(jobId);
    assert.deepEqual([row.state, row.attempts], ["done", 2], "the row is the second run's, as it left it");
  },
);

test(
  "a job that throws on every try is failed on its last claim, and its mailbox says an email was lost",
  { skip },
  async () => {
    const receivedId = `rcv-down-${stamp}`;
    resendScript.set(receivedId, [503]);
    const jobId = await emailArrived(receivedId);
    const runs = [];
    for (let i = 0; i < 3; i += 1) {
      await comeDue(jobId, { leaseRanOut: i > 0 });
      const t = tick();
      runs.push({ counts: await t, log: t.log });
    }
    assert.deepEqual(
      runs.map((r) => [r.counts.claimed, r.counts.deferred, r.counts.failed]),
      [
        [1, 1, 0],
        [1, 1, 0],
        [1, 0, 1],
      ],
      "kept twice (five minutes, then thirty), failed on the third",
    );
    for (const r of runs)
      assert.deepEqual(
        r.log.lines.filter((l) => l.level === "error"),
        [],
        "no defer, fail or settle write was refused",
      );
    const row = await jobRow(jobId);
    assert.deepEqual([row.state, row.attempts, row.lease_until], ["failed", 3, null]);
    const box = ok(await db.from("mailboxes").select("last_error").eq("id", mailboxId).single());
    assert.match(box.last_error ?? "", /could not be taken in/, "the owner's mailbox says so");
    assert.deepEqual(
      alerts.filter((a) => a.job === jobId).map((a) => a.kind),
      ["job_failed"],
    );
  },
);

test("a withdrawn job is final: no claim takes it", { skip }, async () => {
  const p = await person();
  const { messageId, jobId } = await queuedReply(p, "Never mind.");
  assert.equal(await jobs.cancelJobsFor(db, T, "outbound_send", "message_id", messageId), 1);
  await comeDue(jobId);
  const t = tick();
  const counts = await t;
  assert.equal(counts.claimed, 0);
  assert.equal((await jobRow(jobId)).state, "canceled");
});

test("nothing of another suite's was claimed, and nothing of this one is left due", { skip }, async () => {
  assert.deepEqual(strays, [], "every claim took this suite's own row");
  const left = ok(await db.from("jobs").select("id").eq("tenant_id", T).eq("state", "scheduled").lte("due_at", DUE));
  assert.deepEqual(left, []);
});
