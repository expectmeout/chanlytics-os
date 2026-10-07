/** The owner's calendar as the receptionist reads it: the feed's address, what is open, and the people in it. */
export { zoneOffsetMs, localToUtcMs, clockInZone, dayInZone, dayPlusInZone, WEEKDAY_KEYS } from "./zone-math";
export { parseIcs } from "./feed";
export { appointmentKeyOf } from "./appointment-key";
export {
  APPOINTMENT_SOURCES,
  APPOINTMENT_STATUSES,
  appointmentHolds,
  appointmentKeysOf,
  feedAppointmentRows,
  serviceNamedIn,
} from "./appointments";
export type { AppointmentSource, AppointmentState, AppointmentStatus, FeedAppointmentRow } from "./appointments";
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
export { sameListed, matchService, needsConsultation, offerFor, offerLead, foldName } from "./service-offer";
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
export type {
  CalendarItemDto,
  CalendarDayDto,
  CalendarFeedDto,
  CalendarServiceDto,
  CalendarWeekDto,
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
} from "./calendar-words";
export type { CalendarFeedNoteVM, CalendarFeedHealth } from "./calendar-words";
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
  visitAnswersAsk,
  toBookingReportVM,
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
  BookingReportDto,
  BookingReportVM,
} from "./calendar-people";
