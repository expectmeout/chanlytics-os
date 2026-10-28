/** Every public name, named: a new export is a line here, never an export * (repo/contracts-barrels.test.mjs). */
export { fetchMailDomains, fetchReceivedEmail, SEND_DEADLINE_MS, SEND_MIN_MS, sendEmail } from "./email/email-resend";
export type { ResendAnswer, ResendConfig, SendEmailOptions } from "./email/email-resend";
export { emailPlainText } from "./email/email-text";
export { addressOf, messageIdHeader, oneLine } from "./email/header-values";
export {
  campaignsIdentity,
  connectedIdentity,
  hostedAddress,
  hostedIdentity,
  replyRouteAddress,
  requestLeavesAs,
  sendsAs,
  sendsAsCampaigns,
  sendsAsConnected,
} from "./email/identity";
export type { EmailSendsAs } from "./email/identity";
export {
  classifyReceived,
  emailReceivedEventFrom,
  messageIdsIn,
  platformRecipient,
  receivedEmailFrom,
  senderAuthenticated,
} from "./email/intake";
export type { EmailClaim, EmailReceivedEvent, PlatformRecipient, ReceivedEmail } from "./email/intake";
export { mailDomainsFrom, resendLimitOf } from "./email/provider-answers";
export type { MailCapability, MailDomainFacts, ResendLimit } from "./email/provider-answers";
export { emailReceiptEffect, emailReceiptFrom } from "./email/receipts";
export type { EmailReceipt, EmailReceiptEffect, EmailReceiptType, EmailSuppressionReason } from "./email/receipts";
export {
  buildEmailRequest,
  emailHtml,
  isEmailRequest,
  mailboxHeader,
  referencesFor,
  replySubject,
} from "./email/request";
export type { EmailCampaign, EmailIdentity, EmailParent, EmailRequest, EmailRequestInput } from "./email/request";
export { resendWebhookSignature, verifyResendWebhook, WEBHOOK_TOLERANCE_S } from "./email/webhook-signature";
export type { SvixHeaders } from "./email/webhook-signature";
export {
  authorizeUrl,
  b64url,
  GOOGLE_AUTH_URL,
  GOOGLE_REVOKE_URL,
  GOOGLE_TOKEN_URL,
  grantHasScope,
  idTokenClaims,
  newNonce,
  parseTokenResponse,
  PROFILE_SCOPES,
  revokeRequest,
  signState,
  STATE_TTL_MS,
  tokenExchangeRequest,
  tokenRefreshRequest,
  unb64url,
  verifyState,
} from "./google/google-oauth";
export type { OAuthClient, OAuthState, TokenGrant } from "./google/google-oauth";
export {
  getPlace,
  parsePlaceDetails,
  parsePlacesSearch,
  PLACE_ID,
  PLACES_BASE,
  PLACES_DETAILS_MASK,
  PLACES_SEARCH_LIMIT,
  PLACES_SEARCH_MASK,
  PLACES_TIMEOUT_MS,
  placesDetailsRequest,
  PlacesError,
  placesFetch,
  placesSearchRequest,
  reviewIdOf,
  searchPlaces,
} from "./google/google-places";
export type { PlaceCandidate, PlaceDetails, PlaceReview, PlacesHttp, PlacesRequest } from "./google/google-places";
export {
  accountsRequest,
  cleanReply,
  deleteReplyRequest,
  GBP_ACCOUNTS_URL,
  GBP_INFO_BASE,
  GBP_LOCATIONS_READ_MASK,
  GBP_REPLY_MAX,
  GBP_REVIEWS_FIRST_PAGES,
  GBP_REVIEWS_MAX_PAGES,
  GBP_REVIEWS_PAGE,
  GBP_V4_BASE,
  listAccounts,
  listLocations,
  listReviews,
  locationsRequest,
  parseAccounts,
  parseLocations,
  parseReviewsPage,
  readLocation,
  readLocationDetails,
  replyRequest,
  replyToReview,
  reviewParent,
  reviewsRequest,
  starRatingNumber,
} from "./google/google-profile";
export type {
  GbpAccount,
  GbpLocation,
  GbpLocationDetails,
  GbpPeriod,
  GbpReview,
  GbpReviewsPage,
} from "./google/google-profile";
export { FRESH_SLACK_MS, planListingCheck, planProfileSync, REVIEW_BELL_MAX, reviewBells } from "./google/google-sync";
export type {
  KnownReview,
  ListingBefore,
  ListingCheckPlan,
  ProfileBefore,
  ProfileSyncPlan,
  ReviewBell,
} from "./google/google-sync";
export { isLinkedMedia } from "./inbound";
export type { InboundMessage, LinkedMediaRef, MediaRef } from "./inbound";
export { inboundFromInstagram, instagramEventsOf } from "./instagram/instagram-events";
export type { IgMessaging, IgReferral, InstagramEvent } from "./instagram/instagram-events";
export {
  fetchLinkedMedia,
  INSTAGRAM_DM_MAX_BYTES,
  instagramAuthorizeUrl,
  instagramCall,
  instagramCodeOf,
  instagramCodeRequest,
  instagramDmChunks,
  instagramErrorOf,
  instagramLongLivedRequest,
  instagramMeRequest,
  instagramNameOf,
  instagramRefreshRequest,
  instagramRefusalOf,
  instagramSubscribeRequest,
  instagramThrottled,
  parseInstagramCodeGrant,
  parseInstagramMe,
  parseInstagramToken,
  readInstagramName,
  sendInstagramText,
} from "./instagram/instagram-graph";
export type {
  InstagramAnswer,
  InstagramApp,
  InstagramCodeGrant,
  InstagramConfig,
  InstagramDeps,
  InstagramGraphError,
  InstagramRequest,
} from "./instagram/instagram-graph";
export {
  APIFY_BASE,
  APIFY_RUN_END_EVENTS,
  APIFY_TIMEOUT_MS,
  apifyClient,
  ApifyRefused,
  ApifyRetryable,
} from "./leads/apify";
export type { ApifyClient, ApifyRun } from "./leads/apify";
export {
  LEAD_JUDGE_DEFAULT_MODEL,
  LEAD_JUDGE_FALLBACK_BETA,
  LEAD_JUDGE_MAX_TOKENS,
  leadJudge,
} from "./leads/lead-judge";
export type { CompanyJudgeAnswer, LeadJudge, LeadJudgeAnswer, LeadJudgeClient } from "./leads/lead-judge";
export { runA2PSaga } from "./lines/a2p-saga";
export type { A2PAnswer, A2PPorts, A2PResult } from "./lines/a2p-saga";
export {
  brandRequest,
  campaignRequest,
  deleteCampaignRequest,
  keywordsFor,
  LOW_VOLUME_USECASE,
  updateCampaignRequest,
} from "./lines/a2p/brand-campaign";
export type { CampaignFacts } from "./lines/a2p/brand-campaign";
export { brandNameOf, brandTypeFor } from "./lines/a2p/business-record";
export type { BrandType, BusinessRecord } from "./lines/a2p/business-record";
export { A2P_STEPS, EMPTY_A2P_STATE, nextA2PStep } from "./lines/a2p/steps";
export type { A2PState, A2PStep } from "./lines/a2p/steps";
export {
  a2pProfileEndUserRequest,
  a2pProfileRequest,
  addressRequest,
  assignRequest,
  businessAttributes,
  businessEndUserRequest,
  customerProfileRequest,
  evaluateRequest,
  evaluateTrustProductRequest,
  representativeAttributes,
  representativeEndUserRequest,
  soleProprietorEndUserRequest,
  soleProprietorProfileRequest,
  starterAttributes,
  starterEndUserRequest,
  starterProfileRequest,
  submitProfileRequest,
  submitTrustProductRequest,
  supportingDocumentRequest,
  trustProductAssignRequest,
  updateEndUserRequest,
} from "./lines/a2p/trust-hub";
export { isBrandNotReady, refusalWords, registrationVerdict, smsStateFor } from "./lines/a2p/verdict";
export type { CampaignError, SmsRegistrationState } from "./lines/a2p/verdict";
export { A2P_POLICIES, encodeForm, MESSAGING, TRUSTHUB } from "./lines/a2p/wire";
export type { A2PRequest } from "./lines/a2p/wire";
export {
  chooseLineProvider,
  isAreaCode,
  isValidSipPassword,
  LINE_COSTS,
  RETELL_ORIGINATION,
  sipPassword,
  sipUsername,
  subaccountName,
  trunkDomain,
} from "./lines/lines";
export type {
  AvailableNumber,
  LineProvider,
  LineProviderName,
  ProviderAccount,
  ReceivedText,
  SmsSendResult,
} from "./lines/lines";
export { dryProvider } from "./lines/lines-dry";
export type { DryCall, DryProvider } from "./lines/lines-dry";
export { LINE_STEPS, nextLineStep, retellImportBody, runLineSaga } from "./lines/lines-saga";
export type { LinePorts, LineRow, LineSecrets, LineStep, LineVoiceState, SagaResult } from "./lines/lines-saga";
export {
  fetchTwilio,
  TWILIO_TIMEOUT_MS,
  TwilioError,
  twilioProvider,
  twilioRequest,
  twilioUrls,
} from "./lines/lines-twilio";
export { lookupLineType } from "./lines/lines-twilio";
export type { TwilioAnswer, TwilioHttp } from "./lines/lines-twilio";
export type { LineTypeAnswer } from "./lines/lines-twilio";
export {
  carrierConsent,
  inboundFromSms,
  lineCodesFrom,
  mergeConsent,
  oneTimeCodeOf,
  sameSignature,
  SMS_FOOTER,
  SMS_HELD_DETAILS,
  SMS_HELD_REASON,
  SMS_MAX_CHARS,
  SMS_OPTED_OUT_CODE,
  smsBody,
  smsInboundFrom,
  smsInboundUrl,
  smsKeywordConsent,
  smsRefusalOf,
  smsStatusFrom,
  smsStatusToRow,
  smsStatusUrl,
  twilioSignature,
  twilioSignedString,
  verifyTwilioSignature,
} from "./lines/sms";
export type { CarrierConsent, SmsInbound, SmsStatus } from "./lines/sms";
export { errField, logger } from "./log/logger";
export type { LogFields, Logger, LogLevel } from "./log/logger";
export {
  noteTenant,
  noteTiming,
  noteTouch,
  requestId,
  requestTenant,
  requestTimings,
  requestTouches,
  withRequestId,
} from "./log/request";
export type { RequestTiming } from "./log/request";
export { remadeLogo } from "./logo-png";
export {
  calendarIcs,
  googleCalendarIds,
  googleEvents,
  graphCalendarIds,
  graphEvents,
} from "./mailbox/mailbox-calendar";
export type { CalendarEvent, CalendarIds, EventsPage } from "./mailbox/mailbox-calendar";
export {
  DKIM_SELECTORS,
  dkimOf,
  dmarcOf,
  SPF_INCLUDES,
  spfNamesProvider,
  spfRecordsOf,
  spfTermsOf,
} from "./mailbox/mailbox-dns";
export type { TxtAnswer } from "./mailbox/mailbox-dns";
export {
  gmailDayUsed,
  gmailFindSent,
  gmailHistory,
  gmailMessage,
  gmailNoMailbox,
  gmailProfile,
  gmailReadVerdict,
  gmailReports,
  gmailSend,
  gmailSentIds,
  gmailSignature,
  gmailSignedOut,
  gmailStop,
  gmailThreadOf,
  gmailWatch,
} from "./mailbox/mailbox-gmail";
export type { GmailHistory, GmailSent } from "./mailbox/mailbox-gmail";
export {
  graphDayUsed,
  graphDeleteMessage,
  graphDelta,
  graphFindSent,
  graphInbox,
  graphJunkSince,
  graphMe,
  graphMessage,
  graphNoMailbox,
  graphReadVerdict,
  graphRenew,
  graphSend,
  graphSignedOut,
  graphSubscribe,
  graphUnsubscribe,
} from "./mailbox/mailbox-graph";
export type { GraphDelta, GraphSent } from "./mailbox/mailbox-graph";
export { gmailListSince, graphListSince } from "./mailbox/mailbox-history";
export type { ListedMail, MailPage, MailWindow } from "./mailbox/mailbox-history";
export { buildMime, mailboxMessageId } from "./mailbox/mailbox-mime";
export {
  grantHolds,
  grantScopes,
  grantScopesMissing,
  MAILBOX_SCOPES,
  mailboxAdminConsentUrl,
  mailboxAuthorizeUrl,
  mailboxPkceChallenge,
  mailboxPkceVerifier,
  mailboxRefreshRequest,
  mailboxRevokeRequest,
  mailboxTokenRequest,
  parseMailboxGrant,
} from "./mailbox/mailbox-oauth";
export type { MailboxGrant, MailboxOAuthClient, MailboxReach, MailboxRequest } from "./mailbox/mailbox-oauth";
export { googleContacts, graphContacts } from "./mailbox/mailbox-people";
export type { KnownPerson, PeoplePage } from "./mailbox/mailbox-people";
export { clientStateMatches, gmailPushOf, graphNotificationsOf, verifyGooglePushToken } from "./mailbox/mailbox-push";
export type { PushTokenRefusal } from "./mailbox/mailbox-push";
export {
  deliveryReportOf,
  filedAsBulk,
  filedUnderUpdates,
  gmailEmailOf,
  graphEmailOf,
  rowIdOfMessageId,
} from "./mailbox/mailbox-read";
export type { BounceClass, DeliveryReport, FoundSent, MailboxEmail, ReadVerdict } from "./mailbox/mailbox-read";
export { sendFromMailbox } from "./mailbox/mailbox-send";
export type { MailboxSendInput, MailboxSendResult } from "./mailbox/mailbox-send";
export {
  cleanGmailSignature,
  gmailSignatureWords,
  mailboxDtoOf,
  mailboxSignatureOf,
} from "./mailbox/mailbox-signature";
export { META_SIGNATURE_HEADER, metaSignatureValid } from "./meta-signature";
export { askModel, formatRejected, resetFastHolds, streamModel } from "./models/anthropic";
export type {
  ModelAsk,
  ModelBlock,
  ModelDeps,
  ModelMessage,
  ModelOutcome,
  ModelReply,
  ModelStreamReply,
} from "./models/anthropic";
export { askSystemOne, SYSTEM_ONE_URL } from "./models/typesafe";
export type { SystemOneAsk, SystemOneReply } from "./models/typesafe";
export { answerObject, breakerOf, breakerStates, providerFetch, resetBreakers } from "./provider-fetch";
export type { Provider, ProviderCall, ProviderReply, SendOutcome } from "./provider-fetch";
export {
  isPublicAddress,
  NotPublicError,
  publicFetch,
  publicFetcher,
  publicLookup,
  setPublicFetch,
} from "./public-fetch";
export type { PublicFetchDeps, Resolve, Resolved } from "./public-fetch";
export { BOT_USER_AGENT, imageBytes, pageText } from "./site-reads";
export { CONFIRM_PATH, confirmUrl, signConfirmToken, verifyConfirmToken } from "./tokens/confirm-token";
export type { ConfirmClaims } from "./tokens/confirm-token";
export { EDGE_TOKEN_TTL_MS, edgeBodyMatches, signEdgeToken, verifyEdgeToken } from "./tokens/edge-token";
export type { EdgeClaims, EdgeTokenVerdict } from "./tokens/edge-token";
export { REQUEST_ID_HEADER, requestIdOf, requestIdShaped } from "./tokens/request-id";
export {
  signUnsubscribeToken,
  UNSUBSCRIBE_PATH,
  unsubscribeUrl,
  verifyUnsubscribeToken,
} from "./tokens/unsubscribe-token";
export type { UnsubscribeClaims } from "./tokens/unsubscribe-token";
export {
  deleteConversation,
  ELEVENLABS_SIGNATURE_HEADER,
  ELEVENLABS_WEBHOOK_TOLERANCE_S,
  elevenLabsWebhookSignature,
  mintConversationToken,
  speakText,
  verifyElevenLabsWebhook,
} from "./voice/elevenlabs";
export type { ConversationMint, ElevenLabsConfig, SpeechStream } from "./voice/elevenlabs";
export {
  planVoiceProvision,
  stripKey,
  VOICE_AGENT_DEFAULTS,
  VOICE_LLM_DEFAULTS,
  VOICE_NUMBER_DEFAULTS,
  voiceAgentCreateBody,
  voiceEndpoints,
  voiceLlmCreateBody,
  voiceNumberBindBody,
  voiceNumberBinding,
  voiceNumberCreateBody,
  withKey,
} from "./voice/voice-provision";
export type {
  ProvisionAction,
  ProvisionSecrets,
  ProvisionStep,
  ProvisionStepId,
  VoiceProvisionPlan,
  VoiceProvisionRequest,
  VoiceProvisionState,
} from "./voice/voice-provision";
export {
  callSummaryLine,
  createAgent,
  createAgentVersion,
  createPhoneNumber,
  createRetellLlm,
  createWebCall,
  deletePhoneNumber,
  fetchRecording,
  getAgent,
  getAgentRaw,
  getCall,
  getPhoneNumber,
  getRetellLlm,
  importPhoneNumber,
  listCalls,
  liveTurns,
  normalizeCall,
  parseTranscriptText,
  publishAgentVersion,
  stopCall,
  updateAgent,
  updateLiveCall,
  updatePhoneNumber,
  verifyRetellSignature,
  webCallBody,
  webCallMadeOf,
} from "./voice/voice-retell";
export type {
  ListCallsPage,
  LiveCallControl,
  NormalizedCall,
  RecordingFetch,
  RetellAgentConfig,
  RetellCall,
  RetellCallRead,
  RetellConfig,
  RetellLlmConfig,
  RetellTranscriptTurn,
  RetellWrite,
  WebCallMade,
} from "./voice/voice-retell";
export {
  agentSettingsDrift,
  availabilityUrl,
  CALL_ANALYSIS_FIELDS,
  CALL_FEEL,
  CALL_HANDBOOK,
  CALLER_UNKNOWN,
  desiredVoiceShell,
  FACTS_UNAVAILABLE,
  GREETING_DEFAULT,
  greetingFor,
  HANDOFF_VAR,
  newDraftNote,
  planAgentSettings,
  planVoiceConvergence,
  retellLocalesFor,
  unpublishedLatestNote,
  VOICE_SHELL_BEGIN,
  VOICE_SHELL_PROMPT,
  VOICE_WEBHOOK_EVENTS,
  VOICE_WEBHOOK_TIMEOUT_MS,
  voiceShellDrift,
  voiceShellTools,
} from "./voice/voice-shell";
export type {
  AgentPlan,
  LiveAgentSettings,
  LiveVoiceLlm,
  RetellTool,
  VoiceConvergencePlan,
  VoiceShellTarget,
} from "./voice/voice-shell";
export {
  contactsSyncedOf,
  fetchMediaBytes,
  graphThrottled,
  inboundFromWhatsapp,
  normalizeInbound,
  sendTemplate,
  sendText,
  sharedHistoryOf,
  storableReferral,
  WA_HISTORY_NOT_SHARED,
  waPricingOf,
  waStoppedMarketing,
  WHATSAPP_SEND_TIMEOUT_MS,
} from "./whatsapp";
export type {
  EmailLeftAsWhy,
  NormalizedInbound,
  SendResult,
  WaChangeValue,
  WaConfig,
  WaHistoryChunk,
  WaHistoryOf,
  WaHistoryRead,
  WaMediaRef,
  WaPricing,
  WaRawMessage,
  WaStateSyncItem,
  WaSyncedContact,
} from "./whatsapp";
