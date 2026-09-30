/**
 * One reply per thread at a time: the thread's reply turn (00282).
 *
 * Two messages from one customer a moment apart were answered independently: each webhook ran its own model turn and
 * each sent its own reply, the first written without the second message in view. Now the message about to be
 * answered claims the thread's turn before the model is asked (claimTheTurn), and must still hold it before its words
 * go out (stillOurs). The newest message wins the turn: its memory was read after every older message of the thread
 * was recorded (ingest is serialised per sender, 00110), so its one reply answers them all, and an older message whose
 * turn was taken sends nothing. A claim that moves the turn also withdraws the drafts the older turn left waiting to
 * go (its veto window, its confidence hold): the newer reply supersedes a reply not yet sent.
 *
 * The bookkeeping never costs a reply: an adapter without the port, or a claim or a check that could not be read, is a
 * turn held, and the message is answered as it was before.
 */
import { GO, errField, type Answering } from "./context";
import type { Turn } from "./model-turn";

/** The thread's turn, claimed for this message before the model is asked; a newer message holding it stops this one. */
export async function claimTheTurn(at: Answering): Promise<typeof GO | undefined> {
  const { ports, db, tenantId, ing, L, sink } = at;
  const turn = ports.persist.turn;
  if (!turn || !db || !tenantId || !ing) return GO;
  const held = await turn.claim(db, tenantId, ing.conversation_id, ing.message_id).catch((e: unknown) => {
    L.warn("wa_turn_unreadable", { error: errField(e) });
    return true;
  });
  if (held) return GO;
  // A newer message of this thread is being answered, and its reply covers this one's words too.
  L.info("wa_superseded", { at: "claim", conversation_id: ing.conversation_id });
  await sink.processed();
  return undefined;
}

/**
 * The turn, asked again once the model has answered: a newer message may have claimed it while this one was being
 * written. Superseded, the words are not sent (the model's tokens were spent, and say so); the message is handled.
 */
export async function stillOurs(at: Answering, t: Turn): Promise<typeof GO | undefined> {
  const { ports, db, ing, L, sink } = at;
  const turn = ports.persist.turn;
  if (!turn || !db || !ing) return GO;
  const held = await turn.holds(db, ing.conversation_id, ing.message_id).catch((e: unknown) => {
    L.warn("wa_turn_unreadable", { error: errField(e) });
    return true;
  });
  if (held) return GO;
  L.info("wa_superseded", { at: "wire", conversation_id: ing.conversation_id });
  // Held, in the usage event's own word for a reply that did not go out: the first-reply milestone (recordUsage) is not
  // reached by an answer nobody read.
  if (t.usage) await sink.usage({ ...t.usage, held: "superseded" });
  await sink.processed();
  return undefined;
}
