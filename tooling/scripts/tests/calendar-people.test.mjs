/**
 * The people in the calendar: who an appointment is for, read from the
 * words a booking tool wrote into the owner's calendar.
 *
 * The feed now carries the description, the place and the guests; a phone
 * found anywhere in the event beats a name; a name only counts whole and
 * four letters or more. The same match feeds the board's panel, the
 * person's profile and both receptionists — one person everywhere.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseIcs, extractContacts, personInText, matchPerson, visitsOf, visitDay, visitTime, visitLine,
  describeVisits, feedSourceLabel, eventText, toVisitDto, toPersonVM, afterPersonRefused,
} from "@chanlytics/contracts";
import { readCode } from "./_source.mjs";

const TZ = "America/New_York";
const ICS = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "BEGIN:VEVENT",
  "UID:b1",
  "SUMMARY:Maria Lopez - Balayage",
  "DESCRIPTION:Booked via Booksy\\nPhone: (305) 555-0134\\nEmail: maria.lopez",
  " @gmail.com\\nNotes: first time\\, wants ash tones",
  "LOCATION:Melany's Beauty Salon\\, 123 Main St",
  "DTSTART;TZID=America/New_York:20260908T140000",
  "DTEND;TZID=America/New_York:20260908T170000",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:b2",
  "SUMMARY:Haircut",
  "ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;CN=\"Ruiz, Ana: VIP\";X-NUM-GUESTS=0:mailto:ana@example.com",
  "ATTENDEE;CN=Melany Owner:mailto:owner@salon.com",
  "DTSTART;TZID=America/New_York:20260910T100000",
  "DTEND;TZID=America/New_York:20260910T110000",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:b3",
  "SUMMARY:Daniela Ruiz · Colour",
  "DTSTART;TZID=America/New_York:20260820T100000",
  "DTEND;TZID=America/New_York:20260820T120000",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:b4",
  "SUMMARY:Lunch",
  "DESCRIPTION:Order #2026-09-08 14:00 confirmed 123456789012",
  "DTSTART;TZID=America/New_York:20260909T130000",
  "DTEND;TZID=America/New_York:20260909T133000",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

const NOW = Date.parse("2026-09-06T16:00:00.000Z");
const feed = () => parseIcs(ICS, TZ, { horizon: { from: NOW - 90 * 86_400_000, to: NOW + 60 * 86_400_000 } });

test("the feed carries the description, the place and the guests — folded, unescaped, quoted parameters intact", () => {
  const f = feed();
  const maria = f.items.find((i) => i.uid === "b1");
  assert.equal(maria.description, "Booked via Booksy\nPhone: (305) 555-0134\nEmail: maria.lopez@gmail.com\nNotes: first time, wants ash tones");
  assert.equal(maria.location, "Melany's Beauty Salon, 123 Main St");
  assert.deepEqual(maria.attendees, []);
  const cut = f.items.find((i) => i.uid === "b2");
  assert.deepEqual(cut.attendees, [{ name: "Ruiz, Ana: VIP", email: "ana@example.com" }, { name: "Melany Owner", email: "owner@salon.com" }], "a quoted CN may hold : and ;");
  assert.equal(cut.description, null);
  assert.ok(f.items.every((i) => Array.isArray(i.attendees)));
});

test("phones and emails are found wherever they were written; a date, a time and an order number are not phones; an email's digits are not either", () => {
  const f = feed();
  const c = extractContacts(f.items.find((i) => i.uid === "b1"));
  assert.deepEqual(c.phones, ["+13055550134"]);
  assert.deepEqual(c.emails, ["maria.lopez@gmail.com"]);
  const g = extractContacts(f.items.find((i) => i.uid === "b2"));
  assert.deepEqual(g.emails, ["ana@example.com", "owner@salon.com"]);
  assert.deepEqual(g.names, ["Ruiz, Ana: VIP", "Melany Owner"]);
  const lunch = extractContacts(f.items.find((i) => i.uid === "b4"));
  assert.deepEqual(lunch.phones, [], "2026-09-08 14:00 and a bare 12-digit run are not phones");
  assert.deepEqual(extractContacts({ title: "Call +1 305 555 0134 or 305.555.0199", description: "user2025@x.com 3055550177 ext", location: null, attendees: [] }).phones, ["+13055550134", "+13055550199", "+13055550177"]);
});

const PEOPLE = [
  { id: "p-maria", name: "Maria Lopez", phone: "+13055550134" },
  { id: "p-dani", name: "Dani", phone: "+13055550100" },
  { id: "p-daniela", name: "Daniela Ruiz", phone: null },
  { id: "p-ana", name: "Ana", phone: null },
  { id: "p-num", name: "", phone: "+13055550199" },
];

test("a name counts only whole and four letters or more; the longest wins; never a phone made words", () => {
  assert.equal(personInText("Daniela Ruiz · Colour", PEOPLE)?.id, "p-daniela", "Dani is not inside Daniela");
  assert.equal(personInText("Dani · trim", PEOPLE)?.id, "p-dani");
  assert.equal(personInText("Ana Ruiz - haircut", PEOPLE), null, "three letters is not a match");
  assert.equal(personInText("+1 (305) 555-0199", PEOPLE), null, "a phone shown as a name matches nothing");
  assert.equal(personInText("MARIA LOPEZ", PEOPLE)?.id, "p-maria", "case does not matter");
});

test("who it is for: a phone in the event beats the name; a guest's name matches; a name-only match says so", () => {
  const f = feed();
  const maria = matchPerson(f.items.find((i) => i.uid === "b1"), PEOPLE);
  assert.deepEqual(maria, { id: "p-maria", name: "Maria Lopez", via: "phone" });
  const byPhoneOnly = matchPerson({ title: "Balayage", description: "305-555-0199", location: null, attendees: [] }, PEOPLE);
  assert.deepEqual(byPhoneOnly, { id: "p-num", name: "+1 (305) 555-0199", via: "phone" }, "a person known only by number is still found, and labelled by it");
  const cut = matchPerson(f.items.find((i) => i.uid === "b2"), [...PEOPLE, { id: "p-vip", name: "Ruiz, Ana: VIP", phone: null }]);
  assert.deepEqual(cut, { id: "p-vip", name: "Ruiz, Ana: VIP", via: "name" }, "a guest's name");
  assert.equal(matchPerson(f.items.find((i) => i.uid === "b4"), PEOPLE), null, "lunch is nobody's");
});

test("their visits: the next one that has not ended, the latest one that has; the words by the business's clock", () => {
  const f = feed();
  const v = visitsOf(f.items, PEOPLE[0], NOW);
  assert.equal(v.next?.title, "Maria Lopez - Balayage");
  assert.equal(v.next?.via, "phone");
  assert.equal(v.last, null);
  const d = visitsOf(f.items, PEOPLE[2], NOW);
  assert.equal(d.next, null);
  assert.equal(d.last?.title, "Daniela Ruiz · Colour");
  assert.equal(visitDay(v.next.start, TZ, NOW), "Tue, Sep 8");
  assert.equal(visitDay(NOW + 3_600_000, TZ, NOW), "Today");
  assert.equal(visitDay(NOW + 86_400_000, TZ, NOW), "Tomorrow");
  assert.equal(visitTime(v.next, TZ), "2:00 – 5:00 PM");
  assert.equal(visitTime({ start: v.next.start, end: v.next.end, allDay: true }, TZ), "all day");
  assert.equal(visitLine(v.next, TZ, NOW), "Tue, Sep 8 · 2:00 – 5:00 PM");
  const dto = toVisitDto(v.next);
  assert.equal(dto.start, "2026-09-08T18:00:00.000Z");
  assert.equal(dto.all_day, false);
  assert.equal(visitLine(dto, TZ, NOW), "Tue, Sep 8 · 2:00 – 5:00 PM", "the same words from the wire");
  assert.equal(toVisitDto(null), null);
});

test("the receptionist's lines: the next appointment, the last visit, the rule that nothing changes here, and a name-only match flagged", () => {
  const f = feed();
  const words = describeVisits(visitsOf(f.items, PEOPLE[0], NOW), TZ, NOW);
  assert.equal(words, "Their next appointment on the calendar: Tue, Sep 8 · 2:00 – 5:00 PM (Maria Lopez - Balayage). If they ask, confirm it; to change or cancel it, send the booking link — nothing is changed from here.");
  const byName = describeVisits(visitsOf(f.items, { id: "x", name: "Maria Lopez", phone: null }, NOW), TZ, NOW);
  assert.ok(byName.includes("Matched by name only — make sure it is them before confirming details."));
  const last = describeVisits(visitsOf(f.items, PEOPLE[2], NOW), TZ, NOW);
  assert.equal(last, "Their last visit on the calendar: Aug 20 (Daniela Ruiz · Colour).");
  assert.equal(describeVisits({ next: null, last: null }, TZ, NOW), null, "nothing to say is null, never a sentence");
});

test("the calendar's name from its address, and a description as plain text", () => {
  assert.equal(feedSourceLabel("https://calendar.google.com/calendar/ical/x/private-abc/basic.ics"), "Google Calendar");
  assert.equal(feedSourceLabel("webcal://p12-caldav.icloud.com/published/2/abc"), "Apple Calendar");
  assert.equal(feedSourceLabel("https://outlook.office365.com/owa/calendar/abc/calendar.ics"), "Outlook");
  assert.equal(feedSourceLabel("https://booksy.example/feed.ics"), "your calendar");
  assert.equal(feedSourceLabel(null), "your calendar");
  assert.equal(eventText("<b>Booked</b> via Booksy<br>Phone: 305 &amp; more<p>Notes</p>"), "Booked via Booksy\nPhone: 305 & more\nNotes");
  assert.equal(eventText("   "), null);
  assert.equal(eventText("x".repeat(2000)).length, 1500);
});

const ROW = {
  id: "p-maria", display_name: "Maria Lopez", wa_profile_name: null, phone_e164: "+13055550134", consent: "unknown", consent_source: null, consent_updated_at: null,
  dnc: false, channels: ["whatsapp"], conversation_count: 0, escalation_count: 0, needs_human: false, open_escalation_reason: null, open_escalation_since: null,
  latest_conversation_id: null, latest_state: null, latest_paused_until: null, latest_assignee_user_id: null, latest_snooze_until: null, latest_wa_inbound_at: null,
  last_message_at: null, last_message_direction: null, last_message_sender: null, last_inbound_text: null, last_inbound_at: null, last_call_at: null, last_inbound_call_at: null, call_count: 0, call_seconds: 0,
  first_contact_at: null, earliest_row_at: null, has_backfill: false, has_chat: false, queued_reply_at: null,
};
const detail = (visits) => ({ row: ROW, identities: [], conversations: [], calls: [], escalations: [], decisions: [], receptionist_mode: null, workspace_reply_mode: "auto", ...(visits ? { visits } : {}) });
const detail_ = (over = {}) => ({ row: { ...ROW, ...over }, identities: [], conversations: [], calls: [], escalations: [], decisions: [], receptionist_mode: null, workspace_reply_mode: "auto" });

test("the profile: a Next visit fact and About rows when the calendar is connected; nothing invented when it is not", () => {
  const now = new Date(NOW);
  const none = toPersonVM(detail(null), TZ, now);
  assert.ok(!none.facts.some((f) => f.label === "Next visit") && !none.about.some((a) => a.k === "Next visit"), "no calendar, no line");
  const next = { id: "b1:1", start: "2026-09-08T18:00:00.000Z", end: "2026-09-08T21:00:00.000Z", title: "Maria Lopez - Balayage", all_day: false, via: "phone" };
  const last = { id: "b0:1", start: "2026-08-20T14:00:00.000Z", end: "2026-08-20T16:00:00.000Z", title: "Colour", all_day: false, via: "name" };
  const vm = toPersonVM(detail({ timezone: TZ, source: "Google Calendar", state: "ok", next, last }), TZ, now);
  const fact = vm.facts.find((f) => f.label === "Next visit");
  assert.deepEqual(fact, { label: "Next visit", value: "Tue, Sep 8", meta: "2:00 – 5:00 PM" }, "the cell is narrow: the time here, the service in About");
  assert.deepEqual(vm.about.filter((a) => a.k === "Next visit" || a.k === "Last visit"), [
    { k: "Next visit", v: "Tue, Sep 8 · 2:00 – 5:00 PM · Maria Lopez - Balayage" },
    { k: "Last visit", v: "Thu, Aug 20 · 10:00 AM – 12:00 PM · Colour" },
  ]);
  const empty = toPersonVM(detail({ timezone: TZ, source: "Google Calendar", state: "ok", next: null, last: null }), TZ, now);
  assert.deepEqual(empty.facts.find((f) => f.label === "Next visit"), { label: "Next visit", value: "—", meta: "none booked" });
  const down = toPersonVM(detail({ timezone: TZ, source: "Google Calendar", state: "unavailable", next: null, last: null }), TZ, now);
  assert.equal(down.about.find((a) => a.k === "Next visit").v, "Calendar could not be read");
  const byName = toPersonVM(detail({ timezone: TZ, source: "Google Calendar", state: "ok", next: { ...next, via: "name" }, last: null }), TZ, now);
  assert.ok(byName.facts.find((f) => f.label === "Next visit").meta.endsWith("· by name"));
  assert.equal(down.facts.find((f) => f.label === "Next visit").meta, "could not be read");
});

test("the wiring: the board and the profile read one match; both receptionists are told; the panel says who it is for and where it comes from", () => {
  const svc = readCode("apps/dashboard/src/server/calendar.ts");
  assert.ok(svc.includes("export async function personVisits(") && svc.includes("const v = visitsIn(index, person, now.getTime());"), "the profile's visits, from the same feed and match");
  assert.ok(svc.includes("source: feedSourceLabel(url)"), "the calendar's name, never its address");
  assert.ok(!svc.includes("personInTitle"), "the old name-only match is gone");
  const route = readCode("apps/dashboard/app/api/v1/contacts/[id]/route.ts");
  assert.ok(route.includes("const visits = await personVisits(ctx, tenantId, personLike(row)).catch(") && route.includes("visits: visits ?? undefined,"), "never fatal to the profile");
  const edge = readCode("apps/edge/lib/availability.ts");
  assert.ok(edge.includes("export async function visitsFor(rt: TenantRuntime, who: { phone: string | null; name: string | null }") && edge.includes("return describeVisits(visitsOf(feed.items, { id: \"caller\", name: who.name ?? \"\", phone: who.phone }, now.getTime()), rt.timezone, now.getTime());"));
  const wa = readCode("apps/edge/lib/whatsapp/inbound.ts");
  assert.ok(wa.includes("const visits = rt ? await ports.calendar.visits(rt, { phone: e164, name: lead.name }) : null;") && wa.includes("if (visits) leadNote = `${leadNote}\\n${visits}`;"), "WhatsApp: with who they are");
  // Phone: the visits in the caller context, and a call for a switched-off
  // channel telling the platform as a text does: run in call-start.test.mjs.
  const page = readCode("apps/dashboard/src/legacy/pages/calendar-real.jsx");
  for (const id of ["cal-panel-person", "cal-panel-contact", "cal-panel-where", "cal-panel-desc"]) assert.ok(page.includes(`data-testid="${id}"`), id);
  assert.ok(page.includes("From {source}. The receptionist treats this time as taken; to change or cancel it, edit it there."), "one line, no feed counts");
  assert.ok(!page.includes("read just now") && !page.includes("feedLine"), "the chip's sentence stays on the chip");
  assert.ok(page.includes("matched by {b.person.via}") && page.includes("Not in People yet"));
  const dto = readCode("packages/contracts/src/calendar.ts");
  assert.ok(dto.includes("source: dto.feed.source ?? \"your calendar\"") && dto.includes("From ${dto.feed.source ?? \"your calendar\"} · read"), "the chip names the calendar");
});

test("the client's name as the event gives it: a guest first, then the title's name-like part, never a service or a plain description", async () => {
  const { guessName } = await import("@chanlytics/contracts");
  const svcs = ["Balayage", "Haircut", "Hair coloring"];
  const t = (title, attendees = []) => guessName({ title, attendees }, svcs);
  assert.equal(t("Maria Lopez - Balayage"), "Maria Lopez");
  assert.equal(t("Balayage · Maria Lopez"), "Maria Lopez");
  assert.equal(t("Haircut with Maria Lopez"), "Maria Lopez");
  assert.equal(t("Booksy: Maria Lopez (Balayage)"), "Maria Lopez");
  assert.equal(t("Ana Ruiz — Haircut"), "Ana Ruiz");
  assert.equal(t("Salon Appointment Hair coloring"), null, "no name in it");
  assert.equal(t("Team training"), null);
  assert.equal(t("Lunch, every day"), null);
  assert.equal(t("Balayage"), null, "a service alone");
  assert.equal(t("Haircut", [{ name: "Ruiz, Ana: VIP", email: "ana@example.com" }]), "Ruiz, Ana: VIP", "a guest's name wins");
  assert.equal(t("Haircut", [{ name: null, email: "ana@example.com" }]), null, "an email is not a name");
});

test("people from a feed: one row per phone inside the window, the soonest upcoming appointment keys it, a name fills in from another", async () => {
  const { peopleFromItems } = await import("@chanlytics/contracts");
  const f = feed();
  const rows = peopleFromItems(f.items, ["Balayage", "Haircut"], NOW);
  assert.deepEqual(rows.map((r) => [r.phone, r.name, r.title]), [["+13055550134", "Maria Lopez", "Maria Lopez - Balayage"]], "only the appointment with a number; lunch's order number is not one");
  const mk = (uid, title, start, description = null) => ({ start, end: start + 3_600_000, title, allDay: false, uid, description, location: null, attendees: [] });
  const many = [
    mk("p1", "Balayage", NOW + 5 * 86_400_000, "305-555-0199"),
    mk("p2", "Ana Ruiz - Haircut", NOW + 2 * 86_400_000, "305-555-0199"),
    mk("p3", "Haircut", NOW - 3 * 86_400_000, "305-555-0199"),
    mk("p4", "Old one", NOW - 60 * 86_400_000, "305-555-0177"),
    mk("p5", "Far one", NOW + 120 * 86_400_000, "305-555-0166"),
  ];
  const out = peopleFromItems(many, ["Balayage", "Haircut"], NOW);
  assert.deepEqual(out.map((r) => [r.phone, r.name, r.uid]), [["+13055550199", "Ana Ruiz", "p2"]], "the soonest upcoming keys the row; outside the window is left alone");
  const named = peopleFromItems([mk("q1", "Balayage", NOW + 86_400_000, "305-555-0155"), mk("q2", "Lola Diaz - Haircut", NOW + 3 * 86_400_000, "305-555-0155")], ["Balayage", "Haircut"], NOW);
  assert.deepEqual(named.map((r) => [r.name, r.uid]), [["Lola Diaz", "q1"]], "a later appointment with a name fills in for the one without");
});

test("one refused number costs one person, never everyone behind them", () => {
  // 22023 is create_person's own refusal of THIS row: a phone that is not in
  // international form, or a name over 80 characters. The read used to `break`
  // on it, so a single short code sitting on the calendar silently kept every
  // later person out of People for as long as it stayed there -- and said so
  // only in a log line nobody reads.
  assert.equal(afterPersonRefused("22023"), "skip");

  // Everything else fails the same way for all forty rows, so proving it forty
  // times during a page load helps nobody.
  for (const code of ["28000", "P0002", "42501", "PGRST202", "57014"]) {
    assert.equal(afterPersonRefused(code), "stop", code);
  }

  // Unknown means unproven, and the safe unknown is the one that does less.
  // It is also the old behaviour, so a client that stops reporting codes
  // degrades to what shipped rather than to forty futile calls.
  assert.equal(afterPersonRefused(undefined), "stop");
  assert.equal(afterPersonRefused(null), "stop");
  assert.equal(afterPersonRefused(""), "stop");

  const svc = readCode("apps/dashboard/src/server/calendar.ts");
  assert.ok(
    svc.includes('if (afterPersonRefused(error.code) === "skip") {') && svc.includes("continue;"),
    "the read must ASK the rule rather than deciding inline",
  );
  // The bare `break` is what this test exists to prevent coming back.
  assert.ok(
    !/if \(error\) \{[^}]*\n\s*break;/.test(svc),
    "a refusal must not end the batch before the rule has been consulted",
  );
  assert.ok(
    svc.includes('console.error("calendar_people_refused"') && svc.includes("refused, of: rows.length, added: added.length"),
    "and it says once how many people the refusals cost, not once per row",
  );
});

test("automatically: an hourly sweep on the edge and the owner's own read both put the feed's people in People through one extraction; the profile says where they came from; no button", () => {
  const mig = readCode("supabase/migrations/00052_create_person.sql");
  assert.ok(mig.includes("create or replace function public.create_person(p_tenant_id uuid, p_phone_e164 text, p_display_name text, p_source text)"));
  assert.ok(mig.includes("security definer") && mig.includes("if p_tenant_id is null or not public.is_acting_member(p_tenant_id) then"), "owner or operator");
  assert.ok(mig.includes("insert into contacts (tenant_id, phone_e164, display_name)") && !/insert into contacts \([^)]*consent|set consent/.test(mig), "consent is not touched: a booking is not a yes");
  assert.ok(mig.includes("where id = v_id and display_name is null;"), "a name fills only an empty one");
  const sweep = readCode("supabase/migrations/00053_calendar_people_sweep.sql");
  assert.ok(sweep.includes("url     := v_url || '/api/cron/calendar',") && sweep.includes("select cron.schedule('calendar-people-sweep',"), "pg_cron calls the edge every hour, like the other sweeps");
  const lib = readCode("apps/edge/lib/calendar-people.ts");
  assert.ok(lib.includes('.insert({ tenant_id: tenantId, phone_e164: r.phone, display_name: r.name })') && lib.includes('if (iErr.code !== "23505") throw') && lib.includes('kind: "contact.added", category: "contact"'), "get-or-create with the service role, an event for each person created");
  assert.ok(lib.includes('.is("display_name", null)'), "a name fills only an empty one");
  const svc = readCode("apps/dashboard/src/server/calendar.ts");
  assert.ok(svc.includes("if (opts.canAct) people.push(...await addPeopleSeen(") && svc.includes('ctx.supabase.rpc("create_person", { p_tenant_id: tenantId, p_phone_e164: r.phone, p_display_name: r.name ?? "", p_source: "calendar", p_title: r.title })'), "an owner's read adds through the door, before the board is matched");
  assert.ok(sweep.includes("insert into events (tenant_id, kind, category, subject_type, subject_id, data)") && sweep.includes("'contact.added'"), "the door records where a person came from; members cannot write events themselves");
  assert.ok(readCode("apps/dashboard/app/api/v1/calendar/route.ts").includes('const canAct = member.role === "owner" || member.role === "operator";'), "a viewer's read changes nothing");
  const route = readCode("apps/dashboard/app/api/v1/contacts/route.ts");
  assert.ok(route.includes('role: "operator",') && route.includes('ctx.supabase.rpc("create_person"'), "the door's own route stays, for a hand");
  const detail = readCode("apps/dashboard/app/api/v1/contacts/[id]/route.ts");
  assert.ok(detail.includes('.eq("kind", "contact.added")') && detail.includes("added: added.data"), "the profile reads where they came from");
  const page = readCode("apps/dashboard/src/legacy/pages/calendar-real.jsx");
  assert.ok(!page.includes("cal-panel-add") && !page.includes("__addPerson"), "no button on the CALENDAR: added on its own, deleted from the profile if unwanted");
  assert.ok(page.includes('"Not in People yet — added within the hour"'));
  // The hand's door has its screen on People now (slice D of the data program):
  // the same route, a number and a name, opening the person it made or found.
  assert.ok(readCode("apps/dashboard/src/legacy-bridge/people-detail.ts").includes('return api()("POST contacts", { body });'), "the bridge verb, through the same door");
  const edgeAv = readCode("apps/edge/lib/availability.ts");
  assert.ok(edgeAv.includes("export async function feedItemsFor(tenantId: string, url: string, tz: string, now = new Date(), daysAhead = 14)"), "the sweep reads the feed through the same cache");
});

test("the profile: Added from your calendar, with the appointment that named them", () => {
  const now = new Date(NOW);
  const vm = toPersonVM(detail(null), TZ, now);
  assert.ok(!vm.about.some((a) => a.k === "Added"));
  const fromCal = toPersonVM({ ...detail(null), added: { at: "2026-09-06T14:00:00.000Z", source: "calendar", title: "Maria Lopez - Balayage" } }, TZ, now);
  assert.equal(fromCal.about.find((a) => a.k === "Added").v, "Sep 6, 2026 · from your calendar (Maria Lopez - Balayage)");
  const byHand = toPersonVM({ ...detail(null), added: { at: "2026-09-06T14:00:00.000Z", source: "manual", title: null } }, TZ, now);
  assert.equal(byHand.about.find((a) => a.k === "Added").v, "Sep 6, 2026 · by hand");
});

test("a feed indexed once matches many people the same way the per-item matcher does: number first, whole name second", async () => {
  const { indexFeed, visitsIn } = await import("@chanlytics/contracts");
  const f = feed();
  const index = indexFeed(f.items);
  for (const p of PEOPLE) {
    const a = visitsOf(f.items, p, NOW);
    const b = visitsIn(index, p, NOW);
    assert.deepEqual(b, a, p.id);
  }
  assert.equal(index.byPhone.get("+13055550134").length, 1);
  assert.equal(index.texts.length, f.items.length);
});

test("Booked and Asked-never-booked are facts from the calendar on the row: the chip's day, the two lists, the two counts; without a calendar the lists do not exist", async () => {
  const { toPersonRowVM, PEOPLE_LISTS, peopleAggregates } = await import("@chanlytics/contracts");
  const now = new Date(NOW);
  const next = { id: "b1:1", start: "2026-09-08T18:00:00.000Z", end: "2026-09-08T21:00:00.000Z", title: "Balayage", all_day: false, via: "phone" };
  const last = { id: "b0:1", start: "2026-08-20T14:00:00.000Z", end: "2026-08-20T16:00:00.000Z", title: "Colour", all_day: false, via: "phone" };
  const cal = (v) => ({ timezone: TZ, source: "Google Calendar", state: "ok", next: null, last: null, ...v });
  const asked = { ...ROW, id: "a", last_inbound_at: "2026-09-04T12:00:00.000Z", last_call_at: null };
  const booked = toPersonRowVM({ ...asked, id: "b", visits: cal({ next }) }, TZ, now);
  assert.equal(booked.booked, true);
  assert.equal(booked.nextVisitDay, "Tue, Sep 8");
  assert.equal(booked.nextVisit, "Tue, Sep 8 · 2:00 – 5:00 PM · Balayage");
  assert.equal(booked.askedNotBooked, false, "booked is not asked-never-booked");
  const gap = toPersonRowVM({ ...asked, visits: cal({}) }, TZ, now);
  assert.equal(gap.askedNotBooked, true, "wrote this month, the calendar never had them");
  assert.equal(gap.askedMs, Date.parse("2026-09-04T12:00:00.000Z"));
  const visited = toPersonRowVM({ ...asked, id: "v", visits: cal({ last }) }, TZ, now);
  assert.equal(visited.askedNotBooked, false, "they have been on the calendar before");
  assert.equal(visited.lastVisit, "Thu, Aug 20 · 10:00 AM – 12:00 PM · Colour");
  const stale = toPersonRowVM({ ...asked, id: "s", last_inbound_at: "2026-07-01T12:00:00.000Z", visits: cal({}) }, TZ, now);
  assert.equal(stale.askedNotBooked, false, "asked more than a month ago is not this list");
  const noCal = toPersonRowVM({ ...asked, id: "n", visits: null }, TZ, now);
  assert.equal(noCal.calendar, "none");
  assert.equal(noCal.askedNotBooked, false, "no calendar: nothing to say");
  const bookedList = PEOPLE_LISTS.find((l) => l.id === "booked");
  const askedList = PEOPLE_LISTS.find((l) => l.id === "asked_never_booked");
  assert.ok(bookedList.needsCalendar && askedList.needsCalendar, "shown only when the calendar is connected");
  assert.ok(bookedList.test(booked) && !bookedList.test(gap));
  assert.ok(askedList.test(gap) && !askedList.test(booked) && !askedList.test(visited));
  assert.deepEqual([...PEOPLE_LISTS].map((l) => l.id).slice(0, 7), ["needs_you", "waiting_on_you", "new_week", "booked_week", "booked", "asked_never_booked", "lapsed"], "attention, then the journey");
  const agg = peopleAggregates([booked, gap, visited, stale, noCal], NOW);
  assert.equal(agg.booked, 1);
  assert.equal(agg.askedNotBooked, 1);
});

test("asked, then booked: the report's one conversion line, in words that say what was counted", async () => {
  const { bookedAfterAsk, toBookingReportVM } = await import("@chanlytics/contracts");
  const askedMs = Date.parse("2026-09-01T12:00:00.000Z");
  const up = { id: "x", start: NOW + 86_400_000, end: NOW + 2 * 86_400_000, title: "Cut", allDay: false, via: "phone" };
  assert.equal(bookedAfterAsk({ next: up, last: null }, askedMs), true, "an appointment ahead");
  assert.equal(bookedAfterAsk({ next: null, last: { ...up, start: askedMs + 86_400_000, end: askedMs + 90_000_000 } }, askedMs), true, "held since they reached out");
  assert.equal(bookedAfterAsk({ next: null, last: { ...up, start: askedMs - 30 * 86_400_000, end: askedMs - 29 * 86_400_000 } }, askedMs), false, "a visit before they asked does not answer the ask");
  assert.equal(bookedAfterAsk(null, askedMs), false);
  assert.deepEqual(toBookingReportVM({ calendar: "ok", days: 30, asked: 40, booked: 12 }), { present: true, headline: "12 of 40 booked", sub: "30% of the people who wrote or called in the last 30 days have an appointment on the calendar", pct: 30, asked: 40, booked: 12 });
  assert.equal(toBookingReportVM({ calendar: "ok", days: 7, asked: 0, booked: 0 }).headline, "Nobody asked");
  assert.equal(toBookingReportVM({ calendar: "none", days: 30, asked: 0, booked: 0 }).present, false);
  assert.equal(toBookingReportVM(null).sub, "Connect your calendar under Settings › Business to see who booked.");
  assert.equal(toBookingReportVM({ calendar: "unavailable", days: 30, asked: 5, booked: 0 }).sub, "Your calendar could not be read.");
});

test("the wiring: the list and the assistant carry appointments from one parsed feed; the report carries the line; Leads and the Deal board retire into People", () => {
  const svc = readCode("apps/dashboard/src/server/calendar.ts");
  assert.ok(svc.includes("const parsedFeeds = new Map<string, { text: string; tz: string; parsed: ParsedFeed }>();") && svc.includes("export async function peopleVisits(") && svc.includes("const index = indexFeed(feed.parsed.items);"), "one parse, indexed once, for everyone");
  assert.ok(svc.includes("export async function bookingReport(") && svc.includes("bookedAfterAsk("));
  assert.ok(readCode("apps/dashboard/app/api/v1/contacts/route.ts").includes("const out = await withVisits(ctx, tenantId, rows);"), "the list carries visits and the calendar's state, a page at a time");
  const rep = readCode("apps/dashboard/app/api/v1/reports/route.ts");
  assert.ok(rep.includes(".then((rows) => bookingReport(ctx, tenantId, rows, days))") && rep.includes("return { report, booking };"), "never fatal to the report");
  const tools = readCode("apps/dashboard/src/server/ask/tools.ts");
  assert.ok(tools.includes('list: { type: "string" }') && tools.includes("if (list && !list.test(toPersonRowVM(r, t.timezone, t.now))) return false;") && tools.includes("next_visit: r.visits?.next"), "the assistant answers who booked and who never did");
  const sd = readCode("apps/dashboard/src/legacy-bridge/surface-data.ts");
  assert.ok(sd.includes("lists: PEOPLE_LISTS.filter((l) => !l.needsCalendar || calendar.state === \"ok\")") && sd.includes("booking: toBookingReportVM(data.booking),"));
  const reg = readCode("apps/dashboard/src/legacy-bridge/surface-registry.ts");
  assert.ok(reg.includes('leads: "clients",') && reg.includes('pipeline: "clients",') && reg.includes("w.__surfaceRetired = surfaceRetiredTo;"), "retired, and where to");
  const shell = readCode("apps/dashboard/src/legacy/pages/app-shell.jsx");
  assert.ok(shell.includes('if (retiredTo) window.location.hash = "/" + retiredTo;'), "a real workspace lands on People");
  const page = readCode("apps/dashboard/src/legacy/pages/clients-a.jsx");
  // Booked was a stat card above the table as well as a list on the rail; the rail keeps it.
  assert.ok(page.includes('data-testid="row-next-visit"') && page.includes("asked_never_booked:"), "the column and the tips");
  assert.ok(!page.includes('<StatCell label="Booked"'), "REGRESSION: the rail said it and a card said it again");
  assert.ok(readCode("apps/dashboard/src/legacy/pages/reports.jsx").includes('testid="chart-booking"'));
});

test("a name the owner gives and notes the receptionist reads: two doors, one route, the profile's rename and Notes, the VM's givenName", () => {
  const mig = readCode("supabase/migrations/00054_person_details.sql");
  assert.ok(mig.includes("create or replace function public.set_person_name(p_contact_id uuid, p_name text)") && mig.includes("create or replace function public.set_person_notes(p_contact_id uuid, p_notes text)"));
  assert.ok(mig.includes("check (notes is null or char_length(notes) between 1 and 600)") && mig.includes("grant select (notes) on public.contacts to authenticated;"));
  assert.ok(mig.includes("'contact.named'") && mig.includes("'contact.noted'"), "each door records who changed what");
  assert.ok(mig.split("not public.is_acting_member(v_tenant)").length === 3, "owner or operator, both doors");
  const route = readCode("apps/dashboard/app/api/v1/contacts/[id]/details/route.ts");
  assert.ok(route.includes('rate: "person_edit",') && route.includes('role: "operator",'));
  assert.ok(route.includes('rpc("set_person_name", { p_contact_id: id, p_name: name ?? "" })') && route.includes('rpc("set_person_notes", { p_contact_id: id, p_notes: notes ?? "" })'));
  assert.ok(route.includes('"Send a name, notes, or both."'), "the schema refuses in the same words");
  const detail = readCode("apps/dashboard/app/api/v1/contacts/[id]/route.ts");
  assert.ok(detail.includes('sb.from("contacts").select("notes").eq("id", id).maybeSingle()') && detail.includes("notes: own.data?.notes ?? null,"));
  const bridge = readCode("apps/dashboard/src/legacy-bridge/people-detail.ts");
  assert.ok(bridge.includes("window.__setPersonDetails = setPersonDetails;") && bridge.includes('"PUT contacts/[id]/details"'));
  const page = readCode("apps/dashboard/src/legacy/pages/client-profile.jsx");
  for (const id of ["person-rename", "person-name-input", "person-name-save", "person-notes", "person-notes-input", "person-notes-save"]) assert.ok(page.includes(`data-testid="${id}"`), id);
  assert.ok(page.includes("Notes for the receptionist") && page.includes("used as facts, never read aloud"));
  assert.ok(page.includes("<PersonName p={p} canEdit={canRecord} flash={ppFlash} />"), "the hero name is the editable one");
  const vm = toPersonVM({ ...detail_(), notes: "  Sees Sofia  " }, TZ, new Date(NOW));
  assert.equal(vm.notes, "Sees Sofia");
  assert.equal(vm.givenName, "Maria Lopez");
  const numbered = toPersonVM(detail_({ display_name: null }), TZ, new Date(NOW));
  assert.equal(numbered.givenName, null, "a number is not a given name");
  assert.equal(numbered.notes, null);
});

test("the journey from visits: Booked this week and Lapsed, in three groups; each list's next step waits for a recorded yes", async () => {
  const { toPersonRowVM, PEOPLE_LISTS, PEOPLE_LIST_GROUPS, peopleListAction } = await import("@chanlytics/contracts");
  const now = new Date(NOW);
  const cal = (v) => ({ timezone: TZ, source: "Google Calendar", state: "ok", next: null, last: null, ...v });
  const soon = { id: "n", start: new Date(NOW + 3 * 86_400_000).toISOString(), end: new Date(NOW + 3 * 86_400_000 + 3_600_000).toISOString(), title: "Cut", all_day: false, via: "phone" };
  const far = { ...soon, start: new Date(NOW + 20 * 86_400_000).toISOString(), end: new Date(NOW + 20 * 86_400_000 + 3_600_000).toISOString() };
  const old = { ...soon, id: "o", start: new Date(NOW - 60 * 86_400_000).toISOString(), end: new Date(NOW - 60 * 86_400_000 + 3_600_000).toISOString() };
  const recent = { ...old, start: new Date(NOW - 10 * 86_400_000).toISOString(), end: new Date(NOW - 10 * 86_400_000 + 3_600_000).toISOString() };
  const week = toPersonRowVM({ ...ROW, id: "w", visits: cal({ next: soon }) }, TZ, now);
  const later = toPersonRowVM({ ...ROW, id: "l", visits: cal({ next: far }) }, TZ, now);
  const lapsed = toPersonRowVM({ ...ROW, id: "x", visits: cal({ last: old }) }, TZ, now);
  const regular = toPersonRowVM({ ...ROW, id: "r", visits: cal({ last: recent }) }, TZ, now);
  const back = toPersonRowVM({ ...ROW, id: "b", visits: cal({ last: old, next: far }) }, TZ, now);
  assert.equal(week.nextVisitDays, 3);
  assert.equal(lapsed.lastVisitDays, 60);
  const L = (id) => PEOPLE_LISTS.find((l) => l.id === id);
  assert.ok(L("booked_week").test(week) && !L("booked_week").test(later), "seven days");
  assert.ok(L("booked").test(week) && L("booked").test(later));
  assert.ok(L("lapsed").test(lapsed) && !L("lapsed").test(regular) && !L("lapsed").test(back), "forty-five days since the chair and nothing ahead");
  assert.ok(L("booked_week").needsCalendar && L("lapsed").needsCalendar);
  assert.deepEqual(PEOPLE_LIST_GROUPS.map((g) => g.id), ["attention", "journey", "reach"]);
  assert.deepEqual(PEOPLE_LISTS.filter((l) => l.group === "journey").map((l) => l.id), ["new_week", "booked_week", "booked", "asked_never_booked", "lapsed"]);
  assert.deepEqual(PEOPLE_LISTS.filter((l) => l.group === "attention").map((l) => l.id), ["needs_you", "waiting_on_you"]);
  assert.deepEqual(PEOPLE_LISTS.filter((l) => l.group === "reach").map((l) => l.id), ["quiet", "phoned_only", "opted_in", "offers_ok", "opted_out"], "two consent lists, because there are two answers");
  assert.ok(PEOPLE_LISTS.every((l) => ["attention", "journey", "reach"].includes(l.group)));
  // The step counts the MARKETING yes, because every one of these steps opens the
  // composer on a promotional send. Counting the conversational answer promised an
  // audience the composer would then refuse -- the same mismatch, one screen
  // earlier. A person who said yes to messages and not to offers is NOT counted.
  const yes = { ...lapsed, consent: { ...lapsed.consent, state: "opted_in", marketing: "opted_in" } };
  const talkOnly = { ...lapsed, consent: { ...lapsed.consent, state: "opted_in", marketing: "unknown" } };
  assert.deepEqual(peopleListAction("lapsed", [lapsed, yes]), { text: "1 of 2 on this list said yes to offers — a broadcast reaches them.", cta: "Win them back", to: "broadcasts/lapsed", enabled: true });
  assert.deepEqual(peopleListAction("lapsed", [lapsed]), { text: "Nobody on this list has said yes to offers yet — a broadcast reaches only that answer. The phrase and the QR are on Broadcasts.", cta: "Win them back", to: "broadcasts/lapsed", enabled: false });
  assert.equal(peopleListAction("lapsed", [talkOnly]).enabled, false, "a yes to messages is not a yes to offers");
  assert.equal(peopleListAction("lapsed", []).text, "Nobody here right now.");
  assert.deepEqual(peopleListAction("booked_week", [week]), { text: "Their appointments are on the Calendar.", cta: "See the week", to: "calendar", enabled: true });
  assert.equal(peopleListAction("asked_never_booked", [yes]).to, "broadcasts/asked_never_booked");
  assert.equal(peopleListAction("booked", [week]), null, "no step for a fact that needs none");
  assert.equal(peopleListAction("opted_out", [week]), null);
});

test("the list page: Next visit takes the receptionist's column with a calendar, the rail is grouped, a state is a chip, a list has its step, the view is linkable and remembered", () => {
  const page = readCode("apps/dashboard/src/legacy/pages/clients-a.jsx");
  assert.ok(page.includes('withCalendar ? { key: "visits", label: "Visits", sortable: true } : { key: "receptionist", label: "Receptionist", sortable: false }'));
  assert.ok(page.includes('data-testid="row-next-visit"') && !page.includes("row-booked"), "the column carries the outcome; the chip is gone");
  assert.ok(page.includes('data-testid={`rail-group-${g.id}`}') && page.includes("cl-rail-group-label"));
  assert.ok(page.includes('data-testid="state-filter"') && !page.includes('{["all", ...PL_TABS].map((t) => ('), "one state switcher: the strip, echoed as a chip");
  assert.ok(page.includes('data-testid="list-action"') && page.includes("window.CHANLY.nav(activeList.action.to)"));
  assert.ok(page.includes('window.history.replaceState(null, "", next)') && page.includes("`seg:${listId}` : savedId ? `list:${savedId}` : tab !== \"all\" ? `state:${tab}`"), "linkable");
  assert.ok(page.includes('const PL_VIEW_KEY = "chanlytics-people-view";') && page.includes("plSaveView(view);") && page.includes('window.__saveView("people", view)'), "remembered: on this device, and on the member's row in the workspace");
  const shell = readCode("apps/dashboard/src/legacy/pages/app-shell.jsx");
  assert.ok(shell.includes('/^(seg|list|state):/.test(param)') && shell.includes("initialSaved={savedId} initialState={stateId}"));
  const sd = readCode("apps/dashboard/src/legacy-bridge/surface-data.ts");
  assert.ok(sd.includes("action: peopleListAction(l.id, members)") && sd.includes("groups: PEOPLE_LIST_GROUPS.map("));
  assert.ok(sd.includes('(!l.needsCalendar || people.calendar?.state === "ok")'), "a calendar list is an audience only with a calendar");
  const ports = readCode("apps/dashboard/src/server/campaign-ports.ts");
  assert.ok(ports.includes("await Promise.all([everyone(ctx, tenantId), zone()]);") && ports.includes("withVisits(ctx, tenantId, rows, now)"), "the enrol path counts what the page counted, every page of it");
});

test("asked means they reached out: the call they placed counts, a call the owner made does not", async () => {
  const { toPersonRowVM } = await import("@chanlytics/contracts");
  const now = new Date(NOW);
  const cal = { timezone: TZ, source: "Google Calendar", state: "ok", next: null, last: null };
  const theyCalled = toPersonRowVM({ ...ROW, id: "t", last_call_at: "2026-09-05T12:00:00.000Z", last_inbound_call_at: "2026-09-05T12:00:00.000Z", visits: cal }, TZ, now);
  assert.equal(theyCalled.askedMs, Date.parse("2026-09-05T12:00:00.000Z"));
  assert.equal(theyCalled.askedNotBooked, true);
  const weCalled = toPersonRowVM({ ...ROW, id: "w", last_call_at: "2026-09-05T12:00:00.000Z", last_inbound_call_at: null, visits: cal }, TZ, now);
  assert.equal(weCalled.askedMs, null, "an outbound call is not them asking");
  assert.equal(weCalled.askedNotBooked, false);
  assert.equal(weCalled.lastContact.label.startsWith("Phoned"), true, "but it is still the last contact");
  const mig = readCode("supabase/migrations/00055_people_list_inbound_call.sql");
  assert.ok(mig.includes("drop function if exists public.people_list(uuid, uuid);") && mig.includes("max(k.started_at) filter (where k.direction = 'inbound') as last_inbound_at,") && mig.includes("last_inbound_call_at    timestamptz,"));
  assert.ok(mig.includes("grant execute on function public.people_list(uuid, uuid) to authenticated, service_role;"), "a drop loses the grants; they are re-stated");
  assert.ok(readCode("apps/dashboard/src/server/calendar.ts").includes("const cands = [r.last_inbound_at, r.last_inbound_call_at ?? null]"), "the report counts the same way");
});

test("bulk actions: a selection becomes people on a list, a yes on record (one request each, fifty at most, one refresh), or a file; everyone shown can be kept as a list", () => {
  const bridge = readCode("apps/dashboard/src/legacy-bridge/people-detail.ts");
  assert.ok(bridge.includes("export async function setPersonConsentMany(ids: string[], body: ConsentBody): Promise<ManyResult>") && bridge.includes("const take = [...new Set(ids)].slice(0, 50);"));
  assert.ok(bridge.includes("window.__setPersonConsentMany = setPersonConsentMany;"));
  // The many used to be one request per person, held back from refreshing, with
  // one refresh at the end. They are ONE request now, through the batch door,
  // which the refresh map treats like any other write (slice B of the data
  // program); consent-history.test.mjs runs that door.
  assert.ok(bridge.includes("return api()(CONSENT_ROUTE[purpose], { params: { id }, body });") && bridge.includes("api()(MANY_ROUTE[purpose], { body: { ids: take, ...body } })") && !bridge.slice(bridge.indexOf("async function recordMany"), bridge.indexOf("export type ReceptionistMany")).includes("refresh: false"), "the single and the many both refresh through the map; the many are one request (a view save, which changes no surface, is the one write that holds the map back)");
  const page = readCode("apps/dashboard/src/legacy/pages/clients-a.jsx");
  for (const id of ["select-all", "row-select", "bulk-bar", "bulk-list-name", "bulk-export", "bulk-clear", "save-shown", "save-shown-name"]) assert.ok(page.includes(`data-testid="${id}"`), id);
  // WHICH yes, and how it was given. The bulk action was titled for offers and
  // wrote the conversational column, so a salon recording thirty signed marketing
  // consents changed the one field that does not authorise a promotion.
  assert.ok(bridge.includes("export async function setPersonMarketingConsentMany(ids: string[], body: ConsentBody): Promise<ManyResult>"));
  assert.ok(bridge.includes("window.__setPersonMarketingConsentMany = setPersonMarketingConsentMany;"));
  assert.ok(page.includes('{ header: "Yes to messages about their visit\u2026" }') && page.includes('{ header: "Yes to offers and news\u2026" }'), "both asks are offered, and named");
  assert.ok(page.includes('{ consent: "opted_in", source: source.id },'), "a yes says how it was given");
  assert.ok(page.includes('.filter((s) => s.id !== "customer_message")'), "their own message is not something a desk records for them");
  assert.ok(page.includes("React.useEffect(() => { setSel(new Set()); }, [tab, listId, savedId, q]);"), "a selection never outlives its view");
  assert.ok(page.includes('const head = ["Name", "Phone", "State", "Last contact", "Consent", "Offers", "Next visit", "First contact"];'), "the file holds the columns the page shows, nothing invented");
  assert.ok(page.includes("selectable={canEditLists || canExport}"));
});

test("every visit, oldest first, for the timeline; the profile reads them as Visited and Booked, and the booking link is one step away", async () => {
  const { allVisitsIn, indexFeed } = await import("@chanlytics/contracts");
  const f = feed();
  const index = indexFeed(f.items);
  const all = allVisitsIn(index, { id: "p", name: "Maria Lopez", phone: "+13055550134" });
  assert.deepEqual(all.map((v) => v.title), ["Maria Lopez - Balayage"]);
  const both = allVisitsIn(index, { id: "q", name: "Daniela Ruiz", phone: null });
  assert.deepEqual(both.map((v) => [v.title, v.via]), [["Daniela Ruiz · Colour", "name"]]);
  const now = new Date(NOW);
  const past = { id: "a", start: "2026-08-20T14:00:00.000Z", end: "2026-08-20T16:00:00.000Z", title: "Colour", all_day: false, via: "phone" };
  const ahead = { id: "b", start: "2026-09-08T18:00:00.000Z", end: "2026-09-08T21:00:00.000Z", title: "Balayage", all_day: false, via: "phone" };
  const vm = toPersonVM({ ...detail_(), booking_link: " https://booksy.com/melanys ", visits: { timezone: TZ, source: "Google Calendar", state: "ok", next: ahead, last: past, all: [past, ahead] }, added: { at: "2026-09-01T12:00:00.000Z", source: "calendar", title: "Colour" } }, TZ, now);
  const visits = vm.timeline.filter((i) => i.kind === "visit");
  assert.deepEqual(visits.map((i) => [i.text, i.who]), [["Booked · Balayage", "Calendar"], ["Visited · Colour", "Calendar"]], "newest first, ahead reads as booked");
  assert.equal(visits[1].sub, "10:00 AM – 12:00 PM · from Google Calendar");
  assert.equal(vm.timeline.find((i) => i.id === "added").text, "Added from your calendar (Colour)");
  assert.equal(vm.bookingLink, "https://booksy.com/melanys");
  assert.equal(vm.replyWindow, null, "no chat, no window");
  const chat = toPersonVM(detail_({ has_chat: true, latest_wa_inbound_at: new Date(NOW - 2 * 3_600_000).toISOString() }), TZ, now);
  assert.deepEqual(chat.replyWindow, { open: true, hoursLeft: 22 });
  const closed = toPersonVM(detail_({ has_chat: true, latest_wa_inbound_at: new Date(NOW - 30 * 3_600_000).toISOString() }), TZ, now);
  assert.deepEqual(closed.replyWindow, { open: false, hoursLeft: 0 });
  const page = readCode("apps/dashboard/src/legacy/pages/client-profile.jsx");
  assert.ok(page.includes('data-testid="text-booking-link"') && page.includes('sessionStorage.setItem("chanlytics-compose"') && page.includes("Send the booking-link template"), "inside the window a reply is carried in; outside it the thread offers the template");
  assert.ok(page.includes(': e.kind === "visit" ? <Icon name="calendar" size={12} />'));
  const composer = readCode("apps/dashboard/src/legacy/pages/inbox-thread.jsx");
  assert.ok(composer.includes('sessionStorage.getItem("chanlytics-compose")') && composer.includes('sessionStorage.removeItem("chanlytics-compose")') && composer.includes("setText((cur) => (cur && cur.trim() ? cur : carried.text));"), "only into an empty composer, only once");
  const route = readCode("apps/dashboard/app/api/v1/contacts/[id]/route.ts");
  assert.ok(route.includes('sb.from("tenant_config").select("config").eq("tenant_id", tenantId).maybeSingle()') && route.includes("booking_link: typeof bookingLink === \"string\""));
  assert.ok(readCode("apps/dashboard/src/server/calendar.ts").includes("const all = allVisitsIn(index, person).map((x) => toVisitDto(x) as VisitDto).slice(-60);"));
});

test("the table: identity that says who, Offers where First contact was, Visits that never go blank, actions on hover, keyboard rows, a header that sticks, cards when narrow", async () => {
  const { toPersonRowVM } = await import("@chanlytics/contracts");
  const now = new Date(NOW);
  const cal = (v) => ({ timezone: TZ, source: "Google Calendar", state: "ok", next: null, last: null, ...v });
  const last = { id: "b0:1", start: "2026-08-20T14:00:00.000Z", end: "2026-08-20T16:00:00.000Z", title: "Colour", all_day: false, via: "phone" };
  const row = toPersonRowVM({ ...ROW, has_chat: true, latest_wa_inbound_at: new Date(NOW - 3_600_000).toISOString(), visits: cal({ last }) }, TZ, now);
  assert.equal(row.lastVisitDay, "Thu, Aug 20");
  assert.deepEqual(row.replyWindow, { open: true, hoursLeft: 23 });
  assert.equal(toPersonRowVM({ ...ROW, has_chat: false }, TZ, now).replyWindow, null);
  const page = readCode("apps/dashboard/src/legacy/pages/clients-a.jsx");
  assert.ok(page.includes('withCalendar ? { key: "visits", label: "Visits", sortable: true } : { key: "receptionist", label: "Receptionist", sortable: false }') && page.includes('{ key: "offers", label: "Offers", sortable: true }') && !page.includes('label: "First contact"'), "the columns");
  assert.ok(page.includes('cl-row-avatar-glyph') && page.includes('data-testid="row-name-them"'), "a number is not initials; it can be named");
  assert.ok(page.includes('<span className="cl-row-last-visit">Last · {p.lastVisitDay}</span>'), "a visit behind them when nothing is ahead");
  assert.ok(page.includes('const PL_OFFERS = { opted_in: ["Yes", "yes"], opted_out: ["No", "no"], unknown: ["Not asked", "unasked"] };'));
  assert.ok(page.includes('data-testid="row-open-thread"') && page.includes('data-testid="row-booking-link"') && page.includes('sessionStorage.setItem("chanlytics-compose"'), "the row's own next steps");
  assert.ok(page.includes('title={plWhen(p.lastContact.at)}'), "the exact time on hover");
  assert.ok(page.includes('if (e.key === "ArrowDown" || e.key === "ArrowUp")') && page.includes('else if (e.key === "Enter" && cursor)') && page.includes('e.key === " " && cursor'), "arrows, Enter, Space");
  assert.ok(page.includes('"no messages yet"') && page.includes('`${total} ${total === 1 ? "person" : "people"}`'), "honest words");
  assert.ok(page.includes('(p.quote || "").toLowerCase().includes(needle)') && page.includes('(p.nextVisit || "").toLowerCase().includes(needle)'), "search finds words on the row");
  assert.ok(page.includes('bookingLink={people.bookingLink || null}'));
  const css = readCode("apps/dashboard/src/legacy/styles/clients.css");
  assert.ok(css.includes("overflow: clip;") && css.includes('grid-template-areas: "sel name state" "sel last visits" "sel offers offers";'), "a header that sticks; cards under 900px");
  const svc = readCode("apps/dashboard/src/server/calendar.ts");
  assert.ok(svc.includes("booking_link: pv.bookingLink,") && svc.includes("const bookingLink = cfg?.brain?.booking_link?.trim() || null;"), "the list envelope carries the link");
  assert.ok(readCode("apps/dashboard/src/legacy-bridge/surface-data.ts").includes("bookingLink: data.booking_link ?? null,"));
});
