/** The owner's calendar as the receptionist reads it: the feed's address, what is open, and the people in it. */
export { zoneOffsetMs, localToUtcMs, clockInZone, dayInZone, dayPlusInZone, WEEKDAY_KEYS } from "./zone-math";
export { parseIcs } from "./feed";
export { appointmentKeyOf, recordKeyOf, recordIdOf } from "./appointment-key";
export {
  APPOINTMENT_SOURCES,
  APPOINTMENT_STATUSES,
  appointmentHolds,
  appointmentKeysOf,
  feedAppointmentRows,
} from "./feed-appointments";
export type { AppointmentSource, AppointmentState, AppointmentStatus, FeedAppointmentRow } from "./feed-appointments";
export type { BusyBlock, FeedAttendee, FeedItem, ParsedFeed, ParseOptions } from "./feed";
export {
  dayIntervals,
  closedOn,
  openAt,
  hasHours,
  freeWindows,
  filterOpenings,
  describeOpenings,
  BOOKING_DEFAULTS,
} from "./availability";
export type { BookingRulesLike, Opening, FreeWindowsInput } from "./availability";
export {
  sameListed,
  matchService,
  needsConsultation,
  offerFor,
  offerLead,
  foldName,
  serviceNamedIn,
} from "./service-offer";
export type { ServiceLike, ConsultRules, ServiceOffer } from "./service-offer";
export {
  feedUrlOk,
  fetchPublic,
  feedProblemWords,
  feedBodyProblem,
  offeringHorizon,
  seasonHorizon,
  previewHorizon,
  FEED_GUIDES,
  FEED_CHECK_WORDS,
  FEED_MAX_BYTES,
} from "./feed-url";
export type { FeedFailure, FeedHorizon } from "./feed-url";
export {
  isBookingTool,
  bookingToolName,
  bookingToolOfAddress,
  bookingNoticeOf,
  NOTICE_SCHEMA,
  NOTICE_READ_MAX_TOKENS,
  noticePrompt,
  isNoticeHold,
  NOTICE_DEFAULT_LENGTH_MS,
  noticeAnswerOf,
  clientKeyOf,
  appointmentKey,
  SAME_VISIT_MS,
  BOOKING_TOOL_IDS,
  bookingToolCalendar,
  bookingToolOptions,
  BOOKING_TOOL_STEPS,
  GMAIL_FORWARD_NOTE,
  BOOKING_TRY_NOTE,
  NOTICE_HOLD_WORDS,
  forwardingConfirmationOf,
} from "./booking-notice";
export type {
  BookingTool,
  BookingToolCalendar,
  BookingToolWay,
  NoticeKind,
  NoticeHold,
  NoticeReading,
} from "./booking-notice";
export {
  appointmentTitle,
  busyOfAppointments,
  feedItemOfAppointment,
  personOfAppointment,
  itemOfAppointment,
  withoutVisitsRowsDraw,
  daysWithAppointments,
  feedMarksOf,
  feedWithRecord,
  markOn,
} from "./appointment-item";
export type { AppointmentLike, FeedMark, PoolRecord } from "./appointment-item";
export type {
  CalendarItemDto,
  CalendarDayDto,
  CalendarFeedDto,
  CalendarNoticesDto,
  HeldNoticeDto,
  CalendarServiceDto,
  CalendarWeekDto,
  VisitMark,
} from "./calendar-dto";
export { shiftKey, mondayOf, isDayKey, monthSpan, shiftMonth, monthLabelOf, zoneMidnight } from "./day-keys";
export {
  clockLabel,
  closureDatesLabel,
  closuresFrom,
  readAgoLabel,
  ruleParts,
  rulesLine,
  feedNotes,
  hoursLines,
  CALENDAR_FEED_WORDS,
  VISIT_WORDS,
  VISIT_REFUSALS,
  visitStateOf,
  visitActsOf,
} from "./calendar-words";
export type { CalendarFeedNoteVM, CalendarFeedHealth, VisitWord } from "./calendar-words";
export type {
  CalendarBlockVM,
  CalendarBandVM,
  CalendarWindowVM,
  CalendarDayVM,
  CalendarServiceVM,
  CalendarClosureVM,
  CalendarVM,
} from "./calendar-vm";
export { serviceOf, toCalendarVM } from "./calendar";
export { spanForView, windowFor, coversSpan, frameOf } from "./calendar-views";
export type { CalendarView } from "./calendar-views";
export {
  calendarOwnerOf,
  ownAddressesOf,
  extractContacts,
  personInText,
  matchPerson,
  indexFeed,
  allVisitsIn,
  visitsIn,
  visitsOf,
  visitDay,
  visitTime,
  visitDateKey,
  visitStartTime,
  visitLine,
  describeVisits,
  feedSourceLabel,
  eventText,
  toVisitDto,
  guessName,
  peopleFromItems,
  afterPersonRefused,
  bookedAfterAsk,
} from "./calendar-people";
export type {
  EventContacts,
  PersonLike,
  MatchVia,
  PersonMatch,
  OwnAddresses,
  Visit,
  Visits,
  FeedIndex,
  VisitDto,
  PersonVisitsDto,
  CalendarPerson,
} from "./calendar-people";
