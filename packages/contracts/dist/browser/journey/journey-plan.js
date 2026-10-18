import { clip } from "../ask/ask-answer.js";
import { CALENDAR_SETTING_ROUTE } from "../setup/calendar-source.js";
import { capitalize, joinWords, joinWordsEs, plural } from "../shared/words.js";
import { LIVE_VERSION_STATES } from "../templates/message-versions.js";
import { languageBase } from "../templates/template-languages.js";
import { appointmentWords } from "./appointment-word.js";
import { JOURNEY_STAGE_IDS, journeyStageOf } from "./journey.js";
const STAGE_WORDS = {
  first_contact: "at first contact",
  before: "the day before a booked time",
  after: "the day after a booked time",
  proposal: "while a proposal waits",
  quiet: "once they go quiet"
};
export const JOURNEY_PLAN_WORDS = {
  journeyUnread: "The journey could not be read just now, so which moments are covered is not known: say so, and try again in a moment.",
  nothingToCover: "Every moment asked for is covered already or not offered here (an appointment's moments need a calendar connected): say so, and propose nothing.",
  notOffered: (stages) => `Not offered here: ${joinWords(stages)}.`,
  whyStage: (id) => `Nobody hears from you ${STAGE_WORDS[id]} yet.`,
  /** A campaign paused on a moment the setup covers: resumed by a card of its own, never doubled. */
  whyResume: (name) => `\u201C${name}\u201D stands paused on its moment: resumed, never doubled.`
};
function setupSteps() {
  const steps = [];
  const push = (kind, input, why) => {
    const n = steps.length + 1;
    steps.push({ n, kind, silent: false, input, why, after: [] });
    return n;
  };
  const add = (input, why) => push("playbook", input, why);
  const resume = (playbookId, why) => push("change", { playbook_id: playbookId, state: "running" }, why);
  return { steps, add, resume };
}
const REVIEW_STARTER = "after_visit_review";
const CHECK_STARTER = "after_visit_check";
function stageInput(id, moment, world) {
  if (id !== "after") return { trigger: moment };
  const reviews = world.messages.filter((m) => m.name === REVIEW_STARTER);
  if (!world.reviewLink) return reviews.length ? { trigger: moment, starter: CHECK_STARTER } : { trigger: moment };
  const review = reviews.find((m) => languageBase(m.language) === world.language);
  const goes = (review?.versions ?? []).filter(
    (v) => LIVE_VERSION_STATES.has(v.state) && (v.channel !== "whatsapp" || world.whatsappSends)
  );
  const version = goes.find((v) => v.channel === "whatsapp") ?? goes.at(0);
  return version ? { trigger: moment, template_id: version.id } : { trigger: moment, starter: REVIEW_STARTER };
}
const APPOINTMENT_ES = {
  appointment: "cita",
  visit: "visita",
  meeting: "reuni\xF3n",
  session: "sesi\xF3n",
  lesson: "clase"
};
const SETUP_WORDS = {
  en: {
    starts: {
      before: "a reminder the day before a booked time",
      after: "a follow-up the day after a booked time",
      proposal: "a follow-up while a proposal waits",
      quiet: "a win-back once they go quiet"
    },
    named: {
      before: "the reminder",
      after: "the follow-up",
      proposal: "the proposal follow-up",
      quiet: "the win-back"
    },
    gets: { before: "a reminder the day before", after: "a follow-up the day after" },
    join: joinWords,
    thing: (word) => appointmentWords(word).one,
    cover: (n, what) => `Starts ${plural(n, "campaign")} now${n > 1 ? ", each its own card" : ""}: ${what}.`,
    calendar: (feed, each, gets) => feed ? `First, connect your calendar's feed under Settings \u203A Hours & booking (booking emails alone cannot time a campaign), so each ${each} gets ${gets}.` : `First, connect your calendar under Settings \u203A Hours & booking, so each ${each} gets ${gets}.`,
    nobody: (named, one) => `${capitalize(named)} ${one ? "reaches" : "reach"} nobody today; ${one ? "its card says" : "each card says"} why.`,
    resume: (names) => `Resumes ${joinWords(names.map((n) => `\u201C${n}\u201D`))}, paused on ${names.length === 1 ? "its moment, on a card of its own" : "their moments, a card each"}.`,
    again: (more) => `Ask me again once it is connected, and I'll add ${more === 1 ? "it" : "them"}.`,
    headline: (now, more) => `Connect your calendar first: ${plural(now, "campaign")} can start now, ${more} more once it is connected.`,
    open: "Connect a calendar",
    next: "How do I connect my calendar in Settings?"
  },
  es: {
    starts: {
      before: "un recordatorio el d\xEDa antes de cada cita",
      after: "un seguimiento el d\xEDa despu\xE9s de cada cita",
      proposal: "un seguimiento mientras espera una propuesta",
      quiet: "una recuperaci\xF3n para quien se queda en silencio"
    },
    named: {
      before: "el recordatorio",
      after: "el seguimiento",
      proposal: "el seguimiento de propuestas",
      quiet: "la recuperaci\xF3n"
    },
    gets: { before: "un recordatorio el d\xEDa antes", after: "un seguimiento el d\xEDa despu\xE9s" },
    join: joinWordsEs,
    thing: (word) => APPOINTMENT_ES[word],
    cover: (n, what) => `Empieza ${n === 1 ? "1 campa\xF1a" : `${n} campa\xF1as`} ya${n > 1 ? ", cada una en su tarjeta" : ""}: ${what}.`,
    calendar: (feed, each, gets) => feed ? `Primero, conecta el feed de tu calendario en Ajustes \u203A Negocio (los correos de reserva no bastan para programar una campa\xF1a), para que cada ${each} tenga ${gets}.` : `Primero, conecta tu calendario en Ajustes \u203A Negocio, para que cada ${each} tenga ${gets}.`,
    nobody: (named, one) => `${capitalize(named)} no ${one ? "llega" : "llegan"} a nadie hoy; ${one ? "su tarjeta dice" : "cada tarjeta dice"} por qu\xE9.`,
    resume: (names) => `Reanuda ${joinWordsEs(names.map((n) => `\xAB${n}\xBB`))}, en pausa en ${names.length === 1 ? "su momento, en su propia tarjeta" : "sus momentos, en una tarjeta cada una"}.`,
    again: (more) => `P\xEDdemelo otra vez cuando est\xE9 conectado y ${more === 1 ? "la a\xF1ado" : "las a\xF1ado"}.`,
    headline: (now, more) => `Conecta tu calendario primero: ${now === 1 ? "1 campa\xF1a puede" : `${now} campa\xF1as pueden`} empezar ya, ${more} m\xE1s cuando est\xE9 conectado.`,
    open: "Conectar un calendario",
    next: "\xBFC\xF3mo conecto mi calendario en Ajustes?"
  }
};
function bookedThing(books, world) {
  const said = (books ?? "").trim().replace(/^(?:a|an|the|their|our|un|una|el|la|los|las|sus?|nuestras?)\s+/i, "").replace(/[.!?…,;:]+$/, "").trim();
  return said ? clip(said, 40) : SETUP_WORDS[world.says].thing(world.shape.word);
}
function needOf(id, world) {
  if (id === "before" || id === "after") return world.shape.calendar === "feed" ? null : "calendar";
  return null;
}
function momentsOf(intent, world) {
  const named = intent.stages;
  return JOURNEY_STAGE_IDS.filter(
    (id) => id !== "first_contact" && (!named || named.includes(id)) && (id !== "proposal" || world.shape.hasDeals || intent.proposals === true || !!named?.includes(id))
  );
}
function needLines(needs, later, books, world) {
  const S = SETUP_WORDS[world.says];
  if (!needs.has("calendar")) return [];
  const gets = later.flatMap((id) => id === "before" || id === "after" ? [S.gets[id]] : []);
  return [S.calendar(world.shape.calendar === "email", bookedThing(books, world), S.join(gets))];
}
export function journeyPlan(intent, world) {
  const journey = world.journey;
  if (!journey) return { refused: JOURNEY_PLAN_WORDS.journeyUnread };
  const S = SETUP_WORDS[world.says];
  const { steps, add, resume } = setupSteps();
  const missing = [];
  const paused = [];
  const needs = /* @__PURE__ */ new Set();
  const later = [];
  const started = [];
  for (const id of momentsOf(intent, world)) {
    const stage = journey.find((s) => s.id === id);
    if (!stage && id === "proposal") {
      add(stageInput(id, "proposal_waiting", world), JOURNEY_PLAN_WORDS.whyStage(id));
      started.push(id);
      continue;
    }
    if (!stage) {
      const need = needOf(id, world);
      if (need) {
        needs.add(need);
        later.push(id);
      } else if (intent.stages) missing.push(STAGE_WORDS[id]);
      continue;
    }
    if (stage.covered || !stage.moment) continue;
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
    const first = needLines(needs, later, intent.books, { ...world, says: "en" });
    return { refused: [JOURNEY_PLAN_WORDS.nothingToCover, ...first, ...notOffered].join(" ") };
  }
  const nobody = started.filter((id) => {
    const moment = journey.find((s) => s.id === id)?.moment ?? (id === "proposal" ? "proposal_waiting" : null);
    return !!moment && world.reach[moment] === 0;
  });
  const words = [
    ...needLines(needs, later, intent.books, world),
    ...started.length ? [S.cover(started.length, S.join(started.map((id) => S.starts[id])))] : [],
    ...nobody.length ? [S.nobody(S.join(nobody.map((id) => S.named[id])), nobody.length === 1)] : [],
    ...notOffered,
    ...paused.length ? [S.resume(paused)] : [],
    ...needs.size ? [S.again(later.length)] : []
  ];
  const lead = needs.size ? {
    headline: S.headline(started.length + paused.length, later.length),
    open: { to: CALENDAR_SETTING_ROUTE, label: S.open },
    next: [S.next]
  } : null;
  return { steps, words: words.join(" "), lead };
}
