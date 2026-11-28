/**
 * What the browser keeps says whose it is (the reviews of 28 Nov 2026: R3.12; lane 11's item 5).
 *
 * A tab's storage outlives the document: a switch of workspace and a sign-out each load a new page in the same tab, and
 * what the last page wrote there is the next one's to read. Thirty-odd modules write it, each under a name of its own. Most
 * keep a choice of the device's. A few keep one workspace's records or a member's words, and of those two were under no
 * workspace's name and outlived both: the sequence the next pile on Leads adds to (its name), and a reply carried to a
 * thread. And a clip's upload was kept under the clip alone, so another workspace took it up where the first stood.
 *
 * The rule: every module of the browser's code that writes storage has a row in browser-storage.json, each slot said to be
 * the device's, the tab's, keyed by its workspace, kept by its record, or cleared as the tab leaves the workspace. This
 * finds the writers in the syntax tree and fails on one with no row. And the last word is run: every slot said to be
 * cleared is filled here and the bridge's own clear run over it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { ROOT, importSrc } from "../../_source.mjs";
import { parse, repoFiles } from "../../_ast.mjs";

const DASHBOARD = "apps/dashboard/";
const LIST = "tests/shell/keeps/browser-storage.json";
const KINDS = ["device", "tab", "keyed", "by record", "cleared"];
const listed = JSON.parse(fs.readFileSync(path.join(ROOT, LIST), "utf8")).writers;

/** Whether a module writes the browser's storage: a call of `setItem`, whatever it is called on. */
function writesStorage(sf) {
  let writes = false;
  const visit = (node) => {
    if (writes) return;
    if (
      ts.isCallExpression(node) &&
      (ts.isPropertyAccessExpression(node.expression) || ts.isPropertyAccessChain(node.expression)) &&
      node.expression.name.text === "setItem"
    )
      writes = true;
    else ts.forEachChild(node, visit);
  };
  visit(sf);
  return writes;
}

/** The browser's code that writes storage: the dashboard's sources and pages, less what only a server runs. */
const writers = repoFiles([`${DASHBOARD}src`, `${DASHBOARD}app`])
  .filter(
    (file) =>
      /\.tsx?$/.test(file) &&
      !file.startsWith(`${DASHBOARD}src/server/`) &&
      !file.startsWith(`${DASHBOARD}app/api/`) &&
      writesStorage(parse(file)),
  )
  .map((file) => file.slice(DASHBOARD.length));

test("every module that writes the browser's storage has a row, and every row is of one that does", () => {
  assert.deepEqual(
    writers.filter((file) => !listed[file]),
    [],
    `a module writes the browser's storage and has no row in ${LIST}: say each slot it writes, whether it is the tab's ` +
      `session or the device's, and whose it is (${KINDS.join(", ")}). One workspace's records are keyed by the workspace, ` +
      `or cleared with the tab's memory (bridge/tab-memory.ts TAB_SLOTS).`,
  );
  assert.deepEqual(
    Object.keys(listed).filter((file) => !writers.includes(file)),
    [],
    `rows in ${LIST} for modules that write no storage any more`,
  );
});

test("each slot says where it is kept, whose it is and what it holds", () => {
  const off = [];
  for (const [file, slots] of Object.entries(listed)) {
    if (!Array.isArray(slots) || slots.length === 0) off.push(`${file}: no slot said`);
    for (const row of slots ?? []) {
      if (typeof row.slot !== "string" || !row.slot) off.push(`${file}: a slot with no name`);
      if (row.in !== "tab" && row.in !== "device") off.push(`${file} ${row.slot}: "in" is tab or device`);
      if (!KINDS.includes(row.whose)) off.push(`${file} ${row.slot}: "whose" is one of ${KINDS.join(", ")}`);
      if (typeof row.what !== "string" || row.what.trim().split(/\s+/).length < 5)
        off.push(`${file} ${row.slot}: "what" says what it holds`);
    }
  }
  assert.deepEqual(off, []);
});

test("every slot said to be cleared is gone once the tab leaves the workspace: the bridge's own clear, run", async () => {
  /** A store as the browser's are: read by name and walked by index, as the clear walks it. */
  const storage = () => {
    const held = new Map();
    return {
      getItem: (k) => (held.has(k) ? held.get(k) : null),
      setItem: (k, v) => held.set(k, String(v)),
      removeItem: (k) => held.delete(k),
      key: (i) => [...held.keys()][i] ?? null,
      get length() {
        return held.size;
      },
    };
  };
  const stores = { tab: storage(), device: storage() };
  globalThis.sessionStorage = stores.tab;
  globalThis.localStorage = stores.device;
  globalThis.document ??= { visibilityState: "visible", addEventListener() {}, removeEventListener() {} };
  globalThis.window = {
    location: { pathname: "/w/harbor-moving/inbox", search: "", hash: "" },
    sessionStorage: stores.tab,
    localStorage: stores.device,
    addEventListener() {},
    removeEventListener() {},
  };
  const cleared = Object.entries(listed).flatMap(([file, slots]) =>
    slots.filter((row) => row.whose === "cleared").map((row) => ({ file, ...row })),
  );
  assert.ok(cleared.length >= 9, "the rows, the kept reads, the tab's memory, the pile's target and a carried reply");
  // A name that carries on after its head (`chanlytics.surfaces.v2:` and the workspace) is filled as this workspace's.
  const nameOf = (slot) => (/[:.]$/.test(slot) ? `${slot}harbor-moving` : slot);
  for (const row of cleared) stores[row.in].setItem(nameOf(row.slot), JSON.stringify({ of: "Harbor Moving" }));
  // And what is the device's own stays: a clear that took everything would pass the lines above.
  stores.device.setItem("chanlytics.content.layout", "list");

  const cache = await importSrc("apps/dashboard/src/bridge/surface-cache.ts");
  cache.sealSurfaceCache();

  assert.deepEqual(
    cleared.filter((row) => stores[row.in].getItem(nameOf(row.slot)) !== null).map((row) => `${row.file}  ${row.slot}`),
    [],
    "REGRESSION: a slot that holds one workspace's records outlived the switch and the sign-out. Name it in " +
      "bridge/tab-memory.ts TAB_SLOTS (the tab's session), or keep it under the workspace's own name.",
  );
  assert.equal(stores.device.getItem("chanlytics.content.layout"), "list", "the device's own choices stay");
});
