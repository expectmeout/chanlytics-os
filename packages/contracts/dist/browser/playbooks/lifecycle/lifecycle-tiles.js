import { breathWaitWords } from "../../broadcasts/run-words.js";
import { zoneMidnight, shiftKey } from "../../calendar/day-keys.js";
import { purposeOfPlaybook } from "../../consent/consent.js";
import { CONSENT_CHANNELS, countsByChannelWords } from "../../consent/consent-channels.js";
import { GET_YES_ROUTE } from "../../people/people-lists.js";
import { CAMPAIGNS_RESULTS_PERIOD, fixedDaysOf } from "../../reports/report-periods.js";
import { fmtDay } from "../../reports/reports.js";
import { clockHour, clockNear, clockTime, zoneDayKey } from "../../shared/clock.js";
import { HOUR_MS } from "../../shared/time.js";
import { plural } from "../../shared/words.js";
import { LIFECYCLE_WORDS } from "./lifecycle-words.js";
import { todayRunWords } from "../../today/today-runs.js";
import { waitingRunOffer } from "../playbook-approval.js";
import { DAY_MS } from "../playbook-time.js";
import { playbookReach } from "../playbook-reach.js";
import { runCapOf } from "../playbook-run-split.js";
import { nextOpenMoment, nextRunLabel, nextRunOf } from "../playbook-schedule.js";
import { triggerOf } from "../playbook-triggers.js";
import { batchModeOf } from "../../sequences/sequence.js";
import { runRoute } from "../../sequences/sequence-address.js";
const COMING_DAYS = 7;
const RESULTS_DAYS = fixedDaysOf(CAMPAIGNS_RESULTS_PERIOD);
const RUNS_SHOWN = 3;
const outOf = (b) => b === void 0 ? "reading" : "failed";
export function reachCountsOf(rows) {
  const byChannel = Object.fromEntries(
    CONSENT_CHANNELS.map((c) => [c, rows.filter((r) => r.reachedOn === c).length])
  );
  return {
    people: rows.length,
    canHear: rows.filter((r) => r.canReceive.messages).length,
    saidMessages: rows.filter((r) => r.saidYes.messages).length,
    saidOffers: rows.filter((r) => r.saidYes.offers).length,
    ...rows.some((r) => r.reachedOn !== void 0) ? { byChannel } : {}
  };
}
function opensOf(stages, needs, more) {
  const names = stages.filter((s) => s.needs === needs && s.state !== "not_here").map((s) => s.name.toLowerCase());
  return `${LIFECYCLE_WORDS.reach.opensMessages} ${[...names, ...more].join(", ")}`;
}
function rung(id, label, n, people, opens, by = void 0) {
  const byWords = countsByChannelWords(by);
  const parts = byWords && by && people > 0 ? CONSENT_CHANNELS.filter((c) => by[c] > 0).map((c) => ({ channel: c, share: by[c] / people })) : null;
  return {
    id,
    label,
    n,
    share: people > 0 ? n / people : 0,
    opens,
    tone: id === "offers" && n === 0 ? "warn" : "plain",
    meter: id === "people" ? `${n} in People` : `${label}: ${n} of ${people}${byWords ? ` \xB7 ${byWords}` : ""}`,
    parts,
    byWords
  };
}
export function lifecycleReach(input, stages) {
  const b = input.broadcasts;
  const reach = b?.reach ?? null;
  if (!b || !reach) return { read: outOf(b), rungs: null, yes: null, phone: null };
  const W = LIFECYCLE_WORDS.reach;
  const rungs = [
    rung("people", W.people, reach.people, reach.people, null),
    rung("messages", W.messages, reach.canHear, reach.people, opensOf(stages, "messages", []), reach.byChannel),
    rung("offers", W.offers, reach.saidOffers, reach.people, opensOf(stages, "offers", W.ownOffers))
  ];
  const door = { kind: "route", label: W.code, route: GET_YES_ROUTE };
  const asks = b.number.present && b.optIn.link !== null;
  const [, , offers] = rungs;
  return {
    read: "read",
    rungs,
    yes: asks ? { note: W.asks, code: door, phrase: b.optIn.phrase, copy: W.copy } : null,
    // Nobody in People yet: no line of noughts ("0 of 0 can hear you", an amber "0 to offers" about nobody).
    phone: reach.people === 0 ? { words: null, offers: null, yes: null } : {
      words: W.phoneHear(reach.canHear, reach.people),
      offers: { words: `${reach.saidOffers} to offers`, tone: offers ? offers.tone : "plain" },
      yes: asks ? { label: W.phoneYes, route: GET_YES_ROUTE } : null
    }
  };
}
export function nextRunLine(p, nowMs, tz) {
  const next = nextRunOf(p, tz, new Date(nowMs));
  const word = next.day === "tomorrow" ? "Tomorrow" : "Today";
  if (next.soon) return { day: word, at: "Within the hour", atMs: nowMs };
  const today = zoneDayKey(nowMs, tz);
  const atMs = zoneMidnight(tz, next.day === "tomorrow" ? shiftKey(today, 1) : today) + next.hour * HOUR_MS;
  return { day: word, at: clockHour(next.hour), atMs };
}
function nextShare(p) {
  const all = p.candidates ?? 0;
  const cap = runCapOf(p);
  return cap > 0 ? Math.min(all, cap) : all;
}
export function resumeDetailOf(p, at) {
  const W = LIFECYCLE_WORDS.ledger.resume;
  const when = nextRunLabel({ ...p, state: "running" }, at.tz, new Date(at.nowMs), at.paused);
  const detail = W.detail(when, p.candidates === null ? null : nextShare(p));
  if (p.mode === void 0) return detail;
  if (!p.words_ok_at) return `${detail}. ${W.asksFirst}`;
  return batchModeOf({ mode: p.mode, words_ok_at: p.words_ok_at }) === "auto" ? `${detail}. ${W.auto}` : detail;
}
export function workspacePausedOf(input) {
  return input.playbooks?.ready?.paused === true || input.broadcasts?.ready?.paused === true;
}
function whoWill(p) {
  const reach = playbookReach({ state: p.state, candidates: p.candidates, held: p.held, waiting: p.totals.waiting });
  const of = p.named ? ` of ${p.named.pool}` : "";
  const offers = purposeOfPlaybook(triggerOf(p.trigger)?.cls ?? null) === "marketing";
  const waits = p.held ?? 0;
  const waitWords = breathWaitWords(waits, String(waits));
  switch (reach) {
    case "sends": {
      const all = p.candidates ?? 0;
      const cap = runCapOf(p);
      const next = nextShare(p);
      const later = all - next;
      return {
        why: `${next}${of} will get it` + (later > 0 ? ` \xB7 up to ${later} more on later runs, ${cap} a run` : "") + (waits > 0 ? ` \xB7 ${waitWords}` : ""),
        pill: { tone: "ok", label: plural(next, "person", "people") }
      };
    }
    case "nobody":
      return {
        why: p.named && p.named.pool > 0 && p.named.saidYes === 0 ? `0${of} will get it \xB7 none said yes to ${offers ? "offers" : "messages"}` : p.named && p.named.pool === 0 ? "Nobody is on it yet" : `0${of} will get it`,
        pill: { tone: "warn", label: LIFECYCLE_WORDS.coming.nobody }
      };
    case "all-heard":
      return {
        why: waitWords,
        pill: { tone: "warn", label: "All waiting" }
      };
    case "uncounted":
      return { why: "Who it reaches could not be counted", pill: null };
    default:
      return null;
  }
}
function momentRow(p, nowMs, tz, workspacePaused) {
  if (p.state !== "running" || p.off || p.listArchived) return null;
  const who = whoWill(p);
  if (!who) return null;
  if (workspacePaused) {
    const words = LIFECYCLE_WORDS.coming.paused;
    return {
      id: `moment:${p.id}`,
      kind: "moment",
      when: words.when,
      what: p.name,
      why: words.why,
      pill: { tone: "warn", label: words.pill },
      act: { kind: "open", label: "Open", playbookId: p.id },
      waiting: null,
      atMs: nowMs
    };
  }
  const next = nextRunLine(p, nowMs, tz);
  return {
    id: `moment:${p.id}`,
    kind: "moment",
    when: { day: next.day, at: next.at },
    what: p.name,
    why: who.why,
    pill: who.pill,
    act: { kind: "open", label: "Open", playbookId: p.id },
    waiting: null,
    atMs: next.atMs
  };
}
function offerOf(r, nowMs, tz, at) {
  return waitingRunOffer(
    { playbook_id: r.playbook_id, run_for: r.run_for ?? null, audience: r.audience },
    {
      today: zoneDayKey(nowMs, tz),
      sendsOn: zoneDayKey(nextOpenMoment(tz, new Date(nowMs)).at.getTime(), tz),
      say: fmtDay
    },
    at
  );
}
export function waitingOffer(r, input, at) {
  return offerOf(r, input.nowMs, input.tz, at);
}
function runRow(r, name, nowMs, tz, at) {
  const atMs = Date.parse(r.scheduled_for);
  const waits = r.state === "pending_approval";
  const offer = waits ? offerOf(r, nowMs, tz, at) : null;
  const refusal = offer?.kind === "skip" ? offer.why : null;
  return {
    id: `run:${r.id}`,
    kind: "run",
    when: { day: clockNear(atMs, tz, nowMs), at: clockTime(atMs, tz) },
    what: name,
    why: waits ? refusal ?? todayRunWords(r).waiting.sentence : "Scheduled",
    pill: waits ? { tone: "warn", label: LIFECYCLE_WORDS.coming.waiting } : { tone: "ok", label: plural(r.recipient_count, "person", "people") },
    act: { kind: "route", label: "Open", route: runRoute(r.id) },
    waiting: offer && offer.kind !== "open" ? { runId: r.id, people: r.recipient_count, refusal } : null,
    atMs
  };
}
function offRows(stages, defs, nowMs) {
  return stages.flatMap((s, i) => {
    const off = defs.find((d) => d.id === s.id)?.off;
    if (!off || s.state !== "off" || s.act?.kind !== "turn_on" || (s.people ?? 0) <= 0) return [];
    return [
      {
        id: `off:${s.id}`,
        kind: "off",
        when: off.when,
        what: s.name,
        why: off.why(s.people ?? 0),
        pill: null,
        act: { kind: "turn_on", label: "Turn on", moment: s.act.moment },
        waiting: null,
        atMs: nowMs + COMING_DAYS * DAY_MS + i
      }
    ];
  });
}
export function lifecycleComing(input, stages, defs) {
  const playbooks = input.playbooks;
  if (!playbooks) return null;
  const { nowMs, tz, broadcasts } = input;
  const rules = LIFECYCLE_WORDS.coming.rules;
  if (!broadcasts) return { read: outOf(broadcasts), rows: [], empty: null, rules };
  const playbookOf = (id) => playbooks.rows.find((p) => p.id === id);
  const paused = workspacePausedOf(input);
  const end = nowMs + COMING_DAYS * DAY_MS;
  const runs = broadcasts.rows.filter((r) => (r.state === "scheduled" || r.state === "pending_approval") && Date.parse(r.scheduled_for) <= end).map((r) => {
    const p = playbookOf(r.playbook_id);
    return runRow(r, p?.name ?? r.name, nowMs, tz, { paused, known: p !== void 0 });
  });
  const covered = new Set(
    broadcasts.rows.filter((r) => runs.some((x) => x.id === `run:${r.id}`) && r.playbook_id).map((r) => r.playbook_id)
  );
  const moments = playbooks.rows.filter((p) => !covered.has(p.id)).flatMap((p) => momentRow(p, nowMs, tz, paused) ?? []);
  const timed = [...moments, ...runs].sort((a, b) => a.atMs - b.atMs);
  const rows = [...timed, ...offRows(stages, defs, nowMs)];
  return { read: "read", rows, empty: LIFECYCLE_WORDS.coming.empty, rules };
}
function wentAt(r) {
  return Date.parse(r.finished_at ?? r.started_at ?? r.scheduled_for);
}
function cameBack(input, days) {
  const b = input.broadcasts;
  if (!b) return [];
  const since = input.nowMs - days * DAY_MS;
  const names = new Map((input.playbooks?.rows ?? []).map((p) => [p.id, p.name]));
  return b.rows.filter((r) => r.state === "sent" && wentAt(r) >= since).sort((a, c) => wentAt(c) - wentAt(a)).slice(0, RUNS_SHOWN).map((r) => ({
    id: r.id,
    name: (r.playbook_id ? names.get(r.playbook_id) : null) ?? r.name,
    words: `${r.when} \xB7 ${r.counts.sent} sent`,
    result: plural(r.counts.replied, "reply", "replies"),
    route: runRoute(r.id)
  }));
}
export function lifecycleResults(input) {
  const b = input.broadcasts;
  if (!b) {
    const days2 = RESULTS_DAYS;
    return {
      read: outOf(b),
      days: days2,
      note: plural(days2, "day"),
      headline: null,
      funnel: null,
      funnelLabel: null,
      yes: null,
      readNote: null,
      byChannel: null,
      runs: [],
      quiet: false
    };
  }
  const report = input.report;
  const days = report?.days ?? RESULTS_DAYS;
  const note = plural(days, "day");
  const runs = cameBack(input, days);
  if (!report)
    return {
      read: "read",
      days,
      note,
      headline: null,
      funnel: null,
      funnelLabel: null,
      yes: null,
      readNote: null,
      byChannel: null,
      runs,
      quiet: false
    };
  const t = report.totals;
  const W = LIFECYCLE_WORDS.results.funnel;
  const readOf = t.readOf ?? t.sent;
  const step = (id, n, of = t.sent) => ({
    id,
    label: W[id],
    meter: id === "read" && of !== t.sent ? `${W[id]}: ${n} of WhatsApp's ${of}` : `${W[id]}: ${n}`,
    n,
    share: id === "sent" ? 1 : of > 0 ? n / of : 0
  });
  const readNote = t.sent === 0 || readOf === t.sent ? null : readOf > 0 ? LIFECYCLE_WORDS.results.readOf(readOf) : LIFECYCLE_WORDS.results.noRead;
  return {
    read: "read",
    days,
    note,
    headline: t.sent > 0 ? { n: t.replied, words: `wrote back, of ${t.sent} sent` } : { n: 0, words: `messages sent in ${days} days` },
    funnel: t.sent > 0 ? [
      step("sent", t.sent),
      step("delivered", t.delivered),
      // No WhatsApp sent, no read to count: the step is left out, and the note says why.
      ...readOf > 0 ? [step("read", t.read, readOf)] : [],
      step("replied", t.replied)
    ] : null,
    funnelLabel: t.sent > 0 ? readOf > 0 ? LIFECYCLE_WORDS.results.funnelLabel : LIFECYCLE_WORDS.results.funnelLabelNoRead : null,
    yes: `${t.optIns} said yes \xB7 ${t.optOuts} asked to stop`,
    readNote,
    // What went by each channel (0030), where more than one sent: a line under the funnel in the channels' own words.
    byChannel: countsByChannelWords(
      report.byChannel ? Object.fromEntries(report.byChannel.map((c) => [c.channel, c.sent])) : null
    ),
    runs,
    quiet: t.sent === 0 && t.optIns === 0 && t.optOuts === 0
  };
}
