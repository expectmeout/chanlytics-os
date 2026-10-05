/**
 * The identity cell (D5), moved from legacy/pages/leads-cells.jsx (decision 0015): the tile, the name (which peeks) with
 * its card, the tags the row's state and its fit wear, and one quiet line about where -- or, for a row that waits, what
 * would resolve it; for a left-out row, what left it out. The two tags are the kit's one StatePill, on the registry's tones
 * (tone.ts).
 */
import type { LeadRowVM } from "@chanlytics/contracts";
import { StatePill } from "../../kit/pill/state-pill";
import { LeadCallMenu, ldCallProps } from "./call-menu";
import { LeadCard, ldPlacePop } from "./hover";
import { LeadTile } from "./tile";
import type { LeadCellCtx } from "./types";

// The name's card: enough to decide without opening the peek, and the one hover that carries links, because it is the one
// you can keep the pointer inside.
const LeadNameCard = ({ l, x }: { l: LeadRowVM; x: LeadCellCtx }) => (
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
      {l.card.site ? (
        <a href={l.card.site.href} target="_blank" rel="noopener noreferrer">
          {l.card.site.label}
        </a>
      ) : null}
      {l.card.maps ? (
        <a href={l.card.maps.href} target="_blank" rel="noopener noreferrer">
          {l.card.maps.label}
        </a>
      ) : null}
      <span className="sp" />
      {l.phone && !l.phoneWrong ? (
        <LeadCallMenu
          {...ldCallProps(l, x)}
          look={{ variant: "primary", size: "sm", iconOnly: false }}
          label="Call"
          testid="lead-card-call"
        />
      ) : null}
    </div>
  </LeadCard>
);

// What people say: the spread the row only hints at, one bar a star.
export const LeadRatedCard = ({ l }: { l: LeadRowVM }) => {
  const spread = l.spread ?? [0, 0, 0, 0, 0];
  const total = spread.reduce((a, b) => a + b, 0) || 1;
  return (
    <LeadCard label={`How ${l.name} is rated`} testid="lead-card-rated">
      <div className="ld-card-rated">
        <span className="ld-card-score">{l.rated?.score}</span>
        <span className="ld-card-count">{l.rated?.count} reviews</span>
      </div>
      {[5, 4, 3, 2, 1].map((star) => {
        const n = spread[star - 1] ?? 0;
        return (
          <div key={star} className="ld-bar-row">
            <span className="k">{star}</span>
            <span className="ld-bar">
              <span style={{ width: `${Math.round((n / total) * 100)}%` }} />
            </span>
            <span className="n">{n.toLocaleString("en-US")}</span>
          </div>
        );
      })}
    </LeadCard>
  );
};

/** The row's classes on its tr (leads.css): a lead's row, its state, and its class. One function, so a memoised row sees the same one each draw. */
export const ldRowClass = (l: LeadRowVM) => `ld-row ld-row-${l.state} ld-cls-${l.cls}`;

// Whether the Stage column says exactly what the name's state tag would: Talking, or a lead out of the running that is
// not left out (the column draws nothing for a left-out lead, and Needs review and Contacted say more than it does).
const ldStageSaysIt = (l: LeadRowVM) => l.state === "talking" || (l.state === "out" && l.cls !== "excluded");

/**
 * A converted lead whose person became a client (0004): the row reads People's row for them, and a deal won says Client in
 * the deal pill's own tone, in place of the lead's own tag. Nothing stored on the lead; a proposal still out, or no deal,
 * keeps the lead's word. People not read yet reads as no deal. The rows come through the cell context (x.peopleRows), never
 * the surface itself: a memoised row is drawn again only when a prop changes, and on a cold load of Leads the people land
 * after the rows were drawn.
 */
export const ldClientOf = (l: LeadRowVM, x: Pick<LeadCellCtx, "peopleRows"> | null | undefined) => {
  const rows = x && x.peopleRows;
  const person = l.contactId && rows ? rows.find((p) => p.id === l.contactId) : null;
  return !!(person && person.deal && person.deal.stage === "won");
};

export const ldBusinessCell = (l: LeadRowVM, x: LeadCellCtx) => (
  <td key="business" className={`cl-name-cell pl-pin ld-biz-cell ${l.cls}`}>
    <div className="cl-row-name ld-row-name">
      <LeadTile l={l} onExpand={x.onExpand} />
      <div className="cl-row-name-block ld-hover" onMouseEnter={ldPlacePop} onFocus={ldPlacePop}>
        <div className="cl-row-fullname">
          <button
            type="button"
            className="ld-biz-name"
            onClick={(e) => {
              e.stopPropagation();
              x.onOpen(l.id);
            }}
            aria-describedby={`${l.id}-card`}
            data-testid="lead-name"
          >
            {l.name}
          </button>
          {l.places > 1 && (
            <span className="ld-badge" title="Two listings on the map for one business">
              {l.places} listings
            </span>
          )}
          {x.mixedFits && l.fit ? (
            <StatePill kind="lead_fit" value={l.fit} label={l.fitLabel} testid="lead-fit-tag" />
          ) : null}
          {/* Said once: while the Stage column is drawn, the name's tag gives way where the column says the same thing
              (Talking; a lead that said no or is not a fit). It stays where it says more: Needs review, Left out (the
              column is empty for a left-out lead), and Contacted with how long ago. */}
          {ldClientOf(l, x) ? (
            <StatePill kind="deal" value="won" testid="lead-state-tag" />
          ) : l.stateTag && !(x.stageShown && ldStageSaysIt(l)) ? (
            <StatePill kind="lead_row_state" value={l.state} label={l.stateTag} testid="lead-state-tag" />
          ) : null}
        </div>
        <div className={`cl-row-meta ld-sub${l.waitsOn ? " waits" : ""}`} data-testid="lead-sub">
          {l.cls === "excluded" ? l.fitLabel : l.waitsOn || l.sub}
        </div>
        <LeadNameCard l={l} x={x} />
      </div>
    </div>
  </td>
);
