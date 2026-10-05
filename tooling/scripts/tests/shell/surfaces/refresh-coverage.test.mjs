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
  ]) {
    const keys = keysOf(route);
    for (const key of ["conversations", "inbox", "people", "today"]) assert.ok(keys.includes(key), `${route}: ${key}`);
  }
  assert.deepEqual(keysOf("PUT contacts/[id]/details").sort(), ["conversations", "inbox", "people", "today"]);
  // What a thread does not carry re-reads People alone.
  assert.deepEqual(keysOf("PUT contacts/[id]/receptionist"), ["people"]);
});

test("REGRESSION: a write that changes who a campaign reaches re-reads the pages that count it -- a yes recorded, then New message, showed the old audience", () => {
  // Who a broadcast or a playbook reaches is counted from people's answers and from who exists (the composers' audience
  // counts, the playbooks' "N will get it"), and Reports counts the yeses and stops. Each write that moves one of those
  // re-reads the surfaces that count by it, with whatever it re-read before.
  const counted = ["broadcasts", "playbooks"];
  const answers = [
    "PUT contacts/[id]/consent",
    "PUT contacts/[id]/marketing-consent",
    "PUT contacts/consent",
    "PUT contacts/marketing-consent",
  ];
  for (const route of answers) {
    const keys = keysOf(route);
    for (const key of [...counted, "reports", "people"])
      assert.ok(keys.includes(key), `${route} re-reads ${key}: ${keys}`);
  }
  // One list for the four, so an answer recorded for one person and for many cannot drift apart.
  for (const route of answers) assert.deepEqual(keysOf(route).sort(), keysOf(answers[0]).sort(), route);
  // A person added, imported or deleted is on an audience or off it.
  for (const route of ["POST contacts", "POST contacts/import", "DELETE contacts/[id]"]) {
    const keys = keysOf(route);
    for (const key of [...counted, "people"]) assert.ok(keys.includes(key), `${route} re-reads ${key}: ${keys}`);
  }
  // A playbook made, changed or removed, and the class that lets the follow-up send, move what People's rows say of it
  // (their `follow_up`).
  for (const route of ["POST playbooks", "PUT playbooks/[id]", "DELETE playbooks/[id]", "PUT policies"]) {
    assert.ok(keysOf(route).includes("people"), `${route} re-reads people: ${keysOf(route)}`);
  }
  // And each keeps what it re-read before.
  assert.ok(keysOf("PUT policies").includes("settings"));
  for (const key of ["playbooks", "broadcasts"]) assert.ok(keysOf("POST playbooks").includes(key), key);
  for (const key of ["playbooks", "broadcasts", "reach_outs"])
    assert.ok(keysOf("PUT playbooks/[id]").includes(key), `PUT playbooks/[id]: ${key}`);
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

test("a run made or moved is heard by Campaigns' two surfaces wherever the tab is: Today's Approve row is drawn from them", async () => {
  // The sweep makes a run on the edge, and a teammate approves or stops one in another tab (00321). Both surfaces hear
  // the table as their own, away from their pages too; a message, which only moves a run's replies, they still hear
  // on their own page alone (the table the on-screen rule names).
  const { wantsRefresh } = await importSrc("apps/dashboard/src/legacy-bridge/surface-realtime.ts");
  const { watchedTables } = await importSrc("packages/db/src/realtime.ts");
  assert.ok(watchedTables().includes("broadcasts"), "the database tells a workspace about its runs");
  const change = (table) => ({ table, event: "INSERT", row: {} });
  for (const route of ["POST broadcasts", "POST playbooks"]) {
    for (const o of AFTER[route]().filter((s) => s.key === "broadcasts" || s.key === "playbooks")) {
      assert.equal(wantsRefresh(o, "broadcasts"), true, `${o.key} listens for runs`);
      assert.equal(wantsRefresh(o, "broadcasts", change("broadcasts")), true, `${o.key}: heard on any page`);
      assert.equal(wantsRefresh(o, "messages"), true, `${o.key}: the default tables still`);
      assert.equal(wantsRefresh(o, "broadcast_recipients"), false, `${o.key}: a run's people are read when it opens`);
    }
  }
});
