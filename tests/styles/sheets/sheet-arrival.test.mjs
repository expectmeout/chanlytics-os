/**
 * A page pressed while its stylesheets are still arriving waits for them
 * (apps/dashboard/src/styles/sheet-arrival.ts).
 *
 * React holds a draw only for a stylesheet it puts in the document itself. A file the frame brought in ahead of a move
 * is in the document already, loading, and without this wait its page was drawn bare: every one of 153 frames watched,
 * with the files held back three seconds (25 Nov 2026). Run here over a document of the test's own: one stylesheet
 * link or none, loaded or not, that says what listens to it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { markWarmed, waitForSheet } from "../../../apps/dashboard/src/styles/sheet-arrival.ts";

/** A document holding one stylesheet link (or none), loaded or not, that says what listens to it. */
function documentWith(href, loaded) {
  const heard = {};
  const link = {
    sheet: loaded ? {} : null,
    getAttribute: (name) => (name === "href" ? href : null),
    addEventListener: (type, listener) => void (heard[type] = listener),
  };
  return { heard, link, doc: { querySelectorAll: () => (href ? [link] : []) } };
}
/** The document a warm finds its file missing from: the warm puts it there, and only then is it one to wait for. */
const NOT_THERE = documentWith(null, false).doc;

test("a file never brought in ahead is never waited for: the document's own link is the browser's to hold the paint for", () => {
  assert.equal(waitForSheet("/sheets/own.css", documentWith("/sheets/own.css", false).doc), null);
});

test("a file brought in ahead and still on its way has one arrival, the same for every draw, ended by its load", async () => {
  const href = "/sheets/late.css";
  markWarmed(href, NOT_THERE);
  const late = documentWith(href, false);
  const arrival = waitForSheet(href, late.doc);
  assert.ok(arrival instanceof Promise, "a file on its way has an arrival");
  assert.equal(waitForSheet(href, late.doc), arrival, "every draw waits on the one arrival");
  let arrived = false;
  void arrival.then(() => (arrived = true));
  await Promise.resolve();
  assert.equal(arrived, false, "not before the file loads");
  late.heard.load();
  await arrival;
  late.link.sheet = {};
  assert.equal(waitForSheet(href, late.doc), null, "arrived: nothing more to wait for");
});

test("a file brought in ahead that has loaded, or is not in the document at all, is not waited for", () => {
  markWarmed("/sheets/loaded.css", NOT_THERE);
  assert.equal(waitForSheet("/sheets/loaded.css", documentWith("/sheets/loaded.css", true).doc), null);
  // Not in the document: React links it with the page and waits for it itself.
  markWarmed("/sheets/absent.css", NOT_THERE);
  assert.equal(waitForSheet("/sheets/absent.css", NOT_THERE), null);
});

test("a file the document already links when the warm comes is never one to wait for, loading or not", () => {
  // Its own link, or a page's: a page on the screen must not wait outside a move.
  const own = documentWith("/sheets/already.css", false);
  markWarmed("/sheets/already.css", own.doc);
  assert.equal(waitForSheet("/sheets/already.css", own.doc), null);
});

test("a file that fails is waited for once: the page is drawn without it, and no later move waits for it again", async () => {
  const href = "/sheets/failed.css";
  markWarmed(href, NOT_THERE);
  const failed = documentWith(href, false);
  const gaveUp = waitForSheet(href, failed.doc);
  assert.ok(gaveUp instanceof Promise);
  failed.heard.error();
  await gaveUp;
  assert.equal(waitForSheet(href, failed.doc), null);
});
