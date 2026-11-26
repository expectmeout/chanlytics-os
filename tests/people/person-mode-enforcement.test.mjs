/**
 * "Never" has to mean never, on every path that can speak.
 *
 * The per-person receptionist mode (00029) was honoured by exactly one path:
 * the WhatsApp text reply. Two others spoke for a person set to Never — the
 * canned "I can't read attachments" acknowledgement went out before the mode
 * was looked up, and the booking link a caller asked for on the phone was
 * gated on the workspace mode only. And the hold itself was filed under the
 * workspace's reason, so the Inbox called every message from such a person a
 * "pricing question" and emailed the owner once per message.
 *
 * These pin the gate's reading of Veto, and the reason with its labels, end to
 * end. The order of the WhatsApp handler (the lookup before the first branch
 * that can speak) is run in inbound/phases/, and the voice
 * send's use of the person's mode in retell-fn-door.test.mjs.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ESCALATION_REASONS, ESCALATION_REASON_LABELS, reasonShort } from "@chanlytics/contracts";
import { fakeDb } from "../_fake-db.mjs";
import { FROM_ITS_EVENT, text, world } from "../inbound/_world.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const { outboundGate } = await import(
  pathToFileURL(path.join(here, "../../packages/core/src/messages/outbound-gate.ts")).href
);

/** A text from a person set to `mode`, in a workspace on auto whose model would answer: the handler's world after it. */
async function fromAPerson(mode, over = {}) {
  const w = world({ env: { modelKey: "sk-test" }, ...over });
  await w.run(text("Can I book Friday at 3?"), {
    leads: { read: async () => ({ name: null }), personReplyMode: async () => mode },
    brain: async () => ({
      generateReply: async () => ({
        text: "Friday at 3 works.",
        escalate: false,
        meta: { confidence: 0.95 },
        usage: { input_tokens: 9 },
      }),
    }),
  });
  return w;
}

// WhatsApp: the person's mode is looked up once, before the first branch that can speak. It sat below the non-text
// branch, so a Never person who sent a photo got a canned text: RUN in inbound/phases/ ("a person
// set to Never who sends a voice note hears nothing back").

// WhatsApp: the non-text acknowledgement obeys the mode in force, by the one rule (reply-posture.ts speaksUnattended, its
// truth table run in reply-posture.test.mjs), and the escalation still happens, since a photo always needs a person: run
// in inbound/phases/the-reply-gates-hold-what-may-not-be-answered.test.mjs ("a person set to Never who sends a voice
// note hears nothing back"; "an acknowledgement that did not send"). Pinned as unreadable.ts's text until 26 Nov 2026.

test("WhatsApp: a person's hold is its own reason, never the workspace's, and told once: from its event, or by the handler where it could not be written", async () => {
  // Pinned as steps.ts's and reply-gates.ts's text until 26 Nov 2026. The workspace's own hold is policy_block: run in
  // inbound/phases/the-reply-gates-hold-what-may-not-be-answered.test.mjs.
  for (const mode of ["never", "ask"]) {
    const w = await fromAPerson(mode);
    assert.deepEqual(
      w.seen.escalations.map((e) => e.reason),
      ["person_hold"],
      `${mode}: the person's own reason`,
    );
    assert.equal(w.seen.sent.length, 0, `${mode}: nothing is said for them`);
    assert.deepEqual(w.seen.alerts, [], `${mode}: ${FROM_ITS_EVENT}`);
  }
  const unwritten = await fromAPerson("never", { escalateAnswer: "failed" });
  assert.deepEqual(
    [unwritten.seen.refused.map((e) => e.reason), unwritten.seen.alerts.map((a) => a.reason)],
    [["person_hold"], ["this person is set to Stays quiet"]],
    "a hold the database refused is told by the handler, once, in the person's words",
  );
  const auto = await fromAPerson("auto");
  assert.deepEqual([auto.seen.escalations.length, auto.seen.sent.length], [0, 1], "a person on auto is answered");
});

test("the gate: Veto sends a caller's link, Never and AI hold it", () => {
  const facts = {
    contact: { consent: "unknown", dnc: false, marketing_consent: "unknown" },
    purpose: "conversational",
    proactive: false,
    pausedUntilMs: null,
    sentToday: 0,
    dailyCap: 3,
    nowMs: 1_800_000_000_000,
  };
  assert.equal(outboundGate({ ...facts, replyMode: "veto" }).allowed, true);
  assert.equal(outboundGate({ ...facts, replyMode: "auto" }).allowed, true);
  assert.equal(outboundGate({ ...facts, replyMode: "never" }).refusal, "policy_hold");
  assert.equal(outboundGate({ ...facts, replyMode: "ask" }).refusal, "policy_hold");
});

test("the reason exists everywhere a reason is read", async () => {
  assert.ok(ESCALATION_REASONS.includes("person_hold"));
  assert.equal(ESCALATION_REASON_LABELS.person_hold, "You answer this person · AI stays out");
  assert.equal(reasonShort("person_hold"), "you answer this person");
  // The workspace hold no longer masquerades as a pricing question either.
  assert.equal(ESCALATION_REASON_LABELS.policy_block, "Your reply setting keeps it for you · nothing was sent");
  assert.equal(reasonShort("policy_block"), "your reply setting keeps it for you");
  // The CHECK admits it, or the insert fails with nobody told: an escalation written with it into the database in memory,
  // which refuses what the CHECK refuses (pinned as 00032's text until 26 Nov 2026).
  const db = fakeDb({ escalations: [] });
  const put = (reason) =>
    db
      .from("escalations")
      .insert({ tenant_id: "t1", conversation_id: "c0c0c0c0-c0c0-4c0c-8c0c-c0c0c0c0c0c0", reason })
      .select("id")
      .single();
  assert.equal((await put("person_hold")).error, null, "the CHECK admits it");
  assert.equal((await put("person_holds")).error?.code, "23514");
});

// How the upsert reports what it did is proved against Postgres now, in
// escalation-outcome.db.test.mjs: one open row per thread is a UNIQUE INDEX,
// and what it does under a second insert is the whole mechanism. Reading the
// type's own text back to itself proved only that somebody had typed it.
