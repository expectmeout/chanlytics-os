/**
 * The person page (decision 0052, canvas A): the head and the business a person works at, the business sheet, the
 * signer's name and its gate, the notices, Up next, the figures and the tabs as addresses.
 */
export { asNameSource, BUSINESS_DOOR_LABEL, NAME_SOURCES, PERSON_NAME_WORDS, WORKS_AT_WORDS } from "./words";
export type { NameSource } from "./words";
export { AUTOMATIC_NAMING, isPersonsName, SIGNER_MAX, signerAgrees, signerOf } from "./signer";
export type { Signer, SignerFacts } from "./signer";
export { businessRecordOf, businessTrailOf, personHeadOf, worksAtOf } from "./business";
export type {
  BusinessPersonVM,
  BusinessRecordVM,
  PersonFaceVM,
  PersonHeadInput,
  PersonHeadLine,
  PersonHeadVM,
  WorksAtVM,
} from "./business";
export {
  PERSON_FIGURES_LABEL,
  PERSON_TAB_WORDS,
  PERSON_TABS,
  PERSON_TABS_LABEL,
  personRouteOf,
  personTabRoute,
  personTabsOf,
} from "./route";
export type { PersonTab, PersonTabFacts, PersonTabVM } from "./route";
export { personFiguresOf } from "./figures";
export type { PersonFigureFacts, PersonFigureVM } from "./figures";
export { personNextOf, UP_NEXT_WORDS } from "./next";
export type { UpNextAct, UpNextFacts, UpNextRowVM, UpNextVM } from "./next";
export { LAST_WORDS_TITLE, lastWordsOf } from "./last-words";
export type { LastWordVM } from "./last-words";
export { personNoticesOf } from "./notices";
export type { NoticeAct, NoticeFacts, NoticeHome, NoticeVM } from "./notices";
export { PersonNameActSchema, PersonWorksAtSchema } from "./schemas";
export type { PersonNameAct } from "./schemas";
