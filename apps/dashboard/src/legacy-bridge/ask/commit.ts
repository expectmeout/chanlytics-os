/**
 * A card's commit and its undo, through the verb's own route.
 *
 * Every proposal the assistant makes lands here when the person approves it.
 * The route re-checks the role and the state; this module only knows which
 * route, what to send, what the receipt says, and what undo needs. The
 * surfaces refresh through the functions inbox-verbs.ts publishes on the
 * window, so this module drags none of the Next-only imports behind them
 * and can be executed in a test.
 */
import { applySettingsChange, type AskProposal, type AskProposalOutcome } from "@chanlytics/contracts";
import { viaAsk } from "./api";

export type CommitResult = { ok: true; receipt: string; undo: Record<string, unknown> | null } | { ok: false; message: string };

interface Refreshers {
  __refreshInbox?: () => Promise<void>;
  __refreshSettings?: () => Promise<void>;
  __refreshLive?: () => Promise<void>;
  __SETTINGS?: { config?: Record<string, unknown> | null; version?: number } | null;
}

const refresh = async (win: Window, which: "inbox" | "settings" | "live") => {
  const w = win as unknown as Refreshers;
  const fn = which === "inbox" ? w.__refreshInbox : which === "settings" ? w.__refreshSettings : w.__refreshLive;
  if (fn) await fn();
};

const THREAD_ROUTE: Record<string, string> = { take_over: "take-over", hand_back: "hand-back", snooze: "snooze", wake: "wake", archive: "archive" };
const INVERSE: Record<string, string> = { take_over: "hand_back", hand_back: "take_over", snooze: "wake", wake: "snooze" };
const RECEIPT: Record<string, string> = { hand_back: "The receptionist has it again", snooze: "Snoozed", wake: "Back in the Inbox", archive: "Archived", resolve: "Resolved" };

export async function commitProposal(win: Window, p: AskProposal): Promise<CommitResult> {
  const pl = p.payload as Record<string, unknown>;
  switch (p.kind) {
    case "reply": {
      const r = await viaAsk(win, `/api/v1/conversations/${pl.conversation_id}/reply`, { text: pl.text });
      if (!r.ok) return r;
      await refresh(win, "inbox");
      return { ok: true, receipt: `Sent to ${pl.who} — cancel within 15 seconds`, undo: { message_id: r.data.message_id, cancelable_until: r.data.cancelable_until } };
    }
    case "steer": {
      const r = await viaAsk(win, `/api/v1/messages/${pl.message_id}/steer`, { text: pl.instruction });
      if (!r.ok) return r;
      await refresh(win, "inbox");
      return { ok: true, receipt: "Rewritten — the new draft waits its turn", undo: null };
    }
    case "thread_verb": {
      const verb = String(pl.verb);
      const r = verb === "resolve"
        ? await viaAsk(win, `/api/v1/escalations/${pl.escalation_id}/resolve`)
        : await viaAsk(win, `/api/v1/conversations/${pl.conversation_id}/${THREAD_ROUTE[verb]}`, verb === "snooze" ? { until: pl.until } : undefined);
      if (!r.ok) return r;
      await refresh(win, "inbox");
      const receipt = verb === "take_over" ? `You have ${pl.who}'s thread` : RECEIPT[verb] ?? "Done";
      return { ok: true, receipt, undo: INVERSE[verb] ? { verb: INVERSE[verb], conversation_id: pl.conversation_id, until: pl.until ?? null } : null };
    }
    case "person_mode": {
      const r = await viaAsk(win, `/api/v1/contacts/${pl.contact_id}/receptionist`, { mode: pl.mode }, "PUT");
      if (!r.ok) return r;
      win.dispatchEvent(new CustomEvent("surface:clients"));
      return { ok: true, receipt: `Receptionist for ${pl.who}: ${pl.mode}`, undo: { contact_id: pl.contact_id, mode: pl.previous ?? "inherit" } };
    }
    case "policy": {
      const body: Record<string, unknown> = { class: pl.class };
      if (pl.mode) body.mode = pl.mode;
      if (typeof pl.min_confidence === "number") body.minConfidence = pl.min_confidence;
      const r = await viaAsk(win, "/api/v1/policies", body, "PUT");
      if (!r.ok) return r;
      await refresh(win, "settings");
      const prev = (pl.previous ?? {}) as { mode?: string | null; min_confidence?: number | null };
      return { ok: true, receipt: `Autonomy changed: ${p.summary}`, undo: { class: pl.class, mode: prev.mode ?? null, min_confidence: prev.min_confidence ?? null } };
    }
    case "settings": {
      const s = (win as unknown as Refreshers).__SETTINGS;
      if (!s || !s.config || typeof s.version !== "number") return { ok: false, message: "Settings are not loaded yet — open Settings once and try again." };
      const before = s.config;
      const next = applySettingsChange(before as Parameters<typeof applySettingsChange>[0], pl.change as Parameters<typeof applySettingsChange>[1]);
      const r = await viaAsk(win, "/api/v1/settings", { config: next, version: s.version }, "PUT");
      if (!r.ok) return r;
      await refresh(win, "settings");
      return { ok: true, receipt: p.summary, undo: { config: before } };
    }
    case "whisper": {
      const r = await viaAsk(win, `/api/v1/calls/${pl.call_id}/whisper`, { text: pl.text, trigger: false });
      if (!r.ok) return r;
      await refresh(win, "live");
      return { ok: true, receipt: "Whispered — the receptionist works it into its next answer", undo: null };
    }
    case "invite": {
      const r = await viaAsk(win, "/api/v1/team/invite", { email: pl.email, role: pl.role });
      if (!r.ok) return r;
      await refresh(win, "settings");
      return { ok: true, receipt: `Invited ${pl.email} as ${pl.role}`, undo: null };
    }
    case "broadcast": {
      const r = await viaAsk(win, "/api/v1/broadcasts", {
        template_id: pl.template_id,
        params: Array.isArray(pl.params) ? pl.params : [],
        audience: { kind: pl.audience_kind, id: pl.audience_id ?? null },
        scheduled_for: pl.scheduled_for ?? null,
        name: pl.name ?? null,
      });
      if (!r.ok) return r;
      const rb = (win as unknown as { __refreshBroadcasts?: () => Promise<void> }).__refreshBroadcasts;
      if (rb) await rb();
      const n = Number(r.data.recipient_count ?? pl.count ?? 0);
      return { ok: true, receipt: `Broadcast “${r.data.name ?? pl.name}” — ${n} ${n === 1 ? "person" : "people"}, ${pl.scheduled_for ? "scheduled" : "sending now"}`, undo: { broadcast_id: r.data.id } };
    }
    default:
      return { ok: false, message: "This card cannot be approved from here." };
  }
}

export async function undoProposal(win: Window, p: AskProposal, outcome: AskProposalOutcome): Promise<CommitResult> {
  const u = (outcome.undo ?? null) as Record<string, unknown> | null;
  if (!u) return { ok: false, message: "This one has no undo." };
  switch (p.kind) {
    case "reply": {
      const r = await viaAsk(win, `/api/v1/messages/${u.message_id}/cancel-send`);
      if (!r.ok) return r;
      await refresh(win, "inbox");
      return { ok: true, receipt: "Canceled before it sent", undo: null };
    }
    case "thread_verb": {
      const verb = String(u.verb);
      const r = await viaAsk(win, `/api/v1/conversations/${u.conversation_id}/${THREAD_ROUTE[verb]}`, verb === "snooze" ? { until: u.until } : undefined);
      if (!r.ok) return r;
      await refresh(win, "inbox");
      return { ok: true, receipt: "Undone", undo: null };
    }
    case "person_mode": {
      const r = await viaAsk(win, `/api/v1/contacts/${u.contact_id}/receptionist`, { mode: u.mode }, "PUT");
      if (!r.ok) return r;
      win.dispatchEvent(new CustomEvent("surface:clients"));
      return { ok: true, receipt: "Set back", undo: null };
    }
    case "broadcast": {
      const r = await viaAsk(win, `/api/v1/broadcasts/${u.broadcast_id}/cancel`);
      if (!r.ok) return r;
      const rb = (win as unknown as { __refreshBroadcasts?: () => Promise<void> }).__refreshBroadcasts;
      if (rb) await rb();
      return { ok: true, receipt: r.data.was === "sending" ? "Stopped — it ends after this batch" : "Canceled — nothing will send", undo: null };
    }
    case "policy": {
      const body: Record<string, unknown> = { class: u.class };
      if (u.mode) body.mode = u.mode;
      if (typeof u.min_confidence === "number") body.minConfidence = u.min_confidence;
      if (!u.mode && typeof u.min_confidence !== "number") return { ok: false, message: "The previous setting is unknown; change it in Settings." };
      const r = await viaAsk(win, "/api/v1/policies", body, "PUT");
      if (!r.ok) return r;
      await refresh(win, "settings");
      return { ok: true, receipt: "Set back", undo: null };
    }
    case "settings": {
      const s = (win as unknown as Refreshers).__SETTINGS;
      if (!s || typeof s.version !== "number") return { ok: false, message: "Settings are not loaded yet." };
      const r = await viaAsk(win, "/api/v1/settings", { config: u.config, version: s.version }, "PUT");
      if (!r.ok) return r;
      await refresh(win, "settings");
      return { ok: true, receipt: "Previous settings are back", undo: null };
    }
    default:
      return { ok: false, message: "This one has no undo." };
  }
}

/** "Edit in the composer": open the thread with the words ready to change. */
export function editReply(win: Window, p: AskProposal): void {
  const pl = p.payload as Record<string, unknown>;
  win.location.hash = `/inbox/th-${pl.conversation_id}`;
  win.setTimeout(() => win.dispatchEvent(new CustomEvent("inbox:focus-composer", { detail: { text: String(pl.text ?? "") } })), 400);
}
