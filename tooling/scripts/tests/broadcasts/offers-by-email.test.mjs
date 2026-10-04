/**
 * An offer goes by email (One message, every channel, step 4; the campaigns-on-every-channel spec, 4.1, 4.4 and 4.6), run
 * end to end: the real job (packages/jobs broadcast_send) over a database in memory, the real door (core deliver) and the
 * real email wire (core emailSender, with the campaigns route the edge binds once the domain is verified), with only the
 * provider's HTTP stubbed. What is proved is what an offer actually puts on the wire:
 *
 *   - From the mailbox on the CAMPAIGNS domain, Reply-To the mailbox's token address on the mail domain, so a reply lands
 *     in the Inbox and a complaint about the offer never touches the domain replies leave from;
 *   - the foot (why they get it, the business's name and address, an Unsubscribe link) and the one-click headers, whose
 *     link is sealed for this person and this email the way a reach-out's is, and opens on the unsubscribe page's token;
 *   - the idempotency key, the tag every receipt reads, and the row written queued first;
 *   - who is held, with the reason, and who goes: a relationship or their own yes goes; an unsubscribe, an address alone,
 *     no postal address on file, a workspace whose offers are paused, and a deployment with no campaigns domain do not.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { sendsAs, sendsAsCampaigns, verifyUnsubscribeToken } from "@chanlytics/channels";
import { fakeDb } from "../_fake-db.mjs";
import { middayZone } from "../shared/_midday-zone.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = (pkg) => pathToFileURL(path.join(here, `../../../../packages/${pkg}/dist/index.js`)).href;
const { dispatchJob } = await import(dist("jobs"));
const { emailSender } = await import(dist("core"));

const TID = "11111111-1111-4111-8111-111111111111";
const MAIL = "mail.example.com";
const CAMPAIGNS = "campaigns.example.com";
const SECRET = "test-unsubscribe-secret";
const ORIGIN = "https://app.example.com";
const OFFER_WORDS = "Hi {{1}}, ten percent off a Saturday move this month.";
const MAILBOX = {
  id: "mb1",
  tenant_id: TID,
  local_part: "marisas",
  reply_token: "tok123",
  reply_token_prev: null,
  from_name: "Marisa's Salon",
  offers_paused_at: null,
  offers_paused_reason: null,
};

const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
/** A customer: they have written, nobody has said no. `over` changes what a test is about. */
const customer = (n, over = {}) => ({
  id: uuid(n),
  tenant_id: TID,
  phone_e164: null,
  email: `person${n}@example.com`,
  consent: "opted_in",
  dnc: false,
  marketing_consent: "unknown",
  consent_channels: ["whatsapp", "sms"],
  marketing_channels: null,
  email_marketing: "unknown",
  has_relationship: true,
  erased_at: null,
  erasing_since: null,
  email_suppressed_at: null,
  display_name: ["", "Ada Lovelace", "Bo Diddley"][n] ?? "Cy Twombly",
  wa_profile_name: null,
  ...over,
});
const template = (channel, over = {}) => ({
  tenant_id: TID,
  channel,
  name: "monthly_offer",
  language: "en_US",
  meta_status: "approved",
  category: "marketing",
  body_preview: OFFER_WORDS,
  ...over,
});
const recipient = (contact_id) => ({
  tenant_id: TID,
  broadcast_id: "b1",
  contact_id,
  state: "queued",
  channel: "email",
  facts: null,
  sent_at: null,
});
const threads = (people) =>
  people.map((c) => ({
    id: `cv-${c.id}`,
    tenant_id: TID,
    contact_id: c.id,
    paused_until: null,
    contacts: c,
    tenants: { status: "active" },
  }));

const world = ({ contacts, address = "12 Main St, Springfield", mailbox = MAILBOX, ...over } = {}) => ({
  broadcasts: [
    {
      id: "b1",
      tenant_id: TID,
      state: "scheduled",
      name: "October offer",
      template_name: "monthly_offer",
      template_language: "en_US",
      params: [{ kind: "first_name" }],
      recipient_count: contacts.length,
      playbook_id: null,
      audience: null,
      channels: ["whatsapp", "email"],
      started_at: null,
      finished_at: null,
      failure: null,
    },
  ],
  // The batch asks the day's sending hours on the machine's clock: this workspace's noon is now, whenever the suite runs.
  tenants: [{ id: TID, name: "Marisa's Salon", status: "active", timezone: middayZone() }],
  tenant_config: [
    {
      tenant_id: TID,
      config: {
        brain: {
          business_name: "Marisa's",
          system_prompt: "Answer as the front desk of Marisa's: brief and warm.",
          fallbacks: { greeting: "g", error: "e", non_text: "n" },
          profile: { ...(address ? { address } : {}), hours: { mon: { open: "09:00", close: "17:00" } } },
        },
      },
    },
  ],
  templates: [
    template("whatsapp"),
    template("email", {
      source: "chanlytics",
      components: [
        { type: "HEADER", format: "TEXT", text: "October at Marisa's, {{1}}" },
        { type: "BODY", text: OFFER_WORDS },
      ],
    }),
  ],
  contacts,
  conversations: threads(contacts),
  broadcast_recipients: contacts.map((c) => recipient(c.id)),
  messages: [],
  events: [],
  jobs: [],
  mailboxes: [mailbox],
  lines: [],
  ...over,
});

/** The campaigns lane the edge binds while the domain is verified: the domain, and what seals the link and where it opens. */
const LANE = { domain: CAMPAIGNS, unsubscribeSecret: SECRET, unsubscribeOrigin: ORIGIN };

/**
 * The job's context: the email wire the real sender over the mailbox's two routes (the reply domain's, and the campaigns
 * domain's when the lane is bound), the lane in `email`, and the provider's HTTP stubbed.
 */
function context(t, { lane = LANE } = {}) {
  const posted = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    posted.push({ url: String(url), init, body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ id: `re_${posted.length}` }), { status: 200 });
  };
  const routes = [{ lane: "hosted", cfg: { apiKey: "test-key" }, as: sendsAs(MAILBOX, MAIL) }];
  if (lane)
    routes.push({ lane: "campaigns", cfg: { apiKey: "test-key" }, as: sendsAsCampaigns(MAILBOX, lane.domain, MAIL) });
  const ctx = {
    db: fakeDb(t, {}, { campaign_month_sent: () => 0 }),
    wire: { email: emailSender(routes) },
    email: { domain: MAIL, ...(lane ? { campaigns: lane } : {}) },
    alert: async () => {},
    schedule: async () => {},
    deadline: Date.now() + 60_000,
  };
  return { ctx, posted, restore: () => (globalThis.fetch = real) };
}
const JOB = { id: "j1", tenant_id: TID, kind: "broadcast_send", payload: { broadcast_id: "b1" } };
const run = async (t, o) => {
  const w = context(t, o);
  try {
    await dispatchJob(w.ctx, JOB);
  } finally {
    w.restore();
  }
  return w;
};
const outcomes = (t) => t.broadcast_recipients.map((r) => [r.contact_id.slice(-1), r.state, r.reason ?? null]);

test("an offer leaves from the mailbox on the campaigns domain, answered at the mailbox's reply route, with the foot, the one-click headers, and a link sealed for this person and this email", async () => {
  const ada = customer(1);
  const bo = customer(2, { email_marketing: "opted_in", has_relationship: false });
  const t = world({ contacts: [ada, bo] });
  const w = await run(t);
  assert.deepEqual(outcomes(t), [
    ["1", "sent", null],
    ["2", "sent", null],
  ]);
  assert.equal(t.broadcasts[0].state, "sent");
  assert.equal(w.posted.length, 2, "one request to the provider each");
  const [first, second] = w.posted.map((p) => p.body);
  for (const body of [first, second]) {
    assert.equal(
      body.from,
      `"Marisa's Salon" <marisas@${CAMPAIGNS}>`,
      "From: the mailbox on the campaigns domain, never the reply domain",
    );
    assert.deepEqual(
      body.reply_to,
      [`r+tok123@${MAIL}`],
      "Reply-To: the mailbox's token address, so a reply lands in the Inbox",
    );
    assert.equal(body.headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click", "RFC 8058's one click");
    assert.equal(body.headers["Auto-Submitted"], "auto-generated");
  }
  // The link is the same in the header and the foot, and it opens on the one token the unsubscribe page reads.
  const mail = (n) => t.messages.find((m) => m.contact_id === uuid(n));
  const linkOf = (body) => /^<(https:\/\/[^>]+)>$/.exec(body.headers["List-Unsubscribe"])[1];
  const url = linkOf(first);
  assert.ok(url.startsWith(`${ORIGIN}/u/`));
  assert.deepEqual(verifyUnsubscribeToken([SECRET], url.slice(`${ORIGIN}/u/`.length)), {
    tenantId: TID,
    contactId: uuid(1),
    messageId: mail(1).id,
  });
  assert.notEqual(linkOf(second), url, "each person's own link");
  assert.equal(verifyUnsubscribeToken([SECRET], linkOf(second).slice(`${ORIGIN}/u/`.length)).contactId, uuid(2));
  // The foot: why they get it (a customer; or they asked), who and where, the link. The words come first.
  assert.equal(
    first.text,
    [
      "Hi Ada, ten percent off a Saturday move this month.",
      "",
      "You're a customer of Marisa's.",
      "Marisa's · 12 Main St, Springfield",
      `Unsubscribe: ${url}`,
    ].join("\n"),
  );
  assert.match(
    second.text,
    /\n\nYou asked for offers from Marisa's\.\nMarisa's · 12 Main St, Springfield\nUnsubscribe: https:\/\/app\.example\.com\/u\//,
  );
  assert.ok(
    first.html.includes(`<a href="${url}">Unsubscribe</a>`),
    "the HTML foot reads Unsubscribe and carries the same link",
  );
  assert.equal(first.subject, "October at Marisa's, Ada");
  // Idempotent as every email is: the row's id is the key and the tag every receipt reads; the row was queued first.
  assert.equal(first.tags.find((x) => x.name === "cl_message").value, mail(1).id);
  assert.ok(
    first.tags.some((x) => x.name === "cl_campaign"),
    "a campaign's email: its bounce or complaint is the campaign's to count",
  );
  assert.equal(new Headers(w.posted[0].init.headers).get("Idempotency-Key"), mail(1).id);
  assert.equal(mail(1).status, "sent");
  assert.equal(mail(1).meta.source, "broadcast");
  assert.equal(
    mail(1).body,
    "Hi Ada, ten percent off a Saturday move this month.",
    "the thread shows the words, not the foot",
  );
  assert.equal(mail(1).meta.email.request.from, first.from);
});

test("who is held, and why: an unsubscribe, an address alone, a stop and a dead address are never written to; a business with no address on file writes to nobody", async () => {
  const people = [
    customer(1),
    customer(2, { email_marketing: "opted_out" }),
    customer(3, { has_relationship: false }),
    customer(4, { consent: "opted_out", dnc: true }),
    customer(5, { email_suppressed_at: "2026-09-01T00:00:00Z" }),
  ];
  const t = world({ contacts: people });
  const w = await run(t);
  assert.deepEqual(outcomes(t), [
    ["1", "sent", null],
    ["2", "skipped", "unsubscribed"],
    ["3", "skipped", "no_marketing_consent"],
    ["4", "skipped", "opted_out"],
    ["5", "skipped", "email_suppressed"],
  ]);
  assert.equal(w.posted.length, 1, "only the one that may go reaches the provider");
  // No postal address on the Business record: an offer's foot would not name where the business is, so nobody is written to.
  const none = world({ contacts: [customer(1), customer(2)], address: null });
  const wn = await run(none);
  assert.deepEqual(outcomes(none), [
    ["1", "skipped", "no_business_address"],
    ["2", "skipped", "no_business_address"],
  ]);
  assert.equal(wn.posted.length, 0);
});

test("a person who said no to offers on WhatsApp is not sent an offer by email, and the person who asked by email and said no there is not either (a recorded no is held over a yes)", async () => {
  const people = [
    customer(1),
    customer(2, { marketing_consent: "opted_out" }),
    customer(3, { marketing_consent: "opted_out", email_marketing: "opted_in", has_relationship: false }),
    customer(4, { marketing_consent: "opted_in", email_marketing: "unknown" }),
  ];
  const t = world({ contacts: people });
  const w = await run(t);
  assert.deepEqual(outcomes(t), [
    ["1", "sent", null],
    ["2", "skipped", "no_marketing_consent"],
    ["3", "skipped", "no_marketing_consent"],
    ["4", "sent", null],
  ]);
  assert.equal(w.posted.length, 2, "only the two with no recorded no reach the provider");
});

test("a person held because their email could not be built or signed is held with a reason on record: said once for the batch, by name, with the error", async () => {
  const said = [];
  const error = console.error;
  console.error = (...args) => said.push(JSON.parse(args[0]));
  try {
    // A secret that cannot seal a link (blank): no link out, so nobody is written to, and the log says why, once.
    const blank = world({ contacts: [customer(1), customer(2)] });
    const w = await run(blank, { lane: { ...LANE, unsubscribeSecret: "" } });
    assert.deepEqual(outcomes(blank), [
      ["1", "skipped", "no_channel"],
      ["2", "skipped", "no_channel"],
    ]);
    assert.equal(w.posted.length, 0);
    const unsigned = said.filter((l) => l.event === "broadcast_unsubscribe_unsigned");
    assert.equal(unsigned.length, 1, "once for the batch, not once for each person");
    assert.deepEqual([unsigned[0].tenant_id, unsigned[0].error], [TID, "Error: signUnsubscribeToken: no secret"]);

    // Words no email may carry (a first email a program sends that poses as a reply): the request cannot be built.
    said.length = 0;
    const poses = world({
      contacts: [customer(1), customer(2)],
      templates: [
        template("whatsapp"),
        template("email", {
          source: "chanlytics",
          components: [
            { type: "HEADER", format: "TEXT", text: "Re: October at Marisa's, {{1}}" },
            { type: "BODY", text: OFFER_WORDS },
          ],
        }),
      ],
    });
    const wp = await run(poses);
    assert.deepEqual(outcomes(poses), [
      ["1", "skipped", "no_channel"],
      ["2", "skipped", "no_channel"],
    ]);
    assert.equal(wp.posted.length, 0);
    const refused = said.filter((l) => l.event === "broadcast_email_request_failed");
    assert.equal(refused.length, 1, "once for the batch");
    assert.deepEqual(
      [refused[0].tenant_id, refused[0].offer, refused[0].error],
      [TID, true, "Error: buildEmailRequest: a first email a program sends does not pose as a reply"],
    );
  } finally {
    console.error = error;
  }
});

test("offers wait on the deployment and the workspace: no campaigns lane, or offers paused, sends nothing from any domain", async () => {
  // The deployment has no verified campaigns domain: the runtime cannot seal a link or leave from a domain, so each person
  // is held (never sent from the reply domain instead).
  const noLane = world({ contacts: [customer(1)] });
  const wl = await run(noLane, { lane: null });
  assert.deepEqual(outcomes(noLane), [["1", "skipped", "no_channel"]]);
  assert.equal(wl.posted.length, 0);
  // The workspace's offers are paused by a gate: the door refuses the first email it is asked about, and the pause holds for
  // the whole workspace, so the run STOPS there with its failure and its owner is told, rather than each person left being
  // skipped for good and the run ending as sent. The person the door was asked about is given back, never burned.
  const paused = world({
    contacts: [customer(1), customer(2)],
    mailbox: { ...MAILBOX, offers_paused_at: "2026-10-01T10:00:00Z", offers_paused_reason: "complaints" },
  });
  const told = [];
  const w = context(paused);
  w.ctx.alert = async (n) => told.push(n);
  try {
    await dispatchJob(w.ctx, JOB);
  } finally {
    w.restore();
  }
  assert.deepEqual(
    outcomes(paused),
    [
      ["1", "queued", "not_taken"],
      ["2", "queued", null],
    ],
    "nobody skipped: one given back, the other never claimed",
  );
  assert.deepEqual([paused.broadcasts[0].state, paused.broadcasts[0].failure], ["failed", "email_offers_paused"]);
  assert.equal(w.posted.length, 0);
  assert.equal(told.length, 1, "the owner is told once");
  assert.equal(told[0].kind, "broadcast_stopped");
  assert.match(
    told[0].body,
    /Offers by email are paused while complaints and bounces settle, so the rest was not sent\./,
  );
  // The same words a page gives the owner afterwards, and a reminder in the same pause goes: the pause holds offers alone.
  const { broadcastFailureWords } = await import("@chanlytics/contracts");
  assert.match(broadcastFailureWords(paused.broadcasts[0].failure), /offers by email were paused/);
  const ana = customer(1, { has_relationship: false, email_marketing: null });
  const visit = asVisitRun(
    world({
      contacts: [ana],
      templates: UTILITY,
      mailbox: { ...MAILBOX, offers_paused_at: "2026-10-01T10:00:00Z", offers_paused_reason: "complaints" },
      broadcast_recipients: [{ ...recipient(ana.id), facts: { visit_when: "tomorrow at 2:00 PM" } }],
    }),
  );
  await run(visit);
  assert.deepEqual(outcomes(visit), [["1", "sent", null]], "a visit's email is no offer: the pause does not hold it");
});

test("where the deployment names a campaigns domain the provider does not verify, the run stops with that said and nobody is held; where the provider could not be asked, the run waits and nobody is held", async () => {
  const attempt = async (t, bind) => {
    const w = context(t, { lane: null });
    const news = [];
    const later = [];
    w.ctx.alert = async (n) => news.push(n);
    w.ctx.schedule = async (kind, dueAt, payload) => later.push({ kind, dueAt, payload });
    bind(w.ctx);
    try {
      await dispatchJob(w.ctx, JOB);
    } finally {
      w.restore();
    }
    return { w, news, later };
  };
  // Closed: named, and the provider says it is not verified. Every offer by email was held no_channel, for good; now the
  // person stays queued, the broadcast fails by a name of its own, and the owner is told the cause is not their mailbox.
  const closed = world({ contacts: [customer(1), customer(2)] });
  const stopped = await attempt(closed, (ctx) => {
    ctx.email = {
      domain: MAIL,
      campaignsClosed: "the campaigns domain campaigns.example.com is not verified for sending",
    };
  });
  assert.deepEqual(outcomes(closed), [
    ["1", "queued", null],
    ["2", "queued", null],
  ]);
  assert.deepEqual(
    [closed.broadcasts[0].state, closed.broadcasts[0].failure],
    ["failed", "campaigns_domain_unverified"],
  );
  assert.equal(stopped.w.posted.length, 0, "nothing left from any domain");
  assert.equal(stopped.later.length, 0, "stopped, not waiting");
  assert.match(
    stopped.news[0].body,
    /is not verified with the mail provider right now.*Nothing is wrong with your mailbox/,
  );
  // The same words a page gives the owner afterwards.
  const { broadcastFailureWords } = await import("@chanlytics/contracts");
  assert.match(broadcastFailureWords(closed.broadcasts[0].failure), /not verified with the mail provider/);
  // Unread: the provider could not be asked. The email wire is bound as ever, and the intake says the domain could not be
  // checked (core offersUnread): a run of offers waits a minute and asks again, nobody claimed.
  const UNREAD = "the campaigns domain campaigns.example.com could not be checked";
  const unread = world({ contacts: [customer(1)] });
  const waiting = await attempt(unread, (ctx) => {
    ctx.email = { domain: MAIL, campaignsUnread: UNREAD };
  });
  assert.deepEqual(outcomes(unread), [["1", "queued", null]], "not held: nobody was claimed");
  assert.equal(unread.broadcasts[0].state, "sending", "begun, and waiting, not failed");
  assert.deepEqual(
    waiting.later.map((l) => [l.kind, l.payload]),
    [["broadcast_send", { broadcast_id: "b1", stalls: 1 }]],
    "the next batch is a stall away, carrying the count",
  );
  assert.equal(waiting.w.posted.length, 0);
  assert.deepEqual(waiting.news, [], "and nobody is told yet");
  // A visit's email in the same minute goes: it leaves from the mail domain, which is not in question. Binding the whole
  // email wire unavailable for an unread campaigns domain held it too, for half an hour, by which time it said "tomorrow".
  const ana = customer(1, { has_relationship: false, email_marketing: null });
  const visit = asVisitRun(
    world({
      contacts: [ana],
      templates: UTILITY,
      broadcast_recipients: [{ ...recipient(ana.id), facts: { visit_when: "tomorrow at 2:00 PM" } }],
    }),
  );
  const reminded = await attempt(visit, (ctx) => {
    ctx.email = { domain: MAIL, campaignsUnread: UNREAD };
  });
  assert.deepEqual(outcomes(visit), [["1", "sent", null]]);
  assert.equal(reminded.w.posted.length, 1);
});

/** A world's run made a visit's: its audience names the moment, as run-playbook writes it (the send reads it there). */
const asVisitRun = (w) => {
  w.broadcasts[0] = {
    ...w.broadcasts[0],
    playbook_id: "p1",
    audience: { kind: "playbook", id: "p1", label: "Visit reminder", trigger: "visit_tomorrow" },
  };
  return w;
};

/** A message in the same workspace that is no offer: Meta files it as a utility, with its email version beside it. */
const UTILITY = [
  template("whatsapp", { category: "utility" }),
  template("email", {
    category: "utility",
    source: "chanlytics",
    components: [
      { type: "HEADER", format: "TEXT", text: "Your visit, {{1}}" },
      { type: "BODY", text: "Hi {{1}}, see you tomorrow." },
    ],
  }),
];

test("a visit's message in the same workspace keeps the reply domain, its own foot and no unsubscribe", async () => {
  // A visit's run keeps the visit it was made for on each person's recipient row (visitFactsFor): it is about their own visit,
  // which by email asks an address and no yes, even of someone with no relationship on record (decision D1).
  const ana = customer(1, { has_relationship: false, email_marketing: null });
  const t = asVisitRun(
    world({
      contacts: [ana],
      templates: UTILITY,
      broadcast_recipients: [{ ...recipient(ana.id), facts: { visit_when: "tomorrow at 2:00 PM" } }],
    }),
  );
  const w = await run(t);
  assert.deepEqual(outcomes(t), [["1", "sent", null]]);
  const [{ body }] = w.posted;
  assert.equal(body.from, `"Marisa's Salon" <marisas@${MAIL}>`, "Visit emails keep today's domain");
  assert.ok(!("List-Unsubscribe" in body.headers));
  assert.match(body.text, /Reply STOP to stop these emails\.$|Reply STOP to stop these emails\.\n/);
});

/** The business's own news: a utility message sent as a broadcast, so the run kept no visit or proposal for anyone. */
const NEWS_PEOPLE = () => [
  customer(1, { has_relationship: false, email_marketing: null }), // an address and a yes for WhatsApp and text: held
  customer(2), // wrote to the business: goes
  customer(3, { has_relationship: false, consent_channels: ["whatsapp", "sms", "email"] }), // a yes covering email: goes
  customer(4, { email_marketing: "opted_out" }), // pressed Unsubscribe, though a customer: held
  // A yes covering email that also asked for offers by email: goes, and the foot says they asked.
  customer(5, { email_marketing: "opted_in", has_relationship: false, consent_channels: ["email"] }),
];

test("the business's own news by email, though its message is a utility (decisions D1 and D2): it goes to a relationship or a yes covering email and holds an address alone and an unsubscribe, and it leaves as an offer does: from the campaigns domain, with the offer's foot and both one-click headers", async () => {
  const t = world({ contacts: NEWS_PEOPLE(), templates: UTILITY });
  const w = await run(t);
  assert.deepEqual(outcomes(t), [
    ["1", "skipped", "not_opted_in"],
    ["2", "sent", null],
    ["3", "sent", null],
    ["4", "skipped", "unsubscribed"],
    ["5", "sent", null],
  ]);
  assert.equal(w.posted.length, 3, "the provider is asked only for the three it may reach");
  for (const { body } of w.posted) {
    assert.equal(
      body.from,
      `"Marisa's Salon" <marisas@${CAMPAIGNS}>`,
      "it is an offer at the door: the campaigns domain, never the reply domain",
    );
    assert.deepEqual(body.reply_to, [`r+tok123@${MAIL}`], "and a reply still lands in the Inbox");
    assert.equal(body.headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click", "RFC 8058's one click");
    assert.match(
      body.headers["List-Unsubscribe"],
      /^<https:\/\/app\.example\.com\/u\/[^>]+>$/,
      "a link sealed for them",
    );
    assert.doesNotMatch(body.text, /Reply STOP/, "the visit foot's way out is not this one's");
  }
  const [first, , third] = w.posted.map((p) => p.body);
  const url = /^<(https:\/\/[^>]+)>$/.exec(first.headers["List-Unsubscribe"])[1];
  assert.equal(
    first.text,
    [
      "Hi Bo, see you tomorrow.",
      "",
      "You're a customer of Marisa's.",
      "Marisa's · 12 Main St, Springfield",
      `Unsubscribe: ${url}`,
    ].join("\n"),
    "the offer's foot: why they get it, who and where, the link",
  );
  assert.match(
    third.text,
    /\n\nYou asked for offers from Marisa's\.\n/,
    "someone who asked for offers by email says so",
  );
  assert.ok(first.html.includes(`<a href="${url}">Unsubscribe</a>`), "and the HTML foot carries the same link");
  // The thread shows the words alone, not the foot.
  assert.equal(
    t.messages.find((m) => m.contact_id === uuid(2)).body,
    "Hi Bo, see you tomorrow.",
    "the thread shows the words, not the foot",
  );
});

test("the business's own news by email owes what an offer owes: a postal address on file, a link that can be sealed, a campaigns domain the deployment holds and the provider verifies, and offers not paused", async () => {
  // No postal address: the foot cannot name where the business is, so nobody is written to (as an offer's).
  const none = world({ contacts: [customer(2), customer(3)], templates: UTILITY, address: null });
  const wn = await run(none);
  assert.deepEqual(outcomes(none), [
    ["2", "skipped", "no_business_address"],
    ["3", "skipped", "no_business_address"],
  ]);
  assert.equal(wn.posted.length, 0);
  // No campaigns lane on this runtime: held, and never sent from the reply domain instead.
  const noLane = world({ contacts: [customer(2)], templates: UTILITY });
  const wl = await run(noLane, { lane: null });
  assert.deepEqual(outcomes(noLane), [["2", "skipped", "no_channel"]]);
  assert.equal(wl.posted.length, 0);
  // A campaigns domain the provider says is not verified stops the run with that said, nobody held, as an offer's does.
  const closed = world({ contacts: [customer(2), customer(3)], templates: UTILITY });
  const told = [];
  const w = context(closed, { lane: null });
  w.ctx.alert = async (n) => told.push(n);
  w.ctx.email = {
    domain: MAIL,
    campaignsClosed: "the campaigns domain campaigns.example.com is not verified for sending",
  };
  try {
    await dispatchJob(w.ctx, JOB);
  } finally {
    w.restore();
  }
  assert.deepEqual(
    outcomes(closed),
    [
      ["2", "queued", null],
      ["3", "queued", null],
    ],
    "nobody was claimed",
  );
  assert.deepEqual(
    [closed.broadcasts[0].state, closed.broadcasts[0].failure],
    ["failed", "campaigns_domain_unverified"],
  );
  assert.equal(w.posted.length, 0);
  assert.equal(told.length, 1);
  // The workspace's offers paused by a gate hold the news with them, and stop the run once the door says so.
  const paused = world({
    contacts: [customer(2), customer(3)],
    templates: UTILITY,
    mailbox: { ...MAILBOX, offers_paused_at: "2026-10-01T10:00:00Z", offers_paused_reason: "bounces" },
  });
  const wp = await run(paused);
  assert.deepEqual([paused.broadcasts[0].state, paused.broadcasts[0].failure], ["failed", "email_offers_paused"]);
  assert.equal(wp.posted.length, 0);
});

test("a database that has not been given 00299 sends no offer on a relationship alone, and the person who asked still gets theirs", async () => {
  // No has_relationship column on the contacts, no pause columns on the mailbox: code that shipped before its migration.
  const strip = (c) => {
    const { has_relationship: _relationship, ...rest } = c;
    return rest;
  };
  const { offers_paused_at: _at, offers_paused_reason: _reason, ...oldMailbox } = MAILBOX;
  const t = world({
    contacts: [strip(customer(1)), strip(customer(2, { email_marketing: "opted_in" }))],
    mailbox: oldMailbox,
  });
  const w = await run(t);
  assert.deepEqual(outcomes(t), [
    ["1", "skipped", "no_marketing_consent"],
    ["2", "sent", null],
  ]);
  assert.equal(w.posted.length, 1);
});
