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
import { LeadSearchPlanSchema, LEAD_COUNT_CHOICES, LEAD_ROUND_ENDINGS, planArea, planMinutes, planSaid, planSentence, planVersionOf, planWhere, planWho, planWords } from "../../../packages/contracts/src/lead-search.ts";
import { leadEndingLine, leadPlanAsk, leadPlanFacts, leadPlanLikely } from "../../../packages/contracts/src/leads.ts";

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
// The derivations bag seed-globals.ts publishes: the card and the strip read
// every word they say from it, never from a spelling of their own.
Object.assign(globalThis.window, {
  __LEAD_VM: { planWords, planSaid, planWhere, planWho, planArea, planMinutes, planSentence, planVersionOf, LEAD_COUNT_CHOICES, leadEndingLine, leadPlanLikely, leadPlanFacts, leadPlanAsk },
});
await import("../../../apps/dashboard/src/legacy/components/icons.jsx");
await import("../../../apps/dashboard/src/legacy/pages/leads-finder.jsx");

// Task 10's view model. The plan writes `leadStrip` in contracts (step 4) and
// seeds it on `__LEAD_VM` (step 7a); on this branch neither is there, so it is
// the page's own, published by leads-finder.jsx beside the strip that draws
// it. Its NINE ENDING SENTENCES are still contracts' `leadEndingLine`, read off
// the bag above -- which is what the last test in this file pins.
const leadStrip = (...a) => globalThis.window.leadStrip(...a);

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
  // The fixture used to invent a `forWho` the DTO never carried, and the header read "Suggested for , from…" on the page.
  assert.equal(textOf(byTestId(tree, "finder-suggestions")).startsWith("Suggested from what your business does"), true, textOf(byTestId(tree, "finder-suggestions")));
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

/* ------------------------------------------------- Task 9: the plan card */

const drawCard = (st, over = {}) => {
  seq = 0;
  return globalThis.window.LeadPlanCard({
    plan: st.plan, view: { title: "Find 200 personal trainers" }, facts: FACTS, busy: false, refusal: st.refusal,
    baseVersion: 1, pick: st.pick, onPick: (v) => { st.pick = v; },
    onChange: (p) => { st.plan = p; }, onApprove: () => {}, onBack: () => {}, ...over,
  });
};
/** Open a picker and take one of its options: what a mouse does, in two presses. */
const pickOption = (st, id, option, over = {}) => {
  click(byTestId(drawCard(st, over), `plan-${id}`));
  click(byTestId(drawCard(st, over), `plan-${id}-${option}`));
};

test("a changed count re-plans without the model, and a changed area makes a new version the owner approves", () => {
  const sent = [];
  globalThis.window.__ask = { send: async (i) => { sent.push(i); } };
  const st = { plan: PLAN, pick: null, refusal: null };
  assert.equal(textOf(byTestId(drawCard(st), "plan-sentence")), "Find 200 personal trainers in Austin, TX with a website, then find their email and check it.");
  pickOption(st, "count", "50");
  assert.equal(textOf(byTestId(drawCard(st), "plan-sentence")), "Find 50 personal trainers in Austin, TX with a website, then find their email and check it.");
  assert.equal(st.plan.version, 2, "the count is one of the five that make a new version (S15; planVersionOf on main)");
  const counts = byTestId((click(byTestId(drawCard(st), "plan-count")), drawCard(st)), "plan-count-50");
  assert.match(textOf(counts), /about 3 min/, "every count says about how long it takes");
  st.pick = null;
  pickOption(st, "area", "Round Rock, TX");
  assert.equal(st.plan.version, 3, "and so is the area");
  assert.equal(textOf(byTestId(drawCard(st), "plan-sentence")), "Find 50 personal trainers in Round Rock, TX with a website, then find their email and check it.");
  assert.equal(textOf(byTestId(drawCard(st), "plan-changed")), "changed");
  assert.equal(sent.length, 0, "no model call: a picked word re-plans on the page");
});

test("the contact standard is in the sentence and its picker switches it, and the sentence says so", () => {
  const st = { plan: PLAN, pick: null, refusal: null };
  const tok = byTestId(drawCard(st), "plan-contact");
  assert.equal(textOf(tok), "then find their email and check it");
  assert.equal(tok.props["aria-haspopup"], "listbox");
  pickOption(st, "contact", "phone");
  assert.equal(textOf(byTestId(drawCard(st), "plan-contact")), "a phone is enough");
  assert.equal(st.plan.version, 2, "the contact standard makes a new version");
  const open = (click(byTestId(drawCard(st), "plan-contact")), drawCard(st));
  const box = byTestId(open, "plan-contact-options");
  assert.equal(box.props.role, "listbox");
  assert.deepEqual(all(box, (n) => n.props?.role === "option").map((n) => n.props["aria-selected"]), [false, true]);
  assert.equal(press(byTestId(open, "plan-contact"), "Escape"), true, "Esc closes the picker here, before the page's listener");
  assert.equal(st.pick, null);
});

test("a criterion says how sure it has to be, and a fact the card cannot see is said before anything is spent, with the likely version offered", () => {
  const seen = planVersionOf(PLAN, { criteria: [{ key: "otc", text: "Already sell OTC medicine", standard: "seen", required: true }] });
  const cannotSee = { key: "otc", text: "Already sell OTC medicine", likely: "Could sell OTC medicine" };
  const st = { plan: seen, pick: null, refusal: null };
  const facts = { ...FACTS, cannotSee };
  const tree = drawCard(st, { facts });
  assert.match(textOf(byTestId(tree, "plan-sentence")), /already sell OTC medicine \(confirmed\)/);
  assert.match(textOf(byTestId(tree, "plan-cannot-see")), /can't be confirmed\. Nothing has been spent\./);
  assert.equal(byTestId(tree, "plan-approve").props.disabled, true, "nothing starts until the owner chooses");
  click(byTestId(tree, "plan-take-likely"));
  assert.deepEqual([st.plan.criteria[0].standard, st.plan.criteria[0].text], ["likely", "Could sell OTC medicine"]);
  assert.equal(byTestId(drawCard(st, { facts }), "plan-approve").props.disabled, false, "chosen: it can start");
  assert.equal(byTestId(drawCard(st, { facts }), "plan-cannot-see"), null);
  const other = { plan: seen, pick: null, refusal: null };
  click(byTestId(drawCard(other, { facts }), "plan-drop-unseen"));
  assert.deepEqual(other.plan.criteria, [], "or the criterion goes, and the sentence with it");
});

test("Leaving out is chips the owner can take back, Likely says what past searches found, and the facts are in leads with no dollar meter", () => {
  const st = { plan: PLAN, pick: null, refusal: null };
  const tree = drawCard(st);
  assert.equal(textOf(byTestId(tree, "plan-likely")), "About 116 will have an email; the rest you call · from past searches for trainers");
  assert.equal(textOf(byTestId(tree, "plan-facts")), "About 8 minutes — leave the page if you likeSkips the 14 already yoursCounts only matches you can reach · 486 left this month");
  assert.equal(/\$/.test(textOf(tree)), false, "there is no dollar meter");
  const chip = byTestId(tree, "plan-leaving-chain");
  assert.match(textOf(chip), /Chain gyms/);
  click(find(chip, (n) => n.type === "button"));
  assert.deepEqual(st.plan.exclusions, [], "the chip is removable");
  assert.equal(st.plan.version, 2, "and that is a new version");
  assert.equal(byTestId(drawCard(st), "plan-leaving"), null);
  const fresh = drawCard({ plan: PLAN, pick: null, refusal: null }, { facts: { ...FACTS, prior: null } });
  assert.equal(textOf(byTestId(fresh, "plan-likely")), "How many have an email is checked after the first 25.");
});

test("Find N leads commits the card through the route, and a refusal is said under the button in the route's words", async () => {
  const committed = [];
  globalThis.window.__ask = { commit: async (p) => { committed.push(p); return { ok: false, message: "This month's searching budget is used. A smaller search, or a phone standard, may still fit." }; } };
  const { st, set } = page({ stage: "plan", proposal: CARD, plan: PLAN });
  await globalThis.window.leadFinderApprove(st.proposal, st.plan, set);
  assert.equal(committed.length, 1);
  assert.equal(committed[0].payload.plan.count, 200, "the plan the card holds, not the one the model first wrote");
  assert.deepEqual([st.stage, st.open], ["plan", true], "a refused start leaves the card where it was");
  const refused = byTestId(drawCard({ plan: PLAN, pick: null, refusal: st.refusal }), "plan-refusal");
  assert.equal(textOf(refused), "This month's searching budget is used. A smaller search, or a phone standard, may still fit.");
  assert.equal(refused.props.role, "alert");
  globalThis.window.__ask = { commit: async () => ({ ok: true, receipt: "Finding 200 personal trainers. It carries on if you leave; Leads shows it.", undo: { search_id: "s1" } }) };
  const ok = page({ stage: "plan", proposal: CARD, plan: PLAN, words: "x" });
  const r = await globalThis.window.leadFinderApprove(ok.st.proposal, ok.st.plan, ok.set);
  assert.deepEqual([r.ok, ok.st.open, ok.st.stage, ok.st.proposal, ok.st.words], [true, false, "compose", null, ""], "the strip takes over from the surface's newest search");
});

test("near the month's limit the card offers what is left and says when the leads renew", () => {
  const st = { plan: PLAN, pick: null, refusal: null };
  const month = drawCard(st, { facts: { ...FACTS, leadsLeft: 36, bound: "allowance" } });
  assert.equal(textOf(byTestId(month, "plan-approve")), "Find 36 leads");
  assert.equal(textOf(byTestId(month, "plan-covers")), "You have 36 leads left this month. Your leads renew on Oct 1.");
  const budget = drawCard(st, { facts: { ...FACTS, leadsLeft: 60, bound: "budget" } });
  assert.equal(textOf(byTestId(budget, "plan-covers")), "Emails for personal trainers are hard to find, so this month covers about 60 more. Find 60 now?");
  let approved = null;
  click(byTestId(drawCard(st, { facts: { ...FACTS, leadsLeft: 36, bound: "allowance" }, onApprove: (p) => { approved = p; } }), "plan-approve"));
  assert.deepEqual([approved.count, approved.version], [36, 2], "the clamped count is what is approved, as a new version");
  assert.equal(byTestId(drawCard(st), "plan-covers"), null, "nothing to say when nothing binds");
});

/* --------------------------------------------------- Task 10: the strip */

const SEARCH = {
  id: "5e000000-0000-4000-8000-000000000001", name: "Personal trainers \u00b7 Austin", asked: PLAN.asked, asked_on: "2026-09-18T10:00:00Z",
  plan: PLAN, plan_version: 1,
  round: {
    id: "5e000000-0000-4000-8000-0000000000a1", seq: 1, purpose: "probe", state: "running", ending: null, ending_pending: null,
    question: null, target: 200, counted: 86, qualified: 80, review: 4, excluded: 40, emails_checked: 41, with_phone: 45,
    cost_usd: 0.4, ended_at: null, undo_op_id: null, undo_version: null,
  },
};
const NOW = new Date("2026-09-19T15:00:00Z");
const withRound = (over) => ({ ...SEARCH, round: { ...SEARCH.round, ...over } });
const ended = (ending, over = {}) => withRound({ state: "ended", ending, counted: 61, excluded: 40, emails_checked: 34, with_phone: 27, qualified: 0, review: 0, ended_at: "2026-09-19T14:00:00Z", ...over });
const ids = (vm) => vm.actions.map((a) => a.id);
const drawStrip = (search, acted, extra = {}) => {
  seq = 0;
  return globalThis.window.LeadStrip({ vm: leadStrip(search, NOW, extra), onAction: (id, arg) => acted.push([id, arg]) });
};

test("the running strip says what is true, and its Stop is the only thing to press", () => {
  const acted = [];
  const tree = drawStrip(SEARCH, acted);
  assert.equal(textOf(byTestId(tree, "strip-title")), "Finding personal trainers in Austin, TX");
  assert.equal(textOf(byTestId(tree, "strip-parts")), " \u00b7 86 of 200 \u00b7 41 emails checked \u00b7 about 5 min left");
  assert.equal(byTestId(tree, "lead-strip").props.role, "status");
  assert.equal(all(tree, (n) => n.type === "button").length, 1, "nothing else on a running round is the owner's to press");
  click(byTestId(tree, "strip-stop"));
  assert.deepEqual(acted, [["stop", undefined]], "Stop carries nothing: the search it belongs to is the page's");
  const bar = find(tree, (n) => n.props?.className === "lf-strip-bar");
  assert.equal(bar.props.style.width, "43%");
  const early = drawStrip(withRound({ counted: 12 }), []);
  assert.match(textOf(byTestId(early, "strip-parts")), /estimates update after the first 25$/, "until the first 25 are in the estimate is an assumption and says so");
  assert.equal(/estimates update/.test(textOf(byTestId(tree, "strip-parts"))), false, "past them it is measured, so it stops saying it will change");
});

test("the question strip is the accent with role alert, and its three answers hand back what they say", () => {
  const acted = [];
  const q = withRound({ state: "waiting_on_owner", counted: 9, question: { sentence: "Half of the first 25 are chain gyms, which I'm leaving out. Keep going this way?", criterion_key: "chain" } });
  const tree = drawStrip(q, acted);
  const strip = byTestId(tree, "lead-strip");
  assert.equal(strip.props.role, "alert");
  assert.match(strip.props.className, /\bask\b/, "the accent tint");
  assert.equal(textOf(byTestId(tree, "strip-title")), "Half of the first 25 are chain gyms, which I'm leaving out. Keep going this way?");
  assert.equal(textOf(byTestId(tree, "strip-parts")), "Nothing is spent while this waits. Answer and it carries on.");
  assert.deepEqual(all(tree, (n) => n.type === "button").map((n) => textOf(n)), ["Yes, keep going", "Include chain gyms", "Stop here"]);
  click(byTestId(tree, "strip-keep"));
  click(byTestId(tree, "strip-include"));
  click(byTestId(tree, "strip-stop_here"));
  assert.deepEqual(acted, [["keep", undefined], ["include", "chain"], ["stop_here", undefined]], "Include carries the criterion the owner is taking back");
  const unknown = leadStrip(withRound({ state: "waiting_on_owner", question: { sentence: "Keep going?", criterion_key: "gone" } }), NOW);
  assert.equal(unknown.actions[1].label, "Include what I left out", "a key the plan no longer holds never puts a stored word on the screen");
});

test("after Stop the strip says the emails of the found are still being checked, then that the found are the owner's", () => {
  const stopping = drawStrip(withRound({ state: "checking", ending_pending: "stopped", counted: 61 }), []);
  assert.equal(`${textOf(byTestId(stopping, "strip-title"))}${textOf(byTestId(stopping, "strip-parts"))}`, "Stopping \u00b7 checking the emails of the 61 found \u00b7 nothing else was counted");
  assert.equal(all(stopping, (n) => n.type === "button").length, 0, "nothing to press while it finishes");
  const checking = drawStrip(withRound({ state: "checking", ending_pending: "target_reached", counted: 200 }), []);
  assert.equal(textOf(byTestId(checking, "strip-title")), "Checking the emails of the 200 found", "a round that finished is not Stopping");
  const acted = [];
  const done = drawStrip(withRound({ state: "ended", ending: "stopped", counted: 61, ended_at: "2026-09-19T14:30:00Z" }), acted);
  assert.equal(textOf(byTestId(done, "strip-title")), "Stopped at 61");
  click(byTestId(done, "strip-carry_on"));
  click(byTestId(done, "strip-undo"));
  assert.deepEqual([acted[0][0], acted[0][1].count, acted[1]], ["carry_on", 200, ["undo", { searchId: "5e000000-0000-4000-8000-000000000001" }]], "Carry on hands back the plan to approve; Undo hands back the search");
});

test("every ending is one strip with one next step, and each draws its own words", () => {
  for (const ending of LEAD_ROUND_ENDINGS) {
    const acted = [];
    const tree = drawStrip(withRound({ state: "ended", ending, counted: 61, ended_at: "2026-09-19T14:30:00Z" }), acted);
    const strip = byTestId(tree, "lead-strip");
    assert.match(strip.props.className, /\bdone\b/, ending);
    assert.equal(strip.props.role, "status", ending);
    assert.ok(textOf(byTestId(tree, "strip-title")).length > 0, ending);
    const buttons = all(tree, (n) => n.type === "button");
    assert.ok(buttons.length <= 3, `${ending}: ${buttons.length} buttons`);
    assert.ok(leadStrip(withRound({ state: "ended", ending, counted: 61, ended_at: "2026-09-19T14:30:00Z" }), NOW).actions.filter((a) => globalThis.window.LEAD_ROUND_MAKERS.includes(a.id)).length <= 1, `${ending} offers more than one next step`);
    assert.equal(/\$|apify|compass|bounceverify/i.test(textOf(tree)), false, `${ending} says something it must not: ${textOf(tree)}`);
    assert.equal(/undefined|NaN|null/.test(textOf(tree)), false, `${ending}: ${textOf(tree)}`);
    for (const b of buttons) click(b);
    assert.equal(acted.length, buttons.length, ending);
  }
  const reached = drawStrip(withRound({ state: "ended", ending: "target_reached", counted: 200, emails_checked: 88, with_phone: 112, excluded: 40 }), []);
  assert.equal(textOf(byTestId(reached, "strip-title")), "Found 200 personal trainers");
  assert.equal(textOf(byTestId(reached, "strip-parts")), " \u00b7 88 you can email \u00b7 112 by phone \u00b7 40 left out");
  assert.equal(byTestId(reached, "strip-excluded").props.className, "lnk", "40 left out is a link into the view, not a button beside the next step");
  assert.equal(textOf(byTestId(reached, "strip-excluded")), "40 left out");
});

test("each ending says contracts' own sentence, with this round's numbers in it, and Undo goes once it is a day old or has been used", () => {
  assert.deepEqual(
    LEAD_ROUND_ENDINGS.map((e) => { const v = leadStrip(ended(e), NOW); return [e, [v.title, ...v.parts].join(" \u00b7 "), ids(v)]; }),
    [
      ["target_reached", "Found 61 personal trainers \u00b7 34 you can email \u00b7 27 by phone \u00b7 40 left out", ["excluded", "sort_fit", "undo"]],
      ["searched_everything", "Found 61 personal trainers \u00b7 everything these searches returned in Austin, TX", ["nearby", "sort_fit", "undo"]],
      ["month_leads_used", "Stopped at 61 \u00b7 this month's leads are used \u00b7 the 61 found are yours", ["undo"]],
      ["budget_used", "Stopped at 61 \u00b7 this month's searching is used up \u00b7 the 61 found are yours", ["undo"]],
      ["few_new_matches", "All 40 personal trainers in Austin, TX are already yours.", ["undo"]],
      ["stopped", "Stopped at 61 \u00b7 the 61 found are yours \u00b7 nothing else was counted", ["carry_on", "undo"]],
      ["source_failed", "Stopped at 40: the source stopped answering \u00b7 the 61 found are yours \u00b7 nothing more was counted", ["try_again", "undo"]],
      ["question_unanswered", "Stopped after a day without your answer \u00b7 the 61 found before it asked are yours", ["answer_now", "undo"]],
      ["paused", "Lead searches are paused for now \u00b7 your leads are all here \u00b7 nothing is being counted", ["undo"]],
    ],
  );
  assert.equal(leadStrip(ended("target_reached"), NOW).actions[0].label, "40 left out");
  assert.equal(leadStrip(ended("searched_everything"), NOW).actions[0].label, "Find 139 more nearby");
  const nearby = leadStrip(ended("searched_everything", { counted: 0, excluded: 3 }), NOW, { nearby: ["Alpine", "Fort Davis"] });
  assert.equal(nearby.title, "There are 3 personal trainers in Austin, TX, and all of them are chain gyms, which you asked me to leave out.");
  assert.deepEqual([nearby.parts, ids(nearby)], [["Nothing was counted."], ["nearby", "undo"]], "nothing was counted, so nothing is worth re-sorting");
  assert.deepEqual(ids(leadStrip(ended("searched_everything", { counted: 0, excluded: 3 }), NOW)), ["undo"], "with nowhere else to look there is no next step to offer");
  assert.equal(ids(leadStrip(ended("target_reached", { ended_at: "2026-09-18T10:00:00Z" }), NOW)).includes("undo"), false, "over a day later there is nothing to undo");
  assert.equal(ids(leadStrip(ended("target_reached", { undo_op_id: "5e000000-0000-4000-8000-0000000000b1", undo_version: 1 }), NOW)).includes("undo"), false, "already undone: the view carries the operation the toast puts back");
  assert.equal(ids(leadStrip(SEARCH, NOW)).includes("undo"), false, "a round still going has nothing to undo");
});

test("an ending never re-sorts by itself: it offers Sort by fit, and says how many new ones are waiting", () => {
  const acted = [];
  const tree = drawStrip(withRound({ state: "ended", ending: "target_reached", counted: 200, emails_checked: 88, with_phone: 112 }), acted, { offered: 12 });
  assert.equal(textOf(byTestId(tree, "strip-take_offered")), "12 new");
  click(byTestId(tree, "strip-take_offered"));
  click(byTestId(tree, "strip-sort_fit"));
  assert.deepEqual(acted, [["take_offered", undefined], ["sort_fit", undefined]]);
  assert.equal(byTestId(drawStrip(withRound({ state: "ended", ending: "target_reached" }), []), "strip-take_offered"), null, "nothing waiting, nothing said");
  assert.equal(globalThis.window.LeadStrip({ vm: null, onAction() {} }), null);
});

test("the nine ending sentences are contracts' leadEndingLine, never the strip's own: with no leadEndingLine there is no ended strip", () => {
  const bag = globalThis.window.__LEAD_VM;
  try {
    globalThis.window.__LEAD_VM = { ...bag, leadEndingLine: undefined };
    assert.equal(leadStrip(ended("target_reached"), NOW), null, "a word this file cannot read from contracts is a word it does not say");
    assert.equal(globalThis.window.LeadStrip({ vm: leadStrip(ended("target_reached"), NOW), onAction() {} }), null);
    const running = leadStrip(SEARCH, NOW);
    assert.equal(running.title, "Finding personal trainers in Austin, TX", "the running, checking and question lines are the strip's own and still draw");
  } finally {
    globalThis.window.__LEAD_VM = bag;
  }
});
