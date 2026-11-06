/**
 * Photos on their way (apps/dashboard/src/surfaces/files/sending.ts and verbs.ts, decision 0099), bundled for node with
 * the dashboard's own React and run over a browser in memory. Three go at a time, a failed one stays with its picture and its
 * words until the person says, a twin leaves calmly, a dropped line is tried again, and the end is told once.
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

const heard = {};
const win = {
  location: { pathname: "/w/harbor/admin/files", search: "", hash: "", assign() {} },
  sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  addEventListener: (t, fn) => (heard[t] ||= []).push(fn),
  removeEventListener() {},
  dispatchEvent: () => true,
  __refreshSurface: async () => {},
  fetch: async () => {
    throw new Error("nothing answers");
  },
};
globalThis.window = win;
globalThis.document = {
  visibilityState: "visible",
  addEventListener() {},
  removeEventListener() {},
};
const madeUrls = [];
const goneUrls = [];
URL.createObjectURL = () => {
  madeUrls.push(`blob:${madeUrls.length}`);
  return madeUrls.at(-1);
};
URL.revokeObjectURL = (u) => goneUrls.push(u);

const out = await build({
  stdin: {
    contents:
      'export * from "../../../../apps/dashboard/src/surfaces/files/sending.ts";\n' +
      'export { fileVerbs } from "../../../../apps/dashboard/src/surfaces/files/verbs.ts";\n' +
      'export { renderToStaticMarkup } from "react-dom/server";\n' +
      'export { createElement } from "react";\n',
    resolveDir: path.join(ROOT, "tooling/scripts/tests/files"),
    sourcefile: "sending-server.ts",
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
const file = path.join(os.tmpdir(), `sending-${process.pid}-${Date.now()}.cjs`);
fs.writeFileSync(file, out.outputFiles[0].text);
const S = createRequire(import.meta.url)(file);
fs.rmSync(file, { force: true });

const stateNow = () => {
  let seen = null;
  S.renderToStaticMarkup(
    S.createElement(() => {
      seen = S.useSending();
      return null;
    }),
  );
  return seen;
};
const photo = (name) => new File([new Uint8Array(4)], name, { type: "image/jpeg" });
const waitFor = (what) => until(what, String(what));
const toasts = [];
const flash = (f) => toasts.push(f);
const realAdd = S.fileVerbs.add;

beforeEach(async () => {
  toasts.length = 0;
  S.fileVerbs.add = realAdd;
  for (const p of stateNow().photos) S.takeAway(p.key);
  S.clearSaid();
});

/** An add that waits to be told what it came to. */
function heldAdds() {
  const held = [];
  S.fileVerbs.add = (f) => new Promise((resolve) => held.push({ name: f.name, resolve }));
  return held;
}
const KEPT = { kept: true, twin: false };

test("three go at a time, the rest wait their turn, and the next starts as one comes free", async () => {
  const held = heldAdds();
  S.addPhotos(
    ["a", "b", "c", "d", "e"].map((n) => photo(`${n}.jpg`)),
    flash,
  );
  await waitFor(() => held.length === 3);
  assert.deepEqual(
    stateNow().photos.map((p) => p.state),
    ["sending", "sending", "sending", "waiting", "waiting"],
  );
  assert.equal(stateNow().photos[3].picture, null, "only what is going holds a picture");
  held[0].resolve(KEPT);
  await waitFor(() => held.length === 4);
  assert.equal(stateNow().photos.length, 4);
  for (const h of held.slice(1)) h.resolve(KEPT);
  await waitFor(() => held.length === 5);
  held[4].resolve(KEPT);
  await waitFor(() => toasts.length === 1);
  assert.equal(stateNow().photos.length, 0);
  assert.equal(toasts[0].msg, "5 photos added.");
  assert.equal(toasts[0].tone, undefined);
});

test("a failed photo stays with its picture and its words, and Try again sends only that one, afresh", async () => {
  const held = heldAdds();
  S.addPhotos([photo("a.jpg"), photo("b.jpg")], flash);
  await waitFor(() => held.length === 2);
  held[0].resolve({ kept: false, message: "That photo is too small to use." });
  held[1].resolve(KEPT);
  await waitFor(() => toasts.length === 1);
  const [failed] = stateNow().photos;
  assert.equal(stateNow().photos.length, 1);
  assert.equal(failed.state, "failed");
  assert.equal(failed.message, "That photo is too small to use.");
  assert.ok(failed.picture, "the person sees which one, not IMG_4417");
  assert.equal(toasts[0].tone, "warn");
  assert.equal(toasts[0].msg, "Photo added. 1 photo wasn't added.");

  const gone = goneUrls.length;
  S.tryAgain(failed.key, flash);
  await waitFor(() => held.length === 3);
  assert.equal(held[2].name, "a.jpg");
  assert.equal(goneUrls.length, gone + 1, "its old picture let go");
  held[2].resolve(KEPT);
  await waitFor(() => toasts.length === 2);
  assert.equal(stateNow().photos.length, 0);
});

test("Try all sends every failed one, Remove takes one off the page, and each lets its picture go", async () => {
  const held = heldAdds();
  S.addPhotos([photo("a.jpg"), photo("b.jpg"), photo("c.jpg")], flash);
  await waitFor(() => held.length === 3);
  for (const h of held) h.resolve({ kept: false, message: "no" });
  await waitFor(() => toasts.length === 1);
  const [first] = stateNow().photos;
  const gone = goneUrls.length;
  S.takeAway(first.key);
  assert.equal(stateNow().photos.length, 2);
  assert.equal(goneUrls.length, gone + 1);
  S.tryAll(flash);
  await waitFor(() => held.length === 5);
  assert.deepEqual(
    held.slice(3).map((h) => h.name),
    ["b.jpg", "c.jpg"],
  );
  for (const h of held.slice(3)) h.resolve(KEPT);
  await waitFor(() => toasts.length === 2);
  assert.equal(stateNow().photos.length, 0);
});

test("a twin leaves calmly, said in the end, with no warning in it", async () => {
  const held = heldAdds();
  S.addPhotos([photo("a.jpg")], flash);
  await waitFor(() => held.length === 1);
  held[0].resolve({ kept: true, twin: true });
  await waitFor(() => toasts.length === 1);
  assert.equal(toasts[0].msg, "1 was already here.");
  assert.equal(toasts[0].tone, undefined);
  assert.equal(stateNow().photos.length, 0);
});

test("a photo that failed in an earlier press is not counted again by the next one's end", async () => {
  const held = heldAdds();
  S.addPhotos([photo("a.jpg")], flash);
  await waitFor(() => held.length === 1);
  held[0].resolve({ kept: false, message: "no" });
  await waitFor(() => toasts.length === 1);
  S.addPhotos([photo("b.jpg")], flash);
  await waitFor(() => held.length === 2);
  held[1].resolve({ kept: true, twin: true });
  await waitFor(() => toasts.length === 2);
  assert.equal(toasts[1].msg, "1 was already here.");
  assert.equal(toasts[1].tone, undefined);
  assert.equal(stateNow().photos.length, 1, "and it still stands, for its Try again");
});

test("past what one press takes, the first are taken and the page says so, where 34 of 20 once refused them all", async () => {
  const held = heldAdds();
  const many = Array.from({ length: 105 }, (_, i) => photo(`p${i}.jpg`));
  S.addPhotos(many, flash);
  assert.equal(stateNow().photos.length, 100);
  assert.match(stateNow().said, /first 100 of 105/);
  await waitFor(() => held.length === 3);
  const before = stateNow().photos.length;
  for (const p of stateNow().photos.filter((x) => x.state === "waiting")) S.takeAway(p.key);
  assert.ok(before > stateNow().photos.length);
  for (const h of held) h.resolve(KEPT);
  await waitFor(() => toasts.length === 1);
});

test("a door that threw is a failed photo, never one that says it is sending for ever", async () => {
  S.fileVerbs.add = async () => {
    throw new Error("a bug of ours");
  };
  S.addPhotos([photo("a.jpg")], flash);
  await waitFor(() => toasts.length === 1);
  assert.equal(stateNow().photos[0].state, "failed");
});

test("the screen is held awake while there is work, and a refusal stops nothing", async () => {
  const lock = { released: 0, release: async () => void lock.released++ };
  const asked = [];
  globalThis.navigator.wakeLock = {
    request: async (kind) => {
      asked.push(kind);
      return lock;
    },
  };
  const held = heldAdds();
  try {
    S.addPhotos([photo("a.jpg")], flash);
    await waitFor(() => held.length === 1 && asked.length === 1);
    assert.equal(asked[0], "screen");
    held[0].resolve(KEPT);
    await waitFor(() => toasts.length === 1);
    assert.equal(lock.released, 1);

    globalThis.navigator.wakeLock = {
      request: async () => {
        throw new Error("low battery");
      },
    };
    S.addPhotos([photo("b.jpg")], flash);
    await waitFor(() => held.length === 2);
    held[1].resolve(KEPT);
    await waitFor(() => toasts.length === 2);
  } finally {
    delete globalThis.navigator.wakeLock;
  }
});

/* --------------------------------------------------- the three steps, over the real client */

const envelope = (data, status = 200) =>
  new Response(JSON.stringify({ ok: status < 400, ...(status < 400 ? { data } : { error: data }) }), {
    status,
    headers: { "content-type": "application/json" },
  });

/** The server and storage: `put` and `done` step through what each answer is, in order, and each call is kept. */
function theServer({ put = [], done = [] }) {
  const calls = [];
  win.fetch = async (url, init = {}) => {
    const u = String(url);
    calls.push({ method: init.method ?? "GET", url: u, body: init.body });
    if (u.includes("/files/start")) return envelope({ id: "f1", upload_url: "https://storage.example/up" });
    if (u.includes("/done")) {
      const next = done.shift();
      if (next === "drop") throw new TypeError("network");
      return next ?? envelope({ file_id: "f1", twin: false });
    }
    if (u.startsWith("https://storage.example/")) {
      const next = put.shift();
      if (next === "drop") throw new TypeError("network");
      return next ?? new Response("{}", { status: 200 });
    }
    throw new Error(`nothing answers ${u}`);
  };
  return calls;
}
const realFile = (name = "a.jpg", type = "image/jpeg") => new File([new Uint8Array(8)], name, { type });
const of = (calls, part) => calls.filter((c) => c.url.includes(part));

/** Waits are the steps' own, so the clock is moved for them. */
const quickly = (t) => {
  const real = globalThis.setTimeout;
  t.mock.method(globalThis, "setTimeout", (fn, _ms, ...args) => real(fn, 0, ...args));
};

test("an add: asked for, sent, proven; the name and kind are said when it is proven, and the list isn't read for each", async () => {
  const calls = theServer({});
  assert.deepEqual(await realAdd(realFile("IMG_1.jpg")), { kept: true, twin: false, id: "f1" });
  assert.deepEqual(
    calls.map((c) => c.method),
    ["POST", "PUT", "POST"],
  );
  assert.deepEqual(JSON.parse(of(calls, "/files/start")[0].body), { mime: "image/jpeg", bytes: 8 });
  assert.deepEqual(JSON.parse(of(calls, "/done")[0].body), { name: "IMG_1.jpg", mime: "image/jpeg" });
  const form = of(calls, "storage.example")[0].body;
  assert.equal(form.get("cacheControl"), "31536000", "its bytes never change");
});

/** A browser's own way to send that can say how far: told what each send does (a status, or "drop"), and every send kept. */
function aPutThatSays(steps = []) {
  const puts = [];
  globalThis.XMLHttpRequest = class {
    upload = {};
    headers = {};
    open(method, url) {
      this.method = method;
      this.url = url;
    }
    setRequestHeader(name, value) {
      this.headers[name] = value;
    }
    send(body) {
      puts.push({ method: this.method, url: this.url, headers: this.headers, body });
      const step = steps.shift() ?? 200;
      queueMicrotask(() => {
        if (step === "drop") return this.onerror();
        for (let loaded = 0; loaded <= 100; loaded++)
          this.upload.onprogress({ lengthComputable: true, loaded, total: 100 });
        this.status = step;
        this.onload();
      });
    }
  };
  return puts;
}

test("a photo says how far it has gone, a step at a time and never each packet, by the road that can say", async () => {
  const calls = theServer({});
  const puts = aPutThatSays();
  try {
    const said = [];
    assert.deepEqual(await realAdd(realFile("IMG_2.jpg"), (sent) => said.push(sent)), {
      kept: true,
      twin: false,
      id: "f1",
    });
    assert.deepEqual(
      [puts[0].method, puts[0].url, puts[0].headers["x-upsert"]],
      ["PUT", "https://storage.example/up", "false"],
    );
    assert.equal(puts[0].body.get("cacheControl"), "31536000", "the same request");
    assert.equal(of(calls, "storage.example").length, 0, "not sent twice");
    assert.ok(said.length <= 51, `a step at a time: ${said.length}`);
    assert.deepEqual(
      said,
      [...said].sort((x, y) => x - y),
      "only ever forward",
    );
    assert.equal(said.at(-1), 1, "and it says when it is all gone");
    puts.length = 0;
    await realAdd(realFile("IMG_3.jpg"));
    assert.equal(puts.length, 0, "one that doesn't ask (a question's photo) goes by fetch");
    assert.equal(of(calls, "storage.example").length, 1);
  } finally {
    delete globalThis.XMLHttpRequest;
  }
});

test("a dropped line or a server's failure is sent again by the same road, and a refusal is a refusal", async (t) => {
  quickly(t);
  theServer({});
  const puts = aPutThatSays(["drop", 503, 200]);
  try {
    assert.deepEqual(await realAdd(realFile(), () => {}), { kept: true, twin: false, id: "f1" });
    assert.equal(puts.length, 3);
    puts.length = 0;
    delete globalThis.XMLHttpRequest;
    const refused = aPutThatSays([403]);
    assert.equal((await realAdd(realFile(), () => {})).kept, false);
    assert.equal(refused.length, 1, "asked once");
  } finally {
    delete globalThis.XMLHttpRequest;
  }
});

test("what is on its way says how far, and a photo that failed does not go on saying so", async () => {
  let finish;
  let told;
  S.fileVerbs.add = (_f, onSent) =>
    new Promise((resolve) => {
      finish = resolve;
      told = onSent;
    });
  S.addPhotos([photo("a.jpg")], flash);
  await waitFor(() => finish);
  assert.equal(stateNow().photos[0].sent, 0, "going, from nothing");
  told(0.5);
  assert.equal(stateNow().photos[0].sent, 0.5);
  finish({ kept: false, message: "no" });
  await waitFor(() => stateNow().photos[0].state === "failed");
  assert.equal(stateNow().photos[0].sent, null);
});

test("a dropped line is sent again, and past a first try storage's answer is left for the proof to judge", async (t) => {
  quickly(t);
  const calls = theServer({ put: ["drop", new Response("Duplicate", { status: 400 })] });
  assert.deepEqual(await realAdd(realFile()), { kept: true, twin: false, id: "f1" });
  assert.equal(of(calls, "storage.example").length, 2);
  assert.equal(of(calls, "/done").length, 1);
});

test("a first refusal from storage is a refusal, and a line that never comes back says so, having tried", async (t) => {
  quickly(t);
  let calls = theServer({ put: [new Response("Forbidden", { status: 403 })] });
  assert.equal((await realAdd(realFile())).kept, false);
  assert.equal(of(calls, "storage.example").length, 1);
  assert.equal(of(calls, "/done").length, 0);

  calls = theServer({ put: ["drop", "drop", "drop", "drop"] });
  assert.equal((await realAdd(realFile())).kept, false);
  assert.equal(of(calls, "storage.example").length, 3);
  assert.equal(calls.filter((c) => c.method === "DELETE").length, 0, "nothing to take back: there is no file");
});

test("the proof is asked again on a dropped line or a server's failure, and not on a refusal, which is the answer", async (t) => {
  quickly(t);
  const busy = () => envelope({ code: "internal", message: "try later" }, 503);
  let calls = theServer({ done: ["drop", busy()] });
  assert.deepEqual(await realAdd(realFile()), { kept: true, twin: false, id: "f1" });
  assert.equal(of(calls, "/done").length, 3);

  calls = theServer({ done: [envelope({ code: "validation", message: "That photo is too small to use." }, 400)] });
  assert.deepEqual(await realAdd(realFile()), { kept: false, message: "That photo is too small to use." });
  assert.equal(of(calls, "/done").length, 1);
});

test("a kind we don't keep or a photo past the limit never starts, and a HEIC a desk names by its extension alone does", async () => {
  const calls = theServer({});
  assert.equal((await realAdd(realFile("a.gif", "image/gif"))).kept, false);
  assert.equal((await realAdd({ name: "big.jpg", type: "image/jpeg", size: 25_000_001 })).kept, false);
  assert.equal(calls.length, 0);
  assert.equal((await realAdd(realFile("a.HEIC", ""))).kept, true);
  assert.equal(JSON.parse(of(calls, "/files/start")[0].body).mime, "image/heic");
});
