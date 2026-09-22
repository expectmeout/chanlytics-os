/* global React, Icon, MoreMenu, Confirm, EmptyState, FailedRead, PeopleRail, RailSection, RailRow, PeopleStanding, PeopleTable,
   PeopleColumnsMenu, plSortKeys, plDrawnColumns, plColumnOptions, PL_NO_SEL, LeadFinder, LeadStrip, LeadPeek,
   LeadPeekActions, LeadNotFitWhy, LeadsFirstDay */
// The Leads scope of People: the rail's lead rows and its kept searches, the standing line, the controls, the
// table drawn with LEAD_COLUMNS, the bulk bar, and the three classes (Qualified · Needs review · Excluded).
//
// Hookless, every one of them: the page's one stub-React call order is ClientsAReal's, and this file's components
// are drawn inside it (people-honest's harness keys hooks by call order). Every piece of state here is the page's
// and arrives as a prop; every act goes out through the courier the bridge installed (legacy-bridge/leads.ts).
//
// Nothing here names the vendor: the owner sees Claude finding businesses, and where each fact came from.

/* ------------------------------------------------------------------ the row */

// The row's acts: Call and Copy on every row, on hover and on the keyboard's cursor; and the class's own three
// (§8.7, S9): Keep and Exclude move a place out of Needs review, Put back is the owner's override of an
// exclusion. All three count, so all three are the owner's permission `find`; anyone else sees them on the page,
// in the tab order, saying why when pressed (window.gate, data-bits.jsx), never disabled and never silent.
// They are the system's small buttons, 26px like People's row acts: Call and Copy square (`btn-icon btn-sm`), the
// words `btn-sm`. On a phone's card, leads.css draws Call at 44px.
const LeadRowActions = ({ l, onCall, onCopy, onKeep, onExclude, onPutBack, canFind }) => (
  <span className="cl-row-actions ld-row-actions">
    {l.phone && !l.phoneWrong && <button type="button" className="btn btn-ghost btn-icon btn-sm ld-call" onClick={(e) => { e.stopPropagation(); onCall(l.id); }} title="Call from your phone" aria-label={`Call ${l.name}`} data-testid="lead-call"><Icon name="phone" size={11} /></button>}
    {l.email && l.emailState !== "invalid" && <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={(e) => { e.stopPropagation(); onCopy(l.id); }} title="Copy the email" aria-label={`Copy the email for ${l.name}`} data-testid="lead-copy"><Icon name="copy" size={11} /></button>}
    {l.cls === "review" && <button type="button" className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); onKeep(l.id); }} data-testid="lead-keep" {...(canFind ? {} : window.gate("find", "keep this lead"))}>Keep</button>}
    {l.cls === "review" && <button type="button" className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); onExclude(l.id); }} data-testid="lead-exclude" {...(canFind ? {} : window.gate("find", "exclude this lead"))}>Exclude</button>}
    {l.cls === "excluded" && <button type="button" className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); onPutBack(l.id); }} data-testid="lead-put-back" {...(canFind ? {} : window.gate("find", "put this lead back"))}>Put back</button>}
  </span>
);

// The shape beside an email's address, so its state is not colour alone (§6.7): a check for a mailbox that
// answered, a dashed ring for one that cannot be told apart from any other (catch_all: "Unconfirmed", S12), a
// question for a server that would not answer, a cross for one that bounces, a turning ring while it is checked,
// and nothing at all when there is no address.
//
// It is drawn, not named: `icons.jsx` has no `help`, `xcircle`, `spin` or `minus`, and an unknown name renders a
// plain circle (`icons.jsx:73`), which would say the same thing about five different states. Five inline paths in
// one component instead of five names that do not exist.
//
// **This is the one LeadShape in the release.** Task 12's peek draws the same component from `window` (its email
// line is `<LeadShape state={vm.reach.email.state} />`) and declares no second one: `leads-peek.jsx` loads after
// `leads-scope.jsx`, so a second declaration would silently take this one's place.
const LD_SHAPE_CHECK = "M3.5 8.5l3 3 6-6.5";
const LeadShape = ({ state, word, size = 13 }) => {
  const p = { width: size, height: size, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true" };
  const wrap = (kids, extra) => <span className={`ld-shape ld-shape-${state}${extra ? ` ${extra}` : ""}`} title={word || undefined}><svg {...p}>{kids}</svg></span>;
  if (state === "ok") return wrap(<path d={LD_SHAPE_CHECK} />);
  if (state === "catch_all") return wrap(<circle cx="8" cy="8" r="5.5" strokeDasharray="2.5 2.5" />);
  if (state === "unknown") return wrap(<><path d="M6 6.2a2 2 0 113 1.8v1" /><circle cx="8" cy="11.6" r="0.8" fill="currentColor" stroke="none" /></>);
  if (state === "invalid") return wrap(<><circle cx="8" cy="8" r="5.5" /><path d="M5.5 10.5l5-5" /></>);
  if (state === "checking") return wrap(<circle cx="8" cy="8" r="5.5" strokeDasharray="17 17" />, "spin");
  return null;
};

/* --------------------------------------------------- the hover vocabulary (D5) */
// Two tiers only. A tip is a chip of a line or two you can never click; a card is raised, holds links and buttons,
// and stays open while the pointer is inside it. Both are in the DOM always (so a test reads them and a screen
// reader can reach them through aria-describedby) and shown by CSS on the trigger's :hover and :focus-within --
// tips after 200ms, cards after 400ms, one at a time by nature, and hidden while the list scrolls (the page marks
// its scroller data-scrolling). Nothing a person must act on hides in either: a hover only confirms what the row
// already said.
const LeadTip = ({ id, children, testid }) => <span className="ld-tip" role="tooltip" id={id} data-testid={testid}>{children}</span>;
const LeadCard = ({ id, label, children, testid }) => <div className="ld-card" role="group" id={id} aria-label={label} data-testid={testid} onClick={(e) => e.stopPropagation()}>{children}</div>;

/**
 * Where a pop hangs. It hangs below its row, and the table's pane cuts off whatever reaches past its bottom edge: the
 * name card on the last row in view lost 173px. So each hover looks where it is as the pointer or focus arrives, and
 * hangs its pop above the row when there is not room for it below and there is more room above. A pop is out of the
 * layout until it shows, so its height cannot be read on arrival; these are the most each kind runs to.
 */
const LD_POP_ROOM = { card: 250, tip: 56 };
const ldPlacePop = (e) => {
  const el = e && e.currentTarget;
  if (!el || typeof el.getBoundingClientRect !== "function" || typeof el.closest !== "function" || !el.classList) return;
  const pane = el.closest(".pl-table-scroll") || el.closest(".pl-main");
  if (!pane) return;
  const box = pane.getBoundingClientRect();
  const at = el.getBoundingClientRect();
  // The header sticks to the pane's top, so the room above a row ends at the header, not at the pane.
  const head = pane.classList.contains("pl-table-scroll") ? ((pane.querySelector("thead") || {}).offsetHeight || 0) : 0;
  const need = el.querySelector(":scope > .ld-card") ? LD_POP_ROOM.card : LD_POP_ROOM.tip;
  const below = box.bottom - at.bottom;
  const above = at.top - (box.top + head);
  el.classList.toggle("ld-up", below < need && above > below);
};

// The tile (D5, D6): the business's own mark where it has one, else the listing's photo, else initials on a tint
// the kind of business decides. The three are stacked rather than chosen, so a mark that fails to load simply
// uncovers the photo under it and a photo that fails uncovers the initials -- no state, and never a broken frame.
const LeadTile = ({ l, size = 48, onExpand }) => {
  const hide = (e) => { const t = e && e.currentTarget; if (t && t.style) t.style.display = "none"; };
  const cls = `ld-tile tint-${l.tile.tint}`;
  const layers = (
    <>
      {l.tile.image ? <img className="ph" src={l.tile.image} alt="" loading="lazy" onError={hide} /> : null}
      {l.tile.logo ? <img className="lg" src={l.tile.logo} alt="" loading="lazy" onError={hide} /> : null}
    </>
  );
  if (!onExpand) return <span className={cls} style={{ width: size, height: size }} aria-hidden="true"><span className="ld-tile-initials">{l.tile.initials}</span>{layers}</span>;
  return (
    <button type="button" className={cls} style={{ width: size, height: size }} aria-label={`Expand ${l.name}`} data-testid="lead-photo" onClick={(e) => { e.stopPropagation(); onExpand(l.id); }}>
      <span className="ld-tile-initials" aria-hidden="true">{l.tile.initials}</span>
      {layers}
      <span className="ld-tile-expand" aria-hidden="true"><Icon name="external" size={8} /></span>
    </button>
  );
};

// One reach slot (D5): five shapes -- a filled circle (checked), a half circle (unconfirmed), a dashed ring
// (nothing found), a ring with a slash (bad), a turning arc (still checking) -- so the column survives greyscale;
// colour repeats the meaning. The word and the value are the control's name; the sentence is its tip. Pressing a
// phone dials, pressing a mailbox copies; a slot with nothing to press is a plain focusable span.
const LD_SLOT_SHAPES = {
  ok: <circle cx="8" cy="8" r="5.5" fill="currentColor" stroke="none" />,
  part: <><circle cx="8" cy="8" r="5.5" /><path d="M8 2.5a5.5 5.5 0 0 1 0 11z" fill="currentColor" stroke="none" /></>,
  none: <circle cx="8" cy="8" r="5.5" strokeDasharray="2.5 2.5" />,
  bad: <><circle cx="8" cy="8" r="5.5" /><path d="M5 11l6-6" /></>,
  checking: <circle cx="8" cy="8" r="5.5" strokeDasharray="17 17" />,
};
/** The shape alone, for the peek's reach rows: the same five, the same colours. */
const LeadSlotShape = ({ state }) => {
  const p = { width: 14, height: 14, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true" };
  return <span className={`ld-slot ld-slot-${state}`}><span className={`ld-slot-shape${state === "checking" ? " spin" : ""}`}><svg {...p}>{LD_SLOT_SHAPES[state]}</svg></span></span>;
};
const LeadSlot = ({ id, kind, slot, values, onPress, pressLabel }) => {
  const tipId = `${id}-${kind}-tip`;
  const p = { width: 14, height: 14, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true" };
  const who = kind === "phone" ? "Phone" : "Email";
  const label = slot.value ? `${who}: ${slot.word}, ${slot.value}${onPress ? ` — ${pressLabel}` : ""}` : `${who}: ${slot.word}`;
  const body = (
    <>
      <span className={`ld-slot-shape${slot.state === "checking" ? " spin" : ""}`}><svg {...p}>{LD_SLOT_SHAPES[slot.state]}</svg></span>
      {values && slot.value ? <span className="ld-slot-value">{slot.value}</span> : null}
    </>
  );
  return (
    <span className={`ld-hover ld-slot ld-slot-${slot.state}`} data-testid={`lead-slot-${kind}`} onMouseEnter={ldPlacePop} onFocus={ldPlacePop}>
      {onPress
        ? <button type="button" className="ld-slot-btn" aria-label={label} aria-describedby={tipId} onClick={(e) => { e.stopPropagation(); onPress(); }}>{body}</button>
        : <span className="ld-slot-btn" tabIndex={0} aria-label={label} aria-describedby={tipId}>{body}</span>}
      <LeadTip id={tipId}>{slot.tip}</LeadTip>
    </span>
  );
};

// The name's card: enough to decide without opening the peek, and the one hover that carries links, because it is
// the one you can keep the pointer inside.
const LeadNameCard = ({ l, x }) => (
  <LeadCard id={`${l.id}-card`} label={`About ${l.name}`} testid="lead-card-name">
    <div className="ld-card-head">
      <LeadTile l={l} size={40} />
      <div className="ld-card-titles">
        <div className="ld-card-name">{l.name}</div>
        <div className="ld-card-sub">{[l.sub, l.card.today].filter(Boolean).join(" · ")}</div>
      </div>
    </div>
    {l.card.about ? <p className="ld-card-about">{l.card.about}</p> : null}
    <p className="ld-card-why">{l.why}</p>
    <div className="ld-card-foot">
      {l.card.site ? <a href={l.card.site.href} target="_blank" rel="noopener noreferrer">{l.card.site.label}</a> : null}
      {l.card.maps ? <a href={l.card.maps.href} target="_blank" rel="noopener noreferrer">{l.card.maps.label}</a> : null}
      <span className="sp" />
      {l.phone && !l.phoneWrong ? <button type="button" className="btn btn-sm btn-primary" onClick={() => x.onCall(l.id)}><Icon name="phone" size={11} /> Call</button> : null}
    </div>
  </LeadCard>
);

// What people say: the spread the row only hints at, one bar a star.
const LeadRatedCard = ({ l }) => {
  const total = l.spread.reduce((a, b) => a + b, 0) || 1;
  return (
    <LeadCard label={`How ${l.name} is rated`} testid="lead-card-rated">
      <div className="ld-card-rated"><span className="ld-card-score">{l.rated.score}</span><span className="ld-card-count">{l.rated.count} reviews</span></div>
      {[5, 4, 3, 2, 1].map((star) => {
        const n = l.spread[star - 1];
        return (
          <div key={star} className="ld-bar-row">
            <span className="k">{star}</span>
            <span className="ld-bar"><span style={{ width: `${Math.round((n / total) * 100)}%` }} /></span>
            <span className="n">{n.toLocaleString("en-US")}</span>
          </div>
        );
      })}
    </LeadCard>
  );
};

// The identity cell (D5): the tile, the name (which peeks) with its card, the tags the row's state and its fit
// wear, and one quiet line about where -- or, for a row that waits, what would resolve it; for a left-out row,
// what left it out. The two tags are the app's one StatePill, on the registry's tones (tone.ts): they were a
// hand-styled pair of their own, and a Contacted tag drew grey while its dot, its pin and the registry said info.
const ldBusinessCell = (l, x) => (
  <td key="business" className={`cl-name-cell pl-pin ld-biz-cell ${l.cls}`}>
    <div className="cl-row-name ld-row-name">
      <LeadTile l={l} onExpand={x.onExpand} />
      <div className="cl-row-name-block ld-hover" onMouseEnter={ldPlacePop} onFocus={ldPlacePop}>
        <div className="cl-row-fullname">
          <button type="button" className="ld-biz-name" onClick={(e) => { e.stopPropagation(); x.onOpen(l.id); }} aria-describedby={`${l.id}-card`} data-testid="lead-name">{l.name}</button>
          {l.places > 1 && <span className="ld-badge" title="Two listings on the map for one business">{l.places} listings</span>}
          {x.mixedFits && l.fit ? <StatePill kind="lead_fit" value={l.fit} label={l.fitLabel} testid="lead-fit-tag" /> : null}
          {l.stateTag ? <StatePill kind="lead_row_state" value={l.state} label={l.stateTag} testid="lead-state-tag" /> : null}
        </div>
        <div className={`cl-row-meta ld-sub${l.waitsOn ? " waits" : ""}`} data-testid="lead-sub">{l.cls === "excluded" ? l.fitLabel : (l.waitsOn || l.sub)}</div>
        <LeadNameCard l={l} x={x} />
      </div>
    </div>
  </td>
);

// PRD §6.2's Leads columns as the redesign cuts them (D5): three that differ row to row -- who they are, whether
// you can reach them, how well they are rated -- and when they were found, whose cell holds the row's acts on
// hover. Fit, Why it fits and Stage stay in the Columns menu, off: the band bar says the fits, the name's card
// and the peek say why, and the row wears its stage as a tag. In the shape the table takes (people-table.jsx):
// { key, label, sortable, pinned, fixed, on, needs, cell(l, x) }. The six that sort are the six `leads_page` takes.
const LEAD_COLUMNS = [
  { key: "business", label: "Business", sortable: true, pinned: true, cell: ldBusinessCell },
  { key: "reach", label: "Reach", sortable: false, cell: (l, x) => (
    <td key="reach" className="shrink ld-reach-cell" data-testid="lead-reach">
      {l.cls === "excluded" ? <span className="dim">Not checked</span> : (
        <span className={`ld-slots${x.values ? " values" : ""}`}>
          <LeadSlot id={l.id} kind="phone" slot={l.slots.phone} values={x.values} onPress={l.slots.phone.value && l.slots.phone.state !== "bad" ? () => x.onCall(l.id) : null} pressLabel="press to call" />
          <LeadSlot id={l.id} kind="mailbox" slot={l.slots.mailbox} values={x.values} onPress={l.slots.mailbox.copy ? () => x.onCopy(l.id) : null} pressLabel="press to copy" />
        </span>
      )}
    </td>
  ) },
  { key: "rating", label: "Rated", sortable: true, cell: (l) => (
    <td key="rating" className="shrink ld-rated-cell ld-hover" data-testid="lead-rated" onMouseEnter={ldPlacePop} onFocus={ldPlacePop}>
      {l.rated ? <><span className="ld-rated-score">{l.rated.score}</span><span className="ld-rated-count">{l.rated.count}</span>{l.spread ? <LeadRatedCard l={l} /> : null}</> : null}
    </td>
  ) },
  { key: "found", label: "Found", sortable: true, cell: (l) => (
    <td key="found" className="shrink dim ld-found-cell ld-hover" data-testid="lead-found" onMouseEnter={ldPlacePop} onFocus={ldPlacePop}>
      <span tabIndex={0} aria-describedby={`${l.id}-found-tip`}>{l.foundLabel}</span>
      <LeadTip id={`${l.id}-found-tip`} testid="lead-tip-found">{l.foundAt}{l.card.found[0] ? ` · ${l.card.found[0].what}` : ""}</LeadTip>
    </td>
  ) },
  { key: "fit", label: "Fit", sortable: true, on: false, cell: (l) => <td key="fit" className={`shrink ld-fit-cell ${l.cls}`} title={l.fitTitle} data-testid="lead-fit">{l.fitLabel}</td> },
  { key: "why", label: "Why it fits", sortable: false, on: false, cell: (l) => <td key="why" className="dim ld-why-cell" title={l.why}>{l.why}</td> },
  { key: "stage", label: "Stage", sortable: true, on: false, cell: (l) => <td key="stage" className="shrink ld-stage-cell" data-testid="lead-stage">{l.cls !== "excluded" && <StatePill kind="lead_stage" value={l.stage} label={l.stageLabel} />}</td> },
  { key: "distance", label: "Distance", sortable: true, needs: (x) => x.hasCenter, on: false, cell: (l) => <td key="distance" className="shrink dim ld-distance-cell">{l.distance}</td> },
  { key: "source", label: "Source", sortable: false, on: false, cell: (l) => <td key="source" className="shrink dim ld-source-cell">{l.source}</td> },
  { key: "website", label: "Website", sortable: false, on: false, cell: (l) => <td key="website" className="shrink dim ld-website-cell">{l.host}</td> },
  { key: "search", label: "Search", sortable: false, on: false, cell: (l) => <td key="search" className="shrink dim ld-search-cell">{l.searchName}</td> },
  // The row's acts, where the eye ends: on hover and on the keyboard's cursor (clients.css shows .cl-row-actions then).
  { key: "actions", label: "", sortable: false, fixed: true, cell: (l, x) => <td key="actions" className="shrink cl-actions-cell"><LeadRowActions l={l} onCall={x.onCall} onCopy={x.onCopy} onKeep={x.onKeep} onExclude={x.onExclude} onPutBack={x.onPutBack} canFind={x.canFind} /></td> },
];
// business, fit, rating, stage, found, distance: what a saved Leads view may sort by.
const LEAD_SORT_KEYS = plSortKeys(LEAD_COLUMNS);

/* ------------------------------------------------------- the rail's searches */

// A kept search says what was asked (§8.10). The menu closes after each item (MoreMenu), and every item is a
// route: nothing here renames or removes on the spot.
const LeadSearchMenu = ({ s, words, canFind, onRename, onMore, onAgain, onRemove, onUndo, exportHref }) => (
  <MoreMenu
    // It escapes the rail: the rail scrolls and cuts off whatever crosses its edge, so opening rightward showed 51px of
    // 194, and a menu held inside it (196px) broke its words onto three to six lines. Placed against the window, it
    // opens rightward over the table at a menu's full width.
    escape
    align="left"
    // Its name is what it holds, for a screen reader and on hover: "What independent bookstores asked for" read as
    // if the bookstores had asked. What the search asked for is the row's own tip (LeadsRailRows).
    title={`More for ${s.name}`}
    btnClass="btn btn-ghost btn-icon btn-sm ld-search-more"
    items={[
      { header: words.askedLine },
      { label: "Rename", icon: "pencil", onClick: () => onRename(s), gate: canFind ? undefined : window.gate("find", "rename this search") },
      { label: "Find new ones", icon: "refresh", meta: "Only places not already in your leads count", onClick: () => onMore(s), gate: canFind ? undefined : window.gate("find", "search again") },
      { label: "Search again, changed", icon: "sparkle", meta: "Opens the plan with what you asked", onClick: () => onAgain(s), gate: canFind ? undefined : window.gate("find", "search again") },
      { label: `Export these ${s.count}`, icon: "external", onClick: () => { if (exportHref) window.open(exportHref, "_self"); }, gate: canFind ? undefined : window.gate("find", "export these leads") },
      // For a day after a round ends: the leads nobody has touched leave and the month is credited (§8.6). Named
      // for what it does; the toast it answers with carries its own Undo, which puts them back.
      ...(s.undoable ? [{ label: "Remove the ones you haven't touched", icon: "undo", meta: `Up to ${s.count} given back this month`, onClick: () => onUndo(s), gate: canFind ? undefined : window.gate("find", "remove these leads") }] : []),
      { divider: true },
      { label: "Remove this search", icon: "x", danger: true, meta: words.keepsLine, onClick: () => onRemove(s), gate: canFind ? undefined : window.gate("find", "remove this search") },
    ]}
  />
);

// The rail under Leads, drawn with People's kit (RailSection, RailRow in clients-a.jsx) and picked the way People's
// is: one row at a time, a list or a search. The lists, then the searches, each with its count, a live dot while it
// runs and a "?" in the accent while it waits on the owner. Renaming and removing are asked where the search is, so
// the rail never loses the row that is being named.
const LeadsRailRows = ({ rail, list, searchId, canFind, wordsFor, onPickList, onPickSearch, onWarmList = () => {}, onWarmSearch = () => {}, renaming, onRename, onRenameSave, onRenameCancel, removing, onRemoveAsk, onRemoveYes, onRemoveNo, removeBusy, removeError, onMore, onAgain, onUndo, hrefFor, onNew }) => (
  <>
    {/* "Lists", not "Leads": the switch right above already says which scope this is. */}
    <RailSection label="Lists" testid="leads-lists">
      {rail.lists.map((l) => (
        <RailRow key={l.id} label={l.label} count={l.count} active={!searchId && list === l.id} onPick={() => onPickList(l.id)} onWarm={() => onWarmList(l.id)} testid={`leads-list-${l.id}`} />
      ))}
    </RailSection>
    <RailSection label="Searches" testid="leads-searches">
      {rail.searches.map((s) => (
        <RailRow
          key={s.id}
          className="ld-search-row"
          pickClass="ld-search-pick"
          label={s.name}
          count={s.count}
          active={searchId === s.id}
          onPick={() => onPickSearch(s.id)}
          onWarm={() => onWarmSearch(s.id)}
          // Most names are cut off at the rail's width; the row names the whole ask, and when, on hover (the shared tip).
          tip={wordsFor(s.id).askedLine || null}
          testid={`leads-search-${s.id}`}
          mark={s.mark === "live" ? <span className="live-dot" aria-hidden="true" /> : s.mark === "question" ? <span className="rail-q" title="This search needs you">?</span> : null}
          menu={<LeadSearchMenu s={s} words={wordsFor(s.id)} canFind={canFind} onRename={onRename} onMore={onMore} onAgain={onAgain} onRemove={onRemoveAsk} onUndo={onUndo} exportHref={hrefFor(s)} />}
          edit={renaming && renaming.id === s.id ? (
            <span className="cl-bulk-naming ld-search-renaming">
              <input autoFocus defaultValue={s.name} maxLength={80} aria-label="The search's name" data-testid="leads-rename-name" onKeyDown={(e) => { if (e.key === "Enter") onRenameSave(s, e.target.value); if (e.key === "Escape") onRenameCancel(); }} />
              <button type="button" className="btn btn-sm btn-primary" onClick={(e) => onRenameSave(s, e.currentTarget.parentNode.querySelector("input").value)} data-testid="leads-rename-save">Save</button>
            </span>
          ) : null}
          after={removing && removing.id === s.id ? (
            <Confirm question={`Remove “${s.name}”?`} detail={wordsFor(s.id).keepsLine} yes="Yes, remove" danger busy={removeBusy} error={removeError} onYes={() => onRemoveYes(s)} onNo={onRemoveNo} testid="leads-remove" />
          ) : null}
        />
      ))}
      {rail.searches.length === 0 && <div className="cl-rail-hint">No searches yet. Describe the businesses you want and Claude finds them.</div>}
    </RailSection>
    <div className="cl-rail-foot">
      <button type="button" className="cl-rail-newseg" onClick={onNew} data-testid="leads-new-search" {...(canFind ? {} : window.gate("find", "find leads"))}>
        <Icon name="plus" size={11} /> New search
      </button>
    </div>
  </>
);

/* ------------------------------------------------- the three classes (§8.7) */

// Qualified · Needs review · Excluded, under the search that is open: each a count and a view (c-qualified,
// c-review, c-excluded). The class is not a stage (§9.1): it says whether the place met the plan.
// The band (D5): one element that says the search's whole shape and filters it. The three classes with their
// counts are the tabs; the qualified split by fit band draws only when the fits differ (contracts leadBand), and a
// fit narrows the rows on screen the way an Excluded chip does.
const LeadBand = ({ band, cls, onPick, fit, onPickFit }) => (
  <div className="ld-band" data-testid="lead-band">
    <div className="ld-classes" role="tablist" aria-label="What the search made of each place" data-testid="lead-classes">
      {band.classes.map((c) => (
        <button key={c.id} type="button" role="tab" aria-selected={cls === c.id} className={`ld-class ${c.id} ${cls === c.id ? "on" : ""}`} onClick={() => onPick(cls === c.id ? null : c.id)} data-testid={`lead-class-${c.id}`}>{c.label}</button>
      ))}
    </div>
    {band.mixed && (!cls || cls === "qualified") ? (
      <div className="ld-band-fits" role="group" aria-label="Qualified, by fit" data-testid="lead-band-fits">
        <span className="ld-band-bar" aria-hidden="true">{band.fits.map((f) => <span key={f.id} className={`seg ${f.id}`} style={{ flexGrow: f.count }} />)}</span>
        {band.fits.filter((f) => f.count > 0).map((f) => (
          <button key={f.id} type="button" className={`ld-band-fit ${f.id}${fit === f.id ? " on" : ""}`} aria-pressed={fit === f.id} onClick={() => onPickFit(fit === f.id ? null : f.id)} data-testid={`lead-band-fit-${f.id}`}>{f.label} <span className="count">{f.count}</span></button>
        ))}
      </div>
    ) : null}
  </div>
);

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
        <button key={c.key} type="button" className={`ld-chip ${active === c.key ? "on" : ""}`} aria-pressed={active === c.key} onClick={() => onPick(active === c.key ? null : c.key)} data-testid={`lead-chip-${c.key}`}>
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
          <button key={y.key} type="button" role="tab" aria-selected={y.key === g.key} className={`ld-bench-g ${y.id}${y.key === g.key ? " on" : ""}`} onClick={() => onGroup(y.key)} data-testid={`bench-group-${y.key}`}>
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

/* --------------------------------------- the same leads, on the ground (D5) */
// Every fact on this page is about a place, so the leads can be looked at as places. The plot is contracts'
// (leadMapPlot): every lead the source gave a point, measured in metres from one centre and scaled into a square,
// with the area the search asked for drawn around it. No projection of the world, no tile, and no request to
// anybody -- the picture is made from what the search already found. (Streets would mean a tile provider, which is
// a third-party request on every view; the seam for one is this square, and nothing above it would change.)
// The pin's colour is contracts' (leadPinTone, tone.ts) -- the same registry the row's dot and its tag read, so
// a pin can no longer say one thing where a row says another. It used to answer in its own words (`strong`,
// `part`, `talking`) and leave a table in leads.css to turn them into colours, which is how a `look` fit came to
// draw amber here and plain everywhere else. Without the bridge (the standalone mockup) every pin is plain.
const ldPinTone = (l, by) => {
  const V = window.__LEAD_VM || {};
  return V.leadPinTone ? V.leadPinTone(l, by) : "plain";
};
// Left out is plain, like a long shot -- so it steps back by being quieter instead of by being another colour.
const ldPinOut = (l) => (l.state === "out" ? " is-out" : "");
const LEAD_MAP_BY = [{ id: "fit", label: "Fit" }, { id: "reach", label: "Reach" }, { id: "stage", label: "Stage" }];

const LeadMap = ({ rows, plot, by, onBy, picked, onPick, x, onWiden, nearby, onNearby, canFind, oneSearch }) => {
  const V = window.__LEAD_VM || {};
  const byId = new Map(rows.map((l) => [l.id, l]));
  const near = [...plot.pins].sort((a, b) => Math.hypot(a.x - 0.5, a.y - 0.5) - Math.hypot(b.x - 0.5, b.y - 0.5));
  return (
    <div className="ld-map" data-testid="lead-map">
      <div className="ld-map-side">
        <div className="ld-map-bar">
          <span className="ld-map-count" data-testid="lead-map-count">{`${plot.pins.length} on the map`}</span>
          <span className="sp" />
          <span className="ld-map-by" role="group" aria-label="Colour the pins by">
            {LEAD_MAP_BY.map((b) => (
              <button key={b.id} type="button" className={`ld-band-fit${by === b.id ? " on" : ""}`} aria-pressed={by === b.id} onClick={() => onBy(b.id)} data-testid={`map-by-${b.id}`}>{b.label}</button>
            ))}
          </span>
        </div>
        <div className="ld-map-rows">
          {near.map((p, i) => {
            const l = byId.get(p.id);
            return (
              <div key={p.id} className={`ld-map-row${picked === p.id ? " on" : ""}`} data-testid="lead-map-row" onMouseEnter={() => onPick(p.id)} onClick={() => x.onOpen(p.id)}>
                <span className="i">{i + 1}</span>
                <LeadTile l={l} size={28} />
                <div className="b">
                  <div className="n">{l.name}</div>
                  <div className="s">{l.sub}</div>
                </div>
                <span className={`ld-pin-dot tone-${ldPinTone(l, by)}${ldPinOut(l)}`} aria-hidden="true" />
              </div>
            );
          })}
        </div>
      </div>

      <div className="ld-map-main">
        {plot.tooWide ? (
          <div className="ld-map-plot ld-map-wide" data-testid="lead-map-toowide">
            <span className="ld-map-wide-line">{V.leadMapNote ? V.leadMapNote(plot, !!oneSearch) : ""}</span>
          </div>
        ) : (
        <div className="ld-map-plot" data-testid="lead-map-plot">
          {plot.ring ? (
            <span
              className="ld-map-ring"
              aria-hidden="true"
              data-testid="lead-map-ring"
              style={{ left: `${(plot.ring.x - plot.ring.r) * 100}%`, top: `${(plot.ring.y - plot.ring.r) * 100}%`, width: `${plot.ring.r * 200}%`, height: `${plot.ring.r * 200}%` }}
            />
          ) : null}
          {plot.pins.map((p) => {
            const l = byId.get(p.id);
            return (
              <button
                key={p.id}
                type="button"
                className={`ld-pin tone-${ldPinTone(l, by)}${ldPinOut(l)}${picked === p.id ? " on" : ""}`}
                style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
                aria-label={`${l.name} — ${l.sub}`}
                data-testid={`lead-pin-${p.id}`}
                onMouseEnter={() => onPick(p.id)}
                onFocus={() => onPick(p.id)}
                onClick={() => x.onOpen(p.id)}
              />
            );
          })}
          {picked && byId.get(picked) ? (
            <div className="ld-map-card" data-testid="lead-map-card">
              <LeadTile l={byId.get(picked)} size={34} />
              <div className="b">
                <div className="n">{byId.get(picked).name}</div>
                <div className="s">{byId.get(picked).sub}</div>
              </div>
              {byId.get(picked).slots.phone.value ? (
                <button type="button" className="btn btn-sm btn-primary" onClick={() => x.onCall(picked)} data-testid="map-card-call"><Icon name="phone" size={11} /> Call</button>
              ) : null}
            </div>
          ) : null}
          <span className="ld-map-scale" data-testid="lead-map-scale">{V.leadMapAcross ? V.leadMapAcross(plot.spanM) : ""}</span>
        </div>
        )}
        <div className="ld-map-foot">
          {/* Which picture this is, in contracts' words: the area asked for, or only where the leads are, or --
              across searches in different cities -- that these were never one place at all. */}
          <span className="ld-map-note" data-testid="lead-map-note">{V.leadMapNote ? V.leadMapNote(plot, !!oneSearch) : ""}</span>
          <span className="sp" />
          {nearby.map((a) => (
            <button key={a.label} type="button" className="ld-band-fit" onClick={() => onNearby(a)} data-testid={`map-nearby-${a.zip || a.label}`}>{a.label}</button>
          ))}
          <button type="button" className="btn btn-sm" onClick={onWiden} data-testid="map-widen" {...(canFind ? {} : window.gate("find", "search a wider area"))}>Search wider</button>
        </div>
      </div>
    </div>
  );
};

/* --------------------------------------------------------------- the bulk bar */

// What a selection of leads can become (§6.4, S13): their emails on the clipboard, all contacted, all not a fit,
// a file. Each acts on the rows shown AND selected; the header box's "Select all N that match" hands the view's
// filters to the server instead of a list of ids, so a view of 1,240 does not become 1,240 ids in a request.
const LeadsBulkBar = ({ sel, rows, total, view, canFind, canExport, busy, whyNot, onClear, onSelectAllMatching, allMatching, onCopyEmails, onContacted, onNotAFit, whyOpen, onWhyOpen, exportHref, review = null }) => {
  const picked = rows.filter((l) => sel.has(l.id));
  const ids = picked.map((l) => l.id);
  const count = allMatching ? total : ids.length;
  // Selected, and not among the rows shown: the words in the box hide them, and they are selected still (the page
  // keeps a selection through a search). The bar acts on what it shows, so it says what it is leaving out.
  const hidden = allMatching ? 0 : sel.size - ids.length;
  // A selection that is all Needs review offers what resolves it (D3): the union of its groups' acts. Check again
  // and Find an email draw only where their couriers exist, so nothing here is ever a dead control.
  const acts = review && !allMatching && picked.length > 0 && picked.every((l) => l.cls === "review") ? review.actsFor(ids) : [];
  const gate = canFind ? {} : window.gate("find", "work these leads");
  return (
    <div className="cl-bulk ld-bulk" role="toolbar" aria-label="Selected leads" data-testid="leads-bulk-bar">
      <span className="cl-bulk-count"><b>{count}</b> selected{hidden > 0 ? <span data-testid="leads-bulk-hidden"> · {hidden} more not shown</span> : null}</span>
      {!allMatching && total > rows.length && (
        <button type="button" className="cl-bucket-link" onClick={onSelectAllMatching} data-testid="leads-select-matching">Select all {total.toLocaleString()} that match</button>
      )}
      {acts.includes("check_again") && review.canCheckAgain ? <button type="button" className="btn btn-sm btn-primary" disabled={busy} onClick={() => review.onCheckAgain(ids)} data-testid="leads-bulk-check-again" {...gate}><Icon name="refresh" size={12} /> Check {ids.length} again <span className="dim">· about {(V.leadCheckAgainCents ? V.leadCheckAgainCents(ids.length) : ids.length)}¢</span></button> : null}
      {acts.includes("find_email") && review.canFindEmail ? <button type="button" className="btn btn-sm" disabled={busy} onClick={() => review.onFindEmail(ids)} data-testid="leads-bulk-find-email" {...gate}><Icon name="search" size={12} /> Find {ids.length === 1 ? "an email" : `${ids.length} emails`}</button> : null}
      {acts.includes("keep") ? <button type="button" className="btn btn-sm" disabled={busy} onClick={() => review.onKeep(ids)} data-testid="leads-bulk-keep" {...gate}>Keep {ids.length}</button> : null}
      {acts.includes("exclude") ? <button type="button" className="btn btn-sm" disabled={busy} onClick={() => review.onExclude(ids)} data-testid="leads-bulk-exclude" {...gate}>Exclude {ids.length}</button> : null}
      <button type="button" className="btn btn-sm" disabled={busy} onClick={() => onCopyEmails(picked)} data-testid="leads-bulk-copy"><Icon name="copy" size={12} /> Copy emails</button>
      <button type="button" className="btn btn-sm" disabled={busy} onClick={() => onContacted(allMatching ? { by: "view", action: "contacted", view } : { by: "ids", action: "contacted", ids })} data-testid="leads-bulk-contacted" {...(canFind ? {} : window.gate("find", "mark these leads contacted"))}><Icon name="check" size={12} /> Mark contacted</button>
      {/* The same five whys the peek asks, asked once for the whole selection: LeadNotFitWhy is leads-peek.jsx's
          own list, published for this bar, so the words are spelled in one place (Task 15 step 4). */}
      <span className="ld-bulk-nf">
        <button type="button" className="btn btn-sm" disabled={busy} aria-haspopup="menu" aria-expanded={!!whyOpen} onClick={() => onWhyOpen(!whyOpen)} data-testid="leads-bulk-not-a-fit" {...(canFind ? {} : window.gate("find", "mark these leads not a fit"))}><Icon name="ban" size={12} /> Not a fit</button>
        {whyOpen ? <LeadNotFitWhy busy={busy} on={{ onWhy: (why) => onNotAFit(why, allMatching ? { by: "view", action: "not_a_fit", view } : { by: "ids", action: "not_a_fit", ids }) }} /> : null}
      </span>
      {canExport
        ? <a className="btn btn-sm" href={exportHref} download title="Download these leads as a CSV file" data-testid="leads-bulk-export"><Icon name="external" size={12} /> Export</a>
        : <button type="button" className="btn btn-sm" {...window.gate("export", "export these leads")} data-testid="leads-bulk-export"><Icon name="external" size={12} /> Export</button>}
      {whyNot && <span className="cl-prof-aut-hint">{whyNot}</span>}
      <button type="button" className="btn btn-ghost btn-sm" onClick={onClear} data-testid="leads-bulk-clear"><Icon name="x" size={11} /> Clear</button>
    </div>
  );
};

/* ---------------------------------------------------------------- the phone */

// The phone's one bar (<=900px, the band People's own cards begin at): the People | Leads switch, the list it is
// showing, search and Find. Nothing else sits above the rows -- no title, no sub-headline, no stat cards and no
// second control row (legacy/CLAUDE.md, the phone shows the work first).
const LeadsPhoneBar = ({ scope, onScope, listLabel, onLists, listsOpen, q, onQ, searchRef, onFind, canFind }) => (
  <div className="ld-bar" data-testid="leads-phone-bar">
    <div className="pt-scope" role="tablist" aria-label="Which people">
      <button type="button" role="tab" aria-selected={scope === "people"} className={scope === "people" ? "on" : ""} onClick={() => onScope("people")}>People</button>
      <button type="button" role="tab" aria-selected={scope === "leads"} className={scope === "leads" ? "on" : ""} onClick={() => onScope("leads")}>Leads</button>
    </div>
    <button type="button" className="ld-bar-lists" onClick={onLists} aria-expanded={!!listsOpen} data-testid="leads-phone-lists">
      {listLabel}
      <Icon name="chevron-down" size={11} />
    </button>
    <input
      ref={searchRef}
      className="ld-bar-search"
      type="search"
      value={q}
      placeholder="Search leads"
      aria-label="Search leads"
      data-testid="leads-phone-search"
      onChange={(e) => onQ(e.target.value)}
    />
    <button
      type="button"
      className="ld-bar-find"
      aria-label="Find leads"
      data-testid="leads-phone-find"
      onClick={onFind}
      {...(canFind ? {} : window.gate("find", "find businesses for you"))}
    >
      <Icon name="sparkle" size={20} />
    </button>
  </div>
);

// The finder, as a sheet from the bottom of a phone. No listener of its own: the page's one keydown listener
// closes the finder on Esc before anything else and holds every other key while it is open (Task 2), so a second
// listener here would take the key twice and close the finder and then the selection on one press.
const LeadFinderSheet = ({ onClose, children }) => (
  <>
    <div className="sb-sheet-backdrop" onClick={onClose} />
    <div className="sb-sheet pl-finder" role="dialog" aria-label="Find leads" data-testid="leads-finder-sheet">
      <div className="ld-sheet-handle" />
      {children}
    </div>
  </>
);

/* ------------------------------------------------------------ the scope itself */

const LeadsScope = (p) => {
  const L = p.surface;
  const rail = p.rail;
  const standing = p.standing;
  const chips = ldExcludedChips(L.rows);
  const search = p.search;
  // The same band People's cards use (clients.css) and the same one the page's listener judges the Columns menu
  // by. The page hands it down (plPhone, clients-a.jsx): it listens to the query, so a window resized past the band
  // draws the other shape at once, where this read it on every draw and drew the other shape only on the next state
  // change. Nothing here is a hook.
  const phone = !!p.phone;
  const railRows = (
    <LeadsRailRows
          rail={rail}
          list={p.view.list}
          searchId={p.view.searchId}
          canFind={p.canFind}
          wordsFor={p.searchWordsFor}
          onPickList={p.onPickList}
          onPickSearch={p.onPickSearch}
          onWarmList={p.onWarmList}
          onWarmSearch={p.onWarmSearch}
          renaming={p.renaming}
          onRename={p.onRename}
          onRenameSave={p.onRenameSave}
          onRenameCancel={p.onRenameCancel}
          removing={p.removing}
          onRemoveAsk={p.onRemoveAsk}
          onUndo={p.onUndo}
          onRemoveYes={p.onRemoveYes}
          onRemoveNo={p.onRemoveNo}
          removeBusy={p.removeBusy}
          removeError={p.removeError}
          onMore={p.onFindNewOnes}
          onAgain={p.onSearchAgain}
      hrefFor={p.exportHrefFor}
      onNew={p.onFind}
    />
  );
  const ListsSheet = window.PeopleListsSheet;
  return (
    <div className="clients leads-scope" data-loading={p.loading ? "1" : undefined}>
      {/* At a phone's width the rail is the bar's list button instead (the stylesheet hides .cl-rail at 900px
          anyway, and the switch the rail heads is the bar's own). */}
      {!phone && <PeopleRail scope="leads" onScope={p.onScope}>{railRows}</PeopleRail>}

      <div className="cl-main">
        <div className="cl-main-scroll pl-main" ref={p.scrollRef}>
          {phone ? (
            <LeadsPhoneBar
              scope="leads"
              onScope={p.onScope}
              listLabel={p.railLabel}
              onLists={p.onLists}
              listsOpen={p.listsOpen}
              q={p.q}
              onQ={p.onQ}
              searchRef={p.searchRef}
              onFind={p.onFind}
              canFind={p.canFind}
            />
          ) : (
            <>
              <PeopleStanding scope="leads" leads={standing} onNeeds={p.onNeedsYou} onScope={p.onScope} />

              <div className="cl-controls">
                <div className="cl-search-wrap">
                  <Icon name="search" size={13} />
                  <input ref={p.searchRef} placeholder="Search leads" aria-label="Search leads" value={p.q} onChange={(e) => p.onQ(e.target.value)} />
                  <span className="kbd">/</span>
                </div>
                <div className="cl-controls-right">
                  {/* Values ⁄ Signals (D5): the number and the address in the row, for anyone who dials from a desk phone; kept per viewer. */}
                  {/* The same leads, as places (D5). */}
                  <button type="button" className={`btn btn-ghost btn-sm${p.mapOpen ? " on" : ""}`} aria-pressed={!!p.mapOpen} onClick={() => p.onMap(!p.mapOpen)} data-testid="leads-map-toggle" title="See these leads on the ground"><Icon name="pin" size={12} /> {p.mapOpen ? "Table" : "Map"}</button>
                  <button type="button" className={`btn btn-ghost btn-sm ld-values${p.values ? " on" : ""}`} aria-pressed={!!p.values} onClick={() => p.onValues(!p.values)} data-testid="leads-values" title="Show the numbers and addresses in the rows">{p.values ? "Signals" : "Values"}</button>
                  <PeopleColumnsMenu open={p.colsOpen} onOpenChange={p.onColsOpen} options={p.colOptions} onPick={p.onPickColumn} buttonRef={p.colsButton} />
                  {p.canExport
                    ? <a className="btn btn-ghost btn-sm" href={p.exportHref} download title="Download these leads as a CSV file" data-testid="leads-export"><Icon name="external" size={12} /> Export</a>
                    : <button type="button" className="btn btn-ghost btn-sm" {...window.gate("export", "export these leads")} data-testid="leads-export"><Icon name="external" size={12} /> Export</button>}
                  <button type="button" className="btn btn-primary btn-sm" onClick={p.onFind} data-testid="leads-find" {...(p.canFind ? {} : window.gate("find", "find leads"))}>
                    <Icon name="sparkle" size={12} /> Find leads <span className="kbd">F</span>
                  </button>
                </div>
              </div>
            </>
          )}

          {/* The finder folds out above the table on a desktop and comes up as a sheet from the bottom of a
              phone. `phone` changes two things inside the finder itself and nothing else (Task 8): hold-to-talk
              is the sheet's first control, and the input is full width under it. */}
          {!p.firstDay && p.finderOpen && (() => {
            const finder = (
              <LeadFinder
                open
                phone={phone}
                stage={p.finderStage}
                words={p.finderWords}
                proposal={p.finderProposal}
                plan={p.finderPlan}
                trace={p.finderTrace}
                pick={p.finderPick}
                refusal={p.finderRefusal}
                busy={p.finderBusy}
                suggestions={L.suggestions}
                talk={p.talk}
                onWords={p.onFinderWords}
                onPlan={p.onFinderPlan}
                onChangePlan={p.onFinderChangePlan}
                onPick={p.onFinderPick}
                onApprove={p.onFinderApprove}
                onBack={p.onFinderBack}
                onClose={p.onCloseFinder}
              />
            );
            return phone ? <LeadFinderSheet onClose={p.onCloseFinder}>{finder}</LeadFinderSheet> : finder;
          })()}

          {/* Which list is open, as People says which of its lists is (its .cl-section-head, the same classes): the
              list's name, and the way back to all leads. A search that is open says itself in the strip instead, and
              the phone's bar already names the list. */}
          {!search && !phone && !p.firstDay && !L.readFailed ? (
            <div className="cl-section-head ld-list-head" data-testid="leads-list-head">
              <div className="cl-section-lead">
                <span className="cl-section-title" data-testid="leads-list-title">{p.listTitle}</span>
                {p.view.list !== "all" ? <button type="button" className="cl-bucket-link" onClick={() => p.onPickList("all")} data-testid="leads-show-all">Show all leads</button> : null}
                {/* What a refresh found and the surface is holding back (E8: nothing re-sorts under the owner). An open
                    search says it in its strip; here the head does, with the strip's own words and door. */}
                {L.offered > 0 ? <button type="button" className="cl-bucket-link ld-offered" onClick={p.onTakeOffered} data-testid="leads-offered">{L.offered} new</button> : null}
              </div>
            </div>
          ) : null}

          {search && <LeadStrip vm={p.strip} onAction={p.onStripAction} />}

          {search && p.band && <LeadBand band={p.band} cls={p.view.cls} onPick={p.onPickClass} fit={p.fit} onPickFit={p.onPickFit} />}
          {p.view.cls === "excluded" && <LeadExcludedChips chips={chips} active={p.chip} onPick={p.onPickChip} />}
          {p.view.cls === "review" && !p.benchGroups.length && window.__LEAD_VM && window.__LEAD_VM.leadReviewGroups && <LeadReviewGroups groups={window.__LEAD_VM.leadReviewGroups(L.rows, search)} onPick={p.onSelectIds} />}

          {L.readFailed
            ? <FailedRead kind="block" what="your leads" surface="leads" testid="leads-failed" />
            : p.mapOpen && p.plot && p.plot.pins.length
            ? (
              <LeadMap
                rows={p.rows}
                plot={p.plot}
                oneSearch={!!p.view.searchId}
                by={p.mapBy}
                onBy={p.onMapBy}
                picked={p.mapPick}
                onPick={p.onMapPick}
                x={p.cellCtx}
                onWiden={p.onWiden}
                nearby={(search && search.round && search.round.nearby) || []}
                onNearby={p.onNearby}
                canFind={p.canFind}
              />
            )
            : p.view.cls === "review" && p.benchGroups.length
            ? (
              <LeadReviewBench
                groups={p.benchGroups}
                rows={p.rows}
                groupKey={p.benchGroup}
                onGroup={p.onBenchGroup}
                search={search}
                month={p.month}
                review={p.review}
                x={p.cellCtx}
                onNearby={p.onNearby}
              />
            )
            : p.firstDay
            ? (
              <LeadsFirstDay
                ways={p.ways}
                suggestions={L.suggestions}
                canFind={p.canFind}
                lineOpen={p.lineOpen}
                lineDraft={p.lineDraft}
                lineError={p.lineError}
                lineBusy={p.lineBusy}
                onPick={(words) => { p.onFinderWords(words); p.onFind(); }}
                onGo={p.onGo}
                onOpenLine={p.onOpenLine}
                onLineDraft={p.onLineDraft}
                onSaveLine={p.onSaveLine}
                onCancelLine={p.onCancelLine}
                composer={
                  <LeadFinder
                    open
                    inline
                    phone={phone}
                    stage={p.finderStage}
                    words={p.finderWords}
                    proposal={p.finderProposal}
                    plan={p.finderPlan}
                    trace={p.finderTrace}
                    pick={p.finderPick}
                    refusal={p.finderRefusal}
                    busy={p.finderBusy}
                    suggestions={L.suggestions}
                    talk={p.talk}
                    onWords={p.onFinderWords}
                    onPlan={p.onFinderPlan}
                    onChangePlan={p.onFinderChangePlan}
                    onPick={p.onFinderPick}
                    onApprove={p.onFinderApprove}
                    onBack={p.onFinderBack}
                    onClose={p.onCloseFinder}
                  />
                }
              />
            )
            : (
              <PeopleTable
                busy={!!p.loading}
                phone={phone}
                noun="lead"
                columns={p.columns}
                ctx={p.cellCtx}
                rows={p.rows}
                rowClass={(l) => `ld-row-${l.state}`}
                total={p.total}
                sortBy={p.sortBy}
                sortDir={p.sortDir}
                onSort={p.onSort}
                onOpen={p.onPeek}
                filtered={p.filtered}
                onClearFilters={p.onClearFilters}
                selectable={p.canFind || p.canExport}
                sel={p.sel}
                onToggle={p.onToggle}
                onToggleAll={p.onToggleAll}
                cursor={p.cursor}
                onCursor={p.onCursor}
                scrolled={p.scrolled}
                onScrolled={p.onScrolled}
                empty={p.empty}
              />
            )}
          {L.next && (
            <div className="cl-section-sub ld-more" data-testid="leads-more">
              {p.rows.length.toLocaleString()} of {p.total.toLocaleString()} loaded{" "}
              <button type="button" className="btn btn-ghost btn-sm" disabled={p.loadingMore} onClick={p.onMore} data-testid="leads-more-btn">{p.loadingMore ? "Loading…" : "Show more"}</button>
            </div>
          )}
        </div>
        {p.sel.size > 0 && p.rows.some((l) => p.sel.has(l.id)) && (
          <LeadsBulkBar
            sel={p.sel}
            rows={p.rows}
            total={p.total}
            view={p.bulkView}
            canFind={p.canFind}
            canExport={p.canExport}
            busy={p.bulkBusy}
            whyNot={p.canFind ? null : "Only an owner can change leads."}
            allMatching={p.allMatching}
            onSelectAllMatching={p.onSelectAllMatching}
            review={p.review}
            onClear={p.onClearSel}
            onCopyEmails={p.onCopyEmails}
            onContacted={p.onBulk}
            onNotAFit={p.onBulkNotAFit}
            whyOpen={p.bulkWhy}
            onWhyOpen={p.onBulkWhy}
            exportHref={p.exportHref}
          />
        )}
        {/* The peek (Task 12): the page's state and its setters, so its own acts (LeadPeekActions) are built
            from them on every draw and nothing in leads-peek.jsx keeps state of its own. The acts are what the
            peek takes -- the stage, Draft and its tones, Open in your email, Copy and the two answers to "Did
            you send it?" are all `on.<name>` inside it -- so the setters go INTO LeadPeekActions and the acts
            it returns go to the peek. Handed the setters themselves it would draw a pane of dead controls. */}
        {p.peek && (() => {
          const acts = LeadPeekActions({
            vm: p.peek,
            flash: p.flash,
            onOpenPerson: p.onOpenPerson,
            // Keep, Exclude, Put back and Copy are the scope's own (Task 11); the acts hand them on, so the
            // peek has one shape of props.
            keep: p.onKeep,
            exclude: p.onExclude,
            putBack: p.onPutBack,
            copyEmail: p.onCopy,
            copyPhone: p.onCopyPhone,
            draft: p.draft,
            armed: p.armed,
            setMode: p.onPeekMode,
            setArmed: p.onArmed,
            setDraft: p.onDraftState,
            setPeekId: p.onPeekId,
            // The photo, expanded (D5): the page's own lightbox state.
            expand: p.onExpandPhoto,
          });
          // Call is the acts' own: it arms "How did the call go?" and then hands the tel: to the browser, which
          // is exactly what C over the rows does (clients-a.jsx's callLead), so both end in the same place.
          // The deck is a phone's (D5): one lead at a time, with the pile's place under the thumb.
          return <LeadPeek vm={p.peek} mode={p.peekMode} armed={p.armed} draft={p.draft} busy={p.bulkBusy} deck={phone ? p.deck : null} {...acts} />;
        })()}
        {/* The phone's rail, as a sheet from the bar's list button: the same rows, the same counts, the same
            searches and the same New search. People's own sheet (clients-a.jsx), which owns its Esc, so the
            page's one listener holds still while it is open (keys.sheetOpen). Last in the tree, after
            everything whose state a stub React keys by order. */}
        {/* The photo, expanded (D5): the peek's own view model, drawn large with the facts about the place beside it. */}
        {p.lightbox && window.LeadLightbox ? <window.LeadLightbox vm={p.lightbox} onClose={p.onCloseLightbox} /> : null}
        {phone && p.listsOpen && ListsSheet && <ListsSheet onClose={p.onCloseLists}>{railRows}</ListsSheet>}
        {p.toastNode}
      </div>
    </div>
  );
};

Object.assign(window, { LeadsScope, LeadsBulkBar, LeadRowActions, LeadShape, LeadSearchMenu, LeadsRailRows, LeadsPhoneBar, LeadFinderSheet, LeadBand, LeadTile, LeadSlot, LeadSlotShape, LeadTip, LeadCard, LeadReviewBench, LeadMap, LeadExcludedChips, ldExcludedChips, ldPlacePop, LEAD_COLUMNS, LEAD_SORT_KEYS });
