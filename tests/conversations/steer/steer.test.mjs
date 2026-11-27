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
import { frameSteer, whisperText, toInboxThreadVM, stateOf } from "@chanlytics/contracts";
import { givenOn } from "../../_css.mjs";
import { installStubReact, settle, fresh, again, find, textOf } from "../../_stub-react.mjs";
import { bridgeHolds, holdFrameParts, holdRoles } from "../../shell/_bridge-holds.mjs";
import { until } from "../../shared/_until.mjs";

bridgeHolds({ parts: { surfaceState: () => "live", chrome: { state: stateOf } } });
installStubReact({});
holdFrameParts();
const S = "../../../apps/dashboard/src";
const { steerDraft } = await import(`${S}/surfaces/inbox/verbs.ts`);
const { startSurfaces } = await import(`${S}/bridge/surface-runner.ts`);
const { ThreadStatus } = await import(`${S}/surfaces/inbox/thread/status.tsx`);
const { SteerBox } = await import(`${S}/surfaces/inbox/thread/veto.tsx`);

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

/** A real thread holding a draft, its conversation still being read (`partial`): its status band stands over it. */
const held = () => ({
  ...toInboxThreadVM(
    {
      id: "c1",
      state: "open",
      paused_until: null,
      last_message_at: null,
      contact: { id: "k1", display_name: "Ana", wa_profile_name: null, phone_e164: "+13475550101" },
      messages: [
        {
          id: "m3",
          direction: "outbound",
          sender: "ai",
          type: "text",
          body: "We open at 9.",
          media: null,
          meta: { delay_ms: 90_000 },
          status: "queued",
          created_at: "2026-08-29T11:59:30.000Z",
        },
      ],
    },
    null,
    "America/New_York",
    new Date("2026-08-29T12:00:00.000Z"),
  ),
  partial: true,
});

test("the Inbox offers the rewrite only on a real draft that is still counting down", () => {
  const boxOn = (thread, over = {}) => {
    fresh();
    const tree = again(() =>
      ThreadStatus({ thread, decided: false, veto: 42, onVetoAct() {}, onTakeOver() {}, onHandBack() {}, ...over }),
    );
    return find(tree, (n) => n.type === SteerBox);
  };
  assert.equal(boxOn(held())?.props.messageId, "m3", "the draft counting down, by its own message");
  assert.equal(boxOn(held(), { veto: null }), null, "a draft stopped has nothing to rewrite");
  assert.equal(boxOn(held(), { decided: true }), null, "nor one decided");
  assert.equal(boxOn({ ...held(), real: false }), null, "and a seeded draft has no edge to ask");
});

test("the rewrite box sends the owner's line and says the new draft waits its turn, behind the door Approve and Hold use", async () => {
  const asked = [];
  const wire = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(String(url), "https://app.chanlytics.com");
    asked.push([init.method ?? "GET", u.pathname, init.body ? JSON.parse(init.body) : null]);
    return new Response(JSON.stringify({ ok: true, data: { message_id: "m4" } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  const stop = startSurfaces([], () => () => {});
  holdRoles({ can: null });
  try {
    fresh();
    const draw = () => again(() => SteerBox({ messageId: "m3" }));
    const field = (tree) => find(tree, (n) => n.type === "input");
    const press = (tree) => find(tree, (n) => n.props?.className?.includes?.("ix-press"));
    let tree = draw();
    assert.ok(
      find(tree, (n) => n.props?.["data-testid"] === "steer-box"),
      "the box, by its test id",
    );
    assert.equal(press(tree).props.disabled, true, "nothing to send until the owner writes");
    field(tree).props.onChange({ target: { value: "mention Saturday is full" } });
    tree = draw();
    const sent = press(tree).props.onClick();
    await sent;
    await until(() => /Rewritten/.test(textOf(draw())), "the box says the draft was rewritten");
    tree = draw();
    assert.deepEqual(
      asked.filter(([method]) => method === "POST"),
      [["POST", "/api/v1/messages/m3/steer", { text: "mention Saturday is full" }]],
    );
    assert.match(textOf(tree), /Rewritten · the new draft waits its turn/);
    assert.equal(field(tree).props.value, "", "the box empties for the next line");
    // A role that may not approve a draft may not rewrite one either: the same gate as Approve and Hold.
    holdRoles({ can: (perm) => perm !== "approve" });
    fresh();
    tree = draw();
    field(tree).props.onChange({ target: { value: "say Sunday" } });
    tree = draw();
    assert.equal(press(tree).props["aria-disabled"], true, "refused at the button, in the gate's words");
  } finally {
    holdRoles({ can: null });
    stop();
    globalThis.fetch = wire;
  }
  // The rewrite's field takes the row's room and gives way to it, asked of the parsed sheet under any query.
  const field = givenOn("apps/dashboard/src/styles/components.css", ".ix-steer-input", null);
  assert.deepEqual([field.flex, field["min-width"]], ["1", "0"]);
});
