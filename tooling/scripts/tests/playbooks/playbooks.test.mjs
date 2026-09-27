/**
 * Playbooks: a standing rule that sends one approved template to newly
 * eligible people who said yes, under the workspace's autonomy mode.
 *
 * The rules by execution: who a run may reach (the trigger's list crossed
 * with who said yes, minus the gap, minus the week's breath, the
 * longest-unheard first, at most the cap), what a run does under each mode,
 * and when it is due by the business's clock. The doors by source: the
 * migration, the sweep, the job's gate, approve and skip.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BROADCAST_STATES,
  DECISION_SUBJECTS,
  DECISION_VERBS,
  PLAYBOOK_BREATH_MS,
  PLAYBOOK_TRIGGERS,
  MOMENT_TRIGGERS,
  REACH_OUT_IS_NOT_A_MOMENT,
  PLAYBOOK_VETO_DELAY_MS,
  eligibleForPlaybook,
  localDate,
  localHour,
  nextRunLabel,
  planRun,
  runDueNow,
  scheduleLine,
  toBroadcastVM,
  triggerOf,
  FOLLOW_UP_NEEDS_DEALS,
  POLICY_CLASSES,
  PLAYBOOK_REACH_WORDS,
  playbookRunReach,
  followUpRunAt,
  followUpStandOf,
  policyClassOffered,
  poolWords,
  reachLines,
  triggerOffered,
  playbookReach,
  playbookReachDoor,
  playbookNoNumberWords,
  GET_YES_ROUTE,
} from "@chanlytics/contracts";
import { readCode, readRaw, importSrc } from "../_source.mjs";
import { localDate as tzDate, visitFactsFor as visitFacts } from "@chanlytics/contracts";

// The workspace's zone: every view model says its times by it (contracts clock.ts).
const ZONE = "America/New_York";

const DAY = 86_400_000;
const NOW = Date.parse("2026-09-06T15:00:00Z");
const person = (id, over = {}) => ({
  id,
  state: "active",
  hasChat: true,
  calls: 0,
  phone: "+15551230001",
  consent: {
    state: "opted_in",
    dnc: false,
    label: "Opted in",
    sub: "",
    source: "in_person",
    marketing: "opted_in",
    marketingSource: "in_person",
    marketingSub: "",
  },
  lastContact: { ts: NOW - 40 * DAY, label: "" },
  ...over,
  // They wrote last when they were last in touch: Quiet 30+ days reads the days since (lists.ts).
  heardDays: over.heardDays ?? Math.round((NOW - (over.lastContact?.ts ?? NOW - 40 * DAY)) / DAY),
});
const base = { trigger: "quiet_30", cap_per_run: 25, gap_days: 90, cadence_days: 30 };
const noTouch = { byThis: new Map(), byAny: new Map(), followUps: new Map() };

test("a reminder is owed to everyone with a visit tomorrow: the cap is a fatigue limit for offers and does not apply; the list is in visit order", () => {
  const TZ = "America/New_York";
  const tomorrow = tzDate(TZ, new Date(NOW + DAY));
  const rows = ["a", "b", "c", "d"].map((id, i) =>
    person(id, { calendarTz: TZ, nextVisitDate: tomorrow, nextVisitMs: NOW + DAY + (4 - i) * 3_600_000, booked: true }),
  );
  const visit = { trigger: "visit_tomorrow", cap_per_run: 1, gap_days: 90, cadence_days: 30 };
  assert.deepEqual(
    eligibleForPlaybook(rows, visit, noTouch, NOW).map((r) => r.id),
    ["d", "c", "b", "a"],
    "all four, earliest visit first, whatever the cap says",
  );
  const heard = {
    byThis: new Map([["a", NOW - 2 * DAY]]),
    byAny: new Map([
      ["a", NOW - 2 * DAY],
      ["b", NOW - 1 * DAY],
    ]),
  };
  assert.equal(eligibleForPlaybook(rows, visit, heard, NOW).length, 4, "nor the gap, nor the week's breath");
});

test("the reminder's words are relative to the moment it goes: tomorrow, today, or the day's name", () => {
  const TZ = "America/New_York";
  const visit = { start: "2026-09-07T18:00:00Z", title: "Balayage", all_day: false }; // Sep 7, 2:00 PM in New York
  const sep6 = new Date("2026-09-06T15:00:00Z");
  const sep7 = new Date("2026-09-07T13:00:00Z"); // nine in the morning, the moment a night's run-now goes
  const sep5 = new Date("2026-09-05T15:00:00Z");
  assert.deepEqual(visitFacts("visit_tomorrow", visit, TZ, sep6), {
    visit_when: "tomorrow at 2:00 PM",
    visit_service: "Balayage",
  });
  assert.deepEqual(
    visitFacts("visit_tomorrow", visit, TZ, sep7),
    { visit_when: "today at 2:00 PM", visit_service: "Balayage" },
    "moved to nine the next morning, the visit is today",
  );
  assert.equal(
    visitFacts("visit_tomorrow", visit, TZ, sep5).visit_when,
    "on Monday at 2:00 PM",
    "further off, the day's name",
  );
  assert.equal(
    visitFacts("visit_tomorrow", visit, TZ).visit_when,
    "tomorrow at 2:00 PM",
    "without a moment, as the run assumes",
  );
  assert.equal(visitFacts("visited", visit, TZ, new Date("2026-09-08T15:00:00Z")).visit_when, "yesterday");
  assert.equal(
    visitFacts("visited", visit, TZ, new Date("2026-09-09T15:00:00Z")).visit_when,
    "on Monday",
    "a thank-you moved a day still names the day",
  );
});

test("nine moments: People's lists and a cadence, two the calendar makes possible, Lapsed, one of the workspace's own lists, and a proposal waiting, each under one of the four autonomy rows; and a reach-out's two steps, which are no moment", () => {
  assert.deepEqual(
    MOMENT_TRIGGERS.map((t) => t.id),
    [
      "quiet_30",
      "new_week",
      "phoned_only",
      "everyone_monthly",
      "visit_tomorrow",
      "visited",
      "lapsed",
      "saved_list",
      "proposal_waiting",
    ],
  );
  assert.deepEqual(
    PLAYBOOK_TRIGGERS.filter((t) => !MOMENT_TRIGGERS.includes(t)).map((t) => [t.id, t.kind, t.cls]),
    [
      ["lead_first", "reach_out", "outreach"],
      ["after_step", "reach_out", "outreach"],
    ],
    "the closed set the schema pins (Exactly) holds them, and nothing that counts moments reads them",
  );
  assert.deepEqual(
    [triggerOf("proposal_waiting").kind, triggerOf("proposal_waiting").cls, triggerOf("proposal_waiting").list],
    ["deal", "follow_up", null],
    "a proposal's moment, under its own class (0006), on no People list: Today's rule names who waits",
  );
  assert.equal(triggerOf("lapsed").list, "lapsed", "the win-back by visits runs on People's own Lapsed list");
  assert.notEqual(triggerOf("lapsed").label, triggerOf("quiet_30").label, "never a second Win-back");
  assert.equal(triggerOf("saved_list").kind, "saved");
  assert.equal(triggerOf("quiet_30").list, "quiet");
  assert.equal(triggerOf("everyone_monthly").list, null);
  assert.equal(triggerOf("quiet_30").cls, "reengage");
  assert.equal(triggerOf("new_week").cls, "campaign");
  assert.equal(triggerOf("birthday"), null);
});

test("who a run may reach: the list crossed with who said yes, minus the gap, minus the week's breath, the longest-unheard first, at most the cap", () => {
  const rows = [
    person("a", { state: "quiet", lastContact: { ts: NOW - 45 * DAY, label: "" } }),
    person("b", { state: "quiet", lastContact: { ts: NOW - 90 * DAY, label: "" } }),
    person("c", { state: "quiet", consent: { state: "unknown", dnc: false } }),
    person("d", { state: "active", heardDays: 5 }),
    person("e", { state: "quiet", lastContact: { ts: NOW - 60 * DAY, label: "" } }),
  ];
  assert.deepEqual(
    eligibleForPlaybook(rows, base, noTouch, NOW).map((r) => r.id),
    ["b", "e", "a"],
    "quiet, said yes, longest-unheard first",
  );
  assert.deepEqual(
    eligibleForPlaybook(rows, { ...base, cap_per_run: 2 }, noTouch, NOW).map((r) => r.id),
    ["b", "e"],
    "the cap",
  );
  const heardFromThis = { byThis: new Map([["b", NOW - 10 * DAY]]), byAny: new Map([["b", NOW - 10 * DAY]]) };
  assert.deepEqual(
    eligibleForPlaybook(rows, base, heardFromThis, NOW).map((r) => r.id),
    ["e", "a"],
    "heard from this playbook within the gap",
  );
  const heardLongAgo = { byThis: new Map([["b", NOW - 100 * DAY]]), byAny: new Map([["b", NOW - 100 * DAY]]) };
  assert.deepEqual(
    eligibleForPlaybook(rows, base, heardLongAgo, NOW).map((r) => r.id),
    ["b", "e", "a"],
    "past the gap they are eligible again",
  );
  const heardFromAnother = { byThis: new Map(), byAny: new Map([["e", NOW - 3 * DAY]]) };
  assert.deepEqual(
    eligibleForPlaybook(rows, base, heardFromAnother, NOW).map((r) => r.id),
    ["b", "a"],
    "one playbook message per person per week, across playbooks",
  );
  assert.equal(PLAYBOOK_BREATH_MS, 7 * DAY);
  const monthly = eligibleForPlaybook(
    rows,
    { ...base, trigger: "everyone_monthly", cadence_days: 30 },
    { byThis: new Map([["a", NOW - 20 * DAY]]), byAny: new Map([["a", NOW - 20 * DAY]]) },
    NOW,
  );
  assert.deepEqual(monthly.map((r) => r.id).sort(), ["b", "d", "e"], "everyone who said yes, on the cadence");
  assert.deepEqual(eligibleForPlaybook(rows, { ...base, trigger: "nope" }, noTouch, NOW), []);
});

test("what a run does under each mode: auto sends now, veto sends after a stop window, ask waits for a person, never does nothing", () => {
  const now = new Date(NOW);
  assert.deepEqual(planRun("auto", now), { kind: "send", state: "scheduled", at: now });
  const veto = planRun("veto", now);
  assert.equal(veto.kind, "send");
  assert.equal(veto.at.getTime() - now.getTime(), PLAYBOOK_VETO_DELAY_MS);
  assert.deepEqual(planRun("ask", now), { kind: "hold", state: "pending_approval" });
  assert.deepEqual(planRun("never", now), { kind: "off" });
  assert.deepEqual(planRun(null, now), { kind: "off" }, "no row, nothing runs on its own");
});

test("when a run is due: the hour the owner picked, by the business's clock, once per local day", () => {
  const now = new Date("2026-09-06T14:30:00Z"); // 10:30 in New York
  assert.equal(localHour("America/New_York", now), 10);
  assert.equal(localDate("America/New_York", now), "2026-09-06");
  assert.equal(localDate("Asia/Tokyo", now), "2026-09-06");
  assert.equal(localHour("Asia/Tokyo", now), 23);
  assert.equal(runDueNow({ state: "running", run_hour: 10, last_run_for: null }, "America/New_York", now), true);
  assert.equal(
    runDueNow({ state: "running", run_hour: 10, last_run_for: "2026-09-06" }, "America/New_York", now),
    false,
    "once per local day",
  );
  assert.equal(
    runDueNow({ state: "running", run_hour: 11, last_run_for: null }, "America/New_York", now),
    false,
    "not its hour yet",
  );
  assert.equal(
    runDueNow({ state: "running", run_hour: 9, last_run_for: null }, "America/New_York", now),
    true,
    "an hour the sweep missed, or a playbook started after its hour, runs later the same day",
  );
  assert.equal(
    runDueNow(
      { state: "running", run_hour: 9, last_run_for: null },
      "America/New_York",
      new Date("2026-09-07T01:30:00Z"),
    ),
    false,
    "never past the last hour a message may go out (21:30 in New York)",
  );
  assert.equal(runDueNow({ state: "paused", run_hour: 10, last_run_for: null }, "America/New_York", now), false);
  assert.equal(
    scheduleLine({ trigger: "quiet_30", run_hour: 10, cap_per_run: 25, gap_days: 90, cadence_days: 30 }),
    "Daily 10:00 · up to 25 · once per person, again after 90 days",
  );
  assert.equal(
    scheduleLine({ trigger: "everyone_monthly", run_hour: 9, cap_per_run: 50, gap_days: 90, cadence_days: 30 }),
    "Every 30 days at 09:00 · up to 50 a day",
  );
  assert.equal(
    nextRunLabel({ state: "running", run_hour: 11, last_run_for: null }, "America/New_York", now),
    "today 11:00",
  );
  assert.equal(
    nextRunLabel({ state: "running", run_hour: 10, last_run_for: null }, "America/New_York", now),
    "today, within the hour",
  );
  assert.equal(
    nextRunLabel({ state: "running", run_hour: 10, last_run_for: "2026-09-06" }, "America/New_York", now),
    "tomorrow 10:00",
  );
  assert.equal(nextRunLabel({ state: "paused", run_hour: 10, last_run_for: null }, "America/New_York", now), "paused");
});

test("a run that waits for a person is open, never sent by the job, approved through its own door, skipped through cancel", () => {
  assert.ok(BROADCAST_STATES.includes("pending_approval"));
  const vm = toBroadcastVM(
    {
      id: "b",
      name: "n",
      template_id: "t",
      template_name: "x",
      template_language: "en",
      params: [],
      audience: { kind: "playbook", id: "p", label: "Win-back" },
      state: "pending_approval",
      scheduled_for: "2026-09-06T15:00:00Z",
      started_at: null,
      finished_at: null,
      recipient_count: 3,
      failure: null,
      created_at: "2026-09-06T15:00:00Z",
      playbook_id: "p",
      run_for: "2026-09-06",
      counts: { queued: 3, sent: 0, skipped: 0, failed: 0, delivered: 0, read: 0, replied: 0 },
    },
    ZONE,
  );
  assert.equal(vm.open, true);
  assert.equal(vm.stateLabel, "Needs you");
  const h = readCode("packages/core/src/messages/broadcast.ts");
  assert.ok(
    h.includes('if (b.state !== "scheduled" && b.state !== "sending") return;'),
    "only a scheduled or sending broadcast goes out",
  );
  // Approve and skip are run: core-campaigns.test.mjs; the button is drawn by broadcasts-honest and confirm.
  assert.ok(
    DECISION_VERBS.includes("start_playbook") &&
      DECISION_VERBS.includes("pause_playbook") &&
      DECISION_SUBJECTS.includes("playbook"),
  );
});

test("the migration and the sweep: one run per playbook per local day, touches never stored twice, the same door the other sweeps use, every run recorded", () => {
  const m = readRaw("supabase/migrations/00048_playbooks.sql");
  assert.ok(
    m.includes(
      "create unique index broadcasts_playbook_run on public.broadcasts (playbook_id, run_for) where playbook_id is not null;",
    ),
  );
  assert.ok(m.includes("check (state in ('pending_approval', 'scheduled', 'sending', 'sent', 'canceled', 'failed'))"));
  assert.ok(
    m.includes("url     := v_url || '/api/cron/playbooks',") &&
      m.includes("select cron.schedule('playbooks-sweep', '5 * * * *'"),
  );
  assert.ok(m.includes("'start_playbook', 'pause_playbook'") && m.includes("'broadcast', 'playbook'"));
  assert.ok(!/create table public.playbook_touches/.test(m), "touches are derived from the runs' recipient rows");
  // The run's branches are run: core-run-playbook.test.mjs. The touches the loader and the Playbooks page read
  // (packages/db touchesSince) are run in send-rails.test.mjs.
  // Run now -- a person's run through the same implementation, sent now under
  // ask, the ledger naming them -- runs in playbooks-run-door.test.mjs.
  assert.ok(
    readCode("packages/contracts/src/config/config.ts").includes(
      'note: "the win-back and save-our-number playbooks · auto sends each run, veto sends it 30 minutes later unless you stop it, ask leaves it waiting on Today, never runs nothing"',
    ) && readCode("apps/dashboard/src/legacy-bridge/policy-store.ts").includes('...W("reengage")'),
    "the Autonomy row says what the playbooks do, in the one set of words every surface reads",
  );
});

test("the page and its doors: Outbound is Playbooks, real; make, change, pause, resume, run now, delete through the app's routes; a waiting run on Today", async () => {
  const reg = readCode("apps/dashboard/src/legacy-bridge/surface-registry.ts");
  assert.ok(
    reg.includes('outbound: "real"') && reg.includes('outbound: "playbooks"'),
    "flipped, and the gate waits on its surface",
  );
  const page = readCode("apps/dashboard/src/legacy/pages/outbound.jsx");
  // A playbook's card and its composer are playbook-card.jsx and playbook-composer.jsx (Reach out Part 2.5): their
  // doors are drawn and pressed by playbook-composer, campaigns-drafts, runs-honest, reports-honest and confirm.
  assert.ok(page.includes('data-testid="playbooks-real"'));
  assert.ok(page.includes('testid="pb-empty"'), "the empty state, through the one EmptyState, with the verb on it");
  assert.ok(
    page.includes("window.OutboundPage = (props) =>") &&
      readCode("apps/dashboard/src/legacy/demo/pages/outbound.jsx").includes("window.OutboundSeed = OutboundPage;"),
  );
  assert.ok(
    !/\$[\d,]+|revenue|Attributed|booked/.test(page.replace(/\/\/[^\n]*/g, "")),
    "no number the schema has no column for",
  );
  // The card's mode chip is run in playbook-composer.test.mjs.
  const routes = readCode("apps/dashboard/app/api/v1/playbooks/route.ts");
  assert.ok(
    routes.includes('role: "operator",') &&
      routes.includes('rate: "playbook",') &&
      routes.includes('"start_playbook", {'),
  );
  const one = readCode("apps/dashboard/app/api/v1/playbooks/[id]/route.ts");
  assert.ok(
    one.includes('state === "running" ? "start_playbook" : "pause_playbook"') &&
      /"pause_playbook", \{\s*name: p\.name,\s*deleted: true,?\s*\}/.test(one),
    "pause, resume and delete are recorded",
  );
  const run = readCode("apps/dashboard/app/api/v1/playbooks/[id]/run/route.ts");
  assert.ok(
    run.includes("runPlaybookNow(p.tenant_id, id, ctx.userId)") && run.includes("never: "),
    "run now says why nothing ran",
  );
  const svc = readCode("apps/dashboard/src/server/campaigns/playbook-run.ts");
  assert.ok(
    svc.includes("/api/admin/playbooks-run") && svc.includes("export async function runPlaybookNow("),
    "through the edge, production only",
  );
  // The check is run: core-campaigns.test.mjs.
  const queue = readCode("apps/dashboard/src/legacy/pages/dashboard-a-command.jsx");
  assert.ok(
    queue.includes('testid="brief-run-row"') && queue.includes('r.state === "pending_approval"'),
    "Today's queue shows a run that waits, from the surface it already has",
  );
  const { AFTER } = await importSrc("apps/dashboard/src/legacy-bridge/refresh-map.ts");
  for (const k of [
    "POST playbooks",
    "PUT playbooks/[id]",
    "DELETE playbooks/[id]",
    "POST playbooks/[id]/run",
    "POST broadcasts/[id]/approve",
    "POST broadcasts/[id]/cancel",
  ])
    assert.deepEqual(
      AFTER[k]().map((o) => o.key),
      // A reach-out's row moves with its first step's pause and resume, and with its run's approval (Part 4 PR 8).
      ["PUT playbooks/[id]", "POST broadcasts/[id]/approve", "POST broadcasts/[id]/cancel"].includes(k)
        ? ["playbooks", "broadcasts", "reach_outs"]
        : ["playbooks", "broadcasts"],
      `${k}: every write re-fetches both surfaces`,
    );
  const pools = readCode("apps/dashboard/src/server/campaigns/playbooks.ts");
  assert.ok(
    /cap_per_run: PLAYBOOK_POOL, gap_days: 0, cadence_days: 0 \},\s*breath,\s*now\.getTime\(\),\s*deals\.pace,\s*listIds,?\s*\);/.test(
      pools,
    ),
    "the chip counts the pool with the runner's own predicate -- with the week's touches, since slice C of the data program; on the server over everyone since Calendar 3 (run in calendar-counts.test.mjs)",
  );
  assert.ok(
    readCode("apps/dashboard/src/legacy/components/surface-tabs.jsx").includes(
      '{ id: "outbound", label: "Playbooks", to: "outbound" }',
    ),
  );
  assert.ok(
    /broadcastsOverride,\s*playbooksOverride/.test(readCode("apps/dashboard/src/legacy-bridge/LegacyApp.tsx")),
    "booted with the rest",
  );
  // "Running · next run tomorrow 10:00" is a promise the run cannot keep when
  // the pool is empty: the card says what the next run will DO, beside the
  // state and in the sentence, and the standing line counts them.
  // The card's reach, its next run and its one-run sentence are playbook-card.jsx's, drawn by runs-honest.
  assert.ok(page.includes('data-testid="pb-reaches-nobody"'));
});

test("what the next run will DO: a playbook running against an empty list is not running in the sense the owner means", () => {
  // The salon had three playbooks on 17 Sep 2026 -- two of them running every
  // day -- and every one watched a pool of nought. Two runs a day reached
  // nobody, and had since the list emptied. The card printed it as "0 people on
  // the list said yes", mid-sentence, as a link, while the hour it would run at
  // was in bold.
  const at = (over) => playbookReach({ state: "running", candidates: 0, held: 0, ...over });
  assert.equal(at({}), "nobody");
  assert.equal(at({ candidates: 4 }), "sends");
  assert.equal(at({ state: "paused" }), "paused");
  assert.equal(at({ state: "paused", candidates: 4 }), "paused", "a paused playbook is paused whoever is on its list");
  assert.equal(at({ waiting: { id: "b-1" } }), "waiting", "a run waiting for a person is the state that matters");
  assert.equal(at({ candidates: 4, waiting: { id: "b-1" } }), "waiting");
  // An empty pool has two causes and they are not the same news: nobody has
  // said yes (go and fix it), or everyone has and they all heard from you this
  // week (wait it out).
  assert.equal(at({ held: 3 }), "all-heard");
  assert.equal(PLAYBOOK_REACH_WORDS.nobody, "nobody to send to");
  assert.equal(PLAYBOOK_REACH_WORDS["all-heard"], "waiting out the week's gap");
  for (const quiet of ["sends", "paused", "waiting"])
    assert.equal(PLAYBOOK_REACH_WORDS[quiet], null, `${quiet}: the schedule is the whole truth, so nothing is added`);
  // "nobody to send to" is fixed by a yes when the moment names somebody and not one of them said it, and the card
  // says where; "waiting out the week's gap" is waited out.
  const named = (pool, saidYes) => ({ pool, saidYes });
  assert.deepEqual(playbookReachDoor("nobody", named(3, 0)), { label: "Get their yes", to: GET_YES_ROUTE });
  assert.equal(playbookReachDoor("all-heard", named(3, 3)), null, "nothing to fix, so no door");
  for (const r of ["sends", "paused", "waiting"]) assert.equal(playbookReachDoor(r, named(3, 0)), null, r);
});

test("REGRESSION: a playbook whose moment could not be counted is not one with nobody to send to -- it read 'nobody to send to' and offered the QR over a People read that failed", () => {
  const at = (over) => playbookReach({ state: "running", candidates: null, held: null, ...over });
  assert.equal(at({}), "uncounted");
  assert.equal(
    PLAYBOOK_REACH_WORDS.uncounted,
    null,
    "nothing said beside the state: the page says once that the counts could not be read",
  );
  assert.equal(playbookReachDoor("uncounted", null), null, "and no door to a yes nobody knows is missing");
  // What is known is still said: a pause, and a run waiting for a person.
  assert.equal(at({ state: "paused" }), "paused");
  assert.equal(at({ waiting: { id: "b-1" } }), "waiting");
});

test("REGRESSION: a playbook whose yes has no number to send to is not one nobody said yes to -- its card sent the owner to the QR for an answer given, and said '0 on the list said yes'", () => {
  const named = (pool, saidYes) => ({ pool, saidYes });
  // Somebody on the list said the yes, and nobody can be sent a run: what is missing is a number (#663's rule).
  assert.equal(playbookReachDoor("nobody", named(3, 1)), null, "REGRESSION: the QR asked for an answer they had given");
  // Nobody on the list at all, or a list that could not be read: a yes fixes neither.
  assert.equal(playbookReachDoor("nobody", named(0, 0)), null, "the moment names nobody");
  assert.equal(playbookReachDoor("nobody", null), null, "who it names is not known");
  // The card's count says how many said the yes the playbook needs, and what they are missing, in the send screen's
  // words (saidYesWords) -- only when nobody can be sent a run; otherwise the card's own count stands.
  const card = (policy_class, candidates, held) => ({ policy_class, candidates, held });
  assert.equal(
    playbookNoNumberWords(card("reengage", 0, 0), named(3, 1)),
    "1 person on the list said yes to offers, with no number to send to",
  );
  assert.equal(
    playbookNoNumberWords(card("campaign", 0, 0), named(3, 2)),
    "2 people on the list said yes to offers, none with a number to send to",
  );
  assert.equal(
    playbookNoNumberWords(card("booking", 0, 0), named(1, 1)),
    "1 person on the list said yes to messages, with no number to send to",
    "a reminder needs the yes to messages",
  );
  assert.equal(playbookNoNumberWords(card("reengage", 2, 0), named(3, 3)), null, "a run reaches somebody");
  assert.equal(
    playbookNoNumberWords(card("reengage", 0, 2), named(3, 3)),
    null,
    "they said yes, have a number, and wait out the week",
  );
  assert.equal(
    playbookNoNumberWords(card("reengage", 0, 0), named(3, 0)),
    null,
    "nobody said it: '0 on the list said yes' is true",
  );
  assert.equal(playbookNoNumberWords(card("reengage", 0, 0), null), null, "not known");
});

test("Ask knows playbooks: read as the page shows them, proposed as a card, committed through the app's route, undone by deleting; Today says what ran; a run's thread names its playbook", async () => {
  const { PROPOSAL_GATE, buildAskSuggestions, cardOpenRoute } = await import("@chanlytics/contracts");
  assert.equal(PROPOSAL_GATE.playbook, "approve");
  // Both tools are the registry's, and run in ask-turn.test.mjs: list_playbooks against the page's own read, its
  // rows, next-run words and counts the page's, saying nothing ran because it was read ("list_playbooks tells who
  // said yes"); propose_playbook as a card of kind playbook undone by deleting, refusing an honest no-starter and
  // asking for a typed slot's words rather than inventing them ("the proposal builders run against the database in
  // memory"), and checked the way the route checks it ("Ask reaches any list by its reference": a list about
  // whoever is looking is refused by the same check).
  // The card commits through POST playbooks and is undone by DELETE playbooks/[id]: executed in ask-commit.test.mjs
  // ("a broadcast and a playbook", "an undo names the decision it reverses"), from the playbook's spec (contracts
  // ask-proposals/campaigns.ts).
  const turn = readCode("apps/dashboard/src/legacy/pages/ask-turn.jsx");
  assert.ok(turn.includes("playbook: t.kPlaybook") && turn.includes('playbook: "bolt"'));
  assert.equal(cardOpenRoute({ kind: "playbook", payload: {} }), "outbound", "a playbook card opens Playbooks");
  assert.ok(/playbook:\s*"A standing rule/.test(readCode("apps/dashboard/src/server/ask/prompt.ts")));
  const sug = buildAskSuggestions({
    surface: "people",
    language: "en",
    needsYou: 0,
    heldDrafts: 0,
    missedToday: 0,
    liveNow: 0,
    hasCalendar: false,
    canAct: true,
  });
  assert.ok(
    sug.some((x) => x.kind === "act" && x.q === "Start a win-back playbook for the quiet clients"),
    "an Act suggestion on People",
  );
  const brief = readCode("apps/dashboard/src/legacy/pages/dashboard-a-brief.jsx");
  assert.ok(
    brief.includes('data-testid="brief-run-done"') && brief.includes('{r.playbook_id ? "ran" : "went out"}'),
    "Today says what went out today",
  );
  const h = readCode("packages/core/src/messages/broadcast.ts");
  assert.ok(
    h.includes("playbook_name: String((b.audience as { label?: unknown } | null)?.label ?? b.name)"),
    "a run's message names its playbook",
  );
  assert.ok(
    readCode("packages/contracts/src/conversations/viewmodels.ts").includes(
      '{ kind: "playbook", name: String(m.meta.playbook_name) }',
    ),
  );
  assert.ok(readCode("apps/dashboard/src/legacy/pages/inbox-thread.jsx").includes("`the ${entry.via.name} playbook`"));
  assert.ok(
    !readCode("apps/dashboard/src/legacy/pages/broadcasts.jsx").includes("Not available yet"),
    "no disabled channel chips until a second channel is real",
  );
});

test("a proposal follow-up (0006): the proposal waiting past the pace, with its link and a yes, once per proposal", () => {
  const out = (id, daysOut, over = {}) =>
    person(id, {
      deal: {
        stage: "proposed",
        sinceMs: NOW - daysOut * DAY,
        proposal: { url: `https://docs.example.com/proposal/${id}` },
      },
      askedMs: NOW - 30 * DAY,
      ...over,
    });
  const yes = person("x").consent;
  const follow = { trigger: "proposal_waiting", cap_per_run: 25, gap_days: 90, cadence_days: 30 };
  const rows = [
    out("a", 10),
    out("b", 10, { deal: { stage: "proposed", sinceMs: NOW - 10 * DAY, proposal: null } }),
    out("c", 10, { consent: { ...yes, state: "opted_out" } }),
    out("d", 10, { consent: { ...yes, state: "unknown", marketing: "unknown" } }),
    out("e", 10, { askedMs: NOW - 2 * DAY }),
    out("f", 4),
    out("g", 10, {
      deal: { stage: "won", sinceMs: NOW - 10 * DAY, proposal: { url: "https://docs.example.com/proposal/g" } },
    }),
  ];
  const drawn = playbookRunReach(rows, follow, noTouch, NOW, null);
  assert.deepEqual(
    drawn.eligible.map((r) => r.id),
    ["a"],
    "waiting a week and more, with its link, and a yes to hearing from them",
  );
  assert.deepEqual(
    [drawn.reach.pool, drawn.reach.stopped, drawn.reach.noYes, drawn.reach.will],
    [3, 1, 1, 1],
    "no link, a reply since, too soon or another stage is not a proposal waiting; a stop and no yes are counted",
  );
  // The same proposal, followed up yesterday -- by this playbook or another, one since deleted too: never twice.
  const sent = { byThis: new Map(), byAny: new Map([["a", NOW - DAY]]), followUps: new Map([["a", NOW - DAY]]) };
  const again = playbookRunReach(rows, follow, sent, NOW, null);
  assert.deepEqual([again.reach.will, again.reach.heardThis], [0, 1], "a playbook message since the proposal: heard");
  // A week on, past the week's breath: still nobody, since one follow-up was owed for this proposal.
  const later = playbookRunReach([rows[0]], follow, sent, NOW + 8 * DAY, null);
  assert.deepEqual(
    [later.reach.will, later.reach.heardThis, later.reach.heardAny],
    [0, 1, 0],
    "a second run a week later: nobody",
  );
  // The follow-up of an earlier proposal is not this one's.
  const before = {
    byThis: new Map(),
    byAny: new Map([["a", NOW - 20 * DAY]]),
    followUps: new Map([["a", NOW - 20 * DAY]]),
  };
  assert.deepEqual(
    playbookRunReach(rows, follow, before, NOW, null).eligible.map((r) => r.id),
    ["a"],
  );
  // Nor is a message this playbook sent before it was a follow-up: only a follow-up is one.
  const gapOnly = { byThis: new Map([["a", NOW - DAY]]), byAny: new Map(), followUps: new Map() };
  assert.deepEqual(
    playbookRunReach(rows, follow, gapOnly, NOW, null).eligible.map((r) => r.id),
    ["a"],
  );
  // Out longer than the touches are read, its follow-up could no longer be seen: it is not followed up again. Out a
  // little less, with nothing heard since either, it is.
  const unheard = { askedMs: NOW - 500 * DAY };
  assert.deepEqual(
    [
      playbookRunReach([out("h", 400, unheard)], follow, noTouch, NOW, null).reach.pool,
      playbookRunReach([out("i", 360, unheard)], follow, noTouch, NOW, null).reach.pool,
    ],
    [0, 1],
  );
  // The workspace's pace: where a proposal waits fourteen days, ten is not yet waiting; where it waits three, four is.
  assert.equal(playbookRunReach(rows, follow, noTouch, NOW, { waitDays: 14 }).reach.pool, 0, "the pace's own wait");
  assert.deepEqual(
    playbookRunReach(rows, follow, noTouch, NOW, { waitDays: 3 })
      .eligible.map((r) => r.id)
      .sort(),
    ["a", "f"],
  );
  // What the card and the sheet say of it.
  assert.equal(scheduleLine({ ...follow, run_hour: 10 }), "Daily 10:00 · up to 25 · once per proposal");
  assert.equal(poolWords("proposal_waiting"), "with a proposal waiting");
  assert.deepEqual(
    reachLines(again.reach, follow).lines.map((l) => l.words),
    ["1 never said yes to hearing from you", "1 had this proposal's follow-up already", "1 asked you to stop"],
    "its yes is to hearing from them, never to offers; and the follow-up it already had, never a gap",
  );
  assert.deepEqual(
    [reachLines(again.reach, follow).held, reachLines(again.reach, follow).lines[1].tone],
    [0, "plain"],
    "a follow-up already had is done for that proposal, never the amber of waiting for time",
  );
});

test("offered here (0006): a proposal's moment and its Autonomy class only where deals are on, every other everywhere", () => {
  assert.deepEqual(
    PLAYBOOK_TRIGGERS.filter((t) => !triggerOffered(t, false)).map((t) => t.id),
    ["proposal_waiting", "lead_first", "after_step"],
  );
  assert.deepEqual(
    PLAYBOOK_TRIGGERS.filter((t) => !triggerOffered(t, true)).map((t) => t.id),
    ["lead_first", "after_step"],
    "a reach-out's steps are never offered among the moments: its own sheet makes them (Part 4)",
  );
  assert.match(REACH_OUT_IS_NOT_A_MOMENT, /own sheet/);
  assert.deepEqual(
    POLICY_CLASSES.filter((c) => !policyClassOffered(c, false)),
    ["follow_up", "outreach"],
    "a salon's Autonomy: seven rows",
  );
  assert.deepEqual(
    POLICY_CLASSES.filter((c) => !policyClassOffered(c, true)),
    ["outreach"],
    "deals on: eight rows; the reach-outs' row waits for the reach-out sheet (Part 4)",
  );
  assert.ok(
    FOLLOW_UP_NEEDS_DEALS.includes("Settings › Business") &&
      FOLLOW_UP_NEEDS_DEALS.includes("“Some get a proposal first”"),
    "the refusal says where the answer is given, in the answer's own words",
  );
});

test("where one person stands with the follow-up (0006): by its run's own rules, the day its run goes, and whether they had theirs", () => {
  const tz = "America/New_York";
  const now = Date.parse("2026-09-08T14:00:00Z"); // ten in the morning in New York
  const HOUR = 3_600_000;
  const iso = (ms) => new Date(ms).toISOString();
  const facts = (over = {}) => ({
    run_hour: 11,
    last_run_for: null,
    asks: true,
    purpose: "conversational",
    had: {},
    queued: {},
    held: {},
    heard: {},
    ...over,
  });
  const out = (id, over = {}) =>
    person(id, {
      deal: {
        stage: "proposed",
        sinceMs: now - 10 * DAY,
        proposal: { url: `https://docs.example.com/proposal/${id}` },
      },
      askedMs: now - 30 * DAY,
      ...over,
    });
  const stand = (r, f = facts()) => followUpStandOf(r, f, tz, now, null);
  // The sweep ticks at five past each hour (00048's cron): a run at eleven goes at its 11:05 tick.
  const at = (s) => Date.parse(s);
  // In its next run: today's, which waits for the owner under ask.
  assert.deepEqual(stand(out("a")), { kind: "will", atMs: at("2026-09-08T15:05:00Z"), asks: true });
  assert.equal(stand(out("a"), facts({ asks: false })).asks, false, "auto: it goes");
  // It ran today: tomorrow's.
  assert.equal(stand(out("a"), facts({ last_run_for: "2026-09-08" })).atMs, at("2026-09-09T15:05:00Z"));
  // A playbook reached them four days ago: the week's breath holds them to Friday's run; ending after Friday's tick,
  // to Saturday's.
  assert.equal(stand(out("a"), facts({ heard: { a: iso(now - 4 * DAY) } })).atMs, at("2026-09-11T15:05:00Z"));
  assert.equal(
    stand(out("a"), facts({ heard: { a: iso(now - 4 * DAY + 3 * HOUR) } })).atMs,
    at("2026-09-12T15:05:00Z"),
  );
  // The breath ending later today: today's run where it ends before the tick, tomorrow's where it ends after.
  assert.equal(
    stand(out("a"), facts({ heard: { a: iso(now - 7 * DAY + HOUR / 2) } })).atMs,
    at("2026-09-08T15:05:00Z"),
  );
  assert.equal(
    stand(out("a"), facts({ heard: { a: iso(now - 7 * DAY + 2 * HOUR) } })).atMs,
    at("2026-09-09T15:05:00Z"),
  );
  // Already in a run: on its way, it goes; made to wait for the owner, it waits, whatever the class says now.
  assert.deepEqual(stand(out("a"), facts({ queued: { a: iso(now - HOUR) } })), {
    kind: "will",
    atMs: now - HOUR,
    asks: false,
  });
  assert.deepEqual(stand(out("a"), facts({ asks: false, held: { a: iso(now - HOUR) } })), {
    kind: "will",
    atMs: now - HOUR,
    asks: true,
  });
  // A run made for an older proposal is not this one's: the next run is.
  assert.equal(stand(out("a"), facts({ held: { a: iso(now - 20 * DAY) } })).atMs, at("2026-09-08T15:05:00Z"));
  // This proposal's follow-up went: had it. An older proposal's is not this one's.
  assert.deepEqual(stand(out("a"), facts({ had: { a: iso(now - 2 * DAY) } })), { kind: "had", atMs: now - 2 * DAY });
  assert.equal(stand(out("a"), facts({ had: { a: iso(now - 20 * DAY) } })).kind, "will");
  // Nobody it will not reach: no link, no yes, no number, asked to stop, not waiting.
  const yes = person("x").consent;
  assert.equal(stand(out("b", { deal: { stage: "proposed", sinceMs: now - 10 * DAY, proposal: null } })), null);
  assert.equal(stand(out("c", { consent: { ...yes, state: "unknown", marketing: "unknown" } })), null);
  assert.equal(stand(out("d", { phone: null })), null);
  assert.equal(stand(out("e", { consent: { ...yes, state: "opted_out" } })), null);
  assert.equal(stand(out("f", { askedMs: now - DAY })), null, "they wrote since: not waiting");
  // A follow-up whose template Meta filed as marketing reaches only whoever said yes to offers too, as its send judges.
  const noOffers = out("g", { consent: { ...yes, marketing: "unknown" } });
  assert.equal(stand(noOffers).kind, "will", "a utility template: their yes to hearing from you is enough");
  assert.equal(stand(noOffers, facts({ purpose: "marketing" })), null);
  assert.equal(stand(out("h"), facts({ purpose: "marketing" })).kind, "will", "a yes to offers too: it reaches them");
  // The run's own day, as the sweep keeps it: its hour passed today and it has not run, the next tick while the hours
  // are open, the last at five past eight at night; after them, tomorrow at its hour's tick.
  assert.equal(followUpRunAt({ run_hour: 9, last_run_for: null }, tz, now, now), now + 5 * 60_000);
  const eight = at("2026-09-09T00:03:00Z"); // three past eight at night in New York, still the 8th
  assert.equal(followUpRunAt({ run_hour: 9, last_run_for: null }, tz, eight, eight), at("2026-09-09T00:05:00Z"));
  const halfPast = at("2026-09-09T00:30:00Z"); // half past eight: the hours' last tick has gone
  assert.equal(followUpRunAt({ run_hour: 9, last_run_for: null }, tz, halfPast, halfPast), at("2026-09-09T13:05:00Z"));
  const late = at("2026-09-09T01:30:00Z"); // half past nine at night
  assert.equal(followUpRunAt({ run_hour: 9, last_run_for: null }, tz, late, late), at("2026-09-09T13:05:00Z"));
});

test("a reach-out's step reaches nobody among People: its run is its own, and it never falls through to everyone (Reach out, Part 3)", () => {
  for (const trigger of ["lead_first", "after_step"]) {
    const drawn = playbookRunReach(
      [person("a"), person("b")],
      { trigger, policy_class: "outreach", cap_per_run: 25, gap_days: 90, cadence_days: 30 },
      noTouch,
      NOW,
      null,
    );
    assert.deepEqual([drawn.eligible, drawn.reach.pool], [[], 0], trigger);
  }
});
