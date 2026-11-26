/**
 * What an eval run cost, turn by turn, and X5-4: a thread snoozed between two warm turns, judged and woken.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  MOMENT_TRIGGERS,
  PLAN_WORDS,
  PLAYBOOK_LIMITS,
  PLAYBOOK_PATCH_KEYS,
  channelChoices,
  channelsReady,
} from "@chanlytics/contracts";
import { WIN_BACK } from "../../../tooling/scripts/ops/e2e-workspace.mjs";
import {
  ROW_KINDS,
  announcement,
  describeSecondTurn,
  firstThreadNamed,
  followUpFails,
  jsonLines,
  neededGets,
  omitsSnoozed,
  pageProblems,
  resolveContext,
  secondScope,
  secondTurn,
  setupCardsFails,
  shapeAskedFails,
  detailShapeFails,
  previewJudged,
  skipFor,
  snoozeThenAsk,
  toolsOrderNote,
  turnShapes,
  usageRows,
} from "../../../tooling/scripts/eval-ask-context.mjs";
import {
  ANSWERS,
  CASES,
  DANA,
  NEW_READS,
  NIGHTLY,
  PEOPLE_PAGE,
  READ,
  RIO,
  ROOT,
  SETUP_AND_CHANGE,
  SNOOZE,
  SURFACES,
  T1,
  TWO_TURNS,
  U,
  WAKE,
  accepted,
  final,
  needsMe,
  offerChannels,
  postgrest,
  surfaceFor,
  threadDoor,
} from "./_eval-context.mjs";

test("the usage rows are read past PostgREST's thousand, a page at a time on a whole order, and only AI's", async () => {
  const round = (i, purpose) => ({ data: { model: "claude-opus-5-5", input_tokens: i, output_tokens: 1, purpose } });
  const events = [
    ...Array.from({ length: 2400 }, (_, i) => round(i, "ask")),
    ...Array.from({ length: 50 }, (_, i) => round(i, "brain")),
  ];
  const db = postgrest({ events });
  const rows = await usageRows(db.rest, "T", "2026-09-27T09:00:00.000Z");
  assert.equal(rows.length, 2400, "every round of the run, where one read stopped at a thousand");
  assert.ok(rows.every((d) => d.purpose === "ask"));
  assert.deepEqual(
    db.paths.map((p) => new URL(`https://x/${p}`).searchParams.get("offset")),
    ["0", "1000", "2000"],
  );
  for (const p of db.paths) {
    assert.match(
      p,
      /^events\?tenant_id=eq\.T&kind=eq\.usage\.ask_tokens&created_at=gte\.2026-09-27T09%3A00%3A00\.000Z/,
    );
    assert.match(p, /&select=data&order=created_at\.asc,id\.asc&offset=\d+&limit=1000$/, "the id breaks a tie");
  }
});

test("each answered turn's stored shape is read by its message id, selecting only content->shape", async () => {
  const shape = (hit) => ({
    tokens: { input: 10, cache_read: 90, cache_creation: 0, output: 5 },
    cache_hit: hit,
    follow_up: hit > 0,
    since_last_ms: hit > 0 ? 1200 : null,
    rounds: 1,
    warm: "hit",
  });
  const ids = Array.from({ length: 120 }, (_, i) => U(500 + i));
  const rows = ids.map((id, i) => ({ id, shape: i === 7 ? null : shape(i % 2 ? 0.9 : 0) }));
  rows[3].shape.replay = "live";
  const db = postgrest({ ask_messages: rows });
  const got = await turnShapes(db.rest, [...ids, "unsaved-1735", ids[0]]);
  assert.equal(got.size, 119, "a row with no shape has none; an unsaved turn is never asked for");
  assert.deepEqual(got.get(ids[1]), {
    tokens: { input: 10, cache_read: 90, cache_creation: 0, output: 5 },
    cache_hit: 0.9,
    follow_up: true,
    since_last_ms: 1200,
  });
  assert.equal(got.get(ids[3]).replay, "live", "the history's kind, once PR 5.4 records it");
  assert.equal(db.paths.length, 3, "fifty ids a read: a longer in.() list is a URI PostgREST refuses");
  for (const p of db.paths) assert.match(p, /^ask_messages\?id=in\.\([0-9a-f,-]+\)&select=id,shape:content->shape$/);
  assert.deepEqual(await turnShapes(db.rest, []), new Map());
});

test("a turn's lines are read across chunks as the bridge reads them, and a torn line is skipped, not the turn", () => {
  const got = [];
  const lines = jsonLines((e) => got.push(e));
  lines.push(`{"t":"thread","id":"${T1}","title":"a"}\n{"t":"sa`);
  lines.push('y","headline":"H","detail":""}\nnot json at all\n\n{"t":"final","mess');
  lines.end();
  assert.deepEqual(got, [
    { t: "thread", id: T1, title: "a" },
    { t: "say", headline: "H", detail: "" },
  ]);
  const whole = [];
  const last = jsonLines((e) => whole.push(e));
  last.push('{"t":"final","message":{"text":"ok"}}');
  last.end();
  assert.deepEqual(whole, [{ t: "final", message: { text: "ok" } }], "a last line with no newline is read");
});

test("the case set: unique ids, every page built over the GETs' answers and placed on its surface as the palette places it", () => {
  const ids = CASES.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length, "every id once");
  assert.deepEqual(pageProblems(CASES), []);
  const paged = CASES.filter((c) => c.context);
  assert.ok(paged.length >= 27, `${paged.length} cases carry their page`);
  for (const c of CASES.filter((x) => !x.context))
    assert.equal(c.surface, "today", `${c.id} is asked as it always was`);
  assert.deepEqual(
    neededGets(CASES).sort(),
    ["calls", "contacts", "conversations", "leads", "playbooks"],
    "the eval reads only GETs that write nothing",
  );
  for (const c of paged) {
    const { context } = resolveContext(c.context, ANSWERS);
    accepted(context);
    assert.equal(c.surface, c.context.surface, c.id);
    const [page, ...rest] = context.route.split("/");
    assert.equal(surfaceFor(page, rest.length ? rest.join("/") : null), c.surface, `${c.id}: #/${context.route}`);
    for (const k of Object.keys(ROW_KINDS[c.surface] ?? {})) assert.ok(k in ANSWERS);
  }
  // A second turn's page, the case's or its own, is built and placed the same way.
  for (const two of CASES.map(secondTurn).filter((t) => t?.context)) {
    const { context } = resolveContext(two.context, ANSWERS);
    accepted(context);
    assert.equal(two.surface, two.context.surface, `${two.id} (then)`);
    const [page, ...rest] = context.route.split("/");
    assert.equal(
      surfaceFor(page, rest.length ? rest.join("/") : null),
      two.surface,
      `${two.id} (then): #/${context.route}`,
    );
  }
});

test("the case set's second turns (PR 5.2): ten new cases, each kind on two surfaces, and the eighty before them one turn", () => {
  // Since 10 Oct 2026 a setup asked twice in one thread carries one too (the moment spec, A8: the next test's), and since
  // 15 Oct a thread snoozed between two warm turns (X5-4: its own tests, below).
  const LATER = ["setup_again_same_thread", "needs_me_after_a_snooze"];
  const twos = CASES.filter((c) => c.then && !LATER.includes(c.id));
  assert.equal(twos.length, 10);
  assert.ok(
    CASES.slice(0, 80).every((c) => !c.then),
    "the cases before PR 5.2 are untouched: their results stay comparable",
  );
  const on = (pick) =>
    twos
      .filter(pick)
      .map((c) => c.surface)
      .sort();
  // "Approve that one" points, never presses: held on every repetition.
  const approve = twos.filter((c) => c.then.expect.names_card);
  assert.deepEqual(
    on((c) => c.then.expect.names_card),
    ["inbox", "settings"],
  );
  assert.ok(approve.every((c) => c.must_never && c.then.expect.no_write && c.then.expect.proposals_none));
  // "Open the second" in turn 1's thread, on a page with a second row: the palette sends turn 1's second item as the
  // focus, and the page's second row only past the answer's items (the Phase 5 plan, D7; resolveContext's `first`).
  assert.deepEqual(
    on((c) => c.then.expect.opens_item === 2),
    ["leads", "people"],
  );
  for (const c of twos.filter((x) => x.then.expect.opens_item)) assert.equal(secondTurn(c).context.focus, "2", c.id);
  assert.deepEqual(
    on((c) => c.then.text === "and last week?"),
    ["reports", "today"],
  );
  for (const c of twos.filter((x) => x.then.text === "and last week?"))
    assert.ok(c.then.expect.tools_any.includes("report") && c.then.expect.counts && !c.then.expect.on_page, c.id);
  // A scope changed between the turns: turn 2 asked on another row, named, and turn 1's row dropped.
  assert.deepEqual(
    on((c) => c.then.expect.drops_first_scope),
    ["conversations", "people"],
  );
  for (const c of twos.filter((x) => x.then.expect.drops_first_scope)) {
    const one = resolveContext(c.context, ANSWERS).scope;
    const two = secondScope(resolveContext(secondTurn(c).context, ANSWERS), one);
    assert.ok(one && two && one.id !== two.id && c.then.expect.names_focus, c.id);
  }
  // A settings note approved between the turns, and what it answers asked after.
  assert.deepEqual(
    on((c) => c.then.between === "approve"),
    ["settings", "today"],
  );
  for (const c of twos.filter((x) => x.then.between))
    assert.ok(c.expect.proposals_any.includes("settings") && c.then.expect.includes_any.length, c.id);
});

test("the setup and change cases (the moment spec, A8): seventeen, run only after the Win-back's seed and never here; a setup's two reads ride into round 1 exactly where the turn hears a setup, and only there is the tools' order noted; nothing of theirs is approved, so nothing is filed", async () => {
  const { crossPagePlan } = await import("../../../apps/dashboard/src/server/ask/cross-page.ts");
  const cases = CASES.filter((c) => /^(setup|change)_/.test(c.id));
  assert.deepEqual(
    cases.map((c) => c.id),
    SETUP_AND_CHANGE,
  );
  // Every turn of each says no write, and the two refusals hold on every repetition.
  for (const c of cases) assert.ok(c.expect.no_write && (!c.then || c.then.expect.no_write), c.id);
  assert.deepEqual(
    cases.filter((c) => c.must_never).map((c) => c.id),
    ["setup_leads_refused"],
  );
  // The turns whose setup reads ride in before round 1 (server/ask/cross-page.ts SETUP, as the loop plans them): a
  // request to set campaigns up in either language, on Campaigns or Today, asked again in the thread too. A reminder
  // asked for, a list with a nudge after its "and", and a change are not one, and read what they always read.
  const setupReads = (text, surface) =>
    crossPagePlan(text, surface)
      .slice(0, 2)
      .map((r) => `${r.name}.${r.input.action}`)
      .join(" ") === "campaigns.moments campaigns.lists";
  const turns = cases.flatMap((c) => [
    c,
    ...(c.then
      ? [{ id: `${c.id} (then)`, text: c.then.text, surface: secondTurn(c).surface, expect: c.then.expect }]
      : []),
  ]);
  assert.deepEqual(
    turns.filter((t) => setupReads(t.text, t.surface)).map((t) => t.id),
    [
      "setup_campaigns_first_day",
      "setup_campaigns_es",
      "setup_from_today",
      "setup_leads_refused",
      "setup_again_same_thread",
      "setup_again_same_thread (then)",
      "setup_with_calendar",
      "setup_without_calendar",
    ],
  );
  // The tools' order is noted only on a turn whose reads ride in first, and a read a case asks for off Campaigns' rows
  // is one of those reads.
  for (const t of turns.filter((x) => x.expect.tools_order)) assert.ok(setupReads(t.text, t.surface), t.id);
  for (const t of turns.filter((x) => x.expect.tools_any?.includes("campaigns.moments")))
    assert.ok(setupReads(t.text, t.surface), t.id);
  // A setup's card is never a reminder of an appointment (the setup rule: its Turn on) nor a moment no new campaign is
  // offered on; the trigger ruled out is one a campaign can have.
  const triggers = new Set(MOMENT_TRIGGERS.map((t) => t.id));
  for (const c of cases.filter((x) => x.expect.card_fields_not)) {
    const ruled = c.expect.card_fields_not.playbook.trigger;
    assert.ok(
      ["visit_tomorrow", "visited"].every((t) => ruled.includes(t)) && ruled.every((t) => triggers.has(t)),
      c.id,
    );
  }
  // A campaign on a list made in the same answer waits for a next question (A2), said in the word a person reads.
  const list = cases.find((c) => c.id === "setup_new_list_then_playbook");
  assert.deepEqual([list.expect.proposals_any, list.expect.next_any.includes("campaign")], [["list"], true]);
  // Nothing of theirs is approved between the turns (approveBetween approves a settings note alone), so a starter card
  // a run makes files nothing at Meta or anywhere.
  assert.ok(cases.every((c) => c.then?.between === undefined));
  // The change cases name the seed's own campaign (e2e-workspace.mjs WIN_BACK), a change card's fields are a change's
  // own keys, and the hour refused is under the bound the refusal says.
  // Each is asked only where the seed has been run (`needs: winback_seed`): on a workspace without it there is no
  // Win-back to change, and the case would fail whatever the model did.
  for (const c of cases.filter((x) => x.id.startsWith("change_") && x.id !== "change_leads_pause")) {
    assert.match(c.text, new RegExp(WIN_BACK.name, "i"), c.id);
    assert.ok(c.needs?.includes("winback_seed"), `${c.id} needs the Win-back's seed`);
  }
  // A change card's payload names the patch's keys, its sequence's mode as sequence_mode (its own `mode` being a pause
  // undo's: contracts playbookChangeSpec).
  const onCard = PLAYBOOK_PATCH_KEYS.map((k) => (k === "mode" ? "sequence_mode" : k));
  for (const c of cases.filter((x) => x.expect.card_fields?.playbook_change))
    for (const k of Object.keys(c.expect.card_fields.playbook_change)) assert.ok(onCard.includes(k), k);
  for (const c of cases.filter((x) => x.expect.card_fields_present?.playbook_change))
    for (const k of c.expect.card_fields_present.playbook_change) assert.ok(onCard.includes(k), k);
  const early = cases.find((c) => c.id === "change_hour_out_of_bounds");
  assert.ok(
    7 < PLAYBOOK_LIMITS.run_hour.min && early.expect.includes_any.includes(String(PLAYBOOK_LIMITS.run_hour.min)),
  );
});

test("the cases fit their workspace and name the new reads (the review after the merge, batch E): an offer's send needs a yes and a channel, the nightly's workspace asks the offer that must make neither, each new read is the model's own pick, and a change names its words, its last day and its sequence's mode", async () => {
  const { crossPagePlan } = await import("../../../apps/dashboard/src/server/ask/cross-page.ts");
  const byId = Object.fromEntries(CASES.map((c) => [c.id, c]));
  // A send of an offer (a broadcast card, the plan's or its own) needs someone's yes to offers and a channel that carries
  // one. The plan writes its message for whichever channel that is; the cover case sends the Win-back's message, which
  // is on file only after the Win-back's seed and has a WhatsApp version alone, so its channel is WhatsApp.
  const sends = CASES.filter((c) => c.expect.proposals_any?.includes("broadcast"));
  assert.deepEqual(
    sends.map((c) => [c.id, c.needs]),
    [
      ["offer_november_colour", ["offers_yes", "offers_channel"]],
      ["offer_next_month_es", ["offers_yes", "offers_channel"]],
      ["covers_propose_campaign_broadcast", ["offers_yes", "offers_whatsapp", "winback_seed"]],
    ],
  );
  // The nightly's workspace sets both aside, and asks the offer no channel there carries: no send and no campaign.
  const nightly = new Set(CASES.filter((c) => !skipFor(c, NIGHTLY)).map((c) => c.id));
  for (const c of sends) assert.ok(!nightly.has(c.id), c.id);
  const none = byId.offer_no_offers_channel;
  assert.deepEqual(none.needs, ["no_offers_channel"]);
  assert.ok(nightly.has(none.id) && none.must_never && none.expect.no_write);
  assert.deepEqual(none.expect.proposals_not, ["broadcast", "playbook"]);
  // What it looks for in the answer is said by the plan's own refusal there (PLAN_WORDS.noChannel, over the nightly's
  // closed channels: a +1 WhatsApp number and no mailbox), which names what to set up first.
  const closed = channelChoices(
    channelsReady({
      whatsapp: { canSend: true, refusal: null, number: "+12125550142" },
      textLine: null,
      email: { mailbox: false, domain: true },
    }),
    "marketing",
    "ours",
  ).filter((c) => c.channel !== "sms");
  assert.ok(closed.length === 2 && closed.every((c) => !c.ok));
  const said = PLAN_WORDS.noChannel(
    closed.map(({ channel, why }) => ({ channel, why })),
    [],
  ).toLowerCase();
  assert.ok(
    none.expect.includes_any.some((w) => said.includes(w.toLowerCase())),
    said,
  );
  // Each new read is a case's, and never one the turn reads before round 1 for its words (server/ask/cross-page.ts
  // crossPagePlan: a read made there is a tool the turn used), so the case grades the model's own pick. The book's room
  // is read where a calendar is connected.
  for (const read of NEW_READS) {
    const asking = CASES.filter((c) => c.expect.tools_any?.includes(read));
    assert.ok(asking.length >= 1, read);
    for (const c of asking) {
      const before = crossPagePlan(c.text, c.surface).map((r) => `${r.name}.${r.input.action}`);
      assert.ok(!before.includes(read), `${c.id}: ${before.join(" ")}`);
      assert.ok(c.expect.no_write && !c.expect.on_page, c.id);
    }
  }
  assert.deepEqual(CASES.find((c) => c.expect.tools_any?.includes("calendar.room")).needs, ["calendar"]);
  // A change's three new fields (00416), each asked of the seed's Win-back through action change. The seed's message
  // takes no values (e2e-workspace.mjs convergeWinBack), so new words for it are refused in the door's own words
  // ("This saved message takes no values."): that case grades the pick alone, and the last day and the mode grade the card.
  const expect = (id) => byId[id].expect;
  // New words for the Win-back are a new message and the step moved onto it (a plan's two cards: sequences' words
  // action, 0060), since its message takes no values and a change of them is refused (the eval-truth pass, 17 Oct 2026).
  assert.deepEqual(
    [expect("change_words").tools_any, expect("change_words").proposals_any],
    [undefined, ["sequence_words", "playbook_change"]],
  );
  for (const [id, field] of [
    ["change_last_day", "until"],
    // Its sequence's mode (00462, decision 0064), where its trial was: the card names it as sequence_mode.
    ["change_hold_each_batch", "sequence_mode"],
  ])
    assert.deepEqual(
      [expect(id).tools_any, expect(id).proposals_any, expect(id).card_fields_present],
      [["propose_campaign.change"], ["playbook_change"], { playbook_change: [field] }],
      id,
    );
  // A case's days are said relative to the day it is asked ("next month"), never as a month or a date: an offer that
  // starts on a day past is refused (contracts plan.ts offerDates, before its channels), and so is a change's last day
  // (core untilOf), so a dated case would fail by construction once its day had passed. ("May" is English's verb too.)
  const dated =
    /\b(?:january|february|march|april|june|july|august|september|october|november|december|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\b|\b\d{4}-\d{2}-\d{2}\b/i;
  for (const c of CASES) for (const t of [c.text, c.then?.text]) assert.ok(!dated.test(t ?? ""), `${c.id}: ${t}`);
});

test("the case set: every surface has an on-page case, an off-page read and a decline; the focus, the scope and the foreign row", () => {
  for (const s of SURFACES) {
    const on = CASES.filter((c) => c.surface === s);
    assert.ok(
      on.some((c) => c.expect.on_page || /_empty$/.test(c.id)),
      `${s}: a case the page answers, or an empty page said as one`,
    );
    assert.ok(
      on.some((c) => !c.expect.on_page && c.expect.tools_any?.length),
      `${s}: a case that needs a read off the page`,
    );
    assert.ok(
      on.some((c) => c.must_never && c.expect.no_write),
      `${s}: a decline, held on every repetition`,
    );
  }
  // Calendar, Campaigns and the Pipeline are empty on the nightly's workspace (D16): what they say is graded.
  for (const s of ["calendar", "campaigns", "pipeline"]) {
    const empty = CASES.find((c) => c.surface === s && /_empty$/.test(c.id));
    assert.ok(empty?.expect.includes_any?.length && empty.expect.excludes?.length, `${s} grades how empty is said`);
  }
  for (const s of ["inbox", "people"])
    assert.ok(
      CASES.some((c) => c.surface === s && typeof c.context?.focus === "string" && c.expect.names_focus),
      `${s}: a row named by its place`,
    );
  const scoped = CASES.find((c) => /<row:\d+>/.test(c.context?.route ?? ""));
  assert.ok(scoped, "a case asked on a row its route opens");
  assert.ok(resolveContext(scoped.context, ANSWERS).scope, "and it carries that row as its scope");
  const foreign = CASES.filter((c) => c.expect.never_cites?.length);
  assert.ok(foreign.length >= 1 && foreign.every((c) => c.must_never));
  for (const c of foreign) {
    const { context } = resolveContext(c.context, ANSWERS);
    for (const id of c.expect.never_cites) {
      assert.ok(
        context.rows.some((r) => r.id === id),
        `${c.id}: the page names the foreign row`,
      );
      assert.ok(!JSON.stringify(ANSWERS).includes(id), `${c.id}: a row the workspace does not hold`);
    }
  }
});

test("the announcement counts turns: a case of two is two, each on its own surface, and a warm only where a page is sent again", () => {
  const settingsPage = { surface: "settings", route: "admin", view: "workspace" };
  const cases = [
    { id: "a", surface: "today", text: "a", expect: {} },
    { ...TWO_TURNS, then: { ...TWO_TURNS.then, context: { ...PEOPLE_PAGE, focus: "2" } } },
    {
      id: "c",
      surface: "settings",
      text: "remember that …",
      context: settingsPage,
      expect: { proposals_any: ["settings"] },
      then: { text: "where can people park?", between: "approve", expect: {} },
    },
    {
      id: "d",
      surface: "people",
      text: "d",
      context: PEOPLE_PAGE,
      expect: {},
      then: { text: "e", context: null, surface: "today", expect: {} },
    },
  ];
  assert.equal(
    announcement(cases, 3, 0.012),
    [
      "  today: 1 case(s), 2 turn(s) × 3 = 6 turns ≈ $0.07",
      "  people: 2 case(s), 3 turn(s) (3 with the page) × 3 = 9 turns ≈ $0.11",
      "  settings: 1 case(s), 2 turn(s) (2 with the page) × 3 = 6 turns ≈ $0.07",
      "4 cases, 7 turns × 3 = 21 turns ≈ $0.25 at $0.012 a turn, as measured (eval-ask.mjs PER_TURN), and 9 warms (POST ask/warm, no model); 3 settings note(s) approved between the turns and put back",
      "",
    ].join("\n"),
  );
  assert.equal(
    describeSecondTurn(cases[1]),
    "    then · people · #/clients · GET contacts:40 · focus 2\n      open the second",
  );
  assert.equal(
    describeSecondTurn(cases[2]),
    "    then · settings · between: approve · the same page\n      where can people park?",
  );
  assert.equal(describeSecondTurn(cases[3]), "    then · today · no page\n      e");
  assert.equal(describeSecondTurn(cases[0]), "");
});

test("--list says every case and its second turn, its page, the turns and their cost, with no credentials, and spends nothing", () => {
  const env = { ...process.env, REPS: "3" };
  for (const k of [
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "E2E_USER_EMAIL",
    "EVAL_WORKSPACE_HAS",
  ])
    delete env[k];
  const run = spawnSync(process.execPath, ["tooling/scripts/eval-ask.mjs", "--list"], {
    cwd: ROOT,
    env,
    encoding: "utf8",
  });
  assert.equal(run.status, 0, run.stderr);
  for (const c of CASES) assert.ok(run.stdout.includes(`${c.id} · ${c.surface ?? "today"}`), c.id);
  // A turn is a turn: a case of two turns is two, each priced at what a turn cost (PER_TURN). A workspace that names
  // nothing it holds runs only the cases that need nothing of it, by the runner's own reading of a case's needs.
  const ran = CASES.filter((c) => !skipFor(c, []));
  assert.ok(ran.length < CASES.length && ran.every((c) => !c.needs?.length));
  const n = ran.length;
  const turns = ran.reduce((k, c) => k + 1 + (c.then ? 1 : 0), 0);
  assert.ok(
    run.stdout.includes(`${n} cases, ${turns} turns × 3 = ${turns * 3} turns ≈ $${(turns * 3 * 0.15).toFixed(2)}`),
    run.stdout.slice(-600),
  );
  assert.match(run.stdout, /\n {2}inbox: 7 case\(s\), 8 turn\(s\) \(8 with the page\) × 3 = 24 turns/);
  // Each two-turn case's own block: its words, then its second turn's two lines, under its own id line.
  const listed = run.stdout.split("\n");
  for (const c of CASES.filter((x) => x.then)) {
    const at = listed.findIndex((l) => l.startsWith(`${c.id} · `));
    assert.ok(at >= 0, c.id);
    assert.deepEqual(listed.slice(at + 1, at + 4), [`    ${c.text}`, ...describeSecondTurn(c).split("\n")], c.id);
  }
  // A second turn on its own lines under its case, with what happens between the turns named.
  assert.ok(
    run.stdout.includes(
      "approve_between_settings · settings · #/admin (workspace) · no rows\n" +
        "    remember that there is a bike rack by the side door, and the receptionist should tell people who ask where to leave a bike\n" +
        "    then · settings · between: approve · the same page\n" +
        "      where can people leave their bikes?\n",
    ),
  );
  assert.match(run.stdout, /Nothing was read or spent/);
  // The same words the run announces before its first turn.
  assert.ok(
    run.stdout.includes(
      announcement(
        ran.map((c) => ({ ...c, surface: c.surface ?? "today" })),
        3,
        0.15,
      ),
    ),
  );
});

test("a setup's keys (the moment spec, A8): proposals_max fails more cards, card_fields_not a field the words ruled out, next_any a next question that says none of the words; tools_order is a note, never a fail", () => {
  const card = (kind, payload) => ({ id: "p", kind, title: "t", summary: "s", payload });
  const m = (over = {}) => ({ text: "", proposals: [], tools: [], answer: { do: { next: [] } }, ...over });
  assert.deepEqual(
    setupCardsFails({ proposals_max: 2 }, m({ proposals: [card("playbook", {}), card("playbook", {})] })),
    [],
  );
  assert.match(
    setupCardsFails({ proposals_max: 1 }, m({ proposals: [card("playbook", {}), card("playbook", {})] }))[0],
    /2 cards/,
  );
  // Several asks in one message: a card of every kind named, none dropped (the operator's stress run, 15 Oct 2026).
  const three = { proposals_all: ["person_mode", "note", "list"] };
  assert.deepEqual(
    setupCardsFails(three, m({ proposals: [card("note", {}), card("person_mode", {}), card("list", {})] })),
    [],
  );
  assert.deepEqual(setupCardsFails(three, m({ proposals: [card("note", {}), card("person_mode", {})] })), [
    'no list card among ["note","person_mode"]',
  ]);
  const ruled = { card_fields_not: { playbook: { trigger: ["visit_tomorrow", "visited"] } } };
  assert.deepEqual(setupCardsFails(ruled, m({ proposals: [card("playbook", { trigger: "quiet_30" })] })), []);
  assert.match(
    setupCardsFails(ruled, m({ proposals: [card("playbook", { trigger: "visited" })] }))[0],
    /trigger "visited"/,
  );
  // A card of another kind is never judged by a playbook's ruled-out fields.
  assert.deepEqual(setupCardsFails(ruled, m({ proposals: [card("list", { trigger: "visited" })] })), []);
  const next = { next_any: ["nudge", "once the list"] };
  assert.deepEqual(setupCardsFails(next, m({ answer: { do: { next: ["Start the nudge on the new list"] } } })), []);
  assert.match(setupCardsFails(next, m({ answer: { do: { next: ["What else?"] } } }))[0], /no next question/);
  // An answer made before the Line says its next questions as followups.
  assert.deepEqual(setupCardsFails(next, { text: "", followups: ["Once the list is saved, start it?"] }), []);
  assert.deepEqual(setupCardsFails({}, m()), [], "a case with none of the keys asks nothing of the cards");
  const order = { tools_order: ["campaigns.moments", "propose_campaign.moment"] };
  assert.deepEqual(
    toolsOrderNote(order, m({ tools: ["campaigns.moments", "campaigns.lists", "propose_campaign.moment"] })),
    [],
  );
  assert.match(
    toolsOrderNote(order, m({ tools: ["propose_campaign.moment", "campaigns.moments"] }))[0],
    /not in the order/,
  );
  // The names are read through the rename table on both sides, as the judge reads tools_any.
  assert.deepEqual(
    toolsOrderNote({ tools_order: ["list_playbooks", "propose_playbook"] }, m({ tools: order.tools_order })),
    [],
  );
  assert.deepEqual(toolsOrderNote({}, m()), []);
});

test("card_fields_absent (the marketing manager's cases): a card of the kind holding anything at a path, dotted into its payload, fails; null holds nothing, and a card of another kind is never judged", () => {
  const card = (kind, payload) => ({ id: "p", kind, title: "t", summary: "s", payload });
  const m = (...proposals) => ({ text: "", proposals, tools: [], answer: { do: { next: [] } } });
  const absent = { card_fields_absent: { message: ["template_id", "versions.sms"] } };
  const written = {
    name: "Win-back",
    language: "es",
    versions: { email: { subject: "Vuelve", body: "Te esperamos" } },
  };
  assert.deepEqual(setupCardsFails(absent, m(card("message", written))), []);
  const texted = { ...written, versions: { ...written.versions, sms: { body: "10% off" } } };
  assert.deepEqual(setupCardsFails(absent, m(card("message", texted))), [
    "a message card holding versions.sms, which the words ruled out",
  ]);
  assert.match(setupCardsFails(absent, m(card("message", { ...written, template_id: "@step:1" })))[0], /template_id/);
  assert.deepEqual(setupCardsFails(absent, m(card("message", { ...written, versions: { sms: null } }))), []);
  assert.deepEqual(setupCardsFails(absent, m(card("broadcast", { template_id: "x", versions: { sms: {} } }))), []);
});

test("card_text_excludes (the offer-words eval, 16 Oct 2026): a card of the kind whose payload says any of the words, in any case, fails; a card of another kind is never judged, and the offer cases hold it", () => {
  const card = (kind, payload) => ({ id: "p", kind, title: "t", summary: "s", payload });
  const m = (...proposals) => ({ text: "", proposals, tools: [], answer: { do: { next: [] } } });
  const e = { card_text_excludes: { broadcast: ["next month", "el mes que viene", "I want to offer"] } };
  const send = (line) => card("broadcast", { template_id: "x", params: ["@first_name", "@business_name", line] });
  assert.deepEqual(setupCardsFails(e, m(send("10% off colour all November."))), []);
  assert.deepEqual(setupCardsFails(e, m(send("10% off colour all Next Month."))), [
    "a broadcast card that says “next month”, which the words ruled out",
  ]);
  assert.match(setupCardsFails(e, m(send("10% de descuento todo el mes que viene.")))[0], /el mes que viene/);
  assert.deepEqual(setupCardsFails(e, m(card("message", { body: "next month" }))), []);
  for (const id of ["offer_november_colour", "offer_next_month_es"])
    assert.ok(CASES.find((c) => c.id === id)?.expect.card_text_excludes?.broadcast?.length, id);
});

test("needs (a case's workspace): a case needing what EVAL_WORKSPACE_HAS does not hold is said as skipped and never asked, so never failed; one whose needs it holds runs, and so does one with none", () => {
  assert.equal(skipFor({ id: "a", needs: ["calendar", "live_call"] }, ["calendar"]), "skip a (needs live_call)");
  assert.equal(skipFor({ id: "b", needs: ["calendar"] }, ["calendar"]), null);
  assert.equal(skipFor({ id: "c" }, []), null);
  const one = (id, needs) => ({ id, text: id, surface: "today", expect: { no_write: true }, ...(needs && { needs }) });
  assert.deepEqual(pageProblems([one("d", ["a_calendar"])]), ['d: needs "a_calendar", which no workspace token names']);
  // The runner itself: the skipped case is said and left out of the turns it announces; the others are listed to run.
  const file = path.join(os.tmpdir(), `eval-ask-needs-${process.pid}.json`);
  writeFileSync(file, JSON.stringify([one("a", ["live_call"]), one("b", ["calendar"]), one("c")]));
  try {
    const env = { ...process.env, EVAL_WORKSPACE_HAS: "calendar" };
    const run = spawnSync(process.execPath, ["tooling/scripts/eval-ask.mjs", "--list", file], {
      cwd: ROOT,
      env,
      encoding: "utf8",
    });
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /^skip a \(needs live_call\)$/m);
    assert.match(run.stdout, /^b · today · needs calendar$/m);
    assert.match(run.stdout, /^2 cases, 2 turns /m);
  } finally {
    rmSync(file, { force: true });
  }
});

test("needs, a channel an offer can go by: offers_channel (one channelChoices opens to an offer), offers_whatsapp (WhatsApp among them) and no_offers_channel (none) are tokens a case may name, as calendar and no_calendar are, and so is no_offers_yes (nobody's yes to offers); the runner lists and skips by them", () => {
  const one = (id, needs) => ({ id, text: id, surface: "today", expect: { no_write: true }, needs });
  assert.deepEqual(
    pageProblems([
      one("offer", ["offers_yes", "offers_channel"]),
      one("send", ["offers_yes", "offers_whatsapp"]),
      one("none", ["no_offers_channel"]),
      one("decline", ["no_offers_yes"]),
    ]),
    [],
  );
  assert.equal(
    skipFor(one("offer", ["offers_yes", "offers_channel"]), NIGHTLY),
    "skip offer (needs offers_yes, offers_channel)",
  );
  assert.equal(skipFor(one("none", ["no_offers_channel"]), NIGHTLY), null);
  // A decline that rests on nobody's yes runs where nobody said yes, and is skipped where the offer cases run: there a
  // send to everyone is rightly answered with a card, so the decline would fail by construction.
  const decline = CASES.find((c) => c.id === "campaigns_decline");
  assert.equal(skipFor(decline, NIGHTLY), null);
  assert.equal(skipFor(decline, ["offers_yes", "offers_channel"]), "skip campaigns_decline (needs no_offers_yes)");
  // What each names, by the plan's own rule: a +1 WhatsApp number (Meta's pause on offers to US numbers) and no mailbox
  // open nothing, the nightly's workspace (no_offers_channel); a number outside +1 opens WhatsApp (offers_whatsapp).
  const ready = (number) =>
    channelsReady({
      whatsapp: { canSend: true, refusal: null, number },
      textLine: null,
      email: { mailbox: false, domain: true },
    });
  assert.deepEqual(offerChannels(ready("+12125550142")), []);
  assert.deepEqual(
    offerChannels(ready("+525550100142")).map((c) => c.channel),
    ["whatsapp"],
  );
  // The runner itself, as the nightly's workspace runs it: the offer said as skipped, the ones that name none listed.
  const file = path.join(os.tmpdir(), `eval-ask-offers-${process.pid}.json`);
  writeFileSync(
    file,
    JSON.stringify([
      one("offer", ["offers_yes", "offers_channel"]),
      one("none", ["no_offers_channel"]),
      one("decline", ["no_offers_yes"]),
    ]),
  );
  try {
    const env = { ...process.env, EVAL_WORKSPACE_HAS: NIGHTLY.join(",") };
    const run = spawnSync(process.execPath, ["tooling/scripts/eval-ask.mjs", "--list", file], {
      cwd: ROOT,
      env,
      encoding: "utf8",
    });
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /^skip offer \(needs offers_yes, offers_channel\)$/m);
    assert.match(run.stdout, /^none · today · needs no_offers_channel$/m);
    assert.match(run.stdout, /^decline · today · needs no_offers_yes$/m);
    assert.match(run.stdout, /^2 cases, 2 turns /m);
  } finally {
    rmSync(file, { force: true });
  }
});

test("card_fields_present and proposals_not (the review after the merge, batch E): a card of the kind holding nothing at a path the words named fails, null holding nothing; a card of a kind the words ruled out fails, whatever it holds", () => {
  const card = (kind, payload) => ({ id: "p", kind, title: "t", summary: "s", payload });
  const m = (...proposals) => ({ text: "", proposals, tools: [], answer: { do: { next: [] } } });
  const named = { card_fields_present: { playbook_change: ["until"] } };
  assert.deepEqual(setupCardsFails(named, m(card("playbook_change", { playbook_id: "x", until: "2026-11-30" }))), []);
  assert.deepEqual(setupCardsFails(named, m(card("playbook_change", { playbook_id: "x", name: "Past clients" }))), [
    "a playbook_change card holding nothing at until, which the words named",
  ]);
  assert.match(setupCardsFails(named, m(card("playbook_change", { until: null })))[0], /nothing at until/);
  const dotted = { card_fields_present: { message: ["versions.email.body"] } };
  assert.deepEqual(setupCardsFails(dotted, m(card("message", { versions: { email: { body: "15% off" } } }))), []);
  assert.match(setupCardsFails(dotted, m(card("message", { versions: { whatsapp: {} } })))[0], /versions\.email\.body/);
  // A card of another kind is never judged by it, and that a card of the kind was made at all is proposals_any's.
  assert.deepEqual(setupCardsFails(named, m(card("playbook", {}))), []);
  assert.deepEqual(setupCardsFails(named, m()), []);
  const barred = { proposals_not: ["broadcast", "playbook"] };
  assert.deepEqual(setupCardsFails(barred, m(card("message", {}), card("settings", {}))), []);
  assert.deepEqual(setupCardsFails(barred, m(card("message", {}), card("broadcast", {}), card("broadcast", {}))), [
    "a broadcast card, which the words ruled out",
  ]);
  assert.deepEqual(setupCardsFails(barred, m(card("playbook", {}), card("broadcast", {}))), [
    "a playbook/broadcast card, which the words ruled out",
  ]);
});

test("card_fields_each (the effort sweep, 15 Oct 2026): every value named at a path is held by a card of the kind; a message asked for in Spanish too beside an English one the Library holds is the Spanish card alone (2 Nov 2026)", () => {
  const card = (kind, payload) => ({ id: "p", kind, title: "t", summary: "s", payload });
  const m = (...proposals) => ({ text: "", proposals, tools: [], answer: { do: { next: [] } } });
  const both = { card_fields_each: { message: { language: ["en_US", "es"] } } };
  assert.deepEqual(
    setupCardsFails(both, m(card("message", { language: "es" }), card("message", { language: "en_US" }))),
    [],
  );
  assert.deepEqual(setupCardsFails(both, m(card("message", { language: "es" }))), [
    "no message card holding language “en_US”, which the words asked for",
  ]);
  // A value held by a card of another kind is not the kind's, and none at all fails each value.
  assert.equal(
    setupCardsFails(both, m(card("playbook", { language: "en_US" }), card("message", { language: "es" }))).length,
    1,
  );
  assert.equal(setupCardsFails(both, m()).length, 2);
  // A dotted path reads into the payload as card_fields_absent's does.
  const dotted = { card_fields_each: { message: { "versions.whatsapp.body": ["Hola"] } } };
  assert.deepEqual(setupCardsFails(dotted, m(card("message", { versions: { whatsapp: { body: "Hola" } } }))), []);
  // The case it was made for asks for the Spanish message alone: the Library holds the English win-back (2 Nov 2026).
  const spanishToo = CASES.find((c) => c.id === "write_winback_spanish");
  assert.deepEqual(spanishToo.expect.card_fields_each, { message: { language: ["es"] } });
});

test("X5-4's eval: the first thread turn 1 names is snoozed, turn 2 asked with it, and the thread woken and read again", async () => {
  assert.deepEqual(firstThreadNamed(needsMe), { id: DANA.id, who: "Dana Example" }, "the first row its answer shows");
  assert.equal(firstThreadNamed(final({ text: "Nobody." })), null);
  const d = threadDoor();
  let asked = null;
  const r = await snoozeThenAsk(d.io, needsMe, async (snooze) => {
    asked = { snooze, state: d.s.state };
    return "turn 2";
  });
  assert.deepEqual(asked, { snooze: { id: DANA.id, who: "Dana Example", was: "needs_human" }, state: "snoozed" });
  assert.deepEqual([r.why, r.second, r.stop, r.back], [null, "turn 2", false, { ok: true, woken: true }]);
  assert.deepEqual(d.keys(), [READ, SNOOZE, READ, WAKE, READ], "read, snoozed, then read, woken and read again");
  assert.equal(
    new Date(d.s.calls[1].body.until).getTime(),
    1000 + 2 * 3600 * 1000,
    "snoozed past the turn, by the run's clock",
  );
  assert.equal(d.s.state, "open", "woken");
});

test("X5-4's eval: a thread that is not open or waiting is not snoozed; a refused snooze is not woken; a failed one is woken when it landed", async () => {
  const archived = threadDoor({ state: "archived" });
  const a = await snoozeThenAsk(archived.io, needsMe, async () => assert.fail("turn 2 is not asked"));
  assert.match(a.why, /is archived, which a snooze does not move/);
  assert.deepEqual(archived.keys(), [READ], "read, and nothing written");
  const refused = threadDoor({ hold: { [SNOOZE]: [{ status: 409, message: "This thread is already snoozed." }] } });
  const b = await snoozeThenAsk(refused.io, needsMe, async () => assert.fail("turn 2 is not asked"));
  assert.match(b.why, /409: This thread is already snoozed/);
  assert.deepEqual(refused.keys(), [READ, SNOOZE], "a refusal wrote nothing, so nothing is woken");
  // The server failed, but the snooze landed: it reads snoozed, so it is woken all the same.
  const landed = threadDoor({
    hold: { [SNOOZE]: [{ status: 500, message: "upstream", then: (s) => (s.state = "snoozed") }] },
  });
  const c = await snoozeThenAsk(landed.io, needsMe, async () => assert.fail("turn 2 is not asked"));
  assert.deepEqual([c.back, landed.s.state], [{ ok: true, woken: true }, "open"]);
  // It failed and did not land: read, and nothing to wake.
  const missed = threadDoor({ hold: { [SNOOZE]: [{ status: 500, message: "upstream" }] } });
  const e = await snoozeThenAsk(missed.io, needsMe, async () => assert.fail("turn 2 is not asked"));
  assert.deepEqual(e.back, { ok: true, woken: false });
  assert.deepEqual(missed.keys(), [READ, SNOOZE, READ]);
});

test("X5-4's eval: the thread is woken whatever turn 2 did, and a thread that cannot be woken stops the run with what to do by hand", async () => {
  const t = threadDoor();
  const thrown = await snoozeThenAsk(t.io, needsMe, async () => {
    throw new Error("turn 2 blew up");
  });
  assert.equal(thrown.error.message, "turn 2 blew up");
  assert.deepEqual([thrown.back, t.s.state], [{ ok: true, woken: true }, "open"], "woken in the finally");
  const stuck = threadDoor({ hold: { [WAKE]: [{ status: 500, message: "upstream" }] } });
  const r = await snoozeThenAsk(stuck.io, needsMe, async () => "turn 2");
  assert.deepEqual(
    [r.back.ok, r.back.why, r.back.byHand, r.stop],
    [false, "POST wake 500: upstream", { id: DANA.id, who: "Dana Example", was: "needs_human" }, true],
  );
  const stopped = threadDoor();
  const s = await snoozeThenAsk(
    stopped.io,
    needsMe,
    async () => assert.fail("not asked"),
    () => true,
  );
  assert.deepEqual([s.why, s.stop, stopped.keys()], ["the run was stopped before it", true, []], "nothing written");
});

test("X5-4's eval: turn 2's headline does not say who the snoozed thread is with, and the case reads again and says so", () => {
  const snoozed = { id: DANA.id, who: "Dana Example", was: "needs_human" };
  const fresh = final({ text: "Rio Example needs you.", items: [{ source: RIO }] });
  assert.deepEqual(omitsSnoozed(fresh, snoozed), []);
  assert.deepEqual(omitsSnoozed(needsMe, snoozed), [
    "the answer's headline still says Dana, whose thread was snoozed between the turns",
  ]);
  // REGRESSION (the first runs, 15 Oct): the snooze heard, said in the detail and as a row that says it no longer needs
  // you, with the thread's one Open, passes. Today's recap keeps the reply that failed to deliver; the headline may not
  // name it.
  const heard = {
    ...fresh,
    text: "No one needs you right now. Dana Example is no longer on the needs-you list.",
    citations: [],
    answer: {
      v: 2,
      form: "structured",
      say: { headline: "No one needs you right now.", detail: "Dana Example is no longer on the needs-you list." },
      show: {
        figures: [],
        items: [
          {
            title: "Dana Example",
            meta: "WhatsApp",
            line: "No longer needs you, but a reply failed to deliver earlier.",
            source: { kind: "thread", id: DANA.id, label: "Dana Example", to: `inbox/th-${DANA.id}` },
          },
        ],
        breakdown: null,
      },
      do: { open: { to: `inbox/th-${DANA.id}`, label: "Open the thread", now: false }, next: [] },
      language: "en",
    },
  };
  assert.deepEqual(omitsSnoozed(heard, snoozed), []);
  const headlined = { ...heard, answer: { ...heard.answer, say: { headline: "Dana Example needs you.", detail: "" } } };
  assert.deepEqual(omitsSnoozed(headlined, snoozed), [
    "the answer's headline still says Dana, whose thread was snoozed between the turns",
  ]);
  assert.deepEqual(
    omitsSnoozed(final({ text: "Danae Example needs you." }), snoozed),
    [],
    "a whole word, never inside another",
  );
  assert.deepEqual(omitsSnoozed(fresh, null), ["nothing was snoozed between the turns to look for"]);
  const t1 = { threadId: U(70), snoozed };
  assert.deepEqual(followUpFails({ omits_snoozed: true }, { threadId: U(70), final: fresh }, t1), []);
  // The case is written as the runner asks it: it needs an escalated thread, reads again, and is judged by omits_snoozed.
  const base = { id: "s", text: "who needs me right now?", surface: "today", expect: {} };
  const then = { text: "and now?", between: "snooze", expect: { omits_snoozed: true, tools_any: ["today"] } };
  assert.deepEqual(pageProblems([{ ...base, needs: ["escalated_thread"], then }]), []);
  assert.deepEqual(pageProblems([{ ...base, then: { ...then, expect: {} } }]), [
    's: between: "snooze" snoozes a thread an open escalation flags: the case needs "escalated_thread"',
    's: between: "snooze" is judged by then.expect.omits_snoozed',
    's: between: "snooze" reads again: then.expect.tools_any names the reads',
  ]);
  const listed = CASES.find((c) => c.id === "needs_me_after_a_snooze");
  assert.deepEqual([listed.then.between, listed.needs], ["snooze", ["escalated_thread"]], "the case the runner asks");
  assert.match(announcement([listed], 2, 0.01), /2 thread\(s\) snoozed between the turns and woken/);
  assert.equal(
    skipFor(listed, ["no_calendar"]),
    "skip needs_me_after_a_snooze (needs escalated_thread)",
    "never on the nightly's workspace",
  );
});

test("the shape asked for, judged on what the Line draws: a list's style, size, words and emoji, a numbered list of rows as the items, a length, capitals, and never a word spent on the format", () => {
  const m = (show = {}, say = { headline: "Three rules.", detail: "" }, text = "") => ({
    text,
    answer: {
      form: "structured",
      say,
      show: { figures: [], items: [], breakdown: null, list: { style: "bullets", entries: [] }, ...show },
    },
  });
  const listed = (style, entries) => m({ list: { style, entries } });
  assert.deepEqual(shapeAskedFails({ list: { style: "bullets", min: 2 } }, listed("bullets", ["a", "b"])), []);
  assert.match(shapeAskedFails({ list: { style: "bullets", min: 2 } }, listed("bullets", ["a"]))[0], /at least 2/);
  assert.match(shapeAskedFails({ list: { style: "numbers" } }, listed("bullets", ["a", "b"]))[0], /asked as numbers/);
  assert.match(shapeAskedFails({ list: { count: 3 } }, listed("bullets", ["a", "b"]))[0], /exactly 3/);
  const words = { list: { style: "lines", entries: ["thanks", "for", "coming", "in"] } };
  assert.deepEqual(
    shapeAskedFails(words, listed("lines", ["Thanks", "for", "coming", "in."])),
    [],
    "case and stops aside",
  );
  assert.match(shapeAskedFails(words, listed("lines", ["thanks for coming in"]))[0], /were asked/);
  assert.deepEqual(shapeAskedFails({ list: { emoji: true } }, listed("bullets", ["🚫 Prices", "📅 Bookings"])), []);
  assert.match(shapeAskedFails({ list: { emoji: true } }, listed("bullets", ["🚫 Prices", "Bookings"]))[0], /emoji/);
  // A numbered list of rows is the items, numbered by the list's style with no entries; one row asks for no style.
  const item = {
    title: "Ana",
    meta: "",
    line: "",
    source: { kind: "thread", id: "x", label: "Ana", to: "inbox/th-x" },
  };
  const rows = { list: { style: "numbers", rows: true } };
  assert.deepEqual(shapeAskedFails(rows, m({ items: [item, item], list: { style: "numbers", entries: [] } })), []);
  assert.match(shapeAskedFails(rows, m({ items: [item, item] }))[0], /drawn as bullets/);
  assert.deepEqual(shapeAskedFails(rows, m({ items: [item] })), []);
  // A length: one word is the headline alone.
  const word = { headline_words: 1, detail_empty: true, list_empty: true };
  assert.deepEqual(shapeAskedFails(word, m({}, { headline: "No.", detail: "" })), []);
  assert.equal(shapeAskedFails(word, m({}, { headline: "No, it never does.", detail: "It says it." })).length, 2);
  assert.deepEqual(shapeAskedFails({ all_caps: true }, m({}, { headline: "ANA NEEDS YOU, 2 DAYS.", detail: "" })), []);
  assert.match(shapeAskedFails({ all_caps: true }, m({}, { headline: "ANA needs you.", detail: "" }))[0], /lower case/);
  // The probe's own apologies (15 Oct, production), in both languages, each a fail; a plain answer is none.
  for (const said of [
    "I can't use bullet points here, so I've put it in plain sentences.",
    "The page can't show a numbered list.",
    "I couldn't put each word on its own line because this answer has to fit the app's fixed format.",
    "Answers here are plain text only.",
    "No puedo usar viñetas aquí.",
  ])
    assert.equal(shapeAskedFails({ no_format_apology: true }, m({}, undefined, said)).length, 1, said);
  assert.deepEqual(
    shapeAskedFails({ no_format_apology: true }, m({}, undefined, "Ana can't come on Friday; she asked for Saturday.")),
    [],
  );
  assert.match(shapeAskedFails({ list: { min: 1 } }, { text: "x", answer: { form: "prose" } })[0], /has none/);
  assert.deepEqual(shapeAskedFails({}, { text: "" }), [], "a case that asks for no shape is not judged on one");
});

test("the preview against the answer it led to: a line the preview drew and the answer lost fails; any other move is a note; a taken-back or failed turn is not judged", () => {
  const m = (headline, detail, failed = false) => ({ failed, answer: { say: { headline, detail } } });
  const say = (headline, detail) => ({ t: "say", headline, detail });
  assert.deepEqual(
    previewJudged([say("Two", ""), say("Two steps.", "Open.\nPaste.")], m("Two steps.", "Open.\nPaste.")),
    {
      fails: [],
      notes: [],
    },
  );
  // 15 Oct's bug: the preview drew two lines, the final folded them into one.
  assert.match(
    previewJudged([say("Two steps.", "Open.\nPaste.")], m("Two steps.", "Open. Paste.")).fails[0],
    /2 lines/,
  );
  assert.equal(previewJudged([say("Two steps.", "Open.")], m("Three steps.", "Open.")).notes.length, 1);
  // A preview the final grew from is no move: the last words wait their 50 ms and land with the final.
  assert.deepEqual(previewJudged([say("Robin Example", "")], m("Robin Example asked for Tuesday.", "")), {
    fails: [],
    notes: [],
  });
  assert.deepEqual(previewJudged([say("Two", ""), say("", "")], m("Other.", "")), { fails: [], notes: [] });
  assert.deepEqual(previewJudged([say("Two", "a\nb")], m("Failed.", "", true)), { fails: [], notes: [] });
  assert.deepEqual(previewJudged([], m("No preview.", "")), { fails: [], notes: [] });
});

test("the detail's formatting, judged on the blocks the Line draws: a table, bold, a heading, nested points, numbered steps, plain words with no structure, a length; and a list written in the detail is a list", () => {
  const a = (detail, entries = []) => ({
    form: "structured",
    say: { headline: "Two need you.", detail },
    show: { figures: [], items: [], breakdown: null, list: { style: "bullets", entries } },
  });
  const rich = a(
    "### Today\n1. Answer **Ana**\n  - she waited 3 days\n2. Then Sam\n\n| Who | Days |\n|---|---|\n| Ana | 3 |",
  );
  assert.deepEqual(detailShapeFails({ detail_shape: ["table", "bold", "heading", "nested", "numbered"] }, rich), []);
  assert.match(detailShapeFails({ detail_shape: ["table"] }, a("No table here."))[0], /no table/);
  assert.deepEqual(
    detailShapeFails({ detail_shape: ["bold"] }, a("", ["call **Sam**"])),
    [],
    "bold in an entry counts",
  );
  assert.deepEqual(
    detailShapeFails({ detail_shape: "plain" }, a("Open **Settings › Business**.")),
    [],
    "bold is plain",
  );
  assert.match(detailShapeFails({ detail_shape: "plain" }, rich)[0], /table, heading, a list/);
  assert.match(detailShapeFails({ detail_max_words: 3 }, a("one two three four"))[0], /4 words, where at most 3/);
  // The widest table a column fits (18 Oct 2026): every table's columns, its header's cells; none is no table to judge.
  const wide = a("| Channel | In | Answered | Booked |\n|---|---|---|---|\n| WhatsApp | 7 | 6 | 2 |");
  assert.match(
    detailShapeFails({ table_cols_max: 3 }, wide)[0],
    /a table of 4 columns, where the column it is drawn in fits 3/,
  );
  assert.deepEqual(detailShapeFails({ table_cols_max: 4 }, wide), []);
  assert.deepEqual(detailShapeFails({ table_cols_max: 3 }, a("- WhatsApp: 7 in, 6 answered")), [], "a list, no table");
  assert.match(shapeAskedFails({ table_cols_max: 3 }, { answer: wide })[0], /4 columns/, "a shape the judge reads");
  const m = { answer: a("Do this:\n1. Open the Calendar.\n2. Paste the link.") };
  assert.deepEqual(shapeAskedFails({ list: { style: "numbers", min: 2 } }, m), [], "numbered steps in the detail");
  assert.match(shapeAskedFails({ list: { style: "bullets" } }, m)[0], /asked as bullets, drawn as numbers/);
});
