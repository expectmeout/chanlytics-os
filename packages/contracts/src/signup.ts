import { z } from "zod";
import { isTimezone } from "./workspace";

/**
 * Sign-up, the pure half: what the form may send, the sentences the page
 * says, and where it goes next. The route decides who exists; this file
 * decides nothing about a person.
 */

export const SIGNUP_NAME_MIN = 2;
export const SIGNUP_NAME_MAX = 120;

/** The invite code, where sign-up is by invitation: what the form, the create screen and the kept answers all read it as. */
export const InviteCodeSchema = z.string().trim().max(80);

export const SignupSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(SIGNUP_NAME_MIN, "Give the business a name of at least 2 characters.")
      .max(SIGNUP_NAME_MAX, "That name is too long — 120 characters at most."),
    email: z.string().trim().toLowerCase().email("Enter a work email address.").max(254),
    /**
     * The credential, and the reason it is OPTIONAL here rather than required.
     *
     * The waitlist posture takes details and creates nothing -- no account, so
     * no password -- and its form shows no such field. A schema that demanded
     * one would refuse the queue, which is the posture a launch actually runs
     * in. So the shape admits it and the CREATING path insists on it: the
     * route calls `passwordProblem` the moment it knows the posture is not the
     * list, and that one function is also what the page checks with, so the
     * browser's rule and the server's rule cannot drift.
     *
     * The cap here is a body-size guard, not the rule; the rule is bytes.
     */
    password: z.string().max(200).optional(),
    /** IANA zone from the device; the database validates it and the route retries without one it does not know. */
    timezone: z.string().trim().min(1).max(64).optional(),
    /** The invite code, when sign-up is by invitation. */
    code: InviteCodeSchema.optional(),
  })
  .strict();
export type SignupInput = z.infer<typeof SignupSchema>;

/**
 * The three postures sign-up can be in, and the one switch that chooses.
 *
 * There were two: open to anyone, or closed behind an invite code. Production
 * ran OPEN, which is the right posture eventually and the wrong one before the
 * product can carry the people it lets in.
 *
 * The missing third is what a launch actually wants. A wall turns away the
 * people who wanted this enough to type their address; a queue keeps them.
 *
 * `SIGNUP_CODE` unset is open, the sentinel below is the waitlist, and any
 * other value is that invite code — so the posture changes without a deploy,
 * which matters on the day the queue is longer than the product can serve.
 */
export const SIGNUP_WAITLIST = "waitlist";

export type SignupPosture = "open" | "waitlist" | "invite";

export function signupPosture(code: string | undefined | null): SignupPosture {
  if (!code) return "open";
  return code === SIGNUP_WAITLIST ? "waitlist" : "invite";
}

/**
 * WHAT THE FORM SAID, KEPT UNTIL ITS OWNER PROVES THE INBOX.
 *
 * Sign-up used to make the workspace on the spot, for an address nobody had
 * proved. A stranger typing someone else's email got that person a workspace
 * named by the stranger, owned by an account they never asked for, provisioned
 * and counted against a cap they never spent -- and when the address's real
 * owner signed up, they were told nothing, sent a code, and signed in to the
 * stranger's choice of name.
 *
 * So the form's two answers ride on the auth user, under this key, and the
 * workspace is made by the person who enters the code, through the same door
 * a second workspace uses. This is a prefilled form, not a permission: the
 * screen shows the name and clock, the owner may change both, and nothing is
 * read from it once a workspace exists.
 */
export const PENDING_WORKSPACE_KEY = "pending_workspace";

export const PendingWorkspaceSchema = z.object({
  name: z.string().trim().min(SIGNUP_NAME_MIN).max(SIGNUP_NAME_MAX),
  // A clock Postgres would refuse is dropped here, so the owner's first Create
  // never fails over a zone a stranger's device reported.
  timezone: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .nullish()
    .transform((v) => (v && isTimezone(v) ? v : null)),
});
export type PendingWorkspace = z.infer<typeof PendingWorkspaceSchema>;

/** The pending workspace on a user's metadata, or null when there is none worth showing. Never throws: metadata is whatever Supabase holds. */
export function pendingWorkspaceOf(metadata: unknown): PendingWorkspace | null {
  if (!metadata || typeof metadata !== "object") return null;
  const r = PendingWorkspaceSchema.safeParse((metadata as Record<string, unknown>)[PENDING_WORKSPACE_KEY]);
  return r.success ? r.data : null;
}

/**
 * The invite code sign-up checked, kept beside the name so the first workspace is made from sign-up's answers alone:
 * the create route checks it again, as it checks one typed. It is never part of the form -- pendingWorkspaceOf reads
 * the name and the clock only, and zod drops the rest -- and nothing but that check reads it.
 */
export function pendingCodeOf(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const p = (metadata as Record<string, unknown>)[PENDING_WORKSPACE_KEY];
  const r = InviteCodeSchema.safeParse(p && typeof p === "object" ? (p as { code?: unknown }).code : null);
  return r.success && r.data ? r.data : null;
}

/** What the page says, in one place. The sentence after a submit is the same whether or not the address was known. */
export const SIGNUP_WORDS = {
  title: "Create your workspace",
  /** The create screen while it makes the workspace from what sign-up kept: nothing is asked twice. */
  making: "Making your workspace…",
  lead: "Your business gets its own workspace: the receptionist, the inbox, the numbers. You become its owner.",
  sent: (email: string) => `If ${email} can receive email, a 6-digit code is on its way. Enter it below to finish.`,
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
  notSent:
    "We could not send the sign-in code just now. Wait a few minutes and ask for it again from the sign-in page — nothing is lost.",
  /* ---------------------------------------------------------- the waitlist
   * Said the way a person would say it: what is true, when they will hear,
   * and no apology. "We are onboarding businesses in small groups" is the
   * honest reason -- the product provisions phone numbers and files carrier
   * registrations per customer, and doing that badly at volume is worse for
   * the people already inside than making the next ones wait. */
  waitlistTitle: "Join the list",
  waitlistLead:
    "We are onboarding businesses in small groups, so every new workspace gets set up properly. Leave your details and we will send you an invite.",
  waitlistSent: (email: string) =>
    `You are on the list. We will write to ${email} when there is room — usually within a week.`,
  waitlistCta: "Join the list",
  /** Under the business's name on the first-workspace screen: the list writes to the address the person signed in with. */
  waitlistWriteTo: (email: string) => `We will write to ${email} when there is room.`,
  /** The list answered, but not with a place on it. */
  waitlistNotJoined: "You are not on the list yet. Refresh this page and try again.",
  /** No answer came back at all: said the same on the sign-up page and the first-workspace screen. */
  unreachable: "Could not reach Chanlytics just now. Try again.",
  codeWrong: "That invite code is not right.",
  crossSite: "That request did not come from this site.",
  haveOne: "Already have a workspace?",
  newHere: "New to Chanlytics?",
  clock: (tz: string) => `Your clock: ${tz}, read from this device. Change it later in Settings › Business.`,
  /* ------------------------------------------------------------ google
   * The provider's own words for its button, and ours for what follows it. */
  google: "Continue with Google",
  or: "or, with your work email",
  googleNext: "You'll name your workspace on the next screen.",
  googleFailed: "Google sign-in didn't complete. Try again, or use your email.",
  firstWorkspaceCode:
    "Sign-up is by invitation right now. Enter the invite code you were given to make your first workspace.",
  /* ------------------------------------------------------- confirming the address
   * The code step now lives ON the sign-up page rather than on sign-in.
   * Somebody who has just chosen a password and is then sent to a screen
   * headed "sign in" to type six digits has been told their credential did
   * not work. It did; the address is what is unproved. */
  confirmTitle: "Confirm your email",
  confirmLead: (email: string) => `Enter the 6-digit code we sent to ${email}. It expires in 10 minutes.`,
  confirmSubmit: "Confirm and continue",
  /**
   * Arriving at the code step from SIGN-IN, because the address was never
   * confirmed. It says what is true, why they are seeing it, and that their
   * password was not the problem -- which is the thing they would otherwise
   * assume, and would then try to reset.
   */
  confirmFromSignIn: (email: string) =>
    `Your password is right. This address was never confirmed, so we've sent a new 6-digit code to ${email}.`,
} as const;

/**
 * Is a failed send OURS to admit, or the caller's not to learn?
 *
 * Two failures wear one shape. "This address is unknown / already registered" is
 * about THEM and must stay opaque: answering differently is an account-enumeration
 * oracle on a public form. "We are over our mail budget" or "no mail provider is
 * configured" is about US, discloses nothing about any address, and is the only
 * one a person can act on.
 *
 * Matched on Supabase's own codes and statuses first, with a message fallback,
 * because the code is the stable half and the wording is not. Anything
 * unrecognised is treated as THEIRS -- the safe direction, since a wrong guess
 * here leaks whether an account exists.
 *
 * "Error sending confirmation email", and its recovery and magic-link twins, is
 * how Supabase says the mail provider refused a send. It says the send failed,
 * not whether the address has an account, so it is OURS. Read as theirs it
 * threw, and sign-up answered a 500 where the page has a sentence for exactly
 * this (13 Sep 2026).
 */
export function sendFailureIsOurs(e: { code?: string; status?: number; message?: string } | null | undefined): boolean {
  if (!e) return false;
  if (e.code === "over_email_send_rate_limit" || e.code === "email_provider_disabled") return true;
  if (e.status === 429) return true;
  return /rate limit|too many requests|email provider|smtp|error sending [a-z ]*email/i.test(e.message ?? "");
}

/**
 * Is this the platform saying the address is already registered?
 *
 * THE PROJECT DOES NOT HIDE THIS BY ITSELF, and it is not going to. Supabase
 * returns an obfuscated user for a known address only when email AND phone
 * confirmations are both on, and the phone flag lives behind a phone provider
 * this product will never switch on: the dashboard will not save that form
 * without SMS credentials, and its own toggle says it enables phone-based
 * login. Adding a whole sign-in channel nobody uses, to hold one flag, is a
 * worse bargain than keeping the invariant ourselves.
 *
 * So the neutrality is OURS. The caller answers an address we already have
 * exactly as it answers a new one, and nothing downstream learns which it was.
 * Without this, an ordinary second sign-up becomes a 500 -- a dead end for the
 * person, and a 500-versus-200 oracle for everybody else.
 *
 * Matched on the code first: the code is the stable half and the wording is not.
 */
export function addressAlreadyKnown(e: { code?: string; message?: string } | null | undefined): boolean {
  if (!e) return false;
  if (e.code === "email_exists" || e.code === "user_already_exists") return true;
  return /already (been )?registered|already exists/i.test(e.message ?? "");
}

/**
 * The account exists, the password is right, and the address was never
 * confirmed.
 *
 * REQUIRING CONFIRMATION CREATED THIS STATE, so requiring it obliges us to
 * offer a way out of it. Somebody signs up, reaches the code screen, closes
 * the tab, and comes back tomorrow: they have an account and they know their
 * password, and sign-in refuses them. The neutral sentence about the pair not
 * matching is the right answer for a wrong password and the wrong answer here,
 * and without this branch there is no screen anywhere that would send them
 * another confirmation.
 *
 * SAYING SO LEAKS NOTHING, which is the part worth being careful about. Only a
 * caller who has supplied the correct password for an existing account reaches
 * this answer, and they plainly know the account exists. Nobody else gets here.
 */
export function emailNotConfirmed(e: { code?: string; message?: string } | null | undefined): boolean {
  if (!e) return false;
  if (e.code === "email_not_confirmed") return true;
  return /email not confirmed|not confirmed/i.test(e.message ?? "");
}

/* `signupNext` lived here: the sign-up page sent the person to /login at the
 * code step. The code step is on the sign-up page itself now, so the route
 * answers `next: null` and there is nowhere to compute. Removed rather than
 * left dead -- a helper that points at the wrong screen is how a later change
 * quietly resurrects the wrong screen. */

/** The device's zone when the runtime knows one; otherwise nothing, and the database defaults it. */
export function deviceTimezone(
  resolve: () => string | undefined = () => Intl.DateTimeFormat().resolvedOptions().timeZone,
): string | undefined {
  try {
    const tz = resolve();
    return tz && tz.length <= 64 ? tz : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The door to a FIRST workspace, for an account that arrived through a
 * provider rather than the sign-up form.
 *
 * Sign in with Google makes the auth user before anything of ours runs, so the
 * posture cannot be asked at /api/v1/signup the way the email form asks it.
 * It is asked where every first workspace is made instead -- the create route
 * -- and only of an account with no membership yet. Somebody already inside
 * was let in by an invitation or by their first workspace, and makes the next
 * one without a code.
 */
export type FirstWorkspaceDoor = { open: true } | { open: false; code: "forbidden"; message: string };

export function firstWorkspaceDoor(o: {
  posture: SignupPosture;
  memberships: number;
  codeMatches: boolean;
}): FirstWorkspaceDoor {
  if (o.memberships > 0) return { open: true };
  if (o.posture === "waitlist") return { open: false, code: "forbidden", message: SIGNUP_WORDS.waitlistLead };
  if (o.posture === "invite" && !o.codeMatches)
    return { open: false, code: "forbidden", message: SIGNUP_WORDS.codeWrong };
  return { open: true };
}

/**
 * Where Google sends the browser back: our callback, which exchanges the code
 * for the session cookie and lands where the page asked. Built here so the
 * page and its test agree on the shape, and so `next` is always encoded.
 */
export function googleCallbackUrl(origin: string, next: string): string {
  return `${origin}/auth/callback?next=${encodeURIComponent(next || "/")}`;
}

/* --------------------------------------------------- the sign-in page's rules */

/** The sign-in page's resend cooldown, in seconds: the wait Supabase enforces per address, shown rather than discovered. */
export const SIGNIN_RESEND_COOLDOWN_S = 60;

/** Seconds until "Resend code" may be pressed again; 0 when it may, or when no code was sent. */
export function resendLeft(
  sentAtMs: number | null | undefined,
  nowMs: number,
  seconds = SIGNIN_RESEND_COOLDOWN_S,
): number {
  if (sentAtMs == null) return 0;
  return Math.max(0, Math.ceil((sentAtMs + seconds * 1000 - nowMs) / 1000));
}

/**
 * Errors on the CODE-REQUEST step, translated for humans without confirming
 * whether an account exists.
 *
 * Supabase answers an unknown address with 422 "Signups not allowed for otp"
 * and a known one with 200, and the page used to render that difference as
 * "This email isn't on a Chanlytics workspace yet" -- a public oracle for
 * exactly who has an account. So a request either reports a real, actionable
 * problem or it reports nothing at all: the caller is told a code was sent
 * either way, and only someone who can read that inbox learns anything.
 * Returning null means "say the neutral thing".
 *
 * Two problems are real. The person's own: they asked twice inside the wait,
 * and are told how long. Ours: the mail budget, the provider, a project-wide
 * limit (sendFailureIsOurs, the same judgement the sign-up page makes), said
 * as the sign-up page says it and never as "too many requests" from them.
 *
 * This closes the oracle on OUR surface, not at its source -- the anon key is
 * public by design, so the Supabase endpoint still answers differently. The
 * complete fix is a CAPTCHA on the auth endpoints, which needs a provider
 * account and is flagged rather than silently half-done.
 */
export function requestCodeWords(
  e: { code?: string; status?: number; message?: string } | null | undefined,
): string | null {
  const message = e?.message ?? "";
  const wait = /after (\d+) seconds/.exec(message);
  if (wait) return `Please wait ${wait[1]}s before requesting another code.`;
  if (sendFailureIsOurs(e)) return SIGNUP_WORDS.notSent;
  if (/security purposes|rate limit|too many/i.test(message))
    return "Too many requests just now — wait a minute and try again.";
  // Anything that distinguishes "no such account" from "code sent" is
  // deliberately swallowed. A genuine outage still surfaces below.
  if (/signup|otp_disabled|not allowed|not found|invalid/i.test(message)) return null;
  return message || null;
}

/** Errors on the VERIFY step, where the account is already implied. */
export function verifyCodeWords(message: string): string {
  if (/expired|invalid/i.test(message) && /token|otp|code/i.test(message)) {
    return "That code didn't match or has expired — request a new one.";
  }
  if (/security purposes|rate limit|too many/i.test(message)) {
    return "Too many attempts — wait a minute before trying again.";
  }
  return message;
}
