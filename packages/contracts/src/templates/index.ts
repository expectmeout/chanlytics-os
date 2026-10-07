/** WhatsApp templates: what a business writes, the starter library, and the languages Meta files one under. */
export {
  templateNameOk,
  slugTemplateName,
  placeholdersOf,
  placeholdersSequential,
  validateTemplateDraft,
  templateComponents,
  parseParamSpec,
  parseParamSpecs,
  paramLabel,
  playbooksStillSending,
  firstNameOf,
  resolveParams,
  exampleParams,
  templateUsage,
  templateUseWords,
  templateUseNote,
  templateUnused,
  templateSends,
  templateSentWords,
  TEMPLATE_LANGUAGES,
  TEMPLATE_CATEGORIES,
  TEMPLATE_BODY_MAX,
  TEMPLATE_FOOTER_MAX,
  TEMPLATE_EXAMPLE_MAX,
  TEMPLATE_NAME_MAX,
  TEMPLATE_BUTTON_TEXT_MAX,
  PARAM_SOURCES,
  PARAM_SOURCE_LABELS,
  PARAM_SOURCE_HINTS,
} from "./templates";
export type {
  TemplateCategoryChoice,
  TemplateDraftInput,
  TemplateDraft,
  TemplateDraftCheck,
  ParamSourceKind,
  ParamSpec,
  ParamFacts,
  TemplateUse,
  TemplateUseSource,
  TemplateSends,
  TemplateSendSource,
  TemplateSentWords,
} from "./templates";
export { STARTER_LANGUAGES, STARTER_TEMPLATES } from "./starter-templates";
export type {
  StarterSlotKind,
  StarterSlot,
  StarterText,
  StarterEmailText,
  StarterSmsText,
  StarterTemplate,
} from "./starter-templates";
export {
  starterByName,
  starterByKey,
  startersOffered,
  starterForTrigger,
  startersForTrigger,
  starterText,
  starterDraft,
  starterEmailText,
  starterSmsText,
} from "./starter-lookup";
export {
  VERSION_CHANNELS,
  OWN_VERSION_CHANNELS,
  VERSION_CHANNEL_WORDS,
  EMAIL_SUBJECT_MAX,
  EMAIL_BODY_MAX,
  SMS_SEGMENTS_MAX,
  smsStopLine,
  smsSegments,
  smsVersionSegments,
  versionSlotsRefusal,
  validateEmailVersion,
  validateSmsVersion,
  validateOwnVersion,
  campaignEmailRules,
  emailIssues,
  versionComponents,
  versionWords,
  renderOwnVersion,
  isReachOutRow,
  reachOutRowName,
  reachOutStepOf,
  versionsOf,
} from "./message-versions";
export type {
  VersionChannel,
  OwnVersionChannel,
  VersionWords,
  VersionCheck,
  EmailProblem,
  EmailIssue,
  EmailRules,
} from "./message-versions";
export {
  campaignMessageOf,
  campaignMessagesOf,
  messageHolds,
  messageWhyNot,
  MESSAGE_GONE_WORDS,
  whatsappStoppedRunWords,
} from "./campaign-message";
export type { CampaignMessage, CampaignMessageRow } from "./campaign-message";
export { fillSlots, numberedSlots, slotValueOf, slotWritten } from "./slot-sets";
export type { SlotKey, SlotSet, SlotValue } from "./slot-sets";
export {
  toSlotParts,
  fromSlotParts,
  partWritten,
  insertSlot,
  eraseSlot,
  clampWords,
  slotLabel,
  slotKnown,
  namedProblem,
} from "./message-version-slots";
export type { SlotPart, SlotEdit } from "./message-version-slots";
export { emailFoot, emailFootHtml } from "./email-foot";
export type { EmailFoot, LinkedFoot } from "./email-foot";
export { SENDER_WORDS, senderWords, senderLanguage } from "./sender-words";
export type { SenderWords, SenderLanguage } from "./sender-words";
export { starterPreviewValues, starterPreview, templatePreviewValues, templatePreview } from "./template-preview";
export type { OwnFacts } from "./template-preview";
export {
  footerOf,
  templateFooter,
  templateParts,
  templateBlocked,
  refusedWords,
  sendableTemplates,
  templateLinkButton,
} from "./template-parts";
export type { TemplateButton, TemplateParts } from "./template-parts";
export { TEMPLATE_TITLE_MAX, templateTitle, playbookName } from "./template-titles";
export {
  languageWords,
  languageLabels,
  LANGUAGE_GROUP_WORDS,
  messageLanguageChoices,
  templateUntranslatable,
} from "./message-languages";
export type { LanguageGroup, LanguageChoice } from "./message-languages";
export { inboxTemplates, inboxSlots, noTemplateWords, slotToWrite, templateHolds } from "./inbox-templates";
export type { InboxTemplateLike, TemplateHolds } from "./inbox-templates";
export {
  guessSlotKind,
  defaultSlotKinds,
  defaultParamSpecs,
  slotChoices,
  templateSlots,
  slotLabels,
} from "./template-slots";
export { starterIndex, compareTemplates, defaultTemplate, groupTemplates, bookingTemplate } from "./template-order";
export type { TemplateGroup } from "./template-order";
export { libraryCount, isLibrarySample } from "./library-count";
export {
  templateLanguage,
  languageName,
  languageLabel,
  languageTag,
  findLanguages,
  WHATSAPP_LANGUAGES,
} from "./template-languages";
export type { TemplateLanguage } from "./template-languages";
export { languageBase } from "./template-languages";
