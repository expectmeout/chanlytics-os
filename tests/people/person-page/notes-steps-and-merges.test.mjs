/**
 * Notes as a log, steps with a day, and merging two records (0007, 0028, 0034): who may change or delete what, a
 * step ticked done by anyone who acts, and a merge the door refuses said in its own sentence.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { all, byTestId, find, press, textOf } from "../../_stub-react.mjs";
import { until } from "../../shared/_until.mjs";
import * as contracts from "@chanlytics/contracts";
import {
  H,
  Menu,
  NOTE_TEAM,
  NOW,
  Picker,
  ZONE,
  actsIn,
  chooseIn,
  dayFrom,
  dealRow,
  detail,
  dispatched,
  idle,
  iso,
  itemsIn,
  mergeConfirm,
  noteDto,
  notesTab,
  openedRow,
  profile,
  recordingNotes,
  refused,
  row,
  setSurfaceValue,
  settle,
  stepNotes,
  surfaceValue,
  toPersonRowVM,
  toPersonVM,
  took,
  type,
  withDeals,
  withNotes,
  world,
  worldFetch,
} from "./_person-page.mjs";

test("a person's notes are a log (0007): AI's suggestion first, then newest first, each signed and dated, who it is for and whether AI reads it", () => {
  const vm = toPersonVM(withNotes(), ZONE, new Date(NOW));
  assert.deepEqual(
    vm.noteList.map((n) => [n.body, n.who, n.forWho, n.teamOnly, n.suggested, n.from]),
    [
      ["Prefers early mornings.", "AI", null, false, true, "After a call"],
      ["Allergic to ammonia.", "You", null, false, false, null],
      ["Call her back about the bridal party.", "Maria", "For you", true, false, null],
      ["Sees Sofia.", "A former teammate", null, false, false, null],
    ],
  );
  assert.equal(vm.noteList[1].edited, true, "changed after it was written");
  assert.equal(vm.noteList[1].mine, true);
  assert.ok(
    vm.noteList.every((n) => n.when && n.whenFull),
    "every note says when",
  );
  assert.deepEqual(vm.noteTeam, NOTE_TEAM);
});

test("REGRESSION: the notes card was one box AI read whole, overwritten by every save -- now a note is added, kept or dismissed, and said with who wrote it and when", async () => {
  const vm = toPersonVM(withNotes(), ZONE, new Date(NOW));
  const sent = [];
  recordingNotes(sent);
  const draw = await notesTab(vm);
  let tree = draw();
  const card = byTestId(tree, "person-notes");
  assert.ok(card, "the card");
  const suggested = byTestId(card, "person-note-suggested");
  // Who suggested it, where it was heard and when, said on its eyebrow on every screen (a phone has no hover); the date
  // with its year is its hover.
  assert.match(textOf(suggested), /^Suggested by AI · after a call · /);
  assert.match(
    String(find(suggested, (n) => typeof n.props?.["data-tip"] === "string")?.props["data-tip"]),
    /, 20\d\d · /,
  );
  const rows = all(card, (n) => n.props?.["data-testid"] === "person-note");
  assert.ok(
    rows.every((r) => !String(r.props.className).split(" ").includes("cl-prof-note")),
    "REGRESSION: the row wore .cl-prof-note, the consent form's class, whose align-items: center pushed every note off the card's edge",
  );
  assert.deepEqual(
    rows.map((r) => textOf(find(r, (n) => n.props?.className === "cl-prof-note-body"))),
    ["Allergic to ammonia.", "Call her back about the bridal party.", "Sees Sofia."],
  );
  assert.match(textOf(rows[1]), /Maria/);
  assert.match(textOf(rows[1]), /For you/);
  assert.match(textOf(rows[1]), /Team only/);
  assert.equal(byTestId(tree, "person-notes-save"), null, "nothing to add until something is written");

  // The keep is written, then the page read again: typed before that read lands, the words would go with the old box.
  const reads = took("GET", `/api/v1/contacts/${vm.id}`).length;
  press(byTestId(suggested, "person-note-keep"));
  await until(() => took("GET", `/api/v1/contacts/${vm.id}`).length > reads, "the keep, then the page read again");
  await idle();
  assert.deepEqual(sent.at(-1), ["decide", vm.id, { note_id: "n-sug", keep: true }]);

  type(byTestId(draw(), "person-notes-input"), "  Likes tea.  ");
  tree = draw();
  // For is a choice under its word, Anyone first and you next (0052's composer).
  assert.deepEqual(
    all(byTestId(tree, "person-note-for"), (n) => n.props?.role === "radio").map((n) => textOf(n).trim()),
    ["Anyone", "Me", "Sam"],
  );
  chooseIn(tree, "person-note-for", "Sam");
  tree = draw();
  // Team only is the kit's switch (canvas A, the composer's foot).
  press(byTestId(tree, "person-note-team-only"));
  tree = draw();
  press(byTestId(tree, "person-notes-save"));
  await until(() => sent.at(-1)?.[0] === "write", "the note reached its door");
  assert.deepEqual(sent.at(-1), ["write", vm.id, { body: "Likes tea.", for_user_id: "u-sam", team_only: true }]);
  assert.equal(byTestId(draw(), "person-notes-input").props.value, "", "the box empties once the note is added");
});

test("who may do what to a note: its author changes it, an owner or its author deletes it, a viewer only reads", async () => {
  const vm = toPersonVM(withNotes(), ZONE, new Date(NOW));
  const me = globalThis.window.__ME;
  try {
    const actsOf = (tree) =>
      all(tree, (n) => n.props?.["data-testid"] === "person-note").map((r) => {
        const m = find(r, (n) => n.type === Menu);
        return m ? itemsIn(m).map((i) => i.label) : [];
      });
    globalThis.window.__ME = { role: "owner" };
    let draw = await notesTab(vm);
    assert.deepEqual(
      actsOf(draw()),
      [["Edit", "Delete"], ["Delete"], ["Delete"]],
      "an owner deletes any; edits only their own",
    );
    globalThis.window.__ME = { role: "operator" };
    draw = await notesTab(vm);
    assert.deepEqual(actsOf(draw()), [["Edit", "Delete"], [], []], "an operator only their own");
    globalThis.window.__ME = { role: "viewer" };
    draw = await notesTab(vm);
    const tree = draw();
    assert.equal(byTestId(tree, "person-notes-input"), null, "a viewer writes nothing");
    assert.deepEqual(actsOf(tree), [[], [], []]);
    assert.equal(byTestId(tree, "person-note-keep"), null, "nor keeps a suggestion");
    // REGRESSION: an owner previewing a viewer (View-as) is shown what a viewer is. The page read the signed-in role,
    // blind to the preview, and offered the owner's controls to the viewer they were previewing.
    globalThis.window.__ME = { role: "owner" };
    globalThis.window.ST_STORE.viewAsRole = "viewer";
    draw = await notesTab(vm);
    const previewed = draw();
    assert.equal(byTestId(previewed, "person-notes-input"), null, "an owner previewing a viewer writes nothing");
    assert.deepEqual(actsOf(previewed), [[], [], []], "and deletes nothing");
  } finally {
    globalThis.window.ST_STORE.viewAsRole = null;
    globalThis.window.__ME = me;
  }
});

test("a note may have a day (0007, amended): a day makes it a step and holds Team only on; a step says its day, is ticked done by anyone who acts, says who did it and when, and offers the next one", async () => {
  const vm = toPersonVM(detail({ person_notes: stepNotes(), note_team: NOTE_TEAM }), ZONE, new Date(NOW));
  const sent = [];
  const flashes = [];
  // The step sheet is asked for by the event it hears (step-sheet.tsx openStepSheet): what the window was told.
  const asked = () => dispatched.filter((e) => e.type === "step:sheet").map((e) => e.detail);
  const keep = { toast: globalThis.window.usePPToast };
  recordingNotes(sent);
  globalThis.window.usePPToast = () => [null, (t) => flashes.push(t)];
  const W = contracts.NOTE_WORDS;
  try {
    const draw = await notesTab(vm);
    const rowsOf = (tree) => all(byTestId(tree, "person-notes"), (n) => n.props?.["data-testid"] === "person-note");
    let [step, done, plain] = rowsOf(draw());
    assert.match(String(step.props.className), /\bis-step\b/);
    assert.equal(textOf(byTestId(step, "person-note-due")), vm.noteList[0].step.words);
    assert.match(textOf(byTestId(step, "person-note-due")), /^Due /);
    assert.doesNotMatch(textOf(step), /Team only/, "a step is the team's by rule: its line does not say so again");
    assert.match(String(done.props.className), /\bis-done\b/);
    assert.match(textOf(byTestId(done, "person-note-due")), /^Done by Sam · /);
    assert.equal(byTestId(plain, "person-note-due"), null, "a note with no day says none");
    assert.equal(byTestId(plain, "person-note-done"), null);

    // Ticked by anyone who acts, with the version the page saw; done, the toast says it in bold with the step's words and
    // its Undo opens it again (canvas A, M5): a true inverse door, and no sheet asked for.
    byTestId(step, "person-note-done").props.onChange({ target: { checked: true } });
    await settle();
    assert.deepEqual(sent.at(-1), ["done", vm.id, { note_id: "n-step", done: true, version: 1 }]);
    assert.match(textOf(flashes.at(-1).msg), new RegExp(`^${W.stepDone} · Call about the timeline$`));
    assert.equal(flashes.at(-1).action, undefined, "no Set the next one");
    flashes.at(-1).undo();
    await settle();
    assert.deepEqual(sent.at(-1), ["done", vm.id, { note_id: "n-step", done: false }], "Undo opens the step again");
    assert.deepEqual(asked(), [], "and no sheet");
    // Ticked again, a done step is open again, and nothing is offered.
    [step, done, plain] = rowsOf(draw());
    byTestId(done, "person-note-done").props.onChange({ target: { checked: false } });
    await settle();
    assert.deepEqual(sent.at(-1), ["done", vm.id, { note_id: "n-done", done: false, version: 1 }]);
    assert.equal(flashes.at(-1).action, undefined);

    // The composer: its days are four (Today, Tomorrow, this week's Friday or next week, Pick a day: canvas A); a day
    // makes the note a step, holds Team only on whatever it was, and the button says what it makes.
    type(byTestId(draw(), "person-notes-input"), "Follow up on the logo");
    let tree = draw();
    assert.equal(textOf(byTestId(tree, "person-notes-save")).trim(), W.add);
    // By the workspace's clock, as the page counts them (pageClock): in UTC, from midnight there until midnight in New
    // York, "Tomorrow" was a day later than the page's (13 October 2026, 03:55 UTC).
    const days = contracts.composerDays(Date.now(), ZONE);
    assert.deepEqual(
      all(byTestId(tree, "person-note-day"), (n) => n.props?.role === "radio").map((n) => textOf(n).trim()),
      days.map((d) => d.label),
    );
    const tomorrow = days[1];
    assert.equal(tomorrow.label, "Tomorrow");
    chooseIn(tree, "person-note-day", "Tomorrow");
    tree = draw();
    const lock = byTestId(tree, "person-note-team-only");
    assert.deepEqual([lock.props["aria-checked"], lock.props["aria-disabled"]], [true, true]);
    assert.equal(textOf(byTestId(tree, "person-notes-save")).trim(), "Add step for Tomorrow");
    // A second press on the day chosen takes it away, and a first chooses it again.
    chooseIn(tree, "person-note-day", "Tomorrow");
    tree = draw();
    assert.equal(textOf(byTestId(tree, "person-notes-save")).trim(), W.add);
    chooseIn(tree, "person-note-day", "Tomorrow");
    tree = draw();
    press(byTestId(tree, "person-notes-save"));
    await settle();
    assert.deepEqual(sent.at(-1), [
      "write",
      vm.id,
      { body: "Follow up on the logo", for_user_id: null, team_only: true, due_on: tomorrow.key },
    ]);
    assert.equal(textOf(flashes.at(-1).msg), W.stepAdded);

    // Pick a day opens the date field, and Add waits for a day.
    type(byTestId(draw(), "person-notes-input"), "Call her back");
    tree = draw();
    chooseIn(tree, "person-note-day", "Pick a day");
    tree = draw();
    assert.equal(byTestId(tree, "person-notes-save").props.disabled, true, "no day picked yet");
    // Nor from the keyboard: Ctrl+Enter adds nothing until a day is picked (it was a plain note the receptionist read).
    const writes = sent.length;
    byTestId(tree, "person-notes-input").props.onKeyDown({ key: "Enter", ctrlKey: true, metaKey: false });
    await settle();
    assert.equal(sent.length, writes, "the keyboard waits for a day as the button does");
    byTestId(tree, "person-note-date").props.onChange({ target: { value: "2026-12-01" } });
    tree = draw();
    press(byTestId(tree, "person-notes-save"));
    await settle();
    assert.equal(sent.at(-1)[2].due_on, "2026-12-01");

    // Its author takes a day away: the change says so. A note that never had one says nothing of days.
    const editOf = (row) => actsIn(find(row, (n) => n.type === Menu)).find((i) => i.label === W.edit);
    [step, done, plain] = rowsOf(draw());
    editOf(step).onClick();
    tree = draw();
    // Its day is the one chosen (in the date field, under Pick a day, where it is none of the composer's three), and a
    // second press on it takes it away.
    const chosen = find(byTestId(tree, "person-note-day"), (n) => n.props?.role === "radio" && n.props["aria-checked"]);
    assert.ok(chosen, "the step's day is chosen");
    press(chosen);
    press(byTestId(draw(), "person-note-save"));
    await settle();
    assert.deepEqual(sent.at(-1), [
      "write",
      vm.id,
      {
        body: "Call about the timeline",
        for_user_id: null,
        team_only: true,
        note_id: "n-step",
        version: 1,
        clear_due: true,
      },
    ]);
    [step, done, plain] = rowsOf(draw());
    editOf(plain).onClick();
    press(byTestId(draw(), "person-note-save"));
    await settle();
    assert.deepEqual(sent.at(-1), [
      "write",
      vm.id,
      { body: "Allergic to ammonia.", for_user_id: null, team_only: false, note_id: "n-plain", version: 1 },
    ]);
  } finally {
    globalThis.window.usePPToast = keep.toast;
  }
});

test("a deal's card says its next step (0007, amended): Next, what, when, for whom, with Done and, for its author, Change; with none, Set a next step; a viewer only reads it", async () => {
  const sent = [];
  const asked = [];
  // What the window was told of a step: a done says nothing of its own when it lands (the write's refresh reads People behind it, and
  // the page follows People), and says People moved where the door refused it, as nothing is read for a write that was not made.
  const heard = (from) => dispatched.slice(from).filter((e) => e.type === "note:saved" || e.type === "surface:clients");
  const keep = { sheet: globalThis.window.openStepSheet, me: globalThis.window.__ME };
  recordingNotes(sent);
  // The card asks the shell's step sheet, which the frame draws once: here, a stand-in that says it was asked.
  globalThis.window.openStepSheet = (ask) => (asked.push(ask), true);
  const S = contracts.NOTE_WORDS;
  try {
    const notes = [
      noteDto("n-late", "Chase the signature", 3, { due_on: dayFrom(6), deal_id: "d1", team_only: true }),
      noteDto("n-soon", "Call about the timeline", 5, {
        due_on: dayFrom(2),
        deal_id: "d1",
        mine: true,
        author_name: "Ruben",
        for_user_id: "u-sam",
        for_name: "Sam",
        team_only: true,
      }),
      noteDto("n-person", "Ask about her sister", 7, { due_on: dayFrom(1), team_only: true }),
    ];
    let tree = await openedRow(withDeals([dealRow()], { person_notes: notes, note_team: NOTE_TEAM }), "overview");
    const card = byTestId(tree, "person-deal-card");
    const step = byTestId(card, "person-deal-nextstep");
    assert.ok(step, "the card says its next step");
    // The earliest open step that names the deal; the person's own step (no deal) is not the card's.
    assert.equal(textOf(byTestId(step, "person-deal-nextstep-words")), "Call about the timeline");
    assert.match(textOf(byTestId(step, "person-deal-nextstep-day")), /^Due /);
    assert.match(textOf(step), new RegExp(`^${S.next}`));
    assert.match(textOf(step), /For Sam/);
    // A second press while the first is on its way reaches the door once: the first answers for both.
    const told = dispatched.length;
    press(byTestId(step, "person-deal-nextstep-done"));
    press(byTestId(step, "person-deal-nextstep-done"));
    await settle();
    assert.deepEqual(
      sent.filter((x) => x[0] === "done"),
      [["done", "p1", { note_id: "n-soon", done: true, version: 1 }]],
      "one press, however many",
    );
    assert.deepEqual(
      heard(told),
      [],
      "a done the door took says nothing: People is read behind it and the page follows",
    );
    // A done the door refused (the step moved since the page read it): nothing was written, so nothing is read behind it, and the
    // page says People moved so that it is read again and the next press has the step as it now is.
    const taken = world.answers["POST /api/v1/contacts/p1/notes/done"];
    world.answers["POST /api/v1/contacts/p1/notes/done"] = () => refused(409, "Someone changed this step.", "conflict");
    const refusedAt = dispatched.length;
    press(byTestId(step, "person-deal-nextstep-done"));
    await settle();
    assert.deepEqual(
      heard(refusedAt).map((e) => e.type),
      ["surface:clients"],
      "a refused done reads the page again",
    );
    world.answers["POST /api/v1/contacts/p1/notes/done"] = taken;
    press(byTestId(step, "person-deal-nextstep-change"));
    assert.deepEqual(asked.at(-1), { personId: "p1", noteId: "n-soon" });

    // Someone else's step: Done, and no Change.
    tree = await openedRow(withDeals([dealRow()], { person_notes: [notes[0]], note_team: NOTE_TEAM }), "overview");
    assert.ok(byTestId(tree, "person-deal-nextstep-done"));
    assert.equal(byTestId(tree, "person-deal-nextstep-change"), null, "only its author changes it");

    // No step on the deal: Set a next step, which asks for the sheet on that deal.
    tree = await openedRow(withDeals([dealRow()], { person_notes: [notes[2]], note_team: NOTE_TEAM }), "overview");
    assert.equal(byTestId(tree, "person-deal-nextstep"), null);
    const set = byTestId(tree, "person-deal-set-nextstep");
    assert.equal(textOf(set), S.setNext);
    press(set);
    // With the act the card leads with, which suggests the step (contracts stepSheetFor's lead): Edit, no link yet, so
    // nothing is suggested here.
    assert.deepEqual(asked.at(-1), { personId: "p1", dealId: "d1", lead: "edit" });

    // A viewer reads the step and acts on none of it.
    globalThis.window.__ME = { role: "viewer" };
    tree = await openedRow(withDeals([dealRow()], { person_notes: notes, note_team: NOTE_TEAM }), "overview");
    assert.ok(byTestId(tree, "person-deal-nextstep"));
    assert.equal(byTestId(tree, "person-deal-nextstep-done"), null);
    assert.equal(byTestId(tree, "person-deal-nextstep-change"), null);
    tree = await openedRow(withDeals([dealRow()], { person_notes: [], note_team: NOTE_TEAM }), "overview");
    assert.equal(byTestId(tree, "person-deal-set-nextstep"), null);
  } finally {
    globalThis.window.openStepSheet = keep.sheet;
    globalThis.window.__ME = keep.me;
    globalThis.window.fetch = keep.fetch;
  }
});

test("Merge with another record (0028): the owner's act opens the picker over People and the typed confirmation, and the merge is the kept record's request", async () => {
  const { MERGE_WORDS } = contracts;
  const vm = toPersonVM(detail(), ZONE, new Date(NOW));
  const other = toPersonRowVM(
    row({
      id: "p2",
      display_name: "Daniela by email",
      phone_e164: null,
      email: "daniela@example.com",
      channels: ["email"],
    }),
    ZONE,
    new Date(NOW),
  );
  const saved = surfaceValue("people");
  const me = globalThis.window.__ME;
  globalThis.window.__ME = { role: "owner" };
  // People as the tab holds it: this person and the other record. The page offers every other row.
  setSurfaceValue("people", {
    ...(saved ?? {}),
    lists: saved?.lists ?? [],
    rows: [toPersonRowVM(row(), ZONE, new Date(NOW)), other],
  });
  try {
    globalThis.window.fetch = worldFetch;
    world.holding.clear();
    const draw = await profile(vm);
    await settle();
    const more = find(
      find(draw(), (n) => n.props?.className === "cl-prof-queue-actions"),
      (n) => n.type === Menu,
    );
    const act = actsIn(more).find((i) => i.label === MERGE_WORDS.act);
    assert.ok(act, "the owner's menu offers the merge");
    assert.equal(act.title, MERGE_WORDS.actHint);
    assert.equal(byTestId(draw(), "merge"), null, "nothing is drawn until the act is pressed");

    act.onSelect();
    const box = byTestId(draw(), "merge");
    assert.ok(box, "the merge box");
    const picker = find(box, (n) => n.type === Picker);
    assert.deepEqual(
      picker.props.groups.flatMap((g) => g.options).map((o) => [o.value, o.label, o.sub]),
      [["p2", "Daniela by email", "daniela@example.com"]],
      "the other records of People, this person left out",
    );
    assert.equal(picker.props.placeholder, MERGE_WORDS.pickNone);
    let confirm = mergeConfirm(draw());
    assert.equal(confirm.props.ready, false, "nothing chosen, nothing typed");
    assert.equal(textOf(confirm.props.question), MERGE_WORDS.question(vm.name, "the other record"));

    picker.props.onValueChange("p2");
    confirm = mergeConfirm(draw());
    assert.equal(textOf(confirm.props.question), MERGE_WORDS.question(vm.name, "Daniela by email"));
    assert.equal(confirm.props.ready, false, "chosen, but the kept name is not typed");
    // What it does is the sheet's body, under the pick, once (the question and its answers are the foot's): what moves
    // and that it cannot be undone first, the rest under What else changes (the fitted sheets, 14 Oct 2026).
    const body = textOf(byTestId(draw(), "merge"));
    assert.ok(body.includes(MERGE_WORDS.lead(vm.name, "Daniela by email")));
    assert.ok(textOf(byTestId(draw(), "merge-more")).includes(MERGE_WORDS.rest("Daniela by email")));
    confirm.props.onType(vm.name);
    confirm = mergeConfirm(draw());
    assert.equal(confirm.props.ready, true);
    assert.equal(textOf(confirm.props.yes), MERGE_WORDS.yes);

    const before = world.seen.length;
    confirm.props.onYes();
    const readAgain = () =>
      world.seen.slice(before).some((r) => r.method === "GET" && r.path === "/api/v1/contacts/p1");
    await until(readAgain, "and the page is read again, whole");
    const sent = world.seen.slice(before).find((r) => r.method === "POST");
    assert.deepEqual(
      [sent?.path, sent?.body],
      ["/api/v1/contacts/p1/merge", { merge: "p2" }],
      "the kept record's route, the other in the body",
    );
    // The merge asks in the kit's sheet (canvas A), which closes; it plays its way out with what it held.
    assert.equal(find(draw(), (n) => n.props?.testid === "person-merge-sheet")?.props.open, false, "the sheet closes");
  } finally {
    globalThis.window.__ME = me;
    setSurfaceValue("people", saved);
  }
});

test("Not a person… opens Delete's question with its switch on (00483; the live walk, 27 Oct 2026)", async () => {
  const me = globalThis.window.__ME;
  globalThis.window.__ME = { role: "owner" };
  try {
    const draw = await profile(toPersonVM(detail({ row: row({ email: "news@shop.example" }) }), ZONE, new Date(NOW)));
    await settle();
    const more = find(
      find(draw(), (n) => n.props?.className === "cl-prof-queue-actions"),
      (n) => n.type === Menu,
    );
    actsIn(more)
      .find((i) => i.label === contracts.PERSON_ACT_WORDS.notAPerson)
      .onSelect();
    assert.equal(byTestId(draw(), "delete-not-a-person")?.props.checked, true, "Delete's question, its switch on");
  } finally {
    globalThis.window.__ME = me;
  }
});

test("Same person? (0034 step 4): each doubt the door raised is a row saying who else it could be; Merge opens 0028's box with that record chosen, read or not by People; Not the same settles the pair through its door and the page is read again; an operator may say not the same and not merge", async () => {
  const { DOUBT_WORDS, MERGE_WORDS, toPersonRowVM } = contracts;
  const dto = {
    ...detail(),
    doubts: [
      {
        id: "d1",
        seen: "email",
        created_at: iso(2 * H),
        other: {
          id: "p2",
          display_name: "Daniela by email",
          wa_profile_name: null,
          phone_e164: null,
          email: "daniela@example.com",
        },
      },
      {
        id: "d2",
        seen: "name",
        created_at: iso(H),
        other: { id: "p3", display_name: null, wa_profile_name: null, phone_e164: "+17865550182", email: null },
      },
    ],
  };
  const vm = toPersonVM(dto, ZONE, new Date(NOW));
  assert.deepEqual(
    vm.doubts.map((d) => [d.id, d.otherId, d.other, d.phone, d.email, d.sentence]),
    [
      ["d1", "p2", "Daniela by email", null, "daniela@example.com", DOUBT_WORDS.seen.email("Daniela by email")],
      ["d2", "p3", "+1 (786) 555-0182", "+1 (786) 555-0182", null, DOUBT_WORDS.seen.name("+1 (786) 555-0182")],
    ],
    "each doubt as the page says it: the other record as People names them, and the sentence for what was seen",
  );
  assert.deepEqual(toPersonVM(detail(), ZONE, new Date(NOW)).doubts, [], "none from a server before the table");
  const saved = surfaceValue("people");
  const me = globalThis.window.__ME;
  const rowsIn = (tree) => all(tree, (n) => n.props?.["data-testid"] === "doubt");
  try {
    globalThis.window.fetch = worldFetch;
    world.holding.clear();
    // People as the tab holds it: this person alone, so neither other record is among People's rows.
    globalThis.window.__ME = { role: "owner" };
    setSurfaceValue("people", {
      ...(saved ?? {}),
      lists: saved?.lists ?? [],
      rows: [toPersonRowVM(row(), ZONE, new Date(NOW))],
    });
    let draw = await profile(vm);
    await settle();
    let rows = rowsIn(draw());
    assert.equal(rows.length, 2, "a row per open doubt");
    assert.ok(textOf(rows[0]).includes(DOUBT_WORDS.seen.email("Daniela by email")), "the sentence");
    assert.equal(byTestId(draw(), "merge"), null, "nothing is drawn until a settlement is pressed");

    // Merge: 0028's box, the doubt's record chosen already, offered even though People does not list it.
    byTestId(rows[0], "doubt-merge").props.onClick();
    const box = byTestId(draw(), "merge");
    assert.ok(box, "the merge box");
    const picker = find(box, (n) => n.type === Picker);
    assert.equal(picker.props.value, "p2", "the doubt's record is the one chosen");
    assert.deepEqual(
      picker.props.groups.flatMap((g) => g.options).map((o) => [o.value, o.label, o.sub]),
      [
        ["p2", "Daniela by email", "daniela@example.com"],
        ["p3", "+1 (786) 555-0182", "+1 (786) 555-0182"],
      ],
      "the doubts' records, beside what People holds",
    );
    const confirm = mergeConfirm(draw());
    assert.equal(textOf(confirm.props.question), MERGE_WORDS.question(vm.name, "Daniela by email"));

    // Not the same: the pair's own door, then the page read again.
    const before = world.seen.length;
    byTestId(rows[1], "doubt-apart").props.onClick();
    const readAgain = () =>
      world.seen.slice(before).some((r) => r.method === "GET" && r.path === "/api/v1/contacts/p1");
    await until(readAgain, "and the page is read again, whole");
    const sent = world.seen.slice(before).find((r) => r.method === "POST");
    assert.deepEqual(
      [sent?.path, sent?.body],
      ["/api/v1/contacts/p1/doubts/dismiss", { doubt_id: "d2" }],
      "this person's route, the doubt in the body",
    );

    // An operator: Not the same is theirs; the merge is the owner's.
    globalThis.window.__ME = { role: "operator" };
    draw = await profile(vm);
    await settle();
    rows = rowsIn(draw());
    assert.equal(rows.length, 2);
    assert.equal(byTestId(rows[0], "doubt-merge"), null, "no merge for an operator");
    assert.ok(byTestId(rows[0], "doubt-apart"), "not the same is any acting member's");
    // A viewer: the rows say it, and settle nothing.
    globalThis.window.__ME = { role: "viewer" };
    draw = await profile(vm);
    await settle();
    rows = rowsIn(draw());
    assert.equal(rows.length, 2);
    assert.equal(byTestId(rows[0], "doubt-merge"), null);
    assert.equal(byTestId(rows[0], "doubt-apart"), null);
  } finally {
    globalThis.window.__ME = me;
    setSurfaceValue("people", saved);
  }
});

test("the merge is the owner's: an operator's menu does not offer it; the picker leaves out a record the door would refuse, and says when People is not read", async () => {
  const { MERGE_WORDS } = contracts;
  const vm = toPersonVM(detail(), ZONE, new Date(NOW));
  const at = (over) => toPersonRowVM(row(over), ZONE, new Date(NOW));
  const saved = surfaceValue("people");
  const me = globalThis.window.__ME;
  const menuOf = (tree) =>
    find(
      find(tree, (n) => n.props?.className === "cl-prof-queue-actions"),
      (n) => n.type === Menu,
    );
  try {
    globalThis.window.fetch = worldFetch;
    world.holding.clear();
    // An operator: the act is not in their menu.
    globalThis.window.__ME = { role: "operator" };
    setSurfaceValue("people", { ...(saved ?? {}), lists: saved?.lists ?? [], rows: [at({})] });
    let draw = await profile(vm);
    await settle();
    assert.equal(
      actsIn(menuOf(draw())).some((i) => i.label === MERGE_WORDS.act),
      false,
      "an operator is not offered what the route would refuse them",
    );

    // An owner: every other record the door could take, and none it would refuse as two people.
    globalThis.window.__ME = { role: "owner" };
    setSurfaceValue("people", {
      ...(saved ?? {}),
      lists: saved?.lists ?? [],
      rows: [
        at({}),
        at({ id: "p2", display_name: "By email", phone_e164: null, email: "one@example.com", channels: ["email"] }),
        at({ id: "p3", display_name: "Another number", phone_e164: "+17865550199" }),
      ],
    });
    draw = await profile(vm);
    await settle();
    actsIn(menuOf(draw()))
      .find((i) => i.label === MERGE_WORDS.act)
      .onSelect();
    let picker = find(byTestId(draw(), "merge"), (n) => n.type === Picker);
    assert.deepEqual(
      picker.props.groups.flatMap((g) => g.options).map((o) => o.value),
      ["p2"],
      "a record with a different number is two people to the door, and is not offered",
    );
    assert.equal(picker.props.note, undefined);

    // People not read yet: nothing to choose from, and the picker says why.
    setSurfaceValue("people", undefined);
    picker = find(byTestId(draw(), "merge"), (n) => n.type === Picker);
    assert.deepEqual(
      picker.props.groups.flatMap((g) => g.options),
      [],
    );
    assert.equal(picker.props.note, MERGE_WORDS.pickReading);
  } finally {
    globalThis.window.__ME = me;
    setSurfaceValue("people", saved);
  }
});

test("a merge the door refuses says so in the box, in the door's sentence, and a second press while one is out sends nothing", async () => {
  const { MERGE_REFUSALS } = contracts;
  const vm = toPersonVM(detail(), ZONE, new Date(NOW));
  const other = toPersonRowVM(
    row({ id: "p2", display_name: "By email", phone_e164: null, email: "one@example.com", channels: ["email"] }),
    ZONE,
    new Date(NOW),
  );
  const saved = surfaceValue("people");
  const me = globalThis.window.__ME;
  globalThis.window.__ME = { role: "owner" };
  setSurfaceValue("people", {
    ...(saved ?? {}),
    lists: saved?.lists ?? [],
    rows: [toPersonRowVM(row(), ZONE, new Date(NOW)), other],
  });
  const key = "POST /api/v1/contacts/p1/merge";
  try {
    globalThis.window.fetch = worldFetch;
    world.holding.clear();
    world.answers[key] = () => refused(400, MERGE_REFUSALS.deals, "validation");
    const draw = await profile(vm);
    await settle();
    const menu = find(
      find(draw(), (n) => n.props?.className === "cl-prof-queue-actions"),
      (n) => n.type === Menu,
    );
    actsIn(menu)
      .find((i) => i.label === contracts.MERGE_WORDS.act)
      .onSelect();
    const confirmOf = () => mergeConfirm(draw());
    find(byTestId(draw(), "merge"), (n) => n.type === Picker).props.onValueChange("p2");
    confirmOf().props.onType(vm.name);
    const before = world.seen.length;
    // Two presses in one turn: the first is out, and the second finds it out and sends nothing.
    confirmOf().props.onYes();
    confirmOf().props.onYes();
    await settle();
    assert.equal(world.seen.slice(before).filter((r) => r.method === "POST").length, 1, "one request for two presses");
    const after = confirmOf();
    assert.ok(after, "the box stays open on a refusal");
    assert.equal(
      textOf(after.props.error),
      MERGE_REFUSALS.deals,
      "the door's own sentence, where the owner is looking",
    );
    assert.equal(after.props.busy, false);
    // Choosing again clears what the last try said.
    find(byTestId(draw(), "merge"), (n) => n.type === Picker).props.onValueChange("p2");
    assert.equal(confirmOf().props.error, null);
  } finally {
    delete world.answers[key];
    globalThis.window.__ME = me;
    setSurfaceValue("people", saved);
  }
});
