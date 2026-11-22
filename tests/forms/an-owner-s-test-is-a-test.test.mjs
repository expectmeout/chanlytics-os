/**
 * The Share part's "Send a test" opens the form marked a test.
 *
 * Found on production's own tables on 22 November 2026: the button linked the form's bare address, so an owner's test
 * was a request like any other. It rang the bell, was counted and made a person, under words that say "It tells
 * nobody." This draws the Share part and reads the address its button opens; a-visitor-fills-in-a-form proves that
 * address is a test for a member of the workspace, and a visitor's own request for anyone else.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { formTestPath } from "@chanlytics/contracts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DASHBOARD_MODULES = path.join(ROOT, "apps/dashboard/node_modules");

globalThis.window = {
  location: { pathname: "/w/luma-salon/campaigns/forms", origin: "https://app.chanlytics.com", search: "", hash: "" },
  sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent: () => true,
  matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  fetch: async () => {
    throw new Error("nothing answers");
  },
};
globalThis.document = { addEventListener() {}, removeEventListener() {}, querySelector: () => null };

const out = await build({
  stdin: {
    contents:
      'export { SharePart } from "../../apps/dashboard/src/surfaces/campaigns/forms/share-part.tsx";\n' +
      'export { renderToStaticMarkup } from "react-dom/server";\n' +
      'export { createElement } from "react";\n',
    resolveDir: path.join(ROOT, "tests/forms"),
    sourcefile: "share-part.ts",
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
const file = path.join(os.tmpdir(), `share-part-${process.pid}-${Date.now()}.cjs`);
fs.writeFileSync(file, out.outputFiles[0].text);
const S = createRequire(import.meta.url)(file);
fs.rmSync(file, { force: true });

const description = { heading: "Colour consultation", lang: "en", fields: [], thanks: "Thanks.", next: { chat: true } };

/** A live form's sheet with one link, as GET forms/sheet answers it. */
const sheet = (over = {}) => ({
  id: "11111111-1111-4111-8111-111111111111",
  slug: "colour-consultation",
  state: "live",
  draft: description,
  live: description,
  changed: false,
  published_at: "2026-11-22T17:10:00Z",
  last_entry_at: null,
  links: [
    {
      id: "22222222-2222-4222-8222-222222222222",
      place: "Your link",
      code: "k7q2md",
      printed: false,
      stopped: false,
      requests: 0,
      opens: 0,
      visits: 0,
    },
  ],
  results: { days: 30, opens: 0, requests: 0, talked: 0, visits: 0, new_people: 0, known_people: 0 },
  entries: [],
  held: [],
  chat: true,
  can_change: true,
  ...over,
});

const drawn = (over) =>
  S.renderToStaticMarkup(
    S.createElement(S.SharePart, { sheet: sheet(over), again: async () => {}, fail() {}, justLive: false }),
  );

test("Send a test opens the form marked a test, in a tab of its own", () => {
  const html = drawn();
  const press = /<a[^>]*data-testid="forms-test"[^>]*>/.exec(html)?.[0] ?? "";
  assert.ok(press, "the Share part of a live form draws its Test press");
  const href = /href="([^"]+)"/.exec(press)?.[1].replaceAll("&amp;", "&");
  assert.equal(href, formTestPath("luma-salon", "colour-consultation"));
  assert.equal(href, "/b/luma-salon/colour-consultation?test=1");
  assert.ok(press.includes('target="_blank"'));
  assert.ok(html.includes("Opens the form. It tells nobody."));
});

test("a form that is off offers no test: nobody can send to it", () => {
  assert.equal(drawn({ state: "off" }).includes('data-testid="forms-test"'), false);
});
