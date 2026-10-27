import { isFreeMail } from "./free-mail.js";
export function senderVerdictOf(said, address) {
  const a = address.trim().toLowerCase();
  const exact = said.get(a);
  if (exact) return exact;
  const labels = a.slice(a.lastIndexOf("@") + 1).split(".");
  for (let i = 0; i < labels.length - 1; i++) {
    const v = said.get(labels.slice(i).join("."));
    if (v) return v;
  }
  return null;
}
export const MAILBOX_LEFT_WHY_WORDS = {
  automated: "Marked as automated",
  auto_reply: "An automatic reply",
  report: "A delivery report",
  booking_notice: "A booking tool's notice",
  forwarding_confirmation: "Gmail's forwarding check",
  gmail_tab: "Gmail: Promotions, Social or Forums",
  updates: "Gmail: Updates, from someone new",
  said: "You said it's not a person"
};
export const MAILBOX_SENDERS_WORDS = {
  title: "Left in your mailbox",
  lead: "Mail that isn't from a person stays in your mailbox, out of Chanlytics. If anyone here is a person, bring them in.",
  empty: "Nothing has been left yet.",
  emails: (n) => `${n} email${n === 1 ? "" : "s"}`,
  bringIn: "It's a person",
  broughtIn: (who) => `${who} is a person: their mail comes in from now on, and their last six months with it.`,
  saidTitle: "Said not to be people",
  undo: "Undo",
  undone: (sender) => `${sender}: its mail is sorted as it comes again.`,
  more: (n) => `and ${n} more`,
  /** Delete person's sheet, for someone with an email address: they are a sender of automated mail. */
  notAPerson: "Not a person: their mail stays in your mailbox from now on",
  wholeDomain: (domain) => `Everything from ${domain}, too`,
  done: (who) => `${who}: not a person. Deleted, and their mail stays in your mailbox.`,
  show: "Show who",
  failed: "Could not change this."
};
const domainOf = (address) => address.slice(address.lastIndexOf("@") + 1).trim().toLowerCase();
export function senderDomainOffered(address, ownHosts) {
  const domain = domainOf(address);
  if (!domain.includes(".") || isFreeMail(domain)) return null;
  return ownHosts.some((h) => h.trim().toLowerCase() === domain) ? null : domain;
}
export function senderSortRefusal(sender, verdict, ownHosts) {
  const s = sender.trim().toLowerCase();
  if (verdict !== "automated" || s.includes("@")) return null;
  return senderDomainOffered(`x@${s}`, ownHosts) ? null : `${s} is many people's: mark one address instead.`;
}
