/**
 * People's lists: a list Ask proposes, kept current by its rule (the Phase 4 plan, D10).
 */
import { listToken } from "../people/lists";
import { PROPOSAL_WORDS, asText, idIn, rec, refuseWith, type ProposalSpec } from "./spec";

/** The names a delete that archived says (`paused`, `read_by`), as text. */
const namesIn = (d: Record<string, unknown>, k: string): string[] =>
  Array.isArray(d[k]) ? (d[k] as unknown[]).map(asText).filter(Boolean) : [];

export const listSpec: ProposalSpec = {
  needs: "operator",
  gate: "approve",
  // The route's body: the name and the rule the builder checked (cleanListRule), a list that keeps itself current. A
  // card with no rule is none: a list kept by hand is made on People, where its people are picked.
  commit: ({ payload: pl }) =>
    !asText(pl.name) || !pl.rule || typeof pl.rule !== "object"
      ? refuseWith(PROPOSAL_WORDS.cannotApprove)
      : { route: "POST segments", body: { name: asText(pl.name), rule: pl.rule } },
  // People's words for a list made by its rule, named as the route stored it.
  receipt: ({ payload: pl }, data) => `${asText(rec(data).name ?? pl.name)} made. It keeps itself current.`,
  undo: {
    label: () => "Delete it",
    window: "ten_minutes",
    // The list the route made, by the id it answered; the route answers no ledger row, so the undo names none.
    record: (_p, data) => {
      const id = idIn(rec(data), "id");
      return id ? { list_id: id } : null;
    },
    call: (u) => ({ route: "DELETE segments/[id]", params: { id: asText(u.list_id) } }),
    // Deleted, or archived where something came to depend on it since (a playbook on it, a list that reads it): the
    // route's answer says which, in People's words.
    receipt: (data) => {
      const d = rec(data);
      if (d.archived !== true) return "Deleted. The people stay.";
      const paused = namesIn(d, "paused");
      const readBy = namesIn(d, "read_by");
      const why = paused.length
        ? `${paused.join(", ")} paused`
        : readBy.length
          ? `${readBy.join(", ")} reads it`
          : "a playbook runs on it";
      return `Archived, not deleted: ${why}. It comes back from Archived under your lists.`;
    },
  },
  // People, at the list the route made once it is approved (the commit kept its id for the undo); People before.
  open: (_card, outcome) => {
    const id = idIn(rec(outcome?.undo), "list_id");
    return id ? `clients/${listToken({ kind: "saved", id })}` : "clients";
  },
};
