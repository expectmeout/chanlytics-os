/**
 * What arrives, read without a network.
 *
 * Whether a webhook is Resend's; which of the platform's addresses a delivery
 * names; what an event and a fetched email carry, in either shape a provider
 * might send a list or a header map; what an email's words are; and what a
 * message CLAIMS to be, from headers anyone can write. Every one of these is a
 * decision about somebody else's input, so each is pinned by value.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  addressOf, classifyReceived, emailPlainText, emailReceivedEventFrom, messageIdsIn, platformRecipient,
  receivedEmailFrom, resendWebhookSignature, verifyResendWebhook, WEBHOOK_TOLERANCE_S,
} from "@chanlytics/channels";

const DOMAIN = "mail.chanlytics.com";
const SECRET = `whsec_${Buffer.from("a-webhook-signing-secret-of-32b!").toString("base64")}`;
const NOW = Date.parse("2026-09-17T12:00:00Z");
const TS = String(NOW / 1000);
const BODY = JSON.stringify({ type: "email.received", data: { email_id: "rcv_1", to: ["bestmovers@mail.chanlytics.com"] } });

test("the signature is Svix's: HMAC-SHA256 over id.timestamp.body with the bytes behind the whsec_ secret, checked against node's own", async () => {
  const ours = await resendWebhookSignature(SECRET, "msg_1", TS, BODY);
  const nodes = createHmac("sha256", Buffer.from(SECRET.slice(6), "base64")).update(`msg_1.${TS}.${BODY}`).digest("base64");
  assert.equal(ours, nodes);
  assert.equal(await resendWebhookSignature("whsec_not base64 !!", "msg_1", TS, BODY), null, "a secret that is not one signs nothing");
});

test("a delivery is Resend's only with every header, a fresh timestamp, the raw body, and a v1 signature that matches; during a rotation any one of several passes", async () => {
  const sig = await resendWebhookSignature(SECRET, "msg_1", TS, BODY);
  const h = (over = {}) => ({ id: "msg_1", timestamp: TS, signature: `v1,${sig}`, ...over });
  assert.equal(await verifyResendWebhook(SECRET, h(), BODY, NOW), true);
  assert.equal(await verifyResendWebhook(SECRET, h({ signature: `v1,AAAA v1,${sig}` }), BODY, NOW), true, "the second of two, while a secret rotates");

  assert.equal(await verifyResendWebhook(undefined, h(), BODY, NOW), false, "no secret on this deployment: every delivery is refused");
  assert.equal(await verifyResendWebhook(SECRET, h(), BODY.replace("rcv_1", "rcv_2"), NOW), false, "a body that is not the one that was signed");
  assert.equal(await verifyResendWebhook(SECRET, h(), JSON.stringify(JSON.parse(BODY), null, 2), NOW), false, "a re-serialised body signs differently: the RAW one is what was signed");
  assert.equal(await verifyResendWebhook(SECRET, h({ id: "msg_2" }), BODY, NOW), false);
  assert.equal(await verifyResendWebhook(SECRET, h({ signature: `v2,${sig}` }), BODY, NOW), false, "only v1");
  assert.equal(await verifyResendWebhook(SECRET, h({ signature: sig }), BODY, NOW), false);
  for (const missing of ["id", "timestamp", "signature"]) assert.equal(await verifyResendWebhook(SECRET, h({ [missing]: null }), BODY, NOW), false, `no ${missing}`);
  assert.equal(await verifyResendWebhook(SECRET, h(), BODY, NOW + (WEBHOOK_TOLERANCE_S + 1) * 1000), false, "a captured delivery is not replayable for longer than the tolerance");
  assert.equal(await verifyResendWebhook(SECRET, h(), BODY, NOW - (WEBHOOK_TOLERANCE_S + 1) * 1000), false, "nor one from the future");
  assert.equal(await verifyResendWebhook(SECRET, h({ timestamp: "soon" }), BODY, NOW), false);
});

test("an address routes only when it is exactly one the platform assigned: a published address, or a reply route's token", () => {
  assert.deepEqual(platformRecipient("bestmovers@mail.chanlytics.com", DOMAIN), { kind: "mailbox", localPart: "bestmovers" });
  assert.deepEqual(platformRecipient("  BestMovers@Mail.Chanlytics.COM ", DOMAIN), { kind: "mailbox", localPart: "bestmovers" });
  assert.deepEqual(platformRecipient(`r+${"a".repeat(24)}@mail.chanlytics.com`, DOMAIN), { kind: "reply", token: "a".repeat(24) });
  for (const no of [
    "bestmovers@chanlytics.com", "bestmovers@mail.chanlytics.com.evil.test", "bestmovers@evilmail.chanlytics.com",
    "r@mail.chanlytics.com", "r+short@mail.chanlytics.com", `r+${"A".repeat(24)}x@mail.chanlytics.com`,
    "bestmovers+tag@mail.chanlytics.com", "best_movers@mail.chanlytics.com", "@mail.chanlytics.com", "nonsense",
  ]) assert.equal(platformRecipient(no, DOMAIN), null, no);
});

test("an address header is an address and a phrase, apart; the phrase is the sender's own and proves nothing", () => {
  assert.deepEqual(addressOf("Ana Reyes <Ana@Example.com>"), { address: "ana@example.com", name: "Ana Reyes" });
  assert.deepEqual(addressOf('"Reyes, Ana" <ana@example.com>'), { address: "ana@example.com", name: "Reyes, Ana" });
  assert.deepEqual(addressOf("ana@example.com"), { address: "ana@example.com", name: null });
  assert.deepEqual(addressOf("Best Movers <info@bestmovers.com>\r\nBcc: x@evil.test"), null, "a header smuggled into a header is not an address");
  for (const no of ["", null, undefined, "Ana Reyes", "<>", "ana@", "Ana <ana at example.com>"]) assert.equal(addressOf(no), null, JSON.stringify(no));
});

test("the received event is a pointer and the addresses it was delivered to, from to, cc and bcc; any other event has no work here", () => {
  const ev = emailReceivedEventFrom({
    type: "email.received",
    data: { email_id: "rcv_1", to: ["Best Movers <bestmovers@mail.chanlytics.com>"], cc: "ana@example.com", bcc: ["r+" + "b".repeat(24) + "@mail.chanlytics.com", "bestmovers@mail.chanlytics.com"] },
  });
  assert.deepEqual(ev, { type: "email.received", receivedId: "rcv_1", recipients: ["bestmovers@mail.chanlytics.com", "ana@example.com", `r+${"b".repeat(24)}@mail.chanlytics.com`] });
  assert.equal(emailReceivedEventFrom({ type: "email.received", data: { id: "rcv_2", to: [] } }).receivedId, "rcv_2", "the id under either name");
  for (const no of [null, {}, { type: "email.delivered", data: { email_id: "x" } }, { type: "email.received" }, { type: "email.received", data: { to: ["a@b.co"] } }]) {
    assert.equal(emailReceivedEventFrom(no), null, JSON.stringify(no));
  }
});

test("a fetched email, with its headers as a map or as a list of pairs, a repeated header keeping its first value", () => {
  const asMap = receivedEmailFrom({
    id: "rcv_1", from: "Ana Reyes <ana@example.com>", to: ["bestmovers@mail.chanlytics.com"], cc: [], subject: "Quote for Saturday",
    text: "Hi,\r\ncan you do Saturday?", html: "<p>Hi</p>", message_id: "<q1@customer.example>", created_at: "2026-09-17T11:59:00Z",
    headers: { "In-Reply-To": "<our1@mail.chanlytics.com>", References: "<our0@mail.chanlytics.com> <our1@mail.chanlytics.com>" },
    attachments: [{ filename: "floorplan.pdf", content_type: "application/pdf", size: 120000 }, { nonsense: true }],
  });
  assert.deepEqual(asMap.from, { address: "ana@example.com", name: "Ana Reyes" });
  assert.equal(asMap.messageId, "<q1@customer.example>");
  assert.equal(asMap.headers["in-reply-to"], "<our1@mail.chanlytics.com>", "header names are lower-cased");
  assert.deepEqual(messageIdsIn(asMap.headers.references), ["<our0@mail.chanlytics.com>", "<our1@mail.chanlytics.com>"]);
  assert.deepEqual(asMap.attachments, [{ filename: "floorplan.pdf", contentType: "application/pdf", size: 120000 }, { filename: null, contentType: null, size: null }]);

  const asPairs = receivedEmailFrom({
    id: "rcv_2", to: "bestmovers@mail.chanlytics.com",
    headers: [{ name: "From", value: "ana@example.com" }, { name: "Subject", value: "Hello" }, { name: "Message-ID", value: "<q2@customer.example>" }, { name: "Subject", value: "A second subject" }],
  });
  assert.deepEqual([asPairs.from.address, asPairs.subject, asPairs.messageId, asPairs.to], ["ana@example.com", "Hello", "<q2@customer.example>", ["bestmovers@mail.chanlytics.com"]]);
  for (const no of [null, "x", {}, { id: 7 }]) assert.equal(receivedEmailFrom(no), null);
});

test("an email's words are its plain-text part; one with only HTML is reduced to text with nothing remote fetched and no markup kept", () => {
  assert.equal(emailPlainText({ text: "Hi,\r\ncan you do Saturday?\r\n", html: "<p>ignored</p>" }), "Hi,\ncan you do Saturday?");
  const fromHtml = emailPlainText({ text: null, html: '<style>p{color:red}</style><p>New lead</p><p>Name: <b>Ana</b><br>Details: <a href="https://forms.example/lead/7">open</a></p><img src="https://track.example/p.gif"><script>steal()</script>' });
  assert.equal(fromHtml, "New lead\n\nName: Ana\nDetails: open [https://forms.example/lead/7]");
  assert.equal(emailPlainText({ text: "  ", html: null }), null);
  assert.equal(emailPlainText({ text: null, html: "<p> </p>" }), null);
});

test("what a message claims to be: a report and an automatic reply before the generic automated mark, because both carry it; a person otherwise", () => {
  const claim = (headers, from = "ana@example.com") => classifyReceived({ headers, from: { address: from, name: null } });
  assert.equal(claim({}), "person");
  assert.equal(claim({ "auto-submitted": "no" }), "person");
  assert.equal(claim({ "content-type": 'multipart/report; report-type=delivery-status; boundary="x"', "auto-submitted": "auto-replied" }), "report", "a bounce is auto-submitted too, and is a report first");
  assert.equal(claim({}, "MAILER-DAEMON@mx.example".toLowerCase()), "report");
  assert.equal(claim({ "auto-submitted": "auto-replied" }), "auto_reply");
  assert.equal(claim({ "auto-submitted": "auto-replied; owner-email=x" }), "auto_reply");
  assert.equal(claim({ "x-autoreply": "yes" }), "auto_reply");
  assert.equal(claim({ precedence: "auto_reply" }), "auto_reply");
  assert.equal(claim({ "auto-submitted": "auto-generated" }), "automated", "mail a program produced: a form, a notification. Kept, and never answered by itself");
  assert.equal(claim({ precedence: "bulk" }), "automated");
  assert.equal(claim({ "list-id": "<news.brand.example>" }), "automated");
  assert.equal(claim({ "list-unsubscribe": "<mailto:u@brand.example>" }), "automated");
});
