/**
 * One Confirm, one danger button.
 *
 * Five idioms confirmed an act: a hand-rolled Yes/No sentence in four
 * wordings, a button that changed its own label on the first click, a typed
 * name, commit-then-Undo, and nothing at all on the most destructive act on
 * Settings -- removing a teammate fired straight from a menu item (the
 * audit's D13). One primitive now (data-bits.jsx Confirm), pure, so every
 * harness draws it. Run here: its shape, then the three doors the audit
 * named -- the Team row, a broadcast's stop, a playbook's delete -- each
 * mounted over a fake React and pressed.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { stateOf } from "@chanlytics/contracts";
import { hookFrames } from "./_hook-frames.mjs";

/* ------------------------------ the harness ------------------------------ */

let cells = [];
// Where each hook keeps its state: by the component that calls it, as React keeps it (_hook-frames.mjs).
const frames = hookFrames();
const fresh = () => {
  cells = [];
  frames.begin();
};
const calls = { flash: [], remove: [], cancel: [], arm: [], pbRemove: [], nav: [] };
globalThis.Icon = "Icon";
globalThis.StatStrip = "StatStrip";
globalThis.StatCell = "StatCell";
globalThis.PolicyChip = "PolicyChip";
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
globalThis.document = {
  body: {},
  addEventListener() {},
  createElement: () => ({ setAttribute() {}, style: {}, classList: { add() {}, remove() {} } }),
};
globalThis.window = {
  __chrome: { state: stateOf },
  __ME: { email: "ruben@rjcapital.io", role: "owner" },
  __SETTINGS: { role: "owner" },
  __TEAM: [
    { membershipId: "m-ruben", email: "ruben@rjcapital.io", displayName: "Ruben", role: "owner" },
    { membershipId: "m-lena", email: "lena@example.com", displayName: "Lena Park", role: "operator" },
  ],
  __TEAM_INVITES: [{ id: "i-jay", email: "jay@example.com", role: "viewer", expires_at: "2026-09-20T00:00:00Z" }],
  __identity: {
    member: ({ email, display_name }) => ({ name: display_name || email, sub: display_name ? email : null }),
    initials: (name, email) =>
      String(name || email)
        .slice(0, 2)
        .toUpperCase(),
  },
  __inviteState: () => ({ expired: false, words: "invite pending" }),
  __teamRemove: async (id) => {
    calls.remove.push(id);
    return { ok: true, data: { revokedInvite: id.startsWith("i-") } };
  },
  __teamSetRole: async () => ({ ok: true }),
  __teamInvite: async () => ({ ok: true }),
  __broadcasts: {
    cancel: async (id) => {
      calls.cancel.push(id);
      return { ok: true, data: { was: "sending" } };
    },
  },
  __playbooks: {
    remove: async (id) => {
      calls.pbRemove.push(id);
      return { ok: true, data: {} };
    },
  },
  __PLAYBOOKS: { triggers: [] },
  CHANLY: { nav: (to) => calls.nav.push(to), R: {} },
  location: { origin: "https://app.chanlytics.com", reload() {} },
  gate: () => ({}),
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent() {},
  setTimeout: () => 1,
  clearTimeout() {},
};
await import("../../../apps/dashboard/src/legacy/components/data-bits.jsx");
await import("../../../apps/dashboard/src/legacy/components/message-preview.jsx");
await import("../../../apps/dashboard/src/legacy/components/template-chips.jsx");
await import("../../../apps/dashboard/src/legacy/components/campaign-bits.jsx");
const { Confirm, MoreMenu, StatePill } = globalThis.window;
Object.assign(globalThis, { Confirm, MoreMenu, StatePill });

const walk = (n, fn) => {
  if (n == null || typeof n !== "object") return;
  fn(n);
  for (const k of n.props?.children ?? []) walk(k, fn);
  if (n.rendered) walk(n.rendered, fn);
};
const textOf = (n) => {
  const out = [];
  walk(n, (x) => {
    for (const k of x.props?.children ?? []) if (typeof k === "string" || typeof k === "number") out.push(String(k));
  });
  return out.join("");
};
const byTestId = (tree, id) => {
  let hit = null;
  walk(tree, (n) => {
    if (!hit && n.props?.["data-testid"] === id) hit = n;
  });
  return hit;
};
const byClass = (tree, cls) => {
  let hit = null;
  walk(tree, (n) => {
    if (!hit && typeof n.props?.className === "string" && n.props.className.split(" ").includes(cls)) hit = n;
  });
  return hit;
};
const flash = (m) => calls.flash.push(m);

/* ------------------------------ the primitive ---------------------------- */

test("the shape: the question, what happens, a Yes that names the verb as a real button, a quiet No; the testids from one name", () => {
  const c = Confirm({
    question: "Disconnect Google?",
    detail: "The public listing stays.",
    yes: "Yes, disconnect",
    onYes() {},
    onNo() {},
    testid: "google-disconnect",
  });
  assert.equal(c.props.className, "confirm");
  assert.equal(c.props.role, "group");
  assert.equal(c.props["aria-label"], "Disconnect Google?");
  assert.equal(c.props["data-testid"], "google-disconnect-confirm");
  const yes = byTestId(c, "google-disconnect-yes");
  const no = byTestId(c, "google-disconnect-no");
  assert.equal(yes.type, "button");
  assert.equal(yes.props.className, "btn btn-sm", "a real button, not a link");
  assert.equal(textOf(yes), "Yes, disconnect");
  assert.equal(yes.props.autoFocus, true, "the Yes takes focus as the question appears");
  assert.equal(textOf(no), "No");
  assert.equal(no.props.className, "cl-bucket-link");
  assert.ok(textOf(c).includes("The public listing stays."));
  assert.equal(byTestId(c, "google-disconnect-typed"), null, "no typing unless asked");
});

test("danger fills the Yes red; block draws a panel; busy holds both buttons and says what it is doing", () => {
  const d = Confirm({
    question: "Delete?",
    yes: "Yes, delete",
    danger: true,
    block: true,
    busy: true,
    busyLabel: "Deleting…",
    onYes() {},
    onNo() {},
    testid: "x",
  });
  assert.equal(d.props.className, "confirm confirm-block confirm-danger");
  const yes = byTestId(d, "x-yes");
  assert.equal(yes.props.className, "btn btn-sm btn-danger");
  assert.equal(yes.props.disabled, true);
  assert.equal(textOf(yes), "Deleting…");
  assert.equal(byTestId(d, "x-no").props.disabled, true);
});

test("Escape is No -- unless the act is already on its way", () => {
  let no = 0;
  let stopped = 0;
  Confirm({ question: "?", onYes() {}, onNo: () => no++ }).props.onKeyDown({
    key: "Escape",
    stopPropagation: () => stopped++,
  });
  assert.equal(no, 1);
  assert.equal(stopped, 1, "the key does not reach the row behind");
  Confirm({ question: "?", onYes() {}, onNo: () => no++ }).props.onKeyDown({
    key: "Enter",
    stopPropagation: () => stopped++,
  });
  assert.equal(no, 1, "Enter is the Yes button's own");
  Confirm({ question: "?", busy: true, onYes() {}, onNo: () => no++ }).props.onKeyDown({
    key: "Escape",
    stopPropagation: () => stopped++,
  });
  assert.equal(no, 1, "busy: the act is on its way, Escape does nothing");
});

test("a typed name gates the Yes -- erasure only -- and the page may know a better match", () => {
  const props = {
    question: "Delete this person?",
    typed: "Rosa M",
    yes: "Delete this person",
    danger: true,
    onYes() {},
    onNo() {},
    testid: "delete",
  };
  const empty = Confirm({ ...props, value: "" });
  assert.equal(byTestId(empty, "delete-yes").props.disabled, true);
  const input = byTestId(empty, "delete-typed");
  assert.equal(input.type, "input");
  assert.equal(input.props.placeholder, "Rosa M");
  assert.equal(input.props["aria-label"], "Type Rosa M to confirm");
  assert.equal(input.props.autoFocus, true);
  assert.equal(byTestId(empty, "delete-yes").props.autoFocus, false, "the input has the focus, not the button");
  assert.equal(
    byTestId(Confirm({ ...props, value: "rosa" }), "delete-yes").props.disabled,
    true,
    "close is not the name",
  );
  assert.equal(
    byTestId(Confirm({ ...props, value: " Rosa M " }), "delete-yes").props.disabled,
    false,
    "the name, whitespace forgiven",
  );
  assert.equal(
    byTestId(Confirm({ ...props, value: "+1 646 555 0123", ready: true }), "delete-yes").props.disabled,
    false,
    "ready overrides: the page matched their phone number",
  );
  assert.equal(
    byTestId(Confirm({ ...props, value: "Rosa M", ready: false }), "delete-yes").props.disabled,
    true,
    "and can refuse what would otherwise match",
  );
  let typed = null;
  byTestId(
    Confirm({
      ...props,
      value: "",
      onType: (v) => {
        typed = v;
      },
    }),
    "delete-typed",
  ).props.onChange({ target: { value: "Ro" } });
  assert.equal(typed, "Ro", "the text is the page's, so the record keeps it");
  const err = byClass(Confirm({ ...props, value: "Rosa M", error: "Could not delete this person." }), "confirm-error");
  assert.ok(err);
  assert.equal(err.props.role, "alert");
  assert.equal(textOf(err), "Could not delete this person.");
});

/* -------------------- Settings › Team: the D13 door ---------------------- */

await import("../../../apps/dashboard/src/legacy/pages/settings.jsx");
const TeamSection = globalThis.window.TeamSection;
const drawTeam = () => {
  frames.begin();
  return TeamSection({ flash });
};
/** The row menu that offers `label`, as the props the card handed the shared MoreMenu. */
const menuFor = (tree, label) => {
  let hit = null;
  walk(tree, (n) => {
    if (!hit && n.type === MoreMenu && (n.props.items || []).some((i) => i.label === label)) hit = n;
  });
  return hit;
};

test("REGRESSION (D13): removing a teammate asks first -- the menu item arms, the row asks, and only the Yes reaches the server, with the membership id", async () => {
  fresh();
  let tree = drawTeam();
  assert.equal(byTestId(tree, "team-remove-confirm"), null, "nothing is asked until the menu is used");
  const menu = menuFor(tree, "Remove");
  assert.ok(menu, "Lena's row has the menu with Remove");
  menu.props.items.find((i) => i.label === "Remove").onClick();
  assert.deepEqual(calls.remove, [], "REGRESSION: the menu item used to remove on the spot");
  tree = drawTeam();
  const ask = byTestId(tree, "team-remove-confirm");
  assert.ok(ask, "the row asks");
  assert.ok(textOf(ask).includes("Remove Lena Park from the team?"), textOf(ask));
  assert.ok(textOf(ask).includes("They lose access at once"));
  const yes = byTestId(tree, "team-remove-yes");
  assert.equal(yes.props.className, "btn btn-sm btn-danger", "the act that cannot be taken back is red");
  assert.equal(textOf(yes), "Yes, remove");
  byTestId(tree, "team-remove-no").props.onClick();
  tree = drawTeam();
  assert.equal(byTestId(tree, "team-remove-confirm"), null, "No disarms");
  menuFor(tree, "Remove")
    .props.items.find((i) => i.label === "Remove")
    .onClick();
  tree = drawTeam();
  await byTestId(tree, "team-remove-yes").props.onClick();
  assert.deepEqual(calls.remove, ["m-lena"], "the membership id, as the route takes it");
  tree = drawTeam();
  assert.equal(byTestId(tree, "team-remove-confirm"), null, "disarmed after the act");
  const said = calls.flash.at(-1);
  assert.equal(said.tone, "ok");
  assert.ok(textOf(said.msg).includes("removed from the team"));
});

test("revoking an invitation asks in its own words", () => {
  fresh();
  let tree = drawTeam();
  menuFor(tree, "Revoke invite")
    .props.items.find((i) => i.label === "Revoke invite")
    .onClick();
  tree = drawTeam();
  const ask = byTestId(tree, "team-remove-confirm");
  assert.ok(ask, "the invitation's row asks");
  assert.ok(textOf(ask).includes("Revoke the invitation to jay@example.com?"), textOf(ask));
  assert.ok(textOf(ask).includes("The link in their email stops working."));
  assert.equal(textOf(byTestId(tree, "team-remove-yes")), "Yes, revoke");
});

/* ------------------- Broadcasts: three verbs, each armed ------------------ */

await import("../../../apps/dashboard/src/legacy/pages/broadcasts-real.jsx");
// The run's card on the ledger, where the stop now lives.
const BcRunCard = globalThis.window.BcRunCard;
const broadcast = (state) => ({
  id: `b-${state}`,
  name: "September offer",
  state,
  stateLabel: state,
  when: "today 10:00",
  audience: { label: "Everyone who said yes" },
  recipient_count: 40,
  counts: { sent: 12, skipped: 1, failed: 0 },
});

test("a broadcast's stop is armed and named for what it does: Stop a send, Skip a run nobody approved, Cancel one still to come", async () => {
  fresh();
  // The verbs, as the run's report draws them for every run still open.
  const BcRunVerbs = globalThis.window.BcRunVerbs;
  const draw = (state, armed, canSend = true) => {
    frames.begin();
    return BcRunVerbs({
      row: broadcast(state),
      canSend,
      armed,
      onArm: (on) => calls.arm.push(on),
      stopping: false,
      approve() {},
      cancel: (r) => globalThis.window.__broadcasts.cancel(r.id),
    });
  };
  for (const [state, verb, question, yes] of [
    ["sending", "Stop", "Stop September offer?", "Yes, stop it"],
    ["pending_approval", "Skip", "Skip September offer?", "Yes, skip it"],
    ["scheduled", "Cancel", "Cancel September offer?", "Yes, cancel it"],
  ]) {
    const quiet = draw(state, false);
    const trigger = byTestId(quiet, "bc-stop");
    assert.equal(textOf(trigger), verb, state);
    assert.equal(trigger.props.className, "btn btn-sm danger", "the quiet danger form arms");
    assert.equal(byTestId(quiet, "bc-stop-confirm"), null);
    trigger.props.onClick();
    assert.equal(calls.arm.at(-1), true, "the button arms, it does not cancel");
    const asked = draw(state, true);
    assert.equal(byTestId(asked, "bc-stop"), null, "while asked, the trigger is gone");
    assert.equal(byTestId(asked, "bc-approve"), null, "and so is Approve");
    assert.ok(textOf(byTestId(asked, "bc-stop-confirm")).includes(question), state);
    assert.equal(textOf(byTestId(asked, "bc-stop-yes")), yes);
  }
  assert.deepEqual(calls.cancel, [], "REGRESSION: one click used to cancel");
  await byTestId(draw("sending", true), "bc-stop-yes").props.onClick();
  assert.deepEqual(calls.cancel, ["b-sending"]);
  assert.equal(byTestId(draw("sending", false, false), "bc-stop"), null, "a viewer has no stop to arm");
  // On the ledger only a run waiting on the owner carries its acts -- Approve, and Skip armed the same way, on its
  // row. A run to come or going out is cancelled or stopped from its report (23 Sep, Campaigns made compact).
  const row = (state, armed = false) => {
    frames.begin();
    return BcRunCard({
      row: broadcast(state),
      now: Date.now(),
      canSend: true,
      onOpen() {},
      armed,
      onArm: (on) => calls.arm.push(on),
      stopping: false,
      approve() {},
      cancel() {},
    });
  };
  assert.ok(
    byTestId(row("pending_approval"), "bc-approve"),
    "unarmed, a run waiting for approval still offers Approve",
  );
  assert.equal(textOf(byTestId(row("pending_approval"), "bc-stop")), "Skip");
  assert.ok(textOf(byTestId(row("pending_approval", true), "bc-stop-confirm")).includes("Skip September offer?"));
  for (const state of ["sending", "scheduled"]) {
    assert.equal(byTestId(row(state), "bc-stop"), null, `${state}: its stop is its report's`);
  }
});

/* ---------------- Playbooks: the delete that was two clicks --------------- */

await import("../../../apps/dashboard/src/legacy/pages/outbound-real.jsx");
const PlaybookCard = globalThis.window.PlaybookCard;
const playbook = {
  id: "pb-1",
  name: "Win-back",
  state: "running",
  trigger: "winback",
  triggerLabel: "Quiet 30 days",
  triggerHint: "",
  schedule: "daily at 10:00",
  next: "tomorrow 10:00",
  policy_class: "marketing",
  template_name: "winback_offer",
  template_language: "en_US",
  candidates: 3,
  last_run_for: null,
  totals: { waiting: null, runs: 2, sent: 10, delivered: 9, replied: 1, held: 0, history: [] },
};

test("a playbook's delete asks through the one Confirm -- it used to relabel its own button and fire on the second click", async () => {
  fresh();
  const draw = () => {
    frames.begin();
    return PlaybookCard({ p: playbook, canAct: true, onEdit() {}, flash });
  };
  let tree = draw();
  const del = byTestId(tree, "pb-delete");
  assert.equal(textOf(del), "Delete");
  assert.equal(del.props.className, "btn btn-ghost btn-sm danger");
  del.props.onClick();
  assert.deepEqual(calls.pbRemove, [], "the first click arms");
  tree = draw();
  assert.equal(byTestId(tree, "pb-delete"), null, "the trigger gives way to the question");
  const ask = byTestId(tree, "pb-delete-confirm");
  assert.ok(ask);
  assert.ok(
    textOf(ask).includes("Delete Win-back?") && textOf(ask).includes("Its runs stay in Broadcasts"),
    textOf(ask),
  );
  byTestId(tree, "pb-delete-no").props.onClick();
  tree = draw();
  assert.ok(byTestId(tree, "pb-delete"), "No brings the trigger back");
  byTestId(tree, "pb-delete").props.onClick();
  tree = draw();
  await byTestId(tree, "pb-delete-yes").props.onClick();
  assert.deepEqual(calls.pbRemove, ["pb-1"]);
  tree = draw();
  assert.equal(byTestId(tree, "pb-delete-confirm"), null, "disarmed after the act");
  assert.ok(textOf(calls.flash.at(-1).msg).includes("deleted"));
});
