import { isCount, recordOrNull } from "../shared/unknown.js";
export function chainTotalsOf(answer) {
  const roots = recordOrNull(answer);
  if (!roots) return null;
  const by_root = {};
  for (const [root, value] of Object.entries(roots)) {
    const v = recordOrNull(value);
    if (!v || !isCount(v.written) || !isCount(v.wrote_back)) return null;
    if (v.businesses === void 0) by_root[root] = { written: v.written, wrote_back: v.wrote_back };
    else if (isCount(v.businesses))
      by_root[root] = { written: v.written, businesses: v.businesses, wrote_back: v.wrote_back };
    else return null;
  }
  return { complete: true, by_root };
}
export function chainTotalsFromReport(report) {
  const by_root = {};
  for (const c of report.chains) {
    const written = c.steps.reduce((sum, s) => sum + s.written, 0);
    const wrote_back = c.steps.reduce((sum, s) => sum + s.wrote_back, 0);
    const businesses = c.steps.reduce(
      (sum, s) => sum === null || s.businesses === void 0 ? null : sum + s.businesses,
      0
    );
    by_root[c.root_id] = businesses === null ? { written, wrote_back } : { written, businesses, wrote_back };
  }
  return { complete: false, by_root };
}
export function reachOutDayWords(n) {
  const clauses = [];
  if (n.written) clauses.push(`${n.written} written`);
  if (n.wrote_back) clauses.push(`${n.wrote_back} wrote back${n.interested ? `, ${n.interested} interested` : ""}`);
  if (n.booked) clauses.push(`${n.booked} booked`);
  if (n.said_no) clauses.push(`${n.said_no} said no`);
  if (n.bounced) clauses.push(`${n.bounced} bounced`);
  if (n.held) clauses.push(`${n.held} wait${n.held === 1 ? "s" : ""} for your say`);
  return { title: "Today's reach-outs", body: clauses.length ? `${clauses.join(" \xB7 ")}.` : "Nothing happened today." };
}
