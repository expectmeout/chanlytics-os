// Builds the machine image a made video is drawn on, and proves it draws (README.md). Run from this folder, after `npm ci`, with
// a Vercel sign-in for the edge's project in the environment (VERCEL_OIDC_TOKEN; README.md says how). No key or token is printed.
//
//   node image.mjs build                 bundle the template, set up a cold machine, keep it as an image that never expires,
//                                        then start from the image and draw the proof: one of every kind of block, and
//                                        "Hook first" as an edge a deploy behind asks for it. Prints one JSON line: the image's id,
//                                        the template's hash and the proof's size. The proof is kept at build/proof.mp4.
//   node image.mjs try <image> <job.json> [file ...]
//                                        start from an image and draw a job (machine/make.mjs's own input), with local files
//                                        put beside the template first. For working on the template. Kept at build/try.mp4.
//   node image.mjs delete <image>        let an image go.
//
// The machine is stopped whatever happens. An image costs a few cents a month to keep and nothing while no video is drawn.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import { addBundleToSandbox, createSandbox } from "@remotion/vercel";
import { Sandbox, Snapshot } from "@vercel/sandbox";
import { FACE_DIR, FACE_FILES, templateHash } from "./template-hash.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const BUILD = path.join(HERE, "build");
const BUNDLE_ON_MACHINE = "remotion-bundle";
/** Eight cores: four drew a 12-second video in 20 to 33 seconds and once stalled; eight in 13 to 19 (the timed test, 10 Nov 2026). */
const VCPUS = 8;
const MIN_MS = 60 * 1000;

const log = (line) => console.error(line);
const timed = async (name, work) => {
  const t0 = Date.now();
  const result = await work();
  log(`  ${name}: ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  return result;
};

/** The bundle, built from the sources as they stand: checked by the compiler first, the face copied beside it. */
async function bundled() {
  // The workspace's one TypeScript (the catalog's): this folder keeps no compiler of its own.
  execFileSync(process.execPath, [path.join(HERE, "../../node_modules/typescript/bin/tsc"), "--noEmit"], {
    cwd: HERE,
    stdio: "inherit",
  });
  const fonts = path.join(HERE, "public/fonts");
  fs.mkdirSync(fonts, { recursive: true });
  for (const file of FACE_FILES) fs.copyFileSync(path.join(ROOT, FACE_DIR, file), path.join(fonts, file));
  const out = path.join(BUILD, "bundle");
  fs.rmSync(out, { recursive: true, force: true });
  await bundle({
    entryPoint: path.join(HERE, "src/index.tsx"),
    outDir: out,
    publicDir: path.join(HERE, "public"),
    onProgress: () => {},
  });
  // A render reads the main source map when it reports an error, and no other: the rest is most of the bytes.
  const slim = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) slim(full);
      else if (e.name.endsWith(".map") && e.name !== "bundle.js.map") fs.rmSync(full);
    }
  };
  slim(out);
  return out;
}

/**
 * The renderer's setup leaves the system library its compositor needs in /tmp, which an image does not keep. Moved beside the
 * bundle, the compositor pointed at it there, and the copy in /tmp removed, so the proof cannot pass on what an image loses.
 */
const KEEP_GLIBC = `
set -euo pipefail
KEEP="$PWD/glibc235"
BIN="$(find -L node_modules/.pnpm -path '*compositor-linux-x64*' -name remotion -type f 2>/dev/null | head -1)"
[ -n "$BIN" ] || { echo "no compositor found"; exit 1; }
rm -rf "$KEEP" && cp -a /tmp/glibc235 "$KEEP" && rm -rf /tmp/glibc235
patchelf --set-interpreter "$KEEP/lib/x86_64-linux-gnu/ld-linux-x86-64.so.2" --force-rpath --set-rpath "$KEEP/lib/x86_64-linux-gnu:\\$ORIGIN" "$BIN"
echo "compositor reads $(patchelf --print-interpreter "$BIN")"
`;

const said = async (finished) => `${await finished.stdout()}${await finished.stderr()}`.trim();

/** One job run on a machine to its end: what it said when done, or its error. */
async function ran(sandbox, job, name) {
  await sandbox.writeFiles([{ path: `piece/${name}.json`, content: Buffer.from(JSON.stringify(job)) }]);
  const done = await sandbox.runCommand("node", ["make.mjs", `piece/${name}.json`]);
  if (done.exitCode !== 0) throw new Error(`${name} failed: ${(await said(done)).slice(0, 800)}`);
  const progress = await sandbox.readFileToBuffer({ path: "piece/progress.json" });
  return JSON.parse(progress.toString("utf8"));
}

/** What both proofs wear: the frame, the opening words, the end card. */
const PROOF_WORN = {
  width: 1080,
  height: 1920,
  fps: 30,
  words: { lines: ["The image draws.", "Mmm, wide words"], top: 330, size: 96, frames: 90 },
  end: {
    line: "Made by its proof",
    under: "Nothing here is a business's",
    logo: false,
    name: "Proof",
    book: null,
    address: null,
  },
  accent: "#e8b84a",
};

/**
 * The proof's job: a clip made of nothing, then one of every kind of block drawn from it (a stretch, a photo, a pair of two of
 * its moments, a words card, a quote over a moment), so an image that cannot draw one of them is never kept.
 */
const PROOF_MATERIAL = {
  timeline: {
    ...PROOF_WORN,
    frames: 90 + 60 + 75 + 45 + 90 + 66 - 8,
    blocks: [
      { is: "clip", source: "proof", trim: 6, frames: 90, label: "A caption" },
      { is: "photo", source: "photo", frames: 60, label: null },
      {
        is: "pair",
        before: { source: "proof", at: 1 },
        after: { source: "proof", at: 9 },
        frames: 75,
        labels: ["Before", "After"],
      },
      { is: "words", lines: ["Every block", "draws."], size: 120, frames: 45 },
      {
        is: "quote",
        lines: ["Nothing here", "is a business's."],
        size: 72,
        from: "Its proof",
        over: { source: "proof", at: 4 },
        frames: 90,
      },
    ],
  },
  files: [["proof.mp4"], ["proof.img"], ["proof.mp4", "proof.mp4"], [], ["proof.mp4"]],
  logo: null,
};

/** "Hook first" as an edge a deploy behind hands it: the composition it names must draw on this image too. */
const PROOF_CUTS = {
  timeline: {
    ...PROOF_WORN,
    frames: 90 + 75 + 66 - 8,
    cuts: [
      { source: "proof", trim: 6, frames: 90 },
      { source: "proof", trim: 1, frames: 75 },
    ],
  },
  cuts: ["proof.mp4", "proof.mp4"],
  logo: null,
};

/** A photo made of nothing: four pixels of one colour, under a name that says no kind, as a machine is handed a photo. */
const PROOF_PHOTO = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEUlEQVR4nGNQCchTCchjgFAAF54DiQo9+eQAAAAASUVORK5CYII=",
  "base64",
);

async function proved(snapshotId) {
  let sandbox;
  try {
    sandbox = await timed("start from the image", () =>
      Sandbox.create({
        source: { type: "snapshot", snapshotId },
        resources: { vcpus: VCPUS },
        timeout: 10 * MIN_MS,
        // Not kept between sessions: a machine that is leaves a copy of its whole disk each time it stops.
        persistent: false,
      }),
    );
    await timed("draw the proof's clip", () =>
      ran(sandbox, { composition: "sample-clip", out: "proof-clip.mp4" }, "clip"),
    );
    await sandbox.runCommand("cp", ["piece/proof-clip.mp4", `${BUNDLE_ON_MACHINE}/public/proof.mp4`]);
    await sandbox.writeFiles([{ path: `${BUNDLE_ON_MACHINE}/public/proof.img`, content: PROOF_PHOTO }]);
    const old = await timed("draw the proof as an edge a deploy behind asks", () =>
      ran(sandbox, { composition: "hook-cut", props: PROOF_CUTS, out: "proof-cuts.mp4" }, "cuts"),
    );
    if (!(old.bytes > 100_000)) throw new Error(`hook-cut's proof is ${old.bytes} bytes: nothing was drawn`);
    const done = await timed("draw the proof", () =>
      ran(sandbox, { composition: "blocks", props: PROOF_MATERIAL, out: "proof.mp4" }, "proof"),
    );
    if (!(done.bytes > 100_000)) throw new Error(`the proof is ${done.bytes} bytes: nothing was drawn`);
    const bytes = await sandbox.readFileToBuffer({ path: "piece/proof.mp4" });
    fs.mkdirSync(BUILD, { recursive: true });
    fs.writeFileSync(path.join(BUILD, "proof.mp4"), bytes);
    return done.bytes;
  } finally {
    if (sandbox) await sandbox.delete().catch(() => null);
  }
}

async function build() {
  const hash = templateHash();
  log(`building the image for template ${hash}, ${VCPUS} vCPUs`);
  const bundleDir = await timed("check and bundle the template", bundled);
  let sandbox;
  let snapshotId;
  try {
    sandbox = await timed("set up a cold machine (system packages, renderer, browser)", () =>
      createSandbox({ resources: { vcpus: VCPUS }, timeoutInMilliseconds: 20 * MIN_MS }),
    );
    // The helper makes a bundle's subfolders but not its own folder, so a bundle with a public file fails without this.
    await sandbox.mkDir(BUNDLE_ON_MACHINE).catch(() => null);
    await timed("copy the bundle in", () => addBundleToSandbox({ sandbox, bundleDir }));
    await sandbox.writeFiles([{ path: "make.mjs", content: fs.readFileSync(path.join(HERE, "machine/make.mjs")) }]);
    const kept = await sandbox.runCommand("bash", ["-c", KEEP_GLIBC]);
    if (kept.exitCode !== 0)
      throw new Error(`the compositor's library was not kept: ${(await said(kept)).slice(0, 400)}`);
    log(`  ${(await said(kept)).split("\n").pop()}`);
    const snapshot = await timed("keep it as an image that never expires", () => sandbox.snapshot({ expiration: 0 }));
    // Keeping it stopped it. The machine itself is let go; the image is not one of its own copies and stays.
    await sandbox.delete().catch(() => null);
    sandbox = null;
    snapshotId = snapshot.snapshotId;
  } finally {
    if (sandbox) await sandbox.delete().catch(() => null);
  }
  let proofBytes;
  try {
    proofBytes = await proved(snapshotId);
  } catch (e) {
    // An image that does not draw is not left behind to be paid for.
    await (await Snapshot.get({ snapshotId })).delete().catch(() => null);
    throw e;
  }
  console.log(JSON.stringify({ snapshot_id: snapshotId, hash, proof_bytes: proofBytes }));
}

async function tryJob([snapshotId, jobFile, ...files]) {
  if (!snapshotId || !jobFile) throw new Error("try <image> <job.json> [file ...]");
  let sandbox;
  try {
    sandbox = await timed("start from the image", () =>
      Sandbox.create({
        source: { type: "snapshot", snapshotId },
        resources: { vcpus: VCPUS },
        timeout: 10 * MIN_MS,
        // Not kept between sessions: a machine that is leaves a copy of its whole disk each time it stops.
        persistent: false,
      }),
    );
    if (files.length)
      await sandbox.writeFiles(
        files.map((f) => ({ path: `${BUNDLE_ON_MACHINE}/public/${path.basename(f)}`, content: fs.readFileSync(f) })),
      );
    const job = { ...JSON.parse(fs.readFileSync(jobFile, "utf8")), out: "try.mp4" };
    const done = await timed("draw it", () => ran(sandbox, job, "try"));
    fs.mkdirSync(BUILD, { recursive: true });
    fs.writeFileSync(path.join(BUILD, "try.mp4"), await sandbox.readFileToBuffer({ path: "piece/try.mp4" }));
    console.log(JSON.stringify({ bytes: done.bytes, frames: done.frames, kept: "build/try.mp4" }));
  } finally {
    if (sandbox) await sandbox.delete().catch(() => null);
  }
}

async function deleteImage([snapshotId]) {
  if (!snapshotId) throw new Error("delete <image>");
  await (await Snapshot.get({ snapshotId })).delete();
  console.log(JSON.stringify({ deleted: snapshotId }));
}

const [verb, ...rest] = process.argv.slice(2);
const verbs = { build, try: () => tryJob(rest), delete: () => deleteImage(rest) };
if (!verbs[verb]) {
  log("node image.mjs build | try <image> <job.json> [file ...] | delete <image>");
  process.exit(2);
}
await verbs[verb]();
