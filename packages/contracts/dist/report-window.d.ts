/**
 * The periods Reports offers, said once. Three are a count of days; Month has none of its own: it is the days since the 1st in
 * the workspace's zone, today included (report-periods.ts), read against the same number of days before, as every period is.
 * `id` is what a request, the tab's storage and the control's choice call the period.
 */
declare const REPORT_RANGES: readonly [{
    readonly days: 7;
    readonly id: "7d";
    readonly label: "7 days";
}, {
    readonly days: 30;
    readonly id: "30d";
    readonly label: "30 days";
}, {
    readonly days: 90;
    readonly id: "90d";
    readonly label: "90 days";
}, {
    readonly days: null;
    readonly id: "month";
    readonly label: "Month";
}];

/** What a period is called in a request, the tab's storage and the control. */
type ReportPeriodId = (typeof REPORT_RANGES)[number]["id"];
/** A window of days a member picked on the calendar: its first day and its last, "YYYY-MM-DD", in the workspace's zone. */
interface ReportDays {
    from: string;
    to: string;
}
/** What a report is read over: one of the periods by name, or the days a member picked. */
type ReportRange = ReportPeriodId | ReportDays;

/**
 * The windows a member reaches in one press that are not a period ending today, at a business day: named here, and
 * worked out from that day, so "Last month" is always the month before the workspace's own. They are days like any a
 * member picks: nothing of them is kept or sent by name, and a yesterday someone shared is the day it was, not the day
 * before whoever opens it.
 */
declare function reportShortcuts(today: string): {
    id: string;
    label: string;
    days: ReportDays;
}[];
/** The days a range covers at a business day, and how the range's control says them. */
interface ReportWindowVM {
    /** The range itself: what a pick sends and the address keeps. */
    range: ReportRange;
    /** The period by name; null for days a member picked. */
    period: ReportPeriodId | null;
    /** The range's one name (reportRangeKey). */
    key: string;
    /** The first day and the last, "YYYY-MM-DD". */
    from: string;
    to: string;
    /** How many days, both included. */
    days: number;
    /** Whether it ends on the workspace's today. One that does names no day to the database, and is read as it always was. */
    live: boolean;
    /** The days in words: "Sep 7 – Oct 6", or the one day's "Oct 6". */
    dates: string;
    /** What it is, beside the days: "Last 30 days", "This month so far", "Last month", or the count, "20 days". */
    said: string;
    /** The control's own word, as short as it can be said: "30 days", "Month", "Yesterday", "Sep 1 – 20". */
    short: string;
    /** What stands beside the control where there is room, the half its word leaves out: the days of a period or a
     *  shortcut ("Sep 7 – Oct 6"), and for days said by their dates, how many they are ("20 days"). */
    beside: string;
    /** The same number of days before it, which every figure is read against. */
    before: {
        from: string;
        to: string;
        dates: string;
    };
}
/**
 * The days a range covers at a business day ("2026-10-06", the workspace's own today). A period by name is a count of
 * days ending today, today included, as the report reads them (Month: the 1st to today); days a member picked are those
 * days. Said for the control before its read lands, so the window picked shows at once, by the same arithmetic the route
 * reads with (fixedDaysOf, monthDaysAt, reportDaysCount).
 */
declare function reportWindowOf(range: ReportRange, today: string): ReportWindowVM;
/**
 * What the month a member picks days on says under itself (the kit's DayRangePicker `hint`): how to pick, then the
 * first day pressed, then the days the band covers and how many they are, while the last is still to be pressed. A day
 * the month could not choose (`refused`: one to come, or too far from the first day) is said, and why, until a press
 * chooses.
 */
declare function reportPickWords(first: string | null, band: ReportDays, refused: {
    day: string;
    why: "to-come" | "too-far";
} | null): string;

export { type ReportWindowVM, reportPickWords, reportShortcuts, reportWindowOf };
