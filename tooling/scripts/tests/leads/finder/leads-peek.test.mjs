/**
 * The lead sheet (sheet/sheet.tsx), the panel of every lead opened on Leads, and everything the owner does to one lead
 * from it out of a pile: Not a fit, Keep and Leave out, Put back, Erase, a call from their own phone with its six
 * outcomes, and a draft for their own inbox. The card, the lines and the dock in each state are
 * lead-workbench/lead-sheet.test.mjs's; this file is the acts the lead's panel always had, carried onto the sheet, and
 * its one scroll: who, the doors, the card, and the five lines.
 *
 * Drawn on the tests' stub React, as refusals-on-the-page does: a draw is a call and the page's state is this file's, the
 * way LeadsReal holds it (its mode, the question armed, the draft). Everything is imported from its TSX module: the
 * sheet, the panel's acts (peek/acts.tsx), the lightbox and the seams the page leans on (Esc, focus, the return watcher,
 * the photo warm-up); the kit's Menu, SubTabs, Confirm and StatePill draw as the app draws them. Nothing is mocked that
 * the owner reads: the view model is contracts' own toLeadPeekVM and the words are contracts'. The page hands the acts a
 * courier, and this file hands its own, so what the sheet asked of the door is read off it (the surface's own doors,
 * and the wire they go over, are leads-bridge.test.mjs's). The one thing the sheet reads by itself is the lead's story
 * (useLeadStory): its read is answered here with a lead no reach-out wrote to, as it is for most leads.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { roleGate } from "../../../../../packages/contracts/src/shell/refusal.ts";
import { stateOf } from "../../../../../packages/contracts/src/shell/tone.ts";
import { LEAD_WORDS, leadDraftFooter, toLeadPeekVM } from "../../../../../packages/contracts/src/leads/leads.ts";
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
  // A surface the sheet reads (use-surface.ts, the record's reads): what it holds now, as a store answers it.
  useSyncExternalStore: (_subscribe, snapshot) => snapshot(),
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
    if (/^\/api\/v1\/leads\/[^/]+\/place\?/.test(String(url))) return json(200, { ok: true, data: null });
    if (/^\/api\/v1\/sequences\?/.test(String(url))) return json(200, { ok: true, data: { sequences: [] } });
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
(await import("../../../../../apps/dashboard/src/surfaces/frame/frame-globals.ts")).installFrameGlobals();
// The fit's pill and the Erase question are the kit's (surfaces/kit), which the sheet draws by way of legacy-parts off
// the window, where seed-globals publishes them. The ⋯ and the ways of calling are the kit's Menu, found by its type and
// read by what the sheet hands it (kitItem); the tabs are the kit's capsule (SubTabs, look "capsule"), chosen as its
// onSelect is called.
Object.assign(globalThis.window, kitPages);
useStubHooks();
const { Menu } = await import("../../../../../apps/dashboard/src/surfaces/kit/menu/menu.tsx");
const { SubTabs } = await import("../../../../../apps/dashboard/src/surfaces/kit/sub-tabs/sub-tabs.tsx");
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
      pile: null,
      searchId: SEARCH_ID,
      flash: p.flash,
      onClose: () => {
        st.peekId = null;
      },
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

/* ======================================================= who they are ==== */

/** Who is looking: the role store the gate reads (legacy-verbs gate, canDo). */
const roleIs = (role) => {
  globalThis.window.ST_STORE = { can: (a) => role === "owner" || a !== "find", myRole: () => role };
};
/** More's item by its words: the kit's Menu. */
const menuItem = async (P, label) => kitItem(P.draw().tree, "peek-more", label);

/* =================================================== the one scroll ==== */

/** Every test id the sheet draws, in the order it draws them. */
const idsOf = (tree) =>
  all(tree, (n) => typeof n.props?.["data-testid"] === "string").map((n) => n.props["data-testid"]);

test("one scroll: who, the doors, the one card, then the five lines, one open at a time", async () => {
  reset();
  const P = page();
  const { tree } = P.draw();
  assert.equal(tree.props["data-testid"], "lead-peek");
  assert.equal(textOf(byTestId(tree, "peek-name")), "Travis Heights Coaching Co.");
  assert.match(textOf(byTestId(tree, "peek-sub")), /^Personal trainer · 1200 Barton Springs Rd · ★ 5\.0 \(16\)$/);
  assert.equal(textOf(byTestId(tree, "lead-sheet-word")), "Strong fit", "one status word, on the card");
  assert.ok(byTestId(tree, "lead-sheet-quick"), "the doors");
  assert.ok(byTestId(tree, "lead-sheet-website"));
  const order = idsOf(tree).filter((id) => /^lead-sheet-sec-[a-z]+$/.test(id));
  assert.deepEqual(
    order,
    [
      "lead-sheet-sec-fit",
      "lead-sheet-sec-contact",
      "lead-sheet-sec-about",
      "lead-sheet-sec-sequence",
      "lead-sheet-sec-history",
    ],
    "the same five, in one order, nothing behind a tab",
  );
  assert.equal(
    find(tree, (n) => n.type === SubTabs),
    null,
    "no tabs",
  );
  assert.equal(byTestId(tree, "peek-email"), null, "a line holds its rows closed");
  await press(byTestId(tree, "lead-sheet-sec-contact-press"));
  const open = P.draw().tree;
  assert.match(textOf(byTestId(open, "peek-email-value")), /hello@travisheightscoaching\.example/);
  await press(byTestId(open, "lead-sheet-sec-fit-press"));
  const next = P.draw().tree;
  assert.equal(byTestId(next, "peek-email"), null, "one line open at a time");
  assert.ok(byTestId(next, "peek-checks-open"));
});

test("the dock for a lead to decide on: Not a fit, then Add to a sequence, which opens the picker as a step", async () => {
  reset();
  const P = page();
  P.draw();
  // Their place is read as the sheet opens (00459 sequence_place): the dock waits for it, offering nothing it could take back.
  await settle();
  const tree = P.draw().tree;
  assert.ok(byTestId(tree, "lead-sheet-not_a_fit"));
  assert.equal(byTestId(tree, "lead-sheet-later"), null, "Later is a pass of a search's rows: none is open here");
  const add = byTestId(tree, "lead-sheet-pick");
  assert.equal(textOf(add).includes(LEAD_DOCK_WORDS.addToOne), true, "nothing picked: Add to a sequence");
  await press(add);
  assert.ok(byTestId(P.draw().tree, "lead-sheet-picker"), "the picker, a step of the same sheet");
});

test("a Needs review lead says so and offers Keep and Leave out; one left out says what stopped and offers Put back", async () => {
  reset();
  const review = page({ vm: vmOf({ member: { class: "review", fit: null, reason: "Couldn't check the email" } }) });
  let tree = review.draw().tree;
  assert.equal(textOf(byTestId(tree, "lead-sheet-word")), "To review");
  await press(byTestId(tree, "lead-sheet-keep"));
  await press(byTestId(tree, "lead-sheet-exclude"));
  assert.deepEqual(
    flashes.map((f) => f.msg),
    [`keep ${LEAD}`, `exclude ${LEAD}`],
  );
  reset();
  const out = page({
    vm: vmOf({
      member: { class: "excluded", fit: null, excluded_by: "chain", reason: "Part of Crunch Fitness, a chain" },
    }),
  });
  tree = out.draw().tree;
  assert.match(textOf(byTestId(tree, "lead-sheet-verdict")), /^Left out/, "the finder's own call, its verdict first");
  await press(byTestId(tree, "lead-sheet-put_back"));
  assert.deepEqual(
    flashes.map((f) => f.msg),
    [`put back ${LEAD}`],
  );
});

test("a lead whose email bounced is a call: No email, phone only, and its press rings from the owner's phone", async () => {
  reset();
  const P = page({ vm: vmOf({ email_state: "invalid" }) });
  const tree = P.draw().tree;
  assert.match(textOf(byTestId(tree, "lead-sheet-fact-mail")), /Phone only/, "the card says why it is a call");
  assert.equal(byTestId(tree, "lead-sheet-pick"), null, "no Add where no email can go");
  await press(byTestId(tree, "lead-sheet-call"));
  assert.deepEqual(dialled, ["tel:+15125550142"], "the dock's Call rings from the owner's phone");
  assert.deepEqual([P.st.armed.kind, P.st.armed.asked], ["call", false]);
});

test("an operator, a partner, a viewer and a role the page cannot read find no Erase in More: it is the owner's", () => {
  for (const role of ["operator", "partner", "viewer", null]) {
    reset();
    roleIs(role);
    const tree = page().draw().tree;
    assert.equal(kitItem(tree, "peek-more", LEAD_WORDS.erase.act), null, `${role}: no Erase`);
  }
});

test("no word the sheet says names the vendor, or a dollar", () => {
  reset();
  for (const email_state of ["ok", "catch_all", "unknown", "invalid", "none", "checking"]) {
    for (const cls of ["qualified", "review", "excluded"]) {
      const vm = vmOf({
        email_state,
        member: {
          class: cls,
          fit: cls === "qualified" ? "strong" : null,
          excluded_by: cls === "excluded" ? "chain" : null,
        },
      });
      const said = textOf(page({ vm }).draw().tree);
      assert.equal(
        /apify|compass|bounceverify|crawler|\$\d/i.test(said),
        false,
        `${email_state}/${cls}: ${said.slice(0, 120)}`,
      );
    }
  }
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

test("the owner's More offers Erase this lead; it asks first in contracts' words, and yes erases through the one door, closes the sheet and says it is gone", async () => {
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

test("I didn't call clears the question and posts nothing", async () => {
  reset();
  const courier = courierOf();
  const P = page({ courier, armed: { kind: "call", leadId: LEAD, asked: true, outcome: "voicemail", note: "" } });
  await press(byTestId(P.draw().tree, "peek-call-cancel"));
  assert.equal(P.st.armed, null);
  assert.deepEqual(courier.seen, []);
});

/* ========================================================= Not a fit ====== */

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

test("a lead found yesterday reads yesterday on the first night after the clocks go forward too", () => {
  // 00:30 on Monday 9 March 2026 in Chicago. Sunday was 23 hours long, so now less 24 hours was Saturday night: a find on
  // Sunday read "Mar 8", and one on Saturday night read "yesterday". Yesterday is the calendar's day before.
  const now = new Date("2026-03-09T05:30:00.000Z");
  const said = (found_at) => toLeadPeekVM(row({ found_at }), SEARCH, TZ, now).foundSummary;
  assert.match(said("2026-03-08T18:00:00.000Z"), /yesterday$/, "Sunday afternoon");
  assert.match(said("2026-03-08T04:00:00.000Z"), /Mar 7$/, "Saturday night");
});
