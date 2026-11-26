/**
 * The line chooser's Keep my number: with AI already answering a line, it says which line and hands the owner to the row
 * "The number you already have" (Set up forwarding closes the chooser and opens that card); with no line yet, it says to
 * get one first and offers nothing to press. Drawn on the stub React over the chooser itself; pinned as line-chooser.tsx's
 * text in lines/forwarding.test.mjs until 26 Nov 2026.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { installStubReact, fresh, again, byTestId, textOf } from "../../_stub-react.mjs";
import { bridgeHolds } from "../../shell/_bridge-holds.mjs";

installStubReact();
const { LineChooser } = await import("../../../apps/dashboard/src/surfaces/setup/rows/line-chooser.tsx");

/** The chooser on Setup's state, its Keep my number pressed, and what it asked of the page. */
function keepChosen(voice) {
  const asked = [];
  const S = { dto: { channels: { voice } }, vm: { tryIt: voice.active ? { voiceLabel: "+1 (305) 555-0142" } : null } };
  const chooser = () =>
    globalThis.React.createElement(LineChooser, {
      S,
      flash: (f) => asked.push(["flash", f]),
      onDone: () => asked.push("done"),
      onKeep: () => asked.push("keep"),
    });
  fresh();
  byTestId(again(chooser), "setup-path-keep").props.onClick();
  return { tree: again(chooser), asked };
}

test("Keep my number, with AI answering a line: it names the line, and Set up forwarding hands the owner to the number's row", () => {
  bridgeHolds({ who: { me: { email: "dana@northside.example", role: "owner" } } });
  const { tree, asked } = keepChosen({ active: true });
  assert.match(textOf(tree), /AI answers on \+1 \(305\) 555-0142\. Forward the number you have to it/);
  const go = byTestId(tree, "setup-keep-go");
  assert.equal(textOf(go), "Set up forwarding");
  go.props.onClick();
  assert.deepEqual(asked, ["done", "keep"], "the chooser closes, then the number's own card opens");
});

test("Keep my number with no line yet: a line first, and nothing to press", () => {
  bridgeHolds({ who: { me: { email: "dana@northside.example", role: "owner" } } });
  const { tree, asked } = keepChosen({ active: false });
  assert.match(textOf(tree), /First, a line for AI to answer on/);
  assert.equal(byTestId(tree, "setup-keep-go"), null);
  assert.deepEqual(asked, []);
});
