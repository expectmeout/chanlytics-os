export const REGISTRATION_PATHS = ["standard", "sole_proprietor"];
export function registrationPathOf(saved) {
  if (!saved) return null;
  return String(saved.ein ?? "").trim() ? "standard" : "sole_proprietor";
}
export const SOLE_PROP_LIMITS = {
  campaignsPerBrand: 1,
  numbersPerCampaign: 1,
  messagesPerSecond: 1,
  perDayTMobile: 1e3,
  perMinuteAtt: 15,
  mobileUsesEver: 3,
  emailUsesEver: 10,
  addressUsesEver: 10
};
function grouped(n) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
export function soleProprietorLimits() {
  const L = SOLE_PROP_LIMITS;
  return [
    `One number and one campaign: a second number cannot text on this registration.`,
    `About ${L.messagesPerSecond} message a second, so a hundred texts go out over a minute or two rather than at once.`,
    `T-Mobile takes ${grouped(L.perDayTMobile)} a day from you, AT&T ${L.perMinuteAtt} a minute.`,
    `The carriers text a code to your own mobile and you reply from that handset \u2014 there is no code to bring back here.`,
    `That mobile can be used on ${L.mobileUsesEver} of these registrations ever, across every provider; your email and address on ${L.emailUsesEver} each. Only the carriers can count what you have already spent.`,
    `It cannot be withdrawn once filed. If you get a tax id later, the standard registration is a new filing.`
  ];
}
export const REGISTRATION_QUESTION = {
  title: "Does the business have a tax ID?",
  sub: "It decides which registration the carriers run, and the two are not the same. Asked once.",
  /** Said under the answers, because the narrow path is a real cost and the choice is permanent. */
  nudge: "If there is an EIN, use it \u2014 none of the limits below apply to that registration."
};
export const REGISTRATION_PATH_WORDS = {
  standard: {
    choice: "Yes, it has an EIN",
    sub: "The usual registration. Nothing about your texting is capped.",
    filed: "Registered as a business"
  },
  sole_proprietor: {
    choice: "No, it is just me",
    sub: "The carriers' registration for a one-person business. It works, and it is narrower.",
    filed: "Registered as a sole proprietor"
  }
};
export const REGISTRATION_COST_WORDS = {
  standard: "Filing costs about $19 once and a few dollars a month, and cannot be undone.",
  sole_proprietor: `Filing costs a few dollars once and a few dollars a month, and cannot be undone. You are filing as a sole proprietor: one number, one campaign, about ${SOLE_PROP_LIMITS.messagesPerSecond} message a second.`
};
