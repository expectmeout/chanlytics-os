/**
 * The page's foot (Today in three zones, 2 Nov 2026): the week in one line with its door to Reports, and the lists this
 * member pinned (decision 0009), each its count and the page it opens. On a desk they are one strip under the zones; on a
 * phone the week stands in Today so far under the day's four figures, the pins under it, and the page says it is done.
 * The week is contracts' (todayPeriodLine over Reports' headline, one small read); the pins' counts are People's lists'
 * (lists/actions.ts), read as Today's page loads.
 */
import { LIST_GROUP_WORDS, TODAY_PHONE_WORDS as P } from "@chanlytics/contracts";
import type { PeopleListsLike } from "../leaks";
import { codeOnce } from "@/lib/code-once";
import { useCode } from "@/lib/use-code";
import { Button } from "../../kit/button/button";
import { FailedRead } from "../../kit/empty/empty";
import { Icon } from "../../kit/icon/icon";
import { SAYS_WHEN } from "../../kit/says-when";
import { routeDoor } from "../../frame-verbs";
import { surfaceValue } from "../../surface-values";
import { useSurface, useSurfaceFailed } from "../../use-surface";
import { TODAY_HELPERS } from "../helpers";
import { borrowed, useMoved } from "../shell";
import { TodayFigures } from "./figures";

/** People's lists' code: asked for once, as Today's page loads; a fetch that failed is asked for again as the pins draw. */
const listsCode = codeOnce(() => import("../../people/people-lists"));

// Asked for as Today's page loads, so the pins draw with it; a failure is asked for again as they draw.
void listsCode().then(
  () => undefined,
  () => undefined,
);

/** The lists this member pinned, each its count (a dash where People can't count it) and its page; none while unread. */
function usePins() {
  useMoved(["people", "today_pins"]);
  const lists = useCode(listsCode, true).loaded;
  const people = borrowed<PeopleListsLike>("__PEOPLE");
  return people && lists ? lists.lists.pinned() : [];
}

/** The pins, each a door with its count, in the kit's quiet capsule. Called, not drawn. */
function pinDoors(pins: ReturnType<typeof usePins>) {
  return pins.map((p) => (
    <Button
      key={p.token}
      variant="secondary"
      size="sm"
      className="tz-pin"
      {...routeDoor(p.to)}
      aria-label={`Open ${p.label} on People`}
      data-testid="today-pin"
    >
      <b className="tabular">{p.count ?? "–"}</b>
      {p.label}
    </Button>
  ));
}

/**
 * The week in one line, with the one door to Reports (contracts todayPeriodLine over Reports' headline). Not read yet is
 * not failed: it is silent while Reports loads, and says so where its read failed.
 */
function WeekLine() {
  const headline = useSurface("reports_headline");
  const failed = useSurfaceFailed("reports_headline");
  const period = headline ? TODAY_HELPERS.periodLine(headline) : null;
  if (period)
    return (
      <a className="tz-week" {...routeDoor(period.to)} data-testid="today-period">
        <span {...SAYS_WHEN}>{period.text}</span>
        <Icon name="chevron" size={11} />
      </a>
    );
  return failed ? (
    <FailedRead
      kind="line"
      what="Reports"
      body="The day's own numbers are current."
      surface="reports_headline"
      testid="today-period-failed"
    />
  ) : null;
}

/**
 * The desk's foot: the week and the pinned lists, one strip under the zones; a week whose read failed says so there.
 * Nothing where neither has anything.
 */
export function DeskFoot() {
  const pins = usePins();
  const headline = useSurface("reports_headline");
  const failed = useSurfaceFailed("reports_headline");
  if (!headline && !failed && !pins.length) return null;
  return (
    <section className="tz-pane tz-strip" data-testid="today-foot" aria-label={LIST_GROUP_WORDS.pinned}>
      <WeekLine />
      {pins.length ? <span className="tz-pins">{pinDoors(pins)}</span> : null}
    </section>
  );
}

/** Today so far on a phone: the day's four figures, each with its receipt, and the week under them. */
export function PhoneSoFar() {
  return (
    <section className="tz-pane tz-sofar" data-testid="today-card" aria-labelledby="today-sofar-title">
      <div className="tz-sec">
        <h2 className="tz-sec-title" id="today-sofar-title">
          {P.soFar}
        </h2>
      </div>
      <TodayFigures className="tz-sofar-figs" />
      <WeekLine />
    </section>
  );
}

/**
 * Whether nothing at all was counted today: every figure read, and zero, and no message for the answered to be "of". A
 * count that could not be read is no zero, and keeps its dash in the row.
 */
export function useNothingSoFar(): boolean {
  useMoved(["today"]);
  const figures = surfaceValue("today")?.figures ?? null;
  return !!figures?.length && figures.every((f) => f.value === 0 && !f.of);
}

/** Today so far on a day nothing was counted: one line, and the week under it, at the foot of the day's card. */
export function PhoneNothingYet() {
  return (
    <div className="tz-nothing" data-testid="today-sofar-none">
      <b {...SAYS_WHEN}>{P.soFarNothing}</b>
      <WeekLine />
    </div>
  );
}

/** The pinned lists on a phone, under Today so far; nothing with none pinned. */
export function PhonePins() {
  const pins = usePins();
  return pins.length ? (
    <div className="tz-pins tz-pinsbox" data-testid="today-pins">
      {pinDoors(pins)}
    </div>
  ) : null;
}

/** The page says it is done: on a phone the last thing above the tab bar. */
export function TodayEnd() {
  return (
    <p className="tz-end" data-testid="today-end" {...SAYS_WHEN}>
      <Icon name="check" size={13} />
      {P.end}
    </p>
  );
}
