/**
 * The email a reach-out send leaves as (apps/edge lib/reach-out/request.ts, Reach out Part 3 C9, C10, D19), run over
 * the real request builder, the real identity and the real unsubscribe seal: a first step's email, a step's that
 * answers the one before, and the two refusals that hold one back.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { verifyUnsubscribeToken } from "@chanlytics/channels";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const { reachOutRequest } = await import(pathToFileURL(path.join(ROOT, "apps/edge/lib/reach-out/request.ts")).href);

const SECRET = "a-secret-only-this-file-holds";
const T = "22222222-2222-4222-8222-222222222222";
const K = "33333333-3333-4333-8333-333333333333";
const M = "11111111-1111-4111-8111-111111111111";

const input = (over = {}) => ({
  tenantId: T,
  messageId: M,
  contactId: K,
  to: "owner@fixture-movers.example",
  words: { subject: "A quote for {{business}}", body: "Hi {{business}},\n\nMovers in {{city}} ask us for this." },
  lead: { business_name: "Fixture Movers", city: "Austin" },
  workspace: { businessName: "Harbor Moving Co", address: "100 Example St, Austin, TX 78701" },
  domain: { host: "getharbor.example", from_local: "sam", from_name: "Sam at Harbor" },
  mailbox: { reply_token: "abcdefghijklmnopqrstuvwx" },
  replyDomain: "mail.chanlytics.com",
  unsubscribe: { secret: SECRET, origin: "https://app.chanlytics.com" },
  parent: null,
  ...over,
});

test("a first step's email: its own domain, the Inbox's reply route, the lead's values, the foot, and one click to stop", () => {
  const out = reachOutRequest(input());
  assert.equal(out.ok, true);
  const r = out.request;
  assert.equal(r.from, `"Sam at Harbor" <sam@getharbor.example>`);
  assert.deepEqual(r.to, ["owner@fixture-movers.example"]);
  assert.deepEqual(r.reply_to, ["r+abcdefghijklmnopqrstuvwx@mail.chanlytics.com"], "a reply lands in the Inbox");
  assert.equal(r.subject, "A quote for Fixture Movers");
  assert.equal(out.subject, r.subject);
  assert.equal(out.body, "Hi Fixture Movers,\n\nMovers in Austin ask us for this.", "the words, without the foot");
  assert.ok(r.text.startsWith(out.body));

  const [, token] =
    /^<https:\/\/app\.chanlytics\.com\/u\/([A-Za-z0-9_-]{87})>$/.exec(r.headers["List-Unsubscribe"]) ?? [];
  assert.ok(token, r.headers["List-Unsubscribe"]);
  assert.equal(r.headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
  assert.deepEqual(verifyUnsubscribeToken([SECRET], token), { tenantId: T, contactId: K, messageId: M });

  for (const line of [
    "I found your business on Google Maps.",
    "This is a marketing email.",
    "Harbor Moving Co · 100 Example St, Austin, TX 78701",
    `Unsubscribe: https://app.chanlytics.com/u/${token}`,
  ])
    assert.ok(r.text.includes(line), `the foot says: ${line}`);
  assert.match(r.html, new RegExp(`<a href="https://app\\.chanlytics\\.com/u/${token}">Unsubscribe</a>`));

  assert.equal(r.idempotency_key, M);
  assert.deepEqual(r.tags, [
    { name: "cl_message", value: M },
    { name: "cl_tenant", value: T },
  ]);
  assert.equal(r.headers["Auto-Submitted"], "auto-generated");
  assert.equal(r.headers["In-Reply-To"], undefined, "a first email answers nothing");
});

test("a step's email answers the one before (D19): Re: its subject, once, and its Message-ID in the thread's headers", () => {
  const out = reachOutRequest(
    input({
      words: { subject: "a heading a step never uses", body: "Following up, {{business}}." },
      parent: {
        messageId: "44444444-4444-4444-8444-444444444444",
        rfcMessageId: "<second@getharbor.example>",
        references: ["<first@getharbor.example>"],
        subject: "Re: A quote for Fixture Movers",
      },
    }),
  );
  assert.equal(out.ok, true);
  assert.equal(out.request.subject, "Re: A quote for Fixture Movers");
  assert.equal(out.request.headers["In-Reply-To"], "<second@getharbor.example>");
  assert.equal(out.request.headers.References, "<first@getharbor.example> <second@getharbor.example>");
  assert.ok(out.request.headers["List-Unsubscribe"], "a nudge carries the way to stop too");
  assert.ok(out.request.text.includes("This is a marketing email."));
});

test("a slot this lead has no value for is the lead's (missing_value); a slot no lead could fill, or no subject, is the step's", () => {
  assert.deepEqual(reachOutRequest(input({ lead: { business_name: "Fixture Movers", city: null } })), {
    ok: false,
    reason: "missing_value",
  });
  for (const words of [
    { subject: "Hi {{first name}}", body: "Hello." },
    { subject: "Hello", body: "Hi {{business_name}}" },
    { subject: "Hello", body: "Hi {{business" },
  ])
    assert.deepEqual(reachOutRequest(input({ words })), { ok: false, reason: "unknown_slot" }, JSON.stringify(words));
  // A step after the first never reads its own heading, so a slot there holds nothing.
  const parent = { messageId: "m0", rfcMessageId: "<first@getharbor.example>", references: [], subject: "Hi" };
  assert.equal(reachOutRequest(input({ parent, words: { subject: "{{first name}}", body: "Hello." } })).ok, true);
  assert.deepEqual(reachOutRequest(input({ words: { subject: null, body: "Hello." } })), {
    ok: false,
    reason: "no_subject",
  });
  assert.deepEqual(reachOutRequest(input({ words: { subject: "Re: your quote", body: "Hello." } })), {
    ok: false,
    reason: "words_unsendable",
  });
});

test("no business address, or no business name, on the profile: no_business_address, before anything is sealed", () => {
  for (const workspace of [
    { businessName: "Harbor Moving Co", address: null },
    { businessName: "Harbor Moving Co", address: "   " },
    { businessName: null, address: "100 Example St" },
  ])
    assert.deepEqual(reachOutRequest(input({ workspace, unsubscribe: { secret: "", origin: "https://x.example" } })), {
      ok: false,
      reason: "no_business_address",
    });
});

test("with a cold reply domain (D17) the replies come back there, to the mailbox's own route", () => {
  const out = reachOutRequest(input({ replyDomain: "reply.coldlinks.example" }));
  assert.deepEqual(out.request.reply_to, ["r+abcdefghijklmnopqrstuvwx@reply.coldlinks.example"]);
  const links = reachOutRequest(input({ unsubscribe: { secret: SECRET, origin: "https://links.coldmail.example" } }));
  assert.match(
    links.request.headers["List-Unsubscribe"],
    /^<https:\/\/links\.coldmail\.example\/u\/[A-Za-z0-9_-]{87}>$/,
  );
});
