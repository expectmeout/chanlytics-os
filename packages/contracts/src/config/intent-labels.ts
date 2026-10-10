/**
 * What the receptionist read a customer to be after, in words an owner uses. Apart from brain.ts (moved out of it, 10 Oct
 * 2026) so a page that only says an intent's label does not carry the brain's output schema with it: brain.ts builds that
 * schema from the policy classes at the top of the module, which a bundler cannot cut.
 */
import type { BrainIntent } from "./brain";

export const INTENT_LABELS: Record<BrainIntent, string> = {
  booking: "Booking",
  pricing: "Pricing question",
  money: "Money question",
  hours: "Hours",
  services: "Services",
  location: "Location",
  complaint: "Complaint",
  smalltalk: "Small talk",
  other: "Other",
};
