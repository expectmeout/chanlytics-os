/**
 * A person's cards: how the receptionist treats them, and a deal recorded on them with its next step.
 */
import type { AskProposal } from "../ask";
import { DEAL_STAGE_WORDS } from "../deals";
import { PERSON_MODE_WORDS } from "../people";
import { NOTE_WORDS } from "../person-notes";
import {
  PEOPLE_CHANGED,
  asText,
  decisionOf,
  idIn,
  rec,
  refuseWith,
  type ProposalSpec,
  type ProposalSpecAboveOperator,
} from "./spec";

/** The person a card names, on their page. */
const cardPersonRoute = ({ payload }: Pick<AskProposal, "payload">): string | null => {
  const id = idIn(payload, "contact_id");
  return id ? `clients/${id}` : null;
};

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
    record: (p, data) => ({
      contact_id: p.payload.contact_id,
      mode: p.payload.previous ?? "inherit",
      decision_id: decisionOf(data),
    }),
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
      events: [{ type: "note:saved", detail: { personId: asText(p.payload.contact_id) } }],
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
