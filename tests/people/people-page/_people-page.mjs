/**
 * The world the tests of people-page/ share. Split by behaviour from people-honest.test.mjs on 25 Nov 2026 (layer 14: a
 * test file over 1,600 lines is two files); its header, as it was:
 *
 * Not named *.test.mjs on purpose: the runner globs that pattern.
 *
 */
/**
 * People: the list holds everyone, and says what it has.
 *
 * - A list, a count and a search covered the first thousand people the read returns, and every refresh dropped
 *   the rows Show more had added (the wiring audit's B7); past that, a search's matches from the server
 *   replaced the loaded rows, so a loaded person found by their last words vanished (B6).
 * - One failed read of the saved lists took the whole surface down: People, every profile and Lists (B27).
 * - A yes recorded for more than fifty went for fifty, and the rest were dropped without a word (B4).
 * - A list made on the rail closed with no word (B22); adding people to a list counted everyone selected,
 *   the ones already on it included, and could not be undone.
 * - Enter on a focused button opened the profile under the arrow keys' cursor instead of pressing it (B14).
 * Run against the surface over a fake wire, and the pages on a stub React whose effects re-run when their
 * inputs change.
 *
 * People's list page is TSX (surfaces/people/page/people-real.tsx, decision 0015 step 5): PeopleReal is drawn here as the
 * shell draws it, and every verb it takes (a list made, a yes recorded for many, a note, a view saved, a person added, a
 * search past the loaded rows) is the real one over the fake wire below, so a test says what the verb SENT, not what a
 * stand-in was told. The Leads scope, the person page and the ? sheet are still JSX and are loaded beside it.
 */
import { historyOf } from "../../shell/address/_address.mjs";
import { installRoleStore, kitPages, useStubHooks } from "../../_stub-react.mjs";
import { until } from "../../shared/_until.mjs";
import { CONSENT_SOURCES, ROLE_PERMS, mayReceive, offersYesRefusal, stateOf } from "@chanlytics/contracts";
import { hookFrames } from "../../_hook-frames.mjs";
import { importSrc } from "../../_source.mjs";
import { bridgeHolds, drawsInPlace, holdFrameParts, holdPeopleParts } from "../../shell/_bridge-holds.mjs";

export const TID = "t-salon";

export const ZONE = "America/New_York";

export const H = 3_600_000;

export const D = 24 * H;

export const NOW = Date.now();

export const iso = (ms) => new Date(NOW - ms).toISOString();

/** A person the People read returns, the shape people-vm.test.mjs pins (copied from broadcast-counts-are-whole.test.mjs). */
export const row = (over = {}) => ({
  id: "c1",
  display_name: "Daniela R.",
  wa_profile_name: "Dani",
  phone_e164: "+17865550181",
  consent: "opted_in",
  consent_source: "in_person",
  consent_updated_at: iso(D),
  marketing_consent: "opted_in",
  marketing_consent_source: "in_person",
  marketing_consent_updated_at: iso(D),
  dnc: false,
  channels: ["whatsapp"],
  conversation_count: 1,
  escalation_count: 0,
  needs_human: false,
  open_escalation_reason: null,
  open_escalation_since: null,
  latest_conversation_id: "cv1",
  latest_state: "open",
  latest_paused_until: null,
  latest_assignee_user_id: null,
  latest_snooze_until: null,
  latest_wa_inbound_at: iso(2 * H),
  last_message_at: iso(2 * H),
  last_message_direction: "inbound",
  last_message_sender: "customer",
  last_inbound_text: "Can I move Saturday to 11?",
  last_inbound_at: iso(2 * H),
  last_call_at: null,
  call_count: 0,
  call_seconds: 0,
  first_contact_at: iso(60 * D),
  earliest_row_at: iso(60 * D),
  has_backfill: false,
  has_chat: true,
  queued_reply_at: null,
  ...over,
});

export const person = (i, over = {}) =>
  row({
    id: `p${i}`,
    display_name: `Person ${i}`,
    wa_profile_name: null,
    phone_e164: `+1786555${1000 + i}`,
    latest_conversation_id: `cv${i}`,
    ...over,
  });

/* ------------------------------- the window ------------------------------- */

export const listeners = {};

/**
 * What is open over the page, as document.querySelector finds it: nothing, unless a test opens a menu or a dialog
 * ({ role }) in the app, or one outside it ({ role, inApp: false }), as a browser extension can add and hide. With
 * `className`, it carries those classes, and a selector that says `:not(.x)` of one of them leaves it out.
 */
export let overlayOpen = null;

export const storage = () => {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
};

globalThis.localStorage = storage();

globalThis.sessionStorage = storage();

globalThis.document = {
  body: {},
  activeElement: null,
  addEventListener() {},
  removeEventListener() {},
  getElementById: () => null,
  // A selector's part finds the open element when it names its role, and, for one outside the app, asks for no
  // .app-root; unless the part leaves out a class the element carries.
  // A part that opens with a class of its own (the kit's `.more-menu[role="menu"]` and `.sheet[role="dialog"]`, drawn on
  // the body) finds only an element that carries it.
  querySelector: (sel) =>
    overlayOpen &&
    sel.split(",").some((part) => {
      const classes = String(overlayOpen.className || "").split(/\s+/);
      const own = /^\s*\.([\w-]+)\[role=/.exec(part);
      return (
        part.includes(`[role="${overlayOpen.role}"]`) &&
        (overlayOpen.inApp !== false || !part.includes(".app-root")) &&
        (!own || classes.includes(own[1])) &&
        !classes.some((c) => c && part.includes(`:not(.${c})`))
      );
    })
      ? overlayOpen
      : null,
  createElement: () => ({ setAttribute() {}, style: {}, classList: { add() {}, remove() {} } }),
};

bridgeHolds(
  {
    who: {
      workspaces: [{ id: TID, slug: "salon", name: "Salon", status: "active", timezone: ZONE }],
      activeWorkspaceId: TID,
    },
  },
  { fresh: true },
);
globalThis.window = {
  // The address is the path (`/w/salon/people/seg:needs_you`), as the App Router leaves it; the route on screen is read
  // from it by bridge/workspace.ts routeOnScreen, and a page's own replace writes it (historyOf, below).
  location: {
    pathname: "/w/salon/people",
    search: "",
    hash: "",
    origin: "https://app.chanlytics.com",
    assign() {},
    replace() {},
    reload() {},
  },
  localStorage: globalThis.localStorage,
  sessionStorage: globalThis.sessionStorage,
  addEventListener: (type, fn) => {
    (listeners[type] ||= new Set()).add(fn);
  },
  removeEventListener: (type, fn) => {
    listeners[type]?.delete(fn);
  },
  dispatchEvent: (ev) => {
    for (const fn of [...(listeners[ev.type] || [])]) fn(ev);
    return true;
  },
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h),
};

export const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

export const quietly = async (fn) => {
  const e = console.error;
  console.error = () => {};
  try {
    return await fn();
  } finally {
    console.error = e;
  }
};

export const { peopleOverride, peopleSearch } = await quietly(
  () => import("../../../apps/dashboard/src/surfaces/people/surface.ts"),
);

export const { installClock } = await import("../../../apps/dashboard/src/bridge/zone.ts");

installClock();

export const { routeOnScreen } = await import("../../../apps/dashboard/src/bridge/workspace.ts");

export const { installTabMemory, clearTabMemory } = await import("../../../apps/dashboard/src/bridge/tab-memory.ts");

// A page's own replace (usePeopleAddress) writes the path, as the App Router leaves it, and fires nothing.
historyOf(globalThis.window);

/** The route on screen, `clients/seg:needs_you`: what the address says (workspace.ts routeOnScreen). */
export const routeNow = () => routeOnScreen(globalThis.window);

/** The address the page opens at: a route under the workspace (the frame's own words, `clients`). */
export const addressAt = (route) => {
  globalThis.window.location.pathname = `/w/salon/${route.replace(/^clients/, "people")}`;
};

/** Requests sent and not yet answered, over every wire: a save one test left in the air must not overlap the next test's read. */
export let inFlight = 0;

/**
 * Everyone over pages of `per`, the saved lists (or their read failing), what a search answers, the calendar's state, the
 * member's saved views and the booking link on file. What the page sends is recorded as it is sent, before anything is
 * awaited, so a test reads it as soon as its press returns: a view saved lands in `viewSaves`, every other write in
 * `writes` as { method, route, body } (the route as the client names it: `segments/s1`), each answered by
 * `seen.answer(request)` -- data, a Response, or a promise of either, which a test holds to land it later -- or, where that
 * gives nothing, as the server does by default: a view saved as sent, a list made as `s<n>`, a person added as `p9`, a batch
 * done for every id it was sent, else `{}`. A search is `seen.search(q)`: { people, total, has_more }, or { fail: message }.
 */
export const wire = ({
  people,
  per = 1000,
  lists = [],
  listsFail = false,
  search = null,
  calendar = "none",
  views = {},
  bookingLink = null,
  hasDeals = false,
  followUp = null,
  answer = null,
} = {}) => {
  const seen = { offsets: [], queries: [], viewSaves: [], writes: [], search, answer };
  const cal = { state: calendar, source: calendar === "ok" ? "Google Calendar" : "your calendar" };
  const made = () => seen.writes.filter((w) => w.method === "POST" && w.route === "segments").length;
  const byDefault = ({ method, route, body }) => {
    const saving = route.match(/^views\/([^/]+)$/);
    if (saving) return { views: { ...views, [saving[1]]: body.view } };
    if (method === "POST" && route === "segments") return { id: `s${made()}`, name: body.name, ids: [] };
    if (method === "POST" && route === "contacts") return { contact_id: "p9", existed: false };
    if (Array.isArray(body?.ids)) return { done: body.ids.length, failed: [], skipped: [] };
    return {};
  };
  const refuse = (status, code, message) => json(status, { ok: false, error: { code, message } });
  const serve = async (u, init) => {
    const method = init.method || "GET";
    const route = u.pathname.replace(/^\/api\/v1\//, "");
    if (method !== "GET") {
      const body = init.body ? JSON.parse(init.body) : null;
      const req = { method, route, body };
      const saving = route.match(/^views\/([^/]+)$/);
      if (saving) seen.viewSaves.push({ page: saving[1], view: body.view });
      else seen.writes.push(req);
      const given = seen.answer ? seen.answer(req) : undefined;
      const data = await (given === undefined ? byDefault(req) : given);
      return data instanceof Response ? data : json(200, { ok: true, data });
    }
    if (route === "contacts") {
      const q = u.searchParams.get("q");
      if (q !== null) {
        seen.queries.push(q);
        const found = seen.search ? await seen.search(q) : { people: [], total: 0, has_more: false };
        if (found.fail) return refuse(400, "invalid_input", found.fail);
        return json(200, {
          ok: true,
          data: {
            people: found.people,
            page: { q, offset: 0, limit: 1000, total: found.total, has_more: found.has_more },
            calendar: cal,
            booking_link: bookingLink,
            has_deals: hasDeals,
          },
        });
      }
      const offset = Number(u.searchParams.get("offset") || 0);
      seen.offsets.push(offset);
      return json(200, {
        ok: true,
        data: {
          people: people.slice(offset, offset + per),
          page: { q: null, offset, limit: per, total: people.length, has_more: offset + per < people.length },
          calendar: cal,
          booking_link: bookingLink,
          has_deals: hasDeals,
          ...(offset === 0 ? { follow_up: followUp } : {}),
        },
      });
    }
    if (route === "segments")
      return listsFail
        ? refuse(500, "internal", "The lists could not be read.")
        : json(200, { ok: true, data: { lists } });
    if (route === "views") return json(200, { ok: true, data: { views } });
    // A person read ahead of a press (warmPeople), who is not here.
    return refuse(404, "not_found", `no ${u.pathname}`);
  };
  globalThis.window.fetch = async (url, init = {}) => {
    inFlight += 1;
    try {
      return await serve(new URL(String(url), "https://app.chanlytics.com"), init);
    } finally {
      inFlight -= 1;
    }
  };
  return seen;
};

/* ----------------------------------- the pages ----------------------------------- */

export let cells = [];

export let idsMade = 0;

// Where each hook keeps its state: by the component that calls it, as React keeps it (_hook-frames.mjs).
export const frames = hookFrames();

export const effect = (fn, deps) => {
  const k = frames.key();
  const prev = cells[k];
  if (prev && deps && prev.deps && deps.length === prev.deps.length && deps.every((d, i) => Object.is(d, prev.deps[i])))
    return;
  if (prev && typeof prev.cleanup === "function") prev.cleanup();
  cells[k] = { deps, cleanup: undefined };
  cells[k].cleanup = fn();
};

export const flashes = [];

export const opened = [];

export const went = [];

globalThis.React = {
  Fragment: "Fragment",
  createElement: (type, p, ...kids) => {
    const props = { ...(p || {}), children: kids.flat(Infinity) };
    const node = { type, props };
    if (typeof type === "function") node.rendered = frames.render(type, props);
    return node;
  },
  cloneElement: (el, props) => ({ ...el, props: { ...el.props, ...props } }),
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
  // An id that stays with its component across draws and is no other's.
  useId: () => {
    const k = frames.key();
    if (!(k in cells)) cells[k] = `:r${(idsMade += 1).toString(36)}:`;
    return cells[k];
  },
  // An effect runs when its inputs change, after its last cleanup, the way React runs it; with no inputs, on every draw.
  useEffect: (fn, deps) => effect(fn, deps),
  useLayoutEffect: (fn, deps) => effect(fn, deps),
  // A store outside React, read at each draw: these tests draw by hand, so nothing is heard (useSurface, the toast).
  useSyncExternalStore: (_subscribe, snapshot) => snapshot(),
};

// A page that has left the shell is TSX and takes its hooks from the react module, which has none under this runner.
useStubHooks();

drawsInPlace();

// The hooks the TSX imports from the react module (it has none under this runner): the stub's own.
useStubHooks(globalThis.React);

holdFrameParts();

Object.assign(globalThis.window, kitPages);

for (const k of ["StatStrip", "StatCell", "EmptyState", "FailedRead", "StatePill", "mayAtLeast"])
  globalThis[k] = globalThis.window[k];

export const roles = installRoleStore();

// The role store's own answer to "may this member do it" (settings.jsx: ST_PERMS, which mirrors contracts' ROLE_PERMS), over the
// role acting now: a viewer cannot export, only an owner can. The store this harness made answers yes to everything, and the
// page reads the answer (canDo("export")), where the JSX also asked whether the shell had published an href for the file.
roles.can = (action) => !!ROLE_PERMS[roles.myRole()]?.[action];

/** The role store answers as `can` says until the returned restore: for a member the real roles never make. */
export const mayOnly = (can) => {
  const was = roles.can;
  roles.can = can;
  return () => {
    roles.can = was;
  };
};

// The kit's own menu and question, drawn as the page draws them: a test finds them by type (`n.type === MoreMenu`) and
// presses their items, which are their props.
globalThis.MoreMenu = kitPages.MoreMenu;

globalThis.Confirm = kitPages.Confirm;

// Leads' peek seams (surfaces/leads/peek/seams.ts, which this file does not load), as no-ops: People draws no peek, and the
// Leads scope a test here draws over it needs them named.
globalThis.leadArmOnReturn = () => () => undefined;

globalThis.leadPeekFocus = () => () => undefined;

bridgeHolds({ who: { me: { role: "owner" } }, parts: { chrome: { state: stateOf } } });
Object.assign(globalThis.window, {
  AttnRow: () => null,
  __consentSources: CONSENT_SOURCES,
  __offersYesSources: CONSENT_SOURCES.filter((s) => offersYesRefusal(s.id) === null),
  __mayReceive: mayReceive,
});
bridgeHolds({ doors: { navigate: (to) => went.push(to) } });
bridgeHolds({ parts: { toast: () => [null, (t) => flashes.push(t)] } });
// People's parts the frame draws with (the strip's scopes, the deal and step sheets), as People's courier hands them.
holdPeopleParts();

export const { PeopleReal } = await import("../../../apps/dashboard/src/surfaces/people/page/people-real.tsx");

// The peek beside the rows is a chunk of its own (peek/peek-code.tsx), fetched once the list is idle: in before any test.
await (await import("../../../apps/dashboard/src/surfaces/people/peek/peek-code.tsx")).peekCode();

export const { PeopleAddSheet } = await import("../../../apps/dashboard/src/surfaces/people/import/import-sheet.tsx");

export const { standingSaid } = await import("../../../apps/dashboard/src/surfaces/kit/head/standing.ts");

/** What the page said to the head beside the strip: a desk's Columns and Export, then Add people. */
export const headAct = () => standingSaid()?.act ?? null;

/** A browser that can watch a list's box, where the table draws a window of its rows (kit/rows/shown-rows.ts). */
export const watchingBoxes = () => {
  const kept = globalThis.ResizeObserver;
  globalThis.ResizeObserver = class {
    observe() {}
    disconnect() {}
  };
  return () => {
    globalThis.ResizeObserver = kept;
  };
};

// The person's lists are TSX (surfaces/people/person): they read People through the seam, which the override publishes.
export const { PersonLists } = await import("../../../apps/dashboard/src/surfaces/people/person/lists.tsx");

// A phone sheet's rows and a step's way back (surfaces/people/sheets/phone-sheet.tsx), which People and Leads import; the
// sheets themselves are the kit's Sheet (kit/sheet/sheet.tsx), read by their type and what the page hands them.
export const { PhoneSheetRow, jobBack } =
  await import("../../../apps/dashboard/src/surfaces/people/sheets/phone-sheet.tsx");

export const { Sheet } = await import("../../../apps/dashboard/src/surfaces/kit/sheet/sheet.tsx");

/**
 * A sheet of the page's while it is open, by its test id: the kit's Sheet, read by what the page hands it. Its Escape,
 * its wash and its pull down are Base UI's and the thumb reader's, driven in a browser (e2e/kit/kit-behaves.spec.ts);
 * each asks the page through `onClose`.
 */
export const openSheet = (tree, id) =>
  find(tree, (n) => n.type === Sheet && n.props.testid === id && n.props.open) ?? null;

// The kit's Menu, which the phone's bulk bar draws for Add to list (a node is found by its type).
export const { Menu } = await import("../../../apps/dashboard/src/surfaces/kit/menu/menu.tsx");

/** A bar's menu by its words, as the old MoreMenu's props read: the kit's Menu draws it, its trigger the page's Button, its groups
    headings over items; an item's act is `onSelect`, given here as `onClick` too. */
export const barMenuOf = (tree, words) => {
  const m = find(tree, (n) => n.type === Menu && textOf(n.props.trigger).trim() === words);
  const item = (i) => ({ ...i, onClick: i.onSelect });
  return (
    m && {
      props: {
        items: m.props.groups.flatMap((g) => [...(g.header ? [{ header: g.header }] : []), ...g.items.map(item)]),
      },
    }
  );
};

/** A menu's item by its words, as barMenuOf gives the menu. */
export const itemOf = (menu, label) => menu.props.items.find((i) => i.label === label);

// The shell's ? sheet, whose Esc is heard before People's.
// The shortcuts sheet (surfaces/frame/shortcuts.tsx), as the frame imports it.
export const shortcutsSheet = await importSrc("apps/dashboard/src/surfaces/frame/shortcuts.tsx");

/** A tree walked once per node: a drawn component is its children as it was given them and what it rendered, and the two share nodes. */
export const walk = (n, fn, seen = new Set()) => {
  if (n == null || typeof n !== "object" || seen.has(n)) return;
  seen.add(n);
  if (Array.isArray(n)) {
    for (const k of n) walk(k, fn, seen);
    return;
  }
  fn(n);
  for (const k of n.props?.children ?? []) walk(k, fn, seen);
  if (n.rendered) walk(n.rendered, fn, seen);
};

export const all = (tree, pred) => {
  const out = [];
  walk(tree, (n) => {
    if (pred(n)) out.push(n);
  });
  return out;
};

export const find = (tree, pred) => all(tree, pred)[0] ?? null;

export const byTestId = (tree, id) => find(tree, (n) => n.props?.["data-testid"] === id);

/** A node's words in reading order: what a drawn component rendered, else its children in turn. */
export const textOf = (n) => {
  if (n == null || typeof n === "boolean") return "";
  if (typeof n === "string" || typeof n === "number") return String(n);
  if (Array.isArray(n)) return n.map(textOf).join("");
  if (n.rendered !== undefined) return textOf(n.rendered);
  return (n.props?.children ?? []).map(textOf).join("");
};

export const tick = () => new Promise((r) => setTimeout(r, 0));

export const settle = async (n = 8) => {
  for (let i = 0; i < n; i += 1) await tick();
};

/**
 * Every request the page has sent is answered, and the ones it was waiting to send behind them have gone out and been
 * answered too (the view's saver sends the latest view the moment the one in flight lands, a few turns after the wire
 * counts it done): a save one test left in the air must not overlap the next test's read.
 */
export const drained = async () => {
  for (let quiet = 0, from = Date.now(); quiet < 3 && Date.now() - from < 5000;) {
    await tick();
    quiet = inFlight > 0 ? 0 : quiet + 1;
  }
};

/** A search's answer in the page's state, rows or refusal: the table is busy from the box's ask until then (`searching`). */
export const searchAnswered = () =>
  until(() => {
    const table = byTestId(draw(), "people-table-scroll");
    return !!table && table.props["aria-busy"] === undefined;
  }, "the search's answer is in the page");

/** The server's answer to a search the box sent: asked (after its wait), and its rows landed in the page's state. */
export const searchLanded = async (seen, from) => {
  await until(() => seen.queries.length > from, "the box asked the server");
  await drained();
  await searchAnswered();
};

/**
 * An act run until its toast is up, and the toast: a press can hand back nothing to wait on (Add to list is
 * `void a.addTo(s)`, Enter in the slips' note `void a.recordSlips()`), and an act has answered once it says so.
 */
export const toastAfter = async (act, what) => {
  const from = flashes.length;
  await act();
  await until(() => flashes.length > from, `the toast: ${what}`);
  return flashes.at(-1);
};

/** The views the page saved over the wire, as [page, view]: what the saver sent (plViewSaver over saveView). */
export const savedViews = (seen) => seen.viewSaves.map((s) => [s.page, s.view]);

/** The writes a wire saw to one route, as [method, route, body]: what the real verbs sent. */
export const wrote = (seen, match = () => true) =>
  seen.writes.filter((w) => match(w)).map((w) => [w.method, w.route, w.body]);

/** People published by the real surface over the wire, and a page with nothing drawn yet: no view remembered on this device and none saved over the wire, unless a test gives one. What the wire saw. */
export const freshPage = async ({
  people,
  lists: saved = [],
  listsFail = false,
  calendar = "none",
  views = {},
  bookingLink = null,
  hasDeals = false,
  search = null,
  answer = null,
} = {}) => {
  await drained();
  const seen = wire({ people, lists: saved, listsFail, calendar, views, bookingLink, hasDeals, search, answer });
  await quietly(() => peopleOverride.apply());
  cells = [];
  flashes.length = 0;
  opened.length = 0;
  for (const k of Object.keys(listeners)) delete listeners[k];
  globalThis.document.activeElement = null;
  overlayOpen = null;
  addressAt("clients");
  // The place a page keeps in the tab (tab-memory.ts, which PeopleReal always asks): none from an earlier test.
  clearTabMemory();
  globalThis.localStorage.removeItem("chanlytics-people-view");
  return seen;
};

export const draw = (props = {}) => {
  frames.begin();
  return PeopleReal({ onOpenProfile: (id) => opened.push(id), ...props });
};

/** Who a desk's peek beside the rows is open on, by its label, or null: on a desk a row's press opens the peek. */
export const peeked = () => byTestId(draw(), "person-peek")?.props["aria-label"] ?? null;

/**
 * A key as the window hears it: pressed in `target`, where focus is unless `focus` says where it went (a field's own
 * Esc can close the field, and focus with it, before the window hears the key), with `mods`: ctrlKey, metaKey, altKey,
 * repeat, or defaultPrevented when a listener before the page's took the key. Whether the page took it.
 */
export const press = (key, target = null, { focus = target, ...mods } = {}) => {
  globalThis.document.activeElement = focus;
  let taken = false;
  const ev = {
    key,
    target,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    repeat: false,
    defaultPrevented: false,
    ...mods,
    preventDefault() {
      taken = true;
      ev.defaultPrevented = true;
    },
  };
  for (const fn of [...(listeners.keydown || [])]) fn(ev);
  return taken;
};

/* ------------------------------ the lists, on People (#563) ------------------------------ */

// A click, as a mouse gives it: `press` above is the keyboard.
export const click = (node) => node.props.onClick({ stopPropagation() {}, preventDefault() {} });

// A heading's sort: the button in the cell (a keyboard reaches it), found by its words.
export const sortByHeading = (tree, label) =>
  click(
    find(
      tree,
      (n) =>
        n.type === "button" && /\bdtable-sort\b/.test(String(n.props?.className || "")) && textOf(n).startsWith(label),
    ),
  );

/* ------------------------------ People on a phone (the phone pass, 22 Sep) ------------------------------ */

/** A phone's width for the page's life: set before the first draw, as a phone opens the page. */
export const onPhone = async (fn) => {
  globalThis.window.matchMedia = (q) => ({ matches: q === "(max-width: 900px)" });
  try {
    return await fn();
  } finally {
    delete globalThis.window.matchMedia;
  }
};

export const idsShown = (tree) => all(tree, (n) => n.type === "tr" && n.props?.id).map((n) => n.props.id);

/** Whether anything in the tree is a strip of views: the frame's (SurfaceTabs) draws it, and no page does. */
export const drawsAStrip = (tree) =>
  !!byTestId(tree, "people-scope") ||
  all(tree, (n) =>
    String(n.props?.className || "")
      .split(" ")
      .includes("stabs"),
  ).length > 0;

/** The phone bar's Sort, its items as the page built them: a set of choices (the sorts) as items ticked or not. */
export const sortMenuOf = (tree) =>
  find(byTestId(tree, "people-phone-bar"), (n) => n.type === Menu).props.groups.flatMap((g) =>
    g.choose
      ? g.choose.options.map((o) => ({
          label: o.label,
          checked: g.choose.value === o.value,
          onClick: () => g.choose.onChoose(o.value),
        }))
      : g.items.map((i) => ({ ...i, onClick: i.onSelect })),
  );

/** The open list's acts at the foot of the Lists sheet, opened from the bar: each row's words and its press. */
export const listActsOf = (opts) => {
  click(byTestId(draw(opts), "people-phone-lists"));
  return all(byTestId(draw(opts), "people-list-acts") ?? { props: {} }, (n) =>
    String(n.props?.testid ?? "").startsWith("people-list-act-"),
  ).map((r) => ({ label: r.props.label, onClick: r.props.onClick }));
};

/** The bar's Select, whichever word it says now: the one `data-on` of the three it holds for the morph. */
export const selectWord = (tree) =>
  textOf(find(byTestId(tree, "people-phone-select"), (n) => n.props?.["data-on"] === "")).trim();

/** The dock's name says the count (Ruben, 10 Oct 2026: the count left the row). */
export const dockSays = (tree) => byTestId(tree, "bulk-bar").props["aria-label"];

/** A class token, whole: pp-sheet-row, not pp-sheet-row-words. */
export const hasClass = (n, c) =>
  String(n?.props?.className || "")
    .split(/\s+/)
    .includes(c);

/** The sheet's rows, in order, by their test ids. */
export const sheetRows = (sheet) =>
  all(sheet, (n) => n.type === "button" && hasClass(n, "pp-sheet-row")).map((n) => n.props["data-testid"]);

/** A phone's selection of p1 and p2 by their faces, and its More opened. */
export const bulkSheetOpen = () => {
  byTestId(rowOf(draw(), "p1"), "row-select").props.onChange();
  byTestId(rowOf(draw(), "p2"), "row-select").props.onChange();
  click(byTestId(draw(), "bulk-more"));
  return draw();
};

/** The dock's acts, in order, by their test ids (a component and what it draws name one act once). */
export const dockActIds = (bar) => [
  ...new Set(all(bar, (n) => hasClass(n, "pp-bulk-act")).map((n) => n.props["data-testid"])),
];

// Decision 0009, phase 4b: a smart list's rule is seen and changed, and a view with a rule is kept as one.
export const TEXTERS = { all: [{ field: "channel", op: "is", channel: "whatsapp" }] };

/* ------------------------- the table, drawn from its columns (Phase 0) ------------------------- */

/**
 * The table's headings as a desktop shows them: the columns it built (a column turned off is not built at all, so there is
 * no mark to leave out), the checkbox's left out and the actions' too (its word is a screen reader's alone), the sort arrow
 * and the idle caret off.
 */
export const headings = (tree) =>
  all(tree, (n) => n.type === "th" && n.props?.["data-key"] && n.props["data-key"] !== "actions")
    .map((th) => textOf(th).replace(/[▲▼↕]/g, "").trim())
    .filter(Boolean);

/** A person's row, by their id. */
export const rowOf = (tree, id) => find(tree, (n) => n.type === "tr" && n.props?.id === `person-${id}`);

/* ------------------------- the keys: where they were pressed, and what is open ------------------------- */

/** An element as a key's target or focus: its tag, its type, and the selectors it matches or sits inside, for `closest`. */
export const element = (tagName, { type = "", within = [] } = {}) => ({
  nodeType: 1,
  tagName,
  type,
  isContentEditable: false,
  closest: (sel) => (within.some((s) => sel.includes(s)) ? {} : null),
});

export const BODY = element("BODY");

/** The row under the keyboard's cursor, by its id. */
export const cursorRow = (tree) =>
  find(tree, (n) => n.type === "tr" && /\bfocused\b/.test(n.props?.className || ""))?.props.id ?? null;

/**
 * The Columns menu (people/table/columns-menu.tsx): the kit's Menu named Columns, one group of switches under its heading.
 * Its opening, its staying open while a switch flips, Person's refusal of a press and its Esc are Base UI's, driven in a
 * browser by e2e/kit/kit-behaves.spec.ts ("a menu of switches"); here, what the page hands it and what a flip does.
 */
export const columnsMenu = () => find(headAct(), (n) => n.type === Menu && n.props.label === "Columns");

export const switches = (tree) => columnsMenu(tree).props.groups.find((g) => g.toggles).toggles;

/** Its switches: which column, whether it shows, and whether it is Person's, which always does; one flipped as Base UI does. */
export const menuItems = (tree) =>
  switches(tree).items.map((t) => ({
    key: t.value,
    on: t.on,
    locked: t.locked === "Always",
  }));

export const flipColumn = (tree, key) => switches(tree).onToggle(key);

/**
 * Saves the test lands by hand: each call waits in the list, with the view it carried, until the test lands it (with
 * { ok: true }, or { ok: false, message } for the route's refusal): the wire holds the answer.
 */
export const heldSaves = (seen) => {
  const calls = [];
  seen.answer = ({ route, body }) =>
    route.startsWith("views/")
      ? new Promise((answered) =>
          calls.push({
            page: route.slice("views/".length),
            view: JSON.parse(JSON.stringify(body.view)),
            land: (r) =>
              answered(
                r.ok ? { views: {} } : json(500, { ok: false, error: { code: "internal", message: r.message } }),
              ),
          }),
        )
      : undefined;
  return calls;
};

/* ------------------------- the bulk bar, on the people shown (Phase 0) ------------------------- */

/**
 * The bar's Export, drawn and its file caught (the page saves it through the browser: an anchor clicked, a blob read
 * back). Each file it makes lands in `blobs`, and `restore` puts the window back.
 */
export const catchExports = () => {
  const blobs = [],
    was = { url: URL.createObjectURL, make: globalThis.document.createElement };
  URL.createObjectURL = (b) => {
    blobs.push(b);
    return was.url(b);
  };
  globalThis.document.createElement = () => ({ click() {}, remove() {} });
  globalThis.document.body.appendChild = () => {};
  return {
    blobs,
    restore: () => {
      URL.createObjectURL = was.url;
      globalThis.document.createElement = was.make;
      delete globalThis.document.body.appendChild;
    },
  };
};

/** Who is in a file the bar made: each row's first cell, the name, under the heading row. A cell is quoted only when it must be (csvCell). */
export const csvFirst = (line) => {
  const m = /^"((?:[^"]|"")*)"/.exec(line);
  return m ? m[1].replace(/""/g, '"') : line.split(",")[0];
};

export const exportedNames = async (blob) => (await blob.text()).split("\r\n").slice(1).map(csvFirst);

/** Sets the world's `cells` for a test, as its assignment did: a module that imports a binding cannot assign it. */
export const setCells = (value) => (cells = value);

/** Sets the world's `overlayOpen` for a test, as its assignment did: a module that imports a binding cannot assign it. */
export const setOverlayOpen = (value) => (overlayOpen = value);
