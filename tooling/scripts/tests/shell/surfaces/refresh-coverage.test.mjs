/**
 * Every write is decided: it re-reads the surfaces it can make stale (refresh-map.ts AFTER), or it is listed as
 * refreshing nothing, with why (REFRESHES_NOTHING).
 *
 * The map was opt-in: a route not in it refreshed nothing, which is the right answer for a draft or a search and the
 * wrong one for everything else, and nothing told the two apart. On 29 September 43 of the 141 writes were in
 * neither list (five of them new since the day before), and a contact renamed on their page kept their old name on
 * every thread with them until something else read the Inbox again. Run on the real tables, over the generated routes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { importSrc } from "../../_source.mjs";

globalThis.window ??= globalThis;
const { ROUTES } = await importSrc("apps/dashboard/src/client/routes.generated.ts");
const { AFTER, REFRESHES_NOTHING } = await importSrc("apps/dashboard/src/legacy-bridge/refresh-map.ts");

const writes = Object.keys(ROUTES).filter((k) => ROUTES[k].method !== "GET");
const keysOf = (route) => AFTER[route]().map((o) => o.key);

test("every write re-reads its surfaces or says why it re-reads none, and never both", () => {
  assert.ok(writes.length > 100, `the generated routes are read: ${writes.length} writes`);
  const neither = writes.filter((k) => !(k in AFTER) && !(k in REFRESHES_NOTHING));
  assert.deepEqual(neither, [], "a write in neither table: add it to AFTER, or to REFRESHES_NOTHING with why");
  const both = writes.filter((k) => k in AFTER && k in REFRESHES_NOTHING);
  assert.deepEqual(both, []);
});

test("the tables name only writes, and every reason is said", () => {
  for (const k of Object.keys(REFRESHES_NOTHING)) {
    assert.ok(ROUTES[k], `${k}: not a route`);
    assert.notEqual(ROUTES[k].method, "GET", `${k}: a read is not a write`);
    assert.ok(String(REFRESHES_NOTHING[k]).trim().length > 10, `${k}: say why nothing on screen moves`);
  }
  for (const k of Object.keys(AFTER)) assert.ok(keysOf(k).length > 0, `${k}: names no surface`);
});

test("REGRESSION: a contact's edit re-reads the threads with them -- their name stayed old on the Inbox", () => {
  for (const route of [
    "PUT contacts/[id]/details",
    "PUT contacts/[id]/consent",
    "PUT contacts/[id]/marketing-consent",
    "PUT contacts/consent",
    "PUT contacts/marketing-consent",
    "DELETE contacts/[id]",
  ])
    assert.deepEqual(keysOf(route).sort(), ["conversations", "inbox", "people", "today"], route);
  // What a thread does not carry re-reads People alone.
  assert.deepEqual(keysOf("PUT contacts/[id]/receptionist"), ["people"]);
});

test("a partner joining a workspace goes through the map, the switcher's list and the partner's count", () => {
  assert.deepEqual(keysOf("POST partner/invitations/[id]/accept").sort(), ["partner", "workspace"]);
  assert.deepEqual(keysOf("POST billing/start-now").sort(), ["billing", "setup"]);
});
