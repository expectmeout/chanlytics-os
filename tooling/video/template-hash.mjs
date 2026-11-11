// What a machine image is made of, as one hash: the template's sources, the script the machine runs, the versions it was installed
// at, the drawing numbers and the face it reads from the monorepo. Node's own modules only, so the repository's test reads it with
// nothing installed here (tests/content/the-template-has-its-image.test.mjs), and image.mjs says the same hash of what it built.
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");

/** The fonts the template is set in: the posts' own files, copied beside the bundle as it is built. */
export const FACE_FILES = ["mona-sans-600.woff", "mona-sans-800.woff"];
export const FACE_DIR = "apps/dashboard/src/server/posts/fonts";

const filesUnder = (dir) =>
  fs
    .readdirSync(path.join(ROOT, dir), { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? filesUnder(`${dir}/${e.name}`) : [`${dir}/${e.name}`]));

/** Every file the image is made of, from the repository's root, in one order. */
export function templateFiles() {
  return [
    ...filesUnder("tooling/video/src"),
    ...filesUnder("tooling/video/machine"),
    "tooling/video/package-lock.json",
    "packages/contracts/src/content/piece-frame.ts",
    "packages/contracts/src/content/piece-face.generated.ts",
    ...FACE_FILES.map((f) => `${FACE_DIR}/${f}`),
  ].sort();
}

/** A text file's bytes as git keeps them: a checkout on Windows may hold its lines ended the other way. */
const bytesOf = (file) => {
  const bytes = fs.readFileSync(path.join(ROOT, file));
  return file.endsWith(".woff") ? bytes : Buffer.from(bytes.toString("utf8").split("\r\n").join("\n"));
};

/** The hash of all of it, twelve characters: enough to tell two templates apart, short enough to read. */
export function templateHash() {
  const hash = createHash("sha256");
  for (const file of templateFiles()) hash.update(file).update("\0").update(bytesOf(file)).update("\0");
  return hash.digest("hex").slice(0, 12);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log(templateHash());
