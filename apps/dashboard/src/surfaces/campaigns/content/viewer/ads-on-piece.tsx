/**
 * The ads made from a piece, on the piece (the content loop's pass 6; the content canvas's Loop2, approved by Ruben on
 * 24 Nov 2026; the Ads plan's 6.8, join 8): under Where it goes, a line an ad in Ads' own words (contracts
 * pieceAdLineOf), opening the ad on Ads' address, as Run as an ad opens New ad there; and under What it brought, what each
 * ad brought apart from the post, with what a booking cost. A post's numbers and an ad's are never added together.
 */
import {
  PIECE_AD_WORDS,
  adRoute,
  pieceAdBroughtOf,
  pieceAdLineOf,
  type PieceAdDto,
  type PieceAdTone,
} from "@chanlytics/contracts";
import type { PieceStanding } from "../model/standing";
import { routeDoor } from "../../../frame-verbs";
import { Button } from "../../../kit/button/button";
import { Icon } from "../../../kit/icon/icon";
import type { GoesTone } from "../model/goes";
import { viewerClockOf } from "./clock";

/** An ad's tone, as a line of Where it goes is toned: setting up moves, running is fine, ended is gone, a problem is yours. */
const TONE: Readonly<Record<PieceAdTone, GoesTone>> = { moving: "", ok: "ok", gone: "gone", needs: "you" };

const OPEN_THE_AD = "Open the ad";

/**
 * The ads' lines under Where it goes, newest first; nothing where none was made from the piece. `piece`: where a post
 * of it was removed at its place, and the press that pauses an ad still running (the review of 24 Nov 2026, D3);
 * `onPaused` reads the ads again once that press answers.
 */
export function PieceAdLines({
  ads,
  piece,
  onPaused,
}: {
  ads: readonly PieceAdDto[] | undefined;
  piece: PieceStanding["ad"];
  onPaused: () => void;
}) {
  if (!ads || ads.length === 0) return null;
  const { zone } = viewerClockOf();
  return (
    <>
      {ads.map((ad) => {
        const line = pieceAdLineOf(ad, zone, piece.removedOn);
        return (
          <div className="cnv-goes-line" data-tone={TONE[line.tone] || undefined} key={ad.id} data-testid="cnv-goes-ad">
            <span className="cnv-goes-glyph" aria-hidden="true">
              <Icon name="bolt" size={15} />
            </span>
            <div className="cnv-goes-words">
              <b>{line.title}</b>
              <span className="cnv-goes-said" data-testid="cnv-goes-ad-said">
                <span className="cnv-goes-dot" data-moving={line.tone === "moving" || undefined} aria-hidden="true" />
                {line.said}
              </span>
              {line.note ? <p className="cnv-note">{line.note}</p> : null}
              {line.opens ? (
                <span className="cnv-goes-acts">
                  {line.pause && piece.pause ? (
                    <Button
                      size="sm"
                      className="cnv-goes-act"
                      disabled={piece.busy}
                      onClick={() => void piece.pause?.(ad).then(onPaused)}
                      data-testid="cnv-goes-ad-pause"
                    >
                      {PIECE_AD_WORDS.pause}
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    className="cnv-goes-act"
                    {...routeDoor(adRoute(ad.id))}
                    data-testid="cnv-goes-ad-open"
                  >
                    {OPEN_THE_AD}
                  </Button>
                </span>
              ) : null}
            </div>
          </div>
        );
      })}
    </>
  );
}

/** What each ad brought, apart from the post: its head with what it spent, then its conversations and bookings. */
export function AdsBrought({ ads }: { ads: readonly PieceAdDto[] | undefined }) {
  if (!ads || ads.length === 0) return null;
  return (
    <>
      {ads.map((ad) => {
        const brought = pieceAdBroughtOf(ad);
        return (
          <div key={ad.id} data-testid="cnv-brought-ad">
            <p className="cnv-results-sub">{brought.head}</p>
            <p className="cnv-results-nums">{brought.line}</p>
          </div>
        );
      })}
    </>
  );
}
