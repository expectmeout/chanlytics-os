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
const detail_ = (over = {}) => ({ row: { ...ROW, ...over }, identities: [], conversations: [], calls: [], escalations: [], decisions: [], receptionist_mode: null, workspace_reply_mode: "auto" });

test("the profile: a Next visit fact and About rows when the calendar is connected; nothing invented when it is not", () => {
  const now = new Date(NOW);
  const none = toPersonVM(detail(null), now);
  assert.ok(!none.facts.some((f) => f.label === "Next visit") && !none.about.some((a) => a.k === "Next visit"), "no calendar, no line");
  const next = { id: "b1:1", start: "2026-09-08T18:00:00.000Z", end: "2026-09-08T21:00:00.000Z", title: "Maria Lopez - Balayage", all_day: false, via: "phone" };
  const last = { id: "b0:1", start: "2026-08-20T14:00:00.000Z", end: "2026-08-20T16:00:00.000Z", title: "Colour", all_day: false, via: "name" };
  const vm = toPersonVM(detail({ timezone: TZ, source: "Google Calendar", state: "ok", next, last }), now);
  const fact = vm.facts.find((f) => f.label === "Next visit");
  assert.deepEqual(fact, { label: "Next visit", value: "Tue, Sep 8", meta: "2:00 – 5:00 PM" }, "the cell is narrow: the time here, the service in About");
  assert.deepEqual(vm.about.filter((a) => a.k === "Next visit" || a.k === "Last visit"), [
    { k: "Next visit", v: "Tue, Sep 8 · 2:00 – 5:00 PM · Maria Lopez - Balayage" },
    { k: "Last visit", v: "Thu, Aug 20 · 10:00 AM – 12:00 PM · Colour" },
  ]);
  const empty = toPersonVM(detail({ timezone: TZ, source: "Google Calendar", state: "ok", next: null, last: null }), now);
  assert.deepEqual(empty.facts.find((f) => f.label === "Next visit"), { label: "Next visit", value: "—", meta: "none booked" });
  const down = toPersonVM(detail({ timezone: TZ, source: "Google Calendar", state: "unavailable", next: null, last: null }), now);
  assert.equal(down.about.find((a) => a.k === "Next visit").v, "Calendar could not be read");
  const byName = toPersonVM(detail({ timezone: TZ, source: "Google Calendar", state: "ok", next: { ...next, via: "name" }, last: null }), now);
  assert.ok(byName.facts.find((f) => f.label === "Next visit").meta.endsWith("· by name"));
  assert.equal(down.facts.find((f) => f.label === "Next visit").meta, "could not be read");
});

test("the wiring: the board and the profile read one match; both receptionists are told; the panel says who it is for and where it comes from", () => {
  const svc = readCode("apps/dashboard/src/server/calendar.ts");
  assert.ok(svc.includes("export async function personVisits(") && svc.includes("const v = visitsOf(feed.parsed.items, person, now.getTime());"), "the profile's visits, from the same feed and match");
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

test("automatically: an hourly sweep on the edge and the owner's own read both put the feed's people in People through one extraction; the profile says where they came from; no button", () => {
  const mig = readCode("supabase/migrations/00052_create_person.sql");
  assert.ok(mig.includes("create or replace function public.create_person(p_tenant_id uuid, p_phone_e164 text, p_display_name text, p_source text)"));
  assert.ok(mig.includes("security definer") && mig.includes("if p_tenant_id is null or not public.is_acting_member(p_tenant_id) then"), "owner or operator");
  assert.ok(mig.includes("insert into contacts (tenant_id, phone_e164, display_name)") && !/insert into contacts \([^)]*consent|set consent/.test(mig), "consent is not touched: a booking is not a yes");
  assert.ok(mig.includes("where id = v_id and display_name is null;"), "a name fills only an empty one");
  const sweep = readCode("supabase/migrations/00053_calendar_people_sweep.sql");
  assert.ok(sweep.includes("url     := v_url || '/api/cron/calendar',") && sweep.includes("select cron.schedule('calendar-people-sweep',"), "pg_cron calls the edge every hour, like the other sweeps");
  const cron = readCode("apps/edge/api/cron/calendar.ts");
  assert.ok(cron.includes('request.headers.get("x-cron-key")') && cron.includes('db.rpc("get_cron_sweep_key")'), "the sweep key");
  assert.ok(cron.includes("const people = peopleFromItems(items, (cfg?.brain?.profile?.services ?? []).map((s) => s.name), now.getTime());") && cron.includes("await addPeopleFromCalendar(db, row.tenant_id, people)"));
  const lib = readCode("apps/edge/lib/calendar-people.ts");
  assert.ok(lib.includes('.insert({ tenant_id: tenantId, phone_e164: r.phone, display_name: r.name })') && lib.includes('if (iErr.code !== "23505") throw') && lib.includes('kind: "contact.added", category: "contact"'), "get-or-create with the service role, an event for each person created");
  assert.ok(lib.includes('.is("display_name", null)'), "a name fills only an empty one");
  const svc = readCode("apps/dashboard/src/server/calendar.ts");
  assert.ok(svc.includes("if (opts.canAct) people.push(...await addPeopleSeen(") && svc.includes('ctx.supabase.rpc("create_person", { p_tenant_id: tenantId, p_phone_e164: r.phone, p_display_name: r.name ?? "", p_source: "calendar", p_title: r.title })'), "an owner's read adds through the door, before the board is matched");
  assert.ok(sweep.includes("insert into events (tenant_id, kind, category, subject_type, subject_id, data)") && sweep.includes("'contact.added'"), "the door records where a person came from; members cannot write events themselves");
  assert.ok(readCode("apps/dashboard/app/api/v1/calendar/route.ts").includes('const canAct = member.role === "owner" || member.role === "operator";'), "a viewer's read changes nothing");
  const route = readCode("apps/dashboard/app/api/v1/contacts/route.ts");
  assert.ok(route.includes('requireRole(member, "operator");') && route.includes('ctx.supabase.rpc("create_person"'), "the door's own route stays, for a hand");
  const detail = readCode("apps/dashboard/app/api/v1/contacts/[id]/route.ts");
  assert.ok(detail.includes('.eq("kind", "contact.added")') && detail.includes("added: added.data"), "the profile reads where they came from");
  const page = readCode("apps/dashboard/src/legacy/pages/calendar-real.jsx");
  assert.ok(!page.includes("cal-panel-add") && !page.includes("__addPerson"), "no button: added on its own, deleted from the profile if unwanted");
  assert.ok(page.includes('"Not in People yet — added within the hour"'));
  assert.ok(!readCode("apps/dashboard/src/legacy-bridge/people-detail.ts").includes("addPerson"), "no bridge verb either");
  const edgeAv = readCode("apps/edge/lib/availability.ts");
  assert.ok(edgeAv.includes("export async function feedItemsFor(tenantId: string, url: string, tz: string, now = new Date(), daysAhead = 14)"), "the sweep reads the feed through the same cache");
});

test("the profile: Added from your calendar, with the appointment that named them", () => {
  const now = new Date(NOW);
  const vm = toPersonVM(detail(null), now);
  assert.ok(!vm.about.some((a) => a.k === "Added"));
  const fromCal = toPersonVM({ ...detail(null), added: { at: "2026-09-06T14:00:00.000Z", source: "calendar", title: "Maria Lopez - Balayage" } }, now);
  assert.equal(fromCal.about.find((a) => a.k === "Added").v, "Sep 6, 2026 · from your calendar (Maria Lopez - Balayage)");
  const byHand = toPersonVM({ ...detail(null), added: { at: "2026-09-06T14:00:00.000Z", source: "manual", title: null } }, now);
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
  const booked = toPersonRowVM({ ...asked, id: "b", visits: cal({ next }) }, now);
  assert.equal(booked.booked, true);
  assert.equal(booked.nextVisitDay, "Tue, Sep 8");
  assert.equal(booked.nextVisit, "Tue, Sep 8 · 2:00 – 5:00 PM · Balayage");
  assert.equal(booked.askedNotBooked, false, "booked is not asked-never-booked");
  const gap = toPersonRowVM({ ...asked, visits: cal({}) }, now);
  assert.equal(gap.askedNotBooked, true, "wrote this month, the calendar never had them");
  assert.equal(gap.askedMs, Date.parse("2026-09-04T12:00:00.000Z"));
  const visited = toPersonRowVM({ ...asked, id: "v", visits: cal({ last }) }, now);
  assert.equal(visited.askedNotBooked, false, "they have been on the calendar before");
  assert.equal(visited.lastVisit, "Thu, Aug 20 · 10:00 AM – 12:00 PM · Colour");
  const stale = toPersonRowVM({ ...asked, id: "s", last_inbound_at: "2026-07-01T12:00:00.000Z", visits: cal({}) }, now);
  assert.equal(stale.askedNotBooked, false, "asked more than a month ago is not this list");
  const noCal = toPersonRowVM({ ...asked, id: "n", visits: null }, now);
  assert.equal(noCal.calendar, "none");
  assert.equal(noCal.askedNotBooked, false, "no calendar: nothing to say");
  const bookedList = PEOPLE_LISTS.find((l) => l.id === "booked");
  const askedList = PEOPLE_LISTS.find((l) => l.id === "asked_never_booked");
  assert.ok(bookedList.needsCalendar && askedList.needsCalendar, "shown only when the calendar is connected");
  assert.ok(bookedList.test(booked) && !bookedList.test(gap));
  assert.ok(askedList.test(gap) && !askedList.test(booked) && !askedList.test(visited));
  assert.deepEqual([...PEOPLE_LISTS].map((l) => l.id).slice(0, 5), ["needs_you", "waiting_on_you", "new_week", "booked", "asked_never_booked"], "after the states, the outcome");
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
  assert.equal(toBookingReportVM(null).sub, "Connect your calendar under Settings › Workspace to see who booked.");
  assert.equal(toBookingReportVM({ calendar: "unavailable", days: 30, asked: 5, booked: 0 }).sub, "Your calendar could not be read.");
});

test("the wiring: the list and the assistant carry appointments from one parsed feed; the report carries the line; Leads and the Deal board retire into People", () => {
  const svc = readCode("apps/dashboard/src/server/calendar.ts");
  assert.ok(svc.includes("const parsedFeeds = new Map<string, { text: string; tz: string; parsed: ParsedFeed }>();") && svc.includes("export async function peopleVisits(") && svc.includes("const index = indexFeed(feed.parsed.items);"), "one parse, indexed once, for everyone");
  assert.ok(svc.includes("export async function bookingReport(") && svc.includes("bookedAfterAsk("));
  assert.ok(readCode("apps/dashboard/app/api/v1/contacts/route.ts").includes("return withVisits(ctx, tenantId, await listPeople(ctx, tenantId));"), "the list carries visits and the calendar's state");
  const rep = readCode("apps/dashboard/app/api/v1/reports/route.ts");
  assert.ok(rep.includes(".then((rows) => bookingReport(ctx, tenantId, rows, days))") && rep.includes("return { report, booking };"), "never fatal to the report");
  const tools = readCode("apps/dashboard/src/server/ask/tools.ts");
  assert.ok(tools.includes('list: { type: "string" }') && tools.includes("if (list && !list.test(toPersonRowVM(r, t.now))) return false;") && tools.includes("next_visit: r.visits?.next"), "the assistant answers who booked and who never did");
  const sd = readCode("apps/dashboard/src/legacy-bridge/surface-data.ts");
  assert.ok(sd.includes("lists: PEOPLE_LISTS.filter((l) => !l.needsCalendar || calendar.state === \"ok\")") && sd.includes("booking: toBookingReportVM(data.booking),"));
  const reg = readCode("apps/dashboard/src/legacy-bridge/surface-registry.ts");
  assert.ok(reg.includes('leads: "clients",') && reg.includes('pipeline: "clients",') && reg.includes("w.__surfaceRetired = surfaceRetiredTo;"), "retired, and where to");
  const shell = readCode("apps/dashboard/src/legacy/pages/app-shell.jsx");
  assert.ok(shell.includes('if (retiredTo) window.location.hash = "/" + retiredTo;'), "a real workspace lands on People");
  const page = readCode("apps/dashboard/src/legacy/pages/clients-a.jsx");
  assert.ok(page.includes('data-testid="row-booked">Booked · {p.nextVisitDay}') && page.includes('<StatCell label="Booked"') && page.includes("asked_never_booked:"), "the chip, the cell, the tips");
  assert.ok(readCode("apps/dashboard/src/legacy/pages/reports.jsx").includes('testid="chart-booking"'));
});

test("a name the owner gives and notes the receptionist reads: two doors, one route, the profile's rename and Notes, the VM's givenName", () => {
  const mig = readCode("supabase/migrations/00054_person_details.sql");
  assert.ok(mig.includes("create or replace function public.set_person_name(p_contact_id uuid, p_name text)") && mig.includes("create or replace function public.set_person_notes(p_contact_id uuid, p_notes text)"));
  assert.ok(mig.includes("check (notes is null or char_length(notes) between 1 and 600)") && mig.includes("grant select (notes) on public.contacts to authenticated;"));
  assert.ok(mig.includes("'contact.named'") && mig.includes("'contact.noted'"), "each door records who changed what");
  assert.ok(mig.split("not public.is_acting_member(v_tenant)").length === 3, "owner or operator, both doors");
  const route = readCode("apps/dashboard/app/api/v1/contacts/[id]/details/route.ts");
  assert.ok(route.includes('takeRate(ctx.userId, "person_edit");') && route.includes('requireRole(member, "operator");'));
  assert.ok(route.includes('rpc("set_person_name", { p_contact_id: id, p_name: name ?? "" })') && route.includes('rpc("set_person_notes", { p_contact_id: id, p_notes: notes ?? "" })'));
  assert.ok(route.includes('throw new AppError("validation", "Send a name, notes, or both.");'));
  const detail = readCode("apps/dashboard/app/api/v1/contacts/[id]/route.ts");
  assert.ok(detail.includes('sb.from("contacts").select("notes").eq("id", id).maybeSingle()') && detail.includes("notes: own.data?.notes ?? null,"));
  const bridge = readCode("apps/dashboard/src/legacy-bridge/people-detail.ts");
  assert.ok(bridge.includes("window.__setPersonDetails = setPersonDetails;") && bridge.includes("/details`)"));
  const page = readCode("apps/dashboard/src/legacy/pages/client-profile.jsx");
  for (const id of ["person-rename", "person-name-input", "person-name-save", "person-notes", "person-notes-input", "person-notes-save"]) assert.ok(page.includes(`data-testid="${id}"`), id);
  assert.ok(page.includes("Notes · the receptionist reads these") && page.includes("the receptionist uses these as facts and never reads them aloud"));
  assert.ok(page.includes("<PersonName p={p} canEdit={canRecord} flash={ppFlash} />"), "the hero name is the editable one");
  const vm = toPersonVM({ ...detail_(), notes: "  Sees Sofia  " }, new Date(NOW));
  assert.equal(vm.notes, "Sees Sofia");
  assert.equal(vm.givenName, "Maria Lopez");
  const numbered = toPersonVM(detail_({ display_name: null }), new Date(NOW));
  assert.equal(numbered.givenName, null, "a number is not a given name");
  assert.equal(numbered.notes, null);
});
