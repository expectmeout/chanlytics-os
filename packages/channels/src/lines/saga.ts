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

/**
 * One run of the saga: its own copy of the row, kept current as it saves, so each step reads what the steps before it
 * wrote; the vault's secrets as the run last heard them; and the moves every step is made of.
 */
interface LineRun {
  readonly ports: LinePorts;
  line: LineRow;
  secrets: LineSecrets;
  /** Persist a patch of the row, the run's own copy first. */
  save(patch: Partial<LineRow>): Promise<void>;
  /** One fact onto the row's facts. */
  fact(k: string, v: unknown): Promise<void>;
  /** Before every provider call: stop here if the run is out of time (`more`: what a longer step needs besides). */
  room(more?: number): void;
  /**
   * Make a thing once. The receipt of a create is written after the provider answers, so a run killed in between left
   * it made and the row silent -- and two of them cost nothing but for the trunk (its domain is the line's, so a second
   * is refused, for ever) and the SIP credential (its username is the line's). So the ask is marked first, and a run
   * that finds the mark with no receipt looks before asking again. A fresh line makes no extra call.
   */
  once<T>(key: string, look: () => Promise<T | null>, make: () => Promise<T>): Promise<T>;
  /** Merge into the vault, the run's own copy first. */
  putSecrets(s: LineSecrets): Promise<void>;
  /** The line's own subaccount to act as: its SID from the row, its token from the vault. */
  sub(): ProviderAccount;
}

/** A run from the row it starts at. Its secrets are the vault's once runLineSaga has read them. */
function lineRun(start: LineRow, ports: LinePorts): LineRun {
  const run: LineRun = {
    ports,
    line: { ...start, facts: { ...(start.facts ?? {}) } },
    secrets: {},
    async save(patch) {
      run.line = { ...run.line, ...patch, facts: patch.facts ? { ...patch.facts } : run.line.facts };
      await ports.store.save(patch);
    },
    fact: async (k, v) => run.save({ facts: { ...run.line.facts, [k]: v } }),
    room(more = 0) {
      if (ports.timeLeft && ports.timeLeft() <= more) throw OUT_OF_TIME;
    },
    async once(key, look, make) {
      const asked = `asked_${key}`;
      run.room();
      if (run.line.facts[asked] === true) {
        const found = await look();
        if (found) return found;
        run.room();
      } else {
        // Marked only once the run has time to ask: a mark with no ask behind it costs the next run a look.
        await run.fact(asked, true);
      }
      return make();
    },
    async putSecrets(s) {
      run.secrets = { ...run.secrets, ...s };
      await ports.store.putSecrets(s);
    },
    sub() {
      if (!run.line.subaccount_sid || !run.secrets.auth_token)
        throw new Error("the subaccount's token is missing from the vault");
      return { sid: run.line.subaccount_sid, token: run.secrets.auth_token };
    },
  };
  return run;
}

/** What each step does, one handler per step: nextLineStep says which runs next, and each checks its own effect first. */
const ON_STEP: Record<LineStep, (run: LineRun) => Promise<void>> = {
  subaccount: subaccountStep,
  number: numberStep,
  trunk: trunkStep,
  agent: agentStep,
  import: importStep,
  messaging: messagingStep,
  channel: channelStep,
};

export async function runLineSaga(start: LineRow, ports: LinePorts): Promise<SagaResult> {
  const run = lineRun(start, ports);

  if (run.line.voice_state === "answering" && nextLineStep(run.line) === null) return { ok: true, line: run.line };
  if (!run.line.e164) {
    await run.save({ voice_state: "failed", step: "number", last_error: "no number chosen", state_since: ports.now() });
    return { ok: false, step: "number", error: "no number chosen", line: run.line };
  }

  run.secrets = await ports.store.getSecrets();
  let step: LineStep | null = nextLineStep(run.line);
  await run.save({ voice_state: "provisioning", step, last_error: null, state_since: ports.now() });

  try {
    while ((step = nextLineStep(run.line)) !== null) {
      run.room();
      await run.save({ step });
      await ON_STEP[step](run);
    }
    await run.save({ voice_state: "answering", step: null, last_error: null, state_since: ports.now() });
    return { ok: true, line: run.line };
  } catch (e) {
    // Out of time is not a failure: the row keeps "provisioning" and its step, and the next run goes on from there.
    if (e === OUT_OF_TIME)
      return { ok: true, later: true, step: run.line.step ?? step ?? "subaccount", line: run.line };
    const error = errorWords(e);
    const at = run.line.step ?? step ?? "subaccount";
    await run.save({ voice_state: "failed", step: at, last_error: error, state_since: ports.now() });
    return { ok: false, step: at, error, line: run.line };
  }
}

/** The line's own subaccount, made by the master account: its token to the vault, its SID onto the row. */
async function subaccountStep(run: LineRun): Promise<void> {
  const { ports } = run;
  const name = subaccountName(ports.tenant.name, run.line.id);
  const acct = await run.once(
    "subaccount",
    () => ports.provider.findSubaccount(ports.master, name),
    () => ports.provider.createSubaccount(ports.master, name),
  );
  await run.putSecrets({ auth_token: acct.token });
  await run.save({ subaccount_sid: acct.sid });
}

/** The number the owner chose, in the line's subaccount. */
async function numberStep(run: LineRun): Promise<void> {
  const { ports } = run;
  // LOOK BEFORE BUYING. This is the only step that spends, and the only one
  // whose effect the row could not vouch for: the receipt is written after
  // the provider answers, and a saga killed in that window left a number
  // bought, unpaid-attention-to and unreachable -- a retry would ask to buy
  // it again and be refused for ever, because the account already owns it.
  //
  // Idempotent now, which is the property every other step already had.
  const held = await ports.provider.ownedNumber(run.sub(), run.line.e164!);
  if (!held) run.room();
  const bought =
    held ?? (await ports.provider.buyNumber(run.sub(), run.line.e164!, `${ports.tenant.name} · Chanlytics`));
  await run.save({ number_sid: bought.sid, e164: bought.e164 });
}

/** The trunk's parts, in order, each skipped when the row already holds it: the trunk is ready once all six stand. */
const TRUNK_PARTS: readonly ((run: LineRun, acct: ProviderAccount) => Promise<void>)[] = [
  ensureTrunk,
  ensureCredentialList,
  ensureSipCredential,
  ensureCredentialListAttached,
  ensureOrigination,
  ensureNumberAttached,
];

/** The SIP trunk that carries the line's calls to Retell, built in the line's subaccount. */
async function trunkStep(run: LineRun): Promise<void> {
  const acct = run.sub();
  for (const ensure of TRUNK_PARTS) await ensure(run, acct);
  await run.fact("trunk_ready", true);
}

/** The trunk itself, on the line's own SIP domain. */
async function ensureTrunk(run: LineRun, acct: ProviderAccount): Promise<void> {
  if (run.line.trunk_sid) return;
  const { ports } = run;
  const domainName = trunkDomain(run.line.id);
  const t = await run.once(
    "trunk",
    () => ports.provider.findTrunk(acct, domainName),
    () => ports.provider.createTrunk(acct, { friendlyName: `${ports.tenant.name} · Chanlytics`, domainName }),
  );
  await run.save({ trunk_sid: t.sid, termination_uri: t.domainName });
}

/** The credential list the trunk knows Retell by. */
async function ensureCredentialList(run: LineRun, acct: ProviderAccount): Promise<void> {
  if (run.line.credential_list_sid) return;
  const { ports } = run;
  const name = `${ports.tenant.name} · Chanlytics`;
  const cl = await run.once(
    "credential_list",
    () => ports.provider.findCredentialList(acct, name),
    () => ports.provider.createCredentialList(acct, name),
  );
  await run.save({ credential_list_sid: cl.sid });
}

/** The SIP credential Retell presents, in the list; its password is drawn here and kept in the vault. */
async function ensureSipCredential(run: LineRun, acct: ProviderAccount): Promise<void> {
  if (run.secrets.sip_password && run.secrets.sip_username) return;
  const { ports } = run;
  const username = sipUsername(run.line.id);
  const password = sipPassword(ports.random);
  if (!isValidSipPassword(password)) throw new Error("generated SIP password failed Twilio's rule");
  // Its password went with the run that made it, and a list holds a username once: removed, made again.
  await run.once(
    "credential",
    async () => {
      const lost = await ports.provider.findCredential(acct, run.line.credential_list_sid!, username);
      if (lost) {
        run.room();
        await ports.provider.deleteCredential(acct, run.line.credential_list_sid!, lost.sid);
      }
      return null;
    },
    () => ports.provider.addCredential(acct, run.line.credential_list_sid!, username, password),
  );
  await run.putSecrets({ sip_username: username, sip_password: password });
}

/** The credential list, on the trunk. */
async function ensureCredentialListAttached(run: LineRun, acct: ProviderAccount): Promise<void> {
  if (run.line.facts.credential_list_attached === true) return;
  const { ports } = run;
  run.room();
  await ports.provider.attachCredentialList(acct, run.line.trunk_sid!, run.line.credential_list_sid!);
  await run.fact("credential_list_attached", true);
}

/** Where the trunk sends the line's calls: Retell's SIP door. */
async function ensureOrigination(run: LineRun, acct: ProviderAccount): Promise<void> {
  if (typeof run.line.facts.origination_sid === "string") return;
  const { ports } = run;
  const o = await run.once(
    "origination",
    () => ports.provider.findOrigination(acct, run.line.trunk_sid!, RETELL_ORIGINATION),
    () =>
      ports.provider.addOrigination(acct, run.line.trunk_sid!, {
        sipUrl: RETELL_ORIGINATION,
        friendlyName: "Retell",
      }),
  );
  await run.fact("origination_sid", o.sid);
}

/** The number, on the trunk. */
async function ensureNumberAttached(run: LineRun, acct: ProviderAccount): Promise<void> {
  if (run.line.facts.number_attached === true) return;
  const { ports } = run;
  run.room();
  await ports.provider.attachNumber(acct, run.line.trunk_sid!, run.line.number_sid!);
  await run.fact("number_attached", true);
}

/** The workspace's phone receptionist: the one it has, or a new one. */
async function agentStep(run: LineRun): Promise<void> {
  const { ports } = run;
  run.room(AGENT_STEP_MORE_MS);
  const a = await ports.agent.ensure();
  await run.save({ retell_agent_id: a.agentId, facts: { ...run.line.facts, llm_id: a.llmId, agent_pinned: a.pinned } });
}

/** The number, imported to Retell over the trunk with its SIP credential, answered by the receptionist. */
async function importStep(run: LineRun): Promise<void> {
  const { ports } = run;
  if (!run.secrets.sip_username || !run.secrets.sip_password)
    throw new Error("the SIP credential is missing from the vault");
  const body = retellImportBody({
    e164: run.line.e164!,
    terminationUri: run.line.termination_uri!,
    username: run.secrets.sip_username,
    password: run.secrets.sip_password,
    agentId: run.line.retell_agent_id!,
    pinned: run.line.facts.agent_pinned === true,
    nickname: ports.nickname,
    inboundWebhookUrl: ports.inboundWebhookUrl,
  });
  const r = await ports.retell.importNumber(body);
  if (!r.ok) {
    const msg = typeof r.body?.message === "string" ? r.body.message : JSON.stringify(r.body ?? {}).slice(0, 200);
    throw new Error(`Retell import: HTTP ${r.status} ${msg}`);
  }
  await run.save({
    facts: {
      ...run.line.facts,
      retell_imported: true,
      retell_number_type: typeof r.body?.phone_number_type === "string" ? r.body.phone_number_type : "custom",
    },
  });
}

/** Texting: the line's own Messaging Service, inbound to our webhook, and the number in its sender pool. */
async function messagingStep(run: LineRun): Promise<void> {
  const { ports } = run;
  const acct = run.sub();
  if (!run.line.messaging_service_sid) {
    const svc = await ports.provider.createMessagingService(acct, {
      friendlyName: `${ports.tenant.name} · Chanlytics`,
      inboundUrl: ports.smsInboundUrl,
    });
    await run.save({ messaging_service_sid: svc.sid });
  }
  if (run.line.facts.number_in_service !== true) {
    run.room();
    await ports.provider.addNumberToService(acct, run.line.messaging_service_sid!, run.line.number_sid!);
    await run.fact("number_in_service", true);
  }
}

/** The routing rows that bring the line's calls and texts back to the workspace. */
async function channelStep(run: LineRun): Promise<void> {
  const { ports } = run;
  if (typeof run.line.facts.channel_id !== "string") {
    const c = await ports.channel.ensure({
      agentId: run.line.retell_agent_id!,
      e164: run.line.e164!,
      lineId: run.line.id,
    });
    await run.fact("channel_id", c.channelId);
  }
  if (typeof run.line.facts.sms_channel_id !== "string") {
    const s = await ports.smsChannel.ensure({
      e164: run.line.e164!,
      lineId: run.line.id,
      serviceSid: run.line.messaging_service_sid!,
    });
    await run.fact("sms_channel_id", s.channelId);
  }
}
