/**
 * The demo's Live: a sample business's phone line, passed through the same contracts function a real workspace's calls go
 * through (`toLiveVM`, the heartbeat rule included), so a demo session draws the one Live page there is. One call in
 * progress with the turns so far, and one that ended an hour ago with its analysis. Deterministic: the same moment is the
 * same page. The twin it replaces was the mockup's console, with an invented caller and controls that answered a scripted
 * call; nothing here is a customer's.
 */
import { DAY_MS, HOUR_MS, toLiveVM, type CallDto, type ChannelDto } from "@chanlytics/contracts";
import type { LiveSurface } from "./surface";
import { DEMO_ZONE } from "../demo-zone";

/** The demo's Live as of `now`: what `useSurface("live")` answers for a workspace that has read its own. */
export function liveSample(now = new Date()): LiveSurface {
  const iso = (msAgo: number) => new Date(now.getTime() - msAgo).toISOString();
  const call = (over: Partial<CallDto>): CallDto => ({
    id: "c-sample-live",
    retell_call_id: "call_sample_live",
    direction: "inbound",
    call_type: "phone_call",
    status: "ongoing",
    from_e164: "+16465550123",
    from_raw: null,
    to_e164: "+13055550100",
    started_at: iso(90_000),
    ended_at: null,
    updated_at: iso(2_000),
    duration_ms: null,
    disconnection_reason: null,
    sentiment: null,
    call_successful: null,
    in_voicemail: null,
    summary: null,
    wanted: null,
    outcome: null,
    follow_up: null,
    caller_name: null,
    transcript_object: [
      { role: "agent", content: "Thank you for calling Marisa's Studio! How can I help?" },
      { role: "user", content: "Hi, do you have anything open on Thursday afternoon?" },
    ],
    recording: null,
    conversation_id: "cv-sample-1",
    contact_id: "k-sample-1",
    message_id: null,
    contact: { display_name: "Rosa Díaz", wa_profile_name: null, phone_e164: "+16465550123" },
    ...over,
  });
  const calls = [
    call({}),
    call({
      id: "c-sample-done",
      retell_call_id: "call_sample_done",
      status: "ended",
      from_e164: "+19175550106",
      started_at: iso(HOUR_MS),
      ended_at: iso(3_410_000),
      updated_at: iso(3_400_000),
      duration_ms: 190_000,
      disconnection_reason: "user_hangup",
      summary: "The caller asked about a bridal trial in October.",
      wanted: "Wants to book a bridal trial on October 3",
      outcome: "callback_needed",
      follow_up: "Call Emily back to confirm the bridal trial",
      caller_name: "Emily",
      conversation_id: "cv-sample-2",
      contact_id: "k-sample-2",
      contact: { display_name: "Emily Chen", wa_profile_name: null, phone_e164: "+19175550106" },
    }),
  ];
  const channels: ChannelDto[] = [
    {
      id: "ch-sample-voice",
      kind: "voice",
      number_e164: "+13055550100",
      status: "active",
      created_at: iso(30 * DAY_MS),
      last_inbound_at: iso(90_000),
    },
  ];
  return toLiveVM(calls, channels, DEMO_ZONE, now);
}
