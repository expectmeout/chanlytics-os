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
import type { CalendarConfig, FeaturesConfig } from "./packages/contracts.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./packages/db.js";
import {
  parseTenantConfigResult,
  type BrainConfig,
  type NotificationsConfig,
  type PolicyLimits,
  type KnownFacts,
} from "./packages/contracts.js";
import { activeWhatsappNumbers, whatsappLineOf, type RoutedChannel, type WhatsappNumberRow } from "./packages/db.js";
import {
  whatsappSender,
  wireUnavailable,
  WireUnavailableError,
  type CredentialsRead,
  type Sender,
  type WireUnavailable,
} from "./packages/core.js";
import type { SendResult } from "./packages/channels.js";
import { env } from "./env.js";
import { logger, errField } from "./log.js";

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
   *  absence) — the caller holds the thread for a person rather than answering. */
  loadFailed: boolean;
  /** The config row EXISTS but does not parse. Distinct from an absent
   *  profile: the receptionist is silent either way, but this one is a
   *  mistake somebody can fix, and the escalation should say so. */
  configBroken?: boolean;
  /** tenant_config.version the runtime was read at: stamped on every answer's meta (contracts BrainMeta). */
  configVersion?: number | null;
}

/**
 * What the settings row says of itself: whether it failed to parse (a mistake somebody can fix), and its version, which
 * every answer's meta is stamped with (contracts BrainMeta); null when the row has none.
 */
function configState(
  parsed: boolean,
  row: { version?: unknown } | null,
): Pick<TenantRuntime, "configBroken" | "configVersion"> {
  return { configBroken: !parsed, configVersion: typeof row?.version === "number" ? row.version : null };
}

/** The backstop for what the stamp does not see: credentials in Vault, a channel row. */
const TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { v: TenantRuntime; exp: number; stamp: string | null }>();

/**
 * Whose runtime an entry is: the workspace's, and for a request that came in on one of its WhatsApp numbers, that
 * number's, since the credentials it carries are that number's (resolveWaCredentials). Keyed by the workspace alone,
 * a workspace with two active numbers (connecting a second leaves the first active) answered a customer who wrote to
 * one from the other, whichever had warmed the instance first, outside the window Meta keeps for the number they wrote
 * to. Every other request shares the workspace's entry, whose credentials are its oldest active number's.
 */
const cacheKey = (routed: RoutedChannel): string =>
  routed.kind === "whatsapp" ? `${routed.tenantId}/${routed.channelId}` : routed.tenantId;

/**
 * "Did anything the runtime is built from change?" — the config's version,
 * the newest policy row, the tenant row, as one text from one door. null when
 * the door did not answer: the caller keeps what it has rather than reloading
 * on every blip.
 */
async function runtimeStamp(db: SupabaseClient<Database>, tenantId: string): Promise<string | null> {
  const { data, error } = await db.rpc("runtime_stamp", { p_tenant_id: tenantId });
  if (error) {
    logger({ tenant_id: tenantId }).error("runtime_stamp_failed", { error: error.message });
    return null;
  }
  return typeof data === "string" ? data : "";
}

/** Whether a WhatsApp channel's provider id is the environment's own pilot line. */
function isEnvNumber(externalId: string | null | undefined): boolean {
  const envPhoneId = env.WHATSAPP_PHONE_ID || "";
  return !!envPhoneId && externalId === envPhoneId;
}

/** The environment pair, when both halves exist. */
function envPair(): { phoneId: string; accessToken: string } | null {
  const phoneId = env.WHATSAPP_PHONE_ID || "";
  const accessToken = env.WHATSAPP_ACCESS_TOKEN || "";
  return phoneId && accessToken ? { phoneId, accessToken } : null;
}

/**
 * This tenant's WhatsApp credentials, whichever channel is asking.
 *
 * A message that came in on a WhatsApp number is answered on that number's
 * own credentials. Any other request (a phone call routes on the voice
 * channel, whose credentials_ref is null) is resolved by tenant and kind: the
 * oldest active WhatsApp row, the one contracts channelFor and every other
 * reader picks, so a workspace with two active numbers gets the same answer
 * every time rather than whichever row Postgres happened to return first.
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
  let channelId: string | null;
  let ref: string | null;
  let externalId: string | null;
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
      .order("created_at", { ascending: true })
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
    logger().error("wa_credentials_lookup_failed", { tenant_id: routed.tenantId, error: error.message });
    return { creds: null, envNumber };
  }
  const c = data as { access_token?: string; phone_id?: string } | null;
  return {
    creds: c?.access_token && c?.phone_id ? { accessToken: c.access_token, phoneId: c.phone_id } : null,
    envNumber,
  };
}

export async function loadTenantRuntime(db: SupabaseClient<Database>, routed: RoutedChannel): Promise<TenantRuntime> {
  const hit = cache.get(cacheKey(routed));
  if (hit && hit.exp > Date.now()) {
    // Fresh while the stamp agrees. A setting saved on the dashboard is a new
    // stamp, so it reaches the receptionist on this message, not in a minute.
    const stamp = await runtimeStamp(db, routed.tenantId);
    if (stamp === null || stamp === hit.stamp) return hit.v;
  }

  try {
    const [cfgQ, polQ, credsQ, tzQ, stamp, chanQ, listQ] = await Promise.all([
      db.from("tenant_config").select("config, version").eq("tenant_id", routed.tenantId).maybeSingle(),
      db.from("policies").select("class, mode, limits").eq("tenant_id", routed.tenantId).is("subject_type", null),
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
      // Resolving by tenant + kind closed the voice path; a WhatsApp message's
      // own number keys its entry (cacheKey), the oldest active every other's.
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
    // by logging and falling back to the environment. Throwing would mark the
    // whole runtime unreadable — holding every thread of a tenant that does
    // not use per-channel credentials at all — over a lookup it never needed.
    if (tzQ.error) throw new Error(tzQ.error.message);

    // A BROKEN config is not an ABSENT one. Both end in silence, but only one
    // is somebody's mistake, and reporting "no brain profile configured" while
    // a good persona sits behind one bad field sends the operator to the wrong
    // place. The offending path is named in the log.
    const parseResult = parseTenantConfigResult(cfgQ.data?.config);
    if (!parseResult.ok) {
      logger().error("tenant_config_parse_failed", {
        tenant_id: routed.tenantId,
        issues: parseResult.issues.slice(0, 5),
      });
    } else if (parseResult.ignored.length > 0) {
      // Settings this edge has never heard of, written by a newer dashboard: left out, and the receptionist answers
      // with the rest. Said, so a split deploy that does not end is seen before the setting is missed.
      logger().warn("tenant_config_keys_ignored", {
        tenant_id: routed.tenantId,
        keys: parseResult.ignored.slice(0, 8),
      });
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
      // unresolved — which is degraded, not silent. Throwing would mark the
      // whole runtime unreadable over a fact it can live without.
      known: {
        workspace: { name: tzQ.data?.name ?? null, timezone: tzQ.data?.timezone ?? null },
        channels: chanQ.error ? [] : (chanQ.data ?? []),
        listing: listQ.error ? null : (listQ.data ?? null),
      },
      paused: tzQ.data?.status === "paused",
      ...configState(parseResult.ok, cfgQ.data),
      loadFailed: false,
    };
    cache.set(cacheKey(routed), { v: rt, exp: Date.now() + TTL_MS, stamp });
    return rt;
  } catch (e) {
    logger().error("tenant_runtime_load_failed", { tenant_id: routed.tenantId, error: errField(e) });
    // Never cache a failure — the next message retries. loadFailed makes the
    // runtime unusable, so the handler holds the thread for a person: a read
    // that failed is never a persona, for any tenant.
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

/** The read's three answers (core CredentialsRead), for the callers below. */
type WaCredentialsRead = CredentialsRead<{ phoneId: string; accessToken: string }>;

/**
 * A tenant's WhatsApp credentials, for callers holding a tenant_id and no
 * routed channel -- the template doors and the number's own reads; the job
 * runner's wire is built on the same rule (whatsappWireForTenant).
 *
 * ABSENT means NO credentials, and the caller must refuse: the environment
 * pair is handed out only to the tenant whose channel row carries the
 * environment's own phone_number_id; a fallback here is how a second
 * business's reply left from the first one's number. UNAVAILABLE means the
 * read itself FAILED -- the channel row or the vault did not answer -- which is
 * not the same fact: the number may well be connected, and a caller that took
 * it for absent failed a reply for good and sent the owner to reconnect a
 * number that worked. Said in the log either way, under the names alerting
 * greps for; never the environment's pair.
 *
 * With two active numbers, the oldest (contracts channelFor's choice, and the
 * one Connections shows): these callers know no number a customer wrote to,
 * and an unordered read answered with either, send by send.
 */
export async function waCredentialsForTenant(
  db: SupabaseClient<Database>,
  tenantId: string,
): Promise<WaCredentialsRead> {
  const numbers = await numbersOf(db, tenantId);
  if (!Array.isArray(numbers)) return numbers;
  const [oldest] = numbers;
  return oldest ? credentialsOfNumber(db, tenantId, oldest) : { outcome: "absent" };
}

/** The workspace's active WhatsApp numbers, oldest first (packages/db activeWhatsappNumbers), or the read's failure. */
async function numbersOf(
  db: SupabaseClient<Database>,
  tenantId: string,
): Promise<WhatsappNumberRow[] | { outcome: "unavailable"; error: string }> {
  try {
    return await activeWhatsappNumbers(db, tenantId);
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    logger().error("wa_credentials_channel_unreadable", { tenant_id: tenantId, error });
    return { outcome: "unavailable", error };
  }
}

/**
 * One WhatsApp number's credentials, by the rule above: the vault's pair under its reference, the environment's pair
 * for the environment's own number and no other, and a read that failed said as one.
 */
async function credentialsOfNumber(
  db: SupabaseClient<Database>,
  tenantId: string,
  ch: WhatsappNumberRow,
): Promise<WaCredentialsRead> {
  const L = logger();
  try {
    if (ch.credentials_ref) {
      const { data, error } = await db.rpc("get_channel_credentials", { p_channel_id: ch.id });
      if (error) {
        L.error("wa_credentials_for_tenant_failed", { tenant_id: tenantId, error: error.message });
        return { outcome: "unavailable", error: error.message };
      }
      const c = data as { access_token?: string; phone_id?: string } | null;
      return c?.access_token && c?.phone_id
        ? { outcome: "present", credentials: { phoneId: c.phone_id, accessToken: c.access_token } }
        : { outcome: "absent" };
    }
    const pair = isEnvNumber(ch.external_id) ? envPair() : null;
    return pair ? { outcome: "present", credentials: pair } : { outcome: "absent" };
  } catch (e) {
    L.error("wa_credentials_for_tenant_threw", { tenant_id: tenantId, error: errField(e) });
    return { outcome: "unavailable", error: errField(e) };
  }
}

/** What a send meets on a number that carries no credentials: the door's own "no credentials" (core putOnWire). */
const NO_CREDENTIALS: SendResult & { reason: "no_credentials" } = {
  ok: false,
  wamid: null,
  status: 503,
  errorBody: "no_credentials",
  reason: "no_credentials",
};

/**
 * The job runner's WhatsApp wire for one workspace: each send leaves from the number its person last wrote to.
 *
 * A workspace may hold two active numbers (connecting a second leaves the first on), and Meta keeps its 24-hour window
 * per number. The job runner knows no number of its own -- an Inbox reply, a held draft and a broadcast are each sent by
 * a job -- and sent everything from the oldest, so a reply to someone who wrote to the newer one was refused by Meta,
 * or reached them from a number they never wrote to. The thread says which: the line their newest WhatsApp message came
 * in on (packages/db whatsappLineOf), while that number is still active. When nothing says (they never wrote, wrote
 * before lines were kept, or to a number turned off since), the oldest, as waCredentialsForTenant. Each number's
 * credentials are read once for the job, and a workspace with one number reads nothing more than it did.
 *
 * The same answers and the same refusal as the read it is built on: never the environment's pair but for the
 * environment's own number, and a number with none is the door's "no credentials". The oldest number's read is made as
 * the wire is bound, so a vault that does not answer holds the job before anything is claimed (core WireUnavailable). A
 * read that fails at a send -- the thread's line, or the other number's credentials -- throws WireUnavailableError
 * before anything leaves, as the door does for a wire it could not bind: a reply waits for a heartbeat that can read it.
 */
export async function whatsappWireForTenant(
  db: SupabaseClient<Database>,
  tenantId: string,
): Promise<Sender | null | WireUnavailable> {
  const numbers = await numbersOf(db, tenantId);
  if (!Array.isArray(numbers)) return wireUnavailable(numbers.error);
  const [oldest] = numbers;
  if (!oldest) return null;
  const reads = new Map<string, Promise<WaCredentialsRead>>();
  const credentialsOf = (ch: WhatsappNumberRow): Promise<WaCredentialsRead> => {
    const read = reads.get(ch.id) ?? credentialsOfNumber(db, tenantId, ch);
    reads.set(ch.id, read);
    return read;
  };
  const first = await credentialsOf(oldest);
  if (first.outcome === "unavailable") return wireUnavailable(first.error);
  if (numbers.length === 1) return whatsappSender(first.outcome === "present" ? first.credentials : null);
  return async (to, p) => {
    const read = await credentialsOf(await numberWrittenTo(db, tenantId, numbers, oldest, p.conversationId));
    if (read.outcome === "unavailable") throw new WireUnavailableError("whatsapp", read.error);
    const send = whatsappSender(read.outcome === "present" ? read.credentials : null);
    return send ? send(to, p) : { ...NO_CREDENTIALS };
  };
}

/**
 * Which of the workspace's active numbers a thread's person last wrote to; the oldest when nothing says, or the send
 * names no thread. A thread that could not be read is a wire that could not be bound: nothing leaves.
 */
async function numberWrittenTo(
  db: SupabaseClient<Database>,
  tenantId: string,
  numbers: readonly WhatsappNumberRow[],
  oldest: WhatsappNumberRow,
  conversationId: string | undefined,
): Promise<WhatsappNumberRow> {
  if (!conversationId) return oldest;
  try {
    const line = await whatsappLineOf(db, tenantId, conversationId);
    return numbers.find((n) => n.id === line) ?? oldest;
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    logger().error("wa_credentials_channel_unreadable", {
      tenant_id: tenantId,
      conversation_id: conversationId,
      error,
    });
    throw new WireUnavailableError("whatsapp", error);
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
  const L = logger();
  try {
    const [cfgQ, chQ] = await Promise.all([
      db.from("tenant_config").select("config").eq("tenant_id", tenantId).maybeSingle(),
      // Filtered and bounded exactly as the two sibling readers above are.
      // `tenant_channels` has no unique constraint on (tenant_id, kind) and the
      // product ADDS a row rather than replacing one -- a reconnected number
      // leaves the old row behind -- so a bare maybeSingle() is a PostgREST
      // error the moment a workspace has two. That error was not checked
      // either, so it arrived as `chQ.data === null`, which reads as "not the
      // env number": the env-default workspace's own alerts silently became
      // redacted platform notices with the customer's words withheld. Two
      // ACTIVE rows answer with the oldest, as waCredentialsForTenant does.
      db
        .from("tenant_channels")
        .select("external_id")
        .eq("tenant_id", tenantId)
        .eq("kind", "whatsapp")
        .eq("status", "active")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle(),
    ]);
    if (cfgQ.error) throw new Error(cfgQ.error.message);
    const parsed = parseTenantConfigResult(cfgQ.data?.config);
    const envPhoneId = env.WHATSAPP_PHONE_ID || "";
    // A channel we could not read leaves ONE question unanswered -- whether
    // this workspace is the environment's own -- and the recipients are not
    // that question. Throwing here would land in the catch below and withhold
    // the customer's words from a workspace whose mailbox we just read
    // perfectly well, which is the outcome this whole function exists to
    // avoid; `isEnvDefault` simply falls back to its safe answer.
    if (chQ.error)
      L.error("tenant_notifications_channel_unreadable", { tenant_id: tenantId, error: chQ.error.message });
    return {
      notifications: parsed.ok ? (parsed.config.notifications ?? null) : null,
      isEnvDefault: !chQ.error && !!envPhoneId && chQ.data?.external_id === envPhoneId,
    };
  } catch (e) {
    L.error("tenant_notifications_load_failed", { tenant_id: tenantId, error: errField(e) });
    // Unknown recipients: notify() will withhold customer content rather than
    // guess a mailbox.
    return { notifications: null, isEnvDefault: false };
  }
}
