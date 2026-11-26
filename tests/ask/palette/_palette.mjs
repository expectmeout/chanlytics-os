/**
 * The world the tests of palette/ share. Split by behaviour from ask-palette.test.mjs on 25 Nov 2026 (layer 14: a test
 * file over 1,600 lines is two files); its header, as it was:
 *
 * Not named *.test.mjs on purpose: the runner globs that pattern.
 *
 */
/**
 * Ask as the Line (docs/superpowers/specs/2026-09-23-ask-the-line-design.md, section 6): what it shows at rest, how a
 * conversation folds above the line and ends at Clear, how Esc stops an answer, how a held Space talks; and what the
 * palette it replaced was fixed for, kept:
 * - A seeded question opened an empty palette: the shell opens the Line and sends in the same moment, and the palette
 *   listened only once it was open (the wiring audit's N3).
 * - A conversation was deleted by a hover × with no question and no Undo, and no key reached the × (N5).
 * - ⌘K "calendar" offered only to ask about it: the jump list stopped at the pages that were real before the
 *   Calendar, Lists, Campaigns, Setup, Billing and Activity shipped (N18).
 * Run against the Line (surfaces/ask/) and its parts on a stub React whose effects run after their component returns, as React's
 * do, over the bridge's real palette, quick answers and speech and a recorded stand-in for the Ask routes.
 */
import assert from "node:assert/strict";
import { importSrc } from "../../_source.mjs";
import { legacyAddress } from "../../shell/address/_address.mjs";
import { kitPages, unrefIntervals, useStubHooks } from "../../_stub-react.mjs";
import {
  ROLE_PERMS,
  answerBlocks,
  answerCopy,
  answerRuns,
  answerSpoken,
  answerText,
  cardOpenRoute,
  isTypingTarget,
  LeadSearchPlanSchema,
  planSentence,
} from "@chanlytics/contracts";
import { bridgeHolds } from "../../shell/_bridge-holds.mjs";

export const { askCalls, holdAsk } = await importSrc("apps/dashboard/src/surfaces/frame-verbs.ts");

// The seam the Leads chips read (the leads surface; a window mirror, `__LEADS`, until 12 Nov 2026).
export const { setSurfaceValue } = await importSrc("apps/dashboard/src/surfaces/surface-values.ts");

/* ---------------------------------- the window ---------------------------------- */

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
  body: { appendChild() {} },
  activeElement: null,
  addEventListener() {},
  removeEventListener() {},
  getElementById: () => null,
  querySelector: () => null,
  createElement: () => ({ setAttribute() {}, style: {}, classList: { add() {}, remove() {} } }),
};

/** The window's listeners: events really travel here, because when the palette listens is what N3 is about. */
export const heard = new Map();

// A turn in flight keeps its clock on an interval (surfaces/ask/home.tsx useAskElapsed), which the stub never clears.
unrefIntervals();

globalThis.window = {
  location: {
    pathname: "/w/studio",
    hash: "#/today",
    search: "",
    origin: "https://app.chanlytics.com",
    assign() {},
    replace() {},
    reload() {},
  },
  history: { replaceState() {} },
  localStorage: globalThis.localStorage,
  sessionStorage: globalThis.sessionStorage,
  matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  addEventListener: (type, fn) => {
    if (!heard.has(type)) heard.set(type, new Set());
    heard.get(type).add(fn);
  },
  removeEventListener: (type, fn) => {
    if (heard.has(type)) heard.get(type).delete(fn);
  },
  dispatchEvent: (ev) => {
    for (const fn of [...(heard.get(ev.type) || [])]) fn(ev);
    return true;
  },
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h),
  ST_STORE: { can: (a) => !!(ROLE_PERMS.owner || {})[a], myRole: () => "owner" },
};

/* ------------------------------ a stub React ------------------------------ */

// Hooks are kept per component, by the component's place in the tree and its type. A component's effects run once it
// has returned, as React's do: the palette's effects reach functions it declares below its hooks. A setter marks the
// page changed, and `settle` draws again until nothing changes.
export let cells = new Map();

export let frames = [];

export let dirty = false;

export let lastTree = null;

export const frameFor = (key) => ({ key, hook: 0, kids: {}, effects: [] });

// One setter a cell of a world, as React keeps one for a state's life: an effect that names it runs again for nothing else. A
// timer of a world already gone (a toast's) sets nothing, as React does for what it no longer draws, whatever stands there now.
export const setters = new WeakMap();

export const setterOf = (k, world = cells) => {
  const own = setters.get(world) ?? setters.set(world, new Map()).get(world);
  if (!own.has(k)) {
    own.set(k, (v) => {
      if (world !== cells || !cells.has(k)) return;
      cells.set(k, typeof v === "function" ? v(cells.get(k)) : v);
      dirty = true;
    });
  }
  return own.get(k);
};

export const slot = () => {
  const f = frames[frames.length - 1];
  return `${f.key}#${f.hook++}`;
};

export const same = (a, b) => !!a && !!b && a.length === b.length && a.every((d, i) => Object.is(d, b[i]));

export const memo = (make, deps) => {
  const k = slot();
  const was = cells.get(k);
  if (!was || !deps || !same(was.deps, deps)) cells.set(k, { value: make(), deps });
  return cells.get(k).value;
};

export const runEffects = (frame) => {
  for (const { k, fn, deps } of frame.effects) {
    const prev = cells.get(k);
    if (prev && deps && same(prev.deps, deps)) continue;
    if (prev && typeof prev.cleanup === "function") prev.cleanup();
    const cell = { deps, cleanup: undefined };
    cells.set(k, cell);
    cell.cleanup = fn();
  }
};

export const effect = (fn, deps) => {
  const f = frames[frames.length - 1];
  f.effects.push({ k: slot(), fn, deps });
};

globalThis.React = {
  Fragment: "Fragment",
  createElement: (type, p, ...kids) => {
    const props = { ...(p || {}), children: kids.flat(Infinity) };
    const node = { type, props };
    if (typeof type === "function") {
      const parent = frames[frames.length - 1];
      const name = type.name || "anon";
      parent.kids[name] = (parent.kids[name] || 0) + 1;
      const frame = frameFor(`${parent.key}/${name}:${parent.kids[name]}`);
      frames.push(frame);
      try {
        node.rendered = type(props);
      } finally {
        frames.pop();
      }
      runEffects(frame);
    }
    return node;
  },
  useState: (init) => {
    const k = slot();
    if (!cells.has(k)) cells.set(k, typeof init === "function" ? init() : init);
    return [cells.get(k), setterOf(k)];
  },
  useReducer: (red, init) => {
    const k = slot();
    if (!cells.has(k)) cells.set(k, init);
    return [
      cells.get(k),
      (a) => {
        cells.set(k, red(cells.get(k), a));
        dirty = true;
      },
    ];
  },
  useRef: (init) => {
    const k = slot();
    if (!cells.has(k)) cells.set(k, { current: init });
    return cells.get(k);
  },
  useMemo: (fn, deps) => memo(fn, deps),
  useCallback: (fn, deps) => memo(() => fn, deps),
  useEffect: effect,
  useLayoutEffect: effect,
  // A store outside React (the bar's line reads what the page said, page-search.ts): what it holds as the draw is made.
  useSyncExternalStore: (_subscribe, snapshot) => snapshot(),
  useId: () => {
    const k = slot();
    if (!cells.has(k)) cells.set(k, `id-${k}`);
    return cells.get(k);
  },
  Children: { map: (kids, fn) => [].concat(kids ?? []).map(fn), toArray: (kids) => [].concat(kids ?? []) },
  isValidElement: (n) => !!n && typeof n === "object" && "type" in n && "props" in n,
  cloneElement: (n, p) => ({ ...n, props: { ...n.props, ...p } }),
};

globalThis.ReactDOM = { createPortal: (node) => node };

(await import("../../../apps/dashboard/src/surfaces/frame/frame-globals.ts")).installFrameGlobals();

// Confirm is the kit's (surfaces/kit/confirm), which seed-globals publishes as window.Confirm, over this file's own React.
useStubHooks(globalThis.React);

globalThis.Confirm = globalThis.window.Confirm = kitPages.Confirm;

Object.assign(globalThis.window, {
  CHANLY: { nav() {}, R: {}, address: await legacyAddress() },
});

// The Line and its parts (surfaces/ask/), by their modules. Ask's face in the line (kit/face/ask-face.tsx) is drawn in every
// case; it moves only where a case installs the bridge.
export const { askText } = await import("../../../apps/dashboard/src/surfaces/ask/words.ts");

export const hookKit = await import("../../../apps/dashboard/src/surfaces/ask/hooks.ts");

export const AskHooks = {
  ...hookKit,
  pinNow: hookKit.ahPinNow,
  pinTop: hookKit.ahPinTop,
  latestShown: hookKit.ahLatestShown,
  slide: hookKit.ahSlide,
  slideFrom: hookKit.ahSlideFrom,
  panelKeys: hookKit.ahPanelKeys,
  openOver: hookKit.AH_OPEN_OVER,
};

export const AskHome = await import("../../../apps/dashboard/src/surfaces/ask/home.tsx");

export const AskAnswerKit = {
  ...(await import("../../../apps/dashboard/src/surfaces/ask/turn.tsx")),
  ...(await import("../../../apps/dashboard/src/surfaces/ask/card.tsx")),
  ...(await import("../../../apps/dashboard/src/surfaces/ask/card-parts.tsx")),
};

export const { AskReal } = await import("../../../apps/dashboard/src/surfaces/ask/line/line.tsx");

export const hookParts = await import("../../../apps/dashboard/src/surfaces/ask/line/under.ts");

export const { AskDisc } = await import("../../../apps/dashboard/src/surfaces/kit/face/ask-face.tsx");

export const { askPalette, quickAnswer, surfaceFor } =
  await import("../../../apps/dashboard/src/bridge/ask/palette.ts");

export const { askSpeech } = await import("../../../apps/dashboard/src/bridge/ask/speech.ts");

export const { askAloud } = await import("../../../apps/dashboard/src/bridge/ask/aloud.ts");

export const { askFollowUps, FOLLOW_UPS_EVENT } = await import("../../../apps/dashboard/src/bridge/ask/follow-ups.ts");

export const { askColumn } = await import("../../../apps/dashboard/src/bridge/ask/column.ts");

export const { askApi } = await import("../../../apps/dashboard/src/bridge/ask/api.ts");

export const { MASCOT } = await import("../../../apps/dashboard/src/bridge/mascot/index.ts");

export const { clearTabMemory, tabMemoryFor } = await import("../../../apps/dashboard/src/bridge/tab-memory.ts");

/** The kit's glyph, as a page draws it: a test reads its name. */
export const isIcon = (n) => n.type?.name === "Icon";

export const walk = (n, fn) => {
  if (n == null || typeof n !== "object") return;
  if (Array.isArray(n)) {
    for (const k of n) walk(k, fn);
    return;
  }
  fn(n);
  walk(n.props?.children, fn);
  walk(n.rendered, fn);
};

/** The kit's presses and field, which hand what they are given to the element they draw: that element is what is read. */
export const HANDS_ON = new Set(["Button", "LineField", "LinePress", "Press"]);

// A drawn component is walked twice, as the children it was given and as what it rendered: each node counts once.
export const all = (tree, pred) => {
  const out = [];
  const seen = new Set();
  walk(tree, (n) => {
    if (!seen.has(n) && !HANDS_ON.has(n.type?.name) && pred(n)) {
      seen.add(n);
      out.push(n);
    }
  });
  return out;
};

export const find = (tree, pred) => all(tree, pred)[0] ?? null;

export const byTestId = (tree, id) => find(tree, (n) => n.props?.["data-testid"] === id);

export const byClass = (tree, cls) =>
  all(tree, (n) =>
    String(n.props?.className || "")
      .split(" ")
      .includes(cls),
  );

export const textOf = (n) => {
  if (n == null || typeof n === "boolean") return "";
  if (typeof n === "string" || typeof n === "number") return String(n);
  if (Array.isArray(n)) return n.map(textOf).join("");
  if (n.rendered !== undefined) return textOf(n.rendered);
  return textOf(n.props?.children);
};

export const pressOf = (k) => ({
  key: k,
  prevented: false,
  stopped: false,
  currentTarget: { control: true },
  preventDefault() {
    this.prevented = true;
  },
  stopPropagation() {
    this.stopped = true;
  },
});

export const press = (node) => {
  const e = pressOf();
  node.props.onClick(e);
  return e;
};

export const flush = () => new Promise((r) => setImmediate(r));

/** Wait for a condition, never for a length of time: on as soon as `ok()` holds, a failure only at the ceiling. */
export const until = async (ok, what, ceilingMs = 2000) => {
  const end = Date.now() + ceilingMs;
  while (!ok()) {
    if (Date.now() > end) assert.fail(`${what}: not within ${ceilingMs}ms`);
    await new Promise((r) => setTimeout(r, 5));
  }
};

export const draw = (C, props) => {
  const root = frameFor("root");
  frames = [root];
  dirty = false;
  lastTree = C(props);
  frames = [];
  runEffects(root);
  return lastTree;
};

export const render = (C, props) => {
  cells = new Map();
  return draw(C, props);
};

export const settle = (C, props) => {
  for (let i = 0; dirty && i < 20; i++) draw(C, props);
  return lastTree;
};

/** Let the stand-in's promises land, then draw what they changed. */
export const later = async (C, props) => {
  for (let i = 0; i < 6; i++) {
    await flush();
    settle(C, props);
  }
  return lastTree;
};

/* ------------------------------ the palette ------------------------------ */

// The Line itself, as the frame's AskBar draws it once its chunk is in (bridge/ask/line.tsx).
export const Palette = (props) => AskReal(props);

export const OPEN = { open: true, onClose() {} };

export const CLOSED = { open: false, onClose() {} };

/** The shell's open landing: the palette drawn open, and what it asked for on the way. */
export const opens = async () => {
  draw(Palette, OPEN);
  return later(Palette, OPEN);
};

export const closes = async () => {
  draw(Palette, CLOSED);
  return later(Palette, CLOSED);
};

export const inputOf = (tree) => byTestId(tree, "ask-input");

export const typed = (tree, words) => inputOf(tree).props.onChange({ target: { value: words } });

export const keyed = (tree, k) => inputOf(tree).props.onKeyDown(pressOf(k));

export const sent = (type, detail) => globalThis.window.dispatchEvent(new CustomEvent(type, { detail }));

/** ⌘J, pressed anywhere in the Line: the window hears it, wherever the focus is. */
export const cmdJ = () => {
  const e = { ...pressOf("j"), type: "keydown", metaKey: true, defaultPrevented: false };
  globalThis.window.dispatchEvent(e);
  return e;
};

/** A conversation as the Ask routes list it (contracts' AskThreadVM). */
export const TH = (n) => ({
  id: `aaaaaaaa-aaaa-4aaa-8aaa-00000000000${n}`,
  title: `Question ${n}`,
  last_at_ms: Date.now() - n * 3_600_000,
  scope: null,
});

/** An answer as the routes return one (contracts' AskMessageVM). */
export const said = (id, text) => ({
  id,
  role: "assistant",
  text,
  at_ms: Date.now(),
  failed: false,
  citations: [],
  followups: [],
  proposals: [],
});

/**
 * Ask as the bridge installs it: the real palette, quick answers and speech over this window, and a recorded stand-in
 * for the routes that go out (the threads, one thread, a deletion, a turn, a quick answer kept, the openings).
 */
export const ask = (threads = []) => {
  const calls = { deleted: [], sent: [], opened: [], inputs: [], kept: [] };
  let list = [...threads];
  const palette = askPalette(globalThis.window, globalThis.localStorage);
  const openings = async () => ({ state: "no_calendar", days: [] });
  const bridge = {
    surfaceFor,
    ...palette,
    // The one-way speech, over a route nothing answers here: a test that reads aloud stubs speak/canSpeak itself.
    ...askSpeech(globalThis.window, { api: { speech: async () => new Blob() } }),
    quick: quickAnswer(palette, openings),
    answerText,
    answerBlocks,
    answerRuns,
    answerCopy,
    answerSpoken,
    cardOpenRoute,
    threads: async () => list,
    thread: async (id) => {
      calls.opened.push(id);
      const th = list.find((x) => x.id === id);
      return th
        ? {
            thread: th,
            messages: [
              {
                id: `u-${id}`,
                role: "user",
                text: th.title,
                at_ms: th.last_at_ms,
                citations: [],
                followups: [],
                proposals: [],
              },
              said(`a-${id}`, `The answer to ${th.title}.`),
            ],
          }
        : { missing: true };
    },
    deleteThread: async (id) => {
      calls.deleted.push(id);
      list = list.filter((x) => x.id !== id);
      return true;
    },
    send: async (input) => {
      calls.sent.push(input.text);
      calls.inputs.push(input);
    },
    // POST ask/quick: the thread named, else a new one at the top of the list.
    keepQuick: async (input) => {
      calls.kept.push(input);
      if (input.threadId) return list.find((x) => x.id === input.threadId) ?? null;
      const th = {
        id: `cccccccc-cccc-4ccc-8ccc-00000000000${calls.kept.length}`,
        title: input.text,
        last_at_ms: Date.now(),
        scope: null,
      };
      list = [th, ...list];
      return th;
    },
    openings,
  };
  // A held question's answer read aloud, composed as installAsk composes it, over the speech a test stubs on this
  // bridge: a timer one test leaves reaches its own stub, never a later test's.
  Object.assign(
    bridge,
    askAloud({
      speak: (text, purpose) => bridge.speak(text, purpose),
      state: () => bridge.state(),
      watchSpeech: (on) => bridge.watchSpeech(on),
    }),
  );
  clearTabMemory(globalThis.window.sessionStorage);
  holdAsk(bridge);
  return calls;
};

/* ------------------------------ the Line ------------------------------ */

// Today's queue as the Line reads it: a person waiting and a search waiting, so Right now has its two pills.
export const askQueue = () => ({
  queue: {
    rows: [
      {
        id: "q1",
        kind: "handoff",
        conversationId: "c1",
        callId: null,
        who: "Nora",
        channel: "WhatsApp",
        when: "waited 2h",
        sentence: "Can I come at 3?",
        quoted: true,
        cta: { label: "Reply", to: "inbox/th-c1" },
      },
      {
        id: "q-s-s1",
        kind: "search",
        conversationId: null,
        callId: null,
        who: "personal trainers",
        channel: "Leads",
        when: "waited 3h",
        sentence: "Most of the first 25 are gyms, not trainers. Keep them?",
        quoted: false,
        cta: { label: "Answer", to: "clients/leads:s-s1:c-excluded" },
      },
    ],
    // The queue counts the search among those waiting; it is not a person, so it is not "1 more".
    waiting: 2,
  },
});

/* ------------------------------ Ask's follow-ups, come due (the closed-loop read, 17 Oct 2026) */

/** A follow-up that came due, as GET ask/follow-ups answers it. */
export const DUE = (
  id,
  prompt = `The ${id} search finished: pick the best leads and propose a cold email to them.`,
) => ({
  id,
  said: `When the ${id} search finishes, I'll pick the best and draft the emails`,
  prompt,
});

/* ------------------------------ the takeover (a phone) ------------------------------ */

/** A phone: the window's width query answers true, and history records what the Line pushes and takes back. */
export const phoneWindow = () => {
  const mm = globalThis.window.matchMedia;
  const hist = globalThis.window.history;
  const log = [];
  globalThis.window.matchMedia = (q) => ({
    matches: q === "(max-width: 720px)",
    addEventListener() {},
    removeEventListener() {},
  });
  globalThis.window.history = {
    replaceState() {},
    pushState: (s, t, u) => log.push(["push", s, u]),
    back: () => {
      log.push(["back"]);
      globalThis.window.dispatchEvent(new Event("popstate"));
    },
  };
  globalThis.window.location.href = "https://app.chanlytics.com/w/studio#/today";
  return {
    log,
    restore: () => {
      globalThis.window.matchMedia = mm;
      globalThis.window.history = hist;
      delete globalThis.window.location.href;
    },
  };
};

/** The Line open, and how many times it was closed. */
export const lineCounted = async () => {
  ask([]);
  bridgeHolds({ parts: { chrome: { typing: (t) => isTypingTarget(t?.tagName, !!t?.isContentEditable) } } });
  const line = { closed: 0 };
  const props = { open: true, onClose: () => (line.closed += 1) };
  render(Palette, props);
  line.tree = await later(Palette, props);
  line.again = () => later(Palette, props);
  line.redraw = () => draw(Palette, props);
  return line;
};

/** Where a key was pressed in the page: a row, unless a case says otherwise. */
export const inPage = (over = {}) => ({ nodeType: 1, tagName: "TR", ...over });

/** An Esc pressed outside the panel: the window hears it, from where it was pressed. */
export const escBeside = (target = inPage(), took = false) =>
  globalThis.window.dispatchEvent({ ...pressOf("Escape"), type: "keydown", target, defaultPrevented: took });

/* ------------------------------ a phone's thread (2026-09-27-ask-chat-on-a-phone) ------------------------------ */

/** The newest turn's part of a phone's thread: its question, the three and its answer. */
export const nowOf = (tree) => byClass(tree, "ask-now")[0];

/** A v2 answer with next questions, as the routes return one. */
export const withNext = (n) => ({
  v: 2,
  form: "structured",
  say: { headline: `Answer ${n}.`, detail: "" },
  show: { figures: [], items: [], breakdown: null },
  do: { open: null, next: [`Follow ${n} up?`] },
  language: "en",
});

/** Ask a question the way a thumb does: the words typed, then Enter. */
export const asks = async (tree, props, q) => {
  typed(tree, q);
  tree = await later(Palette, props);
  keyed(tree, "Enter");
  return later(Palette, props);
};

/** Ask's voice stood in for (bridge/ask/speech.ts as the Line reads it off window.__ask): the clip lands when the test says. */
export const speechStub = () => {
  const spoken = [];
  let stops = 0;
  let state = "idle";
  const watchers = new Set();
  const move = (s) => {
    state = s;
    for (const w of watchers) w();
  };
  let land = null;
  let fail = null;
  const stub = {
    canSpeak: () => true,
    state: () => state,
    watchSpeech: (on) => {
      watchers.add(on);
      return () => watchers.delete(on);
    },
    speak: (text, purpose) => {
      spoken.push({ text, purpose });
      move("loading");
      return new Promise((resolve, reject) => {
        land = () => {
          move("speaking");
          resolve();
        };
        fail = (why) => {
          move("idle");
          reject(new Error(why));
        };
      });
    },
    stopSpeaking: () => {
      stops += 1;
      move("idle");
    },
  };
  return {
    stub,
    spoken,
    get stops() {
      return stops;
    },
    land: () => land && land(),
    fail: (why) => fail && fail(why),
    ends: () => move("idle"),
  };
};

/** A recogniser the test speaks through, and a press of the mic as the pointer gives it: the voice tests' world. */
export const holdWorld = () => {
  const recs = [];
  globalThis.window.SpeechRecognition = class {
    constructor() {
      recs.push(this);
    }
    start() {}
    stop() {
      this.onend();
    }
  };
  const hears = (rec, words) => {
    const r = [{ transcript: words }];
    r.isFinal = true;
    rec.onresult({ results: [r] });
  };
  const down = () => ({ ...pressOf(), pointerId: 7, currentTarget: { setPointerCapture: () => {} } });
  return { recs, hears, down };
};

/** A turn the test runs: the thread named as it starts, every event when the test says, over when the test says. */
export const heldTurns = (calls) => {
  const turn = { on: null, end: null };
  const send = (input, on) => {
    calls.sent.push(input.text);
    turn.on = on;
    on({ t: "thread", id: TH(5).id, title: input.text });
    return new Promise((resolve) => {
      turn.end = resolve;
    });
  };
  return { turn, send };
};

/* ------------------------------ the Leads surface ------------------------------ */

// A search's plan as the route returns it on a lead_search card: the finder's own shape (leads-finder.test.mjs CARD).
export const LEAD_PLAN = LeadSearchPlanSchema.parse({
  version: 1,
  card: "local_businesses",
  name: "personal trainers",
  asked: "200 personal trainers in Austin with a website",
  terms: ["personal trainer", "strength coach", "fitness coach"],
  area: {
    kind: "city",
    label: "Austin, TX",
    state: "TX",
    center: { lat: 30.2672, lng: -97.7431 },
    radius_m: 25_000,
    query: "Austin, TX, USA",
  },
  count: 200,
  contact: "email",
  criteria: [{ key: "website", text: "With a website", standard: "likely", required: true }],
  exclusions: [{ key: "chain", text: "Chain gyms", origin: "claude" }],
});

export const LEAD_FACTS = {
  dupes: 14,
  leadsLeft: 486,
  bound: null,
  prior: { places: 1_200, matched: 700, with_email: 406 },
  priorOf: "trainers",
  renewsOn: "Oct 1",
  nearby: [],
};

export const LEAD_CARD = {
  id: "p1",
  kind: "lead_search",
  needs: "owner",
  title: "Find 200 personal trainers",
  summary: planSentence(LEAD_PLAN),
  payload: { plan: LEAD_PLAN, view: { title: "Find 200 personal trainers" }, facts: LEAD_FACTS },
  undo: "Stop the search",
};

/* ------------------------------ a plan on the Line ------------------------------ */

// Ask's plan (the marketing manager's spec §5.4, §5.8): a group of ordinary cards, each stamped with the plan it is a
// step of. Read as a module, so a name contracts does not say yet is a failing test, not a file that will not load.
export const PC = await import("@chanlytics/contracts");

export const PLAN_ID = "plan-0f1e2d3c";

export const PLAN_MSG = "cccccccc-cccc-4ccc-8ccc-000000000018";

export const PLAN_PB = "88888888-8888-4888-8888-888888888888";

export const PV = (n) => `77777777-7777-4777-8777-${String(n).padStart(12, "0")}`;

export const MADE_MESSAGE = { kind: "message", id: PV(1) };

/** Step `step` of six: the first three send nothing, the last three are sends that wait for them. */
export const planCard = (step, kind, title, payload, over = {}) => ({
  id: `p-${step}`,
  kind,
  needs: "operator",
  title,
  summary: `${title}.`,
  payload,
  undo: null,
  made_at: new Date(Date.now() - 3_600_000).toISOString(),
  plan: { id: PLAN_ID, step, of: 6, silent: step <= 3, after: step <= 3 ? [] : [1, 2, 3] },
  ...over,
});

export const offerSlots = [
  { position: 1, label: "First name", kind: "first_name" },
  { position: 2, label: "Business name", kind: "business_name" },
  { position: 3, label: "The offer", kind: "text" },
  { position: 4, label: "Booking link", kind: "booking_link" },
];

export const offerBroadcast = (channels, name) => ({
  template_id: "@step:1",
  params: ["@first_name", "@business_name", "10% off colour all November.", "@booking_link"],
  audience_kind: "list",
  audience_id: "offers_ok",
  scheduled_for: "2026-11-01T15:00:00.000Z",
  name,
  channels,
});

export const SIX = [
  planCard(1, "message", "New message: offer, in English", {
    name: "offer",
    language: "en_US",
    category: "marketing",
    versions: {
      whatsapp: { body: "Hi {{1}}, an offer from {{2}}: {{3}} Book here: {{4}}" },
      email: { subject: "An offer from {{2}}", body: "Hi {{1}},\n\nAn offer from {{2}}: {{3}}\n\nBook here: {{4}}" },
    },
    slots: offerSlots,
  }),
  planCard(2, "settings", "Remember this", {
    change: {
      op: "add_note",
      title: "Offer: 10% off colour all November",
      text: "The offer: 10% off colour all November. It runs from Nov 1 to Nov 30.",
      until: "2026-11-30",
    },
  }),
  planCard(3, "playbook_change", "Pause: This month's offer", {
    playbook_id: PLAN_PB,
    playbook_name: "This month's offer",
    state: "paused",
  }),
  // A send by WhatsApp and email on the message step 1 writes: WhatsApp reviews that message first.
  planCard(4, "broadcast", "Broadcast to Can receive offers", offerBroadcast(["whatsapp", "email"], "Offer: November")),
  planCard(5, "broadcast", "Broadcast to Regulars", offerBroadcast(["email"], "Offer: November, again")),
  planCard(6, "playbook", "New campaign: the offer's reminder", {
    template_id: "@step:1",
    trigger: "quiet_30",
    channels: ["email"],
    until: "2026-11-30",
  }),
];

export const PLAN_ANSWER = {
  v: 2,
  form: "structured",
  say: { headline: "A plan of 3 steps and 3 sends to review.", detail: "" },
  show: { figures: [], items: [], breakdown: null },
  do: { open: null, next: [] },
  language: "en",
};

export const planProps = (cards, over = {}) => ({
  answer: PLAN_ANSWER,
  cardOpen: {},
  cards,
  messageId: PLAN_MSG,
  t: askText("en"),
  onNav() {},
  onFollow() {},
  ...over,
});

/** What a card commits to, by its kind, on a press of its own. */
export const ownMade = (p) => (p.kind === "message" ? MADE_MESSAGE : null);

/**
 * The bridge as installAsk publishes the plan's parts (bridge/ask.ts): contracts' planGroupOf,
 * a recorded commit of one card and of a plan's silent steps, and the outcome route.
 */
export const planBridge = (over = {}) => {
  const calls = { commit: [], plan: [], outcomes: [] };
  const was = askCalls();
  holdAsk({
    planGroupOf: PC.planGroupOf,
    planPressOf: PC.planPressOf,
    cardOpenRoute,
    undoOpen: () => false,
    undoPlan: async () => ({ results: [] }),
    pauseSend: async () => ({ ok: true }),
    editReply() {},
    commit: async (p, cards) => {
      calls.commit.push({ id: p.id, cards });
      return { ok: true, receipt: `${p.title}: done`, undo: null, made: ownMade(p) };
    },
    commitPlan: async (cards) => {
      calls.plan.push(cards);
      return { results: [], done: [], undone: [], made: {}, stoppedAt: null };
    },
    outcome: async (mid, pid, o) => {
      calls.outcomes.push([mid, pid, o]);
      return true;
    },
    ...over,
  });
  calls.restore = () => {
    holdAsk(was);
  };
  return calls;
};

export const classOf = (n) =>
  String(n?.props?.className || "")
    .split(" ")
    .filter(Boolean);

export const howOf = (tree) => all(byTestId(tree, "ask-plan-how"), (n) => n.type === "li").map(textOf);

export const HEAD = {
  title: "10% off colour all November",
  sub: "By email, until Nov 30",
  press: "offer",
  says: [{ channel: "email", label: "By email", words: "Hi Dani, 10% off colour all November." }],
  also: ["It goes without WhatsApp: connect a WhatsApp number first."],
};

/** A plan by email alone, so WhatsApp's review holds nothing: a note, a pause, then the send, each with its line. */
export const stampOf = (step, of, silent, after, does, id = PLAN_ID) => ({ id, step, of, silent, after, does });

export const BY_EMAIL = [
  { ...SIX[1], id: "p-1", plan: { ...stampOf(1, 3, true, [], "Tells AI."), head: HEAD } },
  { ...SIX[2], id: "p-2", plan: { ...stampOf(2, 3, true, [], "Pauses your month's offer."), head: HEAD } },
  {
    ...SIX[4],
    id: "p-3",
    payload: { ...SIX[4].payload, template_id: PV(9) },
    plan: { ...stampOf(3, 3, false, [1, 2], "Goes on Nov 1 at 10:00 AM."), head: HEAD },
  },
];

export const SENT = {
  results: [
    { step: 1, id: null, result: { ok: true, receipt: "AI knows.", undo: null, made: null } },
    { step: 2, id: null, result: { ok: true, receipt: "Paused.", undo: null, made: null } },
    { step: 3, id: "b1", result: { ok: true, receipt: "Set to go to 12 people.", undo: null, made: null } },
  ],
  done: [],
  undone: [],
  stoppedAt: null,
  made: {
    1: { kind: "settings", id: null },
    2: { kind: "playbook_change", id: null },
    3: { kind: "broadcast", id: null },
  },
};

/** Sets the world's `cells` for a test, as its assignment did: a module that imports a binding cannot assign it. */
export const setCells = (value) => (cells = value);
