/**
 * Sign out, and someone else signs in on the same tab: nothing the first person read, wrote or was about to do is there
 * for the second (the reviews of 28 Nov 2026: R3.12; lane 11's items 2 and 5).
 *
 * A front desk's computer is shared, and a sign-out loads a new page in the same tab, whose session storage the next
 * person's pages read. The rows the device kept were held by their own test since defect 52
 * (tests/shell/surfaces/sign-out-seals.test.mjs). This is the whole tab: filled as a morning's work fills it, each slot by
 * the module that writes it, signed out by the shell's own verb, and then read as the next person's pages would read it,
 * in another workspace and in the same one.
 *
 * In a file of its own: a sign-out closes the device's cache for the rest of the page's life, and so for this process.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { importSrc } from "../../_source.mjs";
import { until } from "../../shared/_until.mjs";
import { bridgeHolds, provided, surfaceValue } from "../_bridge-holds.mjs";
import { GLOW, HARBOR, aMorningInHarbor, tabWorld } from "./_tab-world.mjs";

const world = tabWorld();
const { installShell } = await importSrc("apps/dashboard/src/bridge/shell.ts");
let kept;

test("a sign-out leaves nothing of the workspace or of the person's words in the browser", async () => {
  kept = await aMorningInHarbor(world);
  assert.ok(world.saysHarbors().length >= 6, "the tab holds a morning's work in Harbor Moving");

  installShell(world.win);
  provided("shell").signOut();
  // The form is posted once the phone app has forgotten the phone, where there is one: at once here, or a turn on.
  await until(() => world.posted.length > 0, "the sign-out's form posted");
  assert.deepEqual(world.posted, ["/auth/signout"], "the session is ended by the form");

  // A read lands before the page unloads, and the hide writes what waits.
  bridgeHolds({ values: { inbox: { threads: [{ id: "th-2", who: "Harbor's newest customer" }] } } });
  kept.cache.snapshotSurface("inbox", HARBOR.id, undefined, "inbox");
  kept.cache.flushSurfaceCache();
  kept.flushReadCaches();
  world.hide();

  assert.deepEqual(
    world.saysHarbors(),
    [],
    "REGRESSION: something of the last person's workspace is still in the browser for whoever signs in next",
  );
});

test("the next person, in another workspace: no rows are drawn before their own are read", () => {
  world.win.location.pathname = `/w/${GLOW.slug}/inbox`;
  bridgeHolds({ values: { inbox: undefined } }, { fresh: true });
  assert.deepEqual([...kept.cache.hydrateSurfaceCache()], [], "nothing restored");
  assert.equal(surfaceValue("inbox"), undefined);
  assert.equal(kept.people.peek("p-1"), null, "no person the last one opened");
  assert.equal(kept.video.keptUploadOf("clip-1"), null, "no clip taken up where another workspace's stood");
});

test("the next person, in the same workspace: none of the last one's words, places or half-done work", () => {
  // A colleague at the same desk signs in to the same workspace: its rows are theirs to read, the last one's words are not.
  world.win.location.pathname = `/w/${HARBOR.slug}/inbox`;
  assert.deepEqual(
    [...kept.cache.hydrateSurfaceCache()],
    [],
    "the rows are read again, never drawn from the last session",
  );
  assert.equal(kept.memory.draft("reply", "th-1"), null, "no reply half-written");
  assert.equal(kept.memory.place("inbox", "all"), null, "no search left in the Inbox");
  assert.equal(
    kept.carried.takeCarriedReply("th-1"),
    null,
    "REGRESSION: a reply the last person carried to a thread was put in the next person's box",
  );
  assert.equal(kept.carried.takeCarriedDraft("th-1"), false, "and no draft asked for");
  assert.equal(world.tab.getItem("leads.pile.target"), null, "REGRESSION: the last person's pile still named on Leads");
  assert.equal(kept.people.peek("p-1"), null, "no person kept in the tab");
});
