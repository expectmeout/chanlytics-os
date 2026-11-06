/**
 * The kit's one file download (surfaces/kit/download.ts), which the chart card's CSV and People's export both save through:
 * a CSV with a byte-order mark under its name, its address let go once the save has begun; and inside the phone app, where a
 * WebView cannot save a file made in the page, the same words handed to the app's share sheet through the `app:file` event
 * (legacy-bridge/app-bridge.ts) and nothing saved.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { installLegacyReact } from "../_legacy-react.mjs";
import { importSrc } from "../_source.mjs";

installLegacyReact();
const { downloadCsv } = await importSrc("apps/dashboard/src/surfaces/kit/download.ts");
const BOM = String.fromCharCode(0xfeff);

/** The browser's save, stood in for: what was made, what was clicked, what was let go. */
const saving = async (run) => {
  const saved = [];
  const clicked = [];
  const revoked = [];
  const real = { create: URL.createObjectURL, revoke: URL.revokeObjectURL, el: globalThis.document.createElement };
  URL.createObjectURL = (blob) => {
    saved.push(blob);
    return "blob:kit";
  };
  URL.revokeObjectURL = (url) => revoked.push(url);
  globalThis.document.createElement = () => ({
    style: {},
    setAttribute() {},
    click() {
      clicked.push({ href: this.href, download: this.download });
    },
    remove() {},
  });
  try {
    await run();
    await new Promise((resolve) => setTimeout(resolve, 1100));
    return { saved, clicked, revoked };
  } finally {
    URL.createObjectURL = real.create;
    URL.revokeObjectURL = real.revoke;
    globalThis.document.createElement = real.el;
  }
};

test("a CSV is saved with its byte-order mark under its name, and its address is let go afterwards", async () => {
  const { saved, clicked, revoked } = await saving(() => downloadCsv("people-2026-10-05.csv", "Name\r\nHarbor Studio"));
  assert.deepEqual(clicked, [{ href: "blob:kit", download: "people-2026-10-05.csv" }]);
  assert.equal(saved[0].type, "text/csv;charset=utf-8");
  const bytes = new Uint8Array(await saved[0].arrayBuffer());
  assert.deepEqual([...bytes.slice(0, 3)], [0xef, 0xbb, 0xbf], "a spreadsheet reads the accents");
  assert.equal((await saved[0].text()).replace(BOM, ""), "Name\r\nHarbor Studio");
  assert.deepEqual(revoked, ["blob:kit"]);
});

test("inside the phone app the same words go to its share sheet, mark and all, and the page saves nothing", async () => {
  const handed = [];
  const real = globalThis.window.dispatchEvent;
  globalThis.window.dispatchEvent = (event) => {
    if (event.type === "app:file") (handed.push(event.detail), event.preventDefault());
    return !event.defaultPrevented;
  };
  try {
    const { saved, clicked } = await saving(() => downloadCsv("calls.csv", "Day,Calls"));
    assert.deepEqual([saved.length, clicked.length], [0, 0], "a blob the WebView would drop without a word");
    assert.deepEqual(handed, [{ name: "calls.csv", type: "text/csv", text: `${BOM}Day,Calls` }]);
  } finally {
    globalThis.window.dispatchEvent = real;
  }
});
