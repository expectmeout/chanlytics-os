/* global React, Icon, EmptyState, FailedRead */
// Chanlytics — Settings › Activity: what happened in the workspace, and who did it.
//
// Both ledgers -- the decisions people (and the receptionist, and the system)
// made, and the events that happened -- have existed since the first slice and
// were readable by an owner only inside one person's timeline. This is the
// page: newest first, in the words the route gives (contracts activityWords),
// filtered by a person, a kind and a day. It decides nothing and shows nothing
// of a payload beyond the sentence; the evidence families are hidden unless
// asked for by name.

// When, by the business's clock (window.__clock): the time today, the date and the time before it.
const ACT_WHEN = (iso) => (iso ? window.__clock.stamp(Date.parse(iso)) : "—");

const ActivityRow = ({ r, actors }) => {
  const who = r.actor_user_id ? (actors[r.actor_user_id] || "A member") : r.actor_type === "ai" ? "Receptionist" : r.source === "event" ? "" : "System";
  const to =
    r.subject_type === "contact" && r.subject_id ? `clients/${r.subject_id}`
    : r.subject_type === "conversation" && r.subject_id ? `inbox/th-${r.subject_id}`
    : r.subject_type === "call" && r.subject_id ? `conversations/cv-${r.subject_id}`
    : null;
  return (
    <div className="cl-prof-attr act-row" data-testid="act-row">
      <span className="cl-prof-attr-key tabular">{ACT_WHEN(r.at)}</span>
      <span className="cl-prof-attr-val">
        {who && <b>{who} · </b>}{r.text}
        {to && <> <button className="cl-bucket-link" onClick={() => window.CHANLY.nav(to)}>Open</button></>}
      </span>
    </div>
  );
};

const PaneActivity = () => {
  const A = window.__activity;
  // The log is an owner's (GET activity asks for one): the same reach as taking the workspace's data away, so it asks
  // the export gate, which narrows under an owner's View-as as the signed-in role it asked before did not.
  const may = window.canDo("export");
  // What is typed in the kind box, and the kind the log is read for. A kind is asked for when it is picked from the
  // list, on Enter, or when the box is left, never on every keystroke (S21).
  const [kindTyped, setKindTyped] = React.useState("");
  const [kind, setKind] = React.useState("");
  const [day, setDay] = React.useState("");
  const [person, setPerson] = React.useState(null); // { id, name }
  const [personQ, setPersonQ] = React.useState("");
  const [matches, setMatches] = React.useState([]);
  const [st, setSt] = React.useState({ loading: true, rows: [], actors: {}, kinds: [], hasMore: false, error: null });

  // Each read is numbered, and an answer that is not the latest one asked for lands nowhere: a slow first page cannot
  // replace the filter picked after it.
  const asked = React.useRef(0);
  const load = React.useCallback(async (offset = 0, append = false) => {
    if (!A) return;
    const mine = ++asked.current;
    setSt((c) => ({ ...c, loading: true, error: null }));
    const r = await A.list({ kind: kind || undefined, day: day || undefined, person: person ? person.id : undefined, offset: offset || undefined });
    if (mine !== asked.current) return;
    if (!r.ok) { setSt((c) => ({ ...c, loading: false, error: r.message || "Could not be read right now." })); return; }
    setSt((c) => ({ loading: false, error: null, rows: append ? [...c.rows, ...r.data.rows] : r.data.rows, actors: { ...c.actors, ...r.data.actors }, kinds: r.data.kinds, hasMore: r.data.page.has_more }));
  }, [A, kind, day, person]);
  React.useEffect(() => { if (may) load(0, false); }, [load, may]);
  const chooseKind = (typed) => setKind(typed.trim());
  React.useEffect(() => {
    if (!A || !personQ.trim()) { setMatches([]); return undefined; }
    let on = true;
    const t = setTimeout(() => { A.people(personQ.trim()).then((m) => { if (on) setMatches(m); }); }, 250);
    return () => { on = false; clearTimeout(t); };
  }, [A, personQ]);

  if (!may) {
    return (
      <section className="fl-card set-card" data-testid="set-activity">
        <span className="cl-prof-aut-hint">Only an owner can read the activity log: it is the whole record of the workspace, including what every member did.</span>
      </section>
    );
  }
  if (!A) {
    return (
      <section className="fl-card set-card" data-testid="set-activity">
        <EmptyState kind="line" title="The activity log can't be read on this page." testid="act-missing" />
      </section>
    );
  }
  return (
    <section className="fl-card set-card" data-testid="set-activity">
      <div className="fl-card-head">
        <span className="fl-card-title">Activity</span>
        <span className="fl-card-sub">What happened, and who did it · newest first</span>
      </div>
      {/* The three filters are the settings input: they had no class, so they were the browser's own boxes. */}
      <div className="set-filters">
        <input
          className="set-input"
          list="act-kinds"
          placeholder="Any kind"
          aria-label="Kind of activity"
          value={kindTyped}
          onChange={(e) => { const v = e.target.value; setKindTyped(v); if (!v.trim() || st.kinds.includes(v.trim())) chooseKind(v); }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); chooseKind(kindTyped); } }}
          onBlur={() => chooseKind(kindTyped)}
          data-testid="act-kind"
        />
        <datalist id="act-kinds">{st.kinds.map((k) => <option key={k} value={k} />)}</datalist>
        <input className="set-input" type="date" aria-label="Day" value={day} onChange={(e) => setDay(e.target.value)} data-testid="act-day" />
        {person
          ? <span className="cl-seg-filter" data-testid="act-person"><Icon name="user" size={10} />{person.name}<button className="cl-seg-filter-x" aria-label={`Everyone, not only ${person.name}`} onClick={() => setPerson(null)}><Icon name="x" size={9} /></button></span>
          : (
            <span className="set-filter-person">
              <input className="set-input" placeholder="A person, by name or number" aria-label="A person, by name or number" value={personQ} onChange={(e) => setPersonQ(e.target.value)} data-testid="act-person-q" />
              {matches.length > 0 && (
                <div className="cl-prof-autonomy" style={{ flexWrap: "wrap" }}>
                  {matches.map((m) => <button key={m.id} className="cl-prof-aut-seg" onClick={() => { setPerson(m); setPersonQ(""); setMatches([]); }}>{m.name}</button>)}
                </div>
              )}
            </span>
          )}
      </div>
      {st.error && <FailedRead kind="line" what="the activity log" why={st.error} onRetry={() => load(0, false)} busy={st.loading} testid="act-failed" />}
      {st.loading && st.rows.length === 0 && !st.error && <div className="cl-prof-aut-hint" role="status" data-testid="act-loading">Reading the activity log…</div>}
      <div className="cl-prof-attr-list" data-testid="act-rows">
        {st.rows.map((r) => <ActivityRow key={r.id} r={r} actors={st.actors} />)}
        {!st.loading && st.rows.length === 0 && !st.error && <EmptyState kind="line" title="Nothing here for that." action={kind || day || person ? { label: "Clear the filters", onClick: () => { setKind(""); setKindTyped(""); setDay(""); setPerson(null); } } : null} />}
      </div>
      {st.hasMore && <button className="btn btn-ghost btn-sm" disabled={st.loading} onClick={() => load(st.rows.length, true)} data-testid="act-more">{st.loading ? "Loading…" : "Show more"}</button>}
      <p className="set-card-foot">Model usage, webhook receipts and unplaced messages are kept. Name a kind to see them.</p>
    </section>
  );
};

window.PaneActivity = PaneActivity;
