/**
 * The mockup's Today: a sample workspace's day through the same view models a real one goes through, so the
 * standalone mockup (Chanlytics.html, served by tooling/scripts/serve-legacy.mjs, which builds this as
 * data/today-sample.js) draws the one Today page there is. The app never loads it: a workspace draws its own day.
 *
 * Every figure agrees with its parts: the metrics are COUNTED from the threads and calls below, so the receipts add
 * up whatever hour the mockup is opened. Every moment is said relative to `nowMs`, so the day is always today.
 *
 * It imports contracts, reports-sample and the bridge's today.ts, and nothing that imports ./api: this is a browser
 * bundle with no session behind it.
 */
import {
  toTodayVM,
  toCalendarVM,
  toPersonRowVM,
  peopleAggregates,
  peopleListAction,
  PEOPLE_LISTS,
  toBroadcastVM,
  toLiveVM,
  zoneDayKey,
  clockTime,
  agoLabel,
  SERVER_KEY_PREFIX,
  NEEDS_KEY_PREFIX,
  CALL_KEY_PREFIX,
  type MetricsSummaryDto,
  type ConversationDto,
  type EscalationDto,
  type CallDto,
  type CalendarWeekDto,
  type CalendarVM,
  type PersonRowDto,
  type PersonRowVM,
  type PeopleAggregates,
  type BroadcastDto,
  type BroadcastVM,
  type LiveVM,
  type TodayVM,
  type PlaybookCardLike,
} from "@chanlytics/contracts";
import { reportsSample } from "./reports-sample";
import { TODAY_HELPERS } from "./today";
import type { ReportsSurface } from "./surface-data";

const ZONE = "America/New_York";
const MIN = 60_000;

/**
 * The row the popover draws (apps/dashboard/src/legacy-bridge/notifications.ts's own `BellRow`), redeclared here:
 * that file imports ./api, which this browser-only sample may not.
 */
interface BellRow {
  id: string;
  kind: string;
  icon: string;
  tone: string;
  unread: boolean;
  time: string;
  title: string;
  message: string;
  about: { type: string; id: string } | null;
  actions: Array<{ label: string; to: string; primary: boolean }>;
}

export interface TodaySample {
  TODAY_DATA: TodayVM;
  __CALENDAR: { vm: CalendarVM; fetchedAt: number };
  __PLAYBOOKS: { rows: PlaybookCardLike[] };
  __PEOPLE: {
    rows: PersonRowVM[];
    lists: Array<{ id: string; label: string; group: string; count: number; ids: string[]; action: { text: string; cta: string; to: string; enabled: boolean } | null }>;
    aggregates: PeopleAggregates;
    calendar: { state: "ok"; source: string };
  };
  __BROADCASTS: { rows: BroadcastVM[] };
  __REPORTS: ReportsSurface;
  __LIVE: LiveVM;
  /** The bell as the topbar would hold it: three kept rows and three derived ones the queue already shows. */
  bell: BellRow[];
  metrics: MetricsSummaryDto;
  conversations: ConversationDto[];
  escalations: Array<EscalationDto & { conversation_id: string }>;
  calls: CallDto[];
}

/** "YYYY-MM-DDTHH:MM:SS" on the business's clock: the naive wall time metrics_summary reports as now_local. */
function naiveLocal(ms: number, zone: string): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: zone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(new Date(ms))
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;
}

/** Midnight of the business's day, as an instant. */
function midnightMs(ms: number, zone: string): number {
  const local = naiveLocal(ms, zone);
  const offset = Date.parse(`${local}Z`) - ms;
  const [y, m, d] = local.slice(0, 10).split("-").map(Number);
  return Date.UTC(y, m - 1, d) - offset;
}

const phone = (last4: string) => `+1305555${last4}`;

function build(nowMs: number): TodaySample {
  const now = new Date(nowMs);
  const today = zoneDayKey(nowMs, ZONE);
  const midnight = midnightMs(nowMs, ZONE);
  /** An instant `min` minutes before now. */
  const ago = (min: number) => new Date(nowMs - min * MIN).toISOString();
  /** An instant at h:mm today on the business's clock. */
  const at = (h: number, m = 0, dayOffset = 0) => new Date(midnight + dayOffset * 24 * 60 * MIN + (h * 60 + m) * MIN).toISOString();

  const contact = (id: string, name: string | null, last4: string, over: Partial<ConversationDto["contact"]> = {}) => ({ id, display_name: name, wa_profile_name: null, phone_e164: phone(last4), consent: "opted_in", dnc: false, marketing_consent: null, ...over });
  const msg = (id: string, dir: "in" | "ai" | "failed", body: string, created_at: string, channel = "whatsapp") => ({
    id, direction: dir === "in" ? "inbound" as const : "outbound" as const, sender: dir === "in" ? "customer" as const : "ai" as const, type: "text", body, media: null, meta: null,
    status: dir === "in" ? "received" : dir === "failed" ? "failed" : "delivered", channel, created_at,
  });
  const thread = (id: string, c: ConversationDto["contact"], messages: ConversationDto["messages"], over: Partial<ConversationDto> = {}): ConversationDto => ({
    id, state: "open", paused_until: null, assignee_user_id: null, assignee_is_me: false, last_wa_inbound_at: null, last_message_at: messages.at(-1)?.created_at ?? null, contact: c, messages, ...over,
  });

  // Eight threads: two people new today, one email, one text, one nobody answered, one handed over, one call-back,
  // one reply window closing, one reply that failed to deliver.
  const conversations: ConversationDto[] = [
    thread("cv-renata", contact("k-renata", "Renata Solís", "0101"), [msg("m-r1", "in", "Hi! Do you have anything for a gel manicure this Saturday?", ago(410)), msg("m-r2", "ai", "Hi Renata! Saturday I have 10:00 and 2:00 open for a gel manicure. Which suits you?", ago(409))]),
    thread("cv-marco", contact("k-marco", "Marco Ibáñez", "0102", { phone_e164: null, email: "marco@example.com" }), [msg("m-m1", "in", "Do you do men's cuts? Looking for something this week.", ago(300), "email"), msg("m-m2", "ai", "We do. This week I have Thursday 5:30 PM and Friday 11:00 AM. Shall I hold one?", ago(298), "email")]),
    thread("cv-dulce", contact("k-dulce", "Dulce Amaro", "0103"), [msg("m-d0", "in", "Booking for the 12th please", at(9, 0, -9), "sms"), msg("m-d1", "ai", "Done: the 12th at 3:00 PM.", at(9, 1, -9), "sms"), msg("m-d2", "in", "Can I bring my sister too?", ago(150), "sms")]),
    thread("cv-ana", contact("k-ana", "Ana Reyes", "0104"), [msg("m-a0", "in", "Hi, can I book a color treatment?", at(10, 0, -8)), msg("m-a1", "ai", "Of course. Friday 10:30 AM is open.", at(10, 1, -8)), msg("m-a2", "in", "I'd rather talk to a person about a refund for last time.", ago(95))], { state: "needs_human", last_wa_inbound_at: ago(95) }),
    thread("cv-kenia", contact("k-kenia", "Kenia Duarte", "0105"), [], { state: "needs_human" }),
    thread("cv-priya", contact("k-priya", "Priya Nair", "0106"), [msg("m-p0", "in", "Do you do color treatments?", at(10, 0, -12)), msg("m-p0r", "ai", "We do — I can check this week's times if you'd like.", at(10, 1, -12)), msg("m-p1", "in", "Do you do color treatments on Sundays?", ago(130)), msg("m-p2", "failed", "We're closed Sundays, but Saturday 1:00 PM is open if that works.", ago(129))], { last_wa_inbound_at: ago(130) }),
    thread("cv-bea", contact("k-bea", "Bea Lind", "0107"), [msg("m-b0", "in", "Do you have anything this week for a gloss?", at(9, 0, -20)), msg("m-b0r", "ai", "Thursday 9:00 works — see you then.", at(9, 1, -20)), msg("m-b1", "in", "Thanks, see you tomorrow!", ago(20)), msg("m-b2", "ai", "See you tomorrow at 9:00, Bea.", ago(19))], { last_wa_inbound_at: ago(20) }),
    thread("cv-sofia", contact("k-sofia", "Sofía Mendes", "0108"), [msg("m-s1", "in", "Can you hold the 3 PM for me? I'll confirm tonight.", ago(21 * 60))], { last_wa_inbound_at: ago(21 * 60) }),
  ];
  const escalations: Array<EscalationDto & { conversation_id: string }> = [
    { id: "e-ana", conversation_id: "cv-ana", reason: "human_token", details: null, state: "open", created_at: ago(94) },
    { id: "e-kenia", conversation_id: "cv-kenia", reason: "callback", details: "Call back to confirm Saturday 10:00.", state: "open", created_at: ago(40) },
  ];
  const call = (id: string, startedMin: number, durationS: number, over: Partial<CallDto> = {}): CallDto => ({
    id, retell_call_id: `r-${id}`, direction: "inbound", call_type: "phone_call", status: "ended", from_e164: phone("0199"), from_raw: null, to_e164: "+13055550100",
    started_at: ago(startedMin), ended_at: new Date(nowMs - startedMin * MIN + durationS * 1000).toISOString(), updated_at: new Date(nowMs - startedMin * MIN + durationS * 1000).toISOString(),
    duration_ms: durationS * 1000, disconnection_reason: "user_hangup", sentiment: "Positive", call_successful: true, in_voicemail: false,
    summary: "The caller asked about opening hours and booked nothing.", wanted: "Asked about opening hours.", outcome: "handled", follow_up: null, caller_name: null,
    transcript_object: null, recording: null, conversation_id: null, contact_id: null, message_id: null, contact: null, ...over,
  });
  const calls: CallDto[] = [
    call("k-tomas", 60, 250, { from_e164: phone("0110"), contact: { display_name: "Tomás Vega", wa_profile_name: null, phone_e164: phone("0110") }, contact_id: "k-tomas" }),
    call("k-kenia", 45, 125, { from_e164: phone("0105"), sentiment: "Neutral", conversation_id: "cv-kenia", contact_id: "k-kenia", contact: { display_name: "Kenia Duarte", wa_profile_name: null, phone_e164: phone("0105") }, summary: "The caller asked for a gel manicure on Saturday and wants a call back to confirm.", wanted: "Asked for a gel manicure Saturday.", outcome: "callback_needed", follow_up: "Call back to confirm Saturday 10:00.", caller_name: "Kenia" }),
    call("k-voicemail", 25, 30, { from_e164: "+13475550188", sentiment: null, in_voicemail: true, summary: null, wanted: null, outcome: "voicemail", disconnection_reason: "voicemail_reached" }),
  ];

  // The metrics as metrics_summary would count them, from the same rows.
  const since = new Date(midnight).toISOString();
  const inbound = conversations.flatMap((c) => c.messages.filter((m) => m.direction === "inbound" && Date.parse(m.created_at) >= midnight));
  const outAi = conversations.flatMap((c) => c.messages.filter((m) => m.direction === "outbound" && Date.parse(m.created_at) >= midnight));
  const answered = conversations.filter((c) => c.messages.some((m) => m.direction === "inbound" && Date.parse(m.created_at) >= midnight) && c.messages.some((m) => m.direction === "outbound" && m.status === "delivered" && Date.parse(m.created_at) >= midnight)).length;
  const lastIn = inbound.map((m) => m.created_at).sort().at(-1) ?? null;
  const lastOut = outAi.filter((m) => m.status === "delivered").map((m) => m.created_at).sort().at(-1) ?? null;
  const tallyOf = (xs: readonly string[]) => xs.reduce<Record<string, number>>((o, x) => ({ ...o, [x]: (o[x] ?? 0) + 1 }), {});
  const metrics: MetricsSummaryDto = {
    workspace: { name: "Melany's Beauty Salon", timezone: ZONE, status: "active" },
    channels: [
      { kind: "whatsapp", status: "active", number: "+1 (305) 555-0100" },
      { kind: "voice", status: "active", number: "+1 (305) 555-0100" },
      { kind: "email", status: "active", number: null, address: "hello@melanys.example" },
    ],
    window: { days: 1, since, since_local: `${today}T00:00:00`, now_local: naiveLocal(nowMs, ZONE) },
    now: {
      escalations_open: escalations.length, oldest_open_escalation_at: escalations[0].created_at, threads_needing_human: escalations.length, threads_snoozed: 0, threads_awaiting_reply: 1,
      last_inbound_at: lastIn, last_outbound_at: lastOut,
    },
    period: {
      messages_in: inbound.length, messages_out_ai: outAi.length, messages_out_you: 0,
      conversations_active: conversations.filter((c) => c.messages.some((m) => Date.parse(m.created_at) >= midnight)).length,
      answered_by_ai: answered, answered_by_you: 0, unanswered_in_window: 1, median_reply_seconds_ai: 34, send_failures: outAi.filter((m) => m.status === "failed").length,
      escalations_new: escalations.length, escalation_reasons: tallyOf(escalations.map((e) => e.reason)),
      calls: calls.length, call_seconds: calls.reduce((s, c) => s + (c.duration_ms ?? 0) / 1000, 0), call_sentiments: tallyOf(calls.map((c) => c.sentiment).filter((x): x is string => !!x)),
      calls_voicemail: calls.filter((c) => c.in_voicemail).length, new_contacts: 2,
    },
  };

  // The calendar: six today (the day module's cap cuts one), three tomorrow, two open times today.
  const person = (id: string, name: string) => ({ id, name, via: "phone" as const });
  const item = (id: string, h: number, m: number, dur: number, title: string, who: { id: string; name: string; via: "phone" } | null = null, dayOffset = 0) => ({ id, start: at(h, m, dayOffset), end: at(h, m + dur, dayOffset), title, all_day: false, person: who });
  const dayKey = (offset: number) => zoneDayKey(midnight + offset * 24 * 60 * MIN + 12 * 60 * MIN, ZONE);
  const calendarDto: CalendarWeekDto = {
    timezone: ZONE, from: dayKey(0), to: dayKey(6),
    feed: { present: true, state: "ok", read_at: now.toISOString(), events: 9, recurring_expanded: 0, skipped_recurring: 0, source: "Google Calendar" },
    hours: null, closures: [], rules: null, services: [], booking_link: null,
    next_opening: { start: at(13, 0), end: at(13, 30) },
    days: [
      { key: dayKey(0), items: [item("a1", 9, 0, 60, "Gloss", person("k-bea", "Bea Lind")), item("a2", 10, 30, 90, "Color treatment", person("k-ana", "Ana Reyes")), item("a3", 12, 0, 45, "Cut"), item("a4", 14, 0, 60, "Gel manicure", person("k-renata", "Renata Solís")), item("a5", 15, 30, 30, "Consultation"), item("a6", 17, 0, 90, "Color", person("k-dulce", "Dulce Amaro"))], windows: [{ start: at(13, 0), end: at(13, 30) }, { start: at(16, 0), end: at(17, 0) }] },
      { key: dayKey(1), items: [item("b1", 9, 30, 60, "Cut", person("k-marco", "Marco Ibáñez"), 1), item("b2", 11, 0, 60, "Gloss", null, 1), item("b3", 15, 0, 60, "Gel manicure", person("k-priya", "Priya Nair"), 1)], windows: [{ start: at(12, 0, 1), end: at(15, 0, 1) }, { start: at(16, 0, 1), end: at(18, 0, 1) }] },
      ...[2, 3, 4, 5, 6].map((d) => ({ key: dayKey(d), items: [], windows: [] })),
    ],
  };

  // People: the eight above, and six who have gone quiet. Seven said yes to messages and nobody to offers, which is
  // the Worth-a-look row the nightly pins on the salon's own workspace.
  const row = (id: string, name: string, last4: string, over: Partial<PersonRowDto> = {}): PersonRowDto => ({
    id, display_name: name, wa_profile_name: null, phone_e164: phone(last4), email: null, consent: "opted_in", consent_source: "keyword", consent_updated_at: at(9, 0, -30), dnc: false,
    channels: ["whatsapp"], conversation_count: 1, escalation_count: 0, needs_human: false, open_escalation_reason: null, open_escalation_since: null,
    latest_conversation_id: null, latest_state: "open", latest_paused_until: null, latest_assignee_user_id: null, latest_snooze_until: null, latest_wa_inbound_at: null,
    last_message_at: null, last_message_direction: null, last_message_sender: null, last_inbound_text: null, last_inbound_at: null, last_call_at: null,
    call_count: 0, call_seconds: 0, first_contact_at: at(9, 0, -30), earliest_row_at: at(9, 0, -30), has_backfill: false, has_chat: true, queued_reply_at: null, ...over,
  });
  const fromThread = (c: ConversationDto, over: Partial<PersonRowDto> = {}) => {
    const last = c.messages.at(-1);
    const lastIn = [...c.messages].reverse().find((m) => m.direction === "inbound");
    return row(c.contact.id, c.contact.display_name ?? "", (c.contact.phone_e164 ?? phone("0000")).slice(-4), {
      phone_e164: c.contact.phone_e164, email: c.contact.email ?? null, latest_conversation_id: c.id, latest_state: c.state,
      last_message_at: last?.created_at ?? null, last_message_direction: last?.direction ?? null, last_message_sender: last?.sender ?? null,
      last_inbound_text: lastIn?.body ?? null, last_inbound_at: lastIn?.created_at ?? null, latest_wa_inbound_at: c.last_wa_inbound_at ?? null,
      first_contact_at: c.messages[0]?.created_at ?? null, earliest_row_at: c.messages[0]?.created_at ?? null, has_chat: c.messages.length > 0, ...over,
    });
  };
  const peopleDtos: PersonRowDto[] = [
    ...conversations.filter((c) => c.id !== "cv-kenia").map((c) => fromThread(c, c.id === "cv-ana" ? { needs_human: true, open_escalation_reason: "human_token", open_escalation_since: ago(94), escalation_count: 1 } : {})),
    row("k-kenia", "Kenia Duarte", "0105", { has_chat: false, channels: ["voice"], call_count: 1, call_seconds: 125, last_call_at: ago(45), first_contact_at: ago(45), earliest_row_at: ago(45), latest_conversation_id: "cv-kenia", latest_state: "needs_human", needs_human: true, open_escalation_reason: "callback", open_escalation_since: ago(40), escalation_count: 1 }),
    row("k-tomas", "Tomás Vega", "0110", { has_chat: false, channels: ["voice"], call_count: 1, call_seconds: 250, last_call_at: ago(60), first_contact_at: at(9, 0, -12), earliest_row_at: at(9, 0, -12), consent: null }),
    ...["Lucía Ferreira", "Noor Haddad", "Iris Kowalski", "Camila Duarte", "Zoe Martin", "Emily Chen"].map((name, i) => row(`k-quiet-${i}`, name, `02${String(i).padStart(2, "0")}`, { last_message_at: at(11, 0, -(40 + i * 3)), last_message_direction: "outbound", last_message_sender: "ai", last_inbound_at: at(10, 50, -(40 + i * 3)), last_inbound_text: "Thanks!", first_contact_at: at(10, 0, -(90 + i)), earliest_row_at: at(10, 0, -(90 + i)), consent: i < 5 ? "opted_in" : null })),
  ];
  const peopleRows = peopleDtos.map((d) => toPersonRowVM(d, ZONE, now));
  const lists = PEOPLE_LISTS.map((l) => {
    const members = peopleRows.filter((v) => l.test(v));
    return { id: l.id, label: l.label, group: l.group, count: members.length, ids: members.map((v) => v.id), action: peopleListAction(l.id, members) };
  });

  // Broadcasts: a run waiting for a word, one under the veto window, one that went out this morning.
  const broadcast = (id: string, name: string, label: string, state: BroadcastDto["state"], recipient_count: number, over: Partial<BroadcastDto> = {}): BroadcastDto => ({
    id, name, template_id: "t-1", template_name: "quick_note", template_language: "en", params: [], audience: { kind: "playbook", id: "pb-1", label }, state,
    scheduled_for: ago(-120), started_at: null, finished_at: null, recipient_count, failure: null, created_at: ago(180), playbook_id: "pb-1", run_for: today,
    counts: { queued: recipient_count, sent: 0, skipped: 0, failed: 0, delivered: 0, read: 0, replied: 0 }, ...over,
  });
  const broadcasts: BroadcastDto[] = [
    broadcast("b-winback", `Win-back · ${today}`, "Win-back", "pending_approval", 6, { playbook_id: "pb-quiet", audience: { kind: "playbook", id: "pb-quiet", label: "Win-back" } }),
    broadcast("b-visit", `Visit reminder · ${today}`, "Visit reminder", "scheduled", 3, { playbook_id: "pb-visit", audience: { kind: "playbook", id: "pb-visit", label: "Visit reminder" }, scheduled_for: ago(-90) }),
    broadcast("b-number", "Save our number", "Everyone who said yes", "sent", 8, { playbook_id: null, audience: { kind: "everyone", id: null, label: "Everyone who said yes" }, scheduled_for: ago(185), started_at: ago(180), finished_at: ago(178), counts: { queued: 0, sent: 8, skipped: 0, failed: 0, delivered: 8, read: 5, replied: 1 } }),
  ];

  const playbooks: PlaybookCardLike[] = [
    { trigger: "visit_tomorrow", state: "running", candidates: 3, next: `today ${clockTime(nowMs + 90 * MIN, ZONE)}` },
    { trigger: "quiet_30", state: "running", candidates: 6, next: `tomorrow ${clockTime(midnight + 34 * 60 * MIN, ZONE)}` },
  ];

  // The bell: three the edge kept, three this browser derives about rows the queue already holds.
  const bellRow = (id: string, kind: BellRow["kind"], title: string, message: string, tone: BellRow["tone"], icon: string, minAgo: number, to: string, action: string, about: BellRow["about"] = null): BellRow => ({
    id, kind, icon, tone, unread: true, time: agoLabel(nowMs - minAgo * MIN, nowMs), title, message, about, actions: [{ label: action, to, primary: true }],
  });
  const bell: BellRow[] = [
    bellRow(`${SERVER_KEY_PREFIX}n-1`, "review", "1 new rating on Google", "Five stars from Bea L.: \"Always on time and the color lasts.\"", "ok", "star", 200, "reports", "Open Reports"),
    bellRow(`${SERVER_KEY_PREFIX}n-2`, "number", "Your WhatsApp number's quality rating was flagged", "Meta rates the number medium. Nothing is blocked; sends go on.", "warn", "shield", 320, "admin/integrations", "Open Connections"),
    bellRow(`${SERVER_KEY_PREFIX}n-3`, "broadcast_sent", "Save our number went out to 8 people", "1 replied so far.", "ok", "bolt", 178, "broadcasts/run:b-number", "Open the run", { type: "broadcast", id: "b-number" }),
    bellRow(`${NEEDS_KEY_PREFIX}cv-ana`, "needs_you", "Ana Reyes needs you", "I'd rather talk to a person about a refund for last time.", "warn", "alert", 94, "inbox/th-cv-ana", "Open"),
    bellRow(`${NEEDS_KEY_PREFIX}cv-kenia`, "needs_you", "Kenia Duarte needs a call back", "Call back to confirm Saturday 10:00.", "warn", "alert", 40, "inbox/th-cv-kenia", "Open"),
    bellRow(`${CALL_KEY_PREFIX}k-voicemail`, "missed_call", "Missed call · +1 (347) 555-0188", "Reached voicemail, 30s.", "warn", "phone", 25, "conversations/cv-k-voicemail", "See the call"),
  ];

  const reports = reportsSample(7, today);
  return {
    TODAY_DATA: toTodayVM(metrics, conversations, escalations, calls, now),
    __CALENDAR: { vm: toCalendarVM(calendarDto, now), fetchedAt: nowMs },
    __PLAYBOOKS: { rows: playbooks },
    __PEOPLE: { rows: peopleRows, lists, aggregates: peopleAggregates(peopleRows, nowMs), calendar: { state: "ok", source: "Google Calendar" } },
    __BROADCASTS: { rows: broadcasts.map((b) => toBroadcastVM(b, ZONE, now)) },
    __REPORTS: reports,
    __LIVE: toLiveVM(calls, null, ZONE, now),
    bell,
    metrics,
    conversations,
    escalations,
    calls,
  };
}

const kept = new Map<number, TodaySample>();

/** The sample as of `nowMs`: the same moment gives the same day, kept rather than rebuilt on every draw. */
export function todaySample(nowMs: number = Date.now()): TodaySample {
  const hit = kept.get(nowMs);
  if (hit) return hit;
  const built = build(nowMs);
  kept.set(nowMs, built);
  return built;
}

/** The bell as Today and the topbar read it, over the sample's rows, with this page's read marks kept in memory. */
function sampleBell(rows: BellRow[]) {
  const read = new Set<string>();
  const dismissed = new Set<string>();
  const subs = new Set<() => void>();
  const notify = () => subs.forEach((cb) => cb());
  const feed = () => rows.filter((r) => !dismissed.has(r.id)).map((r) => ({ ...r, unread: r.unread && !read.has(r.id) }));
  return {
    feed,
    unread: () => feed().filter((r) => r.unread).length,
    seenAll: () => { rows.forEach((r) => read.add(r.id)); notify(); },
    read: (key: string) => { read.add(key); notify(); },
    dismiss: (key: string) => { dismissed.add(key); notify(); },
    restore: (key: string) => { dismissed.delete(key); notify(); },
    onChange: (cb: () => void) => { subs.add(cb); return () => { subs.delete(cb); }; },
  };
}

/**
 * Publishes the sample where the app's globals are absent, and nothing where they stand: the app boots its own
 * surfaces from the bridge, and this file is never loaded there. The mockup loads it before its page scripts.
 */
export function installTodaySample(win: Record<string, unknown>, nowMs: number = Date.now()): void {
  const s = todaySample(nowMs);
  const put = (key: string, value: unknown) => { if (win[key] === undefined) win[key] = value; };
  for (const key of ["TODAY_DATA", "__CALENDAR", "__PLAYBOOKS", "__PEOPLE", "__BROADCASTS", "__REPORTS", "__LIVE"] as const) put(key, s[key]);
  put("__today", TODAY_HELPERS);
  put("__notifs", sampleBell(s.bell));
  put("__clock", { dayKey: (ms: number) => zoneDayKey(ms, ZONE), time: (ms: number) => clockTime(ms, ZONE) });
  // The verbs a row offers land nowhere in a mockup; they answer as the edge would after a success.
  put("__inboxVerb", async () => ({ ok: true, data: {} }));
  put("__broadcasts", { approve: async (id: string) => ({ ok: true, data: { recipient_count: s.__BROADCASTS.rows.find((r) => r.id === id)?.recipient_count ?? 0 } }), cancel: async () => ({ ok: true, data: {} }) });
  put("__refreshSurface", () => {});
  put("__refreshPlaybooks", () => {});
  put("__surfaceFailed", () => false);
}
