/**
 * What the send door asks of a cold email (00177 outreach_facts), proved on the database: the lead's stage (the one
 * still being written to wins), the never-again list by the finder's own hash, the From domain as Connections set it
 * up, and what that domain sent in the window. Rows are written the way the send path writes them, by the real
 * buildEmailRequest with ownDomainIdentity, so the From the count reads is the real shape. Local stack only.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { buildEmailRequest, ownDomainIdentity } from "@chanlytics/channels";

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
let thread;
let person;
const stamp = Date.now().toString(36);
const HOST = `getharbor-${stamp}.example`;
const TO = `owner-${stamp}@fixture-facts.example`;
const MAILBOX = { local_part: "harbor", reply_token: "a".repeat(24), from_name: "Harbor" };
const ok = (res) => {
  assert.equal(res.error, null, res.error?.message);
  return res.data;
};
const facts = async (over = {}) =>
  ok(
    await db.rpc("outreach_facts", {
      p_tenant_id: A,
      p_contact_id: person,
      p_to: TO,
      p_host: HOST,
      p_since: new Date(Date.now() - 86_400_000).toISOString(),
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
  thread = ok(await db.from("conversations").insert({ tenant_id: A, contact_id: person }).select("id").single()).id;
  ok(
    await db.from("sending_domains").insert({
      tenant_id: A,
      host: HOST,
      from_local: "sam",
      from_name: "Sam at Harbor",
      state: "verified",
      provider_status: "verified",
      dmarc: "found",
      verified_at: new Date(Date.now() - 20 * 86_400_000).toISOString(),
      clean_since: new Date(Date.now() - 20 * 86_400_000).toISOString(),
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

/** One outbound email from the own domain, frozen as the send path freezes it. */
async function sent({ status = "sent", error = null, tenant = A } = {}) {
  const id = crypto.randomUUID();
  const request = buildEmailRequest({
    identity: ownDomainIdentity({ host: HOST, from_local: "sam", from_name: "Sam" }, MAILBOX, "mail.chanlytics.com"),
    to: TO,
    parent: null,
    subject: "Your moving quotes",
    body: "Saw your shop on the map.",
    signature: null,
    actor: "ai",
    campaign: {
      unsubscribeUrl: "https://app.chanlytics.com/u/t",
      footer: "Unsubscribe: https://app.chanlytics.com/u/t",
    },
    messageId: id,
    tenantId: tenant,
  });
  const conv =
    tenant === A
      ? thread
      : ok(
          await db
            .from("conversations")
            .insert({
              tenant_id: B,
              contact_id: ok(
                await db
                  .from("contacts")
                  .insert({ tenant_id: B, email: `b-${id}@fixture-facts.example` })
                  .select("id")
                  .single(),
              ).id,
            })
            .select("id")
            .single(),
        ).id;
  ok(
    await db.from("messages").insert({
      id,
      tenant_id: tenant,
      conversation_id: conv,
      channel: "email",
      direction: "outbound",
      sender: "ai",
      type: "text",
      body: "Saw your shop on the map.",
      status,
      error,
      meta: { email: { subject: request.subject, to: request.to[0], request } },
    }),
  );
  return id;
}

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
  "the domain as Connections set it up, by host in any case; another workspace's domain is none",
  { skip },
  async () => {
    const f = await facts({ p_host: HOST.toUpperCase() });
    assert.equal(f.domain.state, "verified");
    assert.equal(f.domain.from_local, "sam");
    assert.ok(f.domain.clean_since, "the ramp's clock, which the cap reads");
    assert.equal((await facts({ p_tenant_id: B })).domain, null);
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
  "what left the domain: sent, delivered, a receipt's failure, an unknown outcome; never a refusal or a send the provider never took",
  { skip },
  async () => {
    const base = (await facts()).sent_since;
    await sent({ status: "sent" });
    await sent({ status: "delivered" });
    await sent({ status: "failed", error: { provider: "bounced", kind: "Permanent" } });
    await sent({ status: "failed", error: { http_status: 0, body: "timeout", outcome: "unknown" } });
    await sent({ status: "failed", error: { http_status: 500, body: "boom" } });
    await sent({ status: "canceled", error: { reason: "outreach_not_a_lead" } });
    assert.equal((await facts()).sent_since - base, 4);
    assert.equal(
      (await facts({ p_since: new Date(Date.now() + 60_000).toISOString() })).sent_since,
      0,
      "the window cuts",
    );
    await sent({ tenant: B });
    assert.equal((await facts()).sent_since - base, 4, "another workspace's sends are not this domain's");
  },
);

test("no signed-in member may ask it: it is the send door's question", { skip }, async () => {
  const anon = process.env.SUPABASE_ANON_KEY;
  if (!anon) return;
  const pub = createClient(URL_, anon, { auth: { persistSession: false } });
  const r = await pub.rpc("outreach_facts", {
    p_tenant_id: A,
    p_contact_id: person,
    p_to: TO,
    p_host: HOST,
    p_since: new Date().toISOString(),
  });
  assert.ok(r.error, "refused without the service role");
});
