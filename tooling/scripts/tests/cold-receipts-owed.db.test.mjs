/**
 * The emails an own domain has heard nothing back about (00179), against the real database: cold_receipts_owed over
 * rows whose frozen request is written by the real buildEmailRequest (the shape the send path stores). It is how the
 * domains sweep finds a cold webhook secret set wrong. Runs against a local stack only; skips without one.
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
const H = 3_600_000;
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
});

/** An own domain of this workspace, verified unless said otherwise. */
async function domain(host, state = "verified") {
  const at = new Date(Date.now() - 20 * 24 * H).toISOString();
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

/** One outbound email row, frozen as the send path freezes it, from an own domain or the hosted mailbox. */
async function sent({ host, status = "sent", error = null, hoursAgo = 6 }) {
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
      created_at: new Date(Date.now() - hoursAgo * H).toISOString(),
      meta: { email: { subject: request.subject, to: request.to[0], request } },
    }),
  );
  return id;
}
/** The sweep's window: 26 to 2 hours ago. This workspace's rows only, so another suite's domains never show. */
const owed = async () =>
  (
    ok(
      await db.rpc("cold_receipts_owed", {
        p_from: new Date(Date.now() - 26 * H).toISOString(),
        p_to: new Date(Date.now() - 2 * H).toISOString(),
      }),
    ) ?? []
  )
    .filter((r) => r.tenant_id === A)
    .sort((a, b) => a.host.localeCompare(b.host));

test(
  "per verified own domain: the emails that left it in the window, and how many no receipt has reached",
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
    await sent({ host: quiet, hoursAgo: 20 });
    await sent({ host: quiet, hoursAgo: 25 });
    // Outside the window: too new for a receipt to be owed, and too old to be asked about.
    await sent({ host: quiet, hoursAgo: 1 });
    await sent({ host: quiet, hoursAgo: 30 });

    await sent({ host: heard });
    await sent({ host: heard, status: "delivered" });
    // A bounce is a receipt, and a send the provider refused never left: neither is counted either way.
    await sent({
      host: heard,
      status: "failed",
      error: { provider: "bounced", kind: "Permanent", sub_kind: "General", message: "550" },
    });
    await sent({ host: heard, status: "failed", error: { http_status: 500, body: "boom" } });

    // Held: nothing is sent from it, so nothing is owed. The hosted mailbox is not an own domain.
    await sent({ host: held });
    await sent({ host: null });

    assert.deepEqual(
      (await owed()).map(({ host, sent: n, unanswered }) => ({ host, sent: n, unanswered })),
      [
        { host: quiet, sent: 3, unanswered: 3 },
        { host: heard, sent: 2, unanswered: 1 },
      ],
      "a domain that sent nothing in the window is not listed",
    );
  },
);

test(
  "only the service role may ask: it reads every workspace's email",
  { skip: skip || (!process.env.SUPABASE_ANON_KEY && "no SUPABASE_ANON_KEY in env") },
  async () => {
    const anon = createClient(URL_, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    const r = await anon.rpc("cold_receipts_owed", {
      p_from: new Date(0).toISOString(),
      p_to: new Date().toISOString(),
    });
    assert.ok(r.error, "refused");
  },
);
