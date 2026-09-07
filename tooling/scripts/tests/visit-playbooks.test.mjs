/**
 * The calendar closing its loop through Outbound: a reminder the day before
 * an appointment, a thank-you with the booking link the day after a visit.
 * Day-keyed by the calendar's own clock, one message per visit, exempt from
 * the gap and the week's breath, the visit's own words in the slots.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PLAYBOOK_TRIGGERS, PLAYBOOK_CLASS_LABEL, eligibleForPlaybook, scheduleLine, triggerOf, visitFactsFor, toPersonRowVM,
  parseParamSpec, resolveParams, exampleParams, PARAM_SOURCE_LABELS, starterForTrigger, starterDraft, starterText, visitDateKey, visitStartTime,
} from "@chanlytics/contracts";
import { readCode, readRaw } from "./_source.mjs";

// 10:00 in New York on Sunday 6 September 2026.
const NOW = new Date("2026-09-06T14:00:00Z");
const nowMs = NOW.getTime();
const TZ = "America/New_York";
const H = 3_600_000, D = 24 * H;
const iso = (msAgo) => new Date(nowMs - msAgo).toISOString();

function dto(id, over = {}) {
  return {
    id, display_name: `Person ${id}`, wa_profile_name: null, phone_e164: `+1305555${id.padStart(4, "0")}`,
    consent: "opted_in", consent_source: "keyword", consent_updated_at: iso(30 * D), dnc: false, channels: ["whatsapp"],
    conversation_count: 1, escalation_count: 0, needs_human: false, open_escalation_reason: null, open_escalation_since: null,
    latest_conversation_id: `cv-${id}`, latest_state: "open", latest_paused_until: null, latest_assignee_user_id: null, latest_snooze_until: null,
    latest_wa_inbound_at: iso(3 * D), last_message_at: iso(3 * D), last_message_direction: "inbound", last_message_sender: "customer",
    last_inbound_text: "hi", last_inbound_at: iso(3 * D), last_call_at: null, last_inbound_call_at: null, last_inbound_call_summary: null,
    call_count: 0, call_seconds: 0, first_contact_at: iso(60 * D), earliest_row_at: iso(60 * D), has_backfill: false, has_chat: true, queued_reply_at: null,
    effective_reply_mode: "auto", visits: null, ...over,
  };
}
const visit = (startIso, title, hours = 1) => ({ id: `v-${startIso}`, start: startIso, end: new Date(Date.parse(startIso) + hours * H).toISOString(), title, all_day: false, via: "phone" });
const withVisits = (id, next, last, over = {}) => toPersonRowVM(dto(id, { visits: { timezone: TZ, source: "Google Calendar", state: "ok", next, last }, ...over }), NOW);
const untouched = { byThis: new Map(), byAny: new Map() };

test("six triggers: four lists and cadences, two the calendar makes possible, each under one of the three autonomy rows", () => {
  assert.deepEqual(PLAYBOOK_TRIGGERS.map((t) => t.id), ["quiet_30", "new_week", "phoned_only", "everyone_monthly", "visit_tomorrow", "visited"]);
  assert.deepEqual(PLAYBOOK_TRIGGERS.map((t) => t.kind), ["list", "list", "list", "cadence", "visit", "visit"]);
  assert.equal(triggerOf("visit_tomorrow").cls, "booking", "the same setting that governs bookings governs their reminders");
  assert.equal(triggerOf("visited").cls, "reengage");
  assert.equal(PLAYBOOK_CLASS_LABEL.booking, "Booking");
  assert.equal(scheduleLine({ trigger: "visit_tomorrow", run_hour: 10, cap_per_run: 25, gap_days: 90, cadence_days: 30 }), "Daily 10:00 · everyone with a visit tomorrow · up to 25");
  assert.equal(scheduleLine({ trigger: "visited", run_hour: 18, cap_per_run: 25, gap_days: 90, cadence_days: 30 }), "Daily 18:00 · everyone who visited yesterday · up to 25");
  assert.equal(scheduleLine({ trigger: "quiet_30", run_hour: 10, cap_per_run: 25, gap_days: 90, cadence_days: 30 }), "Daily 10:00 · up to 25 · once per person, again after 90 days", "the old lines are the old lines");
});

test("a visit's day is the calendar's day: eleven at night tomorrow is still tomorrow, nine in the morning the day after is not", () => {
  const lateTomorrow = withVisits("a", visit("2026-09-08T03:00:00Z", "Balayage"), null);   // Mon 7 Sep, 11:00 PM New York
  const dayAfter = withVisits("b", visit("2026-09-08T13:00:00Z", "Gloss"), null);          // Tue 8 Sep, 9:00 AM New York
  const today = withVisits("c", visit("2026-09-06T20:00:00Z", "Trim"), null);              // Sun 6 Sep, 4:00 PM New York
  const earlyTomorrow = withVisits("d", visit("2026-09-07T12:30:00Z", "Cut"), null);       // Mon 7 Sep, 8:30 AM New York
  assert.equal(lateTomorrow.nextVisitDate, "2026-09-07");
  assert.equal(lateTomorrow.calendarTz, TZ);
  const p = { trigger: "visit_tomorrow", cap_per_run: 25, gap_days: 90, cadence_days: 30 };
  assert.deepEqual(eligibleForPlaybook([lateTomorrow, dayAfter, today, earlyTomorrow], p, untouched, nowMs).map((r) => r.id), ["d", "a"], "tomorrow's visits, earliest first");
  assert.deepEqual(eligibleForPlaybook([lateTomorrow, earlyTomorrow], { ...p, cap_per_run: 1 }, untouched, nowMs).map((r) => r.id), ["d"], "the cap");
  const noCalendar = toPersonRowVM(dto("e"), NOW);
  assert.deepEqual(eligibleForPlaybook([noCalendar], p, untouched, nowMs), [], "no calendar, nobody");
  const notYes = withVisits("f", visit("2026-09-07T15:00:00Z", "Cut"), null, { consent: "unknown" });
  assert.deepEqual(eligibleForPlaybook([notYes], p, untouched, nowMs), [], "a reminder is still a message: only to people who said yes");
});

test("after the visit: yesterday's visit with nothing booked next; the gap and the week's breath do not apply to either", () => {
  const yesterday = withVisits("a", null, visit("2026-09-06T00:00:00Z", "Balayage"));              // Sat 5 Sep, 8:00 PM New York
  const yesterdayRebooked = withVisits("b", visit("2026-09-20T15:00:00Z", "Gloss"), visit("2026-09-05T22:00:00Z", "Balayage"));
  const twoDaysAgo = withVisits("c", null, visit("2026-09-04T18:00:00Z", "Cut"));
  const p = { trigger: "visited", cap_per_run: 25, gap_days: 90, cadence_days: 30 };
  assert.deepEqual(eligibleForPlaybook([yesterday, yesterdayRebooked, twoDaysAgo], p, untouched, nowMs).map((r) => r.id), ["a"]);
  const heardThisWeek = { byThis: new Map([["a", nowMs - 2 * D]]), byAny: new Map([["a", nowMs - 1 * D]]) };
  assert.deepEqual(eligibleForPlaybook([yesterday], p, heardThisWeek, nowMs).map((r) => r.id), ["a"], "the reminder two days ago does not hold the thank-you");
  const tomorrow = withVisits("d", visit("2026-09-07T19:00:00Z", "Cut"), null);
  assert.deepEqual(eligibleForPlaybook([tomorrow], { ...p, trigger: "visit_tomorrow" }, heardThisWeek, nowMs).map((r) => r.id), ["d"], "nor does the month's offer hold a reminder");
});

test("the visit's own words: when and what for, from the visit the run read", () => {
  assert.deepEqual(visitFactsFor("visit_tomorrow", visit("2026-09-07T18:00:00Z", "Balayage"), TZ), { visit_when: "tomorrow at 2:00 PM", visit_service: "Balayage" });
  assert.deepEqual(visitFactsFor("visited", visit("2026-09-05T18:00:00Z", "  "), TZ), { visit_when: "yesterday", visit_service: "your appointment" });
  assert.equal(visitFactsFor("quiet_30", visit("2026-09-07T18:00:00Z", "Balayage"), TZ), null);
  assert.equal(visitFactsFor("visit_tomorrow", null, TZ), null);
  assert.equal(visitStartTime({ start: "2026-09-07T18:00:00Z" }, TZ), "2:00 PM");
  assert.equal(visitDateKey("2026-09-08T03:00:00Z", TZ), "2026-09-07");
  assert.deepEqual(parseParamSpec("@visit_when"), { kind: "visit_when" });
  assert.deepEqual(parseParamSpec({ kind: "visit_service" }), { kind: "visit_service" });
  assert.equal(PARAM_SOURCE_LABELS.visit_when, "Their visit's time");
  const specs = [{ kind: "first_name" }, { kind: "business_name" }, { kind: "visit_when" }, { kind: "visit_service" }];
  assert.deepEqual(resolveParams(specs, { firstName: "Ana", businessName: "Melany's", bookingLink: null, visitWhen: "tomorrow at 2:00 PM", visitService: "a balayage" }), ["Ana", "Melany's", "tomorrow at 2:00 PM", "a balayage"]);
  assert.deepEqual(resolveParams(specs, { firstName: "Ana", businessName: "Melany's", bookingLink: null }).slice(2), ["", ""], "no facts, no words: the send holds the person rather than sending a blank");
  assert.deepEqual(exampleParams(specs, "Melany's").slice(2), ["tomorrow at 2:00 PM", "a balayage"]);
});

test("two starters written for the two moments: a utility reminder with the visit's words, a marketing thank-you with the link, in both languages", () => {
  const reminder = starterForTrigger("visit_tomorrow");
  assert.equal(reminder.name, "visit_reminder");
  assert.equal(reminder.category, "utility", "a reminder of their own appointment is not marketing");
  assert.deepEqual(starterText(reminder, "en_US").slots.map((s) => s.kind), ["first_name", "business_name", "visit_when", "visit_service"]);
  assert.equal(starterText(reminder, "en_US").footer, null, "no opt-out line on a reminder");
  assert.ok(starterText(reminder, "es").body.includes("{{3}}") && starterText(reminder, "es").slots[2].label === "Cuándo");
  const thanks = starterForTrigger("visited");
  assert.equal(thanks.name, "after_visit");
  assert.equal(thanks.category, "marketing");
  assert.deepEqual(starterText(thanks, "en_US").slots.map((s) => s.kind), ["first_name", "business_name", "booking_link"]);
  assert.match(starterText(thanks, "en_US").footer, /STOP/);
  const draft = starterDraft(reminder, "en_US");
  assert.deepEqual(draft.examples, ["Dani", "Luna Studio", "tomorrow at 2:00 PM", "a balayage"]);
});

test("the wiring: the CHECKs, the facts column, the runner attaching the calendar and keeping the words, the send reading them, the page and the assistant", () => {
  const mig = readRaw("supabase/migrations/00063_visit_playbooks.sql");
  assert.ok(mig.includes("'visit_tomorrow', 'visited'") && mig.includes("('reengage', 'campaign', 'booking')") && mig.includes("add column if not exists facts jsonb"));
  const runner = readCode("apps/edge/lib/playbooks.ts");
  for (const s of ["feedItemsFor(tenantId, url, tz, now)", "visits.set(r.id, { timezone: tz, source: \"calendar\", state: \"ok\", next: toVisitDto(v.next), last: toVisitDto(v.last) })", "toPersonRowVM({ ...r, visits: visits.get(r.id) ?? null }, now)", 'skipped: "no_calendar"', "return visitFactsFor(p.trigger, p.trigger === \"visit_tomorrow\" ? (v?.next ?? null) : (v?.last ?? null), ctx.tz);"]) assert.ok(runner.includes(s), s);
  const handler = readCode("packages/jobs/src/handlers.ts");
  assert.ok(handler.includes('.select("contact_id, facts")') && handler.includes("visitWhen:") && handler.includes("visitService:"), "the send fills the slots from the row's own words");
  assert.ok(readCode("apps/dashboard/src/server/playbooks.ts").includes("a visit tomorrow, or a visit yesterday"));
  const sd = readCode("apps/dashboard/src/legacy-bridge/surface-data.ts");
  assert.ok(sd.includes("kind: t.kind") && sd.includes('calendar: people.calendar?.state ?? "none"'), "the page knows which triggers need the calendar, and whether there is one");
  const page = readCode("apps/dashboard/src/legacy/pages/outbound-real.jsx");
  assert.ok(page.includes('booking: "Bookings"') && page.includes('trig.kind === "visit"') && page.includes("needs the calendar connected"), "the composer says it plainly");
  assert.ok(page.includes("one message per visit · people who asked to stop") && page.includes("the day's visits are picked from them"), "no gap and no breath are promised for a visit trigger");
  assert.ok(page.includes('visit_when: "tomorrow at 2:00 PM"') && page.includes('visit_service: "a balayage"'), "the preview shows the visit's words");
  const tools = readCode("apps/dashboard/src/server/ask/tools.ts");
  assert.ok(tools.includes('booking: modeOf("booking")') && tools.includes("withVisits(t.ctx, t.tenantId, people, t.now)"), "the assistant counts with the calendar too");
});
