/**
 * The playbook's check, a moment and its message agreeing on the yes they need (decision 7), the month's allowance at
 * enrolment, and a message that needs no WhatsApp row (lane 1).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  REACH_OUT_IS_NOT_A_MOMENT,
  FOLLOW_UP_NEEDS_LINK,
  MESSAGE_MOMENT_WORDS,
  MOMENTS_RETIRED,
  winBackWords,
  starterForTrigger,
  templateTitle,
} from "@chanlytics/contracts";
import { importSrc } from "../../_source.mjs";
import {
  ALL_THREE,
  EMAIL_ONLY,
  EMAIL_V,
  EMAIL_VISIT,
  EVERY_CHANNEL,
  IN_REVIEW,
  MONTH,
  NOW,
  NO_WHATSAPP,
  T1,
  TEXT_V,
  approveRun,
  byEmailAndText,
  checkPlaybook,
  createBroadcast,
  everyone,
  fakes,
  make,
  messageOf,
  reachable,
  refused,
  refusedLoudly,
  template,
} from "./_core-campaigns.mjs";

test("the playbook's check: the trigger first, then the template through the one judgement, the name when none was given, the whole numbers", async () => {
  await refused(
    checkPlaybook(fakes().ports, {}),
    "validation",
    400,
    // 2 Oct 2026: the moments a new playbook may start from; welcome and save our number are no longer among them, and
    // lapsed is the win-back by visits.
    "Pick what starts it: win-back, the month's offer, a visit tomorrow, a visit yesterday, one of your lists, or a proposal waiting.",
  );
  // A reach-out's steps are made on its own sheet (Part 4): the moments' check refuses them in words, before the
  // database's shape CHECK would in none.
  for (const trigger of ["lead_first", "after_step"])
    await refused(
      checkPlaybook(fakes().ports, { trigger, template_id: T1 }),
      "validation",
      400,
      REACH_OUT_IS_NOT_A_MOMENT,
    );
  await refused(
    checkPlaybook(fakes().ports, { trigger: "quiet_30", template_id: "nope" }),
    "validation",
    400,
    "Pick a template.",
  );
  await refused(
    checkPlaybook(fakes({ message: messageOf({ whatsapp: template({ meta_status: "rejected" }) }) }).ports, {
      trigger: "quiet_30",
      template_id: T1,
    }),
    "conflict",
    409,
    "WhatsApp asked for a change to this message's words. AI writes new words for you to send back.",
  );
  await refused(
    checkPlaybook(
      fakes({ message: messageOf({ whatsapp: template({ variables: ["1"] }) }), bookingLink: null }).ports,
      {
        trigger: "quiet_30",
        template_id: T1,
        params: ["@booking_link"],
      },
    ),
    "conflict",
    409,
    "This message takes the booking link, and none is on file.",
  );
  // REGRESSION (C6): only a visit playbook has a visit to name; a win-back's visit slot reached nobody.
  await refused(
    checkPlaybook(fakes({ message: messageOf({ whatsapp: template({ variables: ["1"] }) }) }).ports, {
      trigger: "quiet_30",
      template_id: T1,
      params: ["@visit_service"],
    }),
    "validation",
    400,
    "Only a message about one booking can fill in the booked time or service: a reminder before it, the check the day after, or the message after a missed one.",
  );
  for (const trigger of ["visit_tomorrow", "visited"]) {
    // 2 Oct 2026: both visit moments run under Bookings, so their message is about the visit (utility), not an offer.
    // A calendar is connected: a new one is made only where one is (D44).
    const visit = await checkPlaybook(
      fakes({
        calendarOn: true,
        message: messageOf({ whatsapp: template({ variables: ["1", "2"], category: "utility" }) }),
      }).ports,
      { trigger, template_id: T1, params: ["@visit_when", "@visit_service"] },
      null,
    );
    assert.deepEqual(
      visit.params,
      [{ kind: "visit_when" }, { kind: "visit_service" }],
      `${trigger} fills a visit's words`,
    );
  }
  // 0006: a proposal follow-up is made in every workspace (0008, amended 18 Oct 2026), and only it fills in a
  // proposal's link.
  const threeSlots = template({ name: "proposal_follow_up", category: "utility", variables: ["1", "2", "3"] });
  const followUp = {
    trigger: "proposal_waiting",
    template_id: T1,
    params: ["@first_name", "@business_name", "@proposal_link"],
  };
  const made = await checkPlaybook(fakes({ message: messageOf({ whatsapp: threeSlots }) }).ports, followUp);
  assert.deepEqual(
    [made.name, made.policy_class, made.params],
    ["Proposal follow-up", "follow_up", [{ kind: "first_name" }, { kind: "business_name" }, { kind: "proposal_link" }]],
    "its own starter: the moment's name, its own class, and the link each person's proposal carries",
  );
  // A follow-up with no slot filled by the link would be a bare "just checking in": refused. (A utility message, since
  // 2 Oct 2026 the follow-up's class and its message's category must agree: an offer is refused before the link.)
  await refused(
    checkPlaybook(
      fakes({ message: messageOf({ whatsapp: template({ variables: ["1"], category: "utility" }) }) }).ports,
      {
        trigger: "proposal_waiting",
        template_id: T1,
        params: ["@first_name"],
      },
    ),
    "validation",
    400,
    FOLLOW_UP_NEEDS_LINK,
  );
  // A win-back cannot carry a proposal's link.
  await refused(
    checkPlaybook(fakes({ message: messageOf({ whatsapp: template({ variables: ["1"] }) }) }).ports, {
      trigger: "quiet_30",
      template_id: T1,
      params: ["@proposal_link"],
    }),
    "validation",
    400,
    "Only the proposal follow-up can fill in a proposal's link.",
  );
  const starter = starterForTrigger("quiet_30").name;
  const own = await checkPlaybook(fakes({ message: messageOf({ whatsapp: template({ name: starter }) }) }).ports, {
    trigger: "quiet_30",
    template_id: T1,
    params: [],
  });
  assert.deepEqual(
    own,
    {
      name: "Win-back",
      trigger: "quiet_30",
      list_id: null,
      list_key: null,
      template_id: T1,
      template_name: starter,
      template_language: "en_US",
      params: [],
      policy_class: "reengage",
      run_hour: 10,
      cap_per_run: 25,
      gap_days: 90,
      cadence_days: 30,
      // Step 3: WhatsApp alone when none is named, as every playbook went before.
      channels: ["whatsapp"],
    },
    "its own starter: the trigger's name alone, and the defaults",
  );
  const given = await checkPlaybook(
    fakes({ message: messageOf({ whatsapp: template({ title: "Monthly offer" }) }) }).ports,
    {
      trigger: "everyone_monthly",
      template_id: T1,
      params: [],
      name: "  The   month's  offer ",
    },
  );
  assert.equal(given.name, "The month's offer", "given, its spaces made one");
  assert.equal(given.policy_class, "campaign");
  const titled = await checkPlaybook(
    fakes({ message: messageOf({ whatsapp: template({ title: "Monthly offer" }) }) }).ports,
    {
      trigger: "everyone_monthly",
      template_id: T1,
      params: [],
    },
  );
  assert.equal(
    titled.name,
    `The month's offer · ${templateTitle("month_offer", "Monthly offer")}`,
    "another template: the trigger and the template's title",
  );
  await refused(
    checkPlaybook(fakes().ports, { trigger: "quiet_30", template_id: T1, params: [], run_hour: 7 }),
    "validation",
    400,
    "The hour must be a whole number from 9 to 20.",
  );
  await refused(
    checkPlaybook(fakes().ports, { trigger: "quiet_30", template_id: T1, params: [], cap_per_run: 2.5 }),
    "validation",
    400,
    "The cap must be a whole number from 1 to 500.",
  );
  const nums = await checkPlaybook(fakes().ports, {
    trigger: "quiet_30",
    template_id: T1,
    params: [],
    run_hour: "18",
    cap_per_run: 5,
    gap_days: 30,
    cadence_days: 7,
  });
  assert.deepEqual([nums.run_hour, nums.cap_per_run, nums.gap_days, nums.cadence_days], [18, 5, 30, 7]);
});

test("the moments a new playbook may start from (2 Oct 2026): a retired one is refused in its own words but one already there is kept; the win-back is the one the workspace can read", async () => {
  const body = (trigger) => ({ trigger, template_id: T1, params: [] });
  for (const trigger of ["new_week", "phoned_only"]) {
    await refused(checkPlaybook(fakes().ports, body(trigger), null), "validation", 400, MOMENTS_RETIRED[trigger]);
    // A playbook made there keeps running (the run asks triggerOffered, never this), and is changed and kept.
    const kept = await checkPlaybook(fakes().ports, { ...body(trigger), name: "Renamed" }, { trigger });
    assert.deepEqual([kept.trigger, kept.name], [trigger, "Renamed"], `${trigger}: changed where it already is`);
  }
  await refused(
    checkPlaybook(fakes().ports, body("new_week"), { trigger: "quiet_30" }),
    "validation",
    400,
    MOMENTS_RETIRED.new_week,
  );
  const silence = fakes({ calendarOn: false });
  assert.equal((await checkPlaybook(silence.ports, body("quiet_30"), null)).trigger, "quiet_30");
  await refused(checkPlaybook(silence.ports, body("lapsed"), null), "validation", 400, winBackWords("visit").lapsed);
  const visits = fakes({ calendarOn: true });
  assert.equal((await checkPlaybook(visits.ports, body("lapsed"), null)).trigger, "lapsed");
  await refused(checkPlaybook(visits.ports, body("quiet_30"), null), "validation", 400, winBackWords("visit").quiet_30);
  // The other win-back, already running, is changed and kept: a calendar connected later does not strand it.
  assert.equal((await checkPlaybook(visits.ports, body("quiet_30"), { trigger: "quiet_30" })).trigger, "quiet_30");
  // Each fact is asked only of the moment it decides: a calendar that cannot be read costs a month's offer nothing.
  const blind = fakes({ calendarOn: new Error("asked") });
  assert.equal((await checkPlaybook(blind.ports, body("everyone_monthly"), null)).trigger, "everyone_monthly");
  // A proposal follow-up is changed and kept in every workspace, as it is made in every one (0008, amended 18 Oct
  // 2026).
  const threeSlots = template({ name: "proposal_follow_up", category: "utility", variables: ["1", "2", "3"] });
  const kept = await checkPlaybook(
    fakes({ message: messageOf({ whatsapp: threeSlots }) }).ports,
    { trigger: "proposal_waiting", template_id: T1, params: ["@first_name", "@business_name", "@proposal_link"] },
    { trigger: "proposal_waiting" },
  );
  assert.equal(kept.trigger, "proposal_waiting");
});

test("an appointment moment needs a calendar, said in the workspace's word; a new one is named in it; one made before is kept", async () => {
  const utility = messageOf({ whatsapp: template({ category: "utility" }) });
  const visit = (trigger, over = {}) => ({ trigger, template_id: T1, params: [], ...over });
  await refused(
    checkPlaybook(
      fakes({ calendarOn: false, appointmentWord: "meeting", message: utility }).ports,
      visit("visit_tomorrow"),
      null,
    ),
    "validation",
    400,
    "Meetings are read from your calendar, and none is connected. Connect one under Settings › Hours & booking.",
  );
  // A reminder made before the rule keeps running, and is changed where it is.
  const kept = await checkPlaybook(
    fakes({ calendarOn: false, message: utility }).ports,
    visit("visit_tomorrow", { name: "Kept" }),
    { trigger: "visit_tomorrow" },
  );
  assert.equal(kept.name, "Kept");
  // A new one given no name takes its moment's, in the word (D43: a stored name keeps its own).
  const made = await checkPlaybook(
    fakes({ calendarOn: true, appointmentWord: "session", message: utility }).ports,
    visit("visited"),
    null,
  );
  assert.match(made.name, /^After the session/);
  // The refusal that names the moments says them in the word too.
  await refused(
    checkPlaybook(fakes({ appointmentWord: "lesson" }).ports, { template_id: T1, params: [] }, null),
    "validation",
    400,
    "a lesson tomorrow, a lesson yesterday",
  );
  // The word is asked only where it is said: a month's offer with no name never asks it.
  const quiet = fakes({ appointmentWord: new Error("asked") });
  assert.equal(
    (await checkPlaybook(quiet.ports, { trigger: "everyone_monthly", template_id: T1, params: [] }, null)).trigger,
    "everyone_monthly",
  );
});

test("a moment and its message agree on the yes they need (decision 7): a playbook made or changed whose two disagree is refused, in the words for which way", async () => {
  const offer = template({ category: "marketing" });
  const visit = template({ category: "utility" });
  const unfiled = template({ category: null });
  // A message that is an offer on a moment that reaches anyone who said yes to texts. A calendar is connected: a new
  // appointment moment is made only where one is (D44).
  for (const trigger of ["visit_tomorrow", "visited"])
    await refused(
      checkPlaybook(
        fakes({ calendarOn: true, message: messageOf({ whatsapp: offer }) }).ports,
        { trigger, template_id: T1, params: [] },
        null,
      ),
      "validation",
      400,
      MESSAGE_MOMENT_WORDS.offer_on_texts,
    );
  // One no channel ever filed is an offer, as the send reads it (purposeOfTemplate).
  await refused(
    checkPlaybook(
      fakes({ calendarOn: true, message: messageOf({ whatsapp: unfiled }) }).ports,
      { trigger: "visited", template_id: T1, params: [] },
      null,
    ),
    "validation",
    400,
    MESSAGE_MOMENT_WORDS.offer_on_texts,
  );
  // A message about their own visit on a moment that sends offers, which only a yes to offers may reach.
  for (const body of [
    { trigger: "quiet_30" },
    { trigger: "everyone_monthly" },
    { trigger: "saved_list", list_key: "lapsed", policy_class: "reengage" },
  ])
    await refused(
      checkPlaybook(
        fakes({ message: messageOf({ whatsapp: visit }) }).ports,
        { ...body, template_id: T1, params: [] },
        null,
      ),
      "validation",
      400,
      MESSAGE_MOMENT_WORDS.texts_on_offers,
    );
  // The proposal follow-up is about their own proposal: an offer is refused there too.
  await refused(
    checkPlaybook(
      fakes({ message: messageOf({ whatsapp: template({ category: "marketing", variables: ["1"] }) }) }).ports,
      { trigger: "proposal_waiting", template_id: T1, params: ["@proposal_link"] },
      null,
    ),
    "validation",
    400,
    MESSAGE_MOMENT_WORDS.offer_on_texts,
  );
  // Changed, the same: an After-the-visit playbook made when it was a re-engagement, still sending the marketing
  // thank-you, is refused when it is saved, and saved once it sends a message about the visit.
  const after = { trigger: "visited", template_id: T1, params: [] };
  await refused(
    checkPlaybook(fakes({ message: messageOf({ whatsapp: offer }) }).ports, after, { trigger: "visited" }),
    "validation",
    400,
    MESSAGE_MOMENT_WORDS.offer_on_texts,
  );
  const saved = await checkPlaybook(fakes({ message: messageOf({ whatsapp: visit }) }).ports, after, {
    trigger: "visited",
  });
  assert.deepEqual([saved.trigger, saved.policy_class], ["visited", "booking"], "now under Bookings, as it is classed");
  // And where they agree, nothing is said: an offer on an offer's moment, a visit's message on a visit's.
  assert.equal(
    (
      await checkPlaybook(
        fakes({ message: messageOf({ whatsapp: offer }) }).ports,
        { trigger: "quiet_30", template_id: T1, params: [] },
        null,
      )
    ).policy_class,
    "reengage",
  );
  assert.equal(
    (
      await checkPlaybook(
        fakes({ calendarOn: true, message: messageOf({ whatsapp: visit }) }).ports,
        { trigger: "visit_tomorrow", template_id: T1, params: [] },
        null,
      )
    ).policy_class,
    "booking",
  );
});

test("approve: a reach-out's run is released now with no broadcast job, on its own day or a later one, its sends keeping their times", async () => {
  const run = {
    id: "b9",
    tenant_id: "t1",
    state: "pending_approval",
    name: "Movers in Austin",
    recipient_count: 12,
    playbook_id: "p1",
    run_for: "2026-09-01",
    audience: { kind: "reach_out", root_id: "p1", step_id: "p1", search_id: "s1" },
  };
  const f = fakes();
  const r = await approveRun(f.ports, { row: run, now: NOW });
  assert.deepEqual(
    [r.state, r.scheduled_for, r.moved_from, r.decision_id],
    ["scheduled", NOW.toISOString(), null, "d1"],
  );
  assert.deepEqual(f.ops(), ["approve"]);
  assert.equal(f.of("approve")[0][3].job, false, "no broadcast job: it would find nobody and end the run as sent");
  assert.equal(f.of("approve")[0][2].toISOString(), NOW.toISOString(), "from the moment it is approved");
  assert.equal(f.of("approve")[0][3].decision.reach_out, true);
  await refused(
    approveRun(fakes({ approve: null }).ports, { row: run, now: NOW }),
    "conflict",
    409,
    "This run just changed state",
  );
});

test("approve: a reach-out's run keeps when its first email goes, and says now only once that time has passed", async () => {
  const run = (scheduled_for) => ({
    id: "b9",
    tenant_id: "t1",
    state: "pending_approval",
    name: "Movers in Austin · 2026-09-06",
    recipient_count: 4,
    playbook_id: "p1",
    run_for: "2026-09-06",
    scheduled_for,
    audience: { kind: "reach_out", root_id: "p1", step_id: "p1", search_id: "s1" },
  });
  const ahead = new Date(NOW.getTime() + 2 * 86_400_000).toISOString();
  const f = fakes();
  const r = await approveRun(f.ports, { row: run(ahead), now: NOW });
  assert.equal(r.scheduled_for, ahead, "Monday's first email, not now");
  assert.equal(f.of("approve")[0][2].toISOString(), ahead);
  const past = fakes();
  const stale = new Date(NOW.getTime() - 3_600_000).toISOString();
  assert.equal((await approveRun(past.ports, { row: run(stale), now: NOW })).scheduled_for, NOW.toISOString());
});

test("the month is counted before anyone is enrolled, and whoever is past its room is enrolled held: the report says so up front", async () => {
  const asked = [];
  const f = fakes({
    ...MONTH,
    people: byEmailAndText(),
    monthSent: (channel) => (asked.push(channel), channel === "email" ? 1998 : 499),
  });
  const r = await make(f, ALL_THREE);
  assert.deepEqual(asked, ["email", "sms"], "each metered channel somebody goes by, once, before the run is written");
  assert.deepEqual(f.ops(), ["assemble", "holdRecipients"], "the run whole with its line, then its held");
  assert.equal(f.of("assemble")[0][1].recipient_count, 7, "everyone is enrolled, the held among them");
  // Room for two emails and one text: the last two on email and the last two on text are past it, in their order.
  assert.deepEqual(f.of("holdRecipients")[0], ["holdRecipients", "b1", ["e3", "e4", "t2", "t3"], "month_allowance"]);
  assert.equal(r.held_for_allowance, 4);
  assert.equal(f.of("assemble")[0][4].payload.held_for_allowance, 4, "the ledger says how many were held");
});

test("the month is counted at the moment the run opens, not the day it is made: made on the 28th for the 1st it counts against the new month, and a send moved to nine tomorrow counts where it really goes", async () => {
  // The workspace's month by its sends: September's room is used up, October's has none spent. The database counts the month
  // `at` falls in; a count asked for no moment is the one it is made in (now).
  const used = (calls) => (channel, at) => {
    calls.push([channel, at ? at.toISOString() : null]);
    return (at ?? new Date("2026-09-28T14:00:00Z")).toISOString().startsWith("2026-10") ? 0 : 2000;
  };
  const run = (f, now, scheduled_for) =>
    createBroadcast(f.ports, {
      userId: "u1",
      body: { ...ALL_THREE, ...(scheduled_for ? { scheduled_for } : {}) },
      now,
    });
  // Made on the 28th of September for the 1st of October, 10:00 in New York.
  const calls = [];
  const f = fakes({ ...MONTH, people: byEmailAndText(), monthSent: used(calls) });
  const made = await run(f, new Date("2026-09-28T14:00:00Z"), "2026-10-01T10:00:00-04:00");
  assert.deepEqual(
    calls,
    [
      ["email", "2026-10-01T14:00:00.000Z"],
      ["sms", "2026-10-01T14:00:00.000Z"],
    ],
    "each metered channel, asked at the run's opening moment",
  );
  assert.equal(made.held_for_allowance, 0, "nobody is held past the old month's room, as a final skip");
  assert.deepEqual(f.ops(), ["assemble"]);
  // The same send for a day in the month it is made in is held at September's room, as it always was.
  const same = fakes({ ...MONTH, people: byEmailAndText(), monthSent: used([]) });
  const held = await run(same, new Date("2026-09-28T14:00:00Z"), "2026-09-29T10:00:00-04:00");
  assert.equal(held.held_for_allowance, 7, "September has no room left");
  // Asked at eleven at night on the 30th, a send goes at nine the next morning (the moment it really leaves), in October.
  const night = [];
  const moved = fakes({ ...MONTH, people: byEmailAndText(), monthSent: used(night) });
  const r = await run(moved, new Date("2026-10-01T03:30:00Z"), undefined);
  assert.equal(r.moved_from, "2026-10-01T03:40:00.000Z", "now, and its ten minutes to stop it");
  assert.deepEqual(
    night.map((c) => c[1]),
    ["2026-10-01T13:00:00.000Z", "2026-10-01T13:00:00.000Z"],
  );
  assert.equal(r.held_for_allowance, 0);
});

test("a run with room for everyone holds nobody, and a WhatsApp run never counts the month", async () => {
  const roomy = fakes({ ...MONTH, people: byEmailAndText(), monthSent: 0 });
  const r = await make(roomy, ALL_THREE);
  assert.deepEqual(roomy.ops(), ["assemble"], "nothing to hold: no write");
  assert.equal(r.held_for_allowance, 0);
  assert.equal(
    "held_for_allowance" in roomy.of("assemble")[0][4].payload,
    false,
    "the ledger names it only when it held somebody",
  );
  // WhatsApp is Meta's tier, not this: nobody on it asks for the count, so a count that cannot be read costs it nothing.
  const wa = fakes({ monthSent: new Error("the database is down") });
  await make(wa, { template_id: T1, audience: everyone });
  assert.deepEqual(wa.ops(), ["assemble"]);
});

test("a month that could not be counted is not room: the broadcast is refused in words, and nothing is written", async () => {
  const f = fakes({ ...MONTH, people: byEmailAndText(), monthSent: new Error("rpc: connection reset") });
  const { e, wire, said } = await refusedLoudly(make(f, ALL_THREE));
  assert.equal(e.code, "internal");
  assert.equal(e.status, 500);
  assert.ok(e.message.includes("could not be counted just now"), e.message);
  assert.deepEqual(f.ops(), [], "no run, no people, no job");
  // The database's own words are never the person's to read: the response carries none, and the log carries the cause.
  assert.equal(e.details, undefined);
  assert.ok(!wire.includes("connection reset"), `the response says ${wire}`);
  assert.deepEqual(
    said.map((l) => [l.event, l.step, l.error]),
    [["campaign_step_failed", "month_count", "Error: rpc: connection reset"]],
  );
});

test("a hold that could not be written leaves the people queued, and the run is made all the same: the send holds them at the wire, and neither the receipt nor the ledger claims a hold that was not written", async () => {
  const said = [];
  const error = console.error;
  console.error = (...args) => said.push(JSON.parse(args[0]));
  const f = fakes({ ...MONTH, people: byEmailAndText(), monthSent: 2000, holdRecipients: new Error("write failed") });
  let r;
  try {
    r = await make(f, { template_id: T1, audience: everyone, channels: ["email"] });
  } finally {
    console.error = error;
  }
  assert.deepEqual(f.ops(), ["assemble", "holdRecipients"], "the run stands, and the ledger's line with it");
  assert.equal(r.id, "b1");
  assert.equal(r.held_for_allowance, 0, "none was held at enrolment: the receipt says what was actually held");
  // The ledger's line is written with the run, before the hold (00381): it says how many the month holds, as a
  // playbook's run does; what the hold's own write then left queued is the receipt's and the log's to say.
  const decision = f.of("assemble")[0][4].payload;
  assert.equal(decision.held_for_allowance, 4, "the month holds four");
  assert.equal("hold_unwritten" in decision, false, "written before the hold, so it cannot say what the hold left");
  // And it is said, by name, with the error: never an empty catch.
  assert.deepEqual(
    said.map((l) => [l.event, l.broadcast_id, l.unheld, l.error]),
    [["campaign_hold_unwritten", "b1", 4, "Error: write failed"]],
  );
  // A hold that was written says nothing and claims what it did.
  const ok = fakes({ ...MONTH, people: byEmailAndText(), monthSent: 2000 });
  const kept = await make(ok, { template_id: T1, audience: everyone, channels: ["email"] });
  assert.equal(kept.held_for_allowance, 4);
  assert.ok(!("hold_unwritten" in ok.of("assemble")[0][4].payload), "nothing unwritten, nothing said of it");
});

test("a broadcast by email on a message with no WhatsApp row, on a workspace with no WhatsApp number, is made: for the people who said yes to messages and have an address, on the email version", async () => {
  const unsaid = (id) => {
    const r = reachable(id, { phone: null });
    return { ...r, consent: { ...r.consent, state: "unknown", channels: null, relationship: false } };
  };
  const people = [
    reachable("a", { phone: null }), // an address, a yes to messages and a relationship: enrolled
    reachable("b", { email: null }), // a number and no address: nothing to send an email to
    unsaid("c"), // an address, and no yes, and no relationship: held
  ];
  const f = fakes({ message: EMAIL_VISIT(), channels: EMAIL_ONLY, people });
  const r = await make(f, { template_id: EMAIL_V, audience: everyone, channels: ["email"] });
  const [, row, recipients] = f.of("assemble")[0];
  assert.equal(row.template_id, EMAIL_V, "the email version's id: the message's anchor where it has no other version");
  assert.deepEqual([row.template_name, row.template_language, row.channels], ["month_offer", "en_US", ["email"]]);
  assert.deepEqual(recipients, [{ contact_id: "a", facts: null, channel: "email" }]);
  assert.equal(r.recipient_count, 1);
  assert.deepEqual(f.ops(), ["assemble"], "no number is asked for: an email send never needs one");
  assert.equal(f.of("assemble")[0][4].payload.category, "utility", "the category the message's own version carries");
  // WhatsApp is the tick when none is named, and there is no WhatsApp number: the workspace's reason wins.
  await refused(
    make(fakes({ message: EMAIL_VISIT(), channels: EMAIL_ONLY }), { template_id: EMAIL_V, audience: everyone }),
    "conflict",
    409,
    "Connect a WhatsApp number first.",
  );
  // With a number, the message has no WhatsApp version: that is the sentence, for the tick alone and beside the email's.
  for (const channels of [["whatsapp"], ["whatsapp", "email"], undefined]) {
    const g = fakes({ message: EMAIL_VISIT(), channels: EVERY_CHANNEL });
    await refused(
      make(g, { template_id: EMAIL_V, audience: everyone, ...(channels ? { channels } : {}) }),
      "conflict",
      409,
      NO_WHATSAPP,
    );
    assert.deepEqual(g.ops(), [], "refused at create, before a row");
  }
});

test("ticks WhatsApp's version of a message WhatsApp is still checking: the send is made and waits for it (core whatsapp-wait.ts), whoever an email reaches placed there and whoever only WhatsApp reaches placed on WhatsApp; one WhatsApp refused is refused at create in its standing; the email tick alone is made on the anchor", async () => {
  const people = [reachable("a"), reachable("b", { email: null })];
  for (const [channels, placed] of [
    [["whatsapp", "email"], { a: "email", b: "whatsapp" }],
    [["whatsapp"], { a: "whatsapp", b: "whatsapp" }],
  ]) {
    const f = fakes({ message: IN_REVIEW(), channels: EVERY_CHANNEL, people });
    await make(f, { template_id: T1, audience: everyone, ...(channels ? { channels } : {}) });
    const [, row, recipients] = f.of("assemble")[0];
    const on = Object.fromEntries(recipients.map((r) => [r.contact_id, r.channel]));
    assert.deepEqual([row.channels, on], [channels ?? ["whatsapp"], placed], "its ticks are kept");
  }
  // WhatsApp's refusals say themselves, by the same sentence a page greys the tick with: they do not end by themselves.
  for (const [meta_status, said] of [
    ["rejected", "WhatsApp asked for a change to this message's words."],
    ["disabled", "WhatsApp turned this message off, because people kept marking it as unwanted."],
  ])
    await refused(
      make(fakes({ message: messageOf({ whatsapp: template({ meta_status }) }), channels: EVERY_CHANNEL }), {
        template_id: T1,
        audience: everyone,
      }),
      "conflict",
      409,
      said,
    );
  // By email alone it is made, whichever version's id was picked: the message is kept on its anchor, WhatsApp's row as it stands.
  for (const id of [T1, EMAIL_V]) {
    const f = fakes({ message: IN_REVIEW(), channels: EVERY_CHANNEL, people: [reachable("a")] });
    await make(f, { template_id: id, audience: everyone, channels: ["email"] });
    assert.deepEqual(
      [f.of("assemble")[0][1].template_id, f.of("assemble")[0][1].channels],
      [T1, ["email"]],
      `picked by ${id}`,
    );
  }
});

test("any version's id names the message: WhatsApp's, an email's and a text's make the same broadcast, kept on the anchor's id; an id of no version is no message", async () => {
  const all = messageOf({ whatsapp: template({ category: "utility" }), own: ["email", "sms"] });
  for (const id of [T1, EMAIL_V, TEXT_V]) {
    const f = fakes({ message: all, channels: EVERY_CHANNEL, people: [reachable("a")] });
    await make(f, { template_id: id, audience: everyone });
    const [, row] = f.of("assemble")[0];
    assert.deepEqual(
      [row.template_id, row.template_name, row.template_language, row.channels],
      [T1, "month_offer", "en_US", ["whatsapp"]],
      `picked by ${id}`,
    );
  }
  await refused(
    make(fakes({ message: all }), { template_id: "77777777-7777-4777-8777-777777777799", audience: everyone }),
    "not_found",
    404,
    "Template not found.",
  );
  // With no WhatsApp row the anchor is the email, and a text's id lands on it.
  const own = messageOf({ whatsapp: null, own: ["email", "sms"], ownCategory: "utility" });
  const f = fakes({ message: own, channels: EMAIL_ONLY, people: [reachable("a", { phone: null })] });
  await make(f, { template_id: TEXT_V, audience: everyone, channels: ["email"] });
  assert.equal(f.of("assemble")[0][1].template_id, EMAIL_V, "picked by the text's id, kept on the email's: the anchor");
  // The playbook is kept on the anchor the same way (a calendar connected: a new reminder is made only where one is).
  const kept = await checkPlaybook(fakes({ calendarOn: true, message: own }).ports, {
    trigger: "visit_tomorrow",
    template_id: TEXT_V,
    params: [],
    channels: ["sms", "email"],
  });
  assert.deepEqual([kept.template_id, kept.template_name, kept.channels], [EMAIL_V, "month_offer", ["sms", "email"]]);
});

test("a message takes as many values as it has slots, by contracts' one count: positions 1 and 3 in a list of two are three slots, and the refusal says so, for a broadcast and a playbook", async () => {
  const slot = (position) => ({ position, label: `Value ${position}`, example: "example" });
  const gapped = messageOf({ whatsapp: template({ variables: [slot(1), slot(3)] }) });
  const two = ["@first_name", "hello"];
  const three = ["@first_name", "hello", "again"];
  await refused(
    make(fakes({ message: gapped }), { template_id: T1, params: two, audience: everyone }),
    "validation",
    400,
    "This template takes 3 values.",
  );
  const f = fakes({ message: gapped });
  await make(f, { template_id: T1, params: three, audience: everyone });
  assert.equal(f.of("assemble")[0][1].params.length, 3);
  await refused(
    checkPlaybook(fakes({ message: gapped }).ports, { trigger: "quiet_30", template_id: T1, params: two }),
    "validation",
    400,
    "This template takes 3 values.",
  );
  // A message with no WhatsApp row counts its anchor's: the email's two slots.
  const emailSlots = messageOf({
    whatsapp: null,
    own: ["email"],
    ownCategory: "utility",
    ownOver: { variables: [slot(1), slot(2)] },
  });
  await refused(
    make(fakes({ message: emailSlots, channels: EMAIL_ONLY }), {
      template_id: EMAIL_V,
      params: three,
      audience: everyone,
      channels: ["email"],
    }),
    "validation",
    400,
    "This template takes 2 values.",
  );
});

test("a playbook on a message with no WhatsApp row keeps the ticks that cannot send yet but is made only where a tick is held: email alone is kept, WhatsApp alone is refused in its words, the two together are kept", async () => {
  const visit = { trigger: "visit_tomorrow", params: [] };
  // A calendar is connected: a new reminder is made only where one is (D44).
  const check = (channels, message = EMAIL_VISIT(), id = EMAIL_V) =>
    checkPlaybook(fakes({ calendarOn: true, message }).ports, { ...visit, template_id: id, channels });
  const byEmail = await check(["email"]);
  assert.deepEqual([byEmail.template_id, byEmail.channels], [EMAIL_V, ["email"]]);
  await refused(check(["whatsapp"]), "conflict", 409, NO_WHATSAPP);
  // None named is WhatsApp alone, as every playbook went before.
  await refused(check(undefined), "conflict", 409, NO_WHATSAPP);
  // A tick that cannot send yet is kept beside one that can: the run holds WhatsApp's people (core run-playbook).
  const both = await check(["whatsapp", "email"]);
  assert.deepEqual([both.template_id, both.channels], [EMAIL_V, ["whatsapp", "email"]]);
  // No tick held says each one's reason, one after another.
  await refused(check(["whatsapp", "sms"]), "conflict", 409, `${NO_WHATSAPP} This message has no text version yet.`);
  assert.deepEqual((await check(["whatsapp"], IN_REVIEW([]), T1)).channels, ["whatsapp"]); // being checked: kept, alone too
  const refusedWords = messageOf({ whatsapp: template({ meta_status: "rejected", category: "utility" }) });
  await refused(check(["whatsapp"], refusedWords, T1), "conflict", 409, "WhatsApp asked for a change"); // a refusal is not
  const waiting = await check(["whatsapp", "email"], IN_REVIEW(), T1);
  assert.deepEqual([waiting.template_id, waiting.channels], [T1, ["whatsapp", "email"]]);
  // What a purpose never carries is a request that is wrong, and is said first: an offer by text.
  await refused(
    checkPlaybook(fakes({ message: messageOf({ whatsapp: null, own: ["email"], ownCategory: "marketing" }) }).ports, {
      trigger: "everyone_monthly",
      template_id: EMAIL_V,
      params: [],
      channels: ["sms"],
    }),
    "validation",
    400,
    "Texts carry no offers.",
  );
  // A message that is an offer is refused on a moment about a visit, as it is with a WhatsApp row (decision 7).
  await refused(
    checkPlaybook(fakes({ calendarOn: true, message: messageOf({ whatsapp: null, own: ["email"] }) }).ports, {
      ...visit,
      template_id: EMAIL_V,
      channels: ["email"],
    }),
    "validation",
    400,
    MESSAGE_MOMENT_WORDS.offer_on_texts,
  );
});

test("a booking-link slot needs a link on file, by one rule a message's values and a starter card both ask (core refuseWithoutBookingLink), and the link is read only where a slot asks for it", async () => {
  const { refuseWithoutBookingLink } = await importSrc("packages/core/src/campaigns/template-values.ts");
  let asked = 0;
  const ports = (link) => ({
    bookingLink: async () => {
      asked += 1;
      return link;
    },
  });
  await refused(
    refuseWithoutBookingLink(ports(null), [{ kind: "first_name" }, { kind: "booking_link" }]),
    "conflict",
    409,
    "This message takes the booking link, and none is on file. Add it in Settings › Hours & booking first.",
  );
  await refuseWithoutBookingLink(ports("https://example.com/book"), [{ kind: "booking_link" }]);
  asked = 0;
  await refuseWithoutBookingLink(ports(null), [{ kind: "first_name" }, { kind: "business_name" }]);
  assert.equal(asked, 0, "no slot for it, no read");
});

test("a review-link slot needs the workspace's review link (the owner's own, else its Google listing's): refused in TEMPLATE_VALUE_WORDS' words when the port answers none, filled with it when it answers one, and read only where a slot asks for it", async () => {
  const { getTemplateValues, TEMPLATE_VALUE_WORDS } = await importSrc("packages/core/src/campaigns/template-values.ts");
  const { resolveParams } = await importSrc("packages/contracts/src/campaigns/templates/params.ts");
  // The two ways to have one, as the booking link's refusal names its one.
  assert.equal(
    TEMPLATE_VALUE_WORDS.noReviewLink,
    "This message takes the review link, and none is on file. Add yours in Settings › Details, or connect your Google listing.",
  );
  const link = "https://example.com/review/harbor-studio";
  let asked = 0;
  const f = (reviewLink) =>
    fakes({
      message: messageOf({ whatsapp: template({ variables: ["1", "2"] }) }),
      reviewLink: () => {
        asked += 1;
        return reviewLink;
      },
    });
  const cmd = (params) => ({ templateId: T1, params, visits: false, proposal: false });

  await refused(
    getTemplateValues(f(null).ports, cmd(["@first_name", "@review_link"])),
    "conflict",
    409,
    TEMPLATE_VALUE_WORDS.noReviewLink,
  );
  // The same refusal reaches a person's broadcast, before anyone is counted.
  await refused(
    make(f(null), { template_id: T1, params: ["@first_name", "@review_link"], audience: everyone }),
    "conflict",
    409,
    TEMPLATE_VALUE_WORDS.noReviewLink,
  );

  const { specs } = await getTemplateValues(f(link).ports, cmd(["@first_name", { kind: "review_link" }]));
  assert.deepEqual(specs, [{ kind: "first_name" }, { kind: "review_link" }]);
  // Filled as the send fills it (core sendBroadcastBatch over the facts port).
  assert.deepEqual(
    resolveParams(specs, { firstName: "Dani", businessName: "Harbor Studio", bookingLink: null, reviewLink: link }),
    ["Dani", link],
  );
  const made = f(link);
  await make(made, { template_id: T1, params: ["@first_name", "@review_link"], audience: everyone });
  assert.deepEqual(made.of("assemble")[0][1].params, [{ kind: "first_name" }, { kind: "review_link" }]);

  asked = 0;
  await getTemplateValues(f(null).ports, cmd(["@first_name", "@business_name"]));
  assert.equal(asked, 0, "no slot for it, no read");
});
