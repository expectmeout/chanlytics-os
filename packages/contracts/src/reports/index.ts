/** Reports: the receptionist's numbers over a period, the facts the page leads with, and the campaigns. */
export { BOOKED_NEEDS_TODAY, toBookingReportVM } from "./booking-report";
export type { BookingReportDto, BookingReportVM } from "./booking-report";
export { toCampaignReportVM } from "./campaign-report";
export type {
  CampaignDayDto,
  CampaignSourceDto,
  CampaignReportDto,
  CampaignPointVM,
  CampaignSourceVM,
  CampaignTotals,
  CampaignReportVM,
} from "./campaign-report";
export {
  fmtDay,
  daysWords,
  endedOn,
  quantile,
  priorOf,
  weekOf,
  reportHourWords,
  hoursOf,
  channelsOf,
  runningTotal,
  speedOf,
  callMoodTone,
  toReportVM,
  headlineOf,
  REPORT_CHANNELS,
  REPORT_RANGES,
  REPORT_WEEK_SHORT,
  REPORT_WEEK_LONG,
} from "./reports";
export type {
  ReportDayDto,
  ReportChannelKey,
  ReportChannelCounts,
  ReportDto,
  ReportPointVM,
  ReportBarVM,
  ReportSpeedPointVM,
  ReportWeekVM,
  ReportHoursVM,
  ReportChannelVM,
  ReportLinesVM,
  ReportVM,
} from "./reports";
export {
  REPORT_LENSES,
  LENS_ROUTES,
  lensRoute,
  isLensParam,
  lensOfRoute,
  reportsParamParts,
  reportsRouteParts,
  lensOf,
  lensesFor,
  lensIsShown,
  lensEmpty,
} from "./lenses";
export type { LensId, LensRow, LensRange, LensEmpty, LensWho } from "./lenses";
export { lensAnswerOf } from "./lens-answer";
export { toReviewsReportVM, REVIEWS_WAITING_SHOWN } from "./review-report";
export type { ReviewsReportDto, ReviewWaitingVM, ReviewsReportVM } from "./review-report";
export { reviewsWindowOf, reviewsAreOnRecord, isReviewsLedgerDto } from "./review-record";
export type { ReviewsLedgerDto } from "./review-record";
export { fmtSeconds, deltaOf, pointsDelta, compareWords, bookedTileOf } from "./report-tiles";
export type { ReportTileVM, ReportStripTile } from "./report-tiles";
export { metricWordsOf } from "./report-metrics";
export {
  REPORT_PERIOD_DEFAULT,
  REPORT_PERIOD_IDS,
  REPORT_PERIOD_STORAGE,
  REPORT_MOST_DAYS,
  isReportPeriod,
  isReportDays,
  fixedDaysOf,
  monthDaysAt,
  reportPeriodOf,
  reportRangeAsked,
  reportRangeKey,
  reportRangeOfKey,
  sameReportRange,
  reportDaysCount,
  reportDaysRefusal,
  reportDaysAsked,
} from "./report-periods";
export type { ReportPeriodId, ReportDays, ReportRange } from "./report-periods";
export { reportShortcuts, reportWindowOf, reportPickWords } from "./report-window";
export type { ReportWindowVM } from "./report-window";
export { toHeadlineVM, isReportDto } from "./report-headline";
export type { ReportHeadlineDto, ReportHeadlineVM } from "./report-headline";
export { holdOf, replyHoldDtoOf } from "./report-speed";
export type { ReportHoldVM, ReplyHoldDto } from "./report-speed";
export { closedOf } from "./report-closed";
export type { ReportArrivalDto, ReportProfile } from "./report-closed";
export { reportFacts } from "./report-facts";
export type { ReportFactVM } from "./report-facts";
export { toReachOutReportVM, reachOutDayWords } from "./reach-out-report";
export type {
  ReachOutReportCounts,
  ReachOutReportStepDto,
  ReachOutReportChainDto,
  ReachOutReportDomainDto,
  ReachOutReportDto,
  ReachOutFunnelRow,
  ReachOutAngleRow,
  ReachOutDomainRow,
  ReachOutSourceLine,
  ReachOutReportVM,
  ReachOutDayNumbers,
} from "./reach-out-report";
