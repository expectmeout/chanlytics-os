/**
 * A playbook's run: the batch's mode (decision 0064), who it reaches and in what order, never at 3 AM, a visit read
 * from the calendar, yesterday's visit thanked, and the touches it adds.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { PLAYBOOK_VETO_DELAY_MS, numberHealth, toPersonRowVM, touchesAfterRun } from "@chanlytics/contracts";
import {
  D,
  NOBODY_LEFT,
  NOW,
  TZ,
  cmd,
  context,
  dto,
  fakes,
  messageOf,
  onWhatsApp,
  person,
  playbook,
  runPlaybook,
  visit,
} from "./_run.mjs";

test("the batch's mode decides (decision 0064): new words wait for an OK whatever the mode; a mode it does not know asks; a person who asks has decided, it sends now", async () => {
  const fresh = fakes();
  const held = await runPlaybook(fresh.ports, cmd({ playbook: playbook({ words_ok_at: null }) }));
  assert.equal(held.outcome, "held", "a step whose words are new waits, though its sequence sends on its own");
  assert.equal(held.mode, "ask");
  assert.equal(fresh.of("assemble")[0][1].state, "pending_approval");
  assert.equal(fresh.of("assemble")[0][4], null, "a run that waits is made with no decision: its approval is one");
  for (const mode of [undefined, null, "never", "sometimes"]) {
    const unknown = fakes();
    const r = await runPlaybook(unknown.ports, cmd({ playbook: playbook({ mode }) }));
    assert.equal(r.outcome, "held", `a mode it does not know (${String(mode)}) asks`);
  }
  const asked = fakes();
  const r = await runPlaybook(
    asked.ports,
    cmd({ playbook: playbook({ mode: "ask" }), by: { kind: "user", userId: "u1" } }),
  );
  assert.deepEqual(
    r,
    {
      outcome: "sent",
      broadcast_id: "b1",
      eligible: 2,
      mode: "ask",
      state: "scheduled",
      scheduled_for: NOW.toISOString(),
      moved_from: null,
    },
    "a person's run now sends now under ask, and says when",
  );
  assert.deepEqual(asked.of("assemble")[0][3], NOW);
  assert.deepEqual(asked.of("assemble")[0][1].created_by, "u1", "their run");
  assert.deepEqual(
    asked.of("assemble")[0][4],
    {
      by: { kind: "user", userId: "u1" },
      payload: {
        playbook_id: "p1",
        playbook: "Win-back",
        mode: "ask",
        recipients: 2,
        channels: ["whatsapp"],
        scheduled_for: NOW.toISOString(),
        run_now: true,
      },
    },
    "and their decision, written with the run",
  );
  const newWords = fakes();
  const now = await runPlaybook(
    newWords.ports,
    cmd({ playbook: playbook({ words_ok_at: null }), by: { kind: "user", userId: "u1" } }),
  );
  assert.equal(now.outcome, "sent", "a person's run now sends a step's new words: it is their OK");
});

test("off before a single row: a template Meta withdrew, a flagged number, a run already made for the day (said once, not recorded twice), a visit playbook without its calendar", async () => {
  const withdrawn = fakes({ message: messageOf({ whatsapp: { meta_status: "rejected" } }) });
  assert.deepEqual(await runPlaybook(withdrawn.ports, cmd()), {
    outcome: "off",
    mode: "auto",
    skipped: "template_not_approved",
  });
  assert.deepEqual(withdrawn.ops(), ["record"]);
  const gone = fakes({ message: messageOf({ whatsapp: null }) });
  assert.equal((await runPlaybook(gone.ports, cmd())).skipped, "template_not_approved");
  const flagged = fakes();
  assert.deepEqual(
    await runPlaybook(
      flagged.ports,
      cmd({ ctx: context({ health: numberHealth({ quality: "RED", event: null, limit: "TIER_1K" }) }) }),
    ),
    { outcome: "off", mode: "auto", skipped: "number_flagged" },
  );
  assert.deepEqual(flagged.log[0][4], { run_for: "2026-09-06", by: "system", mode: "auto", skipped: "number_flagged" });
  const twice = fakes({ alreadyRan: true });
  assert.deepEqual(await runPlaybook(twice.ports, cmd()), {
    outcome: "off",
    mode: "auto",
    skipped: "already_ran_today",
  });
  assert.deepEqual(twice.ops(), [], "the day's run stands; nothing is recorded again");
  // No calendar connected is a final answer for the day: said, and recorded.
  const noCalendar = fakes();
  const p = playbook({ trigger: "visit_tomorrow", policy_class: "booking" });
  assert.deepEqual(await runPlaybook(noCalendar.ports, cmd({ playbook: p, ctx: context({ calendar: "none" }) })), {
    outcome: "off",
    mode: "auto",
    skipped: "no_calendar",
  });
  assert.deepEqual(noCalendar.ops(), ["record"]);
});

test("a calendar that could not be READ is the run failing, not the day done: nothing is recorded, so the next sweep asks again -- as a template that could not be read is", async () => {
  // Every moment that reads the calendar: the visit's two, and Lapsed's.
  for (const trigger of ["visit_tomorrow", "visited", "lapsed"]) {
    const blip = fakes();
    const p = playbook({ trigger, policy_class: trigger === "lapsed" ? "reengage" : "booking" });
    const ctx = context({ calendar: "unavailable" });
    assert.deepEqual(
      await runPlaybook(blip.ports, cmd({ playbook: p, ctx })),
      { outcome: "failed", error: "calendar: couldn't be read" },
      trigger,
    );
    assert.deepEqual(
      blip.ops(),
      [],
      `${trigger}: nothing recorded, so the day stays open and the next tick asks again`,
    );
  }
  // The same run, the calendar back: it goes, and the day is recorded as the run's own.
  const next = visit("2026-09-07T18:00:00Z", "Balayage");
  const row = toPersonRowVM(
    dto("a", { visits: { timezone: TZ, source: "calendar", state: "ok", next, last: null } }),
    TZ,
    NOW,
  );
  const back = fakes();
  const r = await runPlaybook(
    back.ports,
    cmd({
      playbook: playbook({ trigger: "visit_tomorrow", policy_class: "booking", params: [{ kind: "visit_when" }] }),
      ctx: context({
        calendar: "ok",
        people: [row],
        visits: new Map([["a", { timezone: TZ, source: "calendar", state: "ok", next, last: null }]]),
      }),
    }),
  );
  assert.equal(r.outcome, "sent");
  assert.deepEqual(back.ops(), ["assemble", "record"]);
});

test("a message that could not be read is the run failing, not the template withdrawn: nothing is recorded, so the next sweep asks again", async () => {
  const blip = fakes({ message: new Error("PostgREST blip") });
  assert.deepEqual(await runPlaybook(blip.ports, cmd()), { outcome: "failed", error: "template: PostgREST blip" });
  assert.deepEqual(blip.ops(), []);
});

test("who the run reaches: the trigger's list crossed with who said yes, longest-unheard first; the number's daily limit as a ceiling; nobody at all, recorded honestly", async () => {
  const rows = [
    person("a"),
    person("b", { lastContact: { ts: NOW.getTime() - 90 * D, label: "" } }),
    person("c", { consent: { state: "unknown", dnc: false } }),
    person("d", { state: "active", heardDays: 3 }),
  ];
  const { ports, of } = fakes();
  const r = await runPlaybook(ports, cmd({ ctx: context({ people: rows }) }));
  assert.equal(r.outcome, "sent");
  assert.deepEqual(of("assemble")[0][2], [
    { contact_id: "b", facts: null, channel: "whatsapp" },
    { contact_id: "a", facts: null, channel: "whatsapp" },
  ]);
  assert.equal(of("assemble")[0][1].recipient_count, 2);
  // And who it left out, kept on the run: three on the list, one of them never said yes.
  assert.deepEqual(of("assemble")[0][1].audience.reach, {
    ...NOBODY_LEFT,
    pool: 3,
    will: 2,
    noYes: 1,
    by_channel: onWhatsApp(2),
  });
  const capped = fakes();
  await runPlaybook(
    capped.ports,
    cmd({
      ctx: context({ people: rows, health: { canSend: true, tone: "ok", label: "", limitPerDay: 1, refusal: null } }),
    }),
  );
  assert.deepEqual(
    capped.of("assemble")[0][2].map((x) => x.contact_id),
    ["b"],
    "the day's limit is a ceiling, not a refusal",
  );
  assert.deepEqual(
    capped.of("assemble")[0][1].audience.reach,
    { ...NOBODY_LEFT, pool: 3, will: 1, noYes: 1, overLimit: 1, by_channel: onWhatsApp(1) },
    "and the one past it is counted, not dropped",
  );
  const nobody = fakes();
  assert.deepEqual(
    await runPlaybook(
      nobody.ports,
      cmd({ ctx: context({ people: [person("d", { state: "active", heardDays: 3 })] }) }),
    ),
    { outcome: "empty", eligible: 0, mode: "auto" },
  );
  assert.deepEqual(nobody.log, [
    [
      "record",
      "p1",
      "2026-09-06",
      NOW,
      { run_for: "2026-09-06", by: "system", mode: "auto", eligible: 0, reach: NOBODY_LEFT },
    ],
  ]);
});

test("the week's breath holds a moment's person by a message within a week either side of the run: queued on a broadcast due in three days they wait, due in twenty-five days they get today's message", async () => {
  const rows = [person("a"), person("b"), person("c")];
  const touches = {
    byThis: new Map(),
    byAny: new Map([
      ["a", NOW.getTime() + 3 * D],
      ["b", NOW.getTime() + 25 * D],
      ["c", NOW.getTime() - 2 * D],
    ]),
  };
  const { ports, of } = fakes();
  await runPlaybook(ports, cmd({ ctx: context({ people: rows, touches }) }));
  assert.deepEqual(
    of("assemble")[0][2].map((x) => x.contact_id),
    ["b"],
    "three days ahead and two days ago are within a week of today; twenty-five days ahead is not",
  );
  assert.equal(of("assemble")[0][1].audience.reach.heardAny, 2);
});

test("a run counts everyone its moment named, each once, under the first rule that left them out -- so the counts add up to the list", async () => {
  const quiet = (id, daysAgo, over = {}) =>
    person(id, { lastContact: { ts: NOW.getTime() - daysAgo * D, label: "" }, ...over });
  const rows = [
    quiet("a", 90),
    quiet("b", 80, { phone: null }),
    quiet("c", 80, { consent: { state: "opted_in", dnc: true, marketing: "opted_in" } }),
    quiet("d", 80, { consent: { state: "opted_in", dnc: false, marketing: "unknown" } }),
    quiet("e", 80),
    quiet("f", 80),
    quiet("g", 60),
    quiet("h", 45),
    // No number AND no yes: counted once, under the first rule the run applies.
    quiet("i", 80, { phone: null, consent: { state: "unknown", dnc: false, marketing: "unknown" } }),
    person("j", { state: "active", heardDays: 3 }),
  ];
  const touches = {
    byThis: new Map([["p1", new Map([["e", NOW.getTime() - 10 * D]])]]),
    byAny: new Map([["f", NOW.getTime() - 2 * D]]),
  };
  const { ports, of } = fakes();
  await runPlaybook(ports, cmd({ playbook: playbook({ cap_per_run: 2 }), ctx: context({ people: rows, touches }) }));
  const reach = of("assemble")[0][1].audience.reach;
  assert.deepEqual(reach, {
    pool: 9,
    will: 2,
    noNumber: 2,
    stopped: 1,
    noYes: 1,
    heardThis: 1,
    heardAny: 1,
    overCap: 1,
    overLimit: 0,
    no_address: 0,
    address_stopped: 0,
    no_channel: 0,
    by_channel: onWhatsApp(2),
  });
  assert.equal(
    reach.will +
      reach.noNumber +
      reach.stopped +
      reach.noYes +
      reach.heardThis +
      reach.heardAny +
      reach.overCap +
      reach.overLimit,
    reach.pool,
    "the whole list, every person once",
  );
  assert.deepEqual(
    of("assemble")[0][2].map((x) => x.contact_id),
    ["a", "g"],
    "and who it reaches is what it always was: the longest unheard, to the cap",
  );
});

test("auto: the row, the people, the send now, the system's decision, the run recorded; veto: the send half an hour ahead with the same row", async () => {
  const { ports, log, of, ops } = fakes();
  const r = await runPlaybook(ports, cmd());
  assert.deepEqual(r, {
    outcome: "sent",
    broadcast_id: "b1",
    eligible: 2,
    mode: "auto",
    state: "scheduled",
    scheduled_for: NOW.toISOString(),
    moved_from: null,
  });
  assert.deepEqual(ops(), ["assemble", "record"]);
  assert.deepEqual(of("assemble")[0][1], {
    name: "Win-back · 2026-09-06",
    template_id: "tpl-1",
    template_name: "winback_offer",
    template_language: "en_US",
    params: [{ kind: "first_name" }],
    audience: {
      kind: "playbook",
      id: "p1",
      label: "Win-back",
      // The moment, which the month's allowance asks at the wire: a visit's message is never held by it.
      trigger: "quiet_30",
      reach: { ...NOBODY_LEFT, pool: 2, will: 2, by_channel: onWhatsApp(2) },
    },
    state: "scheduled",
    scheduled_for: NOW.toISOString(),
    recipient_count: 2,
    created_by: "owner",
    playbook_id: "p1",
    run_for: "2026-09-06",
    channels: ["whatsapp"],
  });
  assert.deepEqual(of("assemble")[0][3], NOW);
  assert.deepEqual(of("assemble")[0][4], {
    by: { kind: "system" },
    payload: {
      playbook_id: "p1",
      playbook: "Win-back",
      mode: "auto",
      recipients: 2,
      channels: ["whatsapp"],
      scheduled_for: NOW.toISOString(),
      run_now: false,
    },
  });
  assert.deepEqual(log.at(-1), [
    "record",
    "p1",
    "2026-09-06",
    NOW,
    {
      run_for: "2026-09-06",
      by: "system",
      mode: "auto",
      eligible: 2,
      reach: { ...NOBODY_LEFT, pool: 2, will: 2, by_channel: onWhatsApp(2) },
      broadcast_id: "b1",
      state: "scheduled",
    },
  ]);
  const veto = fakes();
  await runPlaybook(veto.ports, cmd({ playbook: playbook({ mode: "veto" }) }));
  const at = new Date(NOW.getTime() + PLAYBOOK_VETO_DELAY_MS);
  assert.deepEqual(veto.of("assemble")[0][3], at);
  assert.equal(veto.of("assemble")[0][1].scheduled_for, at.toISOString());
  // "Unless you stop it" is kept only for someone who is told: a run the sweep made under veto says it is on its way,
  // and when, by the business's clock. Until this nobody was told unless Campaigns happened to be open.
  assert.deepEqual(veto.ops(), ["assemble", "notify", "record"]);
  assert.deepEqual(veto.of("notify")[0].slice(1), [
    "Campaign “Win-back” sends today 10:30 AM: 2 people",
    "2 people will be sent “Win-back”. Goes today 10:30 AM unless you stop it, from Today or its run.",
    // The run it is about: the bell's row and the phone open that run, where Stop is (it named none, and opened Campaigns' home).
    "b1",
  ]);
  // Made past the day's hours, it goes at nine tomorrow, and the notice says which day: "9:00 AM" alone reads as gone.
  const late = fakes();
  await runPlaybook(
    late.ports,
    cmd({ playbook: playbook({ mode: "veto" }), ctx: context({ now: new Date("2026-09-07T01:00:00Z") }) }),
  );
  assert.equal(late.of("notify")[0][1], "Campaign “Win-back” sends tomorrow 9:00 AM: 2 people");
  // The run is made and on the ledger: a bell that fails does not cost the run its record.
  const deaf = fakes({ notify: new Error("the bell is down") });
  const made = await runPlaybook(deaf.ports, cmd({ playbook: playbook({ mode: "veto" }) }));
  assert.equal(made.outcome, "sent");
  assert.ok(deaf.ops().includes("record"), "the run is recorded all the same");
  // A run that goes at once has nothing to stop, and a person who asked for a run decided it: neither is told.
  assert.ok(!ops().includes("notify"), "auto says nothing on the bell");
  const asked = fakes();
  await runPlaybook(asked.ports, cmd({ playbook: playbook({ mode: "veto" }), by: { kind: "user", userId: "u1" } }));
  assert.ok(!asked.ops().includes("notify"), "a person's own Run now is theirs");
});

test("never at 3 AM, whoever asks: a person's run now at eleven at night goes at nine, and the ledger says what was asked for", async () => {
  const night = new Date("2026-09-07T03:00:00Z"); // 23:00 in New York
  const nine = new Date("2026-09-07T13:00:00Z");
  const f = fakes();
  const r = await runPlaybook(f.ports, cmd({ ctx: context({ now: night }), by: { kind: "user", userId: "u1" } }));
  assert.equal(r.outcome, "sent");
  assert.deepEqual(f.of("assemble")[0][3], nine);
  assert.equal(f.of("assemble")[0][1].scheduled_for, nine.toISOString(), "the row says when it really goes");
  assert.equal(f.of("assemble")[0][4].payload.scheduled_for, nine.toISOString());
  assert.equal(
    f.of("assemble")[0][4].payload.moved_from,
    night.toISOString(),
    "and the ledger keeps what was asked for",
  );
  assert.equal(f.log.at(-1)[4].moved_from, night.toISOString());
  assert.deepEqual(
    [r.scheduled_for, r.moved_from],
    [nine.toISOString(), night.toISOString()],
    "and the person who asked is told when it really goes, and what they asked for",
  );
  const day = fakes();
  await runPlaybook(day.ports, cmd({ by: { kind: "user", userId: "u1" } }));
  assert.ok(!("moved_from" in day.of("assemble")[0][4].payload), "inside the hours nothing moves, and nothing says so");
});

test("ask: the row waits, nobody is scheduled, the owner is told in these words, the run recorded", async () => {
  const { ports, of, ops } = fakes();
  const r = await runPlaybook(ports, cmd({ playbook: playbook({ mode: "ask" }) }));
  assert.deepEqual(r, { outcome: "held", broadcast_id: "b1", eligible: 2, mode: "ask", state: "pending_approval" });
  assert.deepEqual(ops(), ["assemble", "notify", "record"]);
  assert.equal(of("assemble")[0][3], null, "a run that waits for a person has no job yet");
  assert.equal(of("assemble")[0][1].state, "pending_approval");
  assert.equal(of("assemble")[0][1].scheduled_for, NOW.toISOString());
  assert.deepEqual(of("notify")[0], [
    "notify",
    "Campaign “Win-back” is ready: 2 people",
    "2 people have become eligible for “Win-back”: approve or skip it from your Inbox or Today. Waits for you to approve until the end of its day. Then it's skipped, and you're told.",
    // The run that waits: the row opens it, where Approve and Skip are.
    "b1",
  ]);
  const one = fakes();
  await runPlaybook(one.ports, cmd({ playbook: playbook({ mode: "ask" }), ctx: context({ people: [person("a")] }) }));
  assert.equal(one.of("notify")[0][1], "Campaign “Win-back” is ready: 1 person");
  assert.match(one.of("notify")[0][2], /^1 person has become eligible/);
});

test("REGRESSION: a reminder whose words are new waits for an OK even under Send it, and its owner was told it waits until its day ends, when it is skipped at 21:00 and reaches nobody: the notice says so, by the visit's wait rule", async () => {
  const next = visit("2026-09-07T18:00:00Z", "Cut"); // tomorrow, 2:00 PM in New York
  const read = { timezone: TZ, source: "calendar", state: "ok", next, last: null };
  const { ports, of } = fakes();
  const r = await runPlaybook(
    ports,
    cmd({
      playbook: playbook({
        name: "Appointment reminder",
        trigger: "visit_tomorrow",
        policy_class: "booking",
        mode: "auto",
        words_ok_at: null,
      }),
      ctx: context({
        calendar: "ok",
        people: [toPersonRowVM(dto("a", { visits: read }), TZ, NOW)],
        visits: new Map([["a", read]]),
      }),
    }),
  );
  assert.equal(r.outcome, "held");
  assert.deepEqual(of("notify")[0], [
    "notify",
    "Campaign “Appointment reminder” is ready: 1 person",
    "1 person has become eligible for “Appointment reminder”: approve or skip it from your Inbox or Today. Goes only if you approve it before 21:00 by your clock. After that it's skipped and doesn't reach them.",
    "b1",
  ]);
});

test("a visit run keeps each person's words on their row, from the visit the run read", async () => {
  const next = visit("2026-09-07T18:00:00Z", "Balayage"); // tomorrow, 2:00 PM in New York
  const row = toPersonRowVM(
    dto("a", { visits: { timezone: TZ, source: "calendar", state: "ok", next, last: null } }),
    TZ,
    NOW,
  );
  const { ports, of } = fakes();
  const r = await runPlaybook(
    ports,
    cmd({
      playbook: playbook({
        trigger: "visit_tomorrow",
        policy_class: "booking",
        template_name: "visit_reminder",
        params: [{ kind: "first_name" }, { kind: "visit_when" }, { kind: "visit_service" }],
      }),
      ctx: context({
        calendar: "ok",
        people: [row],
        visits: new Map([["a", { timezone: TZ, source: "calendar", state: "ok", next, last: null }]]),
      }),
    }),
  );
  assert.equal(r.outcome, "sent");
  assert.deepEqual(of("assemble")[0][2], [
    {
      contact_id: "a",
      facts: { visit_when: "tomorrow at 2:00 PM", visit_service: "Balayage" },
      channel: "whatsapp",
    },
  ]);
});

test("a visit read from the calendar keeps its appointment's key, its start and when the run read it on the row (decision 0002), so the send can ask whether it still stands; a visit with no key keeps the words alone", async () => {
  const next = { ...visit("2026-09-07T18:00:00Z", "Balayage"), key: "evt-1:1788804000000" };
  const read = { timezone: TZ, source: "calendar", state: "ok", next, last: null };
  const row = toPersonRowVM(dto("a", { visits: read }), TZ, NOW);
  const { ports, of } = fakes();
  const r = await runPlaybook(
    ports,
    cmd({
      playbook: playbook({
        trigger: "visit_tomorrow",
        policy_class: "booking",
        template_name: "visit_reminder",
        params: [{ kind: "visit_when" }, { kind: "visit_service" }],
      }),
      ctx: context({
        calendar: "ok",
        people: [row],
        visits: new Map([["a", read]]),
      }),
    }),
  );
  assert.equal(r.outcome, "sent");
  assert.deepEqual(of("assemble")[0][2][0].facts, {
    visit_when: "tomorrow at 2:00 PM",
    visit_service: "Balayage",
    appointment: "evt-1:1788804000000",
    visit_start: "2026-09-07T18:00:00Z",
    appointment_read_at: NOW.toISOString(),
  });
});

test("a person with a visit later today and another tomorrow is reminded of TOMORROW's: the run reads the visit on its day, not the next one (wiring review P2 14)", async () => {
  // Their next visit is today's, at 4 PM: "the next visit is tomorrow" was false, and tomorrow's reminder never went.
  const today = visit("2026-09-06T20:00:00Z", "Cut"); // today, 4:00 PM in New York
  const tomorrow = visit("2026-09-07T18:00:00Z", "Balayage"); // tomorrow, 2:00 PM
  const read = { timezone: TZ, source: "calendar", state: "ok", next: today, last: null, near: [today, tomorrow] };
  const row = toPersonRowVM(dto("a", { visits: read }), TZ, NOW);
  assert.deepEqual(
    row.visitDays.map((d) => d.date),
    ["2026-09-06", "2026-09-07"],
    "the row carries the day of each visit near today",
  );
  const { ports, of } = fakes();
  const r = await runPlaybook(
    ports,
    cmd({
      playbook: playbook({
        trigger: "visit_tomorrow",
        policy_class: "booking",
        template_name: "visit_reminder",
        params: [{ kind: "visit_when" }, { kind: "visit_service" }],
      }),
      ctx: context({
        calendar: "ok",
        people: [row],
        visits: new Map([["a", read]]),
      }),
    }),
  );
  assert.equal(r.outcome, "sent", "REGRESSION: nobody was named, the next visit being today's");
  assert.deepEqual(
    of("assemble")[0][2].map((x) => [x.contact_id, x.facts]),
    [["a", { visit_when: "tomorrow at 2:00 PM", visit_service: "Balayage" }]],
    "the words are tomorrow's visit, never today's",
  );

  // A read made before the calendar kept the near visits has the next and the last only, and is read as it always was:
  // today's next visit names nobody for tomorrow.
  const old = { timezone: TZ, source: "calendar", state: "ok", next: today, last: null };
  const before = fakes();
  const r2 = await runPlaybook(
    before.ports,
    cmd({
      playbook: playbook({
        trigger: "visit_tomorrow",
        policy_class: "booking",
        template_name: "visit_reminder",
        params: [{ kind: "visit_when" }, { kind: "visit_service" }],
      }),
      ctx: context({
        calendar: "ok",
        people: [toPersonRowVM(dto("a", { visits: old }), TZ, NOW)],
        visits: new Map([["a", old]]),
      }),
    }),
  );
  assert.notEqual(r2.outcome, "sent");
  assert.deepEqual(before.of("assemble"), [], "nobody named, as before");
});

test("a second reminder on the same moment names nobody its twin reminded for this visit: the run reads its twins' touches (the phone review, 16 Oct 2026)", async () => {
  const tomorrow = (h) => visit(`2026-09-07T${h}:00:00Z`, "Cut");
  const readOf = (v) => ({ timezone: TZ, source: "calendar", state: "ok", next: v, last: null, near: [v] });
  const reads = new Map([
    ["a", readOf(tomorrow("18"))],
    ["b", readOf(tomorrow("19"))],
  ]);
  const people = [...reads].map(([id, read]) => toPersonRowVM(dto(id, { visits: read }), TZ, NOW));
  const reminder = playbook({
    trigger: "visit_tomorrow",
    policy_class: "booking",
    template_name: "visit_reminder",
    params: [{ kind: "visit_when" }],
  });
  // The twin, "p0", reminded a an hour ago for this same visit.
  const touches = { byThis: new Map([["p0", new Map([["a", NOW.getTime() - 3_600_000]])]]), byAny: new Map() };
  const run = async (twinsOf) => {
    const f = fakes();
    await runPlaybook(
      f.ports,
      cmd({
        playbook: reminder,
        ctx: context({
          calendar: "ok",
          people,
          visits: reads,
          touches,
          ...(twinsOf ? { twinsOf } : {}),
        }),
      }),
    );
    return f.of("assemble")[0][2].map((x) => x.contact_id);
  };
  const asked = [];
  assert.deepEqual(
    await run((stepId, trigger) => {
      asked.push([stepId, trigger]);
      return ["p0"];
    }),
    ["b"],
    "a was reminded for this visit by the twin",
  );
  assert.deepEqual(asked, [["p1", "visit_tomorrow"]], "the run asks for the twins of its own moment");
  assert.deepEqual((await run(null)).sort(), ["a", "b"], "a runtime that names no twins reaches both, as before");
});

test("two visits tomorrow, the first found by name alone and not surely theirs: the run names them for the second, and its words are the second's", async () => {
  // A person saved as "Maria" (a first name alone): an event titled "Maria Lopez" is found by name and is a guess, so it
  // never names them; their own visit, found by their number, does. The words were the first visit's of the day, the
  // guess included.
  const guess = { ...visit("2026-09-07T14:00:00Z", "Maria Lopez · Balayage"), via: "name" }; // 10:00 AM
  const theirs = visit("2026-09-07T19:00:00Z", "Trim"); // 3:00 PM, by their number
  const read = { timezone: TZ, source: "calendar", state: "ok", next: guess, last: null, near: [guess, theirs] };
  const row = toPersonRowVM(dto("a", { display_name: "Maria", visits: read }), TZ, NOW);
  const { ports, of } = fakes();
  const r = await runPlaybook(
    ports,
    cmd({
      playbook: playbook({
        trigger: "visit_tomorrow",
        policy_class: "booking",
        template_name: "visit_reminder",
        params: [{ kind: "visit_when" }, { kind: "visit_service" }],
      }),
      ctx: context({
        calendar: "ok",
        people: [row],
        visits: new Map([["a", read]]),
      }),
    }),
  );
  assert.equal(r.outcome, "sent");
  assert.deepEqual(
    of("assemble")[0][2].map((x) => x.facts),
    [{ visit_when: "tomorrow at 3:00 PM", visit_service: "Trim" }],
    "REGRESSION: the words named the other Maria's 10:00 Balayage",
  );
  // With only the guess that day, nobody is named.
  const alone = { ...read, next: guess, near: [guess] };
  const none = fakes();
  await runPlaybook(
    none.ports,
    cmd({
      playbook: playbook({
        trigger: "visit_tomorrow",
        policy_class: "booking",
        template_name: "visit_reminder",
        params: [{ kind: "visit_when" }],
      }),
      ctx: context({
        calendar: "ok",
        people: [toPersonRowVM(dto("a", { display_name: "Maria", visits: alone }), TZ, NOW)],
        visits: new Map([["a", alone]]),
      }),
    }),
  );
  assert.deepEqual(none.of("assemble"), []);
});

test("a person seen yesterday and again this morning is thanked for YESTERDAY's visit: the latest visit alone is today's", async () => {
  const yesterday = { ...visit("2026-09-05T15:00:00Z", "Balayage"), said: "kept" }; // yesterday, 11:00 AM, kept
  const thisMorning = visit("2026-09-06T12:00:00Z", "Trim"); // today, 8:00 AM, over by now
  const read = {
    timezone: TZ,
    source: "calendar",
    state: "ok",
    next: null,
    last: thisMorning,
    near: [yesterday, thisMorning],
  };
  const row = toPersonRowVM(dto("a", { visits: read }), TZ, NOW);
  const { ports, of } = fakes();
  const r = await runPlaybook(
    ports,
    cmd({
      playbook: playbook({ trigger: "visited", policy_class: "booking", params: [{ kind: "visit_service" }] }),
      ctx: context({
        calendar: "ok",
        people: [row],
        visits: new Map([["a", read]]),
      }),
    }),
  );
  assert.equal(r.outcome, "sent", "REGRESSION: the thank-you was never sent, the latest visit being this morning's");
  assert.deepEqual(
    of("assemble")[0][2].map((x) => x.facts),
    [{ visit_when: "yesterday", visit_service: "Balayage" }],
    "yesterday's service",
  );
});

test("a visit's service slot carries the service alone: the person's name comes out of the event's title, and a title that was only their name says \"your appointment\"", async () => {
  const run = async (title, over = {}) => {
    const next = visit("2026-09-07T18:00:00Z", title);
    const row = toPersonRowVM(
      dto("a", {
        display_name: "Maria Lopez",
        visits: { timezone: TZ, source: "calendar", state: "ok", next, last: null },
        ...over,
      }),
      TZ,
      NOW,
    );
    const { ports, of } = fakes();
    const r = await runPlaybook(
      ports,
      cmd({
        playbook: playbook({
          trigger: "visit_tomorrow",
          policy_class: "booking",
          template_name: "visit_reminder",
          params: [{ kind: "visit_when" }, { kind: "visit_service" }],
        }),
        ctx: context({
          calendar: "ok",
          people: [row],
          visits: new Map([["a", { timezone: TZ, source: "calendar", state: "ok", next, last: null }]]),
        }),
      }),
    );
    assert.equal(r.outcome, "sent", title);
    return of("assemble")[0][2][0].facts;
  };
  assert.deepEqual(await run("Balayage · Maria Lopez"), {
    visit_when: "tomorrow at 2:00 PM",
    visit_service: "Balayage",
  });
  assert.equal((await run("Maria Lopez - Balayage")).visit_service, "Balayage");
  assert.equal((await run("Haircut with Maria Lopez")).visit_service, "Haircut");
  assert.equal((await run("Maria Lopez")).visit_service, "your appointment", "nothing left: no service words at all");
  assert.equal((await run("Balayage")).visit_service, "Balayage", "a title without a name is the service as it stands");
  // By their WhatsApp name, when no human gave one: the calendar matched it by that name, so that is the name that comes out.
  assert.equal(
    (await run("Gloss · Mari Lopez", { display_name: null, wa_profile_name: "Mari Lopez" })).visit_service,
    "Gloss",
  );
});

test("the people a run enrols are touched for the next run against the same read of the workspace: the week's breath holds between two moments in one hour", async () => {
  // The sweep reads the workspace once and runs every due playbook against it; its touches never changed between the runs,
  // so a second moment judged the breath from a snapshot that did not have the first one's people in it.
  const ctx = context({ people: [person("a"), person("b")] });
  const first = fakes();
  const one = await runPlaybook(first.ports, cmd({ playbook: playbook({ id: "p1" }), ctx }));
  assert.deepEqual([one.outcome, one.eligible], ["sent", 2]);
  // The same two people, the same morning, another moment: the week's breath holds them.
  const second = fakes();
  const two = await runPlaybook(second.ports, cmd({ playbook: playbook({ id: "p2", name: "Lapsed" }), ctx }));
  assert.deepEqual(two, { outcome: "empty", eligible: 0, mode: "auto" });
  assert.equal(second.of("record")[0][4].reach.heardAny, 2, "left out for the breath, and counted so");
  assert.deepEqual(second.ops(), ["record"], "nobody enrolled: no run, no job");
  // At the moment the first run goes, by any playbook and by the first.
  assert.deepEqual(
    [...ctx.touches.byAny],
    [
      ["a", NOW.getTime()],
      ["b", NOW.getTime()],
    ],
  );
  assert.deepEqual(
    [...ctx.touches.byThis.get("p1")],
    [
      ["a", NOW.getTime()],
      ["b", NOW.getTime()],
    ],
  );
  assert.deepEqual([...ctx.touches.followUps], [], "not a proposal's follow-up");
  // A reminder for a visit is owed whatever else they heard (the run is daily and a visit is on one day): still reaches them.
  const next = visit("2026-09-07T18:00:00Z", "Balayage");
  const rows = ["a", "b"].map((id) =>
    toPersonRowVM(dto(id, { visits: { timezone: TZ, source: "calendar", state: "ok", next, last: null } }), TZ, NOW),
  );
  const reminder = fakes();
  const visitCtx = {
    ...ctx,
    people: rows,
    calendar: "ok",
    visits: new Map(rows.map((r) => [r.id, { timezone: TZ, source: "calendar", state: "ok", next, last: null }])),
  };
  const r = await runPlaybook(
    reminder.ports,
    cmd({ playbook: playbook({ id: "p3", trigger: "visit_tomorrow", policy_class: "booking" }), ctx: visitCtx }),
  );
  assert.deepEqual([r.outcome, r.eligible], ["sent", 2]);
});

test("a run that was not made touches nobody, and one made to wait for a person touches its people from the moment it was made", async () => {
  // A run that failed to be assembled enrolled nobody: its people are free for the next playbook, and for tomorrow.
  const failedCtx = context({ people: [person("a")] });
  const failed = await runPlaybook(fakes({ assemble: new Error("insert refused") }).ports, cmd({ ctx: failedCtx }));
  assert.equal(failed.outcome, "failed");
  assert.deepEqual([...failedCtx.touches.byAny], []);
  // Ask mode: the run waits for a person, and its people are enrolled all the same.
  const askCtx = context({ people: [person("a")] });
  const asked = await runPlaybook(fakes().ports, cmd({ playbook: playbook({ mode: "ask" }), ctx: askCtx }));
  assert.equal(asked.outcome, "held");
  assert.deepEqual([...askCtx.touches.byAny], [["a", NOW.getTime()]]);
});

test("the touches a run adds are new maps, the latest touch stands, and only a proposal's follow-up is one, kept by what it was about (0029)", () => {
  const SEO = "https://example.com/p/seo";
  const given = { byThis: new Map(), byAny: new Map(), followUps: new Map(), followUpKeys: new Map() };
  const after = touchesAfterRun(given, { playbookId: "pf", at: 5, followUp: true }, [
    { id: "a", deal: "d-seo", link: SEO },
    { id: "b", deal: null, link: SEO },
    { id: "c", deal: null, link: null },
  ]);
  assert.deepEqual(
    [...after.followUps],
    [
      ["a", 5],
      ["b", 5],
      ["c", 5],
    ],
  );
  assert.deepEqual(
    [...after.followUpKeys].map(([id, m]) => [id, [...m]]),
    [
      ["a", [["deal:d-seo", 5]]],
      ["b", [[`link:${SEO}`, 5]]],
      ["c", [["bare", 5]]],
    ],
    "by the deal it was about, else its link, else nothing kept",
  );
  assert.deepEqual(
    [...given.byAny, ...given.followUps, ...given.byThis, ...given.followUpKeys],
    [],
    "the touches handed in are left as they were",
  );
  const earlier = touchesAfterRun(after, { playbookId: "pf", at: 3, followUp: true }, [
    { id: "a", deal: "d-seo", link: SEO },
  ]);
  assert.deepEqual(
    [...earlier.byAny],
    [
      ["a", 5],
      ["b", 5],
      ["c", 5],
    ],
  );
  assert.equal(earlier.followUpKeys.get("a")?.get("deal:d-seo"), 5, "the latest stands, by what it was about too");
  assert.notEqual(earlier.followUpKeys.get("a"), after.followUpKeys.get("a"), "a person's keys are a new map too");
  const other = touchesAfterRun(given, { playbookId: "pg", at: 5, followUp: false }, [
    { id: "a", deal: "d-seo", link: SEO },
  ]);
  assert.deepEqual([...other.followUps, ...other.followUpKeys], [], "a run that follows nothing up keeps neither");
});

test('a reminder run asked for at night goes at nine and says "today": the words are relative to the moment the send goes; every visit is reminded, whatever the cap', async () => {
  const night = new Date("2026-09-07T03:00:00Z"); // 23:00 in New York, September 6
  const next = visit("2026-09-07T18:00:00Z", "Balayage"); // September 7, 2:00 PM in New York: tomorrow at eleven, today at nine
  const visits = new Map(
    ["a", "b", "c"].map((id) => [id, { timezone: TZ, source: "calendar", state: "ok", next, last: null }]),
  );
  const rows = ["a", "b", "c"].map((id) => toPersonRowVM(dto(id, { visits: visits.get(id) }), TZ, night));
  const f = fakes();
  const r = await runPlaybook(
    f.ports,
    cmd({
      playbook: playbook({
        trigger: "visit_tomorrow",
        policy_class: "booking",
        template_name: "visit_reminder",
        params: [{ kind: "visit_when" }, { kind: "visit_service" }],
        cap_per_run: 1,
      }),
      ctx: context({ now: night, calendar: "ok", people: rows, visits }),
      by: { kind: "user", userId: "u1" },
    }),
  );
  assert.equal(r.outcome, "sent");
  assert.equal(r.eligible, 3, "the cap is for offers: all three are reminded");
  assert.equal(r.moved_from, night.toISOString());
  assert.deepEqual(
    f.of("assemble")[0][2].map((e) => e.facts.visit_when),
    ["today at 2:00 PM", "today at 2:00 PM", "today at 2:00 PM"],
    "read at nine, the visit is today",
  );
});

test("a run that could not be written says so and stops: the run, its people and its job are one write, so nothing is left to fail and no decision is made", async () => {
  // They were three writes with a compensating fail between them; the transaction is proved against Postgres
  // (broadcasts/assemble-broadcast.db.test.mjs).
  const refused = fakes({ assemble: new Error("insert refused") });
  assert.deepEqual(await runPlaybook(refused.ports, cmd()), { outcome: "failed", error: "insert refused" });
  assert.deepEqual(refused.ops(), ["assemble"], "no decision, no notice, no record of a run that is not there");
});
