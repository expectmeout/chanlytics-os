import { z } from "zod";
import { isTimezone } from "./workspace";

/**
 * Sign-up, the pure half: what the form may send, the sentences the page
 * says, and where it goes next. The route decides who exists; this file
 * decides nothing about a person.
 */

export const SIGNUP_NAME_MIN = 2;
export const SIGNUP_NAME_MAX = 120;

export const SignupSchema = z
  .object({
    name: z.string().trim().min(SIGNUP_NAME_MIN, "Give the business a name of at least 2 characters.").max(SIGNUP_NAME_MAX, "That name is too long — 120 characters at most."),
    email: z.string().trim().toLowerCase().email("Enter a work email address.").max(254),
    /** IANA zone from the device; the database validates it and the route retries without one it does not know. */
    timezone: z.string().trim().min(1).max(64).optional(),
    /** The invite code, when sign-up is by invitation. */
    code: z.string().trim().max(80).optional(),
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
  timezone: z.string().trim().min(1).max(64).nullish().transform((v) => (v && isTimezone(v) ? v : null)),
});
export type PendingWorkspace = z.infer<typeof PendingWorkspaceSchema>;

/** The pending workspace on a user's metadata, or null when there is none worth showing. Never throws: metadata is whatever Supabase holds. */
export function pendingWorkspaceOf(metadata: unknown): PendingWorkspace | null {
  if (!metadata || typeof metadata !== "object") return null;
  const r = PendingWorkspaceSchema.safeParse((metadata as Record<string, unknown>)[PENDING_WORKSPACE_KEY]);
  return r.success ? r.data : null;
}

/** What the page says, in one place. The sentence after a submit is the same whether or not the address was known. */
export const SIGNUP_WORDS = {
  title: "Create your workspace",
  lead: "Your business gets its own workspace: the receptionist, the inbox, the numbers. You become its owner.",
  sent: (email: string) => `If ${email} can receive email, a 6-digit code is on its way. Enter it on the next screen to make your workspace.`,
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
  notSent: "We could not send the sign-in code just now. Wait a few minutes and ask for it again from the sign-in page — nothing is lost.",
  /* ---------------------------------------------------------- the waitlist
   * Said the way a person would say it: what is true, when they will hear,
   * and no apology. "We are onboarding businesses in small groups" is the
   * honest reason -- the product provisions phone numbers and files carrier
   * registrations per customer, and doing that badly at volume is worse for
   * the people already inside than making the next ones wait. */
  waitlistTitle: "Join the list",
  waitlistLead: "We are onboarding businesses in small groups, so every new workspace gets set up properly. Leave your details and we will send you an invite.",
  waitlistSent: (email: string) => `You are on the list. We will write to ${email} when there is room — usually within a week.`,
  waitlistCta: "Join the list",
  codeWrong: "That invite code is not right.",
  crossSite: "That request did not come from this site.",
  haveOne: "Already have a workspace?",
  newHere: "New to Chanlytics?",
  clock: (tz: string) => `Your clock: ${tz}, read from this device. Change it later in Settings › Workspace.`,
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
 */
export function sendFailureIsOurs(e: { code?: string; status?: number; message?: string } | null | undefined): boolean {
  if (!e) return false;
  if (e.code === "over_email_send_rate_limit" || e.code === "email_provider_disabled") return true;
  if (e.status === 429) return true;
  return /rate limit|too many requests|email provider|smtp/i.test(e.message ?? "");
}

/** Where the page goes once the code is on its way: sign-in, at the code step, for this address. */
export function signupNext(email: string): string {
  return `/login?email=${encodeURIComponent(email.trim().toLowerCase())}&sent=1`;
}

/** The device's zone when the runtime knows one; otherwise nothing, and the database defaults it. */
export function deviceTimezone(resolve: () => string | undefined = () => Intl.DateTimeFormat().resolvedOptions().timeZone): string | undefined {
  try {
    const tz = resolve();
    return tz && tz.length <= 64 ? tz : undefined;
  } catch {
    return undefined;
  }
}
