import "server-only";

/**
 * The Console's reads (decision 0066): Home, one workspace by its address, Find, and who has taken which workspace.
 * Support's queue is ./support.ts's, which Home reads for what is past its day. Each takes the BackOffice handle, so none can be reached without the database having said this session
 * is staff and showed its second factor.
 *
 * A side read that fails is said as null, never as nothing: Home is opened when something is wrong, and a page that
 * fails because the spend could not be summed is useless at that moment, as one that says "nothing came in" when the
 * read failed is wrong. The workspaces themselves are the page's work, and their read failing fails the page.
 *
 * Cross-workspace: the Console's reads; the service-role client exists only behind backOffice(ctx)'s admin check.
 */
import { claimOf, findAcross, letClaimGo, liveClaims, modelSpend, takeClaim, tenantBySlug } from "@chanlytics/db";
import {
  AppError,
  CLAIM_MS,
  CONSOLE_WORDS,
  DAY_MS,
  FIND_KINDS,
  FIND_LIMITS,
  WEEK_MS,
  consoleNumbersFrom,
  staffName,
  staffSees,
  type ClaimDto,
  type ConsoleNumbersDto,
  type ConsoleSight,
  type FindRowDto,
  type PlatformActDto,
  type PlatformQueue,
  type PrivacyRequestDto,
  type PlatformTenantDto,
  type SetupAskDto,
  type StaffRole,
  type SupportBookDto,
  type SupportReportDto,
} from "@chanlytics/contracts";
import { platformEvents, platformOverview, platformPartners, platformWaitlist, type BackOffice } from "./platform";
import { consoleRequests } from "./requests";
import { billingReadiness } from "@/server/workspace/billing";
import { consoleActs } from "./acts";
import { asksSince, reportsSince, supportDueBook } from "./support";
import { log } from "@/server/log";

/** Who is asking, as the Console's frame draws them. */
interface ConsoleMe {
  user_id: string;
  email: string | null;
  name: string;
  role: StaffRole;
}

export function consoleMe(office: BackOffice): ConsoleMe {
  return { user_id: office.userId, email: office.email, name: staffName(office.email), role: office.role };
}

/** A side read: its answer, or null with the failure logged under the read's name. */
export async function side<T>(what: string, read: () => Promise<T>): Promise<T | null> {
  try {
    return await read();
  } catch (e) {
    log.error("platform_console_read_failed", { read: what, error: e });
    return null;
  }
}

/* ---------------------------------------------------------------------------------------------- who has it */

async function claimsNow(office: BackOffice, nowIso: string): Promise<ClaimDto[]> {
  const { data, error } = await liveClaims(office.db, nowIso);
  if (error) throw new Error(error.message);
  return data ?? [];
}

/**
 * Take a workspace for CLAIM_HOURS, or let it go. Not an act on the business, so no reason and no log row: it tells the
 * rest of the team who is on it. A workspace someone else holds is refused with who.
 */
export async function consoleClaim(office: BackOffice, tenantId: string, take: boolean): Promise<ClaimDto | null> {
  if (!take) {
    const { error } = await letClaimGo(office.db, tenantId, office.userId);
    if (error) throw new AppError("internal", "That could not be saved just now. Try again in a moment.", 503);
    return null;
  }
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const { data, error } = await takeClaim(office.db, {
    tenantId,
    userId: office.userId,
    email: office.email,
    nowIso,
    untilIso: new Date(now + CLAIM_MS).toISOString(),
  });
  if (error?.code === "23505") {
    const held = await claimOf(office.db, tenantId, nowIso);
    throw new AppError("conflict", `${staffName(held.data?.email ?? null)} is on it already.`, 409);
  }
  if (error?.code === "23503") throw new AppError("not_found", "No such workspace.", 404);
  if (error || !data) throw new AppError("internal", "That could not be saved just now. Try again in a moment.", 503);
  return data;
}

/* --------------------------------------------------------------------------------------------------------- Home */

interface ConsoleHomeDto {
  me: ConsoleMe;
  tenants: PlatformTenantDto[];
  numbers: ConsoleNumbersDto;
  claims: ClaimDto[] | null;
  /** What came in this week: the questions (never a bug report: Health's) and the setup asks. */
  reports: SupportReportDto[] | null;
  asks: SetupAskDto[] | null;
  /** Due: the questions and asks past their day, as their own records; null when unread. */
  support: SupportBookDto | null;
  /** Due: the open requests (null to a role that does not see them), and the partners' workspaces held for a person. */
  requests: PrivacyRequestDto[] | null;
  partners: Awaited<ReturnType<typeof platformPartners>> | null;
  /** Waiting to get in: the waiting list, as the back office read it. */
  queue: PlatformQueue | null;
  /** What each workspace's model calls cost in the last thirty days, in dollars, by its id; null when unread. */
  spend: Record<string, number> | null;
}

/** What each workspace's model calls cost in the last thirty days, summed in the database. */
async function spendOf(office: BackOffice): Promise<Record<string, number>> {
  const { data, error } = await modelSpend(office.db, 30);
  if (error) throw new Error(error.message);
  return Object.fromEntries((data ?? []).map((r) => [r.tenant_id, Number(r.usd)]));
}

/** The spend in all, and across how many workspaces that spent anything. */
const spendInAll = (by: Record<string, number> | null) =>
  by
    ? {
        usd: Object.values(by).reduce((a, b) => a + b, 0),
        workspaces: Object.values(by).filter((usd) => usd > 0).length,
      }
    : null;

/** A read only a role that sees it makes; to any other its answer is null, and its page does not draw it. */
const seen = <T>(office: BackOffice, sight: ConsoleSight, read: () => Promise<T>): Promise<T | null> =>
  staffSees(office.role, sight) ? read() : Promise.resolve(null);

/**
 * Home: every workspace (the groups are drawn from them), the numbers, who has what, what came in this week, what is
 * due (the requests' clocks, the questions and asks past their day, the partners' held shares), and who is waiting to
 * get in. The plan's price is the edge's, read from Stripe and held five minutes. The open
 * requests are the roles' that work them (CONSOLE_SIGHTS): to any other they are null, and Due draws the rest.
 */
export async function consoleHome(office: BackOffice, now = Date.now()): Promise<ConsoleHomeDto> {
  const nowIso = new Date(now).toISOString();
  const weekAgo = new Date(now - WEEK_MS).toISOString();
  const overview = platformOverview(office);
  const [tenants, spend, readiness, claims, reports, asks, support, requests, partners, queue] = await Promise.all([
    overview,
    side("model_spend", () => spendOf(office)),
    side("price", () => billingReadiness(now)),
    side("claims", () => claimsNow(office, nowIso)),
    side("reports", () => reportsSince(office, { sinceIso: weekAgo, side: "support", limit: 200 })),
    side("asks", () => asksSince(office, { sinceIso: weekAgo, limit: 100 })),
    side("support", () => supportDueBook(office, now, overview)),
    seen(office, "requests", () =>
      side("requests", async () => (await consoleRequests(office)).filter((r) => !r.closed_at)),
    ),
    platformPartners(office),
    platformWaitlist(office),
  ]);
  return {
    me: consoleMe(office),
    tenants,
    numbers: consoleNumbersFrom(tenants, spendInAll(spend), readiness?.price ?? null, now),
    claims,
    reports,
    asks,
    support,
    requests,
    partners,
    queue,
    spend,
  };
}

/* ---------------------------------------------------------------------------------------------- one workspace */

interface ConsoleWorkspaceDto {
  me: ConsoleMe;
  tenant: { id: string; slug: string; name: string; status: string; timezone: string; created_at: string };
  row: PlatformTenantDto | null;
  events: Awaited<ReturnType<typeof platformEvents>> | null;
  acts: PlatformActDto[] | null;
  reports: SupportReportDto[] | null;
  asks: SetupAskDto[] | null;
  claim: ClaimDto | null;
}

/**
 * One workspace by its address: its row as Home judges it, what happened in it, what the team did there, what it
 * reported and asked for, and who has it. Its Setup, as its owner sees it, is the back office's read by id
 * (GET platform/tenants/:id, setupDtoFor), which its Setup and lines tab asks for.
 */
export async function consoleWorkspace(office: BackOffice, slug: string): Promise<ConsoleWorkspaceDto> {
  const found = await tenantBySlug(office.db, slug);
  if (found.error) throw new Error(found.error.message);
  const tenant = found.data;
  if (!tenant) throw new AppError("not_found", CONSOLE_WORDS.noSuchWorkspace, 404);
  const nowIso = new Date().toISOString();
  const monthAgo = new Date(Date.now() - 30 * DAY_MS).toISOString();
  const [rows, events, acts, reports, asks, claim] = await Promise.all([
    side("overview", () => platformOverview(office)),
    side("events", () => platformEvents(office, tenant.id)),
    side("acts", () => consoleActs(office, { tenantId: tenant.id })),
    side("reports", () => reportsSince(office, { tenantId: tenant.id, side: "all", limit: 200 })),
    side("asks", () => asksSince(office, { sinceIso: monthAgo, tenantId: tenant.id, limit: 100 })),
    side("claim", async () => (await claimOf(office.db, tenant.id, nowIso)).data ?? null),
  ]);
  return {
    me: consoleMe(office),
    tenant,
    row: rows?.find((r) => r.tenant_id === tenant.id) ?? null,
    events,
    acts,
    reports,
    asks,
    claim,
  };
}

/* --------------------------------------------------------------------------------------------------------- Find */

/** One box over every workspace. On the session client: the function asks is_platform_admin() itself. */
export async function consoleFind(office: BackOffice, q: string): Promise<FindRowDto[]> {
  const { data, error } = await findAcross(office.session, q);
  if (error) {
    if (error.code === "42501") throw new AppError("not_found", "No such page.", 404);
    throw new AppError("internal", "Find could not search just now. Try again in a moment.", 503);
  }
  return (data ?? [])
    .filter((r): r is typeof r & { kind: FindRowDto["kind"] } => (FIND_KINDS as readonly string[]).includes(r.kind))
    .slice(0, FIND_LIMITS.rows)
    .map((r) => ({
      kind: r.kind,
      tenant_id: r.tenant_id,
      slug: r.slug,
      name: r.name,
      label: r.label,
      detail: r.detail,
    }));
}
