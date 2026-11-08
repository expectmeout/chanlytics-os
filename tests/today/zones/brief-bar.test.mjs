/**
 * Your brief while it plays, and Listen beside the bell (8 Nov 2026), drawn on the stub React over a stand-in for Ask's voice.
 * Listen's own button said Stop, and it stayed on Today: leaving the page, or a call taking the header's row, left a voice
 * playing with nothing on the screen to stop it. And "Getting Ask's voice…" took the button from 100px to 151, up to the date.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { all, textOf, unmount } from "../../_stub-react.mjs";
import { W, draw } from "./_world.mjs";

const { BriefBar } = await import("../../../apps/dashboard/src/surfaces/frame/topbar/status-bars.tsx");
const { holdAsk } = await import("../../../apps/dashboard/src/surfaces/frame-verbs.ts");
const { listenButton } = await import("../../../apps/dashboard/src/surfaces/today/zones/listen.tsx");
const { liveBar } = await import("@chanlytics/contracts");

/** Ask's voice, as much as the capsule reads of it. */
function voice(state, purpose = "brief") {
  const v = {
    stopped: 0,
    state: () => state,
    speakingFor: () => (state === "idle" ? null : purpose),
    watchSpeech: () => () => {},
    stopSpeaking() {
      v.stopped += 1;
    },
  };
  return v;
}
/** The capsule drawn over this voice, with this many calls going on. */
function drawn(v, calls = 0) {
  holdAsk(v);
  W.__chrome = { liveBar };
  const nowMs = Date.now();
  W.__LIVE = {
    heartbeatMs: 3_600_000,
    now: Array.from({ length: calls }, (_, i) => ({
      callId: `c${i}`,
      who: "Dana Ruiz",
      whoShort: "Dana",
      live: true,
      heartbeatAtMs: nowMs,
      startedAtMs: nowMs - 65_000,
      checking: false,
    })),
  };
  const tree = draw(BriefBar);
  return all(tree, (n) => n.props?.["data-testid"] === "brief-bar")[0] ?? null;
}

test("while your brief plays the capsule says so, and the whole of it is the Stop", () => {
  const v = voice("speaking");
  const bar = drawn(v);
  assert.match(textOf(bar), /Your brief/);
  assert.equal(bar.props["aria-label"], "Stop your brief");
  bar.props.onClick();
  assert.equal(v.stopped, 1);
  unmount();
});

test("nothing is drawn with nothing playing, nor for an answer read aloud, which has its own Stop", () => {
  assert.equal(drawn(voice("idle")), null);
  unmount();
  assert.equal(drawn(voice("speaking", "answer")), null);
  unmount();
  assert.equal(drawn(voice("loading")), null, "the circle holds the fetch: the capsule is for what is playing");
  unmount();
});

test("a call going on takes the row and ends the brief: two things never talk at once", () => {
  const v = voice("speaking");
  assert.equal(drawn(v, 1), null, "the call has the place");
  assert.equal(v.stopped, 1, "REGRESSION: the voice played on with its Stop hidden under the call");
  unmount();
  const asked = voice("speaking", "answer");
  drawn(asked, 1);
  assert.equal(asked.stopped, 0, "an answer Ask reads aloud is not the capsule's to end");
  unmount();
  holdAsk(undefined);
});

test("Listen says the same at rest and while it fetches, so nothing beside it moves", () => {
  const speech = { can: true, state: "idle", why: null, toggle() {}, warm() {} };
  const rest = listenButton(speech, "One two three four five six seven eight.");
  const fetching = listenButton({ ...speech, state: "loading" }, "One two three four five six seven eight.");
  assert.equal(textOf(rest), textOf(fetching), 'REGRESSION: "Getting Ask\'s voice…" grew it up to the date');
  assert.match(rest.props["aria-label"], /^Listen to your brief, 0:03$/);
  assert.equal(fetching.props["aria-label"], "Getting Ask's voice");
  assert.equal(fetching.props["aria-busy"], true);
});
