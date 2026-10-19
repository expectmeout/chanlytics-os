/**
 * The lead sheet over another page (the canvas's W8, 18 Oct 2026: the sheet at the frame): `?lead=<id>` on the page's own
 * address, read in the browser only (the frame is one prerender for every address), so a sequence's record opens a lead
 * over itself and Back closes it. A move to another page leaves the query behind, so the sheet closes with the page; the
 * sheet's own door into a record carries its way back, which opens it again.
 */
import { useEffect, useState, type MouseEvent } from "react";
import { UUID } from "@chanlytics/contracts";
import { hearPageMoves } from "../../legacy-verbs";

const PARAM = "lead";

/** Who is told the sheet opened or closed: the frame's host, and a record lighting the lead's row. */
const overListeners = new Set<() => void>();
const tell = () => {
  for (const fn of overListeners) fn();
};

/** The lead the address opens over its page, or none. */
function leadOverNow(): string | null {
  if (typeof window === "undefined" || !window.location) return null;
  const id = new URLSearchParams(window.location.search).get(PARAM);
  return id && UUID.test(id) ? id : null;
}

/** The page's own address with the lead over it, or with none. */
function addressWith(leadId: string | null): string {
  const url = new URL(window.location.href);
  if (leadId) url.searchParams.set(PARAM, leadId);
  else url.searchParams.delete(PARAM);
  return `${url.pathname}${url.search}${url.hash}`;
}

/** Open a lead over the page: one entry in the history, so Back closes it. */
function openLeadOver(leadId: string): void {
  if (leadOverNow() === leadId) return;
  window.history.pushState({ leadOver: leadId }, "", addressWith(leadId));
  tell();
}

/** Close it: Back where opening it made the entry, else the address without it. */
export function closeLeadOver(): void {
  if (!leadOverNow()) return;
  const state = window.history.state as { leadOver?: unknown } | null;
  if (state && typeof state.leadOver === "string") window.history.back();
  else {
    window.history.replaceState(null, "", addressWith(null));
    tell();
  }
}

/** A door to a lead over this page: its address, for a new tab; a plain press opens it in place. */
export function leadOverDoor(leadId: string): { href: string; onClick: (e: MouseEvent<HTMLElement>) => void } {
  return {
    href: typeof window === "undefined" ? `?${PARAM}=${leadId}` : addressWith(leadId),
    onClick: (e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
      e.preventDefault();
      openLeadOver(leadId);
    },
  };
}

function subscribeOver(fn: () => void): () => void {
  overListeners.add(fn);
  window.addEventListener("popstate", fn);
  // A page's move is the frame's own pushState, which no popstate says: the frame's address hears it.
  const off = hearPageMoves(fn);
  return () => {
    overListeners.delete(fn);
    window.removeEventListener("popstate", fn);
    off();
  };
}

/** The lead open over the page, followed as the address moves (read in the browser only: none while prerendered). */
export function useLeadOver(): string | null {
  const [lead, setLead] = useState<string | null>(() => (typeof window === "undefined" ? null : leadOverNow()));
  useEffect(() => subscribeOver(() => setLead(leadOverNow())), []);
  return lead;
}
