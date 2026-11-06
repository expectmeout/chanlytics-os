/**
 * What the tab shows at once, the moment a door takes an act and before its surfaces are read again: one table by the
 * door's key, so a sheet's press and Ask's card move the same row the same way (the sheets as verbs, 14 Oct 2026). A
 * deal's door answers the deal the person's People row shows now (`current`, people_list's rule) and the one it
 * recorded, which go onto the row (People's placeDeal), so the Pipeline moves the row as the sheet closes.
 */
import type { DealDto } from "@chanlytics/contracts";
import { placeDeal } from "@/surfaces/people/surface";

/** A door's answer as a record to read fields from. */
const rec = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
/** A deal as the door answered it: an object with its id; the door's own shape (DealDto) past that. */
const isDeal = (v: unknown): v is DealDto => !!v && typeof v === "object" && typeof rec(v).id === "string";
const dealIn = (v: unknown): DealDto | null => (isDeal(v) ? v : null);

/** What the tab does as the door takes a call, by the door's key and the row its params name; nothing for most. */
export function acceptedFor(route: string, params?: Record<string, string>): ((data: unknown) => void) | undefined {
  if (route === "POST contacts/[id]/deal" && params?.id) {
    const personId = params.id;
    return (data) => {
      const d = rec(data);
      const current = dealIn(d.current);
      if (current) placeDeal(personId, current, dealIn(d.deal));
    };
  }
  return undefined;
}
