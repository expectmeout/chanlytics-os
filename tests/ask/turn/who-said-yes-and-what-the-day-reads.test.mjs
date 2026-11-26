/**
 * Who said yes apart from who a run reaches, on a US WhatsApp number too; the answers fit their format; the day read
 * once a turn as Today, the Inbox and calls read it; a person's page read in one round; the rules and notes AI says it
 * follows are the composer's.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  emptyReadSet,
  normalizeAnswer,
  EVERYONE_LABEL,
  NO_NUMBER_REACH,
  PLAYBOOK_CARD_REFUSALS,
  noChannelWords,
  toPersonVM,
} from "@chanlytics/contracts";
import { ASK_ANSWER_FORMAT } from "../../../apps/dashboard/src/server/ask/answer-format.ts";
import {
  A,
  ACT_TOOLS,
  ASK_EXAMPLES,
  ASK_RULES,
  C1,
  C2,
  E1,
  K1,
  K2,
  M1,
  M2,
  METRICS,
  NOW,
  P1,
  READ_TOOLS,
  ROUND,
  RPCS,
  TPL,
  TZ,
  USER,
  answer,
  askPorts,
  at,
  buildProposal,
  call,
  contact,
  conversation,
  ctxFor,
  fromRecord,
  iso,
  load,
  logged,
  message,
  newToolContext,
  personRoute,
  ports,
  readerContext,
  runAskTurn,
  runRound,
  runTool,
  scripted,
  stableSystem,
  tables,
  threeAnswers,
  tool,
  turn,
  usNumberWorld,
  workspaceFacts,
  workspaceReads,
} from "./_turn.mjs";

test("REGRESSION: campaigns.playbooks tells who said yes from who a run can reach -- 'said_yes_now' was the reach, so a moment whose yes had no number read as nobody's", async () => {
  const tc = newToolContext(ctxFor(tables(), { ...RPCS, people_list: () => threeAnswers() }), A, "owner", TZ, NOW);
  const out = await runTool(tc, { name: "campaigns", input: { action: "moments" } });
  assert.equal(out.isError, false, out.result);
  const read = JSON.parse(out.result);
  assert.ok(
    read.note.startsWith("A run is a send, and ") && !read.note.includes("say so"),
    "the note keeps the rows' facts; what to say of a zero, and that nothing ran, are the description's now (PR 3.3)",
  );
  assert.ok(
    READ_TOOLS.find((d) => d.name === "campaigns").description.includes("nothing has run because it was read"),
    "the description says nothing ran because it was read",
  );
  /** One trigger's two counts: who its moment names that said the yes it needs, and who of them a run can reach. */
  const counts = (id) => {
    const x = read.triggers.find((y) => y.trigger === id);
    return x && [x.said_yes_now, x.can_be_sent_now];
  };
  // The month's offer names everyone: Ana and Rosa said yes to offers, and only Rosa has a number to send one to.
  assert.deepEqual(
    counts("everyone_monthly"),
    [2, 1],
    "REGRESSION: it read 'said_yes_now: 1', and Ana's yes was nobody's",
  );
  // The visit reminder names tomorrow's visits, and there is no calendar here: since 9 Oct 2026 (D44) it is not offered
  // at all, so the read leaves it out, rather than saying nobody either way.
  assert.equal(
    read.triggers.some((y) => y.trigger === "visit_tomorrow"),
    false,
    "no calendar: the appointment reminder is not among the triggers",
  );
  assert.ok(read.note.includes(NO_NUMBER_REACH), read.note);
  for (const name of ["said_yes_now", "can_be_sent_now"]) {
    assert.ok(read.note.includes(name), `the note names ${name}: ${read.note}`);
    assert.ok(
      READ_TOOLS.find((d) => d.name === "campaigns").description.includes(name),
      `and so does the tool's description: ${name}`,
    );
  }
});

test("REGRESSION: a proposed playbook says who said yes apart from who a run reaches -- '0 on the list said yes now' about a list whose yes had no number; one that reaches nobody is no card, and says what they lack", async () => {
  const t = tables({
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
    ],
  });
  /** What the act answers for these people: the card, or why there is none. */
  const proposed = async (people) => {
    const tc = newToolContext(ctxFor(t, { ...RPCS, people_list: () => people }), A, "owner", TZ, NOW);
    return buildProposal(tc, "propose_campaign", {
      action: "moment",
      trigger: "everyone_monthly",
      template_id: TPL,
      params: [],
    });
  };
  /** The card's summary, the words the owner approves it from and the model reads back. */
  const summary = async (people) => {
    const r = await proposed(people);
    assert.equal(r.isError, false, r.result);
    return r.proposal.summary;
  };
  // Ana said yes to offers and has no number; Luis has one and said yes to messages only: nobody can be sent a run, so no
  // card (the 30 Oct 2026 review, item 6), and the model hears that Ana's yes has no number to go to, never "0 said yes".
  const [ana, luis] = threeAnswers();
  const noNumber = await proposed([ana, luis]);
  assert.equal(noNumber.isError, true, `REGRESSION: a card that reaches nobody was made: ${noNumber.result}`);
  assert.equal(
    JSON.parse(noNumber.result).error,
    PLAYBOOK_CARD_REFUSALS.reachesNobody("1 person said yes to offers, and has no number to send to.", null),
  );
  // Where a run reaches somebody, the count is who it reaches, as People and the send screen say it.
  const reaches = await summary(threeAnswers());
  assert.ok(reaches.includes(" · 1 person on the list said yes to offers · "), reaches);
});

test("REGRESSION: on a US WhatsApp number the lists read says 26 said yes to offers and none can be sent one, and what is missing -- it read 'said_yes_to_offers: 0', and AI told the owner nobody had said yes", async () => {
  const tc = usNumberWorld();
  const out = await runTool(tc, { name: "campaigns", input: { action: "lists" } });
  assert.equal(out.isError, false, out.result);
  const read = JSON.parse(out.result);
  const everyone = read.audiences.find((x) => x.label === EVERYONE_LABEL);
  assert.deepEqual(
    [
      everyone.said_yes_to_offers,
      everyone.can_be_sent_offers,
      everyone.said_yes_to_messages,
      everyone.can_be_sent_messages,
    ],
    [26, 0, 26, 26],
    "REGRESSION: a yes counted only where a channel could carry it, so Meta's pause read as nobody's yes",
  );
  // What they lack is a channel, never a yes and never a number: People's own words, and the Broadcasts page's sentence
  // naming each channel.
  assert.equal(everyone.why_none_offers, noChannelWords(`“${EVERYONE_LABEL}”`, "marketing"));
  assert.ok(!("why_none_messages" in everyone), "a message reaches all 26: nothing is missing");
  assert.match(read.offers_go_by, /WhatsApp is not delivering offers to US numbers for now/);
  // One fact, one count: the winners read counts the same yes.
  const winners = await runTool(tc, { name: "people", input: { action: "winners" } });
  assert.equal(winners.isError, false, winners.result);
  assert.equal(JSON.parse(winners.result).groups.said_yes_to_offers, 26);
});

test("REGRESSION: on a US WhatsApp number the moments read says 26 said yes to the month's offer and a run reaches none -- it read 'said_yes_now: 0', the Playbooks page's chip, which offered the owner a yes they had", async () => {
  const out = await runTool(usNumberWorld(), { name: "campaigns", input: { action: "moments" } });
  assert.equal(out.isError, false, out.result);
  const monthly = JSON.parse(out.result).triggers.find((x) => x.trigger === "everyone_monthly");
  assert.deepEqual(
    [monthly.said_yes_now, monthly.can_be_sent_now],
    [26, 0],
    "REGRESSION: the pause read as nobody's yes",
  );
});

test("REGRESSION: on a US WhatsApp number a proposed playbook says 26 said yes and names the channel that holds them -- it said '0 people on the list said yes to offers'; reaching nobody, it is no card", async () => {
  const r = await buildProposal(usNumberWorld(), "propose_campaign", {
    action: "moment",
    trigger: "everyone_monthly",
    template_id: TPL,
    params: [],
  });
  // WhatsApp alone, and Meta holds every offer on it: no card (the 30 Oct 2026 review, item 6). The model hears the 26 and
  // Meta's pause, and no page to fix it on, since it is Meta's rule and no setting of the workspace's.
  assert.equal(r.isError, true, `REGRESSION: a card that reaches nobody was made: ${r.result}`);
  const said = JSON.parse(r.result).error;
  assert.ok(!said.includes("0 people"), `REGRESSION: ${said}`);
  assert.equal(
    said,
    PLAYBOOK_CARD_REFUSALS.reachesNobody(
      "26 people said yes to offers, but none can be reached now. WhatsApp is not delivering offers to US numbers for now. Reminders, confirmations and replies still go.",
      null,
    ),
  );
});

test("what the model reads before any send tells nobody's yes from a yes with no number to send to: since PR 3.3 the rule is the lists read's and propose_campaign's descriptions (once campaigns.audiences' and propose_campaign.broadcast's), and no rule of the prompt's", () => {
  assert.ok(!ASK_RULES.some((r) => r.includes("never propose a send to nobody")), "out of the rules");
  const audiences = READ_TOOLS.find((d) => d.name === "campaigns").description;
  assert.ok(audiences.includes(NO_NUMBER_REACH), audiences);
  assert.ok(audiences.includes("read before any send"), audiences);
  const broadcast = ACT_TOOLS.find((d) => d.name === "propose_campaign").description;
  assert.ok(broadcast.includes("action lists for who can be sent"), broadcast);
  assert.ok(broadcast.includes("or the ones who did have no number to send to"), broadcast);
  assert.ok(broadcast.includes("never propose a send to nobody"), broadcast);
});

test("the answers the model is shown fit the format key for key, ride in the cached block, and the count's breakdown adds up", () => {
  const fits = (s, v, path) => {
    if (s.enum) return assert.ok(s.enum.includes(v), `${path}: ${v}`);
    if (s.type === "array") return v.forEach((x, i) => fits(s.items, x, `${path}[${i}]`));
    if (s.type !== "object") return assert.equal(typeof v, s.type, path);
    assert.deepEqual(Object.keys(v).sort(), Object.keys(s.properties).sort(), path);
    for (const k of Object.keys(s.properties)) fits(s.properties[k], v[k], `${path}.${k}`);
  };
  const system = stableSystem(workspaceFacts("Harbor", TZ, null, NOW, []));
  for (const [question, example] of ASK_EXAMPLES) {
    fits(ASK_ANSWER_FORMAT, example, question);
    assert.ok(system.includes(JSON.stringify(example)), `${question} is in the cached block`);
  }
  const week = normalizeAnswer(JSON.stringify(ASK_EXAMPLES[0][1]), emptyReadSet(), "en");
  assert.equal(week.ok && week.answer.show.breakdown?.total, 16, "7 + 3 + 6 is 16, so it draws");
  assert.ok(
    !ASK_RULES.some((r) => /\bfinish\b|navigate|citation/.test(r)),
    "no rule names what the answer no longer has",
  );
});

test("the real ports are the real modules, and an override reaches only the field it names", async () => {
  const real = askPorts();
  assert.deepEqual(Object.keys(real).sort(), ["context", "propose", "round", "shape", "tool"]);
  assert.equal(real.tool, runTool);
  assert.equal(real.propose, buildProposal);
  assert.equal(real.round, runRound);
});

test("REGRESSION: a call on Today opens where the Today page opens it -- today said conversations/<id> where the call is conversations/cv-<id>", async () => {
  // A caller gone in six seconds with nothing: the simplest call worth an ear (contracts today.ts, abandonedCall).
  const quick = call(K2, {
    retell_call_id: "r2",
    started_at: iso(NOW.getTime() - 3600_000),
    ended_at: iso(NOW.getTime() - 3594_000),
    duration_ms: 6_000,
    summary: null,
  });
  const ctx = ctxFor(tables({ calls: [quick] }), { ...RPCS, metrics_summary: () => METRICS });
  const out = await runTool(newToolContext(ctx, A, "operator", TZ, NOW), { name: "today", input: {} });
  assert.equal(out.isError, false, out.result);
  const [row] = JSON.parse(out.result).calls.rows;
  assert.deepEqual(
    [row.call_id, row.route],
    [K2, `conversations/cv-${K2}`],
    "the call's own id, and the route calls.list and calls.get give it",
  );
  const listed = JSON.parse(
    (
      await runTool(newToolContext(ctx, A, "operator", TZ, NOW), {
        name: "calls",
        input: { action: "list", filter: "today" },
      })
    ).result,
  );
  assert.equal(listed.calls.find((c) => c.call_id === K2)?.route, row.route, "one route for one call, whichever tool");
});

test("REGRESSION: Today's reply-window rows are the opposite of drafts -- the customer spoke last and nobody has written back", async () => {
  // The field was `drafts_about_to_send`. The prompt's glossary tells the model
  // a held draft "sends itself when the window ends", so under that name the
  // assistant reported a customer being IGNORED as a reply already on its way
  // out, and the owner's correct action was the opposite of the implied one.
  const closing = conversation(C2, {
    last_inbound_on_whatsapp: iso(NOW.getTime() - 22 * 3600_000),
    last_message_at: iso(NOW.getTime() - 22 * 3600_000),
  });
  const theirs = message(M2, C2, {
    sender: "customer", // the schema's word; 'client' is not one
    body: "Can you fit me in Saturday?",
    created_at: iso(NOW.getTime() - 22 * 3600_000),
    channel_ts: iso(NOW.getTime() - 22 * 3600_000),
  });
  const ctx = ctxFor(tables({ conversations: [closing], messages: [theirs] }), {
    ...RPCS,
    metrics_summary: () => METRICS,
  });
  const tc = newToolContext(ctx, A, "operator", TZ, NOW);
  const out = await runTool(tc, { name: "today", input: {} });
  assert.equal(out.isError, false, out.result);
  const today = JSON.parse(out.result);

  assert.ok(!("drafts_about_to_send" in today), "no field on Today claims to carry drafts");
  assert.doesNotMatch(
    out.result,
    /draft/i,
    "a Today read holds no draft of any kind: the snapshot's held_drafts and inbox.list filter=held do",
  );

  assert.match(
    today.reply_window_closing.note,
    /24 hours/,
    "the rule is the contracts' own hint, not a second spelling",
  );
  assert.deepEqual(
    today.reply_window_closing.rows.map((r) => [r.conversation_id, r.route]),
    [[C2, `inbox/th-${C2}`]],
    "the row names the thread and where it opens",
  );
  assert.match(today.reply_window_closing.rows[0].text, /reply by \d/);
  assert.ok(tc.read.thread.has(C2), "a row this read returned may be cited and navigated to");

  // inbox.list: the count is of everything that matched, not of what the cap kept, and every row names its wire.
  const listed = JSON.parse((await runTool(tc, { name: "inbox", input: { action: "list", filter: "recent" } })).result);
  assert.equal(listed.total_matching, listed.threads.length);
  assert.ok(
    listed.threads.every((th) => typeof th.channel === "string" && th.channel.length > 0 && !("tags" in th)),
    "a wire on every row; no field that never carried anything",
  );
});

test("the day is read once a turn, each tool as its page reads it: today, inbox.list and calls.list in one round read the conversations twice at most and the calls once; Today counts the customer waiting past the newest hundred as the Today page does, the Inbox fetches their thread and needs_you keeps it first past the cap, recent is the newest twenty, and the missed call past the newest forty is there", async () => {
  // A hundred threads newer than the one still waiting on a person: the Inbox fetches that one by its id (ledger #6),
  // the Today page does not. Twenty-one of the hundred wait on a person too, so needs_you runs past the cap of twenty.
  // And forty-five calls this morning whose oldest never connected (ledger #8: calls.list read the newest forty).
  const hundred = Array.from({ length: 100 }, (_, i) =>
    conversation(`cccccccc-cccc-4ccc-8ccc-${String(i).padStart(12, "0")}`, {
      last_message_at: iso(NOW.getTime() - (i + 1) * 60_000),
    }),
  );
  const waiting = conversation(C2, {
    last_message_at: iso(NOW.getTime() - 48 * 3600_000),
    contacts: { ...contact, display_name: "Quinn" },
  });
  const morning = Array.from({ length: 45 }, (_, i) =>
    call(`dddddddd-dddd-4ddd-8ddd-${String(i).padStart(12, "0")}`, {
      retell_call_id: `r-${i}`,
      started_at: iso(NOW.getTime() - (i + 1) * 60_000),
      ...(i === 44 ? { status: "not_connected", duration_ms: null } : {}),
    }),
  );
  const escalation = (id, conversation_id, created_at) => ({
    id,
    tenant_id: A,
    conversation_id,
    reason: "human_token",
    details: "asked for a person",
    state: "open",
    created_at,
  });
  const escalations = [
    // The quiet thread's, the oldest: an hour ago. The twenty-one inside the hundred asked in the last half hour.
    escalation(E1, C2, iso(NOW.getTime() - 3600_000)),
    ...hundred
      .slice(0, 21)
      .map((c, i) =>
        escalation(
          `eeeeeeee-eeee-4eee-8eee-${String(100 + i).padStart(12, "0")}`,
          c.id,
          iso(NOW.getTime() - (i + 1) * 60_000),
        ),
      ),
  ];
  const ctx = ctxFor(tables({ conversations: [...hundred, waiting], escalations, calls: morning }), {
    ...RPCS,
    metrics_summary: () => METRICS,
  });
  const s = scripted([
    ROUND([
      tool("today", {}),
      tool("inbox", { action: "list", filter: "needs_you" }),
      tool("inbox", { action: "list", filter: "recent" }, "t-recent"),
      tool("calls", { action: "list", filter: "missed" }),
    ]),
    ROUND([answer("Twenty-two people are waiting on you, and one call never connected.")]),
  ]);
  const { input } = turn(ctx);
  const r = await runAskTurn(input, ports(s.round));
  assert.equal(r.failed, false, r.failure ?? "");
  const selects = (table) => ctx.supabase.seen.filter((q) => q.table === table && q.op === "select").length;
  assert.deepEqual(
    ["conversations", "calls", "escalations", "tenants"].map(selects),
    [2, 1, 4, 0],
    "the newest hundred once, shared; the escalated one past it once, shared by Today and the Inbox; the calls once and the escalations once (in their two halves: readers/escalations.ts), and each conversations read's newest closed holds beside it (db listLastClosedHolds, #1660: a thread handed back unanswered still waits); and no tenant: the zone is the turn's",
  );
  const out = Object.fromEntries(
    s.requests[1].messages.at(-1).content.map((c) => [c.tool_use_id, fromRecord(c.content)]),
  );
  const [longest] = out["t-today"].needs_you.rows;
  assert.equal(longest.route, `inbox/th-${longest.conversation_id}`, "a Today row says where it opens");
  assert.deepEqual(
    [out["t-today"].needs_you.count, longest.conversation_id, longest.who],
    [22, C2, "Quinn"],
    "Today counts the customer waiting past the newest hundred as the Today page does, and reads their thread by its id, so it names them (the wiring's second audit, S7-7): the longest wait, first",
  );
  const needs = out["t-inbox.list"];
  const [first] = needs.threads;
  assert.deepEqual(
    [needs.total_matching, needs.threads.length, first.conversation_id, first.who, first.state],
    [22, 20, C2, "Quinn", "needs you"],
    "the Inbox fetches the escalated thread past the newest hundred, and needs_you keeps it first, as the page does: the cap of twenty never drops it",
  );
  assert.deepEqual(
    needs.threads.slice(1).map((x) => x.conversation_id),
    hundred.slice(0, 19).map((c) => c.id),
    "then the hundred's own, in the Inbox's order",
  );
  assert.deepEqual(
    [out["t-recent"].total_matching, out["t-recent"].threads.map((x) => x.conversation_id)],
    [101, hundred.slice(0, 20).map((c) => c.id)],
    "recent is the newest twenty: the old escalated thread the Inbox's rows put first is not one of them",
  );
  assert.deepEqual(
    out["t-calls.list"].calls.map((x) => [x.call_id, x.outcome]),
    [[morning[44].id, "missed"]],
    "the forty-fifth call is read, as the Calls page reads a hundred",
  );
});

test("inbox.conversation and calls.get read through the readers (ledger #5): the thread as its page reads it, its messages with their wire and their attachment, so a text thread's window is the text's rule and it says Text, and an email thread says Email; the open escalation is the one the Inbox shows, the oldest; the row once and the messages once in the turn; the call under the workspace's own filter; another workspace's thread or call is an error, never a row", async () => {
  const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const C3 = "cccccccc-cccc-4ccc-8ccc-ccccccccccc3";
  const C4 = "cccccccc-cccc-4ccc-8ccc-ccccccccccc4";
  const C5 = "cccccccc-cccc-4ccc-8ccc-ccccccccccc5";
  const K3 = "cccccccc-cccc-4ccc-8ccc-ccccccccccc7";
  const M3 = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee3";
  const M4 = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee4";
  const M6 = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee6";
  const M9 = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee9";
  const NEWER = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee7";
  const OLDER = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee8";
  const H = 3600_000;
  const earlier = (ms) => iso(NOW.getTime() - ms);
  // A text thread whose WhatsApp window, read from its WhatsApp clock, closed a day ago: a text has no window.
  const texting = conversation(C2, { last_inbound_on_whatsapp: earlier(48 * H), last_message_at: earlier(46 * H) });
  const texted = [
    message(M2, C2, {
      sender: "customer",
      channel: "sms",
      body: "Can I come at five?",
      created_at: earlier(47 * H),
      channel_ts: earlier(47 * H),
    }),
    message(M3, C2, {
      sender: "customer",
      channel: "sms",
      type: "media",
      body: null,
      media: {
        mime_type: "image/jpeg",
        fetch_state: "stored",
        caption: "this one",
        filename: null,
        storage_path: "t/c/m.jpg",
      },
      created_at: earlier(46 * H),
      channel_ts: earlier(46 * H),
    }),
  ];
  const escalation = (id, reason, ago) => ({
    id,
    tenant_id: A,
    conversation_id: C2,
    reason,
    details: null,
    state: "open",
    created_at: earlier(ago),
  });
  const t = tables({
    conversations: [
      conversation(C1),
      texting,
      conversation(C3, { last_inbound_on_whatsapp: null }),
      conversation(C4, { tenant_id: B }),
      conversation(C5, {
        last_inbound_on_whatsapp: null,
        contacts: { ...contact, display_name: null, phone_e164: null, email: "rosa@example.com" },
      }),
    ],
    messages: [
      message(M1, C1),
      ...texted,
      message(M4, C3, { sender: "customer", channel: "email", body: "Hello" }),
      message(M6, C4, { tenant_id: B }),
      message(M9, C5, { sender: "customer", channel: "email", body: "Is Saturday free?" }),
    ],
    escalations: [escalation(NEWER, "manual", H), escalation(OLDER, "human_token", 40 * H)],
    calls: [call(K1), call(K3, { tenant_id: B, retell_call_id: "r3" })],
  });

  const ctx = ctxFor(t);
  const s = scripted([
    ROUND([
      tool("inbox", { action: "conversation", conversation_id: C2 }, "t-text"),
      tool("calls", { action: "get", call_id: K1 }, "t-call"),
    ]),
    ROUND([answer("Rosa texted a photo, and the text can be answered now.")]),
  ]);
  // Asked on People, where nothing is read ahead: the reads counted below are the two tools' own.
  const { input } = turn(ctx, { surface: "people" });
  const r = await runAskTurn(input, ports(s.round));
  assert.equal(r.failed, false, r.failure ?? "");
  const selects = (table) => ctx.supabase.seen.filter((q) => q.table === table && q.op === "select");
  assert.deepEqual(
    ["conversations", "messages", "escalations", "calls"].map((x) => selects(x).length),
    [1, 1, 2, 1],
    "the thread's row once, through the loader the page's scope uses; its messages once; the open escalations once (in their two halves: escalations.ts); the call once",
  );
  assert.deepEqual(
    selects("calls")[0].filters,
    [
      ["eq", "tenant_id", A],
      ["eq", "id", K1],
    ],
    "the call under the workspace's own filter",
  );
  const out = Object.fromEntries(
    s.requests[1].messages.at(-1).content.map((c) => [c.tool_use_id, fromRecord(c.content)]),
  );
  const text = out["t-text"];
  assert.deepEqual(
    [text.channel, text.window_open],
    ["Text", true],
    "the messages carry their wire: a text has no window, where WhatsApp's rule read this thread closed and named it WhatsApp",
  );
  assert.deepEqual(
    text.messages.map((m) => [m.from, m.text]),
    [
      ["customer", "Can I come at five?"],
      ["customer", "Photo: this one"],
    ],
    "and their attachment: a photo with its caption, where it read as an unnamed attachment",
  );
  assert.deepEqual(
    text.escalation,
    { id: OLDER, reason: "Customer asked for a person", details: null },
    "the open escalation the Inbox shows on the thread, the oldest, where it read the newest",
  );
  assert.deepEqual([out["t-call"].call_id, out["t-call"].who], [K1, "Rosa"]);

  const tc = newToolContext(ctxFor(t), A, "operator", TZ, NOW);
  const email = JSON.parse(
    (await runTool(tc, { name: "inbox", input: { action: "conversation", conversation_id: C3 } })).result,
  );
  assert.deepEqual(
    [email.channel, email.window_open],
    ["Email", true],
    "an email thread says Email, and an email may be answered whenever",
  );
  // A person reached only by email is their address, as the Inbox row names them and as this tool always said: the
  // thread's own payload carries no email, and its view model alone would say "Unknown".
  const byAddress = JSON.parse(
    (await runTool(tc, { name: "inbox", input: { action: "conversation", conversation_id: C5 } })).result,
  );
  const inTheInbox = JSON.parse(
    (await runTool(tc, { name: "inbox", input: { action: "list", filter: "recent" } })).result,
  );
  assert.deepEqual(
    [byAddress.who, inTheInbox.threads.find((x) => x.conversation_id === C5).who],
    ["rosa@example.com", "rosa@example.com"],
  );

  // Another workspace's thread and call, which RLS would show a member of both: not here, in the tools' own words, and
  // not a read that failed.
  const elsewhere = ctxFor(t);
  const away = newToolContext(elsewhere, A, "operator", TZ, NOW);
  const { result: refused, lines } = await logged("ask_tool_failed", async () => [
    await runTool(away, { name: "inbox", input: { action: "conversation", conversation_id: C4 } }),
    await runTool(away, { name: "calls", input: { action: "get", call_id: K3 } }),
  ]);
  assert.deepEqual(
    refused.map((x) => [x.isError, JSON.parse(x.result)]),
    [
      [true, { error: "no such conversation in this workspace" }],
      [true, { error: "no such call in this workspace" }],
    ],
  );
  assert.deepEqual(lines, [], "a row that is not here is not a failed read");
  assert.equal(elsewhere.supabase.seen.filter((q) => q.table === "messages").length, 0, "none of its messages is read");
  assert.ok(
    !away.read.thread.has(C4) && !away.read.conversation.has(C4) && !away.read.call.has(K3),
    "nothing of another workspace enters the read set",
  );
});

test("inbox.conversation says nothing of reasoning beside a customer's words, though their message carries an intent since 00305: a reply of AI's keeps its why", async () => {
  const brain = {
    intent: "pricing",
    confidence: 0.62,
    reason: "asked a price",
    facts_used: [],
    language: "en",
    model: "m",
  };
  const t = tables({
    messages: [
      message(M1, C1, {
        direction: "inbound",
        sender: "customer",
        body: "How much is a refill?",
        meta: { raw_type: "text", processed_at: iso(NOW.getTime() - 3590_000), handled: "ai", intent: "pricing" },
      }),
      message(M2, C1, {
        direction: "outbound",
        sender: "ai",
        body: "Refills are $40.",
        status: "sent",
        created_at: iso(NOW.getTime() - 3580_000),
        meta: brain,
      }),
    ],
  });
  const tc = newToolContext(ctxFor(t), A, "operator", TZ, NOW);
  const read = JSON.parse(
    (await runTool(tc, { name: "inbox", input: { action: "conversation", conversation_id: C1 } })).result,
  );
  assert.deepEqual(
    read.messages.map((m) => [m.from, m.text, m.why ?? null]),
    [
      ["customer", "How much is a refill?", null],
      ["receptionist", "Refills are $40.", "Pricing question · 62% sure"],
    ],
    "the customer's stamped message carries no why; AI's reply does",
  );
});

test("people.get is the person page's one read (ledger #3): the reader's one round, every read keyed on the person asked for at once and only their threads' own waiting for the ids; the config the turn already read is not read again, and the word is read once; read once a turn; the page's own view model over the page's payload, so the About rows and the timeline say what the profile says; another workspace's person is an error, never a row", async () => {
  const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const P2 = "abababab-abab-4aba-8aba-abababababa2";
  const C3 = "cccccccc-cccc-4ccc-8ccc-ccccccccccc3";
  const wrote = iso(NOW.getTime() - 3600_000);
  const days = (n) => iso(NOW.getTime() - n * 86_400_000);
  // Rosa as people_list answers her: one thread, one call.
  const rosa = {
    id: P1,
    display_name: "Rosa",
    wa_profile_name: null,
    phone_e164: "+15555550100",
    email: null,
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
    last_call_at: iso(NOW.getTime() - 7200_000),
    call_count: 1,
    call_seconds: 200,
    first_contact_at: days(10),
    earliest_row_at: days(10),
    has_backfill: false,
    has_chat: true,
    queued_reply_at: null,
  };
  // Harbor's Rosa, and Bea, who is bayside's: people_list answers each for their own workspace alone.
  const rpcs = {
    ...RPCS,
    people_list: (a) =>
      a.p_tenant_id === A && a.p_contact_id === P1
        ? [rosa]
        : a.p_tenant_id === B && a.p_contact_id === P2
          ? [{ ...rosa, id: P2, display_name: "Bea", latest_conversation_id: C3 }]
          : [],
  };
  const t = tables({
    contacts: [
      { ...contact, tenant_id: A, erased_at: null },
      { ...contact, id: P2, display_name: "Bea", tenant_id: B, erased_at: null },
    ],
    conversations: [
      conversation(C1),
      conversation(C3, { tenant_id: B, contact_id: P2, contacts: { ...contact, id: P2, display_name: "Bea" } }),
    ],
    contact_identities: [{ contact_id: P1, channel: "whatsapp", external_id: "15555550100", created_at: days(10) }],
    // Where she came from, and a yes she gave: the profile says both; the tool's own read said neither.
    events: [
      {
        tenant_id: A,
        kind: "contact.added",
        subject_type: "contact",
        subject_id: P1,
        data: { source: "calendar", title: "Local move" },
        created_at: days(10),
      },
      {
        id: "ev-1",
        tenant_id: A,
        kind: "contact.consent_changed",
        subject_type: "contact",
        subject_id: P1,
        data: { consent: "opted_in", source: "customer_message", channel: "whatsapp", words: "START" },
        created_at: days(5),
      },
    ],
  });

  // The Ask route reads the workspace's facts, config and policies through the turn's readers first.
  const ctx = ctxFor(t, rpcs);
  const rc = readerContext(ctx, { tenantId: A, role: "operator" }, NOW);
  await Promise.all(
    [workspaceReads.facts, workspaceReads.config, workspaceReads.policies].map((r) => load(rc, r, undefined)),
  );
  const before = ctx.supabase.seen.length;
  const tc = newToolContext(ctx, A, "operator", TZ, NOW, rc);
  const out = await runTool(tc, { name: "people", input: { action: "get", contact_id: P1 } });
  assert.equal(out.isError, false, out.result);
  assert.equal(JSON.parse(out.result).route, `clients/${P1}`, "a profile says where it opens");
  const seen = ctx.supabase.seen.slice(before);
  const order = seen.map((q) => q.rpc ?? q.table);
  const waited = order.indexOf("messages");
  for (const read of [
    "people_list",
    "conversations",
    "calls",
    "policies",
    "events",
    "contacts",
    "deals",
    "contact_identities",
    "leads",
    "sequence_sends",
    "person_notes",
  ]) {
    const asked = order.indexOf(read);
    assert.ok(asked >= 0 && asked < waited, `REGRESSION: ${read} waited for another round (${order.join(", ")})`);
  }
  // In any order among themselves: since #1431 the decisions are read on the person and on their threads in one query, asked
  // beside the escalations once the ids are in.
  assert.deepEqual(
    order.slice(waited).sort(),
    ["decisions", "escalations", "messages"],
    "only the threads' own reads wait, for their ids",
  );
  assert.deepEqual(
    ["people_list", "policies", "events"].map((x) => order.filter((o) => o === x).length),
    [1, 2, 2],
    "the row once; both reply modes; where she came from, and her consent changes",
  );
  const columns = (table) => seen.filter((q) => q.table === table).map((q) => q.columns);
  assert.deepEqual(
    [[...columns("tenants")].sort(), columns("tenant_config")],
    [["appointment_word", "name, timezone"], ["tenant_id, config, version, updated_at, updated_by"]],
    "the config is the turn's; only the calendar's own lookup, which is not a reader, reads the zone and the config (the row, as the server reads it for a member: workspace/config-row.ts), as the page's read does; and the word, through its reader",
  );
  const reads = ctx.supabase.seen.length;
  await runTool(tc, { name: "people", input: { action: "get", contact_id: P1 } });
  assert.equal(ctx.supabase.seen.length, reads, "read once a turn: the second call is the first read");

  // The page's own view model over the page's own payload: GET contacts/:id, then toPersonVM for the member looking, as
  // the profile builds it (surfaces/people/people-detail.ts).
  const page = await personRoute.GET.run(new Request(`http://localhost/api/v1/contacts/${P1}?workspace=${A}`), {
    ...ctxFor(t, rpcs),
    params: { id: P1 },
  });
  const vm = toPersonVM(page.person, TZ, NOW, USER);
  const said = JSON.parse(out.result);
  assert.deepEqual(
    said.about,
    vm.about.map((a) => `${a.k}: ${a.v}`),
    "the profile's About rows",
  );
  assert.deepEqual(
    said.timeline,
    vm.timeline
      .slice(0, 20)
      .map((i) => ({ day: i.day, time: i.time, kind: i.kind, who: i.who, text: i.text.slice(0, 240) })),
    "the profile's timeline",
  );
  assert.deepEqual(said.right_now, { title: vm.rightNow.title, detail: vm.rightNow.detail });
  assert.ok(
    said.about.some((a) => /^Added: .* · from the calendar \(Local move\)$/.test(a)),
    `where she came from, which the tool's own read never said: ${said.about}`,
  );
  assert.ok(
    said.timeline.some((i) => i.kind === "system" && i.text === "Added from the calendar (Local move)") &&
      said.timeline.some((i) => i.kind === "consent"),
    "and on the timeline, with the yes she gave",
  );
  assert.deepEqual([said.conversations.map((c) => c.conversation_id), said.calls.map((c) => c.call_id)], [[C1], [K1]]);
  assert.deepEqual(
    [tc.read.person, tc.read.thread, tc.read.conversation, tc.read.call].map((m) =>
      [...m.values()].map((r) => [r.id, r.route]),
    ),
    [
      [[P1, `clients/${P1}`]],
      [[C1, `inbox/th-${C1}`]],
      [[C1, `conversations/${C1}`]],
      [[K1, `conversations/cv-${K1}`]],
    ],
    "the person, each thread, each call: rows a citation may name, each where the reader said it opens",
  );

  // Bea is bayside's: a harbor turn is told she is not here, in the tool's own words, and nothing of hers is a row.
  const away = newToolContext(ctxFor(t, rpcs), A, "operator", TZ, NOW);
  const { result: refused, lines } = await logged("ask_tool_failed", () =>
    runTool(away, { name: "people", input: { action: "get", contact_id: P2 } }),
  );
  assert.deepEqual(
    [refused.isError, JSON.parse(refused.result)],
    [true, { error: "no such person in this workspace" }],
  );
  assert.deepEqual(lines, [], "a person who is not here is not a failed read");
  assert.deepEqual(
    Object.values(away.read).map((s) => s.size),
    Array(14).fill(0),
    "nothing of another workspace enters the read set, of any of the fourteen kinds of row",
  );
});

test("the rules AI says AI follows are the ones the composer gave it: the price rule on until switched off, two always, the health rule only once switched on", async () => {
  const { factsBlock } = await import(at("apps/dashboard/src/server/ask/prompt/stable-system.ts"));
  const { composeSystemPrompt, guardrailsInForce } = await import("@chanlytics/contracts");
  const brain = {
    business_name: "Harbor Moving",
    booking_link: "https://book.example/harbor",
    system_prompt: "Answer as the front desk of Harbor Moving: brief and warm.",
    fallbacks: { greeting: "g", error: "e", non_text: "n" },
  };
  const config = (guardrails) => ({
    brain: { ...brain, profile: { address: "1 Pier Rd", ...(guardrails ? { guardrails } : {}) } },
  });
  const PRICE = "never quotes or confirms a price";
  const BOOKING = "never confirms a booking itself";
  // Always (decision 0051; the booking rule since 18 Oct 2026, nothing books): a stored false changes nothing, and the
  // price rule off says what it may say instead.
  const AI = "always says it is the business's AI assistant, never a person";
  const WRITTEN = "says only the prices the business wrote, never another";
  const HEALTH = "gives no health advice";

  // No `guardrails` key at all: what every workspace that never opened the rules has.
  const absent = workspaceFacts("Harbor", TZ, config(undefined), NOW);
  assert.deepEqual(
    absent.guardrails,
    [PRICE, BOOKING, AI],
    "the three that default on, and not the one that is opt-in",
  );
  assert.doesNotMatch(factsBlock(absent), /health/, "AI's context never claims a rule AI was not given");

  const on = workspaceFacts("Harbor", TZ, config({ no_health_advice: true }), NOW);
  assert.deepEqual(on.guardrails, [PRICE, BOOKING, AI, HEALTH]);
  assert.match(factsBlock(on), /AI .*gives no health advice\./);

  const off = workspaceFacts(
    "Harbor",
    TZ,
    config({ never_quote_prices: false, never_confirm_booking: false, disclose_ai: false }),
    NOW,
  );
  assert.deepEqual(
    off.guardrails,
    [WRITTEN, BOOKING, AI],
    "the price rule switched off is off, the two always on stay on, and the health rule is still not on",
  );

  // The same three configs through the composer: Ask lists the health rule exactly when the receptionist's prompt holds it.
  for (const [guardrails, facts] of [
    [undefined, absent],
    [{ no_health_advice: true }, on],
    [{ never_quote_prices: false, never_confirm_booking: false, disclose_ai: false }, off],
  ]) {
    const composed = composeSystemPrompt(
      brain,
      { address: "1 Pier Rd", ...(guardrails ? { guardrails } : {}) },
      "whatsapp",
    );
    assert.equal(facts.guardrails.includes(HEALTH), /Never give medical or health advice/.test(composed));
    assert.equal(facts.guardrails.includes(PRICE), /Never quote or confirm a price/.test(composed));
    assert.equal(facts.guardrails.includes(WRITTEN), /Say a price only as the business wrote it/.test(composed));
    assert.equal(facts.guardrails.includes(BOOKING), /Never promise or confirm an appointment yourself/.test(composed));
    assert.ok(facts.guardrails.includes(AI) && /never claim or hint that you are a person/.test(composed));
  }

  // The one reading both go through, with the defaults applied; null and undefined are a workspace with no rules stored.
  assert.deepEqual(guardrailsInForce(undefined), {
    never_quote_prices: true,
    never_confirm_booking: true,
    disclose_ai: true,
    no_health_advice: false,
  });
  assert.deepEqual(guardrailsInForce(null), guardrailsInForce({}));
  assert.deepEqual(guardrailsInForce({ never_quote_prices: false, no_health_advice: true }), {
    never_quote_prices: false,
    never_confirm_booking: true,
    disclose_ai: true,
    no_health_advice: true,
  });
  assert.equal(guardrailsInForce({ disclose_ai: false }).disclose_ai, true, "always on, whatever a row stores");
});

test("the notes AI says AI follows are the ones the composer tells it today: an ended note is not listed, a lasting one says its end in the prompt's words, and one with no end reads as before", async () => {
  const { factsBlock } = await import(at("apps/dashboard/src/server/ask/prompt/stable-system.ts"));
  const { composeSystemPrompt } = await import("@chanlytics/contracts");
  const brain = {
    business_name: "Harbor Moving",
    booking_link: "https://book.example/harbor",
    system_prompt: "Answer as the front desk of Harbor Moving: brief and warm.",
    fallbacks: { greeting: "g", error: "e", non_text: "n" },
  };
  const withNotes = (notes) => ({ brain: { ...brain, profile: { address: "1 Pier Rd", notes } } });
  const said = (facts) =>
    factsBlock(facts)
      .split("\n")
      .find((l) => l.startsWith("Notes AI follows:"));
  const parking = { title: "Parking", text: "Behind the building" };
  // NOW is 10:00 on Monday 14 September in New York: a note whose last day is the 14th lasts, the 13th's has ended.
  const lasting = { title: "Holiday hours", text: "Open 10 to 2", until: "2026-09-14" };
  const ended = { title: "Summer offer", text: "Colour at 20% off", until: "2026-09-13" };
  const facts = workspaceFacts("Harbor", TZ, withNotes([parking, lasting, ended]), NOW, []);
  assert.deepEqual(facts.notes, [parking, lasting], "the ended note is not among AI's facts");
  assert.equal(
    said(facts),
    "Notes AI follows: Parking: Behind the building | Holiday hours (until Monday, September 14, 2026): Open 10 to 2.",
  );
  // The receptionist's prompt, at the same clock in the same zone, says the same notes in the same words.
  const composed = composeSystemPrompt(
    brain,
    { address: "1 Pier Rd", notes: [parking, lasting, ended] },
    "whatsapp",
    TZ,
    NOW,
  );
  assert.ok(
    composed.includes(
      "\n- Parking: Behind the building\n- Holiday hours (until Monday, September 14, 2026): Open 10 to 2",
    ),
  );
  assert.ok(!composed.includes("Summer offer"));
  // A note with no end, byte for byte as Ask said it before a note could end.
  assert.equal(
    said(workspaceFacts("Harbor", TZ, withNotes([parking]), NOW, [])),
    "Notes AI follows: Parking: Behind the building.",
  );
  // Every note ended: no line at all, as with none.
  assert.equal(said(workspaceFacts("Harbor", TZ, withNotes([ended]), NOW, [])), undefined);
  // The next day in New York the note that lasted has ended too.
  assert.deepEqual(
    workspaceFacts("Harbor", TZ, withNotes([parking, lasting]), new Date("2026-09-15T04:30:00Z"), []).notes,
    [parking],
  );
});

test("people.get says where the proposal lives (00154), so a card can carry the address into a reply; nothing when there is none; and a deal is said wherever one is on file, whatever the retired answer (0008, amended 18 Oct 2026)", async () => {
  const wrote = iso(NOW.getTime() - 2 * 3600_000);
  const rosaRow = {
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
    last_inbound_text: "How much would the move be?",
    last_inbound_at: wrote,
    last_call_at: null,
    call_count: 0,
    call_seconds: 0,
    first_contact_at: wrote,
    earliest_row_at: wrote,
    has_backfill: false,
    has_chat: true,
    queued_reply_at: null,
  };
  const rpcs = { ...RPCS, people_list: () => [rosaRow] };
  // A proposal is a deal's (0008), said in every workspace (amended 18 Oct 2026).
  const harbor = [{ id: A, name: "Harbor", timezone: TZ, appointment_word: "meeting" }];
  const withLink = tables({
    tenants: harbor,
    contacts: [{ ...contact, tenant_id: A, erased_at: null, proposal_url: "https://docs.example.com/p/rosa" }],
  });
  const r = await runTool(newToolContext(ctxFor(withLink, rpcs), A, "operator", TZ, NOW), {
    name: "people",
    input: { action: "get", contact_id: P1 },
  });
  assert.equal(r.isError, false, r.result);
  const person = JSON.parse(r.result);
  assert.ok(person.about.includes("Proposal: docs.example.com"), `About: ${person.about}`);

  const without = await runTool(newToolContext(ctxFor(tables({ tenants: harbor }), rpcs), A, "operator", TZ, NOW), {
    name: "people",
    input: { action: "get", contact_id: P1 },
  });
  assert.equal(without.isError, false, without.result);
  assert.ok(!JSON.parse(without.result).about.some((a) => a.startsWith("Proposal:")), "none on file: no row");

  // The deal holds the proposal now (0008): its value in the Deal fact, and where its link lives -- the host, never
  // the address -- even where nothing is left on the person.
  const onDeal = {
    ...rosaRow,
    deal_id: "dddddddd-dddd-4ddd-8ddd-ddddddddddd1",
    deal_stage: "proposed",
    deal_service: "Local move",
    deal_proposed_at: iso(NOW.getTime() - 3 * 86_400_000),
    deal_decided_at: null,
    deal_ended_at: null,
    deal_amount_cents: 120000,
    deal_per: "once",
    deal_proposal_url: "https://www.quotes.example.com/p/rosa",
  };
  const dealt = await runTool(
    newToolContext(
      ctxFor(tables({ tenants: harbor }), { ...RPCS, people_list: () => [onDeal] }),
      A,
      "operator",
      TZ,
      NOW,
    ),
    { name: "people", input: { action: "get", contact_id: P1 } },
  );
  assert.equal(dealt.isError, false, dealt.result);
  const said = JSON.parse(dealt.result);
  const fact = said.facts.find((f) => f.startsWith("Deal: "));
  assert.match(
    fact,
    /^Deal: Proposal out \(Local move · Proposal out · since \w{3} \d+ · \$1,200 · proposal at quotes\.example\.com\)$/,
  );
  assert.ok(!fact.includes("https://"), "the host, never the address");
  assert.ok(said.about.includes("Proposal: quotes.example.com"), `About: ${said.about}`);

  // Where the retired answer said its customers book, or was never given, the deal is said all the same.
  for (const tenants of [[{ id: A, name: "Harbor", timezone: TZ }], undefined]) {
    const any = await runTool(
      newToolContext(
        ctxFor(
          tables({
            ...(tenants ? { tenants } : {}),
            contacts: [{ ...contact, tenant_id: A, erased_at: null, proposal_url: "https://docs.example.com/p/rosa" }],
          }),
          { ...RPCS, people_list: () => [onDeal] },
        ),
        A,
        "operator",
        TZ,
        NOW,
      ),
      { name: "people", input: { action: "get", contact_id: P1 } },
    );
    assert.equal(any.isError, false, any.result);
    const p = JSON.parse(any.result);
    assert.ok(
      p.facts.some((f) => f.startsWith("Deal: Proposal out")),
      `the Deal fact: ${p.facts}`,
    );
    assert.ok(
      p.about.some((a) => a.startsWith("Proposal:")),
      `the proposal: ${p.about}`,
    );
  }
});
