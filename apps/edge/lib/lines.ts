/**
 * Lines on the edge: the provider this deployment may use, and the ports
 * the saga (packages/channels lines-saga.ts) runs over — the row store,
 * the vault, the receptionist, Retell's import, the routing row. The saga
 * itself is pure and tested with the dry provider; this file is the only
 * place a real SID, token or key is handled.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "./workspace/db.js";
import {
  chooseLineProvider,
  twilioProvider,
  dryProvider,
  importPhoneNumber,
  voiceEndpoints,
  smsInboundUrl,
  DEFAULT_FN_URL,
  withKey,
  type LinePorts,
  type LineRow,
  type LineSecrets,
  type LineProvider,
  type LineProviderName,
  type ProviderAccount,
  type RetellConfig,
  type ProvisionSecrets,
} from "./workspace/channels.js";
import { ensureVoiceAgent } from "./voice-agent.js";
import type { LineDto } from "./workspace/contracts.js";

export interface LineProviderChoice {
  name: LineProviderName;
  provider: LineProvider;
  master: ProviderAccount;
}

/**
 * Where this deployment answers, as the provider must be told to reach it.
 *
 * The default is the address the edge has always had; `EDGE_ORIGIN` moves
 * it, the way DASHBOARD_ORIGIN moves the dashboard's. Without this the
 * production URL is a constant inside a shared package, which is exactly
 * the thing that has to be edited and redeployed to move an environment.
 */
export function edgeFnUrl(): string {
  const o = process.env.EDGE_ORIGIN;
  return o && /^https:\/\/[a-z0-9.-]+$/i.test(o) ? `${o}/api/retell-fn` : DEFAULT_FN_URL;
}

/** Real credentials win; the dry provider only outside production; otherwise none. */
export function lineProviderFromEnv(): LineProviderChoice | null {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const name = chooseLineProvider({ sid, token, dryRun: process.env.LINES_DRY_RUN, vercelEnv: process.env.VERCEL_ENV });
  if (name === "twilio" && sid && token) return { name, provider: twilioProvider(), master: { sid, token } };
  if (name === "dry") return { name, provider: dryProvider(Date.now() % 100000), master: { sid: "ACdryrun", token: "dry" } };
  return null;
}

type Row = Database["public"]["Tables"]["lines"]["Row"];

const facts = (j: Json): Record<string, unknown> => (j && typeof j === "object" && !Array.isArray(j) ? (j as Record<string, unknown>) : {});

/** The row as the saga reads it. */
export function rowToLine(r: Row): LineRow {
  return {
    id: r.id,
    tenant_id: r.tenant_id,
    e164: r.e164,
    provider: r.provider,
    area_code: r.area_code,
    subaccount_sid: r.subaccount_sid,
    number_sid: r.number_sid,
    trunk_sid: r.trunk_sid,
    credential_list_sid: r.credential_list_sid,
    termination_uri: r.termination_uri,
    messaging_service_sid: r.messaging_service_sid,
    retell_agent_id: r.retell_agent_id,
    voice_state: r.voice_state as LineRow["voice_state"],
    step: r.step as LineRow["step"],
    last_error: r.last_error,
    state_since: r.state_since,
    facts: facts(r.facts),
  };
}

/** Both receipts are in: the brand and the campaign are on record with the carriers. */
export function isRegistered(r: Pick<Row, "brand_sid" | "campaign_sid">): boolean {
  return !!(r.brand_sid && r.campaign_sid);
}

/**
 * What the page may see of a line: never a SID that opens a door.
 *
 * Typed as the CONTRACT the page reads, not as a loose object. It was a
 * `Record<string, unknown>`, so this shape and `contracts/setup.ts`'s
 * `LineDto` were two hand-kept copies of one thing: a field added on one
 * side and forgotten on the other compiled cleanly and arrived undefined.
 */
export function lineForClient(r: Row): LineDto {
  return {
    id: r.id,
    e164: r.e164,
    kind: r.kind,
    provider: r.provider,
    area_code: r.area_code,
    voice_state: r.voice_state as LineDto["voice_state"],
    sms_state: r.sms_state,
    reg_step: r.reg_step,
    reg_mock: r.reg_mock,
    reg_sole_prop: r.reg_sole_prop,
    registered: isRegistered(r),
    whatsapp_state: r.whatsapp_state,
    port_state: r.port_state,
    forwarding_state: r.forwarding_state,
    step: r.step,
    last_error: r.last_error,
    state_since: r.state_since,
    created_at: r.created_at,
  };
}

export function linePorts(
  db: SupabaseClient<Database>,
  cfg: RetellConfig,
  secrets: ProvisionSecrets,
  tenant: { id: string; name: string },
  line: LineRow,
  choice: LineProviderChoice,
): LinePorts {
  return {
    provider: choice.provider,
    master: choice.master,
    tenant,
    now: () => new Date().toISOString(),
    nickname: `${tenant.name} · Chanlytics`,
    inboundWebhookUrl: withKey(voiceEndpoints(edgeFnUrl()).inbound, secrets.fnSecret),
    smsInboundUrl: smsInboundUrl(edgeFnUrl()),
    store: {
      async save(patch) {
        const row: Partial<Row> = {};
        for (const [k, v] of Object.entries(patch)) (row as Record<string, unknown>)[k] = k === "facts" ? (v as Json) : v;
        const { error } = await db.from("lines").update(row).eq("id", line.id);
        if (error) throw new Error(`saving the line: ${error.message}`);
      },
      async getSecrets() {
        const { data, error } = await db.rpc("get_line_credentials", { p_line_id: line.id });
        if (error) throw new Error(`reading the line's credentials: ${error.message}`);
        return data && typeof data === "object" && !Array.isArray(data) ? (data as LineSecrets) : {};
      },
      async putSecrets(s) {
        const { error } = await db.rpc("put_line_credentials", { p_line_id: line.id, p_secret: s as unknown as Json });
        if (error) throw new Error(`keeping the line's credentials: ${error.message}`);
      },
    },
    agent: { ensure: () => ensureVoiceAgent(db, cfg, secrets, tenant) },
    retell: { importNumber: (body) => importPhoneNumber(cfg, body) },
    channel: {
      async ensure({ agentId, e164, lineId }) {
        // One routing row per agent. A workspace whose receptionist already
        // answers keeps its row; the new number rides on the same agent.
        const have = await db.from("tenant_channels").select("id").eq("kind", "voice").eq("external_id", agentId).maybeSingle();
        if (have.error) throw new Error(`reading the voice row: ${have.error.message}`);
        if (have.data) return { channelId: have.data.id, created: false };
        const ins = await db
          .from("tenant_channels")
          .insert({
            tenant_id: tenant.id,
            kind: "voice",
            external_id: agentId,
            number_e164: e164,
            status: "active",
            config: { provider: "twilio-sip", line_id: lineId, provisioned_at: new Date().toISOString(), provisioned_by: "lines" },
          })
          .select("id")
          .single();
        if (ins.error) throw new Error(`writing the voice row: ${ins.error.message}`);
        return { channelId: ins.data.id, created: true };
      },
    },
    smsChannel: {
      // One routing row per number: a text arrives with the number it was
      // sent to, which is the key the inbound webhook resolves.
      async ensure({ e164, lineId, serviceSid }) {
        const have = await db.from("tenant_channels").select("id").eq("kind", "sms").eq("external_id", e164).maybeSingle();
        if (have.error) throw new Error(`reading the sms row: ${have.error.message}`);
        if (have.data) return { channelId: have.data.id, created: false };
        const ins = await db
          .from("tenant_channels")
          .insert({
            tenant_id: tenant.id,
            kind: "sms",
            external_id: e164,
            number_e164: e164,
            status: "active",
            config: { provider: "twilio", line_id: lineId, messaging_service_sid: serviceSid, provisioned_at: new Date().toISOString(), provisioned_by: "lines" },
          })
          .select("id")
          .single();
        if (ins.error) throw new Error(`writing the sms row: ${ins.error.message}`);
        return { channelId: ins.data.id, created: true };
      },
    },
  };
}

/** The step, in the owner's words — one list, shared with the page (contracts/setup.ts). */
export { LINE_STEP_WORDS } from "./workspace/contracts.js";
