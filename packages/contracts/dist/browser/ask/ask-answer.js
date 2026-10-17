import { ASK_CAPS } from "./ask.js";
import {
  FOLLOWUP_ECHO,
  answerText,
  cleanAnswer,
  firstSentence,
  navigateLabel,
  opensWithBlock,
  sameQuestion
} from "./answer-text.js";
import { CALENDAR_SETTING_ROUTE } from "../setup/calendar-source.js";
import {
  ASK_CITATION_KINDS,
  citationRoute,
  groundCitations
} from "./citations.js";
import { cardOpenRoute } from "../ask-proposals/page-specs.js";
import { planCountWords } from "./plan-steps.js";
import { rightNowCounts, rightNowLine } from "./ask-waiting.js";
import { canonicalRoute } from "../shell/address.js";
export const ASK_LIST_STYLES = ["bullets", "numbers", "lines"];
export const ASK_ANSWER_CAPS = {
  headline: 160,
  detail: 3e3,
  figures: 4,
  items: 5,
  parts: 4,
  entries: 25,
  entry: 240,
  next: 2,
  value: 24,
  label: 60,
  note: 60,
  title: 80,
  meta: 60,
  line: 160,
  question: 90,
  /** A plan's words, which the server writes (decision 0055): what no card carries comes first, so a cut keeps it. */
  plan: 700
};
const noList = () => ({ style: "bullets", entries: [] });
export function storedAnswer(a) {
  return a.show.list ? a : { ...a, show: { ...a.show, list: noList() } };
}
const cutAt = (t, n) => {
  if (t.length <= n) return t;
  const cut = t.slice(0, n - 1);
  const space = cut.search(/\s\S*$/);
  return `${(space > n / 2 ? cut.slice(0, space) : cut).trimEnd()}\u2026`;
};
export const clip = (s, n) => cutAt((s ?? "").replace(/\s+/g, " ").trim(), n);
export const clipLines = (s, n) => cutAt(
  (s ?? "").replace(/\r\n?/g, "\n").split("\n").map((l) => {
    const said = l.replace(/\s+/g, " ").trim();
    return said ? `${/^\s*/.exec(l.replace(/\t/g, "  "))?.[0] ?? ""}${said}` : "";
  }).join("\n").replace(/\n{3,}/g, "\n\n").trim(),
  n
);
const structured = (headline, language) => ({
  v: 2,
  form: "structured",
  say: { headline: clip(headline, ASK_ANSWER_CAPS.headline), detail: "" },
  show: { figures: [], items: [], breakdown: null, list: noList() },
  do: { open: null, next: [] },
  language
});
function nextQuestions(next, places) {
  const out = [];
  for (const raw of next) {
    const q = clip(raw, ASK_ANSWER_CAPS.question);
    if (!q || out.some((x) => sameQuestion(x, q))) continue;
    if (FOLLOWUP_ECHO.some(([words2, route]) => words2.test(q) && places.some((p) => route.test(p)))) continue;
    out.push(q);
    if (out.length >= ASK_ANSWER_CAPS.next) break;
  }
  return out;
}
export function oneDoor(a, cards = []) {
  const offered = /* @__PURE__ */ new Set();
  const items = a.show.items.map((it) => {
    const door = !offered.has(canonicalRoute(it.source.to));
    offered.add(canonicalRoute(it.source.to));
    return { ...it, source: { ...it.source, door } };
  });
  const open = a.do.open && !offered.has(canonicalRoute(a.do.open.to)) ? a.do.open : null;
  if (open) offered.add(canonicalRoute(open.to));
  const cardOpen = {};
  for (const c of cards) {
    const to = cardOpenRoute(c);
    cardOpen[c.id] = !!to && !offered.has(canonicalRoute(to));
    if (to && cardOpen[c.id]) offered.add(canonicalRoute(to));
  }
  const receipt = (s) => {
    if (!s) return null;
    const door = !offered.has(canonicalRoute(s.to));
    if (door) offered.add(canonicalRoute(s.to));
    return { ...s, door };
  };
  const breakdown = a.show.breakdown ? { ...a.show.breakdown, source: receipt(a.show.breakdown.source) } : null;
  const figures = a.show.figures.map((f) => ({ ...f, source: receipt(f.source) }));
  return {
    answer: {
      ...a,
      show: { figures, items, breakdown, list: a.show.list ?? noList() },
      do: { open, next: nextQuestions(a.do.next, [...offered]) }
    },
    cardOpen
  };
}
const KIND_WORDS = {
  en: {
    thread: "Thread",
    conversation: "Conversation",
    call: "Call",
    person: "Profile",
    page: "Page",
    lead: "Lead",
    search: "Search",
    deal: "Deal",
    list: "List",
    broadcast: "Broadcast",
    playbook: "Campaign",
    template: "Template",
    mailbox: "Mailbox",
    visit: "Booking",
    review: "Review"
  },
  es: {
    thread: "Hilo",
    conversation: "Conversaci\xF3n",
    call: "Llamada",
    person: "Perfil",
    page: "P\xE1gina",
    lead: "Lead",
    search: "B\xFAsqueda",
    deal: "Acuerdo",
    list: "Lista",
    broadcast: "Difusi\xF3n",
    playbook: "Campa\xF1a",
    template: "Plantilla",
    mailbox: "Buz\xF3n",
    visit: "Cita",
    review: "Rese\xF1a"
  }
};
export function answerFromV1(m) {
  const language = m.language ?? "en";
  const words2 = KIND_WORDS[language === "es" ? "es" : "en"];
  const cites = m.citations ?? [];
  const items = cites.filter((c) => c.kind !== "page").slice(0, ASK_ANSWER_CAPS.items).map((c) => ({
    title: clip(c.label, ASK_ANSWER_CAPS.title),
    meta: words2[c.kind],
    line: "",
    source: { kind: c.kind, id: c.id, label: c.label, to: c.to || citationRoute(c), door: true }
  }));
  const page = cites.find((c) => c.kind === "page");
  const nav = m.navigate && m.navigate.to ? m.navigate : null;
  const open = nav ? { to: nav.to, label: navigateLabel(nav, language) ?? nav.label, now: nav.now === true } : page ? { to: page.to || citationRoute(page), label: page.label, now: false } : null;
  return {
    v: 2,
    form: "prose",
    say: { headline: "", detail: (m.text ?? "").trim() },
    show: { figures: [], items, breakdown: null, list: noList() },
    do: { open, next: m.followups ?? [] },
    language
  };
}
export function needsAnswer(w, language) {
  const es = language === "es";
  const a = structured(rightNowLine(w, language), language);
  if (!w) {
    a.do.open = { to: "today", label: es ? "Abrir Hoy" : "Open Today", now: false };
    return a;
  }
  const all = [
    ...w.people.map((p) => ({
      title: p.who,
      meta: `${p.channel} \xB7 ${p.when}`,
      line: p.line,
      source: { kind: p.kind, id: p.id, label: p.who, to: p.to, door: true }
    })),
    ...w.searches.map((x) => ({
      title: x.name,
      meta: "Leads",
      line: x.question,
      source: { kind: "page", id: x.to, label: x.name, to: x.to, door: true }
    })),
    ...w.runs.map((r) => ({
      title: r.label,
      // The word a cited campaign's item says, in the answer's language.
      meta: KIND_WORDS[es ? "es" : "en"].playbook,
      line: es ? `${r.reach} ${r.reach === 1 ? "persona" : "personas"}` : `${r.reach} ${r.reach === 1 ? "person" : "people"}`,
      source: { kind: "page", id: r.to, label: r.label, to: r.to, door: true }
    })),
    // A reply window closing: its thread is the door, and it is never one of the people who need you.
    ...w.windows.map((p) => ({
      title: p.who,
      meta: es ? "Ventana de respuesta por cerrar" : "Reply window closing",
      line: p.line,
      source: { kind: "thread", id: p.id, label: p.who, to: p.to, door: true }
    }))
  ];
  a.show.items = all.slice(0, ASK_ANSWER_CAPS.items);
  const total = rightNowCounts(w).people;
  const shownPeople = Math.min(w.people.length, ASK_ANSWER_CAPS.items);
  if (total > shownPeople)
    a.do.open = {
      to: "inbox",
      label: es ? `Ver los ${total} en el Inbox` : `See all ${total} in the Inbox`,
      now: false
    };
  return a;
}
export function callsAnswer(missed, live, language) {
  const es = language === "es";
  const seeCalls = { to: "live", label: es ? "Ver las llamadas" : "See the calls", now: false };
  if (!missed.length) {
    const on = live.length ? es ? `; ${live.length === 1 ? "hay una llamada en curso" : `hay ${live.length} en curso`}` : `; ${live.length === 1 ? "one call is" : `${live.length} calls are`} on the line now` : "";
    const a2 = structured(`${es ? "Ninguna llamada perdida hoy" : "No missed calls today"}${on}.`, language);
    a2.do.open = seeCalls;
    return a2;
  }
  const a = structured(
    es ? `${missed.length === 1 ? "Una llamada perdida" : `${missed.length} llamadas perdidas`} hoy.` : `${missed.length === 1 ? "One missed call" : `${missed.length} missed calls`} today.`,
    language
  );
  a.show.items = missed.slice(0, ASK_ANSWER_CAPS.items).map((c) => ({
    title: c.who,
    meta: es ? "Perdida" : "Missed",
    line: "",
    source: { kind: "call", id: c.callId, label: c.who, to: `conversations/cv-${c.callId}`, door: true }
  }));
  a.do.open = seeCalls;
  return a;
}
const openingsHeadline = (days, es, asked) => {
  if (!days.length && asked)
    return es ? "No hay nada libre en el calendario ese d\xEDa." : "Nothing is open on the calendar that day.";
  if (!days.length)
    return es ? "No hay nada libre en el calendario en los pr\xF3ximos d\xEDas." : "Nothing is open on the calendar in the days ahead.";
  if (days.length === 1) {
    const n = days[0].windows.length;
    return es ? `${days[0].label}: ${n} ${n === 1 ? "hora libre" : "horas libres"} en el calendario.` : `The calendar has ${n} open ${n === 1 ? "time" : "times"} on ${days[0].label}.`;
  }
  return es ? `El calendario tiene horas libres en ${days.length} d\xEDas.` : `The calendar has open times on ${days.length} days.`;
};
function noCalendarAnswer(instead, language) {
  const es = language === "es";
  const said = instead?.by === "emails" ? es ? `Las reservas llegan por correo desde ${instead.tool} y est\xE1n en el Calendario, pero sin un enlace de calendario no veo horas libres.` : `Bookings arrive by email from ${instead.tool} and are on the Calendar, but without a calendar link I can't see open times.` : instead?.by === "hand" ? es ? "Tomas las reservas t\xFA, as\xED que no hay calendario del que leer horas libres." : "You take bookings yourself, so there is no calendar for me to read open times from." : es ? "No hay calendario conectado, as\xED que no veo horas libres." : "No calendar is connected, so I can't see open times.";
  const a = structured(said, language);
  a.say.detail = es ? "El horario est\xE1 en Ajustes." : "The hours are in Settings.";
  a.do.open = instead?.by === "emails" ? { to: "calendar", label: es ? "Abrir el Calendario" : "Open the Calendar", now: false } : { to: CALENDAR_SETTING_ROUTE, label: es ? "Conectar un calendario" : "Connect a calendar", now: false };
  return a;
}
export function openingsAnswer(o, language, day = null) {
  const es = language === "es";
  if (o.state === "no_calendar") return noCalendarAnswer(o.instead ?? null, language);
  if (o.state === "unavailable")
    return structured(
      es ? "No se pudo leer el calendario ahora." : "The calendar couldn't be read right now.",
      language
    );
  const days = o.days.filter((d) => d.windows.length);
  const a = structured(openingsHeadline(days, es, !!day), language);
  a.show.items = days.slice(0, ASK_ANSWER_CAPS.items).map((d) => ({
    title: d.label,
    meta: "",
    line: d.windows.join(" \xB7 "),
    source: { kind: "page", id: `calendar/${d.key}`, label: d.label, to: `calendar/${d.key}`, door: true }
  }));
  a.do.open = { to: "calendar", label: es ? "Abrir el Calendario" : "Open the Calendar", now: false };
  return a;
}
const C = ASK_ANSWER_CAPS;
const asObj = (v) => v && typeof v === "object" && !Array.isArray(v) ? v : {};
const asArr = (v) => Array.isArray(v) ? v : [];
const unbold = (s) => s.replace(/\*\*(.+?)\*\*|__(.+?)__/g, "$1$2");
const drawnText = (v) => unbold(cleanAnswer(typeof v === "string" ? v : ""));
const words = (v, n) => clip(drawnText(v), n);
const entry = (v) => clip(cleanAnswer(typeof v === "string" ? v.replace(/^\s*(?:[-*•·–]|\d{1,2}[.)])\s+/, "") : ""), C.entry);
export function sayAsDrawn(say) {
  const [headline, more] = firstSentence(drawnText(say.headline).replace(/\s+/g, " ").trim());
  const detail = cleanAnswer(typeof say.detail === "string" ? say.detail : "");
  const apart = opensWithBlock(detail) ? "\n\n" : " ";
  return {
    headline: clip(headline, C.headline),
    detail: clipLines(more && detail ? `${more}${apart}${detail}` : more || detail, C.detail)
  };
}
const num = (v) => typeof v === "number" && Number.isFinite(v) ? v : Number.NaN;
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const ROW_KINDS = ASK_CITATION_KINDS.filter((k) => k !== "page");
const ROW_ROUTE = /^(inbox\/th-|conversations\/cv-|outbound\/|broadcasts\/run:|clients\/leads.*:[sp]-|clients\/(?!leads(?:[/:]|$)|seg:))/;
function groundRef(v, read) {
  const r = asObj(v);
  const kind = typeof r.kind === "string" ? r.kind : "none";
  const spelled = typeof r.id === "string" ? r.id.trim().replace(/^#?\/+/, "") : "";
  if (!spelled || !ASK_CITATION_KINDS.includes(kind)) return null;
  const label = words(r.label, C.label) || spelled;
  const ids = spelled.match(UUID);
  const row = ids?.[ids.length - 1]?.toLowerCase();
  const page = row || ROW_ROUTE.test(spelled) ? [] : [{ kind: "page", id: spelled, label }];
  const tries = [
    ...kind === "page" ? page : [],
    ...[kind, ...ROW_KINDS].filter((k) => k !== "page").map((k) => ({ kind: k, id: row ?? spelled, label })),
    ...page
  ];
  const kept = groundCitations(tries, read).kept[0];
  return kept ? { ...kept, to: citationRoute(kept, read), door: true } : null;
}
export function normalizeAnswer(raw, read, fallback) {
  let json = raw;
  if (typeof raw === "string") {
    try {
      json = JSON.parse(raw);
    } catch (e) {
      return { ok: false, error: `not JSON: ${e instanceof Error ? e.message : String(e)}` };
    }
  }
  const root = asObj(json);
  const say = sayAsDrawn(asObj(root.say));
  const headline = say.headline;
  if (!headline) return { ok: false, error: "no headline" };
  const language = root.language === "en" || root.language === "es" ? root.language : fallback;
  let dropped = 0;
  const ground = (v) => {
    const s = groundRef(v, read);
    const r = asObj(v);
    if (!s && typeof r.kind === "string" && r.kind !== "none" && typeof r.id === "string" && r.id.trim()) dropped++;
    return s;
  };
  const show = asObj(root.show);
  const figures = [];
  for (const f of asArr(show.figures).map(asObj)) {
    const value = words(f.value, C.value);
    if (!value) continue;
    figures.push({ value, label: words(f.label, C.label), note: words(f.note, C.note), source: ground(f.source) });
    if (figures.length >= C.figures) break;
  }
  const items = [];
  for (const it of asArr(show.items).map(asObj)) {
    const title = words(it.title, C.title);
    const source = ground(it.source);
    if (!title || !source) continue;
    items.push({ title, meta: words(it.meta, C.meta), line: words(it.line, C.line), source });
    if (items.length >= C.items) break;
  }
  const b = asObj(show.breakdown);
  const parts = asArr(b.parts).map(asObj).map((p) => ({ label: words(p.label, C.label), value: num(p.value), warn: p.warn === true }));
  const total = num(b.total);
  const whole = words(b.label, C.label);
  const adds = !!whole && parts.length >= 2 && parts.length <= C.parts && parts.every((p) => p.label && Number.isFinite(p.value) && p.value >= 0) && Number.isFinite(total) && Math.abs(parts.reduce((s, p) => s + p.value, 0) - total) < 1e-9;
  const breakdown = adds ? { label: whole, total, parts, source: ground(b.source) } : null;
  const l = asObj(show.list);
  const list = {
    style: ASK_LIST_STYLES.find((x) => x === l.style) ?? "bullets",
    entries: asArr(l.entries).map(entry).filter(Boolean).slice(0, C.entries)
  };
  const d = asObj(root.do);
  const o = asObj(d.open);
  const at = ground(o.source);
  const open = at ? {
    to: at.to,
    label: navigateLabel({ to: at.to, label: words(o.label, C.label) || at.label }, language) ?? at.label,
    now: o.now === true
  } : null;
  const next = asArr(d.next).map((q) => words(q, C.question)).filter(Boolean).slice(0, C.next);
  return {
    ok: true,
    answer: {
      v: 2,
      form: "structured",
      say,
      show: { figures, items, breakdown, list },
      do: { open, next },
      language
    },
    dropped
  };
}
export function answerWords(a) {
  return [
    a.say.headline,
    a.say.detail,
    ...a.show.figures.flatMap((f) => [f.value, f.label, f.note]),
    ...a.show.items.flatMap((i) => [i.title, i.meta, i.line]),
    ...a.show.breakdown ? [
      a.show.breakdown.label,
      String(a.show.breakdown.total),
      ...a.show.breakdown.parts.flatMap((p) => [p.label, String(p.value)])
    ] : [],
    ...a.show.list.entries
  ].filter(Boolean).join(" ");
}
const sentence = (s) => /[.!?]$/.test(s) ? s : `${s}.`;
export function answerForCards(cards, language, words2, lead) {
  const es = language === "es";
  const n = cards.length;
  const plan = planCountWords(cards, language, words2);
  const a = structured(
    lead?.headline ?? plan.headline ?? (n === 1 ? es ? sentence(`Una tarjeta para revisar: ${cards[0].title}`) : sentence(`One card to review: ${cards[0].title}`) : es ? `${n} tarjetas para revisar.` : `${n} cards to review.`),
    es ? "es" : "en"
  );
  a.say.detail = clip(
    plan.detail ?? (n === 1 ? es ? "Apru\xE9bala, c\xE1mbiala o desc\xE1rtala: nada pasa hasta que lo hagas." : "Approve it, change it or dismiss it: nothing happens until you do." : es ? "Cada una se aprueba por separado: apru\xE9bala, c\xE1mbiala o desc\xE1rtala; nada pasa hasta que lo hagas." : "Each is its own press: approve, change or dismiss each one; nothing happens until you do."),
    ASK_ANSWER_CAPS.plan
  );
  if (lead) {
    a.do.open = { ...lead.open, now: false };
    a.do.next = lead.next.slice(0, ASK_ANSWER_CAPS.next);
  }
  return a;
}
export function failedAnswer(sentenceText, language) {
  return structured(sentenceText, language);
}
const PROSE_MAX = 1500;
export function proseAnswer(text, language) {
  return {
    v: 2,
    form: "prose",
    say: { headline: "", detail: cleanAnswer(text).slice(0, PROSE_MAX) },
    show: { figures: [], items: [], breakdown: null, list: noList() },
    do: { open: null, next: [] },
    language
  };
}
export function v1FromAnswer(a) {
  const seen = /* @__PURE__ */ new Set();
  const citations = [];
  const add = (s) => {
    if (!s || seen.has(`${s.kind}:${s.id}`)) return;
    seen.add(`${s.kind}:${s.id}`);
    citations.push({ kind: s.kind, id: s.id, label: s.label, to: s.to });
  };
  for (const i of a.show.items) add(i.source);
  for (const f of a.show.figures) add(f.source);
  add(a.show.breakdown ? a.show.breakdown.source : null);
  return {
    text: answerText(a),
    citations: citations.slice(0, ASK_CAPS.citations),
    navigate: a.do.open ? { to: a.do.open.to, label: a.do.open.label, now: a.do.open.now } : null,
    followups: a.do.next
  };
}
