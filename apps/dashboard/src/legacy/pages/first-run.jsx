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
//
// After Find it is Check (first-run.ts `check`, canvas R2, V2, P2): what the receptionist answers from, in the Business
// tab's own rows (business-tab-*.jsx, drawn here through window, so the two screens never disagree), and how customers
// buy. The receptionist it checks is set up from what is known, on an owner's press (window.__setup.receptionist, the
// first receptionist's route): Find's "Yes, this is us" and "We're not on Google" ask for it, and so does Check's own
// press where there is still none. Every row saves through the Business tab's one saver, as it does on that tab.

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
// and the workspace's name, clock and answer to how its customers buy from the list the shell already holds.
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
    sellsBy: (ws && ws.sells_by) || null,
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
const FrFind = ({ W, flash, done, go, make }) => {
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
    // "Yes, this is us": the receptionist is set up from what Google says, where none is yet.
    if (r.ok) make();
  };
  const notOnGoogle = async () => {
    if (busy || !window.__setup) return;
    setBusy(true);
    const r = await window.__setup.later("google", true);
    setBusy(false);
    if (!r.ok) {
      flash(window.refusalToast(r, W.notSaved));
      return;
    }
    // Not on Google: the receptionist is set up with the name typed at sign-up, and Check asks for the rest.
    make();
    if (done) go(done);
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

/**
 * How customers buy, as the first run reads it: the answer stored (the workspace list's, as the first run reads its
 * workspace), and the answer shown, which is the stored one or, until one is said, the first (contracts sellsByVM, whose
 * words the choice draws). Null without the bridge.
 */
const frAnswer = () => {
  const tab = window.__businessTab || {};
  const stored = (frWorkspace() || {}).sells_by || null;
  const vm = tab.sellsByVM ? tab.sellsByVM(stored) : null;
  return vm ? { stored, shown: vm.first, vm } : null;
};

/**
 * An answer sent through the workspace's door, said as the Business tab says it (contracts sellsBySaved), with `done`
 * run once it is taken. Nothing is sent that is stored already, or while one is out: answers whether it sent.
 */
const frSendAnswer = (answer, flash, done = null) => {
  const B = window.__businessTabSave;
  const tab = window.__businessTab || {};
  const door = B && B.sellsBy;
  const a = frAnswer();
  if (!door || !a || answer === a.stored || door.pending()) return false;
  door.save({ answer, said: tab.sellsBySaved ? tab.sellsBySaved(a.stored, answer) : null, done, flash });
  return true;
};

/** A name as the same name, however it is written: contracts' one rule (foldName), which the services sheet searches by. */
const frFold = (s) => {
  const fold = window.__businessTab && window.__businessTab.foldName;
  const t = String(s == null ? "" : s).trim();
  return fold ? fold(t) : t;
};

// The two lists a chip changes: what a row of each is, and the name it goes by.
const FR_LISTS = {
  services: { row: (name) => ({ name }), nameOf: (r) => (r && typeof r.name === "string" ? r.name : "") },
  languages: { row: (name) => name, nameOf: (r) => (typeof r === "string" ? r : "") },
};

/**
 * A chip's press, as a one-key change of the profile through the Business tab's one saver. Off, it adds the name at the
 * end, quietly (the chip turns on); on, it takes the row of that name out, and the toast's Undo puts it back where it was,
 * whole (a service keeps its minutes and its price). Each change is a pure patch of what is stored when it goes, as a
 * row's is: a name already there is not added twice, and one already gone is not taken twice. Only a refusal is said,
 * in the saver's words.
 */
const frChipPress = ({ list, chip, full, flash, W }) => {
  const S = window.__businessTabSave;
  const L = FR_LISTS[list];
  const same = (r) => frFold(L.nameOf(r)) === frFold(chip.name);
  const refusals = (f) => { if (f && f.tone === "danger") flash(f); };
  const put = (row, at) => S.saver.save({
    row: list,
    change: (b, p) => {
      const rows = Array.isArray(p[list]) ? p[list].slice() : [];
      if (rows.some(same)) return b;
      rows.splice(Math.min(at, rows.length), 0, row);
      p[list] = rows;
      b.profile = p;
      return b;
    },
    said: null,
    done: null,
    flash: refusals,
  });
  if (!chip.on) {
    if (full) {
      flash({ tone: "warn", msg: <>{W.full[list]}</> });
      return;
    }
    put(L.row(chip.name), Infinity);
    return;
  }
  // The row as the next save finds it, and its place, for the Undo to put back whole.
  const base = S.saver.base();
  const stored = ((base && base.brain && base.brain.profile) || {})[list];
  const rows = Array.isArray(stored) ? stored : [];
  const at = rows.findIndex(same);
  if (at < 0) return;
  const gone = rows[at];
  S.saver.save({
    row: list,
    change: (b, p) => {
      const left = (Array.isArray(p[list]) ? p[list] : []).filter((r) => !same(r));
      if (left.length) p[list] = left;
      else delete p[list];
      b.profile = p;
      return b;
    },
    said: null,
    done: () => flash({
      msg: <>{W.removed(chip.name)}</>,
      undo: () => { put(gone, at); return true; },
    }),
    flash: refusals,
  });
};

/**
 * One list of chips, under its own words: a toggle each (aria-pressed), and the way to the Business tab's own editor for
 * what the chips do not name. Hookless, since the languages' is drawn as its fold's rest. A role that may not change the
 * business reads them and cannot press them.
 */
const FrChips = ({ list, label, chips, full, canEdit, flash, W, more, moreTestid }) => (
  <div className="fr-chips" role="group" aria-labelledby={`fr-chips-${list}-label`} data-testid={`fr-chips-${list}`}>
    <span className="fr-chips-label" id={`fr-chips-${list}-label`} data-testid={`fr-chips-${list}-label`}>{label}</span>
    <span className="fr-chips-list">
      {chips.map((c) => (
        <button
          key={c.name}
          type="button"
          className="fr-chip"
          aria-pressed={c.on}
          aria-disabled={!canEdit || undefined}
          onClick={() => { if (canEdit) frChipPress({ list, chip: c, full, flash, W }); }}
          data-testid={`fr-chip-${list}-${c.name}`}
        >
          {c.on ? <Icon name="check" size={11} /> : null}
          {c.name}
        </button>
      ))}
      {more && canEdit ? (
        <button type="button" className="fr-chip fr-chip-more" onClick={more.onClick} data-rec-act={more.act || undefined} data-testid={moreTestid}>
          {more.label}
        </button>
      ) : null}
    </span>
  </div>
);

/**
 * Check (canvas R2, V2, P2): what the receptionist answers from, in the Business tab's own rows, over the settings read's
 * brain -- the week and its clock, where the business is, its website; how customers buy, the booking link (for a
 * business that books) and the rules it keeps (the price rule shown as its default); what it offers and the languages it
 * speaks. Each row saves through the tab's one saver, and a sheet opens over the first run as it does over the tab. How
 * customers buy is the tab's own choice, drawn open and saved at once through the workspace's door; until it is said,
 * the first answer is shown, and Looks right sends it (FirstRun). With no receptionist yet: an owner's one press, or
 * who sets it up. `canEdit` is whether the role may change the business, as the tab asks it.
 */
const FrCheck = ({ check, W, flash, make, making, go, canEdit }) => {
  const settings = window.__SETTINGS || null;
  const brain = (settings && settings.config && settings.config.brain) || null;
  if (!brain) {
    // The settings read's brain draws the rows. None there: the owner's press, who sets it up, or, set up and not read
    // back yet, the read on its way; and a read that failed, its retry.
    if (check.make) {
      return (
        <div className="fr-check-make" data-testid="fr-check-make">
          <p className="fr-check-note">{check.make.sentence}</p>
          <button type="button" className="fr-onward" onClick={make} disabled={making} aria-busy={making || undefined} data-testid="fr-check-make-press" {...window.gate("team", "set up the receptionist")}>
            {making ? check.make.busy : check.make.cta}
          </button>
        </div>
      );
    }
    if (check.waiting) return <p className="fr-check-note" data-testid="fr-check-waiting">{check.waiting}</p>;
    if (window.__surfaceFailed && window.__surfaceFailed("admin", "workspace")) {
      return <FailedRead kind="card" what={W.failedWhat} surface="settings" testid="fr-check-failed" retryTestid="fr-check-retry" />;
    }
    return <p className="fr-reading" data-testid="fr-check-reading">{W.reading}</p>;
  }
  const S = window.__businessTabSave;
  const saver = S.saver;
  const base = saver.base();
  const rows = { brain, base, canEdit, flash, saver };
  const tab = window.__businessTab || {};
  const answer = frAnswer();
  const door = S.sellsBy;
  // The booking link is asked of a business that books (the spec's "only for businesses that book"). One that quotes
  // has none by right (contracts bookingLinkOptional), and its row is drawn only while it has a link to show; in its
  // place, what it does without one, in the row's own words (bookingLinkRowWords).
  const quotes = !!(answer && tab.bookingLinkOptional && tab.bookingLinkOptional(answer.shown));
  const linkRow = !quotes || !!brain.booking_link;
  const note = check.unsure ? <span className="fr-check-unsure" data-testid="fr-check-unsure">{check.unsure}</span> : null;
  // What it offers and the languages it speaks, as chips over the config the next save goes on: a tap is on at once.
  const on = (base && base.brain) || brain;
  const chips = window.__firstRun.chips({
    type: check.type,
    services: (on.profile || {}).services,
    languages: (on.profile || {}).languages,
  });
  const C = W.chips;
  const request = (id) => { if (window.__recordFolds) window.__recordFolds.request(id); };
  return (
    <div className="fr-check" data-testid="fr-check">
      <section className="rec-card fr-check-card" aria-label={W.groups.facts}>
        <window.BtHoursRow brain={brain} prompt={settings.prompt || null} canEdit={canEdit} flash={flash} saver={saver} note={note} />
        <window.BtZoneRow brain={brain} canEdit={canEdit} flash={flash} />
        <window.BtAddressRow {...rows} />
        <window.BtWebsiteRow {...rows} />
      </section>
      <section className="rec-card fr-check-card" aria-label={W.groups.buys}>
        {answer && window.btSellsByChoice ? (
          <div className="fr-check-buys">
            {window.btSellsByChoice({
              id: "fr-sells-by",
              vm: answer.vm,
              value: answer.shown,
              set: (next) => frSendAnswer(next, flash),
              readOnly: !canEdit || !door || door.pending(),
              label: true,
              testid: "fr-sells-by",
            })}
            {!linkRow && tab.bookingLinkRowWords ? (
              <p className="fr-check-note" data-testid="fr-check-quotes">{tab.bookingLinkRowWords(answer.shown).hint}</p>
            ) : null}
          </div>
        ) : null}
        {linkRow ? <window.BtBookingLinkRow {...rows} /> : null}
        <window.BtRulesRow {...rows} config={settings.config} />
      </section>
      <section className="rec-card fr-check-card" aria-label={W.groups.offer}>
        <window.BtServicesRow brain={brain} canEdit={canEdit} saver={saver} />
        {chips.services.length ? (
          <FrChips
            list="services"
            label={C.services}
            chips={chips.services}
            full={chips.servicesFull}
            canEdit={canEdit}
            flash={flash}
            W={C}
            more={{ label: C.ownService, onClick: () => request("services") }}
            moreTestid="fr-chip-own-service"
          />
        ) : null}
        <window.BtLanguagesRow
          {...rows}
          rest={({ request: open, can }) => (
            <FrChips
              list="languages"
              label={C.languages}
              chips={chips.languages}
              full={chips.languagesFull}
              canEdit={canEdit}
              flash={flash}
              W={C}
              more={can ? { label: C.otherLanguage, onClick: open, act: "languages" } : null}
              moreTestid="fr-chip-other-language"
            />
          )}
        />
      </section>
      {check.find ? (
        <p className="fr-check-note">
          <button type="button" className="fr-find-link" onClick={() => go(check.find.to)} data-testid="fr-check-find">{check.find.label}</button>
        </p>
      ) : null}
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
  // The page's toast, lent to Find and Check: a link ends Find as the surfaces repaint, and what it says outlives it.
  const [toastNode, flash] = window.usePPToast();
  // The ask for the receptionist, held here and lent to Find and Check: Find is gone by the time it answers.
  const [making, setMaking] = React.useState(false);
  // Whether Check is on screen, so it stays there (below): kept across draws, as React keeps a ref.
  const onCheck = React.useRef(false);
  // Check's rows save through the Business tab's saver and doors, which outlive the page: a save moving through any of
  // them draws the page again, as it draws the tab.
  const [, redraw] = React.useReducer((n) => n + 1, 0);
  React.useEffect(() => {
    const S = window.__businessTabSave;
    const doors = S ? [S.saver, S.zone, S.sellsBy] : [];
    const stops = doors.map((d) => (d && d.subscribe ? d.subscribe(redraw) : null));
    return () => stops.forEach((stop) => { if (stop) stop(); });
  }, []);
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
  // Check stays on screen while the owner is on it. Its step is done the moment its last fact lands (a service saved in
  // its sheet), and the first run, which opens where the workspace is, would go on to the phone under them; they go on
  // with Looks right instead. So once Check is drawn, the business step is asked for by name until the owner moves.
  const asked = F.of(S.vm, param, who);
  const fr = !param && onCheck.current && asked.shown.key !== "business" ? F.of(S.vm, "business", who) : asked;
  onCheck.current = !!fr.check;
  const card = F.receptionist(frCardInputs(S));
  const step = fr.shown;
  // Whether this role may change the business, as the Business tab asks it: its rows' acts, and the answer's door.
  const canEdit = !window.canDo || window.canDo("settings");
  // The step on screen is the address's, replaced rather than pushed, so the browser's Back leaves the first run. A
  // move opens the next step at its top: the shell is the page's scroll (first-run.css).
  const go = (to) => {
    onCheck.current = false;
    onNavigate(to, { replace: true });
    const shell = document.querySelector ? document.querySelector(".fr-shell") : null;
    if (shell && shell.scrollTo) shell.scrollTo(0, 0);
  };
  // Set the receptionist up from what is known, where none is: once at a time, and a refusal said in its words.
  const make = async () => {
    if (making || !window.__setup || !window.__setup.receptionist) return;
    setMaking(true);
    const r = await window.__setup.receptionist();
    setMaking(false);
    if (!r.ok) flash(window.refusalToast(r, W.check.notMade));
  };
  const onward = () => {
    const o = fr.onward;
    if (o.held) return;
    if (!fr.check) {
      if (o.leaves) leave(o.to);
      else go(o.to);
      return;
    }
    // Looks right: the answer to how customers buy, as Check shows it, is sent where none is stored (as the create card
    // sends it), and the step goes on once it is taken. A role that may not change the workspace sends nothing: the
    // door would refuse it, and the step goes on as it is.
    const a = frAnswer();
    if (!canEdit || !a || a.stored || !frSendAnswer(a.shown, flash, () => go(o.to))) go(o.to);
  };
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
          {fr.find ? <FrFind W={W.find} flash={flash} done={fr.findDone} go={go} make={make} /> : null}
          {fr.check ? <FrCheck check={fr.check} W={W.check} flash={flash} make={make} making={making} go={go} canEdit={canEdit} /> : null}
          {step.key === "try" && S.vm.tryIt ? <window.SetupTry tryIt={S.vm.tryIt} /> : null}
          {!fr.find && !fr.check && step.rows.length ? (
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
              {fr.onward && fr.onward.held ? <span className="fr-held" id="fr-held" data-testid="fr-held">{fr.onward.held}</span> : null}
              {fr.onward ? (
                <button
                  type="button"
                  className="fr-onward"
                  onClick={onward}
                  // Held, it stays in reach and says why beside it, as a gated act does: never `disabled`, which lets go of focus.
                  aria-disabled={fr.onward.held ? true : undefined}
                  aria-describedby={fr.onward.held ? "fr-held" : undefined}
                  data-testid="fr-onward"
                >
                  {fr.onward.label}
                </button>
              ) : null}
            </div>
          ) : null}
        </main>
        <FrCard card={card} open={cardOpen} />
      </div>
      {/* The services list opens in a sheet, as it does on the Business tab, which draws it last of everything there. */}
      {fr.check && window.__SETTINGS && window.__SETTINGS.config && window.__SETTINGS.config.brain && window.BtServicesSheet ? (
        <window.BtServicesSheet brain={window.__SETTINGS.config.brain} canEdit={canEdit} flash={flash} saver={window.__businessTabSave.saver} />
      ) : null}
      {toastNode}
    </div>
  );
};

window.FirstRun = FirstRun;
