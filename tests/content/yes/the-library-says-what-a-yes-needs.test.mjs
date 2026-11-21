/**
 * The Library's line on a photo or video that shows someone (00665; the content PRD's step L4), drawn as the page draws
 * it: what stands, then what it still needs before it is posted or runs as an ad, then the line to AI where a yes is
 * said (the page's own, handed in), and a quiet "No one's in it". No yes is a press: the old "They agreed" is gone.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { build } from "esbuild";
import { ROOT } from "../../_source.mjs";

const DASHBOARD_MODULES = path.join(ROOT, "apps/dashboard/node_modules");

globalThis.window ??= {
  location: { pathname: "/w/harbor/campaigns/content:library", search: "", hash: "", assign() {} },
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent: () => true,
  matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
};
globalThis.document ??= { addEventListener() {}, removeEventListener() {}, querySelector: () => null };

const out = await build({
  stdin: {
    contents:
      'export { FileWho } from "../../../apps/dashboard/src/surfaces/files/file-fields.tsx";\n' +
      'export { renderToStaticMarkup } from "react-dom/server";\n' +
      'export { createElement } from "react";\n',
    resolveDir: path.join(ROOT, "tests/content/yes"),
    sourcefile: "the-library-line.ts",
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
const file = path.join(os.tmpdir(), `library-line-${process.pid}-${Date.now()}.cjs`);
fs.writeFileSync(file, out.outputFiles[0].text);
const S = createRequire(import.meta.url)(file);
fs.rmSync(file, { force: true });

const photo = (over = {}) => ({
  id: "ffffffff-0000-4000-8000-000000000001",
  kind: "image",
  status: "filed",
  source: "upload",
  name: "chair-by-the-window",
  who_in_it: "not_asked",
  people: { count: 2, recognizable: 2 },
  look_status: "done",
  yes_for: [],
  yes_back: [],
  ...over,
});
const TELL = S.createElement("span", { "data-testid": "tell-ai" });
const draw = (file) =>
  S.renderToStaticMarkup(S.createElement(S.FileWho, { file, busy: false, say: () => {}, tell: TELL }));
const words = (html) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .replace(/&#x27;/g, "'");

test("someone shown with no yes: how many AI saw, what each use needs, the line to AI, and no press that says yes", () => {
  const html = draw(photo());
  assert.match(words(html), /AI saw 2 people\./);
  assert.match(words(html), /Before it is posted or runs as an ad, they need to say yes to posts and ads\./);
  assert.match(html, /data-testid="tell-ai"/, "the line to AI stands where a yes is said");
  assert.match(
    html,
    /data-testid="fl-who-no_one"/,
    "a quiet No one's in it, where the look saw someone who is not there",
  );
  assert.doesNotMatch(html, /fl-who-agreed|They agreed/);
});

test("a yes for posts alone says an ad still needs one; a yes for both needs nothing more", () => {
  assert.match(
    words(draw(photo({ yes_for: ["post"] }))),
    /They said yes to posts\. Before it runs as an ad, they need to say yes to ads\./,
  );
  const both = draw(photo({ yes_for: ["ad", "post"] }));
  assert.match(words(both), /They said yes to posts and ads\./);
  assert.doesNotMatch(both, /fl-who-needs/);
});

test("a yes taken back is said, and nobody in it, or a look still at it, says no more than before", () => {
  assert.match(words(draw(photo({ yes_back: ["post", "ad"] }))), /A yes to posts and ads was taken back\./);
  const clear = draw(photo({ people: { count: 0, recognizable: 0 } }));
  assert.match(clear, /data-testid="fl-who-change"/);
  assert.doesNotMatch(clear, /tell-ai/);
  assert.equal(draw(photo({ look_status: "waiting", people: null })), "");
});
