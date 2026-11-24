/**
 * The loop's parts on the piece, drawn (the content loop's pass 6; the content canvas's Loop1 to Loop3, approved 24 Nov
 * 2026): the one line beside Run as an ad with its numbers set apart; the ad's line under Where it goes, opening the ad;
 * What it brought said for the post and the ad apart, each person once; and a person who booked offering their chain.
 * Drawn with react-dom/server from the surface's own modules, over the page's own words.
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

globalThis.window = {
  location: { pathname: "/w/harbor/campaigns/content", search: "", hash: "", assign() {} },
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
      'export { PieceResults, ResultLine } from "../../../apps/dashboard/src/surfaces/campaigns/content/viewer/results.tsx";\n' +
      'export { PieceAdLines } from "../../../apps/dashboard/src/surfaces/campaigns/content/viewer/ads-on-piece.tsx";\n' +
      'export { sinceSaid } from "../../../apps/dashboard/src/surfaces/campaigns/ads/new/from-post.tsx";\n' +
      'export { ReviewAskRow } from "../../../apps/dashboard/src/surfaces/campaigns/content/week/review-ask.tsx";\n' +
      'export { renderToStaticMarkup } from "react-dom/server";\n' +
      'export { createElement } from "react";\n',
    resolveDir: path.join(ROOT, "tests/content/results"),
    sourcefile: "the-loop.ts",
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
const file = path.join(os.tmpdir(), `the-loop-${process.pid}-${Date.now()}.cjs`);
fs.writeFileSync(file, out.outputFiles[0].text);
const S = createRequire(import.meta.url)(file);
fs.rmSync(file, { force: true });

const draw = (component, props) => S.renderToStaticMarkup(S.createElement(component, props));
const n = (metric, value) => ({ metric, value, availability: "available" });
const reel = {
  post_id: "p-reel",
  place: "instagram",
  kind: "reel",
  step: "7d",
  read_at: "2026-12-03T13:00:00Z",
  published_at: "2026-12-01T23:00:00Z",
  numbers: [n("reach", 2140)],
};
const ad = {
  id: "adadadad-0000-4000-8000-000000000001",
  state: "on",
  shown_on: ["facebook"],
  spend_minor: 1800,
  total_minor: 4000,
  currency: "USD",
  ends_at: "2026-12-05T04:59:00.000Z",
  paused_by: null,
  people: 9,
  booked: 2,
};
const ana = {
  contact_id: "c-ana",
  name: "Ana Ruiz",
  new_person: true,
  touch: "reply",
  touched_at: "2026-12-02T00:12:00Z",
  class: "direct",
  visit: { starts_at: "2026-12-03T15:00:00Z", status: "kept" },
  chain: {
    conversation_id: "cv-1",
    visit: { id: "v-1", asked_at: "2026-12-02T00:20:00Z" },
    review_ask: null,
  },
};
const results = (over = {}) => ({
  posts: [reel],
  conversations: 3,
  direct: 1,
  assisted: 0,
  people: [ana],
  link: null,
  window_days: 14,
  ...over,
});

test("the one line: an icon, its words, and its numbers set apart (Loop1)", () => {
  const html = draw(S.ResultLine, {
    parts: ["Reached ", { number: "2,140" }, " on Instagram · ", { number: "3" }, " conversations"],
  });
  assert.match(html, /data-testid="cnv-res"/);
  assert.match(html, /Reached <b>2,140<\/b> on Instagram · <b>3<\/b> conversations/);
  assert.equal(S.sinceSaid("2026-12-01T12:00:00Z", Date.parse("2026-12-01T12:20:00Z")), "20 min ago");
});

test("the ad's line under Where it goes, in Ads' words, opening the ad (Loop2)", () => {
  const html = draw(S.PieceAdLines, { ads: [ad] });
  assert.match(html, /<b>Ad on Facebook<\/b>/);
  assert.match(html, /Running as an ad · \$18 of \$40 · until/);
  assert.match(html, /data-testid="cnv-goes-ad-open"/);
  assert.match(html, /Open the ad/);
  assert.equal(draw(S.PieceAdLines, { ads: [] }), "", "nothing where no ad was made from it");
  const checking = draw(S.PieceAdLines, { ads: [{ ...ad, state: "review" }] });
  assert.match(checking, /Meta is checking it · usually within a day/);
  assert.doesNotMatch(checking, /Open the ad/, "an ad Meta is checking has nothing to open yet");
});

test("What it brought, the post and the ad apart, each person once; one who booked offers their chain (Loop2, Loop3)", () => {
  const held = {
    data: results({
      ads: [{ ...ad, spend_minor: 4000 }],
      ad_people: [
        { id: "c-mia", name: "Mia Park", first_at: "2026-12-02T10:00:00Z", booked: true },
        // Ana wrote from the post first: she stays the post's, and is not an ad's row too.
        { id: "c-ana", name: "Ana Ruiz", first_at: "2026-12-02T09:00:00Z", booked: false },
      ],
    }),
    again: () => undefined,
  };
  const html = draw(S.PieceResults, { fileId: "f-1", upPostId: "p-reel", held });
  assert.match(html, /From the post/);
  assert.match(html, /From the ad · \$40/);
  assert.match(html, /9 conversations · 2 booked from the ad · about \$20 a booking/);
  assert.match(html, /Wrote from the ad · booked/);
  assert.equal(html.split("Ana Ruiz").length - 1, 1, "Ana once, under what she wrote from first");
  assert.match(html, /Someone who wrote from both counts once, under the first\./);
  assert.match(html, /data-testid="cnv-chain-open"/, "Ana booked: her chain opens from her row");
  assert.match(html, /How they got here/);
  const plain = draw(S.PieceResults, { fileId: "f-1", upPostId: "p-reel", held: { ...held, data: results() } });
  assert.doesNotMatch(plain, /From the post|From the ad/, "no ad: What it brought is as pass 2 drew it");
});

test("the plan's proposal to ask for reviews at the Week's foot: a star, the ask, why and when, and Open (Loop4)", () => {
  const html = draw(S.ReviewAskRow, { ask: { why: "quiet" }, onOpen: () => undefined });
  assert.match(html, /data-testid="cwk-review-ask"/);
  assert.match(html, /<b>Ask every client for a review<\/b>/);
  assert.match(html, /No new review on Google in 30 days · the day after each visit/);
  assert.match(html, /data-testid="cwk-review-ask-open"/);
});
