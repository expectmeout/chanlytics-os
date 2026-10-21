import { agoWords, DAY_MS } from "../shared/time.js";
const SWEEP_WORDS = {
  calendar: "Calendars read for the people booked",
  calls: "Calls reconciled",
  channel_quality: "WhatsApp's quality read",
  deadman: "Replies that went quiet",
  google: "Google listings read",
  health: "The health check",
  jobs: "The job runner",
  leads: "The lead finder",
  lines: "Phone lines checked",
  mailboxes: "Connected mailboxes read",
  notes: "Notes suggested from calls",
  partitions: "The events' months made ahead",
  partners: "Partners' earnings counted",
  pauses: "Paused threads released",
  platform_metrics_roll: "The day's numbers counted",
  playbooks: "Sequences' clock",
  purge_ask: "Old Ask threads removed",
  purge_client_errors: "Old browser errors removed",
  purge_config_versions: "Old settings versions removed",
  purge_cron_history: "Old clock history removed",
  purge_events: "Old evidence removed",
  purge_google_reviews: "Old Google reviews removed",
  purge_idempotency_keys: "Old repeat guards removed",
  purge_invitations: "Closed invitations removed",
  purge_jobs: "Finished jobs removed",
  purge_leads: "Untouched leads removed",
  purge_model_turns: "Old receptionist turns removed",
  purge_notifications: "Old alerts removed",
  purge_page_vitals: "Old page timings removed",
  purge_provider_events: "Old provider deliveries removed",
  purge_rate_hits: "Old rate counts removed",
  reach_out: "Reach-outs sent on time",
  reach_out_check: "Reach-outs checked before they go",
  registration: "Texting registrations followed",
  snoozes: "Snoozed threads woken",
  sweep_voice_sessions: "Ended voice sessions removed"
};
const ASKS_ONLY_WITH_WORK = {
  calls: "asks the edge only while a call has run past five minutes"
};
export function scheduleWords(schedule) {
  if (!schedule) return "";
  if (/seconds?$/.test(schedule)) return `every ${schedule}`;
  const parts = schedule.trim().split(/\s+/);
  if (parts.length !== 5) return schedule;
  const [min, hour, dom] = parts;
  if (min === "*" && hour === "*") return "every minute";
  const every = /^(?:\d+-\d+)?\*?\/(\d+)$/.exec(min ?? "");
  if (every && hour === "*") return `every ${every[1]} min`;
  if (dom && dom !== "*") return `the ${dom}${dom === "1" ? "st" : dom === "2" ? "nd" : dom === "3" ? "rd" : "th"}`;
  if (hour === "*" && min)
    return min.split(",").map((m) => `:${m.padStart(2, "0")}`).join(" and ");
  const every6 = /^\*\/(\d+)$/.exec(hour ?? "");
  if (every6) return `every ${every6[1]} h`;
  if (/^\d+$/.test(hour ?? "") && /^\d+$/.test(min ?? ""))
    return `daily ${hour?.padStart(2, "0")}:${min?.padStart(2, "0")}`;
  return schedule;
}
const CLOCK_STATE_WORDS = {
  running: { label: "Running", tone: "ok" },
  stopped: { label: "Not running", tone: "danger" },
  idle: { label: "Idle", tone: "plain" },
  unknown: { label: "Unread", tone: "plain" }
};
export function clocksOf(rows) {
  const vms = (rows ?? []).map((c) => {
    const asks = c.judged_by === "request";
    const lastIso = asks ? c.last_request_at : c.last_run ?? c.last_request_at;
    const lastMs = lastIso ? Date.parse(lastIso) : null;
    const idleNote = ASKS_ONLY_WITH_WORK[c.sweep] ?? null;
    const state = c.healthy === null ? "unknown" : !c.healthy ? "stopped" : asks && !c.last_request_at && (idleNote || !c.max_silence) ? "idle" : "running";
    return {
      sweep: c.sweep,
      words: SWEEP_WORDS[c.sweep] ?? c.sweep.replace(/_/g, " "),
      machine: c.jobname ?? c.sweep,
      schedule: scheduleWords(c.schedule),
      state,
      stateWords: CLOCK_STATE_WORDS[state],
      lastMs: lastMs !== null && Number.isFinite(lastMs) ? lastMs : null,
      judged: asks ? c.max_silence ? `its asks, ${silenceWords(c.max_silence)}` : "its asks" : `its runs, ${silenceWords(c.max_silence)}`,
      runs: c.runs,
      failed: c.failed,
      problem: !c.healthy && c.healthy !== null ? c.detail || "It has not reported in time." : c.failed ? c.last_failure : null,
      note: state === "idle" ? idleNote ?? "asks only when there is work" : null
    };
  });
  const order = { stopped: 0, unknown: 1, running: 2, idle: 3 };
  vms.sort((a, b) => order[a.state] - order[b.state] || a.words.localeCompare(b.words));
  return {
    rows: vms,
    runs: vms.reduce((n, c) => n + c.runs, 0),
    failed: vms.reduce((n, c) => n + c.failed, 0)
  };
}
function silenceWords(interval) {
  if (!interval) return "";
  const days = /^(\d+) days?$/.exec(interval);
  if (days) return `${days[1]} days`;
  const hms = /^(\d+):(\d+):(\d+)$/.exec(interval);
  if (!hms) return interval;
  const h = Number(hms[1]);
  const m = Number(hms[2]);
  return h ? m ? `${h} h ${m} min` : `${h} h` : `${m} min`;
}
const PAGE_KEY_WORDS = {
  answer_rate_zero: "A workspace answered nobody",
  numbers_past_target: "Numbers past a target",
  jobs_backlog: "Jobs waiting unclaimed",
  jobs_mass_failure: "Many jobs failing at once",
  jobs_replies_late: "Replies claimed late",
  whatsapp_no_receipt: "WhatsApp with no receipts",
  mail_domain: "The mail domain stopped verifying",
  campaigns_domain: "The campaigns' mail domain stopped verifying",
  event_deliver_failed: "A delivery failing",
  model_failures: "A workspace's model calls failing",
  model_credit: "The model key's credit ran out",
  provider_auth: "A provider refusing our credentials",
  outside: "A check outside the product"
};
export function pageKeyWords(key) {
  const [head, rest] = key.split(/:(.*)/s);
  const words = PAGE_KEY_WORDS[head ?? key] ?? key.replace(/_/g, " ");
  if (!rest) return words;
  if (head === "event_deliver_failed") return `${words}: ${subscriberWords(rest)}`;
  if (head === "model_failures") return words;
  return `${words}: ${rest.replace(/_/g, " ")}`;
}
export function subscriberWords(subscriber) {
  const words = {
    consent_notice: "consent notices",
    owner_notice: "the owner's notices",
    visit_notice: "booking notices",
    reach_out_booked: "reach-outs that booked",
    audit: "the audit trail"
  };
  return words[subscriber] ?? subscriber.replace(/_/g, " ");
}
export function pagesOf(rows, workspaces, nowMs) {
  const date = (ms) => new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  const when = (ms) => agoWords(ms, nowMs, { dateAfterMs: DAY_MS, date });
  const byId = new Map((workspaces ?? []).map((w) => [w.id, w]));
  return {
    read: rows !== null,
    rows: (rows ?? []).map((p) => {
      const firstMs = Date.parse(p.first_at);
      const lastMs = Date.parse(p.last_at);
      const alertedMs = p.alerted_at ? Date.parse(p.alerted_at) : null;
      const id = /^model_failures:(.+)$/.exec(p.key)?.[1] ?? null;
      const w = id ? byId.get(id) : void 0;
      return {
        key: p.key,
        words: pageKeyWords(p.key),
        count: p.count,
        firstMs,
        first: date(firstMs),
        last: when(lastMs),
        lastMailed: alertedMs ? when(alertedMs) : null,
        recent: nowMs - lastMs <= DAY_MS,
        alertedToday: alertedMs !== null && nowMs - alertedMs <= DAY_MS,
        where: w ? w.name : "Every workspace",
        ours: w?.ours ?? false
      };
    })
  };
}
const JOB_WORDS = {
  outbound_send: "A message's send",
  broadcast_send: "A campaign's run",
  line_provision: "Setting up a phone line",
  email_ingest: "Taking in an email",
  lead_round_start: "Starting a lead search",
  lead_collect: "A lead search's page",
  lead_check: "Checking a search's emails",
  push_send: "An alert to a phone",
  push_receipts: "Checking a phone was told",
  reply_read: "Reading a lead's reply",
  booking_read: "Reading a booking notice",
  event_deliver: "Passing on a change",
  inbound_answer: "Answering a text"
};
export function jobWords(kind) {
  return JOB_WORDS[kind] ?? kind.replace(/_/g, " ");
}
export function failureReadingOf(lastError, attempts) {
  if (!lastError) return null;
  const sameEveryTry = attempts > 1 ? "It failed the same way on every try, and a" : "A";
  if (/answered 4\d\d\b|\b4\d\d\b.*(invalid|valid|not found|unauthor|forbidden)/i.test(lastError))
    return `${sameEveryTry} 4xx from the provider means the request itself is wrong: running it again will likely fail the same way.`;
  if (/answered 5\d\d\b|timed? ?out|timeout|ECONNRESET|unreachable/i.test(lastError))
    return "The provider failed or didn't answer in time: running it again once it's back is likely to work.";
  if (/did not finish|outcome is unknown/i.test(lastError))
    return "It stopped before it finished, so what it did isn't known: look at what it was doing before running it again.";
  if (/out of time/i.test(lastError)) return "It ran out of time: running it again at a quieter moment may work.";
  if (/restricted|not allowed|permission|api key/i.test(lastError))
    return "The provider refused our key for this: it needs the key's rights fixed, not another try.";
  return null;
}
