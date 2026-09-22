/**
 * The reply, run: every branch of the operator's reply through fakes that log
 * their calls, so what is proved is the order and the outcome, not the
 * route's text.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { importSrc } from "./_source.mjs";

const { replyToConversation, IDEMPOTENCY_WINDOW_MS, SEND_GRACE_MS } = await importSrc(
  "packages/core/src/conversations/reply.ts",
);
const NOW = Date.parse("2026-09-11T12:00:00Z");
const HOUR = 3_600_000;
const iso = (ms) => new Date(ms).toISOString();
const conv = (over = {}) => ({
  id: "c1",
  tenant_id: "t1",
  phone_e164: "+15550000001",
  contact_id: "k1",
  last_wa_inbound_at: iso(NOW - HOUR),
  consent: "opted_in",
  dnc: false,
  marketing_consent: null,
  ...over,
});
const approved = {
  name: "reservar_ahora",
  language: "en_US",
  body_preview: "Book with {{1}}: {{2}}",
  meta_status: "approved",
  category: "utility",
};
const READS = new Set(["pauseMs", "replyChannel", "priorReceipt", "template", "templateFacts", "hash", "now"]);

/** Every port answers a value (or a function of its arguments); the writes log their call as [name, ...args]. */
function fakes(over = {}) {
  const log = [];
  const answers = {
    pauseMs: 2 * HOUR,
    now: () => NOW,
    replyChannel: "whatsapp",
    priorReceipt: null,
    template: approved,
    templateFacts: { business_name: "Melany's", booking_link: "https://book.example/m" },
    hash: (s) => `h(${s})`,
    claimForReply: true,
    takeControl: undefined,
    withdrawDrafts: 1,
    queue: "m1",
    schedule: undefined,
    cancelOrphan: undefined,
    record: "d1",
    resolveEscalation: undefined,
    storeReceipt: undefined,
    ...over,
  };
  const ports = {};
  for (const [name, answer] of Object.entries(answers)) {
    if (name === "now" || name === "hash") {
      ports[name] = answer;
      continue;
    }
    ports[name] = async (...args) => {
      if (!READS.has(name)) log.push([name, ...args]);
      return typeof answer === "function" ? answer(...args) : answer;
    };
  }
  // By NAME, never by position: these assertions used to index the log, so
  // adding one step to the order re-numbered a dozen of them in files that had
  // nothing to do with the change.
  const call = (name) => log.find((l) => l[0] === name);
  return { ports, log, call, ops: () => log.map((l) => l[0]) };
}
const cmd = (over = {}) => ({
  conv: conv(),
  userId: "u1",
  body: { text: "On our way." },
  idempotencyKey: null,
  ...over,
});
const refused = async (p, code, words) => assert.rejects(p, (e) => e.code === code && words.test(e.message));

test("a person who opted out is refused before anything is paused or queued; so is a thread with no phone", async () => {
  const { ports, call, ops } = fakes();
  await refused(replyToConversation(ports, cmd({ conv: conv({ consent: "opted_out" }) })), "conflict", /opt/i);
  assert.deepEqual(ops(), []);
  const bare = fakes();
  await refused(replyToConversation(bare.ports, cmd({ conv: conv({ phone_e164: null }) })), "conflict", /phone/);
  assert.deepEqual(bare.ops(), []);
});

test("inside the window: the words go as they are; the thread is paused and claimed BEFORE any row a job could send exists; the draft is withdrawn; the receipt says so", async () => {
  const { ports, log, call, ops } = fakes();
  const r = await replyToConversation(ports, cmd());
  // takeControl sits between the claim and the withdrawal: the wire asks who is
  // speaking now (00130), and a draft written in the same second still reaches it.
  assert.deepEqual(ops(), [
    "claimForReply",
    "takeControl",
    "withdrawDrafts",
    "queue",
    "schedule",
    "record",
    "resolveEscalation",
  ]);
  // The claim IS the pause: one statement, and the row it writes is the one
  // the receptionist reads. It used to be preceded by a mirror into a second
  // store, keyed by the number, with a release to undo it.
  assert.deepEqual(call("claimForReply")[2], new Date(NOW + 2 * HOUR).toISOString());
  assert.deepEqual(call("claimForReply"), ["claimForReply", "c1", iso(NOW + 2 * HOUR), "u1", iso(NOW)]);
  assert.equal(call("queue")[1].body, "On our way.");
  assert.equal(call("queue")[1].type, "text");
  assert.equal(call("queue")[1].sent_by, "u1");
  assert.equal(call("queue")[1].channel, "whatsapp");
  assert.equal(call("schedule")[2].toISOString(), iso(NOW + SEND_GRACE_MS));
  assert.deepEqual(call("schedule")[3], {
    message_id: "m1",
    conversation_id: "c1",
    to_phone: "+15550000001",
    body: "On our way.",
  });
  assert.deepEqual(call("record"), [
    "record",
    "t1",
    "conversation",
    "c1",
    "reply",
    { message_id: "m1", window_open: true, template: null },
  ]);
  assert.deepEqual(call("resolveEscalation"), ["resolveEscalation", "c1", "d1"]);
  assert.deepEqual(r, {
    message_id: "m1",
    status: "queued",
    cancelable_until: iso(NOW + SEND_GRACE_MS),
    window_open: true,
    withdrawn_drafts: 1,
    decision_id: "d1",
  });
});

test("inside the window, empty text is refused; a reply longer than its wire takes is refused in that wire's words; all before anything is touched", async () => {
  const empty = fakes();
  await refused(replyToConversation(empty.ports, cmd({ body: { text: "  " } })), "validation", /required/);
  assert.deepEqual(empty.ops(), []);
  const wa = fakes();
  await refused(
    replyToConversation(wa.ports, cmd({ body: { text: "x".repeat(4097) } })),
    "validation",
    /WhatsApp refuses a message over 4096/,
  );
  assert.deepEqual(
    wa.ops(),
    [],
    "REGRESSION guard: one over the limit was once stored, reported queued, and failed fifteen seconds later",
  );
  const sms = fakes({ replyChannel: "sms" });
  await refused(replyToConversation(sms.ports, cmd({ body: { text: "x".repeat(1601) } })), "validation", /1600/);
  assert.deepEqual(sms.ops(), []);
  const fine = fakes({ replyChannel: "sms" });
  const r = await replyToConversation(fine.ports, cmd({ body: { text: "x".repeat(1600) } }));
  assert.equal(fine.call("queue")[1].channel, "sms");
  assert.equal(r.status, "queued");
});

test("outside the window: only an approved template goes, a promotion needs a yes to offers, and the params are the workspace's facts, never the client's", async () => {
  const closed = conv({ last_wa_inbound_at: iso(NOW - 25 * HOUR) });
  const noTemplate = fakes();
  await refused(replyToConversation(noTemplate.ports, cmd({ conv: closed })), "window_closed", /24-hour/);
  assert.deepEqual(noTemplate.ops(), []);
  const pending = fakes({ template: { ...approved, meta_status: "pending" } });
  await refused(
    replyToConversation(
      pending.ports,
      cmd({ conv: closed, body: { template: { name: "reservar_ahora", language: "en_US" } } }),
    ),
    "validation",
    /not approved/,
  );
  const promo = fakes({ template: { ...approved, category: "marketing" } });
  await refused(
    replyToConversation(
      promo.ports,
      cmd({ conv: closed, body: { template: { name: "reservar_ahora", language: "en_US" } } }),
    ),
    "forbidden",
    /offers/,
  );
  const yes = fakes({ template: { ...approved, category: "marketing" } });
  assert.equal(
    (
      await replyToConversation(
        yes.ports,
        cmd({
          conv: { ...closed, marketing_consent: "opted_in" },
          body: { template: { name: "reservar_ahora", language: "en_US" } },
        }),
      )
    ).status,
    "queued",
    "a yes to offers lets the promotion through",
  );
  const { ports, log, call } = fakes();
  const r = await replyToConversation(
    ports,
    cmd({
      conv: closed,
      body: { template: { name: "reservar_ahora", language: "en_US", params: ["client", "params"] } },
    }),
  );
  assert.equal(
    call("queue")[1].body,
    "Book with Melany's: book.example/m",
    "the workspace's facts, the scheme stripped, over the client's",
  );
  assert.equal(call("queue")[1].type, "template");
  assert.deepEqual(call("schedule")[3].template, {
    name: "reservar_ahora",
    language: "en_US",
    params: ["Melany's", "book.example/m"],
  });
  assert.deepEqual(call("record")[5], { message_id: "m1", window_open: false, template: "reservar_ahora" });
  assert.equal(r.window_open, false);
  const bare = fakes({ templateFacts: null });
  await refused(
    replyToConversation(
      bare.ports,
      cmd({ conv: closed, body: { template: { name: "reservar_ahora", language: "en_US", params: ["A", "B"] } } }),
    ),
    "validation",
    /no template facts/,
  );
  assert.deepEqual(
    bare.ops(),
    [],
    "the client's params are never a fallback: the browser does not choose the link that lands on a phone",
  );
  const typed = fakes({
    template: {
      ...approved,
      variables: [
        { label: "Business name", position: 1 },
        { label: "Offer", position: 2 },
      ],
    },
  });
  await refused(
    replyToConversation(
      typed.ports,
      cmd({ conv: closed, body: { template: { name: "reservar_ahora", language: "en_US" } } }),
    ),
    "validation",
    /needs words for “Offer”/,
  );
  assert.deepEqual(
    typed.ops(),
    [],
    "a template with words to write is refused here, not by Meta fifteen seconds after 'queued'",
  );
  const two = fakes({
    template: {
      ...approved,
      variables: [
        { label: "Business name", position: 1 },
        { label: "Booking link", position: 2 },
      ],
    },
  });
  assert.equal(
    (
      await replyToConversation(
        two.ports,
        cmd({ conv: closed, body: { template: { name: "reservar_ahora", language: "en_US" } } }),
      )
    ).status,
    "queued",
  );
  const none = fakes({ templateFacts: null });
  await refused(
    replyToConversation(
      none.ports,
      cmd({ conv: closed, body: { template: { name: "reservar_ahora", language: "en_US" } } }),
    ),
    "validation",
    /no template facts/,
  );
  assert.deepEqual(none.ops(), []);
});

test("REGRESSION (I6): a template is filled by its own slots, as broadcasts and the assistant fill them -- the workspace's starters open with the customer's first name; one with words to write is refused in its own label", async () => {
  const closed = conv({ last_wa_inbound_at: iso(NOW - 30 * HOUR), display_name: "Rosa Díaz", wa_profile_name: null });
  // The shape the salon's starters have on the row: "Value n" labels, the examples Meta read.
  const welcome = {
    name: "welcome_new",
    language: "en_US",
    body_preview: "Hi {{1}}, welcome to {{2}}! Book whenever you're ready: {{3}}",
    meta_status: "approved",
    category: "utility",
    variables: [
      { label: "Value 1", example: "Dani", position: 1 },
      { label: "Value 2", example: "Luna Studio", position: 2 },
      { label: "Value 3", example: "https://booksy.com/luna-studio", position: 3 },
    ],
  };
  const { ports, log, call } = fakes({ template: welcome });
  const r = await replyToConversation(
    ports,
    cmd({ conv: closed, body: { template: { name: "welcome_new", language: "en_US" } } }),
  );
  assert.equal(
    r.status,
    "queued",
    "REGRESSION: 'This template takes 3 values; the Inbox fills two' turned away the workspace's own starter",
  );
  assert.deepEqual(
    log.find((l) => l[0] === "schedule")[3].template.params,
    ["Rosa", "Melany's", "book.example/m"],
    "the first name, the business, the link: the starter's own slots",
  );
  assert.equal(
    log.find((l) => l[0] === "queue")[1].body,
    "Hi Rosa, welcome to Melany's! Book whenever you're ready: book.example/m",
  );

  const nameless = fakes({ template: welcome });
  await replyToConversation(
    nameless.ports,
    cmd({
      conv: { ...closed, display_name: null, wa_profile_name: null },
      body: { template: { name: "welcome_new", language: "en_US" } },
    }),
  );
  assert.equal(
    nameless.log.find((l) => l[0] === "schedule")[3].template.params[0],
    "there",
    "no name on file reads 'Hi there', as a broadcast does",
  );

  const note = {
    ...welcome,
    name: "quick_note",
    body_preview: "Hi {{1}}, a quick note from {{2}}: {{3}}",
    variables: [
      welcome.variables[0],
      welcome.variables[1],
      { label: "Value 3", example: "we're open late on Thursdays this month.", position: 3 },
    ],
  };
  const q = fakes({ template: note });
  await refused(
    replyToConversation(q.ports, cmd({ conv: closed, body: { template: { name: "quick_note", language: "en_US" } } })),
    "validation",
    /needs words for “The note”, which the Inbox does not ask for/,
  );
  assert.deepEqual(q.ops(), [], "nothing is queued for a template the Inbox cannot fill");

  const hello = fakes({
    template: {
      name: "hello_world",
      language: "en_US",
      body_preview: "Hello World",
      meta_status: "approved",
      category: "utility",
      variables: [],
    },
  });
  assert.equal(
    (
      await replyToConversation(
        hello.ports,
        cmd({ conv: closed, body: { template: { name: "hello_world", language: "en_US" } } }),
      )
    ).status,
    "queued",
    "REGRESSION: a template with nothing to fill read 'takes 0 values'",
  );
  assert.deepEqual(hello.log.find((l) => l[0] === "schedule")[3].template.params, []);
});

test("a claim that changed no row releases the pause it mirrored and is a 409; nothing was queued", async () => {
  const { ports, log, call, ops } = fakes({ claimForReply: false });
  await refused(replyToConversation(ports, cmd()), "conflict", /nothing was sent/);
  assert.deepEqual(ops(), ["claimForReply"], "nothing ran before it, so there is nothing to undo after it");
});

test("a job that could not be scheduled cancels the row it would have sent, and the error is the caller's", async () => {
  const { ports, log, call, ops } = fakes({
    schedule: () => {
      throw new Error("queue down");
    },
  });
  await assert.rejects(replyToConversation(ports, cmd()), /queue down/);
  assert.deepEqual(ops(), ["claimForReply", "takeControl", "withdrawDrafts", "queue", "schedule", "cancelOrphan"]);
  assert.deepEqual(log.at(-1), ["cancelOrphan", "m1"]);
});

test("a replay: the same key and intent inside the window returns the stored receipt and sends nothing; after the window, or for a different intent, it sends and the receipt is stored under the caller's key", async () => {
  const stored = {
    message_id: "m0",
    status: "queued",
    cancelable_until: iso(NOW),
    window_open: true,
    withdrawn_drafts: 0,
  };
  const key = "u1:k1";
  const intent = 'h({"text":"On our way."})';
  const fresh = fakes({
    priorReceipt: (t, k) =>
      k === key ? { response: stored, created_at: iso(NOW - 5_000), request_hash: intent } : null,
  });
  assert.deepEqual(await replyToConversation(fresh.ports, cmd({ idempotencyKey: "k1" })), stored);
  assert.deepEqual(fresh.ops(), []);
  const old = fakes({
    priorReceipt: { response: stored, created_at: iso(NOW - IDEMPOTENCY_WINDOW_MS - 1), request_hash: intent },
  });
  assert.equal(
    (await replyToConversation(old.ports, cmd({ idempotencyKey: "k1" }))).message_id,
    "m1",
    "an old receipt does not answer",
  );
  const other = fakes({ priorReceipt: { response: stored, created_at: iso(NOW - 5_000), request_hash: "h(other)" } });
  assert.equal(
    (await replyToConversation(other.ports, cmd({ idempotencyKey: "k1" }))).message_id,
    "m1",
    "a different intent under the same key goes through",
  );
  assert.deepEqual(other.log.at(-1), [
    "storeReceipt",
    "t1",
    key,
    intent,
    {
      message_id: "m1",
      status: "queued",
      cancelable_until: iso(NOW + SEND_GRACE_MS),
      window_open: true,
      withdrawn_drafts: 1,
      decision_id: "d1",
    },
  ]);
  // The receipt is kept the moment the send is certain: a ledger that fails
  // after the job exists still leaves a retry under the same key something
  // to find, or the customer receives the words twice.
  const ledgerDown = fakes({
    record: () => {
      throw new Error("decisions down");
    },
  });
  await assert.rejects(replyToConversation(ledgerDown.ports, cmd({ idempotencyKey: "k1" })), /decisions down/);
  assert.deepEqual(ledgerDown.ops(), [
    "claimForReply",
    "takeControl",
    "withdrawDrafts",
    "queue",
    "schedule",
    "storeReceipt",
    "record",
  ]);
  assert.deepEqual(ledgerDown.call("storeReceipt"), [
    "storeReceipt",
    "t1",
    key,
    intent,
    {
      message_id: "m1",
      status: "queued",
      cancelable_until: iso(NOW + SEND_GRACE_MS),
      window_open: true,
      withdrawn_drafts: 1,
    },
  ]);
  const noKey = fakes();
  await replyToConversation(noKey.ports, cmd());
  assert.ok(!noKey.ops().includes("storeReceipt"), "no key, nothing stored");
});

/* ------------------------------------------------------------------ email
 * A reply by email: where it goes is the address on the person's page, what it
 * leaves as is frozen before anything is claimed, and its row is born with both.
 */
const ADDRESS = "ana@example.com";
const PARENT = {
  messageId: "m0",
  from: "Ana@Example.com",
  rfcMessageId: "<q1@customer.example>",
  references: ["<q0@customer.example>"],
  subject: "Quote for Saturday",
};
const FROZEN = {
  request: { to: [ADDRESS], subject: "Re: Quote for Saturday", idempotency_key: "id-1" },
  subject: "Re: Quote for Saturday",
};
const byEmail = (over = {}) =>
  conv({ phone_e164: null, last_wa_inbound_at: null, email: ADDRESS, email_suppressed_at: null, ...over });
/** The flat fakes, plus email's port group logged the same way. */
function emailFakes(over = {}, email = {}) {
  const f = fakes({ replyChannel: "email", ...over });
  const answers = { parent: PARENT, freeze: FROZEN, ...email };
  f.ports.email = { newId: () => "id-1" };
  for (const [name, answer] of Object.entries(answers)) {
    f.ports.email[name] = async (...args) => {
      f.log.push([`email.${name}`, ...args]);
      return typeof answer === "function" ? answer(...args) : answer;
    };
  }
  return f;
}

test("a reply by email goes to the address on the person's page; its request is frozen before the thread is claimed, and the row is born with its id and that request", async () => {
  const { ports, log, call, ops } = emailFakes({ queue: (row) => row.id });
  const r = await replyToConversation(ports, cmd({ conv: byEmail(), body: { text: "We can do Saturday at 9." } }));
  assert.deepEqual(
    ops(),
    [
      "email.parent",
      "email.freeze",
      "claimForReply",
      "takeControl",
      "withdrawDrafts",
      "queue",
      "schedule",
      "record",
      "resolveEscalation",
    ],
    "no mirror to pause: this person has no number",
  );
  assert.deepEqual(call("email.freeze"), [
    "email.freeze",
    { tenantId: "t1", messageId: "id-1", to: ADDRESS, parent: PARENT, body: "We can do Saturday at 9." },
  ]);
  const row = call("queue")[1];
  assert.deepEqual([row.id, row.channel, row.type, row.body], ["id-1", "email", "text", "We can do Saturday at 9."]);
  assert.deepEqual(row.meta, {
    email: {
      subject: "Re: Quote for Saturday",
      to: [ADDRESS],
      parent_id: "m0",
      in_reply_to: "<q1@customer.example>",
      request: FROZEN.request,
    },
  });
  assert.deepEqual(
    call("schedule")[3],
    { message_id: "id-1", conversation_id: "c1", to_email: ADDRESS, body: "We can do Saturday at 9." },
    "an address never travels as to_phone",
  );
  assert.equal(r.window_open, true, "email has no window");

  const both = emailFakes();
  await replyToConversation(both.ports, cmd({ conv: byEmail({ phone_e164: "+15550000001" }) }));
  assert.deepEqual(
    both.ops().slice(0, 3),
    ["email.parent", "email.freeze", "claimForReply"],
    "the reply is frozen before the thread is claimed, whether or not the person also has a number",
  );
});

test("an email reply that cannot go is refused in words before anything is touched: no address, a stopped address, no email to answer, no mailbox, too long", async () => {
  const none = emailFakes();
  await refused(
    replyToConversation(none.ports, cmd({ conv: byEmail({ email: null }) })),
    "conflict",
    /no email address on their page/,
  );
  const stopped = emailFakes();
  await refused(
    replyToConversation(stopped.ports, cmd({ conv: byEmail({ email_suppressed_at: iso(NOW) }) })),
    "conflict",
    /has stopped/,
  );
  const orphan = emailFakes({}, { parent: null });
  await refused(replyToConversation(orphan.ports, cmd({ conv: byEmail() })), "conflict", /no email from this person/);
  const unset = emailFakes({}, { freeze: null });
  await refused(
    replyToConversation(unset.ports, cmd({ conv: byEmail() })),
    "conflict",
    /no email address to send from/,
  );
  const long = emailFakes();
  await refused(
    replyToConversation(long.ports, cmd({ conv: byEmail(), body: { text: "x".repeat(20001) } })),
    "validation",
    /20,000/,
  );
  for (const f of [none, stopped, orphan, unset, long])
    assert.deepEqual(
      f.ops().filter((o) => !o.startsWith("email.")),
      [],
      "nothing claimed, queued or scheduled",
    );
  // It never crosses wires: a person with a number and no address is not texted instead.
  const crossed = emailFakes();
  await refused(
    replyToConversation(crossed.ports, cmd({ conv: byEmail({ email: null, phone_e164: "+15550000001" }) })),
    "conflict",
    /no email address/,
  );
  assert.deepEqual(crossed.ops(), []);
});

test("when the address on their page is not the one they wrote from, the operator is told where the reply will go and agrees by value; nothing is sent until they do", async () => {
  const elsewhere = { ...PARENT, from: "ana.personal@example.com" };
  const asked = emailFakes({}, { parent: elsewhere });
  await assert.rejects(
    replyToConversation(asked.ports, cmd({ conv: byEmail() })),
    (e) =>
      e.code === "conflict" &&
      e.status === 409 &&
      e.details?.confirm_email_to === ADDRESS &&
      /came from ana\.personal@example\.com/.test(e.message) &&
      /will go to ana@example\.com/.test(e.message),
  );
  assert.deepEqual(asked.ops(), ["email.parent"]);

  const stale = emailFakes({}, { parent: elsewhere });
  await assert.rejects(
    replyToConversation(stale.ports, cmd({ conv: byEmail(), body: { text: "Hi", email_to: "old@example.com" } })),
    (e) => e.details?.confirm_email_to === ADDRESS,
    "agreeing to an address that is no longer theirs is asked again",
  );

  const agreed = emailFakes({}, { parent: elsewhere });
  const r = await replyToConversation(agreed.ports, cmd({ conv: byEmail(), body: { text: "Hi", email_to: ADDRESS } }));
  assert.equal(r.status, "queued");
  assert.equal(
    agreed.log.find((l) => l[0] === "email.freeze")[1].to,
    ADDRESS,
    "to the page's address, never the header's",
  );
});
