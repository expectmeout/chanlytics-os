/**
 * Real provider payloads, run through the parsers that read them.
 *
 * Every other email test states a shape and then proves the code handles that
 * shape -- which proves the code agrees with ME, not with Resend. These are
 * payloads Resend actually sent, captured from the live webhook (E0, the
 * provider proof in docs/plans/2026-09-17-email-channel.md), committed
 * verbatim apart from the scrubbing each file names. When Resend changes a
 * shape, this is the test that fails.
 *
 * What they already settled, against assumptions that were only documentation
 * before:
 *
 *   tags round-trip INVERTED. They are SENT as a list of {name, value} and come
 *   back as a MAP. Reading only the shape we send would have found no row on
 *   every receipt, and every bounce and complaint would have been dropped as
 *   "not a workspace's email" with nobody told.
 *
 *   `tags` is ABSENT, not empty, on mail that carried none -- which is every
 *   transactional email the platform already sends. Those receipts must be
 *   dropped quietly, and they are.
 *
 *   `message_id` is the RFC id the provider minted, in angle brackets.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { emailReceiptFrom, emailReceiptEffect } from "@chanlytics/channels";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.join(HERE, "../fixtures/email");
const load = (name) => JSON.parse(fs.readFileSync(path.join(DIR, name), "utf8"));

const M = "11111111-1111-4111-8111-111111111111";
const T = "22222222-2222-4222-8222-222222222222";
const SENT_ID = "01a0b061-e5e7-72da-98e6-a6c63906a054";
const RFC = "<010001a0b061e76b-5e784f21-72c8-48a3-aa0b-8bfed22406df-000000@email.amazonses.com>";

test("a real email.sent names its row by the tags it left with, and carries the id the send returned and the Message-ID the provider minted", () => {
  const r = emailReceiptFrom(load("receipt-sent.json"));
  assert.deepEqual(r, {
    type: "sent",
    providerId: SENT_ID,
    rfcMessageId: RFC,
    to: ["e0-test@mail.chanlytics.com"],
    messageId: M,
    tenantId: T,
    detail: { kind: null, subKind: null, message: null },
  });
  // REGRESSION guard: the request sends tags as a LIST of {name, value}; Resend
  // answers with a MAP. Reading back only the shape we send finds no row here.
  assert.equal(load("receipt-sent.json").data.tags.cl_message, M, "a map on the way back");
  // `sent` is the send's own word to say: deliver.ts finalizes the queued row,
  // and reads a row it did not change as a cancel that won.
  assert.deepEqual(emailReceiptEffect(r), { status: null, error: null, suppress: null });
});

test("a real email.delivered moves the row, and the provider's id is the one the send returned", () => {
  const r = emailReceiptFrom(load("receipt-delivered.json"));
  assert.deepEqual([r.type, r.providerId, r.messageId, r.tenantId], ["delivered", SENT_ID, M, T]);
  assert.equal(r.rfcMessageId, RFC, "the same Message-ID as its sent receipt: one email, two receipts");
  assert.deepEqual(emailReceiptEffect(r), { status: "delivered", error: null, suppress: null });
});

test("a receipt for mail that carried no tags names no row and changes nothing: every transactional email the platform already sends arrives this way", () => {
  const raw = load("receipt-untagged.json");
  assert.equal("tags" in raw.data, false, "absent, not an empty object");
  const r = emailReceiptFrom(raw);
  assert.deepEqual([r.messageId, r.tenantId], [null, null]);
  assert.equal(r.providerId.length > 0, true, "it is still a readable receipt, it just belongs to nobody here");
});

test("every committed fixture is one the parser reads, and none of them carries a person", () => {
  const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".json"));
  assert.ok(files.length >= 3, "the fixtures are committed, not fetched at test time");
  for (const f of files) {
    const raw = load(f);
    assert.ok(emailReceiptFrom(raw) ?? raw.type === "email.received", `${f} is a payload the code reads`);
    // A fixture lives in the repo for good. Anything that named a real customer
    // would outlive their erasure, which is the one thing the product promises not to do.
    const text = fs.readFileSync(path.join(DIR, f), "utf8");
    for (const domain of text.match(/@[a-z0-9.-]+/gi) ?? []) {
      assert.match(
        domain,
        /@(example\.com|chanlytics\.com|mail\.chanlytics\.com|email\.amazonses\.com)$/,
        `${f}: ${domain} is not a platform or placeholder address`,
      );
    }
  }
});
