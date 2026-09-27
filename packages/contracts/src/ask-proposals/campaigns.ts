/**
 * Campaigns' cards: a broadcast, a playbook that sends on its own, and a playbook's run that waits for a person.
 */
import { SENDING_HOURS_WORDS } from "../playbooks/playbook-triggers";
import { clockWhen } from "../shared/clock";
import { plural } from "../shared/words";
import {
  PROPOSAL_WORDS,
  asText,
  decisionOf,
  idIn,
  rec,
  refuseWith,
  type ProposalCall,
  type ProposalSpec,
} from "./spec";

/** What a member does with a playbook's run that waits for them (the Phase 4 plan, D11): send it, or end it unsent. */
export const RUN_VERBS = ["approve", "skip"] as const;

/** A broadcast's cancel: the undo of a broadcast sent from a card, and of a run approved from one. */
const cancelCall = (u: Record<string, unknown>): ProposalCall => ({
  route: "POST broadcasts/[id]/cancel",
  params: { id: asText(u.broadcast_id) },
});
/** What the cancel did, as the undo's receipt says it: stopped mid-send, or nothing will send. */
const canceled = (data: unknown): string =>
  rec(data).was === "sending" ? "Stopped — it ends after this batch" : "Canceled — nothing will send";

export const broadcastSpec: ProposalSpec = {
  needs: "operator",
  gate: "approve",
  commit: ({ payload: pl }) => ({
    route: "POST broadcasts",
    body: {
      template_id: pl.template_id,
      params: Array.isArray(pl.params) ? pl.params : [],
      audience: { kind: pl.audience_kind, id: pl.audience_id ?? null },
      scheduled_for: pl.scheduled_for ?? null,
      name: pl.name ?? null,
    },
  }),
  // The count and the name are the route's answer where it gave them, the card's where it did not.
  receipt: ({ payload: pl }, data) => {
    const n = Number(rec(data).recipient_count ?? pl.count ?? 0);
    return `Broadcast “${rec(data).name ?? asText(pl.name)}” — ${n} ${n === 1 ? "person" : "people"}, ${pl.scheduled_for ? "scheduled" : "sending now"}`;
  },
  undo: {
    label: () => "Cancel it, if it has not finished",
    window: "ten_minutes",
    record: (_p, data) => ({ broadcast_id: rec(data).id, decision_id: decisionOf(data) }),
    call: cancelCall,
    receipt: canceled,
  },
  open: () => "broadcasts",
};

export const playbookSpec: ProposalSpec = {
  needs: "operator",
  gate: "approve",
  commit: ({ payload: pl }) => ({
    route: "POST playbooks",
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
  }),
  receipt: ({ payload: pl }, data) =>
    `Playbook “${rec(data).name ?? asText(pl.name)}” is running — its next run is on the card in Campaigns › Playbooks`,
  undo: {
    label: () => "Delete it — nothing will run",
    window: "ten_minutes",
    record: (_p, data) => ({ playbook_id: rec(data).id, decision_id: decisionOf(data) }),
    call: (u) => ({ route: "DELETE playbooks/[id]", params: { id: asText(u.playbook_id) } }),
    receipt: () => "Deleted — nothing will run",
  },
  open: () => "outbound",
};

/**
 * When an approved run goes, as the Broadcasts page says it (bcWhenWords): now, or -- approved outside the hours a
 * message may go out in -- when they open, by the business's clock, which the card carries. The route answers when it
 * was approved (moved_from) beside when it goes, so the day is said from the moment of the approval.
 */
function runGoes(pl: Record<string, unknown>, data: unknown): string {
  const d = rec(data);
  const at = Date.parse(asText(d.scheduled_for));
  const from = Date.parse(asText(d.moved_from));
  const tz = asText(pl.timezone);
  return tz && Number.isFinite(at) && Number.isFinite(from)
    ? `scheduled for ${clockWhen(at, tz, from)} — messages go out ${SENDING_HOURS_WORDS.between} by your clock`
    : "sending now";
}

/** What a skip did to the run, as the Broadcasts page says a cancel: skipped, or, had it moved on since, what it became. */
const skipped = (data: unknown): string => {
  const was = rec(data).was;
  return was === "sending"
    ? "stops after this batch"
    : was === "pending_approval"
      ? "skipped — nothing will send"
      : "canceled — nothing will send";
};

export const runSpec: ProposalSpec = {
  needs: "operator",
  gate: "approve",
  // The run's own doors, as the Playbooks card and the Broadcasts sheet press them: approve sends it, skip is its
  // cancel. The verb is the card's to say (no default, the Phase 4 plan, D11): a card that says neither is never sent.
  commit: ({ payload: pl }) => {
    const id = idIn(pl, "broadcast_id");
    if (!id || !(RUN_VERBS as readonly unknown[]).includes(pl.verb)) return refuseWith(PROPOSAL_WORDS.cannotApprove);
    return {
      route: pl.verb === "approve" ? "POST broadcasts/[id]/approve" : "POST broadcasts/[id]/cancel",
      params: { id },
    };
  },
  // The Broadcasts page's words: approved, with how many and when it goes; or what the skip did.
  receipt: ({ payload: pl }, data) => {
    const name = asText(pl.name) || "The run";
    if (pl.verb !== "approve") return `${name} ${skipped(data)}`;
    const n = Number(rec(data).recipient_count ?? pl.people ?? 0);
    return `${name} approved — ${plural(n, "person", "people")}, ${runGoes(pl, data)}`;
  },
  // An approved run is canceled as a broadcast is; a skip has nothing to undo.
  undo: {
    label: ({ payload }) => (payload.verb === "approve" ? "Cancel it, if it has not finished" : null),
    window: "ten_minutes",
    record: (p, data) =>
      p.payload.verb === "approve" ? { broadcast_id: rec(data).id, decision_id: decisionOf(data) } : null,
    call: cancelCall,
    receipt: canceled,
  },
  // The run's sheet, where Today and the Playbooks card open it.
  open: ({ payload }) => {
    const id = idIn(payload, "broadcast_id");
    return id ? `broadcasts/run:${id}` : "broadcasts";
  },
};
