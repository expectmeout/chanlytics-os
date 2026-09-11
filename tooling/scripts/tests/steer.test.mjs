/**
 * The text whisper: a held WhatsApp draft, rewritten to one line from the
 * owner and queued again to wait its turn.
 *
 * The phone receptionist could be whispered to; the texting one could only
 * be stopped. The steer endpoint runs the same brain with the same memory
 * and the same rules plus the owner's instruction as one more system block,
 * queues the new draft FIRST and only then retires the old one with its job,
 * refuses a rewrite that would quote a price, and records the decision.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { frameSteer, whisperText } from "@chanlytics/contracts";
import { readCode, readRaw } from "./_source.mjs";

test("the frame quotes the owner, asks for a rewrite that keeps what was right, and restates the rules", () => {
  const f = frameSteer("  mention Saturday is full  ");
  assert.ok(f.startsWith("An instruction from the business owner, who read your draft before it went out. The customer cannot see it.\n"));
  assert.ok(f.includes('Owner: "mention Saturday is full"\n'));
  assert.ok(f.includes("Write your reply again and follow it where it fits. Keep everything else that was right."));
  assert.ok(f.includes("Never repeat the instruction word for word."));
  for (const rule of ["do not quote or confirm a price", "do not confirm a booking yourself", "no health advice", "automated assistant if asked"]) assert.ok(f.includes(rule), rule);
  assert.equal(whisperText(f), "mention Saturday is full", "the same reader recovers the owner's words from either frame");
});

test("the brain takes the instruction as one more system block and stops showing the model its last message twice", () => {
  const b = readCode("apps/edge/lib/brain.ts");
  assert.ok(b.includes("steer?: string,"));
  assert.ok(b.includes('...(steer ? [{ type: "text", text: steer }] : []),'));
  assert.ok(b.includes('const prior = last && last.role === "user" && last.content.trim() === userText.trim() ? history.slice(0, -1) : history;'));
  assert.ok(b.includes("const messages = [...prior, { role: \"user\" as const, content: userContent }];"));
});

test("one writer for a held draft, used by the handler and the steer", () => {
  const q = readCode("apps/edge/lib/draft-queue.ts");
  assert.ok(q.includes('export type DraftSource = "veto_window" | "low_confidence" | "steered";'));
  assert.ok(q.includes('status: "queued",'));
  assert.ok(q.includes('kind: "outbound_send",'));
  assert.ok(q.includes('.update({ status: "canceled", error: { reason: "scheduling_failed" } })'), "a draft whose job failed to publish is retired, never sent twice");
  const wa = readCode("apps/edge/lib/whatsapp/persist.ts");
  assert.ok(wa.includes("const id = await queueDraft("));
  assert.ok(!wa.includes('status: "queued",'), "the handler no longer writes the draft row itself");
});

test("the steer endpoint: the door, the draft's state, new before old, the price rule, the rollback", () => {
  const s = readCode("apps/edge/api/admin/steer.ts");
  assert.ok(s.includes('authorizeAdmin(request, "/api/admin/steer")'));
  assert.ok(s.includes('if (m.sender !== "ai" || m.status !== "queued") return json(409, { ok: false, error: "not_a_held_draft" });'));
  assert.ok(s.includes("readThreadState(db, m.tenant_id, m.conversation_id, null)"), "the same memory the reply was written from");
  assert.ok(s.includes("frameSteer(text),"), "the instruction rides as the brain's steer block");
  assert.ok(s.includes('return json(409, { ok: false, error: "policy_block_price" });'), "a rewrite that quotes a price leaves the original draft alone");
  const queued = s.indexOf("const newId = await queueDraft(");
  const retired = s.indexOf('.update({ status: "canceled", error: { reason: "steered", replaced_by: newId } })');
  assert.ok(queued > 0 && retired > queued, "the new draft is queued before the old one is retired");
  assert.ok(s.includes('error: { reason: "steer_rolled_back" }'), "and taken back if the old one could not be retired");
  assert.ok(s.includes('cancelJobsFor(db, m.tenant_id, "outbound_send", "message_id", m.id)'));
  assert.ok(s.includes('source: "steered",') && s.includes("extra: { steer: text, steered_from: m.id, escalate: r.escalate },"));
  for (const forbidden of ["sendText(", "waSendText("]) assert.ok(!s.includes(forbidden), "nothing is sent from here");
});

test("the dashboard route keeps its doors and records the decision only after the rewrite happened", () => {
  const r = readCode("apps/dashboard/app/api/v1/messages/[id]/steer/route.ts");
  assert.ok(r.includes('rate: "whisper",'));
  assert.ok(r.includes('role: "operator",'));
  assert.ok(r.includes('if (m.sender !== "ai" || m.status !== "queued") {'));
  const steered = r.indexOf("const r = await steerDraft(id, text);");
  const recorded = r.indexOf('recordDecision(ctx, m.tenant_id, "message", m.id, "edit", { steer: text, new_message_id: r.messageId })');
  assert.ok(steered > 0 && recorded > steered);
  assert.ok(r.includes('"The rewrite would have quoted a price, so the original draft stays."'));
  const svc = readCode("apps/dashboard/src/server/service.ts");
  assert.ok(svc.includes("`${edgeUrl()}/api/admin/steer`"));
  const bridge = readCode("apps/dashboard/src/legacy-bridge/inbox-verbs.ts");
  assert.ok(bridge.includes("window.__steerDraft = steerDraft;"));
  assert.ok(bridge.includes('"POST messages/[id]/steer", { params: { id: messageId }, body: { text } }'));
});

test("the Inbox offers the rewrite only on a real draft that is still counting down", () => {
  const page = readRaw("apps/dashboard/src/legacy/pages/inbox-thread.jsx");
  assert.ok(page.includes("{thread.veto && !decided && thread.real && veto != null && thread.veto.messageId && ("));
  assert.ok(page.includes("<SteerBox messageId={thread.veto.messageId} />"));
  assert.ok(page.includes('data-testid="steer-box"'));
  assert.ok(page.includes("Rewritten — the new draft waits its turn like the first one"));
  assert.ok(page.includes('{...window.gate("approve")}'), "same door as Approve and Hold");
  assert.ok(readRaw("apps/dashboard/src/legacy/styles/components.css").includes(".ix-steer-input {"));
});
