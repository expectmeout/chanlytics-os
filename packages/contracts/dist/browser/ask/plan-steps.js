import { ASK_SENDS, PROPOSAL_WORDS, rec } from "../ask-proposals/spec.js";
export const STEP_TOKEN = /^@step:(\d+)$/;
export function stepToken(n) {
  return `@step:${n}`;
}
export function resolveSteps(payload, made) {
  let unresolved = null;
  const fill = (v) => {
    if (typeof v === "string") {
      const m = STEP_TOKEN.exec(v);
      if (!m) return v;
      const n = Number(m[1]);
      const step = made[n];
      if (step && !("undone" in step) && step.id !== null) return step.id;
      unresolved ??= n;
      return v;
    }
    if (Array.isArray(v)) return v.map(fill);
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fill(x)]));
    return v;
  };
  const out = Object.fromEntries(Object.entries(payload).map(([k, x]) => [k, fill(x)]));
  return unresolved === null ? out : { unresolved };
}
export function planMadeOf(planId, cards) {
  const made = {};
  for (const p of cards) {
    if (p.plan?.id !== planId || !p.outcome) continue;
    if (p.outcome.state === "done") made[p.plan.step] = { kind: p.kind, id: p.outcome.made?.id ?? null };
    else if (p.outcome.state === "undone") made[p.plan.step] = { undone: true };
  }
  return made;
}
export function planWaits(plan, made) {
  if (!plan) return null;
  const undone = plan.after.find((n) => {
    const step = made[n];
    return !!step && "undone" in step;
  });
  if (undone !== void 0) return { undone };
  const waits = plan.after.find((n) => !made[n]);
  return waits === void 0 ? null : { waits };
}
export function cardsInPlans(cards) {
  const out = [];
  const plans = /* @__PURE__ */ new Map();
  for (const p of cards) {
    const id = p.plan?.id;
    const held = id === void 0 ? void 0 : plans.get(id);
    if (id === void 0) out.push({ card: p });
    else if (held) held.push(p);
    else {
      const group = [p];
      plans.set(id, group);
      out.push({ plan: group });
    }
  }
  return out;
}
export function sendWaitsForReview(kind, channels) {
  if (kind === "broadcast") return channels.includes("whatsapp");
  return kind === "playbook" && channels.length > 0 && channels.every((c) => c === "whatsapp");
}
function reviewedStep(p, steps) {
  const token = typeof p.payload.template_id === "string" ? STEP_TOKEN.exec(p.payload.template_id) : null;
  if (!token) return null;
  const n = Number(token[1]);
  const message = steps.get(n);
  const writesWhatsApp = message?.kind === "message" && !!rec(message.payload.versions).whatsapp;
  const channels = Array.isArray(p.payload.channels) ? p.payload.channels : [];
  return writesWhatsApp && sendWaitsForReview(p.kind, channels) ? n : null;
}
export function planGroupOf(cards) {
  const id = cards.find((p) => p.plan)?.plan?.id ?? "";
  const mine = cards.flatMap((card) => card.plan && card.plan.id === id ? [{ card, plan: card.plan }] : []).sort((a, b) => a.plan.step - b.plan.step);
  const made = planMadeOf(
    id,
    mine.map((s) => s.card)
  );
  const byStep = new Map(mine.map((s) => [s.plan.step, s.card]));
  const steps = mine.map(({ card, plan }) => {
    const wait = planWaits(plan, made);
    const undone = wait !== null && "undone" in wait;
    return {
      card,
      step: plan.step,
      of: plan.of,
      wait,
      review: undone ? null : reviewedStep(card, byStep),
      note: undone ? PROPOSAL_WORDS.planUndone : null
    };
  });
  const left = mine.filter((s) => s.plan.silent && !made[s.plan.step]).length;
  return { id, steps, left };
}
export function planCountWords(cards, language, words) {
  const said = words || null;
  const id = cards[0]?.plan?.id;
  if (id === void 0 || cards.some((p) => p.plan?.id !== id)) return { headline: null, detail: said };
  const silent = cards.filter((p) => p.plan?.silent).length;
  const sends = cards.filter((p) => !p.plan?.silent && ASK_SENDS.has(p.kind)).length;
  const waiting = cards.length - silent - sends;
  const es = language === "es";
  const one = (n, singular, plural) => `${n} ${n === 1 ? singular : plural}`;
  const parts = [
    ...silent > 0 ? [es ? one(silent, "no env\xEDa nada", "no env\xEDan nada") : one(silent, "sends nothing", "send nothing")] : [],
    ...sends > 0 ? [es ? one(sends, "env\xEDa", "env\xEDan") : one(sends, "sends", "send")] : [],
    ...waiting > 0 ? [es ? one(waiting, "espera un env\xEDo", "esperan un env\xEDo") : one(waiting, "waits for a send", "wait for a send")] : []
  ];
  const headline = es ? `Un plan de ${one(cards.length, "paso", "pasos")} para revisar: ${parts.join(" y luego ")}.` : `A plan of ${one(cards.length, "step", "steps")} to review: ${parts.join(", then ")}.`;
  if (said !== null || silent === 0) return { headline, detail: said };
  const together = es ? "Los pasos que no env\xEDan nada se aprueban con un toque" : "The steps that send nothing are approved with one press";
  const apart = es ? "; cada env\xEDo se aprueba aparte cuando est\xE9n hechos los pasos que espera" : "; each send is its own press once the steps it waits for are done";
  const after = es ? ". Nada pasa hasta que lo hagas." : ". Nothing happens until you do.";
  return { headline, detail: `${together}${sends > 0 ? apart : ""}${after}` };
}
