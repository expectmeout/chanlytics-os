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
import { readCode, readRaw } from "../_source.mjs";

test("the frame quotes the owner, asks for a rewrite that keeps what was right, and restates the rules", () => {
  const f = frameSteer("  mention Saturday is full  ");
  assert.ok(
    f.startsWith(
      "An instruction from the business owner, who read your draft before it went out. The customer cannot see it.\n",
    ),
  );
  assert.ok(f.includes('Owner: "mention Saturday is full"\n'));
  assert.ok(f.includes("Write your reply again and follow it where it fits. Keep everything else that was right."));
  assert.ok(f.includes("Never repeat the instruction word for word."));
  for (const rule of [
    "do not quote or confirm a price",
    "do not confirm a booking yourself",
    "no health advice",
    "automated assistant if asked",
  ])
    assert.ok(f.includes(rule), rule);
  assert.equal(
    whisperText(f),
    "mention Saturday is full",
    "the same reader recovers the owner's words from either frame",
  );
});

test("the brain takes the instruction as one more system block and stops showing the model its last message twice", () => {
  const b = readCode("apps/edge/lib/receptionist/brain.ts");
  assert.ok(b.includes("steer?: string,"));
  assert.ok(b.includes('...(steer ? [{ type: "text", text: steer }] : []),'));
  assert.ok(
    /const prior =\s*last && last\.role === "user" && last\.content\.trim\(\) === userText\.trim\(\) \? history\.slice\(0, -1\) : history;/.test(
      b,
    ),
  );
  assert.ok(b.includes('const messages = [...prior, { role: "user" as const, content: userContent }];'));
});

test("one writer for a held draft, used by the handler and the steer", () => {
  const q = readCode("apps/edge/lib/receptionist/draft-queue.ts");
  assert.ok(q.includes('export type DraftSource = "veto_window" | "low_confidence" | "steered";'));
  assert.ok(q.includes('status: "queued",'));
  assert.ok(q.includes('kind: "outbound_send",'));
  assert.ok(
    q.includes('.update({ status: "canceled", error: { reason: "scheduling_failed" } })'),
    "a draft whose job failed to publish is retired, never sent twice",
  );
  const wa = readCode("apps/edge/lib/whatsapp/persist.ts");
  assert.ok(wa.includes("const id = await queueDraft("));
  assert.ok(!wa.includes('status: "queued",'), "the handler no longer writes the draft row itself");
});

// The steer endpoint -- the door, the draft's state, the memory and the frame
// the brain is handed, new before old, the price rule, the race and the
// rollback, the draft's own wire -- is run in steer-door.test.mjs.

test("the dashboard route keeps its doors and records the decision only after the rewrite happened", () => {
  const r = readCode("apps/dashboard/app/api/v1/messages/[id]/steer/route.ts");
  assert.ok(r.includes('rate: "whisper",'));
  assert.ok(r.includes('role: "operator",'));
  assert.ok(r.includes('if (m.sender !== "ai" || m.status !== "queued") {'));
  const steered = r.indexOf("const r = await steerDraft(id, text);");
  const recorded = r.search(
    /recordDecision\(ctx, m\.tenant_id, "message", m\.id, "edit", \{\s*steer: text,\s*new_message_id: r\.messageId,?\s*\}\)/,
  );
  assert.ok(steered > 0 && recorded > steered);
  assert.ok(
    r.includes(
      '"The rewrite would have quoted a price or named money (a refund, a discount, a deposit), so the original draft stays."',
    ),
  );
  assert.ok(
    r.includes('"That reply went out while it was being rewritten, so nothing was changed."'),
    "and the race has its own sentence, not a token",
  );
  const svc = readCode("apps/dashboard/src/server/conversations/thread-control.ts");
  assert.ok(svc.includes('callEdge("/api/admin/steer"'));
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
