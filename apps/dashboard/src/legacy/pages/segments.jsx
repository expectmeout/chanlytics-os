/* global React, Icon, CLIENTS, CLIENT_SEGMENTS, SEGMENT_META, SEGMENTS_AGGREGATES,
   Sparkline, MoreMenu, TempBar, ChannelGlyph */
// Chanlytics — People · Segments
// Agent-built smart lists + saved manual filters. Left: list + natural-language
// composer. Right: definition, rules, trend, usage, live member preview.

const { useState: useSgState, useMemo: useSgMemo, useEffect: useSgEffect, useRef: useSgRef } = React;

const SG_SUGGESTIONS = [
  "VIPs who haven't booked since March",
  "Everyone who mentioned pricing this month",
  "Clients Jay saw more than 3 times",
];

// ---- Left rail row --------------------------------------------------------
const SegmentRow = ({ seg, meta, active, onPick }) => (
  <button className={`sg-row ${active ? "active" : ""} ${seg.draft ? "draft" : ""}`} onClick={() => onPick(seg.id)} data-tip={seg.query}>
    <span className="sg-row-body">
      <span className="sg-row-label">{seg.label}</span>
      <span className="sg-row-query">{seg.query}</span>
    </span>
    {meta && <span className="sg-row-spark"><Sparkline data={meta.trend} width={34} height={12} /></span>}
    <span className="sg-row-count tabular">{seg.draft ? "…" : seg.count}</span>
  </button>
);

// Session store: drafts + activations survive navigation. Approved lists
// mutate CLIENT_SEGMENTS/SEGMENT_META (the sanctioned lead-lists pattern) so
// Broadcasts and Fleet pickers see them too.
window.SG_STORE = window.SG_STORE || { extra: [], approved: {}, archived: {}, usage: {} };

// Keyword → rule translation — the “Qualifier wrote real rules” step
const sgParseRules = (desc) => {
  const d = desc.toLowerCase();
  const rules = [];
  const days = d.match(/(\d+)\s*(?:\+\s*)?days?/);
  const weeks = d.match(/(\d+)\s*weeks?/);
  const months = d.match(/since\s+(january|february|march|april)|(\d+)\s*months?/);
  if (/vip/.test(d)) rules.push({ f: "tags", o: "includes", v: "VIP" });
  if (/regular|loyal|frequent/.test(d)) rules.push({ f: "visits", o: "≥", v: "5" });
  if (/new client|first visit|first-visit/.test(d)) rules.push({ f: "visits", o: "≤", v: "1" });
  if (/no.?show/.test(d)) rules.push({ f: "no-shows", o: "≥", v: "2" });
  if (/pricing|price|cost/.test(d)) rules.push({ f: "conversations", o: "mention", v: "pricing" });
  if (/package|pack/.test(d)) rules.push({ f: "package", o: "=", v: "active" });
  if (/lena|jay/.test(d)) rules.push({ f: "therapist", o: "=", v: /lena/.test(d) ? "Lena Park" : "Jay Rivera" });
  if (/spen[dt]|\$\d|ltv|value/.test(d)) rules.push({ f: "lifetime spend", o: "≥", v: "$500" });
  if (days) rules.push({ f: "last visit", o: ">", v: `${days[1]} days ago` });
  else if (weeks) rules.push({ f: "last visit", o: ">", v: `${+weeks[1] * 7} days ago` });
  else if (months) rules.push({ f: "last visit", o: ">", v: months[1] ? `since ${months[1][0].toUpperCase()}${months[1].slice(1)} 1` : `${+months[2] * 30} days ago` });
  else if (/hav(e|en)'?t (been|booked|visited)|lapsed|quiet|drift/.test(d)) rules.push({ f: "last visit", o: ">", v: "30 days ago" });
  if (rules.length === 0) rules.push({ f: "description", o: "≈", v: desc.length > 26 ? desc.slice(0, 26) + "…" : desc });
  return rules;
};
const SegmentComposer = ({ onBuilt }) => {
  const [text, setText] = useSgState("");
  const [building, setBuilding] = useSgState(false);
  const inputRef = useSgRef(null);

  // Topbar "New segment" action focuses the composer
  useSgEffect(() => {
    const focus = () => inputRef.current && inputRef.current.focus();
    window.addEventListener("segments:new", focus);
    return () => window.removeEventListener("segments:new", focus);
  }, []);

  const build = () => {
    const desc = text.trim();
    if (!desc || building) return;
    setBuilding(true);
    setTimeout(() => {
      setBuilding(false);
      setText("");
      onBuilt(desc);
    }, 1100);
  };

  return (
    <div className="sg-compose">
      <div className="sg-compose-label"><Icon name="sparkle" size={11} />New segment</div>
      <textarea
        ref={inputRef}
        rows={2}
        placeholder={`Describe who you want — \u201c${SG_SUGGESTIONS[0]}\u201d`}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); build(); } }}
      />
      <div className="sg-compose-foot">
        {building ? (
          <span className="sg-building"><span className="live-dot" />Qualifier is translating to rules…</span>
        ) : (
          <span className="sg-compose-hint">Plain English — an agent writes the rules</span>
        )}
        <button className="btn btn-primary btn-sm" onClick={build} disabled={building || !text.trim()}>
          {building ? "Building…" : "Build"}
        </button>
      </div>
      {!building && (
        <div className="sg-compose-chips">
          {SG_SUGGESTIONS.slice(0, 3).map(s => (
            <button key={s} className="sg-compose-chip" onClick={() => { setText(s); window.setTimeout(build0(s), 0); }}>
              <Icon name="sparkle" size={9} />{s}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  function build0(desc) {
    return () => {
      if (building) return;
      setBuilding(true);
      setTimeout(() => { setBuilding(false); setText(""); onBuilt(desc); }, 1100);
    };
  }
};

// ---- Assign-agent menu (Point an agent at this list) -----------------------
const AssignAgentMenu = ({ seg, onAssign }) => {
  const [open, setOpen] = useSgState(false);
  const roster = (window.FLEET_DATA && window.FLEET_DATA.FLEET_ROSTER) || [];
  return (
    <div className="more-wrap">
      <button className="btn btn-sm" onClick={() => setOpen(v => !v)} aria-haspopup="menu" aria-expanded={open}>
        <Icon name="agents" size={12} /> Assign agent
      </button>
      {open && (
        <>
          <div className="more-backdrop" onClick={() => setOpen(false)} />
          <div className="more-menu align-right" role="menu">
            <div className="more-header">Run a playbook on “{seg.label}”</div>
            {roster.map(a => (
              <button key={a.id} className="more-item" role="menuitem" onClick={() => { setOpen(false); onAssign(a); }}>
                <span className="agent-avatar" style={{ width: 16, height: 16, fontSize: 8.5 }}>{a.glyph}</span>
                <span className="more-item-label">{a.name}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

// ---- Detail pane -----------------------------------------------------------
const SegmentDetail = ({ seg, meta, extraUsage = [], onAssign, onDuplicate, onArchive, onApproveDraft, onDiscardDraft, paused, onTogglePause, flash, notify, onToggleNotify }) => {
  const members = useSgMemo(() => {
    if (!meta) return [];
    return meta.members
      .map(m => m.lead
        ? { ...m, leadRec: (window.LEADS || []).find(l => l.id === m.id) }
        : { ...m, client: (window.CLIENTS || []).find(c => c.id === m.id) })
      .filter(m => m.client || m.leadRec);
  }, [meta]);
  const broadcasts = useSgMemo(
    () => (window.BC_HISTORY_SEED || []).filter(h => h.segId === (seg && seg.id)),
    [seg]
  );

  if (!seg) return null;
  const isAgent = seg.kind === "agent";
  const isLead = seg.kind === "lead";
  const isDraft = !!seg.draft;
  const usage = [...extraUsage, ...(meta ? meta.usedBy : [])];
  const R = window.CHANLY.R;

  return (
    <div className="sg-detail-pad">
      <div className="sg-detail-head">
        <div className="sg-detail-titles">
          <div className="sg-detail-name">
            {seg.label}
            <span className={`sg-kind ${seg.kind}`}>
              {(isAgent || isLead) && <Icon name={isLead ? "bolt" : "sparkle"} size={10} />}
              {isAgent ? `Smart · ${seg.agent}` : isLead ? `Lead list · ${seg.agent}` : "Saved filter"}
            </span>
          </div>
          <div className="sg-detail-def">{meta ? meta.definition : seg.query}</div>
        </div>
        <div className="sg-detail-actions">
          <button
            className={`btn btn-icon btn-sm ${notify ? "" : "btn-ghost"} sg-notify ${notify ? "on" : ""}`}
            data-tip={notify ? "Notifying on entry & exit — click to mute" : "Get a bell notification when someone enters or leaves this list"}
            // data-tip draws our own tooltip; it is not an accessible name, so
            // this button announced as "button, pressed" and nothing else.
            aria-label={notify ? "Mute notifications for this list" : "Notify me when someone enters or leaves this list"}
            aria-pressed={notify}
            onClick={onToggleNotify}
          >
            <Icon name="bell" size={13} />
          </button>
          <AssignAgentMenu seg={seg} onAssign={onAssign} />
          {isLead ? (
            <button className="btn btn-primary btn-sm" data-tip="Lead lists feed outbound campaigns — this list becomes the audience" onClick={() => window.CHANLY.nav("outbound")}>
              <Icon name="bolt" size={12} /> Use in outbound
            </button>
          ) : (
            <button className="btn btn-primary btn-sm" onClick={() => window.CHANLY.nav(R.broadcast(seg.id))}>
              <Icon name="wave" size={12} /> Use in broadcast
            </button>
          )}
          <MoreMenu items={[
            { label: "Rename", icon: "content", onClick: () => window.askAbout({ mode: "compose", prompt: `Rename segment “${seg.label}” to ` }) },
            { label: "Duplicate", icon: "plus", onClick: () => onDuplicate(seg) },
            { label: "Export CSV", icon: "external", onClick: () => flash({ msg: <><b>{seg.label}</b> exported — {seg.count || (meta ? meta.members.length : 0)} rows to CSV</> }) },
            { divider: true },
            isAgent
              ? { label: paused ? "Resume auto-refresh" : "Pause auto-refresh", icon: paused ? "play" : "clock", onClick: onTogglePause }
              : { label: "Convert to smart list", icon: "sparkle", onClick: () => window.askAbout({
                  prompt: `Convert “${seg.label}” to a smart list`,
                  answer: "I'll hand the filter to Qualifier — it keeps the same rules but refreshes membership live and can trigger playbooks on entry. The saved filter stays until you confirm.",
                  links: [{ label: "This segment", to: R.segment(seg.id) }],
                }) },
            { label: "Archive segment", icon: "x", danger: true, onClick: () => onArchive(seg) },
          ]} />
        </div>
      </div>

      {/* Draft approval loop */}
      {isDraft && (
        <div className="sg-draft-banner">
          <Icon name="sparkle" size={13} />
          <div className="sg-draft-body">
            <div className="sg-draft-title">Qualifier translated your description into rules</div>
            <div className="sg-draft-sub">Approve to activate — the list goes live, refreshes itself, and can feed broadcasts and playbooks.</div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => onDiscardDraft(seg)} {...window.gate("approve")}>Discard</button>
          <button className="btn btn-primary btn-sm" onClick={() => onApproveDraft(seg)} {...window.gate("approve")}><Icon name="check" size={12} /> Approve rules</button>
        </div>
      )}

      {/* Rules */}
      {notify && (
        <div className="sg-notify-note">
          <Icon name="bell" size={10} />
          Entry &amp; exit land in your bell · quiet hours respected · <button onClick={() => window.CHANLY.nav(CHANLY.R.admin("notifications"))}>notification settings</button>
        </div>
      )}
      <div className="sg-rules">
        {(meta ? meta.rules : []).map((r, i) => (
          <React.Fragment key={i}>
            {i > 0 && <span className="sg-rule-and">and</span>}
            <span className="sg-rule">
              <span className="f">{r.f}</span>
              <span className="o">{r.o}</span>
              <span className="v">{r.v}</span>
            </span>
          </React.Fragment>
        ))}
        <button className="sg-rule-add" onClick={() => window.askAbout && window.askAbout({ mode: "compose", prompt: `Add a rule to segment \u201c${seg.label}\u201d: ` })}>
          <Icon name="plus" size={10} /> Add rule
        </button>
        {(() => {
          const g = (window.SEG_GUARDRAILS || []).find(x => x.segId === seg.id);
          return g ? (
            <button className="fl-guard-link" data-tip={`${g.hint} — binds every agent and campaign touching this list · set in Settings › Autonomy`} onClick={() => window.CHANLY.nav(window.CHANLY.R.admin("autonomy"))}>
              <Icon name="shield" size={9} /> {g.label}: {g.value}
            </button>
          ) : null;
        })()}
      </div>

      {/* Stats */}
      <div className="sg-statrow">
        <div className="sg-stat">
          <div className="sg-stat-label">Members</div>
          <div className="sg-stat-value">
            {seg.count}
            {meta && <span className={`sg-stat-meta ${meta.deltaTone}`}>{meta.delta}</span>}
          </div>
        </div>
        <div className="sg-stat">
          <div className="sg-stat-label">8-week trend</div>
          <div className="sg-stat-spark">{meta && <Sparkline data={meta.trend} width={90} height={22} stroke="var(--ink-dim)" />}</div>
        </div>
        <div className="sg-stat">
          <div className="sg-stat-label">Refresh</div>
          <div className="sg-stat-value" style={{ fontSize: 13 }}>
            {meta ? (paused ? "Paused" : meta.cadence) : "Manual"}
            <span className="sg-stat-meta">{paused ? "holds current members" : meta ? meta.refreshed : ""}</span>
          </div>
        </div>
        <div className="sg-stat">
          <div className="sg-stat-label">In use by</div>
          <div className="sg-stat-value" style={{ fontSize: 13 }}>
            {usage.length > 0 ? `${usage.length} surface${usage.length === 1 ? "" : "s"}` : "Nothing yet"}
          </div>
        </div>
      </div>

      {/* Usage */}
      <div className="sg-sec">
        <div className="sg-sec-head">
          <span className="sg-sec-title">Where this segment works</span>
          <span className="sg-sec-sub">Removing it here pauses those runs</span>
        </div>
        <div className="sg-usage">
          {usage.length > 0 ? usage.map((u, i) => (
            <button key={i} className="sg-usage-row" onClick={() => window.CHANLY.nav(u.to ? u.to : u.kind === "broadcast" ? R.broadcast(seg.id) : u.kind === "outbound" ? "outbound" : "fleet")}>
              <Icon name={u.icon} size={13} />
              <span className="grow">{u.label}</span>
              {u.draft && <span className="pill">Draft</span>}
              <Icon name="arrow-right" size={11} />
            </button>
          )) : (
            <div className="sg-usage-empty">
              <span>Not wired to any broadcast or agent playbook yet.</span>
              <span className="sg-usage-empty-ctas">
                <AssignAgentMenu seg={seg} onAssign={onAssign} />
                <button className="btn btn-sm" onClick={() => window.CHANLY.nav(isLead ? "outbound" : R.broadcast(seg.id))}>
                  <Icon name={isLead ? "bolt" : "wave"} size={12} /> {isLead ? "Use in outbound" : "Use in broadcast"}
                </button>
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Broadcast history to this list */}
      {broadcasts.length > 0 && (
        <div className="sg-sec">
          <div className="sg-sec-head">
            <span className="sg-sec-title">Broadcasts to this list</span>
            <span className="sg-sec-sub">{broadcasts.length} send{broadcasts.length === 1 ? "" : "s"}</span>
          </div>
          <div className="sg-usage">
            {broadcasts.map((h, i) => (
              <button key={i} className="sg-usage-row" onClick={() => window.CHANLY.nav(R.broadcast(seg.id))}>
                <Icon name="wave" size={13} />
                <span className="grow">{h.name}<span className="sg-hist-date"> · {h.date}</span></span>
                <span className="sg-hist-meta tabular">{h.sent} sent · {h.replies} replies{h.booked !== "—" ? ` · ${h.booked}` : ""}</span>
                <Icon name="arrow-right" size={11} />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Member preview */}
      <div className="sg-sec sg-members">
        <div className="sg-sec-head">
          <span className="sg-sec-title">Member preview</span>
          <span className="sg-sec-sub">{members.length} of {seg.count} shown · live match{(() => { const h = members.filter((m) => !window.CHANLY.canMessage(m.id)).length; return h ? ` · ${h} held from sends — no consent/DNC` : ""; })()}</span>
        </div>
        <div className="cl-table-wrap">
          <table className="cl-table">
            <thead>
              <tr><th>Client</th><th>Matched on</th><th>Temperature</th><th className="num">LTV</th></tr>
            </thead>
            <tbody>
              {members.map(m => m.leadRec ? (
                <tr key={m.id} onClick={() => window.CHANLY.nav("leads")}>
                  <td>
                    <div className="cl-row-name">
                      <div className="ix-thread-avatar" data-priority={m.leadRec.priority}>{m.leadRec.initials}</div>
                      <div className="cl-row-name-block">
                        <div className="cl-row-fullname">{m.leadRec.name}</div>
                        <div className="cl-row-meta">
                          <span className="cl-row-channels"><ChannelGlyph kind={m.leadRec.channel} primary size={11} /></span>
                          <span className="dot" />
                          <span>lead · {m.leadRec.stage}</span>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td><span className="sg-matched">{m.matchedOn}</span></td>
                  <td className="shrink">
                    {m.leadRec.fit != null ? (
                      <div className="cl-temp-cell">
                        <TempBar value={m.leadRec.fit} sizeClass="bar-md" />
                        <span className="cl-temp-num">{Math.round(m.leadRec.fit * 100)}</span>
                      </div>
                    ) : <span className="sg-matched">scoring…</span>}
                  </td>
                  <td className="num">{m.leadRec.estValue != null ? `$${m.leadRec.estValue.toLocaleString()}` : "—"}</td>
                </tr>
              ) : (
                <tr key={m.id} onClick={() => window.CHANLY.nav(window.CHANLY.R.client(m.client.id))}>
                  <td>
                    <div className="cl-row-name">
                      <div className="ix-thread-avatar" data-priority={m.client.priority}>{m.client.initials}</div>
                      <div className="cl-row-name-block">
                        <div className="cl-row-fullname">{m.client.name}</div>
                        <div className="cl-row-meta">
                          <span className="cl-row-channels">
                            {m.client.channels.map((ch, i) => <ChannelGlyph key={i} kind={ch} primary={ch === m.client.primaryChannel} size={11} />)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td><span className="sg-matched">{m.matchedOn}</span></td>
                  <td className="shrink">
                    <div className="cl-temp-cell">
                      <TempBar value={m.client.temp} sizeClass="bar-md" />
                      <span className="cl-temp-num">{Math.round(m.client.temp * 100)}</span>
                    </div>
                  </td>
                  <td className="num">${(m.client.ltv || 0).toLocaleString()}</td>
                </tr>
              ))}
              {members.length === 0 && (
                <tr><td colSpan={4}>
                  <div className="cl-table-empty"><Icon name="clock" size={14} /><span>Draft — Qualifier is scanning the book for matches.</span></div>
                </td></tr>
              )}
            </tbody>
          </table>
          <div className="cl-table-foot">
            <span>{isLead ? "Full list lives in Leads" : "Full list opens in Clients, filtered"}</span>
            <button className="cl-bucket-link" onClick={() => window.CHANLY.nav(isLead ? "leads" : window.CHANLY.R.clientSeg(seg.id))}>
              {isLead ? "Open Leads" : "Open in Clients"} <Icon name="arrow-right" size={10} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ---- Page -------------------------------------------------------------------
const SG_NOTIFY_KEY = "chanlytics-seg-notify";
const sgLoadNotify = () => {
  try {
    const raw = localStorage.getItem(SG_NOTIFY_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return { "drifting-vips": true, "high-no-show": true, "lapsed-60": true };
};

const SegmentsPage = ({ initialId = null }) => {
  const [extra, setExtra] = useSgState(() => [...window.SG_STORE.extra]);          // user-drafted segments (survive nav)
  const [archived, setArchived] = useSgState(() => ({ ...window.SG_STORE.archived }));    // segId -> true (session)
  const [approved, setApproved] = useSgState(() => ({ ...window.SG_STORE.approved }));    // draftId -> activation payload
  const [pausedMap, setPausedMap] = useSgState({});  // segId -> true (auto-refresh paused)
  const [toastNode, flash] = window.usePPToast();
  const [activeId, setActiveId] = useSgState(() =>
    (CLIENT_SEGMENTS.some(s => s.id === initialId) ? initialId : "drifting-vips"));

  useSgEffect(() => {
    if (initialId && CLIENT_SEGMENTS.some(s => s.id === initialId)) setActiveId(initialId);
  }, [initialId]);

  // Guardrail edits in Settings reflect here instantly (same matrix as Fleet)
  const [, setSgTick] = useSgState(0);
  useSgEffect(() => {
    const bump = () => setSgTick(n => n + 1);
    window.addEventListener("guardrails:changed", bump);
    return () => window.removeEventListener("guardrails:changed", bump);
  }, []);

  const all = useSgMemo(() => {
    const merged = [...CLIENT_SEGMENTS, ...extra]
      .filter(s => !archived[s.id])
      .map(s => approved[s.id] ? { ...s, ...approved[s.id], draft: false } : s);
    // Belt-and-braces: dedupe by id — an approved draft lives in CLIENT_SEGMENTS
    const seen = new Set();
    return merged.filter(s => seen.has(s.id) ? false : (seen.add(s.id), true));
  }, [extra, archived, approved]);
  const smart = all.filter(s => s.kind === "agent");
  const manual = all.filter(s => s.kind === "manual");
  const leadLists = all.filter(s => s.kind === "lead");
  const active = all.find(s => s.id === activeId) || all[0];
  const meta = (approved[active?.id] && approved[active.id].liveMeta) || SEGMENT_META[active?.id] || (active?.draftMeta || null);
  const [extraUsage, setExtraUsage] = useSgState(() => ({ ...(window.SG_STORE.usage || {}) }));
  const [notifyMap, setNotifyMap] = useSgState(sgLoadNotify);
  const toggleNotify = () => {
    if (!active) return;
    setNotifyMap(m => {
      const next = { ...m, [active.id]: !m[active.id] };
      try { localStorage.setItem(SG_NOTIFY_KEY, JSON.stringify(next)); } catch (e) {}
      return next;
    });
  };

  // Pointing an agent at a list writes a REAL draft playbook into Fleet
  // (FLEET_PLAYBOOKS — sanctioned mutation) so the promise survives navigation.
  const assignAgent = (a) => {
    if (!active) return;
    const segId = active.id;
    const pbId = `pb-${segId}-${Date.now() % 100000}`;
    const pb = { id: pbId, name: `${active.label} · new playbook`, segId, status: "draft", note: "Drafted from Segments — ask-first until you promote it" };
    window.FLEET_PLAYBOOKS = window.FLEET_PLAYBOOKS || {};
    (window.FLEET_PLAYBOOKS[a.id] = window.FLEET_PLAYBOOKS[a.id] || []).unshift(pb);
    window.dispatchEvent(new CustomEvent("fleet:playbooks", { detail: { agentId: a.id, pbId, added: true } }));
    setExtraUsage(u => {
      const next = { ...u, [segId]: [
        { kind: "agent", label: `${a.name} · new playbook on this list`, icon: "agents", to: window.CHANLY.R.agent(a.id), draft: true, pbId, agentId: a.id },
        ...(u[segId] || []),
      ] };
      window.SG_STORE.usage = next;
      return next;
    });
    const undoPb = () => {
      window.FLEET_PLAYBOOKS[a.id] = (window.FLEET_PLAYBOOKS[a.id] || []).filter(p => p.id !== pbId);
      window.dispatchEvent(new CustomEvent("fleet:playbooks", { detail: { agentId: a.id, pbId, added: false } }));
      setExtraUsage(u => { const next = { ...u, [segId]: (u[segId] || []).filter(r => r.pbId !== pbId) }; window.SG_STORE.usage = next; return next; });
    };
    flash({
      msg: <><b>{a.name}</b> pointed at “{active.label}” — a draft playbook is in Fleet, ask-first until you promote it</>,
      undo: undoPb,
      links: [{ label: "Open in Fleet", to: window.CHANLY.R.agent(a.id) }],
    });
  };

  const duplicateSeg = (seg) => {
    const id = `${seg.id}-copy-${Date.now() % 10000}`;
    const copy = { ...seg, id, label: `${seg.label} (copy)`, kind: seg.kind === "lead" ? "lead" : "manual", draft: false,
      query: seg.query, draftMeta: SEGMENT_META[seg.id] ? { ...SEGMENT_META[seg.id], usedBy: [] } : seg.draftMeta };
    setExtra(x => [...x, copy]);
    setActiveId(id);
    flash({
      msg: <><b>{seg.label}</b> duplicated — the copy is yours to edit; rules detach from the original</>,
      undo: () => { setExtra(x => x.filter(s => s.id !== id)); setActiveId(seg.id); },
    });
  };

  const archiveSeg = (seg) => {
    setArchived(m => { const next = { ...m, [seg.id]: true }; window.SG_STORE.archived = next; return next; });
    const next = all.find(s => s.id !== seg.id);
    if (next) setActiveId(next.id);
    flash({
      msg: <><b>{seg.label}</b> archived — broadcasts and playbooks using it pause</>,
      undo: () => { setArchived(m => { const n = { ...m }; delete n[seg.id]; return n; }); setActiveId(seg.id); },
    });
  };

  const togglePause = () => {
    if (!active) return;
    const segId = active.id;
    const was = !!pausedMap[segId];
    setPausedMap(m => ({ ...m, [segId]: !was }));
    flash({
      msg: <><b>{active.label}</b> {was ? "resumed — Qualifier refreshes it live again" : "paused — membership frozen until you resume"}</>,
      undo: () => setPausedMap(m => ({ ...m, [segId]: was })),
    });
  };

  // Draft approval: Qualifier "finds" members from the warmest clients.
  // Persists: CLIENT_SEGMENTS + SEGMENT_META gain the list (sanctioned pattern),
  // so Broadcasts targeting and Fleet pickers see it after navigation too.
  const approveDraft = (seg) => {
    if (!window.canDo("approve")) return;
    const pool = (window.CLIENTS || []).filter(c => c.temp >= 0.5).slice(0, 6);
    const liveMeta = {
      ...(seg.draftMeta || {}),
      definition: (seg.draftMeta ? seg.draftMeta.definition.replace(" — Qualifier translated this to rules; approve to activate.", "") : seg.query) + " — live, auto-refreshing.",
      trend: [0, 0, 0, 0, 0, 2, 4, pool.length],
      delta: `+${pool.length} on activation`, deltaTone: "pos",
      refreshed: "just now", cadence: "Live",
      members: pool.map(c => ({ id: c.id, matchedOn: "matched on activation" })),
    };
    setApproved(a => {
      const next = { ...a, [seg.id]: { count: pool.length, query: "live · rules approved", liveMeta } };
      window.SG_STORE.approved = next;
      return next;
    });
    // Global writeback — the list exists beyond this page
    if (!(window.CLIENT_SEGMENTS || []).some(s => s.id === seg.id)) {
      window.CLIENT_SEGMENTS.push({ id: seg.id, label: seg.label, count: pool.length, kind: "agent", agent: "Qualifier", query: "live · rules approved" });
      window.SEGMENT_META[seg.id] = liveMeta;
    }
    // Remove the draft from BOTH the store and page state — leaving it in
    // `extra` duplicated the row (CLIENT_SEGMENTS + extra both carry the id)
    // and later setExtra writebacks would re-persist the stale copy.
    setExtra(x => {
      const next = x.filter(s => s.id !== seg.id);
      window.SG_STORE.extra = next;
      return next;
    });
    flash({
      msg: <><b>{seg.label}</b> is live — Qualifier found {pool.length} matches and keeps the list fresh</>,
      links: [{ label: "Use in broadcast", to: window.CHANLY.R.broadcast(seg.id) }],
    });
  };

  const discardDraft = (seg) => {
    setExtra(x => {
      const next = x.filter(s => s.id !== seg.id);
      window.SG_STORE.extra = next;
      return next;
    });
    setActiveId("drifting-vips");
    flash({
      msg: <>Draft discarded — nothing was activated</>,
      undo: () => {
        setExtra(x => { const next = [...x, seg]; window.SG_STORE.extra = next; return next; });
        setActiveId(seg.id);
      },
    });
  };

  const onBuilt = (desc) => {
    const id = `sg-draft-${Date.now()}`;
    const label = desc.length > 34 ? desc.slice(0, 34).trim() + "…" : desc;
    const rules = sgParseRules(desc);
    const draft = {
      id, label, count: 0, kind: "agent", agent: "Qualifier",
      query: "draft · rules pending your review", draft: true,
      draftMeta: {
        definition: `${desc} — Qualifier translated this to ${rules.length} rule${rules.length === 1 ? "" : "s"}; approve to activate.`,
        rules,
        trend: [0, 0, 0, 0, 0, 0, 0, 0], delta: "scanning…", deltaTone: "",
        refreshed: "just now", cadence: "Live",
        usedBy: [],
        members: [],
      },
    };
    setExtra(x => { const next = [...x, draft]; window.SG_STORE.extra = next; return next; });
    setActiveId(id);
  };

  return (
    <div className="sg-page" data-screen-label="Segments">
      <aside className="sg-list">
        <div className="sg-list-head">
          <div className="sg-list-title">Segments</div>
          <div className="sg-list-sub">
            {all.length} lists · {all.filter(s => (SEGMENT_META[s.id] ? SEGMENT_META[s.id].usedBy.length > 0 : false) || (extraUsage[s.id] || []).length > 0).length} in active use · {all.filter(s => s.kind === "agent" && !s.draft && !pausedMap[s.id]).length} auto-refresh
          </div>
        </div>

        <SegmentComposer onBuilt={onBuilt} />

        <div className="sg-group">
          <div className="sg-group-label"><Icon name="sparkle" size={10} />Smart lists — agent-built</div>
          {smart.map(s => (
            <SegmentRow key={s.id} seg={s} meta={SEGMENT_META[s.id] || s.draftMeta} active={active && active.id === s.id} onPick={setActiveId} />
          ))}
        </div>
        <div className="sg-group">
          <div className="sg-group-label"><Icon name="bolt" size={10} />Lead lists — feeding outbound</div>
          {leadLists.map(s => (
            <SegmentRow key={s.id} seg={s} meta={SEGMENT_META[s.id]} active={active && active.id === s.id} onPick={setActiveId} />
          ))}
        </div>
        <div className="sg-group" style={{ paddingBottom: 16 }}>
          <div className="sg-group-label">Saved filters — yours</div>
          {manual.map(s => (
            <SegmentRow key={s.id} seg={s} meta={SEGMENT_META[s.id]} active={active && active.id === s.id} onPick={setActiveId} />
          ))}
        </div>
      </aside>

      <div className="sg-detail">
        <SegmentDetail
          seg={active}
          meta={meta}
          extraUsage={extraUsage[active?.id] || []}
          onAssign={assignAgent}
          onDuplicate={duplicateSeg}
          onArchive={archiveSeg}
          onApproveDraft={approveDraft}
          onDiscardDraft={discardDraft}
          paused={!!(active && pausedMap[active.id])}
          onTogglePause={togglePause}
          flash={flash}
          notify={!!(active && notifyMap[active.id])}
          onToggleNotify={toggleNotify}
        />
      </div>

      {toastNode}
    </div>
  );
};

// ---- Segment Pulse (Today brief digest) --------------------------------------
// Overnight list movement: who entered/left which segment, with the suggested move.
const SegmentPulse = () => {
  const moves = window.SEG_MOVEMENT || [];
  const segOf = (id) => window.CHANLY.seg(id);
  if (!moves.length) return null;
  return (
    <section className="fl-card sp-card">
      <div className="fl-card-head">
        <span className="fl-card-title">List movement</span>
        <span className="fl-card-sub">overnight · segments drive the playbooks</span>
        <button className="cl-bucket-link" style={{ marginLeft: "auto" }} onClick={() => window.CHANLY.nav("segments")}>
          All segments <Icon name="arrow-right" size={10} />
        </button>
      </div>
      <div className="sp-rows">
        {moves.map((m, i) => {
          const s = segOf(m.segId);
          return (
            <div key={i} className="sp-row">
              <span className={`sp-dir ${m.dir}`}>{m.dir === "in" ? `+${m.count}` : `−${m.count}`}</span>
              <span className="sp-body">
                <button className="sp-seg" onClick={() => window.CHANLY.nav(CHANLY.R.segment(m.segId))}>{s ? s.label : m.segId}</button>
                <span className="sp-who"> — {m.who}</span>
                <span className="sp-note">{m.note}</span>
              </span>
              <button className="btn btn-ghost btn-sm" onClick={() => window.CHANLY.nav(m.action.to)}>
                {m.action.label} <Icon name="arrow-right" size={10} />
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
};

// A real workspace renders its lists (segments-real.jsx); the seeded page keeps the demo.
window.SegmentsSeed = SegmentsPage;
// The demo's page under the name the shell draws. A real workspace never reaches it: its lists live on People, and
// `segments/<id>` lands there with the list picked (app-shell, window.__listRoute).
window.SegmentsPage = SegmentsPage;
window.SegmentPulse = SegmentPulse;
