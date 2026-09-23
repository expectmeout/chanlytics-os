/**
 * The request an email leaves as, and the one function that posts it.
 *
 * The request is built once, from stored rows, and frozen on the queued
 * message before the first attempt; the wire sends those bytes. So what is
 * proved here is what the bytes ARE: whose identity they carry, what they
 * thread under, which header marks a receptionist's reply, that nothing a
 * customer or a model wrote can become a header, and that a retry is the same
 * request under the same key.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildEmailRequest,
  emailHtml,
  hostedAddress,
  hostedIdentity,
  isEmailRequest,
  mailboxHeader,
  messageIdHeader,
  referencesFor,
  replyRouteAddress,
  replySubject,
  sendEmail,
} from "@chanlytics/channels";

const DOMAIN = "mail.chanlytics.com";
const MAILBOX = { local_part: "bestmovers", reply_token: "abcdefghijklmnopqrstuvwx", from_name: "Best Movers" };
const PARENT = {
  messageId: "m0",
  rfcMessageId: "<q1@customer.example>",
  references: ["<q0@customer.example>"],
  subject: "Quote for Saturday",
};
const input = (over = {}) => ({
  identity: hostedIdentity(MAILBOX, DOMAIN),
  to: "ana@example.com",
  parent: PARENT,
  body: "We can do Saturday at 9.\nTwo movers, one truck.",
  signature: "Best Movers\n(212) 555-0100",
  actor: "ai",
  messageId: "11111111-1111-4111-8111-111111111111",
  tenantId: "22222222-2222-4222-8222-222222222222",
  ...over,
});

test("a workspace's addresses: the one it publishes and sends from, and the route a reply comes back on", () => {
  assert.equal(hostedAddress("bestmovers", DOMAIN), "bestmovers@mail.chanlytics.com");
  assert.equal(replyRouteAddress(MAILBOX.reply_token, DOMAIN), "r+abcdefghijklmnopqrstuvwx@mail.chanlytics.com");
  assert.deepEqual(hostedIdentity(MAILBOX, DOMAIN), {
    fromName: "Best Movers",
    fromAddress: "bestmovers@mail.chanlytics.com",
    replyTo: "r+abcdefghijklmnopqrstuvwx@mail.chanlytics.com",
  });
});

test("the request, pinned: the workspace's identity, the person's stored address, the parent's thread, the row's id as key and tag", () => {
  const r = buildEmailRequest(input());
  assert.deepEqual(r, {
    from: '"Best Movers" <bestmovers@mail.chanlytics.com>',
    to: ["ana@example.com"],
    reply_to: ["r+abcdefghijklmnopqrstuvwx@mail.chanlytics.com"],
    subject: "Re: Quote for Saturday",
    text: "We can do Saturday at 9.\nTwo movers, one truck.\n\nBest Movers\n(212) 555-0100",
    html: "<p>We can do Saturday at 9.<br>Two movers, one truck.</p>\n<p>Best Movers<br>(212) 555-0100</p>",
    headers: {
      "In-Reply-To": "<q1@customer.example>",
      References: "<q0@customer.example> <q1@customer.example>",
      "Auto-Submitted": "auto-replied",
    },
    tags: [
      { name: "cl_message", value: "11111111-1111-4111-8111-111111111111" },
      { name: "cl_tenant", value: "22222222-2222-4222-8222-222222222222" },
    ],
    idempotency_key: "11111111-1111-4111-8111-111111111111",
  });
  assert.ok(isEmailRequest(r));
  assert.ok(isEmailRequest(JSON.parse(JSON.stringify(r))), "and it survives the row it is frozen in");
  assert.deepEqual(buildEmailRequest(input()), r, "built twice from the same rows, it is the same request");
});

test("a person's own reply carries no automatic mark; a receptionist's does, so the other side's auto-responder does not answer it", () => {
  assert.equal("Auto-Submitted" in buildEmailRequest(input({ actor: "human" })).headers, false);
  assert.equal(buildEmailRequest(input({ actor: "ai" })).headers["Auto-Submitted"], "auto-replied");
});

test("a parent with no Message-ID still gets a reply: no thread headers, and a subject a person can find", () => {
  const r = buildEmailRequest(
    input({
      parent: { messageId: "m0", rfcMessageId: null, references: [], subject: null },
      signature: null,
      actor: "human",
    }),
  );
  assert.deepEqual(r.headers, {});
  assert.equal(r.subject, "Re: your message");
  assert.equal(r.text, "We can do Saturday at 9.\nTwo movers, one truck.");
});

test("the subject is theirs with one Re:, however many the chain stacked, in whatever language, and never a second line", () => {
  assert.equal(replySubject("Quote"), "Re: Quote");
  assert.equal(replySubject("RE: Re: AW: Quote"), "Re: Quote");
  assert.equal(replySubject("  re :  Quote  "), "Re: Quote");
  assert.equal(
    replySubject("Regarding my move"),
    "Re: Regarding my move",
    "a word that starts with re is not a prefix",
  );
  assert.equal(
    replySubject("Quote\r\nBcc: everyone@evil.test"),
    "Re: Quote Bcc: everyone@evil.test",
    "a newline in a subject is a space, not a header",
  );
  assert.equal(replySubject("x".repeat(400)).length, 200);
});

test("nothing a customer or a model wrote becomes a header or markup", () => {
  assert.equal(
    mailboxHeader('Best "Movers", Inc.\r\nBcc: x@evil.test', "a@b.co"),
    '"Best Movers, Inc. Bcc: x@evil.test" <a@b.co>',
  );
  assert.equal(mailboxHeader("   ", "a@b.co"), "a@b.co");
  assert.equal(messageIdHeader("<ok@host.example>"), "<ok@host.example>");
  assert.equal(messageIdHeader("bare@host.example"), "<bare@host.example>");
  assert.equal(
    messageIdHeader("<one@h>\r\nBcc: x@evil.test"),
    null,
    "a Message-ID with a space or a second line in it is not one",
  );
  assert.equal(messageIdHeader(""), null);
  const r = buildEmailRequest(
    input({ parent: { ...PARENT, rfcMessageId: "<a@b>\r\nX-Evil: 1", references: ["nonsense", "<good@h.example>"] } }),
  );
  assert.equal("In-Reply-To" in r.headers, false);
  assert.equal(r.headers.References, "<good@h.example>");
  assert.equal(
    emailHtml('Hi <script>alert("x")</script>\n\n& bye'),
    "<p>Hi &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;</p>\n<p>&amp; bye</p>",
  );
  // An address in the words is a link (00154's proposal, the booking link): escaped first, the sentence's own
  // punctuation left outside it, and nothing that is not http(s) linked.
  assert.equal(
    emailHtml(
      'See https://docs.example.com/p?a=1&b=2, then write back. Not this: javascript:alert("x") or "<a href=x>".',
    ),
    '<p>See <a href="https://docs.example.com/p?a=1&amp;b=2">https://docs.example.com/p?a=1&amp;b=2</a>, then write back. Not this: javascript:alert(&quot;x&quot;) or &quot;&lt;a href=x&gt;&quot;.</p>',
  );
});

test("a long chain keeps its root and its newest, so the customer's client still threads it", () => {
  const chain = Array.from({ length: 40 }, (_, i) => `<m${i}@h.example>`);
  const refs = referencesFor({ rfcMessageId: "<parent@h.example>", references: chain });
  assert.equal(refs.length, 20);
  assert.equal(refs[0], "<m0@h.example>");
  assert.equal(refs.at(-1), "<parent@h.example>");
  assert.deepEqual(
    referencesFor({ rfcMessageId: "<p@h.example>", references: ["<p@h.example>", "<p@h.example>"] }),
    ["<p@h.example>"],
    "said once",
  );
});

test("what is not a request is not sent as one", () => {
  const r = buildEmailRequest(input());
  for (const bad of [
    null,
    {},
    "x",
    { ...r, to: [] },
    { ...r, to: "ana@example.com" },
    { ...r, idempotency_key: "" },
    { ...r, headers: null },
    { ...r, reply_to: [""] },
  ]) {
    assert.equal(isEmailRequest(bad), false, JSON.stringify(bad)?.slice(0, 80));
  }
});

test("sendEmail posts the frozen request under its own key, returns what happened, and never throws", async () => {
  const real = globalThis.fetch;
  const seen = [];
  const answer = { status: 200, body: JSON.stringify({ id: "re_123" }) };
  globalThis.fetch = async (url, init) => {
    seen.push({ url: String(url), init });
    if (answer.throws) throw new Error("socket hang up");
    return new Response(answer.body, { status: answer.status });
  };
  try {
    const r = buildEmailRequest(input());
    assert.deepEqual(await sendEmail({ apiKey: "test-key" }, r), { ok: true, wamid: "re_123", status: 200 });
    const { url, init } = seen[0];
    assert.equal(url, "https://api.resend.com/emails");
    assert.equal(init.headers["Idempotency-Key"], r.idempotency_key);
    assert.equal(init.headers.Authorization, "Bearer test-key");
    const sent = JSON.parse(init.body);
    assert.equal("idempotency_key" in sent, false, "the key rides in its header, not in the email");
    const { idempotency_key: _key, ...rest } = r;
    assert.deepEqual(sent, rest, "and the body is the request, unchanged");

    await sendEmail({ apiKey: "test-key" }, r);
    assert.equal(seen[1].init.body, seen[0].init.body, "a retry is the same bytes");
    assert.equal(
      seen[1].init.headers["Idempotency-Key"],
      seen[0].init.headers["Idempotency-Key"],
      "under the same key",
    );

    Object.assign(answer, { status: 200, body: "not json" });
    assert.deepEqual(
      await sendEmail({ apiKey: "k" }, r),
      { ok: true, wamid: null, status: 200 },
      "accepted without an id is still accepted: the receipt finds the row by its tag",
    );
    Object.assign(answer, {
      status: 422,
      body: JSON.stringify({ name: "validation_error", message: "Invalid `to` field." }),
    });
    const refused = await sendEmail({ apiKey: "k" }, r);
    assert.equal(refused.ok, false);
    assert.equal(refused.status, 422);
    assert.match(refused.errorBody, /validation_error/);
    Object.assign(answer, { throws: true });
    assert.deepEqual(
      await sendEmail({ apiKey: "k" }, r),
      { ok: false, wamid: null, status: 0, errorBody: "socket hang up" },
      "status 0: never reached the provider",
    );
  } finally {
    globalThis.fetch = real;
  }
});
