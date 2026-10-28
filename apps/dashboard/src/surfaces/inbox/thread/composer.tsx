/**
 * The reply box (moved from pages/inbox-thread.jsx, decision 0015): the composer, the one send that works outside the
 * 24-hour window, and the "Why?" that keeps an explanation one tap away.
 *
 * The composer is a function per box, called by `Composer` and not drawn as a component of its own, so the tree is the
 * tree it was; its hooks stay in `Composer`, in the order they were, and each effect's body is a function beside it.
 */
import { optOutWords, THREAD_PANE_WORDS } from "@chanlytics/contracts";
import { useEffect, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from "react";
import { Icon } from "../../kit/icon/icon";
import { FOCUS_COMPOSER_MS, SAVED_NOTICE_MS } from "../constants";
import { ixInDialog } from "../keys";
import { canDo, gate, tabMemory } from "../shell";
import type { Thread } from "../types";
import { takeCarriedReply } from "../carried-reply";
import { keptReplyOf } from "./kept-draft";
import { useReplyDraftDoor } from "./reply-strip";
import { detailField } from "./shell-thread";
import { holderName } from "../../holder-names";
import { ixBandCallBack } from "./band";
import { growWithWords, isPromise, type OnSend } from "./send-words";
import { TemplateComposer } from "./template-box";
import { Button } from "../../kit/button/button";

type SetText = Dispatch<SetStateAction<string>>;
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
 * box, and only while this thread is the one open.
 */
function putKeptDraft(thread: Thread, setText: SetText) {
  if (!thread.real) return;
  let open = true;
  // A read that fails puts nothing: the box stays as the member left it.
  void keptReplyOf(thread)
    .then((words) => {
      if (open && words) setText((cur) => (cur && cur.trim() ? cur : words));
    })
    .catch(() => undefined);
  return () => {
    open = false;
  };
}

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

// The window has closed: the bar under the header says so, and why (ThreadBar), and the header names the wire and
// the person. What is left is the one send that works. It was a red block saying the window had closed, over a
// line saying "WhatsApp · to Rosa Díaz" again, over the send: three rows at the foot of a phone.
function closedComposer(thread: Thread, onSend: OnSend) {
  return <TemplateComposer key={thread.id} onSend={onSend} threadId={thread.id} real={!!thread.real} thread={thread} />;
}

// A real thread's reply box is one line that grows, with Send beside it: it was a three-line field over a line
// saying the channel and the name the header already shows, 185px of a phone. The field names the channel.
function realComposer(c: ComposerDraw) {
  const { thread, text, write, taRef, sending, doSend, isApproveAndSend, onType } = c;
  return (
    <div className="ix-composer ix-composer-row">
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
            : `${thread.replyVia || "WhatsApp"} to ${thread.who}…`
        }
        aria-label={`Reply to ${thread.who}`}
        rows={1}
      />
      <Button
        variant="primary"
        className="ix-composer-send"
        disabled={!text.trim() || sending}
        onClick={doSend}
        {...gate("approve")}
      >
        {sending ? "Sending…" : isApproveAndSend ? "Approve & send" : "Send"}
      </Button>
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

export const Composer = ({ thread, reply, hasApproval, onType = null, onSend = () => {} }: ComposerProps) => {
  // What the member wrote to this thread and has not sent, kept for the thread in this tab (tab-memory.ts): the pane is
  // keyed by thread, so opening another one, or a refresh, dropped a half-written reply for good. The receptionist's
  // draft (`reply`) is its own and never kept as theirs; a reply the server took, or a box emptied, lets it go.
  const draftOf = thread && thread.real && tabMemory() ? thread.id : null;
  const keepWords = (v: string) => {
    if (!draftOf) return;
    if (v && v.trim() && v !== reply) tabMemory()?.keepDraft("reply", v, draftOf);
    else tabMemory()?.dropDraft("reply", draftOf);
  };
  const [text, setText] = useState(() => (draftOf && tabMemory()?.draft<string>("reply", draftOf)) || reply);
  const write = (v: string) => {
    setText(v);
    keepWords(v);
  };
  useReplyDraftDoor(draftOf, write); // "Use the draft" (reply-strip.tsx): always there, or never
  const [alt, setAlt] = useState(false);
  const [saved, setSaved] = useState(false);
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
  // eslint-disable-next-line react-hooks/exhaustive-deps -- once a thread: the box is filled as it opens, never again under the member
  useEffect(() => putKeptDraft(thread, setText), [thread.id]);

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
  };
  if (thread.real) return realComposer(c);
  return seededComposer(c);
};
