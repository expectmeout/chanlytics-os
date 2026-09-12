/**
 * Lines for the dashboard: the rows a member may read (RLS, no provider
 * ids), and the edge's verbs — status, search, buy, retry — behind the
 * diagnostic key the dashboard already holds. The provider and every
 * credential live on the edge; nothing here knows a SID.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@chanlytics/db";
import type { LineDto } from "@chanlytics/contracts";
import { edgeConfigured, edgeHeaders, edgeUrl } from "./edge";

/** The columns the page may see — the lines_member_select policy scopes the rows. */
export const LINE_COLUMNS = "id, e164, kind, provider, area_code, voice_state, sms_state, reg_step, reg_mock, reg_sole_prop, whatsapp_state, port_state, forwarding_state, step, last_error, state_since, created_at, facts";

/** A forwarded line's facts, in words only — never a provider id from a provisioned line's facts. */
function forwardingOf(kind: string, facts: unknown): LineDto["forwarding"] {
  if (kind !== "forwarded" || !facts || typeof facts !== "object" || Array.isArray(facts)) return null;
  const f = facts as Record<string, unknown>;
  const str = (k: string) => (typeof f[k] === "string" ? (f[k] as string) : null);
  return { carrier: str("carrier") ?? "other", mode: str("mode") ?? "unanswered", destination_e164: str("destination_e164"), test_from: str("test_from"), test_until: str("test_until"), verified_at: str("verified_at") };
}

export async function linesFor(db: SupabaseClient<Database>, tenantId: string): Promise<LineDto[]> {
  const { data, error } = await db.from("lines").select(LINE_COLUMNS).eq("tenant_id", tenantId).order("created_at");
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: r.id,
    e164: r.e164,
    kind: r.kind,
    provider: r.provider,
    area_code: r.area_code,
    voice_state: r.voice_state as LineDto["voice_state"],
    sms_state: r.sms_state,
    // The registration, in words the page may hold. `registered` is NOT set
    // here: it is derived from the brand and campaign SIDs, and no provider id
    // crosses this boundary -- so anything the page decides must be decidable
    // from reg_mock, reg_sole_prop and sms_state alone.
    reg_step: r.reg_step,
    reg_mock: r.reg_mock,
    reg_sole_prop: r.reg_sole_prop,
    whatsapp_state: r.whatsapp_state,
    port_state: r.port_state,
    forwarding_state: r.forwarding_state,
    step: r.step,
    last_error: r.last_error,
    state_since: r.state_since,
    created_at: r.created_at,
    forwarding: r.kind === "forwarded" ? forwardingOf(r.kind, r.facts) : null,
  }));
}

export interface EdgeAnswer {
  status: number;
  body: Record<string, unknown> | null;
}

/** One call to the edge's lines endpoint. Never throws: a failure is a status the caller reads. */
export async function edgeLines(body: Record<string, unknown>, timeoutMs = 60_000): Promise<EdgeAnswer> {
  if (!edgeConfigured()) return { status: 503, body: { ok: false, error: "no_edge_credential" } };
  try {
    const r = await fetch(`${edgeUrl()}/api/admin/lines`, {
      method: "POST",
      headers: edgeHeaders("/api/admin/lines", { workspace: typeof body.tenant_id === "string" ? body.tenant_id : null }),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const parsed = (await r.json().catch(() => null)) as unknown;
    return { status: r.status, body: parsed !== null && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null };
  } catch (e) {
    return { status: 503, body: { ok: false, error: e instanceof Error ? e.message : String(e) } };
  }
}

export interface LinesStatus {
  ready: boolean;
  provider: string | null;
  costs: { local_number_month_usd: number; toll_free_month_usd: number };
}

const DEFAULT_COSTS = { local_number_month_usd: 1.15, toll_free_month_usd: 2.15 };
let statusCache: { at: number; value: LinesStatus } | null = null;
const STATUS_TTL_MS = 5 * 60_000;
/** A "not ready" answer is remembered briefly: a slow edge or a credential set a minute ago must not hide "Get a line" for five. */
const STATUS_NOT_READY_TTL_MS = 30_000;

/**
 * May this deployment get lines, and with which provider. Cached for five
 * minutes per lambda: the answer changes when an operator sets a credential,
 * not between two page loads. Unreachable edge → not ready, so the page keeps
 * "we set it up with you" rather than a verb that cannot work.
 */
export async function linesStatus(now = Date.now()): Promise<LinesStatus> {
  if (statusCache && now - statusCache.at < (statusCache.value.ready ? STATUS_TTL_MS : STATUS_NOT_READY_TTL_MS)) return statusCache.value;
  const a = await edgeLines({ op: "status" }, 4_000);
  const b = a.body ?? {};
  const costs = b.costs && typeof b.costs === "object" ? { ...DEFAULT_COSTS, ...(b.costs as Partial<typeof DEFAULT_COSTS>) } : DEFAULT_COSTS;
  const value: LinesStatus = a.status === 200 && b.ok === true
    ? { ready: b.ready === true, provider: typeof b.provider === "string" ? b.provider : null, costs }
    : { ready: false, provider: null, costs };
  statusCache = { at: now, value };
  return value;
}

/** For tests and for a route that must not read a stale answer. */
export function forgetLinesStatus(): void {
  statusCache = null;
}
