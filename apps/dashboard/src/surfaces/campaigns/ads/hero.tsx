/**
 * The Ads page with nothing connected (the Ads plan's 4.1): it says only what the People report already reads, how new
 * people first reached the business, the "An ad" row in the ink and the rest in one quiet hue, beside the ad account's
 * card (connect/card.tsx). Nothing here draws a figure, a cost or a per-ad count Chanlytics cannot support.
 */
import type { ReactNode } from "react";
import { CARD } from "./connect/words";
import { V0 } from "./model/words-page";
import type { V0VM } from "./model/page-v0";
import { BarList } from "../../kit/charts/bar";
import { Icon } from "../../kit/icon/icon";
import { LinkButton } from "../../kit/link-button/link-button";
import { routeDoor } from "../../frame-verbs";
import type { FirstTouchHere } from "./first-touch";

/** The lead line: while the counts are read, or where they could not be; else its bold part and the rest, or the empty workspace's two lines. */
function V0Lead({ v0, touch }: { v0: V0VM; touch: FirstTouchHere }) {
  if (touch.state === "reading") {
    return (
      <p className="ads-hero-muted" data-testid="ads-v0-reading">
        {V0.reading}
      </p>
    );
  }
  if (touch.state === "failed") {
    return (
      <p className="ads-hero-muted" role="alert" data-testid="ads-v0-failed">
        {V0.notRead}{" "}
        <LinkButton onClick={touch.again} data-testid="ads-v0-again">
          {V0.again}
        </LinkButton>
      </p>
    );
  }
  if (v0.empty) {
    return (
      <>
        <p className="ads-hero-lead">{v0.empty.lead}</p>
        <p className="ads-hero-muted">{v0.empty.line}</p>
      </>
    );
  }
  return (
    <>
      {v0.lead ? (
        <p className="ads-hero-lead" data-testid="ads-v0-lead">
          <b>{v0.lead.strong}</b>
          {v0.lead.rest}
        </p>
      ) : null}
      {v0.ads ? (
        <p className="ads-hero-muted" data-testid="ads-v0-ads">
          {v0.ads}
        </p>
      ) : null}
      {v0.muted ? <p className="ads-hero-muted">{v0.muted}</p> : null}
    </>
  );
}

/**
 * Today, before any ad is read: the hero and its rows at the left; at the right the ad account's card (connect/card.tsx),
 * which says where the connection stands, and the quiet line for the platforms that come later.
 */
export function V0Page({ v0, touch, card }: { v0: V0VM; touch: FirstTouchHere; card: ReactNode }) {
  return (
    <div className="ads-hero" data-testid="ads-v0">
      <section className="ads-hero-main">
        <V0Lead v0={v0} touch={touch} />
        {v0.rows.length > 0 ? (
          <BarList
            rows={v0.rows.map((r) => ({
              id: r.label,
              label: r.label,
              value: r.n,
              color: r.own ? "var(--ink)" : "var(--line-strong)",
            }))}
          />
        ) : null}
        {v0.nobodyNew ? (
          <p className="ads-hero-muted" data-testid="ads-v0-nobody">
            {v0.nobodyNew}
          </p>
        ) : null}
        {v0.notes.map((note) => (
          <p key={note} className="ads-hero-note">
            {note}
          </p>
        ))}
        <LinkButton className="ads-hero-door" {...routeDoor(v0.door.to)} data-testid="ads-v0-door">
          {v0.door.words} <Icon name="chevron" size={12} />
        </LinkButton>
      </section>
      <section className="ads-hero-side">
        {card}
        <p className="ads-conn-later" data-testid="ads-later">
          {CARD.later}
        </p>
      </section>
    </div>
  );
}
