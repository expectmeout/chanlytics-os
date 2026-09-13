/**
 * The broadcast batch, run: every branch of one batch through fakes that log
 * their calls. Until now this was the one handler no test executed.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { importSrc } from "./_source.mjs";

const { sendBroadcastBatch, BROADCAST_STALL_RETRY_MS } = await importSrc("packages/core/src/messages/broadcast.ts");
const { BROADCAST_CHUNK } = await import("@chanlytics/contracts");
const NOW = Date.parse("2026-09-11T12:00:00Z");
const WRITES = new Set(["fail", "startSending", "mark", "deliver", "scheduleNext", "finish", "alert", "sleep"]);

const broadcast = (over = {}) => ({ id: "b1", state: "scheduled", name: "Spring offer", template_name: "month_offer", template_language: "en_US", params: [{ kind: "first_name" }, { kind: "business_name" }], recipient_count: 2, playbook_id: null, audience: null, ...over });
const approved = { meta_status: "approved", body_preview: "Hi {{1}}, a spring offer from {{2}}.", category: "marketing" };
const contacts = {
  k1: { id: "k1", phone_e164: "+13475550101", erased_at: null, display_name: "Ada Lovelace", wa_profile_name: null },
  k2: { id: "k2", phone_e164: "+13475550102", erased_at: null, display_name: null, wa_profile_name: "Bo" },
};

/** Every port answers a value or a function of its arguments; the writes log their call as [name, ...args]. */
function fakes(over = {}) {
  const log = [];
  const answers = {
    broadcast: broadcast(), workspacePaused: false, template: approved, facts: { businessName: "Melany's", bookingLink: "https://book.example/m" },
    batch: [{ contact_id: "k1", facts: null }, { contact_id: "k2", facts: null }], contacts: (ids) => new Map(ids.filter((id) => contacts[id]).map((id) => [id, contacts[id]])),
    target: (phone) => ({ conversationId: `c-${phone.slice(-2)}` }), alreadySent: () => new Map(), remaining: 0, state: "sending", tally: { sent: 2, held: 0 }, now: () => NOW,
    fail: undefined, startSending: true, mark: undefined, deliver: (d) => ({ outcome: "sent", messageId: `m-${d.contactId}`, externalId: "wamid" }),
    scheduleNext: undefined, finish: undefined, alert: undefined, sleep: undefined,
    ...over,
  };
  const ports = {};
  for (const [name, answer] of Object.entries(answers)) {
    if (name === "now") { ports[name] = answer; continue; }
    ports[name] = async (...args) => {
      if (WRITES.has(name)) log.push([name, ...args]);
      if (answer instanceof Error) throw answer;
      return typeof answer === "function" ? answer(...args) : answer;
    };
  }
  return { ports, log, ops: () => log.map((l) => l[0]), marks: () => log.filter((l) => l[0] === "mark").map((l) => [l[2], l[3].state, l[3].reason ?? null]) };
}
const cmd = (over = {}) => ({ tenantId: "t1", broadcastId: "b1", deadline: NOW + 60_000, ...over });

test("a broadcast that is gone, or in any state but scheduled or sending, sends nothing and touches nothing", async () => {
  const gone = fakes({ broadcast: null });
  await sendBroadcastBatch(gone.ports, cmd());
  assert.deepEqual(gone.ops(), []);
  for (const state of ["pending_approval", "sent", "canceled", "failed"]) {
    const f = fakes({ broadcast: broadcast({ state }) });
    await sendBroadcastBatch(f.ports, cmd());
    assert.deepEqual(f.ops(), [], state);
  }
});

test("a paused workspace fails the run with its reason and tells the owner, before the template is even read", async () => {
  const { ports, log, ops } = fakes({ workspacePaused: true, template: new Error("must not be read") });
  await sendBroadcastBatch(ports, cmd());
  assert.deepEqual(ops(), ["fail", "alert"]);
  assert.deepEqual(log[0], ["fail", "b1", "paused"]);
  assert.match(log[1][2], /paused until billing resumes, so nothing went out/);
});

test("a template Meta withdrew fails the broadcast before a single send; a scheduled run is marked sending first", async () => {
  const { ports, log, ops } = fakes({ template: { ...approved, meta_status: "rejected" } });
  await sendBroadcastBatch(ports, cmd());
  assert.deepEqual(ops(), ["startSending", "fail", "alert"]);
  assert.deepEqual(log[1], ["fail", "b1", "template_not_approved"]);
  assert.match(log[2][2], /no longer approved by WhatsApp/);
  const missing = fakes({ template: null });
  await sendBroadcastBatch(missing.ports, cmd());
  assert.deepEqual(missing.ops(), ["startSending", "fail", "alert"]);
  const sending = fakes({ broadcast: broadcast({ state: "sending" }), template: null });
  await sendBroadcastBatch(sending.ports, cmd());
  assert.deepEqual(sending.ops(), ["fail", "alert"], "already sending: not marked again");
});

test("each person goes through the door with the template's purpose, proactive, as a person's words, with their own words in the slots; the row says what happened", async () => {
  const { ports, log, marks } = fakes();
  await sendBroadcastBatch(ports, cmd());
  const sends = log.filter((l) => l[0] === "deliver").map((l) => l[1]);
  assert.equal(sends.length, 2);
  assert.deepEqual(sends[0], {
    tenantId: "t1", conversationId: "c-01", contactId: "k1", to: "+13475550101", channel: "whatsapp", sender: "human", kind: "broadcast", purpose: "marketing", proactive: true,
    body: "Hi Ada, a spring offer from Melany's.", template: { name: "month_offer", language: "en_US", params: ["Ada", "Melany's"] },
    meta: { source: "broadcast", broadcast_id: "b1", broadcast_name: "Spring offer" },
  });
  assert.equal(sends[1].body, "Hi Bo, a spring offer from Melany's.", "the profile name when no display name is on file");
  assert.deepEqual(marks(), [["k1", "sent", null], ["k2", "sent", null]]);
  assert.equal(log.filter((l) => l[0] === "mark")[0][3].message_id, "m-k1");
  assert.equal(log.filter((l) => l[0] === "sleep").length, 1, "a breath between two people, none after the last");
  const utility = fakes({ template: { ...approved, category: "utility" }, broadcast: broadcast({ playbook_id: "p1", audience: { label: "Win-back" } }) });
  await sendBroadcastBatch(utility.ports, cmd());
  const d = utility.log.find((l) => l[0] === "deliver")[1];
  assert.equal(d.purpose, "conversational", "Meta's category decides which yes is needed");
  assert.deepEqual(d.meta, { source: "broadcast", broadcast_id: "b1", broadcast_name: "Spring offer", playbook_id: "p1", playbook_name: "Win-back" }, "a run's message names its playbook");
});

test("held with their reason: a row that is gone, erased, no number, no thread and an unfillable slot are held, and none of them reach the door", async () => {
  const rows = { k1: { ...contacts.k1, erased_at: "2026-09-01T00:00:00Z" }, k2: { ...contacts.k2, phone_e164: null }, k3: contacts.k1 && { ...contacts.k1, id: "k3", phone_e164: "+13475550103" }, k4: { ...contacts.k1, id: "k4", phone_e164: "+13475550104" } };
  // A first name nobody has on file reads "there", so the slot no row can fill is a visit run's word.
  const { ports, log, marks } = fakes({
    broadcast: broadcast({ params: [{ kind: "first_name" }, { kind: "visit_when" }] }),
    batch: [{ contact_id: "k1", facts: null }, { contact_id: "k2", facts: null }, { contact_id: "k3", facts: null }, { contact_id: "k4", facts: {} }, { contact_id: "k9", facts: null }],
    contacts: (ids) => new Map(ids.filter((id) => rows[id]).map((id) => [id, rows[id]])),
    target: (phone) => (phone.endsWith("03") ? null : { conversationId: "c" }),
    remaining: 1, state: "sending",
  });
  await sendBroadcastBatch(ports, cmd());
  assert.deepEqual(marks(), [["k1", "skipped", "erased"], ["k2", "skipped", "no_phone"], ["k3", "skipped", "no_thread"], ["k4", "skipped", "missing_value"], ["k9", "skipped", "erased"]]);
  assert.equal(log.filter((l) => l[0] === "deliver").length, 0);
  assert.deepEqual(log.at(-1), ["scheduleNext", "b1"], "and the rest follow in the next batch, at once: this one made progress");
});

test("a cancel that landed between the read and the claim: the row did not change, so nothing is sent and nothing is said", async () => {
  const { ports, ops } = fakes({ startSending: false });
  await sendBroadcastBatch(ports, cmd());
  assert.deepEqual(ops(), ["startSending"]);
});

test("one person's failure is never the batch's: a thread or a wire that could not be read leaves them queued, and the rest are reached", async () => {
  const thread = fakes({ target: (phone) => { if (phone.endsWith("01")) throw new Error("PostgREST blip"); return { conversationId: "c" }; }, remaining: 1 });
  await sendBroadcastBatch(thread.ports, cmd());
  assert.deepEqual(thread.marks(), [["k2", "sent", null]], "k1 stays queued for the next batch; k2 is sent");
  const wire = fakes({ deliver: (d) => { if (d.contactId === "k1") throw new Error("cannot read the wire"); return { outcome: "sent", messageId: `m-${d.contactId}`, externalId: "wamid" }; }, remaining: 1 });
  await sendBroadcastBatch(wire.ports, cmd());
  assert.deepEqual(wire.marks(), [["k2", "sent", null]]);
  assert.deepEqual(wire.log.at(-1), ["scheduleNext", "b1"], "progress was made, so the rest follow at once");
});

test("a batch whose people could not be read leaves them all queued and waits before the next: trying again this second would spin the ledger", async () => {
  const { ports, log } = fakes({ contacts: () => { throw new Error("PostgREST down"); }, remaining: 2 });
  await sendBroadcastBatch(ports, cmd());
  assert.ok(!log.some((l) => l[0] === "mark" || l[0] === "deliver"), "nobody is guessed about");
  assert.deepEqual(log.at(-1), ["scheduleNext", "b1", new Date(NOW + BROADCAST_STALL_RETRY_MS)]);
});

test("a batch whose prior sends could not be read is left queued as well: 'could not check' is not 'never sent'", async () => {
  const { ports, log } = fakes({ alreadySent: () => { throw new Error("PostgREST down"); }, remaining: 2 });
  await sendBroadcastBatch(ports, cmd());
  assert.deepEqual(log.at(-1), ["scheduleNext", "b1", new Date(NOW + BROADCAST_STALL_RETRY_MS)]);
});

test("a wire that is down stops the run at the first person it cannot reach, says why, and burns nobody else as refused", async () => {
  const { ports, log, marks, ops } = fakes({ deliver: { outcome: "failed", reason: "no_credentials", status: 503, errorBody: "no_credentials", messageId: "m-k1" }, remaining: 1 });
  await sendBroadcastBatch(ports, cmd());
  assert.deepEqual(marks(), [["k1", "failed", "send_failed"]]);
  assert.deepEqual(ops(), ["startSending", "deliver", "mark", "fail", "alert"], "one person through the door, then the run stops");
  assert.deepEqual(log[3], ["fail", "b1", "wire_unavailable"]);
  assert.match(log[4][2], /the number is not connected/);
  const token = fakes({ deliver: { outcome: "failed", reason: "provider", status: 401, errorBody: "bad token", messageId: "m-k1" } });
  await sendBroadcastBatch(token.ports, cmd());
  assert.deepEqual(token.log.find((l) => l[0] === "fail"), ["fail", "b1", "wire_unavailable"], "a provider refusing the credentials is the wire, not the person");
  assert.match(token.log.at(-1)[2], /HTTP 401/);
});

test("the door's answer is the row's: refused holds with the door's reason, failed is a failed row with the message it wrote", async () => {
  const { ports, marks } = fakes({
    deliver: (d) => (d.contactId === "k1" ? { outcome: "refused", reason: "no_marketing_consent", messageId: null } : { outcome: "failed", reason: "provider", status: 500, errorBody: "x", messageId: "m-k2" }),
  });
  await sendBroadcastBatch(ports, cmd());
  assert.deepEqual(marks(), [["k1", "skipped", "no_marketing_consent"], ["k2", "failed", "send_failed"]]);
});

test("the deadline: at least one person, no new send after it, and the rest carried by the next batch", async () => {
  let t = NOW;
  const { ports, log, ops } = fakes({ now: () => t, sleep: () => { t += 120_000; }, remaining: 1 });
  await sendBroadcastBatch(ports, cmd({ deadline: NOW + 60_000 }));
  assert.equal(log.filter((l) => l[0] === "deliver").length, 1, "one send, then the clock had run out");
  assert.equal(ops().at(-1), "scheduleNext");
});

test("people still queued: the next batch is scheduled, unless a cancel landed meanwhile; none left: the broadcast is finished, the tally recorded and the owner told", async () => {
  const more = fakes({ remaining: 3, state: "sending" });
  await sendBroadcastBatch(more.ports, cmd());
  assert.deepEqual(more.log.at(-1), ["scheduleNext", "b1"]);
  const canceled = fakes({ remaining: 3, state: "canceled" });
  await sendBroadcastBatch(canceled.ports, cmd());
  assert.ok(!canceled.ops().includes("scheduleNext") && !canceled.ops().includes("finish"), "a cancel during the batch stops here");
  const { ports, log } = fakes({ remaining: 0, tally: { sent: 1, held: 1 } });
  await sendBroadcastBatch(ports, cmd());
  assert.deepEqual(log.at(-2), ["finish", "b1", { sent: 1, held: 1 }]);
  assert.equal(log.at(-1)[1], "Broadcast “Spring offer” sent");
  assert.match(log.at(-1)[2], /^1 person got it; 1 held back \(no recorded yes, asked to stop, no number, or a person had the thread\)\. Replies land in the Inbox\.$/);
  assert.equal(BROADCAST_CHUNK, 25);
});

test("a resumed batch reads the message a dying run left rather than sending it again", async () => {
  // A run that died between the wire and its bookkeeping left k1 a message row
  // (deliver writes it after the provider accepts) and a queued recipient row.
  // The fresh run jobs/settle schedules finds the row: k1 is marked sent with
  // that message, nothing goes to them twice, and k2 -- who has no row -- is
  // sent as normal.
  const f = fakes({ alreadySent: (id, ids) => new Map(id === "b1" && ids.includes("k1") ? [["k1", "m-earlier"]] : []) });
  await sendBroadcastBatch(f.ports, cmd());
  const sends = f.log.filter((l) => l[0] === "deliver").map((l) => l[1].contactId);
  assert.deepEqual(sends, ["k2"], "k1 is not sent again");
  assert.deepEqual(f.marks(), [["k1", "sent", null], ["k2", "sent", null]]);
  assert.deepEqual(f.log.find((l) => l[0] === "mark" && l[2] === "k1")[3], { state: "sent", message_id: "m-earlier" }, "the row it already had");
  assert.deepEqual(f.ops().filter((o) => o === "finish"), ["finish"], "and the run completes");
});
