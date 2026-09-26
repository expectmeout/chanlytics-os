/**
 * The step sheet (0007, amended; 00166): where a next step is set or changed from outside the notes card. contracts
 * step-sheet.ts and the deal card's step (deal-sheet.ts dealStepOf), executed; then the sheet itself, drawn by the
 * shell's host (components/step-sheet.jsx) over the profile's real courier and a wire that answers the person read and
 * the notes route: it opens where it is asked for, reads the person, says what is wrong under its field before a
 * round trip, writes through the notes route with the version it opened over, then closes, says so and tells the page.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as contracts from "@chanlytics/contracts";
import { installLegacyReact, unmount, again, settle, find, byTestId, textOf, press } from "./_legacy-react.mjs";

const { STEP_SHEET_WORDS, NOTE_REFUSALS, dealStepOf, stepSheetBody, stepSheetDirty, stepSheetFor, zoneDayKey } =
  contracts;
const ZONE = "America/New_York";
const H = 3_600_000;
const D = 24 * H;

/* ------------------------------------------- the rules, in contracts ------------------------------------------- */

const noteVM = (id, over = {}) => ({
  id,
  version: 1,
  body: `Step ${id}`,
  step: null,
  dealId: null,
  forUserId: null,
  forWho: null,
  mine: true,
  ...over,
});
const stepOn = (day, done = false) => ({
  day: { day, due: "ahead", near: day, words: `Due ${day}` },
  due: "ahead",
  words: `Due ${day}`,
  done,
  doneWords: null,
});

test("a deal's next step is the earliest open one that names it, by day and then as written; a step about the person is never a card's", () => {
  // The notes come newest first, as the page lists them.
  const notes = [
    noteVM("late", { step: stepOn("2026-10-09"), dealId: "d1" }),
    noteVM("same-newer", { step: stepOn("2026-10-02"), dealId: "d1" }),
    noteVM("person", { step: stepOn("2026-09-30") }),
    noteVM("done", { step: stepOn("2026-09-29", true), dealId: "d1" }),
    noteVM("other-deal", { step: stepOn("2026-09-28"), dealId: "d2" }),
    noteVM("same-older", { step: stepOn("2026-10-02"), dealId: "d1", mine: false, forWho: "For Sam", version: 3 }),
    noteVM("plain", { dealId: "d1" }),
  ];
  assert.deepEqual(dealStepOf(notes, "d1"), {
    id: "same-older",
    version: 3,
    words: "Step same-older",
    day: notes[5].step.day,
    forWho: "For Sam",
    mine: false,
  });
  assert.equal(dealStepOf(notes, "d2").id, "other-deal");
  assert.equal(dealStepOf(notes, "d3"), null);
  assert.equal(dealStepOf(notes, null), null, "a deal not yet recorded has no step");
  assert.equal(dealStepOf(undefined, "d1"), null);
});

test("the sheet opens a new step on its deal, or a change to one of theirs with its day, and never someone else's", () => {
  const now = Date.parse("2026-09-24T15:00:00Z");
  const person = {
    id: "p1",
    name: "Tove Lind",
    deals: [{ id: "d1", service: "Website" }],
    noteTeam: [
      { id: "u-me", name: "Ruben", me: true },
      { id: "u-sam", name: "Sam", me: false },
    ],
    noteList: [
      noteVM("n1", { step: stepOn("2026-09-25"), dealId: "d1", forUserId: "u-sam", version: 4 }),
      noteVM("n-far", { step: stepOn("2026-11-02"), dealId: "d1" }),
      noteVM("n-theirs", { step: stepOn("2026-09-25"), mine: false }),
    ],
  };
  const add = stepSheetFor(person, { dealId: "d1" }, now, ZONE);
  assert.deepEqual(
    { mode: add.mode, title: add.title, sub: add.sub, save: add.save, note: add.note, dealId: add.dealId },
    { mode: "add", title: "Set a next step", sub: "Tove Lind · Website", save: "Set it", note: null, dealId: "d1" },
  );
  assert.deepEqual(add.draft, { what: "", day: null, picking: false, forId: null });
  assert.deepEqual(
    add.team.map((m) => m.label),
    ["Anyone on the team", "Me", "Sam"],
  );
  assert.deepEqual(
    add.days.map((c) => c.label),
    ["Today", "Tomorrow", "Next week", "Pick a day"],
  );
  assert.equal(stepSheetFor(person, {}, now, ZONE).sub, "Tove Lind", "a step about the person names no deal");

  const edit = stepSheetFor(person, { noteId: "n1" }, now, ZONE);
  assert.deepEqual([edit.mode, edit.title, edit.save, edit.dealId], ["edit", "Change the step", "Save", "d1"]);
  assert.deepEqual(edit.note, { id: "n1", version: 4 });
  assert.deepEqual(edit.draft, { what: "Step n1", day: "2026-09-25", picking: false, forId: "u-sam" });
  assert.equal(stepSheetFor(person, { noteId: "n-far" }, now, ZONE).draft.picking, true, "a day no choice is");
  assert.equal(stepSheetFor(person, { noteId: "n-theirs" }, now, ZONE).blocked, NOTE_REFUSALS.not_yours);
  assert.equal(stepSheetFor(person, { noteId: "gone" }, now, ZONE).blocked, STEP_SHEET_WORDS.noStep);
  assert.equal(edit.blocked, null);
});

test("a Save sends the notes route a step -- its words, its day, for whom, the team's, on its deal -- or says what is wrong first", () => {
  const draft = { what: "  Call about the timeline  ", day: "2026-09-25", picking: false, forId: "u-sam" };
  assert.deepEqual(stepSheetBody({ note: null, dealId: "d1" }, draft), {
    problem: null,
    body: {
      body: "Call about the timeline",
      due_on: "2026-09-25",
      for_user_id: "u-sam",
      team_only: true,
      deal_id: "d1",
    },
  });
  assert.deepEqual(stepSheetBody({ note: { id: "n1", version: 4 }, dealId: null }, { ...draft, forId: null }).body, {
    body: "Call about the timeline",
    due_on: "2026-09-25",
    for_user_id: null,
    team_only: true,
    note_id: "n1",
    version: 4,
  });
  const P = STEP_SHEET_WORDS.problems;
  const problem = (d) => stepSheetBody({ note: null, dealId: null }, { ...draft, ...d }).problem;
  assert.deepEqual(problem({ what: "   " }), { field: "what", words: P.what });
  assert.deepEqual(problem({ what: "x".repeat(contracts.NOTE_MAX + 1) }), {
    field: "what",
    words: P.tooLong(contracts.NOTE_MAX),
  });
  assert.deepEqual(problem({ day: null }), { field: "day", words: P.day });
  assert.deepEqual(problem({ day: "2026-02-30" }), { field: "day", words: P.day });
  // Read again while open: what was typed stays, every field left alone takes the fresh value; the day and its
  // date field are one field.
  const was = { what: "Call", day: "2026-09-25", picking: false, forId: null };
  const fresh = { what: "Call them", day: "2026-10-01", picking: true, forId: "u-sam" };
  assert.deepEqual(contracts.stepSheetMerge({ ...was, what: "Call Tove" }, was, fresh), {
    what: "Call Tove",
    day: "2026-10-01",
    picking: true,
    forId: "u-sam",
  });
  assert.deepEqual(contracts.stepSheetMerge({ ...was, picking: true }, was, fresh), {
    what: "Call them",
    day: "2026-09-25",
    picking: true,
    forId: "u-sam",
  });
  assert.deepEqual(contracts.stepSheetMerge(was, was, fresh), fresh, "nothing typed: all of it fresh");
  // Changed is judged against what it opened with.
  const opened = { what: "Call", day: null, picking: false, forId: null };
  assert.equal(stepSheetDirty({ ...opened, what: " Call " }, opened), false);
  assert.equal(stepSheetDirty({ ...opened, day: "2026-09-25" }, opened), true);
  assert.equal(stepSheetDirty({ ...opened, forId: "" }, opened), false);
  assert.equal(stepSheetDirty({ ...opened, forId: "u-sam" }, opened), true);
});

/* ------------------------------------ the sheet, drawn by the shell's host ------------------------------------ */

installLegacyReact({ __DEMO_MODE: false, __chrome: { state: contracts.stateOf } });
const W = globalThis;
Object.assign(W, {
  CHANLY: { nav: () => {}, R: {} },
  canDo: () => true,
  gate: () => ({}),
  __WORKSPACES: [{ id: "t1", slug: "studio", name: "Studio", status: "active", timezone: ZONE }],
  __ACTIVE_WORKSPACE: "t1",
});
const L = "../../../apps/dashboard/src/legacy";
await import(`${L}/components/data-bits.jsx`);
for (const f of ["record-row", "record-field", "record-fold", "record-sheet", "deal-sheet", "step-sheet"])
  await import(`${L}/components/${f}.jsx`);
const quietly = async (fn) => {
  const e = console.error;
  console.error = () => {};
  try {
    return await fn();
  } finally {
    console.error = e;
  }
};
const { installPeopleCourier } = await import("../../../apps/dashboard/src/legacy-bridge/people-detail.ts");
const { installClock } = await import("../../../apps/dashboard/src/legacy-bridge/zone.ts");
const { clearReadCaches } = await import("../../../apps/dashboard/src/legacy-bridge/read-cache.ts");
await quietly(() => import("../../../apps/dashboard/src/legacy-bridge/refresh-map.ts"));
installPeopleCourier();
installClock();
const toasts = [];
W.usePPToast = () => [null, (t) => toasts.push(t)];

/** A person as the person read hands them over: a proposal out, a teammate, and their notes. */
const personDto = (now, notes = []) => {
  const at = (ms) => new Date(now - ms).toISOString();
  return {
    row: {
      id: "p1",
      display_name: "Tove Lind",
      wa_profile_name: null,
      phone_e164: "+12125550104",
      consent: "opted_in",
      dnc: false,
      channels: ["whatsapp"],
      conversation_count: 0,
      escalation_count: 0,
      needs_human: false,
      latest_conversation_id: null,
      last_message_at: null,
      last_inbound_at: at(2 * D),
      has_chat: false,
      queued_reply_at: null,
      deal_id: "d1",
      deal_stage: "proposed",
      deal_service: "Website",
      deal_proposed_at: at(5 * D),
    },
    identities: [],
    conversations: [],
    calls: [],
    escalations: [],
    decisions: [],
    deals: [
      {
        id: "d1",
        contact_id: "p1",
        service: "Website",
        stage: "proposed",
        proposed_at: at(5 * D),
        decided_at: null,
        ended_at: null,
        amount_cents: 480_000,
        per: "once",
        currency: "USD",
        note: null,
        version: 1,
        created_at: at(5 * D),
        proposal_url: null,
        valid_until: null,
        lost_reason: null,
      },
    ],
    deals_on: true,
    person_notes: notes,
    note_team: [
      { id: "u-me", name: "Ruben", me: true },
      { id: "u-sam", name: "Sam", me: false },
    ],
  };
};
const noteDto = (now, id, over = {}) => ({
  id,
  body: "Call about the timeline",
  author_kind: "member",
  author_name: "Ruben",
  mine: true,
  for_user_id: null,
  for_name: null,
  for_me: false,
  team_only: true,
  state: "kept",
  source: "page",
  version: 2,
  created_at: new Date(now - H).toISOString(),
  updated_at: new Date(now - H).toISOString(),
  due_on: zoneDayKey(now + 3 * D, ZONE),
  done_at: null,
  deal_id: "d1",
  ...over,
});
const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
/** The wire: the person's read and the notes route, each answered as the test says. */
const wire = (dto) => {
  const calls = [];
  const answers = {
    person: () => json(200, { ok: true, data: { person: dto() } }),
    note: (body) => json(200, { ok: true, data: { note: { id: body.note_id ?? "n9", body: body.body } } }),
  };
  W.fetch = async (url, init = {}) => {
    const u = new URL(String(url), "https://app.chanlytics.com");
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ method: init.method || "GET", path: u.pathname, body });
    await settle();
    if (u.pathname === "/api/v1/contacts/p1") return answers.person();
    // The note route and its two doors: each answers with the note, or what it removed.
    if (u.pathname.startsWith("/api/v1/contacts/p1/notes")) return answers.note(body);
    return json(404, { ok: false, error: { code: "not_found", message: `no ${u.pathname}` } });
  };
  return { calls, answers };
};
const saved = [];
W.addEventListener("note:saved", (e) => saved.push(e.detail));

let drawn = null;
const open = () => {
  unmount();
  W.__recordFolds.reset();
  clearReadCaches();
  toasts.length = 0;
  saved.length = 0;
  drawn = () => W.React.createElement(W.StepSheetHost, {});
  return drawn();
};
const redraw = () => again(drawn);
const until = async (what, pred) => {
  for (let i = 0; i < 3000; i += 1) {
    const tree = redraw();
    if (pred(tree)) return tree;
    await (i % 25 === 24 ? new Promise((r) => setTimeout(r, 5)) : settle());
  }
  throw new Error(`never: ${what}`);
};
const input = (tree, id) => find(tree, (n) => typeof n.type === "string" && n.props?.["data-testid"] === id);
const type = (node, value) => node.props.onChange({ target: { value } });
const sheetOf = (tree) => byTestId(tree, "rec-sheet-step-sheet");
const saveOf = (tree) => byTestId(tree, "rec-sheet-save-step-sheet");
const title = (tree) => textOf(find(tree, (n) => n.props?.className === "rec-sheet-title"));
const sub = (tree) => textOf(find(tree, (n) => n.props?.className === "rec-sheet-sub"));
const dayButton = (tree, label) =>
  find(byTestId(tree, "step-sheet-days"), (n) => n.props?.role === "radio" && textOf(n) === label);

test("the sheet opens where it is asked for, reads the person, says what is wrong under its field, writes a step on the deal through the notes route, then closes, says so and tells the page", async () => {
  const now = Date.now();
  const { calls } = wire(() => personDto(now));
  let tree = open();
  assert.equal(sheetOf(tree), null, "nothing drawn until it is asked for");
  assert.equal(W.openStepSheet({ personId: "p1", dealId: "d1" }), true);
  tree = redraw();
  assert.ok(sheetOf(tree));
  assert.equal(title(tree), "Set a next step");
  tree = await until("the person is read", (t) => input(t, "step-sheet-what-input"));
  assert.equal(sub(tree), "Tove Lind · Website");
  assert.match(textOf(byTestId(tree, "step-sheet-rule")), /team only/);

  // Nothing typed, no day: each is said under its field, and nothing is sent.
  press(saveOf(tree));
  tree = redraw();
  assert.match(textOf(byTestId(tree, "step-sheet-what")), new RegExp(STEP_SHEET_WORDS.problems.what));
  type(input(tree, "step-sheet-what-input"), "Call about the timeline");
  tree = redraw();
  press(saveOf(tree));
  tree = redraw();
  assert.match(textOf(byTestId(tree, "step-sheet-when")), new RegExp(STEP_SHEET_WORDS.problems.day));
  assert.equal(calls.filter((c) => c.method === "POST").length, 0, "refused before a round trip");

  // Tomorrow, for Sam; then Save.
  press(dayButton(tree, "Tomorrow"));
  tree = redraw();
  type(
    find(byTestId(tree, "step-sheet-for"), (n) => n.type === "select"),
    "u-sam",
  );
  tree = redraw();
  assert.equal(W.__recordFolds.dirty(), true, "typed: the tab asks before closing over it");
  press(saveOf(tree));
  tree = await until("written", () => saved.length > 0);
  const writes = calls.filter((c) => c.method === "POST");
  assert.deepEqual(
    writes.map((c) => [c.path, c.body]),
    [
      [
        "/api/v1/contacts/p1/notes",
        {
          body: "Call about the timeline",
          due_on: contracts.stepDays(now, ZONE)[1].key,
          for_user_id: "u-sam",
          team_only: true,
          deal_id: "d1",
        },
      ],
    ],
  );
  assert.equal(textOf(toasts.at(-1).msg), STEP_SHEET_WORDS.done.add);
  assert.deepEqual(saved, [{ personId: "p1" }], "the page is told, and reads them again");
  assert.equal(sheetOf(tree), null, "and the sheet has closed");
  assert.equal(W.__recordFolds.dirty(), false);
});

test("a change opens on the step as it stands and saves with the version it opened over, which the door refuses if a teammate changed it since; someone else's step is not changed here", async () => {
  const now = Date.now();
  const { calls } = wire(() => personDto(now, [noteDto(now, "n1", { version: 2 })]));
  open();
  W.openStepSheet({ personId: "p1", noteId: "n1" });
  let tree = await until("the step is read", (t) => input(t, "step-sheet-what-input"));
  assert.equal(title(tree), "Change the step");
  assert.equal(input(tree, "step-sheet-what-input").props.value, "Call about the timeline");
  type(input(redraw(), "step-sheet-what-input"), "Call about the timeline and the logo");
  press(saveOf(redraw()));
  await until("written", () => saved.length > 0);
  const write = calls.find((c) => c.method === "POST");
  assert.deepEqual([write.body.note_id, write.body.version, write.body.deal_id], ["n1", 2, "d1"]);
  assert.equal(textOf(toasts.at(-1).msg), STEP_SHEET_WORDS.done.edit);

  wire(() => personDto(now, [noteDto(now, "n2", { mine: false, author_name: "Sam" })]));
  open();
  W.openStepSheet({ personId: "p1", noteId: "n2" });
  tree = await until("blocked", (t) => byTestId(t, "step-sheet-blocked"));
  assert.equal(textOf(byTestId(tree, "step-sheet-blocked")), NOTE_REFUSALS.not_yours);
  assert.equal(saveOf(tree)?.props?.disabled ?? true, true, "nothing to save");
});

test("a person the sheet cannot read is said in the sheet, never a throw that takes the shell with it", async () => {
  const { answers } = wire(() => personDto(Date.now()));
  answers.person = () =>
    json(404, { ok: false, error: { code: "not_found", message: "This person is not in your workspace." } });
  open();
  W.openStepSheet({ personId: "p1" });
  const tree = await quietly(() => until("said", (t) => byTestId(t, "step-sheet-failed")));
  assert.ok(byTestId(tree, "step-sheet-failed"));
});

test("refused because a teammate changed the step since, the sheet reads it again: what was typed stays, the rest and the version are the fresh read's, and the second Save goes", async () => {
  const now = Date.now();
  let version = 2;
  // Days a picker never offers (it looks a week ahead at most), so the date field shows the day either way.
  let dueIn = 20;
  const { calls, answers } = wire(() =>
    personDto(now, [noteDto(now, "n1", { version, due_on: zoneDayKey(now + dueIn * D, ZONE) })]),
  );
  let refuse = true;
  const ok = answers.note;
  answers.note = (body) => {
    if (!refuse) return ok(body);
    refuse = false;
    return json(409, { ok: false, error: { code: "conflict", message: NOTE_REFUSALS.moved } });
  };
  open();
  W.openStepSheet({ personId: "p1", noteId: "n1" });
  let tree = await until("the step is read", (t) => input(t, "step-sheet-what-input"));
  type(input(tree, "step-sheet-what-input"), "Call about the timeline and the logo");
  // Meanwhile a teammate moved its day, and the step's version with it.
  version = 5;
  dueIn = 30;
  press(saveOf(redraw()));
  // Refused, and the fresh read landed: the day left alone is the teammate's.
  tree = await until(
    "refused, and read again",
    (t) =>
      byTestId(t, "step-sheet-problem") &&
      input(t, "step-sheet-day-input")?.props.value === zoneDayKey(now + 30 * D, ZONE),
  );
  assert.equal(textOf(byTestId(tree, "step-sheet-problem")), NOTE_REFUSALS.moved);
  assert.equal(
    input(tree, "step-sheet-what-input").props.value,
    "Call about the timeline and the logo",
    "what was typed stays",
  );
  press(saveOf(tree));
  await until("written", () => saved.length > 0);
  const [first, second] = calls.filter((c) => c.method === "POST").map((c) => c.body);
  assert.equal(first.version, 2, "the first Save named the version it was read at");
  assert.deepEqual(
    [second.note_id, second.version, second.body, second.due_on],
    ["n1", 5, "Call about the timeline and the logo", zoneDayKey(now + 30 * D, ZONE)],
    "the second: the fresh version, the words typed here, the teammate's day",
  );
});

test("a note's write answers when the server takes it: People, whose rows carry each next step, is read again behind it, not in front", async () => {
  const { startSurfaces } = await import("../../../apps/dashboard/src/legacy-bridge/surface-runner.ts");
  // The refresh map's re-read is real only with the runner started (no surface of its own, no live feed).
  startSurfaces([], () => () => {});
  const now = Date.now();
  wire(() => personDto(now, [noteDto(now, "n1")]));
  // People's read, held the way a slow network holds a list read page after page.
  const answered = W.fetch;
  const reread = [];
  W.fetch = (url, init = {}) => {
    const u = new URL(String(url), "https://app.chanlytics.com");
    if (u.pathname === "/api/v1/contacts") {
      reread.push(u.pathname);
      return new Promise(() => {});
    }
    return answered(url, init);
  };
  const N = W.__personNotes;
  for (const [what, press] of [
    ["a step written", () => N.write("p1", { body: "Call", due_on: zoneDayKey(now + 3 * D, ZONE), team_only: true })],
    ["a step done", () => N.done("p1", "n1", true, 2)],
    ["a note taken away", () => N.remove("p1", "n1")],
  ]) {
    const waited = new Promise((r) => setTimeout(() => r("waited on People's read"), 1000));
    const r = await Promise.race([press(), waited]);
    assert.notEqual(r, "waited on People's read", `${what}: answered when the server took it`);
    assert.equal(r.ok, true, what);
  }
  await new Promise((r) => setTimeout(r, 50));
  assert.ok(reread.length >= 1, "and People was read again all the same, behind the answers");
});
