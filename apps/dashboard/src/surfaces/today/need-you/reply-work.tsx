/**
 * A person waiting for words (decision 0071): a handoff, a closing window, a reach-out's reply. Ask's draft is in the
 * row (drafts.ts; a reach-out reply's own, where the receptionist wrote one), changed in place, and sent through the
 * reply's door with its grace counted down in the row and Undo the whole of it (sends.ts). Not now snoozes the thread
 * until a time on the business's clock, and their next message brings it back sooner (00005); Wake undoes it.
 */
import { useMemo, useState, type ReactNode } from "react";
import { NEED_YOU_WORDS as W, THREAD_CHANNEL_WORDS, notNowChoices, type TodayQueueRowVM } from "@chanlytics/contracts";
import { commitVerb, undoVerb } from "@/legacy-bridge/verbs/commit";
import { carryReply } from "../../inbox/carried-reply";
import { Button } from "../../kit";
import { appNavigate, gate } from "../shell";
import { useDraft, type DraftWant } from "./drafts";
import { Acts, Done, Going, Note, NotNow, Words, Writing, whoseWords, type WorkProps } from "./parts";
import { clearSend, sendWords, undoSend, useSend } from "./sends";
import { useRowState } from "./row-state";

/** Where a mailbox's signature is chosen: Settings › Connections, its row's settings (00487). */
const SIGNATURE_ROUTE = "admin/integrations";

/** The clock a sent reply's line says it went at: the business's, as the row's other times. */
function clockAt(tz: string, atMs: number): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(atMs);
}

/** What a row's draft is asked for: its thread's reply to their newest message; none where the words are already written. */
export function replyWant(row: TodayQueueRowVM): DraftWant | null {
  if (!row.conversationId || !row.writes || row.prepared) return null;
  return { conversationId: row.conversationId, kind: "reply", forMessageId: row.writes.for_message_id };
}

/** A thread snoozed from its row, and the record its Wake sends. */
export interface Snoozed {
  back: string;
  record: Record<string, unknown>;
}

/** Not now on a thread: the snooze's choices, and what choosing one does. */
export function useNotNow(p: WorkProps, setSnoozed: (s: Snoozed) => void) {
  const { row, tz, flash, keep } = p;
  // The times as they stand when the menu opens (`fresh`, its trigger's press): a Today left open all day never offers an
  // hour, or an afternoon, already gone.
  const [at, setAt] = useState(() => Date.now());
  const choices = useMemo(() => notNowChoices(tz, at), [tz, at]);
  const [busy, setBusy] = useState(false);
  const choose = async (i: number) => {
    // The time pressed, as it stands at the press: the menu may have been drawn a while before.
    const c = notNowChoices(tz, Date.now()).find((x) => x.key === choices[i]?.key) ?? choices[i];
    if (!c || !row.conversationId) return;
    setBusy(true);
    // Kept before the door is asked: its refresh drops the thread from the read, and the row must stay to say so.
    keep(row);
    const r = await commitVerb("thread_verb", {
      verb: "snooze",
      conversation_id: row.conversationId,
      until: c.until,
      who: row.who,
    });
    setBusy(false);
    if (!r.ok) {
      flash({ tone: "danger", msg: <>{r.message}</> });
      return;
    }
    setSnoozed({ back: c.back, record: r.undo ?? {} });
  };
  const closes = row.writes?.window_closes;
  const caption = [W.backSooner(row.who), closes ? W.windowCloses(closes) : ""].filter(Boolean).join(" ");
  return { choices, choose, busy, caption, fresh: () => setAt(Date.now()) };
}

/** Why a send was refused, and the address an email reply waits on a yes to, where the door asked. */
interface Refused {
  message: string;
  confirmTo: string | null;
}

/** The send's own words: a template's choice outside WhatsApp's window, the address asked about, or Send. */
function sendLabel(closed: boolean, refused: Refused | null): string {
  if (closed) return W.pickTemplate;
  return refused?.confirmTo ? W.sendTo(refused.confirmTo) : W.send;
}

/** The row's words as they stand: the member's own once changed, else the receptionist's or Ask's draft. */
function useWords(row: TodayQueueRowVM, mine: string | null, may: boolean) {
  const draft = useDraft(replyWant(row), may);
  const written = row.prepared ?? (draft?.state === "ready" ? draft.draft.words.text : "");
  return { draft, written, words: mine ?? written };
}

/**
 * What a reply row prepared and lets the member do: the draft, typed in where it stands, Send with its countdown, Not now
 * with its Wake. `what` names the words where they are not a reply (a booking's confirmation), and `by` says whose they
 * are where they are not Ask's (a held reply of the receptionist's).
 */
export function ReplyWork(p: WorkProps & { what?: string; by?: string; start?: ReactNode }) {
  const { row, main, may, tz, flash, keep } = p;
  const wire = row.writes?.wire ?? row.channel;
  const [mine, setMine] = useRowState<string | null>(row.id, "mine", null);
  // Opened by Write it myself: the empty words stand, and take the keys as they are drawn.
  const [editing, setEditing] = useRowState(row.id, "editing", false);
  const [busy, setBusy] = useState(false);
  const [snoozed, setSnoozed] = useRowState<Snoozed | null>(row.id, "snoozed", null);
  const [refused, setRefused] = useRowState<Refused | null>(row.id, "refused", null);
  // Sent from this row as it is drawn now (not a send still counting from before a move back to Today): Undo takes the keys.
  const [sentHere, setSentHere] = useState(false);
  const { draft, written, words } = useWords(row, mine, may);
  const { s: send, seconds, share } = useSend(row.id);
  const notNow = useNotNow(p, setSnoozed);
  const closed = row.writes?.window_open === false;

  const sendIt = async () => {
    if (!row.conversationId || !words.trim()) return;
    // The yes to an email's address is this press: the same words sent again naming it (Refusal.confirmEmailTo).
    const emailTo = refused?.confirmTo ?? null;
    setBusy(true);
    setRefused(null);
    // Pressed here, before the countdown is drawn: it is drawn the moment the door answers, and takes the keys as it is.
    setSentHere(true);
    keep(row);
    const r = await sendWords(row.id, {
      kind: "reply",
      payload: { conversation_id: row.conversationId, text: words, ...(emailTo ? { email_to: emailTo } : {}) },
      who: row.who,
      wire,
    });
    setBusy(false);
    if (!r.ok) {
      setSentHere(false);
      return setRefused({ message: r.message, confirmTo: r.confirmTo });
    }
    setEditing(false);
  };
  const undo = async () => {
    const r = await undoSend(row.id);
    if (!r.ok) flash({ tone: "danger", msg: <>{r.message}</> });
    else setMine(words);
  };
  const wake = async () => {
    if (!snoozed) return;
    const r = await undoVerb("thread_verb", snoozed.record);
    if (!r.ok) flash({ tone: "danger", msg: <>{r.message}</> });
    else setSnoozed(null);
  };
  // Outside WhatsApp's window only an approved message reaches them: the words go to the thread's box, where it is chosen.
  const toThread = () => {
    if (words.trim()) carryReply(row.cta.to, words);
    appNavigate(row.cta.to);
  };

  if (send?.state === "going")
    return (
      <Going
        line={W.sendingIn(seconds)}
        sub={W.sendingTo(row.who, wire)}
        share={share}
        act={{ label: W.undo, onPress: () => void undo() }}
        takeFocus={sentHere}
      />
    );
  if (send?.state === "gone")
    return (
      <Done
        words={W.sent}
        detail={clockAt(tz, send.atMs)}
        act={{ label: W.open, onPress: () => appNavigate(row.cta.to) }}
      />
    );
  if (snoozed)
    return (
      <Done
        tone="rest"
        words={W.notNow}
        detail={W.back(snoozed.back)}
        act={{ label: W.wake, onPress: () => void wake() }}
      />
    );

  const sendButton = (
    <Button
      variant={main}
      onClick={() => void (closed ? toThread() : sendIt())}
      disabled={busy || (!closed && !words.trim())}
      aria-busy={busy || undefined}
      {...gate("approve", "send a reply")}
    >
      {sendLabel(closed, refused)}
    </Button>
  );
  // Typed where they stand: the member's own from the first key, and a send stopped before says nothing more.
  const type = (text: string) => {
    setMine(text);
    if (send) clearSend(row.id);
  };
  // Not now stays at the left while the words are typed: the presses do not move as they begin.
  const start =
    p.start !== undefined ? (
      p.start
    ) : row.conversationId && may ? (
      <NotNow
        who={row.who}
        choices={notNow.choices}
        caption={notNow.caption}
        onOpen={notNow.fresh}
        onChoose={(i) => void notNow.choose(i)}
        busy={notNow.busy}
      />
    ) : null;
  const writeIt = (
    <Button
      variant={main}
      onClick={() => {
        setMine("");
        setEditing(true);
      }}
    >
      {W.writeItMyself}
    </Button>
  );
  const sendEnd = words || mine !== null || closed || !may ? sendButton : writeIt;
  return (
    <>
      {send?.state === "stopped" ? <Note>{W.canceled}</Note> : null}
      {closed ? <Note tone="warn">{W.windowClosed}</Note> : null}
      <WordsPart
        what={p.what}
        who={row.who}
        words={words}
        draft={draft}
        {...whoseWords(written, mine, () => setMine(null), p.by)}
        shown={mine !== null}
        open={editing}
        onChange={may ? type : null}
        onRead={p.read}
        signed={wire === THREAD_CHANNEL_WORDS.email ? signedLineOf(draft) : null}
      />
      {refused ? <Note tone={refused.confirmTo ? "warn" : "danger"}>{refused.message}</Note> : null}
      {!may ? <Note>{W.viewer}</Note> : null}
      <Acts foot={p.foot} start={start} end={replyEnd(sendEnd, p.read, row.who, !!words && may && !closed)} />
    </>
  );
}

/**
 * The presses at a reply's right: Send (or Write it myself), and on a phone's card, with words ready to go, Edit before it,
 * which opens the sheet that walks the list on this row, where the words are a field (walk-sheet.tsx; the canvas of 1 Nov
 * 2026 sets Edit there: the card reads Ask's words where they stand). Called, not drawn.
 */
function replyEnd(send: ReactNode, read: (() => void) | null | undefined, who: string, ready: boolean): ReactNode {
  if (!read || !ready) return send;
  return (
    <>
      <Button variant="secondary" onClick={read} aria-label={W.editDraft(who)}>
        {W.edit}
      </Button>
      {send}
    </>
  );
}

/**
 * The signature an email reply from this draft leaves with, its lines as the email carries them, where the drafts read
 * said one (00487): drawn under the draft, as the mailbox's sheet previews it (the mailbox canvas, 27 Oct 2026).
 */
function signedLineOf(draft: ReturnType<typeof useDraft>): string | null {
  const signed = draft?.state === "ready" ? draft.draft.signed : undefined;
  const lines = (signed ?? "")
    .split("\n")
    .map((l) => l.trimEnd())
    .join("\n")
    .trim();
  return lines || null;
}

/**
 * What stands where a reply's words go: the words, typed in where they stand, or what Ask is doing about them. The words
 * stand once there are some, or once the member has begun their own (`shown`, even emptied, so clearing them never takes
 * their box away).
 */
function WordsPart(p: {
  /** What the words are, where they are not a reply (a booking's confirmation). */
  what?: string;
  who: string;
  words: string;
  draft: ReturnType<typeof useDraft>;
  by: string;
  shown: boolean;
  open: boolean;
  onChange: ((text: string) => void) | null;
  onRestore: (() => void) | null;
  signed: string | null;
  onRead?: (() => void) | null;
}) {
  const { draft } = p;
  if (p.words || p.shown)
    return (
      <Words
        what={p.what ?? W.reply}
        by={p.by}
        text={p.words}
        who={p.who}
        onChange={p.onChange}
        onRestore={p.onRestore}
        open={p.open}
        signed={p.signed}
        onSigned={p.signed ? () => appNavigate(SIGNATURE_ROUTE) : null}
        onRead={p.onRead}
      />
    );
  if (draft?.state === "writing") return <Writing />;
  if (draft?.state === "asks") return <Note>{W.asks(draft.question)}</Note>;
  if (draft?.state === "failed") return <Note>{draft.why}</Note>;
  return null;
}
