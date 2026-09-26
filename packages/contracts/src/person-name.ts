/**
 * What to call a person. ONE answer, read by every surface.
 *
 * WHY THIS IS ITS OWN FILE. Five copies of this rule had grown up: the
 * thread's (`contactName`), People's (`personName`), the calendar's, the
 * transcript export's and the activity log's. They agreed on the order and
 * disagreed on the details — two of them printed the raw `+19293709606` where
 * the others printed `+1 (929) 370-9606` — and the one Conversations and the
 * Inbox read was fed a contact with its email address stripped out by the
 * mapper in front of it, so a person who had only ever emailed was "Unknown"
 * there and their address on their own page. A rule with one home cannot
 * disagree with itself; this one sits below everything that names a person, so
 * each of them can import it without importing each other.
 */
import { formatPhoneDisplay } from "./phone";

/** The fields a name is made from. Any of them may be missing; each is null or absent when it is. */
export interface NameableContact {
  display_name?: string | null;
  wa_profile_name?: string | null;
  phone_e164?: string | null;
  email?: string | null;
}

/**
 * The fields a caller's name is made from: what the line showed, and the
 * person the number is, when it is someone's. A call as the Calls page reads it
 * (CallDto) is one. Declared here, not imported, so this file stays below
 * everything that names a person.
 */
export interface NameableCaller {
  from_e164?: string | null;
  from_raw?: string | null;
  contact?: { display_name?: string | null; wa_profile_name?: string | null } | null;
}

/**
 * The name a human typed, else their WhatsApp name, else their number, else
 * their email address. "Unknown" is a person with none of them — never a person
 * whose only identifier is an address.
 */
export function personName(c: NameableContact | null | undefined): string {
  return c?.display_name || c?.wa_profile_name || formatPhoneDisplay(c?.phone_e164) || c?.email || "Unknown";
}

/**
 * Who a call is with, as every call surface names them: the person's name when
 * the number is someone's, else the number the phone showed, else what the line
 * handed over raw; "Caller ID withheld" when it handed over nothing. The Calls
 * page (toCallVM), Live (toLiveCallVM) and a call a citation names read it
 * here, so the three cannot drift.
 */
export function callerName(c: NameableCaller): string {
  const withheld = !c.from_e164 && !c.from_raw;
  const phone = formatPhoneDisplay(c.from_e164);
  const name = c.contact?.display_name || c.contact?.wa_profile_name || null;
  return withheld ? "Caller ID withheld" : name || phone || c.from_raw || "Unknown caller";
}
