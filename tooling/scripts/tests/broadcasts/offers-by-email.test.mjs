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
  tenants: [{ id: TID, name: "Marisa's Salon", status: "active", timezone: "UTC" }],
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
  // The lane is bound but the door is asked and the wire has no route: the offer is refused before the provider.
  // The workspace's offers are paused by a gate: the door holds them, reminders are not asked.
  const paused = world({
    contacts: [customer(1)],
    mailbox: { ...MAILBOX, offers_paused_at: "2026-10-01T10:00:00Z", offers_paused_reason: "complaints" },
  });
  const wp = await run(paused);
  assert.deepEqual(outcomes(paused), [["1", "skipped", "email_offers_paused"]]);
  assert.equal(wp.posted.length, 0);
});

test("a visit's message in the same workspace keeps the reply domain, its own foot and no unsubscribe", async () => {
  const t = world({
    contacts: [customer(1, { has_relationship: false, email_marketing: null })],
    templates: [
      template("whatsapp", { category: "utility" }),
      template("email", {
        category: "utility",
        source: "chanlytics",
        components: [
          { type: "HEADER", format: "TEXT", text: "Your visit, {{1}}" },
          { type: "BODY", text: "Hi {{1}}, see you tomorrow." },
        ],
      }),
    ],
  });
  const w = await run(t);
  assert.deepEqual(outcomes(t), [["1", "sent", null]]);
  const [{ body }] = w.posted;
  assert.equal(body.from, `"Marisa's Salon" <marisas@${MAIL}>`, "Visit emails keep today's domain");
  assert.ok(!("List-Unsubscribe" in body.headers));
  assert.match(body.text, /Reply STOP to stop these emails\.$|Reply STOP to stop these emails\.\n/);
});

test("a database that has not been given 00288 sends no offer on a relationship alone, and the person who asked still gets theirs", async () => {
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
