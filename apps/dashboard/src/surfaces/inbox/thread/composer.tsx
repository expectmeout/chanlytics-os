/**
 * The reply box (moved from pages/inbox-thread.jsx, decision 0015): the composer, the one send that works outside the
 * 24-hour window, and the "Why?" that keeps an explanation one tap away.
 *
 * The composer is a function per box, called by `Composer` and not drawn as a component of its own, so the tree is the
 * tree it was; its hooks stay in `Composer`, in the order they were, and each effect's body is a function beside it.
 */
import { emailSignedLine, optOutWords, shortName, THREAD_PANE_WORDS } from "@chanlytics/contracts";
import { useEffect, useRef, useState, type Dispatch, type ReactNode, type RefObject, type SetStateAction } from "react";
import { rewriteReplyDraft } from "../verbs";
import { Icon } from "../../kit/icon/icon";
import { FOCUS_COMPOSER_MS, SAVED_NOTICE_MS } from "../constants";
import { ixInDialog } from "../keys";
import { appNavigate, canDo, gate, tabMemory } from "../shell";
import type { Thread } from "../types";
import { takeCarriedReply } from "../carried-reply";
import { keptReplyNow, keptReplyOf, signedNow, signedOf } from "./kept-draft";
import { useReplyDraftDoor } from "./reply-strip";
import { detailField } from "./shell-thread";
import { holderName } from "../../holder-names";
import { ixBandCallBack } from "./band";
import { growWithWords, isPromise, type OnSend } from "./send-words";
import { ChatClosed, TemplateComposer } from "./template-box";
import { Button } from "../../kit/button/button";

type SetText = Dispatch<SetStateAction<string>>;
/** What an email from the box is signed with: words, none, or not said yet (undefined). */
type SetSigned = (s: string | null) => void;
type BoxRef = RefObject<HTMLTextAreaElement | null>;

/** A reply carried in from another page ("Text the booking link", carried-reply.ts): only into an empty composer, and once. */
function putCarriedReply(threadId: string, setText: SetText, taRef: BoxRef) {
  const said = takeCarriedReply(threadId);
  if (said === null) return;
  setText((cur) => (cur && cur.trim() ? cur : said));
  window.setTimeout(() => {
    if (taRef.current) taRef.current.focus();
  }, FOCUS_COMPOSER_MS);
}

/**
 * Need you's drafted reply (kept-draft.ts), where the strip says it can be changed or sent from here: only into an empty
 * box, and only while this thread is the one open. The box is drawn with it where the newest kept drafts hold it (Composer's
 * first words); the thread's own read is asked for only where they cannot say, and what it says of the signature is kept too.
 */
function putKeptDraft(thread: Thread, setText: SetText, setSigned: SetSigned, setDrafted: (w: string) => void) {
  if (!thread.real) return;
  const now = keptReplyNow(thread);
  if (now !== undefined) {
    if (now) {
      setDrafted(now);
      setText((cur) => (cur && cur.trim() ? cur : now));
    }
    return;
  }
  let open = true;
  // A read that fails puts nothing: the box stays as the member left it.
  void keptReplyOf(thread)
    .then(({ words, signed }) => {
      if (!open) return;
      if (words) {
        setDrafted(words);
        setText((cur) => (cur && cur.trim() ? cur : words));
      }
      if (signed !== undefined) setSigned(signed);
    })
    .catch(() => undefined);
  return () => {
    open = false;
  };
}

/**
 * What an email from the box is signed with (decision 0081), where nothing said it yet: the thread's own read, asked once
 * the box has words (an empty box says none, so it asks none), and put only while the thread is still the one open.
 */
function putSigned(thread: Thread, wanted: boolean, setSigned: SetSigned) {
  if (!wanted) return;
  let open = true;
  void signedOf(thread).then((s) => {
    if (open) setSigned(s);
  });
  return () => {
    open = false;
  };
}

/** Where what an email is signed with is changed: Settings › Connections, each mailbox's sheet. */
const SIGNATURE_ROUTE = "admin/integrations";

interface ComposerKeys {
  text: string;
  threadId: string;
  doSend: () => void;
  write: (v: string) => void;
  setText: SetText;
  taRef: BoxRef;
}

/** ⌘↵ sends, and the page's asks reach the box: a card's Edit, a toast's yes, the header's Send proposal. */
function listenToComposer(k: ComposerKeys) {
  const { text, threadId, doSend, write, setText, taRef } = k;
  const onKey = (e: KeyboardEvent) => {
    // Not a key something else took (a sheet's own ⌘↵ records it), and not one pressed inside a dialog over the page
    // (the deal sheet, the New conversation sheet: keys.ts says which): a ⌘↵ there sent whatever was in this box, even
    // while the sheet saved.
    if (e.defaultPrevented || ixInDialog(e.target)) return;
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      doSend();
    }
  };
  // A card's "Edit in the composer" arrives with the words, naming its thread (no other box takes them); a plain focus
  // request arrives with none and leaves what is typed alone.
  const onFocus = (e: Event) => {
    const at = detailField(e, "threadId");
    if (typeof at === "string" && at !== threadId) return;
    const said = detailField(e, "text");
    const words = typeof said === "string" ? said : null;
    if (words) setText(words);
    if (taRef.current) taRef.current.focus();
  };
  // A reply that waited on a yes (an email going to a different address than it came from) is sent from the
  // toast, after this box was told to keep its words: it lets go of them when that send is accepted.
  const onSent = (e: Event) => {
    if (detailField(e, "threadId") === threadId) write("");
  };
  // The header's "Send proposal" arrives with the words (00154): an empty box takes the sentence, a box with
  // words in it takes the address on its own line under them, and the cursor lands in the box either way.
  const onCompose = (e: Event) => {
    const words = detailField(e, "text");
    if (typeof words !== "string") return;
    const link = detailField(e, "link");
    write(text && text.trim() ? `${text.trimEnd()}\n${typeof link === "string" && link ? link : words}` : words);
    if (taRef.current) taRef.current.focus();
  };
  window.addEventListener("keydown", onKey);
  window.addEventListener("inbox:focus-composer", onFocus);
  window.addEventListener("inbox:reply-sent", onSent);
  window.addEventListener("inbox:compose", onCompose);
  return () => {
    window.removeEventListener("keydown", onKey);
    window.removeEventListener("inbox:focus-composer", onFocus);
    window.removeEventListener("inbox:reply-sent", onSent);
    window.removeEventListener("inbox:compose", onCompose);
  };
}

interface ComposerProps {
  thread: Thread;
  reply: string;
  hasApproval?: boolean;
  onType?: (() => void) | null;
  onSend?: OnSend;
  /** What stands beside Send, at the box's left (the dock's Hand back, status.tsx composerAside). */
  aside?: ReactNode;
}

/** Everything the boxes draw from: the props, the words, and what pressing does. */
interface ComposerDraw extends ComposerProps {
  text: string;
  setText: SetText;
  write: (v: string) => void;
  taRef: BoxRef;
  sending: boolean;
  doSend: () => void;
  isApproveAndSend: boolean | undefined;
  alt: boolean;
  setAlt: (v: boolean) => void;
  saved: boolean;
  setSaved: (v: boolean) => void;
  /** What an email from the box is signed with, for the member writing (decision 0081); null where nothing signs it. */
  signed: string | null;
  /** The receptionist's draft the box was given (kept-draft.ts), said as its while the box holds it unchanged. */
  drafted: string | null;
  /** The draft's Why this?, open or not, and the line that has it written again, open or not. */
  why: [boolean, (v: boolean) => void];
  rewrite: [boolean, (v: boolean) => void];
  /** A new draft put in the box by a rewrite: the box says it is the receptionist's again. */
  setDrafted: (w: string | null) => void;
}

// Checked BEFORE the window branch: an opt-out is stronger than a closed
// 24h window, where an approved template still gets through. Here nothing
// does, so the composer offers no send at all rather than a button whose
// only outcome is a rejection from the API.
function optedOutComposer(thread: Thread) {
  return (
    <div className="ix-composer">
      <div className="ix-composer-banner">
        <Icon name="shield" size={11} />
        <span>{optOutWords(thread.who)}</span>
      </div>
    </div>
  );
}

// The reply would go by email and the address has stopped (it bounced, or they reported a message): the route would
// refuse it after the owner had written it, so the box says so first, in contracts' sentence, and offers no email to write.
function emailStoppedComposer(words: string) {
  return (
    <div className="ix-composer" data-testid="ix-composer-email-stopped">
      <div className="ix-composer-banner">
        <Icon name="mail" size={11} />
        <span>{words}</span>
      </div>
    </div>
  );
}

// A DM thread past Instagram's day: a business may not write at all, and has no approved message to write with, so the
// box says so and offers nothing to send (contracts THREAD_PANE_WORDS.dmClosedWhy; core reply.ts refuses the same).
function dmClosedComposer() {
  return (
    <div className="ix-composer" data-testid="ix-composer-dm-closed">
      <div className="ix-composer-banner">
        <Icon name="lock" size={11} />
        <span>{THREAD_PANE_WORDS.dmClosedWhy}</span>
      </div>
    </div>
  );
}

// A caller with no WhatsApp thread: the window never opened, so the honest
// verbs are the phone and an approved message that starts a thread.
function noChatComposer(thread: Thread, onSend: OnSend) {
  // The header names the channel and the number, and the line above says they phoned: what is left is what can be
  // sent. A caller with no WhatsApp thread has no free-form reply, so the verbs are the call -- where the line above
  // does not already carry it -- and the approved message that starts a thread.
  const call =
    !ixBandCallBack(thread) && thread.phone ? (
      <Button size="sm" href={`tel:${thread.phone}`} data-testid="ix-call-back">
        <Icon name="phone" size={12} /> Call back
      </Button>
    ) : null;
  return (
    <TemplateComposer
      key={thread.id}
      onSend={onSend}
      threadId={thread.id}
      real={!!thread.real}
      thread={thread}
      lead={call}
    />
  );
}

// The window has closed: the box says so at its head, and why on a press (ChatClosed), over the one send that works.
// It was a red block saying the window had closed, over a line saying "WhatsApp · to Rosa Díaz" again, over the send:
// three rows at the foot of a phone; then a bar under the header, away from the box it explained (the thread canvas,
// 1 Nov 2026).
function closedComposer(thread: Thread, onSend: OnSend) {
  // A call beside the send, where one can go (the thread canvas, 1 Nov 2026): the other way to reach them now.
  const call =
    thread.phone && !thread.dnc ? (
      <Button variant="outline" size="touch" href={`tel:${thread.phone}`} data-testid="ix-tpl-call">
        <Icon name="phone" size={15} />
        {THREAD_PANE_WORDS.call}
      </Button>
    ) : null;
  return (
    <>
      <div className="ix-th-closed" data-testid="ix-th-closed">
        <ChatClosed dm={false} who={thread.who} />
      </div>
      <TemplateComposer
        key={thread.id}
        onSend={onSend}
        threadId={thread.id}
        real={!!thread.real}
        thread={thread}
        aside={call}
      />
    </>
  );
}

/**
 * Under the draft's words, what it will be signed with (decision 0081) where an email is, its Change, and Rewrite (the
 * thread canvas, 1 Nov 2026: "Signed Ruben Segura · Founder, RJ… | Change | ✦ Rewrite"): what is sent is what is seen.
 */
function signedLine(c: ComposerDraw) {
  const W = THREAD_PANE_WORDS;
  const signed = c.signed && c.text.trim() ? c.signed : null;
  const [rewriting, setRewriting] = c.rewrite;
  // Rewrite is for words in the box: an empty box stays the one field.
  const canRewrite = !!c.thread.conversationId && (!!c.drafted || !!c.text.trim());
  if (!signed && !canRewrite) return null;
  return (
    <div className="ix-composer-signed" data-testid="ix-composer-signed">
      {signed ? (
        <>
          <span className="ix-composer-signed-words" data-testid="ix-composer-signed-words" title={signed}>
            {emailSignedLine(signed)}
          </span>
          <Button
            variant="quiet"
            size="text"
            className="ix-composer-tool ix-press"
            onClick={() => appNavigate(SIGNATURE_ROUTE)}
            title={W.changeSignatureTip}
          >
            {W.changeSignature}
          </Button>
        </>
      ) : (
        <span className="ix-composer-signed-words" />
      )}
      {signed && canRewrite ? <span className="ix-composer-rule" aria-hidden="true" /> : null}
      {canRewrite ? (
        <Button
          variant="quiet"
          size="text"
          className="ix-composer-tool ix-press"
          aria-expanded={rewriting}
          onClick={() => setRewriting(!rewriting)}
          data-testid="ix-composer-rewrite"
          {...gate("approve", "have the receptionist write the draft again")}
        >
          <Icon name="spark" size={11} />
          {W.rewrite}
        </Button>
      ) : null}
    </div>
  );
}

/** The line that has the receptionist write the box's draft again, as the member asks (Rewrite, above). */
function RewriteLine({ c }: { c: ComposerDraw }) {
  const W = THREAD_PANE_WORDS;
  const [asked, setAsked] = useState("");
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const id = c.thread.conversationId;
  const go = async () => {
    const how = asked.trim();
    if (!how || busy || !id) return;
    setBusy(true);
    setSaid(null);
    const r = await rewriteReplyDraft(id, how);
    setBusy(false);
    if (r.ok) {
      c.write(r.words);
      c.setDrafted(r.words);
      setAsked("");
      c.rewrite[1](false);
    } else setSaid(r.message);
  };
  return (
    <div className="ix-steer ix-composer-rewrite-line" data-testid="ix-composer-rewrite-line">
      <Icon name="spark" size={13} className="ix-steer-spark" />
      <input
        className="ix-steer-input"
        value={asked}
        onChange={(e) => setAsked(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void go();
        }}
        placeholder={W.rewriteAsk}
        maxLength={500}
        disabled={busy}
        aria-label={W.rewriteLabel}
      />
      <Button
        variant="soft"
        size="sm"
        className="ix-press"
        onClick={go}
        disabled={busy || !asked.trim()}
        {...gate("approve")}
      >
        {busy ? W.rewriting : W.rewrite}
      </Button>
      {said ? (
        <span className="ix-composer-rewrite-said" role="status">
          {said}
        </span>
      ) : null}
    </div>
  );
}

// A real thread's reply box (the thread canvas, 1 Nov 2026), in one of two shapes. An email, or a draft the receptionist
// wrote, is a box of the inset's ground: whose words they are and why, the words, what they are signed with, and under it
// the box's acts, what stands beside Send at the left and Send at the right. A chat's is one line that grows, in an inset
// capsule, with Send a coral round at its end.
/**
 * Over the words, while the box holds the receptionist's draft as it wrote it: whose they are, and Why this? (the thread
 * canvas, 1 Nov 2026). The draft sat in the box unlabelled and read as the member's own typing; once it is changed, it is
 * theirs.
 */
function draftedLine(c: ComposerDraw) {
  const W = THREAD_PANE_WORDS;
  if (!c.drafted || !c.text.trim() || c.text.trim() !== c.drafted.trim()) return null;
  const [open, setOpen] = c.why;
  return (
    <>
      <div className="ix-composer-drafted" data-testid="ix-composer-drafted">
        <span className="ix-composer-drafted-words">
          <Icon name="spark" size={12} className="ix-composer-drafted-spark" />
          {W.drafted}
        </span>
        <Button
          variant="quiet"
          size="text"
          className="ix-composer-why ix-press"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          data-testid="ix-composer-why"
        >
          {W.whyThis}
        </Button>
      </div>
      {open && (
        <div className="ix-composer-why-said" data-testid="ix-composer-why-said">
          <span className="ix-composer-why-lead">{W.draftWhy}</span>
          <span>{W.draftUsed(c.thread.primaryChannel === "email", !!c.signed)}</span>
        </div>
      )}
    </>
  );
}

/** The box's Send: its words for an email or a draft ("Send email"), a coral round with its arrow for a chat. */
function sendButton(c: ComposerDraw, boxed: boolean) {
  const { thread, text, sending, doSend, isApproveAndSend } = c;
  const W = THREAD_PANE_WORDS;
  const words = sending
    ? "Sending…"
    : isApproveAndSend
      ? "Approve & send"
      : thread.primaryChannel === "email"
        ? W.sendEmail
        : W.send;
  if (!boxed)
    return (
      <Button
        variant="primary"
        size="touch"
        iconOnly
        className="ix-composer-send"
        aria-label={words}
        disabled={!text.trim() || sending}
        onClick={doSend}
        {...gate("approve")}
      >
        <Icon name="arrow-up" size={18} />
      </Button>
    );
  return (
    <Button
      variant="primary"
      size="touch"
      className="ix-composer-send"
      disabled={!text.trim() || sending}
      onClick={doSend}
      {...gate("approve")}
    >
      {words}
      <Icon name="arrow-up" size={16} />
    </Button>
  );
}

function realComposer(c: ComposerDraw) {
  const { thread, text, write, taRef, onType, aside } = c;
  // An email, or a draft the receptionist wrote, is the box; a chat with nothing drafted is the one line.
  const boxed = thread.primaryChannel === "email" || !!c.drafted;
  const field = (
    <textarea
      ref={taRef}
      className="ix-composer-text"
      value={text}
      onChange={(e) => {
        write(e.target.value);
        if (onType) onType();
      }}
      // A teammate's thread: what a reply does is the one thing left to say, and the box says it (the dock says
      // nothing there).
      placeholder={
        thread.claimedByOther
          ? THREAD_PANE_WORDS.takeFrom(holderName(thread.assigneeUserId ?? null) ?? "a teammate")
          : `${thread.replyVia || "WhatsApp"} to ${shortName(thread.who)}…`
      }
      aria-label={`Reply to ${thread.who}`}
      rows={boxed ? 4 : 1}
    />
  );
  if (!boxed)
    return (
      <>
        <div className="ix-composer ix-composer-row" data-shape="slim">
          {field}
          {sendButton(c, false)}
        </div>
        {thread.veto ? (
          <p className="ix-composer-hint" data-testid="ix-composer-hint">
            {THREAD_PANE_WORDS.typingHolds}
          </p>
        ) : null}
      </>
    );
  return (
    <div className="ix-composer ix-composer-row" data-shape="box">
      <div className="ix-composer-draft">
        {draftedLine(c)}
        {field}
        {signedLine(c)}
        {c.rewrite[0] ? <RewriteLine c={c} /> : null}
      </div>
      <div className="ix-composer-acts">
        {aside}
        <span className="ix-composer-gap" />
        {sendButton(c, true)}
      </div>
    </div>
  );
}

/** The seeded thread's banner: the receptionist's suggestion, and a way to ask for another wording. */
function suggestedBanner(c: ComposerDraw) {
  const { thread, reply, hasApproval, alt, setAlt, setText } = c;
  return (
    hasApproval && (
      <div className="ix-composer-banner">
        <Icon name="sparkle" size={11} />
        <span>Suggested by {thread.agent.name}</span>
        <button
          className="ix-composer-regen"
          onClick={() => {
            const a = !alt;
            setAlt(a);
            setText(a ? reply.split(". ")[0] + ". Want me to set it up?" : reply);
          }}
        >
          <Icon name="refresh" size={11} /> {alt ? "Original" : "Regenerate"}
        </button>
      </div>
    )
  );
}

/** The seeded thread's foot: the wire it goes on, the mockup's Save draft, and Send. */
function seededFoot(c: ComposerDraw) {
  const { thread, text, sending, doSend, isApproveAndSend, saved, setSaved } = c;
  const wire = thread.real
    ? thread.primaryChannel === "sms"
      ? "Text"
      : "WhatsApp"
    : thread.primaryChannel?.toUpperCase() || "SMS";
  return (
    <div className="ix-composer-foot">
      <div className="ix-composer-channel">
        <Icon
          name={thread.primaryChannel === "phone" ? "phone" : thread.primaryChannel === "mail" ? "mail" : "chat"}
          size={12}
        />
        <span>
          {wire} · to {thread.who}
        </span>
      </div>
      <div className="ix-composer-actions">
        {/* The mockup's Save draft kept nothing: a real thread keeps no drafts, so it offers none. */}
        {!thread.real && (
          <Button
            variant="quiet"
            size="sm"
            onClick={() => {
              setSaved(true);
              setTimeout(() => setSaved(false), SAVED_NOTICE_MS);
            }}
            disabled={saved}
          >
            {saved ? "Draft saved ✓" : "Save draft"}
          </Button>
        )}
        <Button variant="primary" size="sm" disabled={!text.trim() || sending} onClick={doSend} {...gate("approve")}>
          {sending ? "Sending…" : isApproveAndSend ? "Approve & send" : "Send"}
        </Button>
      </div>
    </div>
  );
}

function seededComposer(c: ComposerDraw) {
  const { thread, text, write, taRef, onType } = c;
  return (
    <div className="ix-composer">
      {suggestedBanner(c)}
      <textarea
        ref={taRef}
        className="ix-composer-text"
        value={text}
        onChange={(e) => {
          write(e.target.value);
          if (onType) onType();
        }}
        placeholder={
          thread.real ? `Reply to ${thread.who}…` : `Reply via ${thread.primaryChannel?.toUpperCase() || "SMS"}…`
        }
        rows={3}
      />
      {seededFoot(c)}
    </div>
  );
}

export const Composer = ({
  thread,
  reply,
  hasApproval,
  onType = null,
  onSend = () => {},
  aside = null,
}: ComposerProps) => {
  // What the member wrote to this thread and has not sent, kept for the thread in this tab (tab-memory.ts): the pane is
  // keyed by thread, so opening another one, or a refresh, dropped a half-written reply for good. The receptionist's
  // draft (`reply`) is its own and never kept as theirs; a reply the server took, or a box emptied, lets it go.
  const draftOf = thread && thread.real && tabMemory() ? thread.id : null;
  const keepWords = (v: string) => {
    if (!draftOf) return;
    if (v && v.trim() && v !== reply) tabMemory()?.keepDraft("reply", v, draftOf);
    else tabMemory()?.dropDraft("reply", draftOf);
  };
  // Else the receptionist's, else the reply Ask kept for their newest message, where the newest kept drafts hold it (they
  // come with the Inbox's first reads): drawn with its words, never filled in a beat after the box (putKeptDraft).
  const [text, setText] = useState(
    () => (draftOf && tabMemory()?.draft<string>("reply", draftOf)) || reply || keptReplyNow(thread) || "",
  );
  const write = (v: string) => {
    setText(v);
    keepWords(v);
  };
  useReplyDraftDoor(draftOf, write); // "Use the draft" (reply-strip.tsx): always there, or never
  const [alt, setAlt] = useState(false);
  const [saved, setSaved] = useState(false);
  // The draft's Why this? and its Rewrite line, each open or not (draftedLine, signedLine).
  const why = useState(false);
  const rewrite = useState(false);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const isApproveAndSend = hasApproval && text === reply;

  // Seed the composer when a draft ARRIVES, not only when it mounts.
  //
  // useState(reply) reads its argument once. In the mockup that is enough —
  // the veto draft is in the seed data before the pane renders. On a real
  // thread the receptionist writes its reply while the operator is already
  // looking at the conversation, so the draft always arrives AFTER mount and
  // the composer stayed empty: "Edit" focused a blank box and the words the
  // operator was invited to change were nowhere to be found.
  //
  // Only fills an EMPTY composer. Someone half-way through their own reply
  // must never have it replaced by the bot's.
  useEffect(() => {
    if (!reply) return;
    setText((cur) => (cur && cur.trim() ? cur : reply));
  }, [reply]);

  useEffect(() => putCarriedReply(thread.id, setText, taRef), [thread.id]);
  // What an email from the box is signed with: drawn with the box where the newest kept drafts say it (undefined where they
  // cannot), else from the thread's own read, the kept draft's where the box asks that one, else once the box has words.
  const [signed, setSigned] = useState<string | null | undefined>(() => signedNow(thread));
  // The receptionist's draft the box was given, where it was (kept-draft.ts): the box says whose its words are.
  const [drafted, setDrafted] = useState<string | null>(() => (thread.real ? keptReplyNow(thread) || null : null));
  // eslint-disable-next-line react-hooks/exhaustive-deps -- once a thread: the box is filled as it opens, never again under the member
  useEffect(() => putKeptDraft(thread, setText, setSigned, setDrafted), [thread.id]);
  const signedWanted = signed === undefined && !!text.trim();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- once a thread, when the box first has words and nothing said it
  useEffect(() => putSigned(thread, signedWanted, setSigned), [thread.id, signedWanted]);

  const [sending, setSending] = useState(false);
  const doSend = () => {
    if (sending || !text.trim() || !canDo("approve")) return;
    const payload = text.trim();
    const r = onSend(thread.id, payload, isApproveAndSend);
    // Real threads answer with a promise: keep the words until the server
    // accepts them (a closed 24h window rejects, and retyping is unacceptable).
    if (isPromise(r)) {
      setSending(true);
      void r
        .then((ok) => {
          if (ok !== false) write("");
        })
        .finally(() => setSending(false));
    } else {
      write("");
    }
  };

  // ⌘↵ sends · E (from card shortcuts) focuses
  // eslint-disable-next-line react-hooks/exhaustive-deps -- kept as the JSX drew it: the listeners are bound again when the words or the thread change, and read doSend and write from that draw
  useEffect(() => listenToComposer({ text, threadId: thread.id, doSend, write, setText, taRef }), [text, thread.id]);

  useEffect(() => growWithWords(taRef, thread.real), [text, thread.real]);

  if (thread.real && thread.optedOut) return optedOutComposer(thread);
  if (thread.real && thread.emailStopped) return emailStoppedComposer(thread.emailStopped);
  if (thread.real && thread.hasChat === false) return noChatComposer(thread, onSend);
  if (thread.real && thread.windowOpen === false)
    return thread.primaryChannel === "instagram" ? dmClosedComposer() : closedComposer(thread, onSend);
  const c: ComposerDraw = {
    thread,
    reply,
    hasApproval,
    onType,
    onSend,
    text,
    setText,
    write,
    taRef,
    sending,
    doSend,
    isApproveAndSend,
    alt,
    setAlt,
    saved,
    setSaved,
    signed: signed ?? null,
    drafted,
    why,
    rewrite,
    setDrafted,
    aside,
  };
  if (thread.real) return realComposer(c);
  return seededComposer(c);
};
