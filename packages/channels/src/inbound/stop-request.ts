/**
 * Whether a customer's message asks to stop, read from its words alone.
 *
 * The keyword patterns (contracts OPT_OUT_PATTERN, SMS_OPT_OUT_PATTERN) read one word and nothing else: STOP, BAJA,
 * ALTO, UNSUBSCRIBE, and on a texting line the carriers' own list. A person who wrote the same thing as a sentence
 * ("please stop texting me", "no me escriban más") was read as asking for nothing, and the receptionist answered
 * them. This reads the sentences too, in English and Spanish, and it is the one reading both wires take: WhatsApp's
 * normaliser (whatsapp.ts) and a texting line's keyword consent (lines/sms.ts).
 *
 * WHOLE-MESSAGE ONLY, as the keywords are. The message is the request and nothing more, once its courtesy and its
 * punctuation are set aside: "stop texting me, please." is one; "stop by at 4?" and "please stop the 8 AM reminder, noon
 * is fine" are not, and reach the receptionist as the questions they are. A message that asks to stop and says
 * something else beside it is a person's to read, not a pattern's.
 *
 * Deterministic, so a STOP never waits on a model or a database. Lives here and not in contracts because only the
 * wires' normalisers read it, and a page's bundle loads everything contracts exports.
 */
import { OPT_OUT_PATTERN, SMS_OPT_OUT_PATTERN } from "@chanlytics/contracts";

/** The wire a message came in on: a texting line keeps the carriers' own words beside the product's. */
type StopWire = "whatsapp" | "sms";

/** Courtesy at either end of a request, which changes nothing it asks. */
const LEADING = /^(?:please|pls|plz|por favor|porfa|porfavor|hey|hi|hello|hola|ok|okay|ya) /;
const TRAILING = / (?:please|pls|plz|por favor|porfa|porfavor|thanks|thank you|thx|gracias|now|ya)$/;

/**
 * The words as a pattern reads them: lower case, accents off ("más" as "mas", "número" as "numero"), one kind of
 * apostrophe, punctuation and emoji as spaces, and the courtesy at either end set aside.
 */
function plain(words: string): string {
  let s = words
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[‘’`´]/g, "'")
    .replace(/[^a-z0-9' ]+/g, " ")
    .replace(/ +/g, " ")
    .trim();
  for (let before = ""; before !== s;) {
    before = s;
    s = s.replace(LEADING, "").replace(TRAILING, "");
  }
  return s;
}

const NOT = "(?:do not|don't|dont)";
const AGAIN = "(?: (?:again|anymore|any more|ever again))?";
const TEXTS = "(?:messages|texts|sms)";

/** A request to stop, in English: each the whole of what was written. */
const ENGLISH: readonly string[] = [
  "stop (?:it|this|that)",
  `stop (?:texting|messaging|contacting|calling|emailing|writing|writing to|bothering|spamming)(?: (?:me|us))?${AGAIN}`,
  `stop sending(?: (?:me|us))?(?: (?:${TEXTS}|these|this|these ${TEXTS}|your ${TEXTS}|anything))?${AGAIN}`,
  `${NOT} (?:text|message|contact|call|write|write to|email|bother|spam) (?:me|us)${AGAIN}`,
  `${NOT} send (?:me|us) (?:${TEXTS}|anything|any ${TEXTS}|more ${TEXTS}|any more ${TEXTS})${AGAIN}`,
  "(?:remove|delete) (?:me|my number|my phone number|my info|my information)(?: from (?:your|this|the) (?:list|lists|database|system|contacts|mailing list))?",
  "take (?:me|my number) off(?: (?:of )?(?:your|this|the) (?:list|lists|database|system|contacts|mailing list))?",
  "(?:i (?:want|wish|would like|'d like) to )?(?:opt out|opt me out|unsubscribe me|unsubscribe)",
  `no more (?:${TEXTS}|contact)`,
  "leave me alone",
  `i ${NOT} want (?:any more |anymore |more |these |your |any )?${TEXTS}(?: (?:anymore|any more|from you))?`,
  `i ${NOT} want to (?:receive|get) (?:any more |anymore |more |these |your |any )?${TEXTS}(?: (?:anymore|any more|from you))?`,
  `i ${NOT} want to be (?:texted|contacted|messaged)${AGAIN}`,
];

const MENSAJES = "(?:mensajes|textos)";

/** The same, in Spanish, as `plain` leaves it: no accents, no opening marks. */
const SPANISH: readonly string[] = [
  `(?:ya )?no (?:me|nos) (?:escribas|escriban|escriba|mandes|manden|mande|envies|envien|envie|llames|llamen|llame|contactes|contacten|contacte|molestes|molesten|moleste|textees|texteen)(?: mas)?(?: ${MENSAJES})?`,
  `(?:deja|dejen|deje|para|paren|pare) de (?:escribirme|escribirnos|mandarme ${MENSAJES}|mandar ${MENSAJES}|enviarme ${MENSAJES}|enviar ${MENSAJES}|molestarme|molestar|contactarme|llamarme|textearme)`,
  `no quiero (?:recibir )?(?:mas |sus |tus |estos )?${MENSAJES}(?: de ustedes)?`,
  "no quiero que me (?:escriban|escribas|contacten|llamen|molesten)(?: mas)?",
  "(?:dame|denme|deme|darme|quiero darme|me quiero dar|quiero que me den|favor de darme) de baja",
  `no mas ${MENSAJES}`,
  "(?:borra|borren|borre|elimina|eliminen|elimine|quita|quiten|quite|saca|saquen|saque) (?:mi numero|mi telefono|mis datos)(?: de (?:su|la|tu|esta) lista)?",
  "(?:borrame|borrenme|eliminame|eliminenme|quitame|quitenme|sacame|saquenme)(?: de (?:su|la|tu|esta) lista)?",
  "cancel(?:a|ar|en) (?:mi |la )?suscripcion",
];

const SENTENCE = new RegExp(`^(?:${[...ENGLISH, ...SPANISH].join("|")})$`);

/**
 * True when the message, whole, asks to stop: one of the wire's keywords, or one of the sentences above. What the
 * person wrote is handed in as they wrote it; a button's id is too, so a workspace's localised button stops by its id.
 */
export function asksToStop(words: string | null | undefined, wire: StopWire): boolean {
  if (!words) return false;
  if ((wire === "sms" ? SMS_OPT_OUT_PATTERN : OPT_OUT_PATTERN).test(words)) return true;
  return SENTENCE.test(plain(words));
}
