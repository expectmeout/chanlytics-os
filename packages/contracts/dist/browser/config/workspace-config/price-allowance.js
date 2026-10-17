import { greetingOf } from "../../voice/greeting-owner.js";
import { namesMoney, priceFigures } from "../policy.js";
import { notesInForce } from "./compose.js";
import { guardrailsInForce } from "./config-rules.js";
import { hasProfile } from "./resolve.js";
const BARE_PRICE = /^\s*(?:from|starting at|desde|a partir de)?\s*\$?\s*(\d+(?:[.,]\d{1,2})?)\s*(?:(?:-|–|to|a)\s*\$?\s*(\d+(?:[.,]\d{1,2})?))?\s*\+?\s*$/i;
const FORBIDS = /\b(?:never|don['’]?t|do not|not to|no digas|no menciones|nunca)\b/i;
const CUT = /\d\s*%?\s*(?:off|de descuento|menos)\b/i;
function amountsIn(text) {
  return text.split(/(?<=[.!?;])\s+|\n+/).filter((s) => s.trim() && !namesMoney(s) && !CUT.test(s) && !FORBIDS.test(s)).flatMap((s) => priceFigures(s)).filter((f) => /^\d+(?:\.\d+)?$/.test(f));
}
function amountsInPriceBox(note) {
  const bare = BARE_PRICE.exec(note);
  if (bare) {
    const [, low, high] = bare;
    return [low, high].filter((n) => !!n).flatMap((n) => priceFigures(`$${n}`));
  }
  return amountsIn(note);
}
export function allowedPrices(brain, tz, now) {
  const profile = brain?.profile;
  if (!profile || !hasProfile(profile) || guardrailsInForce(profile.guardrails).never_quote_prices) return null;
  const out = [];
  const add = (figures, from) => {
    for (const figure of figures) if (!out.some((p) => p.figure === figure)) out.push({ figure, from });
  };
  for (const s of profile.services ?? []) if (s.price_note) add(amountsInPriceBox(s.price_note), s.name);
  for (const n of notesInForce(profile.notes, tz, now)) add(amountsIn(`${n.title}. ${n.text}`), "Notes");
  for (const n of profile.booking_rules?.notes ?? []) add(amountsIn(n), "Booking notes");
  const greeting = profile.phone_greeting;
  const heard = greeting ? greetingOf({ name: brain?.business_name, stored: greeting, paused: false }).source : null;
  if (greeting && (heard === "owner" || heard === "owner_disclosed")) add(amountsIn(greeting), "Greeting");
  return out;
}
export function priceAllowance(brain, tz, now) {
  const list = allowedPrices(brain, tz, now);
  return list ? new Set(list.map((p) => p.figure)) : null;
}
