# 0126 · A video is made of blocks

**Status:** Accepted by Ruben, 11 November 2026 ("Yes to all four", then "Yes, build it"), and built as its first half, the engine: nothing a person sees changes until the second. No migration in this half. Written against main at `1e27bb9d7a`.

## Context

Decision 0122 made a video in one shape, "Hook first": the result under a line or two of the owner's words, the cuts that got there, the end card. It was right for a salon with a phone full of clips, and it was the only video there was. A business with photos and few clips, one with a before and an after, one whose best material is what a client wrote: each would have been a new shape, and a shape was a path through the checker, a composition in the template, a storyboard and a card of its own. Ruben, 11 November 2026: the same quality "for all users in any granular way they want", and never "rigidly the exact same for all users".

The direction he approved that day ("Content foundation: the editor first") answers it one way: the code holds the craft (how each thing is drawn, what reads on a phone, what a file may be cut from), and Ask arranges. This note is the part of it that changes the shape of a video.

## Decision

1. **A video is a sequence of blocks the plan arranges**, two to six of them, and the end card always follows. Five kinds (`packages/contracts/src/content/pieces.ts`, `PieceBlock`): a **clip**'s moment, a **photo**, a before-and-after **pair**, a **words** card, a **quote** card. A clip and a photo may carry one line of caption; a pair's two names are the plan's language's own ("Before", "After"); a quote may stand over a picture and say who said it.
2. **One plan, one checker, one composition.** `piecePlanOf` reads a payload kept in either shape and always answers a plan in blocks: a payload kept as "Hook first" is its cuts, each a clip block. `compilePiece` (`packages/contracts/src/content/piece-timeline.ts`) checks blocks and nothing else, and the template draws every plan with `blocks` (`tooling/video/src/blocks.tsx`). The path that compiled cuts is gone, not kept beside it. "Hook first" drawn by `blocks` is what it was, frame for frame: seven frames of one plan drawn both ways differ in no pixel.
3. **A row holds what its door took.** The press stores the payload as its card sent it, and until the second half a card sends "Hook first" alone (`pieces_shape_check`, 00613). The door that lets a row hold blocks, and reads who is in a video from every file its blocks name, is the second half's one migration.
4. **What a block may be is the checker's, in numbers a phone sets** (`PIECE_LIMITS`): a clip's moment 1.5 to 4 seconds, a photo 1.5 to 3.5, a pair 2 to 4, a words card 1.2 to 3, a quote 2.5 to 5, and all of them together 8 to 15, since the made file must fit its folder. A words card is one to three lines of 22 characters; a quote is 140 characters at most, wrapped by its words to seven lines at the largest of three sizes that holds it, its lines evened so it never ends on one word; a caption is one line of 22. A refusal names its block, counted from one.
5. **The opening words sit over pictures and never over a card.** A plan that opens on a picture has them; one that opens on a card has none, since the card is its words. While a card plays between two pictures, the words stand aside.
6. **A pair is one picture over the other**, a rule of the paper between them, each under its own name. Side by side, an upright frame leaves each a sliver that loses its subject.
7. **The storyboard draws every block as the video will**, from the same numbers (`packages/contracts/src/content/piece-frame.ts`), so what Ask looks at and what a person agrees to is what is made. Its door, `POST files/video/preview`, takes a plan in blocks already: nothing is stored for a still.
8. **Each block is handed its own files.** The job fetches a clip's stretch by its parts as before, a clip's moment by the parts around it, and a photo from an address Storage signs for ten minutes and resizes on the way (never enlarged), asked for as a kind a browser draws whatever the phone kept.
9. **Edition 2, in either deploy order.** The template keeps `hook-cut` for an edge a deploy behind, which names that composition and hands the old material; the edge draws on the image of the edition its own code names, never the row's, since what it hands is read by that edition's template. The image's proof draws one of every kind of block and "Hook first" the old way, and an image that fails either is not kept. Image 2 goes on record on production before this merges.

## What it does not do

- **Ask does not arrange blocks yet.** `propose_piece` still offers "Hook first", with the five cuts it had. The second half gives it blocks, the recipes as written advice (one text module, no loader), and the migration of point 3.
- **No brand kit.** The business's colour and mark are still the two a post wears. The kit is the step after.
- **No sound, no generated footage, no posting as a reel.** Each is as decision 0122 left it.
- **Nothing longer than 15 seconds.** A longer piece is a larger file than a folder takes, and a decision of its own.

## What is taken

Nothing new. Remotion's licence, left open by decision 0122, is settled there: the company is three people or fewer.

## Proof

`tests/content/a-video-is-planned.test.mjs` (both payloads read as one plan, every block's rules, the drawing numbers), `a-video-is-asked-for.test.mjs` (each kind of tile, the stills each block asks for, what the two doors take), `a-video-is-made.test.mjs` (each block's fetches, the image by the code's edition, a photo gone) and `the-template-has-its-image.test.mjs` (edition 2's hash, both compositions). Drawn on a PC with the renderer a machine holds: "Hook first" both ways, compared by pixel; and one plan of every block in English and in Spanish, looked at frame by frame beside its storyboard.
