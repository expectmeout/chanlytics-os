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
  parseTenantConfigResult,
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
  /**
   * IANA zone from `tenants.timezone` — the SAME column the metrics RPCs and
   * the Today surface read. A receptionist that states opening hours needs to
   * know which clock they are on, and a second copy of that on the business
   * profile is how the dashboard and the bot start disagreeing about what day
   * it is. null only when the row could not be read.
   */
  timezone: string | null;
  /** True when the control plane could not be read (infra blip, not config
   *  absence) — the caller may apply its designated DR fallback. */
  loadFailed: boolean;
  /** The config row EXISTS but does not parse. Distinct from an absent
   *  profile: the receptionist is silent either way, but this one is a
   *  mistake somebody can fix, and the escalation should say so. */
  configBroken?: boolean;
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
    const [cfgQ, polQ, credsQ, tzQ] = await Promise.all([
      db.from("tenant_config").select("config").eq("tenant_id", routed.tenantId).maybeSingle(),
      db
        .from("policies")
        .select("class, mode, limits")
        .eq("tenant_id", routed.tenantId)
        .is("subject_type", null),
      routed.credentialsRef
        ? db.rpc("get_channel_credentials", { p_channel_id: routed.channelId })
        : Promise.resolve({ data: null, error: null } as const),
      db.from("tenants").select("timezone").eq("id", routed.tenantId).maybeSingle(),
    ]);
    if (cfgQ.error) throw new Error(cfgQ.error.message);
    if (polQ.error) throw new Error(polQ.error.message);
    if (credsQ.error) throw new Error(credsQ.error.message);
    if (tzQ.error) throw new Error(tzQ.error.message);

    // A BROKEN config is not an ABSENT one. Both end in silence, but only one
    // is somebody's mistake, and reporting "no brain profile configured" while
    // a good persona sits behind one bad field sends the operator to the wrong
    // place. The offending path is named in the log.
    const parseResult = parseTenantConfigResult(cfgQ.data?.config);
    if (!parseResult.ok) {
      console.error("tenant_config_parse_failed", JSON.stringify({
        tenant: routed.tenantId, issues: parseResult.issues.slice(0, 5),
      }));
    }
    const parsed = parseResult.ok ? parseResult.config : null;
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
      timezone: tzQ.data?.timezone ?? null,
      configBroken: !parseResult.ok,
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
      timezone: null,
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

/**
 * Notification recipients for a tenant known by ID rather than by channel.
 *
 * The job runner has a tenant_id and no routed channel, and it used to fall
 * back to a hardcoded personal address — which with a second tenant delivers
 * one business's failure notice, naming its customer's number, to a different
 * business's owner. This reads the same tenant_config the one door reads, so
 * there is still only one place that knows how a tenant is addressed.
 *
 * `isEnvDefault` is answered by the tenant's own WhatsApp channel matching the
 * env phone id — the same test the webhook makes, asked from the other end.
 */
export async function loadTenantNotifications(
  db: SupabaseClient<Database>,
  tenantId: string,
): Promise<{ notifications: NotificationsConfig | null; isEnvDefault: boolean }> {
  try {
    const [cfgQ, chQ] = await Promise.all([
      db.from("tenant_config").select("config").eq("tenant_id", tenantId).maybeSingle(),
      db
        .from("tenant_channels")
        .select("external_id")
        .eq("tenant_id", tenantId)
        .eq("kind", "whatsapp")
        .maybeSingle(),
    ]);
    if (cfgQ.error) throw new Error(cfgQ.error.message);
    const parsed = parseTenantConfigResult(cfgQ.data?.config);
    const envPhoneId = process.env.WHATSAPP_PHONE_ID || "";
    return {
      notifications: parsed.ok ? (parsed.config.notifications ?? null) : null,
      isEnvDefault: !!envPhoneId && chQ.data?.external_id === envPhoneId,
    };
  } catch (e) {
    console.error("tenant_notifications_load_failed", tenantId, e instanceof Error ? e.message : e);
    // Unknown recipients: notify() will withhold customer content rather than
    // guess a mailbox.
    return { notifications: null, isEnvDefault: false };
  }
}
