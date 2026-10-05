/**
 * The agent client's audio worklets, served from this origin (docs/superpowers/specs/2026-10-03-ask-spoken-design.md,
 * §3.5). @elevenlabs/client loads its two AudioWorklet modules from a blob: URL, then a data: URL, unless it is given
 * paths to self-host them (its AudioWorkletConfig.workletPaths), and the dashboard's script-src names neither scheme,
 * so with no paths the WebRTC conversation's audio setup fails and the connection goes down a second after it is up
 * (seen in Chrome, 3 Oct 2026). This writes the modules' sources, read out of the installed client, to
 * apps/dashboard/public/voice/, where 'self' serves them; the Line's voice module names those paths. Run after the
 * client's version changes; tooling/scripts/tests/ask-voice/voice-worklets.test.mjs fails a public file that drifted.
 *
 *   node tooling/scripts/voice/vendor-worklets.mjs            writes the two files
 */
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const require = createRequire(path.join(ROOT, "apps/dashboard/package.json"));

/** The worklets the client ships, each as its generated module and the file it is served as. */
export const WORKLETS = [
  { name: "rawAudioProcessor", module: "platform/web/rawAudioProcessor.generated.js", file: "raw-audio-processor.js" },
  {
    name: "audioConcatProcessor",
    module: "platform/web/audioConcatProcessor.generated.js",
    file: "audio-concat-processor.js",
  },
];

/** The paths the Line's voice module hands the client, under the dashboard's own origin. */
export const WORKLET_PATHS = Object.fromEntries(WORKLETS.map((w) => [w.name, `/voice/${w.file}`]));

/** One worklet's source, exactly as the client would inline it: the template literal its generated module wraps. */
export function workletSource(name) {
  const w = WORKLETS.find((x) => x.name === name);
  if (!w) throw new Error(`no such worklet: ${name}`);
  // The package exports no package.json: the dist directory is the main entry's (dist/lib.modern.js or its kin).
  const dist = path.dirname(require.resolve("@elevenlabs/client"));
  const text = readFileSync(path.join(dist, w.module), "utf8");
  const open = text.indexOf("`");
  const close = text.lastIndexOf("`");
  if (open < 0 || close <= open) throw new Error(`${w.module}: no template literal to read`);
  // The literal evaluated as the client evaluates it (no substitutions: the sources are plain worklet code).
  return new Function(`return ${text.slice(open, close + 1)};`)();
}

/** Where a worklet is served from. */
export const publicFile = (name) =>
  path.join(ROOT, "apps/dashboard/public/voice", WORKLETS.find((x) => x.name === name).file);

export function vendorWorklets() {
  mkdirSync(path.join(ROOT, "apps/dashboard/public/voice"), { recursive: true });
  const written = [];
  for (const w of WORKLETS) {
    const src = workletSource(w.name);
    if (src.includes("${")) throw new Error(`${w.name}: the source has a substitution; read it another way`);
    writeFileSync(publicFile(w.name), src);
    written.push([w.file, src.length]);
  }
  return written;
}

if (process.argv[1] && import.meta.url === new URL(`file:///${process.argv[1].replace(/\\/g, "/")}`).href) {
  for (const [file, n] of vendorWorklets()) console.log(`wrote apps/dashboard/public/voice/${file} (${n} chars)`);
}
