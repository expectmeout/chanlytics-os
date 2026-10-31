/**
 * A lead's own receptionist's page, drawn (decision 0079, L2; apps/dashboard/src/surfaces/preview/preview-page.tsx):
 * bundled for node with the dashboard's own React, as kit-behaves.test.mjs draws the kit, and rendered as a server
 * renders it, state by state, from the view model contracts builds (previewPageOf). What a press does (a message, Not
 * right) is the routes' (preview-routes.test.mjs) and the running app's. Made-up businesses only.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { build } from "esbuild";
import { LEAD_PREVIEW_WORDS as W, previewPageOf } from "@chanlytics/contracts";
import { ROOT } from "../_source.mjs";

const DASHBOARD_MODULES = path.join(ROOT, "apps/dashboard/node_modules");
const TOKEN = "TokenTokenTokenToken01";

/** The page and a server's renderer, bundled with the dashboard's React; next/navigation's router is the test's. */
async function pageBundle() {
  const out = await build({
    stdin: {
      contents:
        'export { PreviewPage } from "../../../../apps/dashboard/src/surfaces/preview/preview-page.tsx";\n' +
        'export { renderToStaticMarkup } from "react-dom/server";\n' +
        'export { createElement } from "react";\n',
      resolveDir: path.join(ROOT, "tooling/scripts/tests/previews"),
      sourcefile: "preview-page-server.ts",
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
    },
    plugins: [
      {
        name: "router",
        setup(b) {
          b.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: "router", namespace: "stub" }));
          b.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
            contents: "export const useRouter = () => ({ refresh() {} });",
            loader: "js",
          }));
        },
      },
    ],
    define: { "process.env.NODE_ENV": '"production"' },
  });
  const file = path.join(os.tmpdir(), `preview-page-${process.pid}-${Date.now()}.cjs`);
  fs.writeFileSync(file, out.outputFiles[0].text);
  try {
    return createRequire(import.meta.url)(file);
  } finally {
    fs.rmSync(file, { force: true });
  }
}
const page = await pageBundle();

const NOW = new Date("2026-11-02T15:00:00Z");
const FACTS = {
  state: "ready",
  ends_at: "2026-12-01T00:00:00Z",
  asked_count: 0,
  turns: [],
  business: "Fixture Barbers",
  logo_url: null,
  profile: {
    hours: {
      mon: { open: "09:00", close: "18:00" },
      tue: { open: "09:00", close: "18:00" },
      wed: { open: "09:00", close: "18:00" },
      thu: { open: "09:00", close: "18:00" },
      fri: { open: "09:00", close: "18:00" },
      sat: { open: "10:00", close: "14:00" },
      sun: {},
    },
    address: "12 Main St, Austin, TX 78701",
    services: [{ name: "Fade" }],
  },
  phone_display: "+1 (512) 555-0142",
  call_seconds: 0,
};
const draw = (over = {}, look = false) =>
  page.renderToStaticMarkup(
    page.createElement(page.PreviewPage, { vm: previewPageOf({ ...FACTS, ...over }, NOW), token: TOKEN, look }),
  );
/** The markup's words, its tags and comments gone, as a person reads them. */
const words = (html) =>
  html
    .replace(/<!--.*?-->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
const has = (html, testid) => html.includes(`data-testid="${testid}"`);

test("open, nothing said yet: the business by its name, three questions to start from, the box, what it knows, the foot", () => {
  const html = draw();
  const said = words(html);
  assert.ok(html.includes('data-state="ready"'));
  assert.ok(said.includes("Fixture Barbers' receptionist"));
  assert.ok(said.includes(W.chip));
  assert.ok(said.includes(W.setUp("Fixture Barbers")));
  for (const s of ["Are you open on Sunday?", "Can I come in tomorrow at 2?", "How much is the fade?"])
    assert.ok(said.includes(s), s);
  assert.ok(has(html, "pv-text") && has(html, "pv-send"));
  assert.ok(said.includes("20 messages left"));
  assert.ok(said.includes("Mon–Fri 9 AM – 6 PM · Sat 10 AM – 2 PM · Sun closed"));
  assert.ok(has(html, "pv-not-right-hours"));
  assert.ok(html.includes(`href="/preview/${TOKEN}/mine"`), "Make it mine is a door: its own sign-up");
  assert.ok(said.includes(W.mine) && said.includes(W.mineSub));
  assert.ok(said.includes(W.kept), "it says what is kept");
  assert.ok(!html.includes("<img"), "no mark to show, no image");
});

test("a conversation: each turn, the answer with what a live chat would do, no questions to start from, the count left", () => {
  const html = draw({
    asked_count: 1,
    turns: [
      { role: "user", content: "Are you open on Sunday?" },
      {
        role: "assistant",
        content: "We're closed on Sundays.",
        then: { words: "It would send this right away.", tone: "sends" },
      },
    ],
  });
  const said = words(html);
  assert.ok(has(html, "pv-turn-0") && has(html, "pv-turn-1"));
  assert.match(html, /data-mine="true"[^>]*data-testid="pv-turn-0"|data-testid="pv-turn-0"[^>]*data-mine/);
  assert.ok(said.includes(`${W.onRealChat}: It would send this right away.`));
  assert.ok(html.includes('data-tone="sends"'));
  assert.ok(!has(html, "pv-starters"));
  assert.ok(said.includes("19 messages left"));
});

test("its twenty said: no box, the words that say so, what it knows and the foot still there", () => {
  const html = draw({ asked_count: 20 });
  assert.ok(html.includes('data-state="spent"'));
  assert.ok(!has(html, "pv-text"));
  assert.ok(words(html).includes(W.spent));
  assert.ok(has(html, "pv-knows") && has(html, "pv-mine"));
});

test("being set up, ended, someone's own: one thing said, no chat, no foot", () => {
  const building = draw({ state: "building" });
  assert.ok(words(building).includes(W.building.title("Fixture Barbers")));
  assert.ok(!has(building, "pv-chat") && !has(building, "pv-mine"));

  const ended = draw({ state: "ended", turns: [{ role: "user", content: "Kept words" }] });
  assert.ok(words(ended).includes(W.ended.title) && words(ended).includes(W.ended.body));
  assert.ok(ended.includes('href="/signup"'));
  assert.ok(!words(ended).includes("Kept words"), "an ended preview shows nothing it kept");
  assert.ok(!has(ended, "pv-mine"));

  const taken = draw({ state: "claimed" });
  assert.ok(words(taken).includes(W.taken.title("Fixture Barbers")));
  assert.ok(taken.includes('href="/login"'));
});

test("the business's mark, where its site gave one", () => {
  const html = draw({ logo_url: "https://storage.example.com/logos/fixture.png" });
  assert.ok(html.includes('src="https://storage.example.com/logos/fixture.png"'));
});

test("Call it: up to three minutes a call, the minutes its calls have left, none started once they are spent", () => {
  const fresh = draw();
  assert.ok(has(fresh, "pv-call") && has(fresh, "pv-call-start"));
  assert.ok(words(fresh).includes(W.callSub));
  assert.ok(words(fresh).includes("6 minutes of calls left"));
  const once = draw({ call_seconds: 72 });
  assert.ok(words(once).includes("4 minutes of calls left"), "four whole minutes after a call of 1:12");
  const spent = draw({ call_seconds: 330 });
  assert.ok(words(spent).includes(W.callUsed));
  assert.match(spent, /<button[^>]*disabled[^>]*data-testid="pv-call-start"|data-testid="pv-call-start"[^>]*disabled/);
  assert.ok(has(draw({ asked_count: 20 }), "pv-call-start"), "its twenty messages said, it can still be called");
  assert.ok(!has(draw({ state: "ended" }), "pv-call"));
});

test("its sender looking (Open it, ?look=1): what it has said and what it knows, nothing to press, nothing counted", () => {
  const html = draw(
    {
      asked_count: 1,
      turns: [
        { role: "user", content: "Are you open on Sunday?" },
        { role: "assistant", content: "We're closed on Sundays.", then: null },
      ],
    },
    true,
  );
  assert.ok(words(html).includes(W.look));
  assert.ok(has(html, "pv-turn-0") && has(html, "pv-knows"), "what it has said, and what it knows");
  for (const id of ["pv-text", "pv-send", "pv-starters", "pv-call", "pv-mine", "pv-not-right-hours", "pv-spent"])
    assert.ok(!has(html, id), `${id}: nothing to press`);
  assert.ok(!has(draw(), "pv-look"), "the lead's own page says none of it");
});
