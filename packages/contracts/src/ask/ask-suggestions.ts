/**
 * The questions and the acts the palette offers for where the person is (buildAskSuggestions): built from the
 * workspace's data, in English or Spanish, never from a seed. The pages it knows are ask.ts's (ASK_SURFACES).
 */
import type { AskScope, AskSurface } from "./ask";
import type { AskLanguage } from "./ask-language";

/* ------------------------------------------------------------ suggestions */

/**
 * The surfaces that have no chips of their own yet, and whose they are offered (the Phase 2 plan, PR 2.1): the
 * Pipeline People's, as it was when it went by People's name; the Calendar and Campaigns other's. The first run's are
 * its own since the palette opens there (Phase 7).
 */
const CHIPS_OF: Partial<Record<AskSurface, AskSurface>> = {
  pipeline: "people",
  calendar: "other",
  campaigns: "other",
};

export interface AskSuggestion {
  /** The words sent, or placed in the input when `compose` is set. */
  q: string;
  kind: "ask" | "act";
  icon: string;
  /** Answered without a model. */
  fast?: boolean;
  /** What the row shows when it differs from the words. */
  label?: string;
  /** Put the words in the input for the person to finish, rather than sending them. */
  compose?: boolean;
}

export interface SuggestionInput {
  surface: AskSurface;
  language: AskLanguage;
  needsYou: number;
  heldDrafts: number;
  missedToday: number;
  liveNow: number;
  hasCalendar: boolean;
  scope?: AskScope | null;
  /** Operators and owners may act; a viewer is never offered a card. */
  canAct?: boolean;
  /** Deals are a thing here (People's surface says so): the question about proposals is offered. */
  dealsOn?: boolean;
  /** On Leads: the first day's suggestion words (each a search to propose), and the latest searches' own words. */
  leadIdeas?: string[];
  leadSearches?: string[];
}

const T = {
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
    actInvite: "Invite a teammate",
    actInviteQ: "Invite ",
    actOffer: "Send an offer to a list",
    actOfferQ: "Send the ",
    actPlaybook: "Start a win-back playbook",
    actPlaybookQ: "Start a win-back playbook for the quiet clients",
    actHold: "Hold every reply for my review",
    actHoldQ: "Hold every reply for my review before it sends",
  },
  es: {
    needs: "¿Quién me necesita ahora?",
    held: "¿Qué tiene retenido la recepcionista para mí?",
    calls: "¿Llamó alguien mientras estaba ocupada?",
    live: "¿De qué trata la llamada en curso?",
    openSat: "¿Qué hay libre el sábado?",
    openTomorrow: "¿Qué hay libre mañana?",
    week: "¿Cómo fue la semana?",
    said: "¿Qué le dijo la recepcionista a {name}?",
    why: "¿Por qué se retuvo esta respuesta?",
    who: "¿Quién escribió hoy?",
    rules: "¿Qué puede hacer la recepcionista sola?",
    hours: "¿Cuál es nuestro horario esta semana?",
    brief: "Resúmeme el día",
    proposals: "¿Quién tiene una propuesta pendiente?",
    setupLeft: "¿Qué falta por configurar?",
    moreLike: "Encuentra más como: {asked}",
    actLate: "Dile a {name} que vamos con retraso",
    actLateQ: "Dile a {name} que vamos con unos 15 minutos de retraso hoy",
    actDraft: "Redacta una respuesta a {name}",
    actDraftQ: "Redacta una respuesta a {name}: ",
    actRemember: "Recuérdale algo a la recepcionista",
    actRememberQ: "Recuerda que ",
    actClose: "Cerrar el salón un día",
    actCloseQ: "Cierra el ",
    actHours: "Cambiar el horario de un día",
    actHoursQ: "Cambia el horario del sábado a ",
    actInvite: "Invitar a alguien del equipo",
    actInviteQ: "Invita a ",
    actOffer: "Enviar una oferta a una lista",
    actOfferQ: "Envía la ",
    actPlaybook: "Iniciar un playbook de recuperación",
    actPlaybookQ: "Inicia un playbook de recuperación para los clientes inactivos",
    actHold: "Retener cada respuesta para revisarla",
    actHoldQ: "Retén cada respuesta para mi revisión antes de enviarla",
  },
} as const;

/**
 * Each page's own questions, after those the workspace's state asks for (who needs you, a held draft, a call, the
 * openings): the key of each question's words and its icon, in the order offered. Leads' own are its ideas and its
 * searches' words, which buildAskSuggestions puts first; a page not listed has none of its own. The first run's
 * (Phase 7): what is left, which the turn answers from the steps the page shows (the server's start provider), and
 * the hours, the facts it checks.
 */
const PAGE_QUESTIONS: Partial<Record<AskSurface, ReadonlyArray<readonly [keyof (typeof T)["en"], string]>>> = {
  today: [
    ["brief", "sparkle"],
    ["who", "users"],
  ],
  inbox: [
    ["who", "users"],
    ["rules", "shield"],
  ],
  people: [["who", "users"]],
  reports: [["week", "trending-up"]],
  settings: [
    ["rules", "shield"],
    ["hours", "clock"],
  ],
  start: [
    ["setupLeft", "check"],
    ["hours", "clock"],
  ],
};

/** Words cut to fit a chip: whole up to the cap, else the first letters and an ellipsis. */
function clipWords(s: string, cap: number): string {
  const w = s.replace(/\s+/g, " ").trim();
  return w.length > cap ? `${w.slice(0, cap - 1).trimEnd()}…` : w;
}

/**
 * Questions the workspace can answer today, for where the person is. Built from the data, in the person's language,
 * never from a seed; a workspace with no missed call is not offered a question about missed calls.
 */
export function buildAskSuggestions(input: SuggestionInput): AskSuggestion[] {
  const t = T[input.language === "es" ? "es" : "en"];
  // A page with no chips of its own yet is offered those it was offered before it had a name.
  const at: AskSurface = CHIPS_OF[input.surface] ?? input.surface;
  const out: AskSuggestion[] = [];
  const add = (q: string, kind: AskSuggestion["kind"], icon: string, fast = false, label?: string) => {
    if (!out.some((s) => s.q === q)) out.push({ q, kind, icon, fast, ...(label ? { label } : {}) });
  };
  const s = input.scope;
  if (s && (s.kind === "thread" || s.kind === "conversation" || s.kind === "person")) {
    add(t.said.replace("{name}", s.label), "ask", "chat");
    if (s.kind === "thread") add(t.why, "ask", "sparkle");
  }
  if (s && s.kind === "call") add(t.live, "ask", "phone");
  // On Leads the page's own chips come first: the first day's ideas, each a search to propose, or the latest
  // searches' own words to find more. The section under the field keeps three, and they must be these.
  if (input.surface === "leads") {
    const ideas = (input.leadIdeas ?? []).filter(Boolean).slice(0, 3);
    for (const w of ideas) add(w, "ask", "search");
    // A search's own words can run long; the chip shows them clipped, the question sent keeps them whole.
    if (!ideas.length)
      for (const a of (input.leadSearches ?? []).filter(Boolean).slice(0, 2))
        add(t.moreLike.replace("{asked}", a), "ask", "search", false, t.moreLike.replace("{asked}", clipWords(a, 40)));
  }
  if (input.needsYou > 0) add(t.needs, "ask", "inbox", true);
  if (input.heldDrafts > 0) add(t.held, "ask", "clock");
  if (input.liveNow > 0) add(t.live, "ask", "phone");
  if (input.missedToday > 0) add(t.calls, "ask", "phone", true);
  if (input.hasCalendar) add(input.surface === "today" ? t.openTomorrow : t.openSat, "ask", "calendar", true);
  for (const [key, icon] of PAGE_QUESTIONS[at] ?? []) add(t[key], "ask", icon);
  // Conversations and Live ask about today's calls, answered without a model when one was missed.
  if (at === "live" || at === "conversations") add(t.calls, "ask", "phone", input.missedToday > 0);
  // Deals are a thing here (0004): who has a proposal out, where people are looked at.
  if (input.dealsOn && (at === "people" || at === "other")) add(t.proposals, "ask", "trending-up");
  if (input.needsYou === 0) add(t.needs, "ask", "inbox", true);
  add(t.week, "ask", "trending-up");
  add(t.rules, "ask", "shield");
  const asks = out.slice(0, 7);
  if (!input.canAct) return asks;
  // The Act group: each becomes a card, never an action. A scoped person gets
  // the two that name them; the rest are the settings an owner changes from
  // the floor, left for the person to finish in the input.
  const acts: AskSuggestion[] = [];
  const act = (label: string, q: string, icon: string, compose = false) => {
    if (!acts.some((a) => a.q === q)) acts.push({ q, kind: "act", icon, label, compose });
  };
  if (s && (s.kind === "thread" || s.kind === "conversation" || s.kind === "person")) {
    act(t.actLate.replace("{name}", s.label), t.actLateQ.replace("{name}", s.label), "chat");
    act(t.actDraft.replace("{name}", s.label), t.actDraftQ.replace("{name}", s.label), "edit", true);
  }
  act(t.actRemember, t.actRememberQ, "sparkle", true);
  if (input.surface === "settings" || input.surface === "today") act(t.actClose, t.actCloseQ, "calendar", true);
  if (input.surface === "settings") act(t.actHours, t.actHoursQ, "clock", true);
  if (input.surface === "settings") act(t.actInvite, t.actInviteQ, "users", true);
  if (input.surface === "inbox" || input.heldDrafts > 0) act(t.actHold, t.actHoldQ, "shield");
  if (at === "people" || at === "other") act(t.actOffer, t.actOfferQ, "wave", true);
  if (at === "people" || at === "other") act(t.actPlaybook, t.actPlaybookQ, "bolt");
  return [...asks, ...acts.slice(0, 4)];
}
