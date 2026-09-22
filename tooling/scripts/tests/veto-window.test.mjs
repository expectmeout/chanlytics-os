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
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readCode } from "./_source.mjs";
import { replyDelayMs, REPLY_DELAY_DEFAULT_MS, REPLY_DELAY_MIN_MS, REPLY_DELAY_MAX_MS } from "@chanlytics/contracts";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, "../../..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8").split("\r\n").join("\n");

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

const edge = read("packages/core/src/inbound/answer.ts");
const sink = read("apps/edge/lib/whatsapp/persist.ts");
const verbs = read("apps/dashboard/src/server/verbs.ts");
const reply = read("packages/core/src/conversations/reply.ts");
const takeOver = read("apps/dashboard/src/server/core-ports.ts");

test("'veto' reaches the brain instead of being held as a policy block", () => {
  // Before this, veto fell into the "hold everything for a human" branch — safe,
  // but it meant selecting veto silently disabled the receptionist.
  assert.match(edge, /replyMode !== "auto" && replyMode !== "veto"/);
});

test("a queued draft falls back to sending when it cannot be scheduled", () => {
  // An un-vetoed reply is a worse outcome than a vetoed one. No reply at all is
  // worse than both — so a missing token or a dead queue must not mean silence.
  assert.match(edge, /queueReply\(/);
  // Spans lines since the confidence dial: the same expression, more arguments.
  assert.match(edge, /delayMs > 0\s*\?\s*await ports\.persist\.queueReply\([\s\S]*?\)\s*:\s*false/);
});

test("EVERY path where a human takes control withdraws the draft", () => {
  // Otherwise the customer receives both the override and the words it was
  // meant to replace.
  for (const [name, src, withdraw] of [
    ["reply", reply, /ports\.withdrawDrafts\(/],
    ["the adapter", takeOver, /withdrawDrafts: \(tenantId, id\) =>\s*cancelPendingAiReply\(/],
  ]) {
    assert.match(src, withdraw, `${name} must withdraw a held draft`);
  }
});

test("the ROW is canceled before the job is", () => {
  // This pinned the opposite order, on a rationale that contradicted its own
  // first sentence: marking the row canceled while its job still runs IS
  // harmless, because outbound_send re-reads the row and no-ops on anything
  // that is not still queued — so "a send with nothing left to stop it" cannot
  // happen. The real asymmetry runs the other way. Cancel the job first and
  // then fail to update the row, and the row sits `queued` forever with
  // nothing that will ever send it: the Inbox says "Sending…", the customer
  // receives nothing, and no alert fires. Row first makes the worst case a
  // redundant job that finds nothing to do.
  const fn = verbs.slice(verbs.indexOf("export async function cancelPendingAiReply"));
  assert.ok(
    fn.indexOf('.update({ status: "canceled"') < fn.indexOf("cancelJobs("),
    "cancel the row first, then its job",
  );
});

test("drafts are withdrawn BY MESSAGE, never by conversation", () => {
  // Cancelling every outbound_send on the conversation also withdrew the job
  // behind a HUMAN reply still inside its 15-second grace window, while the
  // row update only touched sender='ai' rows. Two quick replies, or a reply
  // followed by Take over, therefore stranded the operator's first message:
  // job gone, row still queued, nothing to send it. Withdrawing the
  // receptionist's draft must not touch a colleague's words.
  const fn = verbs.slice(verbs.indexOf("export async function cancelPendingAiReply"));
  assert.match(fn, /cancelJobs\([^)]*"message_id"/s, "cancel jobs keyed on the message, not the thread");
  assert.ok(
    !/cancelJobs\([^)]*"conversation_id"/s.test(fn),
    "cancelling by conversation_id also withdraws a human reply's job",
  );
});

test("only the BOT's drafts are withdrawn, never a colleague's queued reply", () => {
  const fn = verbs.slice(verbs.indexOf("export async function cancelPendingAiReply"));
  assert.match(fn, /\.eq\("sender", "ai"\)/);
  assert.match(fn, /\.eq\("status", "queued"\)/);
});

test("a veto draft that could not be scheduled is retired, not left pending", () => {
  // The row is written before the job is published. A scheduling failure used
  // to leave it `queued` while the caller sent the same words immediately: the
  // Inbox showed a held draft with Edit and Hold controls for a reply the
  // customer already had, and a publish that in fact succeeded before timing
  // out would later fire and send it twice.
  // The writer moved to lib/draft-queue.ts (one writer for the handler and
  // the steer); the handler's queueReply is a thin wrapper over it.
  const queue = readCode("apps/edge/lib/receptionist/draft-queue.ts");
  const fn = queue.slice(queue.indexOf("export async function queueDraft"));
  const body = fn.slice(0, fn.indexOf("\n}\n", 1) + 3);
  // The rollback lives in the catch, so slice from there rather than measuring
  // a character distance a future comment would break.
  const rollback = body.slice(body.indexOf("} catch"));
  assert.ok(rollback.includes('status: "canceled"'), "a draft that could not be scheduled must be canceled");
  assert.ok(rollback.includes("scheduling_failed"), "and the row must say why");
  assert.ok(rollback.includes('.eq("status", "queued")'), "only retire a row that has not already been sent");
});

test("a delayed bot reply is not recorded as a human's", () => {
  // The queue used to carry only human replies. Stamping every send 'human'
  // would make the metrics report the bot's words as a person's.
  const handlers = read("packages/core/src/messages/send.ts");
  assert.match(
    handlers,
    /sender: \(msg\.sender \?\? "human"\)/,
    "the door is handed the row's sender, never a constant",
  );
});

test("a configured veto window that did not happen is RECORDED, not just logged", () => {
  // The fallback is deliberate — an un-vetoed reply beats no reply — but the
  // workspace asked to see its receptionist's words before the customer did,
  // and instead the customer got them first. A log line nobody reads is how a
  // setting quietly becomes a lie.
  assert.match(edge, /if \(delayMs > 0 && !queued\) \{[\s\S]{0,400}?sink\.vetoFallback\(/);
  assert.match(sink, /policy\.veto_window_skipped/);
});

test("the event names the usual cause rather than making someone guess", () => {
  assert.match(sink, /scheduling_failed/);
});

/* ---- the closed-window send uses the workspace's OWN approved template ---- */
{
  const seam = read("apps/dashboard/src/legacy-bridge/surface-data.ts");
  // readCode, not read: the forbidden-name assertion below is otherwise
  // satisfied by the COMMENT explaining why that name is forbidden, so the
  // only way to make the guard pass would be to delete the rationale. Same
  // trap auth-gate.test.mjs documents.
  const verbs2 = readCode("apps/dashboard/src/legacy-bridge/inbox-verbs.ts");
  const thread = read("apps/dashboard/src/legacy/pages/inbox-thread.jsx");

  test("the approved templates are actually fetched", () => {
    // /api/v1/templates existed, was tenant-scoped and approved-only, and had
    // no caller anywhere. The composer named a template by a literal instead.
    assert.ok(seam.includes('read("GET templates")'), "the workspace's approved templates are fetched");
    assert.match(seam, /__TEMPLATES/);
  });

  test("no hardcoded template name survives in the courier", () => {
    // booking_link_v1/en_US is right for exactly one workspace and a
    // guaranteed server rejection for every other — including every newly
    // created one, which has no template row at all.
    assert.ok(!/booking_link_v1/.test(verbs2), "the fallback template name must be gone");
    assert.ok(!/FALLBACK_TEMPLATE/.test(verbs2));
  });

  test("with no approved template the composer says so instead of offering a send", () => {
    assert.match(thread, /No approved template yet/);
    // And the courier refuses rather than posting a request the server must
    // reject with a message the operator cannot act on.
    assert.match(verbs2, /has no approved template yet/);
  });

  test("a template read that fails degrades, it does not blank the Inbox", () => {
    const at = seam.indexOf('read("GET templates")');
    const around = seam.slice(at - 200, at + 400);
    assert.match(around, /catch/, "the templates fetch is additive, like calls");
  });
}
