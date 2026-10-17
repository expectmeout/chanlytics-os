import { appointmentWordWhere, appointmentWords } from "../journey/appointment-word.js";
const PERSON_TABS = ["overview", "history", "visits", "deals", "campaigns", "about"];
export const PERSON_TAB_WORDS = {
  overview: "Overview",
  history: "History",
  visits: "Appointments",
  deals: "Deals",
  campaigns: "Campaigns",
  about: "About"
};
export function personTabWord(id, dealsOn) {
  return id === "visits" ? appointmentWords(appointmentWordWhere(dealsOn)).Many : PERSON_TAB_WORDS[id];
}
export const PERSON_TABS_LABEL = "Their page";
export const PERSON_FIGURES_LABEL = "At a glance";
export function personRouteOf(param) {
  const slash = param.indexOf("/");
  if (slash < 0) return { id: param, tab: "overview" };
  const id = param.slice(0, slash);
  const word = param.slice(slash + 1).split(/[/?#]/)[0] ?? "";
  const tab = PERSON_TABS.includes(word) ? word : "overview";
  return { id, tab };
}
export function personTabRoute(id, tab) {
  return tab === "overview" ? `clients/${id}` : `clients/${id}/${tab}`;
}
export function personTabsOf(f, phone) {
  if (f.thin) return [];
  const tab = (id, count) => ({
    id,
    label: personTabWord(id, f.dealsOn),
    count: phone ? null : count,
    to: personTabRoute(f.id, id)
  });
  const tabs = [tab("overview", null)];
  if (f.history > 0) tabs.push(tab("history", f.history));
  if (f.visits > 0 || (f.marked ?? 0) > 0) tabs.push(tab("visits", f.visits > 0 ? f.visits : null));
  if (!phone && f.deals > 0) tabs.push(tab("deals", f.deals));
  if (!phone && f.campaigns > 0) tabs.push(tab("campaigns", null));
  if (phone) tabs.push(tab("about", null));
  return tabs;
}
