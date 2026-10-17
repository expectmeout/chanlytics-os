import { dayIntervals as spansOfDay } from "../../calendar/availability.js";
import { DAYS, DAY_NAMES } from "./config-rules.js";
const DAY_LABEL = DAY_NAMES;
function dayIntervals(h) {
  return spansOfDay(h).map(([open, close]) => ({ open, close }));
}
export function joinList(parts) {
  if (parts.length < 3) return parts.join(" and ");
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}
function dayText(h) {
  const spans = dayIntervals(h);
  if (spans.length) {
    const open = joinList(spans.map((x) => `${x.open}\u2013${x.close}`));
    const gaps = spans.slice(1).map((x, i) => `${spans[i].close}\u2013${x.open}`);
    return gaps.length ? `${open} (closed ${joinList(gaps)})` : open;
  }
  const saidSomething = !!(h?.open || h?.close || h?.intervals?.length);
  return saidSomething ? "Hours not confirmed \u2014 ask them to call" : "Closed";
}
export function hoursRuns(hours) {
  if (!hours) return [];
  const spans = DAYS.map((d) => ({ day: d, text: dayText(hours[d]) }));
  const out = [];
  let i = 0;
  while (i < spans.length) {
    let j = i;
    while (j + 1 < spans.length && spans[j + 1].text === spans[i].text) j++;
    out.push({ from: spans[i].day, to: spans[j].day, text: spans[i].text });
    i = j + 1;
  }
  return out;
}
export function hoursLines(hours) {
  return hoursRuns(hours).map((r) => {
    const label = r.from === r.to ? DAY_LABEL[r.from] : `${DAY_LABEL[r.from]}\u2013${DAY_LABEL[r.to]}`;
    return `${label}: ${r.text}`;
  });
}
