/**
 * What the send door asks of a cold email (00424 outreach_mailbox_facts, over 00177's and 00181's lead facts), proved on
 * the database: the lead's stage (the one still being written to wins), the never-again list by the finder's own hash,
 * whether the person wrote back, and the mailbox the business connected that the From is, with its day
 * (mailbox_capacity, proved in mailbox-connections.db.test.mjs). Local stack only.
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
      ? "refusing a database that is not on this machine: this suite makes workspaces"
      : false;

let db;
let A;
let B;
let person;
const stamp = Date.now().toString(36);
const HOST = `getharbor-${stamp}.example`;
const FROM = `sam@${HOST}`;
const TO = `owner-${stamp}@fixture-facts.example`;
const ok = (res) => {
  assert.equal(res.error, null, res.error?.message);
  return res.data;
};
const facts = async (over = {}) =>
  ok(
    await db.rpc("outreach_mailbox_facts", {
      p_tenant_id: A,
      p_contact_id: person,
      p_to: TO,
      p_from: FROM,
      ...over,
    }),
  );

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  A = ok(
    await db
      .from("tenants")
      .insert({ slug: `facts-a-${stamp}`, name: "Facts A" })
      .select("id")
      .single(),
  ).id;
  B = ok(
    await db
      .from("tenants")
      .insert({ slug: `facts-b-${stamp}`, name: "Facts B" })
      .select("id")
      .single(),
  ).id;
  person = ok(await db.from("contacts").insert({ tenant_id: A, email: TO }).select("id").single()).id;
  ok(
    await db.from("mailbox_connections").insert({
      tenant_id: A,
      provider: "google",
      provider_account: `acct-${stamp}`,
      address: FROM,
      host: HOST,
      from_name: "Sam at Harbor",
    }),
  );
});
after(async () => {
  if (skip) return;
  for (const t of [A, B].filter(Boolean)) await db.from("tenants").delete().eq("id", t);
});

let n = 0;
const lead = (stage, over = {}) =>
  db
    .from("leads")
    .insert({
      tenant_id: A,
      place_id: `ChIJfixtureFacts${stamp}${++n}`,
      business_name: "Fixture Harbor",
      city: "Austin",
      region: "TX",
      email: TO,
      email_state: "ok",
      stage,
      contact_id: person,
      ...(stage === "converted" ? { converted_at: new Date().toISOString() } : {}),
      ...(stage === "archived" ? { closed_reason: "not_a_fit" } : {}),
      ...over,
    })
    .select("id")
    .single();

test(
  "a person the finder never found has no lead; the one still being written to wins over one closed",
  { skip },
  async () => {
    assert.equal((await facts()).lead_stage, null);
    ok(await lead("archived"));
    assert.equal((await facts()).lead_stage, "archived");
    ok(await lead("ready"));
    assert.equal((await facts()).lead_stage, "ready", "a ready lead beside an archived one reads ready");
  },
);

test(
  "the mailbox the From is, by its address in any case or spacing, with its day; another workspace's, or another address, is none",
  { skip },
  async () => {
    const f = await facts({ p_from: `  ${FROM.toUpperCase()} ` });
    assert.equal(f.mailbox.address, FROM);
    assert.equal(f.mailbox.state, "connected");
    assert.deepEqual(
      [f.mailbox.daily_cap, f.mailbox.customer_domain, f.mailbox.sent_days, f.mailbox.sent_today],
      [40, false, 0, 0],
    );
    assert.ok(f.mailbox.clean_since, "the ramp's clock, which the cap reads");
    assert.equal((await facts({ p_tenant_id: B })).mailbox, null);
    assert.equal((await facts({ p_from: `dana@${HOST}` })).mailbox, null);
  },
);

test("an address on the never-again list reads suppressed, in any case or spacing", { skip }, async () => {
  assert.equal((await facts()).suppressed, false);
  ok(
    await db.rpc("set_email_marketing", {
      p_tenant_id: A,
      p_contact_id: person,
      p_state: "opted_out",
      p_source: "unsubscribe",
      p_message_id: null,
      p_evidence: null,
    }),
  );
  assert.equal((await facts()).suppressed, true);
  assert.equal((await facts({ p_to: `  ${TO.toUpperCase()} ` })).suppressed, true);
});

test(
  "no one without the service role may ask it: it is the send door's question",
  { skip: skip || (!process.env.SUPABASE_ANON_KEY && "no SUPABASE_ANON_KEY in env") },
  async () => {
    const anon = process.env.SUPABASE_ANON_KEY;
    const pub = createClient(URL_, anon, { auth: { persistSession: false } });
    const r = await pub.rpc("outreach_mailbox_facts", {
      p_tenant_id: A,
      p_contact_id: person,
      p_to: TO,
      p_from: FROM,
    });
    assert.ok(r.error, "refused without the service role");
  },
);

/** A person of workspace A, with an address of their own, for a case that must start from nobody having written. */
const someone = async (tenant = A) =>
  ok(
    await db
      .from("contacts")
      .insert({ tenant_id: tenant, email: `someone-${crypto.randomUUID()}@fixture-facts.example` })
      .select("id")
      .single(),
  ).id;

/** The person's thread (one per person in a workspace), made on first use. */
const threadOf = async (contact, tenant = A) =>
  ok(await db.from("conversations").select("id").eq("tenant_id", tenant).eq("contact_id", contact).maybeSingle())?.id ??
  ok(await db.from("conversations").insert({ tenant_id: tenant, contact_id: contact }).select("id").single()).id;

/**
 * One message the person sent, as the intake keeps it: sender customer, received, and for an email the claim
 * classifyReceived made (null: a row kept before claims were recorded, with no key at all) and the ids it answers.
 */
async function wrote({
  channel = "email",
  claim = "person",
  tenant = A,
  contact = person,
  inReplyTo,
  references,
} = {}) {
  const email = {
    subject: "Re: Your moving quotes",
    from: TO,
    ...(claim === null ? {} : { claim }),
    ...(inReplyTo ? { in_reply_to: inReplyTo } : {}),
    ...(references ? { references } : {}),
  };
  ok(
    await db.from("messages").insert({
      tenant_id: tenant,
      conversation_id: await threadOf(contact, tenant),
      channel,
      direction: "inbound",
      sender: "customer",
      type: "text",
      body: "Thanks, not for us.",
      status: "received",
      meta: channel === "email" ? { email } : {},
    }),
  );
}

/** One email sent to the person, stamped with the Message-ID its receipt named (00128 stamp_email_sent). */
async function mailed(contact) {
  const rfc = `<${crypto.randomUUID()}@getharbor.example>`;
  ok(
    await db.from("messages").insert({
      tenant_id: A,
      conversation_id: await threadOf(contact),
      channel: "email",
      direction: "outbound",
      sender: "ai",
      type: "text",
      body: "Saw your shop on the map.",
      status: "sent",
      meta: { email: { subject: "Your moving quotes", message_id: rfc } },
    }),
  );
  return rfc;
}

const wroteBack = async (contact) => (await facts({ p_contact_id: contact })).wrote_back;

test(
  "a person who wrote back, on any channel, has written back; an out-of-office or another workspace's thread has not (00181)",
  { skip },
  async () => {
    // Only what the business sent so far: nobody has written.
    assert.equal(await wroteBack(person), false);
    await wrote({ claim: "auto_reply" });
    await wrote({ tenant: B, contact: await someone(B) });
    assert.equal(await wroteBack(person), false, "a responder, and a person of another workspace, are not them");
    await wrote({ channel: "whatsapp" });
    assert.equal(await wroteBack(person), true, "a WhatsApp message is a person writing back");
  },
);

test(
  "an email with a list's or a program's headers is a person's too, and so is one kept before claims were recorded (00181)",
  { skip },
  async () => {
    // A helpdesk or a CRM sends a person's "no thanks" with List-Id or Auto-Submitted on it.
    const helpdesk = await someone();
    await wrote({ contact: helpdesk, claim: "automated" });
    assert.equal(await wroteBack(helpdesk), true);
    const older = await someone();
    await wrote({ contact: older, claim: null });
    assert.equal(await wroteBack(older), true, "no claim is a person's");
  },
);

test(
  "a reply from another address that answers or cites an email sent to them is their writing back; an out-of-office is not (00181)",
  { skip },
  async () => {
    // Written at info@, answered from the owner's own address: the intake files it under the owner.
    const info = await someone();
    const first = await mailed(info);
    const nudge = await mailed(info);
    assert.equal(await wroteBack(info), false);
    const owner = await someone();
    await wrote({ contact: owner, claim: "auto_reply", inReplyTo: first, references: [first] });
    await wrote({
      contact: owner,
      inReplyTo: "<unrelated@elsewhere.example>",
      references: ["<unrelated@elsewhere.example>"],
    });
    assert.equal(await wroteBack(info), false, "an out-of-office, or a reply to something else, is not an answer");
    await wrote({ contact: owner, inReplyTo: nudge, references: [first, nudge] });
    assert.equal(await wroteBack(info), true, "an answer to the nudge");

    // Forwarded inside the business and answered by someone else: it names only the forward, and cites ours.
    const shop = await someone();
    const ours = await mailed(shop);
    await wrote({
      contact: await someone(),
      inReplyTo: "<the-forward@getharbor-shop.example>",
      references: [ours, "<the-forward@getharbor-shop.example>"],
    });
    assert.equal(await wroteBack(shop), true, "cited after a forward");
  },
);

test(
  "a call they made to the business is writing back; a call the business made is not (00181)",
  { skip },
  async () => {
    const caller = await someone();
    const call = (direction) => ({
      tenant_id: A,
      contact_id: caller,
      retell_call_id: `call_${crypto.randomUUID()}`,
      direction,
      status: "ended",
    });
    ok(await db.from("calls").insert(call("outbound")));
    assert.equal(await wroteBack(caller), false);
    ok(await db.from("calls").insert(call("inbound")));
    assert.equal(await wroteBack(caller), true);
  },
);
