/**
 * Lines for the dashboard: the rows a member may read (RLS, no provider
 * ids), and the edge's verbs — status, search, buy, retry — behind the
 * diagnostic key the dashboard already holds. The provider and every
 * credential live on the edge; nothing here knows a SID.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@chanlytics/db/types";
import { MIN_MS, lineDtoOf, type LineCodeDto, type LineDto, recordOrEmpty, DbFailure } from "@chanlytics/contracts";
import { callEdge, edgeConfigured, type EdgeAnswer, type EdgeBody, type EdgeRead } from "../shared/edge";
import { deployment } from "../shared/env";
import { listLinesForPage } from "@chanlytics/db/lines";
import type { TenantId } from "@chanlytics/contracts";

/** The columns the page may see — the lines_member_select policy scopes the rows. */
/**
 * The workspace's lines, as the page is told of them (contracts lineDtoOf, the edge's verb answers' own builder).
 * `registered` is not said here: it is derived from the brand and campaign SIDs, and no provider id crosses this boundary.
 */
export async function listLines(db: SupabaseClient<Database>, tenantId: TenantId): Promise<LineDto[]> {
  const { data, error } = await listLinesForPage(db, tenantId);
  if (error) throw new DbFailure(error);
  return (data ?? []).map((r) => lineDtoOf(r));
}

/** How long a lines verb waits on the edge unless its caller says: buy, register, retry and the platform's line actions. */
export const EDGE_LINES_TIMEOUT_MS = MIN_MS;

/** One call to the edge's lines endpoint. Never throws: a failure is a status the caller reads. */
export async function callEdgeLines(
  body: EdgeBody<"/api/admin/lines">,
  timeoutMs = EDGE_LINES_TIMEOUT_MS,
): Promise<EdgeAnswer<EdgeRead<"/api/admin/lines">>> {
  if (!edgeConfigured()) return { status: 503, body: { ok: false, error: "no_edge_credential" } };
  // The deployment gate every other provider door keeps (billing.ts, google.ts,
  // whatsapp.ts). This one did not, and EDGE_URL defaults to the production
  // edge: a preview holding the edge secret bought a real number on the master
  // account ($1.15/month) and filed a real carrier registration ($19.50,
  // non-refundable) from a Get a line click that was only ever meant to be
  // clicked on a preview.
  //
  // `record` is the exception, because the gate is about PROVIDERS and that op
  // reaches none: it normalises the business on record and upserts one row. It
  // was caught by the first version of this gate, which made Setup's business
  // form unusable on every preview and laptop — refusing a save that would
  // have worked, with "try again in a moment" about a state that never
  // resolves. `status` stays gated deliberately: a deployment that may not buy
  // should report itself not ready, which is what Setup already says well.
  if (!deployment.providersLive && body.op !== "record") return { status: 503, body: { ok: false, error: "preview" } };
  return callEdge("/api/admin/lines", body, {
    workspace: typeof body.tenant_id === "string" ? body.tenant_id : null,
    user: typeof body.user_id === "string" ? body.user_id : null,
    timeoutMs,
  });
}

interface LinesStatus {
  ready: boolean;
  provider: string | null;
  costs: { local_number_month_usd: number; toll_free_month_usd: number };
}

const DEFAULT_COSTS = { local_number_month_usd: 1.15, toll_free_month_usd: 2.15 };
let statusCache: { at: number; value: LinesStatus } | null = null;
const STATUS_TTL_MS = 5 * MIN_MS;
/** A "not ready" answer is remembered briefly: a slow edge or a credential set a minute ago must not hide "Get a line" for five. */
const STATUS_NOT_READY_TTL_MS = 30_000;

/**
 * May this deployment get lines, and with which provider. Cached for five
 * minutes per lambda: the answer changes when an operator sets a credential,
 * not between two page loads. Unreachable edge → not ready, so the page keeps
 * "we set it up with you" rather than a verb that cannot work.
 */
export async function getLinesStatus(now = Date.now()): Promise<LinesStatus> {
  if (statusCache && now - statusCache.at < (statusCache.value.ready ? STATUS_TTL_MS : STATUS_NOT_READY_TTL_MS))
    return statusCache.value;
  const answer = await callEdgeLines({ op: "status" }, 4_000);
  const body = answer.body ?? {};
  const costs = body.costs ? { ...DEFAULT_COSTS, ...body.costs } : DEFAULT_COSTS;
  const value: LinesStatus =
    answer.status === 200 && body.ok === true
      ? { ready: body.ready === true, provider: typeof body.provider === "string" ? body.provider : null, costs }
      : { ready: false, provider: null, costs };
  statusCache = { at: now, value };
  return value;
}

/** How long a read of the codes waits on the edge, which waits on the provider's list: the page asks again in three seconds. */
const LINE_CODES_TIMEOUT_MS = 12_000;

/** A code as the edge answered it, in the shape the page holds, or nothing: what is not a code is dropped and never mended. */
function lineCodeOf(c: unknown): LineCodeDto | null {
  if (c === null || typeof c !== "object") return null;
  const { code, from, at } = recordOrEmpty(c);
  return typeof code === "string" && typeof at === "string"
    ? { code, from: typeof from === "string" ? from : null, at }
    : null;
}

/**
 * The one-time codes texted to the workspace's own line lately (GET lines/codes), read by the edge from the provider's own record
 * and never kept here. A deployment that reaches no providers (a preview) has none to read, which is no failure; a read that
 * failed is said (`ok: false`), for the route to refuse in words, never an empty list that reads as nobody writing.
 */
export async function getLineCodes(
  tenantId: TenantId,
  userId: string,
): Promise<{ ok: true; codes: LineCodeDto[] } | { ok: false }> {
  if (!edgeConfigured() || !deployment.providersLive) return { ok: true, codes: [] };
  const answer = await callEdge("/api/admin/lines/codes", null, {
    workspace: tenantId,
    user: userId,
    method: "GET",
    timeoutMs: LINE_CODES_TIMEOUT_MS,
  });
  const raw = answer.body?.codes;
  if (answer.status !== 200 || answer.body?.ok !== true || !Array.isArray(raw)) return { ok: false };
  return { ok: true, codes: raw.map(lineCodeOf).filter((c): c is LineCodeDto => c !== null) };
}
