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
      'export { ContentViewRow } from "../../apps/dashboard/src/surfaces/campaigns/content/views.tsx";\n' +
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
const TALLY = { made: 0, posted: 0, needs: 0, making: 0, scheduled: 0, library: 0, aside: 0, waiting: 0 };
/** Ask's three ideas of what it can make (contracts content/ideas.ts), none with a file of the Library to start from. */
const IDEAS = ["before_after", "video", "photo_post"].map((key) => ({ key, files: [] }));
const page = (over = {}) => ({
  view: "all",
  making: [],
  made: [],
  lines: [],
  next: null,
  ideas: IDEAS,
  about: null,
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

test("nothing made says what Ask makes and offers what it can make now, each in one press", () => {
  const html = draw(page());
  assert.equal(count(html, "cnv-empty"), 1);
  assert.match(html, /Nothing made yet/);
  assert.match(html, /Ask makes posts from your photos\./, "a workspace that takes no videos is promised none");
  assert.doesNotMatch(html, /videos from your clips/);
  assert.equal(count(html, "cnv-idea-photo_post"), 1, "an idea of Ask's, asked for in one press");
  assert.equal(count(html, "cnv-idea-video"), 0, "and no video where the workspace takes none");
  const videos = S.renderToStaticMarkup(S.createElement(S.ContentBody, { held: page(), acts, videos: true }));
  assert.match(videos, /posts from your photos and videos from your clips/);
  assert.equal(count(videos, "cnv-idea-video"), 1);
  assert.equal(count(html, "cnv-making-title"), 0);
  assert.equal(count(html, "cnv-made-title"), 0);
});

test("an idea is offered only where what it is made from is there, and an empty Library is the way in", () => {
  const none = ["before_after", "video", "photo_post"].map((key) => ({ key, files: [], ready: false }));
  const html = draw(page({ ideas: none }));
  assert.equal(count(html, "cnv-idea-photo_post"), 0, "never your newest photo with no photo");
  assert.match(html, /Ask makes posts from your photos\. Add a few to start\./);
  assert.equal(count(html, "cnv-first-add"), 1, "the Library is empty: its door leads");
  const kept = draw(page({ ideas: none.map((i) => ({ ...i, ready: i.key === "photo_post" })), tally: { library: 1 } }));
  assert.equal(count(kept, "cnv-idea-photo_post"), 1);
  assert.equal(count(kept, "cnv-first-add"), 0, "something kept: the ideas lead");
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
      // All's first page carries the posts that stopped with their pieces, as the reader answers it (readers/content.ts).
      lines: [{ post: post("instagram", "failed"), file: fileOf(4) }],
      tally: { made: 5, posted: 2, needs: 1 },
    }),
  );
  assert.equal(count(html, "cnv-tile"), 5);
  assert.match(html, /class="files-grid cnv-grid"/, "the Library's grid: a square tile each, as the Library's are");
  assert.equal(count(html, "cnv-said"), 5);
  // All stands under its headings, what needs the owner first: the piece whose post stopped heads it, once.
  assert.equal(count(html, "cnv-made-part"), 1);
  assert.equal(count(html, "cnv-group-needs"), 1, "what needs the owner is a group of its own, first");
  assert.ok(html.indexOf('data-testid="cnv-group-needs"') < html.indexOf("Open saturdays 1"), "Needs you heads All");
  assert.match(html, />Ready to post</);
  assert.match(html, />Posting to Instagram</);
  assert.match(html, />On Instagram and Google · /);
  assert.match(html, />Didn&#x27;t post</);
  assert.match(html, />Ready to save</, "a video is saved, never posted from here (decision 0121)");
  assert.match(html, /data-tone="need" data-testid="cnv-said"/, "a post that stopped is marked as needing the owner");
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
  assert.match(html, /Didn&#x27;t post · Instagram is busy right now\./);
  assert.match(html, /Nothing else needs you\./, "the list says when it is all of it");
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
  const tally = { made: 8, posted: 3, needs: 2, making: 1, scheduled: 2, library: 0, aside: 0 };
  const html = S.renderToStaticMarkup(S.createElement(S.ContentViewRow, { view: "all", tally, onView: noop }));
  for (const v of ["all", "needs", "making", "scheduled", "posted"]) assert.equal(count(html, `cnv-view-row-${v}`), 1);
  assert.match(html, /aria-pressed="true"[^>]*data-testid="cnv-view-row-all"/);
  assert.match(html, /Needs you<span class="cnv-owed"/);
  assert.match(html, />8</);
});

test("a piece its owner posted by hand says so on its tile, as one that is up", () => {
  const said = { id: "h-1", at: "2026-11-11T15:00:00Z", link: "https://www.tiktok.com/@harbor/video/1" };
  const html = draw(page({ made: [{ file: fileOf(1), posts: [], by_hand: said }], tally: { made: 1 } }));
  assert.match(html, /data-tone="up" data-testid="cnv-said"/);
  assert.match(html, /On TikTok, by you · /);
  assert.doesNotMatch(html, /Ready to (post|save)/);
});
