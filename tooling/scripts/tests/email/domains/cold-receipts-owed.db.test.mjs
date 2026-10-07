/**
 * The emails an own domain has heard nothing back about (00179), against the real database: cold_receipts_owed over
 * rows whose frozen request is written by the real buildEmailRequest (the shape the send path stores), and the one
 * spelling of "left" (email_left) it shares with 00176's count and 00177's door. It is how the domains sweep finds a
 * cold webhook secret set wrong. Runs against a local stack only; skips without one.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { buildEmailRequest, ownDomainIdentity, hostedIdentity } from "@chanlytics/channels";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite makes workspaces"
      : false;

let db;
let A;
let thread;
const users = [];
const stamp = Date.now().toString(36);
const H = 3_600_000;
const ago = (hours) => new Date(Date.now() - hours * H).toISOString();
const ok = (res) => {
  assert.equal(res.error, null, res.error?.message);
  return res.data;
};
const MAILBOX = { local_part: "harbor", reply_token: "a".repeat(24), from_name: "Harbor" };

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  A = ok(
    await db
      .from("tenants")
      .insert({ slug: `owed-${stamp}`, name: "Owed" })
      .select("id")
      .single(),
  ).id;
  const contact = ok(
    await db.from("contacts").insert({ tenant_id: A, email: "owner@fixture-owed.example" }).select("id").single(),
  ).id;
  thread = ok(await db.from("conversations").insert({ tenant_id: A, contact_id: contact }).select("id").single()).id;
});
after(async () => {
  if (skip) return;
  if (A) await db.from("tenants").delete().eq("id", A);
  for (const id of users) await db.auth.admin.deleteUser(id).catch(() => {});
});

/** An own domain of this workspace, verified unless said otherwise. */
async function domain(host, state = "verified") {
  const at = ago(20 * 24);
  ok(
    await db.from("sending_domains").insert({
      tenant_id: A,
      host,
      from_local: "sam",
      from_name: "Sam at Harbor",
      provider_domain_id: `pd-${host}`,
      state,
      verified_at: at,
      clean_since: at,
      ...(state === "held" ? { held_why: "dmarc", held_at: new Date().toISOString() } : {}),
    }),
  );
}

/**
 * One outbound email row, frozen as the send path freezes it, from an own domain or the hosted mailbox. `queuedAgo`
 * is when the row was written, `sentAgo` when it became sent (messages_guard's meta.status_at.sent); the same unless
 * the queue waited.
 */
async function sent({ host, status = "sent", error = null, sentAgo = 6, queuedAgo = sentAgo }) {
  const id = crypto.randomUUID();
  const identity = host
    ? ownDomainIdentity({ host, from_local: "sam", from_name: "Sam at Harbor" }, MAILBOX, "mail.chanlytics.com")
    : hostedIdentity(MAILBOX, "mail.chanlytics.com");
  const request = buildEmailRequest({
    identity,
    to: "owner@fixture-owed.example",
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
      created_at: ago(queuedAgo),
      meta: {
        email: { subject: request.subject, to: request.to[0], request },
        status_at: { queued: ago(queuedAgo), ...(status === "queued" ? {} : { sent: ago(sentAgo) }) },
      },
    }),
  );
  return id;
}
/** The sweep's window: sent 26 to 2 hours ago. This workspace's rows only, so another suite's domains never show. */
const owed = async (client = db) =>
  (ok(await client.rpc("cold_receipts_owed", { p_from: ago(26), p_to: ago(2) })) ?? [])
    .filter((r) => r.tenant_id === A)
    .map(({ host, sent: n, unanswered }) => ({ host, sent: n, unanswered }))
    .sort((a, b) => a.host.localeCompare(b.host));

const BOUNCED = { provider: "bounced", kind: "Permanent", sub_kind: "General", message: "550 5.1.1 no such user" };

test(
  "per verified own domain: the emails that left it, sent in the window, and how many no receipt has reached",
  { skip },
  async () => {
    const quiet = `a-${stamp}.example`;
    const heard = `b-${stamp}.example`;
    const held = `c-${stamp}.example`;
    const idle = `d-${stamp}.example`;
    await domain(quiet);
    await domain(heard);
    await domain(held, "held");
    await domain(idle);

    await sent({ host: quiet });
    await sent({ host: quiet, sentAgo: 20 });
    await sent({ host: quiet, sentAgo: 25 });
    // Outside the window: too new for a receipt to be owed, and too old to be asked about.
    await sent({ host: quiet, sentAgo: 1 });
    await sent({ host: quiet, sentAgo: 30 });

    await sent({ host: heard });
    await sent({ host: heard, status: "delivered" });
    // A bounce is a receipt: it says the webhook works, so it counts as heard back.
    await sent({ host: heard, status: "failed", error: BOUNCED });
    // A send the provider refused, and one whose outcome is unknown, never left as far as anyone knows.
    await sent({ host: heard, status: "failed", error: { http_status: 500, body: "boom" } });
    await sent({ host: heard, status: "failed", error: { outcome: "unknown" } });

    // Held: nothing is sent from it, so nothing is owed. The hosted mailbox is not an own domain.
    await sent({ host: held });
    await sent({ host: null });

    assert.deepEqual(
      await owed(),
      [
        { host: quiet, sent: 3, unanswered: 3 },
        { host: heard, sent: 3, unanswered: 1 },
      ],
      "a domain that sent nothing in the window is not listed",
    );
  },
);

test(
  "the window is when an email was sent, not when it was queued: a backlog that left late owes nothing yet",
  { skip },
  async () => {
    const late = `e-${stamp}.example`;
    await domain(late);
    // Queued a day ago, and sent an hour ago when the queue drained: no receipt is owed for it yet.
    await sent({ host: late, queuedAgo: 24, sentAgo: 1 });
    await sent({ host: late, queuedAgo: 24, sentAgo: 1 });
    await sent({ host: late, queuedAgo: 24, sentAgo: 1 });
    // Queued thirty hours ago and sent twenty ago: owed, although queued before the window opened.
    await sent({ host: late, queuedAgo: 30, sentAgo: 20 });
    assert.deepEqual(
      (await owed()).filter((r) => r.host === late),
      [{ host: late, sent: 1, unanswered: 1 }],
    );
  },
);

test(
  "the one spelling of left: a failure receipt left, a refusal and an unknown outcome did not",
  { skip },
  async () => {
    const left = async (status, error) => ok(await db.rpc("email_left", { p_status: status, p_error: error }));
    assert.equal(await left("sent", null), true);
    assert.equal(await left("delivered", null), true);
    assert.equal(await left("failed", BOUNCED), true);
    assert.equal(await left("failed", { provider: "failed", kind: null, sub_kind: null, message: null }), true);
    assert.equal(await left("failed", { provider: "suppressed", kind: null, sub_kind: null, message: null }), false);
    assert.equal(await left("failed", { http_status: 500, body: "boom" }), false);
    assert.equal(await left("failed", { outcome: "unknown" }), false);
    assert.equal(await left("failed", null), false);
    assert.equal(await left("queued", null), false);
    assert.equal(await left("canceled", { reason: "outreach_not_a_lead" }), false);
  },
);

test(
  "a member may not ask: it reads every workspace's domains",
  { skip: skip || (!ANON && "no SUPABASE_ANON_KEY in env: the member this suite signs in as needs it") },
  async () => {
    const email = `owed-${stamp}@example.com`;
    const password = `pw-${Math.random().toString(36).slice(2)}-Aa1!`;
    const made = await db.auth.admin.createUser({ email, password, email_confirm: true });
    assert.equal(made.error, null, made.error?.message);
    users.push(made.data.user.id);
    ok(await db.from("memberships").insert({ tenant_id: A, user_id: made.data.user.id, role: "owner" }));
    const member = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
    ok(await member.auth.signInWithPassword({ email, password }));
    const r = await member.rpc("cold_receipts_owed", { p_from: ago(26), p_to: ago(2) });
    assert.ok(r.error, "an owner of this very workspace is refused");
    assert.ok((await member.rpc("email_left", { p_status: "sent", p_error: null })).error, "and so is the helper");
    const logged_out = createClient(URL_, ANON, { auth: { persistSession: false } });
    assert.ok((await logged_out.rpc("cold_receipts_owed", { p_from: ago(26), p_to: ago(2) })).error, "and anon");
  },
);
