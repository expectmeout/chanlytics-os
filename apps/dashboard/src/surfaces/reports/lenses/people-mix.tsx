/**
 * The People lens's mix, from its own read: how the people who reached you did (by channel, in the colour kept for each), how the
 * new ones first came, how the yeses were won and the stops came, the steps the team finished and the email that stopped working
 * (the time between steps), and the ways the book reaches you by now. Every row, line and sentence is the fold's (contracts
 * `toPeopleReportVM`, page-only): a card draws a bar a row, the line under its title, and, for a part with nothing in it, the
 * fold's words for why, never a bar of nothing.
 */
import type { PeopleReportVM } from "@chanlytics/contracts/report-lens";
import { RPT_CHANNEL_COLORS } from "../series";
import { mixCard } from "./shared";

/** How they reached you: a person who reached you more than one way is counted in each, and a channel wears the one colour it wears everywhere. */
export function channelsCard(v: PeopleReportVM, className: string) {
  return mixCard(v.channels, {
    title: "Who reached you, by channel",
    testid: "chart-people-channels",
    className,
    columns: ["Channel", "People"],
    colors: RPT_CHANNEL_COLORS,
  });
}

/**
 * How the new people first came: the way in each was first kept under. Where the workspace has ads, its "An ad" row is the door to
 * Reports › Ads over the same days (`ads`: that press).
 */
export function firstCard(v: PeopleReportVM, className: string, ads: (() => void) | null = null) {
  return mixCard(v.firstCame, {
    title: "How they first came",
    testid: "chart-people-first",
    className,
    columns: ["How they first came", "New people"],
    ...(ads ? { door: { id: "ad", open: ads } } : {}),
  });
}

/** How the yeses of the period were won: who gave each, summed into the ways the words name. */
export function yesesCard(v: PeopleReportVM, className: string) {
  return mixCard(v.yeses, {
    title: "How the yeses were won",
    testid: "chart-people-yeses",
    className,
    columns: ["How it was won", "Yeses"],
  });
}

/** How the stops of the period came. */
export function stopsCard(v: PeopleReportVM, className: string) {
  return mixCard(v.stops, {
    title: "How the stops came",
    testid: "chart-people-stops",
    className,
    columns: ["How it came", "Stops"],
  });
}

/** The steps finished in the period: on or before their day, and after it (a share is said only of five steps or more). */
export function stepsCard(v: PeopleReportVM, className: string) {
  return mixCard(v.stepsDone, {
    title: "Steps you set",
    testid: "chart-people-steps",
    className,
    columns: ["When it was done", "Steps"],
  });
}

/** The addresses that stopped working in the period, by the first reason each was stopped for. */
export function bouncedCard(v: PeopleReportVM, className: string) {
  return mixCard(v.emailStopped, {
    title: "Email that stopped working",
    testid: "chart-people-bounced",
    className,
    columns: ["Why it stopped", "Addresses"],
  });
}

/** The ways the people in the book reach you by, as the book stands now (whatever period is picked). */
export function wiresCard(v: PeopleReportVM, className: string) {
  return mixCard(v.wires, {
    title: "Ways they reach you",
    testid: "chart-people-wires",
    className,
    columns: ["Ways they reach you", "People"],
  });
}
