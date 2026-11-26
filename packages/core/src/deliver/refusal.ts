/**
 * What a refusal of the send door says on the ledger (message.send_blocked, written with the queued row it cancels:
 * 00721 message_settle): the person's consent as the door read it, or as a refusal that changed it left it, and what
 * overtook the send.
 */
import type { DeliveryRefusal, SendPurpose } from "@chanlytics/contracts";
import type { SendTold } from "@chanlytics/db/channels";
import type { Json } from "@chanlytics/db/types";

/** The person's consent, as the door read it for this send. */
interface ConsentRead {
  consent: string | null;
  dnc: boolean | null;
  marketing_consent: string | null;
  email_marketing: string | null;
}

/** A refusal's event: why, for which purpose, the person's consent, and the hand that overtook a draft. */
export function blockedEvent(
  purpose: SendPurpose,
  reason: DeliveryRefusal,
  contact: ConsentRead,
  overtakenBy: string | null,
  extra: Record<string, Json>,
): SendTold {
  return {
    kind: "blocked",
    data: {
      reason: reason,
      purpose: purpose,
      consent: contact.consent,
      dnc: contact.dnc,
      marketing_consent: contact.marketing_consent,
      ...(purpose === "outreach" || purpose === "marketing" ? { email_marketing: contact.email_marketing } : {}),
      ...(overtakenBy ? { after: overtakenBy } : {}),
      ...extra,
    },
  };
}
