/**
 * Every public name, named: a new export is a line here, never an export * (repo/contracts-barrels.test.mjs).
 *
 * Workspace scope: the package's barrel names each export and holds no statement; each repository keeps its own scope.
 */
export {
  emitEvent,
  recordEvent,
  subjectsWith,
  recordActivation,
  relayEvents,
  eventOfDelivery,
  subscriptionPaused,
  deliveryOf,
  settleDelivery,
} from "./events";
export type { EmittedKind, EventData, DeliveredEvent, DeliveryRow } from "./events";
export {
  recordModelUsage,
  workspaceMayUseModels,
  aiFailuresHour,
  purgeAiUsage,
  usageMonth,
  keepModelTurn,
  scrubModelTurns,
} from "./ai-usage";
export type { AiFailures, UsageMonthRow, ModelTurnKept } from "./ai-usage";
export { keepInvoiceAmount } from "./billing/events";
export { applyBilling } from "./billing/account";
export type { BillingPatch, BillingExpectation } from "./billing/account";
export { migrationHead, platformDay } from "./ops";
export { ERASURE_LEGS, ERASURE_STRATEGIES } from "./erasure-registry";
export type { ErasureLeg, ErasureStrategy } from "./erasure-registry";
export type { MigrationHead, PlatformDayPromises } from "./ops";
export { signUpOnPublicKey, inviteUserByEmail, listSecondFactors, deleteSecondFactor } from "./auth";
export { addToWaitlist, refreshWaitlistRow, waitlistWaiting, markWaitlistInvited } from "./waitlist";
export { createServiceClient } from "./service-client";
export { observeDb, namedFetch, touchOfCall, DB_REQUEST_HEADER } from "./observe";
export type { DbLog, DbObserver, DbTouch } from "./observe";
export { tenantDb, platformWide } from "./tenant-db";
export type { TenantDb } from "./tenant-db";
export type { ServiceClientConfig } from "./service-client";
export {
  ingestInbound,
  AnswerNotKept,
  markProcessed,
  stampHandled,
  recordOutbound,
  resolveOutboundTarget,
  resolveOutboundTargetForContact,
  wireRowOf,
  countSentToday,
  recordStatusByExternalId,
  messageByExternalId,
  keepMessageCost,
  recordEchoAndPause,
  pauseConversation,
} from "./repositories/ingest";
export type { IngestInboundParams, IngestResult, OutboundTarget } from "./repositories/ingest";
export {
  mailboxById,
  mailboxFor,
  ingestInboundEmail,
  sentEmailWithMessageId,
  stampMailboxReceived,
  mailboxOfTenant,
  keepForwardingConfirmation,
  clearForwardingConfirmation,
  lastInboundEmail,
  lastOutboundEmailSubject,
  answeredReachOutEmail,
  stampEmailSent,
  stampEmailLeftAs,
  sentEmailOf,
  stampEmailComplaint,
  recordEmailNo,
  recordEmailStatus,
  suppressEmailOf,
} from "./repositories/email";
export type { MailboxRow, IngestEmailParams, InboundEmailFacts } from "./repositories/email";
export {
  emailOffersPause,
  pauseEmailOffers,
  emailOfferCounts,
  setEmailOffersYes,
  setEmailUnsubscribed,
  stopAllMessages,
  offerLanguageOf,
  offersEmailReach,
} from "./repositories/campaigns/email-offers";
export type { Unsubscribed } from "./repositories/campaigns/email-offers";
export {
  offersAnswerOf,
  recordCarrierOptOut,
  recordLateCarrierOptOut,
  recordWhatsAppOffersStop,
} from "./repositories/campaigns/offers-answer";
export type { LateCarrierStop } from "./repositories/campaigns/offers-answer";
export {
  failStrandedRun,
  strandedRuns,
  waitingPlaybookRuns,
  cancelBroadcastFrom,
  recordSystemDecision,
  waitingRunsOf,
  runsNamed,
} from "./repositories/campaigns/stranded-runs";
export type { StrandedRun, WaitingPlaybookRun, WaitingRunRow } from "./repositories/campaigns/stranded-runs";
export {
  mailboxConnectionsOf,
  mailboxConnectionOf,
  liveMailboxByAddress,
  liveMailboxByWatch,
  mailboxesToTend,
  connectMailbox,
  patchMailboxConnection,
  putMailboxCredentials,
  getMailboxCredentials,
  dropMailboxCredentials,
  mailboxCountsOf,
  stampEmailFromMailbox,
} from "./repositories/mailboxes/connections";
export type { MailboxConnectionRow, ConnectRefusal } from "./repositories/mailboxes/connections";
export {
  takeMailboxSync,
  endMailboxSync,
  keepMailboxWatch,
  knownThreads,
  mailboxConnectionById,
  sentEmailIdByMessageId,
} from "./repositories/mailboxes/sync";
export {
  outreachFactsOf,
  addressesSuppressed,
  reachOutReplyOf,
  replyReadingOf,
  takeReplyRead,
  applyReplyReading,
  claimReplyTell,
  markReplyDraft,
  repliesFor,
  replyReadingRefOf,
  replyUndoableOf,
  undoReplyReading,
  markReplyTold,
  resolveEscalationByReason,
  archiveConversation,
  reachOutDayDue,
} from "./repositories/outreach";
export type {
  OutreachFactsRow,
  ReachOutReplyOf,
  ReplyReadingRow,
  ReplyListRow,
  ReachOutDayDue,
} from "./repositories/outreach";
export { mailboxCapacityOf, mailboxCapacityFrom, dueMailboxes } from "./repositories/mailboxes/day";
export type { MailboxCapacity, DueMailbox } from "./repositories/mailboxes/day";
export {
  reachOutAudience,
  reachOutPerson,
  claimSends,
  moveSend,
  reachOutFollowers,
  queuedOutcomes,
  stuckClaims,
  staleSends,
  closedRunSends,
  finishableRuns,
  writtenEmails,
  withdrawEmail,
  monthSent,
  insertQueuedEmail,
  writtenEmail,
  sendJobScheduled,
  sendStanding,
  emailWordsOf,
  workspaceNameAndConfig,
  leadSlotsOf,
  contactEmailOf,
  sendNow,
  runSending,
  runHanded,
  parentEmailOf,
  leadAddressBounced,
  leadWritten,
  recordCheck,
  workspaceMaySpend,
  workspaceAbout,
} from "./repositories/reach-out";
export type {
  ReachOutSendRow,
  ReachOutSendInsert,
  AudienceLead,
  PersonForSend,
  FollowerLead,
  QueuedOutcome,
  MessageInsert,
  WrittenEmail,
  SendStanding,
  ParentEmail,
} from "./repositories/reach-out";
export {
  reachOutAdd,
  leadMemberLater,
  leadPileCounts,
  reachOutChainPeople,
  reachOutPeopleCounts,
  leadsBackToday,
  reachOutLeaveOut,
  reachOutSources,
  reachOutFedByOf,
} from "./repositories/campaigns/reach-out-leads";
export type { DoorResult, ReachOutAddAnswer } from "./repositories/campaigns/reach-out-leads";
export {
  claimDrafts,
  chainDraftLoad,
  draftFactsOf,
  draftsWaiting,
  ownerSendFactsOf,
  sendSaid,
  replySaid,
  leadReplyFactsOf,
} from "./repositories/campaigns/reach-out-drafts";
export type {
  DraftLoad,
  DraftWaitingRow,
  SendSaidAnswer,
  ReplySaidAnswer,
  LeadReplyFacts,
  OwnerSendFacts,
} from "./repositories/campaigns/reach-out-drafts";
export {
  uncheckedSends,
  uncheckedWaiting,
  reachOutRecord,
  heldStale,
  releaseUnavailableHolds,
  takeCheckAttempt,
} from "./repositories/campaigns/reach-out-check";
export type { ReachOutRecordRow, UncheckedSend } from "./repositories/campaigns/reach-out-check";
export {
  reachOutStepsOf,
  reachOutRootOf,
  reachOutSendRefOf,
  emailWordsFrom,
  emailWordsByTemplate,
  searchesByIds,
  runsWaitingOf,
  reachOutRunSendsOf,
  stampReachOutStep,
  recheckSends,
  outreachModeOf,
  tenantZoneOf,
  heldNoticeDue,
  runWaitingCounts,
  markHeldNotice,
  leadNamesByIds,
  handRun,
  saveReachOutChain,
} from "./repositories/reach-out-sheet";
export type {
  ReachOutStepRow,
  ReachOutSaved,
  ReachOutRunSend,
  OutreachMode,
  HeldNoticeMark,
  HeldNoticeRun,
  HandItem,
} from "./repositories/reach-out-sheet";
export {
  reportSeries,
  campaignSeries,
  reviewsLedger,
  receptionistSeries,
  peopleSeries,
  campaignLedger,
  campaignStuck,
  reachOutReport,
  ReportWindowNotReadable,
  playbookTotals,
  runCounts,
  templateSends,
  reachOutChainTotals,
} from "./repositories/reports/report-series";
export type { ReportWindow } from "./repositories/reports/report-series";
export { firstReplies } from "./repositories/reports/first-replies";
export { notePageVitals, pageSpeed, pageSpots, pageVitalsP75 } from "./repositories/reports/page-vitals";
export {
  forgetNotification,
  noticeKept,
  noticeFor,
  mailSent,
  holdFactsOf,
  holdTold,
  personFactsOf,
  optOutTold,
  eventTold,
  bookedVisitsOf,
  feedAdditionsWith,
  twinTold,
  memberJoinedOf,
  memberEmailOf,
  reviewRowsByGoogleId,
  reviewsNamed,
  unreadOfReaders,
  olderUnreadFor,
  closeMendedNotices,
} from "./repositories/notices/notifications";
export type { KeptNotice } from "./repositories/notices/notifications";
export {
  activityTokensOf,
  forgetActivityTokens,
  forgetEveryPhone,
  memberAlertsOf,
  setMemberPushOff,
  membersPushedFor,
  pushNamesFor,
  memberViewsOf,
} from "./repositories/notices/member-alerts";
export type { MemberAlertsRow } from "./repositories/notices/member-alerts";
export { threadIdsWaitingOnYou } from "./repositories/waiting-on-you";
export { reviewLinkOf, workspacePaused } from "./repositories/campaigns/workspace";
export { momentSchedules, runsInSpan } from "./repositories/campaigns/calendar-runs";
export {
  followUpsDue,
  leaveSequence,
  sequenceRow,
  sequenceOfPart,
  sequenceOverview,
  sequenceStepsOf,
  sequencePeopleOf,
  sequenceHistoryOf,
  saveSequenceStep,
  removeSequenceStep,
  setSequenceStepWords,
  takeOutOfSequence,
  cancelSequenceBatch,
  makeSequence,
  discardSequence,
  sequencesOfPerson,
} from "./repositories/campaigns/sequences";
export type { SequenceDoorAnswer } from "./repositories/campaigns/sequences";
export type { MomentScheduleRow, SpanRunRow } from "./repositories/campaigns/calendar-runs";
export {
  resolveChannelDetailed,
  resolveChannel,
  oldestActiveChannel,
  activeWhatsappNumbers,
  whatsappLineOf,
} from "./repositories/routing";
export {
  whatsappChannelFacts,
  textLineFacts,
  playbookChannels,
  playbookForChannels,
  playbookForChange,
  runningTwins,
  followUpOnFile,
  queuedRecipients,
  runGoesByOthers,
  campaignMonthSent,
  holdRecipients,
} from "./repositories/campaigns/campaign-channels";
export type { RoutedChannel, ChannelLookup, WhatsappNumberRow } from "./repositories/routing";
export {
  ingestCall,
  linkCallMessage,
  callsOwedAnAnalysis,
  callersOf,
  setCallRecording,
  recordCallNote,
  claimCallNotification,
  claimCallActivity,
  callerNameOf,
  isWorkspaceCall,
} from "./repositories/calls";
export type { NormalizedCallInput, IngestCallResult } from "./repositories/calls";
export {
  assembleHistory,
  readThreadState,
  openConversation,
  ourLastWire,
  textReached,
  readLeadContext,
  readDealForPhone,
  notesForReceptionist,
  describeLead,
  HISTORY_COLUMNS,
  searchMessages,
  messageSenders,
  repliedTo,
  failedMessageErrors,
} from "./repositories/thread";
export type { ThreadTurn, PgThreadState, LeadContext, MessageHit, MessageSender } from "./repositories/thread";
export {
  insertVoiceSession,
  readVoiceSession,
  readVoiceSessionByConversation,
  claimVoiceTurn,
  endVoiceSession,
  moveVoiceSessionContext,
} from "./ask-voice-session";
export type { VoiceSessionRow, NewVoiceSession, VoiceEndReason } from "./ask-voice-session";
export {
  claimIdempotencyKey,
  takeIdempotencyKey,
  releaseIdempotencyKey,
  keepIdempotencyReceipt,
} from "./repositories/idempotency";
export type { IdempotencyHold, IdempotencyClaim } from "./repositories/idempotency";
export {
  readJobToRequeue,
  hasNewerCopy,
  assembleBroadcast,
  approveBroadcast,
  claimQueuedSend,
  releaseQueuedSend,
  failQueuedSend,
} from "./jobs";
export { keepProviderEvent, providerEventOf, scrubProviderEvents } from "./provider-events";
export type { DeliveryProvider, KeptDelivery, KeptDeliveryRow } from "./provider-events";
export type { JobToRequeue, AssembleDecision } from "./jobs";
export {
  claimControl,
  releaseControl,
  takeOverThread,
  handBackThread,
  CALL_CONTROL_S,
  claimReplyTurn,
  holdsReplyTurn,
  withdrawQueued,
  withdrawAiDrafts,
  memberWithdrawDrafts,
  memberWithdrawMessage,
  callBackMessage,
  openEscalation,
} from "./repositories/control";
export type {
  ControlHolder,
  ControlOutcome,
  TakenOver,
  HandedBack,
  WithdrawReason,
  CalledBack,
} from "./repositories/control";
export {
  templatesFor,
  templatesToSend,
  templateIdOf,
  templatesNamed,
  templateStatusOf,
  messageSlots,
  heldMessageOf,
  messageVersionRowsOf,
  ownVersionsFiled,
  saveTemplateVersion,
  createMessageVersion,
  isMissingDoor,
  removeTemplateVersion,
  setTemplateQuality,
} from "./repositories/templates";
export type {
  MessageVariable,
  MessageVersionRow,
  TemplateRow,
  TemplateToSend,
  VersionRef,
} from "./repositories/templates";
export {
  getTenantConfig,
  getTenantConfigAsMember,
  putTenantConfig,
  markCalendarFeedKept,
  listPolicies,
  setPolicyMode,
  personReplyMode,
  setPersonReplyMode,
  workspaceAnswersOnItsOwn,
  workspaceOpenToCustomers,
  publicWorkspaceBySlug,
  workspacePublicSlug,
  workspaceNamed,
  workspaceZoneOf,
  membershipCountOf,
  workspaceIdsOf,
  createWorkspaceFn,
  lineForwardingSet,
  setWorkspaceLogo,
  updatePlaybook,
  removePlaybook,
  startPlaybook,
  writePlaybookChange,
} from "./repositories/control-plane";
export type {
  TenantConfigRow,
  PutTenantConfigResult,
  PolicyRecord,
  CreateWorkspaceArgs,
  LineForwardingArgs,
  PlaybookPatch,
  PlaybookToStart,
  OpenToCustomersRead,
  PublicWorkspaceRead,
} from "./repositories/control-plane";
export {
  PEOPLE_PAGE,
  IDS_PER_READ,
  namesOfPeople,
  personDecisions,
  peoplePage,
  personRow,
  addPersonNote,
  logPersonCall,
  peopleCursorOf,
  everyoneIn,
  everyoneOnceIn,
  erasureDigests,
  scrubPersonNotes,
  mergePeople,
  keptPersonOf,
  recordConsent,
  addPersonByHand,
  resolvePerson,
  PERSON_FORGOTTEN,
  openDoubtsOf,
  doubtOn,
  dismissPersonDoubt,
  contactSeen,
  markContact,
  adoptPersonName,
  undoPersonName,
  declinePersonName,
  joinPersonToLead,
  leavePersonLead,
  seePersonNote,
  peopleAtLead,
  signersOf,
} from "./repositories/people";
export type {
  PeopleCursor,
  PersonCallArgs,
  PersonNameAnswer,
  ResolvePersonInput,
  ResolvedPerson,
} from "./repositories/people";
export {
  savedListsFor,
  listMemberIds,
  savedListFor,
  listRow,
  createList,
  renameList,
  setListRule,
  addToList,
  dropFromList,
  archiveList,
  playbooksOnList,
  deleteList,
} from "./repositories/lists";
export type { SavedListRow, ListRow, WriteError } from "./repositories/lists";
export { activitySubjects } from "./events";
export type { ActivitySubject, ActivitySubjects } from "./events";
export { touchesSince, recentTouches, followUpTouchesSince, touchIndex } from "./repositories/touches";
export type { Touch, TouchIndex } from "./repositories/touches";
export { yesesSince, recordDeal } from "./repositories/deals";
export type { YesRow, DealMove } from "./repositories/deals";
export { exportSectionPages, personExportPages } from "./repositories/workspace-export";
export type { ExportPage, ExportSectionPages, PersonExportPages } from "./repositories/workspace-export";
export {
  getOwnPartner,
  sessionHoldsPartnerSeat,
  getPartnerBroughtCount,
  getPartnerBalance,
  getPartnerLetters,
  setPartnerLetters,
  becomePartner,
  getPartnerWorkspaces,
  getPlatformPartners,
  setPartnerStanding,
  markPartnerPaid,
  setPartnerStatus,
  recordPartnerSecondFactorReset,
  createWorkspaceForBusiness,
  resendHandover,
  getOpenHandovers,
  acceptHandover,
  declineHandover,
  getPartnerHandovers,
  getHandoverInvite,
  invitePartner,
  withdrawPartnerInvite,
  getWorkspacePartner,
  getPartnerInvitations,
  acceptPartnerInvite,
  declinePartnerInvite,
  getPartnerInviteMail,
} from "./repositories/partner";
export type {
  PartnerRow,
  PartnerTenantRow,
  PartnerPublicRow,
  PartnerBalanceLine,
  PartnerOverviewRow,
  PartnerWorkspaceMoneyLine,
  PlatformPartnerBalanceLine,
  PlatformPartnerWorkspaceLine,
  PartnerVerbResult,
  PartnerPayoutAnswer,
  HandoverResult,
  HandoverWorkspace,
  HandoverSent,
  OpenHandover,
  PartnerHandoverLine,
  HandoverInvite,
  PartnerInviteSent,
  WorkspacePartner,
  PartnerInvitation,
  PartnerJoined,
  PartnerInviteMail,
} from "./repositories/partner";
export {
  readLeadOne,
  readIdeaHistory,
  claimIdeas,
  keepIdeas,
  failIdeas,
  saveIdeasLine,
  ideasBasis,
  ideasClockAndLanguage,
  leadCountriesOf,
  leadPeopleSearchCreate,
  leadAddresseeChoose,
  leadCardsLive,
  leadCompanyUpsert,
} from "./repositories/leads";
export { ownLineOf, businessOnRecordOf, filedNamesOf } from "./lines";
export type { LeadOneLead, LeadOneMember, IdeasKept } from "./repositories/leads";
export { watchedTables, watchedEvents, narrowedUpdates, subscribeWorkspaceChanges } from "./realtime";
export type { SubscribeOptions } from "./realtime";
export { readAllRows, readAllRowsByKey, MAX_ROWS, DEFAULT_ROW_CAP } from "./paged";
export type { Page } from "./paged";
export {
  duePlaybooks,
  dueCalendars,
  stampPlaybooksTried,
  whatsappNumbersToRead,
  whatsappNumberOf,
  keepChannelQuality,
  keepChannelStanding,
} from "./sweeps";
export type { DuePage, DueStep, DueCalendar, WhatsappNumber } from "./sweeps";
export {
  appointmentByKey,
  appointmentByClientStart,
  insertAppointment,
  updateAppointment,
  appointmentsBetween,
  visitsOver,
  recordOver,
  notedOver,
  feedWordsOver,
  markVisit,
  openBookingRequest,
  answerBookingRequest,
  openRequestOfThread,
  type BookingRequestOpen,
  appointmentWorkspace,
  appointmentsForClient,
  earlierVisitRows,
  appointmentsScrub,
  contactIdByPhone,
  contactIdByEmail,
  syncFeedAppointments,
  appointmentStates,
  reachOutBookedFrom,
} from "./repositories/calendar/appointments";
export type {
  AppointmentRow,
  AppointmentInsert,
  AppointmentUpdate,
  AppointmentSync,
  EarlierVisitRow,
} from "./repositories/calendar/appointments";
export {
  appointmentNoticeOf,
  keepAppointmentNotice,
  appointmentNoticesOf,
  memberHasAddress,
  heldNoticesOf,
  heldNoticeKeys,
  appointmentNoticeById,
  dismissAppointmentNotice,
} from "./repositories/calendar/notices";
export type { AppointmentNoticeRow, AppointmentNoticeInsert } from "./repositories/calendar/notices";
export type { Database, Json } from "./database.types";
