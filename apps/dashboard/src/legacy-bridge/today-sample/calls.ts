/** The sample's calls: three on the usual day, four more on a busy one, as the voice provider would have kept them. */
import type { CallDto } from "@chanlytics/contracts";
import { phone, type SampleClock } from "./clock";
import { MIN_MS } from "@chanlytics/contracts";

export function sampleCalls({ nowMs, ago }: SampleClock, busy: boolean): CallDto[] {
  // Kept inside the builder on purpose: `call` is already a top-level name in six files (the copies ratchet).
  const call = (id: string, startedMin: number, durationS: number, over: Partial<CallDto> = {}): CallDto => ({
    id,
    retell_call_id: `r-${id}`,
    direction: "inbound",
    call_type: "phone_call",
    status: "ended",
    from_e164: phone("0199"),
    from_raw: null,
    to_e164: "+13055550100",
    started_at: ago(startedMin),
    ended_at: new Date(nowMs - startedMin * MIN_MS + durationS * 1000).toISOString(),
    updated_at: new Date(nowMs - startedMin * MIN_MS + durationS * 1000).toISOString(),
    duration_ms: durationS * 1000,
    disconnection_reason: "user_hangup",
    sentiment: "Positive",
    call_successful: true,
    in_voicemail: false,
    summary: "The caller asked about opening hours and booked nothing.",
    wanted: "Asked about opening hours.",
    outcome: "handled",
    follow_up: null,
    caller_name: null,
    transcript_object: null,
    recording: null,
    conversation_id: null,
    contact_id: null,
    message_id: null,
    contact: null,
    ...over,
  });
  const calls: CallDto[] = [
    call("k-tomas", 60, 250, {
      from_e164: phone("0110"),
      contact: { display_name: "Tomás Vega", wa_profile_name: null, phone_e164: phone("0110") },
      contact_id: "k-tomas",
    }),
    call("k-kenia", 45, 125, {
      from_e164: phone("0105"),
      sentiment: "Neutral",
      conversation_id: "cv-kenia",
      contact_id: "k-kenia",
      contact: { display_name: "Kenia Duarte", wa_profile_name: null, phone_e164: phone("0105") },
      summary: "The caller asked for a gel manicure on Saturday and wants a call back to confirm.",
      wanted: "Asked for a gel manicure Saturday.",
      outcome: "callback_needed",
      follow_up: "Call back to confirm Saturday 10:00.",
      caller_name: "Kenia",
    }),
    call("k-voicemail", 25, 30, {
      from_e164: "+13475550188",
      sentiment: null,
      in_voicemail: true,
      summary: null,
      wanted: null,
      outcome: "voicemail",
      disconnection_reason: "voicemail_reached",
    }),
  ];
  if (busy)
    calls.push(
      call("k-omar", 210, 95, {
        from_e164: phone("0117"),
        contact: { display_name: "Omar Haddad", wa_profile_name: null, phone_e164: phone("0117") },
        contact_id: "k-omar",
        conversation_id: "cv-omar",
        summary: "The caller confirmed his noon appointment and asked about parking.",
        wanted: "Confirmed noon.",
        outcome: "handled",
      }),
      call("k-noor", 80, 340, {
        from_e164: phone("0112"),
        contact: { display_name: "Noor Haddad", wa_profile_name: null, phone_e164: phone("0112") },
        contact_id: "k-noor",
        conversation_id: "cv-noor",
        sentiment: "Neutral",
        summary:
          "The caller asked whether the products are safe with a nut allergy and wants someone to call her back before Thursday.",
        wanted: "Asked about a nut allergy.",
        outcome: "callback_needed",
        follow_up: "Call Noor about an allergy before Thursday.",
        caller_name: "Noor",
      }),
      call("k-voicemail-2", 130, 45, {
        from_e164: "+13475550142",
        sentiment: null,
        in_voicemail: true,
        summary: null,
        wanted: null,
        outcome: "voicemail",
        disconnection_reason: "voicemail_reached",
      }),
      call("k-hangup", 15, 8, {
        from_e164: "+17865550177",
        sentiment: null,
        summary: null,
        wanted: null,
        outcome: "hung_up",
        disconnection_reason: "user_hangup",
        call_successful: false,
      }),
    );
  return calls;
}
