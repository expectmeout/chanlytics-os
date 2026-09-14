/* global React, Icon, EmptyState, FailedRead, Confirm */
// Inbox List Rail — perfectionist refinement.
// Improvements:
//   - Search input at the top
//   - P1 threads sort to top within each bucket
//   - P1 gets a left edge stripe (bigger affordance than just the avatar ring)
//   - Drop "NEEDS YOU" pill in the needs bucket (it's redundant)
//   - Saved views are collapsed by default behind a single chip-row toggle
//   - Bulk actions stay; checkbox visible on hover only
//   - The rows are a listbox: Tab reaches the open one, arrows and J/K open the row on screen,
//     Enter opens, Space picks it for a bulk act

// Who has a thread a teammate is answering: named from the team the Settings
// surface reads (memberWords), or "A teammate" when the roster is unread or they
// are no longer on it -- a name is never invented.
const ixAnswerer = (t) => {
  const m = t && t.assigneeUserId && Array.isArray(window.__TEAM) ? window.__TEAM.find((x) => x.userId === t.assigneeUserId) : null;
  if (!m) return "A teammate";
  return window.__identity ? window.__identity.member({ email: m.email, display_name: m.displayName || null }).name : (m.displayName || m.email || "A teammate");
};

const InboxList = ({
  threads,
  allThreads = [],
  buckets,
  views,
  activeView = null,
  onViewChange = () => {},
  activeBucket,
  onBucketChange,
  activeThreadId,
  onSelectThread,
  selected,
  onToggleSelect,
  onClearSelection,
  onBulkApprove = () => {},
  onBulkSnooze = () => {},
  onBulkArchive = () => {},
  /** The bulk act running on real threads, "snooze" or "archive", for the bar to say so. */
  bulkBusy = null,
  stake = null,
  density = "medium",
}) => {
  const [query, setQuery] = React.useState("");
  const [showViews, setShowViews] = React.useState(false);
  // Archiving real threads cannot be undone, so the bar asks first; a cleared selection drops the question.
  const [askArchive, setAskArchive] = React.useState(false);
  React.useEffect(() => { if (!selected.length) setAskArchive(false); }, [selected.length]);

  const channelIcon = (c) => c === "phone" ? "phone" : c === "instagram" ? "instagram" : c === "mail" ? "mail" : c === "sms" ? "chat" : "chat";

  // Filter: a non-empty search spans ALL threads (so results surface across
  // buckets); otherwise the parent already scoped `threads` to bucket/view.
  let visible = query.trim() ? allThreads : threads;
  if (query.trim()) {
    const q = query.toLowerCase();
    visible = visible.filter((t) =>
      t.who.toLowerCase().includes(q) ||
      t.subject.toLowerCase().includes(q) ||
      t.preview.toLowerCase().includes(q) ||
      t.tags.some((tag) => tag.toLowerCase().includes(q))
    );
  }

  // Priority-sort: P1 → P2 → P3 within bucket
  const priorityRank = { P1: 0, P2: 1, P3: 2 };
  visible = [...visible].sort((a, b) => (priorityRank[a.priority] ?? 9) - (priorityRank[b.priority] ?? 9));

  const allSelected = visible.length > 0 && visible.every((t) => selected.includes(t.id));
  // The agent name is only worth a row if the threads differ on it. This was
  // computed INSIDE the row map — one Set built per rendered row, so 100
  // threads meant 100 allocations and ~10,000 steps on every keystroke of the
  // search box and every realtime reseed. It is constant for the whole list.
  const multipleAgents = new Set(threads.map((x) => x.agent && x.agent.name)).size > 1;
  const anySelected = selected.length > 0;
  const inNeedsBucket = activeBucket === "needs";
  // The server has no unarchive: a real pick asks first, where the demo's Undo is the mockup's.
  const pickedReal = allThreads.some((t) => t.real && selected.includes(t.id));
  const pickedOne = selected.length === 1 ? (allThreads.find((t) => t.id === selected[0]) || {}) : null;
  const archiveQuestion = pickedOne
    ? `Archive ${pickedOne.who ? `${pickedOne.who}'s` : "this"} conversation?`
    : `Archive ${selected.length} conversations?`;
  const pressArchive = () => (pickedReal ? setAskArchive(true) : onBulkArchive());

  // The rows are a listbox with one tab stop: the open thread's row, or the first when none of these is
  // open. Arrows, J/K, Home and End open and focus the row on screen -- the page's own J/K walks its
  // bucket, not the rows a search shows. Enter opens; Space picks the row for a bulk act.
  const tabStopId = visible.some((t) => t.id === activeThreadId) ? activeThreadId : (visible[0] || {}).id;
  const onRowKey = (e, i) => {
    if (e.metaKey || e.ctrlKey || e.altKey || (e.target && e.target.tagName === "INPUT")) return;
    const t = visible[i];
    if (e.key === "Enter") { e.preventDefault(); onSelectThread(t.id); return; }
    if (e.key === " ") { e.preventDefault(); onToggleSelect(t.id); return; }
    const to = e.key === "ArrowDown" || e.key === "j" ? i + 1
      : e.key === "ArrowUp" || e.key === "k" ? i - 1
        : e.key === "Home" ? 0
          : e.key === "End" ? visible.length - 1
            : null;
    if (to === null) return;
    e.preventDefault();
    e.stopPropagation();
    const next = visible[Math.max(0, Math.min(visible.length - 1, to))];
    if (!next || next.id === t.id) return;
    onSelectThread(next.id);
    const row = e.currentTarget.parentNode && e.currentTarget.parentNode.querySelector(`[data-thread-id="${next.id}"]`);
    if (row) row.focus();
  };

  return (
    <div className={`ix-list ${density}`}>
      {/* Buckets */}
      <div className="ix-buckets">
        {buckets.map((b) => (
          <button
            key={b.id}
            className={`ix-bucket ${activeBucket === b.id ? "active" : ""} ${b.accent ? "accent" : ""}`}
            onClick={() => onBucketChange(b.id)}
            title={b.hint}
          >
            <Icon name={b.icon} size={13} />
            <span className="ix-bucket-label">{b.label}</span>
            <span className="ix-bucket-count tabular">{b.count}</span>
          </button>
        ))}
      </div>

      {/* Search + saved-views toggle row */}
      <div className="ix-search-row">
        <div className="ix-search-wrap">
          <Icon name="search" size={12} />
          <input
            className="ix-search-input"
            placeholder="Search threads, clients, tags…"
            aria-label="Search conversations"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button type="button" className="ix-search-clear" onClick={() => setQuery("")} aria-label="Clear search">
              <Icon name="x" size={11} />
            </button>
          )}
        </div>
        {views.some((v) => v.count > 0) && (
        <button
          className={`ix-views-toggle ${showViews ? "open" : ""}`}
          onClick={() => setShowViews(!showViews)}
          title="Saved views"
        >
          <Icon name="filter" size={12} />
        </button>
        )}
      </div>

      {showViews && (
        <div className="ix-views">
          <div className="ix-views-row">
            {views.map((v) => (
              <button
                key={v.id}
                className={`ix-view-chip ${activeView === v.id ? "active" : ""}`}
                onClick={() => onViewChange(v.id)}
              >
                <Icon name={v.icon} size={11} />
                <span>{v.label}</span>
                <span className="tabular ix-view-count">{v.count}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Needs-bucket stake summary */}
      {inNeedsBucket && !query.trim() && !activeView && stake && stake.count > 0 && (
        <div className="ix-stake">
          <span className="ix-stake-main"><b>{stake.count}</b> decision{stake.count === 1 ? "" : "s"} · <b>${stake.dollars.toLocaleString()}</b> at stake</span>
          {stake.oldest > 0 && <span className={`ix-stake-oldest ${stake.oldest > 30 ? "warn" : ""}`}>oldest {stake.oldest}m</span>}
        </div>
      )}

      {/* List header */}
      <div className="ix-list-head">
        {anySelected ? (
          <div className="ix-bulk">
            <span className="ix-bulk-count tabular">{selected.length} selected</span>
            <div className="ix-bulk-actions">
              {threads.some((t) => t.approval) && (
                <button className="btn btn-sm btn-primary" onClick={onBulkApprove} title="Approves selected approvals with ≥80% confidence" {...window.gate("approve")}>Approve all safe</button>
              )}
              <button className="btn btn-sm btn-ghost" onClick={onBulkSnooze} aria-busy={bulkBusy === "snooze" || undefined} {...window.gate("approve")}>{bulkBusy === "snooze" ? "Snoozing…" : "Snooze"}</button>
              <button className="btn btn-sm btn-ghost" onClick={pressArchive} aria-busy={bulkBusy === "archive" || undefined} {...window.gate("approve")}>{bulkBusy === "archive" ? "Archiving…" : "Archive"}</button>
              <button className="btn btn-sm btn-ghost" onClick={onClearSelection}>Clear</button>
            </div>
          </div>
        ) : (
          <>
            <label className="ix-checkall">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={() => {
                  if (allSelected) onClearSelection();
                  else visible.forEach((t) => !selected.includes(t.id) && onToggleSelect(t.id));
                }}
              />
              <span className="ix-list-count tabular">
                {visible.length} {query.trim() ? (visible.length === 1 ? "match" : "matches") : activeView ? (visible.length === 1 ? "thread in view" : "threads in view") : inNeedsBucket ? "decisions" : "threads"}
              </span>
              {query && (
                <span className="ix-search-hint">in "{query}"</span>
              )}
            </label>

          </>
        )}
      </div>

      {anySelected && askArchive && (
        <Confirm
          block
          question={archiveQuestion}
          detail={pickedOne
            ? "It leaves the Inbox and their request is closed. If they write again, it comes back."
            : "They leave the Inbox and each request is closed. If they write again, they come back."}
          yes={pickedOne ? "Yes, archive" : `Yes, archive ${selected.length}`}
          no="Not now"
          busy={bulkBusy === "archive"}
          busyLabel="Archiving…"
          onYes={() => Promise.resolve(onBulkArchive()).finally(() => setAskArchive(false))}
          onNo={() => setAskArchive(false)}
          testid="ix-bulk-archive"
        />
      )}

      {/* Threads */}
      <div className="ix-threads">
        {(() => {
          // Escalated threads outside the newest page are fetched one by one;
          // one that failed is a waiting customer nobody can see, so the list
          // says so instead of listing fewer.
          const n = ((window.INBOX_DATA || {}).UNREAD_ESCALATED) || 0;
          return n > 0
            ? <FailedRead kind="line" title={`Couldn't read ${n} escalated conversation${n === 1 ? "" : "s"}`} body="Someone may be waiting in them." surface="inbox" testid="inbox-unread-escalated" />
            : null;
        })()}
        {visible.length === 0 && (() => {
          // "Is this a real workspace?" must come from the surface
          // classification, not from the array being inspected: an EMPTY
          // thread list made `threads.some(t => t.real)` false, so precisely
          // when the empty state showed, it showed the mockup's copy — an
          // empty Snoozed bucket reading "7 snoozed… Elena's win-back".
          const isReal = window.__surfaceState
            ? window.__surfaceState("inbox") === "real" && !window.__DEMO_MODE
            : threads.some((t) => t.real);
          const meta = {
            done:      isReal
              ? { icon: "check", title: "No conversations yet", body: "Messages to your WhatsApp number show up here once they arrive.", cta: { label: "Open Conversations", to: "conversations" } }
              : { icon: "check", title: "48 resolved this week", body: "Handled threads archive after 7 days — every transcript stays in Conversations.", cta: { label: "Open Conversations", to: "conversations" } },
            snoozed:   isReal
              ? { icon: "clock", title: "Nothing snoozed", body: "Snooze hides a thread from your queue. The receptionist keeps answering it." }
              : { icon: "clock", title: "7 snoozed, all sleeping", body: "They come back when they wake. Next: Elena's win-back, tomorrow 10:00." },
            needs:     { icon: "check", title: "Nothing needs you", body: "Threads the receptionist pauses for a human land here first." },
            watching:  { icon: "eye", title: "Nothing in flight", body: "Threads your agents are actively working show here." },
            drafts:    { icon: "edit", title: "No drafts waiting", body: "Agent-written replies queue here for your review." },
            escalated: isReal
              ? { icon: "check", title: "Nobody's waiting on you", body: "The receptionist is answering on its own. Anything it can't handle lands here." }
              : { icon: "flag", title: "No escalations", body: "Sensitive threads that need a human land here." },
          }[activeView ? "view" : activeBucket] || { icon: "filter", title: "Nothing in this view", body: "No threads match this saved view right now." };
          return (
            <EmptyState
              kind="card"
              className="ix-empty-mini"
              glyph={query ? "search" : (meta.icon || "check")}
              tone={query ? null : "ok"}
              title={query ? `No matches for "${query}"` : (meta.title || "All clear")}
              body={query ? "Try a different term — search spans every bucket." : (meta.body || "The receptionist surfaces anything that needs you.")}
              action={query ? { label: "Clear search", onClick: () => setQuery("") } : meta.cta ? { label: meta.cta.label, to: meta.cta.to } : null}
            />
          );
        })()}
        {visible.length > 0 && (
          <div className="ix-thread-rows" role="listbox" aria-label="Conversations" aria-multiselectable="true">
            {visible.map((t, i) => {
              const isActive = activeThreadId === t.id;
              const isSelected = selected.includes(t.id);
              // Pills hide in the needs bucket (redundant there) but ALWAYS show on
              // cross-bucket search results so actionable rows stay distinguishable
              const searching = !!query.trim();
              // A real thread's states are escalated | snoozed | done (viewmodels.ts). The
              // pill and the wait chip used to look for "needs", a state no real thread
              // has, so no real thread ever showed how long it had waited.
              const showStatePill = (searching || !inNeedsBucket) && t.state === "escalated" && !t.claimedByOther;
              return (
                <div
                  key={t.id}
                  className={`ix-thread ${isActive ? "active" : ""} ${isSelected ? "selected" : ""} ${t.unread ? "unread" : ""} pri-${t.priority?.toLowerCase()}`}
                  role="option"
                  aria-selected={isSelected}
                  aria-current={isActive ? "true" : undefined}
                  tabIndex={t.id === tabStopId ? 0 : -1}
                  data-thread-id={t.id}
                  onClick={() => onSelectThread(t.id)}
                  onKeyDown={(e) => onRowKey(e, i)}
                >
                  {/* The mouse's box: the row itself says selected, and Space picks it. */}
                  <input
                    type="checkbox"
                    className="ix-thread-check"
                    checked={isSelected}
                    tabIndex={-1}
                    aria-hidden="true"
                    onChange={(e) => { e.stopPropagation(); onToggleSelect(t.id); }}
                    onClick={(e) => e.stopPropagation()}
                  />

                  <div className="ix-thread-avatar" data-priority={t.priority}>
                    {t.avatar}
                  </div>

                  <div className="ix-thread-body">
                    <div className="ix-thread-line1">
                      <span className="ix-thread-who">{t.who}</span>
                      {t.pinned && <Icon name="pin" size={10} />}
                      <div className="ix-thread-meta">
                        {showStatePill && <StatePill kind="thread" value="escalated" className="ix-state-pill" testid="thread-state" />}
                        {/* A teammate has it: say whose, never Needs you. */}
                        {t.real && t.claimedByOther && <StatePill kind="thread" value="theirs" label={`${ixAnswerer(t)} has it`} className="ix-state-pill" testid="thread-theirs" />}
                        {/* The wait in the one family (8d, 3h, 40m), amber only when it is waiting on you. */}
                        {t.state === "escalated" && t.waitingMin > 0 && (
                          <span className={`ix-wait tabular ${t.waitingMin > 30 && !t.claimedByOther ? "warn" : ""}`}>waiting {t.waited || `${t.waitingMin}m`}</span>
                        )}
                        {t.state === "snoozed" && t.wake && (
                          <span className="ix-wait tabular"><Icon name="clock" size={9} /> {t.wake}</span>
                        )}
                        <span className="ix-thread-time tabular">{t.lastAt}</span>
                      </div>
                    </div>
                    <div className="ix-thread-subject">{t.subject}</div>
                    {t.resolution && (
                      <div className={`ix-thread-resolution ${t.resolution.declined ? "declined" : ""}`}>
                        <Icon name={t.resolution.declined ? "x" : "check"} size={10} />
                        You: {t.resolution.action} · {t.resolution.at}
                      </div>
                    )}
                    <div className="ix-thread-line3">
                      <div className="ix-thread-channels">
                        {t.channels.map((c) => (
                          <Icon key={c} name={channelIcon(c)} size={11} />
                        ))}
                      </div>
                      <span className="ix-thread-preview">{t.preview}</span>
                    </div>
                    <div className="ix-thread-foot">
                      {multipleAgents && (
                      <span className="ix-thread-agent">
                        <span className="agent-avatar" style={{ width: 14, height: 14, fontSize: 8 }}>{t.agent.glyph}</span>
                        <span>{t.agent.name}</span>
                      </span>
                      )}
                      {t.confidence > 0 && (
                        <span className="ix-thread-conf">
                          <ConfidenceDots level={t.confidence} />
                        </span>
                      )}
                      {t.tags.slice(0, 2).map((tag) => (
                        <span key={tag} className="ix-tag">{tag}</span>
                      ))}
                      {t.value > 0 && <span className="ix-thread-value tabular">${t.value.toLocaleString()} LTV</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

const ConfidenceDots = ({ level }) => {
  const filled = level >= window.CHANLY.CONF.SAFE ? 3 : level >= window.CHANLY.CONF.MED ? 2 : 1;
  const tone = filled === 3 ? "high" : filled === 2 ? "med" : "low";
  // Humans get language; the 0–1 float stays in the data
  const word = filled === 3 ? "Safe to send" : filled === 2 ? "Wants your eyes" : "Needs you";
  return (
    <span className={`conf-word conf-${tone}`} data-tip={`${Math.round(level * 100)}% confident — 80%+ counts as safe for bulk approve`}>{word}</span>
  );
};

window.InboxList = InboxList;
window.ixAnswerer = ixAnswerer;
window.ConfidenceDots = ConfidenceDots;
