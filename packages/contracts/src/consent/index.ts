/** May we contact this person: the one predicate, and the public page where a yes is said. */
export {
  consentChangeOf,
  DELIVERY_REFUSALS,
  isOfferByEmail,
  isOptedOutContact,
  mayMessageFor,
  mayRing,
  OPT_OUT_REFUSAL,
  optOutWords,
  PURPOSE_REFUSALS,
  purposeOfPlaybook,
  purposeOfTemplate,
  relationshipOnRecord,
  STOP_WORDS,
  stopRequestQuestion,
} from "./consent";
export type {
  AskedPurpose,
  ConsentBearing,
  ConsentChange,
  DeliveryRefusal,
  MessageAbout,
  PurposeBearing,
  PurposeRefusal,
  SendPurpose,
} from "./consent";
export { consentGuardWords, consentRuleWords, yesAsked } from "./consent-asks";
export type { YesAsk } from "./consent-asks";
export {
  channelsOfYes,
  channelsWords,
  CONSENT_CHANNEL_WORDS,
  CONSENT_CHANNELS,
  coveredChannels,
  yesCovers,
} from "./consent-channels";
export type { ConsentChannel } from "./consent-channels";
export {
  confirmationNameOf,
  CONSENT_PHRASE,
  CONSENT_PHRASE_ES,
  consentFormMetadata,
  consentFormVM,
  consentPageMetadata,
  consentPageVM,
  CONVERSATION_PHRASE,
  CONVERSATIONAL_ASK_TITLE,
  deskSignMetadata,
  deskSignVM,
  dmBackOnConfirmation,
  GET_YES_NO_NUMBER_WORDS,
  GET_YES_PAUSED_WORDS,
  GET_YES_WORDS,
  notTakingSignUps,
  optInConfirmation,
  policyLinks,
  verbalOptInScript,
  YES_WHILE_PAUSED,
} from "./consent-page";
export type {
  ConsentAsk,
  ConsentFormSection,
  ConsentFormVM,
  ConsentPageFacts,
  ConsentPageVM,
  ConsentWay,
  ConsentWayKind,
  DeskSignVM,
  PolicyLinks,
} from "./consent-page";
export { offerUnsubscribeWords, STOP_ALL_REFUSALS } from "./offers-unsubscribe";
export type { OfferPageButton, OfferPageWords, OfferUnsubscribeView } from "./offers-unsubscribe";
export { optOutNotice, optOutOf } from "./opt-out-notice";
export type { OptOutHow, OptOutPerson, OptOutSaid } from "./opt-out-notice";
export { optInLink, waMeDigits, waMeLink } from "./wa-links";
