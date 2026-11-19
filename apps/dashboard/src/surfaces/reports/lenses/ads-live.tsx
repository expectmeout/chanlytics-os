/**
 * Reports › Ads in its first form, for a workspace whose ad account is or was connected (decision 0049, call 13 and
 * step P1; the Ads plan's 4.10): the Ads page's own numbers as figures and a table, over the same thirty days and the
 * same people. It draws what Chanlytics counts (who wrote to AI from each ad, who of them booked) and, in a column of
 * its own and named as Meta's, what Meta says each ad spent. Nothing is added across the two. Fetched on demand
 * (ads-load.ts): no other lens pays for it. Every sentence is the page's model's (campaigns/ads/live/model.ts).
 */
import { ADS_ROUTE, ADS_WORDS } from "@chanlytics/contracts";
import type { AdsLiveDto } from "@chanlytics/contracts";
import { lensModel } from "../../campaigns/ads/live/model";
import { LENS } from "../../campaigns/ads/live/words";
import { Icon } from "../../kit/icon/icon";
import { LinkButton } from "../../kit/link-button/link-button";
import { Panel } from "../../kit/panel/panel";
import { routeDoor } from "../../frame-verbs";
import { RptSection } from "../blocks";

const saidOf = (dto: AdsLiveDto) => ({ timezone: dto.account.timezone ?? "UTC" });

/** The lens's head: the page's own sentence. */
export const adsLiveHead = (dto: AdsLiveDto): string => lensModel(dto, saidOf(dto)).head;

export function AdsLiveLens({ dto }: { dto: AdsLiveDto }) {
  const vm = lensModel(dto, saidOf(dto));
  const H = LENS.heads;
  return (
    <RptSection title={ADS_WORDS.adsTab} bare testid="ads-lens-live">
      <p className="rpt-ads-pane" data-testid="ads-lens-window">
        {LENS.window}
      </p>
      <Panel as="section" className="rpt-ads-live" aria-label={ADS_WORDS.adsTab}>
        <dl className="ads-conn-facts" data-testid="ads-lens-figures">
          {vm.figures.map((figure) => (
            <div key={figure.label}>
              <dt>{figure.label}</dt>
              <dd className="tabular">{figure.value}</dd>
            </div>
          ))}
        </dl>
      </Panel>
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
