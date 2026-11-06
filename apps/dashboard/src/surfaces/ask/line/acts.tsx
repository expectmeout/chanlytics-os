/** The Line's acts, made before the hooks that call them. */
import type { AskProposalOutcome, AskThreadVM } from "@chanlytics/contracts";
import type { Conversation, Line } from "./types";
import { navigate } from "../shell";
import { arPhone } from "./place";

/** Going somewhere, a question back in the field, leaving the turn in flight, Clear, a card's outcome, a conversation opened or deleted, and Stop. */
export const arActs = (ln: Line) => {
  const {
    A,
    M,
    onClose,
    pushed,
    active,
    setActive,
    live,
    setLive,
    turnSeq,
    lang,
    setQuery,
    setQuick,
    setView,
    setScope,
    setThreads,
    setDoomed,
    speech,
    flash,
    t,
    inputRef,
    clearAttached,
  } = ln;
  // Going somewhere: on a desk the page beside the panel goes there and Ask stays open beside it, the conversation and
  // all (`stay`); a place jumped to from the words typed is a launcher's, and closes it. On a phone, and for a jump,
  // the Line closes; ⌘K brings the conversation back. On a phone the place takes the takeover's entry (replaced, never
  // pushed over it and then gone back from), so Back from there is the page Ask was opened over.
  const nav = (to: string, how?: { leave?: boolean }) => {
    if (pushed.current) {
      pushed.current = false;
      onClose();
      navigate(to, { replace: true });
      return;
    }
    if (!(how && how.leave) && !arPhone()) {
      navigate(to);
      return;
    }
    onClose();
    navigate(to);
  };
  // "Change what I asked" on a card: the turn's own question back in the field, to change (spec F4). An earlier turn
  // hands its own question; the latest turn's card takes the last one asked.
  const editWords = (text?: unknown) => {
    const last = active ? [...active.messages].reverse().find((m) => m.role === "user") : null;
    setQuery(typeof text === "string" ? text : last ? last.text : "");
    setTimeout(() => inputRef.current && inputRef.current.focus(), 20);
  };
  // Leaving the turn in flight, if any: whatever its stream sends after changes nothing on the line (its thread keeps
  // the answer). Every turn checks it is still the current one (turnSeq) before it writes.
  const moveOn = () => {
    turnSeq.current += 1;
    if (live) {
      setLive(null);
      M.mood.set("idle");
    }
  };
  // Clear: the conversation ends, spoken or typed, and the Line is home again; the thread stays in Earlier.
  const clearLine = () => {
    moveOn();
    setActive(null);
    setQuery("");
    clearAttached();
    setQuick(null);
    setView("rows");
    speech.stop();
  };
  // What became of a card, kept on the conversation the Line holds, so the card drawn again (an earlier turn, the
  // answer back in the thread) says "Sent" and never offers Send twice. The route keeps it too (AskCard `record`).
  const noteOutcome = (messageId: string, pid: string, o: AskProposalOutcome) =>
    setActive((prev) =>
      prev
        ? {
            ...prev,
            messages: prev.messages.map((m) =>
              m.id === messageId
                ? { ...m, proposals: (m.proposals || []).map((p) => (p.id === pid ? { ...p, outcome: o } : p)) }
                : m,
            ),
          }
        : prev,
    );

  const openThread = async (th: { id: string }): Promise<Conversation | null> => {
    moveOn();
    speech.stop();
    const full = await A.thread(th.id);
    // A read that failed keeps the thread on the list and says so; only a thread that is gone is dropped as deleted.
    if (!full) {
      flash({ tone: "danger", msg: <>{t.threadUnreadable}</> });
      return null;
    }
    if ("missing" in full) {
      flash({ msg: <>{t.deleted}</> });
      setThreads((prev) => prev.filter((x) => x.id !== th.id));
      return null;
    }
    const opened = { id: full.thread.id, title: full.thread.title, messages: full.messages, scope: full.thread.scope };
    setActive(opened);
    if (full.thread.scope) setScope(full.thread.scope);
    setQuery("");
    setQuick(null);
    setView("rows");
    return opened;
  };

  // Deleting asks first, wherever it is pressed: a row's × or the Delete key (N5).
  const askDelete = (th: AskThreadVM) => setDoomed(th);
  const removeThread = async (th: AskThreadVM) => {
    setDoomed(null);
    const ok = await A.deleteThread(th.id);
    if (!ok) {
      flash({ tone: "danger", msg: <>{t.deleteFailed}</> });
      return;
    }
    setThreads((prev) => prev.filter((x) => x.id !== th.id));
    if (active && active.id === th.id) setActive(null);
    flash({ msg: <>{t.deleted}</> });
  };

  // Stop: the Line lets go of the turn, whose server keeps it as stopped, and says so with what its Say had written, as the thread will.
  const stop = () => {
    if (!live) return;
    moveOn();
    live.turn.ctl.abort();
    setActive((prev) => (prev ? { ...prev, messages: [...prev.messages, A.stoppedTurn(live.say, lang)] } : prev));
  };
  return { nav, editWords, moveOn, clearLine, noteOutcome, openThread, askDelete, removeThread, stop };
};
