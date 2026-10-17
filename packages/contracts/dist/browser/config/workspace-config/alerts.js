export const ALERT_ADDRESSES_MAX = 10;
export const ALERT_ADDRESSES_MIN = 1;
const alertKey = (address) => String(address ?? "").trim().toLowerCase();
export function alertAddressesOf(notifications) {
  const out = /* @__PURE__ */ new Set();
  for (const e of notifications?.escalation_emails ?? []) {
    const key = alertKey(e);
    if (key) out.add(key);
  }
  return out;
}
export function memberGetsAlerts(email, notifications) {
  const key = alertKey(email);
  return !!key && alertAddressesOf(notifications).has(key);
}
export const ALERT_REFUSED_WORDS = {
  last: "Someone has to get alerts. Add another address on Notifications first.",
  full: `Alerts go to ${ALERT_ADDRESSES_MAX} addresses at most. Take one off on Notifications first.`,
  address: "That doesn't look like an email address."
};
export function withAlertAddress(notifications, email, on) {
  const key = alertKey(email);
  if (!key || !key.includes("@")) return { ok: false, reason: "address" };
  const list = [...notifications?.escalation_emails ?? []];
  const has = list.some((e) => alertKey(e) === key);
  const next = on ? has ? list : [...list, key] : list.filter((e) => alertKey(e) !== key);
  if (on && !has && next.length > ALERT_ADDRESSES_MAX) return { ok: false, reason: "full" };
  if (!on && has && next.length < ALERT_ADDRESSES_MIN) return { ok: false, reason: "last" };
  return {
    ok: true,
    changed: has !== on,
    notifications: { ...notifications ?? {}, escalation_emails: next }
  };
}
