/**
 * The Inbox's cards and the call's: a reply, a rewrite of a held reply, a verb on a thread, a whisper on a live call.
 */
import { ASK_THREAD_VERBS, type AskProposal, type AskThreadVerb } from "../ask";
import type { ApiRouteKey } from "../route-keys.generated";
import {
  PROPOSAL_WORDS,
  asText,
  decisionOf,
  idIn,
  ownEntry,
  rec,
  refuseWith,
  type ProposalCall,
  type ProposalSpec,
} from "./spec";

/** The thread verbs with an Inbox route of their own; `resolve` closes the escalation instead. */
export const ASK_THREAD_ROUTES = {
  take_over: "POST conversations/[id]/take-over",
  hand_back: "POST conversations/[id]/hand-back",
  snooze: "POST conversations/[id]/snooze",
  wake: "POST conversations/[id]/wake",
  archive: "POST conversations/[id]/archive",
} as const satisfies Record<Exclude<AskThreadVerb, "resolve">, ApiRouteKey>;
type RoutedVerb = keyof typeof ASK_THREAD_ROUTES;
const isRoutedVerb = (v: string): v is RoutedVerb => Object.prototype.hasOwnProperty.call(ASK_THREAD_ROUTES, v);

/**
 * The verb each one's undo sends, where it has one. A wake has none (D8): its inverse is a snooze, which needs an
 * `until` the wake never had, and core's snooze refuses one without (NEEDS_UNTIL), so that undo always failed.
 */
const INVERSE: Partial<Record<AskThreadVerb, RoutedVerb>> = {
  take_over: "hand_back",
  hand_back: "take_over",
  snooze: "wake",
};
const UNDO_LABEL: Partial<Record<AskThreadVerb, string>> = {
  take_over: "Hand back",
  hand_back: "Take over again",
  snooze: "Wake",
};
const RECEIPT: Partial<Record<AskThreadVerb, string>> = {
  hand_back: "The receptionist has it again",
  snooze: "Snoozed",
  wake: "Back in the Inbox",
  archive: "Archived",
  resolve: "Resolved",
};

/** A thread verb by name; the snooze carries its `until`. */
const threadCall = (verb: RoutedVerb, conversationId: unknown, until: unknown): ProposalCall =>
  verb === "snooze"
    ? { route: ASK_THREAD_ROUTES.snooze, params: { id: asText(conversationId) }, body: { until: asText(until) } }
    : { route: ASK_THREAD_ROUTES[verb], params: { id: asText(conversationId) } };

/** The thread a card names, in the Inbox. */
export const cardThreadRoute = ({ payload }: Pick<AskProposal, "payload">): string | null => {
  const id = idIn(payload, "conversation_id");
  return id ? `inbox/th-${id}` : null;
};

export const replySpec: ProposalSpec = {
  needs: "operator",
  gate: "approve",
  commit: (p) => ({
    route: "POST conversations/[id]/reply",
    params: { id: asText(p.payload.conversation_id) },
    body: { text: asText(p.payload.text) },
    idempotencyKey: p.id,
  }),
  receipt: (p) => `On its way to ${asText(p.payload.who)} — sends in 15 seconds unless you cancel`,
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
  open: () => null,
};

export const steerSpec: ProposalSpec = {
  needs: "operator",
  gate: "approve",
  commit: (p) => ({
    route: "POST messages/[id]/steer",
    params: { id: asText(p.payload.message_id) },
    body: { text: asText(p.payload.instruction) },
  }),
  receipt: () => "Rewritten — the new draft waits its turn",
  open: () => null,
};

export const threadVerbSpec: ProposalSpec = {
  needs: "operator",
  gate: "approve",
  commit: (p) => {
    const verb = asText(p.payload.verb);
    if (!(ASK_THREAD_VERBS as readonly string[]).includes(verb) || (verb !== "resolve" && !isRoutedVerb(verb)))
      return refuseWith(PROPOSAL_WORDS.cannotApprove);
    return verb === "resolve"
      ? { route: "POST escalations/[id]/resolve", params: { id: asText(p.payload.escalation_id) } }
      : threadCall(verb as RoutedVerb, p.payload.conversation_id, p.payload.until);
  },
  receipt: (p) => {
    const verb = asText(p.payload.verb);
    return verb === "take_over" ? `You have ${asText(p.payload.who)}'s thread` : (ownEntry(RECEIPT, verb) ?? "Done");
  },
  undo: {
    label: ({ payload }) => ownEntry(UNDO_LABEL, asText(payload.verb)) ?? null,
    window: "ten_minutes",
    record: (p, data) => {
      const inverse = ownEntry(INVERSE, asText(p.payload.verb));
      return inverse
        ? {
            verb: inverse,
            conversation_id: p.payload.conversation_id,
            until: p.payload.until ?? null,
            decision_id: decisionOf(data),
          }
        : null;
    },
    call: (u) => {
      const verb = asText(u.verb);
      return isRoutedVerb(verb) ? threadCall(verb, u.conversation_id, u.until) : refuseWith(PROPOSAL_WORDS.noUndo);
    },
    receipt: () => "Undone",
  },
  open: cardThreadRoute,
};

export const whisperSpec: ProposalSpec = {
  needs: "operator",
  gate: "approve",
  commit: (p) => ({
    route: "POST calls/[id]/whisper",
    params: { id: asText(p.payload.call_id) },
    body: { text: asText(p.payload.text), trigger: false },
  }),
  receipt: () => "Whispered — the receptionist works it into its next answer",
  open: () => null,
};
