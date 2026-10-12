/**
 * Reports' Ads, in a demo session (MOCKUP): the Ads fixtures folded over the days Reports shows. This is the demo seam: the one
 * place Reports reads the Ads page's sample (campaigns/ads/examples.ts, its `running` example), because a workspace's ad
 * accounts are not read yet; the wiring lane (decision 0049) replaces `adsDemoFold` with the fold of a real read
 * (`GET reports/ads`) and nothing else here survives. Loaded only in a demo (lenses/ads-load.ts imports it on demand), so no real
 * workspace's Reports pays for the fixtures, the Ads models or the words.
 *
 * The fixtures are dated for 11 Oct 2026; they are moved to the business's today so the lens has ads to show on any day the demo
 * is opened. Ads end yesterday (a platform has no today yet), so a period that ends today is read the same number of days, ending
 * yesterday; days a member picked are read as picked.
 */
import { ADS_ROUTE, addDays, daysBetween } from "@chanlytics/contracts";
import type { AdsRead, AdsScope, ReportFactVM, ReportRange } from "@chanlytics/contracts";
import { RESULTS, adsFactOf, adsResultsOf } from "@chanlytics/contracts/ads-page";
import type { AdsResultsVM } from "@chanlytics/contracts/ads-page";
import { reportWindowOf } from "@chanlytics/contracts/report-window";
import { EXAMPLE_READS } from "../campaigns/ads/examples";
import { CONFIG } from "../campaigns/ads/sample";

/** The sample read with every day moved by the same number of days, so its today is `today`. */
function movedTo(read: AdsRead, today: string): AdsRead {
  const by = daysBetween(read.today, today);
  if (by === 0) return read;
  const day = (iso: string): string => addDays(iso, by);
  return {
    ...read,
    today,
    window: { from: day(read.window.from), to: day(read.window.to) },
    ads: read.ads.map((ad) => ({
      ...ad,
      startDay: day(ad.startDay),
      endDay: day(ad.endDay),
      approvedDay: ad.approvedDay === null ? null : day(ad.approvedDay),
      days: ad.days.map((d) => ({ ...d, day: day(d.day) })),
    })),
    people: read.people.map((p) => ({ ...p, day: day(p.day) })),
  };
}

/** The Ads results over the days Reports shows (`range`, at the business's `today`), narrowed to a scope. */
export function adsDemoFold(range: ReportRange, scope: AdsScope, today: string): AdsResultsVM {
  const win = reportWindowOf(range, today);
  const days = win.live ? { from: addDays(win.from, -1), to: addDays(win.to, -1) } : { from: win.from, to: win.to };
  return adsResultsOf(movedTo(EXAMPLE_READS.running(), today), CONFIG, { ...days, scope });
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
