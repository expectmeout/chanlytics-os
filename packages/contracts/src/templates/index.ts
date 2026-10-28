/** WhatsApp templates: what a business writes, the starter library, and the languages Meta files one under. */
export {
  campaignMessageOf,
  campaignMessagesOf,
  MESSAGE_BEGIN_WORDS,
  MESSAGE_GONE_WORDS,
  messageHolds,
  messageStandingWords,
  messageWhyNot,
  metaStatusOf,
  readyForMessage,
  RUN_NOW_WITHOUT_VERSION_WORDS,
  STARTER_LINE_WORDS,
  variablesSlotCount,
  whatsappStoppedRunWords,
} from "./campaign-message";
export type { CampaignMessage, CampaignMessageRow } from "./campaign-message";
export { emailFoot, emailFootHtml } from "./email-foot";
export type { EmailFoot, LinkedFoot } from "./email-foot";
export {
  inboxBlankOf,
  inboxSlots,
  inboxTemplateParts,
  inboxTemplates,
  noTemplateWords,
  slotToWrite,
  TEMPLATE_WORDS_MAX,
  templateHolds,
  templateOffered,
  templateWords,
} from "./inbox-templates";
export type { InboxBlank, InboxTemplateLike, TemplateHolds, TemplatePart } from "./inbox-templates";
export { isLibrarySample, libraryCount } from "./library-count";
export {
  LANGUAGE_GROUP_WORDS,
  languageLabels,
  languageWords,
  messageLanguageChoices,
  templateUntranslatable,
} from "./message-languages";
export type { LanguageChoice, LanguageGroup } from "./message-languages";
export {
  clampWords,
  eraseSlot,
  fromSlotParts,
  insertSlot,
  namedProblem,
  partWritten,
  slotKnown,
  slotLabel,
  toSlotParts,
} from "./message-version-slots";
export type { SlotEdit, SlotPart } from "./message-version-slots";
export {
  campaignEmailRules,
  EMAIL_BODY_MAX,
  EMAIL_SUBJECT_MAX,
  emailIssues,
  isReachOutRow,
  keepsValues,
  noVersionWords,
  OWN_VERSION_CHANNELS,
  reachOutRowName,
  reachOutStepOf,
  renderOwnVersion,
  SMS_SEGMENTS_MAX,
  smsSegments,
  smsStopLine,
  smsVersionSegments,
  validateEmailVersion,
  validateOwnVersion,
  validateSmsVersion,
  VERSION_CHANNEL_WORDS,
  VERSION_CHANNELS,
  versionComponents,
  versionSlotsRefusal,
  versionsOf,
  versionWord,
  versionWords,
} from "./message-versions";
export type {
  EmailIssue,
  EmailProblem,
  EmailRules,
  OwnVersionChannel,
  VersionChannel,
  VersionCheck,
  VersionWords,
} from "./message-versions";
export { SENDER_WORDS, senderLanguage, senderWords } from "./sender-words";
export type { SenderLanguage, SenderWords } from "./sender-words";
export { fillSlots, numberedSlots, slotValueOf, slotWritten } from "./slot-sets";
export type { SlotKey, SlotSet, SlotValue } from "./slot-sets";
export {
  starterByKey,
  starterByName,
  starterDraft,
  starterEmailText,
  starterForTrigger,
  startersForTrigger,
  starterSmsText,
  startersOffered,
  starterText,
} from "./starter-lookup";
export { messageLanguageCode, STARTER_LANGUAGES, STARTER_TEMPLATES } from "./starter-templates";
export type {
  StarterEmailText,
  StarterSlot,
  StarterSlotKind,
  StarterSmsText,
  StarterTemplate,
  StarterText,
} from "./starter-templates";
export {
  findLanguages,
  languageLabel,
  languageName,
  languageTag,
  templateLanguage,
  WHATSAPP_LANGUAGES,
} from "./template-languages";
export { languageBase } from "./template-languages";
export type { TemplateLanguage } from "./template-languages";
export { bookingTemplate, compareTemplates, defaultTemplate, groupTemplates, starterIndex } from "./template-order";
export type { TemplateGroup } from "./template-order";
export {
  footerOf,
  refusedWords,
  sendableTemplates,
  templateBlocked,
  templateFooter,
  templateLinkButton,
  templateParts,
} from "./template-parts";
export type { TemplateButton, TemplateParts } from "./template-parts";
export { starterPreview, starterPreviewValues, templatePreview, templatePreviewValues } from "./template-preview";
export type { OwnFacts } from "./template-preview";
export {
  defaultParamSpecs,
  defaultSlotKinds,
  guessSlotKind,
  slotChoices,
  slotLabels,
  templateSlots,
} from "./template-slots";
export { playbookName, TEMPLATE_TITLE_MAX, templateTitle } from "./template-titles";
export {
  exampleParams,
  exampleParamsFor,
  firstNameOf,
  PARAM_SOURCE_HINTS,
  PARAM_SOURCE_LABELS,
  PARAM_SOURCES,
  paramLabel,
  paramSaid,
  parseParamSpec,
  parseParamSpecs,
  placeholdersOf,
  placeholdersSequential,
  playbooksStillSending,
  resolveParams,
  slugTemplateName,
  TEMPLATE_BODY_MAX,
  TEMPLATE_BODY_WORDS,
  TEMPLATE_BUTTON_TEXT_MAX,
  TEMPLATE_CATEGORIES,
  TEMPLATE_EXAMPLE_MAX,
  TEMPLATE_FOOTER_MAX,
  TEMPLATE_LABEL_MAX,
  TEMPLATE_LANGUAGES,
  TEMPLATE_NAME_WORDS,
  TEMPLATE_SAME_NAME_WORDS,
  TEMPLATE_STATUS_WORDS,
  TEMPLATE_UNUSED_WORDS,
  templateBodyTooLong,
  templateComponents,
  templateNameOk,
  templateSends,
  templateSendsOf,
  templateSentWords,
  templateUnused,
  templateUsage,
  templateUseNote,
  templateUseWords,
  validateTemplateDraft,
} from "./templates";
export type {
  ParamFacts,
  ParamSourceKind,
  ParamSpec,
  TemplateCategoryChoice,
  TemplateDraft,
  TemplateDraftCheck,
  TemplateDraftInput,
  TemplateSends,
  TemplateSendSource,
  TemplateSentWords,
  TemplateUse,
  TemplateUseSource,
} from "./templates";
