/**
 * Someone a page names that People's rows do not hold yet: a person linked to a business, or made, after People was last read
 * (the wiring's second audit, R10, W-person-list-lead-5). Leads' Talking door, the business beside a name, the people at a lead
 * and the Inbox header's facts read People's rows, and People is not read again on those pages for a person changed: the
 * door was missing, and "· Business" absent, until People was opened.
 *
 * Such a page asks for People to be read again: once for each person in a tab, and once a minute at most whoever asks, since it
 * is the whole book. A person People will never hold (an erased one, a stand-in) costs one read, never one a minute. Before
 * People's first read nothing is asked: that read is on its way.
 */
import { MIN_MS } from "@chanlytics/contracts";
import { refreshSurface } from "../legacy-verbs";
import { surfaceValue } from "../surface-values";

/** People's ids, kept for the rows they were made of: a page names many people. */
let heldRows: unknown = null;
let held: ReadonlySet<string> = new Set();
/** Each person asked for once in this tab. */
const asked = new Set<string>();
/** When People was last asked for on someone's account. */
let askedAt = -Infinity;

/** Ask for People to be read again where `personId` is someone it does not hold (see above). Cheap: call it as a page draws. */
export function wantPerson(personId: string | null | undefined): void {
  const rows = surfaceValue("people")?.rows;
  if (!personId || !rows) return;
  if (rows !== heldRows) {
    heldRows = rows;
    held = new Set(rows.map((r) => r.id));
  }
  if (held.has(personId) || asked.has(personId)) return;
  const now = Date.now();
  if (now - askedAt < MIN_MS) return;
  asked.add(personId);
  askedAt = now;
  // After the page has drawn: a read is never asked for from inside a draw.
  setTimeout(() => void refreshSurface("people"), 0);
}

/** For tests: forget who was asked for, and when. */
export function forgetWantedPeople(): void {
  heldRows = null;
  held = new Set();
  asked.clear();
  askedAt = -Infinity;
}
