/**
 * 00403 on a real Postgres: campaign_answers, a yes or a stop after a campaign as the answer to its run, and
 * campaign_series, which counts these (a person once a period and answer) where it counted the whole ledger by the day.
 *
 * The rule is said once in TypeScript (contracts broadcasts/run-answers.ts, `answersToRuns`) and restated in SQL
 * (`public.campaign_answers`); the first test runs both over one world of thirty-five people (_answers-world.mjs) and
 * holds them equal on every edge that rule names: the 72 hours, a key that names a send and one that does not, the people
 * who are not live, the answers that are not one, a tie. The later ones prove the window's edge, the caller's rights, the
 * Home's numbers, the period's first instant in a workspace that is not UTC, and the millisecond. Each test builds its
 * own world under its own workspace and removes it. Runs against the database `supabase start` builds on this machine,
 * never production.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { answersToRuns, toCampaignReportVM } from "@chanlytics/contracts";
import {
  A,
  ANON,
  ANSWER,
  CURRENT,
  DAY,
  EMAIL_OFFERS,
  HOUR,
  REPLY_WINDOW,
  SECOND,
  SINCE,
  UNTIL,
  URL_,
  answersOf,
  broadcast,
  buildWorld,
  cleanup,
  consentRow,
  contactRow,
  conversationRow,
  dayAt,
  dayFrom,
  db,
  insert,
  iso,
  localAt,
  member,
  messageRow,
  ok,
  pairsOf,
  readWorld,
  recipientRow,
  sentAgain,
  sentTo,
  seriesOf,
  skip,
  skipMembers,
  stamp,
  template,
  total,
  workspace,
  ymd,
} from "./_answers-world.mjs";

after(cleanup);

test("what the SQL and the TypeScript rule say of one world is the same", { skip }, async () => {
  const world = await buildWorld();
  const { w, key, expected } = world;
  const { sends, events } = await readWorld(w);
  const rule = answersToRuns(sends, events);
  assert.deepEqual(
    rule.map((a) => key(a.runId, a.contactId, a.eventId, a.consent, a.purpose, a.exact)).sort(),
    expected.map((x) => x.key).sort(),
    "the rule says of the world what its people are owed",
  );

  const windows = [
    [SINCE, UNTIL, "the fourteen days campaign_series reads"],
    [
      A - HOUR,
      A + 3 * HOUR,
      "the first three hours of run A: what a later event, by the clock or by a key, takes away",
    ],
    [A + REPLY_WINDOW, A + REPLY_WINDOW + SECOND, "the last instant of the window, and no other"],
    [A + REPLY_WINDOW - SECOND, A + REPLY_WINDOW, "the second before it, whose end is not in it"],
    [A + 4 * HOUR, A + 4 * HOUR, "an empty window"],
  ];
  for (const [since, until, why] of windows) {
    const inside = (at) => at >= since && at < until;
    const sql = (await answersOf(w, since, until)).map((r) =>
      key(r.broadcast_id, r.contact_id, r.event_id, r.consent, r.purpose, r.exact),
    );
    const ts = rule
      .filter((a) => inside(Date.parse(a.at)))
      .map((a) => key(a.runId, a.contactId, a.eventId, a.consent, a.purpose, a.exact));
    const spelled = expected.filter((x) => inside(x.at)).map((x) => x.key);
    assert.deepEqual(sql.sort(), ts.sort(), `${why}: the SQL says what the rule says`);
    assert.deepEqual(sql.sort(), spelled.sort(), `${why}: and what the people above are owed`);
  }

  // The whole window, person by person: the answers that stand and the people who have none.
  const rows = await answersOf(w, SINCE, UNTIL);
  for (const r of rows) {
    assert.equal(Date.parse(r.at), world.names.at.get(r.event_id), "the row says when the event came");
  }
  const answered = new Set(rows.map((r) => world.names.person.get(r.contact_id)));
  const none = Object.keys(world.spec).filter((p) => !answered.has(p));
  assert.deepEqual(
    none.sort(),
    ["P10", "P13", "P17", "P18", "P2", "P21", "P22", "P23", "P31", "P32", "P33", "P5", "P7", "P8", "P9"],
    "no answer: late, not reached by email, not live, a key that finds no send, a merge, a stop, at the send, not a send",
  );
  assert.equal(rows.length, 23, "twenty-three answers: one a run and a person, a person on two runs twice");
});

test(
  "campaign_series counts a person once a period and answer, on the day of the earliest, and its yeses and stops are inside People's",
  { skip },
  async () => {
    const world = await buildWorld();
    const { w } = world;
    const report = await seriesOf(w);
    assert.equal(report.series.length, 14);
    const previous = report.series.slice(0, 7);
    const current = report.series.slice(7);
    assert.equal(report.series[7].day, ymd(CURRENT), "the current period begins six days ago");

    // The world's distinct (person, answer, period) pairs: eight said yes and eight stopped before, one said yes and four
    // stopped now. P12 and P26 are on two runs and count once; P25 stopped in both periods and counts once in each.
    const pairs = pairsOf(world);
    const count = (consent, period) => [...pairs.keys()].filter((p) => p.endsWith(`|${consent}|${period}`)).length;
    assert.deepEqual(
      [count(ANSWER.IN, "before"), count(ANSWER.OUT, "before"), count(ANSWER.IN, "now"), count(ANSWER.OUT, "now")],
      [8, 8, 1, 4],
    );
    assert.deepEqual(
      [total(previous, "opt_ins"), total(previous, "opt_outs"), total(current, "opt_ins"), total(current, "opt_outs")],
      [8, 8, 1, 4],
      "a person is counted once a period and answer",
    );

    // On the day of the earliest answer: P26 said yes to run A at 30 hours and to run B at 80, and is on the earlier day.
    const want = {};
    for (const [pair, at] of pairs) {
      const day = ymd(at);
      want[day] ??= { opt_ins: 0, opt_outs: 0 };
      want[day][pair.split("|")[1] === ANSWER.IN ? "opt_ins" : "opt_outs"] += 1;
    }
    for (const d of report.series) {
      assert.deepEqual([d.opt_ins, d.opt_outs], [want[d.day]?.opt_ins ?? 0, want[d.day]?.opt_outs ?? 0], d.day);
    }
    assert.equal(pairs.get(`P26|${ANSWER.IN}|before`), A + 30 * HOUR, "P26's yes is dated by the earlier of its two");

    // The people the same days: every yes and stop counted here is a person People counts, which keeps every one.
    const people = ok(await db.rpc("people_series", { p_tenant_id: w.tenantId, p_days: 7 }));
    assert.ok(total(current, "opt_ins") <= people.consent.now.yes.total, "the yeses are inside People's");
    assert.ok(total(current, "opt_outs") <= people.consent.now.stop.total, "the stops are inside People's");
    assert.ok(
      people.consent.now.yes.total > total(current, "opt_ins"),
      "and People keeps more: a desk yes after the 72 hours is a yes there and no answer here",
    );
  },
);

test("the window's edge: an answer superseded just past the window's end is not in the window", { skip }, async () => {
  const counted = (report) => [total(report.series, "opt_ins"), total(report.series, "opt_outs")];

  // By the clock: a yes two hours after the send, and a stop twenty hours after it, on the next day.
  const near = await workspace("campaign-answers-edge");
  const sentNear = dayAt(5, 10);
  const first = await sentTo(
    near,
    await broadcast(near, await template(near), { name: "Edge", at: sentNear }),
    sentNear,
  );
  await insert("events", [
    consentRow(near, first.contact, sentNear + 2 * HOUR, { consent: "opted_in", source: "customer_message" }),
    consentRow(near, first.contact, sentNear + 20 * HOUR, { consent: "opted_out", source: "customer_message" }),
  ]);
  const yesDay = ymd(sentNear + 2 * HOUR);
  const stopDay = ymd(sentNear + 20 * HOUR);
  assert.notEqual(yesDay, stopDay, "the stop falls on the next day");
  assert.deepEqual(
    counted(await seriesOf(near, 7, yesDay)),
    [0, 0],
    "the window ends on the day of the yes: the stop stands for the run and is outside it, so neither is counted",
  );
  assert.deepEqual(
    counted(await seriesOf(near, 7, stopDay)),
    [0, 1],
    "the next day's window counts the stop, and the yes is still superseded",
  );
  assert.deepEqual(
    await answersOf(near, dayAt(5, 0), dayAt(4, 0)),
    [],
    "campaign_answers: no row for the day of the yes",
  );
  assert.deepEqual(
    (await answersOf(near, dayAt(5, 0), dayAt(3, 0))).map((r) => [r.consent, r.exact]),
    [[ANSWER.OUT, false]],
    "and the stop in the days that hold it",
  );

  // By a key, long after: an email's own unsubscribe eight days after the send takes the yes away from a window that
  // ended on the day of the send, though it came more than 72 hours past that window's end.
  const far = await workspace("campaign-answers-late");
  const sentFar = dayAt(12, 10);
  const second = await sentTo(
    far,
    await broadcast(far, await template(far), { name: "Late", at: sentFar }),
    sentFar,
    "email",
  );
  await insert("events", [
    consentRow(far, second.contact, sentFar + 2 * HOUR, { consent: "opted_in", purpose: EMAIL_OFFERS, source: "form" }),
    consentRow(far, second.contact, sentFar + 8 * DAY, {
      consent: "opted_out",
      purpose: EMAIL_OFFERS,
      source: "unsubscribe",
      message_id: second.message,
    }),
  ]);
  assert.deepEqual(
    counted(await seriesOf(far, 7, ymd(sentFar + 2 * HOUR))),
    [0, 0],
    "the window ends the day of the send: the unsubscribe that came later still stands for the run, and the yes does not",
  );
  assert.deepEqual(await answersOf(far, dayAt(13, 0), dayAt(11, 0)), [], "campaign_answers: none in that window");
  assert.deepEqual(counted(await seriesOf(far, 7)), [0, 1], "the window that holds the unsubscribe counts it");
  assert.deepEqual(
    (await answersOf(far, dayAt(5, 0), dayAt(3, 0))).map((r) => [r.consent, r.purpose, r.exact]),
    [[ANSWER.OUT, EMAIL_OFFERS, true]],
  );
});

test(
  "a member of another workspace reads none of it, and a member reads what the service role reads",
  { skip: skipMembers },
  async () => {
    const world = await buildWorld();
    const { w, key } = world;
    const other = await workspace("campaign-answers-other");
    const mine = await member(w);
    const theirs = await member(other);

    const read = (rows) =>
      rows.map((r) => key(r.broadcast_id, r.contact_id, r.event_id, r.consent, r.purpose, r.exact)).sort();
    const all = read(await answersOf(w, SINCE, UNTIL));
    assert.equal(all.length, 23);
    assert.deepEqual(read(await answersOf(w, SINCE, UNTIL, mine)), all, "a member reads what the service role reads");
    assert.deepEqual(
      await answersOf(w, SINCE, UNTIL, theirs),
      [],
      "a member of another workspace reads no row of this one (the function runs on the caller's rights)",
    );
    const anon = createClient(URL_, ANON, { auth: { persistSession: false } });
    const refused = await anon.rpc("campaign_answers", {
      p_tenant_id: w.tenantId,
      p_since: iso(SINCE),
      p_until: iso(UNTIL),
    });
    assert.ok(refused.error, "an anonymous visitor may not call it");
  },
);

test("the Home and the lens say the same", { skip }, async () => {
  const world = await buildWorld();
  const report = await seriesOf(world.w);
  const current = report.series.slice(7);
  const vm = toCampaignReportVM(report);
  // "N said yes · M asked to stop" on the Campaigns home, and the lens's two tiles, are these two totals.
  assert.deepEqual([vm.totals.optIns, vm.totals.optOuts], [1, 4]);
  assert.deepEqual([vm.totals.optIns, vm.totals.optOuts], [total(current, "opt_ins"), total(current, "opt_outs")]);
  assert.equal(vm.empty, false);
});

// The period's first instant is the workspace's midnight, not the database's: a person who answers two runs a few
// minutes either side of it is in both periods, each on their own day, however the zone cuts the UTC dates.
for (const [zone, side] of [
  ["Pacific/Auckland", "east of UTC"],
  ["America/Los_Angeles", "west of UTC"],
]) {
  test(
    `campaign_series dates its answers by the workspace's own day, ${side}: a person who answers just before and just after the current period begins counts once in each`,
    { skip },
    async () => {
      const w = await workspace("campaign-answers-zone", zone);
      const { today, timezone } = await seriesOf(w);
      assert.equal(timezone, zone);
      const first = dayFrom(today, -6); // the current period's first day, in the workspace
      const before = dayFrom(first, -1);
      const tpl = await template(w);

      // Two runs by email to one person; each of their unsubscribes names its own run's email, so each answers that run
      // alone: 23:30 on the last day of the period before, and 00:30 on the first day of the current one.
      const runX = await broadcast(w, tpl, { name: "Zone X", at: localAt(dayFrom(first, -3), 10, 0, zone) });
      const runY = await broadcast(w, tpl, { name: "Zone Y", at: localAt(before, 12, 0, zone) });
      const x = await sentTo(w, runX, localAt(dayFrom(first, -3), 10, 0, zone), "email");
      const y = await sentAgain(w, runY, x, localAt(before, 12, 0, zone), "email");
      const unsubscribe = (message, at) =>
        consentRow(w, x.contact, at, {
          consent: ANSWER.OUT,
          purpose: EMAIL_OFFERS,
          source: "unsubscribe",
          message_id: message,
        });
      const late = localAt(before, 23, 30, zone);
      const early = localAt(first, 0, 30, zone);
      await insert("events", [unsubscribe(x.message, late), unsubscribe(y.message, early)]);

      assert.ok(late < localAt(first, 0, 0, zone) && localAt(first, 0, 0, zone) <= early, "either side of the instant");
      assert.ok(
        ymd(late) !== before || ymd(early) !== first,
        "and one of them falls on another date in UTC than on the workspace's own",
      );
      const report = await seriesOf(w);
      assert.equal(report.series[7].day, first, "the current period begins on the workspace's day");
      for (const d of report.series) {
        const answered = d.day === before || d.day === first;
        assert.deepEqual([d.opt_ins, d.opt_outs], [0, answered ? 1 : 0], `${d.day} (the workspace's day)`);
      }
      assert.deepEqual(
        [total(report.series.slice(0, 7), "opt_outs"), total(report.series.slice(7), "opt_outs")],
        [1, 1],
        "once in each period",
      );
    },
  );
}

test(
  "instants are read to the millisecond: the 72 hours' bound and the order of the latest are truncated, as the rule does",
  { skip },
  async () => {
    const w = await workspace("campaign-answers-micro");
    const sent = dayAt(3, 9); // a whole millisecond
    const run = await broadcast(w, await template(w), { name: "Micro", at: sent });
    const people = {};
    for (const name of ["Q1", "Q2", "Q3", "Q4", "Q5", "Q6"]) people[name] = await sentTo(w, run, sent);
    // Two sent 0.7 ms past the millisecond, which is the send's millisecond for the rule.
    for (const name of ["Q7", "Q8"]) {
      const [contact, conversation, message] = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
      await insert("contacts", contactRow(w, contact));
      await insert("conversations", conversationRow(w, conversation, contact, sent));
      await insert("messages", messageRow(w, message, { conversation, contact, channel: "whatsapp", at: sent }));
      await insert("broadcast_recipients", {
        ...recipientRow(w, { run, contact, message, at: sent, channel: "whatsapp" }),
        sent_at: stamp(sent, 700),
      });
      people[name] = { contact };
    }
    const yes = { consent: ANSWER.IN, source: "customer_message" };
    const stop = { consent: ANSWER.OUT, source: "customer_message" };
    const say = (name, ms, micros, data, id) => ({
      ...consentRow(w, people[name].contact, ms, data, id),
      created_at: stamp(ms, micros),
    });
    // Two events in one millisecond, the greater id the earlier by microseconds, and two a millisecond apart.
    const [sameMs, nextMs] = [crypto.randomUUID().slice(0, 24), crypto.randomUUID().slice(0, 24)];
    const events = {
      boundIn: say("Q1", sent + REPLY_WINDOW, 400, yes), // 72 h and 0.4 ms is 72 h to the millisecond: it counts
      boundOut: say("Q2", sent + REPLY_WINDOW + 1, 0, yes), // a whole millisecond past: it does not
      atSend: say("Q3", sent, 400, yes), // 0.4 ms after the send is the send's millisecond: not after it
      afterSend: say("Q4", sent + 1, 0, yes), // the next millisecond is after it
      sameMsYes: say("Q5", sent + HOUR, 100, yes, `${sameMs}00000000000b`),
      sameMsStop: say("Q5", sent + HOUR, 900, stop, `${sameMs}00000000000a`), // later by microseconds, same millisecond
      nextMsYes: say("Q6", sent + 2 * HOUR, 100, yes, `${nextMs}00000000000b`),
      nextMsStop: say("Q6", sent + 2 * HOUR + 1, 100, stop, `${nextMs}00000000000a`), // the next millisecond: later
      pastBound: say("Q7", sent + REPLY_WINDOW, 900, yes), // a send's 0.7 ms is dropped too: 72 h to the millisecond
      pastSend: say("Q8", sent, 900, yes), // and the event is not after the send's millisecond
    };
    await insert("events", Object.values(events));

    const owed = [
      [events.boundIn, ANSWER.IN],
      [events.afterSend, ANSWER.IN],
      [events.sameMsYes, ANSWER.IN], // the greater id stands
      [events.nextMsStop, ANSWER.OUT], // the later millisecond stands, whatever the ids
      [events.pastBound, ANSWER.IN],
    ]
      .map(([e, consent]) => `${e.id}|${consent}`)
      .sort();
    const sql = (await answersOf(w, sent - HOUR, sent + 4 * DAY)).map((r) => `${r.event_id}|${r.consent}`).sort();
    assert.deepEqual(sql, owed, "campaign_answers");
    const world = await readWorld(w);
    assert.deepEqual(
      answersToRuns(world.sends, world.events)
        .map((a) => `${a.eventId}|${a.consent}`)
        .sort(),
      owed,
      "and the rule says the same",
    );
  },
);
