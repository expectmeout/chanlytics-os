/**
 * The send path's job verbs, run: the queued send and the line provisioning
 * through fakes that log their calls, so what is proved is the order and the
 * outcome, not the handlers' text.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { importSrc } from "./_source.mjs";

const core = await importSrc("packages/core/src/messages/index.ts");
/** A port the runtime does not hold, as opposed to one that answers null. */
const ABSENT = Symbol("absent");
const WRITES = new Set(["deliver", "escalate", "alert", "page", "provision"]);

/** Every port answers a value, a function of its arguments, or throws an Error; ABSENT leaves the port out, as a runtime that does not hold it would. */
function fakes(over = {}) {
  const log = [];
  const answers = {
    queued: { status: "queued", body: "See you at 3", channel: "whatsapp", sender: "human" },
    purposeOf: "conversational",
    deliver: { outcome: "sent", messageId: "m1", externalId: "wamid.1" },
    escalate: "opened",
    alert: undefined,
    page: undefined,
    provision: { ok: true },
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
const send = (payload = {}) => ({
  tenantId: "t1",
  payload: { message_id: "m1", conversation_id: "c1", to_phone: "+13475550101", body: "See you at 3", ...payload },
});

test("a queued row goes through the door with the row's own sender, the template's purpose, not proactive unless the job says so; a gone or handled row is a no-op", async () => {
  const { ports, log } = fakes();
  await core.sendQueued(ports, send());
  assert.equal(log.length, 1);
  assert.deepEqual(log[0][1], {
    tenantId: "t1",
    conversationId: "c1",
    contactId: null,
    to: "+13475550101",
    channel: "whatsapp",
    sender: "human",
    purpose: "conversational",
    proactive: false,
    body: "See you at 3",
    template: undefined,
    messageId: "m1",
  });
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
  const { ports, log } = fakes({
    purposeOf: "marketing",
    queued: { status: "queued", body: null, channel: "sms", sender: "human" },
  });
  const tpl = { name: "month_offer", language: "en_US", params: [] };
  await core.sendQueued(ports, send({ template: tpl, body: undefined }));
  assert.equal(log[0][1].purpose, "marketing");
  assert.equal(log[0][1].channel, "sms");
  assert.deepEqual(log[0][1].template, tpl);
  assert.equal(log[0][1].body, "", "no words of its own: the template's are the wire's");
});

test("a job may say what its send IS, and only ever more strictly: an offer is marketing whatever its template says; only true starts a conversation", async () => {
  const cases = [
    [{ purpose: "marketing" }, "conversational", "marketing", false],
    [{ purpose: "conversational" }, "marketing", "marketing", false],
    [{}, "marketing", "marketing", false],
    [{ proactive: true }, "conversational", "conversational", true],
    [{ proactive: "yes" }, "conversational", "conversational", false],
    [{ proactive: false }, "conversational", "conversational", false],
  ];
  for (const [payload, fromTemplate, purpose, proactive] of cases) {
    const { ports, log } = fakes({ purposeOf: fromTemplate });
    await core.sendQueued(ports, send(payload));
    assert.deepEqual(
      [log[0][1].purpose, log[0][1].proactive],
      [purpose, proactive],
      JSON.stringify({ payload, fromTemplate }),
    );
  }
});

test("a wire that could not carry it flags the thread and tells the owner; a provider's 401 or 403 pages the platform as well; a refusal does neither", async () => {
  const failed = fakes({
    deliver: { outcome: "failed", reason: "provider", status: 500, errorBody: "boom", messageId: "m1" },
  });
  await core.sendQueued(failed.ports, send());
  assert.deepEqual(failed.ops(), ["deliver", "escalate", "alert"]);
  assert.deepEqual(failed.log[1], [
    "escalate",
    "c1",
    "send_failed",
    "Dashboard reply could not be delivered (HTTP 500).",
  ]);
  assert.match(failed.log[2][1].subject, /Reply delivery failed: \+13475550101/);
  assert.match(failed.log[2][1].body, /HTTP 500/);
  // A reply that could not be delivered is a thread that needs a person, and its button opens THAT thread; the job itself finished.
  assert.deepEqual(
    [failed.log[2][1].kind, failed.log[2][1].route, failed.log[2][1].about],
    ["handoff", "inbox/th-c1", { type: "conversation", id: "c1" }],
  );
  const creds = fakes({
    deliver: { outcome: "failed", reason: "provider", status: 401, errorBody: "bad token", messageId: "m1" },
  });
  await core.sendQueued(creds.ports, send());
  assert.deepEqual(creds.ops(), ["deliver", "page", "escalate", "alert"]);
  assert.equal(creds.log[1][1], "provider_auth:whatsapp");
  assert.match(creds.log[1][3], /Credentials, not content/);
  const noPager = fakes({
    deliver: { outcome: "failed", reason: "provider", status: 403, errorBody: "", messageId: "m1" },
    page: ABSENT,
  });
  await core.sendQueued(noPager.ports, send());
  assert.deepEqual(noPager.ops(), ["deliver", "escalate", "alert"], "a runtime without a pager still flags and tells");
  const noWire = fakes({
    deliver: { outcome: "failed", reason: "no_credentials", status: 503, errorBody: "no_credentials", messageId: "m1" },
  });
  await core.sendQueued(noWire.ports, send());
  assert.deepEqual(
    noWire.ops(),
    ["deliver", "escalate", "alert"],
    "no credentials is the thread's problem to show, not the pager's",
  );
  assert.deepEqual(
    noWire.log[1],
    ["escalate", "c1", "send_failed", "Dashboard reply could not be delivered (the WhatsApp number is not connected)."],
    "and it is shown as what it is, never as an HTTP status",
  );
  assert.match(noWire.log[2][1].body, /the WhatsApp number is not connected/);
  const noLine = fakes({
    queued: { status: "queued", body: "See you at 3", channel: "sms", sender: "human" },
    deliver: { outcome: "failed", reason: "no_credentials", status: 503, errorBody: "no_credentials", messageId: "m1" },
  });
  await core.sendQueued(noLine.ports, send());
  assert.deepEqual(
    noLine.log[1],
    ["escalate", "c1", "send_failed", "Dashboard reply could not be delivered (the texting line is not connected)."],
    "a text is told as a text: its line, never a WhatsApp number it was not sent on",
  );
  assert.match(noLine.log[2][1].body, /the texting line is not connected/);
  const draft = fakes({
    queued: { status: "queued", body: "Hi!", channel: "whatsapp", sender: "ai" },
    deliver: { outcome: "failed", reason: "provider", status: 500, errorBody: "x", messageId: "m1" },
  });
  await core.sendQueued(draft.ports, send());
  assert.equal(
    draft.log[1][3],
    "The receptionist's reply could not be delivered (HTTP 500).",
    "a draft the receptionist queued is not 'a dashboard reply'",
  );
  const refused = fakes({ deliver: { outcome: "refused", reason: "opted_out", messageId: "m1" } });
  await core.sendQueued(refused.ports, send());
  assert.deepEqual(refused.ops(), ["deliver"], "the row says why; nobody is paged or flagged for a refusal");
});

test("an email's queued row leaves as the request it was frozen with, to the address its job names; a job that names none fails loudly rather than guessing", async () => {
  const request = { to: ["ana@example.com"], subject: "Re: Quote", idempotency_key: "m1" };
  const row = { status: "queued", body: "We can do Saturday.", channel: "email", sender: "human", email: request };
  const byEmail = (payload = {}) => ({
    tenantId: "t1",
    payload: {
      message_id: "m1",
      conversation_id: "c1",
      to_email: "ana@example.com",
      body: "We can do Saturday.",
      ...payload,
    },
  });
  const { ports, log } = fakes({ queued: row });
  await core.sendQueued(ports, byEmail());
  assert.deepEqual(log[0][1], {
    tenantId: "t1",
    conversationId: "c1",
    contactId: null,
    to: "ana@example.com",
    channel: "email",
    sender: "human",
    purpose: "conversational",
    proactive: false,
    body: "We can do Saturday.",
    template: undefined,
    email: request,
    messageId: "m1",
  });

  // A number on an email's job is not an address, and an address on a text's job is not a number.
  const crossed = fakes({ queued: row });
  await assert.rejects(
    core.sendQueued(crossed.ports, byEmail({ to_email: undefined, to_phone: "+13475550101" })),
    /goes out by email and the job names no address/,
  );
  const texted = fakes();
  await assert.rejects(core.sendQueued(texted.ports, byEmail()), /goes out by whatsapp and the job names no number/);
  assert.deepEqual([...crossed.ops(), ...texted.ops()], [], "nothing reached the door");

  // A row with no sendable request still goes to the door, which fails it by name; the owner reads words, not "HTTP 0".
  const bare = fakes({
    queued: { ...row, email: null },
    deliver: { outcome: "failed", reason: "provider", status: 0, errorBody: "no_frozen_request", messageId: "m1" },
  });
  await core.sendQueued(bare.ports, byEmail());
  assert.equal("email" in bare.log[0][1], false);
  assert.deepEqual(bare.log[1], [
    "escalate",
    "c1",
    "send_failed",
    "Dashboard reply could not be delivered (it never reached the provider).",
  ]);
  assert.match(bare.log[2][1].subject, /Reply delivery failed: ana@example\.com/);
  const unset = fakes({
    queued: row,
    deliver: { outcome: "failed", reason: "no_credentials", status: 503, errorBody: "no_credentials", messageId: "m1" },
  });
  await core.sendQueued(unset.ports, byEmail());
  assert.equal(unset.log[1][3], "Dashboard reply could not be delivered (the email channel is not connected).");
});

test("the provisioning: the saga is the edge's; a runtime without it fails loudly, and a saga that stopped names its step", async () => {
  const { ports, log } = fakes();
  await core.provisionLine(ports, { payload: { line_id: "l1", by: "sweep" } });
  assert.deepEqual(log[0], ["provision", "l1", "sweep", undefined], "no deadline: the run goes to the end");
  const who = fakes();
  await core.provisionLine(who.ports, { payload: { line_id: "l1", by: "nobody" } });
  assert.deepEqual(who.log[0], ["provision", "l1", "owner", undefined], "an unknown actor is the owner");
  await assert.rejects(core.provisionLine(fakes().ports, { payload: {} }), /line_id is required/);
  await assert.rejects(
    core.provisionLine(fakes({ provision: ABSENT }).ports, { payload: { line_id: "l1" } }),
    /holds no line provider/,
  );
  await assert.rejects(
    core.provisionLine(fakes({ provision: { ok: false, step: "buy", error: "no numbers" } }).ports, {
      payload: { line_id: "l1" },
    }),
    /stopped at buy: no numbers/,
  );
});

test("a limit at the mail provider is said as one: a used-up day or month is recorded for the platform, a busy second and a try still in flight are not, and a text's 429 is still a status", async () => {
  const emailRow = {
    status: "queued",
    body: "We can do Saturday.",
    channel: "email",
    sender: "human",
    email: { to: ["ana@example.com"], idempotency_key: "m1" },
  };
  const byEmail = {
    tenantId: "t1",
    payload: { message_id: "m1", conversation_id: "c1", to_email: "ana@example.com", body: "We can do Saturday." },
  };
  // The door names the limit (deliver.ts, from the provider's answer); the verb reads only what the door says.
  const refusedBy = (limit) => ({
    outcome: "failed",
    reason: "provider",
    status: 429,
    errorBody: "{}",
    messageId: "m1",
    ...(limit ? { limit } : {}),
  });
  const day = fakes({ queued: emailRow, deliver: refusedBy("daily") });
  await core.sendQueued(day.ports, byEmail);
  assert.deepEqual(day.ops(), ["deliver", "page", "escalate", "alert"]);
  assert.deepEqual(
    [day.log[1][1], day.log[1][2]],
    ["provider_quota:email", "email: the daily sending limit is used up"],
  );
  assert.equal(
    day.log[2][3],
    "Dashboard reply could not be delivered (the mail provider's sending limit is used up for now).",
  );
  const busy = fakes({ queued: emailRow, deliver: refusedBy("rate") });
  await core.sendQueued(busy.ports, byEmail);
  assert.deepEqual(busy.ops(), ["deliver", "escalate", "alert"], "a busy second is nobody's page");
  assert.equal(busy.log[1][3], "Dashboard reply could not be delivered (the mail provider asked us to slow down).");
  const month = fakes({ queued: emailRow, deliver: refusedBy("monthly") });
  await core.sendQueued(month.ports, byEmail);
  assert.deepEqual(month.ops(), ["deliver", "page", "escalate", "alert"]);
  assert.equal(month.log[1][2], "email: the monthly sending limit is used up");
  assert.equal(
    month.log[2][3],
    "Dashboard reply could not be delivered (the mail provider's sending limit is used up for now).",
  );
  // A try still being worked may yet arrive: the owner is told to look before sending again, and nobody is paged.
  const inFlight = fakes({ queued: emailRow, deliver: refusedBy("in_flight") });
  await core.sendQueued(inFlight.ports, byEmail);
  assert.deepEqual(inFlight.ops(), ["deliver", "escalate", "alert"]);
  assert.equal(
    inFlight.log[1][3],
    "Dashboard reply could not be delivered (the mail provider is still sending an earlier try of it; check the thread before sending it again).",
  );
  const text = fakes({ deliver: refusedBy(null) });
  await core.sendQueued(text.ports, send());
  assert.equal(
    text.log[1][3],
    "Dashboard reply could not be delivered (HTTP 429).",
    "a refusal the door names no limit for is said as its status",
  );
});

test("outreach is its own lane: it reaches the door as outreach, and its limits and its key page under their own name", async () => {
  const coldRow = {
    status: "queued",
    body: "Saw your shop on the map.",
    channel: "email",
    sender: "ai",
    email: { to: ["owner@example.com"], idempotency_key: "m1" },
  };
  const cold = (over = {}) => ({
    tenantId: "t1",
    payload: {
      message_id: "m1",
      conversation_id: "c1",
      to_email: "owner@example.com",
      purpose: "outreach",
      proactive: true,
      ...over,
    },
  });
  const sent = fakes({ queued: coldRow });
  await core.sendQueued(sent.ports, cold());
  assert.deepEqual([sent.log[0][1].purpose, sent.log[0][1].proactive], ["outreach", true]);
  // A template's own purpose still wins over a payload that says conversational (it can only tighten).
  const offer = fakes({ purposeOf: "marketing" });
  await core.sendQueued(offer.ports, send({ purpose: "conversational" }));
  assert.equal(offer.log[0][1].purpose, "marketing");

  const failed = (status, limit) => ({
    outcome: "failed",
    reason: "provider",
    status,
    errorBody: "{}",
    messageId: "m1",
    ...(limit ? { limit } : {}),
  });
  const day = fakes({ queued: coldRow, deliver: failed(429, "daily") });
  await core.sendQueued(day.ports, cold());
  const [, key, title, body] = day.log.find((l) => l[0] === "page");
  assert.equal(key, "provider_quota:email_outreach");
  assert.equal(title, "cold email: the daily sending limit is used up");
  assert.match(body, /Cold email is refused until it resets\. Replies and reminders are not affected\./);
  const auth = fakes({ queued: coldRow, deliver: failed(401) });
  await core.sendQueued(auth.ports, cold());
  assert.equal(auth.log.find((l) => l[0] === "page")[1], "provider_auth:email_outreach");
  // A reply's limit is still every workspace's.
  const reply = fakes({ queued: coldRow, deliver: failed(429, "daily") });
  await core.sendQueued(reply.ports, cold({ purpose: undefined, proactive: undefined }));
  assert.equal(reply.log.find((l) => l[0] === "page")[1], "provider_quota:email");
});
