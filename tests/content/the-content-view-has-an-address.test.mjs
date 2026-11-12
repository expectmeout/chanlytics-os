/**
 * Campaigns › Content has one address (decision 0125), every workspace's. Connect Meta's switch is read off the config as
 * stored, by one function the edge and the dashboard both ask.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CONTENT_LIBRARY_ROUTE,
  CONTENT_ROUTE,
  contentPlaceOf,
  contentPreviewOf,
  contentRouteOf,
  isContentParam,
  movedAddress,
  retiredRouteOf,
  workspacePath,
} from "@chanlytics/contracts";

test("the switch is on only where the stored config says true", () => {
  assert.equal(contentPreviewOf({ features: { content_preview: true } }), true);
  assert.equal(contentPreviewOf({ features: { content_preview: "true" } }), false, "a word is not a yes");
  assert.equal(contentPreviewOf({ features: { content_preview: false } }), false);
  assert.equal(contentPreviewOf({ features: {} }), false);
  assert.equal(contentPreviewOf({}), false);
  assert.equal(contentPreviewOf(null), false);
  assert.equal(contentPreviewOf("content_preview"), false);
});

test("an address under campaigns/content is the Content view's, and no other is", () => {
  assert.equal(CONTENT_ROUTE, "campaigns/content");
  assert.equal(isContentParam("content"), true);
  assert.equal(
    isContentParam("content:anything"),
    true,
    "a word after it is still the view: a link never lands on nothing",
  );
  assert.equal(isContentParam("contents"), false);
  assert.equal(isContentParam("ads"), false);
  assert.equal(isContentParam("messages"), false);
  assert.equal(isContentParam(null), false);
  assert.equal(isContentParam(""), false);
});

const ID = "ffffffff-0000-4000-8000-000000000001";

test("the address says which piece is open, and which view", () => {
  assert.deepEqual(contentPlaceOf("content"), { list: "made", view: "all", open: null });
  assert.deepEqual(contentPlaceOf(`content:${ID}`), { list: "made", view: "all", open: ID });
  assert.deepEqual(contentPlaceOf(`content:posted:${ID}`), { list: "made", view: "posted", open: ID });
  assert.deepEqual(contentPlaceOf("content:scheduled"), { list: "made", view: "scheduled", open: null });
  assert.deepEqual(contentPlaceOf(`content:library:${ID}`), { list: "library", view: "all", open: ID });
  assert.equal(contentPlaceOf("messages"), null, "another view's address is not Content's");
});

test("a word the address does not know is the page, never an error", () => {
  assert.deepEqual(contentPlaceOf("content:anything"), { list: "made", view: "all", open: null });
});

test("a place is spelled back as its address", () => {
  assert.equal(contentRouteOf({ list: "made", view: "all", open: null }), CONTENT_ROUTE);
  assert.equal(contentRouteOf({ list: "made", view: "all", open: ID }), `campaigns/content:${ID}`);
  assert.equal(
    contentRouteOf({ list: "library", view: "posted", open: ID }),
    `campaigns/content:library:${ID}`,
    "a view is Made's alone",
  );
  assert.equal(contentRouteOf({ list: "made", view: "posted", open: ID }), `campaigns/content:posted:${ID}`);
  assert.equal(isContentParam(contentRouteOf({ list: "made", view: "posted", open: ID }).split("/")[1]), true);
});

test("Settings › Files lands on Content's Library, and a file it named opens in Content's viewer (stage 2)", () => {
  assert.equal(CONTENT_LIBRARY_ROUTE, "campaigns/content:library");
  assert.deepEqual(contentPlaceOf(CONTENT_LIBRARY_ROUTE.split("/")[1]), { list: "library", view: "all", open: null });
  assert.equal(retiredRouteOf("admin/files"), CONTENT_LIBRARY_ROUTE);
  assert.equal(retiredRouteOf(`admin/files?do=file:${ID}`), `campaigns/content:${ID}`, "a bell's row: the file, open");
  assert.equal(
    retiredRouteOf("admin/files?from=setup"),
    `${CONTENT_LIBRARY_ROUTE}?from=setup`,
    "any other query rides along",
  );
  // Every link the app writes is spelled where the page is now.
  assert.equal(workspacePath("acme", "admin/files"), "/w/acme/campaigns/content:library");
  assert.equal(workspacePath("acme", `admin/files?do=file:${ID}`), `/w/acme/campaigns/content:${ID}`);
  // An old link, as a mail or a bookmark wrote it, moves as the frame loads, its query read with its route.
  assert.equal(
    movedAddress({ pathname: "/w/acme/settings/files", search: `?do=file:${ID}`, hash: "" }),
    `/w/acme/campaigns/content:${ID}`,
  );
  assert.equal(
    movedAddress({ pathname: "/w/acme/settings/files", search: "", hash: "" }),
    "/w/acme/campaigns/content:library",
  );
  assert.equal(
    movedAddress({ pathname: "/w/acme", search: "", hash: "#/admin/files" }),
    "/w/acme/campaigns/content:library",
  );
});
