/**
 * The one door between the runtime and the control plane (PRD §03).
 *
 * Everything the bot needs to act for a tenant — persona, policy, credentials,
 * alert recipients — loads here, in one batched round trip, cached briefly per
 * lambda instance. The edge never queries the control-plane tables anywhere
 * else, so "what does the runtime consult?" has exactly one answer.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./workspace/db.js";
import {
  parseTenantConfig,
  type BrainConfig,
  type NotificationsConfig,
  type PolicyLimits,
} from "./workspace/contracts.js";
import type { RoutedChannel } from "./workspace/db.js";

export interface TenantRuntime {
  tenantId: string;
  /** null = this tenant's receptionist does not speak (unconfigured persona —
   *  persist + escalate only; silence over someone else's voice). */
  brain: BrainConfig | null;
  notifications: NotificationsConfig | null;
  /** Workspace-level policy modes, class → mode. Unexpected/missing → 'ask'. */
  policy: Record<string, { mode: string; limits: PolicyLimits }>;
  /** Per-tenant WhatsApp credentials from Vault; null = global env fallback. */
  waCreds: { accessToken: string; phoneId: string } | null;
  /** True when the control plane could not be read (infra blip, not config
   *  absence) — the caller may apply its designated DR fallback. */
  loadFailed: boolean;
}

const TTL_MS = 60 * 1000;
const cache = new Map<string, { v: TenantRuntime; exp: number }>();

export async function loadTenantRuntime(
  db: SupabaseClient<Database>,
  routed: RoutedChannel,
): Promise<TenantRuntime> {
  const hit = cache.get(routed.tenantId);
  if (hit && hit.exp > Date.now()) return hit.v;

  try {
    const [cfgQ, polQ, credsQ] = await Promise.all([
      db.from("tenant_config").select("config").eq("tenant_id", routed.tenantId).maybeSingle(),
      db
        .from("policies")
        .select("class, mode, limits")
        .eq("tenant_id", routed.tenantId)
        .is("subject_type", null),
      routed.credentialsRef
        ? db.rpc("get_channel_credentials", { p_channel_id: routed.channelId })
        : Promise.resolve({ data: null, error: null } as const),
    ]);
    if (cfgQ.error) throw new Error(cfgQ.error.message);
    if (polQ.error) throw new Error(polQ.error.message);
    if (credsQ.error) throw new Error(credsQ.error.message);

    const parsed = parseTenantConfig(cfgQ.data?.config);
    const policy: TenantRuntime["policy"] = {};
    for (const p of polQ.data ?? []) {
      policy[p.class] = { mode: p.mode, limits: (p.limits ?? {}) as PolicyLimits };
    }
    const rawCreds = credsQ.data as { access_token?: string; phone_id?: string } | null;
    const rt: TenantRuntime = {
      tenantId: routed.tenantId,
      brain: parsed?.brain ?? null,
      notifications: parsed?.notifications ?? null,
      policy,
      waCreds:
        rawCreds?.access_token && rawCreds?.phone_id
          ? { accessToken: rawCreds.access_token, phoneId: rawCreds.phone_id }
          : null,
      loadFailed: false,
    };
    cache.set(routed.tenantId, { v: rt, exp: Date.now() + TTL_MS });
    return rt;
  } catch (e) {
    console.error("tenant_runtime_load_failed", e instanceof Error ? e.message : e);
    // Never cache a failure — the next message retries. loadFailed lets the
    // designated default tenant fall back to its baked profile (DR), while
    // every other tenant fails safe into silence.
    return {
      tenantId: routed.tenantId,
      brain: null,
      notifications: null,
      policy: {},
      waCreds: null,
      loadFailed: true,
    };
  }
}

/**
 * The WhatsApp credentials to send this tenant's messages with.
 *
 * Per-tenant Vault credentials when the channel carries a ref; the env pair is
 * the fallback for the tenant that predates the control plane (rollback =
 * delete the ref). This lived inside the WhatsApp webhook as a private helper
 * while a second send path — the voice agent's booking-link function — reached
 * straight for `process.env`, which is how that path came to send every
 * tenant's message from tenant #1's number.
 */
export function waCfgFor(rt?: TenantRuntime | null): { phoneId: string; accessToken: string } {
  if (rt?.waCreds) return { phoneId: rt.waCreds.phoneId, accessToken: rt.waCreds.accessToken };
  return {
    phoneId: process.env.WHATSAPP_PHONE_ID || "",
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN || "",
  };
}
