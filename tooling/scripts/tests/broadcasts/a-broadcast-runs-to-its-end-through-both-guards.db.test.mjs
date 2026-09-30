/**
 * #1100's writer against the real triggers: the broadcast batch (jobs' broadcastSend over core's sendBroadcastBatch,
 * dispatched by the real runner) and the run's settle (jobs' settleJob, as the runner reaches it when a run never
 * came back), over broadcasts of a few people, with broadcasts_guard (00106) and broadcast_recipients_guard (00116,
 * 00182, 00216) in the way of every move. On 26 Sep 2026 the batch claimed each person `failed` before the wire while
 * 00116 made `failed` final: every "sent" mark was refused in production for two weeks and every unit test passed,
 * because the batch ran on a database with no triggers. Here it runs on the replayed one, whole.
 *
 *   one run, five people      sent; held at the door (their no); refused by Meta; Meta's answer lost; and "not now"
 *                             -- that one released to the queue and sent by the run's next batch; the broadcast
 *                             scheduled -> sending -> sent, with its tally
 *   a run killed mid-send     given up by the next claim and handed to a fresh run, which finishes the broadcast;
 *                             the person it was sending to keeps the claim and is never sent twice
 *   the wire down             Meta refuses the credentials: the broadcast fails, and nobody after is burned
 *   killed once too often     a run that dies with its resumes spent fails the broadcast instead
 *
 * Only Meta's Graph is stubbed, at the network. The owner's alerts are collected rather than mailed. Every row is kept
 * in the workspace this file makes and deletes; a job is made due only for the instant of its tick (due_at 1990, the
 * front of the one queue every suite shares), and the tick's claim asks the ledger only while one of those waits.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { takeLock } from "../_file-lock.mjs";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip =
  !URL_ || !KEY
    ? "no service-role credentials in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite claims from the ledger"
      : false;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const stamp = Date.now().toString(36);
const DUE = "1990-01-01T00:00:00.000Z";
const WA = { phoneId: "100000000000003", accessToken: "graph-token-for-this-suite" };

// The jobs ledger is one queue the whole database suite shares: claim_due_jobs takes the oldest due row of all of it, and
// jobs_backlog() counts every due row. This file, the job walk (jobs/a-job-is-claimed-run-and-settled), the broadcast
// walk (broadcasts/a-broadcast-runs-to-its-end-through-both-guards) and jobs-outbox.db make rows due and count them, so
// they take a lock for the whole file (_file-lock.mjs) and run one after the other.
let releaseLedger;
let db;
let T;
let jobs;
let whatsappWire;
let templateId;
const TEMPLATE = `visit_note_${stamp}`;
const ok = (res) => {
  assert.equal(res.error, null, res.error?.message);
  return res.data;
};

/**
 * A zone where it is midday now, so a throttled batch's next try (a minute or two on) is inside the sending hours
 * (contracts PLAYBOOK_HOURS) whatever the hour this runs at.
 */
function middayZone(now = new Date()) {
  const k = 12 - now.getUTCHours();
  return k === 0 ? "Etc/GMT" : k > 0 ? `Etc/GMT-${k}` : `Etc/GMT+${-k}`;
}

/* ---------------------------------------------------------------- Meta, at the network */

/** How Meta answers a send to each number, one answer per call, the last repeated. */
const graphScript = new Map();
const graphCalls = [];
const parked = [];
let wamids = 0;
const realFetch = globalThis.fetch;
const reply = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const graphError = (status, code, message) => reply(status, { error: { message, type: "OAuthException", code } });
function stubGraph() {
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    if (u.startsWith("https://graph.facebook.com/")) {
      const { to } = JSON.parse(init.body);
      graphCalls.push(to);
      const answers = graphScript.get(to) ?? ["ok"];
      const how = answers.length > 1 ? answers.shift() : answers[0];
      if (how === "park") return new Promise((resolve) => parked.push({ to, resolve }));
      if (how === "refuse") return graphError(400, 131026, "(#131026) Message undeliverable");
      if (how === "throttle") return graphError(400, 130429, "(#130429) Rate limit hit");
      if (how === "revoked") return graphError(401, 190, "Error validating access token");
      if (how === "reset")
        throw Object.assign(new TypeError("fetch failed"), {
          cause: Object.assign(new Error("other side closed"), { code: "ECONNRESET" }),
        });
      wamids += 1;
      return reply(200, {
        messaging_product: "whatsapp",
        contacts: [{ input: to, wa_id: to }],
        messages: [{ id: `wamid.fixture.${stamp}.${wamids}` }],
      });
    }
    if (/^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(u)) return realFetch(url, init);
    throw new Error(`this suite does not answer ${init?.method ?? "GET"} ${u}`);
  };
}
async function parkedFor(to) {
  for (let i = 0; i < 200; i += 1) {
    if (parked.some((p) => p.to === to)) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  assert.fail(`no send to ${to} was ever made`);
}

/** What the batch logs when a write of its own is refused: a refused mark is how #1100 hid. None may appear. */
const swallowed = [];
const realError = console.error;
const SWALLOWS = /broadcast_person_unreadable|broadcast_release_refused|broadcast_batch_unreadable|deliver_\w+_failed/;

/* ---------------------------------------------------------------- the runner, as api/jobs/tick.ts binds it */

const alerts = [];
const strays = [];
function tickLog() {
  const lines = [];
  const at = (level) => (event, fields) => lines.push({ level, event, ...fields });
  return { lines, info: at("info"), warn: at("warn"), error: at("error") };
}
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
    schedule: async (kind, dueAt, payload) => {
      await jobs.scheduleJob(db, { tenantId: job.tenant_id, kind, dueAt, payload });
    },
    scheduleOnce: (kind, dueAt, payload) => jobs.scheduleJobOnce(db, { tenantId: job.tenant_id, kind, dueAt, payload }),
    deadline,
  };
}
function tick(log = tickLog()) {
  const run = jobs.runTick(
    {
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
    },
    {
      claimForMs: jobs.CLAIM_FOR_MS,
      yieldAtMs: jobs.YIELD_AT_MS,
      yieldAtFor: (kind) => (kind.startsWith("lead_") ? jobs.LEAD_YIELD_AT_MS : undefined),
      leaseSeconds: jobs.LEASE_SECONDS,
    },
  );
  return Object.assign(run, { log });
}
async function comeDue(id, { leaseRanOut = false } = {}) {
  ok(
    await db
      .from("jobs")
      .update({ due_at: DUE, ...(leaseRanOut ? { lease_until: DUE } : {}) })
      .eq("id", id),
  );
}
/** The broadcast's next job, as the batch or the settle scheduled it: the one not yet run. */
async function nextJobOf(broadcastId) {
  const rows = ok(
    await db
      .from("jobs")
      .select("id, payload, due_at")
      .eq("tenant_id", T)
      .eq("kind", "broadcast_send")
      .eq("state", "scheduled")
      .eq("payload->>broadcast_id", broadcastId),
  );
  assert.equal(rows.length, 1, `one next job for the broadcast: ${JSON.stringify(rows)}`);
  return rows[0];
}
const troubleIn = (log) => log.lines.filter((l) => l.level !== "info");

/* ---------------------------------------------------------------- the workspace */

let phones = 100;
/** A person who wrote in on WhatsApp: START (a yes to messages), or STOP. */
async function person(said = "START") {
  phones += 1;
  const digits = `1212555${String(phones).padStart(4, "0")}`;
  const ing = ok(
    await db.rpc("ingest_inbound", {
      p_tenant_id: T,
      p_channel: "whatsapp",
      p_identity_external_id: digits,
      p_phone_e164: `+${digits}`,
      p_wa_profile_name: "Fixture Person",
      p_message_external_id: `wamid.in.${stamp}.${phones}`,
      p_type: "text",
      p_body: said,
      p_channel_ts: new Date().toISOString(),
      p_media: null,
      p_meta: {},
      p_opt_out: said === "STOP",
      p_opt_in: said === "START",
    }),
  );
  return { digits, contactId: ing.contact_id };
}

/**
 * A broadcast as the approve route leaves it: scheduled for a moment (an hour on, so the ledger never finds it due
 * before its tick here), its people queued in order, its first job on the ledger. `resumes` is how many fresh runs
 * this job already is, as the settle writes it.
 */
async function broadcastTo(people, name, { resumes } = {}) {
  const when = new Date(Date.now() + 3_600_000);
  const id = ok(
    await db
      .from("broadcasts")
      .insert({
        tenant_id: T,
        name,
        template_id: templateId,
        template_name: TEMPLATE,
        template_language: "en_US",
        params: [],
        audience: { kind: "everyone" },
        recipient_count: people.length,
        state: "scheduled",
        scheduled_for: when.toISOString(),
      })
      .select("id")
      .single(),
  ).id;
  for (const p of people)
    ok(await db.from("broadcast_recipients").insert({ tenant_id: T, broadcast_id: id, contact_id: p.contactId }));
  const { jobId } = await jobs.scheduleJob(db, {
    tenantId: T,
    kind: "broadcast_send",
    dueAt: when,
    payload: { broadcast_id: id, ...(resumes ? { resumes } : {}) },
  });
  return { id, jobId };
}
const broadcastRow = async (id) =>
  ok(await db.from("broadcasts").select("state, failure, started_at, finished_at").eq("id", id).single());
async function recipientsOf(id) {
  const rows = ok(
    await db.from("broadcast_recipients").select("contact_id, state, reason, message_id").eq("broadcast_id", id),
  );
  return new Map(rows.map((r) => [r.contact_id, r]));
}
const messageOf = async (id) => ok(await db.from("messages").select("status, error, meta").eq("id", id).single());

before(async () => {
  if (skip) return;
  releaseLedger = await takeLock("jobs-ledger");
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  jobs = await import(at("packages/jobs/src/index.ts"));
  ({ whatsappWire } = await import(at("packages/core/src/index.ts")));
  stubGraph();
  console.error = (...args) => {
    if (SWALLOWS.test(String(args[0]))) swallowed.push(args.map(String).join(" "));
    realError(...args);
  };
  T = ok(
    await db
      .from("tenants")
      .insert({ slug: `broadcast-run-${stamp}`, name: "Broadcast Run Studio", timezone: middayZone() })
      .select("id")
      .single(),
  ).id;
  templateId = ok(
    await db
      .from("templates")
      .insert({
        tenant_id: T,
        channel: "whatsapp",
        name: TEMPLATE,
        language: "en_US",
        category: "utility",
        meta_status: "approved",
        body_preview: "Your visit is confirmed. Reply here if anything changes.",
      })
      .select("id")
      .single(),
  ).id;
});

after(async () => {
  globalThis.fetch = realFetch;
  console.error = realError;
  try {
    if (skip || !T) return;
    await db.from("events").delete().eq("tenant_id", T);
    await db.from("tenants").delete().eq("id", T);
  } finally {
    await releaseLedger?.();
  }
});

/* ---------------------------------------------------------------- the cases */

test(
  "one run over five people: sent, held at the door, refused by Meta, an answer lost, and a 'not now' released and sent by the next batch; the broadcast ends sent",
  { skip },
  async () => {
    const reached = await person();
    const saidNo = await person("STOP");
    const refused = await person();
    const lost = await person();
    const slow = await person();
    graphScript.set(refused.digits, ["refuse"]);
    graphScript.set(lost.digits, ["reset"]);
    graphScript.set(slow.digits, ["throttle", "ok"]);
    const b = await broadcastTo([reached, saidNo, refused, lost, slow], "Visit note");

    await comeDue(b.jobId);
    const first = tick();
    const c1 = await first;
    assert.deepEqual([c1.claimed, c1.done, c1.failed, c1.gaveUp], [1, 1, 0, 0]);
    assert.deepEqual(troubleIn(first.log), []);
    assert.equal((await broadcastRow(b.id)).state, "sending", "claimed by the batch: scheduled -> sending");
    let r = await recipientsOf(b.id);
    assert.deepEqual(
      [r.get(slow.contactId).state, r.get(slow.contactId).reason],
      ["queued", "throttled"],
      "the claim released: nothing was taken",
    );
    // WhatsApp's wait: a minute, carried to the next batch, and only while it runs.
    const next = await nextJobOf(b.id);
    assert.equal(next.payload.waits, 1);
    assert.ok(Date.parse(next.due_at) > Date.now() + 30_000, "a minute on");

    await comeDue(next.id);
    const second = tick();
    const c2 = await second;
    assert.deepEqual([c2.claimed, c2.done], [1, 1]);
    assert.deepEqual(troubleIn(second.log), []);

    r = await recipientsOf(b.id);
    const states = [reached, saidNo, refused, lost, slow].map((p) => [
      r.get(p.contactId).state,
      r.get(p.contactId).reason,
    ]);
    assert.deepEqual(states, [
      ["sent", null],
      ["skipped", "opted_out"],
      ["failed", "send_failed"],
      ["failed", "send_failed"],
      ["sent", null],
    ]);
    assert.equal((await messageOf(r.get(reached.contactId).message_id)).status, "sent");
    assert.equal((await messageOf(r.get(slow.contactId).message_id)).status, "sent");
    // A broadcast's row is written by the door once the wire answered: a failure's facts ride its meta.
    const no = await messageOf(r.get(refused.contactId).message_id);
    assert.deepEqual([no.status, no.meta.http_status, no.meta.broadcast_id], ["failed", 400, b.id]);
    const gone = await messageOf(r.get(lost.contactId).message_id);
    assert.deepEqual(
      [gone.status, gone.meta.http_status, gone.meta.outcome],
      ["failed", 0, "unknown"],
      "the lost answer is recorded as what it is",
    );
    assert.equal(r.get(saidNo.contactId).message_id, null, "the door wrote nothing for the person who said no");
    assert.equal(graphCalls.filter((to) => to === saidNo.digits).length, 0, "and Meta never heard of them");

    const bc = await broadcastRow(b.id);
    assert.deepEqual([bc.state, bc.failure], ["sent", null]);
    assert.ok(bc.started_at && bc.finished_at);
    const tally = ok(
      await db.from("events").select("data").eq("tenant_id", T).eq("kind", "broadcast.sent").eq("subject_id", b.id),
    );
    assert.deepEqual(
      tally.map((e) => e.data),
      [{ sent: 2, held: 3 }],
    );
    assert.deepEqual(
      alerts.filter((a) => a.about?.id === b.id).map((a) => a.kind),
      ["broadcast_sent"],
    );
    assert.deepEqual(swallowed, [], "no mark of the batch's was refused");
  },
);

test(
  "a run killed mid-send is given up and handed to a fresh run; the person it was sending to keeps the claim and is never sent twice",
  { skip },
  async () => {
    const first = await person();
    const midSend = await person();
    const last = await person();
    graphScript.set(midSend.digits, ["park"]);
    const b = await broadcastTo([first, midSend, last], "Visit note, again");

    await comeDue(b.jobId);
    void tick();
    await parkedFor(midSend.digits);
    let r = await recipientsOf(b.id);
    assert.deepEqual(
      [r.get(first.contactId).state, r.get(midSend.contactId).state, r.get(midSend.contactId).reason],
      ["sent", "failed", "outcome_unknown"],
      "claimed before the wire, as the batch does",
    );

    // The function is killed there; its lease runs out and the next heartbeat claims the job again.
    await comeDue(b.jobId, { leaseRanOut: true });
    const settle = tick();
    const cs = await settle;
    assert.deepEqual([cs.claimed, cs.gaveUp], [1, 1]);
    assert.deepEqual(troubleIn(settle.log), []);
    const dead = ok(await db.from("jobs").select("state, attempts").eq("id", b.jobId).single());
    assert.deepEqual([dead.state, dead.attempts], ["failed", 2]);
    assert.equal((await broadcastRow(b.id)).state, "sending", "not failed: handed on");
    const told = alerts.filter((a) => a.job === b.jobId);
    assert.deepEqual(
      told.map((a) => a.kind),
      ["job_failed"],
    );
    assert.match(told[0].body, /carries on in a fresh run: 1 reached so far, 1 still to go/);

    const fresh = await nextJobOf(b.id);
    assert.equal(fresh.payload.resumes, 1);
    await comeDue(fresh.id);
    const resumed = tick();
    assert.deepEqual([(await resumed).claimed, (await resumed).done], [1, 1]);
    assert.deepEqual(troubleIn(resumed.log), []);

    r = await recipientsOf(b.id);
    assert.deepEqual(
      [first, midSend, last].map((p) => [r.get(p.contactId).state, r.get(p.contactId).reason]),
      [
        ["sent", null],
        ["failed", "outcome_unknown"],
        ["sent", null],
      ],
    );
    assert.equal(graphCalls.filter((to) => to === midSend.digits).length, 1, "never a second template");
    assert.equal((await broadcastRow(b.id)).state, "sent");
    assert.deepEqual(swallowed, []);
  },
);

test(
  "the wire goes down: Meta refuses the credentials, the broadcast fails, and nobody after is burned",
  { skip },
  async () => {
    const one = await person();
    const two = await person();
    graphScript.set(one.digits, ["revoked"]);
    const b = await broadcastTo([one, two], "Visit note, a third time");
    await comeDue(b.jobId);
    const t = tick();
    const c = await t;
    assert.deepEqual([c.claimed, c.done], [1, 1]);
    assert.deepEqual(troubleIn(t.log), []);
    const r = await recipientsOf(b.id);
    assert.deepEqual(
      [one, two].map((p) => [r.get(p.contactId).state, r.get(p.contactId).reason]),
      [
        ["failed", "send_failed"],
        ["queued", null],
      ],
      "the one it reached failed; the one after is still queued",
    );
    const bc = await broadcastRow(b.id);
    assert.deepEqual([bc.state, bc.failure], ["failed", "wire_unavailable"]);
    assert.ok(bc.finished_at);
    assert.deepEqual(
      alerts.filter((a) => a.about?.id === b.id).map((a) => a.kind),
      ["broadcast_stopped"],
    );
    assert.deepEqual(swallowed, []);
  },
);

test("a run that dies with its fresh runs spent fails the broadcast instead of resuming it", { skip }, async () => {
  const p = await person();
  graphScript.set(p.digits, ["park"]);
  // This run is already the fifth fresh one (settle MAX_RESUMES): one more death is one too many.
  const b = await broadcastTo([p], "Visit note, the last", { resumes: 5 });
  await comeDue(b.jobId);
  void tick();
  await parkedFor(p.digits);
  await comeDue(b.jobId, { leaseRanOut: true });
  const t = tick();
  assert.deepEqual([(await t).claimed, (await t).gaveUp], [1, 1]);
  assert.deepEqual(
    troubleIn(t.log).map((l) => l.event),
    ["broadcast_not_resumed"],
    "said as the reason it was not handed on",
  );
  const bc = await broadcastRow(b.id);
  assert.deepEqual([bc.state, bc.failure], ["failed", "run_interrupted"]);
  const left = ok(
    await db.from("jobs").select("id").eq("tenant_id", T).eq("state", "scheduled").eq("payload->>broadcast_id", b.id),
  );
  assert.deepEqual(left, [], "and no fresh run was scheduled");
});

test("nothing of another suite's was claimed, and nothing of this one is left due", { skip }, async () => {
  assert.deepEqual(strays, []);
  assert.deepEqual(
    ok(await db.from("jobs").select("id").eq("tenant_id", T).eq("state", "scheduled").lte("due_at", DUE)),
    [],
  );
});
