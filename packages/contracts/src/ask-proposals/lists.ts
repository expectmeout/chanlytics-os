/**
 * People's lists: a list Ask proposes, kept current by its rule (the Phase 4 plan, D10).
 */
import { listToken } from "../people/lists/list-token";
import {
  PEOPLE_CHANGED,
  PROPOSAL_WORDS,
  asText,
  idIn,
  inBatches,
  rec,
  refuseWith,
  type ProposalSpec,
  oneOrMany,
} from "./spec";

/** The most people one request puts on or takes off a list kept by hand (the lists door's LIST_BATCH_MAX). */
const LIST_PART = 500;

/** The names a delete that archived says (`paused`, `read_by`), as text. */
const namesIn = (d: Record<string, unknown>, k: string): string[] =>
  Array.isArray(d[k]) ? (d[k] as unknown[]).map(asText).filter(Boolean) : [];

/**
 * What a list's delete did, in People's words: deleted, or archived where something depends on it (a campaign on it, a
 * list that reads it), as the door's answer says. One sentence for the undo of a made list and for a delete alike.
 */
function listTakenDown(data: unknown): string {
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
}

/** The ids a payload names, as text. */
const idsIn = (v: unknown): string[] => (Array.isArray(v) ? v.map(asText).filter(Boolean) : []);

/** A card's list kept by hand (`kept: "hand"`), as People's New list makes one: a name, and the people it names after. */
const byHand = (pl: Record<string, unknown>): boolean => pl.kept === "hand";

/** Who a list kept by hand starts with, in its receipt: the names the card carries, else how many. */
function startsWith(pl: Record<string, unknown>): string {
  const names = Array.isArray(pl.names) ? pl.names.map(asText).filter(Boolean) : [];
  const n = idsIn(pl.ids).length;
  if (names.length !== n || n === 0 || n > 3) return `${n} ${n === 1 ? "person" : "people"}`;
  const [last, ...before] = [...names].reverse();
  return before.length ? `${before.reverse().join(", ")} and ${last ?? ""}` : (last ?? "");
}

export const listSpec: ProposalSpec = {
  needs: "operator",
  gate: "approve",
  // The route's body: the name and the rule the builder checked (cleanListRule), a list that keeps itself current; or,
  // kept by hand, the name alone, as People's New list makes one, and the people the card names put on it after. A card
  // that is neither is none.
  commit: ({ payload: pl }) =>
    !asText(pl.name) || (!byHand(pl) && (!pl.rule || typeof pl.rule !== "object"))
      ? refuseWith(PROPOSAL_WORDS.cannotApprove)
      : {
          route: "POST segments",
          body: byHand(pl) ? { name: asText(pl.name) } : { name: asText(pl.name), rule: pl.rule },
        },
  // The people a list kept by hand starts with, put on the list the route made (its id in the answer), as the person
  // page's picker puts one on: the list stands either way, and the receipt says how this went.
  then: ({ payload: pl }, data) => {
    const ids = idsIn(pl.ids);
    if (!byHand(pl) || !ids.length) return null;
    const id = idIn(rec(data), "id");
    if (!id) return refuseWith("the list came back without its id; put them on it from People");
    return {
      route: "PUT segments/[id]",
      params: { id },
      body: { add: ids.slice(0, LIST_PART) },
      events: [PEOPLE_CHANGED],
    };
  },
  // People's words for a list made by its rule, named as the route stored it; one kept by hand says who it starts with.
  receipt: ({ payload: pl }, data, then) => {
    const name = asText(rec(data).name ?? pl.name);
    if (!byHand(pl)) return `${name} made. It keeps itself current.`;
    if (!then) return `${name} made. Put people on it from their page or People.`;
    return then.ok
      ? `${name} made, with ${startsWith(pl)} on it.`
      : `${name} made, with nobody on it yet: ${then.message}`;
  },
  // The list it made, for a later step of Ask's plan that names it by its token (`@step:n`).
  made: (_p, data) => idIn(rec(data), "id"),
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
    receipt: (data) => listTakenDown(data),
  },
  // People, at the list the route made once it is approved (the commit kept its id for the undo); People before.
  open: (_card, outcome) => {
    const id = idIn(rec(outcome?.undo), "list_id");
    return id ? `clients/${listToken({ kind: "saved", id })}` : "clients";
  },
};

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
    // A selection bigger than the door takes at once goes in its parts, in order (the lists door's own turns).
    const parts = inBatches(add.length ? add : remove, LIST_PART).map((ids) => ({
      route: "PUT segments/[id]" as const,
      params: { id: asText(pl.list_id) },
      body: add.length ? { add: ids } : { remove: ids },
      events: [PEOPLE_CHANGED],
    }));
    return oneOrMany(parts);
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
      const parts = inBatches(add.length ? add : idsIn(u.remove), LIST_PART).map((ids) => ({
        route: "PUT segments/[id]" as const,
        params: { id: asText(u.list_id) },
        body: add.length ? { add: ids } : { remove: ids },
        events: [PEOPLE_CHANGED],
      }));
      return oneOrMany(parts);
    },
    receipt: (_data, u) => (idsIn(u.add).length ? `Back on ${asText(u.name)}` : `Taken off ${asText(u.name)} again`),
  },
  open: ({ payload: pl }) =>
    asText(pl.list_id) ? `clients/${listToken({ kind: "saved", id: asText(pl.list_id) })}` : "clients",
};

/** What a list's change names: a new name, a new rule (a smart list's), or both. */
const changeOf = (pl: Record<string, unknown>): Record<string, unknown> => ({
  ...(asText(pl.name) ? { name: asText(pl.name) } : {}),
  ...(pl.rule && typeof pl.rule === "object" ? { rule: pl.rule } : {}),
});

/**
 * A list of the workspace's own renamed, or its rule changed (a smart list's): the lists door (PUT segments/:id), which
 * refuses a rule on a list kept by hand and a name another list has, in its own words. The undo puts back what it was,
 * as the card read it.
 */
export const listChangeSpec: ProposalSpec = {
  needs: "operator",
  gate: "approve",
  commit: ({ payload: pl }) => {
    const body = changeOf(pl);
    return !asText(pl.list_id) || Object.keys(body).length === 0
      ? refuseWith(PROPOSAL_WORDS.cannotApprove)
      : { route: "PUT segments/[id]", params: { id: asText(pl.list_id) }, body, events: [PEOPLE_CHANGED] };
  },
  receipt: ({ payload: pl }) => {
    const name = asText(pl.name) || asText(pl.was_name);
    return pl.rule ? `${name} now keeps who its new rule names` : `Renamed ${name}`;
  },
  undo: {
    label: () => "Put it back",
    window: "ten_minutes",
    record: ({ payload: pl }) => {
      const was = rec(pl.was);
      const back = {
        ...(asText(pl.name) && typeof was.name === "string" ? { name: was.name } : {}),
        ...(pl.rule && was.rule && typeof was.rule === "object" ? { rule: was.rule } : {}),
      };
      return Object.keys(back).length ? { list_id: pl.list_id, ...back } : null;
    },
    call: (u) => ({
      route: "PUT segments/[id]",
      params: { id: asText(u.list_id) },
      body: changeOf(u),
      events: [PEOPLE_CHANGED],
    }),
    receipt: () => "The list is as it was",
  },
  open: ({ payload: pl }) =>
    asText(pl.list_id) ? `clients/${listToken({ kind: "saved", id: asText(pl.list_id) })}` : "clients",
};

/**
 * A list of the workspace's own taken down (DELETE segments/:id): deleted, or archived where something depends on it (a
 * campaign on it, a list that reads it), which the door says. The people stay either way. No undo here: an archived one
 * comes back from Archived under the lists, a deleted one is gone.
 */
export const listDeleteSpec: ProposalSpec = {
  needs: "operator",
  gate: "approve",
  commit: ({ payload: pl }) =>
    asText(pl.list_id)
      ? { route: "DELETE segments/[id]", params: { id: asText(pl.list_id) }, events: [PEOPLE_CHANGED] }
      : refuseWith(PROPOSAL_WORDS.cannotApprove),
  receipt: (_p, data) => listTakenDown(data),
  open: () => "clients",
};
