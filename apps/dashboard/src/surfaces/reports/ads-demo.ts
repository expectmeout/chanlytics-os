/**
 * Reports' Ads, drawn from the sample (MOCKUP): the Ads fixtures folded over the days Reports shows. This is the seam: the one
 * place Reports reads the Ads page's sample (campaigns/ads/examples.ts, its `running` example), because a workspace's ad
 * accounts are not read yet; the wiring lane (decision 0049) replaces `adsDemoFold` with the fold of a real read
 * (`GET reports/ads`) and nothing else here survives. Loaded only where the lens is drawn (lenses/ads-load.ts imports it on demand),
 * so no other workspace's Reports pays for the fixtures, the Ads models or the words.
 *
 * The sample reads as of `now`, as the Ads page's does (`exampleAt`), so an ad says the same days on both. Ads end yesterday (a
 * platform has no today yet), so a period that ends today is read the same number of days, ending yesterday; days a member picked
 * are read as picked.
 */
import { ADS_ROUTE, addDays } from "@chanlytics/contracts";
import type { AdsScope, ReportFactVM, ReportRange } from "@chanlytics/contracts";
import { RESULTS, adsFactOf, adsResultsOf } from "@chanlytics/contracts/ads-page";
import type { AdsResultsVM } from "@chanlytics/contracts/ads-page";
import { reportWindowOf } from "@chanlytics/contracts/report-window";
import { exampleAt } from "../campaigns/ads/examples";
import { CONFIG } from "../campaigns/ads/sample";

/** The Ads results over the days Reports shows (`range`, at the business's `today`), narrowed to a scope. */
export function adsDemoFold(range: ReportRange, scope: AdsScope, today: string, now: number): AdsResultsVM {
  const win = reportWindowOf(range, today);
  const days = win.live ? { from: addDays(win.from, -1), to: addDays(win.to, -1) } : { from: win.from, to: win.to };
  return adsResultsOf(exampleAt("running", now), CONFIG, { ...days, scope });
}

/** The one Worth-knowing fact the Overview makes of them, with its door to Ads; null where the ads brought and spent nothing. */
export function adsDemoFact(vm: AdsResultsVM): ReportFactVM | null {
  const said = adsFactOf(vm);
  if (!said) return null;
  return {
    id: "ads",
    tone: "",
    icon: "users",
    text: said.text,
    sub: said.sub,
    door: { label: RESULTS.fact.door, to: ADS_ROUTE },
  };
}
