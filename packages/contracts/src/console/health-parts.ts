/**
 * Health's parts (decision 0068): sends by channel with the providers' own codes in words, calls by outcome, webhooks by
 * provider, model calls by purpose with the reason each failed call gave (00469), event deliveries by subscriber, and
 * the connections that are not healthy. From one read (platform_health_parts, 00469), every row keyed by whether its
 * workspace is ours. Pure.
 */
import type { ModelPurpose } from "../ai/models";
import { creditRanOut } from "../ai/usage";
import { capitalize } from "../shared/words";
import { inScope, type HealthScope } from "./health-scope";
import { subscriberWords } from "./health-clocks";

// ---------------------------------------------------------------------------------------------------- the read

interface Keyed {
  ours: boolean;
}

/** What platform_health_parts(p_days) answers (00469). */
export interface HealthPartsDto {
  days: number;
  sends: Array<Keyed & { channel: string; status: string; n: number }>;
  send_errors: Array<Keyed & { channel: string; code: string; title: string | null; n: number; last_at: string }>;
  calls: Array<Keyed & { status: string; reason: string; n: number; last_at: string }>;
  webhooks: Array<Keyed & { provider: string; door: string; n: number; unverified: number; last_at: string }>;
  billing: Array<{ type: string; state: string; n: number; last_at: string }>;
  model: Array<Keyed & { purpose: string; outcome: string; n: number; usd: number }>;
  model_by_workspace: Array<Keyed & { tenant_id: string; purpose: string; n: number; usd: number }>;
  model_failures: Array<
    Keyed & {
      at: string;
      tenant_id: string;
      purpose: string;
      model: string;
      outcome: string;
      error_type: string | null;
      error_message: string | null;
    }
  >;
  deliveries: Array<Keyed & { subscriber: string; state: string; n: number; last_at: string }>;
  delivery_failures: Array<
    Keyed & {
      event_id: string;
      subscriber: string;
      kind: string;
      tenant_id: string;
      attempts: number;
      last_error: string;
      updated_at: string;
    }
  >;
  /** Ask's answers: one row per side (ours true or false) and one for both (ours null). */
  ask: Array<{
    ours: boolean | null;
    answers: number;
    failed: number;
    ungrounded: number;
    latency_p50: number | null;
    latency_p95: number | null;
    latency_max: number | null;
  }>;
  ask_traced: Array<{
    ours: boolean | null;
    traced: number;
    first_text_p50: number | null;
    first_text_p95: number | null;
    context_p50: number | null;
    context_p95: number | null;
    first_byte_p50: number | null;
    first_byte_p95: number | null;
    rounds_p50: number | null;
    rounds_p95: number | null;
    tools_p50: number | null;
    tools_p95: number | null;
    final_p50: number | null;
    final_p95: number | null;
    one_round: number;
    two_rounds: number;
    more_rounds: number;
    cache_hit: number | null;
    fast: number;
  }>;
  ask_tools: Array<Keyed & { name: string; n: number; avg_ms: number; max_ms: number }>;
  ask_by_workspace: Array<Keyed & { tenant_id: string; answers: number }>;
  ask_failures: Array<Keyed & { at: string; tenant_id: string; failure: string | null; said: string }>;
  ask_threads: Array<Keyed & { n: number }>;
  lines: Array<
    Keyed & {
      tenant_id: string;
      kind: string;
      voice_state: string | null;
      sms_state: string | null;
      whatsapp_state: string | null;
      error: string;
      since: string | null;
    }
  >;
  channels: Array<Keyed & { tenant_id: string; kind: string; status: string; updated_at: string }>;
  google: Array<Keyed & { tenant_id: string; error: string; last_synced_at: string | null }>;
  mailboxes: Array<
    Keyed & {
      tenant_id: string;
      provider: string;
      state: string;
      held_why: string | null;
      error: string;
      last_error_at: string | null;
    }
  >;
}

const inScopeRows = <T extends Keyed>(rows: readonly T[] | undefined, scope: HealthScope): T[] =>
  (rows ?? []).filter((r) => inScope(r.ours, scope));

const latest = (iso: readonly string[]): number => iso.reduce((m, s) => Math.max(m, Date.parse(s) || 0), 0);

// ----------------------------------------------------------------------------------------------------- sends

const SEND_CHANNEL_WORDS: Record<string, string> = {
  whatsapp: "WhatsApp",
  sms: "Texts",
  email: "Email",
  voice: "Calls",
  system: "The system",
};

/** The providers' codes we have met, in words; any other said as the provider titled it. */
const SEND_CODE_WORDS: Record<string, string> = {
  "131026": "Undeliverable: the number can't take WhatsApp messages",
  "131047": "Over 24 hours since they wrote: only a template may go",
  "131049": "Held back by Meta to keep engagement healthy",
  "131050": "They stopped marketing messages",
  "30003": "The phone is unreachable",
  "30005": "The number doesn't exist",
  "30006": "A landline, or a carrier that won't take texts",
  "30007": "The carrier filtered it",
  "21610": "They replied STOP",
};

export interface SendChannelVM {
  channel: string;
  words: string;
  total: number;
  failed: number;
  delivered: number;
  topError: string | null;
  lastMs: number | null;
  ours: boolean;
}

export interface SendsVM {
  total: number;
  failed: number;
  delivered: number;
  channels: SendChannelVM[];
  /** A channel failing on at least one send in twenty (twenty sends at least), per side: Needs a look's. */
  troubled: SendChannelVM[];
  errors: Array<{ channel: string; code: string; words: string; n: number }>;
}

/** The share of sends failing that makes a channel worth a look. */
const SENDS_TROUBLE_SHARE = 0.05;
const SENDS_TROUBLE_MIN = 20;

/** Sends by channel in the scope, with the providers' failure codes in words. */
export function sendsOf(parts: HealthPartsDto | null, scope: HealthScope): SendsVM {
  const rows = inScopeRows(parts?.sends, scope);
  const errs = inScopeRows(parts?.send_errors, scope);
  const codeWords = (code: string, title: string | null) => SEND_CODE_WORDS[code] ?? title ?? `code ${code}`;
  const channelOf = (channel: string, side: boolean | null): SendChannelVM => {
    const mine = rows.filter((r) => r.channel === channel && (side === null || r.ours === side));
    const mineErrs = errs.filter((e) => e.channel === channel && (side === null || e.ours === side));
    const top = [...mineErrs].sort((a, b) => b.n - a.n)[0];
    return {
      channel,
      words: SEND_CHANNEL_WORDS[channel] ?? channel,
      total: mine.reduce((n, r) => n + r.n, 0),
      failed: mine.filter((r) => r.status === "failed").reduce((n, r) => n + r.n, 0),
      delivered: mine.filter((r) => r.status === "delivered" || r.status === "read").reduce((n, r) => n + r.n, 0),
      topError: top ? `${codeWords(top.code, top.title)} (${top.code})` : null,
      lastMs: mineErrs.length ? latest(mineErrs.map((e) => e.last_at)) : null,
      ours: side ?? scope === "ours",
    };
  };
  const channels = [...new Set(rows.map((r) => r.channel))]
    .map((c) => channelOf(c, null))
    .sort((a, b) => b.total - a.total);
  const troubled = [true, false].flatMap((side) =>
    [...new Set(rows.filter((r) => r.ours === side).map((r) => r.channel))]
      .map((c) => channelOf(c, side))
      .filter((c) => c.total >= SENDS_TROUBLE_MIN && c.failed / c.total >= SENDS_TROUBLE_SHARE),
  );
  return {
    total: channels.reduce((n, c) => n + c.total, 0),
    failed: channels.reduce((n, c) => n + c.failed, 0),
    delivered: channels.reduce((n, c) => n + c.delivered, 0),
    channels,
    troubled,
    errors: errs
      .map((e) => ({ channel: e.channel, code: e.code, words: codeWords(e.code, e.title), n: e.n }))
      .sort((a, b) => b.n - a.n),
  };
}

// ----------------------------------------------------------------------------------------------------- calls

/** A call's end, in words: the provider's reason as a person says it. */
const CALL_REASON_WORDS: Record<string, string> = {
  user_hangup: "hung up",
  agent_hangup: "the receptionist ended it",
  voicemail_reached: "reached voicemail",
  call_transfer: "passed to a person",
  dial_no_answer: "nobody answered",
  dial_busy: "the line was busy",
  credit_exhausted: "the voice provider's credit ran out",
  error_unknown: "an error the provider didn't name",
  inactivity: "went quiet",
  max_duration_reached: "ran past the longest a call may last",
  concurrency_limit_reached: "too many calls at once",
};

/** The reasons that are ours to mend, never a caller's choice. */
const CALL_TROUBLE: Record<string, string> = {
  credit_exhausted: "Top up the voice provider's credit: every call fails until it is.",
  error_unknown: "The voice provider's log has the call: look it up by its time.",
  concurrency_limit_reached: "The voice provider's plan takes too few calls at once for this workspace.",
};

export interface CallsVM {
  total: number;
  connected: number;
  /** Each ending, the most first: its words in a sentence, and as a row's label. */
  reasons: Array<{ reason: string; words: string; label: string; n: number }>;
  trouble: Array<{ reason: string; words: string; n: number; why: string; lastMs: number }>;
  troubleByScope: Array<{ reason: string; words: string; n: number; why: string; lastMs: number; ours: boolean }>;
}

export function callsOf(parts: HealthPartsDto | null, scope: HealthScope): CallsVM {
  const rows = inScopeRows(parts?.calls, scope);
  const reasonWords = (r: string) => CALL_REASON_WORDS[r] ?? (r ? r.replace(/_/g, " ") : "no reason given");
  const byReason = new Map<string, { n: number; last: string[] }>();
  for (const r of rows) {
    const k = r.reason;
    const was = byReason.get(k) ?? { n: 0, last: [] };
    byReason.set(k, { n: was.n + r.n, last: [...was.last, r.last_at] });
  }
  const troubleRows = (side: boolean | null) =>
    [
      ...new Set(rows.filter((r) => r.status === "error" && (side === null || r.ours === side)).map((r) => r.reason)),
    ].map((reason) => {
      const mine = rows.filter(
        (r) => r.status === "error" && r.reason === reason && (side === null || r.ours === side),
      );
      return {
        reason,
        words: reasonWords(reason),
        n: mine.reduce((n, r) => n + r.n, 0),
        why: CALL_TROUBLE[reason] ?? "The call failed on the voice provider's side.",
        lastMs: latest(mine.map((r) => r.last_at)),
        ours: side ?? false,
      };
    });
  return {
    total: rows.reduce((n, r) => n + r.n, 0),
    connected: rows.filter((r) => r.status === "ended").reduce((n, r) => n + r.n, 0),
    reasons: [...byReason.entries()]
      .map(([reason, v]) => ({ reason, words: reasonWords(reason), label: capitalize(reasonWords(reason)), n: v.n }))
      .sort((a, b) => b.n - a.n),
    trouble: troubleRows(null),
    troubleByScope: [...troubleRows(true), ...troubleRows(false)],
  };
}

// -------------------------------------------------------------------------------------------------- webhooks

const PROVIDER_WORDS: Record<string, string> = {
  resend: "Resend",
  retell: "Retell",
  twilio: "Twilio",
  meta: "Meta",
  stripe: "Stripe",
  google: "Google",
  microsoft: "Microsoft",
};

export interface WebhooksVM {
  total: number;
  unverified: number;
  providers: Array<{ provider: string; words: string; n: number; unverified: number; lastMs: number; doors: string[] }>;
  billing: Array<{ type: string; state: string; n: number }>;
}

export function webhooksOf(parts: HealthPartsDto | null, scope: HealthScope, _nowMs: number): WebhooksVM {
  const rows = inScopeRows(parts?.webhooks, scope);
  const providers = [...new Set(rows.map((r) => r.provider))].map((provider) => {
    const mine = rows.filter((r) => r.provider === provider);
    return {
      provider,
      words: PROVIDER_WORDS[provider] ?? provider,
      n: mine.reduce((n, r) => n + r.n, 0),
      unverified: mine.reduce((n, r) => n + r.unverified, 0),
      lastMs: latest(mine.map((r) => r.last_at)),
      doors: [...new Set(mine.map((r) => r.door))],
    };
  });
  providers.sort((a, b) => b.n - a.n);
  return {
    total: providers.reduce((n, p) => n + p.n, 0),
    unverified: providers.reduce((n, p) => n + p.unverified, 0),
    providers,
    billing: (parts?.billing ?? []).map((b) => ({ type: b.type, state: b.state, n: b.n })),
  };
}

// ----------------------------------------------------------------------------------------------- model calls

const PURPOSE_WORDS: Record<ModelPurpose | "ask_warm", string> = {
  receptionist: "The receptionist",
  reply_draft: "Reply drafts",
  ask: "Ask",
  ask_warm: "Ask, kept warm",
  lead_json: "The lead finder's reads",
  template_draft: "Template drafts",
  review_reply: "Review replies",
  lead_judge: "The lead finder's judge",
  note_suggest: "Notes from calls",
  reach_out_check: "Reach-out checks",
  reply_read: "Reading leads' replies",
  booking_read: "Reading booking notices",
  lead_suggest: "Lead search suggestions",
};

function purposeWords(purpose: string): string {
  return (PURPOSE_WORDS as Record<string, string>)[purpose] ?? purpose.replace(/_/g, " ");
}

/** The outcomes that are no answer at all: the call's reason is kept (00469). */
const NO_ANSWER = new Set(["rejected", "unreachable"]);

export interface ModelCallsVM {
  total: number;
  usd: number;
  noAnswer: number;
  byPurpose: Array<{ purpose: string; words: string; n: number; noAnswer: number; usd: number }>;
  byWorkspace: Array<{ tenantId: string; ours: boolean; n: number; usd: number; askN: number; askUsd: number }>;
  failures: Array<{
    atMs: number;
    tenantId: string;
    ours: boolean;
    purpose: string;
    words: string;
    outcome: string;
    reason: string | null;
  }>;
  failureGroups: Array<{
    purpose: string;
    words: string;
    ours: boolean;
    n: number;
    lastMs: number;
    reason: string | null;
    credit: boolean;
    where: string[];
  }>;
}

/** A failed call's reason in one line: the API's type and words, or none kept. */
function failureReasonOf(f: { error_type: string | null; error_message: string | null }): string | null {
  if (!f.error_type && !f.error_message) return null;
  return [f.error_type, f.error_message].filter(Boolean).join(": ");
}

export function modelCallsOf(parts: HealthPartsDto | null, scope: HealthScope): ModelCallsVM {
  const rows = inScopeRows(parts?.model, scope);
  const ws = inScopeRows(parts?.model_by_workspace, scope);
  const fails = inScopeRows(parts?.model_failures, scope);
  const purposes = [...new Set(rows.map((r) => r.purpose))].map((purpose) => {
    const mine = rows.filter((r) => r.purpose === purpose);
    return {
      purpose,
      words: purposeWords(purpose),
      n: mine.reduce((n, r) => n + r.n, 0),
      noAnswer: mine.filter((r) => NO_ANSWER.has(r.outcome)).reduce((n, r) => n + r.n, 0),
      usd: mine.reduce((n, r) => n + Number(r.usd), 0),
    };
  });
  purposes.sort((a, b) => b.usd - a.usd || b.n - a.n);
  const tenants = [...new Set(ws.map((r) => r.tenant_id))].map((tenantId) => {
    const mine = ws.filter((r) => r.tenant_id === tenantId);
    return {
      tenantId,
      ours: mine[0]?.ours ?? false,
      n: mine.reduce((n, r) => n + r.n, 0),
      usd: mine.reduce((n, r) => n + Number(r.usd), 0),
      askN: mine.filter((r) => r.purpose === "ask").reduce((n, r) => n + r.n, 0),
      askUsd: mine.filter((r) => r.purpose === "ask").reduce((n, r) => n + Number(r.usd), 0),
    };
  });
  tenants.sort((a, b) => b.usd - a.usd);
  const groups = [true, false].flatMap((side) =>
    [...new Set(fails.filter((f) => f.ours === side).map((f) => f.purpose))].map((purpose) => {
      const mine = fails.filter((f) => f.ours === side && f.purpose === purpose);
      const newest = [...mine].sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0];
      const reason = newest ? failureReasonOf(newest) : null;
      return {
        purpose,
        words: purposeWords(purpose),
        ours: side,
        n: mine.length,
        lastMs: latest(mine.map((f) => f.at)),
        reason,
        credit: mine.some((f) => creditRanOut({ type: f.error_type ?? "", message: f.error_message ?? "" })),
        where: [...new Set(mine.map((f) => f.tenant_id))],
      };
    }),
  );
  return {
    total: purposes.reduce((n, p) => n + p.n, 0),
    usd: purposes.reduce((n, p) => n + p.usd, 0),
    noAnswer: purposes.reduce((n, p) => n + p.noAnswer, 0),
    byPurpose: purposes,
    byWorkspace: tenants,
    failures: fails.map((f) => ({
      atMs: Date.parse(f.at),
      tenantId: f.tenant_id,
      ours: f.ours,
      purpose: f.purpose,
      words: purposeWords(f.purpose),
      outcome: f.outcome,
      reason: failureReasonOf(f),
    })),
    failureGroups: groups,
  };
}

// ------------------------------------------------------------------------------------------------ deliveries

export interface DeliveriesVM {
  total: number;
  failed: number;
  /** Each subscriber: its words in a sentence, and as a row's label. */
  subscribers: Array<{
    subscriber: string;
    words: string;
    label: string;
    done: number;
    failed: number;
    waiting: number;
  }>;
  failures: Array<{
    subscriber: string;
    words: string;
    ours: boolean;
    n: number;
    lastMs: number;
    reason: string;
    where: string[];
  }>;
}

export function deliveriesOf(parts: HealthPartsDto | null, scope: HealthScope): DeliveriesVM {
  const rows = inScopeRows(parts?.deliveries, scope);
  const fails = inScopeRows(parts?.delivery_failures, scope);
  const subs = [...new Set(rows.map((r) => r.subscriber))].map((subscriber) => {
    const mine = rows.filter((r) => r.subscriber === subscriber);
    const n = (state: string) => mine.filter((r) => r.state === state).reduce((s, r) => s + r.n, 0);
    return {
      subscriber,
      words: subscriberWords(subscriber),
      label: capitalize(subscriberWords(subscriber)),
      done: n("done"),
      failed: n("failed"),
      waiting: n("scheduled") + n("paused"),
    };
  });
  subs.sort((a, b) => b.failed - a.failed || b.done - a.done);
  const groups = [true, false].flatMap((side) =>
    [...new Set(fails.filter((f) => f.ours === side).map((f) => f.subscriber))].map((subscriber) => {
      const mine = fails.filter((f) => f.ours === side && f.subscriber === subscriber);
      const newest = [...mine].sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))[0];
      return {
        subscriber,
        words: subscriberWords(subscriber),
        ours: side,
        n:
          rows
            .filter((r) => r.ours === side && r.subscriber === subscriber && r.state === "failed")
            .reduce((s, r) => s + r.n, 0) || mine.length,
        lastMs: latest(mine.map((f) => f.updated_at)),
        reason: newest?.last_error || "No reason was kept.",
        where: [...new Set(mine.map((f) => f.tenant_id))],
      };
    }),
  );
  return {
    total: subs.reduce((n, s) => n + s.done + s.failed + s.waiting, 0),
    failed: subs.reduce((n, s) => n + s.failed, 0),
    subscribers: subs,
    failures: groups,
  };
}

// ----------------------------------------------------------------------------------------------- connections

export interface ConnectionVM {
  key: string;
  what: string;
  why: string;
  tenantId: string;
  ours: boolean;
  sinceMs: number | null;
}

const ms = (iso: string | null) => (iso ? Date.parse(iso) || null : null);

/** The connections that are not healthy: a line with an error, a channel turned off, a Google sync failing, a held mailbox. */
export function connectionsOf(parts: HealthPartsDto | null): ConnectionVM[] {
  return [
    ...(parts?.lines ?? []).map((l) => ({
      key: `line:${l.tenant_id}:${l.kind}`,
      what:
        l.voice_state === "failed"
          ? "A phone line's calls failed to set up"
          : l.whatsapp_state === "failed"
            ? "A line's WhatsApp failed to connect"
            : "A phone line reports an error",
      why: l.error || "The line's own state says it failed.",
      tenantId: l.tenant_id,
      ours: l.ours,
      sinceMs: ms(l.since),
    })),
    ...(parts?.channels ?? []).map((c) => ({
      key: `channel:${c.tenant_id}:${c.kind}`,
      what: `${SEND_CHANNEL_WORDS[c.kind] ?? c.kind} is turned off`,
      why: "Its routing row is disabled: messages to it reach no workspace.",
      tenantId: c.tenant_id,
      ours: c.ours,
      sinceMs: ms(c.updated_at),
    })),
    ...(parts?.google ?? []).map((g) => ({
      key: `google:${g.tenant_id}`,
      what: "Google Business Profile isn't syncing",
      why: g.error,
      tenantId: g.tenant_id,
      ours: g.ours,
      sinceMs: ms(g.last_synced_at),
    })),
    ...(parts?.mailboxes ?? []).map((b) => ({
      key: `mailbox:${b.tenant_id}:${b.provider}`,
      what:
        b.state === "reconnect"
          ? `A ${b.provider === "google" ? "Gmail" : "Microsoft"} mailbox needs connecting again`
          : `A mailbox is ${b.state}`,
      why: b.held_why ? `Held for ${b.held_why}.` : b.error || "Its state says so.",
      tenantId: b.tenant_id,
      ours: b.ours,
      sinceMs: ms(b.last_error_at),
    })),
  ];
}
