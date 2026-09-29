/**
 * The role store as the app has it, for the page tests whose gates ask who is acting: settings.jsx makes the store and
 * the bridge completes it (legacy-bridge/roles.ts installRoles), so `mayAtLeast`, `myRole` and View-as read the
 * window's `__ME` and the store's own `viewAsRole` at each ask, as they do in the app. A test that changes
 * `window.__ME.role` between draws changes who is acting.
 *
 * Not named *.test.mjs on purpose: the runner globs that pattern.
 */
import { installRoles } from "../../../apps/dashboard/src/legacy-bridge/roles.ts";

/** Make (or complete) `win.ST_STORE`; `can` is only there where a test has none, and answers yes as no store does. */
export function installRoleStore(win = globalThis.window) {
  const store = (win.ST_STORE ??= { viewAsRole: null, can: () => true });
  store.viewAsRole ??= null;
  installRoles(win);
  return store;
}
