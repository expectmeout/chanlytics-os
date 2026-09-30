/**
 * What the conversation says, entry by entry (moved from pages/inbox-thread.jsx, decision 0015): a message as a bubble,
 * a thing that happened, a seeded agent's reasoning, and the disclosures a bubble carries (quoted text, why it was said).
 *
 * A bubble is a function per part, called by the entry and not drawn as a component of its own, so the tree is the tree
 * it was.
 */
import { useState, type ReactNode } from "react";
import { Icon } from "../../kit/icon/icon";
import { TlMedia } from "../../kit/media/tl-media";
import type { AgentEntry, MsgEntry, Thread, TimelineEntry as TlEntry } from "../types";
import type { ReplyWhyVM } from "@chanlytics/contracts";
import { ThreadCall, tlCallFor } from "./call";

// =============== TIMELINE ENTRY ===============
// A link in a message is a link. The body is plain text — the customer's words or the
// receptionist's — so it is split on the address and rendered as nodes, never as HTML. The
// address is clipped by CSS (.tl-msg-link), so the whole of it stays selectable and copyable:
// a booking URL took five lines of a bubble and could not be tapped.
const URL_IN_TEXT = /\bhttps?:\/\/[^\s<>()[\]{}"']+[^\s<>()[\]{}"'.,;:!?]/gi;
const Linked = ({ text }: { text?: string | null }) => {
  const s = text == null ? "" : String(text);
  if (!s) return null;
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of s.matchAll(URL_IN_TEXT)) {
    if (m.index > last) out.push(s.slice(last, m.index));
    out.push(
      <a
        key={m.index}
        className="tl-msg-link"
        href={m[0]}
        target="_blank"
        rel="noopener noreferrer nofollow"
        title={m[0]}
      >
        {m[0]}
      </a>,
    );
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push(s.slice(last));
  return <>{out}</>;
};

// What an email quoted back at us is kept, not shown: "Got it, thanks!" arrived as six lines of
// "On Thu, Sep 17, 2026 at 10:44 PM … wrote: >". The split is the viewmodel's (splitQuotedReply),
// so Conversations draws the same messages the same way.
const TlMsgBody = ({ text, quoted }: { text?: string | null; quoted?: string }) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Linked text={text} />
      {quoted && (
        <>
          <button
            type="button"
            className="tl-msg-quote-toggle"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            data-testid="tl-msg-quote-toggle"
          >
            {open ? "Hide quoted text" : "Show quoted text"}
          </button>
          {open && (
            <div className="tl-msg-quote" data-testid="tl-msg-quote">
              {quoted}
            </div>
          )}
        </>
      )}
    </>
  );
};

// Why it said that: the intent and how sure it was. It rode the meta line as two more spans,
// which is what wrapped that line into columns on a phone — and its reason sat in a title
// attribute no touch screen can open. A tap now, with the facts it used. The button belongs to
// the meta line; the panel is that line's sibling, because the line does not wrap.
const TlWhyButton = ({ why, open, onToggle }: { why: ReplyWhyVM; open: boolean; onToggle: () => void }) => (
  <button
    type="button"
    className="tl-msg-why"
    aria-expanded={open}
    aria-label={`Why the receptionist said this — ${why.summary}`}
    onClick={onToggle}
    data-testid="tl-msg-why"
  >
    <span className="tl-msg-why-full">· {why.summary}</span>
    <span className="tl-msg-why-short">Why</span>
  </button>
);

const TlWhyPanel = ({ why }: { why: ReplyWhyVM }) => {
  const facts = why.facts && why.facts.length ? why.facts : null;
  return (
    <div className="tl-msg-why-panel" data-testid="tl-msg-why-panel">
      <div className="tl-msg-why-sum">{why.summary}</div>
      {why.reason && <div className="tl-msg-why-reason">{why.reason}</div>}
      {facts && <div className="tl-msg-why-facts">Used: {facts.join(" · ")}</div>}
    </div>
  );
};

/** The glyph a wire is drawn with. */
export const channelIconOf = (c: string) =>
  c === "phone" ? "phone" : c === "instagram" ? "instagram" : c === "mail" || c === "email" ? "mail" : "chat";

/** How a run of bubbles draws itself: the time once at the run's head, and who sent it and what became of it at its foot. */
interface TlLines {
  meta: boolean;
  by: boolean;
}

interface TimelineEntryProps {
  entry: TlEntry;
  thread: Thread;
  channelLabels: Record<string, string>;
  lines?: TlLines | null;
  focus?: boolean;
  newest?: boolean;
  arrived?: boolean;
}

/** A seeded agent's reasoning, thinking or deciding. */
const isAgentEntry = (entry: TlEntry): entry is AgentEntry =>
  entry.type === "agent-thinking" || entry.type === "agent-decision";

export const TimelineEntry = ({
  entry,
  thread,
  channelLabels,
  lines = null,
  focus = false,
  newest = false,
  arrived = false,
}: TimelineEntryProps) => {
  const channelIcon = channelIconOf;

  if (isAgentEntry(entry)) {
    const isDecision = entry.type === "agent-decision";
    return (
      <div className={`tl-agent ${isDecision ? "decision" : "thinking"}`}>
        <span className="tl-agent-glyph">
          <span className="agent-avatar" style={{ width: 18, height: 18, fontSize: 9 }}>
            {thread.agent.glyph}
          </span>
        </span>
        <div className="tl-agent-body">
          <div className="tl-agent-head">
            <span className="tl-agent-name">{entry.agent}</span>
            <span className="tl-agent-verb">{isDecision ? "decided" : "thinking"}</span>
            <span className="tl-agent-time tabular">{entry.at}</span>
          </div>
          <div className="tl-agent-text">{entry.body}</div>
        </div>
      </div>
    );
  }

  if (entry.type === "event") {
    return (
      <div className="tl-event">
        <span className="tl-event-spine" />
        <span className="tl-event-text">{entry.body}</span>
        <span className="tl-event-time tabular">{entry.at}</span>
      </div>
    );
  }

  return (
    <TlMsgEntry
      entry={entry}
      thread={thread}
      channelLabels={channelLabels}
      lines={lines}
      channelIcon={channelIcon}
      focus={focus}
      newest={newest}
      arrived={arrived}
    />
  );
};

interface TlMsgEntryProps {
  entry: MsgEntry;
  thread: Thread;
  channelLabels: Record<string, string>;
  lines: TlLines | null;
  channelIcon: (c: string) => string;
  focus?: boolean;
  newest?: boolean;
  arrived?: boolean;
}

/** Who sent a message ours, in the words the thread says it: a person, a playbook, a broadcast, or you. */
function sentBy(entry: MsgEntry): string {
  return (
    entry.byWords ||
    (entry.via
      ? entry.via.kind === "playbook"
        ? `the ${entry.via.name} playbook`
        : `a broadcast (${entry.via.name})`
      : "you")
  );
}

/** What became of one of your team's words, and who sent them. */
function byYouLine(entry: MsgEntry) {
  return (
    <>
      {/* The time is over the bubble already (.tl-msg-meta); it was printed twice
                    within forty pixels. What gives way when the line is short is the author —
                    never what became of the message. */}
      <span className="tl-msg-author">by {sentBy(entry)}</span>
      {/* One vocabulary, computed in the viewmodel. This ternary was
                    the only place these words existed, so the Conversations
                    pane — which shows the same messages — said nothing at all
                    and rendered a canceled reply as a delivered one. */}
      {entry.statusLabel ? <span> · {entry.statusLabel}</span> : null}
    </>
  );
}

/** What became of the receptionist's words, and why it said them: its name, a tap for the reasoning, then the state. */
function byReceptionistLine(p: {
  entry: MsgEntry;
  thread: Thread;
  held: boolean;
  whyOpen: boolean;
  toggleWhy: () => void;
}) {
  const { entry, thread, held, whyOpen, toggleWhy } = p;
  return (
    <>
      {/* Per-bubble when the viewmodel supplies it: a phone call
                    summary is the Phone Receptionist's work, not the WhatsApp
                    one's. Seeded threads carry no per-entry agent and keep the
                    thread-level identity they have always used. */}
      <span className="tl-msg-author">by {entry.agentName || thread.agent.name}</span>
      {/* Why it said that, when the row remembers: a tap, not a hover. */}
      {entry.why && <TlWhyButton why={entry.why} open={whyOpen} onToggle={toggleWhy} />}
      {/* What became of it, as the team's bubbles say: "Didn't send", "Canceled before sending", "Read". */}
      {!held && entry.statusLabel ? <span> · {entry.statusLabel}</span> : null}
      {held && <span className="tl-held-tag">Not sent yet</span>}
    </>
  );
}

/** The bubble's meta line: the wire's icon and name where it is said, and the time. */
function metaLine(p: TlMsgEntryProps, named: boolean) {
  const { entry, lines, channelLabels, channelIcon } = p;
  if (lines && !lines.meta) return false;
  return (
    <div className="tl-msg-meta">
      {named && <Icon name={channelIcon(entry.channel)} size={10} />}
      {named && <span>{channelLabels[entry.channel]}</span>}
      <span className="tl-msg-time tabular">{entry.at}</span>
    </div>
  );
}

// The message branch, with the hooks its two disclosures need. It is its own component so those
// hooks are not behind the event and agent-thinking returns above.
const TlMsgEntry = (props: TlMsgEntryProps) => {
  const { entry, thread, lines, focus = false, newest = false, arrived = false } = props;
  const [whyOpen, setWhyOpen] = useState(false);
  // A call is part of the conversation, where it happened: its note was a dashed bubble of words nobody said. Its lines
  // are shown when it is the newest thing said, or the call Conversations opened the thread at.
  if (thread.real && entry.channel === "phone")
    return (
      <ThreadCall
        call={tlCallFor(entry.messageId)}
        note={entry.body}
        at={entry.at}
        mid={entry.messageId}
        focus={focus}
        open={focus || newest}
      />
    );
  const isClient = entry.from === "client";
  // A held draft is a message the customer has NOT seen. Rendered as an
  // ordinary agent bubble it reads as already-sent, and an operator would
  // either ignore it or apologise for something that never went out.
  const held = !!entry.pending;
  // Words that never left are dashed: the receptionist's failed reply was drawn as a sent bubble (I1).
  const undelivered = !isClient && !held && entry.reachedCustomer === false;
  // A real thread whose words travelled one wire says the time alone: the wire is in the header, and it was over every
  // bubble. A call is drawn as a call, so it is not a second wire for the words.
  const named = !thread.real || (thread.channels || []).filter((c) => c !== "phone").length > 1;
  return (
    <div
      className={`tl-msg ${isClient ? "client" : "agent"}${held ? " held" : ""}${undelivered ? " undelivered" : ""}${arrived ? " tl-arrived" : ""}`}
      data-mid={entry.messageId}
    >
      <div className="tl-msg-bubble">
        {metaLine(props, named)}
        {/* An email says what it is about before it says it. */}
        {entry.subject && (
          <div className="tl-msg-subject" data-testid="tl-msg-subject">
            {entry.subject}
          </div>
        )}
        <div className="tl-msg-body">
          <TlMsgBody text={entry.body} quoted={entry.quoted} />
        </div>
        {entry.media && <TlMedia media={entry.media} />}
        {/* An email's files are not kept, and its words only up to a bound: the bubble says so, or "see attached" reads as the whole of it. */}
        {entry.leftOut && (
          <div className="tl-msg-note" data-testid="tl-msg-left-out">
            <Icon name="info" size={11} /> {entry.leftOut}
          </div>
        )}
        {/* What became of words that did not reach them is said on their own bubble, whatever follows. */}
        {!isClient && (!lines || lines.by || held || entry.reachedCustomer === false) && (
          <div className="tl-msg-by">
            {entry.byYou
              ? byYouLine(entry)
              : byReceptionistLine({ entry, thread, held, whyOpen, toggleWhy: () => setWhyOpen((v) => !v) })}
          </div>
        )}
        {entry.why && whyOpen && <TlWhyPanel why={entry.why} />}
      </div>
    </div>
  );
};
