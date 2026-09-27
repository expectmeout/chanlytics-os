/**
 * The Live page after the first real call.
 *
 * The owner phoned the line, saw the call appear, and saw nothing else: the
 * waiting state said "nothing has been said yet" while the greeting was
 * playing (the provider sends words after the FIRST exchange, not for the
 * greeting), and the whisper box sat below a spacer that pushed it under the
 * fold. Realtime itself was proved fine on the deployed page (a no-op update
 * repainted it in five seconds), so the fixes are placement, wording, and a
 * re-read every eight seconds while a call is live as insurance against a
 * channel that drops silently.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readCode, readRaw } from "../../_source.mjs";

const page = readRaw("apps/dashboard/src/legacy/pages/live-monitor.jsx");

test("the waiting state says the greeting is playing and words follow the first exchange", () => {
  assert.ok(page.includes("It opens with the greeting; the phone provider sends the words after the first exchange"));
  assert.ok(
    !page.includes("Nothing has been said yet"),
    "REGRESSION: told the owner nothing had been said while the greeting played",
  );
});

test("the whisper box sits directly under the transcript or the waiting state, above the spacer", () => {
  const whisper = page.indexOf("{c.live && <LrWhisper c={c} />}");
  const spacer = page.indexOf('{!(c.live && c.transcript.length) && <div className="lm-spacer" />}');
  assert.ok(whisper > 0 && spacer > whisper, "the spacer comes AFTER the whisper");
  assert.equal(
    (page.match(/className="lm-spacer"/g) ?? []).length,
    1,
    "no spacer inside the waiting state pushing the box below the fold",
  );
});

test("while a call is live the page re-reads every 8 s beside the realtime channel", () => {
  assert.ok(page.includes("window.setInterval(() => { window.__refreshLive(); }, 8000)"));
  assert.ok(page.includes("if (!hasLive || !window.__refreshLive) return undefined;"), "only while a call is up");
  const verbs = readCode("apps/dashboard/src/legacy-bridge/inbox-verbs.ts");
  assert.ok(verbs.includes("export async function refreshLive(): Promise<void> {"));
  assert.ok(verbs.includes("await refreshSurfaces([liveOverride]);"));
  assert.ok(verbs.includes("window.__refreshLive = refreshLive;"));
  // The page's sub-headline used to announce the whisper; the page has no sub-headline now (the work first), and
  // the box names itself where it sits, directly under the transcript.
  assert.ok(page.includes("Whisper to the receptionist"), "the control says what it is where it is");
});
