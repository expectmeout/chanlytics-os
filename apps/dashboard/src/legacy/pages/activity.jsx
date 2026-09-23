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

// A line says its time; the day it belongs to is said once, above the lines.
const ACT_MS = (iso) => { const ms = iso ? Date.parse(iso) : NaN; return Number.isNaN(ms) ? null : ms; };
const ACT_TIME = (iso) => { const ms = ACT_MS(iso); return ms === null ? "—" : window.__clock.time(ms); };
const ACT_DAY_KEY = (iso) => { const ms = ACT_MS(iso); return ms === null ? "?" : window.__clock.dayKey(ms); };
// "Today · Sep 17" · "Yesterday · Sep 16" · "Sep 15", as the product words a day
// above the rows that belong to it (contracts clockDayLabel).
const ACT_DAY = (iso) => { const ms = ACT_MS(iso); return ms === null ? "Undated" : window.__clock.dayLabel(ms); };

// What kind of thing happened, as a glyph: an event's family (message.sent →
// message) or a decision's verb. A kind nothing here names gets a plain dot,
// which is the honest answer and still lines the rows up.
const ACT_FAMILY = {
  message: "chat", conversation: "chat", contact: "user", call: "phone", voice: "phone", line: "phone",
  google: "star", billing: "money", settings: "settings", business: "home", workspace: "home", setup: "flag",
  policy: "shield", platform: "shield", broadcast: "bolt", playbook: "bolt", mailbox: "mail",
  usage: "trending-up", webhook: "bolt", ingest: "alert",
};
const ACT_VERB = {
  approve: "check", resolve: "check", edit: "edit", decline: "x", cancel_send: "x",
  snooze: "clock", wake: "clock", archive: "content",
  take_over: "chat", hand_back: "chat", reply: "chat",
  pause_agent: "pause", resume_agent: "play",
  invite: "users", revoke_invite: "users", change_role: "users", remove_member: "users",
  erase: "user", consent_change: "user", whisper: "phone", end_call: "phone",
  connect_channel: "external", send_broadcast: "bolt", cancel_broadcast: "bolt",
  start_playbook: "bolt", pause_playbook: "bolt", reply_review: "star", export: "arrow-down",
};
const ACT_GLYPH = (kind) => {
  const k = kind || "";
  const dot = k.indexOf(".");
  return (dot > 0 ? ACT_FAMILY[k.slice(0, dot)] : ACT_VERB[k]) || "dot";
};

const ActivityRow = ({ r, actors }) => {
  const who = r.actor_user_id ? (actors[r.actor_user_id] || "A member") : r.actor_type === "ai" ? "Receptionist" : r.source === "event" ? "" : "System";
  const to =
    r.subject_type === "contact" && r.subject_id ? `clients/${r.subject_id}`
    : r.subject_type === "conversation" && r.subject_id ? `inbox/th-${r.subject_id}`
    : r.subject_type === "call" && r.subject_id ? `conversations/cv-${r.subject_id}`
    : null;
  // The kind's tone (contracts activityTone) is said by the row's words where it is a warning or a failure; the node on
  // the spine is the neutral mark every row wears.
  const tone = window.__activity && window.__activity.tone ? window.__activity.tone(r.kind) : "plain";
  return (
    <div className="act-row" data-testid="act-row" data-tone={tone}>
      <span className="mark act-glyph" aria-hidden="true">
        <Icon name={ACT_GLYPH(r.kind)} size={13} />
      </span>
      <span className="act-when">{ACT_TIME(r.at)}</span>
      <span className="act-what">{who && <b>{who} · </b>}{r.text}</span>
      {to && <button className="cl-bucket-link act-open" onClick={() => window.CHANLY.nav(to)}>Open</button>}
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
  // What this tab read last time, painted at once. The read below replaces it
  // inside the time this pane used to spend showing a reader nothing: on the
  // salon's log it was 763ms of empty pane on the first visit and 433ms on the
  // fifth, for a hundred rows that had not changed.
  const [st, setSt] = React.useState(() => {
    const seed = A && A.peek ? A.peek({}) : null;
    const d = seed && seed.ok ? seed.data : null;
    return d
      ? { loading: true, rows: d.rows, actors: d.actors, kinds: d.kinds, next: d.page.next_cursor, hasMore: d.page.has_more, error: null }
      : { loading: true, rows: [], actors: {}, kinds: [], next: null, hasMore: false, error: null };
  });
  // On a phone the three boxes stand between a reader and the log, so they wait
  // behind one control until asked for. On a desktop the control is not drawn.
  const [asking, setAsking] = React.useState(false);

  // Each read is numbered, and an answer that is not the latest one asked for lands nowhere: a slow first page cannot
  // replace the filter picked after it.
  const asked = React.useRef(0);
  // A page asks for what is BEHIND the last row it was given, so reading the
  // tenth page costs what the first one did. It used to ask by offset, which
  // made the route read the whole log above the page and throw it away.
  const load = React.useCallback(async (cursor = null, append = false) => {
    if (!A) return;
    const mine = ++asked.current;
    setSt((c) => ({ ...c, loading: true, error: null }));
    const r = await A.list({ kind: kind || undefined, day: day || undefined, person: person ? person.id : undefined, cursor: cursor || undefined });
    if (mine !== asked.current) return;
    if (!r.ok) { setSt((c) => ({ ...c, loading: false, error: r.message || "Could not be read right now." })); return; }
    setSt((c) => ({ loading: false, error: null, rows: append ? [...c.rows, ...r.data.rows] : r.data.rows, actors: { ...c.actors, ...r.data.actors }, kinds: r.data.kinds, next: r.data.page.next_cursor, hasMore: r.data.page.has_more }));
  }, [A, kind, day, person]);
  React.useEffect(() => { if (may) load(null, false); }, [load, may]);
  const chooseKind = (typed) => setKind(typed.trim());
  const narrowed = [kind, day, person].filter(Boolean).length;
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
  // Where the day turns: the heading each row opens, or nothing when the row
  // above it was on the same day.
  const opens = [];
  const counts = [];
  let sameAs = null;
  let head = -1;
  for (let i = 0; i < st.rows.length; i++) {
    const key = ACT_DAY_KEY(st.rows[i].at);
    if (key === sameAs) {
      opens.push(null);
      counts[head] += 1;
    } else {
      opens.push(ACT_DAY(st.rows[i].at));
      counts.push(1);
      head = counts.length - 1;
      sameAs = key;
    }
  }
  // Which heading each row belongs to, so the heading can say its own count.
  const perDay = [];
  let n = -1;
  for (let i = 0; i < st.rows.length; i++) { if (opens[i]) n += 1; perDay.push(counts[n]); }

  return (
    <section className="fl-card set-card" data-testid="set-activity">
      <div className="fl-card-head">
        <h2 className="fl-card-title">Activity</h2>
        <span className="fl-card-sub">What happened, and who did it · newest first</span>
      </div>
      {/* The three filters are the settings input: they had no class, so they were the browser's own boxes. */}
      <button
        type="button"
        className="btn btn-ghost btn-sm set-filters-ask"
        aria-expanded={asking}
        onClick={() => setAsking((v) => !v)}
        data-testid="act-filters-ask"
      >
        <Icon name="filter" size={12} />
        Narrow it
        {narrowed > 0 && <span className="set-filters-ask-n">{narrowed}</span>}
      </button>
      <div className={`set-filters${asking ? " open" : ""}`}>
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
          ? <span className="chip" data-testid="act-person"><Icon name="user" size={10} />{person.name}<button className="chip-x" aria-label={`Everyone, not only ${person.name}`} onClick={() => setPerson(null)}><Icon name="x" size={9} /></button></span>
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
      {st.error && <FailedRead kind="line" what="the activity log" why={st.error} onRetry={() => load(null, false)} busy={st.loading} testid="act-failed" />}
      {/* Said whenever it is reading, not only on the first read: narrowing the
          log left the old rows on screen with nothing saying they were stale. */}
      {st.loading && !st.error && <div className="act-reading" role="status" data-testid="act-loading">Reading the activity log…</div>}
      {st.loading && st.rows.length === 0 && !st.error && (
        <div className="act-list act-waiting" aria-hidden="true">
          <div className="act-day"><span className="act-bone act-bone-day" /></div>
          {[68, 52, 61, 44, 57, 49, 63].map((w, i) => (
            <div className="act-row" key={i}>
              <span className="mark act-glyph" />
              <span className="act-when"><span className="act-bone" /></span>
              <span className="act-what"><span className="act-bone" style={{ width: `${w}%` }} /></span>
            </div>
          ))}
        </div>
      )}
      <div className="act-list" data-testid="act-rows">
        {st.rows.map((r, i) => (
          <React.Fragment key={r.id}>
            {opens[i] && (
              <div className="act-day">
                {opens[i]}
                <span className="act-day-n tally">{perDay[i]}</span>
              </div>
            )}
            <ActivityRow r={r} actors={st.actors} />
          </React.Fragment>
        ))}
        {!st.loading && st.rows.length === 0 && !st.error && <EmptyState kind="line" title="Nothing here for that." action={kind || day || person ? { label: "Clear the filters", onClick: () => { setKind(""); setKindTyped(""); setDay(""); setPerson(null); } } : null} />}
      </div>
      {st.hasMore && (
        <div className="act-more">
          <button className="btn btn-ghost btn-sm" disabled={st.loading} onClick={() => load(st.next, true)} data-testid="act-more">
            {st.loading ? "Reading…" : "Show more"}
          </button>
          <span className="act-so-far">{st.rows.length} so far</span>
        </div>
      )}
      <p className="set-card-foot">Model usage, webhook receipts and unplaced messages are kept. Name a kind to see them.</p>
    </section>
  );
};

window.PaneActivity = PaneActivity;
