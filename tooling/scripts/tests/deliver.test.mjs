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
import { fakeDb } from "./_fake-db.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const { deliver, deliverSafely, templatePurpose, whatsappSender } = await import(
  pathToFileURL(path.join(ROOT, "packages/core/dist/index.js")).href
);

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
const ports = (t, w, over = {}) => ({ db: fakeDb(t), wire: w.wire, now: () => NOW, ...over });
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
  const send = emailSender([{ cfg: { apiKey: "test-key" }, as: AS }]);
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

    assert.deepEqual(await send(ADDRESS, { body: "hi", email: frozen() }), { ok: true, wamid: "re_9", status: 200 });
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
const coldWorld = ({ who = {}, leads, domains } = {}) =>
  tables({
    conversations: [thread({ contact_id: "k1", contacts: onEmail({ email: OWNER, consent: "unknown", ...who }) })],
    messages: [queuedEmail({ sender: "ai" })],
    leads: leads ?? [{ id: "l1", tenant_id: T, contact_id: "k1" }],
    sending_domains: domains ?? [{ tenant_id: T, host: "getharbor.com", state: "verified" }],
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
      { who: { email_marketing: "opted_out" }, domains: [{ tenant_id: T, host: "getharbor.com", state: "held" }] },
      {},
    ],
    ["opted_out", { who: { dnc: true } }, {}],
    ["outreach_not_a_lead", { leads: [{ id: "l1", tenant_id: T, contact_id: "someone-else" }] }, {}],
    ["outreach_not_a_lead", { leads: [{ id: "l1", tenant_id: "another-workspace", contact_id: "k1" }] }, {}],
    ["outreach_without_unsubscribe", {}, { email: coldRequest({ campaign: undefined }) }],
    ["outreach_needs_own_domain", {}, { email: coldRequest({ identity: hosted }) }],
    [
      "outreach_needs_own_domain",
      { domains: [{ tenant_id: "another-workspace", host: "getharbor.com", state: "verified" }] },
      {},
    ],
    ["sending_domain_not_ready", { domains: [{ tenant_id: T, host: "getharbor.com", state: "records" }] }, {}],
    ["sending_domain_not_ready", { domains: [{ tenant_id: T, host: "getharbor.com", state: "held" }] }, {}],
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
  assert.equal(t.messages[0].status, "sent");

  const r = tables({ conversations: [thread({ contact_id: "k1", contacts: onEmail() })], messages: [queuedEmail()] });
  const db = fakeDb(r);
  const replied = await deliver({ db, wire: emailWire().wire, now: () => NOW }, emailed());
  assert.equal(replied.outcome, "sent");
  assert.deepEqual(
    db.seen.filter((s) => s.table === "leads" || s.table === "sending_domains"),
    [],
    "a conversational send pays for no outreach read",
  );
});

test("a read of outreach's facts that fails is not a yes: the door throws and the row is left for the retry", async () => {
  for (const fault of ["leads.select", "sending_domains.select"]) {
    const t = coldWorld();
    const w = emailWire();
    await assert.rejects(
      deliver(
        { db: fakeDb(t, { [fault]: { message: "the database went away" } }), wire: w.wire, now: () => NOW },
        cold(),
      ),
      /cannot read the/,
      fault,
    );
    assert.equal(w.calls.length, 0);
    assert.equal(t.messages[0].status, "queued", `${fault}: left for the retry`);
  }
});

test("email's wire picks its route by the request's From: the hosted mailbox on the platform's key, an own domain on the cold key, and nothing else", async () => {
  const hosted = { cfg: { apiKey: "platform-key" }, as: sendsAs(MAILBOX, "mail.chanlytics.com") };
  const own = { cfg: { apiKey: "cold-key" }, as: sendsAsOwnDomain(OWN, MAILBOX, "mail.chanlytics.com") };
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
    assert.equal((await send(OWNER, { body: "x", email: coldRequest() })).ok, true);
    assert.equal((await send(ADDRESS, { body: "x", email: frozen() })).ok, true);
    assert.deepEqual(keys, ["Bearer cold-key", "Bearer platform-key"], "each leaves on its own account");
    // A domain this workspace has no route for (not verified, or somebody else's) is not sent from.
    const elsewhere = coldRequest({
      identity: ownDomainIdentity({ ...OWN, host: "other.example" }, MAILBOX, "mail.chanlytics.com"),
    });
    assert.deepEqual(await send(OWNER, { body: "x", email: elsewhere }), refused);
    // The chosen route's own Reply-To rule still holds: an answer must come back to this mailbox.
    const strayReply = coldRequest({
      identity: {
        ...ownDomainIdentity(OWN, MAILBOX, "mail.chanlytics.com"),
        replyTo: "r+aaaaaaaaaaaaaaaaaaaaaaaa@mail.chanlytics.com",
      },
    });
    assert.deepEqual(await send(OWNER, { body: "x", email: strayReply }), refused);
    assert.equal(keys.length, 2, "neither refusal reached a provider");
  } finally {
    globalThis.fetch = real;
  }
});
