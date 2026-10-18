import { audienceTrigger } from "../broadcasts/broadcast-audience.js";
import { BREATH_WHY } from "../broadcasts/run-words.js";
import { purposeOfPlaybook } from "../consent/consent.js";
import { consentRuleWords } from "../consent/consent-asks.js";
import { appointmentWords } from "../journey/appointment-word.js";
import { GET_YES_ROUTE } from "../people/people-lists.js";
import { CAMPAIGNS_PAUSED_WORDS } from "../workspace/billing.js";
import { runApproveWords } from "../shell/campaign-rooms.js";
import { isReachOutRun } from "../reach-out/reach-out-rules.js";
import { messageAboutOfTrigger } from "./playbook-purpose.js";
import { triggerOf } from "./playbook-triggers.js";
import { localDate, nextOpenMoment } from "./playbook-schedule.js";
import { PARAM_SOURCE_LABELS } from "../templates/templates.js";
export function poolWords(trigger, word) {
  const t = triggerOf(trigger);
  if (!t) return "";
  if (t.kind === "visit") {
    const W = appointmentWords(word);
    return trigger === "visit_tomorrow" ? W.withTomorrow : W.whoYesterday;
  }
  if (t.kind === "deal") return "with a proposal waiting";
  return t.list || t.kind === "saved" ? "on the list" : "in People";
}
export function reachLines(reach, p, allowanceHeld = 0) {
  if (!reach || !Number.isFinite(reach.pool)) return null;
  const t = p ? triggerOf(p.trigger) : null;
  const offers = t ? purposeOfPlaybook(t.cls) === "marketing" : true;
  const gap = p ? p.trigger === "everyone_monthly" ? p.cadence_days : p.gap_days : null;
  const once = t?.kind === "deal";
  const one = (n, singular, plural) => n === 1 ? singular : plural;
  const noAddress = reach.no_address ?? 0;
  const addressStopped = reach.address_stopped ?? 0;
  const noChannel = reach.no_channel ?? 0;
  const reasons = [
    {
      n: reach.noYes,
      words: `never said yes to ${offers ? "offers" : "hearing from you"}`,
      tone: "plain",
      door: { words: "Get their yes", to: GET_YES_ROUTE }
    },
    // The week's breath, both sides of the run: a message from a campaign or a broadcast sent or due within a week of it.
    { n: reach.heardAny, words: `${one(reach.heardAny, "hears", "hear")} ${BREATH_WHY}`, tone: "warn", door: null },
    { n: allowanceHeld, words: ALLOWANCE_HELD_WORDS, tone: "warn", door: null },
    {
      n: reach.heardThis,
      words: once ? "had this proposal's follow-up already" : gap ? `heard from this campaign in the last ${gap} days` : "heard from this campaign lately",
      tone: once ? "plain" : "warn",
      door: null
    },
    { n: reach.stopped, words: "asked you to stop", tone: "plain", door: null },
    {
      n: reach.noNumber,
      words: one(reach.noNumber, "has no number on file", "have no number on file"),
      tone: "plain",
      door: null
    },
    // Where email was the only channel left, or no channel could carry the message: each is a person the run counted and
    // leaves out, so each has its line (a run counted before runs kept them has none).
    {
      n: noAddress,
      words: one(noAddress, "has no email address on file", "have no email address on file"),
      tone: "plain",
      door: null
    },
    {
      n: addressStopped,
      words: one(
        addressStopped,
        "has an email address mail no longer goes to",
        "have an email address mail no longer goes to"
      ),
      tone: "plain",
      door: null
    },
    {
      n: noChannel,
      words: one(
        noChannel,
        "has no channel this message can go by here",
        "have no channel this message can go by here"
      ),
      tone: "plain",
      door: null
    },
    {
      n: reach.overCap,
      words: `${one(reach.overCap, "waits", "wait")} for the next run${p ? ` \u2014 ${p.cap_per_run} a run, the longest unheard first` : ""}`,
      tone: "plain",
      door: null
    },
    {
      n: reach.overLimit,
      words: one(
        reach.overLimit,
        "is past what the number may start today",
        "are past what the number may start today"
      ),
      tone: "warn",
      door: null
    }
  ];
  const lines = reasons.map((r, rank) => ({ ...r, rank })).filter((r) => r.n > 0).sort((a, b) => b.n - a.n || a.rank - b.rank).map(({ n, words, tone, door }) => ({ n, words: `${n} ${words}`, tone, door }));
  return {
    pool: reach.pool,
    held: reach.heardAny + (once ? 0 : reach.heardThis) + reach.overLimit + allowanceHeld,
    lines
  };
}
const ALLOWANCE_HELD_WORDS = "held for this month's allowance";
const NONE_HEARS_WORDS = `none hears ${BREATH_WHY}`;
const ALLOWANCE_REASON = "month_allowance";
function allowanceHeldOn(recipients) {
  const held = { whatsapp: 0, sms: 0, email: 0 };
  for (const r of recipients) {
    if (r.state !== "skipped" || r.reason !== ALLOWANCE_REASON) continue;
    held[channelOfRecipient(r)] += 1;
  }
  return held;
}
function channelOfRecipient(r) {
  return r?.channel === "sms" || r?.channel === "email" ? r.channel : "whatsapp";
}
export function runDayPassed(run, today) {
  const day = dayHasPassed(run, today);
  return day ? dayGoneWords(day) : null;
}
function dayHasPassed(run, today) {
  return run.playbook_id && run.run_for && run.run_for !== today ? run.run_for : null;
}
function dayGoneWords(runFor, say = (ymd) => ymd) {
  return `This run was made for ${say(runFor)} and that day has passed: its people and its words were that day's. Skip it; the next run reads the calendar again.`;
}
export function runDaysAt(tz, now) {
  return { today: localDate(tz, now), sendsOn: localDate(tz, nextOpenMoment(tz, now).at) };
}
function visitRunTooLate(run, days) {
  const moment = triggerOf(audienceTrigger(run.audience) ?? "");
  return moment?.kind === "visit" && !!run.run_for && days.sendsOn > run.run_for;
}
export function runApprovalRefusal(run, days) {
  if (isReachOutRun(run.audience)) return null;
  const day = dayHasPassed(run, days.today) ?? (run.playbook_id && run.run_for && visitRunTooLate(run, days) ? run.run_for : null);
  return day ? dayGoneWords(day, days.say) : null;
}
export function waitingRunOffer(run, days, at) {
  if (isReachOutRun(run.audience) || !at.known) return { kind: "open" };
  const late = runApprovalRefusal(run, days);
  if (late) return { kind: "skip", why: late };
  return at.paused ? { kind: "skip", why: CAMPAIGNS_PAUSED_WORDS } : { kind: "approve" };
}
export function toApprovalVM(d, opts) {
  const b = d.broadcast;
  const heldOn = allowanceHeldOn(d.recipients);
  const allowanceHeld = heldOn.whatsapp + heldOn.sms + heldOn.email;
  const will = Math.max(0, b.recipient_count - allowanceHeld);
  const by = b.audience?.reach?.by_channel;
  const t = opts.playbook ? triggerOf(opts.playbook.trigger) : null;
  const rules = [];
  if (t && opts.playbook) {
    rules.push(...consentRuleWords(by, purposeOfPlaybook(t.cls), messageAboutOfTrigger(opts.playbook.trigger)));
    if (t.kind === "visit") {
      const W = appointmentWords(opts.playbook.word);
      rules.push(opts.playbook.trigger === "visit_tomorrow" ? W.eachTomorrow : W.eachYesterday);
    } else if (t.kind === "deal") {
      rules.push(
        "each has a proposal waiting with nothing back, and its link",
        "none followed up on that proposal before",
        NONE_HEARS_WORDS
      );
      if (will >= opts.playbook.cap_per_run)
        rules.push(`capped at ${opts.playbook.cap_per_run} a run, the longest unheard first`);
    } else {
      const gap = opts.playbook.trigger === "everyone_monthly" ? opts.playbook.cadence_days : opts.playbook.gap_days;
      rules.push(`none heard from this campaign in ${gap} days`, NONE_HEARS_WORDS);
      if (will >= opts.playbook.cap_per_run)
        rules.push(`capped at ${opts.playbook.cap_per_run} a run, the longest unheard first`);
    }
  }
  const named = d.recipients.find((r) => r.first_name);
  const reader = named ?? d.recipients[0] ?? null;
  const params = Array.isArray(b.params) ? b.params : [];
  const values = params.map((p) => {
    switch (p.kind) {
      case "text":
        return p.value;
      case "first_name":
        return reader?.first_name || "there";
      case "business_name":
        return opts.businessName;
      case "booking_link":
        return "your booking link";
      default:
        return `[${PARAM_SOURCE_LABELS[p.kind].toLowerCase()}]`;
    }
  });
  const greets = params.some((p) => p.kind === "first_name");
  const late = runApprovalRefusal(b, { today: opts.today, sendsOn: opts.open.on, say: opts.day });
  const refusal = opts.paused ? CAMPAIGNS_PAUSED_WORDS : late;
  const runFor = b.run_for ?? "";
  return {
    will,
    byChannel: by ? {
      whatsapp: Math.max(0, by.whatsapp - heldOn.whatsapp),
      sms: Math.max(0, by.sms - heldOn.sms),
      email: Math.max(0, by.email - heldOn.email)
    } : null,
    rules,
    of: reachLines(b.audience?.reach ?? null, opts.playbook, allowanceHeld),
    values,
    reader: reader ? reader.name : null,
    readerChannel: channelOfRecipient(reader),
    hiThere: greets ? d.recipients.filter((r) => !r.first_name).length : 0,
    // One word per act (decision 19 of the spec of 9 Oct 2026), as Today's row and the ledger say it; when it goes is said
    // once, beside it (`goes`): the button said it again ("Approve — 3 now").
    approve: refusal ? null : runApproveWords(will),
    expired: refusal,
    goes: late ? `made for ${opts.day(runFor)}` : opts.paused ? "waits until billing resumes" : opts.open.moved ? `goes at ${opts.open.time} once you approve it` : "goes the moment you approve it",
    skip: "Skipping loses this run only \u2014 the campaign keeps running."
  };
}
