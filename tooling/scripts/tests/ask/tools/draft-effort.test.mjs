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

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
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
