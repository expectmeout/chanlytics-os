import { agoWords } from "../shared/time.js";
export function reportCode(n) {
  return `R-${n}`;
}
export const SUPPORT_VIEWS = ["week", "all"];
export const SUPPORT_VIEW_WORDS = { week: "This week", all: "All" };
const PAGE_WORDS = {
  today: "Today",
  inbox: "Inbox",
  conversations: "Conversations",
  clients: "People",
  people: "People",
  leads: "Leads",
  calendar: "Calendar",
  campaigns: "Campaigns",
  reports: "Reports",
  admin: "Settings",
  settings: "Settings",
  live: "Live",
  start: "Setup"
};
export function pageWords(page) {
  return page ? PAGE_WORDS[page] ?? page.charAt(0).toUpperCase() + page.slice(1) : "No page";
}
export function reportOf(dto, nowMs) {
  return {
    id: dto.id,
    code: reportCode(dto.number),
    words: dto.words,
    who: dto.email ?? "Someone signed out",
    workspace: dto.name ?? "No workspace",
    slug: dto.slug,
    page: pageWords(dto.page),
    errorId: dto.error_id,
    when: agoWords(Date.parse(dto.created_at), nowMs),
    unmailed: dto.mailed_at ? null : dto.mail_error ? `Not in the inbox: ${dto.mail_error}` : "Not in the inbox yet"
  };
}
export function supportClusters(rows, nowMs) {
  const byError = /* @__PURE__ */ new Map();
  for (const r of rows) {
    if (!r.error_id) continue;
    byError.set(r.error_id, [...byError.get(r.error_id) ?? [], r]);
  }
  return [...byError.entries()].map(([errorId, list]) => {
    const names = [...new Set(list.map((r) => r.name ?? "No workspace"))];
    const times = list.map((r) => Date.parse(r.created_at)).sort((a, b) => a - b);
    const first = list[0];
    return {
      errorId,
      page: pageWords(first?.page),
      error: first?.error_message || first?.error_name || "An error",
      workspaces: names,
      reports: list.length,
      first: agoWords(times[0] ?? nowMs, nowMs),
      last: agoWords(times[times.length - 1] ?? nowMs, nowMs)
    };
  }).filter((c) => c.workspaces.length >= 2).sort((a, b) => b.workspaces.length - a.workspaces.length || b.reports - a.reports);
}
export const SETUP_ASK_WORDS = {
  line: "Asked for a phone line",
  port: "Asked to bring their phone number",
  forwarding: "Asked for help with forwarding in their phone system",
  repair: "Asked for their settings to be repaired",
  name: "Asked to change the name the carriers hold"
};
export function cameInOf(reports, asks, nowMs) {
  const fromReports = reports.map((r) => {
    const at = Date.parse(r.created_at);
    return {
      key: `r-${r.id}`,
      kind: "report",
      title: `\u201C${r.words.length > 60 ? `${r.words.slice(0, 59)}\u2026` : r.words}\u201D`,
      workspace: r.name ?? "No workspace",
      slug: r.slug,
      detail: [pageWords(r.page), r.error_id ? `error ${r.error_id}` : "no error"].join(" \xB7 "),
      when: agoWords(at, nowMs),
      atMs: at,
      code: reportCode(r.number)
    };
  });
  const fromAsks = asks.map((a) => {
    const at = Date.parse(a.at);
    return {
      key: `s-${a.tenant_id}-${a.at}`,
      kind: "setup",
      title: SETUP_ASK_WORDS[a.what] ?? "Asked a person for something",
      workspace: a.name,
      slug: a.slug,
      detail: "Something setup can't do yet",
      when: agoWords(at, nowMs),
      atMs: at,
      code: null
    };
  });
  return [...fromReports, ...fromAsks].sort((a, b) => b.atMs - a.atMs);
}
export const FIND_KINDS = ["workspace", "owner", "line", "caller", "report"];
const FIND_KIND_WORDS = {
  workspace: "Workspaces",
  owner: "Owners",
  line: "A number",
  caller: "A customer of theirs who called it",
  report: "Reports"
};
export const FIND_LIMITS = { min: 2, max: 80, rows: 20 };
export function findDigits(q) {
  const digits = q.replace(/\D/g, "");
  return digits.length >= 4 && /^[\d\s()+.-]+$/.test(q.trim()) ? digits : null;
}
export function findGroups(rows) {
  return FIND_KINDS.map((kind) => ({
    kind,
    words: FIND_KIND_WORDS[kind],
    rows: rows.filter((r) => r.kind === kind)
  })).filter((g) => g.rows.length > 0);
}
export const SUPPORT_WORDS = {
  title: "Support",
  sub: "From Report a problem in the app \xB7 you reply in the inbox",
  openInbox: "Open the inbox",
  cluster: (n) => `The same error, ${n} workspaces`,
  clusterReports: (n) => `${n} report${n === 1 ? "" : "s"}`,
  none: "Nothing was reported this week.",
  noneAll: "Nothing has been reported.",
  columns: { words: "What they wrote", workspace: "Workspace", page: "Page", error: "Error", when: "When" },
  copied: "The number is copied: search the inbox with it.",
  findEmpty: "Nothing matches.",
  findHint: "A name, a slug, an owner's email, a number, a report",
  findKeys: { move: "move", open: "open", close: "close" }
};
