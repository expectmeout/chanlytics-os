/**
 * A form's sheet says where no reply by email can go, with the way to connect it.
 *
 * Found on production's own tables on 22 November 2026: a form published, and its thank-you promised "replies by
 * email", for a business with no email connected, and nothing on the sheet said so. Ruben's call that day: the form
 * still publishes, the owner is told, and the thank-you promises an email only where one can go (a-visitor-fills-in-
 * a-form proves the thank-you, an-owner-makes-and-answers-a-form the sheet's read). This draws what the owner sees:
 * the notice under what happens Next, which is the one the publish step draws too.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { CHANNEL_WORDS } from "@chanlytics/contracts";

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
      'export { NextPart } from "../../apps/dashboard/src/surfaces/campaigns/forms/next-part.tsx";\n' +
      'export { NoEmailNotice } from "../../apps/dashboard/src/surfaces/campaigns/forms/no-email.tsx";\n' +
      'export { renderToStaticMarkup } from "react-dom/server";\n' +
      'export { createElement } from "react";\n',
    resolveDir: path.join(ROOT, "tests/forms"),
    sourcefile: "next-part.ts",
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
const file = path.join(os.tmpdir(), `next-part-${process.pid}-${Date.now()}.cjs`);
fs.writeFileSync(file, out.outputFiles[0].text);
const S = createRequire(import.meta.url)(file);
fs.rmSync(file, { force: true });

const draft = {
  heading: "Colour consultation",
  lang: "en",
  fields: [],
  thanks: "Thanks, we have your request.",
  next: { chat: true, draft: true, follow_up: false },
};
const editing = { draft, change() {}, put: async () => {}, settle: async () => {} };

const READY = { ready: true, why: null, connect: false, unchecked: false };
const NO_MAILBOX = { ready: false, why: CHANNEL_WORDS.noMailbox, connect: true, unchecked: false };
const NO_WIRE = { ready: false, why: CHANNEL_WORDS.noEmailDomain, connect: false, unchecked: false };
const UNCHECKED = { ready: false, why: CHANNEL_WORDS.unchecked, connect: false, unchecked: true };

const next = (email) =>
  S.renderToStaticMarkup(S.createElement(S.NextPart, { editing, chat: true, email, canChange: true }));
const notice = (email) =>
  S.renderToStaticMarkup(S.createElement(S.NoEmailNotice, { email, testid: "forms-publish-no-email" }));

/** What a drawn part says, without its markup. */
const said = (html) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

test("with email connected the sheet says nothing of it, and the reply's line says it goes by email", () => {
  const html = next(READY);
  assert.equal(html.includes('data-testid="forms-next-no-email"'), false);
  assert.ok(said(html).includes("AI drafts the reply By email, in Inbox. You send it."));
  assert.equal(notice(READY), "");
});

test("with no email connected it says so once, what the thank-you does about it, and offers Connect email", () => {
  const html = next(NO_MAILBOX);
  const words = said(html);
  assert.ok(html.includes('data-testid="forms-next-no-email"'));
  assert.ok(words.includes("Replies can't go by email yet. The thank-you won't promise one."), words);
  assert.equal(words.split("Replies can't go by email yet").length, 2, "said once");
  // The reply's own line no longer says it goes by email.
  assert.ok(words.includes("AI drafts the reply In Inbox. You send it."), words);
  assert.equal(words.includes("By email, in Inbox"), false);
  // Its one act opens Settings › Connections, as a link a person can also open in a new tab.
  const press = /<a[^>]*data-testid="forms-next-no-email-connect"[^>]*>/.exec(html)?.[0] ?? "";
  assert.ok(press, "the notice draws its act");
  assert.ok(press.includes('href="/w/luma-salon/settings/integrations"'), press);
  assert.ok(words.includes("Connect email"));
  // The door's sentence names the same place the act opens, so it is not said beside the act.
  assert.equal(words.includes(CHANNEL_WORDS.noMailbox), false);
});

test("where the business has no door to open, the reason stands where the act would", () => {
  const html = notice(NO_WIRE);
  const words = said(html);
  assert.ok(words.includes("Replies can't go by email yet. The thank-you won't promise one."), words);
  assert.ok(words.includes(CHANNEL_WORDS.noEmailDomain), words);
  assert.equal(html.includes("forms-publish-no-email-connect"), false, "nothing to press");
});

test("an answer nobody could get is not a no: nothing is said, and the reply's line stays as it is", () => {
  assert.equal(notice(UNCHECKED), "");
  // A sheet read before the question was asked carries no answer: the same.
  assert.equal(notice(undefined), "");
  assert.equal(next(undefined).includes('data-testid="forms-next-no-email"'), false);
  const html = next(UNCHECKED);
  assert.equal(html.includes('data-testid="forms-next-no-email"'), false);
  assert.ok(said(html).includes("By email, in Inbox. You send it."));
});
