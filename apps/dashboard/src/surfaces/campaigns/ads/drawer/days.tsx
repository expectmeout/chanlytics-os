/**
 * The bar a day (MOCKUP; Ruben, 11 Oct 2026, "Option B"): the last 30 days and today, one column each, 38px tall, no axis, no
 * grid. A bar is the people who first got in touch that day, in the door's own colour at soft strength (WhatsApp's, the
 * call's, none for a form); its filled inner part is those who have booked since. The days before the ad are a hairline,
 * the newest three are lighter (they are still counting), and today is a dashed outline. Spend is not a bar: it is the
 * sentence's amount and the facts row. It scrolls across on a phone, where a column is about 11px (data-own-drag, so a swipe
 * in it does not walk the strip). Its words are read from the same table: the aria-label is the days' own sums.
 */
import type { CSSProperties } from "react";
import type { AdDoor } from "@chanlytics/contracts";
import { DOOR, DRAWER } from "@chanlytics/contracts/ads-page";
import type { DayVM } from "@chanlytics/contracts/ads-page";

interface AdDaysProps {
  days: readonly DayVM[];
  /** The line under the bars: what a bar is, what its dark part is, what the lighter days are. */
  legend: string;
  door: AdDoor;
  /** What a screen reader hears; worked out from the days where not given. */
  aria?: string;
  /** Under today's outline: `so far today, 9:19 AM`. */
  todayNote?: string;
}

/** The days' own words: how many first got in touch over how many days, and how many have booked. */
function ariaOf(days: readonly DayVM[], door: AdDoor): string {
  const counted = days.filter((d) => !d.before && !d.today);
  const n = counted.reduce((all, d) => all + d.inTouch, 0);
  if (counted.length === 0) return DRAWER.bars.ariaNone;
  if (door === "call") return DRAWER.bars.ariaCalls({ n, days: counted.length });
  const booked = counted.reduce((all, d) => all + d.booked, 0);
  return DRAWER.bars.aria({ n, did: DOOR[door].did, days: counted.length, booked });
}

/** One column: its height and its filled share are the day's own data, as custom properties for the stylesheet. */
function AdDay({ day }: { day: DayVM }) {
  const bar = { "--h": day.h.toFixed(3), "--f": day.f.toFixed(3) } as CSSProperties;
  return (
    <span
      className="ads-day"
      style={bar}
      data-before={day.before ? "" : undefined}
      data-fresh={day.fresh ? "" : undefined}
      data-today={day.today ? "" : undefined}
      data-zero={day.inTouch === 0 ? "" : undefined}
    />
  );
}

export function AdDays({ days, legend, door, aria, todayNote }: AdDaysProps) {
  return (
    <div className="ads-days-wrap" data-testid="ads-days">
      <div className="ads-days-scroll" data-own-drag="">
        <div className="ads-days" role="img" aria-label={aria ?? ariaOf(days, door)} data-door={door}>
          {days.map((day) => (
            <AdDay key={day.day} day={day} />
          ))}
        </div>
      </div>
      <div className="ads-days-foot">
        <p className="ads-legend">{legend}</p>
        {todayNote ? <span className="ads-today">{todayNote}</span> : null}
      </div>
    </div>
  );
}
