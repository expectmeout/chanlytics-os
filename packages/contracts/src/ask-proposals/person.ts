/**
 * A person's cards: how the receptionist treats them, a deal recorded on them with its next step, a note on them, and
 * the name and the address their profile holds.
 */
import type { AskProposal } from "../ask/ask";
import { DEAL_STAGE_WORDS } from "../deals/deal-words";
import { PERSON_MODE_WORDS } from "../people/person-receptionist";
import { NOTE_WORDS } from "../notes/person-notes";
import { STEP_SHEET_WORDS } from "../notes/step-sheet";
import {
  PEOPLE_CHANGED,
  PROPOSAL_WORDS,
  asText,
  decisionOf,
  wasIn,
  idIn,
  rec,
  refuseWith,
  type ProposalCall,
  type ProposalRefusal,
  type ProposalSpec,
  type ProposalSpecAboveOperator,
} from "./spec";

/** The person a card names, on their page. */
const cardPersonRoute = ({ payload }: Pick<AskProposal, "payload">): string | null => {
  const id = idIn(payload, "contact_id");
  return id ? `clients/${id}` : null;
};

/**
 * The two fields of a person's profile a details card sets (D9), and each as its card and its receipt say it: its
 * name, and what the card says of it where the profile holds nothing -- a name beside what the page shows in its place
 * (their WhatsApp name, their number or their address). Literals, never a call, so a package that bundles contracts and
 * uses neither keeps neither.
 */
const DETAIL_FIELDS = ["name", "email"] as const;
type DetailField = (typeof DETAIL_FIELDS)[number];
export const PERSON_DETAIL_WORDS: {
  label: Record<DetailField, string>;
  none: Record<DetailField, (shows: string | null) => string>;
} = {
  label: { name: "Name", email: "Email" },
  none: {
    name: (shows) => (shows ? `no name of their own (shows as ${shows})` : "no name of their own"),
    email: () => "no address",
  },
};

/**
 * The details route's call for what a card or its undo names: only those of the two fields it carries as text, the
 * route's own body, with nothing else it would write (notes, a proposal's link: their own doors). Nothing named is
 * refused in the given words, and nothing is sent.
 */
function detailsCall(contactId: unknown, from: Record<string, unknown>, none: string): ProposalCall | ProposalRefusal {
  const body = Object.fromEntries(DETAIL_FIELDS.filter((k) => typeof from[k] === "string").map((k) => [k, from[k]]));
  if (!Object.keys(body).length) return refuseWith(none);
  return { route: "PUT contacts/[id]/details", params: { id: asText(contactId) }, body, events: [PEOPLE_CHANGED] };
}

export const personModeSpec: ProposalSpecAboveOperator = {
  needs: "owner",
  doing: "change how the receptionist treats one person",
  gate: "settings",
  commit: (p) => ({
    route: "PUT contacts/[id]/receptionist",
    params: { id: asText(p.payload.contact_id) },
    body: { mode: p.payload.mode },
    events: [PEOPLE_CHANGED],
  }),
  receipt: (p) =>
    `Receptionist for ${asText(p.payload.who)}: ${PERSON_MODE_WORDS[asText(p.payload.mode) as keyof typeof PERSON_MODE_WORDS] ?? asText(p.payload.mode)}`,
  undo: {
    label: () => "Set it back",
    window: "ten_minutes",
    // The mode the route found when it wrote (its answer's `was`; none is inherit), the card's own reading where an
    // older route answers none.
    record: (p, data) => {
      const was = wasIn(data, "mode");
      return {
        contact_id: p.payload.contact_id,
        mode: was === undefined ? (p.payload.previous ?? "inherit") : (was ?? "inherit"),
        decision_id: decisionOf(data),
      };
    },
    call: (u) => ({
      route: "PUT contacts/[id]/receptionist",
      params: { id: asText(u.contact_id) },
      body: { mode: u.mode },
      events: [PEOPLE_CHANGED],
    }),
    receipt: () => "Set back",
  },
  open: cardPersonRoute,
};

export const dealSpec: ProposalSpec = {
  needs: "operator",
  gate: "approve",
  // The card's body is the route's body: `who` is the card's own word and the id is the route's param, so both stay
  // out of a request the route reads strictly. No undo: a mis-recorded stage is moved again on the person's page, and
  // a step is changed or done there.
  commit: ({ payload }) => {
    // Judged by the door's own schema (contracts DealMoveBody), on the server: by the act tool before a card is
    // proposed, by the route as it is sent, in the same words either way.
    const { who: _who, contact_id: _id, ...body } = payload;
    return {
      route: "POST contacts/[id]/deal",
      params: { id: asText(payload.contact_id) },
      body,
      events: [PEOPLE_CHANGED],
    };
  },
  // The step after the deal (0007, amended), naming the row the door wrote (a new proposal's card has no id to name):
  // the team's note, with its day. It answers as the door takes it, People read again behind it. An answer that names
  // no deal sends no step: a note tied to no deal is not the step the card said, so it is said as not saved.
  then: (p, data) => {
    if (!p.step) return null;
    const dealId = idIn(rec(rec(data).deal), "id");
    if (!dealId) return refuseWith("the deal came back without its id; set it on their page");
    return {
      route: "POST contacts/[id]/notes",
      params: { id: asText(p.payload.contact_id) },
      body: { body: p.step.body, due_on: p.step.due_on, team_only: true, deal_id: dealId },
      refresh: "behind",
      events: [PEOPLE_CHANGED],
    };
  },
  // The deal stands either way, so a step the door refused is said on the receipt, to set again on their page.
  receipt: ({ payload: pl }, _data, then) => {
    const receipt = `${asText(pl.who)} · ${DEAL_STAGE_WORDS[asText(pl.stage) as keyof typeof DEAL_STAGE_WORDS] ?? asText(pl.stage)}`;
    if (!then) return receipt;
    return then.ok
      ? `${receipt} · ${NOTE_WORDS.stepAdded}`
      : `${receipt} · the next step was not saved: ${then.message}`;
  },
  open: cardPersonRoute,
};

/** What the notes door takes of a note's payload: the rest (who it is about, the card's words) is the card's own. */
const NOTE_KEYS = ["body", "for_user_id", "team_only", "note_id", "version", "due_on", "deal_id", "clear_due"] as const;

export const noteSpec: ProposalSpec = {
  needs: "operator",
  gate: "approve",
  // The route's strict body, the words and who reads them (D8): a note not for the team alone is read by the receptionist
  // before it answers that person (00157). A card that does not say which is not sent, since the route's own default is
  // the receptionist's and nobody chose it. A day makes it a step (00166), the team's, on the deal it names; a change
  // names the note and the version it was read at (the note sheet's). Judged by the door's own schema (NoteWriteBody),
  // as the route reads it. It answers as the door takes it, People read again behind it.
  commit: ({ payload: pl }) => {
    if (typeof pl.team_only !== "boolean" || !asText(pl.body)) return refuseWith(PROPOSAL_WORDS.cannotApprove);
    const body = Object.fromEntries(NOTE_KEYS.filter((k) => pl[k] !== undefined).map((k) => [k, pl[k]]));
    return {
      route: "POST contacts/[id]/notes",
      params: { id: asText(pl.contact_id) },
      body,
      refresh: "behind",
      events: [PEOPLE_CHANGED],
    };
  },
  receipt: ({ payload: pl }) => {
    const step = typeof pl.due_on === "string" && !!pl.due_on;
    if (step) return `${asText(pl.who)} · ${STEP_SHEET_WORDS.done[pl.note_id ? "edit" : "add"]}`;
    if (pl.note_id) return `${asText(pl.who)} · ${NOTE_WORDS.saved}`;
    return `${asText(pl.who)} · ${NOTE_WORDS.added}${pl.team_only === true ? ` · ${NOTE_WORDS.teamOnly}` : ""}`;
  },
  undo: {
    label: () => "Delete it",
    window: "ten_minutes",
    // The note the door wrote, by the id it answered with; a change, or an answer that names none, leaves nothing to
    // take away (a change is changed again).
    record: (p, data) => {
      const noteId = p.payload.note_id ? null : idIn(rec(rec(data).note), "id");
      return noteId ? { contact_id: p.payload.contact_id, note_id: noteId } : null;
    },
    call: (u) => ({
      route: "POST contacts/[id]/notes/remove",
      params: { id: asText(u.contact_id) },
      body: { note_id: asText(u.note_id) },
      refresh: "behind",
      events: [PEOPLE_CHANGED],
    }),
    receipt: () => NOTE_WORDS.removed,
  },
  open: cardPersonRoute,
};

export const personDetailsSpec: ProposalSpec = {
  needs: "operator",
  gate: "approve",
  // Only the fields the card changes; its `previous` is what the builder read, for the undo.
  commit: ({ payload: pl }) => detailsCall(pl.contact_id, pl, PROPOSAL_WORDS.cannotApprove),
  // Each field as the route stored it (an address in its one spelling), the card's where it answered none.
  receipt: ({ payload: pl }, data) =>
    [
      asText(pl.who),
      ...DETAIL_FIELDS.filter((k) => typeof pl[k] === "string").map(
        (k) => `${PERSON_DETAIL_WORDS.label[k]}: ${asText(rec(data)[k] ?? pl[k])}`,
      ),
    ].join(" · "),
  undo: {
    label: () => "Set it back",
    window: "ten_minutes",
    // Each changed field as the route found it when it wrote (its answer's `was`), the card's own reading where an
    // older route answers none: the route clears a field with an empty string, so one that held nothing is set back to
    // nothing. One whose previous value neither carries is never cleared on a guess.
    record: ({ payload: pl }, data) => {
      const changed = DETAIL_FIELDS.filter((k) => typeof pl[k] === "string");
      const found = rec(rec(data).was);
      const prev = changed.length > 0 && changed.every((k) => k in found) ? found : rec(pl.previous);
      if (!changed.length || changed.some((k) => !(k in prev))) return null;
      return { contact_id: pl.contact_id, ...Object.fromEntries(changed.map((k) => [k, asText(prev[k])])) };
    },
    call: (u) => detailsCall(u.contact_id, u, PROPOSAL_WORDS.noUndo),
    receipt: () => "Set back",
  },
  open: cardPersonRoute,
};
