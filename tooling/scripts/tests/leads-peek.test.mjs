/**
 * The peek, and everything the owner does to one lead from it: the stage, Not a fit and its five whys, Keep and
 * Exclude, Put back, a call from their own phone with its six outcomes, and a draft for their own inbox.
 *
 * Drawn on the tests' stub React, as refusals-on-the-page does: the components are hookless, so a draw is a call and
 * the state is this file's, the way ClientsAReal holds it on the real page. Nothing is mocked that the owner reads:
 * the view model is contracts' own toLeadPeekVM and the words are contracts' LEAD_WORDS.
 */
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { roleGate } from "../../../packages/contracts/src/refusal.ts";
import { stateOf } from "../../../packages/contracts/src/tone.ts";
import {
  LEAD_WORDS,
  LEAD_EMAIL_WORDS,
  LEAD_LOCKED_LINE,
  LEAD_DRAFT_NOTE,
  LEAD_NO_ADDRESS,
  LEAD_NOT_A_FIT_WORDS,
  LEAD_CONTACT_STANDARD_WORDS,
  leadDraftFooter,
  toLeadPeekVM,
} from "../../../packages/contracts/src/leads.ts";
import { hookFrames } from "./_hook-frames.mjs";

let cells = [];
// Where each hook keeps its state: by the component that calls it, as React keeps it (_hook-frames.mjs).
const frames = hookFrames();
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
    if (typeof type === "function") node.rendered = frames.render(type, props);
    return node;
  },
  useState: (init) => {
    const k = frames.key();
    if (!(k in cells)) cells[k] = typeof init === "function" ? init() : init;
    return [
      cells[k],
      (v) => {
        cells[k] = typeof v === "function" ? v(cells[k]) : v;
      },
    ];
  },
  useRef: (init) => {
    const k = frames.key();
    if (!(k in cells)) cells[k] = { current: init };
    return cells[k];
  },
  useMemo: (fn) => fn(),
  useCallback: (fn) => fn,
  useEffect: (fn) => {
    const k = frames.key();
    if (!(k in cells)) {
      cells[k] = true;
      fn();
    }
  },
};
globalThis.ReactDOM = { createPortal: (node) => node };
const on = (bag) => (name, fn) => {
  (bag[name] = bag[name] || []).push(fn);
};
const off = (bag) => (name, fn) => {
  bag[name] = (bag[name] || []).filter((f) => f !== fn);
};
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
  navigator: {
    clipboard: {
      writeText: async (t) => {
        copied.push(t);
      },
    },
  },
  __roleGate: roleGate,
  // The one colour vocabulary, as the app publishes it: the verdict's pill takes its tone from here.
  __chrome: { state: stateOf },
};
await import("../../../apps/dashboard/src/legacy/components/icons.jsx");
await import("../../../apps/dashboard/src/legacy/components/data-bits.jsx");
globalThis.Icon = globalThis.window.Icon;
globalThis.StatePill = globalThis.window.StatePill;
// Call is the ways-of-calling menu, the house one, drawn for real: pressing it opens it.
globalThis.MoreMenu = globalThis.window.MoreMenu;
// The table's own helpers: `leads-scope.jsx` reads plSortKeys at module scope (LEAD_SORT_KEYS), so the file it was
// lifted from loads first here, as people-honest's harness loads it.
await import("../../../apps/dashboard/src/legacy/pages/people-table.jsx");
for (const k of [
  "PeopleTable",
  "PeopleColumnsMenu",
  "plLocked",
  "plShows",
  "plSortKeys",
  "plDrawnColumns",
  "plShownColumns",
  "plColumnChoices",
  "plColumnOptions",
  "PL_NO_SEL",
  "PL_FIRST_ROWS",
])
  globalThis[k] = globalThis.window[k];
await import("../../../apps/dashboard/src/legacy/pages/leads-scope.jsx"); // Task 2's: LeadShape is its, and this file draws it
await import("../../../apps/dashboard/src/legacy/pages/leads-peek.jsx");
for (const k of [
  "LeadPeek",
  "LeadCallMenu",
  "LeadShape",
  "LeadSlotShape",
  "LeadPeekActions",
  "LeadLightbox",
  "leadPeekEscape",
  "leadPeekFollows",
  "leadPeekFocus",
  "leadArmOnReturn",
])
  globalThis[k] = globalThis.window[k];
globalThis.window.__LEAD_WORDS = LEAD_WORDS;

/* ------------------------------------------------------------ the helpers */

const walk = (n, fn) => {
  if (n == null || typeof n !== "object") return;
  fn(n);
  for (const k of n.props?.children ?? []) walk(k, fn);
  if (n.rendered) walk(n.rendered, fn);
};
const all = (tree, pred) => {
  const out = [];
  walk(tree, (n) => {
    if (pred(n)) out.push(n);
  });
  return out;
};
const find = (tree, pred) => all(tree, pred)[0] ?? null;
const byTestId = (tree, id) => find(tree, (n) => n.props?.["data-testid"] === id);
const textOf = (n) => {
  if (n == null || typeof n === "boolean") return "";
  if (typeof n === "string" || typeof n === "number") return String(n);
  if (Array.isArray(n)) return n.map(textOf).join("");
  if (n.rendered !== undefined) return textOf(n.rendered);
  return (n.props?.children ?? []).map(textOf).join("");
};
const press = async (node) => {
  assert.ok(node, "no such control");
  await node.props.onClick({ preventDefault() {}, stopPropagation() {}, currentTarget: node });
};
// Call opens the ways of calling (LeadCallMenu, the house MoreMenu): a way is one of its items, pressed after the button.
const callWay = async (P, label) => {
  await press(byTestId(P.draw().tree, "peek-act-call"));
  const item = find(
    P.draw().tree,
    (n) =>
      String(n.props?.className || "")
        .split(" ")
        .includes("more-item") && textOf(n).includes(label),
  );
  await press(item);
};
const settle = async (n = 6) => {
  for (let i = 0; i < n; i += 1) await new Promise((r) => setTimeout(r, 0));
};

/* ----------------------------------------------------------- the fixtures */

const LEAD = "5e000000-0000-4000-8000-000000000111";
const SEARCH_ID = "5e000000-0000-4000-8000-000000000001";
const PLAN = {
  version: 1,
  card: "local_businesses",
  name: "Personal trainers · Austin",
  asked: "200 personal trainers in Austin with a website",
  terms: ["personal trainer"],
  area: {
    kind: "city",
    label: "Austin, TX",
    state: "TX",
    center: { lat: 30.26, lng: -97.74 },
    radius_m: 20000,
    query: "Austin, TX",
  },
  count: 200,
  contact: "email",
  criteria: [{ key: "independent", text: "independent", standard: "likely", required: true }],
  exclusions: [{ key: "chain", text: "Chain gyms", origin: "claude" }],
};
const SEARCH = {
  id: SEARCH_ID,
  name: "Personal trainers · Austin",
  asked: PLAN.asked,
  asked_on: "2026-09-18T14:00:00.000Z",
  plan: PLAN,
  plan_version: 1,
  round: {
    id: "r1",
    seq: 2,
    purpose: "main",
    state: "ended",
    ending: "target_reached",
    question: null,
    target: 200,
    counted: 160,
    qualified: 160,
    review: 12,
    excluded: 40,
    emails_checked: 88,
    with_phone: 72,
    ending_pending: false,
    waiting_since: null,
    cost_usd: 3.2,
    ended_at: "2026-09-18T14:40:00.000Z",
    undo_op_id: null,
    undo_version: null,
  },
};
const CHECKS = [
  { key: "on_maps", how: "seen", answer: "yes", source: "Google Maps", reason: null },
  {
    key: "in_area",
    how: "seen",
    answer: "yes",
    source: "Google Maps · the plan",
    reason: "Travis Heights, inside 20km of the center",
  },
  { key: "phone_two_sources", how: "seen", answer: "yes", source: "Maps · website", reason: null },
  { key: "mailbox", how: "seen", answer: "yes", source: "Mailbox check", reason: null },
  {
    key: "independent",
    how: "read",
    answer: "yes",
    source: "Claude · the listing",
    reason: "one address, no brand in the name",
  },
  {
    key: "right_kind",
    how: "read",
    answer: "yes",
    source: "Claude · the listing",
    reason: "listed as a personal trainer",
  },
  {
    key: "own_address",
    how: "read",
    answer: "yes",
    source: "Claude · website",
    reason: "on their own domain and answers bookings",
  },
];
const row = (over = {}) => ({
  id: LEAD,
  search_id: SEARCH_ID,
  place_id: "ChIJfixture0000000000000001",
  business_name: "Travis Heights Coaching Co.",
  category: "Personal trainer",
  city: "Austin",
  state: "TX",
  street: "1200 Barton Springs Rd",
  phone: "+15125550142",
  phone_agrees: true,
  phone_wrong: false,
  email: "hello@travisheightscoaching.example",
  email_state: "ok",
  email_checked_at: "2026-09-18T19:16:00.000Z",
  website: "travisheightscoaching.example",
  instagram: "https://instagram.example/travisheights",
  rating: 5,
  reviews: 16,
  stage: "ready",
  closed_reason: null,
  contact_id: null,
  last_outcome: null,
  last_note: null,
  contacted_at: null,
  converted_at: null,
  places: 1,
  found_at: "2026-09-18T19:14:00.000Z",
  exported_at: null,
  version: 3,
  ...over,
  member: {
    class: "qualified",
    fit: "strong",
    reason: "Independent coaching · 5.0 from 16 reviews · email checked",
    excluded_by: null,
    distance_m: 2400,
    counted: true,
    checks: CHECKS,
    other_emails: [
      { email: "careers@travisheightscoaching.example", why: "for job seekers" },
      { email: "A coach's personal mailbox", why: "not the business" },
    ],
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
    __leadStage: async (id, input) => {
      seen.push(["stage", id, input]);
      return over.stage
        ? over.stage(input)
        : {
            ok: true,
            data: {
              stage: "nurture",
              closed_reason: null,
              contact_id: null,
              existed: false,
              converted: false,
              op_id: "op-1",
              version: 4,
              toast: "Marked contacted.",
              undo: { op_id: "op-1", version: 4 },
            },
          };
    },
    __leadDraft: async (id, input) => {
      seen.push(["draft", id, input]);
      return over.draft
        ? over.draft(input)
        : {
            ok: true,
            data: {
              to: "hello@travisheightscoaching.example",
              subject: "Missed calls at Travis Heights",
              body: `Hi,\n\nI came across Travis Heights Coaching Co. on Google Maps.${leadDraftFooter("Marisa's Beauty Salon", "1 Main St, Austin, TX 78701")}`,
              mailto: "mailto:hello%40travisheightscoaching.example?subject=Missed%20calls",
            },
          };
    },
    __leadUndo: async (opId, version) => {
      seen.push(["undo", opId, version]);
      return over.undo ? over.undo() : { ok: true, data: {} };
    },
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
    copyPhone: (id) => copied.push(`phone ${id}`),
    expand: (id) => opened.push(`expand ${id}`),
    dial: (href) => dialled.push(href),
    setPeekId: (v) => {
      st.peekId = v;
    },
    setMode: (v) => {
      st.mode = v;
    },
    setArmed: (v) => {
      st.armed = typeof v === "function" ? v(st.armed) : v;
    },
    setDraft: (v) => {
      st.draft = typeof v === "function" ? v(st.draft) : v;
    },
    get armed() {
      return st.armed;
    },
    get draft() {
      return st.draft;
    },
    get mode() {
      return st.mode;
    },
  };
  const draw = () => {
    frames.begin();
    const acts = globalThis.LeadPeekActions(p);
    return { tree: globalThis.LeadPeek({ vm: p.vm, mode: st.mode, armed: st.armed, draft: st.draft, ...acts }), acts };
  };
  return { st, p, draw };
};

const reset = () => {
  cells = [];
  frames.begin();
  flashes.length = 0;
  opened.length = 0;
  dialled.length = 0;
  copied.length = 0;
  for (const k of Object.keys(listeners)) delete listeners[k];
  delete globalThis.window.ST_STORE;
};

/* ================================================== Task 12: the peek ==== */

test("the peek names the business, its sub-line, the fit as a sentence and the stage it is at", () => {
  reset();
  const { tree } = page().draw();
  assert.equal(tree.props.role, "dialog");
  assert.equal(/\bpl-peek\b/.test(tree.props.className), true, "the page's own overlay: PL_OVERLAY names it apart");
  assert.equal(textOf(byTestId(tree, "peek-name")), "Travis Heights Coaching Co.");
  assert.equal(textOf(byTestId(tree, "peek-sub")), "Personal trainer · Austin, TX");
  // D8: the fit's word heads the verdict beside the evidence bar, and the why is its own line under it. The word is
  // the pill its row wears (StatePill, one vocabulary), so Strong fit is the ok tone in the table and in the peek.
  assert.equal(textOf(byTestId(tree, "peek-fit-word")), "Strong fit");
  assert.equal(byTestId(tree, "peek-fit-word").props.className, "pill pill-ok pk-fit-word");
  assert.equal(
    find(byTestId(tree, "peek-verdict"), (n) => n.type === "b"),
    null,
    "REGRESSION: a bold word of its own, coloured by hand",
  );
  assert.equal(textOf(byTestId(tree, "peek-fit")), "Independent coaching · 5.0 from 16 reviews · email checked");
  const stage = byTestId(tree, "peek-stage");
  assert.equal(stage.props.role, "radiogroup");
  assert.deepEqual(
    all(stage, (n) => n.props?.role === "radio").map((n) => [textOf(n), n.props["aria-checked"]]),
    [
      ["Ready", true],
      ["Contacted", false],
      ["Talking", false],
    ],
  );
});

test("How you can reach them: the phone with its sources and its copy, the email with its state in words and Copy and Draft, and texts and WhatsApp locked with the reason", async () => {
  reset();
  const { tree, acts } = page().draw();
  // D8: each channel is one line -- its value, its mark, what to press -- and each note that was a sentence under the
  // line is what the mark says when pointed at, focused or tapped.
  const tipOf = (id) => textOf(find(byTestId(tree, id), (n) => n.props?.role === "tooltip"));
  assert.equal(
    textOf(byTestId(tree, "peek-phone-value")),
    "+1 (512) 555-0142",
    "a number reads as the app writes numbers everywhere else",
  );
  assert.equal(tipOf("peek-phone"), "The same number on Google Maps and their website.");
  assert.equal(
    byTestId(tree, "peek-phone-note").props["aria-describedby"],
    `${LEAD}-phone-note`,
    "a screen reader hears the note from the mark",
  );
  // The phone's line copies the number. Call is the act pinned at the foot, said once: it was on this line as well.
  assert.equal(byTestId(tree, "peek-call"), null, "no second Call on the line");
  assert.equal(textOf(byTestId(tree, "peek-act-call")).trim(), "Call +1 (512) 555-0142");
  const copyPhone = byTestId(tree, "peek-copy-phone");
  assert.deepEqual(
    [copyPhone.props["aria-label"], copyPhone.props["data-tip"]],
    ["Copy the number", "Copy the number"],
    "a quiet mark, heard and named on hover by the shared tip",
  );
  assert.equal(textOf(byTestId(tree, "peek-email-value")), "hello@travisheightscoaching.example");
  assert.equal(
    byTestId(tree, "peek-email-note").props["aria-label"],
    `Email: ${LEAD_EMAIL_WORDS.ok}`,
    "the state is the mark's name",
  );
  // A line's acts are quiet marks: icon buttons, named for a screen reader and on hover (data-tip).
  for (const [id, name] of [
    ["peek-copy", "Copy the email"],
    ["peek-draft", "Draft an email"],
    ["peek-copy-phone", "Copy the number"],
  ]) {
    const b = byTestId(tree, id);
    assert.deepEqual([b.props["aria-label"], b.props["data-tip"]], [name, name], id);
    assert.match(b.props.className, /\bbtn-ghost\b.*\bbtn-icon\b/, `${id} is a quiet mark, not a boxed word`);
    assert.equal(textOf(b), "", `${id} says its name on hover, not on the line`);
  }
  assert.equal(tipOf("peek-locked"), LEAD_LOCKED_LINE);
  assert.deepEqual(
    all(byTestId(tree, "peek-locked"), (n) => n.type === "button" || n.type === "a").map((n) => n.props.className),
    ["pk-hint-mark"],
    "nothing sends a text to a lead: its one button only says why",
  );
  // Copy is the email row's alone: the pinned bar said it a second time, for the same address.
  assert.equal(byTestId(tree, "peek-act-copy"), null);
  await press(byTestId(tree, "peek-copy"));
  await press(byTestId(tree, "peek-copy-phone"));
  assert.deepEqual(copied, [`email ${LEAD}`, `phone ${LEAD}`]);
  assert.equal(typeof acts.onDraft, "function");
});

test("a catch-all email is named Unconfirmed, wears the half ring the table wears, and its mark says the search's own standard", () => {
  reset();
  const { tree } = page({ vm: vmOf({ email_state: "catch_all" }) }).draw();
  const tipOf = (t) => textOf(find(byTestId(t, "peek-email"), (n) => n.props?.role === "tooltip"));
  assert.equal(byTestId(tree, "peek-email-note").props["aria-label"], "Email: Unconfirmed");
  // The state leads the tip where the note does not say it; the standard follows, as a sentence of its own.
  assert.equal(
    tipOf(tree),
    `Unconfirmed. Their server accepts every address, so the check can't tell. ${LEAD_CONTACT_STANDARD_WORDS.email}`,
  );
  const ok = page().draw().tree;
  assert.doesNotMatch(
    tipOf(ok),
    new RegExp(LEAD_CONTACT_STANDARD_WORDS.email),
    "beside an address that checks out the standard would be a sentence saying nothing",
  );
  assert.doesNotMatch(tipOf(ok), /^Checked\./, 'and "Checked." before "Mailbox exists" would say it twice');
  // The mark is the reach shape the row's column wears, so the table and the peek speak one language.
  assert.ok(
    find(byTestId(tree, "peek-email"), (n) => /\bld-slot-part\b/.test(n.props?.className || "")),
    "the half ring, not a check",
  );
  assert.equal(all(byTestId(tree, "peek-email"), (n) => /\bld-slot-ok\b/.test(n.props?.className || "")).length, 0);
});

test("the checks are what the verdict's evidence bar says: two groups, what was seen and what Claude read, each with where it came from, and nothing Claude read wears a plain check", () => {
  reset();
  const { tree } = page().draw();
  // D8: the checks were a fold of their own below the verdict. They are the bar's card now, on the verdict's line.
  const verdict = byTestId(tree, "peek-verdict");
  const bar = byTestId(verdict, "peek-check-bar");
  assert.equal(bar.type, "svg", "one svg with its own geometry, never sized spans (#734)");
  assert.equal(all(bar, (n) => n.type === "rect").length, CHECKS.length, "one segment a check");
  assert.equal(
    byTestId(verdict, "peek-checks-summary").props["aria-label"],
    "7 checks passed",
    "the bar's name is the checks' sentence",
  );
  const seen = byTestId(verdict, "peek-checks-seen");
  const read = byTestId(verdict, "peek-checks-read");
  assert.ok(seen && read, "the two groups, told apart by a hairline rather than a heading");
  assert.equal(
    find(verdict, (n) => n.props?.className === "pk-group-label"),
    null,
  );
  const card = find(verdict, (n) => n.props?.role === "tooltip");
  assert.equal(
    byTestId(verdict, "peek-checks-summary").props["aria-describedby"],
    card.props.id,
    "a screen reader hears the list from the bar",
  );
  assert.ok(find(card, (n) => n === seen) && find(card, (n) => n === read), "both groups are the bar's card");
  assert.deepEqual(
    all(seen, (n) => /^pk-ck /.test(n.props?.className || "")).map((n) =>
      textOf(find(n, (x) => x.props?.className === "pk-ck-t")),
    ),
    ["Open for business", "In the area you asked for", "Phone matches on two sources", "Mailbox exists"],
  );
  assert.deepEqual(
    all(read, (n) => /^pk-ck /.test(n.props?.className || "")).map((n) =>
      textOf(find(n, (x) => x.props?.className === "from")),
    ),
    ["Claude · the listing", "Claude · the listing", "Claude · website"],
  );
  assert.equal(
    all(read, (n) => /pk-ck-check/.test(n.props?.className || "")).length,
    0,
    "nothing read wears a plain check mark (P2)",
  );
  assert.equal(all(seen, (n) => /pk-ck-check/.test(n.props?.className || "")).length, 4, "what was seen does");
});

test("a criterion Claude could not tell says so, in its own group, and never a check", () => {
  reset();
  const unsure = CHECKS.map((c) =>
    c.key === "independent" ? { ...c, answer: "unknown", reason: "the listing does not say" } : c,
  );
  const { tree } = page({ vm: vmOf({ member: { checks: unsure } }) }).draw();
  const ck = byTestId(tree, "peek-check-independent");
  // D8: the card names what could not be told and leaves the why off: its source says where, and a card is a list
  // someone scans, not a paragraph.
  assert.equal(textOf(find(ck, (n) => n.props?.className === "pk-ck-t")), "Independent: couldn't tell");
  assert.equal(/\bwarn\b/.test(ck.props.className), true);
  assert.equal(all(ck, (n) => /pk-ck-check/.test(n.props?.className || "")).length, 0);
});

test("the other addresses are folded, with why Claude picked this one; Found is three lines; the site and Instagram are the foot", () => {
  reset();
  const { tree } = page().draw();
  const others = byTestId(tree, "peek-others");
  assert.equal(others.type, "details", "folded, not open");
  assert.equal(textOf(byTestId(tree, "peek-others-summary")), "2 other addresses on their site");
  assert.deepEqual(all(others, (n) => n.type === "li").map(textOf), [
    "careers@travisheightscoaching.example — for job seekers",
    "A coach's personal mailbox — not the business",
  ]);
  assert.equal(textOf(byTestId(tree, "peek-others-why")), "on their own domain and answers bookings");
  // D8: one short head, and three short steps with the minute each happened in its own hover. Four copies of the same
  // date and time said nothing the head had not; the mailbox's long sentence is the email row's to say.
  assert.equal(textOf(byTestId(tree, "peek-found-summary")), "On Google Maps · today");
  const steps = all(byTestId(tree, "peek-found"), (n) => n.props?.className === "pk-step");
  assert.deepEqual(steps.map(textOf), [
    "Google Maps · searching “personal trainer”",
    "travisheightscoaching.example · an email on the contact page",
    "Mailbox · Checked",
  ]);
  assert.deepEqual(
    steps.map((s) => s.props.title),
    ["2:14 PM", "2:14 PM", "2:16 PM"],
    "the minute is kept, where it is asked for",
  );
  assert.equal(byTestId(tree, "peek-website").props.href, "https://travisheightscoaching.example");
  assert.equal(byTestId(tree, "peek-instagram").props.href, "https://instagram.example/travisheights");
});

test("a Needs review lead says so and offers Keep and Exclude; an Excluded one says it does not count and offers Put back", async () => {
  reset();
  const review = page({ vm: vmOf({ member: { class: "review", fit: null, reason: "Couldn't check the email" } }) });
  let tree = review.draw().tree;
  assert.equal(textOf(byTestId(tree, "peek-fit-word")), "Needs review");
  assert.equal(textOf(byTestId(tree, "peek-fit")), "Couldn't check the email");
  await press(byTestId(tree, "peek-keep"));
  await press(byTestId(tree, "peek-exclude"));
  assert.deepEqual(
    flashes.map((f) => f.msg),
    [`keep ${LEAD}`, `exclude ${LEAD}`],
  );

  reset();
  const out = page({
    vm: vmOf({
      member: {
        class: "excluded",
        fit: null,
        excluded_by: "chain",
        reason: "Part of Crunch Fitness, a chain with many locations",
      },
    }),
  });
  tree = out.draw().tree;
  assert.equal(
    textOf(byTestId(tree, "peek-fit-word")),
    "Left out — Chain gyms",
    "what happened first, then the owner's own word for the criterion",
  );
  assert.equal(
    textOf(byTestId(tree, "peek-fit")),
    "Part of Crunch Fitness, a chain with many locations",
    "then the judge's reason, on its own line",
  );
  assert.equal(byTestId(tree, "peek-stage"), null, "an excluded place has no stage");
  assert.equal(textOf(byTestId(tree, "peek-left-out")), "Left out of this search. It doesn't count.");
  await press(byTestId(tree, "peek-put-back"));
  assert.deepEqual(
    flashes.map((f) => f.msg),
    [`put back ${LEAD}`],
  );
});

test("an operator sees Not a fit, Keep, Exclude and Put back disabled with the gate's sentence, and pressing one does nothing", async () => {
  reset();
  globalThis.window.ST_STORE = { can: (a) => a !== "find", myRole: () => "operator" };
  const { tree } = page({
    vm: vmOf({ member: { class: "review", fit: null, reason: "Couldn't check the email" } }),
  }).draw();
  for (const [id, doing] of [
    ["peek-not-a-fit", "set this lead aside"],
    ["peek-keep", "keep this lead"],
    ["peek-exclude", "exclude this lead"],
  ]) {
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
  const courier = courierOf({
    stage: () => ({
      ok: true,
      data: {
        stage: "converted",
        closed_reason: null,
        contact_id: null,
        existed: false,
        converted: false,
        op_id: "op-9",
        version: 5,
        toast: "Marked talking. They join People when they write or call in, or when a call goes well.",
        undo: { op_id: "op-9", version: 5 },
      },
    }),
  });
  const P = page({ courier });
  await press(byTestId(P.draw().tree, "peek-stage-converted"));
  await settle();
  assert.deepEqual(
    courier.seen[0],
    ["stage", LEAD, { kind: "stage", stage: "converted" }],
    "a click says Talking; it never says convert",
  );
  assert.equal(
    flashes[0].msg,
    "Marked talking. They join People when they write or call in, or when a call goes well.",
  );
  await flashes[0].undo();
  assert.deepEqual(courier.seen[1], ["undo", "op-9", 5]);
  assert.deepEqual(opened, [], "nobody was made a person");
});

test("Esc backs out one step: the question it asked, then the pane it opened, then the peek", () => {
  reset();
  const st = { mode: "draft", armed: { kind: "call", leadId: LEAD, asked: true }, peekId: LEAD };
  const arg = {
    mode: st.mode,
    armed: st.armed,
    setMode: (v) => {
      st.mode = v;
    },
    setArmed: (v) => {
      st.armed = v;
    },
    setPeekId: (v) => {
      st.peekId = v;
    },
  };
  assert.equal(globalThis.leadPeekEscape(arg), "armed");
  assert.equal(st.armed, null);
  assert.equal(globalThis.leadPeekEscape({ ...arg, armed: st.armed }), "mode");
  assert.equal(st.mode, "info");
  assert.equal(globalThis.leadPeekEscape({ ...arg, armed: null, mode: st.mode }), "peek");
  assert.equal(st.peekId, null);
  assert.deepEqual(
    [
      globalThis.leadPeekFollows("info", null),
      globalThis.leadPeekFollows("draft", null),
      globalThis.leadPeekFollows("info", { kind: "call" }),
    ],
    [true, false, false],
    "a question or a draft holds the peek on its lead",
  );
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
  const stop = globalThis.leadArmOnReturn(st.armed, (v) => {
    st.armed = typeof v === "function" ? v(st.armed) : v;
  });
  assert.deepEqual([(listeners.focus || []).length, (listeners.visibilitychange || []).length], [1, 1]);
  globalThis.document.hidden = true;
  for (const fn of listeners.focus) fn();
  assert.equal(st.armed.asked, false, "nothing is asked while the tab is still hidden");
  globalThis.document.hidden = false;
  for (const fn of listeners.focus) fn();
  assert.equal(st.armed.asked, true);
  stop();
  assert.deepEqual(
    [(listeners.focus || []).length, (listeners.visibilitychange || []).length],
    [0, 0],
    "no listener is left behind",
  );
  assert.equal(
    globalThis.leadArmOnReturn(st.armed, () => {}),
    undefined,
    "an answered question arms nothing",
  );
});

test("a refused act is the route's sentence, and nothing on the page pretends it happened", async () => {
  reset();
  const courier = courierOf({
    stage: () => ({ ok: false, message: "This lead is gone.", code: "not_found", status: 404 }),
  });
  const P = page({ courier });
  await press(byTestId(P.draw().tree, "peek-stage-nurture"));
  await settle();
  assert.equal(flashes[0].tone, "danger");
  assert.equal(textOf(flashes[0].msg).includes("This lead is gone."), true);
});

/* ================================================= Task 13: the draft ==== */

test("Draft asks the route once, shows what it wrote with the foot the law asks for, and never a field the page would have to encode", async () => {
  reset();
  const courier = courierOf();
  const P = page({ courier });
  await press(byTestId(P.draw().tree, "peek-draft"));
  await settle();
  const { tree } = P.draw();
  assert.deepEqual(courier.seen, [["draft", LEAD, { tone: "first" }]]);
  assert.equal(textOf(byTestId(tree, "peek-draft-to")), "hello@travisheightscoaching.example");
  assert.equal(textOf(byTestId(tree, "peek-draft-subject")), "Missed calls at Travis Heights");
  assert.equal(
    textOf(byTestId(tree, "peek-draft-body")).endsWith('Not interested? Reply "no thanks" and I won\'t write again.'),
    true,
  );
  assert.equal(textOf(byTestId(tree, "peek-draft-note")), LEAD_DRAFT_NOTE);
  assert.equal(
    all(tree, (n) => n.type === "input" || n.type === "textarea").length,
    0,
    "the mailto: is the route's; an edited body here would need encoding the page must not do",
  );
  assert.equal(
    byTestId(tree, "peek-open-mail").props.href,
    "mailto:hello%40travisheightscoaching.example?subject=Missed%20calls",
  );
  assert.equal(
    textOf(find(tree, (n) => n.props?.className === "pk-foot" && /Sent from your own inbox/.test(textOf(n)))).includes(
      "Sent from your own inbox",
    ),
    true,
  );
});

test("Shorter and Warmer send what is on screen back with the tone, and the answer replaces it", async () => {
  reset();
  const courier = courierOf({
    draft: (input) => ({
      ok: true,
      data: {
        to: "hello@travisheightscoaching.example",
        subject: input.tone === "shorter" ? "Quick one" : "Missed calls at Travis Heights",
        body: input.tone === "shorter" ? "Two lines only." : "Long.",
        mailto: "mailto:x",
      },
    }),
  });
  const P = page({ courier });
  await press(byTestId(P.draw().tree, "peek-draft"));
  await settle();
  await press(byTestId(P.draw().tree, "peek-tone-shorter"));
  await settle();
  assert.deepEqual(courier.seen[1], [
    "draft",
    LEAD,
    { tone: "shorter", previous: { subject: "Missed calls at Travis Heights", body: "Long." } },
  ]);
  assert.equal(textOf(byTestId(P.draw().tree, "peek-draft-subject")), "Quick one");
});

test("with no business address the draft asks for it in the route's words, and there is nothing to open", async () => {
  reset();
  const courier = courierOf({ draft: () => ({ ok: false, message: LEAD_NO_ADDRESS }) });
  const P = page({ courier });
  await press(byTestId(P.draw().tree, "peek-draft"));
  await settle();
  const { tree } = P.draw();
  assert.equal(textOf(byTestId(tree, "peek-draft-error")), LEAD_NO_ADDRESS);
  assert.equal(byTestId(tree, "peek-draft-error").props.role, "alert");
  assert.equal(byTestId(tree, "peek-open-mail").props["aria-disabled"], true);
});

test("a lead whose email bounces is offered Call instead: no Copy, no Draft, and the note says so", () => {
  reset();
  const { tree } = page({ vm: vmOf({ email_state: "invalid" }) }).draw();
  assert.equal(byTestId(tree, "peek-email-note").props["aria-label"], "Email: Bounces");
  assert.match(
    textOf(find(byTestId(tree, "peek-email"), (n) => n.props?.role === "tooltip")),
    /^Bounces\. That mailbox doesn't exist\. Call instead\./,
  );
  assert.ok(
    find(byTestId(tree, "peek-email"), (n) => /\bld-slot-bad\b/.test(n.props?.className || "")),
    "the struck ring the table wears for a bounce",
  );
  assert.equal(byTestId(tree, "peek-draft"), null);
  assert.equal(byTestId(tree, "peek-copy"), null);
  assert.ok(
    byTestId(tree, "peek-copy-phone") && byTestId(tree, "peek-act-call"),
    "the phone is what is left: its line and the Call at the foot",
  );
});

test("Did you send it? is asked when the tab comes back, not when the draft opened; Yes marks them contacted with Undo", async () => {
  reset();
  const courier = courierOf({
    stage: () => ({
      ok: true,
      data: {
        stage: "nurture",
        closed_reason: null,
        contact_id: null,
        existed: false,
        converted: false,
        op_id: "op-3",
        version: 6,
        toast: "Marked contacted.",
        undo: { op_id: "op-3", version: 6 },
      },
    }),
  });
  const P = page({ courier });
  await press(byTestId(P.draw().tree, "peek-draft"));
  await settle();
  assert.equal(P.st.armed, null, "Draft alone arms nothing");
  await press(byTestId(P.draw().tree, "peek-open-mail"));
  assert.deepEqual([P.st.armed.kind, P.st.armed.asked], ["sent", false]);
  P.draw();
  assert.equal(byTestId(P.draw().tree, "peek-sent-ask"), null, "nothing is asked while they are away");

  const stop = globalThis.leadArmOnReturn(P.st.armed, P.p.setArmed);
  for (const fn of listeners.focus || []) fn();
  assert.equal(P.st.armed.asked, true);
  stop();
  P.st.mode = "info";
  const { tree } = P.draw();
  assert.equal(textOf(find(byTestId(tree, "peek-sent-ask"), (n) => n.props?.className === "t")), "Did you send it?");
  await press(byTestId(tree, "peek-sent-yes"));
  await settle();
  assert.deepEqual(courier.seen.at(-1), ["stage", LEAD, { kind: "emailed" }]);
  assert.equal(flashes.at(-1).msg, "Marked contacted.");
  assert.equal(typeof flashes.at(-1).undo, "function");
  assert.equal(P.st.armed, null);
});

test("Copy copies the subject and the body and arms the same question", async () => {
  reset();
  const P = page();
  await press(byTestId(P.draw().tree, "peek-draft"));
  await settle();
  await press(byTestId(P.draw().tree, "peek-copy-draft"));
  await settle();
  assert.equal(copied[0].startsWith("Missed calls at Travis Heights\n\nHi,"), true);
  assert.equal(P.st.armed.kind, "sent");
  assert.equal(flashes.at(-1).msg, "Copied the email.");
});

/* ================================================= Task 14: the calls ==== */

test("Call dials tel: from the peek and asks how it went when the tab comes back; the six are one radiogroup and the note says its cap", async () => {
  reset();
  const P = page();
  // Call asks how first: pressing it opens the ways and rings nobody; "Call from your phone" rings.
  await press(byTestId(P.draw().tree, "peek-act-call"));
  assert.deepEqual(dialled, [], "REGRESSION: the panel's Call rang the business the moment it was pressed");
  const ways = all(P.draw().tree, (n) =>
    String(n.props?.className || "")
      .split(" ")
      .includes("more-item"),
  ).map((n) => textOf(n).trim());
  assert.deepEqual(
    ways,
    Object.values(globalThis.window.__LEAD_WORDS.callWays).map((w) => `${w.label}${w.meta || ""}`),
    "the three ways, and the button already says the number, so no heading repeats it",
  );
  await press(
    find(
      P.draw().tree,
      (n) =>
        String(n.props?.className || "")
          .split(" ")
          .includes("more-item") && textOf(n).includes(globalThis.window.__LEAD_WORDS.callWays.dial.label),
    ),
  );
  assert.deepEqual(dialled, ["tel:+15125550142"]);
  assert.deepEqual([P.st.armed.kind, P.st.armed.asked], ["call", false]);
  assert.equal(byTestId(P.draw().tree, "peek-call-ask"), null);
  const stop = globalThis.leadArmOnReturn(P.st.armed, P.p.setArmed);
  for (const fn of listeners.visibilitychange || []) fn();
  stop();
  const { tree } = P.draw();
  assert.equal(
    textOf(find(byTestId(tree, "peek-call-ask"), (n) => n.props?.className === "t")),
    "How did the call go?",
  );
  const chips = find(tree, (n) => n.props?.className === "pk-chips");
  assert.equal(chips.props.role, "radiogroup");
  assert.deepEqual(all(chips, (n) => n.props?.role === "radio").map(textOf), [
    "Interested",
    "Call back later",
    "Not interested",
    "Left a voicemail",
    "No answer",
    "Wrong number",
  ]);
  assert.equal(byTestId(tree, "peek-note").props.maxLength, 280);
  assert.equal(textOf(byTestId(tree, "peek-note-left")), "Up to 280 characters");
  assert.equal(byTestId(tree, "peek-call-save").props.disabled, true, "Save waits for an outcome");
});

test("Interested says they are in People now and offers to open them, with no Undo", async () => {
  reset();
  const courier = courierOf({
    stage: () => ({
      ok: true,
      data: {
        stage: "converted",
        closed_reason: null,
        contact_id: "c-77",
        existed: false,
        converted: true,
        op_id: "op-4",
        version: 7,
        toast: "Travis Heights Coaching Co. is in People now, with this call on their page.",
        undo: null,
      },
    }),
  });
  const P = page({ courier, armed: { kind: "call", leadId: LEAD, asked: true, outcome: null, note: "" } });
  await press(byTestId(P.draw().tree, "peek-outcome-interested"));
  byTestId(P.draw().tree, "peek-note").props.onChange({ target: { value: "Wants a call Tuesday" } });
  assert.equal(textOf(byTestId(P.draw().tree, "peek-note-left")), "260 left");
  await press(byTestId(P.draw().tree, "peek-call-save"));
  await settle();
  assert.deepEqual(courier.seen[0], [
    "stage",
    LEAD,
    { kind: "outcome", outcome: "interested", note: "Wants a call Tuesday" },
  ]);
  assert.equal(flashes[0].msg, "Travis Heights Coaching Co. is in People now, with this call on their page.");
  assert.equal(flashes[0].undo, undefined, "a person made is not undone from a toast");
  assert.equal(flashes[0].action.label, "Open");
  flashes[0].action.onClick();
  assert.deepEqual(opened, ["c-77"]);
});

test("the other five post what they say, each with Undo; a wrong number keeps the stage and strikes the phone", async () => {
  for (const [outcome, stage, toast] of [
    ["call_back", "nurture", "Marked contacted."],
    ["voicemail", "nurture", "Marked contacted."],
    ["no_answer", "nurture", "Marked contacted."],
    ["not_interested", "archived", "Marked as said no."],
    ["wrong_number", "ready", "That number is marked wrong."],
  ]) {
    reset();
    const courier = courierOf({
      stage: () => ({
        ok: true,
        data: {
          stage,
          closed_reason: stage === "archived" ? "said_no" : null,
          contact_id: null,
          existed: false,
          converted: false,
          op_id: "op-5",
          version: 8,
          toast,
          undo: { op_id: "op-5", version: 8 },
        },
      }),
    });
    const P = page({ courier, armed: { kind: "call", leadId: LEAD, asked: true, outcome: null, note: "" } });
    await press(byTestId(P.draw().tree, `peek-outcome-${outcome}`));
    await press(byTestId(P.draw().tree, "peek-call-save"));
    await settle();
    assert.deepEqual(courier.seen[0], ["stage", LEAD, { kind: "outcome", outcome }], outcome);
    assert.equal(flashes[0].msg, toast, outcome);
    assert.equal(typeof flashes[0].undo, "function", outcome);
    assert.deepEqual(opened, [], outcome);
  }
  reset();
  const { tree } = page({ vm: vmOf({ phone_wrong: true }) }).draw();
  assert.equal(/\bwrong\b/.test(byTestId(tree, "peek-phone-value").props.className), true);
  assert.equal(byTestId(tree, "peek-act-call"), null, "a number marked wrong is not dialled again");
  assert.equal(byTestId(tree, "peek-copy-phone"), null, "nor offered to be copied");
  assert.equal(
    textOf(find(byTestId(tree, "peek-phone"), (n) => n.props?.role === "tooltip")),
    "You marked this number wrong.",
    "the struck number says why when pointed at",
  );
});

test("I didn't call clears the question and posts nothing", async () => {
  reset();
  const courier = courierOf();
  const P = page({ courier, armed: { kind: "call", leadId: LEAD, asked: true, outcome: "voicemail", note: "" } });
  await press(byTestId(P.draw().tree, "peek-call-cancel"));
  assert.equal(P.st.armed, null);
  assert.deepEqual(courier.seen, []);
});

/* =============================================== Task 15: Not a fit ====== */

test("Not a fit asks why in five ways, and the list teaches nothing in this release", async () => {
  reset();
  const P = page();
  await press(byTestId(P.draw().tree, "peek-not-a-fit"));
  const { tree } = P.draw();
  const why = byTestId(tree, "peek-why");
  assert.equal(why.props.role, "menu");
  assert.equal(textOf(find(why, (n) => n.props?.className === "pop-h")), "What makes it not a fit?");
  assert.deepEqual(all(why, (n) => n.props?.role === "menuitem").map(textOf), [
    LEAD_NOT_A_FIT_WORDS.chain,
    LEAD_NOT_A_FIT_WORDS.wrong_kind,
    LEAD_NOT_A_FIT_WORDS.too_far,
    LEAD_NOT_A_FIT_WORDS.customer,
    LEAD_NOT_A_FIT_WORDS.other,
  ]);
  assert.equal(
    /learn|next searches|you said/i.test(textOf(why)),
    false,
    "the scoped learning and the you-said chips are release C",
  );
});

test("Already a customer hides the place and says so; the other four close the lead and say Not a fit; each has Undo", async () => {
  for (const [why, toast] of [
    ["customer", "Hidden from every future search."],
    ["chain", "Not a fit."],
    ["wrong_kind", "Not a fit."],
    ["too_far", "Not a fit."],
    ["other", "Not a fit."],
  ]) {
    reset();
    const courier = courierOf({
      stage: () => ({
        ok: true,
        data: {
          stage: "archived",
          closed_reason: why === "customer" ? "customer" : "not_a_fit",
          contact_id: null,
          existed: false,
          converted: false,
          op_id: "op-6",
          version: 9,
          toast,
          undo: { op_id: "op-6", version: 9 },
        },
      }),
    });
    const P = page({ courier });
    await press(byTestId(P.draw().tree, "peek-not-a-fit"));
    await press(byTestId(P.draw().tree, `peek-why-${why}`));
    await settle();
    assert.deepEqual(courier.seen[0], ["stage", LEAD, { kind: "not_a_fit", why }], why);
    assert.equal(flashes[0].msg, toast, why);
    await flashes[0].undo();
    assert.deepEqual(courier.seen[1], ["undo", "op-6", 9], why);
    assert.equal(P.st.mode, "info", "the why list closes behind the answer");
  }
});

test("no word the peek says names the vendor, or a dollar", () => {
  reset();
  const states = ["ok", "catch_all", "unknown", "invalid", "none", "checking"];
  for (const email_state of states) {
    for (const cls of ["qualified", "review", "excluded"]) {
      const vm = vmOf({
        email_state,
        member: {
          class: cls,
          fit: cls === "qualified" ? "strong" : null,
          excluded_by: cls === "excluded" ? "chain" : null,
        },
      });
      for (const mode of ["info", "why"]) {
        for (const armed of [
          null,
          { kind: "sent", leadId: LEAD, asked: true },
          { kind: "call", leadId: LEAD, asked: true, outcome: null, note: "" },
        ]) {
          const P = page({ vm, mode, armed });
          const said = textOf(P.draw().tree);
          assert.equal(
            /apify|compass|bounceverify|crawler|\$\d/i.test(said),
            false,
            `${email_state}/${cls}/${mode}: ${said.slice(0, 120)}`,
          );
        }
      }
    }
  }
});

// D2: who they are, from what the listing shows. Every line only when the listing said; a lead from before says nothing.
test("the peek shows who they are: the photo, their own words, where, open today, the unclaimed note, the socials and the Maps page", async () => {
  reset();
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((day) => ({
    day,
    hours: "9 AM to 6 PM",
  }));
  const shown = page({
    vm: vmOf({
      about: "Waterfront venue for weddings.",
      street: "101 Biscayne Blvd",
      city: "Miami",
      state: "FL",
      postal_code: "33132",
      hours: days,
      image_url: "https://lh3.example/p.jpg",
      claimed: false,
      facebook_url: "https://www.facebook.example/x",
      tiktok_url: "https://www.tiktok.example/@x",
      maps_url: "https://maps.example/?cid=1",
    }),
  });
  let tree = shown.draw().tree;
  assert.equal(byTestId(tree, "peek-photo").props.src, "https://lh3.example/p.jpg");
  assert.equal(byTestId(tree, "peek-photo").props.alt, "", "a photo says nothing a screen reader must repeat");
  assert.equal(textOf(byTestId(tree, "peek-about")), "Waterfront venue for weddings.");
  assert.equal(
    byTestId(tree, "peek-where").props.href,
    "https://maps.example/?cid=1",
    "the address opens the Maps page",
  );
  assert.equal(textOf(byTestId(tree, "peek-where")), "101 Biscayne Blvd, Miami, FL 33132");
  assert.equal(
    textOf(byTestId(tree, "peek-today")),
    "Open until 6 PM",
    "whether they are open now, which is what an owner about to call is asking",
  );
  assert.equal(textOf(byTestId(tree, "peek-claimed")), "Listing not claimed by the owner");
  assert.deepEqual(
    ["peek-facebook", "peek-linkedin", "peek-tiktok", "peek-maps"].map((id) => byTestId(tree, id)?.props.href ?? null),
    ["https://www.facebook.example/x", null, "https://www.tiktok.example/@x", "https://maps.example/?cid=1"],
  );

  reset();
  tree = page({ vm: vmOf({}) }).draw().tree;
  for (const id of ["peek-photo", "peek-about", "peek-today", "peek-claimed", "peek-facebook", "peek-maps"])
    assert.equal(byTestId(tree, id), null, `${id}: a lead from before D2 claims none of it`);
});

// D7: the week folds like everything else; it was computed for the peek and read only by the expanded photo. D8: in
// its short hours, and the listing's facts are not repeated here -- kind, rating and rank were each said above, and
// whether the listing is claimed rides the rating.
test("the peek's folds: the week behind one line in its short hours, and no second copy of what the listing said", () => {
  const days = [
    { day: "Sunday", hours: "Closed" },
    { day: "Monday", hours: "11 AM to 10 PM" },
    { day: "Tuesday", hours: "11 AM to 10 PM" },
    { day: "Wednesday", hours: "11 AM to 10 PM" },
    { day: "Thursday", hours: "11 AM to 10 PM" },
    { day: "Friday", hours: "11 AM to 11 PM" },
    { day: "Saturday", hours: "11 AM to 11 PM" },
  ];
  reset();
  const tree = page({
    vm: vmOf({ hours: days, price: "$$", rank: 3, claimed: false, maps_url: "https://maps.example/?cid=1" }),
  }).draw().tree;

  const week = byTestId(tree, "peek-week");
  assert.ok(week, "the week is in the peek, not only behind the photograph");
  assert.equal(week.props.open, undefined, "folded, like the checks and the trace");
  assert.equal(
    textOf(byTestId(tree, "peek-week-summary")),
    "Open 6 days · 11–10 most days",
    "one line says the shape of the week, in as few characters as say it",
  );
  const days7 = all(week, (n) => n.props?.["data-testid"] === "peek-day");
  assert.equal(days7.length, 7, "all seven rows are behind it, closed days included");
  assert.deepEqual(
    days7.map((d) => textOf(find(d, (n) => n.props?.className === "h"))),
    ["Closed", "11–10", "11–10", "11–10", "11–10", "11–11", "11–11"],
  );

  assert.equal(byTestId(tree, "peek-facts"), null, "every fact it held was said elsewhere on the panel");

  // Every fold is the same shape, including the one that never was: the other addresses had a bare summary with no
  // box and no chevron, so it read as a different kind of thing sitting among them.
  for (const id of ["peek-others", "peek-found", "peek-week"]) {
    const d = byTestId(tree, id);
    assert.match(d.props.className, /\bpk-box\b/, `${id} is the shared shape`);
    assert.ok(
      find(d, (n) => n.props?.className === "pk-box-line"),
      `${id} lays out in the span, not the summary`,
    );
  }

  // A listing that published no hours claims none, and the fold is not drawn at all.
  reset();
  const bare = page({ vm: vmOf({ hours: [] }) }).draw().tree;
  assert.equal(byTestId(bare, "peek-week"), null, "no hours, no fold");
});

// D6: each surface leads with what it draws best. A row's small square is the logo's size, so the mark is the row's
// face; the band is a storefront's size, so the photograph is the band and the mark rides it as a chip in its free
// corner (leads.css). With no photograph the chip sits in the middle of the tint. The layers are stacked rather than
// chosen: both are in the band, in paint order, and a mark that fails to load takes only its own chip away.
test("the peek's band: the photograph is the band, the mark rides it as a chip, and alone the chip sits in the tint", () => {
  // The copy we keep, on our own storage (00161): the site's own address never reaches the band.
  const MARK =
    "https://project.supabase.co/storage/v1/object/public/lead-marks/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png";
  const PHOTO = "https://lh3.example/p.jpg";
  const band = (over) => {
    reset();
    return byTestId(page({ vm: vmOf(over) }).draw().tree, "peek-photo-band");
  };
  const layers = (over) =>
    all(band(over), (n) => n.props?.["data-testid"] === "peek-photo" || n.props?.["data-testid"] === "peek-mark").map(
      (n) => n.props["data-testid"],
    );

  assert.deepEqual(
    layers({ image_url: PHOTO, mark_url: MARK }),
    ["peek-photo", "peek-mark"],
    "the mark is painted last, so its chip sits on the photograph",
  );
  const markOf = (over) => byTestId(band(over), "peek-mark");
  assert.match(markOf({ image_url: PHOTO, mark_url: MARK }).props.className, /\bon-photo\b/, "a chip in the corner");
  assert.doesNotMatch(
    markOf({ mark_url: MARK }).props.className,
    /\bon-photo\b/,
    "with no photograph, the chip in the middle of the tint",
  );
  assert.equal(markOf({ mark_url: MARK }).props.loading, undefined, "asked for as the peek opens, as the photo is");
  assert.deepEqual(
    layers({ mark_url: MARK }),
    ["peek-mark"],
    "a business with a mark and no photograph still shows who it is",
  );
  assert.deepEqual(
    layers({ image_url: PHOTO }),
    ["peek-photo"],
    "and one with only a photograph shows which shop it is",
  );
  assert.deepEqual(layers({}), [], "with neither, nothing is drawn over the tint");

  const withMark = band({ image_url: PHOTO, mark_url: MARK });
  assert.equal(byTestId(withMark, "peek-mark").props.src, MARK);
  assert.equal(byTestId(withMark, "peek-mark").props.alt, "", "a mark says nothing a screen reader must repeat");
  assert.equal(byTestId(withMark, "peek-photo").props.src, PHOTO, "the photograph is still there under it, for Expand");
  // The band carries its tint and nothing else. It used to carry `has-img` too, from before the mark painted over
  // the photograph: the rule that read it went with that change, and a class nothing reads gets read wrongly later.
  for (const over of [{ image_url: PHOTO, mark_url: MARK }, { mark_url: MARK }, { image_url: PHOTO }, {}]) {
    assert.doesNotMatch(band(over).props.className, /\bhas-img\b/, JSON.stringify(over));
    assert.match(band(over).props.className, /\bpk-band tint-\d\b/, "the tint is the ground under every layer");
  }
  // The initials are always drawn, under everything: they are what a layer that fails to load falls back onto.
  const initials = (over) => find(band(over), (n) => n.props?.className === "pk-band-initials");
  assert.ok(initials({ image_url: PHOTO, mark_url: MARK }), "the initials wait under both layers");
  assert.ok(initials({}), "and carry the band alone when there is neither");
});

// A tip must be seen whole. On production (21 Sep, a 720px window) the peek's scrolling body was 200px tall, and a
// tip placed under its line INSIDE that body was cut at its edge: the evidence card lost 18px, the email's note 41.
// A tip is the peek's now, placed as it is asked for. The CSS half (nothing positioned between the tip and the peek,
// the show rule's gates) is verified against the real stylesheet over production; the page's half is pinned here.
test("a hint's tip is placed against the peek as it is asked for, flips above its line when the room is there, and never shows over a moving body", () => {
  reset();
  const tree = page().draw().tree;
  const place = globalThis.window.pkPlaceTip;
  const scrolling = globalThis.window.pkScrolling;
  const hints = all(tree, (n) => n.props?.className === "pk-hint");
  assert.equal(hints.length, 4, "the evidence bar, the phone's note, the email's note, and why texts are locked");
  for (const h of hints) {
    assert.equal(h.props.onMouseEnter, place, "asks where it is as the pointer arrives");
    assert.equal(h.props.onFocus, place, "and as focus arrives, so a keyboard and a tap get the same placement");
  }
  assert.equal(byTestId(tree, "peek-body").props.onScroll, scrolling, "the body says when it is moving");

  // The arithmetic, on elements that answer as a browser's would, with production's numbers: the peek's padding box
  // runs 52..720 (a 1px border on its left), its body 457..657, and every line spans 891..1252.
  const tipOf = ({ checks = 0, text = "" }) => ({
    style: {},
    textContent: text,
    querySelectorAll: (s) => (s === ".pk-ck" ? { length: checks } : []),
  });
  const hintAt = ({ top, bottom }, tip) => {
    const classes = new Set();
    const line = { getBoundingClientRect: () => ({ top, bottom, left: 891, right: 1252 }) };
    const peek = {
      getBoundingClientRect: () => ({ top: 52, bottom: 720, left: 872, right: 1280 }),
      clientTop: 0,
      clientLeft: 1,
      clientHeight: 668,
      clientWidth: 407,
    };
    const body = { getBoundingClientRect: () => ({ top: 457, bottom: 657 }) };
    const at = { ".pk-rr, .pk-verdict": line, ".pk": peek, ".pk-body": body };
    return {
      closest: (s) => at[s] ?? null,
      querySelector: (s) => (s === ":scope > .pk-hint-tip" ? tip : null),
      classList: { toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)), has: (c) => classes.has(c) },
    };
  };
  const placed = (line, what) => {
    const tip = tipOf(what);
    const h = hintAt(line, tip);
    place({ currentTarget: h });
    return { ...tip.style, away: h.classList.has("pk-away") };
  };

  // The verdict at the top of the body, four checks: 132px wanted, 174 below. It hangs under its line, as wide as it,
  // and outside the body -- which is what the body could not cut off.
  assert.deepEqual(placed({ top: 474, bottom: 546 }, { checks: 4 }), {
    left: "18px",
    right: "28px",
    top: "496px",
    bottom: "auto",
    away: false,
  });
  // The email's note on a line near the foot: three lines of words want 72px and there are 40, so it hangs above.
  const note =
    "Unconfirmed. Their server accepts every address, so the check can't tell. This search counts a phone as enough.";
  assert.deepEqual(placed({ top: 640, bottom: 680 }, { text: note }), {
    left: "18px",
    right: "28px",
    top: "auto",
    bottom: "82px",
    away: false,
  });
  // Seven checks want 204px: 88 below is not room, so the card opens upward from a verdict scrolled low.
  assert.equal(placed({ top: 560, bottom: 632 }, { checks: 7 }).top, "auto");
  assert.equal(placed({ top: 560, bottom: 632 }, { checks: 2 }).bottom, "auto", "while two checks fit below");
  // A line scrolled out of the body's view, above it or under the act bar, keeps its tip hidden.
  assert.equal(placed({ top: 420, bottom: 450 }, { text: "x" }).away, true);
  assert.equal(placed({ top: 657, bottom: 697 }, { text: "x" }).away, true);
  assert.equal(placed({ top: 600, bottom: 640 }, { text: "x" }).away, false);
  // Anything that cannot be measured is left alone.
  place({ currentTarget: {} });
  place({
    currentTarget: {
      closest: () => null,
      querySelector: () => null,
      classList: {
        toggle: () => {
          throw new Error("no peek, no change");
        },
      },
    },
  });
  place(null);

  // A moving body shows no tip; once it has been still for a moment, a tip still asked for is placed where its line
  // is now, and one that is not is left alone.
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const attrs = {};
    const asked = hintAt({ top: 474, bottom: 546 }, tipOf({ checks: 4 }));
    const idle = hintAt({ top: 600, bottom: 640 }, tipOf({ text: "x" }));
    asked.matches = (s) => s === ":hover, :focus-within";
    idle.matches = () => false;
    let againAsked = 0;
    const body = {
      setAttribute: (k, v) => {
        attrs[k] = v;
      },
      removeAttribute: (k) => {
        delete attrs[k];
      },
      querySelectorAll: (s) => (s === ".pk-hint" ? [asked, idle] : []),
    };
    const q = asked.querySelector;
    asked.querySelector = (s) => {
      againAsked += 1;
      return q(s);
    };
    scrolling({ currentTarget: body });
    assert.equal(attrs["data-scrolling"], "1", "moving: the tips hide");
    mock.timers.tick(100);
    scrolling({ currentTarget: body });
    mock.timers.tick(100);
    assert.equal(attrs["data-scrolling"], "1", "each scroll starts the stillness over");
    assert.equal(againAsked, 0);
    mock.timers.tick(100);
    assert.equal(attrs["data-scrolling"], undefined, "still again: they may show");
    assert.equal(againAsked, 1, "and the one still asked for is placed again");
  } finally {
    mock.timers.reset();
  }
  scrolling(null);
  scrolling({ currentTarget: {} });
});

/* ======================================================= D5: the peek re-cut ==== */

test("D5: the peek opens on a photo band with Expand, says what people say under the name, decides with the verdict and its evidence bar, and pins the act", async () => {
  reset();
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((day) => ({
    day,
    hours: day === "Sunday" ? "Closed" : "9 AM to 6 PM",
  }));
  const shown = page({
    vm: vmOf({
      about: "Coaching only.",
      street: "1200 Barton Springs Rd",
      city: "Austin",
      state: "TX",
      postal_code: "78704",
      hours: days,
      image_url: "https://lh3.example/p.jpg",
      claimed: false,
      price: "$$",
      rank: 3,
      reviews_dist: { one: 0, two: 1, three: 1, four: 4, five: 10 },
      maps_url: "https://maps.example/?cid=1",
    }),
  });
  const { tree, acts } = shown.draw();
  const band = byTestId(tree, "peek-photo-band");
  assert.ok(band, "the head is a photo band");
  assert.equal(byTestId(band, "peek-photo").props.src, "https://lh3.example/p.jpg");
  assert.equal(
    byTestId(band, "peek-close").props.id,
    "lead-peek-close",
    "Close keeps its id: focus lands on it when the peek opens",
  );
  await press(byTestId(band, "peek-expand"));
  assert.deepEqual(opened, [`expand ${LEAD}`], "Expand hands the lead to the page's lightbox");
  const identity = byTestId(tree, "peek-identity");
  assert.equal(textOf(byTestId(identity, "peek-name")), "Travis Heights Coaching Co.");
  assert.equal(
    textOf(byTestId(identity, "peek-today")),
    "Open until 6 PM",
    "whether they are open now sits on the sub-line",
  );
  assert.equal(textOf(byTestId(identity, "peek-distance")), "1.5 mi");
  assert.equal(textOf(byTestId(identity, "peek-about")), "Coaching only.");
  // D8: what people say is a line under the name, not a card with a heading for one number. This lead's unhappy share
  // is 2 of 16, under the floor, so nothing is said about it.
  const rated = byTestId(identity, "peek-rated");
  assert.equal(textOf(rated), "5.016 reviewsListing not claimed by the owner");
  assert.equal(byTestId(rated, "peek-rated-low"), null, "an ordinary tail of unhappy reviews is not worth a line");
  assert.equal(
    textOf(byTestId(rated, "peek-claimed")),
    "Listing not claimed by the owner",
    "whether anyone watches the listing rides the rating",
  );
  // The verdict: the word, the evidence as a pipeline beside it, and one line of why.
  const verdict = byTestId(tree, "peek-verdict");
  assert.equal(textOf(byTestId(verdict, "peek-fit-word")), "Strong fit");
  assert.equal(textOf(byTestId(verdict, "peek-fit")), "Independent coaching · 5.0 from 16 reviews · email checked");
  assert.equal(
    byTestId(tree, "peek-checks"),
    null,
    "the checks are no longer a fold the act at the foot must be scrolled past",
  );
  // The bar is ONE svg with its size in its own attributes, not a row of empty spans that take theirs from the
  // cascade: on production those drew at two sizes on one line (#734), and a rect in a viewBox cannot.
  const bar = byTestId(verdict, "peek-check-bar");
  assert.equal(bar.type, "svg", "the bar carries its own geometry");
  const segs = all(bar, (n) => n.type === "rect");
  assert.equal(segs.length, 7, "one segment a check, in the order they were made");
  assert.deepEqual(
    segs.map((s) => s.props.className),
    Array(7).fill("pk-seg yes"),
    "and each says which answer it is",
  );
  // One length whatever the count, so two leads compare at a glance by how much of it is filled: seven segments
  // and six 3px gaps make 120 exactly, each segment the same size, and each fills in turn as the peek opens.
  assert.equal(bar.props.width, 120, "the gauge is one length");
  assert.deepEqual(
    [...new Set(segs.map((s) => `${s.props.width.toFixed(3)}x${s.props.height}`))],
    [`${(102 / 7).toFixed(3)}x4`],
    "every segment is the same size",
  );
  assert.ok(
    Math.abs(segs.at(-1).props.x + segs.at(-1).props.width - 120) < 1e-9,
    "the last segment ends where the gauge does",
  );
  assert.deepEqual(
    segs.map((s) => s.props.style.animationDelay),
    ["0ms", "70ms", "140ms", "210ms", "280ms", "350ms", "420ms"],
    "a pipeline running once, in order",
  );
  const four = byTestId(page({ vm: vmOf({ member: { checks: CHECKS.slice(0, 4) } }) }).draw().tree, "peek-check-bar");
  assert.equal(four.props.width, 120, "four checks draw the same length as seven");
  assert.equal(
    bar.props["aria-hidden"],
    "true",
    "the bar is named by the button it sits in, not read out rect by rect",
  );
  assert.equal(
    byTestId(verdict, "peek-checks-summary").type,
    "button",
    "and that button is a stop for a keyboard and a tap for a finger",
  );
  assert.equal(
    textOf(byTestId(tree, "peek-found-summary")),
    "#3 on Google Maps · today",
    "the trace folds under one short line",
  );
  const act = byTestId(tree, "peek-act");
  assert.equal(
    tree.props.children.at(-1).rendered.props.children.at(-1),
    act,
    "the act bar is the peek's last child: it never scrolls away",
  );
  assert.equal(textOf(byTestId(act, "peek-act-call")).trim(), "Call +1 (512) 555-0142");
  await callWay(shown, globalThis.window.__LEAD_WORDS.callWays.dial.label);
  assert.deepEqual(
    dialled,
    ["tel:+15125550142"],
    "the act bar's Call is the phone row's, and dials the number as stored",
  );
  assert.equal(byTestId(act, "peek-act-copy"), null, "one press in the bar: Copy is the email row's");
  // No number: the draft is the act. No rating: no rated card, and the unclaimed note stays with the identity.
  const bare = page({ vm: vmOf({ phone: null, rating: null, reviews: null, claimed: false }) }).draw().tree;
  assert.ok(byTestId(bare, "peek-act-draft"), "with no number the draft is the act");
  assert.equal(byTestId(bare, "peek-rated"), null);
  assert.equal(textOf(byTestId(byTestId(bare, "peek-identity"), "peek-claimed")), "Listing not claimed by the owner");
  void acts;
});

test("D5: the photo expanded is a dialog of its own -- the photo or the tile, where it sits, the week's hours as bars with today marked, the listing's facts, Open in Maps -- and Esc closes it before anything else", () => {
  reset();
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((day) => ({
    day,
    hours: day === "Sunday" ? "Closed" : "9 AM to 6 PM",
  }));
  const vm = vmOf({
    street: "1200 Barton Springs Rd",
    city: "Austin",
    state: "TX",
    postal_code: "78704",
    hours: days,
    image_url: "https://lh3.example/p.jpg",
    claimed: true,
    price: "$$",
    rank: 3,
    maps_url: "https://maps.example/?cid=1",
    places: 2,
  });
  const closed = [];
  const tree = globalThis.LeadLightbox({ vm, onClose: () => closed.push(1) });
  const box = byTestId(tree, "lead-lightbox");
  assert.equal(box.props.role, "dialog");
  assert.equal(
    /\bpl-peek\b/.test(box.props.className),
    true,
    "the page's own overlay, so Esc reaches the page's listener",
  );
  assert.equal(find(byTestId(box, "lightbox-photo"), (n) => n.type === "img").props.src, "https://lh3.example/p.jpg");
  assert.equal(
    textOf(byTestId(box, "lightbox-where")),
    "Where it sits1200 Barton Springs Rd, Austin, TX 787041.5 mi from the search's centre",
  );
  const week = all(byTestId(box, "lightbox-week"), (n) => n.props?.["data-testid"] === "lightbox-day");
  assert.equal(week.length, 7);
  assert.deepEqual(
    week.map((d) => /\btoday\b/.test(d.props.className)),
    [false, false, false, false, true, false, false],
    "NOW is a Friday in America/Chicago",
  );
  assert.equal(
    find(week[6], (n) => n.props?.className === "ld-lb-bar"),
    null,
    "Sunday: closed, no bar",
  );
  assert.deepEqual(
    find(week[0], (n) => n.props?.className === "ld-lb-bar").props.style,
    { left: "37.5%", width: "37.5%" },
    "9 AM to 6 PM as a bar across the day",
  );
  assert.deepEqual(all(byTestId(box, "lightbox-facts"), (n) => n.props?.className === "ld-lb-fact").map(textOf), [
    "KindPersonal trainer",
    "Price$$",
    "Rated5.0 from 16 reviews",
    "ListingClaimed by the owner",
    "Found at#3 for “personal trainer”",
    "Other listings2 listings for this business",
  ]);
  assert.equal(byTestId(box, "lightbox-maps").props.href, "https://maps.example/?cid=1");
  byTestId(box, "lightbox-close").props.onClick();
  assert.deepEqual(closed, [1]);
  // A lead with no photo draws the tile, and says so.
  const noPhoto = globalThis.LeadLightbox({ vm: vmOf({ hours: [] }), onClose: () => {} });
  assert.match(textOf(byTestId(noPhoto, "lightbox-photo")), /No photo on the listing/);
  assert.equal(byTestId(noPhoto, "lightbox-week"), null, "no hours, no block");
  // Esc: the lightbox first.
  const steps = [];
  const out = globalThis.leadPeekEscape({
    mode: "why",
    armed: { asked: true },
    setMode: () => steps.push("mode"),
    setArmed: () => steps.push("armed"),
    setPeekId: () => steps.push("peek"),
    lightbox: LEAD,
    setLightbox: (v) => steps.push(`lightbox:${v}`),
  });
  assert.deepEqual([out, steps], ["lightbox", ["lightbox:null"]]);
});

test("D5, on a phone: one lead at a time — where it sits in the pile, the two ways through it, a swipe, and Save and go to the next", async () => {
  reset();
  const moved = [];
  const deck = { at: 3, of: 19, onPrev: () => moved.push("prev"), onNext: () => moved.push("next") };
  const P = page();
  const acts = globalThis.LeadPeekActions(P.p);
  const withDeck = (over = {}) => {
    frames.begin();
    return globalThis.LeadPeek({ vm: P.p.vm, mode: "info", armed: null, draft: null, deck, ...acts, ...over });
  };
  let tree = withDeck();
  assert.equal(textOf(byTestId(tree, "peek-deck-at")), "3 of 19", "where this lead sits in the pile");
  byTestId(tree, "peek-deck-next").props.onClick();
  byTestId(tree, "peek-deck-prev").props.onClick();
  assert.deepEqual(moved, ["next", "prev"], "the two ways through it");
  assert.equal(
    byTestId(withDeck({ deck: { ...deck, at: 1 } }), "peek-deck-prev").props.disabled,
    true,
    "nowhere to go back to",
  );

  // A swipe is the same two presses under a thumb: 80px across, and a scroll is never a move.
  const el = { dataset: {} };
  const swipe = (dx, dy, target = null) => {
    tree.props.onTouchStart({ touches: [{ clientX: 300, clientY: 200 }], currentTarget: el, target });
    tree.props.onTouchEnd({ changedTouches: [{ clientX: 300 + dx, clientY: 200 + dy }], currentTarget: el });
  };
  swipe(-120, 6);
  assert.equal(moved.at(-1), "next", "a swipe left is the next lead");
  swipe(140, -4);
  assert.equal(moved.at(-1), "prev", "a swipe right is the one before");
  const before = moved.length;
  swipe(-40, 10);
  swipe(-120, 300);
  assert.equal(moved.length, before, "a short drag and a scroll move nothing");

  // On a phone the peek is the whole screen: a pull down from the top of what it shows is its Close, as the X is;
  // a pull through a scrolled body is a scroll, and beside a desktop's table nothing is pulled.
  const closed = [];
  tree = withDeck({ phone: true, onClose: () => closed.push(1) });
  swipe(6, 120);
  assert.deepEqual(closed, [1], "REGRESSION: the X in the corner was the only way out of a full screen");
  swipe(6, 120, { scrollHeight: 900, clientHeight: 300, scrollTop: 140, parentElement: null });
  assert.deepEqual(closed, [1], "through a scrolled body it is a scroll");
  swipe(-120, 6);
  assert.equal(moved.at(-1), "next", "and the pile still walks");
  tree = withDeck({ phone: false, onClose: () => closed.push(1) });
  swipe(6, 120);
  assert.deepEqual(closed, [1], "beside the table, nothing is pulled");
  tree = withDeck();

  // Back from the call: the six outcomes wear their dots, the sheet says what saving does, and one press saves and moves on.
  const armed = { kind: "call", leadId: LEAD, asked: true, outcome: "interested", note: "" };
  const sheet = byTestId(withDeck({ armed }), "peek-call-ask");
  assert.ok(
    find(byTestId(sheet, "peek-outcome-interested"), (n) => n.props?.className === "dot"),
    "each outcome wears its dot, beside its word",
  );
  assert.match(textOf(sheet), /Saving moves them to Talking/);
  await press(byTestId(sheet, "peek-call-save-next"));
  assert.equal(moved.at(-1), "next", "saved, and on to the next");
  assert.equal(
    byTestId(withDeck({ armed, deck: { ...deck, at: 19 } }), "peek-call-save-next"),
    null,
    "on the last of the pile there is nowhere to go next",
  );

  // A desktop has no deck at all: no place line, no swipe.
  frames.begin();
  const desk = globalThis.LeadPeek({ vm: P.p.vm, mode: "info", armed: null, draft: null, ...acts });
  assert.equal(byTestId(desk, "peek-deck"), null);
  assert.equal(desk.props.onTouchStart, undefined);
});

test("one lead on one screen: the pile rides on the photo, Expand keeps its name without its words, and the map is said once", () => {
  reset();
  const deck = { at: 3, of: 19, onPrev() {}, onNext() {} };
  const P = page({ vm: vmOf({ maps_url: "https://maps.example/?cid=1" }) });
  const acts = globalThis.LeadPeekActions(P.p);
  frames.begin();
  const tree = globalThis.LeadPeek({ vm: P.p.vm, mode: "info", armed: null, draft: null, deck, phone: true, ...acts });
  const band = byTestId(tree, "peek-photo-band");
  assert.ok(byTestId(band, "peek-deck"), "REGRESSION: the pile's row of its own under the photo, 57px of a phone");
  const expand = byTestId(tree, "peek-expand");
  assert.equal(
    expand.props["aria-label"],
    globalThis.window.__LEAD_WORDS.expand,
    "named, where a phone draws its mark alone",
  );
  assert.ok(
    find(expand, (n) => n.props?.className === "pk-band-expand-words"),
    "its words in a span a phone can set aside",
  );
  const maps = byTestId(tree, "peek-maps");
  assert.ok(maps, "a lead with a map has its link");
  assert.equal(maps.props["data-said"], "address", "the address is already the link to the map");
  frames.begin();
  const noAddressLink = globalThis.LeadPeek({
    vm: vmOf({ maps_url: null }),
    mode: "info",
    armed: null,
    draft: null,
    ...acts,
  });
  const plain = byTestId(noAddressLink, "peek-maps");
  if (plain)
    assert.equal(plain.props["data-said"], undefined, "with no address to press, the map link is the only way there");
});

test("the band's photo is there as the peek opens: the row's tile under it at once, its own size eager and first in line, each lead's its own", () => {
  reset();
  const P = page({ vm: vmOf({ image_url: "https://lh3.googleusercontent.com/p/AF1QipM=w408-h268-k-no" }) });
  const acts = globalThis.LeadPeekActions(P.p);
  frames.begin();
  const tree = globalThis.LeadPeek({ vm: P.p.vm, mode: "info", armed: null, draft: null, ...acts });
  const band = byTestId(tree, "peek-photo-band");
  const photo = byTestId(band, "peek-photo");
  assert.equal(
    photo.props.src,
    "https://lh3.googleusercontent.com/p/AF1QipM=w408-h268-k-no",
    "the listing's own photograph",
  );
  assert.equal(photo.props.loading, "eager", "REGRESSION: lazy, asked for at 1000ms after the peek drew at 37ms");
  assert.equal(photo.props.fetchPriority, "high");
  assert.equal(
    photo.props.key,
    photo.props.src,
    "each lead's photo its own element: never the last lead's under a new name",
  );
  const thumb = find(band, (n) => n.props?.className === "pk-band-thumb");
  assert.equal(
    thumb.props.src,
    "https://lh3.googleusercontent.com/p/AF1QipM=s96-c",
    "the row's own tile, in the browser already",
  );
  const fades = [];
  photo.props.onLoad({ currentTarget: { classList: { add: (c) => fades.push(c) } } });
  assert.deepEqual(fades, ["in"], "and the band's size fades in over it as it lands");
  const hidden = { style: {} };
  photo.props.onError({ currentTarget: hidden });
  assert.equal(hidden.style.display, "none", "a photo that fails hides itself, and what is under it shows");
});

test("a lead's photo is asked for once, before it is needed, and last in line", () => {
  const made = [];
  const kept = globalThis.Image;
  globalThis.Image = class {
    constructor() {
      made.push(this);
    }
  };
  try {
    globalThis.window.leadPhotoWarm("https://lh3.googleusercontent.com/p/warm=w408-h268-k-no");
    globalThis.window.leadPhotoWarm("https://lh3.googleusercontent.com/p/warm=w408-h268-k-no");
    globalThis.window.leadPhotoWarm(null);
    assert.equal(made.length, 1, "once a page");
    assert.deepEqual(
      [made[0].src, made[0].fetchPriority],
      ["https://lh3.googleusercontent.com/p/warm=w408-h268-k-no", "low"],
    );
  } finally {
    globalThis.Image = kept;
  }
});
