import { initialsOf } from "../conversations/thread-contact";
import { DAY_MS } from "../shared/time";
import { clockDate } from "../shared/clock";
import { ROLES, ROLE_SAYS } from "../config/workspace-config/role-perms";

/**
 * Who a person is, in words.
 *
 * The rule the sidebar has kept since it stopped wearing a mockup persona: a
 * name is what the person gave, never something invented from an email.
 * "hi@chanlytics.agency" is not "Hi". With no name, the account is "Your
 * account" and a member is their email, and both read as exactly what they
 * are.
 */

export interface IdentityInput {
  email: string | null;
  display_name?: string | null;
  role?: string | null;
}

export interface IdentityWords {
  /** The name given, else "Your account". */
  name: string;
  email: string;
  /** Two letters from the name, one from the email, "?" from nothing. */
  initials: string;
  /** Owner · Operator · Viewer, or "" when unknown. */
  role: string;
  /** Whether a name was given. */
  named: boolean;
}

/** Each role's name, by its key: the role words' own (role-perms.ts ROLE_SAYS), never typed a second time. */
export const ROLE_WORDS: Record<string, string> = Object.fromEntries(ROLES.map((r) => [r, ROLE_SAYS[r].label]));

/** Initials for a person: from the name they gave (the contacts' rule), else one letter from the email, else "?". */
export function personInitials(name: string | null | undefined, email: string | null | undefined): string {
  const n = (name ?? "").trim();
  if (n) return initialsOf(n);
  const e = (email ?? "").trim();
  return e ? e[0].toUpperCase() : "?";
}

export function identityWords(me: IdentityInput | null | undefined): IdentityWords {
  if (!me) return { name: "Your account", email: "", initials: "?", role: "", named: false };
  const name = (me.display_name ?? "").trim();
  return {
    name: name || "Your account",
    email: me.email ?? "",
    initials: personInitials(name, me.email),
    role: ROLE_WORDS[me.role ?? ""] ?? "",
    named: name.length > 0,
  };
}

/**
 * A member as a roster shows them: the name they gave with the email under
 * it, or the email alone — never the email's local part dressed as a name.
 */
export function memberWords(m: { email: string | null; display_name?: string | null }): {
  name: string;
  sub: string | null;
} {
  const name = (m.display_name ?? "").trim();
  if (name) return { name, sub: m.email };
  return { name: m.email ?? "Someone", sub: null };
}

export const DISPLAY_NAME_MAX = 80;

/** What a name may be before it is sent: trimmed, at most 80 characters. Empty clears it. */
export function cleanDisplayName(raw: unknown): { ok: true; name: string } | { ok: false; reason: string } {
  if (typeof raw !== "string") return { ok: false, reason: "Give a name, or leave it empty to clear it." };
  const name = raw.trim().replace(/\s+/g, " ");
  if (name.length > DISPLAY_NAME_MAX) return { ok: false, reason: `A name is at most ${DISPLAY_NAME_MAX} characters.` };
  return { ok: true, name };
}

/**
 * The name a sign-in provider gave -- Google's `full_name`, then `name` -- for
 * an account that has not given one itself. Still the rule above: a name is
 * what a person gave, and they gave this one to Google; never anything made
 * from an email. Trimmed to what `profiles.display_name` holds.
 */
export function providerNameOf(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const m = metadata as Record<string, unknown>;
  for (const key of ["full_name", "name"]) {
    const v = m[key];
    if (typeof v === "string" && v.trim()) return v.trim().replace(/\s+/g, " ").slice(0, 80);
  }
  return null;
}

/** How long a team invitation is open (00012's default, and 00371's renewal): said here, never enforced. */
export const TEAM_INVITE_DAYS = 7;

/**
 * The day a member joined, as their row's second line says it: "Joined Oct 1", with the year when it is not this one,
 * on the workspace's calendar. Null where the roster did not say (an older server's answer).
 */
export function joinedWords(joinedAt: string | null | undefined, tz: string, nowMs: number): string | null {
  const at = joinedAt ? Date.parse(joinedAt) : NaN;
  return Number.isNaN(at) ? null : `Joined ${clockDate(at, tz, nowMs)}`;
}

/**
 * An open invitation on the Team card: when it went and how long it has, or that it expired. The roster returns every
 * invitation nobody accepted or revoked, expired ones included: an expired one is still the owner's to send again, and
 * a card that called it pending for ever was lying about a door that had closed. `sent` is null where the roster did
 * not say when it went.
 */
export function invitationWords(
  inv: { createdAt?: string | null; expiresAt?: string | null },
  tz: string,
  nowMs: number,
): { expired: boolean; sent: string | null; left: string | null } {
  const sentAt = inv.createdAt ? Date.parse(inv.createdAt) : NaN;
  const sent = Number.isNaN(sentAt) ? null : `invited ${clockDate(sentAt, tz, nowMs)}`;
  const at = inv.expiresAt ? Date.parse(inv.expiresAt) : NaN;
  if (Number.isNaN(at)) return { expired: false, sent, left: null };
  if (at <= nowMs) return { expired: true, sent, left: null };
  const days = Math.ceil((at - nowMs) / DAY_MS);
  return { expired: false, sent, left: days <= 1 ? "expires today" : `${days} days left` };
}
