/**
 * The thread's header (moved from pages/inbox-thread.jsx, decision 0015): who the conversation is with, the wires it is
 * on, their deal or their visit in one chip, the Actions menu, and the step due under the head.
 *
 * The header is a function per part, called by `ThreadHeader` and not drawn as a component of its own, so the tree is
 * the tree it was; its hooks stay in `ThreadHeader`, in the order they were.
 */
import { linkHost, proposalLinkOf, proposalMessage } from "@chanlytics/contracts";
import type { DealVM, PersonNextStepVM, PersonRowVM } from "@chanlytics/contracts";
import { useState, type ReactNode } from "react";
import { Icon } from "../../kit/icon/icon";
import { MoreMenu, type MoreMenuItem } from "../../kit/more-menu/more-menu";
import { askAbout } from "../../legacy-verbs";
import { ROUTES } from "../constants";
import {
  clockZone,
  demoSession,
  gate,
  hasDealSheet,
  hasStepSheet,
  navigate,
  openDealSheet,
  openStepSheet,
  seededLeads,
  useToast,
  type Flash,
} from "../shell";
import { dealKit, hasHref, hrefOf, peopleRead, personNotes, usePeopleMoved } from "./shell-thread";
import type { Thread } from "../types";
import { ixBandCallBack } from "./band";
import { channelIconOf } from "./timeline";
import { IxWho } from "./who";

// A step due under the head (0007, amended): their next step once its day has come, with Done, so whoever answers
// them ticks it where they are. People's row carries it, judged as every page judges a step: at the moment People's
// rows were published (contracts dueStepDay, through __personNotes). One ahead is not said -- the head says who they
// are, and a step waits for its day. Done is an owner's or an operator's (the door's rule; the gate says so to anyone
// else) and answers in the header's toast, with Set the next one, as the deal card's does: the line goes with the
// step once People is read again, and the toast must outlive it. A second press while the first is on its way waits.
const IX_STEP_PRESSED = new Set<string>();
const IxThreadStep = ({
  personId,
  step,
  flash,
}: {
  personId: string;
  step: PersonNextStepVM;
  flash: (flash: Flash) => void;
}) => {
  const [gone, setGone] = useState<string | null>(null);
  const N = personNotes();
  const tz = clockZone();
  const people = peopleRead();
  const at = people && people.fetchedAt ? people.fetchedAt : Date.now();
  const day = N ? N.dueDay(step, tz, at) : null;
  if (!N || !day || gone === step.id) return null;
  const done = async () => {
    if (IX_STEP_PRESSED.has(step.id)) return;
    IX_STEP_PRESSED.add(step.id);
    let r: Awaited<ReturnType<typeof N.done>> | undefined;
    try {
      r = await N.done(personId, step.id, true);
    } finally {
      IX_STEP_PRESSED.delete(step.id);
    }
    if (r && r.ok) {
      setGone(step.id);
      const next = hasStepSheet() ? () => openStepSheet({ personId, dealId: step.dealId || null }) : null;
      flash({
        msg: <>{N.words.stepDone}</>,
        ...(next ? { action: { label: N.words.setTheNext, onClick: next } } : {}),
      });
    } else if (r) {
      flash({ tone: "danger", msg: <>{r.message}</> });
    }
    window.dispatchEvent(new CustomEvent("note:saved", { detail: { personId } }));
  };
  return (
    <div className="ix-th-step" data-due={day.due} data-testid="ix-th-step">
      <span className="ix-th-step-label">{N.words.next}</span>
      <span className="ix-th-step-words" data-testid="ix-th-step-words">
        {step.words}
      </span>
      <span className="ix-th-step-when" data-testid="ix-th-step-when">
        {day.words}
      </span>
      {step.forWho ? (
        <span className="ix-th-step-for" data-testid="ix-th-step-for">
          {step.forWho}
        </span>
      ) : null}
      <button
        type="button"
        className="ix-th-step-done"
        onClick={done}
        aria-label={N.words.markDone(step.words)}
        data-testid="ix-th-step-done"
        {...gate("approve", "mark a step done")}
      >
        {N.words.done}
      </button>
    </div>
  );
};

// A file the server writes, fetched the way a link marked `download` fetches it: the menu's items are buttons.
const ixDownload = (href: string) => {
  const a = document.createElement("a");
  a.href = href;
  a.download = "";
  document.body.appendChild(a);
  a.click();
  a.remove();
};

// The line under the name says the wires the conversation is on, once: "WhatsApp", "Phone · WhatsApp". It spent itself
// on "+1 (917) 555-0114" and "no name saved" -- the number is on their profile, one tap away in the menu.
const ixWires = (thread: Thread, labels: Record<string, string>) => {
  const ws = (thread.channels && thread.channels.length ? thread.channels : [thread.primaryChannel]).filter(Boolean);
  return [...new Set(ws.map((c) => labels[c] || c))].join(" · ");
};

// A menu's groups, a divider between each two that have anything in them.
const ixMenu = (groups: MoreMenuItem[][]): MoreMenuItem[] =>
  groups.filter((g) => g.length).flatMap((g, i) => (i ? [{ divider: true }, ...g] : g));

/** Who this is, and what is known of them in People: their deal or a visit, and the deal's link. */
interface HeaderFacts {
  person: PersonRowVM | null | undefined;
  deal: DealVM | null;
  proposalUrl: string | null;
  visit: { ahead: boolean; day: string; time: string } | null;
}

/**
 * Who this is, in one chip beside the wires: their deal when it says more than a visit (0004) -- a client, a
 * proposal waiting -- else a visit ahead on the calendar (People's own day and time), else the last one behind
 * them; nothing when People has none of these, or is not read yet. One chip. Not the band's words: the band says
 * where the conversation stands, this says who they are, which was a page away.
 */
function headerFacts(thread: Thread): HeaderFacts {
  const people = peopleRead();
  const person = thread.clientId && people && people.rows ? people.rows.find((p) => p.id === thread.clientId) : null;
  const deal = person && person.deal && person.deal.brief ? person.deal : null;
  // Their proposal's link (0008): contracts' proposalLinkOf over People's row -- the deal's while it is a proposal out,
  // none for a client or someone who passed, the thread's own (the person's) only with no deal, or no row to read.
  // Nothing where deals are off, or before People says whether they are.
  const proposalUrl = people && people.dealsOn ? proposalLinkOf(person ? person.deal : null, thread.proposalUrl) : null;
  const visit =
    deal || !person
      ? null
      : person.nextVisitDay
        ? { ahead: true, day: person.nextVisitDay, time: (person.nextVisit || "").split(" · ")[1] || "" }
        : person.lastVisitDay
          ? { ahead: false, day: `Last · ${person.lastVisitDay}`, time: "" }
          : null;
  return { person, deal, proposalUrl, visit };
}

const DEAL_ICON: Record<string, string> = {
  propose: "deal",
  send: "send",
  won: "check",
  lost: "x",
  edit: "edit",
  ended: "stop",
  again: "repeat",
};

/**
 * The deal's group (0008): its proposal into the box, and the moves for the stage of the deal People's row carries,
 * each opening the one deal sheet (components/deal-sheet.jsx), which reads them in full. The words are contracts'
 * (deal-sheet.ts dealMenuActs, through window.__deal). The send needs the link above and a wire free text can go on;
 * the moves need a person People has read, on a real workspace.
 */
function dealGroup(thread: Thread, facts: HeaderFacts): MoreMenuItem[] {
  const { person, proposalUrl } = facts;
  const kit = dealKit();
  // The sheet gives focus back to whatever held it as it opened, and a menu's item is gone by then: the Actions button
  // holds it first, so closing the sheet lands there.
  const toActions = () => {
    const b =
      typeof document !== "undefined" && "querySelector" in document
        ? document.querySelector<HTMLElement>(".ix-th-head .ix-th-more")
        : null;
    if (b && b.focus) b.focus();
  };
  const sendItem: MoreMenuItem | null =
    kit && thread.real && proposalUrl && thread.windowOpen && !thread.optedOut
      ? {
          label: kit.actWords.send,
          hint: linkHost(proposalUrl),
          icon: DEAL_ICON.send,
          onClick: () =>
            window.dispatchEvent(
              new CustomEvent("inbox:compose", { detail: { text: proposalMessage(proposalUrl), link: proposalUrl } }),
            ),
          gate: gate("approve", "put the proposal link in the reply"),
        }
      : null;
  const clientId = thread.clientId;
  const people = peopleRead();
  const dealItems: MoreMenuItem[] =
    kit && !demoSession() && clientId && person && people && people.dealsOn && hasDealSheet()
      ? kit
          .menu(person.deal)
          .filter((a) => a.mode)
          .map((a) => ({
            label: a.label,
            icon: DEAL_ICON[a.id] || "deal",
            onClick: () => {
              toActions();
              openDealSheet({
                personId: clientId,
                mode: a.mode ?? "",
                dealId: a.mode === "propose" || !person.deal ? null : person.deal.id,
              });
            },
            gate: gate("approve", "record a deal"),
          }))
      : [];
  return [...(sendItem ? [sendItem] : []), ...dealItems];
}

/** The seeded "Also in Leads" chip, a button of its own, so it stands beside the link, never inside it. */
function alsoInLeads(thread: Thread) {
  if (!thread.leadId) return null;
  const ld = seededLeads().find((l) => l.id === thread.leadId);
  const words: Record<string, string> = {
    ready: "Ready",
    qualifying: "Qualifying",
    new: "New",
    nurture: "Nurturing",
    converted: "Converted",
    archived: "Archived",
  };
  const label = ld ? words[ld.stage] || ld.stage : null;
  return (
    <button
      className="ix-xlink"
      title="This decision also sits in your Leads queue"
      onClick={() => navigate(ROUTES.lead())}
    >
      <Icon name="bolt" size={9} /> Also in Leads{label ? ` · ${label}` : ""}
    </button>
  );
}

/** The Actions menu: what to do with the conversation, then with the person, the deal, the file. */
interface HeaderActs {
  onSnooze: (threadId: string) => void;
  onMarkUnread: (threadId: string) => void;
  onOpenClient: (clientId: string | null | undefined) => void;
  onArchive: (() => void) | null;
}

function actionsMenu(thread: Thread, dealActs: MoreMenuItem[], acts: HeaderActs) {
  const { onSnooze, onMarkUnread, onOpenClient, onArchive } = acts;
  const snoozed = thread.state === "snoozed";
  const conversation: MoreMenuItem[] = [
    // A snoozed thread wakes from its status line ("Wake now"); the header's Snooze button read "Wakes …", disabled.
    ...(snoozed
      ? []
      : [
          {
            label: "Snooze",
            hint: "until tomorrow 10:00",
            icon: "clock",
            onClick: () => onSnooze(thread.id),
            gate: gate("approve", "snooze a conversation"),
          },
        ]),
    // Archive, for the thread in front of you: it lived only in the bulk bar, behind a checkbox a phone never shows.
    ...(onArchive && !thread.archived
      ? [{ label: "Archive", icon: "check", onClick: onArchive, gate: gate("approve", "archive a conversation") }]
      : []),
    // On a real thread "Mark as unread" flipped a local flag the next
    // realtime reseed wiped, and "Block sender" opened the Ask overlay,
    // a no-op outside a demo: both promised something that did not
    // happen. The real way to stop the receptionist for one person is
    // the mode on their profile, so that is where a real session goes.
    ...(demoSession() ? [{ label: "Mark as unread", icon: "inbox", onClick: () => onMarkUnread(thread.id) }] : []),
  ];
  const person: MoreMenuItem[] = [
    // clientId is the contact behind the thread, so these only render
    // when there is actually somewhere to go (a phone-only caller has none).
    ...(thread.clientId
      ? [{ label: "Open profile", icon: "users", onClick: () => onOpenClient(thread.clientId) }]
      : []),
    ...(!demoSession() && thread.clientId
      ? [{ label: "Receptionist settings", icon: "shield", onClick: () => onOpenClient(thread.clientId) }]
      : []),
  ];
  const file: MoreMenuItem[] = [
    // The transcript as a file, from the route that writes it. It was a button in Conversations' header only, so the
    // thread had it in one tab and not the other.
    ...(thread.real && thread.conversationId && hasHref()
      ? [
          {
            label: "Export transcript",
            icon: "external",
            onClick: () => {
              const to = hrefOf("GET conversations/[id]/export", { id: thread.conversationId ?? "" });
              if (to) ixDownload(to);
            },
          },
        ]
      : []),
  ];
  return ixMenu([
    conversation,
    person,
    // The deal (0008): its proposal into the box -- the deal's link (above), only where deals are on and free text
    // can go, never to someone who said stop, only on a real thread; the hint says where the link lives
    // (contracts linkHost) -- and the moves for its stage, each opening the sheet. A salon sees none of it.
    dealActs,
    file,
    demoSession()
      ? [
          {
            label: "Block sender",
            icon: "x",
            danger: true,
            onClick: () => askAbout({ mode: "compose", prompt: "Block this sender because " }),
          },
        ]
      : [],
  ]);
}

/** The name, the pin, the human-contact mark and the door's chevron. */
function headerName(thread: Thread, personTo: string | null) {
  return (
    <div className="ix-th-name">
      <span className="ix-th-name-words">{thread.who}</span>
      {thread.pinned && <Icon name="pin" size={11} style={{ color: "var(--ink-faint)" }} />}
      {thread.hasHumanContact && (
        <span className="ix-th-relation" title="Has spoken with a human before">
          <Icon name="users" size={10} />
        </span>
      )}
      {personTo && (
        <span className="ix-th-go" aria-hidden="true">
          <Icon name="chevron" size={10} />
        </span>
      )}
    </div>
  );
}

/** The line under the name: the wires, and the deal or the visit. */
function headerSub(thread: Thread, channelLabels: Record<string, string>, facts: HeaderFacts) {
  const { deal, visit } = facts;
  return (
    <div className="ix-th-sub">
      <div className="ix-th-meta">{thread.real ? ixWires(thread, channelLabels || {}) : thread.whoMeta}</div>
      {deal && (
        <span className={`ix-th-visit${deal.stage === "won" ? " ahead" : ""}`} data-testid="ix-th-deal">
          <Icon name="deal" size={10} />
          <span className="ix-th-visit-words">{deal.brief}</span>
        </span>
      )}
      {visit && (
        <span className={`ix-th-visit${visit.ahead ? " ahead" : ""}`} data-testid="ix-th-visit">
          <Icon name="calendar" size={10} />
          <span className="ix-th-visit-words">
            {visit.day}
            {visit.time && <span className="ix-th-visit-time"> · {visit.time}</span>}
          </span>
        </span>
      )}
    </div>
  );
}

interface ThreadHeaderProps {
  thread: Thread;
  channelLabels: Record<string, string>;
  onOpenClient?: (clientId: string | null | undefined) => void;
  onSnooze?: (threadId: string) => void;
  onMarkUnread?: (threadId: string) => void;
  onBack?: (() => void) | null;
  onArchive?: (() => void) | null;
}

/** The face, the name and what is known of them, one link to their page, and the "Also in Leads" chip beside it. */
function headerMain(props: ThreadHeaderProps, facts: HeaderFacts, alsoLeads: ReactNode) {
  const { thread, channelLabels, onOpenClient = () => {}, onBack = null } = props;
  // Who this is opens their page: the face, the name and the line under it are one link (IxWho), as a messaging app's
  // header is. The page was a press away only through Actions › Open profile. A caller with no person has no page.
  const personTo = thread.clientId ? `clients/${thread.clientId}` : null;
  return (
    <div className="ix-th-head-main">
      {/* Phone only (mobile.css): the list and the thread take turns. The arrow alone: the top bar says Inbox over it,
            and "← Inbox" said it again. */}
      {onBack && (
        <button
          type="button"
          className="btn btn-ghost btn-sm ix-back"
          onClick={onBack}
          aria-label="Back to the list"
          data-testid="ix-back"
        >
          <span aria-hidden="true">&larr;</span>
        </button>
      )}
      <IxWho
        to={personTo}
        go={() => onOpenClient(thread.clientId)}
        who={thread.who}
        avatar={thread.avatar}
        priority={thread.priority}
      >
        {headerName(thread, personTo)}
        {headerSub(thread, channelLabels, facts)}
      </IxWho>
      {alsoLeads}
    </div>
  );
}

/** The seeded thread's wires, as chips: the primary one marked. */
function channelChips(thread: Thread, channelLabels: Record<string, string>) {
  return (
    <div className="ix-th-channels-meta">
      {thread.channels.map((c) => (
        <span key={c} className={`ix-channel-chip ${c === thread.primaryChannel ? "primary" : ""}`}>
          <Icon name={channelIconOf(c)} size={11} />
          {channelLabels[c]}
        </span>
      ))}
    </div>
  );
}

export const ThreadHeader = (props: ThreadHeaderProps) => {
  const {
    thread,
    channelLabels,
    onOpenClient = () => {},
    onSnooze = () => {},
    onMarkUnread = () => {},
    onArchive = null,
  } = props;
  // People lands last on a cold boot (its rows are the heaviest read): a thread opened before it draws the chip below
  // once it does, rather than at the next message.
  usePeopleMoved(); // drawn again when People's rows land (surface-status.ts)
  // The header's toast: what its step's Done says, which outlives the line as People is read again.
  const [toastNode, flash] = useToast();
  const facts = headerFacts(thread);
  const { person } = facts;
  // The deal's group and the seeded chip are made before the markup, as they were: a role gate is asked for each in that order.
  const dealActs = dealGroup(thread, facts);
  const alsoLeads = alsoInLeads(thread);

  return (
    <header className="ix-th-head">
      {headerMain(props, facts, alsoLeads)}
      <div className="ix-th-actions">
        {/* The header says each thing once. A real thread's line under the name names its channel ("WhatsApp · +1 …"),
            and a chip said it again; a seeded thread's line is about the client, so its chips stay. Snooze and the
            profile are in the menu, where they were already. A caller with no WhatsApp thread has Call back in the
            reply box, unless they opted out and the box offers nothing: then it is here. */}
        {!thread.real && channelChips(thread, channelLabels)}
        {thread.real &&
          thread.phone &&
          thread.primaryChannel === "phone" &&
          thread.optedOut &&
          !ixBandCallBack(thread) && (
            <a className="btn btn-ghost btn-sm" href={`tel:${thread.phone}`} data-testid="ix-call-back">
              <Icon name="phone" size={12} /> Call back
            </a>
          )}
        {/* A ghost button with a word, lit only while its menu is open: a ⋯ alone in the dim ink was too faint to
            find on a phone. The menu says what to do with the conversation, then with the person, then the file --
            no eyebrow: the menu is the thread's. "Conversation" headed a list of five in capitals, and
            "Receptionist for this person…" broke onto two lines. */}
        <MoreMenu
          btnClass="btn btn-ghost btn-sm ix-th-more"
          label="Actions"
          title="Actions"
          items={actionsMenu(thread, dealActs, { onSnooze, onMarkUnread, onOpenClient, onArchive })}
        />
      </div>
      {person && person.nextStep && !demoSession() ? (
        <IxThreadStep key={person.nextStep.id} personId={person.id} step={person.nextStep} flash={flash} />
      ) : null}
      {toastNode}
    </header>
  );
};
