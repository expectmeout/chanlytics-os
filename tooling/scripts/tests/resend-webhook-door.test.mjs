/**
 * Resend's webhook door: proven first, routed by the address the platform
 * assigned, one intake per mailbox, and nothing read or judged in the request.
 *
 * The world: a deployment whose mail domain is mail.chanlytics.com, and two
 * workspaces with a mailbox each. The door is run as Vercel runs it, over a
 * database in memory, with deliveries signed the way Svix signs them.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { fakeDb } from "./_fake-db.mjs";
import { resendWebhookSignature } from "@chanlytics/channels";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const SECRET = `whsec_${Buffer.from("a-webhook-signing-secret-of-32b!").toString("base64")}`;
process.env.EMAIL_DOMAIN = "mail.chanlytics.com";
process.env.RESEND_WEBHOOK_SECRET = SECRET;
const { setPg } = await import(at("apps/edge/lib/pg.ts"));
const door = await import(at("apps/edge/api/resend-webhook.ts"));
const { emailWaitingMessage } = await import(at("apps/edge/lib/email.ts"));
after(() => {
  setPg(null);
  delete process.env.EMAIL_DOMAIN;
  delete process.env.RESEND_WEBHOOK_SECRET;
});

const URL_ = "https://chanlytics-messaging.vercel.app/api/resend-webhook";
const A = {
  id: "mb-a",
  tenant_id: "t-a",
  local_part: "bestmovers",
  reply_token: "a".repeat(24),
  reply_token_prev: "p".repeat(24),
};
const B = { id: "mb-b", tenant_id: "t-b", local_part: "melanys", reply_token: "b".repeat(24), reply_token_prev: null };

function world(faults = {}) {
  const tables = { mailboxes: [{ ...A }, { ...B }], jobs: [], events: [] };
  setPg(fakeDb(tables, faults));
  return tables;
}
let n = 0;
async function post(payload, { secret = SECRET, sign = true, body } = {}) {
  const raw = body ?? JSON.stringify(payload);
  const id = `msg_${++n}`;
  const ts = String(Math.floor(Date.now() / 1000));
  const headers = {
    "content-type": "application/json",
    ...(sign
      ? {
          "svix-id": id,
          "svix-timestamp": ts,
          "svix-signature": `v1,${await resendWebhookSignature(secret, id, ts, raw)}`,
        }
      : {}),
  };
  const res = await door.POST(new Request(URL_, { method: "POST", headers, body: raw }), { waitUntil: () => {} });
  return res.status;
}
const received = (to, over = {}) => ({
  type: "email.received",
  created_at: new Date().toISOString(),
  data: { email_id: "rcv_1", from: "ana@example.com", to, subject: "Quote", ...over },
});
const jobsOf = (t) => t.jobs.map((j) => [j.tenant_id, j.kind, j.payload]);

test("a received email becomes one intake job for the workspace whose address it names, and nothing about the email is read in the request", async () => {
  const t = world();
  assert.equal(await post(received(["Best Movers <bestmovers@mail.chanlytics.com>"])), 200);
  assert.deepEqual(jobsOf(t), [["t-a", "email_ingest", { mailbox_id: "mb-a", received_id: "rcv_1" }]]);
  assert.ok(Date.parse(t.jobs[0].due_at) <= Date.now(), "due now: the heartbeat takes it within seconds");
});

test("a reply route's token names its workspace, and a rotated-out token still does until it is revoked", async () => {
  const t = world();
  assert.equal(await post(received([`r+${"b".repeat(24)}@mail.chanlytics.com`])), 200);
  assert.equal(await post(received([`r+${"p".repeat(24)}@mail.chanlytics.com`], { email_id: "rcv_2" })), 200);
  assert.deepEqual(
    jobsOf(t).map((j) => [j[0], j[2].received_id]),
    [
      ["t-b", "rcv_1"],
      ["t-a", "rcv_2"],
    ],
  );
});

test("an email addressed to two workspaces is two intakes; named twice to one, it is one", async () => {
  const t = world();
  assert.equal(
    await post(
      received(["bestmovers@mail.chanlytics.com", "someone@else.example"], {
        cc: ["melanys@mail.chanlytics.com"],
        bcc: [`r+${"a".repeat(24)}@mail.chanlytics.com`],
      }),
    ),
    200,
  );
  assert.deepEqual(
    jobsOf(t)
      .map((j) => j[0])
      .sort(),
    ["t-a", "t-b"],
  );
});

test("proven first: a delivery that is not Resend's writes nothing, whatever it says", async () => {
  const t = world();
  const ev = received(["bestmovers@mail.chanlytics.com"]);
  assert.equal(await post(ev, { sign: false }), 401);
  assert.equal(
    await post(ev, { secret: `whsec_${Buffer.from("somebody-else's-signing-secret!!").toString("base64")}` }),
    401,
  );
  assert.deepEqual(t.jobs, []);
  assert.deepEqual(t.events, []);
  assert.equal(
    await post(null, { body: "not json" }),
    400,
    "signed and unreadable: refused, and Resend is not asked to retry what will never parse",
  );
});

test("Resend delivers at least once: a replay is answered as the fact it is, and a database that cannot take the job sends the delivery back", async () => {
  const replay = world({
    "jobs.insert": { message: 'duplicate key value violates unique constraint "jobs_email_ingest_uq"', code: "23505" },
  });
  assert.equal(await post(received(["bestmovers@mail.chanlytics.com"])), 200, "already on the ledger");
  assert.deepEqual(replay.jobs, []);
  world({ "jobs.insert": { message: "connection reset" } });
  assert.equal(await post(received(["bestmovers@mail.chanlytics.com"])), 503);
  world({ "mailboxes.select": { message: "statement timeout" } });
  assert.equal(
    await post(received(["bestmovers@mail.chanlytics.com"])),
    503,
    "a mailbox that could not be looked up is not nobody's",
  );
  setPg(null);
  assert.equal(await post(received(["bestmovers@mail.chanlytics.com"])), 503);
});

test("mail for nobody is acknowledged and counted, once a minute at most, and an event with no work is a quiet 200", async () => {
  const t = world();
  assert.equal(await post(received(["made-up@mail.chanlytics.com"])), 200);
  assert.equal(await post(received(["also-made-up@mail.chanlytics.com"], { email_id: "rcv_2" })), 200);
  assert.deepEqual(t.jobs, []);
  assert.deepEqual(
    t.events.map((e) => [e.kind, e.data]),
    [["ingest.unroutable", { channel: "email", addresses: 1 }]],
    "spam to invented addresses must not become a row per message",
  );
  assert.equal(await post({ type: "email.delivered", data: { email_id: "re_1" } }), 200);
  assert.equal(
    await post(received(["info@bestmovers.com"], { email_id: "rcv_3" })),
    200,
    "names no address of ours at all",
  );
  assert.deepEqual(t.jobs, []);
});

test("email is off on a deployment that names no mail domain: the door does not exist there", async () => {
  const t = world();
  delete process.env.EMAIL_DOMAIN;
  try {
    assert.equal(await post(received(["bestmovers@mail.chanlytics.com"])), 404);
    assert.deepEqual(t.jobs, []);
  } finally {
    process.env.EMAIL_DOMAIN = "mail.chanlytics.com";
  }
});

test("what the workspace's people are told: who wrote and about what, the first words, where to answer; and what the platform may be told names nobody", () => {
  const note = {
    conversationId: "c1",
    from: "ana@example.com",
    fromName: "Ana Reyes",
    subject: "Quote for Saturday",
    preview: "Can you do Saturday at 9?",
    claim: "person",
  };
  const m = emailWaitingMessage(note);
  assert.equal(m.subject, "Ana Reyes wrote by email: Quote for Saturday");
  assert.equal(m.route, "inbox/th-c1");
  assert.deepEqual(m.about, { type: "conversation", id: "c1" });
  assert.match(m.body, /They wrote: “Can you do Saturday at 9\?”/);
  assert.match(m.body, /Email · ana@example\.com/);
  assert.match(m.body, /Reply from the Inbox\./);
  assert.doesNotMatch(m.redactedBody, /ana|Quote|Saturday/i);
  assert.equal(
    emailWaitingMessage({ ...note, fromName: null, subject: null, preview: null }).subject,
    "ana@example.com wrote by email",
  );
  assert.equal(
    emailWaitingMessage({ ...note, claim: "automated", subject: "New lead" }).subject,
    "An automated email arrived: New lead",
  );
});
