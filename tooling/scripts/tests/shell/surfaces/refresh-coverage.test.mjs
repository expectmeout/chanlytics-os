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

test("REGRESSION: taking an email or text version away re-reads what saving one does -- the composers kept the channel open", () => {
  // The Send by row closes a channel its message has no version on, and the preview draws a person as that version
  // reads: both composers read their surfaces, and a delete that re-read Settings alone left the channel ticked.
  const saved = keysOf("POST templates/versions");
  for (const key of ["settings", "playbooks", "broadcasts"]) assert.ok(saved.includes(key), `${key}: ${saved}`);
  assert.deepEqual(keysOf("DELETE templates/versions/[id]"), saved, "one list for the two writes");
});

test("REGRESSION: a broadcast made re-reads Playbooks with Broadcasts, as approving or cancelling a run does", () => {
  assert.deepEqual(keysOf("POST broadcasts").sort(), ["broadcasts", "playbooks"]);
});

test("a write that changes what a channel can send re-reads the composers and People's reach", () => {
  // The number, the text line, the mailbox and the postal address an offer by email names are what channels-ready.ts
  // reads; each has its writer in this table, and each moves the three surfaces that show the readiness.
  const moved = ["broadcasts", "playbooks", "people"];
  for (const route of [
    "PUT settings",
    "POST settings/receptionist",
    "POST channels/whatsapp/connect",
    "POST lines/buy",
    "POST lines/retry",
    "POST lines/register",
    "POST mailboxes",
    "PUT mailboxes/[id]",
  ]) {
    const keys = keysOf(route);
    for (const key of moved) assert.ok(keys.includes(key), `${route} re-reads ${key}: ${keys}`);
  }
  // A line's forwarding is the voice line's: it changes no channel a campaign goes by.
  assert.deepEqual(keysOf("POST lines/forwarding").sort(), ["settings", "setup"]);
});
