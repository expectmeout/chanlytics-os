/**
 * The report's days as the frozen answers hold them (ask-tool-names.test.mjs): by_day holds every day of its period since
 * 2 Nov 2026, each with its month, where those bytes hold the last fourteen by the day's number, and a long period says
 * by_week beside it. Cut back here, so the rest of a report is compared byte for byte.
 */
export function withoutWholeDays(tool, got) {
  if (tool !== "report") return got;
  const { by_week: _weeks, ...said } = JSON.parse(got.result);
  if (!said.by_day) return got;
  const days = said.by_day.slice(-14).map((d) => ({ ...d, day: d.day.split(" ")[1] }));
  return { ...got, result: JSON.stringify({ ...said, by_day: days }) };
}
