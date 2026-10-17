export function factorStepNeeded(aal) {
  return !!aal && aal.nextLevel === "aal2" && aal.currentLevel !== "aal2";
}
export const SECOND_FACTOR_PATH = "/verify";
export const SECOND_FACTOR_REQUIRED_PATH = "/verify?for=partner";
export const SECOND_FACTOR_LEVEL = "aal2";
export function secondFactorShown(aal) {
  return aal === SECOND_FACTOR_LEVEL;
}
export function seatNeedsSecondFactor(role) {
  return role === "partner";
}
export const SECOND_FACTOR_WORDS = {
  /** Settings › Partner. */
  title: "Protect your partner account",
  intro: "Your partner account can change the receptionist of every business you brought, so it asks for a second step when you sign in: a six-digit code from an authenticator app on your phone.",
  on: "Two-step sign-in is on. You'll be asked for a code from your authenticator app each time you sign in.",
  off: "Two-step sign-in is off.",
  start: "Set it up",
  starting: "Preparing\u2026",
  scan: "Scan this with your authenticator app (Google Authenticator, 1Password, Authy or any other), or type the key below into it.",
  keyLabel: "Key",
  codeLabel: "The six-digit code it shows",
  confirm: "Turn it on",
  confirming: "Checking\u2026",
  cancel: "Cancel",
  done: "Two-step sign-in is on.",
  unavailable: "Two-step sign-in isn't switched on for Chanlytics yet. You'll be asked to set it up once it is.",
  lost: "Lost your phone? Write to us: a person at Chanlytics removes the old authenticator after checking it's you, and you set up a new one at your next sign-in.",
  reading: "Reading your sign-in settings\u2026",
  failed: "your sign-in settings",
  /** The page after the first factor. */
  verifyTitle: "One more step",
  verifyBody: "Enter the six-digit code from your authenticator app.",
  verifySubmit: "Continue",
  verifying: "Checking\u2026",
  signOut: "Sign out",
  /** The back office. */
  resetLabel: "Reset two-step sign-in",
  resetQuestion: (code) => `Remove ${code}'s authenticator?`,
  resetDetail: "They can sign in with their password or an email code, and set up a new authenticator on their partner pane. Check it's them before you do this.",
  resetYes: "Yes, reset it",
  resetTyped: "why, and how you checked it's them",
  /** The refusal (M3): a partner's seat, or the partner account itself, on a session that has not shown its code. */
  required: "Your partner account asks for a code from your authenticator app. Enter it, or set the app up, and try again.",
  /** The second step's page, for a partner account with no authenticator yet. */
  enrolTitle: "Set up two-step sign-in",
  enrolBody: "Your partner account can change the receptionist of every business you brought, so it asks for a code from an authenticator app each time you sign in. Set it up once to continue.",
  /** Settings › Partner, before becoming one. */
  becomeFirst: "First, protect your account: a partner signs in with a code from an authenticator app."
};
export function enrolRefusalWords(message) {
  const m = String(message ?? "");
  if (/disabled|not enabled|not allowed/i.test(m)) return { unavailable: true, words: SECOND_FACTOR_WORDS.unavailable };
  return { unavailable: false, words: "We could not start the setup just now. Try again in a minute." };
}
export function factorCodeWords(message) {
  const m = String(message ?? "");
  if (/invalid|expired|mismatch|incorrect|wrong/i.test(m))
    return "That code didn't match. Open the app and type the code it shows now.";
  if (/rate|too many/i.test(m)) return "Too many tries. Wait a minute, then type the code the app shows now.";
  return "We could not check that code just now. Try again in a minute.";
}
export function cleanFactorCode(raw) {
  const code = String(raw ?? "").replace(/\s+/g, "");
  return /^\d{6}$/.test(code) ? code : null;
}
export function secondFactorResetWords(code, removed) {
  return removed > 0 ? `${code}'s authenticator is removed. They set up a new one at their next sign-in.` : `${code} had no authenticator to remove. The reset is recorded.`;
}
