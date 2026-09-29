/** May we contact this person: the one predicate, and the public page where a yes is said. */
export {
  isOptedOutContact,
  mayMessageFor,
  consentChangeOf,
  purposeOfTemplate,
  purposeOfPlaybook,
  OPT_OUT_REFUSAL,
  stopRequestQuestion,
  DELIVERY_REFUSALS,
  PURPOSE_REFUSALS,
  OFFERS_BY_WHATSAPP_NOTE,
} from "./consent";
export type {
  ConsentBearing,
  SendPurpose,
  AskedPurpose,
  PurposeBearing,
  PurposeRefusal,
  DeliveryRefusal,
  ConsentChange,
} from "./consent";
export {
  policyLinks,
  optInConfirmation,
  verbalOptInScript,
  consentPageVM,
  consentFormVM,
  consentPageMetadata,
  consentFormMetadata,
  deskSignVM,
  deskSignMetadata,
  CONSENT_PHRASE,
  CONSENT_PHRASE_ES,
  CONVERSATION_PHRASE,
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
