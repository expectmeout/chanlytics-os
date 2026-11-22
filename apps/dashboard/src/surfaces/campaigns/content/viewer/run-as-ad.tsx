/**
 * "Run as an ad", under a made piece's acts (model/run-as-ad.ts says what, and why): where it may run, one quiet press
 * that opens New ad drafted around it, on Ads' own address; where it may not, why in one line with its one act. On the
 * glass over the picture on a phone, on the pane's own ground on a desk, as "I posted it" stands beside it (by-hand.tsx).
 */
import { ADS_ROUTE, newAdFromRoute } from "@chanlytics/contracts";
import { Button } from "../../../kit/button/button";
import { Icon } from "../../../kit/icon/icon";
import type { RunAsAdDoes, RunAsAdLine } from "../model/run-as-ad";

/** What the line's presses do: New ad on the piece, and its one act where it may not run. */
export type RunAsAdActs = Record<RunAsAdDoes, () => void> & { run: () => void };

/**
 * The acts over the piece's own (piece.tsx): New ad on Ads' address, drafted around this piece; AI asked about it, for
 * another picture; a picture post from a video; the Ads page, where an ad account is connected.
 */
export function runAsAdActsOf(
  fileId: string,
  go: (route: string) => void,
  piece: { ask: () => void; makePost: () => void },
): RunAsAdActs {
  return {
    run: () => go(newAdFromRoute("piece", fileId)),
    ask: piece.ask,
    post: piece.makePost,
    ads: () => go(ADS_ROUTE),
  };
}

export function RunAsAd({ line, acts, busy }: { line: RunAsAdLine | null; acts: RunAsAdActs; busy: boolean }) {
  if (!line) return null;
  if (line.is === "press")
    return (
      <div className="cnv-ad">
        <Button variant="quiet" size="sm" onClick={acts.run} disabled={busy} data-testid="cnv-ad-run">
          <Icon name="trending-up" size={13} />
          {line.words}
        </Button>
      </div>
    );
  return (
    <div className="cnv-ad" data-why={line.why.is === "wont" ? line.why.why : line.why.is} data-testid="cnv-ad">
      <span className="cnv-ad-said" data-testid="cnv-ad-said">
        {line.said}
      </span>
      <Button size="text" variant="quiet" onClick={acts[line.act.does]} disabled={busy} data-testid="cnv-ad-act">
        {line.act.words}
      </Button>
    </div>
  );
}
