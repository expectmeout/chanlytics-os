/**
 * Campaigns › Forms always has a way into the website connection once its list is read (websiteDoorOf).
 *
 * Found on production on 24 November 2026, after Lane B (#2555): a workspace with forms made here and no site had no way
 * into the connection from Forms. The head's button and a phone's line asked for a site, and the empty page's Connect
 * start for no form, so only Settings › Connections reached it. Now the empty page (no form here, none brought over, no
 * site) opens on its two starts, and every other page has the head's button on a desk and a quiet line on a phone, for a
 * member who may only look too. A member who may not connect a site is told who may at the start's button, through the
 * app's own role gate (frame/gate.ts over contracts roleGate), rather than sent to an empty connection.
 *
 * The list is drawn as the page draws it (page.tsx hands it websiteDoorOf's answer, and draws the head's button itself
 * on "head").
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { ROLE_PERMS } from "@chanlytics/contracts";
import { bridgeHolds } from "../../shell/_bridge-holds.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
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
      'export { FormsList, websiteDoorOf } from "../../../apps/dashboard/src/surfaces/campaigns/forms/list.tsx";\n' +
      'export { gate } from "../../../apps/dashboard/src/surfaces/frame/gate.ts";\n' +
      'export { renderToStaticMarkup } from "react-dom/server";\n' +
      'export { createElement } from "react";\n',
    resolveDir: path.join(ROOT, "tests/forms/website"),
    sourcefile: "forms-list.ts",
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
const file = path.join(os.tmpdir(), `forms-list-${process.pid}-${Date.now()}.cjs`);
fs.writeFileSync(file, out.outputFiles[0].text);
const S = createRequire(import.meta.url)(file);
fs.rmSync(file, { force: true });

/** The member acting, as the boot installs it (bridge/boot/installs.ts): the role store and the gate's own sentence. */
function actAs(role) {
  bridgeHolds({ parts: { roles: { can: (perm) => ROLE_PERMS[role]?.[perm] === true, myRole: () => role } } });
}

const FORM = {
  id: "f1",
  slug: "colour-consultation",
  heading: "Colour consultation",
  state: "live",
  changed: false,
  last_entry_at: null,
  held: 0,
};
const SITE_FORM = {
  id: "o1",
  name: "Contact us",
  form: "request",
  site_id: "s1",
  site: "example.com",
  listed: true,
  last_entry_at: null,
};

/** The list's read in each state the page can be in. */
const STATES = {
  "no form and no website": { forms: [], outside: [], sites: 0 },
  "forms made here, no website": { forms: [FORM], outside: [], sites: 0 },
  "a website, no form yet": { forms: [], outside: [], sites: 2 },
  "a website's forms alone": { forms: [], outside: [SITE_FORM], sites: 1 },
  "forms here and a website's": { forms: [FORM], outside: [SITE_FORM], sites: 1 },
  // A site whose keys were all ended still stands, and its forms are only hidden: the connection is where it mends.
  "a website gone quiet, its forms hidden": { forms: [], outside: [{ ...SITE_FORM, listed: false }], sites: 1 },
};

const draw = (dto, door, { failed = false } = {}) =>
  S.renderToStaticMarkup(
    S.createElement(S.FormsList, {
      dto,
      failed,
      again: async () => {},
      openId: null,
      onOpen() {},
      onOpenSite() {},
      onWebsite() {},
      door,
    }),
  );

const has = (html, testid) => html.includes(`data-testid="${testid}"`);

/** The start's button, as drawn. */
const startButton = (html) => /<button[^>]*data-testid="forms-connect-go"[^>]*>/.exec(html)?.[0] ?? "";

test("each state has its one way into the website connection, on a desk and on a phone", () => {
  actAs("owner");
  for (const [state, read] of Object.entries(STATES)) {
    const dto = { ...read, can_change: true };
    const empty = state === "no form and no website";
    for (const phone of [false, true]) {
      const door = S.websiteDoorOf(dto, phone);
      const where = `${state}, ${phone ? "phone" : "desk"}`;
      assert.equal(door, empty ? "start" : phone ? "line" : "head", where);
      const html = draw(dto, door);
      // The start is the empty page's alone; the line is a phone's, past the start; on a desk the head draws the button.
      assert.equal(has(html, "forms-connect"), empty, `${where}: the Connect start`);
      assert.equal(has(html, "forms-website-line"), !empty && phone, `${where}: the line under the list`);
    }
  }
});

test("the gap found on production: forms made here and no website keep a way in", () => {
  actAs("owner");
  const dto = { ...STATES["forms made here, no website"], can_change: true };
  assert.equal(S.websiteDoorOf(dto, false), "head");
  const html = draw(dto, S.websiteDoorOf(dto, true));
  assert.ok(has(html, "forms-row"), "the form is listed");
  assert.ok(has(html, "forms-website-line"), "and the connection is a line under it");
  assert.ok(html.indexOf("forms-website-line") > html.indexOf("forms-row"), "under the list, not over it");
});

test("a website with no form yet keeps its way in on a phone too, under the line to AI", () => {
  actAs("owner");
  const dto = { ...STATES["a website, no form yet"], can_change: true };
  const html = draw(dto, S.websiteDoorOf(dto, true));
  assert.ok(has(html, "forms-ask"), "the line to AI leads");
  assert.ok(has(html, "forms-website-line"));
  assert.equal(has(html, "forms-connect"), false, "no start offers what is already connected");
});

test("before the list is read, or when it could not be, there is no door: the failure has its one act", () => {
  actAs("owner");
  assert.equal(S.websiteDoorOf(null, false), null);
  assert.equal(S.websiteDoorOf(null, true), null);
  const html = draw(null, null, { failed: true });
  assert.ok(has(html, "forms-unread"));
  assert.equal(has(html, "forms-connect") || has(html, "forms-website-line"), false);
});

test("a member who may not connect a site sees the start, and its button says who may instead of opening", () => {
  for (const role of ["viewer", "operator"]) {
    actAs(role);
    const dto = { ...STATES["no form and no website"], can_change: role === "operator" };
    const html = draw(dto, S.websiteDoorOf(dto, false));
    const button = startButton(html);
    assert.ok(button, `${role}: the start is drawn`);
    assert.ok(button.includes('aria-disabled="true"') && button.includes("data-gated"), `${role}: ${button}`);
    assert.ok(button.includes("Only an owner can connect your website."), `${role}: ${button}`);
  }
  for (const role of ["owner", "partner"]) {
    actAs(role);
    const button = startButton(draw({ ...STATES["no form and no website"], can_change: true }, "start"));
    assert.equal(button.includes("data-gated"), false, `${role} connects`);
  }
});

test("a member who may only look still has the way in where there is something to see", () => {
  actAs("viewer");
  for (const state of ["forms made here, no website", "a website, no form yet", "forms here and a website's"]) {
    const dto = { ...STATES[state], can_change: false };
    assert.equal(S.websiteDoorOf(dto, false), "head", state);
    const html = draw(dto, S.websiteDoorOf(dto, true));
    assert.ok(has(html, "forms-website-line"), state);
    assert.equal(
      /data-testid="forms-website-line"[^>]*data-gated|data-gated[^>]*data-testid="forms-website-line"/.test(html),
      false,
    );
  }
});
