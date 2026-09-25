/**
 * A card's commit and its undo, through the verb's own route.
 *
 * Every proposal the assistant makes lands here when the person approves it.
 * The route re-checks the role and the state; this module only knows which
 * route, what to send, what the receipt says, and what undo needs. After a
 * commit lands, the refresh map re-reads the surfaces it touched, the same
 * as when the page's own button is pressed, so this module drags none of the
 * Next-only imports behind them and can be executed in a test.
 *
 * Two marks ride with every call. `via: "ask"` tells the ledger a card was
 * tapped, not a button. And an undo names the decision it reverses: the
 * commit keeps the ledger row's id the route answered with, and the inverse
 * call sends it as `undoOf`, which the ledger writes into `undo_of` -- so
 * "this row undid that one" is on the record, not inferred from timestamps.
 * Policy and settings changes live in the events ledger, which has no row
 * ids to hand back, so their undo is a change like any other there.
 *
 * The client is a parameter with the tab's own as the default, so a test
 * hands in one bound to a fake fetch and runs every branch for real.
 */
import {
  ASK_THREAD_VERBS,
  DEAL_STAGE_WORDS,
  NOTE_WORDS,
  PERSON_MODE_WORDS,
  applySettingsChange,
  type AskProposal,
  type AskProposalOutcome,
} from "@chanlytics/contracts";
import type { Api, Input } from "../../client/api";
import { apiFor } from "../api";
import { viaAsk } from "./api";

export type CommitResult =
  { ok: true; receipt: string; undo: Record<string, unknown> | null } | { ok: false; message: string };

interface Loaded {
  __SETTINGS?: { config?: Record<string, unknown> | null; version?: number } | null;
}

/** The thread verbs with an Inbox route of their own; `resolve` closes the escalation instead. A test holds this to ASK_THREAD_VERBS. */
export const THREAD_ROUTE = {
  take_over: "POST conversations/[id]/take-over",
  hand_back: "POST conversations/[id]/hand-back",
  snooze: "POST conversations/[id]/snooze",
  wake: "POST conversations/[id]/wake",
  archive: "POST conversations/[id]/archive",
} as const;
type ThreadVerb = keyof typeof THREAD_ROUTE;
const isThreadVerb = (v: string): v is ThreadVerb => v in THREAD_ROUTE;
const isProposable = (v: string): boolean => (ASK_THREAD_VERBS as readonly string[]).includes(v);
const INVERSE: Record<string, string> = {
  take_over: "hand_back",
  hand_back: "take_over",
  snooze: "wake",
  wake: "snooze",
};
const RECEIPT: Record<string, string> = {
  hand_back: "The receptionist has it again",
  snooze: "Snoozed",
  wake: "Back in the Inbox",
  archive: "Archived",
  resolve: "Resolved",
};

/** A payload field as the route's string param: the proposal carries ids as JSON, the route takes them as text. */
const s = (v: unknown): string => (v == null ? "" : String(v));
/** A ledger row id the route answered with, or null when it answered none. */
const decisionOf = (data: unknown): string | null => {
  const id = (data as { decision_id?: unknown } | null)?.decision_id;
  return typeof id === "string" && id ? id : null;
};

/** A thread verb by name; the snooze carries its `until`. */
function threadVerb(client: Api, verb: ThreadVerb, conversationId: string, until: unknown, undoOf?: string) {
  return verb === "snooze"
    ? viaAsk(
        client,
        "POST conversations/[id]/snooze",
        { params: { id: conversationId }, body: { until: s(until) } },
        undoOf,
      )
    : viaAsk(client, THREAD_ROUTE[verb], { params: { id: conversationId } }, undoOf);
}

export async function commitProposal(win: Window, p: AskProposal, client: Api = apiFor(win)): Promise<CommitResult> {
  const pl = p.payload;
  switch (p.kind) {
    case "reply": {
      const r = await viaAsk(client, "POST conversations/[id]/reply", {
        params: { id: s(pl.conversation_id) },
        body: { text: s(pl.text) },
      });
      if (!r.ok) return r;
      return {
        ok: true,
        receipt: `On its way to ${s(pl.who)} — sends in 15 seconds unless you cancel`,
        undo: {
          message_id: r.data.message_id,
          cancelable_until: r.data.cancelable_until,
          decision_id: decisionOf(r.data),
        },
      };
    }
    case "steer": {
      const r = await viaAsk(client, "POST messages/[id]/steer", {
        params: { id: s(pl.message_id) },
        body: { text: s(pl.instruction) },
      });
      if (!r.ok) return r;
      return { ok: true, receipt: "Rewritten — the new draft waits its turn", undo: null };
    }
    case "thread_verb": {
      const verb = s(pl.verb);
      if (!isProposable(verb) || (verb !== "resolve" && !isThreadVerb(verb)))
        return { ok: false, message: "This card cannot be approved from here." };
      const r =
        verb === "resolve"
          ? await viaAsk(client, "POST escalations/[id]/resolve", { params: { id: s(pl.escalation_id) } })
          : await threadVerb(client, verb as ThreadVerb, s(pl.conversation_id), pl.until);
      if (!r.ok) return r;
      const receipt = verb === "take_over" ? `You have ${s(pl.who)}'s thread` : (RECEIPT[verb] ?? "Done");
      return {
        ok: true,
        receipt,
        undo: INVERSE[verb]
          ? {
              verb: INVERSE[verb],
              conversation_id: pl.conversation_id,
              until: pl.until ?? null,
              decision_id: decisionOf(r.data),
            }
          : null,
      };
    }
    case "person_mode": {
      const r = await viaAsk(client, "PUT contacts/[id]/receptionist", {
        params: { id: s(pl.contact_id) },
        body: { mode: pl.mode as "auto" | "ask" | "never" | "inherit" },
      });
      if (!r.ok) return r;
      win.dispatchEvent(new CustomEvent("surface:clients"));
      return {
        ok: true,
        receipt: `Receptionist for ${s(pl.who)}: ${PERSON_MODE_WORDS[s(pl.mode) as keyof typeof PERSON_MODE_WORDS] ?? s(pl.mode)}`,
        undo: { contact_id: pl.contact_id, mode: pl.previous ?? "inherit", decision_id: decisionOf(r.data) },
      };
    }
    case "deal": {
      // The card's body is the route's body: `who` is the card's own word and the id is the route's param, so both
      // stay out of a request the route reads strictly. Its next step is beside the payload (AskProposal `step`), a
      // note of its own (0007, amended). No undo: a mis-recorded stage is moved again on the person's page, and a
      // step is changed or done there.
      const { who: _who, contact_id: _id, ...body } = pl;
      const r = await viaAsk(client, "POST contacts/[id]/deal", {
        params: { id: s(pl.contact_id) },
        body: body as Input<"POST contacts/[id]/deal">,
      });
      if (!r.ok) return r;
      win.dispatchEvent(new CustomEvent("surface:clients"));
      const receipt = `${s(pl.who)} · ${DEAL_STAGE_WORDS[s(pl.stage) as keyof typeof DEAL_STAGE_WORDS] ?? s(pl.stage)}`;
      const step = p.step;
      if (!step) return { ok: true, receipt, undo: null };
      // The step after the deal, naming the row the door wrote (a new proposal's card has no id to name): the team's,
      // with its day. It answers as the door takes it, People read again behind it. The deal stands either way, so a
      // step the door refused is said on the receipt, to set again on their page.
      const n = await viaAsk(client, "POST contacts/[id]/notes", {
        params: { id: s(pl.contact_id) },
        body: { body: step.body, due_on: step.due_on, team_only: true, deal_id: r.data.deal.id },
        refresh: "behind",
      });
      if (!n.ok) return { ok: true, receipt: `${receipt} · the next step was not saved: ${n.message}`, undo: null };
      win.dispatchEvent(new CustomEvent("note:saved", { detail: { personId: s(pl.contact_id) } }));
      return { ok: true, receipt: `${receipt} · ${NOTE_WORDS.stepAdded}`, undo: null };
    }
    case "policy": {
      const body: Record<string, unknown> = { class: pl.class };
      if (pl.mode) body.mode = pl.mode;
      if (typeof pl.min_confidence === "number") body.minConfidence = pl.min_confidence;
      const r = await viaAsk(client, "PUT policies", { body });
      if (!r.ok) return r;
      const prev = (pl.previous ?? {}) as { mode?: string | null; min_confidence?: number | null };
      return {
        ok: true,
        receipt: `Autonomy changed: ${p.summary}`,
        undo: { class: pl.class, mode: prev.mode ?? null, min_confidence: prev.min_confidence ?? null },
      };
    }
    case "settings": {
      const st = (win as unknown as Loaded).__SETTINGS;
      if (!st || !st.config || typeof st.version !== "number")
        return { ok: false, message: "Settings are not loaded yet — open Settings once and try again." };
      const before = st.config;
      const next = applySettingsChange(
        before as Parameters<typeof applySettingsChange>[0],
        pl.change as Parameters<typeof applySettingsChange>[1],
      );
      const r = await viaAsk(client, "PUT settings", { body: { config: next, version: st.version } });
      if (!r.ok) return r;
      // The version this save wrote travels with the undo: restoring the whole
      // earlier config is safe only while that is still the version loaded.
      return { ok: true, receipt: p.summary, undo: { config: before, version_after: r.data.version } };
    }
    case "whisper": {
      const r = await viaAsk(client, "POST calls/[id]/whisper", {
        params: { id: s(pl.call_id) },
        body: { text: s(pl.text), trigger: false },
      });
      if (!r.ok) return r;
      return { ok: true, receipt: "Whispered — the receptionist works it into its next answer", undo: null };
    }
    case "invite": {
      const r = await viaAsk(client, "POST team/invite", {
        body: { email: s(pl.email), role: pl.role as "operator" | "viewer" },
      });
      if (!r.ok) return r;
      return { ok: true, receipt: `Invited ${s(pl.email)} as ${s(pl.role)}`, undo: null };
    }
    case "broadcast": {
      const r = await viaAsk(client, "POST broadcasts", {
        body: {
          template_id: pl.template_id,
          params: Array.isArray(pl.params) ? pl.params : [],
          audience: { kind: pl.audience_kind, id: pl.audience_id ?? null },
          scheduled_for: pl.scheduled_for ?? null,
          name: pl.name ?? null,
        },
      });
      if (!r.ok) return r;
      const n = Number(r.data.recipient_count ?? pl.count ?? 0);
      return {
        ok: true,
        receipt: `Broadcast “${r.data.name ?? s(pl.name)}” — ${n} ${n === 1 ? "person" : "people"}, ${pl.scheduled_for ? "scheduled" : "sending now"}`,
        undo: { broadcast_id: r.data.id, decision_id: decisionOf(r.data) },
      };
    }
    case "playbook": {
      const r = await viaAsk(client, "POST playbooks", {
        body: {
          name: pl.name ?? null,
          trigger: pl.trigger,
          // On a list (decision 0009): the list it names, and whether it sends an offer or a win-back.
          ...(pl.list_key ? { list_key: pl.list_key } : pl.list_id ? { list_id: pl.list_id } : {}),
          ...(pl.list_key || pl.list_id ? { policy_class: pl.policy_class } : {}),
          template_id: pl.template_id,
          params: Array.isArray(pl.params) ? pl.params : [],
          run_hour: pl.run_hour,
          cap_per_run: pl.cap_per_run,
          gap_days: pl.gap_days,
          cadence_days: pl.cadence_days,
        },
      });
      if (!r.ok) return r;
      return {
        ok: true,
        receipt: `Playbook “${r.data.name ?? s(pl.name)}” is running — its next run is on the card in Campaigns › Playbooks`,
        undo: { playbook_id: r.data.id, decision_id: decisionOf(r.data) },
      };
    }
    case "lead_search": {
      const amends = (pl.amends ?? null) as { search_id?: unknown; name?: unknown } | null;
      if (amends && typeof amends.search_id === "string" && amends.search_id) {
        // The card answers the search that asked (spec G4): the route sets the answer's version and count.
        const a = await viaAsk(client, "POST lead-searches/[id]/answer", {
          params: { id: amends.search_id },
          body: { answer: "include", plan: pl.plan } as never,
        });
        if (!a.ok) return a;
        return {
          ok: true,
          receipt: `Answered. ${s(amends.name) || "The search"} carries on with your answer; Leads shows it.`,
          undo: null,
        };
      }
      const plan = (pl.plan ?? {}) as { count?: number; terms?: string[] };
      // The thread the card was planned in rides beside the plan (the Ask route set it on the card), so the search
      // keeps it and the answer to its question lands there (00172). A card from before has none.
      const threadId = typeof pl.thread_id === "string" && pl.thread_id ? pl.thread_id : null;
      const r = await viaAsk(client, "POST lead-searches", {
        body: (threadId ? { ...(pl.plan as object), thread_id: threadId } : pl.plan) as never,
      });
      if (!r.ok) return r;
      return {
        ok: true,
        receipt:
          `Finding ${plan.count ?? ""} ${plan.terms?.[0] ?? "businesses"}. It carries on if you leave; Leads shows it.`.replace(
            /\s+/g,
            " ",
          ),
        undo: { search_id: r.data.search_id },
      };
    }
    default:
      return { ok: false, message: "This card cannot be approved from here." };
  }
}

export async function undoProposal(
  win: Window,
  p: AskProposal,
  outcome: AskProposalOutcome,
  client: Api = apiFor(win),
): Promise<CommitResult> {
  const u = (outcome.undo ?? null) as Record<string, unknown> | null;
  if (!u) return { ok: false, message: "This one has no undo." };
  // The row this undo reverses, when the commit's route answered with one.
  const undoOf = typeof u.decision_id === "string" && u.decision_id ? u.decision_id : undefined;
  switch (p.kind) {
    case "reply": {
      const r = await viaAsk(client, "POST messages/[id]/cancel-send", { params: { id: s(u.message_id) } }, undoOf);
      if (!r.ok) return r;
      return { ok: true, receipt: "Canceled before it sent", undo: null };
    }
    case "thread_verb": {
      const verb = s(u.verb);
      if (!isThreadVerb(verb)) return { ok: false, message: "This one has no undo." };
      const r = await threadVerb(client, verb, s(u.conversation_id), u.until, undoOf);
      if (!r.ok) return r;
      return { ok: true, receipt: "Undone", undo: null };
    }
    case "person_mode": {
      const r = await viaAsk(
        client,
        "PUT contacts/[id]/receptionist",
        { params: { id: s(u.contact_id) }, body: { mode: u.mode as "auto" | "ask" | "never" | "inherit" } },
        undoOf,
      );
      if (!r.ok) return r;
      win.dispatchEvent(new CustomEvent("surface:clients"));
      return { ok: true, receipt: "Set back", undo: null };
    }
    case "broadcast": {
      const r = await viaAsk(client, "POST broadcasts/[id]/cancel", { params: { id: s(u.broadcast_id) } }, undoOf);
      if (!r.ok) return r;
      return {
        ok: true,
        receipt: r.data.was === "sending" ? "Stopped — it ends after this batch" : "Canceled — nothing will send",
        undo: null,
      };
    }
    case "playbook": {
      const r = await viaAsk(client, "DELETE playbooks/[id]", { params: { id: s(u.playbook_id) } }, undoOf);
      if (!r.ok) return r;
      return { ok: true, receipt: "Deleted — nothing will run", undo: null };
    }
    case "policy": {
      const body: Record<string, unknown> = { class: u.class };
      if (u.mode) body.mode = u.mode;
      if (typeof u.min_confidence === "number") body.minConfidence = u.min_confidence;
      if (!u.mode && typeof u.min_confidence !== "number")
        return { ok: false, message: "The previous setting is unknown; change it in Settings." };
      const r = await viaAsk(client, "PUT policies", { body });
      if (!r.ok) return r;
      return { ok: true, receipt: "Set back", undo: null };
    }
    case "settings": {
      const st = (win as unknown as Loaded).__SETTINGS;
      if (!st || typeof st.version !== "number") return { ok: false, message: "Settings are not loaded yet." };
      // The whole earlier config is written back only while nobody has saved
      // since: the version this card's save wrote must still be the one loaded.
      if (typeof u.version_after !== "number" || st.version !== u.version_after)
        return { ok: false, message: "Settings have changed since this card — change them in Settings." };
      const r = await viaAsk(client, "PUT settings", { body: { config: u.config, version: st.version } });
      if (!r.ok) return r;
      return { ok: true, receipt: "Previous settings are back", undo: null };
    }
    case "lead_search": {
      const r = await viaAsk(client, "POST lead-searches/[id]/stop", { params: { id: s(u.search_id) } }, undoOf);
      if (!r.ok) return r;
      return {
        ok: true,
        receipt: "Stopping. Whatever it found is kept, and the emails already found are still checked.",
        undo: null,
      };
    }
    default:
      return { ok: false, message: "This one has no undo." };
  }
}

/** "Edit in the composer": open the thread with the words ready to change. */
export function editReply(win: Window, p: AskProposal): void {
  const pl = p.payload;
  win.location.hash = `/inbox/th-${s(pl.conversation_id)}`;
  win.setTimeout(
    () => win.dispatchEvent(new CustomEvent("inbox:focus-composer", { detail: { text: s(pl.text) } })),
    400,
  );
}
