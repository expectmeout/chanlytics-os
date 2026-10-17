export const SIGNUP_NAME_MIN = 2;
export const SIGNUP_NAME_MAX = 120;
export const SIGNUP_WAITLIST = "waitlist";
export function signupPosture(code) {
  if (!code) return "open";
  return code === SIGNUP_WAITLIST ? "waitlist" : "invite";
}
export const PENDING_WORKSPACE_KEY = "pending_workspace";
export const SIGNUP_WORDS = {
  title: "Create your workspace",
  /** The create screen while it makes the workspace from what sign-up kept: nothing is asked twice. */
  making: "Making your workspace\u2026",
  /** V1: a first workspace with no name kept from sign-up (a Google sign-up) is asked for the business, then Find. */
  nameTitle: "What's your business called?",
  nameLead: "We'll look it up on Google next.",
  nameCta: "Find it",
  lead: "Your business gets its own workspace: the receptionist, the inbox, the numbers. You become its owner.",
  sent: (email) => `If ${email} can receive email, a 6-digit code is on its way. Enter it below to finish.`,
  codeRequired: "Sign-up is by invitation right now. Enter the invite code you were given.",
  /*
   * WHEN THE CODE DID NOT GO OUT, and it is our fault rather than theirs.
   *
   * `sent` above is deliberately opaque -- "if this address can receive email" --
   * because whether an address is already registered is not a stranger's to learn
   * from a sign-up form. That is right, and it stays.
   *
   * But it was answering for a second case it does not fit. The auth mailer has a
   * declared budget of two an hour and no SMTP configured, so the third person to
   * sign up in an hour got the same "a code is on its way" and was sent to /login
   * to wait for something that would never arrive, with nothing in the product
   * telling them why.
   *
   * A send WE could not make says nothing about whether the address is known, so
   * saying so leaks nothing -- and it is the difference between waiting usefully
   * and waiting for ever. Nothing is lost because nothing was made: the name they
   * typed waits on their account for the sign-in that makes the workspace.
   */
  notSentTitle: "We could not send your code",
  notSent: "We could not send the sign-in code just now. Wait a few minutes and ask for it again from the sign-in page \u2014 nothing is lost.",
  /* ---------------------------------------------------------- the waitlist
   * Said the way a person would say it: what is true, when they will hear,
   * and no apology. "We are onboarding businesses in small groups" is the
   * honest reason -- the product provisions phone numbers and files carrier
   * registrations per customer, and doing that badly at volume is worse for
   * the people already inside than making the next ones wait. */
  waitlistTitle: "Join the list",
  waitlistLead: "We are onboarding businesses in small groups, so every new workspace gets set up properly. Leave your details and we will send you an invite.",
  waitlistSent: (email) => `You are on the list. We will write to ${email} when there is room \u2014 usually within a week.`,
  waitlistCta: "Join the list",
  /** Under the business's name on the first-workspace screen: the list writes to the address the person signed in with. */
  waitlistWriteTo: (email) => `We will write to ${email} when there is room.`,
  /** The list answered, but not with a place on it. */
  waitlistNotJoined: "You are not on the list yet. Refresh this page and try again.",
  /** No answer came back at all: said the same on the sign-up page and the first-workspace screen. */
  unreachable: "Could not reach Chanlytics just now. Try again.",
  codeWrong: "That invite code is not right.",
  crossSite: "That request did not come from this site.",
  haveOne: "Already have a workspace?",
  newHere: "New to Chanlytics?",
  clock: (tz) => `Your clock: ${tz}, read from this device. Change it later in Settings \u203A Business.`,
  /* ------------------------------------------------------------ google
   * The provider's own words for its button, and ours for what follows it. */
  google: "Continue with Google",
  or: "or, with your work email",
  googleNext: "You'll name your workspace on the next screen.",
  googleFailed: "Google sign-in didn't complete. Try again, or use your email.",
  firstWorkspaceCode: "Sign-up is by invitation right now. Enter the invite code you were given to make your first workspace.",
  /* ------------------------------------------------------- confirming the address
   * The code step now lives ON the sign-up page rather than on sign-in.
   * Somebody who has just chosen a password and is then sent to a screen
   * headed "sign in" to type six digits has been told their credential did
   * not work. It did; the address is what is unproved. */
  confirmTitle: "Confirm your email",
  confirmLead: (email) => `Enter the 6-digit code we sent to ${email}. It expires in 10 minutes.`,
  confirmSubmit: "Confirm and continue",
  /**
   * Arriving at the code step from SIGN-IN, because the address was never
   * confirmed. It says what is true, why they are seeing it, and that their
   * password was not the problem -- which is the thing they would otherwise
   * assume, and would then try to reset.
   */
  confirmFromSignIn: (email) => `Your password is right. This address was never confirmed, so we've sent a new 6-digit code to ${email}.`
};
export function sendFailureIsOurs(e) {
  if (!e) return false;
  if (e.code === "over_email_send_rate_limit" || e.code === "email_provider_disabled") return true;
  if (e.status === 429) return true;
  return /rate limit|too many requests|email provider|smtp|error sending [a-z ]*email/i.test(e.message ?? "");
}
export function addressAlreadyKnown(e) {
  if (!e) return false;
  if (e.code === "email_exists" || e.code === "user_already_exists") return true;
  return /already (been )?registered|already exists/i.test(e.message ?? "");
}
export function emailNotConfirmed(e) {
  if (!e) return false;
  if (e.code === "email_not_confirmed") return true;
  return /email not confirmed|not confirmed/i.test(e.message ?? "");
}
export function deviceTimezone(resolve = () => Intl.DateTimeFormat().resolvedOptions().timeZone) {
  try {
    const tz = resolve();
    return tz && tz.length <= 64 ? tz : void 0;
  } catch {
    return void 0;
  }
}
export function firstWorkspaceDoor(o) {
  if (o.memberships > 0) return { open: true };
  if (o.posture === "waitlist") return { open: false, code: "forbidden", message: SIGNUP_WORDS.waitlistLead };
  if (o.posture === "invite" && !o.codeMatches)
    return { open: false, code: "forbidden", message: SIGNUP_WORDS.codeWrong };
  return { open: true };
}
export function googleCallbackUrl(origin, next) {
  return `${origin}/auth/callback?next=${encodeURIComponent(next || "/")}`;
}
export const SIGNIN_RESEND_COOLDOWN_S = 60;
export function resendLeft(sentAtMs, nowMs, seconds = SIGNIN_RESEND_COOLDOWN_S) {
  if (sentAtMs == null) return 0;
  return Math.max(0, Math.ceil((sentAtMs + seconds * 1e3 - nowMs) / 1e3));
}
export function requestCodeWords(e) {
  const message = e?.message ?? "";
  const wait = /after (\d+) seconds/.exec(message);
  if (wait) return `Please wait ${wait[1]}s before requesting another code.`;
  if (sendFailureIsOurs(e)) return SIGNUP_WORDS.notSent;
  if (/security purposes|rate limit|too many/i.test(message))
    return "Too many requests just now \u2014 wait a minute and try again.";
  if (/signup|otp_disabled|not allowed|not found|invalid/i.test(message)) return null;
  return message || null;
}
export function verifyCodeWords(message) {
  if (/expired|invalid/i.test(message) && /token|otp|code/i.test(message)) {
    return "That code didn't match or has expired \u2014 request a new one.";
  }
  if (/security purposes|rate limit|too many/i.test(message)) {
    return "Too many attempts \u2014 wait a minute before trying again.";
  }
  return message;
}
