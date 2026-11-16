/**
 * What Ask noticed is in hand before Ask opens (the phone review of 15 Nov 2026): read only as Ask opened, its line came 0.7
 * to 1.8 s after the home had drawn, and the three, the pills and Brief me jumped up as it took its place. A device that opens
 * Ask reads it once the boot is in, the answer is kept, and Ask opens with it; a device that never opened Ask reads nothing
 * ahead, since the read is a page's worth of the server's.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { until } from "../../shared/_until.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { askNotices } = await import(at("apps/dashboard/src/bridge/ask/notices.ts"));
const { clearReadCaches } = await import(at("apps/dashboard/src/bridge/read-cache.ts"));

const NOTICE = { key: "freed_times_unoffered", says: "A time opened, and nobody has been offered it." };

/** A load of the app on a device: the device's storage (kept across loads), and the server's answers, each ask counted. */
function load(device) {
  const asked = [];
  return {
    asked,
    localStorage: {
      getItem: (k) => device.get(k) ?? null,
      setItem: (k, v) => void device.set(k, String(v)),
    },
    addEventListener: () => {},
    dispatchEvent: () => true,
    fetch: async (url) => {
      asked.push(String(url));
      const data = { notices: [NOTICE], rested: {}, day: "2026-11-15" };
      return new Response(JSON.stringify({ ok: true, data }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  };
}
const noticeReads = (win) => win.asked.filter((u) => u.includes("/ask/notice")).length;

test("a device that opened Ask reads what it noticed once the boot is in, and Ask opens with it, asking nothing more; a device that never opened Ask reads nothing ahead", async () => {
  clearReadCaches();
  const opener = new Map();
  // Its first load: Ask has never been opened here, so nothing is read before it is.
  const first = load(opener);
  const firstAsk = askNotices(first, () => "en");
  await firstAsk.readNotices("en");
  assert.equal(noticeReads(first), 1, "read as Ask opened");
  // A later load in a new tab (nothing kept in it), beside a device that never opened Ask.
  clearReadCaches();
  const later = load(opener);
  const never = load(new Map());
  const neverAsk = askNotices(never, () => "en");
  const ask = askNotices(later, () => "en");
  await until(() => ask.noticed(), "read once the boot was in, before Ask was opened");
  assert.equal(
    ask.noticed().key,
    NOTICE.key,
    "REGRESSION (15 Nov 2026): read only as Ask opened, the line came 0.7 to 1.8 s after the home and moved everything over it",
  );
  assert.equal(noticeReads(never), 0, "a device that never opened Ask reads nothing ahead");
  // Ask opens: the line is drawn from what is held, and nothing more is asked within minutes of that read.
  await ask.readNotices("en");
  assert.equal(noticeReads(later), 1, "one read for the load: Ask opening took what it held");
  assert.equal(neverAsk.noticed()?.key, NOTICE.key, "one answer for the workspace, whoever read it");
});

test("Not now rests it at once, and the rest stands in what the tab keeps for the next load", async () => {
  clearReadCaches();
  const device = new Map();
  const ask = askNotices(load(device), () => "en");
  await ask.readNotices("en");
  assert.equal(ask.noticed()?.key, NOTICE.key);
  await ask.restNotice(NOTICE.key);
  assert.equal(ask.noticed(), null, "rested at once");
  const reloaded = askNotices(load(device), () => "en");
  assert.equal(reloaded.noticed(), null, "a reload of the tab does not bring a rested line back");
});
