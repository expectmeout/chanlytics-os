/**
 * Campaigns › Content's body (apps/dashboard/src/surfaces/campaigns/content/body.tsx), bundled for node with the
 * dashboard's own React and drawn in each state it has: not read, a read that failed, nothing made, videos being made and one
 * not made, made pieces with where each stands, and more to show. And Campaigns' strip, which has its tab only where the
 * workspace's switch is on. Each state says one thing once.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { build } from "esbuild";
import { ROOT } from "../_source.mjs";

const DASHBOARD_MODULES = path.join(ROOT, "apps/dashboard/node_modules");

globalThis.window = {
  location: { pathname: "/w/harbor/campaigns/content", search: "", hash: "", assign() {} },
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

const out = await build({
  stdin: {
    contents:
      'export { ContentBody } from "../../apps/dashboard/src/surfaces/campaigns/content/body.tsx";\n' +
      'export { ContentViews } from "../../apps/dashboard/src/surfaces/campaigns/content/views.tsx";\n' +
      'export { campaignsChrome } from "../../apps/dashboard/src/surfaces/campaigns/routes.ts";\n' +
      'export { setSurfaceValue, surfaceValue } from "../../apps/dashboard/src/surfaces/surface-values.ts";\n' +
      'export { readMoreContent } from "../../apps/dashboard/src/surfaces/campaigns/content/surface.ts";\n' +
      'export { onSurfaceMoved } from "../../apps/dashboard/src/bridge/surface-status.ts";\n' +
      'export { renderToStaticMarkup } from "react-dom/server";\n' +
      'export { createElement } from "react";\n',
    resolveDir: path.join(ROOT, "tests/content"),
    sourcefile: "the-content-page.ts",
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
const file = path.join(os.tmpdir(), `content-page-${process.pid}-${Date.now()}.cjs`);
fs.writeFileSync(file, out.outputFiles[0].text);
const S = createRequire(import.meta.url)(file);
fs.rmSync(file, { force: true });

const noop = () => {};
const acts = { onOpen: noop, onMore: noop, onAsk: noop, onFiles: noop };
const draw = (held) => S.renderToStaticMarkup(S.createElement(S.ContentBody, { held, acts }));
const count = (html, testid) => html.split(`data-testid="${testid}"`).length - 1;

const fileOf = (n, over = {}) => ({
  id: `ffffffff-0000-4000-8000-${String(n).padStart(12, "0")}`,
  kind: "image",
  status: "filed",
  source: "made",
  name: `open-saturdays-${n}`,
  bytes: 1000,
  width: 1080,
  height: 1350,
  seconds: null,
  media_status: null,
  sound_said: null,
  shows: "graphic",
  who_in_it: "not_asked",
  people: null,
  look_status: "done",
  line: "A post.",
  issues: [],
  looks_like_stock: false,
  created_at: "2026-11-11T15:00:00Z",
  ...over,
});
const post = (place, status) => ({
  id: `${place}-${status}`,
  place,
  kind: "picture",
  caption: null,
  status,
  held_reason: null,
  permalink: null,
  scheduled_for: "2026-11-11T15:00:00Z",
  published_at: status === "published" ? "2026-11-11T15:01:00Z" : null,
  error: null,
  created_at: "2026-11-11T15:00:00Z",
});
const making = (over = {}) => ({
  id: "p-1",
  status: "making",
  stage: "drawing",
  failed_why: null,
  lines: ["Three years", "of layers."],
  language: "en",
  moments: 4,
  created_at: "2026-11-11T15:00:00Z",
  ...over,
});
const TALLY = { made: 0, posted: 0, needs: 0, making: 0, scheduled: 0 };
const page = (over = {}) => ({
  view: "all",
  making: [],
  made: [],
  lines: [],
  next: null,
  ...over,
  tally: { ...TALLY, ...over.tally },
});

test("before the read lands it says it is reading, and draws nothing it has not read", () => {
  const html = draw(undefined);
  assert.match(html, /aria-busy="true"/);
  assert.equal(count(html, "cnv-tile"), 0);
  assert.equal(count(html, "cnv-empty"), 0, "not read is never nothing there");
});

test("a read that failed says so, apart from nothing made", () => {
  const html = draw(null);
  assert.equal(count(html, "cnv-failed"), 1);
  assert.equal(count(html, "cnv-empty"), 0);
});

test("nothing made says what Ask makes and offers the two ways to start", () => {
  const html = draw(page());
  assert.equal(count(html, "cnv-empty"), 1);
  assert.match(html, /Nothing made yet/);
  assert.match(html, /Ask makes posts from your photos\./, "a workspace that takes no videos is promised none");
  assert.doesNotMatch(html, /videos from your clips/);
  const videos = S.renderToStaticMarkup(S.createElement(S.ContentBody, { held: page(), acts, videos: true }));
  assert.match(videos, /posts from your photos and videos from your clips/);
  assert.match(html, /Ask for one/);
  assert.match(html, /Open Library/);
  assert.equal(count(html, "cnv-making-title"), 0);
  assert.equal(count(html, "cnv-made-title"), 0);
});

test("a video being made leads the page with its words and where it is at", () => {
  const html = draw(page({ making: [making(), making({ id: "p-2", status: "failed", failed_why: "clips" })] }));
  assert.equal(count(html, "cnv-making"), 2);
  assert.match(html, /Being made/);
  assert.match(html, /Three years of layers\./);
  assert.match(html, /Putting it together/);
  assert.match(html, /Couldn(&#x27;|')t make it/);
  assert.match(html, /One of its clips or photos isn(&#x27;|')t in your Library any more/);
  assert.equal(count(html, "cnv-empty"), 0, "something being made is not nothing");
});

test("each made piece is a tile that says where it stands, once", () => {
  const html = draw(
    page({
      made: [
        { file: fileOf(1), posts: [] },
        { file: fileOf(2), posts: [post("instagram", "preparing")] },
        { file: fileOf(3), posts: [post("instagram", "published"), post("google", "published")] },
        { file: fileOf(4), posts: [post("instagram", "failed")] },
        {
          file: fileOf(5, { kind: "video", media_status: "ready", seconds: 11.7, width: 1080, height: 1920 }),
          posts: [],
        },
      ],
      tally: { made: 5, posted: 2 },
    }),
  );
  assert.equal(count(html, "cnv-tile"), 5);
  assert.match(html, /data-shape="tall"/, "a video's tile is tall");
  assert.match(html, /data-shape="portrait"/, "a 4:5 post's tile is portrait");
  assert.equal(count(html, "cnv-col"), 2, "a page with no width yet draws two columns, a phone's");
  assert.doesNotMatch(html, /cnv-grid/, "the grid of equal squares is gone");
  assert.equal(count(html, "cnv-said"), 5);
  assert.equal(html.split("5 pieces made · 2 posted").length - 1, 1, "what is made is headed by its count, said once");
  assert.match(html, />Ready to post</);
  assert.match(html, />On its way to Instagram</);
  assert.match(html, />On Instagram and Google</);
  assert.match(html, />Not posted\. Open it to see why\.</);
  assert.match(html, />Ready</, "a video is ready and no more");
  assert.match(html, /data-mark="stuck"/);
  assert.match(html, /Open saturdays 1/, "a file's name as a person reads it");
});

test("more is offered only where there is more", () => {
  const made = [{ file: fileOf(1), posts: [] }];
  assert.equal(count(draw(page({ made })), "cnv-more"), 0);
  const more = page({ made, next: "2026-11-11T15:00:00Z|x" });
  assert.equal(count(draw(more), "cnv-more"), 1);
  const reading = S.renderToStaticMarkup(S.createElement(S.ContentBody, { held: more, acts, gettingMore: true }));
  assert.match(reading, /aria-busy="true"[^>]*data-testid="cnv-more"|data-testid="cnv-more"[^>]*aria-busy="true"/);
});

test("more of what was made is read after what is there, and whoever draws it is told", async () => {
  const first = page({
    making: [making()],
    made: [{ file: fileOf(1), posts: [] }],
    next: "2026-11-11T15:00:00Z|x",
    tally: { made: 2, posted: 0 },
  });
  S.setSurfaceValue("content", { dto: first, fetchedAt: 1 });
  const asked = [];
  globalThis.window.fetch = async (url) => {
    asked.push(String(url));
    const data = page({ made: [{ file: fileOf(2), posts: [] }], tally: { made: 2, posted: 0 } });
    return new Response(JSON.stringify({ ok: true, data }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  let told = 0;
  const stop = S.onSurfaceMoved(["content"], () => (told += 1));
  await S.readMoreContent();
  stop();
  assert.equal(asked.length, 1);
  assert.ok(asked[0].includes("/api/v1/content?"), asked[0]);
  assert.ok(asked[0].includes("before=2026-11-11T15%3A00%3A00Z%7Cx"), asked[0]);
  const now = S.surfaceValue("content").dto;
  assert.deepEqual(
    now.made.map((m) => m.file.name),
    ["open-saturdays-1", "open-saturdays-2"],
  );
  assert.equal(now.next, null);
  assert.equal(now.making.length, 1, "what is being made is the first page's, and stays");
  assert.equal(told, 1, "no read of the surface's own landed, so its page is told its rows did");
  // With nothing more, a press asks for nothing.
  await S.readMoreContent();
  assert.equal(asked.length, 1);
});

/** The settings read as the surface holds it, with these features in the workspace's stored config. */
const settingsWith = (features) => S.setSurfaceValue("settings", { settings: { config: { features } }, messages: [] });

test("every workspace's Campaigns has a Content tab, after Messages and before Ads where Ads is drawn", () => {
  settingsWith({});
  const plain = S.campaignsChrome({ param: null });
  assert.deepEqual(
    plain.views.tabs.map((t) => t.id),
    ["sequences", "messages", "content"],
    "no switch draws it: Connect Meta's (content_preview) is off here",
  );
  assert.equal(plain.views.tabs.find((t) => t.id === "content").to, "campaigns/content");
  settingsWith({ ads_preview: true });
  assert.deepEqual(
    S.campaignsChrome({ param: null }).views.tabs.map((t) => t.id),
    ["sequences", "messages", "content", "ads"],
  );
});

test("the Content address wears Campaigns' crumbs and picks its tab in any workspace", () => {
  settingsWith({});
  const at = S.campaignsChrome({ param: "content" });
  assert.equal(at.views.picked, "content");
  assert.equal(at.mount, "campaigns");
  assert.equal(at.crumbs.at(-1), "Content");
});

const line = (n, place, status, over = {}) => ({
  post: { ...post(place, status), id: `line-${n}`, ...over },
  file: fileOf(n),
});

test("Needs you is lines: what stopped and why, with its act, and a video not made", () => {
  const html = draw(
    page({
      view: "needs",
      lines: [line(1, "instagram", "failed", { error: "Instagram is busy right now." })],
      making: [making({ status: "failed", failed_why: "clips", first_picture: fileOf(9).id })],
    }),
  );
  assert.equal(count(html, "cnv-line"), 1);
  assert.equal(count(html, "cnv-line-not-made"), 1);
  assert.match(html, /Didn&#x27;t post: Instagram is busy right now\./);
  assert.match(html, />Try again</);
  assert.equal(count(html, "cnv-tile"), 0, "a view of lines draws no tiles");
});

test("Posted is lines with a door to the post itself, and a view with nothing says so in one sentence", () => {
  const html = draw(
    page({ view: "posted", lines: [line(1, "instagram", "published", { permalink: "https://example.com/p/1" })] }),
  );
  assert.match(html, /href="https:\/\/example\.com\/p\/1"/);
  assert.match(draw(page({ view: "scheduled" })), /Nothing is waiting for its time\./);
  assert.match(draw(page({ view: "making" })), /Nothing is being made\./);
});

test("Being made is tiles, its first clip dim under Ask at work", () => {
  const html = draw(page({ view: "making", making: [making({ first_picture: fileOf(9).id })] }));
  assert.equal(count(html, "cnv-making"), 1);
  assert.ok(html.includes(`${fileOf(9).id}/view?w=480`));
  assert.equal(count(html, "fl-looking"), 1);
});

test("the views say how many each holds, and Needs you is marked while it holds anything", () => {
  const tally = { made: 8, posted: 3, needs: 2, making: 1, scheduled: 2 };
  const html = S.renderToStaticMarkup(
    S.createElement(S.ContentViews, { view: "all", tally, phone: false, onView: noop }),
  );
  for (const v of ["all", "needs", "making", "scheduled", "posted"]) assert.equal(count(html, `cnv-view-${v}`), 1);
  assert.match(html, /aria-pressed="true"[^>]*data-testid="cnv-view-all"/);
  assert.match(html, /Needs you<span class="cnv-owed"/);
  assert.match(html, />8</);
});
