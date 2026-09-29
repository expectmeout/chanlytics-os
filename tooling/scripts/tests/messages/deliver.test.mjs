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
import { isWaitRefusal } from "@chanlytics/contracts";

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
const tables = (over = {}) => ({ conversations: [thread()], messages: [], events: [], ...over });

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

const { emailSender } = await import(pathToFileURL(path.join(ROOT, "packages/core/dist/index.js")).href);
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

test("email's three refusals, each a fact about the person or the product, asked before consent and before the wire", async () => {
  const cases = [
    [{ purpose: "marketing" }, onEmail({ marketing_consent: "opted_in" }), "email_marketing_disabled"],
    // An email unsubscribe holds an offer by email too. Today every offer by email is refused before it is asked; the
    // release that lets offers go by email makes this one `unsubscribed` (the campaigns spec's Email row), never sent.
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
