import { reportHourWords } from "./reports.js";
import { beforeWords, messagesAnsweredWords } from "./report-tiles.js";
import { plural } from "../shared/words.js";
const lowerFirst = (s) => s ? s.charAt(0).toLowerCase() + s.slice(1) : s;
export function reportFacts(vm, campaigns, ads = null) {
  const out = [];
  const none = vm.answered.totals.none;
  if (none > 0) {
    out.push({
      id: "unanswered",
      tone: "warn",
      icon: "alert",
      text: `${plural(none, "message")} ${none === 1 ? "has" : "have"} no reply yet`,
      sub: "",
      door: { label: "Open the Inbox", to: "inbox" }
    });
  }
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
      door: { label: "See them", to: "inbox" }
    });
  }
  const b = vm.days > 1 ? vm.week.busiest : null;
  const h = vm.hours;
  const peak = h && h.peak !== null ? `peak ${reportHourWords(h.peak)} to ${reportHourWords(h.peak + 2)}` : "";
  if (b !== null) {
    const closed = h && h.closed ? `${h.closed} while you were closed` : "";
    out.push({
      id: "busiest",
      tone: "",
      icon: "calendar",
      text: vm.week.unit === "average" ? `${vm.week.long[b]}s are your busiest day` : `${vm.week.long[b]} was your busiest day`,
      sub: [peak, closed].filter(Boolean).join(", "),
      door: null
    });
  }
  if (vm.hoursUnset) {
    out.push({
      id: "hours",
      tone: "",
      icon: "clock",
      text: "Set your business hours to see what came in while you were closed",
      sub: "",
      door: { label: "Open Settings", to: "admin/hours" }
    });
  } else if (b === null && h && h.closed) {
    out.push({
      id: "closed",
      tone: "",
      icon: "clock",
      text: `${h.closed} came in while you were closed`,
      sub: peak,
      door: null
    });
  }
  const best = campaigns ? campaigns.sources.filter((s) => s.replied > 0).sort((a, c) => c.replied - a.replied || a.sent - c.sent)[0] : void 0;
  if (best) {
    out.push({
      id: "campaign",
      tone: "",
      icon: "sparkle",
      text: `${best.name} drew the most replies`,
      sub: messagesAnsweredWords(best.replied, best.sent),
      door: { label: "Open it", to: best.kind === "broadcast" ? `broadcasts/run:${best.id}` : `outbound/${best.id}` }
    });
  }
  const ch = vm.channels;
  if (ch) {
    const now = ch.reduce((s, c) => s + c.value, 0);
    const was = ch.reduce((s, c) => s + c.prior, 0);
    if (now > 0 && was > 0) {
      const moved = ch.map((c) => ({ c, share: Math.round(c.value / now * 100), before: Math.round(c.prior / was * 100) })).map((m) => ({ ...m, delta: m.share - m.before })).filter((m) => Math.abs(m.delta) >= 10).sort((a, c) => Math.abs(c.delta) - Math.abs(a.delta))[0];
      if (moved) {
        out.push({
          id: "channel",
          tone: "",
          icon: "chat",
          text: `${moved.c.label} ${moved.delta > 0 ? "grew" : "fell"} to ${moved.share}% of messages and calls`,
          sub: `from ${moved.before}% ${beforeWords(vm.rangeLabel)}`,
          door: null
        });
      }
    }
  }
  return ads ? [...out.slice(0, 2), ads] : out.slice(0, 3);
}
