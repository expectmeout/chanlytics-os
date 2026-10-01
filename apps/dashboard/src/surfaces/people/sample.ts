/**
 * The demo's People: a sample business passed through the same mapping a real workspace's people go through
 * (surface.ts peopleSurfaceOf), so a demo session draws the one People page there is (decision 0015, "A surface, done",
 * condition 3), as Reports and Today do. The mockup drew a seeded twin of the page, with its own scores and its own rows;
 * this is the real page over made-up people. Every number and every sentence on it is the view model's.
 *
 * Nobody here is real: the numbers are 555-01xx, the addresses example.com, the names are the mockup's own (its ids, so a
 * person a demo opens is the one its seeded profile knows). Relative to `now`, so the day is always today.
 */
import type { PersonDetailDto, PersonRowDto, PersonVisitsDto, PersonVM, VisitDto } from "@chanlytics/contracts";
import { DAY_MS, HOUR_MS, MIN_MS, toPersonVM } from "@chanlytics/contracts";
import { ZONE } from "@/surfaces/calendar/sample-clock";
import { peopleSurfaceOf } from "./surface-map";
import type { PeopleLoaded } from "./surface-map";
import type { PeopleSurface } from "./surface";

const phone = (last2: string) => `+130555501${last2}`;

/** Who a row is: their id, their name, and the last two digits of their number. */
type Who = readonly [id: string, name: string, last2: string];

/** A row as people_list returns it: someone who wrote once, said yes to messages, and nothing else. */
function baseRow(id: string, name: string, last2: string, over: Partial<PersonRowDto> = {}): PersonRowDto {
  return {
    id,
    display_name: name,
    wa_profile_name: null,
    phone_e164: phone(last2),
    email: null,
    consent: "opted_in",
    consent_source: "keyword",
    consent_updated_at: null,
    dnc: false,
    channels: ["whatsapp"],
    conversation_count: 1,
    escalation_count: 0,
    needs_human: false,
    open_escalation_reason: null,
    open_escalation_since: null,
    latest_conversation_id: `cv-${id}`,
    latest_state: "open",
    latest_paused_until: null,
    latest_assignee_user_id: null,
    latest_snooze_until: null,
    latest_wa_inbound_at: null,
    last_message_at: null,
    last_message_direction: null,
    last_message_sender: null,
    last_inbound_text: null,
    last_inbound_at: null,
    last_call_at: null,
    call_count: 0,
    call_seconds: 0,
    first_contact_at: null,
    earliest_row_at: null,
    has_backfill: false,
    has_chat: true,
    queued_reply_at: null,
    ...over,
  };
}

/** One appointment on the sample's calendar, `dayOffset` days from now at the same hour, an hour long. */
function visit(id: string, title: string, at: number, dayOffset: number): VisitDto {
  const start = at + dayOffset * DAY_MS;
  return {
    id,
    start: new Date(start).toISOString(),
    end: new Date(start + HOUR_MS).toISOString(),
    title,
    all_day: false,
    via: "phone",
  };
}

/** The people, as a small salon's front desk would see them on a Tuesday: two who need the owner, and the usual mix. */
function sampleRows(nowMs: number): PersonRowDto[] {
  const ago = (min: number) => new Date(nowMs - min * MIN_MS).toISOString();
  const calendar = (next: VisitDto | null, last: VisitDto | null): PersonVisitsDto => ({
    timezone: ZONE,
    source: "Google Calendar",
    state: "ok",
    next,
    last,
  });
  const wrote = (who: Who, minutes: number, said: string, over: Partial<PersonRowDto> = {}) =>
    baseRow(...who, {
      last_message_at: ago(minutes),
      last_message_direction: "inbound",
      last_message_sender: "customer",
      last_inbound_text: said,
      last_inbound_at: ago(minutes),
      latest_wa_inbound_at: ago(minutes),
      first_contact_at: ago(minutes + 60 * 24 * 40),
      earliest_row_at: ago(minutes + 60 * 24 * 40),
      ...over,
    });
  const answered = (who: Who, minutes: number, said: string, over: Partial<PersonRowDto> = {}) =>
    wrote(who, minutes + 2, said, {
      last_message_at: ago(minutes),
      last_message_direction: "outbound",
      last_message_sender: "ai",
      ...over,
    });
  return [
    wrote(["c-aisha", "Aisha Khan", "01"], 94, "Can I move Saturday to 11? I have to be at the airport by 2.", {
      needs_human: true,
      open_escalation_reason: "human_token",
      open_escalation_since: ago(94),
      escalation_count: 1,
      latest_state: "needs_human",
      visits: calendar(visit("v-aisha", "Balayage", nowMs + 3 * DAY_MS, 0), null),
    }),
    baseRow("c-thewellness", "@thewellness.co", "02", {
      phone_e164: null,
      email: "hello@thewellness.example.com",
      channels: [],
      message_channels: ["email"],
      needs_human: true,
      open_escalation_reason: "callback",
      open_escalation_since: ago(30),
      escalation_count: 1,
      latest_state: "needs_human",
      last_message_at: ago(30),
      last_message_direction: "inbound",
      last_message_sender: "customer",
      last_inbound_text: "We would love to do a joint giveaway with you. Could someone call us?",
      last_inbound_at: ago(30),
      first_contact_at: ago(30),
      earliest_row_at: ago(30),
    }),
    answered(["c-marcus", "Marcus Lee", "03"], 180, "Yes, Thursday at 4 works. See you then.", {
      visits: calendar(visit("v-marcus", "Haircut", nowMs + 2 * DAY_MS, 0), visit("v-marcus-0", "Haircut", nowMs, -28)),
    }),
    answered(["c-david-chen", "David Chen", "04"], 26 * 60, "Thanks, I have put it in my calendar.", {
      visits: calendar(visit("v-david-chen", "Colour", nowMs + 4 * DAY_MS, 0), null),
    }),
    wrote(["c-priya", "Priya Shah", "05"], 41 * 24 * 60, "Do you have anything open before the holidays?"),
    baseRow("c-david", "David Okafor", "06", {
      last_message_at: ago(2 * 24 * 60),
      last_message_direction: "inbound",
      last_message_sender: "customer",
      last_inbound_text: "Hi, are you taking new clients?",
      last_inbound_at: ago(2 * 24 * 60),
      latest_wa_inbound_at: ago(2 * 24 * 60),
      first_contact_at: ago(2 * 24 * 60),
      earliest_row_at: ago(2 * 24 * 60),
    }),
    wrote(["c-yuki", "Yuki Tanaka", "07"], 12 * 24 * 60, "STOP", {
      consent: "opted_out",
      consent_source: "keyword",
      dnc: true,
    }),
    answered(["c-amelia", "Amelia Brooks", "08"], 5 * 60, "See you Friday, Amelia.", {
      visits: calendar(visit("v-amelia", "Trim", nowMs + 5 * DAY_MS, 0), visit("v-amelia-0", "Colour", nowMs, -21)),
    }),
    baseRow("c-jordan", "Jordan Patel", "09", {
      channels: ["voice"],
      has_chat: false,
      latest_conversation_id: null,
      call_count: 2,
      call_seconds: 310,
      last_call_at: ago(5 * 60),
      last_inbound_call_at: ago(5 * 60),
      last_inbound_call_summary: "Asked about a keratin treatment and left a callback number.",
      first_contact_at: ago(9 * 24 * 60),
      earliest_row_at: ago(9 * 24 * 60),
    }),
    baseRow("c-maya", "Maya Rodriguez", "10", {
      consent: null,
      consent_source: null,
      has_chat: false,
      latest_conversation_id: null,
      conversation_count: 0,
      has_backfill: true,
      earliest_row_at: ago(60 * 24 * 90),
    }),
    answered(["c-rashid", "Rashid Ahmed", "11"], 45, "I have sent the link. It is open until Friday.", {
      queued_reply_at: ago(1),
      email: "rashid@example.com",
    }),
    answered(
      ["c-amy", "Amy Goldberg", "12"],
      8 * 24 * 60,
      "Glad we could get you in. Take care of the colour for a week.",
      {
        visits: calendar(null, visit("v-amy-0", "Colour", nowMs, -9)),
      },
    ),
  ];
}

/** What People reads, before it is mapped: the sample's own workspace, its lists kept by hand and by rule, and its calendar. */
function sampleLoaded(nowMs: number): PeopleLoaded {
  const people = sampleRows(nowMs);
  return {
    tz: ZONE,
    people,
    page: { q: null, offset: 0, limit: 1000, total: people.length, has_more: false },
    saved: [
      { id: "sample-regulars", name: "Regulars", ids: ["c-marcus", "c-amelia", "c-aisha"] },
      { id: "sample-callbacks", name: "Wants a callback", ids: ["c-jordan", "c-thewellness"] },
      {
        id: "sample-needs-you",
        name: "Needs you now",
        ids: [],
        rule: { v: 2, all: [{ field: "standing", op: "is", value: "needs_you" }] },
      },
    ],
    calendar: { state: "ok", source: "Google Calendar" },
    bookingLink: "https://book.example.com/studio",
    dealsOn: false,
    consultFirst: false,
    dealPace: null,
    followUp: null,
    views: {},
    viewsRead: true,
  };
}

/** The demo's People, as the seam would hold it for a workspace with these people: `now` is the day it is drawn on. */
export function peopleSample(now: Date = new Date()): PeopleSurface {
  return peopleSurfaceOf(sampleLoaded(now.getTime()), null, now);
}

let demo: PeopleSurface | null = null;
/** One sample for a demo's sitting, so the page's memo holds from one draw to the next. */
export function demoPeople(): PeopleSurface {
  demo ??= peopleSample();
  return demo;
}

/**
 * A person's whole page in the demo: the row, the conversation the row says they had (what they last wrote, and the
 * receptionist's answer where it answered), the escalation a row that needs someone names, and the visits the calendar
 * holds for them. Nothing else is invented: no notes, no deals, no campaigns (a demo has deals off), so the page says
 * what a small salon's front desk would see and no more. Null for an id the sample does not hold.
 */
function sampleDetail(id: string, now: Date = new Date()): PersonDetailDto | null {
  const nowMs = now.getTime();
  const row = sampleRows(nowMs).find((r) => r.id === id);
  if (!row) return null;
  const inbound = row.last_inbound_text
    ? [
        {
          id: `m-${id}-in`,
          conversation_id: row.latest_conversation_id ?? "",
          direction: "inbound" as const,
          sender: "customer" as const,
          channel: "whatsapp" as const,
          type: "text" as const,
          body: row.last_inbound_text,
          media: null,
          meta: null,
          status: "received" as const,
          created_at: row.last_inbound_at ?? new Date(nowMs).toISOString(),
        },
      ]
    : [];
  const answered =
    row.last_message_sender === "ai" && row.last_message_at
      ? [
          {
            id: `m-${id}-out`,
            conversation_id: row.latest_conversation_id ?? "",
            direction: "outbound" as const,
            sender: "ai" as const,
            channel: "whatsapp" as const,
            type: "text" as const,
            body: "Thanks, that is all set.",
            media: null,
            meta: null,
            status: "sent" as const,
            created_at: row.last_message_at,
          },
        ]
      : [];
  const messages = [...inbound, ...answered];
  return {
    row,
    identities: [],
    conversations:
      row.latest_conversation_id && messages.length
        ? [
            {
              id: row.latest_conversation_id,
              state: row.latest_state === "needs_human" ? ("needs_human" as const) : ("open" as const),
              paused_until: null,
              last_wa_inbound_at: row.latest_wa_inbound_at,
              last_message_at: row.last_message_at,
              contact: {
                id,
                display_name: row.display_name,
                wa_profile_name: null,
                phone_e164: row.phone_e164,
                consent: row.consent,
                dnc: row.dnc,
              },
              messages,
            },
          ]
        : [],
    calls: row.last_call_at
      ? [
          {
            id: `call-${id}`,
            retell_call_id: `call-${id}`,
            direction: "inbound" as const,
            call_type: null,
            status: "ended",
            from_e164: row.phone_e164,
            from_raw: null,
            to_e164: null,
            started_at: row.last_call_at,
            ended_at: row.last_call_at,
            duration_ms: 155_000,
            disconnection_reason: null,
            sentiment: null,
            call_successful: null,
            in_voicemail: false,
            summary: row.last_inbound_call_summary ?? null,
            transcript_object: null,
            recording: null,
            conversation_id: row.latest_conversation_id,
            contact_id: id,
            message_id: null,
            contact: { display_name: row.display_name, wa_profile_name: null, phone_e164: row.phone_e164 },
          },
        ]
      : [],
    escalations: row.needs_human
      ? [
          {
            id: `e-${id}`,
            reason: row.open_escalation_reason ?? "human_token",
            details: null,
            state: "open",
            created_at: row.open_escalation_since ?? new Date(nowMs).toISOString(),
            updated_at: row.open_escalation_since ?? new Date(nowMs).toISOString(),
            resolved_by_user_id: null,
            conversation_id: row.latest_conversation_id ?? "",
          },
        ]
      : [],
    decisions: [],
    receptionist_mode: null,
    workspace_reply_mode: "auto",
    ...(row.visits
      ? { visits: { ...row.visits, all: [row.visits.next, row.visits.last].filter((v): v is VisitDto => !!v) } }
      : {}),
    person_notes: [],
    note_team: [],
    booking_link: "https://book.example.com/studio",
    deals_on: false,
  };
}

/** A person's page as the demo draws it: the sample's detail through the same view model a real workspace's goes through. */
export function samplePerson(id: string, now: Date = new Date()): PersonVM | null {
  const dto = sampleDetail(id, now);
  return dto ? toPersonVM(dto, ZONE, now, null) : null;
}
