/**
 * A made piece, opened on Campaigns › Content, bundled for node with the dashboard's own React and drawn in each standing it
 * has: on a desk, Campaigns' pane beside the grid (campaigns/content/viewer/desk.tsx PieceDesk, the content canvas's Desk);
 * on a phone, the full-screen viewer (viewer/viewer.tsx PieceViewer, PhView). Both are handed the same piece, record, presses
 * and drafts (piece.tsx ContentPiece). One act leads, and it is the piece's next step; where it stands is said once, in one
 * row (Ruben, 12 Nov 2026: no chip per place, no row for a post that waits, no greyed press), which opens the one list of
 * places; a video Ask made leads with Post, whose sheet says what a video can do today; a reader is offered nothing that
 * changes it; on a desk, what a phone opens as a sheet stands in the pane's body. And the pieces read ahead of a walk
 * (read-ahead.ts), the list of places that is the composer too (post-both.tsx, its own state run for real), and the one
 * line to Ask (sheets/ask-change.tsx).
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
const CONTENT = "../../apps/dashboard/src/surfaces/campaigns/content";

globalThis.window = {
  location: { pathname: "/w/harbor/campaigns/content", search: "", hash: "", href: "http://127.0.0.1/", assign() {} },
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

/**
 * The list's own state (post-both.tsx usePostBoth), run for real with no browser: drawn on the server, each press of `script`
 * made as a draw lands (a component may set its own state as it draws, and React draws it again), and what it then holds.
 */
const BOTH_AFTER =
  `import { usePostBoth } from "${CONTENT}/post-both.tsx";\n` +
  'import { createElement as el } from "react";\n' +
  'import { renderToStaticMarkup as draw } from "react-dom/server";\n' +
  "export function bothAfter(piece, script) {\n" +
  "  const tell = { done() {}, flash() {}, pull() {}, pulling: false, pullProblem: null };\n" +
  "  let step = 0;\n" +
  "  let seen = null;\n" +
  "  function Probe() {\n" +
  "    seen = usePostBoth(piece, tell);\n" +
  "    if (step < script.length) script[step++](seen);\n" +
  "    return null;\n" +
  "  }\n" +
  "  draw(el(Probe));\n" +
  "  return seen;\n" +
  "}\n";

const out = await build({
  stdin: {
    contents:
      `export { PieceDesk } from "${CONTENT}/viewer/desk.tsx";\n` +
      `export { PieceViewer } from "${CONTENT}/viewer/viewer.tsx";\n` +
      `export { AskLine } from "${CONTENT}/sheets/ask-change.tsx";\n` +
      `export { handLinkOf } from "${CONTENT}/model/hand-link.ts";\n` +
      `export { PostBoth, PostBothActs } from "${CONTENT}/post-both.tsx";\n` +
      'export { renderToStaticMarkup } from "react-dom/server";\n' +
      'export { createElement } from "react";\n' +
      BOTH_AFTER,
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
/** The words a press says, from its test id to its close: its glyph is drawn first, so the words are what follow it. */
const saysOf = (html, testid) => {
  const at = html.indexOf(`data-testid="${testid}"`);
  if (at < 0) return null;
  const end = html.indexOf("</button>", at);
  return html
    .slice(html.indexOf(">", at) + 1, end)
    .replace(/<[^>]+>/g, "")
    .trim();
};
/** The opening tag that carries a test id, whole: what a screen reader and a stylesheet read of it. */
const tagOf = (html, testid) => {
  const at = html.indexOf(`data-testid="${testid}"`);
  return at < 0 ? null : html.slice(html.lastIndexOf("<", at), html.indexOf(">", at) + 1);
};
/** An apostrophe as the markup writes it. */
const marked = (words) => words.replaceAll("'", "&#x27;");
/** The status row: its tone and its one sentence. */
const statusOf = (html) => ({
  tone: /data-tone="([a-z]+)"/.exec(tagOf(html, "cnv-status") ?? "")?.[1] ?? null,
  said: /class="cnv-status-said">([^<]*)</.exec(html)?.[1] ?? null,
});
/** What a place's row says under its name, in the list of places. */
const placeSaid = (html, place) =>
  new RegExp(`data-testid="cnv-place-said-${place}"[^>]*>([^<]*)<`).exec(html)?.[1] ?? null;
const noop = () => {};
const agoIso = (ms) => new Date(Date.now() - ms).toISOString();
const DAY = 86_400_000;

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
  scheduled_for: new Date().toISOString(),
  published_at: status === "published" ? agoIso(3 * DAY) : null,
  error: null,
  created_at: "2026-11-11T15:00:00Z",
  ...over,
});
/** A post set for a time far ahead: one that waits, where one asked for now is going up. */
const LATER = "2099-01-01T00:00:00Z";

/** The presses an open piece holds (piece-presses.tsx usePiecePresses), at rest. */
const pressesOf = (over = {}) => ({
  busy: false,
  problem: null,
  asking: false,
  moved: noop,
  change: async () => null,
  clear: noop,
  say: noop,
  ask: noop,
  remove: noop,
  pull: noop,
  ...over,
});
const shut = { open: false, cancel: noop };
const ABOUT = { kind: "file", id: "ffffffff-0000-4000-8000-000000000001", label: "Saturdays fill first" };
/** Its drafts (usePieceDrafts), none open; `ready` says the record has been read, so the list of places can be opened. */
const draftsOf = (over = {}, ready = true) => ({
  version: shut,
  again: shut,
  still: { ...shut, offered: false },
  both: { ...shut, ready },
  about: ABOUT,
  open: false,
  ...over,
});
const actsOf = (over = {}) => ({
  onClose: noop,
  onBefore: null,
  onAfter: null,
  onNext: noop,
  onAsk: noop,
  onMakePost: noop,
  onChange: null,
  onAside: noop,
  onDelete: noop,
  ...over,
});
/** What piece.tsx hands the desk's pane and the phone's viewer alike. */
const handsOf = ({
  kind = "image",
  over = {},
  posts = [],
  takes = { instagram: true, google: true },
  may = true,
  beside = null,
  record = { made: null, video: null },
  presses = {},
  drafts = {},
  ready = true,
  acts = {},
  byHand = null,
} = {}) => ({
  made: { file: fileOf(kind, over), posts, by_hand: byHand },
  // "I posted it" as piece.tsx hands it (viewer/by-hand.tsx byHandPressOf): where it stands, and its three acts.
  byHand: { kept: byHand, say: noop, keepLink: async () => null, takeBack: noop },
  record,
  takes,
  may,
  beside,
  presses: pressesOf(presses),
  drafts: draftsOf(drafts, ready),
  acts: actsOf(acts),
  doors: {},
});
const desk = (o) => S.renderToStaticMarkup(S.createElement(S.PieceDesk, { hands: handsOf(o), over: false }));
const phone = (o) => S.renderToStaticMarkup(S.createElement(S.PieceViewer, { hands: handsOf(o), over: false }));
/** Each standing drawn both ways: the same piece says the same on a desk and on a phone. */
const both = (o) => [desk(o), phone(o)];

test("a post with nothing out leads with Post, and says once that it is ready, in one row", () => {
  for (const html of both({})) {
    assert.equal(count(html, "cnv-next"), 1, "one act leads");
    assert.equal(saysOf(html, "cnv-next"), "Post");
    assert.equal(count(html, "cnv-status"), 1, "one row says where it stands");
    assert.deepEqual(statusOf(html), { tone: "ready", said: "Ready to post" });
    assert.equal(count(html, "cnv-pull"), 0, "nothing is on its way to stop");
  }
});

test("the row opens the list of places, and its press says so to a screen reader; before the record is read it is no press", () => {
  const named = `aria-label="${marked("Ready to post. Where it's posted")}"`;
  const onPhone = tagOf(phone({}), "cnv-status-open");
  assert.match(onPhone, /^<button /, "a real press, which the keyboard reaches");
  assert.ok(onPhone.includes(named), "named by where it stands, then what it opens");
  assert.match(onPhone, /aria-haspopup="dialog"/, "on a phone it opens a sheet");
  const onDesk = tagOf(desk({}), "cnv-status-open");
  assert.ok(onDesk.includes(named));
  assert.doesNotMatch(onDesk, /aria-haspopup/, "on a desk it opens in the pane's own body");
  for (const html of both({ ready: false })) {
    assert.equal(count(html, "cnv-status-open"), 0, "nothing to open until the record says where it can go");
    assert.deepEqual(statusOf(html), { tone: "ready", said: "Ready to post" }, "and it still says where it stands");
  }
});

test("a post that is up on Instagram leads with the next place, and the row says where it is and since when", () => {
  for (const html of both({ posts: [post("instagram", "published")] })) {
    assert.equal(saysOf(html, "cnv-next"), "Post to Google");
    assert.equal(statusOf(html).tone, "up");
    assert.match(statusOf(html).said, /^On Instagram · \S+/);
  }
  const everywhere = [post("instagram", "published"), post("google", "published")];
  for (const html of both({ posts: everywhere })) {
    assert.match(statusOf(html).said, /^On Instagram and Google · \S+/);
    assert.equal(count(html, "cnv-next"), 0, "nothing leads once it is up everywhere");
    assert.equal(saysOf(html, "cnv-save"), "Save", "so Save takes the room, with its word");
  }
});

test("a post that failed leads with Post again, and the row says it stopped", () => {
  const failed = post("instagram", "failed", { error: "Instagram is busy right now." });
  for (const html of both({ posts: [failed] })) {
    assert.equal(saysOf(html, "cnv-next"), "Post again");
    assert.deepEqual(statusOf(html), { tone: "need", said: marked("Didn't post") });
    assert.doesNotMatch(
      html,
      /data-testid="cnv-line"[^>]*>Instagram is busy/,
      "why it stopped is said once, by its place",
    );
  }
  // What needs the owner is said before what waits: the row and the act that leads never say two things.
  const waiting = post("google", "queued", { id: "later", scheduled_for: LATER });
  for (const html of both({ posts: [failed, waiting] })) {
    assert.equal(saysOf(html, "cnv-next"), "Post again");
    assert.equal(statusOf(html).said, marked("Didn't post"));
    assert.equal(count(html, "cnv-pull"), 0, "the post that waits is stopped from the list of places");
  }
});

test("a post on its way is said in the row, its Don't post the sheet's (which the row opens), and no act is greyed in its place", () => {
  for (const html of both({ posts: [post("instagram", "queued")] })) {
    assert.equal(count(html, "cnv-next"), 0, "nothing else leads");
    assert.deepEqual(statusOf(html), { tone: "going", said: "Posting to Instagram" });
    assert.equal(count(html, "cnv-pull"), 0, "one Don't post, in the sheet");
    assert.doesNotMatch(html, /disabled=""/, "no press is drawn only to be dead");
    assert.equal(saysOf(html, "cnv-save"), "Save", "Save takes the room the act that leads would");
  }
});

test("a post that waits for its time is said in the row, and the next place still leads", () => {
  const posts = [
    post("instagram", "published"),
    post("instagram", "queued", { id: "story", kind: "story", scheduled_for: LATER }),
  ];
  for (const html of both({ posts })) {
    assert.equal(statusOf(html).tone, "timed", "set for its time: nothing turns until then");
    assert.match(statusOf(html).said, /^Story goes up /);
    assert.equal(count(html, "cnv-pull"), 0, "one Don't post, in the sheet");
    assert.equal(saysOf(html, "cnv-next"), "Post to Google");
  }
});

test("a video Ask made leads with Save video, plays with its sound on the glass, and has no row of places", () => {
  for (const html of both({ kind: "video" })) {
    assert.equal(count(html, "cnv-next"), 0, "nothing posts a video from here (decision 0121)");
    assert.equal(count(html, "cnv-video-save"), 1);
    assert.match(html, /Save video<\/a>/, "Save video leads");
    assert.equal(count(html, "cnv-sound"), 1);
    assert.match(html, /aria-label="Sound on"[^>]*data-testid="cnv-sound"/, "muted until asked");
    assert.equal(count(html, "cnv-status"), 0, "a video has no row of places");
    assert.equal(count(html, "cnv-change"), 1, "what Ask made is changed by its one round press");
  }
  assert.match(desk({ kind: "video" }), /<kbd>Space<\/kbd>Sound/, "Space turns the sound on a desk");
  assert.doesNotMatch(desk({}), /<kbd>Space<\/kbd>/, "a picture has no sound to turn");
  assert.equal(count(desk({ kind: "video", over: { media_status: "processing" } }), "cnv-sound"), 0, "not ready");
});

test("a reader sees where it stands and may save it, and is offered nothing that changes it", () => {
  for (const html of both({ may: false })) {
    assert.equal(count(html, "cnv-next"), 0);
    assert.equal(count(html, "cnv-more"), 0);
    assert.equal(count(html, "cnv-save"), 1);
    assert.equal(count(html, "cnv-ask"), 1);
    assert.deepEqual(statusOf(html), { tone: "ready", said: "Ready to post" });
    assert.equal(count(html, "cnv-status-open"), 1, "the list of places is theirs to read");
  }
  for (const html of both({ may: false, posts: [post("instagram", "queued")] }))
    assert.equal(count(html, "cnv-pull"), 0, "a post on its way is not theirs to stop");
  for (const html of both({ may: false })) assert.equal(count(html, "cnv-change"), 0, "Change it is not a reader's");
  // A video has no row of places, for anyone: a reader may save it.
  for (const html of both({ may: false, kind: "video" })) {
    assert.equal(count(html, "cnv-status"), 0);
    assert.equal(count(html, "cnv-video-save"), 1);
  }
  assert.doesNotMatch(desk({ may: false }), /<kbd>P<\/kbd>/, "P presses nothing for a reader");
});

test("a photo of the Library says no place, and leads with keeping it where it waits", () => {
  const library = { source: "upload", status: "inbox" };
  for (const html of both({ over: library })) {
    assert.equal(count(html, "cnv-status"), 0, "it goes nowhere until a post is made from it");
    assert.equal(saysOf(html, "cnv-next"), "Keep it");
  }
});

test("Delete is asked in place of the acts", () => {
  for (const html of both({ presses: { asking: true } })) {
    assert.equal(count(html, "cnv-remove-ask-confirm"), 1);
    assert.equal(count(html, "cnv-next"), 0);
  }
});

test("on a phone it says where it stands among the pieces; on a desk the keys walk to the ones beside it", () => {
  assert.match(phone({ beside: { at: 2, of: 8 } }), /data-testid="cnv-of"[^>]*>2 of 8</);
  const beside = desk({ beside: { at: 2, of: 8 }, acts: { onBefore: noop, onAfter: noop } });
  assert.match(beside, /<kbd>←<\/kbd><kbd>→<\/kbd>Next piece/);
  assert.match(beside, /<kbd>P<\/kbd>Post/);
  assert.match(beside, /<kbd>Esc<\/kbd>Close/);
  assert.doesNotMatch(desk({}), /Next piece/, "no walk where nothing stands beside it");
});

test("on a desk the pane has no head: its Close and its name are the piece's own, and it is named for a screen reader", () => {
  const html = desk({});
  assert.equal(count(html, "cm-pane-close"), 0);
  assert.equal(count(html, "cnv-close"), 1);
  assert.match(html, /<section[^>]*aria-label="Saturdays fill first"[^>]*class="[^"]*cnv-desk/);
  assert.match(html, /\?shape=portrait/, "a made post at the shape it is drawn in");
  assert.match(html, /class="cnv-viewer-blur"/, "over its own copy blurred to the stage's edges");
});

/** The list's state, as usePostBoth hands it to what draws it: a place switched on is one it is being sent to. */
const bothOf = (draft, over = {}) => ({
  open: true,
  draft,
  posts: [],
  takes: { instagram: true, google: true },
  wont: { instagram: null, google: null },
  offers: { instagram: true, google: true },
  ready: true,
  sending: draft.instagram || draft.google,
  may: true,
  busy: false,
  pulling: false,
  pullProblem: null,
  refused: {},
  problem: null,
  canSend: true,
  words: "Saturdays fill first.",
  begin: noop,
  cancel: noop,
  toggle: noop,
  choose: noop,
  write: noop,
  at: noop,
  pull: noop,
  send: noop,
  ...over,
});
const draft = (over = {}) => ({ instagram: true, google: true, as: "picture", ...over });
/** A draft with nothing switched on: the list as the status row opens it where nothing is sent. */
const OFF = { instagram: false, google: false };
const compose = (state, doors) => S.renderToStaticMarkup(S.createElement(S.PostBoth, { both: state, doors }));
const composeFoot = (state) => S.renderToStaticMarkup(S.createElement(S.PostBothActs, { both: state }));

test("on a desk the list stands in the pane's body under its head, its one coral press in the pane's foot", () => {
  const html = desk({ drafts: { both: bothOf(draft()), open: true } });
  assert.match(html, /<h3[^>]*>Post it<\/h3>/);
  assert.doesNotMatch(html, /· a picture/, "a title alone: the piece's name stands above it");
  assert.equal(count(html, "cnv-compose"), 1);
  assert.equal(count(html, "cnv-open-close"), 1, "its own ×, as the phone's sheet has");
  assert.equal(count(html, "cnv-next"), 0, "the piece's acts wait under it");
  assert.equal(count(html, "cnv-status"), 0, "and so does its status row: the list says each place");
  assert.equal(count(html, "cnv-keys"), 0);
  assert.match(html, /<footer class="cm-pane-foot capsule">.*data-testid="cnv-compose-send"/);
  assert.equal(count(html, "cnv-compose-cancel"), 0, "the × lets it go");
});

test("with nothing switched on it is the list of where it is posted: no words, no time and no send", () => {
  const up = bothOf(draft(OFF), { posts: [post("instagram", "published")] });
  const html = desk({ drafts: { both: up, open: true } });
  // Its title holds still as places are switched: Post it while a place can take the post.
  assert.match(html, /<h3[^>]*>Post it<\/h3>/);
  assert.match(html, /role="group" aria-label="Post it"/, "the rows are named as it is");
  const nowhere = bothOf(draft(OFF), {
    posts: [post("instagram", "published")],
    takes: { instagram: false, google: false },
  });
  assert.match(
    desk({ drafts: { both: nowhere, open: true } }),
    new RegExp(`<h3[^>]*>${marked("Where it's posted")}</h3>`),
    "where no place can take it, it is where it is posted",
  );
  assert.equal(count(html, "cnv-place-instagram"), 1);
  assert.equal(count(html, "cnv-place-google"), 1);
  assert.equal(count(html, "cnv-words"), 0);
  assert.equal(count(html, "cnv-when-now"), 0);
  assert.equal(count(html, "cnv-compose-send"), 0, "nothing is offered to send until a place is switched on");
  assert.doesNotMatch(html, /<footer class="cm-pane-foot/, "so the pane draws no foot");
});

test("the list offers each place that can take it, says which are on, and its caption; Post and Schedule send to the ones on", () => {
  const html = compose(bothOf(draft()));
  assert.match(html, /aria-checked="true"[^>]*data-testid="cnv-switch-instagram"/);
  assert.match(html, /aria-checked="true"[^>]*data-testid="cnv-switch-google"/);
  assert.match(html, /role="group" aria-label="Post it"/);
  assert.equal(placeSaid(html, "instagram"), null, "a place that can take it and holds nothing says nothing: one line");
  assert.equal(count(html, "cnv-as-picture"), 1, "Instagram as a post or a story");
  assert.match(
    html,
    /data-testid="cnv-words"[^>]*>Saturdays fill first\.</,
    "the caption that goes with it, said once",
  );
  const foot = composeFoot(bothOf(draft()));
  assert.equal(saysOf(foot, "cnv-compose-send"), "Post", "Post, a word alone");
  assert.match(tagOf(foot, "cnv-compose-send"), /aria-label="Post to Instagram and Google"/, "named for where it goes");
  assert.equal(count(foot, "cnv-compose-later"), 1, "and Schedule beside it, for a day and a time");
  assert.equal(count(foot, "cnv-post-ask"), 0, "Post asks first, once it is pressed");
});

test("with Google off the send names Instagram alone", () => {
  const html = compose(bothOf(draft({ google: false })));
  assert.match(html, /aria-checked="false"[^>]*data-testid="cnv-switch-google"/);
  const foot = composeFoot(bothOf(draft({ google: false })));
  assert.match(tagOf(foot, "cnv-compose-send"), /aria-label="Post to Instagram"/);
  assert.equal(count(foot, "cnv-compose-later"), 1);
});

test("a place says where the piece stands there first: up with its door, on its way with Don't post, stopped with why", () => {
  const door = S.createElement("a", { href: "https://example.com/p/1", "data-testid": "door" }, "See it");
  const up = compose(bothOf(draft(OFF), { posts: [post("instagram", "published")] }), { instagram: door });
  assert.match(tagOf(up, "cnv-place-instagram"), /data-stands="up"/);
  assert.match(placeSaid(up, "instagram"), /^Posted \S+/);
  assert.equal(count(up, "door"), 1, "the door to the post that is up, under its place");
  assert.match(
    up,
    /aria-checked="false"[^>]*data-testid="cnv-switch-instagram"/,
    "a second post there is switched on by hand",
  );

  const timed = post("instagram", "queued", { id: "story", kind: "story", scheduled_for: LATER });
  const waits = bothOf(draft(OFF), { posts: [timed], takes: { instagram: false, google: true } });
  assert.match(tagOf(compose(waits), "cnv-place-instagram"), /data-stands="timed"/);
  assert.equal(count(compose(waits), "cnv-switch-instagram"), 0, "one on its way there takes no second");
  assert.equal(count(compose(waits), "cnv-pull-instagram"), 1);
  assert.equal(count(compose({ ...waits, may: false }), "cnv-pull-instagram"), 0, "a reader stops nothing");
  assert.match(
    tagOf(compose({ ...waits, pulling: true }), "cnv-pull-instagram"),
    /disabled=""/,
    "a press already out is not made twice",
  );

  const stopped = (over) => bothOf(draft(OFF), { posts: [post("google", "failed", over)] });
  assert.equal(
    placeSaid(compose(stopped({ error: "Google is busy right now." })), "google"),
    marked("Didn't post · Google is busy right now."),
  );
  assert.equal(placeSaid(compose(stopped({})), "google"), marked("Didn't post"), "no reason is made up for it");
  // Let go where it is said: the same Don't post that stops one waiting for its time (00619), for whoever may post.
  assert.equal(count(compose(stopped({})), "cnv-pull-google"), 1, "a post that stopped is let go in its row");
  assert.equal(count(compose({ ...stopped({}), may: false }), "cnv-pull-google"), 0, "a reader lets nothing go");
});

test("a place that cannot take it says why and has no switch; one the workspace is not offered is not listed", () => {
  const why = "Connect your Business Profile first: posts go through it.";
  const unconnected = bothOf(draft({ google: false }), {
    takes: { instagram: true, google: false },
    wont: { instagram: null, google: why },
  });
  assert.equal(placeSaid(compose(unconnected), "google"), why);
  assert.equal(count(compose(unconnected), "cnv-switch-google"), 0);

  // Instagram is offered only where the workspace's Meta link is on: nothing is said of it otherwise.
  const noInstagram = { takes: { instagram: false, google: true }, offers: { instagram: false, google: true } };
  const unoffered = compose(bothOf(draft({ instagram: false }), noInstagram));
  assert.equal(count(unoffered, "cnv-place-instagram"), 0);
  assert.equal(count(unoffered, "cnv-place-google"), 1);
  // A post that went up there while it was offered is still the piece's: its row stays.
  const wasUp = compose(
    bothOf(draft({ instagram: false }), { ...noInstagram, posts: [post("instagram", "published")] }),
  );
  assert.match(placeSaid(wasUp, "instagram"), /^Posted /);
});

test("a post the record alone says is up on Google keeps its door, and its row says it is posted", () => {
  // One from before each post was kept has no post row (server posts/record.ts onGoogle): its door is handed in all the same.
  const door = S.createElement("a", { href: "https://example.com/g/1", "data-testid": "door" }, "See it");
  const state = bothOf(draft(OFF), { takes: { instagram: true, google: false } });
  const html = compose(state, { google: door });
  assert.match(tagOf(html, "cnv-place-google"), /data-stands="up"/);
  assert.equal(placeSaid(html, "google"), "Posted");
  assert.equal(count(html, "door"), 1);
  assert.equal(placeSaid(compose(state), "google"), null, "with no door handed in, nothing says it is up");
});

test("a Don't post that was refused says why in the list, which stands over the piece's own line", () => {
  const html = compose(bothOf(draft(OFF), { pullProblem: "That post already went up." }));
  assert.match(html, /role="alert" data-testid="cnv-pull-problem">That post already went up\.</);
  assert.equal(count(compose(bothOf(draft(OFF))), "cnv-pull-problem"), 0);
});

test("a story alone asks for no words", () => {
  const html = compose(bothOf(draft({ google: false, as: "story" }), { words: "" }));
  assert.equal(count(html, "cnv-words"), 0);
  assert.equal(count(html, "cnv-compose-problem"), 0);
});

test("what stops a send is said once, and the send waits for it", () => {
  const state = bothOf(draft({ words: "" }), { problem: "Write the words that go with it.", canSend: false });
  assert.equal(count(compose(state), "cnv-compose-problem"), 1);
  assert.match(composeFoot(state), /disabled=""[^>]*data-testid="cnv-compose-send"/);
});

test("a place that was refused says why under its row", () => {
  const state = bothOf(draft({ instagram: false }), { refused: { google: "Google is busy right now." } });
  assert.match(compose(state), /Google: Google is busy right now\./);
});

/** What the list reads of a piece (post-both.tsx PostBothPiece), with its record read and both places taking a post. */
const pieceOf = (over = {}) => ({
  id: "ffffffff-0000-4000-8000-000000000001",
  plan: { line: "Saturdays fill first", under: "Two chairs left this week" },
  posts: [],
  takes: { instagram: true, google: true },
  wont: { instagram: null, google: null },
  offers: { instagram: true, google: true },
  may: true,
  ...over,
});
/** Which places are on once `script` has been pressed on the list's own state, and whether anything is being sent. */
const onAfter = (piece, ...script) => {
  const state = S.bothAfter(piece, script);
  return { instagram: state.draft?.instagram ?? null, google: state.draft?.google ?? null, sending: state.sending };
};
const opens = (state) => state.begin();

test("opening the list switches on each place that can take the post now, and never one where it is already up", () => {
  assert.deepEqual(onAfter(pieceOf(), opens), { instagram: true, google: true, sending: true });
  const words = S.bothAfter(pieceOf({ caption: "  Saturdays fill first.  " }), [opens]).words;
  assert.equal(words, "Saturdays fill first.", "the piece's own caption, as it is sent");
  const upOnInstagram = pieceOf({ posts: [post("instagram", "published")] });
  assert.deepEqual(onAfter(upOnInstagram, opens), { instagram: false, google: true, sending: true });
  const upOnBoth = pieceOf({
    posts: [post("instagram", "published"), post("google", "published")],
    takes: { instagram: true, google: false },
  });
  assert.deepEqual(
    onAfter(upOnBoth, opens),
    { instagram: false, google: false, sending: false },
    "opening it where it is up everywhere arms no second post",
  );
  assert.deepEqual(
    onAfter(upOnBoth, opens, (state) => state.toggle("instagram")),
    { instagram: true, google: false, sending: true },
    "a second post there is the owner's own switch",
  );
});

test("the list opened for one place switches on that place alone, and only where it can take the post", () => {
  assert.deepEqual(
    onAfter(pieceOf(), (state) => state.begin("google")),
    { instagram: false, google: true, sending: true },
  );
  // Try again at a place that has stopped taking posts since (disconnected): it has no switch, so it is not on.
  const disconnected = pieceOf({ takes: { instagram: false, google: true } });
  assert.deepEqual(
    onAfter(disconnected, (state) => state.begin("instagram")),
    { instagram: false, google: false, sending: false },
  );
});

test("a reader's list switches nothing, and the list waits for the record before it opens", () => {
  const reader = S.bothAfter(pieceOf({ may: false }), [opens]);
  assert.equal(reader.open, true, "where it stands is theirs to read");
  assert.deepEqual(reader.takes, { instagram: false, google: false }, "no place has a switch");
  assert.deepEqual([reader.draft.instagram, reader.draft.google, reader.sending], [false, false, false]);
  const unread = S.bothAfter(pieceOf({ plan: null, takes: null, wont: null, offers: null }), [opens]);
  assert.deepEqual([unread.ready, unread.open], [false, false]);
});

test("the line to Ask is one box and one press, drawn as Ask's own line: named, waiting for words, and no note under it", () => {
  const html = S.renderToStaticMarkup(S.createElement(S.AskLine, { about: ABOUT, onAsked: noop }));
  assert.match(html, /^<div class="cnv-ask-line"/);
  assert.equal(html.split("<textarea").length - 1, 1, "one box for the owner's own words: the kit's line, which grows");
  assert.equal(html.split("<button").length - 1, 1, "and one press: no preset asks beside it");
  const box = tagOf(html, "cnv-ask-words");
  assert.match(box, /aria-label="Ask for a change"/);
  assert.match(box, /placeholder="Ask anything about it"/, "under the piece's own words, anything else");
  assert.match(box, /class="line-field cnv-ask-words"/, "Ask's own field");
  assert.doesNotMatch(html, /<p[ >]/, "no note under it: what asking does is Ask's card's to say");
  const send = tagOf(html, "cnv-ask-send");
  assert.match(send, /aria-label="Ask"/);
  assert.match(send, /class="line-send"/, "Ask's own round send");
  assert.match(send, /disabled=""/, "nothing is asked until there are words");
  const alone = S.renderToStaticMarkup(S.createElement(S.AskLine, { about: ABOUT, onAsked: noop, alone: true }));
  assert.match(
    tagOf(alone, "cnv-ask-words"),
    /placeholder="What should change\?"/,
    "alone, it asks what should change",
  );
});

test("the two after the open piece are read ahead, each once", () => {
  const made = ["a", "b", "c", "d"].map((id) => ({ file: { id, kind: "image" } }));
  assert.deepEqual(piecesToReadAhead(made, "a", new Set()), ["b", "c"]);
  assert.deepEqual(piecesToReadAhead(made, "c", new Set()), ["d"]);
  assert.deepEqual(piecesToReadAhead(made, "d", new Set()), []);
  assert.deepEqual(piecesToReadAhead(made, "a", new Set(["b"])), ["c"]);
  assert.deepEqual(piecesToReadAhead(made, "z", new Set()), []);
});

test("a video Ask made is marked as posted by its owner in one press, and once said it says so with its door", () => {
  for (const html of both({ kind: "video" })) {
    assert.equal(saysOf(html, "cnv-byhand-say"), "I posted it", "nothing posts a video from here: its owner says so");
    assert.equal(count(html, "cnv-byhand"), 0);
  }
  const said = { id: "h-1", at: agoIso(DAY), link: null };
  for (const html of both({ kind: "video", byHand: said })) {
    assert.equal(count(html, "cnv-byhand-say"), 0, "said once");
    assert.match(html, /Posted by you · yesterday/, "the tile's own sentence");
    assert.equal(saysOf(html, "cnv-byhand-add"), "Add its link");
    assert.equal(saysOf(html, "cnv-byhand-back"), "Not posted");
  }
  const linked = { ...said, link: "https://www.tiktok.com/@harbor/video/1" };
  for (const html of both({ kind: "video", byHand: linked })) {
    assert.match(html, /On TikTok, by you · yesterday/, "its link says where");
    assert.match(tagOf(html, "cnv-byhand-see"), /href="https:\/\/www\.tiktok\.com\/@harbor\/video\/1"/);
    assert.match(tagOf(html, "cnv-byhand-see"), /target="_blank"/);
    assert.equal(count(html, "cnv-byhand-add"), 0, "it has its link");
  }
  // A picture post is posted from here, so it is offered no such press; a reader is offered none, and sees where it stands.
  for (const html of both({})) assert.equal(count(html, "cnv-byhand-say"), 0);
  for (const html of both({ kind: "video", may: false })) assert.equal(count(html, "cnv-byhand-say"), 0);
  for (const html of both({ kind: "video", may: false, byHand: linked })) {
    assert.equal(count(html, "cnv-byhand-see"), 1);
    assert.equal(count(html, "cnv-byhand-back"), 0);
  }
});

test("a pasted link is kept as an address a browser opens, with its https where none was pasted", () => {
  assert.equal(S.handLinkOf("  https://www.instagram.com/reel/abc/  "), "https://www.instagram.com/reel/abc/");
  assert.equal(S.handLinkOf("tiktok.com/@harbor/video/1"), "https://tiktok.com/@harbor/video/1", "copied from the bar");
  assert.equal(S.handLinkOf("http://youtu.be/x"), "https://youtu.be/x");
  for (const not of ["", "   ", "my reel", "instagram", "https://"]) assert.equal(S.handLinkOf(not), null, not);
  assert.equal(S.handLinkOf(`https://example.com/${"x".repeat(500)}`), null, "longer than a link is kept");
});
