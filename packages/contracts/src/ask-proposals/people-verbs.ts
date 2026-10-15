/**
 * The verbs a person's sheets commit that Ask does not propose yet, in the same shape as a card's spec (spec.ts), so a
 * sheet and a card make the same call for the same act through one walk (the dashboard's legacy-bridge/verbs): their
 * answers to the two questions, for one person or many; the receptionist for many; a note line under many; a person
 * added by hand; two records of one person made one. Each body is the one its door's own schema reads
 * (people/doors/person-bodies.ts, on the server, which refuses in its own words), and each receipt is the sentence the
 * sheet said (the sheets as verbs, 14 Oct 2026). Pure: nothing here sends, reads a window or a clock; and nothing here
 * reaches zod, so the specs stay in the page's bundle (decision 0024).
 */
import { MERGE_WORDS } from "../people/person-merge";
import { PERSON_MODE_WORDS } from "../people/person-receptionist";
import type { ApiRouteKey } from "../route-keys.generated";
import {
  PEOPLE_CHANGED,
  PROPOSAL_WORDS,
  asText,
  decisionOf,
  gatherCounts,
  idIn,
  inBatches,
  rec,
  refuseWith,
  type ProposalCall,
  type ProposalSpec,
  type ProposalSpecAboveOperator,
  oneOrMany,
  uniqueIds,
} from "./spec";

/** The two questions a person is asked (00095): messages (about their own appointments), and offers and news. */
type AnswerPurpose = "conversational" | "marketing";
type Answer = "opted_in" | "opted_out" | "unknown";

const purposeOf = (v: unknown): AnswerPurpose | null => (v === "conversational" || v === "marketing" ? v : null);
const consentIn = (v: unknown): Answer => (v === "opted_in" || v === "opted_out" ? v : "unknown");

/** The fields of a payload a body takes, the rest (the card's own words, its ids) left out. */
const fieldsOf = (pl: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> =>
  Object.fromEntries(keys.filter((k) => pl[k] !== undefined).map((k) => [k, pl[k]]));

/**
 * Their answer, said after who gave it, as the receipt and the person page's toast say it ("Emily said yes to messages"):
 * to offers, or to messages (the two answers, as broadcasts say them). The page draws the name bold before it.
 */
export function answerSaidOf(purpose: AnswerPurpose, consent: Answer): string {
  if (purpose === "marketing") {
    if (consent === "opted_in") return "said yes to offers and news";
    if (consent === "opted_out") return "said no to offers — other messages still reach them";
    return "has not been asked about offers";
  }
  if (consent === "opted_in") return "said yes to messages";
  if (consent === "opted_out") return "said stop — nothing goes out to them at all";
  return 'is back to "not asked"';
}

/** A batch door's answer: how many it did, and the first reason one was not, in the bar's words. */
function manySaid(data: unknown, verb: string): { done: number; failed: number; said: string } {
  const d = rec(data);
  const done = typeof d.done === "number" ? d.done : 0;
  const failedRows = Array.isArray(d.failed) ? (d.failed as unknown[]) : [];
  const skipped = Array.isArray(d.skipped) ? (d.skipped as unknown[]) : [];
  const failed = failedRows.length + skipped.length;
  const why = asText(rec(failedRows[0]).message) || (skipped.length ? "no longer in this workspace" : "");
  return { done, failed, said: failed ? `${failed} could not be ${verb}${why ? ` — ${why}` : ""}` : "" };
}

/**
 * A selection's act through its batch door, fifty people a request (the door's own rule), one card for all of them: the
 * body's other fields on every request, each request's people its own (the operator, 15 Oct 2026).
 */
function manyCalls(
  route: ApiRouteKey,
  pl: Record<string, unknown>,
  fields: readonly string[],
): ProposalCall | readonly ProposalCall[] | ReturnType<typeof refuseWith> {
  const ids = uniqueIds(pl.ids);
  if (!ids.length) return refuseWith("Pick at least one person.");
  const rest = fieldsOf(pl, fields);
  const calls = inBatches(ids).map((part) => ({ route, body: { ...rest, ids: part }, events: [PEOPLE_CHANGED] }));
  return oneOrMany(calls);
}

const ANSWER_DOOR: Record<AnswerPurpose, ApiRouteKey> = {
  conversational: "PUT contacts/[id]/consent",
  marketing: "PUT contacts/[id]/marketing-consent",
};
const ANSWER_MANY_DOOR: Record<AnswerPurpose, ApiRouteKey> = {
  conversational: "PUT contacts/consent",
  marketing: "PUT contacts/marketing-consent",
};

/** The person a card names, on their page. */
const personRoute = ({ payload }: { payload: Record<string, unknown> }): string | null => {
  const id = idIn(payload, "contact_id");
  return id ? `clients/${id}` : null;
};

/**
 * One person's answer to one of the two questions, recorded by whoever heard it: a yes or a no with how it was given
 * (the message they said it in, where it was their own), or "not asked" again.
 */
export const answerSpec: ProposalSpec = {
  needs: "operator",
  gate: "approve",
  commit: ({ payload: pl }) => {
    const purpose = purposeOf(pl.purpose);
    if (!purpose) return refuseWith("Say which question this answers.");
    return {
      route: ANSWER_DOOR[purpose],
      params: { id: asText(pl.contact_id) },
      body: fieldsOf(pl, ["consent", "source", "note", "message_id"]),
      events: [PEOPLE_CHANGED],
    };
  },
  receipt: ({ payload: pl }) =>
    `${asText(pl.who)} ${answerSaidOf(purposeOf(pl.purpose) ?? "conversational", consentIn(pl.consent))}`,
  open: personRoute,
};

/** The same answer for a selection, fifty at a time, through the batch door each would go through alone. */
export const answerManySpec: ProposalSpec = {
  needs: "operator",
  gate: "approve",
  commit: ({ payload: pl }) => {
    const purpose = purposeOf(pl.purpose);
    if (!purpose) return refuseWith("Say which question this answers.");
    return manyCalls(ANSWER_MANY_DOOR[purpose], pl, ["consent", "source", "note"]);
  },
  gather: gatherCounts,
  receipt: ({ payload: pl }, data) => {
    const m = manySaid(data, "recorded");
    const what = purposeOf(pl.purpose) === "marketing" ? "to offers" : "to messages";
    const answer = consentIn(pl.consent);
    const head =
      answer === "unknown"
        ? `${m.done} back to "not asked"`
        : `${m.done} said ${answer === "opted_in" ? "yes" : "no"} ${what}`;
    return m.said ? `${head} · ${m.said}` : head;
  },
  open: () => "clients",
};

/** The receptionist's mode for a selection: owners, one request, the same policy row and ledger verb per person. */
export const personModeManySpec: ProposalSpecAboveOperator = {
  needs: "owner",
  doing: "change how the receptionist treats these people",
  gate: "settings",
  commit: ({ payload: pl }) => manyCalls("PUT contacts/receptionist", pl, ["mode"]),
  gather: gatherCounts,
  receipt: ({ payload: pl }, data) => {
    const m = manySaid(data, "changed");
    const mode = asText(pl.mode) as keyof typeof PERSON_MODE_WORDS;
    const head = `Receptionist for ${m.done}: ${PERSON_MODE_WORDS[mode] ?? asText(pl.mode)}`;
    return m.said ? `${head} · ${m.said}` : head;
  },
  open: () => "clients",
};

/** One line under a selection's notes ("class of 12 Sep"), appended and never replacing. */
export const noteManySpec: ProposalSpec = {
  needs: "operator",
  gate: "approve",
  commit: ({ payload: pl }) => manyCalls("PUT contacts/notes", pl, ["append"]),
  gather: gatherCounts,
  receipt: (_p, data) => {
    const m = manySaid(data, "noted");
    const head = `Note added for ${m.done}`;
    return m.said ? `${head} · ${m.said}` : head;
  },
  open: () => "clients",
};

/**
 * A person added by hand: a number or an address, and a name, through the door the calendar's sweep uses (get or
 * create, consent unknown). It answers who they are and whether they were here already; the receipt says which.
 */
export const personAddSpec: ProposalSpec = {
  needs: "operator",
  gate: "approve",
  commit: ({ payload: pl }) => ({
    route: "POST contacts",
    body: fieldsOf(pl, ["phone", "email", "name", "source"]),
    events: [PEOPLE_CHANGED],
  }),
  receipt: ({ payload: pl }, data) => {
    const who = asText(pl.name).trim() || asText(pl.phone).trim() || asText(pl.email).trim();
    return `${who} ${rec(data).existed === true ? "was already here — opened" : "added"}`;
  },
  made: (_p, data) => idIn(rec(data), "contact_id"),
  open: () => "clients",
};

/**
 * Two records of one person made one (0028): the record kept is the card's person, the other merged into it. It cannot
 * be undone, so it is the owner's, and the page asks for the kept name typed before it commits.
 */
export const personMergeSpec: ProposalSpecAboveOperator = {
  needs: "owner",
  doing: "merge two records of one person",
  gate: "settings",
  commit: ({ payload: pl }) => ({
    route: "POST contacts/[id]/merge",
    params: { id: asText(pl.contact_id) },
    body: fieldsOf(pl, ["merge"]),
    events: [PEOPLE_CHANGED],
  }),
  receipt: ({ payload: pl }) => MERGE_WORDS.done(asText(pl.who), asText(pl.other)),
  open: personRoute,
};

/** What a first message's door answers of the thread it opened, as text, or null. */
const threadMade = (data: unknown): string | null => idIn(rec(data), "conversation_id");

/**
 * A first message to someone in People (POST people/:id/message): on the wire their answers allow, its words or an
 * approved message where only one can go, and who has the thread after it (the receptionist, or the member). The door
 * judges it again (the reply verb's own rules: their yes, the window, the purpose of a message). Like a reply, it leaves
 * after the send's own wait, and the undo cancels it within it.
 */
export const personMessageSpec: ProposalSpec = {
  needs: "operator",
  gate: "approve",
  commit: (p) => {
    const pl = p.payload;
    if (!idIn(pl, "contact_id") || !asText(pl.wire)) return refuseWith(PROPOSAL_WORDS.cannotApprove);
    return {
      route: "POST people/[id]/message",
      params: { id: asText(pl.contact_id) },
      body: fieldsOf(pl, ["wire", "text", "subject", "template", "email_to", "then", "note"]),
      idempotencyKey: p.id,
      events: [PEOPLE_CHANGED],
    };
  },
  receipt: ({ payload: pl }) => `On its way to ${asText(pl.who)} — sends in 15 seconds unless you cancel`,
  undo: {
    label: () => "Sends 15 seconds after you approve; cancel within them",
    window: "cancelable",
    record: (_p, data) => ({
      message_id: rec(data).message_id,
      cancelable_until: rec(data).cancelable_until,
      decision_id: decisionOf(data),
    }),
    call: (u) => ({ route: "POST messages/[id]/cancel-send", params: { id: asText(u.message_id) } }),
    receipt: () => "Canceled before it sent",
  },
  made: (_p, data) => threadMade(data),
  open: (p, outcome) => (outcome?.made?.id ? `inbox/th-${outcome.made.id}` : personRoute(p)),
};
