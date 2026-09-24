/**
 * The first run's page (#/start), drawn without a browser: Setup's rows one step at a time, the rail, the phone's step
 * line, the receptionist card, Finish later, a step already reached opened in place, a failed read and its retry.
 * The steps and every word are contracts' (first-run.ts); the page runs for real under a stub React, with the Setup
 * rows it draws (setup.jsx) loaded beside it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { setupSteps, FIRST_RUN_HELPERS, FIRST_RUN_LANDED_KEY } from "@chanlytics/contracts";
import { hookFrames } from "./_hook-frames.mjs";

const NOW = Date.parse("2026-09-07T15:00:00Z");
const blank = {
  business: {
    name: null,
    hours: false,
    services: 0,
    bookingLink: false,
    address: false,
    handoff: null,
    broken: false,
    receptionist: "none",
  },
  channels: {
    whatsapp: { present: false, active: false, number: null, quality: null, lastInboundAt: null },
    voice: { present: false, active: false, number: null, lastInboundAt: null },
  },
  templates: { approved: 0, pending: 0, startersApproved: 0 },
  calendar: { state: "none" },
  team: { members: 1, invitesOpen: 0, alertEmails: 1 },
  consent: { yes: 0, offers: 0, offersSaidYes: 0 },
  requests: { line: null },
};
const withFacts = {
  ...blank,
  business: {
    name: "Harbor Moving",
    hours: true,
    services: 2,
    bookingLink: true,
    address: true,
    handoff: null,
    broken: false,
    receptionist: "set",
  },
};
const answering = {
  ...withFacts,
  channels: { ...blank.channels, voice: { present: true, active: true, number: "+13055550123", lastInboundAt: null } },
  calendar: { state: "ok" },
};
const surface = (dto) => ({
  dto,
  role: "owner",
  later: [],
  vm: setupSteps({ ...dto, later: [] }, NOW),
  fetchedAt: NOW,
});

/* ---- the window the page draws in ---- */
const went = [];
const replaced = [];
const store = {};
let refreshed = 0;
/** The first receptionist's asks, and what the route answers next (made, unless a test says). */
const receptionistAsked = [];
let receptionistSays = null;
globalThis.Icon = "Icon";
globalThis.React = { Fragment: "Fragment" };
globalThis.window = {
  location: { hash: "#/start" },
  sessionStorage: {
    getItem: (k) => store[k] ?? null,
    setItem: (k, v) => {
      store[k] = String(v);
    },
  },
  __SETUP: surface(blank),
  __firstRun: FIRST_RUN_HELPERS,
  __setup: {
    refresh: async () => {
      refreshed += 1;
    },
    later: async () => ({ ok: true, message: "" }),
    receptionist: async () => {
      receptionistAsked.push(1);
      return receptionistSays ?? { ok: true, wrote: true, message: "" };
    },
  },
  __WORKSPACES: [{ id: "w1", name: "Harbor Moving", timezone: "America/New_York" }],
  __ACTIVE_WORKSPACE: "w1",
  __DEMO_MODE: false,
  usePPToast: () => [null, () => {}],
  appNavigate: () => {},
  canDo: () => true,
  addEventListener() {},
  removeEventListener() {},
};
globalThis.document ??= {
  body: {},
  addEventListener() {},
  createElement: () => ({ setAttribute() {}, style: {}, classList: { add() {}, remove() {} } }),
};
globalThis.ReactDOM ??= { createPortal: (node) => node };
await import("../../../apps/dashboard/src/legacy/components/data-bits.jsx");
globalThis.FailedRead = globalThis.window.FailedRead;
globalThis.StatePill = globalThis.window.StatePill;
// data-bits publishes the shell's toast hook; this harness keeps its own, which remembers what was said.
const flashes = [];
globalThis.window.usePPToast = () => [null, (m) => flashes.push(m)];
await import("../../../apps/dashboard/src/legacy/pages/setup.jsx");
await import("../../../apps/dashboard/src/legacy/pages/first-run.jsx");

/* ---- a stub React: the Setup page test's, with this page as the one drawn ---- */
let param = null;
// A step move replaces the address (the shell's navigate with { replace: true }); a way out is a new entry.
const Page = () =>
  globalThis.window.FirstRun({ param, onNavigate: (to, opts) => (opts && opts.replace ? replaced : went).push(to) });
let cells = [];
const frames = hookFrames();
const fresh = () => {
  cells = [];
};
function mount() {
  Object.assign(globalThis.React, {
    createElement: (type, p, ...kids) => {
      const props = { ...(p || {}), children: kids.flat(Infinity) };
      const node = { type, props };
      if (typeof type === "function") node.rendered = frames.render(type, props);
      return node;
    },
    useMemo: (fn) => {
      const k = frames.key();
      if (!(k in cells)) cells[k] = fn();
      return cells[k];
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
    useEffect: (fn) => {
      const k = frames.key();
      if (!(k in cells)) {
        cells[k] = true;
        fn();
      }
    },
  });
  frames.begin();
  return Page();
}
const walk = (n, fn) => {
  if (n == null || typeof n !== "object") return;
  fn(n);
  for (const k of n.props?.children ?? []) walk(k, fn);
  if (n.rendered) walk(n.rendered, fn);
};
const byTestId = (tree, id) => {
  let hit = null;
  walk(tree, (n) => {
    if (!hit && n.props?.["data-testid"] === id) hit = n;
  });
  return hit;
};
/** A Setup row the page drew, by its own test id (AttnRow is not loaded here, so a row is its element's props). */
const rowIn = (tree, id) => {
  let hit = null;
  walk(tree, (n) => {
    if (!hit && n.props?.testid === `setup-row-${id}`) hit = n.props;
  });
  return hit;
};
const textOf = (n) => {
  if (n == null || typeof n === "boolean") return "";
  if (typeof n === "string" || typeof n === "number") return String(n);
  if (Array.isArray(n)) return n.map(textOf).join("");
  return textOf(n.props?.children) + (n.rendered ? textOf(n.rendered) : "");
};

test("a new workspace opens on its business: the rail says where it is, the step is Check, whose one press sets the receptionist up, and nothing answers yet", () => {
  globalThis.window.__SETUP = surface(blank);
  param = null;
  fresh();
  const tree = mount();
  assert.equal(textOf(byTestId(tree, "fr-heading")), "Tell us the basics", "nothing on Google here: the basics");
  assert.ok(byTestId(tree, "fr-rail-business"), "the step on screen is a button on the rail");
  assert.equal(byTestId(tree, "fr-rail-phone"), null, "a step not reached is only its name");
  assert.equal(byTestId(tree, "fr-rows"), null, "Check, not Setup's rows");
  assert.equal(
    textOf(byTestId(tree, "fr-check-make")),
    "Your receptionist starts with the name Harbor Moving, and you add the rest here.Set up your receptionist",
    "the name typed at sign-up, and the step's one coral button",
  );
  assert.equal(textOf(byTestId(tree, "fr-phone-line")), "Step 1 of 4 · Your business");
  const status = byTestId(tree, "fr-card-status");
  assert.equal(textOf(status), "Not answering yet");
  assert.equal(status.props["data-state"], "not_started", "the status is the state pill, toned by Setup's own states");
  assert.equal(byTestId(tree, "fr-back"), null);
  assert.equal(byTestId(tree, "fr-onward"), null);
  assert.equal(store[FIRST_RUN_LANDED_KEY], "1", "being here is the landing: Today does not send this tab back");
});

test("a step already reached opens in place from the rail, and its onward goes on to where the workspace is", () => {
  globalThis.window.__SETUP = surface(withFacts);
  param = "business";
  fresh();
  const tree = mount();
  assert.equal(textOf(byTestId(tree, "fr-heading")), "Tell us the basics");
  assert.equal(
    textOf(byTestId(tree, "fr-check-reading")),
    "Reading your receptionist…",
    "set up, and the settings read not landed: its rows wait for it",
  );
  assert.equal(textOf(byTestId(tree, "fr-onward")), "Looks right", "a step done: its one coral button");
  assert.equal(byTestId(tree, "fr-held"), null, "nothing holds it");
  byTestId(tree, "fr-onward").props.onClick();
  assert.equal(replaced.at(-1), "start");
  byTestId(tree, "fr-rail-phone").props.onClick();
  assert.equal(replaced.at(-1), "start", "the current step is the bare address");
  param = null;
  fresh();
  const phone = mount();
  assert.equal(textOf(byTestId(phone, "fr-heading")), "Your phone");
  byTestId(phone, "fr-back").props.onClick();
  assert.equal(replaced.at(-1), "start/business", "Back opens the step before, replaced so the browser's Back leaves");
});

test("answering: Live, with what is left, and Finish goes to Today", () => {
  globalThis.window.__SETUP = surface(answering);
  param = null;
  fresh();
  const tree = mount();
  assert.equal(textOf(byTestId(tree, "fr-heading")), "Your receptionist is answering");
  const onward = byTestId(tree, "fr-onward");
  assert.equal(textOf(onward), "Finish");
  onward.props.onClick();
  assert.equal(went.at(-1), "today");
  assert.equal(textOf(byTestId(tree, "fr-card-status")), "Answering · not tried yet");
});

test("Finish later leaves for Today", () => {
  globalThis.window.__SETUP = surface(blank);
  param = null;
  fresh();
  byTestId(mount(), "fr-later").props.onClick();
  assert.equal(went.at(-1), "today");
});

test("the card fills in from the settings read once it lands", () => {
  globalThis.window.__SETUP = surface(withFacts);
  globalThis.window.__SETTINGS = {
    config: { brain: { business_name: "Harbor Moving", booking_link: "https://harbor.example/book" } },
  };
  globalThis.window.__FACTS = {
    facts: { voice_line: { value: null }, kept_line: { value: null }, handoff_number: { value: "+13055550100" } },
  };
  try {
    param = null;
    fresh();
    const tree = mount();
    assert.equal(textOf(byTestId(tree, "fr-card-books")), "Books withharbor.example/book");
    assert.equal(textOf(byTestId(tree, "fr-card-through")), "Puts through to+1 (305) 555-0100");
    assert.equal(textOf(byTestId(tree, "fr-card-open")), "Open—", "hours set but not read yet: a dash, not a guess");
  } finally {
    delete globalThis.window.__SETTINGS;
    delete globalThis.window.__FACTS;
  }
});

test("a failed read says so, and the retry reads again; before the read, Reading your workspace…", () => {
  globalThis.window.__SETUP = null;
  fresh();
  const failed = mount();
  assert.ok(byTestId(failed, "fr-failed"));
  byTestId(failed, "fr-retry").props.onClick();
  assert.equal(refreshed, 1);
  globalThis.window.__SETUP = undefined;
  fresh();
  assert.equal(textOf(byTestId(mount(), "fr-reading")), "Reading your workspace…");
});

/* ---- Find: the business step while an owner can link a listing ---- */
const tick = () => new Promise((r) => setTimeout(r, 0));
const findable = { ...blank, google: { ready: true, places: true, listing: null, connected: false } };
const HARBOR = {
  place_id: "p-harbor",
  name: "Harbor Moving",
  address: "1 Main St, Brooklyn, NY 11201",
  maps_uri: "https://maps.google.com/?cid=1",
  category: "Moving company",
};
const WAREHOUSE = {
  place_id: "p-dock",
  name: "Harbor Moving Warehouse",
  address: null,
  maps_uri: null,
  category: null,
};
/** A Google that answers from a script and remembers what it was asked. */
const googleSays = (answers) => {
  const asked = { find: [], link: [] };
  globalThis.window.__google = {
    find: async (q) => {
      asked.find.push(q ?? null);
      return answers.shift();
    },
    link: async (id) => {
      asked.link.push(id);
      return { ok: true, read: true, message: "" };
    },
  };
  return asked;
};
const found = (candidates, query = "Harbor Moving") => ({ ok: true, candidates, query, fromFacts: true, message: "" });
const findOn = async () => {
  globalThis.window.__SETUP = surface(findable);
  param = null;
  fresh();
  const first = mount();
  await tick();
  return { first, tree: mount() };
};

test("Find: the business step opens on what Google has for the name on record, the best match first and checked", async () => {
  const asked = googleSays([found([HARBOR, WAREHOUSE])]);
  const { first, tree } = await findOn();
  assert.equal(textOf(byTestId(first, "fr-find-reading")), "Looking on Google…", "asked on arrival");
  assert.deepEqual(asked.find, [null], "with the name on record, no words of the owner's");
  assert.equal(textOf(byTestId(tree, "fr-heading")), "Is this Harbor Moving?", "the name typed at sign-up");
  assert.equal(byTestId(tree, "fr-rows"), null, "Find draws in place of the step's rows");
  const hits = [];
  walk(tree, (n) => {
    if (n.props?.["data-testid"] === "fr-find-hit") hits.push(n);
  });
  assert.equal(hits.length, 2);
  assert.match(textOf(hits[0]), /Harbor Moving.*Moving company · 1 Main St, Brooklyn, NY 11201.*Best match/);
  assert.match(textOf(hits[1]), /No address on Google/);
  const radios = [];
  walk(tree, (n) => {
    if (n.type === "input" && n.props.type === "radio") radios.push(n);
  });
  assert.deepEqual(
    radios.map((r) => r.props.checked),
    [true, false],
  );
});

test("Find: another one checked, Yes links it, and the page says so, since Find is gone once it is linked", async () => {
  const asked = googleSays([found([HARBOR, WAREHOUSE])]);
  const { tree } = await findOn();
  const radios = [];
  walk(tree, (n) => {
    if (n.type === "input" && n.props.type === "radio") radios.push(n);
  });
  radios[1].props.onChange();
  const again = mount();
  const before = flashes.length;
  await byTestId(again, "fr-find-yes").props.onClick();
  assert.deepEqual(asked.link, ["p-dock"]);
  assert.equal(flashes.length, before + 1);
  assert.equal(textOf(flashes.at(-1).msg), "Harbor Moving Warehouse is your listing on Google — read just now.");
});

test("Find: Yes links it, then asks for the receptionist to be set up from what Google says", async () => {
  const asked = googleSays([found([HARBOR])]);
  const { tree } = await findOn();
  const before = receptionistAsked.length;
  await byTestId(tree, "fr-find-yes").props.onClick();
  assert.deepEqual(asked.link, ["p-harbor"]);
  await tick();
  assert.equal(receptionistAsked.length, before + 1, "once, after the link was taken");
});

test("Find: a link refused asks for nothing more", async () => {
  googleSays([found([HARBOR])]);
  globalThis.window.__google.link = async () => ({
    ok: false,
    read: false,
    message: "Google could not read that listing.",
  });
  const { tree } = await findOn();
  const before = receptionistAsked.length;
  await byTestId(tree, "fr-find-yes").props.onClick();
  await tick();
  assert.equal(receptionistAsked.length, before);
});

test("Check with no receptionist: the owner's press asks for it, once while it is out, and a refusal is said in its words", async () => {
  globalThis.window.__SETUP = surface(blank);
  param = null;
  fresh();
  const tree = mount();
  const before = receptionistAsked.length;
  let answer;
  receptionistSays = new Promise((r) => {
    answer = r;
  });
  const press = byTestId(tree, "fr-check-make-press");
  const going = press.props.onClick();
  const busy = byTestId(mount(), "fr-check-make-press");
  assert.equal(busy.props["aria-busy"], true);
  assert.equal(textOf(busy), "Setting up…");
  busy.props.onClick();
  assert.equal(receptionistAsked.length, before + 1, "a second press while it is out asks for nothing");
  answer({ ok: false, wrote: false, message: "Only an owner can do this." });
  await going;
  receptionistSays = null;
  assert.equal(textOf(flashes.at(-1).msg), "Not set up — Only an owner can do this.");
  assert.equal(
    textOf(byTestId(mount(), "fr-check-make-press")),
    "Set up your receptionist",
    "and it can be pressed again",
  );
});

test("Check's rows wait for the settings read, and a read that failed offers its retry", () => {
  globalThis.window.__SETUP = surface(withFacts);
  param = "business";
  const again = [];
  globalThis.window.__refreshSurface = (s) => again.push(s);
  globalThis.window.__surfaceFailed = (page, pane) => page === "admin" && pane === "workspace";
  try {
    fresh();
    const tree = mount();
    assert.ok(byTestId(tree, "fr-check-failed"), "the settings read failed: said, where the rows would be");
    byTestId(tree, "fr-check-retry").props.onClick();
    assert.deepEqual(again, ["settings"], "and its retry reads the settings again");
  } finally {
    delete globalThis.window.__surfaceFailed;
    delete globalThis.window.__refreshSurface;
  }
});

test("Find: nothing found says so, with the search and the way out, and no Yes", async () => {
  googleSays([found([], "Harbor Moving")]);
  const { tree } = await findOn();
  assert.equal(textOf(byTestId(tree, "fr-find-none")), "Nothing on Google for “Harbor Moving”.");
  assert.equal(byTestId(tree, "fr-find-yes"), null);
  assert.ok(byTestId(tree, "fr-find-not"));
});

test("Find: the owner's own words are searched from three letters on", async () => {
  const asked = googleSays([found([]), found([HARBOR], "harbor moving brooklyn")]);
  const { tree } = await findOn();
  byTestId(tree, "fr-find-words").props.onChange({ target: { value: "ha" } });
  let form = null;
  walk(mount(), (n) => {
    if (!form && n.type === "form") form = n;
  });
  form.props.onSubmit({ preventDefault() {} });
  assert.deepEqual(asked.find, [null], "two letters are not sent");
  byTestId(mount(), "fr-find-words").props.onChange({ target: { value: "  harbor   moving brooklyn " } });
  walk(mount(), (n) => {
    if (n.type === "form") form = n;
  });
  form.props.onSubmit({ preventDefault() {} });
  await tick();
  assert.deepEqual(asked.find, [null, "harbor moving brooklyn"]);
  assert.match(textOf(mount()), /What Google has for “harbor moving brooklyn”./);
});

test("Find: a search that failed says the server's sentence, and Try again asks again", async () => {
  const asked = googleSays([
    { ok: false, candidates: [], query: "", fromFacts: true, message: "Google could not be searched just now." },
    found([HARBOR]),
  ]);
  const { tree } = await findOn();
  assert.match(textOf(byTestId(tree, "fr-find-failed")), /Google could not be searched just now./);
  await byTestId(tree, "fr-find-retry").props.onClick();
  await tick();
  assert.deepEqual(asked.find, [null, null]);
  assert.ok(byTestId(mount(), "fr-find-yes"));
});

test("Find: not on Google puts Google's row off, the member's own choice", async () => {
  googleSays([found([HARBOR])]);
  const said = [];
  const was = globalThis.window.__setup.later;
  globalThis.window.__setup.later = async (ids, on) => {
    said.push([ids, on]);
    return { ok: true, message: "" };
  };
  try {
    const { tree } = await findOn();
    const before = receptionistAsked.length;
    await byTestId(tree, "fr-find-not").props.onClick();
    assert.deepEqual(said, [["google", true]]);
    await tick();
    assert.equal(receptionistAsked.length, before + 1, "and the receptionist is set up with the name typed at sign-up");
  } finally {
    globalThis.window.__setup.later = was;
  }
});

test("Find is an owner's, by the role gate (View-as included): anyone else sees Check, which says an owner sets the receptionist up", async () => {
  const asked = googleSays([found([HARBOR])]);
  const was = globalThis.window.canDo;
  globalThis.window.canDo = (a) => a !== "team";
  try {
    globalThis.window.__SETUP = surface(findable);
    param = null;
    fresh();
    const tree = mount();
    assert.equal(byTestId(tree, "fr-find"), null);
    assert.equal(textOf(byTestId(tree, "fr-check-waiting")), "An owner sets up the receptionist here.");
    assert.equal(byTestId(tree, "fr-check-make"), null, "no press to offer");
    assert.equal(textOf(byTestId(tree, "fr-heading")), "Tell us the basics");
    assert.deepEqual(asked.find, [], "and nothing is searched");
  } finally {
    globalThis.window.canDo = was;
  }
});

test("Find it asks for Find by name, even after not on Google; not on Google again goes to the step's own address", async () => {
  googleSays([found([HARBOR])]);
  const putOff = { ...surface(findable), later: ["google"], vm: setupSteps({ ...findable, later: ["google"] }, NOW) };
  globalThis.window.__SETUP = putOff;
  param = null;
  fresh();
  assert.equal(byTestId(mount(), "fr-find"), null, "the plain address: put off, so the step's rows");
  param = "find";
  fresh();
  mount();
  await tick();
  const tree = mount();
  assert.ok(byTestId(tree, "fr-find"), "start/find: Find, whatever was said before");
  await byTestId(tree, "fr-find-not").props.onClick();
  assert.equal(replaced.at(-1), "start", "and the step's own address after, replaced");
});

test("Find on a phone: the best match alone until the owner asks for more, and the pages they agree to", async () => {
  googleSays([found([HARBOR, WAREHOUSE])]);
  const { tree } = await findOn();
  const root = byTestId(tree, "fr-find");
  assert.equal(root.props["data-hits"], "true");
  assert.equal(root.props["data-more"], undefined, "the phone's styles show the best match alone");
  byTestId(tree, "fr-find-more").props.onClick();
  const more = mount();
  assert.equal(byTestId(more, "fr-find").props["data-more"], "true");
  assert.equal(byTestId(more, "fr-find-more"), null);
  const links = [];
  walk(more, (n) => {
    if (n.type === "a" && (n.props.href === "/terms" || n.props.href === "/privacy")) links.push(textOf(n));
  });
  assert.deepEqual(links, ["Terms of service", "Privacy policy"]);
});

test("without the bridge the page says nothing of its own: every word is contracts'", () => {
  const F = globalThis.window.__firstRun;
  delete globalThis.window.__firstRun;
  try {
    globalThis.window.__SETUP = surface(blank);
    fresh();
    const tree = mount();
    assert.ok(byTestId(tree, "first-run"));
    assert.equal(textOf(tree), "");
  } finally {
    globalThis.window.__firstRun = F;
  }
});
