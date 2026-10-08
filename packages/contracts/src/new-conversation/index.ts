/** A new conversation: which wire carries a message to a person, the sheet's words, and Ask's draft for one person. */
export { defaultWriteWire, startsOn, writeReachOf, writeWaysOf, WRITE_HOLDS, WRITE_HOLD_WORDS } from "./write-ways";
export type { WriteHold, WriteRow, WriteWay } from "./write-ways";
export {
  NEW_CONVERSATION_WORDS,
  approvedWordsFor,
  newConversationOf,
  planNoteOf,
  writeWayWords,
  writeWireName,
} from "./new-conversation-words";
export {
  DRAFT_ABOUT_MAX,
  DRAFT_ANSWER_MAX,
  DRAFT_ASKS_MAX,
  DRAFT_HOWS,
  DRAFT_TONES,
  PERSON_DRAFT_JSON_SCHEMA,
  PLAN_NOTE_MAX,
} from "./person-draft";
export type { CallBrief, DraftAsk, DraftHow, DraftTone, PersonDraftDto, PersonReachDto } from "./person-draft";
export { PersonDraftAnswerSchema, PersonDraftInputSchema, PersonMessageBodySchema } from "./person-draft-schema";
export type { PersonDraftAnswer, PersonDraftInput, PersonMessageBody } from "./person-draft-schema";
