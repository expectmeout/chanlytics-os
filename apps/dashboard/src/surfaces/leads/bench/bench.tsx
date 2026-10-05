/**
 * Needs review, as a workbench (D5), moved from legacy/pages/leads-bench.jsx (decision 0015). Needs review stops being a tab
 * on a table. The pile is on the left, in the order an owner works it (contracts' leadReviewGroups: what settles itself,
 * then what one press settles, then what needs an eye); the group being worked is in the middle, as cards, with its own
 * acts on a bar over them; and on the right, what each press does and costs, what the search asked for, and -- when the
 * round ran dry -- where to look next (00145's own areas).
 *
 * Every word here is contracts': the group's label and the sentence under it, the act's word, the cost line, the criteria
 * in the owner's own words. The acts are the same doors the bulk bar uses, so a press on the bench and a press on the bar
 * are one act.
 */
import {
  LEAD_REVIEW_ACT_WORDS,
  LEAD_REVIEW_GROUP_WHY,
  leadAskedFor,
  leadReviewCosts,
  type LeadMonthDto,
  type LeadReviewAct,
  type LeadReviewGroup,
  type LeadRowVM,
  type LeadSearchDto,
} from "@chanlytics/contracts";
import { gate, holdStill } from "../../legacy-verbs";
import { LeadSlot } from "../cells/shapes";
import { LeadTile } from "../cells/tile";
import type { LeadCellCtx } from "../cells/types";
import type { ReviewDoors, NearbyArea } from "./types";

/** The pile: the groups in the order to work them, the one being worked marked. */
const benchQueue = (groups: readonly LeadReviewGroup[], g: LeadReviewGroup, onGroup: (key: string) => void) => {
  const words = LEAD_REVIEW_ACT_WORDS;
  return (
    <div
      className="ld-bench-queue"
      role="tablist"
      aria-label="What would resolve these leads"
      data-testid="lead-bench-queue"
    >
      <div className="ld-bench-qh">The pile, in the order to work it</div>
      {groups.map((y) => (
        <button
          key={y.key}
          type="button"
          role="tab"
          aria-selected={y.key === g.key}
          className={`ld-bench-g ${y.id}${y.key === g.key ? " on" : ""}`}
          onClick={(e) => holdStill(e && e.currentTarget, () => onGroup(y.key))}
          data-testid={`bench-group-${y.key}`}
        >
          <span className="n">{y.ids.length}</span>
          <span className="l">{y.label}</span>
          <span className="a">{y.acts.length ? y.acts.map((a) => words[a] || a).join(" · ") : "Resolves itself"}</span>
        </button>
      ))}
    </div>
  );
};

/** One lead of the group being worked: its tile, its words, its reach, and its own Keep and Exclude. */
const benchCard = (l: LeadRowVM, x: LeadCellCtx) => {
  const words = LEAD_REVIEW_ACT_WORDS;
  return (
    <div
      key={l.id}
      id={`lead-${l.id}`}
      className="ld-bench-card"
      data-testid="lead-bench-card"
      onClick={() => x.onOpen(l.id)}
    >
      <LeadTile l={l} size={40} />
      <div className="b">
        <div className="n">
          <button
            type="button"
            className="ld-biz-name"
            onClick={(e) => {
              e.stopPropagation();
              x.onOpen(l.id);
            }}
            data-testid="bench-card-name"
          >
            {l.name}
          </button>
        </div>
        <div className="s">{l.sub}</div>
        <div className="w">{l.why}</div>
      </div>
      <div className="r">
        <span className="ld-slots values">
          <LeadSlot
            id={l.id}
            kind="phone"
            slot={l.slots.phone}
            values
            onPress={l.slots.phone.value && l.slots.phone.state !== "bad" ? () => x.onCall(l.id) : null}
            pressLabel="press to call"
          />
          <LeadSlot
            id={l.id}
            kind="mailbox"
            slot={l.slots.mailbox}
            values
            onPress={l.slots.mailbox.copy ? () => x.onCopy(l.id) : null}
            pressLabel="press to copy"
          />
        </span>
        <span className="ld-bench-card-acts">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={(e) => {
              e.stopPropagation();
              x.onKeep(l.id);
            }}
            data-testid="bench-card-keep"
            {...(x.canFind ? {} : gate("find", "keep this lead"))}
          >
            {words.keep || "Keep"}
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={(e) => {
              e.stopPropagation();
              x.onExclude(l.id);
            }}
            data-testid="bench-card-exclude"
            {...(x.canFind ? {} : gate("find", "exclude this lead"))}
          >
            {words.exclude || "Exclude"}
          </button>
        </span>
      </div>
    </div>
  );
};

/** On the right: what each press does and costs, what the search asked for, and where to look next when the round ran dry. */
const benchSide = (
  costs: ReturnType<typeof leadReviewCosts>,
  asked: ReturnType<typeof leadAskedFor>,
  nearby: readonly NearbyArea[],
  onNearby: (area: NearbyArea) => void,
) => (
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
        {asked.map((a) => (
          <div key={`${a.kind}-${a.text}`} className={`ld-bench-asked-row ${a.kind}`}>
            {a.text}
          </div>
        ))}
      </div>
    ) : null}
    {nearby.length ? (
      <div className="ld-bench-block" data-testid="bench-dry">
        <div className="pk-label">This round ran dry</div>
        <p className="ld-bench-quiet">Nothing new was left where it looked. The nearest areas past it:</p>
        <div className="ld-bench-nearby">
          {nearby.map((a) => (
            <button
              key={a.label}
              type="button"
              className="ld-band-fit"
              onClick={() => onNearby(a)}
              data-testid={`bench-nearby-${a.zip || a.label}`}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>
    ) : null}
  </div>
);

export const LeadReviewBench = ({
  groups,
  rows,
  groupKey,
  onGroup,
  search,
  month,
  review,
  x,
  onNearby,
}: {
  groups: readonly LeadReviewGroup[];
  rows: readonly LeadRowVM[];
  groupKey: string | null;
  onGroup: (key: string) => void;
  search: LeadSearchDto | null;
  month: LeadMonthDto | null;
  review: ReviewDoors;
  x: LeadCellCtx;
  onNearby: (area: NearbyArea) => void;
}) => {
  const g = groups.find((y) => y.key === groupKey) || groups[0];
  if (!g) return null;
  const ids = g.ids;
  const cards = rows.filter((l) => ids.indexOf(l.id) >= 0);
  const costs = leadReviewCosts(g.acts, ids.length, month);
  const asked = leadAskedFor(search);
  const nearby = (search && search.round && search.round.nearby) || [];
  const words = LEAD_REVIEW_ACT_WORDS;
  // An act draws only where its door exists, as the bulk bar's do: nothing on this bench is ever dead.
  const can = (a: LeadReviewAct) => (a === "check_again" ? review.canCheckAgain : true);
  const press = (a: LeadReviewAct) =>
    a === "check_again" ? review.onCheckAgain(ids) : a === "keep" ? review.onKeep(ids) : review.onExclude(ids);
  return (
    <div className="ld-bench" data-testid="lead-bench">
      {benchQueue(groups, g, onGroup)}

      <div className="ld-bench-main">
        <div className="ld-bench-head">
          <h3 className="ld-bench-t" data-testid="bench-title">
            {g.label}
            <span className="count">{ids.length}</span>
          </h3>
          <p className="ld-bench-why" data-testid="bench-why">
            {LEAD_REVIEW_GROUP_WHY[g.id]}
          </p>
          <div className="ld-bench-acts" data-testid="bench-acts">
            {g.acts.filter(can).map((a) => (
              <button
                key={a}
                type="button"
                className={`btn btn-sm${a === "keep" ? " btn-primary" : ""}`}
                onClick={() => press(a)}
                data-testid={`bench-act-${a}`}
                {...(x.canFind ? {} : gate("find", "work these leads"))}
              >
                {words[a] || a} {ids.length}
              </button>
            ))}
          </div>
        </div>
        <div className="ld-bench-cards">{cards.map((l) => benchCard(l, x))}</div>
      </div>

      {benchSide(costs, asked, nearby, onNearby)}
    </div>
  );
};
