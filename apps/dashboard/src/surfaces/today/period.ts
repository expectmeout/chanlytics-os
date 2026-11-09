/**
 * The period line at the foot of the day's card (today/day/zone.ts): the last seven, thirty or ninety days (or the month so far) in one
 * sentence, every number one Reports prints. It reads the headline (`ReportHeadlineVM`, reports/headline.ts), which is also
 * what Worth a look reads of Reports (today/leaks.ts): the period's counts as the server summed them from the one series Reports
 * is drawn from, and the words they are said in.
 */
import type { ReportHeadlineVM } from "@chanlytics/contracts";

/**
 * The period in one sentence at the foot of the day's card, with a door to Reports, which was rebuilt on 19 September to carry
 * exactly this material. Every number is one Reports prints: its period words (`lead`), the messages' comparison in counts, the
 * receptionist's share rounded as its tile rounds it, its calls. Not its median reply: that is Reports' own figure, and with it
 * the foot ran three lines on a phone (22 Sep). "Messages", not "customer messages": the card's figure above already says whose.
 * It reads nothing of the campaigns: that read failed on its own (#686) and a line that dereferenced it took the whole page down;
 * the headline has none.
 */
export function todayPeriodLine(reportHeadline: ReportHeadlineVM | null): { text: string; to: "reports" } | null {
  if (!reportHeadline) return null;
  if (reportHeadline.empty) return { text: `${reportHeadline.lead}: nobody wrote or called.`, to: "reports" };
  // A zero says nothing on a line that has something else to say ("0 messages, 15 calls"): the calls alone, there.
  const { total, compare } = reportHeadline.messages;
  const parts = total || compare ? [`${total} message${total === 1 ? "" : "s"}${compare ? ` (${compare})` : ""}`] : [];
  if (reportHeadline.answered.share !== null)
    parts.push(`${Math.round(reportHeadline.answered.share * 100)}% answered by the receptionist`);
  if (reportHeadline.calls) parts.push(`${reportHeadline.calls} call${reportHeadline.calls === 1 ? "" : "s"}`);
  return { text: `${reportHeadline.lead}: ${parts.join(", ")}.`, to: "reports" };
}
