/**
 * The reply, run: every branch of the operator's reply through fakes that log
 * their calls, so what is proved is the order and the outcome, not the
 * route's text.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { importSrc } from "./_source.mjs";

const { replyToConversation, IDEMPOTENCY_WINDOW_MS, SEND_GRACE_MS } = await importSrc("packages/core/src/conversations/reply.ts");
const NOW = Date.parse("2026-09-11T12:00:00Z");
const HOUR = 3_600_000;
const iso = (ms) => new Date(ms).toISOString();
const conv = (over = {}) => ({ id: "c1", tenant_id: "t1", phone_e164: "+15550000001", contact_id: "k1", last_wa_inbound_at: iso(NOW - HOUR), consent: "opted_in", dnc: false, marketing_consent: null, ...over });
const approved = { name: "booking_link_v1", language: "en_US", body_preview: "Book with {{1}}: {{2}}", meta_status: "approved", category: "utility" };
const READS = new Set(["pauseMs", "replyChannel", "priorReceipt", "template", "templateFacts", "hash", "now"]);

/** Every port answers a value (or a function of its arguments); the writes log their call as [name, ...args]. */
function fakes(over = {}) {
  const log = [];
  const answers = {
    pauseMs: 2 * HOUR, now: () => NOW, replyChannel: "whatsapp", priorReceipt: null, template: approved,
    templateFacts: { business_name: "Melany's", booking_link: "https://book.example/m" }, hash: (s) => `h(${s})`,
    pauseBot: undefined, claimForReply: true, withdrawDrafts: 1, queue: "m1", schedule: undefined, cancelOrphan: undefined,
    record: "d1", resolveEscalation: undefined, storeReceipt: undefined,
    ...over,
  };
  const ports = {};
  for (const [name, answer] of Object.entries(answers)) {
    if (name === "now" || name === "hash") { ports[name] = answer; continue; }
    ports[name] = async (...args) => {
      if (!READS.has(name)) log.push([name, ...args]);
      return typeof answer === "function" ? answer(...args) : answer;
    };
  }
  return { ports, log, ops: () => log.map((l) => l[0]) };
}
const cmd = (over = {}) => ({ conv: conv(), userId: "u1", body: { text: "On our way." }, idempotencyKey: null, ...over });
const refused = async (p, code, words) => assert.rejects(p, (e) => e.code === code && words.test(e.message));

test("a person who opted out is refused before anything is paused or queued; so is a thread with no phone", async () => {
  const { ports, ops } = fakes();
  await refused(replyToConversation(ports, cmd({ conv: conv({ consent: "opted_out" }) })), "conflict", /opt/i);
  assert.deepEqual(ops(), []);
  const bare = fakes();
  await refused(replyToConversation(bare.ports, cmd({ conv: conv({ phone_e164: null }) })), "conflict", /phone/);
  assert.deepEqual(bare.ops(), []);
});

test("inside the window: the words go as they are; the thread is paused and claimed BEFORE any row a job could send exists; the draft is withdrawn; the receipt says so", async () => {
  const { ports, log, ops } = fakes();
  const r = await replyToConversation(ports, cmd());
  assert.deepEqual(ops(), ["pauseBot", "claimForReply", "withdrawDrafts", "queue", "schedule", "record", "resolveEscalation"]);
  assert.deepEqual(log[0], ["pauseBot", "t1", "+15550000001", NOW + 2 * HOUR]);
  assert.deepEqual(log[1], ["claimForReply", "c1", iso(NOW + 2 * HOUR), "u1", iso(NOW)]);
  assert.equal(log[3][1].body, "On our way.");
  assert.equal(log[3][1].type, "text");
  assert.equal(log[3][1].sent_by, "u1");
  assert.equal(log[3][1].channel, "whatsapp");
  assert.equal(log[4][2].toISOString(), iso(NOW + SEND_GRACE_MS));
  assert.deepEqual(log[4][3], { message_id: "m1", conversation_id: "c1", to_phone: "+15550000001", body: "On our way." });
  assert.deepEqual(log[5], ["record", "t1", "conversation", "c1", "reply", { message_id: "m1", window_open: true, template: null }]);
  assert.deepEqual(log[6], ["resolveEscalation", "c1", "d1"]);
  assert.deepEqual(r, { message_id: "m1", status: "queued", cancelable_until: iso(NOW + SEND_GRACE_MS), window_open: true, withdrawn_drafts: 1, decision_id: "d1" });
});

test("inside the window, empty text is refused; on the texting line a text over 1600 characters is refused; both before anything is touched", async () => {
  const empty = fakes();
  await refused(replyToConversation(empty.ports, cmd({ body: { text: "  " } })), "validation", /required/);
  assert.deepEqual(empty.ops(), []);
  const sms = fakes({ replyChannel: "sms" });
  await refused(replyToConversation(sms.ports, cmd({ body: { text: "x".repeat(1601) } })), "validation", /1600/);
  assert.deepEqual(sms.ops(), []);
  const fine = fakes({ replyChannel: "sms" });
  const r = await replyToConversation(fine.ports, cmd({ body: { text: "x".repeat(1600) } }));
  assert.equal(fine.log[3][1].channel, "sms");
  assert.equal(r.status, "queued");
});

test("outside the window: only an approved template goes, a promotion needs a yes to offers, and the params are the workspace's facts, never the client's", async () => {
  const closed = conv({ last_wa_inbound_at: iso(NOW - 25 * HOUR) });
  const noTemplate = fakes();
  await refused(replyToConversation(noTemplate.ports, cmd({ conv: closed })), "window_closed", /24-hour/);
  assert.deepEqual(noTemplate.ops(), []);
  const pending = fakes({ template: { ...approved, meta_status: "pending" } });
  await refused(replyToConversation(pending.ports, cmd({ conv: closed, body: { template: { name: "booking_link_v1", language: "en_US" } } })), "validation", /not approved/);
  const promo = fakes({ template: { ...approved, category: "marketing" } });
  await refused(replyToConversation(promo.ports, cmd({ conv: closed, body: { template: { name: "booking_link_v1", language: "en_US" } } })), "forbidden", /offers/);
  const yes = fakes({ template: { ...approved, category: "marketing" } });
  assert.equal((await replyToConversation(yes.ports, cmd({ conv: { ...closed, marketing_consent: "opted_in" }, body: { template: { name: "booking_link_v1", language: "en_US" } } }))).status, "queued", "a yes to offers lets the promotion through");
  const { ports, log } = fakes();
  const r = await replyToConversation(ports, cmd({ conv: closed, body: { template: { name: "booking_link_v1", language: "en_US", params: ["client", "params"] } } }));
  assert.equal(log[3][1].body, "Book with Melany's: book.example/m", "the workspace's facts, the scheme stripped, over the client's");
  assert.equal(log[3][1].type, "template");
  assert.deepEqual(log[4][3].template, { name: "booking_link_v1", language: "en_US", params: ["Melany's", "book.example/m"] });
  assert.deepEqual(log[5][5], { message_id: "m1", window_open: false, template: "booking_link_v1" });
  assert.equal(r.window_open, false);
  const bare = fakes({ templateFacts: null });
  await refused(replyToConversation(bare.ports, cmd({ conv: closed, body: { template: { name: "booking_link_v1", language: "en_US", params: ["A", "B"] } } })), "validation", /no template facts/);
  assert.deepEqual(bare.ops(), [], "the client's params are never a fallback: the browser does not choose the link that lands on a phone");
  const typed = fakes({ template: { ...approved, variables: [{ label: "Business name", position: 1 }, { label: "Offer", position: 2 }] } });
  await refused(replyToConversation(typed.ports, cmd({ conv: closed, body: { template: { name: "booking_link_v1", language: "en_US" } } })), "validation", /needs words for “Offer”/);
  assert.deepEqual(typed.ops(), [], "a template with words to write is refused here, not by Meta fifteen seconds after 'queued'");
  const two = fakes({ template: { ...approved, variables: [{ label: "Business name", position: 1 }, { label: "Booking link", position: 2 }] } });
  assert.equal((await replyToConversation(two.ports, cmd({ conv: closed, body: { template: { name: "booking_link_v1", language: "en_US" } } }))).status, "queued");
  const none = fakes({ templateFacts: null });
  await refused(replyToConversation(none.ports, cmd({ conv: closed, body: { template: { name: "booking_link_v1", language: "en_US" } } })), "validation", /no template facts/);
  assert.deepEqual(none.ops(), []);
});

test("REGRESSION (I6): a template is filled by its own slots, as broadcasts and the assistant fill them -- the workspace's starters open with the customer's first name; one with words to write is refused in its own label", async () => {
  const closed = conv({ last_wa_inbound_at: iso(NOW - 30 * HOUR), display_name: "Rosa Díaz", wa_profile_name: null });
  // The shape the salon's starters have on the row: "Value n" labels, the examples Meta read.
  const welcome = {
    name: "welcome_new", language: "en_US", body_preview: "Hi {{1}}, welcome to {{2}}! Book whenever you're ready: {{3}}", meta_status: "approved", category: "utility",
    variables: [{ label: "Value 1", example: "Dani", position: 1 }, { label: "Value 2", example: "Luna Studio", position: 2 }, { label: "Value 3", example: "https://booksy.com/luna-studio", position: 3 }],
  };
  const { ports, log } = fakes({ template: welcome });
  const r = await replyToConversation(ports, cmd({ conv: closed, body: { template: { name: "welcome_new", language: "en_US" } } }));
  assert.equal(r.status, "queued", "REGRESSION: 'This template takes 3 values; the Inbox fills two' turned away the workspace's own starter");
  assert.deepEqual(log.find((l) => l[0] === "schedule")[3].template.params, ["Rosa", "Melany's", "book.example/m"], "the first name, the business, the link: the starter's own slots");
  assert.equal(log.find((l) => l[0] === "queue")[1].body, "Hi Rosa, welcome to Melany's! Book whenever you're ready: book.example/m");

  const nameless = fakes({ template: welcome });
  await replyToConversation(nameless.ports, cmd({ conv: { ...closed, display_name: null, wa_profile_name: null }, body: { template: { name: "welcome_new", language: "en_US" } } }));
  assert.equal(nameless.log.find((l) => l[0] === "schedule")[3].template.params[0], "there", "no name on file reads 'Hi there', as a broadcast does");

  const note = { ...welcome, name: "quick_note", body_preview: "Hi {{1}}, a quick note from {{2}}: {{3}}", variables: [welcome.variables[0], welcome.variables[1], { label: "Value 3", example: "we're open late on Thursdays this month.", position: 3 }] };
  const q = fakes({ template: note });
  await refused(replyToConversation(q.ports, cmd({ conv: closed, body: { template: { name: "quick_note", language: "en_US" } } })), "validation", /needs words for “The note”, which the Inbox does not ask for/);
  assert.deepEqual(q.ops(), [], "nothing is queued for a template the Inbox cannot fill");

  const hello = fakes({ template: { name: "hello_world", language: "en_US", body_preview: "Hello World", meta_status: "approved", category: "utility", variables: [] } });
  assert.equal((await replyToConversation(hello.ports, cmd({ conv: closed, body: { template: { name: "hello_world", language: "en_US" } } }))).status, "queued", "REGRESSION: a template with nothing to fill read 'takes 0 values'");
  assert.deepEqual(hello.log.find((l) => l[0] === "schedule")[3].template.params, []);
});

test("a claim that changed no row releases the pause it mirrored and is a 409; nothing was queued", async () => {
  const { ports, log, ops } = fakes({ claimForReply: false });
  await refused(replyToConversation(ports, cmd()), "conflict", /nothing was sent/);
  assert.deepEqual(ops(), ["pauseBot", "claimForReply", "pauseBot"]);
  assert.equal(log[2][3], 0, "the second mirror releases, as take-over's does");
});

test("a job that could not be scheduled cancels the row it would have sent, and the error is the caller's", async () => {
  const { ports, log, ops } = fakes({ schedule: () => { throw new Error("queue down"); } });
  await assert.rejects(replyToConversation(ports, cmd()), /queue down/);
  assert.deepEqual(ops(), ["pauseBot", "claimForReply", "withdrawDrafts", "queue", "schedule", "cancelOrphan"]);
  assert.deepEqual(log.at(-1), ["cancelOrphan", "m1"]);
});

test("a replay: the same key and intent inside the window returns the stored receipt and sends nothing; after the window, or for a different intent, it sends and the receipt is stored under the caller's key", async () => {
  const stored = { message_id: "m0", status: "queued", cancelable_until: iso(NOW), window_open: true, withdrawn_drafts: 0 };
  const key = "u1:k1";
  const intent = 'h({"text":"On our way."})';
  const fresh = fakes({ priorReceipt: (t, k) => (k === key ? { response: stored, created_at: iso(NOW - 5_000), request_hash: intent } : null) });
  assert.deepEqual(await replyToConversation(fresh.ports, cmd({ idempotencyKey: "k1" })), stored);
  assert.deepEqual(fresh.ops(), []);
  const old = fakes({ priorReceipt: { response: stored, created_at: iso(NOW - IDEMPOTENCY_WINDOW_MS - 1), request_hash: intent } });
  assert.equal((await replyToConversation(old.ports, cmd({ idempotencyKey: "k1" }))).message_id, "m1", "an old receipt does not answer");
  const other = fakes({ priorReceipt: { response: stored, created_at: iso(NOW - 5_000), request_hash: "h(other)" } });
  assert.equal((await replyToConversation(other.ports, cmd({ idempotencyKey: "k1" }))).message_id, "m1", "a different intent under the same key goes through");
  assert.deepEqual(other.log.at(-1), ["storeReceipt", "t1", key, intent, { message_id: "m1", status: "queued", cancelable_until: iso(NOW + SEND_GRACE_MS), window_open: true, withdrawn_drafts: 1, decision_id: "d1" }]);
  // The receipt is kept the moment the send is certain: a ledger that fails
  // after the job exists still leaves a retry under the same key something
  // to find, or the customer receives the words twice.
  const ledgerDown = fakes({ record: () => { throw new Error("decisions down"); } });
  await assert.rejects(replyToConversation(ledgerDown.ports, cmd({ idempotencyKey: "k1" })), /decisions down/);
  assert.deepEqual(ledgerDown.ops(), ["pauseBot", "claimForReply", "withdrawDrafts", "queue", "schedule", "storeReceipt", "record"]);
  assert.deepEqual(ledgerDown.log[5], ["storeReceipt", "t1", key, intent, { message_id: "m1", status: "queued", cancelable_until: iso(NOW + SEND_GRACE_MS), window_open: true, withdrawn_drafts: 1 }]);
  const noKey = fakes();
  await replyToConversation(noKey.ports, cmd());
  assert.ok(!noKey.ops().includes("storeReceipt"), "no key, nothing stored");
});
