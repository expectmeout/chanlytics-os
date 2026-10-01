/**
 * The peek's head (moved from legacy/pages/leads-peek.jsx, decision 0015; D5): a photo band -- the listing's photo, or
 * the tile's initials on the kind's tint when there is none or it fails to load -- with Expand and Close over it; then the
 * identity: the name, the sub-line with today's hours, their own words, and where they are with the distance.
 */
import type { SyntheticEvent } from "react";
import { LEAD_WORDS as W } from "@chanlytics/contracts";
import type { LeadPeekVM } from "@chanlytics/contracts";
import { Icon } from "../../kit/icon/icon";
import { lookNow } from "../../kit/look/look";
import type { Deck } from "./types";

/** A photo that fails hides itself, and what is under it shows. */
const hideOnError = (e: SyntheticEvent<HTMLElement>) => {
  const t = e && e.currentTarget;
  if (t && t.style) t.style.display = "none";
};

interface HeadProps {
  vm: LeadPeekVM;
  onClose: () => void;
  onExpand: () => void;
  deck?: Deck | null;
}

/** The band: the photo, the mark over it, Expand and Close, and on a phone the deck's place and its two ways through. */
function peekBand({ vm, onClose, onExpand, deck }: HeadProps) {
  return (
    <div className={`pk-band tint-${vm.tile.tint}`} data-testid="peek-photo-band">
      <span className="pk-band-initials" aria-hidden="true">
        {vm.tile.initials}
      </span>
      {/* The photo is there as the peek opens. The row's own tile -- the same photo, already in the browser from
            the list -- is drawn at once, softened, and the band's size fades in over it when it lands. It was lazy,
            which a browser defers until it has laid the page out and looked: measured on production, 23 Sep, the
            peek drew at 37ms and asked for its photo at 1000ms, so the initials stood there first. Now eager and
            first in line (fetchpriority), and the rows ask for it before a press (leadPhotoWarm). Each photo is its
            lead's own element (the key): walking the pile kept the one image and drew the last lead's photo under the
            new name until its own arrived, and a photo that failed hid the band's for every lead after it. One that
            fails now hides itself, and what is under it shows. */}
      {vm.tile.image ? (
        <img
          key={vm.tile.image}
          className="pk-band-thumb"
          src={vm.tile.image}
          alt=""
          aria-hidden="true"
          decoding="async"
          onError={hideOnError}
        />
      ) : null}
      {/* The photograph is the band and the mark rides it as a chip in the top-left corner; with no photograph the
            chip sits in the middle of the tint (leads.css). The row does the opposite, where a small square is the
            logo's size and not a storefront's. The two are stacked rather than chosen, so a mark that fails to load
            takes only its own chip away (D6). Eager, as the photo is: it is a few kilobytes from our own storage. */}
      {vm.tile.band ? (
        <img
          key={vm.tile.band}
          className="pk-band-photo"
          src={vm.tile.band}
          alt=""
          loading="eager"
          fetchPriority="high"
          decoding="async"
          data-testid="peek-photo"
          onLoad={(e) => {
            const t = e && e.currentTarget;
            if (t && t.classList) t.classList.add("in");
          }}
          onError={hideOnError}
        />
      ) : null}
      {vm.tile.logo ? (
        <img
          key={vm.tile.logo}
          className={`pk-band-mark${vm.tile.band ? " on-photo" : ""}`}
          src={vm.tile.logo}
          alt=""
          decoding="async"
          data-testid="peek-mark"
          onError={hideOnError}
        />
      ) : null}
      {/* On a phone Expand is its mark alone (leads.css): the words are its name for a screen reader. */}
      <button
        type="button"
        className="pk-band-expand"
        aria-label={W.expand}
        data-testid="peek-expand"
        onClick={onExpand}
      >
        <Icon name="external" size={11} />
        <span className="pk-band-expand-words">{W.expand}</span>
      </button>
      <button
        type="button"
        className="pk-x pk-band-x"
        id="lead-peek-close"
        aria-label={W.close}
        data-testid="peek-close"
        onClick={onClose}
      >
        <Icon name="x" size={16} />
      </button>
      {/* One lead at a time (D5), on a phone: where you are in the pile, and the two ways through it. A swipe does
            the same, and both move the page's own cursor, so the rows behind the peek move with it. It sits on the
            photo's bottom edge: a row of its own under it was 57px of a phone's 844, for three short words. */}
      {deck ? (
        <div className="pk-deck" data-testid="peek-deck">
          <button
            type="button"
            className="pk-deck-btn prev"
            aria-label={W.deckPrev}
            data-testid="peek-deck-prev"
            disabled={deck.at <= 1}
            onClick={deck.onPrev}
          >
            <Icon name="chevron" size={13} />
          </button>
          <span className="pk-deck-n" data-testid="peek-deck-at">
            {W.deckOf(deck.at, deck.of)}
          </span>
          <button
            type="button"
            className="pk-deck-btn"
            aria-label={W.deckNext}
            data-testid="peek-deck-next"
            disabled={deck.at >= deck.of}
            onClick={deck.onNext}
          >
            <Icon name="chevron" size={13} />
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** Who they are: the name, the sub-line with today's hours, what people say, their own words, and where they are. */
function peekIdentity(vm: LeadPeekVM) {
  return (
    <div className="pk-identity" data-testid="peek-identity">
      <h2 className="pk-name" data-testid="peek-name">
        {vm.name}
      </h2>
      <div className="pk-sub-line">
        <span className="pk-sub" data-testid="peek-sub">
          {vm.sub}
        </span>
        {vm.today ? (
          <span className={`pk-today${/^Open\b/.test(vm.today) ? "" : " closed"}`} data-testid="peek-today">
            <Icon name="clock" size={11} />
            {vm.today}
          </span>
        ) : null}
      </div>
      {/* What people say, as a line under who they are (D8). It was a card of its own, headed, for one number. */}
      {vm.rated ? (
        <div className="pk-rate" data-testid="peek-rated">
          <Icon name="star" size={11} />
          <span className="pk-rate-score">{vm.rated.score}</span>
          <span>{`${vm.rated.count} reviews`}</span>
          {vm.rated.low ? (
            <span className="pk-rate-low" data-testid="peek-rated-low">
              {vm.rated.low}
            </span>
          ) : null}
          {vm.claimedNote ? <span data-testid="peek-claimed">{vm.claimedNote}</span> : null}
        </div>
      ) : null}
      {/* Glass (canvas L2): how the ratings fall, five stars first, each bar its share. One svg a row, its own geometry. */}
      {lookNow() === "glass" && vm.rated?.spread?.length ? (
        <div className="pk-spread" data-testid="peek-spread">
          {vm.rated.spread.map((s) => (
            <div key={s.stars} className="pk-spread-row" data-testid="peek-spread-row">
              <span className="pk-spread-n tabular">{s.stars}</span>
              <svg className="pk-spread-track" viewBox="0 0 100 6" preserveAspectRatio="none" aria-hidden="true">
                <rect className="pk-spread-bar" x="0" y="0" width={s.pct} height="6" rx="3" />
              </svg>
              <span className="pk-spread-pct tabular">{`${s.pct}%`}</span>
            </div>
          ))}
        </div>
      ) : null}
      {vm.about ? (
        <p className="pk-about" data-testid="peek-about">
          {vm.about}
        </p>
      ) : null}
      {vm.where ? (
        <div className="pk-where" data-testid="peek-where-block">
          {vm.where.href ? (
            <a
              className="pk-where-link"
              href={vm.where.href}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="peek-where"
            >
              <Icon name="pin" size={12} />
              {vm.where.line}
            </a>
          ) : (
            <span data-testid="peek-where">
              <Icon name="pin" size={12} />
              {vm.where.line}
            </span>
          )}
          {vm.distance ? (
            <span className="pk-distance" data-testid="peek-distance">
              {vm.distance}
            </span>
          ) : null}
        </div>
      ) : null}
      {!vm.rated && vm.claimedNote ? (
        <div className="pk-where">
          <span className="pk-quiet" data-testid="peek-claimed">
            <Icon name="info" size={12} />
            {vm.claimedNote}
          </span>
        </div>
      ) : null}
    </div>
  );
}

export const LeadPeekHead = ({ vm, onClose, onExpand, deck }: HeadProps) => (
  <>
    {peekBand({ vm, onClose, onExpand, deck })}
    {peekIdentity(vm)}
  </>
);
