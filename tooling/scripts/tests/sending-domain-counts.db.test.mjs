/**
 * What a domain answers for (00176), against the real database: sending_domain_counts over rows whose frozen request
 * is written by the real buildEmailRequest (the shape the send path stores), and stamp_email_complaint. Runs against
 * a local stack only; skips without one.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { buildEmailRequest, ownDomainIdentity, hostedIdentity } from "@chanlytics/channels";

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
let thread;
const stamp = Date.now().toString(36);
const ok = (res) => {
  assert.equal(res.error, null, res.error?.message);
  return res.data;
};
const MAILBOX = { local_part: "harbor", reply_token: "a".repeat(24), from_name: "Harbor" };
const OWN = (host) => ({ host, from_local: "sam", from_name: "Sam at Harbor" });

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  A = ok(
    await db
      .from("tenants")
      .insert({ slug: `counts-${stamp}`, name: "Counts" })
      .select("id")
      .single(),
  ).id;
  const contact = ok(
    await db.from("contacts").insert({ tenant_id: A, email: "owner@fixture-counts.example" }).select("id").single(),
  ).id;
  thread = ok(await db.from("conversations").insert({ tenant_id: A, contact_id: contact }).select("id").single()).id;
});
after(async () => {
  if (skip) return;
  if (A) await db.from("tenants").delete().eq("id", A);
});

/** One outbound email row, frozen as the send path freezes it, from an own domain or the hosted mailbox. */
async function sent({ host = "getharbor.example", status = "sent", error = null, at = new Date() } = {}) {
  const id = crypto.randomUUID();
  const identity = host
    ? ownDomainIdentity(OWN(host), MAILBOX, "mail.chanlytics.com")
    : hostedIdentity(MAILBOX, "mail.chanlytics.com");
  const request = buildEmailRequest({
    identity,
    to: "owner@fixture-counts.example",
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
    tenantId: A,
  });
  ok(
    await db.from("messages").insert({
      id,
      tenant_id: A,
      conversation_id: thread,
      channel: "email",
      direction: "outbound",
      sender: "ai",
      type: "text",
      body: "Saw your shop on the map.",
      status,
      error,
      created_at: at.toISOString(),
      meta: { email: { subject: request.subject, to: request.to[0], request } },
    }),
  );
  return id;
}
const counts = async (host, since = null) =>
  ok(await db.rpc("sending_domain_counts", { p_tenant_id: A, p_host: host, p_since: since }));
const BOUNCED = { provider: "bounced", kind: "Permanent", sub_kind: "General", message: "550 5.1.1 no such user" };

test(
  "a domain counts what left from it: its own host only, never a refusal or a send the provider never took",
  { skip },
  async () => {
    const host = `a-${stamp}.example`;
    await sent({ host });
    await sent({ host, status: "delivered" });
    await sent({ host, status: "failed", error: BOUNCED });
    await sent({ host, status: "canceled", error: { reason: "outreach_not_a_lead" } });
    await sent({ host, status: "failed", error: { http_status: 500, body: "boom" } });
    // The provider suppressed it: it never left, whatever the receipt's shape.
    await sent({
      host,
      status: "failed",
      error: { provider: "suppressed", kind: null, sub_kind: null, message: null },
    });
    await sent({ host: `other-${stamp}.example` });
    await sent({ host: null });
    assert.deepEqual(await counts(host), { sent: 3, bounced: 1, complained: 0 });
    assert.deepEqual(await counts(host.toUpperCase()), { sent: 3, bounced: 1, complained: 0 }, "a host in any case");
  },
);

test("the window: since the domain was clean, and the last 500 sends at most", { skip }, async () => {
  const host = `b-${stamp}.example`;
  const old = new Date(Date.now() - 3 * 86_400_000);
  await sent({ host, status: "failed", error: BOUNCED, at: old });
  const since = new Date(Date.now() - 86_400_000).toISOString();
  assert.deepEqual(
    await counts(host, since),
    { sent: 0, bounced: 0, complained: 0 },
    "a bounce before it was clean is not counted",
  );
  assert.deepEqual(await counts(host), { sent: 1, bounced: 1, complained: 0 }, "no since: the last 90 days");

  const many = `c-${stamp}.example`;
  await sent({ host: many, status: "failed", error: BOUNCED, at: new Date(Date.now() - 3_600_000) });
  const rows = Array.from({ length: 500 }, (_, i) => ({ i }));
  for (let k = 0; k < rows.length; k += 50) await Promise.all(rows.slice(k, k + 50).map(() => sent({ host: many })));
  assert.deepEqual(
    await counts(many),
    { sent: 500, bounced: 0, complained: 0 },
    "the older bounce fell out of the last 500",
  );
});

test("a complaint is stamped once on the row it is about, and counted", { skip }, async () => {
  const host = `d-${stamp}.example`;
  const id = await sent({ host, status: "delivered" });
  const at = new Date().toISOString();
  assert.equal(ok(await db.rpc("stamp_email_complaint", { p_tenant_id: A, p_message_id: id, p_at: at })), true);
  assert.equal(
    ok(await db.rpc("stamp_email_complaint", { p_tenant_id: A, p_message_id: id, p_at: at })),
    false,
    "twice is once",
  );
  const other = crypto.randomUUID();
  assert.equal(
    ok(await db.rpc("stamp_email_complaint", { p_tenant_id: other, p_message_id: id, p_at: at })),
    false,
    "another workspace's call stamps nothing",
  );
  const row = ok(await db.from("messages").select("status, meta").eq("id", id).single());
  assert.equal(row.status, "delivered", "the row stays delivered");
  assert.ok(row.meta.email.complained_at);
  assert.equal(row.meta.email.request.subject, "Your moving quotes", "what the row kept is kept");
  assert.deepEqual(await counts(host), { sent: 1, bounced: 0, complained: 1 });
});

test(
  "a complaint counts from when it was made: one made while the domain was held for its records still counts after",
  { skip },
  async () => {
    const host = `e-${stamp}.example`;
    const early = await sent({ host, status: "delivered", at: new Date(Date.now() - 5 * 86_400_000) });
    const older = await sent({ host, status: "delivered", at: new Date(Date.now() - 6 * 86_400_000) });
    const since = new Date(Date.now() - 2 * 86_400_000).toISOString();
    // Made yesterday, about an email from five days ago: after the domain was clean again, so it counts.
    ok(
      await db.rpc("stamp_email_complaint", {
        p_tenant_id: A,
        p_message_id: early,
        p_at: new Date(Date.now() - 86_400_000).toISOString(),
      }),
    );
    // Made four days ago: before it was clean, so it was answered for already.
    ok(
      await db.rpc("stamp_email_complaint", {
        p_tenant_id: A,
        p_message_id: older,
        p_at: new Date(Date.now() - 4 * 86_400_000).toISOString(),
      }),
    );
    assert.deepEqual(await counts(host, since), { sent: 0, bounced: 0, complained: 1 });
  },
);

test(
  "only a permanent bounce counts toward the 2%: a full mailbox says nothing about the domain that wrote (00178)",
  { skip },
  async () => {
    const host = `f-${stamp}.example`;
    await sent({
      host,
      status: "failed",
      error: { provider: "bounced", kind: "Transient", sub_kind: "MailboxFull", message: "452 mailbox full" },
    });
    await sent({ host, status: "failed", error: BOUNCED });
    assert.deepEqual(await counts(host), { sent: 2, bounced: 1, complained: 0 });
  },
);
