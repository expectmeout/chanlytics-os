/** Reports: the receptionist's numbers over a period, the facts the page leads with, and the campaigns. */
export { BOOKED_NEEDS_TODAY, toBookingReportVM } from "./booking-report";
export type { BookingReportDto, BookingReportVM } from "./booking-report";
export { toCampaignReportVM } from "./campaign-report";
export type {
  CampaignDayDto,
  CampaignPointVM,
  CampaignReportDto,
  CampaignReportVM,
  CampaignSourceDto,
  CampaignSourceVM,
  CampaignTotals,
} from "./campaign-report";
export { toCampaignLensVM } from "./campaigns/lens";
export type { CampaignFigureVM, CampaignLensInput, CampaignLensVM } from "./campaigns/lens";
export { toReachOutLensVM } from "./campaigns/reach-out-lens";
export type { ReachOutLensSourceLine, ReachOutLensVM } from "./campaigns/reach-out-lens";
export { campaignLedgerDtoOf, isCampaignLedgerSeriesDto, isCampaignStuckRawDto } from "./campaigns/record";
export type {
  CampaignLedgerDto,
  CampaignLedgerSeriesDto,
  CampaignNumberDto,
  CampaignStuckNowDto,
  CampaignStuckRawDto,
} from "./campaigns/record";
export { closedOf } from "./closed";
export type { ReportArrivalDto, ReportProfile } from "./closed";
export {
  channelsOf,
  daysWords,
  endedOn,
  fmtDay,
  hoursOf,
  priorOf,
  quantile,
  REPORT_CHANNELS,
  REPORT_RANGES,
  REPORT_WEEK_LONG,
  REPORT_WEEK_SHORT,
  reportHourWords,
  weekOf,
} from "./dtos";
export { dayPointOf } from "./dtos";
export type {
  ReportBarVM,
  ReportChannelCounts,
  ReportChannelKey,
  ReportChannelVM,
  ReportDayDto,
  ReportDto,
  ReportHoursVM,
  ReportLinesVM,
  ReportPointVM,
  ReportSpeedPointVM,
  ReportVM,
  ReportWeekVM,
} from "./dtos";
export { isReportDto, toHeadlineVM } from "./headline";
export type { ReportHeadlineDto, ReportHeadlineVM } from "./headline";
export {
  adsReportRoute,
  campaignReportRoute,
  isAdsScope,
  isLensParam,
  LENS_ROUTES,
  lensEmpty,
  lensesFor,
  lensIsShown,
  lensOf,
  lensOfRoute,
  lensRoute,
  REPORT_LENSES,
  reportsParamParts,
  reportsRouteParts,
  reviewRoute,
} from "./lenses";
export { CAMPAIGN_SCOPE_ALL, campaignScopeKey, campaignScopeOfKey } from "./lenses";
export type { LensEmpty, LensId, LensRange, LensRow, LensScope, LensWho, ReportsParts } from "./lenses";
export type { CampaignScope } from "./lenses";
export { metricWordsOf } from "./metrics";
export { isUncounted } from "./mix";
export type { RateRowVM } from "./mix";
export { peopleNowOf } from "./people/now";
export type { PeopleNowDto } from "./people/now";
export { isPeopleSeriesDto, peopleDtoOf } from "./people/record";
export type { PeopleDto, PeopleSeriesDto } from "./people/record";
export { toPeopleReportVM } from "./people/report";
export type { PeopleFigureVM, PeopleReportVM } from "./people/report";
export { PEOPLE_RHYTHM_UNIT } from "./people/words/heads";
export {
  CAMPAIGNS_RESULTS_PERIOD,
  fixedDaysOf,
  isReportDays,
  isReportPeriod,
  monthDaysAt,
  REPORT_MOST_DAYS,
  REPORT_PERIOD_DEFAULT,
  REPORT_PERIOD_IDS,
  REPORT_PERIOD_STORAGE,
  reportDaysAsked,
  reportDaysCount,
  reportDaysRefusal,
  reportPeriodOf,
  reportRangeAsked,
  reportRangeKey,
  reportRangeOfKey,
  sameReportRange,
} from "./periods";
export type { ReportDays, ReportPeriodId, ReportRange } from "./periods";
export { chainTotalsFromReport, chainTotalsOf, reachOutDayWords } from "./reach-out-report";
export type {
  ReachOutChainTotalsDto,
  ReachOutDayNumbers,
  ReachOutMailboxRow,
  ReachOutReportChainDto,
  ReachOutReportCounts,
  ReachOutReportDto,
  ReachOutReportMailboxDto,
  ReachOutReportStepDto,
} from "./reach-out-report";
export { isReceptionistSeriesDto, MISSED_CALL_TOUCH_WORDS, receptionistDtoOf } from "./receptionist/record";
export type { ReceptionistDto, ReceptionistSeriesDto } from "./receptionist/record";
export { toReceptionistReportVM } from "./receptionist/report";
export type { ReceptionistReportVM } from "./receptionist/report";
export { headlineOf, runningTotal, speedOf, toReportVM } from "./reports";
export { periodWords } from "./reports";
export { isReviewsLedgerDto, reviewsAreOnRecord, reviewsWindowOf, weekTotals } from "./review-record";
export type { ReviewsLedgerDto } from "./review-record";
export { REVIEWS_WAITING_SHOWN, toReviewsReportVM } from "./review-report";
export type { ReviewsReportDto, ReviewsReportVM, ReviewWaitingVM } from "./review-report";
export { holdOf, replyHoldDtoOf } from "./speed";
export type { ReplyHoldDto, ReportHoldVM } from "./speed";
export {
  BOOKED_ENDED_META,
  bookedTileOf,
  compareWords,
  deltaOf,
  fmtSeconds,
  isThinShare,
  pointsDelta,
  REPORT_MIN_N,
  shareSaid,
} from "./tiles";
export { beforeWords, messagesAnsweredWords } from "./tiles";
export type { ReportStripTile, ReportTileVM } from "./tiles";
export { reportPickWords, reportShortcuts, reportWindowOf } from "./window";
export type { ReportWindowVM } from "./window";
