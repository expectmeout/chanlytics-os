/**
 * The unsubscribe link's token (packages/channels unsubscribe-token.ts), run: what it seals comes back exactly,
 * anything this secret did not make is refused without a throw, and the link it makes is one a campaign email can
 * carry, in the request's real shape.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  buildEmailRequest,
  hostedIdentity,
  signUnsubscribeToken,
  unsubscribeUrl,
  verifyUnsubscribeToken,
  UNSUBSCRIBE_PATH,
} from "@chanlytics/channels";

const SECRET = "a-secret-only-this-file-holds";
const CLAIMS = {
  tenantId: "22222222-2222-4222-8222-222222222222",
  contactId: "33333333-3333-4333-8333-333333333333",
  messageId: "11111111-1111-4111-8111-111111111111",
};

test("a token seals the workspace, the person and the email, in 87 url-safe characters, and gives them back", () => {
  const t = signUnsubscribeToken(SECRET, CLAIMS);
  assert.match(t, /^[A-Za-z0-9_-]{87}$/);
  assert.deepEqual(verifyUnsubscribeToken(SECRET, t), CLAIMS);
  // Upper-case ids are the same ids: the bytes are what is sealed.
  const upper = signUnsubscribeToken(SECRET, { ...CLAIMS, tenantId: CLAIMS.tenantId.toUpperCase() });
  assert.equal(upper, t);
});

test("anything this secret did not make is null, never a throw", () => {
  const t = signUnsubscribeToken(SECRET, CLAIMS);
  assert.equal(verifyUnsubscribeToken("another-secret", t), null, "another secret");
  assert.equal(verifyUnsubscribeToken("", t), null, "no secret");
  assert.equal(verifyUnsubscribeToken(undefined, t), null, "an unset secret");
  for (let i = 0; i < t.length; i++) {
    const c = t[i] === "A" ? "B" : "A";
    const bent = t.slice(0, i) + c + t.slice(i + 1);
    assert.equal(verifyUnsubscribeToken(SECRET, bent), null, `a character changed at ${i}`);
  }
  assert.equal(verifyUnsubscribeToken(SECRET, t.slice(0, -1)), null, "cut short");
  assert.equal(verifyUnsubscribeToken(SECRET, `${t}A`), null, "too long");
  const plain = Buffer.from(t, "base64url").toString("base64");
  assert.notEqual(plain, t);
  assert.equal(verifyUnsubscribeToken(SECRET, plain), null, "the same bytes in plain base64, padded");
  assert.equal(verifyUnsubscribeToken(SECRET, `${t.slice(0, 40)}+${t.slice(41)}`), null, "a plain-base64 character");
  assert.equal(verifyUnsubscribeToken(SECRET, ""), null, "empty");
  assert.equal(verifyUnsubscribeToken(SECRET, null), null, "not a string");

  // A token of another version, sealed properly under this very secret, is still not one this code reads.
  const raw = Buffer.from(t, "base64url");
  const payload = Buffer.from(raw.subarray(0, 49));
  payload[0] = 2;
  const mac = createHmac("sha256", SECRET).update("chanlytics-unsubscribe:").update(payload).digest().subarray(0, 16);
  assert.equal(verifyUnsubscribeToken(SECRET, Buffer.concat([payload, mac]).toString("base64url")), null, "version 2");
});

test("only uuids are sealed, and never without a secret", () => {
  assert.throws(() => signUnsubscribeToken("", CLAIMS), /no secret/);
  for (const k of ["tenantId", "contactId", "messageId"])
    assert.throws(() => signUnsubscribeToken(SECRET, { ...CLAIMS, [k]: "m1" }), /uuids/, k);
});

test("the link is one a campaign email carries: List-Unsubscribe and One-Click, and the footer's own words", () => {
  const url = unsubscribeUrl("https://app.chanlytics.com/", signUnsubscribeToken(SECRET, CLAIMS));
  assert.equal(UNSUBSCRIBE_PATH, "/u/");
  assert.match(url, /^https:\/\/app\.chanlytics\.com\/u\/[A-Za-z0-9_-]{87}$/);
  const request = buildEmailRequest({
    identity: hostedIdentity(
      { local_part: "bestmovers", reply_token: "abcdefghijklmnopqrstuvwx", from_name: "Best Movers" },
      "mail.chanlytics.com",
    ),
    to: "ana@example.com",
    parent: null,
    subject: "The calls you miss mid-session",
    body: "A 4.9 from 212 reviews says people find you.",
    signature: "Sam",
    actor: "ai",
    campaign: { unsubscribeUrl: url, footer: `Unsubscribe: ${url}` },
    messageId: CLAIMS.messageId,
    tenantId: CLAIMS.tenantId,
  });
  assert.equal(request.headers["List-Unsubscribe"], `<${url}>`);
  assert.equal(request.headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
  assert.ok(request.text.endsWith(`Unsubscribe: ${url}`));
});
