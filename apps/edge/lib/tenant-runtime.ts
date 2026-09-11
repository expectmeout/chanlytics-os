/**
 * The one door between the runtime and the control plane (PRD §03).
 *
 * Everything the bot needs to act for a tenant — persona, policy, credentials,
 * alert recipients — loads here, in one batched round trip, cached per lambda
 * instance and re-checked against one freshness stamp per message, so a
 * setting saved on the dashboard reaches the receptionist on the very next
 * message. The edge never queries the control-plane tables anywhere else, so
 * "what does the runtime consult?" has exactly one answer.
 */
import type { CalendarConfig, FeaturesConfig } from "./workspace/contracts.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./workspace/db.js";
import {
  parseTenantConfigResult,
  type BrainConfig,
  type NotificationsConfig,
  type PolicyLimits,
  type KnownFacts,
} from "./workspace/contracts.js";
import type { RoutedChannel } from "./workspace/db.js";

export interface TenantRuntime {
  tenantId: string;
  /** null = this tenant's receptionist does not speak (unconfigured persona —
   *  persist + escalate only; silence over someone else's voice). */
  brain: BrainConfig | null;
  notifications: NotificationsConfig | null;
  /** The calendar the receptionist may read for open times; null = none set. */
  calendar: CalendarConfig | null;
  /** Opt-in abilities (features.vision, …); null = none set. */
  features: FeaturesConfig | null;
  /** Workspace-level policy modes, class → mode. Unexpected/missing → 'ask'. */
  policy: Record<string, { mode: string; limits: PolicyLimits }>;
  /** Per-tenant WhatsApp credentials from Vault; null = the channel carries none, or the vault did not answer. */
  waCreds: { accessToken: string; phoneId: string } | null;
  /**
   * This workspace's WhatsApp number IS the environment's own pilot line
   * (WHATSAPP_PHONE_ID), so the environment pair is its credentials and
   * nobody else's. The only case in which the env pair may send.
   */
  envNumber: boolean;
  /**
   * IANA zone from `tenants.timezone` — the SAME column the metrics RPCs and
   * the Today surface read. A receptionist that states opening hours needs to
   * know which clock they are on, and a second copy of that on the business
   * profile is how the dashboard and the bot start disagreeing about what day
   * it is. null only when the row could not be read.
   */
  timezone: string | null;
  /**
   * tenants.status = 'paused', written by billing for a workspace whose
   * subscription stopped. Messages are kept and held for a person; nothing
   * is answered and nothing automated goes out until it resumes.
   */
  paused: boolean;
  /**
   * What the platform KNOWS, as opposed to what somebody typed: the channel
   * rows it provisioned and the Google listing it verified.
   *
   * Carried on the runtime because the prompt is where these facts are spoken
   * and the prompt is composed from here. Without it, resolveSystemPrompt
   * resolves against nothing and the receptionist can go on telling customers
   * to call a number it does not answer — which is what it was doing on the
   * live salon (see contracts/facts.ts).
   */
  known: KnownFacts;
  /** True when the control plane could not be read (infra blip, not config
   *  absence) — the caller may apply its designated DR fallback. */
  loadFailed: boolean;
  /** The config row EXISTS but does not parse. Distinct from an absent
   *  profile: the receptionist is silent either way, but this one is a
   *  mistake somebody can fix, and the escalation should say so. */
  configBroken?: boolean;
}

/** The backstop for what the stamp does not see: credentials in Vault, a channel row. */
const TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { v: TenantRuntime; exp: number; stamp: string | null }>();

/**
 * "Did anything the runtime is built from change?" — the config's version,
 * the newest policy row, the tenant row, as one text from one door. null when
 * the door did not answer: the caller keeps what it has rather than reloading
 * on every blip.
 */
async function runtimeStamp(db: SupabaseClient<Database>, tenantId: string): Promise<string | null> {
  const { data, error } = await db.rpc("runtime_stamp", { p_tenant_id: tenantId });
  if (error) {
    console.error("runtime_stamp_failed", JSON.stringify({ tenant: tenantId, error: error.message }));
    return null;
  }
  return typeof data === "string" ? data : "";
}

/** Whether a WhatsApp channel's provider id is the environment's own pilot line. */
function isEnvNumber(externalId: string | null | undefined): boolean {
  const env = process.env.WHATSAPP_PHONE_ID || "";
  return !!env && externalId === env;
}

/** The environment pair, when both halves exist. */
function envPair(): { phoneId: string; accessToken: string } | null {
  const phoneId = process.env.WHATSAPP_PHONE_ID || "";
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN || "";
  return phoneId && accessToken ? { phoneId, accessToken } : null;
}

/**
 * This tenant's WhatsApp credentials, whichever channel is asking.
 *
 * Resolved by tenant and kind rather than by the routed channel: a phone call
 * routes on the voice channel, whose credentials_ref is null, and the result
 * is cached under the tenant id alone, so the WhatsApp row is the one that
 * answers for every caller.
 *
 * REFUSES RATHER THAN FALLS BACK. This returned null on a vault error and the
 * caller then used the environment pair, so a lookup blip sent one business's
 * reply from another business's number on another business's token. A tenant
 * whose credentials cannot be read gets none, and the send fails where a
 * person is told. The one exception is stated as a fact, not a fallback: the
 * tenant whose channel row carries the environment's own phone_number_id.
 */
async function resolveWaCredentials(
  db: SupabaseClient<Database>,
  routed: RoutedChannel,
): Promise<{ creds: { accessToken: string; phoneId: string } | null; envNumber: boolean }> {
  let channelId: string | null = null;
  let ref: string | null = null;
  let externalId: string | null = null;
  if (routed.kind === "whatsapp") {
    channelId = routed.channelId;
    ref = routed.credentialsRef ?? null;
    externalId = routed.externalId;
  } else {
    const { data } = await db
      .from("tenant_channels")
      .select("id, credentials_ref, external_id")
      .eq("tenant_id", routed.tenantId)
      .eq("kind", "whatsapp")
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    channelId = data?.id ?? null;
    ref = data?.credentials_ref ?? null;
    externalId = data?.external_id ?? null;
  }
  const envNumber = isEnvNumber(externalId);
  if (!channelId || !ref) return { creds: null, envNumber };
  const { data, error } = await db.rpc("get_channel_credentials", { p_channel_id: channelId });
  if (error) {
    console.error("wa_credentials_lookup_failed", routed.tenantId, error.message);
    return { creds: null, envNumber };
  }
  const c = data as { access_token?: string; phone_id?: string } | null;
  return {
    creds: c?.access_token && c?.phone_id ? { accessToken: c.access_token, phoneId: c.phone_id } : null,
    envNumber,
  };
}

export async function loadTenantRuntime(
  db: SupabaseClient<Database>,
  routed: RoutedChannel,
): Promise<TenantRuntime> {
  const hit = cache.get(routed.tenantId);
  if (hit && hit.exp > Date.now()) {
    // Fresh while the stamp agrees. A setting saved on the dashboard is a new
    // stamp, so it reaches the receptionist on this message, not in a minute.
    const stamp = await runtimeStamp(db, routed.tenantId);
    if (stamp === null || stamp === hit.stamp) return hit.v;
  }

  try {
    const [cfgQ, polQ, credsQ, tzQ, stamp, chanQ, listQ] = await Promise.all([
      db.from("tenant_config").select("config").eq("tenant_id", routed.tenantId).maybeSingle(),
      db
        .from("policies")
        .select("class, mode, limits")
        .eq("tenant_id", routed.tenantId)
        .is("subject_type", null),
      // WhatsApp credentials belong to the tenant's WHATSAPP channel, not to
      // whichever channel happened to route this request.
      //
      // This asked for the ROUTED channel's credentials, which is only ever
      // correct when the request arrived over WhatsApp. A phone call routes on
      // the voice channel, whose credentials_ref is null, so retell-fn could
      // never send with a tenant's own WhatsApp credentials and silently fell
      // back to the environment's. Worse, the result is cached under the
      // tenant id alone — so what a WhatsApp webhook got back depended on which
      // endpoint had most recently warmed that instance.
      //
      // Resolving by tenant + kind makes the tenant-keyed cache correct by
      // construction and closes the voice path in the same change.
      resolveWaCredentials(db, routed),
      db.from("tenants").select("name, timezone, status").eq("id", routed.tenantId).maybeSingle(),
      // Taken with the load, so the first re-check compares like with like.
      runtimeStamp(db, routed.tenantId),
      // What the platform provisioned and what Google verified — the other half
      // of every fact the prompt states. Two small reads on a load that already
      // makes five, cached for the same ten minutes behind the same stamp.
      db.from("tenant_channels").select("kind, number_e164, status").eq("tenant_id", routed.tenantId),
      db.from("google_listings").select("name, address").eq("tenant_id", routed.tenantId).maybeSingle(),
    ]);
    if (cfgQ.error) throw new Error(cfgQ.error.message);
    if (polQ.error) throw new Error(polQ.error.message);
    // No check here on purpose: resolveWaCredentials handles its own failure
    // by logging and falling back to the environment. Throwing would put the
    // whole runtime into its DR posture — silencing a tenant that does not use
    // per-channel credentials at all — over a lookup it never needed.
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
    const rt: TenantRuntime = {
      tenantId: routed.tenantId,
      brain: parsed?.brain ?? null,
      notifications: parsed?.notifications ?? null,
      calendar: parsed?.calendar ?? null,
      features: parsed?.features ?? null,
      policy,
      waCreds: credsQ.creds,
      envNumber: credsQ.envNumber,
      timezone: tzQ.data?.timezone ?? null,
      // Deliberately not thrown on. A channel list that failed to read leaves
      // the prompt exactly where it was before this existed — typed values,
      // unresolved — which is degraded, not silent. Throwing would put the
      // whole runtime into its DR posture over a fact it can live without.
      known: {
        workspace: { name: tzQ.data?.name ?? null, timezone: tzQ.data?.timezone ?? null },
        channels: chanQ.error ? [] : (chanQ.data ?? []),
        listing: listQ.error ? null : (listQ.data ?? null),
      },
      paused: tzQ.data?.status === "paused",
      configBroken: !parseResult.ok,
      loadFailed: false,
    };
    cache.set(routed.tenantId, { v: rt, exp: Date.now() + TTL_MS, stamp });
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
      calendar: null,
      features: null,
      policy: {},
      waCreds: null,
      // What the routed row itself says; nothing else could be read.
      envNumber: routed.kind === "whatsapp" && isEnvNumber(routed.externalId),
      timezone: null,
      known: { workspace: null, channels: [], listing: null },
      paused: false,
      loadFailed: true,
    };
  }
}

/**
 * A tenant's WhatsApp credentials, for callers holding a tenant_id and no
 * routed channel -- the job runner and the template doors.
 *
 * Null means NO credentials, and the caller must refuse: the environment pair
 * is handed out only to the tenant whose channel row carries the environment's
 * own phone_number_id. A vault error is a refusal too, said in the log; a
 * fallback here is how a second business's reply left from the first one's
 * number.
 */
export async function waCredentialsForTenant(
  db: SupabaseClient<Database>,
  tenantId: string,
): Promise<{ phoneId: string; accessToken: string } | null> {
  try {
    const { data: ch, error: chErr } = await db
      .from("tenant_channels")
      .select("id, credentials_ref, external_id")
      .eq("tenant_id", tenantId)
      .eq("kind", "whatsapp")
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    if (chErr) {
      console.error("wa_credentials_channel_unreadable", tenantId, chErr.message);
      return null;
    }
    if (!ch) return null;
    if (ch.credentials_ref) {
      const { data, error } = await db.rpc("get_channel_credentials", { p_channel_id: ch.id });
      if (error) {
        console.error("wa_credentials_for_tenant_failed", tenantId, error.message);
        return null;
      }
      const c = data as { access_token?: string; phone_id?: string } | null;
      return c?.access_token && c?.phone_id ? { phoneId: c.phone_id, accessToken: c.access_token } : null;
    }
    return isEnvNumber(ch.external_id) ? envPair() : null;
  } catch (e) {
    console.error("wa_credentials_for_tenant_threw", tenantId, e instanceof Error ? e.message : e);
    return null;
  }
}

/**
 * The credentials a send on behalf of this runtime uses, or null: never a
 * guess. `arrivedOnEnvNumber` is the webhook's own knowledge that the message
 * came in on the environment's pilot line, which is the one case where the
 * environment pair is right even when the control plane could not be read.
 */
export function waCfgFor(
  rt?: TenantRuntime | null,
  arrivedOnEnvNumber = false,
): { phoneId: string; accessToken: string } | null {
  if (rt?.waCreds) return { phoneId: rt.waCreds.phoneId, accessToken: rt.waCreds.accessToken };
  if (rt?.envNumber || arrivedOnEnvNumber) return envPair();
  return null;
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
