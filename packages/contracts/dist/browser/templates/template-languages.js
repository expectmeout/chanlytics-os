const L = (id, name, region, native) => ({
  id,
  label: region ? `${name} (${region})` : name,
  name,
  region,
  native
});
export const WHATSAPP_LANGUAGES = [
  L("af", "Afrikaans", null, "Afrikaans"),
  L("sq", "Albanian", null, "Shqip"),
  L("ar", "Arabic", null, "\u0627\u0644\u0639\u0631\u0628\u064A\u0629"),
  L("ar_EG", "Arabic", "Egypt", "\u0627\u0644\u0639\u0631\u0628\u064A\u0629"),
  L("ar_LB", "Arabic", "Lebanon", "\u0627\u0644\u0639\u0631\u0628\u064A\u0629"),
  L("ar_MA", "Arabic", "Morocco", "\u0627\u0644\u0639\u0631\u0628\u064A\u0629"),
  L("ar_QA", "Arabic", "Qatar", "\u0627\u0644\u0639\u0631\u0628\u064A\u0629"),
  L("ar_AE", "Arabic", "UAE", "\u0627\u0644\u0639\u0631\u0628\u064A\u0629"),
  L("az", "Azerbaijani", null, "Az\u0259rbaycan"),
  L("be_BY", "Belarusian", null, "\u0411\u0435\u043B\u0430\u0440\u0443\u0441\u043A\u0430\u044F"),
  L("bn", "Bengali", null, "\u09AC\u09BE\u0982\u09B2\u09BE"),
  L("bn_IN", "Bengali", "India", "\u09AC\u09BE\u0982\u09B2\u09BE"),
  L("bg", "Bulgarian", null, "\u0411\u044A\u043B\u0433\u0430\u0440\u0441\u043A\u0438"),
  L("ca", "Catalan", null, "Catal\xE0"),
  L("zh_CN", "Chinese", "China", "\u7B80\u4F53\u4E2D\u6587"),
  L("zh_HK", "Chinese", "Hong Kong", "\u7E41\u9AD4\u4E2D\u6587\uFF08\u9999\u6E2F\uFF09"),
  L("zh_TW", "Chinese", "Taiwan", "\u7E41\u9AD4\u4E2D\u6587\uFF08\u53F0\u7063\uFF09"),
  L("hr", "Croatian", null, "Hrvatski"),
  L("cs", "Czech", null, "\u010Ce\u0161tina"),
  L("da", "Danish", null, "Dansk"),
  L("prs_AF", "Dari", null, "\u062F\u0631\u06CC"),
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
  L("fr", "French", null, "Fran\xE7ais"),
  L("fr_BE", "French", "Belgium", "Fran\xE7ais"),
  L("fr_CA", "French", "Canada", "Fran\xE7ais"),
  L("fr_CI", "French", "C\xF4te d\u2019Ivoire", "Fran\xE7ais"),
  L("fr_MA", "French", "Morocco", "Fran\xE7ais"),
  L("fr_CH", "French", "Switzerland", "Fran\xE7ais"),
  L("ka", "Georgian", null, "\u10E5\u10D0\u10E0\u10D7\u10E3\u10DA\u10D8"),
  L("de", "German", null, "Deutsch"),
  L("de_AT", "German", "Austria", "Deutsch"),
  L("de_CH", "German", "Switzerland", "Deutsch"),
  L("el", "Greek", null, "\u0395\u03BB\u03BB\u03B7\u03BD\u03B9\u03BA\u03AC"),
  L("gu", "Gujarati", null, "\u0A97\u0AC1\u0A9C\u0AB0\u0ABE\u0AA4\u0AC0"),
  L("ha", "Hausa", null, "Hausa"),
  L("he", "Hebrew", null, "\u05E2\u05D1\u05E8\u05D9\u05EA"),
  L("hi", "Hindi", null, "\u0939\u093F\u0928\u094D\u0926\u0940"),
  L("hu", "Hungarian", null, "Magyar"),
  L("id", "Indonesian", null, "Bahasa Indonesia"),
  L("ga", "Irish", null, "Gaeilge"),
  L("it", "Italian", null, "Italiano"),
  L("ja", "Japanese", null, "\u65E5\u672C\u8A9E"),
  L("kn", "Kannada", null, "\u0C95\u0CA8\u0CCD\u0CA8\u0CA1"),
  L("kk", "Kazakh", null, "\u049A\u0430\u0437\u0430\u049B \u0442\u0456\u043B\u0456"),
  L("rw_RW", "Kinyarwanda", null, "Ikinyarwanda"),
  L("ko", "Korean", null, "\uD55C\uAD6D\uC5B4"),
  L("ky_KG", "Kyrgyz", "Kyrgyzstan", "\u041A\u044B\u0440\u0433\u044B\u0437\u0447\u0430"),
  L("lo", "Lao", null, "\u0EA5\u0EB2\u0EA7"),
  L("lv", "Latvian", null, "Latvie\u0161u"),
  L("lt", "Lithuanian", null, "Lietuvi\u0173"),
  L("mk", "Macedonian", null, "\u041C\u0430\u043A\u0435\u0434\u043E\u043D\u0441\u043A\u0438"),
  L("ms", "Malay", null, "Bahasa Melayu"),
  L("ml", "Malayalam", null, "\u0D2E\u0D32\u0D2F\u0D3E\u0D33\u0D02"),
  L("mr", "Marathi", null, "\u092E\u0930\u093E\u0920\u0940"),
  L("nb", "Norwegian", null, "Norsk bokm\xE5l"),
  L("ps_AF", "Pashto", null, "\u067E\u069A\u062A\u0648"),
  L("fa", "Persian", null, "\u0641\u0627\u0631\u0633\u06CC"),
  L("pl", "Polish", null, "Polski"),
  L("pt_BR", "Portuguese", "Brazil", "Portugu\xEAs"),
  L("pt_PT", "Portuguese", "Portugal", "Portugu\xEAs"),
  L("pa", "Punjabi", null, "\u0A2A\u0A70\u0A1C\u0A3E\u0A2C\u0A40"),
  L("ro", "Romanian", null, "Rom\xE2n\u0103"),
  L("ru", "Russian", null, "\u0420\u0443\u0441\u0441\u043A\u0438\u0439"),
  L("sr", "Serbian", null, "\u0421\u0440\u043F\u0441\u043A\u0438"),
  L("si_LK", "Sinhala", null, "\u0DC3\u0DD2\u0D82\u0DC4\u0DBD"),
  L("sk", "Slovak", null, "Sloven\u010Dina"),
  L("sl", "Slovenian", null, "Sloven\u0161\u010Dina"),
  L("es", "Spanish", null, "Espa\xF1ol"),
  L("es_AR", "Spanish", "Argentina", "Espa\xF1ol"),
  L("es_CL", "Spanish", "Chile", "Espa\xF1ol"),
  L("es_CO", "Spanish", "Colombia", "Espa\xF1ol"),
  L("es_CR", "Spanish", "Costa Rica", "Espa\xF1ol"),
  L("es_DO", "Spanish", "Dominican Republic", "Espa\xF1ol"),
  L("es_EC", "Spanish", "Ecuador", "Espa\xF1ol"),
  L("es_HN", "Spanish", "Honduras", "Espa\xF1ol"),
  L("es_MX", "Spanish", "Mexico", "Espa\xF1ol"),
  L("es_PA", "Spanish", "Panama", "Espa\xF1ol"),
  L("es_PE", "Spanish", "Peru", "Espa\xF1ol"),
  L("es_ES", "Spanish", "Spain", "Espa\xF1ol"),
  L("es_UY", "Spanish", "Uruguay", "Espa\xF1ol"),
  L("sw", "Swahili", null, "Kiswahili"),
  L("sv", "Swedish", null, "Svenska"),
  L("ta", "Tamil", null, "\u0BA4\u0BAE\u0BBF\u0BB4\u0BCD"),
  L("te", "Telugu", null, "\u0C24\u0C46\u0C32\u0C41\u0C17\u0C41"),
  L("th", "Thai", null, "\u0E44\u0E17\u0E22"),
  L("tr", "Turkish", null, "T\xFCrk\xE7e"),
  L("uk", "Ukrainian", null, "\u0423\u043A\u0440\u0430\u0457\u043D\u0441\u044C\u043A\u0430"),
  L("ur", "Urdu", null, "\u0627\u0631\u062F\u0648"),
  L("uz", "Uzbek", null, "O\u02BBzbek"),
  L("vi", "Vietnamese", null, "Ti\u1EBFng Vi\u1EC7t"),
  L("zu", "Zulu", null, "isiZulu")
];
const BY_ID = new Map(WHATSAPP_LANGUAGES.map((l) => [l.id.toLowerCase(), l]));
const keyOf = (code) => String(code ?? "").trim().replace(/-/g, "_").toLowerCase();
export function templateLanguage(code) {
  return BY_ID.get(keyOf(code)) ?? null;
}
export function languageName(code) {
  const known = templateLanguage(code);
  if (known) return known.name;
  const base = String(code ?? "").split(/[-_]/)[0];
  const Names = Intl.DisplayNames;
  try {
    const name = base && Names ? new Names(["en"], { type: "language" }).of(base) : void 0;
    return name && name !== base ? name : String(code ?? "");
  } catch {
    return String(code ?? "");
  }
}
export function languageBase(code) {
  const base = String(code ?? "").trim().split(/[-_]/)[0].toLowerCase();
  return /^[a-z]{2,3}$/.test(base) && base !== "und" ? base : null;
}
export function languageLabel(code) {
  return templateLanguage(code)?.label ?? languageName(code);
}
export function languageTag(code, among = []) {
  const [base = "", region = ""] = String(code ?? "").split(/[-_]/);
  const clash = among.some(
    (c) => keyOf(c) !== keyOf(code) && String(c ?? "").split(/[-_]/)[0].toLowerCase() === base.toLowerCase()
  );
  return clash && region ? `${base.toUpperCase()}-${region.toUpperCase()}` : base.toUpperCase();
}
const fold = (s) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
export function findLanguages(query, list = WHATSAPP_LANGUAGES) {
  const q = fold(String(query ?? "").trim()).replace(/-/g, "_");
  if (!q) return [...list];
  const scored = [];
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
