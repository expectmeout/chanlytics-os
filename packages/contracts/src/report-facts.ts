/**
 * Worth knowing: the facts the Reports page leads with. At most three, in the order an owner should act on them:
 * messages with no reply, why the receptionist handed over, the busiest day and its hours, the campaign that drew
 * the most replies, and a channel whose share moved. Each is a count over the report's own columns, never an
 * estimate, and none says a tile's number again (the tiles already did). Pure; the page draws what this returns.
 */
import { reportHourWords, type ReportVM } from "./reports";
import type { CampaignReportVM } from "./campaign-report";

export interface ReportFactVM {
  id: "unanswered" | "handovers" | "busiest" | "campaign" | "channel";
  tone: "" | "warn";
  /** An icon the legacy Icon set draws. */
  icon: "alert" | "users" | "calendar" | "sparkle" | "chat";
  text: string;
  /** The dim second half of the line; empty when the text says it all. */
  sub: string;
  door: { label: string; to: string } | null;
}

const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;
const lowerFirst = (s: string): string => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);

export function reportFacts(vm: ReportVM, campaigns: CampaignReportVM | null): ReportFactVM[] {
  const out: ReportFactVM[] = [];

  // "Yet": the newest of these may have a reply being written right now; every one of them has none so far.
  const none = vm.answered.totals.none;
  if (none > 0) {
    out.push({ id: "unanswered", tone: "warn", icon: "alert", text: `${plural(none, "message")} ${none === 1 ? "has" : "have"} no reply yet`, sub: "", door: { label: "Open the Inbox", to: "inbox" } });
  }

  // With one reason its count is the Needed you tile's, so the line says "every time" instead of the number again.
  const handovers = vm.answered.points.reduce((s, p) => s + p.escalations, 0);
  const top = vm.reasons[0];
  if (handovers > 0 && top) {
    const several = vm.reasons.length > 1;
    out.push({
      id: "handovers", tone: "", icon: "users",
      text: `${several ? "Top reason it handed over" : "Why it handed over"}: ${lowerFirst(top.label)}`,
      sub: several ? plural(top.value, "time") : "every time",
      door: { label: "See them", to: "inbox" },
    });
  }

  // The one busiest weekday: a tie names none. A week is said as days, a longer period as weekdays.
  const b = vm.week.busiest;
  if (b !== null) {
    const h = vm.hours;
    const peak = h && h.peak !== null ? `peak ${reportHourWords(h.peak)} to ${reportHourWords(h.peak + 2)}` : "";
    const outside = h && h.outside > 0 ? `${h.outside} outside 8am to 8pm` : "";
    out.push({
      id: "busiest", tone: "", icon: "calendar",
      text: vm.week.unit === "average" ? `${vm.week.long[b]}s are your busiest day` : `${vm.week.long[b]} was your busiest day`,
      sub: [peak, outside].filter(Boolean).join(", "),
      door: null,
    });
  }

  // The most replies, and for the same replies the one that took fewer messages to get them.
  const best = campaigns
    ? campaigns.sources.filter((s) => s.replied > 0).sort((a, c) => c.replied - a.replied || a.sent - c.sent)[0]
    : undefined;
  if (best) {
    out.push({
      id: "campaign", tone: "", icon: "sparkle", text: `${best.name} drew the most replies`, sub: `${best.replied} of ${best.sent} wrote back`,
      door: { label: "Open it", to: best.kind === "broadcast" ? `broadcasts/run:${best.id}` : `outbound/${best.id}` },
    });
  }

  const ch = vm.channels;
  if (ch) {
    const now = ch.reduce((s, c) => s + c.value, 0);
    const was = ch.reduce((s, c) => s + c.prior, 0);
    if (now > 0 && was > 0) {
      const moved = ch
        .map((c) => ({ c, share: Math.round((c.value / now) * 100), before: Math.round((c.prior / was) * 100) }))
        .map((m) => ({ ...m, delta: m.share - m.before }))
        .filter((m) => Math.abs(m.delta) >= 10)
        .sort((a, c) => Math.abs(c.delta) - Math.abs(a.delta))[0];
      if (moved) {
        out.push({ id: "channel", tone: "", icon: "chat", text: `${moved.c.label} ${moved.delta > 0 ? "grew" : "fell"} to ${moved.share}% of messages and calls`, sub: `from ${moved.before}% the ${vm.rangeLabel} before`, door: null });
      }
    }
  }

  return out.slice(0, 3);
}
