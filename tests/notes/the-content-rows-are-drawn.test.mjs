/**
 * Content's rows on the Autonomy pane, drawn (00714; the content loop PRD's 12.4, canvas v18 board B5): four rows, a row
 * per act, in the matrix's own modes, a mode a row cannot honour drawn as no dot (only Approve the week offers more than
 * asking); AI's suggested rung under Approve the week only with its record behind it, with Use it; and none once taken.
 * Drawn with react-dom/server from the pane's own module, over the bridge's own rows.
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
  location: { pathname: "/w/harbor/settings/autonomy", search: "", hash: "", assign() {} },
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
      'export { contentGroupOf } from "../../apps/dashboard/src/surfaces/settings/autonomy/content-rows.tsx";\n' +
      'export { PolicyTable, PolPhoneRows } from "../../apps/dashboard/src/surfaces/settings/autonomy/matrix.tsx";\n' +
      'export { uiRows } from "../../apps/dashboard/src/bridge/policy-store.ts";\n' +
      'export { CONTENT_POLICY_CLASSES } from "@chanlytics/contracts";\n' +
      'export { renderToStaticMarkup } from "react-dom/server";\n' +
      'export { createElement } from "react";\n',
    resolveDir: path.join(ROOT, "tests/notes"),
    sourcefile: "the-content-rows.ts",
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
const file = path.join(os.tmpdir(), `the-content-rows-${process.pid}-${Date.now()}.cjs`);
fs.writeFileSync(file, out.outputFiles[0].text);
const S = createRequire(import.meta.url)(file);
fs.rmSync(file, { force: true });

/** The four rows as the pane hands them, each at the mode the workspace holds. */
const contentRows = (weekMode = "ask") =>
  S.CONTENT_POLICY_CLASSES.flatMap((cls) =>
    S.uiRows({
      rows: S.CONTENT_POLICY_CLASSES.map((c) => ({ class: c, mode: c === "plan_approve" ? weekMode : "ask" })),
      role: "owner",
    }).filter((r) => r.cls === cls),
  );
/** The matrix as the pane draws it, its own rows none here, Content its group: a desk's table, or a phone's lines. */
const draw = ({ phone, rows, weeks = null }) =>
  S.renderToStaticMarkup(
    S.createElement(phone ? S.PolPhoneRows : S.PolicyTable, {
      rows: [],
      put() {},
      busy: null,
      groups: S.contentGroupOf({ rows, weeks, put() {} }),
    }),
  );
const clean = { by_owner: true, edited: false };
const text = (html) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

test("four rows in the board's words, in its order, each saying what it covers", () => {
  const html = draw({ phone: false, rows: contentRows() });
  const said = text(html);
  const at = ["Post", "Approve the week", "Change an ad", "Answer a comment"].map((name) => said.indexOf(name));
  assert.ok(
    at.every((i) => i >= 0),
    said,
  );
  assert.deepEqual(
    [...at].sort((a, b) => a - b),
    at,
    "in the board's order",
  );
  assert.match(html, /data-testid="pol-group-content"/, "a group of the one matrix, as the board draws it at a desk");
  assert.match(said, /Content/);
  assert.equal((html.match(/class="pol-mode"/g) ?? []).length, 4, "the matrix's headings said once");
});

test("only Approve the week offers more than asking: the other rows draw no dot for a mode they cannot honour", () => {
  const html = draw({ phone: false, rows: contentRows() });
  const dots = [...html.matchAll(/aria-label="([^"]+): ([^"]+)"/g)].map((m) => `${m[1]}: ${m[2]}`);
  assert.deepEqual(
    dots.filter((d) => d.startsWith("Approve the week")),
    ["Approve the week: Sends it", "Approve the week: Holds it", "Approve the week: Asks you"],
  );
  for (const name of ["Post", "Change an ad", "Answer a comment"])
    assert.deepEqual(
      dots.filter((d) => d.startsWith(`${name}:`)),
      [`${name}: Asks you`],
      name,
    );
});

test("AI suggests holding the week only with four weeks approved as planned behind it, and Use it is the owner's press", () => {
  assert.doesNotMatch(draw({ phone: false, rows: contentRows(), weeks: [clean, clean, clean] }), /AI suggests/);
  const html = draw({ phone: true, rows: contentRows(), weeks: [clean, clean, clean, clean] });
  assert.match(text(html), /AI suggests Holds it: 4 weeks approved with no edits/);
  assert.match(text(html), /Use it/);
  assert.match(html, /data-testid="aut-rung-suggestion"/);
});

test("taken, the suggestion goes: the week held, no suggestion under it", () => {
  const html = draw({ phone: true, rows: contentRows("veto"), weeks: [clean, clean, clean, clean] });
  assert.doesNotMatch(html, /AI suggests/);
});
