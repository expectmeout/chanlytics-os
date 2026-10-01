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
import { installLegacyReact, settle } from "../_legacy-react.mjs";

installLegacyReact({});
const S = "../../../../apps/dashboard/src";
const { steerDraft } = await import(`${S}/surfaces/inbox/verbs.ts`);
const { startSurfaces } = await import(`${S}/legacy-bridge/surface-runner.ts`);

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
  const steered = r.indexOf("const r = await steerDraft(id, text, {");
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
  assert.ok(svc.includes('"/api/admin/steer"'));
});

test("the Inbox's courier asks the steer route for the rewrite, with the owner's one line", async () => {
  const asked = [];
  const wire = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(String(url), "https://app.chanlytics.com");
    asked.push([init.method ?? "GET", u.pathname, init.body ? JSON.parse(init.body) : null]);
    return new Response(JSON.stringify({ ok: true, data: { message_id: "m2" } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  // The runner a write's re-read goes to: nothing to boot.
  const stop = startSurfaces([], () => () => {});
  try {
    const r = await steerDraft("m1", "mention Saturday is full");
    await settle();
    assert.equal(r.ok, true, "the route's answer is the courier's");
    // The one write; the reads behind it are the surfaces read again (refresh-map.ts).
    assert.deepEqual(
      asked.filter(([method]) => method === "POST"),
      [["POST", "/api/v1/messages/m1/steer", { text: "mention Saturday is full" }]],
    );
  } finally {
    stop();
    globalThis.fetch = wire;
  }
});

test("the Inbox offers the rewrite only on a real draft that is still counting down", () => {
  const status = readRaw("apps/dashboard/src/surfaces/inbox/thread/status.tsx");
  const box = readRaw("apps/dashboard/src/surfaces/inbox/thread/veto.tsx");
  assert.ok(
    /hasVeto\(thread\) &&\s*!decided &&\s*thread\.real &&\s*veto != null &&\s*thread\.veto\.messageId &&\s*<SteerBox messageId=\{thread\.veto\.messageId\} \/>/.test(
      status,
    ),
  );
  assert.ok(box.includes('data-testid="steer-box"'));
  assert.ok(box.includes("Rewritten — the new draft waits its turn like the first one"));
  assert.ok(box.includes('{...gate("approve")}'), "same door as Approve and Hold");
  assert.ok(readRaw("apps/dashboard/src/legacy/styles/components.css").includes(".ix-steer-input {"));
});
