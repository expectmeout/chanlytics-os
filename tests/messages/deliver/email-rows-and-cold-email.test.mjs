/**
 * An email leaves only from its frozen row, a row is written on the channel it went out on, a person's reply by its
 * connected mailbox, and a cold email judged by its lead and its mailbox.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeDb } from "../../_fake-db.mjs";
import { isWaitRefusal } from "@chanlytics/contracts";
import { importBundle } from "../../_source.mjs";
import {
  ADDRESS,
  HARBOR,
  MAILBOX,
  NOW,
  OWN,
  OWNER,
  T,
  cold,
  coldRequest,
  coldWorld,
  connectedIdentity,
  deliver,
  emailSender,
  emailWire,
  emailed,
  frozen,
  onEmail,
  outreachRpc,
  ownRoute,
  ownTwin,
  ports,
  queuedEmail,
  sendsAs,
  tables,
  thread,
  wireOf,
  words,
} from "./_deliver.mjs";

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
  const { recordOutbound } = await importBundle("db");
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
    // The person's own no outranks every wire rule, a mailbox on hold included.
    ["unsubscribed", { who: { email_marketing: "opted_out" }, boxes: [{ ...HARBOR, state: "held" }] }, {}],
    ["opted_out", { who: { dnc: true } }, {}],
    ["outreach_not_a_lead", { leads: [{ id: "l1", tenant_id: T, contact_id: "someone-else" }] }, {}],
    ["outreach_not_a_lead", { leads: [{ id: "l1", tenant_id: "another-workspace", contact_id: "k1" }] }, {}],
    ["outreach_without_unsubscribe", {}, { email: coldRequest({ campaign: undefined }) }],
    ["outreach_needs_own_mailbox", {}, { email: coldRequest({ identity: hosted }) }],
    ["outreach_needs_own_mailbox", { boxes: [{ ...HARBOR, tenant_id: "another-workspace" }] }, {}],
    ["outreach_needs_own_mailbox", { boxes: [{ ...HARBOR, state: "removed" }] }, {}],
    // Another name on the workspace's own domain is not the mailbox the business connected.
    [
      "outreach_needs_own_mailbox",
      {},
      { email: coldRequest({ identity: connectedIdentity({ ...OWN, address: "other@getharbor.com" }) }) },
    ],
    ["sending_mailbox_not_ready", { boxes: [{ ...HARBOR, state: "paused" }] }, {}],
    ["sending_mailbox_not_ready", { boxes: [{ ...HARBOR, state: "held" }] }, {}],
    ["sending_mailbox_not_ready", { boxes: [{ ...HARBOR, state: "reconnect" }] }, {}],
    // Its provider's own day used up: it rests until then.
    [
      "sending_mailbox_not_ready",
      { boxes: [{ ...HARBOR, resting_until: new Date(NOW + 3_600_000).toISOString() }] },
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

test("a cold email to a business the finder found, from a mailbox the business connected, is sent; a reply never reads outreach's facts", async () => {
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
    db.seen.filter(
      (s) => s.rpc === "outreach_mailbox_facts" || s.table === "leads" || s.table === "mailbox_connections",
    ),
    [],
    "a conversational send pays for no outreach read",
  );
});

test("a read of outreach's facts that fails is not a yes: the door throws and the row is left for the retry", async () => {
  const t = coldWorld();
  const w = emailWire();
  const refusing = {
    outreach_mailbox_facts: () => {
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

test("email's wire picks its route by the request's From: the hosted mailbox on the platform's key, a connected mailbox by its own send, and nothing else", async () => {
  const hosted = { lane: "hosted", cfg: { apiKey: "platform-key" }, as: sendsAs(MAILBOX, "mail.chanlytics.com") };
  const own = ownRoute();
  assert.deepEqual(own.route.as, { address: "sam@getharbor.com", replyRoutes: ["sam@getharbor.com"] });
  const send = emailSender([hosted, own.route]);
  const real = globalThis.fetch;
  const keys = [];
  globalThis.fetch = async (_url, init) => {
    keys.push(init.headers.Authorization);
    return new Response(JSON.stringify({ id: "re_9" }), { status: 200 });
  };
  const refused = { ok: false, wamid: null, status: 0, errorBody: "request_leaves_as_another_sender" };
  try {
    assert.equal(
      (await send(OWNER, { body: "x", email: coldRequest(), purpose: "outreach", deadlineMs: 30_000 })).ok,
      true,
    );
    assert.equal(own.sent.length, 1, "the connected mailbox's own send took it");
    assert.equal(own.sent[0].request.from, '"Sam at Harbor" <sam@getharbor.com>');
    assert.deepEqual(own.sent[0].bound, { deadlineMs: 30_000 }, "with the caller's ceiling");
    assert.equal((await send(ADDRESS, { body: "x", email: frozen() })).ok, true);
    assert.deepEqual(keys, ["Bearer platform-key"], "only the hosted mailbox reaches the platform's account");
    // A mailbox this workspace has no route for (paused, held, removed, or somebody else's) is not sent from.
    const elsewhere = coldRequest({ identity: connectedIdentity({ ...OWN, address: "sam@other.example" }) });
    assert.deepEqual(await send(OWNER, { body: "x", email: elsewhere, purpose: "outreach" }), refused);
    // The chosen route's own Reply-To rule still holds: an answer must come back to this mailbox.
    const strayReply = coldRequest({
      identity: { ...connectedIdentity(OWN), replyTo: "r+aaaaaaaaaaaaaaaaaaaaaaaa@mail.chanlytics.com" },
    });
    assert.deepEqual(await send(OWNER, { body: "x", email: strayReply, purpose: "outreach" }), refused);
    // The lanes: a connected mailbox carries outreach only, and outreach never leaves as the hosted mailbox. A reply
    // frozen with a mailbox's From (or a job that forgot its purpose) would otherwise leave around outreach's rules.
    assert.deepEqual(await send(OWNER, { body: "x", email: coldRequest() }), refused, "no purpose: hosted lane only");
    assert.deepEqual(await send(OWNER, { body: "x", email: coldRequest(), purpose: "conversational" }), refused);
    assert.deepEqual(await send(ADDRESS, { body: "x", email: frozen(), purpose: "outreach" }), refused);
    assert.equal(keys.length + own.sent.length, 2, "no refusal reached a provider");
  } finally {
    globalThis.fetch = real;
  }
});

test("a person's reply leaves by its connected mailbox when that route still holds it, and as the hosted mailbox's request otherwise, saying why", async () => {
  const hosted = { lane: "hosted", cfg: { apiKey: "platform-key" }, as: sendsAs(MAILBOX, "mail.chanlytics.com") };
  const mine = ownRoute(OWN.address, { ok: true, wamid: "g-7", status: 200 });
  const own = mine.route;
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
    assert.equal(
      mine.sent.pop().request.from,
      '"Sam at Harbor" <sam@getharbor.com>',
      "the twin, by the mailbox's own send",
    );

    const asMailbox = async (send, twin, why) => {
      const r = await send(ADDRESS, reply(twin));
      assert.deepEqual([r.ok, r.leftAs, r.leftAsWhy], [true, "mailbox", why], why);
      assert.deepEqual(sent.pop(), ["Bearer platform-key", '"Best Movers" <bestmovers@mail.chanlytics.com>'], why);
    };
    // No connected mailbox at all.
    await asMailbox(emailSender([hosted]), ownTwin(), "no_own_route");
    // The twin's mailbox has no route: removed after the freeze, or somebody else's.
    const elsewhere = ownTwin({ identity: connectedIdentity({ ...OWN, address: "sam@other.example" }) });
    await asMailbox(both, elsewhere, "own_has_no_route");
    // A mailbox of the workspace's that does not send now has no route either, and the row says so: its only one, or
    // one beside a mailbox that still sends.
    const heldAt = /<([^<>]+)>/.exec(elsewhere.from)[1];
    await asMailbox(emailSender([hosted], [heldAt]), elsewhere, "own_not_sending");
    await asMailbox(emailSender([hosted, own], [heldAt]), elsewhere, "own_not_sending");
    await asMailbox(emailSender([hosted, own], [heldAt]), ownTwin({ to: OWNER }), "twin_names_another_recipient");
    // The route refuses the twin's Reply-To: one that is not the mailbox itself.
    const retired = ownTwin({
      identity: { ...connectedIdentity(OWN), replyTo: "r+aaaaaaaaaaaaaaaaaaaaaaaa@mail.chanlytics.com" },
    });
    await asMailbox(both, retired, "route_refuses_twin");
    // A twin to somebody else is never sent: the reply goes to the address it was written to, as the mailbox.
    await asMailbox(both, ownTwin({ to: OWNER }), "twin_names_another_recipient");

    // Only a reply carries a twin: without `reply` the request leaves exactly as before, whatever else it holds.
    const plain = await both(ADDRESS, { body: "x", email: mailbox, ownEmail: ownTwin() });
    assert.deepEqual([plain.ok, plain.leftAs], [true, undefined]);
    assert.equal(sent.pop()[0], "Bearer platform-key");
    // And a reply whose own request names a connected mailbox is still refused: the twin is the one way out by it.
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
    assert.equal(mine.sent.pop().request.from, '"Sam at Harbor" <sam@getharbor.com>');
    assert.equal(sent.length + mine.sent.length, 0, "no refusal reached a provider");
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
    { ok: true, wamid: "re_1", status: 200, leftAs: "mailbox", leftAsWhy: "own_has_no_route" },
  );
  assert.equal(mailbox.out.outcome, "sent");
  assert.deepEqual(stamped, [
    { p_tenant_id: T, p_message_id: "m1", p_left_as: "own", p_why: null },
    { p_tenant_id: T, p_message_id: "m1", p_left_as: "mailbox", p_why: "own_has_no_route" },
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
    // Stop everything cancels a cold email as billing's pause does, never holds it: its clock plans a canceled wait again.
    const stopped = coldWorld();
    stopped.conversations[0].tenants = { status: "active", sending_stopped_at: "2026-09-10T09:00:00.000Z" };
    const c = await deliver(ports(stopped, emailWire()), cold({ sender, proactive, ...(kind ? { kind } : {}) }));
    assert.deepEqual([c.outcome, c.reason, c.held ?? false], ["refused", "stopped", false], `${sender}: stopped`);
    assert.equal(isWaitRefusal(c.reason), true, "a wait: the clock plans it again once sending is resumed");
  }
});

test("the door asks the spec's send-time questions: the lead still being written to, the never-again list, the day's share (D2)", async () => {
  const cases = [
    ["outreach_lead_closed", { leads: [{ id: "l1", tenant_id: T, contact_id: "k1", stage: "converted" }] }, {}],
    ["outreach_lead_closed", { leads: [{ id: "l1", tenant_id: T, contact_id: "k1", stage: "archived" }] }, {}],
    ["outreach_not_a_lead", { leads: [] }, {}],
    ["outreach_suppressed", {}, { suppressed: [OWNER] }],
    // The ramp counts the days a mailbox sent (D15): sent on none, it has the first step's 10; on fourteen, 30; and
    // never past its owner's cap, nor past 20 on the domain its customers write to.
    ["sending_mailbox_at_cap", {}, { sent_today: 10 }],
    [null, {}, { sent_today: 9 }],
    ["sending_mailbox_at_cap", { boxes: [{ ...HARBOR, sent_days: 14 }] }, { sent_today: 30 }],
    [null, { boxes: [{ ...HARBOR, sent_days: 14 }] }, { sent_today: 29 }],
    ["sending_mailbox_at_cap", { boxes: [{ ...HARBOR, sent_days: 30, daily_cap: 25 }] }, { sent_today: 25 }],
    ["sending_mailbox_at_cap", { boxes: [{ ...HARBOR, sent_days: 30, customer_domain: true }] }, { sent_today: 20 }],
    [null, { boxes: [{ ...HARBOR, sent_days: 30, customer_domain: true }] }, { sent_today: 19 }],
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
    sent_today: 500,
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

test("a cold email whose From cannot be read is refused for its mailbox, not as a person the finder never found", async () => {
  const t = coldWorld();
  const unreadable = cold();
  unreadable.email = { ...unreadable.email, from: "not an address" };
  const out = await deliver(ports(t, emailWire()), unreadable);
  assert.deepEqual([out.outcome, out.reason], ["refused", "outreach_needs_own_mailbox"]);
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
    outreach_mailbox_facts: (a) => {
      const { wrote_back: _gone, ...rest } = outreachRpc(t).outreach_mailbox_facts(a);
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
  assert.equal(
    db.seen.find((s) => s.rpc === "outreach_mailbox_facts").args.p_lead_id,
    "l1",
    "asked by the send's own lead",
  );
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
    outreach_mailbox_facts: (a) => {
      const { stopped: _gone, ...rest } = outreachRpc(u).outreach_mailbox_facts(a);
      return rest;
    },
  };
  const before = await deliver(
    { db: fakeDb(u, {}, older), wire: emailWire().wire, now: () => NOW },
    cold({ leadId: "l1" }),
  );
  assert.equal(before.outcome, "sent");
});
