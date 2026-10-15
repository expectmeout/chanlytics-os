import { fenced, parseLeadsRoute, type AskScope, type AskSurface } from "@chanlytics/contracts";
import type { SearchResultBlock } from "./context";
import { calledName, type ToolRun } from "./tools";

/**
 * Reads made before the model is asked, for what the question names on ANOTHER page (the Phase 2 plan, D12, D13).
 *
 * The page a person is on reaches the model as its context (context.ts); a question about what that page shows is
 * answered from it. A question that names another page's rows plainly -- the week's report from the Inbox, tomorrow's
 * calendar from Reports, the calls from People -- would take a round to choose the tool and a second to answer; the
 * read runs beside the context instead and rides into the first round as data. A noun the page itself shows is not
 * read again. The table is deliberately narrow: a wrong read costs tokens and says nothing false, a missed one costs the
 * round it always cost, and the model may still call any tool.
 *
 * Widened 5 Oct 2026 from the turns production stored (ask_messages' shape, the week before): a second round cost
 * about three seconds, and the questions that paid it were asked in words the table did not hold -- how the business
 * stands, what is booked ("what do I have tomorrow"), who wrote, where the deals stand, and the day's calls asked of
 * Today, which counts them and lists none. Each is a row below; a read is 100 to 300 ms beside the page's own.
 * Who canceled joined the same evening: asked by voice, it took two more rounds and four searches, 14 s to a word.
 */
export const CROSS_PAGE_MAX = 2;

const DAY_WORDS: Array<[RegExp, string]> = [
  [/\b(tomorrow|mañana)\b/i, "tomorrow"],
  [/\b(today|hoy)\b/i, "today"],
  [/\b(mon|monday|lunes)\b/i, "mon"],
  [/\b(tue|tuesday|martes)\b/i, "tue"],
  [/\b(wed|wednesday|miércoles|miercoles)\b/i, "wed"],
  [/\b(thu|thursday|jueves)\b/i, "thu"],
  [/\b(fri|friday|viernes)\b/i, "fri"],
  [/\b(sat|saturday|sábado|sabado)\b/i, "sat"],
  [/\b(sun|sunday|domingo)\b/i, "sun"],
];

function dayOf(q: string, fallback: string): string {
  for (const [re, d] of DAY_WORDS) if (re.test(q)) return d;
  return fallback;
}

function daysOf(q: string): 7 | 30 | 90 {
  if (/\b(90|ninety|quarter|noventa|trimestre)\b/i.test(q)) return 90;
  if (/\b(30|thirty|month|treinta|mes)\b/i.test(q)) return 30;
  return 7;
}

/** The days a question about cancellations reads back: the day asked, the week before this one whole, or the period. */
function cancelDaysOf(q: string): number {
  if (/\b(today|hoy)\b/i.test(q)) return 1;
  if (/\b(yesterday|ayer)\b/i.test(q)) return 2;
  if (/\b(last|past|previous) week\b|\bsemana pasada\b/i.test(q)) return 14;
  return daysOf(q);
}

/** Every form a cancellation is written in, at once: the search is never stemmed, and `or` finds either side. */
const CANCEL_WORDS =
  "cancel or canceled or cancelled or canceling or cancelling or cancellation or reschedule or rescheduled or cancelar or cancelo or canceló or cancelada or cancelado or cancelación or reprogramar";

const REPORT =
  /\breports?\b|\binforme\b|\b(last|past|previous|these|últimos?|ultimos?)\s+(7|seven|30|thirty|90|ninety|siete|treinta|noventa)\s*(days|días|dias)\b|\bhow (did|was|were|are|is)\b.*\b(week|month|days|semana|mes)\b|\bcómo (fue|va|nos fue|estuvo)\b/i;
const OPENINGS =
  /\bopenings?\b|\bavailab|\bfree (slots?|times?|spots?)\b|\bslots?\b|\bhuecos?\b|\bdisponib|\bopen (on |this |next |el |este |próximo |proximo )?(mon|tue|wed|thu|fri|sat|sun|today|tomorrow|lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo|hoy|mañana)/i;
/** How things stand, asked in the open: Today's own read off Today, and the week's report. */
const OVERVIEW =
  /\bhow('?s| is| are| was)? (the |my |our )?(business|things|everything|we doing|it going)\b|\b(brief|update) me\b|\bcatch me up\b|\bwhat('?s| is) (new|going on|happening)\b|\bwhat did i miss\b|\bwhat should i do (next|now|today|first)\b|\bc[oó]mo (va|est[aá]) (el|mi|nuestro) negocio\b|\bc[oó]mo vamos\b|\bqu[eé] hay de nuevo\b|\bponme al d[ií]a\b/i;
const CALENDAR =
  /\bcalendar\b|\bcalendario\b|\bagenda\b|\bappointments?\b|\bcitas?\b|\bwhat'?s on\b|\bqué hay\b|\b(what|who) do (i|we) have\b|\bwho('?s| is) coming\b|\bupcoming\b|\bbookings?\b(?! (link|page|notes?))|\b(my|our|the|today'?s|tomorrow'?s) schedule\b|\bqu[eé] tengo\b|\breservas?\b/i;
/**
 * Who canceled or moved a booking. No record keeps a cancellation (the appointments record, decision 0002, is not
 * built) and the calendar holds only what is still booked, so what was said is searched instead of the calendar.
 */
const CANCELED = /\bcancel(s|ed|led|ing|ling|lations?)?\b|\breschedul|\bcancel[aeoó]|\breprogram/i;
/** Where the deals stand (the Pipeline's own read, which says so where deals are off). */
const PIPELINE = /\bpipeline\b|\bproposals?\b|\bdeals?\b|\bpropuestas?\b/i;
/** Who wrote: the Inbox's threads, newest first. */
const WROTE =
  /\bwho (wrote|texted|messaged|emailed|reached out)\b|\b(any|new|latest|recent|unread) (messages?|texts?|emails?)\b|\bqui[eé]n (escribi[oó]|mand[oó])\b|\bmensajes? nuevos?\b/i;
const PLAYBOOKS = /\bplaybooks?\b|\bwin-?back\b|\bsave our number\b|\bmonth'?s offer\b|\bstanding (rules?|offers?)\b/i;
const AUDIENCES =
  /\baudiences?\b|\bsaid yes\b|\bopted[- ]in\b|\boffers?\b|\bbroadcasts?\b|\bcampaigns?\b|\btemplates?\b|\bquiet (clients|customers|people)\b|\bdijeron que s[ií]\b|\bofertas?\b|\bplantillas?\b/i;
/**
 * Who a send can reach, asked on Campaigns: an audience, who said yes, a send to someone, a message's template. There a
 * campaign or an offer named is a row the page holds (ON_PAGE), and is no reason to read the lists.
 */
const REACH =
  /\baudiences?\b|\baudiencias?\b|\bsaid yes\b|\bopted[- ]in\b|\bsend\b.*\bto\b|\btemplates?\b|\bdijeron que s[ií]\b|\ba qui[eé]n (puedo|podemos) (enviar|mandar)\b|\bplantillas?\b/i;
const MISSED = /\bmissed calls?\b|\bllamadas? perdidas?\b/i;
const CALLS = /\btranscripts?\b|\brecordings?\b|\bcalls?\b|\bcalled\b|\bllam(ó|o|aron|ada|adas|ar)\b|\bgrabaci[oó]n\b/i;
/** Drafts held for approval (D12): the snapshot carried them on every page; now one read carries them off the Inbox. */
const HELD = /\bheld\b|\bdrafts?\b|\bwaiting (for|on) (my |your )?approval\b|\bborradores?\b|\bretenid[oa]s?\b/i;
/**
 * A setup, asked for (the moment spec, A4): what runs and the moments offered with their starters (sequences.moments),
 * and the lists and messages a campaign may go by (sequences.lists), read before round 1 on any page, Campaigns
 * included, so the first round can propose the cards. Only a request to set campaigns up: said at a sentence's start, or
 * after an opener (a please, a "hey", a "yes", a "can you", a "help me", a "let's", an "I'd love to"), in either language
 * or both at once. A question whether something is set up, or how ("is our mailbox set up?", "did you set up my
 * campaigns?", "how do I set up…?"), and Start's own setup are not one, and read what they always read. Starting one is
 * a setup only of something not yet named ("start a new campaign", "start my campaigns"): "start the follow-ups" runs
 * what is there.
 */
const SETUP_OPENERS = [
  "please|ok(?:ay)?|now|so|then|just|go ahead and|hey|hi|hello|yes|yeah|sure",
  "(?:can|could|would) you|help (?:me|us)|let[’']?s|let us",
  "i (?:want|need)(?: you)? to|i(?:[’']d| would) (?:like|love)(?: you)? to|i wanna",
  "por favor|ahora|oye|hola|s[ií]|vale|puedes|podr[ií]as|ay[uú]da(?:me|nos) a|quiero|me gustar[ií]a",
].join("|");
/** What a setup is of, in either language: a campaign (with the tilde or without), a playbook, a nudge, a reminder. */
const SETUP_NOUN = String.raw`(?:campaigns?|campa[ñn]as?|playbooks?|nudges?|follow[- ]?ups?|win-?backs?|reminders?|recordatorios?)\b`;
/** One word that may stand before the noun ("a new campaign", "my first campaign"), never "the". */
const SETUP_WORD = String.raw`(?:(?!(?:the|el|las?|los)\s)[\p{L}'’-]+ )?`;
/** Set up, prepare, create: of anything, the ones there included. */
const SETUP_MAKE = String.raw`(?:set[- ]?up|configurar?|preparar?|crear?) (?:(?:all|a few|todas) )?(?:(?:an?|my|our|the|some|mis?|las?|unas?|nuestras?) )?`;
/** Start, begin, launch: of something not yet named, never "the" ones that run. */
const SETUP_START = String.raw`(?:start|iniciar?|lanzar?) (?:(?:all|a few|todas) )?(?:(?:an?|my|our|some|mis?|unas?|nuestras?) )?`;
/**
 * The first day's other ideas on Campaigns (contracts buildAskSuggestions, A3), each a setup however it is typed: a
 * win-back of customers gone quiet, and what should go out this month.
 */
const SETUP_IDEAS = String.raw`win[- ]?back\b|recuperar? a\b|what should (?:go|we send) out\b|qu[eé] deber[ií]a(?:mos)? (?:salir|enviar)\b`;
/** Where a request may start: the text's start, or after a sentence's or a clause's mark (SETUP's and OFFER_ASKED's). */
const SENTENCE_START = String.raw`(?:^|[.!?;:,¿¡]\s*)`;
const SETUP = new RegExp(
  String.raw`${SENTENCE_START}(?:(?:${SETUP_OPENERS})\s+)*(?:(?:${SETUP_MAKE}|${SETUP_START})${SETUP_WORD}${SETUP_NOUN}|${SETUP_IDEAS})`,
  "iu",
);

/**
 * An offer, asked for (the marketing manager's spec §5.7): the journey and the Library (sequences.journey,
 * sequences.messages), read before round 1 on any page, Campaigns included, which propose_sequence's plan then reads
 * again from the turn's cache (readers/index.ts TurnCache), never from the database twice. Only an offer to make, at a
 * sentence's start past a setup's openers or a "we":
 *   - an amount off, its article before it or none ("10% off every service all November", "a 10% discount", "un 10% de
 *     descuento");
 *   - or a verb that makes one, then within four words an amount, a discount, a promotion or a sale ("give everyone 15%
 *     off", "haz unas rebajas"), never one already named ("the 10% off", "our promo"). Do, have, run, start and make (and
 *     tener) open many requests besides an offer, so they make one only after an opener ("can we do a sale", "let's run
 *     a promotion"), never alone ("Do we have any promotions running?", "Run the numbers on the promo").
 * "Offer" alone is who can be sent one (AUDIENCES), and an offer said of a campaign that runs ("make the month's offer
 * 15% off", PLAYBOOKS' words) is a change to it, read as PLAYBOOKS reads it; "deal" is the pipeline's (PIPELINE); "sale"
 * alone is Spanish for "goes out"; a question about how one did ("how did the promotion do?") is none. A missed offer
 * costs nothing, since the plan reads both itself; a false one pushes another named read to the model's own round.
 */
const OFFER_AMOUNT = String.raw`(?:(?:\d+(?:[.,]\d+)?\s?%|[$€£]\s?\d+(?:[.,]\d+)?)\s?(?:off|discount|(?:de )?descuento)|half[- ](?:off|price)|mitad de precio|2x1|(?:two|2) for (?:one|1)|buy one,? get one|bogo)\b`;
const OFFER_THING = String.raw`(?:discounts?|descuentos?|promo(?:tion)?s?|promoci[oó]n(?:es)?|sale|rebajas?)\b`;
/** Who makes it, besides a setup's openers: we, as a request or a plan. */
const OFFER_OPENERS = String.raw`we(?:[’']re| are| will)?|(?:can|could|should|shall) we|let me|queremos|vamos a|podemos`;
/** A verb that makes an offer and little else, in either language, said now or as under way: it may open a request. */
const OFFER_LEAD = String.raw`(?:offer(?:ing)?|giv(?:e|ing)|throw(?:ing)?|send(?:ing)?|launch(?:ing)?|creat(?:e|ing)|set[- ]?up|plan(?:ning)?|put on|ofrec(?:er|e)|dar?|hacer|haz|hagamos|lanzar?|crear?|enviar?|env[ií]a|mandar?|preparar?|poner?|pon)`;
/** A verb that opens many other requests too: an offer's only after an opener. */
const OFFER_DO = String.raw`(?:run(?:ning)?|do(?:ing)?|hav(?:e|ing)|start(?:ing)?|mak(?:e|ing)|tener)`;
/** What the verb makes, within four words of it, never right after a word that names one already there. */
const OFFER_MADE = String.raw`\s+(?:[\p{L}\d'’$%-]+\s+){0,4}?(?<!\b(?:the|this|that|these|those|our|my|your|its|their|el|la|los|las|este|esta|estos|estas|ese|esa|nuestr[oa]s?|mis?|tus?|sus?)\s)(?:${OFFER_AMOUNT}|${OFFER_THING})`;
const OFFER_OPENER = String.raw`(?:${SETUP_OPENERS}|${OFFER_OPENERS})\s+`;
const OFFER_ASKED = new RegExp(
  String.raw`${SENTENCE_START}(?:${OFFER_OPENER})*(?:(?:an?|un|una)\s+)?${OFFER_AMOUNT}|${SENTENCE_START}(?:${OFFER_OPENER})*${OFFER_LEAD}${OFFER_MADE}|${SENTENCE_START}(?:${OFFER_OPENER})+${OFFER_DO}${OFFER_MADE}`,
  "iu",
);

/** A setup asked for (SETUP). */
const setupAsked = (q: string): boolean => SETUP.test(q);
/** An offer to make (OFFER_ASKED), not one said of a campaign that runs (PLAYBOOKS: a change to it). */
const offerAsked = (q: string): boolean => OFFER_ASKED.test(q) && !PLAYBOOKS.test(q);

/** A verb that writes a draft, in either language: write, draft, compose, build, design, plan out, put together. */
const DRAFT_VERB = String.raw`(?:write|draft|compose|build|design|plan out|put together|come up with|escrib[eai]\w*|redact[aeo]\w*|dise[ñn][aeo]\w*|arm[aeo]\w*)`;
/** What a draft is, within four words of the verb: a message, a campaign, an offer, a sequence, a plan. */
const DRAFT_THING = String.raw`(?:messages?|texts?|emails?|campaigns?|offers?|promo(?:tion)?s?|sequences?|win-?backs?|reminders?|follow[- ]?ups?|newsletters?|plans?|scripts?|templates?|mensajes?|correos?|campa[ñn]as?|ofertas?|promoci[oó]n(?:es)?|secuencias?|recordatorios?|planes?|plantillas?)\b`;
/** A draft named, at a sentence's start past a setup's openers: "write a win-back for…", "draft the offer email". */
const DRAFT_ASKED = new RegExp(
  String.raw`${SENTENCE_START}(?:(?:${SETUP_OPENERS})\s+)*${DRAFT_VERB}\s+(?:[\p{L}\d'’$%-]+\s+){0,4}?${DRAFT_THING}`,
  "iu",
);

/**
 * Whether the question asks for a draft (Ruben, 15 Oct 2026: "for crafting generating big things like campaigns etc we
 * should use the maximum effort level"): a setup (SETUP), an offer (OFFER_ASKED), or a message, campaign, sequence or
 * plan to write (DRAFT_ASKED). Such a turn is asked at the draft's effort (effort.ts); a draft missed here is found by
 * the round that begins one, at the cost of that round.
 */
export function draftAsked(text: string): boolean {
  const q = text.replace(/\s+/g, " ").trim();
  return setupAsked(q) || offerAsked(q) || DRAFT_ASKED.test(q);
}

/**
 * The reads each page's own rows already answer, by tool and action: on that page, its context answers the question.
 * Campaigns' rows are its campaigns and offers, so AUDIENCES' words name them there; who a send can reach is no row of
 * it, and is read when asked in REACH's words. Today is not one (the speed plan, A1, 15 Oct 2026): its page block
 * holds the day's rows, and the `today` read holds what it does not -- the standing, who needs you with the reasons and
 * their last words, the recap. Production's shapes for the fortnight to 15 Oct had 26 turns on Today take a second
 * round for that read alone, asked in no words the table holds, so it is read ahead on every question asked there
 * (crossPagePlan), after the reads the question names.
 */
const ON_PAGE: Partial<Record<AskSurface, ReadonlySet<string>>> = {
  calendar: new Set(["calendar.openings", "calendar.week"]),
  campaigns: new Set(["sequences.moments", "sequences.lists"]),
  pipeline: new Set(["people.pipeline"]),
  conversations: new Set(["calls.list"]),
  live: new Set(["calls.list"]),
  inbox: new Set(["inbox.list"]),
};

/**
 * The reads a question names on another page, at most CROSS_PAGE_MAX, in the order below. On Reports a
 * report is read only for a period other than the one on screen (the context's view). A setup's reads (SETUP) come
 * first, on every page, then a setup's or an offer's (OFFER_ASKED) journey and Library: within the cap a setup keeps
 * its own two, and an offer's go before every other read. On Today the day's own read comes last, whatever is asked,
 * where the cap leaves room.
 */
export function crossPagePlan(text: string, surface: string | null, view: string | null = null): ToolRun[] {
  const q = text.replace(/\s+/g, " ").trim();
  const own = ON_PAGE[surface as AskSurface] ?? new Set<string>();
  const out: ToolRun[] = [];
  // `answered`: the reads the page's rows answer, skipped; none where the question asks what they do not hold.
  const add = (name: string, input: Record<string, unknown>, answered: ReadonlySet<string> = own) => {
    const called = calledName(name, input);
    if (!answered.has(called) && !out.some((r) => calledName(r.name, r.input) === called)) out.push({ name, input });
  };
  // A setup's two reads come first and are read whatever page asks (A4): the page's rows hold neither.
  const setup = setupAsked(q);
  if (setup) for (const action of ["moments", "lists"]) out.push({ name: "sequences", input: { action } });
  // Then the plan's two, the journey and the Library (the marketing manager's §5.7), whatever page asks: no page's rows
  // are either. The cap leaves a setup its own two, whose one campaign alone reads nothing else (prompt.ts, the setup
  // rule); a whole setup's plan reads these on its call, the campaigns and the lines among them read already. An offer
  // said of a campaign that runs is a change to it: PLAYBOOKS reads it below.
  if (setup || offerAsked(q))
    for (const action of ["journey", "messages"]) out.push({ name: "sequences", input: { action } });
  const overview = OVERVIEW.test(q);
  if (overview) add("today", {});
  if (overview || REPORT.test(q)) {
    const days = daysOf(q);
    if (surface !== "reports" || String(days) !== view) add("report", { period: `${days}d` });
  }
  if (OPENINGS.test(q)) add("calendar", { action: "openings", day: dayOf(q, ""), service: "" });
  else if (CANCELED.test(q)) add("inbox", { action: "search", words: CANCEL_WORDS, days: cancelDaysOf(q) });
  else if (CALENDAR.test(q)) add("calendar", { action: "week", day: dayOf(q, "today") });
  if (PIPELINE.test(q)) add("people", { action: "pipeline" });
  if (PLAYBOOKS.test(q)) add("sequences", { action: "moments" });
  if (surface === "campaigns" && REACH.test(q)) add("sequences", { action: "lists" }, new Set());
  else if (AUDIENCES.test(q)) add("sequences", { action: "lists" });
  if (MISSED.test(q)) add("calls", { action: "list", filter: "missed" });
  else if (CALLS.test(q)) add("calls", { action: "list", filter: "recent" });
  if (HELD.test(q)) add("inbox", { action: "list", filter: "held" });
  else if (WROTE.test(q)) add("inbox", { action: "list", filter: "recent" });
  // On Today, the day's own read, after what the question named: it fills the cap's room (the speed plan, A1).
  if (surface === "today") add("today", {});
  return out.slice(0, CROSS_PAGE_MAX);
}

/**
 * The row the scope names, read whole by the tool and action that read it, to ride in with the page (as the snapshot's
 * scoped row did): a call (calls.get), a person (people.get), a thread or a conversation (inbox.thread), a lead
 * (leads.lead), a search (leads.search), a run -- the Broadcasts row its address calls one -- (sequences.batch),
 * and a campaign (sequences.moments, which names it among the rest). A lead is read as the search the page is on
 * found it (its address's `s-<id>`), the membership its peek shows, never its newest in another search. A page needs
 * no read: none, a reach-out's drawer among them (contracts scopeFromRoute: its row rides in with the page's). Moved
 * here from loop.ts (PR 4.3): the reads made before the model is asked live here.
 */
export function scopedRead(scope: AskScope | null, route?: string | null): ToolRun | null {
  if (scope?.kind === "call") return { name: "calls", input: { action: "get", call_id: scope.id } };
  if (scope?.kind === "person") return { name: "people", input: { action: "get", contact_id: scope.id } };
  if (scope?.kind === "thread" || scope?.kind === "conversation")
    return { name: "inbox", input: { action: "thread", conversation_id: scope.id, more: false } };
  if (scope?.kind === "lead") {
    const searchId = route ? parseLeadsRoute(route)?.searchId : null;
    return {
      name: "leads",
      input: { action: "lead", lead_id: scope.id, ...(searchId ? { search_id: searchId } : {}) },
    };
  }
  if (scope?.kind === "search") return { name: "leads", input: { action: "search", search_id: scope.id } };
  if (scope?.kind === "run") return { name: "sequences", input: { action: "batch", broadcast_id: scope.id } };
  if (scope?.kind === "playbook") return { name: "sequences", input: { action: "moments" } };
  return null;
}

/**
 * One read as the model reads it: data in a block of its own, never in `system` (customers' words are in it), its
 * source the tool and action that read it (`read://calendar.week`), its title the call as it was made. Fenced, as a
 * tool's result is (round.ts resultBlocks): the same rows, read ahead of the question.
 */
export function readBlock(run: ToolRun, result: string): SearchResultBlock {
  return {
    type: "search_result",
    source: `read://${calledName(run.name, run.input)}`,
    title: `${run.name} ${JSON.stringify(run.input)}`,
    content: [{ type: "text", text: fenced("record", result) }],
    citations: { enabled: false },
  };
}
