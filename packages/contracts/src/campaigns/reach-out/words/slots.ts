/** Words: slots. */

import { namedSlots } from "../../templates/slot-sets";
import type { SlotSet } from "../../templates/slot-sets";

export const REACH_OUT_SLOTS = [
  "opening",
  "business",
  "city",
  "your name",
  "your business",
  "booking link",
  // A company's addressee (00430), after the six: a slot's place is its number in a stored version ({{2}} is business),
  // so a slot is only ever added at the end.
  "first name",
  "company",
  "title",
  "role",
  // A lead's own receptionist's link (decision 0079): the sender fills it with the lead's preview, made at the first
  // send that names it.
  "their preview",
] as const;

export type ReachOutSlot = (typeof REACH_OUT_SLOTS)[number];

/**
 * What a person's slot says for a lead that names nobody: {{first name}} greets them as every message does ("Hi there",
 * templates' resolveParams), and {{company}} is the business's own name, which every lead has. {{title}} and {{role}}
 * claim something of a person, so they have no fallback: an email that names one for a lead with nobody named is not
 * written (missing_value), never sent with a guess.
 */
export const REACH_OUT_SLOT_FALLBACKS = {
  "first name": "there",
} as const satisfies Partial<Record<ReachOutSlot, string>>;

/** What the editor calls each slot, in its chips and its menu. */
const REACH_OUT_SLOT_LABELS: Record<ReachOutSlot, string> = {
  opening: "Opening",
  "first name": "First name",
  business: "Their business",
  company: "Their company",
  title: "Their title",
  role: "Their role",
  city: "Their city",
  "your name": "Your name",
  "your business": "Your business",
  "booking link": "Booking link",
  "their preview": "Their receptionist",
};

/** The ten as a slot set: named, in the sheet's order. Every reader of a step's words and the fill take this one. */
export const REACH_OUT_SLOT_SET: SlotSet = namedSlots(
  REACH_OUT_SLOTS,
  REACH_OUT_SLOTS.map((s) => REACH_OUT_SLOT_LABELS[s]),
);

export const REACH_OUT_SUBJECT_MAX = 80;

export const REACH_OUT_BODY_MAX = 1200;
