/* global React */
// Chanlytics -- Inbox: a reply to a reach-out, read (Reach out Part 5, PR 7). A thread whose newest reading has not
// been answered by a person since draws one strip above its composer: what the reply was read as, their words, what the
// reading did, and its doors -- "Use the draft" puts the receptionist's draft in the reply box again, and "Undo" takes
// back a reply read as no, for seven days, asking nothing: its toast says what came back. Under it, the composer's line
// says where an answer goes out from (the reach-out's own address, or the mailbox and why). Every sentence is
// contracts' (window.__replies, reach-out-reply-words.ts), and the undo goes through the bridge, which reads the
// surfaces again behind it. Who may press is the role store's answer (window.gate "approve").

/** The composer's side of "Use the draft": the draft for this thread, put in the reply box when the strip asks. */
const useReplyDraftDoor = (threadId, write) => {
  // The composer's writer is drawn anew each time; the door always hands the draft to the latest one.
  const latest = React.useRef(write);
  latest.current = write;
  React.useEffect(() => {
    const use = (e) => {
      if (e.detail && e.detail.threadId === threadId && e.detail.text) latest.current(e.detail.text);
    };
    window.addEventListener("inbox:use-draft", use);
    return () => window.removeEventListener("inbox:use-draft", use);
  }, [threadId]);
};

/** Drawn again whenever the readings are read again (the surface's event), wherever a reading is shown. */
const useRepliesRead = () => {
  const [, bump] = React.useReducer((n) => n + 1, 0);
  React.useEffect(() => {
    window.addEventListener("surface:reach_out_replies", bump);
    return () => window.removeEventListener("surface:reach_out_replies", bump);
  }, []);
};

/** The Inbox row's chip: what the thread's newest reply to a reach-out was read as. */
const ReplyChip = ({ thread }) => {
  useRepliesRead();
  const R = window.__replies;
  const reading = R && thread && thread.real ? R.readingOf(thread.id) : null;
  if (!reading) return null;
  return <span className="pill ix-reply-chip" data-intent={reading.intent} data-testid="thread-reply-chip">{R.chipOf(reading)}</span>;
};

const ReplyStrip = ({ thread }) => {
  useRepliesRead();
  const [toastNode, flash] = window.usePPToast();
  const [busy, setBusy] = React.useState(false);
  const R = window.__replies;
  const shown = R && thread && thread.real ? R.stripFor(thread) : null;
  if (!shown) return toastNode;
  const { reading, strip, fromLine } = shown;
  const putDraft = () =>
    window.dispatchEvent(new CustomEvent("inbox:use-draft", { detail: { threadId: thread.id, text: reading.draft } }));
  const undo = async () => {
    if (busy) return;
    setBusy(true);
    const r = await R.undo(reading.message_id).finally(() => setBusy(false));
    flash(r && r.ok ? { tone: "ok", msg: "Undone: it no longer reads as a no." } : window.refusalToast(r));
  };
  return (
    <div className="ix-th-reply" data-intent={reading.intent} data-testid="ix-th-reply">
      <div className="ix-th-reply-line">
        <span className="ix-th-reply-title" data-testid="ix-th-reply-title">{strip.title}</span>
        {strip.said ? <span className="ix-th-reply-said" data-testid="ix-th-reply-said">{strip.said}</span> : null}
      </div>
      {strip.did ? <div className="ix-th-reply-did" data-testid="ix-th-reply-did">{strip.did}</div> : null}
      {strip.doors.length ? (
        <div className="ix-th-reply-doors">
          {strip.doors.includes("use_draft") ? (
            <button type="button" className="btn btn-ghost btn-sm" onClick={putDraft} data-testid="ix-th-reply-use-draft" {...window.gate("approve", "use the draft")}>Use the draft</button>
          ) : null}
          {strip.doors.includes("undo") ? (
            <button type="button" className="btn btn-ghost btn-sm" onClick={undo} disabled={busy} data-testid="ix-th-reply-undo" {...window.gate("approve", "undo a reply read as no")}>Read as no · undo</button>
          ) : null}
        </div>
      ) : null}
      {fromLine ? <div className="ix-th-reply-from" data-testid="ix-th-reply-from">{fromLine}</div> : null}
      {toastNode}
    </div>
  );
};

Object.assign(window, { ReplyStrip, ReplyChip, useReplyDraftDoor });
