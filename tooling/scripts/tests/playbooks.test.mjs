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
  BROADCAST_STATES, DECISION_SUBJECTS, DECISION_VERBS, PLAYBOOK_BREATH_MS, PLAYBOOK_TRIGGERS, PLAYBOOK_VETO_DELAY_MS,
  eligibleForPlaybook, localDate, localHour, nextRunLabel, planRun, runDueNow, scheduleLine, toBroadcastVM, triggerOf,
} from "@chanlytics/contracts";
import { readCode, readRaw, importSrc } from "./_source.mjs";

const DAY = 86_400_000;
const NOW = Date.parse("2026-09-06T15:00:00Z");
const person = (id, over = {}) => ({
  id, state: "active", hasChat: true, calls: 0, phone: "+15551230001",
  consent: { state: "opted_in", dnc: false, label: "Opted in", sub: "", source: "in_person", marketing: "opted_in", marketingSource: "in_person", marketingSub: "" },
  lastContact: { ts: NOW - 40 * DAY, label: "" },
  ...over,
});
const base = { trigger: "quiet_30", cap_per_run: 25, gap_days: 90, cadence_days: 30 };
const noTouch = { byThis: new Map(), byAny: new Map() };

test("six triggers: four lists and cadences, two the calendar makes possible, each under one of the three autonomy rows", () => {
  assert.deepEqual(PLAYBOOK_TRIGGERS.map((t) => t.id), ["quiet_30", "new_week", "phoned_only", "everyone_monthly", "visit_tomorrow", "visited"]);
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
    person("d", { state: "active" }),
    person("e", { state: "quiet", lastContact: { ts: NOW - 60 * DAY, label: "" } }),
  ];
  assert.deepEqual(eligibleForPlaybook(rows, base, noTouch, NOW).map((r) => r.id), ["b", "e", "a"], "quiet, said yes, longest-unheard first");
  assert.deepEqual(eligibleForPlaybook(rows, { ...base, cap_per_run: 2 }, noTouch, NOW).map((r) => r.id), ["b", "e"], "the cap");
  const heardFromThis = { byThis: new Map([["b", NOW - 10 * DAY]]), byAny: new Map([["b", NOW - 10 * DAY]]) };
  assert.deepEqual(eligibleForPlaybook(rows, base, heardFromThis, NOW).map((r) => r.id), ["e", "a"], "heard from this playbook within the gap");
  const heardLongAgo = { byThis: new Map([["b", NOW - 100 * DAY]]), byAny: new Map([["b", NOW - 100 * DAY]]) };
  assert.deepEqual(eligibleForPlaybook(rows, base, heardLongAgo, NOW).map((r) => r.id), ["b", "e", "a"], "past the gap they are eligible again");
  const heardFromAnother = { byThis: new Map(), byAny: new Map([["e", NOW - 3 * DAY]]) };
  assert.deepEqual(eligibleForPlaybook(rows, base, heardFromAnother, NOW).map((r) => r.id), ["b", "a"], "one playbook message per person per week, across playbooks");
  assert.equal(PLAYBOOK_BREATH_MS, 7 * DAY);
  const monthly = eligibleForPlaybook(rows, { ...base, trigger: "everyone_monthly", cadence_days: 30 }, { byThis: new Map([["a", NOW - 20 * DAY]]), byAny: new Map([["a", NOW - 20 * DAY]]) }, NOW);
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
  assert.equal(runDueNow({ state: "running", run_hour: 10, last_run_for: "2026-09-06" }, "America/New_York", now), false, "once per local day");
  assert.equal(runDueNow({ state: "running", run_hour: 11, last_run_for: null }, "America/New_York", now), false, "not its hour yet");
  assert.equal(runDueNow({ state: "running", run_hour: 9, last_run_for: null }, "America/New_York", now), true, "an hour the sweep missed, or a playbook started after its hour, runs later the same day");
  assert.equal(runDueNow({ state: "running", run_hour: 9, last_run_for: null }, "America/New_York", new Date("2026-09-07T01:30:00Z")), false, "never past the last hour a message may go out (21:30 in New York)");
  assert.equal(runDueNow({ state: "paused", run_hour: 10, last_run_for: null }, "America/New_York", now), false);
  assert.equal(scheduleLine({ trigger: "quiet_30", run_hour: 10, cap_per_run: 25, gap_days: 90, cadence_days: 30 }), "Daily 10:00 · up to 25 · once per person, again after 90 days");
  assert.equal(scheduleLine({ trigger: "everyone_monthly", run_hour: 9, cap_per_run: 50, gap_days: 90, cadence_days: 30 }), "Every 30 days at 09:00 · up to 50 a day");
  assert.equal(nextRunLabel({ state: "running", run_hour: 11, last_run_for: null }, "America/New_York", now), "today 11:00");
  assert.equal(nextRunLabel({ state: "running", run_hour: 10, last_run_for: null }, "America/New_York", now), "today, within the hour");
  assert.equal(nextRunLabel({ state: "running", run_hour: 10, last_run_for: "2026-09-06" }, "America/New_York", now), "tomorrow 10:00");
  assert.equal(nextRunLabel({ state: "paused", run_hour: 10, last_run_for: null }, "America/New_York", now), "paused");
});

test("a run that waits for a person is open, never sent by the job, approved through its own door, skipped through cancel", () => {
  assert.ok(BROADCAST_STATES.includes("pending_approval"));
  const vm = toBroadcastVM({ id: "b", name: "n", template_id: "t", template_name: "x", template_language: "en", params: [], audience: { kind: "playbook", id: "p", label: "Win-back" }, state: "pending_approval", scheduled_for: "2026-09-06T15:00:00Z", started_at: null, finished_at: null, recipient_count: 3, failure: null, created_at: "2026-09-06T15:00:00Z", playbook_id: "p", run_for: "2026-09-06", counts: { queued: 3, sent: 0, skipped: 0, failed: 0, delivered: 0, read: 0, replied: 0 } });
  assert.equal(vm.open, true);
  assert.equal(vm.stateLabel, "Needs you");
  const h = readCode("packages/core/src/messages/broadcast.ts");
  assert.ok(h.includes('if (b.state !== "scheduled" && b.state !== "sending") return;'), "only a scheduled or sending broadcast goes out");
  // Approve and skip are run: core-campaigns.test.mjs.
  assert.ok(readCode("apps/dashboard/src/legacy/pages/broadcasts-real.jsx").includes('data-testid="bc-approve"'));
  assert.ok(DECISION_VERBS.includes("start_playbook") && DECISION_VERBS.includes("pause_playbook") && DECISION_SUBJECTS.includes("playbook"));
});

test("the migration and the sweep: one run per playbook per local day, touches never stored twice, the same door the other sweeps use, every run recorded", () => {
  const m = readRaw("supabase/migrations/00048_playbooks.sql");
  assert.ok(m.includes("create unique index broadcasts_playbook_run on public.broadcasts (playbook_id, run_for) where playbook_id is not null;"));
  assert.ok(m.includes("check (state in ('pending_approval', 'scheduled', 'sending', 'sent', 'canceled', 'failed'))"));
  assert.ok(m.includes("url     := v_url || '/api/cron/playbooks',") && m.includes("select cron.schedule('playbooks-sweep', '5 * * * *'"));
  assert.ok(m.includes("'start_playbook', 'pause_playbook'") && m.includes("'broadcast', 'playbook'"));
  assert.ok(!/create table public.playbook_touches/.test(m), "touches are derived from the runs' recipient rows");
  const s = readCode("apps/edge/api/cron/playbooks.ts");
  assert.ok(s.includes("runDueNow(p as unknown as PlaybookDto, tz, now)"), "by the business's clock");
  assert.ok(s.includes('await runPlaybook(ctx, p, { runFor, by: { kind: "system" } })'), "the sweep runs the one implementation");
  const r = readCode("apps/edge/lib/playbooks.ts");
  // The run's branches are run: core-run-playbook.test.mjs. The loader's touches stay pinned here.
  assert.ok(r.includes('.in("state", ["sent", "queued"])') && r.includes('const runs = (pastRuns ?? []).filter((b) => b.state !== "canceled" && b.state !== "failed");'), "a message on its way is a touch too, so two playbooks never both pick the same person in a week");
  assert.ok(readCode("apps/edge/api/admin/playbooks-run.ts").includes('runPlaybook(ctx, p as PlaybookRow, { by: { kind: "user", userId } })'));
  assert.ok(readCode("packages/contracts/src/config.ts").includes('note: "the win-back and save-our-number playbooks · auto sends each run, veto sends it 30 minutes later unless you stop it, ask leaves it waiting on Today, never runs nothing"') && readCode("apps/dashboard/src/legacy-bridge/policy-store.ts").includes('...W("reengage")'), "the Autonomy row says what the playbooks do, in the one set of words every surface reads");
});

test("the page and its doors: Outbound is Playbooks, real; make, change, pause, resume, run now, delete through the app's routes; a waiting run on Today", async () => {
  const reg = readCode("apps/dashboard/src/legacy-bridge/surface-registry.ts");
  assert.ok(reg.includes('outbound: "real"') && reg.includes('outbound: "playbooks"'), "flipped, and the gate waits on its surface");
  const page = readCode("apps/dashboard/src/legacy/pages/outbound-real.jsx");
  for (const id of ["playbooks-real", "pb-card", "pb-composer", "pb-trigger", "pb-template", "pb-save", "pb-cancel", "pb-run-now", "pb-pause", "pb-approve", "pb-skip", "pb-edit", "pb-delete"]) {
    assert.ok(page.includes(`data-testid="${id}"`), id);
  }
  assert.ok(page.includes('testid="pb-empty"'), "the empty state, through the one EmptyState, with the verb on it");
  assert.ok(page.includes("window.OutboundPage = (props) =>") && readCode("apps/dashboard/src/legacy/pages/outbound.jsx").includes("window.OutboundSeed = OutboundPage;"));
  assert.ok(!/\$[\d,]+|revenue|Attributed|booked/.test(page.replace(/\/\/[^\n]*/g, "")), "no number the schema has no column for");
  assert.ok(page.includes("<PolicyChip cls={p.policy_class} />"), "the mode chip is the workspace's, and opens Settings › Autonomy");
  const routes = readCode("apps/dashboard/app/api/v1/playbooks/route.ts");
  assert.ok(routes.includes('role: "operator",') && routes.includes('rate: "playbook",') && routes.includes('"start_playbook", {'));
  const one = readCode("apps/dashboard/app/api/v1/playbooks/[id]/route.ts");
  assert.ok(one.includes('state === "running" ? "start_playbook" : "pause_playbook"') && one.includes('"pause_playbook", { name: p.name, deleted: true }'), "pause, resume and delete are recorded");
  const run = readCode("apps/dashboard/app/api/v1/playbooks/[id]/run/route.ts");
  assert.ok(run.includes("runPlaybookNow(p.tenant_id, id, ctx.userId)") && run.includes("never: "), "run now says why nothing ran");
  const svc = readCode("apps/dashboard/src/server/service.ts");
  assert.ok(svc.includes("/api/admin/playbooks-run") && svc.includes("export async function runPlaybookNow("), "through the edge, production only");
  // The check is run: core-campaigns.test.mjs.
  const queue = readCode("apps/dashboard/src/legacy/pages/dashboard-a-command.jsx");
  assert.ok(queue.includes('testid="brief-run-row"') && queue.includes('r.state === "pending_approval"'), "Today's queue shows a run that waits, from the surface it already has");
  const { AFTER } = await importSrc("apps/dashboard/src/legacy-bridge/refresh-map.ts");
  for (const k of ["POST playbooks", "PUT playbooks/[id]", "DELETE playbooks/[id]", "POST playbooks/[id]/run", "POST broadcasts/[id]/approve", "POST broadcasts/[id]/cancel"]) assert.deepEqual(AFTER[k]().map((o) => o.key), ["playbooks", "broadcasts"], `${k}: every write re-fetches both surfaces`);
  const pools = readCode("apps/dashboard/src/server/playbooks.ts");
  assert.ok(pools.includes("cap_per_run: PLAYBOOK_POOL, gap_days: 0, cadence_days: 0 }, touches, now.getTime()).length"), "the chip counts the pool with the runner's own predicate -- with the week's touches, since slice C of the data program; on the server over everyone since Calendar 3 (run in calendar-counts.test.mjs)");
  assert.ok(readCode("apps/dashboard/src/legacy/components/surface-tabs.jsx").includes('{ id: "outbound", label: "Playbooks", to: "outbound" }'));
  assert.ok(readCode("apps/dashboard/src/legacy-bridge/LegacyApp.tsx").includes("broadcastsOverride, playbooksOverride"), "booted with the rest");
});

test("Ask knows playbooks: read as the page shows them, proposed as a card, committed through the app's route, undone by deleting; Today says what ran; a run's thread names its playbook", async () => {
  const { PROPOSAL_GATE, buildAskSuggestions } = await import("@chanlytics/contracts");
  assert.equal(PROPOSAL_GATE.playbook, "approve");
  const tools = readCode("apps/dashboard/src/server/ask/tools.ts");
  assert.ok(tools.includes('name: "list_playbooks"') && tools.includes('case "list_playbooks": out = await listPlaybooksTool(t); break;'));
  assert.ok(tools.includes("listPlaybooks(t.ctx, t.tenantId)") && tools.includes("nextRunLabel(p, facts.timezone, t.now)"), "the same rows and words as the page");
  assert.ok(tools.includes("Nothing here has run because you read it."));
  const pr = readCode("apps/dashboard/src/server/ask/proposals.ts");
  assert.ok(pr.includes('name: "propose_playbook"') && pr.includes('case "propose_playbook": return await proposePlaybook(t, input);'));
  assert.ok(pr.includes("checked = await checkPlaybookInput(t.ctx, t.tenantId, {"), "checked the way the route checks it");
  assert.ok(pr.includes("starter is not approved on this workspace yet"), "no template and no starter is an honest refusal");
  assert.ok(pr.includes("ask the person what to say there, then propose again with params"), "a typed slot is a question, never invented words");
  assert.ok(pr.includes('kind: "playbook",') && pr.includes('undo: "Delete it — nothing will run",'));
  const c = readCode("apps/dashboard/src/legacy-bridge/ask/commit.ts");
  assert.ok(c.includes('case "playbook": {') && c.includes('viaAsk(client, "POST playbooks", {') && c.includes('viaAsk(client, "DELETE playbooks/[id]", { params: { id: s(u.playbook_id) } }, undoOf)'));
  const turn = readCode("apps/dashboard/src/legacy/pages/ask-turn.jsx");
  assert.ok(turn.includes("playbook: t.kPlaybook") && turn.includes('playbook: "bolt"') && turn.includes('p.kind === "playbook" ? "outbound"'));
  assert.ok(readCode("apps/dashboard/src/server/ask/prompt.ts").includes('"playbook": "A standing rule'));
  const sug = buildAskSuggestions({ surface: "people", language: "en", needsYou: 0, heldDrafts: 0, missedToday: 0, liveNow: 0, hasCalendar: false, canAct: true });
  assert.ok(sug.some((x) => x.kind === "act" && x.q === "Start a win-back playbook for the quiet clients"), "an Act suggestion on People");
  const brief = readCode("apps/dashboard/src/legacy/pages/dashboard-a-brief.jsx");
  assert.ok(brief.includes('data-testid="brief-run-done"') && brief.includes('{r.playbook_id ? "ran" : "went out"}'), "Today says what went out today");
  const h = readCode("packages/core/src/messages/broadcast.ts");
  assert.ok(h.includes("playbook_name: String((b.audience as { label?: unknown } | null)?.label ?? b.name)"), "a run's message names its playbook");
  assert.ok(readCode("packages/contracts/src/viewmodels.ts").includes('{ kind: "playbook" as const, name: String(m.meta.playbook_name) }'));
  assert.ok(readCode("apps/dashboard/src/legacy/pages/inbox-thread.jsx").includes("`the ${entry.via.name} playbook`"));
  assert.ok(!readCode("apps/dashboard/src/legacy/pages/broadcasts-real.jsx").includes("Not available yet"), "no disabled channel chips until a second channel is real");
});
