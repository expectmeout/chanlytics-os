import { letterHtml } from "../../look/letter.js";
import { DAY_MS } from "../../shared/time.js";
import { fmtDate } from "../person-helpers.js";
export const SIGNUP_CONFIRM_SOURCE = "signup_confirm";
export const SIGNUP_CONFIRM_MS = 7 * DAY_MS;
export const SIGNUP_ASK_LIMITS = {
  perAddress: 3,
  perAddressMs: 90 * DAY_MS,
  perWorkspaceDay: 50,
  failedStop: 3
};
const GMAIL = /* @__PURE__ */ new Set(["gmail.com", "googlemail.com"]);
export function looksMadeUp(email) {
  const [name, domain] = email.trim().toLowerCase().split("@");
  return !!name && !!domain && GMAIL.has(domain) && (name.match(/\./g) ?? []).length >= 3;
}
export function signupAddressKey(email) {
  const e = email.trim().toLowerCase();
  const at = e.lastIndexOf("@");
  if (at < 1) return e;
  const domain = e.slice(at + 1);
  if (!GMAIL.has(domain)) return e;
  const name = e.slice(0, at);
  const tag = name.indexOf("+");
  return `${(tag < 0 ? name : name.slice(0, tag)).replace(/\./g, "")}@gmail.com`;
}
export function signupAskRefusal(typed, f) {
  if (looksMadeUp(typed)) return "made_up";
  const p = f.person;
  if (!p) return "gone";
  if (!p.email || p.email !== typed.trim().toLowerCase()) return "not_their_address";
  if (p.emailOffers === "opted_in") return "already";
  if (p.stopped) return "stopped";
  if (p.suppressed) return "suppressed";
  if (!f.mailbox) return "no_mailbox";
  if (f.open) return "open";
  if (f.addressAsks >= SIGNUP_ASK_LIMITS.perAddress) return "address_limit";
  if (f.workspaceToday >= SIGNUP_ASK_LIMITS.perWorkspaceDay) return "workspace_limit";
  if (f.failedToday >= SIGNUP_ASK_LIMITS.failedStop) return "failing";
  return null;
}
export function signupAskLine(outcome) {
  switch (outcome) {
    case "asked":
      return "We emailed them to confirm. Offers by email start once they do.";
    case "made_up":
      return "The address looks made up by a program, so we did not email it.";
    case "not_their_address":
      return "They typed an address their page does not have, so we did not email it.";
    case "already":
      return "They already said yes to offers by email.";
    case "stopped":
      return "They asked you to stop messaging them, so we did not email them.";
    case "suppressed":
      return "Email to their address does not arrive, so we did not ask them to confirm.";
    case "no_mailbox":
      return "We could not email them to confirm: you have no email address yet (Settings \u203A Connections \u203A Email).";
    case "open":
      return "We already emailed them to confirm.";
    case "not_from_website":
      return "Only someone who signed up on your website is asked to confirm by email.";
    case "no_email":
      return "Their page has no email address to ask them at.";
    case "address_limit":
      return `We did not email them to confirm: their address was asked ${SIGNUP_ASK_LIMITS.perAddress} times already in ${SIGNUP_ASK_LIMITS.perAddressMs / DAY_MS} days.`;
    case "workspace_limit":
      return `We did not email them to confirm: today's ${SIGNUP_ASK_LIMITS.perWorkspaceDay} confirmations went out already.`;
    case "failing":
      return "We did not email them to confirm: too many of today's confirmations did not arrive.";
    default:
      return null;
  }
}
export function signupConfirmEmail(p) {
  const business = p.business.trim() || "us";
  return {
    subject: `Confirm your sign-up with ${business}`.slice(0, 200),
    body: [
      `You signed up on ${business}'s website for offers and news.`,
      `To get them by email, confirm here:
${p.link}`,
      "If this wasn't you, ignore this email. Without your yes, no offers are sent."
    ].join("\n\n")
  };
}
export function signupConfirmEmailHtml(p) {
  const business = p.business.trim() || "us";
  const signedUp = `You signed up on ${business}'s website for offers and news.`;
  return letterHtml({
    look: { ...p.look, business: p.look.business.trim() || business },
    subject: signupConfirmEmail(p).subject,
    preview: signedUp,
    lines: [signedUp, "If this wasn't you, ignore this email. Without your yes, no offers are sent."],
    button: {
      words: confirmPageWords("ask", { business, address: null }).button ?? "Yes, send me offers",
      href: p.link
    },
    foot: []
  });
}
export function maskAddress(email) {
  const at = email.lastIndexOf("@");
  if (at < 1) return "your address";
  return `${email.slice(0, 1)}\u2022\u2022\u2022${email.slice(at)}`;
}
export function confirmPageWords(view, p) {
  const business = p.business?.trim() || "This business";
  const at = p.address ? maskAddress(p.address) : "your address";
  switch (view) {
    case "ask":
      return {
        title: business,
        lines: [`Get offers and news from ${business} by email at ${at}?`],
        button: "Yes, send me offers"
      };
    case "done":
      return {
        title: "Done",
        lines: [`${business} will send offers and news to ${at}. Every email has a link to stop.`],
        button: null
      };
    case "expired":
      return {
        title: "This link has ended",
        lines: [`Sign up again on ${business}'s website for a new one.`],
        button: null
      };
    case "address_changed":
      return {
        title: "This link has ended",
        lines: [`It was for an address ${business} no longer has for you.`],
        button: null
      };
    case "stopped":
      return {
        title: "Nothing changed",
        lines: [`${business} won't send you messages, because you asked them to stop.`],
        button: null
      };
    case "gone":
      return { title: "Link not found", lines: ["This link doesn't open anything."], button: null };
    default:
      return {
        title: "Not now",
        lines: ["This page can't answer right now. Try the link again in a few minutes."],
        button: null
      };
  }
}
function isSignupAsk(m) {
  const meta = m.meta && typeof m.meta === "object" ? m.meta : null;
  return m.direction === "outbound" && m.channel === "email" && meta?.source === SIGNUP_CONFIRM_SOURCE;
}
export function signupAskOf(messages, who, tz, nowMs) {
  if (who.emailOffers === "opted_in" || who.stopped) return null;
  let newest = null;
  let signedUp = who.fromWebsite;
  for (const m of messages) {
    if (!isSignupAsk(m)) continue;
    signedUp = true;
    if (m.status === "canceled") continue;
    const at = Date.parse(m.created_at);
    if (Number.isFinite(at) && (!newest || at > newest.at)) newest = { m, at };
  }
  const canAsk = signedUp && !!who.email && !who.suppressed;
  if (!newest) return canAsk ? { label: null, sub: null, act: "Ask to confirm" } : null;
  const asked = `asked ${fmtDate(newest.at, tz, nowMs)}`;
  const again = canAsk ? "Ask again" : null;
  if (newest.m.status === "failed") return { label: "Confirmation not delivered", sub: asked, act: again };
  const until = newest.at + SIGNUP_CONFIRM_MS;
  if (nowMs >= until) return { label: "Did not confirm", sub: asked, act: again };
  return { label: "Asked to confirm", sub: `${asked} \xB7 the link works until ${fmtDate(until, tz, nowMs)}`, act: null };
}
