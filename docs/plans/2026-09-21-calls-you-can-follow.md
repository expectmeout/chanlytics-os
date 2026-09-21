# Calls you can follow

A call is part of its conversation. You can read it like the messages around it, listen to it, and follow along
while the words are said.

Approved by Ruben on 21 September, as prototype v2, after he rejected a boxed version: "instead of a container inside
the chat container the transcript and everything should be on the chat container to feel more seamless like the text
style threads … try not to repeat info … make it more modern sophisticated".

## What there was

On Emily Chen's thread, a phone-only thread in production (21 Sep):

- **The call.** A 420px card with "Inbound call · 3:10", what she wanted, and "Sounded positive · Receptionist ended
  the call". Its transcript sat behind "Transcript ▾", as lines with no times. The rest of the pane was empty.
- **Her request, three times.** The flag line in the timeline quoted it. The card said what she wanted. The status
  band said it again under "From the call", beneath "They phoned and the receptionist couldn't finish it."
- **Call back, twice.** The status band had one. The reply area added its own whenever the band's button was not the
  dialling one: a teammate without `approve`, and the mockup.
- **A technical line.** "Checking which templates are approved…" while the reply area loaded, then "No approved
  message can go to Emily Chen yet."
- **No audio.** Emily is filler: `tooling/scripts/filler.mjs` wrote 15 made-up people on 555-01xx numbers, and their
  10 calls have `recording: null`. All 24 real calls have their recording stored.

What the live data and the code say (read 21 Sep):

- **Line timings.** Every real transcript line carries its `start` in seconds. Only two of 244 lines lack one: short
  caller replies with no words.
  - The database keeps Retell's per-word timings.
  - `stripWordTimings` (apps/dashboard/src/server/dto.ts) trims each line to `{role, content, start}`.
  - `toCallVM` then drops `start` too, keeping only the string "0:11".
- **The audio link.** The browser gets the audio from `GET calls/[id]/recording`, as JSON holding a signed link that
  lasts 300 s. A seek after five minutes asks an expired link, and fails.
- **The stored files.** They are WAV, about 2.8 MB a minute, stored as `binary/octet-stream` or
  `application/octet-stream` because `copyRecording` keeps the CDN's content type. Storage answers ranges (206), so
  seeking works. Safari may refuse audio that is not typed as audio.
- **A stuck recording.** When the sweep's `getCall` returns no link, the copy `continue`s without counting an attempt
  (apps/edge/api/cron/calls.ts). That call says "Recording still processing" for ever.

## The design

### A call in the thread

A call is not a card. It is three things in the conversation's own flow:

1. **Where it began.** A quiet line across the thread, like a day divider: ▶ (only when there is audio) ·
   "Inbound call" · its length · when.
   - A call that never connected is this line alone: "Missed call" or "Call didn't connect", when, and how it ended.
2. **What was said.** Each line is one of the thread's own bubbles:
   - The caller's lines are `client`, on the left. The receptionist's are `agent`, on the right.
   - The owner's whispers are on the right too, marked "you whispered".
   - A bubble's small time is its moment in the call ("0:07"), not the clock. A spoken line has no delivery status.
3. **Where it ended.** A quiet line: "Call ended", then the call's facts ("Sounded positive · Receptionist ended the
   call").
   - A connected call with no audio says so among its facts: "No recording". The #775 card said nothing, which is
     how Emily's filler call came to look broken.

A call is **open** (its lines shown) when it is the thread's newest spoken entry, meaning no written message came
after it, or when it was opened from Conversations. Any other call is **folded**: its line, then what it was about
in one quiet line, then "Show the call · 14 lines".

A call older than the calls the page read has only its note. It is drawn as the line where it began, then the note's
words in one quiet line.

Conversations' pane for a call no thread holds (`CallPane`) draws the same three parts in the thread's frame.

### Listening

- **Starting.** ▶ on the call's line plays it. Pressing a bubble plays from that line, unless you were selecting text.
  So does pressing its time, which is the keyboard's way in: a button, "Play from 0:38".
- **The player.** While you listen, a slim capsule floats at the top of the thread with the lines passing under it.
  - It holds play or pause, who, the track, the time and the speed (1× → 1.5× → 2×), and ✕ to stop.
  - The track is a range input. Press it, drag it, or use the arrow keys; it reads "0:38 of 3:10".
  - The capsule is sticky inside the call's section, so it leaves with the call when you scroll past it.
- **Following.** The line being said is outlined (never striped), and the others dim slightly.
  - The thread keeps the said line in view, unless you have scrolled away from the one before it. Then you are
    reading something else, and it does not pull you back.
- **One call at a time.** Playing a call pauses any other that is playing.
- **The audio.** `<audio src>` is the page's own link to the recording route (`window.__href`), with
  `preload="metadata"`.
  - The route answers 302 to a fresh signed link on every request, as `GET messages/[id]/media` does.
  - So a seek, a pause or a long listen never meets an expired link.
  - A failure says "Couldn't play the recording." in the capsule, and ▶ tries again.

### Where the thread opens

When a thread's newest spoken entry is an open call, the thread opens at the line where the call began, not at the
bottom of its transcript. Pressing ▶ is then the next thing you do. A call opened from Conversations still opens at
that call, as in #775.

### Said once

- **The status band** of a call-back says the to-do as its one sentence: the escalation's details ("Call Emily back
  to confirm …").
  - There is no "From the call" block beneath it.
  - Without details, the reason's sentence stays.
  - The view model's `ask` keeps its text, because the row and its search read it. It gains a required
    `kind: "call" | "wrote" | "sent"`, which the band reads instead of matching a label.
- **The flag line** in the timeline says why it was flagged, "Flagged for a human — <reason>", without quoting the
  details. The open escalation's details are in the band.
- **One Call back.** The reply area offers it only when the band shows none. That is one predicate for both
  (`ixBandCallBack`), for an approver and a viewer alike.
- **The reply area** says nothing while the templates load. When the band already offers the call, the reply area of a
  caller with no WhatsApp thread does not say that no message can go.

## Behind it

- **The API** (`stripWordTimings`) keeps each line's `start` and adds its `end`: the last word's end. That is two
  numbers a line, where the words were most of the payload.
- **The view model** (`toCallVM`):
  - Each transcript line gains `start` and `end` in seconds.
  - A line with no start sits halfway between its neighbours, or at the neighbour it has. It is null only for a call
    with no times at all.
  - A line with no end ends where the next begins.
  - The call gains `durationSec`. Its `facts` gain "No recording" for `recordingState: "none"` on a connected call.
- **The route.** `GET calls/[id]/recording` answers 302 to the signed link. `window.__recording` and `recordingLink`,
  its only callers, go.
- **The edge.**
  - `copyRecording` stores the audio typed as audio, sniffed from its first bytes: RIFF…WAVE is `audio/wav`, ID3 or
    an MPEG frame is `audio/mpeg`. Otherwise it keeps the provider's `audio/*` type, or falls back to `audio/wav`.
  - The sweep counts a missing link as an attempt, so a recording that never gets a link ends "couldn't be saved"
    after three.
- **The stored files.** `tooling/scripts/recordings-content-type.mjs` retypes what is already stored. It holds to the
  prod-script bar: dry run by default, `--apply`, a JSONL backup. Its `--apply` against production is Ruben's
  go-ahead.

## Not in this change

- **The 90-day purge** runs only when something else is pending. It is a separate task (the purge-on-quiet-lines
  chip).
- **Word-by-word highlighting** needs the words in the payload. The line is the unit.
- **Compressing recordings** at ingest. WAV is 2.8 MB a minute.
- **The filler people** stay until Ruben says `filler.mjs --purge`.

## How it ships

1. **PR 1: a call you can follow.**
   - The thread's call (inbox-thread.jsx, inbox.css), `CallPane`, the view model's times and facts, the API's `end`,
     and the route's redirect.
   - The said-once changes to the band, the flag line and the reply area.
   - Tests run the page on the stub React and the view model, never a source scan.
   - Seen in the standalone mockup at 1280, 375 and 320, light and dark, then on production on a real recorded call.
2. **PR 2: the recording pipeline.**
   - The sniffed content type and the sweep's attempt, with tests at `copyRecording` and the sweep.
   - The retyping script, in dry run. Its `--apply` follows Ruben's yes.
