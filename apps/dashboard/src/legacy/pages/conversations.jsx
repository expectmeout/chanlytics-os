/* global React, Icon, MoreMenu, CONVERSATIONS_DATA, EmptyState, FailedRead, ThreadPane, ThreadCall */
// Chanlytics — Conversations
// The raw communication layer: every call, chat, and email, newest first. A row opens the one thread (thread-pane.jsx)
// -- a call opens its thread at the call -- and a call no thread holds opens alone, in the thread's own frame.

const { useState: useCvState, useMemo: useCvMemo, useEffect: useCvEffect } = React;

// Keyed on what the view model says (writtenChannelOf): "email", not "mail".
// The map carried "mail" while nothing ever sent it, so the day a real email
// conversation arrived it would have fallen through to the default glyph.
const CV_ICON = { phone: "phone", sms: "chat", whatsapp: "chat", instagram: "instagram", email: "mail" };

// ONE rule for "is this row in that tab", read by the filter AND the counts, so
// a tab can never show a number it does not then list. `chats` is the mockup's
// grouped tab; a real workspace gets one tab per wire (legacy-bridge
// surface-data.ts). "mail" is the seed's spelling of what the view model calls
// "email" — the filter carried only the seed's, so the Email tab was empty on
// the mockup and matched nothing at all on a real workspace.
const CV_TAB_KEYS = { chats: ["instagram", "sms", "whatsapp"], email: ["email", "mail"], mail: ["email", "mail"] };
const inChannel = (c, id) => id === "all" || (CV_TAB_KEYS[id] || [id]).includes(c.channel);
// Published so the rule can be driven on its own, the way the back office
// publishes its waiting row: a tab that lists the wrong rows is not something
// reading this file tells you.
window.CV_IN_CHANNEL = inChannel;

// ONE rule for the word after "conversations/", which the shell asks: a tab either kind of workspace draws -- a wire a
// row can be on, in the view model's words (CV_ICON's keys; a real workspace draws one tab per wire, surface-data.ts
// conversationTabs), or one of the mockup's grouped tabs -- or a row's id, a conversation's or a call's (cv-) -- or
// both, `<tab>:<id>`: the tab in view and the row open on it, which is what the page writes as a row opens (cvAddress,
// replaced, never pushed), so a refresh opens the same row on the same tab and Back leaves the page.
// The shell knew only the mockup's three tabs, so on a real workspace WhatsApp and Email were read as the ids of
// conversations nobody could find: the list stayed on All, and the pane said the conversation wasn't shown. And the
// address held a tab OR a row, so the row a person had open was nobody's after a refresh.
const cvOwn = (map, key) => Object.prototype.hasOwnProperty.call(map, key);
const cvIsTab = (word) => word === "all" || cvOwn(CV_ICON, word) || cvOwn(CV_TAB_KEYS, word);
const cvRoute = (word) => {
  if (!word || word === "all") return { channel: "all", id: null };
  const at = word.indexOf(":");
  if (at < 0) return cvIsTab(word) ? { channel: word, id: null } : { channel: "all", id: word };
  const tab = word.slice(0, at);
  const id = word.slice(at + 1) || null;
  return cvIsTab(tab) ? { channel: tab, id } : { channel: "all", id: word };
};
// The one spelling of the other direction: a tab alone, a row alone (on All), or a row on its tab.
const cvAddress = (channel, id) => {
  const tab = !channel || channel === "all" ? null : channel;
  if (!tab) return id ? `conversations/${id}` : "conversations";
  return id ? `conversations/${tab}:${id}` : `conversations/${tab}`;
};
window.CV_ROUTE = cvRoute;
window.CV_ADDRESS = cvAddress;
// The box's words, kept per tab in the tab's storage (the loading standard's F, legacy-bridge/tab-memory.ts): a
// search typed on Phone is there again after a trip to People or a refresh; none on the standalone harness.
const cvPlace = (channel) => (window.__tabMemory && window.__tabMemory.place("conversations", channel || "all")) || {};
const cvKeepPlace = (channel, patch) => { if (window.__tabMemory) window.__tabMemory.keepPlace("conversations", channel || "all", { ...cvPlace(channel), ...patch }); };

// The row's outcome as the one pill draws it. The words a page knows better
// stay here (which channel answered, what you chose); the tones are the map's,
// so "Needs you" is amber here as it is in the Inbox and on a playbook.
// Who answered a handled chat, in the pill's words; a call keeps its own.
const CV_ANSWERED = { team: "Your team replied", broadcast: "Broadcast sent", playbook: "Playbook sent" };
const OutcomePill = ({ outcome, decidedAction, channel, answeredBy = null }) => {
  if (decidedAction) return <StatePill kind="thread" value="decided" label={<><Icon name="check" size={9} />Handled · you chose {decidedAction}</>} />;
  if (outcome === "live") return <StatePill kind="call" value="live" />;
  if (outcome === "missed") return <StatePill kind="call" value="missed" />;
  // A call's own story beats "handled": the caller who asked for a call back,
  // and the one who hung up in seconds (contracts toCallVM decides both).
  if (outcome === "callback" || outcome === "abandoned") return <StatePill kind="call" value={outcome} />;
  if (outcome === "booked") return <StatePill kind="thread" value="booked" />;
  if (outcome === "escalated") return <StatePill kind="thread" value="escalated" />;
  if (outcome === "handled") return <StatePill kind="thread" value="handled" label={channel === "phone" ? "Receptionist handled it" : CV_ANSWERED[answeredBy] || "Receptionist replied"} />;
  // The customer had the last word — it is your turn, not theirs; this read "Customer's turn" for a year.
  return <StatePill kind="thread" value="open" />;
};

// Session-decision overlay — approval convos reflect IX_STORE state
const cvDecision = (c) => {
  if (!c || !c.threadId || !window.IX_STORE) return null;
  const rec = window.IX_STORE.get(c.threadId);
  return rec && rec.kind === "decided" ? rec : null;
};

// Live-call overlay — calls ended in the Live Monitor flip here too
const cvEnded = (c) => !!(c && c.outcome === "live" && window.LM_STORE && window.LM_STORE.isEnded(c.id));

// ---------- List row ----------
const CvRow = ({ c, active, onSelect }) => {
  const dec = cvDecision(c);
  const endedLive = cvEnded(c);
  return (
  <button className={`cv-row ${active ? "active" : ""} ${c.live && !endedLive ? "is-live" : ""}`} onClick={() => onSelect(c.id)}>
    <span className="cv-row-avatar">{c.initials.slice(0, 2)}</span>
    <span className="cv-row-body">
      {/* People's row (tokens.css --row-*, conversations.css): who it is and how it stands on the first line, what
          was said on the second, and the facts under them -- the agent, how long it ran, and when. The outcome
          used to stand in the foot beside them, where its pill made the row a sixth taller than a person's. */}
      <span className="cv-row-line1">
        <Icon name={CV_ICON[c.channel]} size={11} />
        <span className="cv-row-who">{c.who}</span>
        <OutcomePill outcome={endedLive ? "handled" : c.outcome} decidedAction={dec ? dec.action : null} channel={c.channel} answeredBy={c.answeredBy} />
      </span>
      <span className="cv-row-snippet">{c.snippet}</span>
      <span className="cv-row-foot">
        <span className="cv-row-agent">
          {c.agent.name}
        </span>
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
const cvClock = (sec) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
const CallPane = ({ c, onBack = null }) => {
  const live = !!c.live && !cvEnded(c);
  const [, tick] = React.useReducer((n) => n + 1, 0);
  useCvEffect(() => {
    if (!live) return undefined;
    const iv = window.setInterval(tick, 1000);
    return () => window.clearInterval(iv);
  }, [live, c.id]);
  const secs = live && c.ts > 0 ? Math.max(0, Math.floor((Date.now() - c.ts) / 1000)) : null;
  return (
    <div className="ix-thread-pane cv-call-pane" data-testid="cv-call-pane" {...(window.ixSwipeBack ? window.ixSwipeBack(onBack) : {})}>
      <header className="ix-th-head">
        <div className="ix-th-head-main">
          {onBack && (
            <button type="button" className="btn btn-ghost btn-sm ix-back" onClick={onBack} aria-label="Back to the list" data-testid="ix-back">
              <span aria-hidden="true">&larr;</span>
            </button>
          )}
          {/* Who the call was with opens their page, as the thread's header does (inbox-thread.jsx IxWho). */}
          {window.IxWho ? (
            <window.IxWho to={c.clientId ? `clients/${c.clientId}` : null} who={c.who} avatar={c.initials.slice(0, 2)}>
              <div className="ix-th-name">
                <span className="ix-th-name-words">{c.who}</span>
                {c.clientId && <span className="ix-th-go" aria-hidden="true"><Icon name="chevron" size={10} /></span>}
              </div>
              <div className="ix-th-meta">Phone</div>
            </window.IxWho>
          ) : (
            <>
              <div className="ix-th-avatar">{c.initials.slice(0, 2)}</div>
              <div className="ix-th-id">
                <div className="ix-th-name">{c.who}</div>
                <div className="ix-th-meta">Phone</div>
              </div>
            </>
          )}
        </div>
        {c.clientId && (
          <div className="ix-th-actions">
            <MoreMenu btnClass="btn btn-ghost btn-sm ix-th-more" label="Actions" title="Actions" items={[{ label: "Open profile", icon: "users", onClick: () => window.CHANLY.nav(window.CHANLY.R.client(c.clientId)) }]} />
          </div>
        )}
      </header>
      <div className="ix-th-scroll">
        <div className="ix-timeline">
          {live ? (
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
                <button type="button" className="btn btn-sm ix-state-go" onClick={() => window.CHANLY.nav("live")}>
                  <Icon name="phone" size={12} /> Open Live
                </button>
              </div>
            </div>
          ) : (
            <ThreadCall call={c} at={c.at} open />
          )}
        </div>
      </div>
    </div>
  );
};

// Where a row opens. A conversation is the one thread. A call is its thread too, opened at the call, when the thread
// the Inbox read holds the call's note; else the call alone (CallPane). The mockup's seeded threads act only inside
// the Inbox page's demo state, so a seeded chat says where it acts, and a seeded call is drawn alone.
const cvThreadHolds = (c) => {
  const t = (((window.INBOX_DATA || {}).THREADS) || []).find((x) => x.id === c.threadId);
  return !!t && (t.timeline || []).some((e) => e.messageId === c.messageId);
};
const cvOpens = (c) => {
  if (c.callId || c.channel === "phone") {
    return !window.__DEMO_MODE && !(c.live && !cvEnded(c)) && c.threadId && c.messageId && cvThreadHolds(c) ? "thread" : "call";
  }
  return window.__DEMO_MODE || !c.threadId ? "inbox" : "thread";
};

// ---------- Page ----------
const ConversationsPage = ({ channel = "all", initialId = null }) => {
  const { CONVERSATIONS, CV_CHANNELS, CALLS_READ } = window.CONVERSATIONS_DATA;
  // The box's words, per tab: typed here this visit, else what the tab kept. The page is one mount across its tabs
  // (app-shell.jsx PARAM_FOLLOWED_AS_PROP), so a tab pressed reads its own words at once, with no draw in between.
  const [typed, setTyped] = useCvState({});
  const query = typed[channel] !== undefined ? typed[channel] : cvPlace(channel).q || "";
  const setQuery = (v) => { setTyped((t) => ({ ...t, [channel]: v })); cvKeepPlace(channel, { q: v }); };
  const [selectedId, setSelectedId] = useCvState(initialId);
  // Phone: the list and the viewer take turns (mobile.css owns the breakpoint).
  const [phoneOpen, setPhoneOpen] = useCvState(!!initialId);
  const [tick, setTick] = useCvState(0);

  // Deep-link follows later navigations; decisions flip pills live
  useCvEffect(() => { if (initialId) { setSelectedId(initialId); setPhoneOpen(true); } }, [initialId]);
  useCvEffect(() => {
    const bump = () => setTick(n => n + 1);
    window.addEventListener("inbox:decisions", bump);
    window.addEventListener("live:ended", bump);
    window.addEventListener("surface:conversations", bump); // SurfaceData seam: real-data swap + realtime refresh
    // Where a call opens depends on the threads the Inbox read (cvOpens).
    window.addEventListener("surface:inbox", bump);
    return () => { window.removeEventListener("inbox:decisions", bump); window.removeEventListener("live:ended", bump); window.removeEventListener("surface:conversations", bump); window.removeEventListener("surface:inbox", bump); };
  }, []);

  const matchesChannel = (c) => inChannel(c, channel);

  const visible = useCvMemo(() => {
    let list = CONVERSATIONS.filter(matchesChannel);
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(c =>
        c.who.toLowerCase().includes(q) ||
        c.snippet.toLowerCase().includes(q) ||
        (c.summary && (c.summary.headline + " " + c.summary.bullets.join(" ")).toLowerCase().includes(q)) ||
        (c.transcript || []).some(l => l.text.toLowerCase().includes(q)) ||
        (c.messages || []).some(m => m.text.toLowerCase().includes(q))
      );
    }
    return list;
  }, [channel, query, tick]); // tick: the SurfaceData swap replaces the array identity

  // The conversation asked for stays open while the box's words hide its row (the Inbox keeps a moved thread the same
  // way): the pane fell to the first match, another customer's thread with its reply box, the moment a search stopped
  // matching the one open. Nothing asked for, or a tab's new list: its first row.
  const asked = selectedId ? CONVERSATIONS.find((c) => c.id === selectedId && matchesChannel(c)) || null : null;
  const selected = visible.find(c => c.id === selectedId) || asked || visible[0];
  // A deep link to a conversation that is not here must not open someone
  // else's transcript in silence: the first row still shows, with a notice.
  const requestedMissing = !!initialId && selectedId === initialId && visible.length > 0 && !asked;
  // A tab pressed is a new list, opened on its first row.
  useCvEffect(() => { if (!initialId) setSelectedId(null); }, [channel]);
  // A row opened is the address's, said more exactly (replaced): a refresh opens it again, and Back leaves the page.
  const openRow = (id) => {
    setSelectedId(id);
    setPhoneOpen(true);
    if (window.appNavigate) window.appNavigate(cvAddress(channel, id), { replace: true });
  };

  // Counted from the tabs THIS workspace has, by the same rule that filters
  // them: a tab that is drawn always carries the number of rows it will show.
  const counts = useCvMemo(
    () => Object.fromEntries(CV_CHANNELS.map((t) => [t.id, CONVERSATIONS.filter((c) => inChannel(c, t.id)).length])),
    [tick], // tick: counts read the swapped global too
  );

  return (
    <div className={`conversations ${phoneOpen ? "phone-detail" : ""}`}>
      <aside className="cv-list">
        <div className="cv-list-head">
          <div className="cl-search-wrap">
            <Icon name="search" size={13} />
            <input placeholder="Search names, transcripts, messages…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
        </div>
        {CALLS_READ === false && <FailedRead kind="line" what="the calls" body="The chats below are current; the phone's rows are missing until it reads." surface="conversations" testid="cv-calls-failed" />}
        <div className="cv-filters">
          <div className="fleet-filter">
            {CV_CHANNELS.map(ch => (
              <button
                key={ch.id}
                type="button"
                className={`fleet-filter-chip ${channel === ch.id ? "active" : ""}`}
                aria-pressed={channel === ch.id}
                data-testid={`cv-tab-${ch.id}`}
                onClick={() => window.CHANLY.nav(cvAddress(ch.id, null))}
              >
                {ch.label}
                <span className="fleet-filter-count tally">{counts[ch.id]}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="cv-rows">
          {visible.map(c => (
            <CvRow key={c.id} c={c} active={selected?.id === c.id} onSelect={openRow} />
          ))}
          {visible.length === 0 && (CONVERSATIONS.length === 0
            // A workspace with none yet is not a filter with no match.
            ? <EmptyState kind="line" className="empty-center" title="No conversations yet." body="They show up here as customers write and call." testid="cv-none" />
            : <EmptyState kind="line" className="empty-center" title={`No conversations match${query.trim() ? ` “${query.trim()}”` : " this channel"}.`} body="Search spans names, transcripts and messages." action={query.trim() ? { label: "Clear search", onClick: () => setQuery("") } : null} />
          )}
        </div>
      </aside>

      {/* A link's notice sits in the reading pane: as a child of this
          two-column grid it took the second cell and pushed the pane under
          the list. */}
      {requestedMissing ? (
        // A link to a conversation not in view: said where it would have opened, and nobody else's opened in its
        // place. The first row used to open beside the notice -- read-only then; with the one thread it would be
        // another customer's reply box. The Inbox already says it this way.
        <EmptyState
          kind="page"
          glyph="chat"
          title="That conversation isn't among the newest shown here"
          body={`Conversations shows the newest ${CONVERSATIONS.length}. Open the person in People to find this one — no other conversation opens in its place.`}
          action={{ label: "Open People", to: "clients" }}
          testid="cv-missing-thread"
        />
      ) : selected ? (
        cvOpens(selected) === "thread" ? (
          <ThreadPane
            key={selected.id}
            threadId={selected.threadId}
            focusMessageId={selected.callId ? selected.messageId : null}
            onBack={() => setPhoneOpen(false)}
            onOpenClient={(id) => window.CHANLY.nav(window.CHANLY.R.client(id))}
          />
        ) : cvOpens(selected) === "call" ? (
          <CallPane key={selected.id} c={selected} onBack={() => setPhoneOpen(false)} />
        ) : (
          <EmptyState
            kind="page"
            glyph="inbox"
            title="This conversation is answered in the Inbox"
            body="Its thread is there, with the reply box and everything it needs from you."
            action={{ label: "Open it in the Inbox", to: selected.threadId ? window.CHANLY.R.thread(selected.threadId) : "inbox" }}
            testid="cv-in-inbox"
          />
        )
      ) : CONVERSATIONS.length === 0 ? (
        <EmptyState kind="page" glyph="chat" title="Nothing to read yet" body="Every WhatsApp chat and phone call with a customer lands here, with what was said." action={{ label: "Open Setup", to: "admin/setup" }} testid="cv-none-pane" />
      ) : (
        <EmptyState kind="page" glyph="search" title={query.trim() ? "Nothing matches your search" : "Nothing on this channel yet"} body={query.trim() ? "Clear the search to see every conversation." : "Choose All to see every conversation."} />
      )}
    </div>
  );
};

window.ConversationsPage = ConversationsPage;
// Published for the-pages-say-only-what-is-true.test.mjs, which mounts the pill.
window.OutcomePill = OutcomePill;
