/**
 * The photos beside Ask's field (apps/dashboard/src/surfaces/ask/line/attached.tsx and turns.tsx, decision 0099, step 2), bundled
 * for node with the dashboard's own React and run over a Line in memory. Each goes up as it is chosen; Send waits for them; what
 * refused one stays with its words; and a question goes with what stands beside the field, words or none.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { build } from "esbuild";
import { ROOT } from "../_source.mjs";
import { until } from "../shared/_until.mjs";

const DASHBOARD_MODULES = path.join(ROOT, "apps/dashboard/node_modules");

globalThis.window = {
  location: { pathname: "/w/harbor/today", search: "", hash: "", assign() {} },
  sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent: () => true,
  matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  __refreshSurface: async () => {},
  fetch: async () => {
    throw new Error("nothing answers");
  },
};
globalThis.document = { addEventListener() {}, removeEventListener() {}, querySelector: () => null };
const made = [];
const gone = [];
URL.createObjectURL = () => {
  made.push(`blob:${made.length}`);
  return made.at(-1);
};
URL.revokeObjectURL = (u) => gone.push(u);

const out = await build({
  stdin: {
    contents:
      'export * from "../../apps/dashboard/src/surfaces/ask/line/attached.tsx";\n' +
      'export { arSubmitter } from "../../apps/dashboard/src/surfaces/ask/line/turns.tsx";\n' +
      'export { AskQuestion } from "../../apps/dashboard/src/surfaces/ask/turn.tsx";\n' +
      'export { AskPostCard, usePostCard } from "../../apps/dashboard/src/surfaces/ask/card-post.tsx";\n' +
      'export { PostEdit } from "../../apps/dashboard/src/surfaces/files/post-edit.tsx";\n' +
      'export { followFileAsked, openFile } from "../../apps/dashboard/src/surfaces/files/file-asked.ts";\n' +
      'export { notifyAddress } from "../../apps/dashboard/src/bridge/workspace.ts";\n' +
      'export { drawnKeyOf, keepDrawn, pictureDrawn } from "../../apps/dashboard/src/surfaces/files/post-drawn.ts";\n' +
      'export { postFileOf, sharePostFile, sharesPictures } from "../../apps/dashboard/src/surfaces/files/post-share.ts";\n' +
      'export { askText } from "../../apps/dashboard/src/surfaces/ask/words.ts";\n' +
      'export { fileVerbs } from "../../apps/dashboard/src/surfaces/files/verbs.ts";\n' +
      'export { renderToStaticMarkup } from "react-dom/server";\n' +
      'export { createElement } from "react";\n',
    resolveDir: path.join(ROOT, "tests/files"),
    sourcefile: "beside-the-field.ts",
    loader: "ts",
  },
  absWorkingDir: ROOT,
  bundle: true,
  format: "cjs",
  platform: "node",
  target: "node24",
  jsx: "automatic",
  write: false,
  logLevel: "error",
  loader: { ".css": "empty" },
  alias: {
    react: path.join(DASHBOARD_MODULES, "react"),
    "react-dom": path.join(DASHBOARD_MODULES, "react-dom"),
    "@": path.join(ROOT, "apps/dashboard/src"),
  },
  define: { "process.env.NODE_ENV": '"production"' },
});
const file = path.join(os.tmpdir(), `beside-${process.pid}-${Date.now()}.cjs`);
fs.writeFileSync(file, out.outputFiles[0].text);
const S = createRequire(import.meta.url)(file);
fs.rmSync(file, { force: true });

const t = S.askText("en");
S.postWordsIn = (await import("../../packages/contracts/src/files/post.ts")).postWordsIn;
const FILE = (n) => `ffffffff-0000-4000-8000-00000000000${n}`;
const photo = (name) => new File([new Uint8Array(4)], name, { type: "image/jpeg" });
const realAdd = S.fileVerbs.add;

/** A Line in memory: its photos held as the state holds them, and whatever a turn says kept to read. */
function lineOf(over = {}) {
  const ln = {
    attached: [],
    t,
    toasts: [],
    sent: [],
    begun: [],
    query: "",
    live: null,
    active: null,
    threads: [],
    threadsReady: { current: null },
    turnSeq: { current: 0 },
    scope: null,
    surface: "today",
    openedAt: { current: 0 },
    inputRef: { current: null },
    speech: { stop() {}, wait() {}, canSpeak: false },
    M: { mood: { set() {}, react() {}, pulse() {}, beat() {} } },
    A: {
      quick: () => {
        throw new Error("a question with files is never a quick one");
      },
      language: (q) => (q === undefined ? "es" : "en"),
      sameQuestion: () => false,
      threads: async () => [],
      context: () => null,
      send: async (input) => {
        ln.sent.push(input);
        ln.liveFiles = ln.live.files;
      },
    },
    flash: (f) => ln.toasts.push(f),
    setAttached: (next) => {
      ln.attached = typeof next === "function" ? next(ln.attached) : next;
    },
    setQuery: (q) => {
      ln.query = q;
    },
    setView() {},
    setLang() {},
    setQuick() {},
    setScope() {},
    setThreads() {},
    setLive(next) {
      ln.live = typeof next === "function" ? next(ln.live) : next;
    },
    setActive(next) {
      ln.active = typeof next === "function" ? next(ln.active) : next;
    },
    buzz() {},
    nav() {},
    openThread: async () => null,
    ...over,
  };
  Object.assign(ln, S.arAttach(ln));
  return ln;
}

/** Adds that wait to be told what they came to. */
function heldAdds() {
  const held = [];
  S.fileVerbs.add = (f) => new Promise((resolve) => held.push({ name: f.name, resolve }));
  return held;
}
const arrived = (n) => ({
  key: n,
  file: photo(`p${n}.jpg`),
  picture: null,
  state: "ready",
  id: FILE(n),
  message: null,
});

beforeEach(() => {
  S.fileVerbs.add = realAdd;
  made.length = 0;
  gone.length = 0;
});

/* ----------------------------------------------------- beside the field */

test("each photo goes up as it is chosen, and says when it has arrived and which file it became", async () => {
  const held = heldAdds();
  const ln = lineOf();
  ln.attach([photo("a.jpg"), photo("b.jpg")]);
  assert.deepEqual(
    ln.attached.map((p) => [p.file.name, p.state]),
    [
      ["a.jpg", "sending"],
      ["b.jpg", "sending"],
    ],
  );
  assert.equal(S.allArrived(ln.attached), false);
  assert.equal(made.length, 2, "each is drawn from the File at once");
  held[0].resolve({ kept: true, twin: false, id: FILE(1) });
  await until(() => ln.attached[0].state === "ready", "the first arrives");
  assert.equal(S.allArrived(ln.attached), false, "Send still waits for the other");
  held[1].resolve({ kept: true, twin: true, id: FILE(2) });
  await until(() => ln.attached[1].state === "ready", "the twin arrives as the file it twins");
  assert.equal(S.allArrived(ln.attached), true);
  assert.deepEqual(S.photosAsked(ln.attached), [
    { id: FILE(1), name: "a.jpg" },
    { id: FILE(2), name: "b.jpg" },
  ]);
});

test("one refused stays with its words, holds Send up, and goes again or away by the person's word", async () => {
  const held = heldAdds();
  const ln = lineOf();
  ln.attach([photo("a.jpg")]);
  held[0].resolve({ kept: false, message: "That photo is too small to use." });
  await until(() => ln.attached[0].state === "failed", "it is refused");
  assert.equal(ln.attached[0].message, "That photo is too small to use.");
  assert.equal(S.allArrived(ln.attached), false, "a question never leaves past a photo that did not arrive");
  const { key } = ln.attached[0];
  Object.assign(ln, S.arAttach(ln));
  ln.attachAgain(key);
  assert.equal(ln.attached[0].state, "sending");
  held[1].resolve({ kept: true, twin: false, id: FILE(1) });
  await until(() => ln.attached[0].state === "ready", "the try again arrives");
  ln.detach(key);
  assert.deepEqual(ln.attached, []);
  assert.equal(gone.length, 1, "its picture is let go");
});

test("a send that throws is words, never a tile that goes on sending for ever", async () => {
  S.fileVerbs.add = async () => {
    throw new Error("network");
  };
  const ln = lineOf();
  ln.attach([photo("a.jpg")]);
  await until(() => ln.attached[0].state === "failed", "it fails");
  assert.equal(ln.attached[0].message, t.attachFailed);
});

test("no more than a question goes with: the first are taken, and it says so", () => {
  heldAdds();
  const ln = lineOf();
  ln.attach(Array.from({ length: 12 }, (_, i) => photo(`${i}.jpg`)));
  assert.equal(ln.attached.length, 10);
  assert.equal(ln.toasts.length, 1);
  assert.equal(ln.toasts[0].tone, "warn");
});

test("a paste takes its images, and leaves words to the field", () => {
  heldAdds();
  const ln = lineOf();
  let stopped = 0;
  const paste = (files) => ({ clipboardData: { files }, preventDefault: () => stopped++ });
  S.pastedPhotos(paste([]), ln.attach);
  assert.equal(stopped, 0, "words pasted are the field's");
  S.pastedPhotos(paste([new File(["x"], "notes.txt", { type: "text/plain" })]), ln.attach);
  assert.equal(stopped, 0, "and so is a file that is no image");
  S.pastedPhotos(paste([photo("shot.png")]), ln.attach);
  assert.equal(stopped, 1);
  assert.equal(ln.attached.length, 1);
});

/* ----------------------------------------------------- the question */

test("a question goes with what stands beside the field: the ids, the bubble's tiles, and the field cleared", async () => {
  const ln = lineOf({ query: "Which is better?" });
  ln.attached = [arrived(1), arrived(2)];
  Object.assign(ln, S.arAttach(ln));
  await S.arSubmitter(ln)();
  assert.equal(ln.sent.length, 1);
  assert.deepEqual(ln.sent[0].files, [FILE(1), FILE(2)]);
  assert.equal(ln.sent[0].text, "Which is better?");
  assert.equal(ln.sent[0].language, undefined, "words say their own language");
  const files = [
    { id: FILE(1), name: "p1.jpg" },
    { id: FILE(2), name: "p2.jpg" },
  ];
  assert.deepEqual(ln.active.messages.find((m) => m.role === "user").files, files);
  assert.deepEqual(ln.liveFiles, files, "and the turn in flight draws them while it reads");
  assert.deepEqual(ln.attached, [], "they are the question's now");
});

test("words are not needed: a photo alone is a question, in the language the Line last spoke", async () => {
  const ln = lineOf();
  ln.attached = [arrived(1)];
  Object.assign(ln, S.arAttach(ln));
  await S.arSubmitter(ln)();
  assert.equal(ln.sent[0].text, "");
  assert.deepEqual(ln.sent[0].files, [FILE(1)]);
  assert.equal(ln.sent[0].language, "es");
});

test("nothing leaves while a photo is on its way, and the words stay", async () => {
  const ln = lineOf({ query: "Which?" });
  ln.attached = [arrived(1), { ...arrived(2), state: "sending", id: null }];
  Object.assign(ln, S.arAttach(ln));
  await S.arSubmitter(ln)();
  assert.equal(ln.sent.length, 0);
  assert.equal(ln.query, "Which?");
  assert.equal(ln.attached.length, 2);
  assert.equal(ln.toasts.length, 1, "it says why");
});

test("no words and no photo is still no question", async () => {
  const ln = lineOf();
  await S.arSubmitter(ln)();
  assert.equal(ln.sent.length, 0);
  assert.equal(ln.active, null);
});

test("a Retry brings what the question first came with, and leaves what now stands beside the field", async () => {
  const ln = lineOf();
  ln.attached = [arrived(2)];
  Object.assign(ln, S.arAttach(ln));
  await S.arSubmitter(ln)("Which?", undefined, { files: [{ id: FILE(1), name: "front" }] });
  assert.deepEqual(ln.sent[0].files, [FILE(1)]);
  assert.equal(ln.attached.length, 1);
});

test("a page's own search goes alone", async () => {
  const ln = lineOf();
  ln.A.quick = () => null;
  ln.attached = [arrived(2)];
  Object.assign(ln, S.arAttach(ln));
  await S.arSubmitter(ln)("Find plumbers in Denver", undefined, { fresh: true });
  assert.deepEqual(ln.sent[0].files, []);
  assert.equal(ln.attached.length, 1);
});

/* ----------------------------------------------------- the bubble */

const bubble = (props) => S.renderToStaticMarkup(S.createElement(S.AskQuestion, { t, ...props }));

test("the bubble draws each file by its address, which opens it large; words under; none, no empty bubble", () => {
  const both = bubble({ text: "Which?", files: [{ id: FILE(1), name: "storefront-dusk" }] });
  assert.ok(both.includes(`src="/api/v1/files/${FILE(1)}/view?w=480"`));
  assert.ok(both.includes(`href="/api/v1/files/${FILE(1)}/view?w=1280"`));
  assert.ok(both.includes('alt="Storefront dusk"'));
  assert.ok(both.includes(">Which?</p>"));
  const alone = bubble({ text: "", now: true, files: [{ id: FILE(1), name: "storefront-dusk" }] });
  assert.ok(!alone.includes('ask-q"'), "no empty bubble");
  assert.ok(alone.includes('id="ask-now-q"'), "what the thread stands at its top is still there");
  assert.equal(bubble({ text: "Which?" }).includes("ask-q-files"), false);
});

test("a file since removed says so where its picture was", () => {
  const gone1 = bubble({ text: "", files: [{ id: FILE(1), name: null }] });
  assert.ok(gone1.includes(t.attachGone));
  assert.ok(!gone1.includes("<img"));
});

/* ----------------------------------------------------- a post's card */

const postCard = (over = {}) => ({
  id: "c1",
  kind: "post",
  title: "Post: Now booking",
  summary: "From Storefront dusk. Comes in portrait, square and story.",
  payload: { file_id: FILE(1), line: "Now booking" },
  outcome: null,
  ...over,
});
const DrawnCard = ({ p }) => S.createElement(S.AskPostCard, { p, card: S.usePostCard(p), t, onNav() {} });
const drawnCard = (p) => S.renderToStaticMarkup(S.createElement(DrawnCard, { p }));

test("before the press the card holds its picture's shape while it comes, and says what it will keep", () => {
  const html = drawnCard(postCard());
  assert.ok(html.includes("post-waiting"));
  assert.ok(html.includes(`aria-label="${t.postDrawing}"`));
  assert.ok(html.includes("Comes in portrait, square and story."), "true before the press and after it");
  assert.ok(html.includes("post-shape-story"), "every shape can be seen before it is kept");
  assert.ok(!html.includes("post-download"), "nothing to download yet");
});

const keptCard = () =>
  drawnCard(postCard({ outcome: { state: "done", receipt: "", atMs: 1, made: { kind: "post", id: FILE(2) } } }));

/** Runs with this device: whether it takes files in its sheet, and whether it is held by a finger. */
function onDevice({ canShare, touch = false }, run) {
  const media = globalThis.window.matchMedia;
  globalThis.window.matchMedia = (q) => ({
    matches: q.includes("coarse") && touch,
    addEventListener() {},
    removeEventListener() {},
  });
  if (canShare) Object.defineProperty(navigator, "canShare", { configurable: true, value: canShare });
  try {
    return run();
  } finally {
    globalThis.window.matchMedia = media;
    delete navigator.canShare;
  }
}

test("after the press it is the file itself: portrait shown, the shape to choose, and that shape to download", () => {
  const html = keptCard();
  assert.ok(
    html.includes(`src="/api/v1/files/${FILE(2)}/view?shape=portrait"`),
    "the shape itself, never a resize of it",
  );
  assert.ok(html.includes('data-shape="portrait"'), "it stands as the shape it is");
  assert.ok(html.includes('alt="Now booking"'));
  assert.ok(html.includes("Comes in portrait, square and story."));
  for (const shape of ["portrait", "square", "story"]) assert.ok(html.includes(`post-shape-${shape}`), shape);
  assert.ok(!html.includes("post-edit-open"), "a post kept is changed by making a new version, in Files");
  assert.ok(html.includes("post-open-files"), "and can be opened there");
  assert.equal((html.match(/aria-pressed="true"/g) ?? []).length, 1, "one chosen");
  assert.ok(html.includes(`/api/v1/files/${FILE(2)}/view?download&amp;shape=portrait`), "the one on screen");
  assert.ok(!html.includes("download&amp;shape=story"), "not one it is not showing");
});

test("Share stands where the device takes a picture, whatever its width: first under a finger, beside Download at a desk", () => {
  assert.ok(!keptCard().includes("post-share"), "a device with no such sheet has Download alone");
  assert.ok(!onDevice({ canShare: () => false }, keptCard).includes("post-share"));
  const finger = onDevice({ canShare: () => true, touch: true }, keptCard);
  assert.ok(finger.indexOf("post-share") < finger.indexOf("post-download"));
  const desk = onDevice({ canShare: () => true }, keptCard);
  assert.ok(desk.indexOf("post-download") < desk.indexOf("post-share"));
  assert.match(
    finger,
    /disabled=""[^>]*data-testid="post-share"/,
    "it waits for the picture, which comes before the tap",
  );
});

test("a device that throws on being asked has no sheet", () => {
  const thrown = () => {
    throw new TypeError("no");
  };
  assert.equal(onDevice({ canShare: thrown }, S.sharesPictures), false);
  assert.equal(onDevice({ canShare: () => true }, S.sharesPictures), true);
  assert.equal(S.sharesPictures(), false, "and where nothing answers");
});

test("the sheet opens in the tap's own turn, since Safari refuses one that waited; a person closing it is no failure", async () => {
  const shared = [];
  let answer = () => Promise.resolve();
  Object.defineProperty(navigator, "share", {
    configurable: true,
    value: (data) => {
      shared.push(data);
      return answer();
    },
  });
  try {
    const file = photo("a.jpg");
    const went = S.sharePostFile(file);
    assert.equal(shared.length, 1, "asked before anything was waited for");
    assert.deepEqual(shared[0].files, [file]);
    assert.equal(await went, "went");
    answer = () => Promise.reject(new DOMException("closed", "AbortError"));
    assert.equal(await S.sharePostFile(file), "closed");
    answer = () => Promise.reject(new DOMException("no gesture", "NotAllowedError"));
    assert.equal(await S.sharePostFile(file), "failed", "said, never a press that did nothing");
  } finally {
    delete navigator.share;
  }
});

test("the picture for the sheet comes once a tab under a name a person can read, and is asked again after it did not come", async () => {
  const realShape = S.fileVerbs.postBytes;
  const asked = [];
  let bytes = null;
  S.fileVerbs.postBytes = async (id, shape) => {
    asked.push([id, shape]);
    return bytes;
  };
  try {
    assert.equal(await S.postFileOf(FILE(3), "now-booking", "story"), null, "nothing came");
    bytes = new Blob(["jpeg"]);
    const file = await S.postFileOf(FILE(3), "now-booking", "story");
    assert.deepEqual([file.name, file.type], ["now-booking-story.jpg", "image/jpeg"]);
    assert.equal(await S.postFileOf(FILE(3), "now-booking", "story"), file);
    assert.deepEqual(asked, [
      [FILE(3), "story"],
      [FILE(3), "story"],
    ]);
  } finally {
    S.fileVerbs.postBytes = realShape;
  }
});

test("a shape's bytes come from its own address, and a read that failed is nothing", async () => {
  const realFetch = globalThis.window.fetch;
  const asked = [];
  let answer = async () => new Response("jpeg");
  globalThis.window.fetch = (address) => {
    asked.push(address);
    return answer();
  };
  try {
    assert.equal(await (await S.fileVerbs.postBytes(FILE(4), "square")).text(), "jpeg");
    assert.deepEqual(asked, [`/api/v1/files/${FILE(4)}/view?shape=square`], "the kept address, not a download's");
    answer = async () => new Response("gone", { status: 404 });
    assert.equal(await S.fileVerbs.postBytes(FILE(4), "square"), null);
    answer = async () => {
      throw new Error("no signal");
    };
    assert.equal(await S.fileVerbs.postBytes(FILE(4), "square"), null);
  } finally {
    globalThis.window.fetch = realFetch;
  }
});

test("a card read again says what was saved, not what Ask first proposed: a person may have changed it", () => {
  const html = drawnCard(
    postCard({
      outcome: {
        state: "done",
        receipt: "",
        atMs: 1,
        made: { kind: "post", id: FILE(2) },
        undo: { file_id: FILE(2), plan: { file_id: FILE(1), line: "Walk-ins welcome" } },
      },
    }),
  );
  assert.ok(html.includes('alt="Walk-ins welcome"'));
  assert.ok(!html.includes('alt="Now booking"'));
});

test("a file asked for from over its page is opened by the page: the address is no news to one already on screen", () => {
  const went = [];
  const opened = [];
  S.openFile(FILE(5), (r) => went.push(r));
  assert.deepEqual(went, [`admin/files?do=file:${FILE(5)}`], "the address says it, for a page not on screen yet");
  assert.deepEqual(opened, []);
  const stop = S.followFileAsked((id) => opened.push(id));
  S.openFile(FILE(6), () => {});
  assert.deepEqual(opened, [FILE(6)]);
  stop();
  S.openFile(FILE(7), () => {});
  assert.deepEqual(opened, [FILE(6)], "a page gone hears nothing");
});

test("a page the router drew before it moved the address opens the file the address names once it has landed", () => {
  const opened = [];
  // The router draws the page it moves to and then moves the address, so the page was drawn over the address it came from:
  // by the time it listens, the address says the file (the bell's Watch it and a card's Open, pressed on any other page).
  globalThis.window.location.search = `?do=file:${FILE(8)}`;
  try {
    const stop = S.followFileAsked((id) => opened.push(id));
    assert.deepEqual(opened, [FILE(8)]);
    stop();
  } finally {
    globalThis.window.location.search = "";
  }
});

test("a page on screen opens the file its address is moved to, and never one a sheet already stood on", () => {
  const opened = [];
  globalThis.window.history = { state: null, pushState() {} };
  try {
    const stop = S.followFileAsked((id) => opened.push(id));
    assert.deepEqual(opened, [], "an address that names none opens none");
    // The bell's row, pressed on Files itself: the address moves, the route does not.
    globalThis.window.location.search = `?do=file:${FILE(9)}`;
    S.notifyAddress();
    assert.deepEqual(opened, [FILE(9)]);
    // Forward onto the entry its sheet stood on, closed since: a later move away is not a second ask for it.
    globalThis.window.history.state = { sheet: 3 };
    S.notifyAddress();
    assert.deepEqual(opened, [FILE(9)], "the entry a sheet stood on asks for nothing new");
    // Another sheet's name is not a file's.
    globalThis.window.history.state = null;
    globalThis.window.location.search = "?do=note:someone";
    S.notifyAddress();
    assert.deepEqual(opened, [FILE(9)]);
    stop();
    globalThis.window.location.search = `?do=file:${FILE(9)}`;
    S.notifyAddress();
    assert.deepEqual(opened, [FILE(9)], "a page gone hears nothing");
  } finally {
    globalThis.window.location.search = "";
    delete globalThis.window.history;
  }
});

test("a Spanish post says its own words, on the card and its presses", () => {
  const html = drawnCard(
    postCard({
      payload: { file_id: FILE(1), line: "Ya abrimos", language: "es" },
      outcome: { state: "done", receipt: "", atMs: 1, made: { kind: "post", id: FILE(2) } },
    }),
  );
  for (const word of ["Vertical", "Cuadrado", "Historia", "Descargar", "Abrir en Archivos"])
    assert.ok(html.includes(word), word);
  assert.ok(!html.includes("Download"));
});

test("what can be changed of a post: its words, its layout, its type, where the words stand, and a number only where there is one", () => {
  const draft = (over) => ({
    plan: {
      file_id: FILE(1),
      line: "Now booking",
      over: null,
      under: null,
      book: false,
      words_at: "bottom",
      voice: "classic",
      layout: "over",
      language: "en",
      people_agreed: false,
    },
    hasPhone: false,
    change() {},
    ...over,
  });
  const edit = (d) => S.renderToStaticMarkup(S.createElement(S.PostEdit, { draft: d, says: S.postWordsIn("en") }));
  const html = edit(draft());
  for (const id of [
    "post-line",
    "post-over",
    "post-under",
    "post-layout-band",
    "post-layout-frame",
    "post-voice-modern",
    "post-at-top",
  ])
    assert.ok(html.includes(id), id);
  assert.ok(html.includes('maxLength="60"'), "as long as a phone can read");
  assert.ok(!html.includes("post-book"), "a business with no number is offered none");
  assert.ok(edit(draft({ hasPhone: true })).includes("post-book"));
  assert.match(edit(draft({ plan: { ...draft().plan, layout: "band" } })), /aria-pressed="true"[^>]*post-layout-band/);
});

test("a picture is known by what can be seen of its plan and its shape: a space being typed draws nothing new", () => {
  const plan = {
    file_id: FILE(1),
    line: "Now booking",
    over: null,
    under: null,
    book: false,
    words_at: "bottom",
    voice: "classic",
    layout: "over",
    language: "en",
    people_agreed: false,
  };
  assert.equal(S.drawnKeyOf({ ...plan, line: "Now booking " }, "portrait"), S.drawnKeyOf(plan, "portrait"));
  assert.equal(S.drawnKeyOf({ ...plan, over: " " }, "portrait"), S.drawnKeyOf(plan, "portrait"));
  assert.notEqual(S.drawnKeyOf(plan, "story"), S.drawnKeyOf(plan, "portrait"));
  assert.notEqual(S.drawnKeyOf({ ...plan, layout: "band" }, "portrait"), S.drawnKeyOf(plan, "portrait"));
});

test("a tab keeps a few dozen pictures, and lets the oldest go: memory is not a post's to spend", () => {
  const before = gone.length;
  for (let i = 0; i < 30; i++) S.keepDrawn(`k${i}`, { url: `blob:k${i}`, hasPhone: true });
  assert.equal(gone.length - before, 6, "past twenty-four, each lets one go");
  assert.equal(S.pictureDrawn("k0"), undefined);
  assert.equal(S.pictureDrawn("k29").url, "blob:k29");
  S.keepDrawn("k6", { url: "blob:k6", hasPhone: true });
  S.keepDrawn("k30", { url: "blob:k30", hasPhone: true });
  assert.equal(S.pictureDrawn("k7"), undefined, "the one kept again is the newest, so the next goes in its place");
  assert.ok(S.pictureDrawn("k6"));
});

test("a card undone or set aside goes back to asking for its picture, never to a file that went", () => {
  for (const outcome of [
    { state: "undone", receipt: "", atMs: 1 },
    { state: "dismissed", receipt: "", atMs: 1 },
  ]) {
    const html = drawnCard(postCard({ outcome }));
    assert.ok(!html.includes("/view?"), outcome.state);
  }
});
