/**
 * The questions that tell the quick path's forms from the model's, read by ask.test.mjs (contracts askIntent) and
 * ask-palette.test.mjs (the Line): the ordinary questions it answered without a model, matched anywhere in their words
 * (the end-to-end review, 15 October 2026, A1: a draft asked for got a list, another period got today's, a name and a
 * format were dropped), and the short forms that stay quick, the Line's own chips' words among them (contracts
 * ask-suggestions.ts).
 */
export const MODEL_QUESTIONS = [
  "Draft a reply to everyone waiting on me",
  "Write a text to the clients who missed calls this week",
  "Set up an offer to fill the openings next week",
  "Send Ana the booking link for Friday's opening",
  "Turn off the receptionist for openings questions",
  "How many missed calls did we have last month?",
  "Compare missed calls this week vs last week",
  "Any calls from Robin yesterday?",
  "Who called and what did they want?",
  "Why do people keep waiting for me so long?",
  "Give me a bullet list of who needs me",
  "Answer in one word: who needs me?",
  "¿Qué campañas tengo pendientes de aprobar?",
  "What's open next week for a balayage?",
];

/** Each short form, and which of the three it is. */
export const QUICK_FORMS = [
  ["who needs me?", "needs"],
  ["Who needs me right now?", "needs"],
  ["what's waiting on me", "needs"],
  ["¿Quién me necesita ahora?", "needs"],
  ["¿Qué tengo pendiente?", "needs"],
  ["any missed calls today?", "calls"],
  ["Did anyone call while I was busy?", "calls"],
  ["missed calls?", "calls"],
  ["who called today?", "calls"],
  ["¿Llamó alguien mientras estaba ocupada?", "calls"],
  ["llamadas perdidas", "calls"],
  ["what's open tomorrow?", "openings"],
  ["What's open Saturday?", "openings"],
  ["what's open saturday for a balayage", "openings"],
  ["any openings Friday?", "openings"],
  ["¿Qué hay libre el sábado?", "openings"],
  ["¿Hay disponibilidad mañana?", "openings"],
];
