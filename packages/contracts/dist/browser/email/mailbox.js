export const MAILBOX_RESERVED = /* @__PURE__ */ new Set([
  "r",
  "postmaster",
  "abuse",
  "mailer-daemon",
  "noreply",
  "no-reply",
  "admin",
  "administrator",
  "support",
  "security",
  "billing",
  "hello",
  "hi"
]);
export const MAILBOX_LOCAL_PART_MAX = 40;
export const MAILBOX_FROM_NAME_MAX = 80;
export function emailDomainOf(value) {
  const d = (value || "").trim().toLowerCase();
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d) ? d : null;
}
export function normalizeLocalPart(typed) {
  return typed.trim().toLowerCase();
}
export function whyNotALocalPart(typed) {
  const s = normalizeLocalPart(typed);
  if (!s) return "Write the part before the @, like your business's name.";
  if (s.length > MAILBOX_LOCAL_PART_MAX) return `Keep it to ${MAILBOX_LOCAL_PART_MAX} characters or fewer.`;
  if (!/^[a-z0-9-]+$/.test(s)) return "Use letters, numbers and hyphens only: no spaces, dots or other marks.";
  if (s.startsWith("-") || s.endsWith("-")) return "Start and end with a letter or a number.";
  if (MAILBOX_RESERVED.has(s)) return `\u201C${s}\u201D is kept for the mail system. Choose something that names your business.`;
  return null;
}
export function whyNotAFromName(typed) {
  const s = typed.trim();
  if (!s) return "Write the name customers should see, usually your business's.";
  if (s.length > MAILBOX_FROM_NAME_MAX) return `Keep it to ${MAILBOX_FROM_NAME_MAX} characters or fewer.`;
  return null;
}
export function suggestLocalPart(businessName) {
  const s = (businessName ?? "").normalize("NFKD").replace(/\p{M}+/gu, "").toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, MAILBOX_LOCAL_PART_MAX).replace(/-+$/g, "");
  return s && whyNotALocalPart(s) === null ? s : null;
}
export const EMAIL_NOT_ANSWERED_SENTENCE = "The receptionist does not answer email yet: every email waits for you in the Inbox.";
export const EMAIL_ELSEWHERE_SENTENCE = "Replies you send from another mail app do not show here.";
