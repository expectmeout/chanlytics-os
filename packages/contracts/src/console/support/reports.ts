/** Support: reports. */

import type { ReportKind } from "../../shell/report-problem";
import { agoWords } from "../../shared/time";

// ----------------------------------------------------------------------------------------------------- reports

/** Who asked: their name and role in the workspace, and since when they are in it. Read with the row, never kept on it. */
export interface SupportWhoDto {
  name: string | null;
  role: string | null;
  since: string | null;
}

/** One report as support_reports keeps it, with its workspace's name and who sent it. */
export interface SupportReportDto {
  id: string;
  number: number;
  kind: ReportKind;
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
  who: SupportWhoDto | null;
}

/** A report's number, as the inbox's subject and the Console say it. */
export function reportCode(count: number): string {
  return `R-${count}`;
}

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

/** What a report says of its mail: nothing when the inbox has it, else that it does not, and why. */
export function unmailedOf(dto: Pick<SupportReportDto, "mailed_at" | "mail_error">): string | null {
  return dto.mailed_at ? null : dto.mail_error ? `Not in the inbox: ${dto.mail_error}` : "Not in the inbox yet";
}

/** The error a report carried, in one line: Health's, and folded under "Also sent" on a report moved to Support. */
export function errorWordsOf(dto: Pick<SupportReportDto, "error_id" | "error_name" | "error_message">): string | null {
  if (!dto.error_id) return null;
  const sentence = [dto.error_name, dto.error_message].filter(Boolean).join(": ");
  return `${dto.error_id} · ${sentence || "an error"}`;
}

/** A bug report as Health lists it: their words, the workspace, the page, the error, and whether the inbox has it. */
export interface SupportReportVM {
  id: string;
  code: string;
  words: string;
  who: string;
  workspace: string;
  slug: string | null;
  page: string;
  errorId: string | null;
  error: string | null;
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
    error: errorWordsOf(dto),
    when: agoWords(Date.parse(dto.created_at), nowMs),
    unmailed: unmailedOf(dto),
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
 * The errors more than one workspace reported, the most reached first: Health's. One workspace reporting an error twice
 * is a person pressing again; two workspaces is the product.
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

// --------------------------------------------------------------------------------------------------- the setup asks

/** A workspace asked a person for something the product cannot do yet (setup_request, 00439): the event's `what`. */
export const SETUP_ASK_WORDS: Record<string, string> = {
  line: "Asked for a phone line",
  port: "Asked to bring their phone number",
  forwarding: "Asked for help with forwarding in their phone system",
  repair: "Asked for their settings to be repaired",
  name: "Asked to change the name the carriers hold",
};

const ASKED_SOMETHING = "Asked a person for something";

/** An ask in the third person: "Atlas Plumbing asked for a phone line". The Console is us talking about them. */
export function askTitle(workspace: string, text: string): string {
  const sentence = SETUP_ASK_WORDS[text] ?? ASKED_SOMETHING;
  return `${workspace} ${sentence.charAt(0).toLowerCase()}${sentence.slice(1)}`;
}
