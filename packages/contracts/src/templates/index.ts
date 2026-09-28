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
export type { StarterSlotKind, StarterSlot, StarterText, StarterTemplate } from "./starter-templates";
export {
  starterByName,
  starterByKey,
  startersOffered,
  starterForTrigger,
  starterText,
  starterDraft,
} from "./starter-lookup";
export { starterPreviewValues, starterPreview, templatePreviewValues, templatePreview } from "./template-preview";
export type { OwnFacts } from "./template-preview";
export {
  footerOf,
  templateFooter,
  templateParts,
  templateBlocked,
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
export { inboxTemplates, inboxSlots, slotToWrite } from "./inbox-templates";
export type { InboxTemplateLike } from "./inbox-templates";
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
