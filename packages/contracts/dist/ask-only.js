// src/consent/consent-channels.ts
var CONSENT_CHANNELS = ["whatsapp", "sms", "email"];
var CONSENT_CHANNEL_WORDS = {
  whatsapp: "on WhatsApp",
  sms: "by text",
  email: "by email"
};
function channelsWords(channels) {
  const words = channels.map((c) => CONSENT_CHANNEL_WORDS[c]);
  if (words.length <= 1) return words[0] ?? "";
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

// src/consent/consent.ts
var ASKED_TO_STOP_SHORT = "asked to stop";
var ASKED_TO_STOP = `${ASKED_TO_STOP_SHORT} receiving messages`;
var STOP_WORDS = {
  pill: "Opted out",
  mark: "Stopped",
  short: ASKED_TO_STOP_SHORT,
  /** The short words as a heading over a count ("Asked to stop · 3"): a run's figure. */
  heading: `${ASKED_TO_STOP_SHORT.charAt(0).toUpperCase()}${ASKED_TO_STOP_SHORT.slice(1)}`,
  line: ASKED_TO_STOP,
  tone: "plain",
  /** The clause after a name ("Dana asked to stop receiving messages"), or on its own with a capital when none is given. */
  said: (who) => who ? `${who} ${ASKED_TO_STOP}` : `${ASKED_TO_STOP.charAt(0).toUpperCase()}${ASKED_TO_STOP.slice(1)}`
};
var OPT_OUT_REFUSAL = `This customer ${STOP_WORDS.line}. They can text START to opt back in.`;

// src/shared/time.ts
var MIN_MS = 6e4;
var HOUR_MS = 36e5;
var DAY_MS = 864e5;
var WEEK_MS = 7 * DAY_MS;
function formatterOnUse(locales, options) {
  let built = null;
  return { format: (date) => (built ??= new Intl.DateTimeFormat(locales, options)).format(date) };
}
var DATE_FMT = formatterOnUse([], { month: "short", day: "numeric" });

// src/shared/words.ts
var plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
var capitalize = (s) => s ? s[0].toUpperCase() + s.slice(1) : s;
var joinWords = (items) => items.length <= 1 ? items[0] ?? "" : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

// src/journey/appointment-word.ts
var FORMS = {
  appointment: {
    a: "an appointment",
    has: "has an appointment",
    have: "have an appointment",
    had: "had an appointment"
  },
  visit: { a: "a visit", has: "visits", have: "visit", had: "visited" },
  // trade-word: the word's own forms, said once
  meeting: { a: "a meeting", has: "has a meeting", have: "have a meeting", had: "had a meeting" },
  session: { a: "a session", has: "has a session", have: "have a session", had: "had a session" },
  lesson: { a: "a lesson", has: "has a lesson", have: "have a lesson", had: "had a lesson" }
};
function appointmentWords(word) {
  const f = FORMS[word];
  const Title = capitalize(word);
  const many = `${word}s`;
  const people = (n) => plural(n, "person", "people");
  return {
    word,
    one: word,
    many,
    a: f.a,
    Title,
    Many: capitalize(many),
    next: `Next ${word}`,
    last: `Last ${word}`,
    today: (n) => `${n} ${n === 1 ? word : many} today`,
    before: { caps: `${Title} tomorrow`, name: `${Title} reminder`, hint: `The day before ${f.a} on the calendar` },
    after: { caps: `After the ${word}`, hint: `The day after ${f.a}, when nothing is booked next` },
    lapsedHint: `No ${word} in 45 days, and nothing booked`,
    tomorrowWho: `everyone with ${f.a} tomorrow`,
    yesterdayWho: `everyone who ${f.had} yesterday`,
    withTomorrow: `with ${f.a} tomorrow`,
    whoYesterday: `who ${f.had} yesterday`,
    eachTomorrow: `each has ${f.a} tomorrow on the calendar`,
    eachYesterday: `each ${f.had} yesterday and has nothing booked next`,
    offTomorrow: (n) => `Off \xB7 ${people(n)} ${n === 1 ? f.has : f.have} tomorrow`,
    offYesterday: (n) => `Off \xB7 ${people(n)} ${f.had} yesterday`,
    startsWith: `${f.a} tomorrow, ${f.a} yesterday`,
    byMany: `by ${many}`,
    needsCalendar: `${capitalize(many)} are read from your calendar, and none is connected. Connect one under Settings \u203A Hours & booking.`,
    cancelAsk: `Cancel this ${word}?`,
    cancelAct: `Cancel the ${word}\u2026`,
    bookingLink: (link) => `Here's the link to book your ${word}: ${link}`,
    nextLink: (link) => `Here's the link to book your next ${word}: ${link}`,
    newTimeLink: (link) => `Here's a link to pick a new time for your ${word}: ${link}`
  };
}

// src/playbooks/playbook-triggers.ts
var PLAYBOOK_TRIGGERS = [
  { id: "quiet_30", label: "Win-back", list: "quiet", cls: "reengage", kind: "list", hint: "Nothing heard in 30 days" },
  {
    id: "new_week",
    label: "Welcome",
    list: "new_week",
    cls: "campaign",
    kind: "list",
    hint: "First contact in the last 7 days"
  },
  {
    id: "phoned_only",
    label: "Save our number",
    list: "phoned_only",
    cls: "reengage",
    kind: "list",
    hint: "Only ever phoned, never texted"
  },
  {
    id: "everyone_monthly",
    label: "The month's offer",
    list: null,
    cls: "campaign",
    kind: "cadence",
    hint: "Everyone who said yes, on a cadence"
  },
  {
    id: "visit_tomorrow",
    label: "Appointment reminder",
    list: null,
    cls: "booking",
    kind: "visit",
    hint: "The day before an appointment on the calendar"
  },
  // Under the Booking row since 2 Oct 2026, as the reminder is: its message asks how the appointment went and offers
  // nothing, so it reaches a yes to texts. The labels here are the default word's (contracts appointmentWords, D42); a
  // page and a new campaign's name say the workspace's own (triggerWords), and a name already stored keeps its words
  // until its owner renames it (D43). The id never changes.
  {
    id: "visited",
    label: "After the appointment",
    list: null,
    cls: "booking",
    kind: "visit",
    hint: "The day after an appointment, when nothing is booked next"
  },
  // People's Lapsed list, by visits rather than silence (00155). Since 2 Oct 2026 it IS the win-back where a calendar is
  // connected, and the quiet one is the win-back where none is: one moment, read the one way the workspace can
  // (momentOffered), so both are called Win-back and their hints say which.
  {
    id: "lapsed",
    label: "Win-back",
    list: "lapsed",
    cls: "reengage",
    kind: "list",
    hint: "No appointment in 45 days, and nothing booked"
  },
  // Any list (decision 0009): one of People's (list_key, 00168) or one of the workspace's own (list_id, 00155), kept by
  // hand or by a rule; the card says which. The id stays: playbooks made before any list could be named keep running.
  {
    id: "saved_list",
    label: "On a list",
    list: null,
    cls: "campaign",
    kind: "saved",
    hint: "Everyone on a list: one of People's, or one you keep"
  },
  // A proposal out that has waited past the workspace's pace with nothing back (0006): one nudge per proposal, with
  // its link, under its own class, in every workspace. Conversational: it answers the person's own request.
  {
    id: "proposal_waiting",
    label: "Proposal follow-up",
    list: null,
    cls: "follow_up",
    kind: "deal",
    hint: "A proposal waiting with nothing back"
  },
  // Reach out (Part 3): a chain's first email, over a lead search, and a step days after the one before it. Made by
  // the reach-out sheet (Part 4), never offered among the moments (triggerOffered).
  {
    id: "lead_first",
    label: "Businesses a search found",
    list: null,
    cls: "outreach",
    kind: "reach_out",
    hint: "The first email of a reach-out"
  },
  {
    id: "after_step",
    label: "After the step before",
    list: null,
    cls: "outreach",
    kind: "reach_out",
    hint: "A nudge, days after the step before"
  }
];
var MOMENT_TRIGGERS = PLAYBOOK_TRIGGERS.filter(
  (t) => t.kind !== "reach_out"
);
var PLAYBOOK_HOURS = { min: 9, max: 20 };
var PLAYBOOK_LIMITS = {
  run_hour: { min: PLAYBOOK_HOURS.min, max: PLAYBOOK_HOURS.max, what: "The hour" },
  cap_per_run: { min: 1, max: 500, what: "The cap" },
  gap_days: { min: 7, max: 365, what: "The gap" },
  cadence_days: { min: 1, max: 90, what: "The cadence" }
};
var SENDING_HOURS_WORDS = {
  min: PLAYBOOK_HOURS.min,
  max: PLAYBOOK_HOURS.max,
  first: `${PLAYBOOK_HOURS.min}:00`,
  range: `${PLAYBOOK_HOURS.min}:00\u2013${PLAYBOOK_HOURS.max}:59`,
  between: `between ${PLAYBOOK_HOURS.min}:00 and ${PLAYBOOK_HOURS.max}:59`
};
var SENDING_NOW_WORDS = "sending now";
var PLAYBOOK_VETO_DELAY_MS = 30 * MIN_MS;
function delayWords(ms) {
  const minutes = Math.round(ms / MIN_MS);
  if (minutes < 60 || minutes % 60) return plural(minutes, "minute");
  return minutes === 60 ? "an hour" : plural(minutes / 60, "hour");
}
var PLAYBOOK_VETO_DELAY_WORDS = delayWords(PLAYBOOK_VETO_DELAY_MS);
function triggerOf(id) {
  return PLAYBOOK_TRIGGERS.find((t) => t.id === id) ?? null;
}
var VISIT_TRIGGERS = PLAYBOOK_TRIGGERS.filter((t) => t.kind === "visit").map((t) => t.id);

// src/broadcasts/email-offers.ts
var OFFERS_BY_EMAIL_WORDS = {
  /** The deployment's campaigns domain is not set up or not verified yet. */
  noCampaignsDomain: "Offers by email start once the campaigns domain is set up.",
  /** The business has no postal address on file, which every offer's foot names. */
  noAddress: "Add your business's address to send offers by email.",
  /** The workspace's offers are paused by a gate. */
  paused: "Offers by email are paused while complaints and bounces settle."
};

// src/broadcasts/reach-for.ts
var CHANNEL_WORDS = {
  noOffersByText: "Texts carry no offers.",
  /**
   * What an offer by email says where the read carries no facts about offers (the WhatsApp-alone reading, a page cached before
   * them, Ask's own): the campaigns domain, which is what its absence is. A read that has them says the reason that is true.
   */
  noOffersByEmailYet: OFFERS_BY_EMAIL_WORDS.noCampaignsDomain,
  noWhatsApp: "Connect a WhatsApp number first.",
  noTextLine: "No texting line yet.",
  textLineMock: "Your texting line is a test filing: it sends nothing.",
  textLineNotActive: "Your texting line is not approved by the carriers yet.",
  noMailbox: "Set up email in Settings \u203A Connections first.",
  noEmailDomain: "Email is not switched on for this deployment yet.",
  /** What could not be asked of the edge just now: not offered, and not guessed to be ready either. */
  unchecked: "This could not be checked just now."
};
var HELD_ORDER = {
  stopped: 0,
  unsubscribed: 1,
  no_yes: 2,
  no_number: 3,
  no_address: 4,
  address_stopped: 5,
  no_channel: 6
};
var HELD_ON = Object.keys(HELD_ORDER).sort(
  (a, b) => HELD_ORDER[a] - HELD_ORDER[b]
);

// src/broadcasts/run-words.ts
var REPLY_WINDOW_HOURS = 72;
var REPLY_WINDOW_MS = REPLY_WINDOW_HOURS * HOUR_MS;
var REPLY_DAYS = `${REPLY_WINDOW_HOURS / 24} days`;
var REPLY_WINDOW_WORDS = `within ${REPLY_DAYS}`;
var BREATH_WHY = "from you within a week of it";
var hearsOrHear = (n) => n === 1 ? "hears" : "hear";
function heardWords(n, breathe) {
  if (!(n > 0)) return null;
  if (breathe) return `${n} left out: they hear ${BREATH_WHY}`;
  return `${n === 1 ? "One" : n} of them ${hearsOrHear(n)} ${BREATH_WHY}.`;
}
var HEARD_UNREAD_WORDS = `Who hears ${BREATH_WHY} could not be read just now: the send still leaves them out, so it may go to fewer.`;
function goesToOf(receipt) {
  return receipt.recipient_count - (receipt.left_out ?? 0);
}

// src/ask/ask-suggestions.ts
var SET_UP_CAMPAIGNS = { en: "Set up my campaigns", es: "Prepara mis campa\xF1as" };
var T = {
  en: {
    needs: "Who needs me right now?",
    held: "What is the receptionist holding for me?",
    calls: "Did anyone call while I was busy?",
    live: "What is the call on the line about?",
    openSat: "What's open Saturday?",
    openTomorrow: "What's open tomorrow?",
    week: "How did the week go?",
    said: "What did the receptionist tell {name}?",
    why: "Why was this reply held?",
    who: "Who wrote today?",
    rules: "What can the receptionist do on its own?",
    hours: "What are our hours this week?",
    brief: "Brief me on today",
    next: "What should I do next?",
    can: "What can you do for me?",
    proposals: "Who has a proposal out?",
    setupLeft: "What is left to set up?",
    moreLike: "Find more like: {asked}",
    actLate: "Tell {name} we're running late",
    actLateQ: "Tell {name} we're running about 15 minutes late today",
    actDraft: "Draft a reply to {name}",
    actDraftQ: "Draft a reply to {name}: ",
    actRemember: "Remember something for the receptionist",
    actRememberQ: "Remember that ",
    actClose: "Close for a day",
    actCloseQ: "Close on ",
    actHours: "Change a day's hours",
    actHoursQ: "Change Saturday's hours to ",
    actOffer: "Send an offer to a list",
    actOfferQ: "Send the ",
    actPlaybook: "Start a win-back campaign",
    actPlaybookQ: "Start a win-back campaign for the quiet clients",
    actHold: "Hold every reply for my review",
    actHoldQ: "Hold every reply for my review before it sends",
    setUp: SET_UP_CAMPAIGNS.en,
    winBackIdea: "Win back customers who went quiet",
    offerIdea: "What should go out this month?",
    whyWaiting: "Why is {name} waiting?",
    working: "What's working?"
  },
  es: {
    needs: "\xBFQui\xE9n me necesita ahora?",
    held: "\xBFQu\xE9 tiene retenido la recepcionista para m\xED?",
    calls: "\xBFLlam\xF3 alguien mientras estaba ocupada?",
    live: "\xBFDe qu\xE9 trata la llamada en curso?",
    openSat: "\xBFQu\xE9 hay libre el s\xE1bado?",
    openTomorrow: "\xBFQu\xE9 hay libre ma\xF1ana?",
    week: "\xBFC\xF3mo fue la semana?",
    said: "\xBFQu\xE9 le dijo la recepcionista a {name}?",
    why: "\xBFPor qu\xE9 se retuvo esta respuesta?",
    who: "\xBFQui\xE9n escribi\xF3 hoy?",
    rules: "\xBFQu\xE9 puede hacer la recepcionista sola?",
    hours: "\xBFCu\xE1l es nuestro horario esta semana?",
    brief: "Res\xFAmeme el d\xEDa",
    next: "\xBFQu\xE9 hago ahora?",
    can: "\xBFQu\xE9 puedes hacer por m\xED?",
    proposals: "\xBFQui\xE9n tiene una propuesta pendiente?",
    setupLeft: "\xBFQu\xE9 falta por configurar?",
    moreLike: "Encuentra m\xE1s como: {asked}",
    actLate: "Dile a {name} que vamos con retraso",
    actLateQ: "Dile a {name} que vamos con unos 15 minutos de retraso hoy",
    actDraft: "Redacta una respuesta a {name}",
    actDraftQ: "Redacta una respuesta a {name}: ",
    actRemember: "Recu\xE9rdale algo a la recepcionista",
    actRememberQ: "Recuerda que ",
    actClose: "Cerrar el sal\xF3n un d\xEDa",
    actCloseQ: "Cierra el ",
    actHours: "Cambiar el horario de un d\xEDa",
    actHoursQ: "Cambia el horario del s\xE1bado a ",
    actOffer: "Enviar una oferta a una lista",
    actOfferQ: "Env\xEDa la ",
    actPlaybook: "Iniciar una campa\xF1a de recuperaci\xF3n",
    actPlaybookQ: "Inicia una campa\xF1a de recuperaci\xF3n para los clientes inactivos",
    actHold: "Retener cada respuesta para revisarla",
    actHoldQ: "Ret\xE9n cada respuesta para mi revisi\xF3n antes de enviarla",
    setUp: SET_UP_CAMPAIGNS.es,
    winBackIdea: "Recupera a los clientes que dejaron de escribir",
    offerIdea: "\xBFQu\xE9 deber\xEDa salir este mes?",
    whyWaiting: "\xBFPor qu\xE9 espera {name}?",
    working: "\xBFQu\xE9 est\xE1 funcionando?"
  }
};

// src/shell/campaign-rooms.ts
var CAMPAIGN_ROOMS = {
  home: "Campaigns",
  library: "Messages",
  newMessage: "New message"
};
var { library } = CAMPAIGN_ROOMS;
var LIBRARY_WORDS = {
  title: library,
  demo: `${library} reads a real workspace \u2014 the messages it holds, by email, text and WhatsApp.`,
  reading: "Reading your messages\u2026",
  failed: "Your messages couldn\u2019t be loaded right now",
  failedWhat: "your messages",
  failedBody: "The receptionist keeps sending; this page just can't show what it holds at the moment.",
  /** The count's hover: what the Library holds is every message, on each channel it goes by, whoever writes its versions. */
  headTip: "What the receptionist and your campaigns send, as the customer sees it. A WhatsApp version is approved by WhatsApp, usually within minutes, whether it is written here or in WhatsApp Manager; an email or a text is ready the moment it is saved. A marketing message can only go to people who said yes to offers.",
  noNumber: "No WhatsApp number yet. Email and text versions are written here; WhatsApp versions wait until one is connected.",
  /** A template is written to a number's account, which is the edge's own answer (no_channel) when it has none. */
  writeNeedsNumber: "Connect a WhatsApp number first \u2014 templates belong to a number's account.",
  /** Why a WhatsApp version, or a language of one, cannot be added with no number; an email or a text needs none. */
  addNeedsNumber: "Connect a WhatsApp number to add a WhatsApp version."
};
function runStoppedWords(was) {
  if (was === "sending") return "stops after this batch";
  return was === "pending_approval" ? "skipped \u2014 nothing will send" : "canceled \u2014 nothing will send";
}
function runApprovedTail(people, when) {
  return `approved \u2014 ${people} ${people === 1 ? "person" : "people"}, ${when}`;
}
var RUN_WAITING_WORDS = "Waiting for your approval";
var runApproveWords = (n) => `Approve \xB7 ${n} ${n === 1 ? "person" : "people"}`;
var RUN_OPEN_WORDS = "Open the run";
function heldEmailsWords(n) {
  return `${n} ${n === 1 ? "email waits" : "emails wait"} for your say`;
}

// src/templates/template-languages.ts
var L = (id, name, region, native) => ({
  id,
  label: region ? `${name} (${region})` : name,
  name,
  region,
  native
});
var WHATSAPP_LANGUAGES = [
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
var BY_ID = new Map(WHATSAPP_LANGUAGES.map((l) => [l.id.toLowerCase(), l]));
var keyOf = (code) => String(code ?? "").trim().replace(/-/g, "_").toLowerCase();
function templateLanguage(code) {
  return BY_ID.get(keyOf(code)) ?? null;
}
function languageName(code) {
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

// src/templates/message-versions.ts
var OWN_VERSION_CHANNELS = ["email", "sms"];
var VERSION_CHANNEL_WORDS = {
  whatsapp: "WhatsApp",
  email: "Email",
  sms: "Text"
};
function versionWord(channel) {
  return channel === "whatsapp" ? VERSION_CHANNEL_WORDS.whatsapp : VERSION_CHANNEL_WORDS[channel].toLowerCase();
}

// src/workspace/billing.ts
var WORKSPACE_PAUSED_FACT = "This workspace is paused, so nothing is sent until billing resumes";
var CAMPAIGNS_PAUSED_WORDS = `${WORKSPACE_PAUSED_FACT}. Resume it from Settings \u203A Billing.`;
var DATE_FMT2 = formatterOnUse("en-US", { month: "short", day: "numeric" });

// src/playbooks/lifecycle/lifecycle-words.ts
var channelsGoesByWords = (channels) => joinWords(channels.map((c) => VERSION_CHANNEL_WORDS[c]));
var NEEDS_CALENDAR = {
  none: "Needs your calendar",
  email: "Needs your calendar feed",
  door: "Connect your calendar"
};
var LIFECYCLE_WORDS = {
  title: CAMPAIGN_ROOMS.home,
  lede: "What goes out on its own as a customer reaches a moment, and what you send yourself.",
  library: CAMPAIGN_ROOMS.library,
  newMessage: CAMPAIGN_ROOMS.newMessage,
  // Said, after the standard beat, where a tile's read is still out.
  reading: "Reading\u2026",
  close: "Close",
  rail: "Your customer, start to finish",
  needs: {
    none: "Answers whoever writes",
    messages: "Reaches a yes to messages",
    offers: "Needs a yes to offers"
  },
  receptionist: "Answers \xB7 asks for the yes",
  // First contact where the workspace has nothing to answer on: no number and no channel that can send.
  noLine: { state: "No line to answer on yet", needs: "Connect a number or email to answer on" },
  // An appointment moment where no calendar feeds it (decision 44 of 9 Oct 2026): what it says instead of a figure, and its door.
  needsCalendar: NEEDS_CALENDAR,
  callText: {
    name: "The call's text",
    words: "The booking link and your WhatsApp, sent while they're on the phone",
    // Its state is a state, as every row's is (Ruben, 11 Oct 2026: "When a caller asks" stood where "Live" stands); when
    // it is sent is its line.
    on: "Live",
    when: "Sent when a caller asks for it",
    none: "No message for it yet"
  },
  /**
   * A moment with no campaign yet shows the one it offers as a row of its own, off (Ruben, 11 Oct 2026: a row to press
   * where a heading had a Turn on under it): its line says what it does, by the moment's id.
   */
  offered: {
    off: "Off",
    before: "The day before each visit",
    after: "The day after each visit",
    proposal: "When a proposal waits for an answer",
    quiet: "Brings back people who've gone quiet"
  },
  monthsOffer: { name: "The month's offer" },
  /** A campaign past its last day (00416 `until`), its state: "Ended Oct 1", the day by the business's calendar. */
  ended: (day) => `Ended ${day}`,
  /** A campaign on trial (00416 `trial_until`), its state: "On trial until Oct 9", the day its trial ends. */
  onTrial: (day) => `On trial until ${day}`,
  gone: {
    title: "That campaign isn't here any more.",
    body: "Its runs are still counted in Reports, with their numbers."
  },
  /** A message's own drawer over the home (`campaigns/message:<name>`) whose name leads to no message any more. */
  messageGone: {
    title: "That message isn't here any more.",
    body: "Every message you keep is in Messages."
  },
  compose: {
    title: CAMPAIGN_ROOMS.newMessage,
    kind: "What kind of message",
    once: "Send once",
    /** Beside "Send once" (00426, canvas B): a reach-out to leads, from a search, a list, or the ones the pile adds. */
    leads: "Write to leads",
    /** A reach-out's change (`campaigns/new:edit:<root>`): its sheet's kicker while its chain is read. */
    edit: "Edit",
    /**
     * The composers and a campaign's drawer as one sentence of words to press (Ruben, 11 Oct 2026, "Option B"): the words
     * round its tokens, the one line under it saying who it reaches now, what happens next, and what an edit changes.
     */
    sentence: {
      everyDay: "Every day at",
      /** The rule its runs keep, said after its channels: the mode Autonomy holds for the moment's class. */
      rule: {
        auto: "without asking you",
        veto: "unless you stop it",
        ask: "asking you first",
        never: "while Autonomy keeps it quiet"
      },
      /** What the rule's word opens, to a screen reader. */
      ruleLabel: "The rule its runs keep, on your Autonomy tab",
      /** The channels' word, to a screen reader: what pressing it opens. */
      channelsLabel: "The channels it goes by",
      /** Under the channels' switches: a person gets a run's message on one of them, never on each. */
      channelsNote: "Each person gets it once, on one of these.",
      /** Where it goes by no channel yet: the channels' word says so. */
      noChannel: "no channel yet",
      /**
       * Who a moment's campaign goes to, after "to" in its sentence ("a WhatsApp to everyone with an appointment
       * tomorrow"): the moment said as the people it names, in the workspace's word for an appointment.
       */
      who: (trigger, word) => {
        const W = appointmentWords(word);
        if (trigger === "visit_tomorrow") return W.tomorrowWho;
        if (trigger === "visited") return W.yesterdayWho;
        if (trigger === "lapsed") return `everyone with no ${word} in 45 days`;
        if (trigger === "quiet_30") return "everyone quiet for 30 days";
        if (trigger === "everyone_monthly") return "everyone who said yes";
        if (trigger === "proposal_waiting") return "every proposal waiting";
        if (trigger === "new_week") return "everyone new this week";
        if (trigger === "phoned_only") return "everyone who only ever phoned";
        if (trigger === "saved_list") return "everyone on a list";
        return (triggerOf(trigger)?.label ?? "").toLowerCase();
      },
      /** Who it reaches now: "All 6 can hear it", "2 of 6 can hear it"; "2 can hear it" where nobody counted the pool. */
      hear: (will, pool) => pool === null ? `${will} can hear it` : will > 0 && will === pool ? `All ${will} can hear it` : `${will} of ${pool} can hear it`,
      /** Nobody the moment names yet: "Nobody with an appointment tomorrow right now". */
      nobody: (of) => `Nobody ${of} right now`,
      /** What happens next, before it is saved ("First run today at 10:00 AM"), or for one that runs ("Next run …"). */
      firstRun: (when) => `First run ${when}`,
      nextRun: (when) => `Next run ${when}`,
      /** A day and an hour as a line says them, from a label's "today 10:00 AM": "today at 10:00 AM". */
      at: (label) => label.replace(/^(today|tomorrow) (?=\d)/, "$1 at "),
      /** A send's one act, once a time is picked: "Schedule for tomorrow at 9:00 AM". */
      scheduleFor: (when) => `Schedule for ${when}`,
      /**
       * The message, folded under its first words (Ruben, 11 Oct 2026: "make the preview something you expand to see, so
       * the drawers are more compact"): what the fold says while it is open.
       */
      previewOpen: "How it reads",
      previewLabel: "The message, as it reads",
      /** An edit's changes, counted in its foot: "2 changes · from the next run". */
      changes: (n) => `${plural(n, "change", "changes")} \xB7 from the next run`,
      /** The foot of a Turn on whose moment's own message is not in the Library yet: the one press adds it, then starts. */
      addsFirst: (title) => `Adds ${title} to your messages, then turns it on.`,
      /** The message under its preview: "Visit reminder · written for you", and its door. */
      writtenForYou: "written for you",
      /** Beside the moment's own message, not added yet: the word that picks another of your messages instead. */
      another: "another message",
      change: "Change",
      open: "Open",
      /** A word of a running campaign changed in place, said with its Undo: "Visit reminder runs at 9:00 AM now". */
      saved: {
        hour: (name, hour) => [{ b: name }, ` runs at ${hour} now`],
        cap: (name, n) => [{ b: name }, ` reaches up to ${n} a run now`],
        gap: (name, days) => [
          { b: name },
          ` waits ${days} days before the same person hears it again`
        ],
        undone: (name) => [{ b: name }, " is back as it was"]
      },
      /** Its runs, newest last, a bar each: what the strip says to a screen reader, and its head. */
      runs: (n) => `The newest ${plural(n, "run", "runs")}`
    },
    // The send screen is made of the broadcasts read (its lists and its messages): said where it could not be, with its Retry.
    failed: {
      what: "who and what you can send to",
      body: "Nothing goes out until it reads. Everything else here is current.",
      surface: "broadcasts"
    },
    // A reach-out's change opens on its chain, which the reach-outs read holds: said where it could not be, with its Retry.
    chainFailed: { what: "your reach-out", body: "Its sheet opens once it reads.", surface: "reach_outs" }
  },
  phone: { moments: "Moments" },
  // The channels a campaign goes by: the row's word in the drawer, and what a mark that waits says of itself.
  channels: {
    goesBy: "Goes by",
    /** A kept channel the workspace cannot send on yet, after its name: "Email · waits". */
    waits: "waits",
    /** The marks' line to a screen reader: "Goes by WhatsApp and Email; Text waits; could also go by Email". */
    marks: (on, waits, could) => [
      on.length > 0 ? `Goes by ${joinWords(on)}` : waits.length > 0 ? "" : "Goes by nothing yet",
      waits.length > 0 ? `${joinWords(waits)} ${waits.length === 1 ? "waits" : "wait"}` : "",
      could.length > 0 ? `could also go by ${joinWords(could)}` : ""
    ].filter(Boolean).join("; "),
    /** After a change of channels, where a run of the playbook already waits: it was made with the channels it had. */
    runKeeps: "the run that waits keeps the channels it was made with",
    /**
     * The Moments head's channels on a phone (Ruben, 11 Oct 2026): a chip each, a filled dot where it sends and a hollow
     * one where it is not set up, as the rows' marks draw them; a hollow chip pressed says why under the row, and one
     * door to Settings › Connections stands at its end.
     */
    head: "Your channels",
    sending: (word) => `${word}, sending`,
    notSetUp: (word) => `${word}, not set up: why`,
    setUp: "Set up",
    /** Nothing can send at all: one card in the head in place of the reach line, its one door to Connections. */
    none: {
      title: "Nothing can send yet",
      body: "Connect WhatsApp, a texting line or email, and your moments start here.",
      act: "Set up channels"
    }
  },
  // A read that failed is its own state, never a tile that is not there or a zero that was not counted. The page draws the
  // kit's failed read where the data would be, and its Retry reads `surface` again.
  failed: {
    // The templates are the settings read's, the one read of them (apps/dashboard offered-templates.ts): its Retry reads that.
    templates: {
      what: "your templates",
      body: "The call's text and your messages show once they read. Everything else here is current.",
      surface: "settings"
    },
    counts: {
      what: "who each moment reaches",
      body: "The moments show who they reach once it reads. Everything else here is current.",
      surface: "playbooks"
    },
    chains: { what: "your reach-outs", body: "The moments above are current.", surface: "reach_outs" },
    report: { what: "this period's numbers", body: "The runs below stand.", surface: "campaign_results" },
    // The broadcasts read itself, said in each tile made from it.
    reach: {
      what: "who can hear you",
      body: "The ladder shows once it reads. Everything else here is current.",
      surface: "broadcasts"
    },
    coming: {
      what: "what is coming up",
      body: "What is coming shows once it reads. Everything else here is current.",
      surface: "broadcasts"
    },
    results: {
      what: "what came back",
      body: "The numbers show once they read. Everything else here is current.",
      surface: "broadcasts"
    }
  },
  // Campaigns' ledger (spec 2026-10-09 §4.3, §4.4): every word its page says once; each row's own are the view model's.
  ledger: {
    /** The ledger's name to a screen reader. */
    label: "Your campaigns",
    /** The phone's strip of chips, to a screen reader. */
    strip: "Campaigns by moment",
    /** The phone's search circle, which opens the search. */
    find: "Search campaigns",
    heads: { campaign: "Campaign", goesBy: "Goes by", people: "People now", results: "Last 30 days", next: "Next" },
    /** `label`: the desk's status tabs, to a screen reader. */
    tabs: { label: "Campaigns by state", all: "All", needs: "Needs you", paused: "Paused" },
    /** "Needs you" names its unit, where its count is said: "2 campaigns need you". */
    needsOf: (n) => `${plural(n, "campaign")} ${n === 1 ? "needs" : "need"} you`,
    search: (n) => `Search ${plural(n, "campaign")}`,
    showing: (n, of) => `Showing ${n} of ${of}`,
    showingIn: (caps, n, of) => `${caps} \xB7 showing ${n} of ${of}`,
    clear: "Clear",
    sort: { label: "Sort", next: "Next", name: "Name", people: "People now", replied: "Replied" },
    group: { label: "Group", moment: "By moment", none: "No groups" },
    groups: { lists: "Lists & offers", reach_out: "Reach-outs", sent_once: "Sent once" },
    /** A group no campaign stands on yet. */
    none: "No campaign yet",
    empty: "No campaigns match",
    /** What is not counted, or not known, in a cell: never a zero nobody counted. */
    dash: "\u2014",
    turnOn: "Turn on",
    findBusinesses: "Find businesses to write to",
    archived: "Its list is archived",
    businesses: "businesses",
    chainNeeds: "Writes to the businesses a search found",
    /** A reach-out fed by a list its owner adds to (00426), where a search's says the search's name. */
    ownList: "Its own list",
    /**
     * Who is in a reach-out now (00426), its People cell: the waiting and the writing, "17 waiting · 9 writing"; the
     * done alone where nobody else is left; "Nobody yet" before anyone is.
     */
    peopleNow: (p) => {
      const now = [p.waiting ? `${p.waiting} waiting` : null, p.writing ? `${p.writing} writing` : null].filter(
        (x) => !!x
      );
      return now.length ? now.join(" \xB7 ") : p.done ? `${p.done} done` : "Nobody yet";
    },
    openRun: RUN_OPEN_WORDS,
    /**
     * A row's last 30 days, as its cell says them. A reach-out's is in the businesses it wrote to, which "wrote back" is a
     * count of; its emails written only where the businesses were not counted (a database before 00404).
     */
    results: (r2) => r2 === "uncounted" ? "\u2014" : r2 === "none" ? "Nothing sent" : r2.kind === "sent" ? `${r2.sent} sent \xB7 ${r2.replied} replied` : r2.businesses === null ? `${r2.written} written \xB7 ${r2.wroteBack} wrote back` : `${plural(r2.businesses, "business", "businesses")} \xB7 ${r2.wroteBack} wrote back`,
    sentOnce: {
      footer: (n) => `Sent once \xB7 last 30 days \xB7 ${n}`,
      open: "Sent",
      state: "Sent",
      hint: (when) => when ? `Sent once \xB7 ${when}` : "Sent once"
    },
    /** One word per act (decision 19): "Approve · 7 people" and "Skip", everywhere a waiting run is decided. */
    approve: runApproveWords,
    skip: "Skip",
    resume: {
      label: "Resume",
      question: (name) => `Resume ${name}?`,
      /** When, and to about how many; when alone where the moment could not be counted (null), never "about 0". */
      detail: (when, n) => n === null ? `Next run ${when}` : `Next run ${when}, about ${plural(n, "person", "people")}`,
      chain: "Its next emails go out on its next run.",
      /** Said in full where the campaign's class sends without asking (`auto`, decision 7), where the page knows the mode. */
      auto: "It sends on its own: nothing will wait for your approval.",
      yes: "Yes, resume it"
    },
    /** What the drawer's head calls a campaign whose group the page does not hold. */
    kicker: "Campaign"
  },
  /** Ask's doors on the page (the moment spec, A1): the head's, the first day's sentence, and the drawer's More. */
  ask: {
    door: "Ask",
    /** The chip Ask offers on the first day says the same sentence (contracts SET_UP_CAMPAIGNS). */
    setUp: SET_UP_CAMPAIGNS.en,
    /** The first day's door to it, at the list's top: what pressing it does, said as an offer. */
    setUpDoor: "Let Ask set up your campaigns",
    about: "Ask about this campaign"
  },
  reach: {
    title: "Who can hear you",
    people: "In People",
    messages: "Can get your messages",
    offers: "Said yes to offers",
    // What a yes opens, in the moments' own names; the month's offer and a person's own notes are not stages.
    opensMessages: "Opens:",
    ownOffers: ["the month's offer", "your notes"],
    asks: "Your receptionist now asks for it. Once a person, inside a conversation they started. At the desk, the code or the phrase does the same.",
    /**
     * The phone's line in the Moments head: who of everyone in People a message can reach now. Everyone is said as
     * everyone ("All 29 can hear you"), not as a fraction of itself; nobody in People is no line at all (the tile).
     */
    phoneHear: (canHear, people) => canHear === people ? people === 1 ? "1 can hear you" : `All ${people} can hear you` : `${canHear} of ${people} can hear you`,
    /** The phone's door to how the yes to offers is got: the words that door carries on a run's sheet and in Setup. */
    phoneYes: "Get their yes",
    code: "Show the code",
    copy: "Copy the phrase",
    link: "People"
  },
  coming: {
    title: "Coming up",
    window: "next 7 days",
    rules: `Sends wait for ${SENDING_HOURS_WORDS.range} \xB7 one a week per person, across every moment`,
    empty: "Nothing is set to go out in the next 7 days.",
    nobody: "Nobody",
    /** A run waiting for the owner, in the run's one phrase (broadcasts.ts BROADCAST_STATE_LABELS reads it too). */
    waiting: RUN_WAITING_WORDS,
    /** A reach-out's going run whose emails the check holds for the owner's say. */
    held: heldEmailsWords,
    /**
     * A run waiting on the person, approved or skipped on its own line: the two acts, and what Skip asks. What the line
     * says of the run is Today's own sentence for it (today-runs.ts todayRunWords: "7 people. Nothing sends until you
     * say so."), which promises nobody the month's allowance holds back.
     */
    approval: {
      approve: "Approve",
      approving: "Approving\u2026",
      skip: "Skip",
      /** The two acts named whole for a screen reader: where two runs wait, "Approve" twice says nothing of which. */
      approveOf: (name) => `Approve this run of ${name}`,
      skipOf: (name) => `Skip this run of ${name}`,
      question: (name) => `Skip this run of ${name}?`,
      detail: "Nothing sends, and the run closes.",
      yes: "Yes, skip it"
    },
    // A running moment's row while the WORKSPACE is paused (billing): no time is promised, since the send door refuses every
    // message of a run until billing resumes. It says so where "Tomorrow 10:00" stood.
    paused: {
      when: { day: "Paused", at: "for billing" },
      // The fact in its one spelling (workspace/billing.ts), which a waiting run on the line below says too, with its door.
      why: WORKSPACE_PAUSED_FACT,
      pill: "Workspace paused"
    }
  },
  results: {
    title: "What came back",
    link: "All runs",
    /** The tile's second door: Reports › Campaigns over the same days. */
    fullReport: "Full report",
    quiet: "Nothing went out, and nobody said yes or asked to stop.",
    funnel: { sent: "Sent", delivered: "Delivered", read: "Read", replied: "Replied" },
    funnelLabel: "Sent, delivered, read and replied",
    funnelLabelNoRead: "Sent, delivered and replied",
    /** Under the funnel where a text or an email went too (0030): a read is WhatsApp's own receipt. */
    readOf: (whatsappSent) => `Read is of WhatsApp's ${whatsappSent}: a text or an email keeps no read receipt.`,
    noRead: "These went by text or email, which keep no read receipt."
  }
};
var LIFECYCLE_TOAST = {
  resumed: (name) => [{ b: name }, " resumed"],
  paused: (name) => [{ b: name }, " paused"],
  changed: (name) => [{ b: name }, " changed"],
  // A new campaign is running: its sequence opens as this is said (campaigns/home/sheets.tsx), its next batch on it.
  running: (name) => [{ b: name }, " is running"],
  /** The name of a line the page has no row for, where a toast must name it. */
  nameless: "It",
  /**
   * A waiting run approved: the server's own count, and when it really goes in the page's clock words ("sending now",
   * "scheduled for tomorrow 9:00 AM"), since the server may move a late approval to the next sending hour.
   */
  approved: (name, people, when) => [
    { b: name },
    ` ${runApprovedTail(people, when)}`
  ],
  /**
   * A run stopped from its line or its card: what the server stopped, by what the run was when it did (campaign-rooms.ts
   * runStoppedWords, Sent's own receipt). A run that waited closes unsent; one a teammate approved a moment before, and
   * that is already going, stops after the batch in hand, and the page does not say "nothing will send" of it.
   */
  skipped: (name, was) => [
    { b: name },
    ` ${runStoppedWords(was)}`
  ],
  /**
   * A playbook's channels changed, from its drawer or from Ask's card: "Visit reminder goes by WhatsApp and Email now".
   * `runWaits`: a run of it already waits for approval, and keeps the channels it was made with (core run-playbook
   * stores them as it enrols), so the sentence says the change is the next run's.
   */
  channels: (name, channels, runWaits) => [
    { b: name },
    ` goes by ${channelsGoesByWords(channels)} now${runWaits ? ` \xB7 ${LIFECYCLE_WORDS.channels.runKeeps}` : ""}`
  ],
  phraseCopied: "Phrase copied",
  /** The browser would not copy it: the toast shows the phrase, to be typed or copied by hand. */
  copyFailed: (phrase) => `Couldn't copy, the phrase is: ${phrase}`
};

// src/shared/phone.ts
function handoffE164(raw) {
  const typed = String(raw ?? "").trim();
  if (!typed) return null;
  return "+" + typed.replace(/[^0-9]/g, "");
}

// src/templates/templates.ts
var TEMPLATE_BODY_MAX = 1024;
var TEMPLATE_BODY_WORDS = `The message must be under ${TEMPLATE_BODY_MAX} characters.`;
var TEMPLATE_SAME_NAME_WORDS = "A template with that name and language already exists. Pick another name.";

// src/sequences/sequence-address.ts
var SEQUENCES_ROUTE = "campaigns/sequences";
var newSequenceRoute = (moment) => moment ? `${SEQUENCES_ROUTE}/new:moment:${moment}` : `${SEQUENCES_ROUTE}/new`;

// src/shared/enums.ts
var TEMPLATE_STATUSES = ["approved", "pending", "rejected", "paused", "disabled"];

// src/templates/campaign-message.ts
function metaStatusOf(raw) {
  return TEMPLATE_STATUSES.find((s) => s === raw) ?? "pending";
}
var NO_RUN_VERSION_WORDS = "has no version its runs can send";
var MESSAGE_GONE_WORDS = {
  card: `Its message ${NO_RUN_VERSION_WORDS}, so they are skipped until it has one again or the campaign sends another.`,
  composer: (title) => `Its message, ${title}, ${NO_RUN_VERSION_WORDS} any more. Pick another to save a change.`
};
var THEIRS_WORDS = "about something they booked, or a proposal of theirs";
var MESSAGE_BEGIN_WORDS = {
  customIsAnOffer: "A message you write is an offer or news. Only a starter is a reminder, a check after or a follow-up.",
  /**
   * A message written whole (POST templates/message, Ask's message card) takes one about their own booking or proposal,
   * written with a WhatsApp version for WhatsApp to review: never with an email or a text alone, which nobody reviews.
   * Its own sentence, since customIsAnOffer (POST templates/versions's) is not true of this door.
   */
  utilityNeedsWhatsapp: `A message ${THEIRS_WORDS}, needs a WhatsApp version, which WhatsApp reviews.`,
  starterNeedsItsOwnWords: "A starter begins with its own words. Add the starter set, then change the words in Messages.",
  doorNotSwitchedOn: "Writing a message with no WhatsApp version is not switched on here yet.",
  /**
   * A message written whole in a language of a message already on file in another, said as something else (POST
   * templates/message): a language of a message is the same kind of message with the same values, its kind what a send
   * judges it by (consent purposeOfTemplate: a row with no category is an offer), so `purpose` is the held one's.
   */
  heldOtherwise: (purpose, slots) => `This message is on file in another language as ${purpose === "marketing" ? "an offer or news" : `a message ${THEIRS_WORDS},`} with ${slots} value${slots === 1 ? "" : "s"}. Write this language the same way, or give it another name.`,
  /**
   * A name on file in another language as a code for signing in (Meta's `authentication`): no campaign sends one, so no
   * kind of message is written beside it, and "write it the same way" would be no way out.
   */
  heldAuthentication: "This name is on file in another language as a code for signing in, which no campaign sends. Give this message another name."
};

// src/ask-proposals/spec.ts
var PROPOSAL_WORDS = {
  cannotApprove: "This card cannot be approved from here.",
  noUndo: "This one has no undo.",
  /** A card past ASK_CARD_FRESH_MS (askCardLapsed): nothing is sent, and asking again makes it from what is true now. */
  lapsed: "This card is more than a day old, and what it would change may have moved since. Ask again and it is made from how things stand now.",
  /** A plan's card past its week (askCardLapsed): the same, in the plan's words. */
  planLapsed: "This plan is more than a week old, and what it would change may have moved since. Ask again and it is made from how things stand now.",
  /** A plan's card naming a step that was undone: what that step made is gone, so nothing is sent to it. */
  planUndone: "A step this one builds on was undone, so what it would use is gone and nothing is sent. Ask again and the plan is made from how things stand now.",
  /** A plan's card naming a step that has made nothing yet: that step is approved first. */
  waitsForStep: (n) => `This waits for step ${n}: approve step ${n} first, then this one.`,
  /**
   * A plan's card naming a step that was approved and made nothing it can use (a message whose every version was
   * refused): waiting would never help, so the plan is asked for again.
   */
  stepMadeNothing: (n) => `Step ${n} made nothing this one can use, so nothing is sent. Ask again and the plan is made from how things stand now.`,
  /**
   * A card of several requests stopped by a refusal after some went (`done` of `of`): what went stands, the rest did not
   * go, and the refusal says why in its own words.
   */
  batchStopped: (done, of, why) => `${done} of ${of} parts went, then: ${/[.!?…]$/.test(why.trim()) ? why.trim() : `${why.trim()}.`} The rest did not go.`,
  /** A plan's silent steps, stopped at step n by its refusal (`why`, in the refusal's own words): nothing after it was done. */
  planStopped: (n, why) => `Stopped at step ${n}: ${/[.!?…]$/.test(why.trim()) ? why.trim() : `${why.trim()}.`} The steps after it were not done.`
};
var asText = (v) => v == null ? "" : String(v);
var rec = (v) => v && typeof v === "object" ? v : {};
var decisionOf = (data) => {
  const id = rec(data).decision_id;
  return typeof id === "string" && id ? id : null;
};
var wasIn = (data, k) => {
  const was = rec(rec(data).was);
  return Object.prototype.hasOwnProperty.call(was, k) ? was[k] : void 0;
};
var idIn = (pl, k) => typeof pl?.[k] === "string" && pl[k] ? pl[k] : null;
var refuseWith = (words) => ({ refused: words });
var uniqueIds = (v) => Array.isArray(v) ? [...new Set(v.map(asText).filter(Boolean))] : [];
function oneOrMany(calls) {
  const [only, ...rest] = calls;
  return only && rest.length === 0 ? only : calls;
}
var ownEntry = (m, k) => Object.prototype.hasOwnProperty.call(m, k) ? m[k] : void 0;
var PEOPLE_CHANGED = { type: "surface:clients" };

// src/ask-proposals/campaigns.ts
var PLAYBOOK_CARD_WORDS = {
  /**
   * A campaign that starts on trial (D5: under an auto class only): for its first week, counted from its Approve
   * (contracts newCampaignTrialUntil, at the route's clock), each run waits for a Stop as veto's do, said in veto's own
   * words (PLAYBOOK_VETO_DELAY_WORDS), so a sentence that says both the trial and veto names one wait.
   */
  trial: `on trial for a week from when you approve it: for seven days each run waits ${PLAYBOOK_VETO_DELAY_WORDS} with a Stop`,
  /**
   * A reminder the day before or a check after an appointment (D2): one message per appointment, sent whatever else
   * the person hears from you within a week of it, sent or due (BREATH_WHY), since the run is daily and the appointment
   * is on one day (contracts playbookRunReach), so the week's breath, which holds every other moment, does not hold it.
   */
  appointmentBreath: `exempt from one a week per person: each goes whatever else they hear ${BREATH_WHY}`
};
var channelsNamed = (pl) => Array.isArray(pl.channels) ? { channels: pl.channels } : {};
var cancelCall = (u) => ({
  route: "POST broadcasts/[id]/cancel",
  params: { id: asText(u.broadcast_id) }
});
var canceled = (data) => rec(data).was === "sending" ? "Stopped \u2014 it ends after this batch" : "Canceled \u2014 nothing will send";
var broadcastSpec = {
  needs: "operator",
  gate: "approve",
  commit: ({ payload: pl }) => ({
    route: "POST broadcasts",
    body: {
      template_id: pl.template_id,
      params: Array.isArray(pl.params) ? pl.params : [],
      audience: { kind: pl.audience_kind, id: pl.audience_id ?? null },
      scheduled_for: pl.scheduled_for ?? null,
      name: pl.name ?? null,
      ...channelsNamed(pl)
    }
  }),
  // The count and the name are the route's answer where it gave them, the card's where it did not: who it goes to, the
  // people it enrolled less those it left out for the breath (goesToOf), and how many were left out.
  receipt: ({ payload: pl }, data) => {
    const d = rec(data);
    const leftOut = typeof d.left_out === "number" ? d.left_out : 0;
    const n = typeof d.recipient_count === "number" ? goesToOf({ recipient_count: d.recipient_count, left_out: leftOut }) : Number(pl.count ?? 0);
    const ahead = d.scheduled_ahead === true;
    const said = heardWords(leftOut, true);
    return `Broadcast \u201C${d.name ?? asText(pl.name)}\u201D \u2014 ${n} ${n === 1 ? "person" : "people"}, ${ahead ? "scheduled" : SENDING_NOW_WORDS}${said ? ` \xB7 ${said}` : ""}`;
  },
  undo: {
    label: () => "Cancel it, if it has not finished",
    window: "ten_minutes",
    record: (_p, data) => ({ broadcast_id: rec(data).id, decision_id: decisionOf(data) }),
    call: cancelCall,
    receipt: canceled
  },
  open: () => "broadcasts"
};
var playbookSpec = {
  needs: "operator",
  gate: "approve",
  commit: ({ payload: pl }) => ({
    route: "POST playbooks",
    body: {
      name: pl.name ?? null,
      trigger: pl.trigger,
      // On a list (decision 0009): the list it names, and whether it sends an offer or a win-back.
      ...pl.list_key ? { list_key: pl.list_key } : pl.list_id ? { list_id: pl.list_id } : {},
      ...pl.list_key || pl.list_id ? { policy_class: pl.policy_class } : {},
      // A starter named and no message (A0): the route files the starter, then starts the playbook on it.
      ...pl.starter_key && !pl.template_id ? { starter_key: pl.starter_key } : { template_id: pl.template_id },
      params: Array.isArray(pl.params) ? pl.params : [],
      run_hour: pl.run_hour,
      cap_per_run: pl.cap_per_run,
      gap_days: pl.gap_days,
      cadence_days: pl.cadence_days,
      ...channelsNamed(pl),
      // It starts on trial (D5), where the card said so: the route counts the week from the Approve, at its own clock.
      ...pl.trial === true ? { trial: true } : {},
      // Its last day (00416), where the card named one: the route judges it again at its own clock.
      ...typeof pl.until === "string" ? { until: pl.until } : {}
    }
  }),
  // "Campaign", the word a person reads; and, where the route says it sent the starter's WhatsApp version for review, so.
  receipt: ({ payload: pl }, data) => `Campaign \u201C${rec(data).name ?? asText(pl.name)}\u201D is running \u2014 its next run is under Coming up in Campaigns${rec(rec(data).starter).status === "submitted" ? " \xB7 its starter's WhatsApp version is with WhatsApp for review" : ""}`,
  undo: {
    label: () => "Delete it \u2014 nothing will run",
    window: "ten_minutes",
    record: (_p, data) => ({ playbook_id: rec(data).id, decision_id: decisionOf(data) }),
    call: (u) => ({ route: "DELETE playbooks/[id]", params: { id: asText(u.playbook_id) } }),
    receipt: () => "Deleted \u2014 nothing will run"
  },
  // The new campaign's sequence once it is made (spec 2026-10-09 §4.6, one landing rule: `campaigns/moment:<id>` lands on
  // it), by the id its commit kept for the undo, as the list card opens the list it made; before then New sequence on its
  // moment, its line written in, and Sequences where the card names no moment (the composer's moment mode went: the
  // closed-loop audit of 17 Oct 2026, G).
  open: ({ payload }, outcome) => {
    const id = idIn(rec(outcome?.undo), "playbook_id");
    if (id) return `campaigns/moment:${id}`;
    const trigger = idIn(payload, "trigger");
    return trigger ? newSequenceRoute(trigger) : "outbound";
  }
};
var channelsIn = (v) => Array.isArray(v) ? CONSENT_CHANNELS.filter((c) => v.includes(c)) : [];
var playbookChannelsSpec = {
  needs: "operator",
  gate: "approve",
  commit: ({ payload: pl }) => {
    const id = idIn(pl, "playbook_id");
    const channels = channelsIn(pl.channels);
    if (!id || channels.length === 0) return refuseWith(PROPOSAL_WORDS.cannotApprove);
    return { route: "PUT playbooks/[id]", params: { id }, body: { channels } };
  },
  // The drawer's own sentence, whole (LIFECYCLE_TOAST.channels): "Visit reminder goes by WhatsApp and Email now", and
  // after it that the run which waits keeps the channels it was made with, where one does.
  receipt: ({ payload: pl }) => LIFECYCLE_TOAST.channels(asText(pl.name) || "The campaign", channelsIn(pl.channels), pl.run_waits === true).map((part) => typeof part === "string" ? part : part.b).join(""),
  undo: {
    label: ({ payload }) => `Put it back to ${channelsGoesByWords(channelsIn(payload.was))}`,
    window: "ten_minutes",
    // The channels the route found when it wrote (its answer's `was`), the card's own reading where an older route
    // answers none.
    record: (p, data) => ({ playbook_id: p.payload.playbook_id, was: wasIn(data, "channels") ?? p.payload.was }),
    call: (u) => {
      const was = channelsIn(u.was);
      return was.length === 0 || !asText(u.playbook_id) ? refuseWith(PROPOSAL_WORDS.noUndo) : { route: "PUT playbooks/[id]", params: { id: asText(u.playbook_id) }, body: { channels: was } };
    },
    receipt: () => "Its channels are as they were"
  },
  // Its sequence (`campaigns/moment:<id>` lands on it), where its record shows what it goes by now.
  open: ({ payload }) => {
    const id = idIn(payload, "playbook_id");
    return id ? `campaigns/moment:${id}` : "outbound";
  }
};
var whatsappFiledWords = (state) => {
  const at = metaStatusOf(state);
  const where = `(see ${CAMPAIGN_ROOMS.home} \u203A ${CAMPAIGN_ROOMS.library})`;
  if (at === "approved") return "is approved";
  if (at === "pending") return "is with WhatsApp for review";
  return at === "rejected" ? `was refused by WhatsApp ${where}` : `is ${at} by WhatsApp ${where}`;
};
var versionsWords = (own) => `${own.map(versionWord).join(" and ")} version${own.length === 1 ? "" : "s"}`;
var MESSAGE_WORDS = {
  /** A text version of an offer: the door's sentence (contracts channelNeverCarries). */
  smsOffer: `${CHANNEL_WORDS.noOffersByText} Say so, and write the offer for WhatsApp and email alone.`,
  /** A message about their own booking or proposal with no WhatsApp version for WhatsApp to review: the door's sentence. */
  utilityNeedsWhatsapp: `${MESSAGE_BEGIN_WORDS.utilityNeedsWhatsapp} Add one, or write it as an offer or news (marketing).`,
  /** A WhatsApp version past what WhatsApp takes: the door's sentence (templateBodyTooLong). */
  tooLong: `${TEMPLATE_BODY_WORDS} Shorten its WhatsApp version, and propose it again.`,
  /** A WhatsApp version where no number is connected: what the door answers when the edge finds none. */
  noNumber: `${LIBRARY_WORDS.writeNeedsNumber} Say so, and write it for email or text alone, or once a number is connected.`,
  /**
   * An email version where email cannot send, which is known (channelsReady: no mailbox, or no email for the deployment):
   * why, in its sentence, else the mailbox's.
   */
  noMailbox: (why) => `${why ?? CHANNEL_WORDS.noMailbox} Say so, and write it without an email version.`,
  /**
   * An email version where whether email can send could not be asked just now (channelsReady's `unchecked`): not a no, so
   * the email stays in the message, and the card is asked for again in a moment.
   */
  emailUnchecked: `Whether email can send here could not be checked just now. Say so, and propose it again in a moment, with its email version.`,
  /** A name and language the Library holds: the door's sentence for a twin, and where that message's versions change. */
  twin: (name) => `${TEMPLATE_SAME_NAME_WORDS} Say so: \u201C${name}\u201D in this language is in ${CAMPAIGN_ROOMS.home} \u203A ${CAMPAIGN_ROOMS.library}, where its versions are changed.`,
  /** The card's title: the name the door files the message under, and its language in words ("in English"). */
  title: (name, language) => `${CAMPAIGN_ROOMS.newMessage}: ${name}, in ${languageName(language)}`,
  /**
   * When its versions are ready to send: an email's and a text's once Approve files them (the card itself sends nothing,
   * and in a plan it sits among the silent steps), WhatsApp's once WhatsApp has reviewed it, in the product's voice (a
   * person reads WhatsApp, never Meta, as STARTER_LINE_WORDS say the review).
   */
  goes: (now, review) => {
    const reviewed = "once WhatsApp has reviewed it (usually minutes, sometimes a day)";
    if (now.length === 0) return review ? `Its WhatsApp version is ready ${reviewed}` : "";
    return `Ready ${channelsWords(now)} once approved${review ? `; its WhatsApp version ${reviewed}` : ""}`;
  },
  /**
   * What the door filed (its answer): each version, ready, in review or as WhatsApp answered its filing (refused at once,
   * say, which is said with where it is seen), and the one it could not file, in its words.
   */
  filed: (name, filed, refused) => {
    const said = filed.map(
      (v) => v.channel === "whatsapp" ? `its WhatsApp version ${whatsappFiledWords(v.state)}` : `its ${versionWord(v.channel)} version is ready`
    );
    if (said.length === 0) return `\u201C${name}\u201D was not filed${refused ? `: ${refused.words}` : ""}`;
    const not = refused ? ` \xB7 its ${versionWord(refused.channel)} version was not filed: ${refused.words}` : "";
    return `\u201C${name}\u201D is in ${CAMPAIGN_ROOMS.library} \u2014 ${said.join("; ")}${not}`;
  },
  /** The undo's button: the email and text versions it deletes; none where the card writes none. */
  undo: (own) => own.length > 0 ? `Delete its ${versionsWords(own)}` : null,
  /**
   * What the undo did: those versions deleted, and the WhatsApp version, where the door filed one, left, said so, and
   * where a person deletes it if it should go.
   */
  undone: (own, whatsapp) => {
    const gone = `Its ${versionsWords(own)} ${own.length === 1 ? "is" : "are"} deleted`;
    return whatsapp ? `${gone}. Its WhatsApp version stays, held by WhatsApp: delete it in ${CAMPAIGN_ROOMS.home} \u203A ${CAMPAIGN_ROOMS.library} if it should go.` : gone;
  },
  /**
   * An undo refused part-way: the versions already deleted, the ones that are not, and the door's refusal; nothing deleted
   * yet, the refusal alone. Pressed again, the deleted ones are answered as they were and the rest is tried.
   */
  partlyUndone: (gone, left, refused) => gone.length === 0 ? refused : `Its ${versionsWords(gone)} ${gone.length === 1 ? "is" : "are"} deleted; its ${versionsWords(left)} ${left.length === 1 ? "is" : "are"} not: ${refused}`
};
var versionsIn = (v) => Array.isArray(v) ? v.map(rec).flatMap(
  (x) => CONSENT_CHANNELS.includes(x.channel) && typeof x.id === "string" && x.id ? [{ channel: x.channel, id: x.id, state: asText(x.state) }] : []
) : [];
var writtenHere = (c) => c !== "whatsapp";
var ownKept = (u) => versionsIn(u.versions).map((v) => v.channel).filter(writtenHere);
var messageSpec = {
  needs: "operator",
  gate: "approve",
  commit: ({ payload: pl }) => {
    const name = asText(pl.name);
    const versions = rec(pl.versions);
    if (!name || Object.keys(versions).length === 0) return refuseWith(PROPOSAL_WORDS.cannotApprove);
    return {
      route: "POST templates/message",
      body: {
        name,
        language: pl.language,
        category: pl.category,
        versions,
        slots: Array.isArray(pl.slots) ? pl.slots : []
      }
    };
  },
  receipt: ({ payload: pl }, data) => {
    const d = rec(data);
    const refused = rec(d.refused);
    const not = CONSENT_CHANNELS.includes(refused.channel) ? { channel: refused.channel, words: asText(refused.words) } : null;
    return MESSAGE_WORDS.filed(asText(d.name ?? pl.name), versionsIn(d.versions), not);
  },
  // The first version the door filed: a broadcast and a playbook take any version's id for the message (core
  // templateValues), so a plan's send names this one. None where nothing was filed.
  made: (_p, data) => versionsIn(rec(data).versions).at(0)?.id ?? null,
  undo: {
    // The versions the card writes that an undo can delete, in the order the door files them.
    label: ({ payload }) => MESSAGE_WORDS.undo(OWN_VERSION_CHANNELS.filter((c) => rec(payload.versions)[c] != null)),
    window: "ten_minutes",
    // The email and text versions the door answered it filed, and the state of a WhatsApp version it filed beside them.
    record: (_p, data) => {
      const filed = versionsIn(rec(data).versions);
      const own = filed.filter((v) => writtenHere(v.channel)).map(({ channel, id }) => ({ channel, id }));
      if (own.length === 0) return null;
      return { versions: own, whatsapp: filed.find((v) => v.channel === "whatsapp")?.state ?? null };
    },
    call: (u) => {
      const own = versionsIn(u.versions).filter((v) => writtenHere(v.channel));
      return own.length === 0 ? refuseWith(PROPOSAL_WORDS.noUndo) : own.map(
        // A version gone already (an earlier press deleted it, or a member did) is what the undo wants.
        (v) => ({ route: "DELETE templates/versions/[id]", params: { id: v.id }, goneIsDone: true })
      );
    },
    receipt: (_data, u) => MESSAGE_WORDS.undone(ownKept(u), u.whatsapp != null),
    // The calls go in the order the kept versions are named, so the first `landed` of them are the ones deleted.
    partial: (u, landed, refused) => {
      const own = ownKept(u);
      return MESSAGE_WORDS.partlyUndone(own.slice(0, landed), own.slice(landed), refused);
    }
  },
  open: () => "messages"
};

// src/ask-proposals/follow-ups.ts
var ASK_VIEW_PAGE = "ask";

// src/ask-proposals/follow-up.ts
var listIn = (v) => Array.isArray(v) ? v : null;
var followUpSpec = {
  needs: "operator",
  gate: "approve",
  commit: ({ payload: pl }) => {
    const list = listIn(pl.follow_ups);
    return list ? { route: "PUT views/[page]", params: { page: ASK_VIEW_PAGE }, body: { view: { follow_ups: list } } } : refuseWith(PROPOSAL_WORDS.cannotApprove);
  },
  receipt: ({ payload: pl }) => pl.cleared === true ? "Done with it" : `I'll come back to it: ${asText(pl.said) || "when it happens"}`,
  undo: {
    label: () => "Undo",
    window: "ten_minutes",
    record: ({ payload: pl }) => {
      const was = listIn(pl.previous);
      return was ? { follow_ups: was } : null;
    },
    call: (u) => ({
      route: "PUT views/[page]",
      params: { page: ASK_VIEW_PAGE },
      body: { view: { follow_ups: listIn(u.follow_ups) ?? [] } }
    }),
    receipt: () => "As it was"
  },
  open: () => null
};

// src/leads/lead-words.ts
var LEAD_VIEW_SORTS = ["fit", "found", "distance", "business", "rating", "stage"];
var LEAD_SORTS = [...LEAD_VIEW_SORTS, "pile"];
var LEAD_CALL_OUTCOMES = [
  "interested",
  "call_back",
  "not_interested",
  "voicemail",
  "no_answer",
  "wrong_number"
];
var LEAD_NOT_A_FIT_WHYS = ["chain", "wrong_kind", "too_far", "customer", "other"];
var LEAD_CLOSED_WORDS = {
  said_no: "Said no",
  not_a_fit: "Not a fit",
  customer: "Already a customer",
  stale: "Went quiet",
  search_removed: "Search removed"
};
var LEAD_CALL_OUTCOME_TONES = {
  interested: "ok",
  call_back: "warn",
  voicemail: "plain",
  no_answer: "plain",
  not_interested: "danger",
  wrong_number: "danger"
};
var LEAD_CALL_OUTCOME_WORDS = {
  interested: "Interested",
  call_back: "Call back later",
  not_interested: "Not interested",
  voicemail: "Left a voicemail",
  no_answer: "No answer",
  wrong_number: "Wrong number"
};
var LEAD_DRAFT_NOTE = "Your business address and a way to say no are added at the foot, as US law asks.";
var LEAD_NOT_A_FIT_WORDS = {
  chain: "A chain or franchise",
  wrong_kind: "The wrong kind of business",
  too_far: "Too far away",
  customer: "Already a customer",
  other: "Something else"
};
var LEAD_NOT_A_FIT_TITLE = "What makes it not a fit?";
var LEAD_ERASE_WORDS = {
  act: "Erase this lead",
  ask: (name) => `Erase ${name}? Its record and every trace of it go for good.`,
  yes: "Yes, erase",
  no: "No",
  busy: "Erasing\u2026",
  done: (name) => `${name} is erased. It won't be found again.`,
  refused: "Not erased"
};
var LEAD_SENT_QUESTION = "Did you send it?";
var LEAD_CALL_QUESTION = "How did the call go?";
var LEAD_NOTE_PLACEHOLDER = "A note for next time, if you like";
var LEAD_NOTE_MAX = 280;
var LEAD_TALKING_NOTE = "They join People when they write or call in, or when a call goes well.";
function leadNoteLeft(left, max) {
  return left >= max ? `Up to ${max} characters` : `${left} left`;
}
var LEAD_UNCLAIMED_NOTE = "Listing not claimed by the owner";

// src/leads/lead-plan.ts
function leadsRoute(v) {
  const parts = ["clients/leads"];
  if (v.searchId) parts.push(`s-${v.searchId}`);
  if (v.list && v.list !== "all") parts.push(`l-${v.list}`);
  if (v.cls) parts.push(`c-${v.cls}`);
  if (v.peek) parts.push(`p-${v.peek}`);
  return parts.join(":");
}
var leadQuestionRoute = (searchId) => leadsRoute({ searchId, cls: "excluded" });

// src/deals/deal-words.ts
var DEAL_STAGE_WORDS = {
  proposed: "Proposal out",
  won: "Client",
  lost: "Passed",
  ended: "Ended"
};

// src/ask/ask.ts
var ASK_TURN_BUDGET_MS = 2 * MIN_MS;
var ASK_VOICE_TOKEN_MIN_MS = 15 * MIN_MS;
var ASK_VOICE_TIMING_MAX_MS = 10 * MIN_MS;
var ASK_THREAD_VERBS = ["take_over", "hand_back", "snooze", "wake", "archive", "resolve"];
var ASK_UNDO_MS = 10 * MIN_MS;

// src/ask-proposals/inbox.ts
var ASK_THREAD_ROUTES = {
  take_over: "POST conversations/[id]/take-over",
  hand_back: "POST conversations/[id]/hand-back",
  snooze: "POST conversations/[id]/snooze",
  wake: "POST conversations/[id]/wake",
  archive: "POST conversations/[id]/archive"
};
var isRoutedVerb = (v) => Object.prototype.hasOwnProperty.call(ASK_THREAD_ROUTES, v);
var INVERSE = {
  take_over: "hand_back",
  hand_back: "take_over",
  snooze: "wake"
};
var UNDO_LABEL = {
  take_over: "Hand back",
  hand_back: "Take over again",
  snooze: "Wake"
};
var RECEIPT = {
  hand_back: "The receptionist has it again",
  snooze: "Snoozed",
  wake: "Back in the Inbox",
  archive: "Archived",
  resolve: "Resolved"
};
var threadCall = (verb, conversationId, until) => verb === "snooze" ? { route: ASK_THREAD_ROUTES.snooze, params: { id: asText(conversationId) }, body: { until: asText(until) } } : { route: ASK_THREAD_ROUTES[verb], params: { id: asText(conversationId) } };
var cardThreadRoute = ({ payload }) => {
  const id = idIn(payload, "conversation_id");
  return id ? `inbox/th-${id}` : null;
};
var replySpec = {
  needs: "operator",
  gate: "approve",
  commit: (p) => ({
    route: "POST conversations/[id]/reply",
    params: { id: asText(p.payload.conversation_id) },
    body: { text: asText(p.payload.text) },
    idempotencyKey: p.id
  }),
  receipt: (p) => `On its way to ${asText(p.payload.who)} \u2014 sends in 15 seconds unless you cancel`,
  undo: {
    label: () => "Sends 15 seconds after you approve; cancel within them",
    window: "cancelable",
    record: (_p, data) => ({
      message_id: rec(data).message_id,
      cancelable_until: rec(data).cancelable_until,
      decision_id: decisionOf(data)
    }),
    call: (u) => ({ route: "POST messages/[id]/cancel-send", params: { id: asText(u.message_id) } }),
    receipt: () => "Canceled before it sent"
  },
  open: () => null
};
var steerSpec = {
  needs: "operator",
  gate: "approve",
  commit: (p) => ({
    route: "POST messages/[id]/steer",
    params: { id: asText(p.payload.message_id) },
    body: { text: asText(p.payload.instruction) }
  }),
  receipt: () => "Rewritten \u2014 the new draft waits its turn",
  open: () => null
};
var threadVerbSpec = {
  needs: "operator",
  gate: "approve",
  commit: (p) => {
    const verb = asText(p.payload.verb);
    if (!ASK_THREAD_VERBS.includes(verb)) return refuseWith(PROPOSAL_WORDS.cannotApprove);
    return verb === "resolve" ? { route: "POST escalations/[id]/resolve", params: { id: asText(p.payload.escalation_id) } } : threadCall(verb, p.payload.conversation_id, p.payload.until);
  },
  receipt: (p) => {
    const verb = asText(p.payload.verb);
    return verb === "take_over" ? `You have ${asText(p.payload.who)}'s thread` : ownEntry(RECEIPT, verb) ?? "Done";
  },
  undo: {
    label: ({ payload }) => ownEntry(UNDO_LABEL, asText(payload.verb)) ?? null,
    window: "ten_minutes",
    record: (p, data) => {
      const inverse = ownEntry(INVERSE, asText(p.payload.verb));
      return inverse ? {
        verb: inverse,
        conversation_id: p.payload.conversation_id,
        until: p.payload.until ?? null,
        decision_id: decisionOf(data)
      } : null;
    },
    call: (u) => {
      const verb = asText(u.verb);
      return isRoutedVerb(verb) ? threadCall(verb, u.conversation_id, u.until) : refuseWith(PROPOSAL_WORDS.noUndo);
    },
    receipt: () => "Undone"
  },
  open: cardThreadRoute
};
var whisperSpec = {
  needs: "operator",
  gate: "approve",
  commit: (p) => ({
    route: "POST calls/[id]/whisper",
    params: { id: asText(p.payload.call_id) },
    body: { text: asText(p.payload.text), trigger: false }
  }),
  receipt: () => "Whispered \u2014 the receptionist works it into its next answer",
  open: () => null
};
var callHandOverSpec = {
  needs: "operator",
  gate: "approve",
  commit: (p) => idIn(p.payload, "call_id") ? { route: "POST calls/[id]/hand-over", params: { id: asText(p.payload.call_id) } } : refuseWith(PROPOSAL_WORDS.cannotApprove),
  receipt: (p) => `Handing ${asText(p.payload.who) || "the caller"} to your phone \u2014 it rings now`,
  open: () => "live"
};

// src/ask-proposals/lead-work.ts
var openLead = ({ payload: pl }) => {
  const id = idIn(pl, "lead_id");
  return id ? leadsRoute({ searchId: idIn(pl, "search_id"), list: "all", cls: null, peek: id }) : "clients/leads";
};
var toastOr = (data, words) => asText(rec(data).toast) || words;
var leadOpUndo = {
  label: () => "Undo",
  window: "ten_minutes",
  record: (_p, data) => {
    const d = rec(data);
    if (d.undo === null) return null;
    const u = rec(d.undo);
    const op = typeof u.op_id === "string" ? u.op_id : typeof d.op_id === "string" ? d.op_id : null;
    return op ? { op_id: op, version: Number(u.version ?? d.version ?? 0) } : null;
  },
  call: (u) => ({
    route: "POST lead-operations/[id]/undo",
    params: { id: asText(u.op_id) },
    body: { version: Number(u.version ?? 0) }
  }),
  receipt: () => "Put back as it was"
};
var leadStageSpec = {
  needs: "operator",
  gate: "approve",
  commit: ({ payload: pl }) => idIn(pl, "lead_id") && pl.input && typeof pl.input === "object" ? { route: "POST leads/[id]/stage", params: { id: asText(pl.lead_id) }, body: pl.input } : refuseWith(PROPOSAL_WORDS.cannotApprove),
  receipt: ({ payload: pl }, data) => toastOr(data, `${asText(pl.who) || "The lead"} moved`),
  undo: leadOpUndo,
  open: openLead
};
var LEAD_MARK_DOORS = {
  keep: "POST leads/[id]/keep",
  exclude: "POST leads/[id]/exclude",
  put_back: "POST leads/[id]/put-back"
};
var isLeadMark = (v) => typeof v === "string" && Object.prototype.hasOwnProperty.call(LEAD_MARK_DOORS, v);
var LEAD_MARK_SAID = { keep: "kept", exclude: "set aside", put_back: "put back" };
var leadMarkSpec = {
  needs: "partner",
  doing: "keep, set aside or put back a search's leads",
  gate: "find",
  commit: ({ payload: pl }) => {
    const search = idIn(pl, "search_id");
    const ids = uniqueIds(pl.lead_ids);
    if (!isLeadMark(pl.mark) || !search || !ids.length) return refuseWith(PROPOSAL_WORDS.cannotApprove);
    const door = LEAD_MARK_DOORS[pl.mark];
    const calls = ids.map((id) => ({ route: door, params: { id }, body: { search_id: search } }));
    return oneOrMany(calls);
  },
  gather: (answers) => ({ done: answers.length }),
  receipt: ({ payload: pl }, data) => {
    const n = Number(rec(data).done) || 1;
    const said = isLeadMark(pl.mark) ? LEAD_MARK_SAID[pl.mark] : "marked";
    return n === 1 && asText(pl.who) ? `${asText(pl.who)} ${said}` : `${n} leads ${said}`;
  },
  open: openLead
};
var leadLaterSpec = {
  needs: "operator",
  gate: "approve",
  commit: ({ payload: pl }) => idIn(pl, "lead_id") && idIn(pl, "search_id") ? { route: "POST leads/[id]/later", params: { id: asText(pl.lead_id) }, body: { search_id: pl.search_id } } : refuseWith(PROPOSAL_WORDS.cannotApprove),
  receipt: ({ payload: pl }) => `${asText(pl.who) || "The lead"} is under Later`,
  undo: leadOpUndo,
  open: openLead
};
var leadsBulkSpec = {
  needs: "operator",
  gate: "approve",
  commit: ({ payload: pl }) => {
    const body = rec(pl.body);
    return body.by === "ids" || body.by === "view" ? { route: "POST leads/bulk", body } : refuseWith(PROPOSAL_WORDS.cannotApprove);
  },
  receipt: (_p, data) => toastOr(data, `${Number(rec(data).done) || 0} leads changed`),
  undo: leadOpUndo,
  open: () => "clients/leads"
};
var leadsCheckSpec = {
  needs: "partner",
  doing: "check leads' addresses again",
  gate: "find",
  commit: ({ payload: pl }) => {
    const ids = uniqueIds(pl.lead_ids);
    return ids.length ? { route: "POST leads/check-again", body: { ids } } : refuseWith(PROPOSAL_WORDS.cannotApprove);
  },
  receipt: (_p, data) => toastOr(data, `${Number(rec(data).scheduled) || 0} addresses checked again`),
  open: () => "clients/leads"
};
var leadAddresseeSpec = {
  needs: "partner",
  doing: "choose who a company's email goes to",
  gate: "find",
  commit: ({ payload: pl }) => idIn(pl, "lead_id") && typeof pl.person === "number" ? { route: "POST leads/[id]/addressee", params: { id: asText(pl.lead_id) }, body: { person: pl.person } } : refuseWith(PROPOSAL_WORDS.cannotApprove),
  receipt: ({ payload: pl }) => `Writes to ${asText(pl.person_name) || "them"} at ${asText(pl.who) || "the company"}`,
  open: openLead
};
var leadListSpec = {
  needs: "operator",
  gate: "approve",
  commit: ({ payload: pl }) => {
    const ids = uniqueIds(pl.lead_ids);
    return asText(pl.name) && ids.length ? { route: "POST lead-searches/chosen", body: { name: asText(pl.name), lead_ids: ids } } : refuseWith(PROPOSAL_WORDS.cannotApprove);
  },
  receipt: ({ payload: pl }, data) => {
    const n = Number(rec(data).counted) || 0;
    return `\u201C${asText(pl.name)}\u201D: ${n === 1 ? "1 lead" : `${n} leads`} to write to`;
  },
  made: (_p, data) => idIn(rec(data), "search_id"),
  open: (_p, outcome) => outcome?.made?.id ? leadsRoute({ searchId: outcome.made.id, list: "all", cls: null }) : "clients/leads"
};
var leadSearchMoreSpec = {
  needs: "partner",
  doing: "find more leads for a search",
  gate: "find",
  commit: ({ payload: pl }) => idIn(pl, "search_id") && pl.plan && typeof pl.plan === "object" ? {
    route: "POST lead-searches/[id]/more",
    params: { id: asText(pl.search_id) },
    body: { purpose: pl.purpose === "renew" ? "renew" : "topup", plan: pl.plan }
  } : refuseWith(PROPOSAL_WORDS.cannotApprove),
  receipt: ({ payload: pl }) => `${asText(pl.name) || "The search"} finds more. It carries on if you leave; Leads shows it.`,
  undo: {
    label: () => "Stop it",
    window: "ten_minutes",
    record: (p) => idIn(p.payload, "search_id") ? { search_id: p.payload.search_id } : null,
    call: (u) => ({ route: "POST lead-searches/[id]/stop", params: { id: asText(u.search_id) } }),
    receipt: () => "Stopping. Whatever it found is kept."
  },
  open: ({ payload: pl }) => {
    const id = idIn(pl, "search_id");
    return id ? leadsRoute({ searchId: id, list: "all", cls: null }) : "clients/leads";
  }
};
var reachOutMakeSpec = {
  needs: "operator",
  gate: "approve",
  commit: ({ payload: pl }) => {
    const chain = rec(pl.chain);
    return asText(chain.name) && asText(chain.search_id) && Array.isArray(chain.steps) && chain.steps.length ? { route: "POST reach-outs", body: chain } : refuseWith(PROPOSAL_WORDS.cannotApprove);
  },
  receipt: ({ payload: pl }) => `\u201C${asText(rec(pl.chain).name)}\u201D is saved. Its first batch is planned now, and waits for your OK before an email goes.`,
  made: (_p, data) => idIn(rec(data), "root_id"),
  open: (_p, outcome) => outcome?.made?.id ? `campaigns/moment:${outcome.made.id}` : "campaigns"
};
var reachOutSaidSpec = {
  needs: "operator",
  gate: "approve",
  commit: ({ payload: pl }) => idIn(pl, "lead_id") && asText(pl.intent) ? {
    route: "POST reach-outs/leads/[id]/said",
    params: { id: asText(pl.lead_id) },
    body: {
      intent: pl.intent,
      ...typeof pl.day === "string" ? { day: pl.day } : {},
      ...typeof pl.refer_to === "string" ? { refer_to: pl.refer_to } : {}
    }
  } : refuseWith(PROPOSAL_WORDS.cannotApprove),
  receipt: ({ payload: pl }, data) => rec(data).already === true ? "Already said: nothing was written twice" : `${asText(pl.who) || "The business"}: ${asText(pl.said) || asText(pl.intent)}`,
  open: openLead
};

// src/leads/leads.ts
var LEAD_FIRST_DAY = {
  title: "Who do you want as customers?",
  sub: "Say it in a sentence. Claude finds businesses that fit, checks each one, and shows how to reach them.",
  ask: "Describe the businesses you want",
  ideas: "Or start from an idea",
  /** While another read writes them (00398): the page asks again in a moment. */
  writing: "Writing your ideas\u2026",
  from: "Written from what you do:",
  edit: "Edit",
  /** New ideas from the same line, when the owner wants others (00399). */
  newIdeas: "New ideas",
  lineTitle: "What your business does",
  lineSub: "Claude writes your ideas from this. Say what you sell and who you sell it to.",
  lineLabel: "Your business, in a sentence",
  linePlaceholder: "What you sell, and who buys it",
  haveList: "Have a list already?",
  importIt: "Import it",
  /** The people card's door (00430), on a desk's first day and a phone's New search, where no rail is drawn. */
  wantPeople: "Looking for people at companies?",
  findPeople: "Find people"
};
var LEAD_SUGGEST_UNAVAILABLE = "Suggestions are not available right now.";
var LEAD_WORDS = {
  /**
   * The ways a lead can be rung, offered when Call is pressed rather than dialling on the spot. Pressing it rang a
   * real business the moment a thumb landed on a row you might only have been skimming, and a call made from a
   * desk phone could not be recorded at all -- the six outcomes are armed by that button alone.
   *
   * The receptionist is NOT one of the ways and must not become one here. It answers the line and never rings a
   * customer (`business-tab.ts` CANNOT_ROWS, "outbound_call"), which the Business page states to the owner in
   * those words. A menu item offering it would promise what the product says two pages away that it cannot do.
   */
  callWays: {
    dial: { label: "Call from your phone" },
    copy: { label: "Copy the number" },
    /** Rung from a desk phone or a softphone: no dial, straight to "How did the call go?". */
    log: { label: "Log a call you already made", meta: "how did it go?" }
  },
  close: "Close",
  open: "Open",
  /** The door from a lead that became a person (its name in the peek, the row's Client pill) to them in People. */
  openPerson: "Open them in People",
  stageLabel: "Stage",
  notFit: LEAD_CLOSED_WORDS.not_a_fit,
  notFitTitle: LEAD_NOT_A_FIT_TITLE,
  whys: LEAD_NOT_A_FIT_WHYS.map((id) => ({ id, label: LEAD_NOT_A_FIT_WORDS[id] })),
  keep: "Keep",
  exclude: "Exclude",
  putBack: "Put back",
  leftOut: "Left out of this search. It doesn't count.",
  reach: "How you can reach them",
  checked: "Checked",
  found: "Found",
  call: "Call",
  copy: "Copy",
  copyAria: "Copy the email",
  /** The peek's reach rows act with quiet marks; these are their names, heard and shown on hover (data-tip). */
  copyPhoneAria: "Copy the number",
  draftAria: "Draft an email",
  draft: "Draft",
  noWebsite: "No website listed",
  instagram: "Instagram",
  talkingNote: LEAD_TALKING_NOTE,
  sentQuestion: LEAD_SENT_QUESTION,
  sentYes: "Yes, mark contacted",
  sentNo: "Not yet",
  callQuestion: LEAD_CALL_QUESTION,
  callSave: "Save",
  callCancel: "I didn't call",
  outcomes: LEAD_CALL_OUTCOMES.map((id) => ({
    id,
    label: LEAD_CALL_OUTCOME_WORDS[id],
    tone: LEAD_CALL_OUTCOME_TONES[id]
  })),
  noteLabel: "A note about the call",
  /** Under Interested (0052): the person the call reached, who becomes their own page's name. */
  spokeWith: "Who did you speak with?",
  spokeWithPlaceholder: "Their name, if they said it",
  notePlaceholder: LEAD_NOTE_PLACEHOLDER,
  noteMax: LEAD_NOTE_MAX,
  noteLeft: leadNoteLeft,
  backTo: "Back to",
  to: "To",
  subject: "Subject",
  draftRewrite: "Rewrite",
  tones: [
    { id: "shorter", label: "Shorter" },
    { id: "warmer", label: "Warmer" }
  ],
  draftWriting: "Writing it\u2026",
  draftNote: LEAD_DRAFT_NOTE,
  draftOpen: "Open in your email",
  draftFrom: "Sent from your own inbox",
  copiedDraft: "Copied the email.",
  firstDay: LEAD_FIRST_DAY,
  about: "About",
  reachHeading: "Reach",
  unclaimed: LEAD_UNCLAIMED_NOTE,
  suggestUnavailable: LEAD_SUGGEST_UNAVAILABLE,
  // D5: the peek re-cut, and the photo expanded.
  expand: "Expand",
  photos: "Photos",
  noPhoto: "No photo on the listing",
  whereSits: "Where it sits",
  openHours: "Open hours",
  fromListing: "From the listing",
  openMaps: "Open in Maps",
  ratedHeading: "What people say",
  closePhotos: "Close",
  /**
   * The rail's two sections. The first is six views of a lead's stage (LEAD_LIST_WORDS), not lists: "Lists" is People's word
   * for a rule over facts (decision 0009, LIST_GROUP_WORDS), and a list of the owner's own made from a file sits under
   * Searches here.
   */
  viewsHeading: "Views",
  searchesHeading: "Searches",
  // D5, on a phone: one lead at a time, and the question when you are back from the call.
  deckOf: (at, of) => `${at} of ${of}`,
  deckPrev: "The lead before",
  deckNext: "The next lead",
  callSaveNext: "Save and go to the next",
  callSavedNote: "Saving moves them to Talking. They join People when they write or call in.",
  /**
   * The peek's ⋯ menu and its one item (Reach out Part 4, PR 9): Erase, the owner's alone (DELETE leads/[id]), asked
   * first because it cannot be undone. Who is offered it is `leadPeekMenu`'s to say, never the page's.
   */
  more: "More for this lead",
  erase: LEAD_ERASE_WORDS
};

// src/ask-proposals/leads.ts
var amendsOf = (pl) => {
  const am = pl?.amends ?? null;
  return am && typeof am.search_id === "string" && am.search_id ? am : null;
};
var leadSearchSpec = {
  needs: "partner",
  doing: "start a lead search",
  gate: "find",
  commit: ({ payload: pl }) => {
    const am = amendsOf(pl);
    if (am)
      return {
        route: "POST lead-searches/[id]/answer",
        params: { id: am.search_id },
        body: { answer: "include", plan: pl.plan }
      };
    const threadId = typeof pl.thread_id === "string" && pl.thread_id ? pl.thread_id : null;
    return { route: "POST lead-searches", body: threadId ? { ...pl.plan, thread_id: threadId } : pl.plan };
  },
  receipt: ({ payload: pl }) => {
    const am = amendsOf(pl);
    if (am) return `Answered. ${asText(am.name) || "The search"} carries on with your answer; Leads shows it.`;
    const plan = pl.plan ?? {};
    return `Finding ${plan.count ?? ""} ${plan.terms?.[0] ?? "businesses"}. It carries on if you leave; Leads shows it.`.replace(
      /\s+/g,
      " "
    );
  },
  // The search it started (an answer started none), for a later step of Ask's plan that names it: a follow-up on it.
  made: ({ payload }, data) => amendsOf(payload) ? null : idIn(rec(data), "search_id"),
  undo: {
    // An answer carries the round on; there is nothing to undo (Stop is the strip's).
    label: ({ payload }) => amendsOf(payload) ? null : "Stop the search",
    window: "ten_minutes",
    record: (p, data) => amendsOf(p.payload) ? null : { search_id: rec(data).search_id },
    // An operator's route undoing a partner's card: stopping a search spends nothing (route-policy.json).
    call: (u) => ({ route: "POST lead-searches/[id]/stop", params: { id: asText(u.search_id) } }),
    receipt: () => "Stopping. Whatever it found is kept, and the emails already found are still checked."
  },
  open: ({ payload }, outcome) => {
    const am = amendsOf(payload);
    if (am) return leadQuestionRoute(am.search_id);
    const sid = idIn(rec(outcome?.undo), "search_id");
    return sid ? leadsRoute({ searchId: sid, list: "all", cls: null }) : "clients/leads";
  }
};
var peopleSearchSpec = {
  needs: "partner",
  doing: "start a people search",
  gate: "find",
  commit: ({ payload: pl }) => {
    const threadId = typeof pl.thread_id === "string" && pl.thread_id ? pl.thread_id : null;
    return { route: "POST lead-searches/people", body: { plan: pl.plan, via: "ask", thread_id: threadId } };
  },
  receipt: ({ payload: pl }) => {
    const plan = pl.plan ?? {};
    const n = typeof plan.count === "number" ? plan.count : null;
    const what = n === null ? "companies" : `${n} ${n === 1 ? "company" : "companies"}`;
    return `Finding up to ${what}${plan.name ? `: ${plan.name}` : ""}. Each lands on Leads once its address checks out.`;
  },
  undo: {
    label: () => "Stop the search",
    window: "ten_minutes",
    record: (_p, data) => ({ search_id: rec(data).search_id }),
    call: (u) => ({ route: "POST lead-searches/[id]/stop", params: { id: asText(u.search_id) } }),
    receipt: () => "Stopping. Whatever it found is kept, and the addresses already found are still checked."
  },
  open: (_p, outcome) => {
    const sid = idIn(rec(outcome?.undo), "search_id");
    return sid ? leadsRoute({ searchId: sid, list: "all", cls: null }) : "clients/leads";
  }
};
var reachOutAddSpec = {
  needs: "operator",
  gate: "approve",
  commit: ({ payload: pl }) => ({
    route: "POST reach-outs/[id]/leads",
    params: { id: asText(pl.root_id) },
    body: { lead_ids: Array.isArray(pl.lead_ids) ? pl.lead_ids.filter((x) => typeof x === "string") : [] }
  }),
  receipt: ({ payload: pl }, data) => {
    const added = Number(rec(data).added ?? 0);
    const name = asText(pl.name) || "the sequence";
    return added > 0 ? `Added ${added === 1 ? "1 lead" : `${added} leads`} to \u201C${name}\u201D. Nothing goes to them until you give its next batch your OK.` : `None could be added to \u201C${name}\u201D.`;
  },
  undo: {
    label: () => "Take them back",
    window: "ten_minutes",
    record: (_p, data) => {
      const d = rec(data);
      return typeof d.op_id === "string" ? { op_id: d.op_id, version: Number(d.version ?? 1) } : null;
    },
    call: (u) => ({
      route: "POST lead-operations/[id]/undo",
      params: { id: asText(u.op_id) },
      body: { version: Number(u.version ?? 1) }
    }),
    receipt: () => "Taken back off its list. Nothing had been written to them."
  },
  open: ({ payload }) => {
    const id = idIn(payload, "root_id");
    return id ? `campaigns/moment:${id}` : "outbound";
  }
};

// src/people/lists/list-rules.ts
import * as z from "zod/mini";

// src/conversations/standing.ts
var HELD_WORDS = {
  yours: {
    pill: "You have it",
    sentence: "You're answering this one. The receptionist stays quiet until you hand it back."
  },
  theirs: {
    pill: "A teammate has it",
    sentence: "A teammate is answering this. The receptionist stays quiet until they hand it back."
  }
};
var NEEDS_YOU_WORD = "Needs you";

// src/people/lists/list-rules.ts
var LIST_NEEDS = ["calendar", "consult", "deals", "viewer"];
var LIST_RULE_FIELDS = [
  {
    id: "last_visit",
    label: "Last on the calendar",
    kind: "days",
    needs: ["calendar"],
    draft: "days since their last appointment on the calendar"
  },
  {
    id: "next_visit",
    label: "Next on the calendar",
    kind: "days",
    needs: ["calendar"],
    draft: "days until their next appointment; op this_week is Monday to Sunday of this week"
  },
  {
    id: "missed_visit",
    label: "Missed one",
    kind: "days",
    needs: ["calendar"],
    draft: "days since an appointment they did not come to, as a member marked it missed on the calendar"
  },
  { id: "booked", label: "Booked ahead", kind: "yesno", needs: ["calendar"], draft: "an appointment booked ahead" },
  {
    id: "asked_not_booked",
    label: "Asked, never booked",
    kind: "yesno",
    needs: ["calendar"],
    draft: "wrote or called in the last 30 days and nothing on the calendar answers it"
  },
  {
    id: "last_heard",
    label: "Last heard from",
    kind: "days",
    needs: [],
    draft: "days since THEY last wrote or called"
  },
  { id: "first_contact", label: "First contact", kind: "days", needs: [], draft: "days since they first got in touch" },
  {
    id: "channel",
    label: "Reaches you by",
    kind: "channel",
    needs: [],
    draft: "a way they reach the business: whatsapp, sms, voice (phone calls) or email"
  },
  {
    id: "came_from",
    label: "Came from",
    kind: "came_from",
    needs: [],
    draft: "how they first came: whatsapp, sms, email, call, calendar, manual, import or lead"
  },
  { id: "calls", label: "Calls", kind: "count", needs: [], draft: "how many calls" },
  { id: "conversations", label: "Conversations", kind: "count", needs: [], draft: "how many conversations" },
  {
    id: "has_chat",
    label: "Has written with you",
    kind: "yesno",
    needs: [],
    draft: "a written conversation either way (no means they have only phoned)"
  },
  {
    id: "said_yes",
    label: "Said yes to",
    kind: "purpose",
    needs: [],
    draft: "said yes to offers, or to messages (to: offers or messages)"
  },
  {
    id: "can_receive",
    label: "Can be sent",
    kind: "purpose",
    needs: [],
    draft: "can be sent offers or messages: the yes and a number to send to (to: offers or messages)"
  },
  { id: "stopped", label: "Asked to stop", kind: "yesno", needs: [], draft: "asked to stop, or on do-not-contact" },
  {
    id: "standing",
    label: "Standing",
    kind: "standing",
    needs: [],
    draft: "value needs_you (waiting for a person) or waiting_on_you (a thread you have: you took it over, or your reply paused the receptionist)"
  },
  {
    id: "assigned",
    label: "Thread is with",
    kind: "assigned",
    needs: [],
    draft: "who has their thread: value me, teammate or nobody"
  },
  {
    id: "deal_stage",
    label: "Deal",
    kind: "deal_stage",
    needs: ["deals"],
    draft: "where they are on the way to a deal: value consultation, proposed, won, lost (passed) or ended"
  },
  {
    id: "consultation",
    label: "A consultation",
    kind: "yesno",
    needs: ["calendar", "consult"],
    draft: "their next or last appointment is a consultation"
  },
  { id: "step_due", label: "A next step due", kind: "yesno", needs: [], draft: "a next step whose day has come" },
  {
    id: "in_list",
    label: "On the list",
    kind: "list",
    needs: [],
    draft: "on another list, by its token (list); never use it in a draft"
  }
];
var FIELD_IDS = LIST_RULE_FIELDS.map((f) => f.id);
var fieldOf = (id) => LIST_RULE_FIELDS.find((f) => f.id === id);
var CHANNELS = ["whatsapp", "sms", "voice", "email"];
var CAME_FROM = [
  "whatsapp",
  "sms",
  "email",
  "call",
  "calendar",
  "manual",
  "import",
  "lead"
];
var LIST_PURPOSES = ["offers", "messages"];
var LIST_STANDINGS = ["needs_you", "waiting_on_you"];
var LIST_ASSIGNED = ["me", "teammate", "nobody"];
var LIST_DEAL_STAGES = ["consultation", "proposed", "won", "lost", "ended"];
var LIST_RULE_MAX = 12;
var LIST_ANY_MAX = 6;
var DAY_OPS = ["more_than", "within", "never", "ever", "this_week"];
var Days = { op: z.enum(DAY_OPS), days: z.optional(z.int().check(z.minimum(1), z.maximum(3650))) };
var YesNo = { op: z.literal("is"), yes: z.boolean() };
var Count = { op: z.enum(["at_least", "at_most"]), n: z.int().check(z.minimum(0), z.maximum(1e4)) };
var IsOrNot = z.enum(["is", "is_not"]);
var Token = z.string().check(z.regex(/^(seg:[a-z_]{1,40}|list:[0-9a-f-]{36})$/i));
var fact = (shape) => z.strictObject(shape);
var ListFactSchema = z.discriminatedUnion("field", [
  fact({ field: z.literal("last_visit"), ...Days }),
  fact({ field: z.literal("next_visit"), ...Days }),
  fact({ field: z.literal("missed_visit"), ...Days }),
  fact({ field: z.literal("booked"), ...YesNo }),
  fact({ field: z.literal("asked_not_booked"), ...YesNo }),
  fact({ field: z.literal("last_heard"), ...Days }),
  fact({ field: z.literal("first_contact"), ...Days }),
  fact({ field: z.literal("channel"), op: IsOrNot, channel: z.enum(CHANNELS) }),
  fact({ field: z.literal("came_from"), op: IsOrNot, from: z.enum(CAME_FROM) }),
  fact({ field: z.literal("calls"), ...Count }),
  fact({ field: z.literal("conversations"), ...Count }),
  fact({ field: z.literal("has_chat"), ...YesNo }),
  fact({ field: z.literal("said_yes"), ...YesNo, to: z.enum(LIST_PURPOSES) }),
  fact({ field: z.literal("can_receive"), ...YesNo, to: z.enum(LIST_PURPOSES) }),
  fact({ field: z.literal("stopped"), ...YesNo }),
  fact({ field: z.literal("standing"), op: IsOrNot, value: z.enum(LIST_STANDINGS) }),
  fact({ field: z.literal("assigned"), op: IsOrNot, value: z.enum(LIST_ASSIGNED) }),
  fact({ field: z.literal("deal_stage"), op: IsOrNot, value: z.enum(LIST_DEAL_STAGES) }),
  fact({ field: z.literal("consultation"), ...YesNo }),
  fact({ field: z.literal("step_due"), ...YesNo }),
  fact({ field: z.literal("in_list"), op: IsOrNot, list: Token })
]);
var AnySchema = z.strictObject({ any: z.array(ListFactSchema).check(z.minLength(2), z.maxLength(LIST_ANY_MAX)) });
var ListConditionSchema = z.union([AnySchema, ListFactSchema]);
var isDayFact = (f) => f.field === "last_visit" || f.field === "next_visit" || f.field === "missed_visit" || f.field === "last_heard" || f.field === "first_contact";
function factProblem(f) {
  if (!isDayFact(f)) return null;
  if ((f.op === "more_than" || f.op === "within") && f.days === void 0) return `${f.field} ${f.op} needs days`;
  if (f.op === "this_week" && f.field !== "next_visit") return "only the next one on the calendar can be this week";
  return null;
}
var ListRuleSchema = z.strictObject({
  v: z.optional(z.literal(2)),
  all: z.array(ListConditionSchema).check(z.minLength(1), z.maxLength(LIST_RULE_MAX))
}).check(
  z.superRefine((r2, ctx) => {
    for (const f of r2.all.flatMap((c) => "any" in c ? c.any : [c])) {
      const p = factProblem(f);
      if (p) ctx.addIssue({ code: "custom", message: p });
    }
  })
);
function ruleFacts(rule) {
  return rule.all.flatMap((c) => "any" in c ? c.any : [c]);
}
function factNeeds(f) {
  const needs = new Set(fieldOf(f.field).needs);
  if (f.field === "standing" && f.value === "waiting_on_you") needs.add("viewer");
  if (f.field === "assigned" && f.value !== "nobody") needs.add("viewer");
  if (f.field === "deal_stage" && f.value === "consultation") {
    needs.add("calendar");
    needs.add("consult");
  }
  return LIST_NEEDS.filter((n) => needs.has(n));
}
function ruleNeeds(rule) {
  const needs = new Set(ruleFacts(rule).flatMap(factNeeds));
  return LIST_NEEDS.filter((n) => needs.has(n));
}
function dayHolds(days, op, n) {
  switch (op) {
    case "never":
      return days === null;
    case "ever":
      return days !== null;
    case "within":
      return days !== null && days <= (n ?? 0);
    case "more_than":
      return days !== null && days > (n ?? 0);
    case "this_week":
      return false;
  }
}
function holds(f, v, inList) {
  const is = "op" in f && f.op === "is";
  switch (f.field) {
    case "last_visit":
      return dayHolds(v.lastVisitDays, f.op, f.days);
    case "next_visit":
      return f.op === "this_week" ? v.nextVisitThisWeek : dayHolds(v.nextVisitDays, f.op, f.days);
    case "missed_visit":
      return dayHolds(v.missedVisitDays, f.op, f.days);
    case "last_heard":
      return dayHolds(v.heardDays, f.op, f.days);
    case "first_contact":
      return f.op === "within" && !v.firstContact.evidence ? false : dayHolds(v.firstDays, f.op, f.days);
    case "booked":
      return v.booked === f.yes;
    case "asked_not_booked":
      return v.askedNotBooked === f.yes;
    case "has_chat":
      return v.hasChat === f.yes;
    case "stopped":
      return v.stopped === f.yes;
    case "consultation":
      return v.consultationVisit === f.yes;
    case "step_due":
      return v.stepDue === f.yes;
    case "said_yes":
      return v.saidYes[f.to] === f.yes;
    case "can_receive":
      return v.canReceive[f.to] === f.yes;
    case "channel":
      return v.channels.includes(f.channel) === is;
    case "came_from":
      return v.cameFrom?.key === f.from === is;
    case "calls":
      return f.op === "at_least" ? v.calls >= f.n : v.calls <= f.n;
    case "conversations":
      return f.op === "at_least" ? v.threads >= f.n : v.threads <= f.n;
    case "standing":
      return v.standing === f.value === is;
    case "assigned":
      return v.assigned === f.value === is;
    case "deal_stage":
      return v.dealStages.includes(f.value) === is;
    case "in_list":
      return inList(f.list, v.id) === is;
  }
}
var noLists = () => false;
function listRuleMatches(rule, v, inList = noLists) {
  return rule.all.every((c) => "any" in c ? c.any.some((f) => holds(f, v, inList)) : holds(c, v, inList));
}
var STANDING_WORDS = {
  needs_you: NEEDS_YOU_WORD,
  waiting_on_you: HELD_WORDS.yours.pill
};
var LEAF_PROPERTIES = {
  field: { type: "string", enum: FIELD_IDS.filter((id) => id !== "in_list") },
  op: { type: "string", enum: [...DAY_OPS, "at_least", "at_most", "is", "is_not"] },
  days: { type: "integer" },
  n: { type: "integer" },
  yes: { type: "boolean" },
  channel: { type: "string", enum: [...CHANNELS] },
  from: { type: "string", enum: [...CAME_FROM] },
  to: { type: "string", enum: [...LIST_PURPOSES] },
  value: { type: "string", enum: [.../* @__PURE__ */ new Set([...LIST_STANDINGS, ...LIST_ASSIGNED, ...LIST_DEAL_STAGES])] }
};
var LIST_DRAFT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["name", "all", "cannot"],
  properties: {
    name: { type: "string" },
    cannot: { type: "string" },
    all: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          ...LEAF_PROPERTIES,
          any: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["field", "op"],
              properties: LEAF_PROPERTIES
            }
          }
        }
      }
    }
  }
};

// src/people/lists/lists.ts
function listToken(ref) {
  return ref.kind === "builtin" ? `seg:${ref.id}` : `list:${ref.id}`;
}
var r = (...all) => ({ v: 2, all });
var BUILTIN_LISTS = [
  {
    id: "needs_you",
    label: NEEDS_YOU_WORD,
    tip: "An open escalation, or a thread waiting for a person",
    group: "attention",
    onProfile: false,
    rule: r({ field: "standing", op: "is", value: "needs_you" })
  },
  // Yours by the one standing rule (standing.ts): you took it over, or your reply paused the receptionist.
  {
    id: "waiting_on_you",
    label: HELD_WORDS.yours.pill,
    tip: "Threads you have: you took them over, or your reply paused the receptionist. A teammate's waits on them",
    group: "attention",
    onProfile: false,
    rule: r({ field: "standing", op: "is", value: "waiting_on_you" })
  },
  // Their next step's day has come (0007, amended): every workspace, deals or not. The page says the step itself.
  {
    id: "steps_due",
    label: "Steps due",
    tip: "Their next step's day has come, or gone by \u2014 a note with a day, for the team",
    group: "attention",
    onProfile: false,
    rule: r({ field: "step_due", op: "is", yes: true })
  },
  // New by the date they first got in touch, whatever their standing: someone new who needs you is both.
  {
    id: "new_week",
    label: "New this week",
    tip: "First contact in the last 7 days, by evidence \u2014 imported history never counts",
    group: "journey",
    rule: r({ field: "first_contact", op: "within", days: 7 })
  },
  // This week, Monday to Sunday, by the workspace's clock.
  {
    id: "booked_week",
    label: "Booked this week",
    tip: "Booked this week, Monday to Sunday",
    group: "journey",
    rule: r({ field: "next_visit", op: "this_week" })
  },
  {
    id: "booked",
    label: "Booked",
    tip: "Something ahead on your calendar \u2014 the booking is the conversion",
    group: "journey",
    rule: r({ field: "booked", op: "is", yes: true })
  },
  // Reports' rule (calendar-people.ts visitAnswersAsk): asked in 30 days and nothing on the calendar answers it.
  {
    id: "asked_never_booked",
    label: "Asked, never booked",
    tip: "Wrote or called in the last 30 days, and nothing on your calendar since answers it \u2014 the people you can still win",
    group: "journey",
    rule: r({ field: "asked_not_booked", op: "is", yes: true })
  },
  // Forty-five days since the chair, nothing ahead: the win-back list, from visits rather than silence.
  {
    id: "lapsed",
    label: "Lapsed",
    tip: "Forty-five days or more since they were last on the calendar, nothing ahead \u2014 the win-back list, from the calendar rather than silence",
    group: "journey",
    rule: r({ field: "booked", op: "is", yes: false }, { field: "last_visit", op: "more_than", days: 44 })
  },
  // The journey past the booking (0004), as the Pipeline groups it (deals.ts dealStageOf).
  {
    id: "consultation_booked",
    label: "Consultations",
    tip: "A consultation coming up, or one this past week with no proposal since \u2014 the Pipeline's Consultations",
    group: "journey",
    onProfile: false,
    rule: r({ field: "deal_stage", op: "is", value: "consultation" })
  },
  {
    id: "proposal_out",
    // A stage's list says its stage's word (S9-9); Clients names the people, not the stage.
    label: DEAL_STAGE_WORDS.proposed,
    tip: "A proposal went out and is waiting on their answer",
    group: "journey",
    onProfile: false,
    rule: r({ field: "deal_stage", op: "is", value: "proposed" })
  },
  {
    id: "clients",
    label: "Clients",
    tip: "Said yes, or paid \u2014 the engagement is running",
    group: "journey",
    onProfile: false,
    rule: r({ field: "deal_stage", op: "is", value: "won" })
  },
  {
    id: "deal_passed",
    label: DEAL_STAGE_WORDS.lost,
    tip: "They passed on a proposal",
    group: "journey",
    onProfile: false,
    rule: r({ field: "deal_stage", op: "is", value: "lost" })
  },
  {
    id: "deal_ended",
    label: DEAL_STAGE_WORDS.ended,
    tip: "An engagement that ended \u2014 the win-back list for clients",
    group: "journey",
    onProfile: false,
    rule: r({ field: "deal_stage", op: "is", value: "ended" })
  },
  // Heard from them, then nothing for thirty days: someone we never heard from is not quiet, and our own sends are
  // not their word.
  {
    id: "quiet",
    label: "Quiet 30+ days",
    tip: "They haven't written or called in 30 days \u2014 your own messages don't count, and someone never heard from isn't quiet",
    group: "reach",
    rule: r({ field: "last_heard", op: "more_than", days: 30 })
  },
  {
    id: "phoned_only",
    label: "Phoned only",
    tip: "Only ever phoned \u2014 no WhatsApp thread",
    group: "reach",
    rule: r({ field: "has_chat", op: "is", yes: false }, { field: "calls", op: "at_least", n: 1 })
  },
  // TWO LISTS, BECAUSE THERE ARE TWO ANSWERS. This one is the yes to hearing from the business, which says nothing
  // about offers; the next is the promotional audience, who a marketing broadcast may reach: the yes AND a number.
  {
    id: "opted_in",
    label: "Said yes to messages",
    tip: "Said yes to messages \u2014 replies, reminders and confirmations",
    group: "reach",
    onProfile: false,
    rule: r({ field: "said_yes", op: "is", to: "messages", yes: true })
  },
  {
    id: "offers_ok",
    label: "Can receive offers",
    tip: "Said yes to OFFERS, separately, with a number to send to \u2014 the only people a promotional broadcast may reach",
    group: "reach",
    onProfile: false,
    rule: r({ field: "can_receive", op: "is", to: "offers", yes: true })
  },
  // A fact, not the state: someone who opted out AND needs you is in both lists.
  {
    id: "opted_out",
    label: STOP_WORDS.pill,
    tip: "Asked to stop; the receptionist stays silent, offers included",
    group: "reach",
    onProfile: false,
    rule: r({ field: "stopped", op: "is", yes: true })
  }
];
var PEOPLE_LISTS = BUILTIN_LISTS.map((l) => {
  const needs = ruleNeeds(l.rule);
  return {
    ...l,
    ...needs.includes("calendar") ? { needsCalendar: true } : {},
    ...needs.includes("consult") ? { needsConsultFirst: true } : {},
    ...needs.includes("deals") ? { needsDeals: true } : {},
    ...needs.includes("viewer") ? { needsViewer: true } : {},
    test: (vm) => listRuleMatches(l.rule, vm)
  };
});

// src/ask-proposals/lists.ts
var LIST_PART = 500;
var namesIn = (d, k) => Array.isArray(d[k]) ? d[k].map(asText).filter(Boolean) : [];
function listTakenDown(data) {
  const d = rec(data);
  if (d.archived !== true) return "Deleted. The people stay.";
  const paused = namesIn(d, "paused");
  const readBy = namesIn(d, "read_by");
  const why = paused.length ? `${paused.join(", ")} paused` : readBy.length ? `${readBy.join(", ")} reads it` : "a campaign runs on it";
  return `Archived, not deleted: ${why}. It comes back from Archived under your lists.`;
}
var idsIn = (v) => Array.isArray(v) ? v.map(asText).filter(Boolean) : [];
var byHand = (pl) => pl.kept === "hand";
function startsWith(pl) {
  const names = Array.isArray(pl.names) ? pl.names.map(asText).filter(Boolean) : [];
  const n = idsIn(pl.ids).length;
  if (names.length !== n || n === 0 || n > 3) return `${n} ${n === 1 ? "person" : "people"}`;
  const [last, ...before] = [...names].reverse();
  return before.length ? `${before.reverse().join(", ")} and ${last ?? ""}` : last ?? "";
}
var listSpec = {
  needs: "operator",
  gate: "approve",
  // The route's body: the name and the rule the builder checked (cleanListRule), a list that keeps itself current; or,
  // kept by hand, the name alone, as People's New list makes one, and the people the card names put on it after. A card
  // that is neither is none.
  commit: ({ payload: pl }) => !asText(pl.name) || !byHand(pl) && (!pl.rule || typeof pl.rule !== "object") ? refuseWith(PROPOSAL_WORDS.cannotApprove) : {
    route: "POST segments",
    body: byHand(pl) ? { name: asText(pl.name) } : { name: asText(pl.name), rule: pl.rule }
  },
  // The people a list kept by hand starts with, put on the list the route made (its id in the answer), as the person
  // page's picker puts one on: the list stands either way, and the receipt says how this went.
  then: ({ payload: pl }, data) => {
    const ids = idsIn(pl.ids);
    if (!byHand(pl) || !ids.length) return null;
    const id = idIn(rec(data), "id");
    if (!id) return refuseWith("the list came back without its id; put them on it from People");
    return {
      route: "PUT segments/[id]",
      params: { id },
      body: { add: ids.slice(0, LIST_PART) },
      events: [PEOPLE_CHANGED]
    };
  },
  // People's words for a list made by its rule, named as the route stored it; one kept by hand says who it starts with.
  receipt: ({ payload: pl }, data, then) => {
    const name = asText(rec(data).name ?? pl.name);
    if (!byHand(pl)) return `${name} made. It keeps itself current.`;
    if (!then) return `${name} made. Put people on it from their page or People.`;
    return then.ok ? `${name} made, with ${startsWith(pl)} on it.` : `${name} made, with nobody on it yet: ${then.message}`;
  },
  // The list it made, for a later step of Ask's plan that names it by its token (`@step:n`).
  made: (_p, data) => idIn(rec(data), "id"),
  undo: {
    label: () => "Delete it",
    window: "ten_minutes",
    // The list the route made, by the id it answered; the route answers no ledger row, so the undo names none.
    record: (_p, data) => {
      const id = idIn(rec(data), "id");
      return id ? { list_id: id } : null;
    },
    call: (u) => ({ route: "DELETE segments/[id]", params: { id: asText(u.list_id) } }),
    // Deleted, or archived where something came to depend on it since (a playbook on it, a list that reads it): the
    // route's answer says which, in People's words.
    receipt: (data) => listTakenDown(data)
  },
  // People, at the list the route made once it is approved (the commit kept its id for the undo); People before.
  open: (_card, outcome) => {
    const id = idIn(rec(outcome?.undo), "list_id");
    return id ? `clients/${listToken({ kind: "saved", id })}` : "clients";
  }
};
var changeOf = (pl) => ({
  ...asText(pl.name) ? { name: asText(pl.name) } : {},
  ...pl.rule && typeof pl.rule === "object" ? { rule: pl.rule } : {}
});
var listChangeSpec = {
  needs: "operator",
  gate: "approve",
  commit: ({ payload: pl }) => {
    const body = changeOf(pl);
    return !asText(pl.list_id) || Object.keys(body).length === 0 ? refuseWith(PROPOSAL_WORDS.cannotApprove) : { route: "PUT segments/[id]", params: { id: asText(pl.list_id) }, body, events: [PEOPLE_CHANGED] };
  },
  receipt: ({ payload: pl }) => {
    const name = asText(pl.name) || asText(pl.was_name);
    return pl.rule ? `${name} now keeps who its new rule names` : `Renamed ${name}`;
  },
  undo: {
    label: () => "Put it back",
    window: "ten_minutes",
    record: ({ payload: pl }) => {
      const was = rec(pl.was);
      const back = {
        ...asText(pl.name) && typeof was.name === "string" ? { name: was.name } : {},
        ...pl.rule && was.rule && typeof was.rule === "object" ? { rule: was.rule } : {}
      };
      return Object.keys(back).length ? { list_id: pl.list_id, ...back } : null;
    },
    call: (u) => ({
      route: "PUT segments/[id]",
      params: { id: asText(u.list_id) },
      body: changeOf(u),
      events: [PEOPLE_CHANGED]
    }),
    receipt: () => "The list is as it was"
  },
  open: ({ payload: pl }) => asText(pl.list_id) ? `clients/${listToken({ kind: "saved", id: asText(pl.list_id) })}` : "clients"
};
var listDeleteSpec = {
  needs: "operator",
  gate: "approve",
  commit: ({ payload: pl }) => asText(pl.list_id) ? { route: "DELETE segments/[id]", params: { id: asText(pl.list_id) }, events: [PEOPLE_CHANGED] } : refuseWith(PROPOSAL_WORDS.cannotApprove),
  receipt: (_p, data) => listTakenDown(data),
  open: () => "clients"
};

// src/ask-proposals/people-verbs.ts
var fieldsOf = (pl, keys) => Object.fromEntries(keys.filter((k) => pl[k] !== void 0).map((k) => [k, pl[k]]));
var personRoute = ({ payload }) => {
  const id = idIn(payload, "contact_id");
  return id ? `clients/${id}` : null;
};
var threadMade = (data) => idIn(rec(data), "conversation_id");
var personMessageSpec = {
  needs: "operator",
  gate: "approve",
  commit: (p) => {
    const pl = p.payload;
    if (!idIn(pl, "contact_id") || !asText(pl.wire)) return refuseWith(PROPOSAL_WORDS.cannotApprove);
    return {
      route: "POST people/[id]/message",
      params: { id: asText(pl.contact_id) },
      body: fieldsOf(pl, ["wire", "text", "subject", "template", "email_to", "then", "note"]),
      idempotencyKey: p.id,
      events: [PEOPLE_CHANGED]
    };
  },
  receipt: ({ payload: pl }) => `On its way to ${asText(pl.who)} \u2014 sends in 15 seconds unless you cancel`,
  undo: {
    label: () => "Sends 15 seconds after you approve; cancel within them",
    window: "cancelable",
    record: (_p, data) => ({
      message_id: rec(data).message_id,
      cancelable_until: rec(data).cancelable_until,
      decision_id: decisionOf(data)
    }),
    call: (u) => ({ route: "POST messages/[id]/cancel-send", params: { id: asText(u.message_id) } }),
    receipt: () => "Canceled before it sent"
  },
  made: (_p, data) => threadMade(data),
  open: (p, outcome) => outcome?.made?.id ? `inbox/th-${outcome.made.id}` : personRoute(p)
};

// src/ask-proposals/person.ts
var cardPersonRoute = ({ payload }) => {
  const id = idIn(payload, "contact_id");
  return id ? `clients/${id}` : null;
};
var DETAIL_FIELDS = ["name", "email"];
var PERSON_DETAIL_WORDS = {
  label: { name: "Name", email: "Email" },
  none: {
    name: (shows) => shows ? `no name of their own (shows as ${shows})` : "no name of their own",
    email: () => "no address"
  }
};
function detailsCall(contactId, from, none) {
  const body = Object.fromEntries(DETAIL_FIELDS.filter((k) => typeof from[k] === "string").map((k) => [k, from[k]]));
  if (!Object.keys(body).length) return refuseWith(none);
  return { route: "PUT contacts/[id]/details", params: { id: asText(contactId) }, body, events: [PEOPLE_CHANGED] };
}
var personDetailsSpec = {
  needs: "operator",
  gate: "approve",
  // Only the fields the card changes; its `previous` is what the builder read, for the undo.
  commit: ({ payload: pl }) => detailsCall(pl.contact_id, pl, PROPOSAL_WORDS.cannotApprove),
  // Each field as the route stored it (an address in its one spelling), the card's where it answered none.
  receipt: ({ payload: pl }, data) => [
    asText(pl.who),
    ...DETAIL_FIELDS.filter((k) => typeof pl[k] === "string").map(
      (k) => `${PERSON_DETAIL_WORDS.label[k]}: ${asText(rec(data)[k] ?? pl[k])}`
    )
  ].join(" \xB7 "),
  undo: {
    label: () => "Set it back",
    window: "ten_minutes",
    // Each changed field as the route found it when it wrote (its answer's `was`), the card's own reading where an
    // older route answers none: the route clears a field with an empty string, so one that held nothing is set back to
    // nothing. One whose previous value neither carries is never cleared on a guess.
    record: ({ payload: pl }, data) => {
      const changed = DETAIL_FIELDS.filter((k) => typeof pl[k] === "string");
      const found = rec(rec(data).was);
      const prev = changed.length > 0 && changed.every((k) => k in found) ? found : rec(pl.previous);
      if (!changed.length || changed.some((k) => !(k in prev))) return null;
      return { contact_id: pl.contact_id, ...Object.fromEntries(changed.map((k) => [k, asText(prev[k])])) };
    },
    call: (u) => detailsCall(u.contact_id, u, PROPOSAL_WORDS.noUndo),
    receipt: () => "Set back"
  },
  open: cardPersonRoute
};

// src/ask-proposals/reviews.ts
var reviewReplySpec = {
  needs: "operator",
  gate: "approve",
  commit: ({ payload: pl }) => idIn(pl, "review_id") && asText(pl.comment).trim() ? {
    route: "POST google/reviews/[id]/reply",
    params: { id: asText(pl.review_id) },
    body: { comment: asText(pl.comment).trim() }
  } : refuseWith(PROPOSAL_WORDS.cannotApprove),
  receipt: ({ payload: pl }) => `Replied to ${asText(pl.who) || "the review"} on Google`,
  open: () => "reports/reviews"
};

// src/config/workspace-config/fallbacks.ts
var FALLBACK_DEFAULTS = {
  greeting: "Hi! Thanks for reaching out to {business}.\n\nBook anytime: {booking link}\n\nReply here with any question.",
  error: "Thanks for reaching out to {business}! A member of our team will reply here soon. Book anytime: {booking link}",
  non_text: "Thanks for your message! A member of our team will take a look and reply here soon. For anything urgent, call us at {phone}."
};

// src/config/workspace-config/brain-config.ts
function newReceptionistDefaults(businessName) {
  return {
    system_prompt: baselinePrompt(businessName),
    // What a customer reads when the model cannot be reached: the product's
    // wording, naming the business's details rather than copying them, so they
    // are filled as each message goes out and follow the details from then on
    // (fallbackMessages, S5). Copied, a workspace set up before its line existed
    // told customers "call us at .", and a new booking link never reached them.
    fallbacks: { ...FALLBACK_DEFAULTS }
  };
}
var BASELINE_OPENING = "You are the assistant for ";
var BASELINE_CLOSING = ", answering inbound customer messages. You are warm, concise and professional \u2014 a great front-desk person, in text form. If you do not know something, say so plainly and offer to have a person follow up.";
function baselinePrompt(businessName) {
  return `${BASELINE_OPENING}${businessName}${BASELINE_CLOSING}`;
}
function isBaselinePrompt(text) {
  return text.startsWith(BASELINE_OPENING) && text.endsWith(BASELINE_CLOSING);
}

// src/config/workspace-config/resolve.ts
function instructionsDraft(brain) {
  const whose = whoseWords(brain);
  if (whose.kind === "own") return { text: whose.text, carried: false };
  return whose.kind === "carried" || whose.kind === "prompt" ? { text: whose.text, carried: true } : { text: "", carried: false };
}
function hasProfile(p) {
  if (!p) return false;
  const statedHours = !!p.hours && Object.values(p.hours).some((h) => h?.open && h?.close || h?.intervals?.length);
  return !!(p.address || p.tone || p.extra_instructions || statedHours || p.services?.length || p.languages?.length || p.escalate_when?.length || p.website || p.notes?.length);
}
function ownWordsOf(brain) {
  const own = brain?.profile?.extra_instructions;
  return own?.trim() ? own : brain?.system_prompt ?? null;
}
function whoseWords(brain) {
  const text = ownWordsOf(brain);
  if (!text?.trim()) return { kind: "none", text: null };
  if (brain?.profile?.extra_instructions?.trim())
    return { kind: isBaselineInOwnersField(text) ? "baseline" : "own", text };
  if (isBaselinePrompt(text.trim())) return { kind: "baseline", text };
  return { kind: hasProfile(brain?.profile) ? "carried" : "prompt", text };
}
function isBaselineInOwnersField(text) {
  const t = text.trim();
  if (!isBaselinePrompt(t)) return false;
  const name = t.slice(BASELINE_OPENING.length, t.length - BASELINE_CLOSING.length);
  return name.trim().length > 0 && name.length <= 120 && !/[\r\n]/.test(name) && !/[.!?]\s/.test(name);
}

// src/ask/ask-settings-change.ts
var ASK_ANSWERS_ROWS = {
  set_tone: "tone",
  set_languages: "languages",
  set_phone_greeting: "phone_greeting",
  set_phone_voice: "phone_voice",
  set_transfer_number: "handoff_number",
  add_own_words: "extra_instructions",
  set_message: "fallbacks",
  set_photos: null
};
var languagesOf = (list) => [
  ...new Set(list.map((l) => l.trim()).filter((l) => l !== ""))
];
function applySettingsChange(config, change) {
  if (change.op === "set_photos")
    return {
      ...config,
      features: { ...config.features ?? {}, vision: change.on }
    };
  if (isAnswersBrainChange(change)) return applyAnswersChange(config, change);
  if (change.op === "set_goal") {
    const ask = { ...config.ask ?? {} };
    const goal = change.goal.trim();
    if (goal) ask.goal = goal;
    else delete ask.goal;
    return { ...config, ask };
  }
  const brain = { ...config.brain ?? {} };
  const profile = { ...brain.profile ?? {} };
  switch (change.op) {
    case "add_closure": {
      const closures = [...profile.closures ?? []];
      closures.push({
        date: change.date,
        ...change.until ? { until: change.until } : {},
        ...change.note ? { note: change.note } : {}
      });
      profile.closures = closures;
      break;
    }
    case "set_hours": {
      const hours = { ...profile.hours ?? {} };
      hours[change.day] = change.open && change.close ? { open: change.open, close: change.close } : { open: null, close: null };
      profile.hours = hours;
      break;
    }
    case "add_note": {
      const notes = [...profile.notes ?? []];
      notes.push({ title: change.title, text: change.text, ...change.until ? { until: change.until } : {} });
      profile.notes = notes;
      break;
    }
    case "add_service": {
      const services = [...profile.services ?? []];
      services.push({ name: change.name, ...change.duration_min ? { duration_min: change.duration_min } : {} });
      profile.services = services;
      break;
    }
  }
  brain.profile = profile;
  return { ...config, brain };
}
var BRAIN_OPS = /* @__PURE__ */ new Set([
  "set_tone",
  "set_languages",
  "set_phone_greeting",
  "set_phone_voice",
  "set_transfer_number",
  "add_own_words",
  "set_message"
]);
var isAnswersBrainChange = (change) => BRAIN_OPS.has(change.op);
var putKey = (profile, key, value) => {
  if (value === void 0) delete profile[key];
  else profile[key] = value;
};
function applyAnswersChange(config, change) {
  const brain = { ...config.brain ?? {} };
  const profile = { ...brain.profile ?? {} };
  switch (change.op) {
    case "set_tone":
      putKey(profile, "tone", change.tone.trim() || void 0);
      break;
    case "set_languages": {
      const list = languagesOf(change.languages);
      putKey(profile, "languages", list.length ? list : void 0);
      break;
    }
    // Emptied, the standard greeting. The standard line typed out is made empty by the tool that proposes it (act/settings.ts),
    // as the row's own save stores it: the check reads the greeting's disclosure rules, which stay out of the tab's bundle.
    case "set_phone_greeting":
      putKey(profile, "phone_greeting", change.greeting.trim() || void 0);
      break;
    case "set_phone_voice":
      putKey(profile, "phone_voice", change.voice);
      break;
    case "set_transfer_number":
      putKey(profile, "handoff_number", handoffE164(change.number) ?? void 0);
      break;
    case "add_own_words": {
      const now = instructionsDraft({ ...brain, profile }).text.trim();
      putKey(profile, "extra_instructions", [now, change.text.trim()].filter(Boolean).join("\n\n"));
      brain.system_prompt = newReceptionistDefaults(brain.business_name || "").system_prompt;
      break;
    }
    case "set_message":
      brain.fallbacks = {
        ...FALLBACK_DEFAULTS,
        ...brain.fallbacks ?? {},
        [change.which]: change.text.trim() || FALLBACK_DEFAULTS[change.which]
      };
      break;
  }
  brain.profile = profile;
  return { ...config, brain };
}

// src/ask-proposals/workspace.ts
var policyBody = (cls, mode, confidence) => {
  const body = { class: cls };
  if (mode) body.mode = mode;
  if (typeof confidence === "number") body.minConfidence = confidence;
  return body;
};
var policySpec = {
  needs: "operator",
  gate: "autonomy",
  commit: (p) => ({
    route: "PUT policies",
    body: policyBody(p.payload.class, p.payload.mode, p.payload.min_confidence)
  }),
  receipt: (p) => `Autonomy changed: ${p.summary}`,
  undo: {
    label: () => "Set it back",
    window: "ten_minutes",
    // The events ledger keeps policy changes and hands back no row id, so this undo names none.
    // The row as the route found it when it wrote (its answer's `was`), the card's own reading where an older route
    // answers none.
    record: (p, data) => {
      const found = rec(data).was;
      const prev = found && typeof found === "object" ? found : p.payload.previous ?? {};
      return { class: p.payload.class, mode: prev.mode ?? null, min_confidence: prev.min_confidence ?? null };
    },
    call: (u) => !u.mode && typeof u.min_confidence !== "number" ? refuseWith("The previous setting is unknown; change it in Settings.") : { route: "PUT policies", body: policyBody(u.class, u.mode, u.min_confidence) },
    receipt: () => "Set back"
  },
  open: () => "admin/autonomy"
};
var settingsSpec = {
  needs: "partner",
  doing: "change the workspace's settings",
  gate: "settings",
  commit: (p, tab) => {
    const st = tab.settings;
    if (!st || !st.config || typeof st.version !== "number")
      return refuseWith("Settings are not loaded yet \u2014 open Settings once and try again.");
    const config = applySettingsChange(
      st.config,
      p.payload.change
    );
    return { route: "PUT settings", body: { config, version: st.version } };
  },
  receipt: (p) => p.summary,
  undo: {
    label: () => "Put the previous settings back",
    window: "version",
    // The whole config as it was before, and the version this save wrote: restoring it is safe only while that is
    // still the version loaded.
    record: (_p, data, tab) => ({ config: tab.settings?.config, version_after: rec(data).version }),
    call: (u, tab) => {
      const version = tab.settings?.version;
      if (typeof version !== "number") return refuseWith("Settings are not loaded yet.");
      if (typeof u.version_after !== "number" || version !== u.version_after)
        return refuseWith("Settings have changed since this card \u2014 change them in Settings.");
      return { route: "PUT settings", body: { config: u.config, version } };
    },
    receipt: () => "Previous settings are back"
  },
  // A change to How it answers opens there, on its row (the Settings wiring review, item 14); the rest on Details.
  open: (p) => {
    const op = p.payload.change?.op;
    if (!op || !(op in ASK_ANSWERS_ROWS)) return "admin/workspace";
    const row = ASK_ANSWERS_ROWS[op];
    return row ? `admin/receptionist/${row}` : "admin/receptionist";
  }
};
var inviteSpec = {
  needs: "owner",
  doing: "invite someone to the team",
  gate: "team",
  commit: (p) => ({ route: "POST team/invite", body: { email: asText(p.payload.email), role: p.payload.role } }),
  receipt: (p) => `Invited ${asText(p.payload.email)} as ${asText(p.payload.role)}`,
  open: () => null
};

// src/ask-proposals/ask-only.ts
var ASK_ONLY_SPECS = {
  // The Inbox's and Live's.
  reply: replySpec,
  steer: steerSpec,
  thread_verb: threadVerbSpec,
  whisper: whisperSpec,
  call_hand_over: callHandOverSpec,
  // Settings'.
  policy: policySpec,
  settings: settingsSpec,
  invite: inviteSpec,
  // Campaigns'.
  broadcast: broadcastSpec,
  playbook: playbookSpec,
  playbook_channels: playbookChannelsSpec,
  message: messageSpec,
  // People's and its lists'.
  person_details: personDetailsSpec,
  person_message: personMessageSpec,
  list: listSpec,
  list_change: listChangeSpec,
  list_delete: listDeleteSpec,
  // Leads' and Reach out's.
  lead_search: leadSearchSpec,
  people_search: peopleSearchSpec,
  reach_out_add: reachOutAddSpec,
  lead_stage: leadStageSpec,
  lead_mark: leadMarkSpec,
  lead_later: leadLaterSpec,
  leads_bulk: leadsBulkSpec,
  leads_check: leadsCheckSpec,
  lead_addressee: leadAddresseeSpec,
  lead_list: leadListSpec,
  lead_search_more: leadSearchMoreSpec,
  reach_out_make: reachOutMakeSpec,
  reach_out_said: reachOutSaidSpec,
  // A review's, and Ask's own follow-up.
  review_reply: reviewReplySpec,
  follow_up: followUpSpec
};
export {
  ASK_ONLY_SPECS
};
