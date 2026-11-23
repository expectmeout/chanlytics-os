/**
 * What bookings are worth beside what was spent (the Ads tracking plan's T6), as a model: the one line an ad's drawer and
 * Reports › Ads say of it, worked out from the page's read and nothing else (model.ts hands it the ads). A module of
 * its own, beside the page's model, which it does not read.
 */
import { AD_DOORS_COUNTED, adWorthRule, appointmentWords } from "@chanlytics/contracts";
import type { AdLiveDto, AdsLiveDto, AppointmentWord } from "@chanlytics/contracts";
import { aboutMoneyOf, moneyOf, ADS_DEFAULT_CURRENCY } from "../model/money";
import { SHEET } from "./words";

/** What bookings are worth, as the drawer and Reports › Ads say it. */
export interface WorthVM {
  /** The sums beside the spend; null where no visit has an amount, which `leftOut` then says alone. */
  line: string | null;
  /** How many visits the sums leave out, their service having no amount; null for none, and under five booked. */
  leftOut: string | null;
  /** Where a service is given its amount, offered with `leftOut`. */
  door: string | null;
}

/** Settings › Business, on its services: where a service is given its amount. */
const SERVICES_ROUTE = "admin/workspace/services";

/**
 * What the visits the counted ads' people booked are worth, beside what those ads spent (contracts adWorthRule): each
 * currency's sum said in its own, the account's first, never added; a dash under five booked. Null where the read sums
 * none (a database a deploy behind), and where nobody has booked a visit, of which the figures already say none. What is
 * left out is said in the workspace's own word for a booking (`word`: an appointment where the page hands none).
 */
export function worthOf(ads: readonly AdLiveDto[], dto: AdsLiveDto, word: AppointmentWord | undefined): WorthVM | null {
  const currency = dto.account.currency ?? ADS_DEFAULT_CURRENCY;
  const mine = ads.flatMap((ad) => (AD_DOORS_COUNTED.includes(ad.opens) && ad.worth ? [{ ad, worth: ad.worth }] : []));
  const total = (pick: (one: (typeof mine)[number]) => number): number => mine.reduce((sum, one) => sum + pick(one), 0);
  const leftOut = total((one) => one.worth.left_out);
  if (total((one) => one.worth.visits) + leftOut === 0) return null;
  const spent = moneyOf(
    total((one) => one.ad.spend_minor),
    currency,
  );
  const rule = adWorthRule({
    booked: total((one) => one.ad.booked),
    sums: mine.flatMap((one) => one.worth.sums),
    days: mine.some((one) => one.ad.settling) ? [dto.window.to] : [],
    today: dto.today,
  });
  if (rule.sums === null)
    return { line: SHEET.worth({ booked: null, spent, soFar: false }), leftOut: null, door: null };
  const own = (sum: { currency: string }): number => (sum.currency === currency.toUpperCase() ? 0 : 1);
  const booked = [...rule.sums]
    .sort((one, other) => own(one) - own(other))
    .map((sum) => aboutMoneyOf(sum.minor, sum.currency));
  return {
    line: booked.length > 0 ? SHEET.worth({ booked, spent, soFar: rule.soFar }) : null,
    leftOut: leftOut > 0 ? SHEET.worthLeftOut(leftOut, appointmentWords(word ?? "appointment")) : null,
    door: leftOut > 0 ? SERVICES_ROUTE : null,
  };
}
