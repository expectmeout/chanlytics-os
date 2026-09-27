/**
 * Campaigns' cards: a broadcast, and a playbook that sends on its own.
 */
import { asText, decisionOf, rec, type ProposalSpec } from "./spec";

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
    call: (u) => ({ route: "POST broadcasts/[id]/cancel", params: { id: asText(u.broadcast_id) } }),
    receipt: (data) =>
      rec(data).was === "sending" ? "Stopped — it ends after this batch" : "Canceled — nothing will send",
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
