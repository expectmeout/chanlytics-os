/**
 * A connected mailbox's wire (packages/channels mailbox/; decision 0056), run against a stubbed provider: the way to the
 * consent screen and back (each provider's scopes, the token requests, which scopes a grant lacks), the MIME an email
 * leaves as (plain, its Message-ID minted from its row on the mailbox's own host, its one-click unsubscribe), a send
 * through Gmail (in the thread of the email it answers, the Message-ID Gmail kept read back) and through Graph (a draft,
 * then sent), a refusal that is the mailbox's own day or its grant gone said as such, and an email read back from either
 * provider, a delivery report read for the email of ours it is about.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAILBOX_SCOPES,
  buildEmailRequest,
  buildMime,
  connectedIdentity,
  deliveryReportOf,
  gmailEmailOf,
  grantScopesMissing,
  graphEmailOf,
  mailboxAuthorizeUrl,
  mailboxMessageId,
  mailboxRefreshRequest,
  mailboxRevokeRequest,
  mailboxTokenRequest,
  parseMailboxGrant,
  rowIdOfMessageId,
  sendFromMailbox,
} from "@chanlytics/channels";
import { b64url } from "./_mailbox-world.mjs";

const ROW = "0f1e2d3c-4b5a-4968-8776-655443322110";
const CLIENT = { clientId: "client-1", clientSecret: "secret-1", redirectUri: "https://app.example.com/cb" };
const request = (over = {}) =>
  buildEmailRequest({
    identity: connectedIdentity({ address: "sam@getharbor.example", from_name: "Sam at Harbor" }),
    to: "office@fixture-movers.example",
    parent: null,
    subject: "A quick one for Fixture Movers",
    body: "Saw your shop on the map. Café hours look busy.",
    signature: "Sam · Harbor Moving",
    actor: "human",
    plain: true,
    autoSubmitted: false,
    campaign: {
      unsubscribeUrl: "https://app.example.com/u/token",
      footer: 'Not interested? Reply "no thanks" and I won\'t write again.',
    },
    messageId: ROW,
    tenantId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    ...over,
  });
/** A provider answered by `answer(url, init)`, through providerFetch's own seam; each call kept. */
function stub(answer) {
  const calls = [];
  return {
    calls,
    deps: {
      fetch: async (url, init = {}) => {
        calls.push({ url: String(url), init });
        const a = await answer(String(url), init);
        return new Response(a.text ?? JSON.stringify(a.json ?? {}), { status: a.status ?? 200 });
      },
      sleep: async () => {},
      random: () => 0,
    },
  };
}

test("the way to consent: each provider's scopes, offline access, and the token requests that come back with a code", () => {
  const g = new URL(mailboxAuthorizeUrl("google", CLIENT, "state-1", "sam@getharbor.example"));
  assert.equal(g.origin + g.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
  assert.equal(g.searchParams.get("scope"), MAILBOX_SCOPES.google.join(" "));
  assert.deepEqual(
    [g.searchParams.get("access_type"), g.searchParams.get("prompt"), g.searchParams.get("state")],
    ["offline", "consent", "state-1"],
    "a refresh token every time, and the signed state",
  );
  assert.equal(g.searchParams.get("login_hint"), "sam@getharbor.example");
  const m = new URL(mailboxAuthorizeUrl("microsoft", CLIENT, "state-2"));
  assert.match(m.pathname, /\/common\/oauth2\/v2\.0\/authorize$/);
  assert.match(m.searchParams.get("scope"), /offline_access .*Mail\.ReadWrite Mail\.Send/);
  const t = mailboxTokenRequest("google", CLIENT, "code-1");
  assert.equal(t.url, "https://oauth2.googleapis.com/token");
  assert.deepEqual(Object.fromEntries(new URLSearchParams(t.body)), {
    code: "code-1",
    client_id: "client-1",
    client_secret: "secret-1",
    redirect_uri: "https://app.example.com/cb",
    grant_type: "authorization_code",
  });
  const r = Object.fromEntries(new URLSearchParams(mailboxRefreshRequest("microsoft", CLIENT, "rt-1").body));
  assert.deepEqual([r.grant_type, r.refresh_token], ["refresh_token", "rt-1"]);
  assert.match(r.scope, /Mail\.Send/, "Microsoft is asked for the scopes again at each refresh");
  assert.equal(mailboxRevokeRequest("microsoft", "t"), null, "Microsoft has no single token to give back");
  assert.match(mailboxRevokeRequest("google", "t").url, /oauth2\.googleapis\.com\/revoke/);
});

test("a grant that lacks send or read is no mailbox; Graph's scopes are read without their resource or case", () => {
  assert.deepEqual(grantScopesMissing("google", "openid email https://www.googleapis.com/auth/gmail.send"), [
    "https://www.googleapis.com/auth/gmail.readonly",
  ]);
  assert.deepEqual(
    grantScopesMissing("microsoft", "https://graph.microsoft.com/Mail.Send https://graph.microsoft.com/mail.readwrite"),
    [],
  );
  assert.deepEqual(grantScopesMissing("microsoft", "User.Read Mail.Send"), ["mail.readwrite"]);
  const grant = parseMailboxGrant({ access_token: "at", refresh_token: "rt", expires_in: 3599, scope: "a b" });
  assert.deepEqual([grant.access_token, grant.refresh_token, grant.expires_in], ["at", "rt", 3599]);
  assert.throws(() => parseMailboxGrant({ error: "invalid_grant" }));
});

test("an email leaves as plain MIME: its Message-ID minted from its row on the mailbox's host, no Reply-To that only says the From, its one-click way out, a non-ASCII subject encoded", () => {
  const id = mailboxMessageId(ROW, "GetHarbor.example");
  assert.equal(id, "<cl.0f1e2d3c4b5a49688776655443322110@getharbor.example>");
  assert.equal(rowIdOfMessageId(id), ROW, "the row is in the id itself, for a reply or a report to find");
  assert.equal(rowIdOfMessageId("<CAGmail@mail.gmail.com>"), null);
  const mime = buildMime(request({ subject: "Café hours" }), { messageId: id, at: new Date("2026-10-13T15:04:05Z") });
  const [head, ...paragraphs] = mime.split("\r\n\r\n");
  const body = paragraphs.join("\r\n\r\n");
  assert.match(head, /^From: "Sam at Harbor" <sam@getharbor\.example>$/m);
  assert.match(head, /^Subject: =\?UTF-8\?B\?Q2Fmw6kgaG91cnM=\?=$/m);
  assert.match(head, /^Date: Tue, 13 Oct 2026 15:04:05 \+0000$/m);
  assert.match(head, /^Message-ID: <cl\.0f1e2d3c4b5a49688776655443322110@getharbor\.example>$/m);
  assert.match(head, /^List-Unsubscribe: <https:\/\/app\.example\.com\/u\/token>$/m);
  assert.match(head, /^List-Unsubscribe-Post: List-Unsubscribe=One-Click$/m);
  assert.match(head, /^Content-Type: text\/plain; charset=UTF-8$/m);
  assert.doesNotMatch(head, /Reply-To|Auto-Submitted|multipart/);
  assert.match(body, /Caf=C3=A9 hours look busy/, "quoted-printable, as UTF-8");
  assert.match(body, /Sam =C2=B7 Harbor Moving/, "its signature under its words");
  // A nudge threads under the email before it.
  const nudge = buildMime(
    request({
      parent: {
        messageId: "m0",
        rfcMessageId: "<cl.aaaa@getharbor.example>",
        references: [],
        subject: "A quick one for Fixture Movers",
      },
    }),
    { messageId: id, at: new Date() },
  );
  assert.match(nudge, /^In-Reply-To: <cl\.aaaa@getharbor\.example>$/m);
  assert.match(nudge, /^Subject: Re: A quick one for Fixture Movers$/m);
});

test("through Gmail: a nudge finds its thread by the Message-ID it answers, leaves in it, and Gmail's own Message-ID is read back", async () => {
  const p = stub((url) => {
    if (url.includes("/messages?q=")) return { json: { messages: [{ id: "g-0", threadId: "g-thread" }] } };
    if (url.endsWith("/messages/send")) return { json: { id: "g-1", threadId: "g-thread" } };
    if (url.includes("/messages/g-1"))
      return { json: { payload: { headers: [{ name: "Message-ID", value: "<CAGmail-1@mail.gmail.com>" }] } } };
    return { status: 404 };
  });
  const r = request({
    parent: { messageId: "m0", rfcMessageId: "<cl.aaaa@getharbor.example>", references: [], subject: "A quick one" },
  });
  const out = await sendFromMailbox(
    { provider: "google", token: "ya29.t", mailbox: { id: "mbx-1", host: "getharbor.example" }, request: r },
    p.deps,
  );
  assert.deepEqual(out.email, { messageId: "<CAGmail-1@mail.gmail.com>", threadId: "g-thread", mailboxId: "mbx-1" });
  assert.deepEqual([out.ok, out.wamid], [true, "g-1"]);
  assert.match(decodeURIComponent(p.calls[0].url), /q=rfc822msgid:cl\.aaaa@getharbor\.example/);
  const sent = JSON.parse(p.calls[1].init.body);
  assert.equal(sent.threadId, "g-thread", "in the thread of the email it answers");
  assert.match(Buffer.from(sent.raw, "base64url").toString("utf8"), /^In-Reply-To: <cl\.aaaa@getharbor\.example>/m);
  assert.equal(p.calls[1].init.headers.Authorization, "Bearer ya29.t");
});

test("through Graph: a draft made from the MIME, then sent; its Message-ID and conversation known from the draft", async () => {
  const p = stub((url) => {
    if (url.endsWith("/me/messages"))
      return {
        status: 201,
        json: { id: "AAMk-1", internetMessageId: "<cl.x@getharbor.example>", conversationId: "conv-1" },
      };
    if (url.endsWith("/AAMk-1/send")) return { status: 202, text: "" };
    return { status: 404 };
  });
  const out = await sendFromMailbox(
    { provider: "microsoft", token: "eyJ.t", mailbox: { id: "mbx-2", host: "getharbor.example" }, request: request() },
    p.deps,
  );
  assert.deepEqual([out.ok, out.wamid], [true, "AAMk-1"]);
  assert.deepEqual(out.email, { messageId: "<cl.x@getharbor.example>", threadId: "conv-1", mailboxId: "mbx-2" });
  assert.equal(p.calls[0].init.headers["Content-Type"], "text/plain");
  assert.match(Buffer.from(p.calls[0].init.body, "base64").toString("utf8"), /^Message-ID: <cl\./m);
});

test("a refusal that is the mailbox's own day, or its grant gone, says so; any other is the email's", async () => {
  const send = (provider, answer) =>
    sendFromMailbox(
      { provider, token: "t", mailbox: { id: "m", host: "getharbor.example" }, request: request() },
      stub(answer).deps,
    );
  const gDay = await send("google", () => ({
    status: 429,
    json: {
      error: { code: 429, errors: [{ reason: "dailyLimitExceeded" }], message: "Daily user sending limit exceeded" },
    },
  }));
  assert.deepEqual([gDay.ok, gDay.cause], [false, "day_used"]);
  const gOut = await send("google", () => ({ status: 401, json: { error: { code: 401, status: "UNAUTHENTICATED" } } }));
  assert.equal(gOut.cause, "signed_out");
  const mDay = await send("microsoft", () => ({ status: 403, json: { error: { code: "ErrorExceededMessageLimit" } } }));
  assert.equal(mDay.cause, "day_used");
  const bad = await send("google", () => ({
    status: 400,
    json: { error: { code: 400, message: "Invalid To header" } },
  }));
  assert.deepEqual([bad.ok, bad.cause], [false, undefined]);
});

test("a reply read back from Gmail and from Graph is the intake's email, with its thread beside it; neither proves a sender", () => {
  const g = gmailEmailOf({
    id: "g-9",
    threadId: "g-thread",
    internalDate: String(Date.parse("2026-10-13T16:00:00Z")),
    payload: {
      mimeType: "multipart/alternative",
      headers: [
        { name: "From", value: "Owner <office@fixture-movers.example>" },
        { name: "To", value: "sam@getharbor.example" },
        { name: "Subject", value: "Re: A quick one" },
        { name: "Message-ID", value: "<their-1@fixture-movers.example>" },
        { name: "In-Reply-To", value: "<CAGmail-1@mail.gmail.com>" },
      ],
      parts: [
        { mimeType: "text/plain", body: { data: b64url("Sure, call me Thursday.") } },
        { mimeType: "text/html", body: { data: b64url("<p>Sure, call me Thursday.</p>") } },
      ],
    },
  });
  assert.deepEqual(
    [g.id, g.threadId, g.from.address, g.to, g.subject, g.text, g.messageId, g.authentication, g.reportText],
    [
      "g-9",
      "g-thread",
      "office@fixture-movers.example",
      ["sam@getharbor.example"],
      "Re: A quick one",
      "Sure, call me Thursday.",
      "<their-1@fixture-movers.example>",
      null,
      null,
    ],
  );
  assert.equal(g.createdAt, "2026-10-13T16:00:00.000Z");
  const m = graphEmailOf({
    id: "AAMk-9",
    conversationId: "conv-1",
    internetMessageId: "<their-2@fixture-movers.example>",
    subject: "RE: A quick one",
    from: { emailAddress: { address: "office@fixture-movers.example", name: "Owner" } },
    toRecipients: [{ emailAddress: { address: "sam@getharbor.example" } }],
    receivedDateTime: "2026-10-13T16:05:00Z",
    body: { contentType: "text", content: "Not interested, thanks." },
    internetMessageHeaders: [{ name: "In-Reply-To", value: "<cl.x@getharbor.example>" }],
  });
  assert.deepEqual(
    [m.threadId, m.text, m.html, m.from.name, m.reportText],
    ["conv-1", "Not interested, thanks.", null, "Owner", null],
  );
  assert.equal(gmailEmailOf({ nothing: true }), null);
});

test("a delivery report is read for the email of ours it is about: the row in the Message-ID we minted, permanent or not; a delay is nothing yet", () => {
  const ours = mailboxMessageId(ROW, "getharbor.example");
  const report = (status, action, extra = "") => ({
    headers: { "content-type": 'multipart/report; report-type=delivery-status; boundary="x"' },
    from: { address: "mailer-daemon@googlemail.com", name: "Mail Delivery Subsystem" },
    subject: "Delivery Status Notification (Failure)",
    text: "Your message wasn't delivered.",
    reportText: `Reporting-MTA: dns; googlemail.com\nFinal-Recipient: rfc822; Office@Fixture-Movers.example\nAction: ${action}\nStatus: ${status}\nDiagnostic-Code: smtp; 550 5.1.1 The email account that you tried to reach does not exist.\n\nMessage-ID: ${ours}\n${extra}`,
  });
  const hard = deliveryReportOf(report("5.1.1", "failed"));
  assert.deepEqual(
    [hard.rowId, hard.recipient, hard.status, hard.permanent, hard.delayed],
    [ROW, "office@fixture-movers.example", "5.1.1", true, false],
  );
  assert.match(hard.diagnostic, /^550 5\.1\.1/);
  const soft = deliveryReportOf(report("4.2.2", "failed"));
  assert.deepEqual([soft.permanent, soft.delayed], [false, false], "a full mailbox failed for now: transient");
  const delayed = deliveryReportOf(report("4.4.7", "delayed"));
  assert.deepEqual([delayed.permanent, delayed.delayed], [false, true]);
  // Exchange's own words, no multipart/report: the sender's name says it.
  const exchange = deliveryReportOf({
    headers: {},
    from: { address: "postmaster@outlook.com", name: null },
    subject: "Undeliverable: A quick one",
    text: `Remote Server returned '550 5.1.10 RESOLVER.ADR.RecipientNotFound'\nMessage-ID: <their-own@getharbor.example>`,
    reportText: null,
  });
  assert.deepEqual(
    [exchange.rowId, exchange.originalMessageId, exchange.permanent],
    [null, "<their-own@getharbor.example>", true],
  );
  assert.equal(
    deliveryReportOf({
      headers: {},
      from: { address: "office@fixture-movers.example" },
      text: "Thanks!",
      reportText: null,
    }),
    null,
    "a person's reply is no report",
  );
});
