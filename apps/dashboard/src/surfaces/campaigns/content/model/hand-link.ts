/**
 * A link pasted for a piece its owner posted themselves (viewer/by-hand.tsx), as it is kept: with its https:// where none was
 * pasted (an address copied from the bar often has none), or null where it is no address a browser would open. Pure.
 */
import { HAND_LINK_MAX } from "@chanlytics/contracts";

export function handLinkOf(pasted: string): string | null {
  const typed = pasted.trim();
  if (!typed || /\s/.test(typed)) return null;
  const full = /^https?:\/\//i.test(typed) ? typed.replace(/^http:/i, "https:") : `https://${typed}`;
  if (full.length > HAND_LINK_MAX) return null;
  try {
    return new URL(full).hostname.includes(".") ? full : null;
  } catch {
    // Not an address: said as such where it was pasted.
    return null;
  }
}
