// Runs ON the machine, beside the bundle. It is handed one job as JSON (its first argument, a file's path): files to fetch and
// what to draw. It fetches each file's parts in order into the bundle's public folder, draws the composition with the renderer the
// image holds, and says where it stands in progress.json as it goes, so whoever started it can leave and ask later.
//
//   { "fetch": [{ "to": "cut-0.mp4", "parts": ["https://...init", "https://...segment", ...] }],
//     "composition": "hook-cut", "props": { ... }, "out": "video.mp4" }
//
// It decides nothing: which seconds of which clip, the words and where they sit were all worked out before it was started. A
// playback copy's init part followed by the segments that cover a cut is a playable file, which is why parts are joined as they
// come. Nothing here is a business's: the addresses are short-lived and arrive with the job.
import fs from "node:fs";
import path from "node:path";
import { renderMedia, selectComposition } from "@remotion/renderer";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const BUNDLE = path.join(HERE, "remotion-bundle");
const WORK = path.join(HERE, "piece");
const PROGRESS = path.join(WORK, "progress.json");
/** The longest one part is waited for: a few megabytes from the video platform. A part that hangs fails the drawing, which is then started afresh. */
const PART_MS = 45_000;

fs.mkdirSync(WORK, { recursive: true });
fs.mkdirSync(path.join(BUNDLE, "public"), { recursive: true });

/** Where it stands, written whole and swapped in, so a reader never sees half a line. */
function say(progress) {
  fs.writeFileSync(`${PROGRESS}.tmp`, JSON.stringify(progress));
  fs.renameSync(`${PROGRESS}.tmp`, PROGRESS);
}

async function fetched(file) {
  const parts = [];
  for (const address of file.parts) {
    const res = await fetch(address, { signal: AbortSignal.timeout(PART_MS) });
    if (!res.ok) throw new Error(`${file.to}: a part answered ${res.status}`);
    parts.push(Buffer.from(await res.arrayBuffer()));
  }
  const bytes = Buffer.concat(parts);
  // A name and nothing else: the job never writes outside the bundle's public folder.
  fs.writeFileSync(path.join(BUNDLE, "public", path.basename(file.to)), bytes);
  return bytes.length;
}

try {
  const job = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
  say({ stage: "fetching", progress: 0 });
  let fetchedBytes = 0;
  for (const file of job.fetch ?? []) fetchedBytes += await fetched(file);
  say({ stage: "drawing", progress: 0, fetched_bytes: fetchedBytes });
  const out = path.join(WORK, path.basename(job.out ?? "video.mp4"));
  const composition = await selectComposition({ serveUrl: BUNDLE, id: job.composition, inputProps: job.props ?? {} });
  let last = 0;
  await renderMedia({
    composition,
    serveUrl: BUNDLE,
    codec: "h264",
    crf: 16,
    // Held to what a folder may keep (the files bucket takes 25 MB). The longest video is seventeen seconds, and the most an
    // encoder may write is its rate for every second and its buffer once more: 17 x 10 + 20 megabits is under 24 MB, where
    // 12 could pass 25. No phone or feed shows more than this.
    encodingMaxRate: "10M",
    encodingBufferSize: "20M",
    imageFormat: "jpeg",
    jpegQuality: 95,
    pixelFormat: "yuv420p",
    colorSpace: "bt709",
    muted: true,
    outputLocation: out,
    inputProps: job.props ?? {},
    overwrite: true,
    onProgress: ({ progress }) => {
      // A line every tenth: enough to tell drawing from stalled, without a write a frame.
      if (progress < last + 0.1) return;
      last = progress;
      say({ stage: "drawing", progress, fetched_bytes: fetchedBytes });
    },
  });
  say({ stage: "done", progress: 1, bytes: fs.statSync(out).size, frames: composition.durationInFrames });
} catch (e) {
  say({ stage: "error", message: e instanceof Error ? e.message : String(e) });
  console.error(e);
  process.exit(1);
}
