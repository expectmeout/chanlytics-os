/**
 * What became of an email we sent: the provider's receipts, read and applied.
 *
 * The reading is pure (channels email.ts) and is pinned by value against the
 * payloads Resend documents. The applying is run through the webhook's own
 * door, signed the way Svix signs, over a database in memory: what is proved is
 * which rows change, in what order, and what a redelivered receipt does not do.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { fakeDb } from "./_fake-db.mjs";
import {
  buildEmailRequest,
  ownDomainIdentity,
  emailReceiptFrom,
  emailReceiptEffect,
  emailReceivedEventFrom,
  requestLeavesAs,
  resendWebhookSignature,
  sendsAs,
} from "@chanlytics/channels";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const SECRET = `whsec_${Buffer.from("a-webhook-signing-secret-of-32b!").toString("base64")}`;
process.env.EMAIL_DOMAIN = "mail.chanlytics.com";
process.env.RESEND_WEBHOOK_SECRET = SECRET;
const { setPg } = await import(at("apps/edge/lib/pg.ts"));
const door = await import(at("apps/edge/api/resend-webhook.ts"));
const { EMAIL_FAILED_WORDS } = await import(at("apps/edge/lib/email/email-receipts.ts"));
after(() => {
  setPg(null);
  delete process.env.EMAIL_DOMAIN;
  delete process.env.RESEND_WEBHOOK_SECRET;
});

const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const M = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ADDRESS = "ana@example.com";
/** A receipt as Resend documents it: tags as a map, the Message-ID it minted, the provider's own account of a failure. */
const receipt = (type, over = {}) => ({
  type: `email.${type}`,
  created_at: "2026-09-17T12:00:05Z",
  data: {
    email_id: "re_1",
    message_id: "<abc@mail.chanlytics.com>",
    from: "Best Movers <bestmovers@mail.chanlytics.com>",
    to: [ADDRESS],
    subject: "Re: Quote",
    tags: { cl_message: M, cl_tenant: T },
    ...over,
  },
});
const BOUNCE = { bounce: { type: "Permanent", subType: "General", message: "550 5.1.1 no such user" } };

test("a receipt names its row by the tags the request left with, as a map or as the list it was sent as; anything else names nothing", () => {
  const r = emailReceiptFrom(receipt("bounced", BOUNCE));
  assert.deepEqual(r, {
    type: "bounced",
    providerId: "re_1",
    rfcMessageId: "<abc@mail.chanlytics.com>",
    to: [ADDRESS],
    messageId: M,
    tenantId: T,
    detail: { kind: "Permanent", subKind: "General", message: "550 5.1.1 no such user" },
  });
  const asList = emailReceiptFrom(
    receipt("sent", {
      tags: [
        { name: "cl_message", value: M.toUpperCase() },
        { name: "cl_tenant", value: T },
      ],
    }),
  );
  assert.deepEqual([asList.messageId, asList.tenantId], [M, T]);
  const platforms = emailReceiptFrom(receipt("delivered", { tags: { category: "alert" } }));
  assert.deepEqual([platforms.messageId, platforms.tenantId], [null, null], "the platform's own notification email");
  assert.equal(
    emailReceiptFrom(receipt("delivered", { tags: { cl_message: "1; drop table", cl_tenant: T } })).messageId,
    null,
    "a tag that is not an id names no row",
  );
  assert.equal(
    emailReceiptFrom(receipt("failed", { failed: { reason: "reached_daily_quota" } })).detail.kind,
    "reached_daily_quota",
  );
  for (const no of [
    null,
    {},
    receipt("opened"),
    receipt("received"),
    { type: "domain.updated", data: { email_id: "x" } },
    { type: "email.sent", data: {} },
  ]) {
    assert.equal(emailReceiptFrom(no), null, JSON.stringify(no));
  }
});

test("what one receipt changes: only a permanent bounce stops an address; a complaint leaves the row delivered; sent and delayed move nothing", () => {
  const effect = (type, over) => emailReceiptEffect(emailReceiptFrom(receipt(type, over)));
  assert.deepEqual(effect("sent"), { status: null, error: null, suppress: null }, "the send's own word to say");
  assert.deepEqual(effect("delivery_delayed"), { status: null, error: null, suppress: null });
  assert.deepEqual(effect("delivered"), { status: "delivered", error: null, suppress: null });
  assert.deepEqual(effect("bounced", BOUNCE), {
    status: "failed",
    error: { provider: "bounced", kind: "Permanent", sub_kind: "General", message: "550 5.1.1 no such user" },
    suppress: "hard_bounce",
  });
  assert.equal(
    effect("bounced", { bounce: { type: "Transient", subType: "MailboxFull", message: "full" } }).suppress,
    null,
    "a full mailbox is not a dead one",
  );
  assert.equal(effect("bounced", {}).suppress, null, "and a bounce that does not say is not called permanent");
  assert.deepEqual(effect("complained"), { status: null, error: null, suppress: "complaint" });
  assert.deepEqual(
    [effect("failed", { failed: { reason: "reached_daily_quota" } }).status, effect("failed").suppress],
    ["failed", null],
  );
  assert.deepEqual(
    [
      effect("suppressed", { suppressed: { type: "OnAccountSuppressionList", message: "listed" } }).status,
      effect("suppressed").suppress,
    ],
    ["failed", "provider"],
  );
});

test("a received email is routed by who the provider accepted it FOR, when the event says; the sender's own To and Cc lines route only when it does not", () => {
  const forwarded = emailReceivedEventFrom({
    type: "email.received",
    data: {
      email_id: "rcv_1",
      to: ["info@bestmovers.com"],
      cc: ["marisas@mail.chanlytics.com"],
      received_for: ["BestMovers@mail.chanlytics.com"],
    },
  });
  assert.deepEqual(
    forwarded.recipients,
    ["bestmovers@mail.chanlytics.com"],
    "a forward arrives under the envelope, and a Cc the sender typed is not a delivery",
  );
  const older = emailReceivedEventFrom({
    type: "email.received",
    data: { email_id: "rcv_2", to: ["bestmovers@mail.chanlytics.com"], received_for: [] },
  });
  assert.deepEqual(older.recipients, ["bestmovers@mail.chanlytics.com"]);
});

test("what a mailbox sends as: its address, and every reply route that still routes to it", () => {
  const as = sendsAs(
    { local_part: "bestmovers", reply_token: "a".repeat(24), reply_token_prev: "p".repeat(24) },
    "mail.chanlytics.com",
  );
  assert.deepEqual(as, {
    address: "bestmovers@mail.chanlytics.com",
    replyRoutes: [`r+${"a".repeat(24)}@mail.chanlytics.com`, `r+${"p".repeat(24)}@mail.chanlytics.com`],
  });
  assert.deepEqual(
    sendsAs({ local_part: "bestmovers", reply_token: "a".repeat(24), reply_token_prev: null }, "mail.chanlytics.com")
      .replyRoutes.length,
    1,
  );
  const request = (from, reply_to) => ({ from, reply_to });
  assert.equal(
    requestLeavesAs(request('"Best Movers" <bestmovers@mail.chanlytics.com>', [as.replyRoutes[1]]), as),
    true,
  );
  assert.equal(
    requestLeavesAs(request('"bestmovers@mail.chanlytics.com" <marisas@mail.chanlytics.com>', [as.replyRoutes[0]]), as),
    false,
    "the display name proves nothing",
  );
  assert.equal(
    requestLeavesAs(request("bestmovers@mail.chanlytics.com", [as.replyRoutes[0], "attacker@example.com"]), as),
    false,
    "one Reply-To, and it is ours",
  );
  assert.equal(requestLeavesAs(request("bestmovers@mail.chanlytics.com", ["owner@bestmovers.com"]), as), false);
});

/* ------------------------------------------------------------ through the door */

/** One workspace, one person, one sent email; stamp_email_sent modelled as 00128 writes it. */
function world({ status = "sent", email = ADDRESS, faults = {}, meta = null, domains = [], counts = null } = {}) {
  const tables = {
    mailboxes: [],
    messages: [
      {
        id: M,
        tenant_id: T,
        conversation_id: "c1",
        contact_id: "k1",
        channel: "email",
        direction: "outbound",
        status,
        external_id: null,
        error: null,
        meta: meta ?? { email: { subject: "Re: Quote" } },
      },
    ],
    sending_domains: domains,
    tenant_config: [{ tenant_id: T, config: { notifications: { escalation_emails: ["owner@harbor.test"] } } }],
    tenant_channels: [],
    notifications: [],
    emailNoes: [],
    contacts: [{ id: "k1", tenant_id: T, email, email_suppressed_at: null, email_suppressed_reason: null }],
    escalations: [],
    events: [],
    jobs: [],
  };
  const rpcs = {
    stamp_email_sent: (a) => {
      const m = tables.messages.find(
        (x) =>
          x.id === a.p_message_id &&
          x.tenant_id === a.p_tenant_id &&
          x.channel === "email" &&
          x.direction === "outbound",
      );
      if (!m) return [];
      m.external_id ??= a.p_provider_id;
      if (a.p_rfc_message_id) m.meta = { ...m.meta, email: { ...m.meta.email, message_id: a.p_rfc_message_id } };
      return [{ status: m.status, conversation_id: m.conversation_id }];
    },
    // 00177: a complaint is a no through the unsubscribe's own door; recorded here, proved on a database.
    set_email_marketing: (a) => {
      if (tables.emailNoesRefuse)
        throw new Error("set_email_marketing records an unsubscribe: opted_out, from unsubscribe");
      tables.emailNoes.push(a);
      return { changed: true, found: true };
    },
    // 00176, answered per host by the case: what the domain sent since it was clean.
    sending_domain_counts: () => counts ?? { sent: 0, bounced: 0, complained: 0 },
    // 00176: once, on this workspace's outbound email. Records whether the address was already stopped when it ran.
    stamp_email_complaint: (a) => {
      const m = tables.messages.find(
        (x) =>
          x.id === a.p_message_id &&
          x.tenant_id === a.p_tenant_id &&
          x.channel === "email" &&
          x.direction === "outbound",
      );
      if (!m || !m.meta?.email || m.meta.email.complained_at) return false;
      m.meta = { ...m.meta, email: { ...m.meta.email, complained_at: a.p_at } };
      tables.stampedBeforeSuppression = tables.contacts[0].email_suppressed_at === null;
      return true;
    },
  };
  setPg(fakeDb(tables, faults, rpcs));
  return tables;
}
let n = 0;
async function post(payload) {
  const raw = JSON.stringify(payload);
  const id = `msg_r${++n}`;
  const ts = String(Math.floor(Date.now() / 1000));
  const headers = {
    "content-type": "application/json",
    "svix-id": id,
    "svix-timestamp": ts,
    "svix-signature": `v1,${await resendWebhookSignature(SECRET, id, ts, raw)}`,
  };
  const res = await door.POST(
    new Request("https://chanlytics-messaging.vercel.app/api/resend-webhook", { method: "POST", headers, body: raw }),
    { waitUntil: () => {} },
  );
  return res.status;
}

test("every receipt teaches the row the provider's id and the Message-ID it left with, in any order; delivered moves it; sent moves nothing", async () => {
  const t = world({ status: "queued" });
  assert.equal(await post(receipt("sent")), 200);
  assert.deepEqual(
    [t.messages[0].status, t.messages[0].external_id, t.messages[0].meta.email.message_id],
    ["queued", "re_1", "<abc@mail.chanlytics.com>"],
    "a receipt that beat the send's own write leaves `sent` for the send to say",
  );
  assert.equal(t.messages[0].meta.email.subject, "Re: Quote", "what the row already kept is kept");

  const late = world();
  assert.equal(await post(receipt("delivered")), 200);
  assert.deepEqual(
    [late.messages[0].status, late.messages[0].meta.email.message_id],
    ["delivered", "<abc@mail.chanlytics.com>"],
    "delivered arrived first, and the ids came with it",
  );
  assert.deepEqual(late.escalations, []);
});

test("a permanent bounce flags the thread in words that say what to do, fails the row, and stops the address; the same receipt again does none of it twice", async () => {
  const t = world();
  assert.equal(await post(receipt("bounced", BOUNCE)), 200);
  assert.deepEqual(
    t.escalations.map((e) => [e.conversation_id, e.reason, e.details]),
    [["c1", "send_failed", EMAIL_FAILED_WORDS.bounced]],
  );
  assert.doesNotMatch(EMAIL_FAILED_WORDS.bounced, /@/, "the hold names no address");
  assert.deepEqual(
    [t.messages[0].status, t.messages[0].error.provider, t.messages[0].error.message],
    ["failed", "bounced", "550 5.1.1 no such user"],
  );
  assert.equal(t.contacts[0].email_suppressed_reason, "hard_bounce");
  assert.deepEqual(
    t.events.map((e) => [e.kind, e.subject_id, e.data]),
    [["contact.email_suppressed", "k1", { reason: "hard_bounce" }]],
    "the reason, never the address",
  );

  assert.equal(await post(receipt("bounced", BOUNCE)), 200, "Resend delivers at least once");
  assert.equal(t.escalations.length, 1);
  assert.equal(t.events.length, 1);
});

test("a complaint arrives after delivery: the row stays delivered and the address stops. A corrected address is a different address, and is not stopped", async () => {
  const t = world({ status: "delivered" });
  assert.equal(await post(receipt("complained")), 200);
  assert.deepEqual([t.messages[0].status, t.contacts[0].email_suppressed_reason], ["delivered", "complaint"]);
  assert.deepEqual(t.escalations, [], "nothing failed to arrive");
  // The row is stamped, so the domain it left from answers for it (00176), and before the address stops.
  assert.ok(t.messages[0].meta.email.complained_at);
  assert.equal(t.stampedBeforeSuppression, true);
  const first = t.messages[0].meta.email.complained_at;
  assert.equal(await post(receipt("complained")), 200, "Resend delivers at least once");
  assert.equal(t.messages[0].meta.email.complained_at, first, "stamped once");
  // A complaint is a no, through the unsubscribe's own door (Part 2.5 D7): the person and the email it was about.
  assert.deepEqual(
    t.emailNoes.map((a) => [a.p_contact_id, a.p_state, a.p_source, a.p_message_id]),
    [
      ["k1", "opted_out", "complaint", M],
      ["k1", "opted_out", "complaint", M],
    ],
    "asked each time the receipt comes; the door itself records the no once (email-marketing.db.test.mjs)",
  );

  const corrected = world({ email: "ana.new@example.com" });
  assert.equal(await post(receipt("bounced", BOUNCE)), 200);
  assert.equal(corrected.contacts[0].email_suppressed_at, null, "the bounce was about the old address");
  assert.equal(corrected.messages[0].status, "failed", "and the email that went there still failed");
});

test("a flag that cannot be written sends the receipt back with the row untouched; a receipt for nobody's row is acknowledged and changes nothing", async () => {
  const t = world({ faults: { "escalations.insert": { message: "connection reset" } } });
  assert.equal(await post(receipt("bounced", BOUNCE)), 503);
  assert.equal(
    t.messages[0].status,
    "sent",
    "REGRESSION guard: failing the row first would make the retry a receipt already seen, and the thread would never be flagged",
  );

  const other = world();
  assert.equal(
    await post(
      receipt("bounced", { ...BOUNCE, tags: { cl_message: M, cl_tenant: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" } }),
    ),
    200,
  );
  assert.equal(await post(receipt("delivered", { tags: { category: "alert" } })), 200);
  assert.deepEqual(
    [other.messages[0].status, other.messages[0].external_id, other.contacts[0].email_suppressed_at],
    ["sent", null, null],
    "a tag naming another workspace reaches no row",
  );
  world({ faults: { "messages.update": { message: "statement timeout" } } });
  assert.equal(await post(receipt("delivered")), 503);
});

test("a first email's receipts find its row by the tags its request left with: the row it was queued as", async () => {
  const request = buildEmailRequest({
    identity: {
      fromName: "Best Movers",
      fromAddress: "bestmovers@mail.chanlytics.com",
      replyTo: `r+${"a".repeat(24)}@mail.chanlytics.com`,
    },
    to: ADDRESS,
    parent: null,
    subject: "The calls you miss mid-session",
    body: "Hello.",
    signature: null,
    actor: "ai",
    campaign: {
      unsubscribeUrl: "https://app.chanlytics.com/u/tok",
      footer: "Best Movers · 1 Main St, Austin, TX 78701",
    },
    messageId: M,
    tenantId: T,
  });
  const tags = Object.fromEntries(request.tags.map((x) => [x.name, x.value]));
  const delivered = world();
  assert.equal(await post(receipt("delivered", { subject: request.subject, tags })), 200);
  assert.equal(delivered.messages[0].status, "delivered");
  const bounced = world();
  assert.equal(await post(receipt("bounced", { subject: request.subject, tags, ...BOUNCE })), 200);
  assert.equal(bounced.messages[0].status, "failed");
  assert.ok(bounced.contacts[0].email_suppressed_at, "and a permanent bounce stops the address");
});

test("a complaint on an email from the workspace's own domain holds that domain when the receipt lands, not at the next sweep (Part 2.5 D7)", async () => {
  const from = '"Sam at Harbor" <sam@getharbor.example>';
  const t = world({
    status: "delivered",
    meta: { email: { subject: "Your moving quotes", request: { from, to: [ADDRESS] } } },
    domains: [
      {
        id: "d1",
        tenant_id: T,
        host: "getharbor.example",
        from_local: "sam",
        from_name: "Sam at Harbor",
        provider_domain_id: "pd-1",
        records: [],
        state: "verified",
        provider_status: "verified",
        dmarc: "found",
        held_why: null,
        held_at: null,
        verified_at: "2026-09-01T00:00:00Z",
        clean_since: "2026-09-01T00:00:00Z",
        checked_at: null,
        created_by: null,
        created_at: "2026-08-30T00:00:00Z",
        updated_at: "2026-09-17T11:00:00Z",
      },
    ],
    counts: { sent: 12, bounced: 0, complained: 1 },
  });
  assert.equal(await post(receipt("complained")), 200);
  const d = t.sending_domains[0];
  assert.deepEqual([d.state, d.held_why, d.complaints], ["held", "complaint", 1]);
  assert.equal(t.events.filter((e) => e.kind === "sending_domain.held").length, 1);
  assert.equal(t.notifications.length, 1, "its owner told once");

  // A complaint on an email that did not leave from an own domain holds nothing, even with a domain there to hold.
  const hosted = world({
    status: "delivered",
    domains: [{ ...t.sending_domains[0], state: "verified", held_why: null, held_at: null }],
    counts: { sent: 1, bounced: 0, complained: 1 },
  });
  assert.equal(await post(receipt("complained")), 200);
  assert.equal(hosted.events.filter((e) => e.kind === "sending_domain.held").length, 0);
  assert.equal(hosted.sending_domains[0].state, "verified");
});

test("a complaint stops the address first: a no that cannot be recorded sends the receipt back, with the address already stopped", async () => {
  const t = world({ status: "delivered" });
  // The door refuses (say, the edge deployed before 00177): the receipt comes back, and the stop it could make, it made.
  const refusing = t;
  refusing.emailNoesRefuse = true;
  const code = await post(receipt("complained"));
  assert.equal(code, 503, "sent back, so Resend delivers it again");
  assert.equal(t.contacts[0].email_suppressed_reason, "complaint", "the address stopped before the no was asked");
});

test("a campaign's email that bounces fails its row and stops the address, and flags no thread: nobody there wrote (Part 2.6, D4)", async () => {
  // Frozen as the send path freezes a reach-out: a first email from an own domain, with its unsubscribe.
  const request = buildEmailRequest({
    identity: ownDomainIdentity(
      { host: "getharbor.example", from_local: "sam", from_name: "Sam at Harbor" },
      { local_part: "harbor", reply_token: "a".repeat(24), from_name: "Harbor" },
      "mail.chanlytics.com",
    ),
    to: ADDRESS,
    parent: null,
    subject: "Your moving quotes",
    body: "Saw your shop on the map.",
    signature: null,
    actor: "ai",
    campaign: {
      unsubscribeUrl: "https://app.chanlytics.com/u/t",
      footer: "Unsubscribe: https://app.chanlytics.com/u/t",
    },
    messageId: M,
    tenantId: T,
  });
  const t = world({ meta: { email: { subject: request.subject, to: request.to[0], request } } });
  assert.equal(await post(receipt("bounced", BOUNCE)), 200);
  assert.deepEqual(t.escalations, [], "no thread is flagged for a campaign's bounce");
  assert.deepEqual(
    [t.messages[0].status, t.messages[0].error.provider],
    ["failed", "bounced"],
    "the row says it, and counts",
  );
  assert.equal(t.contacts[0].email_suppressed_reason, "hard_bounce", "and the address stops, as for any email");
});

test("a reach-out's email that bounces for good marks its lead's address invalid (C11); a transient bounce, or a reply's, marks no lead", async () => {
  const lead = (id) => ({
    id,
    tenant_id: T,
    email_state: "ok",
    email_checked_at: null,
    version: 3,
    erased_at: null,
    blanked_at: null,
  });
  const cold = { source: "reach_out", email: { subject: "A quote" }, reach_out: { lead_id: "l1" } };

  const t = world({ meta: cold });
  t.leads = [lead("l1"), lead("l2")];
  assert.equal(await post(receipt("bounced", BOUNCE)), 200);
  const l1 = t.leads.find((l) => l.id === "l1");
  assert.deepEqual([l1.email_state, l1.version], ["invalid", 4]);
  assert.ok(l1.email_checked_at, "when it was found out");
  assert.equal(t.leads.find((l) => l.id === "l2").email_state, "ok", "only the lead the email was written for");
  // The same receipt again marks nothing twice.
  assert.equal(await post(receipt("bounced", BOUNCE)), 200);
  assert.equal(t.leads.find((l) => l.id === "l1").version, 4);

  const transient = world({ meta: cold });
  transient.leads = [lead("l1")];
  const FULL = { bounce: { type: "Transient", subType: "MailboxFull", message: "full" } };
  assert.equal(await post(receipt("bounced", FULL)), 200);
  assert.deepEqual(
    [transient.leads[0].email_state, transient.leads[0].version],
    ["ok", 3],
    "a full mailbox is not a bad address",
  );

  const reply = world();
  reply.leads = [lead("l1")];
  assert.equal(await post(receipt("bounced", BOUNCE)), 200);
  assert.deepEqual([reply.leads[0].email_state, reply.leads[0].version], ["ok", 3], "a reply names no lead");
});

test("a bounce marks no lead that was erased or blanked: what is gone stays gone (C11)", async () => {
  const cold = { source: "reach_out", email: { subject: "A quote" }, reach_out: { lead_id: "l1" } };
  for (const gone of [{ erased_at: "2026-09-20T00:00:00Z" }, { blanked_at: "2026-09-20T00:00:00Z" }]) {
    const t = world({ meta: cold });
    t.leads = [{ id: "l1", tenant_id: T, email_state: "ok", version: 3, erased_at: null, blanked_at: null, ...gone }];
    assert.equal(await post(receipt("bounced", BOUNCE)), 200);
    assert.deepEqual([t.leads[0].email_state, t.leads[0].version], ["ok", 3], JSON.stringify(gone));
  }
});
