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
import { LEAD_PREVIEW_WORDS as W, PREVIEW_TAUGHT, previewPageOf, withPreviewFix } from "@chanlytics/contracts";
import { ROOT } from "../_source.mjs";

const DASHBOARD_MODULES = path.join(ROOT, "apps/dashboard/node_modules");
const TOKEN = "TokenTokenTokenToken01";

/** The page and a server's renderer, bundled with the dashboard's React; next/navigation's router is the test's. */
async function pageBundle() {
  const out = await build({
    stdin: {
      contents:
        'export { PreviewPage } from "../../apps/dashboard/src/surfaces/preview/preview-page.tsx";\n' +
        'export { renderToStaticMarkup } from "react-dom/server";\n' +
        'export { createElement } from "react";\n',
      resolveDir: path.join(ROOT, "tests/previews"),
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
  photo_url: null,
};
const PHOTO = "https://lh3.googleusercontent.com/p/made-up";
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
  assert.match(html, /<h1 class="pv-title">Fixture Barbers<\/h1>/, "the heading is their name alone");
  assert.ok(said.includes(W.ready) && said.includes(W.madeFrom));
  assert.ok(!said.includes(W.chip), "no Preview chip on top");
  for (const s of ["Can you tell me about the fade?", "Are you open on Sunday?", "Where are you located?"])
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

test("they see their business, then its call, then its chat", () => {
  const html = draw({ photo_url: PHOTO });
  assert.match(html, /<img class="pv-photo"[^>]*src="https:\/\/lh3\.googleusercontent\.com\/p\/made-up"/);
  assert.ok(html.indexOf('data-testid="pv-call"') < html.indexOf('data-testid="pv-chat"'), "Call comes before Text");
  assert.ok(html.indexOf("pv-photo") < html.indexOf('class="pv-title"'), "the photo over the name");
});

test("their mark sits on their photo, where both are known", () => {
  const html = draw({ photo_url: PHOTO, logo_url: "https://storage.example.com/logos/fixture.png" });
  assert.match(html, /class="pv-hero"><img class="pv-photo"[^>]*><img class="pv-logo"/);
});

test("the chat opens on its greeting, before the questions to start from, and stays first", () => {
  const html = draw();
  const greeting = W.textGreeting("Fixture Barbers", null);
  assert.ok(has(html, "pv-greeting") && words(html).includes(greeting));
  assert.ok(html.indexOf('data-testid="pv-greeting"') < html.indexOf('data-testid="pv-starters"'));
  const talked = draw({ asked_count: 1, turns: [{ role: "user", content: "Hi" }] });
  assert.ok(talked.indexOf('data-testid="pv-greeting"') < talked.indexOf('data-testid="pv-turn-0"'), "still first");
});

test("no photo, no strip", () => {
  assert.ok(!draw().includes("pv-photo") && !draw().includes("pv-hero"));
  assert.ok(!draw({ photo_url: "http://evil.example/x.jpg" }).includes("<img"), "only Google's own host");
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

/* ---- what a business makes of it before it signs up (the canvas's calls P4 and P5) ---- */

const toldNotes = (texts) => texts.map((text) => ({ title: PREVIEW_TAUGHT.title, text }));

test("telling it something: the field while it has room, what they told it listed, and no field once it holds three", () => {
  const room = draw();
  assert.ok(has(room, "pv-teach") && has(room, "pv-teach-text") && has(room, "pv-teach-send"));
  assert.ok(words(room).includes(W.teachLeft(3)), "how many more it takes");
  const one = draw({ profile: { ...FACTS.profile, notes: toldNotes(["We answer all night."]) } });
  assert.ok(has(one, "pv-taught-0") && words(one).includes("We answer all night."));
  assert.ok(words(one).includes(W.teachLeft(2)));
  const full = draw({ profile: { ...FACTS.profile, notes: toldNotes(["One", "Two", "Three"]) } });
  assert.ok(has(full, "pv-taught-2") && !has(full, "pv-teach-text"), "no field once it holds three");
  assert.ok(words(full).includes(W.taughtFull));
});

test("telling it comes after the chat it changes, and before the fold of what it knows", () => {
  const html = draw();
  const at = (testid) => html.indexOf(`data-testid="${testid}"`);
  assert.ok(at("pv-chat") < at("pv-teach") && at("pv-teach") < at("pv-knows"));
});

test("its sender looking sees what they told it and nothing to type into; with nothing told, no part at all", () => {
  const looked = draw({ profile: { ...FACTS.profile, notes: toldNotes(["One"]) } }, true);
  assert.ok(has(looked, "pv-taught-0") && !has(looked, "pv-teach-text"));
  assert.ok(!has(draw({}, true), "pv-teach"));
});

test("a fact they put right is drawn as theirs, in their words", () => {
  const html = draw({ profile: withPreviewFix(FACTS.profile, "hours", "Saturday we close at 1") });
  const row = html.slice(html.indexOf('data-testid="pv-knows-hours"'), html.indexOf('data-testid="pv-knows-address"'));
  assert.ok(words(row).includes("Saturday we close at 1"), words(row));
  assert.ok(words(row).includes(W.from.you));
});
