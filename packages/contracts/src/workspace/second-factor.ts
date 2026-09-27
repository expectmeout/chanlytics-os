/**
 * A partner signs in with a second factor (decision 0013): an authenticator app's six-digit code, after the password,
 * the email code or Google.
 *
 * The pure half: when a session still owes its code, what the enrolment step, the sign-in step and the back office's
 * reset say, and how the Auth server's refusals read to a person. Supabase Auth holds the factor; nothing here stores
 * or checks one.
 */
import { z } from "zod";

/** What Supabase Auth says about a session: the level it has, and the level its account can reach. */
export interface AssuranceLevels {
  currentLevel: string | null;
  nextLevel: string | null;
}

/**
 * Whether this session still owes its second factor: the account has one (it can reach aal2) and the session has not
 * shown it (it is not aal2). A session with no factor, or one that already showed it, owes nothing.
 */
export function factorStepNeeded(aal: AssuranceLevels | null | undefined): boolean {
  return !!aal && aal.nextLevel === "aal2" && aal.currentLevel !== "aal2";
}

/** Where a person goes after the first factor: the second factor's page, or in. */
export const SECOND_FACTOR_PATH = "/verify";

export const SECOND_FACTOR_WORDS = {
  /** Settings › Partner. */
  title: "Protect your partner account",
  intro:
    "Your partner account can change the receptionist of every business you brought, so it asks for a second step when you sign in: a six-digit code from an authenticator app on your phone.",
  on: "Two-step sign-in is on. You'll be asked for a code from your authenticator app each time you sign in.",
  off: "Two-step sign-in is off.",
  start: "Set it up",
  starting: "Preparing…",
  scan: "Scan this with your authenticator app (Google Authenticator, 1Password, Authy or any other), or type the key below into it.",
  keyLabel: "Key",
  codeLabel: "The six-digit code it shows",
  confirm: "Turn it on",
  confirming: "Checking…",
  cancel: "Cancel",
  done: "Two-step sign-in is on.",
  unavailable: "Two-step sign-in isn't switched on for Chanlytics yet. You'll be asked to set it up once it is.",
  lost: "Lost your phone? Write to us: a person at Chanlytics removes the old authenticator after checking it's you, and you set up a new one at your next sign-in.",
  reading: "Reading your sign-in settings…",
  failed: "your sign-in settings",
  /** The page after the first factor. */
  verifyTitle: "One more step",
  verifyBody: "Enter the six-digit code from your authenticator app.",
  verifySubmit: "Continue",
  verifying: "Checking…",
  signOut: "Sign out",
  /** The back office. */
  resetLabel: "Reset two-step sign-in",
  resetQuestion: (code: string) => `Remove ${code}'s authenticator?`,
  resetDetail:
    "They can sign in with their password or an email code, and set up a new authenticator on their partner pane. Check it's them before you do this.",
  resetYes: "Yes, reset it",
  resetTyped: "why, and how you checked it's them",
} as const;

/** How the Auth server's refusal of an enrolment reads: switched off for the project, or something else. */
export function enrolRefusalWords(message: string | null | undefined): { unavailable: boolean; words: string } {
  const m = String(message ?? "");
  if (/disabled|not enabled|not allowed/i.test(m)) return { unavailable: true, words: SECOND_FACTOR_WORDS.unavailable };
  return { unavailable: false, words: "We could not start the setup just now. Try again in a minute." };
}

/** How a refused code reads: a wrong or stale code is the person's to try again; anything else is ours. */
export function factorCodeWords(message: string | null | undefined): string {
  const m = String(message ?? "");
  if (/invalid|expired|mismatch|incorrect|wrong/i.test(m))
    return "That code didn't match. Open the app and type the code it shows now.";
  if (/rate|too many/i.test(m)) return "Too many tries. Wait a minute, then type the code the app shows now.";
  return "We could not check that code just now. Try again in a minute.";
}

/** A six-digit code, as typed: spaces dropped. */
export function cleanFactorCode(raw: unknown): string | null {
  const code = String(raw ?? "").replace(/\s+/g, "");
  return /^\d{6}$/.test(code) ? code : null;
}

/** `POST platform/partners/second-factor`: whose, and why. */
export const PartnerSecondFactorResetSchema = z
  .object({
    partner_id: z.string().uuid("That partner does not exist."),
    why: z.string().trim().min(1, "Say why, and how you checked it's them.").max(500, "At most 500 characters."),
  })
  .strict();

/** The back office's answer, in words. */
export function secondFactorResetWords(code: string, removed: number): string {
  return removed > 0
    ? `${code}'s authenticator is removed. They set up a new one at their next sign-in.`
    : `${code} had no authenticator to remove. The reset is recorded.`;
}
