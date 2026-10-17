/**
 * Worth knowing: the facts the Reports page leads with. At most three, in the order an owner should act on them:
 * messages with no reply, why the receptionist handed over, the busiest day and its hours (or, with no one busiest
 * day, what came while the business was closed; or, with no hours set, the door to set them), the campaign that drew
 * the most replies, and a channel whose share moved. Each is a count over the report's own columns, never an
 * estimate, and none says a tile's number again (the tiles already did). Pure; the page draws what this returns.
 */
import { reportHourWords, type ReportVM } from "./reports";
import { beforeWords, messagesAnsweredWords } from "./report-tiles";
import type { CampaignReportVM } from "./campaign-report";
import { plural } from "../shared/words";

export interface ReportFactVM {
  id: "unanswered" | "handovers" | "busiest" | "hours" | "closed" | "campaign" | "channel" | "ads";
  tone: "" | "warn";
  /** An icon the legacy Icon set draws. */
  icon: "alert" | "users" | "calendar" | "clock" | "sparkle" | "chat";
  text: string;
  /** The dim second half of the line; empty when the text says it all. */
  sub: string;
  door: { label: string; to: string } | null;
}

const lowerFirst = (s: string): string => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);

/**
 * The campaigns it reads are the sources of the Campaigns lens's own read (`reports_campaigns`), which the page holds beside the
 * report: null, or no sources, while that read is out, failed or missing, and the fact is then absent, never guessed.
 *
 * `ads` is the one fact the Ads fold makes of the same days ("Your ads brought 14 new people", its door Open Ads): handed only
 * to a workspace that has ads (a demo session for now), so a workspace without them reads exactly the facts it always did. It
 * takes the last of the three places, after the two an owner should act on first.
 */
export function reportFacts(
  vm: ReportVM,
  campaigns: Pick<CampaignReportVM, "sources"> | null,
  ads: ReportFactVM | null = null,
): ReportFactVM[] {
  const out: ReportFactVM[] = [];

  // "Yet": the newest of these may have a reply being written right now; every one of them has none so far.
  const none = vm.answered.totals.none;
  if (none > 0) {
    out.push({
      id: "unanswered",
      tone: "warn",
      icon: "alert",
      text: `${plural(none, "message")} ${none === 1 ? "has" : "have"} no reply yet`,
      sub: "",
      door: { label: "Open the Inbox", to: "inbox" },
    });
  }

  // With one reason its count is the Needed you tile's, so the line says "every time" instead of the number again.
  const handovers = vm.answered.points.reduce((s, p) => s + p.escalations, 0);
  const top = vm.reasons[0];
  if (handovers > 0 && top) {
    const several = vm.reasons.length > 1;
    out.push({
      id: "handovers",
      tone: "",
      icon: "users",
      text: `${several ? "Top reason it handed over" : "Why it handed over"}: ${lowerFirst(top.label)}`,
      sub: several ? plural(top.value, "time") : "every time",
      door: { label: "See them", to: "inbox" },
    });
  }

  // The one busiest weekday: a tie names none, and neither does a report of one day, whose only day is no busier than
  // any other (Yesterday, Month on the 1st). A week is said as days, a longer period as weekdays.
  const b = vm.days > 1 ? vm.week.busiest : null;
  const h = vm.hours;
  const peak = h && h.peak !== null ? `peak ${reportHourWords(h.peak)} to ${reportHourWords(h.peak + 2)}` : "";
  if (b !== null) {
    const closed = h && h.closed ? `${h.closed} while you were closed` : "";
    out.push({
      id: "busiest",
      tone: "",
      icon: "calendar",
      text:
        vm.week.unit === "average"
          ? `${vm.week.long[b]}s are your busiest day`
          : `${vm.week.long[b]} was your busiest day`,
      sub: [peak, closed].filter(Boolean).join(", "),
      door: null,
    });
  }

  // While you were closed (spec A2): with no hours set, the door to set them; with hours and no one busiest day, the
  // count the busiest day's line would have carried. Never a guess: a profile that could not be read says neither.
  if (vm.hoursUnset) {
    out.push({
      id: "hours",
      tone: "",
      icon: "clock",
      text: "Set your business hours to see what came in while you were closed",
      sub: "",
      door: { label: "Open Settings", to: "admin/hours" },
    });
  } else if (b === null && h && h.closed) {
    out.push({
      id: "closed",
      tone: "",
      icon: "clock",
      text: `${h.closed} came in while you were closed`,
      sub: peak,
      door: null,
    });
  }

  // The most replies, and for the same replies the one that took fewer messages to get them.
  const best = campaigns
    ? campaigns.sources.filter((s) => s.replied > 0).sort((a, c) => c.replied - a.replied || a.sent - c.sent)[0]
    : undefined;
  if (best) {
    out.push({
      id: "campaign",
      tone: "",
      icon: "sparkle",
      text: `${best.name} drew the most replies`,
      sub: messagesAnsweredWords(best.replied, best.sent),
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
        out.push({
          id: "channel",
          tone: "",
          icon: "chat",
          text: `${moved.c.label} ${moved.delta > 0 ? "grew" : "fell"} to ${moved.share}% of messages and calls`,
          sub: `from ${moved.before}% ${beforeWords(vm.rangeLabel)}`,
          door: null,
        });
      }
    }
  }

  return ads ? [...out.slice(0, 2), ads] : out.slice(0, 3);
}
