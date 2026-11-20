/**
 * What code holds the ad writer's words to before an owner sees them (the Ads plan's 5.1; the skill says each rule to
 * the writer, and this is where it is kept, never on the prompt alone). One code for each thing that can be wrong.
 * Every issue is a reason not to show the words: a draft that fails is written again, and an ad with no words that
 * passed cannot be turned on.
 *
 * These are the refusals a small business's ad meets most, from Meta's own advertising rules, with Chanlytics' own
 * rule on prices (decision 0050, call 7). Each rule carries the date it was read: Meta's rules move, and the list is
 * read against Meta's pages again before it is relied on in a new step.
 *
 *  - Read 18 November 2026, Meta's advertising standards on personal attributes: an ad may describe the service, never
 *    the person reading it. "Do you have diabetes?" is refused; "New diabetes treatment available" is allowed.
 *  - Read 18 November 2026, Meta's rules on health and appearance: nothing that makes someone feel bad about how they
 *    look, no sure result, and before-and-after is restricted.
 *  - Read 19 November 2026, Meta's Ads Guide: what reads whole in each place (contracts ask/skills/ad/brief.ts adLengths).
 *  - Read 19 November 2026, Meta's special ad categories: an ad about a job, housing, financial products, politics or
 *    gambling is declared, and is not run here in the first version (contracts ads/draft.ts adSpecialKinds).
 *
 * The model writes and rewrites words. It never decides whether a check passed.
 *
 * The dashboard's server alone runs these (New ad's two routes and the writer), so they are its own code; the brief,
 * the answer's shape and the rubric are the contract (contracts ask/skills/ad).
 */
import {
  AD_BEFORE_AFTER,
  AD_VERSIONS,
  adLengths,
  adSpecialKinds,
  namesMoney,
  priceBreach,
  priceFigures,
  violatesNoPrices,
} from "@chanlytics/contracts";
import type { AdBrief, AdVersion } from "@chanlytics/contracts";

/** What can be wrong with an ad's words, one code each. */
export type AdIssueCode =
  | "count"
  | "empty"
  | "text_long"
  | "headline_long"
  | "same_versions"
  | "about_reader"
  | "feel_bad"
  | "sure_result"
  | "before_after"
  | "pressure"
  | "special_kind"
  | "price_off"
  | "new_price"
  | "new_money"
  | "new_number"
  | "typed_contact"
  | "shouting";

export interface AdIssue {
  /** Which version, counted from 1; 0 for the set as a whole. */
  version: number;
  code: AdIssueCode;
  /** What is wrong, for the log and the eval. */
  words: string;
}

/**
 * A question put to the reader about themselves, or their own body, health, age or money named as theirs, in English
 * and Spanish. "Your appointment" and "a time that suits you" are neither: they name nothing about the person.
 */
const AD_ASKS_READER =
  /\b(?:are|were|aren't) you\b|\bdo(?:n't)? you (?:have|suffer|struggle|feel|hate|worry|need help)\b|\b(?:tired|sick|ashamed|embarrassed) of\b|\b(?:struggling|suffering|dealing|living) (?:with|from)\b|¿\s*(?:eres|est[aá]s|tienes|sufres|padeces|te sientes|te preocupa|te molesta)\b|\b(?:cansad[oa]s?|hart[oa]s?) de\b/i;
// Up to two words may sit between ("your lower back pain"). Its edges are read by letters, not by `\b`, which does not
// know an accented one: "tu acné" ends on a letter `\b` takes for none.
const AD_READERS_OWN =
  /\b(?:your|tus?)\s+(?:[\p{L}'-]+\s+){0,2}(?:skin|wrinkles?|weight|body|belly|acne|scars?|pain|aches?|debts?|credit|age|anxiety|depression|condition|diagnosis|illness|disability|income|piel|arrugas?|peso|cuerpo|barriga|acn[eé]|cicatri(?:z|ces)|dolor(?:es)?|deudas?|cr[eé]dito|edad|ansiedad|depresi[oó]n|enfermedad|discapacidad|ingresos?)(?![\p{L}\d])/iu;
/** Words that make someone feel bad about how they look. */
const AD_FEEL_BAD =
  /\b(?:ugly|flabby|unsightly|embarrassing|insecure|self-conscious|flaws?|imperfections?|get rid of your|fix your|hate (?:your|the way you)|fe[oa]s?|flácid[oa]s?|vergüenza|avergonzad[oa]s?|defectos?|imperfecciones|complejos?|insegur(?:o|a|idad))\b/i;
/** A result promised for sure. */
const AD_SURE_RESULT =
  /\b(?:guarantee[ds]?|risk[- ]free|miracle|cures?|cured|permanent(?:ly)?|forever|instant(?:ly)? results?|results? in (?:just )?\d+|never again|for sure|garant[ií]a|garantizad[oa]s?|garantizamos|sin riesgo|milagros?|cura(?:mos|r)?|permanentes?|para siempre|resultados? (?:inmediatos?|garantizados?|en \d+)|nunca m[aá]s)\b/i;
/** Hurry put on the reader. An owner's own deadline, where the facts hold it, is theirs to say. */
const AD_PRESSURE =
  /(?<![\p{L}\d])(?:last chance|hurry|don't miss|act now|limited time|today only|while (?:supplies|spots) last|only \d+ (?:spots?|left)|[uú]ltima oportunidad|date prisa|ap[uú]rate|no te lo pierdas|solo (?:por )?hoy|tiempo limitado|quedan pocos?)\b/iu;
/** A freebie said in words. */
const AD_FREE = /\b(?<!feel )free\b(?! to\b)|\bgratis\b|\bgratuit[oa]s?\b/i;
/** A link, an email address or a phone number typed in: a tap on the ad is how a person reaches the business. */
const AD_CONTACT = /https?:\/\/|\bwww\.|[\w.+-]+@[\w-]+\.[a-z]{2,}|\+?\d[\d ().-]{7,}\d/i;
/** A word of four capitals or more: shouting, unless it is the business's own or the service's. */
const AD_CAPS = /(?<![\p{L}\d])[\p{Lu}]{4,}(?![\p{L}\d])/gu;
/** Every number written in figures. */
const adFigures = (text: string): string[] => text.match(/\d+(?:[.,:]\d+)*/g) ?? [];

/** Everything the ad may lean on: the service, its price line, the owner's facts, and the business's own name. */
function adBriefHeld(adBrief: AdBrief): string {
  return [adBrief.business.name, adBrief.service.name, adBrief.service.price ?? "", ...adBrief.facts].join("\n");
}

/** Whether a rule's own words are the owner's: said in the service's name or in a fact they stand behind. */
const ownersOwn = (pattern: RegExp, text: string, held: string): boolean => {
  const found = pattern.exec(text);
  return found !== null && held.toLowerCase().includes(found[0].toLowerCase());
};

interface AdRule {
  code: AdIssueCode;
  pattern: RegExp;
  words: string;
  /** Whether the owner's own words excuse it: a service called "Permanent makeup", a deadline they gave. */
  owners: boolean;
}

const AD_RULES: readonly AdRule[] = [
  {
    code: "about_reader",
    pattern: AD_ASKS_READER,
    words: "a question or a claim about the person reading",
    owners: false,
  },
  {
    code: "about_reader",
    pattern: AD_READERS_OWN,
    words: "the reader's own body, health, age or money",
    owners: false,
  },
  {
    code: "feel_bad",
    pattern: AD_FEEL_BAD,
    words: "words that make someone feel bad about how they look",
    owners: false,
  },
  { code: "sure_result", pattern: AD_SURE_RESULT, words: "a result promised for sure", owners: true },
  { code: "before_after", pattern: AD_BEFORE_AFTER, words: "before and after", owners: false },
  { code: "pressure", pattern: AD_PRESSURE, words: "hurry put on the reader", owners: true },
];

/** What one version's words may not say, whatever the brief holds, and what they may say only where it does. */
function adWordIssues(version: number, text: string, adBrief: AdBrief): AdIssue[] {
  const out: AdIssue[] = [];
  const at = (code: AdIssueCode, words: string) => out.push({ version, code, words });
  const held = adBriefHeld(adBrief);
  const seen = new Set<AdIssueCode>();
  for (const rule of AD_RULES) {
    if (seen.has(rule.code) || !rule.pattern.test(text)) continue;
    if (rule.owners && ownersOwn(rule.pattern, text, held)) continue;
    seen.add(rule.code);
    at(rule.code, rule.words);
  }
  const kinds = adSpecialKinds(text);
  if (kinds.length) at("special_kind", `reads as an ad Meta asks to be declared: ${kinds.join(", ")}`);
  if (adBrief.business.neverPrices) {
    if (violatesNoPrices(text)) at("price_off", "a price, while this business never quotes one");
  } else if (priceBreach(text, new Set(priceFigures(held))))
    at("new_price", "a price or a share the brief does not hold");
  if ((namesMoney(text) && !namesMoney(held)) || (AD_FREE.test(text) && !AD_FREE.test(held)))
    at("new_money", "a discount, a free thing or a payment term the brief does not hold");
  const known = new Set(adFigures(held));
  const extra = adFigures(text).filter((figure) => !known.has(figure));
  if (extra.length) at("new_number", `numbers the brief does not hold: ${[...new Set(extra)].join(", ")}`);
  if (AD_CONTACT.test(text)) at("typed_contact", "a web address, an email address or a phone number written out");
  const own = new Set(held.match(AD_CAPS) ?? []);
  const loud = (text.match(AD_CAPS) ?? []).filter((word) => !own.has(word));
  if (loud.length) at("shouting", `capitals for emphasis: ${[...new Set(loud)].join(", ")}`);
  return out;
}

/** How many versions a job answers: three for a draft and for changed words, one for a version written again. */
const versionsWanted = (adBrief: AdBrief): number => (adBrief.job === "rewrite" ? 1 : AD_VERSIONS);

/**
 * Everything wrong with what the writer wrote, version by version: the wrong number of versions, an empty part, a part
 * longer than reads whole where the ad shows, two versions with the same text, and each version's own words. Empty when
 * the words may be shown.
 */
export function adCraftIssues(versions: readonly AdVersion[], adBrief: AdBrief): AdIssue[] {
  const out: AdIssue[] = [];
  const wanted = versionsWanted(adBrief);
  if (versions.length !== wanted)
    out.push({ version: 0, code: "count", words: `${versions.length} versions, asked ${wanted}` });
  const lengths = adLengths(adBrief.places);
  const texts = new Set<string>();
  versions.forEach((adVersion, nth) => {
    const version = nth + 1;
    if (!adVersion.text || !adVersion.headline) {
      out.push({ version, code: "empty", words: "a text and a headline, each with words" });
      return;
    }
    if (adVersion.text.length > lengths.text)
      out.push({ version, code: "text_long", words: `a text of ${adVersion.text.length}, at most ${lengths.text}` });
    if (adVersion.headline.length > lengths.headline)
      out.push({
        version,
        code: "headline_long",
        words: `a headline of ${adVersion.headline.length}, at most ${lengths.headline}`,
      });
    const key = adVersion.text.toLowerCase();
    if (texts.has(key)) out.push({ version, code: "same_versions", words: "the same text as another version" });
    texts.add(key);
    out.push(...adWordIssues(version, `${adVersion.headline}\n${adVersion.text}`, adBrief));
  });
  return out;
}
