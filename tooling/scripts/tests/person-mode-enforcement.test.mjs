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
 * These pin the order of the WhatsApp handler (the lookup before the first
 * branch that can speak), the voice send's use of the person's mode, the
 * gate's reading of Veto, and the reason with its labels, end to end.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ESCALATION_REASONS, ESCALATION_REASON_LABELS, reasonShort } from "@chanlytics/contracts";
import { readCode, readRaw } from "./_source.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const { outboundGate } = await import(pathToFileURL(path.join(here, "../../../apps/edge/lib/outbound-gate.ts")).href);

const wa = readCode("apps/edge/lib/whatsapp/inbound.ts");
const steps = readCode("apps/edge/lib/whatsapp/steps.ts");
const fn = readCode("apps/edge/api/retell-fn.ts");

test("WhatsApp: the person's mode is looked up before the first branch that can speak", () => {
  const lookup = wa.indexOf("personMode = await personReplyMode(");
  const nonText = wa.indexOf('n.type !== "text" || !n.body');
  const ack = wa.indexOf("fallbacks.non_text");
  assert.ok(lookup > 0 && nonText > 0 && ack > 0, "all three landmarks exist");
  assert.ok(lookup < nonText, "REGRESSION: the lookup sat below the non-text branch, so a Never person who sent a photo got a canned text");
  assert.ok(lookup < ack);
  assert.equal(wa.split("personMode = await personReplyMode(").length, 2, "exactly one lookup");
});

test("WhatsApp: the non-text acknowledgement obeys the mode in force", () => {
  assert.ok(wa.includes('const mayAck = !!brainCfg && (replyMode === "auto" || replyMode === "veto");'));
  // The escalation and the alert still happen — a photo always needs a human.
  assert.ok(wa.includes('sink.escalate("non_text", `Customer sent a ${m.type} message — ${why}.`)'));
});

test("WhatsApp: a person's hold is its own reason, alerted once per open hold", () => {
  assert.ok(steps.includes('personHold ? "person_hold" : "policy_block"'));
  assert.ok(wa.includes('const alertNeeded = !hold.personHold || outcome !== "refreshed";'));
  // The workspace-level hold keeps its per-message alert: that behaviour is
  // unchanged here on purpose.
  assert.ok(steps.includes("const personHold = !!x.brainCfg && !!x.personMode;"));
});

test("voice: the booking-link send reads the person's mode, before the gate", () => {
  const lookup = fn.indexOf("personReplyMode(db, routed.tenantId, contact.contactId)");
  const gate = fn.indexOf("outboundGate({");
  assert.ok(lookup > 0 && gate > 0);
  assert.ok(lookup < gate, "the person's mode must be known before the gate decides");
  assert.ok(fn.includes("effectiveReplyMode({ drFallback: false, replyMode: workspaceMode }, personMode)"));
  assert.ok(!fn.includes('replyMode: rt.policy?.reply?.mode ?? "ask"'), "REGRESSION: the gate read the workspace mode alone");
});

test("the gate: Veto sends a caller's link, Never and Ask hold it", () => {
  const facts = { optedOut: false, pausedUntilMs: null, sentToday: 0, dailyCap: 3, nowMs: 1_800_000_000_000 };
  assert.equal(outboundGate({ ...facts, replyMode: "veto" }).allowed, true);
  assert.equal(outboundGate({ ...facts, replyMode: "auto" }).allowed, true);
  assert.equal(outboundGate({ ...facts, replyMode: "never" }).refusal, "policy_hold");
  assert.equal(outboundGate({ ...facts, replyMode: "ask" }).refusal, "policy_hold");
});

test("the reason exists everywhere a reason is read", () => {
  assert.ok(ESCALATION_REASONS.includes("person_hold"));
  assert.equal(ESCALATION_REASON_LABELS.person_hold, "You handle this person — the receptionist stays out");
  assert.equal(reasonShort("person_hold"), "held for you");
  // The workspace hold no longer masquerades as a pricing question either.
  assert.equal(ESCALATION_REASON_LABELS.policy_block, "Held by your reply setting — nothing was sent");
  assert.equal(reasonShort("policy_block"), "held by your reply setting");
  const sql = readRaw("supabase/migrations/00032_person_hold_reason.sql");
  assert.ok(sql.includes("'person_hold'"), "the CHECK admits it, or the insert fails with nobody told");
});

test("the escalation upsert reports how it landed", () => {
  const jobs = readCode("packages/jobs/src/handlers.ts");
  assert.ok(jobs.includes('export type EscalationOutcome = "opened" | "refreshed" | "failed";'));
  assert.ok(jobs.includes('return "refreshed";'));
});
