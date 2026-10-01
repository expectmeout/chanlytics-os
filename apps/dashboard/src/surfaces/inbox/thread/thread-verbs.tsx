/**
 * The two verbs of a real thread (moved from pages/thread-pane.jsx, decision 0015): the verb, and the hold on a draft
 * counting down. Both go to the server. It is published to the shell for the deal sheet, which sends a proposal through
 * the person's conversation, so it stays light: it imports the verbs, the stores, the rules, the shell's shims and React's
 * types, and nothing of the thread's pane.
 */
import type { ReactNode } from "react";
import { FOCUS_COMPOSER_MS } from "../constants";
import { ixDraftKey } from "../rules";
import { canDo, type Flash } from "../shell";
import { OWN_VERBS, VW_STORE } from "../store";
import type { RealThread } from "../types";
import { cancelSend, inboxVerb, type InboxVerb } from "../verbs";

/** What a verb carries: the words, the moment, the chosen template, the address a reply was told to go to. */
type Payload = Parameters<typeof inboxVerb>[2];

/** What the verb is asked, in the order the deal sheet and the pane ask it: a rest, so the call keeps its five words. */
type VerbCall = [t: RealThread, name: InboxVerb, payload: Payload, okMsg: ReactNode, undoable?: boolean];

/** What a send's receipt says of the message and how long it can be stopped; nothing where the answer carries none. */
function receiptOf(data: unknown): { messageId: string | undefined; cancelableUntil: string | undefined } | null {
  if (!data || typeof data !== "object") return null;
  const id: unknown = Reflect.get(data, "message_id");
  const until: unknown = Reflect.get(data, "cancelable_until");
  return {
    messageId: typeof id === "string" ? id : undefined,
    cancelableUntil: typeof until === "string" ? until : undefined,
  };
}

// ---- The two verbs of a real thread ----

// Spoken through the host's toast (usePPToast), so one page keeps one stack.
export const threadVerbs = (flash: (flash: Flash) => void) => {
  // Real-thread verbs commit through the API; the re-read repaints. No local mutation, no IX_STORE -- the server owns
  // state. reply, reply-template, take-over, hand-back, snooze, wake, archive; resolves true when the server took it.
  const verb = (...call: VerbCall): Promise<boolean> => {
    const [t, name, payload, okMsg, undoable] = call;
    // An act on the thread's state is said the moment the server takes it (onAccepted), not once the Inbox, the
    // threads and Today have been read again behind it; the pane still repaints from that re-read, and the act is
    // counted as yours until it lands, so it is never announced to you. A reply is said with its receipt (the Undo
    // window), which only the server's answer carries.
    let saidEarly = false;
    const early =
      name === "reply" || name === "reply-template"
        ? undefined
        : () => {
            saidEarly = true;
            flash({
              msg: (
                <>
                  <b>{t.who}</b> — {okMsg}
                </>
              ),
            });
          };
    OWN_VERBS.n += 1;
    return inboxVerb(t, name, payload, early ? { onAccepted: early } : undefined)
      .finally(() => {
        OWN_VERBS.n -= 1;
      })
      .then((r) => {
        // An email reply whose address is not the one they wrote from waits on a yes: the server says where it will
        // go, and the yes is the same words sent again naming that address. The composer keeps the words meanwhile.
        if (!r.ok && r.confirmEmailTo && name === "reply") {
          const emailTo = r.confirmEmailTo;
          flash({
            tone: "warn",
            msg: <>{r.message}</>,
            ms: 20000,
            action: {
              label: `Send to ${emailTo}`,
              onClick: () => {
                void verb(t, name, { ...payload, emailTo }, okMsg, undoable).then((ok) => {
                  if (ok) window.dispatchEvent(new CustomEvent("inbox:reply-sent", { detail: { threadId: t.id } }));
                });
              },
            },
          });
          return false;
        }
        if (!r.ok) {
          flash({ tone: "danger", msg: <>{r.message}</> });
          return false;
        }
        if (saidEarly) return true;
        const receipt = undoable ? receiptOf(r.data) : null;
        const mid = receipt && receipt.messageId;
        // The receipt says exactly how long the send can still be stopped; the
        // toast, and its Undo, live that long -- not the six seconds a plain
        // confirmation gets, which used to take the Undo away with nine to spare.
        const untilMs =
          receipt && mid && receipt.cancelableUntil ? Date.parse(receipt.cancelableUntil) - Date.now() : null;
        const secs = untilMs && untilMs > 0 ? Math.round(untilMs / 1000) : null;
        flash({
          msg: (
            <>
              <b>{t.who}</b> — {okMsg}
              {secs ? <> · sends in {secs} s unless you undo</> : null}
            </>
          ),
          ms: untilMs && untilMs > 0 ? untilMs : undefined,
          undo: mid
            ? () =>
                cancelSend(mid).then((c) =>
                  flash({
                    tone: c.ok ? "ok" : "danger",
                    msg: c.ok ? <>Send canceled — nothing was delivered</> : <>{c.message}</>,
                  }),
                )
            : null,
        });
        return true;
      });
  };

  /**
   * Veto controls on a REAL thread. Every one of these commits server-side —
   * the timer belongs to a scheduled job, and a button that only changed local
   * state would leave the operator believing they had stopped something that
   * was still on its way.
   *
   *   hold  — withdraw the draft outright; nothing is sent
   *   edit  — focus the composer, which is already pre-filled with the draft;
   *           the send REPLACES it (the reply route withdraws it server-side)
   *   type  — the first keystroke means the operator is taking this one, so
   *           the draft is withdrawn ONCE rather than racing the timer
   *
   * `bump` draws the countdown again, wherever it is shown.
   */
  const hold = (t: RealThread, act: string, bump: () => void = () => {}) => {
    if (!canDo("approve")) return;
    const heldKey = ixDraftKey(t);
    const st = VW_STORE.state[heldKey] || (VW_STORE.state[heldKey] = {});
    if (act === "edit") {
      window.setTimeout(() => window.dispatchEvent(new CustomEvent("inbox:focus-composer")), FOCUS_COMPOSER_MS);
      return;
    }
    if (act !== "hold" && act !== "type") return;
    if (st.held || !t.veto) return;
    st.held = true; // optimistic: stops the countdown now
    bump();
    void cancelSend(t.veto.messageId as string).then((r) => {
      if (r.ok) {
        flash({
          msg: (
            <>
              Held — <b>{t.who}</b> was not sent the draft
            </>
          ),
        });
      } else {
        // It may already have gone out. Say so rather than leaving the UI
        // claiming a hold that never happened.
        st.held = false;
        bump();
        flash({ tone: "danger", msg: <>{r.message}</> });
      }
    });
  };

  return { verb, hold };
};
