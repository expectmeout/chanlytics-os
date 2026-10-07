import "server-only";
import { z } from "zod";
import {
  REPORT_RANGES,
  toBookingReportVM,
  toCampaignReportVM,
  toDealReportVM,
  toReportVM,
  toReviewsReportVM,
  type CampaignReportVM,
  type ReviewsReportVM,
} from "@chanlytics/contracts";
import { load } from "../../../readers";
import { campaignReport } from "../../../readers/campaign-report";
import { report, reviewsReport } from "../../../readers/report";
import { defineRead, unlessNotFound, unread, type ToolContext } from "../context";

/** The counts of days the table offers (Month is no count: it is the days since the 1st, and the page's own), as the model is told them. */
const PERIOD_DAYS = REPORT_RANGES.flatMap((r) => (r.days === null ? [] : [r.days]));
const PERIOD_DAYS_SAID = `${PERIOD_DAYS.slice(0, -1).join(", ")} or ${PERIOD_DAYS.at(-1)}`;

/**
 * The Campaigns lens as the page draws it (0030): what the broadcasts and playbooks sent and what came of it over the
 * period, a read a share of WhatsApp's own sends, by channel where more than one sent, and the five sources that sent
 * the most.
 */
function campaignsSaid(cm: CampaignReportVM) {
  const share = (n: number | null) => (n === null ? null : `${n}%`);
  return {
    tiles: cm.tiles.map((x) => ({ label: x.label, value: x.value, meta: x.meta, change: x.delta?.text ?? null })),
    // Said where the channels were counted (a database before 00329 has none, and its read is of every send).
    read: cm.channels.some((c) => c.channel === "whatsapp")
      ? `${cm.totals.read} of the ${cm.totals.readOf} sent by WhatsApp`
      : null,
    by_channel:
      cm.channels.length > 1
        ? cm.channels.map((ch) => ({
            channel: ch.label,
            sent: ch.sent,
            delivered: share(ch.deliveredPct),
            read: share(ch.readPct),
            wrote_back: share(ch.repliedPct),
          }))
        : null,
    sources: cm.sources.slice(0, 5).map((x) => ({
      name: x.name,
      kind: x.kindLabel,
      runs: x.runs,
      sent: x.sent,
      delivered: share(x.deliveredPct),
      wrote_back: share(x.repliedPct),
    })),
    yes_and_stop: cm.lines.funnel,
  };
}

/**
 * The Reviews lens as the page draws it (Reports, lens 1): the sentence at its head and its figures, made once by
 * toReviewsReportVM, and, where the owner's Business Profile has handed over the reviews, the mix of the period's stars
 * and how many wait for a reply. From the five reviews Google shows of a public listing there is the head and the
 * listing's four figures alone, with what the Business Profile would add (`connect`) where none is connected, and with
 * no listing linked there is `linked: false` and the words the fold has for it.
 */
function reviewsSaid(rv: ReviewsReportVM) {
  if (rv.empty) return { linked: false, words: rv.lines.empty };
  const said = {
    head: rv.lines.head,
    // What the figure draws beside its value is its `compare` (no Reviews tile has a percentage); null where history falls short.
    tiles: rv.tiles.map((x) => ({ label: x.label, value: x.value, meta: x.meta, change: x.compare })),
  };
  if (rv.source === "places") return { ...said, connect: rv.lines.connect };
  return {
    ...said,
    // The mix as the card says it (the line holds how many were rated) and its five rows; null where there is none to say.
    stars: rv.stars ? { line: rv.lines.mix, rows: rv.stars.rows.map((s) => `${s.label}: ${s.display}`) } : null,
    // `held` is of the oldest waiting, the only ones whose held replies are read (the page lists them).
    waiting: { count: rv.waiting.total, held: rv.waiting.rows.filter((w) => w.held !== null).length },
  };
}

async function getReport(t: ToolContext, input: { days: number }): Promise<unknown> {
  // The schema below refuses any other count, so the turn never gets here with one.
  const days = Number(input.days) || 30;
  // The Reports page's own read (readers/report.ts), once a turn: the series, then the booking line and the deals
  // beside it, with how the workspace's customers buy taken from the turn (ledger #1). A report the function will not
  // answer is the reader's 404, said as the tool always said it.
  const [r, campaignRead, reviewRead] = await Promise.all([
    unlessNotFound(load(t.rc, report, { days })),
    // The Campaigns lens's own read (readers/campaign-report.ts), beside it: one that fails is said as null, and in the log.
    load(t.rc, campaignReport, { days }).then((x) => x.data.report, unread(t, "report", "campaigns")),
    // The Reviews lens's own read (readers/report.ts reviewsReport: Google as its page reads it, and the reviews on
    // record): one that fails, a slow edge or a ledger that cannot be read, is null too. Folded below, outside the catch:
    // a fold that throws is a bug to see, never "could not be read".
    load(t.rc, reviewsReport, { days }).then((x) => x.data, unread(t, "report", "reviews")),
  ]);
  const campaigns = campaignRead ? toCampaignReportVM(campaignRead) : null;
  const reviews = reviewRead ? toReviewsReportVM(reviewRead, { nowMs: t.rc.now.getTime() }) : null;
  if (!r) return { error: "report unavailable" };
  // The page's own builders over the page's own payload, as the bridge applies them (legacy-bridge/surface-data.ts).
  const vm = toReportVM(r.data.report, { profile: r.data.profile });
  const booking = r.data.booking ? toBookingReportVM(r.data.booking) : null;
  const deals = toDealReportVM(r.data.deals, vm.rangeLabel);
  return {
    range: vm.rangeLabel,
    empty: vm.empty,
    tiles: vm.tiles.map((x) => ({ label: x.label, value: x.value, meta: x.meta, change: x.delta?.text ?? null })),
    answered: vm.answered.totals,
    // The median and p90 include the hold the owner set; `hold` splits the replies against it, null where none waited one.
    reply_time: {
      median: vm.replyTime.medianLabel,
      p90: vm.replyTime.p90Label,
      count: vm.replyTime.count,
      hold: vm.replyTime.hold,
    },
    calls: { total: vm.calls.total, minutes: vm.calls.minutes, voicemail: vm.calls.voicemail },
    new_people: vm.people.total,
    escalation_reasons: vm.reasons.slice(0, 5).map((r) => `${r.label}: ${r.value}`),
    by_day: vm.answered.points
      .slice(-14)
      .map((p) => ({ day: p.short, in: p.in, receptionist: p.ai, you: p.you, unanswered: p.none })),
    // Asked, then booked: the page's one conversion line, its headline ("12 of 40 booked", "Nobody asked") where the
    // calendar was read, else the page's own sentence for why there is nothing to count. Null: that line's read failed.
    booking: booking ? (booking.present ? booking.headline : booking.sub) : null,
    // The Deals section as the page draws it, where it draws one (deals are on and one was recorded): the cohort's
    // headline, what became of its proposals, the lines beside the bars, and the clients now. Null where it draws none.
    deals: deals.present
      ? {
          headline: deals.headline,
          outcomes: (deals.outcomes?.rows ?? []).map((o) => `${o.label}: ${o.value}`),
          lines: deals.lines.map((l) => l.text),
          stock: deals.stock,
        }
      : null,
    // The Campaigns lens (0030), by channel where more than one sent; said as an error where its read failed, never as
    // nothing sent.
    campaigns: campaigns ? campaignsSaid(campaigns) : { error: "the campaign numbers could not be read just now" },
    // The Reviews lens, as the page says it; an error where its read failed, never as no reviews.
    reviews: reviews ? reviewsSaid(reviews) : { error: "the review numbers could not be read just now" },
  };
}

export const reportTool = defineRead({
  name: "report",
  description: `The Reports page for the last ${PERIOD_DAYS_SAID} days: messages answered by the receptionist, by a person and left unanswered, the median and p90 reply time (both include the hold the owner set before a reply goes out; reply_time.hold splits the replies against it: with no hold, as the hold ended, or later, and the most any took past it), calls and their minutes, new people, the escalation reasons, the change against the period before, a by-day series, the booking line (asked, then booked) where the calendar is read, the Deals section where deals are on, and the Campaigns lens: what the broadcasts and playbooks sent, delivered and had written back, who said yes or asked to stop, the sources that sent the most, and by_channel where more than one channel sent (read is a share of what went by WhatsApp alone: a text or an email keeps no read receipt); campaigns says error where its numbers could not be read. The Reviews lens is in reviews: the sentence at its head and its figures as the page says them (the rating, the count, the reviews written against the period before) and, where the owner's Business Profile is connected, how many were answered and how fast, the mix of stars, and how many wait for a reply (held is how many of the oldest waiting hold a reply the receptionist wrote and did not post); reviews says linked false where no Google listing is linked, and error where its numbers could not be read. Call it for how a period went or for a trend; the today tool has the day itself and its counts, and the Reports page on screen already holds this. days takes ${PERIOD_DAYS_SAID} and nothing else. An empty period says so in empty; a range the report cannot answer is an error, said in words.`,
  // The table's counts as literals, not a number: the schema refuses 8, and says the ones it takes.
  input: z.object({ days: z.literal(PERIOD_DAYS) }),
  label: "Reading Reports",
  run: getReport,
});
