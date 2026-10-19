import { renderOwnVersion } from "../templates/message-versions.js";
import { slotHoles, slotValueOf, slotValues, slotsWritten } from "../templates/slot-sets.js";
import { LEAD_ROLE_WORDS, leadAddresseeOf } from "../leads/lead-kind.js";
import { REACH_OUT_SLOT_FALLBACKS, REACH_OUT_SLOT_SET } from "./reach-out-words.js";
export function outreachRefusalOf(f) {
  if (!f.leadStage) return "outreach_not_a_lead";
  if (f.leadStage !== "ready" && f.leadStage !== "nurture") return "outreach_lead_closed";
  if (f.suppressed) return "outreach_suppressed";
  if (f.wroteBack) return "outreach_wrote_back";
  if (f.away) return "outreach_away";
  if (f.stopped) return "outreach_stopped";
  return null;
}
export const OUTREACH_WAIT_REFUSALS = [
  "sending_mailbox_at_cap",
  "sending_mailbox_not_ready",
  "outreach_needs_own_mailbox",
  "paused"
];
export function isWaitRefusal(reason) {
  return OUTREACH_WAIT_REFUSALS.includes(reason ?? "");
}
export const REACH_OUT_MONTH_EMAILS = 2e3;
export const REACH_OUT_DRAFTS_PER_DAY = 30;
export const REACH_OUT_DRAFTS_OPEN_MAX = 2 * REACH_OUT_DRAFTS_PER_DAY;
export function draftRefusalOf(f) {
  if (!f) return "lead_gone";
  const refused = outreachRefusalOf({
    leadStage: f.lead_stage,
    suppressed: f.suppressed,
    wroteBack: f.wrote_back,
    away: f.away,
    stopped: f.stopped
  });
  return refused ?? (f.customer ? "already_yours" : null);
}
export const REACH_OUT_CHECKS_PER_DAY = 400;
export function isReachOutRun(audience) {
  return !!audience && typeof audience === "object" && audience.kind === "reach_out";
}
export function chainOfMoment(chains, id) {
  return chains.find((c) => c.root_id === id || c.steps.some((s) => s.id === id)) ?? null;
}
export function reachOutRootOf(audience) {
  if (!isReachOutRun(audience)) return null;
  const root = audience.root_id;
  return typeof root === "string" && root ? root : null;
}
export const REACH_OUT_LANGUAGE = "en";
function reachOutValues(lead, workspace, opening) {
  const who = leadAddresseeOf(lead);
  return slotValues(REACH_OUT_SLOT_SET, {
    business: lead.business_name,
    company: lead.business_name,
    "first name": who?.first_name || REACH_OUT_SLOT_FALLBACKS["first name"],
    // A person's title or role is said only where their source said it: no guess stands in (a hole holds the email).
    title: who?.title || (who?.role ? LEAD_ROLE_WORDS[who.role] : null),
    role: who?.role ? LEAD_ROLE_WORDS[who.role] : null,
    city: lead.city,
    "your business": workspace.businessName,
    "your name": workspace.yourName,
    "booking link": workspace.bookingLink,
    opening
  });
}
export function reachOutEmailOf(words, lead, workspace, opening = null) {
  const values = reachOutValues(lead, workspace, opening);
  const texts = words.subject === null ? [words.body] : [words.subject, words.body];
  if (texts.some((t) => slotHoles(REACH_OUT_SLOT_SET, t, values))) return { ok: false, reason: "missing_value" };
  const email = renderOwnVersion("email", words, values, REACH_OUT_LANGUAGE, REACH_OUT_SLOT_SET);
  return { ok: true, subject: words.subject === null ? null : email.subject, body: email.body };
}
export const REACH_OUT_OPENING_MARK = "\uE000";
export const REACH_OUT_VALUE_MARKS = ["\uE001", "\uE002"];
export function reachOutCardEmailOf(words, lead, workspace) {
  const values = reachOutValues(lead, workspace, REACH_OUT_OPENING_MARK);
  const texts = words.subject === null ? [words.body] : [words.subject, words.body];
  const written = [...new Set(texts.flatMap((t) => slotsWritten(REACH_OUT_SLOT_SET, t).keys))];
  const holes = written.filter((k) => (slotValueOf(REACH_OUT_SLOT_SET, k, values) ?? null) === null);
  const named = leadAddresseeOf(lead)?.first_name;
  const fellBack = !named && written.includes("first name") ? ["first name"] : [];
  const marked = values.map(
    (v, i) => v && REACH_OUT_SLOT_SET.keys[i] !== "opening" ? `${REACH_OUT_VALUE_MARKS[0]}${v}${REACH_OUT_VALUE_MARKS[1]}` : v
  );
  const email = renderOwnVersion("email", words, marked, REACH_OUT_LANGUAGE, REACH_OUT_SLOT_SET);
  return { subject: words.subject === null ? null : email.subject, body: email.body, holes, fellBack };
}
export function reachOutCardSlotsOf(texts, lead, workspace) {
  const values = reachOutValues(lead, workspace, null);
  const named = !!leadAddresseeOf(lead)?.first_name;
  const written = [...new Set(texts.flatMap((t) => slotsWritten(REACH_OUT_SLOT_SET, t).keys))];
  return written.map((key) => ({
    key,
    value: slotValueOf(REACH_OUT_SLOT_SET, key, values) ?? null,
    fellBack: key === "first name" && !named
  }));
}
const EXAMPLE_LEAD = {
  business_name: "Lakeside Bakery",
  city: "Springfield",
  opening: "Your 4.8 stars from 212 reviews caught my eye.",
  // A person at it, so the person slots show a name, not their fallback.
  person: { name: "Dana Reyes", first_name: "Dana", title: "Owner", role: "owner", email: null, profile_url: null }
};
export const reachOutExampleLead = () => ({
  business_name: EXAMPLE_LEAD.business_name,
  city: EXAMPLE_LEAD.city,
  kind: "company",
  facts: { people: [EXAMPLE_LEAD.person], addressee: 0 },
  source: "local_businesses"
});
export function reachOutExampleValues(workspace) {
  return reachOutValues(
    {
      business_name: EXAMPLE_LEAD.business_name,
      city: EXAMPLE_LEAD.city,
      kind: "company",
      facts: { people: [EXAMPLE_LEAD.person], addressee: 0 }
    },
    workspace,
    EXAMPLE_LEAD.opening
  );
}
