/**
 * Lines for the dashboard: the rows a member may read (RLS, no provider
 * ids), and the edge's verbs — status, search, buy, retry — behind the
 * diagnostic key the dashboard already holds. The provider and every
 * credential live on the edge; nothing here knows a SID.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@chanlytics/db";
import type { LineDto } from "@chanlytics/contracts";
import { callEdge, edgeConfigured, type EdgeAnswer } from "../edge";
import { deployment } from "../env";
import { MIN_MS } from "@chanlytics/contracts";

/** The columns the page may see — the lines_member_select policy scopes the rows. */
const LINE_COLUMNS =
  "id, e164, kind, provider, area_code, voice_state, sms_state, reg_step, reg_mock, reg_sole_prop, whatsapp_state, port_state, forwarding_state, step, last_error, state_since, created_at, facts";

/** A forwarded line's facts, in words only — never a provider id from a provisioned line's facts. */
function forwardingOf(kind: string, facts: unknown): LineDto["forwarding"] {
  if (kind !== "forwarded" || !facts || typeof facts !== "object" || Array.isArray(facts)) return null;
  const f = facts as Record<string, unknown>;
  const str = (k: string) => (typeof f[k] === "string" ? f[k] : null);
  return {
    carrier: str("carrier") ?? "other",
    mode: str("mode") ?? "unanswered",
    destination_e164: str("destination_e164"),
    test_from: str("test_from"),
    test_until: str("test_until"),
    verified_at: str("verified_at"),
  };
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

/** How long a lines verb waits on the edge unless its caller says: buy, register, retry and the platform's line actions. */
export const EDGE_LINES_TIMEOUT_MS = MIN_MS;

/** One call to the edge's lines endpoint. Never throws: a failure is a status the caller reads. */
export async function edgeLines(body: Record<string, unknown>, timeoutMs = EDGE_LINES_TIMEOUT_MS): Promise<EdgeAnswer> {
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
export async function linesStatus(now = Date.now()): Promise<LinesStatus> {
  if (statusCache && now - statusCache.at < (statusCache.value.ready ? STATUS_TTL_MS : STATUS_NOT_READY_TTL_MS))
    return statusCache.value;
  const a = await edgeLines({ op: "status" }, 4_000);
  const b = a.body ?? {};
  const costs =
    b.costs && typeof b.costs === "object"
      ? { ...DEFAULT_COSTS, ...(b.costs as Partial<typeof DEFAULT_COSTS>) }
      : DEFAULT_COSTS;
  const value: LinesStatus =
    a.status === 200 && b.ok === true
      ? { ready: b.ready === true, provider: typeof b.provider === "string" ? b.provider : null, costs }
      : { ready: false, provider: null, costs };
  statusCache = { at: now, value };
  return value;
}
