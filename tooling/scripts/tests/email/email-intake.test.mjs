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
import { EMAIL_CLAIMS, isPersonsWords } from "@chanlytics/contracts";
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
  // A booking tool's notice (00345), by its sender's domain, and Gmail asking whether it may forward here, by Google's
  // own sender and its subject: each claimed after a report, before anything automated.
  assert.equal(
    classifyReceived({
      headers: { "auto-submitted": "auto-generated" },
      from: { address: "no-reply@booksy.com", name: "Booksy" },
      subject: "Dana Rivera: new booking Thursday, October 8, 2026 3:00 PM",
      text: "Dana Rivera\n(305) 555-0144\nThursday, October 8, 2026, 3:00 PM",
    }),
    "booking_notice",
  );
  assert.equal(
    classifyReceived({
      headers: {},
      from: { address: "forwarding-noreply@google.com", name: "Gmail Team" },
      subject: "(#4815162) Gmail Forwarding Confirmation - Receive Mail from owner@example.com",
      text: "owner@example.com has requested to automatically forward mail to your email address salon@mail.example.com.\nConfirmation code: 4815162\n\nhttps://mail-settings.google.com/mail/vf-%5BANGjdJ8%5D-abc",
    }),
    "forwarding_confirmation",
  );
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

test("every claim the intake answers is one contracts' EMAIL_CLAIMS declares, the set is no larger, and a person's words are what it marks them", () => {
  const from = { address: "ana@example.com", name: null };
  const said = new Set([
    classifyReceived({ headers: {}, from }),
    classifyReceived({ headers: { "content-type": "multipart/report; report-type=delivery-status" }, from }),
    classifyReceived({ headers: { "auto-submitted": "auto-replied" }, from }),
    classifyReceived({ headers: { precedence: "bulk" }, from }),
    classifyReceived({
      headers: { "auto-submitted": "auto-generated" },
      from: { address: "no-reply@booksy.com", name: "Booksy" },
      subject: "Dana Rivera: new booking Thursday, October 8, 2026 3:00 PM",
      text: "Dana Rivera\n(305) 555-0144\nThursday, October 8, 2026, 3:00 PM",
    }),
    classifyReceived({
      headers: {},
      from: { address: "forwarding-noreply@google.com", name: "Gmail Team" },
      subject: "(#4815162) Gmail Forwarding Confirmation - Receive Mail from owner@example.com",
      text: "owner@example.com has requested to automatically forward mail to your email address salon@mail.example.com.\nConfirmation code: 4815162\n\nhttps://mail-settings.google.com/mail/vf-%5BANGjdJ8%5D-abc",
    }),
  ]);
  assert.deepEqual(
    [...said].sort(),
    EMAIL_CLAIMS.map((c) => c.claim).sort(),
    "each claim the intake answers is declared, and each declared one is answered",
  );
  for (const { claim, personsWords } of EMAIL_CLAIMS)
    assert.equal(isPersonsWords({ email: { claim } }), personsWords, `isPersonsWords reads the mark: ${claim}`);
  assert.deepEqual(
    EMAIL_CLAIMS.filter((c) => !c.personsWords)
      .map((c) => c.claim)
      .sort(),
    ["auto_reply", "automated", "booking_notice", "forwarding_confirmation", "report"],
    "a booking tool's notice and Gmail's forwarding confirmation are no person's words (decision 5)",
  );
});

test("a yes is taken only from a sender the receiving side PROVED: the provider's own verdict says DMARC passed, or DKIM passed by the From domain; every other verdict, and none at all, is no proof (fails closed)", () => {
  const proved = (authentication, from = "ana@example.com") =>
    senderAuthenticated({ from: from === null ? null : { address: from, name: null }, headers: {}, authentication });
  const said = (spf, dkim, dmarc) => ({ spf, dkim, dmarc });

  // Proof. DMARC passed: an SPF or a DKIM pass aligned with the From domain, by definition. Or DKIM passed, which the
  // provider documents as a signature by the From domain (one by another domain it calls gray): how a sender whose
  // domain publishes no policy is proved, a person's own mailbox among them.
  assert.equal(proved(said("pass", "pass", "pass")), true, "everything holds");
  assert.equal(
    proved(said("fail", "pass", "pass")),
    true,
    "a forward: the envelope is the forwarder's, the signature holds",
  );
  assert.equal(proved(said("pass", "gray", "pass")), true, "DMARC by an aligned SPF pass, with no signature");
  assert.equal(proved(said("gray", "pass", "gray")), true, "signed by the From domain, which publishes no policy");
  assert.equal(proved(said("unknown", "pass", "unknown")), true, "the signature alone, the rest not worked out");

  // No proof: none of these says the From line is the sender's own.
  assert.equal(proved(null), false, "the provider gave no verdict");
  assert.equal(proved(undefined), false, "none handed over at all");
  assert.equal(proved(said("pass", "gray", "gray")), false, "an SPF pass alone speaks for the envelope, not the From");
  assert.equal(proved(said("pass", "fail", "gray")), false, "a signature that does not verify");
  assert.equal(proved(said("gray", "gray", "gray")), false, "nothing passed");
  assert.equal(proved(said("fail", "fail", "fail")), false, "everything failed");
  assert.equal(proved(said("pass", "pass", "fail")), false, "a DMARC failure, whatever stands beside it");
  assert.equal(proved(said("pass", "fail", "fail")), false);
  // Only the provider's own word for a pass is one: a word this does not know, and one spelled another way, is not.
  for (const word of ["processing_failed", "unknown", "", "PASS", "Pass", " pass", "passed", "true", "ok"])
    assert.equal(proved(said("pass", word, word)), false, `not the provider's pass: ${JSON.stringify(word)}`);
  // A DKIM pass stands by itself only where DMARC said nothing against it, in a word this knows: beside one it does
  // not know (a failure spelled another way, a word the provider adds one day, none at all) it is no proof.
  for (const dmarc of ["gray", "unknown", "processing_failed"])
    assert.equal(proved(said("gray", "pass", dmarc)), true, `DMARC said nothing: ${dmarc}`);
  for (const dmarc of ["FAIL", "Fail", "reject", "quarantine", "temperror", "permerror", "none", "", " gray"])
    assert.equal(proved(said("pass", "pass", dmarc)), false, `DMARC in a word not known: ${JSON.stringify(dmarc)}`);
  // No From, no proof: there is nobody for the verdict to be about.
  assert.equal(proved(said("pass", "pass", "pass"), null), false);
  assert.equal(proved(said("pass", "pass", "pass"), ""), false);
});

test("a verdict proves one mailbox, plainly: a From that names more than one, or whose own line names another than the provider does, is nobody's proof", () => {
  // A From line may list several mailboxes, and the intake reads the last. Which of them the provider reached its
  // verdict about is the provider's to choose: a yes signed by the first would be written down for the last.
  const PASS = { spf: "pass", dkim: "pass", dmarc: "pass" };
  const proved = (from, headers = {}) =>
    senderAuthenticated(receivedEmailFrom({ id: "rcv_4", from, headers, authentication: PASS }));

  assert.equal(proved("ana@example.com"), true, "an address");
  assert.equal(proved("Ana Reyes <ana@example.com>"), true, "a phrase and an address");
  assert.equal(proved('"Reyes, Ana" <ana@example.com>'), true, "a comma in a name is a name");
  assert.equal(proved('"ana@example.com" <ana@example.com>'), true, "the address written again as its own name");
  assert.equal(proved("'Ana@Example.com' <ana@example.com>"), true, "and as some clients quote it");

  assert.equal(proved('"A" <mallory@attacker.example>, "V" <ana@example.com>'), false, "two mailboxes");
  assert.equal(proved('mallory@attacker.example, "V" <ana@example.com>'), false, "the first one bare");
  assert.equal(proved("mallory@attacker.example, ana@example.com"), false, "both bare: no From at all");
  assert.equal(proved('"mallory@attacker.example" <ana@example.com>'), false, "another address as the name");
  assert.equal(proved('"Ana <ana@example.com>" <ana@example.com>'), false, "an angle bracket in the name");

  // The message's own From line, where the provider lists it, is one mailbox too, and the same one.
  assert.equal(proved("Ana <ana@example.com>", { From: "Ana Reyes <ana@example.com>" }), true, "the same mailbox");
  assert.equal(proved("Ana <ANA@example.com>", [{ name: "from", value: "ana@Example.com" }]), true, "in any case");
  assert.equal(
    proved("V <ana@example.com>", { From: '"A" <mallory@attacker.example>, "V" <ana@example.com>' }),
    false,
    "the provider names one of two the line lists",
  );
  assert.equal(
    proved("ana@example.com", { From: "mallory@attacker.example" }),
    false,
    "the line names another than the provider does",
  );
  assert.equal(proved("ana@example.com", { From: "not an address" }), false, "a line this cannot read is not a yes");
});

test("REGRESSION: what a message says of itself proves nothing -- an Authentication-Results header a sender wrote is not read, whatever it says and whichever name it carries; the provider's verdict alone decides", () => {
  // The proof used to be read out of the message's own Authentication-Results headers, the receiver's told from a
  // sender's copy by a name each deployment was given by hand (EMAIL_AUTHSERV_ID). Production was never given one, so
  // no sender was proved there at all; and a deployment given the wrong one would have believed whoever wrote it.
  const FORGED = [
    "amazonses.com; dkim=pass header.d=example.com; dmarc=pass header.from=example.com",
    "mx.example.net; dmarc=pass header.from=example.com",
  ];
  const email = (verdict) =>
    receivedEmailFrom({
      id: "rcv_5",
      from: "Ana Reyes <ana@example.com>",
      headers: FORGED.map((value) => ({ name: "Authentication-Results", value })),
      ...verdict,
    });
  assert.equal(senderAuthenticated(email({})), false, "two headers that spell a pass, and no verdict");
  assert.equal(senderAuthenticated(email({ authentication: null })), false, "and a verdict the provider did not keep");
  assert.equal(
    senderAuthenticated(email({ authentication: { spf: "fail", dkim: "gray", dmarc: "fail" } })),
    false,
    "beside a verdict that says no",
  );
  assert.equal(
    senderAuthenticated(email({ authentication: { spf: "fail", dkim: "pass", dmarc: "pass" } })),
    true,
    "the verdict is what proves, with the headers there or not",
  );
  // As a header map, the other shape the provider sends: the same.
  const asMap = receivedEmailFrom({
    id: "rcv_6",
    from: "ana@example.com",
    headers: { "Authentication-Results": FORGED[0], "ARC-Authentication-Results": FORGED[0] },
  });
  assert.equal(senderAuthenticated(asMap), false);
  // A header NAMED for the verdict is a header, a sender's to write: the verdict is the answer's own field.
  const named = receivedEmailFrom({
    id: "rcv_7",
    from: "ana@example.com",
    headers: { authentication: '{"spf":"pass","dkim":"pass","dmarc":"pass"}', Authentication: "pass" },
  });
  assert.equal(named.authentication, null);
  assert.equal(senderAuthenticated(named), false);
});

test("the fetched email carries the provider's verdict as the provider gave it: anything that is not one is none, and a check that is not a word passes nothing", () => {
  const of = (authentication) => receivedEmailFrom({ id: "rcv_8", from: "ana@example.com", authentication });
  // As the provider's receiving API answers: three words.
  assert.deepEqual(of({ spf: "pass", dkim: "pass", dmarc: "pass" }).authentication, {
    spf: "pass",
    dkim: "pass",
    dmarc: "pass",
  });
  assert.deepEqual(of({ spf: "gray", dkim: "processing_failed", dmarc: "unknown" }).authentication, {
    spf: "gray",
    dkim: "processing_failed",
    dmarc: "unknown",
  });
  // Null is the provider's word for an email from before it kept one; the rest is not a verdict's shape.
  for (const none of [null, undefined, "pass", true, 1, [], ["pass", "pass", "pass"]]) {
    assert.equal(of(none).authentication, null, JSON.stringify(none));
    assert.equal(senderAuthenticated(of(none)), false, JSON.stringify(none));
  }
  assert.equal(
    receivedEmailFrom({ id: "rcv_9", headers: { Subject: "hi" } }).authentication,
    null,
    "none in the answer",
  );
  // A check left out is one that passed nothing; the others are read as they are.
  assert.deepEqual(of({ dkim: "pass" }).authentication, { spf: "", dkim: "pass", dmarc: "" });
  assert.deepEqual(of({}).authentication, { spf: "", dkim: "", dmarc: "" });
  assert.equal(senderAuthenticated(of({})), false);
  // A check that is not a word is not a pass, whatever it holds.
  for (const notAWord of [true, 1, null, ["pass"], { result: "pass" }]) {
    const e = of({ spf: "pass", dkim: notAWord, dmarc: notAWord });
    assert.deepEqual(e.authentication, { spf: "pass", dkim: "", dmarc: "" }, JSON.stringify(notAWord));
    assert.equal(senderAuthenticated(e), false, JSON.stringify(notAWord));
  }
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
