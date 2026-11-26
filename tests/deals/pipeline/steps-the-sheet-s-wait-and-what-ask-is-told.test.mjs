/**
 * A next step on the page, the sheet judging a wait by People's pace, and what the Pipeline tells Ask it draws.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { proposalMessage, pipelineOf, toPersonRowVM, stepDayOf, zoneDayKey } from "@chanlytics/contracts";
import { lineBox } from "../../shared/_line.mjs";
import {
  DAY,
  NOW,
  TZ,
  ZONE,
  all,
  byClass,
  byTestId,
  chipOf,
  click,
  deal,
  detailOf,
  draw,
  drawPeople,
  find,
  fixture,
  fresh,
  iso,
  lineParts,
  onPhone,
  peekOf,
  peopleNow,
  personRow,
  rowIds,
  rowNode,
  settled,
  textOf,
  tick,
  went,
  withHead,
} from "./_pipeline.mjs";
import { surfaceValue } from "../../shell/_bridge-holds.mjs";

test("their next step on the page: a column after Stage that sorts by its day, in the warn ink once it has come; the phone's card and the board's say it, and Steps due holds only theirs", async () => {
  const now = Date.now();
  const day = (d) => zoneDayKey(now + d * DAY, ZONE);
  const withStep = (id, d, over = {}) => ({
    step_id: `s-${id}`,
    step_body: over.body,
    step_due_on: day(d),
    step_for_user_id: null,
    step_deal_id: over.dealId ?? null,
  });
  const people = () =>
    peopleNow().map((r) =>
      r.id === "wes"
        ? { ...r, ...withStep("wes", -2, { body: "Send the revised quote" }) }
        : r.id === "nia"
          ? { ...r, ...withStep("nia", 5, { body: "Ask about the date", dealId: r.deal_id }) }
          : r,
    );
  const seen = await fresh({ people: people() });
  let tree = draw();
  const heads = all(tree, (n) => n.props?.className === "dtable-sort").map((n) => textOf(n).trim());
  const at = (w) => heads.findIndex((h) => h.startsWith(w));
  assert.ok(at("Next step") === at("Where it stands") + 1, `after where it stands: ${heads.join(", ")}`);
  const cell = (id) => byTestId(rowNode(tree, id), "pipe-next");
  const wesWhen = stepDayOf(day(-2), ZONE, now).words;
  assert.equal(textOf(byClass(cell("wes"), "pipe-next-words")), "Send the revised quote");
  assert.equal(textOf(byClass(cell("wes"), "pipe-next-when")), wesWhen);
  assert.equal(cell("wes").props["data-due"], "past", "the warn ink is the stylesheet's, keyed on this");
  assert.equal(cell("nia").props["data-due"], "ahead");
  assert.equal(textOf(cell("cat")), "", "no step: an empty cell, never a word for nothing");
  assert.equal(
    cell("wes").props["data-tip"],
    "Send the revised quote",
    "the words whole in its tip, where the cell cuts them",
  );
  // The heading sorts by the day, within each group, and the member's view keeps it.
  const nextHead = (t) => find(t, (n) => n.props?.className === "dtable-sort" && textOf(n).startsWith("Next step"));
  click(nextHead(tree));
  tree = draw();
  await tick();
  assert.deepEqual(
    [seen.viewSaves.at(-1).view.sortBy, seen.viewSaves.at(-1).view.sortDir],
    ["next", "asc"],
    "the soonest day first, as a visit is",
  );
  assert.deepEqual(rowIds(tree), ["hana", "sara", "wes", "nia", "cat"]);
  click(nextHead(tree));
  tree = draw();
  assert.deepEqual(rowIds(tree), ["hana", "sara", "nia", "wes", "cat"], "then the other way");
  await tick();
  assert.deepEqual([seen.viewSaves.at(-1).view.sortBy, seen.viewSaves.at(-1).view.sortDir], ["next", "desc"]);
  // Steps due in the rail: Wes alone, whose day has come; the view holds only him.
  const railRow = byTestId(tree, "pipeline-rail-row-steps");
  assert.ok(railRow, "the rail offers it while a step is due");
  click(railRow);
  assert.equal(went.at(-1), "clients/pipeline:v-steps");
  assert.deepEqual(rowIds(draw({ pipelineRoute: "pipeline:v-steps" })), ["wes"]);
  // The board's card: one quiet line under the chip.
  await fresh({ people: people() });
  click(byTestId(withHead(draw()), "pipeline-view-board"));
  const cards = all(byTestId(draw(), "pipeline-col-proposals"), (n) => n.props?.["data-testid"] === "pipeline-card");
  const wesCard = cards.find((c) => textOf(c).includes("Wes"));
  const line = byTestId(wesCard, "pipe-next");
  assert.deepEqual(
    [textOf(byClass(line, "pipe-next-words")), textOf(byClass(line, "pipe-next-when")), line.props["data-due"]],
    ["Send the revised quote", wesWhen, "past"],
  );
  const niaCard = cards.find((c) => textOf(c).includes("Nia"));
  assert.equal(byTestId(niaCard, "pipe-next").props["data-due"], "ahead", "a day ahead, in the quiet ink");
  const clients = all(byTestId(draw(), "pipeline-col-clients"), (n) => n.props?.["data-testid"] === "pipeline-card");
  assert.equal(
    byTestId(
      clients.find((c) => textOf(c).includes("Cat")),
      "pipe-next",
    ),
    null,
    "no step, no line",
  );
  // The phone's card: a fact after the time in stage.
  await onPhone(async () => {
    await fresh({ people: people() });
    const card = find(draw(), (n) => n.type === "tr" && n.props?.id === "person-wes");
    const step = byTestId(card, "pipe-next");
    assert.deepEqual(
      [textOf(byClass(step, "pipe-next-words")), textOf(byClass(step, "pipe-next-when")), step.props["data-due"]],
      ["Send the revised quote", wesWhen, "past"],
    );
    assert.equal(
      byTestId(
        find(card, (n) => n.props?.className === "pl-card-facts"),
        "pipe-next",
      ),
      null,
      "a line of its own, under the facts: it took the time in stage's room",
    );
  });
});

test("the peek hands the person's deals over once they are read: the step's fact until then, and its deal's card after", async () => {
  const now = Date.now();
  const seen = await fresh({
    people: peopleNow().map((r) =>
      r.id === "wes"
        ? {
            ...r,
            step_id: "s-wes",
            step_body: "Send the revised quote",
            step_due_on: zoneDayKey(now + 2 * DAY, ZONE),
            step_for_user_id: null,
            step_deal_id: "d-other",
          }
        : r,
    ),
  });
  // Read: a second deal of theirs, the one the step names.
  seen.person = (id) => {
    const d = detailOf(seen.rawOf(id));
    return { ...d, deals: [...d.deals, { ...d.deals[0], id: "d-other", service: "Extensions" }] };
  };
  let release = () => {};
  seen.hold = new Promise((r) => (release = r));
  let tree = draw();
  find(tree, (n) => n.type === "tr" && n.props?.id === "person-wes").props.onClick();
  tree = draw();
  assert.ok(byTestId(peekOf(tree), "pipeline-peek-step"), "not read yet: the row's deal is not the step's");
  release();
  await settled();
  tree = draw();
  assert.equal(
    byTestId(peekOf(tree), "pipeline-peek-step"),
    null,
    "read: the open deal it names has a card of its own",
  );
});

test("the page waits by the workspace's pace as People reads it: the line, the rail, a search in the view and a phone's own button", async () => {
  // Wes's proposal went eleven days ago, Nia's nine, and neither has heard back: past a week both wait; past an
  // eight-day pace and a fifth (ten days) only Wes does.
  await fresh({ dealPace: { median_days: 8, yeses: 6 } });
  let tree = draw();
  assert.deepEqual(surfaceValue("people").dealPace, {
    medianDays: 8,
    yeses: 6,
    waitDays: 10,
    longerThanUsual: true,
    words: "Usually 8 days to a yes",
  });
  assert.ok(lineParts(tree).includes("1 waiting longer than usual"), lineParts(tree).join(" · "));
  assert.match(textOf(byTestId(tree, "pipeline-rail-row-waiting")), /^Nothing back in 10 days/);
  tree = draw({ pipelineRoute: "pipeline:v-waiting" });
  assert.deepEqual(rowIds(tree), ["wes"], "the view holds those past the pace");
  // A search inside the view judges by the same pace: Nia is not waiting yet, Wes is.
  lineBox().props.onChange({ target: { value: "nia" } });
  assert.deepEqual(rowIds(draw({ pipelineRoute: "pipeline:v-waiting" })), []);
  (draw({ pipelineRoute: "pipeline:v-waiting" }), lineBox()).props.onChange({
    target: { value: "wes" },
  });
  assert.deepEqual(rowIds(draw({ pipelineRoute: "pipeline:v-waiting" })), ["wes"]);
  // On a phone the view's own button says it as the rail does.
  await onPhone(async () => {
    await fresh({ dealPace: { median_days: 8, yeses: 6 } });
    const lists = byTestId(
      byTestId(draw({ pipelineRoute: "pipeline:v-waiting" }), "pipeline-phone-bar"),
      "pipeline-phone-lists",
    );
    assert.equal(textOf(byClass(lists, "pp-bar-pick-words")), "Nothing back in 10 days");
  });
  // Under five yeses: a week, as before.
  await fresh({ dealPace: { median_days: 8, yeses: 4 } });
  assert.ok(lineParts(draw()).includes("2 waiting over a week"));
});

test("the sheet judges a wait by People's pace, as the rows beside it do, not by the person read's own", async () => {
  // People's pace is eight days (ten to wait); Nia's own read carries none, as one taken before a fifth yes would.
  const seen = await fresh({ dealPace: { median_days: 8, yeses: 6 } });
  const W = globalThis.window;
  // Nia's own read carries none: the wire says no pace beside their person.
  seen.person = (id) => ({ ...detailOf(seen.rawOf(id)), deal_pace: null });
  W.openDealSheet = () => true;
  let tree = draw();
  find(tree, (n) => n.type === "tr" && n.props?.id === "person-nia").props.onClick();
  draw();
  await settled();
  tree = draw();
  assert.ok(byTestId(peekOf(tree), "pipeline-peek-bar"), "the person page's own card, read");
  assert.equal(
    byTestId(peekOf(tree), "pipeline-peek-flag"),
    null,
    "nine days is within People's pace: nothing back is not said",
  );
  // Nor drawn in the owner's tone: the proposal step is the row's, by the one rule (proposalTone).
  const proposal = find(
    peekOf(tree),
    (n) => n.props?.["data-testid"] === "person-deal-step" && n.props["data-at"] === "current",
  );
  assert.equal(proposal.props["data-tone"], "info");
});

test("the sheet says the follow-up has them where their row does (0006): the day its run goes, and no nudge of its own", async () => {
  // People's facts: a follow-up running under ask that has reached nobody yet. Wes's proposal went eleven days ago
  // with its link, and nothing back: in its next run.
  const seen = await fresh({
    followUp: {
      run_hour: 10,
      last_run_for: null,
      asks: true,
      purpose: "conversational",
      had: {},
      queued: {},
      held: {},
      heard: {},
    },
  });
  const W = globalThis.window;
  assert.equal(
    surfaceValue("people").rows.find((r) => r.id === "wes").followUp?.kind,
    "will",
    "their row: in a run to come",
  );
  // Their thread carries the proposal that went, eleven days ago.
  seen.person = (id) => {
    const d = detailOf(seen.rawOf(id));
    const sent = {
      id: "m-sent",
      conversation_id: d.conversations[0].id,
      direction: "outbound",
      sender: "human",
      type: "text",
      body: proposalMessage(d.deals[0].proposal_url),
      media: null,
      meta: null,
      status: "sent",
      channel: "whatsapp",
      created_at: new Date(Date.now() - 11 * 86_400_000).toISOString(),
    };
    return { ...d, conversations: [{ ...d.conversations[0], messages: [sent] }] };
  };
  W.openDealSheet = () => true;
  let tree = draw();
  find(tree, (n) => n.type === "tr" && n.props?.id === "person-wes").props.onClick();
  draw();
  await settled();
  tree = draw();
  const peek = peekOf(tree);
  assert.match(textOf(byTestId(peek, "pipeline-peek-flag")), /^Follow-up to approve /);
  assert.equal(
    textOf(byTestId(peek, "pipeline-peek-bar-act")),
    "Mark as client",
    "the run follows up: no second nudge",
  );
  assert.equal(byTestId(peek, "pipeline-peek-ask"), null, "nor asks whether they said yes: the run is asking");
  const proposal = find(
    peek,
    (n) => n.props?.["data-testid"] === "person-deal-step" && n.props["data-at"] === "current",
  );
  assert.equal(proposal.props["data-tone"], "info", "in hand: not the owner's to chase");
});

test("a proposal waiting that the follow-up has in hand says the day its run goes, and whether it waits on the owner (0006); the rest keep Nothing back", () => {
  const with_ = (id, followUp) => fixture().map((r) => (r.id === id ? { ...r, followUp } : r));
  const said = (rows, id) => {
    const c = chipOf(pipelineOf(rows, NOW, TZ, null), id);
    return [c.words, c.tone];
  };
  const tomorrow = NOW + 86_400_000;
  assert.deepEqual(said(with_("wes", { kind: "will", at_ms: tomorrow, asks: false }), "wes"), [
    "Follow-up tomorrow",
    "info",
  ]);
  assert.deepEqual(said(with_("wes", { kind: "will", at_ms: tomorrow, asks: true }), "wes"), [
    "Follow-up to approve tomorrow",
    "info",
  ]);
  assert.deepEqual(
    said(with_("wes", { kind: "had", at_ms: NOW - 86_400_000 }), "wes"),
    ["Nothing back", "warn"],
    "its one nudge went: the owner's now",
  );
  assert.deepEqual(said(fixture(), "wes"), ["Nothing back", "warn"], "no follow-up running: as it was");
  // Past its day is said first, heard back since or not: the chip says who it waits on, as its steps do (proposalTone).
  const lapsedHeard = toPersonRowVM(
    personRow(NOW, "lia", "Lia", {
      ...deal(NOW, "proposed", { proposed: 5, validUntil: "2026-09-20" }),
      last_inbound_at: iso(NOW - DAY),
      last_message_at: iso(NOW - DAY),
    }),
    TZ,
    new Date(NOW),
  );
  assert.deepEqual(said([lapsedHeard], "lia"), ["Lapsed Sep 20", "warn"], "never Heard back in the info tone");
});

test("the Pipeline tells Ask what it draws (the Phase 2 plan, D3): the people of its open groups, in their order, and its view", async () => {
  await fresh();
  delete globalThis.window.__askOnScreen;
  draw();
  const s = globalThis.window.__askOnScreen;
  assert.equal(s.key, "pipeline");
  assert.deepEqual(s.ids, ["hana", "sara", "wes", "nia", "cat"], "the rows on screen; a folded group's are not");
  assert.equal(s.view, "all");
  assert.equal(s.labels.length, s.ids.length);
});

test("People tells Ask what it draws (the Phase 2 plan, D3): the rows of its table, in the table's order, and its view", async () => {
  await fresh();
  delete globalThis.window.__askOnScreen;
  const tree = drawPeople();
  const s = globalThis.window.__askOnScreen;
  assert.equal(s.key, "people");
  assert.ok(s.ids.length > 0);
  assert.deepEqual(s.ids, rowIds(tree).slice(0, 40), "the rows the table draws, in its order");
  assert.equal(s.view, "all");
});

test("the Pipeline tells Ask its rows in the member's order: sorted by name, the second one is the second drawn", async () => {
  await fresh();
  let tree = draw();
  const head = find(
    tree,
    (n) => n.props?.["data-testid"] === "pipe-sort-person" || n.props?.["data-sort"] === "person",
  );
  if (head && head.props.onClick) {
    head.props.onClick();
    tree = draw();
  }
  assert.deepEqual(
    globalThis.window.__askOnScreen.ids,
    rowIds(tree).slice(0, 40),
    "what the table draws, in its order",
  );
});
