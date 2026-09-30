/**
 * The series Reports draws, in the chart kit's config shape: a label and a colour token per key. Ink blue is the one
 * data hue; unanswered wears the warn status with its icon; a channel keeps its colour whatever its rank (moved from
 * legacy/pages/reports-sections.jsx, decision 0015).
 */
import type { ReportBarVM, ReportVM } from "@chanlytics/contracts";
import type { ChartConfig } from "../kit/charts/geometry";

export const RPT_ANSWERED: ChartConfig = {
  ai: { label: "Receptionist", color: "var(--chart-1)" },
  you: { label: "You", color: "var(--chart-1-soft)" },
  none: { label: "Unanswered", color: "var(--warn)", icon: "alert" },
};

export const RPT_CHANNELS: ChartConfig = {
  whatsapp: { label: "WhatsApp", color: "var(--chart-cat-1)" },
  voice: { label: "Calls", color: "var(--chart-cat-2)" },
  email: { label: "Email", color: "var(--chart-cat-3)" },
  sms: { label: "SMS", color: "var(--chart-cat-4)" },
  instagram: { label: "Instagram", color: "var(--chart-cat-5)" },
};

export const RPT_CALLS: ChartConfig = { calls: { label: "Calls", color: "var(--chart-1)" } };
export const RPT_SENT: ChartConfig = { sent: { label: "Sent", color: "var(--chart-1)" } };
export const RPT_REPLY: ChartConfig = { p50: { label: "Median reply", color: "var(--chart-1)", shape: "line" } };
export const RPT_GAINED: ChartConfig = { gained: { label: "Ratings gained", color: "var(--chart-1)" } };
export const RPT_WRITTEN: ChartConfig = { written: { label: "Written", color: "var(--chart-1)" } };

/** This period under `key`, and the period before when there is one, named as the view model names them. */
export const rptPeriods = (vm: ReportVM, key: string, before: boolean): ChartConfig => ({
  [key]: { label: vm.period.now, color: "var(--chart-1)", shape: "line" },
  ...(before ? { prior: { label: vm.period.before, color: "var(--chart-prior)", shape: "line" as const } } : {}),
});

/** Reply times are ordered, fastest first and darkest (the ordinal ink ramp). */
export const rptSpread = (buckets: ReportBarVM[]): ChartConfig =>
  Object.fromEntries(buckets.map((b, i) => [b.id, { label: b.label, color: `var(--chart-ramp-${5 - i})` }]));

/** A caller's mood wears its status. */
export const rptMood = (rows: ReportBarVM[]): ChartConfig =>
  Object.fromEntries(
    rows.map((r) => [
      r.id,
      {
        label: r.label,
        color: r.tone === "ok" ? "var(--ok)" : r.tone === "danger" ? "var(--danger)" : "var(--chart-prior)",
      },
    ]),
  );

/** "1 message", "2 messages": a count with its noun, as Reports says every one. */
export const rptPlural = (n: number, one: string, many?: string): string => `${n} ${n === 1 ? one : many || `${one}s`}`;
