/**
 * The finder, the plan card and the strip, drawn (release B, Tasks 8, 9, 10).
 *
 * Hookless components on the tests' stub React, as refusals-on-the-page does:
 * each is called with the props LeadsScope hands it, pressed, and read. The
 * page itself (Task 2) is proved in leads-honest.test.mjs; here the three
 * components are proved on their own props, so a change to one of them fails
 * here and not four files away.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { LeadSearchPlanSchema, planSentence } from "../../../packages/contracts/src/lead-search.ts";
import { leadEndingLine } from "../../../packages/contracts/src/leads.ts";

let cells = [];
let seq = 0;
globalThis.Icon = "Icon";
globalThis.React = {
  Fragment: "Fragment",
  createElement: (type, p, ...kids) => {
    const props = { ...(p || {}), children: kids.flat(Infinity) };
    const node = { type, props };
    if (typeof type === "function") node.rendered = type(props);
    return node;
  },
  useState: (init) => { const k = seq++; if (!(k in cells)) cells[k] = typeof init === "function" ? init() : init; return [cells[k], (v) => { cells[k] = typeof v === "function" ? v(cells[k]) : v; }]; },
  useRef: (init) => { const k = seq++; if (!(k in cells)) cells[k] = { current: init }; return cells[k]; },
  useMemo: (fn) => fn(),
  useCallback: (fn) => fn,
  useEffect: () => {},
};
globalThis.ReactDOM = { createPortal: (n) => n };
globalThis.window = globalThis.window || {};
// The derivations bag seed-globals.ts publishes. Task 9 writes planWords and
// its family and Task 10 leadStrip; until then the placeholder card reads the
// one sentence contracts already spells, and this bag is grown as they land.
Object.assign(globalThis.window, {
  __LEAD_VM: { planSaid: planSentence, leadEndingLine },
});
await import("../../../apps/dashboard/src/legacy/components/icons.jsx");
await import("../../../apps/dashboard/src/legacy/pages/leads-finder.jsx");

const walk = (n, fn) => { if (n == null || typeof n !== "object") return; fn(n); for (const k of n.props?.children ?? []) walk(k, fn); if (n.rendered) walk(n.rendered, fn); };
const all = (tree, pred) => { const out = []; walk(tree, (n) => { if (pred(n)) out.push(n); }); return out; };
const find = (tree, pred) => all(tree, pred)[0] ?? null;
const byTestId = (tree, id) => find(tree, (n) => n.props?.["data-testid"] === id);
const allTestId = (tree, id) => all(tree, (n) => n.props?.["data-testid"] === id);
const textOf = (n) => {
  if (n == null || typeof n === "boolean") return "";
  if (typeof n === "string" || typeof n === "number") return String(n);
  if (Array.isArray(n)) return n.map(textOf).join("");
  if (n.rendered !== undefined) return textOf(n.rendered);
  return (n.props?.children ?? []).map(textOf).join("");
};
const click = (n) => { assert.ok(n, "nothing to press"); return n.props.onClick({ preventDefault() {}, stopPropagation() {} }); };
const press = (n, key, mods = {}) => {
  let taken = false;
  n.props.onKeyDown({ key, ...mods, preventDefault() { taken = true; }, stopPropagation() {} });
  return taken;
};

/* ------------------------------------------------------------ fixtures */

const PLAN = LeadSearchPlanSchema.parse({
  version: 1, card: "local_businesses", name: "personal trainers", asked: "200 personal trainers in Austin with a website",
  terms: ["personal trainer", "strength coach", "fitness coach"],
  area: { kind: "city", label: "Austin, TX", state: "TX", center: { lat: 30.2672, lng: -97.7431 }, radius_m: 25_000, query: "Austin, TX, USA" },
  count: 200, contact: "email",
  criteria: [{ key: "website", text: "With a website", standard: "likely", required: true }],
  exclusions: [{ key: "chain", text: "Chain gyms", origin: "claude" }],
});
const NEARBY = { kind: "city", label: "Round Rock, TX", state: "TX", center: { lat: 30.5083, lng: -97.6789 }, radius_m: 25_000, query: "Round Rock, TX, USA" };
const FACTS = { dupes: 14, leadsLeft: 486, bound: null, prior: { places: 1_200, matched: 700, with_email: 406 }, priorOf: "trainers", cannotSee: null, renewsOn: "Oct 1", nearby: [NEARBY] };
const CARD = { id: "p1", kind: "lead_search", needs: "owner", title: "Find 200 personal trainers", summary: planSentence(PLAN), payload: { plan: PLAN, view: { title: "Find 200 personal trainers" }, facts: FACTS }, undo: "Stop the search" };
const SUGGESTIONS = {
  forWho: "Chanlytics",
  items: [
    { words: "Personal trainers in Austin with a website, about 200", reach: "about 6 in 10 have an email" },
    { words: "Physical therapists within 5 miles", reach: "about 7 in 10 have an email" },
    { words: "Chiropractors in Round Rock", reach: "about 6 in 10 have an email" },
    { words: "A fourth nobody asked for", reach: null },
  ],
};

/** The page's finder state, as ClientsAReal holds it, with the setters leadFinderPlan and leadFinderApprove take. */
const page = (over = {}) => {
  const st = { open: true, stage: "compose", words: "", trace: null, refusal: null, proposal: null, plan: null, pick: null, ...over };
  const set = {
    open: (v) => { st.open = v; }, stage: (v) => { st.stage = v; }, words: (v) => { st.words = v; }, trace: (v) => { st.trace = v; },
    refusal: (v) => { st.refusal = v; }, proposal: (v) => { st.proposal = v; }, plan: (v) => { st.plan = v; }, pick: (v) => { st.pick = v; },
  };
  return { st, set };
};
const drawFinder = (st, over = {}) => {
  seq = 0;
  return globalThis.window.LeadFinder({
    open: st.open, stage: st.stage, words: st.words, proposal: st.proposal, plan: st.plan, facts: null,
    refusal: st.refusal, busy: false, trace: st.trace, suggestions: SUGGESTIONS, talk: null, pick: st.pick,
    onWords: (v) => { st.words = v; }, onPlan: () => {}, onChangePlan: (p) => { st.plan = p; },
    onApprove: () => {}, onBack: () => { st.stage = "compose"; }, onClose: () => { st.open = false; },
    onPick: (v) => { st.pick = v; }, ...over,
  });
};

/* -------------------------------------------------- Task 8: the composer */

test("every icon these three name draws a shape of its own, not the fallback circle", () => {
  const Real = globalThis.window.Icon;
  const kids = (n) => (n.props.children || []).filter(Boolean);
  const fallback = (n) => kids(n).length === 1 && kids(n)[0].type === "circle" && kids(n)[0].props.r === "3";
  for (const name of ["mic", "stop", "undo", "lock", "dashring", "copy", "pencil", "ban", "globe", "sparkle", "search", "check", "x", "clock", "users", "shield"]) {
    assert.ok(kids(Real({ name, size: 14 })).length >= 1, name);
    assert.equal(fallback(Real({ name, size: 14 })), false, `${name} falls through to the circle`);
  }
  assert.equal(fallback(Real({ name: "not-an-icon" })), true, "an unknown name still draws the circle");
});

test("the composer turns words into a plan card through one Ask turn, sent with no scope and the clients surface", async () => {
  const sent = [];
  globalThis.window.__ask = {
    send: async (input, on) => {
      sent.push(input);
      on({ t: "thread", id: "t1", title: "Find leads" });
      on({ t: "trace", text: "Reading what you asked" });
      on({ t: "trace", text: "Sizing the search" });
      on({ t: "delta", text: "Here's the plan." });
      on({ t: "final", message: { id: "m1", text: "Here's the plan. Nothing runs until you approve it.", proposals: [CARD] } });
    },
  };
  const { st, set } = page({ words: "200 personal trainers in Austin with a website" });
  const card = await globalThis.window.leadFinderPlan(st.words, set);
  assert.equal(sent.length, 1, "one turn, not one per word");
  assert.deepEqual([sent[0].scope, sent[0].surface, sent[0].threadId], [null, "clients", null], "scopeFromRoute has no scope for clients/leads, so the words name Leads themselves");
  assert.match(sent[0].text, /Leads/, sent[0].text);
  assert.match(sent[0].text, /200 personal trainers in Austin with a website/);
  assert.deepEqual([st.stage, st.trace, st.refusal, card.id], ["plan", "Sizing the search", null, "p1"]);
  assert.equal(st.plan.count, 200, "the card's plan is what the page now holds");
  const tree = drawFinder(st);
  assert.ok(byTestId(tree, "lead-plan"), "the card is drawn");
  assert.equal(byTestId(tree, "finder-thinking"), null, "the trace line is gone");
  assert.equal(byTestId(tree, "finder-refusal"), null);
});

test("a refusal is words under the input and no card, and the finder is back where the owner can change what they asked", async () => {
  globalThis.window.__ask = {
    send: async (input, on) => {
      on({ t: "trace", text: "Reading what you asked" });
      on({ t: "final", message: { id: "m2", text: "I can only find businesses in the US for now.", proposals: [] } });
    },
  };
  const { st, set } = page({ words: "dentists in Toronto" });
  const card = await globalThis.window.leadFinderPlan(st.words, set);
  assert.deepEqual([card, st.stage, st.proposal], [null, "compose", null]);
  const tree = drawFinder(st);
  const said = byTestId(tree, "finder-refusal");
  assert.equal(textOf(said), "I can only find businesses in the US for now.");
  assert.equal(said.props.role, "status");
  assert.equal(byTestId(tree, "lead-plan"), null, "no card");
  assert.equal(byTestId(tree, "finder-input").props.value, "dentists in Toronto", "what they typed is still there to change");
  globalThis.window.__ask = { send: async (input, on) => on({ t: "error", text: "Chanlytics didn't answer — ask again in a moment." }) };
  const again = page({ words: "dentists in Austin" });
  await globalThis.window.leadFinderPlan(again.st.words, again.set);
  assert.equal(again.st.refusal, "Chanlytics didn't answer — ask again in a moment.", "the stream's own error is said the same way");
});

test("hold-to-talk fills the input with what was heard and uploads nothing; with no recogniser there is no button", () => {
  const { st } = page();
  const heard = [];
  const talk = { canTalk: true, listening: true, start: () => heard.push("start"), stop: () => heard.push("stop") };
  const tree = drawFinder(st, { talk, onWords: (v) => { st.words = v; } });
  const mic = byTestId(tree, "finder-talk");
  assert.equal(mic.props["aria-pressed"], true, "it says it is listening");
  mic.props.onPointerDown();
  mic.props.onPointerUp();
  assert.deepEqual(heard, ["start", "stop"], "press starts the browser's own recogniser, release stops it");
  // What was heard arrives through useAskTalk's onWords, which ClientsAReal points at the finder's words.
  st.words = "wedding planners around Austin";
  assert.equal(byTestId(drawFinder(st, { talk }), "finder-input").props.value, "wedding planners around Austin");
  assert.equal(byTestId(drawFinder(st, { talk: { canTalk: false } }), "finder-talk"), null, "a browser with no recogniser is offered nothing");
});

test("the composer offers three suggestions, each with how reachable that kind is, and picking one fills the input", () => {
  const { st } = page();
  const tree = drawFinder(st);
  const items = allTestId(tree, "finder-suggestion");
  assert.equal(items.length, 3, "three, whatever the server sent");
  assert.equal(textOf(byTestId(tree, "finder-suggestions")).startsWith("Suggested for Chanlytics, from what your business does"), true, textOf(byTestId(tree, "finder-suggestions")));
  assert.match(textOf(items[0]), /about 6 in 10 have an email/);
  click(items[1]);
  assert.equal(st.words, "Physical therapists within 5 miles");
  const thinking = drawFinder({ ...st, stage: "thinking", trace: "Sizing the search" });
  assert.equal(byTestId(thinking, "finder-suggestions"), null, "nothing to pick while it thinks");
  assert.equal(textOf(byTestId(thinking, "finder-thinking")), "Sizing the search");
  assert.equal(byTestId(thinking, "finder-input").props.disabled, true);
});

test("the finder is the page's own overlay, and Enter plans what was typed", () => {
  const { st } = page({ words: "200 personal trainers in Austin" });
  let planned = 0;
  const tree = drawFinder(st, { onPlan: () => { planned += 1; } });
  const panel = byTestId(tree, "lead-finder");
  assert.equal(panel.props.role, "dialog");
  assert.match(panel.props.className, /\bpl-finder\b/, "PL_OVERLAY excludes .pl-finder, so the page's keys stay awake");
  assert.equal(press(byTestId(tree, "finder-input"), "Enter"), true);
  assert.equal(planned, 1);
  click(byTestId(tree, "finder-plan"));
  assert.equal(planned, 2);
  assert.equal(byTestId(drawFinder(page({ words: "" }).st), "finder-plan").props.disabled, true, "nothing typed, nothing to plan");
  assert.equal(globalThis.window.LeadFinder({ open: false, stage: "compose", words: "", onWords() {}, onPlan() {}, onApprove() {}, onBack() {}, onClose() {} }), null);
});
