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
  resendLimitOf,
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

const CAMPAIGN = {
  unsubscribeUrl: "https://app.chanlytics.com/u/tok_123",
  unsubscribeMailto: "unsubscribe+tok_123@mail.chanlytics.com",
  footer:
    'I found your business on Google Maps.\nBest Movers · 1 Main St, Austin, TX 78701\nNot interested? Reply "no thanks" · Unsubscribe: https://app.chanlytics.com/u/tok_123',
};

test("a first email names its own subject and threads under nothing; words a program wrote say so", () => {
  const r = buildEmailRequest(input({ parent: null, subject: "The calls you miss mid-session", signature: null }));
  assert.equal(r.subject, "The calls you miss mid-session", "its own, with no Re:");
  assert.deepEqual(
    r.headers,
    { "Auto-Submitted": "auto-generated" },
    "the receptionist wrote it, and it answers nothing",
  );
  assert.equal(
    "Auto-Submitted" in buildEmailRequest(input({ parent: null, subject: "Hello", actor: "human" })).headers,
    false,
    "a person's own first email carries no mark",
  );
  assert.equal(
    buildEmailRequest(input({ parent: null, subject: "Line one\r\nBcc: x@evil.test" })).subject,
    "Line one Bcc: x@evil.test",
    "one line",
  );
  assert.equal(buildEmailRequest(input({ parent: null, subject: "x".repeat(400) })).subject.length, 200);
  assert.equal(
    buildEmailRequest(input({ subject: "Ignored" })).subject,
    "Re: Quote for Saturday",
    "a reply's subject is always its parent's",
  );
  assert.equal(
    buildEmailRequest(input({ parent: null, subject: " ".repeat(250) + "Hello" })).subject,
    "Hello",
    "made one line first, then held to its length: a padded subject is not an empty one",
  );
  assert.throws(() => buildEmailRequest(input({ parent: null })), /a first email names its subject/);
  assert.throws(
    () => buildEmailRequest(input({ parent: null, subject: "  \r\n " })),
    /a first email names its subject/,
  );
});

test("a first email a program sends never poses as a reply or a forward; a person's own words are theirs", () => {
  for (const subject of ["Re: your listing", "RE : your listing", "Fwd: pricing", "FW: pricing", "AW: Ihre Anfrage"]) {
    assert.throws(
      () => buildEmailRequest(input({ parent: null, subject, campaign: CAMPAIGN })),
      /does not pose as a reply/,
      `${subject}: a campaign`,
    );
    assert.throws(
      () => buildEmailRequest(input({ parent: null, subject })),
      /does not pose as a reply/,
      `${subject}: the receptionist's own first email`,
    );
  }
  assert.equal(
    buildEmailRequest(input({ parent: null, subject: "Re: our call", actor: "human" })).subject,
    "Re: our call",
    "a person may title their own first email as they like",
  );
  assert.equal(
    buildEmailRequest(input({ parent: null, subject: "Regarding your listing", campaign: CAMPAIGN })).subject,
    "Regarding your listing",
    "a word that starts with re is not a prefix",
  );
});

test("a campaign says what it is and how to stop it in one click, and carries its footer after the signature", () => {
  const first = buildEmailRequest(
    input({ parent: null, subject: "The calls you miss mid-session", campaign: CAMPAIGN }),
  );
  assert.deepEqual(first.headers, {
    "Auto-Submitted": "auto-generated",
    "List-Unsubscribe": "<https://app.chanlytics.com/u/tok_123>, <mailto:unsubscribe+tok_123@mail.chanlytics.com>",
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  });
  assert.equal(
    first.text,
    `We can do Saturday at 9.\nTwo movers, one truck.\n\nBest Movers\n(212) 555-0100\n\n${CAMPAIGN.footer}`,
  );
  assert.match(first.html, /<a href="https:\/\/app\.chanlytics\.com\/u\/tok_123">/, "the footer's link is a link");
  assert.ok(isEmailRequest(first));
  // A nudge threads under the first email and is still a campaign.
  const nudge = buildEmailRequest(
    input({
      parent: {
        messageId: "m1",
        rfcMessageId: "<first@mail.chanlytics.com>",
        references: [],
        subject: "The calls you miss mid-session",
      },
      actor: "human",
      campaign: CAMPAIGN,
    }),
  );
  assert.equal(nudge.subject, "Re: The calls you miss mid-session");
  assert.equal(nudge.headers["In-Reply-To"], "<first@mail.chanlytics.com>");
  assert.equal(nudge.headers["Auto-Submitted"], "auto-generated", "a program sent it, whoever wrote the words");
  assert.equal(nudge.headers["List-Unsubscribe"], first.headers["List-Unsubscribe"], "a nudge is stopped the same way");
  assert.equal(nudge.headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
  assert.equal("List-Unsubscribe" in buildEmailRequest(input()).headers, false, "a reply carries none");
});

test("a campaign's unsubscribe is one https address and at most one mail address, and its footer is never empty, or no request is built", () => {
  const NEL = String.fromCharCode(0x85);
  const bad = [
    [{ unsubscribeUrl: "http://app.chanlytics.com/u/t" }, /one https address/],
    [{ unsubscribeUrl: "javascript:alert(1)" }, /one https address/],
    [{ unsubscribeUrl: "https://app.chanlytics.com/u/t\r\nBcc: x@evil.test" }, /one https address/],
    [{ unsubscribeUrl: "https://a.example/u/t>, <https://evil.test" }, /one https address/],
    [{ unsubscribeUrl: "https://a.example/u/t>,<https://evil.test" }, /one https address/],
    [{ unsubscribeUrl: `https://app.chanlytics.com/u/t${NEL}x` }, /one https address/],
    [{ unsubscribeMailto: "not an address" }, /one address/],
    [{ unsubscribeMailto: "a@b.co\r\nBcc: x@evil.test" }, /one address/],
    [{ unsubscribeMailto: "a@b.co>,<https://evil.test" }, /one address/],
    [{ unsubscribeMailto: "a@b.co?to=x%40evil.test" }, /one address/],
    [{ unsubscribeMailto: "" }, /one address/],
    [{ footer: "  " }, /footer is never empty/],
  ];
  // A first email and a nudge under it are held to the same rules.
  for (const parent of [null, PARENT]) {
    for (const [over, why] of bad) {
      assert.throws(
        () => buildEmailRequest(input({ parent, subject: "Hi", campaign: { ...CAMPAIGN, ...over } })),
        why,
        JSON.stringify({ parent: !!parent, over }),
      );
    }
  }
  assert.equal(
    buildEmailRequest(
      input({
        parent: null,
        subject: "Hi",
        campaign: { ...CAMPAIGN, unsubscribeUrl: "https://app.chanlytics.com/u/abc?x=1&y=%2C#f" },
      }),
    ).headers["List-Unsubscribe"],
    "<https://app.chanlytics.com/u/abc?x=1&y=%2C#f>, <mailto:unsubscribe+tok_123@mail.chanlytics.com>",
    "a real address with a query, an escape and a fragment is taken as it is",
  );
  assert.equal(
    buildEmailRequest(
      input({
        parent: null,
        subject: "Hi",
        campaign: { unsubscribeUrl: CAMPAIGN.unsubscribeUrl, footer: CAMPAIGN.footer },
      }),
    ).headers["List-Unsubscribe"],
    "<https://app.chanlytics.com/u/tok_123>",
    "one click needs the https address alone: no mail address, none in the header",
  );
  assert.equal(
    buildEmailRequest(
      input({
        parent: null,
        subject: "Hi",
        campaign: { ...CAMPAIGN, unsubscribeMailto: "mailto:unsubscribe+t@mail.chanlytics.com" },
      }),
    ).headers["List-Unsubscribe"],
    "<https://app.chanlytics.com/u/tok_123>, <mailto:unsubscribe+t@mail.chanlytics.com>",
    "a mailto: already written is not written twice",
  );
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

test("what the provider's refusal means for the next send: slow down, wait for the first, or the day's or month's sending is used up", () => {
  const no = (status, name) => ({
    ok: false,
    wamid: null,
    status,
    errorBody: name ? JSON.stringify({ statusCode: status, name, message: "x" }) : "",
  });
  assert.equal(resendLimitOf(no(429, "rate_limit_exceeded")), "rate");
  assert.equal(resendLimitOf(no(429, "daily_quota_exceeded")), "daily");
  assert.equal(resendLimitOf(no(429, "monthly_quota_exceeded")), "monthly");
  assert.equal(resendLimitOf(no(429, "concurrent_idempotent_requests")), "in_flight");
  assert.equal(resendLimitOf(no(409, "concurrent_idempotent_requests")), "in_flight");
  assert.equal(resendLimitOf(no(429)), "rate", "a 429 that names nothing is the one that passes");
  assert.equal(
    resendLimitOf(no(409, "invalid_idempotent_request")),
    null,
    "a frozen request never changes: not a limit",
  );
  assert.equal(resendLimitOf(no(422, "validation_error")), null);
  assert.equal(resendLimitOf({ ok: true, wamid: "re_1", status: 200 }), null);
});

test("the provider's 'not this second' is waited out once, briefly, and the same bytes go again under the same key; anything longer comes back as it came", async () => {
  const real = globalThis.fetch;
  const posted = [];
  let answers = [];
  globalThis.fetch = async (_url, init) => {
    posted.push(init);
    const a = answers.shift();
    return new Response(a.body, { status: a.status, headers: a.headers ?? {} });
  };
  const waits = [];
  const wait = async (ms) => {
    waits.push(ms);
  };
  const limited = (name, headers = { "retry-after": "1" }, status = 429) => ({
    status,
    body: JSON.stringify({ statusCode: status, name, message: "x" }),
    headers,
  });
  const ok = { status: 200, body: JSON.stringify({ id: "re_2" }) };
  const again = () => {
    posted.length = 0;
    waits.length = 0;
  };
  try {
    const r = buildEmailRequest(input());
    answers = [limited("rate_limit_exceeded"), ok];
    assert.deepEqual(await sendEmail({ apiKey: "k" }, r, { wait }), { ok: true, wamid: "re_2", status: 200 });
    assert.deepEqual(waits, [1000], "as long as it asked, once");
    assert.equal(posted.length, 2);
    assert.equal(posted[1].body, posted[0].body, "the same bytes");
    assert.equal(posted[1].headers["Idempotency-Key"], posted[0].headers["Idempotency-Key"], "under the same key");

    // How long: what it asked, up to the cap; the reset when it gives no retry-after; retry-after when it gives both.
    for (const [headers, expected, why] of [
      [{ "retry-after": "2" }, [2000], "as long as it asked, up to the cap"],
      [{ "retry-after": "3" }, [], "past the cap: handed back, not waited for"],
      [{ "ratelimit-reset": "2" }, [2000], "the reset, when no retry-after is given"],
      [{ "retry-after": "1", "ratelimit-reset": "2" }, [1000], "retry-after first"],
      [{ "retry-after": "Wed, 21 Oct 2026 07:28:00 GMT" }, [1000], "a date it cannot read is the default second"],
    ]) {
      again();
      answers = [limited("rate_limit_exceeded", headers), ok];
      await sendEmail({ apiKey: "k" }, r, { wait });
      assert.deepEqual(waits, expected, why);
      assert.equal(posted.length, expected.length ? 2 : 1, `${why}: posts`);
    }

    again();
    answers = [limited("concurrent_idempotent_requests", {}, 409), ok];
    assert.equal(
      (await sendEmail({ apiKey: "k" }, r, { wait })).ok,
      true,
      "the first is still being worked (409, as Resend documents it): its answer is ours",
    );
    assert.deepEqual(waits, [1000], "a second, when it did not say how long");

    again();
    answers = [limited("rate_limit_exceeded", { "retry-after": "30" })];
    const long = await sendEmail({ apiKey: "k" }, r, { wait });
    assert.deepEqual(
      [long.ok, long.status, posted.length, waits.length],
      [false, 429, 1, 0],
      "too long for a worker's run",
    );

    again();
    answers = [limited("daily_quota_exceeded", {})];
    const quota = await sendEmail({ apiKey: "k" }, r, { wait });
    assert.deepEqual(
      [resendLimitOf(quota), posted.length, waits.length],
      ["daily", 1, 0],
      "a used-up day is not waited for",
    );

    again();
    answers = [limited("rate_limit_exceeded"), limited("rate_limit_exceeded")];
    const twice = await sendEmail({ apiKey: "k" }, r, { wait });
    assert.deepEqual([twice.status, posted.length, waits.length], [429, 2, 1], "once, never a loop");
  } finally {
    globalThis.fetch = real;
  }
});

test("an email taken as the last its rate allowed waits out the reset before it returns, so the next meets no 429 (Reach out C14)", async () => {
  const real = globalThis.fetch;
  let answers = [];
  globalThis.fetch = async () => {
    const a = answers.shift();
    return new Response(JSON.stringify({ id: "re_9" }), { status: 200, headers: a });
  };
  const waits = [];
  const wait = async (ms) => {
    waits.push(ms);
  };
  try {
    const r = buildEmailRequest(input());
    for (const [headers, expected, why] of [
      [{ "ratelimit-remaining": "0", "ratelimit-reset": "1" }, [1000], "the last of its second: the reset, waited out"],
      [{ "ratelimit-remaining": "0", "ratelimit-reset": "5" }, [2000], "never longer than a worker's short wait"],
      [{ "ratelimit-remaining": "0" }, [1000], "no reset given: the default second"],
      [{ "ratelimit-remaining": "1", "ratelimit-reset": "1" }, [], "room left: at once"],
      [{}, [], "no rate headers: at once"],
    ]) {
      waits.length = 0;
      answers = [headers];
      assert.deepEqual(await sendEmail({ apiKey: "k" }, r, { wait }), { ok: true, wamid: "re_9", status: 200 }, why);
      assert.deepEqual(waits, expected, why);
    }
    // With the real clock: it returns after about the second it was asked to wait.
    answers = [{ "ratelimit-remaining": "0", "ratelimit-reset": "1" }];
    const t0 = Date.now();
    await sendEmail({ apiKey: "k" }, r);
    const took = Date.now() - t0;
    assert.ok(took >= 950 && took < 1900, `about a second: ${took} ms`);
  } finally {
    globalThis.fetch = real;
  }
});

test("a send that timed out goes once more under the same key, inside its deadline; twice timed out is 'timeout' (Part 2.5 D5)", async () => {
  const real = globalThis.fetch;
  const posted = [];
  let answers = [];
  globalThis.fetch = async (_url, init) => {
    posted.push(init);
    const a = answers.shift();
    if (a === "timeout")
      throw Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" });
    return new Response(a.body, { status: a.status, headers: a.headers ?? {} });
  };
  let clock = 0;
  const now = () => clock;
  try {
    const r = buildEmailRequest(input());
    answers = ["timeout", { status: 200, body: JSON.stringify({ id: "re_7" }) }];
    assert.deepEqual(await sendEmail({ apiKey: "k" }, r, { now }), { ok: true, wamid: "re_7", status: 200 });
    assert.equal(posted.length, 2, "posted again");
    assert.equal(posted[1].headers["Idempotency-Key"], posted[0].headers["Idempotency-Key"], "under the same key");
    assert.equal(posted[1].body, posted[0].body, "the same bytes");

    posted.length = 0;
    answers = ["timeout", "timeout"];
    assert.deepEqual(await sendEmail({ apiKey: "k" }, r, { now }), {
      ok: false,
      wamid: null,
      status: 0,
      errorBody: "timeout",
    });
    assert.equal(posted.length, 2);

    // Too little time left for a second try: the first timeout is the answer.
    posted.length = 0;
    answers = ["timeout", { status: 200, body: "{}" }];
    const late = await sendEmail({ apiKey: "k" }, r, { now, deadlineMs: 4_000 });
    assert.deepEqual([late.status, late.errorBody, posted.length], [0, "timeout", 1]);

    // A limit that would wait past the deadline is handed back, not waited for.
    posted.length = 0;
    const waits = [];
    answers = [
      {
        status: 429,
        body: JSON.stringify({ statusCode: 429, name: "rate_limit_exceeded" }),
        headers: { "retry-after": "2" },
      },
      { status: 200, body: "{}" },
    ];
    const handed = await sendEmail({ apiKey: "k" }, r, { now, deadlineMs: 1_500, wait: async (ms) => waits.push(ms) });
    assert.deepEqual([handed.status, waits, posted.length], [429, [], 1]);

    // A network failure that is not a timeout is not posted again: it never left.
    posted.length = 0;
    globalThis.fetch = async (_u, init) => {
      posted.push(init);
      throw new Error("getaddrinfo ENOTFOUND api.resend.com");
    };
    const down = await sendEmail({ apiKey: "k" }, r, { now });
    assert.deepEqual([down.status, down.errorBody, posted.length], [0, "getaddrinfo ENOTFOUND api.resend.com", 1]);
  } finally {
    globalThis.fetch = real;
  }
});

test("each try's timeout is the smaller of fifteen seconds and what is left of the deadline", async () => {
  const real = globalThis.fetch;
  const realTimeout = AbortSignal.timeout;
  const asked = [];
  AbortSignal.timeout = (ms) => {
    asked.push(ms);
    return realTimeout.call(AbortSignal, ms);
  };
  globalThis.fetch = async () => new Response(JSON.stringify({ id: "re_8" }), { status: 200 });
  try {
    const r = buildEmailRequest(input());
    await sendEmail({ apiKey: "k" }, r, { now: () => 0, deadlineMs: 9_000 });
    await sendEmail({ apiKey: "k" }, r, { now: () => 0 });
    assert.deepEqual(asked, [9_000, 15_000]);
  } finally {
    globalThis.fetch = real;
    AbortSignal.timeout = realTimeout;
  }
});

test("after a timeout, a retry that finds the first still in flight, gets no answer, or a 5xx is still an unknown outcome", async () => {
  const real = globalThis.fetch;
  const r = buildEmailRequest(input());
  const timeout = () => {
    throw Object.assign(new Error("aborted"), { name: "TimeoutError" });
  };
  const cases = [
    [
      () => new Response(JSON.stringify({ statusCode: 409, name: "concurrent_idempotent_requests" }), { status: 409 }),
      "in flight",
    ],
    [() => new Response("upstream", { status: 502 }), "a 5xx"],
    [
      () => {
        throw new Error("socket hang up");
      },
      "no answer",
    ],
  ];
  try {
    for (const [second, why] of cases) {
      let n = 0;
      globalThis.fetch = async () => (++n === 1 ? timeout() : second());
      const out = await sendEmail({ apiKey: "k" }, r, { now: () => 0 });
      assert.deepEqual([out.ok, out.status, out.errorBody], [false, 0, "timeout"], why);
    }
    // A plain refusal on the retry is the provider's answer: it saw the email and said no.
    let n = 0;
    globalThis.fetch = async () =>
      ++n === 1 ? timeout() : new Response(JSON.stringify({ name: "validation_error" }), { status: 422 });
    const refused = await sendEmail({ apiKey: "k" }, r, { now: () => 0 });
    assert.equal(refused.status, 422);
  } finally {
    globalThis.fetch = real;
  }
});

test("the deadline counts the time the first try took: a first try that used most of it leaves no second", async () => {
  const real = globalThis.fetch;
  let clock = 0;
  let posts = 0;
  globalThis.fetch = async () => {
    posts++;
    clock += 28_000; // the first try took 28 of the 32 seconds before it gave up
    throw Object.assign(new Error("aborted"), { name: "TimeoutError" });
  };
  try {
    const out = await sendEmail({ apiKey: "k" }, buildEmailRequest(input()), { now: () => clock });
    assert.deepEqual([out.errorBody, posts], ["timeout", 1], "4 s left is less than a second try needs");
  } finally {
    globalThis.fetch = real;
  }
});
