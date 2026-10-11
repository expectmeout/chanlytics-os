/**
 * The People lens's book as it stands now (not the days Reports shows), from its own read: how fresh it is, with the door to the
 * people who have been quiet; what is stuck now (steps past their day, email that no longer arrives); and where the book stands
 * (the people on each of People's lists). Every row, line and sentence is the fold's (contracts `toPeopleReportVM`, page-only).
 */
import type { PeopleReportVM } from "@chanlytics/contracts/report-lens";
import { LinkButton } from "../../kit/link-button/link-button";
import { routeDoor } from "../../legacy-verbs";
import { RptStrip } from "../blocks";
import { mixCard } from "./shared";

/**
 * How long since each person last wrote or called, in time order, every bucket kept (a bucket of none is a true count). At its
 * foot, where anyone has been quiet for more than 30 days, how many and the door to People's own list of them.
 */
export function freshCard(v: PeopleReportVM, className: string) {
  const { quiet } = v.fresh;
  return mixCard(v.fresh, {
    title: "How fresh your book is",
    testid: "chart-people-fresh",
    className,
    columns: ["Since they last wrote or called", "People"],
    foot: quiet && (
      <p className="rpt-door-line" data-testid="people-quiet-door">
        {quiet.line} <LinkButton {...routeDoor(quiet.door)}>{quiet.label}</LinkButton>
      </p>
    ),
  });
}

/**
 * What is stuck now, three across: the steps past their day in amber and the steps due today (each a door to People's Steps due
 * list), and the email that stopped working in red. A number wears its tone only above zero (the fold sets it, the kit draws it).
 */
export function stuckStrip(v: PeopleReportVM) {
  return <RptStrip tiles={v.stuck} className="trio" testid="people-stuck" />;
}

/** Where the book stands, four across: the people on each of People's lists, a door to each, greyed when the book is under five people. */
export function standStrip(v: PeopleReportVM) {
  return <RptStrip tiles={v.stand} className="quad" testid="people-stand" />;
}
