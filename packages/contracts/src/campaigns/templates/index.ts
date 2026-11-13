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
export {
  WHATSAPP_TEMPLATES_CREATE_DOOR,
  WHATSAPP_TEMPLATES_DELETE_DOOR,
  WHATSAPP_TEMPLATES_EDIT_DOOR,
  WHATSAPP_TEMPLATES_SYNC_DOOR,
} from "./edge-doors";
export { customerEmailFoot, emailFoot, emailFootHtml, hasFootAddress } from "./email-foot";
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
export {
  findLanguages,
  languageLabel,
  languageName,
  languageTag,
  templateLanguage,
  WHATSAPP_LANGUAGES,
} from "./languages";
export { languageBase } from "./languages";
export type { TemplateLanguage } from "./languages";
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
  EMAIL_BODY_MAX,
  EMAIL_SUBJECT_MAX,
  noVersionWords,
  OWN_VERSION_CHANNELS,
  SMS_SEGMENTS_MAX,
  smsSegments,
  smsStopLine,
  smsVersionSegments,
  VERSION_CHANNEL_WORDS,
  VERSION_CHANNELS,
  versionWord,
} from "./message-versions/channels";
export type { OwnVersionChannel, VersionChannel } from "./message-versions/channels";
export {
  campaignEmailRules,
  emailIssues,
  isReachOutRow,
  keepsValues,
  reachOutRowName,
  reachOutStepOf,
  renderOwnVersion,
  validateEmailVersion,
  validateOwnVersion,
  validateSmsVersion,
  versionComponents,
  versionSlotsRefusal,
  versionsOf,
  versionWords,
} from "./message-versions/email-rules";
export type { EmailIssue, EmailProblem, EmailRules, VersionCheck, VersionWords } from "./message-versions/email-rules";
export { bookingTemplate, compareTemplates, defaultTemplate, groupTemplates, starterIndex } from "./order";
export type { TemplateGroup } from "./order";
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
  playbooksStillSending,
  resolveParams,
  testParamsOf,
} from "./params";
export type { ParamFacts, ParamSourceKind, ParamSpec } from "./params";
export {
  footerOf,
  refusedWords,
  sendableTemplates,
  templateBlocked,
  templateFooter,
  templateLinkButton,
  templateParts,
} from "./parts";
export type { TemplateButton, TemplateParts } from "./parts";
export { SENDER_WORDS, senderLanguage, senderWords } from "./sender-words";
export type { SenderLanguage, SenderWords } from "./sender-words";
export { fillSlots, numberedSlots, slotValueOf, slotWritten } from "./slot-sets";
export { slotMentions, slotOutside, slotsOut } from "./slot-sets";
export type { SlotKey, SlotSet, SlotValue } from "./slot-sets";
export { defaultParamSpecs, defaultSlotKinds, guessSlotKind, slotChoices, slotLabels, templateSlots } from "./slots";
export type { VariableLike } from "./slots";
export {
  STARTER_MOMENTS,
  starterByKey,
  starterByName,
  starterDraft,
  starterEmailText,
  starterForTrigger,
  starterMoment,
  startersForTrigger,
  starterSmsText,
  startersOffered,
  starterText,
} from "./starter-lookup";
export type { StarterMoment } from "./starter-lookup";
export { messageLanguageCode, STARTER_LANGUAGES } from "./starter-templates/shapes";
export type {
  StarterEmailText,
  StarterSlot,
  StarterSlotKind,
  StarterSmsText,
  StarterTemplate,
  StarterText,
} from "./starter-templates/shapes";
export { STARTER_TEMPLATES } from "./starter-templates/table";
export {
  placeholdersOf,
  placeholdersSequential,
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
  templateBodyTooLong,
  templateComponents,
  templateNameOk,
  validateTemplateDraft,
} from "./templates";
export type { TemplateCategoryChoice, TemplateDraft, TemplateDraftCheck, TemplateDraftInput } from "./templates";
export { playbookName, TEMPLATE_TITLE_MAX, templateTitle } from "./titles";
export {
  templateSends,
  templateSendsOf,
  templateSentWords,
  templateUnused,
  templateUsage,
  templateUseNote,
  templateUseWords,
} from "./usage";
export type { TemplateSends, TemplateSendSource, TemplateSentWords, TemplateUse, TemplateUseSource } from "./usage";
