/**
 * A person waiting for words (decision 0071; one sheet, 9 Nov 2026): a handoff, a closing window, a reach-out's reply. Ask's
 * draft is in the row (drafts.ts; a reach-out reply's own, where the receptionist wrote one), and the field is how it is changed
 * by hand; what is said to Ask's line changes what is on the screen. It goes through the reply's door with its grace counted
 * down and Undo the whole of it (sends.ts). Not now snoozes the thread until a time on the business's clock, and their next
 * message brings it back sooner (00005); Wake undoes it.
 *
 * Which press is the coral follows the moment (his call D6): a reply that never reached them offers what can work, a reply to a
 * reach-out says what has already been done and offers only what is left, and one past a week may be let go.
 */
import { useMemo, useState, type ReactNode } from "react";
import {
  NEED_YOU_WORDS as W,
  THREAD_CHANNEL_WORDS,
  addressOf,
  callWhoOf,
  notNowChoices,
  readingMomentOf,
  staleRow,
  type TodayQueueRowVM,
} from "@chanlytics/contracts";
import { commitVerb, undoVerb } from "@/bridge/verbs/commit";
import { carryNotAPerson, carryReply } from "../../inbox/carried-reply";
import { Button } from "../../kit";
import { Icon } from "../../kit/icon/icon";
import { appNavigate, gate, mayAtLeast } from "../shell";
import { AskLine } from "./ask-line";
import { rewriteDraft, useDraft, type DraftWant } from "./drafts";
import { Acts, Done, Going, Note, NotNow, Words, Writing, startKind, whoseWords, type WorkProps } from "./parts";
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
  return {
    conversationId: row.conversationId,
    kind: "reply",
    forMessageId: row.writes.for_message_id,
    expected: row.writes.window_open !== false,
    askedAtMs: row.writes.for_message_at_ms ?? null,
  };
}

/** A thread snoozed from its row, and the record its Wake sends. */
export interface Snoozed {
  back: string;
  record: Record<string, unknown>;
}

/** Not now on a thread: the snooze's choices, and what choosing one does, or a time of the page's own (Back at 4 PM). */
export function useNotNow(p: WorkProps, setSnoozed: (s: Snoozed) => void) {
  const { row, tz, flash, keep, unkeep } = p;
  // The times as they stand when the menu opens (`fresh`, its trigger's press): a Today left open all day never offers an
  // hour, or an afternoon, already gone.
  const [at, setAt] = useState(() => Date.now());
  const choices = useMemo(() => notNowChoices(tz, at), [tz, at]);
  const [busy, setBusy] = useState(false);
  const until = async (when: string, back: string) => {
    if (!row.conversationId) return;
    setBusy(true);
    // Kept before the door is asked: its refresh drops the thread from the read, and the row must stay to say so.
    keep(row);
    const r = await commitVerb("thread_verb", {
      verb: "snooze",
      conversation_id: row.conversationId,
      until: when,
      who: row.who,
    });
    setBusy(false);
    if (!r.ok) {
      unkeep(row);
      flash({ tone: "danger", msg: <>{r.message}</> });
      return;
    }
    setSnoozed({ back, record: r.undo ?? {} });
  };
  const choose = async (i: number) => {
    // The time pressed, as it stands at the press: the menu may have been drawn a while before.
    const c = notNowChoices(tz, Date.now()).find((x) => x.key === choices[i]?.key) ?? choices[i];
    if (c) await until(c.until, c.back);
  };
  const closes = row.writes?.window_closes;
  const caption = [W.backSooner(row.who), closes ? W.windowCloses(closes) : ""].filter(Boolean).join(" ");
  return { choices, choose, until, busy, caption, fresh: () => setAt(Date.now()) };
}

/**
 * Not a person, on an email's row (decision 0080): a program's mail taken for a person is let go where the owner meets it,
 * and the sorting is taught (its address, or its domain, said to be automated, so its mail stays in the mailbox from now
 * on). It deletes them, so it opens their page with Not a person asked, the typed name and all (00483), as the thread's
 * Actions do. The owner's alone, on a row whose person is known; null on any other.
 */
function notAPersonOf(row: TodayQueueRowVM, wire: string): (() => void) | null {
  const id = row.person_id;
  if (!id || wire !== THREAD_CHANNEL_WORDS.email || !mayAtLeast("owner")) return null;
  return () => {
    carryNotAPerson(id);
    appNavigate(addressOf({ kind: "person", id }));
  };
}

/**
 * Mark done on one row (2 Nov 2026: a row was let go only by Mark all done, once a week old): the hold resolved and the
 * thread the receptionist's again (core handBack, as Mark all done and a call back's Reached do), so it answers them if
 * they write; Undo takes the thread over again (the verb's own inverse). A hold's row alone, a handoff or a reach-out's
 * reply read, a call back (8 Nov 2026: its note says to mark one done, and nothing there did): a closing window and a reply
 * counting down hold nothing to give back.
 */
export function useMarkDone(work: WorkProps) {
  const { row, flash, keep, unkeep } = work;
  const [done, setDone] = useRowState<Record<string, unknown> | null>(row.id, "markedDone", null);
  const may =
    work.may && !!row.conversationId && (row.kind === "handoff" || row.kind === "reply" || row.kind === "callback");
  const mark = async () => {
    if (!row.conversationId) return;
    // Kept before the door is asked: its refresh drops the hold from the read, and the row must stay to say so.
    keep(row);
    const r = await commitVerb("thread_verb", {
      verb: row.closes ?? "hand_back",
      conversation_id: row.conversationId,
      who: row.who,
    });
    if (!r.ok) {
      unkeep(row);
      return flash({ tone: "danger", msg: <>{r.message}</> });
    }
    setDone(r.undo ?? {});
  };
  const undo = async () => {
    if (!done) return;
    const r = await undoVerb("thread_verb", done);
    if (!r.ok) return flash({ tone: "danger", msg: <>{r.message}</> });
    setDone(null);
    unkeep(row);
  };
  return { done: done !== null, mark: may ? () => void mark() : null, undo: () => void undo() };
}

/** Why a send was refused, and the address an email reply waits on a yes to, where the door asked. */
interface Refused {
  message: string;
  confirmTo: string | null;
}

/** The send's own words: a template's choice outside WhatsApp's window, the address asked about, or Send. */
function sendLabel(closed: boolean, refused: Refused | null, send: string): string {
  if (closed) return W.pickTemplate;
  return refused?.confirmTo ? W.sendTo(refused.confirmTo) : send;
}

/** The row's words as they stand: the member's own once changed, else the receptionist's or Ask's draft. */
function useWords(row: TodayQueueRowVM, mine: string | null) {
  const draft = useDraft(replyWant(row));
  const written = row.prepared ?? (draft?.state === "ready" ? draft.draft.words.text : "");
  return { draft, written, words: mine ?? written };
}

/**
 * What is said to Ask's line about the words on the screen: they stand, dimmed, while Ask changes them; the new ones take their
 * place with an Undo beside them; refused, the words stay and it says why. The words said go to the model as they are, with
 * what is on the screen (a reply they typed, one that never reached them), never a draft they cannot see.
 */
export function useAskChange(row: TodayQueueRowVM, words: string, setMine: (text: string | null) => void) {
  const [busy, setBusy] = useState(false);
  const [why, setWhy] = useRowState<string | null>(row.id, "askWhy", null);
  // The words they had before Ask's last change, and what Ask last wrote, which is still Ask's though it stands as `mine`.
  const [prior, setPrior] = useRowState<string | null>(row.id, "askPrior", null);
  const [asks, setAsks] = useRowState<string | null>(row.id, "askWords", null);
  const [over, setOver] = useState<string | null>(null);
  const say = async (instruction: string) => {
    if (!row.conversationId) return false;
    setBusy(true);
    setWhy(null);
    setOver(words);
    const r = await rewriteDraft({ conversationId: row.conversationId, kind: "reply" }, instruction, words);
    setBusy(false);
    setOver(null);
    if (!r.ok) {
      setWhy(r.why);
      return false;
    }
    setPrior(words);
    setAsks(r.words);
    setMine(r.words);
    return true;
  };
  const undo = prior
    ? () => {
        setMine(prior);
        setAsks(prior);
        setPrior(null);
      }
    : null;
  return { say, busy, why, undo, asks, over, changed: prior !== null };
}

/** The presses at a reply's left and right, by the moment. Called, not drawn. */
function momentActs(a: {
  p: WorkProps;
  sendPress: ReactNode;
  notNow: ReactNode;
  marked: ReturnType<typeof useMarkDone>;
  wire: string;
  replying: boolean;
  setReplying: (on: boolean) => void;
  callTo: string | null;
  laterPress: () => void;
}): { start: ReactNode; end: ReactNode } {
  const { p, sendPress, notNow, marked, wire, replying, setReplying, callTo, laterPress } = a;
  const { row } = p;
  const moment = readingMomentOf(row.reading);
  const markPress = marked.mark ? (
    <Button variant={p.main} onClick={marked.mark}>
      {W.oldDone.yes}
    </Button>
  ) : null;
  const quiet = startKind(p.foot);
  // What can reach them after a reply that never arrived: a call where the wire cannot, a later try where it has asked for one.
  if (row.failed?.way === "call" && callTo)
    return {
      start: notNow,
      end: (
        <Button variant={p.main} href={`tel:${callTo}`}>
          <Icon name="phone" size={15} />
          {W.call.callWho(callWhoOf(row.who))}
        </Button>
      ),
    };
  if (row.failed?.way === "done" && markPress) return { start: null, end: markPress };
  if (row.failed?.way === "later")
    return {
      start: notNow,
      end: (
        <Button variant={p.main} onClick={laterPress}>
          {W.failed.later}
        </Button>
      ),
    };
  if (moment && !replying) {
    if (moment.reply === "none" && !moment.notAPerson) return { start: null, end: markPress };
    if (moment.notAPerson) {
      const letGo = notAPersonOf(row, wire);
      return {
        start: letGo ? (
          <Button variant={quiet} onClick={letGo}>
            {W.read.notAPerson}
          </Button>
        ) : null,
        end: markPress,
      };
    }
    if (moment.reply === "door")
      return {
        start: (
          <Button variant={quiet} onClick={() => setReplying(true)}>
            {W.read.replyNow}
          </Button>
        ),
        end: markPress,
      };
  }
  // A plain reply past a week may be let go: that leads, and Send stands quiet beside it.
  if (markPress && staleRow(row) && !row.failed && !moment)
    return { start: <span className="ny-quiet-send">{sendPress}</span>, end: markPress };
  return { start: notNow, end: sendPress };
}

/** What a reply row holds and does: its words, what it is doing, and each of its presses. */
function useReplyRow(p: WorkProps & { start?: ReactNode }) {
  const { row, flash, keep, unkeep } = p;
  const wire = row.writes?.wire ?? row.channel;
  const [mine, setMine] = useRowState<string | null>(row.id, "mine", null);
  // Opened by Write it myself: the empty words stand, and take the keys as they are drawn.
  const [editing, setEditing] = useRowState(row.id, "editing", false);
  const [busy, setBusy] = useState(false);
  const [snoozed, setSnoozed] = useRowState<Snoozed | null>(row.id, "snoozed", null);
  const [refused, setRefused] = useRowState<Refused | null>(row.id, "refused", null);
  // Sent from this row as it is drawn now (not a send still counting from before a move back to Today): Undo takes the keys.
  const [sentHere, setSentHere] = useState(false);
  const { draft, written, words } = useWords(row, mine);
  const sending = useSend(row.id);
  const notNow = useNotNow(p, setSnoozed);
  const marked = useMarkDone(p);
  const ask = useAskChange(row, words, setMine);
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
      unkeep(row);
      return setRefused({ message: r.message, confirmTo: r.confirmTo });
    }
    setEditing(false);
  };
  const undo = async () => {
    const r = await undoSend(row.id);
    if (!r.ok) return flash({ tone: "danger", msg: <>{r.message}</> });
    setMine(words);
    unkeep(row);
  };
  const wake = async () => {
    if (!snoozed) return;
    const r = await undoVerb("thread_verb", snoozed.record);
    if (!r.ok) return flash({ tone: "danger", msg: <>{r.message}</> });
    setSnoozed(null);
    unkeep(row);
  };
  // Outside WhatsApp's window only an approved message reaches them: the words go to the thread's box, where it is chosen.
  const toThread = () => {
    if (words.trim()) carryReply(row.cta.to, words);
    appNavigate(row.cta.to);
  };
  return {
    wire,
    mine,
    setMine,
    editing,
    setEditing,
    busy,
    snoozed,
    refused,
    sentHere,
    draft,
    written,
    words,
    sending,
    notNow,
    marked,
    ask,
    sendIt,
    undo,
    wake,
    toThread,
  };
}

/** What a reply row came to, where it has come to something: on its way, gone, put off or let go. Called, not drawn. */
function replyEnded(p: WorkProps, r: ReturnType<typeof useReplyRow>): ReactNode {
  const { row, tz } = p;
  const { s: send, seconds, share } = r.sending;
  if (send?.state === "going")
    return (
      <>
        {p.foot ? <Words label={W.goingTo(row.who)} text={r.words} who={row.who} onChange={null} /> : null}
        <Going
          line={W.sendingIn(seconds)}
          sub={W.sendingTo(row.who, r.wire)}
          share={share}
          act={{ label: W.undo, onPress: () => void r.undo() }}
          takeFocus={r.sentHere}
          foot={p.foot}
        />
      </>
    );
  if (send?.state === "gone")
    return (
      <Done
        words={W.sent}
        detail={clockAt(tz, send.atMs)}
        act={p.foot ? null : { label: W.open, onPress: () => appNavigate(row.cta.to) }}
        foot={p.foot}
      />
    );
  if (r.snoozed)
    return (
      <Done
        tone="rest"
        words={W.notNow}
        detail={W.back(r.snoozed.back)}
        act={{ label: W.wake, onPress: () => void r.wake() }}
        foot={p.foot}
      />
    );
  if (r.marked.done)
    return (
      <Done
        words={W.oldDone.done(1)}
        detail={W.oldDone.detail}
        act={{ label: W.undo, onPress: r.marked.undo }}
        foot={p.foot}
      />
    );
  return null;
}

/** The press that sends, or writes from nothing where there are no words yet. Called, not drawn. */
function sendPressOf(
  p: WorkProps & { sendWord?: string },
  r: ReturnType<typeof useReplyRow>,
  closed: boolean,
): ReactNode {
  const { row, main, may } = p;
  const staleQuiet = staleRow(row) && !!r.marked.mark && !row.failed && !row.reading;
  const sendPress = (
    <Button
      variant={staleQuiet ? "secondary" : main}
      onClick={() => void (closed ? r.toThread() : r.sendIt())}
      disabled={r.busy || r.ask.busy || (!closed && !r.words.trim())}
      aria-busy={r.busy || undefined}
      {...gate("approve", "send a reply")}
    >
      {sendLabel(closed, r.refused, p.sendWord ?? W.send)}
    </Button>
  );
  if (r.words || r.ask.over || r.mine !== null || closed || !may) return sendPress;
  return (
    <Button
      variant={main}
      onClick={() => {
        r.setMine("");
        r.setEditing(true);
      }}
    >
      {W.writeItMyself}
    </Button>
  );
}

/** What stands on a reply row as it waits on the member: which words, which lines. Pure over the row and what it holds. */
function replyStage(p: WorkProps, r: ReturnType<typeof useReplyRow>, replying: boolean) {
  const { row, may } = p;
  const { mine, ask, written } = r;
  const callTo = row.phone ?? null;
  const moment = readingMomentOf(row.reading);
  // A reach-out's reply that wants no answer by default says what was done, and its words stand only on Reply now.
  const quietWords = !!moment && moment.reply !== "send" && !replying;
  // Words that cannot go as words: a call is what can reach them, or nothing can. Up next still shows what failed.
  const failedOnly = !!p.whole && ((row.failed?.way === "call" && !!callTo) || row.failed?.way === "done");
  const yours = mine !== null && mine !== ask.asks && !!(ask.asks ?? written);
  return {
    closed: row.writes?.window_open === false || row.failed?.way === "template",
    moment,
    callTo,
    quietWords,
    failedOnly,
    // A phone's Up next is its line, two lines of the words and its presses: the sheet says the rest.
    says: !p.read,
    // Ask's line, wherever there are words to change or to have written: never over the member's own typing, and only for a
    // member who sends. On a phone's Up next the sheet holds it.
    askable: !!p.whole && may && !!row.conversationId && !quietWords && !failedOnly && !yours,
  };
}

/** The lines over a reply's words: what was done, why it could not go. Called, not drawn. */
function replyNotes(row: TodayQueueRowVM, r: ReturnType<typeof useReplyRow>, stage: ReturnType<typeof replyStage>) {
  const { moment, says, closed } = stage;
  return (
    <>
      {moment && says ? <Note tone={moment.tone}>{moment.did}</Note> : null}
      {r.sending.s?.state === "stopped" ? <Note>{W.canceled}</Note> : null}
      {row.failed && says && row.failed.way !== "again" ? <Note tone="warn">{row.failed.plain}</Note> : null}
      {closed && !row.failed && says ? <Note tone="warn">{W.windowClosed}</Note> : null}
    </>
  );
}

/** The words themselves, typed in where they stand, or nothing where none should go. Called, not drawn. */
function replyWords(
  p: WorkProps & { what?: string; by?: string },
  r: ReturnType<typeof useReplyRow>,
  stage: ReturnType<typeof replyStage>,
) {
  const { row, may } = p;
  const { mine, ask, draft, words, written, wire } = r;
  if (stage.quietWords || stage.failedOnly) return null;
  // Typed where they stand: the member's own from the first key, and a send stopped before says nothing more.
  const type = (text: string) => {
    r.setMine(text);
    if (r.sending.s) clearSend(row.id);
  };
  return (
    <WordsPart
      what={p.what}
      who={row.who}
      words={ask.over ?? words}
      draft={draft}
      {...whoseWords(ask.asks ?? written, mine, () => r.setMine(null), p.by)}
      shown={mine !== null}
      open={r.editing}
      onChange={may ? type : null}
      onRead={p.read}
      busy={ask.busy}
      undo={ask.undo}
      signed={wire === THREAD_CHANNEL_WORDS.email ? signedLineOf(draft) : null}
    />
  );
}

/**
 * What a reply row prepared and lets the member do: the draft, typed in where it stands, what is said to Ask's line about it, Send
 * with its countdown, Not now with its Wake. `what` names the words where they are not a reply (a booking's confirmation), `by`
 * says whose they are where they are not Ask's (a held reply of the receptionist's), and `sendWord` is the press where it is not
 * Send (a reply that never reached them goes again with Try again).
 */
export function ReplyWork(p: WorkProps & { what?: string; by?: string; start?: ReactNode; sendWord?: string }) {
  const { row, may } = p;
  const r = useReplyRow(p);
  // Reply now pressed on a reach-out's reply that needs none by default: its words and Send stand.
  const [replying, setReplying] = useRowState(row.id, "replying", false);
  const ended = replyEnded(p, r);
  if (ended) return ended;
  const { wire, ask, refused, marked, notNow } = r;
  const stage = replyStage(p, r, replying);
  const { start, end } = momentActs({
    p,
    sendPress: sendPressOf(p, r, stage.closed),
    notNow: p.start !== undefined ? p.start : notNowOf(p, notNow, marked.mark, wire),
    marked,
    wire,
    replying,
    setReplying,
    callTo: stage.callTo,
    laterPress: () => void notNow.choose(0),
  });
  return (
    <>
      {replyNotes(row, r, stage)}
      {replyWords(p, r, stage)}
      {row.failed?.way === "call" && stage.failedOnly ? (
        <span className="ny-doorline">
          <Button variant="quiet" size="text" onClick={() => void r.sendIt()}>
            {W.failed.tryWire(wire)}
            <Icon name="chevron" size={11} />
          </Button>
        </span>
      ) : null}
      {stage.askable ? (
        <AskLine
          placeholder={ask.changed ? W.say.tellMore : W.say.tell}
          onSay={ask.say}
          busy={ask.busy}
          why={ask.why}
        />
      ) : null}
      {refused ? <Note tone={refused.confirmTo ? "warn" : "danger"}>{refused.message}</Note> : null}
      {!may ? <Note>{W.viewer}</Note> : null}
      <Acts foot={p.foot} start={start} end={end} />
    </>
  );
}

/**
 * Not now at a reply's left, with Mark done and Not a person under its times where each is the member's; none where
 * the row has no thread or the member presses nothing. Called, not drawn.
 */
function notNowOf(
  p: WorkProps,
  notNow: ReturnType<typeof useNotNow>,
  markDone: (() => void) | null,
  wire: string,
): ReactNode {
  const { row } = p;
  if (!row.conversationId || !p.may) return null;
  return (
    <NotNow
      who={row.who}
      choices={notNow.choices}
      caption={notNow.caption}
      onOpen={notNow.fresh}
      onChoose={(i) => void notNow.choose(i)}
      busy={notNow.busy}
      markDone={markDone}
      letGo={notAPersonOf(row, wire)}
      foot={p.foot}
    />
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
  /** What stands over the words, where they are not Ask's reply (a booking's confirmation). */
  what?: string;
  who: string;
  words: string;
  draft: ReturnType<typeof useDraft>;
  by: string;
  asks: boolean;
  shown: boolean;
  open: boolean;
  onChange: ((text: string) => void) | null;
  onRestore: (() => void) | null;
  signed: string | null;
  onRead?: (() => void) | null;
  busy: boolean;
  undo: (() => void) | null;
}) {
  const { draft } = p;
  if (p.words || p.shown)
    return (
      <Words
        label={p.asks && p.what ? p.what : p.by}
        asks={p.asks && !p.what}
        text={p.words}
        who={p.who}
        onChange={p.onChange}
        onRestore={p.onRestore}
        undo={p.undo}
        open={p.open}
        busy={p.busy}
        signed={p.signed}
        onSigned={p.signed ? () => appNavigate(SIGNATURE_ROUTE) : null}
        onRead={p.onRead}
      />
    );
  if (draft?.state === "writing") return <Writing short={!!p.onRead} />;
  if (draft?.state === "asks") return <Note>{W.asks(draft.question)}</Note>;
  if (draft?.state === "pitch") return <Note>{W.pitch(draft.what)}</Note>;
  if (draft?.state === "failed") return <Note>{draft.why}</Note>;
  return null;
}
