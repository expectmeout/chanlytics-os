/** May we contact this person: the one predicate, and the public page where a yes is said. */
export { optInLink, waMeDigits, waMeLink } from "./wa-links";
export {
  isOptedOutContact,
  mayRing,
  isOfferByEmail,
  mayMessageFor,
  relationshipOnRecord,
  consentChangeOf,
  purposeOfTemplate,
  purposeOfPlaybook,
  OPT_OUT_REFUSAL,
  optOutWords,
  STOP_WORDS,
  stopRequestQuestion,
  DELIVERY_REFUSALS,
  PURPOSE_REFUSALS,
} from "./consent";
export type {
  ConsentBearing,
  SendPurpose,
  AskedPurpose,
  MessageAbout,
  PurposeBearing,
  PurposeRefusal,
  DeliveryRefusal,
  ConsentChange,
} from "./consent";
export {
  policyLinks,
  optInConfirmation,
  confirmationNameOf,
  verbalOptInScript,
  consentPageVM,
  consentFormVM,
  consentPageMetadata,
  consentFormMetadata,
  deskSignVM,
  deskSignMetadata,
  notTakingSignUps,
  GET_YES_NO_NUMBER_WORDS,
  GET_YES_PAUSED_WORDS,
  GET_YES_WORDS,
  YES_WHILE_PAUSED,
  CONSENT_PHRASE,
  CONSENT_PHRASE_ES,
  CONVERSATION_PHRASE,
  CONVERSATIONAL_ASK_TITLE,
} from "./consent-page";
export type {
  ConsentPageFacts,
  ConsentWayKind,
  ConsentWay,
  ConsentAsk,
  ConsentPageVM,
  PolicyLinks,
  ConsentFormSection,
  ConsentFormVM,
  DeskSignVM,
} from "./consent-page";
export {
  CONSENT_CHANNELS,
  CONSENT_CHANNEL_WORDS,
  channelsOfYes,
  yesCovers,
  coveredChannels,
  channelsWords,
} from "./consent-channels";
export type { ConsentChannel } from "./consent-channels";
export { yesAsked, consentGuardWords, consentRuleWords } from "./consent-asks";
export type { YesAsk } from "./consent-asks";
export { offerUnsubscribeWords, STOP_ALL_REFUSALS } from "./offers-unsubscribe";
export type { OfferUnsubscribeView, OfferPageWords, OfferPageButton } from "./offers-unsubscribe";
export { optOutOf, optOutNotice } from "./opt-out-notice";
export type { OptOutHow, OptOutSaid, OptOutPerson } from "./opt-out-notice";
