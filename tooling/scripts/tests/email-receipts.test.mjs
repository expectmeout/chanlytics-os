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
function world({ status = "sent", email = ADDRESS, faults = {} } = {}) {
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
        meta: { email: { subject: "Re: Quote" } },
      },
    ],
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
