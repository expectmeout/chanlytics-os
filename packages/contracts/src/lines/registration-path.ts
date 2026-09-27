/**
 * Which registration a business is on, and what that path costs it.
 *
 * THE DEFECT THIS EXISTS FOR. The business-record form asked for a tax ID and
 * marked it required, because the only registration this product filed was the
 * one that needs one. A business without an EIN — a solo barber, a chair
 * renter, a one-person moving company — filled in fourteen fields and was
 * stopped at the fifteenth by a hint saying the other registration was not
 * offered yet. They are customers, and the carriers have a path for them.
 *
 * So the question is asked FIRST and the answer picks the path. Which puts a
 * fork in three places at once — which fields are asked, what counts as
 * complete, and which bundle is filed — and a fork in three places is three
 * places to disagree. This file is the one place: the two paths, how to tell
 * which one a record is on, what the narrow one gives up, and the words for
 * all of it.
 *
 * WHY IT IS NOT A COLUMN. A saved record needs no `path` field, because the
 * answer is already in it: a record with a tax ID is on the standard path, one
 * without is a sole proprietor. That reads back exactly — but only because the
 * writers keep an invariant. A standard record cannot be SAVED without its tax
 * id (`businessRecordProblems`), and a sole-proprietor record is never saved
 * WITH one (`businessRecordForPath`), so a stored record with no tax id is
 * never a standard record with a blank field.
 *
 * The one thing genuinely not derivable is an unanswered form. An empty tax id
 * box means "no EIN" or "not typed yet", the two lead to different
 * registrations, and one of them cannot be undone. So `registrationPathOf`
 * answers null for a record that is not on file yet, and the form asks instead
 * of guessing.
 */

/** The two registrations the carriers run. Nothing outside this product says these words to a customer. */
export type RegistrationPath = "standard" | "sole_proprietor";
export const REGISTRATION_PATHS: readonly RegistrationPath[] = ["standard", "sole_proprietor"];

/**
 * The path a record on file is already on, or null when there is nothing on
 * file and nobody has answered.
 *
 * Null is a third state, not a failure: it is the difference between "this
 * business has no tax id" and "we have not asked yet", and rendering a form
 * before knowing which would either demand an EIN of somebody who has none or
 * quietly file the narrow, permanent registration for somebody who does not
 * need it.
 */
export function registrationPathOf(saved: { ein?: string | null } | null | undefined): RegistrationPath | null {
  if (!saved) return null;
  return String(saved.ein ?? "").trim() ? "standard" : "sole_proprietor";
}

/**
 * What the carriers allow a sole-proprietor registration, as numbers.
 *
 * TCR's own limits, not ours, and not negotiable by us. The three "ever"
 * counts are kept by TCR across EVERY vendor — a business that tried this with
 * another provider has already spent some — so nothing here can check them,
 * which is why they are said out loud in `soleProprietorLimits()` instead.
 */
export const SOLE_PROP_LIMITS = {
  campaignsPerBrand: 1,
  numbersPerCampaign: 1,
  messagesPerSecond: 1,
  perDayTMobile: 1000,
  perMinuteAtt: 15,
  mobileUsesEver: 3,
  emailUsesEver: 10,
  addressUsesEver: 10,
} as const;

/** 1000 → "1,000", without depending on how much of ICU this runtime shipped with. */
function grouped(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * What a sole proprietor is agreeing to, before they agree to it.
 *
 * Every number is SOLE_PROP_LIMITS, read once. Said BEFORE the button rather
 * than after, because a registered brand cannot be withdrawn — the carriers
 * answer 405 to a delete, which this codebase found out by trying — so the
 * moment to hear "about one message a second" is while it is still a choice.
 */
export function soleProprietorLimits(): readonly string[] {
  const L = SOLE_PROP_LIMITS;
  return [
    `One number and one campaign: a second number cannot text on this registration.`,
    `About ${L.messagesPerSecond} message a second, so a hundred texts go out over a minute or two rather than at once.`,
    `T-Mobile takes ${grouped(L.perDayTMobile)} a day from you, AT&T ${L.perMinuteAtt} a minute.`,
    `The carriers text a code to your own mobile and you reply from that handset — there is no code to bring back here.`,
    `That mobile can be used on ${L.mobileUsesEver} of these registrations ever, across every provider; your email and address on ${L.emailUsesEver} each. Only the carriers can count what you have already spent.`,
    `It cannot be withdrawn once filed. If you get a tax id later, the standard registration is a new filing.`,
  ];
}

/** The fork, as the owner is asked it. */
export const REGISTRATION_QUESTION = {
  title: "Does the business have a tax ID?",
  sub: "It decides which registration the carriers run, and the two are not the same. Asked once.",
  /** Said under the answers, because the narrow path is a real cost and the choice is permanent. */
  nudge: "If there is an EIN, use it — none of the limits below apply to that registration.",
} as const;

export interface RegistrationPathWords {
  /** The answer, in the owner's words. */
  choice: string;
  /** What that answer means, in one line. */
  sub: string;
  /** How the filed registration is described once the answer is given. */
  filed: string;
}

export const REGISTRATION_PATH_WORDS: Record<RegistrationPath, RegistrationPathWords> = {
  standard: {
    choice: "Yes, it has an EIN",
    sub: "The usual registration. Nothing about your texting is capped.",
    filed: "Registered as a business",
  },
  sole_proprietor: {
    choice: "No, it is just me",
    sub: "The carriers' registration for a one-person business. It works, and it is narrower.",
    filed: "Registered as a sole proprietor",
  },
};

/**
 * What filing costs, per path.
 *
 * The standard figure is the one on a real invoice: $4.50 for the brand and
 * $15 for campaign vetting, read off this account's own usage records. There
 * is no verified sole-proprietor figure yet because no sole-proprietor filing
 * has happened here — so that path says the shape of the cost and not a number
 * nobody has been billed. Put the number in the moment the first invoice shows
 * it; do not put a guess in before then.
 */
export const REGISTRATION_COST_WORDS: Record<RegistrationPath, string> = {
  standard: "Filing costs about $19 once and a few dollars a month, and cannot be undone.",
  sole_proprietor: `Filing costs a few dollars once and a few dollars a month, and cannot be undone. You are filing as a sole proprietor: one number, one campaign, about ${SOLE_PROP_LIMITS.messagesPerSecond} message a second.`,
};
