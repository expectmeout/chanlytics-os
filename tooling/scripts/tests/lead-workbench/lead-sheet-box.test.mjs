/**
 * The email on the lead sheet, and the box it becomes (sheet/email-box.tsx, decision 0096): read at rest; a tap, never a
 * drag, begins the typing where it fell; saved as it is left, never mid-sentence, with Undo; the rules said under the box
 * before the door is asked and the door's refusal over what was typed; the step's words back when they are typed back or
 * asked for; words that cannot go asked about rather than lost; and the dock's place while it is typed. Run over the real
 * verbs and contracts on a faked `window.fetch`; the stub React keeps each hook's state and draws when this file asks.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { hookFrames } from "../_hook-frames.mjs";
import { useStubHooks } from "../_legacy-react.mjs";
import { until } from "../shared/_until.mjs";

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
  // An effect runs as React runs it: when what it depends on changed, its clean-up first.
  useEffect: (fn, deps) => {
    const k = frames.key();
    const was = cells[k];
    if (!was || !deps || deps.some((d, i) => d !== was.deps[i])) {
      was?.stop?.();
      cells[k] = { deps, stop: fn() };
    }
  },
  useLayoutEffect: () => {},
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
globalThis.document = { addEventListener() {}, removeEventListener() {}, hasFocus: () => true };

const SEQ = "5e000000-0000-4000-8000-0000000000aa";
const STEP = "5e000000-0000-4000-8000-0000000000bb";
const LEAD = "5e000000-0000-4000-8000-0000000000cc";
const NEXT = "5e000000-0000-4000-8000-0000000000dd";
const SEND = "5e000000-0000-4000-8000-0000000000ee";

/** What the doors were sent, in order, and what the door answers: what stood before, or a refusal. */
const sent = [];
const door = {
  refuse: null,
  was: null,
  sent: { ok: true, data: { subject: "What went", body: "It went." } },
};
const kept = new Map();
const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
globalThis.window = {
  location: { pathname: "/w/harbor", hash: "", origin: "https://app.chanlytics.com", assign() {}, replace() {} },
  __WORKSPACES: [{ id: "ws-harbor", timezone: "America/Chicago" }],
  __ACTIVE_WORKSPACE: "ws-harbor",
  localStorage: globalThis.localStorage,
  sessionStorage: globalThis.sessionStorage,
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent: () => true,
  refusalToast: (r, what) => ({ tone: "danger", msg: r?.message ?? what }),
  // The tab's memory, as legacy-bridge/tab-memory.ts keeps a draft: per kind and key.
  __tabMemory: {
    draft: (kind, key) => kept.get(`${kind}:${key}`) ?? null,
    keepDraft: (kind, value, key) => kept.set(`${kind}:${key}`, value),
    dropDraft: (kind, key) => kept.delete(`${kind}:${key}`),
  },
  fetch: async (url, init = {}) => {
    const { pathname } = new URL(String(url), "https://app.chanlytics.com");
    sent.push([init.method ?? "GET", pathname, init.body ? JSON.parse(init.body) : undefined]);
    if (/\/sent\//.test(pathname))
      return door.sent.ok
        ? json(200, door.sent)
        : json(500, { ok: false, error: { code: "internal", message: "It did not answer." } });
    if (/\/lead-words$/.test(pathname)) {
      if (door.refuse) return json(422, { ok: false, error: { code: "validation", message: door.refuse } });
      return json(200, { ok: true, data: { step_id: STEP, lead_id: LEAD, send_id: SEND, was: door.was } });
    }
    return json(200, { ok: true, data: {} });
  },
};

const { installFrameGlobals } = await import("../../../../apps/dashboard/src/surfaces/frame/frame-globals.ts");
installFrameGlobals();
const box = await import("../../../../apps/dashboard/src/surfaces/leads/sheet/email-box.tsx");
const { GRAB_AT } = await import("../../../../apps/dashboard/src/surfaces/kit/motion/swipe.ts");
const { Menu } = await import("../../../../apps/dashboard/src/surfaces/kit/menu/menu.tsx");
const {
  LEAD_CARD_WORDS,
  LEAD_SHEET_WORDS,
  LEAD_WORDS_BOX: B,
  leadWordsPieces,
  placeLineWriting,
} = await import("@chanlytics/contracts");

const inTree = (node, test_) => {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const kid of node) {
      const hit = inTree(kid, test_);
      if (hit) return hit;
    }
    return null;
  }
  if (test_(node)) return node;
  return inTree(node.rendered, test_) ?? inTree(node.props?.children, test_);
};
const byId = (node, id) => inTree(node, (n) => n.props?.["data-testid"] === id);
const textOf = (node) => {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  return node.rendered ? textOf(node.rendered) : textOf(node.props?.children);
};

const WORKSPACE = { businessName: "Harbor Moving Co", yourName: "Sam", bookingLink: null };
const THE_LEAD = { business_name: "Luxe Lane", city: "Austin", email: "hi@luxelane.example" };
const OPENING = "Luxe Lane's weekend chair is booked out.";
const STEP_WORDS = { subject: "Quick one for {{business}}", body: "{{opening}}\n\nI run Harbor.\n\n{{your name}}" };
const editOf = (over = {}) => ({
  sequenceId: SEQ,
  stepId: STEP,
  leadId: LEAD,
  name: "Luxe Lane",
  first: true,
  own: false,
  written: STEP_WORDS,
  stepWritten: STEP_WORDS,
  lead: THE_LEAD,
  workspace: WORKSPACE,
  opening: OPENING,
  ...over,
});
const mailOf = (edit = editOf(), over = {}) => ({
  to: THE_LEAD.email,
  subject: "Quick one for Luxe Lane",
  pieces: leadWordsPieces({
    body: edit.written.body,
    lead: edit.lead,
    workspace: edit.workspace,
    opening: edit.opening,
  }),
  ending: "Sam",
  opening: null,
  writing: false,
  rewrite: false,
  tall: false,
  edit,
  wordsUnread: false,
  ...over,
});

/** The sheet's two halves as it holds them: the email, and the dock's place. What each said back is kept. */
function sheetOf(mail = mailOf()) {
  const said = { flashes: [], moved: 0, opened: 0, words: [], then: 0 };
  const held = { leadId: LEAD, mail, box: null };
  const Host = () => {
    held.box = box.useEmailBox({
      leadId: held.leadId,
      flash: (f) => said.flashes.push(f),
      moved: () => (said.moved += 1),
      open: () => (said.opened += 1),
      said: (stepId, words) => said.words.push([stepId, words]),
    });
    return globalThis.React.createElement(
      "div",
      null,
      globalThis.React.createElement(box.SheetEmail, {
        mail: held.mail,
        whole: true,
        onWhole: null,
        onRewrite: null,
        onUndo: null,
        box: held.box,
      }),
      globalThis.React.createElement(box.SheetBoxDock, {
        box: held.box,
        run: null,
        flash: (f) => said.flashes.push(f),
        moved: () => (said.moved += 1),
      }),
    );
  };
  const draw = () => {
    frames.begin();
    return frames.render(Host, {});
  };
  draw();
  return { said, held, draw, now: () => (draw(), held.box) };
}
/** A press on the email at rest, as sheet.tsx's click arrives: the same element, and no words selected. */
const press = (node, from = { clientX: 40, clientY: 40 }, to = from) => {
  const el = { contains: () => false };
  node.props.onPointerDown({ currentTarget: el, ...from });
  node.props.onClick({ currentTarget: el, ...to });
};
const doorCalls = () => sent.filter(([, p]) => /\/lead-words$/.test(p));

beforeEach(() => {
  sent.length = 0;
  door.refuse = null;
  door.was = null;
  door.sent = { ok: true, data: { subject: "What went", body: "It went." } };
  kept.clear();
  cells = {};
  frames.reset();
  globalThis.window.ST_STORE = { can: () => true, myRole: () => "owner" };
  globalThis.window.getSelection = () => null;
});

test("at rest the email is read, not a box: its words as they go, Edit beside them, and nothing asked of the door", () => {
  const { draw } = sheetOf();
  const tree = draw();
  assert.equal(textOf(byId(tree, "lead-card-subject")), "Quick one for Luxe Lane");
  assert.match(textOf(byId(tree, "lead-card-body")), /Luxe Lane's weekend chair is booked out\.\s+I run Harbor\./);
  assert.equal(textOf(byId(tree, "lead-card-ending")), "Sam");
  assert.ok(byId(tree, "lead-sheet-box-edit"));
  assert.equal(byId(tree, "lead-sheet-box-body"), null);
  assert.equal(byId(tree, "lead-sheet-box-dock"), null);
  assert.equal(sent.length, 0);
});

test("one tap draws the box with the words it read, the sheet raised and the dock's place Done", () => {
  const s = sheetOf();
  press(byId(s.draw(), "lead-card-body"));
  const tree = s.draw();
  assert.equal(s.said.opened, 1, "the sheet is raised");
  const body = byId(tree, "lead-sheet-box-body");
  assert.equal(body.props.value, `${OPENING}\n\nI run Harbor.\n\nSam`, "a value where a slot stood, as it read");
  assert.equal(byId(tree, "lead-sheet-box-subject").props.value, "Quick one for Luxe Lane");
  assert.equal(textOf(byId(tree, "lead-sheet-box-foot")), B.foot);
  assert.ok(byId(tree, "lead-sheet-box-done"));
  assert.equal(byId(tree, "lead-sheet-box-back"), null, "nothing of theirs to put back, and nothing typed");
});

test("a drag across the email walks the leads, words being selected are selected: neither begins the typing", () => {
  const s = sheetOf();
  press(byId(s.draw(), "lead-card-body"), { clientX: 40, clientY: 40 }, { clientX: 40 + GRAB_AT, clientY: 40 });
  assert.equal(s.now().typing, null, "a drag");
  globalThis.window.getSelection = () => ({ toString: () => "booked out" });
  press(byId(s.draw(), "lead-card-body"));
  assert.equal(s.now().typing, null, "a selection");
});

test("Done with nothing changed asks nothing of the door", async () => {
  const s = sheetOf();
  press(byId(s.draw(), "lead-card-body"));
  assert.equal(await s.now().done(), true);
  assert.equal(s.now().typing, null);
  assert.equal(doorCalls().length, 0);
  assert.deepEqual(s.said.flashes, []);
});

test("what is typed is saved as it is left: its values go back to their slots with no character changed, and the toast holds Undo", async () => {
  const s = sheetOf();
  press(byId(s.draw(), "lead-card-body"));
  const typed = `${OPENING} Tuesdays too.\n\nI run Harbor.\n\nSam`;
  byId(s.draw(), "lead-sheet-box-body").props.onValueChange(typed);
  assert.equal(doorCalls().length, 0, "never mid-sentence");
  assert.equal(s.now().dirty, true);
  assert.deepEqual(
    kept.get(`lead_email:${STEP}:${LEAD}`),
    { subject: "Quick one for Luxe Lane", body: typed },
    "kept in the tab",
  );
  byId(s.draw(), "lead-sheet-box-done").props.onClick();
  await until(() => s.now().typing === null, "the door's answer");
  const [[method, path, body]] = doorCalls();
  assert.deepEqual([method, path], ["POST", `/api/v1/sequences/${SEQ}/steps/${STEP}/lead-words`]);
  assert.deepEqual(body, {
    lead_id: LEAD,
    words: {
      subject: "Quick one for {{business}}",
      // Their name goes back to its slot, so a name put right still reaches the email; the line reads as it was typed.
      body: "{{business}}'s weekend chair is booked out. Tuesdays too.\n\nI run Harbor.\n\n{{your name}}",
    },
  });
  assert.deepEqual(s.said.words, [[STEP, body.words]], "theirs on the sheet at once");
  assert.equal(s.said.moved, 1);
  assert.equal(s.said.flashes[0].msg, B.saved("Luxe Lane"));
  assert.equal(typeof s.said.flashes[0].undo, "function");
  assert.equal(kept.size, 0, "the server has them: nothing left to keep");
});

test("Undo gives back what stood: the words it had, or the step's", async () => {
  door.was = { subject: "Before", body: "What stood" };
  const s = sheetOf();
  press(byId(s.draw(), "lead-card-body"));
  byId(s.draw(), "lead-sheet-box-body").props.onValueChange("All mine.\n\nSam");
  await s.now().done();
  await s.said.flashes[0].undo();
  const [, undone] = doorCalls();
  assert.deepEqual(undone[2], { lead_id: LEAD, words: { subject: "Before", body: "What stood" } });
  assert.equal(s.said.flashes[1].msg, B.undone("Luxe Lane"));

  sent.length = 0;
  door.was = null;
  cells = {};
  frames.reset();
  const t = sheetOf();
  press(byId(t.draw(), "lead-card-body"));
  byId(t.draw(), "lead-sheet-box-body").props.onValueChange("All mine.\n\nSam");
  await t.now().done();
  await t.said.flashes[0].undo();
  assert.deepEqual(doorCalls()[1][2], { lead_id: LEAD, words: null });
  assert.equal(t.said.flashes[1].msg, B.backAgain("Luxe Lane"));
});

test("the rules are said under the box before the door is asked, and what was typed stays", async () => {
  const s = sheetOf();
  press(byId(s.draw(), "lead-card-body"));
  const typed = "See https://example.com/page please.\n\nSam";
  byId(s.draw(), "lead-sheet-box-body").props.onValueChange(typed);
  assert.equal(await s.now().done(), false);
  assert.equal(doorCalls().length, 0);
  const tree = s.draw();
  assert.equal(byId(tree, "lead-sheet-box-body").props.value, typed);
  assert.ok(s.now().problem, "what is wrong is said");
  // Typing again clears it.
  byId(s.draw(), "lead-sheet-box-body").props.onValueChange("Fine now.\n\nSam");
  assert.equal(s.now().problem, null);
});

test("a gap's mark must be filled: its words are kept, and it names what to fill", async () => {
  const edit = editOf({
    lead: { ...THE_LEAD, city: null },
    written: { subject: "Hi", body: "Busy in {{city}}?\n\n{{your name}}" },
  });
  const s = sheetOf(mailOf(edit));
  press(byId(s.draw(), "lead-card-body"));
  const start = byId(s.draw(), "lead-sheet-box-body").props.value;
  assert.match(start, /\[Their city\]|\[City\]/);
  byId(s.draw(), "lead-sheet-box-body").props.onValueChange(`${start} Worth a word.`);
  assert.equal(await s.now().done(), false);
  assert.match(s.now().problem, /Fill in .*city.*, or take it out\./);
  assert.equal(doorCalls().length, 0);
});

test("the door's refusal is said under the box, over what was typed, and the words stay in the tab", async () => {
  door.refuse = "That email has gone.";
  const s = sheetOf();
  press(byId(s.draw(), "lead-card-body"));
  byId(s.draw(), "lead-sheet-box-body").props.onValueChange("Mine.\n\nSam");
  assert.equal(await s.now().done(), false);
  const tree = s.draw();
  assert.equal(s.now().problem, "That email has gone.");
  assert.equal(byId(tree, "lead-sheet-box-body").props.value, "Mine.\n\nSam");
  assert.equal(s.said.flashes.length, 0);
  assert.equal(kept.size, 1);
  assert.deepEqual(s.said.words, [], "the sheet goes on saying what stands");
});

test("typed back to what the step says, they follow the step again: no copy of its words is kept", async () => {
  // A step with no line of its own: what they read and what the step says are one, so typing it back is no copy.
  const stepping = { subject: "Quick one for {{business}}", body: "I run Harbor.\n\n{{your name}}" };
  const edit = editOf({
    own: true,
    written: { subject: "Mine", body: "Mine.\n\n{{your name}}" },
    stepWritten: stepping,
    opening: null,
  });
  const s = sheetOf(mailOf(edit));
  press(byId(s.draw(), "lead-card-body"));
  byId(s.draw(), "lead-sheet-box-subject").props.onValueChange("Quick one for Luxe Lane");
  byId(s.draw(), "lead-sheet-box-body").props.onValueChange("I run Harbor.\n\nSam");
  await s.now().done();
  const [[, , body]] = doorCalls();
  assert.deepEqual(body, { lead_id: LEAD, words: null });
});

test("Use the sequence's words, under the email or in the dock: the door asked with none, and the box lets go", async () => {
  const edit = editOf({ own: true, written: { subject: "Mine", body: "Mine.\n\n{{your name}}" } });
  const s = sheetOf(mailOf(edit));
  const rest = s.draw();
  assert.equal(textOf(byId(rest, "lead-sheet-own")).startsWith(B.only("Luxe Lane")), true);
  byId(rest, "lead-sheet-own-back").props.onClick();
  await until(() => doorCalls().length === 1, "the door");
  assert.deepEqual(doorCalls()[0][2], { lead_id: LEAD, words: null });

  sent.length = 0;
  press(byId(s.draw(), "lead-card-body"));
  byId(s.draw(), "lead-sheet-box-back").props.onClick();
  await until(() => s.now().typing === null, "the box letting go");
  assert.deepEqual(doorCalls()[0][2], { lead_id: LEAD, words: null });
});

test("typed over the step's words and then let go: nothing of theirs stood, so the door is not asked", async () => {
  const s = sheetOf();
  press(byId(s.draw(), "lead-card-body"));
  byId(s.draw(), "lead-sheet-box-body").props.onValueChange("Second thoughts.\n\nSam");
  byId(s.draw(), "lead-sheet-box-back").props.onClick();
  await until(() => s.now().typing === null, "the box letting go");
  assert.equal(doorCalls().length, 0);
  assert.equal(kept.size, 0);
});

test("the sheet closing saves first; words that cannot go are asked about, kept or put back, and never lost unasked", async () => {
  const s = sheetOf();
  press(byId(s.draw(), "lead-card-body"));
  byId(s.draw(), "lead-sheet-box-body").props.onValueChange("Fine words.\n\nSam");
  let closed = 0;
  await s.now().leave(() => (closed += 1));
  assert.deepEqual([closed, doorCalls().length, s.now().typing], [1, 1, null], "saved, then closed");

  sent.length = 0;
  press(byId(s.draw(), "lead-card-body"));
  byId(s.draw(), "lead-sheet-box-body").props.onValueChange("See https://example.com/page.\n\nSam");
  await s.now().leave(() => (closed += 1));
  assert.equal(closed, 1, "it stays open");
  assert.equal(s.now().leaving, true);
  const leavingAsk = () => inTree(s.draw(), (n) => n.props?.testid === "lead-sheet-box-leaving");
  const ask = leavingAsk();
  assert.ok(ask, "the dock asks");
  assert.equal(ask.props.yes, B.drop);
  assert.equal(ask.props.no, B.stay);
  ask.props.onNo();
  assert.equal(s.now().leaving, false);
  assert.ok(s.now().typing, "Keep editing keeps them");
  await s.now().leave(() => (closed += 1));
  leavingAsk().props.onYes();
  assert.deepEqual([closed, s.now().typing, kept.size], [2, null, 0], "Put them back lets them go, and goes on");
});

test("a press elsewhere saves behind; a switch to another app and a press in the dock or its menu are no leaving", async () => {
  const s = sheetOf();
  press(byId(s.draw(), "lead-card-body"));
  byId(s.draw(), "lead-sheet-box-body").props.onValueChange("Fine words.\n\nSam");
  const email = byId(s.draw(), "lead-card-email");
  const self = { contains: () => false };
  globalThis.document.hasFocus = () => false;
  email.props.onBlur({ currentTarget: self, relatedTarget: null });
  globalThis.document.hasFocus = () => true;
  email.props.onBlur({ currentTarget: self, relatedTarget: { closest: () => ({}) } });
  assert.equal(doorCalls().length, 0);
  email.props.onBlur({ currentTarget: self, relatedTarget: null });
  await until(() => doorCalls().length === 1, "saved behind");
});

test("Esc and Ctrl+Enter let the words go as Done does, and go no further; Enter in a subject goes on to the words", async () => {
  const s = sheetOf();
  press(byId(s.draw(), "lead-card-body"));
  let stopped = 0;
  const event = (over) => ({ preventDefault() {}, stopPropagation: () => (stopped += 1), ...over });
  byId(s.draw(), "lead-sheet-box-body").props.onKeyDown(event({ key: "Escape" }));
  await until(() => s.now().typing === null, "Esc");
  assert.equal(stopped, 1, "the sheet stays open under it");

  press(byId(s.draw(), "lead-card-body"));
  byId(s.draw(), "lead-sheet-box-body").props.onKeyDown(event({ key: "Enter", ctrlKey: true }));
  await until(() => s.now().typing === null, "Ctrl+Enter");

  press(byId(s.draw(), "lead-card-body"));
  const body = { focused: 0, focus() {} };
  s.now().bodyRef.current = { focus: () => (body.focused += 1) };
  byId(s.draw(), "lead-sheet-box-subject").props.onKeyDown(event({ key: "Enter" }));
  assert.equal(body.focused, 1);
  byId(s.draw(), "lead-sheet-box-subject").props.onValueChange("One\nline");
  assert.equal(s.now().typing.subject, "One line", "a subject is one line, whatever is pasted");
});

test("moved on to another lead with the box open: saved behind, and said where it could not be", async () => {
  const s = sheetOf();
  press(byId(s.draw(), "lead-card-body"));
  byId(s.draw(), "lead-sheet-box-body").props.onValueChange("Fine words.\n\nSam");
  s.held.leadId = NEXT;
  s.draw();
  await until(() => doorCalls().length === 1, "saved behind");
  assert.equal(doorCalls()[0][2].lead_id, LEAD, "for the lead it was typed for");
  assert.equal(s.now().typing, null);

  sent.length = 0;
  s.held.leadId = LEAD;
  s.draw();
  press(byId(s.draw(), "lead-card-body"));
  byId(s.draw(), "lead-sheet-box-body").props.onValueChange("See https://example.com/page.\n\nSam");
  s.held.leadId = NEXT;
  s.draw();
  await until(() => s.said.flashes.some((f) => f.msg === B.cantGo), "said");
  assert.equal(doorCalls().length, 0);
  assert.equal(kept.size, 1, "and kept in the tab, for when they come back to it");
});

test("words kept in the tab come back when the same email is opened again", () => {
  kept.set(`lead_email:${STEP}:${LEAD}`, { subject: "Kept", body: "Kept words." });
  const s = sheetOf();
  press(byId(s.draw(), "lead-card-body"));
  const tree = s.draw();
  assert.equal(byId(tree, "lead-sheet-box-body").props.value, "Kept words.");
  assert.equal(byId(tree, "lead-sheet-box-subject").props.value, "Kept");
});

test("a later step has no subject to type; Edit opens it at the end of the words", () => {
  const edit = editOf({ first: false, written: { subject: null, body: "Still around.\n\n{{your name}}" } });
  const s = sheetOf(mailOf(edit, { subject: null }));
  const rest = s.draw();
  assert.equal(byId(rest, "lead-card-subject"), null);
  byId(rest, "lead-sheet-box-edit").props.onClick();
  const tree = s.draw();
  assert.equal(byId(tree, "lead-sheet-box-subject"), null);
  assert.equal(byId(tree, "lead-sheet-box-body").props.value, "Still around.\n\nSam");
});

test("the dock's caret: Send me a test saves first and tests what was typed; refused words send no test", async () => {
  const s = sheetOf();
  press(byId(s.draw(), "lead-card-body"));
  byId(s.draw(), "lead-sheet-box-body").props.onValueChange("Fine words.\n\nSam");
  const items = () => inTree(s.draw(), (n) => n.type === Menu).props.groups[0].items;
  assert.deepEqual(
    items().map((i) => i.label),
    [B.everyone, B.test],
  );
  items()[1].onSelect();
  await until(() => sent.some(([, p]) => /\/test$/.test(p)), "the test");
  const order = sent.map(([, p]) => p.split("/").at(-1));
  assert.deepEqual(order, ["lead-words", "test"], "saved, then tested");
  assert.deepEqual(sent.at(-1)[2], { lead_id: LEAD });

  sent.length = 0;
  press(byId(s.draw(), "lead-card-body"));
  byId(s.draw(), "lead-sheet-box-body").props.onValueChange("See https://example.com/page.\n\nSam");
  items()[1].onSelect();
  await until(() => s.now().problem, "what is wrong said");
  assert.equal(sent.length, 0);
});

test("a member who may not change it reads it: no Edit, no tap, no way back", () => {
  globalThis.window.ST_STORE = { can: () => false, myRole: () => "viewer" };
  const edit = editOf({ own: true, written: { subject: "Mine", body: "Mine.\n\n{{your name}}" } });
  const s = sheetOf(mailOf(edit));
  const tree = s.draw();
  assert.equal(byId(tree, "lead-sheet-box-edit"), null);
  assert.equal(byId(tree, "lead-card-body").props.onClick, undefined);
  assert.equal(byId(tree, "lead-card-subject").props.onClick, undefined);
  assert.equal(textOf(byId(tree, "lead-sheet-own")), B.only("Luxe Lane"), "it still says whose words they are");
  assert.equal(byId(tree, "lead-sheet-own-back"), null);
});

test("their own words could not be read: it says so, and nothing can be typed over what it cannot see", () => {
  const s = sheetOf(mailOf(editOf(), { edit: null, wordsUnread: true }));
  const tree = s.draw();
  assert.equal(textOf(byId(tree, "lead-sheet-words-unread")), B.wordsUnread);
  assert.equal(byId(tree, "lead-sheet-box-edit"), null);
  assert.equal(byId(tree, "lead-card-body").props.onClick, undefined);
});

test("a step that went reads what went, from the email itself, and takes no typing", async () => {
  const props = { leadId: LEAD, sendId: SEND, box: { typing: null } };
  const draw = () => {
    frames.begin();
    return frames.render(box.SentEmail, props);
  };
  assert.equal(textOf(byId(draw(), "lead-sheet-sent-note")), B.reading);
  await until(() => byId(draw(), "lead-card-body"), "the read landing");
  const tree = draw();
  assert.equal(textOf(byId(tree, "lead-card-subject")), "What went");
  assert.equal(textOf(byId(tree, "lead-card-body")), "It went.");
  assert.equal(byId(tree, "lead-sheet-box-edit"), null);
  assert.deepEqual(sent[0].slice(0, 2), ["GET", `/api/v1/leads/${LEAD}/sent/${SEND}`]);
});

test("a step that went and could not be read says where it is", async () => {
  door.sent = { ok: false };
  const props = { leadId: LEAD, sendId: SEND, box: { typing: null } };
  const draw = () => {
    frames.begin();
    return frames.render(box.SentEmail, props);
  };
  draw();
  await until(() => textOf(byId(draw(), "lead-sheet-sent-note")) === B.unread, "the refusal landing");
});

test("a rewrite under way says the email is being written, and offers no second one", () => {
  const writing = box.emailActsOf({
    run: { name: "Luxe Lane" },
    facts: { mail: mailOf(editOf(), { rewrite: true }), place: null },
    sheet: { ui: { writing: true, undo: null }, put: () => {} },
    flash: () => {},
    moved: () => {},
    box: { typing: null },
  });
  assert.deepEqual([writing.mail.writing, writing.onRewrite], [true, null]);
});

test("the line as the sheet reads it: written for them in its own colour, being written, or still to come (decision 0098)", () => {
  // Written: its words, marked as what is written for them, and a press on it puts the caret in it.
  const written = byId(sheetOf(mailOf()).draw(), "lead-card-opening");
  assert.equal(written.props.className, "lw-opening");
  assert.equal(textOf(written), OPENING);
  assert.equal(written.props["data-at"], 0);
  // The check is at it: said so, whether the listing gave a sentence to stand in or nothing does.
  const unwritten = editOf({ opening: null });
  for (const [why, mail] of [
    ["a sentence the listing gives", mailOf(editOf(), { writing: true })],
    ["no sentence", mailOf(unwritten, { writing: true })],
  ]) {
    const being = byId(sheetOf(mail).draw(), "lead-card-opening");
    assert.equal(being.props.className, "lw-open", why);
    assert.equal(textOf(being), LEAD_SHEET_WORDS.mail.writing, why);
  }
  // Put off, or a sequence not on: nothing is writing it, and it says only what stays true.
  const still = byId(sheetOf(mailOf(unwritten)).draw(), "lead-card-opening");
  assert.equal(still.props.className, "lw-open");
  assert.equal(textOf(still), LEAD_CARD_WORDS.opening);
});

test("whether the check is at a line: only a line unread, in a sequence that is on, and not put off (decision 0098)", () => {
  const NOW = Date.parse("2026-11-05T15:00:00Z");
  const on = { state: "on" };
  assert.equal(placeLineWriting({ checked: false }, on, NOW), true);
  assert.equal(placeLineWriting({ checked: false, check_after: null }, on, NOW), true);
  assert.equal(
    placeLineWriting({ checked: false, check_after: "2026-11-05T14:59:00Z" }, on, NOW),
    true,
    "its wait is over",
  );
  assert.equal(placeLineWriting({ checked: false, check_after: "2026-11-05T16:00:00Z" }, on, NOW), false, "put off");
  assert.equal(placeLineWriting({ checked: true }, on, NOW), false, "read");
  assert.equal(placeLineWriting({}, on, NOW), false, "a row that says nothing of its line");
  for (const state of ["paused", "draft", "ended"])
    assert.equal(placeLineWriting({ checked: false }, { state }, NOW), false, state);
});

test("what a save took stands on the sheet until the read after it says the same; another lead's save stands for nobody", () => {
  const words = [{ step_id: "other", subject: null, body: "Theirs", at: "t" }];
  const held = { leadId: LEAD, read: { read: true, list: [], words, wordsRead: true } };
  let last = null;
  const Host = () => {
    last = box.useSaidWords(held.leadId, held.read);
    return null;
  };
  const draw = () => {
    frames.begin();
    frames.render(Host, {});
    return last;
  };
  assert.equal(draw().emails, held.read, "the read as it is, while nothing was said");
  draw().say(STEP, { subject: "Mine", body: "Mine." });
  assert.deepEqual(
    draw().emails.words.map((w) => [w.step_id, w.body]),
    [
      ["other", "Theirs"],
      [STEP, "Mine."],
    ],
  );
  draw().say(STEP, null);
  assert.deepEqual(
    draw().emails.words.map((w) => w.step_id),
    ["other"],
    "put back: the step's stand at once",
  );
  draw().say(STEP, { subject: "Mine", body: "Mine." });
  held.leadId = NEXT;
  assert.equal(draw().emails, held.read, "said of another lead");
  held.leadId = LEAD;
  held.read = { ...held.read, words: [] };
  draw();
  assert.deepEqual(draw().emails.words, [], "the read landed: it says what is");
});
