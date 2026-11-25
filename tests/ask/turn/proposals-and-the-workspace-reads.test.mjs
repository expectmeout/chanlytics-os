/**
 * Proposals as their routes commit them (a deal with its next step, a follow-up), and everyone in People and the
 * workspace's pages read once a turn, each tool as its page reads it: People's search, the composer's templates and
 * Playbooks' numbers.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeDb } from "../../_fake-db.mjs";
import { toPersonRowVM, nextRunLabel, numberHealth } from "@chanlytics/contracts";
import {
  A,
  C2,
  CHANNELS,
  LUIS,
  NOW,
  OFFER,
  P1,
  ROSA,
  ROUND,
  RPCS,
  TPL,
  TZ,
  USER,
  WAITING_SEARCH,
  answer,
  at,
  buildProposal,
  contact,
  contactsOf,
  ctxFor,
  fromRecord,
  iso,
  load,
  logged,
  newToolContext,
  peopleListMatching,
  peopleListRow,
  playbooksReader,
  ports,
  readerContext,
  runAskTurn,
  runTool,
  scripted,
  tables,
  templatesRoute,
  threeAnswers,
  tool,
  turn,
  twoPeople,
} from "./_turn.mjs";

test("propose_deal makes a card the route commits: a new proposal has no deal_id, a client's move carries the open row's id and version, a passed proposal sent again moves its own row, a named service picks its own open row or is refused, of two open a move names which (0029), and a bad stage or an unknown person is refused", async () => {
  const MARIA = "cccccccc-cccc-4ccc-8ccc-cccccccccc21";
  const LUIS = "cccccccc-cccc-4ccc-8ccc-cccccccccc22";
  const NORA = "cccccccc-cccc-4ccc-8ccc-cccccccccc23";
  const t = tables({
    contacts: [
      { ...contact, tenant_id: A, erased_at: null },
      {
        id: MARIA,
        tenant_id: A,
        display_name: "Maria",
        wa_profile_name: null,
        phone_e164: "+15555550121",
        email: null,
        erased_at: null,
      },
      {
        id: LUIS,
        tenant_id: A,
        display_name: "Luis",
        wa_profile_name: null,
        phone_e164: "+15555550122",
        email: null,
        erased_at: null,
      },
      {
        id: NORA,
        tenant_id: A,
        display_name: "Nora",
        wa_profile_name: null,
        phone_e164: "+15555550123",
        email: null,
        erased_at: null,
      },
    ],
    deals: [
      // Nora holds two open rows (already_open is per service): Ads is the newer, SEO the older.
      {
        id: "d4",
        tenant_id: A,
        contact_id: NORA,
        stage: "proposed",
        service: "Ads",
        version: 2,
        created_at: "2026-09-10T00:00:00Z",
      },
      {
        id: "d3",
        tenant_id: A,
        contact_id: NORA,
        stage: "proposed",
        service: "SEO",
        version: 1,
        created_at: "2026-08-15T00:00:00Z",
      },
      {
        id: "d1",
        tenant_id: A,
        contact_id: MARIA,
        stage: "proposed",
        service: "SEO",
        version: 3,
        created_at: "2026-09-01T00:00:00Z",
      },
      {
        id: "d2",
        tenant_id: A,
        contact_id: LUIS,
        stage: "lost",
        service: "Ads",
        version: 2,
        created_at: "2026-08-01T00:00:00Z",
      },
    ],
  });
  const tc = newToolContext(ctxFor(t), A, "operator", TZ, NOW);
  const p = (name, input) => buildProposal(tc, name, input);

  const fresh = await p("propose_deal", { contact_id: MARIA, stage: "proposed", service: "Ads" });
  assert.equal(fresh.isError, false, fresh.result);
  assert.equal(fresh.proposal.kind, "deal");
  assert.equal(fresh.proposal.needs, "operator");
  assert.equal(fresh.proposal.payload.deal_id, undefined, "a proposal beside an open one is a new engagement");
  assert.equal(fresh.proposal.payload.service, "Ads");
  assert.deepEqual(
    [fresh.proposal.title, fresh.proposal.summary, fresh.proposal.undo],
    ["Maria · Proposal out", "Proposal out · Ads", null],
  );
  assert.ok(tc.read.person.has(MARIA), "the person enters the read set, so a citation of them is kept");
  assert.equal(JSON.parse(fresh.result).proposed, true);

  const won = await p("propose_deal", { contact_id: MARIA, stage: "won", amount_cents: 250000, per: "month" });
  assert.equal(won.proposal.payload.deal_id, "d1");
  assert.equal(won.proposal.payload.version, 3);
  assert.equal(won.proposal.payload.service, undefined, "a move keeps the row's own service");
  assert.deepEqual([won.proposal.payload.amount_cents, won.proposal.payload.per], [250000, "month"]);
  assert.equal(won.proposal.summary, "Client · SEO · $2,500 a month");

  const again = await p("propose_deal", { contact_id: LUIS, stage: "proposed", note: "Called back in September" });
  assert.deepEqual(
    [again.proposal.payload.deal_id, again.proposal.payload.version, again.proposal.payload.note],
    ["d2", 2, "Called back in September"],
    "a passed proposal sent again moves its own row",
  );
  assert.equal(again.proposal.summary, "Proposal out · Ads");

  // REGRESSION: a move that named a service the open row is not for said that service on the card and moved the
  // open row anyway; the door never changes a row's service, so the card names the row it moves, or refuses.
  const wrong = await p("propose_deal", { contact_id: MARIA, stage: "won", service: "Ads" });
  assert.equal(wrong.isError, true);
  assert.match(wrong.result, /open deal is for SEO; name that service or none/);
  const bySeo = await p("propose_deal", { contact_id: NORA, stage: "won", service: "SEO" });
  assert.deepEqual(
    [bySeo.proposal.payload.deal_id, bySeo.proposal.payload.version, bySeo.proposal.summary],
    ["d3", 1, "Client · SEO"],
    "a named service picks its own open row, not the newest",
  );
  assert.equal(
    (await p("propose_deal", { contact_id: NORA, stage: "won", service: "seo" })).proposal.payload.deal_id,
    "d3",
    "the service folds (case and accents aside)",
  );
  // REGRESSION (0029): of two open, a move named none and moved the newest, without anyone saying it was that one.
  const unnamed = await p("propose_deal", { contact_id: NORA, stage: "won" });
  assert.equal(unnamed.isError, true, "no service named of two open: refused, never the newest guessed");
  assert.match(unnamed.result, /their open deals are for Ads and SEO; name the one this is for/);
  assert.match(
    (await p("propose_deal", { contact_id: NORA, stage: "won", service: "Web design" })).result,
    /their open deals are for Ads and SEO; name the one this is for/,
    "a service neither is for: the same words, never 'or none', which is refused too",
  );
  assert.match(
    (await p("propose_deal", { contact_id: P1, stage: "won" })).result,
    /no open deal to move; record a proposal first/,
    "no deal at all: refused in words before it becomes a card the door would refuse",
  );
  // A passed row is movable too (the door allows any move but out of ended); a service that is not its own is not.
  const lostWon = await p("propose_deal", { contact_id: LUIS, stage: "won" });
  assert.deepEqual([lostWon.proposal.payload.deal_id, lostWon.proposal.summary], ["d2", "Client · Ads"]);
  assert.match(
    (await p("propose_deal", { contact_id: LUIS, stage: "won", service: "SEO" })).result,
    /last deal is for Ads; name that service or none/,
  );
  const other = await p("propose_deal", { contact_id: LUIS, stage: "proposed", service: "SEO" });
  assert.deepEqual(
    [other.proposal.payload.deal_id, other.proposal.payload.service, other.proposal.summary],
    [undefined, "SEO", "Proposal out · SEO"],
    "a passed proposal sent again for another service is a new row",
  );

  // A proposal's link, its value and the day it stands until (0008): the card says the value and where the link lives,
  // and carries each into the route's body; a pass says why.
  const linked = await p("propose_deal", {
    contact_id: MARIA,
    stage: "proposed",
    service: "Ads",
    amount_cents: 120000,
    per: "once",
    proposal_url: "docs.example.com/p/maria",
    valid_until: "2026-09-30",
  });
  assert.equal(linked.isError, false, linked.result);
  assert.deepEqual(
    [linked.proposal.payload.proposal_url, linked.proposal.payload.valid_until, linked.proposal.payload.amount_cents],
    ["https://docs.example.com/p/maria", "2026-09-30", 120000],
    "the link as the one normalizer stores it",
  );
  assert.equal(linked.proposal.summary, "Proposal out · Ads · $1,200 · docs.example.com");
  const passed = await p("propose_deal", { contact_id: MARIA, stage: "lost", lost_reason: "price" });
  assert.deepEqual([passed.proposal.payload.deal_id, passed.proposal.payload.lost_reason], ["d1", "price"]);
  assert.equal(passed.proposal.summary, "Passed · SEO · Price");
  assert.match(
    (await p("propose_deal", { contact_id: MARIA, stage: "proposed", proposal_url: "mailto:maria@example.com" }))
      .result,
    /proposal_url: That needs to be a web address, starting with https:\/\//,
  );
  assert.match(
    (await p("propose_deal", { contact_id: MARIA, stage: "proposed", valid_until: "2026-02-31" })).result,
    /valid_until must be a day, like 2026-09-30/,
  );
  assert.match(
    JSON.parse((await p("propose_deal", { contact_id: MARIA, stage: "lost", lost_reason: "banana" })).result).error,
    /^propose_deal: lost_reason Invalid option/,
    "a reason the schema does not list is refused by the schema (PR 3.1, D2)",
  );
  assert.match(
    (await p("propose_deal", { contact_id: MARIA, stage: "won", lost_reason: "price" })).result,
    /lost_reason goes only with stage lost/,
  );

  const bad = await p("propose_deal", { contact_id: MARIA, stage: "banana" });
  assert.equal(bad.isError, true);
  assert.match(
    JSON.parse(bad.result).error,
    /^propose_deal: stage Invalid option/,
    "a stage the schema does not list is refused by the schema (PR 3.1, D2)",
  );
  assert.match((await p("propose_deal", { contact_id: C2, stage: "won" })).result, /no such person/);
  assert.match(
    (await p("propose_deal", { contact_id: "c1", stage: "won" })).result,
    /contact_id must be an id a read returned/,
  );
  assert.ok(
    !tc.ctx.supabase.seen.some((q) => ["insert", "update", "upsert", "delete"].includes(q.op)),
    "a proposal reads; it never writes",
  );
});

test("propose_deal carries a next step with its day: the card says it, the body takes the words whole, and a step without its day, a day without a step, or a day not real or gone is refused in words", async () => {
  const MARIA = "cccccccc-cccc-4ccc-8ccc-cccccccccc31";
  const t = tables({
    contacts: [
      {
        id: MARIA,
        tenant_id: A,
        display_name: "Maria",
        wa_profile_name: null,
        phone_e164: "+15555550131",
        email: null,
        erased_at: null,
      },
    ],
    deals: [
      {
        id: "d1",
        tenant_id: A,
        contact_id: MARIA,
        stage: "proposed",
        service: "SEO",
        version: 3,
        created_at: "2026-09-01T00:00:00Z",
      },
    ],
  });
  const tc = newToolContext(ctxFor(t), A, "operator", TZ, NOW);
  const p = (input) => buildProposal(tc, "propose_deal", { contact_id: MARIA, stage: "won", ...input });
  // Monday 14 September in New York: Friday is the 18th.
  const words = "Send the onboarding form and book the kickoff call";
  const won = await p({ next_step: `  ${words} `, next_step_due: "2026-09-18" });
  assert.equal(won.isError, false, won.result);
  assert.deepEqual([won.proposal.step, won.proposal.payload.deal_id], [{ body: words, due_on: "2026-09-18" }, "d1"]);
  // Beside the payload, never in it: a tab from before the step hands the payload to the strict deal route whole.
  assert.deepEqual(
    Object.keys(won.proposal.payload).filter((k) => k.includes("step")),
    [],
    "REGRESSION: an old tab's deal was refused for the step's keys",
  );
  assert.equal(won.proposal.summary, `Client · SEO · Next step: ${words}, due Fri`);
  assert.equal(
    (await p({ next_step: "Call", next_step_due: "2026-09-14" })).proposal.summary,
    "Client · SEO · Next step: Call, due today",
  );
  const long = "Call ".repeat(40).trim();
  const clipped = (await p({ next_step: long, next_step_due: "2026-09-18" })).proposal;
  assert.equal(clipped.step.body, long, "the note keeps the words whole");
  assert.ok(clipped.summary.length < 140, "the card clips them at a word");
  assert.equal((await p({})).proposal.step, undefined, "no step: nothing beside the body");
  for (const [input, why] of [
    [{ next_step: "Call" }, /next_step needs next_step_due, the day it is due/],
    [{ next_step_due: "2026-09-18" }, /next_step_due goes only with next_step/],
    [{ next_step: "Call", next_step_due: "2026-09-31" }, /next_step_due must be a day, like 2026-09-30/],
    [{ next_step: "Call", next_step_due: "2026-09-13" }, /next_step_due must be today or later/],
    [{ next_step: "x".repeat(601), next_step_due: "2026-09-18" }, /next_step is at most 600 characters/],
  ]) {
    const r = await p(input);
    assert.equal(r.isError, true, JSON.stringify(input));
    assert.match(r.result, why);
  }
});

test("the proposal follow-up in AI (0006): listed in every workspace and counted as the page counts it; proposed once, with its link", async () => {
  const DAY = 86_400_000;
  const luis = peopleListRow({
    id: LUIS,
    display_name: "Luis Mora",
    phone_e164: "+15555550101",
    deal_id: "dl1",
    deal_stage: "proposed",
    deal_proposed_at: iso(NOW.getTime() - 10 * DAY),
    deal_proposal_url: "https://docs.example.com/proposal/luis",
    last_inbound_at: iso(NOW.getTime() - 40 * DAY),
    latest_wa_inbound_at: iso(NOW.getTime() - 40 * DAY),
  });
  const deals = [
    { id: "dl1", tenant_id: A, contact_id: LUIS, stage: "proposed", proposed_at: iso(NOW.getTime() - 10 * DAY) },
  ];
  const on = (over = {}) =>
    tables({ tenants: [{ id: A, name: "Harbor", timezone: TZ, appointment_word: "meeting" }], deals, ...over });
  const context = (t) => newToolContext(ctxFor(t, { ...RPCS, people_list: () => [luis] }), A, "owner", TZ, NOW);
  const listed = async (t) =>
    JSON.parse((await runTool(context(t), { name: "sequences", input: { action: "moments" } })).result);
  const counts = (read) => {
    const x = read.triggers.find((y) => y.trigger === "proposal_waiting");
    return x && [x.said_yes_now, x.can_be_sent_now];
  };
  assert.deepEqual(counts(await listed(on())), [1, 1], "Luis waits, with his link and a yes");
  // Followed up already, by a playbook since deleted: counted out, as the page counts him.
  const link = [{ kind: "first_name" }, { kind: "business_name" }, { kind: "proposal_link" }];
  const followed = on({
    broadcasts: [
      {
        id: "old-run",
        tenant_id: A,
        playbook_id: null,
        state: "sent",
        scheduled_for: iso(NOW.getTime() - 3 * DAY),
        created_at: iso(NOW.getTime() - 3 * DAY),
        run_for: null,
        params: link,
      },
    ],
    broadcast_recipients: [
      { tenant_id: A, broadcast_id: "old-run", contact_id: LUIS, state: "sent", sent_at: iso(NOW.getTime() - 3 * DAY) },
    ],
  });
  assert.deepEqual(counts(await listed(followed)), [1, 0]);
  // Every workspace has it (0008, amended 18 Oct 2026), whatever the retired answer said.
  assert.deepEqual(counts(await listed(tables({ deals }))), [1, 1], "listed, and Luis waits");
  // Proposed with its link, and never a second.
  const tpl = {
    id: TPL,
    tenant_id: A,
    channel: "whatsapp",
    name: "proposal_follow_up",
    language: "en_US",
    meta_status: "approved",
    // 2 Oct 2026: the column holds Meta's category lowercased (purposeOfTemplate), and a follow-up's message must be a
    // utility one: the check refuses an offer there (contracts messageFitsMoment). "UTILITY" read as an offer.
    category: "utility",
    variables: [{ position: 1 }, { position: 2 }, { position: 3 }],
    body_preview: "Hi {{1}}, just making sure the proposal from {{2}} reached you: {{3}}.",
    hidden_at: null,
  };
  const propose = (t) =>
    buildProposal(context(t), "propose_sequence", { action: "moment", trigger: "proposal_waiting" });
  // Every workspace may make one (0008, amended 18 Oct 2026), whatever the retired answer said: with no message of its
  // own yet, the card adds the follow-up's starter first.
  const started = await propose(tables({ deals }));
  assert.equal(started.isError, false, started.result);
  assert.match(started.result, /adds the “Proposal follow-up” starter first/);
  const own = await propose(tables({ deals, templates: [tpl] }));
  assert.equal(own.isError, false, own.result);
  assert.match(
    (await propose(on({ templates: [tpl], playbooks: [{ id: "pb", tenant_id: A, trigger: "proposal_waiting" }] })))
      .result,
    /already has a proposal follow-up/,
  );
  const made = await propose(on({ templates: [tpl] }));
  assert.equal(made.isError, false, made.result);
  assert.deepEqual(
    [made.proposal.payload.policy_class, made.proposal.payload.params, made.proposal.payload.candidates],
    ["follow_up", link, 1],
  );
  // The card counts as the page does: Luis had his follow-up, so a run reaches nobody.
  const again = await propose({ ...followed, templates: [tpl] });
  assert.equal(again.isError, false, again.result);
  assert.equal(again.proposal.payload.candidates, 0);
});

test("everyone in People is read once a turn, through the readers: a turn that lists the playbooks and the audiences and proposes a playbook and a broadcast reads every page of People once, and their reply modes once -- where the listing and the playbooks each read them -- a search by a list counts over that same pool, and a search by words reads its own page once; the zone and the settings once each, and the memo is gone from the tools' context", async () => {
  // A thousand and one people, each with a number and a yes to offers: People is read a page at a time.
  const many = Array.from({ length: 1001 }, (_, i) =>
    peopleListRow({
      id: `dddddddd-dddd-4ddd-8ddd-${String(i).padStart(12, "0")}`,
      display_name: `Person ${i}`,
      phone_e164: `+1555${String(1000000 + i)}`,
      marketing_consent: "opted_in",
      marketing_consent_source: "customer_message",
      marketing_consent_updated_at: iso(NOW.getTime() - 20 * 86_400_000),
    }),
  );
  const doors = {
    ...RPCS,
    people_list: (a) =>
      a.p_query
        ? many.filter((p) => p.display_name.includes(a.p_query))
        : many.slice(a.p_offset ?? 0, (a.p_offset ?? 0) + (a.p_limit ?? 1000)),
  };
  const ctx = {
    supabase: fakeDb(tables({ templates: [OFFER] }), {}, doors, { maxRows: 1000 }),
    userId: USER,
    email: "ada@example.com",
    params: {},
  };
  const tc = newToolContext(ctx, A, "owner", TZ, NOW);
  assert.equal("memo" in tc, false, "the tools' context holds the turn's readers and nothing else to remember");
  const everyone = () =>
    ctx.supabase.seen.filter((q) => q.rpc === "people_list").map((q) => q.args.p_query ?? q.args.p_offset ?? 0);
  const replyModes = () =>
    ctx.supabase.seen.filter((q) => q.columns === "subject_type, subject_id, mode" || /reply_modes/.test(q.rpc)).length;
  // The prefetch's pair for "start a win-back playbook for the quiet clients", then the two cards.
  for (const action of ["moments", "lists"]) {
    const out = await runTool(tc, { name: "sequences", input: { action } });
    assert.equal(out.isError, false, out.result);
  }
  const playbook = await buildProposal(tc, "propose_sequence", {
    action: "moment",
    trigger: "quiet_30",
    template_id: TPL,
    params: [],
  });
  assert.equal(playbook.isError, false, playbook.result);
  const card = await buildProposal(tc, "propose_sequence", {
    action: "once",
    template_id: TPL,
    audience_kind: "everyone",
    audience_id: null,
    params: [],
  });
  assert.equal(card.isError, false, card.result);
  assert.equal(card.proposal.payload.count, 1001, "every page, as the send enrols them");
  assert.deepEqual(
    [everyone(), replyModes()],
    [[0, 1000], 1],
    "every page of People once and the reply modes once, for the Playbooks page's pools and the audience pool alike, where each read its own",
  );
  const byList = await runTool(tc, { name: "people", input: { action: "search", query: "", list: "seg:phoned_only" } });
  assert.equal(byList.isError, false, byList.result);
  assert.deepEqual([everyone(), replyModes()], [[0, 1000], 1], "a list is counted over the same pool");
  const byWords = await runTool(tc, { name: "people", input: { action: "search", query: "Person 7" } });
  assert.equal(byWords.isError, false, byWords.result);
  assert.deepEqual(
    [everyone(), replyModes()],
    [[0, 1000, "Person 7"], 2],
    "a search by words reads the People page's own page, once, with its reply modes",
  );
  const reads = (key, columns) =>
    ctx.supabase.seen.filter(
      (q) =>
        (q.rpc ? `rpc:${q.rpc}` : `${q.table}.${q.op}`) === key && (columns === undefined || q.columns === columns),
    ).length;
  assert.deepEqual(
    [reads("tenants.select", "name, timezone"), reads("tenant_config.select")],
    [1, 1],
    "the zone and the settings once each, whichever read asked first",
  );
});

test("the assistant counts with the calendar too: a visit tomorrow on the owner's calendar is counted by campaigns.playbooks' reminder from the feed, over the same people the page counts, and the Bookings class's mode is said beside the others", async () => {
  const { forgetFeeds } = await import(at("apps/dashboard/src/server/calendar/openings.ts"));
  const ICS = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//test//EN",
    "BEGIN:VEVENT",
    "UID:e-tomorrow",
    "DTSTART:20260915T140000Z",
    "DTEND:20260915T150000Z",
    "SUMMARY:Colour",
    "DESCRIPTION:Rosa +15555550102",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  const base = tables();
  const t = tables({
    tenant_config: [
      {
        ...base.tenant_config[0],
        config: { ...base.tenant_config[0].config, calendar: { ical_url: "https://calendar.example/harbor.ics" } },
      },
    ],
  });
  const fetchWas = globalThis.fetch;
  globalThis.fetch = async () => new Response(ICS, { status: 200, headers: { "content-type": "text/calendar" } });
  try {
    forgetFeeds();
    const tc = newToolContext(ctxFor(t, { ...RPCS, people_list: () => threeAnswers() }), A, "owner", TZ, NOW);
    const out = await runTool(tc, { name: "sequences", input: { action: "moments" } });
    assert.equal(out.isError, false, out.result);
    const read = JSON.parse(out.result);
    const reminder = read.triggers.find((x) => x.trigger === "visit_tomorrow");
    assert.deepEqual(
      [reminder.said_yes_now, reminder.can_be_sent_now],
      [1, 1],
      "Rosa's visit tomorrow, read from the feed: her yes to messages and her number",
    );
    assert.equal(
      read.new_sequences_start_as.booking,
      "ask",
      "a new Bookings sequence, which the reminder runs as, with no row: ask",
    );
  } finally {
    globalThis.fetch = fetchWas;
    forgetFeeds();
  }
});

test("the assistant offers the moments a new playbook may start from (2 Oct 2026): the win-back is the one the workspace can read, welcome and save our number are not offered though a playbook made on one is still listed, and a proposal for the win-back it cannot read is refused in words", async () => {
  const { forgetFeeds } = await import(at("apps/dashboard/src/server/calendar/openings.ts"));
  const { winBackWords } = await import("@chanlytics/contracts");
  // This world picked no word: its word is the default (contracts appointmentWordOf).
  const WIN_BACK_WORDS = winBackWords("appointment");
  const ICS = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//test//EN", "END:VCALENDAR"].join("\r\n");
  // A workspace with a calendar address on file: its feed read, or not.
  const connected = (over = {}) => {
    const base = tables(over);
    return {
      ...base,
      tenant_config: [
        {
          ...base.tenant_config[0],
          config: { ...base.tenant_config[0].config, calendar: { ical_url: "https://calendar.example/harbor.ics" } },
        },
      ],
    };
  };
  const welcome = {
    id: "pb-welcome",
    tenant_id: A,
    kind: "moment",
    name: "Welcome",
    trigger: "new_week",
    template_id: TPL,
    template_name: "fall_offer",
    template_language: "en",
    params: [],
    policy_class: "campaign",
    state: "running",
    run_hour: 10,
    cap_per_run: 25,
    gap_days: 30,
    cadence_days: 30,
    last_run_for: null,
    last_run_at: null,
    created_at: iso(NOW.getTime() - 30 * 86_400_000),
  };
  const toolContext = (t) => newToolContext(ctxFor(t), A, "owner", TZ, NOW);
  const listed = async (t) => {
    const out = await runTool(toolContext(t), { name: "sequences", input: { action: "moments" } });
    assert.equal(out.isError, false, out.result);
    return JSON.parse(out.result);
  };
  const offered = (read) => read.triggers.map((x) => x.trigger);
  // No calendar: no appointment moment either (D44, 9 Oct 2026), since without one its run reads nothing. And the
  // proposal follow-up's moment, every workspace's (0008, amended 18 Oct 2026). A calendar frees times too (0082).
  // And a deal marked won (22 Nov 2026): read off the deal, so it is offered with or without a calendar.
  const SILENCE = ["quiet_30", "everyone_monthly", "saved_list", "proposal_waiting", "deal_won"];
  // And starts a sequence for one person at a time of their own (decision 0119; Ask proposes them since 10 Nov 2026).
  const OCCASIONS = ["visit_soon", "visit_missed", "asked_no_booking"];
  const VISITS = [
    "everyone_monthly",
    "visit_tomorrow",
    "visited",
    "lapsed",
    "saved_list",
    "proposal_waiting",
    "slot_opened",
    ...OCCASIONS,
    "deal_won",
  ];
  const feed = (status) => async () => new Response(status === 200 ? ICS : "down", { status });
  const fetchWas = globalThis.fetch;
  try {
    forgetFeeds();
    // No calendar: the win-back by silence, and neither welcome nor save our number nor the one by visits.
    const none = await listed(tables({ templates: [OFFER], playbooks: [welcome] }));
    assert.deepEqual(offered(none), SILENCE, "no calendar: Win-back goes by silence");
    assert.deepEqual(
      none.playbooks.map((p) => [p.trigger, p.trigger_label]),
      [["new_week", "Welcome"]],
      "a playbook made on a moment no longer offered is still listed, as it was",
    );
    // A calendar on file whose feed reads: the win-back by visits.
    globalThis.fetch = feed(200);
    forgetFeeds();
    const withCalendar = await listed(connected());
    assert.deepEqual(offered(withCalendar), VISITS, "a calendar: Win-back goes by visits");
    // An occasion's four, each with its starter and no count: nobody is named by one ahead of time, and the read says
    // so by its mark, never by a count of nobody.
    assert.deepEqual(
      withCalendar.triggers
        .filter((x) => [...OCCASIONS, "deal_won"].includes(x.trigger))
        .map((x) => [
          x.trigger,
          x.starter_template,
          x.each_at_their_own_time,
          "said_yes_now" in x || "can_be_sent_now" in x,
        ]),
      [
        ["visit_soon", "Two-hour reminder", true, false],
        ["visit_missed", "Missed appointment", true, false],
        ["asked_no_booking", "Booking follow-up", true, false],
        ["deal_won", "Thank you, new client", true, false],
      ],
    );
    assert.match(withCalendar.note, /each_at_their_own_time marks a moment that names nobody ahead of time/);
    assert.match(withCalendar.note, /someone marked as a client\)/);
    assert.deepEqual(
      none.triggers.filter((x) => "each_at_their_own_time" in x).map((x) => x.trigger),
      ["deal_won"],
      "and with no calendar none of the three about a visit or a booking is offered: the deal's alone",
    );
    // One on file whose feed cannot be read just now is still connected: the offer does not swap back to silence.
    globalThis.fetch = feed(500);
    forgetFeeds();
    assert.deepEqual(offered(await listed(connected())), VISITS, "a feed down is still a calendar");
    // A proposal asks the same question of the same fact, with the turn's own read of the settings.
    const win = { action: "moment", template_id: TPL, params: [] };
    const refused = async (t, trigger) => {
      const out = await buildProposal(toolContext(t), "propose_sequence", { ...win, trigger });
      assert.equal(out.isError, true, out.result);
      return JSON.parse(out.result).error;
    };
    assert.equal(await refused(connected({ templates: [OFFER] }), "quiet_30"), WIN_BACK_WORDS.quiet_30);
    assert.equal(await refused(tables({ templates: [OFFER] }), "lapsed"), WIN_BACK_WORDS.lapsed);
    const made = await buildProposal(toolContext(tables({ templates: [OFFER] })), "propose_sequence", {
      ...win,
      trigger: "quiet_30",
    });
    assert.equal(made.isError, false, made.result);
    assert.equal(made.proposal.payload.trigger, "quiet_30", "and the one it can read is proposed");
  } finally {
    globalThis.fetch = fetchWas;
    forgetFeeds();
  }
});

test("people.search reads what the People page reads (ledger #7): one SQL page for the query, so a WhatsApp name and three digits of a number find who the page finds, where the old match on the name alone and four digits found nobody; the page's order and its count; each person in the People row's own words for where they stand; and the pool is never read", async () => {
  const rows = twoPeople();
  const ctx = ctxFor(tables({ contacts: contactsOf(rows) }), { ...RPCS, people_list: peopleListMatching(rows) });
  const tc = newToolContext(ctx, A, "owner", TZ, NOW);
  const search = async (query) => {
    const out = await runTool(tc, { name: "people", input: { action: "search", query } });
    assert.equal(out.isError, false, out.result);
    return JSON.parse(out.result);
  };
  const byWhatsAppName = await search("Rosi");
  assert.deepEqual(
    [byWhatsAppName.people.map((p) => p.name), byWhatsAppName.matches],
    [["Rosa Diaz"], 1],
    "her WhatsApp name finds her, as the page's search does; the name alone did not",
  );
  const byThreeDigits = await search("018");
  assert.deepEqual(
    [byThreeDigits.people.map((p) => p.contact_id), byThreeDigits.matches],
    [[ROSA], 1],
    "three digits of her number, as the page matches them; the old match wanted four",
  );
  const everyone = await search("");
  assert.deepEqual(
    [everyone.people.map((p) => p.contact_id), everyone.matches],
    [[LUIS, ROSA], 2],
    "no query is the page's first page, in the function's order, counted where the rows are",
  );
  // Where they stand, in the People row's own words: its builder, for the member asking (surface-data.ts personRowOf).
  const vm = (r) => toPersonRowVM({ ...r, effective_reply_mode: null, visits: null }, TZ, NOW, USER);
  assert.deepEqual(
    everyone.people.map((p) => [p.state, p.state_detail]),
    rows.map((r) => [vm(r).stateLabel, vm(r).stateDetail || null]),
  );
  assert.deepEqual(
    everyone.people.map((p) => p.state),
    ["Needs you", "Quiet"],
    "Rosa was 'Active' in the tool's own three states: the page says Quiet",
  );
  assert.ok(tc.read.person.has(ROSA) && tc.read.thread.has(C2), "a person found is a row read, and their conversation");
  assert.deepEqual(
    ctx.supabase.seen.filter((q) => q.rpc === "people_list").map((q) => q.args.p_query ?? null),
    ["Rosi", "018", null],
    "the page's read, one per query; never everyone for a pool",
  );
});

test("people.search answers who booked and who never did, a list counted over the audience pool as the People rail counts one: everyone with their visits from the owner's calendar, and the Booked and Asked, never booked lists judged with the pool's calendar", async () => {
  const { forgetFeeds } = await import(at("apps/dashboard/src/server/calendar/openings.ts"));
  const ICS = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//test//EN",
    "BEGIN:VEVENT",
    "UID:e-rosa",
    "DTSTART:20260916T140000Z",
    "DTEND:20260916T150000Z",
    "SUMMARY:Colour",
    "DESCRIPTION:Rosa +15555550182",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  const rows = twoPeople().map((r) => ({
    ...r,
    last_message_at: iso(NOW.getTime() - 3 * 86_400_000),
    last_inbound_at: iso(NOW.getTime() - 3 * 86_400_000),
  }));
  const base = tables();
  // Rosa's visit as the record holds it (15 Oct 2026): a booking that arrived by email, for her number, at the feed's time.
  // Its id comes with her next visit, a row an answer may cite. (A feed event nobody said a word of is not in the pools'
  // read of the record, listFeedWordsOver: its words alone, and the Calendar's week names its id.)
  const VISIT = "dddddddd-dddd-4ddd-8ddd-ddddddddddd2";
  const t = tables({
    contacts: contactsOf(rows),
    tenant_config: [
      {
        ...base.tenant_config[0],
        config: { ...base.tenant_config[0].config, calendar: { ical_url: "https://calendar.example/harbor.ics" } },
      },
    ],
    appointments: [
      {
        id: VISIT,
        tenant_id: A,
        source: "booking_email",
        status: "booked",
        title: "Colour",
        client_name: "Rosa Diaz",
        client_phone: "+15555550182",
        starts_at: "2026-09-16T14:00:00.000Z",
        ends_at: "2026-09-16T15:00:00.000Z",
        vanished_at: null,
      },
    ],
  });
  const fetchWas = globalThis.fetch;
  globalThis.fetch = async () => new Response(ICS, { status: 200, headers: { "content-type": "text/calendar" } });
  try {
    forgetFeeds();
    const tc = newToolContext(ctxFor(t, { ...RPCS, people_list: peopleListMatching(rows) }), A, "owner", TZ, NOW);
    const on = async (list) =>
      JSON.parse((await runTool(tc, { name: "people", input: { action: "search", query: "", list } })).result);
    const booked = await on("booked");
    assert.deepEqual(
      booked.people.map((p) => p.name),
      ["Rosa Diaz"],
    );
    assert.match(booked.people[0].next_visit, /Colour$/, "her next visit, from the feed");
    assert.equal(booked.people[0].next_visit_id, VISIT, "and its id, as the record keeps it");
    assert.deepEqual(
      [...tc.read.visit.values()].map((r) => [r.id, r.route]),
      [[VISIT, `calendar/2026-09-16:a-${VISIT}`]],
      "a row read, opened on its day with its sheet",
    );
    const never = await on("asked_never_booked");
    assert.deepEqual(
      [never.people.map((p) => p.name), never.people[0].next_visit, never.people[0].next_visit_id],
      [["Luis Mora"], null, null],
      "wrote this month, and the calendar never had him",
    );
  } finally {
    globalThis.fetch = fetchWas;
    forgetFeeds();
  }
});

test("campaigns.audiences offers the templates the composer offers (ledger #9): approved and not hidden by the workspace -- the one the workspace hid is never offered, as the composer's own read never offers it", async () => {
  const T2 = "dddddddd-dddd-4ddd-8ddd-ddddddddddd2";
  const T3 = "dddddddd-dddd-4ddd-8ddd-ddddddddddd3";
  const tpl = (id, name, over = {}) => ({ ...OFFER, id, name, ...over });
  const t = tables({
    templates: [
      tpl(TPL, "fall_offer"),
      tpl(T2, "summer_offer", { hidden_at: iso(NOW.getTime() - 86_400_000) }),
      tpl(T3, "winter_offer", { meta_status: "pending" }),
    ],
  });
  const out = await runTool(newToolContext(ctxFor(t), A, "owner", TZ, NOW), {
    name: "sequences",
    input: { action: "lists" },
  });
  assert.equal(out.isError, false, out.result);
  const offered = JSON.parse(out.result).templates.map((x) => x.template_id);
  assert.deepEqual(offered, [TPL, T3], "the approved one and the one WhatsApp is still checking; never the hidden one");
  const composer = await templatesRoute.GET.run(new Request(`http://localhost/api/v1/templates?workspace=${A}`), {
    ...ctxFor(t),
    params: {},
  });
  assert.deepEqual(
    offered,
    composer.templates.filter((x) => x.channel === "whatsapp").map((x) => x.id),
    "the composer's own list",
  );
});

test("campaigns.playbooks says the Playbooks page's numbers (ledger #10): every moment's and every list's counts are the page's chips -- over everyone with no one looking and the week's touches applied, so Rosa, reached by a broadcast yesterday, waits out the week where the tool's own count reached her -- its rows and next runs are the page's, and a list the page cannot count says why as far as the page's read says, never a reason it does not give", async () => {
  const DAY = 86_400_000;
  const S_REG = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";
  const S_MINE = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2";
  const S_NEWER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3";
  const GONE = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb9";
  const sent = iso(NOW.getTime() - DAY);
  const pbRow = (id, over) => ({
    id,
    tenant_id: A,
    kind: "moment",
    name: "Win-back",
    trigger: "saved_list",
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
    ...over,
  });
  const t = tables({
    playbooks: [
      pbRow("pb-regulars", { list_id: S_REG }),
      pbRow("pb-booked", { list_key: "booked", created_at: "2026-09-02T00:00:00Z" }),
      pbRow("pb-gone", { list_id: GONE, created_at: "2026-09-03T00:00:00Z" }),
      pbRow("pb-monthly", {
        trigger: "everyone_monthly",
        policy_class: "campaign",
        created_at: "2026-09-04T00:00:00Z",
      }),
      pbRow("pb-quiet", { list_key: "quiet", created_at: "2026-09-05T00:00:00Z" }),
      pbRow("pb-mine", { list_id: S_MINE, created_at: "2026-09-06T00:00:00Z" }),
      pbRow("pb-newer", { list_id: S_NEWER, created_at: "2026-09-07T00:00:00Z" }),
    ],
    segments: [
      { id: S_REG, tenant_id: A, name: "Regulars", rule: null },
      // About whoever is looking: a run has no one (the page's read says so).
      { id: S_MINE, tenant_id: A, name: "Mine", rule: { all: [{ field: "assigned", op: "is", value: "me" }] } },
      // A rule this version can't read: the page counts it for nobody, and People says why on the list.
      { id: S_NEWER, tenant_id: A, name: "From the future", rule: { v: 3, all: [{ field: "future_fact" }] } },
    ],
    segment_members: [
      { tenant_id: A, segment_id: S_REG, contact_id: LUIS },
      { tenant_id: A, segment_id: S_REG, contact_id: ROSA },
    ],
    broadcasts: [
      {
        id: "b-yesterday",
        tenant_id: A,
        playbook_id: null,
        state: "sent",
        scheduled_for: sent,
        created_at: sent,
        run_for: null,
        params: [],
      },
    ],
    broadcast_recipients: [
      { tenant_id: A, broadcast_id: "b-yesterday", contact_id: ROSA, state: "sent", sent_at: sent },
    ],
  });
  const doors = { ...RPCS, people_list: () => threeAnswers() };
  const out = await runTool(newToolContext(ctxFor(t, doors), A, "owner", TZ, NOW), {
    name: "sequences",
    input: { action: "moments" },
  });
  assert.equal(out.isError, false, out.result);
  const read = JSON.parse(out.result);
  // The page's own read of the same workspace, on the same clock (readers/playbooks.ts, GET playbooks' body).
  const page = (
    await load(readerContext(ctxFor(t, doors), { tenantId: A, role: "owner" }, NOW), playbooksReader, undefined)
  ).data;
  const chip = (key) => ({ said_yes_now: page.pools[key].saidYes, can_be_sent_now: page.pools[key].candidates });
  // A moment that names nobody ahead of time (a deal marked won, offered here with no calendar) has no chip to say.
  for (const x of read.triggers.filter((y) => !y.counted_per_list && !y.each_at_their_own_time))
    assert.deepEqual({ said_yes_now: x.said_yes_now, can_be_sent_now: x.can_be_sent_now }, chip(x.trigger), x.trigger);
  assert.deepEqual(
    read.triggers.filter((y) => y.each_at_their_own_time).map((y) => [y.trigger, page.pools[y.trigger]]),
    [["deal_won", null]],
    "and the page counts nobody for it either",
  );
  const monthly = read.triggers.find((x) => x.trigger === "everyone_monthly");
  assert.deepEqual(
    [monthly.said_yes_now, monthly.can_be_sent_now],
    [2, 0],
    "Ana and Rosa said yes to offers; only Rosa has a number, and a broadcast reached her yesterday: the tool said 1",
  );
  assert.deepEqual(
    read.playbooks.map((p) => [p.playbook_id, p.next_run]),
    page.playbooks.map((p) => [p.id, nextRunLabel(p, page.timezone, NOW, false)]),
    "the page's rows, and its next-run words",
  );
  const byId = Object.fromEntries(read.playbooks.map((p) => [p.playbook_id, p]));
  assert.deepEqual(
    [byId["pb-regulars"].list, byId["pb-regulars"].said_yes_now, byId["pb-regulars"].can_be_sent_now],
    [`list:${S_REG}`, chip(`list:${S_REG}`).said_yes_now, chip(`list:${S_REG}`).can_be_sent_now],
    "a list of the workspace's own, counted as the page counts it",
  );
  assert.deepEqual(
    [byId["pb-booked"].list, byId["pb-booked"].cannot_count],
    ["seg:booked", "This list reads a calendar link. Add one under Settings › Hours & booking to count it."],
  );
  assert.deepEqual([byId["pb-gone"].cannot_count, byId["pb-gone"].said_yes_now], ["its list was deleted", undefined]);
  assert.deepEqual(
    [byId["pb-quiet"].said_yes_now, byId["pb-quiet"].can_be_sent_now],
    [chip("seg:quiet").said_yes_now, chip("seg:quiet").can_be_sent_now],
  );
  assert.deepEqual(
    [byId["pb-mine"].cannot_count, byId["pb-newer"].cannot_count],
    [
      "This list is about whoever is looking, so only a person can count it.",
      "it could not be counted just now; People says why on the list",
    ],
    "the page's reason where its read carries one, and never a reason guessed for a list of the workspace's own",
  );
  assert.ok(read.note.includes("can_be_sent_now") && read.note.includes("within a week of today"), read.note);
  assert.ok(read.note.includes("A null count means the page could not count it just now."), read.note);
  // Everyone could not be read: no moment and no list is counted, and each says so -- never a calendar to connect or a
  // service to add, which is what a People read that failed looked like (no People list offered at all).
  const { result: blindOut, lines } = await logged("playbook_pools_people_failed", () =>
    runTool(
      newToolContext(
        ctxFor(t, {
          ...doors,
          people_list: () => {
            throw new Error("canceling statement due to statement timeout");
          },
        }),
        A,
        "owner",
        TZ,
        NOW,
      ),
      { name: "sequences", input: { action: "moments" } },
    ),
  );
  assert.equal(blindOut.isError, false, blindOut.result);
  assert.equal(lines.length, 1, "said once in the log");
  const blind = JSON.parse(blindOut.result);
  const blindById = Object.fromEntries(blind.playbooks.map((p) => [p.playbook_id, p]));
  assert.deepEqual(
    ["pb-booked", "pb-quiet", "pb-regulars", "pb-mine"].map((id) => blindById[id].cannot_count),
    [
      "it could not be counted just now",
      "it could not be counted just now",
      "its list could not be read just now",
      "its list could not be read just now",
    ],
  );
  // A moment that names nobody ahead of time (a deal marked won) has no count to lose.
  assert.ok(
    blind.triggers
      .filter((x) => !x.counted_per_list && !x.each_at_their_own_time)
      .every((x) => x.said_yes_now === null && x.can_be_sent_now === null),
  );
  assert.ok(!/Settings/.test(JSON.stringify(blind.playbooks)), "REGRESSION: a failed read was told to fix Settings");
});

test("the workspace's pages are read once a turn, each tool as its page reads it: workspace.settings and campaigns.audiences read the channels once between them and campaigns.audiences the composers' templates once, leads.searches the searches and the rail's counts once each -- however often the model asks; workspace.settings says the channels in the page's order, campaigns.audiences the page's number, leads.searches the rail's six counts (ledger #12)", async () => {
  const COUNTS = { all: 12, ready: 7, nurture: 2, converted: 1, said_no: 1, not_a_fit: 1 };
  const ctx = ctxFor(tables({ tenant_channels: CHANNELS, templates: [OFFER], lead_searches_view: [WAITING_SEARCH] }), {
    ...RPCS,
    lead_list_counts: () => COUNTS,
  });
  const s = scripted([
    ROUND([
      tool("workspace", { action: "settings" }),
      tool("sequences", { action: "lists" }),
      tool("leads", { action: "searches" }),
    ]),
    ROUND([
      tool("sequences", { action: "lists" }, "t-audiences-again"),
      tool("leads", { action: "searches" }, "t-searches-again"),
    ]),
    ROUND([answer("Your WhatsApp number is fine and one search is waiting on you.")]),
  ]);
  const { input } = turn(ctx);
  const r = await runAskTurn(input, ports(s.round));
  assert.equal(r.failed, false, r.failure ?? "");
  const selects = (table) => ctx.supabase.seen.filter((q) => q.table === table && q.op === "select").length;
  assert.deepEqual(
    ["tenant_channels", "templates", "lead_searches_view"].map(selects),
    [3, 1, 1],
    // 3 Oct 2026: the channels reader's one read serves workspace.settings and campaigns.audiences alike; the audience
    // pool's rows are judged against what the workspace can send on (readers/facts.ts channelsReady: the number's config
    // and the texting line), once a turn, a read of its own. 14 Nov 2026 (decision 0132): Today's read says what WhatsApp
    // holds against the number, once a turn, beside its other reads, so its chip never says "connected" while WhatsApp
    // delivers nothing.
    "the channels once for workspace.settings and campaigns.audiences alike, once for the pool's readiness and once for Today's WhatsApp hold; the templates once, the searches once",
  );
  assert.equal(ctx.supabase.seen.filter((q) => q.rpc === "lead_list_counts").length, 1, "the rail's counts once");
  // Every tool result the model was handed, by its call's id, across both rounds.
  const out = Object.fromEntries(
    s.requests
      .at(-1)
      .messages.flatMap((m) => (Array.isArray(m.content) ? m.content : []))
      .filter((c) => c.type === "tool_result")
      .map((c) => [c.tool_use_id, fromRecord(c.content)]),
  );
  assert.deepEqual(
    out["t-workspace.settings"].channels,
    // Each line's state in Connections' words (contracts toChannelVM), never the stored "active" (R13 X5-7).
    [
      { kind: "voice", status: "Receiving · last call 2h ago", number: "+19295550100" },
      { kind: "whatsapp", status: "Receiving · last message 1h ago", number: "+19295550199" },
    ],
    "the same three fields, in the page's order: by kind",
  );
  // The page's own builder, over what the page reads of the number: Meta's quality and limit from the row's config.
  const health = numberHealth({ quality: "YELLOW", event: null, limit: "TIER_1K" });
  assert.deepEqual(
    out["t-sequences.lists"].number,
    { present: true, health: health.label, can_send: health.canSend, limit_per_day: 1000 },
    "the number the Broadcasts page picks, and its health from the quality Meta assigned it",
  );
  assert.deepEqual(out["t-audiences-again"], out["t-sequences.lists"], "the same answer from the turn's reads");
  const searches = out["t-leads.searches"];
  assert.deepEqual(searches.counts, COUNTS, "the rail's six counts, as the Leads page shows them");
  assert.deepEqual(
    searches.searches.map((x) => [x.id, x.state, x.question]),
    [[WAITING_SEARCH.id, "waiting for an answer from you", "Most of the first 25 are chain gyms. Include them?"]],
  );
  assert.deepEqual(out["t-searches-again"], searches);
});
