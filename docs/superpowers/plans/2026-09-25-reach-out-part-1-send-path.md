# Reach out, Part 1: the send path — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the email wire and the send door safe for mail Chanlytics starts itself, before any caller sends it: a first email and a campaign email can be built, a short provider limit is waited out, an email can only leave from the row its request names, and a queued job can say what its send is.

**Architecture:** Two PRs, from `docs/superpowers/specs/2026-09-25-reach-out-design.md` §6 part 1 (the PRD's W0). PR 1 is the wire, in `packages/channels`: `buildEmailRequest` learns `parent: null` with its own subject and a `campaign` (unsubscribe headers, `Auto-Submitted: auto-generated`, a footer); `resendLimitOf` reads Resend's 429 names; `sendEmail` waits out "not this second" once. PR 2 is the door, in `packages/core` and `packages/db`: `deliver()` throws for an email without its queued row, `recordOutbound` refuses email, `sendQueued` reads `purpose` and `proactive` from the payload (only ever more strictly) and says a provider limit in words, paging the platform when a day or month is used up. No migration, no route, no page.

**Tech Stack:** TypeScript packages built with tsup (`packages/*/dist` is committed), `node --test` suites in `tooling/scripts/tests`, the in-memory Supabase double `_fake-db.mjs`, Resend's REST API.

**Repo conventions that bind every task:** run from the worktree `C:\Users\Ruben\Documents\Claude Projects\Claude Video\cm-camp-compact` on the part's branch, never the shared main checkout. A changed `packages/*/src` file means `corepack pnpm --filter "./packages/*" build` and committing every `packages/*/dist` file that changed (CI fails on drift). Tests that import `@chanlytics/channels`, `packages/core/dist` or `packages/db/dist` read the BUILT package, so build before running them. The worktree converts files to CRLF: edit with tools that keep line endings. Never stage `apps/dashboard/tsconfig.json` or `next-env.d.ts`. Tests run as `node --conditions=react-server --import tsx --test tooling/scripts/tests/<file>.test.mjs`. Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; hooks run Prettier on staged files and are never skipped; never let two agents commit at once in one worktree (lint-staged stashes the tree during a commit). One combined review per task, fix, move on. A PR squash-merges on green and deletes its branch; PR 2 branches from `main` after PR 1 merges, never stacked on it (a stacked PR closes when its base branch is deleted).

**Facts this plan stands on (read 25 Sep 2026 at `origin/main` `8b6be0c1`):**
- `buildEmailRequest` requires a parent and always writes `Re: <their subject>` (`packages/channels/src/email.ts:48-62, 175-198`); its one production caller is the dashboard's `freezeReply` (`apps/dashboard/src/server/email.ts:45-59`).
- `sendEmail` hands a 429 back as a failure with no wait (`packages/channels/src/email-resend.ts:31-62`). Resend documents `rate_limit_exceeded`, `daily_quota_exceeded`, `monthly_quota_exceeded` and `concurrent_idempotent_requests` under 429 (the last also under 409), `retry-after` and `ratelimit-reset` in seconds, and a default of 10 requests a second per team (resend.com/docs/api-reference/errors, /rate-limit).
- `deliver()` writes the row AFTER the send when it is given no `messageId` (`packages/core/src/deliver.ts:458-485`, via `recordOutbound`, `packages/db/src/repositories/ingest.ts:127-179`). For email that row's id is not the one the request's `cl_message` tag names, so its receipts answer `no_such_row` (`apps/edge/lib/email/email-receipts.ts:58-59`) and a bounce suppresses nothing.
- Every caller of the door today: the WhatsApp webhook (`apps/edge/lib/whatsapp/persist.ts:237`), the broadcast batch (`packages/core/src/messages/broadcast.ts:208`, WhatsApp only) and the queued-send job (`packages/core/src/messages/send.ts:52`). The only email path is the queued reply, whose row is inserted with the id its request was frozen under (`packages/core/src/conversations/reply.ts:201-218, 364-376`; `apps/dashboard/src/server/core-ports.ts:192-200`). The edge's other `recordOutbound` caller writes WhatsApp or text only (`apps/edge/lib/receptionist/draft-queue.ts:33, 51-62`).
- `sendQueued` takes its purpose from the template alone and is never proactive (`packages/core/src/messages/send.ts:39-41, 63`), and says any provider refusal as `HTTP <status>` (`:92-103`).

**Not in this part, and where it goes:** the writer of a batch email's queued row and its id derived from the recipient (so a resumed batch reuses both) arrive with their first caller, Part 3's sender. Checking that Resend's DKIM signature covers `List-Unsubscribe` belongs to Part 2's proof, which sends to a real mailbox. The Leads page's dead doors that the PRD filed under W0 (`__leadFindEmail` never installed, `__leadErase` never called, `lead_searches` missing from the realtime publication, the peek limited to the loaded page, `checksOf` matching keys the planner never writes) go into Part 4, which edits those pages.

---

## File map

| File | What changes |
| --- | --- |
| `packages/channels/src/email.ts` | `EmailCampaign`; `EmailRequestInput.parent` may be null, gains `subject` and `campaign`; `unsubscribeHeaders`; `buildEmailRequest` builds a first email and a campaign; `ResendLimit` and `resendLimitOf` |
| `packages/channels/src/email-resend.ts` | `sendEmail` waits out a short limit once, through `postEmail` and `waitAskedMs` |
| `packages/core/src/deliver.ts` | `deliver()` refuses an email without the row its request names |
| `packages/db/src/repositories/ingest.ts` | `recordOutbound` refuses email |
| `packages/core/src/messages/send.ts` | the payload's `purpose` and `proactive`; a provider limit said and paged |
| `packages/jobs/src/handlers.ts` | the `outbound_send` payload comment names the two new fields |
| `tooling/scripts/tests/email-wire.test.mjs` | first email, campaign, unsubscribe checks, limits, the wait |
| `tooling/scripts/tests/deliver.test.mjs` | email tests queue their row first; the door's refusal |
| `tooling/scripts/tests/core-send-path.test.mjs` | the payload's word; a limit said and paged |
| `tooling/scripts/tests/email-receipts.test.mjs` | a first email's receipts find its row |
| `docs/superpowers/specs/2026-09-25-reach-out-design.md` | the rate line (PR 1); Part 1's status (PR 2) |

---

## PR 1 — the wire

Branch: `git switch -c design/reach-out-send-path origin/main` (after `git fetch origin`). This plan file is the branch's first commit.

### Task 1: A first email, and a campaign email

**Files:**
- Modify: `packages/channels/src/email.ts:48-62` (the input), `:159-198` (the builder and its comment)
- Test: `tooling/scripts/tests/email-wire.test.mjs`

- [ ] **Step 1: Write the failing tests**

In `tooling/scripts/tests/email-wire.test.mjs`, after the test `"a parent with no Message-ID still gets a reply: no thread headers, and a subject a person can find"`, add:

```js
const CAMPAIGN = {
  unsubscribeUrl: "https://app.chanlytics.com/u/tok_123",
  unsubscribeMailto: "unsubscribe+tok_123@mail.chanlytics.com",
  footer:
    'I found your business on Google Maps.\nBest Movers · 1 Main St, Austin, TX 78701\nNot interested? Reply "no thanks" · Unsubscribe: https://app.chanlytics.com/u/tok_123',
};

test("a first email names its own subject and threads under nothing; words a program wrote say so", () => {
  const r = buildEmailRequest(input({ parent: null, subject: "The calls you miss mid-session", signature: null }));
  assert.equal(r.subject, "The calls you miss mid-session", "its own, with no Re:");
  assert.deepEqual(r.headers, { "Auto-Submitted": "auto-generated" }, "the receptionist wrote it, and it answers nothing");
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
  assert.throws(() => buildEmailRequest(input({ parent: null })), /a first email names its subject/);
  assert.throws(() => buildEmailRequest(input({ parent: null, subject: "  \r\n " })), /a first email names its subject/);
});

test("a campaign says what it is and how to stop it in one click, and carries its footer after the signature", () => {
  const first = buildEmailRequest(input({ parent: null, subject: "The calls you miss mid-session", campaign: CAMPAIGN }));
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
      parent: { messageId: "m1", rfcMessageId: "<first@mail.chanlytics.com>", references: [], subject: "The calls you miss mid-session" },
      actor: "human",
      campaign: CAMPAIGN,
    }),
  );
  assert.equal(nudge.subject, "Re: The calls you miss mid-session");
  assert.equal(nudge.headers["In-Reply-To"], "<first@mail.chanlytics.com>");
  assert.equal(nudge.headers["Auto-Submitted"], "auto-generated", "a program sent it, whoever wrote the words");
  assert.equal(nudge.headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
  assert.equal("List-Unsubscribe" in buildEmailRequest(input()).headers, false, "a reply carries none");
});

test("a campaign's unsubscribe is one https address and one mail address, and its footer is never empty, or no request is built", () => {
  for (const [over, why] of [
    [{ unsubscribeUrl: "http://app.chanlytics.com/u/t" }, /one https address/],
    [{ unsubscribeUrl: "javascript:alert(1)" }, /one https address/],
    [{ unsubscribeUrl: "https://app.chanlytics.com/u/t\r\nBcc: x@evil.test" }, /one https address/],
    [{ unsubscribeUrl: "https://a.example/u/t>, <https://evil.test" }, /one https address/],
    [{ unsubscribeMailto: "not an address" }, /one address/],
    [{ unsubscribeMailto: "a@b.co\r\nBcc: x@evil.test" }, /one address/],
    [{ footer: "  " }, /footer is never empty/],
  ]) {
    assert.throws(
      () => buildEmailRequest(input({ parent: null, subject: "Hi", campaign: { ...CAMPAIGN, ...over } })),
      why,
      JSON.stringify(over),
    );
  }
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
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `corepack pnpm --filter @chanlytics/channels build && node --conditions=react-server --import tsx --test tooling/scripts/tests/email-wire.test.mjs`
Expected: the three new tests FAIL (`TypeError: Cannot read properties of null (reading 'rfcMessageId')`); every other test in the file passes.

- [ ] **Step 3: Implement**

In `packages/channels/src/email.ts`, replace the `EmailRequestInput` interface (lines 48-62) with:

```ts
/** What a campaign carries that a reply does not: how a person stops it, and the lines its foot owes. */
export interface EmailCampaign {
  /** One click, no sign-in (RFC 8058): an https address that takes a POST. */
  unsubscribeUrl: string;
  /** The same by mail, for a client that only knows mailto: a bare address. */
  unsubscribeMailto: string;
  /** Why they are hearing from us, the business's name and postal address, the way to say no. Composed by the caller; never empty. */
  footer: string;
}

export interface EmailRequestInput {
  identity: EmailIdentity;
  /** The person's stored address (normalizeEmail's spelling). */
  to: string;
  /** The email this answers. Null for a first email, which then names its own subject. */
  parent: EmailParent | null;
  /** A first email's subject. Read only when there is no parent: a reply's is always its parent's, once, with Re:. */
  subject?: string;
  /** The words, as the receptionist or a person wrote them. */
  body: string;
  /** Composed from the business's profile by the caller; null sends none. */
  signature: string | null;
  /** Who wrote the words: with the parent and the campaign, decides Auto-Submitted. */
  actor: "ai" | "human";
  /** Mail a program sends on its own schedule (a reach-out, an offer): marked as such, with its unsubscribe and its footer. */
  campaign?: EmailCampaign;
  /** The queued row this request belongs to: the idempotency key, and the tag every receipt names it by. */
  messageId: string;
  tenantId: string;
}
```

Then replace the doc comment and the function `buildEmailRequest` (lines 159-198) with:

```ts
/** A campaign's two ways to stop it, as the headers carry them. Anything that is not one https address and one mail address is refused. */
const UNSUBSCRIBE_URL = /^https:\/\/[^\s<>,]+$/;
const BARE_ADDRESS = /^[^\s<>@,]+@[^\s<>@,]+\.[^\s<>@,]+$/;
function unsubscribeHeaders(c: EmailCampaign): Record<string, string> {
  const url = c.unsubscribeUrl.trim();
  const mail = c.unsubscribeMailto.trim().replace(/^mailto:/i, "");
  if (!UNSUBSCRIBE_URL.test(url)) throw new Error("buildEmailRequest: a campaign's unsubscribe is one https address");
  if (!BARE_ADDRESS.test(mail)) throw new Error("buildEmailRequest: a campaign's unsubscribe by mail is one address");
  return {
    "List-Unsubscribe": `<${url}>, <mailto:${mail}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

/**
 * The request one email leaves as: a reply, or a first email.
 *
 * - From and Reply-To are the workspace's identity; To is the person's stored
 *   address. Neither is read from the parent's headers or from the words.
 * - A reply threads under its parent (In-Reply-To, References) and carries the
 *   parent's subject once, with Re:. A first email has no parent and names its
 *   own subject; one without a subject is a mistake in the code, not an email.
 *   No Message-ID is minted here: the provider assigns one and reports it on
 *   the sent event, which is where the ledger learns it.
 * - The header a mail system reads says what the email is (RFC 3834): a
 *   receptionist's reply is auto-replied; mail a program sends on its own -- a
 *   campaign, or a first email the receptionist wrote -- is auto-generated, so
 *   an auto-responder on the other side does not answer it and start a loop.
 *   A person's own words carry no such mark.
 * - A campaign carries the way to stop it: List-Unsubscribe with an https
 *   address and a mail address, and List-Unsubscribe-Post for one click
 *   (RFC 8058), which the large mailbox providers require of bulk mail; and
 *   its footer, after the signature. Both addresses are checked here, because
 *   a header value that is not one line is a second header.
 * - The tags name the row and the workspace, so a receipt finds its message
 *   without a lookup by the provider's id, even one that arrives before the
 *   send's own write.
 */
export function buildEmailRequest(i: EmailRequestInput): EmailRequest {
  const subject = i.parent ? replySubject(i.parent.subject) : oneLine(i.subject ?? "").slice(0, SUBJECT_MAX);
  if (!subject) throw new Error("buildEmailRequest: a first email names its subject");
  if (i.campaign && !i.campaign.footer.trim()) throw new Error("buildEmailRequest: a campaign's footer is never empty");
  const unsubscribe = i.campaign ? unsubscribeHeaders(i.campaign) : {};
  const text = [i.body.trim(), i.signature?.trim(), i.campaign?.footer.trim()].filter(Boolean).join("\n\n");
  const inReplyTo = i.parent ? messageIdHeader(i.parent.rfcMessageId) : null;
  const references = i.parent ? referencesFor(i.parent) : [];
  const autoSubmitted =
    i.campaign || (i.actor === "ai" && !i.parent) ? "auto-generated" : i.actor === "ai" ? "auto-replied" : null;
  const headers: Record<string, string> = {
    ...(inReplyTo ? { "In-Reply-To": inReplyTo } : {}),
    ...(references.length ? { References: references.join(" ") } : {}),
    ...(autoSubmitted ? { "Auto-Submitted": autoSubmitted } : {}),
    ...unsubscribe,
  };
  return {
    from: mailboxHeader(i.identity.fromName, i.identity.fromAddress),
    to: [i.to],
    reply_to: [i.identity.replyTo],
    subject,
    text,
    html: emailHtml(text),
    headers,
    tags: [
      { name: "cl_message", value: i.messageId },
      { name: "cl_tenant", value: i.tenantId },
    ],
    idempotency_key: i.messageId,
  };
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `corepack pnpm --filter @chanlytics/channels build && node --conditions=react-server --import tsx --test tooling/scripts/tests/email-wire.test.mjs tooling/scripts/tests/deliver.test.mjs tooling/scripts/tests/email-receipts.test.mjs`
Expected: PASS, including the pinned test `"the request, pinned: ..."` (a reply's request is unchanged byte for byte).

- [ ] **Step 5: Commit**

```bash
git add packages/channels/src/email.ts packages/channels/dist tooling/scripts/tests/email-wire.test.mjs
git commit -m "A first email names its own subject, and a campaign carries its unsubscribe and its footer

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 2: What the provider's refusal means for the next send

**Files:**
- Modify: `packages/channels/src/email.ts` (after `requestLeavesAs`, before the `the mail domain` section)
- Test: `tooling/scripts/tests/email-wire.test.mjs`

- [ ] **Step 1: Write the failing test**

Add `resendLimitOf` to the import list at the top of `tooling/scripts/tests/email-wire.test.mjs` (after `replySubject,`), and add at the end of the file:

```js
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
  assert.equal(resendLimitOf(no(409, "invalid_idempotent_request")), null, "a frozen request never changes: not a limit");
  assert.equal(resendLimitOf(no(422, "validation_error")), null);
  assert.equal(resendLimitOf({ ok: true, wamid: "re_1", status: 200 }), null);
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `corepack pnpm --filter @chanlytics/channels build && node --conditions=react-server --import tsx --test tooling/scripts/tests/email-wire.test.mjs`
Expected: FAIL: `SyntaxError: The requested module '@chanlytics/channels' does not provide an export named 'resendLimitOf'`.

- [ ] **Step 3: Implement**

In `packages/channels/src/email.ts`, directly after the function `requestLeavesAs`, add:

```ts
/**
 * What a refusal from the provider means for the next send, read from the
 * names Resend documents for its 429 and 409 answers:
 *   rate       too many requests this second; the next second takes it
 *   in_flight  a request under the same key is still being worked; its result is coming
 *   daily      the day's sending is used up, for every workspace on the key
 *   monthly    the month's is
 * Null for anything else, a success included. A 429 that names nothing is read
 * as the one that passes: the provider did not take the email, and waiting a
 * second costs nothing.
 */
export type ResendLimit = "rate" | "in_flight" | "daily" | "monthly";

export function resendLimitOf(r: { ok?: boolean; status: number; errorBody?: string | null }): ResendLimit | null {
  if (r.ok || (r.status !== 429 && r.status !== 409)) return null;
  let name: unknown = null;
  try {
    name = (JSON.parse(r.errorBody ?? "") as { name?: unknown } | null)?.name ?? null;
  } catch {
    name = null;
  }
  if (name === "daily_quota_exceeded") return "daily";
  if (name === "monthly_quota_exceeded") return "monthly";
  if (name === "concurrent_idempotent_requests") return "in_flight";
  return r.status === 429 ? "rate" : null;
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `corepack pnpm --filter @chanlytics/channels build && node --conditions=react-server --import tsx --test tooling/scripts/tests/email-wire.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/channels/src/email.ts packages/channels/dist tooling/scripts/tests/email-wire.test.mjs
git commit -m "resendLimitOf: the provider's 429 read as slow down, wait for the first, or a used-up day or month

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 3: The provider's "not this second" is waited out once

**Files:**
- Modify: `packages/channels/src/email-resend.ts:1-62`
- Test: `tooling/scripts/tests/email-wire.test.mjs`

- [ ] **Step 1: Write the failing test**

Add at the end of `tooling/scripts/tests/email-wire.test.mjs`:

```js
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
  const limited = (name, headers = { "retry-after": "1" }) => ({
    status: 429,
    body: JSON.stringify({ statusCode: 429, name, message: "x" }),
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
    assert.deepEqual(await sendEmail({ apiKey: "k" }, r, wait), { ok: true, wamid: "re_2", status: 200 });
    assert.deepEqual(waits, [1000], "as long as it asked, once");
    assert.equal(posted.length, 2);
    assert.equal(posted[1].body, posted[0].body, "the same bytes");
    assert.equal(posted[1].headers["Idempotency-Key"], posted[0].headers["Idempotency-Key"], "under the same key");

    again();
    answers = [limited("concurrent_idempotent_requests", {}), ok];
    assert.equal((await sendEmail({ apiKey: "k" }, r, wait)).ok, true, "the first is still being worked: its answer is ours");
    assert.deepEqual(waits, [1000], "a second, when it did not say how long");

    again();
    answers = [limited("rate_limit_exceeded", { "retry-after": "30" })];
    const long = await sendEmail({ apiKey: "k" }, r, wait);
    assert.deepEqual([long.ok, long.status, posted.length, waits.length], [false, 429, 1, 0], "too long for a worker's run");

    again();
    answers = [limited("daily_quota_exceeded", {})];
    const quota = await sendEmail({ apiKey: "k" }, r, wait);
    assert.deepEqual([resendLimitOf(quota), posted.length, waits.length], ["daily", 1, 0], "a used-up day is not waited for");

    again();
    answers = [limited("rate_limit_exceeded"), limited("rate_limit_exceeded")];
    const twice = await sendEmail({ apiKey: "k" }, r, wait);
    assert.deepEqual([twice.status, posted.length, waits.length], [429, 2, 1], "once, never a loop");
  } finally {
    globalThis.fetch = real;
  }
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `corepack pnpm --filter @chanlytics/channels build && node --conditions=react-server --import tsx --test tooling/scripts/tests/email-wire.test.mjs`
Expected: FAIL on the first `deepEqual` (`ok: false, status: 429` where `ok: true` was expected).

- [ ] **Step 3: Implement**

In `packages/channels/src/email-resend.ts`, add this paragraph to the file's opening comment, after the paragraph that ends `which a frozen request never produces.`:

```ts
 *
 * A refusal that means "not this second" (resendLimitOf: rate, in_flight) is
 * waited out once, when the provider's wait is short, and the same bytes are
 * posted again under the same key: the provider did not take the first, or it
 * answers the second with the first's result. A longer wait, a used-up day or
 * month, or a second refusal is handed back as it came.
```

Change the import from `./email` to include `resendLimitOf`:

```ts
import {
  mailDomainsFrom,
  receivedEmailFrom,
  resendLimitOf,
  type EmailRequest,
  type MailDomainFacts,
  type ReceivedEmail,
} from "./email";
```

Replace everything from `const RESEND_EMAILS = ...` through the end of the function `sendEmail` (lines 28-62) with:

```ts
const RESEND_EMAILS = "https://api.resend.com/emails";
const SEND_TIMEOUT_MS = 15_000;
/** The longest a send waits for the provider's "in a moment" before handing the answer back: a worker's run is bounded. */
const LIMIT_WAIT_MAX_MS = 2_000;
/** What a refusal that says nothing about how long is given. */
const LIMIT_WAIT_DEFAULT_MS = 1_000;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** How long the provider asked us to wait, in ms: retry-after, else ratelimit-reset, both in seconds. Null when it did not say. */
function waitAskedMs(h: Headers): number | null {
  for (const name of ["retry-after", "ratelimit-reset"]) {
    const v = h.get(name);
    const s = Number(v);
    if (v !== null && v.trim() !== "" && Number.isFinite(s) && s >= 0) return Math.round(s * 1000);
  }
  return null;
}

/** One POST of the frozen request, and how long the provider asked us to wait if it refused. */
async function postEmail(
  cfg: ResendConfig,
  request: EmailRequest,
): Promise<{ result: SendResult; waitMs: number | null }> {
  const { idempotency_key, ...body } = request;
  try {
    const r = await fetch(RESEND_EMAILS, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotency_key,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    const raw = await r.text().catch(() => "");
    if (r.ok) {
      const id = (() => {
        try {
          return (JSON.parse(raw) as { id?: unknown }).id;
        } catch {
          return null;
        }
      })();
      // Accepted with no id is still accepted: the words are with the provider,
      // and the receipt finds the row by its tag, not by this id.
      return { result: { ok: true, wamid: typeof id === "string" ? id : null, status: r.status }, waitMs: null };
    }
    return {
      result: { ok: false, wamid: null, status: r.status, errorBody: raw.slice(0, 500) },
      waitMs: waitAskedMs(r.headers),
    };
  } catch (e) {
    // status 0: never reached the provider, which is distinct from any answer it gave.
    return {
      result: { ok: false, wamid: null, status: 0, errorBody: e instanceof Error ? e.message : String(e) },
      waitMs: null,
    };
  }
}

export async function sendEmail(
  cfg: ResendConfig,
  request: EmailRequest,
  wait: (ms: number) => Promise<void> = sleep,
): Promise<SendResult> {
  const first = await postEmail(cfg, request);
  const limit = resendLimitOf(first.result);
  if (limit !== "rate" && limit !== "in_flight") return first.result;
  const ms = first.waitMs ?? LIMIT_WAIT_DEFAULT_MS;
  if (ms > LIMIT_WAIT_MAX_MS) return first.result;
  await wait(ms);
  return (await postEmail(cfg, request)).result;
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `corepack pnpm --filter @chanlytics/channels build && node --conditions=react-server --import tsx --test tooling/scripts/tests/email-wire.test.mjs tooling/scripts/tests/deliver.test.mjs`
Expected: PASS, including the existing `"sendEmail posts the frozen request under its own key, ..."`.

- [ ] **Step 5: Commit**

```bash
git add packages/channels/src/email-resend.ts packages/channels/dist tooling/scripts/tests/email-wire.test.mjs
git commit -m "sendEmail waits out the provider's 'not this second' once, and posts the same bytes under the same key

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 4: The whole suite, the spec's rate line, PR 1

**Files:**
- Modify: `docs/superpowers/specs/2026-09-25-reach-out-design.md` (§4.5)

- [ ] **Step 1: Correct the rate line**

In `docs/superpowers/specs/2026-09-25-reach-out-design.md` §4.5, replace `two a second (Resend's limit)` (the words after `at most`, found with `grep -n "two a second"`) with `five a second across the platform (Resend allows ten a second per team by default)`.

- [ ] **Step 2: Everything green**

Run: `corepack pnpm --filter "./packages/*" build && corepack pnpm -r typecheck && corepack pnpm lint && corepack pnpm test && git status --short`
Expected: all pass; `git status` shows only the spec change (no dist drift beyond what Tasks 1–3 committed; never `apps/dashboard/tsconfig.json`).

- [ ] **Step 3: Commit and open the PR**

```bash
git add docs/superpowers/specs/2026-09-25-reach-out-design.md
git commit -m "Reach out spec: the platform's pace sits under Resend's ten a second per team

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push -u origin design/reach-out-send-path
gh pr create --base main --title "Reach out, Part 1 of 2: the wire builds a first email and a campaign, and waits out a short limit" --body "$(cat <<'EOF'
The email wire can build mail Chanlytics starts itself. Nothing calls it yet; Part 3's sender will.

- `buildEmailRequest` takes `parent: null` with its own `subject` (a first email), and a `campaign`: `List-Unsubscribe` (https and mailto, both checked to one line), `List-Unsubscribe-Post: List-Unsubscribe=One-Click`, `Auto-Submitted: auto-generated`, and the footer after the signature. A reply's request is byte for byte what it was (the pinned test holds).
- `resendLimitOf` reads Resend's documented 429 and 409 names: rate, in_flight, daily, monthly.
- `sendEmail` waits out a rate limit or an in-flight key once (the provider's retry-after, at most 2 s) and posts the same bytes under the same key.
- The reach-out spec's pace line: Resend allows ten a second per team, not two.

**What changes for a customer:** nothing. **Before merging:** nothing. **Deploy order:** either.

Plan: `docs/superpowers/plans/2026-09-25-reach-out-part-1-send-path.md`.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: Merge on green**

Wait for every check to pass (`gh pr checks <n>`; a docs-and-packages PR runs the same six checks the last ones did), then `gh pr merge <n> --squash`, and delete the remote branch if GitHub did not.

---

## PR 2 — the door

Branch: `git fetch origin && git switch -c design/reach-out-send-door origin/main` (after PR 1 merged).

### Task 5: An email leaves only from the row its request names

**Files:**
- Modify: `packages/core/src/deliver.ts:395-397` (the top of `deliver`)
- Modify: `packages/db/src/repositories/ingest.ts:144` (the top of `recordOutbound`)
- Test: `tooling/scripts/tests/deliver.test.mjs` (the email section, from `/* ---...--- email */`)

- [ ] **Step 1: Queue the email tests' row first, and write the failing test**

In `tooling/scripts/tests/deliver.test.mjs`, replace the helper `emailed` with:

```js
const emailed = (over = {}) =>
  words({ to: ADDRESS, channel: "email", email: frozen(), body: "We can do Saturday at 9.", messageId: "m1", ...over });
/** The row an email is queued as before it leaves, under the id its request was frozen with (frozen()'s "m1"). */
const queuedEmail = (over = {}) => ({
  id: "m1",
  tenant_id: T,
  conversation_id: "c1",
  contact_id: "k1",
  channel: "email",
  direction: "outbound",
  sender: "human",
  status: "queued",
  body: "We can do Saturday at 9.",
  created_at: "2026-09-10T09:59:00.000Z",
  ...over,
});
```

Replace the test `"an email leaves as the request that was frozen for it: the wire is handed those bytes, and the row says email"` with:

```js
test("an email leaves as the request that was frozen for it, from the row it was queued as: the wire is handed those bytes, and that row says sent", async () => {
  const t = tables({ conversations: [thread({ contacts: onEmail() })], messages: [queuedEmail()] });
  const w = emailWire();
  const d = emailed();
  const out = await deliver(ports(t, w), d);
  assert.equal(out.outcome, "sent");
  assert.equal(out.messageId, "m1", "the row it was queued as");
  assert.equal(out.externalId, "re_1", "the provider's id, which a receipt may also name");
  assert.equal(w.calls.length, 1);
  assert.equal(w.calls[0].to, ADDRESS);
  assert.equal(w.calls[0].p.email, d.email, "the frozen request itself, not something assembled at the door");
  assert.equal(t.messages.length, 1, "no second row");
  assert.deepEqual([t.messages[0].status, t.messages[0].external_id], ["sent", "re_1"]);
});
```

In the test `"email's three refusals, ..."`, replace its loop body with:

```js
    const t = tables({ conversations: [thread({ contacts: who })], messages: [queuedEmail()] });
    const w = emailWire();
    const out = await deliver(ports(t, w), emailed(over));
    assert.equal(out.outcome === "refused" ? out.reason : null, reason, JSON.stringify({ over, who }));
    assert.equal(w.calls.length, reason ? 0 : 1, `${reason ?? "sent"}: the wire is called only for words that may go`);
    assert.equal(t.messages[0].status, reason ? "canceled" : "sent", `${reason ?? "sent"}: on the row it was queued as`);
```

Replace the test `"a workspace with no email wire bound fails as ours, ..."` with:

```js
test("a workspace with no email wire bound fails as ours, like any channel this runtime does not have", async () => {
  const t = tables({ conversations: [thread({ contacts: onEmail() })], messages: [queuedEmail()] });
  const out = await deliver(ports(t, wireOf()), emailed());
  assert.equal(out.outcome, "failed");
  assert.equal(out.reason, "no_sender_for_channel");
  assert.equal(t.messages.length, 1, "on the row it was queued as, never a second");
  assert.equal(t.messages[0].status, "failed");
});
```

Then add, at the end of the file:

```js
test("an email leaves only from the queued row its request was frozen for: without one, or under another row's key, the door refuses the caller before it reads anything", async () => {
  for (const [over, why] of [
    [{ messageId: undefined }, "no row"],
    [{ messageId: null }, "no row"],
    [{ messageId: "m2" }, "another row's key"],
  ]) {
    const t = tables({ conversations: [thread({ contacts: onEmail() })], messages: [queuedEmail({ id: "m2" })] });
    const w = emailWire();
    await assert.rejects(
      deliver(ports(t, w), emailed(over)),
      /an email leaves only from the queued row its request was frozen for/,
      why,
    );
    assert.equal(w.calls.length, 0, `${why}: the wire is never called`);
    assert.equal(t.messages.length, 1, `${why}: no row is written`);
    assert.equal(t.messages[0].status, "queued", `${why}: and the row that is there is left alone`);
  }
  // The door's own after-the-send writer takes no email either: an id it mints is one no receipt can name.
  const { recordOutbound } = await import(pathToFileURL(path.join(ROOT, "packages/db/dist/index.js")).href);
  const t = tables();
  await assert.rejects(
    recordOutbound(fakeDb(t), {
      tenantId: T,
      conversationId: "c1",
      contactId: "k1",
      sender: "human",
      body: "x",
      externalId: "re_1",
      channel: "email",
    }),
    /an email's row is written before it is sent/,
  );
  assert.equal(t.messages.length, 0);
});
```

- [ ] **Step 2: Run to see the new test fail**

Run: `corepack pnpm --filter "./packages/*" build && node --conditions=react-server --import tsx --test tooling/scripts/tests/deliver.test.mjs`
Expected: the new test FAILS (`Missing expected rejection`); the three rewritten email tests PASS (they queue their row, which the door already finalizes in place).

- [ ] **Step 3: Implement**

In `packages/core/src/deliver.ts`, make the first lines of `deliver` read:

```ts
export async function deliver(ports: DeliverPorts, d: Delivery): Promise<Delivered> {
  // An email is written before it is sent, under the id its request was frozen with: every receipt names that row by
  // the request's tag, so a row written after the send (recordOutbound's, below) is one no receipt can find, and its
  // bounce suppresses nothing. A delivery that breaks this is a caller's mistake, said as one before anything is read.
  if (d.channel === "email" && (!d.messageId || (d.email && d.email.idempotency_key !== d.messageId)))
    throw new Error(
      `deliver: an email leaves only from the queued row its request was frozen for (conversation ${d.conversationId})`,
    );
  const nowMs = (ports.now ?? Date.now)();
```

In `packages/db/src/repositories/ingest.ts`, make the first lines of `recordOutbound`'s body read:

```ts
): Promise<string | null> {
  // An email's row is written before its words leave, under the id its request is frozen with (core deliver.ts): an
  // id minted here, after the send, is one no receipt can name.
  if (p.channel === "email") throw new Error("record_outbound: an email's row is written before it is sent, never after");
  const { data, error } = await db
```

- [ ] **Step 4: Run to see it pass**

Run: `corepack pnpm --filter "./packages/*" build && node --conditions=react-server --import tsx --test tooling/scripts/tests/deliver.test.mjs tooling/scripts/tests/core-send-path.test.mjs tooling/scripts/tests/email-receipts.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/deliver.ts packages/db/src/repositories/ingest.ts packages/*/dist tooling/scripts/tests/deliver.test.mjs
git commit -m "An email leaves only from the queued row its request names: the door refuses the caller, and recordOutbound takes none

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 6: A queued job may say what its send is, only ever more strictly

**Files:**
- Modify: `packages/core/src/messages/send.ts:1-69`
- Modify: `packages/jobs/src/handlers.ts:180` (the comment)
- Test: `tooling/scripts/tests/core-send-path.test.mjs`

- [ ] **Step 1: Write the failing test**

In `tooling/scripts/tests/core-send-path.test.mjs`, after the test `"a template send asks which yes it needs, ..."`, add:

```js
test("a job may say what its send IS, and only ever more strictly: an offer is marketing whatever its template says; only true starts a conversation", async () => {
  const cases = [
    [{ purpose: "marketing" }, "conversational", "marketing", false],
    [{ purpose: "conversational" }, "marketing", "marketing", false],
    [{}, "marketing", "marketing", false],
    [{ proactive: true }, "conversational", "conversational", true],
    [{ proactive: "yes" }, "conversational", "conversational", false],
    [{ proactive: false }, "conversational", "conversational", false],
  ];
  for (const [payload, fromTemplate, purpose, proactive] of cases) {
    const { ports, log } = fakes({ purposeOf: fromTemplate });
    await core.sendQueued(ports, send(payload));
    assert.deepEqual(
      [log[0][1].purpose, log[0][1].proactive],
      [purpose, proactive],
      JSON.stringify({ payload, fromTemplate }),
    );
  }
});
```

- [ ] **Step 2: Run to see it fail**

Run: `node --conditions=react-server --import tsx --test tooling/scripts/tests/core-send-path.test.mjs`
Expected: FAIL on the first case (`conversational` where `marketing` was expected).

- [ ] **Step 3: Implement**

In `packages/core/src/messages/send.ts`, make the imports read:

```ts
import type { SendPurpose } from "@chanlytics/contracts";
import type { Channel } from "../deliver";
import type { SendQueuedPorts } from "./ports";
```

Add two fields at the end of `SendQueuedCommand["payload"]`:

```ts
    template?: { name: string; language: string; params: string[] };
    /**
     * What the send IS, when the job knows better than a template can: an offer is marketing whatever its words, and a
     * first email starts a conversation. Both can only make the door stricter: a payload never makes a template's
     * purpose looser, and only `true` makes a send proactive.
     */
    purpose?: SendPurpose;
    proactive?: boolean;
```

Replace the three lines from `// Which yes this send needs. Never proactive: everything on this queue` through `const purpose = await ports.purposeOf(p.template);` with:

```ts
  // Which yes this send needs: the template's, as Meta has it, or stricter when the job says the words are an offer.
  // A payload is our own code's word, and our own code is not the authority on a template's category, so it can only
  // tighten. Proactive likewise: only a job that says so starts a conversation; everything else on this queue answers
  // a thread that exists.
  const fromTemplate = await ports.purposeOf(p.template);
  const purpose: SendPurpose = p.purpose === "marketing" ? "marketing" : fromTemplate;
```

and replace `proactive: false,` in the `ports.deliver({ ... })` call with:

```ts
    proactive: p.proactive === true,
```

In `packages/jobs/src/handlers.ts`, make the comment above `outboundSend` read:

```ts
/** outbound_send: core's sendQueued, over this runtime's ports. payload: { message_id, conversation_id, to_phone | to_email, body?, template?, purpose?, proactive? } */
```

- [ ] **Step 4: Run to see it pass**

Run: `node --conditions=react-server --import tsx --test tooling/scripts/tests/core-send-path.test.mjs`
Expected: PASS, the existing `"a queued row goes through the door with the row's own sender, the template's purpose, never proactive; ..."` included.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/messages/send.ts packages/jobs/src/handlers.ts tooling/scripts/tests/core-send-path.test.mjs
git commit -m "A queued job may say its send is an offer, or starts a conversation: only ever more strictly than its template

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 7: A limit at the mail provider is said as one, and a used-up day pages the platform

**Files:**
- Modify: `packages/core/src/messages/send.ts:70-109` (the failure branch)
- Test: `tooling/scripts/tests/core-send-path.test.mjs`

- [ ] **Step 1: Write the failing test**

Add at the end of `tooling/scripts/tests/core-send-path.test.mjs`:

```js
test("a limit at the mail provider is said as one: a used-up day pages the platform, a busy second does not, and a text's 429 is still a status", async () => {
  const emailRow = {
    status: "queued",
    body: "We can do Saturday.",
    channel: "email",
    sender: "human",
    email: { to: ["ana@example.com"], idempotency_key: "m1" },
  };
  const byEmail = {
    tenantId: "t1",
    payload: { message_id: "m1", conversation_id: "c1", to_email: "ana@example.com", body: "We can do Saturday." },
  };
  const refusedBy = (name) => ({
    outcome: "failed",
    reason: "provider",
    status: 429,
    errorBody: JSON.stringify({ statusCode: 429, name, message: "x" }),
    messageId: "m1",
  });
  const day = fakes({ queued: emailRow, deliver: refusedBy("daily_quota_exceeded") });
  await core.sendQueued(day.ports, byEmail);
  assert.deepEqual(day.ops(), ["deliver", "page", "escalate", "alert"]);
  assert.deepEqual([day.log[1][1], day.log[1][2]], ["provider_quota:email", "email: the daily sending limit is used up"]);
  assert.equal(day.log[2][3], "Dashboard reply could not be delivered (the mail provider's sending limit is used up for now).");
  const busy = fakes({ queued: emailRow, deliver: refusedBy("rate_limit_exceeded") });
  await core.sendQueued(busy.ports, byEmail);
  assert.deepEqual(busy.ops(), ["deliver", "escalate", "alert"], "a busy second is nobody's page");
  assert.equal(busy.log[1][3], "Dashboard reply could not be delivered (the mail provider asked us to slow down).");
  const text = fakes({ deliver: refusedBy("rate_limit_exceeded") });
  await core.sendQueued(text.ports, send());
  assert.equal(text.log[1][3], "Dashboard reply could not be delivered (HTTP 429).", "the mail provider's words are read on email only");
});
```

- [ ] **Step 2: Run to see it fail**

Run: `node --conditions=react-server --import tsx --test tooling/scripts/tests/core-send-path.test.mjs`
Expected: FAIL (`["deliver", "escalate", "alert"]` where `page` was expected second).

- [ ] **Step 3: Implement**

In `packages/core/src/messages/send.ts`, add the import:

```ts
import { resendLimitOf } from "@chanlytics/channels";
```

Directly after `if (out.outcome !== "failed") return;`, add:

```ts
  // A limit at the mail provider is not this thread's fault either (channels resendLimitOf). A used-up day or month
  // stops every workspace's email on the key, so the platform is paged; "slow down" is one second's problem, said so.
  const limit = channel === "email" && out.reason === "provider" ? resendLimitOf(out) : null;
  if (limit === "daily" || limit === "monthly") {
    await ports.page?.(
      "provider_quota:email",
      `email: the ${limit} sending limit is used up`,
      `Tenant ${cmd.tenantId}, message ${p.message_id}. Every workspace's email is refused until it resets or the plan grows.`,
    );
  }
```

In the `cause` chain, add two branches after `? "the thread could not be read at the wire"`, so the chain reads:

```ts
  const cause =
    out.reason === "no_credentials"
      ? notConnected
      : out.reason === "no_sender_for_channel"
        ? `this runtime has no ${channel} line`
        : out.reason === "wire_unreadable"
          ? "the thread could not be read at the wire"
          : limit === "daily" || limit === "monthly"
            ? "the mail provider's sending limit is used up for now"
            : limit === "rate" || limit === "in_flight"
              ? "the mail provider asked us to slow down"
              : // Status 0 is no answer at all: the network failed, or the email wire refused a request it will not send
                // (deliver.ts emailSender). The row keeps which; "HTTP 0" told an owner nothing.
                out.status === 0
                ? "it never reached the provider"
                : `HTTP ${out.status}`;
```

- [ ] **Step 4: Run to see it pass**

Run: `node --conditions=react-server --import tsx --test tooling/scripts/tests/core-send-path.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/messages/send.ts tooling/scripts/tests/core-send-path.test.mjs
git commit -m "A limit at the mail provider is said as one, and a used-up day or month pages the platform

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 8: A first email's receipts find its row

**Files:**
- Test: `tooling/scripts/tests/email-receipts.test.mjs`

This task changes no code: it proves that a request built by Task 1 and the receipts reader agree on which row a receipt names.

- [ ] **Step 1: Write the test**

Add `buildEmailRequest` to the import list from `@chanlytics/channels` at the top of `tooling/scripts/tests/email-receipts.test.mjs`, and add at the end of the file:

```js
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
      unsubscribeMailto: "unsubscribe+tok@mail.chanlytics.com",
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
```

- [ ] **Step 2: Run it**

Run: `node --conditions=react-server --import tsx --test tooling/scripts/tests/email-receipts.test.mjs`
Expected: PASS (PR 1's request is in the built package).

- [ ] **Step 3: Commit**

```bash
git add tooling/scripts/tests/email-receipts.test.mjs
git commit -m "A first email's receipts find the row it was queued as, by the tags its request left with

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 9: The whole suite, the spec's status, PR 2, production

**Files:**
- Modify: `docs/superpowers/specs/2026-09-25-reach-out-design.md` (§6, item 1)

- [ ] **Step 1: Everything green**

Run: `corepack pnpm --filter "./packages/*" build && corepack pnpm -r typecheck && corepack pnpm lint && corepack pnpm test && git status --short`
Expected: all pass; `git status` is clean or shows only dist files Task 5 did not already commit (commit them).

- [ ] **Step 2: Open the PR**

```bash
git push -u origin design/reach-out-send-door
gh pr create --base main --title "Reach out, Part 1 of 2: an email leaves only from its own row, and a queued job says what its send is" --body "$(cat <<'EOF'
The send door keeps every email to the row its request names, before anything starts sending mail on its own.

- `deliver()` throws for an email with no queued row, or whose request was frozen for another row: every receipt finds its row by the request's tag, and a row minted after the send is one no receipt can name. `recordOutbound` takes no email, for the same reason. Every live caller already complies (the queued reply writes its row first).
- `sendQueued` reads `purpose` and `proactive` from the job's payload, only ever more strictly than the template.
- A limit at the mail provider is said in words ("asked us to slow down", "sending limit is used up for now"); a used-up day or month pages the platform (`provider_quota:email`).
- A first email's receipts find its row (email-receipts.test.mjs).

**What changes for a customer:** an email reply refused by the provider's limit now says so in the thread instead of "HTTP 429". **Before merging:** nothing. **Deploy order:** either.

Plan: `docs/superpowers/plans/2026-09-25-reach-out-part-1-send-path.md`.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: The spec's status**

In `docs/superpowers/specs/2026-09-25-reach-out-design.md` §6, prefix item 1 with `**Shipped 25 Sep 2026 in #<PR 1> (the wire) and #<PR 2> (the door).**`, using the two PR numbers. Commit (`Reach out spec: Part 1 shipped`, with the attribution line) and push to the PR's branch.

- [ ] **Step 4: Merge on green**

Wait for every check, then `gh pr merge <n> --squash`; delete the remote branch if GitHub did not.

- [ ] **Step 5: See it on production**

Both apps deploy from `main`. When `https://app.chanlytics.com/api/version` and the edge's `/api/version` carry the merge commit, read the email rows the week has sent, from the worktree (its `supabase/.temp` is linked):

```bash
"$HOME/AppData/Local/npm-cache/_npx/b96a6bd565c470ce/node_modules/.bin/supabase" db query --linked "select status, count(*) from messages where channel = 'email' and direction = 'outbound' and created_at > now() - interval '7 days' group by status order by status" </dev/null
```

Expected: `delivered` rows keep appearing after the deploy, and no row sits `queued` past its cancel window. That says replies still leave from their own rows and their receipts still find them.

---

## Self-review against the spec (§6 part 1 and §4.6)

- Every email a pre-written queued row: Task 5 (the door refuses anything else; the writer for a batch arrives with Part 3, named above).
- Purpose and `proactive` in the payload: Task 6.
- The recipient id as the idempotency key, and the queued row reused: Part 3, with its caller (named above).
- `buildEmailRequest` with `parent: null`, its own subject, the unsubscribe headers and the footer as arguments: Task 1.
- `Auto-Submitted: auto-generated` for mail a program sends: Task 1.
- 429 read and waited out: Tasks 2, 3, 7.
- A receipt lands on a first email's row: Task 8.
