/**
 * Refusals in our words.
 *
 * The typed client had one branch for every refusal but the 401: the server's
 * sentence went on screen as it came, "Request failed (502)." whenever the
 * answer was not an envelope, and the envelope's details -- the rate limiter's
 * retry_after_s, a form's fields -- were dropped on the way. A timeout was told
 * "nothing was changed" of a write the server may still be making. The 12
 * September audit's A5. Decided once in contracts (refusalOf), so the client,
 * the Ask stream and a courier's own refusal say the same thing.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ERROR_CODES, refusalOf } from "@chanlytics/contracts";

test("a refusal keeps the server's sentence and gains a title that says what kind of no it is", () => {
  assert.deepEqual(
    refusalOf({
      code: "forbidden",
      status: 403,
      message: "Only an owner can do this.",
      details: { needs: "owner" },
      write: true,
    }),
    {
      code: "forbidden",
      status: 403,
      title: "Owner only",
      message: "Only an owner can do this.",
      retryAfterS: null,
      fields: null,
    },
  );
  assert.equal(
    refusalOf({
      code: "forbidden",
      status: 403,
      message: "Viewers can see everything and change nothing.",
      details: { needs: "operator" },
      write: true,
    }).title,
    "Not for viewers",
  );
  assert.equal(
    refusalOf({ code: "forbidden", status: 403, message: "This request did not come from the app.", write: true })
      .title,
    "Not allowed",
  );
  assert.equal(
    refusalOf({ code: "conflict", status: 409, message: "That card was already approved.", write: true }).title,
    "Not possible right now",
  );
  assert.equal(
    refusalOf({ code: "window_closed", status: 409, message: "The 24 hours have passed.", write: true }).title,
    "WhatsApp's 24 hours have passed",
  );
  assert.equal(
    refusalOf({ code: "payment_required", status: 402, message: "Add a card first.", write: true }).title,
    "Needs a subscription",
  );
  assert.equal(
    refusalOf({ code: "not_found", status: 404, message: "No such page.", write: false }).title,
    "Not found",
  );
  assert.equal(
    refusalOf({ code: "upstream_meta", status: 502, message: "WhatsApp refused the template.", write: true }).title,
    "WhatsApp didn't accept it",
  );
  assert.equal(
    refusalOf({ code: "brand_new_code", status: 418, message: "Short and stout.", write: true }).title,
    "Not done",
    "a code this build does not know still reads as a refusal",
  );
  assert.equal(
    refusalOf({ code: "brand_new_code", status: 418, message: "Short and stout.", write: true }).message,
    "Short and stout.",
  );
});

test("every code the server can send has a title and a sentence of ours when the server gave none", () => {
  for (const code of ERROR_CODES) {
    for (const write of [true, false]) {
      const r = refusalOf({ code, status: 400, message: "", write });
      assert.ok(r.title && r.title.trim(), `${code}: a title`);
      assert.ok(r.message && r.message.trim(), `${code}: a sentence`);
      assert.ok(!/Request failed|undefined|null/.test(r.message), `${code}: ${r.message}`);
    }
  }
});

test("a rate limit says when to try again, from the details the server sends or else the Retry-After header", () => {
  const r = refusalOf({
    code: "rate_limited",
    status: 429,
    message: "Too many replies in a short time — try again in 40 seconds.",
    details: { retry_after_s: 40 },
    write: true,
  });
  assert.equal(r.title, "Too many at once");
  assert.equal(r.message, "Too many replies in a short time — try again in 40 seconds.");
  assert.equal(r.retryAfterS, 40);
  assert.equal(
    refusalOf({ code: "rate_limited", status: 429, message: "x", retryAfter: "90", write: true }).retryAfterS,
    90,
    "the header, when the details do not say",
  );
  assert.equal(
    refusalOf({
      code: "rate_limited",
      status: 429,
      message: "x",
      details: { retry_after_s: 12.2 },
      retryAfter: "90",
      write: true,
    }).retryAfterS,
    13,
    "the details first, rounded up",
  );
  const now = Date.parse("2026-09-14T18:00:00Z");
  assert.equal(
    refusalOf({
      code: "rate_limited",
      status: 429,
      message: "x",
      retryAfter: "Mon, 14 Sep 2026 18:02:00 GMT",
      nowMs: now,
      write: true,
    }).retryAfterS,
    120,
    "an HTTP date",
  );
  assert.equal(
    refusalOf({ code: "rate_limited", status: 429, message: "x", retryAfter: "soon", write: true }).retryAfterS,
    null,
    "a header that says nothing usable",
  );
  assert.equal(
    refusalOf({ code: "rate_limited", status: 429, message: "", details: { retry_after_s: 125 }, write: true }).message,
    "Too many at once — try again in 3 minutes.",
    "no sentence from the server: ours, with the wait",
  );
  assert.equal(
    refusalOf({ code: "rate_limited", status: 429, message: "", details: { retry_after_s: 1 }, write: true }).message,
    "Too many at once — try again in 1 second.",
  );
});

test("a form's refusal carries its fields, one sentence each, and nothing that is not a sentence", () => {
  const r = refusalOf({
    code: "validation",
    status: 400,
    message: "until: must be a time note: too long",
    details: { fields: { until: "must be a time", note: "too long", junk: 5, "": "a field with no name" } },
    write: true,
  });
  assert.equal(r.title, "Check the details");
  assert.deepEqual(r.fields, { until: "must be a time", note: "too long" });
  assert.equal(
    refusalOf({ code: "validation", status: 400, message: "Expected a JSON body.", write: true }).fields,
    null,
  );
  assert.equal(
    refusalOf({ code: "validation", status: 400, message: "x", details: { fields: {} }, write: true }).fields,
    null,
    "no field named is no field map",
  );
  assert.equal(
    refusalOf({ code: "validation", status: 400, message: "x", details: { fields: "until" }, write: true }).fields,
    null,
  );
});

test("an answer that was not an envelope says what the owner can do: a write may have gone through, a read changed nothing", () => {
  const w = refusalOf({ status: 502, write: true });
  assert.deepEqual([w.code, w.status, w.title], ["internal", 502, "No answer"]);
  assert.equal(
    w.message,
    "Chanlytics didn't answer properly, so this may or may not have gone through — check before trying again.",
  );
  assert.ok(!/[0-9]{3}/.test(w.message), "REGRESSION: 'Request failed (502).' put a status code on screen");
  assert.equal(
    refusalOf({ status: 504, write: false }).message,
    "Chanlytics couldn't read this just now — try again in a moment.",
  );
  const stale = refusalOf({ status: 404, write: false });
  assert.deepEqual(
    [stale.title, stale.message],
    ["Out of date", "This page is out of date — reload it and try again."],
    "a route this page no longer has: a deploy since it loaded",
  );
  assert.equal(refusalOf({ status: 405, write: true }).message, "This page is out of date — reload it and try again.");
  assert.deepEqual(
    [refusalOf({ status: 413, write: true }).title, refusalOf({ status: 413, write: true }).message],
    ["Too large", "That was too large to send."],
  );
});

test("the server's catch-all becomes a sentence an owner can act on; a specific sentence stays as the server wrote it", () => {
  const w = refusalOf({ code: "internal", status: 500, message: "Something went wrong.", write: true });
  assert.equal(w.title, "Something went wrong");
  assert.equal(
    w.message,
    "Chanlytics hit a problem and couldn't confirm this — check whether it went through before trying again.",
  );
  assert.equal(
    refusalOf({ code: "internal", status: 500, message: "Something went wrong.", write: false }).message,
    "Chanlytics couldn't read this just now — try again in a moment.",
  );
  const specific =
    "The shared count could not be read just now (the shared store did not answer) — try again in a moment.";
  assert.equal(refusalOf({ code: "internal", status: 503, message: specific, write: true }).message, specific);
});

test("no answer at all: offline changed nothing, a timeout may still go through, and a courier's own refusal keeps its words", () => {
  assert.deepEqual(refusalOf({ code: "network", status: 0, write: true }), {
    code: "network",
    status: 0,
    title: "No connection",
    message: "Network error — nothing was changed.",
    retryAfterS: null,
    fields: null,
  });
  assert.equal(refusalOf({ code: "network", status: 0, write: false }).message, "Chanlytics could not be reached.");
  const slow = refusalOf({ code: "timeout", status: 0, write: true });
  assert.equal(slow.title, "No answer in time");
  assert.equal(
    slow.message,
    "Chanlytics took too long to answer — this may still go through, so check before trying again.",
    "REGRESSION: a timeout said 'nothing was changed' of a write still being made",
  );
  assert.equal(
    refusalOf({ code: "timeout", status: 0, write: false }).message,
    "Chanlytics took too long to answer — try again in a moment.",
  );
  assert.deepEqual(
    refusalOf({ code: "client", status: 0, message: "No open escalation on this thread.", write: true }),
    {
      code: "client",
      status: 0,
      title: "Not sent",
      message: "No open escalation on this thread.",
      retryAfterS: null,
      fields: null,
    },
  );
  assert.equal(
    refusalOf({ code: "unauthorized", status: 401, message: "Sign in required.", write: false }).message,
    "Signed out.",
  );
  assert.equal(
    refusalOf({
      code: "choose_workspace",
      status: 400,
      message: "This account belongs to more than one workspace — say which one first.",
      write: false,
    }).title,
    "Choose a workspace",
  );
});
