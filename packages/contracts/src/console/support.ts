/**
 * Support (decision 0066, 5, 7, 8): what customers reported from the app, grouped where one error reached several
 * workspaces; what came in (a report, or a setup ask the product cannot do yet); and Find, one box over every
 * workspace's name, its owner's address, its line, a caller's number and a report's words.
 *
 * A caller's number answers with the workspace alone, never who called: the Console sees the platform, a workspace and
 * its members, and a business's customers only through See as the owner, which is not this tier's.
 */
import { agoWords } from "../shared/time";

// ----------------------------------------------------------------------------------------------------- reports

/** One report as support_reports keeps it, with its workspace's name. */
export interface SupportReportDto {
  id: string;
  number: number;
  tenant_id: string | null;
  slug: string | null;
  name: string | null;
  email: string | null;
  page: string | null;
  error_id: string | null;
  error_name: string | null;
  error_message: string | null;
  words: string;
  created_at: string;
  mailed_at: string | null;
  mail_error: string | null;
}

/** A report's number, as the inbox's subject and the Console say it. */
export function reportCode(n: number): string {
  return `R-${n}`;
}

/** The views of Support. */
export const SUPPORT_VIEWS = ["week", "all"] as const;
export type SupportView = (typeof SUPPORT_VIEWS)[number];

export const SUPPORT_VIEW_WORDS: Record<SupportView, string> = { week: "This week", all: "All" };

/** A page's own word for the route a report came from. */
const PAGE_WORDS: Record<string, string> = {
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
  start: "Setup",
};

export function pageWords(page: string | null | undefined): string {
  return page ? (PAGE_WORDS[page] ?? page.charAt(0).toUpperCase() + page.slice(1)) : "No page";
}

export interface SupportReportVM {
  id: string;
  code: string;
  words: string;
  who: string;
  workspace: string;
  slug: string | null;
  page: string;
  errorId: string | null;
  when: string;
  /** Said when the mail to the inbox did not leave: the row is here, the inbox does not have it. */
  unmailed: string | null;
}

export function reportOf(dto: SupportReportDto, nowMs: number): SupportReportVM {
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
    unmailed: dto.mailed_at ? null : dto.mail_error ? `Not in the inbox: ${dto.mail_error}` : "Not in the inbox yet",
  };
}

/** One error several reports name: the page and the error's own words, the workspaces it reached, how often, since when. */
export interface SupportClusterVM {
  errorId: string;
  page: string;
  error: string;
  workspaces: string[];
  reports: number;
  first: string;
  last: string;
}

/**
 * The errors more than one workspace reported, the most reached first. One workspace reporting an error twice is a
 * person pressing again; two workspaces is the product.
 */
export function supportClusters(rows: readonly SupportReportDto[], nowMs: number): SupportClusterVM[] {
  const byError = new Map<string, SupportReportDto[]>();
  for (const r of rows) {
    if (!r.error_id) continue;
    byError.set(r.error_id, [...(byError.get(r.error_id) ?? []), r]);
  }
  return [...byError.entries()]
    .map(([errorId, list]) => {
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
        last: agoWords(times[times.length - 1] ?? nowMs, nowMs),
      };
    })
    .filter((c) => c.workspaces.length >= 2)
    .sort((a, b) => b.workspaces.length - a.workspaces.length || b.reports - a.reports);
}

// --------------------------------------------------------------------------------------------------- what came in

/** A workspace asked a person for something the product cannot do yet (setup_request, 00439): the event's `what`. */
export const SETUP_ASK_WORDS: Record<string, string> = {
  line: "Asked for a phone line",
  port: "Asked to bring their phone number",
  forwarding: "Asked for help with forwarding in their phone system",
  repair: "Asked for their settings to be repaired",
  name: "Asked to change the name the carriers hold",
};

export interface SetupAskDto {
  tenant_id: string;
  slug: string;
  name: string;
  what: string;
  at: string;
}

/** What came in, newest first: a report or a setup ask, each as one row. */
export interface CameInVM {
  key: string;
  kind: "report" | "setup";
  title: string;
  workspace: string;
  slug: string | null;
  detail: string;
  when: string;
  atMs: number;
  code: string | null;
}

export function cameInOf(
  reports: readonly SupportReportDto[],
  asks: readonly SetupAskDto[],
  nowMs: number,
): CameInVM[] {
  const fromReports = reports.map((r): CameInVM => {
    const at = Date.parse(r.created_at);
    return {
      key: `r-${r.id}`,
      kind: "report",
      title: `“${r.words.length > 60 ? `${r.words.slice(0, 59)}…` : r.words}”`,
      workspace: r.name ?? "No workspace",
      slug: r.slug,
      detail: [pageWords(r.page), r.error_id ? `error ${r.error_id}` : "no error"].join(" · "),
      when: agoWords(at, nowMs),
      atMs: at,
      code: reportCode(r.number),
    };
  });
  const fromAsks = asks.map((a): CameInVM => {
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
      code: null,
    };
  });
  return [...fromReports, ...fromAsks].sort((a, b) => b.atMs - a.atMs);
}

// ------------------------------------------------------------------------------------------------------------ Find

export const FIND_KINDS = ["workspace", "owner", "line", "caller", "report"] as const;
export type FindKind = (typeof FIND_KINDS)[number];

const FIND_KIND_WORDS: Record<FindKind, string> = {
  workspace: "Workspaces",
  owner: "Owners",
  line: "A number",
  caller: "A customer of theirs who called it",
  report: "Reports",
};

export const FIND_LIMITS = { min: 2, max: 80, rows: 20 } as const;

/** One match, as platform_find() returns it. */
export interface FindRowDto {
  kind: FindKind;
  tenant_id: string | null;
  slug: string | null;
  name: string | null;
  label: string;
  detail: string | null;
}

/** The digits of a query that is a number: four or more, else null, and the words are searched as words. */
export function findDigits(q: string): string | null {
  const digits = q.replace(/\D/g, "");
  return digits.length >= 4 && /^[\d\s()+.-]+$/.test(q.trim()) ? digits : null;
}

/** The matches, grouped by kind in FIND_KINDS' order, an empty group left out. */
export function findGroups(rows: readonly FindRowDto[]): { kind: FindKind; words: string; rows: FindRowDto[] }[] {
  return FIND_KINDS.map((kind) => ({
    kind,
    words: FIND_KIND_WORDS[kind],
    rows: rows.filter((r) => r.kind === kind),
  })).filter((g) => g.rows.length > 0);
}

export const SUPPORT_WORDS = {
  title: "Support",
  sub: "From Report a problem in the app · you reply in the inbox",
  openInbox: "Open the inbox",
  cluster: (n: number) => `The same error, ${n} workspaces`,
  clusterReports: (n: number) => `${n} report${n === 1 ? "" : "s"}`,
  none: "Nothing was reported this week.",
  noneAll: "Nothing has been reported.",
  columns: { words: "What they wrote", workspace: "Workspace", page: "Page", error: "Error", when: "When" },
  copied: "The number is copied: search the inbox with it.",
  findEmpty: "Nothing matches.",
  findHint: "A name, a slug, an owner's email, a number, a report",
  findKeys: { move: "move", open: "open", close: "close" },
} as const;
