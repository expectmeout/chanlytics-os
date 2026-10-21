import { CONSOLE_PATH } from "./console-path.js";
import { csvCell } from "../shared/csv.js";
import { agoWords, DAY_MS, HOUR_MS, MIN_MS, WEEK_MS } from "../shared/time.js";
import {
  PLATFORM_VERDICTS,
  platformRows
} from "../workspace/platform.js";
export const STAFF_ROLES = ["owner", "support", "billing"];
export const STAFF_ROLE_WORDS = {
  owner: "Owner",
  support: "Support",
  billing: "Billing"
};
export const STAFF_STATES = [...STAFF_ROLES, "needs_second_factor", "none"];
export function staffName(email) {
  const local = (email ?? "").split("@")[0] ?? "";
  const word = local.split(/[._+-]/)[0] ?? "";
  return word ? word.charAt(0).toUpperCase() + word.slice(1) : "Someone";
}
const SUPPORT_ROLES = ["owner", "support"];
const MONEY_ROLES = ["owner", "billing"];
export const CONSOLE_ACTS = {
  line_retry: { words: "Retry setting up", roles: SUPPORT_ROLES },
  line_refile: { words: "Refile texting", roles: SUPPORT_ROLES },
  line_replace: { words: "File a new campaign", roles: SUPPORT_ROLES },
  line_release: { words: "Give the number back", roles: SUPPORT_ROLES },
  job_requeue: { words: "Run a failed job again", roles: SUPPORT_ROLES },
  waitlist_invited: { words: "Mark as invited", roles: SUPPORT_ROLES },
  partner_standing: { words: "Rule on a partner's workspace", roles: MONEY_ROLES },
  partner_payout: { words: "Record a payout", roles: MONEY_ROLES },
  partner_status: { words: "Pause, close or restore a partner", roles: SUPPORT_ROLES },
  partner_second_factor: { words: "Reset a partner's second factor", roles: SUPPORT_ROLES },
  request_file: { words: "File a request", roles: SUPPORT_ROLES },
  request_step: { words: "Mark a request's step", roles: SUPPORT_ROLES },
  request_close: { words: "Close a request", roles: SUPPORT_ROLES },
  report_answered: { words: "Mark a question answered", roles: SUPPORT_ROLES },
  report_reopened: { words: "Open a question again", roles: SUPPORT_ROLES },
  report_resent: { words: "Send a report to the inbox again", roles: SUPPORT_ROLES },
  report_moved: { words: "Move a report between Support and Health", roles: SUPPORT_ROLES },
  ask_answered: { words: "Mark a setup ask answered", roles: SUPPORT_ROLES },
  ask_done: { words: "Mark a setup ask done", roles: SUPPORT_ROLES },
  ask_reopened: { words: "Open a setup ask again", roles: SUPPORT_ROLES }
};
export const CONSOLE_ACT_KEYS = Object.keys(CONSOLE_ACTS);
export const LINE_ACTS = {
  retry: "line_retry",
  refile: "line_refile",
  replace: "line_replace",
  release: "line_release"
};
export function staffMay(role, act) {
  return !!role && CONSOLE_ACTS[act].roles.includes(role);
}
export function staffCannotWords(role, act) {
  return `${STAFF_ROLE_WORDS[role]} cannot do that: ${CONSOLE_ACTS[act].words.toLowerCase()}.`;
}
const CONSOLE_SIGHTS = {
  requests: { words: "the privacy requests", roles: SUPPORT_ROLES }
};
export function staffSees(role, sight) {
  return !!role && CONSOLE_SIGHTS[sight].roles.includes(role);
}
export function staffCannotSeeWords(role, sight) {
  return `${STAFF_ROLE_WORDS[role]} cannot see ${CONSOLE_SIGHTS[sight].words}.`;
}
export const REASON_KINDS = ["ticket", "call", "found", "cleanup"];
export const REASON_WORDS = {
  ticket: "Ticket",
  call: "A call",
  found: "Found it",
  cleanup: "Cleanup"
};
export const REASON_LIMITS = { ticket: 40, note: 500 };
export function whyWords(why) {
  const head = why.ticket ? `${REASON_WORDS[why.kind]} \xB7 ${why.ticket}` : REASON_WORDS[why.kind];
  return why.note ? `${head} \xB7 ${why.note}` : head;
}
export const ACT_OUTCOMES = ["running", "done", "refused", "failed"];
const ACT_OUTCOME_WORDS = {
  running: { label: "Running", tone: "info" },
  done: { label: "Done", tone: "ok" },
  refused: { label: "Refused", tone: "danger" },
  failed: { label: "Failed", tone: "danger" }
};
const ACT_GONE_QUIET_MS = 5 * MIN_MS;
const NEVER_FINISHED = { label: "Never finished", tone: "warn" };
const NEVER_FINISHED_NOTE = "It started and nothing came back. Look before taking it again.";
export const ACT_LOG_PAGE = 50;
export const ACT_TARGETS = [
  "workspace",
  "line",
  "job",
  "waitlist",
  "partner",
  "request",
  "platform",
  "report",
  "ask"
];
export function actRowOf(dto, nowMs) {
  const at = Date.parse(dto.at);
  const quiet = dto.outcome === "running" && Number.isFinite(at) && nowMs - at > ACT_GONE_QUIET_MS;
  return {
    id: dto.id,
    when: Number.isFinite(at) ? agoWords(at, nowMs) : "",
    who: staffName(dto.actor_email),
    role: STAFF_ROLE_WORDS[dto.actor_role],
    what: CONSOLE_ACTS[dto.act]?.words ?? dto.act,
    where: dto.name ?? (dto.tenant_id ? "A workspace since deleted" : TARGET_WORDS[dto.target_kind]),
    why: whyWords({ kind: dto.reason_kind, ticket: dto.ticket, note: dto.note }),
    outcome: quiet ? NEVER_FINISHED : ACT_OUTCOME_WORDS[dto.outcome],
    outcomeNote: quiet ? NEVER_FINISHED_NOTE : dto.outcome_note,
    slug: dto.slug
  };
}
const TARGET_WORDS = {
  workspace: "A workspace",
  line: "A line",
  job: "A job",
  waitlist: "The waiting list",
  partner: "A partner",
  request: "A request",
  platform: "Every workspace",
  report: "A report",
  ask: "A setup ask"
};
export function actsCsv(rows) {
  const head = ["at", "who", "role", "act", "workspace", "reason", "ticket", "note", "outcome", "outcome_note"];
  const lines = rows.map(
    (r) => [
      r.at,
      r.actor_email,
      r.actor_role,
      r.act,
      r.slug ?? r.tenant_id,
      r.reason_kind,
      r.ticket,
      r.note,
      r.outcome,
      r.outcome_note
    ].map(csvCell).join(",")
  );
  return [head.join(","), ...lines].join("\r\n");
}
export const CONSOLE_SCREENS = ["home", "workspaces", "support", "requests", "partners", "health", "log"];
export const CONSOLE_SCREEN_WORDS = {
  home: { label: "Home", icon: "home", group: "Work" },
  workspaces: { label: "Workspaces", icon: "monitor", group: "Work" },
  support: { label: "Support", icon: "chat", group: "Work" },
  requests: { label: "Requests", icon: "note", group: "Work", sight: "requests" },
  partners: { label: "Partners", icon: "users", group: "Business" },
  health: { label: "Health", icon: "bolt", group: "Platform" },
  log: { label: "Admin log", icon: "list", group: "Access" }
};
export function staffSeesScreen(role, screen) {
  const sight = CONSOLE_SCREEN_WORDS[screen].sight;
  return sight ? staffSees(role, sight) : !!role;
}
export const CONSOLE_WORKSPACE_TABS = ["overview", "lines", "activity"];
export const CONSOLE_WORKSPACE_TAB_WORDS = {
  overview: "Overview",
  lines: "Setup and lines",
  activity: "Activity"
};
const SLUG = /^[a-z0-9][a-z0-9-]{0,62}$/;
export function consoleAddressOf(pathname) {
  const parts = ((pathname ?? "").split(/[?#]/)[0] ?? "").split("/").filter(Boolean);
  const [root, screen, slug, tab] = parts;
  const home = { screen: "home", slug: null, tab: "overview" };
  if (root !== CONSOLE_PATH.slice(1) || !screen) return home;
  if (!CONSOLE_SCREENS.includes(screen)) return home;
  const s = screen;
  if (s !== "workspaces" || !slug || !SLUG.test(slug)) return { screen: s, slug: null, tab: "overview" };
  const t = CONSOLE_WORKSPACE_TABS.includes(tab ?? "") ? tab : "overview";
  return { screen: s, slug, tab: t };
}
export function consolePathOf(screen, slug, tab) {
  if (screen === "home") return CONSOLE_PATH;
  if (screen === "workspaces" && slug) {
    return tab && tab !== "overview" ? `${CONSOLE_PATH}/workspaces/${slug}/${tab}` : `${CONSOLE_PATH}/workspaces/${slug}`;
  }
  return `${CONSOLE_PATH}/${screen}`;
}
const CONSOLE_GROUPS = {
  needs_us: ["broken", "rehearsal"],
  waiting: ["billing", "waiting_owner", "stalled"],
  look: ["quiet", "new"],
  live: ["live"],
  paused: ["paused"],
  ours: ["test"]
};
export const CONSOLE_GROUP_WORDS = {
  needs_us: "Needs us",
  waiting: "Waiting on them",
  look: "Worth a look",
  live: "Live",
  paused: "Paused",
  ours: "Ours"
};
const GROUP_ORDER = Object.keys(CONSOLE_GROUPS);
export function consoleGroupOf(verdict) {
  return GROUP_ORDER.find((g) => CONSOLE_GROUPS[g].includes(verdict)) ?? "look";
}
export function consoleGroups(rows) {
  return GROUP_ORDER.map((group) => ({
    group,
    words: CONSOLE_GROUP_WORDS[group],
    rows: rows.filter((r) => consoleGroupOf(r.verdict) === group)
  })).filter((g) => g.rows.length > 0);
}
export function verdictPill(verdict) {
  const v = PLATFORM_VERDICTS[verdict];
  return { label: v.label, tone: v.tone };
}
const CLAIM_HOURS = 4;
export const CLAIM_MS = CLAIM_HOURS * HOUR_MS;
export function claimWords(claim, me, nowMs) {
  if (!claim || Date.parse(claim.until) <= nowMs) return null;
  return claim.user_id === me ? "You have it" : `${staffName(claim.email)} is on it`;
}
const money = (cents, currency) => {
  const whole = Math.round(cents / 100).toLocaleString("en-US");
  return !currency || currency === "usd" ? `$${whole}` : `${whole} ${currency.toUpperCase()}`;
};
export function consoleNumbersFrom(tenants, spend, price, nowMs) {
  const verdictOf = new Map(platformRows(tenants, nowMs).map((r) => [r.tenantId, r.verdict]));
  const customers = tenants.filter((t) => verdictOf.get(t.tenant_id) !== "test");
  const answering = customers.filter((t) => ["live", "quiet"].includes(verdictOf.get(t.tenant_id) ?? ""));
  const trialing = customers.filter((t) => t.billing_status === "trialing");
  const endsSoon = (iso) => {
    const at = iso ? Date.parse(iso) : NaN;
    return Number.isFinite(at) && at >= nowMs && at <= nowMs + WEEK_MS;
  };
  const heardToday = (iso) => {
    const at = iso ? Date.parse(iso) : NaN;
    return Number.isFinite(at) && nowMs - at <= DAY_MS;
  };
  const paying = customers.filter((t) => t.billing_status === "active");
  const monthly = price && price.interval === "month" && price.unit_amount !== null ? price.unit_amount : null;
  return {
    paying: paying.length,
    paying_cents: monthly === null ? null : paying.filter((t) => t.billing_mode !== "direct").length * monthly,
    currency: monthly === null || !price ? null : price.currency,
    trials: trialing.length,
    trials_ending: trialing.filter((t) => endsSoon(t.trial_end)).length,
    answering: answering.length,
    heard_today: answering.filter((t) => heardToday(t.last_inbound_at)).length,
    model_usd: spend ? spend.usd : null,
    model_workspaces: spend?.workspaces ?? 0
  };
}
export function consoleNumbersOf(n) {
  return [
    {
      label: "Paying",
      value: n.paying_cents === null ? String(n.paying) : money(n.paying_cents, n.currency),
      sub: n.paying_cents === null ? `workspace${n.paying === 1 ? "" : "s"} on a plan` : `a month \xB7 ${n.paying} workspace${n.paying === 1 ? "" : "s"}`,
      tone: null
    },
    {
      label: "On a trial",
      value: String(n.trials),
      sub: n.trials_ending ? `${n.trials_ending} end${n.trials_ending === 1 ? "s" : ""} this week` : "none end this week",
      tone: n.trials_ending ? "warn" : null
    },
    {
      label: "Heard from today",
      value: `${n.heard_today} of ${n.answering}`,
      sub: "workspaces that answer",
      tone: null
    },
    {
      label: "Model calls, 30 days",
      value: n.model_usd === null ? "\u2014" : `$${Math.round(n.model_usd).toLocaleString("en-US")}`,
      sub: n.model_usd === null ? "could not be read" : `across ${n.model_workspaces} workspaces`,
      tone: null
    }
  ];
}
export function homeSentence(n) {
  return [
    n.needsUs === 1 ? "1 needs us" : `${n.needsUs} need us`,
    `${n.waiting} waiting on them`,
    `${n.cameIn} came in this week`,
    ...n.due ? [n.due] : []
  ].join(" \xB7 ");
}
export const CONSOLE_WORDS = {
  brand: "Chanlytics",
  badge: "Console",
  find: "Find",
  findPlaceholder: "A name, an email, a number or a report",
  secondFactorOn: "second factor on",
  signOut: "Sign out",
  openApp: "Open the app",
  readAgain: "Read again",
  reading: "Reading\u2026",
  failed: "Could not be read right now.",
  failedBody: "Nothing on the platform changed; this page could not read it.",
  noSuchWorkspace: "No workspace has that address.",
  takeIt: "Take it",
  letGo: "Let go",
  open: "Open",
  inTheInbox: "In the inbox",
  every: "Every workspace",
  asksWhy: "Each asks why, then twice, and is written down against you first.",
  recorded: "Written down against you before it runs",
  notNow: "Not now",
  why: "Why",
  ticket: "The ticket",
  ticketHint: "R-1042, or the inbox's number",
  note: "A note for the log",
  noteHint: "What you checked, or what the owner said: never a customer's details",
  needTicket: "Name the ticket, or choose another reason."
};
