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
  adsReportRoute,
  campaignReportRoute,
  isAdsScope,
  lensRoute,
  reviewRoute,
  isLensParam,
  lensOfRoute,
  reportsParamParts,
  reportsRouteParts,
  lensOf,
  lensesFor,
  lensIsShown,
  lensEmpty,
} from "./lenses";
export type { LensId, LensRow, LensRange, LensEmpty, LensWho, LensScope, ReportsParts } from "./lenses";
export { CAMPAIGN_SCOPE_ALL, campaignScopeKey, campaignScopeOfKey } from "./lenses";
export type { CampaignScope } from "./lenses";
export { CAMPAIGN_CHOICE_GROUPS, CAMPAIGN_SCOPE_WORDS, campaignChoicesOf, campaignOneOf } from "./campaign-one";
export type {
  CampaignChoice,
  CampaignOneInput,
  CampaignOnePointVM,
  CampaignOneSendVM,
  CampaignOneStepVM,
  CampaignOneVM,
} from "./campaign-one";
export { lensAnswerOf } from "./lens-answer";
export { toReviewsReportVM, REVIEWS_WAITING_SHOWN } from "./review-report";
export type { ReviewsReportDto, ReviewWaitingVM, ReviewsReportVM } from "./review-report";
export { reviewsWindowOf, reviewsAreOnRecord, isReviewsLedgerDto } from "./review-record";
export type { ReviewsLedgerDto } from "./review-record";
export {
  fmtSeconds,
  deltaOf,
  pointsDelta,
  compareWords,
  bookedTileOf,
  BOOKED_ENDED_META,
  REPORT_MIN_N,
  isThinShare,
  shareSaid,
} from "./report-tiles";
export type { ReportTileVM, ReportStripTile } from "./report-tiles";
export { metricWordsOf } from "./report-metrics";
export { toReceptionistReportVM } from "./receptionist/receptionist-report";
export type { ReceptionistReportVM } from "./receptionist/receptionist-report";
export {
  MISSED_CALL_TOUCH_WORDS,
  isReceptionistSeriesDto,
  receptionistDtoOf,
} from "./receptionist/receptionist-record";
export type { ReceptionistDto, ReceptionistSeriesDto } from "./receptionist/receptionist-record";
export { peopleNowOf } from "./people/people-now";
export type { PeopleNowDto } from "./people/people-now";
export { isPeopleSeriesDto, peopleDtoOf } from "./people/people-record";
export type { PeopleDto, PeopleSeriesDto } from "./people/people-record";
export { toPeopleReportVM } from "./people/people-report";
export type { PeopleFigureVM, PeopleReportVM } from "./people/people-report";
export { PEOPLE_RHYTHM_UNIT } from "./people/people-words";
export {
  CAMPAIGNS_RESULTS_PERIOD,
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
export { isCampaignLedgerSeriesDto, isCampaignStuckRawDto, campaignLedgerDtoOf } from "./campaigns/campaign-record";
export type {
  CampaignLedgerDto,
  CampaignLedgerSeriesDto,
  CampaignNumberDto,
  CampaignStuckNowDto,
  CampaignStuckRawDto,
} from "./campaigns/campaign-record";
export { toReachOutLensVM } from "./campaigns/reach-out-lens";
export type { ReachOutLensVM, ReachOutLensSourceLine } from "./campaigns/reach-out-lens";
export { toCampaignLensVM } from "./campaigns/campaign-lens";
export type { CampaignFigureVM, CampaignLensInput, CampaignLensVM } from "./campaigns/campaign-lens";
export { isUncounted } from "./report-mix";
export type { RateRowVM } from "./report-mix";
export { reachOutDayWords, chainTotalsOf, chainTotalsFromReport } from "./reach-out-report";
export type {
  ReachOutChainTotalsDto,
  ReachOutReportCounts,
  ReachOutReportStepDto,
  ReachOutReportChainDto,
  ReachOutReportMailboxDto,
  ReachOutReportDto,
  ReachOutMailboxRow,
  ReachOutDayNumbers,
} from "./reach-out-report";
