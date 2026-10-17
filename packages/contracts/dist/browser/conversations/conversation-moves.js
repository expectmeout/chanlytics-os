import { CONVERSATION_STATES } from "../shared/enums.js";
const ANY = CONVERSATION_STATES;
export const CONVERSATION_MOVES = {
  /** A person takes the thread: the receptionist paused until `until`, the snooze gone, the thread theirs (conversation_take_over, 00386). */
  take_over: {
    from: ANY,
    to: "needs_human",
    sets: { paused_until: "until", snooze_until: null, assignee_user_id: "user" }
  },
  /** A person's reply claims the thread as a take-over does, and touches it. */
  reply_claim: {
    from: ANY,
    to: "needs_human",
    sets: { paused_until: "until", snooze_until: null, assignee_user_id: "user", last_message_at: "now" }
  },
  /** The receptionist resumes: nothing paused, snoozed or claimed (conversation_hand_back, 00386). */
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
  snooze_expired: { from: ["snoozed"], to: "open", sets: { snooze_until: null } }
};
export function conversationPatch(move, ...input) {
  const m = CONVERSATION_MOVES[move];
  const given = input[0] ?? {};
  const patch = { state: m.to };
  for (const [column, from] of Object.entries(m.sets)) {
    const value = from === null ? null : given[from];
    if (value === void 0) throw new Error(`${move} needs ${from} for ${column}`);
    patch[column] = value;
  }
  return patch;
}
export function conversationMoveAllowed(move, state) {
  return CONVERSATION_MOVES[move].from.includes(state);
}
