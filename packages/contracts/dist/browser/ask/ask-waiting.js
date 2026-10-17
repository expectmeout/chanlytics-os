import { runsWaitingSentence } from "../shell/campaign-rooms.js";
const names = (list, total, es) => {
  if (total <= 2 && list.length === total) return list.join(es ? " y " : " and ");
  const [a, b] = list;
  if (a === void 0 || b === void 0)
    return es ? `${total} ${total === 1 ? "persona" : "personas"}` : `${total} ${total === 1 ? "person" : "people"}`;
  const rest = total - 2;
  return es ? `${a}, ${b} y ${rest} m\xE1s` : `${a}, ${b} and ${rest} ${rest === 1 ? "other" : "others"}`;
};
const unreadQueueWords = (es) => es ? "La cola de hoy a\xFAn no se ha le\xEDdo." : "Today's queue hasn't been read yet.";
function runsClause(n, es) {
  if (!n) return "";
  if (es) return `${n === 1 ? "un env\xEDo de campa\xF1a espera" : `${n} env\xEDos de campa\xF1a esperan`} tu decisi\xF3n`;
  const sentence = runsWaitingSentence(n);
  return `${sentence.charAt(0).toLowerCase()}${sentence.slice(1, -1)}`;
}
function searchesClause(w, es) {
  const k = w.searches.length;
  const [one] = w.searches;
  if (!k) return "";
  if (k === 1 && one)
    return es ? `tu b\xFAsqueda de ${one.name} espera tu respuesta` : `your search for ${one.name} is waiting for your answer`;
  return es ? `${k} b\xFAsquedas esperan tu respuesta` : `${k} searches are waiting for your answer`;
}
function windowsClause(w, es) {
  const n = w.windows.length;
  const [one] = w.windows;
  if (!n) return "";
  if (n === 1 && one)
    return es ? `la ventana de respuesta de ${one.who} se est\xE1 cerrando` : `${one.who}'s reply window is closing`;
  return es ? `${n} ventanas de respuesta se est\xE1n cerrando` : `${n} reply windows are closing`;
}
export function rightNowLine(w, language) {
  const es = language === "es";
  if (!w) return unreadQueueWords(es);
  const who = w.people.map((p) => p.who);
  const total = who.length + w.more;
  const people = total ? es ? `${names(who, total, true)} ${total === 1 ? "te espera" : "te esperan"}` : `${names(who, total, false)} ${total === 1 ? "needs" : "need"} you` : "";
  const clauses = [people, runsClause(w.runs.length, es), searchesClause(w, es), windowsClause(w, es)].filter(Boolean);
  if (!clauses.length) return es ? "Nadie te espera ahora mismo." : "Nobody needs you right now.";
  const s = clauses.join("; ");
  return `${s.charAt(0).toUpperCase()}${s.slice(1)}.`;
}
export function rightNowCounts(w) {
  return w ? { people: w.people.length + w.more, runs: w.runs.length, searches: w.searches.length, windows: w.windows.length } : { people: 0, runs: 0, searches: 0, windows: 0 };
}
