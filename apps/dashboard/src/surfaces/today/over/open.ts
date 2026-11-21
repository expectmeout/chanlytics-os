/**
 * Today's own presses on a visit to mark or a conversation open it over Today (the second look of 20 Nov 2026, N1 to N3):
 * `?see=visit:<id>:<day>`, `?see=thread:<id>` on Today's address, one entry, so Back closes it (today/over/mount.tsx draws
 * it). Only Today's: a bell row, a push or a link to the same conversation goes to it, on Today too (see-over.ts inPlace).
 * Any other route a press names is a move, as it was.
 */
import { drawnByToday, seeRefOfRoute } from "../../see/over";
import { openSeeOver } from "../../see/see-over";
import { appNavigate } from "../shell";

/** Today's own address on screen, `/w/<workspace>/today`: where what Today opens over itself is drawn. */
const TODAY_PATH = /^\/w\/[^/]+\/today\/?$/;

/** Open what `to` names over Today, where it is a visit or a conversation and Today is on screen; true where it did. */
export function openOnToday(to: string): boolean {
  const ref = seeRefOfRoute(to);
  if (!ref || !drawnByToday(ref)) return false;
  if (typeof window === "undefined" || !TODAY_PATH.test(window.location?.pathname ?? "")) return false;
  openSeeOver(ref);
  return true;
}

/** A door's press on Today (frame-verbs routeDoor's `go`): over Today where it can be, else to its page. */
export function goFromToday(to: string): void {
  if (!openOnToday(to)) appNavigate(to);
}
