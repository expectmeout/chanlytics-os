/**
 * Which calls raise a turn to the draft's effort (server/ask/effort.ts DRAFT_CALLS), asked of every action the registry
 * has: the list is names as calledName gives them, so a name no call gives never raises what it says it does. A lead plan
 * stayed at the turn's own effort from the day the list was written (2 Nov 2026), and stays there on purpose: effort.ts
 * says why, and how to undo it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { turnEffort } = await import(at("apps/dashboard/src/server/ask/effort.ts"));
const { ACT_DEFS } = await import(at("apps/dashboard/src/server/ask/tools/registry.ts"));
const { NO_ACTION } = await import(at("apps/dashboard/src/server/ask/tools/context.ts"));

/** Whether a round at the turn's own effort that made this one call is set aside and asked again at the draft's. */
const raises = (name, input) =>
  turnEffort({ effort: "low", draft: "high" }, { text: "how is the week", spoken: false }, { draft: null }).redraft(
    [{ type: "tool_use", name, json: JSON.stringify(input) }],
    [],
  );

/** Every act tool that takes an action, with the actions it takes. */
const WITH_ACTIONS = ACT_DEFS.filter((t) => !(NO_ACTION in t.actions));

test("the calls that raise a turn are the drafts: plans, sequences and their messages, each by the name a call gives", () => {
  const raised = WITH_ACTIONS.flatMap((t) =>
    Object.keys(t.actions)
      .filter((action) => raises(t.name, { action }))
      .map((action) => `${t.name}.${action}`),
  ).sort();
  assert.deepEqual(raised, [
    "propose_plan.offer",
    "propose_plan.steps",
    "propose_sequence.cold_email",
    "propose_sequence.make",
    "propose_sequence.message",
    "propose_sequence.moment",
  ]);
});

test("a lead plan stays at the turn's own effort: it fills in a form the planner checks, and a redraft is a round of the slowest watched turn", () => {
  assert.equal(raises("propose_lead_search", { action: "find" }), false);
});

test("no entry names a tool with actions bare: a call that names no action is refused by its parser, and raises nothing", () => {
  const bare = WITH_ACTIONS.filter((t) => raises(t.name, {})).map((t) => t.name);
  assert.deepEqual(bare, []);
});

test("a spoken turn is never raised, whatever it calls", () => {
  const spoken = turnEffort({ effort: "low", draft: "high" }, { text: "plan an offer", spoken: true }, { draft: null });
  const raised = spoken.redraft(
    [{ type: "tool_use", name: "propose_plan", json: JSON.stringify({ action: "offer" }) }],
    [],
  );
  assert.equal(raised, false);
});

test("a picture opened raises the rounds after it to the draft's effort, once; a question that came with pictures from its first round; a spoken turn never", () => {
  const model = { effort: "low", draft: "high" };
  const meter = { draft: null };
  const t = turnEffort(model, { text: "what is in this photo", spoken: false }, meter);
  const messages = [];
  assert.equal(t.lookHarder(messages), true);
  assert.deepEqual(meter.draft, { effort: "high", by: "picture" });
  assert.equal(messages.length, 1);
  assert.equal(t.lookHarder(messages), false, "once a turn");
  assert.equal(messages.length, 1);

  // The question's pictures are known once the first reads are in (the scope's photo, or one attached), so the first
  // request is opened with them: the first real turn with eyes (7 Nov 2026) came by the sheet, not attached, and ran its
  // first round at the turn's own effort.
  const withPictures = { draft: null };
  const opened = [];
  const pictured = turnEffort(model, { text: "what is in this photo", spoken: false }, withPictures);
  pictured.open(opened, { pictures: true });
  assert.deepEqual(withPictures.draft, { effort: "high", by: "picture" });
  assert.equal(opened.length, 1, "the effort message, after the question");
  pictured.open(opened, { pictures: true });
  assert.equal(opened.length, 1, "already in force: a replayed chain that holds the raise is not raised again");
  assert.equal(pictured.lookHarder(opened), false, "once a turn, by whichever way");

  const noPictures = { draft: null };
  const plain = [];
  turnEffort(model, { text: "what is in this photo", spoken: false }, noPictures).open(plain, { pictures: false });
  assert.equal(noPictures.draft, null);
  assert.equal(plain.length, 0, "the turn's own effort is in force with no message");

  const asksDraft = { draft: null };
  turnEffort(model, { text: "draft the offer email from this photo", spoken: false }, asksDraft).open([], {
    pictures: true,
  });
  assert.deepEqual(asksDraft.draft, { effort: "high", by: "question" }, "the question's own words come first");

  const spoken = { draft: null };
  const voice = turnEffort(model, { text: "what is this", spoken: true }, spoken);
  const heard = [];
  voice.open(heard, { pictures: true });
  assert.equal(spoken.draft, null);
  assert.equal(heard.length, 0);
  assert.equal(voice.lookHarder([]), false);

  const noDraft = { draft: null };
  const none = turnEffort({ effort: "low", draft: null }, { text: "x", spoken: false }, noDraft);
  none.open([], { pictures: true });
  assert.equal(noDraft.draft, null, "a profile with no draft effort has nothing to raise to");
  assert.equal(none.lookHarder([]), false);
});
