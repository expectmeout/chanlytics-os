/**
 * A switch of workspace while a read of the first is still out: its answer lands nowhere the next page reads, and nothing
 * the tab kept of the first workspace is there for the second (the reviews of 28 Nov 2026: R3.12; lane 11's items 2 and 5).
 *
 * A switch seals what the device keeps and loads the second workspace's page in the same tab. Between the press and the
 * unload the first page is still running: a read lands, the runner keeps it, the page's hide writes what waits. And the
 * tab's own session is the next page's to read. So this fills a tab as a morning in one workspace fills it, each slot by
 * the module that writes it, starts a read, switches, lands the read and lets the page go, and then asks of everything the
 * browser still holds whether any of it says something of the first workspace's.
 *
 * In a file of its own: a switch closes the device's cache for the rest of the page's life, and so for this process.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { importSrc } from "../../_source.mjs";
import { bridgeHolds } from "../_bridge-holds.mjs";
import { GLOW, HARBOR, HARBORS, aMorningInHarbor, tabWorld } from "./_tab-world.mjs";

const world = tabWorld();
const data = await importSrc("apps/dashboard/src/bridge/surface-data.ts");

test("a switch with a read of the first workspace still out leaves nothing of it for the second", async () => {
  const kept = await aMorningInHarbor(world);
  assert.ok(world.saysHarbors().length >= 6, "the tab holds a morning's work in Harbor Moving");

  // A read of Harbor's is out as the switcher is pressed.
  let land = () => {};
  const out = kept.people.through("p-2", () => new Promise((answer) => (land = answer)));

  data.switchWorkspace(GLOW.id);
  assert.deepEqual(world.left, [["assign", `/w/${GLOW.slug}`]], "one load, to the second workspace");

  // Before the page unloads: the read lands, the runner keeps the Inbox it read again, and the hide writes what waits.
  land({ name: `${HARBORS} second person` });
  await out;
  bridgeHolds({ values: { inbox: { threads: [{ id: "th-2", who: `${HARBORS} newest customer` }] } } });
  kept.cache.snapshotSurface("inbox", HARBOR.id, undefined, "inbox");
  kept.cache.resnapshotSurface("inbox", HARBOR.id, "inbox");
  kept.cache.flushSurfaceCache();
  kept.flushReadCaches();
  world.hide();

  assert.deepEqual(
    world.saysHarbors(),
    [],
    "REGRESSION: something of the workspace left is still in the browser for the page of the one arrived at",
  );
  assert.equal(world.device.getItem("chanlytics.workspace"), GLOW.slug, "and the home returns to the second");
});

test("the second workspace's page finds none of it: no rows drawn, no reply waiting, no pile named, no clip taken up", () => {
  // The same tab, loaded at the second workspace's address.
  world.win.location.pathname = `/w/${GLOW.slug}/inbox`;
  assert.deepEqual(
    [...world.tab.all()].filter(([name]) => name === "leads.pile.target"),
    [],
    "no sequence named for a pile",
  );
  // The clip's address was kept for Harbor's upload: asked for in Glow, there is none, and the clip starts anew there.
  // (Still on the device under Harbor's own name until its four hours are up, for a reload there.)
  return importSrc("apps/dashboard/src/surfaces/files/video/send.ts").then((video) => {
    assert.equal(
      video.keptUploadOf("clip-1"),
      null,
      "REGRESSION: a clip added in the second workspace took up the first one's upload, and its bytes went there",
    );
    world.win.location.pathname = `/w/${HARBOR.slug}/inbox`;
    assert.equal(video.keptUploadOf("clip-1")?.id, "file-1", "kept for the workspace it was going to");
  });
});
