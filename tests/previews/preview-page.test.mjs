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

/** A row's turns: what they asked and what it answered, with what a live conversation would do. */
const turnsOf = (...pairs) =>
  pairs.flatMap(([asked, answered, tone]) => [
    { role: "user", content: asked },
    {
      role: "assistant",
      content: answered,
      ...(tone ? { then: { words: "An owner's sentence, 62% sure.", tone } } : {}),
    },
  ]);

test("open, nothing said yet: their name, Call it and the microphone's line, what it knows, its questions on the field, who sees it", () => {
  const html = draw();
  const said = words(html);
  assert.match(html, /data-state="ready"/);
  assert.match(html, /<h1[^>]*>Fixture Barbers<\/h1>/, "the page's heading is the business's own name");
  for (const line of [W.ready, W.callStart, W.micFirst, W.knowsTitle, W.knowsAll, W.tryAsking, W.kept, W.mine])
    assert.ok(said.includes(line), line);
  for (const id of [
    "pv-mine",
    "pv-call-start",
    "pv-facts",
    "pv-knows-open",
    "pv-starters",
    "pv-text",
    "pv-send",
    "pv-dock",
  ])
    assert.ok(has(html, id), id);
  for (const question of ["Can you tell me about the fade?", "Are you open on Sunday?", "Where are you located?"])
    assert.ok(said.includes(question), question);
  // Nothing is counted before anything is tried, and no conversation is drawn before one starts.
  for (const gone of ["messages left", "of calls left", W.teachLeft(3), "chat"]) assert.ok(!said.includes(gone), gone);
  for (const id of ["pv-chat", "pv-greeting", "pv-left", "pv-telling", "pv-called"]) assert.ok(!has(html, id), id);
});

test("Call it is the page's one filled act until they have tried it; then Make it mine leads", () => {
  const fresh = draw();
  assert.ok(!/data-testid="pv-mine"[^>]*data-leads/.test(fresh) && !/data-leads[^>]*data-testid="pv-mine"/.test(fresh));
  for (const tried of [{ asked_count: 3 }, { call_seconds: 54, call_count: 1 }]) {
    const html = draw(tried);
    assert.match(html, /data-leads="true"/, JSON.stringify(tried));
  }
});

test("their face is their mark, else their photo, else their initials; the photo is the light behind the head", () => {
  const bare = draw();
  assert.ok(!bare.includes("pv-light") && !bare.includes("<img"), "no photo and no mark: nothing fetched");
  assert.match(bare, />FB</, "their initials stand in the circle");
  const photo = draw({ photo_url: PHOTO });
  assert.ok(
    photo.includes("pv-light") && photo.includes("face-photo"),
    "the photo is the face, and the light behind the head",
  );
  assert.ok(photo.split(PHOTO).length - 1 >= 2);
  assert.match(
    photo,
    /class="pv-light"[^>]*referrerPolicy="no-referrer"|referrerPolicy="no-referrer"[^>]*class="pv-light"|class="pv-light"[^>]*referrerpolicy="no-referrer"/,
  );
  const both = draw({ photo_url: PHOTO, logo_url: "https://cdn.example.com/logo.png" });
  assert.match(
    both,
    /face-photo"[^>]*src="https:\/\/cdn\.example\.com\/logo\.png"|src="https:\/\/cdn\.example\.com\/logo\.png"[^>]*class="face-photo"/,
    "their mark is their face where the site gave one",
  );
  assert.equal(draw({ photo_url: "https://evil.example.com/x.png" }).includes("evil.example.com"), false);
});

test("what it knows, up front: each fact with where it was read, and the one it lacks second, said as lacking", () => {
  const plumber = {
    profile: { address: "80 Made Up St, Brooklyn, NY 11225", services: [{ name: "Hydro Jetting" }] },
    phone_display: null,
  };
  const html = draw(plumber);
  const order = ["pv-fact-services", "pv-fact-hours", "pv-fact-address"].map((id) =>
    html.indexOf(`data-testid="${id}"`),
  );
  assert.ok(
    order.every((at) => at > 0),
    "each is drawn",
  );
  assert.deepEqual(
    [...order].sort((a, b) => a - b),
    order,
    "what it lacks stands second, where a phone still shows it",
  );
  const said = words(html);
  assert.ok(said.includes(W.missing.google) && said.includes(W.from.site));
  assert.match(html, /data-missing="true"/);
  assert.ok(!has(draw(), "pv-fact-hours") || !/data-missing/.test(draw()), "a record with its hours lacks nothing");
});

test("a conversation: its greeting first, each line, what a live conversation would do said for a business, never an owner's sentence", () => {
  const html = draw({
    asked_count: 2,
    turns: turnsOf(
      ["Are you open on Sunday?", "We're closed on Sunday.", "sends"],
      ["How much is a fade?", "Someone will get back to you with a price.", "yours"],
    ),
  });
  const said = words(html);
  for (const id of ["pv-chat", "pv-greeting", "pv-turn-0", "pv-turn-1", "pv-then-1", "pv-turn-3", "pv-then-3"])
    assert.ok(has(html, id), id);
  assert.ok(html.indexOf('data-testid="pv-greeting"') < html.indexOf('data-testid="pv-turn-0"'), "it speaks first");
  assert.ok(said.includes(W.then.sends) && said.includes(W.then.yours));
  assert.ok(
    !said.includes("62% sure") && !/\d+%/.test(said),
    "no percentage and no settings sentence reaches a business",
  );
  // Where the conversation would come to them, the newest answer offers to be told what to say.
  assert.equal(html.split('data-testid="pv-tell-what"').length - 1, 1);
  assert.ok(said.includes(W.tellWhat));
  // The questions already asked are not offered again; who sees it is said before the first message only.
  assert.ok(has(html, "pv-starters"));
  assert.equal(html.split("Are you open on Sunday?").length - 1, 1, "asked once, drawn once: not among the questions");
  assert.ok(!said.includes(W.kept));
});

test("an answer that goes by itself offers nothing to tell; with three told, none is offered", () => {
  const sends = draw({ asked_count: 1, turns: turnsOf(["Where are you located?", "12 Main St.", "sends"]) });
  assert.ok(!has(sends, "pv-tell-what"));
  const notes = Array.from({ length: PREVIEW_TAUGHT.most }, (_, i) => ({
    title: PREVIEW_TAUGHT.title,
    text: `Told ${i + 1}.`,
  }));
  const full = draw({
    asked_count: 1,
    turns: turnsOf(["How much is a fade?", "Someone will get back to you.", "yours"]),
    profile: { ...FACTS.profile, notes },
  });
  assert.ok(!has(full, "pv-tell-what"), "it holds its three: the press is not offered, so none is refused");
});

test("a count is said only near its end", () => {
  assert.ok(!has(draw({ asked_count: 14 }), "pv-left"));
  const near = draw({ asked_count: 15 });
  assert.ok(has(near, "pv-left") && words(near).includes(W.left(5)));
});

test("its twenty said: no field, the note with Make it mine beside it, and a call while its minutes last", () => {
  const html = draw({ asked_count: 20 });
  const said = words(html);
  assert.match(html, /data-state="spent"/);
  assert.ok(has(html, "pv-spent") && said.includes(W.spent));
  assert.ok(!has(html, "pv-text") && !has(html, "pv-starters"));
  assert.ok(html.split(W.mine).length - 1 >= 2, "Make it mine at the top, and in the note that says to");
  assert.ok(html.split(W.callStart).length - 1 >= 2, "its minutes are its own: a call is still offered");
});

test("its minutes used: no call is offered, and the page says why", () => {
  const html = draw({ call_seconds: 6 * 60, call_count: 2 });
  assert.ok(!has(html, "pv-call-start") && !has(html, "pv-call-again"));
  assert.ok(words(html).includes(W.callUsed));
});

test("being set up, ended, someone's own: one thing said, nothing of the page", () => {
  const building = draw({ state: "building" });
  assert.ok(has(building, "pv-building") && words(building).includes(W.building.title("Fixture Barbers")));
  const ended = draw({ state: "ended" });
  assert.ok(has(ended, "pv-ended") && words(ended).includes(W.ended.title));
  const taken = draw({ state: "claimed" });
  assert.ok(has(taken, "pv-taken") && words(taken).includes(W.taken.title("Fixture Barbers")));
  for (const html of [building, ended, taken])
    for (const id of ["pv-mine", "pv-call-start", "pv-dock", "pv-facts", "pv-chat"]) assert.ok(!has(html, id), id);
});

test("its sender looking (Open it, ?look=1): what it has said, what it knows and what they did, nothing to press", () => {
  const html = draw(
    {
      asked_count: 1,
      call_seconds: 54,
      call_count: 1,
      turns: turnsOf(["Are you open on Sunday?", "We're closed on Sunday.", "sends"]),
    },
    true,
  );
  const said = words(html);
  assert.ok(has(html, "pv-look") && said.includes(W.look));
  assert.ok(said.includes("1 message · a call of a minute"), "what they did, as the lead's card says it");
  assert.ok(has(html, "pv-chat") && has(html, "pv-facts"));
  for (const id of ["pv-mine", "pv-call-start", "pv-dock", "pv-text", "pv-tell-what"]) assert.ok(!has(html, id), id);
});

test("a fact they put right is drawn as theirs, in their words", () => {
  const fixed = withPreviewFix(FACTS.profile, "address", "9 New St, Austin");
  const html = draw({ profile: fixed });
  assert.ok(words(html).includes("9 New St, Austin"));
  assert.ok(words(html).includes(W.from.you));
});

test("every press is the kit's, at a thumb's size", () => {
  const html = draw({
    asked_count: 1,
    turns: turnsOf(["How much is a fade?", "Someone will get back to you.", "yours"]),
  });
  const presses = [...html.matchAll(/<(?:button|a)\b[^>]*class="([^"]*)"/g)].map((m) => m[1]);
  assert.ok(presses.length >= 6, "the page has its presses");
  for (const classes of presses) assert.match(classes, /\bbtn-touch\b/, classes);
});
