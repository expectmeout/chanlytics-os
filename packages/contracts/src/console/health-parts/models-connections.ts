/** Health parts: models connections. */

import type { HearingPurpose } from "../../ai/hearing";
import type { ModelPurpose } from "../../ai/models/routes";
import { creditRanOut } from "../../ai/usage";
import { capitalize } from "../../shared/words";
import type { HealthScope } from "../health-scope";
import { subscriberWords } from "../health-clocks";
import { SEND_CHANNEL_WORDS, inScopeRows, latest, type HealthPartsDto } from "./sends-calls";

// ----------------------------------------------------------------------------------------------- model calls

const PURPOSE_WORDS: Record<ModelPurpose | HearingPurpose | "ask_warm", string> = {
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
  ask_journal: "Ask's journal",
  receptionist_review: "Reviews of rehearsals and calls",
  fix_route: "Finding where a fix goes",
  website_read: "Reading websites",
  sender_read: "Sorting mailbox senders",
  file_look: "Looking at files",
  file_words: "Writing down what videos say",
  file_hear: "Listening to videos",
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

/** What the drafts came to, over the window: how many of the replies sent used the thread's draft, and how. */
export function draftUsesOf(
  parts: HealthPartsDto | null,
  scope: HealthScope,
): { asWritten: number; edited: number; notUsed: number } {
  const rows = inScopeRows(parts?.draft_uses, scope);
  const of = (use: string) => rows.filter((r) => r.use === use).reduce((n, r) => n + r.n, 0);
  return { asWritten: of("as_written"), edited: of("edited"), notUsed: of("not_used") };
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
    ...(parts?.lines ?? []).map((row) => ({
      key: `line:${row.tenant_id}:${row.kind}`,
      what:
        row.voice_state === "failed"
          ? "A phone line's calls failed to set up"
          : row.whatsapp_state === "failed"
            ? "A line's WhatsApp failed to connect"
            : "A phone line reports an error",
      why: row.error || "The line's own state says it failed.",
      tenantId: row.tenant_id,
      ours: row.ours,
      sinceMs: ms(row.since),
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
    ...(parts?.mailboxes ?? []).map((row) => ({
      key: `mailbox:${row.tenant_id}:${row.provider}`,
      what:
        row.state === "reconnect"
          ? `A ${row.provider === "google" ? "Gmail" : "Microsoft"} mailbox needs connecting again`
          : `A mailbox is ${row.state}`,
      why: row.held_why ? `Held for ${row.held_why}.` : row.error || "Its state says so.",
      tenantId: row.tenant_id,
      ours: row.ours,
      sinceMs: ms(row.last_error_at),
    })),
  ];
}
