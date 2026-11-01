/**
 * Not a fit's toast (sheet/not-fit.tsx): its Undo takes back the Not a fit that stands, and says so when it cannot.
 *
 * A reason is the tap taken back and made again with it (sheet/run.ts notFitOne, pile/use-pile.ts giveWhy), so the act
 * that stands changes while the toast is up, and a press of Undo in that moment named the tap, already taken back: the
 * door refused it and the page said nothing, the lead left set aside (leads.spec's own run, 1 Nov 2026). In a pile the
 * toast held the pile as it was before the press, so its Undo saw nothing done, or the act before.
 *
 * Run over the real doors (surfaces/leads/surface.ts) on a faked `window.fetch` that keeps a lead's versions and refuses
 * as `lead_undo` does: an operation already undone, or one the lead has moved past. The stub React keeps each hook's
 * state and draws when this file asks, so a toast keeps the draw it was made from, as it does in the app.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { hookFrames } from "../../_hook-frames.mjs";
import { useStubHooks } from "../../_legacy-react.mjs";
import { until } from "../../shared/_until.mjs";

let cells = {};
const frames = hookFrames();

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
  useId: () => `:r${frames.key()}:`,
  useEffect: (fn) => {
    const k = frames.key();
    if (!(k in cells)) {
      cells[k] = true;
      fn();
    }
  },
  useSyncExternalStore: (_subscribe, snapshot) => snapshot(),
};
useStubHooks();

const storage = () => {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
};
globalThis.localStorage = storage();
globalThis.sessionStorage = storage();
globalThis.document = { addEventListener() {}, removeEventListener() {} };
const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** The door's side: each lead's stage and version, the operations it made, and what it was sent, in order. */
let door;
const freshDoor = () => ({ leads: new Map(), ops: new Map(), sent: [], held: null, next: 1 });

/** An act the door takes: the lead moves on a version, and the operation that undoes it stands at that version. */
const made = (id, to) => {
  const lead = door.leads.get(id);
  const was = lead.stage;
  lead.stage = to;
  lead.version += 1;
  const op = `op-${door.next++}`;
  door.ops.set(op, { id, was, version: lead.version, undone: false });
  return { ok: true, data: { stage: to, op_id: op, version: lead.version, toast: "Done." } };
};

/** As `lead_undo` does: an operation undone once, or one the lead has moved past, is refused. */
const undone = (opId, version) => {
  const op = door.ops.get(opId);
  const lead = door.leads.get(op.id);
  const code = op.undone ? "That change was already undone." : lead.version !== version ? "That lead changed." : null;
  if (code) return json(409, { ok: false, error: { code: "conflict", message: code } });
  op.undone = true;
  lead.stage = op.was;
  lead.version += 1;
  return json(200, { ok: true, data: { undone: true } });
};

globalThis.window = {
  location: { pathname: "/w/harbor", hash: "", origin: "https://app.chanlytics.com", assign() {}, replace() {} },
  __WORKSPACES: [{ id: "ws-harbor", timezone: "America/Chicago" }],
  __ACTIVE_WORKSPACE: "ws-harbor",
  localStorage: globalThis.localStorage,
  sessionStorage: globalThis.sessionStorage,
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent: () => true,
  refusalToast: (r, what) => ({ tone: "danger", msg: what }),
  fetch: async (url, init = {}) => {
    const { pathname } = new URL(String(url), "https://app.chanlytics.com");
    const body = init.body ? JSON.parse(init.body) : undefined;
    const stage = /^\/api\/v1\/leads\/([^/]+)\/stage$/.exec(pathname);
    if (stage) {
      door.sent.push(["stage", stage[1], body.why]);
      const answer = json(200, made(stage[1], "archived"));
      // The door has done it; the page has not heard. That moment is the one under test.
      if (door.held && body.why === door.held.why) await door.held.until;
      return answer;
    }
    const later = /^\/api\/v1\/leads\/([^/]+)\/later$/.exec(pathname);
    if (later) {
      door.sent.push(["later", later[1]]);
      return json(200, made(later[1], "nurture"));
    }
    const undo = /^\/api\/v1\/lead-operations\/([^/]+)\/undo$/.exec(pathname);
    if (undo) {
      door.sent.push(["undo", undo[1], body.version]);
      return undone(undo[1], body.version);
    }
    return json(200, { ok: true, data: {} });
  },
};

const { runSheetAct } = await import("../../../../../apps/dashboard/src/surfaces/leads/sheet/run.ts");
const { useLeadPile } = await import("../../../../../apps/dashboard/src/surfaces/leads/pile/use-pile.ts");

const SEARCH = "5e000000-0000-4000-8000-000000000001";
const HYDE = { id: "lead-hyde", name: "Hyde Park Strength", searchId: SEARCH };
const TRAVIS = { id: "lead-travis", name: "Travis Heights Coaching", searchId: SEARCH };
const AIM = { targets: [], target: null, load: async () => {}, check: async () => {}, choose() {}, reset() {} };

let flashes;
let moved;
const flash = (t) => flashes.push(t);

/** A page's worth of nothing: the two leads as the door holds them, and no toast yet. */
const reset = () => {
  door = freshDoor();
  for (const row of [HYDE, TRAVIS]) door.leads.set(row.id, { stage: "nurture", version: 1 });
  cells = {};
  flashes = [];
  moved = 0;
  frames.reset();
};

/** What the sheet hands a press (sheet.tsx `run`). */
const runOf = (row, pile) => ({
  row,
  leadId: row.id,
  name: row.name,
  contactId: null,
  on: null,
  pile,
  aim: AIM,
  flash,
  place: null,
  elsewhere: null,
  next: null,
  openPicker() {},
  askToSend() {},
  askSaid() {},
  moved: () => {
    moved += 1;
  },
  over: false,
});

/** The page's pile, drawn again as React would after a change: a press takes the draw it was made from. */
function PileOwner() {
  return useLeadPile({ flash, aim: AIM });
}
const drawPile = () => {
  frames.begin();
  return frames.render(PileOwner, {});
};
const openPile = () => {
  drawPile().start(SEARCH, "qualified");
  return drawPile();
};

const inTree = (node, id) => {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const kid of node) {
      const hit = inTree(kid, id);
      if (hit) return hit;
    }
    return null;
  }
  if (node.props?.["data-testid"] === id) return node;
  return inTree(node.rendered, id) ?? inTree(node.props?.children, id);
};

/** The reason pressed in the toast, as the owner presses it. */
const giveReason = (toast, why) => inTree(toast.msg, `lead-not-fit-${why}`).props.onClick();

/** Hold the door's answer to a reason: `go` lets it reach the page. */
const holdAnswer = (why) => {
  let go;
  door.held = { why, until: new Promise((r) => (go = r)) };
  return go;
};

const sentCount = (kind) => door.sent.filter((s) => s[0] === kind).length;
const stageOf = (row) => door.leads.get(row.id).stage;

/** The lead went aside by one press: the toast it left, once the door has answered. */
const pressNotFit = async (row, pile) => {
  const before = flashes.length;
  await runSheetAct({ act: "not_a_fit" }, runOf(row, pile));
  assert.equal(flashes.length, before + 1, "the press says what it did");
  return flashes.at(-1);
};

test("out of a pile: Undo pressed while the reason is on its way takes back the reason's act, and the lead is as it was", async () => {
  reset();
  const toast = await pressNotFit(HYDE, null);
  const go = holdAnswer("chain");
  giveReason(toast, "chain");
  await until(() => sentCount("stage") === 2, "the reason sent");
  const pressed = toast.undo();
  go();
  await pressed;
  await until(() => stageOf(HYDE) === "nurture", "the lead put back");
  assert.deepEqual(door.sent, [
    ["stage", HYDE.id, "other"],
    ["undo", "op-1", 2],
    ["stage", HYDE.id, "chain"],
    ["undo", "op-2", 4],
  ]);
  assert.equal(flashes.length, 1, "nothing refused, so nothing more said");
});

test("out of a pile: Undo after the reason has landed takes back the reason's act", async () => {
  reset();
  const toast = await pressNotFit(HYDE, null);
  giveReason(toast, "chain");
  await until(() => sentCount("stage") === 2 && moved >= 2, "the reason kept");
  await toast.undo();
  assert.equal(stageOf(HYDE), "nurture");
});

test("out of a pile: an Undo the door refuses says so, and the page reads the lead again", async () => {
  reset();
  const toast = await pressNotFit(HYDE, null);
  door.leads.get(HYDE.id).version += 1; // Someone else moved the lead.
  const seen = moved;
  await toast.undo();
  assert.deepEqual(
    flashes.map((f) => f.tone),
    ["ok", "danger"],
  );
  assert.equal(flashes.at(-1).msg, "Nothing was put back");
  assert.equal(moved, seen + 1);
  assert.equal(stageOf(HYDE), "archived");
});

test("out of a pile: a reason refused after its tap was taken back leaves nothing for Undo to name", async () => {
  reset();
  const toast = await pressNotFit(HYDE, null);
  const fetched = globalThis.window.fetch;
  globalThis.window.fetch = async (url, init) => {
    if (/\/stage/.test(String(url))) return json(409, { ok: false, error: { code: "conflict", message: "Not that." } });
    return fetched(url, init);
  };
  try {
    giveReason(toast, "chain");
    await until(() => flashes.length === 2, "the reason refused");
    assert.equal(flashes.at(-1).msg, "The reason was not kept");
    await toast.undo();
  } finally {
    globalThis.window.fetch = fetched;
  }
  assert.deepEqual(
    door.sent.filter((s) => s[0] === "undo"),
    [["undo", "op-1", 2]],
    "the tap is gone already: the lead stands as it was, and a second undo would only be refused",
  );
  assert.equal(flashes.length, 2);
});

test("in a pile: the toast's Undo on the first press takes back that Not a fit", async () => {
  reset();
  const toast = await pressNotFit(HYDE, openPile());
  drawPile();
  await toast.undo();
  await until(() => stageOf(HYDE) === "nurture", "the lead put back");
  assert.deepEqual(door.sent.at(-1), ["undo", "op-1", 2]);
  assert.equal(drawPile().canUndo, false, "and the pile has nothing left to take back");
});

test("in a pile: a reason is the tap taken back and made again, so the pile's Undo takes back the reason's act", async () => {
  reset();
  const toast = await pressNotFit(HYDE, openPile());
  drawPile();
  giveReason(toast, "chain");
  await until(() => sentCount("stage") === 2, "the reason sent");
  await until(() => drawPile().lastWhy === "chain", "the reason kept");
  assert.deepEqual(door.sent, [
    ["stage", HYDE.id, "other"],
    ["undo", "op-1", 2],
    ["stage", HYDE.id, "chain"],
  ]);
  await drawPile().undo();
  assert.equal(stageOf(HYDE), "nurture", "the page's own Undo, as the toast's");
  assert.equal(flashes.length, 1);
});

test("in a pile: Undo pressed while the reason is on its way takes back the reason's act", async () => {
  reset();
  const toast = await pressNotFit(HYDE, openPile());
  drawPile();
  const go = holdAnswer("chain");
  giveReason(toast, "chain");
  await until(() => sentCount("stage") === 2, "the reason sent");
  const pressed = toast.undo();
  go();
  await pressed;
  await until(() => stageOf(HYDE) === "nurture", "the lead put back");
  assert.equal(flashes.length, 1, "nothing refused");
});

test("in a pile: the toast's Undo takes back its own lead, whatever was done since and before", async () => {
  reset();
  await runSheetAct({ act: "later" }, runOf(TRAVIS, openPile()));
  const toast = await pressNotFit(HYDE, drawPile());
  drawPile();
  await toast.undo();
  await until(() => stageOf(HYDE) === "nurture", "the Not a fit taken back");
  assert.deepEqual(door.sent.at(-1), ["undo", "op-2", 2], "the act its toast names, not the Later before it");
  assert.equal(door.ops.get("op-1").undone, false);
  reset();
  const named = await pressNotFit(HYDE, openPile());
  await runSheetAct({ act: "later" }, runOf(TRAVIS, drawPile()));
  drawPile();
  await named.undo();
  await until(() => stageOf(HYDE) === "nurture", "the Not a fit taken back");
  assert.equal(door.ops.get("op-2").undone, false, "the Later since it stands");
  assert.equal(drawPile().done.length, 1, "and is still the pile's to take back");
});

test("in a pile: a toast whose Not a fit has left the pile's three says nothing was put back", async () => {
  reset();
  const toast = await pressNotFit(HYDE, openPile());
  for (let i = 0; i < 3; i++) await runSheetAct({ act: "later" }, runOf(TRAVIS, drawPile()));
  drawPile();
  await toast.undo();
  assert.equal(stageOf(HYDE), "archived");
  assert.equal(flashes.at(-1).msg, "Nothing was put back");
});
