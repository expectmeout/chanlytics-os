/**
 * How a thread's state moves — declared once.
 *
 * `conversations.state` is written by the dashboard's thread ports, db's inbound pauses and SQL's sweeps. This table is
 * every move of the thread by name: the states it may start from, the state it ends in, and what else it writes. A
 * TypeScript writer builds its update with `conversationPatch`; the last three are SQL's own (the function each
 * names), written by hand to agree with this and run against it on a real database
 * (tests/conversations/state/conversation-moves.db.test.mjs). A few SQL doors of another subject clear a thread's
 * assignee as a side effect (a partner's pause, a member's departure); they are not moves of the thread.
 *
 * A column's value is cleared (`null`) or comes from the move's input: `until` (the pause or the snooze's end),
 * `user` (who claims it) or `now` (the thread touched). Only these four columns ever move with the state: they are
 * the ones the session role may update besides it (00037).
 */
import { CONVERSATION_STATES, type ConversationState } from "../shared/enums";

type MoveColumn = "paused_until" | "snooze_until" | "assignee_user_id" | "last_message_at";
type MoveInputName = "until" | "user" | "now";

interface ConversationMove {
  from: readonly ConversationState[];
  to: ConversationState;
  sets: Partial<Record<MoveColumn, MoveInputName | null>>;
}

const ANY: readonly ConversationState[] = CONVERSATION_STATES;

export const CONVERSATION_MOVES = {
  /** A person takes the thread: the receptionist paused until `until`, the snooze gone, the thread theirs. */
  take_over: {
    from: ANY,
    to: "needs_human",
    sets: { paused_until: "until", snooze_until: null, assignee_user_id: "user" },
  },
  /** A person's reply claims the thread as a take-over does, and touches it. */
  reply_claim: {
    from: ANY,
    to: "needs_human",
    sets: { paused_until: "until", snooze_until: null, assignee_user_id: "user", last_message_at: "now" },
  },
  /** The receptionist resumes: nothing paused, snoozed or claimed. */
  hand_back: { from: ANY, to: "open", sets: { paused_until: null, snooze_until: null, assignee_user_id: null } },
  /** Put aside until `until`; a snooze does not mute the receptionist, so the pause and the claim go. */
  snooze: { from: ANY, to: "snoozed", sets: { snooze_until: "until", paused_until: null, assignee_user_id: null } },
  /** A person ends a snooze early. */
  wake: { from: ["snoozed"], to: "open", sets: { snooze_until: null } },
  /** Closed, never deleted: released completely. A later message reopens it. */
  archive: { from: ANY, to: "archived", sets: { paused_until: null, assignee_user_id: null } },
  /** The receptionist hands the thread to a person (an escalation, a message it cannot read, a call's callback). */
  hand_off: { from: ANY, to: "needs_human", sets: { paused_until: "until" } },
  /** The owner answered from the WhatsApp Business app: the receptionist paused under them, the thread touched. */
  owner_echo: { from: ANY, to: "needs_human", sets: { paused_until: "until", last_message_at: "now" } },
  /** ingest_inbound: a customer's message reopens a closed or snoozed thread, never one a person has. */
  reopen: { from: ["archived", "snoozed"], to: "open", sets: { snooze_until: null } },
  /** expire_stale_pauses: a pause ran out with no escalation still open. */
  pause_expired: { from: ["needs_human"], to: "open", sets: { paused_until: null, assignee_user_id: null } },
  /** wake_stale_snoozes: a snooze ran out. */
  snooze_expired: { from: ["snoozed"], to: "open", sets: { snooze_until: null } },
} as const satisfies Record<string, ConversationMove>;

export type ConversationMoveName = keyof typeof CONVERSATION_MOVES;

type InputsOf<M extends ConversationMoveName> = Extract<
  (typeof CONVERSATION_MOVES)[M]["sets"][keyof (typeof CONVERSATION_MOVES)[M]["sets"]],
  MoveInputName
>;

/** The values a move's columns take, one per input it names; none for a move that only clears. */
type MoveInput<M extends ConversationMoveName> = { [K in InputsOf<M>]: string };

/** What a move writes: the state, and each column it sets. */
export type ConversationPatch = { state: ConversationState } & Partial<Record<MoveColumn, string | null>>;

/** The row's update for a move, whole: every writer of it writes exactly this. */
export function conversationPatch<M extends ConversationMoveName>(
  move: M,
  ...input: [InputsOf<M>] extends [never] ? [] : [MoveInput<M>]
): ConversationPatch {
  const m: ConversationMove = CONVERSATION_MOVES[move];
  const given = (input[0] ?? {}) as Partial<Record<MoveInputName, string>>;
  const patch: ConversationPatch = { state: m.to };
  for (const [column, from] of Object.entries(m.sets) as [MoveColumn, MoveInputName | null][]) {
    const value = from === null ? null : given[from];
    if (value === undefined) throw new Error(`${move} needs ${from} for ${column}`);
    patch[column] = value;
  }
  return patch;
}

/** Whether a thread in `state` may take the move. */
export function conversationMoveAllowed(move: ConversationMoveName, state: string): boolean {
  return (CONVERSATION_MOVES[move].from as readonly string[]).includes(state);
}
