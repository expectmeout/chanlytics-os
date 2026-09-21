/* global React, Icon, LeadShape */
// The peek: one lead, beside the table (408px) or full height on a phone, and everything the owner does to it
// without leaving the rows -- the stage, Not a fit, Keep and Exclude, Put back, a call from their own phone, and a
// draft for their own inbox. Hookless, as the page's rules ask: every piece of state here is ClientsAReal's
// (peekId, peekMode, armed, draft), handed down, so the tests' stub React keys its hooks by one call order.
//
// Nothing in this file writes a sentence of its own. The words are contracts' (window.__LEAD_WORDS) and the view
// model is contracts' (window.__leadPeekVM), so a word the owner reads is spelled once; the toasts are the route's
// own sentences, because the door decides what happened (a stage click never converts: PRD 9.6).

const LD_MARKS = {
  check: "M3.5 8.5l3 3 6-6.5",
  cross: "M4.5 4.5l7 7M11.5 4.5l-7 7",
};

// `LeadShape` is `leads-scope.jsx`'s (Task 2), which draws the same five shapes for the same five email states and
// is loaded before this file. It is read from `window` here and declared nowhere twice; `.ld-shape*` is one class
// in one stylesheet.

/**
 * A check's mark. Nothing Claude read wears a plain check (PRD 0.1, P2): what was seen gets the check, what was read
 * gets a dashed ring, and either can say it could not tell.
 */
const ldCheckMark = (how, answer) => {
  const p = { width: 13, height: 13, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true" };
  if (answer === "unknown") return <span className="pk-ck-mark pk-ck-ask"><svg {...p}><path d="M6 6.2a2 2 0 113 1.8v1" /><circle cx="8" cy="11.6" r="0.8" fill="currentColor" stroke="none" /></svg></span>;
  if (answer === "no") return <span className={`pk-ck-mark pk-ck-cross${how === "read" ? " pk-ck-read" : ""}`}><svg {...p}><path d={LD_MARKS.cross} /></svg></span>;
  if (how === "read") return <span className="pk-ck-mark pk-ck-read"><svg {...p}><circle cx="8" cy="8" r="5.5" strokeDasharray="2.5 2.5" /></svg></span>;
  return <span className="pk-ck-mark pk-ck-check"><svg {...p}><path d={LD_MARKS.check} /></svg></span>;
};

/** Esc backs out one step: the photo it expanded, the question it asked, then the pane it opened, then the peek itself. */
const leadPeekEscape = ({ mode, armed, setMode, setArmed, setPeekId, lightbox = null, setLightbox = null }) => {
  if (lightbox && setLightbox) { setLightbox(null); return "lightbox"; }
  if (armed && armed.asked) { setArmed(null); return "armed"; }
  if (mode && mode !== "info") { setMode("info"); return "mode"; }
  setPeekId(null);
  return "peek";
};
/**
 * The dialog's focus rule: focus moves into the peek when it opens, and back to the row when it closes. The row is
 * the cursor (`lead-<id>`, the table's own id from its noun), so Tab carries on from where the owner was.
 */
const leadPeekFocus = (peekId, cursor) => {
  const doc = window.document;
  if (!doc || !doc.getElementById) return;
  const el = peekId ? doc.getElementById("lead-peek-close") : cursor && doc.getElementById(`lead-${cursor}`);
  if (el && el.focus) el.focus({ preventScroll: true });
};
/** The peek follows the row cursor only while it is just showing the lead: a question or a draft holds it still. */
const leadPeekFollows = (mode, armed) => (!mode || mode === "info") && !armed;

/**
 * The head (D5): a photo band -- the listing's photo, or the tile's initials on the kind's tint when there is none or
 * it fails to load -- with Expand and Close over it; then the identity: the name, the sub-line with today's hours,
 * their own words, and where they are with the distance.
 */
const LeadPeekHead = ({ vm, onClose, onExpand, deck }) => {
  const W = window.__LEAD_WORDS;
  return (
    <>
      <div className={`pk-band tint-${vm.tile.tint}`} data-testid="peek-photo-band">
        <span className="pk-band-initials" aria-hidden="true">{vm.tile.initials}</span>
        {/* Who the company is comes first, so the mark paints LAST and covers the photograph, exactly as it does on
            the row's tile. The photograph is what Expand is for. The two are stacked rather than chosen, so a mark
            that fails to load hides its own layer and uncovers the photo, and no state decides anything (D6). */}
        {vm.image ? <img src={vm.image} alt="" loading="lazy" data-testid="peek-photo" onError={(e) => { const t = e && e.currentTarget; if (t && t.parentNode && t.parentNode.classList) t.parentNode.classList.add("no-img"); }} /> : null}
        {vm.tile.logo ? <img className="pk-band-mark" src={vm.tile.logo} alt="" loading="lazy" data-testid="peek-mark" onError={(e) => { const t = e && e.currentTarget; if (t && t.style) t.style.display = "none"; }} /> : null}
        <button type="button" className="pk-band-expand" data-testid="peek-expand" onClick={onExpand}><Icon name="external" size={11} />{W.expand}</button>
        <button type="button" className="pk-x pk-band-x" id="lead-peek-close" aria-label={W.close} data-testid="peek-close" onClick={onClose}><Icon name="x" size={16} /></button>
      </div>
      {/* One lead at a time (D5), on a phone: where you are in the pile, and the two ways through it. A swipe does
          the same, and both move the page's own cursor, so the rows behind the peek move with it. */}
      {deck ? (
        <div className="pk-deck" data-testid="peek-deck">
          <button type="button" className="pk-deck-btn prev" aria-label={W.deckPrev} data-testid="peek-deck-prev" disabled={deck.at <= 1} onClick={deck.onPrev}><Icon name="chevron" size={13} /></button>
          <span className="pk-deck-n" data-testid="peek-deck-at">{W.deckOf(deck.at, deck.of)}</span>
          <button type="button" className="pk-deck-btn" aria-label={W.deckNext} data-testid="peek-deck-next" disabled={deck.at >= deck.of} onClick={deck.onNext}><Icon name="chevron" size={13} /></button>
        </div>
      ) : null}
      <div className="pk-identity" data-testid="peek-identity">
        <h2 className="pk-name" data-testid="peek-name">{vm.name}</h2>
        <div className="pk-sub-line">
          <span className="pk-sub" data-testid="peek-sub">{vm.sub}</span>
          {vm.today ? <span className={`pk-today${/^Closed/.test(vm.today) ? " closed" : ""}`} data-testid="peek-today"><Icon name="clock" size={11} />{vm.today}</span> : null}
        </div>
        {vm.about ? <p className="pk-about" data-testid="peek-about">{vm.about}</p> : null}
        {vm.where ? (
          <div className="pk-where" data-testid="peek-where-block">
            {vm.where.href
              ? <a href={vm.where.href} target="_blank" rel="noopener noreferrer" data-testid="peek-where"><Icon name="pin" size={12} />{vm.where.line}</a>
              : <span data-testid="peek-where"><Icon name="pin" size={12} />{vm.where.line}</span>}
            {vm.distance ? <span className="pk-distance" data-testid="peek-distance">{vm.distance}</span> : null}
          </div>
        ) : null}
        {!vm.rated && vm.claimedNote ? <div className="pk-where"><span className="pk-quiet" data-testid="peek-claimed"><Icon name="info" size={12} />{vm.claimedNote}</span></div> : null}
      </div>
    </>
  );
};

/** What people say (D5): the score large, the count, one bar a star, and whether anyone watches the listing. */
/**
 * The shape of the evidence, at a glance: one mark a check, in the order they were made.
 *
 * It is ONE svg, not a row of sized spans, and that is the whole point. An empty span gets its size only from the
 * cascade, so any parent that lays out differently than the stylesheet expects -- a flex line that stretches it, a
 * rule that arrives without its width -- turns a 7px dot into a lozenge, and on production these drew at two
 * different sizes on the same line. An svg carries its geometry in its own attributes and its circles keep their
 * aspect ratio inside the viewBox, so there is nothing here for a parent to stretch.
 */
const LeadCheckDots = ({ dots }) => {
  if (!dots || !dots.length) return null;
  const R = 3.5;
  const STEP = 10;
  const w = dots.length * STEP - (STEP - 2 * R);
  return (
    <svg className="pk-dots" width={w} height={2 * R} viewBox={`0 0 ${w} ${2 * R}`} aria-hidden="true" focusable="false" data-testid="peek-check-dots">
      {dots.map((d, i) => <circle key={`${d}-${i}`} className={`pk-dot ${d}`} cx={i * STEP + R} cy={R} r={R} />)}
    </svg>
  );
};

const LeadPeekRated = ({ vm }) => {
  const W = window.__LEAD_WORDS;
  return (
    <div className="pk-rated" data-testid="peek-rated">
      <div className="pk-label">{W.ratedHeading}</div>
      {/* One line, not five bars (D7). The bars drew on every lead and said the same thing the average already said,
          except in the one case the average hides -- so that case is the only thing left, and it is said in words. */}
      <div className="pk-rated-head">
        <span className="pk-rated-score">{vm.rated.score}</span>
        <span className="pk-rated-count">{vm.rated.count} reviews</span>
        {vm.rated.low ? <span className="pk-rated-low" data-testid="peek-rated-low">{vm.rated.low}</span> : null}
      </div>
      {vm.claimedNote ? <div className="pk-rated-note"><span className="pk-quiet" data-testid="peek-claimed"><Icon name="info" size={12} />{vm.claimedNote}</span></div> : null}
    </div>
  );
};

/**
 * The photo, expanded (D5): the one photo the listing gave (or the tile), and beside it what is about the place --
 * where it sits, the week's hours as bars, and the listing's facts. The page's own overlay (.pl-peek), so Esc reaches
 * the page's one listener and closes this first.
 */
const LeadLightbox = ({ vm, onClose }) => {
  const W = window.__LEAD_WORDS;
  return (
    <>
      <div className="ld-lightbox-backdrop" onClick={onClose} />
      <div className="ld-lightbox pl-peek" role="dialog" aria-label={`${W.photos}: ${vm.name}`} data-testid="lead-lightbox">
        <div className="ld-lb-head">
          <div className="ld-lb-titles">
            <div className="ld-lb-name">{vm.name}</div>
            <div className="ld-lb-sub">{vm.sub}</div>
          </div>
          <span className="sp" />
          {vm.links.maps ? <a className="btn btn-ghost btn-sm" href={vm.links.maps.href} target="_blank" rel="noopener noreferrer" data-testid="lightbox-maps"><Icon name="pin" size={12} />{W.openMaps}</a> : null}
          <button type="button" className="pk-x" aria-label={W.closePhotos} data-testid="lightbox-close" onClick={onClose}><Icon name="x" size={16} /></button>
        </div>
        <div className="ld-lb-body">
          <div className={`ld-lb-photo tint-${vm.tile.tint}`} data-testid="lightbox-photo">
            <span className="ld-lb-initials" aria-hidden="true">{vm.tile.initials}</span>
            {vm.image ? <img src={vm.image} alt="" onError={(e) => { const t = e && e.currentTarget; if (t && t.parentNode && t.parentNode.classList) t.parentNode.classList.add("no-img"); }} /> : <span className="ld-lb-nophoto">{W.noPhoto}</span>}
          </div>
          <div className="ld-lb-side">
            {vm.where ? (
              <div className="ld-lb-block" data-testid="lightbox-where">
                <div className="pk-label">{W.whereSits}</div>
                <div className="ld-lb-line">{vm.where.line}</div>
                {vm.distance ? <div className="ld-lb-quiet">{vm.distance} from the search's centre</div> : null}
              </div>
            ) : null}
            {vm.week.length ? (
              <div className="ld-lb-block" data-testid="lightbox-week">
                <div className="pk-label">{W.openHours}</div>
                {vm.week.map((d) => (
                  <div key={d.day} className={`ld-lb-day${d.today ? " today" : ""}`} data-testid="lightbox-day">
                    <span className="d">{d.day.slice(0, 3)}</span>
                    <span className="ld-lb-track">{d.bar ? <span className="ld-lb-bar" style={{ left: `${d.bar.x}%`, width: `${d.bar.w}%` }} /> : null}</span>
                    <span className="h">{d.hours}</span>
                  </div>
                ))}
              </div>
            ) : null}
            {vm.facts.length ? (
              <div className="ld-lb-block" data-testid="lightbox-facts">
                <div className="pk-label">{W.fromListing}</div>
                {vm.facts.map((f) => <div key={f.k} className="ld-lb-fact"><span className="k">{f.k}</span><span className="v">{f.v}</span></div>)}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
};

/** "What makes it not a fit?" -- five whys, one tap each (PRD 9.5). It teaches nothing in this release. */
const LeadNotFitWhy = ({ busy, on }) => {
  const W = window.__LEAD_WORDS;
  return (
    <div className="pop pk-nf pl-peek" role="menu" aria-label={W.notFitTitle} data-testid="peek-why">
      <div className="pop-h">{W.notFitTitle}</div>
      {W.whys.map((w) => (
        <button key={w.id} type="button" role="menuitem" className="pop-row" disabled={busy} data-testid={`peek-why-${w.id}`} onClick={() => on.onWhy(w.id)}>{w.label}</button>
      ))}
    </div>
  );
};

/** "Did you send it?" -- asked when the owner comes back to the tab, never before (PRD 9.3). */
const LeadSentAsk = ({ busy, on }) => {
  const W = window.__LEAD_WORDS;
  return (
    <div className="pk-ask" role="group" aria-label={W.sentQuestion} data-testid="peek-sent-ask">
      <div className="t">{W.sentQuestion}</div>
      <div className="row">
        <button type="button" className="btn btn-primary btn-sm" disabled={busy} data-testid="peek-sent-yes" onClick={on.onSaidSent}>{W.sentYes}</button>
        <button type="button" className="btn btn-ghost btn-sm" data-testid="peek-sent-no" onClick={on.onNotYet}>{W.sentNo}</button>
      </div>
    </div>
  );
};

/** "How did the call go?" -- the six outcomes, a note, and Save (PRD 9.4). On a phone they are a 2 x 3 grid. */
const LeadCallAsk = ({ armed, busy, on, deck }) => {
  const W = window.__LEAD_WORDS;
  const note = (armed && armed.note) || "";
  const left = W.noteMax - note.length;
  return (
    <div className="pk-ask" role="group" aria-label={W.callQuestion} data-testid="peek-call-ask">
      <div className="t">{W.callQuestion}</div>
      <div className="pk-chips" role="radiogroup" aria-label={W.callQuestion}>
        {W.outcomes.map((o) => (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={armed && armed.outcome === o.id}
            className={`pk-chip tone-${o.tone || "plain"}${armed && armed.outcome === o.id ? " on" : ""}`}
            data-testid={`peek-outcome-${o.id}`}
            onClick={() => on.onOutcome(o.id)}
          ><span className="dot" aria-hidden="true" />{o.label}</button>
        ))}
      </div>
      <input
        className="pk-input"
        type="text"
        value={note}
        maxLength={W.noteMax}
        placeholder={W.notePlaceholder}
        aria-label={W.noteLabel}
        aria-describedby="peek-note-left"
        data-testid="peek-note"
        onChange={(e) => on.onNote(e.target.value)}
      />
      <div className="pk-note-left" id="peek-note-left" data-testid="peek-note-left">{W.noteLeft(left, W.noteMax)}</div>
      <div className="pk-note-left">{W.callSavedNote}</div>
      <div className="row">
        <button type="button" className="btn btn-primary btn-sm" disabled={busy || !(armed && armed.outcome)} data-testid="peek-call-save" onClick={on.onSaveCall}>{W.callSave}</button>
        {/* On a phone the pile is the work: save this one and move on in one press (D5). */}
        {deck && deck.at < deck.of
          ? <button type="button" className="btn btn-sm" disabled={busy || !(armed && armed.outcome)} data-testid="peek-call-save-next" onClick={async () => { await on.onSaveCall(); deck.onNext(); }}>{W.callSaveNext}</button>
          : null}
        <button type="button" className="btn btn-ghost btn-sm" data-testid="peek-call-cancel" onClick={on.onCancelCall}>{W.callCancel}</button>
      </div>
    </div>
  );
};

/**
 * The draft (PRD 9.3). To, Subject and the body are shown as written, never as fields: the mailto: the route built is
 * the one the mail app opens, and a body edited here would need encoding the page must not do. Shorter and Warmer ask
 * the route again with what is on screen; the owner does their own editing where they will send it.
 */
const LeadDraftPane = ({ vm, draft, busy, on }) => {
  const W = window.__LEAD_WORDS;
  const d = draft || {};
  return (
    <>
      <div className="pk-top">
        <button type="button" className="btn btn-ghost btn-sm" data-testid="peek-draft-back" onClick={on.onBack}>{`${W.backTo} ${vm.short}`}</button>
      </div>
      <div className="pk-body">
        <div className="pk-draft">
          {d.refusal ? <div className="field-error" role="alert" data-testid="peek-draft-error">{d.refusal}</div> : null}
          <div className="pk-field"><span className="l">{W.to}</span><span className="pk-rv" data-testid="peek-draft-to">{d.to || vm.reach.email.address}</span></div>
          <div className="pk-field"><span className="l">{W.subject}</span><span className="pk-rv" data-testid="peek-draft-subject">{d.subject || ""}</span></div>
          <div className="pk-text" data-testid="peek-draft-body">{d.busy ? W.draftWriting : (d.body || "")}</div>
          <div className="pk-tone">
            <span className="pk-label">{W.draftRewrite}</span>
            {W.tones.map((t) => (
              <button key={t.id} type="button" className={`ask-follow-chip${d.tone === t.id ? " on" : ""}`} disabled={busy || d.busy || !d.body} data-testid={`peek-tone-${t.id}`} onClick={() => on.onTone(t.id)}>{t.label}</button>
            ))}
          </div>
          <div className="pk-foot-note"><Icon name="shield" size={12} /><span data-testid="peek-draft-note">{W.draftNote}</span></div>
        </div>
      </div>
      <div className="pk-foot">
        <a className="btn btn-primary btn-sm" href={d.mailto || "#"} data-testid="peek-open-mail" aria-disabled={!d.mailto} onClick={on.onOpenMail}><Icon name="mail" size={12} />{W.draftOpen}</a>
        <button type="button" className="btn btn-sm" disabled={!d.body} data-testid="peek-copy-draft" onClick={on.onCopyDraft}>{W.copy}</button>
        <span className="sp" />
        <span className="pk-rn">{W.draftFrom}</span>
      </div>
    </>
  );
};

const LeadPeekInfo = ({ vm, mode, armed, busy, on, deck }) => {
  const W = window.__LEAD_WORDS;
  return (
    <>
      <div className="pk-top">
        {vm.canStage ? (
          <>
            <div className="seg" role="radiogroup" aria-label={W.stageLabel} data-testid="peek-stage">
              {vm.stages.map((s) => (
                <button key={s.id} type="button" role="radio" aria-checked={s.on} className={s.on ? "on" : ""} disabled={busy} data-testid={`peek-stage-${s.id}`} onClick={() => on.onStage(s.id)}>{s.label}</button>
              ))}
            </div>
            <span className="sp" />
            <button type="button" className="btn btn-ghost btn-sm" data-testid="peek-not-a-fit" onClick={on.onNotAFit} {...window.gate("find", "set this lead aside")}>{W.notFit}</button>
          </>
        ) : (
          <>
            <span className="pk-out-note" data-testid="peek-left-out">{W.leftOut}</span>
            <span className="sp" />
            <button type="button" className="btn btn-sm" data-testid="peek-put-back" onClick={() => on.onPutBack(vm.id)} {...window.gate("find", "put this lead back")}>{W.putBack}</button>
          </>
        )}
      </div>
      {mode === "why" ? <LeadNotFitWhy busy={busy} on={on} /> : null}
      <div className="pk-body">
        {armed && armed.asked && armed.kind === "sent" ? <LeadSentAsk busy={busy} on={on} /> : null}
        {armed && armed.asked && armed.kind === "call" ? <LeadCallAsk armed={armed} busy={busy} on={on} deck={deck} /> : null}
        {/* The verdict (D5): the fit as a word and the sentence behind it, in a card that wears the fit's tint. */}
        <div className={`pk-verdict ${vm.fit.cls}`} data-testid="peek-verdict">
          <p className="pk-fit" data-testid="peek-fit"><b className={vm.fit.cls}>{`${vm.fit.word}.`}</b>{` ${vm.fit.sentence}`}</p>
        </div>
        {vm.cls === "review" ? (
          <div className="pk-decide" data-testid="peek-decide">
            <button type="button" className="btn btn-sm" data-testid="peek-keep" onClick={() => on.onKeep(vm.id)} {...window.gate("find", "keep this lead")}>{W.keep}</button>
            <button type="button" className="btn btn-ghost btn-sm" data-testid="peek-exclude" onClick={() => on.onExclude(vm.id)} {...window.gate("find", "exclude this lead")}>{W.exclude}</button>
          </div>
        ) : null}
        <div>
          <div className="pk-label">{W.reach}</div>
          {vm.reach.phone ? (
            <div className="pk-rr" data-testid="peek-phone">
              <Icon name="phone" />
              <div>
                <div className={`pk-rv${vm.reach.phone.wrong ? " wrong" : ""}`} data-testid="peek-phone-value">{vm.reach.phone.value}</div>
                <div className="pk-rn">{vm.reach.phone.note}</div>
              </div>
              {vm.reach.phone.tel ? <button type="button" className="btn btn-sm" data-testid="peek-call" onClick={() => on.onCall(vm.id)}><Icon name="phone" size={12} />{W.call}</button> : <span />}
            </div>
          ) : null}
          <div className={`pk-rr${vm.reach.email.address ? "" : " locked"}`} data-testid="peek-email">
            <Icon name="mail" />
            <div>
              <div className="pk-rv">
                <LeadShape state={vm.reach.email.state} />
                <span data-testid="peek-email-value">{vm.reach.email.value}</span>
                <span className="pk-rw" data-testid="peek-email-word">{vm.reach.email.word}</span>
              </div>
              <div className="pk-rn" data-testid="peek-email-note">{vm.reach.email.note}</div>
              {vm.reach.email.standard ? <div className="pk-rn" data-testid="peek-email-standard">{vm.reach.email.standard}</div> : null}
            </div>
            {vm.reach.email.canDraft ? (
              <span className="pk-rr-acts">
                <button type="button" className="btn btn-sm" aria-label={W.copyAria} data-testid="peek-copy" onClick={() => on.onCopy(vm.id)}>{W.copy}</button>
                <button type="button" className="btn btn-sm" data-testid="peek-draft" onClick={() => on.onDraft(vm.id)}><Icon name="edit" size={12} />{W.draft}</button>
              </span>
            ) : <span />}
          </div>
          <div className="pk-rr locked" data-testid="peek-locked">
            <Icon name="chat" />
            <div>
              <div className="pk-rv">{vm.reach.locked.title}</div>
              <div className="pk-rn" data-testid="peek-locked-line">{vm.reach.locked.line}</div>
            </div>
            <span />
          </div>
        </div>
        {vm.rated ? <LeadPeekRated vm={vm} /> : null}
        {/* The checks fold away (D5): the strip says the shape of the evidence and the head says it in words, so the
            act at the foot is reachable without scrolling past seven rows nobody is reading twice. */}
        <details className="pk-box" data-testid="peek-checks">
          {/* The flex row is the span INSIDE the summary, never the summary itself: a <summary> is a disclosure
              widget before it is a box, and where one declines `display: flex` its children stack -- which is how
              this head shipped to production with the strip on a line of its own above the words. */}
          <summary className="pk-box-head" data-testid="peek-checks-summary">
            <span className="pk-box-line">
              <LeadCheckDots dots={vm.checkDots} />
              <span className="pk-box-sum">{vm.checksSummary}</span>
              <Icon name="chevron-down" size={12} />
            </span>
          </summary>
          {vm.groups.map((g) => (
            <div key={g.how} className={`pk-group pk-group-${g.how}`} data-testid={`peek-checks-${g.how}`}>
              <div className="pk-group-label">{g.label}</div>
              <div className="pk-checks">
                {g.checks.map((c) => (
                  <div key={c.key} className={`pk-ck ${g.how}${c.answer === "no" ? " no" : c.answer === "unknown" ? " warn" : ""}`} data-testid={`peek-check-${c.key}`}>
                    {ldCheckMark(g.how, c.answer)}
                    <span className="pk-ck-t">{c.label}{c.reason ? <span className="pk-ck-why">{` — ${c.reason}`}</span> : null}</span>
                    <span className="from">{c.source}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </details>
        {vm.others ? (
          <details className="pk-alt" data-testid="peek-others">
            <summary data-testid="peek-others-summary">{vm.others.summary}</summary>
            <ul>{vm.others.items.map((o) => <li key={o.email}>{`${o.email} — ${o.why}`}</li>)}</ul>
            {vm.others.picked ? <p className="pk-alt-why" data-testid="peek-others-why">{vm.others.picked}</p> : null}
          </details>
        ) : null}
        {/* How it was found folds the same way: one line says it, and the three steps are behind it. */}
        <details className="pk-box" data-testid="peek-found">
          <summary className="pk-box-head" data-testid="peek-found-summary">
            <span className="pk-box-line">
              <Icon name="clock" size={12} />
              <span className="pk-box-sum">{vm.foundSummary}</span>
              <Icon name="chevron-down" size={12} />
            </span>
          </summary>
          <div className="pk-tl">
            {vm.found.map((f) => (
              <div className="pk-tr" key={f.what}><span className="t">{f.at}</span><span>{f.what}</span></div>
            ))}
          </div>
        </details>
        <div className="pk-links" data-testid="peek-links">
          {vm.links.website
            ? <a className="btn btn-ghost btn-sm" href={vm.links.website.href} target="_blank" rel="noopener noreferrer" data-testid="peek-website"><Icon name="external" size={12} />{vm.links.website.label}</a>
            : <span className="pk-rn" data-testid="peek-no-website">{W.noWebsite}</span>}
          {vm.links.instagram
            ? <a className="btn btn-ghost btn-sm" href={vm.links.instagram.href} target="_blank" rel="noopener noreferrer" data-testid="peek-instagram"><Icon name="instagram" size={12} />{W.instagram}</a>
            : null}
          {[["facebook", "globe"], ["linkedin", "globe"], ["tiktok", "globe"], ["maps", "pin"]].map(([k, icon]) => (vm.links[k]
            ? <a key={k} className="btn btn-ghost btn-sm" href={vm.links[k].href} target="_blank" rel="noopener noreferrer" data-testid={`peek-${k}`}><Icon name={icon} size={12} />{vm.links[k].label}</a>
            : null))}
        </div>
      </div>
      {/* The act never scrolls away (D5): Call when there is a number, else the draft; Copy beside it. */}
      <div className="pk-foot pk-act" data-testid="peek-act">
        {vm.reach.phone && vm.reach.phone.tel
          ? <button type="button" className="btn btn-primary pk-act-main" data-testid="peek-act-call" onClick={() => on.onCall(vm.id)}><Icon name="phone" size={13} />{`${W.call} ${vm.reach.phone.value}`}</button>
          : vm.reach.email.canDraft
            ? <button type="button" className="btn btn-primary pk-act-main" data-testid="peek-act-draft" onClick={() => on.onDraft(vm.id)}><Icon name="edit" size={13} />{W.draft}</button>
            : <span className="pk-rn pk-act-none" data-testid="peek-act-none">Nothing to press yet: no number and no address.</span>}
        {vm.reach.email.canDraft ? <button type="button" className="btn btn-sm" aria-label={W.copyAria} data-testid="peek-act-copy" onClick={() => on.onCopy(vm.id)}><Icon name="copy" size={12} />{W.copy}</button> : null}
      </div>
    </>
  );
};

/**
 * One lead, beside the rows. role="dialog" with .pl-peek, which PL_OVERLAY names apart (the page's own overlay), so
 * J and K keep walking the rows behind it and Esc reaches the page's one listener.
 */
const LeadPeek = ({ vm, mode = "info", armed = null, draft = null, busy = false, deck = null, ...on }) => {
  if (!vm) return null;
  // A swipe is the deck's two buttons under a thumb (D5): 80px of travel, and only across, so a scroll is never
  // a move. Nothing is kept between draws -- the start is a property of the element the browser hands back.
  const swipe = deck
    ? {
        onTouchStart: (e) => { const t = e && e.touches && e.touches[0]; if (t) { e.currentTarget.dataset.sx = String(t.clientX); e.currentTarget.dataset.sy = String(t.clientY); } },
        onTouchEnd: (e) => {
          const t = e && e.changedTouches && e.changedTouches[0];
          const sx = Number(e.currentTarget.dataset.sx);
          const sy = Number(e.currentTarget.dataset.sy);
          if (!t || Number.isNaN(sx)) return;
          const dx = t.clientX - sx;
          if (Math.abs(dx) < 80 || Math.abs(t.clientY - sy) > Math.abs(dx)) return;
          if (dx < 0) deck.onNext(); else deck.onPrev();
        },
      }
    : {};
  return (
    <aside className="pk pl-peek" role="dialog" aria-label={vm.name} data-testid="lead-peek" {...swipe}>
      <LeadPeekHead vm={vm} onClose={on.onClose} onExpand={on.onExpand} deck={deck} />
      {mode === "draft"
        ? <LeadDraftPane vm={vm} draft={draft} busy={busy} on={on} />
        : <LeadPeekInfo vm={vm} mode={mode} armed={armed} busy={busy} on={on} deck={deck} />}
    </aside>
  );
};

/**
 * The peek's acts, as named functions over the page's state and the courier. A factory, not a hook: LeadsScope calls
 * it on every draw with what it holds, so nothing here keeps state of its own. Keep, Exclude, Put back and Copy are
 * the scope's own (Task 11); this hands them on so the peek has one shape of props.
 */
const LeadPeekActions = (p) => {
  const api = p.courier || window;
  const vm = p.vm;
  const refuse = (r, what) => p.flash(window.refusalToast ? window.refusalToast(r, what) : { tone: "danger", msg: (r && r.message) || what });
  const undoOf = (undo) => (undo ? async () => {
    const u = await api.__leadUndo(undo.op_id, undo.version);
    if (!u.ok) refuse(u, "Not undone");
  } : undefined);
  // Every sentence here is the route's: the door decided what happened, so the page never guesses (PRD 9.6).
  const said = (d) => p.flash({
    msg: d.toast,
    undo: undoOf(d.undo),
    action: d.converted && d.contact_id ? { label: window.__LEAD_WORDS.open, onClick: () => p.onOpenPerson(d.contact_id) } : undefined,
  });
  const post = async (input, what) => {
    const r = await api.__leadStage(vm.id, input);
    if (!r.ok) { refuse(r, what); return null; }
    said(r.data);
    return r.data;
  };
  const armFor = (kind) => p.setArmed({ kind, leadId: vm.id, asked: false, outcome: null, note: "" });
  // The owner's own phone and their own mail app: an href this page hands to the browser, never a call we place.
  const dial = p.dial || ((href) => { if (href && window.location && window.location.assign) window.location.assign(href); });
  return {
    onClose: () => { p.setArmed(null); p.setMode("info"); p.setDraft(null); p.setPeekId(null); },
    // The photo, expanded (D5): the page's own state, handed in as `expand`.
    onExpand: () => { if (p.expand) p.expand(vm.id); },
    onStage: (stage) => post({ kind: "stage", stage }, "Not changed"),
    onBack: () => p.setMode("info"),
    onNotAFit: () => p.setMode("why"),
    onWhy: async (why) => { p.setMode("info"); await post({ kind: "not_a_fit", why }, "Not set aside"); },
    onKeep: p.keep,
    onExclude: p.exclude,
    onPutBack: p.putBack,
    onCopy: p.copyEmail,
    // The owner's own phone dials; the question waits until they are back at the tab.
    onCall: () => { armFor("call"); dial(vm.reach.phone ? vm.reach.phone.tel : null); },
    onOutcome: (outcome) => p.setArmed({ ...p.armed, outcome }),
    onNote: (note) => p.setArmed({ ...p.armed, note: note.slice(0, window.__LEAD_WORDS.noteMax) }),
    onCancelCall: () => p.setArmed(null),
    onSaveCall: async () => {
      const a = p.armed;
      if (!a || !a.outcome) return;
      p.setArmed(null);
      await post({ kind: "outcome", outcome: a.outcome, ...(a.note ? { note: a.note } : {}) }, "Not recorded");
    },
    // The draft: the route writes it and builds the mailto:, so the page encodes nothing.
    onDraft: async () => {
      p.setMode("draft");
      p.setDraft({ busy: true, tone: "first", to: vm.reach.email.address, subject: "", body: "", mailto: null, refusal: null });
      const r = await api.__leadDraft(vm.id, { tone: "first" });
      if (!r.ok) { p.setDraft({ busy: false, tone: "first", to: vm.reach.email.address, subject: "", body: "", mailto: null, refusal: r.message }); return; }
      p.setDraft({ busy: false, tone: "first", to: r.data.to, subject: r.data.subject, body: r.data.body, mailto: r.data.mailto, refusal: null });
    },
    onTone: async (tone) => {
      const d = p.draft || {};
      p.setDraft({ ...d, busy: true, tone, refusal: null });
      const r = await api.__leadDraft(vm.id, { tone, previous: { subject: d.subject, body: d.body } });
      if (!r.ok) { p.setDraft({ ...d, busy: false, tone, refusal: r.message }); return; }
      p.setDraft({ busy: false, tone, to: r.data.to, subject: r.data.subject, body: r.data.body, mailto: r.data.mailto, refusal: null });
    },
    // Opening the mail app or copying the words is the moment they might send it; Draft alone is not.
    onOpenMail: () => { if (p.draft && p.draft.mailto) armFor("sent"); },
    onCopyDraft: async () => {
      const d = p.draft || {};
      if (!d.body) return;
      if (window.navigator && window.navigator.clipboard) await window.navigator.clipboard.writeText(`${d.subject}\n\n${d.body}`);
      armFor("sent");
      p.flash({ msg: window.__LEAD_WORDS.copiedDraft });
    },
    onSaidSent: async () => { p.setArmed(null); await post({ kind: "emailed" }, "Not marked"); },
    onNotYet: () => p.setArmed(null),
  };
};

/**
 * The tab comes back, so the peek may ask. Armed when the owner left for their phone or their mail app; asked only
 * once they are here to answer. One listener pair, taken down with the arming.
 */
const leadArmOnReturn = (armed, setArmed) => {
  if (!armed || armed.asked) return undefined;
  const wake = () => { if (!window.document || !window.document.hidden) setArmed((a) => (a && !a.asked ? { ...a, asked: true } : a)); };
  window.addEventListener("focus", wake);
  window.document.addEventListener("visibilitychange", wake);
  return () => {
    window.removeEventListener("focus", wake);
    window.document.removeEventListener("visibilitychange", wake);
  };
};

// LeadNotFitWhy is published because the bulk bar asks the same five whys for a selection (Task 15): one list,
// declared here where it is drawn first, never a second copy in leads-scope.jsx.
Object.assign(window, { LeadPeek, LeadPeekActions, LeadNotFitWhy, LeadLightbox, leadPeekEscape, leadPeekFollows, leadPeekFocus, leadArmOnReturn });
