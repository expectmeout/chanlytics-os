/**
 * A viewer's cards and a phone's list, the address carrying the view, the rail's groups, a view saved only once
 * touched, Columns, two open deals as two rows, a selection's bar, and the board's moves.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEAL_ACT_WORDS,
  DEAL_REFUSALS,
  dealMenuActs,
  dealNextAct,
  isPipelineView,
  parsePipelineRoute,
  pipelineOf,
  pipelineRail,
  pipelineRoute,
  pipelineViewLabel,
  PIPELINE_RAIL_SERVICES,
  toPersonRowVM,
} from "@chanlytics/contracts";
import { lineBox } from "../../shared/_line.mjs";
import {
  DAY,
  DataTable,
  Menu,
  NOW,
  TZ,
  TableColumnsMenu,
  all,
  byClass,
  byTestId,
  click,
  closePhoneSheet,
  deal,
  detailOf,
  draw,
  find,
  fixture,
  fresh,
  hasDeal,
  ids,
  iso,
  json,
  listOf,
  menuOptions,
  newOpen,
  ny,
  onPhone,
  opened,
  peekOf,
  peopleNow,
  personDetail,
  personRow,
  press,
  replaced,
  rowIds,
  rowNode,
  settled,
  textOf,
  tick,
  visit,
  visits,
  went,
  withHead,
} from "./_pipeline.mjs";
import { bridgeHolds, provided, surfaceValue } from "../../shell/_bridge-holds.mjs";
const { askOnScreen } = await import("../../../apps/dashboard/src/bridge/ask/on-screen.ts");

test("a viewer's cards do not drag, and a phone keeps the list whatever was chosen", async () => {
  await fresh();
  globalThis.localStorage.setItem("pipeline.view", "board");
  bridgeHolds({ who: { me: { role: "viewer" } } });
  try {
    let tree = draw();
    const wes = find(byTestId(tree, "pipeline-board"), (n) => n.props?.id === "person-wes");
    assert.equal(wes.props.draggable, undefined, "only an owner or an operator records, so only they drag");
    await onPhone(async () => {
      await fresh();
      globalThis.localStorage.setItem("pipeline.view", "board");
      tree = draw();
      assert.equal(byTestId(tree, "pipeline-board"), null);
      assert.equal(byTestId(withHead(tree), "pipeline-views"), null, "no switch on a phone");
      assert.ok(
        find(tree, (n) => n.type === "table"),
        "the list",
      );
    });
  } finally {
    bridgeHolds({ who: { me: { role: "owner" } } });
    globalThis.localStorage.removeItem("pipeline.view");
  }
});

test("the words in the box find a deal's service too", async () => {
  await fresh();
  draw();
  lineBox().props.onChange({ target: { value: "color corr" } });
  let tree = draw();
  assert.deepEqual(
    rowIds(tree),
    ["wes", "nia", "cat", "ed", "dan"],
    "everyone with a deal for it, the folded group opened",
  );
  lineBox().props.onChange({ target: { value: "" } });
  tree = draw();
  assert.deepEqual(rowIds(tree), ["hana", "sara", "wes", "nia", "cat"]);
});

/* ------------------------------------------------------------------------------ the Pipeline's own views */

test('"No link" is a fact at rest, said when nothing else is: a plain dot, never the warning', () => {
  const fresh = toPersonRowVM(
    personRow(NOW, "pip", "Pip", deal(NOW, "proposed", { proposed: 2, url: null })),
    TZ,
    new Date(NOW),
  );
  // The deal card's own words (DEAL_CARD_WORDS.noLink, canvas A), the same on a person's row and on the Pipeline.
  assert.deepEqual(pipelineOf([fresh], NOW, TZ, null).groups[0].rows[0].chip, { words: "No link yet", tone: "plain" });
  const dated = toPersonRowVM(
    personRow(NOW, "pia", "Pia", deal(NOW, "proposed", { proposed: 2, url: null, validUntil: "2026-09-30" })),
    TZ,
    new Date(NOW),
  );
  assert.deepEqual(
    pipelineOf([dated], NOW, TZ, null).groups[0].rows[0].chip,
    { words: "Valid until Sep 30", tone: "plain" },
    "its day says more than its missing link",
  );
});

test("the address carries the view and the person open over it, and a service keeps its separators out", () => {
  assert.equal(pipelineRoute({}), "clients/pipeline");
  assert.equal(pipelineRoute({ view: "all", peek: null }), "clients/pipeline");
  assert.equal(pipelineRoute({ view: "proposals" }), "clients/pipeline:v-proposals");
  assert.equal(pipelineRoute({ view: "waiting", peek: "wes" }), "clients/pipeline:v-waiting:p-wes");
  const svc = pipelineRoute({ view: "svc:Hair: color / cut", peek: "5b3c1a2e-0000-4000-8000-000000000001" });
  assert.equal(svc, "clients/pipeline:v-s.Hair%3A%20color%20%2F%20cut:p-5b3c1a2e-0000-4000-8000-000000000001");
  assert.deepEqual(parsePipelineRoute(svc), {
    view: "svc:Hair: color / cut",
    peek: "5b3c1a2e-0000-4000-8000-000000000001",
  });
  for (const view of [
    "all",
    "consultations",
    "proposals",
    "clients",
    "closed",
    "waiting",
    "lapsed",
    "svc:Ad management",
  ])
    assert.deepEqual(parsePipelineRoute(pipelineRoute({ view, peek: "cat" })), { view, peek: "cat" }, view);
  // The shell hands the page its param, which starts with the scope's own word.
  assert.deepEqual(parsePipelineRoute("pipeline:v-clients"), { view: "clients", peek: null });
  // Anything else in the address is left, as Leads leaves it; an address that is not the Pipeline's is none.
  assert.deepEqual(parsePipelineRoute("clients/pipeline:v-bogus:x-1:p-a:b"), { view: "all", peek: "a" });
  assert.deepEqual(
    parsePipelineRoute("clients/pipeline:v-s.%E0%A4"),
    { view: "all", peek: null },
    "a name that does not decode",
  );
  assert.equal(parsePipelineRoute("clients/leads:l-all"), null);
  assert.equal(parsePipelineRoute(""), null);
  assert.equal(
    pipelineRoute({ view: "bogus", peek: "a:b" }),
    "clients/pipeline",
    "no view it cannot read, no id with a separator",
  );
  assert.deepEqual(
    ["all", "proposals", "closed", "waiting", "lapsed", "svc:Ad management"].map((v) => pipelineViewLabel(v, null)),
    ["All deals", "Proposal out", "Passed or ended", "Nothing back in a week", "Lapsed", "Ad management"],
  );
  assert.equal(isPipelineView("svc:"), false);
  assert.equal(isPipelineView("svc: "), false);
});

test("a view holds only its rows, and the line stays the whole Pipeline's", () => {
  const whole = pipelineOf(fixture(), NOW, TZ, null);
  const of = (view) => pipelineOf(fixture(), NOW, TZ, null, view);
  const shape = (vm) => vm.groups.map((g) => [g.key, ids(g), g.collapsed]);
  assert.deepEqual(shape(of("proposals")), [["proposals", ["wes", "nia", "lars", "will", "val", "fay"], false]]);
  assert.deepEqual(
    shape(of("closed")),
    [["closed", ["ed", "abe", "dan", "eve"], false]],
    "the group someone picked is shown, not folded",
  );
  assert.deepEqual(shape(of("waiting")), [["proposals", ["wes", "nia"], false]]);
  assert.deepEqual(shape(of("lapsed")), [["proposals", ["lars"], false]]);
  assert.equal(of("consultations").groups[0].meta, "3 ended in the last week, nothing since");
  for (const view of ["proposals", "waiting", "lapsed", "closed"])
    assert.deepEqual(of(view).summary, whole.summary, `${view}: the line is the whole Pipeline's`);
  // A service's deals, in every group they stand in; a consultation has no deal yet, so no service.
  const mixed = [
    personRow(
      NOW,
      "a1",
      "Al",
      deal(NOW, "proposed", { proposed: 3, service: "Ad management", cents: 250_000, per: "month" }),
    ),
    personRow(
      NOW,
      "b1",
      "Bo",
      deal(NOW, "won", { proposed: 30, decided: 9, service: "Ad management", cents: 150_000, per: "month" }),
    ),
    personRow(NOW, "c1", "Cy", deal(NOW, "proposed", { proposed: 2, service: "Branding" })),
    personRow(NOW, "d1", "Di", { visits: visits(null, visit(ny("09-21", 10))) }),
  ].map((r) => toPersonRowVM(r, TZ, new Date(NOW)));
  const ads = pipelineOf(mixed, NOW, TZ, null, "svc:Ad management");
  assert.deepEqual(shape(ads), [
    ["proposals", ["a1"], false],
    ["clients", ["b1"], false],
  ]);
  assert.equal(pipelineOf(mixed, NOW, TZ, null, "svc:Nothing").empty, true);
});

test("the line's warn parts open their view; the counts are words", () => {
  const vm = pipelineOf(fixture(), NOW, TZ, null);
  assert.deepEqual(
    vm.line.map((p) => [p.words, p.view, p.tone]),
    [
      ["6 proposals out", null, null],
      ["2 waiting over a week", "waiting", "warn"],
      ["1 lapsed", "lapsed", "warn"],
      ["3 clients", null, null],
    ],
  );
  assert.deepEqual(
    vm.summary,
    vm.line.map((p) => p.words),
  );
});

test("the Pipeline's rail: every group always, what waits only when some does, the busiest services", () => {
  const rail = pipelineRail(pipelineOf(fixture(), NOW, TZ, null), NOW);
  assert.deepEqual(
    rail.map((s) => [s.key, s.label, s.rows.map((r) => [r.view, r.label, r.count, r.tone])]),
    [
      [
        "deals",
        "Deals",
        [
          ["all", "All deals", 21, null],
          ["consultations", "Consultations", 8, null],
          ["proposals", "Proposal out", 6, null],
          ["clients", "Clients", 3, null],
          ["closed", "Passed or ended", 4, null],
        ],
      ],
      [
        "waiting",
        "To follow up",
        [
          ["waiting", "Nothing back in a week", 2, "warn"],
          ["lapsed", "Lapsed", 1, "warn"],
        ],
      ],
      ["services", "Services", [["svc:Color correction", "Color correction", 12, null]]],
    ],
  );
  // Nothing waiting, no service named: those sections are not drawn; the groups keep the rail's shape.
  const quiet = pipelineRail(
    pipelineOf(
      [toPersonRowVM(personRow(NOW, "s", "Sara", { visits: visits(visit(ny("09-25", 14)), null) }), TZ, new Date(NOW))],
      NOW,
      TZ,
      null,
    ),
    NOW,
  );
  assert.deepEqual(
    quiet.map((s) => [s.key, s.rows.map((r) => [r.view, r.count])]),
    [
      [
        "deals",
        [
          ["all", 1],
          ["consultations", 1],
          ["proposals", 0],
          ["clients", 0],
          ["closed", 0],
        ],
      ],
    ],
  );
  // Eight services at most, the busiest first, then by name.
  const many = Array.from({ length: 11 }, (_, i) =>
    personRow(
      NOW,
      `p${i}`,
      `P${i}`,
      deal(NOW, "proposed", { proposed: 2, service: i < 3 ? "Zeta" : `S${String(i).padStart(2, "0")}` }),
    ),
  ).map((r) => toPersonRowVM(r, TZ, new Date(NOW)));
  const svcRows = pipelineRail(pipelineOf(many, NOW, TZ, null), NOW).find((s) => s.key === "services").rows;
  assert.equal(svcRows.length, PIPELINE_RAIL_SERVICES);
  assert.deepEqual(
    svcRows.slice(0, 3).map((r) => [r.label, r.count]),
    [
      ["Zeta", 3],
      ["S03", 1],
      ["S04", 1],
    ],
  );
});

test("a recorded move lands on the row as the door answers: the Pipeline regroups while People is still being read again", async () => {
  await fresh();
  const { recordDeal } = await import("../../../apps/dashboard/src/surfaces/people/people-detail.ts");
  const { startSurfaces } = await import("../../../apps/dashboard/src/bridge/surface-runner.ts");
  const before = surfaceValue("people").rows.find((r) => r.id === "wes").deal;
  const now = Date.now();
  const dto = (over) => ({
    id: before.id,
    contact_id: "wes",
    service: "Color correction",
    stage: "proposed",
    proposed_at: iso(now - 11 * DAY),
    decided_at: null,
    ended_at: null,
    amount_cents: 120_000,
    per: "once",
    currency: "USD",
    note: null,
    version: 1,
    created_at: iso(now - 11 * DAY),
    proposal_url: "https://docs.example.com/proposal",
    valid_until: null,
    lost_reason: null,
    ...over,
  });
  const won = dto({ stage: "won", decided_at: iso(now), version: 2 });
  const old = globalThis.window.fetch;
  const asked = [];
  let answer = { deal: won, from: "proposed", decision_id: "dec-1", current: won };
  // The re-read behind the write (People and Reports, the refresh map's) is held until the test lets it land.
  let land;
  const held = new Promise((r) => {
    land = r;
  });
  globalThis.window.fetch = async (url, init = {}) => {
    const u = new URL(String(url), "https://app.chanlytics.com");
    asked.push(`${init.method || "GET"} ${u.pathname}`);
    if (u.pathname === "/api/v1/contacts/wes/deal" && init.method === "POST")
      return json(200, { ok: true, data: answer });
    await held;
    return json(503, { ok: false, error: { code: "unavailable", message: "held" } });
  };
  // A runner, so the refresh map's re-read really runs: with none, a write has nothing to read again.
  const stop = startSurfaces([], () => () => {});
  const waited = () => new Promise((r) => setTimeout(() => r("still waiting"), 400));
  try {
    const r = await Promise.race([recordDeal("wes", { stage: "won", deal_id: before.id, version: 1 }), waited()]);
    assert.notEqual(
      r,
      "still waiting",
      "the sheet is answered as the door takes the move, not once People is read again",
    );
    assert.equal(r.ok, true);
    assert.equal(surfaceValue("people").rows.find((x) => x.id === "wes").deal.stage, "won", "the row took it");
    // The refresh map is loaded as it is first asked for, so the re-read starts a few ticks after the answer.
    for (let i = 0; i < 30 && !asked.includes("GET /api/v1/contacts"); i += 1)
      await new Promise((res) => setTimeout(res, 10));
    assert.ok(asked.includes("GET /api/v1/contacts"), "and People is being read again behind it, not yet landed");
    const tree = draw();
    const clients = all(tree, (n) => n.type === "tbody" && n.props?.["data-section"] === "clients")[0];
    assert.deepEqual(
      all(clients, (n) => n.type === "tr" && n.props?.id).map((n) => n.props.id),
      ["person-wes", "person-cat"],
      "Wes is a client, the newest first",
    );
    // A move on someone's older deal is not the deal their row shows: the row takes the door's `current`, never the
    // deal it recorded. It took the recorded one, and jumped to Clients until the re-read.
    answer = {
      deal: dto({ id: "d-wes-older", service: "Ad management", stage: "won", amount_cents: 90_000, per: "month" }),
      from: "won",
      decision_id: "dec-2",
      current: won,
    };
    const again = await Promise.race([
      recordDeal("wes", { stage: "won", deal_id: "d-wes-older", version: 1, amount_cents: 90_000 }),
      waited(),
    ]);
    assert.equal(again.ok, true);
    const row = surfaceValue("people").rows.find((x) => x.id === "wes");
    assert.deepEqual([row.deal.id, row.deal.service], [before.id, "Color correction"], "the row's own deal stays");
    // No `current` in the answer (a server from before it): the row waits for the re-read.
    answer = { deal: dto({ stage: "lost", decided_at: iso(now), version: 3 }), from: "won", decision_id: "dec-3" };
    await Promise.race([recordDeal("wes", { stage: "lost", deal_id: before.id, version: 2 }), waited()]);
    assert.equal(surfaceValue("people").rows.find((x) => x.id === "wes").deal.stage, "won");
    const { placeDeal } = await import("../../../apps/dashboard/src/surfaces/people/surface.ts");
    assert.equal(placeDeal("nobody-here", won), false, "someone People does not hold: nothing to move");
  } finally {
    land();
    stop();
    await new Promise((res) => setTimeout(res, 20));
    globalThis.window.fetch = old;
  }
});

test("a person a link names stays open where this tab kept a cursor in that view: the address's person takes the cursor", async () => {
  await fresh();
  // The tab's place for the whole Pipeline (usePlPlace): the cursor was left on Wes.
  bridgeHolds({
    parts: {
      tabMemory: {
        place: (page, view) => (page === "pipeline" && view === "all" ? { q: "", cursor: "wes", top: 0 } : null),
        keepPlace() {},
        draft: () => null,
        keepDraft() {},
        dropDraft() {},
      },
    },
  });
  try {
    let tree;
    for (let i = 0; i < 4; i += 1) tree = draw({ pipelineRoute: "pipeline:p-nia" });
    assert.equal(textOf(byTestId(byTestId(tree, "pipeline-peek"), "pipeline-peek-name")), "Nia", "the link's person");
    assert.deepEqual([went, replaced], [[], []], "and the address is left as the link said it");
    assert.equal(press("j"), true);
    for (let i = 0; i < 3; i += 1) tree = draw({ pipelineRoute: "pipeline:p-nia" });
    assert.deepEqual(replaced, ["clients/pipeline:p-cat"], "the keys walk on from the person the link opened");
  } finally {
    bridgeHolds({ parts: { tabMemory: undefined } });
  }
});

test("a view nobody touched is not written to the workspace: a first open saves nothing on the member's row", async () => {
  const seen = await fresh();
  for (let i = 0; i < 3; i += 1) draw();
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(seen.viewSaves, [], "the defaults were written for a member who had saved nothing");
  // A choice is theirs, and saved.
  click(byTestId(withHead(draw()), "pipeline-view-board"));
  draw();
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(seen.viewSaves.at(-1).view.layout, "board");
});

test("a viewer sees New proposal and why they may not press it, and a press opens nothing", async () => {
  await fresh();
  const keep = provided("roles");
  bridgeHolds({ parts: { roles: { can: () => false, myRole: () => "viewer" } } });
  try {
    let tree = draw();
    const open = newOpen(tree);
    assert.deepEqual([open.props["aria-disabled"], typeof open.props["aria-description"]], [true, "string"]);
    let stopped = false;
    open.props.onClick({
      preventDefault() {},
      stopPropagation() {
        stopped = true;
      },
      currentTarget: {},
    });
    tree = draw();
    assert.equal(stopped, true, "the gate's own press, which says why");
    assert.equal(byTestId(tree, "pipeline-new"), null, "nothing opened");
  } finally {
    bridgeHolds({ parts: { roles: keep } });
  }
});

test("the headings sort within each group, kept in the member's view: Value, then Person; the groups never move", async () => {
  const seen = await fresh();
  let tree = draw();
  assert.deepEqual(rowIds(tree), ["hana", "sara", "wes", "nia", "cat"]);
  click(find(tree, (n) => n.props?.className === "dtable-sort" && textOf(n).startsWith("Value")));
  tree = draw();
  assert.deepEqual(
    rowIds(tree),
    ["hana", "sara", "nia", "wes", "cat"],
    "Nia's $3,050 over Wes's $1,200, in their own group",
  );
  await tick();
  assert.deepEqual([seen.viewSaves.at(-1).view.sortBy, seen.viewSaves.at(-1).view.sortDir], ["value", "desc"]);
  // Person: by name, A first, then the other way on a second press.
  click(find(tree, (n) => n.props?.className === "dtable-sort" && textOf(n).startsWith("Person")));
  tree = draw();
  click(find(tree, (n) => n.props?.className === "dtable-sort" && textOf(n).startsWith("Person")));
  tree = draw();
  assert.deepEqual(rowIds(tree), ["sara", "hana", "wes", "nia", "cat"]);
  // Where it stands again: the Pipeline's own order, the way it opened, on the first press.
  click(find(tree, (n) => n.props?.className === "dtable-sort" && textOf(n).startsWith("Where it stands")));
  tree = draw();
  assert.deepEqual(rowIds(tree), ["hana", "sara", "wes", "nia", "cat"]);
});

test("Columns shows where they came from and the day a proposal stands until, as the member asks; the row's menu is not theirs to hide", async () => {
  const now = Date.now();
  const day = (d) => new Date(now + d * DAY).toISOString().slice(0, 10);
  await fresh({
    people: [
      ...peopleNow(),
      personRow(now, "val", "Val", deal(now, "proposed", { proposed: 3, validUntil: day(8) })),
      personRow(now, "lars", "Lars", deal(now, "proposed", { proposed: 7, validUntil: day(-9) })),
    ],
  });
  let tree = draw();
  const menu = find(withHead(tree), (n) => n.type === TableColumnsMenu);
  assert.deepEqual(
    menuOptions(menu).map((o) => [o.key, o.on]),
    [
      ["name", true],
      ["value", true],
      ["stage", true],
      ["next", true],
      ["came", false],
      ["valid", false],
    ],
  );
  menu.props.state.toggleColumn("valid");
  tree = draw();
  const valid = (id) => byTestId(rowNode(tree, id), "pipe-valid");
  assert.ok(textOf(valid("val")).trim(), "the day alone, under its heading");
  assert.equal(valid("val").props.className.includes("is-lapsed"), false);
  assert.equal(valid("lars").props.className.includes("is-lapsed"), true, "a day that has passed, in the warn ink");
  assert.match(textOf(valid("lars")), /^Lapsed /, "and in words, not by its colour alone");
  assert.equal(textOf(valid("cat")), "", "a client's deal stands until no day");
});

test("each card wears its deal's steps beside the time in stage, hidden from a screen reader that hears the head and the chip; a desk's row says it in words alone", async () => {
  await fresh();
  const desk = draw();
  assert.equal(
    byTestId(rowNode(desk, "wes"), "pipe-track"),
    null,
    "canvas D1: a desk's row has no picture of the steps, the chip's words say what it drew",
  );
  assert.equal(
    textOf(byTestId(rowNode(desk, "wes"), "pipe-in-stage")),
    "11 d",
    "the time in stage under the chip, as before",
  );
  await onPhone(async () => {
    await fresh();
    const tree = draw();
    const steps = (id) =>
      all(rowNode(tree, id), (n) => n.props?.className === "pipe-step").map(
        (n) => `${n.props["data-key"]}:${n.props["data-at"]}:${n.props["data-tone"]}`,
      );
    assert.deepEqual(
      steps("wes"),
      ["proposal:current:warn", "client:ahead:plain"],
      "waiting on the owner, as its chip says",
    );
    assert.deepEqual(steps("cat"), ["proposal:done:plain", "client:current:ok"]);
    assert.deepEqual(steps("hana"), ["consultation:done:plain", "proposal:current:warn", "client:ahead:plain"]);
    assert.deepEqual(steps("sara"), ["consultation:current:info", "proposal:ahead:plain", "client:ahead:plain"]);
    assert.equal(byTestId(rowNode(tree, "wes"), "pipe-track").props["aria-hidden"], "true");
    assert.equal(
      textOf(byTestId(rowNode(tree, "wes"), "pipe-in-stage")),
      "11 d",
      "the time in stage beside it, as before",
    );
  });
});

test("a row's menu: the deal's own acts where the member may record one, then their thread and their page; an act asks the one sheet", async () => {
  await fresh();
  const asked = [];
  bridgeHolds({ parts: { sheets: { ...provided("sheets"), openDeal: (a) => asked.push(a) } } });
  const menuOf = (tree, id) => find(rowNode(tree, id), (n) => n.type === Menu);
  let items = listOf(menuOf(draw(), "wes"));
  assert.deepEqual(
    items.map((it) => (it.divider ? "—" : it.label)),
    [DEAL_ACT_WORDS.won, DEAL_ACT_WORDS.lost, DEAL_ACT_WORDS.edit, "—", "Open the conversation", "Open their page"],
    "the conversation's Deal group but its send, which is the deal sheet's",
  );
  items[0].onClick();
  const wes = surfaceValue("people").rows.find((r) => r.id === "wes");
  assert.deepEqual(asked, [{ personId: "wes", mode: "won", dealId: wes.deal.id }]);
  items.at(-1).onClick();
  assert.deepEqual(opened, ["wes"], "their page");
  items.at(-2).onClick();
  assert.equal(went.at(-1), `inbox/${wes.threadId}`, "their conversation");
  // A consultation held: start one, with nothing to name a deal by.
  items = listOf(menuOf(draw(), "hana"));
  items[0].onClick();
  assert.deepEqual(asked.at(-1), { personId: "hana", mode: "propose", dealId: null });
  // Someone who passed before and came back for a consultation: a new proposal, as dragging their card asks, never
  // the old passed deal's Propose again.
  const now = Date.now();
  await fresh({
    people: [
      ...peopleNow(),
      personRow(now, "bea", "Bea", {
        ...deal(now, "lost", { proposed: 40, decided: 30, reason: "timing" }),
        visits: visits(null, visit(now - 2 * DAY)),
      }),
    ],
  });
  items = listOf(menuOf(draw(), "bea"));
  assert.equal(items[0].label, DEAL_ACT_WORDS.propose);
  items[0].onClick();
  assert.deepEqual(asked.at(-1), { personId: "bea", mode: "propose", dealId: null });
  // A viewer keeps the door and sees no act it may not press.
  bridgeHolds({ who: { me: { role: "viewer" } } });
  try {
    assert.deepEqual(
      listOf(menuOf(draw(), "wes")).map((it) => it.label),
      ["Open the conversation", "Open their page"],
    );
  } finally {
    bridgeHolds({ who: { me: { role: "owner" } } });
  }
});

test("a person with two open deals is two rows (0029): each is read, peeked, opened and acted on as the person, on the row's own deal; Ask hears whose each row is; a selection passes the deal each row stands for", async () => {
  const now = Date.now();
  const open = (id, service, days, o = {}) => ({
    id,
    stage: "proposed",
    service,
    proposed_at: iso(now - days * DAY),
    decided_at: null,
    ended_at: null,
    amount_cents: o.cents ?? null,
    per: o.per ?? null,
    currency: "USD",
    proposal_url: o.url ?? "https://docs.example.com/proposal",
    valid_until: null,
    lost_reason: null,
  });
  // Noa: a proposal out for ads six days (the deal their People row shows) and one for a website twelve days.
  const noa = personRow(now, "noa", "Noa", {
    ...deal(now, "proposed", { proposed: 6, service: "Ads" }),
    open_deals: [
      open("d-proposed-6", "Ads", 6),
      open("d-web", "Website", 12, { cents: 400_000, per: "once", url: "https://docs.example.com/p/web" }),
    ],
  });
  const seen = await fresh({ people: [...peopleNow(), noa] });
  // Their page lists both deals, each at its own version.
  seen.person = (id) => {
    const d = detailOf(seen.rawOf(id));
    if (id !== "noa") return d;
    const web = {
      ...d.deals[0],
      id: "d-web",
      service: "Website",
      proposed_at: iso(now - 12 * DAY),
      created_at: iso(now - 12 * DAY),
      amount_cents: 400_000,
      per: "once",
      proposal_url: "https://docs.example.com/p/web",
      version: 2,
    };
    return { ...d, deals: [d.deals[0], web] };
  };
  const asked = [];
  bridgeHolds({
    parts: {
      sheets: {
        ...provided("sheets"),
        openDeal: (a) => {
          asked.push(a);
          return true;
        },
      },
    },
  });
  let tree = draw();
  assert.deepEqual(
    rowIds(tree),
    ["hana", "sara", "noa_d-web", "wes", "nia", "noa", "cat"],
    "the website waits longest",
  );
  await settled();
  assert.ok(seen.reads.includes("noa"), "read ahead, as the rows shown are");
  assert.deepEqual(
    seen.reads.filter((id) => id.includes("_")),
    [],
    "a person is read by their own id, never a row's",
  );
  assert.deepEqual(
    askOnScreen().ids,
    ["hana", "sara", "noa", "wes", "nia", "noa", "cat"],
    "Ask hears whose each row is, in the rows' order",
  );
  // The website's row opens the sheet on Noa, headed by that deal, on the tab's copy of them.
  find(tree, (n) => n.type === "tr" && n.props?.id === "person-noa_d-web").props.onClick();
  tree = draw();
  assert.equal(textOf(byTestId(peekOf(tree), "pipeline-peek-sub")), "Website · $4,000");
  assert.equal(byTestId(peekOf(tree), "pipeline-peek-reading"), null, "the tab already holds them: no Reading…");
  await settled();
  tree = draw();
  // The sheet is the row's deal: its moves move the website.
  const caret = find(byTestId(peekOf(tree), "pipeline-peek-bar"), (n) => n.type === Menu);
  listOf(caret)
    .find((it) => it.label === DEAL_ACT_WORDS.won)
    .onClick();
  assert.deepEqual(asked.at(-1), { personId: "noa", mode: "won", dealId: "d-web" });
  // Their other open deal is a row of its own (the compact sheet lists none): its row opens it in this sheet.
  assert.equal(
    byTestId(peekOf(tree), "pipeline-peek-others"),
    null,
    "their other deals are their page's and their rows'",
  );
  rowNode(tree, "noa").props.onClick();
  tree = draw();
  assert.equal(textOf(byTestId(peekOf(tree), "pipeline-peek-sub")), "Ads", "the ads' own row");
  click(byTestId(peekOf(tree), "pipeline-peek-opens"));
  assert.deepEqual(opened, ["noa"], "their page, never the row's id");
  // The row's menu acts on its own deal, and its doors are the person's (the peek closed: beside it the row is compact).
  click(byTestId(peekOf(draw()), "pipeline-peek-close"));
  const items = listOf(find(rowNode(draw(), "noa_d-web"), (n) => n.type === Menu));
  items[0].onClick();
  assert.deepEqual(asked.at(-1), { personId: "noa", mode: "won", dealId: "d-web" });
  items.at(-1).onClick();
  assert.deepEqual(opened, ["noa", "noa"]);
  // A selection of both rows passes both deals, each at the version its own read says, and both rows leave it.
  const keepToast = provided("toast");
  bridgeHolds({ parts: { toast: () => [null, () => {}] } });
  try {
    tree = draw();
    const table = find(tree, (n) => n.type === DataTable);
    for (const id of ["noa_d-web", "noa"]) table.props.state.toggleSelected(id);
    tree = draw();
    assert.equal(textOf(byTestId(byTestId(tree, "bulk-bar"), "pipe-pass-open")).trim(), "Mark as passed · 2");
    click(byTestId(tree, "pipe-pass-open"));
    tree = draw();
    find(byTestId(tree, "pipe-pass"), (n) => n.type === globalThis.window.RecordToggleGroup).props.onChange("timing");
    tree = draw();
    await byTestId(tree, "pipe-pass-go").props.onClick();
    await settled();
    assert.deepEqual(seen.posted, [
      { id: "noa", body: { stage: "lost", deal_id: "d-web", version: 2, lost_reason: "timing" } },
      { id: "noa", body: { stage: "lost", deal_id: "d-proposed-6", version: 3, lost_reason: "timing" } },
    ]);
    assert.deepEqual(
      [...find(draw(), (n) => n.type === DataTable).props.state.selected],
      [],
      "both rows passed, and left",
    );
  } finally {
    bridgeHolds({ parts: { toast: keepToast } });
  }
});

test("a person's further deal on the page (0029's review): People's bar counts people, the box finds any open deal's service, a client's row stands until no day, the phone's act is the row's own deal, and a row renamed by a move keeps its peek and its pick", async () => {
  const now = Date.now();
  const day = (d) => new Date(now + d * DAY).toISOString().slice(0, 10);
  const open = (id, stage, service, days, o = {}) => ({
    id,
    stage,
    service,
    proposed_at: iso(now - days * DAY),
    decided_at: o.decided === undefined ? null : iso(now - o.decided * DAY),
    ended_at: null,
    amount_cents: o.cents ?? null,
    per: o.per ?? null,
    currency: "USD",
    proposal_url: o.url === undefined ? "https://docs.example.com/proposal" : o.url,
    valid_until: o.validUntil ?? null,
    lost_reason: null,
  });
  // Noa: two proposals out, ads (six days, their row's) and a website (twelve). Mia: a client of SEO whose row shows
  // her ads proposal, which stands until a week from now.
  const noa = personRow(now, "noa", "Noa", {
    ...deal(now, "proposed", { proposed: 6, service: "Ads" }),
    open_deals: [
      open("d-proposed-6", "proposed", "Ads", 6),
      open("d-web", "proposed", "Website", 12, { cents: 400_000, per: "once", url: "https://docs.example.com/p/web" }),
    ],
  });
  const mia = personRow(now, "mia", "Mia", {
    ...deal(now, "proposed", { proposed: 4, service: "Ads", validUntil: day(8) }),
    open_deals: [
      open("d-proposed-4", "proposed", "Ads", 4, { validUntil: day(8) }),
      open("d-won-40", "won", "SEO", 40, { decided: 30, cents: 150_000, per: "month", url: null }),
    ],
  });
  const seen = await fresh({ people: [...peopleNow(), noa, mia] });
  const web = {
    id: "d-web",
    contact_id: "noa",
    service: "Website",
    stage: "proposed",
    proposed_at: iso(now - 12 * DAY),
    decided_at: null,
    ended_at: null,
    amount_cents: 400_000,
    per: "once",
    currency: "USD",
    note: null,
    version: 2,
    created_at: iso(now - 12 * DAY),
    proposal_url: "https://docs.example.com/p/web",
    valid_until: null,
    lost_reason: null,
  };
  /** Noa's page lists both her deals, each at its own version. */
  const wireNoa = (sn) => {
    sn.person = (id) => {
      const d = detailOf(sn.rawOf(id));
      return id === "noa" ? { ...d, deals: [d.deals[0], web] } : d;
    };
  };
  wireNoa(seen);
  const table = () => find(draw(), (n) => n.type === DataTable);
  const count = () => textOf(byClass(byTestId(draw(), "bulk-bar"), "cl-bulk-count")).trim();
  // People's bar acts on people: one of Noa's rows, or both, is one person.
  table().props.state.toggleSelected("noa_d-web");
  assert.equal(count(), "1 selected");
  table().props.state.toggleSelected("noa");
  assert.equal(count(), "1 selected", "one person, however many of their rows");
  table().props.state.toggleSelected("wes");
  assert.equal(count(), "2 selected");
  for (const id of ["noa_d-web", "noa", "wes"]) table().props.state.toggleSelected(id);
  // The box finds any open deal's service, whichever deal their row shows.
  let tree = draw();
  lineBox().props.onChange({ target: { value: "website" } });
  assert.deepEqual(rowIds(draw()), ["noa_d-web", "noa"]);
  (draw(), lineBox()).props.onChange({ target: { value: "" } });
  // A client's row stands until no day, whatever their proposal's is.
  find(withHead(draw()), (n) => n.type === TableColumnsMenu).props.state.toggleColumn("valid");
  tree = draw();
  const valid = (id) => textOf(byTestId(rowNode(tree, id), "pipe-valid")).trim();
  assert.deepEqual([!!valid("mia"), valid("mia_d-won-40")], [true, ""]);
  find(withHead(draw()), (n) => n.type === TableColumnsMenu).props.state.toggleColumn("valid");
  // On a phone, the sheet's foot acts on the row's own deal: the website's link, not the ads'.
  await onPhone(async () => {
    wireNoa(await fresh({ people: [...peopleNow(), noa, mia] }));
    find(draw(), (n) => n.type === "tr" && n.props?.id === "person-noa_d-web").props.onClick();
    draw();
    await settled();
    click(byTestId(peekOf(draw()), "pipeline-peek-bar-act"));
    const carried = JSON.parse(globalThis.sessionStorage.getItem("chanlytics-compose"));
    assert.ok(carried.text.includes("docs.example.com/p/web"), carried.text);
    closePhoneSheet(draw());
  });
  // The ads pass while the website's row is peeked and picked: the website becomes the deal their row shows and its row
  // takes their id; the peek and the pick follow it there.
  wireNoa(await fresh({ people: [...peopleNow(), noa, mia] }));
  find(draw(), (n) => n.type === "tr" && n.props?.id === "person-noa_d-web").props.onClick();
  table().props.state.toggleSelected("noa_d-web");
  draw();
  await settled();
  const { recordDeal } = await import("../../../apps/dashboard/src/surfaces/people/people-detail.ts");
  const ads = {
    ...web,
    id: "d-proposed-6",
    service: "Ads",
    stage: "lost",
    proposed_at: iso(now - 6 * DAY),
    created_at: iso(now - 6 * DAY),
    decided_at: iso(now),
    amount_cents: null,
    per: null,
    version: 4,
    proposal_url: "https://docs.example.com/proposal",
    lost_reason: "price",
  };
  const old = globalThis.window.fetch;
  globalThis.window.fetch = async (url, init = {}) => {
    const u = new URL(String(url), "https://app.chanlytics.com");
    if (u.pathname === "/api/v1/contacts/noa/deal" && init.method === "POST")
      return json(200, { ok: true, data: { deal: ads, from: "proposed", decision_id: "dec-2", current: web } });
    return old(url, init);
  };
  try {
    const r = await recordDeal(
      "noa",
      { stage: "lost", deal_id: "d-proposed-6", version: 3, lost_reason: "price" },
      { refresh: false },
    );
    assert.equal(r.ok, true, r.message);
    draw();
    await settled();
    tree = draw();
    assert.deepEqual(
      rowIds(tree).filter((id) => id.startsWith("noa")),
      ["noa"],
      "the website's row is their first now",
    );
    assert.equal(textOf(byTestId(peekOf(tree), "pipeline-peek-sub")), "Website · $4,000", "the sheet followed it");
    assert.deepEqual([...find(tree, (n) => n.type === DataTable).props.state.selected], ["noa"], "and so did the pick");
  } finally {
    globalThis.window.fetch = old;
  }
});

test("the Pipeline's groups swap in with the kit's rise on a rail pick, the table and its heads holding still", async () => {
  // People's lists rose on a pick and the Pipeline's groups came in at once (5 Oct 2026): the scope hands its table the
  // swap's ref, which rises the table's row groups (kit/motion/use-swap-motion.ts with TABLE_BODIES).
  await fresh();
  const table = find(draw(), (n) => n.type === DataTable);
  assert.ok(table.props.swapRef && "current" in table.props.swapRef, "the table carries the swap's ref");
});

test("a selection: People's bar leads with Mark as passed · N; why is asked once, the bridge records them, what it came to is said once, and only those who passed leave the selection", async () => {
  const seen = await fresh();
  const flashes = [];
  const keepToast = provided("toast");
  bridgeHolds({ parts: { toast: () => [null, (f) => flashes.push(f)] } });
  const dealOfRow = (id) => surfaceValue("people").rows.find((r) => r.id === id).deal;
  // The bridge reads each person afresh (people-detail.ts passDeals): Wes is still a proposal out, Nia has become a
  // client since the rows were drawn.
  seen.person = (id) => {
    const d = detailOf(seen.rawOf(id));
    return id === "nia" ? { ...d, deals: d.deals.map((x) => ({ ...x, stage: "won" })) } : d;
  };
  try {
    let tree = draw();
    const table = find(tree, (n) => n.type === DataTable);
    assert.equal(table.props.selectable, true);
    for (const id of ["wes", "nia", "cat"]) table.props.state.toggleSelected(id);
    tree = draw();
    const bar = byTestId(tree, "bulk-bar");
    assert.ok(bar, "People's own bar");
    assert.equal(textOf(byTestId(bar, "pipe-pass-open")).trim(), "Mark as passed · 2", "a client does not pass");
    click(byTestId(bar, "pipe-pass-open"));
    tree = draw();
    const ask = byTestId(tree, "pipe-pass");
    assert.equal(ask.props["aria-labelledby"], "pipe-pass-ask", "the question names itself once");
    assert.equal(textOf(byTestId(ask, "pipe-pass-rest")), "1 is not a proposal out and stays as it is");
    assert.equal(byTestId(ask, "pipe-pass-go").props.disabled, true, "why comes first");
    // Esc in the question cancels the question, not the selection.
    let prevented = false;
    ask.props.onKeyDown({
      key: "Escape",
      preventDefault() {
        prevented = true;
      },
    });
    tree = draw();
    assert.deepEqual([prevented, byTestId(tree, "pipe-pass"), !!byTestId(tree, "bulk-bar")], [true, null, true]);
    click(byTestId(tree, "pipe-pass-open"));
    tree = draw();
    find(byTestId(tree, "pipe-pass"), (n) => n.type === globalThis.window.RecordToggleGroup).props.onChange("price");
    tree = draw();
    await byTestId(tree, "pipe-pass-go").props.onClick();
    await settled();
    assert.deepEqual(
      seen.posted,
      [
        {
          id: "wes",
          body: {
            stage: "lost",
            deal_id: dealOfRow("wes").id,
            version: 3,
            lost_reason: "price",
          },
        },
      ],
      "only Wes is still a proposal out: he is recorded, with the version their own read says",
    );
    assert.deepEqual(flashes.at(-1), {
      tone: "warn",
      msg: "1 marked as passed · 1 had changed, and was left as it is",
    });
    tree = draw();
    assert.deepEqual(
      [...find(tree, (n) => n.type === DataTable).props.state.selected].sort(),
      ["cat", "nia"],
      "only Wes, who passed, leaves the selection: the one that had changed, and the client, stay picked",
    );
  } finally {
    bridgeHolds({ parts: { toast: keepToast } });
  }
});

test("beside an open peek on a desk the table keeps who and where they stand; the peek says the rest", async () => {
  await fresh();
  let tree = draw();
  rowNode(tree, "wes").props.onClick();
  tree = draw();
  assert.ok(peekOf(tree));
  assert.deepEqual(
    all(
      find(tree, (n) => n.type === "thead"),
      (n) => n.type === "th",
    ).map(textOf),
    ["", "Person↕", "Where it stands▲"],
  );
  // Closed again, the table has all its columns back.
  press("Escape");
  tree = draw();
  assert.equal(
    all(
      find(tree, (n) => n.type === "thead"),
      (n) => n.type === "th",
    ).length,
    6,
  );
});

test("the sheet leaves how to reach them to their page, and its foot leads with the card's act, then Message and Call, on a desk and a phone alike", async () => {
  // Wes, as their page would read them: a number and an address.
  const wesWire = (seen) => {
    seen.person = (id) => {
      const d = detailOf(seen.rawOf(id));
      return { ...d, row: { ...d.row, email: "wes@example.com" } };
    };
  };
  const seen = await fresh();
  wesWire(seen);
  let tree = draw();
  rowNode(tree, "wes").props.onClick();
  draw();
  await settled();
  tree = draw();
  // Their number, their address and what a reply may be are their page's (the compact sheet): the foot reaches them.
  assert.equal(byTestId(peekOf(tree), "pipeline-peek-reach"), null);
  assert.equal(textOf(peekOf(tree)).includes("wes@example.com"), false, "no address in the sheet");
  // Calling is the foot's (their page's Call, which asks how it went), never a bare link; their deals' moves are their
  // page's.
  assert.equal(
    find(
      byTestId(peekOf(tree), "pipeline-peek-stand"),
      (n) => typeof n.props?.href === "string" && n.props.href.startsWith("tel:"),
    ),
    null,
  );
  assert.equal(byTestId(peekOf(tree), "pipeline-peek-history"), null);
  const lead = dealNextAct(await personDetail("wes"), Date.now()).label;
  assert.equal(textOf(byTestId(peekOf(tree), "pipeline-peek-bar-act")), lead, "a desk's foot: the card's own next act");
  assert.equal(hasDeal(tree), false, "a desk's cursor lights the row already");
  await onPhone(async () => {
    const onPhoneSeen = await fresh();
    wesWire(onPhoneSeen);
    let tree = draw();
    rowNode(tree, "wes").props.onClick();
    draw();
    await settled();
    tree = draw();
    const foot = byTestId(tree, "pipeline-peek-bar");
    assert.equal(textOf(byTestId(foot, "pipeline-peek-bar-act")), lead, "the card's own next act");
    assert.ok(hasDeal(tree), "the open deal's row is lit above the sheet");
    // As tall as what it holds (the compact sheet): no rests to raise, and its face and name open their page.
    const sheet = find(tree, (n) => n.props?.testid === "pipeline-peek" && "opens" in n.props);
    assert.equal(sheet.props.rest, undefined, "no rests: nothing left to raise");
    assert.equal(sheet.props.opens.label, "Open Wes's page");
    assert.equal(
      listOf(find(foot, (n) => n.type === Menu))[0].header,
      "Color correction · Wes",
      "what the caret's moves are about: the service and who",
    );
    assert.ok(byTestId(foot, "pipeline-peek-message"), "Message, beside it");
    assert.ok(
      find(foot, (n) => n.props?.href === "tel:+15550001114"),
      "Call rings from the member's phone, and their page then asks how it went",
    );
  });
});

test("on the board a card wears its steps and a Move to menu of the columns it may go to, and a column shows twenty, then Show N more", async () => {
  const now = Date.now();
  const many = Array.from({ length: 25 }, (_, i) =>
    personRow(
      now,
      `p${String(i).padStart(2, "0")}`,
      `P${String(i).padStart(2, "0")}`,
      deal(now, "proposed", { proposed: 30 - i }),
    ),
  );
  await fresh({ people: [...peopleNow(), ...many] });
  const asked = [];
  bridgeHolds({ parts: { sheets: { ...provided("sheets"), openDeal: (a) => asked.push(a) } } });
  let tree = draw();
  click(byTestId(withHead(tree), "pipeline-view-board"));
  tree = draw();
  const col = byTestId(tree, "pipeline-col-proposals");
  const cards = () =>
    all(byTestId(draw(), "pipeline-col-proposals"), (n) => n.props?.["data-testid"] === "pipeline-card");
  assert.equal(cards().length, 20, "the first twenty");
  assert.equal(textOf(byTestId(col, "pipeline-col-more")), "Show 7 more", "of twenty-seven proposals out");
  // A card's steps, and its Move to: the columns a proposal out may go to, each asking the one sheet.
  const first = find(col, (n) => n.props?.["data-testid"] === "pipeline-card");
  assert.ok(byTestId(first, "pipe-track"));
  const menu = find(col, (n) => n.type === Menu);
  assert.deepEqual(
    listOf(menu).map((it) => it.header || it.label),
    ["Move to", "Clients", "Passed or ended"],
  );
  listOf(menu)[1].onClick();
  assert.equal(asked.at(-1).mode, "won");
  click(byTestId(col, "pipeline-col-more"));
  assert.equal(cards().length, 27, "and all of them, asked");
  // A viewer's cards neither drag nor move by menu.
  bridgeHolds({ who: { me: { role: "viewer" } } });
  try {
    assert.equal(
      find(byTestId(draw(), "pipeline-col-proposals"), (n) => n.type === Menu),
      null,
    );
  } finally {
    bridgeHolds({ who: { me: { role: "owner" } } });
  }
});

test("the bridge's pass reads each person afresh, records only a deal still a proposal out, tells a change from a failure, and reads People again once after the last whatever it answered", async () => {
  await fresh();
  const { passDeals } = await import("../../../apps/dashboard/src/surfaces/people/people-detail.ts");
  const { startSurfaces } = await import("../../../apps/dashboard/src/bridge/surface-runner.ts");
  const now = Date.now();
  const dealDto = (id, contact, stage, version) => ({
    id,
    contact_id: contact,
    service: "Color correction",
    stage,
    proposed_at: iso(now - 9 * DAY),
    decided_at: stage === "proposed" ? null : iso(now - DAY),
    ended_at: null,
    amount_cents: 120_000,
    per: "once",
    currency: "USD",
    note: null,
    version,
    created_at: iso(now - 9 * DAY),
    proposal_url: null,
    valid_until: null,
    lost_reason: null,
  });
  // As the person read answers: Ann still a proposal out, Bo a client since the rows were drawn, Cy's deal moved by a
  // teammate (the door refuses it), Di's read fails, Ed's write fails another way.
  const people = {
    ann: dealDto("d-ann", "ann", "proposed", 4),
    bo: dealDto("d-bo", "bo", "won", 7),
    cy: dealDto("d-cy", "cy", "proposed", 2),
    di: null,
    ed: dealDto("d-ed", "ed", "proposed", 5),
  };
  const detail = (id) => ({
    row: personRow(now, id, id.toUpperCase(), {}),
    identities: [],
    conversations: [],
    calls: [],
    escalations: [],
    decisions: [],
    receptionist_mode: null,
    workspace_reply_mode: "auto",
    deals: people[id] ? [people[id]] : [],
    services: ["Color correction"],
  });
  const old = globalThis.window.fetch;
  const asked = [];
  globalThis.window.fetch = async (url, init = {}) => {
    const u = new URL(String(url), "https://app.chanlytics.com");
    const method = init.method || "GET";
    asked.push(`${method} ${u.pathname}`);
    const one = u.pathname.match(/^\/api\/v1\/contacts\/([^/]+)$/);
    if (one && method === "GET") {
      if (one[1] === "di") return json(503, { ok: false, error: { code: "unavailable", message: "down" } });
      return json(200, { ok: true, data: { person: detail(one[1]) } });
    }
    const write = u.pathname.match(/^\/api\/v1\/contacts\/([^/]+)\/deal$/);
    if (write && method === "POST") {
      const body = JSON.parse(init.body);
      if (write[1] === "cy")
        return json(400, { ok: false, error: { code: "validation", message: DEAL_REFUSALS.moved } });
      if (write[1] === "ed") return json(403, { ok: false, error: { code: "forbidden", message: "No." } });
      const d = { ...people[write[1]], stage: "lost", version: body.version + 1, lost_reason: body.lost_reason };
      return json(200, { ok: true, data: { deal: d, from: "proposed", decision_id: "dec", current: d } });
    }
    // The one re-read after the pass (People's list, then Reports): answered, since the pass waits for it.
    return json(404, { ok: false, error: { code: "not_found", message: `no ${u.pathname}` } });
  };
  const stop = startSurfaces([], () => () => {});
  try {
    const out = await passDeals(
      ["ann", "bo", "cy", "di", "ed"].map((id) => ({ personId: id, dealId: `d-${id}` })),
      "price",
    );
    assert.deepEqual(out, { passed: ["ann"], changed: ["bo", "cy"], failed: ["di", "ed"] });
    const posts = asked.filter((a) => a.startsWith("POST"));
    assert.deepEqual(
      posts,
      ["POST /api/v1/contacts/ann/deal", "POST /api/v1/contacts/cy/deal", "POST /api/v1/contacts/ed/deal"],
      "Bo became a client since: nothing is written over him; Di couldn't be read: nothing is sent for her",
    );
    assert.equal(
      asked.filter((a) => a === "GET /api/v1/contacts").length,
      1,
      "People is read again once, after the last, though the last was refused",
    );
  } finally {
    stop();
    await new Promise((r) => setTimeout(r, 20));
    globalThis.window.fetch = old;
  }
});

test("the bridge publishes the deal kit the pages still read by name (the thread's Deal group), and no verb nothing reads", async () => {
  const { installPeopleCourier } = await import("../../../apps/dashboard/src/surfaces/people/people-detail.ts");
  const keep = {};
  const names = ["__deal", "__recordDeal", "__passDeals", "__personDetail", "__peekPerson", "__warmPerson"];
  for (const k of names) keep[k] = globalThis.window[k];
  try {
    for (const k of ["__passDeals", "__personDetail", "__peekPerson"]) delete globalThis.window[k];
    installPeopleCourier();
    // The bridge's own contracts, by name: this file and the bridge load the package as two module instances.
    assert.equal(provided("deal").menu.name, dealMenuActs.name, "the conversation's Deal group reads its acts by name");
    // The card's next act, the sheet's rules and the cards' words are imported where they are drawn (person-deal.tsx,
    // the sheets): the frame stopped carrying them for every page (the loadability review, 19 Oct 2026).
    assert.equal(provided("deal").next, undefined, "the card's next act is imported, not published");
    assert.equal(provided("deal").sheet, undefined);
    assert.equal(typeof provided("warmPerson"), "function", "the shell's routeDoor warms a person by it");
    // The pages import these (people-detail.ts passDeals, personDetail, peekPerson): the window names went with the
    // last page that read them there (O4b).
    for (const k of ["__passDeals", "__personDetail", "__peekPerson", "__warmPeople"])
      assert.equal(globalThis.window[k], undefined, `${k} is no longer published`);
  } finally {
    for (const k of names) globalThis.window[k] = keep[k];
  }
});
