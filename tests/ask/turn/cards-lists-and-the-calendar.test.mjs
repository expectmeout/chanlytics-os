/**
 * Cards and who they reach: a card refused above a member's role, its undo words, a broadcast to nobody refused with
 * its cause, audiences that tell a yes from a reach, the lists Ask reaches by reference, and the calendar's and the
 * report's reads as their pages read them.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeDb } from "../../_fake-db.mjs";
import {
  EVERYONE_LABEL,
  NO_NUMBER_REACH,
  noNumberWords,
  toReportVM,
  toBookingReportVM,
  toDealReportVM,
} from "@chanlytics/contracts";
import {
  A,
  ACT_DEFS,
  ANA,
  C1,
  C2,
  LUIS,
  NOW,
  P1,
  READ_DEFS,
  READ_TOOLS,
  ROSA,
  RPCS,
  TPL,
  TZ,
  USER,
  at,
  buildProposal,
  contact,
  conversation,
  ctxFor,
  iso,
  load,
  newToolContext,
  peopleListRow,
  readerContext,
  reportReader,
  runTool,
  tables,
  threeAnswers,
  workspaceReads,
} from "./_turn.mjs";

test("a card above an operator is refused to a member below it in its route's words, before anything is read: a partner gets a settings card and is refused a person's mode and a merge, an owner gets all three (D7)", async () => {
  // Rosa twice, as a merge finds her: the second record by her other number.
  const P2 = "abababab-abab-4aba-8aba-abababababa2";
  const twice = [
    { ...contact, tenant_id: A, erased_at: null },
    { ...contact, id: P2, display_name: "Rosa D.", phone_e164: "+15555550101", tenant_id: A, erased_at: null },
  ];
  const as = (role) => {
    const ctx = ctxFor(tables({ contacts: twice }));
    return { ctx, tc: newToolContext(ctx, A, role, TZ, NOW) };
  };
  // Each ask, and the refusal a member below its card's role hears: an owner's card names the owner; a partner's
  // names the owner and the workspace's partner, as the lead search's words do (#1159, decision 0012). A member below
  // the card's role is not offered its tool (D12) or its action (D2); should a call arrive anyway, an action is refused
  // by the registry in its words, and the builder, past it, still refuses in its route's.
  const ASKS = [
    [
      "propose_person",
      { action: "mode", contact_id: P1, mode: "never" },
      "only an owner can change how AI treats one person; say so, and that an owner can ask",
      "propose_person: action mode is an owner's",
    ],
    [
      "propose_settings",
      { action: "change", change: { op: "add_closure", date: "2026-12-25", note: "Christmas" } },
      "only an owner or the workspace's partner can change the workspace's settings; say so, and that one of them can ask",
      "propose_settings: action change is an owner's or a partner's",
    ],
    [
      "propose_person",
      { action: "merge", contact_id: P1, other_id: P2 },
      "only an owner can merge two records of one person; say so, and that an owner can ask",
      "propose_person: action merge is an owner's",
    ],
  ];
  /** The builder, past the registry: the action's own, or the tool's one. */
  const builder = (name, input) => {
    const def = READ_DEFS.concat(ACT_DEFS).find((d) => d.name === name);
    const { action = "", ...rest } = input;
    return (tc) => def.actions[action].build(tc, action ? rest : input);
  };
  for (const [name, input, refusal, registry] of ASKS) {
    const { ctx, tc } = as("operator");
    const out = await buildProposal(tc, name, input);
    assert.deepEqual(
      [out.proposal, out.isError, JSON.parse(out.result).error],
      [null, true, registry ?? refusal],
      name,
    );
    const own = await builder(name, input)(tc);
    assert.equal(JSON.parse(own.result).error, refusal, `${name}: its builder's own check stays`);
    assert.deepEqual(ctx.supabase.seen, [], `${name}: an operator is refused before anything is read`);
  }
  // REGRESSION (D7): an operator used to be handed these three cards, which the palette gated and the routes refused.
  const partner = as("partner").tc;
  const settings = await buildProposal(partner, "propose_settings", ASKS[1][1]);
  assert.equal(settings.isError, false, settings.result);
  assert.deepEqual([settings.proposal.kind, settings.proposal.needs], ["settings", "partner"]);
  for (const [name, input, refusal, registry] of [ASKS[0], ASKS[2]]) {
    assert.equal(JSON.parse((await buildProposal(partner, name, input)).result).error, registry, name);
    assert.equal(JSON.parse((await builder(name, input)(partner)).result).error, refusal, name);
  }
  // An owner gets all three, each needing its route's role and wearing its spec's undo words.
  const owner = as("owner").tc;
  const made = [];
  for (const [name, input] of ASKS) {
    const out = await buildProposal(owner, name, input);
    assert.equal(out.isError, false, `${name}: ${out.result}`);
    made.push([out.proposal.kind, out.proposal.needs, out.proposal.undo]);
  }
  assert.deepEqual(made, [
    ["person_mode", "owner", "Set it back"],
    ["settings", "partner", "Put the previous settings back"],
    ["person_merge", "owner", null],
  ]);
});

test("every card's role and undo words are its spec's: a wake's card offers no undo, a snooze's offers Wake (D8)", async () => {
  const t = tables({
    conversations: [
      conversation(C1),
      conversation(C2, { state: "snoozed", snooze_until: iso(NOW.getTime() + 86_400_000), assignee_user_id: USER }),
    ],
  });
  const tc = newToolContext(ctxFor(t), A, "operator", TZ, NOW);
  const card = async (verb, id) =>
    (await buildProposal(tc, "propose_thread_verb", { conversation_id: id, verb })).proposal;
  const cards = [
    await card("take_over", C1),
    await card("hand_back", C2),
    await card("snooze", C1),
    await card("wake", C2),
  ];
  assert.deepEqual(
    cards.map((p) => [p.payload.verb, p.needs, p.undo]),
    [
      ["take_over", "operator", "Hand back"],
      ["hand_back", "operator", "Take over again"],
      ["snooze", "operator", "Wake"],
      ["wake", "operator", null],
    ],
    "REGRESSION: a woken thread's card offered 'Snooze again', a snooze with no until that core always refused",
  );
});

test("REGRESSION: a broadcast to nobody is refused with the cause it has -- AI called a yes with no number to send to 'nobody has said yes', and pointed at a QR 'on this page'", async () => {
  const S_REG = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";
  const S_WALK = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2";
  const ANA = "cccccccc-cccc-4ccc-8ccc-cccccccccca1";
  const LUIS = "cccccccc-cccc-4ccc-8ccc-cccccccccca2";
  const day = 86_400_000;
  // As people_list returns them; proposeBroadcast maps them through toPersonRowVM, as the route's adapter does.
  const person = (over) => ({
    display_name: null,
    wa_profile_name: null,
    phone_e164: null,
    email: null,
    consent: "opted_in",
    consent_source: "desk",
    consent_updated_at: iso(NOW.getTime() - 20 * day),
    marketing_consent: null,
    marketing_consent_source: null,
    marketing_consent_updated_at: null,
    dnc: false,
    channels: ["whatsapp"],
    conversation_count: 1,
    escalation_count: 0,
    needs_human: false,
    open_escalation_reason: null,
    open_escalation_since: null,
    latest_conversation_id: null,
    latest_state: "open",
    latest_paused_until: null,
    latest_assignee_user_id: null,
    latest_snooze_until: null,
    latest_wa_inbound_at: null,
    last_message_at: iso(NOW.getTime() - 3 * day),
    last_message_direction: "inbound",
    last_message_sender: "client",
    last_inbound_text: "Thanks!",
    last_inbound_at: iso(NOW.getTime() - 3 * day),
    last_call_at: null,
    last_outbound_call_at: null,
    last_inbound_call_at: null,
    created_at: iso(NOW.getTime() - 40 * day),
    ...over,
  });
  const people = [
    // Wrote in by email and said yes to both there: an address, and no number.
    person({
      id: ANA,
      display_name: "Ana Reyes",
      email: "ana@example.com",
      channels: ["email"],
      consent_source: "customer_message",
      marketing_consent: "opted_in",
      marketing_consent_source: "customer_message",
      marketing_consent_updated_at: iso(NOW.getTime() - 20 * day),
    }),
    // A number, and a yes to messages only.
    person({ id: LUIS, display_name: "Luis Mora", phone_e164: "+15555550101" }),
  ];
  const t = tables({
    templates: [
      {
        id: TPL,
        tenant_id: A,
        channel: "whatsapp",
        name: "fall_offer",
        language: "en",
        meta_status: "approved",
        category: "MARKETING",
        variables: [],
        body_preview: "20% off this week.",
        hidden_at: null,
      },
    ],
    segments: [
      { id: S_REG, tenant_id: A, name: "Regulars" },
      { id: S_WALK, tenant_id: A, name: "Walk-ins" },
    ],
    // As the table holds them: every member row carries its workspace (00044), which the send reads every list by.
    segment_members: [
      { segment_id: S_REG, contact_id: ANA, tenant_id: A },
      { segment_id: S_REG, contact_id: LUIS, tenant_id: A },
      { segment_id: S_WALK, contact_id: LUIS, tenant_id: A },
    ],
  });
  const tc = newToolContext(ctxFor(t, { ...RPCS, people_list: () => people }), A, "owner", TZ, NOW);
  /** What the model is told when it proposes an offer to one of the lists: no card, and why. */
  const refusal = async (audience_id) => {
    const r = await buildProposal(tc, "propose_sequence", {
      action: "once",
      template_id: TPL,
      audience_kind: "saved",
      audience_id,
      params: [],
    });
    assert.deepEqual([r.proposal, r.isError], [null, true], r.result);
    return JSON.parse(r.result).error;
  };

  // Ana said yes to offers and has no number: the list is missing a number, not an answer -- People's words (#663).
  const regulars = await refusal(S_REG);
  assert.ok(regulars.includes(noNumberWords("“Regulars”", "marketing")), regulars);
  assert.ok(!regulars.includes("has said yes"), `REGRESSION: the model was told nobody had said yes: ${regulars}`);
  // Nobody on Walk-ins said yes to offers: the QR is where that is got, and it is in Sent -- Ask is no page.
  const walkIns = await refusal(S_WALK);
  assert.ok(walkIns.includes("Nobody there has said yes to offers."), walkIns);
  assert.ok(walkIns.includes("or ask with the QR in Sent."), walkIns);
  assert.ok(!walkIns.includes("on this page"), `REGRESSION: ${walkIns}`);
});

test("REGRESSION: campaigns.audiences tells who said yes from who can be sent it -- 'said_yes_to_offers' was the reach, so a yes with no number to send to read as nobody's yes", async () => {
  const S_REG = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";
  const S_WALK = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2";
  const people = threeAnswers();
  const t = tables({
    segments: [
      { id: S_REG, tenant_id: A, name: "Regulars" },
      { id: S_WALK, tenant_id: A, name: "Walk-ins" },
    ],
    segment_members: [
      [S_REG, ANA],
      [S_REG, LUIS],
      [S_WALK, LUIS],
      [S_WALK, ROSA],
    ].map(([segment_id, contact_id]) => ({ tenant_id: A, segment_id, contact_id })),
  });
  const tc = newToolContext(ctxFor(t, { ...RPCS, people_list: () => people }), A, "owner", TZ, NOW);
  const out = await runTool(tc, { name: "sequences", input: { action: "lists" } });
  assert.equal(out.isError, false, out.result);
  const read = JSON.parse(out.result);
  /** One audience's four counts: said yes to offers, can be sent one; said yes to messages, can be sent one. */
  const counts = (label) => {
    const a = read.audiences.find((x) => x.label === label);
    return a && [a.said_yes_to_offers, a.can_be_sent_offers, a.said_yes_to_messages, a.can_be_sent_messages];
  };
  // Ana's yes to offers is a yes: what Regulars lacks is a number to send it to (#663).
  assert.deepEqual(
    counts("Regulars"),
    [1, 0, 2, 1],
    "REGRESSION: Regulars read 'said_yes_to_offers: 0', and the model said nobody on it had said yes",
  );
  assert.deepEqual(counts("Walk-ins"), [1, 1, 2, 2], "where everyone who said yes has a number, the two are one");
  assert.deepEqual(counts(EVERYONE_LABEL), [2, 1, 3, 2]);
  // The note tells the model which count is the send, and why the other can be larger, in the product's one spelling.
  assert.ok(read.note.includes(NO_NUMBER_REACH), read.note);
  for (const name of ["said_yes_to_offers", "can_be_sent_offers", "said_yes_to_messages", "can_be_sent_messages"]) {
    assert.ok(read.note.includes(name), `the note names ${name}: ${read.note}`);
    assert.ok(
      READ_TOOLS.find((d) => d.name === "sequences").description.includes(name),
      `and so does the tool's description: ${name}`,
    );
  }
});

test("REGRESSION: campaigns.audiences counts everyone and every member, and names a calendar's lists only with a calendar -- it read the first thousand people with no appointments, and one select of members, so past a thousand it said less than the send enrols", async () => {
  const S_ALL = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3";
  const people = Array.from({ length: 1200 }, (_, i) =>
    peopleListRow({
      id: `dddddddd-dddd-4ddd-8ddd-${String(i).padStart(12, "0")}`,
      display_name: `Person ${i}`,
      phone_e164: `+1555${String(1000000 + i)}`,
    }),
  );
  const t = tables({
    segments: [{ id: S_ALL, tenant_id: A, name: "Everyone we know" }],
    segment_members: people.map((r) => ({ tenant_id: A, segment_id: S_ALL, contact_id: r.id })),
  });
  // people_list answers a page at a time, as the database does; a select answers at most max_rows.
  const pages = {
    ...RPCS,
    people_list: (args) => people.slice(args?.p_offset ?? 0, (args?.p_offset ?? 0) + (args?.p_limit ?? 1000)),
  };
  const ctx = { supabase: fakeDb(t, {}, pages, { maxRows: 1000 }), userId: USER, email: "ada@example.com", params: {} };
  const out = await runTool(newToolContext(ctx, A, "owner", TZ, NOW), {
    name: "sequences",
    input: { action: "lists" },
  });
  assert.equal(out.isError, false, out.result);
  const read = JSON.parse(out.result);
  const reach = (label) => read.audiences.find((x) => x.label === label)?.can_be_sent_messages;
  assert.equal(reach(EVERYONE_LABEL), 1200, "REGRESSION: the first thousand people");
  assert.equal(reach("Everyone we know"), 1200, "REGRESSION: the first thousand members");
  assert.deepEqual(
    read.audiences.filter((a) => ["booked_week", "booked", "asked_never_booked", "lapsed"].includes(a.audience_id)),
    [],
    "REGRESSION: with no calendar, the calendar's lists were offered, each counting nobody",
  );
});

test("the deal lists reach Ask once a deal is on file -- campaigns.audiences and people.search filtered People's lists on the calendar alone, so a salon was offered Proposal out and Clients, each counting nobody", async () => {
  const DEAL_LISTS = ["consultation_booked", "proposal_out", "clients", "deal_ended"];
  const ask = async (t) => {
    const tc = newToolContext(ctxFor(t, { ...RPCS, people_list: () => threeAnswers() }), A, "owner", TZ, NOW);
    const out = await runTool(tc, { name: "sequences", input: { action: "lists" } });
    assert.equal(out.isError, false, out.result);
    const ids = JSON.parse(out.result).audiences.map((a) => a.audience_id);
    const clients = await runTool(tc, { name: "people", input: { action: "search", query: "", list: "clients" } });
    return { named: DEAL_LISTS.filter((id) => ids.includes(id)), clients: JSON.parse(clients.result) };
  };
  // No deal on file: a salon. None of the four is named.
  const salon = await ask(tables());
  assert.deepEqual(salon.named, [], "REGRESSION: the deal lists were offered where no deal was ever recorded");
  assert.match(salon.clients.error, /once a deal is recorded here/, "and the narrowing says why, instead of nobody");
  assert.match(salon.clients.error, /start a proposal from anyone's page in People/, "and where one starts");
  assert.deepEqual(salon.clients.people, []);
  // A deal on file is what offers them (0008, amended 18 Oct 2026), whatever the retired answer said.
  const deal = {
    id: "dddddddd-dddd-4ddd-8ddd-ddddddddddd9",
    tenant_id: A,
    contact_id: ANA,
    service: "Ad management",
    stage: "proposed",
    proposed_at: iso(NOW.getTime() - 86_400_000),
    created_at: iso(NOW.getTime() - 86_400_000),
  };
  const booking = await ask(tables({ tenants: [{ id: A, name: "Harbor", timezone: TZ }], deals: [deal] }));
  // The three lists a deal on file makes. Consultation booked also needs a calendar and a consult-first service, and
  // this workspace has neither.
  assert.deepEqual(booking.named, ["proposal_out", "clients", "deal_ended"]);
  assert.equal(booking.clients.error, undefined, booking.clients.error);
  assert.deepEqual(booking.clients.people, [], "the list is offered; nobody is a client yet");
  // The retired answer alone, with no deal, offers none of them.
  const agency = await ask(tables({ tenants: [{ id: A, name: "Harbor", timezone: TZ, appointment_word: "meeting" }] }));
  assert.deepEqual(agency.named, []);
});

test("Ask reaches any list by its reference: a People list or one of the workspace's own, to search, to count and to propose, and one it can't count says why (decision 0009)", async () => {
  const S_REG = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";
  const S_CAL = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3";
  const S_BAD = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb4";
  const t = tables({
    segments: [
      { id: S_REG, tenant_id: A, name: "Regulars", rule: null },
      // A rule that reads the calendar, in a workspace with none connected: it can't be counted here.
      {
        id: S_CAL,
        tenant_id: A,
        name: "Lapsed regulars",
        rule: { all: [{ field: "last_visit", op: "more_than", days: 60 }] },
      },
      // A rule this version can't read.
      { id: S_BAD, tenant_id: A, name: "From the future", rule: { v: 3, all: [{ field: "future_fact" }] } },
    ],
    segment_members: [
      { segment_id: S_REG, contact_id: LUIS, tenant_id: A },
      { segment_id: S_REG, contact_id: ROSA, tenant_id: A },
    ],
  });
  const tc = newToolContext(ctxFor(t, { ...RPCS, people_list: () => threeAnswers() }), A, "owner", TZ, NOW);
  const run = async (name, input) => JSON.parse((await runTool(tc, { name, input })).result);

  // The audiences carry each list's token; one of the workspace's own that can't be counted says why, with no counts.
  const { audiences } = await run("sequences", { action: "lists" });
  const byLabel = Object.fromEntries(audiences.map((a) => [a.label, a]));
  assert.equal(byLabel.Regulars.list, `list:${S_REG}`);
  assert.equal(byLabel["Phoned only"].list, "seg:phoned_only");
  assert.match(byLabel["Lapsed regulars"].cannot_count, /reads a calendar link/);
  assert.equal(byLabel["Lapsed regulars"].can_be_sent_offers, undefined, "no count it can't stand behind");
  assert.match(byLabel["From the future"].cannot_count, /written by a newer version/);

  // Search by any list: its token, or a People list's bare id.
  const regulars = await run("people", { action: "search", query: "", list: `list:${S_REG}` });
  assert.deepEqual(regulars.people.map((p) => p.name).sort(), ["Luis Mora", "Rosa Diaz"]);
  assert.equal(regulars.list, `list:${S_REG}`);
  assert.deepEqual((await run("people", { action: "search", query: "", list: "seg:phoned_only" })).people, []);
  assert.match(
    (await run("people", { action: "search", query: "", list: `list:${S_CAL}` })).error,
    /Lapsed regulars: .*calendar/,
  );
  assert.match(
    (await run("people", { action: "search", query: "", list: "list:bbbbbbbb-bbbb-4bbb-8bbb-000000000000" })).error,
    /no such list/,
  );

  // Propose a broadcast to a saved list and to a People list alike; one it can't count is refused with why.
  const tpl = {
    id: TPL,
    tenant_id: A,
    channel: "whatsapp",
    name: "fall_offer",
    language: "en",
    meta_status: "approved",
    category: "MARKETING",
    variables: [],
    body_preview: "20% off this week.",
    hidden_at: null,
  };
  t.templates = [tpl];
  const propose = (audience_kind, audience_id) =>
    buildProposal(tc, "propose_sequence", {
      action: "once",
      template_id: TPL,
      audience_kind,
      audience_id,
      params: [],
    });
  const toRegulars = await propose("saved", S_REG);
  assert.equal(toRegulars.isError, false, toRegulars.result);
  assert.deepEqual([toRegulars.proposal.payload.audience_label, toRegulars.proposal.payload.count], ["Regulars", 1]);
  // A playbook on any list (00168): a saved list as a win-back, its list and class carried to the commit.
  const onRegulars = await buildProposal(tc, "propose_sequence", {
    action: "moment",
    trigger: "saved_list",
    list: `list:${S_REG}`,
    policy_class: "reengage",
    template_id: TPL,
    params: [],
  });
  assert.equal(onRegulars.isError, false, onRegulars.result);
  assert.deepEqual(
    [
      onRegulars.proposal.payload.list_id,
      onRegulars.proposal.payload.list_key,
      onRegulars.proposal.payload.policy_class,
    ],
    [S_REG, null, "reengage"],
  );
  assert.equal(onRegulars.proposal.payload.candidates, 1, "Rosa: on the list, a yes to offers and a number");
  const onMine = await buildProposal(tc, "propose_sequence", {
    action: "moment",
    trigger: "saved_list",
    list: "seg:waiting_on_you",
    template_id: TPL,
    params: [],
  });
  assert.equal(onMine.isError, true);
  assert.match(JSON.parse(onMine.result).error, /a campaign runs with no one looking/);
  const toCal = await propose("saved", S_CAL);
  assert.equal(toCal.isError, true);
  assert.match(JSON.parse(toCal.result).error, /can't be counted here: This list reads a calendar link/);
});

test("REGRESSION: a quiet rule says who it leaves out for want of a date -- asked to turn AI off for everyone who had not written in six months, AI said nobody, of 76 people never heard from (the operator stress run, 15 Oct 2026)", async () => {
  const DAY = 86_400_000;
  // Imported, or met at the desk: in People, with no message or call on record.
  const neverHeard = (id, name) =>
    peopleListRow({
      id,
      display_name: name,
      channels: [],
      conversation_count: 0,
      last_message_at: null,
      last_message_direction: null,
      last_message_sender: null,
      last_inbound_text: null,
      last_inbound_at: null,
    });
  const quiet = peopleListRow({
    id: LUIS,
    display_name: "Luis Mora",
    last_message_at: iso(NOW.getTime() - 200 * DAY),
    last_inbound_at: iso(NOW.getTime() - 200 * DAY),
  });
  const SIX_MONTHS = [{ field: "last_heard", op: "more_than", days: 180 }];
  // A query matches a name, as people_list matches it in SQL.
  const world = (people) =>
    newToolContext(
      ctxFor(tables(), {
        ...RPCS,
        people_list: (args) => people.filter((p) => !args?.p_query || p.display_name.includes(args.p_query)),
      }),
      A,
      "owner",
      TZ,
      NOW,
    );
  const search = async (tc, input) =>
    JSON.parse((await runTool(tc, { name: "people", input: { action: "search", ...input } })).result);

  const both = world([quiet, neverHeard(ANA, "Ana Reyes"), neverHeard(ROSA, "Rosa Diaz")]);
  const found = await search(both, { all: SIX_MONTHS });
  assert.deepEqual(
    [found.matches, found.people.map((p) => p.name), found.not_on_record],
    [1, ["Luis Mora"], [{ condition: "Never heard from", people: 2 }]],
    "the two never heard from are not quiet, and are named apart",
  );
  // A query narrows who is said apart to whom it matched.
  assert.deepEqual((await search(both, { all: SIX_MONTHS, query: "Ana" })).not_on_record, [
    { condition: "Never heard from", people: 1 },
  ]);
  // Everyone has written lately: nothing is said apart.
  const heard = await search(world([peopleListRow({ id: LUIS, display_name: "Luis Mora" })]), { all: SIX_MONTHS });
  assert.deepEqual([heard.matches, heard.not_on_record], [0, undefined]);

  // Nobody quiet, two never heard from: the selection of nobody says them, never that nobody is in People.
  const none = world([neverHeard(ANA, "Ana Reyes"), neverHeard(ROSA, "Rosa Diaz")]);
  assert.deepEqual((await search(none, { all: SIX_MONTHS })).not_on_record, [
    { condition: "Never heard from", people: 2 },
  ]);
  const off = await buildProposal(none, "propose_people", { action: "mode", mode: "never", all: SIX_MONTHS });
  assert.equal(off.isError, true);
  assert.match(
    JSON.parse(off.result).error,
    /^nobody is in that selection today, but 2 people meet the rest with no date for it \(Never heard from\): say them apart, never that nobody is in People/,
  );
  // Read as never, the condition holds them: the card the owner can be offered.
  const asked = await buildProposal(none, "propose_people", {
    action: "mode",
    mode: "never",
    all: [{ field: "last_heard", op: "never" }],
  });
  assert.equal(asked.isError, false, asked.result);
  assert.equal(asked.proposal.payload.count, 2);
  // The card says who, in People's chips: the local probe's card for the 76 read "who the conditions hold today".
  assert.equal(asked.proposal.summary, "Never · everyone matching “Never heard from”");
});

test("a gated list's refusal names the condition that failed: with a calendar and a deal on file but no consult-first service, Consultation booked is refused for the service alone", async () => {
  const { forgetFeeds } = await import(at("apps/dashboard/src/server/calendar/openings.ts"));
  const ICS = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//test//EN",
    "BEGIN:VEVENT",
    "UID:e1",
    "DTSTART:20260915T140000Z",
    "DTEND:20260915T150000Z",
    "SUMMARY:Consultation with Ana",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  const base = tables();
  const t = tables({
    tenants: [{ id: A, name: "Harbor", timezone: TZ, appointment_word: "meeting" }],
    tenant_config: [
      {
        ...base.tenant_config[0],
        config: { ...base.tenant_config[0].config, calendar: { ical_url: "https://calendar.example/harbor.ics" } },
      },
    ],
    deals: [
      {
        id: "dddddddd-dddd-4ddd-8ddd-ddddddddddd8",
        tenant_id: A,
        contact_id: ANA,
        service: "Ad management",
        stage: "won",
        proposed_at: iso(NOW.getTime() - 3 * 86_400_000),
        decided_at: iso(NOW.getTime() - 86_400_000),
        created_at: iso(NOW.getTime() - 3 * 86_400_000),
      },
    ],
  });
  const fetchWas = globalThis.fetch;
  globalThis.fetch = async () => new Response(ICS, { status: 200, headers: { "content-type": "text/calendar" } });
  try {
    forgetFeeds();
    const tc = newToolContext(ctxFor(t, { ...RPCS, people_list: () => threeAnswers() }), A, "owner", TZ, NOW);
    const listed = await runTool(tc, { name: "sequences", input: { action: "lists" } });
    assert.equal(listed.isError, false, listed.result);
    const ids = JSON.parse(listed.result).audiences.map((a) => a.audience_id);
    assert.ok(ids.includes("booked"), "the calendar was read: its lists are offered");
    assert.ok(
      ids.includes("clients") && !ids.includes("consultation_booked"),
      "deals are a thing; the consultation list needs the service",
    );
    const consult = JSON.parse(
      (await runTool(tc, { name: "people", input: { action: "search", query: "", list: "consultation_booked" } }))
        .result,
    );
    assert.match(consult.error, /lists a consult-first service under Settings › Hours & booking/, consult.error);
    assert.doesNotMatch(
      consult.error,
      /deal recorded|calendar connected/,
      "REGRESSION: the refusal named both conditions when only the service was missing",
    );
    assert.deepEqual(consult.people, []);
  } finally {
    globalThis.fetch = fetchWas;
    forgetFeeds();
  }
});

test("calendar.week reads the people it names: a person on the calendar enters the read set, so the answer may name them and open their profile (F5); and a visit the record keeps comes with its id, a row an answer may cite and open on its day (15 Oct 2026)", async () => {
  const { forgetFeeds } = await import(at("apps/dashboard/src/server/calendar/openings.ts"));
  const ICS = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//test//EN",
    "BEGIN:VEVENT",
    "UID:e2",
    "DTSTART:20260915T140000Z",
    "DTEND:20260915T150000Z",
    "SUMMARY:Estimate",
    "DESCRIPTION:Call +15555550101 first",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  const base = tables();
  // The row the hourly sync keeps for the event (00345, by its UID and start): its id is the visit's.
  const VISIT = "dddddddd-dddd-4ddd-8ddd-ddddddddddd1";
  const t = tables({
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
        source: "calendar_feed",
        external_id: "e2",
        status: "booked",
        starts_at: "2026-09-15T14:00:00.000Z",
        ends_at: "2026-09-15T15:00:00.000Z",
        vanished_at: null,
      },
    ],
  });
  const fetchWas = globalThis.fetch;
  globalThis.fetch = async () => new Response(ICS, { status: 200, headers: { "content-type": "text/calendar" } });
  try {
    forgetFeeds();
    const tc = newToolContext(ctxFor(t, { ...RPCS, people_list: () => threeAnswers() }), A, "owner", TZ, NOW);
    const out = await runTool(tc, { name: "calendar", input: { action: "week", day: "tomorrow" } });
    const [taken] = JSON.parse(out.result).days[0].taken;
    assert.equal(taken.visit_id, VISIT, "the visit's id, as the record keeps it");
    assert.deepEqual(
      [...tc.read.visit.values()].map((r) => [r.id, r.route]),
      [[VISIT, `calendar/2026-09-15:a-${VISIT}`]],
      "a row read, opened on its day with its sheet",
    );
    assert.equal(out.isError, false, out.result);
    assert.equal(
      JSON.parse(out.result).note,
      "Taken is the owner's own calendar; open is what AI would offer a caller.",
      "the note keeps the rows' facts; that nothing is booked from here is the tool's description now (PR 3.3)",
    );
    assert.ok(
      READ_TOOLS.find((d) => d.name === "calendar").description.includes("nothing is booked from here"),
      "the description says nothing is booked from here",
    );
    assert.deepEqual(
      JSON.parse(out.result).days[0].taken.map((b) => b.person && b.person.contact_id),
      [LUIS],
      "the event names Luis by his number",
    );
    assert.deepEqual(
      [...tc.read.person.values()].map((r) => [r.id, r.route]),
      [[LUIS, `clients/${LUIS}`]],
      "he is a row read, opened at his profile; nobody else is",
    );
  } finally {
    globalThis.fetch = fetchWas;
    forgetFeeds();
  }
});

test("calendar.week reads the board as its page reads it (ledger #11): with no day asked, the page's own week from its Monday, not today alone, or as many days from that Monday as were asked for; a day asked is that day, as before; the zone and the settings the turn already read are not read again; and nothing is written, even for an owner whose calendar names someone People does not hold", async () => {
  const { forgetFeeds } = await import(at("apps/dashboard/src/server/calendar/openings.ts"));
  const ICS = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//test//EN",
    "BEGIN:VEVENT",
    "UID:w1",
    "DTSTART:20260916T190000Z",
    "DTEND:20260916T200000Z",
    "SUMMARY:Estimate",
    "DESCRIPTION:Call +15555550199 first",
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
  // A Wednesday at 10:00 in New York: this week's Monday is two days back.
  const WEDNESDAY = new Date("2026-09-16T14:00:00Z");
  const fetchWas = globalThis.fetch;
  globalThis.fetch = async () => new Response(ICS, { status: 200, headers: { "content-type": "text/calendar" } });
  try {
    forgetFeeds();
    const made = [];
    const ctx = ctxFor(t, {
      ...RPCS,
      create_person: (a) => {
        made.push(a);
        return { contact_id: "p-new", existed: false };
      },
    });
    // The Ask route reads the workspace's facts, config and policies through the turn's readers first.
    const rc = readerContext(ctx, { tenantId: A, role: "owner" }, WEDNESDAY);
    await Promise.all(
      [workspaceReads.facts, workspaceReads.config, workspaceReads.policies].map((r) => load(rc, r, undefined)),
    );
    const before = ctx.supabase.seen.length;
    const tc = newToolContext(ctx, A, "owner", TZ, WEDNESDAY, rc);
    const week = await runTool(tc, { name: "calendar", input: { action: "week", day: "" } });
    assert.equal(week.isError, false, week.result);
    const read = JSON.parse(week.result);
    assert.deepEqual(
      read.days.map((d) => d.day),
      ["2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18", "2026-09-19", "2026-09-20"],
      "the week from its Monday, as the Calendar page opens",
    );
    assert.deepEqual(
      read.days.find((d) => d.day === "2026-09-16").taken.map((b) => [b.title, b.person]),
      [["Estimate", null]],
      "the appointment, naming nobody People holds",
    );
    const weekAsked = ctx.supabase.seen.slice(before).map((q) => (q.rpc ? `rpc:${q.rpc}` : `${q.table}.${q.op}`));
    assert.deepEqual(
      // Since 00345 the board's read holds the record too: the bookings that arrived by email over the span, the
      // notices' health line (two reads) and the workspace's mailbox, before everyone; and, once the feed has read,
      // the record's taken time over the days on offer, which a week alone does not cover. The record's reads are
      // asked together (9 Oct 2026, calendar/week/week.ts recordOverSpan), so they reach the database in no one order:
      // each, as often. The span's record is two reads since a member's word on a visit (00397, findVisitsOver): the
      // bookings whole, and the feed's rows by key; the season's record beside everyone is two more since 3 Nov 2026,
      // for when each person was last in (people-visits.ts getBoardVisits).
      [...weekAsked].sort(),
      [
        "appointments.select",
        "appointments.select",
        "appointment_notices.select",
        "appointment_notices.select",
        "mailboxes.select",
        "rpc:people_list",
        "policies.select",
        "appointments.select",
        "appointments.select",
        "appointments.select",
      ].sort(),
      "the record, everyone to match the appointments to, and nothing the turn already read: no tenants, no tenant_config",
    );
    assert.equal(weekAsked.at(-1), "appointments.select", "the taken time last, once the feed has read");
    assert.deepEqual(made, [], "nobody put in People: AI never writes");
    assert.ok(
      !ctx.supabase.seen.some(
        (q) => q.rpc === "create_person" || ["insert", "update", "upsert", "delete"].includes(q.op),
      ),
    );
    const threeDays = await runTool(tc, { name: "calendar", input: { action: "week", day: "", days: 3 } });
    assert.deepEqual(
      JSON.parse(threeDays.result).days.map((d) => d.day),
      ["2026-09-14", "2026-09-15", "2026-09-16"],
      "days without a day: that many from the page's Monday",
    );
    // A null on days is absent before the parse (PR 3.1, decision 1): the handler sees no days and gives the page's
    // week, where it once read the null as one day -- the one value the null-strip changed.
    const nullDays = await runTool(tc, { name: "calendar", input: { action: "week", day: "", days: null } });
    assert.equal(JSON.parse(nullDays.result).days.length, 7, "no days asked is the page's week");
    const tomorrow = await runTool(tc, { name: "calendar", input: { action: "week", day: "tomorrow" } });
    assert.deepEqual(
      JSON.parse(tomorrow.result).days.map((d) => d.day),
      ["2026-09-17"],
      "a day asked is that day",
    );
    assert.equal(
      ctx.supabase.seen.slice(before).filter((q) => q.table === "tenants" || q.table === "tenant_config").length,
      0,
      "the tenant and its settings are the turn's: read by the route before any tool, and never again",
    );
  } finally {
    globalThis.fetch = fetchWas;
    forgetFeeds();
  }
});

test("calendar.week leaves a cancelled visit out of what is taken, as Today and People do: a member's word on the record is what the board strikes (wiring/records-not-pages, 1.6)", async () => {
  const { forgetFeeds } = await import(at("apps/dashboard/src/server/calendar/openings.ts"));
  const event = (uid, start, end, summary) => [
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${summary}`,
    "END:VEVENT",
  ];
  const ICS = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//test//EN",
    ...event("w1", "20260916T190000Z", "20260916T200000Z", "Estimate"),
    ...event("w2", "20260916T203000Z", "20260916T213000Z", "Fitting"),
    ...event("w3", "20260916T150000Z", "20260916T160000Z", "Walk-through"),
    "END:VCALENDAR",
  ].join("\r\n");
  const row = (id, external_id, status, start, end) => ({
    id,
    tenant_id: A,
    source: "calendar_feed",
    external_id,
    status,
    starts_at: start,
    ends_at: end,
    vanished_at: null,
  });
  const base = tables();
  const t = tables({
    tenant_config: [
      {
        ...base.tenant_config[0],
        config: { ...base.tenant_config[0].config, calendar: { ical_url: "https://calendar.example/harbor.ics" } },
      },
    ],
    appointments: [
      row("ap-w1", "w1", "cancelled", "2026-09-16T19:00:00Z", "2026-09-16T20:00:00Z"),
      row("ap-w3", "w3", "missed", "2026-09-16T15:00:00Z", "2026-09-16T16:00:00Z"),
    ],
  });
  const WEDNESDAY = new Date("2026-09-16T14:00:00Z");
  const fetchWas = globalThis.fetch;
  globalThis.fetch = async () => new Response(ICS, { status: 200, headers: { "content-type": "text/calendar" } });
  try {
    forgetFeeds();
    const ctx = ctxFor(t, RPCS);
    const rc = readerContext(ctx, { tenantId: A, role: "owner" }, WEDNESDAY);
    await Promise.all(
      [workspaceReads.facts, workspaceReads.config, workspaceReads.policies].map((r) => load(rc, r, undefined)),
    );
    const tc = newToolContext(ctx, A, "owner", TZ, WEDNESDAY, rc);
    const week = await runTool(tc, { name: "calendar", input: { action: "week", day: "2026-09-16" } });
    assert.equal(week.isError, false, week.result);
    assert.deepEqual(
      JSON.parse(week.result).days[0].taken.map((b) => b.title),
      ["Walk-through", "Fitting"],
      "REGRESSION: the cancelled Estimate was listed as booked; a visit said missed is still on the day, as Today counts it",
    );
  } finally {
    globalThis.fetch = fetchWas;
    forgetFeeds();
  }
});

test("calendar.openings is the palette's own read (ledger #13): the service asked for is cut where the route cuts it, at 160, so a question that names the service past its eightieth character still reaches it; the zone and the settings the turn already read are not read again", async () => {
  const base = tables();
  const profile = {
    ...base.tenant_config[0].config.brain.profile,
    services: [{ name: "Moving estimate", duration_min: 60 }],
  };
  const t = tables({
    tenant_config: [
      {
        ...base.tenant_config[0],
        config: { ...base.tenant_config[0].config, brain: { ...base.tenant_config[0].config.brain, profile } },
      },
    ],
  });
  const asked =
    "Please look for any free time later this week, or else early next week if you can, for a moving estimate";
  assert.ok(asked.toLowerCase().indexOf("moving estimate") >= 80, "the service is named past the eightieth character");
  const ctx = ctxFor(t);
  // The Ask route reads the workspace's facts, config and policies through the turn's readers first.
  const rc = readerContext(ctx, { tenantId: A, role: "operator" }, NOW);
  await Promise.all(
    [workspaceReads.facts, workspaceReads.config, workspaceReads.policies].map((r) => load(rc, r, undefined)),
  );
  const before = ctx.supabase.seen.length;
  const tc = newToolContext(ctx, A, "operator", TZ, NOW, rc);
  const out = await runTool(tc, { name: "calendar", input: { action: "openings", day: "", service: asked } });
  assert.equal(out.isError, false, out.result);
  const read = JSON.parse(out.result);
  assert.equal(read.service, "Moving estimate", "cut at 80, the question named no service at all");
  assert.equal(read.state, "no_calendar");
  assert.deepEqual(
    ctx.supabase.seen.slice(before),
    [],
    "nothing read: the zone and the settings were the turn's, and no calendar is connected",
  );
});

test("report reads what the Reports page reads (ledger #1): the series, then the booking line and the deals beside it, once a turn, with the calendar's zone and settings taken from the turn; the booking line and the Deals section in the page's own words beside the numbers it gave before", async () => {
  const { forgetFeeds } = await import(at("apps/dashboard/src/server/calendar/openings.ts"));
  const DAY = 86_400_000;
  const CLIENT = "cccccccc-cccc-4ccc-8ccc-cccccccccc01";
  // The booking line and the deals count by the server's clock, as the page's own route does.
  const now = Date.now();
  const key = (ms) => new Date(ms).toISOString().slice(0, 10);
  const quiet = {
    messages_in: 0,
    conversations: 0,
    answered_ai: 0,
    answered_you: 0,
    unanswered: 0,
    out_ai: 0,
    out_you: 0,
    escalations: 0,
    calls: 0,
    call_seconds: 0,
    new_contacts: 0,
  };
  /** report_series for `days`: two periods of quiet days, the newest today. */
  const series = (days) => ({
    timezone: TZ,
    days,
    span_days: days * 2,
    today: key(now),
    series: Array.from({ length: days * 2 }, (_, i) => ({ day: key(now - (days * 2 - 1 - i) * DAY), ...quiet })),
    reasons: {},
    reply_seconds: [],
    sentiments: {},
    voicemail: 0,
  });
  const ics = (ms) =>
    new Date(ms)
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}/, "");
  // Rosa wrote yesterday and has a visit the day after tomorrow; she became a client, found as a lead, five days ago.
  const ICS = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//test//EN",
    "BEGIN:VEVENT",
    "UID:r1",
    `DTSTART:${ics(now + 2 * DAY)}`,
    `DTEND:${ics(now + 2 * DAY + 3_600_000)}`,
    "SUMMARY:Rosa · Estimate",
    "DESCRIPTION:+15555550100",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  const rosa = {
    id: CLIENT,
    display_name: "Rosa",
    wa_profile_name: null,
    phone_e164: "+15555550100",
    email: null,
    came_from: "lead",
    last_inbound_at: new Date(now - DAY).toISOString(),
  };
  const won = {
    id: "dddddddd-dddd-4ddd-8ddd-dddddddddd01",
    tenant_id: A,
    contact_id: CLIENT,
    stage: "won",
    proposed_at: new Date(now - 5 * DAY).toISOString(),
    decided_at: null,
    amount_cents: 250_000,
    per: "month",
    currency: "usd",
    lost_reason: null,
  };
  const base = tables();
  const world = (calendar) =>
    tables({
      tenants: [{ id: A, name: "Harbor", timezone: TZ, appointment_word: "meeting" }],
      tenant_config: [
        {
          ...base.tenant_config[0],
          config: {
            ...base.tenant_config[0].config,
            ...(calendar ? { calendar: { ical_url: "https://calendar.example/harbor.ics" } } : {}),
          },
        },
      ],
      deals: [won],
    });
  const rpcs = { ...RPCS, report_series: (a) => series(a.p_days), people_list: () => [rosa] };
  /** A turn over `t` with the Ask route's own reads made first, and report run in it: its answer and what it asked. */
  const turnOver = async (t) => {
    const ctx = ctxFor(t, rpcs);
    const rc = readerContext(ctx, { tenantId: A, role: "operator" }, NOW);
    await Promise.all(
      [workspaceReads.facts, workspaceReads.config, workspaceReads.policies].map((r) => load(rc, r, undefined)),
    );
    const before = ctx.supabase.seen.length;
    const out = await runTool(newToolContext(ctx, A, "operator", TZ, NOW, rc), {
      name: "report",
      input: { period: "7d" },
    });
    assert.equal(out.isError, false, out.result);
    const asked = ctx.supabase.seen.slice(before).map((q) => (q.rpc ? `rpc:${q.rpc}` : `${q.table}.${q.op}`));
    return { read: JSON.parse(out.result), asked, rc, ctx };
  };
  const fetchWas = globalThis.fetch;
  globalThis.fetch = async () => new Response(ICS, { status: 200, headers: { "content-type": "text/calendar" } });
  try {
    forgetFeeds();
    const { read, asked, rc, ctx } = await turnOver(world(true));
    // The series, the booking line and the deals are asked together (9 Oct 2026, readers/report.ts): each read, as
    // often, in no one order.
    assert.deepEqual(
      [...asked].sort(),
      [
        "rpc:report_series",
        // The Reviews lens's own read, beside it (7 Oct 2026, Reports phase C, lens 1): the ledger the database counts, and
        // Google as GET google reads it at once -- the listing, the connection, the newest reviews and the daily readings;
        // the Autonomy row for reviews is the turn's policies, read once below for every reader that asks.
        "rpc:reviews_ledger",
        "google_listings.select",
        "google_connections.select",
        "google_reviews.select",
        "google_listing_days.select",
        // Everyone, once, for the booking line and the deals alike, and for the People lens's book (10 Oct 2026, Reports
        // C3): which is counted against the channels the workspace can send on (the number's row and the texting line's),
        // the one read of them; this world's database has no people_series, which no read counts.
        "rpc:people_list",
        "tenant_channels.select",
        "lines.select",
        "policies.select",
        // And the Campaigns lens's ledger (11 Oct 2026, Reports C4): it reads the connected number's row once more, to say the
        // number's health (the reader's own read, readers/campaign-report.ts numberOf). This world's database has no
        // campaign_ledger or campaign_stuck, which no read counts.
        "tenant_channels.select",
        // The calendar's zone and settings for the booking line are the turn's: neither read again. The record over
        // the feed's season, joined to it (0002's readers): a booking's rows, and the feed's rows by key. The deals.
        "appointments.select",
        "appointments.select",
        "deals.select",
      ].sort(),
    );
    assert.equal(
      asked.filter((x) => x === "tenants.select" || x === "tenant_config.select").length,
      0,
      "the tenant and its settings: the turn's, never read again",
    );
    // The page's own builders over the page's own payload, as the bridge applies them; the same read, once a turn.
    const page = (await load(rc, reportReader, { days: 7, end: null })).data;
    assert.equal(ctx.supabase.seen.filter((q) => q.rpc === "report_series").length, 1, "read once a turn");
    const vm = toReportVM(page.report);
    const booking = toBookingReportVM(page.booking);
    const deals = toDealReportVM(page.deals, vm.period.within);
    assert.equal(read.range, vm.rangeLabel);
    assert.deepEqual(
      read.tiles,
      vm.tiles.map((x) => ({ label: x.label, value: x.value, meta: x.meta, change: x.delta?.text ?? null })),
      "the numbers it gave before, from the same builder",
    );
    assert.equal(read.booking, booking.headline);
    assert.equal(read.booking, "1 of 1 booked", "Rosa wrote, and has a visit on the calendar");
    assert.deepEqual(read.deals, {
      headline: deals.headline,
      outcomes: deals.outcomes.rows.map((o) => `${o.label}: ${o.value}`),
      lines: deals.lines.map((l) => l.text),
      stock: deals.stock,
    });
    assert.equal(read.deals.stock, "1 client now · $2,500 a month.");
    assert.ok(read.deals.lines.includes("Your new client came from Leads."), read.deals.lines.join(" | "));
  } finally {
    globalThis.fetch = fetchWas;
    forgetFeeds();
  }
  // No calendar: the line says why there is nothing to count, in the page's words.
  const bare = await turnOver(world(false));
  assert.equal(bare.read.booking, "Add a calendar link under Settings › Hours & booking to see who booked.");
  // Every workspace has deals (0008, amended 18 Oct 2026): the Deals section is drawn without a calendar too.
  assert.equal(bare.read.deals.stock, "1 client now · $2,500 a month.");
});
