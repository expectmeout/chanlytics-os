import { initialsOf } from "../conversations/thread-contact.js";
import { DAY_MS } from "../shared/time.js";
import { clockDate } from "../shared/clock.js";
import { ROLES, ROLE_SAYS } from "../config/workspace-config/role-perms.js";
import { UNKNOWN_MEMBER_WORD } from "../shared/words.js";
export const ROLE_WORDS = Object.fromEntries(ROLES.map((r) => [r, ROLE_SAYS[r].label]));
export function personInitials(name, email) {
  const n = (name ?? "").trim();
  if (n) return initialsOf(n);
  const e = (email ?? "").trim();
  return e ? e[0].toUpperCase() : "?";
}
export function identityWords(me) {
  if (!me) return { name: "Your account", email: "", initials: "?", role: "", named: false };
  const name = (me.display_name ?? "").trim();
  return {
    name: name || "Your account",
    email: me.email ?? "",
    initials: personInitials(name, me.email),
    role: ROLE_WORDS[me.role ?? ""] ?? "",
    named: name.length > 0
  };
}
export function memberWords(m) {
  const name = (m.display_name ?? "").trim();
  if (name) return { name, sub: m.email };
  return { name: (m.email ?? "").trim() || UNKNOWN_MEMBER_WORD, sub: null };
}
export const DISPLAY_NAME_MAX = 80;
export function cleanDisplayName(raw) {
  if (typeof raw !== "string") return { ok: false, reason: "Give a name, or leave it empty to clear it." };
  const name = raw.trim().replace(/\s+/g, " ");
  if (name.length > DISPLAY_NAME_MAX) return { ok: false, reason: `A name is at most ${DISPLAY_NAME_MAX} characters.` };
  return { ok: true, name };
}
export function providerNameOf(metadata) {
  if (!metadata || typeof metadata !== "object") return null;
  const m = metadata;
  for (const key of ["full_name", "name"]) {
    const v = m[key];
    if (typeof v === "string" && v.trim()) return v.trim().replace(/\s+/g, " ").slice(0, 80);
  }
  return null;
}
export const TEAM_INVITE_DAYS = 7;
export function joinedWords(joinedAt, tz, nowMs) {
  const at = joinedAt ? Date.parse(joinedAt) : NaN;
  return Number.isNaN(at) ? null : `Joined ${clockDate(at, tz, nowMs)}`;
}
export function invitationExpired(inv, nowMs) {
  const at = inv.expiresAt ? Date.parse(inv.expiresAt) : NaN;
  return !Number.isNaN(at) && at <= nowMs;
}
export function invitationWords(inv, tz, nowMs) {
  const sentAt = inv.createdAt ? Date.parse(inv.createdAt) : NaN;
  const sent = Number.isNaN(sentAt) ? null : `invited ${clockDate(sentAt, tz, nowMs)}`;
  const at = inv.expiresAt ? Date.parse(inv.expiresAt) : NaN;
  if (Number.isNaN(at)) return { expired: false, sent, left: null };
  if (invitationExpired(inv, nowMs)) return { expired: true, sent, left: null };
  const days = Math.ceil((at - nowMs) / DAY_MS);
  return { expired: false, sent, left: days <= 1 ? "expires today" : `${days} days left` };
}
export function youJoinedWords(names) {
  if (!names.length) return null;
  const list = names.length < 3 ? names.join(" and ") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return `You joined ${list}`;
}
