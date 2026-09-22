/**
 * Lines on the edge: the provider this deployment may use, and the ports
 * the saga (packages/channels lines-saga.ts) runs over — the row store,
 * the vault, the receptionist, Retell's import, the routing row. The saga
 * itself is pure and tested with the dry provider; this file is the only
 * place a real SID, token or key is handled.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "./packages/db.js";
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
} from "./packages/channels.js";
import { ensureVoiceAgent } from "./voice-agent.js";
import type { LineDto } from "./packages/contracts.js";
import { env } from "./env.js";

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
  const o = env.EDGE_ORIGIN;
  return o && /^https:\/\/[a-z0-9.-]+$/i.test(o) ? `${o}/api/retell-fn` : DEFAULT_FN_URL;
}

/** Real credentials win; the dry provider only outside production; otherwise none. */
export function lineProviderFromEnv(): LineProviderChoice | null {
  const sid = env.TWILIO_ACCOUNT_SID;
  const token = env.TWILIO_AUTH_TOKEN;
  const name = chooseLineProvider({ sid, token, dryRun: env.LINES_DRY_RUN, vercelEnv: env.VERCEL_ENV });
  if (name === "twilio" && sid && token) return { name, provider: twilioProvider(), master: { sid, token } };
  if (name === "dry")
    return { name, provider: dryProvider(Date.now() % 100000), master: { sid: "ACdryrun", token: "dry" } };
  return null;
}

type Row = Database["public"]["Tables"]["lines"]["Row"];

const facts = (j: Json): Record<string, unknown> =>
  j && typeof j === "object" && !Array.isArray(j) ? (j as Record<string, unknown>) : {};

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
        for (const [k, v] of Object.entries(patch))
          (row as Record<string, unknown>)[k] = k === "facts" ? (v as Json) : v;
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
        return ensureRoutingRow(db, tenant.id, "voice", agentId, {
          tenant_id: tenant.id,
          kind: "voice",
          external_id: agentId,
          number_e164: e164,
          status: "active",
          config: {
            provider: "twilio-sip",
            line_id: lineId,
            provisioned_at: new Date().toISOString(),
            provisioned_by: "lines",
          },
        });
      },
    },
    smsChannel: {
      // One routing row per number: a text arrives with the number it was
      // sent to, which is the key the inbound webhook resolves.
      async ensure({ e164, lineId, serviceSid }) {
        return ensureRoutingRow(db, tenant.id, "sms", e164, {
          tenant_id: tenant.id,
          kind: "sms",
          external_id: e164,
          number_e164: e164,
          status: "active",
          config: {
            provider: "twilio",
            line_id: lineId,
            messaging_service_sid: serviceSid,
            provisioned_at: new Date().toISOString(),
            provisioned_by: "lines",
          },
        });
      },
    },
  };
}

type ChannelInsert = Database["public"]["Tables"]["tenant_channels"]["Insert"];

/**
 * The routing row for one key, made to exist and to belong to this workspace.
 *
 * `tenant_channels` is unique on (kind, external_id) ACROSS workspaces, and a
 * phone number outlives the workspace that rented it: a carrier gives a
 * released number to somebody else a few weeks later. So the row this finds
 * by the routing key is not necessarily ours, and adopting it was how a new
 * workspace's texts arrived in the previous renter's Inbox -- the saga wrote
 * the stranger's channel id onto the line, called it provisioned, and every
 * message to that number resolved to a business that no longer owns it.
 *
 * Hence three cases rather than two. Ours, live: keep it. Ours, switched off
 * (a release and a re-buy by the same workspace): switch it back on, because
 * an adopted disabled row is a line that reports as answering while the
 * webhook refuses to route -- the same silence, arrived at from the other
 * side. Somebody else's: refuse, loudly. The saga records the refusal on the
 * line and a person looks at it, which is the only correct end: the row
 * cannot be taken, and the number cannot be routed, until the other
 * workspace's row is released.
 */
async function ensureRoutingRow(
  db: SupabaseClient<Database>,
  tenantId: string,
  kind: "voice" | "sms",
  externalId: string,
  row: ChannelInsert,
): Promise<{ channelId: string; created: boolean }> {
  // By the unique key, so this is at most one row -- and deliberately NOT
  // filtered by tenant: a row belonging to somebody else has to be seen to be
  // refused. Filtering it out instead would fall through to the insert and
  // fail on the constraint, which says "duplicate key" to an owner who has
  // just been told their number is being set up.
  const have = await db
    .from("tenant_channels")
    .select("id, tenant_id, status")
    .eq("kind", kind)
    .eq("external_id", externalId)
    .maybeSingle();
  if (have.error) throw new Error(`reading the ${kind} row: ${have.error.message}`);
  if (have.data) {
    const mine = have.data.tenant_id === tenantId;
    // A row somebody else is still USING is a live claim on this key, and the
    // only thing that must never be taken: taking it is what put a new
    // workspace's texts into the previous renter's Inbox.
    if (!mine && have.data.status === "active") {
      throw new Error(
        `the ${kind} routing row for ${externalId} belongs to another workspace; it must be released there before this line can use it`,
      );
    }
    // Everything else is claimable, and a DISABLED row of another workspace
    // must be: release disables rather than deletes (calls keep their history)
    // and nothing anywhere deletes a tenant_channels row, so refusing one
    // would make a carrier-recycled number unprovisionable for its new renter
    // for ever -- the same number unreachable, reached from the other side.
    // Only `calls.channel_id` references a row, and only voice rows are
    // called; a Retell agent id is minted per workspace and never recycled, so
    // the row changing hands here is in practice always an sms one.
    if (!mine || have.data.status !== "active") {
      const take = await db
        .from("tenant_channels")
        .update({ tenant_id: tenantId, status: "active", number_e164: row.number_e164, config: row.config })
        .eq("id", have.data.id)
        // Pinned to the row as it was READ, so a claim laid between the two
        // statements wins and this fails rather than overwriting it.
        .eq("tenant_id", have.data.tenant_id)
        .eq("status", have.data.status)
        .select("id")
        .maybeSingle();
      if (take.error) throw new Error(`taking the ${kind} row: ${take.error.message}`);
      if (!take.data)
        throw new Error(
          `the ${kind} routing row for ${externalId} was claimed by another workspace while this line was being set up`,
        );
    }
    return { channelId: have.data.id, created: false };
  }
  const ins = await db.from("tenant_channels").insert(row).select("id").single();
  if (ins.error) throw new Error(`writing the ${kind} row: ${ins.error.message}`);
  return { channelId: ins.data.id, created: true };
}

/**
 * The routing rows a released line leaves behind, switched off.
 *
 * Split out of the route the way `planSmsIngress` was split out of the SMS
 * door: what it decides is a workspace's phone line going quiet, and that was
 * held by nothing a test could reach.
 *
 * BOTH rows, and only rows no other line is using. `tenant_channels` is unique
 * on (kind, external_id) ACROSS workspaces and a released number goes back to
 * the carrier, who rents it to somebody else -- so an sms row left active is
 * the previous renter's claim on a number they no longer have, and the next
 * workspace to buy it cannot be routed until the claim is dropped. That is why
 * the sms row must go.
 *
 * And why the voice row must not always: an sms row is keyed on the number, so
 * it is this line's alone, but a voice row is keyed on the workspace's Retell
 * AGENT, which every line of the workspace shares. Switching that off on
 * behalf of one line switches the receptionist off for all of them, and
 * unrecoverably -- the others already carry `facts.channel_id`, so their saga
 * skips `channel.ensure` and never writes it back. Today `buy` refuses while
 * any line is provisioning, answering or failed, so a second line holding the
 * same agent cannot arise; but that is a guard in another file for another
 * purpose, and it is the only thing between a release and a silent workspace.
 * This asks the question directly instead.
 *
 * Switched off, never deleted: calls keep their history.
 */
export async function releaseRoutingRows(
  db: SupabaseClient<Database>,
  tenantId: string,
  line: { id: string; facts: Record<string, unknown> },
): Promise<
  { ok: true; released: Record<string, string> } | { ok: false; released: Record<string, string>; error: string }
> {
  // Carried, not discarded, so a failure halfway still reports what DID
  // happen: a 503 that says only "the provider gave the number back" leaves an
  // operator unaware that the workspace's voice row is already switched off
  // while the line row still reads `answering`.
  const released: Record<string, string> = {};
  const stop = (error: string) => ({ ok: false as const, released, error });
  for (const key of ["channel_id", "sms_channel_id"] as const) {
    const id = line.facts[key];
    if (typeof id !== "string") continue;
    // Ordered, because with three lines on one agent row `limit(1)` unordered
    // picks whichever the planner happened to return -- and what is picked
    // becomes the number this workspace publishes. The oldest, which is the
    // same line `ensureVoiceAgent`, `line_forwarding_set` and `businessPageFor`
    // all settle on when a workspace has more than one.
    const shared = await db
      .from("lines")
      .select("id, e164")
      .eq("tenant_id", tenantId)
      .neq("id", line.id)
      .filter(`facts->>${key}`, "eq", id)
      .order("created_at")
      .limit(1);
    if (shared.error) return stop(`reading the workspace's other lines: ${shared.error.message}`);
    const holder = shared.data?.[0];
    if (holder) {
      // It keeps answering -- but it must now describe the line that HOLDS it.
      // `number_e164` is what the public page, Settings, the consent page and
      // the receptionist's own facts publish as the workspace's number, so a
      // kept row still carrying the RELEASED number advertises a number that
      // has gone back to the carrier.
      const row = await db
        .from("tenant_channels")
        .select("config")
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (row.error) return stop(`reading the routing row: ${row.error.message}`);
      const cfg =
        row.data?.config && typeof row.data.config === "object" && !Array.isArray(row.data.config)
          ? (row.data.config as Record<string, unknown>)
          : {};
      // `lines.e164` is nullable -- a line killed before its purchase answered
      // has none -- and writing that null would erase the number the row
      // publishes while reporting the keep as a success. A holder with no
      // number of its own leaves the row's number alone; the line_id still
      // moves, so the row names something that exists.
      const patch: Database["public"]["Tables"]["tenant_channels"]["Update"] = {
        config: { ...cfg, line_id: holder.id } as Json,
      };
      if (holder.e164) patch.number_e164 = holder.e164;
      const moved = await db.from("tenant_channels").update(patch).eq("id", id).eq("tenant_id", tenantId);
      if (moved.error) return stop(`repointing the routing row: ${moved.error.message}`);
      released[key === "channel_id" ? "channel_kept" : "sms_channel_kept"] = id;
      continue;
    }
    const off = await db.from("tenant_channels").update({ status: "disabled" }).eq("id", id).eq("tenant_id", tenantId);
    if (off.error) return stop(`switching the routing row off: ${off.error.message}`);
    released[key === "channel_id" ? "channel_disabled" : "sms_channel_disabled"] = id;
  }
  return { ok: true, released };
}

/** The step, in the owner's words — one list, shared with the page (contracts/setup.ts). */
export { LINE_STEP_WORDS } from "./packages/contracts.js";
