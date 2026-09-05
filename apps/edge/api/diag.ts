/** Ops diagnostic — store backend + live write/read probe + env presence
 *  + Meta access-token permanence check (debug_token expires_at).
 *  Auth: x-diag-key header (DIAG_KEY). Internal endpoint — not part of the
 *  frozen surface. */
import { getThread, saveThread, storeBackend, threadNamespace } from "../lib/store.js";
import { createHash } from "node:crypto";
import { json } from "../lib/http.js";
import { pg } from "../lib/pg.js";
import { brainSummary } from "../lib/budget.js";
import type { SweepHealthRow } from "../lib/sweep-health.js";
import { getAgent, getRetellLlm, voiceShellDrift, agentSettingsDrift } from "../lib/workspace/channels.js";
import { metaAppId } from "../lib/meta-graph.js";

const META_APP_ID = metaAppId();

export async function GET(request: Request): Promise<Response> {
  // Header only. The WhatsApp verify token used to open this door from the
  // query string — a value Meta also carries in its own verification URL,
  // and one that lands in access logs.
  const headerOk = !!process.env.DIAG_KEY && request.headers.get("x-diag-key") === process.env.DIAG_KEY;
  if (!headerOk) {
    return json(403, { ok: false });
  }

  const out: Record<string, unknown> = {
    store: storeBackend(),
    // Which store the bot's MEMORY comes from. The single most important
    // operational fact about this service after Gate 1b — and the flag to flip
    // back first if the receptionist starts behaving oddly.
    memory: process.env.PG_READS === "on" ? "postgres" : "blob",
    env: {
      pgReads: process.env.PG_READS === "on",
      pgWrites: process.env.PG_WRITES === "on",
      blobToken: !!process.env.BLOB_READ_WRITE_TOKEN,
      anthropic: !!process.env.ANTHROPIC_API_KEY,
      waToken: !!process.env.WHATSAPP_ACCESS_TOKEN,
      resend: !!process.env.RESEND_API_KEY,
      metaSecret: !!process.env.META_APP_SECRET,
      retellKey: !!process.env.RETELL_API_KEY,
      diagKey: !!process.env.DIAG_KEY,
      // Whether the receptionist can HOLD its own reply. Without this the
      // edge cannot schedule, and a workspace on 'veto' silently gets the
      // immediate replies it asked not to have — so this is the first thing
      // to check when a configured veto window does not appear.
      qstashToken: !!process.env.QSTASH_TOKEN,
    },
  };

  try {
    const probeId = "diag-probe";
    // The diagnostic probe writes to its own namespace so it can never touch
    // a real tenant's stored conversation.
    const probeNs = threadNamespace("diag-probe");
    const t = await getThread(probeNs, probeId);
    t.history.push({ role: "user", content: "probe " + Date.now() });
    await saveThread(probeNs, probeId, t);
    const back = await getThread(probeNs, probeId);
    out.probe = {
      wrote: t.history.length,
      readBack: back.history.length,
      roundTrip: back.history.length === t.history.length,
    };
  } catch (e) {
    out.probe = { error: String(e instanceof Error ? e.message : e).slice(0, 200) };
  }

  // Is the watchdog itself alive? pg_cron marks a sweep 'succeeded' the moment
  // net.http_post queues the request, so the run history cannot answer this —
  // only the edge's real reply can, and pg_net keeps that for six hours. This
  // is also the only place the HEALTH sweep's own last response is judged: the
  // health route cannot judge it, because when it runs that request is still
  // in flight.
  try {
    const db = pg();
    if (!db) {
      out.sweeps = { unavailable: "no database client (PG_WRITES is not 'on')" };
    } else {
      const { data, error } = await db.rpc("sweep_health");
      if (error) {
        out.sweeps = { error: error.message.slice(0, 200) };
      } else {
        const rows = (data ?? []) as unknown as SweepHealthRow[];
        out.sweeps = { ok: rows.every((r) => r.healthy), detail: rows };
      }
    }
  } catch (e) {
    out.sweeps = { error: String(e instanceof Error ? e.message : e).slice(0, 200) };
  }

  // Token permanence: a temp WHATSAPP_ACCESS_TOKEN expiring mid-App-Review would
  // take the pilot dark with no code change to blame. expires_at=0 = permanent.
  if (process.env.WHATSAPP_ACCESS_TOKEN && process.env.META_APP_SECRET) {
    try {
      const q = new URLSearchParams({
        input_token: process.env.WHATSAPP_ACCESS_TOKEN,
        access_token: `${META_APP_ID}|${process.env.META_APP_SECRET}`,
      });
      const r = await fetch(`https://graph.facebook.com/v25.0/debug_token?${q}`);
      const d = ((await r.json()) as { data?: { is_valid?: boolean; expires_at?: number; type?: string } }).data || {};
      out.waTokenCheck = {
        valid: !!d.is_valid,
        expiresAt: d.expires_at,
        type: d.type,
        permanent: !!d.is_valid && d.expires_at === 0,
      };
    } catch (e) {
      out.waTokenCheck = { error: String(e instanceof Error ? e.message : e).slice(0, 120) };
    }
  } else {
    out.waTokenCheck = null;
  }

  // The voice agent's own settings decide what the call pipeline can show:
  // whether Retell sends transcript_updated (a live transcript), how long it
  // keeps recordings, whether their URLs are signed. Nothing else can read
  // them — the API key lives here.
  if (process.env.RETELL_API_KEY) {
    try {
      const db = pg();
      const { data: rows } = db
        ? await db.from("tenant_channels").select("external_id, status").eq("kind", "voice")
        : { data: null };
      const agents: unknown[] = [];
      for (const r of rows ?? []) {
        const a = await getAgent({ apiKey: process.env.RETELL_API_KEY }, r.external_id);
        // Whether the line runs the product's shell — facts and caller context
        // arriving per call — or a hand-typed prompt with the hours baked in.
        // Read at the version the agent points at; strings only come out,
        // because the live tools carry a secret header.
        const llm = a?.llm_id ? await getRetellLlm({ apiKey: process.env.RETELL_API_KEY }, a.llm_id, a.llm_version) : null;
        agents.push(
          a
            ? {
                ...a,
                channel_status: r.status,
                live_transcript: (a.webhook_events ?? []).includes("transcript_updated"),
                shell: llm ? voiceShellDrift(llm) : { error: a.llm_id ? "llm_unreadable" : "not_a_retell_llm" },
                // The agent-level settings the pipeline needs: the live
                // transcript event, a webhook budget the recording copy fits
                // in, signed recording links.
                agent: agentSettingsDrift(a),
              }
            : { agent_id: r.external_id, channel_status: r.status, error: "unreadable" },
        );
      }
      out.voiceAgents = agents;
      // Which credential Retell's deliveries have been passing — the evidence
      // the webhook's `?key=` fallback retires on. The fingerprint lets the
      // key this deployment holds be matched against the one Retell badges
      // as its webhook signer, without printing either.
      out.retellAuth = {
        key_fingerprint: createHash("sha256").update(process.env.RETELL_API_KEY).digest("hex").slice(0, 12),
        recent: db
          ? ((await db.from("events").select("created_at, data").eq("kind", "webhook.auth").order("created_at", { ascending: false }).limit(5)).data ?? [])
          : [],
        // What the last deliveries DID — per event: status carried and
        // normalised, turns brought, whether the ingest declined them.
        deliveries: db
          ? ((await db.from("events").select("created_at, subject_id, data").eq("kind", "webhook.delivery").order("created_at", { ascending: false }).limit(20)).data ?? [])
          : [],
      };
    } catch (e) {
      out.voiceAgents = { error: String(e instanceof Error ? e.message : e).slice(0, 200) };
    }
  } else {
    out.voiceAgents = null;
  }

  // The two gates that decide whether a customer is answered on a number:
  // the staging allowlist (a reply skipped is a customer unanswered) and the
  // environment token a channel without its own credentials rides.
  out.whatsapp = {
    allowlist_numbers: (process.env.WHATSAPP_TEST_ALLOWLIST || "").split(",").map((s) => s.trim()).filter(Boolean).length,
    env_fallback_token: !!process.env.WHATSAPP_ACCESS_TOKEN,
    signup_ready: !!(process.env.META_APP_SECRET && process.env.META_ES_CONFIG_ID),
  };

  // The receptionist's last 24 hours, from the usage events every reply
  // writes: how many, how sure, how fast, how many held or handed off.
  try {
    const db = pg();
    out.brain = db ? await brainSummary(db) : null;
  } catch (e) {
    out.brain = { error: String(e instanceof Error ? e.message : e).slice(0, 200) };
  }

  return json(200, out);
}
