/**
 * A made piece, opened on Campaigns › Content (apps/dashboard/src/surfaces/campaigns/content/piece.tsx), bundled for node
 * with the dashboard's own React and drawn in each standing it has: one act leads, and it is the piece's next step; where it
 * stands at each place is said once a place; a video says what Instagram takes; a reader is offered nothing that changes it.
 * And the pieces read ahead of a walk (read-ahead.ts), and the composer that posts one to both places (post-both.tsx).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { build } from "esbuild";
import { ROOT } from "../../_source.mjs";
import { piecesToReadAhead } from "../../../apps/dashboard/src/surfaces/campaigns/content/model/piece-open.ts";

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
      'export { ContentPieceShown } from "../../apps/dashboard/src/surfaces/campaigns/content/piece.tsx";\n' +
      'export { PostBoth, PostBothActs } from "../../apps/dashboard/src/surfaces/campaigns/content/post-both.tsx";\n' +
      'export { renderToStaticMarkup } from "react-dom/server";\n' +
      'export { createElement } from "react";\n',
    resolveDir: path.join(ROOT, "tests/content"),
    sourcefile: "a-piece-opens.ts",
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
const file = path.join(os.tmpdir(), `a-piece-opens-${process.pid}-${Date.now()}.cjs`);
fs.writeFileSync(file, out.outputFiles[0].text);
const S = createRequire(import.meta.url)(file);
fs.rmSync(file, { force: true });

const count = (html, testid) => html.split(`data-testid="${testid}"`).length - 1;
const noop = () => {};
const acts = {
  onClose: noop,
  onBefore: null,
  onAfter: null,
  onNext: noop,
  onPull: noop,
  onAsk: noop,
  onMakePost: noop,
  onChange: null,
  onRename: noop,
  onAside: noop,
  onDelete: noop,
};
const fileOf = (kind, over = {}) => ({
  id: "ffffffff-0000-4000-8000-000000000001",
  kind,
  status: "filed",
  source: "made",
  name: "saturdays-fill-first",
  bytes: 1000,
  width: 1080,
  height: kind === "video" ? 1920 : 1350,
  seconds: kind === "video" ? 10.2 : null,
  media_status: kind === "video" ? "ready" : null,
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
const post = (place, status, over = {}) => ({
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
  ...over,
});
const draw = ({ kind = "image", posts = [], takes = { instagram: true, google: true }, may = true, beside = null }) =>
  S.renderToStaticMarkup(
    S.createElement(S.ContentPieceShown, {
      made: { file: fileOf(kind), posts },
      takes,
      may,
      busy: false,
      beside,
      phone: false,
      shape: "portrait",
      choose: noop,
      clock: { stamp: () => "today 3:01 PM", ahead: () => "tomorrow 9:00 PM" },
      problem: null,
      acts,
    }),
  );

test("a post with nothing out leads with Post, and says Not yet at both places", () => {
  const html = draw({});
  assert.equal(count(html, "cnv-next"), 1, "one act leads");
  assert.match(html, /data-testid="cnv-next"[^>]*>Post</);
  assert.equal(count(html, "cnv-stand"), 2);
  assert.equal(html.split(">Not yet<").length - 1, 2);
});

test("a post that is up on Instagram leads with the next place", () => {
  const html = draw({ posts: [post("instagram", "published")] });
  assert.match(html, /data-testid="cnv-next"[^>]*>Post to Google</);
  assert.match(html, /Posted today 3:01 PM/);
});

test("a post that failed leads with Try again, and says it stopped", () => {
  const html = draw({ posts: [post("instagram", "failed", { error: "Instagram is busy right now." })] });
  assert.match(html, /data-testid="cnv-next"[^>]*>Try again</);
  assert.match(html, /data-stands="stuck"/);
  assert.match(html, />Didn&#x27;t post</);
  assert.match(html, /data-testid="cnv-why"[^>]*>Instagram is busy right now\.</, "why is said in the foot");
});

test("a post on its way leads with nothing, and offers Don't post while it can be stopped", () => {
  const queued = draw({ posts: [post("instagram", "queued")] });
  assert.equal(count(queued, "cnv-next"), 0);
  assert.equal(count(queued, "cnv-pull"), 1);
  assert.equal(count(draw({ posts: [post("instagram", "publishing")] }), "cnv-pull"), 0, "too late to stop");
});

test("a video says what Instagram takes, leads with Save video, and offers a post made from it", () => {
  const html = draw({ kind: "video" });
  assert.equal(count(html, "cnv-video-note"), 1);
  assert.match(html, /Instagram can&#x27;t take a video from here yet\./);
  assert.equal(count(html, "cnv-save"), 1, "one Save, the one that leads");
  assert.match(html, /Save video/);
  assert.equal(count(html, "cnv-make-post"), 1);
  assert.equal(count(html, "cnv-stand"), 0, "a video says no place");
});

test("a reader sees where it stands and may save it, and is offered nothing that changes it", () => {
  const html = draw({ may: false });
  assert.equal(count(html, "cnv-next"), 0);
  assert.equal(count(html, "cnv-more"), 0);
  assert.equal(count(html, "cnv-save"), 1);
  assert.equal(count(html, "cnv-stand"), 2);
});

test("it says where it stands among the pieces, and offers the ones beside it on a desk", () => {
  const html = draw({ beside: { at: 2, of: 8, before: "a", after: "c" } });
  assert.match(html, /2 of 8/);
  assert.equal(count(html, "cnv-before"), 1);
  assert.equal(count(html, "cnv-after"), 1);
});

test("a made post is drawn at the shape chosen, with Files' choice of shape under it", () => {
  const html = draw({});
  assert.match(html, /\?shape=portrait/);
  assert.equal(count(html, "cnv-shape-square"), 1);
});

test("the two after the open piece are read ahead, each once", () => {
  const made = ["a", "b", "c", "d"].map((id) => ({ file: { id, kind: "image" } }));
  assert.deepEqual(piecesToReadAhead(made, "a", new Set()), ["b", "c"]);
  assert.deepEqual(piecesToReadAhead(made, "c", new Set()), ["d"]);
  assert.deepEqual(piecesToReadAhead(made, "d", new Set()), []);
  assert.deepEqual(piecesToReadAhead(made, "a", new Set(["b"])), ["c"]);
  assert.deepEqual(piecesToReadAhead(made, "z", new Set()), []);
});

/** The composer's state, as usePostBoth hands it to what draws it. */
const both = (draft, over = {}) => ({
  open: true,
  draft,
  takes: { instagram: true, google: true },
  busy: false,
  refused: {},
  problem: null,
  canSend: true,
  begin: noop,
  cancel: noop,
  toggle: noop,
  choose: noop,
  write: noop,
  at: noop,
  send: noop,
  ...over,
});
const draft = (over = {}) => ({
  instagram: true,
  google: true,
  as: "picture",
  words: "Saturdays fill first.",
  when: null,
  ...over,
});
const compose = (state) => S.renderToStaticMarkup(S.createElement(S.PostBoth, { both: state }));
const composeFoot = (state) => S.renderToStaticMarkup(S.createElement(S.PostBothActs, { both: state }));

test("the composer offers each place that can take it, says which are on, and sends to the ones on", () => {
  const html = compose(both(draft()));
  assert.match(html, /aria-pressed="true"[^>]*data-testid="cnv-place-instagram"/);
  assert.match(html, /aria-pressed="true"[^>]*data-testid="cnv-place-google"/);
  assert.equal(count(html, "cnv-as-picture"), 1, "Instagram as a post or a story");
  assert.equal(count(html, "cnv-words"), 1);
  assert.equal(count(html, "cnv-when-now"), 1, "a time with Google on too: Google keeps a time (00616)");
  assert.match(composeFoot(both(draft())), /Post to Instagram and Google</);
});

test("with Google off a time is offered, and the send names Instagram alone", () => {
  const html = compose(both(draft({ google: false })));
  assert.match(html, /aria-pressed="false"[^>]*data-testid="cnv-place-google"/);
  assert.equal(count(html, "cnv-when-now"), 1);
  assert.equal(count(html, "cnv-when-morning"), 1);
  assert.match(composeFoot(both(draft({ google: false }))), /Post to Instagram</);
});

test("a place the record says cannot take it is not offered", () => {
  const html = compose(both(draft({ google: false }), { takes: { instagram: true, google: false } }));
  assert.equal(count(html, "cnv-place-google"), 0);
});

test("a story alone asks for no words", () => {
  const html = compose(both(draft({ google: false, as: "story", words: "" })));
  assert.equal(count(html, "cnv-words"), 0);
  assert.match(html, /A story shows no caption\./);
});

test("what stops a send is said once, and the send waits for it", () => {
  const state = both(draft({ words: "" }), { problem: "Write the words that go with it.", canSend: false });
  assert.equal(count(compose(state), "cnv-compose-problem"), 1);
  assert.match(composeFoot(state), /disabled=""[^>]*data-testid="cnv-compose-send"/);
});

test("a place that was refused says why under its row", () => {
  const state = both(draft({ instagram: false }), { refused: { google: "Google is busy right now." } });
  assert.match(compose(state), /Google: Google is busy right now\./);
});

test("a post that waits for its time is said apart, with its Don't post, and the next place still leads", () => {
  const html = draw({
    posts: [
      post("instagram", "published"),
      post("instagram", "queued", { id: "story", kind: "story", scheduled_for: "2099-01-01T00:00:00Z" }),
    ],
  });
  assert.equal(count(html, "cnv-timed"), 1);
  assert.match(html, /A story on Instagram goes up tomorrow 9:00 PM/);
  assert.equal(count(html, "cnv-pull"), 1);
  assert.match(html, /data-testid="cnv-next"[^>]*>Post to Google</);
});
