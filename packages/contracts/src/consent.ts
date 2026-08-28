/**
 * May we contact this person?
 *
 * One predicate, because this rule was hand-inlined in five places — the
 * webhook's consent gate, the reply route, the send job, the voice booking-link
 * function and the view model — and a rule about not contacting people who
 * asked to be left alone is the last one that should drift. Five copies is five
 * chances for the next send path to check only `consent` and miss `dnc`.
 *
 * Both columns matter and either alone is decisive:
 *   consent  the state machine the customer drives — 'unknown' | 'opted_in'
 *            | 'opted_out', written by ingest when they text STOP or START.
 *   dnc      the operator-settable override, for a request made by phone, in
 *            person, or by a regulator.
 *
 * Absence is NOT an opt-out. Both fields are optional here because a caller may
 * be holding a row selected before these columns were projected, and reading a
 * missing value as a block would silence every contact the moment somebody
 * forgot a column in a SELECT.
 */
export interface ConsentBearing {
  consent?: string | null;
  dnc?: boolean | null;
}

export function isOptedOutContact(c: ConsentBearing): boolean {
  return c.consent === "opted_out" || c.dnc === true;
}

/** The customer-facing reason, used wherever a refusal is explained. */
export const OPT_OUT_REFUSAL =
  "This customer asked to stop receiving messages. They can text START to opt back in.";
