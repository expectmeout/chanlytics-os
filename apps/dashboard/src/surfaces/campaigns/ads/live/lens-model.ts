/**
 * Reports › Ads, as a model: the Ads page's own numbers (model.ts) said as Reports says them, as figures and a table over
 * the same thirty days, Chanlytics' count and Meta's spend each in columns of their own (decision 0049, call 3). Pure:
 * the read and the zone are handed in.
 */
import type { AdLiveDto, AdsLiveDto } from "@chanlytics/contracts";
import { moneyOf, ADS_DEFAULT_CURRENCY } from "../model/money";
import { counted, type LiveClock } from "./ai-line";
import { allBroughtOf, backLineOf, besideOf, eachOf, liveModel, shown, type FigureVM } from "./model";
import { LENS, LIVE, SHEET } from "./words";
import { worthOf, type WorthVM } from "./worth-model";

/**
 * Reports › Ads' notes: whose people are not counted, and the people no listed ad holds. The Ads page says the first in
 * the drawer of the ad it is about (sheetModel), where the drawer's foot also says what can be done with an ad made in
 * Meta, and only the second under its list, since those people are in its sentence's count.
 */
function notesOf(dto: AdsLiveDto, rows: readonly AdLiveDto[]): string[] {
  const uncounted = [...new Set(rows.filter((ad) => !counted(ad)).map((ad) => LIVE.opens[ad.opens]))];
  return [...uncounted.map((door) => LIVE.notCountedNote(door)), ...besideOf(dto)];
}

/** One ad as Reports › Ads lists it: Chanlytics' count, then Meta's spend, each a column of its own. */
interface LensRowVM {
  id: string;
  name: string;
  /** Who wrote to AI from it, and who of them booked; a dash where its people are not counted. */
  came: string;
  booked: string;
  each: string;
  /** Meta's number. */
  spent: string;
}

interface LensVM {
  head: string;
  figures: FigureVM[];
  /** Everyone an ad brought back, on a line of its own under the figures (T3); null for nobody. */
  back: string | null;
  /** What the counted ads' bookings are worth beside what those ads spent (T6); null with nothing to say. */
  worth: WorthVM | null;
  rows: LensRowVM[];
  notes: string[];
}

const DASH = "—";

/** Reports › Ads in its first form: the page's own numbers as figures and a table, over the same thirty days. */
export function lensModel(dto: AdsLiveDto, clock: LiveClock): LensVM {
  const currency = dto.account.currency ?? ADS_DEFAULT_CURRENCY;
  const page = liveModel(dto, clock);
  const { came, booked } = allBroughtOf(dto);
  const spent = dto.ads.reduce((sum, ad) => sum + ad.spend_minor, 0);
  const each = eachOf(dto.ads, dto, currency);
  const rows = shown(dto).map((ad): LensRowVM => {
    const one = eachOf([ad], dto, currency);
    return {
      id: ad.id,
      name: ad.name,
      came: counted(ad) ? String(ad.people) : DASH,
      booked: counted(ad) ? String(ad.booked) : DASH,
      each: one ? one.each : counted(ad) && ad.booked > 0 ? SHEET.only(ad.booked) : DASH,
      spent: moneyOf(ad.spend_minor, currency),
    };
  });
  // The people no listed ad holds, a row each: counted, with no spend of Meta's to set beside them.
  const beside = (id: string, name: string, one: { people: number; booked: number }): LensRowVM[] =>
    one.people > 0 ? [{ id, name, came: String(one.people), booked: String(one.booked), each: DASH, spent: DASH }] : [];
  const unnamed = [
    ...beside("unnamed", LENS.unnamed, dto.unnamed),
    ...beside("elsewhere", LENS.elsewhere, dto.elsewhere),
  ];
  return {
    head: `${page.head.strong ?? ""}${page.head.rest}`,
    figures: [
      { label: LENS.came, value: String(came) },
      { label: LENS.booked, value: String(booked) },
      {
        label: LENS.each,
        value: each ? `${each.each}${each.soFar ? " so far" : ""}` : booked > 0 ? SHEET.only(booked) : DASH,
      },
      { label: LENS.spent, value: moneyOf(spent, currency) },
    ],
    back: backLineOf(dto.back, "an ad"),
    worth: worthOf(dto.ads, dto, clock.word),
    rows: [...rows, ...unnamed],
    // The two quiet lines are rows of the table here, so they are not said twice.
    notes: [
      LENS.counted,
      ...notesOf(dto, shown(dto)).filter((note) => note !== LIVE.elsewhere(dto.elsewhere.people, dto.elsewhere.booked)),
    ],
  };
}
