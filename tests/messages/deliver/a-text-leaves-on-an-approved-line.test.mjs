/**
 * A text leaves only on a line the carriers approved (One message, every channel, step 3).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeDb } from "../../_fake-db.mjs";
import { OUTCOME_UNKNOWN } from "@chanlytics/contracts";
import {
  ADDRESS,
  NOW,
  OFFER_MAILBOX,
  T,
  TEXT_LINE,
  UNSUB,
  addressAlone,
  broadcastBatchByEmail,
  customer,
  deliver,
  emailSender,
  emailWire,
  emailed,
  frozen,
  kinds,
  news,
  offerRequest,
  offerWorld,
  offered,
  onEmail,
  outreachRpc,
  person,
  ports,
  queuedEmail,
  sendsAs,
  sendsAsCampaigns,
  tables,
  thread,
  wireOf,
  words,
} from "./_deliver.mjs";

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
    // The moment, not the row, says it: a monthly offer's moment is the business's news though the row kept a visit. It
    // is an offer's moment, so the door asks the stricter purpose its enrolment asked (enrolPurpose), and what it lacks
    // is a yes to offers: held as no_marketing_consent, never sent.
    ["news on a monthly moment, a visit kept", addressAlone(), VISIT, held("no_marketing_consent"), "everyone_monthly"],
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
