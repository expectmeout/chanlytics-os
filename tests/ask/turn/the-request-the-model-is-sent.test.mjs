/**
 * The request the model is sent: names cited from what was read, the page's row riding in whole, the cache's markers
 * and the bytes before the messages the same across pages and people, the tools from the registry, retries in their
 * order, and a page counted as a read only when something on it was.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { logLineOf } from "../../_log-lines.mjs";
import {
  ASK_CITATION_KINDS,
  ASK_MAX_ROUNDS,
  ASK_ROW_WORDS,
  ASK_TURN_BUDGET_MS,
  ASK_MODEL,
  compareTemplates,
  sendableTemplates,
} from "@chanlytics/contracts";
import {
  A,
  BUILT,
  C1,
  CHANNELS,
  CORE_TOOLS,
  GatewayRefused,
  LUIS,
  NOW,
  OFFER,
  PAGE,
  ROSA,
  ROUND,
  RPCS,
  TPL,
  TZ,
  WAITING_SEARCH,
  answer,
  answerJson,
  askedOf,
  buildProposal,
  builtWith,
  ctxFor,
  dropFor,
  foldHistory,
  fromRecord,
  logged,
  markersOf,
  messagesOf,
  newToolContext,
  ports,
  rawOf,
  redacted,
  replayBlocks,
  runAskTurn,
  runTool,
  sameBytes,
  scopedRead,
  scripted,
  sentAs,
  sentOf,
  tables,
  templatesRoute,
  thinking,
  threeAnswers,
  toApiTools,
  tool,
  turn,
  workspaceFacts,
} from "./_turn.mjs";

test("thirteen names in a turn (PR 4.2): the rows leads.searches, campaigns.audiences and campaigns.playbooks returned are cited as a search, a People list by its name, a template and a playbook, each opening where its reader said; a playbook no read returned is dropped, and said in the log", async () => {
  const PB = "abababab-0000-4000-8000-00000000000b";
  const NOT_READ = "abababab-0000-4000-8000-0000000000ff";
  const winBack = {
    id: PB,
    tenant_id: A,
    kind: "moment",
    name: "Win-back",
    trigger: "quiet_30",
    list_id: null,
    list_key: null,
    template_id: TPL,
    template_name: "fall_offer",
    template_language: "en",
    params: [],
    policy_class: "reengage",
    state: "running",
    run_hour: 10,
    cap_per_run: 50,
    gap_days: 30,
    cadence_days: 0,
    last_run_for: null,
    last_run_at: null,
    created_at: "2026-09-01T00:00:00Z",
  };
  const world = () =>
    ctxFor(tables({ templates: [OFFER], lead_searches_view: [WAITING_SEARCH], playbooks: [winBack] }), {
      ...RPCS,
      people_list: () => threeAnswers(),
    });
  // A People list the listing offers here, by the id it gives it (audience_id): a name, never a uuid.
  const offered = JSON.parse(
    (await runTool(newToolContext(world(), A, "owner", TZ, NOW), { name: "sequences", input: { action: "lists" } }))
      .result,
  ).audiences.find((a) => a.kind === "list");
  assert.ok(offered && !/^[0-9a-f-]{36}$/.test(offered.audience_id), JSON.stringify(offered));
  const item = (kind, id, title) => ({ title, meta: "", line: "", source: { kind, id, label: title } });
  const s = scripted([
    ROUND([
      tool("leads", { action: "searches" }),
      tool("sequences", { action: "lists" }),
      tool("sequences", { action: "moments" }),
    ]),
    ROUND([
      answer("One search waits on you, and the win-back runs on its own.", {
        show: {
          items: [
            item("search", WAITING_SEARCH.id, "Personal trainers in Austin"),
            item("list", offered.audience_id, offered.label),
            item("template", TPL, "fall_offer"),
            item("playbook", PB, "Win-back"),
            item("playbook", NOT_READ, "A playbook nobody read"),
          ],
        },
      }),
    ]),
  ]);
  const { input } = turn(world(), { role: "owner" });
  const { result: r, lines } = await logged("ask_sources_dropped", () => runAskTurn(input, ports(s.round)));
  assert.equal(r.failed, false, r.failure ?? "");
  assert.deepEqual(
    r.answer.show.items.map((i) => [i.source.kind, i.source.id, i.source.to]),
    [
      ["search", WAITING_SEARCH.id, `clients/leads:s-${WAITING_SEARCH.id}`],
      ["list", offered.audience_id, `clients/seg:${offered.audience_id}`],
      ["template", TPL, "campaigns/messages/fall_offer"],
      ["playbook", PB, `campaigns/sequences/${PB}`],
    ],
    "each where its reader said: a search on Leads, a People list on People, a template at its message in the Library, a playbook at its card",
  );
  assert.deepEqual(
    lines.map((l) => JSON.parse(l).dropped),
    [1],
    "the playbook no read returned is dropped, and counted",
  );
});

test("campaigns.audiences offers what the composer offers (ledger #14): a template this product cannot put on the wire -- a button that takes a value -- is withheld as the Broadcasts composer withholds it, and cannot_send says why in the composer's own sentence; nothing withheld, it says nothing", async () => {
  const T2 = "dddddddd-dddd-4ddd-8ddd-ddddddddddd2";
  const bookNow = {
    ...OFFER,
    id: T2,
    name: "book_now",
    category: "UTILITY",
    body_preview: "Book your next visit.",
    components: [
      { type: "BODY", text: "Book your next visit." },
      { type: "BUTTONS", buttons: [{ type: "URL", text: "Book", url: "https://book.example/{{1}}" }] },
    ],
  };
  const t = tables({ templates: [OFFER, bookNow] });
  const out = await runTool(newToolContext(ctxFor(t), A, "owner", TZ, NOW), {
    name: "sequences",
    input: { action: "lists" },
  });
  assert.equal(out.isError, false, out.result);
  const read = JSON.parse(out.result);
  assert.deepEqual(
    read.templates.map((x) => x.template_id),
    [TPL],
    "REGRESSION: a template whose button takes a value was offered, and became a card whose send failed for everyone",
  );
  assert.equal(
    read.cannot_send,
    "One of your messages can't go out from here · it has a button that takes a value. It still works in WhatsApp Manager.",
  );
  // The composer's own split, over the composers' own read: the same templates, the same sentence.
  const composer = await templatesRoute.GET.run(new Request(`http://localhost/api/v1/templates?workspace=${A}`), {
    ...ctxFor(t),
    params: {},
  });
  const split = sendableTemplates(
    composer.templates.filter((x) => x.channel === "whatsapp" && x.meta_status === "approved").sort(compareTemplates),
  );
  assert.deepEqual(
    [read.templates.map((x) => x.template_id), read.cannot_send],
    [split.sendable.map((x) => x.id), split.why],
    "the composer's own list and its words",
  );
  const clear = JSON.parse(
    (
      await runTool(newToolContext(ctxFor(tables({ templates: [OFFER] })), A, "owner", TZ, NOW), {
        name: "sequences",
        input: { action: "lists" },
      })
    ).result,
  );
  assert.deepEqual([clear.templates.map((x) => x.template_id), clear.cannot_send], [[TPL], null]);
});

test("a list of the workspace's own is read once a turn: campaigns.audiences reads the lists and their members, and people.search and propose_campaign.broadcast count a list from them, never reading it again", async () => {
  const S_REG = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";
  const t = tables({
    segments: [{ id: S_REG, tenant_id: A, name: "Regulars", rule: null, archived_at: null }],
    segment_members: [
      { segment_id: S_REG, contact_id: LUIS, tenant_id: A },
      { segment_id: S_REG, contact_id: ROSA, tenant_id: A },
    ],
    templates: [OFFER],
  });
  const ctx = ctxFor(t, { ...RPCS, people_list: () => threeAnswers() });
  const tc = newToolContext(ctx, A, "owner", TZ, NOW);
  const listed = await runTool(tc, { name: "sequences", input: { action: "lists" } });
  assert.equal(listed.isError, false, listed.result);
  const search = JSON.parse(
    (await runTool(tc, { name: "people", input: { action: "search", query: "", list: `list:${S_REG}` } })).result,
  );
  assert.deepEqual(search.people.map((p) => p.name).sort(), ["Luis Mora", "Rosa Diaz"]);
  const card = await buildProposal(tc, "propose_sequence", {
    action: "once",
    template_id: TPL,
    audience_kind: "saved",
    audience_id: S_REG,
    params: [],
  });
  assert.equal(card.isError, false, card.result);
  assert.deepEqual([card.proposal.payload.audience_label, card.proposal.payload.count], ["Regulars", 1]);
  const selects = (table) => ctx.supabase.seen.filter((q) => q.table === table && q.op === "select").length;
  assert.deepEqual(
    [selects("segments"), selects("segment_members")],
    [1, 1],
    "the lists and their members once, for the listing, the search and the card alike",
  );
});

test("a read the page tolerates, AI tolerates as the page does and says so: a failed channels read is workspace.settings' channels and campaigns.audiences' number null, a failed templates read campaigns.audiences' templates null -- each with its sentence, never none and never a failed tool, said once in the log; everything else still answers; the turn keeps no failure, so the next tool reads again", async () => {
  const world = () => tables({ tenant_channels: CHANNELS, templates: [OFFER] });
  const answers = async (faults, names) => {
    const ctx = ctxFor(world(), RPCS, faults);
    const tc = newToolContext(ctx, A, "owner", TZ, NOW);
    const out = {};
    const { lines } = await logged("ask_tool_read_failed", async () => {
      for (const name of names) {
        const [tool, action] = name.split(".");
        out[name] = await runTool(tc, { name: tool, input: { action } });
      }
    });
    return { ctx, out, lines };
  };
  const parsed = (o) => JSON.parse(o.result);
  const without = (o, ...keys) => Object.fromEntries(Object.entries(o).filter(([k]) => !keys.includes(k)));
  const healthy = await answers({}, ["workspace.settings", "sequences.lists"]);
  const settings = parsed(healthy.out["workspace.settings"]);
  const listing = parsed(healthy.out["sequences.lists"]);
  assert.equal("could_not_read" in settings || "could_not_read" in listing, false, "nothing to say when all was read");

  // The channels: workspace.settings, then campaigns.audiences, in one turn.
  const noChannels = await answers({ "tenant_channels.select": { message: "channels down" } }, [
    "workspace.settings",
    "sequences.lists",
  ]);
  const s = parsed(noChannels.out["workspace.settings"]);
  assert.equal(noChannels.out["workspace.settings"].isError, false, noChannels.out["workspace.settings"].result);
  assert.deepEqual(
    [s.channels, s.could_not_read],
    [null, ["The channels could not be read just now."]],
    "never [] -- no channels read is not no channels",
  );
  assert.deepEqual(without(s, "channels", "could_not_read"), without(settings, "channels"), "the rest still answers");
  const a = parsed(noChannels.out["sequences.lists"]);
  assert.equal(noChannels.out["sequences.lists"].isError, false, noChannels.out["sequences.lists"].result);
  // Which channels carry offers is said of the channels too (offers_go_by): unread, it is not said, never guessed.
  assert.ok(typeof listing.offers_go_by === "string", listing.offers_go_by);
  assert.deepEqual(
    [a.number, a.could_not_read, a.offers_go_by],
    [null, ["The WhatsApp number's state could not be read just now."], undefined],
    "no number known, never 'no number'",
  );
  assert.deepEqual(
    without(a, "number", "could_not_read"),
    without(listing, "number", "offers_go_by"),
    "the audiences still answer",
  );
  assert.equal(
    noChannels.ctx.supabase.seen.filter((q) => q.table === "tenant_channels" && q.op === "select").length,
    3,
    // The failure was not kept (campaigns.audiences read the channels again), and the pool's readiness is a read of its own.
    "workspace.settings, campaigns.audiences and the pool's readiness each read the channels",
  );
  assert.deepEqual(
    noChannels.lines.map((l) => JSON.parse(l)).map((x) => [x.tool, x.read, x.tenant_id]),
    [
      ["workspace.settings", "channels", A],
      ["sequences.lists", "channels", A],
    ],
  );

  // The templates.
  const noTemplates = await answers({ "templates.select": { message: "templates down" } }, ["sequences.lists"]);
  const t = parsed(noTemplates.out["sequences.lists"]);
  assert.equal(noTemplates.out["sequences.lists"].isError, false, noTemplates.out["sequences.lists"].result);
  assert.deepEqual(
    [t.templates, t.cannot_send, t.could_not_read],
    [null, null, ["The messages could not be read just now: say so, and propose no send until they can."]],
    "the templates' own state, never 'no template yet'",
  );
  assert.deepEqual(
    without(t, "templates", "cannot_send", "could_not_read"),
    without(listing, "templates", "cannot_send"),
    "the audiences and the number still answer",
  );
  assert.equal(noTemplates.lines.length, 1, "said once in the log");
});

test("the row the scope names rides in whole, read by its own tool and action: a call, a person, a thread; since PR 4.3 a lead, a search and a run (the Broadcasts row its address names) too; a page needs no read", () => {
  const X = "77777777-7777-4777-8777-777777777777";
  assert.deepEqual(scopedRead({ kind: "call", id: X, label: "this call" }), {
    name: "calls",
    input: { action: "get", call_id: X },
  });
  assert.deepEqual(scopedRead({ kind: "person", id: X, label: "Rosa" }), {
    name: "people",
    input: { action: "get", contact_id: X },
  });
  for (const kind of ["thread", "conversation"])
    assert.deepEqual(scopedRead({ kind, id: X, label: "Rosa" }), {
      name: "inbox",
      input: { action: "thread", conversation_id: X, more: false },
    });
  assert.deepEqual(scopedRead({ kind: "lead", id: X, label: "Zilker Strength" }), {
    name: "leads",
    input: { action: "lead", lead_id: X },
  });
  // On a search's view, the lead is read as that search found it: the membership its peek shows, never its newest.
  const S = "66666666-6666-4666-8666-666666666666";
  assert.deepEqual(scopedRead({ kind: "lead", id: X, label: "Zilker Strength" }, `clients/leads:s-${S}:p-${X}`), {
    name: "leads",
    input: { action: "lead", lead_id: X, search_id: S },
  });
  assert.deepEqual(scopedRead({ kind: "lead", id: X, label: "Zilker Strength" }, `clients/leads:l-ready:p-${X}`), {
    name: "leads",
    input: { action: "lead", lead_id: X },
  });
  assert.deepEqual(scopedRead({ kind: "search", id: X, label: "Trainers" }), {
    name: "leads",
    input: { action: "search", search_id: X },
  });
  assert.deepEqual(scopedRead({ kind: "run", id: X, label: "Monday offer" }), {
    name: "sequences",
    input: { action: "batch", broadcast_id: X },
  });
  assert.equal(scopedRead({ kind: "page", id: "reports", label: "Reports" }), null, "a page");
  assert.equal(scopedRead(null), null);
  // Each is a read every role is offered: the scope's row is never refused for the role that looks at it.
  for (const kind of ["call", "person", "thread", "lead", "search", "run"]) {
    const run = scopedRead({ kind, id: X, label: kind });
    const t = toApiTools("viewer", false).find((x) => x.name === run.name);
    assert.ok(t.input_schema.properties.action.enum.includes(run.input.action), `${kind}: a viewer's`);
  }
});

test("a run the person is looking at is the Broadcasts row the page drew: the answer cites it as a broadcast, opened at its run; run is no citation's kind", async () => {
  const RUN = "abababab-0000-4000-8000-0000000000c1";
  const built = builtWith([{ kind: "broadcast", id: RUN, route: `broadcasts/run:${RUN}`, label: "Monday offer" }]);
  const s = scripted([
    ROUND([
      answer("Monday offer went to 40 people; 3 replied.", {
        show: {
          items: [
            {
              title: "Monday offer",
              meta: "",
              line: "",
              source: { kind: "broadcast", id: RUN, label: "Monday offer" },
            },
          ],
        },
        do: { open: { source: { kind: "run", id: RUN, label: "Monday offer" }, label: "", now: false }, next: [] },
      }),
    ]),
  ]);
  const scope = { kind: "run", id: RUN, label: "Monday offer" };
  assert.deepEqual(
    scopedRead(scope),
    { name: "sequences", input: { action: "batch", broadcast_id: RUN } },
    "a run is read by its id, as the broadcast it is",
  );
  const r = await runAskTurn(
    turn(ctxFor(), {
      surface: "campaigns",
      scope,
      context: { ...PAGE, surface: "campaigns", route: `broadcasts/run:${RUN}`, view: "broadcasts" },
    }).input,
    ports(s.round, { context: async () => built }),
  );
  assert.equal(r.failed, false, r.failure ?? "");
  assert.deepEqual(
    r.answer.show.items.map((i) => [i.source.kind, i.source.id, i.source.to]),
    [["broadcast", RUN, `broadcasts/run:${RUN}`]],
  );
  assert.equal(r.answer.do.open, null, "a run is written as a broadcast, never as a run");
});

test("a lead the person has open on a search's view rides in read as that search found it: the turn hands scopedRead the page's address", async () => {
  const LEAD = "abababab-0000-4000-8000-0000000000d1";
  const SEARCH = "abababab-0000-4000-8000-0000000000e1";
  const route = `clients/leads:s-${SEARCH}:p-${LEAD}`;
  const runs = [];
  const s = scripted([ROUND([answer("Zilker Strength is a strong fit.")])]);
  const r = await runAskTurn(
    turn(ctxFor(), {
      surface: "leads",
      scope: { kind: "lead", id: LEAD, label: "Zilker Strength" },
      context: { ...PAGE, surface: "leads", route, view: "all" },
    }).input,
    ports(s.round, {
      tool: async (_t, run) => {
        runs.push(run);
        return { result: "{}", isError: false, label: "" };
      },
    }),
  );
  assert.equal(r.failed, false, r.failure ?? "");
  assert.deepEqual(
    runs.filter((run) => run.input.action === "lead"),
    [{ name: "leads", input: { action: "lead", lead_id: LEAD, search_id: SEARCH } }],
  );
});

test("the cache's markers ride on each request's own copy (the Phase 5 plan, D10): system's two, the page's last block (bp3) and the last block of the request, moving each round (bp4) -- never more than four, never left on a block an earlier request marked, never on the turn as it keeps itself", async () => {
  const s = scripted([
    ROUND([tool("inbox", { action: "list", filter: "recent" }, "t-1")]),
    ROUND([tool("calls", { action: "list" }, "t-2")]),
    ROUND([answer("Rosa needs you.")]),
  ]);
  const built = builtWith([{ kind: "thread", id: C1, route: `inbox/th-${C1}`, label: "Rosa" }], [C1]);
  const r = await runAskTurn(
    turn(ctxFor(), { context: { ...PAGE, rows: [{ kind: "thread", id: C1 }] } }).input,
    ports(s.round, { context: async () => built }),
  );
  assert.equal(r.failed, false, r.failure ?? "");
  // The question's message: the page's figures, its row, the question; the turn's words after it, as the
  // operator's (the answer canvas, A3). Then each round and its results: bp4 on the words, then on each round's last
  // result, never on the one before.
  assert.deepEqual(s.requests.map(markersOf), [
    ["system.0", "system.1", "messages.0.1", "messages.1.0"],
    ["system.0", "system.1", "messages.0.1", "messages.3.0"],
    ["system.0", "system.1", "messages.0.1", "messages.5.0"],
  ]);
  assert.deepEqual(
    s.requests.map((q) => q.messages.length),
    [2, 4, 6],
    "each request its own copy: the first is as it was sent, whatever the rounds after it appended",
  );
  assert.deepEqual(s.requests[2].messages[0].content[2], { type: "text", text: "Who needs me?" }, "bp4 moved on");
  assert.equal(s.requests[2].messages[1].role, "system", "the words, where the first request said them");
  assert.equal(s.requests[1].messages[3].content[0].type, "tool_result", "bp4 on a round's result");
  assert.ok(!JSON.stringify(r.raw).includes("cache_control"), "the turn as it keeps itself carries no marker");
  // No page: bp3 has nothing to mark, and the request carries three.
  const bare = scripted([ROUND([answer("Nothing waiting.")])]);
  await runAskTurn(turn(ctxFor()).input, ports(bare.round));
  assert.deepEqual(markersOf(bare.requests[0]), ["system.0", "system.1", "messages.1.0"]);
});

test("the request: system is two blocks with two breakpoints; the question's message is the page's data, its last block the third breakpoint, then the question; the turn's words follow it as the operator's system message (the answer canvas, A3) -- and the clock, the person and the page are never in the cached system blocks", async () => {
  const s = scripted([ROUND([answer("Rosa needs you.")])]);
  const built = builtWith([{ kind: "thread", id: C1, route: `inbox/th-${C1}`, label: "Rosa" }], [C1]);
  const r = await runAskTurn(
    turn(ctxFor(), { context: { ...PAGE, rows: [{ kind: "thread", id: C1 }] } }).input,
    ports(s.round, { context: async () => built }),
  );
  assert.equal(r.failed, false, r.failure ?? "");
  const req = s.requests[0];
  assert.deepEqual(
    req.system.map((b) => !!b.cache_control),
    [true, true],
    "the rules and facts, then the shape",
  );
  assert.ok(!JSON.stringify(req.system).includes("You are speaking with"), "the person is not in system");
  const q = askedOf(req);
  assert.equal(q, req.messages.at(-2), "the question's message, then the words");
  assert.deepEqual(
    q.content.map((c) => [c.type, c.source ?? null, !!c.cache_control]),
    [
      ["search_result", "page://today", false],
      ["search_result", `thread://${C1}`, true],
      ["text", null, false],
    ],
    "the page's figures, its row with the breakpoint, the question",
  );
  assert.equal(q.content[2].text, "Who needs me?", "the question last, alone");
  const w = req.messages.at(-1);
  assert.equal(w.role, "system", "the turn's words: the operator's, after the person's turn");
  assert.deepEqual(
    w.content.map((c) => [c.type, !!c.cache_control]),
    [["text", true]],
    "text alone, with the request's last breakpoint (D10)",
  );
  assert.ok(w.content[0].text.includes("You are speaking with ada@example.com"), "the words say who is asking");
  assert.ok(w.content[0].text.includes("The page they are on is in the search results before these words"));
  assert.deepEqual([r.shape.context_rows, r.shape.warm, r.shape.context_chars], [1, "hit", 30]);
});

test("the bytes before the messages are the same on two pages and for two people of one role, for each of the four roles: the tools and system cache for everyone of that role (D12)", async () => {
  const prefix = (r) => JSON.stringify({ system: r.system, tools: r.tools, model: r.model });
  const byRole = {};
  for (const role of ["viewer", "operator", "partner", "owner"]) {
    const requests = [];
    const run = async (over) => {
      const s = scripted([ROUND([answer("Fine.")])]);
      await runAskTurn(turn(ctxFor(), { role, ...over }).input, ports(s.round));
      requests.push(s.requests[0]);
    };
    await run({ surface: "today", context: PAGE });
    await run({ surface: "inbox", context: { ...PAGE, surface: "inbox", route: "inbox" } });
    await run({ surface: "reports", personLabel: `sam@example.com (${role})` });
    assert.equal(prefix(requests[1]), prefix(requests[0]), `${role}: another page`);
    assert.equal(prefix(requests[2]), prefix(requests[0]), `${role}: another person of the same role`);
    byRole[role] = prefix(requests[0]);
  }
  assert.equal(new Set(Object.values(byRole)).size, 4, "four prefixes, one per role");
});

test("the request's tools are the registry's: the three fields and no examples (the answer canvas, A4), defer_loading on every tool outside the core, and the tool search last; the same bytes on every round of a turn", async () => {
  const s = scripted([
    ROUND([tool("inbox", { action: "list", filter: "recent" })]),
    ROUND([answer("Nobody is waiting on you.")]),
  ]);
  const r = await runAskTurn(turn(ctxFor()).input, ports(s.round));
  assert.equal(r.failed, false, r.failure ?? "");
  // An operator's tools (D12), in the registry's order: sorted by name.
  const registry = toApiTools("operator", false);
  assert.equal(s.requests[0].tools.length, registry.length);
  for (const [i, sent] of s.requests[0].tools.entries()) {
    const own = registry[i];
    assert.equal(sent.name, own.name);
    if (own.type) {
      assert.deepEqual(sent, { type: "tool_search_tool_bm25_20251119", name: "tool_search_tool_bm25" }, "the search");
      continue;
    }
    assert.deepEqual(
      Object.keys(sent),
      [
        "name",
        "description",
        "input_schema",
        ...(own.input_examples ? ["input_examples"] : []),
        ...(CORE_TOOLS.has(own.name) ? [] : ["defer_loading"]),
      ],
      `${own.name}: the fields the API takes, the examples after the schema, deferred outside the core`,
    );
    assert.deepEqual(sent.input_examples, own.input_examples, own.name);
  }
  assert.equal(s.requests[0].tools.at(-1).name, "tool_search_tool_bm25", "the tool search last");
  const withExamples = s.requests[0].tools.filter((t) => t.input_examples).map((t) => t.name);
  assert.deepEqual(withExamples, [], "no tool's examples ride with it: the core cases did as well without them");
  assert.equal(JSON.stringify(s.requests[1].tools), JSON.stringify(s.requests[0].tools), "the second round, the same");
});

test("the retries run in their order, each once: the page's data, then the tool search, then the answer's format; the fourth request carries none of them and the turn answers", async () => {
  const requests = [];
  const refusals = [
    "400 messages.0.content.0: search_result is not supported here",
    "400 tools.25: tool_search_tool_bm25 is not supported",
    "400 output_config.format.schema: too many properties",
  ];
  const round = async (c) => {
    requests.push(structuredClone(c.request));
    const message = refusals.shift();
    if (message) throw new GatewayRefused({ kind: "bad_request", message });
    return ROUND([answer("2 people need you.")]);
  };
  // Every refusal the turn logged, in the order it logged them.
  const said = [];
  const was = console.error;
  console.error = (...args) => {
    const line = logLineOf(args);
    if (line && /^ask_.*_rejected$/.test(line.event)) said.push(line.event);
  };
  let r;
  try {
    r = await runAskTurn(turn(ctxFor(), { context: PAGE }).input, ports(round));
  } finally {
    console.error = was;
  }
  assert.equal(r.failed, false, r.failure ?? "");
  assert.equal(requests.length, 4, "three retries, then the answer");
  const has = (q) => ({
    data: JSON.stringify(q.messages).includes("search_result"),
    search: q.tools.some((t) => t.name === "tool_search_tool_bm25"),
    format: !!q.output_config.format,
  });
  assert.deepEqual(requests.map(has), [
    { data: true, search: true, format: true },
    { data: false, search: true, format: true },
    { data: false, search: false, format: true },
    { data: false, search: false, format: false },
  ]);
  assert.deepEqual(
    said,
    ["ask_context_rejected", "ask_tool_search_rejected", "ask_format_rejected"],
    "each said once, in that order",
  );
  assert.deepEqual([r.shape.context_dropped, r.shape.format], [true, false]);
});

test("fifteen names move five spans of the request (PR 4.2; a visit and a review, 15 Oct 2026): the format's kind enum, its source's words and its items' words, the rules' items list and their source rule", async () => {
  const s = scripted([ROUND([answer("Fine.")])]);
  await runAskTurn(turn(ctxFor(), { role: "owner" }).input, ports(s.round));
  const req = s.requests[0];
  const { show, do: act } = req.output_config.format.schema.properties;
  const sources = [
    show.properties.figures.items.properties.source,
    show.properties.items.items.properties.source,
    show.properties.breakdown.properties.source,
    act.properties.open.properties.source,
  ];
  for (const source of sources) {
    assert.deepEqual(source.properties.kind.enum, [...ASK_CITATION_KINDS, "none"], "a page, fourteen rows, and none");
    assert.ok(source.description.includes("(a page's id is its route; a run is kind broadcast)"), source.description);
  }
  const every =
    "people, threads, calls, leads, searches, deals, lists, broadcasts, playbooks, templates, mailboxes, appointments, reviews";
  assert.equal(ASK_ROW_WORDS, every, "the rows an answer's items may name, said once");
  assert.ok(
    show.properties.items.description.startsWith(`The rows the answer names (${every}), at most 5;`),
    show.properties.items.description,
  );
  const rules = req.system[0].text;
  assert.ok(rules.includes(`items for the rows it names (${every})`), "the rules' items list says the same words");
  assert.ok(
    rules.includes("A send that went out is kind broadcast; a list is kind list, with the audience_id it came with."),
    "the source rule says how the two rows whose word differs are cited",
  );
  assert.ok(!rules.includes("items for the rows it names (people, threads, calls),"), "the three-kind list is gone");
});

test("a rule that described one tool is that tool's description now, and out of the rules block (PR 3.3, D9); a rule about answering in general stays", async () => {
  // An owner, offered every tool (D12).
  const s = scripted([ROUND([answer("Fine.")])]);
  await runAskTurn(turn(ctxFor(), { role: "owner" }).input, ports(s.round));
  const rules = s.requests[0].system[0].text;
  const said = (name) => s.requests[0].tools.find((t) => t.name === name).description;
  // [what left the rules in PR 3.3, in the old tools' names, the tool it landed in since PR 3.4, how that tool says it]
  const moved = [
    [
      "get_settings is for the reply policy's dials, the channels and the notifications",
      "workspace",
      "Call it for the reply policy's dials, the channels and the notifications",
    ],
    ["(get_thread, get_call)", "inbox", "when the whole conversation is needed"],
    ["(get_today, list_threads, list_calls)", "inbox", "for what the page on screen does not hold"],
    [
      "(a reply, a rewrite, an Inbox action, a setting, an invitation, a whisper, a broadcast, a lead search)",
      "propose_reply",
      "a rewrite in words",
    ],
    ["Read list_audiences before any broadcast", "sequences", "read before any send"],
    ["never propose a broadcast to nobody", "propose_sequence", "never propose a send to nobody"],
    [
      "read list_lead_searches, then propose_lead_search: one plan, never a search",
      "propose_lead_search",
      "Read leads with action searches first where they did not come with the question, so a plan is not repeated: one plan, never a search",
    ],
    [
      "words that answer it are propose_lead_search with amends",
      "leads",
      "words that answer it are propose_lead_search with action find and amends set to that search's id",
    ],
    [
      "never say a search has started until the card is approved",
      "propose_lead_search",
      "never say a search has started until the card is approved",
    ],
    ["(read list_audiences)", "propose_sequence", "action lists for who can be sent"],
  ];
  for (const [gone, name, landed] of moved) {
    assert.ok(!rules.includes(gone), `out of the rules: ${gone}`);
    assert.ok(said(name).includes(landed), `${name} says: ${landed}`);
  }
  for (const kept of [
    "Every change is a card a person presses",
    "Answer from it when it is enough, in one round.",
    "Read only for what it does not hold: a whole conversation or transcript, a person's profile",
    "a one-off send reaches only the people whose yes covers its message",
    "leads are businesses and people the finder found for the owner to reach",
    "Leads are found only in the US",
  ])
    assert.ok(rules.includes(kept), `kept, about answering in general: ${kept}`);
});

test("a row the page carried can be cited; one it did not, and one another workspace holds, cannot; a figure answered from the page is grounded, and with no page it is not", async () => {
  const rosa = { kind: "thread", id: C1, label: "Rosa" };
  const foreign = { kind: "thread", id: "99999999-9999-4999-8999-999999999999", label: "Someone" };
  const s = scripted([
    ROUND([
      answer("2 people need you.", {
        show: {
          items: [
            { title: "Rosa", meta: "", line: "", source: rosa },
            { title: "Someone", meta: "", line: "", source: foreign },
          ],
        },
      }),
    ]),
  ]);
  const built = builtWith([{ kind: "thread", id: C1, route: `inbox/th-${C1}`, label: "Rosa" }], [C1]);
  const r = await runAskTurn(turn(ctxFor(), { context: PAGE }).input, ports(s.round, { context: async () => built }));
  assert.deepEqual(
    r.answer.show.items.map((i) => i.source.id),
    [C1],
    "the page's row is a source; a row nobody read is dropped",
  );
  assert.equal(r.ungrounded, false, "a figure from the page is from the workspace");
  const bare = await runAskTurn(turn(ctxFor()).input, ports(scripted([ROUND([answer("2 people need you.")])]).round));
  assert.equal(bare.ungrounded, true, "with no page and no read, a figure is not");
});

test("the row the scope names rides in whole, read by its own tool, as data beside the page -- never as a tool the model called", async () => {
  const s = scripted([ROUND([answer("Rosa asked about Saturday.")])]);
  const r = await runAskTurn(
    turn(ctxFor(), { context: PAGE, scope: { kind: "thread", id: C1, label: "Rosa" } }).input,
    ports(s.round),
  );
  assert.equal(r.failed, false, r.failure ?? "");
  const data = askedOf(s.requests[0]).content.filter((c) => c.type === "search_result");
  assert.deepEqual(
    data.map((b) => [b.source, !!b.cache_control]),
    [
      ["page://today", false],
      ["read://inbox.thread", true],
    ],
    "the page, then the scope's row, the breakpoint on the last",
  );
  assert.ok(fromRecord(data[1].content[0].text).messages, "the thread, as inbox.thread reads it");
  assert.deepEqual(r.tools, [], "the model called nothing");
});

test("a request refused while it carries the page's data is asked once more without it, before the answer's format is ever given up; the words stop pointing at it, and its reads leave the count", async () => {
  const requests = [];
  const refusals = ["400 messages.0.content.0: search_result is not supported here"];
  const round = async (c) => {
    requests.push(structuredClone(c.request));
    const message = refusals.shift();
    if (message) throw new GatewayRefused({ kind: "bad_request", message });
    return ROUND([answer("2 people need you.")]);
  };
  const { result: r, lines } = await logged(
    "ask_context_rejected",
    async () => await runAskTurn(turn(ctxFor(), { context: PAGE }).input, ports(round)),
  );
  assert.equal(r.failed, false, r.failure ?? "");
  assert.equal(requests.length, 2, "asked again, once");
  assert.equal(lines.length, 1, "said once");
  const retry = requests[1];
  assert.ok(!JSON.stringify(retry.messages).includes("search_result"), "without the page's data");
  assert.ok(
    !JSON.stringify(retry.messages).includes("search results before these words"),
    "the words point at nothing",
  );
  assert.ok(retry.output_config.format, "the answer's format kept");
  assert.equal(r.ungrounded, true, "the page it could not read grounds nothing");
  assert.equal(r.shape.context_dropped, true, "the drop is recorded");
});

test("only a refusal that names the data blocks drops them: the format's refusal drops the format and keeps the page, and an overload or a size is the turn's, the page never dropped for it", async () => {
  const refusing = async (refusals) => {
    const requests = [];
    const round = async (c) => {
      requests.push(structuredClone(c.request));
      const message = refusals.shift();
      if (message) throw new GatewayRefused({ kind: "bad_request", message });
      return ROUND([answer("2 people need you.")]);
    };
    const { result } = await logged(
      "ask_",
      async () => await runAskTurn(turn(ctxFor(), { context: PAGE }).input, ports(round)),
    );
    return { r: result, requests };
  };
  const format = await refusing(["400 output_config.format.schema: too many properties"]);
  assert.equal(format.r.failed, false, format.r.failure ?? "");
  assert.equal(format.requests.length, 2, "asked again, once");
  assert.ok(JSON.stringify(format.requests[1].messages).includes("search_result"), "the page kept");
  assert.equal(format.requests[1].output_config.format, undefined, "the format dropped");
  assert.equal(format.r.shape.context_dropped, false);
  for (const m of ["529 overloaded", "429 rate limited", "413 request too large", "400 messages: too long"]) {
    const other = await refusing([m]);
    assert.deepEqual([other.r.failure, other.requests.length], ["bad_request", 1], m);
    assert.equal(other.r.shape.context_dropped, false, m);
  }
  const all = { context: true, examples: true, format: true };
  assert.equal(dropFor("400 messages.0.content.1.cache_control: too many breakpoints", all), "context");
  assert.equal(dropFor("500 search_result upstream", all), null, "a 400 only");
});

test("a page counts as a read only when something on it was read: not one whose read failed, nor the address alone of a page AI does not draw", async () => {
  const ask = async (context, built) =>
    await runAskTurn(
      turn(ctxFor(), { context }).input,
      ports(scripted([ROUND([answer("2 people need you.")])]).round, { context: async () => built }),
    );
  assert.equal((await ask(PAGE, BUILT)).ungrounded, false, "a page read grounds its figures");
  const failed = await ask(PAGE, { ...BUILT, failed: true, warm: "miss" });
  assert.equal(failed.ungrounded, true, "a page that could not be read grounds nothing");
  assert.equal(failed.shape.warm, "failed", "and is said as failed");
  const other = { ...PAGE, surface: "other", route: "billing" };
  assert.equal((await ask(other, BUILT)).ungrounded, true, "an address alone grounds nothing");
});

test("the history folds a question of blocks: words joined with words, and words beside blocks as one list, the words first", () => {
  const q = [
    { type: "search_result", source: "page://today" },
    { type: "text", text: "Who?" },
  ];
  assert.deepEqual(foldHistory([{ role: "assistant", text: "Hi" }], q), [{ role: "user", content: q }]);
  assert.deepEqual(foldHistory([{ role: "user", text: "a" }], q), [
    { role: "user", content: [{ type: "text", text: "a" }, ...q] },
  ]);
  assert.deepEqual(
    foldHistory(
      [
        { role: "user", text: "a" },
        { role: "assistant", text: "b" },
      ],
      q,
    ),
    [
      { role: "user", content: "a" },
      { role: "assistant", content: "b" },
      { role: "user", content: q },
    ],
  );
});

test("the turn as the model was sent it (the Phase 5 plan, D2, D11): a one-round answer's raw is its request's messages -- the words history before the question, none on a thread's first, the question as the request carried it (the page's data, the question, an earlier question the fold joined in), the turn's words after it -- and its round as a request would carry it back, a thinking block and a redacted one byte for byte; the round's start, the model, the prefix's hash; no results", async () => {
  const final = [
    thinking("sig-final-EmwKAhgB", "Two threads wait."),
    redacted("EmwKAhgBEgw="),
    answer("Rosa needs you."),
  ];
  const s = sentAs([ROUND(final)]);
  const before = Date.now();
  const r = await runAskTurn(turn(ctxFor(), { context: PAGE }).input, ports(s.round));
  const after = Date.now();
  assert.equal(r.failed, false, r.failure ?? "");
  assert.ok(r.raw, "the turn returns the turn as it was sent");
  assert.deepEqual(Object.keys(r.raw), ["base", "question", "rounds", "final", "results", "at", "model", "prefix"]);
  const want = rawOf(s.requests);
  assert.deepEqual(
    want.question.map((b) => b.type),
    ["search_result", "text"],
    "the page's data, the question",
  );
  sameBytes(messagesOf(r.raw), sentOf(s.requests.at(-1)), "the request's messages, byte for byte");
  assert.deepEqual(r.raw.base, [], "a thread's first turn: nothing before the question");
  sameBytes(r.raw.question, want.question, "the question as the request carried it");
  assert.deepEqual(
    r.raw.rounds.map((m) => m.role),
    ["system"],
    "one round: the turn's words after the question, as the operator's, and nothing else",
  );
  assert.deepEqual(r.raw.final, [
    { type: "thinking", thinking: "Two threads wait.", signature: "sig-final-EmwKAhgB" },
    { type: "redacted_thinking", data: "EmwKAhgBEgw=" },
    { type: "text", text: answerJson("Rosa needs you.") },
  ]);
  sameBytes(r.raw.final, replayBlocks(final), "the round as a request would carry it back");
  assert.deepEqual(r.raw.results, [], "no call waits on a result");
  assert.ok(r.raw.at >= before && r.raw.at <= after, "when the round started, epoch ms");
  assert.deepEqual([r.raw.model, r.raw.prefix], [ASK_MODEL, want.prefix], "the model the request named, its prefix");
  assert.equal(want.model, ASK_MODEL);

  // A follow-up: the thread's earlier turns as the request carried them, words, are the raw's base.
  const history = [
    { role: "user", text: "Who called today?" },
    { role: "assistant", text: "Two people called." },
  ];
  const follow = sentAs([ROUND([answer("Rosa needs you.")])]);
  const f = await runAskTurn(turn(ctxFor(), { context: PAGE, history }).input, ports(follow.round));
  sameBytes(messagesOf(f.raw), sentOf(follow.requests.at(-1)), "the follow-up's messages, byte for byte");
  sameBytes(f.raw.base, rawOf(follow.requests).base);
  assert.deepEqual(f.raw.base, [
    { role: "user", content: "Who called today?" },
    { role: "assistant", content: "Two people called." },
  ]);

  // A question the thread left unanswered is joined into this one (foldHistory): the raw's question carries it.
  const joined = sentAs([ROUND([answer("Nobody is waiting.")])]);
  const j = await runAskTurn(
    turn(ctxFor(), { context: PAGE, history: [{ role: "user", text: "Earlier, unanswered?" }] }).input,
    ports(joined.round),
  );
  sameBytes(messagesOf(j.raw), sentOf(joined.requests.at(-1)));
  assert.deepEqual(j.raw.base, [], "the unanswered question is no longer before this one");
  assert.deepEqual(j.raw.question[0], { type: "text", text: "Earlier, unanswered?" }, "the earlier question first");
});

test("a read, then the answer: the read's round -- its thinking whole, its call -- and the results sent back for it, with the words the loop added when the time for reads ran out, are the raw's rounds as the last request carried them; the raw's start is the answering round's, not the turn's", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: 1_000_000 });
  const read = [thinking("sig-read"), tool("inbox", { action: "list", filter: "recent" })];
  const final = [thinking("sig-final"), redacted("EmwKAhgB"), answer("Nobody is waiting on you.")];
  const s = sentAs([
    () => {
      // The read's round took the time another read would need: the loop says so beside its results.
      t.mock.timers.tick(ASK_TURN_BUDGET_MS - 7_000);
      return ROUND(read);
    },
    () => {
      // The answering round takes its time too: the raw's start is when it began, not when it ended.
      t.mock.timers.tick(30_000);
      return ROUND(final);
    },
  ]);
  const r = await runAskTurn(turn(ctxFor(), { context: PAGE }).input, ports(s.round));
  assert.equal(r.failed, false, r.failure ?? "");
  assert.deepEqual(
    s.requests.map((q) => q.tool_choice.type),
    ["auto", "none"],
    "the answering round was the last",
  );
  const want = rawOf(s.requests);
  sameBytes(messagesOf(r.raw), sentOf(s.requests.at(-1)), "the last request's messages, byte for byte");
  sameBytes(r.raw.question, want.question, "the question as the last request carried it");
  sameBytes(r.raw.rounds, want.rounds, "every message after the question, as the last request carried it");
  assert.deepEqual(
    r.raw.rounds.map((m) => m.role),
    ["system", "assistant", "user"],
    "the turn's words, then the read's round and its results",
  );
  assert.deepEqual(
    r.raw.rounds[1].content,
    [
      { type: "thinking", thinking: "", signature: "sig-read" },
      { type: "tool_use", id: "t-inbox.list", name: "inbox", input: { action: "list", filter: "recent" } },
    ],
    "the read's round, its thinking byte for byte",
  );
  assert.deepEqual(
    r.raw.rounds[2].content.map((b) => [b.type, b.tool_use_id ?? b.text]),
    [
      ["tool_result", "t-inbox.list"],
      ["text", "Time is up for reads. Answer now with what you have."],
    ],
    "the read's result, then the loop's words",
  );
  sameBytes(r.raw.final, replayBlocks(final), "the answering round as a request would carry it back");
  assert.deepEqual(r.raw.results, []);
  assert.equal(r.raw.at, 1_000_000 + ASK_TURN_BUDGET_MS - 7_000, "the answering round's start");
  assert.deepEqual([r.raw.model, r.raw.prefix], [want.model, want.prefix]);
});

test("cards alone, and an answer beside its cards: the round is the raw's final, and the results of its cards -- which no request carried -- are the blocks the next request would carry, byte for byte: those a round that goes on sends back for the same call", async () => {
  const act = tool("propose_settings", { action: "autonomy", class: "reply", mode: "ask" });
  // One card, the same bytes every turn: the builder's own id moves with the clock.
  const card = {
    id: "p-1",
    kind: "policy",
    needs: "operator",
    title: "Autonomy: reply",
    summary: "Ask first on every reply.",
    payload: { class: "reply", mode: "ask" },
    undo: null,
  };
  const propose = async () => ({
    proposal: card,
    result: JSON.stringify({ proposed: true, id: card.id, card: card.title }),
    isError: false,
  });
  // The card beside a read: the round goes on, and the next request carries the card's result.
  const on = sentAs([ROUND([tool("inbox", { action: "list", filter: "recent" }), act]), ROUND([answer("Proposed.")])]);
  await runAskTurn(turn(ctxFor()).input, ports(on.round, { propose }));
  const carried = sentOf(on.requests[1])
    .at(-1)
    .content.filter((b) => b.tool_use_id === act.id);
  assert.deepEqual(
    carried.map((b) => [b.type, b.is_error]),
    [["tool_result", false]],
  );

  const alone = sentAs([ROUND([thinking("sig-card"), act])]);
  const a = await runAskTurn(turn(ctxFor()).input, ports(alone.round, { propose }));
  assert.deepEqual([a.failed, a.rounds, a.proposals.length], [false, 1, 1], "cards alone: one round");
  sameBytes(a.raw.results, carried, "cards alone: the card's result, as the next request would carry it");
  assert.deepEqual(a.raw.final, [
    { type: "thinking", thinking: "", signature: "sig-card" },
    {
      type: "tool_use",
      id: act.id,
      name: "propose_settings",
      input: { action: "autonomy", class: "reply", mode: "ask" },
    },
  ]);
  sameBytes(messagesOf(a.raw), sentOf(alone.requests.at(-1)), "cards alone: the request's messages");
  assert.deepEqual(
    a.raw.rounds.map((m) => m.role),
    ["system"],
    "cards alone: the turn's words after the question, and nothing more",
  );

  const beside = [thinking("sig-both"), act, answer("I proposed asking you first on every reply.")];
  const both = sentAs([ROUND(beside)]);
  const b = await runAskTurn(turn(ctxFor()).input, ports(both.round, { propose }));
  assert.deepEqual([b.failed, b.rounds, b.text], [false, 1, "I proposed asking you first on every reply."]);
  sameBytes(b.raw.results, carried, "an answer beside its card: the card's result, as the next request would carry it");
  assert.deepEqual(
    b.raw.final.map((x) => x.type),
    ["thinking", "tool_use", "text"],
    "the round whole: its thinking, the card's call and the answer",
  );
  sameBytes(b.raw.final, replayBlocks(beside));
  sameBytes(messagesOf(b.raw), sentOf(both.requests.at(-1)), "an answer beside its card: the request's messages");
});

test("the prefix (the Phase 5 plan, D2): the sha256 of what the last request sent besides its messages -- system and tools as sent, the tool choice and the output config -- the same on another page, for another question, for another person of the role and on round two; another for another role, shape of the workspace, setting, note, hour or autonomy mode, once the tool search or the format is refused, and on the last round, which may call no tool; the page's data a refusal drops is dropped from the raw's question too; a turn that fails keeps no raw", async () => {
  const ask = async (over = {}, refusals = [], extra = {}) => {
    const requests = [];
    const round = async (c) => {
      requests.push(JSON.parse(JSON.stringify(c.request)));
      const message = refusals.shift();
      if (message) throw new GatewayRefused({ kind: "bad_request", message });
      return ROUND([answer("2 people need you.")]);
    };
    const { result: r } = await logged(
      "ask_",
      async () => await runAskTurn(turn(ctxFor(), { context: PAGE, ...over }).input, ports(round, extra)),
    );
    assert.equal(r.failed, false, r.failure ?? "");
    assert.equal(r.raw.prefix, rawOf(requests).prefix, "the last request's own");
    return { r, requests };
  };
  const plain = await ask();
  for (const over of [
    { surface: "inbox", context: { ...PAGE, surface: "inbox", route: "inbox" } },
    { text: "And tomorrow?" },
    { personLabel: "sam@example.com (operator)" },
  ])
    assert.equal((await ask(over)).r.raw.prefix, plain.r.raw.prefix, JSON.stringify(over));
  // The workspace's settings as the route reads them, one thing changed at a time.
  const config = tables().tenant_config[0].config;
  const profile = config.brain.profile;
  const facts = (brain = {}, policies = []) =>
    workspaceFacts("Harbor", TZ, { ...config, brain: { ...config.brain, ...brain } }, NOW, policies);
  const set = await ask({ facts: facts() });
  const changed = {
    role: await ask({ role: "owner", personLabel: "ada@example.com (owner)" }),
    shape: await ask({}, [], { shape: async () => "The workspace: Harbor · zone America/Chicago" }),
    setting: await ask({ facts: facts({ business_name: "Harbor Movers" }) }),
    note: await ask({ facts: facts({ profile: { ...profile, notes: [{ title: "Parking", text: "Street only." }] } }) }),
    hour: await ask({ facts: facts({ profile: { ...profile, hours: { mon: { open: "09:00", close: "18:00" } } } }) }),
    autonomy: await ask({ facts: facts({}, [{ class: "reply", mode: "ask" }]) }),
    search: await ask({}, ["400 tools.25: tool_search_tool_bm25 is not supported"]),
    format: await ask({}, ["400 output_config.format.schema: too many properties"]),
  };
  // The round a turn ended on: round two asks as round one does, with tool_choice auto; the last, which may call no
  // tool, asks with none -- a turn that used every round.
  const endedOn = async (reads) => {
    const s = sentAs([
      ...Array.from({ length: reads }, () => ROUND([tool("inbox", { action: "list", filter: "recent" })])),
      ROUND([answer("2 people need you.")]),
    ]);
    const r = await runAskTurn(turn(ctxFor(), { context: PAGE }).input, ports(s.round));
    assert.equal(r.failed, false, r.failure ?? "");
    assert.equal(r.raw.prefix, rawOf(s.requests).prefix, "the last request's own");
    return { r, requests: s.requests };
  };
  const second = await endedOn(1);
  assert.equal(second.r.raw.prefix, plain.r.raw.prefix, "round two asks as round one does");
  changed.last = await endedOn(ASK_MAX_ROUNDS - 1);
  assert.deepEqual(changed.last.requests.at(-1).tool_choice, { type: "none" });
  const prefixes = [plain, set, ...Object.values(changed)].map((x) => x.r.raw.prefix);
  assert.equal(new Set(prefixes).size, prefixes.length, "each change, its own prefix");
  assert.equal(changed.search.requests.length, 2, "asked again without the tool search");
  assert.equal(changed.format.r.shape.format, false, "and without the format");

  // The page's data refused: asked again without it, and the raw's question is the retry's, the words bare.
  const dropped = await ask({}, ["400 messages.0.content.0: search_result is not supported here"]);
  assert.ok(JSON.stringify(askedOf(dropped.requests[0])).includes("search_result"), "refused with the page");
  sameBytes(dropped.r.raw.question, rawOf(dropped.requests).question, "the retry's question");
  sameBytes(messagesOf(dropped.r.raw), sentOf(dropped.requests.at(-1)), "the retry's messages");
  assert.ok(!JSON.stringify(dropped.r.raw.question).includes("search_result"), "without the page's data");
  assert.ok(!JSON.stringify(dropped.r.raw.question).includes("search results before these words"), "the words bare");
  assert.equal(dropped.r.raw.prefix, plain.r.raw.prefix, "the data rode in the messages: the same prefix");

  // A turn that fails keeps nothing to replay (D2 never replays one).
  const failing = async (round) =>
    (await logged("ask_", () => runAskTurn(turn(ctxFor(), { context: PAGE }).input, ports(round)))).result;
  const readEveryRound = Array.from({ length: ASK_MAX_ROUNDS }, () =>
    ROUND([tool("inbox", { action: "list", filter: "recent" })]),
  );
  for (const [round, failure] of [
    [
      async () => {
        throw new GatewayRefused({ kind: "budget", used: 1, cap: 1 });
      },
      "budget",
    ],
    [scripted([ROUND([])]).round, "no_tool_no_text"],
    [scripted(readEveryRound).round, "rounds_exhausted"],
  ]) {
    const r = await failing(round);
    assert.deepEqual([r.failed, r.failure, r.raw], [true, failure, null], failure);
  }
});
