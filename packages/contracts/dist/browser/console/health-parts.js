import { creditRanOut } from "../ai/usage.js";
import { capitalize } from "../shared/words.js";
import { inScope } from "./health-scope.js";
import { subscriberWords } from "./health-clocks.js";
const inScopeRows = (rows, scope) => (rows ?? []).filter((r) => inScope(r.ours, scope));
const latest = (iso) => iso.reduce((m, s) => Math.max(m, Date.parse(s) || 0), 0);
const SEND_CHANNEL_WORDS = {
  whatsapp: "WhatsApp",
  sms: "Texts",
  email: "Email",
  voice: "Calls",
  system: "The system"
};
const SEND_CODE_WORDS = {
  "131026": "Undeliverable: the number can't take WhatsApp messages",
  "131047": "Over 24 hours since they wrote: only a template may go",
  "131049": "Held back by Meta to keep engagement healthy",
  "131050": "They stopped marketing messages",
  "30003": "The phone is unreachable",
  "30005": "The number doesn't exist",
  "30006": "A landline, or a carrier that won't take texts",
  "30007": "The carrier filtered it",
  "21610": "They replied STOP"
};
const SENDS_TROUBLE_SHARE = 0.05;
const SENDS_TROUBLE_MIN = 20;
export function sendsOf(parts, scope) {
  const rows = inScopeRows(parts?.sends, scope);
  const errs = inScopeRows(parts?.send_errors, scope);
  const codeWords = (code, title) => SEND_CODE_WORDS[code] ?? title ?? `code ${code}`;
  const channelOf = (channel, side) => {
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
      ours: side ?? scope === "ours"
    };
  };
  const channels = [...new Set(rows.map((r) => r.channel))].map((c) => channelOf(c, null)).sort((a, b) => b.total - a.total);
  const troubled = [true, false].flatMap(
    (side) => [...new Set(rows.filter((r) => r.ours === side).map((r) => r.channel))].map((c) => channelOf(c, side)).filter((c) => c.total >= SENDS_TROUBLE_MIN && c.failed / c.total >= SENDS_TROUBLE_SHARE)
  );
  return {
    total: channels.reduce((n, c) => n + c.total, 0),
    failed: channels.reduce((n, c) => n + c.failed, 0),
    delivered: channels.reduce((n, c) => n + c.delivered, 0),
    channels,
    troubled,
    errors: errs.map((e) => ({ channel: e.channel, code: e.code, words: codeWords(e.code, e.title), n: e.n })).sort((a, b) => b.n - a.n)
  };
}
const CALL_REASON_WORDS = {
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
  concurrency_limit_reached: "too many calls at once"
};
const CALL_TROUBLE = {
  credit_exhausted: "Top up the voice provider's credit: every call fails until it is.",
  error_unknown: "The voice provider's log has the call: look it up by its time.",
  concurrency_limit_reached: "The voice provider's plan takes too few calls at once for this workspace."
};
export function callsOf(parts, scope) {
  const rows = inScopeRows(parts?.calls, scope);
  const reasonWords = (r) => CALL_REASON_WORDS[r] ?? (r ? r.replace(/_/g, " ") : "no reason given");
  const byReason = /* @__PURE__ */ new Map();
  for (const r of rows) {
    const k = r.reason;
    const was = byReason.get(k) ?? { n: 0, last: [] };
    byReason.set(k, { n: was.n + r.n, last: [...was.last, r.last_at] });
  }
  const troubleRows = (side) => [
    ...new Set(rows.filter((r) => r.status === "error" && (side === null || r.ours === side)).map((r) => r.reason))
  ].map((reason) => {
    const mine = rows.filter(
      (r) => r.status === "error" && r.reason === reason && (side === null || r.ours === side)
    );
    return {
      reason,
      words: reasonWords(reason),
      n: mine.reduce((n, r) => n + r.n, 0),
      why: CALL_TROUBLE[reason] ?? "The call failed on the voice provider's side.",
      lastMs: latest(mine.map((r) => r.last_at)),
      ours: side ?? false
    };
  });
  return {
    total: rows.reduce((n, r) => n + r.n, 0),
    connected: rows.filter((r) => r.status === "ended").reduce((n, r) => n + r.n, 0),
    reasons: [...byReason.entries()].map(([reason, v]) => ({ reason, words: reasonWords(reason), label: capitalize(reasonWords(reason)), n: v.n })).sort((a, b) => b.n - a.n),
    trouble: troubleRows(null),
    troubleByScope: [...troubleRows(true), ...troubleRows(false)]
  };
}
const PROVIDER_WORDS = {
  resend: "Resend",
  retell: "Retell",
  twilio: "Twilio",
  meta: "Meta",
  stripe: "Stripe",
  google: "Google",
  microsoft: "Microsoft"
};
export function webhooksOf(parts, scope, _nowMs) {
  const rows = inScopeRows(parts?.webhooks, scope);
  const providers = [...new Set(rows.map((r) => r.provider))].map((provider) => {
    const mine = rows.filter((r) => r.provider === provider);
    return {
      provider,
      words: PROVIDER_WORDS[provider] ?? provider,
      n: mine.reduce((n, r) => n + r.n, 0),
      unverified: mine.reduce((n, r) => n + r.unverified, 0),
      lastMs: latest(mine.map((r) => r.last_at)),
      doors: [...new Set(mine.map((r) => r.door))]
    };
  });
  providers.sort((a, b) => b.n - a.n);
  return {
    total: providers.reduce((n, p) => n + p.n, 0),
    unverified: providers.reduce((n, p) => n + p.unverified, 0),
    providers,
    billing: (parts?.billing ?? []).map((b) => ({ type: b.type, state: b.state, n: b.n }))
  };
}
const PURPOSE_WORDS = {
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
  ask_journal: "Ask's journal"
};
function purposeWords(purpose) {
  return PURPOSE_WORDS[purpose] ?? purpose.replace(/_/g, " ");
}
const NO_ANSWER = /* @__PURE__ */ new Set(["rejected", "unreachable"]);
function failureReasonOf(f) {
  if (!f.error_type && !f.error_message) return null;
  return [f.error_type, f.error_message].filter(Boolean).join(": ");
}
export function modelCallsOf(parts, scope) {
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
      usd: mine.reduce((n, r) => n + Number(r.usd), 0)
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
      askUsd: mine.filter((r) => r.purpose === "ask").reduce((n, r) => n + Number(r.usd), 0)
    };
  });
  tenants.sort((a, b) => b.usd - a.usd);
  const groups = [true, false].flatMap(
    (side) => [...new Set(fails.filter((f) => f.ours === side).map((f) => f.purpose))].map((purpose) => {
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
        where: [...new Set(mine.map((f) => f.tenant_id))]
      };
    })
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
      reason: failureReasonOf(f)
    })),
    failureGroups: groups
  };
}
export function deliveriesOf(parts, scope) {
  const rows = inScopeRows(parts?.deliveries, scope);
  const fails = inScopeRows(parts?.delivery_failures, scope);
  const subs = [...new Set(rows.map((r) => r.subscriber))].map((subscriber) => {
    const mine = rows.filter((r) => r.subscriber === subscriber);
    const n = (state) => mine.filter((r) => r.state === state).reduce((s, r) => s + r.n, 0);
    return {
      subscriber,
      words: subscriberWords(subscriber),
      label: capitalize(subscriberWords(subscriber)),
      done: n("done"),
      failed: n("failed"),
      waiting: n("scheduled") + n("paused")
    };
  });
  subs.sort((a, b) => b.failed - a.failed || b.done - a.done);
  const groups = [true, false].flatMap(
    (side) => [...new Set(fails.filter((f) => f.ours === side).map((f) => f.subscriber))].map((subscriber) => {
      const mine = fails.filter((f) => f.ours === side && f.subscriber === subscriber);
      const newest = [...mine].sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))[0];
      return {
        subscriber,
        words: subscriberWords(subscriber),
        ours: side,
        n: rows.filter((r) => r.ours === side && r.subscriber === subscriber && r.state === "failed").reduce((s, r) => s + r.n, 0) || mine.length,
        lastMs: latest(mine.map((f) => f.updated_at)),
        reason: newest?.last_error || "No reason was kept.",
        where: [...new Set(mine.map((f) => f.tenant_id))]
      };
    })
  );
  return {
    total: subs.reduce((n, s) => n + s.done + s.failed + s.waiting, 0),
    failed: subs.reduce((n, s) => n + s.failed, 0),
    subscribers: subs,
    failures: groups
  };
}
const ms = (iso) => iso ? Date.parse(iso) || null : null;
export function connectionsOf(parts) {
  return [
    ...(parts?.lines ?? []).map((l) => ({
      key: `line:${l.tenant_id}:${l.kind}`,
      what: l.voice_state === "failed" ? "A phone line's calls failed to set up" : l.whatsapp_state === "failed" ? "A line's WhatsApp failed to connect" : "A phone line reports an error",
      why: l.error || "The line's own state says it failed.",
      tenantId: l.tenant_id,
      ours: l.ours,
      sinceMs: ms(l.since)
    })),
    ...(parts?.channels ?? []).map((c) => ({
      key: `channel:${c.tenant_id}:${c.kind}`,
      what: `${SEND_CHANNEL_WORDS[c.kind] ?? c.kind} is turned off`,
      why: "Its routing row is disabled: messages to it reach no workspace.",
      tenantId: c.tenant_id,
      ours: c.ours,
      sinceMs: ms(c.updated_at)
    })),
    ...(parts?.google ?? []).map((g) => ({
      key: `google:${g.tenant_id}`,
      what: "Google Business Profile isn't syncing",
      why: g.error,
      tenantId: g.tenant_id,
      ours: g.ours,
      sinceMs: ms(g.last_synced_at)
    })),
    ...(parts?.mailboxes ?? []).map((b) => ({
      key: `mailbox:${b.tenant_id}:${b.provider}`,
      what: b.state === "reconnect" ? `A ${b.provider === "google" ? "Gmail" : "Microsoft"} mailbox needs connecting again` : `A mailbox is ${b.state}`,
      why: b.held_why ? `Held for ${b.held_why}.` : b.error || "Its state says so.",
      tenantId: b.tenant_id,
      ours: b.ours,
      sinceMs: ms(b.last_error_at)
    }))
  ];
}
