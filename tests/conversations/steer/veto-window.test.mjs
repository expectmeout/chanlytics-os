/**
 * The veto window: the receptionist drafts, the business gets a moment to
 * redirect it, then it sends.
 *
 * A text channel is not a phone call. Nobody expects a WhatsApp answer in under
 * a second, so a short wait costs the customer nothing — and it turns the only
 * two settings a business had, "let the bot speak" or "turn the bot off", into
 * a third: let it draft, and change what it says before anyone reads it.
 * Correcting a message that has already landed is not a feature.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  noTemplateWords,
  replyDelayMs,
  REPLY_DELAY_DEFAULT_MS,
  REPLY_DELAY_MIN_MS,
  REPLY_DELAY_MAX_MS,
} from "@chanlytics/contracts";

/* ------------------------------- the rule -------------------------------- */

test("'auto' answers immediately — that is what it means", () => {
  assert.equal(replyDelayMs("auto", { reply_delay_ms: 30_000 }), 0);
});

test("only 'veto' holds a reply", () => {
  // ask/never don't reach a send at all; a delay on them would be meaningless.
  for (const mode of ["ask", "never", "", null, undefined, "nonsense"]) {
    assert.equal(replyDelayMs(mode, { reply_delay_ms: 30_000 }), 0, String(mode));
  }
});

test("'veto' with no configured delay still holds, at the default", () => {
  // Choosing veto IS the intent. Falling through to 0 would silently make it
  // behave exactly like auto, which is the one outcome nobody asked for.
  assert.equal(replyDelayMs("veto", {}), REPLY_DELAY_DEFAULT_MS);
  assert.equal(replyDelayMs("veto", null), REPLY_DELAY_DEFAULT_MS);
  assert.equal(replyDelayMs("veto", { reply_delay_ms: undefined }), REPLY_DELAY_DEFAULT_MS);
});

test("a configured delay is honoured", () => {
  assert.equal(replyDelayMs("veto", { reply_delay_ms: 15_000 }), 15_000);
  assert.equal(replyDelayMs("veto", { reply_delay_ms: 60_000 }), 60_000);
});

test("a typo cannot strand a customer", () => {
  // `limits` is tenant-editable JSON. One extra zero should cost seconds, never
  // leave someone waiting hours for an answer the bot already wrote.
  assert.equal(replyDelayMs("veto", { reply_delay_ms: 300_000_000 }), REPLY_DELAY_MAX_MS);
  assert.equal(replyDelayMs("veto", { reply_delay_ms: 1 }), REPLY_DELAY_MIN_MS);
  assert.equal(replyDelayMs("veto", { reply_delay_ms: -5000 }), REPLY_DELAY_MIN_MS);
});

test("garbage in the config falls back rather than producing NaN", () => {
  for (const bad of ["30s", null, NaN, Infinity, {}, []]) {
    const d = replyDelayMs("veto", { reply_delay_ms: bad });
    assert.ok(Number.isFinite(d) && d >= REPLY_DELAY_MIN_MS, `bad input ${String(bad)} -> ${d}`);
  }
});

/* ---------------------- the wiring the rule depends on -------------------- */

// The wiring the rule depends on, run in steer/a-held-draft-is-written-once-and-rewritten.test.mjs (pinned as
// reply-gates', dispatch's, persist.ts's, core reply's and the dashboard ports' text until 26 Nov 2026): 'veto' reaches
// the model and holds its words in the window, never a policy block; a draft that cannot be held is sent at once, and the
// window that did not happen is recorded on the ledger with its usual cause; a person taking the thread withdraws the
// held draft through the member's door (and the core reply verb asks its port, core-reply.test.mjs).

// How a held draft is withdrawn (the row and the job that would send it, in one transaction; by message, never by
// conversation; the receptionist's drafts alone, and only one no run has claimed) is one door's since 00387, and
// conversations/state/a-queued-message-is-withdrawn-by-one-door.db.test.mjs runs it on a real database. These held the
// four writers it replaced by their text.

// A veto draft and its job are written in one statement, so neither is ever left without the other (queue_send, 00527;
// jobs/a-send-is-queued-with-its-job.db.test.mjs runs it), by one writer for the handler and the steer: run in
// steer/a-held-draft-is-written-once-and-rewritten.test.mjs. A delayed bot reply is not recorded as a human's: the send
// door is handed the row's own sender (messages/core-send-path.test.mjs). Pinned as draft-queue.ts's and send.ts's text
// until 26 Nov 2026.

/* ---- the closed-window send uses the workspace's OWN approved template ---- */
{
  // The approved templates are actually fetched, and published with the Inbox's rows: the settings read is the one read
  // of them and the Inbox's picker is made of it (shell/hearing/templates-are-read-once.test.mjs), where the seam's text
  // was pinned here until 26 Nov 2026.
  // No hardcoded template name survives in the courier: booking_link_v1/en_US was right for exactly one workspace and a
  // guaranteed server rejection for every other, including every newly created one, which has no template row at all.
  // With none in hand the courier refuses in the browser and asks the server nothing: pressed in
  // inbox/inbox-verbs.test.mjs, where verbs.ts's text was read until 26 Nov 2026.
  test("with no approved template the composer says so instead of offering a send", () => {
    // The composer says it in contracts' words (noTemplateWords), the plain sentence where nothing is counted. The
    // template reply box draws it, and which of the messages were left out and why: inbox/inbox-words.test.mjs ("none
    // approved is still its own answer"), where template-box.tsx's text was read here until 26 Nov 2026.
    assert.match(noTemplateWords(null), /^No approved message yet/);
    // And the courier refuses rather than posting a request the server must reject with a message the operator cannot
    // act on: pressed in inbox/inbox-verbs.test.mjs.
  });

  // That a template read that fails degrades rather than blanking the Inbox is run, not read off the source:
  // inbox/inbox-counts.test.mjs, "the Inbox reads its approved templates once in a few minutes…".
}
