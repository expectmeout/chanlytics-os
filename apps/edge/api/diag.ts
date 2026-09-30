/** Ops diagnostic — env presence, the sweeps, the pager, number drift, the
 *  voice agents, the receptionist's last day
 *  + Meta access-token permanence check (debug_token expires_at).
 *  Auth: x-diag-key header (DIAG_KEY). Internal endpoint — not part of the
 *
 * Cross-workspace: the platform's diagnostic, opened by the platform key only, reports on every workspace.
 *  frozen surface. */
import { createHash } from "node:crypto";
import { json } from "../lib/http.js";
import { authorizeAdmin } from "../lib/admin-auth.js";
import { pg } from "../lib/pg.js";
import { brainSummary } from "../lib/receptionist/budget.js";
import { securitySwitchesHere } from "../lib/security-switches.js";
import type { SweepHealthRow } from "../lib/ops/sweep-health.js";
import { pageStates, untoldPages, type PageRow } from "../lib/ops/page-operator.js";
import {
  getAgent,
  getRetellLlm,
  providerFetch,
  voiceShellDrift,
  agentSettingsDrift,
  type RetellAgentConfig,
  type RetellLlmConfig,
} from "../lib/packages/channels.js";
import { metaAppId } from "../lib/whatsapp/meta-graph.js";
import { env } from "../lib/env.js";
import { edgeFnUrl, unsubscribeOrigin, unsubscribeOriginRejected } from "../lib/dashboard-origin.js";
import { coldReplyDomains } from "../lib/email/email.js";
import { emailDomainOf } from "../lib/packages/contracts.js";

const META_APP_ID = metaAppId();
/** How long the report waits on a provider it reads (Meta's token check): a stuck one used to hold the whole report. */
const DIAG_READ_TIMEOUT_MS = 10_000;

/** A part of the report: the keys it answers, in the order the report shows them. */
type Section = Record<string, unknown>;

/** The report: a key per part, and no `error` of its own (a part that cannot read says so under its own key). */
type Report = { [part: string]: unknown; error?: never };

export async function GET(request: Request): Promise<Response> {
  // Header only. The WhatsApp verify token used to open this door from the
  // query string — a value Meta also carries in its own verification URL,
  // and one that lands in access logs. The platform's door: nothing mints a
  // token for it (the runbook and the golden probe knock with the key), so
  // the key stays its credential on an edge that holds the secret too.
  const auth = await authorizeAdmin(request, "/api/diag", { platformKey: true });
  if (!auth.ok) return auth.response;

  const out: Report = {};
  for (const part of REPORT) Object.assign(out, await part());
  return json(200, out);
}

/**
 * The report, part by part, in the order it shows them. Nothing here runs before the knock is let in. Each part reads
 * what it reports on (the environment, the database, Meta, Retell) and answers its own keys; one that reads the
 * database asks pg() for it itself, and one that cannot read says so in its own line while the report still answers.
 */
const REPORT: (() => Section | Promise<Section>)[] = [
  memoryBackend,
  envPresence,
  securitySwitches,
  coldMailRouting,
  sweepHealth,
  pagerMemory,
  numberDrift,
  waTokenPermanence,
  voiceAgentSettings,
  whatsappGates,
  receptionistDay,
  migrationHead,
];

/**
 * Where the bot's MEMORY comes from. Postgres, and nothing else: the
 * credentials below are what decide whether it can be read at all, and a
 * thread it cannot read is handed to a person.
 */
function memoryBackend(): Section {
  return { memory: "postgres" };
}

/** Which of the edge's variables are set: booleans, never a value. */
function envPresence(): Section {
  return {
    env: {
      database: !!env.SUPABASE_URL && !!env.SUPABASE_SERVICE_ROLE_KEY,
      anthropic: !!env.ANTHROPIC_API_KEY,
      waToken: !!env.WHATSAPP_ACCESS_TOKEN,
      resend: !!env.RESEND_API_KEY,
      metaSecret: !!env.META_APP_SECRET,
      retellKey: !!env.RETELL_API_KEY,
      diagKey: !!env.DIAG_KEY,
      // Email's switches: the mail domain, the platform account's receipts, cold email's account and receipts, and
      // the key its unsubscribe links are sealed under. Cold routes open only with both of the account and its
      // receipts (email.ts), so a pair that disagrees is the thing to see.
      emailDomain: !!env.EMAIL_DOMAIN,
      resendWebhook: !!env.RESEND_WEBHOOK_SECRET,
      resendCold: !!env.RESEND_COLD_API_KEY,
      resendColdWebhook: !!env.RESEND_COLD_WEBHOOK_SECRET,
      unsubscribe: !!env.UNSUBSCRIBE_SECRET,
    },
  };
}

/** Which weaker modes are open on this deployment, and the day each must be gone (contracts ai/flags.ts). */
function securitySwitches(): Section {
  return { securitySwitches: securitySwitchesHere() };
}

/**
 * Where cold email's links and replies go (D17), as the edge reads them: values, not presence, since neither is a
 * secret and a value set and ignored (not an origin, not a domain) is the thing to see.
 */
function coldMailRouting(): Section {
  return {
    coldMail: {
      unsubscribeOrigin: unsubscribeOrigin(),
      unsubscribeOriginRejected: unsubscribeOriginRejected(),
      coldReplyDomains: coldReplyDomains(),
      coldReplyDomainRejected: !!env.COLD_REPLY_DOMAIN && !emailDomainOf(env.COLD_REPLY_DOMAIN),
    },
  };
}

/**
 * Is the watchdog itself alive? pg_cron marks a sweep 'succeeded' the moment
 * net.http_post queues the request, so the run history cannot answer this —
 * only the edge's real reply can, and pg_net keeps that for six hours. This
 * is also the only place the HEALTH sweep's own last response is judged: the
 * health route cannot judge it, because when it runs that request is still
 * in flight.
 */
async function sweepHealth(): Promise<Section> {
  try {
    const db = pg();
    if (!db) return { sweeps: { unavailable: "no database client (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)" } };
    const { data, error } = await db.rpc("sweep_health");
    if (error) return { sweeps: { error: error.message.slice(0, 200) } };
    const rows = (data ?? []) as unknown as SweepHealthRow[];
    const sweeps = { ok: rows.every((r) => r.healthy), detail: rows };
    // Due work nobody has claimed: the honest measure of whether the heartbeat drains.
    const { data: backlog } = await db.rpc("jobs_backlog");
    return { sweeps, jobs_backlog: typeof backlog === "number" ? backlog : null };
  } catch (e) {
    return { sweeps: { error: String(e instanceof Error ? e.message : e).slice(0, 200) } };
  }
}

/**
 * The pager's memory: every platform condition that has ever fired, and
 * whether a person heard about the last firing. `untold` is the list to act
 * on -- a condition inside its window whose page failed or had no address.
 * This is the one place a failed page can be seen: the callers do not act on
 * the outcome, and the alarm channel cannot report its own failure by mail.
 */
async function pagerMemory(): Promise<Section> {
  try {
    const db = pg();
    if (!db) return { pages: { unavailable: "no database client (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)" } };
    const { data, error } = await db
      .from("operator_pages")
      .select("key, first_at, last_at, count, alerted_at")
      .order("last_at", { ascending: false });
    if (error) return { pages: { error: error.message.slice(0, 200) } };
    const rows = (data ?? []) as PageRow[];
    return { pages: { ok: untoldPages(rows).length === 0, untold: untoldPages(rows), conditions: pageStates(rows) } };
  } catch (e) {
    return { pages: { error: String(e instanceof Error ? e.message : e).slice(0, 200) } };
  }
}

/**
 * Where the two tables that model a number disagree.
 *
 * lines is the asset, tenant_channels is the routing derived from it, and
 * until 00087 nothing said so or checked it. A channel row with no line is
 * NOT drift -- a Retell-bought voice number or a Meta WhatsApp number
 * legitimately has none -- so an empty list here means agreement, and a row
 * means a number that rings into a workspace nobody can identify.
 */
async function numberDrift(): Promise<Section> {
  try {
    const db = pg();
    if (!db) return { numbers: { unavailable: "no database client (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)" } };
    const { data, error } = await db.rpc("number_drift");
    if (error) return { numbers: { error: error.message.slice(0, 200) } };
    const rows = (data ?? []) as unknown as { kind: string; tenant_id: string; detail: string }[];
    return { numbers: { ok: rows.length === 0, drift: rows } };
  } catch (e) {
    return { numbers: { error: String(e instanceof Error ? e.message : e).slice(0, 200) } };
  }
}

/**
 * Token permanence: a temp WHATSAPP_ACCESS_TOKEN expiring mid-App-Review would
 * take the pilot dark with no code change to blame. expires_at=0 = permanent.
 */
async function waTokenPermanence(): Promise<Section> {
  if (!env.WHATSAPP_ACCESS_TOKEN || !env.META_APP_SECRET) return { waTokenCheck: null };
  try {
    const q = new URLSearchParams({
      input_token: env.WHATSAPP_ACCESS_TOKEN,
      access_token: `${META_APP_ID}|${env.META_APP_SECRET}`,
    });
    const r = await providerFetch("meta", `https://graph.facebook.com/v25.0/debug_token?${q}`, {
      timeoutMs: DIAG_READ_TIMEOUT_MS,
      idempotent: true,
      tries: 2,
    });
    // No answer at all is said as a failed check, as the bare fetch's throw was.
    if (r.status === 0) throw new Error(r.error ?? "no answer");
    const d = ((r.json ?? {}) as { data?: { is_valid?: boolean; expires_at?: number; type?: string } }).data || {};
    return {
      waTokenCheck: {
        valid: !!d.is_valid,
        expiresAt: d.expires_at,
        type: d.type,
        permanent: !!d.is_valid && d.expires_at === 0,
      },
    };
  } catch (e) {
    return { waTokenCheck: { error: String(e instanceof Error ? e.message : e).slice(0, 120) } };
  }
}

/**
 * The voice agent's own settings decide what the call pipeline can show:
 * whether Retell sends transcript_updated (a live transcript), how long it
 * keeps recordings, whether their URLs are signed. Nothing else can read
 * them — the API key lives here.
 */
async function voiceAgentSettings(): Promise<Section> {
  if (!env.RETELL_API_KEY) return { voiceAgents: null };
  try {
    const db = pg();
    const { data: rows } = db
      ? await db.from("tenant_channels").select("external_id, status").eq("kind", "voice")
      : { data: null };
    const agents: unknown[] = [];
    for (const r of rows ?? []) {
      const a = await getAgent({ apiKey: env.RETELL_API_KEY }, r.external_id);
      // Whether the line runs the product's shell — facts and caller context
      // arriving per call — or a hand-typed prompt with the hours baked in.
      // Read at the version the agent points at; strings only come out,
      // because the live tools carry a secret header.
      const llm = a?.llm_id ? await getRetellLlm({ apiKey: env.RETELL_API_KEY }, a.llm_id, a.llm_version) : null;
      agents.push(voiceAgentEntry(r, a, llm));
    }
    return { voiceAgents: agents, retellAuth: await retellAuthEvidence(db, env.RETELL_API_KEY) };
  } catch (e) {
    return { voiceAgents: { error: String(e instanceof Error ? e.message : e).slice(0, 200) } };
  }
}

/** One voice line as the report shows it: its agent's settings with the drift on both, or the agent named unreadable. */
function voiceAgentEntry(
  r: { external_id: string; status: string },
  a: RetellAgentConfig | null,
  llm: RetellLlmConfig | null,
): Section {
  return a
    ? {
        ...a,
        channel_status: r.status,
        live_transcript: (a.webhook_events ?? []).includes("transcript_updated"),
        // Which text model the line runs — provisioning parity, in one word.
        model: llm?.model ?? null,
        shell: llm ? voiceShellDrift(llm, edgeFnUrl()) : { error: a.llm_id ? "llm_unreadable" : "not_a_retell_llm" },
        // The agent-level settings the pipeline needs: the live
        // transcript event, a webhook budget the recording copy fits
        // in, signed recording links.
        agent: agentSettingsDrift(a),
      }
    : { agent_id: r.external_id, channel_status: r.status, error: "unreadable" };
}

/**
 * Which credential Retell's deliveries have been passing — the evidence
 * the webhook's `?key=` fallback retires on. The fingerprint lets the
 * key this deployment holds be matched against the one Retell badges
 * as its webhook signer, without printing either.
 */
async function retellAuthEvidence(db: ReturnType<typeof pg>, retellKey: string): Promise<Section> {
  return {
    key_fingerprint: createHash("sha256").update(retellKey).digest("hex").slice(0, 12),
    recent: db
      ? ((
          await db
            .from("events")
            .select("created_at, data")
            .eq("kind", "webhook.auth")
            .order("created_at", { ascending: false })
            .limit(5)
        ).data ?? [])
      : [],
    // What the last deliveries DID — per event: status carried and
    // normalised, turns brought, whether the ingest declined them.
    deliveries: db
      ? ((
          await db
            .from("events")
            .select("created_at, subject_id, data")
            .eq("kind", "webhook.delivery")
            .order("created_at", { ascending: false })
            .limit(20)
        ).data ?? [])
      : [],
  };
}

/**
 * The two gates that decide whether a customer is answered on a number:
 * the staging allowlist (a reply skipped is a customer unanswered) and the
 * environment token a channel without its own credentials rides.
 */
function whatsappGates(): Section {
  return {
    whatsapp: {
      allowlist_numbers: (env.WHATSAPP_TEST_ALLOWLIST || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean).length,
      env_fallback_token: !!env.WHATSAPP_ACCESS_TOKEN,
      signup_ready: !!(env.META_APP_SECRET && env.META_ES_CONFIG_ID),
    },
  };
}

/**
 * The receptionist's last 24 hours, from the usage events every reply
 * writes: how many, how sure, how fast, how many held or handed off.
 */
async function receptionistDay(): Promise<Section> {
  try {
    const db = pg();
    return { brain: db ? await brainSummary(db) : null };
  } catch (e) {
    return { brain: { error: String(e instanceof Error ? e.message : e).slice(0, 200) } };
  }
}

/**
 * The newest migration this database has applied, and how many (migration_head(), over the CLI's ledger, which
 * PostgREST cannot read). Production took migrations from branches, below main's head, and nothing said what it held:
 * a release compares this head with main's (docs/runbook.md, Deploy), and so does
 * tooling/scripts/checks/migration-ledger.mjs, with the whole ledger. A database the function has not reached yet says
 * so in its own line.
 */
async function migrationHead(): Promise<Section> {
  try {
    const db = pg();
    if (!db) return { migrations: { unavailable: "no database client (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)" } };
    const { data, error } = await db.rpc("migration_head");
    if (error) return { migrations: { error: error.message.slice(0, 200) } };
    const row = (data ?? [])[0];
    return { migrations: { head: row?.head ?? null, applied: row?.applied ?? 0 } };
  } catch (e) {
    return { migrations: { error: String(e instanceof Error ? e.message : e).slice(0, 200) } };
  }
}
