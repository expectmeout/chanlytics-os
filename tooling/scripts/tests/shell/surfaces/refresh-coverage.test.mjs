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
// The address a page is at, which what Reports shows is read from (the days a member picked are the address's own).
globalThis.location ??= { pathname: "/w/studio", hash: "#/reports" };
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
  // Their details carry the email address a campaign by email goes to, so the audiences read again with them.
  assert.deepEqual(keysOf("PUT contacts/[id]/details").sort(), [
    "broadcasts",
    "conversations",
    "inbox",
    "people",
    "playbooks",
    "today",
  ]);
  // What a thread does not carry re-reads People alone.
  assert.deepEqual(keysOf("PUT contacts/[id]/receptionist"), ["people"]);
});

test("a booking email held for a look, read again or dismissed, re-reads the Calendar, whose read carries the list", () => {
  // The fold under Settings › Business and the board's card both draw the held list from the Calendar's read (00345),
  // so the write names that surface here: the fold asks for no read of its own.
  for (const route of ["POST calendar/notices/[id]/read-again", "POST calendar/notices/[id]/dismiss"]) {
    assert.deepEqual(keysOf(route), ["calendar"], route);
  }
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
  // A person added, imported or deleted is on an audience or off it; an address added reaches them by email; and a
  // deal moved changes the deal lists and who a follow-up reaches.
  for (const route of [
    "POST contacts",
    "POST contacts/import",
    "DELETE contacts/[id]",
    "PUT contacts/[id]/details",
    "POST contacts/[id]/deal",
  ]) {
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

test("a write that moves the listing, its reviews or the day a review is counted on makes the Reviews lens's read forgotten, not read from the page it was made on; a reply posted, and a reply mode saved, name it", async () => {
  // The lens counts the reviews of a period by the day Google dates them in the workspace's zone, and who answered. Settings' Google verbs
  // and the zone are never made from the lens, so its read is dropped (as a template written is for the Inbox) and read as the lens comes
  // on screen. A reply is posted from the lens, and the live feed is told of a review's first sight, never of a reply, so it names the
  // surface itself; the receptionist's mode for reviews is in the answer, and decides whether a composer asks for a draft.
  const { reviews } = await importSrc("apps/dashboard/src/surfaces/reports/reviews-surface.ts");
  const { setSurfaceValue, surfaceValue } = await importSrc("apps/dashboard/src/surfaces/surface-values.ts");
  const held = () => setSurfaceValue("reports_reviews", { vm: {}, key: "30d" });
  for (const route of [
    "POST google/link",
    "DELETE google/link",
    "POST google/refresh",
    "POST google/locations",
    "DELETE google/connection",
    "PATCH workspaces",
  ]) {
    held();
    const keys = keysOf(route);
    assert.equal(
      keys.includes("reports_reviews"),
      false,
      `${route} does not read the Reviews lens's read from where it was made: ${keys}`,
    );
    assert.equal(surfaceValue("reports_reviews"), undefined, `${route} drops what the lens held`);
    assert.equal(reviews.isStale(), true, `${route}: so the lens reads it as it comes on screen`);
  }
  assert.deepEqual(keysOf("POST google/link"), ["google", "setup"], "beside Google's own and Setup's row");
  assert.deepEqual(keysOf("PATCH workspaces"), ["settings", "people", "reports", "reports_headline", "today"]);
  held();
  assert.deepEqual(
    keysOf("POST google/reviews/[id]/reply"),
    ["reports_reviews"],
    "the lens's read carries Google's own, and publishes it",
  );
  assert.notEqual(surfaceValue("reports_reviews"), undefined, "a reply forgets nothing: the lens is on screen");
  assert.ok(keysOf("PUT policies").includes("reports_reviews"), "the reply mode is in the lens's read");
  // A draft and a search change nothing the lens counts.
  for (const route of ["POST google/reviews/[id]/draft", "POST google/search"])
    assert.ok(route in REFRESHES_NOTHING, route);
});

test("the Reviews lens's read repaints on the tables of the live feed that move it, and on no table the feed does not tell a workspace of", async () => {
  const { reviewsOverride } = await importSrc("apps/dashboard/src/surfaces/reports/reviews-surface.ts");
  const { wantsRefresh } = await importSrc("apps/dashboard/src/legacy-bridge/surface-realtime.ts");
  const { watchedTables } = await importSrc("packages/db/src/realtime.ts");
  assert.deepEqual(reviewsOverride.refreshOnTables, ["google_reviews", "google_listings", "google_connections"]);
  for (const table of reviewsOverride.refreshOnTables)
    assert.ok(watchedTables().includes(table), `${table}: the feed tells of it`);
  // Which page hears them is the rule `refreshWhen` holds, run on the real routes in message-fan-out.test.mjs.
  for (const table of reviewsOverride.refreshOnTables) assert.equal(wantsRefresh(reviewsOverride, table), true, table);
  for (const table of ["messages", "conversations", "escalations", "google_listing_days", "events", "calls"])
    assert.equal(wantsRefresh(reviewsOverride, table), false, `${table}: not the lens's`);
  assert.equal(reviewsOverride.refreshOnMessageInserts, undefined, "a message moves no review");
});

test("a write that moves who waits on you, the zone's days or the hours and closures makes the Receptionist lens's read forgotten, not read from the page it was made on", async () => {
  // The lens says how many conversations wait on you (a reply or a resolved escalation moves it), counts its days in the workspace's
  // zone, and counts "while you were closed" by the hours and closures. None of those is written from the lens, so its read is
  // dropped (as a template written is for the Inbox) and read as the lens comes on screen; the live feed tells it of the messages,
  // escalations and calls that move it while the lens is open, and of none of these writes.
  const { receptionist } = await importSrc("apps/dashboard/src/surfaces/reports/receptionist-surface.ts");
  const { setSurfaceValue, surfaceValue } = await importSrc("apps/dashboard/src/surfaces/surface-values.ts");
  const held = () => setSurfaceValue("reports_receptionist", { dto: {}, key: "30d", readAt: 1 });
  const WRITES = [
    "POST conversations/[id]/reply",
    "POST escalations/[id]/resolve",
    "POST conversations/[id]/take-over",
    "POST conversations/[id]/hand-back",
    "POST conversations/[id]/snooze",
    "POST conversations/[id]/wake",
    "POST conversations/[id]/archive",
    "PATCH workspaces",
    "PUT settings",
    "POST settings/receptionist",
  ];
  for (const route of WRITES) {
    held();
    const keys = keysOf(route);
    assert.equal(
      keys.includes("reports_receptionist"),
      false,
      `${route} does not read the Receptionist lens's read from where it was made: ${keys}`,
    );
    assert.equal(surfaceValue("reports_receptionist"), undefined, `${route} drops what the lens held`);
    assert.equal(receptionist.isStale(), true, `${route}: so the lens reads it as it comes on screen`);
  }
  // Each keeps what it re-read before.
  assert.deepEqual(keysOf("POST conversations/[id]/reply"), ["inbox", "conversations", "today"]);
  assert.deepEqual(keysOf("PATCH workspaces"), ["settings", "people", "reports", "reports_headline", "today"]);
  for (const key of ["settings", "today", "calendar", "setup"])
    assert.ok(keysOf("PUT settings").includes(key), `PUT settings re-reads ${key}`);
  // The two writes that carry the hours are one list: the first receptionist writes its profile's hours, a save writes them too.
  assert.deepEqual(keysOf("POST settings/receptionist"), keysOf("PUT settings"));
  // A write that changes nothing the lens counts leaves what it holds alone.
  for (const route of ["POST google/link", "PUT policies", "POST broadcasts", "PUT contacts/[id]/receptionist"]) {
    held();
    keysOf(route);
    assert.notEqual(surfaceValue("reports_receptionist"), undefined, `${route} forgets nothing of the lens's`);
  }
  setSurfaceValue("reports_receptionist", undefined);
});

test("where the Receptionist lens is on screen, the same writes read it again at once: nothing else would, since the feed is told of none of them", async () => {
  // A verb on a conversation changes the conversation, which the lens is not told of; the zone and the hours are no table of the feed's.
  // Off the lens it is read as it comes on screen (the test above); on it, forgetting alone would leave it saying "coming" for good.
  const { receptionist } = await importSrc("apps/dashboard/src/surfaces/reports/receptionist-surface.ts");
  const { setSurfaceValue, surfaceValue } = await importSrc("apps/dashboard/src/surfaces/surface-values.ts");
  const was = globalThis.location.hash;
  try {
    for (const hash of ["#/reports/receptionist", "#/reports/receptionist:2026-09-01~2026-09-20"]) {
      globalThis.location.hash = hash;
      for (const route of [
        "POST conversations/[id]/reply",
        "POST escalations/[id]/resolve",
        "POST conversations/[id]/take-over",
        "POST conversations/[id]/hand-back",
        "POST conversations/[id]/snooze",
        "POST conversations/[id]/wake",
        "POST conversations/[id]/archive",
        "PATCH workspaces",
        "PUT settings",
        "POST settings/receptionist",
      ]) {
        setSurfaceValue("reports_receptionist", { dto: {}, key: "30d", readAt: 1 });
        const keys = keysOf(route);
        assert.equal(
          keys.filter((k) => k === "reports_receptionist").length,
          1,
          `${route} on ${hash}: the lens is read again, once, by name`,
        );
        assert.equal(
          surfaceValue("reports_receptionist"),
          undefined,
          `${route}: and what it held is dropped first, every period's`,
        );
        assert.equal(receptionist.isStale(), true);
      }
    }
    // Another lens of Reports, or the Inbox: forgotten, not read.
    for (const hash of ["#/reports", "#/reports/people", "#/reports/reviews", "#/inbox"]) {
      globalThis.location.hash = hash;
      setSurfaceValue("reports_receptionist", { dto: {}, key: "30d", readAt: 1 });
      assert.equal(keysOf("POST conversations/[id]/reply").includes("reports_receptionist"), false, hash);
      assert.equal(surfaceValue("reports_receptionist"), undefined, `${hash}: forgotten`);
    }
  } finally {
    globalThis.location.hash = was;
    setSurfaceValue("reports_receptionist", undefined);
  }
});

test("the Receptionist lens's read repaints on the tables of the live feed that move it, 800 ms after the last change, and on no table the feed does not tell a workspace of", async () => {
  const { receptionistOverride } = await importSrc("apps/dashboard/src/surfaces/reports/receptionist-surface.ts");
  const { wantsRefresh } = await importSrc("apps/dashboard/src/legacy-bridge/surface-realtime.ts");
  const { watchedTables } = await importSrc("packages/db/src/realtime.ts");
  assert.deepEqual(receptionistOverride.refreshOnTables, ["messages", "escalations", "calls"]);
  assert.equal(receptionistOverride.debounceMs, 800);
  for (const table of receptionistOverride.refreshOnTables)
    assert.ok(watchedTables().includes(table), `${table}: the feed tells of it`);
  // Which page hears them is the rule `refreshWhen` holds, run on the real routes in message-fan-out.test.mjs.
  for (const table of receptionistOverride.refreshOnTables)
    assert.equal(wantsRefresh(receptionistOverride, table), true, table);
  for (const table of ["conversations", "google_reviews", "google_listings", "events", "contacts"])
    assert.equal(wantsRefresh(receptionistOverride, table), false, `${table}: not the lens's`);
  assert.equal(receptionistOverride.refreshOnMessageInserts, undefined, "it names its tables");
});
