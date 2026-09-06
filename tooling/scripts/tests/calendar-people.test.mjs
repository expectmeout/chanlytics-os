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
  describeVisits, feedSourceLabel, eventText, toVisitDto, toPersonVM,
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
  last_message_at: null, last_message_direction: null, last_message_sender: null, last_inbound_text: null, last_inbound_at: null, last_call_at: null, call_count: 0, call_seconds: 0,
  first_contact_at: null, earliest_row_at: null, has_backfill: false, has_chat: false, queued_reply_at: null,
};
const detail = (visits) => ({ row: ROW, identities: [], conversations: [], calls: [], escalations: [], decisions: [], receptionist_mode: null, workspace_reply_mode: "auto", ...(visits ? { visits } : {}) });

test("the profile: a Next visit fact and About rows when the calendar is connected; nothing invented when it is not", () => {
  const now = new Date(NOW);
  const none = toPersonVM(detail(null), now);
  assert.ok(!none.facts.some((f) => f.label === "Next visit") && !none.about.some((a) => a.k === "Next visit"), "no calendar, no line");
  const next = { id: "b1:1", start: "2026-09-08T18:00:00.000Z", end: "2026-09-08T21:00:00.000Z", title: "Maria Lopez - Balayage", all_day: false, via: "phone" };
  const last = { id: "b0:1", start: "2026-08-20T14:00:00.000Z", end: "2026-08-20T16:00:00.000Z", title: "Colour", all_day: false, via: "name" };
  const vm = toPersonVM(detail({ timezone: TZ, source: "Google Calendar", state: "ok", next, last }), now);
  const fact = vm.facts.find((f) => f.label === "Next visit");
  assert.deepEqual(fact, { label: "Next visit", value: "Tue, Sep 8", meta: "2:00 – 5:00 PM · Maria Lopez - Balayage" });
  assert.deepEqual(vm.about.filter((a) => a.k === "Next visit" || a.k === "Last visit"), [
    { k: "Next visit", v: "Tue, Sep 8 · 2:00 – 5:00 PM · Maria Lopez - Balayage" },
    { k: "Last visit", v: "Thu, Aug 20 · 10:00 AM – 12:00 PM · Colour" },
  ]);
  const empty = toPersonVM(detail({ timezone: TZ, source: "Google Calendar", state: "ok", next: null, last: null }), now);
  assert.deepEqual(empty.facts.find((f) => f.label === "Next visit"), { label: "Next visit", value: "—", meta: "nothing on the calendar" });
  const down = toPersonVM(detail({ timezone: TZ, source: "Google Calendar", state: "unavailable", next: null, last: null }), now);
  assert.equal(down.about.find((a) => a.k === "Next visit").v, "Calendar could not be read");
  const byName = toPersonVM(detail({ timezone: TZ, source: "Google Calendar", state: "ok", next: { ...next, via: "name" }, last: null }), now);
  assert.ok(byName.facts.find((f) => f.label === "Next visit").meta.endsWith("· matched by name"));
});

test("the wiring: the board and the profile read one match; both receptionists are told; the panel says who it is for and where it comes from", () => {
  const svc = readCode("apps/dashboard/src/server/calendar.ts");
  assert.ok(svc.includes("export async function personVisits(") && svc.includes("const v = visitsOf(parsed.items, person, now.getTime());"), "the profile's visits, from the same feed and match");
  assert.ok(svc.includes("source: feedSourceLabel(url)"), "the calendar's name, never its address");
  assert.ok(!svc.includes("personInTitle"), "the old name-only match is gone");
  const route = readCode("apps/dashboard/app/api/v1/contacts/[id]/route.ts");
  assert.ok(route.includes("const visits = await personVisits(ctx, tenantId, personLike(row)).catch(") && route.includes("visits: visits ?? undefined,"), "never fatal to the profile");
  const edge = readCode("apps/edge/lib/availability.ts");
  assert.ok(edge.includes("export async function visitsFor(rt: TenantRuntime, who: { phone: string | null; name: string | null }") && edge.includes("return describeVisits(visitsOf(feed.items, { id: \"caller\", name: who.name ?? \"\", phone: who.phone }, now.getTime()), rt.timezone, now.getTime());"));
  const wa = readCode("apps/edge/api/whatsapp.ts");
  assert.ok(wa.includes("const visits = rt ? await visitsFor(rt, { phone: e164, name: lead.name }) : null;") && wa.includes("if (visits) leadNote = `${leadNote}\\n${visits}`;"), "WhatsApp: with who they are");
  const inbound = readCode("apps/edge/api/retell-inbound.ts");
  assert.ok(inbound.includes("const visits = await visitsFor(rt, { phone, name: lead.name });") && inbound.includes("if (visits) parts.push(visits);"), "phone: in the caller context");
  const page = readCode("apps/dashboard/src/legacy/pages/calendar-real.jsx");
  for (const id of ["cal-panel-person", "cal-panel-contact", "cal-panel-where", "cal-panel-desc"]) assert.ok(page.includes(`data-testid="${id}"`), id);
  assert.ok(page.includes("From {source}. The receptionist treats this time as taken; to change or cancel it, edit it there."), "one line, no feed counts");
  assert.ok(!page.includes("read just now") && !page.includes("feedLine"), "the chip's sentence stays on the chip");
  assert.ok(page.includes("matched by {b.person.via}") && page.includes("Not in People yet"));
  const dto = readCode("packages/contracts/src/calendar.ts");
  assert.ok(dto.includes("source: dto.feed.source ?? \"your calendar\"") && dto.includes("From ${dto.feed.source ?? \"your calendar\"} · read"), "the chip names the calendar");
});
