/**
 * What a visitor's form says that its owner did not write (the Forms plan, 3.4 and 3.12; the canvas's call 14: a form
 * is in one language, all of it): the press, each mistake beside its field, the thank-you's own lines, what a closed
 * form says, and the first words of the message that opens in a chat.
 *
 * The house has every line in English and in Spanish, and those are never overridden. A form in any other language
 * carries its own under the same names, written with the form and kept with its version (shape.ts `words`). A line
 * names its parts in braces ({business}, {name}); one that lost a part it must name is not used, and the house's
 * English stands in for that line alone, so a form never says half a sentence. A mistake is a code where answers are
 * read and on the wire (answers.ts); only here does it become words. Pure.
 */
import type { FormProblem } from "./answers";
import {
  answerLimitOf,
  FORM_PAGE_WORD_KEYS,
  type FormDescription,
  type FormField,
  type FormPageWordKey,
} from "./shape";

/** Every line the page says, by its name. */
export type FormPageWords = Record<FormPageWordKey, string>;

const ENGLISH: FormPageWords = {
  send: "Send request",
  optional: "optional",
  sending: "Sending",
  keep_open: "Keep this page open a moment.",
  booked: "{business} will answer you. Nothing is booked until they confirm a time with you.",
  thanks: "Thanks, {name}",
  thanks_plain: "Thanks",
  chat: "Continue on WhatsApp",
  chat_help: "Quicker: send the message that opens, and {business} answers you there.",
  chat_only: "One more step: send the message that opens in WhatsApp, and {business} will answer you there.",
  or_call: "Or wait for a call on {phone}. {business} can't text you first.",
  will_call: "{business} will call you on {phone}.",
  by_email: "{business} replies by email, to {email}.",
  closed: "This form is closed",
  closed_lead: "{business} isn't taking requests here at the moment.",
  message_business: "Message {business}",
  unsent: "Not sent yet: no connection",
  unsent_lead: "Your answers are kept here. It sends by itself as soon as you're back online.",
  try_now: "Try now",
  changed: "{business} updated this form",
  changed_lead: "Your answers are still here. Check what is new, then send.",
  sent_already: "You've sent this",
  sent_lead: "{business} has your request.",
  send_another: "Send another request",
  did_you_mean: "Did you mean {address}?",
  too_much: "Make your answers shorter, then send again.",
  privacy: "Privacy and terms",
  chat_hello: "Hi {business}, it's {name}.",
  chat_hello_plain: "Hi {business}.",
  chat_about: "I sent a request: {heading}.",
  problem_needed: '"{label}" needs an answer.',
  problem_too_long: "Make it shorter: at most {max} characters.",
  problem_not_an_email: "That isn't an email address.",
  problem_not_a_phone: "That isn't a phone number.",
  problem_one_choice: "Choose one of the choices.",
  problem_not_a_choice: "Choose from the choices given.",
  problem_no_way_to_answer: "An email address or a phone number is needed, so they can answer you.",
  // The printed sheet's one line of its own (server/public/form-sign.ts): what to do with the code.
  scan: "Point your phone's camera here.",
  // A time asked for (F3): the press, the choice that is no time, the thank-you's lines, and a time gone or too short.
  ask_time: "Ask for this time",
  none_of_these: "None of these work",
  time_confirm: "{business} confirms it with you. Nothing is booked until they do.",
  asked_for: "You asked for {time}.",
  confirm_by_email: "{business} will confirm it with you by email, at {email}.",
  time_sub: "Nothing is booked until they confirm it.",
  time_taken: "{time} was just taken",
  time_taken_lead: "Your answers are still here. These times are open now.",
  time_short: "{service} takes longer",
  time_short_lead: "{time} doesn't leave enough time. These fit.",
  book_page: "Pick a time on {business}'s booking page",
  book_page_lead: "It opens their own page",
  sent_time: "You asked {business} for {time}. They'll confirm it with you.",
  day_at_time: "{day} at {time}",
};

const SPANISH_PAGE: FormPageWords = {
  send: "Enviar solicitud",
  optional: "opcional",
  sending: "Enviando",
  keep_open: "Deja esta página abierta un momento.",
  booked: "{business} te responderá. Nada queda reservado hasta que confirmen una hora contigo.",
  thanks: "Gracias, {name}",
  thanks_plain: "Gracias",
  chat: "Continuar en WhatsApp",
  chat_help: "Más rápido: envía el mensaje que se abre y {business} te responde ahí.",
  chat_only: "Un paso más: envía el mensaje que se abre en WhatsApp y {business} te responderá ahí.",
  or_call: "O espera una llamada al {phone}. {business} no puede escribirte primero.",
  will_call: "{business} te llamará al {phone}.",
  by_email: "{business} responde por correo, a {email}.",
  closed: "Este formulario está cerrado",
  closed_lead: "{business} no está recibiendo solicitudes aquí por ahora.",
  message_business: "Escribir a {business}",
  unsent: "Aún no se envió: sin conexión",
  unsent_lead: "Tus respuestas están guardadas aquí. Se envía solo en cuanto vuelvas a tener conexión.",
  try_now: "Intentar ahora",
  changed: "{business} actualizó este formulario",
  changed_lead: "Tus respuestas siguen aquí. Revisa lo nuevo y envía.",
  sent_already: "Ya enviaste esto",
  sent_lead: "{business} tiene tu solicitud.",
  send_another: "Enviar otra solicitud",
  did_you_mean: "¿Quisiste decir {address}?",
  too_much: "Acorta tus respuestas y envía de nuevo.",
  privacy: "Privacidad y términos",
  chat_hello: "Hola {business}, soy {name}.",
  chat_hello_plain: "Hola {business}.",
  chat_about: "Envié una solicitud: {heading}.",
  problem_needed: '"{label}" necesita una respuesta.',
  problem_too_long: "Hazlo más corto: {max} caracteres como máximo.",
  problem_not_an_email: "Eso no es un correo electrónico.",
  problem_not_a_phone: "Eso no es un número de teléfono.",
  problem_one_choice: "Elige una de las opciones.",
  problem_not_a_choice: "Elige entre las opciones dadas.",
  problem_no_way_to_answer: "Hace falta un correo o un teléfono, para que puedan responderte.",
  scan: "Apunta aquí la cámara de tu teléfono.",
  ask_time: "Pedir esta hora",
  none_of_these: "Ninguna me va bien",
  time_confirm: "{business} te la confirma. Nada queda reservado hasta entonces.",
  asked_for: "Pediste {time}.",
  confirm_by_email: "{business} te la confirmará por correo, a {email}.",
  time_sub: "Nada queda reservado hasta que te la confirmen.",
  time_taken: "{time} se acaba de ocupar",
  time_taken_lead: "Tus respuestas siguen aquí. Estas horas están libres ahora.",
  time_short: "{service} lleva más tiempo",
  time_short_lead: "{time} no deja tiempo suficiente. Estas sí.",
  book_page: "Elige una hora en la página de reservas de {business}",
  book_page_lead: "Se abre su propia página",
  sent_time: "Pediste {time} a {business}. Te la confirmarán.",
  day_at_time: "{day} a las {time}",
};

/** The languages whose words are the house's own, by the first part of a language's tag. */
const HOUSE_WORDS: Record<string, FormPageWords> = { en: ENGLISH, es: SPANISH_PAGE };

/** The parts each of the house's English lines names: a version's line that lost one is not used. */
const partsNamed = (line: string): string[] => line.match(/\{[a-z]+\}/g) ?? [];

/**
 * Every line the page of this form says: the house's own for English and Spanish; for any other language the
 * version's own lines over the house's English, each used only when it names every part the English line names.
 */
export function formPageWords(form: Pick<FormDescription, "lang" | "words">): FormPageWords {
  const house = HOUSE_WORDS[form.lang.slice(0, 2).toLowerCase()];
  if (house) return house;
  const own = form.words ?? {};
  const lines = { ...ENGLISH };
  for (const key of FORM_PAGE_WORD_KEYS) {
    const line = own[key];
    if (line && partsNamed(ENGLISH[key]).every((part) => line.includes(part))) lines[key] = line;
  }
  return lines;
}

/** A line with its parts put in: {business}, {name} and the rest, each by its name. A part with no value stays out. */
export function fillWords(line: string, parts: Record<string, string | number | null | undefined>): string {
  return line.replace(/\{([a-z]+)\}/g, (_whole, name: string) => String(parts[name] ?? ""));
}

/** A problem beside its field, as a sentence in the form's own language. */
export function formProblemWords(
  problem: FormProblem,
  field: FormField,
  form: Pick<FormDescription, "lang" | "words">,
): string {
  return fillWords(formPageWords(form)[`problem_${problem}`], { label: field.label, max: answerLimitOf(field) });
}
