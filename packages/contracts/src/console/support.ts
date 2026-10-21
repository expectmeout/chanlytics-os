/**
 * Support (decisions 0066 and 0067): the help desk. A member's question and a workspace's setup ask, each answered by a
 * person within one business day; the reports of something that isn't working are Health's, and Support says how many
 * went there. And Find, one box over every workspace's name, its owner's address, its line, a caller's number and a
 * report's words.
 *
 * The queue itself, its promise and its states, is support-queue.ts's; this holds what it is built from: the reports
 * and the asks, what finishes an ask (askDoneOf), a question's topic, and the words.
 *
 * A caller's number answers with the workspace alone, never who called: the Console sees the platform, a workspace and
 * its members, and a business's customers only through See as the owner, which is not this tier's.
 */
import type { ReportKind } from "../shell/report-problem";
import { agoWords } from "../shared/time";
import type { PlatformTenantDto } from "../workspace/platform";
import { consolePathOf } from "./console";

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
export function reportCode(n: number): string {
  return `R-${n}`;
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
  const said = [dto.error_name, dto.error_message].filter(Boolean).join(": ");
  return `${dto.error_id} · ${said || "an error"}`;
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
export function askTitle(workspace: string, what: string): string {
  const said = SETUP_ASK_WORDS[what] ?? ASKED_SOMETHING;
  return `${workspace} ${said.charAt(0).toLowerCase()}${said.slice(1)}`;
}

/** One setup ask, as its event keeps it: the event's id, the workspace, what, when, and who asked. */
export interface SetupAskDto {
  id: string;
  tenant_id: string;
  slug: string;
  name: string;
  what: string;
  at: string;
  /** The member who asked, by their address, where it could be read. */
  email: string | null;
  who: SupportWhoDto | null;
}

/** An ask's code, as the Console and the log's ticket say it: A- and the first six of its event's id. */
export function askCode(id: string): string {
  return `A-${id.replace(/-/g, "").slice(0, 6)}`;
}

/** What tells the Console an ask is done, read from the workspace: its forwarding passing a test call, after the ask. */
export interface AskSignalsDto {
  /** When a forwarded number last passed its test call (lines.forwarding_state verified, its state_since). */
  forwarding_verified_at: string | null;
}

/**
 * Whether the workspace shows an ask is done, and the words that say when it will be. A phone line is done when the
 * workspace has a line of its own; forwarding, when a test call came through after the ask. Bringing a number, a repair
 * and a new name are marked done by hand: nothing the Console reads records them yet.
 */
export function askDoneOf(
  what: string,
  row: PlatformTenantDto | null,
  askAtMs: number,
  signals: AskSignalsDto | null,
): { done: boolean; byHand: boolean; words: string } {
  if (what === "line")
    return {
      done: !!row?.line_e164 && row.line_kind !== "forwarded",
      byHand: false,
      words: "Done when the workspace has a line",
    };
  if (what === "forwarding") {
    const at = signals?.forwarding_verified_at ? Date.parse(signals.forwarding_verified_at) : NaN;
    return {
      done: Number.isFinite(at) && at >= askAtMs,
      byHand: false,
      words: "Done when a test call comes through the forwarding",
    };
  }
  const byHand: Record<string, string> = {
    port: "Mark it done once the number has moved",
    repair: "Mark it done once the receptionist reads the settings again",
    name: "Mark it done once the new campaign is approved",
  };
  return { done: false, byHand: true, words: byHand[what] ?? "Mark it done once it is" };
}

// ----------------------------------------------------------------------------------------------------------- topics

/** What a question is about: what people struggle with. Computed at read from their words and the page, never kept. */
export const SUPPORT_TOPICS = [
  "whatsapp",
  "forwarding",
  "line",
  "calendar",
  "billing",
  "language",
  "facts",
  "team",
  "other",
] as const;
export type SupportTopic = (typeof SUPPORT_TOPICS)[number];

export const SUPPORT_TOPIC_WORDS: Record<SupportTopic, string> = {
  whatsapp: "WhatsApp",
  forwarding: "Forwarding",
  line: "A line or number",
  calendar: "Calendar",
  billing: "Billing",
  language: "Language",
  facts: "Hours and prices",
  team: "Team and alerts",
  other: "Other",
};

/**
 * The words that name each topic, in the order they are tried: the first to match wins, so forwarding ("calls to my
 * number") is asked before a line ("a number"), a language before a line ("clients text in Spanish"), and the plan's
 * price before the business's prices.
 */
const TOPIC_MATCH: readonly (readonly [SupportTopic, RegExp])[] = [
  ["whatsapp", /whats\s?app|\bwa\b|meta business|facebook/i],
  [
    "billing",
    /invoice|bill(ing|ed)?\b|charged?\b|\bcard\b|payment|refund|subscription|receipt|\btrial\b|my plan|cancel/i,
  ],
  [
    "forwarding",
    /forward|ring\s?central|vonage|8x8|phone system|voicemail|calls? (go|ring|come)|keep my (own |current )?number/i,
  ],
  ["language", /spanish|español|espanol|french|portuguese|chinese|language|translat|bilingual|english/i],
  ["line", /\bline\b|phone number|\bnumber\b|\bport(ing)?\b|carrier|\bsms\b|\btext(s|ing)?\b|10dlc|a2p|campaign/i],
  ["calendar", /calendar|appointment|\bbook(ing|ed|s)?\b|schedul|availability|google cal|outlook/i],
  [
    "facts",
    /\bhours\b|\bopen(ing)?\b|\bclosed?\b|price|pricing|\bcost|services?\b|\bmenu\b|address|location|\bfaq|facts/i,
  ],
  ["team", /\bteam\b|staff|invite|member|alert|notif|\bbell\b|hand ?off|escalat|who gets/i],
];

/** A page that names a topic when the words do not. */
const TOPIC_OF_PAGE: Record<string, SupportTopic> = { calendar: "calendar" };

/** A question's topic: billing when they said so at the door; else the first topic its words name; else its page's. */
export function supportTopicOf(words: string, page: string | null, kind?: ReportKind): SupportTopic {
  if (kind === "billing") return "billing";
  const hit = TOPIC_MATCH.find(([, re]) => re.test(words));
  if (hit) return hit[0];
  return (page && TOPIC_OF_PAGE[page]) || "other";
}

/** The topic an ask is about. */
export const ASK_TOPIC: Record<string, SupportTopic> = {
  line: "line",
  port: "line",
  forwarding: "forwarding",
  repair: "facts",
  name: "line",
};

/** Support, opened on one row by its code: Home's Due and Came in, and a workspace's reports, link here. */
export function supportPathOf(code: string): string {
  return `${consolePathOf("support")}?open=${encodeURIComponent(code)}`;
}

/** The inbox's address for a search, from its template ({q} where the search goes), or null while it is unset. */
export function inboxSearchUrl(template: string | null | undefined, q: string): string | null {
  return template && template.includes("{q}") ? template.replace("{q}", encodeURIComponent(q)) : null;
}

/** The inbox itself, from the same template: the address before its #, at the inbox. */
export function inboxHomeUrl(template: string | null | undefined): string | null {
  if (!template || !template.includes("{q}")) return null;
  const base = template.split("#")[0] ?? template;
  return base === template ? base.replace("{q}", "") : `${base}#inbox`;
}

/** A row's kind chip, quiet, and the inbox's subject: the team's own word for what the member needed. */
export const SUPPORT_KIND_WORDS: Record<ReportKind | "ask", string> = {
  how_to: "Question",
  setup: "Setup help",
  billing: "Billing",
  wrong: "Bug report",
  ask: "Setup ask",
};

// --------------------------------------------------------------------------------------------------- what came in

/** What came in, newest first: a question or a setup ask, each as one row. Home's; bug reports are Health's. */
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
  const fromReports = reports
    .filter((r) => r.kind !== "wrong")
    .map((r): CameInVM => {
      const at = Date.parse(r.created_at);
      return {
        key: `r-${r.id}`,
        kind: "report",
        title: `“${r.words.length > 60 ? `${r.words.slice(0, 59)}…` : r.words}”`,
        workspace: r.name ?? "No workspace",
        slug: r.slug,
        detail: [
          ...new Set([SUPPORT_KIND_WORDS[r.kind], SUPPORT_TOPIC_WORDS[supportTopicOf(r.words, r.page, r.kind)]]),
        ].join(" · "),
        when: agoWords(at, nowMs),
        atMs: at,
        code: reportCode(r.number),
      };
    });
  const fromAsks = asks.map((a): CameInVM => {
    const at = Date.parse(a.at);
    return {
      key: `a-${a.id}`,
      kind: "setup",
      title: askTitle(a.name, a.what),
      workspace: a.name,
      slug: a.slug,
      detail: "Something setup can't do yet",
      when: agoWords(at, nowMs),
      atMs: at,
      code: askCode(a.id),
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
  sub: "Questions and setup asks from members · you answer in the inbox",
  openInbox: "Open the inbox",
  search: "Their words, a workspace, a topic",
  kinds: "Kind",
  topic: "Topic",
  anyTopic: "Every topic",
  workspace: "Workspace",
  anyWorkspace: "Every workspace",
  views: "Support's views",
  toHealth: (n: number) =>
    `${n} bug report${n === 1 ? "" : "s"} this week went to Health, where what isn't working is looked at.`,
  openHealth: "Open Health",
  columns: { what: "Who needs what", topic: "Topic", waiting: "Waiting", state: "State" },
  shown: (n: number) => `${n} shown`,
  older: "Older",
  keys: "↑↓ move · Enter opens · T take · A copy the reply · M mark answered",
  noneInView: {
    needs: "Nothing needs a person.",
    waiting: "Nothing is waiting on a workspace.",
    done: "Nothing was answered in the last thirty days.",
  },
  noneMatch: "Nothing here matches.",
  cameInNone: "No question or setup ask came in this week.",
  due: (n: number) => `${n} past ${n === 1 ? "its" : "their"} day in Support`,
  failed: "the queue",
  pick: "Open a row to answer it.",
  from: "From",
  workspaceCard: "Their workspace",
  nobodyHasIt: "Nobody has it",
  openSetup: "Open its Setup",
  openWorkspace: "Open the workspace",
  howToHelp: "How to help",
  checkFirst: "Check first",
  reply: "Reply, filled in",
  replyNote: "Copied, never sent from here",
  alsoSent: "Also sent",
  doneWhen: "Done when",
  answerInInbox: "Answer in the inbox",
  writeInInbox: "Write to them in the inbox",
  copyReply: "Copy the reply",
  replyCopied: "The reply is copied: paste it in the inbox.",
  markAnswered: "Mark answered",
  markDone: "Mark done",
  reopen: "Open it again",
  sendAgain: "Send to the inbox again",
  moveToHealth: "This is a bug: move it to Health",
  moveToSupport: "This is a question: move it to Support",
  answeredSaid: "Answered. It's in Done.",
  waitingSaid: "Answered. It waits on the workspace now.",
  doneSaid: "Done.",
  reopenedSaid: "It needs a person again.",
  resentSaid: "Sent to the inbox again.",
  movedSaid: "Moved. It's on Health now.",
  movedBackSaid: "Moved. It's on Support now.",
  noInbox: "The inbox's address isn't set here: copy the code and search the inbox with it.",
  copied: "The number is copied: search the inbox with it.",
  close: "Close",
  findEmpty: "Nothing matches.",
  findHint: "A name, a slug, an owner's email, a number, a report",
  findKeys: { move: "move", open: "open", close: "close" },
} as const;
