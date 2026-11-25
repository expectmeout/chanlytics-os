/**
 * Working for you, step 3 (21 Nov 2026), EXECUTED on the stub React: Next in the conversation sheet once the person it
 * opened on no longer waits (W4); someone new while a hand is busy is said and placed only once the hand is free (W23); a
 * held line's acts, each the row's own verb, and a refused one leaves the line where it was, saying why (W11, W20).
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { clockTime, toTodayVM, zoneDayKey } from "@chanlytics/contracts";
import { installStubReact, fresh, again, textOf } from "../../_stub-react.mjs";
import { until } from "../../shared/_until.mjs";
import { NOW, ZONE, escalation, metrics, msg, thread, waiting } from "../record/_world.mjs";
import { bridgeHolds } from "../../shell/_bridge-holds.mjs";

const flashed = [];
bridgeHolds({
  parts: {
    surfaceState: () => "live",
    clock: { zone: () => ZONE, dayKey: (ms) => zoneDayKey(ms, ZONE), time: (ms) => clockTime(ms, ZONE) },
  },
});
installStubReact({
  appNavigate: () => {},
  usePPToast: () => [null, (f) => flashed.push(f)],
  canDo: () => true,
  gate: () => ({}),
  setInterval: () => 1,
  clearInterval() {},
});
const W = globalThis.window;
W.matchMedia = (q) => ({
  media: q,
  matches: q === "(max-width: 720px)",
  addEventListener() {},
  removeEventListener() {},
});
bridgeHolds({
  who: {
    workspaces: [{ id: "t1", slug: "studio", name: "Studio", status: "active", timezone: ZONE }],
    activeWorkspaceId: "t1",
  },
});
// Every write is refused: what a press does with a refusal is what is proved here, and nothing is sent anywhere.
W.fetch = async () =>
  new Response(
    JSON.stringify({ ok: false, error: { code: "unavailable", message: "Not now: try again in a moment." } }),
    {
      status: 503,
      headers: { "content-type": "application/json" },
    },
  );

const { NeedYou } = await import("../../../apps/dashboard/src/surfaces/today/zones/need-you.tsx");
const { useTodayArrangement } = await import("../../../apps/dashboard/src/surfaces/today/arrangement.ts");
const { NextUp } = await import("../../../apps/dashboard/src/surfaces/today/over/next.tsx");
const { openAiSheet, closeAiSheet } = await import("../../../apps/dashboard/src/surfaces/today/ai/open.ts");
const { heldActsOf } = await import("../../../apps/dashboard/src/surfaces/today/need-you/held-acts.tsx");
const { setSurfaceValue } = await import("../../../apps/dashboard/src/surfaces/surface-values.ts");

const NeedYouOnToday = () => NeedYou({ card: useTodayArrangement().card });
after(() => setSurfaceValue("today", undefined));

/** Sofia asked for a person an hour before Ana: two waiting, then Marco, who wrote later. */
const sofia = () =>
  thread("cv-s", "Sofia Reyes", [msg("s1", "What would six of us cost?", "2026-09-18T17:00:00Z")], {
    state: "needs_human",
  });
const sofiaHeld = () => ({ ...escalation(), id: "e-s", conversation_id: "cv-s", created_at: "2026-09-18T17:01:00Z" });
const marco = () =>
  thread("cv-m", "Marco Bellini", [msg("m1", "Can we move to Thursday?", "2026-09-18T19:00:00Z")], {
    state: "needs_human",
  });
const marcoHeld = () => ({ ...escalation(), id: "e-m", conversation_id: "cv-m", created_at: "2026-09-18T19:01:00Z" });

const both = () => toTodayVM(metrics(), [sofia(), waiting()], [sofiaHeld(), escalation()], [], NOW);
const sofiaAlone = () => toTodayVM(metrics(), [sofia()], [sofiaHeld()], [], NOW);
const three = () =>
  toTodayVM(metrics(), [sofia(), waiting(), marco()], [sofiaHeld(), escalation(), marcoHeld()], [], NOW);

test("Next (W4): nothing while the person the sheet opened on waits; once answered, the next who waits, with Open", () => {
  setSurfaceValue("today", both());
  fresh();
  const Probe = () => NextUp({ conversationId: "cv-a" });
  const drawn = () => again(() => W.React.createElement(Probe, {})).rendered;
  assert.equal(drawn(), null, "Ana still waits: no Next yet");
  setSurfaceValue("today", sofiaAlone());
  const next = drawn();
  assert.ok(next, "answered: the next person stands at the sheet's foot");
  assert.match(textOf(next), /Next.*Sofia Reyes.*Open/);
});

test("Next (W4) never stands under someone who was not waiting as the sheet opened", () => {
  setSurfaceValue("today", sofiaAlone());
  fresh();
  const Probe = () => NextUp({ conversationId: "cv-a" });
  assert.equal(again(() => W.React.createElement(Probe, {})).rendered, null);
});

test("nothing moves under your hands (W23): someone new while AI's sheet is open is said once, and placed once it shuts", () => {
  setSurfaceValue("today", both());
  fresh();
  const draw = () => again(() => W.React.createElement(NeedYouOnToday, {}));
  const before = textOf(draw());
  assert.doesNotMatch(before, /Marco Bellini/);
  // The sheet opening draws the page again (its open is heard), before anyone new arrives.
  openAiSheet();
  draw();
  flashed.length = 0;
  setSurfaceValue("today", three());
  const busy = textOf(draw());
  assert.doesNotMatch(busy, /Marco Bellini/, "not placed while the hand is busy");
  assert.ok(
    flashed.some((f) => /1 new · placed when you’re done/.test(textOf(f.msg))),
    "said once, in words",
  );
  closeAiSheet();
  assert.match(textOf(draw()), /Marco Bellini/, "placed once the hand is free");
});

test("a held line's acts (W11): a conversation's Done, Not now and Ask AI about it; Done refused leaves it where it was, saying why", async () => {
  const row = both().queue.rows.find((r) => r.conversationId === "cv-a");
  const kept = [];
  const said = [];
  const ctx = {
    may: true,
    tz: ZONE,
    keep: (r) => kept.push(["keep", r.id]),
    unkeep: (r) => kept.push(["unkeep", r.id]),
    flash: (f) => said.push(f),
    stepDone: () => assert.fail("not a to-do"),
  };
  const acts = heldActsOf(row, ctx);
  assert.ok(acts.done, "Done");
  assert.ok(acts.notNow?.choices.length, "Not now, with its times");
  assert.deepEqual(
    acts.about,
    { kind: "conversation", id: "cv-a", label: "Ana Reyes" },
    "AI's field about Ana, no words in it",
  );
  acts.done();
  await until(() => kept.length === 2, "the refusal let the row go back to its place");
  assert.deepEqual(kept, [
    ["keep", row.id],
    ["unkeep", row.id],
  ]);
  assert.equal(said.at(-1)?.tone, "danger");
  assert.match(textOf(said.at(-1)?.msg), /try again in a moment/);
});

test("a member who may not act holds a line and is offered only Ask AI about it", () => {
  const row = both().queue.rows.find((r) => r.conversationId === "cv-a");
  const acts = heldActsOf(row, { may: false, tz: ZONE, keep() {}, unkeep() {}, flash() {}, stepDone() {} });
  assert.equal(acts.done, null);
  assert.equal(acts.notNow, null);
  assert.ok(acts.about);
});
