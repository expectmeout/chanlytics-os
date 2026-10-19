import { listToken } from "../people/lists/list-token.js";
import {
  PEOPLE_CHANGED,
  PROPOSAL_WORDS,
  asText,
  idIn,
  inBatches,
  rec,
  refuseWith,
  oneOrMany
} from "./spec.js";
const LIST_PART = 500;
const namesIn = (d, k) => Array.isArray(d[k]) ? d[k].map(asText).filter(Boolean) : [];
function listTakenDown(data) {
  const d = rec(data);
  if (d.archived !== true) return "Deleted. The people stay.";
  const paused = namesIn(d, "paused");
  const readBy = namesIn(d, "read_by");
  const why = paused.length ? `${paused.join(", ")} paused` : readBy.length ? `${readBy.join(", ")} reads it` : "a campaign runs on it";
  return `Archived, not deleted: ${why}. It comes back from Archived under your lists.`;
}
const idsIn = (v) => Array.isArray(v) ? v.map(asText).filter(Boolean) : [];
const byHand = (pl) => pl.kept === "hand";
function startsWith(pl) {
  const names = Array.isArray(pl.names) ? pl.names.map(asText).filter(Boolean) : [];
  const n = idsIn(pl.ids).length;
  if (names.length !== n || n === 0 || n > 3) return `${n} ${n === 1 ? "person" : "people"}`;
  const [last, ...before] = [...names].reverse();
  return before.length ? `${before.reverse().join(", ")} and ${last ?? ""}` : last ?? "";
}
export const listSpec = {
  needs: "operator",
  gate: "approve",
  // The route's body: the name and the rule the builder checked (cleanListRule), a list that keeps itself current; or,
  // kept by hand, the name alone, as People's New list makes one, and the people the card names put on it after. A card
  // that is neither is none.
  commit: ({ payload: pl }) => !asText(pl.name) || !byHand(pl) && (!pl.rule || typeof pl.rule !== "object") ? refuseWith(PROPOSAL_WORDS.cannotApprove) : {
    route: "POST segments",
    body: byHand(pl) ? { name: asText(pl.name) } : { name: asText(pl.name), rule: pl.rule }
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
      events: [PEOPLE_CHANGED]
    };
  },
  // People's words for a list made by its rule, named as the route stored it; one kept by hand says who it starts with.
  receipt: ({ payload: pl }, data, then) => {
    const name = asText(rec(data).name ?? pl.name);
    if (!byHand(pl)) return `${name} made. It keeps itself current.`;
    if (!then) return `${name} made. Put people on it from their page or People.`;
    return then.ok ? `${name} made, with ${startsWith(pl)} on it.` : `${name} made, with nobody on it yet: ${then.message}`;
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
    receipt: (data) => listTakenDown(data)
  },
  // People, at the list the route made once it is approved (the commit kept its id for the undo); People before.
  open: (_card, outcome) => {
    const id = idIn(rec(outcome?.undo), "list_id");
    return id ? `clients/${listToken({ kind: "saved", id })}` : "clients";
  }
};
export const listMemberSpec = {
  needs: "operator",
  gate: "approve",
  commit: ({ payload: pl }) => {
    const add = idsIn(pl.add);
    const remove = idsIn(pl.remove);
    if (!asText(pl.list_id) || !add.length && !remove.length) return refuseWith(PROPOSAL_WORDS.cannotApprove);
    const parts = inBatches(add.length ? add : remove, LIST_PART).map((ids) => ({
      route: "PUT segments/[id]",
      params: { id: asText(pl.list_id) },
      body: add.length ? { add: ids } : { remove: ids },
      events: [PEOPLE_CHANGED]
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
      remove: idsIn(pl.add)
    }),
    call: (u) => {
      const add = idsIn(u.add);
      const parts = inBatches(add.length ? add : idsIn(u.remove), LIST_PART).map((ids) => ({
        route: "PUT segments/[id]",
        params: { id: asText(u.list_id) },
        body: add.length ? { add: ids } : { remove: ids },
        events: [PEOPLE_CHANGED]
      }));
      return oneOrMany(parts);
    },
    receipt: (_data, u) => idsIn(u.add).length ? `Back on ${asText(u.name)}` : `Taken off ${asText(u.name)} again`
  },
  open: ({ payload: pl }) => asText(pl.list_id) ? `clients/${listToken({ kind: "saved", id: asText(pl.list_id) })}` : "clients"
};
const changeOf = (pl) => ({
  ...asText(pl.name) ? { name: asText(pl.name) } : {},
  ...pl.rule && typeof pl.rule === "object" ? { rule: pl.rule } : {}
});
export const listChangeSpec = {
  needs: "operator",
  gate: "approve",
  commit: ({ payload: pl }) => {
    const body = changeOf(pl);
    return !asText(pl.list_id) || Object.keys(body).length === 0 ? refuseWith(PROPOSAL_WORDS.cannotApprove) : { route: "PUT segments/[id]", params: { id: asText(pl.list_id) }, body, events: [PEOPLE_CHANGED] };
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
        ...asText(pl.name) && typeof was.name === "string" ? { name: was.name } : {},
        ...pl.rule && was.rule && typeof was.rule === "object" ? { rule: was.rule } : {}
      };
      return Object.keys(back).length ? { list_id: pl.list_id, ...back } : null;
    },
    call: (u) => ({
      route: "PUT segments/[id]",
      params: { id: asText(u.list_id) },
      body: changeOf(u),
      events: [PEOPLE_CHANGED]
    }),
    receipt: () => "The list is as it was"
  },
  open: ({ payload: pl }) => asText(pl.list_id) ? `clients/${listToken({ kind: "saved", id: asText(pl.list_id) })}` : "clients"
};
export const listDeleteSpec = {
  needs: "operator",
  gate: "approve",
  commit: ({ payload: pl }) => asText(pl.list_id) ? { route: "DELETE segments/[id]", params: { id: asText(pl.list_id) }, events: [PEOPLE_CHANGED] } : refuseWith(PROPOSAL_WORDS.cannotApprove),
  receipt: (_p, data) => listTakenDown(data),
  open: () => "clients"
};
