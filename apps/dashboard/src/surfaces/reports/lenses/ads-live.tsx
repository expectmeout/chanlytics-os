/**
 * Reports › Ads (decision 0049, call 13 and step P1; the Ads plan's 4.10): for a workspace whose ad account is or was
 * connected, the Ads page's own numbers as figures and a table, over the same thirty days and the same people; with
 * none connected, or a read that failed, one card that says so, with the door to the page. It draws what Chanlytics counts (who wrote to AI from each ad, who of them booked) and, in a column of
 * its own and named as Meta's, what Meta says each ad spent. Nothing is added across the two. Fetched on demand
 * (ads-load.ts): no other lens pays for it. Every sentence is the page's model's (campaigns/ads/live/model.ts).
 */
import { ADS_ROUTE, ADS_WORDS } from "@chanlytics/contracts";
import type { AdsLiveDto } from "@chanlytics/contracts";
import { lensModel } from "../../campaigns/ads/live/model";
import { LENS } from "../../campaigns/ads/live/words";
import { WorthLine } from "../../campaigns/ads/live/worth-line";
import { EmptyState } from "../../kit/empty/empty";
import { Figure } from "../../kit/figure/figure";
import { Icon } from "../../kit/icon/icon";
import { LinkButton } from "../../kit/link-button/link-button";
import { routeDoor } from "../../frame-verbs";
import { visitWordHere } from "../../workspace-word";
import { RptSection } from "../blocks";

const saidOf = (dto: AdsLiveDto) => ({
  timezone: dto.account.timezone ?? "UTC",
  nowMs: Date.now(),
  word: visitWordHere(),
});

/** The lens's head: the page's own sentence. */
export const adsLiveHead = (dto: AdsLiveDto): string => lensModel(dto, saidOf(dto)).head;

/** No account to report on, or a read that failed: one card, and the page it is mended on. */
function AdsLensNone({ failed }: { failed: boolean }) {
  const words = failed ? LENS.notRead : LENS.none;
  return (
    <RptSection title={ADS_WORDS.adsTab} bare testid="ads-lens-live">
      <EmptyState
        kind="card"
        glyph="wave"
        title={words.title}
        body={words.body}
        testid="ads-lens-none"
        action={{ label: LENS.open, to: ADS_ROUTE }}
      />
    </RptSection>
  );
}

export function AdsLiveLens({ dto, failed }: { dto: AdsLiveDto | null; failed: boolean }) {
  if (dto === null) return <AdsLensNone failed={failed} />;
  const vm = lensModel(dto, saidOf(dto));
  const H = LENS.heads;
  return (
    <RptSection title={ADS_WORDS.adsTab} bare testid="ads-lens-live">
      <p className="rpt-ads-pane" data-testid="ads-lens-window">
        {LENS.window}
      </p>
      {/* The strip every lens draws (RptStrip in blocks.tsx): the kit's figure in a list of terms, four across. */}
      <dl className="rpt-figures quad" data-testid="ads-lens-figures" aria-label={ADS_WORDS.adsTab}>
        {vm.figures.map((figure) => (
          <Figure key={figure.label} className="rpt-cell" label={figure.label} value={figure.value} />
        ))}
      </dl>
      {/* Who an ad brought back: a line of its own, never in the figures above (the tracking plan's T3). */}
      {vm.back ? (
        <p className="rpt-ads-pane" data-testid="ads-lens-back">
          {vm.back}
        </p>
      ) : null}
      {/* What the bookings are worth beside what the ads spent: a line of its own too (the tracking plan's T6). */}
      <WorthLine worth={vm.worth} className="rpt-ads-pane" testid="ads-lens-worth" />
      {vm.rows.length > 0 ? (
        <div className="ck-table-wrap">
          <table className="ck-table ads-res-table" data-testid="ads-lens-table">
            <thead>
              <tr>
                <th>{H.ad}</th>
                <th className="num">{H.came}</th>
                <th className="num">{H.booked}</th>
                <th className="num">{H.each}</th>
                <th className="num">{H.spent}</th>
              </tr>
            </thead>
            <tbody>
              {vm.rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.name}</td>
                  <td className="num tabular">{row.came}</td>
                  <td className="num tabular">{row.booked}</td>
                  <td className="num tabular">{row.each}</td>
                  <td className="num tabular">{row.spent}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {vm.notes.map((note) => (
        <p key={note} className="rpt-ads-pane">
          {note}
        </p>
      ))}
      <LinkButton {...routeDoor(ADS_ROUTE)} data-testid="ads-lens-open">
        {LENS.open} <Icon name="chevron" size={12} />
      </LinkButton>
    </RptSection>
  );
}
