/**
 * The Ads page's three tiles (MOCKUP; spec C2): Waiting on you (the people from ads whose conversation is on the owner, with
 * the days in amber), Coming (what ends or starts, and what can still be spent), and What came back (the bookings, in rows
 * that add up to the headline). Platform standing has no tile: its one home is the pane line. Flat blocks in the Messages
 * tiles' shape (.cmh-block, .cmh-coming-*); the phone draws Coming and What came back the same, and not the first (its row
 * is the list's "Needs you").
 */
import { adRoute } from "@chanlytics/contracts";
import { DASH } from "@chanlytics/contracts/ads-page";
import type { DoorVM, TilesVM } from "@chanlytics/contracts/ads-page";
import { Icon } from "../../kit/icon/icon";
import { LinkButton } from "../../kit/link-button/link-button";
import { ListRow } from "../../kit/list-row/list-row";
import { Panel } from "../../kit/panel/panel";
import { Tooltip } from "../../kit/tooltip/tooltip";
import { cx } from "../../kit/variants";
import { routeDoor } from "../../legacy-verbs";
import { cmRowPress } from "../parts/head";

interface OpenProps {
  /** Open an ad over the page, pushed so Back closes it. */
  onOpen: (route: string) => void;
}

/** A tile's head: its name and what it covers (the Messages tiles' shape, copied). */
function AdsBlockHead({ title, note }: { title: string; note?: string }) {
  return (
    <header className="cmh-block-head">
      <h2 className="cmh-h">{title}</h2>
      {note ? <span className="cmh-dim">{note}</span> : null}
    </header>
  );
}

/**
 * Waiting on you: a face, the name, which ad and since when, and the days in amber. The name is a real link to their
 * conversation where there is one, else to their page, and its tip says which. Nobody waiting says so.
 */
export function WaitingBlock({ tile }: { tile: TilesVM["waiting"] }) {
  return (
    <Panel as="section" size="flush" className="cmh-block" aria-label={tile.title} data-testid="ads-waiting">
      <AdsBlockHead title={tile.title} />
      {tile.rows.length > 0 ? (
        <ul className="ads-waiting">
          {tile.rows.map((r) => (
            <li key={r.personId} className="ads-waiting-row" data-testid="ads-waiting-row">
              <ListRow
                face={{ initials: r.initials, size: "sm" }}
                name={
                  <Tooltip tip={r.tip}>
                    <LinkButton
                      {...routeDoor(r.open)}
                      size="inherit"
                      className="cmh-row-name"
                      aria-description={r.tip}
                      data-row-open
                      data-testid="ads-waiting-door"
                    >
                      {r.name}
                    </LinkButton>
                  </Tooltip>
                }
                end={(place) => <span className={cx(place, "ads-since")}>{r.since}</span>}
                said={r.line}
                role="presentation"
                onClick={cmRowPress}
              />
            </li>
          ))}
        </ul>
      ) : (
        <p className="cmh-dim cmh-quiet" data-testid="ads-waiting-empty">
          {tile.empty}
        </p>
      )}
    </Panel>
  );
}

/** Coming: when each ad ends (or starts), what it says, what is left; the last line is what can still be spent in all. */
export function ComingBlock({ tile, onOpen }: OpenProps & { tile: TilesVM["coming"] }) {
  return (
    <Panel as="section" size="flush" className="cmh-block" aria-label={tile.title} data-testid="ads-coming">
      <AdsBlockHead title={tile.title} />
      <ul className="cmh-coming-list">
        {tile.rows.map((r) => (
          <li key={r.adId} className="cmh-coming-line" data-testid="ads-coming-line">
            <span className="cmh-when">
              {r.when.map((part) => (
                <span key={part}>{part}</span>
              ))}
            </span>
            <span className="cmh-what">
              <LinkButton className="cmh-what-name" {...routeDoor(adRoute(r.adId), onOpen)}>
                {r.name}
              </LinkButton>
              <span className="cmh-dim">{r.said ? `${r.said} · ${r.why}` : r.why}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="cmh-dim cmh-rules" data-testid="ads-coming-total">
        {tile.total}
        {tile.plus ? ` · ${tile.plus}` : ""}
      </p>
    </Panel>
  );
}

/**
 * What came back: "Booked 26", and the rows that add up to it. A phone says them in one line. Under them, in the dim ink,
 * the nudge to mark who came, and the appointments no person was found for. With no calendar link there is no number: a dash,
 * what is missing, and the door to where the link is added (`link`).
 */
export function CameBackBlock({
  tile,
  phone = false,
  link = null,
}: {
  tile: TilesVM["cameBack"];
  phone?: boolean;
  link?: DoorVM | null;
}) {
  return (
    <Panel as="section" size="flush" className="cmh-block ads-came" aria-label={tile.title} data-testid="ads-came">
      <AdsBlockHead title={tile.title} note={tile.window} />
      <p className="cmh-headline">
        <span>{tile.headline.label}</span>
        <span className="cmh-figure tabular">{tile.linked ? tile.headline.n : DASH}</span>
      </p>
      {phone ? (
        tile.line ? (
          <p className="ads-came-line" data-testid="ads-came-line">
            {tile.line}
          </p>
        ) : null
      ) : (
        <ul className="ads-sums">
          {tile.rows.map((r) => (
            <li key={r.id} data-testid={`ads-came-${r.id}`}>
              <span>
                {r.label}
                {r.note ? <span className="cmh-dim"> · {r.note}</span> : null}
              </span>
              <span className="ads-sum-v tabular">{r.n}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="cmh-dim ads-nudge">{tile.nudge}</p>
      {tile.unmatched ? <p className="cmh-dim ads-nudge">{tile.unmatched}</p> : null}
      {link ? (
        <LinkButton {...routeDoor(link.to)} className="ads-came-door" data-testid="ads-came-link">
          {link.words} <Icon name="chevron" size={11} />
        </LinkButton>
      ) : null}
    </Panel>
  );
}
