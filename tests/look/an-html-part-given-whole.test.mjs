/**
 * An email's HTML part given whole (channels email/request.ts `html`, decision 0075): a sender that drew its own letter
 * hands it in, the words part stays the words; a plain email carries none; a campaign's is the builder's alone.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildEmailRequest } from "@chanlytics/channels";

const first = (over = {}) =>
  buildEmailRequest({
    identity: { fromName: "Harbor Studio", fromAddress: "harbor@mail.example.com", replyTo: "r@mail.example.com" },
    to: "ana@example.com",
    parent: null,
    subject: "Confirm your sign-up with Harbor Studio",
    body: "You signed up.\n\nConfirm here:\nhttps://app.example.com/c/abc",
    signature: null,
    actor: "ai",
    messageId: "11111111-1111-4111-8111-111111111111",
    tenantId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    ...over,
  });

test("a drawn HTML part is sent as it was drawn, and the words part is the words", () => {
  const r = first({ html: "<!doctype html><html><body><p>drawn</p></body></html>" });
  assert.equal(r.html, "<!doctype html><html><body><p>drawn</p></body></html>");
  assert.match(r.text, /^You signed up\./);
  assert.equal(r.headers["Auto-Submitted"], "auto-generated");
  const twin = first();
  assert.match(twin.html, /^<p>You signed up\.<\/p>/, "without one, the twin of the words as before");
  assert.equal(first({ html: "   " }).html, twin.html, "blank is none");
});

test("a plain email carries no HTML, drawn or not; a campaign's HTML is the builder's", () => {
  assert.equal(first({ plain: true, html: "<p>drawn</p>" }).html, "");
  assert.throws(
    () =>
      first({
        html: "<p>drawn</p>",
        campaign: { unsubscribeUrl: "https://app.example.com/u/abc", footer: "Harbor Studio · 1 Main St" },
      }),
    /a campaign's HTML is the builder's/,
  );
});
