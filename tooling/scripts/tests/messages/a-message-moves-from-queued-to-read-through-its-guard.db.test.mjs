/**
 * A message's whole life against the real messages_guard (00015, 00111, 00177): written by the edge's persistence
 * (apps/edge/lib/whatsapp/persist.ts: the held draft queueReply writes, the answer its sink sends now), sent through
 * the one door (core deliver.ts, as the outbound_send job runs it through dispatchJob, and as the sink calls it), and
 * then moved by Meta's status receipts the way the WhatsApp door records them (db recordStatusByExternalId). #1100's
 * lesson: every move a writer makes, in its order, against the trigger, and the row asserted where it ends -- with no
 * refusal swallowed on the way (the door and the receipt writer log what they swallow; those lines are read here).
 *
 *   a held draft, sent        queued -> sent -> delivered -> read; a late delivered and a late sent are refused by
 *                             the guard and swallowed on purpose, and the row keeps read and its own receipt times
 *   the answer, sent now      sent -> read before its delivered; the delivered that follows is refused
 *   a receipt that fails      sent -> failed with Meta's errors, and a delivered after it changes nothing
 *   Meta refused it           queued -> failed, the thread flagged for a person
 *   Meta's answer was lost    queued -> failed as an unknown outcome, never sent again blind
 *   Meta said "not now"       queued stays queued, handed to a fresh job; that job sends it
 *
 * Only Meta's Graph is stubbed, at the network. The owner's alert is collected rather than mailed. Everything is kept
 * in the workspace this file makes and deletes; the drafts' jobs are dispatched here, as the runner dispatches a claim.
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
      ? "refusing a database that is not on this machine: this suite writes messages"
      : false;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const stamp = Date.now().toString(36);
const WA = { phoneId: "100000000000002", accessToken: "graph-token-for-this-suite" };
/** A draft's hold: long enough that the ledger never finds its job due while this file runs. */
const HOLD_MS = 3_600_000;

let db;
let T;
let jobs;
let persist;
let recordStatusByExternalId;
let whatsappWire;
const ok = (res) => {
  assert.equal(res.error, null, res.error?.message);
  return res.data;
};

/* ---------------------------------------------------------------- Meta, at the network */

/** How Meta answers a send to each number: "ok", "refuse", "reset" (the answer lost) or "throttle", one per call. */
const graphScript = new Map();
let wamids = 0;
const realFetch = globalThis.fetch;
const reply = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
function stubGraph() {
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    if (u.startsWith("https://graph.facebook.com/")) {
      const { to } = JSON.parse(init.body);
      const answers = graphScript.get(to) ?? ["ok"];
      const how = answers.length > 1 ? answers.shift() : answers[0];
      if (how === "refuse")
        return reply(400, {
          error: { message: "(#131026) Message undeliverable", type: "OAuthException", code: 131026 },
        });
      if (how === "throttle")
        return reply(400, { error: { message: "(#130429) Rate limit hit", type: "OAuthException", code: 130429 } });
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

/** What the writers log when they swallow a refusal or a failed write: none of it may appear. */
const swallowed = [];
const realError = console.error;
const SWALLOWS = /record_status_failed|deliver_finalize_failed|deliver_record_failed|escalation_\w+_failed/;

/* ---------------------------------------------------------------- the runtime */

const alerts = [];
const wire = () => ({ whatsapp: whatsappWire({ outcome: "present", credentials: WA }), sms: null });
const quiet = { warn: () => undefined, error: (event, fields) => swallowed.push([event, fields]) };

/** Run a ledger row the way the heartbeat runs its claim: dispatchJob over the ports api/jobs/tick.ts binds. */
async function runJob(jobId) {
  const row = ok(await db.from("jobs").select("id, tenant_id, kind, payload").eq("id", jobId).single());
  const ctx = {
    db,
    wire: wire(),
    alert: async (news) => {
      alerts.push({ job: row.id, ...news });
    },
    page: async () => undefined,
    schedule: async (kind, dueAt, payload) => {
      await jobs.scheduleJob(db, { tenantId: row.tenant_id, kind, dueAt, payload });
    },
    scheduleOnce: (kind, dueAt, payload) => jobs.scheduleJobOnce(db, { tenantId: row.tenant_id, kind, dueAt, payload }),
    deadline: Date.now() + 45_000,
  };
  const out = await jobs.dispatchJob(ctx, {
    id: row.id,
    tenant_id: row.tenant_id,
    kind: row.kind,
    payload: row.payload,
  });
  // Run here, so withdrawn from the ledger: no claim beside this file may send it again.
  ok(await db.from("jobs").update({ state: "canceled" }).eq("id", row.id).eq("state", "scheduled"));
  return out;
}

let phones = 100;
/** A customer's WhatsApp message, taken in by the edge (persist.ts pgIngest): their thread, and what it returned. */
async function customerWrites(words) {
  phones += 1;
  const digits = `1206555${String(phones).padStart(4, "0")}`;
  const ing = await persist.pgIngest(db, T, {
    waId: digits,
    phoneDigits: digits,
    profileName: "Fixture Customer",
    messageId: `wamid.in.${stamp}.${phones}`,
    type: "text",
    kind: "text",
    rawType: "text",
    body: words,
    channelTsIso: new Date().toISOString(),
    media: null,
    optOut: false,
    optIn: false,
    optInMarketing: false,
  });
  assert.ok(ing, "the message was taken in");
  return { digits, ing };
}

/** The receptionist's reply, held for its window (persist.ts queueReply): the queued row and the job that sends it. */
async function heldDraft(c, words) {
  const messageId = await persist.queueReply(db, T, c.ing, c.digits, words, HOLD_MS, quiet);
  assert.ok(messageId, "the draft was queued");
  const job = ok(
    await db
      .from("jobs")
      .select("id")
      .eq("tenant_id", T)
      .eq("kind", "outbound_send")
      .eq("payload->>message_id", messageId)
      .single(),
  );
  return { messageId, jobId: job.id };
}

const messageRow = async (id) =>
  ok(await db.from("messages").select("status, external_id, error, meta").eq("id", id).single());
/** Meta's receipt for a message, recorded as the WhatsApp door records it. */
const receipt = (wamid, status, errors) =>
  recordStatusByExternalId(db, T, wamid, status, errors ? { errors } : undefined);

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  jobs = await import(at("packages/jobs/src/index.ts"));
  persist = await import(at("apps/edge/lib/whatsapp/persist.ts"));
  ({ recordStatusByExternalId } = await import("@chanlytics/db"));
  ({ whatsappWire } = await import(at("packages/core/src/index.ts")));
  stubGraph();
  console.error = (...args) => {
    if (SWALLOWS.test(String(args[0]))) swallowed.push(args);
    realError(...args);
  };
  T = ok(
    await db
      .from("tenants")
      .insert({ slug: `message-life-${stamp}`, name: "Message Life Studio" })
      .select("id")
      .single(),
  ).id;
});

after(async () => {
  globalThis.fetch = realFetch;
  console.error = realError;
  if (skip || !T) return;
  await db.from("events").delete().eq("tenant_id", T);
  await db.from("tenants").delete().eq("id", T);
});

/* ---------------------------------------------------------------- the cases */

test(
  "a held draft goes queued -> sent -> delivered -> read; a late delivered and a late sent are refused and change nothing",
  { skip },
  async () => {
    const c = await customerWrites("Do you have Thursday at 3?");
    const { messageId, jobId } = await heldDraft(c, "We do. Shall I book you in?");
    assert.equal((await messageRow(messageId)).status, "queued");
    assert.equal(await runJob(jobId), "done");
    const sent = await messageRow(messageId);
    assert.equal(sent.status, "sent", "the door finalized the queued row");
    assert.match(sent.external_id ?? "", /^wamid\.fixture\./);

    await receipt(sent.external_id, "delivered");
    await receipt(sent.external_id, "read");
    const read = await messageRow(messageId);
    assert.equal(read.status, "read");
    assert.deepEqual(Object.keys(read.meta.status_at).sort(), ["delivered", "read", "sent"]);

    // Meta retries a webhook and delivers statuses out of order: these two arrive after the read.
    await receipt(sent.external_id, "delivered");
    await receipt(sent.external_id, "sent");
    const after_ = await messageRow(messageId);
    assert.equal(after_.status, "read", "the guard keeps a receipt monotone");
    assert.deepEqual(after_.meta.status_at, read.meta.status_at, "and a refused receipt stamps no time");
    assert.deepEqual(swallowed, [], "the refusals were the monotone ones the receipt writer lets go, and nothing else");
    assert.deepEqual(alerts, []);
  },
);

test("the answer sent now: its read arrives before its delivered, and the delivered is refused", { skip }, async () => {
  const c = await customerWrites("What time do you open?");
  const sink = persist.pgSink(db, T, c.ing, null, "whatsapp", wire());
  const out = await sink.deliver(c.digits, "We open at nine.");
  assert.equal(out.outcome, "sent");
  const first = await messageRow(out.messageId);
  assert.deepEqual([first.status, first.external_id], ["sent", out.externalId], "written as sent, under Meta's id");
  await receipt(out.externalId, "read");
  await receipt(out.externalId, "delivered");
  const row = await messageRow(out.messageId);
  assert.equal(row.status, "read");
  assert.deepEqual(Object.keys(row.meta.status_at).sort(), ["read"], "the late delivered left no time behind");
  assert.deepEqual(swallowed, []);
});

test(
  "a receipt that says it failed: sent -> failed with Meta's errors, and a delivered after it changes nothing",
  { skip },
  async () => {
    const c = await customerWrites("Can I bring my dog?");
    const sink = persist.pgSink(db, T, c.ing, null, "whatsapp", wire());
    const out = await sink.deliver(c.digits, "Of course.");
    assert.equal(out.outcome, "sent");
    const errors = [{ code: 131047, title: "Re-engagement message" }];
    await receipt(out.externalId, "failed", errors);
    await receipt(out.externalId, "delivered");
    const row = await messageRow(out.messageId);
    assert.equal(row.status, "failed", "failed is final for a WhatsApp message");
    assert.deepEqual(row.error, { errors });
    assert.deepEqual(swallowed, []);
  },
);

test("Meta refused the draft: queued -> failed, and a person is asked to look", { skip }, async () => {
  const c = await customerWrites("Is parking free?");
  graphScript.set(c.digits, ["refuse"]);
  const { messageId, jobId } = await heldDraft(c, "Yes, behind the building.");
  assert.equal(await runJob(jobId), "done", "the job itself finished: the failure is the message's");
  const row = await messageRow(messageId);
  assert.equal(row.status, "failed");
  assert.equal(row.error.http_status, 400);
  assert.equal(row.error.outcome, undefined, "a refusal is a known outcome");
  const esc = ok(
    await db.from("escalations").select("reason, state").eq("conversation_id", c.ing.conversation_id).single(),
  );
  assert.deepEqual([esc.reason, esc.state], ["send_failed", "open"]);
  assert.deepEqual(
    alerts.filter((a) => a.job === jobId).map((a) => a.kind),
    ["handoff"],
  );
  assert.deepEqual(swallowed, []);
});

test(
  "Meta's answer was lost: queued -> failed as an unknown outcome, and nothing sends it again",
  { skip },
  async () => {
    const c = await customerWrites("Do you do gift cards?");
    graphScript.set(c.digits, ["reset"]);
    const { messageId, jobId } = await heldDraft(c, "We do, at the desk.");
    assert.equal(await runJob(jobId), "done");
    const row = await messageRow(messageId);
    assert.deepEqual([row.status, row.error.http_status, row.error.outcome], ["failed", 0, "unknown"]);
    const again = ok(
      await db
        .from("jobs")
        .select("id")
        .eq("tenant_id", T)
        .eq("kind", "outbound_send")
        .eq("payload->>message_id", messageId),
    );
    assert.equal(again.length, 1, "no fresh job: a send that may have gone is never sent again blind");
    assert.deepEqual(swallowed, []);
  },
);

test("Meta said not now: the draft stays queued and is handed to a fresh job, which sends it", { skip }, async () => {
  const c = await customerWrites("Any space tomorrow?");
  graphScript.set(c.digits, ["throttle", "ok"]);
  const { messageId, jobId } = await heldDraft(c, "Tomorrow at 10 is free.");
  assert.equal(await runJob(jobId), "done");
  assert.equal((await messageRow(messageId)).status, "queued", "nothing was taken, so nothing is failed");
  const fresh = ok(
    await db
      .from("jobs")
      .select("id, state, payload, due_at")
      .eq("tenant_id", T)
      .eq("kind", "outbound_send")
      .eq("payload->>message_id", messageId)
      .neq("id", jobId),
  );
  assert.equal(fresh.length, 1, "one fresh job");
  assert.equal(fresh[0].payload.resumes, 1);
  assert.ok(Date.parse(fresh[0].due_at) > Date.now(), "a minute on");
  assert.equal(await runJob(fresh[0].id), "done");
  const row = await messageRow(messageId);
  assert.equal(row.status, "sent");
  assert.match(row.external_id ?? "", /^wamid\.fixture\./);
  assert.deepEqual(
    alerts.filter((a) => a.job === jobId || a.job === fresh[0].id),
    [],
    "nobody is told of a throttle",
  );
  assert.deepEqual(swallowed, []);
});
