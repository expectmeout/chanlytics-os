/* global React, Icon */
// Inbox List Rail — perfectionist refinement.
// Improvements:
//   - Search input at the top
//   - P1 threads sort to top within each bucket
//   - P1 gets a left edge stripe (bigger affordance than just the avatar ring)
//   - Drop "NEEDS YOU" pill in the needs bucket (it's redundant)
//   - Saved views are collapsed by default behind a single chip-row toggle
//   - Bulk actions stay; checkbox visible on hover only

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
  stake = null,
  density = "medium",
}) => {
  const [query, setQuery] = React.useState("");
  const [showViews, setShowViews] = React.useState(false);

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
  const anySelected = selected.length > 0;
  const inNeedsBucket = activeBucket === "needs";

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
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button className="ix-search-clear" onClick={() => setQuery("")}>
              <Icon name="x" size={11} />
            </button>
          )}
        </div>
        <button
          className={`ix-views-toggle ${showViews ? "open" : ""}`}
          onClick={() => setShowViews(!showViews)}
          title="Saved views"
        >
          <Icon name="filter" size={12} />
        </button>
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
              <button className="btn btn-sm btn-primary" onClick={onBulkApprove} title="Approves selected approvals with ≥80% confidence" {...window.gate("approve")}>Approve all safe</button>
              <button className="btn btn-sm btn-ghost" onClick={onBulkSnooze} {...window.gate("approve")}>Snooze</button>
              <button className="btn btn-sm btn-ghost" onClick={onBulkArchive} {...window.gate("approve")}>Archive</button>
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

      {/* Threads */}
      <div className="ix-threads">
        {visible.length === 0 && (() => {
          const meta = {
            done:      { icon: "check", title: "48 resolved this week", body: "Handled threads archive after 7 days — every transcript stays in Conversations.", cta: { label: "Open Conversations", to: "conversations" } },
            snoozed:   { icon: "clock", title: "7 snoozed, all sleeping", body: "They come back when they wake. Next: Elena's win-back, tomorrow 10:00." },
            needs:     { icon: "check", title: "Nothing needs you", body: "Approvals your agents pause will land here first." },
            watching:  { icon: "eye", title: "Nothing in flight", body: "Threads your agents are actively working show here." },
            drafts:    { icon: "edit", title: "No drafts waiting", body: "Agent-written replies queue here for your review." },
            escalated: { icon: "flag", title: "No escalations", body: "Sensitive threads that need a human land here." },
          }[activeView ? "view" : activeBucket] || { icon: "filter", title: "Nothing in this view", body: "No threads match this saved view right now." };
          return (
            <div className="ix-empty-mini">
              <Icon name={query ? "search" : (meta.icon || "check")} size={20} />
              <div className="ix-empty-mini-title">{query ? `No matches for "${query}"` : (meta.title || "All clear")}</div>
              <div className="ix-empty-mini-body">{query ? "Try a different term — search spans every bucket." : (meta.body || "Your agents will surface anything that needs your attention here.")}</div>
              {!query && meta.cta && (
                <button className="btn btn-sm" style={{ marginTop: 4 }} onClick={() => window.CHANLY.nav(meta.cta.to)}>{meta.cta.label}</button>
              )}
              {query && (
                <button className="btn btn-ghost btn-sm" style={{ marginTop: 4 }} onClick={() => setQuery("")}>Clear search</button>
              )}
            </div>
          );
        })()}
        {visible.map((t) => {
          const isActive = activeThreadId === t.id;
          const isSelected = selected.includes(t.id);
          // Pills hide in the needs bucket (redundant there) but ALWAYS show on
          // cross-bucket search results so actionable rows stay distinguishable
          const searching = !!query.trim();
          const showStatePill = (searching || !inNeedsBucket) && (t.state === "needs" || t.state === "escalated");
          return (
            <div
              key={t.id}
              className={`ix-thread ${isActive ? "active" : ""} ${isSelected ? "selected" : ""} ${t.unread ? "unread" : ""} pri-${t.priority?.toLowerCase()}`}
              onClick={() => onSelectThread(t.id)}
            >
              <input
                type="checkbox"
                className="ix-thread-check"
                checked={isSelected}
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
                    {showStatePill && t.state === "needs" && <span className="ix-needs-pill">Needs you</span>}
                    {showStatePill && t.state === "escalated" && <span className="ix-escalated-pill">Escalated</span>}
                    {t.state === "needs" && t.waitingMin > 0 && (
                      <span className={`ix-wait tabular ${t.waitingMin > 30 ? "warn" : ""}`}>waiting {t.waitingMin}m</span>
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
                  <span className="ix-thread-agent">
                    <span className="agent-avatar" style={{ width: 14, height: 14, fontSize: 8 }}>{t.agent.glyph}</span>
                    <span>{t.agent.name}</span>
                  </span>
                  {t.confidence !== undefined && (
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
window.ConfidenceDots = ConfidenceDots;
