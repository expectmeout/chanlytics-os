/**
 * People: the day's threads as rows, and six who have gone quiet. Everyone here said yes to messages and nobody to
 * offers, which is the Worth-a-look row the nightly pins on the sample's own workspace.
 */
import {
  toPersonRowVM,
  peopleAggregates,
  peopleListAction,
  PEOPLE_LISTS,
  type ConversationDto,
  type PersonRowDto,
  type PersonRowVM,
  type PeopleAggregates,
} from "@chanlytics/contracts";
import { ZONE, phone, type SampleClock } from "./clock";

export interface PeopleSample {
  rows: PersonRowVM[];
  lists: Array<{
    id: string;
    label: string;
    group: string;
    count: number;
    ids: string[];
    action: { text: string; cta: string; to: string; enabled: boolean } | null;
  }>;
  aggregates: PeopleAggregates;
  calendar: { state: "ok"; source: string };
}

/** The rows as people_list would return them: one per thread but Kenia's, Kenia and Tomás by their calls, six quiet. */
function peopleDtos({ ago, at }: SampleClock, conversations: ConversationDto[]): PersonRowDto[] {
  const row = (id: string, name: string, last4: string, over: Partial<PersonRowDto> = {}): PersonRowDto => ({
    id,
    display_name: name,
    wa_profile_name: null,
    phone_e164: phone(last4),
    email: null,
    consent: "opted_in",
    consent_source: "keyword",
    consent_updated_at: at(9, 0, -30),
    dnc: false,
    channels: ["whatsapp"],
    conversation_count: 1,
    escalation_count: 0,
    needs_human: false,
    open_escalation_reason: null,
    open_escalation_since: null,
    latest_conversation_id: null,
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
    first_contact_at: at(9, 0, -30),
    earliest_row_at: at(9, 0, -30),
    has_backfill: false,
    has_chat: true,
    queued_reply_at: null,
    ...over,
  });
  const fromThread = (c: ConversationDto, over: Partial<PersonRowDto> = {}) => {
    const last = c.messages.at(-1);
    const lastIn = [...c.messages].reverse().find((m) => m.direction === "inbound");
    return row(c.contact.id, c.contact.display_name ?? "", (c.contact.phone_e164 ?? phone("0000")).slice(-4), {
      phone_e164: c.contact.phone_e164,
      email: c.contact.email ?? null,
      latest_conversation_id: c.id,
      latest_state: c.state,
      last_message_at: last?.created_at ?? null,
      last_message_direction: last?.direction ?? null,
      last_message_sender: last?.sender ?? null,
      last_inbound_text: lastIn?.body ?? null,
      last_inbound_at: lastIn?.created_at ?? null,
      latest_wa_inbound_at: c.last_wa_inbound_at ?? null,
      first_contact_at: c.messages[0]?.created_at ?? null,
      earliest_row_at: c.messages[0]?.created_at ?? null,
      has_chat: c.messages.length > 0,
      ...over,
    });
  };
  return [
    ...conversations
      .filter((c) => c.id !== "cv-kenia")
      .map((c) =>
        fromThread(
          c,
          c.id === "cv-ana"
            ? {
                needs_human: true,
                open_escalation_reason: "human_token",
                open_escalation_since: ago(94),
                escalation_count: 1,
              }
            : {},
        ),
      ),
    row("k-kenia", "Kenia Duarte", "0105", {
      has_chat: false,
      channels: ["voice"],
      call_count: 1,
      call_seconds: 125,
      last_call_at: ago(45),
      first_contact_at: ago(45),
      earliest_row_at: ago(45),
      latest_conversation_id: "cv-kenia",
      latest_state: "needs_human",
      needs_human: true,
      open_escalation_reason: "callback",
      open_escalation_since: ago(40),
      escalation_count: 1,
    }),
    row("k-tomas", "Tomás Vega", "0110", {
      has_chat: false,
      channels: ["voice"],
      call_count: 1,
      call_seconds: 250,
      last_call_at: ago(60),
      first_contact_at: at(9, 0, -12),
      earliest_row_at: at(9, 0, -12),
      consent: null,
    }),
    ...["Lucía Ferreira", "Noor Haddad", "Iris Kowalski", "Camila Duarte", "Zoe Martin", "Emily Chen"].map((name, i) =>
      row(`k-quiet-${i}`, name, `02${String(i).padStart(2, "0")}`, {
        last_message_at: at(11, 0, -(40 + i * 3)),
        last_message_direction: "outbound",
        last_message_sender: "ai",
        last_inbound_at: at(10, 50, -(40 + i * 3)),
        last_inbound_text: "Thanks!",
        first_contact_at: at(10, 0, -(90 + i)),
        earliest_row_at: at(10, 0, -(90 + i)),
        consent: i < 5 ? "opted_in" : null,
      }),
    ),
  ];
}

/** The People surface as the page reads it: the rows through their view model, every list counted, the aggregates. */
export function samplePeople(clock: SampleClock, conversations: ConversationDto[]): PeopleSample {
  const { now, nowMs } = clock;
  const peopleRows = peopleDtos(clock, conversations).map((d) => toPersonRowVM(d, ZONE, now));
  const lists = PEOPLE_LISTS.map((l) => {
    const members = peopleRows.filter((v) => l.test(v));
    return {
      id: l.id,
      label: l.label,
      group: l.group,
      count: members.length,
      ids: members.map((v) => v.id),
      action: peopleListAction(l.id, members),
    };
  });
  return {
    rows: peopleRows,
    lists,
    aggregates: peopleAggregates(peopleRows, nowMs),
    calendar: { state: "ok", source: "Google Calendar" },
  };
}
