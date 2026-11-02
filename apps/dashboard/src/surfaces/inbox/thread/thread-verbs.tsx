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
import { OWN_VERBS, VW_STORE, type VetoState } from "../store";
import type { RealThread } from "../types";
import { cancelSend, inboxVerb, sendHeldNow, type InboxVerb } from "../verbs";

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

/**
 * A real draft let go now (Send now): its send job brought to the ledger's next tick, the draft reading as going at once,
 * and back as it was, with why, where the server refused (sent, claimed or withdrawn meanwhile).
 */
function letGo(t: RealThread, st: VetoState, bump: () => void, flash: (flash: Flash) => void) {
  if (st.held || st.going || !t.veto) return;
  st.going = true; // optimistic: it reads as going now
  bump();
  void sendHeldNow(t.veto.messageId as string).then((r) => {
    if (r.ok) return;
    st.going = false;
    bump();
    flash({ tone: "danger", msg: <>{r.message}</> });
  });
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
          // Its Undo is the one way to stop the send (the held bubble has none), so a tap besides does not take it.
          stays: !!(untilMs && untilMs > 0),
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
   *   edit  — put the draft's words in the reply box and focus it, and
   *           withdraw the draft as typing does: the words are the
   *           member's to change now. The box is not filled with the draft
   *           while it counts down: it stands once, as the next bubble with
   *           its countdown under it (the thread canvas, 1 Nov 2026)
   *   type  — the first keystroke means the operator is taking this one, so
   *           the draft is withdrawn ONCE rather than racing the timer
   *   send_now — let it go now: its send job brought to the ledger's next
   *           tick, and the draft reads as going until the send reaches the tab
   *
   * `bump` draws the countdown again, wherever it is shown.
   */
  const hold = (t: RealThread, act: string, bump: () => void = () => {}) => {
    if (!canDo("approve")) return;
    const heldKey = ixDraftKey(t);
    const st = VW_STORE.state[heldKey] || (VW_STORE.state[heldKey] = {});
    if (act === "send_now") return letGo(t, st, bump, flash);
    if (act === "edit") {
      const words = t.veto ? t.veto.draft : "";
      window.setTimeout(
        () =>
          window.dispatchEvent(new CustomEvent("inbox:focus-composer", { detail: { threadId: t.id, text: words } })),
        FOCUS_COMPOSER_MS,
      );
    } else if (act !== "hold" && act !== "type") return;
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
