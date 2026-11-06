/**
 * The role every gate reads is one answer (legacy-bridge/identity.ts roleOf and installRoles): the member's role from the workspace's read, lowered
 * by an owner's View-as preview, failing closed, and read against contracts' ladder (roleAtLeast) by every page that
 * offers an act only to the role its door takes. Run on the real functions and the real store the bridge completes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { importSrc } from "../_source.mjs";

const { roleOf, installRoles } = await importSrc("apps/dashboard/src/legacy-bridge/identity.ts");

/** A window with the store settings.jsx makes (its own team stands in for a demo session's member). */
const windowWith = ({ me, demo = false, viewAs = null, demoRole = "operator" } = {}) => {
  const store = { viewAsRole: viewAs, me: () => ({ role: demoRole }), myRole: () => "owner" };
  const win = { ST_STORE: store, __DEMO_MODE: demo, ...(me === undefined ? {} : { __ME: me }) };
  installRoles(win);
  return { win, store };
};

test("the member's role is the real one, and a role nobody can read is a viewer's, never an owner's", () => {
  assert.equal(roleOf({ me: { role: "owner" }, viewAs: null }), "owner");
  assert.equal(roleOf({ me: { role: "operator" }, viewAs: null }), "operator");
  assert.equal(roleOf({ me: {}, viewAs: null }), "viewer", "a member with no role");
  assert.equal(roleOf({ me: null, viewAs: null }), "viewer", "the workspace read failed, or has not landed");
  assert.equal(roleOf({ me: undefined, viewAs: null, demoRole: null }), "viewer");
});

test("View-as previews a lower role on top of the real one, and a demo session acts as the mockup's member", () => {
  assert.equal(roleOf({ me: { role: "owner" }, viewAs: "viewer" }), "viewer");
  assert.equal(roleOf({ me: { role: "owner" }, viewAs: "operator" }), "operator");
  assert.equal(roleOf({ me: undefined, viewAs: null, demoRole: "operator" }), "operator", "the mockup's own member");
  assert.equal(roleOf({ me: undefined, viewAs: "viewer", demoRole: "owner" }), "viewer");
});

test("the store answers who is acting at each ask: a change of role or of preview moves every gate together", () => {
  const { win, store } = windowWith({ me: { role: "owner" } });
  assert.equal(store.myRole(), "owner");
  assert.equal(store.mayAtLeast("owner"), true);
  store.viewAsRole = "viewer";
  assert.equal(store.myRole(), "viewer");
  assert.equal(
    store.mayAtLeast("operator"),
    false,
    "an owner previewing a viewer may not record: REGRESSION, the pages read __ME.role",
  );
  assert.equal(store.mayAtLeast("owner"), false);
  store.viewAsRole = null;
  win.__ME = { role: "operator" };
  assert.equal(store.mayAtLeast("operator"), true);
  assert.equal(store.mayAtLeast("owner"), false);
});

test("the ladder is contracts': operator, the partner and the owner record; only the owner is an owner; a role off the ladder is on no rung", () => {
  for (const [role, operator, owner] of [
    ["owner", true, true],
    ["partner", true, false],
    ["operator", true, false],
    ["viewer", false, false],
    ["nobody", false, false],
  ]) {
    const { store } = windowWith({ me: { role } });
    assert.equal(store.mayAtLeast("operator"), operator, `${role} at least operator`);
    assert.equal(store.mayAtLeast("owner"), owner, `${role} at least owner`);
  }
});

test("with no workspace read the gates fail closed, and the standalone mockup keeps its own store", () => {
  const closed = windowWith({});
  assert.equal(closed.store.myRole(), "viewer");
  assert.equal(closed.store.mayAtLeast("operator"), false);
  const demo = windowWith({ demo: true, demoRole: "owner" });
  assert.equal(demo.store.myRole(), "owner", "a demo session acts as the mockup's member");
  // No store, as in a window the bridge does not serve: nothing to complete, nothing thrown.
  assert.doesNotThrow(() => installRoles({ __ME: { role: "owner" } }));
});
