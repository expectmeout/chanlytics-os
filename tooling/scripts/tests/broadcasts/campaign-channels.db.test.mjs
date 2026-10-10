/**
 * A campaign goes by the channels it ticks (00298), on a real Postgres. One message, every channel, step 3: a playbook
 * and a run carry the channels they may go by (WhatsApp alone by default, so nothing made before changes), each person on
 * a run carries the channel they are reached on, the run is assembled whole with both, the People list says the channel
 * a person last wrote on, and the month's campaign messages on a channel are counted for the allowance.
 *
 *   - the columns' defaults, and each CHECK: an unknown channel, a duplicate and an empty list refused;
 *   - assemble_broadcast keeps the run's channels and each person's channel, refuses a person on a channel the run does
 *     not tick (and one with none, which is WhatsApp, on a run that does not tick it) and a list the CHECK refuses,
 *     leaving nothing half-made, and with no channels given a run is WhatsApp's and its people have none;
 *   - people_list's last_inbound_channel is the wire of the last written message they sent, not of the last message, and
 *     its email_suppressed_at says when an address stopped being sent to, so the pick can leave email for another channel;
 *   - campaign_month_sent counts a workspace's campaign messages on a channel in its own calendar month, only what left,
 *     may have left or waits to go, and not a cold email, a reply, another channel's, or another month's.
 *
 * Runs against the database `supabase start` builds on this machine, never production.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite writes workspaces, runs and messages"
      : false;

let db;
let A;
let template;
const people = {};
const far = () => new Date(Date.now() + 30 * 86_400_000).toISOString();
const ok = (res, what = "the write") => {
  assert.equal(res.error, null, `${what}: ${res.error?.message}`);
  return res.data;
};
/** What the CHECK refuses: a violation, with the constraint named. */
const checkRefused = (res, constraint, why) => {
  assert.ok(res.error, `REGRESSION: accepted: ${why}`);
  assert.equal(res.error.code, "23514", `${why}: ${res.error.message}`);
  assert.match(res.error.message, new RegExp(constraint), why);
};

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  // Chicago, so the month's edges are drawn in the workspace's own zone.
  A = ok(
    await db
      .from("tenants")
      .insert({
        slug: `campaign-channels-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: "campaign-channels",
        timezone: "America/Chicago",
      })
      .select("id")
      .single(),
    "the workspace",
  ).id;
  template = ok(
    await db
      .from("templates")
      .insert({ tenant_id: A, channel: "whatsapp", name: "offer", language: "en_US", meta_status: "approved" })
      .select("id")
      .single(),
    "the template",
  ).id;
  let n = 0;
  const contact = async () => {
    n += 1;
    return ok(
      await db
        .from("contacts")
        .insert({ tenant_id: A, phone_e164: `+1555018${String(n).padStart(4, "0")}` })
        .select("id")
        .single(),
      "a person",
    ).id;
  };
  people.a1 = await contact();
  people.a2 = await contact();
  people.a3 = await contact();
  // Their last written message was by text; their last message of any kind was a WhatsApp reply of ours.
  people.byText = await contact();
  // Their last written message was on WhatsApp; and one who has written nothing.
  people.byWhatsApp = await contact();
  people.silent = await contact();
});

after(async () => {
  if (skip || !A) return;
  await db.from("messages").delete().eq("tenant_id", A);
  await db.from("jobs").delete().eq("tenant_id", A);
  await db.from("tenants").delete().eq("id", A);
});

const run = (name, over = {}) => ({
  name,
  template_id: template,
  template_name: "offer",
  template_language: "en_US",
  params: [{ kind: "first_name" }],
  audience: { kind: "everyone", id: null, label: "Everyone" },
  state: "scheduled",
  scheduled_for: far(),
  recipient_count: 2,
  ...over,
});
const assemble = (r, recipients, sendAt) =>
  db.rpc("assemble_broadcast", {
    p_tenant: A,
    p_run: r,
    p_recipients: recipients,
    ...(sendAt ? { p_send_at: sendAt } : {}),
  });

/** What the database holds of a run by its name: the row, its people with their channels, its jobs. */
async function heldFor(name) {
  const rows = ok(await db.from("broadcasts").select("id, channels").eq("tenant_id", A).eq("name", name));
  const ids = rows.map((r) => r.id);
  const recips = ids.length
    ? ok(await db.from("broadcast_recipients").select("contact_id, channel").in("broadcast_id", ids))
    : [];
  const jobs = ok(await db.from("jobs").select("payload").eq("tenant_id", A).eq("kind", "broadcast_send")).filter((j) =>
    ids.includes(j.payload?.broadcast_id),
  );
  return { rows, recips, jobs };
}
const channelOf = (held, contact) => held.recips.find((r) => r.contact_id === contact)?.channel;

test("a playbook and a run default to WhatsApp alone, and each CHECK refuses what is not the three channels, each once", async (t) => {
  if (skip) return t.skip(skip);
  const playbook = ok(
    await db
      .from("playbooks")
      .insert({
        tenant_id: A,
        name: "Reminders",
        trigger: "quiet_30",
        template_id: template,
        template_name: "offer",
        template_language: "en_US",
        policy_class: "reengage",
        state: "paused",
      })
      .select("id, channels")
      .single(),
    "a playbook that names no channels",
  );
  assert.deepEqual(playbook.channels, ["whatsapp"], "nothing made before changes: WhatsApp alone");
  const kept = await db
    .from("playbooks")
    .update({ channels: ["email", "whatsapp"] })
    .eq("id", playbook.id)
    .select("channels");
  assert.deepEqual(
    ok(kept, "ticks edited").at(0).channels,
    ["email", "whatsapp"],
    "kept as ticked, in the order given",
  );

  const broadcast = (channels) =>
    db.from("broadcasts").insert({
      tenant_id: A,
      name: "Run",
      template_id: template,
      template_name: "offer",
      template_language: "en_US",
      state: "pending_approval",
      scheduled_for: far(),
      ...(channels ? { channels } : {}),
    });
  assert.equal((await broadcast()).error, null, "a run that names none");
  const made = ok(await db.from("broadcasts").select("channels").eq("tenant_id", A).eq("name", "Run"));
  assert.deepEqual(made.at(0).channels, ["whatsapp"]);
  assert.equal((await broadcast(["whatsapp", "sms", "email"])).error, null, "all three, once each");

  for (const [bad, why] of [
    [["fax"], "a channel there is none of"],
    [["whatsapp", "carrier_pigeon"], "one good and one that is not"],
    [["whatsapp", "whatsapp"], "a channel twice"],
    [["whatsapp", "sms", "sms"], "a channel twice among others"],
    [[], "none at all"],
    [["WhatsApp"], "a channel in another case"],
  ]) {
    checkRefused(
      await db.from("playbooks").update({ channels: bad }).eq("id", playbook.id).select("id"),
      "playbooks_channels_check",
      `a playbook with ${why}`,
    );
    checkRefused(await broadcast(bad), "broadcasts_channels_check", `a run with ${why}`);
  }
  assert.deepEqual(
    ok(await db.from("playbooks").select("channels").eq("id", playbook.id).single()).channels,
    ["email", "whatsapp"],
    "a refused edit leaves the ticks as they were",
  );
});

test("a recipient has no channel (a person written before the channels, who is WhatsApp's) or one of the three", async (t) => {
  if (skip) return t.skip(skip);
  const id = ok(
    await db
      .from("broadcasts")
      .insert({
        tenant_id: A,
        name: "People",
        template_id: template,
        template_name: "offer",
        template_language: "en_US",
        state: "pending_approval",
        scheduled_for: far(),
      })
      .select("id")
      .single(),
  ).id;
  const person = (contact, channel) =>
    db
      .from("broadcast_recipients")
      .insert({ broadcast_id: id, contact_id: contact, tenant_id: A, ...(channel === undefined ? {} : { channel }) })
      .select("channel");
  assert.equal(ok(await person(people.a1)).at(0).channel, null, "none given is none: a person before the channels");
  for (const [contact, channel] of [
    [people.a2, "email"],
    [people.a3, "sms"],
    [people.byText, "whatsapp"],
  ])
    assert.equal(ok(await person(contact, channel)).at(0).channel, channel);
  checkRefused(
    await person(people.byWhatsApp, "fax"),
    "broadcast_recipients_channel_check",
    "a channel there is none of",
  );
  checkRefused(await person(people.silent, "Email"), "broadcast_recipients_channel_check", "a channel in another case");
});

test("a run is assembled with the channels it ticks and each person's channel, kept as given", async (t) => {
  if (skip) return t.skip(skip);
  const when = far();
  const { data: id, error } = await assemble(
    run("Mixed", { scheduled_for: when, recipient_count: 3, channels: ["whatsapp", "email"] }),
    [
      { contact_id: people.a1, facts: null, channel: "whatsapp" },
      { contact_id: people.a2, facts: { visit_when: "tomorrow at 3" }, channel: "email" },
      { contact_id: people.a3, facts: null, channel: "email" },
    ],
    when,
  );
  assert.equal(error, null, error?.message);
  const held = await heldFor("Mixed");
  assert.deepEqual(held.rows, [{ id, channels: ["whatsapp", "email"] }], "the run's ticks, in the order given");
  assert.equal(channelOf(held, people.a1), "whatsapp");
  assert.equal(channelOf(held, people.a2), "email");
  assert.equal(channelOf(held, people.a3), "email");
  assert.equal(held.jobs.length, 1, "and its send job, as ever");
});

test("a person on a channel the run does not tick refuses the whole run: no row, no people, no job", async (t) => {
  if (skip) return t.skip(skip);
  const cases = [
    [
      "Off WhatsApp",
      ["whatsapp"],
      [
        { contact_id: people.a1, channel: "whatsapp" },
        { contact_id: people.a2, channel: "sms" },
      ],
    ],
    ["Off email", ["email", "sms"], [{ contact_id: people.a1, channel: "whatsapp" }]],
    // None is WhatsApp's: a run that does not tick WhatsApp takes no person without a channel.
    ["None, no WhatsApp", ["email"], [{ contact_id: people.a1 }]],
  ];
  for (const [name, channels, recipients] of cases) {
    const { error } = await assemble(run(name, { channels, recipient_count: recipients.length }), recipients, far());
    assert.ok(error, `${name}: refused`);
    assert.equal(error.code, "22023", `${name}: ${error.message}`);
    assert.match(error.message, /on a channel the run does not tick/, name);
    const held = await heldFor(name);
    assert.deepEqual([held.rows, held.recips, held.jobs], [[], [], []], `${name}: nothing was left half-made`);
  }
});

test("a list of channels the CHECK refuses, or no list, refuses the run whole as well", async (t) => {
  if (skip) return t.skip(skip);
  const one = [{ contact_id: people.a1, channel: "email" }];
  for (const [name, channels] of [
    ["Fax", ["fax"]],
    ["Twice", ["email", "email"]],
    ["Empty", []],
  ]) {
    const { error } = await assemble(run(name, { channels, recipient_count: 1 }), one, far());
    assert.ok(error, `${name}: refused`);
    const held = await heldFor(name);
    assert.deepEqual([held.rows, held.recips, held.jobs], [[], [], []], `${name}: nothing was left half-made`);
  }
  const scalar = await assemble(run("Scalar", { channels: "email", recipient_count: 1 }), one, far());
  assert.ok(scalar.error, "a channel that is not a list is refused");
  assert.deepEqual((await heldFor("Scalar")).rows, []);
});

test("a run that names no channels is WhatsApp's, and its people have none: as every run was before", async (t) => {
  if (skip) return t.skip(skip);
  for (const [name, over] of [
    ["Plain", {}],
    ["Json null", { channels: null }],
  ]) {
    const { error } = await assemble(run(name, over), [
      { contact_id: people.a1, facts: null },
      { contact_id: people.a2 },
    ]);
    assert.equal(error, null, `${name}: ${error?.message}`);
    const held = await heldFor(name);
    assert.deepEqual(
      held.rows.map((r) => r.channels),
      [["whatsapp"]],
      name,
    );
    assert.deepEqual(
      held.recips.map((r) => r.channel),
      [null, null],
      `${name}: nobody has a channel`,
    );
  }
  // And a run that ticks WhatsApp may carry a person with none, beside one with a channel.
  const { error } = await assemble(run("Both", { channels: ["whatsapp", "sms"] }), [
    { contact_id: people.a1 },
    { contact_id: people.a2, channel: "sms" },
  ]);
  assert.equal(error, null, error?.message);
  const held = await heldFor("Both");
  assert.equal(channelOf(held, people.a1), null);
  assert.equal(channelOf(held, people.a2), "sms");
});

test("people_list says the channel a person last wrote on, which is not the channel of the last message", async (t) => {
  if (skip) return t.skip(skip);
  const thread = async (contact) =>
    ok(await db.from("conversations").insert({ tenant_id: A, contact_id: contact }).select("id").single()).id;
  const message = (conversation, contact, channel, direction, created, body) => ({
    tenant_id: A,
    conversation_id: conversation,
    contact_id: contact,
    channel,
    direction,
    sender: direction === "inbound" ? "customer" : "ai",
    type: "text",
    body,
    status: direction === "inbound" ? "received" : "sent",
    created_at: created,
  });
  const texted = await thread(people.byText);
  ok(
    await db
      .from("messages")
      .insert([
        message(texted, people.byText, "whatsapp", "inbound", "2026-09-10T10:00:00Z", "first, on WhatsApp"),
        message(texted, people.byText, "sms", "inbound", "2026-09-10T11:00:00Z", "then, by text"),
        message(texted, people.byText, "whatsapp", "outbound", "2026-09-10T12:00:00Z", "we answered on WhatsApp"),
      ]),
  );
  const wrote = await thread(people.byWhatsApp);
  ok(
    await db
      .from("messages")
      .insert([
        message(wrote, people.byWhatsApp, "sms", "inbound", "2026-09-10T10:00:00Z", "first, by text"),
        message(wrote, people.byWhatsApp, "whatsapp", "inbound", "2026-09-10T11:00:00Z", "then, on WhatsApp"),
      ]),
  );
  const listed = ok(await db.rpc("people_list", { p_tenant_id: A }), "people_list");
  const row = (id) => listed.find((p) => p.id === id);
  assert.equal(row(people.byText).last_inbound_channel, "sms", "the last thing they wrote came by text");
  assert.equal(row(people.byText).last_inbound_text, "then, by text", "the same message as the text the row carries");
  assert.equal(row(people.byWhatsApp).last_inbound_channel, "whatsapp");
  assert.equal(row(people.silent).last_inbound_channel, null, "nothing written, no channel");
  // Their OWN words (00320): their mailbox answering for them, and a call's note, are rows that came in after and
  // are not where they last wrote. The row's text is still the last thing that came in, as it was.
  ok(
    await db.from("messages").insert([
      {
        ...message(texted, people.byText, "email", "inbound", "2026-09-10T13:00:00Z", "I am out of the office."),
        meta: { email: { claim: "auto_reply" } },
      },
      {
        ...message(wrote, people.byWhatsApp, "voice", "inbound", "2026-09-10T13:00:00Z", "They phoned about Saturday."),
        sender: "system",
        type: "call_summary",
        // Named on both rows: one insert of rows with different keys writes null where a row names none.
        meta: {},
      },
    ]),
  );
  const after = ok(await db.rpc("people_list", { p_tenant_id: A }), "people_list");
  const now = (id) => after.find((p) => p.id === id);
  assert.equal(now(people.byText).last_inbound_channel, "sms", "an out-of-office does not make email where they wrote");
  assert.equal(
    now(people.byText).last_inbound_text,
    "I am out of the office.",
    "the last thing that came in, as before",
  );
  assert.equal(now(people.byWhatsApp).last_inbound_channel, "whatsapp", "a call's note is not their writing");
  // One person's row alone, by the same door.
  const alone = ok(await db.rpc("people_list", { p_tenant_id: A, p_contact_id: people.byText }), "one person");
  assert.deepEqual(
    alone.map((p) => p.last_inbound_channel),
    ["sms"],
  );
});

test("the two rules a message's meta decides are said the same way in TypeScript and in SQL: an automated send, and a person's own words", async (t) => {
  if (skip) return t.skip(skip);
  const { isAutomatedSend, isPersonsWords, EMAIL_CLAIMS } = await import("@chanlytics/contracts");
  // Every shape the column holds or could: the sources a run stamps, every claim the email intake keeps (contracts
  // EMAIL_CLAIMS, iterated, so a claim added there is tried here), and what is absent, empty or of the wrong kind. A pair
  // that disagrees on one of them counts one way on a page and another in a report.
  const metas = [
    {},
    { source: "broadcast" },
    { source: "reach_out" },
    { source: "voice" },
    { source: null },
    { source: 7 },
    ...EMAIL_CLAIMS.map(({ claim }) => ({ email: { claim } })),
    { email: { claim: "a claim no intake writes" } },
    { email: { claim: null } },
    { email: {} },
    { email: "not an object" },
    { email: { claim: "auto_reply" }, source: "broadcast" },
  ];
  for (const meta of metas) {
    const what = JSON.stringify(meta);
    assert.equal(
      ok(await db.rpc("automated_send", { p_meta: meta }), what),
      isAutomatedSend(meta),
      `automated: ${what}`,
    );
    assert.equal(
      ok(await db.rpc("message_is_a_persons_words", { p_meta: meta }), what),
      isPersonsWords(meta),
      `a person's words: ${what}`,
    );
  }
  // Each claim is what EMAIL_CLAIMS marks it, in SQL too: a booking tool's notice and Gmail's forwarding confirmation are
  // no person's words (00373, decision 5), so Reports' replies and People's "last wrote" stop counting them.
  for (const { claim, personsWords } of EMAIL_CLAIMS)
    assert.equal(
      ok(await db.rpc("message_is_a_persons_words", { p_meta: { email: { claim } } }), claim),
      personsWords,
      `SQL marks ${claim} as contracts does`,
    );
  // No meta at all, as a caller may hold it: nobody's campaign, and a person's words.
  assert.deepEqual([isAutomatedSend(null), isPersonsWords(null), isPersonsWords(undefined)], [false, true, true]);
});

test("people_list says when an address stopped being sent to, so the pick can leave email for another channel", async (t) => {
  if (skip) return t.skip(skip);
  const withAddress = async (email) =>
    ok(await db.from("contacts").insert({ tenant_id: A, email }).select("id").single(), "a person by email").id;
  const good = await withAddress(`good-${Date.now()}@example.com`);
  const dead = await withAddress(`dead-${Date.now()}@example.com`);
  const bouncedAt = "2026-09-20T09:00:00.000Z";
  ok(
    await db
      .from("contacts")
      .update({ email_suppressed_at: bouncedAt, email_suppressed_reason: "hard_bounce" })
      .eq("id", dead)
      .eq("tenant_id", A)
      .select("id")
      .single(),
    "the bounce",
  );
  const listed = ok(await db.rpc("people_list", { p_tenant_id: A }), "people_list");
  const row = (id) => listed.find((p) => p.id === id);
  assert.equal(new Date(row(dead).email_suppressed_at).toISOString(), bouncedAt, "when the address stopped");
  assert.equal(row(good).email_suppressed_at, null, "a good address says nothing");
  assert.equal(row(people.silent).email_suppressed_at, null, "nor does a person with no address");
  // One person's row alone, by the same door.
  const alone = ok(await db.rpc("people_list", { p_tenant_id: A, p_contact_id: dead }), "one person");
  assert.deepEqual(
    alone.map((p) => [p.email !== null, p.email_suppressed_at !== null]),
    [[true, true]],
  );
});

test("campaign_month_sent counts the workspace's campaign messages on a channel this month, in its own zone", async (t) => {
  if (skip) return t.skip(skip);
  const thread = ok(
    await db.from("conversations").insert({ tenant_id: A, contact_id: people.silent }).select("id").single(),
  ).id;
  // Chicago is five hours behind UTC in September: its month starts at 05:00Z on the 1st.
  const row = (created, status, error = null, over = {}) => ({
    tenant_id: A,
    conversation_id: thread,
    channel: "email",
    direction: "outbound",
    sender: "system",
    type: "template",
    body: "This month's offer.",
    status,
    error,
    meta: { source: "broadcast" },
    created_at: created,
    ...over,
  });
  ok(
    await db.from("messages").insert([
      row("2026-09-01T04:59:00Z", "sent"), // August, where the workspace is
      row("2026-09-01T05:01:00Z", "sent"),
      row("2026-09-10T12:00:00Z", "delivered"),
      row("2026-09-10T12:00:00Z", "read"),
      row("2026-09-10T12:00:00Z", "queued"), // waits for its job: it will leave
      row("2026-09-10T12:00:00Z", "failed", { outcome: "unknown", http_status: 0 }), // may have left
      row("2026-09-10T12:00:00Z", "failed", { provider: "bounced" }), // left, and bounced
      row("2026-09-10T12:00:00Z", "canceled", { reason: "held" }), // the door said no
      row("2026-09-10T12:00:00Z", "failed", { http_status: 429 }), // never left
      row("2026-09-10T12:00:00Z", "sent", null, { meta: { source: "reach_out" } }), // a cold email, the reach-out's own count
      row("2026-09-10T12:00:00Z", "sent", null, { meta: {}, sender: "ai", type: "text" }), // a reply
      row("2026-09-10T12:00:00Z", "received", null, { direction: "inbound", sender: "customer", type: "text" }), // theirs
      row("2026-09-10T12:00:00Z", "sent", null, { channel: "sms", type: "text" }), // a text
      row("2026-09-10T12:00:00Z", "sent", null, { channel: "whatsapp" }), // a WhatsApp message
    ]),
  );
  const count = async (channel, at) =>
    ok(await db.rpc("campaign_month_sent", { p_tenant_id: A, p_channel: channel, ...(at ? { p_at: at } : {}) }));
  assert.equal(
    await count("email", "2026-09-15T12:00:00Z"),
    6,
    "left, read, queued, unknown outcome, bounced, the 1st at 05:01Z",
  );
  assert.equal(await count("sms", "2026-09-15T12:00:00Z"), 1, "a channel's own");
  assert.equal(await count("whatsapp", "2026-09-15T12:00:00Z"), 1);
  assert.equal(
    await count("email", "2026-09-01T04:00:00Z"),
    1,
    "still August in Chicago: August's one, and none of September's",
  );
  assert.equal(await count("email", "2026-10-01T06:00:00Z"), 0, "a new month, where the workspace is");
  assert.equal(await count("email", "2026-12-15T12:00:00Z"), 0, "a month with none");
  assert.equal(typeof (await count("email")), "number", "no instant is now");
  // A workspace counts its own messages and nobody else's.
  const other = ok(
    await db
      .from("tenants")
      .insert({ slug: `campaign-channels-b-${Date.now()}`, name: "campaign-channels-b", timezone: "America/Chicago" })
      .select("id")
      .single(),
  ).id;
  try {
    const theirs = ok(
      await db.rpc("campaign_month_sent", { p_tenant_id: other, p_channel: "email", p_at: "2026-09-15T12:00:00Z" }),
    );
    assert.equal(theirs, 0);
  } finally {
    await db.from("tenants").delete().eq("id", other);
  }
});
