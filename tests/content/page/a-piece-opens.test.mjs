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
import { until } from "../../shared/_until.mjs";

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
  "  return bothAfterTold(piece, script, {});\n" +
  "}\n" +
  "export function bothAfterTold(piece, script, told) {\n" +
  "  const tell = { done() {}, flash() {}, pull() {}, pulling: false, pullProblem: null, ...told };\n" +
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

/** The piece's own presses (piece-presses.tsx usePiecePresses), run for real the same way: what Don't post and its Undo ask. */
const PRESSES_OF =
  `import { usePiecePresses } from "${CONTENT}/piece-presses.tsx";\n` +
  "export function piecePressesOf(hands, posts) {\n" +
  "  let seen = null;\n" +
  "  function Probe() {\n" +
  "    seen = usePiecePresses(hands, posts);\n" +
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
      `export { PostBoth, PostBothActs } from "${CONTENT}/post-both.tsx";\n` +
      'export { renderToStaticMarkup } from "react-dom/server";\n' +
      'export { createElement } from "react";\n' +
      BOTH_AFTER +
      PRESSES_OF,
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
} = {}) => ({
  made: { file: fileOf(kind, over), posts },
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
    assert.equal(statusOf(html).tone, "going");
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
  // As the phone's one sheet holds it (Ruben, 12 Nov 2026: the desk still read the caption, and changed it elsewhere).
  assert.equal(count(html, "cnv-caption-box"), 1, "its caption, typed in place under the places");
  assert.equal(count(html, "cnv-made-line"), 1, "and what it was made from, on one line");
  assert.doesNotMatch(
    html,
    /Made<\/span> (Today|Yesterday|Tomorrow) at/,
    "said inside the line, its day is no capital: Made today, 3:00 PM",
  );
  assert.ok(html.indexOf('data-testid="cnv-compose"') < html.indexOf('data-testid="cnv-caption"'), "under the list");
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
  assert.equal(
    count(html, "cnv-words"),
    0,
    "its caption is the piece's own, typed in place under the list, not read here",
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
  // And is told who can: a reader reaches the sheet from what needs the owner, and saw a status with nothing to press.
  assert.equal(count(compose({ ...waits, may: false }), "cnv-cant-post"), 1, "a reader is told who can post");
  assert.equal(count(compose(waits), "cnv-cant-post"), 0, "whoever may post is told nothing of it");
  // Only where a press is missing: a piece up everywhere, with nothing waiting, has nothing left to post.
  const allUp = bothOf(draft(OFF), {
    posts: [post("instagram", "published"), post("google", "published")],
    takes: { instagram: false, google: false },
    could: { instagram: true, google: false },
    may: false,
  });
  assert.equal(count(compose(allUp), "cnv-cant-post"), 0, "nothing to do, so nothing is said of who could");
  const ready = bothOf(draft(OFF), {
    takes: { instagram: false, google: false },
    could: { instagram: true, google: true },
    may: false,
  });
  assert.equal(count(compose(ready), "cnv-cant-post"), 1, "a piece ready to post waits on someone who can");
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
  // Let go where it is said (00619), for whoever may post: Dismiss, where Don't post stops one that waits (Ruben, 12 Nov 2026).
  assert.equal(count(compose(stopped({})), "cnv-pull-google"), 1, "a post that stopped is let go in its row");
  assert.equal(saysOf(compose(stopped({})), "cnv-pull-google"), "Dismiss");
  assert.equal(saysOf(compose(waits), "cnv-pull-instagram"), marked("Don't post"));
  assert.equal(count(compose({ ...stopped({}), may: false }), "cnv-pull-google"), 0, "a reader lets nothing go");
});

test("a post up on Instagram and a story set for later there are said apart, each with its own press", () => {
  // Ruben, 12 Nov 2026: the story set for tomorrow hid the post up since Monday, and its See it.
  const door = S.createElement("a", { href: "https://example.com/p/1", "data-testid": "door" }, "See it");
  const story = post("instagram", "queued", {
    id: "story",
    kind: "story",
    scheduled_for: LATER,
    created_at: "2026-11-12T15:00:00Z",
  });
  const state = bothOf(draft(OFF), {
    posts: [story, post("instagram", "published")],
    takes: { instagram: false, google: true },
  });
  const html = compose(state, { instagram: door });
  assert.match(placeSaid(html, "instagram"), /^Story goes up /, "what waits, named as the status row names it");
  assert.match(
    /data-testid="cnv-place-up-instagram"[\s\S]*?<span[^>]*>(Posted [^<]*)</.exec(html)?.[1] ?? "",
    /^Posted \S+/,
    "and the post that is up, under it",
  );
  assert.equal(count(html, "door"), 1, "with its door, once");
  assert.equal(count(html, "cnv-pull-instagram"), 1, "the story's Don't post");
  // A post up alone is said once, in its own row.
  const alone = compose(bothOf(draft(OFF), { posts: [post("instagram", "published")] }), { instagram: door });
  assert.equal(count(alone, "cnv-place-up-instagram"), 0);
  assert.equal(count(alone, "door"), 1);
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

test("a story alone asks for no words, and says its caption shows on no story", () => {
  const html = compose(bothOf(draft({ google: false, as: "story" }), { words: "" }));
  assert.equal(count(html, "cnv-words"), 0);
  assert.equal(count(html, "cnv-compose-problem"), 0);
  assert.match(html, /data-testid="cnv-story-words">A story shows no caption\.</);
  assert.equal(
    count(compose(bothOf(draft({ as: "story" }))), "cnv-story-words"),
    0,
    "with Google on, the words go there",
  );
  assert.equal(count(compose(bothOf(draft())), "cnv-story-words"), 0);
});

test("a post set for its time can be set for another, from its row, in the foot", () => {
  const timed = post("instagram", "queued", { id: "story", kind: "story", scheduled_for: LATER });
  const waits = bothOf(draft(OFF), { posts: [timed], takes: { instagram: false, google: true } });
  assert.equal(saysOf(compose(waits), "cnv-move-instagram"), "Change time");
  assert.equal(count(compose({ ...waits, may: false }), "cnv-move-instagram"), 0, "a reader moves nothing");
  const going = bothOf(draft(OFF), {
    posts: [post("instagram", "queued", { id: "now" })],
    takes: { instagram: false, google: true },
  });
  assert.equal(count(compose(going), "cnv-move-instagram"), 0, "one going up now has no time to change");
  const making = bothOf(draft(OFF), {
    posts: [post("instagram", "preparing", { id: "making", scheduled_for: LATER })],
    takes: { instagram: false, google: true },
  });
  assert.equal(count(compose(making), "cnv-move-instagram"), 0, "one Instagram is making ready keeps its time");
  assert.equal(count(compose(making), "cnv-pull-instagram"), 1, "and can still be stopped");
  assert.match(compose(making), /data-testid="cnv-words-held">Instagram already has this post/);
  assert.equal(count(compose(waits), "cnv-words-held"), 0);
  const foot = composeFoot(
    bothOf(draft(OFF), { moving: { post: "story", place: "instagram", kind: "story", at: Date.parse(LATER) } }),
  );
  assert.equal(count(foot, "cnv-move"), 1, "the foot asks for the time");
  assert.equal(saysOf(foot, "cnv-move-yes"), "Change time");
  assert.equal(count(foot, "cnv-compose-send"), 0, "and sends nothing else meanwhile");
});

/** What the page asks of the server while `run` runs: each request's method, door and body, answered as `answer` says. */
async function askedWhile(run, answer = () => ({ ok: true, data: {} })) {
  const asked = [];
  const realFetch = globalThis.window.fetch;
  globalThis.window.fetch = async (url, init) => {
    const body = init.body ? JSON.parse(init.body) : null;
    asked.push({ method: init.method, door: /\/files\/[^/?]+\/?([a-z]*)/.exec(String(url))?.[1] ?? "", body });
    const said = answer(init.method);
    return new Response(JSON.stringify(said), {
      status: said.ok ? 200 : 409,
      headers: { "content-type": "application/json" },
    });
  };
  try {
    await run();
  } finally {
    globalThis.window.fetch = realFetch;
  }
  return asked;
}

test("Change time refused keeps the post at its time, and says why under its place", async () => {
  const timed = post("google", "queued", { id: "11111111-0000-4000-8000-000000000008", scheduled_for: LATER });
  const piece = pieceOf({ posts: [timed], takes: { instagram: true, google: false } });
  const moved = [];
  const state = S.bothAfterTold(
    piece,
    [opens, (s) => s.moveTime(timed.id), (s) => s.moveTo(Date.parse("2099-02-01T10:00:00Z"))],
    { done: (places) => moved.push(places) },
  );
  const asked = await askedWhile(
    () => state.move(),
    () => ({ ok: false, error: { code: "conflict", message: "It is already being made ready to go." } }),
  );
  assert.deepEqual(
    asked.map((a) => [a.method, a.door]),
    [["PATCH", "posts"]],
    "one step, so a refusal leaves the post as it was: never stopped first",
  );
  assert.deepEqual(moved, [[]], "the piece is read again, and its place says why");
});

test("Change time moves the same post to the new time, in one step", async () => {
  const timed = post("instagram", "queued", {
    id: "11111111-0000-4000-8000-000000000009",
    kind: "story",
    scheduled_for: LATER,
  });
  const moved = [];
  const piece = pieceOf({ posts: [timed], takes: { instagram: false, google: true } });
  const to = Date.parse("2099-02-01T10:00:00Z");
  const state = S.bothAfterTold(piece, [opens, (s) => s.moveTime(timed.id), (s) => s.moveTo(to)], {
    done: (places) => moved.push(places),
  });
  assert.deepEqual(state.moving, { post: timed.id, place: "instagram", kind: "story", at: to });
  const asked = await askedWhile(() => state.move());
  assert.deepEqual(asked, [
    { method: "PATCH", door: "posts", body: { post_id: timed.id, when: "2099-02-01T10:00:00.000Z" } },
  ]);
  assert.deepEqual(moved, [["instagram"]]);
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

test("where a post stopped, the list opens on that place alone, however it is opened, and only where it can take the post", () => {
  // Ruben, 12 Nov 2026: Post again opened Instagram alone, and where it stands opened both.
  const stoppedThere = pieceOf({ posts: [post("instagram", "failed")] });
  assert.deepEqual(onAfter(stoppedThere, opens), { instagram: true, google: false, sending: true });
  const story = pieceOf({ posts: [post("instagram", "held", { kind: "story" })] });
  assert.equal(S.bothAfter(story, [opens]).draft.as, "story", "a story that stopped is tried again as a story");
  assert.equal(S.bothAfter(pieceOf(), [opens]).draft.as, "picture");
  // Tried again at a place that has stopped taking posts since (disconnected): it has no switch, so it is not on, and no
  // other place is switched on in its stead.
  const disconnected = pieceOf({ posts: [post("instagram", "failed")], takes: { instagram: false, google: true } });
  assert.deepEqual(onAfter(disconnected, opens), { instagram: false, google: false, sending: false });
});

test("Post sends the words on screen, to each place's door, which keeps them on the piece in the same step", async () => {
  // Ruben, 12 Nov 2026: words typed just before Post went out as they were before. The box under the places says what it
  // holds (viewer/caption.tsx onText), and that is the caption the piece hands the list.
  const kept = [];
  const state = S.bothAfterTold(pieceOf({ caption: "Words on screen." }), [opens], { wordsKept: (w) => kept.push(w) });
  const asked = await askedWhile(() => state.send());
  assert.deepEqual(kept, ["Words on screen."], "and the caption's box is told, so it keeps them no second time");
  assert.deepEqual(
    asked.map((a) => [a.method, a.door, a.body.caption ?? a.body.summary]),
    [
      ["POST", "instagram", "Words on screen."],
      ["POST", "google", "Words on screen."],
    ],
    "no save first and no wait: one step to each place",
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

test("words a post's door kept are kept once: the caption's box, going with its sheet, asks for no second save", async () => {
  const hands = {
    made: { file: fileOf("image"), posts: [] },
    record: { made: { from: null, plan: {}, caption: "Old words." }, reread: noop },
    reread: noop,
    open: noop,
    onClose: noop,
    flash: noop,
  };
  const presses = S.piecePressesOf(hands, []);
  presses.captionPosted("Posted words.");
  const none = await askedWhile(async () => assert.equal(await presses.caption("  Posted words. "), null));
  assert.deepEqual(none, [], "the door kept them as it posted");
  const other = await askedWhile(async () => assert.equal(await presses.caption("Other words."), null));
  assert.deepEqual(other, [{ method: "PATCH", door: "", body: { caption: "Other words." } }]);
  const again = await askedWhile(async () => assert.equal(await presses.caption("Posted words."), null));
  assert.equal(again.length, 1, "once other words are kept, the posted ones are a change again");
  // Changed elsewhere since (Ask's card, another phone): the box, reading the piece again, holds other words, so the words
  // a door once kept are a change again and are saved.
  presses.captionPosted("Posted words.");
  presses.captionTyped("Changed elsewhere.");
  const since = await askedWhile(async () => assert.equal(await presses.caption("Posted words."), null));
  assert.equal(since.length, 1, "never skipped on a mark the caption has moved past");
  // A story alone carries no words: its door keeps none, so the box keeps what was typed.
  const kept = [];
  const story = S.bothAfterTold(
    pieceOf({ caption: "Typed.", takes: { instagram: true, google: false } }),
    [opens, (s) => s.choose("story")],
    { wordsKept: (w) => kept.push(w) },
  );
  await askedWhile(() => story.send());
  assert.deepEqual(kept, [null], "told that no words were kept");
});

test("Undo after Don't post sets the post again with the piece's caption as it stands, never the stopped post's own copy", async () => {
  // The door keeps the words it is handed on the piece, so a stopped post's older copy would put old words back.
  const timed = post("instagram", "queued", {
    id: "11111111-0000-4000-8000-000000000007",
    caption: "Old words.",
    scheduled_for: LATER,
  });
  const flashed = [];
  const hands = {
    made: { file: fileOf("image"), posts: [timed] },
    record: { made: { from: null, plan: {}, caption: "New words." }, reread: noop },
    reread: noop,
    open: noop,
    onClose: noop,
    flash: (f) => flashed.push(f),
  };
  const presses = S.piecePressesOf(hands, [timed]);
  const asked = await askedWhile(async () => {
    presses.pull(timed.id);
    await until(() => flashed.length === 1, "Don't post's note");
    assert.equal(typeof flashed[0].undo, "function", "a post that waited can be put back");
    assert.equal(flashed[0].stays, true, "and its Undo stays through a tap besides");
    flashed[0].undo();
    await until(() => flashed.length === 2, "Undo's note");
  });
  assert.deepEqual(asked, [
    { method: "DELETE", door: "instagram", body: { post_id: timed.id } },
    { method: "POST", door: "instagram", body: { as: "picture", caption: "New words.", when: LATER } },
  ]);
  // One that stopped and was dismissed has no way back: it never waited.
  const stopped = post("instagram", "failed", { id: "11111111-0000-4000-8000-000000000006" });
  const dismissed = [];
  const after = S.piecePressesOf({ ...hands, flash: (f) => dismissed.push(f) }, [stopped]);
  await askedWhile(async () => {
    after.pull(stopped.id);
    await until(() => dismissed.length === 1, "Dismiss's note");
  });
  assert.equal(dismissed[0].undo, undefined);
});

test("the two after the open piece are read ahead, each once", () => {
  const made = ["a", "b", "c", "d"].map((id) => ({ file: { id, kind: "image" } }));
  assert.deepEqual(piecesToReadAhead(made, "a", new Set()), ["b", "c"]);
  assert.deepEqual(piecesToReadAhead(made, "c", new Set()), ["d"]);
  assert.deepEqual(piecesToReadAhead(made, "d", new Set()), []);
  assert.deepEqual(piecesToReadAhead(made, "a", new Set(["b"])), ["c"]);
  assert.deepEqual(piecesToReadAhead(made, "z", new Set()), []);
});
