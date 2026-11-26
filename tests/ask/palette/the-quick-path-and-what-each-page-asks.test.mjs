/**
 * The quick path that spends no model turn, what the tab keeps, N5 and N18, the Leads surface's own Ask, the
 * takeover's composer, the phone's disc, and the name a page went by.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { MODEL_QUESTIONS, QUICK_FORMS } from "../quick-path/_questions.mjs";
import {
  ASK_CITATION_KINDS,
  ASK_PAGE_ROUTES,
  ASK_SCOPE_KINDS,
  emptyReadSet,
  groundCitations,
  normalizeAnswer,
  leadQuestionRoute,
  leadsRoute,
  planSentence,
} from "@chanlytics/contracts";
import { ASK_PAGES, askJump } from "../../../apps/dashboard/src/bridge/ask/jump.ts";
import {
  AskAnswerKit,
  AskDisc,
  CLOSED,
  LEAD_CARD,
  LEAD_PLAN,
  MASCOT,
  OPEN,
  Palette,
  TH,
  all,
  ask,
  askCalls,
  askQueue,
  askText,
  asks,
  byClass,
  byTestId,
  clearTabMemory,
  closes,
  cmdJ,
  find,
  holdAsk,
  inputOf,
  isIcon,
  keyed,
  lastTree,
  later,
  nowOf,
  opens,
  phoneWindow,
  press,
  render,
  said,
  sent,
  setSurfaceValue,
  settle,
  tabMemoryFor,
  textOf,
  typed,
} from "./_palette.mjs";
import { bridgeHolds, heldDoors } from "../../shell/_bridge-holds.mjs";

/* ------------------------------ the quick path (the review's A1) ------------------------------ */

test("REGRESSION (the review's A1): an ordinary question goes to the model, wherever it says who needs me, calls or openings; only a short form is answered by the Line itself", async () => {
  for (const q of MODEL_QUESTIONS) {
    const calls = ask([]);
    render(Palette, OPEN);
    await asks(await later(Palette, OPEN), OPEN, q);
    assert.deepEqual(calls.sent, [q], `the model's: ${q}`);
    assert.equal(calls.kept.length, 0, q);
    await closes();
  }
  for (const [q] of QUICK_FORMS) {
    const calls = ask([]);
    render(Palette, OPEN);
    let tree = await later(Palette, OPEN);
    tree = await asks(tree, OPEN, q);
    assert.deepEqual(calls.sent, [], `the Line's own: ${q}`);
    assert.ok(byTestId(tree, "ask-say"), `answered at once: ${q}`);
    assert.equal(calls.kept.length, 1, `and kept: ${q}`);
    await closes();
  }
});

test("REGRESSION (the review's A1): a quick answer is a turn of a conversation -- kept, listed in Earlier, drawn above the next question, which is asked in its thread", async () => {
  bridgeHolds({ values: { today: askQueue() } });
  try {
    const calls = ask([]);
    askCalls().send = async (input, on) => {
      calls.sent.push(input.text);
      calls.inputs.push(input);
      on({ t: "thread", id: input.threadId, title: "who needs me?" });
      on({ t: "final", message: said("m-1", "Nora asked to come at 3.") });
    };
    render(Palette, OPEN);
    let tree = await later(Palette, OPEN);
    tree = await asks(tree, OPEN, "who needs me?");
    assert.deepEqual(calls.sent, [], "no model");
    const said1 = textOf(byTestId(tree, "ask-say"));
    assert.ok(said1.startsWith("Nora needs you"), said1);
    assert.equal(calls.kept.length, 1);
    const [kept] = calls.kept;
    assert.deepEqual([kept.text, kept.threadId], ["who needs me?", null], "a new conversation, titled by the question");
    assert.equal(kept.answer.say.headline, said1, "the answer kept is the answer drawn");
    assert.equal(kept.answer.show.items[0].title, "Nora", "its rows with it, so the model reads who they were");
    tree = await asks(tree, OPEN, "what did the first one want?");
    assert.deepEqual(calls.sent, ["what did the first one want?"]);
    assert.equal(
      calls.inputs[0].threadId,
      "cccccccc-cccc-4ccc-8ccc-000000000001",
      "asked in the quick answer's conversation",
    );
    const above = byTestId(tree, "ask-thread");
    assert.equal(all(above, (n) => n.props?.["data-testid"] === "ask-turn").length, 1, "above it, as any answer is");
    assert.ok(textOf(above).includes("who needs me?") && textOf(above).includes(said1), textOf(above));
    assert.equal(textOf(byTestId(nowOf(tree), "ask-say")), "Nora asked to come at 3.");
    press(byTestId(tree, "ask-clear-head"));
    tree = await later(Palette, OPEN);
    press(byTestId(tree, "ask-earlier"));
    tree = await later(Palette, OPEN);
    const earlier = all(tree, (n) => n.props?.["data-testid"] === "ask-row-thread").map(textOf);
    assert.equal(earlier.length, 1, "Earlier lists it");
    assert.ok(earlier[0].startsWith("who needs me?"), earlier[0]);
    await closes();
  } finally {
    bridgeHolds({ values: { today: undefined } });
  }
});

test("a quick question asked again resumes its thread, as a model's does; one that could not be kept leaves the next question to open a thread of its own", async () => {
  const calls = ask([{ ...TH(1), title: "Who needs me?" }]);
  render(Palette, OPEN);
  let tree = await later(Palette, OPEN);
  tree = await asks(tree, OPEN, "who needs me?");
  assert.equal(calls.kept[0].threadId, TH(1).id, "kept in the conversation whose first question it repeats");
  assert.deepEqual(calls.opened, [], "drawn at once: nothing read first");
  tree = await asks(tree, OPEN, "and the second one?");
  assert.equal(calls.inputs[0].threadId, TH(1).id);
  press(byTestId(tree, "ask-clear-head"));
  tree = await later(Palette, OPEN);
  // The route refuses it, or the network drops it: the answer stays drawn, and nothing waits on it.
  askCalls().keepQuick = async (input) => {
    calls.kept.push(input);
    return null;
  };
  tree = await asks(tree, OPEN, "any missed calls today?");
  assert.ok(textOf(byTestId(tree, "ask-say")).includes("No missed calls today"), textOf(tree));
  await asks(tree, OPEN, "and this week?");
  assert.deepEqual(calls.sent, ["and the second one?", "and this week?"]);
  assert.equal(calls.inputs[1].threadId, null, "no conversation to join: the turn opens its own");
  await closes();
});

/* ------------------------------ what the tab keeps ------------------------------ */

test("what was typed comes back on the next open; the open conversation's id is kept and opened again (spec S9)", async () => {
  const memory = tabMemoryFor(globalThis.window);
  const drafts = {
    get: (k) => memory.draft(k) ?? undefined,
    has: (k) => memory.draft(k) != null,
    set: (k, v) => memory.keepDraft(k, v),
  };
  try {
    const calls = ask([TH(1), TH(2)]);
    askCalls().send = async (input, on) => {
      calls.sent.push(input.text);
      on({ t: "thread", id: TH(1).id, title: input.text });
      on({ t: "final", message: said("m-1", "Answer 1.") });
    };
    render(Palette, OPEN);
    let tree = await later(Palette, OPEN);
    typed(tree, "how did the");
    tree = await later(Palette, OPEN);
    assert.equal(drafts.get("ask"), "how did the", "kept as typed");
    await closes();
    tree = await opens();
    assert.equal(inputOf(tree).props.value, "how did the", "back on the next open");
    keyed(tree, "Enter");
    for (let i = 0; i < 3; i++) tree = await later(Palette, OPEN);
    assert.deepEqual(calls.sent, ["how did the"]);
    assert.equal(drafts.has("ask"), false, "gone once sent");
    assert.equal(drafts.get("ask-thread"), TH(1).id, "the conversation's id is kept");
    press(byTestId(tree, "ask-clear-head"));
    tree = await later(Palette, OPEN);
    assert.equal(drafts.has("ask-thread"), false, "and forgotten at Clear");
    // A reload: the Line is made again, closed, over a tab that kept a conversation's id and words half-typed in it.
    // Being made forgets neither; the first open reads the conversation and puts the words back in the field. (Closed
    // first, so the window's listeners go with the old Line, as they do with a page.)
    await closes();
    drafts.set("ask-thread", TH(1).id);
    drafts.set("ask", "and the week before");
    render(Palette, CLOSED);
    assert.equal(drafts.get("ask-thread"), TH(1).id, "a Line made closed forgets nothing");
    tree = await opens();
    assert.deepEqual(calls.opened, [TH(1).id], "opened again after a reload");
    assert.equal(inputOf(tree).props.value, "and the week before", "with the words typed in it");
    assert.equal(drafts.get("ask"), "and the week before", "which stay kept");
    await closes();
    // A reload whose first open is a request (a caller handing a conversation over with askAbout({ thread })): the
    // request wins, and the kept conversation is not read as well.
    drafts.set("ask-thread", TH(1).id);
    render(Palette, CLOSED);
    sent("ask:seed", { thread: TH(2).id });
    tree = await opens();
    assert.deepEqual(calls.opened, [TH(1).id, TH(2).id], "only the conversation asked for is read");
    assert.equal(drafts.get("ask-thread"), TH(2).id, "and it is the one kept");
    await closes();
  } finally {
    clearTabMemory(globalThis.window.sessionStorage);
  }
});

/* ------------------------------ N5 ------------------------------ */

test("REGRESSION (N5): a conversation is deleted only when asked twice, from its × or the Delete key -- a hover × deleted it at once and no key reached it", async () => {
  const calls = ask([TH(1), TH(2)]);
  render(Palette, OPEN);
  await later(Palette, OPEN);
  cmdJ();
  let tree = await later(Palette, OPEN);
  const xs = byClass(tree, "ask-row-del");
  assert.equal(xs.length, 2, "both conversations are listed");
  press(xs[0]);
  tree = await later(Palette, OPEN);
  assert.deepEqual(calls.deleted, [], "REGRESSION: the × deleted the conversation at once");
  const asked = byTestId(tree, "ask-delete-confirm");
  assert.ok(asked, "it asks");
  assert.ok(
    textOf(asked).includes("Delete this conversation?") && textOf(asked).includes("Question 1"),
    `it asks, naming the conversation: ${textOf(asked)}`,
  );
  press(byTestId(tree, "ask-delete-no"));
  tree = await later(Palette, OPEN);
  assert.equal(byTestId(tree, "ask-delete-confirm"), null, "Keep it puts the question away");
  assert.deepEqual(calls.deleted, [], "and deletes nothing");

  // The keyboard: walk the rows to a conversation, then Delete.
  const selected = () =>
    find(
      lastTree,
      (n) =>
        String(n.props?.className || "").startsWith("ask-row ") && String(n.props.className).split(" ").includes("sel"),
    );
  for (let i = 0; i < 30 && !String(selected()?.props.className || "").includes("thread"); i++) {
    keyed(lastTree, "ArrowDown");
    settle(Palette, OPEN);
  }
  assert.ok(String(selected()?.props.className || "").includes("thread"), "the arrows reach a conversation");
  const title = textOf(selected());
  keyed(lastTree, "Delete");
  tree = await later(Palette, OPEN);
  assert.ok(
    textOf(byTestId(tree, "ask-delete-confirm")).includes("Delete this conversation?"),
    "REGRESSION: no key reached the ×",
  );
  assert.ok(
    title.includes(textOf(byTestId(tree, "ask-delete-confirm")).match(/Question \d/)[0]),
    "the question names the conversation the keyboard is on",
  );
  press(byTestId(tree, "ask-delete-yes"));
  tree = await later(Palette, OPEN);
  assert.equal(calls.deleted.length, 1, "Yes, delete deletes it");
  assert.equal(byClass(tree, "ask-row-del").length, 1, "and it leaves the list");
  await closes();
});

test("REGRESSION (N5): Earlier holds every conversation, opened with ⌘J from an open one, and its × asks first too", async () => {
  const calls = ask([TH(1), TH(2), TH(3), TH(4)]);
  render(Palette, OPEN);
  await later(Palette, OPEN);
  cmdJ();
  let tree = await later(Palette, OPEN);
  press(byTestId(tree, "ask-row-thread"));
  tree = await later(Palette, OPEN);
  assert.equal(textOf(byTestId(tree, "ask-say")), "The answer to Question 1.", "a conversation is open");
  cmdJ();
  tree = await later(Palette, OPEN);
  assert.equal(all(tree, (n) => n.props?.["data-testid"] === "ask-row-thread").length, 4, "every conversation");
  press(byClass(tree, "ask-row-del")[1]);
  tree = await later(Palette, OPEN);
  assert.deepEqual(calls.deleted, [], "REGRESSION: the × deleted at once");
  assert.ok(textOf(byTestId(tree, "ask-delete-confirm")).includes("Question 2"));
  press(byTestId(tree, "ask-delete-yes"));
  await later(Palette, OPEN);
  assert.deepEqual(calls.deleted, [TH(2).id]);
  await closes();
});

test("Earlier finds a conversation by the words typed and Enter opens it; with none, it says there are none", async () => {
  ask([]);
  render(Palette, OPEN);
  await later(Palette, OPEN);
  cmdJ();
  let tree = await later(Palette, OPEN);
  assert.equal(textOf(byClass(tree, "ask-rows-empty")[0]), "No earlier conversations yet.");
  await closes();

  const calls = ask([TH(1), TH(2), TH(3)]);
  render(Palette, OPEN);
  await later(Palette, OPEN);
  cmdJ();
  tree = await later(Palette, OPEN);
  typed(tree, "question 3");
  tree = await later(Palette, OPEN);
  assert.deepEqual(
    byClass(tree, "ask-row-label").map(textOf),
    ["Question 3"],
    "only the conversation whose question has the words",
  );
  keyed(tree, "Enter");
  tree = await later(Palette, OPEN);
  assert.deepEqual(calls.opened, [TH(3).id], "Enter opens it; the words are not asked");
  assert.deepEqual(calls.sent, []);
  assert.equal(textOf(byTestId(tree, "ask-say")), "The answer to Question 3.");
  await closes();
});

/* ------------------------------ N18 ------------------------------ */

test("a row of every kind an answer names draws its kind's mark, from the one map the Line's scope reads too: a run is marked as the broadcast it is (PR 4.2)", () => {
  const { AskAnswer, askKindGlyph } = AskAnswerKit;
  const marks = {
    thread: "chat",
    conversation: "chat",
    call: "phone",
    person: "users",
    page: "arrow-right",
    lead: "star",
    search: "search",
    deal: "deal",
    list: "filter",
    broadcast: "wave",
    playbook: "bolt",
    template: "content",
    mailbox: "mail",
    visit: "calendar",
    review: "star",
  };
  assert.deepEqual(Object.keys(marks), [...ASK_CITATION_KINDS], "every kind a citation names");
  const answer = {
    v: 2,
    form: "structured",
    say: { headline: "Everything, once.", detail: "" },
    show: {
      figures: [],
      items: ASK_CITATION_KINDS.map((kind, i) => ({
        title: kind,
        meta: "",
        line: "",
        source: { kind, id: `r${i}`, label: kind, to: `somewhere/${i}`, door: true },
      })),
      breakdown: null,
    },
    do: { open: null, next: [] },
    language: "en",
  };
  const tree = render(AskAnswer, { answer, cardOpen: {}, cards: [], t: {}, onNav() {}, onFollow() {} });
  assert.deepEqual(
    all(tree, (n) => n.props?.["data-testid"] === "ask-item-mark").map((m) => find(m, isIcon).props.name),
    Object.values(marks),
    "each row its kind's mark",
  );
  // An ad is cited as the page it is on until the Ads read lands (decision 0049), so it wears the page's mark.
  for (const k of ASK_SCOPE_KINDS)
    assert.equal(
      askKindGlyph(k),
      k === "run"
        ? marks.broadcast
        : k === "ad"
          ? marks.page
          : k === "file"
            ? "image"
            : k === "sequence"
              ? marks.playbook
              : k === "message"
                ? marks.template
                : marks[k],
      `a scope's ${k} is marked as its row`,
    );
  assert.equal(askKindGlyph("something new"), "chat", "a kind the map does not know is a chat");
});

test("a person's note and a person's details (PR 4.6) are drawn by their title and the summary that says who reads it or what changes, no kind's word or mark beside it (D1 of the answers canvas)", () => {
  const { AskCard } = AskAnswerKit;
  const cards = [
    {
      id: "p1",
      kind: "note",
      needs: "operator",
      title: "Note on Rosa",
      summary: "“Prefers mornings.” · AI reads it before it answers Rosa",
      payload: { contact_id: "c1", body: "Prefers mornings.", team_only: false, who: "Rosa" },
      undo: "Delete it",
    },
    {
      id: "p2",
      kind: "person_details",
      needs: "operator",
      title: "Details for Rosa",
      summary: "Name: Rosa → Rosa Díaz · Email: no address → rosa@example.com",
      payload: { contact_id: "c1", who: "Rosa", name: "Rosa Díaz", email: "rosa@example.com", previous: {} },
      undo: "Set it back",
    },
  ];
  for (const lang of ["en", "es"])
    cards.forEach((p) => {
      const tree = render(AskCard, { p, t: askText(lang), onNav() {} });
      assert.equal(byTestId(tree, "ask-card").props["data-kind"], p.kind);
      const head = byClass(tree, "ask-card-head")[0];
      assert.ok(textOf(head).startsWith(p.title), `${p.kind}: its title`);
      const said = byClass(tree, "ask-card-summary")[0] ?? byClass(tree, "ask-card-line")[0];
      assert.equal(textOf(said), p.summary, `${p.kind}: its summary`);
    });
});

test("a list and a playbook's run waiting for a person (PR 4.7) are drawn by their title and the summary that says its rule and who it holds, or who the run reaches and when it goes, no kind's word or mark beside it (D1 of the answers canvas)", () => {
  const { AskCard, askKindGlyph } = AskAnswerKit;
  const RUN = "88888888-8888-4888-8888-888888888881";
  const cards = [
    {
      id: "p1",
      kind: "list",
      needs: "operator",
      title: "List: Lapsed regulars",
      summary:
        "Last visit more than 60 days ago — 4 people on it today, and it keeps itself current. Left out: regulars",
      payload: {
        name: "Lapsed regulars",
        rule: { v: 2, all: [{ field: "last_visit", op: "more_than", days: 60 }] },
        cannot: "regulars",
        count: 4,
      },
      undo: "Delete it",
    },
    {
      id: "p2",
      kind: "run",
      needs: "operator",
      title: "Approve the run: Win-back · 2026-09-20",
      summary: "3 people · goes the moment you approve it",
      payload: { broadcast_id: RUN, verb: "approve", name: "Win-back · 2026-09-20", people: 3, timezone: "UTC" },
      undo: "Cancel it, if it has not finished",
    },
  ];
  // The mark a list's or a run's row carries in an answer (a run is the Broadcasts row a citation calls a broadcast).
  assert.deepEqual([askKindGlyph("list"), askKindGlyph("broadcast")], ["filter", "wave"]);
  for (const lang of ["en", "es"])
    cards.forEach((p) => {
      const tree = render(AskCard, { p, t: askText(lang), onNav() {} });
      assert.equal(byTestId(tree, "ask-card").props["data-kind"], p.kind);
      const head = byClass(tree, "ask-card-head")[0];
      assert.ok(textOf(head).startsWith(p.title), `${p.kind}: its title`);
      const said = byClass(tree, "ask-card-summary")[0] ?? byClass(tree, "ask-card-line")[0];
      assert.equal(textOf(said), p.summary, `${p.kind}: its summary`);
    });
});

test("a message the card writes (the marketing manager, §5.2) is drawn whole: each version under its channel's word as the person reached on it reads it, and when each goes and who it reaches under them", () => {
  const { AskCard } = AskAnswerKit;
  const said = [
    {
      channel: "whatsapp",
      label: "On WhatsApp",
      words: "Hi Dani, everything is 10% off this month. Reply STOP to opt out.",
    },
    {
      channel: "email",
      label: "By email",
      words: "“This month at the business”\nHi Dani,\n\nEverything is 10% off this month.",
    },
  ];
  const follows =
    "Ready by email once approved; its WhatsApp version once WhatsApp has reviewed it (usually minutes, sometimes a day) · On WhatsApp: only people with a recorded yes to offers and a phone number.";
  const p = {
    id: "p1",
    kind: "message",
    needs: "operator",
    title: "New message: october_offer, in English",
    summary: `On WhatsApp: Hi Dani, … · By email: “This month at the business” — Hi Dani, … · ${follows}`,
    payload: {
      name: "october_offer",
      language: "en_US",
      category: "marketing",
      versions: {},
      slots: [],
      said,
      follows,
    },
    undo: "Delete its email version",
  };
  for (const lang of ["en", "es"]) {
    const tree = render(AskCard, { p, t: askText(lang), onNav() {} });
    assert.equal(byTestId(tree, "ask-card").props["data-kind"], "message");
    const head = byClass(tree, "ask-card-head")[0];
    assert.ok(textOf(head).startsWith(p.title));
    // Every version whole, under its channel's word, in the card's said block; the summary's quotes are the model's.
    const versions = byTestId(tree, "ask-card-versions");
    assert.ok(versions.props.className.split(" ").includes("ask-card-said"));
    const rows = byClass(versions, "ask-card-summary");
    assert.deepEqual(
      rows.map((r) => [textOf(byClass(r, "ask-card-channel")[0]), textOf(r)]),
      said.map((s) => [s.label, `${s.label}\n${s.words}`]),
    );
    assert.equal(
      byClass(tree, "ask-card-summary").some((n) => textOf(n) === p.summary),
      false,
      "the versions are drawn whole, never quoted twice",
    );
    assert.equal(textOf(byClass(tree, "ask-card-foot")[0]), follows, "when each goes and who it reaches, under them");
  }
  // A message card from before its versions were carried draws its summary, as every card does.
  const bare = render(AskCard, { p: { ...p, payload: {} }, t: askText("en"), onNav() {} });
  assert.equal(textOf(byClass(bare, "ask-card-line")[0]), p.summary);
});

test("REGRESSION (N18): every page a real workspace ships is a jump away -- 'calendar' offered only to ask about it", async () => {
  ask();
  render(Palette, OPEN);
  let tree = await later(Palette, OPEN);
  typed(tree, "calendar");
  tree = await later(Palette, OPEN);
  const jumps = all(tree, (n) => n.props?.["data-testid"] === "ask-row-jump").map(textOf);
  assert.ok(
    jumps.some((j) => j.startsWith("Calendar")),
    `REGRESSION: ${jumps.join(" | ") || "no jump"}`,
  );

  const read = emptyReadSet();
  const none = { kind: "none", id: "", label: "" };
  const opens = (to) => {
    const r = normalizeAnswer(
      {
        say: { headline: "It's there.", detail: "" },
        show: { figures: [], items: [], breakdown: { label: "", total: 0, parts: [], source: none } },
        do: { open: { source: { kind: "page", id: to, label: to }, label: "", now: false }, next: [] },
        language: "en",
      },
      read,
      "en",
    );
    return r.ok && r.answer.do.open ? r.answer.do.open.to : null;
  };
  for (const [words, to] of [
    ["calendar", "calendar"],
    ["lists", "clients"],
    ["playbooks", "campaigns/sequences"], // the Playbooks list is Sequences (contracts retiredRouteOf); the old name still finds it
    ["campaigns", "campaigns/sequences"],
    ["sequences", "campaigns/sequences"],
    // Sent's list went to each sequence's History (decision 0060, D3): its names find Sequences.
    ["sent", "campaigns/sequences"],
    ["broadcasts", "campaigns/sequences"],
    ["messages", "campaigns/sequences"],
    ["setup", "start"],
    ["billing", "admin/billing"],
    ["activity", "admin/activity"],
    ["profile", "admin/profile"],
  ]) {
    assert.ok(
      askJump(words, ASK_PAGES).some((j) => j.to === to),
      `"${words}" jumps to ${to}`,
    );
    assert.ok(ASK_PAGE_ROUTES.includes(to), `${to} is a page an answer may name`);
    assert.equal(opens(to), to, `and an answer may open ${to}`);
  }
  assert.deepEqual(
    groundCitations([{ kind: "page", id: "calendar", label: "Calendar" }], read).kept.map((c) => c.id),
    ["calendar"],
    "a citation of the Calendar is kept",
  );
  await closes();
});

test("on Leads the Line is the finder: describe the businesses, Find businesses with the day's chip and the consent line; the words go as typed on the leads surface; the card is read, a change said to AI, and its one press opens the search once approved", async () => {
  const hash = globalThis.window.location.hash;
  const chanly = heldDoors();
  const went = [];
  globalThis.window.location.hash = "#/clients/leads";
  setSurfaceValue("leads", { suggestions: { items: [{ words: "100 nail salons in Queens, NY" }] }, searches: [] });
  bridgeHolds({ doors: { navigate: (to) => went.push(to) } });
  try {
    ask([]);
    const askedWith = [];
    const committed = [];
    Object.assign(askCalls(), {
      commit: async (p) => {
        committed.push(p.kind);
        return { ok: true, receipt: "Finding 200 personal trainers. Leads shows it.", undo: { search_id: "s1" } };
      },
      outcome: async () => true,
      undoOpen: () => false,
      // The reply editor is for replies: a search's "Change what I asked" never reaches it.
      editReply: () => assert.fail("REGRESSION: a lead search's Change what I asked opened the reply editor"),
      send: async (input, on) => {
        askedWith.push(input);
        on({ t: "thread", id: TH(9).id, title: input.text });
        on({ t: "final", message: { ...said("m-lead", "Here is the plan."), proposals: [LEAD_CARD] } });
      },
    });
    render(Palette, OPEN);
    let tree = await later(Palette, OPEN);
    assert.equal(inputOf(tree).props.placeholder, "Which businesses to find?", "the field asks for businesses");
    assert.deepEqual(
      byClass(tree, "ask-rows-label").map(textOf),
      ["Find businesses"],
      "the page's section is Find businesses, never Ask about Leads",
    );
    assert.equal(
      textOf(byTestId(tree, "ask-row-sug")),
      "100 nail salons in Queens, NY",
      "the first chip is the day's suggestion",
    );
    assert.equal(
      textOf(byTestId(tree, "ask-rows-note")),
      "You can email and call leads. Texts and offers wait for their yes.",
      "the consent rule stands under the chips",
    );
    typed(tree, "50 dentists in Austin, TX");
    tree = await later(Palette, OPEN);
    keyed(tree, "Enter");
    tree = await later(Palette, OPEN);
    assert.equal(askedWith.length, 1, "one turn");
    assert.equal(askedWith[0].text, "50 dentists in Austin, TX", "the words go as typed, with no prefix");
    assert.equal(askedWith[0].surface, "leads", "on the Leads surface");
    assert.equal(askedWith[0].scope, null, "and with no scope");
    const card = byTestId(tree, "ask-card");
    assert.equal(card.props["data-kind"], "lead_search");
    // The card is read (Ruben, 23 Oct 2026: a change is said to Ask, which makes the card again): what it finds as rows
    // and one press, never the finder's pickers, and no "Change what I asked", since the field under it is Ask's own.
    assert.ok(byTestId(card, "ask-card-sheet"), "what it finds, as rows");
    assert.equal(byTestId(tree, "lead-plan"), null, "no plan card with pickers");
    assert.equal(byTestId(tree, "plan-back"), null, "no way back to the field: it is the field under the card");
    const find = byTestId(card, "ask-card-approve");
    assert.match(textOf(find), /^Find \d+ leads$/, "one press, for what the month has room for");
    // Its press commits, the receipt stays on the card, and the Line goes to the search the commit made.
    press(find);
    tree = await later(Palette, OPEN);
    assert.deepEqual(committed, ["lead_search"], "committed through AI's door");
    assert.ok(
      textOf(byClass(tree, "ask-card-receipt")[0]).includes("Leads shows it"),
      "the receipt stays in the conversation",
    );
    assert.deepEqual(went, ["clients/leads:s-s1"], "the Line went to the new search");
    assert.equal(went[0], leadsRoute({ searchId: "s1", list: "all", cls: null }), "which is contracts' route for it");
  } finally {
    await closes();
    globalThis.window.location.hash = hash;
    bridgeHolds({ doors: chanly });
    setSurfaceValue("leads", undefined);
  }
});

test("on Campaigns the field asks what should go out (the moment spec, A3; one line on a phone, Ruben 17 Nov 2026)", async () => {
  const hash = globalThis.window.location.hash;
  globalThis.window.location.hash = "#/campaigns";
  try {
    ask([]);
    render(Palette, OPEN);
    const tree = await later(Palette, OPEN);
    assert.equal(inputOf(tree).props.placeholder, "What should go out?");
  } finally {
    await closes();
    globalThis.window.location.hash = hash;
  }
});

test("a campaign card opens in the composer on its moment before Approve, and says so (the moment spec, A7)", () => {
  // The card's Open is contracts' cardOpenRoute, which reads the playbook spec's own `open`, through the bridge.
  ask([]);
  const { AskCard } = AskAnswerKit;
  const t = askText("en");
  const card = {
    id: "p1",
    kind: "playbook",
    needs: "operator",
    title: "Campaign: Win-back",
    summary: "Win-back — nothing heard in 30 days",
    payload: { trigger: "quiet_30" },
    undo: "Delete it — nothing will run",
  };
  const went = [];
  const tree = render(AskCard, { p: card, messageId: "x", t, onNav: (to) => went.push(to) });
  const open = find(tree, (n) => n.type === "button" && textOf(n) === "Open in New campaign");
  assert.ok(open, "the card's Open, in New campaign's words");
  open.props.onClick();
  assert.deepEqual(went, ["campaigns/sequences/new:moment:quiet_30"]);
  assert.equal(askText("es").openNew, "Abrir en Nueva secuencia");
  assert.equal(askText("es").describeCampaigns, "¿Qué debe salir?");
});

test("a campaign card says campaign, never playbook (the moment spec, D19): the question before its undo deletes it, in English and Spanish", () => {
  const { AskCard } = AskAnswerKit;
  const A = askCalls();
  const card = {
    id: "p1",
    kind: "playbook",
    needs: "operator",
    title: "Campaign: Win-back",
    summary: "Win-back — nothing heard in 30 days",
    payload: { trigger: "quiet_30" },
    undo: "Delete it — nothing will run",
  };
  holdAsk({ ...A, undoOpen: () => true });
  try {
    const made = {
      ...card,
      outcome: {
        state: "done",
        receipt: "Campaign “Win-back” is running",
        atMs: Date.now(),
        undo: { playbook_id: "pb1", decision_id: "d1" },
      },
    };
    // The question before the delete, in the Line's language (15 Oct: it was English on a Spanish Line).
    for (const [lang, said, yes] of [
      ["en", "It stops for good.", "Yes, delete it"],
      ["es", "Se detiene para siempre.", "Sí, borrarla"],
    ]) {
      const props = { p: made, messageId: "x", t: askText(lang), onNav() {} };
      let tree = render(AskCard, props);
      press(byClass(tree, "ask-card-undo")[0]);
      tree = settle(AskCard, props);
      const asked = textOf(tree);
      assert.ok(asked.includes(said) && asked.includes(yes), `${lang}: ${asked}`);
      assert.ok(!/playbook/i.test(asked), `no playbook in what a person reads: ${asked}`);
    }
  } finally {
    holdAsk(A);
  }
});

test("on Leads a card that answers a search commits through AI's door with no undo, and the Line goes to the search's question", async () => {
  const hash = globalThis.window.location.hash;
  const chanly = heldDoors();
  const went = [];
  globalThis.window.location.hash = "#/clients/leads";
  setSurfaceValue("leads", { suggestions: { items: [] }, searches: [] });
  bridgeHolds({ doors: { navigate: (to) => went.push(to) } });
  const answering = {
    ...LEAD_CARD,
    id: "p2",
    summary: `Answers “Most of the first 25 are chain gyms. Include them?”: ${planSentence(LEAD_PLAN)}`,
    payload: {
      ...LEAD_CARD.payload,
      plan: { ...LEAD_PLAN, version: 2 },
      amends: {
        search_id: "s1",
        name: "personal trainers",
        question: "Most of the first 25 are chain gyms. Include them?",
      },
    },
    undo: null,
  };
  try {
    ask([]);
    const committed = [];
    Object.assign(askCalls(), {
      commit: async (p) => {
        committed.push(p.payload.amends);
        return {
          ok: true,
          receipt: "Answered. personal trainers carries on with your answer; Leads shows it.",
          undo: null,
        };
      },
      outcome: async () => true,
      undoOpen: () => false,
      send: async (input, on) => {
        on({ t: "thread", id: TH(9).id, title: input.text });
        on({ t: "final", message: { ...said("m-lead", "Here is the plan."), proposals: [answering] } });
      },
    });
    render(Palette, OPEN);
    let tree = await later(Palette, OPEN);
    typed(tree, "include them");
    tree = await later(Palette, OPEN);
    keyed(tree, "Enter");
    tree = await later(Palette, OPEN);
    assert.equal(byTestId(tree, "ask-card").props["data-kind"], "lead_search");
    // An answer to a search's question is drawn as any card is: what it changes, and Approve.
    press(byTestId(tree, "ask-card-approve"));
    tree = await later(Palette, OPEN);
    assert.deepEqual(committed, [answering.payload.amends], "the card commits as it came, its amends intact");
    assert.ok(
      textOf(byClass(tree, "ask-card-receipt")[0]).includes("Answered."),
      "the receipt stays in the conversation",
    );
    assert.deepEqual(
      went,
      [leadQuestionRoute("s1")],
      "the Line went to the search that asked, on the pile it asked about",
    );
  } finally {
    await closes();
    globalThis.window.location.hash = hash;
    bridgeHolds({ doors: chanly });
    setSurfaceValue("leads", undefined);
  }
});

test("on Today the Line is as it was: Ask anything, no preset questions about the page, and no consent line", async () => {
  ask([]);
  render(Palette, OPEN);
  const tree = await later(Palette, OPEN);
  assert.equal(inputOf(tree).props.placeholder, "Ask anything");
  assert.ok(!textOf(tree).includes("Ask about"), "Today's questions come from a table, so they are no chip");
  assert.equal(byTestId(tree, "ask-rows-note"), null, "the consent rule is Leads' alone");
  await closes();
});

/* ------------------------------ the takeover composes ------------------------------ */

test("on a phone the field in use composes: the rows go, their fold kept closed, the three keep their size with the standing pills under them and listen, a key heard lifts them, and letting go opens the fold again", async () => {
  const ph = phoneWindow();
  const moods = [];
  let heard = 0;
  const { mood } = MASCOT;
  const had = { set: mood.set, hear: mood.hear };
  mood.set = (s) => moods.push(s);
  mood.hear = () => heard++;
  const props = { open: true, onClose() {} };
  const pills = (tree) => all(tree, (n) => n.props?.["data-testid"] === "ask-pill").map(textOf);
  const fold = (tree) => byTestId(tree, "ask-rows-fold").props.className;
  try {
    bridgeHolds({ values: { today: askQueue() } });
    ask([]);
    render(Palette, props);
    let tree = await later(Palette, props);
    assert.ok(
      find(tree, (n) => n.props?.id === "ask-rows"),
      "the home stands",
    );
    assert.equal(fold(tree), "ask-rows-fold");
    assert.equal(byTestId(tree, "ask-hero").props.className, "ask-hero");
    // At rest Right now's sentence says the counts and Brief me stands under it; no pill says them again.
    assert.deepEqual(pills(byTestId(tree, "ask-hero")), []);
    assert.deepEqual(pills(byTestId(tree, "ask-row-now")), []);
    assert.equal(textOf(byTestId(tree, "ask-row-brief")), "Brief me");
    inputOf(tree).props.onFocus();
    tree = await later(Palette, props);
    assert.equal(byTestId(tree, "ask-hero").props.className, "ask-hero", "the three keep their size");
    assert.ok(byClass(tree, "composing").length, "the middle composes, still centred");
    assert.equal(
      find(tree, (n) => n.props?.id === "ask-rows"),
      null,
      "the rows are gone at once",
    );
    assert.equal(fold(tree), "ask-rows-fold gone", "their fold kept, closed");
    assert.deepEqual(
      pills(byTestId(tree, "ask-hero")),
      ["1 needs you", "1 search waiting"],
      "the sentence folds away with the rows, so the pills under the three say its counts",
    );
    assert.equal(moods.at(-1), "listening", "and the three listen");
    assert.equal(inputOf(tree).props["aria-expanded"], false);
    typed(tree, "in");
    tree = await later(Palette, props);
    assert.ok(heard >= 1, "a key heard lifts the three");
    assert.equal(
      find(tree, (n) => n.props?.id === "ask-rows"),
      null,
      "the words' own rows wait for the keyboard to go",
    );
    assert.equal(fold(tree), "ask-rows-fold gone");
    assert.equal(inputOf(tree).props["aria-controls"], undefined);
    assert.deepEqual(
      pills(byTestId(tree, "ask-hero")),
      ["1 needs you", "1 search waiting"],
      "the pills stay while typing",
    );
    inputOf(tree).props.onBlur();
    tree = await later(Palette, props);
    assert.equal(
      byTestId(tree, "ask-hero").props.className,
      "ask-hero small",
      "let go with words in it, the three stand small, so the words' rows sit under them and not a screen below",
    );
    assert.ok(
      find(tree, (n) => n.props?.id === "ask-rows"),
      "and the rows are back, the words' own now",
    );
    assert.equal(fold(tree), "ask-rows-fold", "their fold open");
    assert.deepEqual(pills(tree), [], "the words' rows are the focus with the keyboard down");
    assert.equal(moods.at(-1), "idle");
    typed(tree, "");
    tree = await later(Palette, props);
    assert.deepEqual(
      pills(byTestId(tree, "ask-hero")),
      [],
      "the line emptied and the keyboard gone, the home, its sentence saying the counts",
    );
    await closes();
  } finally {
    bridgeHolds({ values: { today: undefined } });
    ph.restore();
    Object.assign(mood, had);
  }
});

/* ------------------------------ the phone's ✦: the disc, and the dot it does not draw ------------------------------ */

test("the disc reads no usage and draws no dot: nothing in the app sets a standing, so a standing the stub once set is not a fact", () => {
  const Disc = (props) => AskDisc(props);
  const drawn = () => byTestId(render(Disc, { testId: "b" }), "b");
  try {
    delete globalThis.window.__USAGE;
    const disc = drawn();
    assert.equal(disc.props.className, "ask-disc");
    assert.equal(disc.props["data-usage"], undefined, "no usage surface yet: no dot");
    assert.equal(disc.props["data-needs"], undefined, "what needs you is the three's colour, not the disc's dot");
    // The standalone mockup's stub set this and no part of the app did: the disc no longer looks.
    globalThis.window.__USAGE = { standing: "over", share: 100 };
    assert.equal(drawn().props["data-usage"], undefined, "a value nothing real sets is not read");
  } finally {
    delete globalThis.window.__USAGE;
  }
});

/* ------------------------------ the name a page went by ------------------------------ */

test("a page is found by the name it goes by AND by the one it used to: 'templates' and 'messages' land on Campaigns", () => {
  // Messages folded into Campaigns (Campaigns, one tab, 17 Nov 2026): each message is inside the campaign that sends it, so
  // the names Messages went by (the Library, decision 0060 D4, and before that Templates) find Campaigns. Sent was
  // Broadcasts, and its list went to each sequence's History (D3): each name still finds where it went.
  const byName = askJump("messages", ASK_PAGES);
  assert.equal(byName[0]?.to, "campaigns/sequences", "Messages' name finds Campaigns");
  assert.equal(byName[0]?.label, "Campaigns");
  assert.equal(askJump("templates", ASK_PAGES)[0]?.to, "campaigns/sequences", "the name it went by");
  assert.ok(
    !askJump("library", ASK_PAGES).some((j) => j.to === "campaigns/sequences"),
    "Content's Library keeps its name",
  );
  for (const old of ["sent", "broadcasts"])
    assert.equal(askJump(old, ASK_PAGES)[0]?.to, "campaigns/sequences", `${old}: the name Sent's list went by`);
  // The label always wins: a word listed under `also` never outranks a page's own name.
  assert.equal(askJump("lists", ASK_PAGES)[0]?.label, "Lists");
  assert.ok(
    askJump("segments", ASK_PAGES).some((j) => j.to === "clients"),
    "the lists answer to the word they were filed under too",
  );
  // And an alias is not a wildcard: a word nothing answers to still finds nothing.
  assert.deepEqual(askJump("zzq", ASK_PAGES), []);
});

test("the scope per turn (the Phase 5 plan, D9): a question goes with the scope the chip shows, else its conversation's own, which then holds it; the chip's × sends none next; a new conversation takes the chip's or none; and no send moves the chip, a resumed twin's included", async () => {
  const hash = globalThis.window.location.hash;
  const ROW1 = "aaaaaaaa-aaaa-4aaa-8aaa-0000000000b1";
  const ROW2 = "aaaaaaaa-aaaa-4aaa-8aaa-0000000000b2";
  const row = (id) => ({ kind: "thread", id, label: "this conversation" });
  // An older conversation whose first question is asked again (the twin), kept with a scope of its own.
  const TWIN = { ...TH(1), title: "Where did we leave it?", scope: { kind: "thread", id: ROW1, label: "Rosa" } };
  const calls = ask([TWIN]);
  askCalls().send = async (input, on) => {
    calls.inputs.push(input);
    on({ t: "thread", id: TH(5).id, title: input.text });
    on({ t: "final", message: said(`m-${calls.inputs.length}`, `Answer ${calls.inputs.length}.`) });
  };
  /** The Line closed and opened again over a page, as a person does: the chip is that page's scope. */
  const over = async (route) => {
    await closes();
    globalThis.window.location.hash = route;
    return opens();
  };
  const asked = async (tree, words) => {
    typed(tree, words);
    tree = await later(Palette, OPEN);
    keyed(tree, "Enter");
    return later(Palette, OPEN);
  };
  // The name the chip says, after its "About" (draw.tsx: its picture or mark, About, the name, and its ×).
  const chip = (tree) => {
    const scope = byTestId(tree, "ask-scope");
    return scope ? textOf(find(scope, (n) => n.props?.className === "ask-scope-name")) : null;
  };
  const sent = () => calls.inputs.at(-1).scope;
  try {
    render(Palette, CLOSED);
    let tree = await asked(await over(`#/inbox/th-${ROW1}`), "What did they ask for?");
    assert.deepEqual(sent(), row(ROW1), "(d) a new conversation takes the chip's scope");
    tree = await asked(await over(`#/inbox/th-${ROW2}`), "And this one?");
    assert.deepEqual(
      sent(),
      row(ROW2),
      "(b) REGRESSION: a follow-up asked over another row went with the conversation's first scope",
    );
    tree = await asked(await over("#/today"), "And both of them?");
    assert.deepEqual(sent(), row(ROW2), "(c) no chip: the conversation's own, which its last turn gave it");
    assert.equal(chip(tree), null, "and the send moved no chip: Today has none");
    tree = await over(`#/inbox/th-${ROW1}`);
    assert.equal(chip(tree), "this conversation", "the chip is the row's again");
    press(find(byTestId(tree, "ask-scope"), (n) => n.type === "button"));
    tree = await later(Palette, OPEN);
    assert.equal(chip(tree), null, "the × empties the chip");
    tree = await asked(tree, "Anything else?");
    assert.equal(sent(), null, "(a) a cleared chip sends none, said as null, so the server clears the conversation's");
    tree = await asked(await over("#/today"), "And now?");
    assert.equal(sent(), null, "(c) and the conversation holds none after it");
    press(byTestId(tree, "ask-clear-head"));
    tree = await asked(await later(Palette, OPEN), "What is new?");
    assert.equal(sent(), null, "(d) a new conversation with no chip: none");
    // The twin resumed over another row: asked with the chip it was typed under, and the chip stays that one.
    press(byTestId(tree, "ask-clear-head"));
    tree = await asked(await over(`#/inbox/th-${ROW2}`), TWIN.title);
    assert.deepEqual([calls.opened.at(-1), sent()], [TWIN.id, row(ROW2)], "the twin resumed, with the chip's scope");
    assert.equal(
      chip(tree),
      "this conversation",
      "REGRESSION: the twin's stored scope took the chip the question went with",
    );
    tree = await asked(tree, "And after that?");
    assert.deepEqual(sent(), row(ROW2), "so the next question goes with it too");
    assert.deepEqual(
      calls.inputs.map((i) => i.text),
      [
        "What did they ask for?",
        "And this one?",
        "And both of them?",
        "Anything else?",
        "And now?",
        "What is new?",
        TWIN.title,
        "And after that?",
      ],
    );
    await closes();
  } finally {
    globalThis.window.location.hash = hash;
  }
});

test("a question the shell seeds as it opens the Line goes with the chip that opening shows, never the one the last opening showed: over a page with no row, its conversation's own; over a row, that row", async () => {
  const hash = globalThis.window.location.hash;
  const calls = ask([]);
  askCalls().send = async (input, on) => {
    calls.inputs.push(input);
    on({ t: "thread", id: TH(5).id, title: input.text });
    on({ t: "final", message: said(`m-${calls.inputs.length}`, `Answer ${calls.inputs.length}.`) });
  };
  const ROW1 = "aaaaaaaa-aaaa-4aaa-8aaa-0000000000c1";
  const ROW2 = "aaaaaaaa-aaaa-4aaa-8aaa-0000000000c2";
  const row = (id) => ({ kind: "thread", id, label: "this conversation" });
  const over = async (route) => {
    await closes();
    globalThis.window.location.hash = route;
    return opens();
  };
  /** The shell opening the Line over a page and seeding a question in the same moment (askAbout({ prompt })). */
  const seeded = async (route, prompt) => {
    await closes();
    globalThis.window.location.hash = route;
    sent("ask:seed", { prompt });
    return opens();
  };
  // The name the chip says, after its "About" (draw.tsx: its picture or mark, About, the name, and its ×).
  const chip = (tree) => {
    const scope = byTestId(tree, "ask-scope");
    return scope ? textOf(find(scope, (n) => n.props?.className === "ask-scope-name")) : null;
  };
  const last = () => calls.inputs.at(-1);
  try {
    render(Palette, CLOSED);
    let tree = await over(`#/inbox/th-${ROW1}`);
    typed(tree, "What did they ask for?");
    tree = await later(Palette, OPEN);
    keyed(tree, "Enter");
    await later(Palette, OPEN);
    assert.deepEqual(last().scope, row(ROW1), "the conversation begins on the first row");
    // Opened over the second row and closed unasked: that opening's chip was the second row's; the conversation's is
    // still the first's. Then Today's "Ask why" (no row) opens the Line with its question.
    await over(`#/inbox/th-${ROW2}`);
    tree = await seeded("#/today", "Why did that one leak?");
    assert.deepEqual(
      [last().text, last().scope],
      ["Why did that one leak?", row(ROW1)],
      "REGRESSION: a question seeded over Today went with the chip the last opening showed, the second row's",
    );
    assert.equal(chip(tree), null, "Today opens with no chip");
    // Opened over the first row and closed unasked; then a question seeded over the second row's own page.
    await over(`#/inbox/th-${ROW1}`);
    tree = await seeded(`#/inbox/th-${ROW2}`, "And this one?");
    assert.deepEqual(
      [last().text, last().scope],
      ["And this one?", row(ROW2)],
      "a question seeded over a row goes with that row, never the chip before it",
    );
    assert.equal(chip(tree), "this conversation", "the chip the question went with");
    await closes();
  } finally {
    globalThis.window.location.hash = hash;
  }
});
