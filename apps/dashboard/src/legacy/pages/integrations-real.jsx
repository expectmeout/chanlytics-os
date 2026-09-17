/* global React, Icon, Confirm, FailedRead */
// Chanlytics — Settings › Integrations, one row per connection.
//
// Every connection is the same row (contracts/connections.ts) computed from
// the surfaces already on the window — channels, Setup's facts, Google — so
// this pane fetches nothing of its own and cannot disagree with Setup.
// Three groups: Connected, Available, Later. "Later" is a row's state, not
// a list at the bottom.
//
// Split out of settings.jsx, which had grown to hold the settings shell,
// this pane, Google's card and the business form at once.

const VERB_TESTID = { "verb:google-check": "google-check", "verb:google-connect": "google-connect", "verb:google-disconnect": "google-disconnect", "verb:whatsapp-connect": "connect-whatsapp-btn", messages: "channel-messages" };
const mayPress = (verb) => !!verb && !!window.canDo && (verb.who === "owner" ? window.canDo("team") : window.canDo("approve"));
// What a connection's verb does, for the gate's sentence (contracts refusal.ts roleGate).
const VERB_DOING = { "verb:google-check": "read Google again", "verb:google-connect": "connect Google", "verb:google-disconnect": "disconnect Google", "verb:whatsapp-connect": "connect WhatsApp", "verb:business-record": "fill in the business record" };

// The connected account's locations, for the owner to choose among when
// Google returned more than one on Maps.
const GoogleChoose = ({ busy, setBusy, flash, onDisconnect }) => {
  const [places, setPlaces] = React.useState(null);
  React.useEffect(() => {
    if (!window.__google) return undefined;
    let on = true;
    window.__google.locations().then((r) => { if (on) setPlaces(r.ok ? r.locations : []); });
    return () => { on = false; };
  }, []);
  const owner = window.canDo ? window.canDo("team") : false;
  const choose = async (p) => {
    if (!window.__google || busy) return;
    setBusy(true);
    const r = await window.__google.choose(p.account_name, p.location_name);
    setBusy(false);
    flash({ tone: r.ok ? "ok" : "danger", msg: r.ok ? <><b>{p.title}</b> is your listing on Google{r.read ? " — every review is on Reports now" : " — the reviews follow within the hour"}.</> : <>{r.message}</> });
  };

  return (
    <div className="set-row set-row-stack" data-testid="google-choose">
      <div className="set-row-info">
        <span className="set-row-label">Which location is this workspace?</span>
        <span className="set-row-hint">{places === null ? "Reading the locations…" : places.length === 0 ? "No location on Google Maps could be read. Try again, or disconnect and connect the right account." : "Pick one; every review of it follows."}</span>
      </div>
      {places && places.length > 0 && (
        <div className="setup-places" data-testid="google-places">
          {places.map((p) => (
            <div key={`${p.account_name}/${p.location_name}`} className="setup-place" data-testid="google-place">
              <span className="setup-place-body">
                <span className="setup-place-name">{p.title}</span>
                <span className="setup-place-where">{p.address || "no address on Google"}{p.account_title ? ` · ${p.account_title}` : ""}</span>
              </span>
              <button className="btn btn-primary btn-sm" onClick={() => choose(p)} disabled={busy} data-testid="google-place-choose" {...window.gate("team", "choose the listing")}>This is it</button>
            </div>
          ))}
        </div>
      )}
      {/* It asks first, through the row's own Confirm, as the row's Disconnect does. It disconnected at once (S17). */}
      {owner && <button className="cl-bucket-link" onClick={onDisconnect} disabled={busy} data-testid="google-choose-disconnect">Disconnect instead</button>}
    </div>
  );
};

const ConnectionRow = ({ r, run, busy, arm, setArm, confirm }) => {
  const owner = window.canDo ? window.canDo("team") : false;
  const armed = arm && arm.kind === r.kind ? arm.what : null;
  const primary = r.state === "none" || r.state === "waiting_you";
  return (
    <div className="set-int-row" data-testid={`connection-${r.kind}`} data-state={r.state}>
      <span className={`st-tile ${r.group === "connected" ? "installed " : ""}set-int-tile`}><Icon name={r.icon} size={14} /></span>
      <span className="set-team-body">
        <span className="set-team-name">{r.title}{r.detail ? <span className="dim"> · {r.detail}</span> : null}</span>
        <span className="set-team-mail">{r.sentence}</span>
        {armed === "remove" && (
          <Confirm question="Remove the listing?" detail="What was read from it goes with it." yes="Yes, remove" danger busy={busy} onYes={() => confirm("remove")} onNo={() => setArm(null)} testid="google-remove" />
        )}
        {armed === "disconnect" && (
          <Confirm question="Disconnect Google?" detail="The public listing stays; replies and the full history do not." yes="Yes, disconnect" danger busy={busy} onYes={() => confirm("disconnect")} onNo={() => setArm(null)} testid="google-disconnect" />
        )}
      </span>
      <StatePill kind="tone" value={r.tone} label={<>{r.tone === "ok" && <span className="dot" />}{r.stateWords}</>} />
      <span className="set-int-actions">
        {r.kind === "google_listing" && owner && !armed && (r.state === "connected" || r.state === "attention") && (
          <button className="cl-bucket-link" onClick={() => setArm({ kind: r.kind, what: "remove" })} disabled={busy} data-testid="google-remove">Remove</button>
        )}
        {/* A verb the role may not press stays on the row and says why (window.gate);
            it used to be hidden, with no word. A page to open is anyone's to open. */}
        {r.verb && !armed && (
          r.verb.to.startsWith("verb:")
            ? <button className={`btn btn-sm${primary ? " btn-primary" : ""}`} onClick={() => run(r)} disabled={busy} data-testid={VERB_TESTID[r.verb.to] || `connection-${r.kind}-verb`} {...(mayPress(r.verb) || !window.gate ? {} : window.gate(r.verb.who === "owner" ? "team" : "approve", VERB_DOING[r.verb.to]))}>{busy && r.verb.to === "verb:google-check" ? "Reading…" : r.verb.label}</button>
            : <button className={primary ? "btn btn-sm btn-primary" : "cl-bucket-link"} onClick={() => window.CHANLY.nav(r.verb.to)} data-testid={VERB_TESTID[r.verb.to] || `connection-${r.kind}-verb`} title={r.kind === "whatsapp" ? "What the receptionist and your campaigns send on this number" : undefined}>{r.verb.label}</button>
        )}
      </span>
    </div>
  );
};

const PaneIntegrationsReal = () => {
  const [, tick] = React.useReducer((n) => n + 1, 0);
  React.useEffect(() => {
    const bump = () => tick();
    for (const ev of ["surface:settings", "surface:setup", "surface:google"]) window.addEventListener(ev, bump);
    return () => { for (const ev of ["surface:settings", "surface:setup", "surface:google"]) window.removeEventListener(ev, bump); };
  }, []);
  // Meta's door: asked once; `undefined` while asking, so the row says so.
  const [waCfg, setWaCfg] = React.useState(undefined);
  React.useEffect(() => {
    let on = true;
    const p = window.__waConnect ? window.__waConnect.config() : Promise.resolve(null);
    p.then((c) => { if (on) setWaCfg(c); }).catch(() => { if (on) setWaCfg(null); });
    return () => { on = false; };
  }, []);
  const [busy, setBusy] = React.useState(false);
  const [arm, setArm] = React.useState(null);
  // What the browser came back from Google with, said once.
  const [note, setNote] = React.useState(() => {
    const o = window.__google ? window.__google.outcome() : null;
    if (!o) return null;
    const W = window.__google.outcomeWords;
    return W[o.why || ""] || W[o.outcome] || (o.outcome === "error" ? `Google did not connect (${o.why || "unknown"}).` : null);
  });
  const [toastNode, flash] = window.usePPToast();
  const channels = window.__CHANNELS;

  if (channels === null) {
    return (
      <FailedRead kind="card" what="your connections" body="The receptionist keeps answering; this page just can't show the connections at the moment." surface="settings" testid="connections-connected" />
    );
  }

  const S = window.__SETUP;
  const G = window.__GOOGLE;
  // The workspace's own line: what a registration is filed for.
  const ownLine = ((S && S.dto.lines && S.dto.lines.rows) || []).find((l) => l.provider !== "carrier") || null;
  const rows = window.__connections.rows({
    channels: channels || [],
    whatsapp: waCfg,
    lines: { rows: (S && S.dto.lines && S.dto.lines.rows) || [], ready: !!(S && S.dto.lines && S.dto.lines.ready) },
    lineRequestedAt: S ? S.dto.requests.line : null,
    google: G ? { ready: G.dto.ready, listing: G.dto.listing, connection: G.dto.connection } : null,
    calendar: S ? S.dto.calendar : null,
  }, Date.now());

  const run = async (r) => {
    if (busy) return;
    switch (r.verb.to) {
      case "verb:whatsapp-connect": {
        if (!window.__waConnect) return;
        setBusy(true);
        const res = await window.__waConnect.start();
        setBusy(false);
        flash({ tone: res.ok ? "ok" : "danger", msg: res.ok ? <>WhatsApp {res.number || "number"} is connected — the receptionist answers on it now</> : <>{res.message}</> });
        return;
      }
      case "verb:google-connect":
        if (window.__google) window.__google.connect();
        return;
      case "verb:google-check": {
        if (!window.__google) return;
        setBusy(true);
        const res = await window.__google.refresh();
        setBusy(false);
        const news = res.fresh ? `${res.fresh} new review${res.fresh === 1 ? "" : "s"}` : res.counted ? `${res.counted} new rating${res.counted === 1 ? "" : "s"}` : "";
        flash({ tone: res.ok ? "ok" : "danger", msg: res.ok ? (news ? <>Read just now — {news}. The bell has {res.fresh === 1 || (!res.fresh && res.counted === 1) ? "it" : "them"}.</> : <>Read just now — nothing new since the last read.</>) : <>{res.message}</> });
        return;
      }
      case "verb:google-disconnect":
        setArm({ kind: r.kind, what: "disconnect" });
        return;
      case "verb:business-record":
        // The form is the row's own body; the verb only points at it.
        document.querySelector('[data-testid="business-record"]')?.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      default:
        return;
    }
  };
  const confirm = async (what) => {
    if (!window.__google || busy) return;
    setBusy(true);
    const res = what === "remove" ? await window.__google.unlink() : await window.__google.disconnect();
    setBusy(false);
    setArm(null);
    flash(res.ok
      ? { msg: what === "remove" ? <>The listing is off the record, with what was read from it{G && G.dto.connection ? " — and the Business Profile is disconnected" : ""}.</> : <>Google is disconnected. The public listing stays; replies and the full history do not.</> }
      : window.refusalToast(res, what === "remove" ? "Listing not removed" : "Google not disconnected"));
  };

  const W = window.__connections.groupWords;
  const groups = ["connected", "available", "later"].map((g) => ({ g, rows: rows.filter((r) => r.group === g) }));
  return (
    <>
      {groups.map(({ g, rows: list }) => (
        <section key={g} className="fl-card set-card set-conn" data-testid={`connections-${g}`}>
          <div className="fl-card-head">
            <span className="fl-card-title">{W[g].title}</span>
            <span className="fl-card-sub">{list.length ? W[g].sub(list) : "nothing yet"}</span>
          </div>
          {note && list.some((r) => r.kind === "google_profile") && (
            <div className="set-row" data-testid="google-note">
              <div className="set-row-info"><span className="set-row-hint">{note}</span></div>
              <button className="cl-bucket-link" onClick={() => setNote(null)}>Ok</button>
            </div>
          )}
          {list.length === 0 && g === "connected" && (
            <div className="set-row"><div className="set-row-info"><span className="set-row-hint">Nothing is connected yet — start below.</span></div></div>
          )}
          {list.map((r) => (
            <React.Fragment key={r.kind}>
              <ConnectionRow r={r} run={run} busy={busy} arm={arm} setArm={setArm} confirm={confirm} />
              {r.body === "google_choose" && <GoogleChoose busy={busy} setBusy={setBusy} flash={flash} onDisconnect={() => setArm({ kind: r.kind, what: "disconnect" })} />}
              {r.body === "business_record" && <window.BusinessRecordForm line={ownLine} flash={flash} />}
            </React.Fragment>
          ))}
          {g === "connected" && list.some((r) => r.kind === "google_listing") && (
            <p className="set-card-foot">The public listing is read once a day: Google shows five reviews and counts every rating. Connect the Business Profile for all of them, and for the replies you send from Reports.</p>
          )}
        </section>
      ))}
      {toastNode}
    </>
  );
};

window.PaneIntegrationsReal = PaneIntegrationsReal;
