import { capitalize, plural } from "../shared/words.js";
import { personTabWord } from "./route.js";
const FIGURES = 4;
export function personFiguresOf(f) {
  if (f.thin) return [];
  const out = [];
  if (f.last) out.push({ id: "last", label: "Last contact", value: f.last.value, sub: f.last.sub, to: "history" });
  if (f.lead) out.push({ id: "lead", label: "Lead", value: f.lead.stage, sub: f.lead.since, to: "business" });
  if (f.deals.count > 0)
    out.push({
      id: "deals",
      label: "Open deals",
      value: String(f.deals.count),
      sub: f.deals.recorded ?? plural(f.deals.count, "proposal"),
      to: "deals"
    });
  if (f.step)
    out.push({ id: "step", label: "Step due", value: capitalize(f.step.day), sub: f.step.words, to: "overview" });
  if (f.emails && f.emails.out > 0)
    out.push({
      id: "emails",
      label: "Emails",
      value: `${f.emails.out} out`,
      sub: `${f.emails.back} back`,
      to: "history"
    });
  if (f.calls.count > 0)
    out.push({ id: "calls", label: "Calls", value: String(f.calls.count), sub: f.calls.minutes, to: "history" });
  if (f.visits.any)
    out.push({
      id: "visits",
      label: personTabWord("visits", f.dealsOn),
      value: f.visits.ahead > 0 ? `${f.visits.ahead} ahead` : "None ahead",
      sub: f.visits.toMark > 0 ? `${f.visits.toMark} to mark` : f.visits.kept > 0 ? `${f.visits.kept} kept` : "none marked yet",
      to: "visits"
    });
  return out.slice(0, FIGURES);
}
