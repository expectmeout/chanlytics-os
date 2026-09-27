/** The sample's open escalations: two on the usual day, four more on a busy one, each about a thread the day holds. */
import type { EscalationDto } from "@chanlytics/contracts";
import type { SampleClock } from "./clock";

export type SampleEscalation = EscalationDto & { conversation_id: string };

export function sampleEscalations({ ago }: SampleClock, busy: boolean): SampleEscalation[] {
  const escalations: SampleEscalation[] = [
    {
      id: "e-ana",
      conversation_id: "cv-ana",
      reason: "human_token",
      details: null,
      state: "open",
      created_at: ago(94),
    },
    {
      id: "e-kenia",
      conversation_id: "cv-kenia",
      reason: "callback",
      details: "Call back to confirm Saturday 10:00.",
      state: "open",
      created_at: ago(40),
    },
  ];
  if (busy)
    escalations.push(
      {
        id: "e-lucia",
        conversation_id: "cv-lucia",
        reason: "human_token",
        details: null,
        state: "open",
        created_at: ago(160),
      },
      {
        id: "e-noor",
        conversation_id: "cv-noor",
        reason: "callback",
        details: "Call Noor about an allergy before Thursday.",
        state: "open",
        created_at: ago(75),
      },
      {
        id: "e-iris",
        conversation_id: "cv-iris",
        reason: "non_text",
        details: null,
        state: "open",
        created_at: ago(55),
      },
      {
        id: "e-camila",
        conversation_id: "cv-camila",
        reason: "human_token",
        details: null,
        state: "open",
        created_at: ago(35),
      },
    );
  return escalations;
}
