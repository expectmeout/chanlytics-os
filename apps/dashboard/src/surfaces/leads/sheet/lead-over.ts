/**
 * The lead sheet over another page (the canvas's W8, 18 Oct 2026: the sheet at the frame): `?lead=<id>` on the page's own
 * address, read in the browser only (the frame is one prerender for every address), so a sequence's record opens a lead
 * over itself and Back closes it. A move to another page leaves the query behind, so the sheet closes with the page; the
 * sheet's own door into a record carries its way back, which opens it again.
 */
import { useEffect, useState, type MouseEvent } from "react";
import { UUID } from "@chanlytics/contracts";
import { overQuery } from "../../see/over-query";

const PARAM = "lead";
const OVER = overQuery(PARAM);

/** The lead the address opens over its page, or none. */
function leadOverNow(): string | null {
  const id = OVER.now();
  return id && UUID.test(id) ? id : null;
}

/** Close it: Back where opening it made the entry, else the address without it. */
export function closeLeadOver(): void {
  OVER.close();
}

/** A door to a lead over this page: its address, for a new tab; a plain press opens it in place. */
export function leadOverDoor(leadId: string): { href: string; onClick: (e: MouseEvent<HTMLElement>) => void } {
  return {
    href: typeof window === "undefined" ? `?${PARAM}=${leadId}` : OVER.addressWith(leadId),
    onClick: (e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
      e.preventDefault();
      OVER.open(leadId);
    },
  };
}

/** The lead open over the page, followed as the address moves (read in the browser only: none while prerendered). */
export function useLeadOver(): string | null {
  const [lead, setLead] = useState<string | null>(() => (typeof window === "undefined" ? null : leadOverNow()));
  useEffect(() => OVER.hear(() => setLead(leadOverNow())), []);
  return lead;
}
