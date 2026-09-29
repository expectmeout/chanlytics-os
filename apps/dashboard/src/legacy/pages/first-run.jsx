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
    if (!c || busy || !window.__google || !(window.canDo && window.canDo("settings"))) return;
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
          <button type="button" className="fr-onward" onClick={linkPicked} disabled={busy || !picked} aria-busy={busy || undefined} data-testid="fr-find-yes" {...window.gate("settings", "link the listing")}>{W.yes}</button>
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
/**
 * How long a choice in a radiogroup waits before it is saved: arrow keys move the choice AND change it, so arrowing
 * past two answers to the third was three saves (and, with the answer's door read-only while one was out, the second
 * and third swallowed). The choice is shown at once and saved once the keys settle, the last one.
 */
const FR_SETTLE_MS = 600;

/**
 * A choice's save, held until the keys settle (FR_SETTLE_MS) -- and sent at once if the step goes first: Continue,
 * Back or Later within the wait must not lose what was chosen. `held` is the ref the choice is held in, so the page
 * can take it for its own press (Check's Continue sends the answer being chosen, not the one stored).
 */
const useFrSettled = (held) => {
  const timer = React.useRef(null);
  React.useEffect(
    () => () => {
      clearTimeout(timer.current);
      const p = held.current;
      held.current = null;
      if (p) p.send();
    },
    // A ref: the same object on every draw, so this runs as the step goes and at no other time.
    [held],
  );
  return (entry) => {
    clearTimeout(timer.current);
    held.current = entry;
    timer.current = setTimeout(() => {
      if (held.current !== entry) return;
      held.current = null;
      entry.send();
    }, FR_SETTLE_MS);
  };
};

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

// The two lists a chip changes, as the Business tab's folds hold them (draftOf): what a row of each is, and the name it
// goes by.
const FR_LISTS = {
  services: { row: (name) => ({ name }), nameOf: (r) => (r && typeof r.name === "string" ? r.name : "") },
  languages: { row: (name) => name, nameOf: (r) => (typeof r === "string" ? r : "") },
};

/**
 * A chip's press, saved as the Business tab saves that list: the list's draft as the next save finds it (draftOf on the
 * saver's base), changed, and sent as its fold's one job (foldJob), which writes it as the tab's own editor writes it and
 * refuses to go when the list moved under it. Off, it adds the name at the end, quietly (the chip turns on). On, it takes
 * out every row of that name (sameListed, contracts' one rule), and the toast's Undo puts each back where it was, whole: a
 * service keeps its minutes and its price. Only a refusal is said, in the saver's words. A role that may not change the
 * business sends nothing, whatever pressed it.
 */
const frChipPress = ({ list, chip, flash, words }) => {
  if (window.canDo && !window.canDo("settings")) return;
  const S = window.__businessTabSave;
  const L = FR_LISTS[list];
  const same = (r) => window.__businessTab.sameListed(L.nameOf(r), chip.name);
  const refusals = (f) => { if (f && f.tone === "danger") flash(f); };
  // `edit` is run once, now, on the list as the next save finds it, and hands back the list the press leaves.
  const send = (edit, done = null) => {
    const opened = S.draftOf(list, S.saver.base());
    S.saver.save(S.foldJob(list, edit(opened), { opened, said: null, done, flash: refusals }));
  };
  if (!chip.on) {
    send((rows) => (rows.some(same) ? rows : rows.concat([L.row(chip.name)])));
    return;
  }
  // Every row of that name, and its place, for the Undo to put back whole.
  let gone = [];
  const putBack = (rows) => {
    if (rows.some(same)) return rows;
    const back = rows.slice();
    gone.forEach((g) => back.splice(Math.min(g.at, back.length), 0, g.row));
    return back;
  };
  send(
    (rows) => {
      gone = rows.flatMap((row, at) => (same(row) ? [{ row, at }] : []));
      return rows.filter((r) => !same(r));
    },
    () => {
      if (!gone.length) return;
      flash({ msg: <>{words.removed(chip.name)}</>, undo: () => { send(putBack); return true; } });
    },
  );
};

/**
 * One list of chips, under its own words: a toggle each (aria-pressed), gated as a change to the settings (`doing` says
 * what it changes), and, for a role that may change the business, the way to the Business tab's own editor for what the
 * chips do not name. At the profile's cap the chips that are off are not drawn, and the cap's sentence stands where they
 * were (check-chips.ts). Hookless, since the languages' is drawn as its fold's rest.
 */
const FrChips = ({ list, label, set, doing, canEdit, flash, words, more, moreTestid }) => (
  <div className="fr-chips" role="group" aria-labelledby={`fr-chips-${list}-label`} data-testid={`fr-chips-${list}`}>
    <span className="fr-chips-label" id={`fr-chips-${list}-label`} data-testid={`fr-chips-${list}-label`}>{label}</span>
    <span className="fr-chips-list">
      {set.chips.map((c) => (
        <button
          key={c.name}
          type="button"
          className="fr-chip"
          aria-pressed={c.on}
          onClick={() => frChipPress({ list, chip: c, flash, words })}
          {...window.gate("settings", doing)}
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
    {set.full ? <span className="fr-chips-full" data-testid={`fr-chips-${list}-full`}>{set.full}</span> : null}
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
const FrCheck = ({ check, W, flash, make, making, go, canEdit, held }) => {
  // How customers buy, as the owner is choosing it: shown at once, sent once the keys settle (FR_SETTLE_MS), and let
  // go of once the answer is taken or refused.
  const [soon, setSoon] = React.useState(null);
  const settled = useFrSettled(held);
  const settings = window.__SETTINGS || null;
  const brain = (settings && settings.config && settings.config.brain) || null;
  if (!brain) {
    // The settings read's brain draws the rows. None there: the owner's press, who sets it up, or, set up and not read
    // back yet, the read on its way; and a read that failed, its retry.
    if (check.make) {
      return (
        <div className="fr-check-make" data-testid="fr-check-make">
          <p className="fr-check-note">{check.make.sentence}</p>
          <button type="button" className="fr-onward" onClick={make} disabled={making} aria-busy={making || undefined} data-testid="fr-check-make-press" {...window.gate("settings", "set up the receptionist")}>
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
  const brainNow = (base && base.brain) || brain;
  // The booking page the website names (3c-4), offered while no link is on the config the next save goes on
  // (contracts' one test): taken in the row's own press, or a link typed into the row, it goes at once.
  const offered = window.__firstRun.bookingPageOffered(check.bookingPage, !!brainNow.booking_link);
  const chips = window.__firstRun.chips({
    type: check.type,
    services: (brainNow.profile || {}).services,
    languages: (brainNow.profile || {}).languages,
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
              value: soon || answer.shown,
              set: (next) => {
                setSoon(next);
                const refused = (f) => { if (f && f.tone === "danger") setSoon(null); flash(f); };
                settled({ next, send: () => { if (!frSendAnswer(next, refused, () => setSoon(null))) setSoon(null); } });
              },
              readOnly: !canEdit || !door || door.pending(),
              label: true,
              testid: "fr-sells-by",
            })}
            {!linkRow && tab.bookingLinkRowWords ? (
              <p className="fr-check-note" data-testid="fr-check-quotes">{tab.bookingLinkRowWords(answer.shown).hint}</p>
            ) : null}
          </div>
        ) : null}
        {linkRow ? (
          <window.BtBookingLinkRow
            {...rows}
            other={offered ? { value: offered, sentence: W.bookingPage.found(offered), use: offered, useLabel: W.bookingPage.use } : null}
          />
        ) : null}
        <window.BtRulesRow {...rows} config={settings.config} />
      </section>
      <section className="rec-card fr-check-card" aria-label={W.groups.offer}>
        <window.BtServicesRow brain={brain} canEdit={canEdit} saver={saver} />
        {chips.services.chips.length || chips.services.full ? (
          <FrChips
            list="services"
            label={C.services}
            set={chips.services}
            doing="change your services"
            canEdit={canEdit}
            flash={flash}
            words={C}
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
              set={chips.languages}
              doing="change the languages it speaks"
              canEdit={canEdit}
              flash={flash}
              words={C}
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

// The owner's choice on the phone step, kept in the tab (window.__tabMemory, the loading standard's drafts): Stripe's
// round trip reloads the page, and the choice has to be there when it comes back. Nothing about it is stored anywhere
// else; a tab that lost it asks again. Besides contracts' PhoneChoice it carries `sent`, when the buy went out from
// this tab, so a draw while the line is on its way to the page does not send it twice. A buy answers in seconds and
// its line reaches Setup within a minute; a mark older than FR_PHONE_SENT_MS is a buy that never landed (the tab closed
// on it), and the step sends it again. It also carries `returnedAt`, when this tab came back from Stripe with a card
// given: until the trial lands the step says it is starting, a reload included, and never offers checkout twice; a
// return older than FR_PHONE_RETURN_MS with no trial is one Stripe never confirmed, and the step offers it again.
const FR_PHONE_DRAFT = "first-run-phone";
const FR_PHONE_SENT_MS = 120_000;
const FR_PHONE_RETURN_MS = 15 * 60_000;
const frReturned = (c) => !!(c && c.pending && c.returnedAt && Date.now() - c.returnedAt < FR_PHONE_RETURN_MS);
const frPhoneChoiceKept = () => {
  try { return (window.__tabMemory && window.__tabMemory.draft(FR_PHONE_DRAFT)) || null; } catch { return null; }
};
const frKeepPhoneChoice = (c) => {
  try {
    if (!window.__tabMemory) return;
    if (c) window.__tabMemory.keepDraft(FR_PHONE_DRAFT, c);
    else window.__tabMemory.dropDraft(FR_PHONE_DRAFT);
  } catch { /* the tab keeps nothing; the step asks again */ }
};

/**
 * Your phone (canvas R3, V4, V5, P3; contracts first-run-phone.ts): how calls reach the receptionist -- keep the number
 * customers know, a new one, or move it here -- and the trial with the plan's own price, then the number on its way.
 * `ph` is the step as contracts say it over Setup and the owner's `choice`, which the page holds and keeps in the tab.
 *
 * The button, where a card is still to be given, goes to Stripe (checkout returns to the first run); once the workspace
 * may spend, the buy goes on by itself, once: a number kept or moved buys the receptionist one in its area code (the
 * first offered: customers never see it), a new number buys the one picked, and a move asks a person to file it. Each
 * press asks its door's own role first, as the doors do.
 */
const FrPhone = ({ ph, choice, setChoice, W, flash, go, back, backLabel, ownFoot }) => {
  const F = window.__firstRun;
  const P = window.__setup;
  const [busy, setBusy] = React.useState(false);
  const [numbers, setNumbers] = React.useState(null);
  const [area, setArea] = React.useState(ph.area || "");
  // What is wrong with the area code, said under it once Find is pressed, and gone as it is typed again.
  const [areaProblem, setAreaProblem] = React.useState(null);
  // Whether the owner has left the number box: what is wrong with it is said then, not at the first keystroke.
  const [boxLeft, setBoxLeft] = React.useState(false);
  // The buy this mount sent: a second draw before the line reaches Setup never sends another. A refusal lets go of it.
  const sent = React.useRef(false);
  // Draws the step again once a buy's mark goes stale, so a buy that never landed is sent again (FR_PHONE_SENT_MS).
  const [, recheck] = React.useReducer((n) => n + 1, 0);
  const c = choice || { way: ph.way, number: null, pick: null, pending: false };
  const change = (patch) => setChoice({ ...c, ...patch, pending: false, sent: false, returnedAt: null });
  const failed = (r, words) => {
    sent.current = false;
    setChoice({ ...c, pending: false, sent: false });
    flash(r ? window.refusalToast(r, W.notBought) : { tone: "warn", msg: <>{words}</> });
  };
  const buy = async () => {
    // A role that may not buy (View-as, or a teammate's tab) sends nothing, and the step goes back to its choice.
    if (!P || !(window.canDo && window.canDo("disconnect"))) {
      sent.current = false;
      setChoice({ ...c, pending: false, sent: false });
      return;
    }
    let e164 = c.pick ? c.pick.e164 : null;
    let code = c.pick ? F.areaCodeOf(c.pick.e164) : null;
    if (c.way !== "new") {
      code = ph.area;
      if (!code) { failed(null, W.held.number); return; }
      const found = await P.lines.search(code);
      if (!found.ok) { failed(found); return; }
      if (!found.numbers.length) { failed(null, W.noneFree(code)); return; }
      e164 = found.numbers[0].e164;
    }
    if (!e164) { failed(null, W.held.pick); return; }
    const r = await P.lines.buy(e164, code || "");
    // Refused (a card, a line already there): said, and the owner chooses again. Bought and stopped part-way: the line
    // row has it, with its Retry.
    if (!r.ok && r.message) { failed(r); return; }
    if (c.way === "move" && window.canDo && window.canDo("approve")) {
      const q = await P.request("port");
      flash({ tone: q.ok ? "ok" : "warn", msg: <>{q.ok ? W.moveAsked : W.moveNotAsked}</> });
    }
  };
  const sentAge = c.sent ? Date.now() - c.sent : null;
  const fresh = sentAge !== null && sentAge < FR_PHONE_SENT_MS;
  // A press that moved the step (a forwarding saved) is done once the step it moved to is drawn.
  React.useEffect(() => { setBusy(false); }, [ph.stage]);
  React.useEffect(() => {
    if (ph.stage === "buying" && !sent.current && !fresh) {
      sent.current = true;
      setChoice({ ...c, sent: Date.now() });
      buy();
    }
    // The line is here: what is left of the choice is the way, for the steps after.
    if (ph.stage === "getting" && c.pending) setChoice({ ...c, pending: false, sent: false, returnedAt: null });
    // Sent from another draw and not landed yet: look again when its mark goes stale.
    if (ph.stage === "buying" && fresh && !sent.current) {
      const t = setTimeout(recheck, FR_PHONE_SENT_MS - sentAge + 50);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [ph.stage, fresh]);
  const find = async (e) => {
    if (e) e.preventDefault();
    if (!P || busy || !(window.canDo && window.canDo("disconnect"))) return;
    if (!/^\d{3}$/.test(area)) { setAreaProblem(W.threeDigits); return; }
    setBusy(true);
    const r = await P.lines.search(area);
    setBusy(false);
    if (!r.ok) { flash(window.refusalToast(r, W.notBought)); return; }
    setNumbers(r.numbers.slice(0, 3));
    if (!r.numbers.length) flash({ tone: "info", msg: <>{W.noneFree(area)}</> });
  };
  // An answer to one of the two questions: kept with the choice, whatever the stage (the buy waits on nothing here).
  const answer = (patch) => setChoice({ ...c, ...patch });
  const [help, setHelp] = React.useState(false);
  const forward = async () => {
    const carrier = F.forwardingCarrierOf(c.rings, c.company);
    if (!P || !carrier || !ph.forwardFrom || !(window.canDo && window.canDo("disconnect"))) return;
    // Asked again and answered the same: the code saved stands, and saving it again would drop what a call proved.
    if (ph.saved && ph.saved.carrier === carrier) { answer({ redo: false }); return; }
    setBusy(true);
    const r = await P.forwarding.set({ number: ph.forwardFrom, carrier, mode: "unanswered", test_from: "" });
    if (!r.ok) { setBusy(false); flash(window.refusalToast(r, W.notForwarded)); return; }
    // Saved: Setup is read again (the refresh map), the code is drawn from what was saved, and the button stays busy
    // until then (the stage moving lets it go).
    setChoice({ ...c, redo: false });
    setHelp(false);
  };
  // An office phone system's "Do it with me": a person at Chanlytics asked to set the forwarding up on a call (the
  // request's own door, an operator's, as asking for a line is).
  const withMe = async () => {
    if (!P || busy || !(window.canDo && window.canDo("approve"))) return;
    setBusy(true);
    const r = await P.request("forwarding");
    setBusy(false);
    flash(r.ok ? { tone: "ok", msg: <>{W.withMeSent}</> } : window.refusalToast(r, W.withMeFailed));
  };
  const press = async () => {
    const cta = ph.cta;
    if (!cta || cta.held || busy) return;
    if (cta.act === "forward") { await forward(); return; }
    // Done: on to where the workspace is now, Try it.
    if (cta.act === "onward") { go("start"); return; }
    const next = { ...c, way: ph.way, pending: true, sent: false, returnedAt: null };
    // The number starts the plan (maySpend): by checkout, which takes no trial here, or, on a free trial, by starting
    // its plan now. Either way the choice waits in the tab, and the buy goes on once the plan lets it.
    if (cta.act === "plan" || cta.act === "startNow") {
      const B = window.__billing;
      if (!(window.canDo && window.canDo("billing")) || !B || (cta.act === "startNow" && !B.startNow)) return;
      setChoice(next);
      // The step's own address, so it stays on screen once its line answers.
      go("start/phone");
      setBusy(true);
      const r = cta.act === "plan" ? await B.checkout("start") : await B.startNow();
      setBusy(false);
      if (!r.ok) { setChoice({ ...next, pending: false }); flash({ tone: "danger", msg: <>{r.message}</> }); }
      return;
    }
    if (!(window.canDo && window.canDo("disconnect"))) return;
    setChoice(next);
    go("start/phone");
  };
  // The step's foot, drawn here whenever the step's button is this one's (FirstRun draws no other then).
  const gateOf = {
    plan: ["billing", "start the plan"],
    startNow: ["billing", "start the plan"],
    buy: ["disconnect", "get a number"],
    forward: ["disconnect", "set up forwarding"],
  };
  const gated = ph.cta && gateOf[ph.cta.act] ? window.gate(gateOf[ph.cta.act][0], gateOf[ph.cta.act][1]) : {};
  const foot = ownFoot && ph.cta ? (
    <div className="fr-foot">
      {back ? <button type="button" className="btn btn-ghost btn-sm" onClick={() => go(back)} data-testid="fr-back">{backLabel}</button> : <span />}
      {ph.cta.held ? <span className="fr-held" id="fr-phone-held" data-testid="fr-phone-held">{ph.cta.held}</span> : null}
      <button
        type="button"
        className="fr-onward"
        onClick={press}
        aria-disabled={ph.cta.held ? true : undefined}
        aria-describedby={ph.cta.held ? "fr-phone-held" : undefined}
        aria-busy={busy || undefined}
        data-testid="fr-phone-go"
        {...gated}
      >
        {ph.cta.label}
      </button>
    </div>
  ) : null;
  // The two questions (canvas R4), each the record kit's radiogroup (one tab stop, the arrows walk it), kept with the
  // owner's choice as they are answered.
  const asked = ph.questions ? [["rings", ph.questions.rings], ["company", ph.questions.company]].filter((q) => q[1]) : [];
  const questions = asked.length ? (
    <div className="fr-line-questions" data-testid="fr-phone-questions">
      {asked.map(([key, q]) => (
        <div key={key} className="fr-line-question" data-testid={`fr-q-${key}`}>
          <span className="fr-line-label" id={`fr-q-${key}-label`}>{q.label}</span>
          <window.RecordToggleGroup
            labelledBy={`fr-q-${key}-label`}
            value={q.value}
            options={q.options.map((o) => ({ value: o.key, label: o.label }))}
            onChange={(v) => answer(key === "rings" ? { rings: v } : { company: v })}
          />
        </div>
      ))}
      {ph.keepCode ? (
        <button type="button" className="fr-find-link fr-line-keep" onClick={() => answer({ redo: false })} data-testid="fr-phone-keep">{ph.keepCode}</button>
      ) : null}
    </div>
  ) : null;
  // A code with * or # is a tap only where the phone dials one from a link: Android's dialer takes it; an iPhone's
  // refuses it, and a desk has nothing to dial with, so the code is words to dial there.
  const tapDials = typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent || "");
  if (ph.stage === "code") {
    const k = ph.code;
    return (
      <div className="fr-line-step" data-testid="fr-phone" data-stage="code">
        {k.verified ? <p className="fr-line-started" data-testid="fr-phone-verified"><Icon name="check" size={12} />{k.verified}</p> : null}
        <div className="fr-code" data-testid="fr-phone-code">
          <span className="fr-line-label">{k.label}</span>
          <span className="fr-code-dial tabular" data-testid="fr-phone-dial">{k.dial}</span>
          <ol className="fr-code-steps">{k.steps.map((t) => <li key={t}>{t}</li>)}</ol>
        </div>
        <p className="fr-code-warn" data-testid="fr-phone-warn"><span className="fr-code-dot" aria-hidden="true" />{k.warn}</p>
        <p className="fr-code-off">{k.off}</p>
        {/* Outlined: the step's one coral button is Done, the press after the tap. */}
        {k.tap && tapDials ? <a className="btn fr-code-tap" href={k.tel} data-testid="fr-phone-tap">{k.tap}</a> : null}
        {k.withMe ? (
          <div className="fr-code-with" data-testid="fr-phone-with-me">
            {k.withMe.asked ? (
              <p className="fr-code-off" data-testid="fr-phone-with-me-asked">{k.withMe.asked}</p>
            ) : (
              <>
                <p className="fr-code-off">{k.withMe.sentence}</p>
                <button type="button" className="btn btn-sm" onClick={withMe} aria-busy={busy || undefined} data-testid="fr-phone-with-me-go" {...window.gate("approve", "ask for help with forwarding")}>{k.withMe.label}</button>
              </>
            )}
          </div>
        ) : null}
        <div className="fr-code-links">
          {k.help.notes.length ? <button type="button" className="fr-find-link" aria-expanded={help} onClick={() => setHelp((v) => !v)} data-testid="fr-phone-help">{k.help.label}</button> : null}
          {k.change ? <button type="button" className="fr-find-link" onClick={() => answer({ redo: true })} data-testid="fr-phone-change" {...window.gate("disconnect", "set up forwarding")}>{k.change}</button> : null}
        </div>
        {help ? <ul className="fr-code-notes" data-testid="fr-phone-notes">{k.help.notes.map((t) => <li key={t}>{t}</li>)}</ul> : null}
        {foot}
      </div>
    );
  }
  if (ph.stage !== "choose") {
    return (
      <div className="fr-line-step" data-testid="fr-phone" data-stage={ph.stage}>
        {ph.status ? (
          <div className="fr-line-status" role="status" data-testid="fr-phone-status">
            <StatePill kind="setup" value={ph.status.state} label={ph.status.words} />
            <span className="fr-line-sentence">{ph.status.sentence}</span>
            <span className="fr-line-detail">{ph.status.detail}</span>
          </div>
        ) : null}
        {questions}
        {foot}
      </div>
    );
  }
  const shown = c.number !== null ? c.number : ph.box;
  return (
    <div className="fr-line-step" data-testid="fr-phone" data-stage="choose">
      <div className="fr-find-hits" role="radiogroup" aria-label={ph.heading}>
        {ph.ways.map((w) => (
          <label key={w.key} className="fr-find-hit" data-testid={`fr-way-${w.key}`}>
            <input type="radio" name="fr-way" value={w.key} checked={ph.way === w.key} onChange={() => change({ way: w.key })} disabled={busy} />
            <span className="fr-find-body">
              <span className="fr-find-name">{w.title}</span>
              <span className="fr-find-where">{w.sentence}</span>
            </span>
            {w.recommended ? <span className="pill pill-ok fr-find-best">{w.recommended}</span> : null}
          </label>
        ))}
      </div>
      {ph.way === "new" ? (
        <div className="fr-line-new">
          <form className="fr-find-search" onSubmit={find}>
            <label className="fr-line-label" htmlFor="fr-phone-area">{W.areaLabel}</label>
            <input
              id="fr-phone-area"
              className="fr-find-input fr-line-area"
              inputMode="numeric"
              maxLength={3}
              placeholder={W.areaPlaceholder}
              value={area}
              onChange={(e) => { setArea(e.target.value.replace(/\D/g, "").slice(0, 3)); setAreaProblem(null); }}
              aria-invalid={areaProblem ? true : undefined}
              aria-describedby={areaProblem ? "fr-phone-area-problem" : undefined}
              data-testid="fr-phone-area"
            />
            <button type="submit" className="btn btn-sm" disabled={busy} data-testid="fr-phone-find" {...window.gate("disconnect", "find a number")}>{busy ? W.finding : W.find}</button>
          </form>
          <window.FieldError id="fr-phone-area-problem" message={areaProblem} testid="fr-phone-area-problem" />
          {numbers && numbers.length ? (
            <div className="fr-find-hits" role="radiogroup" aria-label={W.pickLabel} data-testid="fr-phone-numbers">
              {numbers.map((n) => (
                <label key={n.e164} className="fr-find-hit" data-testid="fr-phone-number">
                  <input type="radio" name="fr-phone-pick" value={n.e164} checked={!!c.pick && c.pick.e164 === n.e164} onChange={() => change({ pick: { e164: n.e164, friendly: n.friendly } })} />
                  <span className="fr-find-body">
                    <span className="fr-find-name tabular">{F.numberWords(n.e164) || n.friendly}</span>
                    <span className="fr-find-where">{[n.locality, n.region].filter(Boolean).join(", ") || W.local}</span>
                  </span>
                </label>
              ))}
            </div>
          ) : null}
        </div>
      ) : (
        <label className="fr-line-field">
          <span className="fr-line-label">{W.numberLabel}</span>
          <input
            className="fr-find-input"
            inputMode="tel"
            autoComplete="tel"
            placeholder={W.numberPlaceholder}
            value={shown}
            onChange={(e) => change({ number: e.target.value })}
            onBlur={() => setBoxLeft(true)}
            aria-invalid={boxLeft && ph.boxProblem ? true : undefined}
            aria-describedby={boxLeft && ph.boxProblem ? "fr-phone-number-problem" : undefined}
            data-testid="fr-phone-number-box"
          />
          <window.FieldError id="fr-phone-number-problem" message={boxLeft ? ph.boxProblem : null} testid="fr-phone-number-problem" />
        </label>
      )}
      {ph.plan ? (
        <div className="fr-trial" data-testid="fr-plan">
          <span className="fr-trial-offer">{ph.plan.offer}</span>
          <span className="fr-trial-note">{ph.plan.note}</span>
        </div>
      ) : null}
      {foot}
    </div>
  );
};

// When Try it opened, kept in the tab (the loading standard's drafts): a call from before it is not the test, and a
// reload keeps listening from the same moment. A mark older than FR_TRY_FRESH_MS is a visit long gone, and the step
// listens from now.
const FR_TRY_DRAFT = "first-run-try";
const FR_TRY_FRESH_MS = 2 * 3600_000;
/** The test window's length (line_forwarding_test): opened again only once this has passed. */
const FR_TRY_WINDOW_MS = 30 * 60_000;
const frTrySince = () => {
  const now = Date.now();
  try {
    const kept = window.__tabMemory && window.__tabMemory.draft(FR_TRY_DRAFT);
    if (kept && typeof kept.since === "number" && now - kept.since < FR_TRY_FRESH_MS) return kept.since;
    if (window.__tabMemory) window.__tabMemory.keepDraft(FR_TRY_DRAFT, { since: now });
  } catch { /* the tab keeps nothing: listen from now */ }
  return now;
};

/**
 * Try it (canvas R6–R8, P6, P7, V7, V8; contracts first-run-try.ts): the owner calls the number customers call, from
 * their cell, and the page follows the call on the Live page's own read -- listening, "It picked up" the moment it
 * starts, the words a turn behind, then the whole call and where a caller who asks for a person goes. `tr` is the step
 * as contracts say it. For a kept number not yet proven, the test window opens as the screen does (the call webhook
 * proves forwarding only inside one). The transfer saves through the Business tab's one saver, as that tab's row does;
 * the skip asks once (V8), then puts the wait off for this member (TRY_SKIPPED), and Today keeps its row.
 */
const FrTry = ({ tr, W, flash, go, leave, back, backLabel }) => {
  const P = window.__setup;
  const F = window.__firstRun;
  const [nudged, setNudged] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  // The choice pressed, shown until Setup's read says the same (the save re-reads it), or let go on a refusal. Saved once
  // the keys settle (FR_SETTLE_MS): arrowing through the three is one save, of the last.
  const [picked, setPicked] = React.useState(null);
  const settled = useFrSettled(React.useRef(null));
  const t0 = tr.transfer;
  React.useEffect(() => { if (picked && t0 && t0.value === picked) setPicked(null); }, [t0 && t0.value]);
  // The test window, as the screen opens and again once it runs out while the owner is still listening (the call
  // webhook proves forwarding only inside one). At most once a window: FR_TRY_WINDOW_MS apart.
  const opened = React.useRef(0);
  React.useEffect(() => {
    const listening = tr.stage === "listen" || tr.stage === "quiet";
    if (!tr.openTest || !listening || Date.now() - opened.current < FR_TRY_WINDOW_MS) return;
    if (!P || !P.forwarding || !(window.canDo && window.canDo("disconnect"))) return;
    opened.current = Date.now();
    P.forwarding.test(tr.openTest).then((r) => { if (!r.ok) flash({ tone: "danger", msg: <>{r.message}</> }); });
  }, [tr.openTest, tr.stage]);
  const skip = async () => {
    if (!nudged) { setNudged(true); return; }
    if (busy || !P) return;
    setBusy(true);
    const r = await P.later(F.trySkipped, true);
    setBusy(false);
    if (!r.ok) { flash(window.refusalToast(r, W.notSaved)); return; }
    go("start");
  };
  const help = async () => {
    if (busy || !P || !(window.canDo && window.canDo("approve"))) return;
    setBusy(true);
    const r = await P.request("forwarding");
    setBusy(false);
    flash(r.ok ? { tone: "ok", msg: <>{W.helpSent}</> } : window.refusalToast(r, W.helpFailed));
  };
  // Where a caller who asks for a person goes: the Business tab's own row and patch (an empty number takes a message).
  const choose = (o) => {
    const S = window.__businessTabSave;
    if (!S || !(window.canDo && window.canDo("settings"))) return;
    // The saver goes on the settings read's config: without it, nothing would be sent, so it says so instead.
    if (!S.saver.base()) { flash({ tone: "danger", msg: <>{W.notReadYet}</> }); return; }
    setPicked(o.key);
    settled({
      send: () =>
        S.saver.save({
          row: "handoff_number",
          change: S.PATCH_OF.handoff_number(o.to || ""),
          said: null,
          done: () => flash({ tone: "ok", msg: <>{W.saved}</> }),
          flash: (f) => { if (f && f.tone === "danger") { setPicked(null); flash(f); } },
        }),
    });
  };
  const turns = tr.call ? (
    <ol className="fr-try-turns" data-testid="fr-try-turns">
      {tr.call.turns.map((t, i) => (
        <li key={i} className={t.agent ? "fr-try-turn is-agent" : "fr-try-turn"}>
          <span className="fr-try-who">{t.who}</span>
          <span className="fr-try-said">{t.text}</span>
        </li>
      ))}
    </ol>
  ) : null;
  const skipper = (
    <div className="fr-try-skip" data-testid="fr-try-skip">
      {nudged ? <p className="fr-check-note" data-testid="fr-try-nudge">{tr.skip.nudge}</p> : null}
      <div className="fr-code-links">
        {nudged ? <button type="button" className="fr-find-link" onClick={() => setNudged(false)} data-testid="fr-try-stay">{tr.skip.stay}</button> : null}
        <button type="button" className="fr-find-link" onClick={skip} disabled={busy} data-testid="fr-try-skip-go">{nudged ? tr.skip.anyway : tr.skip.label}</button>
      </div>
    </div>
  );
  if (tr.stage === "listen" || tr.stage === "quiet") {
    const l = tr.listening;
    return (
      <div className="fr-line-step" data-testid="fr-try" data-stage={tr.stage}>
        <span className="fr-code-dial tabular" data-testid="fr-try-number">{tr.number}</span>
        <div className="fr-try-listen" role="status">
          <span className="fr-try-pulse" aria-hidden="true" />
          <span className="fr-line-sentence">{l.sentence}</span>
          <span className="fr-line-detail">{l.detail}</span>
        </div>
        {l.route ? <p className="fr-code-off" data-testid="fr-try-route">{l.route}</p> : null}
        {tr.causes.length ? (
          <dl className="fr-try-causes" data-testid="fr-try-causes">
            {tr.causes.map((c) => (
              <div key={c.question}><dt>{c.question}</dt><dd>{c.answer}</dd></div>
            ))}
          </dl>
        ) : null}
        {tr.stage === "quiet" ? (
          <div className="fr-code-links">
            {tr.forwarded ? <button type="button" className="fr-find-link" onClick={() => go("start/phone")} data-testid="fr-try-code">{W.showCode}</button> : null}
            {tr.help ? <button type="button" className="fr-find-link" onClick={help} disabled={busy} data-testid="fr-try-help" {...window.gate("approve", "ask for help")}>{tr.help}</button> : null}
          </div>
        ) : null}
        {skipper}
      </div>
    );
  }
  if (tr.stage === "call") {
    return (
      <div className="fr-line-step" data-testid="fr-try" data-stage="call">
        <p className="fr-line-started" data-testid="fr-try-proof"><Icon name="check" size={12} />{tr.call.line}</p>
        {turns}
        <p className="fr-line-detail">{tr.call.behind}</p>
      </div>
    );
  }
  const t = tr.transfer;
  const value = picked || t.value;
  return (
    <div className="fr-line-step" data-testid="fr-try" data-stage="done">
      <p className="fr-line-detail" data-testid="fr-try-meta">{tr.call.line}</p>
      {turns}
      <span className="fr-line-label" id="fr-try-transfer-label">{t.label}</span>
      <div className="fr-find-hits" role="radiogroup" aria-labelledby="fr-try-transfer-label" data-testid="fr-try-transfer">
        {t.options.map((o) => (
          <label key={o.key} className="fr-find-hit" data-testid={`fr-try-transfer-${o.key}`}>
            <input type="radio" name="fr-try-transfer" value={o.key} checked={value === o.key} onChange={() => choose(o)} {...window.gate("settings", "choose where callers are put through")} />
            <span className="fr-find-body">
              <span className="fr-find-name">{o.label}</span>
              <span className="fr-find-where">{o.sentence}</span>
            </span>
          </label>
        ))}
      </div>
      {t.note ? <p className="fr-code-off" data-testid="fr-try-note">{t.note}</p> : null}
      <div className="fr-foot">
        {back ? <button type="button" className="btn btn-ghost btn-sm" onClick={() => go(back)} data-testid="fr-back">{backLabel}</button> : <span />}
        <button type="button" className="fr-find-link" onClick={() => leave(tr.call.to)} data-testid="fr-try-inbox">{W.inbox}</button>
        <button type="button" className="fr-onward" onClick={() => go("start")} data-testid="fr-try-go">{W.continue}</button>
      </div>
    </div>
  );
};

/**
 * Live (canvas R9, P8; contracts first-run-live.ts): what the owner set up, in four lines with a way to change each,
 * the greeting every caller hears, and what it will and will not do -- the Business tab's own card, reading calls as
 * live since Finish is what records them so. Setup's optional rows follow, as they did.
 */
const FrLive = ({ lv, config, brain, canEdit, owner, leave }) => (
  <div className="fr-line-step" data-testid="fr-live">
    <dl className="fr-live-summary" data-testid="fr-live-summary">
      {lv.summary.map((r) => (
        <div key={r.key} className="fr-live-row" data-testid={`fr-live-${r.key}`}>
          <dt className="fr-line-label">{r.label}</dt>
          <dd className="fr-live-value">
            {r.value}
            {r.change && canEdit ? <> <button type="button" className="fr-find-link" onClick={() => leave(r.change.to)}>{r.change.label}</button></> : null}
          </dd>
        </div>
      ))}
    </dl>
    <p className="fr-code-off" data-testid="fr-live-greeting">{lv.greeting}</p>
    {brain && window.BtCanCard ? <window.BtCanCard brain={brain} config={config} canEdit={false} activating={owner ? ["voice"] : null} /> : null}
  </div>
);

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
  // The step's heading takes focus when the step changes, so a screen reader says where the owner is now and the keys
  // start from the top of it; not on the page's first draw, which is its own arrival.
  const drawnParam = React.useRef(param);
  React.useEffect(() => {
    if (drawnParam.current === param) return;
    drawnParam.current = param;
    const h = document.getElementById ? document.getElementById("fr-heading") : null;
    if (h && h.focus) h.focus({ preventScroll: true });
  }, [param]);
  // A move asked while a row on the page holds typing never saved, or a save still out (the record kit's registry,
  // which the Settings rail asks too): the move waits on the owner's answer.
  const [leaving, setLeaving] = React.useState(null);
  // How customers buy, while Check's choice of it waits for the keys to settle: Continue sends that one (useFrSettled).
  const heldAnswer = React.useRef(null);
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
  // The phone step's choice, as the tab keeps it (FR_PHONE_DRAFT), and whether this tab came back from checkout with a
  // card given: Stripe's answer is read once, on arrival.
  const [phoneChoice, setPhoneChoiceState] = React.useState(frPhoneChoiceKept);
  const setPhoneChoice = (c) => { frKeepPhoneChoice(c); setPhoneChoiceState(c); };
  React.useEffect(() => {
    const out = window.__billing && window.__billing.outcome ? window.__billing.outcome() : null;
    const kept = frPhoneChoiceKept();
    // Back with a card: Stripe returns to the first run's bare address, and the step it left is the phone's, which
    // stays on screen once its line answers (a number kept still has its forwarding to set).
    if (out === "success" && kept && kept.pending) {
      setPhoneChoice({ ...kept, returnedAt: Date.now() });
      if (param !== "phone") onNavigate("start/phone", { replace: true });
    }
    if (out === "cancel" && window.__firstRun) {
      if (kept) setPhoneChoice({ ...kept, pending: false, sent: false, returnedAt: null });
      flash({ msg: <>{window.__firstRun.phoneWords.cancelled}</> });
    }
  }, []);
  useFrTick("surface:live");
  // When Try it opened (FR_TRY_DRAFT): set as it is first drawn, so a call before it is not the test.
  const trySince = React.useRef(null);
  // Finish on Live, while its activation is on its way: pressed once. Refused once, the next Finish just goes on.
  const [finishing, setFinishing] = React.useState(false);
  const finishRefused = React.useRef(false);
  // Whether Try it is on screen, so it stays there (below) and its clock and quiet turn move each second.
  const onTry = React.useRef(false);
  React.useEffect(() => {
    const t = setInterval(() => { if (onTry.current) redraw(); }, 1000);
    return () => clearInterval(t);
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
  // Asked first while typing on the page was never saved (the record kit's own answer, __settingsUnsaved).
  const askFirst = (move) => {
    if (window.__settingsUnsaved && window.__settingsUnsaved()) {
      setLeaving({ move, saving: !!(window.__settingsSaving && window.__settingsSaving()) });
      return;
    }
    move();
  };
  const leave = (to) => askFirst(() => onNavigate(to));
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
  // Who is looking, for Find: whoever may set the workspace up (an owner, or the partner who brought it), by the
  // role gate (View-as included), and what the business goes by.
  const who = {
    owner: !!(window.canDo && window.canDo("settings")),
    receptionistName: S.dto.business.name,
    workspaceName: (frWorkspace() || {}).name || null,
  };
  // Check stays on screen while the owner is on it. Its step is done the moment its last fact lands (a service saved in
  // its sheet), and the first run, which opens where the workspace is, would go on to the phone under them; they go on
  // with Looks right instead. So once Check is drawn, the business step is asked for by name until the owner moves.
  const asked = F.of(S.vm, param, who);
  // Try it stays on screen too: its step is done the moment the test call reaches the receptionist (Setup reads it as
  // the call starts or ends), and the call, its words and where transfers go are still to be shown.
  const fr =
    !param && onCheck.current && asked.shown.key !== "business"
      ? F.of(S.vm, "business", who)
      : !param && onTry.current && asked.shown.key !== "try"
        ? F.of(S.vm, "try", who)
        : asked;
  onCheck.current = !!fr.check;
  const card = F.receptionist(frCardInputs(S));
  const step = fr.shown;
  // The phone step as contracts say it over Setup and the owner's choice (first-run-phone.ts); `rows` is Setup's own.
  const ph = step.key === "phone" ? F.phone({ dto: S.dto, vm: S.vm, choice: phoneChoice, returned: frReturned(phoneChoice), nowMs: Date.now() }) : null;
  const phoneDrawn = !!ph && ph.stage !== "rows";
  // Try it as contracts say it over Setup and the Live page's calls (first-run-try.ts); `rows` is Setup's own.
  const liveNow = window.__LIVE || null;
  if (step.key === "try" && trySince.current === null) trySince.current = frTrySince();
  const tr =
    step.key === "try"
      ? F.tryIt({
          dto: S.dto,
          calls: liveNow ? [...(liveNow.now || []), ...(liveNow.recent || [])] : [],
          since: trySince.current,
          nowMs: Date.now(),
        })
      : null;
  const tryDrawn = !!tr && tr.stage !== "rows";
  onTry.current = tryDrawn;
  // Live as contracts say it (first-run-live.ts), over Setup and the settings read's alert addresses and name.
  const cfgNow = (window.__SETTINGS && window.__SETTINGS.config) || null;
  const lv =
    step.key === "live"
      ? F.live({
          dto: S.dto,
          emails: (cfgNow && cfgNow.notifications && cfgNow.notifications.escalation_emails) || [],
          business: S.dto.business.name,
          owner: !!(window.canDo && window.canDo("settings")),
        })
      : null;
  // The step's foot is the phone step's own while its button is the one to press. A role that may not save the
  // forwarding has nothing to press in the questions, and the step is done then (its line answers): the page's own
  // foot, with Continue.
  const phoneFoot = phoneDrawn && !!ph.cta && !(ph.stage === "ask" && !(window.canDo && window.canDo("disconnect")));
  // Whether this role may change the business, as the Business tab asks it: its rows' acts, and the answer's door.
  const canEdit = !window.canDo || window.canDo("settings");
  // The step on screen is the address's, replaced rather than pushed, so the browser's Back leaves the first run. A
  // move opens the next step at its top: the shell is the page's scroll (first-run.css).
  const go = (to) =>
    askFirst(() => {
      onCheck.current = false;
      onTry.current = false;
      onNavigate(to, { replace: true });
      const shell = document.querySelector ? document.querySelector(".fr-shell") : null;
      if (shell && shell.scrollTo) shell.scrollTo(0, 0);
    });
  // Set the receptionist up from what is known, where none is: once at a time, and a refusal said in its words.
  const make = async () => {
    if (making || !window.__setup || !window.__setup.receptionist) return;
    setMaking(true);
    const r = await window.__setup.receptionist();
    setMaking(false);
    if (!r.ok) flash(window.refusalToast(r, W.check.notMade));
  };
  // Finish, on Live: calls switched on by the owner (the capability's activation, which the first run's first time also
  // emails them that it answers), then Today. A refusal is said here and the step stays, so it is read; Finish again
  // goes on to Today, since nothing here holds the owner.
  const finish = async (to) => {
    if (finishing) return;
    const P = window.__setup;
    const voice = S.dto.channels.voice;
    const activated = (S.dto.activations || []).some((a) => a.capability === "voice" && !a.deactivated_at);
    if (!finishRefused.current && P && P.activate && voice.active && !activated && window.canDo && window.canDo("disconnect")) {
      setFinishing(true);
      const r = await P.activate("voice", { firstRun: true });
      setFinishing(false);
      if (!r.ok) {
        finishRefused.current = true;
        flash(window.refusalToast(r, W.notFinished));
        return;
      }
    }
    leave(to);
  };
  const onward = () => {
    const o = fr.onward;
    if (o.held) return;
    if (!fr.check) {
      if (step.key === "live") finish(o.to);
      else if (o.leaves) leave(o.to);
      else go(o.to);
      return;
    }
    // Looks right: the answer to how customers buy, as Check shows it, is sent where none is stored (as the create card
    // sends it), and the step goes on once it is taken. A role that may not change the workspace sends nothing: the
    // door would refuse it, and the step goes on as it is.
    // The answer being chosen, if one waits for the keys to settle, goes now in its place.
    const a = frAnswer();
    const chosen = heldAnswer.current;
    heldAnswer.current = null;
    const answer = chosen ? chosen.next : a && !a.stored ? a.shown : null;
    if (!canEdit || !a || !answer || !frSendAnswer(answer, flash, () => go(o.to))) go(o.to);
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
            <h1 className="fr-heading" id="fr-heading" tabIndex={-1} data-testid="fr-heading">{phoneDrawn ? ph.heading : tryDrawn ? tr.heading : lv ? lv.heading : fr.heading}</h1>
            {(phoneDrawn ? ph.lead : tryDrawn ? tr.lead : lv ? lv.lead : fr.lead) ? <p className="fr-lead">{phoneDrawn ? ph.lead : tryDrawn ? tr.lead : lv ? lv.lead : fr.lead}</p> : null}
          </div>
          {fr.find ? <FrFind W={W.find} flash={flash} done={fr.findDone} go={go} make={make} /> : null}
          {fr.check ? <FrCheck check={fr.check} W={W.check} flash={flash} make={make} making={making} go={go} canEdit={canEdit} held={heldAnswer} /> : null}
          {phoneDrawn ? <FrPhone ph={ph} choice={phoneChoice} setChoice={setPhoneChoice} W={F.phoneWords} flash={flash} go={go} back={fr.back} backLabel={W.back} ownFoot={phoneFoot} /> : null}
          {tryDrawn ? <FrTry tr={tr} W={F.tryWords} flash={flash} go={go} leave={leave} back={fr.back} backLabel={W.back} /> : null}
          {step.key === "try" && !tryDrawn && S.vm.tryIt ? <window.SetupTry tryIt={S.vm.tryIt} /> : null}
          {lv ? <FrLive lv={lv} config={cfgNow} brain={cfgNow && cfgNow.brain} canEdit={canEdit} owner={!!(window.canDo && window.canDo("disconnect"))} leave={leave} /> : null}
          {!fr.find && !fr.check && !phoneDrawn && !tryDrawn && step.rows.length ? (
            <div className="fr-part">
              {step.key === "live" ? <h2 className="fr-sub">{W.liveNext}</h2> : null}
              <section className="tq fr-rows">
                <window.SetupRows S={S} rows={step.rows} look="row" primary={fr.primaryRow} later={W.putOff} testid="fr-rows" />
              </section>
            </div>
          ) : null}
          {(fr.back || fr.onward) && !phoneFoot && !(tryDrawn && tr.stage === "done") ? (
            <div className="fr-foot">
              {fr.back ? <button type="button" className="btn btn-ghost btn-sm" onClick={() => go(fr.back)} data-testid="fr-back">{W.back}</button> : <span />}
              {fr.onward && fr.onward.held ? <span className="fr-held" id="fr-held" data-testid="fr-held">{fr.onward.held}</span> : null}
              {lv && lv.finish.note ? <span className="fr-live-note" data-testid="fr-live-note">{lv.finish.note}</span> : null}
              {fr.onward ? (
                <button
                  type="button"
                  className="fr-onward"
                  onClick={onward}
                  // Held, it stays in reach and says why beside it, as a gated act does: never `disabled`, which lets go of focus.
                  aria-disabled={fr.onward.held ? true : undefined}
                  aria-describedby={fr.onward.held ? "fr-held" : undefined}
                  aria-busy={finishing || undefined}
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
      {leaving ? (
        <window.Confirm
          question={leaving.saving ? W.leave.savingQuestion : W.leave.question}
          detail={leaving.saving ? W.leave.savingDetail : W.leave.detail}
          yes={W.leave.yes}
          no={W.leave.no}
          danger={!leaving.saving}
          onYes={() => { const { move } = leaving; setLeaving(null); move(); }}
          onNo={() => setLeaving(null)}
          testid="fr-leave"
        />
      ) : null}
      {toastNode}
    </div>
  );
};

window.FirstRun = FirstRun;
