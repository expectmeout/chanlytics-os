/**
 * The name a business is called by: its listing's name without what a listing adds to be found. Its own module, apart
 * from the cleaner (clean.ts), since every email's fill reads it (reach-out-rules reachOutValues), so every page that
 * draws an email loads it, and the cleaner's hosts and addresses stay with the pages that clean a listing.
 */
import { US_CODES } from "./plan";

/** A listing's keyword tail starts at a bar, a spaced dash, a colon or a semicolon: what follows is no part of a name. */
const NAME_TAIL = /\s*\|\s*|\s+[-–—]\s+|:\s+|;\s+/;
/** A company's form on the end of its name, a comma before it or not: "Corp.", ", INC", "LLC". */
const COMPANY_FORM = /,?\s+(?:inc|incorporated|llc|l\.l\.c|corp|corporation|ltd|pllc|llp)\.?$/i;
/** Words a name keeps in small letters, unless it starts with one. */
const NAME_JOINERS = new Set(
  "a an and at by da de del der du for in la le n of on or the to van von with y".split(" "),
);
/** Two letters a name in capitals says as a word, not as initials: "MY", not "AP". */
const TWO_LETTER_WORDS = new Set(["be", "do", "go", "hi", "is", "me", "my", "no", "so", "up", "we"]);
/** The two consonants a word may start with; any other two are letters said one by one ("HVAC", "CPA"). */
const WORD_ONSETS = new Set(
  "bl br ch cl cr dr dw fl fr gh gl gn gr kl kn kr ph pl pn pr ps rh sc sh sk sl sm sn sp sq st sw th tr ts tw wh wr".split(
    " ",
  ),
);
/** What makes a word's first two letters no run of consonants: a vowel, or a y ("Lynn"). */
const VOWEL = /[aeiouy]/;

const hasLetter = (s: string) => /\p{L}/u.test(s);
/** The cut, where it leaves a name; else what was there. */
const keptOr = (was: string, cut: string): string => (hasLetter(cut) ? cut.trim() : was);

/** A city on the end, with its state after it, or marked off by a dash or a comma: "-Springfield IL", " Springfield, IL". */
function withoutPlace(name: string, city: string | null | undefined): string {
  const c = city?.trim();
  if (!c) return name;
  const at = c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  const stated = name.match(new RegExp(`(?:\\s*[-–—,]\\s*|\\s+)${at},?\\s+([A-Za-z]{2})\\.?$`, "i"));
  if (stated && US_CODES.has((stated[1] ?? "").toUpperCase())) return name.slice(0, stated.index);
  const marked = name.match(new RegExp(`\\s*[-–—,]\\s*${at}$`, "i"));
  return marked ? name.slice(0, marked.index) : name;
}

/** What comes before a comma, where two words or more do: a name that starts with a list ("Paint, Paper & Tile") keeps it. */
function beforeComma(name: string): string {
  const head = name.split(/,\s+/)[0] ?? name;
  return head !== name && head.trim().split(" ").length >= 2 ? head : name;
}

/** One word of a name in capitals, as a person writes it: initials and letters said one by one stay. */
function saidFromCapitals(word: string, first: boolean): string {
  return word
    .split(/(?<=[-/])/)
    .map((part, i) => {
      const lower = part.toLowerCase();
      const letters = lower.replace(/[^\p{L}]/gu, "");
      if (!letters || /[\d.]/.test(part)) return part;
      if (NAME_JOINERS.has(letters) && !(first && i === 0)) return lower;
      if (letters.length <= 2 && !TWO_LETTER_WORDS.has(letters)) return part;
      if (!/[aeiou]/.test(letters)) return part;
      if (!VOWEL.test(letters.slice(0, 2)) && !WORD_ONSETS.has(letters.slice(0, 2))) return part;
      return lower
        .replace(/^(\P{L}*)(\p{L})/u, (_, lead: string, l: string) => lead + l.toUpperCase())
        .replace(/^(\p{L})'(\p{L})/u, (_, a: string, b: string) => `${a}'${b.toUpperCase()}`);
    })
    .join("");
}

/** A word wholly in small letters, raised as a name's are; a joiner stays small after the first word. */
const raised = (word: string, first: boolean): string =>
  /^\p{Ll}+(?:['’]\p{Ll}+)*$/u.test(word) && (first || !NAME_JOINERS.has(word))
    ? word.charAt(0).toUpperCase() + word.slice(1)
    : word;

/** A city's or a country's letters, said one by one wherever a name writes them ("Nyc" is NYC). */
const PLACE_INITIALS = new Set(["nyc", "usa", "ny", "nj", "dc", "sf", "uk", "atl"]);
/** As long as a word in capitals in a name not all in capitals gets before it is shouting, not the name's own ("NOVA"). */
const SHOUTED_AT = 6;

/**
 * One word of a name not all in capitals (the walk of 30 Oct 2026: "Euro Nyc AUTOWORKS"): a city's letters said one by
 * one, a long word in capitals said as a person writes it, else as `raised` says it.
 */
function saidInMixed(word: string, first: boolean): string {
  const letters = word.replace(/[^\p{L}]/gu, "");
  if (PLACE_INITIALS.has(letters.toLowerCase())) return word.toUpperCase();
  if (letters.length >= SHOUTED_AT && letters === letters.toUpperCase()) return saidFromCapitals(word, first);
  return raised(word, first);
}

/**
 * A name's capitals as a person writes them: one in capitals said in theirs; in any other, a long word in capitals said in
 * theirs too, a city's letters said one by one and a word in small letters raised.
 */
function casedAsSaid(name: string): string {
  const letters = name.replace(/[^\p{L}]/gu, "");
  const shouting = letters === letters.toUpperCase() && letters !== letters.toLowerCase();
  return name
    .split(" ")
    .map((w, i) => (shouting ? saidFromCapitals(w, i === 0) : saidInMixed(w, i === 0)))
    .join(" ");
}

/**
 * The name a business is called by in what it reads (30 Oct 2026: a cold email said "for shops like" a listing's whole
 * title, its city and three services after bars): its listing's name without what a listing adds to be found. A tail
 * after a bar, a spaced dash, a colon or a semicolon, or after a comma that follows two words; a city on the end with
 * its state, or marked off; Inc, LLC, Corp and the like; a name in capitals said in a person's, a long word in capitals
 * in any other name too ("AUTOWORKS"), a city's letters said one by one ("Nyc"), and a word in small letters raised.
 * What these cannot tell stays as its listing writes it: a name's own capitals ("NOVA", "iFix"), a city
 * with no state after it, services with no mark before them. Nothing is cut to nothing. The listing's name stays the
 * lead's, as Leads shows it; every email's fill says this (reach-out-rules reachOutValues), and so do the opening's
 * record and its check.
 */
export function leadCalledByOf(l: { business_name: string | null; city?: string | null }): string | null {
  const listed = (l.business_name ?? "").replace(/\s+/g, " ").trim();
  if (!listed) return null;
  // The first part that says something, unless it is only the city ("Springfield | Harbor Movers").
  const city = l.city?.trim().toLowerCase();
  const head = listed.split(NAME_TAIL).find((p) => hasLetter(p) && p.trim().toLowerCase() !== city) ?? listed;
  let name = keptOr(listed, head);
  name = keptOr(name, withoutPlace(name, l.city));
  name = keptOr(name, name.replace(COMPANY_FORM, ""));
  name = keptOr(name, beforeComma(name));
  name = keptOr(name, name.replace(COMPANY_FORM, ""));
  return casedAsSaid(name);
}
