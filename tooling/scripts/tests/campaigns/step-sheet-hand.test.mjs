/**
 * A customer's call or note on the record (decision 0065 step 6: the record's own Add a step offers what New offers), run
 * on the stub React over the real sheet and rail (sequences/step-sheet.tsx, steps.tsx) with the wire answered here:
 *
 * - Add a step opens on what the step will do, New's three rows (a message, a call for you, a note for the team), A message
 *   said and not pressed where Messages offers none to pick; the one pressed opens its editor in the same sheet.
 * - A call's editor: which it is, its wait and what must still hold, what to do, the task as it lands on Today; Add the
 *   step stays shut until there is something to do, and goes through the step's own verb with the words and no message.
 * - A call on the record reads as its task on Today, its facts, and a foot of Take away and Edit, never Send me a test
 *   (there is no message to mail); taken away, nothing goes with it. Changed, only what changed is sent.
 * - Where a call or a note closes the sequence, the rail says how to add another in place of Add a step.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import * as contracts from "@chanlytics/contracts";
import {
  installLegacyReact,
  fresh,
  again,
  all,
  find,
  byTestId,
  textOf,
  classes,
  press,
  unmount,
} from "../_legacy-react.mjs";

installLegacyReact({ __DEMO_MODE: false, __surfaceState: () => "live", __chrome: { state: contracts.stateOf } });
// record-foot.ts makes the record foot's context as it loads, and "react" under this runner's react-server condition has
// no createContext or useContext: the stub gives it a context that holds its value. The stub draws a part before the
// provider around it, so a reader gets the context's own value (none): the editor's Cancel and Save stand under its
// fields, as they do outside a record, and the sheet's foot holds no portal to read.
const reactOfDashboard = createRequire(new URL("../../../../apps/dashboard/src/legacy-bridge/_.js", import.meta.url))(
  "react",
);
reactOfDashboard.createContext ??= (value) => ({ Provider: "Provider", Consumer: "Consumer", _currentValue: value });
reactOfDashboard.useContext ??= (context) => context._currentValue;
const W = globalThis;
Object.assign(W, {
  CHANLY: { nav: () => {}, R: {} },
  appNavigate: () => {},
  // The role store's gate (the frame's window.gate, canDo), over an owner and contracts' table.
  ST_STORE: { can: (a) => !!contracts.ROLE_PERMS.owner[a], myRole: () => "owner" },
  __roleGate: contracts.roleGate,
  useHotkey: () => {},
});
const S = "../../../../apps/dashboard/src/surfaces";
(await import(`${S}/frame/frame-globals.ts`)).installFrameGlobals();
const { setSurfaceValue } = await import(`${S}/surface-values.ts`);
const { sequenceVerbs } = await import(`${S}/campaigns/sequences/verbs.ts`);
const { Sheet } = await import(`${S}/kit/sheet/sheet.tsx`);
const { Segmented } = await import(`${S}/kit/segmented/segmented.tsx`);
const { Field } = await import(`${S}/kit/field/field.tsx`);
const { ListRow } = await import(`${S}/kit/list-row/list-row.tsx`);
const { Confirm } = await import(`${S}/kit/confirm/confirm.tsx`);
const { StepSheet } = await import(`${S}/campaigns/sequences/step-sheet.tsx`);
const { SequenceSteps } = await import(`${S}/campaigns/sequences/steps.tsx`);

const { NEW_WORDS, SCHEDULE_WORDS: SW, SEQUENCE_EDIT_WORDS: E, SEQUENCE_FLOW_WORDS: F, handTitleOf } = contracts;

const SEQ = "seq-1";
const WORDS = "ask how the cut held up";
const NONE = { waiting: 0, waiting_people: 0, held: 0, to_send: 0, replies: 0, oldest_at: null, batches: [] };
/** A win-back on the quiet ones as GET sequences/:id answers it: its row, and its steps. */
const ROW = {
  id: SEQ,
  name: "Win-back",
  starts: "moment",
  state: "on",
  mode: "veto",
  created_at: "2026-09-18T12:00:00Z",
  first: {
    id: "st-1",
    kind: "moment",
    trigger: "quiet_30",
    state: "running",
    policy_class: "reengage",
    run_hour: 10,
    list_id: null,
    list_key: null,
    list_name: null,
    search_id: null,
    search_name: null,
    owner_sends: false,
    until: null,
    words_ok_at: null,
    template_name: "come_back",
    template_language: "en_US",
  },
  date: null,
  steps: 2,
  channels: ["whatsapp"],
  needs: NONE,
  next: null,
  last: null,
  in_it: 4,
};
const step = (place, over = {}) => ({
  id: `st-${place}`,
  place,
  name: "Win-back",
  kind: "moment",
  trigger: place === 1 ? "quiet_30" : "after_step",
  state: "running",
  after_days: place === 1 ? null : 3,
  only_if: place === 1 ? [] : ["no_booking"],
  channels: ["whatsapp"],
  template_id: `t${place}`,
  template_name: "come_back",
  template_language: "en_US",
  params: [],
  hand: null,
  next_words: null,
  sent: 0,
  replied: 0,
  ...over,
});
/** A call or a note for the team as the record reads one: no message, its kind and its words. */
const handStep = (place, kind, words = WORDS) =>
  step(place, {
    template_id: null,
    template_name: null,
    template_language: null,
    channels: [],
    hand: { kind, words },
  });
const recOf = (last = handStep(2, "call")) => ({
  sequence: ROW,
  steps: [step(1), last],
  timezone: "America/New_York",
  word: "visit",
  last_run_for: null,
  settings: { cap_per_run: 25, gap_days: 90, cadence_days: 30 },
  evidence: null,
});
const CTX = { tz: "America/New_York", nowMs: Date.parse("2026-10-20T14:00:00Z"), lastRunFor: null, people: null };

/** The message the first step sends, as GET templates returns its row: approved, so Messages offers it. */
const COME_BACK = {
  id: "t1",
  channel: "whatsapp",
  name: "come_back",
  language: "en_US",
  meta_status: "approved",
  category: "marketing",
  source: "chanlytics",
  hidden_at: null,
  title: "Come back",
  blocked: null,
  variables: [],
  header: null,
  body_preview: "We miss you. A chair is free this week.",
};
const offering = (rows) =>
  setSurfaceValue("settings", {
    templatesAll: rows,
    templateVersions: [],
    messages: contracts.campaignMessagesOf(rows),
    settings: { config: { brain: { business_name: "Harbor Studio" } } },
  });

/** The wire: each request recorded, answered as the step door answers one it wrote. */
let wire = [];
const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
W.fetch = async (url, init = {}) => {
  const path = new URL(String(url), "https://app.example").pathname.replace(/^.*\/api\/v1\//, "");
  wire.push([init.method || "GET", path, init.body ? JSON.parse(init.body) : null]);
  return json(200, {
    ok: true,
    data: { id: "st-3", place: 3, was: { hand: { kind: "call", words: WORDS } }, decision_id: "d1" },
  });
};
// Who is in it reads as nobody yet: the rail's lines say nothing of who is in line.
sequenceVerbs.people = async () => ({ ok: true, status: 200, data: { rows: [] } });
sequenceVerbs.peekPeople = () => ({ ok: true, status: 200, data: { rows: [] } });

let flashes = [];
let picked = [];
let done = 0;
const drawSheet = (target, { rec = recOf(), edit = target.kind === "new" } = {}) =>
  again(() =>
    W.React.createElement(StepSheet, {
      open: true,
      target,
      rec,
      edit,
      ctx: CTX,
      flash: (f) => flashes.push(f),
      moved: () => {},
      onEdit: () => {},
      onPick: (does) => picked.push(does),
      onEditDone: () => (done += 1),
      onClose: () => {},
    }),
  );
/** The open sheet the record hands the kit's Sheet: its head, its body and its foot. */
const sheetOf = (tree) => find(tree, (n) => n.type === Sheet && n.props.open)?.props ?? null;
/** Whether a drawn part says these words, as one person reads them. */
const says = (node, words, why = words) => assert.ok(textOf(node).includes(words), why);

beforeEach(() => {
  unmount();
  fresh();
  wire = [];
  flashes = [];
  picked = [];
  done = 0;
  offering([COME_BACK]);
});

test("Add a step opens on what the step will do: New's three rows, the one pressed handed back to open its editor", () => {
  const sheet = sheetOf(drawSheet({ kind: "new", does: null }));
  assert.deepEqual(
    [sheet.title, sheet.sub, sheet.foot],
    [SW.addStep, SW.step(3), null],
    "no foot: the close in its corner",
  );
  const choices = byTestId(sheet.children, "sq-add-choices");
  assert.ok(choices, "the sheet's first face");
  const row = (id) => byTestId(choices, `sq-add-${id}`);
  assert.deepEqual(
    ["message", "call", "note"].map((id) => [row(id).props.name, row(id).props.said]),
    [
      [NEW_WORDS.does.message, NEW_WORDS.sheets.heldSub],
      [NEW_WORDS.sheets.addCall, NEW_WORDS.hand.call],
      [NEW_WORDS.hand.noteTitle, NEW_WORDS.hand.note],
    ],
  );
  says(choices, NEW_WORDS.hand.last, "a call or a note closes it, said under the rows");
  press(row("call"));
  press(row("message"));
  assert.deepEqual(picked, ["call", "message"]);
});

test("where Messages offers none to pick, A message is said and not pressed; a call and a note still are", () => {
  offering([]);
  const choices = byTestId(sheetOf(drawSheet({ kind: "new", does: null })).children, "sq-add-choices");
  const message = byTestId(choices, "sq-add-message");
  assert.equal(message.props.said, E.noMessages);
  assert.equal(message.props.onClick, undefined, "not pressed");
  assert.match(message.props.className, /is-off/);
  assert.equal(typeof byTestId(choices, "sq-add-call").props.onClick, "function");
  assert.equal(typeof byTestId(choices, "sq-add-note").props.onClick, "function");
});

test("a call picked opens its editor: a call chosen, Add the step shut until there is something to do, then the step's verb with the words alone", async () => {
  const target = { kind: "new", does: "call" };
  const sheet = sheetOf(drawSheet(target));
  assert.deepEqual([sheet.title, sheet.sub], [SW.addStep, SW.step(3)]);
  const editor = byTestId(sheet.children, "sq-hand-editor");
  assert.ok(editor, "the call's own editor, in the same sheet");
  const kind = find(editor, (n) => n.type === Segmented);
  assert.equal(kind.props.value, "call", "the call pressed is the one chosen");
  assert.equal(byTestId(editor, "sq-hand-call").props.value, "call");
  assert.ok(byTestId(editor, "sq-hand-note"), "and a note beside it");
  assert.ok(
    byTestId(editor, "sq-editor-days") && byTestId(editor, "sq-editor-hold"),
    "its wait and what must still hold",
  );
  // Nothing to do yet: the task reads as its kind, and Add the step is shut.
  says(byTestId(editor, "sq-hand-today"), handTitleOf("call"));
  const save = byTestId(editor, "sq-editor-save");
  assert.deepEqual([save.props.disabled, textOf(save)], [true, E.add]);
  // Spaces are nothing to do either.
  byTestId(editor, "sq-hand-words").props.onValueChange("   ");
  assert.equal(byTestId(sheetOf(drawSheet(target)).children, "sq-editor-save").props.disabled, true);
  byTestId(editor, "sq-hand-words").props.onValueChange(WORDS);
  const typed = sheetOf(drawSheet(target)).children;
  says(byTestId(typed, "sq-hand-today"), E.onToday("call", WORDS), "as it lands on Today");
  const ready = byTestId(typed, "sq-editor-save");
  assert.equal(ready.props.disabled, false);
  press(ready);
  for (let i = 0; i < 200 && done === 0; i += 1) await new Promise((r) => setTimeout(r, 5));
  const posts = wire.filter(([m]) => m === "POST");
  assert.equal(posts.length, 1, "one save");
  assert.deepEqual(posts[0].slice(1), [
    `sequences/${SEQ}/steps`,
    { after_days: 3, only_if: ["no_booking"], hand: { kind: "call", words: WORDS } },
  ]);
  assert.equal(done, 1, "the sheet leaves its editor on the door's answer");
  assert.equal(flashes.at(-1)?.tone, "ok");
});

test("a note chosen in its place reads as a note's task; a note picked opens on a note", () => {
  let tree = drawSheet({ kind: "new", does: "call" });
  find(byTestId(sheetOf(tree).children, "sq-hand-editor"), (n) => n.type === Segmented).props.onValueChange("note");
  tree = drawSheet({ kind: "new", does: "call" });
  const editor = byTestId(sheetOf(tree).children, "sq-hand-editor");
  assert.equal(find(editor, (n) => n.type === Segmented).props.value, "note");
  says(byTestId(editor, "sq-hand-today"), handTitleOf("note"));
  fresh();
  const note = byTestId(sheetOf(drawSheet({ kind: "new", does: "note" })).children, "sq-hand-editor");
  assert.equal(find(note, (n) => n.type === Segmented).props.value, "note");
});

test("a call on the record reads as its task on Today, with Take away and Edit in its foot and never Send me a test", () => {
  const sheet = sheetOf(drawSheet({ kind: "step", id: "st-2" }));
  assert.equal(sheet.title, handTitleOf("call"), "titled by its kind, whatever name the database gave it");
  const task = byTestId(sheet.children, "sq-step-hand-2");
  says(task, E.onToday("call", WORDS));
  says(task, NEW_WORDS.hand.call);
  assert.ok(byTestId(sheet.children, "sq-step-facts-2"), "what it is, row by row");
  assert.equal(byTestId(sheet.children, "sq-step-words-2"), null, "no message's words");
  const foot = sheet.foot;
  assert.ok(byTestId(foot, "sq-step-remove-ask-2"));
  assert.ok(byTestId(foot, "sq-step-edit-2"));
  assert.equal(byTestId(foot, "sq-step-test-2"), null, "no message to mail yourself");
  // The message step before it keeps its test.
  assert.ok(byTestId(sheetOf(drawSheet({ kind: "step", id: "st-1" })).foot, "sq-step-test-1"));
  // Taken away, asked first: a call is always the last step, so nothing goes with it.
  fresh();
  press(byTestId(sheetOf(drawSheet({ kind: "step", id: "st-2" })).foot, "sq-step-remove-ask-2"));
  const foot2 = sheetOf(drawSheet({ kind: "step", id: "st-2" })).foot;
  const asked = find(foot2, (n) => n.type === Confirm);
  assert.deepEqual([asked.props.question, asked.props.detail], [F.takeAwayAsk(2), F.takeAwayHandDetail]);
  assert.ok(byTestId(foot2, "sq-step-remove-2-yes"), "its Take away, in the foot");
});

test("a call changed opens on its words and sends only what changed: its new words, never the wait it kept", async () => {
  const target = { kind: "step", id: "st-2" };
  const sheet = sheetOf(drawSheet(target, { edit: true }));
  assert.deepEqual([sheet.title, sheet.sub], [SW.editStep(2), handTitleOf("call")]);
  const editor = byTestId(sheet.children, "sq-hand-editor");
  assert.equal(byTestId(editor, "sq-hand-words").props.value, WORDS, "it opens on its words");
  const save = byTestId(editor, "sq-editor-save");
  assert.deepEqual([save.props.disabled, textOf(save)], [true, E.save], "nothing changed, nothing to save");
  says(editor, E.handReaches, "what a change reaches, said beside the save");
  byTestId(editor, "sq-hand-words").props.onValueChange("ask whether the color held");
  press(byTestId(sheetOf(drawSheet(target, { edit: true })).children, "sq-editor-save"));
  for (let i = 0; i < 200 && done === 0; i += 1) await new Promise((r) => setTimeout(r, 5));
  const puts = wire.filter(([m]) => m === "PUT");
  assert.deepEqual(
    puts.map((p) => p.slice(1)),
    [[`sequences/${SEQ}/steps/st-2`, { hand: { kind: "call", words: "ask whether the color held" } }]],
  );
});

test("where a call or a note closes the sequence, the rail says how to add another in place of Add a step", () => {
  const rail = (rec) =>
    again(() =>
      W.React.createElement(SequenceSteps, {
        rec,
        flash: () => {},
        moved: () => {},
        again: 0,
        editing: null,
        onEditing: () => {},
        howAsked: 0,
        onCancelSend: () => {},
      }),
    );
  const call = rail(recOf());
  says(byTestId(call, "sq-hand-last"), SW.handLast("call"));
  assert.equal(byTestId(call, "sq-add-step"), null);
  // The box on its day is titled by its kind, and its words are the call's own.
  says(byTestId(call, "sq-step-2"), handTitleOf("call"));
  says(byTestId(call, "sq-step-2"), WORDS);
  fresh();
  says(byTestId(rail(recOf(handStep(2, "note"))), "sq-hand-last"), SW.handLast("note"));
  fresh();
  const message = rail(recOf(step(2)));
  assert.ok(byTestId(message, "sq-add-step"), "a message last: Add a step");
  assert.equal(byTestId(message, "sq-hand-last"), null);
});

/** The nodes a drawn node stands inside, outermost first (what each was given as children, and what each component drew). */
function ancestorsOf(tree, target, above = []) {
  if (tree == null || typeof tree !== "object") return null;
  if (Array.isArray(tree)) {
    for (const n of tree) {
      const got = ancestorsOf(n, target, above);
      if (got) return got;
    }
    return null;
  }
  if (tree === target) return above;
  const inner = [...above, tree];
  return ancestorsOf(tree.props?.children, target, inner) ?? ancestorsOf(tree.rendered, target, inner);
}

test("the editor's You do is a caption beside the choice that names it, never a field's label: its two radios share no id and stand in no field", () => {
  const target = { kind: "new", does: "call" };
  const editor = byTestId(sheetOf(drawSheet(target)).children, "sq-hand-editor");
  const caption = find(editor, (n) => classes(n).includes("sq-ed-cap"));
  assert.ok(caption, "its caption");
  assert.equal(textOf(caption), NEW_WORDS.draft.youDo);
  const id = caption.props.id;
  assert.ok(typeof id === "string" && id.length > 0, "the caption has an id");
  const choice = find(editor, (n) => n.type === Segmented);
  assert.deepEqual(
    [choice.props.labelledBy, choice.props.label],
    [id, undefined],
    "named by the caption, with no words of its own",
  );
  const group = find(choice.rendered, (n) => classes(n).includes("rec-seg"));
  assert.equal(group.props["aria-labelledby"], id, "the radio group carries the caption's id");
  assert.deepEqual(
    all(editor, (n) => n.props?.id === id),
    [caption],
    "one id, one caption: nothing else in the editor holds it",
  );
  // The fields under it are still the kit's Fields, so the look for one below proves something.
  const wordsField = byTestId(editor, "sq-hand-words");
  assert.equal(wordsField.type, Field, "what to do is a kit Field");
  assert.ok(
    find(wordsField, (n) => classes(n).includes("rec-field")),
    "drawn in its rec-field",
  );
  for (const testid of ["sq-hand-call", "sq-hand-note"]) {
    const radio = byTestId(editor, testid);
    assert.equal(radio.props.id, undefined, `${testid} carries no id a field handed it`);
    const above = ancestorsOf(editor, radio);
    assert.ok(above?.includes(group), `${testid} stands in its group`);
    assert.ok(!above.some((n) => n.type === Field), `${testid} stands in no kit Field`);
    assert.ok(!above.some((n) => classes(n).includes("rec-field")), `${testid} has no rec-field around it`);
  }
  // The id stays the caption's from one draw to the next, as React keeps a component's useId.
  const redrawn = byTestId(sheetOf(drawSheet(target)).children, "sq-hand-editor");
  assert.equal(find(redrawn, (n) => classes(n).includes("sq-ed-cap")).props.id, id);
});

/** A task as long as an owner may write one: two hundred characters, each one drawn. */
const LONG =
  "ask how the cut held up after a week, whether the color settled or faded, if the aftercare sheet made sense, and offer a free touch-up within two weeks; note any sensitivity they mention for next time";

/** A drawn task: the run's sentence whole in its words' bold, where it lands under it, and no list row to cut its line. */
function taskSays(task, kind, words) {
  assert.ok(task, `the ${kind}'s task is drawn`);
  const said = find(task, (n) => classes(n).includes("sq-hand-words"));
  assert.ok(said, "its words");
  const [bold, ...boldMore] = said.props.children.filter((c) => c?.type === "b");
  assert.equal(boldMore.length, 0, "one sentence");
  assert.equal(textOf(bold), E.onToday(kind, words), "the sentence as it lands on Today, whole");
  assert.ok(textOf(bold).endsWith(words), "to its last character");
  const lands = said.props.children.find((c) => c?.type === "small");
  assert.equal(textOf(lands), NEW_WORDS.hand[kind], "where it lands, under it");
  assert.equal(
    find(task, (n) => n.type === ListRow),
    null,
    "no list row",
  );
}

test("a call's or a note's task is drawn whole, a long one too: on the record, and in the editor as it is typed", () => {
  assert.equal(LONG.length, 200);
  for (const kind of ["call", "note"]) {
    fresh();
    const sheet = sheetOf(drawSheet({ kind: "step", id: "st-2" }, { rec: recOf(handStep(2, kind, LONG)) }));
    taskSays(byTestId(sheet.children, "sq-step-hand-2"), kind, LONG);
  }
  fresh();
  const target = { kind: "new", does: "call" };
  byTestId(byTestId(sheetOf(drawSheet(target)).children, "sq-hand-editor"), "sq-hand-words").props.onValueChange(LONG);
  taskSays(byTestId(sheetOf(drawSheet(target)).children, "sq-hand-today"), "call", LONG);
  // The record's short one is whole in the same place.
  fresh();
  taskSays(byTestId(sheetOf(drawSheet({ kind: "step", id: "st-2" })).children, "sq-step-hand-2"), "call", WORDS);
});
