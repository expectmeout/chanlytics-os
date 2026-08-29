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
import {
  replyDelayMs,
  REPLY_DELAY_DEFAULT_MS,
  REPLY_DELAY_MIN_MS,
  REPLY_DELAY_MAX_MS,
} from "@chanlytics/contracts";

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

const edge = read("apps/edge/api/whatsapp.ts");
const verbs = read("apps/dashboard/src/server/verbs.ts");
const reply = read("apps/dashboard/app/api/v1/conversations/[id]/reply/route.ts");
const takeOver = read("apps/dashboard/app/api/v1/conversations/[id]/take-over/route.ts");

test("'veto' reaches the brain instead of being held as a policy block", () => {
  // Before this, veto fell into the "hold everything for a human" branch — safe,
  // but it meant selecting veto silently disabled the receptionist.
  assert.match(edge, /replyMode !== "auto" && replyMode !== "veto"/);
});

test("a queued draft falls back to sending when it cannot be scheduled", () => {
  // An un-vetoed reply is a worse outcome than a vetoed one. No reply at all is
  // worse than both — so a missing token or a dead queue must not mean silence.
  assert.match(edge, /queueReply\(/);
  assert.match(edge, /delayMs > 0 \? await queueReply\([^)]*\) : false/s);
});

test("EVERY path where a human takes control withdraws the draft", () => {
  // Otherwise the customer receives both the override and the words it was
  // meant to replace.
  for (const [name, src] of [["reply", reply], ["take-over", takeOver]]) {
    assert.match(src, /cancelPendingAiReply\(/, `${name} must withdraw a held draft`);
  }
});

test("the job is canceled BEFORE the row is", () => {
  // Marking the row canceled while its job still runs is harmless —
  // outbound_send re-reads and no-ops on anything not still queued. Leaving the
  // job scheduled after the row is gone would be a send with nothing to stop it.
  const fn = verbs.slice(verbs.indexOf("export async function cancelPendingAiReply"));
  assert.ok(
    fn.indexOf("cancelJobs(") < fn.indexOf('.update({ status: "canceled"'),
    "cancel the job first, then the row",
  );
});

test("only the BOT's drafts are withdrawn, never a colleague's queued reply", () => {
  const fn = verbs.slice(verbs.indexOf("export async function cancelPendingAiReply"));
  assert.match(fn, /\.eq\("sender", "ai"\)/);
  assert.match(fn, /\.eq\("status", "queued"\)/);
});

test("a delayed bot reply is not recorded as a human's", () => {
  // The queue used to carry only human replies. Stamping every send 'human'
  // would make the metrics report the bot's words as a person's.
  const handlers = read("packages/jobs/src/handlers.ts");
  assert.match(handlers, /sender: msg\.sender \?\? "human"/);
});
