/* global React, Icon, MoreMenu, Confirm, EmptyState, FailedRead, PeopleRail, RailSection, RailRow, PeopleStanding, PeopleTable, PeopleColumnsMenu, plSortKeys, plDrawnColumns, plColumnOptions, PL_NO_SEL, LeadPlanPanel, LeadStrip, LeadPeek, LeadPeekActions, LeadNotFitWhy, LeadsFirstDay */
// Chanlytics -- People › Leads: a lead's cells, cards and row actions, and the columns the Leads table draws. Moved
// whole from leads-scope.jsx (Reach out Part 2.5), which reads them from window.

/* ------------------------------------------------------------------ the row */

// The row's acts: Call and Copy on every row, on hover and on the keyboard's cursor; and the class's own three
// (§8.7, S9): Keep and Exclude move a place out of Needs review, Put back is the owner's override of an
// exclusion. All three count, so all three are the owner's permission `find`; anyone else sees them on the page,
// in the tab order, saying why when pressed (window.gate, data-bits.jsx), never disabled and never silent.
// They are the system's small buttons, 26px like People's row acts: Call and Copy square (`btn-icon btn-sm`), the
// words `btn-sm`. On a phone's card, leads.css draws Call at 44px.
// Call asks first. It dialled the instant it was pressed -- a real call to a real business, from a row you might
// only have been skimming -- and a call made from a desk phone could not be recorded at all, because the six
// outcomes are armed by that button alone. The ways are contracts' (LEAD_CALL_WAYS), and the receptionist is not
// among them: it answers your line and never rings a customer, which the Business page tells the owner in those
// words (business-tab.ts CANNOT_ROWS). The number is the menu's heading, so you see what you would dial.
// One menu wherever Call is: a lead's row, its card, the map's card and the lead's own panel. It takes what it says and
// what each way does, not a lead, because the row and the panel hold a lead in two shapes. `number` is the menu's
// heading where the button is only a glyph; a button that says the number already leaves it out.
const LeadCallMenu = ({ name, number, onDial, onCopy, onLog, btnClass, label = null, heading = true, size = 11, testid = "lead-call" }) => {
  const W = window.__LEAD_WORDS.callWays;
  return (
    <MoreMenu
      align="right"
      escape
      icon="phone"
      size={size}
      title={`Call ${name}`}
      btnClass={btnClass}
      label={label}
      testid={testid}
      items={[
        ...(heading ? [{ header: number }] : []),
        { label: W.dial.label, icon: "phone", onClick: onDial },
        { label: W.copy.label, icon: "copy", onClick: onCopy },
        { label: W.log.label, icon: "check", meta: W.log.meta, onClick: onLog },
      ]}
    />
  );
};

// What a lead's row, card or map card hands the menu: its name, its number as a person reads it, and the three ways.
const ldCallProps = (l, acts) => ({
  name: l.name,
  number: (window.__phoneDisplay && window.__phoneDisplay(l.phone)) || l.phone,
  onDial: () => acts.onCall(l.id),
  onCopy: () => acts.onCopyPhone(l.id),
  onLog: () => acts.onLogCall(l.id),
});

const LeadRowActions = ({ l, onCall, onCopy, onCopyPhone, onLogCall, onKeep, onExclude, onPutBack, canFind }) => (
  <span className="cl-row-actions ld-row-actions">
    {l.phone && !l.phoneWrong && <LeadCallMenu {...ldCallProps(l, { onCall, onCopyPhone, onLogCall })} btnClass="btn btn-ghost btn-icon btn-sm ld-call" />}
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
// plain circle (`icons.jsx`, its `default` case), which would say the same thing about five different states. Five inline paths in
// one component instead of five names that do not exist.
//
// **This is the one LeadShape in the release.** Task 12's peek draws the same component from `window` (its email
// line is `<LeadShape state={vm.reach.email.state} />`) and declares no second one: `leads-peek.jsx` loads after
// `leads-cells.jsx`, so a second declaration would silently take this one's place.
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
      {l.tile.image ? <img className="ph" src={l.tile.image} alt="" loading="lazy" decoding="async" onError={hide} /> : null}
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
      {l.phone && !l.phoneWrong ? <LeadCallMenu {...ldCallProps(l, x)} btnClass="btn btn-sm btn-primary" label="Call" testid="lead-card-call" /> : null}
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
// The row's classes on its tr (leads.css): a lead's row, its state, and its class. One function, so a memoised
// row sees the same one each draw. The stylesheet reads them rather than asking every tr :has(td.ld-biz-cell).
const ldRowClass = (l) => `ld-row ld-row-${l.state} ld-cls-${l.cls}`;

// Whether the Stage column says exactly what the name's state tag would: Talking, or a lead out of the running that is
// not left out (the column draws nothing for a left-out lead, and Needs review and Contacted say more than it does).
const ldStageSaysIt = (l) => l.state === "talking" || (l.state === "out" && l.cls !== "excluded");

// A converted lead whose person became a client (0004): the row reads People's row for them, and a deal won says
// Client in the deal pill's own tone, in place of the lead's own tag. Nothing stored on the lead; a proposal still
// out, or no deal, keeps the lead's word. People not read yet reads as no deal. The rows come through the cell
// context (x.peopleRows, leads-real.jsx leadCellCtxFor), never the global: a memoised row is drawn again only when
// a prop changes, and on a cold load of Leads the people land after the rows were drawn.
const ldClientOf = (l, x) => {
  const rows = x && x.peopleRows;
  const person = l.contactId && rows ? rows.find((p) => p.id === l.contactId) : null;
  return !!(person && person.deal && person.deal.stage === "won");
};

const ldBusinessCell = (l, x) => (
  <td key="business" className={`cl-name-cell pl-pin ld-biz-cell ${l.cls}`}>
    <div className="cl-row-name ld-row-name">
      <LeadTile l={l} onExpand={x.onExpand} />
      <div className="cl-row-name-block ld-hover" onMouseEnter={ldPlacePop} onFocus={ldPlacePop}>
        <div className="cl-row-fullname">
          <button type="button" className="ld-biz-name" onClick={(e) => { e.stopPropagation(); x.onOpen(l.id); }} aria-describedby={`${l.id}-card`} data-testid="lead-name">{l.name}</button>
          {l.places > 1 && <span className="ld-badge" title="Two listings on the map for one business">{l.places} listings</span>}
          {x.mixedFits && l.fit ? <StatePill kind="lead_fit" value={l.fit} label={l.fitLabel} testid="lead-fit-tag" /> : null}
          {/* Said once: while the Stage column is drawn, the name's tag gives way where the column says the same thing
              (Talking; a lead that said no or is not a fit). It stays where it says more: Needs review, Left out (the
              column is empty for a left-out lead), and Contacted with how long ago. */}
          {ldClientOf(l, x) ? <StatePill kind="deal" value="won" testid="lead-state-tag" /> : l.stateTag && !(x.stageShown && ldStageSaysIt(l)) ? <StatePill kind="lead_row_state" value={l.state} label={l.stateTag} testid="lead-state-tag" /> : null}
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
// and the peek say why, and the row wears its stage as a tag. In the shape the table takes (surfaces/people/table/table.tsx):
// { key, label, sortable, pinned, fixed, on, needs, cell(l, x) }. The six that sort are the six `leads_page` takes.
const LEAD_COLUMNS = [
  { key: "business", label: "Business", sortable: true, pinned: true, cell: ldBusinessCell },
  // Beside the name (Reach out Part 6, H8: "Columns puts the Stage beside the name"), with, while a reach-out writes to
  // the open search, the line that says where this business stands in it (contracts reachOutLineOf, x.reachOut).
  { key: "stage", label: "Stage", sortable: true, on: false, cell: (l, x) => <td key="stage" className="shrink ld-stage-cell" data-testid="lead-stage">{l.cls !== "excluded" && <StatePill kind="lead_stage" value={l.stage} label={l.stageLabel} />}{ldReachOutLine(l, x)}</td> },
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
  { key: "distance", label: "Distance", sortable: true, needs: (x) => x.hasCenter, on: false, cell: (l) => <td key="distance" className="shrink dim ld-distance-cell">{l.distance}</td> },
  { key: "source", label: "Source", sortable: false, on: false, cell: (l) => <td key="source" className="shrink dim ld-source-cell">{l.source}</td> },
  { key: "website", label: "Website", sortable: false, on: false, cell: (l) => <td key="website" className="shrink dim ld-website-cell">{l.host}</td> },
  { key: "search", label: "Search", sortable: false, on: false, cell: (l) => <td key="search" className="shrink dim ld-search-cell">{l.searchName}</td> },
  // The row's acts, where the eye ends: on hover and on the keyboard's cursor (clients.css shows .cl-row-actions then).
  { key: "actions", label: "", sortable: false, fixed: true, cell: (l, x) => <td key="actions" className="shrink cl-actions-cell"><LeadRowActions l={l} onCall={x.onCall} onCopy={x.onCopy} onCopyPhone={x.onCopyPhone} onLogCall={x.onLogCall} onKeep={x.onKeep} onExclude={x.onExclude} onPutBack={x.onPutBack} canFind={x.canFind} /></td> },
];

// A lead's row on a phone is People's (plRowCard, clients-a.jsx; the phone pass, D8), so the two scopes are one list to
// the eye: the business's mark or the listing's photo on its initials, its name and its state (Ready too, as a
// person's row always says theirs); where it is, or what it waits on, or what left it out; and whether a phone and a
// mailbox reach it, how it is rated and when it was found. Call is the lead's own page's first button -- the row opens
// it -- and C on a keyboard: a 44px Call on every card made Leads' rows a second kind of list.
// Where this business stands in the reach-out writing to the open search (Part 6, H8), or nothing.
const ldReachOutLine = (l, x) => {
  const line = x && x.reachOut && l.cls !== "excluded" ? x.reachOut.lineOf(l.id) : null;
  return line ? <div className="cl-row-meta" data-testid="lead-reach-out-line">{line}</div> : null;
};

// A phone, as People judges it (clients-a.jsx PL_PHONE_QUERY): the slide below is a thumb's alone.
const ldPhoneNow = () => !!(window.matchMedia && window.matchMedia(window.PL_PHONE_QUERY || "(max-width: 900px)").matches);
const ldCardCell = (l, x) => {
  // Needs review on a phone (Ruben, 25 Sep): a thumb slides the row -- right to keep, left to exclude, the bell's way
  // (data-bits touchSwipe) -- over the act's word. The doors are
  // the cell context's, the same the bench and the bar press; a member who may not find leads gets no slide.
  const slides = l.cls === "review" && !!(x && x.canFind) && !!window.touchSwipe;
  const W = (window.__LEAD_VM && window.__LEAD_VM.LEAD_REVIEW_ACT_WORDS) || { keep: "Keep", exclude: "Exclude" };
  return window.plRowCard({
  face: { initials: l.tile.initials, image: l.tile.image, mark: l.tile.logo },
  name: l.name,
  pill: ldClientOf(l, x) ? <StatePill kind="deal" value="won" testid="lead-state" /> : <StatePill kind="lead_row_state" value={l.state} label={l.stateTag || l.stageLabel} testid="lead-state" />,
  // Under a group's own heading (x.sectioned, leads-scope.jsx ldReviewSections) the reason is said once, above.
  // While a reach-out writes to the open search, its line says where this business stands (Part 6, H8).
  lead: l.cls === "excluded" ? l.fitLabel : l.cls === "review" && x && x.sectioned ? l.sub : ((x && x.reachOut && x.reachOut.lineOf(l.id)) || l.waitsOn || l.sub),
  leadTestid: "lead-sub",
  swipe: slides
    ? window.touchSwipe({
        onBack: () => x.onKeep(l.id),
        onAway: () => x.onExclude(l.id),
        when: ldPhoneNow,
        // The cell shows its grounds only while a thumb has the card (leads.css `.sliding`).
        onGrab: (el, on) => { if (el && el.parentElement && el.parentElement.classList) el.parentElement.classList.toggle("sliding", on); },
      })
    : null,
  grounds: slides
    ? [
        <span key="keep" className="pl-card-ground keep" aria-hidden="true">{W.keep}</span>,
        <span key="exclude" className="pl-card-ground exclude" aria-hidden="true">{W.exclude}</span>,
      ]
    : null,
  facts: [
    l.cls !== "excluded" ? (
      <span key="reach" className="pl-card-reach" role="img" aria-label={`Phone: ${l.slots.phone.word}. Email: ${l.slots.mailbox.word}.`} data-testid="lead-reach">
        <LeadSlotShape state={l.slots.phone.state} />
        <LeadSlotShape state={l.slots.mailbox.state} />
      </span>
    ) : null,
    l.rated ? <span key="rated" className="pl-card-rated" data-testid="lead-rated"><Icon name="star" size={11} />{l.rated.score} · {l.rated.count}</span> : null,
    <span key="found" className="pl-card-last" data-testid="lead-found">{l.foundLine}</span>,
  ],
  });
};

// A phone's one column for Leads, and the class its rows wear: People's (clients.css draws both from it).
const LEAD_PHONE_COLUMNS = [{ key: "card", label: "Business", sortable: false, pinned: true, cell: ldCardCell }];

const ldCardRowClass = () => "pl-card-row";

// business, fit, rating, stage, found, distance: what a saved Leads view may sort by.
const LEAD_SORT_KEYS = plSortKeys(LEAD_COLUMNS);

Object.assign(window, { LeadCallMenu, LEAD_PHONE_COLUMNS, ldCardCell, LeadRowActions, LeadShape, LeadTile, LeadSlot, LeadSlotShape, LeadTip, LeadCard, ldPlacePop, LEAD_COLUMNS, LEAD_SORT_KEYS, ldCallProps, ldCardRowClass, ldRowClass });
