/**
 * A member begins a conversation (core conversations/begin.ts), run over fakes that log their calls: what is refused
 * before a thread is opened, what the reply verb is handed, what a first text and a start carry, and who has the thread
 * after. The reply verb underneath is the real one.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { channelsReady } from "@chanlytics/contracts";

const { beginConversation, mayBegin } = await import("../../../../packages/core/src/conversations/begin.ts");

const NOW = Date.parse("2026-10-07T15:00:00Z");
const HOUR = 3_600_000;
const iso = (ms) => new Date(ms).toISOString();
const READY = channelsReady({
  whatsapp: { canSend: true, refusal: null },
  textLine: { sms_state: "active", reg_mock: false },
  email: { mailbox: true, domain: true },
});
/** People's row for someone who said yes on WhatsApp and by text, in person, and never wrote or called. */
const ROW = {
  phone_e164: "+12125550143",
  email: "robin@example.com",
  email_suppressed_at: null,
  consent: "opted_in",
  dnc: false,
  marketing_consent: "unknown",
  consent_channels: ["whatsapp", "sms"],
  marketing_channels: null,
  email_marketing: "unknown",
  last_inbound_channel: null,
  last_wrote_at: null,
  last_inbound_call_at: null,
  latest_wa_inbound_at: null,
  deal_id: null,
  latest_conversation_id: null,
};
/** The line the first text to a number carries, as channels says it (SMS_FOOTER), and a first text with it on. */
const LINE = "Msg & data rates may apply. Reply STOP to opt out, HELP for help.";
const FIRST = `Following up on your quote.\n${LINE}`;
/** Their thread, as the reply verb reads one: just opened, nothing in it. */
const CONV = {
  id: "c9",
  tenant_id: "t1",
  phone_e164: "+12125550143",
  contact_id: "k1",
  last_wa_inbound_at: null,
  consent: "opted_in",
  dnc: false,
  marketing_consent: "unknown",
  display_name: "Robin Example",
  wa_profile_name: null,
  email: "robin@example.com",
  email_suppressed_at: null,
};
const APPROVED = {
  name: "visit_follow_up",
  language: "en_US",
  body_preview: "Hello from {{1}}",
  meta_status: "approved",
  category: "utility",
};

function world(over = {}) {
  const log = [];
  const port =
    (name, answer) =>
    async (...args) => {
      log.push([name, ...args]);
      return typeof answer === "function" ? answer(...args) : answer;
    };
  const reply = {
    pauseMs: async () => 24 * HOUR,
    now: () => NOW,
    replyChannel: port("replyChannel", "whatsapp"),
    claimKey: port("claimKey", { won: true }),
    takeKey: port("takeKey", true),
    releaseKey: port("releaseKey"),
    template: async () => APPROVED,
    templateFacts: async () => ({ business_name: "Harbor Studio", booking_link: "https://book.example/h" }),
    hash: (s) => `h(${s})`,
    claimForReply: port("claimForReply", true),
    takeControl: port("takeControl"),
    withdrawDrafts: port("withdrawDrafts", 0),
    queue: port("queue", "m1"),
    schedule: port("schedule"),
    cancelOrphan: port("cancelOrphan"),
    record: port("record", "d1"),
    resolveEscalation: port("resolveEscalation"),
    storeReceipt: port("storeReceipt", true),
    email: {
      newId: () => "id-1",
      parent: async () => null,
      freeze: async () => null,
      first: port("email.first", {
        request: { to: ["robin@example.com"], subject: "Your quote", idempotency_key: "id-1" },
        subject: "Your quote",
      }),
      lastSubject: async () => null,
    },
  };
  // The hand-back is one door (00383): the release, the hold let go, the decision and the escalation, one call.
  const handBack = { handBack: port("handBack", { decision_id: "d2" }) };
  const ports = {
    reply,
    handBack,
    person: port("person", ROW),
    ready: async () => READY,
    open: port("open", CONV),
    textedBefore: port("textedBefore", false),
    // As the dashboard wires it over channels' smsBody: the words and the line whole, or nothing.
    firstText: (t) => (t.length + 1 + LINE.length > 1600 ? null : `${t}\n${LINE}`),
    keepNote: port("keepNote", "n1"),
    ...over,
  };
  return { ports, log, ops: () => log.map((l) => l[0]), call: (n) => log.find((l) => l[0] === n) };
}
const cmd = (over = {}) => ({
  tenantId: "t1",
  personId: "k1",
  userId: "u1",
  wire: "sms",
  body: { text: "Following up on your quote." },
  then: "me",
  ...over,
});
const refused = (p, code, words) => assert.rejects(p, (e) => e.code === code && words.test(e.message));
/** A port that answers one thing and is not logged. */
const port2 = (answer) => async () => answer;

test("a wire that cannot carry it is refused in its own words before a thread is opened or a row written", async () => {
  // No yes covering email, no history: a first email is an offer, and goes from Campaigns.
  const w = world();
  await refused(beginConversation(w.ports, cmd({ wire: "email" })), "conflict", /goes from Campaigns/);
  assert.deepEqual(w.ops(), ["person"]);
  // Nobody of that id in this workspace.
  const gone = world({ person: async () => null });
  await refused(beginConversation(gone.ports, cmd()), "not_found", /not in your workspace/);
  assert.deepEqual(gone.ops(), []);
});

test("a wire that carries only an approved message refuses words, before a thread is opened", async () => {
  const w = world();
  await refused(beginConversation(w.ports, cmd({ wire: "whatsapp" })), "window_closed", /approved ahead of time/);
  assert.deepEqual(w.ops(), ["person"]);
});

test("a first text: the thread is opened, the words carry the way to stop, the job is told it starts", async () => {
  const w = world();
  const out = await beginConversation(w.ports, cmd());
  assert.deepEqual(w.call("open").slice(1), ["t1", "k1"]);
  assert.equal(w.call("queue")[1].channel, "sms", "the wire is the member's choice, not where they last wrote");
  assert.equal(w.call("queue")[1].body, FIRST);
  assert.equal(w.call("replyChannel"), undefined, "the thread's own wire is never asked");
  assert.deepEqual(w.call("schedule")[3], {
    message_id: "m1",
    conversation_id: "c9",
    to_phone: "+12125550143",
    body: FIRST,
    starts: true,
  });
  assert.equal(w.call("record")[5].starts, true);
  assert.equal(w.call("claimKey"), undefined, "no key was handed in, so none is claimed");
  assert.deepEqual(
    { conversation_id: out.conversation_id, handed_back: out.handed_back, status: out.status },
    { conversation_id: "c9", handed_back: false, status: "queued" },
  );
  assert.equal(w.call("handBack"), undefined, "the member keeps the thread");
  assert.deepEqual([out.note_kept, out.note_id], [null, null], "no note was asked");
});

test("a message the reply verb would refuse opens no thread: the words, their length, the approved message, the subject", async () => {
  const sent = (over) =>
    cmd({ wire: "whatsapp", body: { template: { name: "visit_follow_up", language: "en_US" } }, ...over });
  // No words.
  const none = world();
  await refused(beginConversation(none.ports, cmd({ body: { text: "   " } })), "validation", /Write the message first/);
  assert.deepEqual(none.ops(), ["person"]);
  // Over the wire's own length.
  const long = world();
  await refused(beginConversation(long.ports, cmd({ body: { text: "x".repeat(1601) } })), "validation", /at most 1600/);
  assert.deepEqual(long.ops(), ["person"]);
  // Within it, with no room left for the line a first text carries: refused, never sent with the line cut off.
  const tight = world();
  await refused(
    beginConversation(tight.ports, cmd({ body: { text: "x".repeat(1590) } })),
    "validation",
    /leaves no room for it/,
  );
  assert.deepEqual(tight.ops(), ["person"]);
  // An approved message that is not approved any more.
  const gone = world();
  gone.ports.reply.template = async () => ({ ...APPROVED, meta_status: "pending" });
  await refused(beginConversation(gone.ports, sent()), "validation", /not found or not approved/);
  assert.deepEqual(gone.ops(), ["person"]);
  // A promotion, to someone with no yes to offers.
  const offer = world();
  offer.ports.reply.template = async () => ({ ...APPROVED, category: "marketing" });
  await refused(beginConversation(offer.ports, sent()), "forbidden", /has not said yes to offers/);
  assert.deepEqual(offer.ops(), ["person"]);
  // What else the verb asks of an approved message, by its own function: a slot the Inbox does not fill, the
  // workspace's facts, a booking link the message sends and the workspace has none of.
  const slot = world();
  slot.ports.reply.template = async () => ({
    ...APPROVED,
    body_preview: "Hi {{1}}, {{2}}",
    variables: [
      { position: 1, label: "First name", example: "Robin" },
      { position: 2, label: "Your note", example: "See you soon" },
    ],
  });
  await assert.rejects(beginConversation(slot.ports, sent()), (e) => e.code === "validation");
  assert.deepEqual(slot.ops(), ["person"]);
  const factless = world();
  factless.ports.reply.templateFacts = async () => null;
  await refused(beginConversation(factless.ports, sent()), "validation", /no template facts/);
  assert.deepEqual(factless.ops(), ["person"]);
  // A first email with no subject, to someone with no thread of theirs to find one on.
  const bare = world({ person: async () => ({ ...ROW, deal_id: "d1" }) });
  await refused(
    beginConversation(bare.ports, cmd({ wire: "email", body: { text: "Following up." } })),
    "validation",
    /needs a subject/,
  );
  assert.equal(bare.call("open"), undefined, "no thread was opened");
});

test("someone who phoned is answered, and their first text still says how to stop; a later one does not say it again", async () => {
  const phoned = { ...ROW, consent: "unknown", last_inbound_call_at: iso(NOW - 30 * HOUR) };
  const w = world({ person: async () => phoned });
  await beginConversation(w.ports, cmd());
  assert.equal("starts" in w.call("schedule")[3], false, "no start: they called, and this answers them");
  assert.equal(
    w.call("queue")[1].body,
    FIRST,
    "and still the first text of ours to reach them, so it says how to stop",
  );
  assert.equal(w.call("textedBefore"), undefined, "nobody with no thread has had a text from us");
  // A thread a text of ours has reached: the line was said then.
  const again = world({
    person: async () => ({ ...phoned, latest_conversation_id: "c9" }),
    textedBefore: port2(true),
  });
  await beginConversation(again.ports, cmd());
  assert.equal(again.call("queue")[1].body, "Following up on your quote.");
});

test("a thread the caller holds is written on as it stands: nothing is opened (the thread's own reply box)", async () => {
  const w = world();
  const out = await beginConversation(w.ports, cmd({ conv: { ...CONV, id: "c7" } }));
  assert.equal(w.call("open"), undefined);
  assert.deepEqual(w.call("textedBefore").slice(1), ["t1", "c7"], "what has reached them is asked of that thread");
  assert.deepEqual([out.conversation_id, w.call("queue")[1].conversation_id], ["c7", "c7"]);
});

test("a retry after a failure past the job queues nothing twice: the verb keeps its receipt under the key it is handed", async () => {
  // The keys as the table keeps them: claimed once, the receipt kept before the job exists, let go only by a send
  // that did not happen.
  const held = new Map();
  const keyed = (w) => {
    Object.assign(w.ports.reply, {
      claimKey: async (_t, key, hash, nowIso) => {
        if (held.has(key)) return { won: false, held: held.get(key) };
        held.set(key, { response: null, created_at: nowIso, request_hash: hash });
        return { won: true };
      },
      storeReceipt: async (_t, key, _hash, response) => {
        held.set(key, { ...held.get(key), response });
        return true;
      },
      releaseKey: async (_t, key) => void held.delete(key),
    });
    return w;
  };
  const pressed = cmd({ idempotencyKey: "press-1", then: "receptionist", note: "Oct 7: the team wrote to them." });
  const first = keyed(world());
  first.ports.reply.record = async () => {
    throw new Error("the ledger is down");
  };
  await assert.rejects(beginConversation(first.ports, pressed), /the ledger is down/);
  assert.ok(first.call("schedule"), "the message was queued and its job scheduled before the failure");
  assert.equal(first.call("keepNote"), undefined);
  // The same press again. By now that text has reached them, so the line would not be added: the intent is the words
  // written, and is the same intent either way.
  const retry = keyed(
    world({ person: async () => ({ ...ROW, latest_conversation_id: "c9" }), textedBefore: port2(true) }),
  );
  const out = await beginConversation(retry.ports, pressed);
  assert.equal(retry.call("queue"), undefined, "nothing is queued a second time");
  assert.equal(retry.call("schedule"), undefined, "and no second job");
  assert.deepEqual([out.message_id, out.status], ["m1", "queued"], "it is answered with the first receipt");
  assert.ok(retry.call("keepNote") && retry.call("handBack"), "and what had not followed the send follows it now");
  assert.deepEqual([out.note_kept, out.handed_back], [true, true]);
});

test("an approved message on WhatsApp goes as the reply verb sends one", async () => {
  const w = world();
  await beginConversation(
    w.ports,
    cmd({ wire: "whatsapp", body: { template: { name: "visit_follow_up", language: "en_US" } } }),
  );
  assert.equal(w.call("queue")[1].type, "template");
  assert.equal(w.call("queue")[1].template_name, "visit_follow_up");
  assert.equal(w.call("schedule")[3].starts, true);
});

test("a first email names its subject and is frozen before the thread is claimed", async () => {
  // A deal on record: an email about their own business with the workspace needs only their address.
  const w = world({ person: async () => ({ ...ROW, deal_id: "d1" }) });
  await beginConversation(
    w.ports,
    cmd({ wire: "email", body: { text: "Following up on your quote.", subject: "Your quote" } }),
  );
  assert.equal(w.call("email.first")[1].subject, "Your quote");
  assert.equal(w.call("schedule")[3].to_email, "robin@example.com");
  assert.ok(w.ops().indexOf("email.first") < w.ops().indexOf("claimForReply"));
});

test("for the receptionist: the message is queued as the member's own, then the thread is handed back at once", async () => {
  const w = world();
  const out = await beginConversation(w.ports, cmd({ then: "receptionist" }));
  const ops = w.ops();
  assert.ok(ops.indexOf("schedule") < ops.indexOf("handBack"), "queued first, handed back after");
  assert.deepEqual(w.call("handBack").slice(1), ["t1", "c9"], "the door, with the thread: the decision is its own");
  assert.equal(ops.filter((o) => o === "handBack").length, 1, "one call hands it back whole");
  assert.equal(out.handed_back, true);
});

test("the plan is kept as a note once the message is queued and before the thread is handed back; one not kept is said", async () => {
  const w = world();
  const note = "Oct 7: the team wrote to them. It was about: the quote.";
  const out = await beginConversation(w.ports, cmd({ then: "receptionist", note }));
  const ops = w.ops();
  assert.ok(
    ops.indexOf("schedule") < ops.indexOf("keepNote") && ops.indexOf("keepNote") < ops.indexOf("handBack"),
    "queued, then the note, then handed back: the receptionist never answers without the plan",
  );
  assert.deepEqual(w.call("keepNote").slice(1), ["k1", note]);
  assert.deepEqual([out.note_kept, out.note_id], [true, "n1"], "named, so a send taken back takes its note with it");
  const lost = world({
    keepNote: async () => {
      throw new Error("the door is shut");
    },
  });
  const out2 = await beginConversation(lost.ports, cmd({ then: "receptionist", note }));
  assert.deepEqual(
    [out2.status, out2.note_kept, out2.handed_back],
    ["queued", false, true],
    "the message is on its way, the receipt says the note was not kept, and the thread still went back",
  );
});

test("a thread that could not be handed back is still the member's, and the message is still on its way", async () => {
  const w = world();
  w.ports.handBack.handBack = async () => null;
  const out = await beginConversation(w.ports, cmd({ then: "receptionist" }));
  assert.ok(w.call("schedule"), "the message was queued");
  assert.equal(out.status, "queued", "a queued message never reads as one that failed");
  assert.equal(out.handed_back, false, "and the receipt says who has the thread");
});

test("the questions a start is asked, asked by themselves: the way and the words as they leave, and nothing opened or written", async () => {
  // What a draft asks before it says a first message can go (Ask's reply card on a thread nothing has come to).
  const ask = { tenantId: "t1", personId: "k1", wire: "sms", body: { text: "Following up on your quote." } };
  const w = world();
  const { way, leavesAs } = await mayBegin(w.ports, ask);
  assert.deepEqual([way.wire, way.ok, way.starts, way.carries], ["sms", true, true, "words"]);
  assert.equal(leavesAs, FIRST, "a first text, with the line that says how to stop");
  assert.deepEqual(w.ops(), ["person"], "the person was read, and nothing else was touched");
  // With their thread in hand, whether a text of ours ever reached them is asked of that thread.
  const held = world();
  await mayBegin(held.ports, { ...ask, conv: { id: "c9" } });
  assert.deepEqual(held.call("textedBefore"), ["textedBefore", "t1", "c9"]);
  assert.deepEqual(held.ops(), ["person", "textedBefore"]);
  // It refuses as the send would, in the send's own words and codes.
  await refused(mayBegin(world().ports, { ...ask, wire: "email" }), "conflict", /goes from Campaigns/);
  await refused(mayBegin(world().ports, { ...ask, wire: "whatsapp" }), "window_closed", /approved ahead of time/);
  await refused(mayBegin(world({ person: async () => null }).ports, ask), "not_found", /not in your workspace/);
});
