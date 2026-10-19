export const LEAD_SHEET_CARD_WORDS = {
  /** Why's first head, its count at the end ("5 of 7"). */
  checksHead: "Checks",
  checks: (passed, of) => `${passed} of ${of} checks`,
  couldntTell: (n) => `${n} couldn't tell`,
  failed: (n) => `${n} failed`,
  passed: (n) => `${n} passed`,
  noEmail: "No email found",
  noPhone: "No phone",
  site: "site",
  linkedin: "LinkedIn",
  /** The legend under Why's checks: a mark seen, and a mark Claude read. */
  seen: "seen on the map or in the mailbox",
  read: "read by Claude from the listing and their site",
  /** What the card's two lines open, said to a screen reader and on hover. */
  openWhy: "Why it fits, every check",
  openContact: "Every way to reach them",
  opens: (tab) => `Opens ${tab}.`,
  notConfirmed: "not confirmed",
  email: "Email",
  phone: "Phone",
  theirSite: "their site"
};
const CW = LEAD_SHEET_CARD_WORDS;
const UNSURE_WORDS = {
  phone_two_sources: "phone not confirmed",
  mailbox: "mailbox not confirmed",
  own_address: "address not confirmed",
  on_maps: "listing not confirmed",
  in_area: "area not confirmed",
  independent: "ownership unclear",
  right_kind: "kind unclear"
};
export const leadSheetExceptionWords = (key, label) => {
  const short = UNSURE_WORDS[key];
  return short ? short.charAt(0).toUpperCase() + short.slice(1) : label;
};
export function leadSheetSubOf(vm) {
  if (vm.company) return vm.sub;
  const [kind, ...rest] = vm.sub.split(" \xB7 ");
  const [first] = vm.where ? vm.where.line.split(",") : [];
  const street = first ? first.trim() : rest.join(" \xB7 ");
  const rated = vm.rated ? `\u2605 ${vm.rated.score} (${vm.rated.count})` : null;
  return [kind, street, rated].filter(Boolean).join(" \xB7 ");
}
const checksOf = (vm) => vm.groups.flatMap(
  (g) => g.checks.map((c) => ({ key: c.key, label: c.label, how: g.how, answer: c.answer, source: c.source }))
);
const REACH_CHECKS = /* @__PURE__ */ new Set(["mailbox"]);
function exceptionOf(checks) {
  const unsure = checks.filter((c) => c.answer === "unknown");
  const failed = checks.filter((c) => c.answer === "no");
  if (!unsure.length && !failed.length) return null;
  if ([...unsure, ...failed].every((c) => REACH_CHECKS.has(c.key))) return null;
  const [only] = unsure;
  const one = only && unsure.length === 1 && !failed.length ? UNSURE_WORDS[only.key] : void 0;
  if (one) return one;
  return [failed.length ? CW.failed(failed.length) : null, unsure.length ? CW.couldntTell(unsure.length) : null].filter(Boolean).join(" \xB7 ");
}
export function leadSheetChecksLineOf(vm) {
  if (!vm.checkDots.length) return null;
  const checks = checksOf(vm);
  const passed = vm.checkDots.filter((d) => d.answer === "yes").length;
  return {
    dots: vm.checkDots.map(
      (d) => d.answer === "yes" ? d.how === "read" ? "read" : "ok" : d.answer === "unknown" ? "warn" : "no"
    ),
    words: CW.checks(passed, vm.checkDots.length),
    exception: exceptionOf(checks),
    tip: vm.checksSummary,
    fit: (vm.fit.cls === "look" || vm.fit.cls === "out") && vm.fit.word ? vm.fit.word : null
  };
}
export const leadSheetChecksSaid = (line) => `${[line.fit, line.words, line.exception].filter(Boolean).join(", ")}. ${CW.opens("Why")}`;
const LEAD_EMAIL_LINE_WORDS = {
  checked: "Checked",
  checking: "Checking\u2026",
  notConfirmed: "Not confirmed",
  none: "No email found"
};
export function leadSheetEmailLineOf(vm) {
  const E = LEAD_EMAIL_LINE_WORDS;
  const address = vm.reach.email.address;
  if (!address) return { address: null, words: E.none, tone: "plain" };
  const state = vm.slots.mailbox.state;
  if (state === "ok") return { address, words: E.checked, tone: "ok" };
  if (state === "checking") return { address, words: E.checking, tone: "plain" };
  return { address, words: E.notConfirmed, tone: "warn" };
}
export function leadSheetContactLineOf(vm) {
  const address = vm.reach.email.address;
  const site = vm.company && vm.links.linkedin ? CW.linkedin : vm.links.website ? CW.site : null;
  return {
    email: address ? { text: address, warn: vm.slots.mailbox.state !== "ok" } : { text: CW.noEmail, warn: true },
    phone: vm.reach.phone ? { text: vm.reach.phone.value, warn: vm.slots.phone.state !== "ok" } : null,
    site
  };
}
export function leadSheetWhyOf(vm) {
  const checks = checksOf(vm);
  if (!checks.length) return null;
  const passed = checks.filter((c) => c.answer === "yes");
  return {
    count: `${passed.length} of ${checks.length}`,
    exceptions: checks.filter((c) => c.answer !== "yes"),
    passed,
    fold: CW.passed(passed.length),
    legend: checks.some((c) => c.how === "read")
  };
}
