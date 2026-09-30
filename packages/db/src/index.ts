/** Every public name, named: a new export is a line here, never an export * (repo/contracts-barrels.test.mjs). */
export { emitEvent, recordEvent } from "./events";
export type { EmittedKind, EventData } from "./events";
export { createServiceClient } from "./service-client";
export type { ServiceClientConfig } from "./service-client";
export {
  ingestInbound,
  recordCarrierOptOut,
  markProcessed,
  recordOutbound,
  resolveOutboundTarget,
  countSentToday,
  recordStatusByExternalId,
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
  lastInboundEmail,
  answeredReachOutEmail,
  stampEmailSent,
  stampEmailLeftAs,
  sentEmailRequestOf,
  sentEmailOf,
  stampEmailComplaint,
  recordEmailNo,
  recordEmailStatus,
  suppressEmailOf,
} from "./repositories/email";
export type { MailboxRow, IngestEmailParams, InboundEmailFacts } from "./repositories/email";
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
export { forgetNotification, activityTokensOf, forgetActivityTokens } from "./repositories/notifications";
export { resolveChannelDetailed, resolveChannel } from "./repositories/routing";
export type { RoutedChannel, ChannelLookup } from "./repositories/routing";
export {
  ingestCall,
  linkCallMessage,
  callersOf,
  setCallRecording,
  recordCallNote,
  claimCallNotification,
  claimCallActivity,
  callerNameOf,
} from "./repositories/calls";
export type { NormalizedCallInput, IngestCallResult } from "./repositories/calls";
export {
  assembleHistory,
  readThreadState,
  readLeadContext,
  readDealForPhone,
  notesForReceptionist,
  describeLead,
  HISTORY_COLUMNS,
  searchMessages,
  messageSenders,
} from "./repositories/thread";
export type { ThreadTurn, PgThreadState, LeadContext, MessageHit, MessageSender } from "./repositories/thread";
export {
  claimIdempotencyKey,
  takeIdempotencyKey,
  releaseIdempotencyKey,
  keepIdempotencyReceipt,
} from "./repositories/idempotency";
export type { IdempotencyHold, IdempotencyClaim } from "./repositories/idempotency";
export { claimControl, releaseControl, CALL_CONTROL_S } from "./repositories/control";
export type { ControlHolder, ControlOutcome } from "./repositories/control";
export { templatesFor } from "./repositories/templates";
export type { TemplateRow } from "./repositories/templates";
export {
  getTenantConfig,
  putTenantConfig,
  listPolicies,
  setPolicyMode,
  personReplyMode,
  setPersonReplyMode,
} from "./repositories/control-plane";
export type { TenantConfigRow, PutTenantConfigResult, PolicyRecord } from "./repositories/control-plane";
export {
  PEOPLE_PAGE,
  IDS_PER_READ,
  namesOfPeople,
  peoplePage,
  everyoneIn,
  erasureDigests,
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
export { touchesSince, followUpTouchesSince, touchIndex } from "./repositories/touches";
export type { Touch, TouchIndex } from "./repositories/touches";
export { yesesSince } from "./repositories/deals";
export type { YesRow } from "./repositories/deals";
export {
  getOwnPartner,
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
export type { LeadOneLead, LeadOneMember } from "./repositories/leads";
export { watchedTables, watchedEvents, subscribeWorkspaceChanges } from "./realtime";
export type { SubscribeOptions } from "./realtime";
export { readAllRows, readAllRowsByKey, MAX_ROWS, DEFAULT_ROW_CAP } from "./paged";
export type { Page } from "./paged";
export { duePlaybooks, dueCalendars, stampPlaybooksTried } from "./sweeps";
export type { DuePage, DuePlaybook, DueCalendar } from "./sweeps";
export type { Database, Json } from "./database.types";
