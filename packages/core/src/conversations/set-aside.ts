import { AppError } from "@chanlytics/contracts";
import type { Thread, ThreadPorts } from "./ports";

type SetAsidePorts = Pick<ThreadPorts, "notACustomer" | "replyAnyway" | "setAside">;

/**
 * A thread as its two words read it: where it stands on the Set aside list (00539), which says what a word does to it.
 * A caller that did not read the two columns says nothing of them, and each word then does what it always did.
 */
type SetAsideThread = Pick<Thread, "id" | "tenant_id"> & {
  set_aside_at?: string | null;
  set_aside_why?: string | null;
};

/** A door that changed no row did nothing at all: the thread moved while the person looked. */
const moved = () => new AppError("conflict", "That thread has moved. Reload and try again.", 409);

/**
 * Not a customer (decisions 0093 and 0136). On a thread set aside it stays archived and leaves the Set aside list, and its
 * sender's address is said to be automated, so their mail stays out; with `undo`, all of it back. One door, one
 * transaction (00539).
 *
 * Said of a thread still held (a call back nobody should make, 0136), it is set aside first, by the door a reading would
 * have used, so its hold is resolved and it is archived; then the member's word takes it off the list as above. The
 * thread keeps that word (`set_aside_why` with its day gone), and no later call of theirs asks anyone for a call back
 * (contracts callerStandingOf). A thread a member has is theirs, and is refused in words that say what to do.
 */
export async function markNotACustomer(
  ports: Pick<SetAsidePorts, "notACustomer" | "setAside">,
  cmd: { conv: SetAsideThread; undo: boolean },
): Promise<{ set_aside: boolean; decision_id: string }> {
  const { conv, undo } = cmd;
  const held = !undo && conv.set_aside_at === null && conv.set_aside_why === null;
  if (held && !(await ports.setAside(conv.tenant_id, conv.id)))
    throw new AppError("conflict", "Someone on your team has this conversation. Hand it back, then say so.", 409);
  const done = await ports.notACustomer(conv.tenant_id, conv.id, undo);
  if (!done) throw moved();
  return { set_aside: undo, decision_id: done.decision_id };
}

/**
 * Reply anyway, on a thread set aside: it is a customer's after all. Open again, its sender a person, its hold back with its
 * first reason, and so a draft owed by the hold's own event (00539). A thread a member said is not a customer's is off
 * the list, where that door finds nothing: it is put back on first (the word undone), then answered, so one press takes
 * both back and the person's next call is held as any caller's is (0136).
 */
export async function replyAnyway(
  ports: Pick<SetAsidePorts, "notACustomer" | "replyAnyway">,
  cmd: { conv: SetAsideThread },
): Promise<{ reopened: true; decision_id: string }> {
  const { conv } = cmd;
  const saidNot = conv.set_aside_at === null && !!conv.set_aside_why;
  if (saidNot && !(await ports.notACustomer(conv.tenant_id, conv.id, true))) throw moved();
  const done = await ports.replyAnyway(conv.tenant_id, conv.id);
  if (!done) throw moved();
  return { reopened: true, decision_id: done.decision_id };
}
