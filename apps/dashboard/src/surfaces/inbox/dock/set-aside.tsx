/**
 * A thread that is not a customer's, on its dock, and the word that says so (decisions 0093 and 0136; the first bar moved
 * from thread/status.tsx, 17 Nov 2026).
 *
 *   SetAsideBar          a thread a reading set aside: what its sender, or its caller, was read to want, and the two
 *                        words on it, Not a customer and Reply anyway.
 *   NotACustomerBar      a thread a member said is not a customer's: that it was said, what it does, and the way back.
 *                        It left the Set aside list with that word, and had no way back once its toast had gone.
 *   sayNotACustomer      the word on a thread that still asks for you (the menu's act): a call back nobody should make.
 *                        Its Undo is Reply anyway, which brings the thread and its hold back.
 */
import { useState } from "react";
import { THREAD_PANE_WORDS as W } from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { surfaceValue } from "../../surface-values";
import { gate, useToast, type Flash } from "../shell";
import { threadDraftNow } from "../thread/kept-draft";
import type { Thread } from "../types";
import { notACustomerVerb, replyAnywayVerb, type VerbResult } from "../verbs";
import { Dock, dockLine } from "./dock";

/** What the thread was read as, in the read's own sentence: an email's reply draft says it, a call back's brief. */
function pitchOf(thread: Thread): string | null {
  const view = threadDraftNow(thread);
  if (view.state === "pitch" && view.what) return view.what;
  const kept = surfaceValue("reply_drafts")?.drafts.find(
    (d) => d.conversation_id === thread.conversationId && (d.words.pitch ?? "").trim(),
  );
  return kept?.words.pitch?.trim() || null;
}

/** What Not a customer says it did: an email's sender stays out, a caller's calls ask for nobody. */
const doneWords = (thread: Thread): string =>
  thread.primaryChannel === "email" ? W.notACustomerDone : W.notACustomerHeldDone;

/** A press that runs a verb, holds the bar's presses while it is out, and says a refusal in a toast. */
function usePress(flash: (flash: Flash) => void) {
  const [busy, setBusy] = useState(false);
  const press = async (go: () => Promise<VerbResult>, done?: () => void) => {
    setBusy(true);
    const r = await go();
    setBusy(false);
    if (!r.ok) return flash({ tone: "danger", msg: <>{r.message}</> });
    done?.();
  };
  return { busy, press };
}

/** Reply anyway: the other way on either bar, which brings the thread back to you with its hold. */
function replyAnywayButton(id: string, busy: boolean, press: ReturnType<typeof usePress>["press"]) {
  return (
    <Button
      variant="quiet"
      size="sm"
      className="ix-press"
      disabled={busy}
      onClick={() => void press(() => replyAnywayVerb(id))}
      data-testid="ix-dock-reply-anyway"
      {...gate("approve", "reply to a conversation set aside")}
    >
      {W.replyAnyway}
    </Button>
  );
}

/**
 * A thread set aside as not a customer's (decision 0093): what its sender was read to want, under the page's own question,
 * and the two words on it. Its hold is resolved and it is archived, so nothing else in the dock speaks.
 */
export function SetAsideBar({ thread }: { thread: Thread }) {
  const [toastNode, flash] = useToast();
  const { busy, press } = usePress(flash);
  const id = thread.conversationId;
  if (!id) return null;
  const rest = pitchOf(thread);
  return (
    <>
      {toastNode}
      <Dock
        testid="ix-set-aside"
        label={rest ? `${W.pitchLead} — ${rest}` : W.pitchLead}
        fact={dockLine({ lead: W.pitchLead, rest })}
        line
        acts={
          <>
            <Button
              variant="soft"
              size="sm"
              className="ix-press"
              disabled={busy}
              onClick={() =>
                void press(
                  () => notACustomerVerb(id),
                  () => flash({ msg: <>{doneWords(thread)}</>, undo: () => void notACustomerVerb(id, true) }),
                )
              }
              data-testid="ix-dock-not-a-customer"
              {...gate("approve", "say this is not a customer")}
            >
              {W.notACustomer}
            </Button>
            {replyAnywayButton(id, busy, press)}
          </>
        }
      />
    </>
  );
}

/**
 * A thread a member said is not a customer's (decision 0136): said plainly, with what it does, and Reply anyway beside
 * it. Their calls ask nobody for a call back until that is pressed.
 */
export function NotACustomerBar({ thread }: { thread: Thread }) {
  const [toastNode, flash] = useToast();
  const { busy, press } = usePress(flash);
  const id = thread.conversationId;
  if (!id) return null;
  return (
    <>
      {toastNode}
      <Dock
        testid="ix-not-a-customer"
        label={`${W.notACustomer} — ${W.notACustomerSaid}`}
        fact={dockLine({ lead: W.notACustomer, rest: W.notACustomerSaid })}
        line
        acts={replyAnywayButton(id, busy, press)}
      />
    </>
  );
}

/** Whether a thread may be said not to be a customer's from its menu: one that still asks for you, and is no email's. */
export const heldNotACustomer = (thread: Thread): boolean =>
  !!thread.real && !!thread.conversationId && thread.state === "escalated" && thread.primaryChannel !== "email";

/** Not a customer, said of a thread that still asks for you: off your list, and Undo brings it and its hold back. */
export async function sayNotACustomer(thread: Thread, flash: (flash: Flash) => void): Promise<void> {
  const id = thread.conversationId;
  if (!id) return;
  const r = await notACustomerVerb(id);
  if (!r.ok) return flash({ tone: "danger", msg: <>{r.message}</> });
  flash({ msg: <>{W.notACustomerHeldDone}</>, undo: () => void replyAnywayVerb(id) });
}
