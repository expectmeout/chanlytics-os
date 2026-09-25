/* global React */
// Chanlytics -- People › Leads: a search's band and the review bench over its finds. Moved whole from leads-scope.jsx
// (Reach out Part 2.5), which reads them from window.
// leads-cells.jsx, which loads before this file.
const { LeadTile, LeadSlot } = window;

/* ------------------------------------------------- the three classes (§8.7) */

// Qualified · Needs review · Excluded, under the search that is open: each a count and a view (c-qualified,
// c-review, c-excluded). The class is not a stage (§9.1): it says whether the place met the plan.
/// The band (D5): one element that says the search's whole shape and filters it. The three classes with their
// counts are the tabs -- a segmented control whose marker slides to the one that is open, over a hairline that is
// the same three counts as lengths, so the shape of the search reads at a glance without a fourth number. The
// qualified split by fit band draws once Qualified is open and the fits differ (contracts leadBand): a fit narrows
// the rows on screen the way an Excluded chip does. The words are contracts' labels; the count is drawn apart from
// them only so it can sit in tabular figures.
const { useRef: useBandRef, useEffect: useBandEffect } = React;

const LEAD_BAND_TONE = { qualified: "ok", review: "warn", excluded: "plain" };

const ldBandWords = (c) => String(c.label).replace(new RegExp(`^${c.count}\\s+`), "");

const LeadBand = ({ band, cls, onPick, fit, onPickFit }) => {
  const tabs = useBandRef(null);
  // The marker is measured, not guessed: the open tab's own box, written as two custom properties the stylesheet
  // animates. Nothing re-renders for it.
  useBandEffect(() => {
    const el = tabs.current;
    if (!el || !el.querySelector) return undefined;
    const place = () => {
      const on = el.querySelector(".ld-class.on");
      el.style.setProperty("--mark-x", `${on ? on.offsetLeft : 0}px`);
      el.style.setProperty("--mark-w", `${on ? on.offsetWidth : 0}px`);
      el.classList.toggle("has-mark", !!on);
    };
    place();
    if (typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(place);
    ro.observe(el);
    return () => ro.disconnect();
  }, [cls, band.classes.map((c) => c.count).join(",")]);
  const total = band.classes.reduce((n, c) => n + c.count, 0);
  return (
    <div className="ld-band" data-testid="lead-band">
      <div className="ld-band-tabs">
        <div className="ld-classes" ref={tabs} role="tablist" aria-label="What the search made of each place" data-testid="lead-classes">
          <span className="ld-class-mark" aria-hidden="true" />
          {band.classes.map((c) => (
            <button key={c.id} type="button" role="tab" aria-selected={cls === c.id} className={`ld-class ${c.id} ${cls === c.id ? "on" : ""}`} onClick={() => onPick(cls === c.id ? null : c.id)} data-testid={`lead-class-${c.id}`}>
              <span className="n">{c.count}</span> <span className="w">{ldBandWords(c)}</span>
            </button>
          ))}
        </div>
        {total > 0 ? (
          <span className="ld-band-shape" aria-hidden="true">
            {band.classes.filter((c) => c.count > 0).map((c) => <span key={c.id} className={`seg tone-${LEAD_BAND_TONE[c.id]}${cls && cls !== c.id ? " dim" : ""}`} style={{ flexGrow: c.count }} />)}
          </span>
        ) : null}
      </div>
      {band.mixed && cls === "qualified" ? (
        <div className="ld-band-fits" role="group" aria-label="Qualified, by fit" data-testid="lead-band-fits">
          {band.fits.filter((f) => f.count > 0).map((f) => (
            <button key={f.id} type="button" className={`ld-band-fit ${f.id}${fit === f.id ? " on" : ""}`} aria-pressed={fit === f.id} onClick={() => onPickFit(fit === f.id ? null : f.id)} data-testid={`lead-band-fit-${f.id}`}><span className={`dot ${f.id}`} aria-hidden="true" />{f.label} <span className="count">{f.count}</span></button>
          ))}
        </div>
      ) : null}
    </div>
  );
};

// The Excluded view's head: what each criterion left out, most first, each one narrowing the rows (§8.7). The
// counts are the loaded rows' own `excludedBy` (lead_search_members.excluded_by, said in words by toLeadRowVM),
// so the chips say what is on screen.
const ldExcludedChips = (rows) => {
  const by = new Map();
  for (const l of rows) if (l.cls === "excluded" && l.excludedBy) by.set(l.excludedBy, (by.get(l.excludedBy) || 0) + 1);
  return [...by.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count);
};

const LeadExcludedChips = ({ chips, active, onPick }) => (
  chips.length === 0 ? null : (
    <div className="ld-chips" data-testid="lead-excluded-chips">
      {chips.map((c) => (
        <button key={c.key} type="button" className={`ld-chip ${active === c.key ? "on" : ""}`} aria-pressed={active === c.key} onClick={(e) => { const pick = () => onPick(active === c.key ? null : c.key); return window.holdStill ? window.holdStill(e && e.currentTarget, pick) : pick(); }} data-testid={`lead-chip-${c.key}`}>
          {c.key} <span className="count">{c.count}</span>
        </button>
      ))}
    </div>
  )
);

// The Needs review view's head (D3): one chip per thing that would resolve the leads in it, most first, each
// selecting its leads so the bulk bar can resolve them at once. The groups are contracts' (leadReviewGroups, off
// the rows' own reason tokens), so the chip, the bar and the door agree on what a group is.
const LeadReviewGroups = ({ groups, onPick }) => (
  groups.length === 0 ? null : (
    <div className="ld-chips" data-testid="lead-review-groups">
      {groups.map((g) => (
        <button key={g.key} type="button" className="ld-chip" onClick={() => onPick(g.ids)} data-testid={`review-group-${g.key}`}>
          {g.label} <span className="count">{g.ids.length}</span>
        </button>
      ))}
    </div>
  )
);

/* ------------------------------------------- Needs review, as a workbench (D5) */
// Needs review stops being a tab on a table. The pile is on the left, in the order an owner works it (contracts'
// leadReviewGroups: what settles itself, then what one press settles, then what needs an eye); the group being
// worked is in the middle, as cards, with its own acts on a bar over them; and on the right, what each press does
// and costs, what the search asked for, and -- when the round ran dry -- where to look next (00145's own areas).
//
// Every word here is contracts': the group's label and the sentence under it, the act's word, the cost line, the
// criteria in the owner's own words. The acts are the same doors the bulk bar uses, so a press on the bench and a
// press on the bar are one act.
const LeadReviewBench = ({ groups, rows, groupKey, onGroup, search, month, review, x, onNearby }) => {
  const V = window.__LEAD_VM || {};
  const g = groups.find((y) => y.key === groupKey) || groups[0];
  const ids = g.ids;
  const cards = rows.filter((l) => ids.indexOf(l.id) >= 0);
  const costs = V.leadReviewCosts ? V.leadReviewCosts(g.acts, ids.length, month) : [];
  const asked = V.leadAskedFor ? V.leadAskedFor(search) : [];
  const nearby = (search && search.round && search.round.nearby) || [];
  const words = V.LEAD_REVIEW_ACT_WORDS || {};
  // An act draws only where its door exists, as the bulk bar's do: nothing on this bench is ever dead.
  const can = (a) => (a === "check_again" ? review.canCheckAgain : a === "find_email" ? review.canFindEmail : true);
  const press = (a) => (a === "check_again" ? review.onCheckAgain(ids) : a === "find_email" ? review.onFindEmail(ids) : a === "keep" ? review.onKeep(ids) : review.onExclude(ids));
  return (
    <div className="ld-bench" data-testid="lead-bench">
      <div className="ld-bench-queue" role="tablist" aria-label="What would resolve these leads" data-testid="lead-bench-queue">
        <div className="ld-bench-qh">The pile, in the order to work it</div>
        {groups.map((y) => (
          <button key={y.key} type="button" role="tab" aria-selected={y.key === g.key} className={`ld-bench-g ${y.id}${y.key === g.key ? " on" : ""}`} onClick={(e) => (window.holdStill ? window.holdStill(e && e.currentTarget, () => onGroup(y.key)) : onGroup(y.key))} data-testid={`bench-group-${y.key}`}>
            <span className="n">{y.ids.length}</span>
            <span className="l">{y.label}</span>
            <span className="a">{y.acts.length ? y.acts.map((a) => words[a] || a).join(" · ") : "Resolves itself"}</span>
          </button>
        ))}
      </div>

      <div className="ld-bench-main">
        <div className="ld-bench-head">
          <h3 className="ld-bench-t" data-testid="bench-title">{g.label}<span className="count">{ids.length}</span></h3>
          <p className="ld-bench-why" data-testid="bench-why">{(V.LEAD_REVIEW_GROUP_WHY || {})[g.id]}</p>
          <div className="ld-bench-acts" data-testid="bench-acts">
            {g.acts.filter(can).map((a) => (
              <button key={a} type="button" className={`btn btn-sm${a === "keep" ? " btn-primary" : ""}`} onClick={() => press(a)} data-testid={`bench-act-${a}`} {...(x.canFind ? {} : window.gate("find", "work these leads"))}>
                {words[a] || a} {ids.length}
              </button>
            ))}
          </div>
        </div>
        <div className="ld-bench-cards">
          {cards.map((l) => (
            <div key={l.id} id={`lead-${l.id}`} className="ld-bench-card" data-testid="lead-bench-card" onClick={() => x.onOpen(l.id)}>
              <LeadTile l={l} size={40} />
              <div className="b">
                <div className="n">
                  <button type="button" className="ld-biz-name" onClick={(e) => { e.stopPropagation(); x.onOpen(l.id); }} data-testid="bench-card-name">{l.name}</button>
                </div>
                <div className="s">{l.sub}</div>
                <div className="w">{l.why}</div>
              </div>
              <div className="r">
                <span className="ld-slots values">
                  <LeadSlot id={l.id} kind="phone" slot={l.slots.phone} values onPress={l.slots.phone.value && l.slots.phone.state !== "bad" ? () => x.onCall(l.id) : null} pressLabel="press to call" />
                  <LeadSlot id={l.id} kind="mailbox" slot={l.slots.mailbox} values onPress={l.slots.mailbox.copy ? () => x.onCopy(l.id) : null} pressLabel="press to copy" />
                </span>
                <span className="ld-bench-card-acts">
                  <button type="button" className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); x.onKeep(l.id); }} data-testid="bench-card-keep" {...(x.canFind ? {} : window.gate("find", "keep this lead"))}>{words.keep || "Keep"}</button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); x.onExclude(l.id); }} data-testid="bench-card-exclude" {...(x.canFind ? {} : window.gate("find", "exclude this lead"))}>{words.exclude || "Exclude"}</button>
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="ld-bench-side">
        <div className="ld-bench-block" data-testid="lead-bench-costs">
          <div className="pk-label">What each press does</div>
          {costs.length === 0 ? <p className="ld-bench-quiet">Nothing to press: these settle themselves.</p> : null}
          {costs.map((c) => (
            <div key={c.act} className="ld-bench-cost" data-testid={`bench-cost-${c.act}`}>
              <b>{c.label}</b>
              <span>{c.line}</span>
            </div>
          ))}
        </div>
        {asked.length ? (
          <div className="ld-bench-block" data-testid="bench-asked">
            <div className="pk-label">What this search asked for</div>
            {asked.map((a) => <div key={`${a.kind}-${a.text}`} className={`ld-bench-asked-row ${a.kind}`}>{a.text}</div>)}
          </div>
        ) : null}
        {nearby.length ? (
          <div className="ld-bench-block" data-testid="bench-dry">
            <div className="pk-label">This round ran dry</div>
            <p className="ld-bench-quiet">Nothing new was left where it looked. The nearest areas past it:</p>
            <div className="ld-bench-nearby">
              {nearby.map((a) => <button key={a.label} type="button" className="ld-band-fit" onClick={() => onNearby(a)} data-testid={`bench-nearby-${a.zip || a.label}`}>{a.label}</button>)}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};

Object.assign(window, { LeadBand, LeadReviewBench, LeadExcludedChips, ldExcludedChips, LeadReviewGroups });
