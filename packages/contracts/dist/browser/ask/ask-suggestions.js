import { isWinBack } from "../playbooks/playbook-triggers.js";
const CHIPS_OF = {
  pipeline: "people",
  calendar: "other",
  campaigns: "other"
};
export const SET_UP_CAMPAIGNS = { en: "Set up my campaigns", es: "Prepara mis campa\xF1as" };
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
const PAGE_QUESTIONS = {
  // Ask speaks first (the operator, 15 Oct 2026, D7): what to do next, read from what stands out across the pages.
  today: [
    ["next", "sparkle"],
    ["brief", "sparkle"],
    ["who", "users"]
  ],
  inbox: [
    ["who", "users"],
    ["rules", "shield"]
  ],
  people: [["who", "users"]],
  reports: [["week", "trending-up"]],
  settings: [
    ["rules", "shield"],
    ["hours", "clock"]
  ],
  // What is left first, then the hours; then what Ask can do for them (the operator, D8), for someone new to it.
  start: [
    ["setupLeft", "check"],
    ["hours", "clock"],
    ["can", "sparkle"]
  ]
};
function clipWords(s, cap) {
  const w = s.replace(/\s+/g, " ").trim();
  return w.length > cap ? `${w.slice(0, cap - 1).trimEnd()}\u2026` : w;
}
function pageChips(input, t, add) {
  if (input.surface === "leads") {
    const ideas = (input.leadIdeas ?? []).filter(Boolean).slice(0, 3);
    for (const w of ideas) add(w, "ask", "search", false, clipWords(w, 48));
    if (!ideas.length)
      for (const a of (input.leadSearches ?? []).filter(Boolean).slice(0, 2))
        add(t.moreLike.replace("{asked}", a), "ask", "search", false, t.moreLike.replace("{asked}", clipWords(a, 40)));
    return false;
  }
  const rows = input.surface === "campaigns" ? input.campaigns?.rows ?? null : null;
  if (!rows) return false;
  if (rows.length === 0) {
    for (const k of ["setUp", "winBackIdea", "offerIdea"]) add(t[k], "ask", "bolt");
    return true;
  }
  const waiting = rows.find((r) => r.waiting);
  if (waiting) add(t.whyWaiting.replace("{name}", waiting.name), "ask", "clock");
  add(t.working, "ask", "trending-up");
  if (!rows.some((r) => isWinBack(r.trigger) && r.runs)) add(t.winBackIdea, "ask", "bolt");
  return true;
}
export function buildAskSuggestions(input) {
  const t = T[input.language === "es" ? "es" : "en"];
  const at = CHIPS_OF[input.surface] ?? input.surface;
  const out = [];
  const add = (q, kind, icon, fast = false, label) => {
    if (!out.some((s2) => s2.q === q)) out.push({ q, kind, icon, fast, ...label ? { label } : {} });
  };
  const s = input.scope;
  if (s && (s.kind === "thread" || s.kind === "conversation" || s.kind === "person")) {
    add(t.said.replace("{name}", s.label), "ask", "chat");
    if (s.kind === "thread") add(t.why, "ask", "sparkle");
  }
  if (s && s.kind === "call") add(t.live, "ask", "phone");
  const winBackSaid = pageChips(input, t, add);
  if (input.needsYou > 0) add(t.needs, "ask", "inbox", true);
  if (input.heldDrafts > 0) add(t.held, "ask", "clock");
  if (input.liveNow > 0) add(t.live, "ask", "phone");
  if (input.missedToday > 0) add(t.calls, "ask", "phone", true);
  if (input.hasCalendar) add(input.surface === "today" ? t.openTomorrow : t.openSat, "ask", "calendar", true);
  for (const [key, icon] of PAGE_QUESTIONS[at] ?? []) add(t[key], "ask", icon);
  if (at === "live" || at === "conversations") add(t.calls, "ask", "phone", input.missedToday > 0);
  if (input.hasDeals && (at === "people" || at === "other")) add(t.proposals, "ask", "trending-up");
  if (input.needsYou === 0) add(t.needs, "ask", "inbox", true);
  add(t.week, "ask", "trending-up");
  add(t.rules, "ask", "shield");
  const asks = out.slice(0, 7);
  if (!input.canAct) return asks;
  const acts = [];
  const act = (label, q, icon, compose = false) => {
    if (!acts.some((a) => a.q === q)) acts.push({ q, kind: "act", icon, label, compose });
  };
  if (s && (s.kind === "thread" || s.kind === "conversation" || s.kind === "person")) {
    act(t.actLate.replace("{name}", s.label), t.actLateQ.replace("{name}", s.label), "chat");
    act(t.actDraft.replace("{name}", s.label), t.actDraftQ.replace("{name}", s.label), "edit", true);
  }
  act(t.actRemember, t.actRememberQ, "sparkle", true);
  if (input.surface === "settings" || input.surface === "today") act(t.actClose, t.actCloseQ, "calendar", true);
  if (input.surface === "settings") act(t.actHours, t.actHoursQ, "clock", true);
  if (input.surface === "inbox" || input.heldDrafts > 0) act(t.actHold, t.actHoldQ, "shield");
  if (at === "people" || at === "other") act(t.actOffer, t.actOfferQ, "wave", true);
  if ((at === "people" || at === "other") && !winBackSaid) act(t.actPlaybook, t.actPlaybookQ, "bolt");
  return [...asks, ...acts.slice(0, 4)];
}
