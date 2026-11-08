import "server-only";

/**
 * Support, the help desk (decision 0067): the queue's read, Health's bug reports, and the three presses that work it.
 *
 * The queue is built from what the database keeps, nothing kept for it: the questions (support_reports of every kind
 * but a bug) and the setup asks (setup_request's events) of the last ninety days, who sent each, the team's marks on
 * them (platform_acts), who has which workspace, the workspaces as Home judges them, and the forwarding tests that
 * finish an ask. contracts' supportQueueOf turns them into rows; the read answers the rows of one page as the rows'
 * own records, so the page builds the same rows in its reader's time zone.
 *
 * Marking a row answered or done, sending a report to the inbox again and moving one to Health are acts in the Admin
 * log. Each is one press: its reason is the row's own code, a ticket, so none asks why.
 *
 * Cross-workspace: the Console's reads; the service-role client exists only behind backOffice(ctx)'s admin check.
 */
import {
  countBugReports,
  isForwardingVerified,
  listReports,
  getLiveClaims,
  markReportMailed,
  getSupportPeople,
  findPersonEmail,
  reportById,
  setReportKind,
  setupAskById,
  setupAsks,
  getSupportMarks,
  getTenantNames,
  type ReportSide,
} from "@chanlytics/db/console";
import {
  ACT_TARGETS,
  AppError,
  CONSOLE_ACT_KEYS,
  DAY_MS,
  REPORT_KINDS,
  SUPPORT_PAGE,
  SUPPORT_READ_DAYS,
  SUPPORT_ZONE,
  WEEK_MS,
  answeredMedianMs,
  askCode,
  reportCode,
  supportDue,
  supportPageOf,
  supportQueueOf,
  supportQuietWords,
  type AskSignalsDto,
  type ClaimDto,
  type ConsoleAct,
  type PlatformTenantDto,
  type ReportKind,
  type SetupAskDto,
  type SupportActDto,
  type SupportBookDto,
  type SupportCounts,
  type SupportFilter,
  type SupportReportDto,
  type SupportRowVM,
  type SupportWhoDto,
  UUID,
} from "@chanlytics/contracts";
import { callEdge, edgeAnswered, edgeConfigured, edgeRefusalWords } from "../shared/edge";
import { deployment, env } from "../shared/env";
import { takeAct } from "./acts";
import { listPlatformOverview } from "./platform";
import type { BackOffice } from "../shared/back-office";
import { log } from "@/server/shared/log";
import { inSet } from "@/server/console/acts";
import type { TenantId } from "@chanlytics/contracts";

/**
 * How many of each the queue reads: far past what ninety days of a help desk holds. A read that reached it says so in
 * the server's log rather than in a number on the page.
 */
const BOOK_ROWS = 2000;

/** How many askers' addresses one read looks up in the identity store, one call each. */
const ASKER_LOOKUPS = 40;

/* ------------------------------------------------------------------------------------------- reports and asks */

type ReportRow = {
  id: string;
  number: number;
  kind: string;
  tenant_id: TenantId | null;
  user_id: string | null;
  email: string | null;
  page: string | null;
  error_id: string | null;
  error_name: string | null;
  error_message: string | null;
  words: string;
  created_at: string;
  mailed_at: string | null;
  mail_error: string | null;
  tenant: { slug: string; name: string } | null;
};

const reportDto = (report: ReportRow, supportWho: SupportWhoDto | null): SupportReportDto => ({
  id: report.id,
  number: report.number,
  kind: inSet(REPORT_KINDS, report.kind, "how_to"),
  tenant_id: report.tenant_id,
  slug: report.tenant?.slug ?? null,
  name: report.tenant?.name ?? null,
  email: report.email,
  page: report.page,
  error_id: report.error_id,
  error_name: report.error_name,
  error_message: report.error_message,
  words: report.words,
  created_at: report.created_at,
  mailed_at: report.mailed_at,
  mail_error: report.mail_error,
  who: supportWho,
});

/** Who each person is in each workspace: by `user:tenant`, their name, role and since when. */
async function whoSent(office: BackOffice, userIds: readonly string[]): Promise<Map<string, SupportWhoDto>> {
  const ids = [...new Set(userIds)];
  if (!ids.length) return new Map();
  const { members, profiles } = await getSupportPeople(office.db, ids);
  if (members.error) throw new Error(members.error.message);
  if (profiles.error) throw new Error(profiles.error.message);
  const nameOf = new Map((profiles.data ?? []).map((p) => [p.user_id, p.display_name.trim() || null]));
  return new Map(
    (members.data ?? []).map((m) => [
      `${m.user_id}:${m.tenant_id}`,
      { name: nameOf.get(m.user_id) ?? null, role: m.role, since: m.created_at },
    ]),
  );
}

/** Reports since a moment (or all), newest first, each with who sent it: Support's, Health's, or every kind. */
export async function listReportsSince(
  office: BackOffice,
  input: { sinceIso?: string; tenantId?: TenantId; side: ReportSide; limit?: number },
): Promise<SupportReportDto[]> {
  const { data, error } = await listReports(office.db, { ...input, limit: input.limit ?? BOOK_ROWS });
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  if (rows.length >= (input.limit ?? BOOK_ROWS)) log.error("platform_console_read_failed", { read: "reports_capped" });
  const person = await whoSent(
    office,
    rows.flatMap((r) => (r.user_id ? [r.user_id] : [])),
  ).catch((e: unknown) => {
    log.error("platform_console_read_failed", { read: "report_people", error: e });
    return new Map<string, SupportWhoDto>();
  });
  return rows.map((r) =>
    reportDto(r, r.user_id && r.tenant_id ? (person.get(`${r.user_id}:${r.tenant_id}`) ?? null) : null),
  );
}

/** The member an ask's event names as who asked (setup_request writes their id as `by`). */
const askerOf = (data: unknown): string | null => {
  const by = data && typeof data === "object" && !Array.isArray(data) ? (data as { by?: unknown }).by : null;
  return typeof by === "string" && UUID.test(by) ? by : null;
};

const whatOf = (data: unknown): string => {
  const subject = data && typeof data === "object" && !Array.isArray(data) ? (data as { what?: unknown }).what : null;
  return typeof subject === "string" ? subject : "";
};

/** The setup asks since a moment, each with its workspace's name, who asked and their address. */
export async function listAsksSince(
  office: BackOffice,
  input: { sinceIso: string; tenantId?: TenantId; limit?: number },
): Promise<SetupAskDto[]> {
  const { data, error } = await setupAsks(office.db, { ...input, limit: input.limit ?? BOOK_ROWS });
  if (error) throw new Error(error.message);
  const rows = (data ?? []).filter((e): e is typeof e & { tenant_id: TenantId } => !!e.tenant_id);
  const ids = [...new Set(rows.map((e) => e.tenant_id))];
  const names = ids.length ? await getTenantNames(office.db, ids) : { data: [], error: null };
  if (names.error) throw new Error(names.error.message);
  const byId = new Map((names.data ?? []).map((t) => [t.id, t]));
  const askers = [...new Set(rows.flatMap((e) => askerOf(e.data) ?? []))];
  const [who, emails] = await Promise.all([
    whoSent(office, askers).catch(() => new Map<string, SupportWhoDto>()),
    Promise.all(
      askers
        .slice(0, ASKER_LOOKUPS)
        .map(async (u) => [u, await findPersonEmail(office.db, u).catch(() => null)] as const),
    ).then((pairs) => new Map(pairs)),
  ]);
  return rows.flatMap((row) => {
    const found = byId.get(row.tenant_id);
    const by = askerOf(row.data);
    return found
      ? [
          {
            id: row.id,
            tenant_id: found.id,
            slug: found.slug,
            name: found.name,
            what: whatOf(row.data),
            at: row.created_at,
            email: by ? (emails.get(by) ?? null) : null,
            who: by ? (who.get(`${by}:${found.id}`) ?? null) : null,
          },
        ]
      : [];
  });
}

/* ------------------------------------------------------------------------------------------------- the book */

/** The team's marks on questions and asks since a moment, as the queue reads them. */
async function marksSince(office: BackOffice, sinceIso: string): Promise<SupportActDto[]> {
  const { data, error } = await getSupportMarks(office.db, { sinceIso, limit: BOOK_ROWS });
  if (error) throw new Error(error.message);
  return (data ?? []).flatMap((items) =>
    items.target_id && (items.target_kind === "report" || items.target_kind === "ask")
      ? [
          {
            act: inSet(CONSOLE_ACT_KEYS, items.act, items.act as ConsoleAct),
            target_kind: items.target_kind,
            target_id: items.target_id,
            at: items.at,
            actor_email: items.actor_email,
          },
        ]
      : [],
  );
}

/** When each of these workspaces' forwarded numbers last passed its test call. */
async function signalsOf(office: BackOffice, tenantIds: readonly string[]): Promise<Record<string, AskSignalsDto>> {
  if (!tenantIds.length) return {};
  const { data, error } = await isForwardingVerified(office.db, tenantIds);
  if (error) throw new Error(error.message);
  const out: Record<string, AskSignalsDto> = {};
  for (const l of data ?? []) {
    const was = out[l.tenant_id]?.forwarding_verified_at;
    if (!was || l.state_since > was) out[l.tenant_id] = { forwarding_verified_at: l.state_since };
  }
  return out;
}

export async function claimsNow(office: BackOffice, nowIso: string): Promise<ClaimDto[]> {
  const { data, error } = await getLiveClaims(office.db, nowIso);
  if (error) throw new Error(error.message);
  return data ?? [];
}

/**
 * Everything the queue is built from, as the database keeps it. Home hands in the workspaces it reads anyway, so the
 * overview is read once for the page.
 */
async function supportBook(
  office: BackOffice,
  now: number,
  tenants?: Promise<PlatformTenantDto[]>,
): Promise<SupportBookDto> {
  const since = new Date(now - SUPPORT_READ_DAYS * DAY_MS).toISOString();
  const [reports, asks, acts, claims, rows] = await Promise.all([
    listReportsSince(office, { sinceIso: since, side: "support" }),
    listAsksSince(office, { sinceIso: since }),
    marksSince(office, since),
    claimsNow(office, new Date(now).toISOString()),
    tenants ?? listPlatformOverview(office),
  ]);
  const forwarded = [...new Set(asks.filter((a) => a.what === "forwarding").map((a) => a.tenant_id))];
  return { reports, asks, acts, claims, tenants: rows, signals: await signalsOf(office, forwarded) };
}

/** The book cut to these rows: their records, their marks, and their workspaces. */
function pageBook(book: SupportBookDto, rows: readonly SupportRowVM[]): SupportBookDto {
  const ids = new Set(rows.map((r) => r.id));
  const tenants = new Set(rows.flatMap((r) => (r.tenantId ? [r.tenantId] : [])));
  return {
    reports: book.reports.filter((r) => ids.has(r.id)),
    asks: book.asks.filter((a) => ids.has(a.id)),
    acts: book.acts.filter((a) => ids.has(a.target_id)),
    claims: book.claims.filter((c) => tenants.has(c.tenant_id)),
    tenants: book.tenants.filter((t) => tenants.has(t.tenant_id)),
    signals: Object.fromEntries(Object.entries(book.signals).filter(([id]) => tenants.has(id))),
  };
}

/** The queue as the server orders it: the same rows in any zone, since a row's state and its promise are instants. */
const queueOf = (office: BackOffice, book: SupportBookDto, now: number) =>
  supportQueueOf(book, { me: office.userId, nowMs: now, zone: SUPPORT_ZONE });

/** The rows past their day that still need a person, as their own records: Home's Due. */
export async function readSupportDueBook(
  office: BackOffice,
  now: number,
  tenants: Promise<PlatformTenantDto[]>,
): Promise<SupportBookDto> {
  const book = await supportBook(office, now, tenants);
  return pageBook(book, supportDue(queueOf(office, book, now), now));
}

/* ------------------------------------------------------------------------------------------------------ the queue */

interface ConsoleSupportDto {
  /** The page's rows, as their own records: the page builds them in its reader's zone. */
  book: SupportBookDto;
  counts: SupportCounts;
  /** Whether Older has more. */
  more: boolean;
  /** How fast we answered in the last thirty days, the median; null with none to count. */
  answered_ms: number | null;
  /** What a queue with nothing needing a person says instead. */
  quiet: string | null;
  /** How many bug reports went to Health this week; null when unread. */
  to_health: number | null;
  /** The inbox's search address, {q} where the words go; null while unset. */
  inbox: string | null;
}

/** One view of the queue, narrowed as its tools say, `page` pages of SUPPORT_PAGE rows. */
export async function getConsoleSupport(
  office: BackOffice,
  supportFilter: SupportFilter & { page: number },
  now = Date.now(),
): Promise<ConsoleSupportDto> {
  const weekAgo = new Date(now - WEEK_MS).toISOString();
  const [book, toHealth] = await Promise.all([
    supportBook(office, now),
    countBugReports(office.db, weekAgo).then(
      (r) => (r.error ? null : (r.count ?? 0)),
      () => null,
    ),
  ]);
  const all = queueOf(office, book, now);
  const { rows, counts } = supportPageOf(all, supportFilter, now);
  const shown = rows.slice(0, supportFilter.page * SUPPORT_PAGE);
  return {
    book: pageBook(book, shown),
    counts,
    more: rows.length > shown.length,
    answered_ms: answeredMedianMs(all, book.acts, now),
    quiet: counts.views.needs === 0 ? supportQuietWords(all, now) : null,
    to_health: toHealth,
    inbox: env.SUPPORT_INBOX_URL ?? null,
  };
}

/** Health's bug reports: the last thirty days of "Something isn't working", each with who sent it. */
export async function getConsoleBugs(office: BackOffice, now = Date.now()): Promise<{ reports: SupportReportDto[] }> {
  const since = new Date(now - 30 * DAY_MS).toISOString();
  return { reports: await listReportsSince(office, { sinceIso: since, side: "health", limit: 200 }) };
}

/* ------------------------------------------------------------------------------------------------- the presses */

/** The act each mark is, by what it marks. */
const MARK_ACTS = {
  report: { answered: "report_answered", reopened: "report_reopened" },
  ask: { answered: "ask_answered", done: "ask_done", reopened: "ask_reopened" },
} as const satisfies Record<"report" | "ask", Partial<Record<"answered" | "done" | "reopened", ConsoleAct>>>;

const NO_SUCH = "That row isn't there any more. Read the queue again.";

/** A question answered or open again, an ask answered, done by hand or open again: an act whose reason is its code. */
export async function markSupport(
  office: BackOffice,
  message: { target: "report" | "ask"; id: string; mark: "answered" | "done" | "reopened" },
): Promise<{ ok: true }> {
  const found =
    message.target === "report" ? await reportById(office.db, message.id) : await setupAskById(office.db, message.id);
  if (found.error) throw new AppError("internal", "The queue could not be read just now. Try again in a moment.", 503);
  if (!found.data) throw new AppError("not_found", NO_SUCH, 404);
  const code =
    message.target === "report" ? reportCode((found.data as { number: number }).number) : askCode(message.id);
  const acts: Partial<Record<"answered" | "done" | "reopened", ConsoleAct>> = MARK_ACTS[message.target];
  const act = acts[message.mark];
  if (!act) throw new AppError("validation", "A question is done once it is answered.", 400);
  return takeAct(
    office,
    {
      act,
      why: { kind: "ticket", ticket: code, note: null },
      tenantId: found.data.tenant_id,
      target: inSet(ACT_TARGETS, message.target, "report"),
      targetId: message.id,
    },
    () => Promise.resolve({ ok: true as const }),
  );
}

/** The mail gives up after this; the row says what came of it either way. */
const RESEND_TIMEOUT_MS = 8000;

/**
 * A report the inbox did not get, sent to it again: the edge's support door, on behalf of the member who wrote it
 * (it reads the row by its id and theirs), and the row marked with what came of it. Our mail about our row: its reason
 * is the report's code.
 */
export async function resendSupport(office: BackOffice, id: string): Promise<{ mailed: boolean }> {
  const found = await reportById(office.db, id);
  if (found.error) throw new AppError("internal", "The report could not be read just now. Try again in a moment.", 503);
  const data = found.data;
  if (!data) throw new AppError("not_found", NO_SUCH, 404);
  return takeAct(
    office,
    {
      act: "report_resent",
      why: { kind: "ticket", ticket: reportCode(data.number), note: null },
      tenantId: data.tenant_id,
      target: "report",
      targetId: data.id,
    },
    async () => {
      if (!deployment.providersLive || !edgeConfigured())
        throw new AppError("conflict", "This deployment sends no mail.", 409);
      if (!data.user_id)
        throw new AppError("conflict", "Its sender's account is gone, so the inbox can't be told.", 409);
      const sent = await callEdge(
        "/api/admin/support/report",
        { report_id: data.id },
        { workspace: data.tenant_id, user: data.user_id, timeoutMs: RESEND_TIMEOUT_MS },
      );
      const mailed = edgeAnswered(sent);
      const words = mailed ? null : (edgeRefusalWords(sent.body) ?? `The edge answered ${sent.status}.`);
      const kept = await markReportMailed(
        office.db,
        data.id,
        mailed ? { at: new Date().toISOString() } : { error: words ?? "" },
      );
      if (kept.error) log.error("support_report_mail_failed", { tenant_id: data.tenant_id, error: kept.error.message });
      if (!mailed) throw new AppError("conflict", `It didn't send: ${words}`, 409);
      return { mailed };
    },
  );
}

/** A report moved between Support and Health, as what the member needed: an act whose reason is its code. */
export async function moveSupport(office: BackOffice, id: string, kind: ReportKind): Promise<{ kind: ReportKind }> {
  const found = await reportById(office.db, id);
  if (found.error) throw new AppError("internal", "The report could not be read just now. Try again in a moment.", 503);
  const data = found.data;
  if (!data) throw new AppError("not_found", NO_SUCH, 404);
  return takeAct(
    office,
    {
      act: "report_moved",
      why: { kind: "ticket", ticket: reportCode(data.number), note: kind === "wrong" ? "To Health" : "To Support" },
      tenantId: data.tenant_id,
      target: "report",
      targetId: data.id,
    },
    async () => {
      const moved = await setReportKind(office.db, data.id, kind);
      if (moved.error || !moved.data)
        throw new AppError("internal", "That could not be saved just now. Try again in a moment.", 503);
      return { kind };
    },
  );
}
