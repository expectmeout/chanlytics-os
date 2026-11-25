/**
 * The one send door: words that may go go and are recorded, a pause or a hold stops the machine and never the person,
 * a cancel that wins after the words left, what a send came to on every wire, the carrier's STOP, and which yes a
 * template needs.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeDb } from "../../_fake-db.mjs";
import { importBundle } from "../../_source.mjs";
import {
  ADDRESS,
  NOW,
  T,
  deliver,
  deliverSafely,
  emailSender,
  emailWire,
  emailed,
  frozen,
  getTemplatePurpose,
  isNotTakenError,
  isWireUnavailable,
  isWireUnavailableError,
  kinds,
  onEmail,
  person,
  ports,
  queuedEmail,
  sendsAs,
  tables,
  thread,
  whatsappSender,
  whatsappWire,
  wireOf,
  wireUnavailable,
  words,
} from "./_deliver.mjs";

test("words that may go, go: the wire is handed them, a row records them, the thread is stamped, the event says who spoke", async () => {
  const t = tables();
  const w = wireOf();
  const out = await deliver(ports(t, w), words({ meta: { source: "test" } }));
  assert.equal(out.outcome, "sent");
  assert.equal(out.externalId, "wamid.1");
  // With the thread they are for: a wire that holds two numbers reads by it which one the person wrote to.
  assert.deepEqual(w.calls, [
    { to: "+13475550101", p: { body: "See you at 3", template: undefined, conversationId: "c1" } },
  ]);
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

test("a call's own hold does not refuse what that call sends: the link the phone receptionist texts the caller mid-call goes, while a person's hold and another call's still refuse it", async () => {
  // The inbound door takes the caller's thread for the call (00132), and the call's tool then texts the booking link
  // into that same thread. Held against itself, the link was refused as "human_has_it" and the agent told the caller a
  // person was on it, with no person and no escalation anywhere.
  const until = new Date(NOW + 600_000).toISOString();
  const byCall = (ref) => thread({ control_kind: "call", control_ref: ref, control_until: until });
  const byPerson = () => thread({ control_kind: "person", control_by: "u1", control_until: until });
  const onTheCall = (over = {}) =>
    words({ sender: "ai", onCall: "call_this", meta: { call_id: "call_this" }, ...over });
  const send = async (conversation, d) => {
    const w = wireOf();
    const out = await deliver(ports(tables({ conversations: [conversation] }), w), d);
    return [out.outcome, out.outcome === "refused" ? out.reason : null, w.calls.length];
  };
  assert.deepEqual(await send(byCall("call_this"), onTheCall()), ["sent", null, 1], "the call's own hold: it goes");
  assert.deepEqual(
    await send(byCall("call_other"), onTheCall()),
    ["refused", "human_has_it", 0],
    "another call's hold holds it",
  );
  assert.deepEqual(await send(byPerson(), onTheCall()), ["refused", "human_has_it", 0], "a person's hold holds it");
  assert.deepEqual(
    await send(byCall("call_this"), words({ sender: "ai" })),
    ["refused", "human_has_it", 0],
    "a send that names no call is held by the call: the text receptionist does not talk over it",
  );
  assert.deepEqual(
    await send(byCall("call_this"), onTheCall({ onCall: null })),
    ["refused", "human_has_it", 0],
    "nor does a send whose call has no id",
  );
  // The hold is passed, never the pause: a thread a person paused still holds what the call sends.
  const pausedToo = thread({
    control_kind: "call",
    control_ref: "call_this",
    control_until: until,
    paused_until: until,
  });
  assert.deepEqual(await send(pausedToo, onTheCall()), ["refused", "human_has_it", 0], "the pause still holds");
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
  const { recordOutbound } = await importBundle("db");
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
  assert.equal(await getTemplatePurpose(fakeDb(t), T, undefined), "conversational");
  assert.equal(await getTemplatePurpose(fakeDb(t), T, { name: "visit_reminder", language: "en_US" }), "conversational");
  assert.equal(await getTemplatePurpose(fakeDb(t), T, { name: "month_offer", language: "en_US" }), "marketing");
  assert.equal(
    await getTemplatePurpose(fakeDb(t), T, { name: "seeded_by_hand", language: "en_US" }),
    "marketing",
    "unknown to us is marketing until Meta says otherwise",
  );
  await assert.rejects(
    getTemplatePurpose(fakeDb(t, { "templates.select": { message: "reset" } }), T, {
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
  // A text is handed none: its wire is one try under the provider's own timeout, which a ceiling cannot shorten, so it is
  // the batch that starts one only while that timeout still ends inside the tick (jobs ledger startByAt,
  // broadcast-by-channel.test.mjs). Only the email wire's send is bounded by what is left.
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
