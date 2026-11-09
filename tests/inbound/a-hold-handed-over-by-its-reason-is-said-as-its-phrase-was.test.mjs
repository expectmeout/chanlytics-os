/**
 * The owner's handoff notice (apps/edge/lib/inbound/alerts.ts handoffMessage) reads a hold's reason as the Inbox does,
 * whether a gate hands it over as the reason itself (core handled.ts handToAPerson) or a branch with no hold names it
 * in a phrase: the same subject, the same body, and the action sentence of the reason's own act. The act was read
 * through the phrases alone, so a reason handed over as itself fell back to "reply" whatever it was.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { HOLD_ACT_WORDS, holdActOf } from "@chanlytics/contracts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const { handoffMessage } = await import(pathToFileURL(path.join(ROOT, "apps/edge/lib/inbound/alerts.ts")).href);

const told = (reason) =>
  handoffMessage({
    threadId: "13055550142",
    userText: "Are you open Sunday?",
    botText: "(no reply sent)",
    reason,
    channel: "whatsapp",
    who: "Rosa Diaz",
  });

test("a reason handed over as itself is said exactly as the phrase that names it", () => {
  for (const [phrase, reason] of [
    ["late message", "stale"],
    ["rate cap", "rate_cap"],
    ["budget", "budget"],
    ["state unavailable", "state_unavailable"],
    ["carriers", "carriers"],
    ["paused", "paused"],
    ["non-text message", "non_text"],
  ])
    assert.deepEqual(told(reason), told(phrase), `${reason} and "${phrase}" are one notice`);
});

test("a reason handed over as itself ends with its own act's sentence, not a reply's", () => {
  assert.equal(holdActOf("booking_request"), "confirm");
  const { body } = told("booking_request");
  assert.ok(body.endsWith(HOLD_ACT_WORDS.confirm.notice), body);
  assert.notEqual(HOLD_ACT_WORDS.confirm.notice, HOLD_ACT_WORDS.reply.notice);
  assert.ok(told("callback").body.endsWith(HOLD_ACT_WORDS.call_back.notice));
});
