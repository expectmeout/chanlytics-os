/**
 * The reply box (moved from pages/inbox-thread.jsx, decision 0015): the composer, the one send that works outside the
 * 24-hour window, and the "Why?" that keeps an explanation one tap away.
 *
 * The composer is a function per box, called by `Composer` and not drawn as a component of its own, so the tree is the
 * tree it was; its hooks stay in `Composer`, in the order they were, and each effect's body is a function beside it.
 */
import { inboxTemplates } from "@chanlytics/contracts";
import { useEffect, useRef, useState, type Dispatch, type ReactNode, type RefObject, type SetStateAction } from "react";
import { FailedRead } from "../../kit/empty/empty";
import { Icon } from "../../kit/icon/icon";
import { FOCUS_COMPOSER_MS, SAVED_NOTICE_MS } from "../constants";
import { canDo, gate, tabMemory } from "../shell";
import { inboxData } from "../store";
import type { ApprovedTemplate, Thread } from "../types";
import { useReplyDraftDoor } from "./reply-strip";
import { detailField, fieldOf } from "./shell-thread";
import { ixBandCallBack } from "./band";
import { Button } from "../../kit/button/button";

/** What a send carries: the words typed, or the template chosen (`true` where none was named). */
export type SendWords = string | { template: ApprovedTemplate | true };

/** The page's send: it may answer with a promise (a real thread), which the box waits on before it lets go of its words. */
export type OnSend = (threadId: string, words: SendWords, approveAndSend?: boolean) => unknown;

/** Whether a send answered with a promise. */
const isPromise = (r: unknown): r is Promise<unknown> =>
  typeof r === "object" && r !== null && "then" in r && typeof r.then === "function";

// =============== COMPOSER ===============
// Outside the 24-hour window WhatsApp will deliver exactly one thing: a
// pre-approved template. This was referenced by the closed-window composer but
// never actually written — so any escalated thread older than 24h crashed the
// whole Inbox pane rather than offering the one send that would work.
// Named after what it SENDS, not after the mechanism: the operator should know
// what lands on their customer's phone before they click.
// An explanation one tap away, never in the way (the house rule): which templates cannot go to this person, and why,
// was a sentence of its own under the reply box -- thirty-one words to say that nothing could be sent.
export const IxWhy = ({ said, testid = null }: { said: ReactNode; testid?: string | null }) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      {" "}
      <button type="button" className="ix-why" aria-expanded={open} onClick={() => setOpen(!open)}>
        Why?
      </button>
      {open && (
        <span className="ix-why-said" data-testid={testid || undefined}>
          {said}
        </span>
      )}
    </>
  );
};

/** The templates this person can be sent: what the composer offers, which one is chosen, and its name. */
interface TemplateChoice {
  choice: ReturnType<typeof inboxTemplates<ApprovedTemplate>> | null;
  list: ApprovedTemplate[] | null;
  chosen: ApprovedTemplate | null;
  chosenTitle: string | null;
}

/**
 * The templates this person can be sent, in the owner's words, and why the rest are not offered: the composer offered
 * every approved one, and the reply route refuses a promotion to someone who has not said yes to offers and a template
 * with values the Inbox does not fill (I4).
 */
function templateChoice(
  real: boolean,
  templates: ApprovedTemplate[] | null,
  thread: Thread | null,
  picked: number,
): TemplateChoice {
  const choice =
    real && templates && thread ? inboxTemplates(templates, { who: thread.who, offersOk: !!thread.offersOk }) : null;
  const list = real ? (choice ? choice.sendable.map((s) => s.template) : templates) : null;
  const chosenAt = list && list.length ? Math.min(picked, list.length - 1) : -1;
  const chosen = list && chosenAt >= 0 ? list[chosenAt] : null;
  const chosenTitle = choice && chosenAt >= 0 ? choice.sendable[chosenAt].title : null;
  return { choice, list, chosen, chosenTitle };
}

/**
 * What the send says where there is nothing it can send: no template approved, the read failed, or none can go to this
 * person; `undefined` where there is something to send. A caller with no WhatsApp thread whose call back the band offers
 * says nothing of what cannot be sent beneath it -- "No approved message can go to Emily Chen yet" under Call back.
 */
function templateGap(p: {
  real: boolean;
  quiet: boolean;
  thread: Thread | null;
  readTemplates: ApprovedTemplate[] | null | undefined;
  templates: ApprovedTemplate[] | null;
  have: TemplateChoice;
}): ReactNode | undefined {
  const { real, quiet, thread, readTemplates, templates, have } = p;
  const { choice, list } = have;
  // Nothing approved yet. Say so, rather than offering a send that cannot
  // happen: outside the window this is the only thing WhatsApp will deliver,
  // so an operator needs to know the gap is at Meta and not on this screen.
  // The window itself is the bar's to say (ThreadBar): it was said here too.
  if (real && templates && templates.length === 0) {
    return quiet ? null : (
      <span className="ix-tpl-none">No approved template yet — nothing can be sent until one is.</span>
    );
  }
  if (real && readTemplates === null) {
    return quiet ? null : (
      <FailedRead
        kind="line"
        title="Couldn't read your approved templates"
        body="Outside the 24-hour window only an approved template sends, so none can be offered until they're read."
        surface="inbox"
        testid="ix-tpl-failed"
      />
    );
  }
  if (real && choice && choice.sendable.length === 0) {
    return quiet ? null : (
      <span className="ix-tpl-none">
        No approved message can go to {thread && thread.who} yet.
        {choice.hidden ? <IxWhy said={choice.hidden} testid="ix-tpl-hidden" /> : null}
      </span>
    );
  }
  // Still being read: nothing yet. "Checking which templates are approved…" was the machinery talking.
  if (real && !list) return null;
  return undefined;
}

/** The templates the picker lists: the ones this person can be sent, else every one approved. */
function templateOptions(have: TemplateChoice): Array<{ template: ApprovedTemplate; label: string }> {
  const { choice, list } = have;
  return choice ? choice.sendable : (list || []).map((t) => ({ template: t, label: `${t.name} · ${t.language}` }));
}

const TemplateSendButton = ({
  onSend = () => {},
  threadId,
  real = false,
  thread = null,
}: {
  onSend?: OnSend;
  threadId: string;
  real?: boolean;
  thread?: Thread | null;
}) => {
  const [sending, setSending] = useState(false);
  // The workspace's OWN approved templates, published by the seam. The button
  // used to name one by a hardcoded literal — booking_link_v1/en_US — which is
  // right for exactly one workspace and a guaranteed failure for every other,
  // including every newly created one, which has no template row at all.
  // undefined: still being read. null: the read failed (surface-data.ts), which is not "none approved".
  const readTemplates = inboxData().templates;
  const templates = Array.isArray(readTemplates) ? readTemplates : null;
  const [picked, setPicked] = useState(0);

  // On a seeded thread there is nothing to look up and nothing to send; keep
  // the mockup's own affordance.
  const have = templateChoice(real, templates, thread, picked);
  const { choice, list, chosen, chosenTitle } = have;

  const fire = () => {
    if (sending || !canDo("approve")) return;
    if (real && !chosen) return;
    const r = onSend(threadId, chosen ? { template: chosen } : { template: true });
    if (isPromise(r)) {
      setSending(true);
      void r.finally(() => setSending(false));
    }
  };

  // A caller with no WhatsApp thread whose call back the band offers: the call is what to do, so the reply box says
  // nothing of what cannot be sent beneath it -- "No approved message can go to Emily Chen yet" under Call back.
  const quiet = real && !!thread && thread.hasChat === false && ixBandCallBack(thread);
  const gap = templateGap({ real, quiet, thread, readTemplates, templates, have });
  if (gap !== undefined) return gap;

  return (
    <>
      {list && list.length > 1 && (
        <select
          className="sd-input ix-tpl-pick"
          value={picked}
          onChange={(e) => setPicked(Number(e.target.value))}
          aria-label="Which approved template to send"
        >
          {templateOptions(have).map((s, i) => (
            <option key={s.template.id} value={i}>
              {s.label}
            </option>
          ))}
        </select>
      )}
      <Button
        variant="primary"
        size="sm"
        onClick={fire}
        disabled={sending}
        title={
          chosen
            ? `Sends your approved template "${chosenTitle || chosen.name}" — the only message WhatsApp delivers outside the 24-hour window`
            : "Sends your approved booking-link template — the only message WhatsApp delivers outside the 24-hour window"
        }
        {...gate("approve")}
      >
        <Icon name="send" size={12} />{" "}
        {sending
          ? "Sending…"
          : chosen && list && list.length > 1
            ? "Send template"
            : chosenTitle
              ? `Send “${chosenTitle}”`
              : "Send booking link"}
      </Button>
      {choice && choice.hidden ? <IxWhy said={choice.hidden} testid="ix-tpl-hidden" /> : null}
    </>
  );
};

type SetText = Dispatch<SetStateAction<string>>;
type BoxRef = RefObject<HTMLTextAreaElement | null>;

/** Whether a key was pressed inside a dialog over the page (the deal sheet, any aria-modal). */
function insideDialog(target: EventTarget | null | undefined): boolean {
  const closest: unknown = target ? Reflect.get(target, "closest") : undefined;
  return typeof closest === "function" ? !!closest.call(target, '[aria-modal="true"]') : false;
}

/** A reply carried in from a profile ("Text the booking link"): only into an empty composer, only for this thread, and only once. */
function takeCarriedReply(threadId: string, setText: SetText, taRef: BoxRef) {
  try {
    const raw = sessionStorage.getItem("chanlytics-compose");
    if (!raw) return;
    const carried: unknown = JSON.parse(raw);
    const said = fieldOf(carried, "text");
    if (typeof said !== "string") return;
    const at = fieldOf(carried, "threadId");
    const mine = at === threadId || at === `th-${threadId}` || `th-${String(at)}` === threadId;
    if (!mine) return;
    sessionStorage.removeItem("chanlytics-compose");
    setText((cur) => (cur && cur.trim() ? cur : said));
    window.setTimeout(() => {
      if (taRef.current) taRef.current.focus();
    }, FOCUS_COMPOSER_MS);
  } catch {
    /* nothing carried */
  }
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
    // (the deal sheet, any aria-modal): a ⌘↵ there sent whatever was in this box, even while the sheet saved.
    if (e.defaultPrevented || insideDialog(e.target)) return;
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      doSend();
    }
  };
  // A card's "Edit in the composer" arrives with the words; a plain focus
  // request arrives with none and leaves what is typed alone.
  const onFocus = (e: Event) => {
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

/** The field grows with what is in it, up to its cap: typed, carried in from a profile, or a draft filled in. */
function growWithWords(taRef: BoxRef, real: boolean | undefined) {
  const el = taRef.current;
  if (!real || !el || !el.style) return;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
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
        <span>
          {thread.who} asked to stop receiving messages. Nothing can be sent — they can text START to opt back in.
        </span>
      </div>
    </div>
  );
}

// A caller with no WhatsApp thread: the window never opened, so the honest
// verbs are the phone and an approved message that starts a thread.
function noChatComposer(thread: Thread, onSend: OnSend) {
  return (
    <div className="ix-composer">
      {/* The header names the channel and the number, and the line above says they phoned: what is left is what can
            be sent. A caller with no WhatsApp thread has no free-form reply, so the verbs are the call -- where the
            line above does not already carry it -- and the approved message that starts a thread. */}
      <div className="ix-composer-foot">
        <div className="ix-composer-actions">
          {!ixBandCallBack(thread) && thread.phone && (
            <Button size="sm" href={`tel:${thread.phone}`} data-testid="ix-call-back">
              <Icon name="phone" size={12} /> Call back
            </Button>
          )}
          <TemplateSendButton onSend={onSend} threadId={thread.id} real={!!thread.real} thread={thread} />
        </div>
      </div>
    </div>
  );
}

// The window has closed: the bar under the header says so, and why (ThreadBar), and the header names the wire and
// the person. What is left is the one send that works. It was a red block saying the window had closed, over a
// line saying "WhatsApp · to Rosa Díaz" again, over the send: three rows at the foot of a phone.
function closedComposer(thread: Thread, onSend: OnSend) {
  return (
    <div className="ix-composer">
      <div className="ix-composer-foot">
        <div className="ix-composer-actions">
          <TemplateSendButton onSend={onSend} threadId={thread.id} real={!!thread.real} thread={thread} />
        </div>
      </div>
    </div>
  );
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
        placeholder={`${thread.replyVia || "WhatsApp"} to ${thread.who}…`}
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

  useEffect(() => takeCarriedReply(thread.id, setText, taRef), [thread.id]);

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
  if (thread.real && thread.hasChat === false) return noChatComposer(thread, onSend);
  if (thread.real && thread.windowOpen === false) return closedComposer(thread, onSend);
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
