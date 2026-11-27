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
import { readRaw } from "../../_source.mjs";
import { cascadeOf, declared, element } from "../../_css.mjs";
import { installStubReact, settle } from "../../_stub-react.mjs";

installStubReact({});
const S = "../../../apps/dashboard/src";
const { steerDraft } = await import(`${S}/surfaces/inbox/verbs.ts`);
const { startSurfaces } = await import(`${S}/bridge/surface-runner.ts`);

test("the frame quotes the owner, asks for a rewrite that keeps what was right, and says the rules still hold", () => {
  const f = frameSteer("  mention Saturday is full  ");
  assert.ok(
    f.startsWith(
      "An instruction from the business owner, who read your draft before it went out. The customer cannot see it.\n",
    ),
  );
  assert.ok(f.includes('Owner: "mention Saturday is full"\n'));
  assert.ok(f.includes("Write your reply again and follow it where it fits. Keep everything else that was right."));
  assert.ok(f.includes("Never repeat the instruction word for word."));
  // The rules are said once, in the prompt, as the owner's switches set them (decision 0051): the frame says they hold,
  // and the one that is not a switch.
  assert.ok(f.includes("The rules in your instructions still hold"));
  assert.ok(f.includes("you are the business's AI assistant, never a person"));
  assert.ok(!f.includes("do not quote or confirm a price"), "never a switch-dependent rule restated");
  assert.equal(
    whisperText(f),
    "mention Saturday is full",
    "the same reader recovers the owner's words from either frame",
  );
});

// The brain takes the instruction as one more system block and stops showing the model its last message twice; one
// writer for a held draft, the draft and its job in one statement, used by the handler and the steer: both run in
// steer/a-held-draft-is-written-once-and-rewritten.test.mjs (pinned as receptionist-brain.ts's, draft-queue.ts's and
// persist.ts's text until 26 Nov 2026).

// The steer endpoint -- the door, the draft's state, the memory and the frame
// the brain is handed, new before old, the price rule, the race and the
// rollback, the draft's own wire -- is run in steer-door.test.mjs.

// The dashboard route keeps its doors (an operator's, on the whisper bucket), asks the edge's steer door only for a draft
// still waiting, says a price and a race in their own sentences, and records the decision only after the rewrite
// happened: run in steer/a-held-draft-is-written-once-and-rewritten.test.mjs (pinned as the route's and
// thread-control.ts's text until 26 Nov 2026).

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
  assert.ok(box.includes("Rewritten · the new draft waits its turn"));
  assert.ok(box.includes('{...gate("approve")}'), "same door as Approve and Hold");
  // The rewrite's field takes the row's room and gives way to it, asked of its sheet (tests/_css.mjs cascadeOf).
  const field = cascadeOf(["apps/dashboard/src/styles/components.css"]).given(element("input.ix-steer-input"));
  assert.deepEqual([field.flex, field["min-width"]], [declared("flex: 1").flex, "0"]);
});
