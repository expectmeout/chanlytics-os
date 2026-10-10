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
export { recordModelUsage, workspaceMayUseModels, aiFailuresHour, purgeAiUsage, usageMonth } from "./ai-usage";
export type { AiFailures, UsageMonthRow } from "./ai-usage";
export { keepInvoiceAmount } from "./billing-events";
export { migrationHead } from "./ops";
export { ERASURE_LEGS, ERASURE_STRATEGIES } from "./erasure-registry";
export type { ErasureLeg, ErasureStrategy } from "./erasure-registry";
export type { MigrationHead } from "./ops";
export { signUpOnPublicKey, inviteUserByEmail, listSecondFactors, deleteSecondFactor } from "./auth";
export { addToWaitlist, refreshWaitlistRow, waitlistWaiting, markWaitlistInvited } from "./waitlist";
export { createServiceClient } from "./service-client";
export { observeDb, namedFetch, DB_REQUEST_HEADER } from "./observe";
export type { DbLog, DbObserver } from "./observe";
export { tenantDb, platformWide } from "./tenant-db";
export type { TenantDb } from "./tenant-db";
export type { ServiceClientConfig } from "./service-client";
export {
  ingestInbound,
  recordCarrierOptOut,
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
  recordLateCarrierOptOut,
  recordWhatsAppOffersStop,
} from "./repositories/campaigns/offers-answer";
export type { LateCarrierStop } from "./repositories/campaigns/offers-answer";
export { failStrandedRun, strandedRuns } from "./repositories/campaigns/stranded-runs";
export type { StrandedRun } from "./repositories/campaigns/stranded-runs";
export {
  sendingDomainsOf,
  sendingDomainOf,
  sendingDomainByHost,
  dueSendingDomains,
  coldReceiptsOwed,
  countSendingDomains,
  reserveSendingDomain,
  touchSendingDomain,
  recordProviderDomain,
  applyDomainCheck,
  sendingDomainCounts,
  reputationHoldsSince,
  platformHoldStands,
  deleteSendingDomainAsRead,
  domainHeldSince,
  deleteSendingDomain,
} from "./repositories/sending-domains";
export type { SendingDomainRow, ColdReceiptsOwed, SendingDomainHolder } from "./repositories/sending-domains";
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
export {
  domainCapacityOf,
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
  dueDomains,
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
  parentEmailOf,
  leadAddressBounced,
  leadWritten,
  uncheckedSends,
  uncheckedWaiting,
  reachOutRecord,
  recordCheck,
  heldStale,
  releaseUnavailableHolds,
  takeCheckAttempt,
  workspaceMaySpend,
  workspaceAbout,
} from "./repositories/reach-out";
export type {
  ReachOutSendRow,
  ReachOutSendInsert,
  DomainCapacity,
  AudienceLead,
  PersonForSend,
  FollowerLead,
  QueuedOutcome,
  DueDomain,
  MessageInsert,
  WrittenEmail,
  SendStanding,
  ParentEmail,
  ReachOutRecordRow,
  UncheckedSend,
} from "./repositories/reach-out";
export {
  reachOutStepsOf,
  reachOutRootOf,
  reachOutSendRefOf,
  emailWordsFrom,
  emailWordsByTemplate,
  searchNamesByIds,
  runsWaitingOf,
  reachOutRunSendsOf,
  stampReachOutStep,
  recheckSends,
  outreachModeOf,
  tenantZoneOf,
  heldNoticeDue,
  markHeldNotice,
  leadNamesByIds,
  handRun,
} from "./repositories/reach-out-sheet";
export type {
  ReachOutStepRow,
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
  reachOutReport,
  ReportWindowNotReadable,
} from "./repositories/reports/report-series";
export type { ReportWindow } from "./repositories/reports/report-series";
export { firstReplies } from "./repositories/reports/first-replies";
export { forgetNotification, noticeKept, activityTokensOf, forgetActivityTokens } from "./repositories/notifications";
export { workspacePaused } from "./repositories/campaigns/workspace";
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
  queuedRecipients,
  runGoesByOthers,
  campaignMonthSent,
  holdRecipients,
} from "./repositories/campaigns/campaign-channels";
export type { RoutedChannel, ChannelLookup, WhatsappNumberRow } from "./repositories/routing";
export {
  ingestCall,
  linkCallMessage,
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
export type { JobToRequeue } from "./jobs";
export { claimControl, releaseControl, CALL_CONTROL_S, claimReplyTurn, holdsReplyTurn } from "./repositories/control";
export type { ControlHolder, ControlOutcome } from "./repositories/control";
export {
  templatesFor,
  templatesToSend,
  templateIdOf,
  templatesNamed,
  templateStatusOf,
  messageSlots,
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
  listPolicies,
  setPolicyMode,
  personReplyMode,
  setPersonReplyMode,
  workspaceAnswersOnItsOwn,
  membershipCountOf,
  workspaceIdsOf,
  createWorkspaceFn,
  lineForwardingSet,
  setPlaybookState,
  updatePlaybook,
  removePlaybook,
  startPlaybook,
} from "./repositories/control-plane";
export type {
  TenantConfigRow,
  PutTenantConfigResult,
  PolicyRecord,
  CreateWorkspaceArgs,
  LineForwardingArgs,
  PlaybookPatch,
  PlaybookToStart,
} from "./repositories/control-plane";
export {
  PEOPLE_PAGE,
  IDS_PER_READ,
  namesOfPeople,
  personDecisions,
  peoplePage,
  personRow,
  addPersonNote,
  peopleCursorOf,
  everyoneIn,
  everyoneOnceIn,
  erasureDigests,
  scrubPersonNotes,
  mergePeople,
  recordConsent,
  resolvePerson,
  PERSON_FORGOTTEN,
  openDoubtsOf,
  doubtOn,
  dismissPersonDoubt,
  contactSeen,
  markContact,
} from "./repositories/people";
export type { PeopleCursor, ResolvePersonInput, ResolvedPerson } from "./repositories/people";
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
export { touchesSince, followUpTouchesSince, touchIndex } from "./repositories/touches";
export type { Touch, TouchIndex } from "./repositories/touches";
export { yesesSince, recordDeal } from "./repositories/deals";
export type { YesRow, DealMove } from "./repositories/deals";
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
export { readLeadOne } from "./repositories/leads";
export { ownLineOf } from "./lines";
export type { LeadOneLead, LeadOneMember } from "./repositories/leads";
export { watchedTables, watchedEvents, subscribeWorkspaceChanges } from "./realtime";
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
export type { DuePage, DuePlaybook, DueCalendar, WhatsappNumber } from "./sweeps";
export {
  appointmentByKey,
  appointmentByClientStart,
  insertAppointment,
  updateAppointment,
  appointmentsBetween,
  appointmentsForClient,
  appointmentsScrub,
  contactIdByPhone,
  contactIdByEmail,
  syncFeedAppointments,
  appointmentStates,
} from "./repositories/calendar/appointments";
export type {
  AppointmentRow,
  AppointmentInsert,
  AppointmentUpdate,
  AppointmentSync,
} from "./repositories/calendar/appointments";
export {
  appointmentNoticeOf,
  keepAppointmentNotice,
  appointmentNoticesOf,
  memberHasAddress,
  heldNoticesOf,
  appointmentNoticeById,
  dismissAppointmentNotice,
} from "./repositories/calendar/notices";
export type { AppointmentNoticeRow, AppointmentNoticeInsert } from "./repositories/calendar/notices";
export type { Database, Json } from "./database.types";
