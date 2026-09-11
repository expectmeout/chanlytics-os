/**
 * The runner's boot, run: which surface asks first, and what the others see.
 *
 * No browser: a window with the three things the runner touches, a document
 * that never becomes visible, and overrides whose apply() records what the
 * tab held for the workspace at the moment they asked. The storage the
 * bridge would use is absent, so the choice lives in memory, as it does in a
 * browser that blocks storage — the case the boot order exists for.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { importSrc } from "./_source.mjs";

const win = {
  __ACTIVE_WORKSPACE: undefined,
  location: { reload() { win.reloads += 1; }, assign(url) { win.assigned = url; } },
  reloads: 0,
  assigned: null,
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent() { return true; },
};
globalThis.window = win;
globalThis.document = { visibilityState: "hidden", addEventListener() {}, removeEventListener() {} };
const { startSurfaces } = await importSrc("apps/dashboard/src/legacy-bridge/surface-runner.ts");
const { getActiveWorkspace, setActiveWorkspace } = await importSrc("apps/dashboard/src/legacy-bridge/workspace.ts");

const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async (n) => { for (let i = 0; i < n; i += 1) await tick(); };

/** The workspace surface answers `answer` after two ticks; the others record what the tab held when they asked. */
function world({ known, answer = "A" }) {
  setActiveWorkspace(known ?? null);
  win.__ACTIVE_WORKSPACE = undefined;
  const log = [];
  const workspace = {
    key: "workspace",
    apply: async () => {
      log.push(["workspace:asked", getActiveWorkspace()]);
      await tick(); await tick();
      win.__ACTIVE_WORKSPACE = answer;
      setActiveWorkspace(answer);
      log.push(["workspace:answered", answer]);
    },
  };
  const other = (key) => ({ key, debounceMs: 1, apply: async () => { log.push([key, getActiveWorkspace()]); } });
  return { log, overrides: [workspace, other("inbox"), other("people")] };
}

test("the tab names no workspace: the workspace surface asks first, and the others ask only once it has answered, under the name it gave", async () => {
  const { log, overrides } = world({ known: null });
  const stop = startSurfaces(overrides);
  await settle(12);
  stop();
  assert.deepEqual(log.slice(0, 2), [["workspace:asked", null], ["workspace:answered", "A"]], "one request before every other");
  assert.deepEqual(log.slice(2).sort(), [["inbox", "A"], ["people", "A"]], "the fourteen ask under the workspace the server chose");
});

test("the tab names its workspace: every surface fires at once, the name riding on each", async () => {
  const { log, overrides } = world({ known: "A" });
  const stop = startSurfaces(overrides);
  await settle(12);
  stop();
  assert.deepEqual(log.map((l) => l[0]).slice(0, 3).sort(), ["inbox", "people", "workspace:asked"], "all three asked before the workspace surface answered");
  assert.ok(log.filter((l) => l[0] === "inbox" || l[0] === "people").every((l) => l[1] === "A"), "each carried the name the tab held");
  assert.equal(log.filter((l) => l[0] === "inbox").length, 1, "nothing asked twice: the server agreed with the tab");
});

test("the server answers with another workspace than the tab named: the surfaces that asked under the old name ask again under the new one", async () => {
  const { log, overrides } = world({ known: "stale", answer: "A" });
  const stop = startSurfaces(overrides);
  await settle(12);
  await new Promise((r) => setTimeout(r, 30));
  stop();
  const inbox = log.filter((l) => l[0] === "inbox").map((l) => l[1]);
  assert.deepEqual(inbox, ["stale", "A"], "once under the stale name at boot, once under the server's answer");
  assert.equal(win.reloads, 0, "a correction is a refresh, never a reload");
});
