/**
 * Who is emailed when the receptionist needs a person: the config's `notifications.escalation_emails`, read and changed
 * here and nowhere else. Settings › Notifications keeps the list; Settings › Team marks the member whose address is on
 * it and turns it on or off for them; the calendar counts the addresses as the business's own (calendar-people.ts
 * ownAddressesOf), so an alert address is never taken for a customer.
 *
 * An address is compared trimmed and lowercased on both sides. The Notifications pane lowercases what it adds, the
 * server does not, and rows written before either may hold capitals: "Ana@Shop.example" on the list is the member
 * ana@shop.example.
 *
 * A change spreads the section, so what it does not touch (`from`, and whatever a later field beside the list holds)
 * is kept. The list holds one address at least and ten at most (NotificationsConfigSchema): a change that would leave
 * it empty or past ten is refused with the reason, never sent for the server to refuse.
 */

/** The most addresses alerts go to, and the fewest: the save's rule (config-schema.ts NotificationsConfigSchema). */
export const ALERT_ADDRESSES_MAX = 10;
export const ALERT_ADDRESSES_MIN = 1;

/** The section as anything holding it reads it: the list may be missing on a config never saved. */
type AlertSection = { escalation_emails?: readonly string[] | null } | null | undefined;

/** An address as the list is compared by: trimmed, lowercased; "" for nothing. */
const alertKey = (address: string | null | undefined): string =>
  String(address ?? "")
    .trim()
    .toLowerCase();

/** The addresses alerts go to, trimmed and lowercased; empty for none. */
export function alertAddressesOf(notifications: AlertSection): Set<string> {
  const out = new Set<string>();
  for (const e of notifications?.escalation_emails ?? []) {
    const key = alertKey(e);
    if (key) out.add(key);
  }
  return out;
}

/** Whether this address is emailed when the receptionist needs a person. */
export function memberGetsAlerts(email: string | null | undefined, notifications: AlertSection): boolean {
  const key = alertKey(email);
  return !!key && alertAddressesOf(notifications).has(key);
}

/** Why a change to the list was refused, in the words a page says it in. */
export const ALERT_REFUSED_WORDS = {
  last: "Someone has to get alerts. Add another address on Notifications first.",
  full: `Alerts go to ${ALERT_ADDRESSES_MAX} addresses at most. Take one off on Notifications first.`,
  address: "That doesn't look like an email address.",
} as const;
export type AlertRefusal = keyof typeof ALERT_REFUSED_WORDS;

/**
 * The section with this address on the list (`on`) or off it: the rest of the section as it was. `changed` is false
 * where the list already said so. Refused: taking off the last address, adding an eleventh, an empty address.
 */
export function withAlertAddress<S extends { escalation_emails?: readonly string[] | null }>(
  notifications: S | null | undefined,
  email: string | null | undefined,
  on: boolean,
):
  | { ok: true; changed: boolean; notifications: Omit<S, "escalation_emails"> & { escalation_emails: string[] } }
  | { ok: false; reason: AlertRefusal } {
  const key = alertKey(email);
  if (!key || !key.includes("@")) return { ok: false, reason: "address" };
  const list = [...(notifications?.escalation_emails ?? [])];
  const has = list.some((e) => alertKey(e) === key);
  const next = on ? (has ? list : [...list, key]) : list.filter((e) => alertKey(e) !== key);
  if (on && !has && next.length > ALERT_ADDRESSES_MAX) return { ok: false, reason: "full" };
  if (!on && has && next.length < ALERT_ADDRESSES_MIN) return { ok: false, reason: "last" };
  return {
    ok: true,
    changed: has !== on,
    notifications: { ...(notifications ?? ({} as S)), escalation_emails: next },
  };
}
