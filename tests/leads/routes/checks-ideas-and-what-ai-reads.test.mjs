/**
 * The checks read the judge's own keys; AI's leads answer what the page's builders answer; a kept search renamed or
 * removed; the ideas written from the line; two requests write once; the mailto; and Find more at its plan's price.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeDb } from "../../_fake-db.mjs";
import {
  LEAD_CLASS_WORDS,
  ROLE_PERMS,
  leadSearchWords,
  toLeadPeekVM,
  toLeadRowVM,
  leadMonth,
  leadDraftFooter,
} from "@chanlytics/contracts";
import { PLAN } from "../../_lead-fixtures.mjs";
import {
  A,
  COUNTS,
  GatewayRefused,
  L1,
  LEAD,
  NAME,
  OP,
  OTHER_SEARCH,
  R1,
  READ_DEFS,
  SEARCH,
  USER,
  askIdea,
  ctxOf,
  doors,
  erase,
  fakeModel,
  get,
  ideaStore,
  inA,
  keptIdeas,
  leadMailto,
  leadReader,
  leads,
  leadsReader,
  load,
  member,
  memberOf,
  modelCalls,
  more,
  newToolContext,
  oneLeadTables,
  pageRow,
  planFacts,
  readerContext,
  refused,
  req,
  rpcCalls,
  runTool,
  saved,
  search,
  searchReader,
  searchUndo,
  searches,
  searchesReader,
  send,
  setModelCalls,
  setModelStream,
  setServiceClient,
  setSuggestionsWriter,
  suggestions,
  toSearchDto,
  view,
  world,
} from "./_routes.mjs";

test("the checks read the judge's own keys: the kind and every criterion it answered, in its order, whatever the plan named them (PR 9)", async () => {
  const judged = (criteria) => ({
    op_id: OP,
    term: "personal trainer",
    model: "m",
    reasons: ["fit"],
    answer: { ref: 1, reason: "open Saturdays, per the listing", criteria },
  });
  const out = await leads.GET.run(
    get(inA),
    ctxOf(
      world({ role: "viewer" }),
      {},
      doors({
        leads_page: () => [
          pageRow({
            judgment: judged([
              { key: "kind", answer: "pass", facts: ["name", "category"] },
              { key: "open_weekends", answer: "unknown", facts: [] },
              { key: "chains", answer: "fail", facts: ["name", "site"] },
              // Answered from the listing's own numbers: a fact the listing shows, seen there, never Claude's read.
              { key: "rated_low", answer: "pass", facts: ["rating", "reviews"] },
              // A key that shares a seen check's name is measured, never read: it is not said twice.
              { key: "mailbox", answer: "pass", facts: ["emails"] },
            ]),
          }),
        ],
      }),
    ),
  );
  const read = out.rows[0].member.checks.filter((c) => c.how === "read");
  assert.deepEqual(
    read.map((c) => [c.key, c.answer, c.source, c.reason]),
    [
      ["kind", "yes", "AI · the listing", "open Saturdays, per the listing"],
      ["open_weekends", "unknown", "AI · the listing", "open Saturdays, per the listing"],
      ["chains", "no", "AI · their website", "open Saturdays, per the listing"],
    ],
    "every criterion the judge answered, under the plan's key: only LEAD_CHECK_KEYS were, and no plan's keys were those",
  );
  assert.equal(out.rows[0].member.checks.filter((c) => c.key === "mailbox").length, 1, "the mailbox is the seen one");
  const rated = out.rows[0].member.checks.find((c) => c.key === "rated_low");
  assert.deepEqual(
    [rated.how, rated.answer, rated.source],
    ["seen", "yes", "Google Maps · rating, reviews"],
    "a criterion the listing's numbers answer is seen on the listing",
  );
});

test("GET leads/[id] answers one lead as a row of the page, built by the list's own builder, for any member; a lead gone or not theirs is a 404 (PR 9)", async () => {
  assert.deepEqual(
    erase.GET.policy,
    { kind: "read", scope: "workspace", role: null, rate: null, spend: false },
    "the workspace the tab named, never the lead's own",
  );
  const OTHER = OTHER_SEARCH;
  const tables = oneLeadTables;
  const one = (q, t = tables(), params = { id: LEAD }) =>
    erase.GET.run(get(`${inA}${q}`), ctxOf(t, params, { ...doors(), lead_member_of: memberOf(t) }));
  const listed = (await leads.GET.run(get(inA), ctxOf(world({ role: "viewer" }), {}, doors()))).rows[0];
  const { row } = await one(`&search=${SEARCH}`);
  assert.deepEqual(
    { ...row, places: listed.places },
    listed,
    "the same row the list answers for this lead in this search, word for word",
  );
  assert.equal(row.places, 2, "the places it was found at, counted");
  assert.equal((await one("")).row.search_id, SEARCH, "no search named: the newest membership");
  assert.equal((await one(`&search=${OTHER}`)).row.member.class, "review", "a search named: its own membership");
  await refused(one(`&search=${SEARCH}`, tables({ member: { blanked_at: "2026-09-20T00:00:00Z" } })), "not_found", 404);
  await refused(one("", tables({ lead: { erased_at: "2026-09-20T00:00:00Z" } })), "not_found", 404);
  await refused(one("", tables(), { id: OTHER }), "not_found", 404);
  await refused(one("&search=nope"), "validation", 400);
  assert.deepEqual(
    rpcCalls("lead_member_of").at(-1),
    { p_tenant_id: A, p_lead_id: OTHER },
    "the membership is asked for in the workspace the tab named",
  );
  // A member of two workspaces, on A's page, opening a lead of B's: never drawn, or acted on, in A.
  const B = "bbbbbbbb-4444-4444-8444-bbbbbbbbbbbb";
  const two = tables();
  two.memberships = [...two.memberships, { ...two.memberships[0], tenant_id: B, tenants: { slug: "other" } }];
  two.leads = two.leads.map((l) => ({ ...l, tenant_id: B }));
  two.lead_search_members = two.lead_search_members.map((m) => ({ ...m, tenant_id: B }));
  await refused(one(`&search=${SEARCH}`, two), "not_found", 404);
  assert.equal(
    (
      await erase.GET.run(
        get(`?workspace=${B}`),
        ctxOf(two, { id: LEAD }, { ...doors(), lead_member_of: memberOf(two) }),
      )
    ).row.id,
    LEAD,
    "and in B's own page it opens",
  );
});

test("one lead and one search, for AI and for the page (PR 4.3): GET leads/[id] and GET lead-searches/[id] answer their readers' payloads byte for byte, in the workspace the tab named; each reader's one row is what a citation names -- the lead at its peek on the view's search, the search on Leads at that search -- and the search, through the rail's own mapping, is the row GET lead-searches lists for it", async () => {
  const t = oneLeadTables();
  const doorsOf = (x) => ({ ...doors(), lead_member_of: memberOf(x) });
  const rc = () => readerContext(ctxOf(t, {}, doorsOf(t)), { tenantId: A, role: "viewer" });
  for (const q of [{}, { search: SEARCH }, { search: OTHER_SEARCH }]) {
    const page = await erase.GET.run(
      get(`${inA}${q.search ? `&search=${q.search}` : ""}`),
      ctxOf(t, { id: LEAD }, doorsOf(t)),
    );
    const r = await load(rc(), leadReader, { id: LEAD, ...q });
    assert.equal(JSON.stringify(r.data), JSON.stringify(page), `${JSON.stringify(q)}: the route's payload`);
    assert.deepEqual(r.rows, [
      {
        kind: "lead",
        id: LEAD,
        route: q.search ? `clients/leads:s-${q.search}:p-${LEAD}` : `clients/leads:p-${LEAD}`,
        label: NAME,
      },
    ]);
  }
  await refused(load(rc(), leadReader, { id: OTHER_SEARCH }), "not_found", 404);
  // One search, as Ask reads it, and through the rail's mapping the row the rail lists.
  const s = world({ role: "viewer" });
  s.lead_searches_view = [view({ emails_checked: 41, with_phone: 72 }), view({ id: OTHER_SEARCH, name: "Other" })];
  const one = await load(readerContext(ctxOf(s, {}, doors()), { tenantId: A, role: "viewer" }), searchReader, {
    id: SEARCH,
  });
  assert.deepEqual(one.rows, [{ kind: "search", id: SEARCH, route: `clients/leads:s-${SEARCH}`, label: "Trainers" }]);
  const rail = await load(readerContext(ctxOf(s, {}, doors()), { tenantId: A, role: "viewer" }), searchesReader);
  assert.deepEqual(toSearchDto(one.data.search), rail.data.searches[0], "the rail's own row for it");
  await refused(
    load(readerContext(ctxOf(s, {}, doors()), { tenantId: A, role: "viewer" }), searchReader, { id: L1 }),
    "not_found",
    404,
  );
});

test("AI's leads, lead and search answer what the Leads page's builders answer over the same readers (PR 4.3): each lead as toLeadRowVM says its row, handed its own search; one lead as its peek says it; one search as the rail's row and its own words; each row the reader's RowRef in the read set; the month an owner's and a partner's alone", async () => {
  const NOW = new Date("2026-09-20T15:00:00Z");
  const TZ = "America/Chicago";
  const t = oneLeadTables();
  t.lead_searches_view = [view({ emails_checked: 41, with_phone: 72 })];
  const rpcs = () => ({ ...doors(), lead_member_of: memberOf(t) });
  const asRole = (role) => {
    const w = { ...t, memberships: member(role) };
    return newToolContext(ctxOf(w, {}, rpcs()), A, role, TZ, NOW);
  };
  const call = async (tc, input) => {
    const out = await runTool(tc, { name: "leads", input });
    assert.equal(out.isError, false, out.result);
    return JSON.parse(out.result);
  };
  // What the page holds, read through the same readers: the view's first page and the rail's searches.
  const rc = () => readerContext(ctxOf(t, {}, rpcs()), { tenantId: A, role: "viewer" }, NOW);
  const page = await load(rc(), leadsReader, { list: "all", sort: "fit", dir: "asc", limit: 500 });
  const rail = (await load(rc(), searchesReader)).data.searches;
  const vmOf = (r) => toLeadRowVM(r, TZ, NOW, rail.find((s) => s.id === r.search_id) ?? null);
  /** The row's facts the page's builder says, as Ask's rows name them. */
  const rowFacts = (vm, route) => ({
    lead_id: vm.id,
    route,
    name: vm.name,
    kind: vm.category || null,
    area: vm.area || null,
    class: LEAD_CLASS_WORDS[vm.cls],
    fit: vm.fitLabel || null,
    stage: vm.stageLabel,
    email: vm.emailWord,
  });
  const pick = (o) => Object.fromEntries(Object.keys(rowFacts(vmOf(page.data.rows[0]), "")).map((k) => [k, o[k]]));
  const CASES = [
    [
      "leads",
      { action: "leads" },
      (out) => {
        assert.deepEqual(
          out.leads.map(pick),
          page.data.rows.map((r) => rowFacts(vmOf(r), page.rows.find((x) => x.id === r.id).route)),
        );
        assert.deepEqual(out.counts, COUNTS, "the rail's six counts ride with the first page");
        assert.equal(out.matching, page.data.rows.length);
      },
    ],
    // The box's words go to the read, as the page's do (lead_view_rows, proved in lead-filters.db.test.mjs): Ask
    // matches nothing itself, and answers the rows the read answered.
    [
      "leads, the box's words",
      { action: "leads", words: "AUSTIN" },
      (out) => {
        assert.deepEqual(rpcCalls("leads_page").at(-1).p_filters, { q: "AUSTIN" }, "the words, handed to the read");
        assert.deepEqual(
          out.leads.map((l) => l.lead_id),
          page.data.rows.map((r) => r.id),
        );
      },
    ],
    [
      "leads, words of spaces alone",
      { action: "leads", words: "   " },
      (out) => {
        assert.equal(rpcCalls("leads_page").at(-1).p_filters, undefined, "no words, no filter");
        assert.equal(out.matching, page.data.rows.length);
      },
    ],
    [
      "lead",
      { action: "lead", lead_id: LEAD, search_id: SEARCH },
      async (out) => {
        const one = await load(rc(), leadReader, { id: LEAD, search: SEARCH });
        const r = one.data.row;
        const own = rail.find((s) => s.id === r.search_id) ?? null;
        const peek = toLeadPeekVM(r, own, TZ, NOW);
        assert.deepEqual(pick(out), rowFacts(vmOf(r), one.rows[0].route), "its row, as the list says it");
        assert.deepEqual(
          [out.about, out.where, out.today, out.checks, out.found_at, out.phone, out.email_address],
          [
            peek.about,
            peek.where?.line ?? null,
            peek.today,
            peek.checksSummary || null,
            peek.foundSummary || null,
            peek.reach.phone?.value ?? null,
            peek.reach.email.address,
          ],
          "and what its peek adds",
        );
      },
    ],
    [
      "search",
      { action: "search", search_id: SEARCH },
      async (out, tc) => {
        const listed = (await call(tc, { action: "searches" })).searches.find((s) => s.id === SEARCH);
        assert.deepEqual(
          Object.fromEntries(Object.keys(listed).map((k) => [k, out[k]])),
          listed,
          "the row searches says for it",
        );
        const dto = toSearchDto((await load(rc(), searchReader, { id: SEARCH })).data.search);
        assert.equal(out.asked_line, leadSearchWords(dto, TZ).askedLine);
        assert.deepEqual([out.emails_checked, out.with_phone], [41, 72]);
      },
    ],
  ];
  for (const [what, input, check] of CASES) {
    const tc = asRole("viewer");
    await check(await call(tc, input), tc);
    // Every row it names is in the read set as its reader gave it: the answer may cite it, and it opens there.
    const kind = input.action === "search" ? "search" : "lead";
    for (const [id, ref] of tc.read[kind]) assert.equal(ref.kind, kind, `${what}: ${id}`);
  }
  // The order is the page's column's: each sort's own first unless dir reverses it -- REGRESSION: the tool's own example
  // ("the best ratings") went out ascending, and leads_page answered the lowest rated first.
  const example = READ_DEFS.find((d) => d.name === "leads").actions.leads.examples[0];
  for (const [input, sort, dir] of [
    [{ action: "leads", sort: "rating" }, "rating", "asc"],
    [{ action: "leads", sort: "rating", dir: "desc" }, "rating", "desc"],
    [{ action: "leads", ...example }, "rating", "desc"],
    [{ action: "leads" }, "fit", "asc"],
  ]) {
    await call(asRole("viewer"), input);
    const sent = rpcCalls("leads_page").at(-1);
    assert.deepEqual([sent.p_sort, sent.p_dir], [sort, dir], JSON.stringify(input));
  }
  const viewer = asRole("viewer");
  await call(viewer, { action: "lead", lead_id: LEAD, search_id: SEARCH });
  assert.equal(viewer.read.lead.get(LEAD).route, `clients/leads:s-${SEARCH}:p-${LEAD}`, "a lead at its peek");
  // The month rides the first page for a member who may find (ROLE_PERMS.find): an owner's and a partner's.
  for (const role of ["viewer", "operator", "partner", "owner"])
    assert.equal(
      "month" in (await call(asRole(role), { action: "leads" })),
      ROLE_PERMS[role].find === true,
      `${role}: the month`,
    );
  // A lead or a search the workspace does not hold, or not an id, is said in words; nothing is thrown.
  const words = async (input) => JSON.parse((await runTool(asRole("viewer"), { name: "leads", input })).result).error;
  assert.equal(await words({ action: "lead", lead_id: OTHER_SEARCH }), "no such lead in this workspace");
  assert.equal(
    await words({ action: "lead", lead_id: "nope" }),
    "lead_id must be an id leads with action leads returned",
  );
  assert.equal(await words({ action: "search", search_id: L1 }), "no such search in this workspace");
  t.lead_searches_view = [view({ removed_at: "2026-09-19T12:00:00Z" })];
  assert.equal(await words({ action: "search", search_id: SEARCH }), "that search was removed from Leads");
});

test("the searches read brings the rail's counts with it, and a round says whether it is stopping", async () => {
  const rpcs = doors();
  const tables = world({ role: "viewer" });
  tables.lead_searches_view = [
    view({
      ending_pending: "stopped",
      waiting_since: "2026-09-19T11:00:00Z",
      ended_at: null,
      emails_checked: 41,
      with_phone: 72,
      undo_op_id: null,
      undo_version: null,
    }),
  ];
  const out = await searches.GET.run(get(inA), ctxOf(tables, {}, rpcs));
  assert.deepEqual(out.counts, COUNTS);
  assert.deepEqual(
    [
      out.searches[0].id,
      out.searches[0].asked_on,
      out.searches[0].round.ending_pending,
      out.searches[0].round.emails_checked,
      out.searches[0].round.with_phone,
    ],
    [SEARCH, "2026-09-19T00:00:00Z", true, 41, 72],
  );
  tables.lead_searches_view = [view({ ending_pending: null })];
  const done = await searches.GET.run(get(inA), ctxOf(tables, {}, rpcs));
  assert.equal(done.searches[0].round.ending_pending, false, "a round with no pending ending is not stopping");
  assert.equal(done.searches[0].thread_id, null, "a search that keeps no thread says so");
  // The thread a search was planned in (00172) reaches the page, with a round or before its first.
  const THREAD = "77777777-7777-4777-8777-777777777771";
  tables.lead_searches_view = [
    view({ thread_id: THREAD }),
    view({ id: "aaaaaaaa-2222-4222-8222-aaaaaaaaaaaa", round_id: null, thread_id: THREAD }),
  ];
  const threaded = await searches.GET.run(get(inA), ctxOf(tables, {}, rpcs));
  assert.deepEqual(
    threaded.searches.map((s) => [s.thread_id, !!s.round]),
    [
      [THREAD, true],
      [THREAD, false],
    ],
  );
});

// The page's Include read `criterion_key`, and the runner has only ever written `criterionKey` (core ports.ts
// RoundQuestion, kept verbatim by lead_collect_commit): the strip drew "Include what I left out", which lifted
// nothing, and the door refused the plan it was handed. So the question is built here by core's own afterProbe.
test("the question the runner asks reaches the page with its exclusion's key: the stored shape is core's own", async () => {
  const { afterProbe } = await import("../../../packages/core/src/leads/question.ts");
  const plan = { ...PLAN, exclusions: [{ key: "chains", text: "Chain gyms", origin: "claude" }] };
  const members = [
    ...Array.from({ length: 8 }, () => ({
      class: "excluded",
      excluded_by: "chains",
      term: "gym",
      phone: null,
      email: null,
    })),
    ...Array.from({ length: 4 }, () => ({
      class: "qualified",
      excluded_by: null,
      term: "gym",
      phone: "+15125550100",
      email: null,
    })),
  ];
  const asked = afterProbe(plan, members, new Date("2026-09-24T04:30:00Z"));
  assert.equal(asked.kind, "ask");
  const tables = world({ role: "viewer" });
  tables.lead_searches_view = [view({ plan, question: asked.question })];
  const out = await searches.GET.run(get(inA), ctxOf(tables, {}, doors()));
  assert.deepEqual(out.searches[0].round.question, { sentence: asked.question.sentence, criterion_key: "chains" });
});

test("a kept search is renamed, removed with the worked leads kept, or has its finished round's leads given back", async () => {
  const rpcs = doors();
  // The ledger is written as the service role (a session may not insert into events): stood in, and read below.
  const ledger = { events: [] };
  setServiceClient(fakeDb(ledger));

  assert.deepEqual(
    await search.PATCH.run(
      req("PATCH", { name: "Austin trainers" }),
      ctxOf(world({ role: "operator" }), { id: SEARCH }, rpcs),
    ),
    { name: "Austin trainers" },
  );
  const tables = world({ role: "owner" });
  // The door blanks the rest; what is left unblanked IS what was kept, and the toast counts the database's own rows.
  tables.lead_search_members = [
    { id: "m-1", search_id: SEARCH, lead_id: LEAD, tenant_id: A, blanked_at: null },
    { id: "m-2", search_id: SEARCH, lead_id: "l-2", tenant_id: A, blanked_at: null },
    { id: "m-3", search_id: SEARCH, lead_id: "l-3", tenant_id: A, blanked_at: "2026-09-19T00:00:00Z" },
  ];
  const gone = await search.DELETE.run(req("DELETE", undefined), ctxOf(tables, { id: SEARCH }, rpcs));
  assert.deepEqual(
    [gone.archived, gone.kept, gone.toast],
    [40, 2, "Removed. The 2 you contacted or are talking to are kept."],
  );
  setServiceClient(null);
  assert.deepEqual(
    ledger.events.map((e) => [
      e.kind,
      e.subject_type,
      e.subject_id,
      e.data.by,
      e.data.kept ?? null,
      e.data.archived ?? null,
    ]),
    [
      ["lead.search_renamed", "lead_search", SEARCH, USER, null, null],
      ["lead.search_removed", "lead_search", SEARCH, USER, 2, 40],
    ],
    "REGRESSION: a search renamed or removed was on no ledger; the removal says what was kept",
  );
  assert.equal(ledger.events[0].data.name, "Austin trainers");
  const back = await searchUndo.POST.run(req("POST", undefined), ctxOf(world({ role: "owner" }), { id: SEARCH }, rpcs));
  assert.deepEqual([back.removed, back.credited, back.op_id], [3, 2, OP]);
  assert.equal(back.toast, "Took back 3 leads. 2 went back to this month's leads.");
  assert.deepEqual(rpcCalls("lead_search_undo")[0], { p_search_id: SEARCH });
});

test("the Done strip's Undo says why it cannot, in the owner's words, for each of the door's three refusals", async () => {
  const of = (error) =>
    searchUndo.POST.run(
      req("POST", undefined),
      ctxOf(world({ role: "owner" }), { id: SEARCH }, doors({ lead_search_undo: () => ({ error }) })),
    );
  await assert.rejects(of("running"), /still running, so there is nothing to take back yet/);
  await assert.rejects(of("too_late"), /more than a day ago, so these leads stay yours and stay counted/);
  await assert.rejects(of("removed"), /This search was removed/);
  await refused(of("running"), "conflict", 409);
});

test("erasing a lead is the owner's, final, and on the ledger once however often it is asked", async () => {
  const tables = world({ role: "owner" });
  const rpcs = doors();
  assert.deepEqual(await erase.DELETE.run(req("DELETE", undefined), ctxOf(tables, { id: LEAD }, rpcs)), {
    erased: true,
    already: false,
  });
  assert.deepEqual(
    tables.decisions.map((d) => [d.verb, d.subject_type, d.subject_id]),
    [["erase", "lead", LEAD]],
  );
  const again = await erase.DELETE.run(
    req("DELETE", undefined),
    ctxOf(tables, { id: LEAD }, doors({ lead_erase: () => ({ erased: true, already: true }) })),
  );
  assert.deepEqual(again, { erased: true, already: true });
  assert.equal(tables.decisions.length, 1, "a second request is answered, not recorded again");
  await refused(
    erase.DELETE.run(req("DELETE", undefined), ctxOf(world({ role: "owner" }), { id: "nope" }, rpcs)),
    "not_found",
    404,
  );
});

test("the ideas are written from the line and what was found, on their own route, each a plan in a listed place with how reachable its kind is", async () => {
  setSuggestionsWriter(ideaStore());
  const rpcs = doors();
  // A page's read writes nothing and asks no model (the wiring's second audit, S11-8): it says the ideas are due.
  const due = await suggestions.GET.run(get(inA), ctxOf(world({ role: "owner" }), {}, rpcs));
  assert.deepEqual([modelCalls.length, saved.length, due.items, due.due], [0, 0, [], true]);
  // Asked for, they are written.
  const fresh = await suggestions.POST.run(send(undefined), ctxOf(world({ role: "owner" }), {}, rpcs));
  assert.deepEqual(
    [modelCalls.length, modelCalls[0].purpose, modelCalls[0].request.max_tokens],
    [1, "lead_suggest", 1800],
  );
  assert.match(modelCalls[0].request.messages[0].content, /P1 · near 78704 · home/, "the places the model may name");
  assert.match(modelCalls[0].request.messages[0].content, /No searches yet/);
  assert.equal(
    fresh.business_line,
    "a personal training studio in Austin",
    "the model's line, as the owner would say it",
  );
  const [idea] = fresh.items;
  assert.equal(idea.words, "Chiropractors near 78704");
  assert.equal(idea.category_key, "chiropractor", "one key, one of them");
  assert.equal(idea.plan.area.zip, "78704");
  assert.equal(idea.plan.count, 50);
  assert.deepEqual(
    idea.plan.exclusions.map((x) => x.text),
    ["chains"],
  );
  assert.equal(idea.ask, "Find 50 chiropractors near 78704, leaving out chains");
  assert.equal(idea.reach, "About 6 in 10 have an email");
  assert.deepEqual(idea.prior, { places: 1200, matched: 700, with_email: 406 });
  assert.equal(saved.length, 1, "kept under the claim");
  assert.deepEqual(
    [saved[0].business_line, saved[0].by_owner, saved[0].basis, saved[0].passed],
    ["a personal training studio in Austin", false, "", []],
  );
  assert.equal(saved[0].items[0].plan.category_key, "chiropractor");
  assert.equal(/apify|compass|anthropic|claude-/i.test(JSON.stringify(fresh)), false);
});

test("an idea pressed is a card in AI (POST ask/idea, Ruben, 23 Oct 2026): the idea's own plan, at its first version and marked from the idea, kept with the month's facts as the first answer of a thread titled by the idea, with no model asked; pressed again while its card waits, the same thread", async () => {
  assert.deepEqual(askIdea.POST.policy, {
    kind: "write",
    scope: "workspace",
    role: "partner",
    rate: "ask",
    spend: false,
  });
  setSuggestionsWriter(ideaStore());
  setModelCalls([]);
  const rpcs = doors();
  const tables = world({ role: "owner", suggestions: keptIdeas(), tables: { ask_threads: [], ask_messages: [] } });
  const out = await askIdea.POST.run(send({ words: "Chiropractors near 78704" }), ctxOf(tables, {}, rpcs));
  assert.equal(tables.ask_threads.length, 1);
  const thread = tables.ask_threads[0];
  assert.deepEqual(out, { thread: { id: thread.id, title: "Chiropractors near 78704" } });
  assert.deepEqual(
    tables.ask_messages.map((m) => [m.thread_id, m.role]),
    [
      [thread.id, "user"],
      [thread.id, "assistant"],
    ],
  );
  assert.equal(tables.ask_messages[0].content.text, "Chiropractors near 78704", "the question is the idea's own words");
  const said = tables.ask_messages[1].content;
  assert.equal(said.answer.say.headline, "Partners", "the answer says why this idea");
  assert.match(said.answer.say.detail, /Say what to change/);
  const [card] = said.proposals;
  assert.equal(card.kind, "lead_search");
  assert.deepEqual(
    [card.payload.plan.version, card.payload.plan.from, card.payload.plan.count, card.payload.thread_id],
    [1, "idea", PLAN.count, thread.id],
    "the idea's own plan, a new search from the idea, carrying the thread it waits in",
  );
  assert.equal(typeof card.payload.facts.leadsLeft, "number", "with the month's facts the card says");
  assert.equal(modelCalls.length, 0, "no model is asked");
  // Pressed again while its card waits: the thread it waits in, nothing written.
  const again = await askIdea.POST.run(send({ words: "Chiropractors near 78704" }), ctxOf(tables, {}, rpcs));
  assert.deepEqual(again, out);
  assert.deepEqual([tables.ask_threads.length, tables.ask_messages.length], [1, 2]);
  // An idea the workspace no longer holds, and a member who may not find.
  await refused(askIdea.POST.run(send({ words: "Dentists in Austin" }), ctxOf(tables, {}, rpcs)), "not_found", 404);
  await refused(
    askIdea.POST.run(send({ words: "Chiropractors near 78704" }), ctxOf(world({ role: "operator" }), {}, rpcs)),
    "forbidden",
    403,
  );
  setSuggestionsWriter(null);
});

test("kept ideas stand while the newest round is the one they were written over, a month at most; a row from before, or a round ended since, is written again", async () => {
  setSuggestionsWriter(ideaStore());
  const rpcs = doors();
  const again = await suggestions.GET.run(
    get(inA),
    ctxOf(world({ role: "owner", suggestions: keptIdeas() }), {}, rpcs),
  );
  assert.deepEqual(
    [modelCalls.length, again.by_owner, again.business_line],
    [0, true, "a personal training studio in Denver"],
  );
  assert.equal(again.items[0].reach, "About 6 in 10 have an email", "how reachable is read fresh each time");
  // A row from before plans were kept has no basis: written again, from the owner's own line.
  await suggestions.POST.run(
    send(undefined),
    ctxOf(world({ role: "owner", suggestions: keptIdeas({ basis: null }) }), {}, rpcs),
  );
  assert.equal(modelCalls.length, 1, "no basis, so it is asked again");
  assert.equal(
    saved.at(-1).business_line,
    "a personal training studio in Denver",
    "the owner's line is kept as theirs",
  );
  assert.equal(saved.at(-1).by_owner, true);
  // A round ended since: the basis moved, so they are written again.
  const ended = world({ role: "owner", suggestions: keptIdeas() });
  ended.lead_rounds = [{ id: R1, tenant_id: A, search_id: SEARCH, state: "ended", ended_at: "2026-10-10T15:00:00Z" }];
  await suggestions.POST.run(send(undefined), ctxOf(ended, {}, rpcs));
  assert.equal(modelCalls.length, 2, "a round ended since: asked again");
  assert.equal(saved.at(-1).basis, "2026-10-10T15:00:00.000Z", "written over that round");
  // A month old: asked again.
  const old = keptIdeas({ made_at: "2026-09-01T00:00:00Z" });
  await suggestions.POST.run(send(undefined), ctxOf(world({ role: "owner", suggestions: old }), {}, rpcs));
  assert.equal(modelCalls.length, 3, "a month old, so it is asked again");
});

test("two requests write once: the second finds the claim taken and says so, and the page asks again; a member who may not find reads what was written, and may not ask for more", async () => {
  const rpcs = doors();
  setSuggestionsWriter(ideaStore({ claim: async () => null }));
  const taken = await suggestions.POST.run(send(undefined), ctxOf(world({ role: "owner" }), {}, rpcs));
  assert.deepEqual([modelCalls.length, taken.items, taken.pending], [0, [], true]);
  const held = await suggestions.POST.run(
    send(undefined),
    ctxOf(world({ role: "owner", suggestions: keptIdeas({ basis: null }) }), {}, rpcs),
  );
  assert.equal(held.items.length, 1, "the older ideas stand meanwhile");
  assert.equal(held.pending, undefined);
  // The claim let go meanwhile (the owner saved a line): what was written is not kept, and the page asks again.
  setSuggestionsWriter(ideaStore({ keep: async () => false }));
  const lost = await suggestions.POST.run(send(undefined), ctxOf(world({ role: "owner" }), {}, rpcs));
  assert.deepEqual([modelCalls.length, lost.items, lost.pending], [1, [], true]);
  // An operator reads what was written and asks for nothing.
  setSuggestionsWriter(ideaStore());
  setModelCalls([]);
  const read = await suggestions.GET.run(
    get(inA),
    ctxOf(world({ role: "operator", suggestions: keptIdeas({ basis: null }) }), {}, rpcs),
  );
  assert.deepEqual([modelCalls.length, read.items.length, read.due], [0, 1, true]);
  const none = await suggestions.GET.run(get(inA), ctxOf(world({ role: "operator" }), {}, rpcs));
  assert.deepEqual([modelCalls.length, none.items, none.note], [0, [], "Suggestions are not available right now."]);
  // And may not ask for them to be written: the find permission's, as a search is.
  await refused(suggestions.POST.run(send(undefined), ctxOf(world({ role: "operator" }), {}, rpcs)), "forbidden", 403);
  assert.equal(modelCalls.length, 0);
});

test("a model that will not answer is a note, the failure is kept under the claim, and it is not asked again for a while", async () => {
  const rpcs = doors();
  const failed = [];
  setSuggestionsWriter(ideaStore({ fail: async (tenantId, claim) => failed.push([tenantId, claim]) }));
  // eslint-disable-next-line require-yield -- the gateway refuses before it streams a first block
  setModelStream(async function* () {
    throw new GatewayRefused({ kind: "budget", used: 1, cap: 1 });
  });
  const note = await suggestions.POST.run(send(undefined), ctxOf(world({ role: "owner" }), {}, rpcs));
  assert.deepEqual([note.items, note.note], [[], "Suggestions are not available right now."], "the page still draws");
  assert.deepEqual(failed, [[A, "2026-01-01T00:00:00.000Z"]], "the failure is kept under this read's claim");
  assert.equal(/apify|compass|anthropic|claude-opus/i.test(JSON.stringify(note)), false);
  // Failed a moment ago: not asked again, the note stands (or the older ideas do).
  setModelStream(fakeModel());
  const soon = keptIdeas({ items: [], basis: null, failed_at: new Date().toISOString() });
  const held = await suggestions.POST.run(
    send(undefined),
    ctxOf(world({ role: "owner", suggestions: soon }), {}, rpcs),
  );
  assert.deepEqual([modelCalls.length, held.note], [0, "Suggestions are not available right now."]);
  const older = keptIdeas({ basis: null, failed_at: new Date().toISOString() });
  const stood = await suggestions.POST.run(
    send(undefined),
    ctxOf(world({ role: "owner", suggestions: older }), {}, rpcs),
  );
  assert.deepEqual([modelCalls.length, stood.items.length, stood.note], [0, 1, undefined]);
});

test("a kind of business nobody has searched says so, and never a share from too little evidence", async () => {
  setSuggestionsWriter(ideaStore());
  const thin = doors({ lead_niche_prior: () => ({ places: 30, matched: 12, with_email: 9 }) });
  const out = await suggestions.POST.run(send(undefined), ctxOf(world({ role: "owner" }), {}, thin));
  assert.equal(out.items[0].reach, "New kind of search · checked after 25");
  const none = doors({ lead_niche_prior: () => null });
  const empty = await suggestions.POST.run(send(undefined), ctxOf(world({ role: "owner" }), {}, none));
  assert.equal(empty.items[0].reach, "New kind of search · checked after 25");
});

test("the owner's own business line is saved with no suggestions, so the next read asks again", async () => {
  const rpcs = doors();
  const out = await suggestions.PUT.run(
    req("PUT", { business_line: "a personal training studio in Denver" }),
    ctxOf(world({ role: "owner" }), {}, rpcs),
  );
  assert.deepEqual(out, { business_line: "a personal training studio in Denver" });
  assert.deepEqual(
    saved,
    [
      {
        tenantId: A,
        business_line: "a personal training studio in Denver",
        by_owner: true,
        items: [],
        basis: null,
        passed: [],
      },
    ],
    "saved with no ideas and no basis, so the next read asks Claude again",
  );
  await refused(
    suggestions.PUT.run(req("PUT", { business_line: "no" }), ctxOf(world({ role: "owner" }), {}, rpcs)),
    "validation",
    400,
  );
});

test("a new round's plan reaches the door at the search's version or the next, however many changes the card counted", async () => {
  const seen = [];
  const rpcs = { lead_search_more: (a) => (seen.push(a.p_plan.version), { round_id: "r2" }) };
  const ctx = ctxOf(world({ role: "owner" }), { id: SEARCH }, rpcs);
  for (const version of [1, 2, 5])
    await more.POST.run(req("POST", { purpose: "renew", plan: { ...PLAN, version } }), ctx);
  assert.deepEqual(seen, [1, 2, 2], "the search is at version 1, and lead_search_more raises past the next");
});

test("the plan card's facts are the month's own numbers and what past searches measured, and a kind nobody searched has no prior", async (t) => {
  // The counters are September's ("2026-09") and the card renews on the 1st of the next month, so the clock is 28
  // September: read off the wall clock, from 1 October the card read October's counters, and none of these held.
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-09-28T17:00:00Z") });
  const rpcs = doors();
  const ctx = ctxOf(world({ role: "owner" }), {}, rpcs);
  const bare = await planFacts(ctx, A);
  assert.deepEqual([bare.dupes, bare.leadsLeft, bare.prior, bare.priorOf, bare.nearby], [322, 486, null, null, []]);
  assert.equal(bare.renewsOn, "Oct 1", "the month the leads come back");
  // The two caps are sized to run out together (500 leads for $25), so which
  // binds is which one this workspace is nearer: $1.50 spent on 14 leads is
  // above that rate, so the money runs out first.
  assert.equal(bare.bound, "budget");
  const slow = world({ role: "owner" });
  slow.lead_counters = [
    { tenant_id: A, kind: "allowance", period: "2026-09", used: 400, reserved: 0 },
    { tenant_id: A, kind: "budget", period: "2026-09", used: 5, reserved: 0 },
  ];
  assert.deepEqual(
    [(await planFacts(ctxOf(slow, {}, rpcs), A)).bound, (await planFacts(ctxOf(slow, {}, rpcs), A)).leadsLeft],
    ["allowance", 100],
    "400 of the month's leads found for $5: the leads bind first",
  );
  const withPrior = await planFacts(ctx, A, { categoryKey: "personal_trainer" });
  assert.deepEqual(withPrior.prior, { places: 1200, matched: 700, with_email: 406 });
  assert.equal(withPrior.priorOf, "personal_trainer");
  const spent = world({ role: "owner" });
  spent.lead_counters = [
    { tenant_id: A, kind: "allowance", period: "2026-09", used: 10, reserved: 0 },
    { tenant_id: A, kind: "budget", period: "2026-09", used: 24, reserved: 0 },
  ];
  assert.equal((await planFacts(ctxOf(spent, {}, rpcs), A)).bound, "budget", "the money runs out before the leads do");
  const reserved = world({ role: "owner" });
  reserved.lead_counters = [{ tenant_id: A, kind: "allowance", period: "2026-09", used: 480, reserved: 40 }];
  assert.equal(
    (await planFacts(ctxOf(reserved, {}, rpcs), A)).leadsLeft,
    0,
    "a reservation above the cap is no room, never a negative",
  );
  const untouched = world({ role: "owner" });
  untouched.lead_counters = [];
  assert.deepEqual(
    [
      (await planFacts(ctxOf(untouched, {}, rpcs), A)).bound,
      (await planFacts(ctxOf(untouched, {}, rpcs), A)).leadsLeft,
    ],
    [null, 500],
  );
});

test("the mailto encodes each part once, keeps a quote and an ampersand, and breaks lines the way a mail app reads them", () => {
  const m = leadMailto("hello@zilkerstrength.example", "Coffee & a question", 'Hi Dana,\nOne idea "for you".');
  assert.equal(
    m,
    "mailto:hello%40zilkerstrength.example?subject=Coffee%20%26%20a%20question&body=Hi%20Dana%2C%0D%0AOne%20idea%20%22for%20you%22.",
  );
  const foot = leadDraftFooter("Marisa's Beauty Salon", "1 Main St, Austin, TX 78701");
  const once = leadMailto("a@b.example", "s", `Hi.${foot}`);
  assert.equal(
    once,
    leadMailto("a@b.example", "s", `Hi.${foot}`.replace(/\n/g, "\r\n")),
    "a body that already carries CRLF is not doubled",
  );
});

// D5: the month rides the first page, so the workbench says what a press costs without a read of its own.
test("the first page of leads carries the month's standing; a later page carries neither the counts nor the month", async () => {
  const period = leadMonth("America/Chicago", new Date());
  const rpcs = doors();
  const tables = {
    ...world({ role: "owner" }),
    lead_counters: [{ tenant_id: A, kind: "allowance", period, used: 250, reserved: 12 }],
  };
  const first = await leads.GET.run(get(`${inA}&sort=fit&dir=asc&list=all&limit=50`), ctxOf(tables, {}, rpcs));
  assert.deepEqual(
    [first.month.used, first.month.left],
    [262, 238],
    "used and reserved are both spoken for, out of the month's whole",
  );
  assert.match(first.month.renewsOn, /^[A-Z][a-z]{2} \d{1,2}$/, "the day it renews, as the owner reads it");
  assert.ok(first.counts, "the counts ride the first page too");
  const later = await leads.GET.run(
    get(`${inA}&sort=fit&dir=asc&list=all&limit=50&after_key=k&after_id=${LEAD}`),
    ctxOf(tables, {}, rpcs),
  );
  assert.deepEqual([later.month, later.counts], [undefined, undefined], "paging asks for neither again");
  const untouched = await leads.GET.run(
    get(`${inA}&sort=fit&dir=asc&list=all&limit=50`),
    ctxOf({ ...tables, lead_counters: [] }, {}, doors()),
  );
  assert.deepEqual(
    [untouched.month.used, untouched.month.left],
    [0, 500],
    "nothing taken: the month's whole is contracts'",
  );
});

// 00161: the row carries the copy of the mark we keep, served from our own storage -- never the address on the
// business's own site, which the dashboard's content policy would block, and never a name the collect did not write.
test("a row's mark is the copy we keep, on our own storage; the site's own address never reaches the page", async () => {
  const NAME_KEPT = `${"c".repeat(64)}.webp`;
  const run = async (over) => {
    const rpcs = doors({
      leads_page: () => [pageRow({ logo_url: "https://travisheightscoaching.example/logo.png", ...over })],
    });
    return (await leads.GET.run(get(inA), ctxOf(world({ role: "viewer" }), {}, rpcs))).rows[0];
  };
  const kept = await run({ mark_path: NAME_KEPT });
  assert.equal(
    kept.mark_url,
    `${new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin}/storage/v1/object/public/lead-marks/${NAME_KEPT}`,
  );
  assert.equal("logo_url" in kept, false, "the site's address is where the copy came from, not something to draw");
  assert.equal((await run({ mark_path: null })).mark_url, null, "no copy yet: the photo or the initials");
  assert.equal((await run({})).mark_url, null, "a database from before 00161, which answers no name at all");
  assert.equal((await run({ mark_path: "../../media/x.png" })).mark_url, null, "a name we did not write is no address");
});

test("Find more, deferred, asks the renewal door at its plan's price, and says the door's refusal (decision 0133)", async () => {
  const seen = [];
  const answers = [{ round_id: "r2" }, { error: "not_month_used", sentence: "It did not stop at the month's leads." }];
  const rpcs = { lead_search_on_renewal: (a) => (seen.push(a), answers.shift()) };
  const defer = () =>
    more.POST.run(req("POST", { purpose: "defer", plan: PLAN }), ctxOf(world({ role: "owner" }), { id: SEARCH }, rpcs));
  assert.deepEqual(await defer(), { search_id: SEARCH, round_id: "r2" });
  assert.ok(seen[0].p_estimate_usd > 0, "priced as a top-up of the plan the owner approved");
  await refused(defer(), "conflict", 409);
});
