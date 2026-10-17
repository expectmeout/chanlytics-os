import { agoWords, DAY_MS } from "../shared/time.js";
import { textingWords, lineStuckProvisioning } from "../setup/setup.js";
import { PAUSED_CALL } from "../lines/caller-gets.js";
import { receptionistOn, maySpend, whyCannotSpend } from "./billing.js";
import { formatPhoneDisplay } from "../shared/phone.js";
export const PLATFORM_VERDICTS = {
  broken: { label: "Broken", tone: "danger", rank: 100 },
  billing: { label: "Billing", tone: "danger", rank: 90 },
  rehearsal: { label: "Rehearsal", tone: "warn", rank: 80 },
  stalled: { label: "Stalled", tone: "warn", rank: 70 },
  waiting_owner: { label: "Waiting on them", tone: "info", rank: 60 },
  quiet: { label: "Quiet", tone: "warn", rank: 40 },
  new: { label: "New", tone: "info", rank: 20 },
  live: { label: "Live", tone: "ok", rank: 10 },
  paused: { label: "Paused", tone: "plain", rank: 5 },
  test: { label: "Test", tone: "plain", rank: 0 }
};
export const PLATFORM_NEW_DAYS = 1;
export const PLATFORM_QUIET_DAYS = 14;
const at = (iso) => {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
};
const OURS_TO_FIX = ["failed"];
const THEIRS_TO_FIX = ["needs_record", "otp_waiting", "rejected"];
function billingBites(mode, status) {
  if (mode !== "stripe") return false;
  return !receptionistOn(status) || status === "past_due";
}
function verdictFor(r, nowMs) {
  if (r.status === "test") return "test";
  const mode = r.billing_mode ?? "direct";
  const status = r.billing_status ?? "none";
  const answering = r.voice_active === true || r.whatsapp_active === true;
  const age = nowMs - (at(r.created_at) ?? nowMs);
  if (r.voice_state === "failed" || OURS_TO_FIX.includes(r.sms_state ?? "")) return "broken";
  if (billingBites(mode, status)) return "billing";
  if (r.status === "paused") return "paused";
  if (r.reg_mock === true) return "rehearsal";
  if (!answering && age <= PLATFORM_NEW_DAYS * DAY_MS) return "new";
  if (THEIRS_TO_FIX.includes(r.sms_state ?? "")) return "waiting_owner";
  if (mode === "stripe" && !maySpend(mode, status) && status !== "trialing") return "waiting_owner";
  if (!answering) return "stalled";
  const heard = at(r.last_inbound_at);
  if (heard === null) return age > PLATFORM_QUIET_DAYS * DAY_MS ? "quiet" : "new";
  if (nowMs - heard > PLATFORM_QUIET_DAYS * DAY_MS) return "quiet";
  return "live";
}
function sentenceFor(r, verdict, nowMs) {
  const heard = at(r.last_inbound_at);
  const quietFor = heard === null ? null : Math.floor((nowMs - heard) / DAY_MS);
  switch (verdict) {
    case "broken":
      return r.line_error ? `${r.line_error}${r.reg_step ? ` (stopped at ${r.reg_step})` : ""}` : "Their line stopped and said nothing. A person at Chanlytics has to look.";
    case "billing":
      return r.billing_status === "past_due" ? "A payment failed. The receptionist still answers; once Stripe gives up, the workspace is paused." : `Not subscribed (${r.billing_status ?? "no status"}) \u2014 the receptionist is paused for them.`;
    case "rehearsal":
      return "Texting is filed against the test registry: it reports itself approved, delivers nothing, and expires thirty days after filing.";
    case "stalled":
      return `Set up ${agoWords(at(r.created_at) ?? nowMs, nowMs)} and nothing answers yet${r.members <= 1 ? ", with one person in the workspace" : ""}.`;
    case "waiting_owner": {
      const mode = r.billing_mode ?? "direct";
      const status = r.billing_status ?? "none";
      if (!THEIRS_TO_FIX.includes(r.sms_state ?? "") && mode === "stripe") {
        return whyCannotSpend(mode, status) ?? "Something about their billing needs them.";
      }
      const words = textingWords({
        sms_state: r.sms_state ?? "none",
        reg_mock: r.reg_mock ?? false,
        reg_sole_prop: r.reg_sole_prop ?? false
      }).sentence;
      return r.line_error ? `${words} \u2014 ${r.line_error}` : words;
    }
    case "quiet":
      return quietFor === null ? "Answering, and no customer has ever reached them." : `Answering, and no customer has reached them in ${quietFor} days.`;
    case "new":
      return r.voice_active === true || r.whatsapp_active === true ? `Answering since ${agoWords(at(r.created_at) ?? nowMs, nowMs)}; no customer has reached them yet.` : `Signed up ${agoWords(at(r.created_at) ?? nowMs, nowMs)}, still setting up.`;
    case "live":
      return `Answering; last heard from ${heard === null ? "never" : agoWords(heard, nowMs)}.`;
    case "paused":
      return `The workspace is paused, by design: ${PAUSED_CALL}.`;
    case "test":
      return "Not a customer \u2014 a test workspace.";
  }
}
function factsFor(r, nowMs) {
  const mode = r.billing_mode ?? null;
  const status = r.billing_status ?? null;
  const paying = mode === null ? "No arrangement" : mode === "direct" ? "Invoiced" : status === "trialing" && r.trial_end ? `Trial to ${r.trial_end.slice(0, 10)}` : status ?? "unknown";
  const on = [r.voice_active ? "phone" : null, r.whatsapp_active ? "WhatsApp" : null].filter(Boolean);
  const answering = on.length ? on.join(" + ") : r.voice_state === "provisioning" ? "Getting a number" : r.voice_state === "failed" ? "Line failed" : "Nothing yet";
  const texting = !r.line_e164 ? "No line" : r.sms_state === "active" ? r.reg_sole_prop ? "On (sole proprietor)" : "On" : r.reg_mock ? "Rehearsal" : (r.sms_state ?? "none").replace(/_/g, " ");
  const at_ = at(r.last_inbound_at);
  return { paying, answering, texting, heard: at_ === null ? "Never" : agoWords(at_, nowMs) };
}
export function platformRows(rows, nowMs = Date.now()) {
  return rows.map((r) => {
    const verdict = verdictFor(r, nowMs);
    return {
      tenantId: r.tenant_id,
      slug: r.slug,
      name: r.name,
      verdict,
      sentence: sentenceFor(r, verdict, nowMs),
      facts: factsFor(r, nowMs),
      age: agoWords(at(r.created_at) ?? nowMs, nowMs),
      members: r.members
    };
  }).sort((a, b) => {
    const byRank = PLATFORM_VERDICTS[b.verdict].rank - PLATFORM_VERDICTS[a.verdict].rank;
    if (byRank !== 0) return byRank;
    return a.name.localeCompare(b.name);
  });
}
export function platformSummary(rows) {
  const customers = rows.filter((r) => r.verdict !== "test");
  const needsUs = customers.filter((r) => r.verdict === "broken" || r.verdict === "rehearsal").length;
  const needsThem = customers.filter(
    (r) => r.verdict === "billing" || r.verdict === "waiting_owner" || r.verdict === "stalled"
  ).length;
  const live = customers.filter((r) => r.verdict === "live").length;
  const parts = [`${customers.length} workspace${customers.length === 1 ? "" : "s"}`, `${live} live`];
  if (needsUs) parts.push(`${needsUs} on us`);
  if (needsThem) parts.push(`${needsThem} on them`);
  return { total: customers.length, needsUs, needsThem, live, sentence: parts.join(" \xB7 ") };
}
export function platformNumber(e164) {
  return formatPhoneDisplay(e164) ?? "\u2014";
}
const NUMBER_MONTHLY = "$1.15 a month";
const REAL_FILING = "about $19.50 once";
const CAMPAIGN_VETTING = "about $15 once";
export function platformLineActions(l, nowMs = Date.now()) {
  const out = [];
  if (l.voice_state === "failed" || lineStuckProvisioning(l, nowMs)) {
    out.push({
      action: "retry",
      label: "Retry setting up",
      sentence: "Resumes the line where it stopped, without repeating the steps that succeeded. The saga reads its own receipts, so nothing is bought twice.",
      // A saga that failed BEFORE the number was bought buys one when it
      // resumes, so this can spend even though it usually does not.
      cost: `If it stopped before the number was bought, this buys one \u2014 ${NUMBER_MONTHLY}.`,
      permanent: false
    });
  }
  if (l.sms_state === "rejected") {
    out.push({
      action: "refile",
      label: "Send the campaign back",
      // It used to say "Correct the business on record first — this sends what is
      // there now", which was true and was the whole problem: nothing verified
      // that anyone had, so a rejection could be answered with the fault that
      // caused it. Both senders now run the same pre-flight, so the honest
      // sentence is that this REFUSES rather than repeats.
      sentence: "Resubmits the campaign to the carriers, free \u2014 the vetting fee is charged once per campaign. It refuses, with the reason, if the record or the workspace's name still would not pass review.",
      cost: null,
      permanent: false
    });
    out.push({
      action: "replace",
      label: "File a new campaign",
      sentence: "Deletes the refused campaign and files a new one from today's facts, under the same approved brand: the remedy when what the carriers named cannot be edited (the opt-in confirmation and its keywords never can be). It refuses, with the reason, if the record or the workspace's name still would not pass review.",
      cost: `${CAMPAIGN_VETTING}, charged to Chanlytics.`,
      permanent: true
    });
  } else if (l.reg_mock === true) {
    out.push({
      action: "refile",
      label: "File it for real",
      sentence: "Takes the rehearsal off and files a real registration with the carriers. The rehearsal delivers nothing and expires thirty days after it was filed.",
      cost: `${REAL_FILING}, charged to Chanlytics.`,
      permanent: true
    });
  }
  if (l.e164) {
    out.push({
      action: "release",
      label: "Give the number back",
      sentence: "Releases the number, drops the trunk and forgets the line. Calls keep their history; the routing row is switched off, never deleted.",
      cost: `Stops the ${NUMBER_MONTHLY} this number costs.`,
      permanent: true
    });
  }
  return out;
}
export function platformHealthOf(rows, backlog, now = /* @__PURE__ */ new Date()) {
  const unhealthy = (rows ?? []).filter((r) => !r.healthy).map((r) => ({ sweep: r.sweep, detail: r.detail }));
  return { ok: unhealthy.length === 0 && backlog === 0, unhealthy, backlog, checkedAt: now.toISOString() };
}
export function platformHealthWords(h) {
  if (h.backlog === null) return "The platform's health could not be read just now.";
  const late = h.backlog > 0 ? `${h.backlog} job${h.backlog === 1 ? "" : "s"} late` : null;
  const clocks = h.unhealthy.length ? `${h.unhealthy.length} clock${h.unhealthy.length === 1 ? "" : "s"} not running` : null;
  if (!late && !clocks) return "Every clock is running and nothing is waiting.";
  return [clocks, late].filter(Boolean).join(" \xB7 ");
}
export function platformActionWarning(a) {
  const parts = [a.cost, a.permanent ? "This cannot be undone." : null].filter(Boolean);
  return parts.length ? parts.join(" ") : "Nothing is spent, and it can be done again.";
}
export const QUEUE_SHOWN = 100;
export const QUEUE_SENDS_NOTHING = "Chanlytics sends no invitations. Write to them yourself, then mark it here so the queue moves.";
function waitingDetail(r) {
  const from = r.source ? sourceWords(r.source) : null;
  return [r.business?.trim() || null, from].filter(Boolean).join(" \xB7 ") || null;
}
function sourceWords(source) {
  const s = source.trim();
  if (!s) return null;
  try {
    const u = new URL(s);
    const path = u.pathname.replace(/\/+$/, "");
    return `from ${u.host}${path && path !== "/" ? path : ""}`;
  } catch {
    return `from ${s.slice(0, 60)}`;
  }
}
export function platformQueue(q, nowMs = Date.now()) {
  const note = QUEUE_SENDS_NOTHING;
  if (!q.waiting) return { rows: [], sentence: "The waiting list could not be read just now.", unreadable: true, note };
  const rows = q.waiting.map((r) => ({
    id: r.id,
    email: r.email,
    detail: waitingDetail(r),
    waited: `asked ${agoWords(Date.parse(r.created_at), nowMs)}`
  }));
  const total = q.total ?? rows.length;
  const oldest = q.waiting[0];
  const sentence = total === 0 ? "Nobody is waiting." : `${total} waiting${oldest ? `, the first since ${agoWords(Date.parse(oldest.created_at), nowMs)}` : ""}${total > rows.length ? ` \xB7 showing the first ${rows.length}` : ""}.`;
  return { rows, sentence, unreadable: false, note };
}
