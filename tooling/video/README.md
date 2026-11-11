# The video template and its machine image

A business's video is drawn from its own clips by a template, on a machine that exists for that one video (Vercel's Sandbox). This
folder holds the template, the script the machine runs, and the script that builds the machine's image. The decision note that
argues it is `docs/decisions/0122-a-business-makes-a-video-from-its-clips.md`.

## Why it is not part of the workspace

The toolchain that bundles the template and sets up a machine (webpack, the renderer and its browser) is large, and the apps never
import any of it: the edge starts a machine from a saved image and hands it a job. So it is installed here alone, by `npm ci`, where
an image is built, and adds nothing to the workspace's install, to CI or to either app's build. `pnpm-workspace.yaml` leaves this
folder out, and it keeps its own `package-lock.json`, every version pinned exactly.

## What is where

| Path                | What it is                                                                                            |
| ------------------- | ----------------------------------------------------------------------------------------------------- |
| `src/`              | The template: `hook-cut.tsx` (the one shape), `look.tsx` (the words and the end card), `index.tsx`    |
| `machine/make.mjs`  | What the machine runs: fetch the files it is told to, draw the composition, say where it stands       |
| `image.mjs`         | Builds the image and proves it draws; `try` draws one job from an image, for working on the template  |
| `template-hash.mjs` | One hash of everything an image is made of, read by the repository's test with nothing installed here |

The template decides nothing. Which seconds of which clip, the words, where they sit and how large they are were all worked out by
the plan's checker (`packages/contracts/src/content/piece-timeline.ts`), and the template draws what it is handed. It reads the
drawing numbers from `packages/contracts/src/content/piece-frame.ts` by path, and is set in the posts' own face, copied beside the
bundle as it is built.

## An image, and when a new one is needed

A cold machine takes from half a minute to six minutes to set up, which no step of a job can wait for. So it is set up once, kept
as an image that never expires, and each video starts from the image in about a second. The image holds the bundle and
`make.mjs`, so **a change to anything `template-hash.mjs` names is a new image**:

1. Change the template. `tests/content/the-template-has-its-image.test.mjs` now fails: the hash no longer matches the edition.
2. Raise `PIECE_TEMPLATE.edition` and write the new hash beside it (`packages/contracts/src/content/piece-making.ts`).
3. Build the image (below), then put it on record before the change is merged:
   `node --import tsx tooling/scripts/ops/files/piece-image.mjs <snapshot_id> <hash> --apply`, with the two values the build printed
   (dry-run without `--apply`: it says what is on record for the edition and what it would write). It refuses an image that
   was not built from the template this tree holds.

A deploy whose edition has no image on record makes no video and says so; the edition before keeps its own image, so either
deploy order works.

## Building one by hand

```bash
cd tooling/video
npm ci
npx vercel link            # the edge's project, once
npx vercel env pull .env.oidc --environment=development   # a sign-in for the machine, good for twelve hours
node --env-file=.env.oidc image.mjs build
```

It prints one JSON line (`snapshot_id`, `hash`, `proof_bytes`) and keeps the proof at `build/proof.mp4`: a clip made of nothing,
cut and worded by the template, drawn from the image it just made. An image that does not draw its proof is deleted.

## What was measured (10 Nov 2026)

Start from an image about 1 s; fetch a video's seconds 1.3 to 3.8 s; draw 8 to 12 seconds of video in 13 to 19 s on eight cores;
about one cent a video. The renderer's setup leaves a system library in `/tmp`, which an image does not keep: `image.mjs` moves it
beside the bundle and points the compositor there. Its helper that copies a bundle in needs the bundle's folder made first.

`make.mjs` holds the drawing to ten megabits a second, so the longest video the shape allows fits the 25 MB its folder takes, and
gives a part 45 s to come before the drawing ends rather than holding the machine. The platform gives a command started in the
background no exit code until it is waited on, so what says a drawing finished is the script's own last word, `done` with its
bytes (`packages/channels/src/files/machine.ts`, `renderStateOf`): found by running the edge's own wire against a real machine.
