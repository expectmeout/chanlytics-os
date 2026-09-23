/**
 * The model gate's blind review (docs/superpowers/specs/2026-09-23-ask-the-line-design.md, 8.3): two eval backups,
 * one per model, become the pairs the owner reads side by side with the models hidden.
 *
 * Each question's two answers are drawn as the Line draws them (oneDoor: one door per place), with the cards' words
 * and nothing that could name the model: no tools, no timings, no ids. Which side holds which model is decided by a
 * hash of the question and the runs, and written to a key file the review page never sees.
 *
 *   node tooling/scripts/eval-ask-pairs.mjs <backup-a.json> <backup-b.json> [id,id,…]
 *
 * Writes tooling/backups/eval-ask-review-<when>.json (the pairs) and …-key.json (the sides).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { oneDoor } from "@chanlytics/contracts";

/** The twelve (spec 8.3): counts, who, what and why, open, a request to act, and Spanish. */
const REVIEW_IDS = [
  "week_report",
  "who_said_yes",
  "needs_me_en",
  "who_wrote_today",
  "receptionist_said",
  "rules",
  "open_transcript",
  "show_profile",
  "propose_reply",
  "start_winback",
  "offer_to_quiet",
  "spanish_thread",
];

const [fileA, fileB, only] = process.argv.slice(2);
if (!fileA || !fileB) {
  console.error("two eval backups are required: node tooling/scripts/eval-ask-pairs.mjs <a.json> <b.json> [ids]");
  process.exit(2);
}
const ids = only ? only.split(",") : REVIEW_IDS;

const load = (file) => {
  const run = JSON.parse(readFileSync(file, "utf8"));
  const models = Object.keys(run.usage?.byModel ?? {});
  if (models.length !== 1) throw new Error(`${file}: one model expected in its usage, got ${JSON.stringify(models)}`);
  return { file, at: run.at, model: models[0], byId: new Map(run.results.map((r) => [r.id, r])) };
};
const a = load(fileA);
const b = load(fileB);
if (a.model === b.model) throw new Error(`both runs answered on ${a.model}; the review needs two models`);

/** FNV-1a over a string: the same question and the same two runs always land on the same sides. */
const hash = (s) => {
  let h = 0x811c9dc5;
  for (const ch of s) h = Math.imul(h ^ ch.codePointAt(0), 0x01000193) >>> 0;
  return h;
};

/** One run's answer to a question, as the page draws it. A turn that failed shows its sentence, marked. */
const side = (run, id) => {
  const r = run.byId.get(id);
  if (!r) throw new Error(`${run.file} has no result for ${id}`);
  const m = r.message;
  if (!m?.answer) return { failed: true, answer: null, cards: [] };
  const cards = (m.proposals ?? []).map((p) => ({ id: p.id, kind: p.kind, title: p.title, summary: p.summary }));
  const { answer, cardOpen } = oneDoor(m.answer, m.proposals ?? []);
  return { failed: !!m.failed, answer, cards: cards.map((c) => ({ ...c, open: !!cardOpen[c.id] })) };
};

const questions = [];
const sides = {};
for (const id of ids) {
  const text = a.byId.get(id)?.text ?? b.byId.get(id)?.text;
  const aLeft = hash(`${id}|${a.at}|${b.at}`) % 2 === 0;
  const left = aLeft ? side(a, id) : side(b, id);
  const right = aLeft ? side(b, id) : side(a, id);
  questions.push({ id, text, left, right });
  sides[id] = { left: aLeft ? "a" : "b", right: aLeft ? "b" : "a" };
}

const when = new Date().toISOString().replace(/[:.]/g, "-");
const review = `tooling/backups/eval-ask-review-${when}.json`;
const key = `tooling/backups/eval-ask-review-${when}-key.json`;
writeFileSync(review, JSON.stringify({ made_at: new Date().toISOString(), questions }, null, 2));
writeFileSync(
  key,
  JSON.stringify(
    { made_at: new Date().toISOString(), models: { a: a.model, b: b.model }, runs: { a: a.file, b: b.file }, sides },
    null,
    2,
  ),
);
console.log(`${questions.length} pairs: ${review}\nthe key (which side is which model): ${key}`);
