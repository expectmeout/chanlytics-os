/**
 * What Settings › Files holds as a person moves around it (apps/dashboard/src/surfaces/files/surface.ts, decision 0099), over the real
 * read and a fetch that answers from here. A read again asks for what is on screen, so a shelf chosen and what was scrolled through
 * stay put when the feed says a file changed; and an answer that comes after a newer press changes nothing.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { importSrc } from "../_source.mjs";
import { historyOf, legacyAddress } from "../shell/address/_address.mjs";

const listening = new Map();
/** What each read asked for, and how it answers; a test may hold an answer back by handing a promise. */
const asked = [];
let answerTo = () => ({});

const win = {
  __afterTheMoveMs: 0,
  __ACTIVE_WORKSPACE: "ws-1",
  location: {
    pathname: "/w/acme/admin/files",
    search: "",
    hash: "#/admin/files",
    assign() {},
    replace() {},
    reload() {},
  },
  addEventListener(type, fn) {
    if (!listening.has(type)) listening.set(type, new Set());
    listening.get(type).add(fn);
  },
  removeEventListener(type, fn) {
    listening.get(type)?.delete(fn);
  },
  dispatchEvent(ev) {
    for (const fn of [...(listening.get(ev.type) ?? [])]) fn(ev);
    return true;
  },
  fetch: async (url) => {
    const query = Object.fromEntries(new URL(String(url), "http://localhost").searchParams);
    delete query.workspace;
    asked.push(query);
    const data = await answerTo(query);
    if (data instanceof Error) throw data;
    return new Response(JSON.stringify({ ok: true, data }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  },
};
globalThis.window = win;
historyOf(win);
globalThis.document = { visibilityState: "visible", title: "", addEventListener() {}, removeEventListener() {} };
globalThis.CustomEvent ??= class CustomEvent {
  constructor(type, init) {
    this.type = type;
    this.detail = init?.detail;
  }
};
win.__shell = (await importSrc("apps/dashboard/src/legacy-bridge/workspace.ts")).addressApi(win);
win.CHANLY = { nav() {}, address: await legacyAddress() };
const { filesOverride, showFilesShelf, showMoreFiles } = await importSrc(
  "apps/dashboard/src/surfaces/files/surface.ts",
);
const { setSurfaceValue, surfaceValue } = await importSrc("apps/dashboard/src/surfaces/surface-values.ts");

const tally = { total: 3, kept: 3, waiting: 0, looking: 0, shelves: { work: 3 } };
const fileOf = (id) => ({ id, name: id, status: "filed", source: "upload", shows: "work" });
const pageOf = (shelf, ids, next = null) => ({ files: ids.map(fileOf), shelf, next, tally });
const held = () => surfaceValue("files")?.dto;
const idsHeld = () => held().files.map((f) => f.id);

beforeEach(async () => {
  asked.length = 0;
  answerTo = () => pageOf("all", ["a"]);
  // A move to where nothing is chosen is no press a person makes: a new page starts where the module does, or at the last test's shelf.
  await showFilesShelf("all");
  asked.length = 0;
});

test("another shelf is read by name, and stands once it comes", async () => {
  answerTo = () => pageOf("work", ["b", "c"]);
  await showFilesShelf("work");
  assert.deepEqual(asked, [{ shelf: "work" }]);
  assert.equal(held().shelf, "work");
  assert.deepEqual(idsHeld(), ["b", "c"]);
});

test("the feed's read again asks for the shelf on show, so a change under a person leaves them where they are", async () => {
  answerTo = () => pageOf("work", ["b"]);
  await showFilesShelf("work");
  asked.length = 0;
  answerTo = () => pageOf("work", ["b", "new"]);
  await filesOverride.apply();
  assert.deepEqual(asked, [{ shelf: "work" }]);
  assert.deepEqual(idsHeld(), ["b", "new"]);
});

test("a press answered after a newer one changes nothing: the last one pressed is what stands", async () => {
  let letWorkAnswer;
  answerTo = (q) =>
    q.shelf === "work"
      ? new Promise((resolve) => {
          letWorkAnswer = () => resolve(pageOf("work", ["slow"]));
        })
      : pageOf("place", ["quick"]);
  const work = showFilesShelf("work");
  await showFilesShelf("place");
  assert.deepEqual(idsHeld(), ["quick"]);
  letWorkAnswer();
  await work;
  assert.deepEqual(idsHeld(), ["quick"], "the older answer is dropped");
  assert.equal(held().shelf, "place");
});

test("the next page comes after what is there, and a read again then asks for all of it, as long as it now is", async () => {
  answerTo = () => pageOf("work", ["a", "b"], "cursor-1");
  await showFilesShelf("work");
  asked.length = 0;
  answerTo = () => pageOf("work", ["c"], null);
  await showMoreFiles();
  assert.deepEqual(asked, [{ shelf: "work", before: "cursor-1" }]);
  assert.deepEqual(idsHeld(), ["a", "b", "c"]);
  assert.equal(held().next, null);
  asked.length = 0;
  answerTo = () => pageOf("work", ["a", "b", "c"]);
  await filesOverride.apply();
  assert.deepEqual(asked, [{ shelf: "work", limit: "3" }], "one read, and nothing scrolled through is lost");
});

test("with no next page there is nothing to read", async () => {
  answerTo = () => pageOf("work", ["a"]);
  await showFilesShelf("work");
  asked.length = 0;
  await showMoreFiles();
  assert.deepEqual(asked, []);
});

test("a next page that comes after a person moved on is let go", async () => {
  answerTo = () => pageOf("work", ["a"], "cursor-1");
  await showFilesShelf("work");
  let letMoreAnswer;
  answerTo = () =>
    new Promise((resolve) => {
      letMoreAnswer = () => resolve(pageOf("work", ["b"]));
    });
  const more = showMoreFiles();
  answerTo = () => pageOf("place", ["p"]);
  await showFilesShelf("place");
  letMoreAnswer();
  await more;
  assert.deepEqual(idsHeld(), ["p"]);
});

test("a read again that fails leaves what is on screen, and one with nothing on it says so", async () => {
  answerTo = () => pageOf("all", ["a"]);
  await filesOverride.apply();
  answerTo = () => new Error("no line");
  await assert.rejects(filesOverride.apply());
  assert.deepEqual(idsHeld(), ["a"], "the grid stands");
  setSurfaceValue("files", undefined);
  await assert.rejects(filesOverride.apply());
  assert.equal(surfaceValue("files"), null);
});
