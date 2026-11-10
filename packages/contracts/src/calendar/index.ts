/** The owner's calendar as the receptionist reads it: the feed's address, what is open, and the people in it. */
export {
  appointmentTitle,
  busyOfAppointments,
  daysWithAppointments,
  feedItemOfAppointment,
  feedMarksOf,
  feedWithRecord,
  itemOfAppointment,
  markOn,
  personOfAppointment,
  withoutVisitsRowsDraw,
} from "./appointment-item";
export type { AppointmentLike, FeedMark, PoolRecord } from "./appointment-item";
export {
  appointmentKeyOf,
  calendarParamParts,
  recordIdOf,
  recordKeyOf,
  visitDoor,
  visitLinkWords,
  visitRoute,
} from "./appointment-key";
export type { CalendarParam } from "./appointment-key";
export {
  BOOKING_DEFAULTS,
  closedOn,
  dayIntervals,
  describeOpenings,
  filterOpenings,
  freeWindows,
  hasHours,
  openAt,
  ROOM_DAYS,
  roomOf,
} from "./availability";
export type { BookingRulesLike, FreeWindowsInput, Opening } from "./availability";
export type { BookRoom } from "./availability";
export {
  appointmentKey,
  BOOKING_TOOL_IDS,
  BOOKING_TOOL_STEPS,
  BOOKING_TRY_NOTE,
  bookingCopyTest,
  bookingNoticeOf,
  bookingToolCalendar,
  bookingToolName,
  bookingToolOfAddress,
  bookingToolOptions,
  clientKeyOf,
  forwardingConfirmationOf,
  GMAIL_FORWARD_NOTE,
  isBookingTool,
  isNoticeHold,
  NOTICE_DEFAULT_LENGTH_MS,
  NOTICE_HOLD_WORDS,
  NOTICE_READ_MAX_TOKENS,
  NOTICE_SCHEMA,
  noticeAnswerOf,
  noticePrompt,
  sameVisitOnRecord,
} from "./booking-notice";
export type {
  BookingSighting,
  BookingTool,
  BookingToolCalendar,
  BookingToolWay,
  NoticeHold,
  NoticeKind,
  NoticeReading,
  VisitOnRecord,
} from "./booking-notice";
export { toCalendarVM } from "./calendar";
export type {
  CalendarDayDto,
  CalendarFeedDto,
  CalendarItemDto,
  CalendarNoticesDto,
  CalendarServiceDto,
  CalendarWeekDto,
  EarlierVisitsDto,
  HeldNoticeDto,
  MissedFollowUp,
  VisitMark,
  VisitOriginDto,
} from "./dto";
export { CALENDAR_FEED_DOOR, FREED_TIME_DOOR } from "./edge-doors";
export { parseIcs } from "./feed";
export type { BusyBlock, FeedAttendee, FeedItem, ParsedFeed, ParseOptions } from "./feed";
export {
  APPOINTMENT_SOURCES,
  APPOINTMENT_STATUSES,
  appointmentHolds,
  appointmentKeysOf,
  asksTheFeed,
  feedAppointmentRows,
  feedNamesOf,
  feedStillNames,
} from "./feed-appointments";
export type {
  AppointmentSource,
  AppointmentState,
  AppointmentStatus,
  FeedAppointmentRow,
  FeedNames,
} from "./feed-appointments";
export {
  calendarFeedKeyOf,
  FEED_CHECK_WORDS,
  FEED_GUIDES,
  FEED_MAX_BYTES,
  feedBodyProblem,
  feedProblemWords,
  feedUrlOk,
  fetchPublic,
  mailboxCalendarOf,
  offeringHorizon,
  previewHorizon,
  seasonHorizon,
} from "./feed-url";
export type { FeedFailure, FeedHorizon } from "./feed-url";
export {
  allVisitsIn,
  calendarOwnerOf,
  extractContacts,
  indexFeed,
  matchPerson,
  matchWordsOf,
  ownAddressesOf,
  personInText,
  SAME_VISIT_MS,
  visitsIn,
  visitsOf,
} from "./people/matching";
export type {
  EventContacts,
  FeedIndex,
  MatchVia,
  OwnAddresses,
  PersonLike,
  PersonMatch,
  Visit,
  Visits,
} from "./people/matching";
export {
  afterPersonRefused,
  describeVisits,
  guessName,
  peopleFromItems,
  toVisitDto,
  visitDateKey,
  visitDay,
  visitLine,
  visitStartTime,
  visitTime,
} from "./people/visits";
export type { CalendarPerson, PersonVisitsDto, VisitDto } from "./people/visits";
export { CALENDAR_RUN_SHEET_WORDS, CALENDAR_SHOW_WORDS, calendarRunMarksOf, runMarkShown } from "./runs";
export type {
  CalendarMomentDto,
  CalendarRunDto,
  CalendarRunItem,
  CalendarRunKind,
  CalendarRunMark,
  CalendarRunsDto,
} from "./runs";
export {
  foldName,
  matchService,
  needsConsultation,
  offerFor,
  offerLead,
  sameListed,
  serviceNamedIn,
} from "./service-offer";
export type { ConsultRules, ServiceLike, ServiceOffer } from "./service-offer";
export { coversSpan, frameOf, spanForView, windowFor } from "./views";
export type { CalendarView } from "./views";
export { bookedAfterAsk } from "./visit/booked-after-ask";
export {
  BOOKING_REQUEST_INSTRUCTION,
  BOOKING_REQUEST_REFUSALS,
  BOOKING_REQUEST_SCHEMA_FIELDS,
  BOOKING_REQUEST_WORDS,
  bookingRequestCardOf,
  type BookingRequestCardVM,
  type BookingRequestFields,
  bookingRequestRefusalOf,
  type BookingRequestTerms,
  otherTimeWords,
  type RequestedBooking,
  requestedBookingOf,
  slotLong,
  slotNear,
  slotShort,
  takesBookingRequests,
} from "./visit/booking-request";
export { calendarPersonFactsOf, calendarPersonOf } from "./visit/calendar-person-facts";
export type { CalendarPersonFactsDto, CalendarPersonVM } from "./visit/calendar-person-facts";
export {
  changeFreesATime,
  FREED_TIME_REFUSALS,
  freedTimeOf,
  freedTimesUnoffered,
  freedTimeTaken,
  freedTimeWords,
} from "./visit/freed-time";
export type {
  FreedTimeCalendar,
  FreedTimeEvent,
  FreedTimeLine,
  FreedTimeOffer,
  FreedTimeRefusal,
  FreedTimeVerdict,
  StandingTime,
} from "./visit/freed-time";
export { visitTitleWithout } from "./visit/service";
export type {
  CalendarBandVM,
  CalendarBlockVM,
  CalendarClosureVM,
  CalendarDayVM,
  CalendarServiceVM,
  CalendarVM,
  CalendarWindowVM,
} from "./vm";
export {
  ADD_TO_PEOPLE_WORDS,
  addToPeopleOf,
  CALENDAR_FEED_WORDS,
  calendarHoursLines,
  clockLabel,
  closureDatesLabel,
  closuresFrom,
  eventText,
  feedNotes,
  feedSourceLabel,
  readAgoLabel,
  ruleParts,
  rulesLine,
  visitMarkOfDto,
} from "./words/labels";
export type { CalendarFeedHealth, CalendarFeedNoteVM, VisitWord } from "./words/labels";
export {
  sightingStands,
  VISIT_ASK_WORDS,
  VISIT_REFUSALS,
  VISIT_WORDS,
  visitActsOf,
  visitLineOf,
  visitLineOfBlock,
  visitStands,
  visitStateOf,
} from "./words/visit";
export type { VisitLineInput, VisitLineVM, VisitStateTone, VisitStateVM } from "./words/visit";
