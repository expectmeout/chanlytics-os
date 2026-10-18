/**
 * The lead sheet (canvas B v2, sheet/sheet.tsx), the panel of every lead opened on Leads, and everything the owner does
 * to one lead from it out of a pile: the stage in its ⋯, Not a fit and its five whys in the rail's place, Keep and Leave
 * out, Put back, Erase, a call from their own phone with its six outcomes, and a draft for their own inbox. The rail's
 * places for each state, and a pile's, are lead-workbench/lead-sheet.test.mjs's; this file is the acts the lead's panel
 * always had, carried onto the sheet, and the five tabs that say what the panel said.
 *
 * Drawn on the tests' stub React, as refusals-on-the-page does: a draw is a call and the page's state is this file's, the
 * way LeadsReal holds it (its mode, the question armed, the draft). Everything is imported from its TSX module: the
 * sheet, the panel's acts (peek/acts.tsx), the lightbox and the seams the page leans on (Esc, focus, the return watcher,
 * the photo warm-up); the kit's Menu, Segmented, Confirm and StatePill draw as the app draws them. Nothing is mocked that
 * the owner reads: the view model is contracts' own toLeadPeekVM and the words are contracts'. The page hands the acts a
 * courier, and this file hands its own, so what the sheet asked of the door is read off it (the surface's own doors,
 * and the wire they go over, are leads-bridge.test.mjs's). The one thing the sheet reads by itself is the lead's story
 * (useLeadStory): its read is answered here with a lead no reach-out wrote to, as it is for most leads.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { roleGate } from "../../../../../packages/contracts/src/shell/refusal.ts";
import { stateOf } from "../../../../../packages/contracts/src/shell/tone.ts";
import {
  LEAD_WORDS,
  LEAD_DRAFT_NOTE,
  LEAD_NO_ADDRESS,
  LEAD_NOT_A_FIT_WORDS,
  LEAD_NOT_A_FIT_TITLE,
  LEAD_CONTACT_STANDARD_WORDS,
  leadDraftFooter,
  toLeadPeekVM,
  leadPeekMenu,
} from "../../../../../packages/contracts/src/leads/leads.ts";
import { LEAD_SHEET_WORDS } from "../../../../../packages/contracts/src/leads/sheet/lead-sheet.ts";
import { LEAD_DOCK_WORDS } from "../../../../../packages/contracts/src/leads/sheet/lead-sheet-dock.ts";
import { hookFrames } from "../../_hook-frames.mjs";
import { kitPages, useStubHooks } from "../../_legacy-react.mjs";

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
  // The lead's story (reach-out/lines.tsx useLeadStory) keeps its re-read counter in one.
  useReducer: (red, init) => {
    const k = frames.key();
    if (!(k in cells)) cells[k] = init;
    return [
      cells[k],
      (a) => {
        cells[k] = red(cells[k], a);
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
  // The kit's capsule (Segmented) names its options by an id of its frame.
  useId: () => `:r${frames.key()}:`,
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
// The wire, answering the one read the sheet makes by itself: the lead's story (GET reach-outs/leads?lead=). A lead no
// reach-out wrote to has no timeline, and the Activity tab draws no block for it.
const wired = [];
const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
globalThis.window = {
  document: globalThis.document,
  addEventListener: on(listeners),
  removeEventListener: off(listeners),
  dispatchEvent() {},
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h),
  // On a workspace page, so the client names the workspace on every request the way it does in the browser.
  location: {
    pathname: "/w/harbor",
    hash: "",
    origin: "https://app.chanlytics.com",
    assign: (href) => dialled.push(href),
  },
  fetch: async (url) => {
    wired.push(String(url));
    if (/^\/api\/v1\/reach-outs\/leads\?/.test(String(url)))
      return json(200, { ok: true, data: { lines: null, chain: null, timeline: null } });
    return json(404, {
      ok: false,
      error: { code: "not_found", message: "The sheet asked for something this test did not expect." },
    });
  },
  navigator: {
    clipboard: {
      writeText: async (t) => {
        copied.push(t);
      },
    },
  },
  __roleGate: roleGate,
  // The one colour vocabulary, as the app publishes it: the fit's pill takes its tone from here.
  __chrome: { state: stateOf },
};
// The shell's helpers the sheet still asks of the window by way of legacy-verbs: the role gate (`gate`), a thumb's swipe
// (`touchSwipe`), the refusal toast. The role store is each test's own (roleIs).
await import("../../../../../apps/dashboard/src/legacy/components/data-bits.jsx");
// The fit's pill and the Erase question are the kit's (surfaces/kit), which the sheet draws by way of legacy-parts off
// the window, where seed-globals publishes them. The ⋯ and the ways of calling are the kit's Menu, found by its type and
// read by what the sheet hands it (kitItem); the tabs are the kit's capsule (Segmented), chosen as its onValueChange is
// called.
Object.assign(globalThis.window, kitPages);
useStubHooks();
const { Menu } = await import("../../../../../apps/dashboard/src/surfaces/kit/menu/menu.tsx");
const { Segmented } = await import("../../../../../apps/dashboard/src/surfaces/kit/segmented/segmented.tsx");
// The sheet and what the page leans on, from where they live (surfaces/leads, decision 0015).
const { LeadSheet } = await import("../../../../../apps/dashboard/src/surfaces/leads/sheet/sheet.tsx");
const { LeadPeekActions } = await import("../../../../../apps/dashboard/src/surfaces/leads/peek/acts.tsx");
const { LeadLightbox } = await import("../../../../../apps/dashboard/src/surfaces/leads/peek/lightbox.tsx");
const { leadPeekEscape, leadPeekFollows, leadPeekFocus, leadArmOnReturn, leadPhotoWarm } =
  await import("../../../../../apps/dashboard/src/surfaces/leads/peek/seams.ts");

/* ------------------------------------------------------------ the helpers */

const walk = (n, fn) => {
  if (n == null || typeof n !== "object") return;
  fn(n);
  for (const k of n.props?.children ?? []) walk(k, fn);
  if (n.rendered) walk(n.rendered, fn);
  // A kit Menu draws the page's control it is handed: Call's button, the ⋯.
  if (n.type === Menu) walk(n.props.trigger, fn);
  // A kit Sheet draws its foot (the rail) beside its body.
  if (n.props?.foot && typeof n.props.foot === "object") walk(n.props.foot, fn);
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
const classed = (tree, re) => all(tree, (n) => re.test(n.props?.className || ""));
/** A control pressed; a kit Menu's item (kitItem) is pressed through its act, as Base UI's item calls it. */
const press = async (node) => {
  assert.ok(node, "no such control");
  if (typeof node.onSelect === "function") return node.onSelect();
  await node.props.onClick({ preventDefault() {}, stopPropagation() {}, currentTarget: node });
};
/** A kit Menu, found by its control's test id (kit/menu/menu.tsx). Its opening is Base UI's, driven in a browser by e2e/kit/kit-behaves.spec.ts. */
const kitMenu = (tree, testid) =>
  find(tree, (n) => n.type === Menu && n.props.trigger?.props?.["data-testid"] === testid);
/** A kit Menu's item by its words: what the page hands it is its groups, read here. */
const kitItem = (tree, testid, label) =>
  kitMenu(tree, testid)
    ?.props.groups.flatMap((g) => g.items ?? [])
    .find((i) => i.label.includes(label)) ?? null;
/** The ⋯'s stage: a choice of three, the one the lead is at ticked (people/menu-groups.tsx choiceOf). */
const stageOf = (tree) => kitMenu(tree, "peek-more")?.props.groups.find((g) => g.choose)?.choose ?? null;
const pickStage = async (P, label) => {
  const choose = stageOf(P.draw().tree);
  assert.ok(choose, "the ⋯ holds the stage");
  await choose.onChoose(choose.options.find((o) => o.label === label).value);
};
/** A tab chosen, as the kit's capsule calls its onValueChange; the sheet keeps it for this lead. */
const tabTo = (P, id) => {
  find(P.draw().tree, (n) => n.type === Segmented).props.onValueChange(id);
  return P.draw().tree;
};
// Call opens the ways of calling (LeadCallMenu, the kit's Menu) on the Contact tab: a way is one of its items.
const callWay = async (P, label) => press(kitItem(tabTo(P, "contact"), "peek-act-call", label));
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
    __leadErase: async (id) => {
      seen.push(["erase", id]);
      return over.erase ? over.erase() : { ok: true, data: { erased: true, already: false } };
    },
  };
  return api;
};

/** What the sheet asks of the sequences Add goes to: none yet, so it asks nothing (sheet/use-aim.ts). */
const aimOf = () => ({
  targets: [],
  target: null,
  load: async () => {},
  check: async () => {},
  checkOf: () => undefined,
  choose() {},
  reset() {},
});

/** The page's own state, the way LeadsReal holds it: peekMode, armed and draft beside peekId. */
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
  const aim = aimOf();
  /** The sheet as scope.tsx draws it out of a pile, with the acts LeadPeekActions built from the page. */
  const draw = (more = {}) => {
    frames.begin();
    const acts = LeadPeekActions(p);
    const tree = LeadSheet({
      row: null,
      vm: p.vm,
      phone: false,
      tz: TZ,
      mode: st.mode,
      armed: st.armed,
      draft: st.draft,
      busy: false,
      deck: null,
      on: acts,
      aim,
      searchWrites: null,
      pile: null,
      monthLeft: null,
      listId: null,
      flash: p.flash,
      onClose: () => {
        st.peekId = null;
      },
      writeHeld() {},
      ...more,
    });
    return { tree, acts };
  };
  return { st, p, draw };
};

const reset = () => {
  cells = [];
  frames.reset();
  frames.begin();
  flashes.length = 0;
  opened.length = 0;
  dialled.length = 0;
  copied.length = 0;
  for (const k of Object.keys(listeners)) delete listeners[k];
  wired.length = 0;
  delete globalThis.window.ST_STORE;
};
/** The words of every tab, for a test that reads all the sheet says. */
const everyTab = (P) => ["why", "contact", "sequence"].map((id) => textOf(tabTo(P, id))).join(" ");

/* ======================================================= who they are ==== */

test("the sheet names the business and its line, the reason, a line for the checks and one for the ways in, and the stage in its ⋯", () => {
  reset();
  const { tree } = page().draw();
  assert.equal(tree.props.role, "dialog");
  assert.equal(/\bpl-peek\b/.test(tree.props.className), true, "the page's own overlay: PL_OVERLAY names it apart");
  assert.equal(tree.props["data-testid"], "lead-peek");
  assert.equal(textOf(byTestId(tree, "peek-name")), "Travis Heights Coaching Co.");
  // Under the name, the kind, the street and the rating (the refined canvas).
  assert.equal(textOf(byTestId(tree, "peek-sub")), "Personal trainer · 1200 Barton Springs Rd · 5.0 from 16 reviews");
  // No meter in the head: the checks are a line on the card, a strong fit's with no word before the count.
  assert.equal(byTestId(tree, "lead-sheet-fit"), null);
  assert.equal(textOf(byTestId(tree, "lead-sheet-checks")), "7 of 7 checks");
  assert.equal(textOf(byTestId(tree, "lead-sheet-contact-email")), "hello@travisheightscoaching.example");
  assert.equal(textOf(byTestId(tree, "lead-pile-why")), "Independent coaching · 5.0 from 16 reviews · email checked");
  const stage = stageOf(tree);
  assert.deepEqual(
    stage.options.map((o) => [o.label, o.value === stage.value]),
    [
      ["Ready", true],
      ["Contacted", false],
      ["Talking", false],
    ],
  );
  const close = byTestId(tree, "peek-close");
  assert.deepEqual([close.props.id, close.props["aria-label"]], ["lead-peek-close", LEAD_SHEET_WORDS.close]);
});

test("D1-lead-person-door: the name of a lead that became a person opens them in People; a lead that has not is its name alone", async () => {
  reset();
  const PERSON = "7b2d9c40-1e5f-4a63-8d27-3c9e5a1f6b88";
  const converted = page({ vm: vmOf({ stage: "converted", contact_id: PERSON }) });
  assert.equal(converted.p.vm.contactId, PERSON, "the sheet's view model carries the person (contracts toLeadPeekVM)");
  const door = byTestId(converted.draw().tree, "peek-name-person");
  assert.ok(door, "the name is a door");
  assert.equal(textOf(door), "Travis Heights Coaching Co.");
  assert.equal(door.props.title, LEAD_WORDS.openPerson);
  await press(door);
  assert.deepEqual(opened, [PERSON], "the page's own door to a person, the one the Talking toast presses");
  reset();
  const plain = page().draw().tree;
  assert.equal(byTestId(plain, "peek-name-person"), null, "no person, no door");
  assert.equal(textOf(byTestId(plain, "peek-name")), "Travis Heights Coaching Co.");
});

test("the sheet reads its lead's story once, and a lead no sequence wrote to draws no block in Sequence", async () => {
  reset();
  // Another lead than the rest of the file's: the client shares one request between two identical reads inside two seconds.
  const other = "5e000000-0000-4000-8000-000000000222";
  const P = page({ vm: vmOf({ id: other }) });
  P.draw();
  await settle();
  assert.deepEqual(wired, [`/api/v1/reach-outs/leads?lead=${other}&workspace=harbor`], "one read, for this lead");
  const activity = tabTo(P, "sequence");
  await settle();
  assert.equal(wired.length, 1, "drawn again, it does not ask again");
  assert.equal(byTestId(activity, "peek-reach-out"), null, "no timeline, no block");
  assert.equal(
    textOf(byTestId(activity, "lead-sheet-stand")),
    `Not in a sequence yet${LEAD_SHEET_WORDS.noTarget}`,
    "where it stands: in no sequence, and no sequence takes leads added yet",
  );
});

/* ========================================================== the tabs ==== */

test("Contact: where the sequence writes, its state in words, Copy and a draft; the phone with how it was checked and the ways to call; texts and WhatsApp locked with why", async () => {
  reset();
  const P = page();
  // On the card, the ways in at a glance, one line: the address, the phone, the site; pressed, it opens Contact.
  const line = byTestId(P.draw().tree, "lead-sheet-contact");
  assert.deepEqual(
    [textOf(byTestId(line, "lead-sheet-contact-email")), textOf(byTestId(line, "lead-sheet-contact-phone"))],
    ["hello@travisheightscoaching.example", "+1 (512) 555-0142"],
  );
  await press(line);
  assert.ok(byTestId(P.draw().tree, "lead-sheet-pane-contact"), "the line opens Contact");
  const tree = tabTo(P, "contact");
  assert.equal(
    textOf(byTestId(tree, "peek-phone-value")),
    "+1 (512) 555-0142",
    "a number reads as the app writes numbers everywhere else",
  );
  assert.equal(textOf(byTestId(tree, "peek-phone-words")), "The same number on Google Maps and their website.");
  assert.equal(textOf(byTestId(tree, "peek-email-value")), "hello@travisheightscoaching.example");
  assert.equal(textOf(byTestId(tree, "peek-email-words")), P.p.vm.reach.email.tip, "the mailbox's words, under it");
  // A line's acts are quiet marks: icon buttons, named for a screen reader and on hover (data-tip).
  for (const [id, name] of [
    ["peek-copy", LEAD_WORDS.copyAria],
    ["peek-draft", LEAD_WORDS.draftAria],
  ]) {
    const b = byTestId(tree, id);
    assert.deepEqual([b.props["aria-label"], b.props["data-tip"]], [name, name], id);
    assert.equal(textOf(b), "", `${id} says its name on hover, not on the line`);
  }
  assert.equal(textOf(byTestId(tree, "peek-locked-words")), P.p.vm.reach.locked.line);
  assert.equal(
    all(byTestId(tree, "peek-locked"), (n) => n.type === "button" || n.type === "a" || n.props?.onClick).length,
    0,
    "nothing sends a text to a lead: its line only says why",
  );
  await press(byTestId(tree, "peek-copy"));
  await callWay(P, LEAD_WORDS.callWays.copy.label);
  assert.deepEqual(copied, [`email ${LEAD}`, `phone ${LEAD}`]);
});

test("a catch-all email is amber on the card and named in Contact, with the search's own standard", () => {
  reset();
  const P = page({ vm: vmOf({ email_state: "catch_all" }) });
  const email = byTestId(P.draw().tree, "lead-sheet-contact-email");
  assert.match(email.props.className, /\blw-amber\b/, "the address in amber on the card: not as it should be");
  const words = textOf(byTestId(tabTo(P, "contact"), "peek-email-words"));
  assert.match(words, /Their server accepts every address, so the check can't tell\./);
  assert.ok(
    words.includes(LEAD_CONTACT_STANDARD_WORDS.email),
    "and the search's own standard, as a sentence of its own",
  );
  reset();
  const ok = textOf(byTestId(tabTo(page(), "contact"), "peek-email-words"));
  assert.equal(
    ok.includes(LEAD_CONTACT_STANDARD_WORDS.email),
    false,
    "beside an address that checks out the standard would be a sentence saying nothing",
  );
});

test("Why: every check with its mark and where it came from; what was seen against what Claude read; nothing read wears a plain check", () => {
  reset();
  const P = page();
  const tree = P.draw().tree;
  assert.equal(textOf(byTestId(tree, "lead-sheet-pane-why")).includes("Checks7 of 7"), true, "the head counts them");
  // Nothing failed, so the passed ones are open, with the legend that tells a mark seen from one Claude read.
  const passed = byTestId(tree, "lead-sheet-passed");
  assert.equal(passed.props.open, true);
  assert.match(textOf(passed), /seen on the map or in the mailbox.*read by Claude from the listing and their site/);
  const rows = classed(byTestId(tree, "peek-checks-open"), /^lw-ck /);
  assert.equal(rows.length, CHECKS.length, "every check");
  assert.deepEqual(
    rows.map((r) => textOf(find(r, (x) => x.props?.className === "lw-src"))),
    P.p.vm.groups.flatMap((g) => g.checks.map((c) => c.source)),
    "each with where it came from",
  );
  const seen = rows.filter((r) => /\bseen\b/.test(r.props.className));
  const read = rows.filter((r) => /\bread\b/.test(r.props.className));
  assert.deepEqual(
    seen.map((r) => textOf(r.props.children[1])),
    ["Open for business", "In the area you asked for", "Phone matches on two sources", "Mailbox exists"],
  );
  assert.equal(read.length, 3);
  assert.equal(read.flatMap((r) => classed(r, /pk-ck-check/)).length, 0, "nothing read wears a plain check mark (P2)");
  assert.equal(seen.flatMap((r) => classed(r, /pk-ck-check/)).length, 4, "what was seen does");
});

test("a criterion Claude could not tell says so, and never a check", () => {
  reset();
  const unsure = CHECKS.map((c) =>
    c.key === "independent" ? { ...c, answer: "unknown", reason: "the listing does not say" } : c,
  );
  const tree = page({ vm: vmOf({ member: { checks: unsure } }) }).draw().tree;
  const ck = byTestId(tree, "peek-check-independent-open");
  assert.match(textOf(ck), /couldn't tell/);
  assert.equal(classed(ck, /pk-ck-ask/).length, 1, "the mark that asks");
  assert.equal(classed(ck, /pk-ck-check/).length, 0);
});

test("the other addresses fold in Contact with why Claude picked this one; how it was found is Why's; the site and Instagram are Contact's", () => {
  reset();
  const P = page();
  const reach = tabTo(P, "contact");
  const others = byTestId(reach, "peek-others");
  assert.equal(others.type, "details", "folded, not open");
  assert.equal(textOf(byTestId(reach, "peek-others-summary")), "2 other addresses on their site");
  assert.deepEqual(all(others, (n) => n.type === "li").map(textOf), [
    "careers@travisheightscoaching.example — for job seekers",
    "A coach's personal mailbox — not the business",
  ]);
  assert.equal(textOf(byTestId(reach, "peek-others-why")), "on their own domain and answers bookings");
  const activity = tabTo(P, "why");
  assert.ok(textOf(byTestId(activity, "lead-sheet-pane-why")).includes("On Google Maps · today"));
  const steps = all(byTestId(activity, "peek-found"), (n) => n.props?.className === "lw-found-i");
  assert.deepEqual(
    steps.map((s) => textOf(s.props.children[1])),
    [
      "Google Maps · searching “personal trainer”",
      "travisheightscoaching.example · an email on the contact page",
      "Mailbox · Checked",
    ],
  );
  assert.deepEqual(
    steps.map((s) => textOf(s.props.children[2])),
    ["2:14 PM", "2:14 PM", "2:16 PM"],
    "the minute each happened in",
  );
  const about = tabTo(P, "contact");
  assert.equal(byTestId(about, "peek-website").props.href, "https://travisheightscoaching.example");
  assert.equal(byTestId(about, "peek-instagram").props.href, "https://instagram.example/travisheights");
});

/* ======================================================== the decisions ==== */

test("a Needs review lead says so and its dock offers Keep and Leave out; a lead left out says what stopped and offers Put back", async () => {
  reset();
  const review = page({ vm: vmOf({ member: { class: "review", fit: null, reason: "Couldn't check the email" } }) });
  let tree = review.draw().tree;
  assert.equal(textOf(byTestId(tree, "lead-sheet-word")), "To review", "where it stands, beside the name");
  assert.equal(textOf(byTestId(tree, "lead-pile-why")), "Couldn't check the email");
  await press(byTestId(tree, "lead-sheet-keep"));
  await press(byTestId(tree, "lead-sheet-exclude"));
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
  assert.match(
    textOf(byTestId(tree, "lead-sheet-checks")),
    /^Left out — Chain gyms · /,
    "what happened first, then the owner's own word for the criterion, on the checks line",
  );
  assert.equal(textOf(byTestId(tree, "lead-pile-why")), "Part of Crunch Fitness, a chain with many locations");
  assert.match(
    textOf(byTestId(tree, "lead-sheet-box-line")),
    /^Left out\. /,
    "what stopped, plainly, in the sequence box",
  );
  assert.equal(stageOf(tree), null, "a place left out has no stage");
  await press(byTestId(tree, "lead-sheet-put_back"));
  assert.deepEqual(
    flashes.map((f) => f.msg),
    [`put back ${LEAD}`],
  );
});

test("an operator sees Keep, Leave out and Put back held with the gate's sentence, and pressing one does nothing; Not a fit is theirs", async () => {
  reset();
  globalThis.window.ST_STORE = { can: (a) => a !== "find", myRole: () => "operator" };
  const { tree } = page({
    vm: vmOf({ member: { class: "review", fit: null, reason: "Couldn't check the email" } }),
  }).draw();
  for (const [id, doing] of [
    ["lead-sheet-keep", "keep this lead"],
    ["lead-sheet-exclude", "leave this lead out"],
  ]) {
    const b = byTestId(tree, id);
    assert.equal(b.props["aria-disabled"], true, id);
    assert.equal(b.props["aria-description"], `Only an owner can ${doing}.`, id);
  }
  await press(byTestId(tree, "lead-sheet-keep"));
  assert.deepEqual(flashes, [], "the gate replaced the handler");
  // The stage door is an operator's (route-policy: POST leads/[id]/stage), and Not a fit goes through it.
  reset();
  globalThis.window.ST_STORE = { can: (a) => a !== "find", myRole: () => "operator" };
  assert.notEqual(byTestId(page().draw().tree, "lead-sheet-not_a_fit").props["aria-disabled"], true);
  reset();
  globalThis.window.ST_STORE = { can: () => false, myRole: () => "viewer" };
  const x = byTestId(page().draw().tree, "lead-sheet-not_a_fit");
  assert.equal(x.props["aria-disabled"], true);
  assert.equal(x.props["aria-description"], "Only an owner or operator can set this lead aside.");
});

/* ================================================= Erase, the owner's ==== */

const roleIs = (role) => {
  globalThis.window.ST_STORE = { can: (a) => role === "owner" || a !== "find", myRole: () => role };
};
/** The ⋯'s item by its words: the kit's Menu. */
const menuItem = async (P, label) => kitItem(P.draw().tree, "peek-more", label);

test("the owner's ⋯ offers Erase this lead; it asks first in contracts' words, and yes erases through the one door, closes the sheet and says it is gone", async () => {
  reset();
  roleIs("owner");
  const courier = courierOf();
  const P = page({ courier });
  assert.equal(byTestId(P.draw().tree, "peek-erase-confirm"), null, "nothing asked before the press");
  const item = await menuItem(P, LEAD_WORDS.erase.act);
  assert.ok(item, "the ⋯ holds Erase this lead");
  assert.equal(item.tone, "danger", "drawn as the act that destroys, in the menu's own way");
  await press(item);
  assert.equal(P.st.mode, "erase");
  assert.deepEqual(courier.seen, [], "the menu's press asks; it does not erase");
  const ask = byTestId(P.draw().tree, "peek-erase-confirm");
  assert.equal(
    textOf(ask).startsWith("Erase Travis Heights Coaching Co.? Its record and every trace of it go for good."),
    true,
  );
  await press(byTestId(ask, "peek-erase-yes"));
  await settle();
  assert.deepEqual(courier.seen, [["erase", LEAD]], "the one door, with the lead's id");
  assert.equal(P.st.peekId, null, "the sheet closes on a lead that is gone");
  assert.equal(flashes.at(-1).msg, "Travis Heights Coaching Co. is erased. It won't be found again.");
  assert.equal(flashes.at(-1).undo, undefined, "no Undo: it goes for good");
});

test("No leaves the lead as it was, and a refused Erase says why and keeps the sheet open", async () => {
  reset();
  roleIs("owner");
  let P = page();
  await press(await menuItem(P, LEAD_WORDS.erase.act));
  await press(byTestId(P.draw().tree, "peek-erase-no"));
  assert.equal(P.st.mode, "info");
  assert.equal(P.st.peekId, LEAD);
  assert.deepEqual(flashes, []);
  const courier = courierOf({ erase: () => ({ ok: false, code: "forbidden", status: 403, message: "Owner only." }) });
  P = page({ courier });
  await press(await menuItem(P, LEAD_WORDS.erase.act));
  await press(byTestId(P.draw().tree, "peek-erase-yes"));
  await settle();
  assert.deepEqual(courier.seen, [["erase", LEAD]]);
  assert.equal(P.st.peekId, LEAD, "still open: nothing went");
  assert.equal(P.st.mode, "info");
  assert.equal(flashes.at(-1).tone, "danger", "the door's refusal, said");
});

test("REVIEW: Yes, erase pressed twice sends one erase, and the question says it is erasing while the door is out", async () => {
  reset();
  roleIs("owner");
  let release;
  const courier = courierOf({
    erase: () => new Promise((res) => (release = () => res({ ok: true, data: { erased: true, already: false } }))),
  });
  const P = page({ courier });
  await press(await menuItem(P, LEAD_WORDS.erase.act));
  const yes = byTestId(P.draw().tree, "peek-erase-yes");
  const first = yes.props.onClick({ preventDefault() {}, stopPropagation() {} });
  const second = yes.props.onClick({ preventDefault() {}, stopPropagation() {} });
  await settle();
  assert.deepEqual(courier.seen, [["erase", LEAD]], "one door call for two presses");
  const busy = byTestId(P.draw().tree, "peek-erase-yes");
  assert.equal(busy.props.disabled, true, "held while the door is out");
  assert.equal(textOf(busy), LEAD_WORDS.erase.busy);
  release();
  await Promise.all([first, second]);
  await settle();
  assert.equal(P.st.peekId, null);
  assert.equal(flashes.filter((f) => /is erased/.test(String(f.msg))).length, 1, "one toast");
});

test("an operator, a partner, a viewer and a role the page cannot read find no Erase in the ⋯: it is the owner's", () => {
  for (const role of ["operator", "partner", "viewer", null]) {
    reset();
    if (role) roleIs(role);
    const { tree } = page().draw();
    assert.equal(kitItem(tree, "peek-more", LEAD_WORDS.erase.act), null, `${role ?? "no role"}: no Erase`);
    assert.equal(
      find(tree, (n) => textOf(n) === LEAD_WORDS.erase.act),
      null,
      `${role ?? "no role"}: no Erase anywhere`,
    );
  }
  assert.deepEqual(
    leadPeekMenu("owner").map((m) => m.id),
    ["erase"],
  );
  assert.deepEqual([leadPeekMenu("operator"), leadPeekMenu(undefined)], [[], []]);
  // A partner (decision 0012) stands below an owner on the door's own ladder: DELETE leads/[id] refuses them too.
  assert.deepEqual(leadPeekMenu("partner"), [], "a partner is offered no Erase");
  // A lead left out has no stage to choose, so for a member who may not erase there is nothing behind a ⋯ at all.
  reset();
  const out = page({ vm: vmOf({ member: { class: "excluded", fit: null, excluded_by: "chain" } }) }).draw().tree;
  assert.equal(byTestId(out, "peek-more"), null);
});

test("a stage chosen in the ⋯ goes through the one door and says what the door said, with Undo; it never converts", async () => {
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
  await pickStage(P, "Talking");
  await settle();
  assert.deepEqual(
    courier.seen[0],
    ["stage", LEAD, { kind: "stage", stage: "converted" }],
    "a choice says Talking; it never says convert",
  );
  assert.equal(
    flashes[0].msg,
    "Marked talking. They join People when they write or call in, or when a call goes well.",
  );
  await flashes[0].undo();
  assert.deepEqual(courier.seen[1], ["undo", "op-9", 5]);
  assert.deepEqual(opened, [], "nobody was made a person");
});

test("Esc backs out one step: the question it asked, then the pane it opened, then the sheet", () => {
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
  assert.equal(leadPeekEscape(arg), "armed");
  assert.equal(st.armed, null);
  assert.equal(leadPeekEscape({ ...arg, armed: st.armed }), "mode");
  assert.equal(st.mode, "info");
  assert.equal(leadPeekEscape({ ...arg, armed: null, mode: st.mode }), "peek");
  assert.equal(st.peekId, null);
  assert.deepEqual(
    [leadPeekFollows("info", null), leadPeekFollows("draft", null), leadPeekFollows("info", { kind: "call" })],
    [true, false, false],
    "a question or a draft holds the sheet on its lead",
  );
});

test("focus moves into the sheet when it opens and back to the row when it closes, and the return watcher takes its listeners down", () => {
  reset();
  const focused = [];
  const el = (id) => ({ id, focus: () => focused.push(id) });
  globalThis.document.getElementById = (id) => el(id);
  leadPeekFocus(LEAD, null);
  leadPeekFocus(null, LEAD);
  assert.deepEqual(focused, ["lead-peek-close", `lead-${LEAD}`], "the row is the cursor's, by the table's own noun");
  globalThis.document.getElementById = undefined;

  const st = { armed: { kind: "call", leadId: LEAD, asked: false } };
  const stop = leadArmOnReturn(st.armed, (v) => {
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
    leadArmOnReturn(st.armed, () => {}),
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
  await pickStage(P, "Contacted");
  await settle();
  assert.equal(flashes[0].tone, "danger");
  assert.equal(textOf(flashes[0].msg).includes("This lead is gone."), true);
});

/* ========================================================= the draft ==== */

/** Draft, pressed where it lives: the email's line on the Reach tab. */
const draftFrom = async (P) => {
  await press(byTestId(tabTo(P, "contact"), "peek-draft"));
  await settle();
};

test("Draft asks the route once, shows what it wrote with the foot the law asks for, and never a field the page would have to encode", async () => {
  reset();
  const courier = courierOf();
  const P = page({ courier });
  await draftFrom(P);
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
  assert.equal(byTestId(tree, "lead-sheet-pane-why"), null, "the draft is the sheet's body while it is open");
  assert.ok(byTestId(tree, "lead-sheet-dock"), "and the dock stays under it");
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
  await draftFrom(P);
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
  await draftFrom(P);
  const { tree } = P.draw();
  assert.equal(textOf(byTestId(tree, "peek-draft-error")), LEAD_NO_ADDRESS);
  assert.equal(byTestId(tree, "peek-draft-error").props.role, "alert");
  assert.equal(byTestId(tree, "peek-open-mail").props["aria-disabled"], true);
});

test("a lead whose email bounces is a call: the dock says so, its yes is Call, and Contact offers no Copy and no Draft", async () => {
  reset();
  const P = page({ vm: vmOf({ email_state: "invalid" }) });
  const tree = P.draw().tree;
  assert.equal(
    textOf(byTestId(tree, "lead-sheet-dock-line")),
    LEAD_DOCK_WORDS.noEmail.line,
    "a phone and no email: the yes is a call",
  );
  assert.match(
    byTestId(tree, "lead-sheet-contact-email").props.className,
    /\blw-amber\b/,
    "the address in amber on the card",
  );
  const reach = tabTo(P, "contact");
  assert.match(textOf(byTestId(reach, "peek-email-words")), /That mailbox doesn't exist/);
  assert.equal(byTestId(reach, "peek-draft"), null);
  assert.equal(byTestId(reach, "peek-copy"), null);
  assert.ok(byTestId(reach, "peek-act-call"), "the phone is what is left");
  await press(byTestId(P.draw().tree, "lead-sheet-call"));
  assert.deepEqual(dialled, ["tel:+15125550142"], "the dock's Call rings from the owner's phone");
  assert.deepEqual([P.st.armed.kind, P.st.armed.asked], ["call", false]);
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
  await draftFrom(P);
  assert.equal(P.st.armed, null, "Draft alone arms nothing");
  await press(byTestId(P.draw().tree, "peek-open-mail"));
  assert.deepEqual([P.st.armed.kind, P.st.armed.asked], ["sent", false]);
  assert.equal(byTestId(P.draw().tree, "peek-sent-ask"), null, "nothing is asked while they are away");

  const stop = leadArmOnReturn(P.st.armed, P.p.setArmed);
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
  await draftFrom(P);
  await press(byTestId(P.draw().tree, "peek-copy-draft"));
  await settle();
  assert.equal(copied[0].startsWith("Missed calls at Travis Heights\n\nHi,"), true);
  assert.equal(P.st.armed.kind, "sent");
  assert.equal(flashes.at(-1).msg, "Copied the email.");
});

/* ========================================================= the calls ==== */

test("Call asks how first and rings from the owner's phone; how it went is asked when the tab comes back; the six are one radiogroup and the note says its cap", async () => {
  reset();
  const P = page();
  // Call asks how first: its button opens the ways (Base UI's menu) and rings nobody; "Call from your phone" rings.
  const call = kitMenu(tabTo(P, "contact"), "peek-act-call");
  assert.deepEqual(dialled, [], "REGRESSION: the panel's Call rang the business the moment it was pressed");
  assert.deepEqual(
    call.props.groups.map((g) => g.header),
    [undefined],
    "the line already says the number, so no heading repeats it",
  );
  assert.deepEqual(
    call.props.groups.flatMap((g) => g.items).map((i) => `${i.label}${i.meta || ""}`),
    Object.values(LEAD_WORDS.callWays).map((w) => `${w.label}${w.meta || ""}`),
    "the three ways",
  );
  await callWay(P, LEAD_WORDS.callWays.dial.label);
  assert.deepEqual(dialled, ["tel:+15125550142"]);
  assert.deepEqual([P.st.armed.kind, P.st.armed.asked], ["call", false]);
  assert.equal(byTestId(P.draw().tree, "peek-call-ask"), null);
  const stop = leadArmOnReturn(P.st.armed, P.p.setArmed);
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
  const reach = tabTo(page({ vm: vmOf({ phone_wrong: true }) }), "contact");
  assert.equal(/\bwrong\b/.test(byTestId(reach, "peek-phone-value").props.className), true);
  assert.equal(byTestId(reach, "peek-act-call"), null, "a number marked wrong is not dialled again, nor copied");
  assert.equal(
    textOf(byTestId(reach, "peek-phone-words")),
    "You marked this number wrong.",
    "the struck number says why",
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

/* ========================================================= Not a fit ====== */

test("Not a fit asks why in five ways in the dock's own place, Back writes nothing, and the list teaches nothing in this release", async () => {
  reset();
  const P = page();
  await press(byTestId(P.draw().tree, "lead-sheet-not_a_fit"));
  const { tree } = P.draw();
  assert.equal(byTestId(tree, "lead-sheet-dock"), null, "the reasons stand where the dock stood");
  const why = byTestId(tree, "peek-why");
  assert.deepEqual([why.props.role, why.props["aria-label"]], ["group", LEAD_NOT_A_FIT_TITLE]);
  assert.deepEqual(
    ["chain", "wrong_kind", "too_far", "customer", "other"].map((w) =>
      textOf(find(byTestId(why, `peek-why-${w}`), (n) => n.type === "span")),
    ),
    [
      LEAD_NOT_A_FIT_WORDS.chain,
      LEAD_NOT_A_FIT_WORDS.wrong_kind,
      LEAD_NOT_A_FIT_WORDS.too_far,
      LEAD_NOT_A_FIT_WORDS.customer,
      LEAD_NOT_A_FIT_WORDS.other,
    ],
  );
  assert.equal(
    /learn|next searches|you said/i.test(textOf(why)),
    false,
    "the scoped learning and the you-said chips are release C",
  );
  await press(byTestId(why, "peek-why-back"));
  assert.equal(P.st.mode, "info");
  assert.ok(byTestId(P.draw().tree, "lead-sheet-dock"), "Back puts the dock back");
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
    await press(byTestId(P.draw().tree, "lead-sheet-not_a_fit"));
    await press(byTestId(P.draw().tree, `peek-why-${why}`));
    await settle();
    assert.deepEqual(courier.seen[0], ["stage", LEAD, { kind: "not_a_fit", why }], why);
    assert.equal(flashes[0].msg, toast, why);
    await flashes[0].undo();
    assert.deepEqual(courier.seen[1], ["undo", "op-6", 9], why);
    assert.equal(P.st.mode, "info", "the reasons close behind the answer");
  }
});

test("no word the sheet says names the vendor, or a dollar", () => {
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
          const said = everyTab(page({ vm, mode, armed }));
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

/* ===================================================== About and photos ==== */

// D2: who they are, from what the listing shows. Every line only when the listing said; a lead from before says nothing.
test("About shows who they are: their own words, where, the listing unclaimed, the socials and the Maps page; the line under the name is the canvas's", () => {
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
  // The refined canvas: the kind, the street and the rating; whether they are open is Contact's week, today marked.
  assert.equal(
    textOf(byTestId(shown.draw().tree, "peek-sub")),
    "Personal trainer · 101 Biscayne Blvd · 5.0 from 16 reviews",
  );
  let tree = tabTo(shown, "why");
  const facts = textOf(byTestId(tree, "peek-about"));
  for (const said of ["Waterfront venue for weddings.", "ListingNot claimed by the owner"])
    assert.ok(facts.includes(said), said);
  assert.ok(
    textOf(byTestId(tabTo(shown, "contact"), "peek-where")).includes("101 Biscayne Blvd, Miami, FL 33132"),
    "the address is Contact's, where they are",
  );
  assert.deepEqual(
    all(byTestId(tree, "peek-about"), (n) => n.props?.className === "lw-kv-k")
      .map(textOf)
      .filter((k) => /^Rat/.test(k)),
    ["Rating"],
    "the rating said once, with its low share, not again as the listing's fact",
  );
  tree = tabTo(shown, "contact");
  assert.deepEqual(
    ["peek-facebook", "peek-linkedin", "peek-tiktok", "peek-maps"].map((id) => byTestId(tree, id)?.props.href ?? null),
    ["https://www.facebook.example/x", null, "https://www.tiktok.example/@x", "https://maps.example/?cid=1"],
  );

  reset();
  const bare = page({ vm: vmOf({}) });
  tree = tabTo(bare, "why");
  for (const said of ["Waterfront", "Not claimed"]) assert.equal(textOf(tree).includes(said), false, said);
  tree = tabTo(bare, "contact");
  for (const id of ["peek-facebook", "peek-maps", "peek-week"])
    assert.equal(byTestId(tree, id), null, `${id}: a lead from before D2 claims none of it`);
});

test("Contact's week: seven days in their short hours, today marked, and the week's shape in one line", () => {
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
  const tree = tabTo(page({ vm: vmOf({ hours: days }) }), "contact");
  assert.ok(
    textOf(byTestId(tree, "lead-sheet-pane-contact")).includes("Open 6 days · 11–10 most days"),
    "the week's shape, said once",
  );
  const rows = all(byTestId(tree, "peek-week"), (n) => n.props?.["data-testid"] === "peek-day");
  assert.equal(rows.length, 7, "closed days included");
  assert.deepEqual(
    rows.map((d) => textOf(d.props.children[1])),
    ["Closed", "11–10", "11–10", "11–10", "11–10", "11–11", "11–11"],
  );
  assert.deepEqual(
    rows.map((d) => /\btoday\b/.test(d.props.className)),
    [false, false, false, false, false, true, false],
    "NOW is a Friday in America/Chicago",
  );
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
  const tree = LeadLightbox({ vm, onClose: () => closed.push(1) });
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
  // On a phone the photos are the whole screen: a pull down from their top lets them go, as the peek under them does
  // (Ruben, 8 October 2026: only Close did). The touch stays the photos' own: the peek that drew them reads a pull
  // as its own Close, and it would have gone with them.
  const el = { dataset: {} };
  let stopped = 0;
  const pull = (dy) => {
    const stopPropagation = () => (stopped += 1);
    box.props.onTouchStart({
      touches: [{ clientX: 180, clientY: 60 }],
      currentTarget: el,
      target: null,
      stopPropagation,
    });
    box.props.onTouchEnd({ changedTouches: [{ clientX: 184, clientY: 60 + dy }], currentTarget: el, stopPropagation });
  };
  pull(140);
  assert.deepEqual(closed, [1], "beside a desk's table nothing is pulled");
  const media = globalThis.window.matchMedia;
  globalThis.window.matchMedia = (q) => ({ matches: q === "(max-width: 900px)" });
  try {
    pull(40);
    assert.deepEqual(closed, [1], "a short drag keeps them");
    pull(140);
    assert.deepEqual(closed, [1, 1], "REGRESSION: Close was the only way out of the photos on a phone");
  } finally {
    globalThis.window.matchMedia = media;
  }
  assert.equal(stopped, 6, "and every touch stayed the photos' own");
  // A lead with no photo draws the tile, and says so.
  const noPhoto = LeadLightbox({ vm: vmOf({ hours: [] }), onClose: () => {} });
  assert.match(textOf(byTestId(noPhoto, "lightbox-photo")), /No photo on the listing/);
  assert.equal(byTestId(noPhoto, "lightbox-week"), null, "no hours, no block");
  // Esc: the lightbox first.
  const steps = [];
  const out = leadPeekEscape({
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

test("on a phone: the kit's sheet at half height over the rows, the tabs at full, a sideways swipe walks the rows, and Save and go to the next", async () => {
  reset();
  const moved = [];
  const deck = { at: 3, of: 19, onPrev: () => moved.push("prev"), onNext: () => moved.push("next") };
  const P = page();
  const onPhone = (over = {}) => P.draw({ phone: true, deck, ...over }).tree;
  let tree = onPhone();
  const sheet = find(tree, (n) => n.props?.rest && n.props?.testid === "lead-peek");
  assert.ok(sheet, "the kit's sheet, with its two rests");
  assert.equal(sheet.props.rest.at, "half", "it opens on the card");
  assert.ok(
    byTestId(tree, "lead-pile-lead") && byTestId(tree, "lead-sheet-dock"),
    "the card, and the dock at its foot",
  );
  // At half the three tabs sit under the card with none picked (the canvas's PhoneHalf): any of them raises the sheet.
  assert.equal(find(tree, (n) => n.type === Segmented).props.value, "", "the tabs wait under the card, none picked");

  // A swipe across the card is the next lead or the one before, 80px under a thumb; a scroll is never a move.
  const body = find(tree, (n) => n.props?.className === "lw-body");
  const el = { dataset: {} };
  const swipe = (dx, dy) => {
    body.props.onTouchStart({ touches: [{ clientX: 300, clientY: 200 }], currentTarget: el, target: null });
    body.props.onTouchEnd({ changedTouches: [{ clientX: 300 + dx, clientY: 200 + dy }], currentTarget: el });
  };
  swipe(-120, 6);
  assert.equal(moved.at(-1), "next", "a swipe left is the next lead");
  swipe(140, -4);
  assert.equal(moved.at(-1), "prev", "a swipe right is the one before");
  const before = moved.length;
  swipe(-40, 10);
  swipe(-120, 300);
  assert.equal(moved.length, before, "a short drag and a scroll move nothing");

  // Raised, the three tabs read under who they are, and the dock holds still under them.
  sheet.props.rest.onRest("full");
  tree = onPhone();
  assert.ok(byTestId(tree, "lead-sheet-full"), "full height");
  assert.equal(find(tree, (n) => n.type === Segmented).props.value, "why", "the tabs, Why picked");
  assert.ok(byTestId(tree, "lead-sheet-dock"), "the dock, still");

  // Back from the call: the six outcomes wear their dots, the question says what saving does, and one press saves and moves on.
  const armed = { kind: "call", leadId: LEAD, asked: true, outcome: "interested", note: "" };
  const ask = byTestId(onPhone({ armed }), "peek-call-ask");
  assert.ok(
    find(byTestId(ask, "peek-outcome-interested"), (n) => n.props?.className === "dot"),
    "each outcome wears its dot, beside its word",
  );
  assert.match(textOf(ask), /Saving moves them to Talking/);
  await press(byTestId(ask, "peek-call-save-next"));
  assert.equal(moved.at(-1), "next", "saved, and on to the next");
  assert.equal(
    byTestId(onPhone({ armed, deck: { ...deck, at: 19 } }), "peek-call-save-next"),
    null,
    "on the last of the rows there is nowhere to go next",
  );

  // A desk has no swipe: the panel sits beside the rows.
  const desk = P.draw({ deck }).tree;
  assert.deepEqual([desk.props.onTouchStart, byTestId(desk, "peek-body").props.onTouchStart], [undefined, undefined]);
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
    leadPhotoWarm("https://lh3.googleusercontent.com/p/warm=w408-h268-k-no");
    leadPhotoWarm("https://lh3.googleusercontent.com/p/warm=w408-h268-k-no");
    leadPhotoWarm(null);
    assert.equal(made.length, 1, "once a page");
    assert.deepEqual(
      [made[0].src, made[0].fetchPriority],
      ["https://lh3.googleusercontent.com/p/warm=w408-h268-k-no", "low"],
    );
  } finally {
    globalThis.Image = kept;
  }
});
