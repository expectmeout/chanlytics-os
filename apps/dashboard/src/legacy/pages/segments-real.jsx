/* global React, Icon, Confirm */
// People › Lists, real: the lists kept by hand and the six that keep
// themselves current, with the people on each. Same facts as the People
// page (window.__PEOPLE, fed by the People surface); nothing here scores,
// estimates or builds a list from prose. A list's one onward step is a
// broadcast to the people on it who said yes.

const useListsSurface = () => {
  const [, bump] = React.useReducer((n) => n + 1, 0);
  React.useEffect(() => {
    window.addEventListener("surface:clients", bump);
    return () => window.removeEventListener("surface:clients", bump);
  }, []);
  return window.__PEOPLE;
};

const LS_NONE = [];
const lsKey = (kind, id) => `${kind}:${id}`;

// A list kept by hand, named here. The name is the only thing typed; people
// join from their profile. Opens on the shell's "New list" button too.
const NewListBox = ({ onCreate, openSignal }) => {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState(null);
  React.useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener("segments:new", show);
    return () => window.removeEventListener("segments:new", show);
  }, []);
  React.useEffect(() => { if (openSignal) setOpen(true); }, [openSignal]);
  const close = () => { setOpen(false); setName(""); setError(null); };
  const submit = async () => {
    const n = name.trim();
    if (!n || busy) return;
    setBusy(true); setError(null);
    const r = await onCreate(n);
    setBusy(false);
    if (!r.ok) { setError(r.message || "Could not make the list."); return; }
    close();
  };
  if (!open) {
    return (
      <div className="cl-rail-foot">
        <button className="cl-rail-newseg" onClick={() => setOpen(true)} data-testid="lists-new">
          <Icon name="plus" size={11} />
          New list
        </button>
      </div>
    );
  }
  return (
    <div className="cl-rail-foot">
      <div className="cl-rail-newlist">
        <input
          autoFocus
          value={name}
          placeholder="Name the list"
          maxLength={60}
          disabled={busy}
          data-testid="lists-new-name"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); if (e.key === "Escape") close(); }}
        />
        <button className="btn btn-sm btn-primary" disabled={busy || !name.trim()} onClick={submit}>Add</button>
      </div>
      {error && <div className="cl-rail-hint" style={{ color: "var(--danger)" }}>{error}</div>}
    </div>
  );
};

const ListsReal = ({ initialId = null }) => {
  const people = useListsSurface();
  const rows = people.rows || LS_NONE;
  const smart = people.lists || LS_NONE;
  const saved = people.saved || LS_NONE;
  const [toastNode, flash] = window.usePPToast();
  const canEdit = !!(window.__ME && (window.__ME.role === "owner" || window.__ME.role === "operator"));
  const [sel, setSel] = React.useState(() => {
    if (initialId && saved.some((s) => s.id === initialId)) return lsKey("saved", initialId);
    if (initialId && smart.some((l) => l.id === initialId)) return lsKey("list", initialId);
    return saved[0] ? lsKey("saved", saved[0].id) : smart[0] ? lsKey("list", smart[0].id) : null;
  });
  React.useEffect(() => {
    if (initialId && saved.some((s) => s.id === initialId)) setSel(lsKey("saved", initialId));
    else if (initialId && smart.some((l) => l.id === initialId)) setSel(lsKey("list", initialId));
  }, [initialId]); // eslint-disable-line react-hooks/exhaustive-deps
  const [renaming, setRenaming] = React.useState(null);
  const [arm, setArm] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const [kind, id] = sel ? sel.split(":") : [null, null];
  const current = kind === "saved" ? saved.find((s) => s.id === id) : kind === "list" ? smart.find((l) => l.id === id) : null;
  const memberIds = new Set(current ? current.ids : []);
  const members = rows.filter((p) => memberIds.has(p.id));
  // WHICH yes, on a page whose only button opens a broadcast. This counted the
  // CONVERSATIONAL answer and called it "said yes to offers", so a list of people
  // who had texted START looked ready to broadcast to and the composer refused
  // every one of them. Both are shown, because the gap between them is the thing
  // the owner needs to see: it is exactly who to go and ask.
  // Who a broadcast from here would REACH -- the route's own rule, so this count and
  // the audience the composer enrols are the same number. The answer alone left out
  // the number to send to. A missing rule shows nobody, which hides the button
  // rather than offering one that the route would refuse.
  const reach = window.__mayReceive;
  const offersYes = reach ? members.filter((p) => reach(p, "marketing")).length : 0;
  const messagesYes = members.filter((p) => p.consent.state === "opted_in").length;
  const label = current ? (kind === "saved" ? current.name : current.label) : "";

  const run = async (fn, msg) => {
    if (!window.__lists || busy) return null;
    setBusy(true);
    const r = await fn();
    setBusy(false);
    if (!r.ok) { flash({ tone: "danger", msg: <>{r.message || "Could not change the list."}</> }); return r; }
    if (msg) flash({ msg });
    return r;
  };
  const create = async (name) => {
    const r = await run(() => window.__lists.create(name), <><b>{name}</b> made — add people from their profile</>);
    if (r && r.ok && r.data && r.data.id) setSel(lsKey("saved", r.data.id));
    return r || { ok: false, message: "Lists are not available here." };
  };
  const rename = async () => {
    const n = (renaming || "").trim();
    if (!n || !current) return;
    const r = await run(() => window.__lists.rename(current.id, n), <>Renamed to <b>{n}</b></>);
    if (r && r.ok) setRenaming(null);
  };
  const remove = async () => {
    if (!current) return;
    const r = await run(() => window.__lists.remove(current.id), <><b>{label}</b> deleted — the people stay</>);
    setArm(false);
    if (r && r.ok) setSel(saved.filter((s) => s.id !== current.id)[0] ? lsKey("saved", saved.filter((s) => s.id !== current.id)[0].id) : smart[0] ? lsKey("list", smart[0].id) : null);
  };
  const drop = (p) => run(() => window.__lists.drop(current.id, [p.id]), <><b>{p.name}</b> is off <b>{label}</b></>);
  const useInBroadcast = () => window.CHANLY.nav(`broadcasts/${current.id}`);

  return (
    <div className="clients" data-testid="lists-real">
      <aside className="cl-rail">
        <div className="cl-rail-section" data-testid="lists-rail-saved">
          <div className="cl-rail-label">Kept by hand</div>
          {saved.map((s) => (
            <button key={s.id} className={`cl-rail-row ${sel === lsKey("saved", s.id) ? "active" : ""}`} onClick={() => { setSel(lsKey("saved", s.id)); setRenaming(null); setArm(false); }}>
              <span className="label">{s.name}</span>
              <span className="count">{s.count}</span>
            </button>
          ))}
          {saved.length === 0 && <div className="cl-rail-hint">No lists yet. Keep one by hand — regulars, one staff member's customers, a special group — and add people from their profile.</div>}
        </div>
        {canEdit && <NewListBox onCreate={create} />}
        <div className="cl-rail-section" data-testid="lists-rail-smart">
          <div className="cl-rail-label"><Icon name="sparkle" size={11} /> Keep themselves current</div>
          {smart.map((l) => (
            <button key={l.id} className={`cl-rail-row smart ${sel === lsKey("list", l.id) ? "active" : ""}`} onClick={() => { setSel(lsKey("list", l.id)); setRenaming(null); setArm(false); }}>
              <span className="label">{l.label}</span>
              <span className="count">{l.count}</span>
            </button>
          ))}
        </div>
      </aside>

      <div className="cl-main">
        <div className="cl-main-scroll">
        {!current && (
          <div className="cv-empty" data-testid="lists-empty">No list to show yet. Make one on the left.</div>
        )}
        {current && (
          <>
            <div className="cl-section-head" data-testid="lists-head">
              <div>
                {renaming === null ? (
                  <span className="cl-section-title">{label}</span>
                ) : (
                  <span className="cl-rail-newlist" style={{ display: "inline-flex" }}>
                    <input autoFocus value={renaming} maxLength={60} onChange={(e) => setRenaming(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") rename(); if (e.key === "Escape") setRenaming(null); }} data-testid="lists-rename" />
                    <button className="btn btn-sm btn-primary" disabled={busy || !renaming.trim()} onClick={rename}>Save</button>
                    <button className="cl-bucket-link" onClick={() => setRenaming(null)}>Cancel</button>
                  </span>
                )}
                <span className="cl-section-sub" style={{ marginLeft: 10 }}>
                  {members.length} {members.length === 1 ? "person" : "people"} · {offersYes} said yes to offers
                  {messagesYes > offersYes ? ` · ${messagesYes} said yes to messages` : ""}
                  {kind === "list" ? " · keeps itself current" : " · kept by hand"}
                </span>
              </div>
              <div className="bc-chips">
                {offersYes > 0 && (
                  <button className="btn btn-primary btn-sm" onClick={useInBroadcast} data-testid="lists-use-in-broadcast">
                    <Icon name="wave" size={11} /> Use in a broadcast
                  </button>
                )}
                {kind === "saved" && canEdit && renaming === null && (
                  <button className="btn btn-sm" onClick={() => setRenaming(label)}>Rename</button>
                )}
                {kind === "saved" && canEdit && !arm && (
                  <button className="btn btn-sm danger" onClick={() => setArm(true)} data-testid="lists-delete">Delete list…</button>
                )}
                {arm && (
                  <Confirm question={`Delete “${label}”?`} detail="The people stay." yes="Yes, delete" danger busy={busy} onYes={remove} onNo={() => setArm(false)} testid="lists-delete" />
                )}
              </div>
            </div>
            <div className="cl-table-wrap">
              <table className="cl-table" data-testid="lists-members">
                <thead>
                  <tr><th>Person</th><th>Offers</th><th>Last contact</th><th>State</th>{kind === "saved" && canEdit && <th />}</tr>
                </thead>
                <tbody>
                  {members.map((p) => (
                    <tr key={p.id} onClick={() => window.CHANLY.nav(`clients/${p.id}`)}>
                      <td>
                        <div className="cl-row-name">
                          <div className="ix-thread-avatar">{p.initials}</div>
                          <div className="cl-row-name-block">
                            <div className="cl-row-fullname">{p.name}</div>
                            {p.phone && p.phone !== p.name && <div className="cl-row-meta"><span>{p.phone}</span></div>}
                          </div>
                        </div>
                      </td>
                      <td className="shrink dim">{p.consent.label}</td>
                      <td className="shrink dim">{p.lastContact.label}</td>
                      <td className="shrink dim">{p.stateLabel}</td>
                      {kind === "saved" && canEdit && (
                        <td className="shrink">
                          <button className="cl-seg-filter-x" title={`Take ${p.name} off ${label}`} disabled={busy} onClick={(e) => { e.stopPropagation(); drop(p); }}>
                            <Icon name="x" size={9} />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                  {members.length === 0 && (
                    <tr><td colSpan={5}><div className="cl-table-empty">{kind === "saved" ? "Nobody on this list yet — add people from their profile." : "Nobody here right now."}</div></td></tr>
                  )}
                </tbody>
              </table>
            </div>
            {offersYes === 0 && members.length > 0 && (
              <div className="cl-prof-aut-hint" style={{ marginTop: 8 }}>
                {messagesYes > 0
                  ? <>Nobody on this list has said yes to OFFERS yet, so there is no one to send a promotion to — though {messagesYes === 1 ? "one of them has" : `${messagesYes} of them have`} said yes to messages about their own visit. Offers are a separate answer: record it under “Offers and news” on their profile, or get their yes with the phrase and QR on Broadcasts.</>
                  : <>Nobody on this list has said yes to offers yet, so there is no one to broadcast to. Record their answer on their profile, or get their yes with the phrase and QR on Broadcasts.</>}
              </div>
            )}
          </>
        )}
        </div>
      </div>
      {toastNode}
    </div>
  );
};

window.SegmentsPage = (props) => {
  const Seed = window.SegmentsSeed;
  if (window.__PEOPLE) return <ListsReal {...props} />;
  return Seed ? <Seed {...props} /> : null;
};
