import { formatPhoneDisplay } from "../shared/phone.js";
export function personName(c) {
  return c?.display_name || c?.wa_profile_name || formatPhoneDisplay(c?.phone_e164) || c?.email || "Unknown";
}
export function callerName(c) {
  const withheld = !c.from_e164 && !c.from_raw;
  const phone = formatPhoneDisplay(c.from_e164);
  const name = c.contact?.display_name || c.contact?.wa_profile_name || null;
  return withheld ? "Caller ID withheld" : name || phone || c.from_raw || "Unknown caller";
}
