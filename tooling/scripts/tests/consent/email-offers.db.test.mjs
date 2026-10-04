/**
 * Offers by email, on a real database (One message, every channel, step 4; migration 00299).
 *
 * email-offers.test.mjs holds contracts' rule. This holds the other half, where the facts it reads are kept: the
 * migration's has_relationship is contracts' relationshipOnRecord case by case (over the columns people_list returns);
 * people_list answers the person's answer about offers by email; offers_email_reach counts exactly the people the rule
 * lets an offer reach; the email yes and the "Stop all messages" act each write the ledger entry that says so, once; the
 * gates' counts read the receipts the edge stores, in their windows; the pause is set once and cleared by the back
 * office alone; and none of the service-role doors answers a member. A function body is what reading source cannot prove,
 * so these run against Postgres. Skipped without a local database; never production.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { mayMessageFor, offerGate, relationshipOnRecord, toPersonRowVM, whyNotReceive } from "@chanlytics/contracts";
import { emailOffersPause, offersEmailReach } from "../../../../packages/db/src/repositories/campaigns/email-offers.ts";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite makes workspaces and customers"
      : false;
const skipMember = skip || (!ANON ? "no SUPABASE_ANON_KEY in env: the member's session needs it" : false);

const ok = (res) => {
  assert.equal(res.error, null, res.error?.message);
  return res.data;
};

let db;
let tenantId;
let owner;
const users = [];
let n = 0;
const NOW = new Date();
const ago = (days) => new Date(NOW.getTime() - days * 86_400_000).toISOString();

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  tenantId = ok(
    await db
      .from("tenants")
      .insert({ slug: `email-offers-${Date.now()}`, name: "Email offers" })
      .select("id")
      .single(),
  ).id;
  ok(
    await db.from("mailboxes").insert({
      tenant_id: tenantId,
      local_part: `offers${Date.now().toString(36)}`,
      reply_token: `${Date.now().toString(36)}abcdefghijklmnopqrst`
        .replace(/[^a-z2-7]/g, "a")
        .slice(0, 24)
        .padEnd(24, "a"),
      from_name: "Email offers",
    }),
  );
  if (skipMember) return;
  const email = `email-offers-${Date.now()}@example.com`;
  const password = `pw-${Math.random().toString(36).slice(2)}-Aa1!`;
  const made = await db.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(made.error, null, made.error?.message);
  users.push(made.data.user.id);
  ok(await db.from("memberships").insert({ tenant_id: tenantId, user_id: made.data.user.id, role: "owner" }));
  const client = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const s = await client.auth.signInWithPassword({ email, password });
  assert.equal(s.error, null, s.error?.message);
  owner = client;
});

after(async () => {
  if (skip || !tenantId) return;
  for (const t of [
    "deals",
    "calls",
    "messages",
    "events",
    "conversations",
    "contact_identities",
    "contacts",
    "mailboxes",
  ])
    await db.from(t).delete().eq("tenant_id", tenantId);
  await db.from("tenants").delete().eq("id", tenantId);
  for (const id of users) await db.auth.admin.deleteUser(id).catch(() => {});
});

/**
 * A person with an address, and what they have or have not done: wrote (a message of theirs), called, a deal. `wroteEmail`
 * is an email of theirs the intake read as that claim (person, automated, auto_reply, report): what the intake keeps in
 * meta.email.claim beside the words.
 */
async function person(
  over = {},
  {
    wrote = false,
    wroteMedia = false,
    wroteEmail = null,
    called = false,
    wroteFirst = null,
    deal = false,
    we = false,
  } = {},
) {
  n += 1;
  const email = `person${n}-${Date.now()}@example.com`;
  const contact = ok(
    await db
      .from("contacts")
      .insert({ tenant_id: tenantId, email, display_name: `Person ${n}`, consent: "opted_in", ...over })
      .select("id, email")
      .single(),
  );
  if (wrote || wroteMedia || wroteEmail || we) {
    const conversation = ok(
      await db.from("conversations").insert({ tenant_id: tenantId, contact_id: contact.id }).select("id").single(),
    );
    const message = (direction, extra) => ({
      tenant_id: tenantId,
      conversation_id: conversation.id,
      contact_id: contact.id,
      channel: "whatsapp",
      direction,
      sender: direction === "inbound" ? "customer" : "human",
      type: "text",
      status: direction === "inbound" ? "received" : "sent",
      body: "hello",
      created_at: wroteFirst ?? ago(3),
      ...extra,
    });
    if (wrote) ok(await db.from("messages").insert(message("inbound", { external_id: `wamid.eo-${n}` })));
    if (wroteMedia)
      ok(
        await db
          .from("messages")
          .insert(message("inbound", { type: "media", body: null, external_id: `wamid.eo-m-${n}` })),
      );
    if (we) ok(await db.from("messages").insert(message("outbound", { external_id: `wamid.eo-o-${n}` })));
    if (wroteEmail)
      ok(
        await db.from("messages").insert(
          message("inbound", {
            channel: "email",
            external_id: `rcv.eo-${n}`,
            meta: { email: { subject: "Re: your offer", claim: wroteEmail } },
          }),
        ),
      );
  }
  if (called)
    ok(
      await db.from("calls").insert({
        tenant_id: tenantId,
        contact_id: contact.id,
        retell_call_id: `call-eo-${n}-${Date.now()}`,
        direction: "inbound",
        status: "ended",
        started_at: ago(2),
      }),
    );
  if (deal) ok(await db.from("deals").insert({ tenant_id: tenantId, contact_id: contact.id, stage: "proposed" }));
  return contact;
}

/** The person as People reads them, from the row people_list answers: contracts' own builder, nobody looking. */
async function rowOf(id) {
  const rows = ok(await db.rpc("people_list", { p_tenant_id: tenantId, p_contact_id: id }));
  assert.equal(rows.length, 1);
  return rows[0];
}
const vmOf = (row) => toPersonRowVM(row, "UTC", NOW, null, null);
/** Whether the rule lets an offer by email reach this person, judged from their People row. */
const reachedByRule = (row) =>
  whyNotReceive(
    { consent: vmOf(row).consent, phone: row.phone_e164, email: row.email, emailSuppressed: !!row.email_suppressed_at },
    "marketing",
    "email",
  ) === null;

test(
  "has_relationship is relationshipOnRecord, case by case: wrote, called, a deal; not a message of ours, not a picture with no words, not an address alone",
  { skip },
  async () => {
    const cases = [
      ["an address and nothing else", {}, {}, false],
      ["we wrote and they never did", {}, { we: true }, false],
      ["they wrote", {}, { wrote: true }, true],
      ["they sent a picture with no words (no moment people_list can read)", {}, { wroteMedia: true }, false],
      ["they called", {}, { called: true }, true],
      ["they have a deal", {}, { deal: true }, true],
      ["a deal and a message, both", {}, { deal: true, wrote: true }, true],
      // What a program wrote from their address is not them dealing with the business: the intake's claim says which.
      ["they wrote an email, a person's own words", {}, { wroteEmail: "person" }, true],
      ["an automatic reply from their address (an out-of-office)", {}, { wroteEmail: "auto_reply" }, false],
      ["an automated email from their address (a list's, a form's)", {}, { wroteEmail: "automated" }, false],
      [
        "an automatic reply and a deal: the deal is the relationship",
        {},
        { wroteEmail: "auto_reply", deal: true },
        true,
      ],
      ["an automatic reply and a call: the call is", {}, { wroteEmail: "automated", called: true }, true],
    ];
    for (const [what, over, did, expected] of cases) {
      const c = await person(over, did);
      // The database's reading, the way the send door reads it: a column PostgREST serves with the person.
      const served = ok(await db.from("contacts").select("id, has_relationship").eq("id", c.id).single());
      assert.equal(served.has_relationship, expected, what);
      // Contracts' reading, over the columns people_list returns: the same answer.
      const row = await rowOf(c.id);
      const mine = relationshipOnRecord({
        lastWroteAt: row.last_wrote_at,
        lastInboundCallAt: row.last_inbound_call_at,
        hasDeal: !!row.deal_id,
      });
      assert.equal(mine, served.has_relationship, `${what}: People's row and the database read it the same way`);
      assert.equal(vmOf(row).consent.relationship, expected, `${what}: and the person's page says it`);
    }
  },
);

test(
  "message_is_a_persons_words says no to what a program writes (automated, an automatic reply, a delivery report) and yes to everything else, a message with no claim included; people_list keeps what they last SENT apart from what they last WROTE",
  { skip },
  async () => {
    // The claims the intake stores (meta.email.claim): a person's own words and anything not named are a person's.
    for (const [claim, expected] of [
      ["person", true],
      ["automated", false],
      ["auto_reply", false],
      ["report", false],
      ["something a later release adds", true],
    ])
      assert.equal(ok(await db.rpc("message_is_a_persons_words", { p_meta: { email: { claim } } })), expected, claim);
    assert.equal(ok(await db.rpc("message_is_a_persons_words", { p_meta: {} })), true, "no claim kept");
    assert.equal(
      ok(await db.rpc("message_is_a_persons_words", { p_meta: null })),
      true,
      "a message with no meta at all",
    );
    assert.equal(
      ok(await db.rpc("message_is_a_persons_words", { p_meta: { email: { subject: "no claim kept" } } })),
      true,
      "an email stored before claims were",
    );
    // An automatic reply is the thread's last inbound (the page shows it, and a reply can answer it), and no relationship.
    const auto = await person({}, { wroteEmail: "auto_reply" });
    const row = await rowOf(auto.id);
    assert.ok(row.last_inbound_at, "it is the last thing they sent");
    assert.equal(row.last_wrote_at, null, "and nothing they wrote");
    // A person's words after it are what they wrote; a program's after those change nothing.
    const mixed = await person({}, { wroteEmail: "person", wroteFirst: ago(5) });
    ok(
      await db.from("messages").insert({
        tenant_id: tenantId,
        conversation_id: ok(await db.from("conversations").select("id").eq("contact_id", mixed.id).single()).id,
        contact_id: mixed.id,
        channel: "email",
        direction: "inbound",
        sender: "customer",
        type: "text",
        status: "received",
        body: "I am away until Monday",
        external_id: `rcv.eo-late-${n}`,
        created_at: ago(1),
        meta: { email: { claim: "auto_reply" } },
      }),
    );
    const after = await rowOf(mixed.id);
    assert.ok(
      Date.parse(after.last_inbound_at) > Date.parse(after.last_wrote_at),
      "the reply came last, the words before it",
    );
    assert.ok(
      Math.abs(Date.parse(after.last_wrote_at) - Date.parse(ago(5))) < 60_000,
      "what they wrote is the earlier one",
    );
  },
);

test(
  "the door reads has_relationship with the person, embedded in the thread it re-reads (wireRowOf's query)",
  { skip },
  async () => {
    const c = await person({ marketing_consent: "unknown" }, { wrote: true });
    const conversation = ok(await db.from("conversations").select("id").eq("contact_id", c.id).single());
    const read = ok(
      await db
        .from("conversations")
        .select("contact_id, contacts (consent, email_marketing, has_relationship, email)")
        .eq("id", conversation.id)
        .single(),
    );
    assert.deepEqual(read.contacts, {
      consent: "opted_in",
      email_marketing: "unknown",
      has_relationship: true,
      email: c.email,
    });
  },
);

test(
  "people_list answers the person's answer about offers by email, and the rule judges the row it returns",
  { skip },
  async () => {
    const cases = [
      ["a customer", {}, { wrote: true }, null],
      [
        "asked for offers by email, no relationship",
        { email_marketing: "opted_in", email_marketing_source: "customer_message", email_marketing_updated_at: ago(1) },
        {},
        null,
      ],
      [
        "unsubscribed, though a customer",
        { email_marketing: "opted_out", email_marketing_source: "unsubscribe", email_marketing_updated_at: ago(1) },
        { wrote: true },
        "unsubscribed",
      ],
      ["an address alone", {}, {}, "no_yes"],
      ["a STOP", { consent: "opted_out", dnc: true }, { wrote: true }, "stopped"],
      [
        "a dead address",
        { email_suppressed_at: ago(1), email_suppressed_reason: "hard_bounce" },
        { wrote: true },
        "no_address",
      ],
    ];
    for (const [what, over, did, why] of cases) {
      const c = await person(over, did);
      const row = await rowOf(c.id);
      assert.equal(row.email_marketing, over.email_marketing ?? "unknown", `${what}: the answer`);
      const consent = vmOf(row).consent;
      assert.equal(consent.emailMarketing, over.email_marketing ?? "unknown");
      const judged = whyNotReceive(
        { consent, phone: null, email: row.email, emailSuppressed: !!row.email_suppressed_at },
        "marketing",
        "email",
      );
      assert.equal(judged, why, what);
      // The one predicate, asked straight: the same person, the same answer.
      assert.equal(
        mayMessageFor(
          {
            consent: row.consent,
            dnc: row.dnc,
            email_marketing: row.email_marketing,
            has_relationship: consent.relationship,
          },
          "marketing",
          { proactive: true, channel: "email" },
        ).ok,
        why === null || why === "no_address",
        what,
      );
    }
  },
);

test("offers_email_reach counts exactly the people the rule lets an offer by email reach", { skip }, async () => {
  const before = await offersEmailReach(db, tenantId);
  const made = [
    await person({}, { wrote: true }),
    await person({}, { called: true }),
    await person({}, { deal: true }),
    await person({ email_marketing: "opted_in" }),
    await person({ email_marketing: "opted_out" }, { wrote: true }),
    await person({}),
    await person({ consent: "opted_out" }, { wrote: true }),
    await person({ dnc: true }, { wrote: true }),
    await person({ email_suppressed_at: ago(1), email_suppressed_reason: "complaint" }, { wrote: true }),
    await person({ email: null }, { wrote: true }),
    await person({ erased_at: ago(1) }, { wrote: true }),
    // Not a relationship: a program wrote from their address.
    await person({}, { wroteEmail: "auto_reply" }),
    await person({}, { wroteEmail: "automated" }),
    // A recorded no to offers on WhatsApp bars an offer by email too (contracts' mayMessageFor), a yes by email included.
    await person({ marketing_consent: "opted_out" }, { wrote: true }),
    await person({ marketing_consent: "opted_out", email_marketing: "opted_in" }),
  ];
  const rule = [];
  for (const c of made) {
    const row = await rowOf(c.id).catch(() => null);
    rule.push(row ? reachedByRule(row) : false);
  }
  const reached = rule.filter(Boolean).length;
  assert.equal(reached, 4, "a customer who wrote, who called, who has a deal, and the one who asked: nobody else");
  assert.equal(
    (await offersEmailReach(db, tenantId)) - before,
    reached,
    "the database counts what the rule lets through",
  );
  // Under a member's row security, as Setup reads it on their session.
  if (!skipMember) assert.equal(await offersEmailReach(owner, tenantId), await offersEmailReach(db, tenantId));
});

test(
  "the email yes: opted_in once, with the channel and the words as evidence; a yes in writing only; the person erased is left alone; a no and a yes after it are both the person's own",
  { skip },
  async () => {
    const c = await person({}, { wrote: true });
    const say = (source = "customer_message", evidence = { channel: "sms", words: "YES OFFERS" }) =>
      db.rpc("set_email_offers_yes", {
        p_tenant_id: tenantId,
        p_contact_id: c.id,
        p_source: source,
        p_evidence: evidence,
      });
    const first = ok(await say());
    assert.deepEqual(first, { changed: true, found: true });
    const after1 = ok(
      await db
        .from("contacts")
        .select("email_marketing, email_marketing_source, email_marketing_updated_at")
        .eq("id", c.id)
        .single(),
    );
    assert.deepEqual([after1.email_marketing, after1.email_marketing_source], ["opted_in", "customer_message"]);
    assert.ok(after1.email_marketing_updated_at);
    const events = () =>
      db
        .from("events")
        .select("data")
        .eq("tenant_id", tenantId)
        .eq("subject_id", c.id)
        .eq("kind", "contact.consent_changed");
    const ledger = ok(await events()).map((e) => e.data);
    assert.equal(ledger.length, 1);
    assert.deepEqual(
      {
        purpose: ledger[0].purpose,
        consent: ledger[0].consent,
        source: ledger[0].source,
        channel: ledger[0].channel,
        previous: ledger[0].previous,
        words: ledger[0].words,
      },
      {
        purpose: "email_marketing",
        consent: "opted_in",
        source: "customer_message",
        channel: "email",
        previous: "unknown",
        words: "YES OFFERS",
      },
      "the door's own facts win: whatever channel the evidence said, a yes by email is a yes on that channel",
    );
    // Once: a yes already given writes no second event.
    assert.deepEqual(ok(await say()), { changed: false, found: true });
    assert.equal(ok(await events()).length, 1);
    // In writing only: a spoken or a desk source is refused (22023), the answer unchanged.
    for (const source of ["phone", "in_person", "operator", null]) {
      const refused = await say(source);
      assert.equal(refused.error?.code, "22023", String(source));
    }
    // Their own no, then their own yes after it: the unsubscribe door, then the yes door.
    ok(
      await db.rpc("set_email_marketing", {
        p_tenant_id: tenantId,
        p_contact_id: c.id,
        p_state: "opted_out",
        p_source: "unsubscribe",
        p_evidence: { channel: "email", via: "page" },
      }),
    );
    assert.equal(
      ok(await db.from("contacts").select("email_marketing").eq("id", c.id).single()).email_marketing,
      "opted_out",
    );
    // A yes NEVER overwrites that no, whatever the words or the source: the message may be forged, mis-sent or old, and only
    // the person's own act (the owner's, on their page, or a form they sign afresh, neither written through this door) puts
    // offers back on. Refused by name, nothing written.
    for (const source of ["customer_message", "form"])
      assert.deepEqual(
        ok(await say(source)),
        { changed: false, found: true, refused: "unsubscribed" },
        `a yes by ${source} after an unsubscribe`,
      );
    assert.equal(
      ok(await db.from("contacts").select("email_marketing").eq("id", c.id).single()).email_marketing,
      "opted_out",
      "it stays opted out",
    );
    assert.equal(ok(await events()).length, 2, "yes, no: the refused yes wrote no event");
    // The yes is no WhatsApp yes, and it is not marketing's: it touches neither of the other answers nor their channels (the
    // email yes is the person's answer about offers BY EMAIL, kept in email_marketing alone: it covers email, never WhatsApp).
    const kept = ok(
      await db
        .from("contacts")
        .select("marketing_consent, marketing_channels, consent_channels")
        .eq("id", c.id)
        .single(),
    );
    assert.equal(kept.marketing_consent, "unknown");
    assert.equal(
      kept.marketing_channels,
      null,
      "no channel list is kept for the email yes: it is not in marketing_channels",
    );
    assert.equal(kept.consent_channels, null);
    const fresh = await person({}, { wrote: true });
    ok(
      await db.rpc("set_email_offers_yes", {
        p_tenant_id: tenantId,
        p_contact_id: fresh.id,
        p_source: "customer_message",
        p_evidence: { channel: "email", words: "YES OFFERS" },
      }),
    );
    assert.deepEqual(
      ok(await db.from("contacts").select("marketing_channels, marketing_consent").eq("id", fresh.id).single()),
      { marketing_channels: null, marketing_consent: "unknown" },
      "a first email yes touches no WhatsApp answer and covers no WhatsApp",
    );
    // A person who is gone, or asked to be forgotten, is written nothing.
    const erased = await person({ erasing_since: ago(0.1) });
    assert.deepEqual(
      ok(
        await db.rpc("set_email_offers_yes", {
          p_tenant_id: tenantId,
          p_contact_id: erased.id,
          p_source: "customer_message",
        }),
      ),
      { changed: false, found: true },
    );
    assert.deepEqual(
      ok(
        await db.rpc("set_email_offers_yes", {
          p_tenant_id: tenantId,
          p_contact_id: "00000000-0000-4000-8000-000000000000",
          p_source: "customer_message",
        }),
      ),
      { changed: false, found: false },
    );
    // Another workspace's person is not found by this one's id.
    const other = ok(
      await db
        .from("tenants")
        .insert({ slug: `email-offers-b-${Date.now()}`, name: "Other" })
        .select("id")
        .single(),
    );
    try {
      assert.deepEqual(
        ok(
          await db.rpc("set_email_offers_yes", {
            p_tenant_id: other.id,
            p_contact_id: c.id,
            p_source: "customer_message",
          }),
        ),
        { changed: false, found: false },
      );
    } finally {
      await db.from("tenants").delete().eq("id", other.id);
    }
  },
);

test(
  "Stop all messages is a STOP for everything, as ingest records one, and the email unsubscribe with it: once, with its ledger entries",
  { skip },
  async () => {
    const c = await person(
      { marketing_consent: "opted_in", marketing_channels: ["whatsapp"], consent_channels: ["whatsapp", "sms"] },
      { wrote: true },
    );
    const message = ok(await db.from("messages").select("id").eq("contact_id", c.id).limit(1).single()).id;
    const stop = () =>
      db.rpc("stop_all_messages", { p_tenant_id: tenantId, p_contact_id: c.id, p_message_id: message });
    const first = ok(await stop());
    assert.equal(first.changed, true);
    assert.equal(first.business, "Email offers", "the page says the business's name");
    const row = ok(
      await db
        .from("contacts")
        .select("consent, dnc, consent_source, email_marketing, email_marketing_source, consent_channels")
        .eq("id", c.id)
        .single(),
    );
    assert.deepEqual(
      [row.consent, row.dnc, row.consent_source, row.email_marketing, row.email_marketing_source],
      ["opted_out", true, "customer_message", "opted_out", "unsubscribe"],
    );
    assert.deepEqual(row.consent_channels, [], "a STOP empties what the yes covered, as any stop does");
    const ledger = ok(
      await db
        .from("events")
        .select("data")
        .eq("tenant_id", tenantId)
        .eq("subject_id", c.id)
        .eq("kind", "contact.consent_changed"),
    ).map((e) => e.data);
    const stopped = ledger.find((d) => d.purpose === undefined);
    assert.deepEqual(
      {
        consent: stopped.consent,
        source: stopped.source,
        channel: stopped.channel,
        words: stopped.words,
        via: stopped.via,
        previous: stopped.previous,
      },
      {
        consent: "opted_out",
        source: "customer_message",
        channel: "email",
        words: "Stop all messages",
        via: "unsubscribe_page",
        previous: "opted_in",
      },
    );
    assert.ok(
      ledger.some((d) => d.purpose === "email_marketing" && d.consent === "opted_out" && d.source === "unsubscribe"),
      "and the unsubscribe from email",
    );
    const count = ledger.length;
    assert.equal(ok(await stop()).changed, false, "a repeat changes nothing");
    assert.equal(
      ok(
        await db
          .from("events")
          .select("id")
          .eq("tenant_id", tenantId)
          .eq("subject_id", c.id)
          .eq("kind", "contact.consent_changed"),
      ).length,
      count,
      "and writes no second entry",
    );
    // The unsubscribe alone (the link's first press) is no STOP: the visit messages stay allowed.
    const only = await person({}, { wrote: true });
    ok(
      await db.rpc("set_email_marketing", {
        p_tenant_id: tenantId,
        p_contact_id: only.id,
        p_state: "opted_out",
        p_source: "unsubscribe",
      }),
    );
    const kept = ok(await db.from("contacts").select("consent, dnc, email_marketing").eq("id", only.id).single());
    assert.deepEqual([kept.consent, kept.dnc, kept.email_marketing], ["opted_in", false, "opted_out"]);
    assert.equal(
      mayMessageFor({ consent: kept.consent, dnc: kept.dnc, email_marketing: kept.email_marketing }, "conversational", {
        proactive: true,
        channel: "email",
      }).ok,
      true,
    );
  },
);

/* ------------------------------------------------------------- the gates */

const HOST = "campaigns.example.com";
const FROM = `"Email offers" <offers@${HOST}>`;

test(
  "the gates' counts read what the receipts stored, in their windows: the last 1,000 for complaints, the last 500 for bounces; only that host's emails that left",
  { skip },
  async () => {
    const c = await person({}, { wrote: true });
    const conversation = ok(await db.from("conversations").select("id").eq("contact_id", c.id).single()).id;
    const row = (i, over = {}, from = FROM) => ({
      tenant_id: tenantId,
      conversation_id: conversation,
      contact_id: c.id,
      channel: "email",
      direction: "outbound",
      sender: "human",
      type: "text",
      body: "offer",
      status: "sent",
      created_at: new Date(NOW.getTime() - (2000 - i) * 60_000).toISOString(),
      meta: { source: "broadcast", email: { request: { from } } },
      ...over,
    });
    const complained = (m) => ({
      ...m,
      meta: { source: "broadcast", email: { request: { from: FROM }, complained_at: NOW.toISOString() } },
    });
    // 1,010 offers that left, oldest first: the oldest ten complained, the newest twenty bounced.
    const offers = [];
    for (let i = 0; i < 1010; i += 1) {
      let m = row(i);
      if (i < 10) m = complained(m);
      if (i >= 990) m = { ...m, status: "failed", error: { provider: "bounced" } };
      offers.push(m);
    }
    // Rows that are not the gates' business: another domain's (a reply), one that never left, one that failed another way.
    const noise = [
      row(1500, {}, '"Email offers" <offers@mail.example.com>'),
      row(1501, { status: "canceled" }),
      row(1502, { status: "queued" }),
      row(1503, { status: "failed", error: { provider: "suppressed" } }),
    ];
    for (let i = 0; i < offers.length; i += 250) ok(await db.from("messages").insert(offers.slice(i, i + 250)));
    ok(await db.from("messages").insert(noise));
    const counts = ok(await db.rpc("email_offer_counts", { p_tenant_id: tenantId, p_host: HOST }));
    assert.equal(counts.complaint_sample, 1000, "the last 1,000 that left");
    assert.equal(counts.complaints, 0, "the ten that complained are older than the window: they no longer count");
    assert.equal(counts.bounce_sample, 500, "the last 500");
    assert.equal(counts.bounces, 20, "the twenty hard bounces are the newest");
    // The host is compared in lower case, and another host is another count (here, none).
    assert.equal(
      ok(await db.rpc("email_offer_counts", { p_tenant_id: tenantId, p_host: HOST.toUpperCase() })).bounces,
      20,
    );
    assert.deepEqual(
      ok(await db.rpc("email_offer_counts", { p_tenant_id: tenantId, p_host: "elsewhere.example.com" })),
      {
        complaint_sample: 0,
        complaints: 0,
        bounce_sample: 0,
        bounces: 0,
      },
    );
    // A complaint inside the window counts once, through the door that stamps it.
    const fresh = ok(
      await db
        .from("messages")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("created_at", offers[989].created_at)
        .single(),
    );
    ok(
      await db.rpc("stamp_email_complaint", { p_tenant_id: tenantId, p_message_id: fresh.id, p_at: NOW.toISOString() }),
    );
    assert.equal(ok(await db.rpc("email_offer_counts", { p_tenant_id: tenantId, p_host: HOST })).complaints, 1);
  },
);

test(
  "a pause and a resume each write the workspace's ledger; a resume starts the count afresh, so the offers that paused it are not counted again, and the gate trips again only over its minimum",
  { skip },
  async () => {
    const HOST2 = "gates.example.com";
    const FROM2 = `"Email offers" <offers@${HOST2}>`;
    const c = await person({}, { wrote: true });
    const conversation = ok(await db.from("conversations").select("id").eq("contact_id", c.id).single()).id;
    // `count` offers to this host, at `at`, the first `complained` of them complained about and the next `bounced` bounced.
    const send = async (count, at, { complained = 0, bounced = 0, status = "sent" } = {}) => {
      const rows = Array.from({ length: count }, (_, i) => ({
        tenant_id: tenantId,
        conversation_id: conversation,
        contact_id: c.id,
        channel: "email",
        direction: "outbound",
        sender: "human",
        type: "text",
        body: "offer",
        status: i >= complained && i < complained + bounced ? "failed" : status,
        ...(i >= complained && i < complained + bounced ? { error: { provider: "bounced" } } : {}),
        created_at: at,
        meta: {
          source: "broadcast",
          email: { request: { from: FROM2 }, ...(i < complained ? { complained_at: at } : {}) },
        },
      }));
      for (let i = 0; i < rows.length; i += 250) ok(await db.from("messages").insert(rows.slice(i, i + 250)));
    };
    const counts = async () => {
      const k = ok(await db.rpc("email_offer_counts", { p_tenant_id: tenantId, p_host: HOST2 }));
      return {
        complaintSample: k.complaint_sample,
        complaints: k.complaints,
        bounceSample: k.bounce_sample,
        bounces: k.bounces,
      };
    };
    const ledger = async () =>
      ok(
        await db
          .from("events")
          .select("kind, category, subject_type, subject_id, data")
          .eq("tenant_id", tenantId)
          .in("kind", ["mailbox.offers_paused", "mailbox.offers_resumed"])
          .order("created_at"),
      );
    const mailbox = ok(await db.from("mailboxes").select("id, offers_resumed_at").eq("tenant_id", tenantId).single());
    assert.equal(mailbox.offers_resumed_at, null, "never resumed");

    // 250 offers, 3 complained and 12 bounced: over both gates, judged over their minimums (200 and 100).
    await send(250, ago(2), { complained: 3, bounced: 12 });
    const first = await counts();
    assert.deepEqual(first, { complaintSample: 250, complaints: 3, bounceSample: 250, bounces: 12 });
    assert.equal(offerGate(first), "complaints", "complaints are the worse signal");
    // email_left is the one spelling of "it left": sent, delivered and read count, a queued or canceled one does not.
    await send(2, ago(2), { status: "delivered" });
    await send(1, ago(2), { status: "read" });
    await send(1, ago(2), { status: "queued" });
    await send(1, ago(2), { status: "canceled" });
    assert.equal((await counts()).complaintSample, 253, "sent, delivered and read left; queued and canceled never did");

    // The pause writes the ledger, once, with the counts it was judged by.
    const paused = ok(
      await db.rpc("pause_email_offers", {
        p_tenant_id: tenantId,
        p_reason: "complaints",
        p_counts: { complaint_sample: 253, complaints: 3, bounce_sample: 253, bounces: 12 },
      }),
    );
    assert.equal(paused, true);
    assert.equal(
      ok(await db.rpc("pause_email_offers", { p_tenant_id: tenantId, p_reason: "bounces" })),
      false,
      "already paused: no second event",
    );
    const afterPause = await ledger();
    assert.equal(afterPause.length, 1);
    assert.deepEqual(
      [afterPause[0].kind, afterPause[0].category, afterPause[0].subject_type, afterPause[0].subject_id],
      ["mailbox.offers_paused", "system", "mailbox", mailbox.id],
    );
    assert.deepEqual(afterPause[0].data, {
      reason: "complaints",
      complaint_sample: 253,
      complaints: 3,
      bounce_sample: 253,
      bounces: 12,
    });

    // The back office resumes it: the pause is gone, the moment is stamped, the ledger says who was resumed from what.
    assert.equal(ok(await db.rpc("resume_email_offers", { p_tenant_id: tenantId })), true);
    assert.equal(await emailOffersPause(db, tenantId), null);
    const resumedAt = ok(
      await db.from("mailboxes").select("offers_resumed_at").eq("tenant_id", tenantId).single(),
    ).offers_resumed_at;
    assert.ok(resumedAt, "offers_resumed_at is set by the resume");
    const afterResume = await ledger();
    assert.deepEqual(
      afterResume.map((e) => e.kind),
      ["mailbox.offers_paused", "mailbox.offers_resumed"],
    );
    assert.equal(afterResume[1].data.reason, "complaints");
    assert.ok(afterResume[1].data.paused_at, "and since when");
    assert.equal(
      ok(await db.rpc("resume_email_offers", { p_tenant_id: tenantId })),
      false,
      "nothing to resume: no event",
    );
    assert.equal((await ledger()).length, 2);

    // The count starts afresh: the 253 offers that paused it were sent before the resume and are not counted again.
    assert.deepEqual(
      await counts(),
      { complaintSample: 0, complaints: 0, bounceSample: 0, bounces: 0 },
      "judged over the offers sent since the resume",
    );
    // Offers sent since: too few for a gate to judge, whatever their rate.
    const since = new Date(Date.parse(resumedAt) + 60_000).toISOString();
    await send(40, since, { complained: 2, bounced: 8 });
    const few = await counts();
    assert.deepEqual(few, { complaintSample: 40, complaints: 2, bounceSample: 40, bounces: 8 });
    assert.equal(offerGate(few), null, "5% complained and 20% bounced over forty offers: below the minimums, no gate");
    // Enough of them later, the list still bad: the gate trips again, and the workspace is paused again, with its own event.
    await send(220, new Date(Date.parse(since) + 60_000).toISOString(), { complained: 1, bounced: 10 });
    const enough = await counts();
    assert.deepEqual(enough, { complaintSample: 260, complaints: 3, bounceSample: 260, bounces: 18 });
    assert.equal(offerGate(enough), "complaints");
    assert.equal(
      ok(
        await db.rpc("pause_email_offers", {
          p_tenant_id: tenantId,
          p_reason: offerGate(enough),
          p_counts: {
            complaint_sample: enough.complaintSample,
            complaints: enough.complaints,
            bounce_sample: enough.bounceSample,
            bounces: enough.bounces,
          },
        }),
      ),
      true,
      "paused again after the resume",
    );
    const events = await ledger();
    assert.deepEqual(
      events.map((e) => e.kind),
      ["mailbox.offers_paused", "mailbox.offers_resumed", "mailbox.offers_paused"],
    );
    assert.equal(events[2].data.complaint_sample, 260, "the second pause was judged over the afresh count");
    // Leave the workspace as the next case expects it.
    assert.equal(ok(await db.rpc("resume_email_offers", { p_tenant_id: tenantId })), true);
  },
);

test(
  "the pause is set once, for a reason in the closed set, read back by the door's own reader, and cleared by the back office alone",
  { skip },
  async () => {
    assert.equal(await emailOffersPause(db, tenantId), null, "not paused");
    assert.equal(
      (await db.rpc("pause_email_offers", { p_tenant_id: tenantId, p_reason: "spam" })).error?.code,
      "22023",
    );
    assert.equal(ok(await db.rpc("pause_email_offers", { p_tenant_id: tenantId, p_reason: "complaints" })), true);
    const paused = await emailOffersPause(db, tenantId);
    assert.equal(paused.reason, "complaints");
    assert.ok(paused.at);
    // Once: a second gate does not move the first moment or reason.
    assert.equal(ok(await db.rpc("pause_email_offers", { p_tenant_id: tenantId, p_reason: "bounces" })), false);
    assert.deepEqual(await emailOffersPause(db, tenantId), paused);
    // The column's own CHECK holds the same set.
    const bad = await db.from("mailboxes").update({ offers_paused_reason: "whatever" }).eq("tenant_id", tenantId);
    assert.ok(bad.error, "a reason outside the set is refused by the table");
    assert.equal(ok(await db.rpc("resume_email_offers", { p_tenant_id: tenantId })), true);
    assert.equal(await emailOffersPause(db, tenantId), null);
    assert.equal(ok(await db.rpc("resume_email_offers", { p_tenant_id: tenantId })), false, "nothing to clear");
    // A workspace with no mailbox has nothing to pause.
    const bare = ok(
      await db
        .from("tenants")
        .insert({ slug: `email-offers-c-${Date.now()}`, name: "Bare" })
        .select("id")
        .single(),
    );
    try {
      assert.equal(ok(await db.rpc("pause_email_offers", { p_tenant_id: bare.id, p_reason: "bounces" })), false);
      assert.equal(await emailOffersPause(db, bare.id), null);
    } finally {
      await db.from("tenants").delete().eq("id", bare.id);
    }
  },
);

test(
  "none of the service-role doors answers a member or the public: the yes, the stop, the pause, the counts",
  { skip: skipMember },
  async () => {
    const c = await person({}, { wrote: true });
    const anon = createClient(URL_, ANON, { auth: { persistSession: false } });
    const calls = [
      ["set_email_offers_yes", { p_tenant_id: tenantId, p_contact_id: c.id, p_source: "customer_message" }],
      ["stop_all_messages", { p_tenant_id: tenantId, p_contact_id: c.id }],
      ["pause_email_offers", { p_tenant_id: tenantId, p_reason: "bounces" }],
      ["resume_email_offers", { p_tenant_id: tenantId }],
      ["email_offer_counts", { p_tenant_id: tenantId, p_host: HOST }],
    ];
    for (const [name, args] of calls) {
      for (const [who, client] of [
        ["a member", owner],
        ["the public", anon],
      ]) {
        const res = await client.rpc(name, args);
        assert.ok(res.error, `${name} answers ${who}?`);
        assert.match(res.error.message + (res.error.code ?? ""), /permission|42501|denied/i, `${name}: ${who}`);
      }
    }
    // The person is unchanged, and the pause too.
    assert.equal(
      ok(await db.from("contacts").select("email_marketing").eq("id", c.id).single()).email_marketing,
      "unknown",
    );
    assert.equal(await emailOffersPause(db, tenantId), null);
  },
);

/* ------------------------------------------------------ the email intake's two words */

test(
  "an email's own words reach the doors through the intake: YES OFFERS records the yes, UNSUBSCRIBE ends offers and lists the address; a delivery repeated after it was handled writes nothing",
  { skip },
  async () => {
    const { ingestInboundEmail } = await import("../../../../packages/db/src/repositories/email.ts");
    const { markProcessed } = await import("../../../../packages/db/src/repositories/ingest.ts");
    const address = `intake-${Date.now()}@example.com`;
    let k = 0;
    const ingest = (over) =>
      ingestInboundEmail(db, {
        tenantId,
        address,
        receivedId: `rcv-intake-${Date.now()}-${(k += 1)}`,
        body: "x",
        channelTs: new Date().toISOString(),
        meta: {},
        ...over,
      });
    const state = async () =>
      ok(
        await db
          .from("contacts")
          .select("id, email, consent, dnc, email_marketing, email_marketing_source")
          .eq("tenant_id", tenantId)
          .eq("email", address)
          .single(),
      );
    // YES OFFERS: a person made from the address, opted in to offers by email, the channel and the words on the ledger.
    const first = await ingest({
      body: "YES OFFERS",
      optInOffers: true,
      words: "YES OFFERS",
      receivedId: "rcv-intake-yes",
    });
    const asked = await state();
    assert.deepEqual(
      [asked.email_marketing, asked.email_marketing_source, asked.consent, asked.dnc],
      ["opted_in", "customer_message", "unknown", false],
    );
    const yes = ok(
      await db
        .from("events")
        .select("data")
        .eq("tenant_id", tenantId)
        .eq("subject_id", asked.id)
        .eq("kind", "contact.consent_changed"),
    ).map((e) => e.data);
    assert.deepEqual(
      yes.map((d) => [d.purpose, d.consent, d.channel, d.words, d.message_external_id, d.message_id]),
      [["email_marketing", "opted_in", "email", "YES OFFERS", "rcv-intake-yes", first.message_id]],
    );
    // The email was handled; the provider delivers it again: the replay writes nothing, even after the person has said no.
    await markProcessed(db, tenantId, first.message_id);
    ok(
      await db.rpc("set_email_marketing", {
        p_tenant_id: tenantId,
        p_contact_id: asked.id,
        p_state: "opted_out",
        p_source: "unsubscribe",
      }),
    );
    await ingest({ body: "YES OFFERS", optInOffers: true, words: "YES OFFERS", receivedId: "rcv-intake-yes" });
    assert.equal((await state()).email_marketing, "opted_out", "a handled email is not applied twice");
    // UNSUBSCRIBE: through the unsubscribe door, whose list the finder reads; no STOP.
    // A new YES OFFERS after their unsubscribe is refused: only the owner, on the person's page, or a form they sign afresh
    // puts offers back on; an email that says YES OFFERS never undoes an unsubscribe.
    const again = await ingest({
      body: "YES OFFERS",
      optInOffers: true,
      words: "YES OFFERS",
      receivedId: "rcv-intake-yes-2",
    });
    assert.equal((await state()).email_marketing, "opted_out", "a yes after an unsubscribe changes nothing");
    await markProcessed(db, tenantId, again.message_id);
    // The owner puts offers back on (the person's page: their own act), and the person then unsubscribes again by reply.
    ok(await db.from("contacts").update({ email_marketing: "opted_in" }).eq("id", asked.id).eq("tenant_id", tenantId));
    await ingest({ body: "Unsubscribe", unsubscribe: true, words: "Unsubscribe", receivedId: "rcv-intake-unsub" });
    const ended = await state();
    assert.deepEqual(
      [ended.email_marketing, ended.email_marketing_source, ended.consent, ended.dnc],
      ["opted_out", "unsubscribe", "unknown", false],
      "an unsubscribe is no STOP",
    );
    const listed = ok(await db.from("lead_suppressions").select("what").eq("tenant_id", tenantId));
    assert.ok(
      listed.some((r) => r.what === "email_opt_out"),
      "the address is on the never-again list",
    );
    const said = ok(
      await db
        .from("events")
        .select("data")
        .eq("tenant_id", tenantId)
        .eq("subject_id", ended.id)
        .eq("kind", "contact.consent_changed"),
    )
      .map((e) => e.data)
      .find((d) => d.source === "unsubscribe" && d.via === "reply");
    assert.equal(said.words, "Unsubscribe");
    assert.equal(said.channel, "email");
  },
);
