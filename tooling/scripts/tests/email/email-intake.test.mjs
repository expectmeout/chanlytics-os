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
  addressOf,
  classifyReceived,
  emailPlainText,
  emailReceivedEventFrom,
  messageIdsIn,
  platformRecipient,
  receivedEmailFrom,
  resendWebhookSignature,
  senderAuthenticated,
  verifyResendWebhook,
  WEBHOOK_TOLERANCE_S,
} from "@chanlytics/channels";

const DOMAIN = "mail.chanlytics.com";
const SECRET = `whsec_${Buffer.from("a-webhook-signing-secret-of-32b!").toString("base64")}`;
const NOW = Date.parse("2026-09-17T12:00:00Z");
const TS = String(NOW / 1000);
const BODY = JSON.stringify({
  type: "email.received",
  data: { email_id: "rcv_1", to: ["bestmovers@mail.chanlytics.com"] },
});

test("the signature is Svix's: HMAC-SHA256 over id.timestamp.body with the bytes behind the whsec_ secret, checked against node's own", async () => {
  const ours = await resendWebhookSignature(SECRET, "msg_1", TS, BODY);
  const nodes = createHmac("sha256", Buffer.from(SECRET.slice(6), "base64"))
    .update(`msg_1.${TS}.${BODY}`)
    .digest("base64");
  assert.equal(ours, nodes);
  assert.equal(
    await resendWebhookSignature("whsec_not base64 !!", "msg_1", TS, BODY),
    null,
    "a secret that is not one signs nothing",
  );
});

test("a delivery is Resend's only with every header, a fresh timestamp, the raw body, and a v1 signature that matches; during a rotation any one of several passes", async () => {
  const sig = await resendWebhookSignature(SECRET, "msg_1", TS, BODY);
  const h = (over = {}) => ({ id: "msg_1", timestamp: TS, signature: `v1,${sig}`, ...over });
  assert.equal(await verifyResendWebhook(SECRET, h(), BODY, NOW), true);
  assert.equal(
    await verifyResendWebhook(SECRET, h({ signature: `v1,AAAA v1,${sig}` }), BODY, NOW),
    true,
    "the second of two, while a secret rotates",
  );

  assert.equal(
    await verifyResendWebhook(undefined, h(), BODY, NOW),
    false,
    "no secret on this deployment: every delivery is refused",
  );
  assert.equal(
    await verifyResendWebhook(SECRET, h(), BODY.replace("rcv_1", "rcv_2"), NOW),
    false,
    "a body that is not the one that was signed",
  );
  assert.equal(
    await verifyResendWebhook(SECRET, h(), JSON.stringify(JSON.parse(BODY), null, 2), NOW),
    false,
    "a re-serialised body signs differently: the RAW one is what was signed",
  );
  assert.equal(await verifyResendWebhook(SECRET, h({ id: "msg_2" }), BODY, NOW), false);
  assert.equal(await verifyResendWebhook(SECRET, h({ signature: `v2,${sig}` }), BODY, NOW), false, "only v1");
  assert.equal(await verifyResendWebhook(SECRET, h({ signature: sig }), BODY, NOW), false);
  for (const missing of ["id", "timestamp", "signature"])
    assert.equal(await verifyResendWebhook(SECRET, h({ [missing]: null }), BODY, NOW), false, `no ${missing}`);
  assert.equal(
    await verifyResendWebhook(SECRET, h(), BODY, NOW + (WEBHOOK_TOLERANCE_S + 1) * 1000),
    false,
    "a captured delivery is not replayable for longer than the tolerance",
  );
  assert.equal(
    await verifyResendWebhook(SECRET, h(), BODY, NOW - (WEBHOOK_TOLERANCE_S + 1) * 1000),
    false,
    "nor one from the future",
  );
  assert.equal(await verifyResendWebhook(SECRET, h({ timestamp: "soon" }), BODY, NOW), false);
});

test("an address routes only when it is exactly one the platform assigned: a published address, or a reply route's token", () => {
  assert.deepEqual(platformRecipient("bestmovers@mail.chanlytics.com", DOMAIN), {
    kind: "mailbox",
    localPart: "bestmovers",
  });
  assert.deepEqual(platformRecipient("  BestMovers@Mail.Chanlytics.COM ", DOMAIN), {
    kind: "mailbox",
    localPart: "bestmovers",
  });
  assert.deepEqual(platformRecipient(`r+${"a".repeat(24)}@mail.chanlytics.com`, DOMAIN), {
    kind: "reply",
    token: "a".repeat(24),
  });
  for (const no of [
    "bestmovers@chanlytics.com",
    "bestmovers@mail.chanlytics.com.evil.test",
    "bestmovers@evilmail.chanlytics.com",
    "r@mail.chanlytics.com",
    "r+short@mail.chanlytics.com",
    `r+${"A".repeat(24)}x@mail.chanlytics.com`,
    "bestmovers+tag@mail.chanlytics.com",
    "best_movers@mail.chanlytics.com",
    "@mail.chanlytics.com",
    "nonsense",
  ])
    assert.equal(platformRecipient(no, DOMAIN), null, no);
});

test("an address header is an address and a phrase, apart; the phrase is the sender's own and proves nothing", () => {
  assert.deepEqual(addressOf("Ana Reyes <Ana@Example.com>"), { address: "ana@example.com", name: "Ana Reyes" });
  assert.deepEqual(addressOf('"Reyes, Ana" <ana@example.com>'), { address: "ana@example.com", name: "Reyes, Ana" });
  assert.deepEqual(addressOf("ana@example.com"), { address: "ana@example.com", name: null });
  assert.deepEqual(
    addressOf("Best Movers <info@bestmovers.com>\r\nBcc: x@evil.test"),
    null,
    "a header smuggled into a header is not an address",
  );
  for (const no of ["", null, undefined, "Ana Reyes", "<>", "ana@", "Ana <ana at example.com>"])
    assert.equal(addressOf(no), null, JSON.stringify(no));
});

test("the received event is a pointer and the addresses it was delivered to, from to, cc and bcc; any other event has no work here", () => {
  const ev = emailReceivedEventFrom({
    type: "email.received",
    data: {
      email_id: "rcv_1",
      to: ["Best Movers <bestmovers@mail.chanlytics.com>"],
      cc: "ana@example.com",
      bcc: ["r+" + "b".repeat(24) + "@mail.chanlytics.com", "bestmovers@mail.chanlytics.com"],
    },
  });
  assert.deepEqual(ev, {
    type: "email.received",
    receivedId: "rcv_1",
    recipients: ["bestmovers@mail.chanlytics.com", "ana@example.com", `r+${"b".repeat(24)}@mail.chanlytics.com`],
  });
  assert.equal(
    emailReceivedEventFrom({ type: "email.received", data: { id: "rcv_2", to: [] } }).receivedId,
    "rcv_2",
    "the id under either name",
  );
  for (const no of [
    null,
    {},
    { type: "email.delivered", data: { email_id: "x" } },
    { type: "email.received" },
    { type: "email.received", data: { to: ["a@b.co"] } },
  ]) {
    assert.equal(emailReceivedEventFrom(no), null, JSON.stringify(no));
  }
});

test("a fetched email, with its headers as a map or as a list of pairs, a repeated header keeping its first value", () => {
  const asMap = receivedEmailFrom({
    id: "rcv_1",
    from: "Ana Reyes <ana@example.com>",
    to: ["bestmovers@mail.chanlytics.com"],
    cc: [],
    subject: "Quote for Saturday",
    text: "Hi,\r\ncan you do Saturday?",
    html: "<p>Hi</p>",
    message_id: "<q1@customer.example>",
    created_at: "2026-09-17T11:59:00Z",
    headers: {
      "In-Reply-To": "<our1@mail.chanlytics.com>",
      References: "<our0@mail.chanlytics.com> <our1@mail.chanlytics.com>",
    },
    attachments: [{ filename: "floorplan.pdf", content_type: "application/pdf", size: 120000 }, { nonsense: true }],
  });
  assert.deepEqual(asMap.from, { address: "ana@example.com", name: "Ana Reyes" });
  assert.equal(asMap.messageId, "<q1@customer.example>");
  assert.equal(asMap.headers["in-reply-to"], "<our1@mail.chanlytics.com>", "header names are lower-cased");
  assert.deepEqual(messageIdsIn(asMap.headers.references), [
    "<our0@mail.chanlytics.com>",
    "<our1@mail.chanlytics.com>",
  ]);
  assert.deepEqual(asMap.attachments, [
    { filename: "floorplan.pdf", contentType: "application/pdf", size: 120000 },
    { filename: null, contentType: null, size: null },
  ]);

  const asPairs = receivedEmailFrom({
    id: "rcv_2",
    to: "bestmovers@mail.chanlytics.com",
    headers: [
      { name: "From", value: "ana@example.com" },
      { name: "Subject", value: "Hello" },
      { name: "Message-ID", value: "<q2@customer.example>" },
      { name: "Subject", value: "A second subject" },
    ],
  });
  assert.deepEqual(
    [asPairs.from.address, asPairs.subject, asPairs.messageId, asPairs.to],
    ["ana@example.com", "Hello", "<q2@customer.example>", ["bestmovers@mail.chanlytics.com"]],
  );
  for (const no of [null, "x", {}, { id: 7 }]) assert.equal(receivedEmailFrom(no), null);
});

test("an email's words are its plain-text part; one with only HTML is reduced to text with nothing remote fetched and no markup kept", () => {
  assert.equal(
    emailPlainText({ text: "Hi,\r\ncan you do Saturday?\r\n", html: "<p>ignored</p>" }),
    "Hi,\ncan you do Saturday?",
  );
  const fromHtml = emailPlainText({
    text: null,
    html: '<style>p{color:red}</style><p>New lead</p><p>Name: <b>Ana</b><br>Details: <a href="https://forms.example/lead/7">open</a></p><img src="https://track.example/p.gif"><script>steal()</script>',
  });
  assert.equal(fromHtml, "New lead\n\nName: Ana\nDetails: open [https://forms.example/lead/7]");
  assert.equal(emailPlainText({ text: "  ", html: null }), null);
  assert.equal(emailPlainText({ text: null, html: "<p> </p>" }), null);
});

test("what a message claims to be: a report and an automatic reply before the generic automated mark, because both carry it; a person otherwise", () => {
  const claim = (headers, from = "ana@example.com") =>
    classifyReceived({ headers, from: { address: from, name: null } });
  assert.equal(claim({}), "person");
  assert.equal(claim({ "auto-submitted": "no" }), "person");
  assert.equal(
    claim({
      "content-type": 'multipart/report; report-type=delivery-status; boundary="x"',
      "auto-submitted": "auto-replied",
    }),
    "report",
    "a bounce is auto-submitted too, and is a report first",
  );
  assert.equal(claim({}, "MAILER-DAEMON@mx.example".toLowerCase()), "report");
  assert.equal(claim({ "auto-submitted": "auto-replied" }), "auto_reply");
  assert.equal(claim({ "auto-submitted": "auto-replied; owner-email=x" }), "auto_reply");
  assert.equal(claim({ "x-autoreply": "yes" }), "auto_reply");
  assert.equal(claim({ precedence: "auto_reply" }), "auto_reply");
  assert.equal(
    claim({ "auto-submitted": "auto-generated" }),
    "automated",
    "mail a program produced: a form, a notification. Kept, and never answered by itself",
  );
  assert.equal(claim({ precedence: "bulk" }), "automated");
  assert.equal(claim({ "list-id": "<news.brand.example>" }), "automated");
  assert.equal(claim({ "list-unsubscribe": "<mailto:u@brand.example>" }), "automated");
});

test("a yes is taken only from a sender the receiving side PROVED: an aligned DMARC pass, or a DKIM pass signed by the From domain; every other header shape, and none at all, is no proof (fails closed)", () => {
  // The receiving side's name, as configured (EMAIL_AUTHSERV_ID): only a header that opens with it is read at all.
  const proved = (headers, from = "ana@example.com", authservId = "mx.example.net") =>
    senderAuthenticated(
      {
        from: from === null ? null : { address: from, name: null },
        authResults: "authentication-results" in headers ? [headers["authentication-results"]] : [],
      },
      authservId,
    );
  const ar = (said) => ({ "authentication-results": said });

  // The shapes a forged From can arrive in, each of which used to count as authentic (it failed open).
  assert.equal(proved({}), false, "no Authentication-Results at all");
  assert.equal(proved(ar("")), false, "an empty header");
  assert.equal(proved(ar("mx.example.net; none")), false, "the receiving side says nothing of any method");
  assert.equal(proved(ar("mx.example.net; spf=none smtp.mailfrom=example.com")), false, "SPF has no record");
  assert.equal(proved(ar("mx.example.net; spf=neutral smtp.mailfrom=example.com")), false, "SPF neutral");
  assert.equal(proved(ar("mx.example.net; dkim=none")), false, "no DKIM signature");
  assert.equal(proved(ar("mx.example.net; dmarc=none header.from=example.com")), false, "no DMARC policy to pass");
  assert.equal(
    proved(ar("mx.example.net; spf=pass smtp.mailfrom=attacker.example")),
    false,
    "an SPF pass for the attacker's own envelope says nothing of the From line",
  );
  assert.equal(
    proved(ar("mx.example.net; spf=pass smtp.mailfrom=example.com")),
    false,
    "an SPF pass alone speaks for the envelope, not the From, and is no proof here",
  );
  assert.equal(
    proved(ar("mx.example.net; dkim=pass header.d=attacker.example; dmarc=pass header.from=attacker.example")),
    false,
    "passes, for another domain: an unaligned pass",
  );
  assert.equal(
    proved(ar("mx.example.net; dkim=pass header.d=attacker.example")),
    false,
    "a DKIM pass signed by someone else",
  );
  assert.equal(
    proved(ar("mx.example.net; dmarc=pass header.from=attacker.example")),
    false,
    "a DMARC pass for another From",
  );
  assert.equal(proved(ar("mx.example.net; dmarc=pass")), false, "a DMARC pass that names no From domain");
  assert.equal(proved(ar("mx.example.net; dkim=pass")), false, "a DKIM pass that names no signer");
  assert.equal(
    proved(ar("mx.example.net; dkim=pass header.d=mail.example.com")),
    false,
    "a sibling or parent is not the From domain",
  );
  assert.equal(proved(ar("mx.example.net; dkim=fail header.d=example.com")), false, "a failure");
  assert.equal(proved(ar("mx.example.net; dkim=softfail header.d=example.com")), false);
  assert.equal(proved(ar("mx.example.net; dkim=temperror header.d=example.com")), false);
  assert.equal(
    proved(ar("mx.example.net; dmarc=fail header.from=example.com")),
    false,
    "DMARC failing for the From domain",
  );
  assert.equal(
    proved(ar("mx.example.net; dkim=pass header.d=example.com; dmarc=fail header.from=example.com")),
    false,
    "a DMARC failure is not outvoted by a DKIM pass",
  );
  assert.equal(proved(ar("garbage ;;; = = ")), false, "an unreadable header");

  // The proofs: an aligned DMARC pass for the From domain, or a DKIM pass signed by it.
  assert.equal(proved(ar("mx.example.net; dmarc=pass header.from=example.com")), true);
  assert.equal(proved(ar("mx.example.net; dkim=pass header.d=example.com header.s=sel1")), true);
  assert.equal(
    proved(ar("mx.example.net; dkim=pass header.i=@example.com header.s=sel1")),
    true,
    "a verifier that says only the signing identity: its domain is the From domain",
  );
  assert.equal(
    proved(ar("mx.example.net; dkim=pass header.i=@attacker.example header.s=sel1")),
    false,
    "and an identity on another domain is not",
  );
  assert.equal(
    proved(ar("mx.example.net; dkim=pass header.d=attacker.example header.i=@example.com")),
    false,
    "a signing domain that is not the From's is not rescued by an identity that claims it",
  );
  assert.equal(
    proved(
      ar(
        "amazonses.com; spf=pass (spfCheck: domain of example.com designates 203.0.113.9 as permitted sender) " +
          "client-ip=203.0.113.9; envelope-from=ana@example.com; helo=mail.example.com; dkim=pass header.i=@example.com; " +
          "dmarc=pass header.from=example.com;",
      ),
      "ana@example.com",
      "amazonses.com",
    ),
    true,
    "the shape an Amazon SES receiving side writes, for a deployment configured with its name",
  );
  assert.equal(
    proved(ar("mx.example.net;\r\n\tspf=pass smtp.mailfrom=ana@example.com;\r\n\tdkim=pass header.d=example.com;")),
    true,
    "a header folded over lines",
  );
  assert.equal(proved(ar("MX.EXAMPLE.NET; DMARC=PASS HEADER.FROM=EXAMPLE.COM")), true, "case does not matter");
  assert.equal(
    proved(ar("mx.example.net; dmarc=pass header.from=example.com"), "Ana@EXAMPLE.com"),
    true,
    "nor the From's",
  );

  // What a sender writes into the receiver's header is not read: quoted strings and comments are dropped, so a forged
  // `header.d=` inside either proves nothing.
  assert.equal(
    proved(ar('mx.example.net; dkim=fail reason="header.d=example.com dkim=pass"')),
    false,
    "a quoted reason that spells a pass",
  );
  assert.equal(
    proved(ar("mx.example.net; dkim=fail (body hash did not verify; header.d=example.com dkim=pass)")),
    false,
    "a comment that spells a pass",
  );
  // No From, no proof.
  assert.equal(proved(ar("mx.example.net; dmarc=pass header.from=example.com"), null), false);
});

test("a header is the receiving side's only when it opens with that side's own name: another name proves nothing, no configured name proves nothing, and a header the receiving side did not write is not read wherever it sits", () => {
  const PASS = "dmarc=pass header.from=example.com";
  const of = (...authResults) => ({ from: { address: "ana@example.com", name: null }, authResults });
  const ID = "mx.example.net";
  // The proof, when the header is the receiving side's own.
  assert.equal(senderAuthenticated(of(`${ID}; ${PASS}`), ID), true);
  assert.equal(senderAuthenticated(of(`${ID} 1; ${PASS}`), ID), true, "the version RFC 8601 allows after the name");
  assert.equal(
    senderAuthenticated(of(`MX.Example.NET; ${PASS}`), "mx.EXAMPLE.net"),
    true,
    "names are not case sensitive",
  );
  assert.equal(senderAuthenticated(of(`(received by the edge) ${ID}; ${PASS}`), ID), true, "a comment before the name");

  // A forged one, with another name: a sender can write any line it likes, so a pass that opens with a name that is not the
  // receiving side's proves nothing, above the receiver's own or below it, or alone.
  const FORGED = `attacker.example; ${PASS}`;
  assert.equal(senderAuthenticated(of(FORGED), ID), false, "alone");
  assert.equal(senderAuthenticated(of(FORGED, `${ID}; dkim=none`), ID), false, "above the receiver's, which says no");
  assert.equal(senderAuthenticated(of(`${ID}; dkim=none`, FORGED), ID), false, "below it");
  assert.equal(senderAuthenticated(of(FORGED, `${ID}; dmarc=fail header.from=example.com`), ID), false);
  assert.equal(
    senderAuthenticated(of(`mx.example.net.attacker.example; ${PASS}`), ID),
    false,
    "a name that only starts with the receiver's is another name",
  );
  assert.equal(
    senderAuthenticated(of(`"${ID}"; ${PASS}`), ID),
    false,
    "a quoted name is not read as one (it fails closed)",
  );
  assert.equal(senderAuthenticated(of(`${ID.toUpperCase()}x; ${PASS}`), ID), false);
  // The receiver's own pass is still believed with a forged line beside it: the forged one is not read, not subtracted.
  assert.equal(senderAuthenticated(of(FORGED, `${ID}; ${PASS}`), ID), true);
  assert.equal(senderAuthenticated(of(`${ID}; ${PASS}`, FORGED), ID), true);
  // A header repeated under the receiver's own name is not one it wrote once: the copy is somebody's, and which one is the
  // receiver's is not told by where it sits. Neither is believed.
  assert.equal(senderAuthenticated(of(`${ID}; ${PASS}`, `${ID}; dkim=none`), ID), false, "a pass, then a nothing");
  assert.equal(senderAuthenticated(of(`${ID}; dkim=none`, `${ID}; ${PASS}`), ID), false, "a nothing, then a pass");
  assert.equal(senderAuthenticated(of(`${ID}; ${PASS}`, `${ID}; ${PASS}`), ID), false, "even two that agree");
  // No name configured: fail closed, whatever the header says. A no (STOP, UNSUBSCRIBE) never asks this at all.
  for (const none of [null, "", "  "])
    assert.equal(senderAuthenticated(of(`${ID}; ${PASS}`), none), false, `configured as ${JSON.stringify(none)}`);
  assert.equal(
    senderAuthenticated({ from: { address: "ana@example.com", name: null } }, ID),
    false,
    "no headers listed",
  );
  assert.equal(senderAuthenticated(of(), ID), false, "none at all");
  assert.equal(senderAuthenticated(of("; " + PASS), ID), false, "a header that opens with no name");
});

test("the fetched email keeps every Authentication-Results the provider listed, in order, whichever shape it sends its headers in: a repeated header is not collapsed to the one on top", () => {
  const both = receivedEmailFrom({
    id: "rcv_3",
    from: "Ana <ana@example.com>",
    headers: [
      { name: "Authentication-Results", value: "mx.example.net; dkim=none" },
      { name: "Subject", value: "hello" },
      { name: "authentication-results", value: "mx.example.net; dmarc=pass header.from=example.com" },
    ],
  });
  assert.deepEqual(both.authResults, [
    "mx.example.net; dkim=none",
    "mx.example.net; dmarc=pass header.from=example.com",
  ]);
  assert.equal(both.headers["authentication-results"], "mx.example.net; dkim=none", "the map still keeps the first");
  assert.equal(senderAuthenticated(both, "mx.example.net"), false, "two under the receiver's name are no proof");
  const proof = receivedEmailFrom({
    id: "rcv_4",
    from: "Ana <ana@example.com>",
    headers: { "Authentication-Results": "mx.example.net; dmarc=pass header.from=example.com" },
  });
  assert.deepEqual(proof.authResults, ["mx.example.net; dmarc=pass header.from=example.com"]);
  assert.equal(senderAuthenticated(proof, "mx.example.net"), true, "as a header map, as the fetched email carries it");
  assert.equal(senderAuthenticated(proof, "amazonses.com"), false, "the receiver's name is another's");
  // A map whose value repeats (an array) lists them all.
  const repeated = receivedEmailFrom({
    id: "rcv_5",
    from: "ana@example.com",
    headers: {
      "Authentication-Results": ["forged.example; dmarc=pass header.from=example.com", "mx.example.net; dkim=none"],
    },
  });
  assert.equal(repeated.authResults.length, 2);
  assert.equal(
    senderAuthenticated(repeated, "mx.example.net"),
    false,
    "the receiver's own says nothing; the forged is not read",
  );
  // No such header: none listed.
  assert.deepEqual(receivedEmailFrom({ id: "rcv_6", headers: { Subject: "hi" } }).authResults, []);
});

test("on the cold reply domain (D17) a reply route routes and nothing else: no workspace publishes an address there", () => {
  const COLD = "reply.coldlinks.example";
  assert.deepEqual(platformRecipient(`r+${"b".repeat(24)}@Reply.ColdLinks.example`, DOMAIN, COLD), {
    kind: "reply",
    token: "b".repeat(24),
  });
  assert.equal(platformRecipient("bestmovers@reply.coldlinks.example", DOMAIN, COLD), null);
  assert.equal(platformRecipient(`r+${"b".repeat(24)}@reply.coldlinks.example`, DOMAIN), null, "unset: not ours");
  assert.deepEqual(platformRecipient("bestmovers@mail.chanlytics.com", DOMAIN, COLD), {
    kind: "mailbox",
    localPart: "bestmovers",
  });
  // The same domain named twice is the mail domain, with its published addresses.
  assert.deepEqual(platformRecipient("bestmovers@mail.chanlytics.com", DOMAIN, DOMAIN), {
    kind: "mailbox",
    localPart: "bestmovers",
  });
});

test("the cold reply domain before the one set now still routes its replies while it winds down (D17)", () => {
  const both = ["reply-b.coldlinks.example", "reply-a.coldlinks.example"];
  for (const host of both)
    assert.deepEqual(
      platformRecipient(`r+${"b".repeat(24)}@${host}`, DOMAIN, both),
      { kind: "reply", token: "b".repeat(24) },
      host,
    );
  assert.equal(platformRecipient(`r+${"b".repeat(24)}@reply-c.coldlinks.example`, DOMAIN, both), null);
});
