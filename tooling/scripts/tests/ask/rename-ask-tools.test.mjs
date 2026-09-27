/**
 * The Ask tools' rename carried into the eval (the Phase 3 plan, D13): the cases are rewritten once by
 * tooling/evals/tool-names.json, a second run changes nothing, a name the table does not know is refused, and the
 * judge reads a case's names and a turn's through the same table, so a case or a stored turn from before the rename
 * still judges. The script runs here as a module; nothing is written.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RECORDED, renameCases, toolNow, usedAny } from "../../../evals/rename-ask-tools.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const CASES = JSON.parse(fs.readFileSync(path.join(ROOT, "tooling/evals/ask-cases.json"), "utf8"));

test("the committed cases say the new names: the rewrite was run, and running it again changes nothing", () => {
  const again = renameCases(CASES);
  assert.deepEqual([again.changed, again.unknown], [0, []]);
  assert.deepEqual(again.cases, CASES);
  const named = CASES.flatMap((c) => [...(c.expect?.tools_any ?? []), ...(c.expect?.tools_also_any ?? [])]);
  assert.ok(named.length > 0, "the cases name tools");
  for (const n of named) assert.ok(RECORDED.has(n), `${n} is a name the registry records`);
});

test("an old name is rewritten to its tool and action, once; a name neither old nor new is refused by case and name", () => {
  const cases = [
    { id: "a", expect: { tools_any: ["get_today", "list_threads", "inbox.thread"], no_write: true } },
    { id: "b", expect: { tools_also_any: ["propose_broadcast"] } },
    { id: "c", text: "no tools here" },
  ];
  const once = renameCases(cases);
  assert.deepEqual(once.unknown, []);
  assert.equal(once.changed, 3);
  assert.deepEqual(once.cases, [
    { id: "a", expect: { tools_any: ["today", "inbox.list", "inbox.thread"], no_write: true } },
    { id: "b", expect: { tools_also_any: ["propose_campaign.broadcast"] } },
    { id: "c", text: "no tools here" },
  ]);
  assert.deepEqual(renameCases(once.cases).changed, 0, "idempotent");
  const bad = renameCases([{ id: "x", expect: { tools_any: ["teleport", "today"] } }]);
  assert.deepEqual(bad.unknown, ["x: teleport"]);
});

test("the judge reads both sides through the table: an old name in a case matches the new name a turn records, a new name in a case matches a turn stored before the rename, and a different action is a different tool", () => {
  assert.equal(toolNow("list_threads"), "inbox.list");
  assert.equal(toolNow("inbox.list"), "inbox.list");
  assert.equal(toolNow("teleport"), "teleport");
  assert.equal(usedAny(["list_threads"], ["inbox.list"]), true, "an old case, a turn since");
  assert.equal(usedAny(["inbox.list"], ["list_threads"]), true, "a new case, a turn stored before");
  assert.equal(usedAny(["propose_playbook"], ["propose_campaign.playbook"]), true);
  assert.equal(usedAny(["inbox.thread"], ["inbox.list"]), false, "list is not thread");
  assert.equal(usedAny(["get_thread"], ["inbox"]), false, "a call that named no action is not one that did");
  assert.equal(usedAny(["today"], undefined), false, "no tools recorded, none used");
});
