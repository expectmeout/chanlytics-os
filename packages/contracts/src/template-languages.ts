/**
 * The languages WhatsApp takes a template in.
 *
 * Meta files a template under a name AND a language, so one message in three
 * languages is three templates at Meta and three rows here. That is the wire's
 * shape, not the owner's: to the owner it is one message, in whichever
 * languages it has, and a language is picked from a list -- by its name, in
 * English or in its own words -- never typed as a code or read as a row of
 * two-letter duplicates down a page.
 *
 * The set is Meta's own: WhatsApp Business Management API › Message templates ›
 * Supported languages, read 21 Sep 2026 -- 111 codes, a language alone ("es")
 * or a language where Meta files a place ("es_MX"). The composer offered six of
 * them. The places are spelled out ("UAE", not "ARE"), and each language carries
 * its own name for itself, so a search typed in it finds it: "português",
 * "deutsch", "中文".
 */

export interface TemplateLanguage {
  /** Meta's code, exactly as it files it: "en_US", "pt_BR", "fil", "prs_AF". */
  id: string;
  /** How a person reads it: "English (US)", "Portuguese (Brazil)", "Spanish". */
  label: string;
  /** The language alone, in English: "Portuguese". */
  name: string;
  /** The place, when Meta files one: "Brazil"; null for the language alone. */
  region: string | null;
  /** The language in its own words: "Português". */
  native: string;
}

const L = (id: string, name: string, region: string | null, native: string): TemplateLanguage => ({
  id,
  label: region ? `${name} (${region})` : name,
  name,
  region,
  native,
});

/** Every language WhatsApp takes a template in, in the order a person looks for one: by its English name. */
export const WHATSAPP_LANGUAGES: readonly TemplateLanguage[] = [
  L("af", "Afrikaans", null, "Afrikaans"),
  L("sq", "Albanian", null, "Shqip"),
  L("ar", "Arabic", null, "العربية"),
  L("ar_EG", "Arabic", "Egypt", "العربية"),
  L("ar_LB", "Arabic", "Lebanon", "العربية"),
  L("ar_MA", "Arabic", "Morocco", "العربية"),
  L("ar_QA", "Arabic", "Qatar", "العربية"),
  L("ar_AE", "Arabic", "UAE", "العربية"),
  L("az", "Azerbaijani", null, "Azərbaycan"),
  L("be_BY", "Belarusian", null, "Беларуская"),
  L("bn", "Bengali", null, "বাংলা"),
  L("bn_IN", "Bengali", "India", "বাংলা"),
  L("bg", "Bulgarian", null, "Български"),
  L("ca", "Catalan", null, "Català"),
  L("zh_CN", "Chinese", "China", "简体中文"),
  L("zh_HK", "Chinese", "Hong Kong", "繁體中文（香港）"),
  L("zh_TW", "Chinese", "Taiwan", "繁體中文（台灣）"),
  L("hr", "Croatian", null, "Hrvatski"),
  L("cs", "Czech", null, "Čeština"),
  L("da", "Danish", null, "Dansk"),
  L("prs_AF", "Dari", null, "دری"),
  L("nl", "Dutch", null, "Nederlands"),
  L("nl_BE", "Dutch", "Belgium", "Nederlands"),
  L("en", "English", null, "English"),
  L("en_AU", "English", "Australia", "English"),
  L("en_CA", "English", "Canada", "English"),
  L("en_GH", "English", "Ghana", "English"),
  L("en_IN", "English", "India", "English"),
  L("en_IE", "English", "Ireland", "English"),
  L("en_JM", "English", "Jamaica", "English"),
  L("en_MY", "English", "Malaysia", "English"),
  L("en_NZ", "English", "New Zealand", "English"),
  L("en_QA", "English", "Qatar", "English"),
  L("en_SG", "English", "Singapore", "English"),
  L("en_ZA", "English", "South Africa", "English"),
  L("en_AE", "English", "UAE", "English"),
  L("en_UG", "English", "Uganda", "English"),
  L("en_GB", "English", "UK", "English"),
  L("en_US", "English", "US", "English"),
  L("et", "Estonian", null, "Eesti"),
  L("fil", "Filipino", null, "Filipino"),
  L("fi", "Finnish", null, "Suomi"),
  L("fr", "French", null, "Français"),
  L("fr_BE", "French", "Belgium", "Français"),
  L("fr_CA", "French", "Canada", "Français"),
  L("fr_CI", "French", "Côte d’Ivoire", "Français"),
  L("fr_MA", "French", "Morocco", "Français"),
  L("fr_CH", "French", "Switzerland", "Français"),
  L("ka", "Georgian", null, "ქართული"),
  L("de", "German", null, "Deutsch"),
  L("de_AT", "German", "Austria", "Deutsch"),
  L("de_CH", "German", "Switzerland", "Deutsch"),
  L("el", "Greek", null, "Ελληνικά"),
  L("gu", "Gujarati", null, "ગુજરાતી"),
  L("ha", "Hausa", null, "Hausa"),
  L("he", "Hebrew", null, "עברית"),
  L("hi", "Hindi", null, "हिन्दी"),
  L("hu", "Hungarian", null, "Magyar"),
  L("id", "Indonesian", null, "Bahasa Indonesia"),
  L("ga", "Irish", null, "Gaeilge"),
  L("it", "Italian", null, "Italiano"),
  L("ja", "Japanese", null, "日本語"),
  L("kn", "Kannada", null, "ಕನ್ನಡ"),
  L("kk", "Kazakh", null, "Қазақ тілі"),
  L("rw_RW", "Kinyarwanda", null, "Ikinyarwanda"),
  L("ko", "Korean", null, "한국어"),
  L("ky_KG", "Kyrgyz", "Kyrgyzstan", "Кыргызча"),
  L("lo", "Lao", null, "ລາວ"),
  L("lv", "Latvian", null, "Latviešu"),
  L("lt", "Lithuanian", null, "Lietuvių"),
  L("mk", "Macedonian", null, "Македонски"),
  L("ms", "Malay", null, "Bahasa Melayu"),
  L("ml", "Malayalam", null, "മലയാളം"),
  L("mr", "Marathi", null, "मराठी"),
  L("nb", "Norwegian", null, "Norsk bokmål"),
  L("ps_AF", "Pashto", null, "پښتو"),
  L("fa", "Persian", null, "فارسی"),
  L("pl", "Polish", null, "Polski"),
  L("pt_BR", "Portuguese", "Brazil", "Português"),
  L("pt_PT", "Portuguese", "Portugal", "Português"),
  L("pa", "Punjabi", null, "ਪੰਜਾਬੀ"),
  L("ro", "Romanian", null, "Română"),
  L("ru", "Russian", null, "Русский"),
  L("sr", "Serbian", null, "Српски"),
  L("si_LK", "Sinhala", null, "සිංහල"),
  L("sk", "Slovak", null, "Slovenčina"),
  L("sl", "Slovenian", null, "Slovenščina"),
  L("es", "Spanish", null, "Español"),
  L("es_AR", "Spanish", "Argentina", "Español"),
  L("es_CL", "Spanish", "Chile", "Español"),
  L("es_CO", "Spanish", "Colombia", "Español"),
  L("es_CR", "Spanish", "Costa Rica", "Español"),
  L("es_DO", "Spanish", "Dominican Republic", "Español"),
  L("es_EC", "Spanish", "Ecuador", "Español"),
  L("es_HN", "Spanish", "Honduras", "Español"),
  L("es_MX", "Spanish", "Mexico", "Español"),
  L("es_PA", "Spanish", "Panama", "Español"),
  L("es_PE", "Spanish", "Peru", "Español"),
  L("es_ES", "Spanish", "Spain", "Español"),
  L("es_UY", "Spanish", "Uruguay", "Español"),
  L("sw", "Swahili", null, "Kiswahili"),
  L("sv", "Swedish", null, "Svenska"),
  L("ta", "Tamil", null, "தமிழ்"),
  L("te", "Telugu", null, "తెలుగు"),
  L("th", "Thai", null, "ไทย"),
  L("tr", "Turkish", null, "Türkçe"),
  L("uk", "Ukrainian", null, "Українська"),
  L("ur", "Urdu", null, "اردو"),
  L("uz", "Uzbek", null, "Oʻzbek"),
  L("vi", "Vietnamese", null, "Tiếng Việt"),
  L("zu", "Zulu", null, "isiZulu"),
];

const BY_ID: ReadonlyMap<string, TemplateLanguage> = new Map(WHATSAPP_LANGUAGES.map((l) => [l.id.toLowerCase(), l]));

/** "pt-BR", "pt_br" and "pt_BR" are one code. */
const keyOf = (code: string | null | undefined): string => String(code ?? "").trim().replace(/-/g, "_").toLowerCase();

/** The language WhatsApp files under this code, or null when WhatsApp takes no template in it. */
export function templateLanguage(code: string | null | undefined): TemplateLanguage | null {
  return BY_ID.get(keyOf(code)) ?? null;
}

/**
 * The language alone, in English, for any code: "en_US" and "en" are both
 * "English". The list's word where WhatsApp files the code, else what the
 * runtime calls its base ("pt-BR" is "Portuguese"), else the code itself.
 */
export function languageName(code: string): string {
  const known = templateLanguage(code);
  if (known) return known.name;
  const base = String(code ?? "").split(/[-_]/)[0];
  const Names = (Intl as unknown as { DisplayNames?: new (locales: string[], options: { type: "language" }) => { of(code: string): string | undefined } }).DisplayNames;
  try {
    const name = base && Names ? new Names(["en"], { type: "language" }).of(base) : undefined;
    return name && name !== base ? name : String(code ?? "");
  } catch {
    return String(code ?? "");
  }
}

/** A language as a person reads it, with its place when it has one: "English (US)", "Spanish". */
export function languageLabel(code: string): string {
  return templateLanguage(code)?.label ?? languageName(code);
}

/**
 * The language as a chip says it: "EN", "PT". Its place joins it only when
 * another code among the message's own shares the letters, so "EN-US" stands
 * beside "EN-GB" and a lone "EN" never carries a place nobody asked about.
 */
export function languageTag(code: string, among: readonly string[] = []): string {
  const [base = "", region = ""] = String(code ?? "").split(/[-_]/);
  const clash = among.some((c) => keyOf(c) !== keyOf(code) && String(c ?? "").split(/[-_]/)[0].toLowerCase() === base.toLowerCase());
  return clash && region ? `${base.toUpperCase()}-${region.toUpperCase()}` : base.toUpperCase();
}

/** Accents off and lower case: "Español" is found by "espanol". */
const fold = (s: string): string => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/**
 * The languages a search finds, best first: a code ("pt", "pt_BR"), then a
 * name that starts with what was typed ("port"), then its own name
 * ("portu", "deutsch"), then a word that starts with it -- a place ("brazil",
 * "mex") -- then anything that contains it. Nothing typed is the whole list, in
 * its order. A query only ever narrows: it never invents a language.
 */
export function findLanguages<T extends TemplateLanguage>(query: string, list: readonly T[] = WHATSAPP_LANGUAGES as readonly T[]): T[] {
  const q = fold(String(query ?? "").trim()).replace(/-/g, "_");
  if (!q) return [...list];
  const scored: Array<{ l: T; score: number; at: number }> = [];
  list.forEach((l, at) => {
    const code = l.id.toLowerCase();
    const name = fold(l.name);
    const label = fold(l.label);
    const native = fold(l.native);
    const words = [label, native].join(" ").split(/[\s(),’'（）]+/).filter(Boolean);
    let score = -1;
    if (code === q || code.split("_")[0] === q) score = 0;
    else if (name.startsWith(q) || label.startsWith(q)) score = 1;
    else if (native.startsWith(q)) score = 2;
    else if (words.some((w) => w.startsWith(q))) score = 3;
    else if (code.startsWith(q)) score = 4;
    else if (label.includes(q) || native.includes(q)) score = 5;
    if (score >= 0) scored.push({ l, score, at });
  });
  return scored.sort((a, b) => a.score - b.score || a.at - b.at).map((x) => x.l);
}
