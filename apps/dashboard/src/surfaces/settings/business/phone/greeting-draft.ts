// Chanlytics — Settings › Business: the phone greeting's draft (decision 0051, "The owner's words").
//
// What its fold opens with, what it stores, and what the box says about the line: the words a caller hears and
// every note that applies. Every sentence is contracts' (voice/greeting-owner.ts), read through the bridge; this module
// only puts the draft to them. Nothing about a greeting stops a save: the owner writes what they want, and the notes
// say what it means.

import { BUSINESS_TAB } from "@/legacy-bridge/business-tab";
import type { GreetingNote } from "@chanlytics/contracts";
import { trimmed, type Profile } from "../save";

/** The box opens on the business's own line, or on the standard one with {business} where the name goes. */
export const greetingDraftOf = (p: Profile): string => p.phone_greeting || BUSINESS_TAB.GREETING_TEMPLATE;

/** What is stored: the owner's line, or nothing for the standard one, an untouched box or an emptied one alike. */
export const greetingStoredOf = (draft: unknown): string | undefined => {
  const t = trimmed(draft);
  return t && t !== BUSINESS_TAB.GREETING_TEMPLATE ? t : undefined;
};

/** What the box says of a draft: the words a caller hears, the notes in order, and whether it is the standard line. */
interface GreetingSays {
  hears: string;
  notes: GreetingNote[];
  standard: boolean;
}

export function greetingSays(draft: unknown, name: string | null, neverQuotePrices: boolean): GreetingSays {
  const stored = greetingStoredOf(draft) ?? null;
  return {
    hears: BUSINESS_TAB.greetingOf({ name, stored, paused: false }).text,
    notes: BUSINESS_TAB.greetingNotes({
      stored,
      name,
      neverQuotePrices,
      namesMoney: BUSINESS_TAB.namesMoney,
      namesPrice: BUSINESS_TAB.violatesNoPrices,
    }),
    standard: !stored,
  };
}
