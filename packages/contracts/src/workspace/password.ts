/**
 * The password rule, and the words the three credential screens say.
 *
 * WHY LENGTH IS THE WHOLE RULE. The project's floor is twelve characters
 * (`minimum_password_length` in config.toml) and `password_requirements` is
 * deliberately empty: composition classes push people toward Passw0rd! and
 * buy nothing a longer passphrase does not buy more cheaply. The real
 * strength check is the hosted breach list ("Prevent use of leaked
 * passwords"), which refuses a password that has appeared in a known dump --
 * a check no regular expression can make.
 *
 * WHY THE CEILING IS IN BYTES. The hash behind Supabase Auth reads at most
 * 72 BYTES and ignores everything after them. A twenty-character passphrase
 * of emoji is already past that, so a character cap would silently accept a
 * credential whose tail does nothing -- and "my password stopped working
 * when I added a character" is a bug nobody can reproduce. Counted in bytes,
 * refused out loud.
 *
 * One function, called by the sign-up page, the reset page and the route, so
 * a rule the browser enforces and a rule the server enforces cannot drift.
 */

export const PASSWORD_MIN = 12;
export const PASSWORD_MAX_BYTES = 72;

/** What is wrong with this password, or null when nothing is. */
export function passwordProblem(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length === 0) return "Choose a password.";
  if (raw.length < PASSWORD_MIN) return `A password is at least ${PASSWORD_MIN} characters.`;
  if (new TextEncoder().encode(raw).length > PASSWORD_MAX_BYTES) {
    return `That password is too long — ${PASSWORD_MAX_BYTES} bytes at most.`;
  }
  return null;
}

/**
 * The same rule, as a narrowing.
 *
 * `passwordProblem` answers with a SENTENCE, which is what a person needs and
 * what a type system cannot see through: a caller that has checked it and now
 * has to hand the value on still holds a `string | undefined`. This is that
 * other half, defined in terms of the first so the two can never disagree
 * about what a usable password is.
 */
export function isUsablePassword(raw: unknown): raw is string {
  return passwordProblem(raw) === null;
}

/**
 * The sentence after a failed sign-in.
 *
 * It must read the same for an address nobody has, a password that is wrong,
 * and an account that only ever arrived through Google. Supabase already
 * answers all three identically; this keeps our surface from being more
 * helpful than that, because every improvement to this sentence is an oracle
 * for who has an account. The nudge under it is shown to everyone, so it
 * tells a Google-only account what to do without telling anyone else
 * anything.
 */
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
  resetSent: (email: string) =>
    `If ${email} can receive email, a 6-digit code is on its way. Enter it below with your new password.`,
  resetSubmit: "Set my password",
  resetDone: "Your password is set — signing you in.",
  /**
   * A recovery code that did not verify. The address is already implied here
   * (they typed it on the previous step), so this may say what is wrong.
   */
  resetBadCode: "That code didn't match or has expired — ask for a new one.",
  backToSignIn: "Back to sign-in",
} as const;
