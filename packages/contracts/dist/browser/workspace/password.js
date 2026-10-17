export const PASSWORD_MIN = 12;
export const PASSWORD_MAX_BYTES = 72;
export function passwordProblem(raw) {
  if (typeof raw !== "string" || raw.length === 0) return "Choose a password.";
  if (raw.length < PASSWORD_MIN) return `A password is at least ${PASSWORD_MIN} characters.`;
  if (new TextEncoder().encode(raw).length > PASSWORD_MAX_BYTES) {
    return `That password is too long \u2014 ${PASSWORD_MAX_BYTES} bytes at most.`;
  }
  return null;
}
export function isUsablePassword(raw) {
  return passwordProblem(raw) === null;
}
export const PASSWORD_WORDS = {
  label: "Password",
  chooseLabel: "Choose a password",
  newLabel: "New password",
  hint: `At least ${PASSWORD_MIN} characters. A long phrase beats a short puzzle.`,
  wrong: "That email and password don't match an account.",
  wrongNudge: "If you started with Google, use Continue with Google.",
  codeInstead: "Email me a code instead",
  passwordInstead: "Use your password instead",
  forgot: "Forgot your password?",
  /* ------------------------------------------------------------ the reset */
  resetTitle: "Reset your password",
  resetLead: "We'll send a 6-digit code to your work email. Enter it with the password you want.",
  resetSent: (email) => `If ${email} can receive email, a 6-digit code is on its way. Enter it below with your new password.`,
  resetSubmit: "Set my password",
  resetDone: "Your password is set \u2014 signing you in.",
  /**
   * A recovery code that did not verify. The address is already implied here
   * (they typed it on the previous step), so this may say what is wrong.
   */
  resetBadCode: "That code didn't match or has expired \u2014 ask for a new one.",
  backToSignIn: "Back to sign-in"
};
