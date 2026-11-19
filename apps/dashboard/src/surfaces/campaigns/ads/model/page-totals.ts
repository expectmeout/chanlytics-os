/**
 * What the Ads page adds up over its window (page-only): every ad's spend by its currency, the people Chanlytics can
 * count, and the cost for each person who booked, which is contracts' one rule (adCostRule) over the days the figure
 * holds. Apart from page-parts.ts only for the file limit. Pure, like the rest of the models.
 */
import { adCostRule } from "@chanlytics/contracts";
import type { AdDoor, AdsRead } from "@chanlytics/contracts";

import { sumsOf } from "./money";
import type { MoneyItem } from "./money";
import { counted, sum, totalsOf } from "./vm-base";

/** What the page adds up over the window, from the same rows every ad's own numbers come from. */
export interface PageTotals {
  /** What each ad spent, in its currency: summed by currency, never converted. */
  spent: MoneyItem[];
  /** Ads that have spent anything. */
  spentAds: number;
  /** People Chanlytics can count: calls are left out. */
  touch: number;
  wrote: number;
  left: number;
  booked: number;
  /** What the ads whose people Chanlytics counts spent: the cost for each person divides this. */
  eachSpend: MoneyItem[];
  /** The cost for each person who booked, where the counted ads share one currency and enough booked; else null. */
  each: MoneyItem | null;
  /** Whether that cost is said "so far": a day still settling is in it (contracts adCostRule). */
  eachSoFar: boolean;
}

/** An amount divided among `n`, where the amounts are in one currency; null where they are in several or `n` is nothing. */
function perHead(items: readonly MoneyItem[], n: number, enough: (n: number) => boolean): MoneyItem | null {
  const sums = sumsOf(items);
  const one = sums.length === 1 ? sums[0] : undefined;
  if (!one || n <= 0 || !enough(n)) return null;
  return { minor: one.minor / n, currency: one.currency };
}

export function pageTotals(read: AdsRead): PageTotals {
  const rows = read.ads.map((ad) => ({ ad, t: totalsOf(ad, read) }));
  const mine = rows.filter((r) => counted(r.ad));
  const byDoor = (door: AdDoor) => sum(mine.filter((r) => r.ad.door === door).map((r) => r.t.inTouch));
  const booked = sum(mine.map((r) => r.t.booked));
  const eachSpend = mine.map((r) => ({ minor: r.t.spentMinor, currency: r.ad.currency }));
  const { from, to } = read.window;
  const cost = adCostRule({
    spentMinor: sum(eachSpend.map((i) => i.minor)),
    booked,
    days: mine.flatMap((r) => r.ad.days.filter((d) => d.day >= from && d.day <= to).map((d) => d.day)),
    today: read.today,
  });
  const each = cost.eachMinor === null ? null : perHead(eachSpend, booked, () => true);
  return {
    spent: rows.map((r) => ({ minor: r.t.spentMinor, currency: r.ad.currency })),
    spentAds: rows.filter((r) => r.t.spentMinor > 0).length,
    touch: sum(mine.map((r) => r.t.inTouch)),
    wrote: byDoor("whatsapp"),
    left: byDoor("form"),
    booked,
    eachSpend,
    each,
    eachSoFar: each !== null && cost.soFar,
  };
}

/** The cost for each person in touch, where no calendar says who booked: the same spend over the people counted. */
export const eachInTouch = (pageTotals: PageTotals): MoneyItem | null =>
  perHead(pageTotals.eachSpend, pageTotals.touch, () => true);
