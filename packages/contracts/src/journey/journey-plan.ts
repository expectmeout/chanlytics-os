/**
 * A setup of the journey, with no model (the marketing manager's spec §5.4; the setup review, 15 Oct 2026): what
 * contracts planOf (ask/plan.ts) makes of the intent cover_journey against the workspace as Ask's reads see it. A
 * campaign on each moment of the business's journey that this workspace runs and nothing covers yet, on its action's
 * pick (stageInput); a moment it does not run yet said with what it needs first, never dropped in silence: an
 * appointment's two need the calendar's feed, a proposal's needs deals on, which the owner's own words make a moment of
 * their journey. The words name what they book in the owner's words, say whoever a card reaches nobody of today, and
 * are said in the question's language; the answer leads with what comes first (PlanLead). Its rows are in
 * tooling/scripts/tests/ask/plan/plan-of.test.mjs, beside the offer's.
 */
import { clip } from "../ask/ask-answer";
import type { PlanIntent, PlanStep, PlanWorld } from "../ask/plan";
import { SELLS_BY_QUESTION, SELLS_BY_WORDS } from "../deals/sells-by";
import { CALENDAR_SETTING_ROUTE } from "../setup/calendar-source";
import { capitalize, joinWords, joinWordsEs, plural } from "../shared/words";
import { LIVE_VERSION_STATES } from "../templates/message-versions";
import { languageBase } from "../templates/template-languages";
import { appointmentWords, type AppointmentWord } from "./appointment-word";
import { JOURNEY_STAGE_IDS, journeyStageOf, type JourneyStageId } from "./journey";

/** Each stage of the journey, as a sentence about when it sends says it. */
const STAGE_WORDS: Record<JourneyStageId, string> = {
  first_contact: "at first contact",
  before: "the day before a booked time",
  after: "the day after a booked time",
  proposal: "while a proposal waits",
  quiet: "once they go quiet",
};

/**
 * What a setup says to the model and of each step: its refusals (each ends on what to do) and why a campaign is
 * proposed. Said in English, as every refusal the model reads is; contracts PLAN_WORDS carries them too.
 */
export const JOURNEY_PLAN_WORDS = {
  journeyUnread:
    "The journey could not be read just now, so which moments are covered is not known: say so, and try again in a moment.",
  nothingToCover:
    "Every moment asked for is covered already or not offered here (an appointment's moments need a calendar connected, a proposal's needs deals on): say so, and propose nothing.",
  notOffered: (stages: readonly string[]): string => `Not offered here: ${joinWords(stages)}.`,
  whyStage: (id: JourneyStageId): string => `Nobody hears from you ${STAGE_WORDS[id]} yet.`,
  /** A campaign paused on a moment the setup covers: resumed by a card of its own, never doubled. */
  whyResume: (name: string): string => `“${name}” stands paused on its moment: resumed, never doubled.`,
} as const;

/**
 * A setup's steps, numbered as they are added: each a campaign started, or one paused on its moment resumed (a change,
 * as propose_sequence action change makes it), a card of its own with nothing silent before it, so none waits for
 * another (planOf's offer numbers its silent steps first).
 */
function setupSteps() {
  const steps: PlanStep[] = [];
  const push = (kind: "playbook" | "change", input: Record<string, unknown>, why: string): number => {
    const n = steps.length + 1;
    steps.push({ n, kind, silent: false, input, why, after: [] });
    return n;
  };
  const add = (input: Record<string, unknown>, why: string): number => push("playbook", input, why);
  const resume = (playbookId: string, why: string): number =>
    push("change", { playbook_id: playbookId, state: "running" }, why);
  return { steps, add, resume };
}

/** The day after's starters by their keys: the thank-you with a review ask, and the one that asks how it went. */
const REVIEW_STARTER = "after_visit_review";
const CHECK_STARTER = "after_visit_check";

/**
 * A campaign on a stage's moment, naming nothing where the action's own pick will do (act/playbook.ts heldStarter: the
 * first of the moment's starters the Library holds, the after_visit the set retired among them, else the moment's own,
 * filed at Approve). The day after's is the review ask only where the Google listing keeps a review link, whose slot
 * fills from it alone: the one the Library holds in this language, by a version it can go by (live; WhatsApp's where
 * WhatsApp sends, the review ask being about their own appointment, not an offer), else its starter, filed at Approve.
 * With no link, the check is named only where the Library holds a review ask, which the action's pick could take.
 */
function stageInput(id: JourneyStageId, moment: string, world: PlanWorld): Record<string, unknown> {
  if (id !== "after") return { trigger: moment };
  const reviews = world.messages.filter((m) => m.name === REVIEW_STARTER);
  if (!world.reviewLink) return reviews.length ? { trigger: moment, starter: CHECK_STARTER } : { trigger: moment };
  const review = reviews.find((m) => languageBase(m.language) === world.language);
  const goes = (review?.versions ?? []).filter(
    (v) => LIVE_VERSION_STATES.has(v.state) && (v.channel !== "whatsapp" || world.whatsappSends),
  );
  const version = goes.find((v) => v.channel === "whatsapp") ?? goes.at(0);
  return version ? { trigger: moment, template_id: version.id } : { trigger: moment, starter: REVIEW_STARTER };
}

/** A moment a setup may start a campaign on: every stage but first contact, the receptionist's. */
type Moment = Exclude<JourneyStageId, "first_contact">;
/** What a moment of the business's journey waits for here: a calendar's feed (an appointment's two), deals on (a proposal's). */
type Need = "calendar" | "proposals";
type Cover = Extract<PlanIntent, { intent: "cover_journey" }>;

/**
 * A setup's answer where something must be set up first (the setup review, 15 Oct 2026): its headline says what, and how
 * many campaigns start now and wait for it; its Open goes where it is set; its next question asks how. The cards alone
 * said "One card to review", and nothing of what to connect.
 */
export interface PlanLead {
  headline: string;
  open: { to: string; label: string };
  next: string[];
}

/** Settings › Business, where How customers buy is answered (settings/frame/tabs.ts: the bare route opens Business). */
const SETTINGS_BUSINESS_ROUTE = "admin/workspace";

/** The workspace's word for an appointment, in Spanish: a setup's Spanish words say it where the owner named nothing. */
const APPOINTMENT_ES: Record<AppointmentWord, string> = {
  appointment: "cita",
  visit: "visita",
  meeting: "reunión",
  session: "sesión",
  lesson: "clase",
};

/**
 * A setup's words, by the language of the question (PlanWorld.says): what each campaign it starts sends, what an
 * appointment's moments and a proposal's need first and where that is set (Settings › Business: the calendar's row, and
 * How customers buy, contracts sells-by.ts), what reaches nobody today, and the answer's headline, Open and next question
 * where something waits. Every sentence names what the business books in the owner's words where they gave them.
 */
const SETUP_WORDS = {
  en: {
    starts: {
      before: "a reminder the day before a booked time",
      after: "a follow-up the day after a booked time",
      proposal: "a follow-up while a proposal waits",
      quiet: "a win-back once they go quiet",
    } satisfies Record<Moment, string>,
    named: {
      before: "the reminder",
      after: "the follow-up",
      proposal: "the proposal follow-up",
      quiet: "the win-back",
    } satisfies Record<Moment, string>,
    gets: { before: "a reminder the day before", after: "a follow-up the day after" },
    join: joinWords,
    thing: (word: AppointmentWord) => appointmentWords(word).one,
    cover: (n: number, what: string) =>
      `Starts ${plural(n, "campaign")} now${n > 1 ? ", each its own card" : ""}: ${what}.`,
    calendar: (feed: boolean, each: string, gets: string) =>
      feed
        ? `First, connect your calendar's feed under Settings › Business (booking emails alone cannot time a campaign), so each ${each} gets ${gets}.`
        : `First, connect your calendar under Settings › Business, so each ${each} gets ${gets}.`,
    proposals: (first: boolean) =>
      `${first ? "First" : "Then"}, under Settings › Business, answer ${SELLS_BY_QUESTION} with “${SELLS_BY_WORDS.proposal.label}”, so each proposal that waits gets a follow-up.`,
    nobody: (named: string, one: boolean) =>
      `${capitalize(named)} ${one ? "reaches" : "reach"} nobody today; ${one ? "its card says" : "each card says"} why.`,
    resume: (names: readonly string[]) =>
      `Resumes ${joinWords(names.map((n) => `“${n}”`))}, paused on ${names.length === 1 ? "its moment, on a card of its own" : "their moments, a card each"}.`,
    again: (more: number, needs: ReadonlySet<Need>) =>
      `Ask me again once ${onceOf(needs, "en")}, and I'll add ${more === 1 ? "it" : "them"}.`,
    headline: (needs: ReadonlySet<Need>, now: number, more: number) =>
      `${needs.size === 2 ? "Connect your calendar and turn on proposals" : needs.has("calendar") ? "Connect your calendar" : "Turn on proposals"} first: ${plural(now, "campaign")} can start now, ${more} more once ${onceOf(needs, "en")}.`,
    open: (needs: ReadonlySet<Need>) => (needs.has("calendar") ? "Connect a calendar" : "Open Business settings"),
    next: (needs: ReadonlySet<Need>) =>
      needs.has("calendar") ? "How do I connect my calendar in Settings?" : "How do I turn on proposals in Settings?",
  },
  es: {
    starts: {
      before: "un recordatorio el día antes de cada cita",
      after: "un seguimiento el día después de cada cita",
      proposal: "un seguimiento mientras espera una propuesta",
      quiet: "una recuperación para quien se queda en silencio",
    } satisfies Record<Moment, string>,
    named: {
      before: "el recordatorio",
      after: "el seguimiento",
      proposal: "el seguimiento de propuestas",
      quiet: "la recuperación",
    } satisfies Record<Moment, string>,
    gets: { before: "un recordatorio el día antes", after: "un seguimiento el día después" },
    join: joinWordsEs,
    thing: (word: AppointmentWord) => APPOINTMENT_ES[word],
    cover: (n: number, what: string) =>
      `Empieza ${n === 1 ? "1 campaña" : `${n} campañas`} ya${n > 1 ? ", cada una en su tarjeta" : ""}: ${what}.`,
    calendar: (feed: boolean, each: string, gets: string) =>
      feed
        ? `Primero, conecta el feed de tu calendario en Ajustes › Negocio (los correos de reserva no bastan para programar una campaña), para que cada ${each} tenga ${gets}.`
        : `Primero, conecta tu calendario en Ajustes › Negocio, para que cada ${each} tenga ${gets}.`,
    proposals: (first: boolean) =>
      `${first ? "Primero" : "Luego"}, en Ajustes › Negocio, responde a «Cómo compran tus clientes» con «Algunos reciben antes una propuesta», para que cada propuesta que espera tenga un seguimiento.`,
    nobody: (named: string, one: boolean) =>
      `${capitalize(named)} no ${one ? "llega" : "llegan"} a nadie hoy; ${one ? "su tarjeta dice" : "cada tarjeta dice"} por qué.`,
    resume: (names: readonly string[]) =>
      `Reanuda ${joinWordsEs(names.map((n) => `«${n}»`))}, en pausa en ${names.length === 1 ? "su momento, en su propia tarjeta" : "sus momentos, en una tarjeta cada una"}.`,
    again: (more: number, needs: ReadonlySet<Need>) =>
      `Pídemelo otra vez cuando ${onceOf(needs, "es")} y ${more === 1 ? "la añado" : "las añado"}.`,
    headline: (needs: ReadonlySet<Need>, now: number, more: number) =>
      `${needs.size === 2 ? "Conecta tu calendario y activa las propuestas" : needs.has("calendar") ? "Conecta tu calendario" : "Activa las propuestas"} primero: ${now === 1 ? "1 campaña puede" : `${now} campañas pueden`} empezar ya, ${more} más cuando ${onceOf(needs, "es")}.`,
    open: (needs: ReadonlySet<Need>) =>
      needs.has("calendar") ? "Conectar un calendario" : "Abrir Ajustes del negocio",
    next: (needs: ReadonlySet<Need>) =>
      needs.has("calendar") ? "¿Cómo conecto mi calendario en Ajustes?" : "¿Cómo activo las propuestas en Ajustes?",
  },
} as const;

/** When what a setup waits for is done: the calendar connected, proposals on, or both. */
function onceOf(needs: ReadonlySet<Need>, says: PlanWorld["says"]): string {
  if (needs.size === 2) return says === "es" ? "estén los dos" : "both are on";
  if (needs.has("calendar")) return says === "es" ? "esté conectado" : "it is connected";
  return says === "es" ? "estén activas" : "they are on";
}

/**
 * What the business books as the owner said it ("a discovery call", "una llamada"), as a setup's words name it after
 * "each" ("cada"): its article and its closing mark left off, at most forty characters; else the workspace's own word.
 */
function bookedThing(books: string | undefined, world: PlanWorld): string {
  const said = (books ?? "")
    .trim()
    .replace(/^(?:a|an|the|their|our|un|una|el|la|los|las|sus?|nuestras?)\s+/i, "")
    .replace(/[.!?…,;:]+$/, "")
    .trim();
  return said ? clip(said, 40) : SETUP_WORDS[world.says].thing(world.shape.word);
}

/**
 * Why a moment of the business's journey is not one this workspace runs yet: an appointment's two without a calendar's
 * feed, a proposal's with deals off. Null where it runs, or where nothing a setup could name stops it.
 */
function needOf(id: Moment, world: PlanWorld): Need | null {
  if (id === "before" || id === "after") return world.shape.calendar === "feed" ? null : "calendar";
  if (id === "proposal") return world.shape.dealsOn ? null : "proposals";
  return null;
}

/**
 * The moments a setup is for: each named, or every one of the journey's, a proposal's only where deals are on or the
 * owner said some customers get one first (a salon is never told to turn proposals on).
 */
function momentsOf(intent: Cover, world: PlanWorld): Moment[] {
  const named = intent.stages;
  return JOURNEY_STAGE_IDS.filter(
    (id): id is Moment =>
      id !== "first_contact" &&
      (!named || named.includes(id)) &&
      (id !== "proposal" || world.shape.dealsOn || intent.proposals === true || !!named?.includes(id)),
  );
}

/** What a setup says must come first, in order (the calendar, then proposals), each naming what it starts. */
function needLines(needs: ReadonlySet<Need>, later: readonly Moment[], books: string | undefined, world: PlanWorld) {
  const S = SETUP_WORDS[world.says];
  const lines: string[] = [];
  if (needs.has("calendar")) {
    const gets = later.flatMap((id) => (id === "before" || id === "after" ? [S.gets[id]] : []));
    lines.push(S.calendar(world.shape.calendar === "email", bookedThing(books, world), S.join(gets)));
  }
  if (needs.has("proposals")) lines.push(S.proposals(!needs.has("calendar")));
  return lines;
}

/**
 * A setup of the journey (the setup review, 15 Oct 2026): a campaign on each moment of the business's journey that this
 * workspace runs and nothing covers yet, on its action's pick (stageInput); a campaign paused on its moment resumed by a
 * card of its own, never doubled. A moment it does not run yet is said with what it needs first, never dropped in
 * silence: an appointment's two need the calendar connected, a proposal's needs deals on, which the owner's own words
 * make a moment of their journey (`proposals`). The words say what must come first, then what the cards start, then
 * whoever they reach nobody of today, then what they resume, and to ask again once it is set up; the answer leads with
 * it (PlanLead). With nothing to start or resume, the plan is refused with what comes first, for the model to say.
 */
export function journeyPlan(
  intent: Cover,
  world: PlanWorld,
): { steps: PlanStep[]; words: string; lead: PlanLead | null } | { refused: string } {
  const journey = world.journey;
  if (!journey) return { refused: JOURNEY_PLAN_WORDS.journeyUnread };
  const S = SETUP_WORDS[world.says];
  const { steps, add, resume } = setupSteps();
  const missing: string[] = [];
  const paused: string[] = [];
  const needs = new Set<Need>();
  const later: Moment[] = [];
  const started: Moment[] = [];
  for (const id of momentsOf(intent, world)) {
    const stage = journey.find((s) => s.id === id);
    if (!stage) {
      const need = needOf(id, world);
      if (need) {
        needs.add(need);
        later.push(id);
      } else if (intent.stages) missing.push(STAGE_WORDS[id]);
      continue;
    }
    if (stage.covered || !stage.moment) continue;
    // A campaign paused on the moment is resumed by a card of its own, never doubled: the setup said to resume it "from
    // its drawer", where propose_sequence action change makes that card (the operator stress run, 15 Oct 2026).
    const held = world.playbooks.find((p) => p.state === "paused" && journeyStageOf(p.trigger) === id);
    if (held) {
      resume(held.id, JOURNEY_PLAN_WORDS.whyResume(held.name));
      paused.push(held.name);
    } else {
      add(stageInput(id, stage.moment, world), JOURNEY_PLAN_WORDS.whyStage(id));
      started.push(id);
    }
  }
  const notOffered = missing.length ? [JOURNEY_PLAN_WORDS.notOffered(missing)] : [];
  if (steps.length === 0) {
    // The refusal is the model's to say, in the question's language: what comes first, in English.
    const first = needLines(needs, later, intent.books, { ...world, says: "en" });
    return { refused: [JOURNEY_PLAN_WORDS.nothingToCover, ...first, ...notOffered].join(" ") };
  }
  // Whom a card reaches today, by its moment's own count: null is not counted, never nobody.
  const nobody = started.filter((id) => {
    const moment = journey.find((s) => s.id === id)?.moment;
    return !!moment && world.reach[moment] === 0;
  });
  const words = [
    ...needLines(needs, later, intent.books, world),
    ...(started.length ? [S.cover(started.length, S.join(started.map((id) => S.starts[id])))] : []),
    ...(nobody.length ? [S.nobody(S.join(nobody.map((id) => S.named[id])), nobody.length === 1)] : []),
    ...notOffered,
    ...(paused.length ? [S.resume(paused)] : []),
    ...(needs.size ? [S.again(later.length, needs)] : []),
  ];
  // A campaign resumed starts again now, as one started does.
  const lead = needs.size
    ? {
        headline: S.headline(needs, started.length + paused.length, later.length),
        open: { to: needs.has("calendar") ? CALENDAR_SETTING_ROUTE : SETTINGS_BUSINESS_ROUTE, label: S.open(needs) },
        next: [S.next(needs)],
      }
    : null;
  return { steps, words: words.join(" "), lead };
}
