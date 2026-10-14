/**
 * People's lists: a list Ask proposes, kept current by its rule (the Phase 4 plan, D10).
 */
import { listToken } from "../people/lists/lists";
import { PEOPLE_CHANGED, PROPOSAL_WORDS, asText, idIn, rec, refuseWith, type ProposalSpec } from "./spec";

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
          : "a campaign runs on it";
      return `Archived, not deleted: ${why}. It comes back from Archived under your lists.`;
    },
  },
  // People, at the list the route made once it is approved (the commit kept its id for the undo); People before.
  open: (_card, outcome) => {
    const id = idIn(rec(outcome?.undo), "list_id");
    return id ? `clients/${listToken({ kind: "saved", id })}` : "clients";
  },
};

/** The ids a payload names, as text. */
const idsIn = (v: unknown): string[] => (Array.isArray(v) ? v.map(asText).filter(Boolean) : []);

/**
 * People on or off a list kept by hand: the person page's list picker ticks one, a selection puts many on (the sheets
 * as verbs, 14 Oct 2026). One part of the route's at a time (people-lists.ts sends a big selection in turns). Its undo
 * puts back what it changed and nothing else: the people already on the list were never in `add`.
 */
export const listMemberSpec: ProposalSpec = {
  needs: "operator",
  gate: "approve",
  commit: ({ payload: pl }) => {
    const add = idsIn(pl.add);
    const remove = idsIn(pl.remove);
    if (!asText(pl.list_id) || (!add.length && !remove.length)) return refuseWith(PROPOSAL_WORDS.cannotApprove);
    return {
      route: "PUT segments/[id]",
      params: { id: asText(pl.list_id) },
      body: add.length ? { add } : { remove },
      events: [PEOPLE_CHANGED],
    };
  },
  receipt: ({ payload: pl }) => {
    const add = idsIn(pl.add);
    const name = asText(pl.name);
    const who = asText(pl.who);
    if (add.length) return add.length === 1 && who ? `${who} added to ${name}` : `${add.length} added to ${name}`;
    const n = idsIn(pl.remove).length;
    return n === 1 && who ? `${who} taken off ${name}` : `${n} taken off ${name}`;
  },
  undo: {
    label: () => "Undo",
    window: "ten_minutes",
    record: ({ payload: pl }) => ({
      list_id: pl.list_id,
      name: pl.name,
      who: pl.who,
      add: idsIn(pl.remove),
      remove: idsIn(pl.add),
    }),
    call: (u) => {
      const add = idsIn(u.add);
      return {
        route: "PUT segments/[id]",
        params: { id: asText(u.list_id) },
        body: add.length ? { add } : { remove: idsIn(u.remove) },
        events: [PEOPLE_CHANGED],
      };
    },
    receipt: (_data, u) => (idsIn(u.add).length ? `Back on ${asText(u.name)}` : `Taken off ${asText(u.name)} again`),
  },
  open: ({ payload: pl }) =>
    asText(pl.list_id) ? `clients/${listToken({ kind: "saved", id: asText(pl.list_id) })}` : "clients",
};
