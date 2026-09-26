/**
 * Getting a line: a saga of idempotent steps, each recorded on the row
 * before the next runs (plan §5).
 *
 *   subaccount → number → trunk → agent → import → channel
 *
 * A step checks its own effect on the row first and skips what exists, so
 * a retry resumes at the step that failed instead of buying twice. A
 * failure leaves voice_state = failed with the step and the provider's
 * words in last_error; success leaves answering. The saga is pure over its
 * ports — the provider, the row store, the vault, the agent, Retell, the
 * channel row — so the whole thing runs in a test with the dry provider
 * and fakes, and the edge wires the real ones.
 *
 * Secrets (the subaccount token, the SIP password) go to the vault port
 * and never onto the row's facts.
 */
import type { SchemaSet } from "@chanlytics/contracts";
import { RETELL_ORIGINATION, isValidSipPassword, sipPassword, sipUsername, subaccountName, trunkDomain } from "./lines";
import type { LineProvider, ProviderAccount } from "./lines";

export type LineStep = SchemaSet<"lines.step">;
export const LINE_STEPS: readonly LineStep[] = [
  "subaccount",
  "number",
  "trunk",
  "agent",
  "import",
  "messaging",
  "channel",
];

export type LineVoiceState = SchemaSet<"lines.voice_state">;

/** The columns the saga reads and writes — a projection of the `lines` row. */
export interface LineRow {
  id: string;
  tenant_id: string;
  e164: string | null;
  provider: string;
  area_code: number | null;
  subaccount_sid: string | null;
  number_sid: string | null;
  trunk_sid: string | null;
  credential_list_sid: string | null;
  termination_uri: string | null;
  /** The Messaging Service the line texts through (MG…); null until the messaging step. */
  messaging_service_sid: string | null;
  retell_agent_id: string | null;
  voice_state: LineVoiceState;
  step: LineStep | null;
  last_error: string | null;
  state_since: string;
  facts: Record<string, unknown>;
}

export interface LineSecrets {
  /** The subaccount's auth token. */
  auth_token?: string;
  sip_username?: string;
  sip_password?: string;
}

export interface LinePorts {
  provider: LineProvider;
  /** The master account: the only one that can create a subaccount. */
  master: ProviderAccount;
  tenant: { id: string; name: string };
  now: () => string;
  /** A source for the SIP password a test can pin; absent, as the edge wires it, the password comes from node:crypto. */
  random?: () => number;
  store: {
    /** Persist a patch of the row; the saga keeps its own copy current. */
    save(patch: Partial<LineRow>): Promise<void>;
    getSecrets(): Promise<LineSecrets>;
    /** Merge into what is there. */
    putSecrets(s: LineSecrets): Promise<void>;
  };
  /** The workspace's phone receptionist: an existing agent, or a new one. */
  agent: { ensure(): Promise<{ agentId: string; llmId: string | null; pinned: boolean }> };
  retell: {
    importNumber(
      body: Record<string, unknown>,
    ): Promise<{ ok: boolean; status: number; body: Record<string, unknown> | null }>;
  };
  /** The tenant_channels row that routes calls back — created once per agent. */
  channel: {
    ensure(o: { agentId: string; e164: string; lineId: string }): Promise<{ channelId: string; created: boolean }>;
  };
  /** The tenant_channels row that routes texts back — one per line, keyed on the number. */
  smsChannel: {
    ensure(o: { e164: string; lineId: string; serviceSid: string }): Promise<{ channelId: string; created: boolean }>;
  };
  /** With its key: the inbound-call webhook that fills the facts per call. */
  inboundWebhookUrl: string;
  /** Where the line's texts arrive (no key: the provider signs every request). */
  smsInboundUrl: string;
  nickname: string;
  /**
   * Milliseconds until the run must start no more provider calls (the job's deadline). A carrier call's own timeout
   * fits in the gap between that deadline and the function's ceiling; a step that makes more than one is asked for
   * the difference first. At zero the saga stops between two calls, the row says where, and the job hands the rest
   * to the next one. Absent: the run goes to the end, as it always did.
   */
  timeLeft?: () => number;
}

/**
 * `later`: the run stopped at its deadline between two provider calls, nothing failed, and the rest is the next run's
 * (the row stays "provisioning" at `step`, and every receipt so far is on it).
 */
export type SagaResult =
  | { ok: true; line: LineRow; later?: undefined }
  | { ok: true; later: true; step: LineStep; line: LineRow }
  | { ok: false; step: LineStep; error: string; line: LineRow };

/** Thrown between two calls when the run is out of time; caught below as `later`, never as a failure. */
const OUT_OF_TIME = Symbol("out of time");

/**
 * The receptionist's step is three Retell calls at 8 s (the LLM, the agent, its publish): 24 s against the 15 s a
 * single carrier call is given after the deadline. It starts only with this much more left.
 */
const AGENT_STEP_MORE_MS = 10_000;

/** The body Retell's import takes — pure, so a test can pin it. */
export function retellImportBody(o: {
  e164: string;
  terminationUri: string;
  username: string;
  password: string;
  agentId: string;
  pinned: boolean;
  nickname: string;
  inboundWebhookUrl: string;
}): Record<string, unknown> {
  return {
    phone_number: o.e164,
    termination_uri: o.terminationUri,
    sip_trunk_auth_username: o.username,
    sip_trunk_auth_password: o.password,
    inbound_agents: [{ agent_id: o.agentId, ...(o.pinned ? { agent_version: "latest_published" } : {}), weight: 1 }],
    nickname: o.nickname,
    inbound_webhook_url: o.inboundWebhookUrl,
  };
}

/** The first step whose effect is missing from the row. */
export function nextLineStep(line: LineRow): LineStep | null {
  if (!line.subaccount_sid) return "subaccount";
  if (!line.number_sid) return "number";
  if (!line.trunk_sid || !line.credential_list_sid || !line.termination_uri || line.facts.trunk_ready !== true)
    return "trunk";
  if (!line.retell_agent_id) return "agent";
  if (line.facts.retell_imported !== true) return "import";
  if (!line.messaging_service_sid || line.facts.number_in_service !== true) return "messaging";
  if (typeof line.facts.channel_id !== "string" || typeof line.facts.sms_channel_id !== "string") return "channel";
  return null;
}

function errorWords(e: unknown): string {
  return (e instanceof Error ? e.message : String(e)).slice(0, 500);
}

export async function runLineSaga(start: LineRow, ports: LinePorts): Promise<SagaResult> {
  let line: LineRow = { ...start, facts: { ...(start.facts ?? {}) } };
  const save = async (patch: Partial<LineRow>) => {
    line = { ...line, ...patch, facts: patch.facts ? { ...patch.facts } : line.facts };
    await ports.store.save(patch);
  };
  const fact = async (k: string, v: unknown) => save({ facts: { ...line.facts, [k]: v } });
  /** Before every provider call: stop here if the run is out of time (`more`: what a longer step needs besides). */
  const room = (more = 0) => {
    if (ports.timeLeft && ports.timeLeft() <= more) throw OUT_OF_TIME;
  };
  /**
   * Make a thing once. The receipt of a create is written after the provider answers, so a run killed in between left
   * it made and the row silent -- and two of them cost nothing but for the trunk (its domain is the line's, so a second
   * is refused, for ever) and the SIP credential (its username is the line's). So the ask is marked first, and a run
   * that finds the mark with no receipt looks before asking again. A fresh line makes no extra call.
   */
  const once = async <T>(key: string, look: () => Promise<T | null>, make: () => Promise<T>): Promise<T> => {
    const asked = `asked_${key}`;
    room();
    if (line.facts[asked] === true) {
      const found = await look();
      if (found) return found;
      room();
    } else {
      // Marked only once the run has time to ask: a mark with no ask behind it costs the next run a look.
      await fact(asked, true);
    }
    return make();
  };

  if (line.voice_state === "answering" && nextLineStep(line) === null) return { ok: true, line };
  if (!line.e164) {
    await save({ voice_state: "failed", step: "number", last_error: "no number chosen", state_since: ports.now() });
    return { ok: false, step: "number", error: "no number chosen", line };
  }

  let secrets = await ports.store.getSecrets();
  const putSecrets = async (s: LineSecrets) => {
    secrets = { ...secrets, ...s };
    await ports.store.putSecrets(s);
  };
  const sub = (): ProviderAccount => {
    if (!line.subaccount_sid || !secrets.auth_token)
      throw new Error("the subaccount's token is missing from the vault");
    return { sid: line.subaccount_sid, token: secrets.auth_token };
  };

  let step: LineStep | null = nextLineStep(line);
  await save({ voice_state: "provisioning", step, last_error: null, state_since: ports.now() });

  try {
    while ((step = nextLineStep(line)) !== null) {
      room();
      await save({ step });
      switch (step) {
        case "subaccount": {
          const name = subaccountName(ports.tenant.name, line.id);
          const acct = await once(
            "subaccount",
            () => ports.provider.findSubaccount(ports.master, name),
            () => ports.provider.createSubaccount(ports.master, name),
          );
          await putSecrets({ auth_token: acct.token });
          await save({ subaccount_sid: acct.sid });
          break;
        }
        case "number": {
          // LOOK BEFORE BUYING. This is the only step that spends, and the only one
          // whose effect the row could not vouch for: the receipt is written after
          // the provider answers, and a saga killed in that window left a number
          // bought, unpaid-attention-to and unreachable -- a retry would ask to buy
          // it again and be refused for ever, because the account already owns it.
          //
          // Idempotent now, which is the property every other step already had.
          const held = await ports.provider.ownedNumber(sub(), line.e164);
          if (!held) room();
          const bought =
            held ?? (await ports.provider.buyNumber(sub(), line.e164, `${ports.tenant.name} · Chanlytics`));
          await save({ number_sid: bought.sid, e164: bought.e164 });
          break;
        }
        case "trunk": {
          const acct = sub();
          if (!line.trunk_sid) {
            const domainName = trunkDomain(line.id);
            const t = await once(
              "trunk",
              () => ports.provider.findTrunk(acct, domainName),
              () => ports.provider.createTrunk(acct, { friendlyName: `${ports.tenant.name} · Chanlytics`, domainName }),
            );
            await save({ trunk_sid: t.sid, termination_uri: t.domainName });
          }
          if (!line.credential_list_sid) {
            const name = `${ports.tenant.name} · Chanlytics`;
            const cl = await once(
              "credential_list",
              () => ports.provider.findCredentialList(acct, name),
              () => ports.provider.createCredentialList(acct, name),
            );
            await save({ credential_list_sid: cl.sid });
          }
          if (!secrets.sip_password || !secrets.sip_username) {
            const username = sipUsername(line.id);
            const password = sipPassword(ports.random);
            if (!isValidSipPassword(password)) throw new Error("generated SIP password failed Twilio's rule");
            // Its password went with the run that made it, and a list holds a username once: removed, made again.
            await once(
              "credential",
              async () => {
                const lost = await ports.provider.findCredential(acct, line.credential_list_sid!, username);
                if (lost) {
                  room();
                  await ports.provider.deleteCredential(acct, line.credential_list_sid!, lost.sid);
                }
                return null;
              },
              () => ports.provider.addCredential(acct, line.credential_list_sid!, username, password),
            );
            await putSecrets({ sip_username: username, sip_password: password });
          }
          if (line.facts.credential_list_attached !== true) {
            room();
            await ports.provider.attachCredentialList(acct, line.trunk_sid!, line.credential_list_sid!);
            await fact("credential_list_attached", true);
          }
          if (typeof line.facts.origination_sid !== "string") {
            const o = await once(
              "origination",
              () => ports.provider.findOrigination(acct, line.trunk_sid!, RETELL_ORIGINATION),
              () =>
                ports.provider.addOrigination(acct, line.trunk_sid!, {
                  sipUrl: RETELL_ORIGINATION,
                  friendlyName: "Retell",
                }),
            );
            await fact("origination_sid", o.sid);
          }
          if (line.facts.number_attached !== true) {
            room();
            await ports.provider.attachNumber(acct, line.trunk_sid!, line.number_sid!);
            await fact("number_attached", true);
          }
          await fact("trunk_ready", true);
          break;
        }
        case "agent": {
          room(AGENT_STEP_MORE_MS);
          const a = await ports.agent.ensure();
          await save({ retell_agent_id: a.agentId, facts: { ...line.facts, llm_id: a.llmId, agent_pinned: a.pinned } });
          break;
        }
        case "import": {
          if (!secrets.sip_username || !secrets.sip_password)
            throw new Error("the SIP credential is missing from the vault");
          const body = retellImportBody({
            e164: line.e164,
            terminationUri: line.termination_uri!,
            username: secrets.sip_username,
            password: secrets.sip_password,
            agentId: line.retell_agent_id!,
            pinned: line.facts.agent_pinned === true,
            nickname: ports.nickname,
            inboundWebhookUrl: ports.inboundWebhookUrl,
          });
          const r = await ports.retell.importNumber(body);
          if (!r.ok) {
            const msg =
              typeof r.body?.message === "string" ? r.body.message : JSON.stringify(r.body ?? {}).slice(0, 200);
            throw new Error(`Retell import: HTTP ${r.status} ${msg}`);
          }
          await save({
            facts: {
              ...line.facts,
              retell_imported: true,
              retell_number_type: typeof r.body?.phone_number_type === "string" ? r.body.phone_number_type : "custom",
            },
          });
          break;
        }
        case "messaging": {
          const acct = sub();
          if (!line.messaging_service_sid) {
            const svc = await ports.provider.createMessagingService(acct, {
              friendlyName: `${ports.tenant.name} · Chanlytics`,
              inboundUrl: ports.smsInboundUrl,
            });
            await save({ messaging_service_sid: svc.sid });
          }
          if (line.facts.number_in_service !== true) {
            room();
            await ports.provider.addNumberToService(acct, line.messaging_service_sid!, line.number_sid!);
            await fact("number_in_service", true);
          }
          break;
        }
        case "channel": {
          if (typeof line.facts.channel_id !== "string") {
            const c = await ports.channel.ensure({ agentId: line.retell_agent_id!, e164: line.e164, lineId: line.id });
            await fact("channel_id", c.channelId);
          }
          if (typeof line.facts.sms_channel_id !== "string") {
            const s = await ports.smsChannel.ensure({
              e164: line.e164,
              lineId: line.id,
              serviceSid: line.messaging_service_sid!,
            });
            await fact("sms_channel_id", s.channelId);
          }
          break;
        }
      }
    }
    await save({ voice_state: "answering", step: null, last_error: null, state_since: ports.now() });
    return { ok: true, line };
  } catch (e) {
    // Out of time is not a failure: the row keeps "provisioning" and its step, and the next run goes on from there.
    if (e === OUT_OF_TIME)
      return { ok: true, later: true, step: (line.step ?? step ?? "subaccount") as LineStep, line };
    const error = errorWords(e);
    const at = (line.step ?? step ?? "subaccount") as LineStep;
    await save({ voice_state: "failed", step: at, last_error: error, state_since: ports.now() });
    return { ok: false, step: at, error, line };
  }
}
