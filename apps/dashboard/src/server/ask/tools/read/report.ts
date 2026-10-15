import "server-only";
import { z } from "zod";
import {
  AppError,
  REPORT_PERIOD_IDS,
  isThinShare,
  reportShortcuts,
  zoneDayKey,
  isUncounted,
  shareSaid,
  toBookingReportVM,
  toCampaignLensVM,
  toDealReportVM,
  toPeopleReportVM,
  toReceptionistReportVM,
  toReportVM,
  toReviewsReportVM,
  reviewRoute,
  type CampaignLensVM,
  type CampaignReportVM,
  type PeopleReportVM,
  type ReachOutLensVM,
  type ReceptionistReportVM,
  type ReportBarVM,
  type ReportStripTile,
  type ReviewsReportVM,
} from "@chanlytics/contracts";
import { load } from "../../../readers";
import { campaignLedgerReport, campaignReport, reachOutReport } from "../../../readers/campaign-report";
import * as facts from "../../../readers/facts";
import { peopleReport, receptionistReport, report, reportWindowFor, reviewsReport } from "../../../readers/report";
import { defineRead, noteRow, unlessNotFound, unread, type ToolContext } from "../context";

/** The periods by name, as the model reads them: said from the one table (contracts REPORT_RANGES). */
const PERIODS_SAID = `${REPORT_PERIOD_IDS.slice(0, -1).join(", ")} or ${REPORT_PERIOD_IDS.at(-1)}`;
/** The shortcuts the Reports page's period control offers, by the id the model names them with. */
const SHORTCUTS = ["yesterday", "last_week", "last_month"] as const;
/** The lenses a read may name: the Overview (the series, the booking line, the deals) and the page's other six. */
const LENSES = ["overview", "campaigns", "reviews", "cold_email", "receptionist", "people"] as const;
type Lens = (typeof LENSES)[number];

/**
 * The three shapes every lens says its parts in, declared once. A row of a mix is `label: value` (`mixRow`: a name of its own,
 * since `row` stands at the top of two other modules and a third is the copies ratchet's red); a figure is the page's own
 * label, value and meta and its change (the figure's `compare`: null where there is none, and a dash with words where its
 * number has no source, never a 0 and never a percentage); its value is null where the page greys it, a share of fewer than
 * five (`isThinFigure`), and the meta says the count; a mix with nothing to draw says the page's words for why in `empty`.
 */
const mixRow = (x: Pick<ReportBarVM, "label" | "value">) => `${x.label}: ${x.value}`;
/** A row the page draws with words of its own beside the bar (a rate: "30 of 110 were answered  27%"): `label: display`. */
const shownRow = (x: { label: string; display: string }) => `${x.label}: ${x.display}`;
/**
 * A share the page greys: a tile whose value is a percentage and that says what it is of (`n`) and the fewest that say anything
 * (`minN`), with some of it but too few (contracts' `isThinShare`, the predicate the kit's Figure greys by). Ask cannot grey, so
 * it does not say the share; the fold's meta carries the count it is of ("3 of 4"), and the value is null. A median, a count and
 * an "x of y" are no share: they carry `n` too, and are said as they are. Which tile is a share is told by its value's "%", the
 * only mark there is: a strip tile carries no field that says what kind of number it is (its `metric` names words, not a unit),
 * and `n` and `minN` are carried by medians and counts alike.
 */
const isThinFigure = (x: Pick<ReportStripTile, "value" | "n" | "minN">): boolean =>
  x.value.endsWith("%") && x.n !== undefined && x.minN !== undefined && isThinShare(x.n, x.minN);
const figure = (x: Pick<ReportStripTile, "label" | "value" | "meta" | "compare" | "n" | "minN">) => ({
  label: x.label,
  value: isThinFigure(x) ? null : x.value,
  meta: x.meta,
  change: x.compare,
});
const mix = (m: { rows: ReportBarVM[]; line: string | null; empty: string | null }) =>
  m.empty === null ? { rows: m.rows.map(mixRow), line: m.line } : { empty: m.empty };

/** The sources the Campaigns lens says: the five that sent the most (the database lists them by what they sent). */
const SOURCES_SAID = 5;

/**
 * A part of the window the database did not send in full (a count of it left out) is not said at all: a mix with no rows,
 * no line and no words would read as none, and the fold's rule is that a count the database did not send is never a zero.
 */
const partSaid = (m: CampaignLensVM["funnel"]) => (isUncounted(m) ? null : mix(m));

/** The replies by message: how many of each message's sends that have had their time were answered, in the page's words. */
function byMessageSaid(b: CampaignLensVM["byMessage"]) {
  if (b.empty !== null) return { empty: b.empty };
  if (isUncounted(b)) return null;
  return { rows: b.rows.map(shownRow), line: b.line };
}

/**
 * The current period by channel, where more than one sent: a read is WhatsApp's alone, and every share follows the lens's five.
 * `answered` is the share of the messages that were answered (the page's "Answered"); who wrote back is the people, said in `figures`.
 */
function byChannelSaid(cm: CampaignReportVM) {
  if (cm.channels.length < 2) return null;
  return cm.channels.map((ch) => ({
    channel: ch.label,
    sent: ch.sent,
    delivered: shareSaid(ch.deliveredPct, ch.delivered, ch.sent),
    read: ch.read === null ? null : shareSaid(ch.readPct, ch.read, ch.sent),
    answered: shareSaid(ch.repliedPct, ch.replied, ch.sent),
  }));
}

/** The window's six parts, from the database's ledger (campaign_ledger, 00405). */
function windowSaid(lens: CampaignLensVM) {
  return {
    held: partSaid(lens.held),
    runs_stopped: partSaid(lens.stopped),
    failed_sends: partSaid(lens.failedWhy),
    by_message: byMessageSaid(lens.byMessage),
    send_to_first_reply: partSaid(lens.firstReply),
    wait_for_your_ok: partSaid(lens.approval),
  };
}

/**
 * What past the sends could not be read, in the page's words for it: the ledger (it takes what is stuck with it) or what is
 * stuck alone. The sends' read failing is the whole answer's error, and the reach-outs' is `reach_outs`' own.
 */
function lensUnreadSaid(lens: CampaignLensVM): string | null {
  const lost = lens.failed.filter((f) => f.part === "ledger" || f.part === "stuck");
  return lost.length === 0 ? null : lost.map((f) => `${f.what} could not be read just now`).join("; ");
}

/**
 * The Campaigns lens as the page draws it (Reports, lens 4): each part made once by toCampaignLensVM, from the same three
 * reads and the same fold, so the number Ask says is the number the page shows. The sentence, the strip's five figures (the
 * people sent to, the share of the messages delivered, who wrote back, the yeses and the stops) and the funnel (in messages),
 * by channel where more than one sent, and the five sources that sent the most. `window` (the ledger: what was held, why
 * runs stopped and sends failed, replies by message, the time to a first reply and the wait for your OK) is null where the
 * database does not keep the ledger yet or its read failed (and a part of it the database did not count is null), and
 * `stuck` (as it stands now, whatever period) where it does not keep what is stuck or that read failed; a read that failed
 * is said in `error`, beside them, never as silence. The sends' own read failing is the answer, whole.
 */
function campaignsSaid(lens: CampaignLensVM) {
  const { report: sends } = lens;
  if (sends === null) return { error: "the campaign numbers could not be read just now" };
  const error = lensUnreadSaid(lens);
  return {
    head: lens.head,
    figures: lens.strip.map(figure),
    funnel: mix(lens.funnel),
    by_channel: byChannelSaid(sends),
    sources: sends.sources.slice(0, SOURCES_SAID).map((x) => ({
      name: x.name,
      kind: x.kindLabel,
      runs: x.runs,
      sent: x.sent,
      delivered: shareSaid(x.deliveredPct, x.delivered, x.sent),
      answered: shareSaid(x.repliedPct, x.replied, x.sent),
    })),
    window: lens.reads.ledger === "ok" ? windowSaid(lens) : null,
    stuck: lens.reads.stuck === "ok" ? lens.stuck.map(figure) : null,
    ...(error === null ? {} : { error }),
  };
}

/**
 * The Reviews lens as the page draws it (Reports, lens 1): the sentence at its head and its figures, made once by
 * toReviewsReportVM, and, where the owner's Business Profile has handed over the reviews, the mix of the period's stars
 * and how many wait for a reply. From the five reviews Google shows of a public listing there is the head and the
 * listing's four figures alone, with what the Business Profile would add (`connect`) where none is connected, and with
 * no listing linked there is `linked: false` and the words the fold has for it.
 */
function reviewsSaid(t: ToolContext, rv: ReviewsReportVM) {
  if (rv.empty) return { linked: false, words: rv.lines.empty };
  // Each review the lens lists is a row an answer may cite (kind review, by its row, google_reviews.id): it opens on the
  // lens with the review first and its reply box open. Five of each, its words cut as the timeline cuts a message.
  const reviewOf = (r: ReviewsReportVM["latest"][number]) => {
    noteRow(t, "review", r.id, `${r.author} · ${r.stars}`, reviewRoute(r.id));
    return { id: r.id, author: r.author, stars: r.stars, when: r.when, text: r.text.slice(0, 240), replied: r.replied };
  };
  const said = {
    head: rv.lines.head,
    // What the figure draws beside its value is its `compare` (no Reviews tile has a percentage); null where history falls short.
    tiles: rv.tiles.map((x) => ({ label: x.label, value: x.value, meta: x.meta, change: x.compare })),
  };
  if (rv.source === "places")
    return { ...said, latest: rv.latest.slice(0, 5).map(reviewOf), connect: rv.lines.connect };
  return {
    ...said,
    // The mix as the card says it (the line holds how many were rated) and its five rows; null where there is none to say.
    stars: rv.stars ? { line: rv.lines.mix, rows: rv.stars.rows.map(shownRow) } : null,
    // `held` is of the oldest waiting, the only ones whose held replies are read (the page lists them).
    waiting: {
      count: rv.waiting.total,
      held: rv.waiting.rows.filter((w) => w.held !== null).length,
      // The oldest waiting, as the page lists them, each with the reply the receptionist held, where it held one.
      rows: rv.waiting.rows.slice(0, 5).map((w) => ({ ...reviewOf(w), held: w.held })),
    },
    // The newest, those waiting left out, as the page lists them.
    latest: rv.latest.slice(0, 5).map(reviewOf),
  };
}

/**
 * The Reach-outs section as Reports draws it (the Campaigns lens, C4), where the workspace has a reach-out at all: made once
 * by toReachOutLensVM, from the same reader and the same fold. The emails are counted in emails (`emails`, and the strip's
 * first three figures against the period before) and the businesses in businesses (`businesses`, `angles`): each business is
 * counted once, at the last email that wrote to it, and who wrote back, was interested, booked or said no is as it stands
 * now, said against nothing of the period before. `handed` is the page's line on the businesses handed to the owner, null
 * where none were; a database before 00404 says in `businesses` and `angles` that it does not count businesses yet.
 */
function reachOutsSaid(ro: ReachOutLensVM) {
  if (!ro.present) return null;
  const { angles, lines } = ro;
  return {
    empty: ro.empty,
    strip: ro.strip.map(figure),
    emails: mix(ro.emails),
    businesses: mix(ro.businesses),
    angles: angles.empty === null ? { rows: angles.rows.map(shownRow), line: angles.line } : { empty: angles.empty },
    handed: lines.written === "" ? null : lines.written,
  };
}

/**
 * The Receptionist lens as the page draws it (Reports, lens 2): each part made once by toReceptionistReportVM, from the
 * same reader and the same fold, so the number Ask says is the number the page shows. Rows are `label: value`, a figure
 * is the page's own label, value, meta and change (its `compare`: null where there is none, and a dash with words where
 * its number has no source, never a 0), and a mix with nothing to draw (the endings of calls included) says the page's
 * words for why in `empty`. A database without the function is `available: false` (the page draws none of these parts
 * then, either); `closed` is null where the workspace's hours could not be read.
 */
function receptionistSaid(rc: ReceptionistReportVM) {
  if (!rc.available) return { available: false };
  return {
    hold: mix(rc.hold),
    topics: mix(rc.topics),
    // Said only where the receptionist wrote in two languages or more: one is no mix.
    languages: rc.languages ? rc.languages.rows.map(mixRow) : null,
    // The page's own empty words where no call connected, as hold and topics say theirs; else the rows.
    call_endings: rc.callEndings.empty === null ? rc.callEndings.rows.map(mixRow) : { empty: rc.callEndings.empty },
    link: rc.link.line,
    handover: rc.handover.map(figure),
    missed: figure(rc.missed),
    closed: rc.closed ? { value: rc.closed.value, meta: rc.closed.meta } : null,
    stuck: rc.stuck.map((x) => ({ label: x.label, value: x.value, meta: x.meta })),
    // The reasons the send door refused a reply, most first; they overlap the hold's "did not go out", never add to it.
    held_back: rc.heldBack.map(mixRow),
  };
}

/**
 * The People lens as the page draws it (Reports, lens 3): each part made once by toPeopleReportVM, from the same reader
 * and the same fold, so the number Ask says is the number the page shows. Rows are `label: value`, a figure is the page's
 * own label, value, meta and change (its `compare`: null where there is none), and a mix with nothing to draw says the
 * page's words for why in `empty`. The lens has two halves and each stands without the other: `window` (the people who
 * reached the business in the period, from the database) is null where the database does not keep those numbers yet, and
 * `book` (everyone as they stand now, whatever period is picked) is null where People could not be counted; with neither
 * it is `available: false`, as the Receptionist's is.
 */
function peopleSaid(pv: PeopleReportVM) {
  if (!pv.windowAvailable && !pv.nowAvailable) return { available: false };
  return {
    head: pv.head,
    window: pv.windowAvailable
      ? {
          reached: pv.strip.map(figure),
          channels: mix(pv.channels),
          first_came: mix(pv.firstCame),
          yeses: mix(pv.yeses),
          stops: mix(pv.stops),
          steps_done: mix(pv.stepsDone),
          email_stopped: mix(pv.emailStopped),
        }
      : null,
    book: pv.nowAvailable
      ? {
          wires: mix(pv.wires),
          // The freshness card's foot: how many have been quiet over 30 days, null where none has.
          fresh: { ...mix(pv.fresh), quiet: pv.fresh.quiet?.line ?? null },
          stuck: pv.stuck.map(figure),
          stand: pv.stand.map(figure),
        }
      : null,
  };
}

/**
 * The window a read names, as the Reports page's control picks one and its route reads it (readers/report.ts
 * reportWindowFor, the one place a request becomes days): a period by name (7d, 30d, 90d, month), days picked (from and
 * to), or one of the control's shortcuts, worked out from the workspace's own today (contracts reportShortcuts). Refused
 * in the route's own words where it is not a window.
 */
async function askedWindow(
  t: ToolContext,
  input: {
    period?: (typeof REPORT_PERIOD_IDS)[number];
    from?: string;
    to?: string;
    shortcut?: (typeof SHORTCUTS)[number];
  },
) {
  let asked: { period?: (typeof REPORT_PERIOD_IDS)[number]; from?: string; to?: string } = {
    period: input.period,
    from: input.from,
    to: input.to,
  };
  const shortcut = input.shortcut;
  if (shortcut) {
    const zone = (await load(t.rc, facts.facts, undefined)).data.timezone;
    const today = zoneDayKey(t.rc.now.getTime(), zone);
    const cut = reportShortcuts(today).find((s) => s.id === shortcut.replace(/_/g, "-"));
    if (!cut) return { refusal: "shortcut is yesterday, last_week or last_month" };
    asked = { from: cut.days.from, to: cut.days.to };
  }
  if (!asked.period && !asked.from && !asked.to) asked = { period: "30d" };
  try {
    return { window: await reportWindowFor(t.rc, asked) };
  } catch (e) {
    if (e instanceof AppError) return { refusal: e.message };
    throw e;
  }
}

/**
 * Each lens's own read, beside the Reports page's (readers/report.ts), for the lenses asked for alone: one not asked is
 * null, one that fails is null too, and said in the log.
 */
function lensReads(t: ToolContext, window: Parameters<typeof report.read>[1], want: Set<Lens>) {
  const none = Promise.resolve(null);
  return Promise.all([
    // The Campaigns lens's own read (readers/campaign-report.ts), beside it: one that fails is said as null, and in the log.
    want.has("campaigns")
      ? load(t.rc, campaignReport, window).then((x) => x.data.report, unread(t, "report", "campaigns"))
      : none,
    // The Campaigns lens's ledger (readers/campaign-report.ts campaignLedgerReport: the window's people, runs, holds and
    // failures, and what is stuck now, judged at the turn's clock), which the page reads beside the sends. Each of its parts
    // fails alone inside the reader; the whole failing is null here, said as an error beside the sends and in the log.
    want.has("campaigns")
      ? load(t.rc, campaignLedgerReport, window).then((x) => x.data, unread(t, "report", "campaign_ledger"))
      : none,
    // The Reviews lens's own read (readers/report.ts reviewsReport: Google as its page reads it, and the reviews on
    // record): one that fails, a slow edge or a ledger that cannot be read, is null too. Folded below, outside the catch:
    // a fold that throws is a bug to see, never "could not be read".
    want.has("reviews") ? load(t.rc, reviewsReport, window).then((x) => x.data, unread(t, "report", "reviews")) : none,
    // The Reach-outs section's own read (readers/campaign-report.ts reachOutReport), the page's, over the same window:
    // null where it fails.
    want.has("campaigns") || want.has("cold_email")
      ? load(t.rc, reachOutReport, window).then((x) => x.data.report, unread(t, "report", "reach_outs"))
      : none,
    // The Receptionist lens's own read (readers/report.ts receptionistReport: the database's receptionist_series, the
    // people sent the booking link counted against the calendar, and the hours): a database without the function answers
    // with no series (said as `{ available: false }`: the page draws its kept cards and none of these parts), one that
    // fails is null too, and the fold is outside the catch, as above.
    want.has("receptionist")
      ? load(t.rc, receptionistReport, window).then((x) => x.data, unread(t, "report", "receptionist"))
      : none,
    // The People lens's own read (readers/report.ts peopleReport: the database's people_series, and the book as People counts
    // it over the turn's one read of People, the zone and the channels, which the booking line and the others share): a
    // database without the function answers with no series (said as `window: null`), People that cannot be counted leave
    // the book null, one that fails is null here (said as an error), and the fold is outside the catch, as above.
    want.has("people") ? load(t.rc, peopleReport, window).then((x) => x.data, unread(t, "report", "people")) : none,
  ]);
}

/** The overview as the page draws it: its tiles, answers, reply times, calls, people, reasons, days, booking line and deals. */
function overviewSaid(
  vm: ReturnType<typeof toReportVM>,
  booking: ReturnType<typeof toBookingReportVM> | null,
  deals: ReturnType<typeof toDealReportVM>,
) {
  return {
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
    // The Deals section as the page draws it, where it draws one (deals are on and one was recorded). Null where none.
    deals: deals.present
      ? {
          headline: deals.headline,
          outcomes: (deals.outcomes?.rows ?? []).map((o) => `${o.label}: ${o.value}`),
          lines: deals.lines.map((l) => l.text),
          stock: deals.stock,
        }
      : null,
  };
}

/** Each lens asked for, as the page says it; an error where its read failed, never as nothing. */
function lensesSaid(
  t: ToolContext,
  want: Set<Lens>,
  lens: {
    campaigns: ReturnType<typeof toCampaignLensVM>;
    reviews: ReturnType<typeof toReviewsReportVM> | null;
    receptionist: ReturnType<typeof toReceptionistReportVM> | null;
    people: ReturnType<typeof toPeopleReportVM> | null;
  },
) {
  const { campaigns, reviews, receptionist, people } = lens;
  const reachOuts = campaigns.reachOuts;
  return {
    // Each lens as the page says it, where it was asked for; an error where its read failed, never as nothing.
    ...(want.has("campaigns") ? { campaigns: campaignsSaid(campaigns) } : {}),
    ...(want.has("reviews")
      ? { reviews: reviews ? reviewsSaid(t, reviews) : { error: "the review numbers could not be read just now" } }
      : {}),
    ...(want.has("campaigns") || want.has("cold_email")
      ? {
          reach_outs: reachOuts
            ? reachOutsSaid(reachOuts)
            : { error: "the cold email numbers could not be read just now" },
        }
      : {}),
    ...(want.has("receptionist")
      ? {
          receptionist: receptionist
            ? receptionistSaid(receptionist)
            : { error: "the receptionist numbers could not be read just now" },
        }
      : {}),
    ...(want.has("people")
      ? { people: people ? peopleSaid(people) : { error: "the people numbers could not be read just now" } }
      : {}),
  };
}

async function getReport(
  t: ToolContext,
  input: {
    period?: (typeof REPORT_PERIOD_IDS)[number];
    from?: string;
    to?: string;
    shortcut?: (typeof SHORTCUTS)[number];
    lenses?: Lens[];
  },
): Promise<unknown> {
  const w = await askedWindow(t, input);
  if ("refusal" in w) return { error: w.refusal };
  const { window } = w;
  // Only the lenses asked for are read (every one where none is named), so a question about reviews reads reviews.
  const want = new Set<Lens>(input.lenses?.length ? input.lenses : LENSES);
  // The Reports page's own read (readers/report.ts), once a turn: the series, then the booking line and the deals
  // beside it, with how the workspace's customers buy taken from the turn (ledger #1). A report the function will not
  // answer is the reader's 404, said as the tool always said it. Each lens asked for is read beside it.
  const [r, lensRead] = await Promise.all([unlessNotFound(load(t.rc, report, window)), lensReads(t, window, want)]);
  const [campaignRead, ledgerRead, reviewRead, reachRead, receptionistRead, peopleRead] = lensRead;
  // The Campaigns lens is folded from its three reads at once, as the page folds them (a read that failed is null, and the
  // fold says what stands); the Reach-outs section is the same fold's own part, said whether or not the sends were read.
  const campaigns = toCampaignLensVM(
    { campaigns: campaignRead, ledger: ledgerRead, reachOuts: reachRead },
    t.rc.now.getTime(),
  );
  const reviews = reviewRead ? toReviewsReportVM(reviewRead, { nowMs: t.rc.now.getTime() }) : null;
  const receptionist = receptionistRead
    ? toReceptionistReportVM(receptionistRead, { nowMs: t.rc.now.getTime() })
    : null;
  const people = peopleRead ? toPeopleReportVM(peopleRead) : null;
  if (!r) return { error: "report unavailable" };
  // The page's own builders over the page's own payload, as the bridge applies them (legacy-bridge/surface-data.ts).
  const vm = toReportVM(r.data.report, { profile: r.data.profile });
  const booking = r.data.booking ? toBookingReportVM(r.data.booking) : null;
  const deals = toDealReportVM(r.data.deals, vm.period.within);
  return {
    range: vm.rangeLabel,
    ...(want.has("overview") ? overviewSaid(vm, booking, deals) : {}),
    ...lensesSaid(t, want, { campaigns, reviews, receptionist, people }),
  };
}

export const reportTool = defineRead({
  name: "report",
  description: `The Reports page for any window its period control picks -- a period (${PERIODS_SAID}: month is the days since the 1st), days picked (from and to, YYYY-MM-DD, at most ninety, ending today at the latest), or a shortcut (yesterday, last_week, last_month), 30d where none is named -- and only the lenses asked for (lenses: overview, campaigns, reviews, cold_email, receptionist, people; every one where none is named). The overview: messages answered by the receptionist, by a person and left unanswered, the median and p90 reply time (both include the hold the owner set before a reply goes out; reply_time.hold splits the replies against it: with no hold, as the hold ended, or later, and the most any took past it), calls and their minutes, new people, the escalation reasons, the change against the period before, a by-day series, the booking line (asked, then booked) where the calendar is read, the Deals section where deals are on, and the Campaigns lens, as the page says it: head is its sentence; figures are the people sent to, the share of the messages delivered, the share of those people who wrote back, and the yeses and stops after a campaign, each against the period before; funnel is what was sent, delivered, read (WhatsApp's alone) and answered, counted in messages (a person sent three is three messages here and one in figures); by_channel is the same by channel where more than one sent (read is a share of what went by WhatsApp alone: a text or an email keeps no read receipt); sources are the five that sent the most; window is the period's, from the database's ledger: held (who was held back, and why), runs_stopped (the runs that failed or were canceled), failed_sends (why sends failed after they left), by_message (who wrote back to each message), send_to_first_reply (how soon the first reply came) and wait_for_your_ok (how long approvals waited); stuck is what is stuck now, whatever period is picked: the runs waiting for your OK, the failed runs, the replies waiting on you, the messages Meta stopped and your WhatsApp number; a share is said only of five or more and a count under that, and a mix with nothing to draw says the page's words in empty; window is null where the database does not keep the ledger yet and stuck where it does not keep what is stuck, each with an error beside it where its read failed, and a part of window the database did not count is null too; campaigns says error where its numbers could not be read. The Reviews lens is in reviews: the sentence at its head and its figures as the page says them (the rating, the count, the reviews written against the period before) and, where the owner's Business Profile is connected, how many were answered and how fast, the mix of stars, and how many wait for a reply (held is how many of the oldest waiting hold a reply the receptionist wrote and did not post), the oldest five waiting in rows and the newest five in latest, each with its id; reviews says linked false where no Google listing is linked, and error where its numbers could not be read. The Reach-outs section is in reach_outs, as the page says it: strip is the emails the reach-outs wrote, the share that landed and the number that bounced, each against the period before; emails is what was written, delivered and bounced, counted in emails; businesses is the businesses written to and how many wrote back, were interested, booked or said no, counted in businesses as they stand now (each counts once, at the last email that wrote to it, and an outcome is set against nothing before); angles is who wrote back, as they stand now, by the opening of the last email; handed is the line on the businesses handed to the owner, null where none were, and empty says nothing was written; reach_outs is null where the workspace has no reach-out, and error where its numbers could not be read. The Receptionist lens is in receptionist, as the page says it: what became of the replies held before they went out (hold), what customers asked about (topics), the languages the receptionist wrote in where it wrote in more than one, how the calls someone spoke on ended, the booking link and how many of the people it went to have booked since (link), your first reply after a handover and the time to settle one (handover), the missed calls answered within an hour (missed), what came while the business was closed and how many of those the receptionist answered (closed), and what is stuck now (stuck: who waits on you, call-backs, the replies held back), with held_back giving the reasons the send door refused a reply; receptionist says available false where the database does not keep these numbers yet, and error where they could not be read. The People lens is in people, as the page says it: head is its sentence; window is the period, counted in people (one who wrote ten times is one): reached (who reached you, how many were new, the yeses won and the stops, each against the period before), channels (how they reached you), first_came (how the new ones first came), yeses and stops (who gave them), steps_done (the steps finished and how many on their day) and email_stopped (the addresses that stopped working); book is everyone as they stand now, whatever period is picked: wires (the ways they reach you), fresh (how long since they last wrote or called, with quiet saying how many have been quiet over 30 days), stuck (the steps overdue and due today, and the email that stopped working) and stand (how many said yes to messages, can receive offers, opted out or are quiet); a mix with nothing to draw says the page's words in empty; people says window null where the database does not keep the period's numbers yet, book null where the people could not be counted, available false where neither could be read, and error where they could not be read. Call it for how a period went or for a trend, naming only the lenses the question needs; the today tool has the day itself and its counts, and the Reports page on screen already holds this. An empty period says so in empty; a window the report cannot answer is an error, said in the page's words.`,
  input: z.object({
    period: z.enum(REPORT_PERIOD_IDS).optional().describe(`A period by name: ${PERIODS_SAID}.`),
    from: z.string().optional().describe("The first day of days picked, YYYY-MM-DD, with to."),
    to: z.string().optional().describe("Their last day, YYYY-MM-DD, today at the latest."),
    shortcut: z.enum(SHORTCUTS).optional().describe("yesterday, last_week or last_month, by the workspace's calendar."),
    lenses: z.array(z.enum(LENSES)).optional().describe("The lenses to read; every one where none is named."),
  }),
  examples: [
    { period: "30d" },
    { shortcut: "last_week", lenses: ["reviews"] },
    { from: "2026-09-01", to: "2026-09-20" },
  ],
  label: "Reading Reports",
  run: getReport,
});
