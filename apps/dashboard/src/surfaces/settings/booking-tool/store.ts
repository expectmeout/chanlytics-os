/**
 * Whether the Booking tool's sheet is asked for on the page a person is on (Ruben, 9 October 2026: a door to it took
 * the owner to Settings, opened the row there, and left them a page away from where they pressed). A plain store, as
 * New conversation's is (inbox/new-conversation/store.ts): a door on any page asks (legacy-verbs.ts openBookingTool),
 * and the frame's one host answers (host.tsx). The address `admin/workspace/calendar` still opens the same row on
 * Settings, and is where a door goes when the sheet cannot be drawn here: no host, or a role that may not change the
 * business and so only reads the row.
 */
import { useSyncExternalStore } from "react";

interface BookingToolAsk {
  open: boolean;
  /** Counts each opening, so the sheet drawn for one starts from nothing of the last. */
  session: number;
}

const NEVER: BookingToolAsk = { open: false, session: 0 };
let toolAsked: BookingToolAsk = NEVER;
/** What had focus as the sheet was asked for: the door, which takes it back when the sheet closes. */
let opener: HTMLElement | null = null;
const watchers = new Set<() => void>();

const tellAsked = (): void => {
  for (const fn of watchers) fn();
};
const onAsked = (fn: () => void): (() => void) => {
  watchers.add(fn);
  return () => watchers.delete(fn);
};
const askedNow = (): BookingToolAsk => toolAsked;
const neverAsked = (): BookingToolAsk => NEVER;

/** Open the sheet: what the door's verb asks of the host (legacy-verbs.ts openBookingTool). */
export function askBookingTool(): void {
  const on = document.activeElement as HTMLElement | null;
  opener = on && typeof on.focus === "function" ? on : null;
  toolAsked = { open: true, session: toolAsked.session + 1 };
  tellAsked();
}

/**
 * Close it, and hand focus back to the door where nothing else took it: asked once the sheet has gone from the page,
 * since until then focus is still inside it.
 */
export function closeBookingTool(): void {
  if (!toolAsked.open) return;
  toolAsked = { ...toolAsked, open: false };
  const door = opener;
  opener = null;
  tellAsked();
  if (!door) return;
  setTimeout(() => {
    const lost = !document.activeElement || document.activeElement === document.body;
    if (lost && door.isConnected) door.focus({ preventScroll: true });
  }, 0);
}

/** What is asked of the sheet, drawn again when it changes. */
export function useBookingToolAsked(): BookingToolAsk {
  return useSyncExternalStore(onAsked, askedNow, neverAsked);
}
