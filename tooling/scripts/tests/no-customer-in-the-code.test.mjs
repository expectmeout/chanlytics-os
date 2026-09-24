/**
 * No customer in the code.
 *
 * CLAUDE.md: "A real business's name, number, link or prompt is configuration, never a literal." The first customer's
 * name, street, three phone numbers and booking link sat in about 140 tracked files, as fixtures, comments and docs,
 * until they became one made-up salon: Marisa's Beauty Salon, numbers in the 555-01xx range kept for fiction, and
 * links at example.com. This keeps the real ones out.
 *
 * It reads every tracked file but `supabase/migrations`, which seeded that workspace and is forward-only history, and
 * fails on:
 *  - a word that starts with the customer's name or street, in any case and however it is joined: a possessive, a
 *    slug, a domain, `NAME_INPUTS`, `getNameConfig`;
 *  - one of the three numbers, however it is punctuated: `+1 (NNN) NNN-NNNN`, `NNN NNN NNNN`, `1NNNNNNNNNN`, or a
 *    regex's `\(NNN\) NNN-NNNN`;
 *  - the booking site's id for the business, as a number of its own.
 *
 * It holds SHA-256 digests, not the details, so this file is not itself a copy of what it forbids, and a search for
 * the name finds nothing here. To guard one more value, lowercased the way the scan compares it:
 *   node -e "console.log(require('node:crypto').createHash('sha256').update(process.argv[1]).digest('hex'))" <value>
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { ROOT } from "./_source.mjs";

const sha256 = (s) => createHash("sha256").update(s).digest("hex");
const seen = new Map();
/** One digest per distinct string: most words and numbers in the tree recur. */
const digest = (s) => {
  let d = seen.get(s);
  if (d === undefined) seen.set(s, (d = sha256(s)));
  return d;
};

/** The first customer, as digests. */
const CUSTOMER = {
  /** Its first name and its street, each as the first six letters of a word. */
  words: new Set([
    "60118743f6bbdaed69daa9b6d2a4bb34b2fcf333dac23141e072dc1815adc52b",
    "33a67e27da42ff0014ae596a09348b7f2dde20abc9911fb5f02dabf480e84e48",
  ]),
  /** The line its receptionist answers, the number it keeps, and its WhatsApp line, as ten digits. */
  phones: new Set([
    "21d7506ae93881e651ceb491a4a547a167e79faaf68ae333de4279e2a6331d87",
    "45bb14b5a154b39106afa484aad7afd41356ec2ea9cedda6877a9adc071447af",
    "e0e964e8fefaf28262a297187b3841a87d07bc62222f9dc47c0bb5bd1c03cf02",
  ]),
  /** Its booking site's id. */
  ids: new Set(["13bdc0a76e3b2a952d952ff41677e47a26f93bf8a3b44b832bb91c001642022f"]),
};

const WORD = 6;
const PHONE = 10;
const ID = 7;

/**
 * Each place in `text` that writes a guarded value, as `line: what`. A word is a run of letters, split where camelCase
 * steps up; a phone is a run of digits that punctuation of up to three characters may break, the way a number is
 * written; an id is a run of digits on its own.
 */
function scan(text, guarded) {
  const found = [];
  text.split(/\r?\n/).forEach((line, i) => {
    const at = (what) => found.push(`${i + 1}: ${what}`);
    for (const [run] of line.matchAll(/[A-Za-z]+/g)) {
      for (const word of run.split(/(?<=[a-z])(?=[A-Z])/)) {
        if (word.length >= WORD && guarded.words.has(digest(word.slice(0, WORD).toLowerCase()))) at(`"${word}"`);
      }
    }
    for (const [run] of line.matchAll(/\d(?:\d|[\s().\\+-]{1,3}(?=\d))*/g)) {
      const digits = run.replace(/\D/g, "");
      for (let k = 0; k + PHONE <= digits.length; k++) {
        if (guarded.phones.has(digest(digits.slice(k, k + PHONE)))) {
          at(`"${run.trim()}"`);
          break;
        }
      }
    }
    for (const [run] of line.matchAll(/\d+/g)) {
      if (run.length === ID && guarded.ids.has(digest(run))) at(`"${run}"`);
    }
  });
  return found;
}

test("the scan finds a guarded value however it is written, and nothing beside it", () => {
  // Proved on the made-up salon's own values, so this file names no real one.
  const madeUp = {
    words: new Set([sha256("marisa")]),
    phones: new Set([sha256("3055550123")]),
    ids: new Set([sha256("4471902")]),
  };
  const hit = (s) => scan(s, madeUp).length > 0;
  for (const s of [
    "Marisa's Beauty Salon",
    "Marisa’s Beauty Salon",
    "/w/marisas-beauty-salon/",
    "https://marisasbeautysalon.example.com",
    "MARISA_INPUTS",
    "getMarisaConfig",
    "t-marisa",
    "+13055550123",
    "+1 (305) 555-0123",
    "305 555 0123",
    "305-555-0123",
    "305.555.0123",
    "13055550123",
    String.raw`/\+1 \(305\) 555-0123/`,
    "https://wa.me/13055550123?text=YES",
    "https://book.example.com/en-us/4471902_marisa-s",
    "4471902",
  ]) {
    assert.ok(hit(s), `missed ${s}`);
  }
  for (const s of ["Marissa", "Mari sa", "+13055550124", "305 555 012", "305, 555, 0123", "44719021", "14471902"]) {
    assert.ok(!hit(s), `found one in ${s}`);
  }
  assert.deepEqual(scan("one\r\ntwo Marisa\nthree 305-555-0123", madeUp), ['2: "Marisa"', '3: "305-555-0123"']);
});

test("no customer's name, street, number or booking link is written anywhere but the migrations", () => {
  const files = execFileSync("git", ["ls-files", "-z"], { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 26 })
    .split("\0")
    .filter((f) => f && !f.startsWith("supabase/migrations/"));
  assert.ok(files.length > 500, `git ls-files listed ${files.length} files, so a clean scan would prove nothing`);
  const found = [];
  for (const file of files) {
    let text;
    try {
      text = readFileSync(path.join(ROOT, file), "utf8");
    } catch {
      continue; // tracked, but deleted in this working tree
    }
    if (text.includes("\0")) continue; // an image, a font
    for (const where of scan(text, CUSTOMER)) found.push(`${file}:${where}`);
  }
  assert.deepEqual(
    found,
    [],
    `a real business's details, written where only configuration may hold them:\n${found.join("\n")}`,
  );
});
