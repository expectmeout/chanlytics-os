/**
 * Who a conversation is with (moved from pages/inbox-thread.jsx, decision 0015): their face beside their name and the
 * line under it (`children`). Where they have a page (`to`), the three are one link to it, as a messaging app's header
 * opens the contact: the whole block is the press, a thumb tall on a phone, and the name underlines under a pointer. The
 * call's own header (conversations-page.tsx) and Live's name are the same door.
 *
 * The face is the kit's Face at its header size, the one avatar a person wears wherever a thread or a call names them
 * (the thread's header, the call's header, Live's panel), told who it is for (`person`: contracts decides a number's glyph
 * from an address's from a name's initials). Its picture slot (`photo`) is where an uploaded photo of a
 * customer, or a company's logo, goes once members can add one: it covers the initials, which show again if the picture
 * does not load. Nothing draws a picture yet; when something does, it passes `photo` here and every place that names a
 * person has it.
 *
 * What the thread's head draws in and on it is here too (the thread canvas, 1 Nov 2026): the wire's badge on the face's
 * edge, and the line under the name, where the conversation stands and the one fact People's row says of them.
 */
import type { ReactElement, ReactNode } from "react";
import { countdownClock, heldPill, stateOf, THREAD_PANE_WORDS, threadHeadFactOf } from "@chanlytics/contracts";
import type { PersonRowVM } from "@chanlytics/contracts";
import { Face, faceTileOf } from "../../kit/face/face";
import { Icon } from "../../kit/icon/icon";
import { StatePill } from "../../kit/pill/state-pill";
import { holderName } from "../../holder-names";
import { hasRouteDoor, routeDoor } from "../shell";
import type { Thread } from "../types";
import { channelIconOf } from "./timeline";
import { visitWordHere } from "../../workspace-word";

interface IxWhoProps {
  to?: string | null;
  go?: ((to: string) => void) | null;
  who: string;
  avatar: string;
  photo?: string | null;
  priority?: string | null;
  /** The face in their own hue (the thread's head; contracts' name picks it), where it is the house's grey. */
  hued?: boolean;
  /** What stands on the face's edge: the wire the conversation is on (header.tsx wireBadge). */
  badge?: ReactNode;
  children?: ReactNode;
}

export const IxWho = ({
  to = null,
  go = null,
  who,
  avatar,
  photo = null,
  priority = null,
  hued = false,
  badge = null,
  children,
}: IxWhoProps) => {
  const drawn = (
    <Face
      person={{ name: who, initials: avatar }}
      size="lg"
      photo={photo ?? undefined}
      priority={priority}
      {...(hued ? { hue: faceTileOf(who), className: "ix-th-who-round" } : {})}
    />
  );
  // A badge stands on the face's edge, outside the circle that clips its picture: the two in a box of their own.
  const face = badge ? (
    <span className="ix-th-pic">
      {drawn}
      {badge}
    </span>
  ) : (
    drawn
  );
  if (!to || !hasRouteDoor())
    return (
      <div className="ix-th-who">
        {face}
        <div className="ix-th-id">{children}</div>
      </div>
    );
  return (
    <a className="ix-th-who" {...routeDoor(to, go)} title={`Open ${who} in People`} data-testid="ix-th-person">
      {face}
      <div className="ix-th-id">{children}</div>
    </a>
  );
};

// =============== WHERE IT STANDS — the header's second line ===============
// What the thread's row in the list wears (StatePill -- one vocabulary for both) and how long they have waited, said
// under the name in the header (header.tsx), where the wires were (the thread canvas, 1 Nov 2026). It was a bar of its
// own under the header, a row of the phone's height for one pill, over the dock that said the reason again. WhatsApp's
// window, shut, is the template box's to say (ChatClosed, template-box.tsx): the line under the name is the person's
// link, and a press inside a link is not one. Nothing when there is nothing to say: the header says the wires instead.

/** Where a thread stands: the pill its row wears, lit on its tone, with how long they have waited in the mono face. */
interface Standing {
  pill: ReactElement;
  meta?: string | null;
  /** What the bare wait means, on a hover ("waiting 40m"). */
  title?: string;
}

/** A draft counting down to send, as the head's state says it: the seconds left (none once held) and whether you are away. */
export interface Countdown {
  remaining: number | null;
  paused: boolean;
}

/**
 * Where a thread stands, lit (the thread canvas, 1 Nov 2026): a hold is "Needs you" in the coral with the wait beside it
 * ("2h"); a draft counting down "Sends in 0:42" in the amber with its clock; a thread nothing waits on "Handled" in the
 * green with its tick; a snooze, a thread somebody has, and a reply that did not send, in their own tones.
 */
const ixStanding = (thread: Thread, countdown: Countdown): Standing | null => {
  const W = THREAD_PANE_WORDS;
  if (thread.state === "snoozed")
    return {
      pill: <StatePill kind="thread" value="snoozed" lit />,
      meta: `back ${thread.wake || "tomorrow 10:00"}`,
    };
  if (thread.takenOver) return { pill: <StatePill kind="thread" value="yours" lit /> };
  if (thread.claimedByOther)
    return {
      pill: (
        <StatePill kind="thread" value="theirs" lit label={heldPill("theirs", holderName(thread.assigneeUserId))} />
      ),
      meta: thread.waited || null,
      title: thread.waited ? `waiting ${thread.waited}` : undefined,
    };
  // Its wait beside it in the quiet mono ink (the canvas's "2h"): the coral pill is the one signal, and the number says
  // how long.
  if (thread.state === "escalated")
    return {
      pill: <StatePill kind="tone" value="accent" lit label={stateOf("thread", "escalated").label} />,
      meta: thread.waited || null,
      title: thread.waited ? `waiting ${thread.waited}` : undefined,
    };
  // A draft counting down is where the thread stands: when it sends, as its own line under the bubble says it.
  if (thread.real && thread.veto && countdown.remaining != null && !thread.resolution)
    return {
      pill: (
        <StatePill
          kind="tone"
          value="warn"
          lit
          glyph={<Icon name="clock" size={11} />}
          label={
            <>
              {W.sendsIn} <span className="tabular">{countdownClock(countdown.remaining)}</span>
            </>
          }
        />
      ),
    };
  if (thread.state !== "done" || thread.resolution) return null;
  if (thread.archived) return { pill: <StatePill kind="thread" value="archived" label="Archived" lit /> };
  if (thread.veto) return null;
  // A reply that didn't send, or what they wrote held and closed with nothing sent (contracts unansweredOf), wears the
  // row's own pill and, beside it, how long they have waited. Every other thread nothing waits on is handled.
  if (thread.lastWord && thread.lastWord.short)
    return {
      pill: <StatePill kind="tone" value={thread.lastWord.tone} lit label={thread.lastWord.short} />,
      meta: thread.unanswered ? thread.unanswered.waited : thread.lastWord.at || null,
    };
  return { pill: <StatePill kind="tone" value="ok" lit glyph={<Icon name="check" size={11} />} label={W.handled} /> };
};

/** Where a real thread stands, as the header's second line says it; null where it stands nowhere worth a word. */
function whereItStands(thread: Thread, countdown: Countdown = { remaining: null, paused: false }): ReactElement | null {
  const standing = ixStanding(thread, countdown);
  if (!standing) return null;
  return (
    <span className="ix-th-standing" data-testid="ix-th-standing">
      {standing.pill}
      {standing.meta && (
        <span className="ix-th-standing-meta tabular" title={standing.title}>
          {standing.meta}
        </span>
      )}
    </span>
  );
}

// The line under the name says the wires the conversation is on, once: "WhatsApp", "Phone · WhatsApp". It spent itself
// on "+1 (917) 555-0114" and "no name saved" -- the number is on their profile, one tap away in the menu.
const ixWires = (thread: Thread, labels: Record<string, string>) => {
  const ws = (thread.channels && thread.channels.length ? thread.channels : [thread.primaryChannel]).filter(Boolean);
  return [...new Set(ws.map((c) => labels[c] || c))].join(" · ");
};

/**
 * The wire the conversation is on, as a glyph on the face's edge (the thread canvas, 1 Nov 2026: a round of the raised
 * ground at its corner), its words for a pointer and a screen reader: every wire the thread has used ("Phone · WhatsApp"),
 * the newest one's glyph. It stood as glyphs after the name, and the line under the name says where the thread stands.
 */
export function wireBadge(thread: Thread, labels: Record<string, string>) {
  const ws = (thread.channels && thread.channels.length ? thread.channels : [thread.primaryChannel]).filter(Boolean);
  const glyph = thread.primaryChannel ? channelIconOf(thread.primaryChannel) : ws[0] ? channelIconOf(ws[0]) : null;
  if (!glyph) return null;
  const said = ixWires(thread, labels);
  return (
    <span className="ix-th-wire" role="img" aria-label={said} title={said} data-testid="ix-th-wire">
      <Icon name={glyph} size={11} />
    </span>
  );
}

/**
 * The line under the name (the thread canvas, 1 Nov 2026): where it stands, as the row's pill lit on its tone with the
 * wait beside it, then one fact about them (contracts threadHeadFactOf: their deal, a visit, where they work, where they
 * came from). A desk with the person's rail beside the thread says the wire there instead, in a glyph and its word: the
 * rail says who they are. A thread that stands nowhere says its wires.
 */
export function headerSub(
  thread: Thread,
  channelLabels: Record<string, string>,
  person: PersonRowVM | null | undefined,
  countdown: Countdown,
) {
  const standing = thread.real ? whereItStands(thread, countdown) : null;
  const fact = thread.real && person ? threadHeadFactOf(person, visitWordHere()) : null;
  const wires = thread.real ? ixWires(thread, channelLabels || {}) : thread.whoMeta;
  const wire = thread.real && thread.primaryChannel ? channelIconOf(thread.primaryChannel) : null;
  return (
    <div className="ix-th-sub" data-testid="ix-th-sub">
      {standing ?? <span className="ix-th-meta">{wires}</span>}
      {fact && (
        <span className="ix-th-fact" data-of={fact.of} data-testid="ix-th-fact">
          <span className="ix-th-sep" aria-hidden="true">
            ·
          </span>
          <span className="ix-th-fact-words">{fact.words}</span>
        </span>
      )}
      {standing && wire && (
        <span className="ix-th-on" data-testid="ix-th-on">
          <span className="ix-th-sep" aria-hidden="true">
            ·
          </span>
          <Icon name={wire} size={12} />
          {wires}
        </span>
      )}
    </div>
  );
}
