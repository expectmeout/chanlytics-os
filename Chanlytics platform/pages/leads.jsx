/* global React, Icon, LEADS, LEAD_STAGES, LEADS_AGGREGATES,
   StatStrip, StatCell, MoreMenu, ChannelGlyph, TempBar */
// Chanlytics — People · Leads
// Unqualified pipeline: agents capture + qualify, you approve.
// Hero = "Ready for you" decision queue · funnel strip · full table · detail drawer.

const { useState: useLdState, useMemo: useLdMemo, useEffect: useLdEffect } = React;

const LD_STAGE_LABEL = {
  ready: "Ready", qualifying: "Qualifying", new: "New", nurture: "Nurturing",
  converted: "Converted", archived: "Archived",
};

const LeadStagePill = ({ stage }) => (
  <span className={`ld-stage s-${stage}`}>{LD_STAGE_LABEL[stage] || stage}</span>
);

// Lead-list membership (SEGMENT_META lead members) + chip
const ldSegsOf = (id) => window.CHANLY.segsOf(id, { lead: true });

const LeadSegChip = ({ seg }) => (
  <button
    className="ld-seg-chip"
    data-tip={`${seg.query} — open in Segments`}
    onClick={(e) => { e.stopPropagation(); window.CHANLY.nav(CHANLY.R.segment(seg.id)); }}
  >
    <Icon name="bolt" size={9} />{seg.label}
  </button>
);

const LeadFit = ({ fit }) => {
  if (fit == null) return <span className="ld-fit-none">scoring…</span>;
  return (
    <span className="ld-fit" data-tip={`Fit ${Math.round(fit * 100)} of 100 — budget, timing, and intent · agents keep scoring as the conversation goes`}>
      <TempBar value={fit} sizeClass="bar-md" />
      <span className="ld-fit-num tabular">{Math.round(fit * 100)}</span>
    </span>
  );
};

// ---- Funnel strip -------------------------------------------------------
const LeadFunnel = ({ leads, active, onPick }) => {
  const total = Math.max(1, leads.filter(l => LD_STAGE_LABEL[l.stage] && l.stage !== "converted" && l.stage !== "archived").length);
  return (
    <div className="ld-funnel" role="tablist">
      {LEAD_STAGES.map(s => {
        const count = leads.filter(l => l.stage === s.id).length;
        return (
          <button
            key={s.id}
            role="tab"
            aria-selected={active === s.id}
            className={`ld-funnel-tab ${active === s.id ? "active" : ""} ${s.accent ? "accent" : ""}`}
            onClick={() => onPick(active === s.id ? "all" : s.id)}
          >
            <div className="ld-funnel-row">
              <span className="ld-funnel-label"><Icon name={s.glyph} size={11} />{s.label}</span>
              <span className="ld-funnel-count">{count}</span>
            </div>
            <div className="ld-funnel-sub">{s.sub}</div>
            <div className="ld-funnel-share">
              <div className="ld-funnel-share-fill" style={{ width: `${Math.round((count / total) * 100)}%` }} />
            </div>
          </button>
        );
      })}
    </div>
  );
};

// ---- Source performance strip -------------------------------------------
const LeadSources = ({ active, onPick }) => (
  <div className="ld-src">
    <div className="ld-src-head">
      <span className="ld-src-title">By source</span>
      <span className="ld-src-sub">this week · captured → ready → won · click to filter</span>
      <button className="cl-bucket-link" onClick={() => window.CHANLY.nav("reports")}>
        In Reports <Icon name="arrow-right" size={10} />
      </button>
    </div>
    <div className="ld-src-row" role="tablist">
      {(window.LEAD_SOURCES || []).map(s => (
        <button
          key={s.id}
          role="tab"
          aria-selected={active === s.id}
          className={`ld-src-cell ${active === s.id ? "active" : ""}`}
          onClick={() => onPick(active === s.id ? null : s.id)}
        >
          <span className="ld-src-label"><Icon name={s.icon} size={11} />{s.label}</span>
          <span className="ld-src-fun tabular">{s.captured} <Icon name="arrow-right" size={8} /> {s.ready} <Icon name="arrow-right" size={8} /> <b>{s.converted}</b></span>
          <span className="ld-src-meta">{s.est > 0 ? `$${s.est.toLocaleString()} est.` : "no wins yet"} · {s.touch}</span>
        </button>
      ))}
    </div>
  </div>
);

// ---- Decision queue (reuses .cl-decision pattern) ------------------------
const LeadQueueRow = ({ lead, onOpen, onApprove, onArchive }) => {
  const l = lead;
  const done = l.stage === "converted" || l.stage === "archived";
  return (
    <div className={`cl-decision ${done ? "ld-done" : ""}`} onClick={() => onOpen(l.id)} role="button">
      <div className="cl-decision-l">
        <div className="cl-mini-avatar" data-priority={l.priority}>{l.initials}</div>
        <ChannelGlyph kind={l.channel} primary size={11} />
      </div>
      <div className="cl-decision-body">
        <div className="cl-decision-name">
          {l.name}
          <span className="cl-decision-meta">
            {l.estValue != null && <span className="ld-est">${l.estValue.toLocaleString()}<span className="dim"> est.</span></span>}
            <span className="dim"> · {l.age} old</span>
            {l.firstTouch && <span className="ld-sla" data-tip="Time from lead arrival to the agent\u2019s first reply \u2014 target under 2 minutes"><Icon name="bolt" size={9} />{l.firstTouch}</span>}
          </span>
        </div>
        <div className="cl-decision-narr">{l.narrative}</div>
        {l.agentActivity && (
          <div className={`cl-decision-agent ${l.agentActivity.status === "approval" ? "approval" : l.agentActivity.status === "escalated" ? "escalated" : ""}`}>
            <span className="agent-avatar">{l.agentActivity.glyph}</span>
            {(l.agentActivity.status === "in-flight" || l.agentActivity.status === "approval") && <span className="live-dot" />}
            <span className="cl-decision-agent-text">{l.agentActivity.agent} · {l.agentActivity.verb}</span>
          </div>
        )}
      </div>
      <div className="ld-queue-actions" onClick={(e) => e.stopPropagation()}>
        {done ? (
          <LeadStagePill stage={l.stage} />
        ) : (
          <>
            <button className="cl-decision-cta primary" onClick={() => onApprove(l.id)} {...window.gate("approve")}>
              {l.rec ? (l.rec.action === "call" ? "Take the call" : "Approve") : "Review"}
            </button>
            <button className="ld-queue-skip" onClick={() => onOpen(l.id)}>Details</button>
            <button className="ld-queue-skip" onClick={() => onArchive(l.id)} {...window.gate("approve")}>Archive</button>
          </>
        )}
      </div>
    </div>
  );
};

// ---- Table ---------------------------------------------------------------
const LD_COLS = [
  { key: "name",  label: "Lead", sortable: true },
  { key: "stage", label: "Stage", sortable: true },
  { key: "fit",   label: "Fit", sortable: true },
  { key: "est",   label: "Est. value", sortable: true, num: true },
  { key: "inquiry", label: "Inquiry", sortable: false },
  { key: "agent", label: "Agent activity", sortable: false },
  { key: "age",   label: "Age", sortable: true },
];

const LeadsTable = ({ leads, sortBy, sortDir, onSort, onOpen, onClearFilters = () => {} }) => (
  <div className="cl-table-wrap">
    <table className="cl-table">
      <thead>
        <tr>
          {LD_COLS.map(c => (
            <th key={c.key} className={`${c.sortable ? "sortable" : ""} ${c.num ? "num" : ""}`} onClick={() => c.sortable && onSort(c.key)}>
              {c.label}
              {sortBy === c.key && <span className="sort-arr">{sortDir === "asc" ? "▲" : "▼"}</span>}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {leads.map(l => (
          <tr key={l.id} onClick={() => onOpen(l.id)}>
            <td>
              <div className="cl-row-name">
                <div className="ix-thread-avatar" data-priority={l.priority}>{l.initials}</div>
                <div className="cl-row-name-block">
                  <div className="cl-row-fullname">
                    {l.name}
                    {l.dupe && !l.dupeResolved && <span className="ld-dupe-flag" data-tip={`${l.dupe.reason} — ${l.dupe.note}`}><Icon name="alert" size={9} />dupe?</span>}
                  </div>
                  <div className="cl-row-meta">
                    <span className="cl-row-channels"><ChannelGlyph kind={l.channel} primary size={11} /></span>
                    <span className="dot" />
                    <span>{l.source}</span>
                    {ldSegsOf(l.id).map(s => <LeadSegChip key={s.id} seg={s} />)}
                  </div>
                </div>
              </div>
            </td>
            <td className="shrink"><LeadStagePill stage={l.stage} /></td>
            <td className="shrink"><LeadFit fit={l.fit} /></td>
            <td className="num">{l.estValue != null ? `$${l.estValue.toLocaleString()}` : "—"}</td>
            <td><span className="cl-decision-narr" style={{ WebkitLineClamp: 1 }}>{l.inquiry}</span></td>
            <td>
              {l.agentActivity ? (
                <span className={`cl-row-agent ${l.agentActivity.status === "approval" ? "approval" : l.agentActivity.status === "escalated" ? "escalated" : ""}`}>
                  <span className="agent-avatar">{l.agentActivity.glyph}</span>
                  {!l.paused && (l.agentActivity.status === "in-flight" || l.agentActivity.status === "approval") && <span className="live-dot" />}
                  <span className="cl-row-agent-verb">{l.paused ? "Paused by you" : l.agentActivity.verb}</span>
                </span>
              ) : <span style={{ fontSize: 11, color: "var(--ink-faint)" }}>—</span>}
            </td>
            <td className="shrink dim ld-age">
              {l.age}
              {l.ageMin >= 1200 && (l.stage === "qualifying" || l.stage === "new") && <span className="ld-stale" data-tip="No movement in 20+ hours \u2014 worth a nudge or an archive">stale</span>}
            </td>
          </tr>
        ))}
        {leads.length === 0 && (
          <tr><td colSpan={7}>
            <div className="cl-table-empty">
              <Icon name="search" size={15} />
              <span>No leads match this view.</span>
              <button className="cl-bucket-link" onClick={onClearFilters}>
                Clear filters <Icon name="arrow-right" size={10} />
              </button>
            </div>
          </td></tr>
        )}
      </tbody>
    </table>
    <div className="cl-table-foot">
      <span>Showing {leads.length} leads</span>
      <span>Median first touch {LEADS_AGGREGATES.medianFirstTouch} · press / to search</span>
    </div>
  </div>
);

// ---- Drawer ---------------------------------------------------------------
const LeadDrawer = ({ lead, onClose, onApprove, onArchive, onOpenClient, onResolveDupe, onTogglePause }) => {
  useLdEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  if (!lead) return null;
  const l = lead;
  const done = l.stage === "converted" || l.stage === "archived";

  return (
    <>
      <div className="ld-drawer-backdrop" onClick={onClose} />
      <aside className="ld-drawer" data-screen-label="Lead detail">
        <div className="ld-drawer-head">
          <div className="cl-mini-avatar" data-priority={l.priority}>{l.initials}</div>
          <div className="ld-drawer-id">
            <div className="ld-drawer-name">{l.name}<LeadStagePill stage={l.stage} /></div>
            <div className="ld-drawer-source"><ChannelGlyph kind={l.channel} primary size={11} />{l.source}</div>
          </div>
          <button className="btn btn-ghost btn-icon btn-sm ld-drawer-close" onClick={onClose} aria-label="Close">
            <Icon name="x" size={13} />
          </button>
        </div>

        <div className="ld-drawer-scroll">
          <div className="ld-drawer-stats">
            <div className="ld-drawer-stat">
              <div className="ld-drawer-stat-label">Fit</div>
              <div className="ld-drawer-stat-value">{l.fit != null ? Math.round(l.fit * 100) : "—"}{l.fit != null && <TempBar value={l.fit} sizeClass="bar-md" />}</div>
            </div>
            <div className="ld-drawer-stat">
              <div className="ld-drawer-stat-label">Est. value</div>
              <div className="ld-drawer-stat-value">{l.estValue != null ? `$${l.estValue.toLocaleString()}` : "—"}</div>
            </div>
            <div className="ld-drawer-stat">
              <div className="ld-drawer-stat-label">Age</div>
              <div className="ld-drawer-stat-value">{l.age}</div>
            </div>
            <div className="ld-drawer-stat">
              <div className="ld-drawer-stat-label">First touch</div>
              <div className="ld-drawer-stat-value">{l.firstTouch || "—"}</div>
            </div>
          </div>

          {l.dupe && !l.dupeResolved && (
            <div className="ld-dupe">
              <div className="ld-dupe-head"><Icon name="alert" size={11} />Possible duplicate</div>
              <div className="ld-dupe-body">{l.dupe.reason}. {l.dupe.note}.</div>
              <div className="ld-dupe-actions">
                <button className="btn btn-sm" onClick={() => window.CHANLY.nav(CHANLY.R.client(l.dupe.clientId))}>View existing record</button>
                <button className="btn btn-ghost btn-sm" onClick={() => onResolveDupe(l.id)}>Not a match</button>
              </div>
            </div>
          )}

          {ldSegsOf(l.id).length > 0 && (
            <div>
              <div className="ld-sec-label"><Icon name="filter" size={10} />In lists</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                {ldSegsOf(l.id).map(s => <LeadSegChip key={s.id} seg={s} />)}
              </div>
            </div>
          )}

          {l.inboxThreadId && !done && (
            <button className="ld-inbox-xlink" onClick={() => window.CHANLY.nav(CHANLY.R.thread(l.inboxThreadId))}>
              <Icon name="inbox" size={12} />
              <span className="grow">This decision is also in your Inbox — full thread, evidence, and reply draft</span>
              <Icon name="arrow-right" size={11} />
            </button>
          )}

          <div>
            <div className="ld-sec-label"><Icon name="sparkle" size={10} />Where this stands</div>
            <div className="ld-narrative">{l.narrative}</div>
          </div>

          {l.learned.length > 0 && (
            <div>
              <div className="ld-sec-label"><Icon name="check" size={10} />What the agent learned</div>
              <div className="ld-facts">
                {l.learned.map((f, i) => (
                  <div className="ld-fact" key={i}><span className="ld-fact-k">{f.k}</span><span className="ld-fact-v">{f.v}</span></div>
                ))}
                {(() => { const cp = window.CHANLY.compliance(l.id); return (cp.dnc || cp.consent !== "granted") ? (
                  <div className="ld-fact"><span className="ld-fact-k">Consent</span><span className="ld-fact-v" style={{ color: "var(--warn)" }}>{cp.dnc ? "DNC — do not message" : `${cp.consent}${cp.method ? ` · ${cp.method}` : ""} — held from sends`}</span></div>
                ) : null; })()}
              </div>
            </div>
          )}

          {l.transcript.length > 0 && (
            <div>
              <div className="ld-sec-label"><Icon name="chat" size={10} />From the conversation</div>
              <div className="ld-convo">
                {l.transcript.map((m, i) => (
                  <div key={i} className={`ld-msg ${m.who}`}>
                    <span className="ld-msg-who">{m.who === "lead" ? l.name.split(" ")[0] : (l.agentActivity ? l.agentActivity.agent : "Agent")}</span>
                    {m.text}
                  </div>
                ))}
              </div>
            </div>
          )}

          {done ? (
            <div className="ld-done-note">
              <Icon name="check" size={13} />
              {l.stage === "converted" ? "Approved — client record created, agent is executing." : "Archived — agents will stop outreach."}
            </div>
          ) : l.rec && (
            <div className="ld-rec">
              <div className="ld-rec-label"><Icon name="sparkle" size={11} />Recommendation</div>
              <div className="ld-rec-title">{l.rec.label}</div>
              <div className="ld-rec-detail">{l.rec.detail}</div>
              <div className="ld-rec-conf">
                <span className="ld-rec-conf-bar"><span className="ld-rec-conf-fill" style={{ width: `${Math.round(l.rec.confidence * 100)}%` }} /></span>
                {Math.round(l.rec.confidence * 100)}% confidence
              </div>
            </div>
          )}
        </div>

        <div className="ld-drawer-foot">
          {done ? (
            <>
              {l.stage === "converted" && (
                <button className="btn btn-primary btn-sm" onClick={() => onOpenClient(l)}>
                  Open client <Icon name="arrow-right" size={11} />
                </button>
              )}
              <span className="grow" />
              <button className="btn btn-ghost btn-sm" onClick={onClose}>Close</button>
            </>
          ) : (
            <>
              <button className="btn btn-primary btn-sm" onClick={() => onApprove(l.id)} {...window.gate("approve")}>
                <Icon name="check" size={12} /> {l.rec ? l.rec.label : "Approve & convert"}
              </button>
              <span className="grow" />
              {l.stage === "nurture" && (
                <button className="btn btn-ghost btn-sm" onClick={() => onTogglePause(l.id)}>
                  <Icon name={l.paused ? "play" : "pause"} size={11} /> {l.paused ? "Resume outreach" : "Pause outreach"}
                </button>
              )}
              <button className="btn btn-ghost btn-sm" onClick={() => window.askAbout && window.askAbout({ mode: "compose", prompt: `About lead ${l.name}: ` })}>
                <Icon name="sparkle" size={12} /> Ask
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => onArchive(l.id)} {...window.gate("approve")}>Archive</button>
            </>
          )}
        </div>
      </aside>
    </>
  );
};

// ---- Page ------------------------------------------------------------------
const LeadsPage = ({ onOpenClient = () => {}, initialSrc = null, initialLead = null }) => {
  const [leads, setLeads] = useLdState(() => LEADS.map(l => ({ ...l })));
  const [stageFilter, setStageFilter] = useLdState("all");
  const [query, setQuery] = useLdState("");
  const [sortBy, setSortBy] = useLdState("fit");
  const [sortDir, setSortDir] = useLdState("desc");
  const [openId, setOpenId] = useLdState(initialLead);
  const [srcFilter, setSrcFilter] = useLdState(initialSrc);
  useLdEffect(() => { if (initialSrc) setSrcFilter(initialSrc); }, [initialSrc]);
  useLdEffect(() => { if (initialLead) setOpenId(initialLead); }, [initialLead]);

  // Live arrival — merge new window.LEADS rows without losing session stage edits
  useLdEffect(() => {
    const sync = () => setLeads(cur => {
      const have = new Set(cur.map(x => x.id));
      const incoming = (window.LEADS || []).filter(x => !have.has(x.id)).map(x => ({ ...x }));
      return [...incoming, ...cur.map(x => {
        const w = (window.LEADS || []).find(v => v.id === x.id);
        if (!w || !w.arrivedNow) return x;
        const keep = x.stage === "converted" || x.stage === "archived" ? x.stage : w.stage;
        return { ...x, ...w, stage: keep };
      })];
    });
    window.addEventListener("leads:arrived", sync);
    return () => window.removeEventListener("leads:arrived", sync);
  }, []);
  const [toastNode, ppFlash] = window.usePPToast(6500);
  const searchRef = React.useRef(null);
  // Snapshot of the decision queue at mount — keeps decided cards visible in place.
  const [queueIds] = useLdState(() => LEADS.filter(l => l.stage === "ready").map(l => l.id));

  useHotkey(
    (e, typing) => !typing && !e.metaKey && !e.ctrlKey && !e.altKey && e.key === "/",
    () => searchRef.current && searchRef.current.focus()
  );

  const onSort = (key) => {
    if (sortBy === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortBy(key); setSortDir("desc"); }
  };

  const setStage = (id, stage) => setLeads(ls => ls.map(l => l.id === id ? { ...l, stage } : l));
  const ldFlash = (p) => ppFlash({
    icon: p.kind === "archive" ? "clock" : "check",
    msg: p.kind === "archive"
      ? <><b>{p.name}</b> archived — agents stop outreach</>
      : <><b>{p.name}</b> converted — client record created · entered{" "}
          <button className="pp-toast-link" onClick={() => window.CHANLY.nav(window.CHANLY.R.segment("new-this-month"))}>New this month</button></>,
    links: p.kind === "archive" ? [] : [{ label: "Open client", to: p.clientId ? window.CHANLY.R.client(p.clientId) : "clients" }],
    undo: () => setStage(p.prev.id, p.prev.stage),
  });
  const approve = (id) => {
    if (!window.canDo("approve")) return;
    const l = leads.find(x => x.id === id);
    if (!l) return;
    ldFlash({ kind: "convert", name: l.name, clientId: l.clientId || null, prev: { id, stage: l.stage } });
    setStage(id, "converted");
    window.dispatchEvent(new CustomEvent("leads:converted", { detail: { leadId: id, name: l.name, clientId: l.clientId || null } }));
  };
  const archive = (id) => {
    if (!window.canDo("approve")) return;
    const l = leads.find(x => x.id === id);
    if (!l) return;
    ldFlash({ kind: "archive", name: l.name, prev: { id, stage: l.stage } });
    setStage(id, "archived");
  };
  const resolveDupe = (id) => setLeads(ls => ls.map(l => l.id === id ? { ...l, dupeResolved: true } : l));
  const togglePause = (id) => setLeads(ls => ls.map(l => l.id === id ? { ...l, paused: !l.paused } : l));

  const readyQueue = useLdMemo(
    () => queueIds.map(id => leads.find(l => l.id === id)).filter(Boolean),
    [leads, queueIds]
  );

  const shown = useLdMemo(() => {
    let list = stageFilter === "all" ? [...leads] : leads.filter(l => l.stage === stageFilter);
    if (srcFilter) list = list.filter(l => l.src === srcFilter);
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(l =>
        l.name.toLowerCase().includes(q) ||
        l.source.toLowerCase().includes(q) ||
        l.inquiry.toLowerCase().includes(q) ||
        l.narrative.toLowerCase().includes(q) ||
        l.learned.some(f => (f.k + " " + f.v).toLowerCase().includes(q))
      );
    }
    const stageRank = { ready: 0, qualifying: 1, new: 2, nurture: 3, converted: 4, archived: 5 };
    list.sort((a, b) => {
      let av, bv;
      switch (sortBy) {
        case "name": av = a.name; bv = b.name; break;
        case "stage": av = stageRank[a.stage]; bv = stageRank[b.stage]; break;
        case "fit": av = a.fit ?? -1; bv = b.fit ?? -1; break;
        case "est": av = a.estValue ?? -1; bv = b.estValue ?? -1; break;
        case "age": av = a.ageMin ?? 9e9; bv = b.ageMin ?? 9e9; break;
        default: av = a.name; bv = b.name;
      }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return list;
  }, [leads, stageFilter, srcFilter, query, sortBy, sortDir]);

  const openLead = leads.find(l => l.id === openId) || null;
  const openClientFor = (l) => l.clientId ? onOpenClient(l.clientId) : window.CHANLY.nav("clients");
  const readyCount = leads.filter(l => l.stage === "ready").length;

  return (
    <div className="ld-page" data-screen-label="Leads">
      {/* Header */}
      <div className="cl-head">
        <div className="cl-head-titles">
          <div className="cl-page-title">Leads</div>
          <div className="cl-page-sub">
            Unqualified pipeline. Agents answer in seconds and gather fit — you make the calls that count.
          </div>
        </div>
        <StatStrip className="cl-head-stats">
          <StatCell label="Captured" value={LEADS_AGGREGATES.capturedThisWeek} meta="this week" />
          <StatCell label="First touch" tip="Median time from a new lead's arrival to the first agent reply · this week · target under 2 minutes" value={LEADS_AGGREGATES.medianFirstTouch} meta="median · target < 2m" metaTone="pos" />
          <StatCell label="Qualification rate" tip="Captured leads that reached Ready · this week" value={`${Math.round(LEADS_AGGREGATES.qualificationRate * 100)}%`} meta="captured → ready" />
          <StatCell label="Converted" tip="Leads that booked and became clients · this week · $ is estimated value" value={LEADS_AGGREGATES.convertedThisWeek.count} meta={`$${LEADS_AGGREGATES.convertedThisWeek.value.toLocaleString()} est. · wk`} metaTone="pos" />
        </StatStrip>
      </div>

      {/* Search */}
      <div className="cl-controls">
        <div className="cl-search-wrap">
          <Icon name="search" size={13} />
          <input ref={searchRef} placeholder="Search leads by name, source, inquiry, what agents learned…" value={query} onChange={(e) => setQuery(e.target.value)} />
          <span className="kbd">/</span>
        </div>
        <div className="cl-controls-right">
          <button className="btn btn-ghost btn-sm" onClick={() => onSort("fit")}>
            <Icon name="sort" size={12} /> {sortDir === "desc" ? "Best fit first" : "Lowest fit first"}
          </button>
        </div>
      </div>

      {/* Funnel */}
      <LeadFunnel leads={leads} active={stageFilter} onPick={setStageFilter} />

      {/* Sources */}
      <LeadSources active={srcFilter} onPick={setSrcFilter} />

      {/* Ready-for-you queue */}
      <div className="cl-buckets">
        <div className="cl-buckets-head">
          <div>
            <span className="cl-buckets-title">Ready for you</span>
            <span className="cl-buckets-sub" style={{ marginLeft: 10 }}>
              {readyCount === 0 ? "Queue clear — agents are on the rest" : `${readyCount} decision${readyCount === 1 ? "" : "s"} waiting · agents handle the rest`}
            </span>
          </div>
        </div>
        <div className="cl-decision-grid" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
          {readyQueue.map(l => (
            <LeadQueueRow key={l.id} lead={l} onOpen={setOpenId} onApprove={approve} onArchive={archive} />
          ))}
          {readyQueue.length === 0 && (
            <div className="cl-decision-empty">Nothing needs your judgment right now.</div>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="cl-section">
        <div className="cl-section-head">
          <div>
            <span className="cl-section-title">All leads</span>
            <span className="cl-section-sub" style={{ marginLeft: 10 }}>{shown.length} shown</span>
          </div>
          <div className="cl-tabs">
            {["all", "ready", "qualifying", "new", "nurture", "converted", "archived"]
              .filter(t => (t !== "converted" && t !== "archived") || leads.some(l => l.stage === t))
              .map(t => (
              <button key={t} className={`cl-tab ${stageFilter === t ? "active" : ""}`} onClick={() => setStageFilter(t)}>
                {t === "all" ? "All" : LD_STAGE_LABEL[t]}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div style={{ paddingBottom: 32 }}>
        <LeadsTable leads={shown} sortBy={sortBy} sortDir={sortDir} onSort={onSort} onOpen={setOpenId} onClearFilters={() => { setQuery(""); setStageFilter("all"); setSrcFilter(null); }} />
      </div>

      <LeadDrawer
        lead={openLead}
        onClose={() => setOpenId(null)}
        onApprove={approve}
        onArchive={archive}
        onOpenClient={openClientFor}
        onResolveDupe={resolveDupe}
        onTogglePause={togglePause}
      />

      {toastNode}
    </div>
  );
};

window.LeadsPage = LeadsPage;
