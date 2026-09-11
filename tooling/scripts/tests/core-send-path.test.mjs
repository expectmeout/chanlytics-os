/**
 * The send path's job verbs, run: the queued send, the Blob erasure and the
 * line provisioning through fakes that log their calls, so what is proved is
 * the order and the outcome, not the handlers' text.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { importSrc } from "./_source.mjs";

const core = await importSrc("packages/core/src/messages/index.ts");
/** A port the runtime does not hold, as opposed to one that answers null. */
const ABSENT = Symbol("absent");
const WRITES = new Set(["deliver", "escalate", "alert", "page", "eraseThread", "scrub", "recordErased", "provision"]);

/** Every port answers a value, a function of its arguments, or throws an Error; ABSENT leaves the port out, as a runtime that does not hold it would. */
function fakes(over = {}) {
  const log = [];
  const answers = {
    queued: { status: "queued", body: "See you at 3", channel: "whatsapp", sender: "human" }, purposeOf: "conversational",
    deliver: { outcome: "sent", messageId: "m1", externalId: "wamid.1" }, escalate: "opened", alert: undefined, page: undefined,
    eraseThread: true, scrub: undefined, recordErased: undefined, provision: { ok: true },
    ...over,
  };
  const ports = {};
  for (const [name, answer] of Object.entries(answers)) {
    if (answer === ABSENT) continue;
    ports[name] = async (...args) => {
      if (WRITES.has(name)) log.push([name, ...args]);
      if (answer instanceof Error) throw answer;
      return typeof answer === "function" ? answer(...args) : answer;
    };
  }
  return { ports, log, ops: () => log.map((l) => l[0]) };
}
const send = (payload = {}) => ({ tenantId: "t1", payload: { message_id: "m1", conversation_id: "c1", to_phone: "+13475550101", body: "See you at 3", ...payload } });

test("a queued row goes through the door with the row's own sender, the template's purpose, never proactive; a gone or handled row is a no-op", async () => {
  const { ports, log } = fakes();
  await core.sendQueued(ports, send());
  assert.equal(log.length, 1);
  assert.deepEqual(log[0][1], { tenantId: "t1", conversationId: "c1", contactId: null, to: "+13475550101", channel: "whatsapp", sender: "human", purpose: "conversational", proactive: false, body: "See you at 3", template: undefined, messageId: "m1" });
  const ai = fakes({ queued: { status: "queued", body: "Hi!", channel: "whatsapp", sender: "ai" } });
  await core.sendQueued(ai.ports, send({ body: undefined }));
  assert.equal(ai.log[0][1].sender, "ai", "the door is handed the row's sender, never a constant");
  assert.equal(ai.log[0][1].body, "Hi!", "and the row's words when the payload carries none");
  const gone = fakes({ queued: null });
  await core.sendQueued(gone.ports, send());
  assert.deepEqual(gone.ops(), [], "canceled or already handled: nothing");
  const done = fakes({ queued: { status: "sent", body: "x", channel: "whatsapp", sender: "human" } });
  await core.sendQueued(done.ports, send());
  assert.deepEqual(done.ops(), []);
});

test("a read that failed is not a message that is gone: the job fails loudly, and nothing is sent", async () => {
  const { ports, ops } = fakes({ queued: new Error("PostgREST blip") });
  await assert.rejects(core.sendQueued(ports, send()), /cannot read message m1: PostgREST blip/);
  assert.deepEqual(ops(), []);
});

test("a template send asks which yes it needs, and a channel the row names travels on that wire", async () => {
  const { ports, log } = fakes({ purposeOf: "marketing", queued: { status: "queued", body: null, channel: "sms", sender: "human" } });
  const tpl = { name: "month_offer", language: "en_US", params: [] };
  await core.sendQueued(ports, send({ template: tpl, body: undefined }));
  assert.equal(log[0][1].purpose, "marketing");
  assert.equal(log[0][1].channel, "sms");
  assert.deepEqual(log[0][1].template, tpl);
  assert.equal(log[0][1].body, "", "no words of its own: the template's are the wire's");
});

test("a wire that could not carry it flags the thread and tells the owner; a provider's 401 or 403 pages the platform as well; a refusal does neither", async () => {
  const failed = fakes({ deliver: { outcome: "failed", reason: "provider", status: 500, errorBody: "boom", messageId: "m1" } });
  await core.sendQueued(failed.ports, send());
  assert.deepEqual(failed.ops(), ["deliver", "escalate", "alert"]);
  assert.deepEqual(failed.log[1], ["escalate", "c1", "send_failed", "Dashboard reply could not be delivered (HTTP 500)."]);
  assert.match(failed.log[2][1], /Reply delivery failed: \+13475550101/);
  assert.match(failed.log[2][2], /HTTP 500/);
  const creds = fakes({ deliver: { outcome: "failed", reason: "provider", status: 401, errorBody: "bad token", messageId: "m1" } });
  await core.sendQueued(creds.ports, send());
  assert.deepEqual(creds.ops(), ["deliver", "page", "escalate", "alert"]);
  assert.equal(creds.log[1][1], "provider_auth:whatsapp");
  assert.match(creds.log[1][3], /Credentials, not content/);
  const noPager = fakes({ deliver: { outcome: "failed", reason: "provider", status: 403, errorBody: "", messageId: "m1" }, page: ABSENT });
  await core.sendQueued(noPager.ports, send());
  assert.deepEqual(noPager.ops(), ["deliver", "escalate", "alert"], "a runtime without a pager still flags and tells");
  const noWire = fakes({ deliver: { outcome: "failed", reason: "no_credentials", status: 503, errorBody: "no_credentials", messageId: "m1" } });
  await core.sendQueued(noWire.ports, send());
  assert.deepEqual(noWire.ops(), ["deliver", "escalate", "alert"], "no credentials is the thread's problem to show, not the pager's");
  const refused = fakes({ deliver: { outcome: "refused", reason: "opted_out", messageId: "m1" } });
  await core.sendQueued(refused.ports, send());
  assert.deepEqual(refused.ops(), ["deliver"], "the row says why; nobody is paged or flagged for a refusal");
});

test("the Blob erasure: every thread gone before the payload is scrubbed and the ledger written; a thread that stayed fails the job with nothing scrubbed; a scrubbed payload is a finished job", async () => {
  const { ports, log, ops } = fakes();
  await core.eraseBlobThread(ports, { tenantId: "t1", jobId: "j1", payload: { contact_id: "k1", namespace: "ns", thread_ids: ["a", "b", ""] } });
  assert.deepEqual(ops(), ["eraseThread", "eraseThread", "scrub", "recordErased"]);
  assert.deepEqual(log[0], ["eraseThread", "ns", "a"]);
  assert.deepEqual(log[2], ["scrub", "t1", { contactId: "k1" }, { contact_id: "k1", namespace: "ns", threads: 2, scrubbed: true }]);
  assert.deepEqual(log[3], ["recordErased", "t1", "k1", 2, "j1"]);
  const stuck = fakes({ eraseThread: (ns, id) => id !== "b" });
  await assert.rejects(core.eraseBlobThread(stuck.ports, { tenantId: "t1", jobId: "j1", payload: { contact_id: "k1", namespace: "ns", thread_ids: ["a", "b"] } }), /1 thread\(s\) not deleted/);
  assert.deepEqual(stuck.ops(), ["eraseThread", "eraseThread"], "the payload is the only thing that can retry it, so it stays");
  const done = fakes();
  await core.eraseBlobThread(done.ports, { tenantId: "t1", jobId: "j1", payload: { scrubbed: true } });
  assert.deepEqual(done.ops(), []);
  await assert.rejects(core.eraseBlobThread(fakes().ports, { tenantId: "t1", jobId: "j1", payload: {} }), /no namespace/);
  const anon = fakes();
  await core.eraseBlobThread(anon.ports, { tenantId: "t1", jobId: "j1", payload: { namespace: "ns", thread_ids: ["a"] } });
  assert.deepEqual(anon.log[1], ["scrub", "t1", { jobId: "j1" }, { contact_id: null, namespace: "ns", threads: 1, scrubbed: true }]);
  assert.deepEqual(anon.ops(), ["eraseThread", "scrub"], "no contact, no ledger row");
});

test("the provisioning: the saga is the edge's; a runtime without it fails loudly, and a saga that stopped names its step", async () => {
  const { ports, log } = fakes();
  await core.provisionLine(ports, { payload: { line_id: "l1", by: "sweep" } });
  assert.deepEqual(log[0], ["provision", "l1", "sweep"]);
  const who = fakes();
  await core.provisionLine(who.ports, { payload: { line_id: "l1", by: "nobody" } });
  assert.deepEqual(who.log[0], ["provision", "l1", "owner"], "an unknown actor is the owner");
  await assert.rejects(core.provisionLine(fakes().ports, { payload: {} }), /line_id is required/);
  await assert.rejects(core.provisionLine(fakes({ provision: ABSENT }).ports, { payload: { line_id: "l1" } }), /holds no line provider/);
  await assert.rejects(core.provisionLine(fakes({ provision: { ok: false, step: "buy", error: "no numbers" } }).ports, { payload: { line_id: "l1" } }), /stopped at buy: no numbers/);
});
