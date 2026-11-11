/**
 * Campaigns › Content has one address and one switch (the Content view's decision). The switch is read off the config as
 * stored, by one function the edge and the dashboard both ask, so Connect Meta and the Content view never disagree.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { CONTENT_ROUTE, contentPreviewOf, isContentParam } from "@chanlytics/contracts";

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
