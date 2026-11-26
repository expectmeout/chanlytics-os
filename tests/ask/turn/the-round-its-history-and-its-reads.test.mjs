/**
 * The round and what it is asked with: the Reach-outs section, another page's rows read first, the history folded and
 * capped at twelve turns, the stream gathered with thinking whole, and every read and proposal builder run against the
 * database in memory.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CAMPAIGNS_QUIET as SALON_QUIET_SENDS,
  QUIET as SALON_QUIET,
  SERIES as SALON_WINDOW,
} from "../../reports/campaigns/_campaign-world.mjs";
import { clockStamp, EVERYONE_LABEL, toReachOutLensVM } from "@chanlytics/contracts";
import {
  A,
  C1,
  C2,
  E1,
  K1,
  K2,
  M1,
  NOW,
  P1,
  READ_DEFS,
  ROUND,
  RPCS,
  TPL,
  TPL2,
  TZ,
  USER,
  answer,
  askedOf,
  buildProposal,
  call,
  conversation,
  ctxFor,
  foldHistory,
  fromRecord,
  iso,
  message,
  newToolContext,
  ports,
  replayBlocks,
  runAskTurn,
  runRound,
  runTool,
  saidFigure,
  salonReport,
  salonRpcs,
  scripted,
  tables,
  tool,
  turn,
} from "./_turn.mjs";

test("report says the Reach-outs section as the page does (the Campaigns lens, C4): the emails and the businesses counted apart, each sentence from the page's own fold where the workspace has a reach-out, null where it has none, and an error where its read failed", async () => {
  const today = iso(NOW.getTime()).slice(0, 10);
  const counts = (over = {}) => ({
    written: 0,
    delivered: 0,
    bounced: 0,
    wrote_back: 0,
    interested: 0,
    booked: 0,
    said_no: 0,
    handed: 0,
    ...over,
  });
  /**
   * What reach_out_report answers (00404) over the days asked: 40 emails to 25 businesses (30 emails the period before), of
   * which 6 businesses wrote back as they stand now, two angles, or none at all with `over`.
   */
  const reachOuts = (days, over = {}) => ({
    timezone: TZ,
    days,
    today,
    since: today,
    has_reach_out: true,
    totals: counts({
      written: 40,
      delivered: 38,
      bounced: 1,
      businesses: 25,
      wrote_back: 6,
      interested: 3,
      booked: 1,
      said_no: 2,
      handed: 4,
    }),
    before: { written: 30, delivered: 27, bounced: 1 },
    series: [{ day: today, written: 40 }],
    chains: [],
    angles: [
      { angle: "their rating", written: 20, businesses: 8, wrote_back: 2 },
      { angle: "mid-session calls", written: 8, businesses: 4, wrote_back: 2 },
    ],
    other_angles: { written: 0, businesses: 0, wrote_back: 0 },
    no_angle: 10,
    mailboxes: [],
    ...over,
  });
  const rpcs = {
    ...RPCS,
    report_series: (a) => ({
      timezone: TZ,
      days: a.p_days,
      span_days: a.p_days * 2,
      today,
      series: [],
      reasons: {},
      reply_seconds: [],
      sentiments: {},
      voicemail: 0,
    }),
    reach_out_report: (a) => reachOuts(a.p_days),
    // Each chain's own totals beside it (00375), which the section does not say: none here.
    reach_out_chain_totals: () => ({}),
  };
  const run = async (r) => {
    const tc = newToolContext(ctxFor(tables(), r), A, "owner", TZ, NOW);
    const out = await runTool(tc, { name: "report", input: { period: "7d" } });
    assert.equal(out.isError, false, out.result);
    return JSON.parse(out.result);
  };

  // A workspace with a reach-out: the page's own fold (toReachOutLensVM) over the page's own payload. The emails are counted
  // in emails and the businesses in businesses, and an outcome (wrote back, interested, booked, said no) is a count of
  // businesses as they stand now, said against nothing of the period before.
  const said = (await run(rpcs)).reach_outs;
  assert.deepEqual(Object.keys(said), ["empty", "strip", "emails", "businesses", "angles", "handed"]);
  assert.deepEqual(said, {
    empty: false,
    strip: [
      { label: "Emails written", value: "40", meta: "25 businesses written to", change: "up from 30" },
      { label: "Landed", value: "95%", meta: "38 of 40 emails delivered", change: "was 90% the 7 days before" },
      { label: "Bounced", value: "1", meta: "1 of 40 emails bounced", change: "same as the 7 days before" },
    ],
    emails: {
      rows: ["Written: 40", "Delivered: 38", "Bounced: 1"],
      line: "Of 40 emails written in these 7 days: 95% were delivered and 3% bounced. No opens: only what came back.",
    },
    businesses: {
      rows: ["Written to: 25", "Wrote back: 6", "Interested: 3", "Booked: 1", "Said no: 2"],
      line: "Of 25 businesses written to in these 7 days: 24% wrote back and 12% were interested. Each counts once, at the last email that wrote to it · a question counts as interested. Who wrote back, was interested, booked or said no is as it stands now.",
    },
    angles: {
      rows: ["their rating: 2 of 8  25%", "mid-session calls: 2 of 4"],
      line: "The opening written for each business, and who answered, as they stand now. 10 emails had no opening, so no angle.",
    },
    handed: "4 businesses handed to you as a call or a note, too.",
  });
  // The same fold the page draws, whoever asks: the businesses' rows are its rows, its sentences its sentences.
  const page = toReachOutLensVM(reachOuts(7), NOW.getTime());
  assert.deepEqual(
    said.businesses.rows,
    page.businesses.rows.map((r) => `${r.label}: ${r.value}`),
  );
  assert.deepEqual(
    [said.businesses.line, said.emails.line, said.angles.line, said.handed],
    [page.businesses.line, page.emails.line, page.angles.line, page.lines.written],
  );
  assert.deepEqual(said.strip, page.strip.map(saidFigure));
  assert.equal(JSON.stringify(said).includes("funnel"), false, "the old fold's funnel sentence is gone");

  // Nothing handed over: no line on it, never an empty sentence.
  const unhanded = await run({
    ...rpcs,
    reach_out_report: (a) =>
      reachOuts(a.p_days, { totals: counts({ written: 12, delivered: 12, businesses: 12, wrote_back: 1 }) }),
  });
  assert.equal(unhanded.reach_outs.handed, null);

  // A database before 00404 sends no businesses: the emails stand, and the businesses part says it does not count them.
  const old = await run({
    ...rpcs,
    reach_out_report: (a) => {
      const { before: _, ...beforeIt } = reachOuts(a.p_days, {
        totals: counts({ written: 40, delivered: 38, bounced: 1, wrote_back: 6 }),
        angles: [{ angle: "their rating", written: 20, wrote_back: 2 }],
        other_angles: { written: 0, wrote_back: 0 },
      });
      return beforeIt;
    },
  });
  assert.deepEqual(old.reach_outs.businesses, { empty: "Chanlytics doesn't count businesses here yet." });
  assert.deepEqual(old.reach_outs.angles, { empty: "Chanlytics doesn't count businesses here yet." });
  assert.equal(old.reach_outs.emails.rows[0], "Written: 40");
  assert.equal(old.reach_outs.strip[0].meta, "40 emails");

  // Reach-outs that wrote alone: the lens's sentence says so after "Nothing went out", as the page's head does.
  const alone = salonRpcs({
    campaign_series: () => SALON_QUIET_SENDS,
    campaign_ledger: (a) => ({ ...SALON_WINDOW, ...SALON_QUIET, days: a.p_days }),
    reach_out_report: (a) => reachOuts(a.p_days),
    reach_out_chain_totals: () => ({}),
  });
  const wrote = await salonReport(alone);
  assert.equal(
    wrote.campaigns.head,
    "Nothing went out in this period. Your cold email campaigns wrote 40 emails to 25 businesses.",
  );
  assert.equal(wrote.reach_outs.businesses.rows[0], "Written to: 25");

  // A share of fewer than five emails: the page greys "Landed" (its n and minN), and Ask, which cannot grey, does not say the
  // percentage -- its value is null and the fold's own meta carries the count. Of five, the share is said.
  const emailsOf = (written, delivered) =>
    reachOuts(7, {
      totals: counts({ written, delivered, bounced: written - delivered, businesses: written }),
      before: { written: 0, delivered: 0, bounced: 0 },
    });
  const four = (await run({ ...rpcs, reach_out_report: () => emailsOf(4, 3) })).reach_outs.strip;
  assert.deepEqual(four.at(1), { label: "Landed", value: null, meta: "3 of 4 emails delivered", change: null });
  assert.deepEqual([four.at(0).value, four.at(2).value], ["4", "1"], "and the counts beside it are said as they are");
  const five = (await run({ ...rpcs, reach_out_report: () => emailsOf(5, 4) })).reach_outs.strip;
  assert.deepEqual(five.at(1), { label: "Landed", value: "80%", meta: "4 of 5 emails delivered", change: null });

  // No reach-out at all: the page draws no section, and the tool says null, never a section of zeros.
  const none = await run({
    ...rpcs,
    reach_out_report: (a) => reachOuts(a.p_days, { has_reach_out: false, totals: counts(), series: [] }),
  });
  assert.equal(none.reach_outs, null);

  // Its read failed: said so, never as nothing written, and the report stands.
  const failed = await run({
    ...rpcs,
    reach_out_report: () => {
      throw new Error("canceling statement due to statement timeout");
    },
  });
  assert.deepEqual(failed.reach_outs, { error: "the cold email numbers could not be read just now" });
  assert.deepEqual([failed.range, failed.tiles.length], ["7 days", (await run(rpcs)).tiles.length]);
});

test("a question that names another page's rows reads them before the model is asked, and the read rides in as data, never in system", async () => {
  const s = scripted([ROUND([answer("Quiet week.")])]);
  const t = tables();
  // Asked on People: off Today, whose own read would ride in beside the one the question names.
  const surface = "people";
  const r = await runAskTurn(
    turn(ctxFor(t, { ...RPCS, report_series: () => ({ error: "empty" }) }), {
      text: "How did the last 7 days go?",
      surface,
    }).input,
    ports(s.round),
  );
  assert.equal(r.failed, false);
  // The report function answered with an error, so the read was dropped, not the turn.
  assert.deepEqual(r.tools, []);
  const s2 = scripted([ROUND([answer("Two playbooks run.")])]);
  const r2 = await runAskTurn(
    turn(ctxFor(t), { text: "Which playbooks are running?", surface }).input,
    ports(s2.round),
  );
  assert.deepEqual(
    r2.tools,
    ["campaigns.moments"],
    "a read that succeeded is on the turn's tools, as name.action (D11)",
  );
  assert.deepEqual(r2.shape.cross_page, ["campaigns.moments"], "and on its shape");
  const q = askedOf(s2.requests[0]).content;
  assert.ok(
    q.some((b) => b.type === "search_result" && b.source === "read://campaigns.moments"),
    "and in the question's message, as data",
  );
  assert.ok(!JSON.stringify(s2.requests[0].system).includes("read://campaigns.moments"), "never in system");
});

test("the history is folded so no two neighbours share a role and the person speaks first", () => {
  assert.deepEqual(
    foldHistory(
      [
        { role: "assistant", text: "Hi" },
        { role: "user", text: "a" },
        { role: "user", text: "b" },
        { role: "assistant", text: "c" },
      ],
      "d",
    ),
    [
      { role: "user", content: "a\nb" },
      { role: "assistant", content: "c" },
      { role: "user", content: "d" },
    ],
  );
  assert.deepEqual(foldHistory([], "d"), [{ role: "user", content: "d" }]);
});

test("the history the model reads is the last twelve turns, counted as turns -- a person's message and what follows it -- never as messages, and it starts at a question; each text still cut at 1,200 characters", () => {
  /** `n` turns of a question and its answer, numbered from `from`. */
  const turns = (n, from = 0) =>
    Array.from({ length: n }, (_, i) => [
      { role: "user", text: `Q${from + i}` },
      { role: "assistant", text: `A${from + i}` },
    ]).flat();
  const said = (h) => foldHistory(h, "now").map((m) => m.content);
  // Thirty turns, a thread's newest sixty rows: the last twelve, twenty-four messages, from the nineteenth question.
  const read = said(turns(30));
  assert.equal(read.length, 25, "REGRESSION: twelve messages were six turns");
  assert.deepEqual([read[0], read[1], read.at(-2), read.at(-1)], ["Q18", "A18", "A29", "now"]);
  assert.deepEqual(said(turns(12)), [...turns(12).map((h) => h.text), "now"], "twelve turns: all of them");
  // A read that begins mid-turn (the newest sixty cut its question off): that answer starts no turn and is left out.
  assert.deepEqual(said([{ role: "assistant", text: "A-1" }, ...turns(2)]), ["Q0", "A0", "Q1", "A1", "now"]);
  // A question whose answer was never saved is a turn of its own: of thirteen, the first goes.
  const gap = [...turns(6), { role: "user", text: "Q-unanswered" }, ...turns(6, 6)];
  const cut = said(gap);
  assert.deepEqual([cut[0], cut.includes("Q0"), cut.includes("Q-unanswered\nQ6")], ["Q1", false, true]);
  const long = foldHistory(
    [
      { role: "user", text: "x".repeat(2000) },
      { role: "assistant", text: "y".repeat(2000) },
    ],
    "now",
  );
  assert.deepEqual(
    long.slice(0, 2).map((m) => m.content.length),
    [1200, 1200],
  );
});

test("REGRESSION: the assistant's people search says when someone was last in touch -- it handed ago the time since, and said Dec 31, 1969 of everyone", async () => {
  const wrote = iso(NOW.getTime() - 2 * 3600_000);
  const rosa = {
    id: P1,
    display_name: "Rosa",
    wa_profile_name: null,
    phone_e164: "+13055550100",
    consent: "opted_in",
    consent_source: null,
    consent_updated_at: null,
    dnc: false,
    channels: ["whatsapp"],
    conversation_count: 1,
    escalation_count: 0,
    needs_human: false,
    open_escalation_reason: null,
    open_escalation_since: null,
    latest_conversation_id: C1,
    latest_state: "open",
    latest_paused_until: null,
    latest_assignee_user_id: null,
    latest_snooze_until: null,
    latest_wa_inbound_at: wrote,
    last_message_at: wrote,
    last_message_direction: "inbound",
    last_message_sender: "customer",
    last_inbound_text: "Are you open Saturday?",
    last_inbound_at: wrote,
    last_call_at: null,
    call_count: 0,
    call_seconds: 0,
    first_contact_at: wrote,
    earliest_row_at: wrote,
    has_backfill: false,
    has_chat: true,
    queued_reply_at: null,
    // Her next step (0007, amended), as people_list v5 carries it: said on her line as the pages say it.
    step_id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeee51",
    step_body: "Send the price list",
    step_due_on: "2026-09-11",
    step_for_user_id: null,
    step_deal_id: null,
  };
  const tc = newToolContext(ctxFor(tables(), { ...RPCS, people_list: () => [rosa] }), A, "operator", TZ, NOW);
  const r = await runTool(tc, { name: "people", input: { action: "search", query: "rosa" } });
  assert.equal(r.isError, false, r.result);
  assert.deepEqual(
    JSON.parse(r.result).people.map((p) => [p.name, p.last_contact, p.next_step]),
    [["Rosa", "They wrote · 2h ago", "Send the price list · Overdue since Fri"]],
  );
  const [row] = JSON.parse(r.result).people;
  assert.equal(row.route, `clients/${row.contact_id}`, "a person says where they open");
});

test("the round gathers the stream: blocks in order, the text so far and each call's input so far handed on as they grow, the stop reason, and an error after the start kept beside the blocks", async () => {
  async function* stream() {
    yield { type: "block_start", index: 0, block: { type: "tool_use", id: "t1", name: "inbox" } };
    yield { type: "input_json", index: 0, partial: '{"action": "list", "filter": "rec' };
    yield { type: "input_json", index: 0, partial: 'ent"}' };
    yield { type: "block_stop", index: 0 };
    yield { type: "block_start", index: 1, block: { type: "text" } };
    yield { type: "text", index: 1, text: '{"say": {"headline": "Two thr' };
    yield { type: "text", index: 1, text: 'eads wait"' };
    yield { type: "block_stop", index: 1 };
    yield { type: "stop", stopReason: "end_turn" };
  }
  const seen = [];
  const grew = [];
  const r = await runRound(
    { tenantId: A, userId: USER, request: {} },
    (s) => seen.push(s),
    (b) => grew.push([b.name, b.json]),
    stream,
  );
  assert.deepEqual(
    r.blocks.map((b) => [b.type, b.name, b.text, b.json]),
    [
      ["tool_use", "inbox", "", '{"action": "list", "filter": "recent"}'],
      ["text", "", '{"say": {"headline": "Two threads wait"', ""],
    ],
  );
  assert.deepEqual([r.stopReason, r.streamError], ["end_turn", null]);
  assert.deepEqual(
    seen,
    ['{"say": {"headline": "Two thr', '{"say": {"headline": "Two threads wait"'],
    "the text so far, as it grows; a tool call's arguments are not words",
  );
  assert.deepEqual(
    grew,
    [
      ["inbox", '{"action": "list", "filter": "rec'],
      ["inbox", '{"action": "list", "filter": "recent"}'],
    ],
    "a call's input so far, as it grows, with the call it belongs to (the answer tool's Say is read from it)",
  );
  async function* broken() {
    yield { type: "block_start", index: 0, block: { type: "tool_use", id: "t1", name: "inbox" } };
    yield { type: "input_json", index: 0, partial: "{}" };
    yield { type: "error", message: "connection reset" };
  }
  const b = await runRound(
    { tenantId: A, userId: USER, request: {} },
    () => {},
    () => {},
    broken,
  );
  assert.deepEqual(
    [b.blocks.length, b.blocks[0].name, b.streamError, b.stopReason],
    [1, "inbox", "connection reset", null],
  );
});

test("the round keeps a thinking block whole -- its words and its signature, or a redacted block's data -- and hands every block back in the order written", async () => {
  async function* stream() {
    yield { type: "block_start", index: 0, block: { type: "thinking" } };
    yield { type: "thinking", index: 0, thinking: "The day " };
    yield { type: "thinking", index: 0, thinking: "is in the snapshot." };
    yield { type: "signature", index: 0, signature: "sig-1" };
    yield { type: "block_stop", index: 0 };
    yield { type: "block_start", index: 1, block: { type: "redacted_thinking", data: "EmwKAhgB" } };
    yield { type: "block_stop", index: 1 };
    yield { type: "block_start", index: 2, block: { type: "tool_use", id: "t1", name: "inbox" } };
    yield { type: "input_json", index: 2, partial: '{"action":"list","filter":"recent"}' };
    yield { type: "block_stop", index: 2 };
    yield { type: "stop", stopReason: "tool_use" };
  }
  const r = await runRound(
    { tenantId: A, userId: USER, request: {} },
    () => {},
    () => {},
    stream,
  );
  assert.deepEqual(
    r.blocks.map((b) => [b.type, b.thinking, b.signature, b.data, b.name]),
    [
      ["thinking", "The day is in the snapshot.", "sig-1", undefined, ""],
      ["redacted_thinking", undefined, undefined, "EmwKAhgB", ""],
      ["tool_use", undefined, undefined, undefined, "inbox"],
    ],
  );
  assert.deepEqual(
    replayBlocks(r.blocks),
    [
      { type: "thinking", thinking: "The day is in the snapshot.", signature: "sig-1" },
      { type: "redacted_thinking", data: "EmwKAhgB" },
      { type: "tool_use", id: "t1", name: "inbox", input: { action: "list", filter: "recent" } },
    ],
    "what the next request carries back: every block, unmodified, in order",
  );
  assert.deepEqual(
    replayBlocks([{ type: "text", id: "", name: "", text: "", json: "" }]),
    [{ type: "text", text: " " }],
    "an empty text block still goes back as a space, as before: the API refuses an empty one",
  );
});

test("every read, each an action of the read tools, runs against the database in memory: each answers in its shape or refuses in words, and a read that fails says so to the model rather than throwing; PR 4.3's ten, PR 4.5's search and the operator's reads run beside them (their answers are proven in their domains' suites)", async () => {
  const t = tables({
    escalations: [
      {
        id: E1,
        tenant_id: A,
        conversation_id: C1,
        reason: "human_token",
        details: "asked for a person",
        state: "open",
        created_at: iso(NOW.getTime() - 1800_000),
      },
    ],
  });
  const ctx = ctxFor(t);
  const tc = newToolContext(ctx, A, "operator", TZ, NOW);
  const run = (name, input = {}) => runTool(tc, { name, input });
  const out = {};
  // Every action of every read tool, each given its own fields from one set (a field only another action takes is
  // refused), keyed as a turn records it.
  const fields = {
    conversation_id: C1,
    contact_id: P1,
    call_id: K1,
    filter: "recent",
    query: "rosa",
    words: "Saturday",
    days: 7,
    day: "today",
    service: "",
  };
  for (const tool of READ_DEFS)
    for (const [action, def] of Object.entries(tool.actions)) {
      const own = Object.fromEntries(Object.entries(fields).filter(([k]) => k in def.input.shape));
      out[action ? `${tool.name}.${action}` : tool.name] = await run(tool.name, action ? { action, ...own } : own);
    }
  assert.deepEqual(
    Object.keys(out).sort(),
    [
      "calendar.openings",
      "calendar.room",
      "calendar.week",
      "calls.get",
      "calls.list",
      "files.compare",
      "files.get",
      "files.list",
      "files.listen",
      "files.reasons",
      "files.view",
      "files.week",
      "files.zoom",
      "guide",
      "inbox.list",
      "inbox.search",
      "inbox.conversation",
      "leads.back",
      "leads.ideas",
      "leads.lead",
      "leads.leads",
      "leads.search",
      "leads.searches",
      "people.get",
      "people.lists",
      "people.pipeline",
      "people.search",
      "people.winners",
      "recall",
      "report",
      "campaigns.send",
      "campaigns.cold_emails",
      "campaigns.edited",
      "campaigns.journey",
      "campaigns.list",
      "campaigns.lists",
      "campaigns.messages",
      "campaigns.moments",
      "campaigns.sent",
      "campaigns.campaign",
      "signals",
      "today",
      "workspace.activity",
      "workspace.connections",
      "workspace.notifications",
      "workspace.settings",
    ],
    "the reads the loop offers: the fourteen old tools, each an action now, PR 4.3's ten, PR 4.5's search, the library, the journey, the room, the operator's (the guide, the signals, the ideas, what comes back, the winners, the cold emails), recall (decision 0070), and the cold emails the member edited (decision 0078 step 2)",
  );
  // The operator's reads (15 Oct 2026) answer an empty workspace in their shape, never as a failure.
  for (const key of ["guide", "signals", "leads.ideas", "leads.back", "people.winners", "campaigns.cold_emails"])
    assert.equal(out[key].isError, false, `${key}: ${out[key].result}`);
  assert.equal(out["campaigns.edited"].isError, false, out["campaigns.edited"].result);
  assert.equal(JSON.parse(out.signals.result).route, "today");
  const found = JSON.parse(out["inbox.search"].result);
  assert.equal(out["inbox.search"].isError, false, out["inbox.search"].result);
  assert.deepEqual(
    [found.words, found.days, found.hits.map((h) => [h.kind, h.conversation_id, h.snippet])],
    ["Saturday", 7, [["message", C1, "Are you open Saturday?"]]],
    "the thread's message, found by its word within the week asked",
  );
  const threads = JSON.parse(out["inbox.list"].result);
  assert.equal(out["inbox.list"].isError, false, out["inbox.list"].result);
  assert.deepEqual(
    threads.threads.map((x) => [x.conversation_id, x.who, x.state]),
    [[C1, "Rosa", "needs you"]],
  );
  assert.ok(tc.read.thread.has(C1), "a read row enters the read set, so it may be cited");
  const thread = JSON.parse(out["inbox.conversation"].result);
  assert.equal(out["inbox.conversation"].isError, false, out["inbox.conversation"].result);
  assert.equal(thread.conversation_id ?? thread.thread?.conversation_id ?? C1, C1);
  // Each row carries its last exchanges, so one read round answers most questions; and every row a tool returns
  // says where it opens, in the shape the answer's sources take (normalizeAnswer, ask/answer/). Both were
  // pinned as source text in ask/line/ until the registry (PR 3.1).
  assert.deepEqual(
    threads.threads[0].recent.map((x) => [["customer", "you", "receptionist"].includes(x.from), x.text]),
    [[true, "Are you open Saturday?"]],
  );
  assert.equal(threads.threads[0].route, `inbox/th-${C1}`);
  assert.equal(thread.route, `inbox/th-${C1}`);
  assert.equal(JSON.parse(out["calls.get"].result).route, `conversations/cv-${K1}`);
  assert.equal(JSON.parse(out["calls.list"].result).calls[0].route, `conversations/cv-${K1}`);
  assert.equal(out["calls.get"].isError, false, out["calls.get"].result);
  assert.ok(tc.read.call.has(K1));
  assert.equal(out["calls.list"].isError, false, out["calls.list"].result);
  assert.equal(out["workspace.settings"].isError, false, out["workspace.settings"].result);
  assert.ok(out["workspace.settings"].result.includes("Harbor Moving"));
  assert.equal(out["calendar.openings"].isError, false, out["calendar.openings"].result);
  assert.ok(out["calendar.openings"].result.includes("No calendar feed"), "no feed, said plainly");
  assert.equal(out["calendar.room"].isError, false, out["calendar.room"].result);
  assert.deepEqual(
    JSON.parse(out["calendar.room"].result),
    { days: 14, open: 0, taken: 0, by_day: [], none: "no_calendar" },
    "no feed, no room counted, and said so",
  );
  assert.equal(out["calendar.week"].isError, false, out["calendar.week"].result);
  assert.equal(out["campaigns.lists"].isError, false, out["campaigns.lists"].result);
  assert.equal(out["campaigns.moments"].isError, false, out["campaigns.moments"].result);
  assert.equal(out["campaigns.messages"].isError, false, out["campaigns.messages"].result);
  assert.deepEqual(JSON.parse(out["campaigns.messages"].result).messages, [], "an empty library, said as no message");
  // The sequences as their page lists them (0060): none here, and nothing needs you; one asked for by no id is refused.
  assert.equal(out["campaigns.list"].isError, false, out["campaigns.list"].result);
  assert.deepEqual(JSON.parse(out["campaigns.list"].result), {
    route: "campaigns/sequences",
    needs_you: 0,
    sequences: [],
  });
  assert.equal(out["campaigns.campaign"].isError, true, "a sequence is asked for by its id");
  assert.equal(out["campaigns.journey"].isError, false, out["campaigns.journey"].result);
  const journey = JSON.parse(out["campaigns.journey"].result);
  assert.deepEqual(
    [journey.covered, journey.of, journey.stages.map((s) => [s.id, s.covered, s.state, s.campaigns])],
    [
      1,
      4,
      [
        ["first_contact", true, "Answers · asks for the yes", []],
        ["before", false, "Needs your calendar", []],
        ["after", false, "Needs your calendar", []],
        ["quiet", false, "Off", []],
      ],
    ],
    "no calendar, no campaign: 1 of 4, as the page counts it -- AI covers first contact, the appointment moments need a calendar, and quiet is off",
  );
  assert.deepEqual(
    journey.guide.map((r) => r.stage),
    ["first_contact", "quiet", null],
    "the guide, without a calendar: no appointment moment",
  );
  assert.equal(out["leads.searches"].isError, false, out["leads.searches"].result);
  assert.deepEqual(
    JSON.parse(out["leads.searches"].result).searches,
    [],
    "no search asked for yet, said as an empty list",
  );
  assert.deepEqual(
    [out["workspace.activity"].isError, JSON.parse(out["workspace.activity"].result).error],
    [true, "workspace: action activity is an owner's"],
    "an operator is refused the owner's log, before it is read",
  );
  assert.deepEqual(JSON.parse(out["people.search"].result).people, [], "nobody matched in an empty people list");
  assert.equal(out["people.get"].isError, true);
  assert.match(out["people.get"].result, /no such person/);
  assert.equal(out.report.isError, true);
  assert.match(out.report.result, /report unavailable/);
  assert.equal(out.today.isError, true, "the metrics function answered an error: the read fails in words");
  assert.match(out.today.result, /that read failed/);
  assert.deepEqual(await run("teleport"), {
    result: JSON.stringify({ error: "unknown tool teleport" }),
    isError: true,
    label: "Running teleport",
  });
  const faulted = newToolContext(
    ctxFor(tables(), RPCS, { "calls.select": { message: "permission denied" } }),
    A,
    "operator",
    TZ,
    NOW,
  );
  const failed = await runTool(faulted, { name: "calls", input: { action: "list", filter: "recent" } });
  assert.deepEqual(
    [failed.isError, JSON.parse(failed.result).error],
    [true, "that read failed; say so and answer with what you have"],
  );
  // A period the schema does not list is refused before the read runs, in the schema's own words (PR 3.1, D2).
  assert.match(JSON.parse((await run("report", { period: "12d" })).result).error, /^report: period Invalid option/);
  assert.equal(
    (await run("inbox", { action: "thread", conversation_id: "nope" })).result,
    JSON.stringify({ error: "conversation_id must be an id a tool returned" }),
  );
});

test("the caller who hung up in seconds: calls.list finds them under their own word", async () => {
  // Filed `handled`, because it was. Nothing in the product said the salon
  // had lost a booking an hour ago from a number it already has.
  const quick = call(K2, {
    retell_call_id: "r2",
    started_at: iso(NOW.getTime() - 3600_000),
    ended_at: iso(NOW.getTime() - 3594_000),
    duration_ms: 6_000,
    summary: null,
  });
  const tc = newToolContext(ctxFor(tables({ calls: [call(K1), quick] })), A, "operator", TZ, NOW);
  const listed = async (filter) =>
    JSON.parse((await runTool(tc, { name: "calls", input: { action: "list", filter } })).result);

  assert.deepEqual(
    (await listed("abandoned")).calls.map((c) => [c.call_id, c.abandoned]),
    [[K2, true]],
    "the two-hundred-second call ended the same way and is not one of these",
  );
  assert.deepEqual(
    (await listed("missed")).calls,
    [],
    "REGRESSION: reaching AI and leaving is not a dial that never connected",
  );
  const today = (await listed("today")).calls;
  assert.deepEqual(today.map((c) => c.call_id).sort(), [K1, K2].sort());
  assert.equal(
    today.find((c) => c.call_id === K1).abandoned,
    undefined,
    "an ordinary call carries no flag at all, so the block costs nothing on a normal day",
  );
});

test("inbox.search in a turn (PR 4.5): the model searches for a word, reads a message hit and a call hit, and cites both -- the message as its thread (inbox/th-), the call as the call (conversations/cv-); nothing found says so, and that park is not parking; blank words are refused before anything is read", async () => {
  const M2 = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee6";
  const said = iso(NOW.getTime() - 2 * 3600_000);
  const rang = iso(NOW.getTime() - 26 * 3600_000);
  const ctx = ctxFor(
    tables({
      messages: [
        message(M1, C1, { contact_id: P1 }),
        message(M2, C1, {
          contact_id: P1,
          body: "Is there parking behind the shop?",
          created_at: said,
          channel_ts: said,
        }),
      ],
      calls: [
        call(K1, {
          started_at: rang,
          ended_at: rang,
          transcript: "Agent: Thanks for calling.\nUser: Where do I leave the van? Is there parking nearby?",
        }),
      ],
    }),
  );
  const rosaThread = { kind: "thread", id: C1, label: "Rosa" };
  const rosaCall = { kind: "call", id: K1, label: "Rosa" };
  const s = scripted([
    ROUND([tool("inbox", { action: "search", words: "parking" })]),
    ROUND([
      answer("Rosa asked about parking twice, on WhatsApp and on a call.", {
        show: {
          items: [
            { title: "Rosa", meta: "WhatsApp", line: "Is there parking behind the shop?", source: rosaThread },
            { title: "Rosa", meta: "Call", line: "Is there parking nearby?", source: rosaCall },
          ],
        },
      }),
    ]),
  ]);
  const { input, events } = turn(ctx, { text: "did anyone mention parking this month?" });
  const r = await runAskTurn(input, ports(s.round));
  assert.equal(r.failed, false, r.failure ?? "");
  assert.deepEqual([r.rounds, r.tools], [2, ["inbox.search"]]);
  assert.ok(
    events.some((e) => e.t === "trace" && e.text === "Searching what was said"),
    "the palette says what runs",
  );
  const result = s.requests[1].messages.at(-1).content[0];
  assert.deepEqual([result.tool_use_id, result.is_error], ["t-inbox.search", false]);
  assert.deepEqual(fromRecord(result.content), {
    words: "parking",
    days: 30,
    shown: 2,
    more_available: false,
    hits: [
      {
        kind: "message",
        who: "Rosa",
        at: clockStamp(Date.parse(said), TZ, NOW.getTime()),
        channel: "WhatsApp",
        from: "customer",
        status: "delivered",
        conversation_id: C1,
        snippet: "Is there parking behind the shop?",
        route: `inbox/th-${C1}`,
      },
      {
        kind: "call",
        who: "Rosa",
        at: clockStamp(Date.parse(rang), TZ, NOW.getTime()),
        called_by: "customer",
        call_id: K1,
        snippet: "Agent: Thanks for calling. User: Where do I leave the van? Is there parking nearby?",
        route: `conversations/cv-${K1}`,
      },
    ],
  });
  assert.deepEqual(
    r.answer.show.items.map((i) => [i.source.kind, i.source.id, i.source.to]),
    [
      ["thread", C1, `inbox/th-${C1}`],
      ["call", K1, `conversations/cv-${K1}`],
    ],
    "both hits are cited, each opening where its page opens it",
  );
  assert.equal(r.ungrounded, false);
  assert.equal(
    ctx.supabase.seen.filter((q) => q.table === "contacts").length,
    1,
    "the names are read once for both hits",
  );

  // Nothing found is said, with the other form to try; blank words are refused before anything is read.
  const tc = newToolContext(ctx, A, "viewer", TZ, NOW);
  const none = JSON.parse((await runTool(tc, { name: "inbox", input: { action: "search", words: "park" } })).result);
  assert.deepEqual([none.shown, none.hits, none.more_available], [0, [], false]);
  assert.match(none.note, /^Nothing in the last 30 days holds these words\. .*park does not find parking/);
  const reads = ctx.supabase.seen.length;
  assert.deepEqual(await runTool(tc, { name: "inbox", input: { action: "search", words: "  " } }), {
    result: JSON.stringify({ error: "words must say what to look for" }),
    isError: true,
    label: "Searching what was said",
  });
  assert.equal(ctx.supabase.seen.length, reads, "blank words read nothing");
});

test("the proposal builders run against the database in memory: each kind is a card with its door and its undo, or a refusal in the model's words", async () => {
  const t = tables({
    messages: [
      message(M1, C1),
      message("eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2", C1, {
        direction: "outbound",
        sender: "ai",
        status: "queued",
        body: "Yes, Saturday 9 to 5.",
      }),
    ],
    conversations: [
      conversation(C1),
      conversation(C2, { state: "snoozed", snooze_until: iso(NOW.getTime() + 86_400_000), assignee_user_id: USER }),
    ],
    escalations: [
      {
        id: E1,
        tenant_id: A,
        conversation_id: C1,
        reason: "human_token",
        details: "asked for a person",
        state: "open",
        created_at: iso(NOW.getTime() - 1800_000),
      },
    ],
    calls: [call(K1, { status: "ongoing", ended_at: null })],
    policies: [
      {
        id: "p-reply",
        tenant_id: A,
        class: "reply",
        mode: "auto",
        subject_type: null,
        subject_id: null,
        limits: { min_confidence: 0.6 },
        updated_at: iso(NOW.getTime()),
      },
    ],
    templates: [
      {
        id: TPL,
        tenant_id: A,
        channel: "whatsapp",
        name: "saturday_hours",
        language: "en",
        meta_status: "approved",
        category: "MARKETING",
        variables: [],
        body_preview: "We are open Saturday 9 to 5.",
        hidden_at: null,
      },
      {
        id: TPL2,
        tenant_id: A,
        channel: "whatsapp",
        name: "month_offer",
        language: "en",
        meta_status: "approved",
        category: "MARKETING",
        variables: [{ position: 1, label: "offer", example: "20% off cuts" }],
        body_preview: "This month: {{1}}.",
        hidden_at: null,
      },
    ],
  });
  const tc = newToolContext(
    ctxFor(t, {
      ...RPCS,
      people_list: () => [
        {
          id: P1,
          display_name: "Rosa",
          wa_profile_name: null,
          phone_e164: "+15555550100",
          consent: "opted_in",
          consent_source: "desk",
          marketing_consent: "opted_in",
          marketing_consent_source: "desk",
          marketing_consent_updated_at: iso(NOW.getTime() - 86_400_000),
          consent_updated_at: iso(NOW.getTime() - 86_400_000),
          dnc: false,
          channels: ["whatsapp"],
          conversation_count: 1,
          escalation_count: 0,
          needs_human: false,
          open_escalation_reason: null,
          open_escalation_since: null,
          latest_conversation_id: C1,
          latest_state: "open",
          latest_paused_until: null,
          latest_assignee_user_id: null,
          latest_snooze_until: null,
          latest_wa_inbound_at: iso(NOW.getTime() - 3600_000),
          last_message_at: iso(NOW.getTime() - 3600_000),
          last_message_direction: "inbound",
          last_message_sender: "client",
          last_inbound_text: "Are you open Saturday?",
          last_inbound_at: iso(NOW.getTime() - 3600_000),
          last_call_at: null,
          last_outbound_call_at: null,
          last_inbound_call_at: null,
          created_at: iso(NOW.getTime() - 86_400_000 * 40),
        },
      ],
    }),
    A,
    "owner",
    TZ,
    NOW,
  );
  const p = (name, input) => buildProposal(tc, name, input);

  const steer = await p("propose_reply", {
    action: "steer",
    message_id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2",
    instruction: "shorter",
  });
  assert.equal(steer.isError, false, steer.result);
  assert.deepEqual(
    [steer.proposal.kind, steer.proposal.payload.conversation_id, steer.proposal.payload.current, steer.proposal.undo],
    ["steer", C1, "Yes, Saturday 9 to 5.", null],
  );
  assert.match(
    (await p("propose_reply", { action: "steer", message_id: M1, instruction: "shorter" })).result,
    /not waiting any more/,
  );

  const snooze = await p("propose_conversation", { conversation_id: C1, verb: "snooze" });
  assert.equal(snooze.isError, false, snooze.result);
  assert.equal(
    snooze.proposal.payload.until,
    "2026-09-15T14:00:00.000Z",
    "tomorrow at ten in the business's zone (New York, so 14:00Z), whatever zone the server runs in",
  );
  assert.match((await p("propose_conversation", { conversation_id: C1, verb: "wake" })).result, /not snoozed/);
  assert.equal((await p("propose_conversation", { conversation_id: C2, verb: "wake" })).isError, false);
  assert.equal(
    (await p("propose_conversation", { conversation_id: C2, verb: "hand_back" })).proposal.title,
    "Hand Rosa's conversation back to AI",
  );
  assert.match(
    (await p("propose_conversation", { conversation_id: C1, verb: "hand_back" })).result,
    /nobody has taken/,
  );
  const resolve = await p("propose_conversation", { conversation_id: C1, verb: "resolve" });
  assert.deepEqual([resolve.proposal.payload.escalation_id, resolve.proposal.undo], [E1, null]);
  assert.match(
    (await p("propose_conversation", { conversation_id: C2, verb: "resolve" })).result,
    /no open escalation/,
  );
  // A verb the schema does not list is refused before the builder runs, in the schema's own words (PR 3.1, D2).
  assert.match(
    JSON.parse((await p("propose_conversation", { conversation_id: C1, verb: "delete" })).result).error,
    /^propose_conversation: verb Invalid option/,
  );

  const mode = await p("propose_person", { action: "mode", contact_id: P1, mode: "never" });
  assert.deepEqual(
    [mode.proposal.kind, mode.proposal.needs, mode.proposal.payload.previous, mode.proposal.summary],
    ["person_mode", "owner", "inherit", "AI stays silent with them"],
  );
  assert.match((await p("propose_person", { action: "mode", contact_id: C2, mode: "never" })).result, /no such person/);

  assert.match(
    (await p("propose_settings", { action: "autonomy", class: "money", mode: "ask" })).result,
    /money stays owner-only by charter/,
  );
  // One rule (contracts POLICY_CLASS_MODES): bookings have nothing to hold for review; the re-engage row holds a run.
  assert.match(
    (await p("propose_settings", { action: "autonomy", class: "booking", mode: "veto" })).result,
    /The Bookings row has nothing to hold for review\./,
  );
  assert.match(
    (await p("propose_settings", { action: "autonomy", class: "faq", mode: "never" })).result,
    /Bookings and service questions are answered by AI or by you/,
  );
  const holds = await p("propose_settings", { action: "autonomy", class: "reengage", mode: "veto" });
  assert.equal(holds.isError, false, holds.result);
  assert.equal(holds.proposal.summary, "Re-engage quiet customers: holds it");
  assert.match(
    (await p("propose_settings", { action: "autonomy", class: "reply" })).result,
    /say a mode or a confidence/,
  );
  const dial = await p("propose_settings", { action: "autonomy", class: "reply", min_confidence: 0.9 });
  assert.deepEqual(
    [dial.proposal.summary, dial.proposal.payload.previous],
    ["confidence dial 90%", { mode: "auto", min_confidence: 0.6 }],
    "the previous values ride along for undo",
  );

  const closure = await p("propose_settings", {
    action: "change",
    change: { op: "add_closure", date: "2026-12-25", note: "Christmas" },
  });
  assert.deepEqual(
    [closure.proposal.title, closure.proposal.summary, closure.proposal.needs],
    ["Close for a day", "Closed on 2026-12-25 (Christmas)", "partner"],
    "a settings card needs a partner: its route, PUT settings, is a partner's door",
  );
  assert.match(
    (await p("propose_settings", { action: "change", change: { op: "add_closure", date: "tomorrow" } })).result,
    /change rejected/,
  );
  // A note with its last day: the same until a closure takes, judged by its shape alone, said on the card and carried
  // in the change its Approve applies. The card quotes the text the receptionist will be told.
  const ending = { op: "add_note", title: "Holiday hours", text: "Open 10 to 2 this week.", until: "2026-12-31" };
  const noted = await p("propose_settings", { action: "change", change: ending });
  assert.equal(noted.isError, false, noted.result);
  assert.deepEqual(
    [noted.proposal.title, noted.proposal.summary, noted.proposal.payload.change],
    ["Holiday hours note", "Note for AI: “Holiday hours”, until 2026-12-31 · “Open 10 to 2 this week.”", ending],
  );
  assert.match(
    (await p("propose_settings", { action: "change", change: { ...ending, until: "New Year's Eve" } })).result,
    /change rejected: until/,
  );
  assert.match(
    JSON.parse((await p("propose_settings", {})).result).error,
    /^propose_settings: action Invalid discriminator value/,
    "no action at all is refused by the schema, before the builder (PR 3.1, D2)",
  );
  assert.match(
    JSON.parse((await p("propose_settings", { action: "change" })).result).error,
    /^propose_settings: change Invalid input/,
    "no change at all is refused by the schema, before the builder (PR 3.1, D2)",
  );

  const whisper = await p("propose_call", { action: "whisper", call_id: K1, text: "Saturday is full" });
  assert.deepEqual([whisper.proposal.kind, whisper.proposal.title], ["whisper", "Whisper on the call with Rosa"]);
  assert.ok(tc.read.call.has(K1));
  // The card reads the call as calls.get does, once a turn: a call that ended is refused on the next turn's read (and the
  // whisper's own door refuses one that ended in between).
  t.calls[0].status = "ended";
  const nextTurn = newToolContext(tc.ctx, A, "owner", TZ, NOW);
  assert.match(
    (await buildProposal(nextTurn, "propose_call", { action: "whisper", call_id: K1, text: "x" })).result,
    /not in progress/,
  );

  assert.match((await p("propose_person", { action: "add", email: "nope" })).result, /missing the @/);
  assert.match(
    JSON.parse((await p("propose_settings", { action: "autonomy", class: "reply", mode: "sometimes" })).result).error,
    /^propose_settings: mode Invalid option/,
    "a mode the schema does not list is refused by the schema (PR 3.1, D2)",
  );

  const broadcast = await p("propose_campaign", {
    action: "once",
    template_id: TPL,
    audience_kind: "everyone",
    params: [],
  });
  assert.equal(broadcast.isError, false, broadcast.result);
  assert.deepEqual(
    [
      broadcast.proposal.kind,
      broadcast.proposal.needs,
      broadcast.proposal.payload.count,
      broadcast.proposal.payload.audience_label,
    ],
    ["broadcast", "operator", 1, EVERYONE_LABEL],
  );
  assert.match(
    (await p("propose_campaign", { action: "once", template_id: TPL, audience_kind: "list", audience_id: "nope" }))
      .result,
    /audience_id must be a People list id/,
  );
  assert.match(
    (
      await p("propose_campaign", {
        action: "once",
        template_id: TPL,
        audience_kind: "everyone",
        params: ["extra"],
      })
    ).result,
    /takes 0 values/,
  );

  const playbook = await p("propose_campaign", {
    action: "moment",
    trigger: "quiet_30",
    template_id: TPL,
    params: [],
  });
  assert.equal(playbook.isError, false, playbook.result);
  assert.deepEqual(
    [
      playbook.proposal.kind,
      playbook.proposal.payload.trigger,
      playbook.proposal.payload.template_id,
      playbook.proposal.undo,
    ],
    ["playbook", "quiet_30", TPL, "Delete it. Nothing goes out."],
  );
  assert.match(
    (await p("propose_campaign", { action: "moment", trigger: "never" })).result,
    /propose_campaign: trigger Invalid option/,
    "a moment the schema does not list is refused by the schema (PR 3.1, D2)",
  );

  // What the model is told of every card, and the reply refused for a person who opted out (pinned as text in
  // ask/line/ until PR 3.1).
  assert.equal(
    JSON.parse(broadcast.result).note,
    "Nothing has happened yet. This is a card the person can approve, edit or dismiss. Say what you proposed; never say it is done.",
  );
  const was = t.conversations[0].contacts;
  t.conversations[0].contacts = { ...was, dnc: true };
  assert.match(
    (await p("propose_reply", { action: "draft", conversation_id: C1, text: "See you Saturday", voice: "you" })).result,
    /Rosa opted out; nothing can be sent to them/,
  );
  t.conversations[0].contacts = was;
  // A playbook with no template takes the trigger's starter, and where the workspace does not hold it the card adds it
  // at its Approve (the moment spec's A0; tests/playbooks/ask-setup/starter-card.test.mjs); a template with a typed slot
  // and no words is a question for the person, never invented words (pinned as text in playbooks.test.mjs until PR 3.1).
  const onStarter = JSON.parse((await p("propose_campaign", { action: "moment", trigger: "quiet_30" })).result);
  assert.equal(onStarter.card, "Campaign: Win-back");
  assert.match(onStarter.summary, /adds the “Win-back” starter first/);
  // 2 Oct 2026: welcome is no longer a moment a new playbook starts from (it was this case's trigger): the schema says so.
  const welcome = (await p("propose_campaign", { action: "moment", trigger: "new_week" })).result;
  assert.match(welcome, /Invalid option: expected one of/);
  assert.doesNotMatch(
    welcome,
    /new_week|phoned_only/,
    "the moments it names are the ones a new playbook may start from",
  );
  assert.match(
    (await p("propose_campaign", { action: "moment", trigger: "everyone_monthly", template_id: TPL2 })).result,
    /ask the person what to say there, then propose again with params/,
  );
  assert.ok(
    !tc.ctx.supabase.seen.some((q) => ["insert", "update", "upsert", "delete"].includes(q.op)),
    "a proposal reads; it never writes",
  );
  assert.match((await p("teleport", {})).result, /unknown tool teleport/);
  const throwing = newToolContext(
    ctxFor(t, RPCS, { "contacts.select": { message: "permission denied" } }),
    A,
    "owner",
    TZ,
    NOW,
  );
  assert.deepEqual(await buildProposal(throwing, "propose_person", { action: "mode", contact_id: P1, mode: "ask" }), {
    proposal: null,
    result: JSON.stringify({ error: "that could not be checked; say so and suggest the page" }),
    isError: true,
    refusal: "that could not be checked; say so and suggest the page",
  });
});
