import { z } from "zod";

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

/** What the page says, in one place. The sentence after a submit is the same whether or not the address was known. */
export const SIGNUP_WORDS = {
  title: "Create your workspace",
  lead: "Your business gets its own workspace: the receptionist, the inbox, the numbers. You become its owner.",
  sent: (email: string) => `If ${email} can receive email, a 6-digit code is on its way. Enter it on the next screen to open your workspace.`,
  codeRequired: "Sign-up is by invitation right now. Enter the invite code you were given.",
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
