/**
 * Chanlytics — Conversations (moved from pages/conversations.jsx, decision 0015, step 3).
 * The raw communication layer: every call, chat, and email, newest first. A row opens the one thread (thread-pane.tsx)
 * -- a call opens its thread at the call -- and a call no thread holds opens alone, in the thread's own frame.
 * The rules of which tab a row is in and of the address are cv-rules.ts.
 */
import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { EmptyState, FailedRead } from "../../kit/empty/empty";
import { Icon } from "../../kit/icon/icon";
import { MoreMenu } from "../../kit/more-menu/more-menu";
import { StatePill } from "../../kit/pill/state-pill";
import { useSurface } from "../../use-surface";
import { ROUTES, TICK_MS } from "../constants";
import { CV_ICON, cvAddress, inChannel } from "../cv-rules";
import { appNavigate, canNavigate, currentRoute, demoSession, liveCallEnded, navigate, tabMemory } from "../shell";
import { conversationsData, inboxData, IX_STORE } from "../store";
import { ThreadCall } from "../thread/call";
import { ixSwipeBack } from "../thread/thread";
import { IxWho } from "../thread/who";
import { ThreadPane } from "../thread/thread-pane";
import type { ConversationRow, ConversationsSurface } from "../types";

// The box's words, kept per tab in the tab's storage (the loading standard's F, legacy-bridge/tab-memory.ts): a
// search typed on Phone is there again after a trip to People or a refresh; none on the standalone harness.
const cvPlace = (channel: string): Record<string, unknown> => {
  const memory = tabMemory();
  return (memory && memory.place("conversations", channel || "all")) || {};
};
/** The words the tab kept for a tab of the list: none where it kept none. */
const cvKept = (channel: string): string => {
  const q = cvPlace(channel).q;
  return typeof q === "string" ? q : "";
};
const cvKeepPlace = (channel: string, patch: Record<string, unknown>): void => {
  const memory = tabMemory();
  if (memory) memory.keepPlace("conversations", channel || "all", { ...cvPlace(channel), ...patch });
};

// The row's outcome as the one pill draws it. The words a page knows better
// stay here (which channel answered, what you chose); the tones are the map's,
// so "Needs you" is amber here as it is in the Inbox and on a playbook.
// Who answered a handled chat, in the pill's words; a call keeps its own.
const CV_ANSWERED: Record<string, string> = {
  team: "Your team replied",
  broadcast: "Broadcast sent",
  playbook: "Playbook sent",
};

export const OutcomePill = ({
  outcome,
  decidedAction,
  channel,
  answeredBy = null,
}: {
  outcome: string;
  decidedAction?: string | null;
  channel: string;
  answeredBy?: string | null;
}) => {
  if (decidedAction)
    return (
      <StatePill
        kind="thread"
        value="decided"
        label={
          <>
            <Icon name="check" size={9} />
            Handled · you chose {decidedAction}
          </>
        }
      />
    );
  if (outcome === "live") return <StatePill kind="call" value="live" />;
  if (outcome === "missed") return <StatePill kind="call" value="missed" />;
  // A call's own story beats "handled": the caller who asked for a call back,
  // and the one who hung up in seconds (contracts toCallVM decides both).
  if (outcome === "callback" || outcome === "abandoned") return <StatePill kind="call" value={outcome} />;
  if (outcome === "booked") return <StatePill kind="thread" value="booked" />;
  if (outcome === "escalated") return <StatePill kind="thread" value="escalated" />;
  if (outcome === "handled")
    return (
      <StatePill
        kind="thread"
        value="handled"
        label={
          channel === "phone"
            ? "Receptionist handled it"
            : (answeredBy && CV_ANSWERED[answeredBy]) || "Receptionist replied"
        }
      />
    );
  // The customer had the last word — it is your turn, not theirs; this read "Customer's turn" for a year.
  return <StatePill kind="thread" value="open" />;
};

// Session-decision overlay — approval convos reflect IX_STORE state
const cvDecision = (c: ConversationRow | null | undefined) => {
  if (!c || !c.threadId) return null;
  const rec = IX_STORE.get(c.threadId);
  return rec && rec.kind === "decided" ? rec : null;
};

// Live-call overlay — calls ended in the Live Monitor flip here too
const cvEnded = (c: ConversationRow | null | undefined): boolean =>
  !!(c && c.outcome === "live" && liveCallEnded(c.id));

// ---------- List row ----------
const CvRow = ({ c, active, onSelect }: { c: ConversationRow; active: boolean; onSelect: (id: string) => void }) => {
  const dec = cvDecision(c);
  const endedLive = cvEnded(c);
  return (
    <button
      className={`cv-row ${active ? "active" : ""} ${c.live && !endedLive ? "is-live" : ""}`}
      onClick={() => onSelect(c.id)}
    >
      <span className="cv-row-avatar">{c.initials.slice(0, 2)}</span>
      <span className="cv-row-body">
        {/* People's row (tokens.css --row-*, conversations.css): who it is and how it stands on the first line, what
          was said on the second, and the facts under them -- the agent, how long it ran, and when. The outcome
          used to stand in the foot beside them, where its pill made the row a sixth taller than a person's. */}
        <span className="cv-row-line1">
          <Icon name={CV_ICON[c.channel]} size={11} />
          <span className="cv-row-who">{c.who}</span>
          <OutcomePill
            outcome={endedLive ? "handled" : c.outcome}
            decidedAction={dec ? dec.action : null}
            channel={c.channel}
            answeredBy={c.answeredBy}
          />
        </span>
        <span className="cv-row-snippet">{c.snippet}</span>
        <span className="cv-row-foot">
          <span className="cv-row-agent">{c.agent.name}</span>
          {c.duration && <span className="cv-row-dur mono tabular">{c.duration}</span>}
          <span className="cv-row-at tabular">{c.at}</span>
        </span>
      </span>
    </button>
  );
};

// ---------- A call no thread holds ----------
// In the thread's own frame: its header, and the call as a thread draws it (ThreadCall). A caller who withheld their
// number, a call older than the threads the Inbox shows, a call still going. One still going is a line that says so and
// opens Live, where it can be heard and steered; its clock is the wall clock since it started, never a seed's.
const cvClock = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;

/** The call's header: back, who it was with (a door to their page), and the one act. */
function callHead(c: ConversationRow, onBack: (() => void) | null) {
  const clientId = c.clientId;
  return (
    <header className="ix-th-head">
      <div className="ix-th-head-main">
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
        {/* Who the call was with opens their page, as the thread's header does (inbox-thread.jsx IxWho). */}
        <IxWho to={clientId ? `clients/${clientId}` : null} who={c.who} avatar={c.initials.slice(0, 2)}>
          <div className="ix-th-name">
            <span className="ix-th-name-words">{c.who}</span>
            {clientId && (
              <span className="ix-th-go" aria-hidden="true">
                <Icon name="chevron" size={10} />
              </span>
            )}
          </div>
          <div className="ix-th-meta">Phone</div>
        </IxWho>
      </div>
      {clientId && (
        <div className="ix-th-actions">
          <MoreMenu
            btnClass="btn btn-ghost btn-sm ix-th-more"
            label="Actions"
            title="Actions"
            items={[{ label: "Open profile", icon: "users", onClick: () => navigate(ROUTES.client(clientId)) }]}
          />
        </div>
      )}
    </header>
  );
}

/** A call still going: a line that says so, and the door to Live. */
function callLive(secs: number | null) {
  return (
    <div className="tl-call inbound live" data-testid="cv-call-live">
      <div className="tl-call-mark">
        <span className="live-dot" aria-hidden="true" />
        <span className="tl-call-words">
          <span className="tl-call-what">
            <span className="tl-call-kind">On the phone now</span>
            {secs != null && <span className="tl-call-length tabular">{cvClock(secs)}</span>}
          </span>
        </span>
      </div>
      <div className="tl-call-live-acts">
        <button type="button" className="btn btn-sm ix-state-go" onClick={() => navigate("live")}>
          <Icon name="phone" size={12} /> Open Live
        </button>
      </div>
    </div>
  );
}

const CallPane = ({ c, onBack = null }: { c: ConversationRow; onBack?: (() => void) | null }) => {
  const live = !!c.live && !cvEnded(c);
  const [, tick] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    if (!live) return undefined;
    const iv = window.setInterval(tick, TICK_MS);
    return () => window.clearInterval(iv);
  }, [live, c.id]);
  const started = c.ts ?? 0;
  const secs = live && started > 0 ? Math.max(0, Math.floor((Date.now() - started) / 1000)) : null;
  return (
    <div className="ix-thread-pane cv-call-pane" data-testid="cv-call-pane" {...ixSwipeBack(onBack)}>
      {callHead(c, onBack)}
      <div className="ix-th-scroll">
        <div className="ix-timeline">{live ? callLive(secs) : <ThreadCall call={c} at={c.at} open />}</div>
      </div>
    </div>
  );
};

// Where a row opens. A conversation is the one thread. A call is its thread too, opened at the call, when the thread
// the Inbox read holds the call's note; else the call alone (CallPane). The mockup's seeded threads act only inside
// the Inbox page's demo state, so a seeded chat says where it acts, and a seeded call is drawn alone.
const cvThreadHolds = (c: ConversationRow): boolean => {
  const t = (inboxData().THREADS || []).find((x) => x.id === c.threadId);
  return !!t && (t.timeline || []).some((e) => ("messageId" in e ? e.messageId : undefined) === c.messageId);
};
const cvOpens = (c: ConversationRow): "thread" | "call" | "inbox" => {
  if (c.callId || c.channel === "phone") {
    return !demoSession() && !(c.live && !cvEnded(c)) && c.threadId && c.messageId && cvThreadHolds(c)
      ? "thread"
      : "call";
  }
  return demoSession() || !c.threadId ? "inbox" : "thread";
};

// ---------- Page ----------
// The phone's layout, where the list and the viewer take turns: mobile.css's breakpoint, the Inbox's (inbox-state.tsx ixOnPhone).
const cvOnPhone = () => !!(window.matchMedia && window.matchMedia("(max-width: 720px)").matches);

/**
 * The page's door to the address (inbox-state.tsx useInboxAddress's twin). A row opened is the address's: a refresh opens it
 * again. On a desktop it is said more exactly (replaced), and Back leaves the page. On a phone it is the screen, an
 * entry of its own: Back -- the browser's, Android's, the viewer's own -- closes it to its list, where it used to leave
 * Conversations with the row still open. One the address brought (a link, a cold boot) closes to its list in place.
 */
const useCvAddress = (
  channel: string,
  setSelectedId: (id: string | null) => void,
  setPhoneOpen: (v: boolean) => void,
) => {
  // The entry a tap pushed on a phone, while it is the address: the viewer's own Back steps back through it.
  const phoneEntryRef = useRef<string | null>(null);
  const openRow = (id: string) => {
    setSelectedId(id);
    setPhoneOpen(true);
    if (!canNavigate()) return;
    if (!cvOnPhone()) return appNavigate(cvAddress(channel, id), { replace: true });
    phoneEntryRef.current = cvAddress(channel, id);
    appNavigate(cvAddress(channel, id));
  };
  const closeRow = () => {
    if (phoneEntryRef.current && phoneEntryRef.current === currentRoute()) return window.history.back();
    setPhoneOpen(false);
  };
  return { openRow, closeRow };
};

/** The list: the search, the tabs with their counts, and the rows (or what there is instead). */
function listPane(p: {
  data: ConversationsSurface;
  rows: ConversationRow[];
  query: string;
  setQuery: (v: string) => void;
  channel: string;
  counts: Record<string, number>;
  selected: ConversationRow | undefined;
  openRow: (id: string) => void;
}) {
  const { data, rows, query, setQuery, channel, counts, selected, openRow } = p;
  const { CONVERSATIONS, CV_CHANNELS, CALLS_READ } = data;
  return (
    <aside className="cv-list">
      <div className="cv-list-head">
        <div className="cl-search-wrap">
          <Icon name="search" size={13} />
          <input
            placeholder="Search names, transcripts, messages…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>
      {CALLS_READ === false && (
        <FailedRead
          kind="line"
          what="the calls"
          body="The chats below are current; the phone's rows are missing until it reads."
          surface="conversations"
          testid="cv-calls-failed"
        />
      )}
      <div className="cv-filters">
        <div className="fleet-filter">
          {CV_CHANNELS.map((ch) => (
            <button
              key={ch.id}
              type="button"
              className={`fleet-filter-chip ${channel === ch.id ? "active" : ""}`}
              aria-pressed={channel === ch.id}
              data-testid={`cv-tab-${ch.id}`}
              onClick={() => navigate(cvAddress(ch.id, null))}
            >
              {ch.label}
              <span className="fleet-filter-count tally">{counts[ch.id]}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="cv-rows">
        {rows.map((c) => (
          <CvRow key={c.id} c={c} active={selected?.id === c.id} onSelect={openRow} />
        ))}
        {rows.length === 0 &&
          (CONVERSATIONS.length === 0 ? (
            // A workspace with none yet is not a filter with no match.
            <EmptyState
              kind="line"
              className="empty-center"
              title="No conversations yet."
              body="They show up here as customers write and call."
              testid="cv-none"
            />
          ) : (
            <EmptyState
              kind="line"
              className="empty-center"
              title={`No conversations match${query.trim() ? ` “${query.trim()}”` : " this channel"}.`}
              body="Search spans names, transcripts and messages."
              action={query.trim() ? { label: "Clear search", onClick: () => setQuery("") } : null}
            />
          ))}
      </div>
    </aside>
  );
}

/** The row open: its thread, the call alone, or where it is answered. */
function openedRow(p: { selected: ConversationRow; closeRow: () => void }) {
  const { selected, closeRow } = p;
  const opens = cvOpens(selected);
  if (opens === "thread") {
    return (
      <ThreadPane
        key={selected.id}
        threadId={selected.threadId}
        focusMessageId={selected.callId ? selected.messageId : null}
        onBack={closeRow}
        onOpenClient={(id) => navigate(ROUTES.client(String(id)))}
      />
    );
  }
  if (opens === "call") return <CallPane key={selected.id} c={selected} onBack={closeRow} />;
  return (
    <EmptyState
      kind="page"
      glyph="inbox"
      title="This conversation is answered in the Inbox"
      body="Its thread is there, with the reply box and everything it needs from you."
      action={{
        label: "Open it in the Inbox",
        to: selected.threadId ? ROUTES.thread(selected.threadId) : "inbox",
      }}
      testid="cv-in-inbox"
    />
  );
}

/** The reading pane: a link's notice, the row open, or what there is when nothing is. */
function readingPane(p: {
  data: ConversationsSurface;
  requestedMissing: boolean;
  selected: ConversationRow | undefined;
  closeRow: () => void;
  query: string;
}) {
  const { data, requestedMissing, selected, closeRow, query } = p;
  const { CONVERSATIONS } = data;
  // A link's notice sits in the reading pane: as a child of this
  // two-column grid it took the second cell and pushed the pane under
  // the list.
  if (requestedMissing) {
    // A link to a conversation not in view: said where it would have opened, and nobody else's opened in its
    // place. The first row used to open beside the notice -- read-only then; with the one thread it would be
    // another customer's reply box. The Inbox already says it this way.
    return (
      <EmptyState
        kind="page"
        glyph="chat"
        title="That conversation isn't among the newest shown here"
        body={`Conversations shows the newest ${CONVERSATIONS.length}. Open the person in People to find this one — no other conversation opens in its place.`}
        action={{ label: "Open People", to: "clients" }}
        testid="cv-missing-thread"
      />
    );
  }
  if (selected) return openedRow({ selected, closeRow });
  if (CONVERSATIONS.length === 0) {
    return (
      <EmptyState
        kind="page"
        glyph="chat"
        title="Nothing to read yet"
        body="Every WhatsApp chat and phone call with a customer lands here, with what was said."
        action={{ label: "Finish setting up", to: "start" }}
        testid="cv-none-pane"
      />
    );
  }
  return (
    <EmptyState
      kind="page"
      glyph="search"
      title={query.trim() ? "Nothing matches your search" : "Nothing on this channel yet"}
      body={query.trim() ? "Clear the search to see every conversation." : "Choose All to see every conversation."}
    />
  );
}

export const ConversationsPage = ({
  channel = "all",
  initialId = null,
}: {
  channel?: string;
  initialId?: string | null;
}) => {
  const data = conversationsData();
  const { CONVERSATIONS, CV_CHANNELS } = data;
  // The box's words, per tab: typed here this visit, else what the tab kept. The page is one mount across its tabs
  // (its route row's `mount`, app-routes.jsx), so a tab pressed reads its own words at once, with no draw in between.
  const [typed, setTyped] = useState<Record<string, string>>({});
  const query = typed[channel] !== undefined ? typed[channel] : cvKept(channel);
  const setQuery = (v: string) => {
    setTyped((t) => ({ ...t, [channel]: v }));
    cvKeepPlace(channel, { q: v });
  };
  const [selectedId, setSelectedId] = useState<string | null>(initialId);
  // Phone: the list and the viewer take turns (mobile.css owns the breakpoint).
  const [phoneOpen, setPhoneOpen] = useState(!!initialId);
  const [tick, setTick] = useState(0);
  // Its own rows, and where a call opens depends on the threads the Inbox read (cvOpens): drawn again when either lands.
  useSurface("conversations");
  useSurface("inbox");
  const { openRow, closeRow } = useCvAddress(channel, setSelectedId, setPhoneOpen);

  // Deep-link follows later navigations; decisions flip pills live. An address naming no row is the list: Back from a
  // row on a phone lands here, and the viewer closes.
  useEffect(() => {
    if (initialId) {
      setSelectedId(initialId);
      setPhoneOpen(true);
    } else setPhoneOpen(false);
  }, [initialId]);
  useEffect(() => {
    const bump = () => setTick((n) => n + 1);
    window.addEventListener("inbox:decisions", bump);
    window.addEventListener("live:ended", bump);
    return () => {
      window.removeEventListener("inbox:decisions", bump);
      window.removeEventListener("live:ended", bump);
    };
  }, []);

  const matchesChannel = (c: ConversationRow) => inChannel(c, channel);

  const visible = useMemo(
    () => {
      let list = CONVERSATIONS.filter(matchesChannel);
      if (query.trim()) {
        const q = query.toLowerCase();
        list = list.filter(
          (c) =>
            c.who.toLowerCase().includes(q) ||
            c.snippet.toLowerCase().includes(q) ||
            (c.summary && (c.summary.headline + " " + c.summary.bullets.join(" ")).toLowerCase().includes(q)) ||
            (c.transcript || []).some((l) => l.text.toLowerCase().includes(q)) ||
            (c.messages || []).some((m) => m.text.toLowerCase().includes(q)),
        );
      }
      return list;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- kept as the JSX drew it: tick, because the SurfaceData swap replaces the array identity
    [channel, query, tick],
  );

  // The conversation asked for stays open while the box's words hide its row (the Inbox keeps a moved thread the same
  // way): the pane fell to the first match, another customer's thread with its reply box, the moment a search stopped
  // matching the one open. Nothing asked for, or a tab's new list: its first row.
  const asked = selectedId ? CONVERSATIONS.find((c) => c.id === selectedId && matchesChannel(c)) || null : null;
  const selected = visible.find((c) => c.id === selectedId) || asked || visible[0];
  // A deep link to a conversation that is not here must not open someone
  // else's transcript in silence: the first row still shows, with a notice.
  const requestedMissing = !!initialId && selectedId === initialId && visible.length > 0 && !asked;
  // A tab pressed is a new list, opened on its first row.
  useEffect(
    () => {
      if (!initialId) setSelectedId(null);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- kept as the JSX drew it: keyed on the tab alone, so a new address does not clear the row
    [channel],
  );

  // Counted from the tabs THIS workspace has, by the same rule that filters
  // them: a tab that is drawn always carries the number of rows it will show.
  const counts = useMemo(
    () => Object.fromEntries(CV_CHANNELS.map((t) => [t.id, CONVERSATIONS.filter((c) => inChannel(c, t.id)).length])),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- kept as the JSX drew it: tick, because counts read the swapped global too
    [tick],
  );

  return (
    <div className={`conversations ${phoneOpen ? "phone-detail" : ""}`}>
      {listPane({ data, rows: visible, query, setQuery, channel, counts, selected, openRow })}
      {readingPane({ data, requestedMissing, selected, closeRow, query })}
    </div>
  );
};
