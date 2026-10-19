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
// The address a page is at, which what Reports shows is read from (the days a member picked are the address's own). A page that draws
// none of the lenses' reads, the overview or the headline: the Overview draws the Campaigns lens's (ROUTE_DRAWS) and Today owns the
// headline (surface-registry.ts), so a write made there reads them again at once, and the tests that name the surfaces a write
// re-reads from "elsewhere" are asked from here.
globalThis.location ??= { pathname: "/w/studio", hash: "#/inbox" };
const { ROUTES } = await importSrc("apps/dashboard/src/client/routes.generated.ts");
const refreshMap = await importSrc("apps/dashboard/src/legacy-bridge/refresh-map.ts");
const { AFTER, REFRESHES_NOTHING } = refreshMap;

const writes = Object.keys(ROUTES).filter((k) => ROUTES[k].method !== "GET");
const keysOf = (route) => AFTER[route]().map((o) => o.key);
/** The surfaces a write re-reads with `hash` on screen. */
function keysOn(hash, route) {
  const was = globalThis.location.hash;
  globalThis.location.hash = hash;
  try {
    return keysOf(route);
  } finally {
    globalThis.location.hash = was;
  }
}
/**
 * What Campaigns' two composers count over everyone in People: read where the page on screen draws them, left for the pages that
 * do elsewhere (S10-6). Who each audience a broadcast offers reaches is a surface of its own (audiences-surface.ts); Sent's runs
 * count nobody (the Inbox's run review, 18 Oct 2026).
 */
const COMPOSERS = ["audiences", "playbooks"];
/**
 * The page that draws each of them whole: who each audience reaches in New's Send once (Send once), the playbooks on
 * Campaigns' old address, since the composer's Every time went (the closed-loop audit of 17 Oct 2026, G); and Sent's runs, whose
 * Send by ticks the composer draws too.
 */
const PAGE_OF = {
  audiences: "#/campaigns/sequences/new:once",
  playbooks: "#/outbound",
  broadcasts: "#/campaigns/sequences/new:once",
};
/** Pages each row's surfaces are drawn on: a row whose surfaces are all read where they are drawn names one on some page. */
const PAGES = [
  "#/inbox",
  "#/today",
  "#/clients",
  "#/campaigns/sequences/new:once",
  "#/outbound",
  "#/calendar",
  "#/admin/workspace",
];

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
  for (const k of Object.keys(AFTER))
    assert.ok(
      PAGES.some((hash) => keysOn(hash, k).length > 0),
      `${k}: names no surface`,
    );
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
    for (const key of ["conversations", "inbox", "today"]) assert.ok(keys.includes(key), `${route}: ${key}`);
    // People's rows where a page draws them (its own, a person's, Today), and left for them from the Inbox: a name edit read every
    // page of the book behind it, wherever it was pressed (S4-6). Its pages read it once as they come on screen.
    assert.ok(keysOn("#/clients", route).includes("people"), `${route} on People: people`);
    assert.ok(keysOn("#/today", route).includes("people"), `${route} on Today: people`);
    assert.equal(keys.includes("people"), false, `${route} from the Inbox: People is left for its pages`);
  }
  // Their details carry the email address a campaign by email goes to, so the audiences read again with them where they are drawn:
  // the Inbox draws Sent's runs (the runs waiting for your word), which count nobody, and neither the audiences nor the playbooks.
  assert.deepEqual(keysOf("PUT contacts/[id]/details").sort(), ["conversations", "inbox", "today"]);
  // What a thread does not carry re-reads People alone.
  assert.deepEqual(keysOf("PUT contacts/[id]/receptionist"), ["people"]);
});

test("a booking email held for a look and dismissed re-reads the Calendar, whose read carries the list; read again is a job, and re-reads nothing", () => {
  // The fold under Settings › Business and the board's card both draw the held list from the Calendar's read (00345),
  // so the write names that surface here: the fold asks for no read of its own.
  assert.deepEqual(keysOf("POST calendar/notices/[id]/dismiss"), ["calendar"]);
  // Read again schedules a booking_read job and changes no row the Calendar reads: a read made when the job is only scheduled
  // shows the list as it was, and the visit the job makes is told to the Calendar by the appointments notice.
  assert.ok("POST calendar/notices/[id]/read-again" in REFRESHES_NOTHING);
  assert.equal("POST calendar/notices/[id]/read-again" in AFTER, false);
});

test("a press on a call in progress re-reads nothing: the provider changes the call, and the calls notice reads Live then", () => {
  // Live reads the calls and the channels. A whisper, an end and a hand-over ask the phone provider and record a decision; the call's
  // row moves with the provider's webhook, which the live feed tells a workspace of (WATCHED calls), so a read made when the provider
  // has only just answered shows the call as it was.
  for (const route of ["POST calls/[id]/whisper", "POST calls/[id]/end", "POST calls/[id]/hand-over"]) {
    assert.ok(route in REFRESHES_NOTHING, `${route} is decided: it refreshes nothing`);
    assert.equal(route in AFTER, false, `${route} is not also in the map`);
  }
});

test("REGRESSION: a write that changes who a campaign reaches re-reads the pages that count it -- a yes recorded, then New message, showed the old audience", () => {
  // Who a broadcast or a playbook reaches is counted from people's answers and from who exists (the composers' audience
  // counts, the playbooks' "N will get it"), and the Campaigns lens counts the yeses and stops after a campaign (its own read, below;
  // the report's own no longer counts them, so these writes do not re-read it). Each write that moves one of those
  // re-reads the surfaces that count by it, with whatever it re-read before: People always, the composers where the page on screen
  // draws them (PAGE_OF), and nowhere else, where they are left for the pages that draw them (S10-6): Campaigns' landing,
  // Sequences' list, draws neither.
  const counted = COMPOSERS;
  const answers = [
    "PUT contacts/[id]/consent",
    "PUT contacts/[id]/marketing-consent",
    "PUT contacts/consent",
    "PUT contacts/marketing-consent",
  ];
  for (const route of answers) {
    for (const key of counted) {
      const on = keysOn(PAGE_OF[key], route);
      assert.ok(on.includes(key), `${route} re-reads ${key} on ${PAGE_OF[key]}: ${on}`);
    }
    const keys = keysOn("#/campaigns/sequences/new:once", route);
    assert.equal(keys.includes("playbooks"), false, `${route}: New's Send once draws no playbook`);
    const landing = keysOn("#/campaigns", route);
    for (const key of counted)
      assert.equal(landing.includes(key), false, `${route} on Campaigns' landing: ${key} is left for its pages`);
    assert.equal(keys.includes("reports"), false, `${route}: the report's own read no longer counts a yes or a stop`);
    const away = keysOn("#/admin/profile", route);
    for (const key of counted)
      assert.equal(away.includes(key), false, `${route} from Settings: ${key} is left for its pages`);
    // People's rows the same way (S4-6): read on its pages, left for them from Campaigns and Settings, which draw none of them.
    assert.ok(keysOn("#/clients", route).includes("people"), `${route} on People: its rows`);
    for (const page of [keys, away])
      assert.equal(page.includes("people"), false, `${route}: People is left for its pages`);
  }
  assert.equal(keysOf("POST contacts/[id]/merge").includes("reports"), false, "nor does the merge of two records");
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
    for (const key of counted) {
      const on = keysOn(PAGE_OF[key], route);
      assert.ok(on.includes(key), `${route} re-reads ${key} on ${PAGE_OF[key]}: ${on}`);
    }
    assert.ok(keysOn("#/clients", route).includes("people"), `${route} on People: people`);
  }
  // A playbook made, changed or removed, and the class that lets the follow-up send, move what People's rows say of it
  // (their `follow_up`): a playbook's write wherever it is made, a class's on People's pages (kept for them elsewhere, where the
  // feed's notice of the rules reaches People by table: W-review-facts-rules-9).
  for (const route of ["POST playbooks", "PUT playbooks/[id]", "DELETE playbooks/[id]"]) {
    assert.ok(keysOf(route).includes("people"), `${route} re-reads people: ${keysOf(route)}`);
  }
  assert.ok(keysOn("#/clients", "PUT policies").includes("people"), "PUT policies, on People");
  assert.equal(keysOf("PUT policies").includes("people"), false, "PUT policies, not from the Inbox");
  // And each keeps what it re-read before.
  assert.ok(keysOf("PUT policies").includes("settings"));
  assert.ok(keysOf("POST playbooks").includes("playbooks"), "playbooks");
  for (const key of ["playbooks", "reach_outs"])
    assert.ok(keysOf("PUT playbooks/[id]").includes(key), `PUT playbooks/[id]: ${key}`);
  // A campaign saved makes no run: Sent's runs read no campaign, and are not read for one (reads-are-heard's rows read what they
  // can change).
  for (const route of ["POST playbooks", "PUT playbooks/[id]"])
    assert.equal(keysOf(route).includes("broadcasts"), false, `${route} reads Sent's runs for nothing`);
});

test("a partner joining a workspace goes through the map, the switcher's list and the partner's count", () => {
  assert.deepEqual(keysOf("POST partner/invitations/[id]/accept").sort(), ["partner", "workspace"]);
  assert.deepEqual(keysOf("POST billing/start-now").sort(), ["billing", "setup"]);
});

test("REGRESSION: taking an email or text version away re-reads what saving one does -- the composers kept the channel open", () => {
  // The Send by row closes a channel its message has no version on, and the preview draws a person as that version
  // reads. Both composers are made of the settings read now (offered-templates.ts), so the read that moves them is Settings';
  // a delete that re-read nothing the composers follow left the channel ticked. (templates-are-read-once.test.mjs runs the
  // composers over a version taken away.)
  const saved = keysOf("POST templates/versions");
  for (const key of ["settings", "playbooks"]) assert.ok(saved.includes(key), `${key}: ${saved}`);
  assert.equal(
    saved.includes("broadcasts"),
    false,
    "Sent's composer is made of the settings read and reads no template itself",
  );
  assert.deepEqual(keysOf("DELETE templates/versions/[id]"), saved, "one list for the two writes");
});

test("a template written, hidden, removed, added from a starter or synced re-reads Settings alone: the one read of the templates, which every picker is made of", () => {
  for (const route of [
    "POST templates",
    "PUT templates/[id]",
    "DELETE templates/[id]",
    "POST templates/starter",
    "POST templates/sync",
  ])
    assert.deepEqual(keysOf(route), ["settings"], route);
  // A playbook named by a starter files its message too, so the Library moves with it, beside the playbooks and People's rows.
  assert.ok(keysOf("POST playbooks").includes("settings"), "POST playbooks");
  // No window hook is called behind a write any more: the map holds no second table.
  assert.equal(
    Object.hasOwn(refreshMap, "HOOKS"),
    false,
    "HOOKS went with __refreshBroadcasts and the template rows' hook calls",
  );
});

test("REGRESSION: a broadcast made re-reads Playbooks with Broadcasts, as approving or cancelling a run does", () => {
  assert.deepEqual(keysOf("POST broadcasts").sort(), ["broadcasts", "playbooks"]);
});

test("a write that changes what a channel can send re-reads the composers and People's reach", () => {
  // The number, the text line, the mailbox and the postal address an offer by email names are what channels-ready.ts
  // reads; each has its writer in this table, and each moves the three surfaces that show the readiness, each where the page on
  // screen draws it (PAGE_OF, People's pages its reach) and left for those pages from Settings, where these writes are made
  // (S10-6, S4-6).
  const moved = [...COMPOSERS, "broadcasts"];
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
    for (const key of moved) {
      const on = keysOn(PAGE_OF[key], route);
      assert.ok(on.includes(key), `${route} re-reads ${key} on ${PAGE_OF[key]}: ${on}`);
    }
    const away = keysOn("#/admin/integrations", route);
    for (const key of [...moved, "people"])
      assert.equal(away.includes(key), false, `${route} from Settings: ${key} is left`);
    assert.ok(keysOn("#/clients", route).includes("people"), `${route} on People: its reach`);
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
  assert.ok(watchedTables().includes("sequence_batches"), "the database tells a workspace about its runs");
  const change = (table) => ({ table, event: "INSERT", row: {} });
  for (const route of ["POST broadcasts", "POST playbooks"]) {
    for (const o of AFTER[route]().filter((s) => s.key === "broadcasts" || s.key === "playbooks")) {
      assert.equal(wantsRefresh(o, "sequence_batches"), true, `${o.key} listens for runs`);
      assert.equal(
        wantsRefresh(o, "sequence_batches", change("sequence_batches")),
        true,
        `${o.key}: heard on any page`,
      );
      assert.equal(wantsRefresh(o, "messages"), true, `${o.key}: the default tables still`);
      assert.equal(wantsRefresh(o, "sequence_sends"), false, `${o.key}: a run's people are read when it opens`);
    }
  }
});

test("a playbook paused, renamed or retimed in another tab is heard where Campaigns draws it: the playbooks and the reach-outs surfaces, which hear a run made or moved too (00376)", async () => {
  const { wantsRefresh } = await importSrc("apps/dashboard/src/legacy-bridge/surface-realtime.ts");
  const { watchedTables } = await importSrc("packages/db/src/realtime.ts");
  const { playbooksOverride } = await importSrc("apps/dashboard/src/surfaces/campaigns/playbooks/surface.ts");
  const { reachOutsOverride } = await importSrc("apps/dashboard/src/surfaces/campaigns/reach-out/surface.ts");
  assert.ok(
    watchedTables().includes("sequence_steps") && watchedTables().includes("sequences"),
    "the database tells a workspace about its playbooks",
  );
  const change = (table) => ({ table, event: "UPDATE", row: {} });
  for (const o of [playbooksOverride, reachOutsOverride]) {
    for (const table of ["sequences", "sequence_steps", "sequence_batches"]) {
      assert.equal(wantsRefresh(o, table), true, `${o.key} hears ${table}`);
      assert.equal(wantsRefresh(o, table, change(table)), true, `${o.key}: ${table} heard on any page`);
    }
  }
  // A message is no chain's: the chains' read never hears one.
  for (const table of ["messages", "conversations", "escalations"])
    assert.equal(wantsRefresh(reachOutsOverride, table), false, `reach_outs: ${table} is not its`);
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
  assert.deepEqual(
    keysOf("POST google/link"),
    ["google", "setup", "settings"],
    "beside Google's own, Setup's row and Settings' review link (S1-4)",
  );
  assert.deepEqual(keysOf("PATCH workspaces"), ["settings", "people", "today", "broadcasts"]);
  held();
  assert.deepEqual(
    keysOf("POST google/reviews/[id]/reply"),
    ["reports_reviews"],
    "the lens's read carries Google's own, and publishes it",
  );
  assert.notEqual(surfaceValue("reports_reviews"), undefined, "a reply forgets nothing: the lens is on screen");
  // The reply mode is in the lens's read: a mode saved where the lens is on screen reads it at once, and anywhere else forgets it, read
  // as the lens comes on screen (W-review-facts-rules-9: Autonomy read the lens nobody had open).
  held();
  assert.ok(keysOn("#/reports/reviews", "PUT policies").includes("reports_reviews"), "read on the lens");
  held();
  assert.equal(keysOf("PUT policies").includes("reports_reviews"), false, "not read from the Inbox");
  assert.equal(surfaceValue("reports_reviews"), undefined, "but what it held is dropped");
  assert.equal(reviews.isStale(), true, "so the lens reads it as it comes on screen");
  // A draft and a search change nothing the lens counts.
  for (const route of ["POST google/reviews/[id]/draft", "POST google/search"])
    assert.ok(route in REFRESHES_NOTHING, route);
});

test("the Reviews lens's read repaints on the tables of the live feed that move it, and on no table the feed does not tell a workspace of", async () => {
  const { reviewsOverride } = await importSrc("apps/dashboard/src/surfaces/reports/reviews-surface.ts");
  const { wantsRefresh } = await importSrc("apps/dashboard/src/legacy-bridge/surface-realtime.ts");
  const { watchedTables } = await importSrc("packages/db/src/realtime.ts");
  // And the rule the reply box's choice is (the wiring's second audit, W-review-facts-rules-8).
  assert.deepEqual(reviewsOverride.refreshOnTables, [
    "google_reviews",
    "google_listings",
    "google_connections",
    "policies",
  ]);
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
  assert.deepEqual(keysOf("PATCH workspaces"), ["settings", "people", "today", "broadcasts"]);
  for (const key of ["settings", "calendar", "setup"])
    assert.ok(keysOf("PUT settings").includes(key), `PUT settings re-reads ${key}`);
  assert.equal(
    keysOf("PUT settings").includes("today"),
    false,
    "Today's five reads (the day's metrics, the threads, the escalations, the calls, the searches) draw no configuration",
  );
  // The two writes that carry the hours are one list: the first receptionist writes its profile's hours, a save writes them too.
  // A save alone may rename the business (00439), so it alone reads the workspace again.
  assert.deepEqual(
    keysOf("POST settings/receptionist"),
    keysOf("PUT settings").filter((key) => key !== "workspace"),
  );
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
        const before = surfaceValue("reports_receptionist");
        const keys = keysOf(route);
        assert.equal(
          keys.filter((k) => k === "reports_receptionist").length,
          1,
          `${route} on ${hash}: the lens is read again, once, by name`,
        );
        assert.equal(
          surfaceValue("reports_receptionist"),
          before,
          `${route}: and what it shows stays on screen while it is read again, the periods it held dropped (outdate)`,
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

test("the Receptionist lens's read repaints on the tables of the live feed that move it (its links booked are visits), 800 ms after the last change, and on no table the feed does not tell a workspace of", async () => {
  const { receptionistOverride } = await importSrc("apps/dashboard/src/surfaces/reports/receptionist-surface.ts");
  const { wantsRefresh } = await importSrc("apps/dashboard/src/legacy-bridge/surface-realtime.ts");
  const { watchedTables } = await importSrc("packages/db/src/realtime.ts");
  assert.deepEqual(receptionistOverride.refreshOnTables, [
    "messages",
    "escalations",
    "calls",
    "appointments",
    "contacts",
    "tenant_config",
  ]);
  assert.equal(receptionistOverride.debounceMs, 800);
  for (const table of receptionistOverride.refreshOnTables)
    assert.ok(watchedTables().includes(table), `${table}: the feed tells of it`);
  // Which page hears them is the rule `refreshWhen` holds, run on the real routes in message-fan-out.test.mjs.
  for (const table of receptionistOverride.refreshOnTables)
    assert.equal(wantsRefresh(receptionistOverride, table), true, table);
  for (const table of ["conversations", "google_reviews", "google_listings", "events"])
    assert.equal(wantsRefresh(receptionistOverride, table), false, `${table}: not the lens's`);
  assert.equal(receptionistOverride.refreshOnMessageInserts, undefined, "it names its tables");
});

/**
 * The writes that change what the People lens counts: who is in the book (a lead converted is a person added), a yes or a stop recorded,
 * an address changed (a stopped one is cleared), the steps, a channel opened or closed or the postal address an offer by email names
 * (who can receive offers) and the zone (its days). The lens's read is dropped by each and read as the lens comes on screen.
 */
const PEOPLE_WRITES = [
  // A yes or a stop, for one person or many, and two records made one (consentWrite).
  "PUT contacts/[id]/consent",
  "PUT contacts/[id]/marketing-consent",
  "PUT contacts/consent",
  "PUT contacts/marketing-consent",
  "POST contacts/[id]/merge",
  // Who is in the book.
  "DELETE contacts/[id]",
  "POST contacts",
  "POST contacts/import",
  "POST leads/[id]/stage",
  // An address changed clears a stopped one.
  "PUT contacts/[id]/details",
  // Steps: written, done, removed, decided from a suggestion, and the bulk write.
  "POST contacts/[id]/notes",
  "POST contacts/[id]/notes/done",
  "POST contacts/[id]/notes/remove",
  "POST contacts/[id]/notes/decide",
  "PUT contacts/notes",
  // A channel opened or closed moves who can receive offers (readiness).
  "POST channels/whatsapp/connect",
  "POST lines/buy",
  "POST lines/retry",
  "POST lines/register",
  "POST mailboxes",
  "PUT mailboxes/[id]",
  // A settings save carries the postal address an offer by email names (ChannelsReady), so offers_ok moves with it; so does the first
  // receptionist's, the same list.
  "PUT settings",
  "POST settings/receptionist",
  // The zone moves the days.
  "PATCH workspaces",
];
/**
 * Writes that move nothing the lens counts: a conversation's (a reply, a hold, a snooze), a resolved escalation, a reply mode, a
 * playbook. A reply reaches no one new and a hold moves no step, so `thread()` does not name the lens.
 */
const LEAVES_PEOPLE = [
  "POST conversations/[id]/reply",
  "POST escalations/[id]/resolve",
  "POST conversations/[id]/take-over",
  "POST conversations/[id]/hand-back",
  "POST conversations/[id]/snooze",
  "POST conversations/[id]/wake",
  "POST conversations/[id]/archive",
  "POST messages/[id]/steer",
  "POST messages/[id]/cancel-send",
  "PUT contacts/[id]/receptionist",
  "PUT policies",
  "POST broadcasts",
  "POST google/link",
];

test("a write that changes who is in the book, what they answered, their steps, a channel, a settings save or the zone makes the People lens's read forgotten, not read from the page it was made on; a conversation's write, a reply and a hold leave it", async () => {
  // None is made from the lens, and the live feed tells it of the messages, calls and notes that move it while it is open, not of
  // these: so its read is dropped (as a template written is for the Inbox) and read as the lens comes on screen.
  const { reportsPeople } = await importSrc("apps/dashboard/src/surfaces/reports/people-surface.ts");
  const { setSurfaceValue, surfaceValue } = await importSrc("apps/dashboard/src/surfaces/surface-values.ts");
  const held = () => setSurfaceValue("reports_people", { dto: {}, key: "30d" });
  try {
    for (const route of PEOPLE_WRITES) {
      held();
      const keys = keysOf(route);
      assert.equal(
        keys.includes("reports_people"),
        false,
        `${route} does not read the People lens's read from where it was made: ${keys}`,
      );
      assert.equal(surfaceValue("reports_people"), undefined, `${route} drops what the lens held`);
      assert.equal(reportsPeople.isStale(), true, `${route}: so the lens reads it as it comes on screen`);
    }
    // Each keeps what it re-read before.
    assert.deepEqual(keysOf("PATCH workspaces"), ["settings", "people", "today", "broadcasts"]);
    assert.deepEqual(keysOf("PUT contacts/[id]/details").sort(), ["conversations", "inbox", "today"]);
    assert.deepEqual(keysOf("POST contacts/[id]/notes"), ["people"]);
    // People's reach where its pages draw it, and the Inbox is on screen here (S4-6).
    assert.deepEqual(keysOf("POST lines/buy").sort(), ["broadcasts", "setup"]);
    assert.deepEqual(keysOf("POST leads/[id]/stage"), ["leads", "people"]);
    // The playbooks where they are drawn, which the Inbox does not.
    for (const key of ["settings", "calendar", "setup", "broadcasts"])
      assert.ok(keysOf("PUT settings").includes(key), `PUT settings still re-reads ${key}`);
    assert.deepEqual(
      keysOf("POST settings/receptionist"),
      keysOf("PUT settings").filter((key) => key !== "workspace"),
      "the two writes that carry the hours are one list, and a save alone may rename the business",
    );
    for (const route of LEAVES_PEOPLE) {
      held();
      keysOf(route);
      assert.notEqual(surfaceValue("reports_people"), undefined, `${route} forgets nothing of the lens's`);
    }
  } finally {
    setSurfaceValue("reports_people", undefined);
  }
});

test("where the People lens is on screen, the same writes read it again at once, by name and once, over picked days too; the writes that leave it alone read nothing of it", async () => {
  // Off the lens it is read as it comes on screen (the test above); on it, forgetting alone would leave it saying "coming" for good,
  // since the feed is told of none of these writes.
  const { reportsPeople } = await importSrc("apps/dashboard/src/surfaces/reports/people-surface.ts");
  const { setSurfaceValue, surfaceValue } = await importSrc("apps/dashboard/src/surfaces/surface-values.ts");
  const was = globalThis.location.hash;
  try {
    for (const hash of ["#/reports/people", "#/reports/people:2026-09-01~2026-09-20"]) {
      globalThis.location.hash = hash;
      for (const route of PEOPLE_WRITES) {
        setSurfaceValue("reports_people", { dto: {}, key: "30d" });
        const before = surfaceValue("reports_people");
        const keys = keysOf(route);
        assert.equal(
          keys.filter((k) => k === "reports_people").length,
          1,
          `${route} on ${hash}: the lens is read again, once, by name`,
        );
        assert.equal(
          surfaceValue("reports_people"),
          before,
          `${route}: and what it shows stays on screen while it is read again, the periods it held dropped (outdate)`,
        );
        assert.equal(reportsPeople.isStale(), true);
      }
      for (const route of LEAVES_PEOPLE) {
        setSurfaceValue("reports_people", { dto: {}, key: "30d" });
        assert.equal(keysOf(route).includes("reports_people"), false, `${route} on ${hash}: not read`);
        assert.notEqual(surfaceValue("reports_people"), undefined, `${route} on ${hash}: and nothing dropped`);
      }
    }
    // Another lens of Reports, or the Inbox: forgotten, not read.
    for (const hash of ["#/reports", "#/reports/receptionist", "#/reports/reviews", "#/reports/pipeline", "#/inbox"]) {
      globalThis.location.hash = hash;
      setSurfaceValue("reports_people", { dto: {}, key: "30d" });
      assert.equal(keysOf("POST contacts/import").includes("reports_people"), false, hash);
      assert.equal(surfaceValue("reports_people"), undefined, `${hash}: forgotten`);
    }
  } finally {
    globalThis.location.hash = was;
    setSurfaceValue("reports_people", undefined);
  }
});

test("the People lens's read repaints on the tables of the live feed that move it, a burst waited out as long as the runner allows, and on no table the feed does not tell a workspace of", async () => {
  const { reportsPeopleOverride } = await importSrc("apps/dashboard/src/surfaces/reports/people-surface.ts");
  const { wantsRefresh } = await importSrc("apps/dashboard/src/legacy-bridge/surface-realtime.ts");
  const { watchedTables } = await importSrc("packages/db/src/realtime.ts");
  assert.deepEqual(reportsPeopleOverride.refreshOnTables, [
    "messages",
    "calls",
    "person_notes",
    "contacts",
    "tenant_config",
    "tenant_channels",
    "lines",
    "mailboxes",
  ]);
  // Asked for five seconds; the runner never waits more than three after the first change (people-surface.test.mjs runs it).
  assert.equal(reportsPeopleOverride.debounceMs, 5_000);
  for (const table of reportsPeopleOverride.refreshOnTables)
    assert.ok(watchedTables().includes(table), `${table}: the feed tells of it`);
  // Which page hears them is the rule `refreshWhen` holds, run on the real routes in message-fan-out.test.mjs.
  for (const table of reportsPeopleOverride.refreshOnTables)
    assert.equal(wantsRefresh(reportsPeopleOverride, table), true, table);
  for (const table of ["conversations", "escalations", "google_reviews", "google_listings", "events"])
    assert.equal(wantsRefresh(reportsPeopleOverride, table), false, `${table}: not the lens's`);
  assert.equal(reportsPeopleOverride.refreshOnMessageInserts, undefined, "it names its tables");
  // A message's update (a send's tick) is no one reaching the business: only an arrival is heard.
  const update = { table: "messages", event: "UPDATE", row: { status: "delivered" } };
  assert.equal(wantsRefresh(reportsPeopleOverride, "messages", update), false, "a tick is not heard");
});

/**
 * The writes that change what the Campaigns lens says: a yes or a stop recorded and two records made one (the people it counts as
 * answers), a verb on a conversation (a reply or a resolved escalation moves "replies waiting on you"), a run made, approved, skipped
 * or moved (the funnel and "runs waiting"), a number connected or its standing, a line or the mailbox opened, a settings save, a lead's
 * stage written (the Reach-outs' Booked and Said no are state on the lead), and the zone (its days). The lens's read is dropped by each
 * and read as the page that draws it comes on screen.
 */
const CAMPAIGNS_WRITES = [
  // A yes or a stop, for one person or many, and two records made one (consentWrite, through the threads it carries).
  "PUT contacts/[id]/consent",
  "PUT contacts/[id]/marketing-consent",
  "PUT contacts/consent",
  "PUT contacts/marketing-consent",
  "POST contacts/[id]/merge",
  // A verb on a conversation: a reply or a resolved escalation moves "replies waiting on you" (thread()).
  "POST conversations/[id]/reply",
  "POST escalations/[id]/resolve",
  "POST conversations/[id]/take-over",
  "POST conversations/[id]/hand-back",
  "POST conversations/[id]/snooze",
  "POST conversations/[id]/wake",
  "POST conversations/[id]/archive",
  "POST messages/[id]/steer",
  "POST messages/[id]/cancel-send",
  // A run made, approved, skipped or moved (runs()).
  "POST broadcasts",
  "POST broadcasts/[id]/approve",
  "POST broadcasts/[id]/cancel",
  "POST broadcasts/[id]/recheck",
  "POST playbooks",
  "PUT playbooks/[id]",
  "DELETE playbooks/[id]",
  "POST playbooks/[id]/run",
  // A number connected or its standing, a line or the mailbox opened, a settings save (channelChange(); the standing's own entry).
  "POST channels/whatsapp/connect",
  "POST channels/whatsapp/standing",
  "POST lines/buy",
  "POST lines/retry",
  "POST lines/register",
  "POST mailboxes",
  "PUT mailboxes/[id]",
  "PUT settings",
  "POST settings/receptionist",
  // The zone moves the days.
  "PATCH workspaces",
  // A lead's stage written (said no, not a fit, contacted, converted), in one or many, or such a write undone: the Reach-outs part
  // counts Said no from the lead's closed reason, as it stands now (leadsAnswered).
  "POST leads/[id]/stage",
  "POST leads/bulk",
  "POST lead-operations/[id]/undo",
];
/** Writes that move nothing the lens says: a notification setting, a deal (the report's own Deals section), who is in the book, a policy, a listing. */
const LEAVES_CAMPAIGNS = [
  "PUT notifications",
  "POST contacts/[id]/deal",
  "POST contacts",
  "POST contacts/import",
  "PUT policies",
  "POST google/link",
  "PUT contacts/[id]/receptionist",
  "POST contacts/[id]/notes",
];

test("a write that changes a yes or a stop, who waits on you, a run, the number or the zone makes the Campaigns lens's read forgotten, not read from the page it was made on; a notification setting and a deal leave it, and a yes or a stop no longer re-reads the report's own", async () => {
  // None is made from the lens, and the live feed tells it of the messages, conversations, escalations and runs that move it while
  // the lens is open, not of these: so its read is dropped (as a template written is for the Inbox) and read as its page comes on screen.
  const { reportsCampaigns } = await importSrc("apps/dashboard/src/surfaces/reports/campaigns-surface.ts");
  const { setSurfaceValue, surfaceValue } = await importSrc("apps/dashboard/src/surfaces/surface-values.ts");
  const held = () =>
    setSurfaceValue("reports_campaigns", { campaigns: null, ledger: null, reachOuts: null, key: "30d" });
  try {
    for (const route of CAMPAIGNS_WRITES) {
      held();
      const keys = keysOf(route);
      assert.equal(
        keys.includes("reports_campaigns"),
        false,
        `${route} does not read the Campaigns lens's read from where it was made: ${keys}`,
      );
      assert.equal(surfaceValue("reports_campaigns"), undefined, `${route} drops what the lens held`);
      assert.equal(reportsCampaigns.isStale(), true, `${route}: so its page reads it as it comes on screen`);
    }
    // Each keeps what it re-read before.
    assert.deepEqual(keysOf("POST conversations/[id]/reply"), ["inbox", "conversations", "today"]);
    assert.deepEqual(keysOf("POST broadcasts").sort(), ["broadcasts", "playbooks"]);
    assert.deepEqual(keysOf("POST broadcasts/[id]/approve").sort(), ["broadcasts", "playbooks", "reach_outs"]);
    assert.deepEqual(keysOf("PATCH workspaces"), ["settings", "people", "today", "broadcasts"]);
    // Meta's word on the number is the channels read's (R6), which Connections, the Library and the composers are made of.
    assert.deepEqual(keysOf("POST channels/whatsapp/standing"), ["channels"]);
    // People's reach where its pages draw it, and the Inbox is on screen here (S4-6).
    assert.deepEqual(keysOf("POST lines/buy").sort(), ["broadcasts", "setup"]);
    // A lead's stage, in one or many, and its undo: the Leads page (and People, for a stage that converts) as before; an
    // undo also takes an add back off a reach-out's list and its waiting run (00426).
    assert.deepEqual(keysOf("POST leads/[id]/stage"), ["leads", "people"]);
    assert.deepEqual(keysOf("POST leads/bulk"), ["leads"]);
    assert.deepEqual(keysOf("POST lead-operations/[id]/undo"), ["leads", "reach_outs", "broadcasts"]);
    // The playbooks where they are drawn, which the Inbox does not.
    for (const key of ["settings", "calendar", "setup", "broadcasts"])
      assert.ok(keysOf("PUT settings").includes(key), `PUT settings still re-reads ${key}`);
    // A yes or a stop, and a merge, are the lens's and the People lens's now, not the report's own: the report no longer counts them.
    for (const route of CAMPAIGNS_WRITES.slice(0, 5)) {
      const keys = keysOf(route);
      for (const key of ["conversations", "inbox", "today"])
        assert.ok(keys.includes(key), `${route} still re-reads ${key}: ${keys}`);
      // Sent's runs count nobody: a yes or a stop moves no run, and the audiences they do move are not drawn on the Inbox.
      assert.equal(keys.includes("broadcasts"), false, `${route} reads Sent's runs for nothing: ${keys}`);
      assert.equal(keys.includes("reports"), false, `${route}: consentWrite no longer names the report's own read`);
    }
    // A deal is the report's own Deals section, and nothing the lens says: read where the overview is on screen and forgotten
    // elsewhere (a-visit-reaches-every-reader.test.mjs runs both).
    const was = globalThis.location.hash;
    try {
      globalThis.location.hash = "#/reports";
      assert.ok(
        keysOf("POST contacts/[id]/deal").includes("reports"),
        "a deal still re-reads the report's Deals section, where Reports is on screen",
      );
    } finally {
      globalThis.location.hash = was;
    }
    assert.equal(
      keysOf("POST contacts/[id]/deal").includes("reports"),
      false,
      "and does not read it from a page that does not draw it",
    );
    for (const route of LEAVES_CAMPAIGNS) {
      held();
      keysOf(route);
      assert.notEqual(surfaceValue("reports_campaigns"), undefined, `${route} forgets nothing of the lens's`);
    }
  } finally {
    setSurfaceValue("reports_campaigns", undefined);
  }
});

test("where the Campaigns lens or the Overview is on screen, the same writes read it again at once, by name and once, over picked days too; elsewhere it is forgotten and not read; the writes that leave it alone read nothing of it", async () => {
  // Off its pages it is read as they come on screen (the test above); on them, forgetting alone would leave it saying "coming" for
  // good, since the feed is told of none of these writes. The Overview draws it for one fact (ROUTE_DRAWS), so it is one of its pages.
  const { reportsCampaigns } = await importSrc("apps/dashboard/src/surfaces/reports/campaigns-surface.ts");
  const { setSurfaceValue, surfaceValue } = await importSrc("apps/dashboard/src/surfaces/surface-values.ts");
  const held = () =>
    setSurfaceValue("reports_campaigns", { campaigns: null, ledger: null, reachOuts: null, key: "30d" });
  const was = globalThis.location.hash;
  try {
    for (const hash of [
      "#/reports/campaigns",
      "#/reports/campaigns:2026-09-01~2026-09-20",
      "#/reports",
      "#/reports/2026-09-01~2026-09-20",
    ]) {
      globalThis.location.hash = hash;
      for (const route of CAMPAIGNS_WRITES) {
        held();
        const before = surfaceValue("reports_campaigns");
        const keys = keysOf(route);
        assert.equal(
          keys.filter((k) => k === "reports_campaigns").length,
          1,
          `${route} on ${hash}: the surface is read again, once, by name: ${keys}`,
        );
        assert.equal(
          surfaceValue("reports_campaigns"),
          before,
          `${route}: and what it shows stays on screen while it is read again, the periods it held dropped (outdate)`,
        );
        assert.equal(reportsCampaigns.isStale(), true);
      }
      for (const route of LEAVES_CAMPAIGNS) {
        held();
        assert.equal(keysOf(route).includes("reports_campaigns"), false, `${route} on ${hash}: not read`);
        assert.notEqual(surfaceValue("reports_campaigns"), undefined, `${route} on ${hash}: and nothing dropped`);
      }
    }
    // Another lens of Reports, or the Inbox: forgotten, not read.
    for (const hash of [
      "#/reports/receptionist",
      "#/reports/people",
      "#/reports/reviews",
      "#/reports/pipeline",
      "#/inbox",
    ]) {
      globalThis.location.hash = hash;
      held();
      assert.equal(keysOf("POST conversations/[id]/reply").includes("reports_campaigns"), false, hash);
      assert.equal(surfaceValue("reports_campaigns"), undefined, `${hash}: forgotten`);
    }
  } finally {
    globalThis.location.hash = was;
    setSurfaceValue("reports_campaigns", undefined);
  }
});

test("the Campaigns lens's read repaints on the tables of the live feed that move it, a burst waited out as long as the runner allows, never on a delivery receipt, and on no table the feed does not tell a workspace of", async () => {
  const { reportsCampaignsOverride } = await importSrc("apps/dashboard/src/surfaces/reports/campaigns-surface.ts");
  const { wantsRefresh } = await importSrc("apps/dashboard/src/legacy-bridge/surface-realtime.ts");
  const { watchedTables } = await importSrc("packages/db/src/realtime.ts");
  assert.deepEqual(reportsCampaignsOverride.refreshOnTables, [
    "messages",
    "conversations",
    "escalations",
    "sequence_batches",
    "sequence_replies",
    "tenant_channels",
    "mailboxes",
    "mailbox_connections",
    "contacts",
    "templates",
    "deals",
  ]);
  // Asked for five seconds; the runner never waits more than three after the first change (campaigns-surface.test.mjs runs it).
  assert.equal(reportsCampaignsOverride.debounceMs, 5_000);
  for (const table of reportsCampaignsOverride.refreshOnTables)
    assert.ok(watchedTables().includes(table), `${table}: the feed tells of it`);
  // Which page hears them is the rule `refreshWhen` holds, run on the real routes in message-fan-out.test.mjs.
  for (const table of reportsCampaignsOverride.refreshOnTables)
    assert.equal(wantsRefresh(reportsCampaignsOverride, table), true, table);
  for (const table of ["calls", "person_notes", "google_reviews", "google_listings", "events", "lines"])
    assert.equal(wantsRefresh(reportsCampaignsOverride, table), false, `${table}: not the lens's`);
  assert.equal(reportsCampaignsOverride.refreshOnMessageInserts, undefined, "it names its tables");
  // A message's update (a send's tick, a failure written late) is not heard: the lens reads the sends' receipts as it opens.
  for (const status of ["sent", "delivered", "read", "failed"]) {
    const update = { table: "messages", event: "UPDATE", row: { status } };
    assert.equal(
      wantsRefresh(reportsCampaignsOverride, "messages", update),
      false,
      `a message ${status}: a tick is not heard`,
    );
  }
});

test("a reach-out changed in place and a message version written or taken away read no lead; one made or removed reads Leads, whose rows say which reach-out each goes with (00426); a lead's own writes still do", () => {
  // The chain, its runs and its words are what these write (the trace of each route, shell/hearing/reads-are-heard.test.mjs, finds no
  // leads, lead_searches, lead_rounds or lead_search_members among them). An answer that moves a lead is the lead's own write.
  for (const route of ["POST reach-outs", "DELETE reach-outs/[id]"]) {
    const keys = keysOf(route);
    for (const key of ["reach_outs", "playbooks", "broadcasts", "leads"])
      assert.ok(keys.includes(key), `${route}: ${key}`);
  }
  for (const route of ["PUT reach-outs/[id]", "POST templates/versions", "DELETE templates/versions/[id]"]) {
    const keys = keysOf(route);
    assert.equal(keys.includes("leads"), false, `${route} reads Leads for nothing: ${keys}`);
    // A version moves the chain's words and the playbooks' counts; the runs a held send is in read no template, so Sent is not
    // read for it (the composer's messages are the settings read's: offered-templates.ts).
    const named = route.includes("templates/versions")
      ? ["reach_outs", "playbooks"]
      : ["reach_outs", "playbooks", "broadcasts"];
    for (const key of named) assert.ok(keys.includes(key), `${route}: ${key}`);
  }
  for (const route of [
    "POST leads/[id]/stage",
    "POST reach-outs/leads/[id]/stop",
    "POST reach-out-sends/[id]/decide",
    "POST reach-out-replies/[id]/undo",
  ])
    assert.ok(keysOf(route).includes("leads"), `${route} still moves the lead it is about`);
});

test("Not the same reads no list: the open person page reads itself again with the doubt gone, and no row of People carries a doubt", () => {
  assert.ok("POST contacts/[id]/doubts/dismiss" in REFRESHES_NOTHING, "decided as a write that re-reads no surface");
  assert.equal("POST contacts/[id]/doubts/dismiss" in AFTER, false, "and not also named to re-read People");
});

test("a person erased takes their messages, calls and threads with them: the report overview reads where drawn and forgets where not, and a merge re-reads the bell, whose lines it re-addresses", () => {
  const was = globalThis.location.hash;
  try {
    for (const [hash, drawn, notDrawn] of [
      ["#/reports", "reports", null],
      ["#/campaigns/sequences/new:once", null, "reports"],
      ["#/inbox", null, "reports"],
    ]) {
      globalThis.location.hash = hash;
      const keys = keysOf("DELETE contacts/[id]");
      if (drawn) assert.equal(keys.filter((k) => k === drawn).length, 1, `${hash}: ${drawn} is read once: ${keys}`);
      if (notDrawn) assert.equal(keys.includes(notDrawn), false, `${hash}: ${notDrawn} is not read from here: ${keys}`);
    }
    globalThis.location.hash = "#/inbox";
    assert.ok(keysOf("POST contacts/[id]/merge").includes("notifications"), "a merge re-addresses the bell's lines");
  } finally {
    globalThis.location.hash = was;
  }
});
