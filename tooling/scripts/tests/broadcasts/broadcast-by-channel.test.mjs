/**
 * A broadcast goes by each person's channel, run end to end (One message, every channel, step 3): the real job
 * (packages/jobs broadcast_send) over a database in memory, the real door (core deliver) and the real email wire
 * (core emailSender over channels' request check), with only the provider's HTTP stubbed. core-broadcast.test.mjs proves
 * the batch's rules over fakes; this proves what the three channels actually put on their wires.
 *
 *   - WhatsApp: the template, its slots filled, as ever;
 *   - text: the text version's words with the STOP line, on the person's thread by their number, through the door's
 *     check that the line is approved;
 *   - email: the email version's subject and body, a foot, frozen as the request the HOSTED mailbox sends -- From its
 *     address, Reply-To its token address, no unsubscribe -- written as the queued row the door demands first, and sent
 *     under that row's id, which is its idempotency key.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { sendsAs, sendsAsCampaigns } from "@chanlytics/channels";
import { fakeDb } from "../_fake-db.mjs";
import { middayZone } from "../shared/_midday-zone.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = (pkg) => pathToFileURL(path.join(here, `../../../../packages/${pkg}/dist/index.js`)).href;
const { dispatchJob } = await import(dist("jobs"));
const { emailSender, WireUnavailableError } = await import(dist("core"));

const TID = "11111111-1111-4111-8111-111111111111";
const DOMAIN = "mail.example.com";
const VISIT_WORDS = "Hi {{1}}, your visit is {{2}}.";
const MAILBOX = {
  id: "mb1",
  tenant_id: TID,
  local_part: "marisas",
  reply_token: "tok123",
  reply_token_prev: null,
  from_name: "Marisa's Salon",
};
const VISIT = { visit_when: "tomorrow at 2:00 PM", visit_service: "Balayage" };

const person = (id, over = {}) => ({
  id,
  tenant_id: TID,
  phone_e164: null,
  email: null,
  consent: "opted_in",
  dnc: false,
  marketing_consent: "unknown",
  consent_channels: ["whatsapp", "sms"],
  marketing_channels: null,
  email_marketing: null,
  erased_at: null,
  erasing_since: null,
  email_suppressed_at: null,
  display_name: null,
  wa_profile_name: null,
  ...over,
});
const template = (channel, over = {}) => ({
  tenant_id: TID,
  channel,
  name: "visit_reminder",
  language: "en_US",
  meta_status: "approved",
  category: "utility",
  body_preview: VISIT_WORDS,
  ...over,
});
/** The three people a reminder goes to, each reachable one way: by WhatsApp, by text, by email. */
const people = () => [
  person("k1", { phone_e164: "+15551230001", display_name: "Ada Lovelace" }),
  person("k2", { phone_e164: "+15551230002", display_name: "Bo Diddley" }),
  person("k3", { email: "cy@example.com", display_name: "Cy Twombly" }),
];
const recipient = (contact_id, channel) => ({
  tenant_id: TID,
  broadcast_id: "b1",
  contact_id,
  state: "queued",
  channel,
  facts: VISIT,
  sent_at: null,
});

/**
 * Each person's one thread, with the person and the workspace the door reads at the wire (the database in memory embeds what
 * the row holds, so the thread holds the very object the contacts table does).
 */
const threads = (people) =>
  people.map((c) => ({
    id: `cv-${c.id}`,
    tenant_id: TID,
    contact_id: c.id,
    paused_until: null,
    contacts: c,
    tenants: { status: "active" },
  }));

const world = ({ contacts = people(), ...over } = {}) => ({
  broadcasts: [
    {
      id: "b1",
      tenant_id: TID,
      state: "scheduled",
      name: "Visit reminder · 2026-09-11",
      template_name: "visit_reminder",
      template_language: "en_US",
      params: [{ kind: "first_name" }, { kind: "visit_when" }],
      recipient_count: 3,
      // A visit's run, as run-playbook writes it: the playbook, its moment (the send reads what the message is about there).
      playbook_id: "p1",
      audience: { kind: "playbook", id: "p1", label: "Visit reminder", trigger: "visit_tomorrow" },
      channels: ["whatsapp", "sms", "email"],
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
      // As the workspace keeps it: a brain with its words (the schema refuses a config without them), and the Business
      // record's postal address, which an email's foot gives.
      config: {
        brain: {
          business_name: "Marisa's",
          system_prompt: "Answer as the front desk of Marisa's: brief and warm.",
          fallbacks: { greeting: "g", error: "e", non_text: "n" },
          profile: { address: "12 Main St, Springfield", hours: { mon: { open: "09:00", close: "17:00" } } },
        },
      },
    },
  ],
  templates: [
    template("whatsapp"),
    template("sms", { source: "chanlytics", components: [{ type: "BODY", text: VISIT_WORDS }] }),
    template("email", {
      source: "chanlytics",
      components: [
        { type: "HEADER", format: "TEXT", text: "Your visit, {{1}}" },
        { type: "BODY", text: VISIT_WORDS },
      ],
    }),
  ],
  contacts,
  conversations: threads(contacts),
  broadcast_recipients: [recipient("k1", "whatsapp"), recipient("k2", "sms"), recipient("k3", "email")],
  messages: [],
  events: [],
  jobs: [],
  mailboxes: [MAILBOX],
  lines: [
    {
      tenant_id: TID,
      messaging_service_sid: "MG1",
      voice_state: "ready",
      sms_state: "active",
      reg_mock: false,
      created_at: "2026-09-01T00:00:00Z",
    },
  ],
  ...over,
});

/** The campaigns lane the edge binds while its domain is verified: what the business's news by email leaves on (decision D2). */
const LANE = {
  domain: "campaigns.example.com",
  unsubscribeSecret: "test-unsubscribe-secret",
  unsubscribeOrigin: "https://app.example.com",
};

/**
 * The job's context: the three wires, as the edge binds them -- the email one the real sender over the hosted mailbox, and
 * over the campaigns domain too where `campaigns` is the lane (a broadcast's email is the business's news, an offer at the door).
 */
function context(t, { monthSent = 0, campaigns = null } = {}) {
  const wa = [];
  const sms = [];
  const posted = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    posted.push({ url: String(url), init, body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ id: `re_${posted.length}` }), { status: 200 });
  };
  const news = [];
  const later = [];
  const ctx = {
    db: fakeDb(t, {}, { campaign_month_sent: () => monthSent }),
    wire: {
      whatsapp: async (to, p) => (wa.push({ to, p }), { ok: true, wamid: `wamid.${wa.length}`, status: 200 }),
      sms: async (to, p) => (sms.push({ to, p }), { ok: true, wamid: `SM${sms.length}`, status: 201 }),
      email: emailSender([
        { lane: "hosted", cfg: { apiKey: "test-key" }, as: sendsAs(MAILBOX, DOMAIN) },
        ...(campaigns
          ? [
              {
                lane: "campaigns",
                cfg: { apiKey: "test-key" },
                as: sendsAsCampaigns(MAILBOX, campaigns.domain, DOMAIN),
              },
            ]
          : []),
      ]),
    },
    email: { domain: DOMAIN, ...(campaigns ? { campaigns } : {}) },
    alert: async (n) => news.push(n),
    schedule: async (kind, dueAt, payload) => later.push([kind, dueAt, payload]),
    deadline: Date.now() + 60_000,
  };
  return { ctx, wa, sms, posted, news, later, restore: () => (globalThis.fetch = real) };
}
const JOB = { id: "j1", tenant_id: TID, kind: "broadcast_send", payload: { broadcast_id: "b1" } };

test("one batch, three channels: WhatsApp's template, the text version with its STOP line, and an email from the hosted mailbox, each on its own wire", async () => {
  const t = world();
  const w = context(t);
  try {
    await dispatchJob(w.ctx, JOB);
  } finally {
    w.restore();
  }
  assert.deepEqual(
    t.broadcast_recipients.map((r) => [r.contact_id, r.channel, r.state, r.reason ?? null]),
    [
      ["k1", "whatsapp", "sent", null],
      ["k2", "sms", "sent", null],
      ["k3", "email", "sent", null],
    ],
    "each person is reached once, on the channel their row says",
  );
  assert.equal(t.broadcasts[0].state, "sent");

  // WhatsApp: the template, as ever.
  assert.equal(w.wa.length, 1);
  assert.equal(w.wa[0].to, "+15551230001");
  assert.deepEqual(w.wa[0].p.template, {
    name: "visit_reminder",
    language: "en_US",
    params: ["Ada", "tomorrow at 2:00 PM"],
  });

  // The text: the version's words, filled, with the STOP line, to their number.
  assert.deepEqual(
    w.sms.map((s) => [s.to, s.p.body]),
    [["+15551230002", "Hi Bo, your visit is tomorrow at 2:00 PM.\nReply STOP to opt out"]],
  );

  // The email: one POST to the provider, from the hosted mailbox, answered at its reply route, with the foot.
  assert.equal(w.posted.length, 1, "one email, one request to the provider");
  const [{ url, init, body }] = w.posted;
  assert.equal(url, "https://api.resend.com/emails");
  assert.equal(body.from, '"Marisa\'s Salon" <marisas@mail.example.com>', "From: the workspace's hosted mailbox");
  assert.deepEqual(
    body.reply_to,
    ["r+tok123@mail.example.com"],
    "Reply-To: its reply route, so a reply lands in the Inbox",
  );
  assert.deepEqual(body.to, ["cy@example.com"]);
  assert.equal(body.subject, "Your visit, Cy");
  assert.equal(
    body.text,
    [
      "Hi Cy, your visit is tomorrow at 2:00 PM.",
      "",
      "You're getting this because of your visit with Marisa's.",
      // The foot now says how to stop these emails: they carry no unsubscribe link.
      "Reply STOP to stop these emails.",
      "Marisa's · 12 Main St, Springfield",
    ].join("\n"),
    "the words, then the foot: why they hear from the business, and who and where",
  );
  assert.ok(body.html.includes("Hi Cy, your visit is tomorrow at 2:00 PM."));
  assert.equal(
    body.headers["Auto-Submitted"],
    "auto-generated",
    "a program's email says so, so an out-of-office does not answer it",
  );
  assert.ok(!("List-Unsubscribe" in body.headers), "appointment messages carry no unsubscribe; offers by email will");
  const mail = t.messages.find((m) => m.channel === "email");
  assert.equal(
    body.tags.find((x) => x.name === "cl_message").value,
    mail.id,
    "every receipt finds its row by this tag",
  );
  assert.equal(
    new Headers(init.headers).get("Idempotency-Key"),
    mail.id,
    "the key is the row's id: a retry cannot send it twice",
  );

  // Its row was written queued first, with the frozen request, and finalized by the door.
  assert.equal(mail.status, "sent");
  assert.equal(mail.meta.source, "broadcast");
  assert.equal(mail.meta.broadcast_id, "b1");
  assert.equal(mail.meta.email.subject, "Your visit, Cy");
  assert.equal(mail.meta.email.request.from, body.from);
  assert.equal(mail.body, "Hi Cy, your visit is tomorrow at 2:00 PM.", "the thread shows the words, not the foot");
  assert.equal(t.broadcast_recipients[2].message_id, mail.id);
  // And the three are each person's own thread.
  assert.equal(new Set(t.messages.map((m) => m.conversation_id)).size, 3);
});

test("an email is sent by the time the tick can still wait for it: a batch that starts late hands the provider call what is left of the function, not the wire's own 32 seconds", async () => {
  const askedOf = async (deadline) => {
    const t = world({ broadcast_recipients: [recipient("k3", "email")] });
    const w = context(t);
    const asked = [];
    const realTimeout = AbortSignal.timeout;
    AbortSignal.timeout = (ms) => (asked.push(ms), realTimeout.call(AbortSignal, ms));
    w.ctx.deadline = deadline;
    try {
      await dispatchJob(w.ctx, JOB);
    } finally {
      w.restore();
      AbortSignal.timeout = realTimeout;
    }
    assert.equal(w.posted.length, 1, "the email left");
    assert.equal(t.broadcast_recipients[0].state, "sent");
    return asked[0];
  };
  // The yield point a second away: the ceiling's room beyond it, less what the settle needs (jobs sendByAt: ten seconds), is
  // all this send has, so its one request is bounded by about eleven, and so are a second try and a wait.
  const late = await askedOf(Date.now() + 1_000);
  assert.ok(late > 9_000 && late <= 11_000, `a send begun at the yield point is given about 11 s, was ${late}`);
  // A tick with room to spare gives the provider call its own bound.
  assert.equal(await askedOf(Date.now() + 40_000), 15_000);
});

test("a WhatsApp send or a text is never started when its wire's own timeout would end past the room the tick keeps: the person stays queued, the next batch is placed at once, and no stall is counted", async () => {
  // WhatsApp's send and a text's are one try each under the provider's fifteen seconds, which nothing shortens: begun
  // just before the yield, one ran to the ceiling itself, with nothing left to record that it went (jobs startByAt).
  const run = async (yieldInMs, recipients, contacts = people()) => {
    const t = world({ contacts, broadcast_recipients: recipients });
    const w = context(t);
    w.ctx.deadline = Date.now() + yieldInMs;
    try {
      await dispatchJob(w.ctx, JOB);
    } finally {
      w.restore();
    }
    return { t, w };
  };
  for (const channel of ["whatsapp", "sms"]) {
    const late = await run(1_000, [recipient(channel === "whatsapp" ? "k1" : "k2", channel)]);
    assert.deepEqual(
      [late.w.wa.length, late.w.sms.length],
      [0, 0],
      `REGRESSION: a ${channel} send begun a second before the yield ran past the function`,
    );
    assert.equal(late.t.broadcast_recipients[0].state, "queued", "never claimed, so never 'outcome unknown'");
    assert.deepEqual(
      late.w.later.map(([kind, dueAt, payload]) => [kind, dueAt.getTime() <= Date.now(), payload]),
      [["broadcast_send", true, { broadcast_id: "b1" }]],
      "the next batch, due now, and not a stall: nothing failed to be read",
    );
  }
  // An email is bounded by what is left of the function (sendBy), so it still goes at that moment; the WhatsApp person
  // after it (a batch goes in the order of its people's ids) is the next batch's.
  const mixed = await run(
    1_000,
    [recipient("k3", "email"), recipient("k4", "whatsapp")],
    [...people(), person("k4", { phone_e164: "+15551230004", display_name: "Di Prima" })],
  );
  assert.equal(mixed.w.posted.length, 1, "the email left");
  assert.deepEqual(
    mixed.t.broadcast_recipients.map((r) => [r.contact_id, r.state]),
    [
      ["k3", "sent"],
      ["k4", "queued"],
    ],
  );
  assert.equal(mixed.w.wa.length, 0);
  // With the wire's timeout and the settle still inside the room (the yield ten seconds away), both go.
  const early = await run(10_000, [recipient("k1", "whatsapp"), recipient("k2", "sms")]);
  assert.deepEqual([early.w.wa.length, early.w.sms.length], [1, 1]);
  assert.deepEqual(
    early.t.broadcast_recipients.map((r) => r.state),
    ["sent", "sent"],
  );
});

test("a WhatsApp wire that could not be bound at the send (the number a person wrote to, of a workspace's two) gives the person back to the queue: nothing left, so never 'outcome unknown'", async () => {
  const t = world({ broadcast_recipients: [recipient("k1", "whatsapp")] });
  const w = context(t);
  // The job runner's wire reads at each send which number the person wrote to, and that number's credentials.
  w.ctx.wire.whatsapp = async () => {
    throw new WireUnavailableError("whatsapp", "vault unavailable");
  };
  try {
    await dispatchJob(w.ctx, JOB);
  } finally {
    w.restore();
  }
  assert.deepEqual(
    t.broadcast_recipients.map((r) => [r.contact_id, r.state, r.reason]),
    [["k1", "queued", "not_taken"]],
    "REGRESSION: the claim stood as outcome unknown for a message that never left",
  );
  assert.equal(t.broadcasts[0].state, "sending", "the run waits, as for a provider it could not reach");
  assert.deepEqual(
    w.later.map(([kind, , payload]) => [kind, payload]),
    [["broadcast_send", { broadcast_id: "b1", waits: 1 }]],
  );
});

test("a resumed run never sends an email twice: the row it already sent is found by the run's id, and the person is marked from it", async () => {
  const t = world({ broadcast_recipients: [recipient("k3", "email")] });
  const first = context(t);
  try {
    await dispatchJob(first.ctx, JOB);
  } finally {
    first.restore();
  }
  assert.equal(first.posted.length, 1);
  // The run died after the wire and before its own bookkeeping: the person reads as queued again.
  t.broadcast_recipients[0].state = "queued";
  t.broadcast_recipients[0].sent_at = null;
  t.broadcast_recipients[0].message_id = null;
  t.broadcasts[0].state = "sending";
  const again = context(t);
  try {
    await dispatchJob(again.ctx, JOB);
  } finally {
    again.restore();
  }
  assert.equal(again.posted.length, 0, "nothing goes to them twice");
  assert.equal(t.messages.filter((m) => m.channel === "email").length, 1);
  assert.equal(t.broadcast_recipients[0].state, "sent");
  assert.equal(t.broadcast_recipients[0].message_id, t.messages[0].id);
});

test("the door holds a text until the line is approved, an email to an address that changed or stopped, and the month's allowance holds each channel on its own", async () => {
  // A line the carriers have not approved: the text is held with the door's reason, and the other two go.
  const pending = world({
    lines: [
      {
        tenant_id: TID,
        messaging_service_sid: "MG1",
        voice_state: "ready",
        sms_state: "pending",
        reg_mock: false,
        created_at: "2026-09-01T00:00:00Z",
      },
    ],
  });
  const a = context(pending);
  try {
    await dispatchJob(a.ctx, JOB);
  } finally {
    a.restore();
  }
  assert.deepEqual(
    pending.broadcast_recipients.map((r) => [r.contact_id, r.state, r.reason ?? null]),
    [
      ["k1", "sent", null],
      ["k2", "skipped", "sms_line_not_active"],
      ["k3", "sent", null],
    ],
  );
  assert.equal(a.sms.length, 0, "the text wire is never asked for a line that is not approved");
  // An address on the never-again list: the row is canceled at the door with its reason, and nothing is sent.
  const stopped = world({
    contacts: people().map((c) => (c.id === "k3" ? { ...c, email_suppressed_at: "2026-09-01T00:00:00Z" } : c)),
  });
  const b = context(stopped);
  try {
    await dispatchJob(b.ctx, JOB);
  } finally {
    b.restore();
  }
  assert.deepEqual(
    [stopped.broadcast_recipients[2].state, stopped.broadcast_recipients[2].reason],
    ["skipped", "email_suppressed"],
  );
  assert.equal(b.posted.length, 0);
  assert.equal(
    stopped.messages.find((m) => m.channel === "email").status,
    "canceled",
    "its row says why it never left",
  );
  // The allowance: texts used up hold the text and nobody else; emails likewise. Never moved to another channel.
  // Cy has a uuid for an id here: a broadcast's email is the business's news, an offer at the door (decision D2), whose link out
  // is sealed for the person (channels signUnsubscribeToken).
  const CY = "00000000-0000-4000-8000-000000000003";
  for (const [month, held] of [
    [500, ["k2"]],
    [2000, [CY]],
  ]) {
    // A broadcast's run, which the month counts (a visit's message that offers nothing is not held by it: heldByAllowance).
    // Cy's yes covers email: a broadcast's email of the business's news asks it (decision D1), and this case is the month's.
    const contacts = people().map((c) =>
      c.id === "k3" ? { ...c, id: CY, consent_channels: ["whatsapp", "sms", "email"] } : c,
    );
    const t = world({
      contacts,
      broadcast_recipients: [recipient("k1", "whatsapp"), recipient("k2", "sms"), recipient(CY, "email")],
    });
    t.broadcasts[0] = {
      ...t.broadcasts[0],
      playbook_id: null,
      audience: { kind: "everyone", id: null, label: "Everyone" },
    };
    const c = context(t, { monthSent: month, campaigns: LANE });
    try {
      await dispatchJob(c.ctx, JOB);
    } finally {
      c.restore();
    }
    // The rpc answers the same count for both channels here, so each is judged against its own allowance.
    const skipped = t.broadcast_recipients.filter((r) => r.state === "skipped").map((r) => [r.contact_id, r.reason]);
    assert.ok(
      skipped.every(([, reason]) => reason === "month_allowance"),
      JSON.stringify(skipped),
    );
    assert.ok(
      skipped.some(([id]) => held.includes(id)),
      `${month}: ${JSON.stringify(skipped)}`,
    );
    assert.equal(c.wa.length, 1, "WhatsApp is never held for Chanlytics' allowance");
  }
});

test("two runs of one broadcast that overlap send each person once: the claim takes a person only while they are queued, and the one that lost writes them no row", async () => {
  const t = world({ broadcast_recipients: [recipient("k2", "sms"), recipient("k3", "email")] });
  t.broadcasts[0].state = "sending";
  const w = context(t);
  try {
    // Both read the same two people queued; only the first claim of each is the compare-and-set that wins.
    await Promise.all([dispatchJob(w.ctx, JOB), dispatchJob(w.ctx, JOB)]);
  } finally {
    w.restore();
  }
  assert.equal(w.sms.length, 1, "one text, not two");
  assert.equal(w.posted.length, 1, "one email, not two");
  assert.deepEqual(
    t.messages.filter((m) => m.channel === "email").map((m) => m.status),
    ["sent"],
    "one row for the email, and the run that lost the claim wrote none that is left queued",
  );
  assert.deepEqual(
    t.broadcast_recipients.map((r) => [r.contact_id, r.state]),
    [
      ["k2", "sent"],
      ["k3", "sent"],
    ],
  );
});

test("a door that throws before the wire leaves no email queued: the row it was written for is withdrawn, and the claim stands", async () => {
  const t = world({ broadcast_recipients: [recipient("k3", "email")] });
  const w = context(t);
  // The door's read of the thread fails (a blip), as it throws rather than guess at a person's consent.
  const from = w.ctx.db.from;
  w.ctx.db.from = (table) => {
    const q = from(table);
    if (table !== "conversations") return q;
    return new Proxy(q, {
      get(target, key) {
        if (key !== "select") return target[key];
        return (cols, o) =>
          /paused_until/.test(String(cols))
            ? { eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: { message: "blip" } }) }) }) }
            : target.select(cols, o);
      },
    });
  };
  try {
    await assert.rejects(dispatchJob(w.ctx, JOB), /cannot read the wire/);
  } finally {
    w.restore();
  }
  assert.equal(w.posted.length, 0, "nothing left");
  assert.deepEqual(
    t.messages.filter((m) => m.channel === "email").map((m) => [m.status, m.error?.reason ?? null]),
    [["canceled", "not_taken"]],
    "the row is withdrawn, not left queued to count against the month",
  );
  assert.deepEqual(
    t.broadcast_recipients.map((r) => [r.state, r.reason]),
    [["failed", "outcome_unknown"]],
    "the claim stands: nobody knows the door did not reach the wire",
  );
});

/** The email and text versions of the reminder as the workspace writes them: approved at once, with no WhatsApp row beside them. */
const ownRows = (category) => [
  template("sms", { source: "chanlytics", category, components: [{ type: "BODY", text: VISIT_WORDS }] }),
  template("email", {
    source: "chanlytics",
    category,
    components: [
      { type: "HEADER", format: "TEXT", text: "Your visit, {{1}}" },
      { type: "BODY", text: VISIT_WORDS },
    ],
  }),
];

test("a message with no WhatsApp row goes by text and by email to the people who said yes only to messages, through the real job and door, and nobody is skipped for the row it has not got", async () => {
  const t = world({
    templates: ownRows("utility"),
    broadcast_recipients: [recipient("k2", "sms"), recipient("k3", "email")],
  });
  const w = context(t);
  try {
    await dispatchJob(w.ctx, JOB);
  } finally {
    w.restore();
  }
  assert.deepEqual(
    t.broadcast_recipients.map((r) => [r.contact_id, r.channel, r.state, r.reason ?? null]),
    [
      ["k2", "sms", "sent", null],
      ["k3", "email", "sent", null],
    ],
  );
  assert.equal(t.broadcasts[0].state, "sent");
  assert.equal(w.wa.length, 0, "no WhatsApp message, no WhatsApp number asked for");
  assert.deepEqual(
    w.sms.map((s) => [s.to, s.p.body]),
    [["+15551230002", "Hi Bo, your visit is tomorrow at 2:00 PM.\nReply STOP to opt out"]],
  );
  assert.equal(w.posted.length, 1);
  assert.equal(w.posted[0].body.subject, "Your visit, Cy");
});

test("the category of a message with no WhatsApp row is its own rows': filed as an offer, a text of it is refused at the door, which asks it as an offer: texts carry none", async () => {
  const t = world({
    templates: ownRows("marketing"),
    broadcast_recipients: [recipient("k2", "sms")],
  });
  const w = context(t);
  try {
    await dispatchJob(w.ctx, JOB);
  } finally {
    w.restore();
  }
  assert.equal(w.sms.length, 0, "nothing left");
  assert.deepEqual(
    t.broadcast_recipients.map((r) => [r.contact_id, r.state, r.reason ?? null]),
    [["k2", "skipped", "sms_carries_no_promotions"]],
    "judged as an offer by the door, and not as a message about their visit",
  );
});
