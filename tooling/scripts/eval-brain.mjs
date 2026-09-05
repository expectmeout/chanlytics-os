/**
 * Run the WhatsApp receptionist's evaluation set against a deployed edge.
 *
 *   BASE_URL=https://chanlytics-messaging.vercel.app DIAG_KEY=… TENANT_ID=… \
 *     node tooling/scripts/eval-brain.mjs [tooling/evals/whatsapp-cases.json]
 *
 * Nothing is sent to a customer and nothing is written: the edge runs the
 * brain on each case with the workspace's real composed prompt and hands the
 * record back; the judging happens here (eval-judge.mjs). Each case is one
 * model call, so the set is small and the run is deliberate. The full
 * exchange is saved under tooling/backups/ (ignored), never committed.
 *
 * Exit 0 = every case passed. 1 = failures listed. 2 = could not run.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { judgeCase, validateCases, formatReport } from "./eval-judge.mjs";

const BASE = process.env.BASE_URL || "https://chanlytics-messaging.vercel.app";
const KEY = process.env.DIAG_KEY;
const TENANT = process.env.TENANT_ID;
const file = process.argv[2] || "tooling/evals/whatsapp-cases.json";
if (!KEY || !TENANT) { console.error("DIAG_KEY and TENANT_ID are required"); process.exit(2); }

const cases = JSON.parse(readFileSync(file, "utf8"));
const problems = validateCases(cases);
if (problems.length) { console.error("case set problems:\n  " + problems.join("\n  ")); process.exit(2); }

const BATCH = 6;
const results = [];
for (let i = 0; i < cases.length; i += BATCH) {
  const batch = cases.slice(i, i + BATCH).map(({ id, text, history }) => ({ id, text, ...(history ? { history } : {}) }));
  const res = await fetch(`${BASE}/api/admin/eval`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-diag-key": KEY },
    body: JSON.stringify({ tenant_id: TENANT, cases: batch }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) { console.error(`edge refused batch ${i / BATCH + 1}: HTTP ${res.status} ${data.error ?? ""}`); process.exit(2); }
  results.push(...data.results);
  process.stderr.write(`batch ${i / BATCH + 1}: ${batch.length} cases, prompt ${data.prompt_chars} chars\n`);
}

const report = formatReport(cases, results);
console.log(report.text);
mkdirSync("tooling/backups", { recursive: true });
const out = `tooling/backups/eval-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
writeFileSync(out, JSON.stringify({ base: BASE, tenant: TENANT, file, at: new Date().toISOString(), cases, results, judged: cases.map((c) => ({ id: c.id, ...judgeCase(c, results.find((r) => r.id === c.id)) })) }, null, 2));
console.log(`saved ${out}`);
process.exit(report.passed === report.total ? 0 : 1);
