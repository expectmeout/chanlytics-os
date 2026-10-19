/** The journey: what a workspace calls an appointment, and the moments its customers pass through, in order. */
export {
  APPOINTMENT_WORDS,
  APPOINTMENT_WORD_REFUSAL,
  appointmentWordOf,
  appointmentWordSaved,
  appointmentWordVM,
  appointmentWords,
  isAppointmentWord,
} from "./appointment-word";
export type { AppointmentPhrases, AppointmentWord, AppointmentWordVM } from "./appointment-word";
export { JOURNEY_STAGE_IDS, journeyOf, journeyStageOf } from "./journey";
export type { JourneyGlyph, JourneyStage, JourneyStageId } from "./journey";
export { journeyGuide } from "./journey-guide";
export type { GuideRow } from "./journey-guide";
export type { PlanLead } from "./journey-plan";
