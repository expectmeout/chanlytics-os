/**
 * The gate says why, where the control is.
 *
 * A control a role may not press was `disabled`, with the reason in a `title`.
 * A disabled button takes no focus and fires no hover, so the reason reached no
 * keyboard, no finger and most pointers: Today offered a viewer an Approve that
 * did nothing, the Inbox menu's Snooze did nothing silently, Messages hid its
 * New message with no word, and Setup told an operator "Only an owner can
 * activate a capability" only after the press (the 12 September audit's D8 and
 * S15; the wiring audit's A12, B21 and C17).
 *
 * The words now come from contracts (roleGate): the same no the server's
 * refusal gives after a press (refusal.ts). The gated control stays on the
 * page, focusable and described, and pressing it shows the reason instead of
 * doing anything. Mounted without a browser, over the contracts' own table.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { roleGate, refusalOf, ROLE_PERMS, stateOf, toTodayVM } from "@chanlytics/contracts";
import { hookFrames } from "./_hook-frames.mjs";

/* -------------------------------- the words -------------------------------- */

test("the gate names who may, and what this control does, in the words the server's refusal uses after the press", () => {
  assert.equal(roleGate("owner", "settings"), null, "an owner may");
  assert.equal(roleGate("operator", "approve"), null, "an operator may approve");
  assert.deepEqual(roleGate("operator", "settings"), {
    needs: "owner",
    title: "Owner only",
    reason: "Only an owner can change the business details.",
  });
  assert.deepEqual(roleGate("viewer", "approve", "snooze a conversation"), {
    needs: "operator",
    title: "Not for viewers",
    reason: "Only an owner or operator can snooze a conversation.",
  });
  assert.equal(
    roleGate("operator", "team", "activate a capability").reason,
    "Only an owner can activate a capability.",
    "a control says what it does where the permission's own words would mislead",
  );
  assert.equal(roleGate(null, "approve").needs, "operator", "no role known is a viewer: the gate fails closed");
  assert.equal(
    roleGate("admin", "export").reason,
    "Only an owner can export the customer list.",
    "a role that is not one is a viewer too",
  );
  for (const perm of Object.keys(ROLE_PERMS.owner))
    assert.match(roleGate("viewer", perm).reason, /^Only an owner (or operator )?can [a-z].*\.$/, perm);
  // After the press, the server names the role a door wanted; the title is the one the gate said before it.
  assert.equal(
    refusalOf({ code: "forbidden", status: 403, details: { needs: "owner" }, write: true }).title,
    roleGate("viewer", "team").title,
  );
  assert.equal(
    refusalOf({ code: "forbidden", status: 403, details: { needs: "operator" }, write: true }).title,
    roleGate("viewer", "approve").title,
  );
});

/* ------------------------------ the page's gate ------------------------------ */

let cells = [];
// Where each hook keeps its state: by the component that calls it, as React keeps it (_hook-frames.mjs).
const frames = hookFrames();
globalThis.Icon = "Icon";
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
  useMemo: (fn) => {
    const k = frames.key();
    if (!(k in cells)) cells[k] = fn();
    return cells[k];
  },
  useEffect: (fn) => {
    const k = frames.key();
    if (!(k in cells)) {
      cells[k] = true;
      fn();
    }
  },
  useCallback: (fn) => fn,
};
globalThis.ReactDOM = { createPortal: (node) => node };
globalThis.document = {
  body: { appendChild() {} },
  addEventListener() {},
  createElement: () => ({ setAttribute() {}, style: {}, classList: { add() {}, remove() {}, contains: () => false } }),
};
/** Who is looking: the role store answers from the contracts' own table, the way the bridge publishes it. */
const role = { now: "owner" };
const asRole = (r) => {
  role.now = r;
};
globalThis.window = {
  __roleGate: roleGate,
  ST_STORE: { can: (a) => !!(ROLE_PERMS[role.now] || {})[a], myRole: () => role.now, get: (k, fallback) => fallback },
  __chrome: { state: stateOf },
  CHANLY: { nav() {}, R: {} },
  __surfaceState: () => "live",
  __DEMO_MODE: false,
  appNavigate() {},
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent() {},
  setTimeout: () => 1,
  clearTimeout() {},
  setInterval: () => 1,
  clearInterval() {},
};
await import("../../../apps/dashboard/src/legacy/components/data-bits.jsx");
await import("../../../apps/dashboard/src/legacy/components/record-fold.jsx");
await import("../../../apps/dashboard/src/legacy/components/message-preview.jsx");
await import("../../../apps/dashboard/src/legacy/components/template-chips.jsx");
await import("../../../apps/dashboard/src/legacy/components/campaign-bits.jsx");
for (const k of ["StatePill", "Confirm", "EmptyState", "FailedRead", "FieldError", "PolicyChip", "MoreMenu"])
  globalThis[k] = globalThis.window[k];
globalThis.StatStrip = globalThis.window.StatStrip || (({ children }) => children);
globalThis.StatCell = globalThis.window.StatCell || ((p) => p.value);
globalThis.useHotkey = () => {};
/** Where a pressed gate shows its reason: the tip, anchored to the control. */
const shown = [];
globalThis.window.__tip = { show: (el) => shown.push(el) };

const walk = (n, fn) => {
  if (n == null || typeof n !== "object") return;
  if (Array.isArray(n)) {
    for (const k of n) walk(k, fn);
    return;
  }
  fn(n);
  for (const k of n.props?.children ?? []) walk(k, fn);
  if (n.rendered !== undefined) walk(n.rendered, fn);
};
const find = (tree, pred) => {
  let hit = null;
  walk(tree, (n) => {
    if (!hit && pred(n)) hit = n;
  });
  return hit;
};
const byTestId = (tree, id) => find(tree, (n) => n.props?.["data-testid"] === id);
/** A press, with what a handler did to it. */
const press = (over = {}) => ({
  prevented: false,
  stopped: false,
  key: "Enter",
  currentTarget: { control: true },
  preventDefault() {
    this.prevented = true;
  },
  stopPropagation() {
    this.stopped = true;
  },
  ...over,
});

test("REGRESSION (A7): a control a role may not press stays reachable -- focusable, described, and saying why when pressed; it was disabled with a title nobody could reach", () => {
  asRole("viewer");
  const reason = "Only an owner or operator can snooze a conversation.";
  const g = globalThis.window.gate("approve", "snooze a conversation");
  assert.equal(g.disabled, false, "REGRESSION: a disabled button takes no focus and fires no hover");
  assert.equal(g.title, undefined, "no native title beside the styled tip");
  assert.equal(g["aria-disabled"], true);
  assert.equal(g["data-tip"], reason, "hover and focus show it");
  assert.equal(g["aria-description"], reason, "a screen reader hears it");
  assert.equal(g["data-gated"], "");

  // Spread after the control's own handlers, as every page spreads it.
  let acted = 0;
  const control = {
    onClick: () => {
      acted += 1;
    },
    onKeyDown: () => {
      acted += 1;
    },
    onPointerDown: () => {
      acted += 1;
    },
    onPointerUp: () => {
      acted += 1;
    },
    onKeyUp: () => {
      acted += 1;
    },
    ...g,
  };
  const click = press();
  control.onClick(click);
  assert.equal(acted, 0, "nothing happens");
  assert.ok(click.prevented && click.stopped);
  assert.equal(
    shown.at(-1),
    click.currentTarget,
    "pressing shows the reason where the control is -- a tap included, which no hover reaches",
  );
  const enter = press({ key: "Enter" });
  control.onKeyDown(enter);
  assert.equal(acted, 0);
  assert.ok(enter.stopped, "Enter stops here, so a row's own key handler does not act instead");
  const tab = press({ key: "Tab" });
  control.onKeyDown(tab);
  assert.equal(tab.prevented, false, "other keys pass: the control can be tabbed past");
  for (const h of ["onPointerDown", "onPointerUp", "onKeyUp"])
    assert.equal(control[h], undefined, `${h} is replaced too: Hold to talk would otherwise start the microphone`);

  asRole("operator");
  assert.deepEqual(
    globalThis.window.gate("approve", "snooze a conversation"),
    {},
    "a role that may gets nothing added",
  );
  assert.equal(globalThis.window.gate("settings")["data-tip"], "Only an owner can change the business details.");
});

test("presence and a busy menu refuse the same way: the reason reachable, the press inert", () => {
  asRole("owner");
  globalThis.window.PR_STORE.away = true;
  try {
    const t = globalThis.window.transferGate();
    assert.equal(t.disabled, false);
    assert.equal(t["aria-disabled"], true);
    assert.match(t["data-tip"], /Away/);
  } finally {
    globalThis.window.PR_STORE.away = false;
  }
  cells = [];
  frames.begin();
  const busy = globalThis.window.MoreMenu({ items: [], gated: "One moment — the last change is still saving" });
  const trigger = find(busy, (n) => n.type === "button");
  assert.equal(
    trigger.props["data-tip"],
    "One moment — the last change is still saving",
    "B21: a reason in a title is a reason nobody reads",
  );
  assert.equal(trigger.props.disabled, false);
  assert.equal(trigger.props["aria-disabled"], true);
});

test("REGRESSION (A12): a menu item takes a gate -- the Inbox menu's Snooze did nothing for a viewer, silently", () => {
  asRole("viewer");
  let snoozed = 0;
  cells = [];
  const draw = () => {
    frames.begin();
    return globalThis.window.MoreMenu({
      items: [
        { header: "Conversation" },
        {
          label: "Snooze",
          icon: "clock",
          onClick: () => {
            snoozed += 1;
          },
          gate: globalThis.window.gate("approve", "snooze a conversation"),
        },
      ],
    });
  };
  find(draw(), (n) => n.type === "button").props.onClick({ stopPropagation() {} });
  const item = find(draw(), (n) => n.type === "button" && n.props.role === "menuitem");
  assert.ok(item, "the menu opened");
  assert.equal(item.props["data-tip"], "Only an owner or operator can snooze a conversation.");
  item.props.onClick(press());
  assert.equal(snoozed, 0);
});

/* ------------------------------- a row's button ------------------------------- */

await import("../../../apps/dashboard/src/legacy/pages/attention-bits.jsx");

test("a row's main button takes a gate, and Enter on a button inside a row does not also open the row", () => {
  asRole("viewer");
  let approved = 0;
  let opened = 0;
  cells = [];
  frames.begin();
  const row = globalThis.window.AttnRow({
    name: "Win-back",
    cta: {
      label: "Approve",
      onClick: () => {
        approved += 1;
      },
      gate: globalThis.window.gate("approve", "approve a run"),
    },
    onOpen: () => {
      opened += 1;
    },
  });
  const cta = byTestId(row, "attention-cta");
  assert.equal(cta.props["data-tip"], "Only an owner or operator can approve a run.");
  cta.props.onClick(press());
  assert.equal(approved, 0);
  const inner = {
    key: "Enter",
    target: { inner: true },
    currentTarget: { row: true },
    preventDefault() {},
    stopPropagation() {},
  };
  row.props.onKeyDown(inner);
  assert.equal(opened, 0, "Enter on a button inside the row belongs to the button");
  const own = { key: "Enter", preventDefault() {} };
  own.target = own.currentTarget = { row: true };
  row.props.onKeyDown(own);
  assert.equal(opened, 1, "the row's own Enter still opens it");
});

/* ------------------------------------ Today ------------------------------------ */

await import("../../../apps/dashboard/src/legacy/pages/dashboard-a-command.jsx");
const { TODAY_HELPERS } = await import("../../../apps/dashboard/src/legacy-bridge/today.ts");
globalThis.window.__today = TODAY_HELPERS;

const metrics = {
  workspace: { name: "Melany's Beauty Salon", timezone: "America/New_York", status: "active" },
  channels: [{ kind: "whatsapp", status: "active", number: "+1 305" }],
  window: {
    days: 1,
    since: "2026-09-06T04:00:00Z",
    since_local: "2026-09-06T00:00:00",
    now_local: "2026-09-06T10:00:00",
  },
  now: {
    escalations_open: 0,
    oldest_open_escalation_at: null,
    threads_needing_human: 0,
    threads_snoozed: 0,
    threads_awaiting_reply: 0,
    last_inbound_at: "2026-09-06T13:00:00Z",
    last_outbound_at: "2026-09-06T13:01:00Z",
  },
  period: {
    messages_in: 5,
    messages_out_ai: 5,
    messages_out_you: 0,
    conversations_active: 3,
    answered_by_ai: 5,
    answered_by_you: 0,
    unanswered_in_window: 0,
    median_reply_seconds_ai: 40,
    send_failures: 0,
    escalations_new: 0,
    escalation_reasons: {},
    calls: 0,
    call_seconds: 0,
    call_sentiments: {},
    calls_voicemail: 0,
    new_contacts: 0,
  },
};

test("REGRESSION (D8): Today's Approve on a waiting run is gated for a viewer, with the reason -- it was offered and did nothing", () => {
  asRole("viewer");
  const rows = [];
  const AttnRow = globalThis.window.AttnRow;
  Object.assign(globalThis.window, {
    AttnRow: (p) => {
      rows.push(p);
      return null;
    },
    usePPToast: () => [null, () => {}],
    __BROADCASTS: {
      rows: [
        {
          id: "b1",
          state: "pending_approval",
          recipient_count: 3,
          audience: { label: "Win-back" },
          playbook_id: "p1",
          scheduled_for: null,
          when: "today 6:00 PM",
          counts: { sent: 0, replied: 0 },
        },
      ],
    },
    __broadcasts: { approve: async () => ({ ok: true, data: {} }), cancel: async () => ({ ok: true, data: {} }) },
    TODAY_DATA: toTodayVM(metrics, [], [], [], new Date("2026-09-06T14:00:00Z")),
  });
  try {
    cells = [];
    frames.begin();
    globalThis.window.AgentCommand();
    const run = rows.find((p) => p.testid === "brief-run-row");
    assert.ok(run, "the run waiting for approval");
    assert.ok(run.cta.gate, "REGRESSION: the run's Approve carried no gate while its Stop did");
    assert.equal(run.cta.gate["data-tip"], "Only an owner or operator can approve a run.");
  } finally {
    globalThis.window.AttnRow = AttnRow;
  }
});

/* ----------------------------------- Messages ----------------------------------- */

await import("../../../apps/dashboard/src/legacy/pages/messages.jsx");

test("REGRESSION (C17, C21): a viewer on Messages finds New message where it always is, gated with the reason -- it was hidden with no word -- and nothing listens for an event nobody sends", () => {
  asRole("viewer");
  const listening = [];
  const add = globalThis.window.addEventListener;
  Object.assign(globalThis.window, {
    __ME: { role: "viewer" },
    __TEMPLATES_ALL: [],
    __CHANNELS: [{ kind: "whatsapp", status: "active", number: "+1 305" }],
    __starters: undefined,
    __SETTINGS: { config: { brain: { business_name: "Melany's Beauty Salon" } } },
    addEventListener: (name) => listening.push(name),
  });
  try {
    cells = [];
    frames.begin();
    const tree = globalThis.window.MessagesPage();
    const write = byTestId(tree, "template-new");
    assert.ok(write, "REGRESSION: New message was hidden from a viewer, with no word why");
    assert.equal(write.props["data-tip"], "Only an owner or operator can write a template.");
    assert.ok(!listening.includes("messages:new"), "REGRESSION: a listener for an event nothing dispatches");
  } finally {
    globalThis.window.addEventListener = add;
  }
});
