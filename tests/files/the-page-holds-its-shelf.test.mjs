/**
 * What Settings › Files holds as a person moves around it (apps/dashboard/src/surfaces/files/surface.ts, decision 0099), over the real
 * read and a fetch that answers from here. A read again asks for what is on screen, so a shelf chosen and what was scrolled through
 * stay put when the feed says a file changed; and an answer that comes after a newer press changes nothing.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { importSrc } from "../_source.mjs";
import { historyOf } from "../shell/address/_address.mjs";
import { bridgeHolds } from "../shell/_bridge-holds.mjs";

const listening = new Map();
/** What each read asked for, and how it answers; a test may hold an answer back by handing a promise. */
const asked = [];
let answerTo = () => ({});

bridgeHolds({ who: { activeWorkspaceId: "ws-1" } });
const win = {
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
bridgeHolds({ parts: { afterTheMoveMs: 0 } });
globalThis.window = win;
historyOf(win);
globalThis.document = { visibilityState: "visible", title: "", addEventListener() {}, removeEventListener() {} };
globalThis.CustomEvent ??= class CustomEvent {
  constructor(type, init) {
    this.type = type;
    this.detail = init?.detail;
  }
};
bridgeHolds({ parts: { shell: (await importSrc("apps/dashboard/src/bridge/workspace.ts")).addressApi(win) } });
const { filesOverride, showFiles, showMoreFiles } = await importSrc("apps/dashboard/src/surfaces/files/surface.ts");
/** A shelf pressed: all of its kinds, and no words found by. */
const showShelf = (shelf) => showFiles({ shelf, kind: null, about: null });
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
  await showShelf("all");
  asked.length = 0;
});

test("another shelf is read by name, and stands once it comes", async () => {
  answerTo = () => pageOf("work", ["b", "c"]);
  await showShelf("work");
  assert.deepEqual(asked, [{ shelf: "work" }]);
  assert.equal(held().shelf, "work");
  assert.deepEqual(idsHeld(), ["b", "c"]);
});

test("the feed's read again asks for the shelf on show, so a change under a person leaves them where they are", async () => {
  answerTo = () => pageOf("work", ["b"]);
  await showShelf("work");
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
  const work = showShelf("work");
  await showShelf("place");
  assert.deepEqual(idsHeld(), ["quick"]);
  letWorkAnswer();
  await work;
  assert.deepEqual(idsHeld(), ["quick"], "the older answer is dropped");
  assert.equal(held().shelf, "place");
});

test("the next page comes after what is there, and a read again then asks for all of it, as long as it now is", async () => {
  answerTo = () => pageOf("work", ["a", "b"], "cursor-1");
  await showShelf("work");
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

test("more of a search reads on with its words, and a read again asks for the same words, as long as it now is", async () => {
  const found = (ids, next = null) => ({ ...pageOf("all", ids, next), kind: null, about: "dusk" });
  answerTo = () => found(["a", "b"], "cursor-1");
  await showFiles({ shelf: "all", kind: null, about: "dusk" });
  asked.length = 0;
  answerTo = () => found(["c"]);
  await showMoreFiles();
  assert.deepEqual(
    asked,
    [{ shelf: "all", about: "dusk", before: "cursor-1" }],
    "never the whole shelf after a search",
  );
  assert.deepEqual(idsHeld(), ["a", "b", "c"]);
  assert.equal(held().about, "dusk", "the find line keeps its words");
  asked.length = 0;
  answerTo = () => found(["a", "b", "c"]);
  await filesOverride.apply();
  assert.deepEqual(asked, [{ shelf: "all", about: "dusk", limit: "3" }]);
  assert.equal(held().about, "dusk");
});

test("with no next page there is nothing to read", async () => {
  answerTo = () => pageOf("work", ["a"]);
  await showShelf("work");
  asked.length = 0;
  await showMoreFiles();
  assert.deepEqual(asked, []);
});

test("a next page that comes after a person moved on is let go", async () => {
  answerTo = () => pageOf("work", ["a"], "cursor-1");
  await showShelf("work");
  let letMoreAnswer;
  answerTo = () =>
    new Promise((resolve) => {
      letMoreAnswer = () => resolve(pageOf("work", ["b"]));
    });
  const more = showMoreFiles();
  answerTo = () => pageOf("place", ["p"]);
  await showShelf("place");
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
