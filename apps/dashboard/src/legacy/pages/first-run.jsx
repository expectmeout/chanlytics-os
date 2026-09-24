/* global React, Icon, FailedRead, StatePill */
// Chanlytics — the first run (#/start).
//
// Setup's own rows, one step to a screen, full screen, with the owner's receptionist filling in beside them
// (docs/superpowers/specs/2026-09-24-first-run-design.md). The steps, which one the workspace is on and every sentence
// are contracts' (first-run.ts, published by the bridge as window.__firstRun); the rows and everything a row does are
// Setup's (setup.jsx SetupRows). Nothing is stored: the step is worked out from Setup's view model on every draw.
//
// Drawn by the shell INSTEAD of its chrome (app-shell.jsx, the start route, as it draws the shared viewer), so the
// page is the whole screen. Loaded after setup.jsx and before app-shell.jsx (both load lists).
//
// The business step is Find while an owner can link a listing (first-run.ts `find`): what Google has for the business,
// found already, instead of the step's rows. Setup's Google row opens it (the one finder).

const useFrTick = (event) => {
  const [, bump] = React.useReducer((n) => n + 1, 0);
  React.useEffect(() => {
    window.addEventListener(event, bump);
    return () => window.removeEventListener(event, bump);
  }, [event]);
};

/** The workspace this tab holds, from the list the shell already has: its name and clock. */
const frWorkspace = () => (window.__WORKSPACES || []).find((t) => t.id === window.__ACTIVE_WORKSPACE) || null;

// What the card reads beyond Setup: the brain and the resolved numbers from the settings read, once it has landed,
// and the workspace's name and clock from the list the shell already holds.
const frCardInputs = (S) => {
  const cfg = window.__SETTINGS && window.__SETTINGS.config;
  const facts = window.__FACTS && window.__FACTS.facts;
  const ws = frWorkspace();
  const value = (f) => (f && f.value) || null;
  return {
    setup: S.dto,
    answering: S.vm.readiness.answering,
    brain: (cfg && cfg.brain) || null,
    numbers: facts ? { voiceLine: value(facts.voice_line), keptLine: value(facts.kept_line), handoff: value(facts.handoff_number) } : null,
    workspaceName: (ws && ws.name) || null,
    tz: (ws && ws.timezone) || window.DEFAULT_TIMEZONE || "America/New_York",
  };
};

/**
 * Find (canvas R1, P1): what Google has for the business, asked on arrival with the name on record -- the
 * receptionist's, or the one typed at sign-up (the search route falls back to it). The best match first and checked,
 * the others under it (on a phone, behind "Not this one? Search again"); one press links the one checked, or the owner
 * says they are not on Google, which puts Google's row off (their saved view) and leaves the step's rows -- or, where
 * Find was asked for by name, goes to the step's own address (\`done\`). The step is Find only for an owner, who alone
 * may search and link. The toast is the page's (\`flash\`): a link ends Find as the surfaces repaint.
 */
const FrFind = ({ W, flash, done, go }) => {
  // null while Google is asked; then what it said: the candidates, the words it was asked, whether they were the owner's.
  const [found, setFound] = React.useState(null);
  const [picked, setPicked] = React.useState(null);
  const [words, setWords] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  // A phone shows the best match alone until the owner asks for more (canvas P1).
  const [more, setMore] = React.useState(false);
  const ask = async (ownWords) => {
    const G = window.__google;
    if (!G) return;
    setBusy(true);
    const r = await G.find(ownWords || undefined);
    setBusy(false);
    setFound(r.ok
      ? { ok: true, candidates: r.candidates, query: r.query, ownWords: !!ownWords, message: "" }
      : { ok: false, candidates: [], query: ownWords || "", ownWords: !!ownWords, message: r.message });
    setPicked(r.ok && r.candidates.length ? r.candidates[0].place_id : null);
  };
  React.useEffect(() => { ask(null); }, []);
  const searchWords = words.replace(/\s+/g, " ").trim();
  const search = (e) => {
    e.preventDefault();
    if (busy || searchWords.length < 3) return;
    ask(searchWords);
  };
  const linkPicked = async () => {
    const c = found && found.candidates.find((x) => x.place_id === picked);
    if (!c || busy || !window.__google || !(window.canDo && window.canDo("team"))) return;
    setBusy(true);
    const r = await window.__google.link(c.place_id);
    setBusy(false);
    flash(r.ok ? { tone: "ok", msg: <>{W.linked(c.name, r.read)}</> } : window.refusalToast(r, W.notLinked));
  };
  const notOnGoogle = async () => {
    if (busy || !window.__setup) return;
    setBusy(true);
    const r = await window.__setup.later("google", true);
    setBusy(false);
    if (!r.ok) flash(window.refusalToast(r, W.notSaved));
    else if (done) go(done);
  };
  const hits = found ? found.candidates : [];
  return (
    <div className="fr-find" data-testid="fr-find" data-hits={hits.length > 0 ? "true" : undefined} data-more={more ? "true" : undefined}>
      {found === null ? <p className="fr-find-note" role="status" data-testid="fr-find-reading">{W.reading}</p> : null}
      {found && !found.ok ? (
        <p className="fr-find-note" role="alert" data-testid="fr-find-failed">
          {found.message}{" "}
          <button type="button" className="fr-find-link" onClick={() => ask(found.ownWords ? found.query : null)} disabled={busy} data-testid="fr-find-retry">{W.retry}</button>
        </p>
      ) : null}
      {found && found.ok && hits.length === 0 ? <p className="fr-find-note" data-testid="fr-find-none">{W.none(found.query)}</p> : null}
      {found && found.ok && hits.length > 0 && found.ownWords ? <p className="fr-find-note">{W.typed(found.query)}</p> : null}
      {hits.length > 0 ? (
        <div className="fr-find-hits" role="radiogroup" aria-label={W.pick}>
          {hits.map((c, i) => (
            <label key={c.place_id} className={i === 0 ? "fr-find-hit is-best" : "fr-find-hit"} data-testid="fr-find-hit">
              <input type="radio" name="fr-find" value={c.place_id} checked={picked === c.place_id} onChange={() => setPicked(c.place_id)} disabled={busy} />
              <span className="fr-find-body">
                <span className="fr-find-name">{c.name}</span>
                <span className="fr-find-where">{[c.category, c.address || W.noAddress].filter(Boolean).join(" · ")}</span>
                {c.maps_uri ? <a className="fr-find-maps" href={c.maps_uri} target="_blank" rel="noreferrer">{W.maps}</a> : null}
              </span>
              {i === 0 ? <span className="pill pill-ok fr-find-best">{W.best}</span> : null}
            </label>
          ))}
        </div>
      ) : null}
      {hits.length > 0 && !more ? (
        <button type="button" className="fr-find-link fr-find-more" onClick={() => setMore(true)} data-testid="fr-find-more">{W.more}</button>
      ) : null}
      <form className="fr-find-search" role="search" onSubmit={search}>
        <input className="fr-find-input" value={words} onChange={(e) => setWords(e.target.value)} placeholder={W.search} aria-label={W.search} maxLength={200} data-testid="fr-find-words" />
        <button type="submit" className="btn btn-sm" disabled={busy || searchWords.length < 3} data-testid="fr-find-search">{W.searchCta}</button>
      </form>
      <div className="fr-find-acts">
        {hits.length > 0 ? (
          <button type="button" className="fr-onward" onClick={linkPicked} disabled={busy || !picked} aria-busy={busy || undefined} data-testid="fr-find-yes" {...window.gate("team", "link the listing")}>{W.yes}</button>
        ) : null}
        <button type="button" className="fr-find-link" onClick={notOnGoogle} disabled={busy} data-testid="fr-find-not">{W.notOnGoogle}</button>
      </div>
      <p className="fr-find-legal">
        <a href="/terms">{W.terms}</a>
        <span aria-hidden="true"> · </span>
        <a href="/privacy">{W.privacy}</a>
      </p>
    </div>
  );
};

/** The four steps across the top: a step done or on screen opens in place; a step not reached is only its name. */
const FrRail = ({ fr, go, label }) => (
  <ol className="fr-rail" aria-label={label}>
    {fr.steps.map((s) => {
      const body = (
        <>
          <span className="fr-rail-mark" aria-hidden="true">{s.state === "done" ? <Icon name="check" size={10} /> : s.number}</span>
          <span className="fr-rail-name">{s.name}</span>
        </>
      );
      return (
        <li key={s.key} className="fr-rail-step" data-state={s.state} aria-current={s.key === fr.shown.key ? "step" : undefined}>
          {s.state === "ahead"
            ? <span className="fr-rail-btn">{body}</span>
            : <button type="button" className="fr-rail-btn" onClick={() => go(s.to)} data-testid={`fr-rail-${s.key}`}>{body}</button>}
        </li>
      );
    })}
  </ol>
);

/** The owner's receptionist, so far: beside the step on a desktop; under the strip, once opened, on a phone. */
const FrCard = ({ card, open }) => (
  <aside className="fr-card" data-open={open ? "true" : undefined} aria-label={card.caption} data-testid="fr-card">
    <div className="fr-card-cap">{card.caption}</div>
    <div className="fr-card-box">
      <div className="fr-card-head">
        <span className="fr-card-av" aria-hidden="true">{card.initials}</span>
        <div className="fr-card-who">
          <b>{card.name}</b>
          <StatePill kind="setup" value={card.status.state} label={card.status.words} testid="fr-card-status" />
        </div>
      </div>
      <p className="fr-card-greet"><span className="fr-card-k">{card.greetingLabel}</span>“{card.greeting}”</p>
      <dl className="fr-card-rows">
        {card.rows.map((r) => (
          <div key={r.key} className="fr-card-row" data-testid={`fr-card-${r.key}`}>
            <dt className="fr-card-k">{r.label}</dt>
            <dd className={r.value ? "fr-card-v" : "fr-card-v is-empty"}>{r.value || "—"}</dd>
          </div>
        ))}
      </dl>
    </div>
    <p className="fr-card-foot">{card.foot}</p>
  </aside>
);

const FirstRun = ({ param = null, onNavigate }) => {
  useFrTick("surface:setup");
  useFrTick("surface:settings");
  const [cardOpen, setCardOpen] = React.useState(false);
  // The page's toast, lent to Find: a link ends Find as the surfaces repaint, and what it says outlives it.
  const [toastNode, flash] = window.usePPToast();
  const F = window.__firstRun;
  // Being here is the landing: Today does not send this tab back again this session.
  React.useEffect(() => {
    if (!F) return;
    try { window.sessionStorage.setItem(F.landedKey, "1"); } catch { /* still here */ }
  }, [F]);
  // Without the bridge there is nothing to say: every word here is contracts'.
  if (!F) return <div className="fr-root fr-waiting" data-testid="first-run" />;
  const W = F.words;
  const S = window.__SETUP;
  const leave = (to) => onNavigate(to);
  if (S === null) {
    return (
      <div className="fr-root fr-waiting" data-testid="first-run">
        <FailedRead
          kind="card"
          what={W.failedWhat}
          body={W.failedBody}
          onRetry={() => window.__setup && window.__setup.refresh && window.__setup.refresh()}
          also={{ label: W.toToday, onClick: () => leave("today") }}
          testid="fr-failed"
          retryTestid="fr-retry"
        />
      </div>
    );
  }
  if (!S) {
    return (
      <div className="fr-root fr-waiting" data-testid="first-run">
        <p className="fr-reading" data-testid="fr-reading">{W.reading}</p>
      </div>
    );
  }
  // Who is looking, for Find: an owner by the role gate (View-as included), and what the business goes by.
  const who = {
    owner: !!(window.canDo && window.canDo("team")),
    receptionistName: S.dto.business.name,
    workspaceName: (frWorkspace() || {}).name || null,
  };
  const fr = F.of(S.vm, param, who);
  const card = F.receptionist(frCardInputs(S));
  const step = fr.shown;
  // The step on screen is the address's, replaced rather than pushed, so the browser's Back leaves the first run.
  const go = (to) => onNavigate(to, { replace: true });
  const onward = () => (fr.onward.leaves ? leave(fr.onward.to) : go(fr.onward.to));
  return (
    <div className="fr-root" data-testid="first-run" data-step={step.key}>
      <header className="fr-top">
        <span className="fr-brand"><span className="sidebar-brand-mark" aria-hidden="true">C</span>Chanlytics</span>
        <FrRail fr={fr} go={go} label={W.title} />
        <button type="button" className="fr-later" onClick={() => leave("today")} data-testid="fr-later">{W.later}</button>
      </header>
      <div className="fr-phone">
        <div className="fr-phone-top">
          <span data-testid="fr-phone-line">{fr.phoneLine}</span>
          <button type="button" className="fr-later" onClick={() => leave("today")}>{W.laterShort}</button>
        </div>
        <div className="fr-bar" aria-hidden="true"><span style={{ width: `${fr.progress}%` }} /></div>
        <button type="button" className="fr-strip" aria-expanded={cardOpen} onClick={() => setCardOpen((v) => !v)} data-testid="fr-strip">
          <span className="fr-card-av" aria-hidden="true">{card.initials}</span>
          <span className="fr-strip-words">{card.strip}</span>
          <Icon name="chevron-down" size={12} />
        </button>
      </div>
      <div className="fr-body">
        <main className="fr-step" aria-labelledby="fr-heading">
          <div className="fr-step-head">
            <h1 className="fr-heading" id="fr-heading" data-testid="fr-heading">{fr.heading}</h1>
            {fr.lead ? <p className="fr-lead">{fr.lead}</p> : null}
          </div>
          {fr.find ? <FrFind W={W.find} flash={flash} done={fr.findDone} go={go} /> : null}
          {step.key === "try" && S.vm.tryIt ? <window.SetupTry tryIt={S.vm.tryIt} /> : null}
          {!fr.find && step.rows.length ? (
            <div className="fr-part">
              {step.key === "live" ? <h2 className="fr-sub">{W.liveNext}</h2> : null}
              <section className="tq fr-rows">
                <window.SetupRows S={S} rows={step.rows} look="row" primary={fr.primaryRow} later={W.putOff} testid="fr-rows" />
              </section>
            </div>
          ) : null}
          {fr.back || fr.onward ? (
            <div className="fr-foot">
              {fr.back ? <button type="button" className="btn btn-ghost btn-sm" onClick={() => go(fr.back)} data-testid="fr-back">{W.back}</button> : <span />}
              {fr.onward ? <button type="button" className="fr-onward" onClick={onward} data-testid="fr-onward">{fr.onward.label}</button> : null}
            </div>
          ) : null}
        </main>
        <FrCard card={card} open={cardOpen} />
      </div>
      {toastNode}
    </div>
  );
};

window.FirstRun = FirstRun;
