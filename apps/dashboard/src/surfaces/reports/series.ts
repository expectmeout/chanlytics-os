/**
 * The series Reports draws, in the chart kit's config shape: a label and a colour token per key. Ink blue is the one
 * data hue; unanswered wears the warn status with its icon; a channel keeps its colour whatever its rank (moved from
 * legacy/pages/reports-sections.jsx, decision 0015).
 */
import { REPORT_CHANNELS, type ReportBarVM, type ReportChannelKey, type ReportVM } from "@chanlytics/contracts";
import type { ChartConfig } from "../kit/charts/geometry";

export const RPT_ANSWERED: ChartConfig = {
  ai: { label: "Receptionist", color: "var(--chart-1)" },
  you: { label: "You", color: "var(--chart-1-soft)" },
  none: { label: "Unanswered", color: "var(--warn)", icon: "alert" },
};

/**
 * A channel's colour, by the channel and never its place in a list, so the colour follows it whatever its rank. Campaigns'
 * split bar (campaigns/parts/channels.ts) reads the same ones, so a channel is one colour wherever it is drawn.
 */
export const RPT_CHANNEL_COLORS: Record<ReportChannelKey, string> = {
  whatsapp: "var(--chart-cat-1)",
  voice: "var(--chart-cat-2)",
  email: "var(--chart-cat-3)",
  sms: "var(--chart-cat-4)",
};

/** The channels as the chart kit draws them: each one's words are contracts' (REPORT_CHANNELS), its colour is above. */
export const RPT_CHANNELS: ChartConfig = Object.fromEntries(
  REPORT_CHANNELS.map(({ key, label }) => [key, { label, color: RPT_CHANNEL_COLORS[key] }]),
);

export const RPT_CALLS: ChartConfig = { calls: { label: "Calls", color: "var(--chart-1)" } };
export const RPT_SENT: ChartConfig = { sent: { label: "Sent", color: "var(--chart-1)" } };
export const RPT_GAINED: ChartConfig = { gained: { label: "Ratings gained", color: "var(--chart-1)" } };
export const RPT_WRITTEN: ChartConfig = { written: { label: "Written", color: "var(--chart-1)" } };

/** This period under `key`, and the period before when there is one, named as the view model names them. */
export const rptPeriods = (vm: ReportVM, key: string, before: boolean): ChartConfig => ({
  [key]: { label: vm.period.now, color: "var(--chart-1)", shape: "line" },
  ...(before ? { prior: { label: vm.period.before, color: "var(--chart-prior)", shape: "line" as const } } : {}),
});

/** The ordinal ink ramp's steps: charts.css defines `--chart-ramp-1` (the lowest) to `--chart-ramp-5` (the highest). */
const RAMP_LOWEST = 1;
const RAMP_HIGHEST = 5;

/**
 * Reply times are ordered, fastest first and darkest (the ordinal ink ramp). So is a caller's mood, good first: an order,
 * not a verdict, so it wears the same ramp and never the green and red of a status. A sixth value or more stays on the ramp's
 * lowest step, never on a token that is not there.
 */
export const rptSpread = (buckets: ReportBarVM[]): ChartConfig =>
  Object.fromEntries(
    buckets.map((b, i) => [
      b.id,
      { label: b.label, color: `var(--chart-ramp-${Math.max(RAMP_LOWEST, RAMP_HIGHEST - i)})` },
    ]),
  );
