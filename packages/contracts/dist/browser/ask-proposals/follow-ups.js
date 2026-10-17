export const ASK_VIEW_PAGE = "ask";
export const ASK_FOLLOW_UPS_MAX = 3;
export const FOLLOW_UP_SAID_MAX = 100;
export const FOLLOW_UP_PROMPT_MAX = 200;
export const FOLLOW_UP_WAKES = ["search_done", "replies", "date"];
const isWake = (v) => typeof v === "string" && FOLLOW_UP_WAKES.includes(v);
const clipped = (v, max) => typeof v === "string" ? v.trim().slice(0, max) : "";
function followUpOf(v) {
  if (!v || typeof v !== "object") return null;
  const r = v;
  const id = clipped(r.id, 40);
  const said = clipped(r.said, FOLLOW_UP_SAID_MAX);
  const prompt = clipped(r.prompt, FOLLOW_UP_PROMPT_MAX);
  if (!id || !said || !prompt || !isWake(r.wake)) return null;
  const subject = clipped(r.subject, 40) || null;
  const on = typeof r.on === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.on) ? r.on : null;
  if (r.wake === "date" ? !on : !subject) return null;
  return { id, said, prompt, wake: r.wake, subject, on, made_at: clipped(r.made_at, 40) };
}
export function followUpsOf(views) {
  const ask = views && typeof views === "object" ? views[ASK_VIEW_PAGE] : null;
  const list = ask && typeof ask === "object" ? ask.follow_ups : null;
  return Array.isArray(list) ? list.map(followUpOf).filter((f) => f !== null) : [];
}
const SEARCH_WAKES = /* @__PURE__ */ new Set(["ended", "waiting_on_owner"]);
export function followUpDue(f, w) {
  if (f.wake === "date") return !!f.on && f.on <= w.today;
  if (!f.subject) return false;
  if (f.wake === "search_done") {
    const state = w.searches.get(f.subject);
    return state !== void 0 && SEARCH_WAKES.has(state);
  }
  return (w.replies.get(f.subject) ?? 0) > 0;
}
