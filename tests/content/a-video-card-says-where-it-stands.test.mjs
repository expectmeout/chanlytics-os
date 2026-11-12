/**
 * A video's card in Ask (apps/dashboard/src/surfaces/ask/card-piece.tsx, decision 0122), bundled for node with the dashboard's own
 * React and drawn in every state the content canvas gives a piece: its stills before the press, then being made, being looked
 * at, ready, not made and gone. Each state says one thing once, and offers the one press that is true of it.
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

const out = await build({
  stdin: {
    contents:
      'export { AskPieceCard } from "../../apps/dashboard/src/surfaces/ask/card-piece.tsx";\n' +
      'export { askText } from "../../apps/dashboard/src/surfaces/ask/words.ts";\n' +
      'export { renderToStaticMarkup } from "react-dom/server";\n' +
      'export { createElement } from "react";\n',
    resolveDir: path.join(ROOT, "tests/content"),
    sourcefile: "a-video-card.ts",
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
const file = path.join(os.tmpdir(), `video-card-${process.pid}-${Date.now()}.cjs`);
fs.writeFileSync(file, out.outputFiles[0].text);
const S = createRequire(import.meta.url)(file);
fs.rmSync(file, { force: true });

const { pieceWordsIn } = await import("../../packages/contracts/src/content/piece-words.ts");
const FILE = "ffffffff-0000-4000-8000-000000000001";
const SUMMARY = "10 seconds, vertical. 4 moments from your clip.";

/** The card as its AskCard holds it (card-piece.tsx usePieceCard): its words, its stills and where its video stands. */
const held = (over = {}, language = "en") => ({
  says: pieceWordsIn(language),
  moments: 4,
  picture: "blob:stills",
  refused: null,
  waiting: false,
  stands: null,
  posterMissed() {},
  press: { label: "Make it", disabled: false },
  ...over,
});
const made = (over = {}) => ({ id: FILE, seconds: 10.33, look_status: "done", issues: [], ...over });

/** The card drawn, and what a person reads of it: its words alone, a space between any two elements. */
function drawn(card, { language = "en", onRetry = () => {}, busy = false } = {}) {
  const html = S.renderToStaticMarkup(
    S.createElement(S.AskPieceCard, {
      p: { id: "c1", kind: "piece", title: "Video: I asked for volume", summary: SUMMARY, payload: {}, outcome: null },
      card,
      t: S.askText(language),
      busy,
      onNav() {},
      onRetry,
    }),
  );
  const read = html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
  return { html, read };
}
const times = (text, word) => text.split(word).length - 1;

test("before the press the card is its stills, one for each moment, and what they will make", () => {
  const { html, read } = drawn(held());
  assert.equal(times(html, 'class="ask-piece-slice"'), 4, "a still of its own for each moment");
  assert.ok(html.includes('data-stills="4"'), "the card says how many, so each still shows its own part");
  assert.equal(read, SUMMARY, "the stills say the rest: no time stamps, no second line");
  assert.ok(!html.includes("ask-piece-now"));
});

test("while the stills are drawn a dim still stands under Ask's three, and a plan refused says why in their place", () => {
  const coming = drawn(held({ picture: null, waiting: true }));
  assert.ok(coming.html.includes('data-testid="ask-piece-drawing"') && coming.html.includes('data-dim=""'));
  assert.ok(coming.html.includes("ask-piece-working"), "the one sign of work");
  const wont = pieceWordsIn("en").wont.people;
  const refused = drawn(held({ picture: null, refused: wont, press: { label: "Make it", disabled: true } }));
  assert.ok(refused.html.includes('role="alert"') && refused.read.startsWith(wont));
  assert.ok(!refused.html.includes("ask-piece-still"), "nothing drawn stands for a plan that cannot be made");
});

test("being made: where it is at, and that she may leave", () => {
  const says = pieceWordsIn("en");
  const { html, read } = drawn(held({ stands: { is: "making", stage: "drawing" } }));
  assert.equal(read, `Making it Cutting 4 moments ${SUMMARY} ${says.making}`);
  assert.ok(html.includes('data-is="making"') && html.includes('data-dim=""'), "the first still, dim");
  assert.ok(html.includes("ask-piece-working"), "under Ask's three");
  assert.ok(html.includes('role="status"'), "said to a reader as it changes");
  assert.ok(!html.includes("<button"), "nothing to press while it is made");
  // A clip that is still being made ready is said plainly, with how long it can take.
  const waits = drawn(held({ stands: { is: "making", stage: "waiting_clip" } }));
  assert.ok(waits.read.includes("up to 20 minutes"), waits.read);
});

test("ready the moment it can be played, as the bell rings: Ask's look comes after, and holds nothing back", () => {
  // Ruben, 11 Nov 2026, "Ready when playable": the card said "Ask is checking" for some 13 seconds after the bell had said
  // it was ready. The words of that wait are gone with it.
  const says = pieceWordsIn("en");
  const { html, read } = drawn(held({ stands: { is: "ready", file: made({ look_status: "waiting" }) } }));
  assert.equal(read, `It's ready In Content, under Made. Open ${SUMMARY}`);
  assert.ok(
    !html.includes("data-dim") && !html.includes("ask-piece-working"),
    "at full strength, nothing of Ask's over it",
  );
  assert.ok(!("checkingMark" in says.follows) && !("checking" in says.follows));
  assert.ok(!read.includes(says.making), "no word of leaving once it is there");
});

test("a card that has its stills shows the video's own first frame from them, and asks for the poster only without them", () => {
  // The platform says a video can be played some seconds before its poster is cut: a card that asked for it then showed nothing
  // over the still it already had. The still is the video's first frame with its words, so it is what the card shows.
  const live = drawn(held({ stands: { is: "ready", file: made({ look_status: "waiting" }) } }));
  assert.equal(times(live.html, 'class="ask-piece-slice"'), 1, "the first still, at full strength");
  assert.ok(!live.html.includes("ask-piece-poster"), "no poster asked for while the still stands");
  // A card drawn afresh later, its stills not asked for again, shows the video's poster.
  const later = drawn(held({ picture: null, stands: { is: "ready", file: made() } }));
  assert.ok(later.html.includes(`/api/v1/files/${FILE}/view?w=320"`), "the poster, by its address alone");
  assert.ok(!later.html.includes("ask-piece-slice"));
});

test("ready: said once, where it is, and Open", () => {
  const { html, read } = drawn(held({ stands: { is: "ready", file: made() } }));
  assert.equal(read, `It's ready In Content, under Made. Open ${SUMMARY}`);
  assert.equal(times(read, "10 seconds"), 1, "its length is the card's own line, said once");
  assert.ok(!html.includes("data-dim"), "at full strength");
  assert.ok(html.includes('data-testid="ask-piece-open"'));
  // What the look found is said on the video's own page, as for any file: the card is ready before the look has run.
  const found = drawn(held({ stands: { is: "ready", file: made({ issues: ["The words run off the top."] }) } }));
  assert.ok(!found.read.includes("The words run off the top"), found.read);
});

test("not made: why, once, and Try again for whoever may press", () => {
  const { html, read } = drawn(held({ stands: { is: "failed", why: "draw" } }));
  assert.equal(read, `Couldn't make it It could not be drawn this time. Try again ${SUMMARY}`);
  assert.equal(times(read, "Try again"), 1, "the press says it, and the line does not say it too");
  assert.ok(html.includes('data-dim=""') && !html.includes("ask-piece-working"), "amber and still, never Ask's three");
  // A member who may not press reads why, with nothing dead to press.
  const reads = drawn(held({ stands: { is: "failed", why: "clips" } }), { onRetry: null });
  assert.ok(!reads.html.includes("<button") && reads.read.includes("isn't in your Library any more"));
  // While the second try is on its way the press waits.
  assert.ok(drawn(held({ stands: { is: "failed", why: "draw" } }), { busy: true }).html.includes("disabled"));
});

test("deleted from Content since: the card says so, and nothing else", () => {
  const { html, read } = drawn(held({ stands: { is: "gone" } }));
  assert.equal(read, "This video isn't in Content any more.");
  assert.ok(!html.includes("<button") && !html.includes("ask-piece-still"));
});

test("a Spanish video's card says its own words", () => {
  const ready = drawn(held({ stands: { is: "ready", file: made() } }, "es"), { language: "es" });
  assert.ok(ready.read.startsWith("Está listo En Contenido, en Hecho. Abrir"), ready.read);
  const failed = drawn(held({ stands: { is: "failed", why: "draw" } }, "es"), { language: "es" });
  assert.ok(failed.read.startsWith("No se pudo hacer Esta vez no se pudo dibujar."), failed.read);
});
