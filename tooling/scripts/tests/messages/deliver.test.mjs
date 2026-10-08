/**
 * The door, executed.
 *
 * deliver() is the one place a message leaves through, and the rules it
 * holds are the ones that were decided differently at four call sites: which
 * yes this message needs, whether a person holds the thread, whether the
 * workspace is paused, whose wire and whose credentials. Each is a rule about
 * reaching a real person, so each is proved by running the door against a
 * fake database and a fake wire, never by reading it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../_fake-db.mjs";
import { OUTCOME_UNKNOWN, isWaitRefusal } from "@chanlytics/contracts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const {
  deliver,
  deliverSafely,
  templatePurpose,
  whatsappSender,
  whatsappWire,
  wireUnavailable,
  isWireUnavailable,
  isWireUnavailableError,
  isNotTakenError,
} = await import(pathToFileURL(path.join(ROOT, "packages/core/dist/index.js")).href);

const T = "t1";
const NOW = Date.parse("2026-09-10T10:00:00.000Z");
const person = (over = {}) => ({
  consent: "opted_in",
  dnc: false,
  marketing_consent: "opted_out",
  erased_at: null,
  ...over,
});
const thread = (over = {}) => ({
  id: "c1",
  tenant_id: T,
  paused_until: null,
  contacts: person(),
  tenants: { status: "active" },
  ...over,
});
// A text leaves only on a line the carriers approved (step 3): a workspace has an active one unless a test says otherwise.
const TEXT_LINE = {
  tenant_id: T,
  messaging_service_sid: "MG1",
  voice_state: "ready",
  sms_state: "active",
  reg_mock: false,
  created_at: "2026-09-01T00:00:00.000Z",
};
const tables = (over = {}) => ({ conversations: [thread()], messages: [], events: [], lines: [TEXT_LINE], ...over });

/** A wire that says yes and remembers what it was handed. */
function wireOf(result = { ok: true, wamid: "wamid.1", status: 200 }) {
  const calls = [];
  return {
    calls,
    wire: {
      whatsapp: async (to, p) => {
        calls.push({ to, p });
        return result;
      },
    },
  };
}
/**
 * The send door's one question for a cold email (00177 outreach_facts), answered from the world's tables the way the
 * SQL answers it; the SQL itself is proved on a database (outreach-facts.db.test.mjs). `t.suppressed` lists the
 * addresses on the never-again list; `t.sent_since` is what the domain sent in the window; a person wrote back when an
 * inbound message of theirs is on one of their threads, an email's automatic reply aside (00181; a reply from another
 * address, and a call, are the SQL's, proved there). A send that names its lead (p_lead_id, 00184) is asked about
 * that lead alone, and only when it is this person's.
 */
const outreachRpc = (t) => ({
  outreach_facts: (a) => {
    const theirs = new Set(
      (t.conversations ?? [])
        .filter((c) => c.tenant_id === a.p_tenant_id && c.contact_id === a.p_contact_id)
        .map((c) => c.id),
    );
    const wroteBack = (t.messages ?? []).some(
      (m) =>
        theirs.has(m.conversation_id) &&
        m.direction === "inbound" &&
        m.sender === "customer" &&
        !(m.channel === "email" && m.meta?.email?.claim === "auto_reply"),
    );
    const live = (t.leads ?? [])
      .filter((l) => l.tenant_id === a.p_tenant_id && l.contact_id === a.p_contact_id && !l.erased_at && !l.blanked_at)
      .filter((l) => !a.p_lead_id || l.id === a.p_lead_id)
      .map((l) => ({ ...l, stage: l.stage ?? "ready" }))
      .sort((x, y) => Number(["ready", "nurture"].includes(y.stage)) - Number(["ready", "nurture"].includes(x.stage)));
    const d = (t.sending_domains ?? []).find(
      (s) => s.tenant_id === a.p_tenant_id && s.host === String(a.p_host).trim().toLowerCase(),
    );
    return {
      lead_stage: live[0]?.stage ?? null,
      suppressed: (t.suppressed ?? []).includes(String(a.p_to).trim().toLowerCase()),
      wrote_back: wroteBack,
      // Its owner stopped writing to the send's own lead (00241).
      stopped: !!(a.p_lead_id && live.find((l) => l.id === a.p_lead_id)?.reach_out_stopped_at),
      domain: d
        ? { state: d.state, from_local: d.from_local, clean_since: d.clean_since ?? null, sent_days: d.sent_days ?? 0 }
        : null,
      sent_since: t.sent_since ?? 0,
    };
  },
});
const ports = (t, w, over = {}) => ({ db: fakeDb(t, {}, outreachRpc(t)), wire: w.wire, now: () => NOW, ...over });
const words = (over = {}) => ({
  tenantId: T,
  conversationId: "c1",
  contactId: "k1",
  to: "+13475550101",
  channel: "whatsapp",
  sender: "human",
  purpose: "conversational",
  proactive: false,
  // What the message is about, required of every sender (decision D1): a person's words in their own thread are theirs. A
  // broadcast's news says "ours", as the door tests of the email row do below.
  about: "theirs",
  body: "See you at 3",
  ...over,
});
const kinds = (t) => t.events.map((e) => e.kind);

test("words that may go, go: the wire is handed them, a row records them, the thread is stamped, the event says who spoke", async () => {
  const t = tables();
  const w = wireOf();
  const out = await deliver(ports(t, w), words({ meta: { source: "test" } }));
  assert.equal(out.outcome, "sent");
  assert.equal(out.externalId, "wamid.1");
  assert.deepEqual(w.calls, [{ to: "+13475550101", p: { body: "See you at 3", template: undefined } }]);
  assert.equal(t.messages.length, 1);
  const row = t.messages[0];
  assert.equal(out.messageId, row.id);
  assert.equal(row.status, "sent");
  assert.equal(row.external_id, "wamid.1");
  assert.equal(row.channel, "whatsapp");
  assert.equal(row.sender, "human");
  assert.equal(row.type, "text");
  assert.deepEqual(row.meta, { source: "test" });
  assert.ok(t.conversations[0].last_message_at, "the thread is stamped (by recordOutbound, on its own clock)");
  assert.deepEqual(kinds(t), ["message.sent"]);
});

test("a template is a template row, and the wire gets its name, language and slots", async () => {
  const t = tables();
  const w = wireOf();
  const template = { name: "visit_reminder", language: "en_US", params: ["Luna"] };
  await deliver(ports(t, w), words({ template, body: "Hi Luna" }));
  assert.equal(w.calls[0].p.template, template);
  assert.equal(t.messages[0].type, "template");
});

test("which yes this message needs: the door asks the one predicate with the purpose it was given", async () => {
  // A promotion needs the yes to offers; words in a conversation need the
  // yes to conversation, and only when they START one.
  const cases = [
    [{ purpose: "marketing" }, person(), "no_marketing_consent"],
    [{ purpose: "marketing" }, person({ marketing_consent: "opted_in" }), null],
    // The texting line is registered for replies and appointment messages only:
    // a promotion by text is refused whatever the person said, and goes by WhatsApp.
    [{ purpose: "marketing", channel: "sms" }, person({ marketing_consent: "opted_in" }), "sms_carries_no_promotions"],
    [{ proactive: true }, person({ consent: "unknown" }), "not_opted_in"],
    [{ proactive: false }, person({ consent: "unknown" }), null],
    [{}, person({ consent: "opted_out" }), "opted_out"],
    [{}, person({ dnc: true, marketing_consent: "opted_in" }), "opted_out"],
    [{ purpose: "marketing" }, person({ dnc: true, marketing_consent: "opted_in" }), "opted_out"],
    [{}, person({ erased_at: "2026-09-01T00:00:00.000Z" }), "erased"],
  ];
  for (const [over, who, reason] of cases) {
    const t = tables({ conversations: [thread({ contacts: who })] });
    const w = wireOf();
    const out = await deliver(ports(t, w), words(over));
    const label = JSON.stringify([over, who]);
    if (reason) {
      assert.equal(out.outcome, "refused", label);
      assert.equal(out.reason, reason, label);
      assert.equal(w.calls.length, 0, `${label}: nothing reached the wire`);
      assert.equal(t.messages.length, 0, `${label}: a refusal with no row leaves no row`);
      assert.equal(t.events.length, 0, `${label}: and no event to point at nothing`);
    } else {
      assert.equal(out.outcome, "sent", label);
    }
  }
});

test("a paused workspace holds the machine, never the person; a held thread holds the machine, never the person", async () => {
  for (const [row, sender, expected] of [
    [thread({ tenants: { status: "paused" } }), "ai", "paused"],
    [thread({ tenants: { status: "paused" } }), "system", "paused"],
    [thread({ tenants: { status: "paused" } }), "human", null],
    [thread({ paused_until: new Date(NOW + 60_000).toISOString() }), "ai", "human_has_it"],
    [thread({ paused_until: new Date(NOW + 60_000).toISOString() }), "human", null],
    [thread({ paused_until: new Date(NOW - 1).toISOString() }), "ai", null],
    [thread({ tenants: null }), "ai", null],
  ]) {
    const t = tables({ conversations: [row] });
    const w = wireOf();
    const out = await deliver(ports(t, w), words({ sender }));
    const label = `${sender} on ${JSON.stringify({ status: row.tenants?.status, paused_until: row.paused_until })}`;
    if (expected) {
      assert.equal(out.outcome, "refused", label);
      assert.equal(out.reason, expected, label);
    } else assert.equal(out.outcome, "sent", label);
  }
});

test("a person who asked to be erased is refused from the moment they asked, not only once the erasure finished", async () => {
  const asked = tables({
    conversations: [thread({ contacts: person({ erasing_since: "2026-09-10T09:00:00.000Z" }) })],
  });
  const w = wireOf();
  const out = await deliver(ports(asked, w), words({ sender: "human" }));
  assert.deepEqual(
    [out.outcome, out.reason],
    ["refused", "erased"],
    "the block is written before anything is destroyed; a person's own reply meets it too",
  );
  assert.equal(w.calls.length, 0);
});

test("a thread a person holds refuses the receptionist's draft, and only the draft: the take-over's withdrawal, kept at the wire", async () => {
  // A LIVE hold, not a column that names somebody (00130). The door used to
  // read assignee_user_id, which nothing ever clears -- so a thread taken over
  // one Tuesday refused every draft after it for the life of the workspace.
  const held = () => thread({ control_kind: "person", control_until: "2026-09-10T11:00:00.000Z" });
  const draft = {
    id: "m1",
    tenant_id: T,
    conversation_id: "c1",
    status: "queued",
    body: "We open at 9.",
    sender: "ai",
    direction: "outbound",
    created_at: "2026-09-10T09:59:00.000Z",
  };
  const t = tables({ conversations: [held()], messages: [{ ...draft }] });
  const w = wireOf();
  const out = await deliver(ports(t, w), words({ sender: "ai", messageId: "m1" }));
  assert.deepEqual(
    [out.outcome, out.reason],
    ["refused", "human_has_it"],
    "the draft the withdrawal missed is refused here",
  );
  assert.equal(t.messages[0].status, "canceled", "and retired in place");
  assert.equal(w.calls.length, 0, "nothing reached the wire");
  // The person's own reply on the thread they hold goes; so does a system
  // message, owed whoever holds it.
  assert.equal(
    (await deliver(ports(tables({ conversations: [held()] }), wireOf()), words({ sender: "human" }))).outcome,
    "sent",
  );
  assert.equal(
    (await deliver(ports(tables({ conversations: [held()] }), wireOf()), words({ sender: "system", kind: "system" })))
      .outcome,
    "sent",
    "an opt-in confirmation is owed the moment the yes was given, whoever holds the thread",
  );
  // The receptionist answering NOW is held too, and that is the half of this
  // rule that keeps two of our own agents off one person: while a call holds
  // the thread, a message arriving on WhatsApp is stored and answered by
  // nobody, instead of being answered over the call the customer is on.
  assert.deepEqual(
    await deliver(ports(tables({ conversations: [held()] }), wireOf()), words({ sender: "ai" })).then((r) => [
      r.outcome,
      r.reason,
    ]),
    ["refused", "human_has_it"],
  );
});

test("a hold that has run out holds nothing: the fact expires, which is what the column it replaced never did", async () => {
  // assignee_user_id was read as "somebody is on this thread" and is cleared by
  // nothing -- expire_stale_pauses skips any row with an open escalation, and a
  // take-over leaves one open on purpose. So a thread taken over once refused
  // the receptionist's drafts for ever, and the workspace's veto window quietly
  // stopped working on it. A hold carries its own expiry instead.
  const lapsed = () => thread({ control_kind: "person", control_until: "2026-09-10T09:59:59.000Z" });
  const draft = {
    id: "m1",
    tenant_id: T,
    conversation_id: "c1",
    status: "queued",
    body: "We open at 9.",
    sender: "ai",
    direction: "outbound",
    created_at: "2026-09-10T09:00:00.000Z",
  };
  const t = tables({ conversations: [lapsed()], messages: [{ ...draft }] });
  const w = wireOf();
  assert.equal((await deliver(ports(t, w), words({ sender: "ai", messageId: "m1" }))).outcome, "sent");
  assert.equal(
    (await deliver(ports(tables({ conversations: [lapsed()] }), wireOf()), words({ sender: "ai" }))).outcome,
    "sent",
  );
});

test("a queued row is finalized in place: sent with its id, or canceled with its reason and an event that says why", async () => {
  const queued = {
    id: "m1",
    tenant_id: T,
    conversation_id: "c1",
    status: "queued",
    body: "See you at 3",
    sender: "human",
    direction: "outbound",
    created_at: "2026-09-10T09:59:00.000Z",
  };
  const sentT = tables({ messages: [{ ...queued }] });
  const w = wireOf();
  const sent = await deliver(ports(sentT, w), words({ messageId: "m1" }));
  assert.equal(sent.outcome, "sent");
  assert.equal(sent.messageId, "m1");
  assert.equal(sentT.messages.length, 1, "no second row");
  assert.equal(sentT.messages[0].status, "sent");
  assert.equal(sentT.messages[0].external_id, "wamid.1");
  assert.deepEqual(kinds(sentT), ["message.sent"]);
  assert.equal(sentT.events[0].subject_id, "m1");

  const heldT = tables({
    messages: [{ ...queued }],
    conversations: [thread({ contacts: person({ consent: "opted_out" }) })],
  });
  const refused = await deliver(ports(heldT, wireOf()), words({ messageId: "m1" }));
  assert.equal(refused.outcome, "refused");
  assert.equal(heldT.messages[0].status, "canceled");
  assert.deepEqual(heldT.messages[0].error, { reason: "opted_out" });
  assert.deepEqual(
    heldT.events.map((e) => [e.kind, e.data]),
    [
      [
        "message.send_blocked",
        {
          reason: "opted_out",
          purpose: "conversational",
          consent: "opted_out",
          dnc: false,
          marketing_consent: "opted_out",
        },
      ],
    ],
  );
});

test("a cancel that wins the row after the words left is the signal, never overwritten", async () => {
  // The row was canceled between the send and the write: the text is gone,
  // the row stays canceled, and an event says the two raced.
  const t = tables({
    messages: [
      {
        id: "m1",
        tenant_id: T,
        conversation_id: "c1",
        status: "canceled",
        body: "x",
        sender: "human",
        direction: "outbound",
        created_at: "2026-09-10T09:59:00.000Z",
      },
    ],
  });
  const out = await deliver(ports(t, wireOf()), words({ messageId: "m1" }));
  assert.equal(out.outcome, "sent");
  assert.equal(t.messages[0].status, "canceled");
  assert.deepEqual(kinds(t), ["message.send_raced_cancel", "message.sent"]);
});

test("the receptionist's draft is retired when a person answered after it was written", async () => {
  const t = tables({
    messages: [
      {
        id: "m1",
        tenant_id: T,
        conversation_id: "c1",
        status: "queued",
        body: "We open at 9!",
        sender: "ai",
        direction: "outbound",
        created_at: "2026-09-10T09:59:00.000Z",
      },
      {
        id: "m2",
        tenant_id: T,
        conversation_id: "c1",
        status: "sent",
        body: "9am, see you",
        sender: "human",
        direction: "outbound",
        created_at: "2026-09-10T09:59:30.000Z",
      },
    ],
  });
  const w = wireOf();
  const out = await deliver(ports(t, w), words({ sender: "ai", messageId: "m1" }));
  assert.equal(out.outcome, "refused");
  assert.equal(out.reason, "superseded_by_human");
  assert.equal(w.calls.length, 0);
  assert.equal(t.messages[0].status, "canceled");
  assert.equal(t.events[0].data.after, "m2");
});

test("a wire that could not be BOUND is not a wire with no credentials: the door throws by name before anything is written, the queued row stays queued, and deliverSafely says it as wire_unreadable", async () => {
  // The workspace's credentials could not be read (Vault, the database). The
  // number may well be connected; nobody knows. A refusal would burn the row
  // and tell the owner to reconnect a number that works; a read that failed
  // throws, as every read that fails at the door throws, and the caller waits.
  const queued = () =>
    tables({
      messages: [
        {
          id: "m1",
          tenant_id: T,
          conversation_id: "c1",
          status: "queued",
          body: "See you at 3",
          sender: "human",
          direction: "outbound",
          created_at: "2026-09-10T09:59:00.000Z",
        },
      ],
    });
  const t = queued();
  const wire = { whatsapp: wireUnavailable("vault unavailable") };
  await assert.rejects(deliver({ db: fakeDb(t), wire, now: () => NOW }, words({ messageId: "m1" })), (e) => {
    assert.ok(isWireUnavailableError(e), "typed, so a caller can tell it from any other throw");
    assert.equal(e.name, "WireUnavailableError");
    assert.equal(e.channel, "whatsapp");
    assert.match(e.message, /could not be bound/);
    assert.match(e.message, /vault unavailable/);
    assert.ok(!/not connected|reconnect/i.test(e.message), "nothing in it says the number is disconnected");
    return true;
  });
  assert.equal(t.messages[0].status, "queued", "left for the retry");
  assert.equal(t.messages[0].error, undefined);
  assert.deepEqual(kinds(t), [], "nothing left, so nothing is said to have failed");

  // A send with no row yet writes none either.
  const bare = tables();
  await assert.rejects(deliver({ db: fakeDb(bare), wire, now: () => NOW }, words()), isWireUnavailableError);
  assert.deepEqual(bare.messages, []);
  assert.deepEqual(kinds(bare), []);

  // The door a webhook uses never throws: the same read failure is a failure by its own name, never "no credentials".
  const safe = queued();
  const out = await deliverSafely({ db: fakeDb(safe), wire, now: () => NOW }, words({ messageId: "m1" }));
  assert.deepEqual([out.outcome, out.reason, out.messageId], ["failed", "wire_unreadable", "m1"]);
  assert.equal(safe.messages[0].status, "queued");

  // A refusal is still a refusal: the wire is asked only of words that may go.
  const no = queued();
  no.conversations[0].contacts = person({ consent: "opted_out" });
  const refused = await deliver({ db: fakeDb(no), wire, now: () => NOW }, words({ messageId: "m1" }));
  assert.deepEqual([refused.outcome, refused.reason], ["refused", "opted_out"]);
  assert.equal(no.messages[0].status, "canceled");
});

test("what a send came to rides the row on every wire: a WhatsApp timeout is an unknown outcome too, and a send the provider did not take is held for a caller that asked, never written", async () => {
  const queued = () =>
    tables({
      messages: [
        {
          id: "m1",
          tenant_id: T,
          conversation_id: "c1",
          status: "queued",
          body: "See you at 3",
          sender: "human",
          direction: "outbound",
          created_at: "2026-09-10T09:59:00.000Z",
        },
      ],
    });
  // A timeout may have been taken all the same, on WhatsApp as on email (it used to be said of email's alone).
  const timedOut = queued();
  const unknown = { ok: false, wamid: null, status: 0, errorBody: "timeout", outcome: "unknown" };
  const out = await deliver(ports(timedOut, wireOf(unknown)), words({ messageId: "m1" }));
  assert.equal(out.outcome, "failed");
  assert.deepEqual(timedOut.messages[0].error, { http_status: 0, body: "timeout", outcome: "unknown" });

  // Not taken, and the caller will try again (sendQueued): thrown by name before anything is written.
  const notTaken = { ok: false, wamid: null, status: 429, errorBody: "too many", outcome: "retryable" };
  const held = queued();
  await assert.rejects(
    deliver(ports(held, wireOf(notTaken)), words({ messageId: "m1", holdIfNotTaken: true })),
    (e) => {
      assert.ok(isNotTakenError(e));
      assert.equal(e.channel, "whatsapp");
      assert.equal(e.status, 429);
      return true;
    },
  );
  assert.equal(held.messages[0].status, "queued", "the row stays queued for the fresh job");
  assert.deepEqual(held.events, [], "and nothing says it failed");

  // Without the ask it fails as any refusal does, and is no unknown: nothing left.
  const failed = queued();
  const plain = await deliver(ports(failed, wireOf(notTaken)), words({ messageId: "m1" }));
  assert.equal(plain.outcome, "failed");
  assert.deepEqual(failed.messages[0].error, { http_status: 429, body: "too many" });
});

test("the WhatsApp wire from a credentials read: present is a sender, absent is null, unavailable is the marker", async () => {
  const sender = whatsappWire({ outcome: "present", credentials: { phoneId: "p1", accessToken: "tok" } });
  assert.equal(typeof sender, "function");
  assert.equal(whatsappWire({ outcome: "absent" }), null, "no credentials: refused at the door, never guessed");
  const down = whatsappWire({ outcome: "unavailable", error: "connection reset" });
  assert.ok(isWireUnavailable(down));
  assert.deepEqual(down, { unavailable: true, error: "connection reset" });
  assert.ok(!isWireUnavailable(null) && !isWireUnavailable(undefined) && !isWireUnavailable(sender));
});

test("no wire, no credentials, a provider that says no: each is OURS, a failed row, and an event with the status", async () => {
  // No such channel in this runtime.
  const none = tables({
    messages: [
      {
        id: "m1",
        tenant_id: T,
        conversation_id: "c1",
        status: "queued",
        body: "x",
        sender: "human",
        direction: "outbound",
        created_at: "2026-09-10T09:59:00.000Z",
      },
    ],
  });
  const a = await deliver({ db: fakeDb(none), wire: {}, now: () => NOW }, words({ channel: "sms", messageId: "m1" }));
  assert.equal(a.outcome, "failed");
  assert.equal(a.reason, "no_sender_for_channel");
  assert.equal(none.messages[0].status, "failed");
  assert.deepEqual(none.messages[0].error, { http_status: 0, body: "no_sender_for_channel" });
  assert.deepEqual(kinds(none), ["message.send_failed"]);

  // The channel exists; this workspace holds nothing for it.
  const bare = tables();
  const b = await deliver({ db: fakeDb(bare), wire: { whatsapp: null }, now: () => NOW }, words());
  assert.equal(b.outcome, "failed");
  assert.equal(b.reason, "no_credentials");
  assert.equal(b.status, 503);
  assert.equal(bare.messages.length, 1, "recorded as a failed row rather than dropped");
  assert.equal(bare.messages[0].status, "failed");
  assert.deepEqual(bare.messages[0].meta, { http_status: 503, body: "no_credentials" });
  assert.deepEqual(
    kinds(bare),
    ["message.send_failed"],
    "words that never left are said to have failed, never to have gone out",
  );

  // The provider refused.
  const said = tables();
  const c = await deliver(
    ports(
      said,
      wireOf({
        ok: false,
        wamid: null,
        status: 400,
        errorBody: "(#131030) Recipient phone number not in allowed list",
      }),
    ),
    words({ meta: { source: "voice" } }),
  );
  assert.equal(c.outcome, "failed");
  assert.equal(c.reason, "provider");
  assert.equal(c.status, 400);
  assert.equal(said.messages[0].status, "failed");
  assert.deepEqual(said.messages[0].meta, {
    source: "voice",
    http_status: 400,
    body: "(#131030) Recipient phone number not in allowed list",
  });
  assert.equal(c.messageId, said.messages[0].id);
  assert.deepEqual(kinds(said), ["message.send_failed"], "a refusal the provider gave is a failure, not a send");
});

test("the carrier's own no on a text (Twilio 21610) is the person's STOP: recorded the way a STOP is, refused the way a recorded no is, and the next send never reaches the provider", async () => {
  // Twilio refuses a text to a number that replied STOP to it before we heard
  // -- the STOP went to the carrier, or arrived before the line's webhook
  // pointed here. The number is unreachable whatever our row says (enums.ts,
  // the carriers' words), so the row is brought to agree with the carrier.
  // Until now the send failed like any other: the owner was told a delivery
  // failed, nothing was recorded, and every later send to that person failed
  // and told them again.
  //
  // ONE object holds the person in the contacts table and on the thread, so
  // the door's write is what its next read sees, as one row is in Postgres.
  const carrierNo = { ok: false, wamid: null, status: 400, errorBody: "Twilio 21610", code: 21610 };
  const world = () => {
    const k = { id: "k1", tenant_id: T, ...person() };
    const t = tables({ contacts: [k], conversations: [thread({ contact_id: "k1", contacts: k })] });
    const calls = [];
    const wire = {
      sms: async (to, p) => {
        calls.push({ to, p });
        return carrierNo;
      },
    };
    return { k, t, calls, ports: { db: fakeDb(t), wire, now: () => NOW } };
  };
  const text = (over = {}) => words({ channel: "sms", sender: "ai", to: "+13475550101", ...over });
  const ledger = (t) => t.events.filter((e) => e.kind === "contact.consent_changed");

  // The receptionist's reply: no row yet, so none is written -- the ledger says why, and the thread stays quiet.
  const a = world();
  assert.deepEqual(await deliver(a.ports, text()), { outcome: "refused", reason: "opted_out", messageId: null });
  assert.equal(a.calls.length, 1, "the wire was asked once");
  assert.deepEqual(
    [a.k.consent, a.k.dnc, a.k.consent_source],
    ["opted_out", true, "carrier"],
    "the three consent columns, as ingest_inbound writes a STOP it heard, with the carrier as the source",
  );
  assert.ok(a.k.consent_updated_at, "stamped");
  assert.deepEqual(
    ledger(a.t).map((e) => [e.category, e.subject_type, e.subject_id, e.data]),
    [["contact", "contact", "k1", { consent: "opted_out", previous: "opted_in", source: "carrier", channel: "sms" }]],
    "one ledger row, the shape every consent change has",
  );
  assert.equal(a.t.messages.length, 0, "a send with no row leaves none, as any refusal at the door does");
  assert.deepEqual(kinds(a.t), ["contact.consent_changed"], "and no message.send_failed: it was not a failure of ours");
  // The next send to that person, whoever asks: refused by the predicate, and the wire is not asked.
  assert.deepEqual(await deliver(a.ports, text({ sender: "human" })), {
    outcome: "refused",
    reason: "opted_out",
    messageId: null,
  });
  assert.equal(a.calls.length, 1, "the provider is not asked about a person who opted out");
  assert.equal(ledger(a.t).length, 1, "and a no already recorded is not recorded again");

  // A queued row (the outbox, a draft): canceled with the reason a recorded no gives it, never failed.
  const b = world();
  const queued = (id) => ({
    id,
    tenant_id: T,
    conversation_id: "c1",
    status: "queued",
    body: "We open at 9",
    sender: "ai",
    channel: "sms",
    direction: "outbound",
    created_at: "2026-09-10T09:59:00.000Z",
  });
  b.t.messages.push(queued("m1"), queued("m2"));
  assert.deepEqual(await deliver(b.ports, text({ messageId: "m1" })), {
    outcome: "refused",
    reason: "opted_out",
    messageId: "m1",
  });
  assert.equal(b.t.messages[0].status, "canceled");
  assert.deepEqual(b.t.messages[0].error, { reason: "opted_out" });
  assert.deepEqual(
    b.t.events.map((e) => [e.kind, e.data]),
    [
      ["contact.consent_changed", { consent: "opted_out", previous: "opted_in", source: "carrier", channel: "sms" }],
      [
        "message.send_blocked",
        {
          reason: "opted_out",
          purpose: "conversational",
          consent: "opted_out",
          dnc: true,
          marketing_consent: "opted_out",
          source: "carrier",
        },
      ],
    ],
    "the no recorded first, then the send blocked by it, saying who reported it",
  );
  assert.deepEqual(await deliver(b.ports, text({ messageId: "m2" })), {
    outcome: "refused",
    reason: "opted_out",
    messageId: "m2",
  });
  assert.equal(b.calls.length, 1);
  assert.equal(b.t.messages[1].status, "canceled");
  assert.deepEqual(b.t.messages[1].error, { reason: "opted_out" });

  // The carrier's code is a text's: the same number on another wire is a provider's failure, as it always was.
  const c = world();
  const graph = await deliver(
    ports(c.t, wireOf({ ...carrierNo, errorBody: "(#131030) Recipient phone number not in allowed list" })),
    words(),
  );
  assert.deepEqual([graph.outcome, graph.reason], ["failed", "provider"]);
  assert.equal(c.k.consent, "opted_in", "nothing recorded about the person");
});

test("a draft is not a send: recorded as queued it writes no message.sent, and the one it gets is from the moment it leaves", async () => {
  // The receptionist's reply waits out its veto window as a queued row. The
  // event that says a message went out is the send moment first_replies reads
  // (00035), so a draft that wrote one would be timed from its draft, and a
  // cancelled draft would say it went out.
  const { recordOutbound } = await import(pathToFileURL(path.join(ROOT, "packages/db/dist/index.js")).href);
  const t = tables();
  const id = await recordOutbound(fakeDb(t), {
    tenantId: T,
    conversationId: "c1",
    contactId: "k1",
    sender: "ai",
    type: "text",
    body: "We open at 9",
    externalId: null,
    status: "queued",
  });
  assert.equal(t.messages.find((m) => m.id === id)?.status, "queued");
  assert.deepEqual(kinds(t), [], "a draft awaiting its veto window has not gone out");

  const out = await deliver(ports(t, wireOf()), words({ sender: "ai", body: "We open at 9", messageId: id }));
  assert.equal(out.outcome, "sent");
  assert.deepEqual(kinds(t), ["message.sent"], "one event, at the moment it left");
});

test("a wire that cannot be read is not a yes: the door throws, and nothing is sent", async () => {
  const w = wireOf();
  await assert.rejects(
    deliver(
      { db: fakeDb(tables(), { "conversations.select": { message: "connection reset" } }), wire: w.wire },
      words(),
    ),
    /cannot read the wire/,
  );
  await assert.rejects(deliver(ports(tables({ conversations: [] }), w), words()), /no conversation c1/);
  assert.equal(w.calls.length, 0);
});

test("which yes a queued template needs: Meta's category, failing closed, and a read that fails throws", async () => {
  const t = {
    templates: [
      { tenant_id: T, channel: "whatsapp", name: "month_offer", language: "en_US", category: "marketing" },
      { tenant_id: T, channel: "whatsapp", name: "visit_reminder", language: "en_US", category: "utility" },
    ],
  };
  assert.equal(await templatePurpose(fakeDb(t), T, undefined), "conversational");
  assert.equal(await templatePurpose(fakeDb(t), T, { name: "visit_reminder", language: "en_US" }), "conversational");
  assert.equal(await templatePurpose(fakeDb(t), T, { name: "month_offer", language: "en_US" }), "marketing");
  assert.equal(
    await templatePurpose(fakeDb(t), T, { name: "seeded_by_hand", language: "en_US" }),
    "marketing",
    "unknown to us is marketing until Meta says otherwise",
  );
  await assert.rejects(
    templatePurpose(fakeDb(t, { "templates.select": { message: "reset" } }), T, {
      name: "month_offer",
      language: "en_US",
    }),
    /cannot read template month_offer/,
  );
});

test("WhatsApp's wire comes from credentials alone, and hands Graph bare digits", async () => {
  assert.equal(whatsappSender(null), null, "no credentials, no wire");
  const seen = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    seen.push({ url: String(url), body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ messages: [{ id: "wamid.9" }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  try {
    const send = whatsappSender({ phoneId: "p1", accessToken: "tok" });
    const r = await send("+13475550101", { body: "hi" });
    assert.equal(r.ok, true);
    assert.equal(r.wamid, "wamid.9");
    assert.equal(seen[0].body.to, "13475550101");
    assert.ok(seen[0].url.includes("/p1/messages"));
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("Graph's refusal keeps its code even when its message runs past the 200 characters the body is cut to", async () => {
  const realFetch = globalThis.fetch;
  const message = `(#130429) Rate limit hit. ${"Cloud API message throughput has been reached. ".repeat(6)}`;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ error: { message, type: "OAuthException", code: 130429, fbtrace_id: "x" } }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  try {
    const r = await whatsappSender({ phoneId: "p1", accessToken: "tok" })("+13475550101", { body: "hi" });
    assert.equal(r.ok, false);
    assert.equal(r.errorBody.length, 200, "the body is still cut where it was");
    assert.ok(!r.errorBody.includes("130429,"), "and the code no longer fits in it");
    assert.equal(r.code, 130429, "so it is read before the cut");
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("a broadcast is a person's words but an automated send: it respects the thread's pause and the workspace's pause", async () => {
  for (const [row, expected] of [
    [thread({ paused_until: new Date(NOW + 60_000).toISOString() }), "human_has_it"],
    [thread({ tenants: { status: "paused" } }), "paused"],
  ]) {
    const t = tables({ conversations: [row] });
    const w = wireOf();
    const out = await deliver(
      ports(t, w),
      words({
        sender: "human",
        proactive: true,
        purpose: "conversational",
        template: { name: "visit_reminder", language: "en_US", params: [] },
      }),
    );
    assert.equal(out.outcome, "refused", JSON.stringify(row));
    assert.equal(out.reason, expected);
    assert.equal(w.calls.length, 0);
  }
});

test("the day-before reminder alone passes the thread's 24-hour handover pause (decision D4): the after-visit message, a win-back, a monthly offer, a proposal's follow-up and a plain broadcast keep it, and a live hold holds every one of them", async () => {
  const send = async (row, trigger) => {
    const t = tables({ conversations: [row] });
    const w = wireOf();
    const out = await deliver(
      ports(t, w),
      words({
        sender: "human",
        kind: "broadcast",
        proactive: true,
        purpose: "conversational",
        about: trigger === "visit_tomorrow" || trigger === "visited" ? "theirs" : "ours",
        template: { name: "visit_reminder", language: "en_US", params: [] },
        ...(trigger === undefined ? {} : { trigger }),
      }),
    );
    return { out, calls: w.calls.length };
  };
  // An owner replied in the last 24 hours: the thread is paused until tomorrow, past the visit it is the day before.
  const paused = () => thread({ paused_until: new Date(NOW + 20 * 3600_000).toISOString() });
  for (const [trigger, reason] of [
    ["visit_tomorrow", null],
    ["visited", "human_has_it"],
    ["quiet_30", "human_has_it"],
    ["everyone_monthly", "human_has_it"],
    ["proposal_waiting", "human_has_it"],
    // A broadcast names no moment, and so passes nothing.
    [null, "human_has_it"],
    [undefined, "human_has_it"],
  ]) {
    const { out, calls } = await send(paused(), trigger);
    assert.equal(out.outcome === "refused" ? out.reason : null, reason, `a paused thread, ${trigger}`);
    assert.equal(calls, reason ? 0 : 1, `a paused thread, ${trigger}: the wire is called only for what passes`);
  }
  // A live hold (a call in progress, a teammate speaking now) is not the 24-hour pause: it holds the reminder too.
  const live = () => thread({ control_kind: "person", control_until: new Date(NOW + 3600_000).toISOString() });
  for (const trigger of ["visit_tomorrow", "visited", "quiet_30", null]) {
    const { out, calls } = await send(live(), trigger);
    assert.deepEqual([out.outcome, out.reason], ["refused", "human_has_it"], `a live hold, ${trigger}`);
    assert.equal(calls, 0);
  }
  // Both at once: the pause is passed and the hold is not.
  const both = thread({
    paused_until: new Date(NOW + 20 * 3600_000).toISOString(),
    control_kind: "call",
    control_until: new Date(NOW + 600_000).toISOString(),
  });
  assert.equal((await send(both, "visit_tomorrow")).out.reason, "human_has_it", "a call in progress still holds it");
  // A hold that has lapsed is none, and the paused thread then lets the reminder through.
  const lapsed = thread({
    paused_until: new Date(NOW + 20 * 3600_000).toISOString(),
    control_kind: "call",
    control_until: new Date(NOW - 1000).toISOString(),
  });
  assert.equal((await send(lapsed, "visit_tomorrow")).out.outcome, "sent", "a lapsed hold holds nothing");
  // The workspace's pause (billing) is no handover pause: nothing passes it.
  const workspace = thread({ tenants: { status: "paused" } });
  assert.equal((await send(workspace, "visit_tomorrow")).out.reason, "paused", "a paused workspace holds the reminder");
});

test("the receptionist's own escalation pauses the thread and queues its holding message: the queued draft still goes, unless a person spoke since", async () => {
  const paused = thread({ paused_until: new Date(NOW + 24 * 3600_000).toISOString() });
  const draft = {
    id: "m1",
    tenant_id: T,
    conversation_id: "c1",
    status: "queued",
    body: "I've passed this to the team.",
    sender: "ai",
    direction: "outbound",
    created_at: "2026-09-10T09:59:00.000Z",
  };
  {
    const t = tables({ conversations: [paused], messages: [draft] });
    const w = wireOf();
    const out = await deliver(ports(t, w), words({ sender: "ai", messageId: "m1", body: draft.body }));
    assert.equal(out.outcome, "sent", "the holding message reaches the customer");
    assert.equal(t.messages[0].status, "sent");
  }
  {
    const owner = {
      id: "m2",
      tenant_id: T,
      conversation_id: "c1",
      status: "sent",
      body: "Hi, Marisa here",
      sender: "human",
      direction: "outbound",
      created_at: "2026-09-10T09:59:30.000Z",
    };
    const t = tables({ conversations: [paused], messages: [draft, owner] });
    const w = wireOf();
    const out = await deliver(ports(t, w), words({ sender: "ai", messageId: "m1", body: draft.body }));
    assert.equal(out.outcome, "refused");
    assert.equal(out.reason, "superseded_by_human");
    assert.equal(w.calls.length, 0);
  }
});

test("what a send IS decides what holds it, never who wrote it: a system message goes under a held thread but not a paused workspace, and a broadcast's row does not retire a draft", async () => {
  const held = thread({ paused_until: new Date(NOW + 60_000).toISOString() });
  {
    const t = tables({ conversations: [held] });
    const w = wireOf();
    const out = await deliver(ports(t, w), words({ sender: "ai", kind: "system" }));
    assert.equal(
      out.outcome,
      "sent",
      "an opt-in confirmation is owed the moment the yes was given, whoever holds the thread",
    );
    assert.equal(t.messages[0].sender, "ai", "and the row still says who wrote the words");
  }
  {
    const t = tables({ conversations: [held] });
    const w = wireOf();
    const out = await deliver(ports(t, w), words({ sender: "ai" }));
    assert.equal(out.reason, "human_has_it", "the receptionist answering now is held, as before");
  }
  {
    const t = tables({ conversations: [thread({ tenants: { status: "paused" } })] });
    const w = wireOf();
    const out = await deliver(ports(t, w), words({ sender: "ai", kind: "system" }));
    assert.equal(out.reason, "paused", "a paused workspace sends nothing but a person's own words");
  }
  {
    const draft = {
      id: "m1",
      tenant_id: T,
      conversation_id: "c1",
      status: "queued",
      body: "Hi",
      sender: "ai",
      direction: "outbound",
      created_at: "2026-09-10T09:59:00.000Z",
    };
    const run = {
      id: "m2",
      tenant_id: T,
      conversation_id: "c1",
      status: "sent",
      body: "An offer",
      sender: "human",
      direction: "outbound",
      created_at: "2026-09-10T09:59:30.000Z",
      meta: { source: "broadcast", broadcast_id: "b1" },
    };
    const t = tables({ messages: [draft, run] });
    const w = wireOf();
    const out = await deliver(ports(t, w), words({ sender: "ai", messageId: "m1", body: "Hi" }));
    assert.equal(out.outcome, "sent", "a broadcast is a person's words, not a person speaking on the thread");
  }
});

test("a wire that cannot be read is a failure with its own name, never a throw past the door", async () => {
  const t = tables();
  const w = wireOf();
  const db = fakeDb(t, { "conversations.select": { message: "connection reset" } });
  const out = await deliverSafely({ db, wire: w.wire, now: () => NOW }, words({ sender: "ai" }));
  assert.equal(out.outcome, "failed");
  assert.equal(out.reason, "wire_unreadable");
  assert.match(out.errorBody, /connection reset/);
  assert.equal(w.calls.length, 0);
});

/* ------------------------------------------------------------------ email */

const { emailSender, sendBroadcastBatch } = await import(
  pathToFileURL(path.join(ROOT, "packages/core/dist/index.js")).href
);
const { buildEmailRequest, ownDomainIdentity, sendsAsOwnDomain, sendsAs } = await import(
  pathToFileURL(path.join(ROOT, "packages/channels/dist/index.js")).href
);

const ADDRESS = "ana@example.com";
const frozen = (over = {}) =>
  buildEmailRequest({
    identity: {
      fromName: "Best Movers",
      fromAddress: "bestmovers@mail.chanlytics.com",
      replyTo: "r+abcdefghijklmnopqrstuvwx@mail.chanlytics.com",
    },
    to: ADDRESS,
    parent: { messageId: "m0", rfcMessageId: "<q1@customer.example>", references: [], subject: "Quote for Saturday" },
    body: "We can do Saturday at 9.",
    signature: null,
    actor: "human",
    messageId: "m1",
    tenantId: T,
    ...over,
  });
const emailed = (over = {}) =>
  words({ to: ADDRESS, channel: "email", email: frozen(), body: "We can do Saturday at 9.", messageId: "m1", ...over });
/** The row an email is queued as before it leaves, under the id its request was frozen with (frozen()'s "m1"). */
const queuedEmail = (over = {}) => ({
  id: "m1",
  tenant_id: T,
  conversation_id: "c1",
  contact_id: "k1",
  channel: "email",
  direction: "outbound",
  sender: "human",
  status: "queued",
  body: "We can do Saturday at 9.",
  created_at: "2026-09-10T09:59:00.000Z",
  ...over,
});
const onEmail = (over = {}) => person({ email: ADDRESS, email_suppressed_at: null, ...over });
const emailWire = (result = { ok: true, wamid: "re_1", status: 200 }) => {
  const calls = [];
  return {
    calls,
    wire: {
      email: async (to, p) => {
        calls.push({ to, p });
        return result;
      },
    },
  };
};

test("an email leaves as the request that was frozen for it, from the row it was queued as: the wire is handed those bytes, and that row says sent", async () => {
  const t = tables({ conversations: [thread({ contacts: onEmail() })], messages: [queuedEmail()] });
  const w = emailWire();
  const d = emailed();
  const out = await deliver(ports(t, w), d);
  assert.equal(out.outcome, "sent");
  assert.equal(out.messageId, "m1", "the row it was queued as");
  assert.equal(out.externalId, "re_1", "the provider's id, which a receipt may also name");
  assert.equal(w.calls.length, 1);
  assert.equal(w.calls[0].to, ADDRESS);
  assert.equal(w.calls[0].p.email, d.email, "the frozen request itself, not something assembled at the door");
  assert.equal(t.messages.length, 1, "no second row");
  assert.deepEqual([t.messages[0].status, t.messages[0].external_id], ["sent", "re_1"]);
});

test("an email is handed what is left of its caller's ceiling at the moment it is put on the wire (sendBy), never less than a request needs, and a send with no ceiling is handed none; no other channel is handed one", async (t) => {
  const sentBy = async (over, wire = emailWire()) => {
    const t = tables({ conversations: [thread({ contacts: onEmail() })], messages: [queuedEmail()] });
    await deliver(ports(t, wire), emailed(over));
    return wire.calls[0].p.deadlineMs;
  };
  // 10 s left of the function's room at NOW (the door's clock): that is what the wire is told, not the 32 s it takes alone.
  assert.equal(await sentBy({ sendBy: NOW + 10_000 }), 10_000);
  assert.equal(await sentBy({ sendBy: NOW + 40_000 }), 40_000, "the wire's own deadline caps it, not the door");
  assert.equal(await sentBy({}), undefined, "no ceiling, none said");
  // A send put on the wire after its ceiling has none left to give: zero, which the email wire raises to what one request
  // needs (channels SEND_MIN_MS) rather than start a send that could only time out.
  assert.equal(await sentBy({ sendBy: NOW - 5_000 }), 0);
  // The wire itself: a smaller ceiling is the bound, and one that is smaller than a request needs is raised to it. The
  // wire reads the clock for its deadline and again for each try's share of it, so the clock is held still here: a
  // millisecond between the two reads was a try of 9,999 (CI, 6 October 2026).
  t.mock.timers.enable({ apis: ["Date"], now: NOW });
  const asked = [];
  const realTimeout = AbortSignal.timeout;
  const realFetch = globalThis.fetch;
  AbortSignal.timeout = (ms) => (asked.push(ms), realTimeout.call(AbortSignal, ms));
  globalThis.fetch = async () => new Response(JSON.stringify({ id: "re_9" }), { status: 200 });
  try {
    const send = emailSender([
      {
        lane: "hosted",
        cfg: { apiKey: "k" },
        as: sendsAs(
          { local_part: "bestmovers", reply_token: "abcdefghijklmnopqrstuvwx", from_name: "Best Movers" },
          "mail.chanlytics.com",
        ),
      },
    ]);
    for (const deadlineMs of [10_000, 0, 100_000]) {
      await send(ADDRESS, { body: "x", email: frozen(), purpose: "conversational", deadlineMs });
    }
    await send(ADDRESS, { body: "x", email: frozen(), purpose: "conversational" });
  } finally {
    AbortSignal.timeout = realTimeout;
    globalThis.fetch = realFetch;
  }
  assert.deepEqual(asked, [10_000, 3_000, 15_000, 15_000], "each try is the smaller of 15 s and what is left");
  // A text is handed none: only the email wire has a send that can outlive the tick.
  const texts = [];
  const sms = async (to, p) => (texts.push({ to, p }), { ok: true, wamid: "SM1", status: 200 });
  await deliver(ports(tables(), { wire: { sms } }), {
    ...words({ to: "+13475550101", channel: "sms", body: "hi" }),
    sendBy: NOW + 10_000,
  });
  assert.equal(texts.length, 1);
  assert.equal("deadlineMs" in texts[0].p, false);
});

test("email's three refusals, each a fact about the person or the product, asked before consent and before the wire", async () => {
  const cases = [
    [{ purpose: "marketing" }, onEmail({ marketing_consent: "opted_in" }), "email_marketing_disabled"],
    // An offer by email is refused wherever the deployment cannot send one (these ports hold no campaigns domain), asked
    // before the person's own no: the offers' own cells are the tests below (an unsubscribe is `unsubscribed` there).
    [
      { purpose: "marketing" },
      onEmail({ marketing_consent: "opted_in", email_marketing: "opted_out" }),
      "email_marketing_disabled",
    ],
    [{}, onEmail({ email_suppressed_at: "2026-09-01T00:00:00Z" }), "email_suppressed"],
    [{}, onEmail({ email: "ana.new@example.com" }), "recipient_changed"],
    [{}, onEmail({ email: null }), "recipient_changed"],
    // A person's own reply passes every pause, and still goes nowhere the address on file is not.
    [{ sender: "human", proactive: false }, onEmail({ email: "ana.new@example.com" }), "recipient_changed"],
    // Erasure outranks all of it.
    [{}, onEmail({ erasing_since: "2026-09-10T09:00:00Z" }), "erased"],
    [{}, onEmail(), null],
  ];
  for (const [over, who, reason] of cases) {
    const t = tables({ conversations: [thread({ contacts: who })], messages: [queuedEmail()] });
    const w = emailWire();
    const out = await deliver(ports(t, w), emailed(over));
    assert.equal(out.outcome === "refused" ? out.reason : null, reason, JSON.stringify({ over, who }));
    assert.equal(w.calls.length, reason ? 0 : 1, `${reason ?? "sent"}: the wire is called only for words that may go`);
    assert.equal(
      t.messages[0].status,
      reason ? "canceled" : "sent",
      `${reason ?? "sent"}: on the row it was queued as`,
    );
  }
});

test("email's wire is one workspace's: it sends the frozen request and nothing it assembled, and only as the mailbox it was bound to", async () => {
  // The mailbox the fixture's identity comes from, with a rotated-out reply route still routing.
  const AS = {
    address: "bestmovers@mail.chanlytics.com",
    replyRoutes: ["r+abcdefghijklmnopqrstuvwx@mail.chanlytics.com", "r+zyxwvutsrqponmlkjihgfedc@mail.chanlytics.com"],
  };
  assert.equal(emailSender([]), null, "no key or no mailbox: no route, and this workspace has no email line");
  const send = emailSender([{ lane: "hosted", cfg: { apiKey: "test-key" }, as: AS }]);
  const real = globalThis.fetch;
  const posted = [];
  globalThis.fetch = async (url, init) => {
    posted.push({ url, init });
    return new Response(JSON.stringify({ id: "re_9" }), { status: 200 });
  };
  const refused = (errorBody) => ({ ok: false, wamid: null, status: 0, errorBody });
  try {
    assert.deepEqual(await send(ADDRESS, { body: "hi" }), refused("no_frozen_request"));
    assert.deepEqual(
      await send("someone.else@example.com", { body: "hi", email: frozen() }),
      refused("request_names_another_recipient"),
    );
    // The provider key is every workspace's. What stops one business's row leaving as another is this.
    const another = { fromName: "Best Movers", fromAddress: "marisas@mail.chanlytics.com", replyTo: AS.replyRoutes[0] };
    assert.deepEqual(
      await send(ADDRESS, { body: "hi", email: frozen({ identity: another }) }),
      refused("request_leaves_as_another_sender"),
    );
    const elsewhere = {
      fromName: "Best Movers",
      fromAddress: AS.address,
      replyTo: "r+aaaaaaaaaaaaaaaaaaaaaaaa@mail.chanlytics.com",
    };
    assert.deepEqual(
      await send(ADDRESS, { body: "hi", email: frozen({ identity: elsewhere }) }),
      refused("request_leaves_as_another_sender"),
      "answers would route to somebody else",
    );
    assert.equal(posted.length, 0, "none of them reached the provider");

    assert.deepEqual(await send(ADDRESS, { body: "hi", email: frozen() }), {
      ok: true,
      wamid: "re_9",
      status: 200,
      outcome: "ok",
    });
    const rotated = { fromName: "Best Movers", fromAddress: AS.address, replyTo: AS.replyRoutes[1] };
    assert.equal(
      (await send(ADDRESS, { body: "hi", email: frozen({ identity: rotated }) })).ok,
      true,
      "a request frozen before a rotation still leaves",
    );
    assert.equal(posted.length, 2);
  } finally {
    globalThis.fetch = real;
  }
});

test("a workspace with no email wire bound fails as ours, like any channel this runtime does not have", async () => {
  const t = tables({ conversations: [thread({ contacts: onEmail() })], messages: [queuedEmail()] });
  const out = await deliver(ports(t, wireOf()), emailed());
  assert.equal(out.outcome, "failed");
  assert.equal(out.reason, "no_sender_for_channel");
  assert.equal(t.messages.length, 1, "on the row it was queued as, never a second");
  assert.equal(t.messages[0].status, "failed");
});

test("an email leaves only from the queued row its request was frozen for: without one, or under another row's key, the door refuses the caller before it reads anything", async () => {
  for (const [over, who, why] of [
    [{ messageId: undefined }, onEmail(), "no row"],
    [{ messageId: null }, onEmail(), "no row"],
    [{ messageId: "m2" }, onEmail(), "another row's key"],
    // A person the door would refuse: had it read first, it would cancel m2 and say why. It reads nothing.
    [
      { messageId: "m2" },
      onEmail({ email_suppressed_at: "2026-09-01T00:00:00Z" }),
      "another row's key, a refused person",
    ],
  ]) {
    const t = tables({ conversations: [thread({ contacts: who })], messages: [queuedEmail({ id: "m2" })] });
    const w = emailWire();
    await assert.rejects(
      deliver(ports(t, w), emailed(over)),
      /an email leaves only from the queued row its request was frozen for/,
      why,
    );
    assert.equal(w.calls.length, 0, `${why}: the wire is never called`);
    assert.equal(t.messages.length, 1, `${why}: no row is written`);
    assert.equal(t.messages[0].status, "queued", `${why}: the row that is there is left alone`);
    assert.equal(t.events.length, 0, `${why}: and nothing is said about it, because nothing was read`);
  }
  // The door's own after-the-send writer takes no email either: an id it mints is one no receipt can name.
  const { recordOutbound } = await import(pathToFileURL(path.join(ROOT, "packages/db/dist/index.js")).href);
  const t = tables();
  await assert.rejects(
    recordOutbound(fakeDb(t), {
      tenantId: T,
      conversationId: "c1",
      contactId: "k1",
      sender: "human",
      body: "x",
      externalId: "re_1",
      channel: "email",
    }),
    /an email's row is written before it is sent/,
  );
  assert.equal(t.messages.length, 0);
});

test("a refusal the mail provider gives for a limit of its own is named at the door, and only on email", async () => {
  const refusal = (name) => ({
    ok: false,
    wamid: null,
    status: 429,
    errorBody: JSON.stringify({ statusCode: 429, name, message: "x" }),
  });
  for (const [name, limit] of [
    ["daily_quota_exceeded", "daily"],
    ["monthly_quota_exceeded", "monthly"],
    ["rate_limit_exceeded", "rate"],
  ]) {
    const t = tables({ conversations: [thread({ contacts: onEmail() })], messages: [queuedEmail()] });
    const out = await deliver(ports(t, emailWire(refusal(name))), emailed());
    assert.deepEqual([out.outcome, out.reason, out.limit], ["failed", "provider", limit], name);
    assert.equal(t.messages[0].status, "failed", `${name}: the row it was queued as says so`);
  }
  const wa = tables();
  const waOut = await deliver(ports(wa, wireOf(refusal("rate_limit_exceeded"))), words());
  assert.equal(waOut.outcome, "failed");
  assert.equal("limit" in waOut, false, "WhatsApp's 429 is not the mail provider's");
  const noWire = tables({ conversations: [thread({ contacts: onEmail() })], messages: [queuedEmail()] });
  assert.equal("limit" in (await deliver(ports(noWire, wireOf()), emailed())), false, "no wire is ours, not a limit");
});

test('WhatsApp\'s own "too many, too fast" is named at the door, and only that: a timeout or a 5xx may have been taken', async () => {
  const graph = (status, code) => ({
    ok: false,
    wamid: null,
    status,
    errorBody: JSON.stringify({ error: { code } }),
    code,
  });
  for (const [status, code] of [
    [429, null],
    [400, 130429],
    [400, 131056],
    [400, 131048],
    [400, 80007],
    [400, 4],
  ]) {
    const t = tables();
    const out = await deliver(ports(t, wireOf(graph(status, code))), words());
    assert.deepEqual([out.outcome, out.reason, out.throttled], ["failed", "provider", true], `${status} ${code}`);
    assert.equal(t.messages[0].status, "failed", `${status} ${code}: the thread still shows it tried`);
  }
  for (const [status, code] of [
    [0, null],
    [500, null],
    [400, 131026],
    [400, 100],
    [401, 190],
  ]) {
    const out = await deliver(ports(tables(), wireOf(graph(status, code))), words());
    assert.equal(out.outcome, "failed");
    assert.equal("throttled" in out, false, `${status} ${code} is not a throttle`);
  }
  // The mail provider's 429 is its limit (resendLimitOf), never WhatsApp's "not now".
  const mail = tables({ conversations: [thread({ contacts: onEmail() })], messages: [queuedEmail()] });
  const mailOut = await deliver(
    ports(
      mail,
      emailWire({ ok: false, wamid: null, status: 429, errorBody: JSON.stringify({ name: "rate_limit_exceeded" }) }),
    ),
    emailed(),
  );
  assert.equal(mailOut.limit, "rate");
  assert.equal("throttled" in mailOut, false);
});

test("a row the door writes after the send is on the channel it went out on: a text is a text, sent or failed", async () => {
  for (const [result, status] of [
    [{ ok: true, wamid: "SM1", status: 201 }, "sent"],
    [{ ok: false, wamid: null, status: 500, errorBody: "boom" }, "failed"],
  ]) {
    const t = tables();
    await deliver(ports(t, { wire: { sms: async () => result } }), words({ channel: "sms" }));
    assert.equal(t.messages.length, 1, JSON.stringify(result));
    assert.deepEqual([t.messages[0].channel, t.messages[0].status], ["sms", status], JSON.stringify(result));
  }
});

/* --------------------------------------------------------------- outreach */

const MAILBOX = {
  local_part: "bestmovers",
  reply_token: "abcdefghijklmnopqrstuvwx",
  reply_token_prev: null,
};
const OWN = { host: "getharbor.com", from_local: "sam", from_name: "Sam at Harbor" };
const OWNER = "owner@example.com";
/** A cold email as Part 3's writer freezes it: the own domain's identity, a campaign's unsubscribe and footer. */
const coldRequest = (over = {}) =>
  buildEmailRequest({
    identity: ownDomainIdentity(OWN, MAILBOX, "mail.chanlytics.com"),
    to: OWNER,
    parent: null,
    subject: "Your moving quotes",
    body: "Saw your shop on the map.",
    signature: null,
    actor: "ai",
    campaign: {
      unsubscribeUrl: "https://app.chanlytics.com/u/token",
      footer:
        "You're hearing from us because your business is listed on Maps. Unsubscribe: https://app.chanlytics.com/u/token",
    },
    messageId: "m1",
    tenantId: T,
    ...over,
  });
/** Twenty clean days: the ramp's 100 a day. */
const CLEAN_SINCE = new Date(NOW - 20 * 86_400_000).toISOString();
const HARBOR = { tenant_id: T, host: "getharbor.com", from_local: "sam", state: "verified", clean_since: CLEAN_SINCE };
const coldWorld = ({ who = {}, leads, domains } = {}) =>
  tables({
    conversations: [thread({ contact_id: "k1", contacts: onEmail({ email: OWNER, consent: "unknown", ...who }) })],
    messages: [queuedEmail({ sender: "ai" })],
    leads: leads ?? [{ id: "l1", tenant_id: T, contact_id: "k1" }],
    sending_domains: domains ?? [
      { tenant_id: T, host: "getharbor.com", from_local: "sam", state: "verified", clean_since: CLEAN_SINCE },
    ],
  });
const cold = (over = {}) =>
  words({
    to: OWNER,
    channel: "email",
    sender: "ai",
    purpose: "outreach",
    proactive: true,
    email: coldRequest(),
    body: "Saw your shop on the map.",
    messageId: "m1",
    ...over,
  });

test("outreach goes by email and nothing else: on a phone's wire it is refused before anything of email's is asked", async () => {
  for (const channel of ["sms", "whatsapp"]) {
    const t = tables();
    const w = wireOf();
    const out = await deliver(ports(t, w), words({ channel, purpose: "outreach", proactive: true }));
    assert.deepEqual([out.outcome, out.reason], ["refused", "outreach_is_email_only"], channel);
    assert.equal(w.calls.length, 0);
  }
});

test("a cold email goes only as its rules allow: each refusal, in order, cancels the row with its reason and says it once", async () => {
  const hosted = {
    fromName: "Best Movers",
    fromAddress: "bestmovers@mail.chanlytics.com",
    replyTo: "r+abcdefghijklmnopqrstuvwx@mail.chanlytics.com",
  };
  const cases = [
    // The person's own no outranks every wire rule, a domain on hold included.
    [
      "unsubscribed",
      {
        who: { email_marketing: "opted_out" },
        domains: [{ tenant_id: T, host: "getharbor.com", from_local: "sam", state: "held" }],
      },
      {},
    ],
    ["opted_out", { who: { dnc: true } }, {}],
    ["outreach_not_a_lead", { leads: [{ id: "l1", tenant_id: T, contact_id: "someone-else" }] }, {}],
    ["outreach_not_a_lead", { leads: [{ id: "l1", tenant_id: "another-workspace", contact_id: "k1" }] }, {}],
    ["outreach_without_unsubscribe", {}, { email: coldRequest({ campaign: undefined }) }],
    ["outreach_needs_own_domain", {}, { email: coldRequest({ identity: hosted }) }],
    [
      "outreach_needs_own_domain",
      { domains: [{ tenant_id: "another-workspace", host: "getharbor.com", from_local: "sam", state: "verified" }] },
      {},
    ],
    // Another name on the workspace's own domain is not the address Connections set up.
    [
      "outreach_needs_own_domain",
      {},
      {
        email: coldRequest({
          identity: ownDomainIdentity({ ...OWN, from_local: "other" }, MAILBOX, "mail.chanlytics.com"),
        }),
      },
    ],
    [
      "sending_domain_not_ready",
      { domains: [{ tenant_id: T, host: "getharbor.com", from_local: "sam", state: "records" }] },
      {},
    ],
    [
      "sending_domain_not_ready",
      { domains: [{ tenant_id: T, host: "getharbor.com", from_local: "sam", state: "held" }] },
      {},
    ],
    // Email's own facts still hold for a cold email.
    ["email_suppressed", { who: { email_suppressed_at: "2026-09-01T00:00:00Z" } }, {}],
  ];
  for (const [reason, world, over] of cases) {
    const t = coldWorld(world);
    const w = emailWire();
    const out = await deliver(ports(t, w), cold(over));
    assert.deepEqual([out.outcome, out.reason], ["refused", reason], JSON.stringify(world));
    assert.equal(w.calls.length, 0, `${reason}: nothing reaches the wire`);
    assert.deepEqual([t.messages[0].status, t.messages[0].error], ["canceled", { reason }]);
    const blocked = t.events.filter((e) => e.kind === "message.send_blocked");
    assert.equal(blocked.length, 1, `${reason}: said once`);
    assert.equal(blocked[0].data.purpose, "outreach");
  }
});

test("a cold email to a business the finder found, from the workspace's own verified domain, is sent; a reply never reads outreach's facts", async () => {
  const t = coldWorld();
  const w = emailWire();
  const d = cold();
  const out = await deliver(ports(t, w), d);
  assert.equal(out.outcome, "sent");
  assert.equal(w.calls[0].p.email, d.email);
  assert.equal(w.calls[0].p.purpose, "outreach", "the wire is told the lane");
  assert.equal(t.messages[0].status, "sent");

  const r = tables({ conversations: [thread({ contact_id: "k1", contacts: onEmail() })], messages: [queuedEmail()] });
  const db = fakeDb(r, {}, outreachRpc(r));
  const replied = await deliver({ db, wire: emailWire().wire, now: () => NOW }, emailed());
  assert.equal(replied.outcome, "sent");
  assert.deepEqual(
    db.seen.filter((s) => s.rpc === "outreach_facts" || s.table === "leads" || s.table === "sending_domains"),
    [],
    "a conversational send pays for no outreach read",
  );
});

test("a read of outreach's facts that fails is not a yes: the door throws and the row is left for the retry", async () => {
  const t = coldWorld();
  const w = emailWire();
  const refusing = {
    outreach_facts: () => {
      throw new Error("the database went away");
    },
  };
  await assert.rejects(
    deliver({ db: fakeDb(t, {}, refusing), wire: w.wire, now: () => NOW }, cold()),
    /cannot read the outreach facts/,
  );
  assert.equal(w.calls.length, 0);
  assert.equal(t.messages[0].status, "queued", "left for the retry");
});

test("email's wire picks its route by the request's From: the hosted mailbox on the platform's key, an own domain on the cold key, and nothing else", async () => {
  const hosted = { lane: "hosted", cfg: { apiKey: "platform-key" }, as: sendsAs(MAILBOX, "mail.chanlytics.com") };
  const own = { lane: "own", cfg: { apiKey: "cold-key" }, as: sendsAsOwnDomain(OWN, MAILBOX, "mail.chanlytics.com") };
  assert.deepEqual(own.as, {
    address: "sam@getharbor.com",
    replyRoutes: ["r+abcdefghijklmnopqrstuvwx@mail.chanlytics.com"],
  });
  const send = emailSender([hosted, own]);
  const real = globalThis.fetch;
  const keys = [];
  globalThis.fetch = async (_url, init) => {
    keys.push(init.headers.Authorization);
    return new Response(JSON.stringify({ id: "re_9" }), { status: 200 });
  };
  const refused = { ok: false, wamid: null, status: 0, errorBody: "request_leaves_as_another_sender" };
  try {
    assert.equal((await send(OWNER, { body: "x", email: coldRequest(), purpose: "outreach" })).ok, true);
    assert.equal((await send(ADDRESS, { body: "x", email: frozen() })).ok, true);
    assert.deepEqual(keys, ["Bearer cold-key", "Bearer platform-key"], "each leaves on its own account");
    // A domain this workspace has no route for (not verified, or somebody else's) is not sent from.
    const elsewhere = coldRequest({
      identity: ownDomainIdentity({ ...OWN, host: "other.example" }, MAILBOX, "mail.chanlytics.com"),
    });
    assert.deepEqual(await send(OWNER, { body: "x", email: elsewhere, purpose: "outreach" }), refused);
    // The chosen route's own Reply-To rule still holds: an answer must come back to this mailbox.
    const strayReply = coldRequest({
      identity: {
        ...ownDomainIdentity(OWN, MAILBOX, "mail.chanlytics.com"),
        replyTo: "r+aaaaaaaaaaaaaaaaaaaaaaaa@mail.chanlytics.com",
      },
    });
    assert.deepEqual(await send(OWNER, { body: "x", email: strayReply, purpose: "outreach" }), refused);
    // The lanes: an own domain carries outreach only, and outreach never leaves as the hosted mailbox. A reply frozen
    // with an own domain's From (or a job that forgot its purpose) would otherwise leave around outreach's rules.
    assert.deepEqual(await send(OWNER, { body: "x", email: coldRequest() }), refused, "no purpose: hosted lane only");
    assert.deepEqual(await send(OWNER, { body: "x", email: coldRequest(), purpose: "conversational" }), refused);
    assert.deepEqual(await send(ADDRESS, { body: "x", email: frozen(), purpose: "outreach" }), refused);
    assert.equal(keys.length, 2, "no refusal reached a provider");
  } finally {
    globalThis.fetch = real;
  }
});

/* ------------------------------------------ Part 5.4: a person's reply may leave by its own domain (G15, N5) */

/** A person's reply to a reach-out, frozen a second time on the chain's own domain: the same row, the same words. */
const ownTwin = (over = {}) => frozen({ identity: ownDomainIdentity(OWN, MAILBOX, "mail.chanlytics.com"), ...over });

test("a person's reply leaves by its own domain when that route still holds it, and as the mailbox's request otherwise, saying why", async () => {
  const hosted = { lane: "hosted", cfg: { apiKey: "platform-key" }, as: sendsAs(MAILBOX, "mail.chanlytics.com") };
  const own = { lane: "own", cfg: { apiKey: "cold-key" }, as: sendsAsOwnDomain(OWN, MAILBOX, "mail.chanlytics.com") };
  const real = globalThis.fetch;
  const sent = [];
  globalThis.fetch = async (_url, init) => {
    sent.push([init.headers.Authorization, JSON.parse(init.body).from]);
    return new Response(JSON.stringify({ id: "re_7" }), { status: 200 });
  };
  const mailbox = frozen({
    identity: {
      fromName: "Best Movers",
      fromAddress: "bestmovers@mail.chanlytics.com",
      replyTo: "r+abcdefghijklmnopqrstuvwx@mail.chanlytics.com",
    },
  });
  const reply = (ownEmail, extra = {}) => ({ body: "x", email: mailbox, reply: true, ownEmail, ...extra });
  try {
    const both = emailSender([hosted, own]);
    const byOwn = await both(ADDRESS, reply(ownTwin()));
    assert.deepEqual([byOwn.ok, byOwn.leftAs, byOwn.leftAsWhy], [true, "own", undefined]);
    assert.deepEqual(
      sent.pop(),
      ["Bearer cold-key", '"Sam at Harbor" <sam@getharbor.com>'],
      "the twin, on the cold key",
    );

    const asMailbox = async (send, twin, why) => {
      const r = await send(ADDRESS, reply(twin));
      assert.deepEqual([r.ok, r.leftAs, r.leftAsWhy], [true, "mailbox", why], why);
      assert.deepEqual(sent.pop(), ["Bearer platform-key", '"Best Movers" <bestmovers@mail.chanlytics.com>'], why);
    };
    // No own route at all: the cold lane's keys unset.
    await asMailbox(emailSender([hosted]), ownTwin(), "no_own_route");
    // The twin's domain has no route: held or removed after the freeze, or somebody else's.
    const elsewhere = ownTwin({
      identity: ownDomainIdentity({ ...OWN, host: "other.example" }, MAILBOX, "mail.chanlytics.com"),
    });
    await asMailbox(both, elsewhere, "domain_has_no_route");
    // A domain of the workspace's that is held has no route either, and the row says it was held: its only one, or
    // one beside a domain that still sends.
    const heldAt = /<([^<>]+)>/.exec(elsewhere.from)[1];
    await asMailbox(emailSender([hosted], [heldAt]), elsewhere, "domain_held");
    await asMailbox(emailSender([hosted, own], [heldAt]), elsewhere, "domain_held");
    await asMailbox(emailSender([hosted, own], [heldAt]), ownTwin({ to: OWNER }), "twin_names_another_recipient");
    // The route refuses the twin's Reply-To: a retired reply route.
    const retired = ownTwin({
      identity: {
        ...ownDomainIdentity(OWN, MAILBOX, "mail.chanlytics.com"),
        replyTo: "r+aaaaaaaaaaaaaaaaaaaaaaaa@mail.chanlytics.com",
      },
    });
    await asMailbox(both, retired, "route_refuses_twin");
    // A twin to somebody else is never sent: the reply goes to the address it was written to, as the mailbox.
    await asMailbox(both, ownTwin({ to: OWNER }), "twin_names_another_recipient");

    // Only a reply carries a twin: without `reply` the request leaves exactly as before, whatever else it holds.
    const plain = await both(ADDRESS, { body: "x", email: mailbox, ownEmail: ownTwin() });
    assert.deepEqual([plain.ok, plain.leftAs], [true, undefined]);
    assert.equal(sent.pop()[0], "Bearer platform-key");
    // And a reply whose own request names an own domain is still refused: the twin is the one way out by it.
    const refused = { ok: false, wamid: null, status: 0, errorBody: "request_leaves_as_another_sender" };
    assert.deepEqual(await both(ADDRESS, { body: "x", email: ownTwin(), reply: true }), refused);
    // Outreach is outreach's lane, never the twin's: it leaves by its own route only, as before.
    const coldOut = await both(OWNER, {
      body: "x",
      email: coldRequest(),
      purpose: "outreach",
      reply: true,
      ownEmail: ownTwin(),
    });
    assert.deepEqual([coldOut.ok, coldOut.leftAs], [true, undefined]);
    assert.equal(sent.pop()[0], "Bearer cold-key");
    assert.equal(sent.length, 0, "no refusal reached a provider");
  } finally {
    globalThis.fetch = real;
  }
});

test("the door hands the twin to the wire only for a person's reply, and records how it left on the row", async () => {
  const stamped = [];
  const rpc = (t) => ({
    ...outreachRpc(t),
    stamp_email_left_as: (args) => {
      stamped.push(args);
      return true;
    },
  });
  const run = async (over, result) => {
    const t = tables({ conversations: [thread({ contacts: onEmail() })], messages: [queuedEmail(over.row ?? {})] });
    const w = emailWire(result);
    const out = await deliver(
      { db: fakeDb(t, {}, rpc(t)), wire: w.wire, now: () => NOW },
      emailed({ ownEmail: ownTwin(), ...over.delivery }),
    );
    return { out, p: w.calls[0]?.p };
  };
  // A person's reply: the twin goes with it, and how it left is stamped.
  const own = await run(
    { delivery: { sender: "human", proactive: false } },
    { ok: true, wamid: "re_1", status: 200, leftAs: "own" },
  );
  assert.equal(own.out.outcome, "sent");
  assert.deepEqual([own.p.reply, own.p.ownEmail?.from], [true, '"Sam at Harbor" <sam@getharbor.com>']);
  const mailbox = await run(
    { delivery: { sender: "human", proactive: false } },
    { ok: true, wamid: "re_1", status: 200, leftAs: "mailbox", leftAsWhy: "domain_has_no_route" },
  );
  assert.equal(mailbox.out.outcome, "sent");
  assert.deepEqual(stamped, [
    { p_tenant_id: T, p_message_id: "m1", p_left_as: "own", p_why: null },
    { p_tenant_id: T, p_message_id: "m1", p_left_as: "mailbox", p_why: "domain_has_no_route" },
  ]);
  // A draft the receptionist wrote, a person's first email and a system send never carry it.
  for (const delivery of [
    { sender: "ai", proactive: false },
    { sender: "human", proactive: true },
    { sender: "system", proactive: false, kind: "system" },
  ]) {
    const r = await run({ delivery }, undefined);
    assert.equal(r.p?.reply, undefined, JSON.stringify(delivery));
    assert.equal(r.p?.ownEmail, undefined, JSON.stringify(delivery));
  }
  assert.equal(stamped.length, 2, "nothing stamped for a send that did not say how it left");
  // A twin frozen under another row's id is a caller's mistake, said before anything is read.
  await assert.rejects(
    run({ delivery: { sender: "human", proactive: false, ownEmail: ownTwin({ messageId: "m9" }) } }, undefined),
    /leaves only from the queued row its request was frozen for/,
  );
});

/* ------------------------------------------------ Part 2.5: the door holds cold email to every rule (00177) */

test("a cold email is a broadcast whoever the row says wrote it: every pause holds it (D1)", async () => {
  const pausedUntil = new Date(NOW + 3_600_000).toISOString();
  // Nor does a caller naming the kind itself change it: a reply skips every pause, a system message the thread's (2.6).
  for (const [sender, proactive, kind] of [
    ["human", undefined],
    ["human", false],
    ["ai", undefined],
    ["ai", undefined, "reply"],
    ["human", undefined, "system"],
  ]) {
    const paused = coldWorld();
    paused.conversations[0].tenants = { status: "paused" };
    const a = await deliver(ports(paused, emailWire()), cold({ sender, proactive, ...(kind ? { kind } : {}) }));
    assert.deepEqual([a.outcome, a.reason], ["refused", "paused"], `${sender}/${proactive}: a paused workspace`);
    const held = coldWorld();
    held.conversations[0].paused_until = pausedUntil;
    const b = await deliver(ports(held, emailWire()), cold({ sender, proactive, ...(kind ? { kind } : {}) }));
    assert.deepEqual([b.outcome, b.reason], ["refused", "human_has_it"], `${sender}/${proactive}: a paused thread`);
  }
});

test("the door asks the spec's send-time questions: the lead still being written to, the never-again list, the day's share (D2)", async () => {
  const cases = [
    ["outreach_lead_closed", { leads: [{ id: "l1", tenant_id: T, contact_id: "k1", stage: "converted" }] }, {}],
    ["outreach_lead_closed", { leads: [{ id: "l1", tenant_id: T, contact_id: "k1", stage: "archived" }] }, {}],
    ["outreach_not_a_lead", { leads: [] }, {}],
    ["outreach_suppressed", {}, { suppressed: [OWNER] }],
    // The ramp counts the days a domain sent (D15): clean twenty days and sent on none, it has the first step's 30;
    // sent on fourteen, the second's 100.
    ["sending_domain_at_cap", {}, { sent_since: 30 }],
    [null, {}, { sent_since: 29 }],
    ["sending_domain_at_cap", { domains: [{ ...HARBOR, sent_days: 14 }] }, { sent_since: 100 }],
    [null, { domains: [{ ...HARBOR, sent_days: 14 }] }, { sent_since: 99 }],
    // A domain not yet clean has no day's share at all.
    ["sending_domain_at_cap", { domains: [{ ...HARBOR, clean_since: null, sent_days: 20 }] }, {}],
  ];
  for (const [reason, world, extra] of cases) {
    const t = Object.assign(coldWorld(world), extra);
    const w = emailWire();
    const out = await deliver(ports(t, w), cold());
    assert.equal(out.outcome === "refused" ? out.reason : null, reason, JSON.stringify({ world, extra }));
    assert.equal(w.calls.length, reason ? 0 : 1);
  }
  // The person's own no still outranks every wire rule.
  const both = Object.assign(coldWorld({ who: { email_marketing: "opted_out" } }), {
    suppressed: [OWNER],
    sent_since: 500,
  });
  assert.equal((await deliver(ports(both, emailWire()), cold())).reason, "unsubscribed");
});

test("a cold send leaves its thread where it was, so a run never pushes customers off the Inbox (D3)", async () => {
  const before = "2026-09-01T00:00:00.000Z";
  const t = coldWorld();
  t.conversations[0].last_message_at = before;
  assert.equal((await deliver(ports(t, emailWire()), cold())).outcome, "sent");
  assert.equal(t.conversations[0].last_message_at, before, "outreach does not move the thread");
  const r = tables({
    conversations: [thread({ contacts: onEmail(), last_message_at: before })],
    messages: [queuedEmail()],
  });
  assert.equal((await deliver(ports(r, emailWire()), emailed())).outcome, "sent");
  assert.notEqual(r.conversations[0].last_message_at, before, "a reply still does");
});

test("a send that timed out is failed with its outcome unknown, so its receipt may still settle it (D5)", async () => {
  // The wire says what the send came to (channels provider-fetch): a timeout may have been taken all the same.
  const t = coldWorld();
  const timedOut = { ok: false, wamid: null, status: 0, errorBody: "timeout", outcome: "unknown" };
  const out = await deliver(ports(t, emailWire(timedOut)), cold());
  assert.deepEqual([out.outcome, out.mayHaveGone], ["failed", true], "the caller hears it may have gone");
  assert.deepEqual(t.messages[0].error, { http_status: 0, body: "timeout", outcome: "unknown" });
  const u = coldWorld();
  const neverLeft = { ok: false, wamid: null, status: 0, errorBody: "fetch failed", outcome: "retryable" };
  const left = await deliver(ports(u, emailWire(neverLeft)), cold());
  assert.equal("mayHaveGone" in left, false);
  assert.equal(t.messages[0].error.outcome, "unknown");
  assert.equal("outcome" in u.messages[0].error, false, "a request that never left is plainly failed");
});

test("a cold email whose From cannot be read is refused for its domain, not as a person the finder never found", async () => {
  const t = coldWorld();
  const unreadable = cold();
  unreadable.email = { ...unreadable.email, from: "not an address" };
  const out = await deliver(ports(t, emailWire()), unreadable);
  assert.deepEqual([out.outcome, out.reason], ["refused", "outreach_needs_own_domain"]);
});

/* ------------------------------------------------ Part 2.6: a business that wrote back is in a conversation (00181) */

test("a business that wrote back, in any words on any channel, is never written to cold again; an out-of-office is not writing back", async () => {
  const inbound = (over) => ({
    id: `in-${over.channel}-${over.meta?.email?.claim ?? "none"}`,
    tenant_id: T,
    conversation_id: "c1",
    direction: "inbound",
    sender: "customer",
    status: "received",
    ...over,
  });
  const cases = [
    // "No thanks", "who is this?", "call me": a person wrote, and the foot's promise ("reply and I won't write again") is kept.
    ["outreach_wrote_back", [inbound({ channel: "email", meta: { email: { claim: "person" } } })]],
    ["outreach_wrote_back", [inbound({ channel: "whatsapp", meta: {} })]],
    ["outreach_wrote_back", [inbound({ channel: "sms", meta: {} })]],
    // A helpdesk or a CRM sends a person's no with a list's headers: a no missed is the mistake that must not be made.
    ["outreach_wrote_back", [inbound({ channel: "email", meta: { email: { claim: "automated" } } })]],
    // An out-of-office is no person's words: the sequence goes on.
    [null, [inbound({ channel: "email", meta: { email: { claim: "auto_reply" } } })]],
    // Another person's thread is not theirs.
    [null, [inbound({ channel: "email", conversation_id: "c2", meta: {} })]],
  ];
  for (const [reason, messages] of cases) {
    const t = coldWorld();
    t.conversations.push(thread({ id: "c2", contact_id: "k2" }));
    t.messages.push(...messages);
    const w = emailWire();
    const out = await deliver(ports(t, w), cold());
    assert.equal(out.outcome === "refused" ? out.reason : null, reason, JSON.stringify(messages));
    assert.equal(w.calls.length, reason ? 0 : 1);
  }
});

test("a database that cannot say whether the business wrote back is not a no: the door throws, and the row is left for the retry", async () => {
  // An edge deployed before 00181 is applied reads an answer without the fact. Reading it as "never wrote" would write
  // cold to someone who asked to be left alone.
  const t = coldWorld();
  const w = emailWire();
  const older = {
    outreach_facts: (a) => {
      const { wrote_back: _gone, ...rest } = outreachRpc(t).outreach_facts(a);
      return rest;
    },
  };
  await assert.rejects(
    deliver({ db: fakeDb(t, {}, older), wire: w.wire, now: () => NOW }, cold()),
    /whether this person wrote back/,
  );
  assert.equal(w.calls.length, 0);
  assert.equal(t.messages[0].status, "queued", "left for the retry");
});

test("a cold email that names its lead is judged by that lead: a business closed is refused though its person has another lead open", async () => {
  const both = () =>
    coldWorld({
      leads: [
        { id: "l1", tenant_id: T, contact_id: "k1", stage: "archived" },
        { id: "l2", tenant_id: T, contact_id: "k1", stage: "ready" },
      ],
    });
  const t = both();
  const db = fakeDb(t, {}, outreachRpc(t));
  const w = emailWire();
  const out = await deliver({ db, wire: w.wire, now: () => NOW }, cold({ leadId: "l1" }));
  assert.deepEqual([out.outcome, out.reason], ["refused", "outreach_lead_closed"]);
  assert.equal(w.calls.length, 0);
  assert.equal(db.seen.find((s) => s.rpc === "outreach_facts").args.p_lead_id, "l1", "asked by the send's own lead");
  // Named or not, the open lead lets it go; unnamed, the door asks about any lead of this person's (a reply's way).
  for (const over of [{ leadId: "l2" }, {}]) {
    const u = both();
    assert.equal((await deliver(ports(u, emailWire()), cold(over))).outcome, "sent", JSON.stringify(over));
  }
  // Another person's lead is no lead of this send's.
  const other = coldWorld({ leads: [{ id: "l9", tenant_id: T, contact_id: "someone-else", stage: "ready" }] });
  assert.equal((await deliver(ports(other, emailWire()), cold({ leadId: "l9" }))).reason, "outreach_not_a_lead");
});

test("a lead its owner stopped writing to is refused its cold email, a skip and never a wait; an older database says nothing of it", async () => {
  // Reach out Part 6 (H10): the stop is a fact of the send's own lead (00241 outreach_lead_facts.stopped), so an email
  // claimed or queued before the owner pressed Stop never leaves, and the clock skips it rather than planning it again.
  const stopped = () =>
    coldWorld({
      leads: [
        {
          id: "l1",
          tenant_id: T,
          contact_id: "k1",
          stage: "nurture",
          reach_out_stopped_at: "2026-09-28T15:00:00.000Z",
        },
      ],
    });
  const t = stopped();
  const w = emailWire();
  const out = await deliver(ports(t, w), cold({ leadId: "l1" }));
  assert.deepEqual([out.outcome, out.reason], ["refused", "outreach_stopped"]);
  assert.equal(w.calls.length, 0, "nothing reaches the wire");
  assert.equal(isWaitRefusal(out.reason), false, "a skip: the clock never plans it again");
  // A database before 00241 answers without the fact: not stopped, as it was, and the SQL halves of the stop hold.
  const u = stopped();
  const older = {
    outreach_facts: (a) => {
      const { stopped: _gone, ...rest } = outreachRpc(u).outreach_facts(a);
      return rest;
    },
  };
  const before = await deliver(
    { db: fakeDb(u, {}, older), wire: emailWire().wire, now: () => NOW },
    cold({ leadId: "l1" }),
  );
  assert.equal(before.outcome, "sent");
});

/* ---- A text leaves only on a line the carriers approved (One message, every channel, step 3) ---- */

test("a text is refused sms_line_not_active unless the workspace's line is active and no test filing: the row canceled with the reason, the wire never asked", async () => {
  const text = (over = {}) => words({ channel: "sms", sender: "ai", ...over });
  const queued = {
    id: "m1",
    tenant_id: T,
    conversation_id: "c1",
    status: "queued",
    body: "x",
    sender: "ai",
    channel: "sms",
    direction: "outbound",
    created_at: "2026-09-10T09:59:00.000Z",
  };
  const states = {
    "no line at all": [],
    "a line the carriers have not approved": [{ ...TEXT_LINE, sms_state: "pending" }],
    "a line whose registration failed": [{ ...TEXT_LINE, sms_state: "failed" }],
    "a test filing, however it is marked": [{ ...TEXT_LINE, reg_mock: true }],
    "another workspace's active line": [{ ...TEXT_LINE, tenant_id: "t2" }],
    "a line with no messaging service": [{ ...TEXT_LINE, messaging_service_sid: null }],
    "a line whose voice failed": [{ ...TEXT_LINE, voice_state: "failed" }],
  };
  for (const [why, lines] of Object.entries(states)) {
    const t = tables({ lines, messages: [{ ...queued }] });
    const w = wireOf();
    const out = await deliver({ ...ports(t, w) }, text({ messageId: "m1" }));
    assert.deepEqual(out, { outcome: "refused", reason: "sms_line_not_active", messageId: "m1" }, why);
    assert.equal(w.calls.length, 0, `${why}: the wire is not asked`);
    assert.equal(t.messages[0].status, "canceled", why);
    assert.deepEqual(t.messages[0].error, { reason: "sms_line_not_active" }, why);
    assert.deepEqual(kinds(t), ["message.send_blocked"], why);
  }
  // Active, no test filing: it goes, on the text wire.
  const ok = tables({ lines: [TEXT_LINE] });
  const calls = [];
  const sent = await deliver(
    ports(ok, { wire: { sms: async (to, p) => (calls.push({ to, p }), { ok: true, wamid: "SM1", status: 201 }) } }),
    text(),
  );
  assert.equal(sent.outcome, "sent");
  assert.equal(calls.length, 1);
  // The newest of the workspace's lines is the one asked, as the edge's sender picks it.
  const two = tables({
    lines: [
      { ...TEXT_LINE, sms_state: "active", created_at: "2026-09-01T00:00:00.000Z" },
      { ...TEXT_LINE, sms_state: "pending", created_at: "2026-09-09T00:00:00.000Z" },
    ],
  });
  assert.equal(
    (await deliver(ports(two, wireOf()), text())).reason,
    "sms_line_not_active",
    "the newer line is not approved yet",
  );
});

test("the line is judged as the workspace's channels are (contracts channelsReady): the door and the composer's tick agree on every state a line can be in", async () => {
  const { channelsReady } = await import("@chanlytics/contracts");
  const lines = [
    null,
    { sms_state: "active", reg_mock: false },
    { sms_state: "active", reg_mock: true },
    { sms_state: "pending", reg_mock: false },
    { sms_state: "failed", reg_mock: false },
    { sms_state: null, reg_mock: null },
  ];
  for (const line of lines) {
    const ready = channelsReady({ whatsapp: null, textLine: line, email: { mailbox: false, domain: false } }).sms.ready;
    const t = tables({ lines: line ? [{ ...TEXT_LINE, ...line }] : [] });
    const out = await deliver(
      ports(t, { wire: { sms: async () => ({ ok: true, wamid: "SM1", status: 201 }) } }),
      words({ channel: "sms", sender: "ai" }),
    );
    assert.equal(out.outcome === "sent", ready, JSON.stringify(line));
  }
});

test("only a text reads the line: a WhatsApp message or an email goes whatever the lines table holds, even when it cannot be read", async () => {
  const blip = { message: "canceling statement due to statement timeout" };
  const t = tables({ lines: [] });
  const w = wireOf();
  const out = await deliver(
    { db: fakeDb(t, { "lines.select": blip }, outreachRpc(t)), wire: w.wire, now: () => NOW },
    words(),
  );
  assert.equal(out.outcome, "sent");
  // And a text whose line could not be READ is the door throwing, never a text sent or refused on a guess.
  await assert.rejects(
    deliver(
      {
        db: fakeDb(tables({ lines: [TEXT_LINE] }), { "lines.select": blip }, {}),
        wire: { sms: async () => ({ ok: true, wamid: "SM1", status: 201 }) },
        now: () => NOW,
      },
      words({ channel: "sms", sender: "ai" }),
    ),
    /text_line_facts/,
  );
});

/* ----------------------------------------------------- offers by email (step 4) */

const { campaignsIdentity, sendsAsCampaigns } = await import(
  pathToFileURL(path.join(ROOT, "packages/channels/dist/index.js")).href
);
const OFFER_MAILBOX = {
  local_part: "bestmovers",
  reply_token: "abcdefghijklmnopqrstuvwx",
  reply_token_prev: null,
  from_name: "Best Movers",
};
const UNSUB = "https://app.example.com/u/token-for-this-person-and-this-email";
/** An offer's frozen request: from the campaigns domain, answered at the mailbox's reply route, its unsubscribe in the headers and the foot. */
const offerRequest = (over = {}) =>
  buildEmailRequest({
    identity: campaignsIdentity(OFFER_MAILBOX, "campaigns.example.com", "mail.chanlytics.com"),
    to: ADDRESS,
    parent: null,
    subject: "October at Best Movers",
    body: "Ten percent off a Saturday move.",
    signature: null,
    actor: "ai",
    campaign: {
      unsubscribeUrl: UNSUB,
      footer: `You're a customer of Best Movers.\nBest Movers · 12 Main St\nUnsubscribe: ${UNSUB}`,
      footerHtml: `<p>You&#39;re a customer of Best Movers.<br>Best Movers · 12 Main St<br><a href="${UNSUB}">Unsubscribe</a></p>`,
    },
    messageId: "m1",
    tenantId: T,
    ...over,
  });
const offered = (over = {}) =>
  words({
    to: ADDRESS,
    channel: "email",
    purpose: "marketing",
    sender: "human",
    proactive: true,
    kind: "broadcast",
    email: offerRequest(),
    body: "Ten percent off a Saturday move.",
    messageId: "m1",
    ...over,
  });
/** A customer with a relationship on record and nobody's no: the person an offer by email may go to. */
const customer = (over = {}) =>
  onEmail({
    marketing_consent: "unknown",
    consent_channels: ["whatsapp", "sms"],
    marketing_channels: null,
    email_marketing: "unknown",
    has_relationship: true,
    ...over,
  });
const offerWorld = (who, over = {}) => ({
  t: tables({
    conversations: [thread({ contacts: who })],
    messages: [queuedEmail()],
    mailboxes: [{ tenant_id: T, offers_paused_at: null, offers_paused_reason: null, ...over }],
  }),
  w: emailWire(),
});

test("an offer by email is refused wherever the deployment cannot send one: the door says so before anything else about the email", async () => {
  const { t, w } = offerWorld(customer());
  const closed = await deliver(ports(t, w), offered());
  assert.deepEqual(
    [closed.outcome, closed.reason],
    ["refused", "email_marketing_disabled"],
    "no emailOffers: as it was",
  );
  const no = await deliver(ports(t, w, { emailOffers: false }), offered());
  assert.equal(no.reason, "email_marketing_disabled");
  assert.equal(w.calls.length, 0);
  assert.equal(t.messages[0].status, "canceled", "the queued row says why, and the thread shows it");
  // Open, the same person goes.
  const open = offerWorld(customer());
  const out = await deliver(ports(open.t, open.w, { emailOffers: true }), offered());
  assert.equal(out.outcome, "sent", JSON.stringify(out));
  assert.equal(open.w.calls.length, 1);
});

test("every cell of the email row at the door: a relationship or their own yes goes; an address alone, an unsubscribe, a stop and a row read without the facts do not", async () => {
  const cases = [
    ["a customer: wrote, called or has a deal, nobody's no", customer(), null],
    [
      "asked for offers by email, no relationship at all",
      customer({ email_marketing: "opted_in", has_relationship: false }),
      null,
    ],
    ["an address and nothing else", customer({ has_relationship: false }), "no_marketing_consent"],
    // DECISION (3 Oct 2026): a recorded no to offers on WhatsApp bars an offer by email, a yes to it by email included.
    [
      "a customer who said no to offers on WhatsApp",
      customer({ marketing_consent: "opted_out" }),
      "no_marketing_consent",
    ],
    [
      "asked for offers by email, but said no to them on WhatsApp",
      customer({ email_marketing: "opted_in", marketing_consent: "opted_out" }),
      "no_marketing_consent",
    ],
    [
      "a row read before 00299, with no relationship column",
      (() => {
        const c = customer();
        delete c.has_relationship;
        return c;
      })(),
      "no_marketing_consent",
    ],
    ["unsubscribed, though a customer", customer({ email_marketing: "opted_out" }), "unsubscribed"],
    [
      "unsubscribed, though they once asked",
      customer({ email_marketing: "opted_out", marketing_consent: "opted_in" }),
      "unsubscribed",
    ],
    [
      "a STOP, whatever else is true",
      customer({ consent: "opted_out", dnc: true, email_marketing: "opted_in" }),
      "opted_out",
    ],
    ["do-not-contact", customer({ dnc: true }), "opted_out"],
    [
      "the address stopped (a bounce or a complaint)",
      customer({ email_suppressed_at: "2026-09-01T00:00:00Z" }),
      "email_suppressed",
    ],
    [
      "the address changed since the words were frozen",
      customer({ email: "ana.new@example.com" }),
      "recipient_changed",
    ],
    ["asked to be forgotten", customer({ erasing_since: "2026-09-10T09:00:00Z" }), "erased"],
  ];
  for (const [what, who, reason] of cases) {
    const { t, w } = offerWorld(who);
    const out = await deliver(ports(t, w, { emailOffers: true }), offered());
    assert.equal(out.outcome === "refused" ? out.reason : null, reason, what);
    assert.equal(w.calls.length, reason ? 0 : 1, `${what}: the wire is called only for an offer that may go`);
    assert.equal(t.messages[0].status, reason ? "canceled" : "sent", what);
  }
  // A message about their visit goes to the very same unsubscribed address: unsubscribe is not STOP.
  const unsub = offerWorld(customer({ email_marketing: "opted_out", has_relationship: false }));
  const visit = await deliver(
    ports(unsub.t, unsub.w, { emailOffers: true }),
    emailed({ purpose: "conversational", sender: "ai", proactive: true, kind: "broadcast", about: "theirs" }),
  );
  assert.equal(visit.outcome, "sent", "reminders and replies go on");
});

/**
 * The business's own news by email: a broadcast whose message is a utility, whatever its WhatsApp twin is (decision D1). Since
 * decision D2 it is an offer at the door: its request is an offer's (the campaigns domain, the one-click unsubscribe), and it
 * goes only where the deployment's campaigns domain is open and the workspace's offers are not paused.
 */
const news = (over = {}) =>
  offered({ purpose: "conversational", sender: "ai", proactive: true, kind: "broadcast", about: "ours", ...over });
/** A person with an address and nothing else on record: no yes of any kind, no relationship, nobody's no. */
const addressAlone = (over = {}) =>
  customer({ consent: "unknown", consent_channels: null, has_relationship: false, ...over });

test("the business's own news by email, at the door (decision D1): a relationship on record or a yes covering email sends it; an address alone, an unsubscribe and a stop do not; their visit's message needs none of them", async () => {
  const cases = [
    ["a relationship on record, no yes at all", addressAlone({ has_relationship: true }), null],
    ["a customer, yes to messages kept for WhatsApp and text", customer(), null],
    ["a yes covering email, no relationship", addressAlone({ consent: "opted_in", consent_channels: ["email"] }), null],
    [
      "a yes covering every channel, no relationship",
      addressAlone({ consent: "opted_in", consent_channels: ["whatsapp", "sms", "email"] }),
      null,
    ],
    ["an address and nothing else", addressAlone(), "not_opted_in"],
    [
      "a yes that does not cover email, no relationship",
      addressAlone({ consent: "opted_in", consent_channels: ["whatsapp", "sms"] }),
      "not_opted_in",
    ],
    [
      "a yes from before the channels were (WhatsApp alone), no relationship",
      addressAlone({ consent: "opted_in" }),
      "not_opted_in",
    ],
    [
      "a yes to email that was withdrawn (the state is not a yes)",
      addressAlone({ consent: "unknown", consent_channels: ["email"] }),
      "not_opted_in",
    ],
    [
      "a row read without the relationship column",
      (() => {
        const c = addressAlone();
        delete c.has_relationship;
        return c;
      })(),
      "not_opted_in",
    ],
    [
      "unsubscribed, though a customer with a yes covering email",
      customer({ email_marketing: "opted_out", consent_channels: ["email"] }),
      "unsubscribed",
    ],
    ["a STOP, whatever else is true", customer({ consent: "opted_out", consent_channels: ["email"] }), "opted_out"],
    ["do-not-contact", customer({ dnc: true }), "opted_out"],
    [
      "the address stopped (a bounce or a complaint)",
      customer({ email_suppressed_at: "2026-09-01T00:00:00Z" }),
      "email_suppressed",
    ],
  ];
  for (const [what, who, reason] of cases) {
    const { t, w } = offerWorld(who);
    const out = await deliver(ports(t, w, { emailOffers: true }), news());
    assert.equal(out.outcome === "refused" ? out.reason : null, reason, what);
    assert.equal(w.calls.length, reason ? 0 : 1, `${what}: the wire is called only for news that may go`);
    assert.equal(t.messages[0].status, reason ? "canceled" : "sent", what);
  }
  // Their visit's message (or a reply) goes to every one of them but a STOP, a do-not-contact and a dead address, and asks
  // none of the offer's gates: not the campaigns domain (no `emailOffers` here), not the pause, not the one-click unsubscribe.
  for (const [what, who, stopped] of [
    ["an address and nothing else", addressAlone(), false],
    ["unsubscribed", customer({ email_marketing: "opted_out", has_relationship: false, consent: "unknown" }), false],
    ["a STOP", customer({ consent: "opted_out" }), true],
    ["do-not-contact", customer({ dnc: true }), true],
  ]) {
    for (const d of [
      news({ about: "theirs", email: frozen() }),
      news({ proactive: false, email: frozen() }),
      emailed({ purpose: "conversational", sender: "ai", proactive: true, kind: "broadcast", about: "theirs" }),
    ]) {
      const { t, w } = offerWorld(who, {
        offers_paused_at: "2026-10-01T10:00:00Z",
        offers_paused_reason: "complaints",
      });
      const out = await deliver(ports(t, w), d);
      assert.equal(out.outcome === "refused" ? out.reason : null, stopped ? "opted_out" : null, `${what} ${d.about}`);
      assert.equal(w.calls.length, stopped ? 0 : 1, what);
    }
  }
  // Decision D2: the business's own news is an offer at the door, so the offer's gates hold it: the deployment's campaigns
  // domain (refused before anything else about the email), the workspace's pause, and the one-click unsubscribe it owes.
  const customerNews = () => offerWorld(addressAlone({ has_relationship: true }));
  const closed = customerNews();
  const noDomain = await deliver(ports(closed.t, closed.w), news());
  assert.deepEqual([noDomain.outcome, noDomain.reason], ["refused", "email_marketing_disabled"], "no campaigns domain");
  assert.equal(closed.w.calls.length, 0);
  const paused = offerWorld(addressAlone({ has_relationship: true }), {
    offers_paused_at: "2026-10-01T10:00:00Z",
    offers_paused_reason: "complaints",
  });
  const held = await deliver(ports(paused.t, paused.w, { emailOffers: true }), news());
  assert.deepEqual([held.outcome, held.reason], ["refused", "email_offers_paused"], "a pause on offers holds the news");
  assert.equal(paused.w.calls.length, 0);
  const bare = customerNews();
  const noUnsub = await deliver(
    ports(bare.t, bare.w, { emailOffers: true }),
    news({ email: frozen(), ownEmail: undefined }),
  );
  assert.deepEqual(
    [noUnsub.outcome, noUnsub.reason],
    ["refused", "outreach_without_unsubscribe"],
    "news without the one-click unsubscribe is refused, as an offer is",
  );
  assert.equal(bare.w.calls.length, 0);
  const open = customerNews();
  assert.equal(
    (await deliver(ports(open.t, open.w, { emailOffers: true }), news())).outcome,
    "sent",
    "and goes once open",
  );
  // A WhatsApp message is the same either way: only email asks what it is about (a yes kept for WhatsApp is all it asks).
  for (const about of ["theirs", "ours"]) {
    const t = tables({ conversations: [thread({ contacts: person({ consent_channels: ["whatsapp"] }) })] });
    const sent = await deliver(ports(t, wireOf()), words({ proactive: true, about }));
    assert.equal(sent.outcome, "sent", `WhatsApp ${about}`);
    const none = tables({ conversations: [thread({ contacts: person({ consent: "unknown" }) })] });
    const held = await deliver(ports(none, wireOf()), words({ proactive: true, about }));
    assert.deepEqual([held.outcome, held.reason], ["refused", "not_opted_in"], `WhatsApp ${about}, no yes`);
  }
});

test("the business's news by email is put on the wire as an offer, which is what picks the campaigns lane (decision D2); their visit's message and a reply keep their own purpose, and so the mail domain", async () => {
  const purposeOnTheWire = async (d) => {
    const { t, w } = offerWorld(addressAlone({ has_relationship: true }));
    const out = await deliver(ports(t, w, { emailOffers: true }), d);
    assert.equal(out.outcome, "sent");
    return w.calls[0].p.purpose;
  };
  assert.equal(await purposeOnTheWire(offered()), "marketing", "an offer");
  assert.equal(await purposeOnTheWire(news()), "marketing", "the business's news, whatever its template's category");
  assert.equal(await purposeOnTheWire(news({ about: "theirs", email: frozen() })), "conversational", "their visit");
  assert.equal(await purposeOnTheWire(news({ proactive: false, email: frozen() })), "conversational", "a reply");
  assert.equal(await purposeOnTheWire(emailed()), "conversational", "a person's reply by email");
});

test("the door reads whether the person has a relationship with the business only where the rule may rest on it, an OFFER by email and the business's own news by email (D1): a reply, a reminder about their visit, a WhatsApp send and a cold email never pay for it", async () => {
  // The conversations select the door makes at the wire, by what it asked for.
  const columnsOf = (p) =>
    p.db.seen.filter((q) => q.table === "conversations" && q.op === "select").map((q) => q.columns);
  const asked = async (d) => {
    const { t, w } = offerWorld(customer());
    const p = ports(t, w, { emailOffers: true });
    await deliver(p, d);
    return columnsOf(p);
  };
  const offer = await asked(offered());
  assert.ok(offer.length >= 1 && offer.every((c) => /\bhas_relationship\b/.test(c)), "an offer by email asks it");
  // The business's own news goes on a relationship as an offer does, so the wire read must have asked for it: unread, the
  // relationship is none, and the news would be refused to everyone the enrolment let in on theirs.
  const ours = await asked(news());
  assert.ok(
    ours.length >= 1 && ours.every((c) => /\bhas_relationship\b/.test(c)),
    "the business's news by email asks it",
  );
  for (const [what, d] of [
    ["a WhatsApp reply", words()],
    ["a WhatsApp offer", words({ purpose: "marketing", proactive: true })],
    ["a text reminder", words({ channel: "sms", purpose: "conversational", proactive: true })],
    ["a reply by email", emailed()],
    ["a reply by email whose thread is about the business's news", emailed({ about: "ours", proactive: false })],
    [
      "a reminder about their visit by email",
      emailed({ purpose: "conversational", sender: "ai", proactive: true, kind: "broadcast", about: "theirs" }),
    ],
    ["the business's news by WhatsApp", words({ purpose: "conversational", proactive: true, about: "ours" })],
  ]) {
    const read = await asked(d);
    assert.ok(read.length >= 1, `${what}: the door read the wire`);
    assert.ok(
      read.every((c) => !/has_relationship/.test(c)),
      `${what}: never asks the relationship (the function reads their messages, calls and deals)`,
    );
    assert.ok(
      read.every((c) => /consent_channels/.test(c)),
      `${what}: and still reads the rest of the person`,
    );
  }
});

/**
 * The broadcast batch (core sendBroadcastBatch) run into the REAL door over a world in memory: one person on email, and the
 * words and the facts their run kept for them. What comes back is what the run wrote on their row, and what the wire was handed.
 */
async function broadcastBatchByEmail({ who, facts, trigger = null }) {
  const t = tables({
    conversations: [thread({ id: "cv-k1", contacts: who })],
    messages: [],
    mailboxes: [{ tenant_id: T, offers_paused_at: null, offers_paused_reason: null }],
  });
  const w = emailWire();
  // The campaigns domain is open here: the business's own news is an offer at the door (decision D2), and a visit's or a
  // proposal's run, which is not, leaves from the mail domain whether it is or not.
  const door = ports(t, w, { emailOffers: true });
  const marks = [];
  const reminder = {
    meta_status: "approved",
    category: "utility",
    body_preview: "Hi {{1}}, a note from Best Movers.",
    components: [
      { type: "HEADER", format: "TEXT", text: "A note, {{1}}" },
      { type: "BODY", text: "Hi {{1}}, a note from Best Movers." },
    ],
  };
  await sendBroadcastBatch(
    {
      broadcast: async () => ({
        id: "b1",
        state: "sending",
        name: "A note · 2026-09-10",
        template_name: "a_note",
        template_language: "en_US",
        params: [{ kind: "first_name" }],
        recipient_count: 1,
        playbook_id: trigger ? "p1" : null,
        // A playbook run's audience as run-playbook writes it, its moment named; a broadcast's names none.
        audience: trigger ? { kind: "playbook", id: "p1", label: "A moment", trigger } : null,
      }),
      workspacePaused: async () => false,
      fail: async () => {},
      startSending: async () => true,
      // The message as the jobs adapter reads it: Meta's row for it and the email version, the one the person is sent.
      message: async (name, language) =>
        ["whatsapp", "email"].map((channel) => ({
          id: `t-${channel}`,
          channel,
          name,
          language,
          variables: [],
          hidden_at: null,
          title: null,
          source: channel === "whatsapp" ? "meta" : "chanlytics",
          rejected_reason: null,
          ...reminder,
          ...(channel === "whatsapp" ? { components: [{ type: "BODY", text: reminder.body_preview }] } : {}),
        })),
      facts: async () => ({ businessName: "Best Movers", bookingLink: null, timezone: "UTC", address: "12 Main St" }),
      batch: async () => [{ contact_id: "k1", facts, channel: "email" }],
      contacts: async (ids) =>
        new Map(
          ids.map((id) => [
            id,
            {
              id,
              phone_e164: null,
              email: ADDRESS,
              email_marketing: who.email_marketing ?? null,
              erased_at: null,
              display_name: "Ana Reyes",
              wa_profile_name: null,
            },
          ]),
        ),
      target: async () => null,
      targetOfContact: async () => ({ conversationId: "cv-k1" }),
      // As the jobs adapter builds it: an offer (and the business's news) leaves on the campaigns domain with the one-click
      // unsubscribe in its headers; anything else from the mailbox on the mail domain.
      emailRequest: async (i) =>
        buildEmailRequest({
          identity: i.offer
            ? campaignsIdentity(OFFER_MAILBOX, "campaigns.example.com", "mail.chanlytics.com")
            : {
                fromName: "Best Movers",
                fromAddress: "bestmovers@mail.chanlytics.com",
                replyTo: "r+abcdefghijklmnopqrstuvwx@mail.chanlytics.com",
              },
          to: i.to,
          parent: null,
          subject: i.subject,
          body: i.body,
          signature: i.offer ? null : i.footer,
          ...(i.offer
            ? { campaign: { unsubscribeUrl: i.offer.unsubscribeUrl, footer: i.footer, footerHtml: i.offer.footerHtml } }
            : {}),
          actor: "human",
          messageId: i.messageId,
          tenantId: T,
        }),
      offersClosed: async () => null,
      offersUnread: async () => null,
      unsubscribeUrl: async () => UNSUB,
      // The row the door sends from, written as the adapter writes it before the send.
      queueEmail: async (row) => {
        t.messages.push(
          queuedEmail({ id: row.id, conversation_id: row.conversationId, contact_id: row.contactId, body: row.body }),
        );
        return { status: "queued" };
      },
      withdrawEmail: async () => {},
      monthSent: async () => 0,
      alreadySent: async () => new Map(),
      byOtherChannels: async () => true,
      mark: async (_id, contactId, patch) => (marks.push([contactId, patch.state, patch.reason ?? null]), true),
      deliver: (d) => deliver(door, d),
      wireUnavailable: async () => null,
      remaining: async () => 0,
      state: async () => "sending",
      tally: async () => ({ sent: 1, held: 0 }),
      heldForEmail: async () => [],
      scheduleNext: async () => {},
      finish: async () => {},
      alert: async () => {},
      sleep: async () => {},
      now: () => NOW,
      random: () => 0,
    },
    { tenantId: T, broadcastId: "b1", deadline: NOW + 60_000 },
  );
  return { marks, wire: w.calls, t };
}

test("a broadcast's email through the real door (decision D1): the run's news is refused not_opted_in to an address alone and goes to a relationship or a yes covering email; a visit's or a follow-up's run goes with no yes", async () => {
  const VISIT = { visit_when: "tomorrow at 2:00 PM", visit_service: "Balayage" };
  const PROPOSAL = { proposal_link: "https://docs.example.com/proposal/1" };
  // The person is claimed before the door (a claim that reads outcome_unknown) and settled after it.
  const sent = [
    ["k1", "failed", OUTCOME_UNKNOWN],
    ["k1", "sent", null],
  ];
  const held = (reason) => [
    ["k1", "failed", OUTCOME_UNKNOWN],
    ["k1", "skipped", reason],
  ];
  const cases = [
    // The business's own news: no visit or proposal kept for them.
    ["news, an address alone", addressAlone(), null, held("not_opted_in")],
    ["news, an empty set of facts", addressAlone(), {}, held("not_opted_in")],
    ["news, a service alone is no visit", addressAlone(), { visit_service: "Balayage" }, held("not_opted_in")],
    ["news, a relationship on record", addressAlone({ has_relationship: true }), null, sent],
    ["news, a yes covering email", addressAlone({ consent: "opted_in", consent_channels: ["email"] }), null, sent],
    ["news, a yes for WhatsApp alone", addressAlone({ consent: "opted_in" }), null, held("not_opted_in")],
    ["news, unsubscribed with a relationship", customer({ email_marketing: "opted_out" }), null, held("unsubscribed")],
    // A visit's or a proposal's run: about something of theirs (the run's moment, as its enrolment read it).
    ["their visit, an address alone", addressAlone(), VISIT, sent, "visit_tomorrow"],
    ["their proposal, an address alone", addressAlone(), PROPOSAL, sent, "proposal_waiting"],
    ["their proposal, no link kept", addressAlone(), null, sent, "proposal_waiting"],
    [
      "their visit, though unsubscribed from email",
      customer({ email_marketing: "opted_out", consent: "unknown", has_relationship: false }),
      VISIT,
      sent,
      "visit_tomorrow",
    ],
    ["their visit, but they said STOP", customer({ consent: "opted_out" }), VISIT, held("opted_out"), "visit_tomorrow"],
    // The moment, not the row, says it: a monthly offer's moment is the business's news though the row kept a visit.
    ["news on a monthly moment, a visit kept", addressAlone(), VISIT, held("not_opted_in"), "everyone_monthly"],
  ];
  for (const [what, who, facts, marks, trigger] of cases) {
    const out = await broadcastBatchByEmail({ who, facts, trigger });
    assert.deepEqual(out.marks, marks, what);
    assert.equal(
      out.wire.length,
      marks === sent ? 1 : 0,
      `${what}: the wire is handed words only when the door lets them go`,
    );
  }
});

test("an offer goes only with the one-click unsubscribe it owes, and never while the workspace's offers are paused; reminders are not held by either", async () => {
  // Built without the unsubscribe: an appointment's request, marked an offer by whoever asked, is refused.
  const bare = offerWorld(customer());
  const out = await deliver(
    ports(bare.t, bare.w, { emailOffers: true }),
    offered({
      email: frozen({
        identity: {
          fromName: "Best Movers",
          fromAddress: "bestmovers@campaigns.example.com",
          replyTo: "r+abcdefghijklmnopqrstuvwx@mail.chanlytics.com",
        },
        parent: null,
        subject: "October",
      }),
    }),
  );
  assert.deepEqual([out.outcome, out.reason], ["refused", "outreach_without_unsubscribe"]);
  // Only one of the two headers is no one click (RFC 8058 wants both).
  const half = offerRequest();
  delete half.headers["List-Unsubscribe-Post"];
  const one = offerWorld(customer());
  assert.equal(
    (await deliver(ports(one.t, one.w, { emailOffers: true }), offered({ email: half }))).reason,
    "outreach_without_unsubscribe",
  );
  // Paused: the mailbox says since when and why; the next offer is held at the wire, the one after that too.
  const paused = offerWorld(customer(), {
    offers_paused_at: "2026-10-01T10:00:00Z",
    offers_paused_reason: "complaints",
  });
  const held = await deliver(ports(paused.t, paused.w, { emailOffers: true }), offered());
  assert.deepEqual([held.outcome, held.reason], ["refused", "email_offers_paused"]);
  assert.equal(paused.w.calls.length, 0);
  // Reminders about their visit and replies by email go on, paused or not.
  const reminder = await deliver(
    ports(paused.t, paused.w, { emailOffers: true }),
    emailed({
      purpose: "conversational",
      sender: "ai",
      proactive: true,
      kind: "broadcast",
      about: "theirs",
      messageId: "m1",
    }),
  );
  assert.equal(reminder.outcome, "sent");
  // Closed outranks paused: the deployment's reason first.
  const closed = offerWorld(customer(), { offers_paused_at: "2026-10-01T10:00:00Z", offers_paused_reason: "bounces" });
  assert.equal((await deliver(ports(closed.t, closed.w), offered())).reason, "email_marketing_disabled");
});

test("a database without 00299 sends no offer by email on a relationship alone, and breaks nothing else: no relationship column, no pause column", async () => {
  // The contact row has no has_relationship and the mailbox no pause columns: the reads fall back, and the door judges what it has.
  const who = customer();
  delete who.has_relationship;
  const t = tables({
    conversations: [thread({ contacts: who })],
    messages: [queuedEmail()],
    mailboxes: [{ tenant_id: T }],
  });
  const w = emailWire();
  const noRelationship = await deliver(ports(t, w, { emailOffers: true }), offered());
  assert.equal(noRelationship.reason, "no_marketing_consent", "fails closed: the fact it cannot read is not a yes");
  // The same database sends the person who asked for offers: nothing about the pause could be read, so it reads as none.
  const asked = tables({
    conversations: [thread({ contacts: { ...who, email_marketing: "opted_in" } })],
    messages: [queuedEmail()],
    mailboxes: [{ tenant_id: T }],
  });
  const out = await deliver(ports(asked, emailWire(), { emailOffers: true }), offered());
  assert.equal(out.outcome, "sent");
  // And a reply or a visit message, which never asked for either, goes as it always did.
  const reply = await deliver(
    ports(tables({ conversations: [thread({ contacts: onEmail() })], messages: [queuedEmail()] }), emailWire()),
    emailed(),
  );
  assert.equal(reply.outcome, "sent");
});

test("the wire keeps each lane's domain: an offer leaves only by the campaigns route, and nothing else leaves by it", async () => {
  const hosted = sendsAs(OFFER_MAILBOX, "mail.chanlytics.com");
  const campaigns = sendsAsCampaigns(OFFER_MAILBOX, "campaigns.example.com", "mail.chanlytics.com");
  assert.equal(campaigns.address, "bestmovers@campaigns.example.com", "the mailbox on the campaigns domain");
  assert.deepEqual(
    campaigns.replyRoutes,
    hosted.replyRoutes,
    "answered where every reply is: the mailbox's token address on the mail domain",
  );
  const sent = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    sent.push({ url: String(url), body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ id: "re_9" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  try {
    const send = emailSender([
      { lane: "hosted", cfg: { apiKey: "k" }, as: hosted },
      { lane: "campaigns", cfg: { apiKey: "k" }, as: campaigns },
    ]);
    const offer = offerRequest();
    assert.equal((await send(ADDRESS, { body: "hi", email: offer, purpose: "marketing" })).ok, true);
    assert.match(sent[0].body.from, /<bestmovers@campaigns\.example\.com>$/);
    assert.deepEqual(sent[0].body.reply_to, ["r+abcdefghijklmnopqrstuvwx@mail.chanlytics.com"]);
    assert.equal(sent[0].body.headers["List-Unsubscribe"], `<${UNSUB}>`);
    assert.equal(sent[0].body.headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
    // An offer never leaves as the mailbox on the reply domain, whatever its request says...
    const asHosted = frozen({ parent: null, subject: "October" });
    assert.equal(
      (await send(ADDRESS, { body: "hi", email: asHosted, purpose: "marketing" })).errorBody,
      "request_leaves_as_another_sender",
    );
    // ...and nothing but an offer leaves from the campaigns domain.
    for (const purpose of ["conversational", "outreach", undefined])
      assert.equal(
        (await send(ADDRESS, { body: "hi", email: offer, purpose })).errorBody,
        "request_leaves_as_another_sender",
        String(purpose),
      );
    // With no campaigns route bound (a deployment without the domain), an offer has nowhere to leave from.
    const only = emailSender([{ lane: "hosted", cfg: { apiKey: "k" }, as: hosted }]);
    assert.equal(
      (await only(ADDRESS, { body: "hi", email: offer, purpose: "marketing" })).errorBody,
      "request_leaves_as_another_sender",
    );
    assert.equal(sent.length, 1, "only the one offer reached the provider");
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("a person's own start goes under the pause their own message took, and still asks the yes a start asks", async () => {
  // The reply verb claims the thread a moment before the job runs: a start named a reply is not held by that claim.
  const paused = { paused_until: new Date(NOW + 60_000).toISOString() };
  const yes = tables({ conversations: [thread({ ...paused, contacts: person({ consent: "opted_in" }) })] });
  const w = wireOf();
  const sent = await deliver(ports(yes, w), words({ sender: "human", proactive: true, kind: "reply" }));
  assert.equal(sent.outcome, "sent");
  assert.equal(w.calls.length, 1);
  // No yes on record: the same send is refused, by the person's own answer and not by the pause.
  const none = tables({ conversations: [thread({ ...paused, contacts: person({ consent: "unknown" }) })] });
  const w2 = wireOf();
  const refused = await deliver(ports(none, w2), words({ sender: "human", proactive: true, kind: "reply" }));
  assert.equal(refused.outcome, "refused");
  assert.equal(refused.reason, "not_opted_in");
  assert.equal(w2.calls.length, 0);
});

test("a person's own first email is refused at the door for someone who unsubscribed; a reply to them is not", async () => {
  const unsubscribed = () =>
    tables({
      conversations: [thread({ contacts: onEmail({ email_marketing: "opted_out" }) })],
      messages: [queuedEmail()],
    });
  // A start: proactive, and named a reply so the pause its own message took does not hold it (messages/send.ts).
  const w = emailWire();
  const start = await deliver(ports(unsubscribed(), w), emailed({ proactive: true, kind: "reply" }));
  assert.deepEqual([start.outcome, start.reason, w.calls.length], ["refused", "unsubscribed", 0]);
  // A reply: they wrote, and are answered.
  const w2 = emailWire();
  const reply = await deliver(ports(unsubscribed(), w2), emailed());
  assert.deepEqual([reply.outcome, w2.calls.length], ["sent", 1]);
});
