/**
 * A website's sign-up, confirmed by its person (00489), on a real database: the yes door's third source,
 * set_email_offers_yes(confirmed_signup), proves the press itself (the email is the sign-up's confirmation to this
 * person, it left, it is at most seven days old, it went to their address now, and they did not say STOP), lifts an
 * unsubscribe, and writes its yes once with the address and the form read off the email; and what the edge reads before
 * it asks (signupAskFacts) counts the asks by their rows, through PostgREST's JSON paths. A function body is what reading
 * source cannot prove, so these run against Postgres. Skipped without a local database; never production.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { signupAskFacts } from "../../../../../packages/db/src/repositories/campaigns/signup-confirms.ts";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite makes workspaces and customers"
      : false;

const ok = (res) => {
  assert.equal(res.error, null, res.error?.message);
  return res.data;
};

let db;
let tenantId;
let other;
let n = 0;
const DAY = 86_400_000;
const ago = (ms) => new Date(Date.now() - ms).toISOString();

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  const made = (slug) => db.from("tenants").insert({ slug, name: "Harbor" }).select("id").single();
  tenantId = ok(await made(`signup-confirm-${Date.now()}`)).id;
  other = ok(await made(`signup-confirm-b-${Date.now()}`)).id;
});

after(async () => {
  if (skip || !tenantId) return;
  for (const t of ["events", "messages", "conversations", "contacts"])
    await db.from(t).delete().in("tenant_id", [tenantId, other]);
  await db.from("tenants").delete().in("id", [tenantId, other]);
});

/** A person of the workspace (`t`), with an address unless said. */
async function person(over = {}, t = tenantId) {
  n += 1;
  return ok(
    await db
      .from("contacts")
      .insert({ tenant_id: t, email: `ana${n}-${Date.now()}@example.com`, ...over })
      .select("id, email")
      .single(),
  );
}

/** The sign-up's confirmation to `p`, as the edge writes it, then moved to `status`, written `age` ms ago. */
async function asked(p, { status = "sent", age = DAY, to = p.email, source = "signup_confirm", t = tenantId } = {}) {
  const conversation = ok(
    await db
      .from("conversations")
      .upsert({ tenant_id: t, contact_id: p.id }, { onConflict: "tenant_id,contact_id" })
      .select("id")
      .single(),
  ).id;
  return ok(
    await db
      .from("messages")
      .insert({
        tenant_id: t,
        conversation_id: conversation,
        contact_id: p.id,
        channel: "email",
        direction: "outbound",
        sender: "system",
        type: "text",
        body: "Confirm your sign-up",
        status,
        created_at: ago(age),
        meta: {
          source,
          email: { request: { to: [to], from: '"Harbor" <harbor@mail.example.com>' } },
          signup_confirm: { key: to, form: { form: "signup", page: "promo", about: null, lang: "en", at: null } },
        },
      })
      .select("id")
      .single(),
  ).id;
}

const confirm = async (p, messageId, t = tenantId) =>
  ok(
    await db.rpc("set_email_offers_yes", {
      p_tenant_id: t,
      p_contact_id: p.id,
      p_source: "confirmed_signup",
      p_message_id: messageId,
      p_evidence: { via: "link" },
    }),
  );

const answerOf = async (p) =>
  ok(await db.from("contacts").select("email_marketing, email_marketing_source").eq("id", p.id).single());

const yesEvents = async (p) =>
  ok(
    await db
      .from("events")
      .select("data")
      .eq("subject_id", p.id)
      .eq("kind", "contact.consent_changed")
      .eq("data->>purpose", "email_marketing"),
  ).map((e) => e.data);

test("a confirmed sign-up is a yes, once, with the address and the form read off its email", { skip }, async () => {
  const p = await person();
  const m = await asked(p);
  assert.deepEqual(await confirm(p, m), { changed: true, found: true });
  assert.deepEqual(await answerOf(p), { email_marketing: "opted_in", email_marketing_source: "confirmed_signup" });
  assert.deepEqual(await confirm(p, m), { changed: false, found: true }, "a second press writes nothing");
  const [e, ...more] = await yesEvents(p);
  assert.equal(more.length, 0);
  assert.deepEqual(
    [e.consent, e.source, e.channel, e.previous, e.message_id, e.sent_to, e.via],
    ["opted_in", "confirmed_signup", "email", "unknown", m, p.email, "link"],
  );
  assert.deepEqual(e.signed_up, { form: "signup", page: "promo", about: null, lang: "en", at: null });
});

test(
  "the door proves the press: an email that is no confirmation, never left, is past its days, or went elsewhere",
  { skip },
  async () => {
    const p = await person();
    const someone = await person();
    const refused = async (messageId, why, who = p, t = tenantId) =>
      assert.equal((await confirm(who, messageId, t)).refused, why, why);
    await refused(crypto.randomUUID(), "not_a_confirmation");
    await refused(await asked(p, { source: "reach_out" }), "not_a_confirmation");
    await refused(await asked(someone), "not_a_confirmation", p);
    await refused(await asked(p), "not_a_confirmation", p, other);
    await refused(await asked(p, { status: "queued" }), "not_sent");
    await refused(await asked(p, { status: "failed" }), "not_sent");
    await refused(await asked(p, { age: 8 * DAY }), "expired");
    await refused(await asked(p, { to: "someone-else@example.com" }), "address_changed");
    assert.equal((await answerOf(p)).email_marketing, "unknown", "nothing was written");
    assert.equal((await yesEvents(p)).length, 0);
    await assert.rejects(
      db
        .rpc("set_email_offers_yes", { p_tenant_id: tenantId, p_contact_id: p.id, p_source: "confirmed_signup" })
        .then((r) => {
          if (r.error) throw new Error(r.error.message);
        }),
      /names the email it was confirmed from/,
    );
  },
);

test("a STOP holds; an unsubscribe does not: the confirmed sign-up is their newest word", { skip }, async () => {
  const stopped = await person({ consent: "opted_out" });
  assert.equal((await confirm(stopped, await asked(stopped))).refused, "stopped");
  const dnc = await person({ dnc: true });
  assert.equal((await confirm(dnc, await asked(dnc))).refused, "stopped");

  const left = await person({ email_marketing: "opted_out", email_marketing_source: "unsubscribe" });
  // A YES OFFERS in an email never lifts it.
  const byWords = ok(
    await db.rpc("set_email_offers_yes", {
      p_tenant_id: tenantId,
      p_contact_id: left.id,
      p_source: "customer_message",
    }),
  );
  assert.equal(byWords.refused, "unsubscribed");
  assert.deepEqual(await confirm(left, await asked(left)), { changed: true, found: true });
  const [e] = await yesEvents(left);
  assert.equal(e.previous, "opted_out");
});

test(
  "a person merged since: the yes is theirs who the email moved to; an erasing person is written nothing",
  { skip },
  async () => {
    const kept = await person();
    const merged = await person({ email: null });
    const m = await asked(kept);
    ok(await db.from("contacts").update({ merged_into_contact_id: kept.id }).eq("id", merged.id));
    assert.deepEqual(await confirm(merged, m), { changed: true, found: true }, "the link names the merged person");
    assert.equal((await answerOf(kept)).email_marketing, "opted_in");

    const going = await person();
    const g = await asked(going);
    ok(
      await db
        .from("contacts")
        .update({ erasing_since: ago(0) })
        .eq("id", going.id),
    );
    assert.deepEqual(await confirm(going, g), { changed: false, found: true });
  },
);

test(
  "what the edge reads before it asks: the person, an open ask, and the asks the limits count",
  { skip },
  async () => {
    const p = await person();
    const key = `inbox-${Date.now()}@gmail.com`;
    const facts = () => signupAskFacts(db, { tenantId, contactId: p.id, addressKey: key, nowMs: Date.now() });
    const before = await facts();
    assert.deepEqual(before.person, { email: p.email, stopped: false, suppressed: false, emailOffers: "unknown" });
    assert.equal(before.open, false);

    const conversation = ok(
      await db
        .from("conversations")
        .upsert({ tenant_id: tenantId, contact_id: p.id }, { onConflict: "tenant_id,contact_id" })
        .select("id")
        .single(),
    ).id;
    const row = (status, age, k = key) => ({
      tenant_id: tenantId,
      conversation_id: conversation,
      contact_id: p.id,
      channel: "email",
      direction: "outbound",
      sender: "system",
      type: "text",
      body: "Confirm",
      status,
      created_at: ago(age),
      meta: { source: "signup_confirm", signup_confirm: { key: k } },
    });
    ok(
      await db
        .from("messages")
        .insert([
          row("sent", 3 * DAY),
          row("failed", 60_000),
          row("canceled", 60_000),
          row("delivered", 100 * DAY),
          row("sent", 60_000, "another@example.com"),
        ]),
    );
    const after_ = await facts();
    assert.equal(after_.open, true, "the one sent three days ago is open");
    assert.equal(after_.addressAsks, 2, "to this inbox in ninety days: the sent and the failed, never the cancelled");
    assert.equal(after_.workspaceToday >= 2, true, "the workspace's in the last day, the cancelled left out");
    assert.equal(after_.failedToday >= 1, true);

    ok(
      await db
        .from("contacts")
        .update({ dnc: true, email_suppressed_at: ago(0), email_suppressed_reason: "hard_bounce" })
        .eq("id", p.id),
    );
    const now = await facts();
    assert.deepEqual([now.person.stopped, now.person.suppressed], [true, true]);
    ok(
      await db
        .from("contacts")
        .update({ erasing_since: ago(0) })
        .eq("id", p.id),
    );
    assert.equal((await facts()).person, null, "a person being forgotten is nobody to ask");
  },
);
