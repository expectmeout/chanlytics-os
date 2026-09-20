/**
 * The peek, and everything the owner does to one lead from it: the stage, Not a fit and its five whys, Keep and
 * Exclude, Put back, a call from their own phone with its six outcomes, and a draft for their own inbox.
 *
 * Drawn on the tests' stub React, as refusals-on-the-page does: the components are hookless, so a draw is a call and
 * the state is this file's, the way ClientsAReal holds it on the real page. Nothing is mocked that the owner reads:
 * the view model is contracts' own toLeadPeekVM and the words are contracts' LEAD_WORDS.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { roleGate } from "../../../packages/contracts/src/refusal.ts";
import {
  LEAD_WORDS, LEAD_EMAIL_WORDS, LEAD_LOCKED_LINE, LEAD_DRAFT_NOTE, LEAD_NO_ADDRESS,
  LEAD_CHECK_GROUP_WORDS, LEAD_CHECK_UNSURE, LEAD_NOT_A_FIT_WORDS, LEAD_CONTACT_STANDARD_WORDS,
  outcomeMove, leadDraftFooter, toLeadPeekVM,
} from "../../../packages/contracts/src/leads.ts";

let cells = [];
let seq = 0;
const listeners = {};
const flashes = [];
const opened = [];
const dialled = [];
const copied = [];

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
  useEffect: (fn) => { const k = seq++; if (!(k in cells)) { cells[k] = true; fn(); } },
};
globalThis.ReactDOM = { createPortal: (node) => node };
const on = (bag) => (name, fn) => { (bag[name] = bag[name] || []).push(fn); };
const off = (bag) => (name, fn) => { bag[name] = (bag[name] || []).filter((f) => f !== fn); };
globalThis.document = {
  body: {},
  hidden: false,
  addEventListener: on(listeners),
  removeEventListener: off(listeners),
  createElement: () => ({ setAttribute() {}, style: {}, classList: { add() {}, remove() {} } }),
};
globalThis.window = {
  document: globalThis.document,
  addEventListener: on(listeners),
  removeEventListener: off(listeners),
  dispatchEvent() {},
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h),
  location: { assign: (href) => dialled.push(href) },
  navigator: { clipboard: { writeText: async (t) => { copied.push(t); } } },
  __roleGate: roleGate,
  __chrome: {},
};
await import("../../../apps/dashboard/src/legacy/components/icons.jsx");
await import("../../../apps/dashboard/src/legacy/components/data-bits.jsx");
globalThis.Icon = globalThis.window.Icon;
// The table's own helpers: `leads-scope.jsx` reads plSortKeys at module scope (LEAD_SORT_KEYS), so the file it was
// lifted from loads first here, as people-honest's harness loads it.
await import("../../../apps/dashboard/src/legacy/pages/people-table.jsx");
for (const k of ["PeopleTable", "PeopleColumnsMenu", "plLocked", "plShows", "plSortKeys", "plDrawnColumns", "plColumnChoices", "plColumnOptions", "PL_NO_SEL"]) globalThis[k] = globalThis.window[k];
await import("../../../apps/dashboard/src/legacy/pages/leads-scope.jsx");   // Task 2's: LeadShape is its, and this file draws it
await import("../../../apps/dashboard/src/legacy/pages/leads-peek.jsx");
for (const k of ["LeadPeek", "LeadShape", "LeadPeekActions", "leadPeekEscape", "leadPeekFollows", "leadPeekFocus", "leadArmOnReturn"]) globalThis[k] = globalThis.window[k];
globalThis.window.__LEAD_WORDS = LEAD_WORDS;

/* ------------------------------------------------------------ the helpers */

const walk = (n, fn) => { if (n == null || typeof n !== "object") return; fn(n); for (const k of n.props?.children ?? []) walk(k, fn); if (n.rendered) walk(n.rendered, fn); };
const all = (tree, pred) => { const out = []; walk(tree, (n) => { if (pred(n)) out.push(n); }); return out; };
const find = (tree, pred) => all(tree, pred)[0] ?? null;
const byTestId = (tree, id) => find(tree, (n) => n.props?.["data-testid"] === id);
const textOf = (n) => {
  if (n == null || typeof n === "boolean") return "";
  if (typeof n === "string" || typeof n === "number") return String(n);
  if (Array.isArray(n)) return n.map(textOf).join("");
  if (n.rendered !== undefined) return textOf(n.rendered);
  return (n.props?.children ?? []).map(textOf).join("");
};
const press = async (node) => { assert.ok(node, "no such control"); await node.props.onClick({ preventDefault() {}, stopPropagation() {}, currentTarget: node }); };
const settle = async (n = 6) => { for (let i = 0; i < n; i += 1) await new Promise((r) => setTimeout(r, 0)); };

/* ----------------------------------------------------------- the fixtures */

const LEAD = "5e000000-0000-4000-8000-000000000111";
const SEARCH_ID = "5e000000-0000-4000-8000-000000000001";
const PLAN = {
  version: 1, card: "local_businesses", name: "Personal trainers · Austin", asked: "200 personal trainers in Austin with a website",
  terms: ["personal trainer"], area: { kind: "city", label: "Austin, TX", state: "TX", center: { lat: 30.26, lng: -97.74 }, radius_m: 20000, query: "Austin, TX" },
  count: 200, contact: "email",
  criteria: [{ key: "independent", text: "independent", standard: "likely", required: true }],
  exclusions: [{ key: "chain", text: "Chain gyms", origin: "claude" }],
};
const SEARCH = {
  id: SEARCH_ID, name: "Personal trainers · Austin", asked: PLAN.asked, asked_on: "2026-09-18T14:00:00.000Z", plan: PLAN, plan_version: 1,
  round: { id: "r1", seq: 2, purpose: "main", state: "ended", ending: "target_reached", question: null, target: 200, counted: 160, qualified: 160, review: 12, excluded: 40, emails_checked: 88, with_phone: 72, ending_pending: false, waiting_since: null, cost_usd: 3.2, ended_at: "2026-09-18T14:40:00.000Z", undo_op_id: null, undo_version: null },
};
const CHECKS = [
  { key: "on_maps", how: "seen", answer: "yes", source: "Google Maps", reason: null },
  { key: "in_area", how: "seen", answer: "yes", source: "Google Maps · the plan", reason: "Travis Heights, inside 20km of the center" },
  { key: "phone_two_sources", how: "seen", answer: "yes", source: "Maps · website", reason: null },
  { key: "mailbox", how: "seen", answer: "yes", source: "Mailbox check", reason: null },
  { key: "independent", how: "read", answer: "yes", source: "Claude · the listing", reason: "one address, no brand in the name" },
  { key: "right_kind", how: "read", answer: "yes", source: "Claude · the listing", reason: "listed as a personal trainer" },
  { key: "own_address", how: "read", answer: "yes", source: "Claude · website", reason: "on their own domain and answers bookings" },
];
const row = (over = {}) => ({
  id: LEAD, search_id: SEARCH_ID, place_id: "ChIJfixture0000000000000001",
  business_name: "Travis Heights Coaching Co.", category: "Personal trainer", city: "Austin", state: "TX", street: "1200 Barton Springs Rd",
  phone: "+15125550142", phone_agrees: true, phone_wrong: false,
  email: "hello@travisheightscoaching.example", email_state: "ok", email_checked_at: "2026-09-18T19:16:00.000Z",
  website: "travisheightscoaching.example", instagram: "https://instagram.example/travisheights",
  rating: 5, reviews: 16, stage: "ready", closed_reason: null, contact_id: null,
  last_outcome: null, last_note: null, contacted_at: null, converted_at: null,
  places: 1, found_at: "2026-09-18T19:14:00.000Z", exported_at: null, version: 3,
  ...over,
  member: {
    class: "qualified", fit: "strong", reason: "Independent coaching · 5.0 from 16 reviews · email checked",
    excluded_by: null, distance_m: 2400, counted: true, checks: CHECKS,
    other_emails: [{ email: "careers@travisheightscoaching.example", why: "for job seekers" }, { email: "A coach's personal mailbox", why: "not the business" }],
    ...(over.member || {}),
  },
});
const NOW = new Date("2026-09-18T20:00:00.000Z");
const TZ = "America/Chicago";
const vmOf = (over) => toLeadPeekVM(row(over), SEARCH, TZ, NOW);

/** A courier that answers as the routes do, and records what it was asked. */
const courierOf = (over = {}) => {
  const seen = [];
  const api = {
    seen,
    __leadStage: async (id, input) => { seen.push(["stage", id, input]); return over.stage ? over.stage(input) : { ok: true, data: { stage: "nurture", closed_reason: null, contact_id: null, existed: false, converted: false, op_id: "op-1", version: 4, toast: "Marked contacted.", undo: { op_id: "op-1", version: 4 } } }; },
    __leadDraft: async (id, input) => { seen.push(["draft", id, input]); return over.draft ? over.draft(input) : { ok: true, data: { to: "hello@travisheightscoaching.example", subject: "Missed calls at Travis Heights", body: `Hi,\n\nI came across Travis Heights Coaching Co. on Google Maps.${leadDraftFooter("Melany's Beauty Salon", "1 Main St, Austin, TX 78701")}`, mailto: "mailto:hello%40travisheightscoaching.example?subject=Missed%20calls" } }; },
    __leadUndo: async (opId, version) => { seen.push(["undo", opId, version]); return over.undo ? over.undo() : { ok: true, data: {} }; },
  };
  return api;
};

/** The page's own state, the way ClientsAReal holds it: peekMode, armed and draft beside peekId. */
const page = (over = {}) => {
  const st = { peekId: LEAD, mode: "info", armed: null, draft: null, ...over };
  const p = {
    vm: over.vm || vmOf(),
    searchId: SEARCH_ID,
    courier: over.courier || courierOf(),
    flash: (t) => flashes.push(t),
    onOpenPerson: (id) => opened.push(id),
    keep: (id) => flashes.push({ msg: `keep ${id}` }),
    exclude: (id) => flashes.push({ msg: `exclude ${id}` }),
    putBack: (id) => flashes.push({ msg: `put back ${id}` }),
    copyEmail: (id) => copied.push(`email ${id}`),
    dial: (href) => dialled.push(href),
    setPeekId: (v) => { st.peekId = v; },
    setMode: (v) => { st.mode = v; },
    setArmed: (v) => { st.armed = typeof v === "function" ? v(st.armed) : v; },
    setDraft: (v) => { st.draft = typeof v === "function" ? v(st.draft) : v; },
    get armed() { return st.armed; },
    get draft() { return st.draft; },
    get mode() { return st.mode; },
  };
  const draw = () => {
    seq = 0;
    const acts = globalThis.LeadPeekActions(p);
    return { tree: globalThis.LeadPeek({ vm: p.vm, mode: st.mode, armed: st.armed, draft: st.draft, ...acts }), acts };
  };
  return { st, p, draw };
};

const reset = () => { cells = []; seq = 0; flashes.length = 0; opened.length = 0; dialled.length = 0; copied.length = 0; for (const k of Object.keys(listeners)) delete listeners[k]; delete globalThis.window.ST_STORE; };

/* ================================================== Task 12: the peek ==== */

test("the peek names the business, its sub-line, the fit as a sentence and the stage it is at", () => {
  reset();
  const { tree } = page().draw();
  assert.equal(tree.props.role, "dialog");
  assert.equal(/\bpl-peek\b/.test(tree.props.className), true, "the page's own overlay: PL_OVERLAY names it apart");
  assert.equal(textOf(byTestId(tree, "peek-name")), "Travis Heights Coaching Co.");
  assert.equal(textOf(byTestId(tree, "peek-sub")), "Personal trainer · Austin, TX");
  assert.equal(textOf(byTestId(tree, "peek-fit")), "Strong fit. Independent coaching · 5.0 from 16 reviews · email checked");
  const stage = byTestId(tree, "peek-stage");
  assert.equal(stage.props.role, "radiogroup");
  assert.deepEqual(all(stage, (n) => n.props?.role === "radio").map((n) => [textOf(n), n.props["aria-checked"]]), [["Ready", true], ["Contacted", false], ["Talking", false]]);
});

test("How you can reach them: the phone with its sources and Call, the email with its state in words and Copy and Draft, and texts and WhatsApp locked with the reason", async () => {
  reset();
  const { tree, acts } = page().draw();
  assert.equal(textOf(byTestId(tree, "peek-phone-value")), "+15125550142");
  assert.equal(textOf(find(byTestId(tree, "peek-phone"), (n) => n.props?.className === "pk-rn")), "The same number on Google Maps and their website");
  assert.ok(byTestId(tree, "peek-call"), "Call is on the phone row");
  assert.equal(textOf(byTestId(tree, "peek-email-value")), "hello@travisheightscoaching.example");
  assert.equal(textOf(byTestId(tree, "peek-email-word")), LEAD_EMAIL_WORDS.ok);
  assert.equal(byTestId(tree, "peek-copy").props["aria-label"], "Copy the email");
  assert.ok(byTestId(tree, "peek-draft"));
  assert.equal(textOf(byTestId(tree, "peek-locked-line")), LEAD_LOCKED_LINE);
  assert.equal(all(byTestId(tree, "peek-locked"), (n) => n.type === "button" || n.type === "a").length, 0, "nothing sends a text to a lead");
  await press(byTestId(tree, "peek-copy"));
  assert.deepEqual(copied, [`email ${LEAD}`]);
  assert.equal(typeof acts.onDraft, "function");
});

test("a catch-all email reads Unconfirmed, wears the dashed ring and says the search's own standard beside it", () => {
  reset();
  const { tree } = page({ vm: vmOf({ email_state: "catch_all" }) }).draw();
  assert.equal(textOf(byTestId(tree, "peek-email-word")), "Unconfirmed");
  assert.equal(textOf(byTestId(tree, "peek-email-note")), "Their server accepts every address, so the check can't tell");
  assert.equal(textOf(byTestId(tree, "peek-email-standard")), LEAD_CONTACT_STANDARD_WORDS.email);
  const shape = find(byTestId(tree, "peek-email"), (n) => /ld-shape-catch_all/.test(n.props?.className || ""));
  assert.ok(shape, "the dashed ring, not a check");
  assert.equal(all(byTestId(tree, "peek-email"), (n) => /ld-shape-ok/.test(n.props?.className || "")).length, 0);
});

test("the checks come in two groups -- what was seen and what Claude read -- each with where it came from, and nothing Claude read wears a plain check", () => {
  reset();
  const { tree } = page().draw();
  const seen = byTestId(tree, "peek-checks-seen");
  const read = byTestId(tree, "peek-checks-read");
  assert.equal(textOf(find(seen, (n) => n.props?.className === "pk-group-label")), LEAD_CHECK_GROUP_WORDS.seen);
  assert.equal(textOf(find(read, (n) => n.props?.className === "pk-group-label")), "Claude's read");
  assert.deepEqual(all(seen, (n) => /^pk-ck /.test(n.props?.className || "")).map((n) => textOf(find(n, (x) => x.props?.className === "pk-ck-t"))), [
    "Open for business",
    "In the area you asked for — Travis Heights, inside 20km of the center",
    "Phone matches on two sources",
    "Mailbox exists",
  ]);
  assert.deepEqual(all(read, (n) => /^pk-ck /.test(n.props?.className || "")).map((n) => textOf(find(n, (x) => x.props?.className === "from"))), ["Claude · the listing", "Claude · the listing", "Claude · website"]);
  assert.equal(all(read, (n) => /pk-ck-check/.test(n.props?.className || "")).length, 0, "nothing read wears a plain check mark (P2)");
  assert.equal(all(seen, (n) => /pk-ck-check/.test(n.props?.className || "")).length, 4, "what was seen does");
});

test("a criterion Claude could not tell says so, in its own group, and never a check", () => {
  reset();
  const unsure = CHECKS.map((c) => (c.key === "independent" ? { ...c, answer: "unknown", reason: "the listing does not say" } : c));
  const { tree } = page({ vm: vmOf({ member: { checks: unsure } }) }).draw();
  const ck = byTestId(tree, "peek-check-independent");
  assert.equal(textOf(find(ck, (n) => n.props?.className === "pk-ck-t")), `${LEAD_CHECK_UNSURE} — the listing does not say`);
  assert.equal(/\bwarn\b/.test(ck.props.className), true);
  assert.equal(all(ck, (n) => /pk-ck-check/.test(n.props?.className || "")).length, 0);
});

test("the other addresses are folded, with why Claude picked this one; Found is three lines; the site and Instagram are the foot", () => {
  reset();
  const { tree } = page().draw();
  const others = byTestId(tree, "peek-others");
  assert.equal(others.type, "details", "folded, not open");
  assert.equal(textOf(byTestId(tree, "peek-others-summary")), "2 other addresses on their site");
  assert.deepEqual(all(others, (n) => n.type === "li").map(textOf), ["careers@travisheightscoaching.example — for job seekers", "A coach's personal mailbox — not the business"]);
  assert.equal(textOf(byTestId(tree, "peek-others-why")), "on their own domain and answers bookings");
  assert.deepEqual(all(byTestId(tree, "peek-found"), (n) => n.props?.className === "pk-tr").map(textOf), [
    "2:14 PMOn Google Maps, searching “personal trainer”",
    "2:14 PMTheir website, travisheightscoaching.example: an email on the contact page",
    "2:16 PMMailbox check: Mailbox exists",
  ]);
  assert.equal(byTestId(tree, "peek-website").props.href, "https://travisheightscoaching.example");
  assert.equal(byTestId(tree, "peek-instagram").props.href, "https://instagram.example/travisheights");
});

test("a Needs review lead says so and offers Keep and Exclude; an Excluded one says it does not count and offers Put back", async () => {
  reset();
  const review = page({ vm: vmOf({ member: { class: "review", fit: null, reason: "Couldn't check the email" } }) });
  let tree = review.draw().tree;
  assert.equal(textOf(byTestId(tree, "peek-fit")), "Needs review. Couldn't check the email");
  await press(byTestId(tree, "peek-keep"));
  await press(byTestId(tree, "peek-exclude"));
  assert.deepEqual(flashes.map((f) => f.msg), [`keep ${LEAD}`, `exclude ${LEAD}`]);

  reset();
  const out = page({ vm: vmOf({ member: { class: "excluded", fit: null, excluded_by: "chain", reason: "Part of Crunch Fitness, a chain with many locations" } }) });
  tree = out.draw().tree;
  assert.equal(textOf(byTestId(tree, "peek-fit")), "Chain gyms. Part of Crunch Fitness, a chain with many locations", "the owner's own word for the criterion");
  assert.equal(byTestId(tree, "peek-stage"), null, "an excluded place has no stage");
  assert.equal(textOf(byTestId(tree, "peek-left-out")), "Left out of this search. It doesn't count.");
  await press(byTestId(tree, "peek-put-back"));
  assert.deepEqual(flashes.map((f) => f.msg), [`put back ${LEAD}`]);
});

test("an operator sees Not a fit, Keep, Exclude and Put back disabled with the gate's sentence, and pressing one does nothing", async () => {
  reset();
  globalThis.window.ST_STORE = { can: (a) => a !== "find", myRole: () => "operator" };
  const { tree } = page({ vm: vmOf({ member: { class: "review", fit: null, reason: "Couldn't check the email" } }) }).draw();
  for (const [id, doing] of [["peek-not-a-fit", "set this lead aside"], ["peek-keep", "keep this lead"], ["peek-exclude", "exclude this lead"]]) {
    const b = byTestId(tree, id);
    assert.equal(b.props["aria-disabled"], true, id);
    assert.equal(b.props["aria-description"], `Only an owner can ${doing}.`, id);
    assert.equal(b.props.disabled, false, `${id}: never disabled + title, which no keyboard reaches`);
  }
  await press(byTestId(tree, "peek-keep"));
  assert.deepEqual(flashes, [], "the gate replaced the handler");
});

test("a stage click goes through the one door and says what the door said, with Undo; it never converts", async () => {
  reset();
  const courier = courierOf({ stage: () => ({ ok: true, data: { stage: "converted", closed_reason: null, contact_id: null, existed: false, converted: false, op_id: "op-9", version: 5, toast: "Marked talking. They join People when they write or call in, or when a call goes well.", undo: { op_id: "op-9", version: 5 } } }) });
  const P = page({ courier });
  await press(byTestId(P.draw().tree, "peek-stage-converted"));
  await settle();
  assert.deepEqual(courier.seen[0], ["stage", LEAD, { kind: "stage", stage: "converted" }], "a click says Talking; it never says convert");
  assert.equal(flashes[0].msg, "Marked talking. They join People when they write or call in, or when a call goes well.");
  await flashes[0].undo();
  assert.deepEqual(courier.seen[1], ["undo", "op-9", 5]);
  assert.deepEqual(opened, [], "nobody was made a person");
});

test("Esc backs out one step: the question it asked, then the pane it opened, then the peek", () => {
  reset();
  const st = { mode: "draft", armed: { kind: "call", leadId: LEAD, asked: true }, peekId: LEAD };
  const arg = { mode: st.mode, armed: st.armed, setMode: (v) => { st.mode = v; }, setArmed: (v) => { st.armed = v; }, setPeekId: (v) => { st.peekId = v; } };
  assert.equal(globalThis.leadPeekEscape(arg), "armed");
  assert.equal(st.armed, null);
  assert.equal(globalThis.leadPeekEscape({ ...arg, armed: st.armed }), "mode");
  assert.equal(st.mode, "info");
  assert.equal(globalThis.leadPeekEscape({ ...arg, armed: null, mode: st.mode }), "peek");
  assert.equal(st.peekId, null);
  assert.deepEqual([globalThis.leadPeekFollows("info", null), globalThis.leadPeekFollows("draft", null), globalThis.leadPeekFollows("info", { kind: "call" })], [true, false, false], "a question or a draft holds the peek on its lead");
});

test("focus moves into the peek when it opens and back to the row when it closes, and the return watcher takes its listeners down", () => {
  reset();
  const focused = [];
  const el = (id) => ({ id, focus: () => focused.push(id) });
  globalThis.document.getElementById = (id) => el(id);
  globalThis.leadPeekFocus(LEAD, null);
  globalThis.leadPeekFocus(null, LEAD);
  assert.deepEqual(focused, ["lead-peek-close", `lead-${LEAD}`], "the row is the cursor's, by the table's own noun");
  globalThis.document.getElementById = undefined;

  const st = { armed: { kind: "call", leadId: LEAD, asked: false } };
  const stop = globalThis.leadArmOnReturn(st.armed, (v) => { st.armed = typeof v === "function" ? v(st.armed) : v; });
  assert.deepEqual([(listeners.focus || []).length, (listeners.visibilitychange || []).length], [1, 1]);
  globalThis.document.hidden = true;
  for (const fn of listeners.focus) fn();
  assert.equal(st.armed.asked, false, "nothing is asked while the tab is still hidden");
  globalThis.document.hidden = false;
  for (const fn of listeners.focus) fn();
  assert.equal(st.armed.asked, true);
  stop();
  assert.deepEqual([(listeners.focus || []).length, (listeners.visibilitychange || []).length], [0, 0], "no listener is left behind");
  assert.equal(globalThis.leadArmOnReturn(st.armed, () => {}), undefined, "an answered question arms nothing");
});

test("a refused act is the route's sentence, and nothing on the page pretends it happened", async () => {
  reset();
  const courier = courierOf({ stage: () => ({ ok: false, message: "This lead is gone.", code: "not_found", status: 404 }) });
  const P = page({ courier });
  await press(byTestId(P.draw().tree, "peek-stage-nurture"));
  await settle();
  assert.equal(flashes[0].tone, "danger");
  assert.equal(textOf(flashes[0].msg).includes("This lead is gone."), true);
});
