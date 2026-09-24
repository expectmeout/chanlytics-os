/**
 * The Setup page, rendered loaded, with a line that is answering and tested
 * but not yet activated: the receptionist row carries Activate, and pressing
 * it reaches the bridge with the capability's name. The rows come from the
 * real setupSteps over a real DTO; the page runs for real under the four
 * hooks it uses (the registration-path harness); only the renderer is faked.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  setupSteps,
  forwardingCodes,
  forwardingTestOpen,
  CARRIERS,
  FORWARDING_MODES,
  CARRIER_WORDS,
  MODE_WORDS,
  formatPhoneDisplay,
  roleGate,
} from "@chanlytics/contracts";
import { hookFrames } from "./_hook-frames.mjs";

const NOW = Date.parse("2026-09-11T12:00:00Z");
const ago = (h) => new Date(NOW - h * 3600_000).toISOString();

const dto = {
  business: {
    name: "Harbor Nails",
    hours: true,
    services: 4,
    bookingLink: true,
    address: true,
    handoff: "+13055550199",
    broken: false,
  },
  channels: {
    whatsapp: { present: false, active: false, number: null, quality: null, lastInboundAt: null },
    voice: { present: true, active: true, number: "+13055550101", lastInboundAt: ago(3) },
  },
  templates: { approved: 0, pending: 0, startersApproved: 0 },
  calendar: { state: "none" },
  team: { members: 1, invitesOpen: 0, alertEmails: 1 },
  consent: { yes: 0, offers: 0 },
  requests: { line: null },
  lines: {
    rows: [
      {
        id: "l1",
        e164: "+13055550101",
        kind: "chanlytics",
        provider: "twilio",
        area_code: 305,
        voice_state: "answering",
        sms_state: "none",
        reg_mock: false,
        whatsapp_state: "none",
        port_state: "none",
        forwarding_state: "none",
        step: null,
        last_error: null,
        state_since: ago(48),
        created_at: ago(72),
      },
    ],
    ready: true,
    provider: "twilio",
    costs: { local_number_month_usd: 1.15 },
  },
  activations: [],
};
const vm = setupSteps({ ...dto, later: [] }, NOW);

test("the contract: a tested, unactivated receptionist offers Activate and says so", () => {
  const r = vm.rows.find((x) => x.id === "receptionist");
  assert.equal(r.state, "ready");
  assert.deepEqual(r.verb, { label: "Activate", to: "verb:activate:voice" });
  assert.ok(r.details.includes("Tested — activate it to say it is yours"), r.details.join(" | "));
  const live = setupSteps(
    {
      ...dto,
      activations: [{ capability: "voice", activated_at: ago(1), activated_by: "u1", deactivated_at: null }],
      later: [],
    },
    NOW,
  ).rows.find((x) => x.id === "receptionist");
  assert.equal(live.verb.label, "Call it", "activated: the verb goes back to trying it");
  assert.ok(live.details.some((d) => /^Activated /.test(d)));
});

/* ---- the page itself, rendered without a browser ---- */
const calls = {
  later: [],
  activate: [],
  deactivate: [],
  refresh: 0,
  flash: [],
  nav: [],
  search: [],
  buy: [],
  fwSet: [],
  fwTest: [],
  find: [],
  link: [],
};
globalThis.Icon = "Icon";
globalThis.React = { Fragment: "Fragment" };
globalThis.window = {
  location: { origin: "https://app.chanlytics.com", hash: "#/admin/setup" },
  __SETUP: { dto, role: "owner", vm, fetchedAt: NOW },
  __setup: {
    later: async (ids, on) => {
      calls.later.push([ids, on]);
      return { ok: true, message: "" };
    },
    activate: async (kind) => {
      calls.activate.push(kind);
      return { ok: true, message: "" };
    },
    deactivate: async (kind) => {
      calls.deactivate.push(kind);
      return { ok: true, message: "" };
    },
    refresh: async () => {
      calls.refresh += 1;
    },
    lines: {
      search: async (area) => {
        calls.search.push(area);
        return {
          ok: true,
          numbers: [
            { e164: "+13055550142", friendly: "(305) 555-0142", locality: "Miami", region: "FL" },
            { e164: "+13055550143", friendly: "(305) 555-0143", locality: "Miami", region: "FL" },
          ],
          message: "",
        };
      },
      buy: async (number, area) => {
        calls.buy.push([number, area]);
        return { ok: true, queued: true, message: "" };
      },
      retry: async () => ({ ok: true, queued: true, message: "" }),
    },
    forwarding: {
      set: async (o) => {
        calls.fwSet.push(o);
        return { ok: true, message: "" };
      },
      test: async (id) => {
        calls.fwTest.push(id);
        return { ok: true, message: "" };
      },
    },
  },
  __billing: {},
  __google: {
    find: async (words) => {
      calls.find.push(words ?? null);
      return {
        ok: true,
        candidates: [
          {
            place_id: "ChIJ-harbor",
            name: "Harbor Nails",
            address: "12 Bay St, Miami",
            maps_uri: "https://maps.example/harbor",
          },
        ],
        query: words ?? "Harbor Nails 12 Bay St",
        fromFacts: !words,
      };
    },
    link: async (placeId) => {
      calls.link.push(placeId);
      return { ok: true, read: true, message: "" };
    },
  },
  __forwarding: {
    codes: forwardingCodes,
    testOpen: forwardingTestOpen,
    carriers: CARRIERS,
    modes: FORWARDING_MODES,
    carrierWords: CARRIER_WORDS,
    modeWords: MODE_WORDS,
    display: formatPhoneDisplay,
    ago: () => "a minute ago",
  },
  __DEMO_MODE: false,
  usePPToast: () => [null, (m) => calls.flash.push(m)],
  appNavigate: (to) => calls.nav.push(to),
  canDo: () => true,
  addEventListener() {},
  removeEventListener() {},
};
// The failed card is the shared FailedRead (data-bits.jsx), drawn for real so the Retry inside it can be pressed.
globalThis.document ??= {
  body: {},
  addEventListener() {},
  createElement: () => ({ setAttribute() {}, style: {}, classList: { add() {}, remove() {} } }),
};
globalThis.ReactDOM ??= { createPortal: (node) => node };
globalThis.window.addEventListener ??= () => {};
globalThis.window.removeEventListener ??= () => {};
await import("../../../apps/dashboard/src/legacy/components/data-bits.jsx");
globalThis.FailedRead = globalThis.window.FailedRead;
globalThis.EmptyState = globalThis.window.EmptyState;
// data-bits also publishes the shell's toast hook; this harness keeps its own flash.
globalThis.window.usePPToast = () => [null, (m) => calls.flash.push(m)];
await import("../../../apps/dashboard/src/legacy/pages/setup.jsx");
// Setup's rows as the first run and Today draw them (setup.jsx SetupRows): every row, the next one primary.
const Page = () =>
  globalThis.window.SetupRows({
    S: globalThis.window.__SETUP,
    rows: globalThis.window.__SETUP.vm.rows,
    primary: globalThis.window.__SETUP.vm.next ? globalThis.window.__SETUP.vm.next.row : null,
  });

/** The component's cells live across renders, as React's do, so a click that sets state shows on the next mount; `fresh()` starts a component over. */
let cells = [];
// Where each hook keeps its state: by the component that calls it, as React keeps it (_hook-frames.mjs).
const frames = hookFrames();
const fresh = () => {
  cells = [];
};
function mount() {
  Object.assign(globalThis.React, {
    // A function component is rendered in place, as React renders it, so what
    // a row opens under itself (the chooser, the card, the finder) is in the
    // tree; the element itself is kept too, so a row's props stay readable.
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
    // An effect runs once per component, on its first mount, as React runs it on arrival.
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
const byTestId = (tree, id) => {
  let hit = null;
  walk(tree, (n) => {
    if (!hit && n.props?.["data-testid"] === id) hit = n;
  });
  return hit;
};
const allByTestId = (tree, id) => {
  const hits = [];
  walk(tree, (n) => {
    if (n.props?.["data-testid"] === id) hits.push(n);
  });
  return hits;
};
const tick = () => new Promise((r) => setTimeout(r, 0));
const walk = (n, fn) => {
  if (n == null || typeof n !== "object") return;
  fn(n);
  for (const k of n.props?.children ?? []) walk(k, fn);
  if (n.rendered) walk(n.rendered, fn);
};

test("the page: the row's Activate reaches the bridge with the capability's name, and the owner is told", async () => {
  const tree = mount();
  let cta = null;
  walk(tree, (n) => {
    if (!cta && n.props?.cta?.label === "Activate") cta = n.props.cta;
  });
  assert.ok(cta, "a row offers Activate");
  await cta.onClick();
  assert.deepEqual(calls.activate, ["voice"]);
  assert.equal(calls.flash.length, 1, "the owner is told once");
  assert.equal(calls.nav.length, 0, "and nothing navigated away");
});

test("REGRESSION (S15): an operator sees Activate gated before the press, with the reason -- they pressed it and were told after, in a toast", async () => {
  const before = { activate: calls.activate.length, flash: calls.flash.length, nav: calls.nav.length };
  Object.assign(globalThis.window, {
    ST_STORE: { can: (a) => a === "approve" || a === "autonomy", myRole: () => "operator" },
    __roleGate: roleGate,
  });
  try {
    const tree = mount();
    let row = null;
    walk(tree, (n) => {
      if (!row && n.props?.cta?.label === "Activate") row = n.props;
    });
    assert.ok(row, "a row offers Activate");
    assert.ok(row.cta.gate, "REGRESSION: the verb was offered as if it would work");
    assert.equal(row.cta.gate["data-tip"], "Only an owner can activate a capability.");
    assert.equal(row.onOpen, undefined, "the row is not a way around its own gated button");
    // Pressed as the page draws it: the gate spread after the verb.
    const drawn = { onClick: row.cta.onClick, ...row.cta.gate };
    await drawn.onClick({ preventDefault() {}, stopPropagation() {}, currentTarget: {} });
    // And the verb itself, reached any other way: it does nothing, and says nothing after the fact.
    await row.cta.onClick();
    await tick();
    assert.equal(calls.activate.length, before.activate, "nothing reached the bridge");
    assert.equal(
      calls.flash.length,
      before.flash,
      "REGRESSION: 'Only an owner can activate a capability.' arrived as a toast after the press",
    );
    assert.equal(calls.nav.length, before.nav);
  } finally {
    delete globalThis.window.ST_STORE;
    delete globalThis.window.__roleGate;
  }
});

test("the page: a row that dials is not itself a dial; an activated row offers to withdraw the activation, it reaches the bridge, and the words never claim the receptionist stops", async () => {
  const before = calls.deactivate.length;
  const flashed = calls.flash.length;
  globalThis.window.__SETUP = {
    dto,
    role: "owner",
    vm: setupSteps(
      {
        ...dto,
        activations: [{ capability: "voice", activated_at: ago(1), activated_by: "u1", deactivated_at: null }],
        later: [],
      },
      NOW,
    ),
    fetchedAt: NOW,
  };
  const tree = mount();
  let row = null;
  walk(tree, (n) => {
    if (!row && n.props?.testid === "setup-row-receptionist") row = n.props;
  });
  assert.ok(row, "the receptionist row");
  assert.equal(row.cta.label, "Call it");
  assert.equal(row.onOpen, undefined, "the row itself does not dial; only its button does");
  assert.equal(
    row.also.label,
    "Withdraw activation",
    "REGRESSION: 'Switch off' promised the receptionist would stop, and an activation gates nothing at runtime",
  );
  await row.also.onClick();
  assert.deepEqual(calls.deactivate.slice(before), ["voice"]);
  const said = String(calls.flash[flashed].msg.props.children.join(""));
  assert.ok(!said.includes("Switched off"), said);
  assert.ok(said.startsWith("Activation withdrawn"), said);
  let nav = null;
  walk(tree, (n) => {
    if (!nav && n.props?.testid === "setup-row-team") nav = n.props;
  });
  assert.equal(typeof nav.onOpen, "function", "a row that navigates is a click target");
  globalThis.window.__SETUP = { dto, role: "owner", vm, fetchedAt: NOW };
});

// A failed read, and its retry, are the first run's page now: first-run-page.test.mjs.

test("the page: Later puts a row off through the bridge, and waits for it like any other press", async () => {
  // The fixture, as the failed-read test used to leave it for the tests after it.
  globalThis.window.__SETUP = { dto, role: "owner", later: [], vm, fetchedAt: NOW };
  fresh();
  const tree = mount();
  let row = null;
  walk(tree, (n) => {
    if (!row && n.props?.testid === "setup-row-keep") row = n.props;
  });
  assert.ok(row, "the kept number's row is drawn");
  assert.equal(row.also.label, "Later", "an optional row that is not ready can be put off");
  assert.equal(row.also.testid, "setup-later-keep");
  await row.also.onClick();
  assert.deepEqual(calls.later.at(-1), ["keep", true]);
  let facts = null;
  walk(tree, (n) => {
    if (!facts && n.props?.testid === "setup-row-facts") facts = n.props;
  });
  assert.equal(facts.also, null, "a row the receptionist needs is never put off");
});

test("the page: the one coral button is the row the caller names, and every other verb is quiet", () => {
  const kinds = (primary) => {
    // The harness's page names `vm.next`'s row as the primary one, as the first run names its step's first open row.
    const next = primary ? { label: "Set up forwarding", to: "verb:forwarding", row: primary, title: "Keep" } : null;
    globalThis.window.__SETUP = { dto, role: "owner", later: [], vm: { ...vm, next }, fetchedAt: NOW };
    fresh();
    const tree = mount();
    const out = {};
    walk(tree, (n) => {
      const t = n.props?.testid;
      if (typeof t === "string" && t.startsWith("setup-row-") && n.props.cta) out[t.slice(10)] = n.props.cta.kind;
    });
    return out;
  };
  const named = kinds("keep");
  assert.equal(named.keep, "primary");
  assert.deepEqual(
    Object.entries(named)
      .filter(([, k]) => k === "primary")
      .map(([id]) => id),
    ["keep"],
    "one coral button, the named row's",
  );
  assert.ok(
    Object.values(kinds(null)).every((k) => k === "ghost"),
    "none named, none coral: Live's rows leave the one action to Finish",
  );
});

/* ---- the chooser: find numbers in an area code, pick one, get it ---- */
const noLine = {
  ...dto,
  channels: {
    ...dto.channels,
    voice: { present: false, active: false, number: null, quality: null, lastInboundAt: null },
  },
  lines: { rows: [], ready: true, provider: "twilio", costs: { local_number_month_usd: 1.15 } },
  billing: {
    ready: false,
    mode: "direct",
    status: "active",
    trial_end: null,
    current_period_end: null,
    trial_days: 14,
  },
};

test("the page: the chooser finds numbers in an area code, a pick opens the confirm, and Get this number reaches the bridge with the number and the area", async () => {
  fresh();
  globalThis.window.__SETUP = {
    dto: noLine,
    role: "owner",
    vm: setupSteps({ ...noLine, later: [] }, NOW),
    fetchedAt: NOW,
  };
  let tree = mount();
  const lineRow = (() => {
    let r = null;
    walk(tree, (n) => {
      if (!r && n.props?.testid === "setup-row-line") r = n.props;
    });
    return r;
  })();
  assert.equal(lineRow.cta.label, "Get a line");
  await lineRow.cta.onClick();
  tree = mount();
  assert.ok(byTestId(tree, "setup-chooser"), "the chooser opens under the row");
  byTestId(tree, "setup-area").props.onChange({ target: { value: "305" } });
  tree = mount();
  await byTestId(tree, "setup-find").props.onClick();
  assert.deepEqual(calls.search, ["305"]);
  tree = mount();
  const numbers = allByTestId(tree, "setup-number");
  assert.equal(numbers.length, 2, "the numbers found");
  numbers[1].props.onClick();
  tree = mount();
  const confirm = byTestId(tree, "setup-confirm");
  assert.ok(confirm, "a pick opens the confirm");
  const before = calls.flash.length;
  await byTestId(tree, "setup-buy").props.onClick();
  assert.deepEqual(calls.buy, [["+13055550143", "305"]]);
  assert.match(String(calls.flash[before].msg.props.children.join("")), /is yours — setting it up now/);
});

/* ---- forwarding: save the carrier and the mode, read the code, open the test window ---- */
test("the page: the forwarding card saves the number, the carrier and the mode through the bridge, then shows the code and opens the test window", async () => {
  fresh();
  globalThis.window.__SETUP = { dto, role: "owner", vm, fetchedAt: NOW };
  let tree = mount();
  const keepRow = (() => {
    let r = null;
    walk(tree, (n) => {
      if (!r && n.props?.testid === "setup-row-keep") r = n.props;
    });
    return r;
  })();
  assert.equal(keepRow.cta.label, "Set up forwarding");
  await keepRow.cta.onClick();
  tree = mount();
  assert.ok(byTestId(tree, "setup-forwarding"), "the card opens under the row");
  byTestId(tree, "setup-fw-number").props.onChange({ target: { value: "(305) 555-0100" } });
  tree = mount();
  byTestId(tree, "setup-fw-carrier-att").props.onClick();
  tree = mount();
  byTestId(tree, "setup-fw-mode-always").props.onClick();
  tree = mount();
  await byTestId(tree, "setup-fw-save").props.onClick();
  assert.deepEqual(calls.fwSet, [{ number: "(305) 555-0100", carrier: "att", mode: "always", test_from: "" }]);

  // Saved: the row carries the forwarded line, and the card shows the carrier's code and the test.
  fresh();
  const saved = {
    ...dto,
    lines: {
      ...dto.lines,
      rows: [
        ...dto.lines.rows,
        {
          id: "f1",
          e164: "+13055550100",
          kind: "forwarded",
          provider: "carrier",
          area_code: 305,
          voice_state: "none",
          sms_state: "none",
          reg_mock: false,
          whatsapp_state: "none",
          port_state: "none",
          forwarding_state: "instructed",
          step: null,
          last_error: null,
          state_since: ago(1),
          created_at: ago(1),
          forwarding: {
            carrier: "att",
            mode: "always",
            destination_e164: "+13055550101",
            test_from: null,
            test_started_at: null,
            test_until: null,
            verified_at: null,
          },
        },
      ],
    },
  };
  globalThis.window.__SETUP = {
    dto: saved,
    role: "owner",
    vm: setupSteps({ ...saved, later: [] }, NOW),
    fetchedAt: NOW,
  };
  tree = mount();
  const row2 = (() => {
    let r = null;
    walk(tree, (n) => {
      if (!r && n.props?.testid === "setup-row-keep") r = n.props;
    });
    return r;
  })();
  assert.equal(row2.cta.label, "Test it");
  await row2.cta.onClick();
  assert.deepEqual(calls.fwTest, ["f1"], "Test it on the row opens the window through the bridge");
  tree = mount();
  const code = byTestId(tree, "setup-fw-code");
  assert.ok(code, "the card shows the code once a line is saved");
  assert.equal(
    byTestId(tree, "setup-fw-dial").props.href,
    forwardingCodes("att", "always", "+13055550101").on.tel,
    "the carrier's own code, to dial",
  );
});

/* ---- the listing finder: Google is asked with the facts on record, and one tap links ---- */
test("the page: the finder asks Google with the facts on record on arrival, and This is it links the listing through the bridge", async () => {
  fresh();
  const google = { ...dto, google: { ready: true, places: true, listing: null } };
  globalThis.window.__SETUP = {
    dto: google,
    role: "owner",
    vm: setupSteps({ ...google, later: [] }, NOW),
    fetchedAt: NOW,
  };
  let tree = mount();
  const gRow = (() => {
    let r = null;
    walk(tree, (n) => {
      if (!r && n.props?.testid === "setup-row-google") r = n.props;
    });
    return r;
  })();
  assert.ok(gRow, "the Google row is drawn when Places is ready");
  assert.equal(gRow.cta.label, "Find it");
  await gRow.cta.onClick();
  tree = mount();
  assert.ok(byTestId(tree, "setup-google-finder"), "the finder opens under the row");
  await tick();
  assert.deepEqual(calls.find, [null], "asked with the facts on record, no words of the owner's");
  tree = mount();
  const place = byTestId(tree, "setup-place");
  assert.ok(place, "what Google found");
  await byTestId(tree, "setup-place-link").props.onClick();
  assert.deepEqual(calls.link, ["ChIJ-harbor"]);
});

/* ---- a verb on its way, the page's own checks, and the area code's Enter ---- */

test("REGRESSION (S23): a row's verb cannot be pressed twice while it is on its way -- a double press sent it twice", async () => {
  fresh();
  globalThis.window.__SETUP = { dto, role: "owner", vm, fetchedAt: NOW };
  let release = null;
  const sent = [];
  const was = globalThis.window.__setup.activate;
  globalThis.window.__setup.activate = (kind) => {
    sent.push(kind);
    return new Promise((r) => {
      release = () => r({ ok: true, message: "" });
    });
  };
  try {
    let tree = mount();
    const row = () => {
      let r = null;
      walk(tree, (n) => {
        if (!r && n.props?.testid === "setup-row-receptionist") r = n.props;
      });
      return r;
    };
    assert.equal(row().cta.label, "Activate");
    const first = row().cta.onClick();
    tree = mount();
    assert.equal(row().cta.busy, true, "REGRESSION: the row's button stayed pressable while its verb was on its way");
    await row().cta.onClick();
    assert.deepEqual(sent, ["voice"], "REGRESSION: a second press sent it again");
    release();
    await first;
    tree = mount();
    assert.ok(!row().cta.busy, "and the button is back once it lands");
  } finally {
    globalThis.window.__setup.activate = was;
  }
});

test("REGRESSION (S16): Setup's own checks wear their tones -- a refused area code and an empty search wore the green check", async () => {
  fresh();
  globalThis.window.__SETUP = {
    dto: noLine,
    role: "owner",
    vm: setupSteps({ ...noLine, later: [] }, NOW),
    fetchedAt: NOW,
  };
  let tree = mount();
  let lineRow = null;
  walk(tree, (n) => {
    if (!lineRow && n.props?.testid === "setup-row-line") lineRow = n.props;
  });
  await lineRow.cta.onClick();
  tree = mount();
  byTestId(tree, "setup-area").props.onChange({ target: { value: "30" } });
  tree = mount();
  const before = calls.flash.length;
  await byTestId(tree, "setup-find").props.onClick();
  assert.match(String(calls.flash[before]?.msg?.props?.children), /Three digits/);
  assert.equal(calls.flash[before].tone, "warn", "REGRESSION: 'Three digits, like 305.' wore the green check");
  const search = globalThis.window.__setup.lines.search;
  globalThis.window.__setup.lines.search = async (area) => {
    calls.search.push(area);
    return { ok: true, numbers: [] };
  };
  try {
    byTestId(tree, "setup-area").props.onChange({ target: { value: "999" } });
    tree = mount();
    await byTestId(tree, "setup-find").props.onClick();
    const said = calls.flash.at(-1);
    assert.match(String(said.msg.props.children.join("")), /Nothing free in 999/);
    assert.equal(said.tone, "info", "REGRESSION: a search that found nothing wore the green check of success");
  } finally {
    globalThis.window.__setup.lines.search = search;
  }
});

test("a retry says it is under way in the info tone, not with the green check of a line that answers", async () => {
  fresh();
  const retryVm = {
    ...vm,
    next: null,
    rows: [
      {
        id: "line",
        icon: "phone",
        title: "Your line",
        sentence: "Setting up stopped.",
        stateWords: "Stopped",
        details: [],
        state: "attention",
        required: true,
        later: false,
        verb: { label: "Retry", to: "verb:retry-line:l1" },
        undo: null,
      },
    ],
  };
  globalThis.window.__SETUP = { dto, role: "owner", vm: retryVm, fetchedAt: NOW };
  try {
    const tree = mount();
    let row = null;
    walk(tree, (n) => {
      if (!row && n.props?.testid === "setup-row-line") row = n.props;
    });
    const before = calls.flash.length;
    await row.cta.onClick();
    assert.match(String(calls.flash[before].msg.props.children), /Retrying/);
    assert.equal(
      calls.flash[before].tone,
      "info",
      "REGRESSION: 'Retrying' wore the green check before anything answered",
    );
  } finally {
    globalThis.window.__SETUP = { dto, role: "owner", vm, fetchedAt: NOW };
  }
});

test("REGRESSION (the gate): Enter in the area code is the gated button's press, not a way around it -- it searched for a role that may not", async () => {
  fresh();
  globalThis.window.__SETUP = {
    dto: noLine,
    role: "owner",
    vm: setupSteps({ ...noLine, later: [] }, NOW),
    fetchedAt: NOW,
  };
  let tree = mount();
  let lineRow = null;
  walk(tree, (n) => {
    if (!lineRow && n.props?.testid === "setup-row-line") lineRow = n.props;
  });
  await lineRow.cta.onClick();
  Object.assign(globalThis.window, {
    ST_STORE: { can: (a) => a === "approve" || a === "autonomy", myRole: () => "operator" },
    __roleGate: roleGate,
  });
  const searched = calls.search.length;
  try {
    tree = mount();
    byTestId(tree, "setup-area").props.onChange({ target: { value: "305" } });
    tree = mount();
    byTestId(tree, "setup-area").props.onKeyDown({ key: "Enter" });
    await tick();
    assert.equal(calls.search.length, searched, "REGRESSION: Enter searched past the gated Find numbers");
  } finally {
    delete globalThis.window.ST_STORE;
    delete globalThis.window.__roleGate;
    globalThis.window.__SETUP = { dto, role: "owner", vm, fetchedAt: NOW };
  }
});

/* ---- the asks: bringing a number, and a repair (S14, S8) ---- */

test("REGRESSION (S14): Bring my number asks for a port, and says so -- its Ask us filed a line request", async () => {
  fresh();
  globalThis.window.__SETUP = {
    dto: noLine,
    role: "owner",
    vm: setupSteps({ ...noLine, later: [] }, NOW),
    fetchedAt: NOW,
  };
  const asked = [];
  globalThis.window.__setup.request = async (what) => {
    asked.push(what);
    return { ok: true, already: false, message: "" };
  };
  try {
    let tree = mount();
    let lineRow = null;
    walk(tree, (n) => {
      if (!lineRow && n.props?.testid === "setup-row-line") lineRow = n.props;
    });
    await lineRow.cta.onClick();
    tree = mount();
    byTestId(tree, "setup-path-bring").props.onClick();
    tree = mount();
    const before = calls.flash.length;
    await byTestId(tree, "setup-ask-us").props.onClick();
    assert.deepEqual(asked, ["port"], "REGRESSION: Ask us asked for a line");
    assert.match(calls.flash[before].msg.props.children.join(""), /move your number/);
  } finally {
    delete globalThis.window.__setup.request;
    globalThis.window.__SETUP = { dto, role: "owner", vm, fetchedAt: NOW };
  }
});

test("REGRESSION (S8): a broken configuration's row asks for a repair, and says so -- its only verb opened Business, which cannot repair it", async () => {
  fresh();
  const broken = { ...dto, business: { ...dto.business, broken: true } };
  globalThis.window.__SETUP = {
    dto: broken,
    role: "owner",
    vm: setupSteps({ ...broken, later: [] }, NOW),
    fetchedAt: NOW,
  };
  const asked = [];
  globalThis.window.__setup.request = async (what) => {
    asked.push(what);
    return { ok: true, already: false, message: "" };
  };
  try {
    const tree = mount();
    let facts = null;
    walk(tree, (n) => {
      if (!facts && n.props?.testid === "setup-row-facts") facts = n.props;
    });
    assert.equal(facts.cta.label, "Ask for a repair");
    const before = { flash: calls.flash.length, nav: calls.nav.length };
    await facts.cta.onClick();
    assert.deepEqual(asked, ["repair"], "REGRESSION: the verb was never sent");
    assert.equal(calls.nav.length, before.nav, "and nothing navigated away");
    assert.match(calls.flash[before.flash].msg.props.children.join(""), /repair your settings/);
  } finally {
    delete globalThis.window.__setup.request;
    globalThis.window.__SETUP = { dto, role: "owner", vm, fetchedAt: NOW };
  }
});
