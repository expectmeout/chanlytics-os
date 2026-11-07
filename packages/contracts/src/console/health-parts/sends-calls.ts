/** Health parts: sends calls. */

import { capitalize } from "../../shared/words";
import { inScope, type HealthScope } from "../health-scope";

// ---------------------------------------------------------------------------------------------------- the read

interface Keyed {
  ours: boolean;
}

/** What platform_health_parts(p_days) answers (00469). */
export interface HealthPartsDto {
  days: number;
  sends: Array<Keyed & { channel: string; status: string; n: number }>;
  send_errors: Array<Keyed & { channel: string; code: string; title: string | null; n: number; last_at: string }>;
  /**
   * Each ending's calls, in the platform's words: the server attaches `words` and `mend` from the one table of endings
   * (voice/call-endings-platform.ts, callEndingOf), so a page loads the words of the endings it draws, never the table.
   */
  calls: Array<
    Keyed & { status: string; reason: string; n: number; last_at: string; words: string; mend: string | null }
  >;
  webhooks: Array<Keyed & { provider: string; door: string; n: number; unverified: number; last_at: string }>;
  billing: Array<{ type: string; state: string; n: number; last_at: string }>;
  model: Array<Keyed & { purpose: string; outcome: string; n: number; usd: number }>;
  /** What the replies sent did with the thread's draft (00539 reply_draft_uses, decision 0093). */
  draft_uses?: Array<Keyed & { use: string; n: number }>;
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

export const inScopeRows = <T extends Keyed>(rows: readonly T[] | undefined, scope: HealthScope): T[] =>
  (rows ?? []).filter((r) => inScope(r.ours, scope));

export const latest = (iso: readonly string[]): number => iso.reduce((m, s) => Math.max(m, Date.parse(s) || 0), 0);

// ----------------------------------------------------------------------------------------------------- sends

export const SEND_CHANNEL_WORDS: Record<string, string> = {
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
  // A call's end in words, and what mends it when it is ours: as the server read them off the one table.
  const sentence = new Map(rows.map((r) => [r.reason, r]));
  const reasonWords = (r: string) => sentence.get(r)?.words ?? (r ? r.replace(/_/g, " ") : "no reason given");
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
        why: sentence.get(reason)?.mend ?? "The call failed on the voice provider's side.",
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
