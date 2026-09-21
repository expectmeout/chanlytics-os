# Calls you can follow: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A call is part of its conversation. You can read it like the messages around it, and play it while the
line being said is lit. The call thread says each thing once. The recordings behind it play everywhere.

**Architecture:**
- **The view model** (packages/contracts `toCallVM`, `toInboxThreadVM`) carries each line's start and end in
  seconds, the call's length in seconds, "No recording", and a required `ask.kind`. For a call-back, the thread's
  sentence is the to-do.
- **The page** (legacy `inbox-thread.jsx`) draws a call as a start line, the thread's own bubbles and an end line,
  with a sticky listening capsule. The `<audio>` points at the recording route, which now answers 302 to a fresh
  signed link.
- **The edge** types each stored recording from its bytes, and the sweep counts a missing provider link as an
  attempt.

**Tech stack:**
- Legacy React pages compiled by Babel, with no bundler. Tests run on a stub React under `node --test` with `tsx`.
- Next.js route handlers (`read()` from `@/server/route`).
- Vercel edge handlers and a Supabase Storage `media` bucket.

**Spec:** [2026-09-21-calls-you-can-follow.md](2026-09-21-calls-you-can-follow.md)

**Rules of this repo that bind every task:**
- **Bump `?v=N`** on every edited legacy file in `apps/dashboard/src/legacy/Chanlytics.html`.
- **Rebuild the contracts dist after any contracts edit:** `corepack pnpm --filter ./packages/contracts build`. The
  node tests import the dist.
- **After the commit, run `node tooling/scripts/check-dist.mjs`** and commit every dist with a real diff (`-w`).
- **Never add a `readCode`/`readRaw` assertion.** Run the page on the stub React.
- **No `git stash`**: the stash stack is shared. Work stays on `design/calls-you-can-follow`.
- **Run one test file:** `node --conditions=react-server --import tsx --test tooling/scripts/tests/<file>`.
- **Run the whole suite:** `node --conditions=react-server --import tsx --test tooling/scripts/tests/*.test.mjs`.

---

## PR 1: a call you can follow

### Task 1: The API keeps each line's end

**Files:**
- Modify: `apps/dashboard/src/server/dto.ts` (`stripWordTimings`)
- Modify: `packages/contracts/src/viewmodels.ts` (`CallDto.transcript_object`)
- Test: `tooling/scripts/tests/hygiene.test.mjs` (F15)

- [ ] **Step 1: Failing test.** In hygiene.test.mjs F15, the expected strip becomes:

```js
  assert.deepEqual(stripped, [
    { role: "agent", content: "hi", start: 0.4, end: 0.6 },
    { role: "user", content: "when?", start: 27.2, end: 27.6 },
    { role: "injected", content: "owner text" },
  ]);
```

- [ ] **Step 2:** Run `hygiene.test.mjs`. Expect F15 to FAIL, because `end` is missing.
- [ ] **Step 3: Implement.** In dto.ts:

```ts
/**
 * A call's turns without their word timings.
 *
 * The list route returned up to a hundred calls with a per-word start/end
 * array on every turn on every refresh — most of the payload by weight, and
 * the reason the conversations snapshot tripped the 2 MB cache cap and every
 * surface booted cold (review F15). The viewers need two numbers per turn,
 * where it starts and where it ends -- the thread plays a call from a line and
 * lights the one being said -- and those survive as `start` and `end`.
 */
export function stripWordTimings(raw: unknown): CallDto["transcript_object"] {
  if (!Array.isArray(raw)) return null;
  return raw.map((t) => {
    const turn = (t ?? {}) as { role?: string; content?: string; words?: Array<{ start?: number; end?: number }>; start?: number; end?: number };
    const words = turn.words ?? [];
    const start = typeof turn.start === "number" ? turn.start : words[0]?.start;
    const end = typeof turn.end === "number" ? turn.end : words[words.length - 1]?.end;
    return { role: turn.role, content: turn.content, ...(typeof start === "number" ? { start } : {}), ...(typeof end === "number" ? { end } : {}) };
  });
}
```

  In viewmodels.ts `CallDto`:

```ts
  /** Turns. `start`/`end` (seconds) are the turn's first and last word; `words` is the raw
   *  provider shape and is stripped by the list route (F15). */
  transcript_object: Array<{ role?: string; content?: string; start?: number; end?: number; words?: Array<{ start?: number; end?: number }> }> | null;
```

- [ ] **Step 4:** Run `hygiene.test.mjs`. Expect PASS.
- [ ] **Step 5:** Commit: "A call's lines keep where they end".

### Task 2: The view model gives each line its moment

**Files:**
- Modify: `packages/contracts/src/viewmodels.ts` (`CallVM`, `RECORDING_NOTE`, `toCallVM`)
- Test: `tooling/scripts/tests/calls-in-the-thread.test.mjs`

- [ ] **Step 1: Failing test.** Add to calls-in-the-thread.test.mjs. The `callDto` fixture's turns carry
  `start`/`end` as the route ships them:

```js
test("each line says its moment in the call: where it starts and where it ends, a line with no time placed between its neighbours", () => {
  const call = toCallVM(callDto({ transcript_object: [
    { role: "agent", content: "Thank you for calling.", start: 0.4, end: 5.1 },
    { role: "user", content: "Hi, a bridal trial please.", start: 6, end: 11.2 },
    { role: "user", content: "After two." },
    { role: "agent", content: "Noted.", start: 20, end: 21.5 },
    { role: "injected", content: frameWhisper("mention the bridal package") },
  ] }), ZONE, NOW);
  assert.deepEqual(call.transcript.map((l) => [l.speaker, l.start, l.end]), [
    ["agent", 0.4, 5.1],
    ["client", 6, 11.2],
    ["client", 13, 20],
    ["agent", 20, 21.5],
    ["whisper", null, null],
  ], "REGRESSION: the view model kept only the string '0:06', so nothing could play from a line or light one");
  assert.equal(call.durationSec, 190);
});

test("a connected call with no recording says so; a missed call says nothing of one", () => {
  assert.deepEqual(toCallVM(callDto({ recording: null }), ZONE, NOW).facts, ["Sounded positive", "Receptionist ended the call", "No recording"],
    "REGRESSION: said nothing, so a call with no audio (Emily's, filler) looked like a player that failed to draw");
  assert.deepEqual(toCallVM(callDto({ status: "not_connected", duration_ms: 0, disconnection_reason: "dial_no_answer", sentiment: null, recording: null }), ZONE, NOW).facts, ["No answer"]);
});
```

  The #775 assertion "a call never recorded says nothing of it", in `no recording, no Play`, changes to expect
  `"… · No recording"`, with the reason in its message.

- [ ] **Step 2:** Run it. Expect FAIL: `start` is undefined and "No recording" is absent.
- [ ] **Step 3: Implement.** `CallVM`:

```ts
  transcript: Array<{ t: string; speaker: "agent" | "client" | "whisper"; text: string; start: number | null; end: number | null }>;
  /** The call's length in seconds, for the player's track before the audio says its own. */
  durationSec: number | null;
```

  `RECORDING_NOTE` gains `none: "No recording"`. The comment reads: "a call never recorded says so: said nothing,
  it looked like a player that failed to draw". The transcript mapping:

```ts
  // Each line's moment in the call, in seconds. The provider's own start, or halfway between its neighbours for a
  // line it gave none (two of the salon's 244 real lines); its end, or where the next line begins. A whisper is the
  // owner's words to the receptionist, not a sound in the recording: it has no moment.
  const turns = dto.transcript_object ?? [];
  const given = turns.map((turn) => (turn.role === "injected" ? null : typeof turn.start === "number" ? turn.start : turn.words?.[0]?.start ?? null));
  const starts = given.map((s, i) => {
    if (s != null || turns[i].role === "injected") return s;
    const before = given.slice(0, i).reverse().find((x) => x != null);
    const after = given.slice(i + 1).find((x) => x != null);
    return before != null && after != null ? (before + after) / 2 : before ?? after ?? null;
  });
  const transcript = turns.map((turn, i) => {
    const start = starts[i];
    const later = start == null ? null : starts.slice(i + 1).find((x) => x != null && x > start) ?? null;
    const end = start == null ? null : typeof turn.end === "number" ? turn.end : turn.words?.[turn.words.length - 1]?.end ?? later;
    if (turn.role === "injected") return { t: "—", speaker: "whisper" as const, text: whisperText(turn.content), start: null, end: null };
    return {
      t: typeof given[i] === "number" ? `${Math.floor(given[i]! / 60)}:${String(Math.floor(given[i]! % 60)).padStart(2, "0")}` : "—",
      speaker: (turn.role === "agent" ? "agent" : "client") as "agent" | "client",
      text: turn.content ?? "",
      start,
      end,
    };
  });
```

  The return value gains `durationSec: dto.duration_ms ? Math.round(dto.duration_ms / 1000) : null`. `facts` uses
  `RECORDING_NOTE[recState]`, so "none" is now said.

- [ ] **Step 4:** Rebuild the contracts dist. Run calls-in-the-thread and whisper-framing. Expect PASS.
- [ ] **Step 5:** Commit: "A call's lines say their moment in the call".

### Task 3: The thread says a call-back's to-do once

**Files:**
- Modify: `packages/contracts/src/viewmodels.ts` (`InboxThreadVM.ask`, `ask`, `summary`, the flag event)
- Test: `tooling/scripts/tests/inbox-decision.test.mjs`, `tooling/scripts/tests/inbox-channels.test.mjs`

- [ ] **Step 1: Failing tests.**

  In inbox-decision.test.mjs, the asks gain `kind`:

```js
  assert.deepEqual(toInboxThreadVM(conv(), asked(), ZONE, NOW).ask, { kind: "wrote", label: "They wrote", text: "Can I move my appointment to Friday?", quoted: true });
  assert.deepEqual(call.ask, { kind: "call", label: "From the call", text: "Call Rosa back to confirm the bridal trial on Oct 3", quoted: false });
```

  In inbox-channels.test.mjs, the call-back's sentence is the to-do. Without details, it is the reason's sentence:

```js
  assert.equal(vm.summary, "Call Emily back to confirm the bridal trial on Oct 3", "REGRESSION: the band said \"They phoned and the receptionist couldn't finish it.\" over \"From the call: …\", beneath the call itself");
  assert.equal(toInboxThreadVM(conv(), { ...callback, details: null }, ZONE, NOW).summary, "They phoned and the receptionist couldn't finish it.", "no to-do, the reason");
  const flag = vm.timeline.find((e) => e.type === "event");
  assert.equal(flag.body, "Flagged for a human — Needs a call back — the phone receptionist could not finish it", "REGRESSION: the flag quoted her request a third time");
```

- [ ] **Step 2:** Run both files. Expect FAIL.
- [ ] **Step 3: Implement.** The type:

```ts
  ask: { kind: "call" | "wrote" | "sent"; label: string; text: string; quoted: boolean } | null;
```

  `ask` gains a required `kind`: "call" for a call-back's details, "wrote" for text, "sent" otherwise.

  `summary` for an open escalation:

```ts
      : escalation
      // A call back's to-do is its one sentence: "They phoned and the receptionist couldn't finish it." sat beneath
      // the call it describes, over "From the call: <the to-do>". Without a to-do, the reason's sentence.
      ? (escalation.reason === "callback" && escalation.details?.trim() ? escalation.details.trim() : ESCALATION_SUMMARIES[escalation.reason] ?? `${reasonLabel}. Needs a human.`)
```

  The flag event: `body: \`Flagged for a human — ${reasonLabel}\`` (the open escalation's details are the band's).

- [ ] **Step 4:** Rebuild the dist. Run the inbox-*.test.mjs files, email-quoted-reply and call-outcomes. Expect PASS.
  A test that pinned the old words is updated to the new ones, with its REGRESSION reason kept.
- [ ] **Step 5:** Commit: "A call back's to-do is said once".

### Task 4: The recording route answers with the link

**Files:**
- Modify: `apps/dashboard/app/api/v1/calls/[id]/recording/route.ts`
- Modify: `apps/dashboard/src/legacy-bridge/inbox-verbs.ts` (remove `recordingLink`, `__recording`)
- Test: `tooling/scripts/tests/inbox-routes.test.mjs`

- [ ] **Step 1: Failing test.** In inbox-routes.test.mjs:
  - A call with `recording: { storage_path: "t1/calls/k.wav", fetch_state: "stored" }`.
  - Stub `globalThis.fetch` to answer Storage's sign request with `{ signedURL: "/object/sign/media/t1/calls/k.wav?token=abc" }`.
  - Assert that `recording.GET.run(get(), ctxFor(tables, { id }))` resolves to status 302, with a `location` that
    ends in `token=abc`.
- [ ] **Step 2:** Run it. Expect FAIL: the route returns JSON 200.
- [ ] **Step 3: Implement.** The handler returns `new Response(null, { status: 302, headers: { location: url } })`,
  and its comment says why ("an `<audio>` points straight at it: every request is signed afresh"). Delete
  `recordingLink`, its `__recording` global declaration and its install line.
- [ ] **Step 4:** Run inbox-routes, conversations-doors and route-policy. conversations-doors A14 is rewritten in
  Task 6. Expect PASS apart from A14.
- [ ] **Step 5:** Commit: "The recording route hands the browser the link, afresh on every request".

### Task 5: A call in the conversation

**Files:**
- Modify: `apps/dashboard/src/legacy/pages/inbox-thread.jsx`:
  - replace `CallPlayer` and `CallCard` with `ThreadCall`;
  - `TimelineEntry` and `TlMsgEntry` pass `newest`;
  - `InboxThread` opens at `ixOpensAt`;
  - `window.ThreadCall` replaces `window.CallCard`.
- Modify: `apps/dashboard/src/legacy/styles/inbox.css`: the `.tl-call*` card block becomes the mark, spoken and
  listen styles.
- Test: `tooling/scripts/tests/calls-in-the-thread.test.mjs`, rewritten around the new anatomy.

- [ ] **Step 1: Failing tests** (stub React, as the file already sets up):
  1. **A newest call is drawn open.** `[data-testid=tl-call-start]` reads "Inbound call · 3:10 · <at>". There are
     N `tl-spoken` bubbles with the caller's `client` and the receptionist's `agent`. `[data-testid=tl-call-end]`
     reads "Call ended · Sounded positive · Receptionist ended the call". There is no `.tl-call-card`.
  2. **An older call is folded.** A written message comes after it, so its words show once, with
     "Show the call · 2 lines". Pressing that shows the bubbles.
  3. **With audio**, there is a `tl-call-play` on the start line and an `<audio>` whose `src` is
     `__href("GET calls/[id]/recording")`. Pressing it shows `tl-listen`.
  4. **Pressing a bubble's time** sets the audio's `currentTime` to the line's start, calls `play()`, and marks that
     bubble `aria-current="true"` once `timeupdate` reports that time. The other bubbles are not current.
  5. **Speed** cycles 1× → 1.5× → 2× → 1× and sets `playbackRate`.
  6. **One at a time.** Two calls: playing the second pauses the first.
  7. **No recording:** no `tl-call-play`, and the end line ends "No recording".
  8. **A missed call** is its start line alone: "Missed call · No answer · <at>".
  9. **A note-only call** is its start line and the note's words.
  10. **The open rule:** `ixOpensAt(thread)` is the newest call's messageId when a call is the newest message, the
      focus id when given, and null when a written message is newest.
- [ ] **Step 2:** Run it. Expect FAIL.
- [ ] **Step 3: Implement `ThreadCall`**, as prototype v2 (scratchpad `call-inline.jsx`), with these fixed:
  - **Hooks** sit above every return.
  - **The src** is `__href("GET calls/[id]/recording", { id })`, and only on a real call outside a demo.
  - **Errors:** an `error` or rejected `play()` sets the capsule's words to "Couldn't play the recording." in a
    `role="status"` span. Pressing play again calls `el.load()` and then `el.play()`.
  - **One at a time:** a module-level `TL_PLAYING` holds the playing element, and `onPlay` pauses any other.
  - **Following:** the follow effect sits on `[active]`, where `active = tlLineAt(lines, pos)` counts only once
    you have started listening.
  - **Speakers:** each bubble has a visually hidden speaker name (`.tl-spoken-who`, clipped) for screen readers.
  - **The end line** carries a quiet download button for the call's transcript file, off-demo only.
  - **The InboxThread scroll effect** aims at `focusRef.current || ixOpensAt(threadRef.current)`, where
    `threadRef.current` is the current thread.
- [ ] **Step 4: CSS.** Replace inbox.css's card block (from `/* A call, where it happened in the thread` to the
  `tl-call-here` keyframes) with the v2 rules:
  - `.tl-call` is a flex column with gap 10px;
  - `.tl-call-mark` has hairlines on both sides, with `.end`;
  - `.tl-call-play` and `.tl-call-glyph` are 22px with a 44px touch area through `::after`;
  - `.tl-msg.tl-spoken` has `.playable`, `.now` (outline ring) and `.whisper`;
  - `.tl-spoken-t` and `.tl-spoken-who` (visually hidden);
  - `.tl-listen`: a sticky capsule, 92% opaque, blurred, with its play, who, track, clock, speed and close;
  - the `@container`-free phone rules, and reduced motion;
  - the focus highlight on `.tl-call.focus .tl-call-mark`.
- [ ] **Step 5:** Run calls-in-the-thread, inbox-true, inbox-once, one-thread and conversations-doors. Expect PASS.
- [ ] **Step 6:** Commit: "A call is part of its conversation, and plays with its lines lit".

### Task 6: The status band and the reply area say each thing once

**Files:**
- Modify: `apps/dashboard/src/legacy/pages/inbox-thread.jsx`:
  - `ThreadStatus`: no `IxAsk` for `ask.kind === "call"`, in the escalated and yours states;
  - `ixBandCallBack`;
  - the header's opted-out Call back and the composer's Call back use `!ixBandCallBack`;
  - `TemplateSendButton` is silent while loading, and silent when the band offers the call to a caller with no
    WhatsApp thread.
- Test: `tooling/scripts/tests/inbox-once.test.mjs`
- [ ] **Step 1: Failing tests.**
  - An escalated phone thread for an approver has exactly one `ix-call-back`, in the band.
  - The same thread for a viewer (`canDo` returns false) also has exactly one Call back in the page: the band's
    button.
  - A phone-only thread with templates still loading renders no "Checking which templates are approved…".
  - With no sendable template while the band offers the call, it renders no "No approved message can go".
  - The band of a call-back has no `ix-take-ask`, and its sentence is the to-do.
- [ ] **Step 2:** Run it. Expect FAIL.
- [ ] **Step 3: Implement** as the spec's "Said once".
- [ ] **Step 4:** Run the inbox-*.test.mjs files and the-pages-say-only-what-is-true. Expect PASS.
- [ ] **Step 5:** Commit: "The call thread says each thing once".

### Task 7: Conversations draws a lone call the same way

**Files:**
- Modify: `apps/dashboard/src/legacy/pages/conversations.jsx`:
  - `CallPane` draws `<ThreadCall call={c} at={c.at} open />`;
  - the live line is in the mark idiom;
  - the global comment names `ThreadCall`.
- Test: `tooling/scripts/tests/one-thread.test.mjs` and `tooling/scripts/tests/conversations-doors.test.mjs`
  (A14: the recording is the route's link, and a failure says why and plays again)
- [ ] **Step 1:** Update both files' `globalThis.CallCard` to `ThreadCall`. Rewrite A14 around `<audio>`'s `src`
  (via `__href`) and its `onError` then a retry. Run them. Expect FAIL.
- [ ] **Step 2:** Implement. Run them. Expect PASS.
- [ ] **Step 3:** Commit: "Conversations draws a call no thread holds as the thread does".

### Task 8: Ship PR 1

- [ ] Bump `inbox-thread.jsx`, `conversations.jsx`, `thread-pane.jsx` (if touched) and `inbox.css` in
  Chanlytics.html.
- [ ] `corepack pnpm --filter ./packages/contracts build`, then commit, then `node tooling/scripts/check-dist.mjs`.
  Keep only real dist diffs.
- [ ] Run the full unit suite, `corepack pnpm -r --if-present typecheck`, and eslint on the changed files.
- [ ] Check the standalone mockup with the recorded-call fixture (scratchpad `proto-boot.js`, pointed at the real
  page) at 1280, 375 and 320, light and dark. Check: no horizontal overflow, the capsule pinned, the lit line in
  view, one Call back, no technical line, and no console errors.
- [ ] Grep `e2e/*.spec.ts` for anything pinned (`tl-call`, `Flagged for a human`, `ix-call-back`, `From the call`).
- [ ] Push, open the PR, then squash-merge on 6/6 green. There are no migrations.
- [ ] After the deploy, reload the production tab. Open a real recorded call (not filler) and check that it plays,
  its lines light, and seeking works.

## PR 2: the recording pipeline

### Task 9: Store the audio typed as audio

**Files:**
- Modify: `apps/edge/lib/call-recording.ts` (export `sniffAudioType`, use it in `copyRecording`)
- Test: `tooling/scripts/tests/call-lifecycle.test.mjs`, or the file that already drives `copyRecording`
- [ ] **Step 1: Failing test.** `sniffAudioType` gives these results:

  | Bytes | Provider type | Result |
  |---|---|---|
  | RIFF….WAVE | `binary/octet-stream` | `audio/wav` |
  | "ID3" | none | `audio/mpeg` |
  | `0xFF 0xFB` | none | `audio/mpeg` |
  | unknown | `audio/ogg` | `audio/ogg` |
  | unknown | `application/octet-stream` | `audio/wav` |

  A `copyRecording` run with WAV bytes and `binary/octet-stream` uploads with `contentType: "audio/wav"` and
  stores `mime: "audio/wav"`.
- [ ] **Step 2:** Run it. Expect FAIL.
- [ ] **Step 3: Implement:**

```ts
/** What the audio is, read from its first bytes: the provider's CDN says `binary/octet-stream` for WAV, and a
 *  browser (Safari above all) will not play audio that is not typed as audio. */
export function sniffAudioType(bytes: ArrayBuffer, given: string | null): string {
  const b = new Uint8Array(bytes.slice(0, 12));
  const ascii = (from: number, to: number) => String.fromCharCode(...b.slice(from, to));
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WAVE") return "audio/wav";
  if (ascii(0, 3) === "ID3" || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) return "audio/mpeg";
  return given && given.startsWith("audio/") ? given : "audio/wav";
}
```

  In `copyRecording`: `const mime = sniffAudioType(got.bytes, got.mime);`. `ext` comes from `REC_EXT[mime]`. The
  upload uses `contentType: mime`, and `settle("stored", { …, mime, … })`.
- [ ] **Step 4:** Run it. Expect PASS.
- [ ] **Step 5:** Commit: "A stored recording is typed as audio".

### Task 10: The sweep counts a missing link

**Files:**
- Modify: `apps/edge/api/cron/calls.ts` (the `!url` branch)
- Test: `tooling/scripts/tests/cron-doors-b.test.mjs`
- [ ] **Step 1: Failing test.** A pending recording with `attempts: 2` whose `getCall` returns no `recording_url`
  is written `fetch_state: "failed"` with `attempts: 3`. With `attempts: 0`, it is written pending with
  `attempts: 1`.
- [ ] **Step 2:** Run it. Expect FAIL: the row is untouched.
- [ ] **Step 3: Implement.** Replace the bare `continue`:

```ts
    if (!url) {
      L.warn("calls_sweep_recording_no_url", { call: row.retell_call_id });
      // No link to copy from is an attempt like any other: counted, so a recording the provider never hands over
      // ends "couldn't be saved" after RECORDING_MAX_ATTEMPTS, where it said "still processing" for ever and stood
      // first in line on every run.
      const attempt = (rec.attempts ?? 0) + 1;
      const exhausted = attempt >= RECORDING_MAX_ATTEMPTS;
      await setCallRecording(db, row.tenant_id, row.id, { fetch_state: exhausted ? "failed" : "pending", attempts: attempt, error: "provider_no_url" });
      recordings[exhausted ? "failed" : "retry"]++;
      continue;
    }
```

  Import `setCallRecording` from `../../lib/workspace/db.js`, as call-recording.ts does.
- [ ] **Step 4:** Run cron-doors-b, retell-webhook-door and call-lifecycle. Expect PASS.
- [ ] **Step 5:** Commit: "A recording the provider never hands over ends, instead of processing for ever".

### Task 11: Retype what is already stored (dry run)

**Files:**
- Create: `tooling/scripts/recordings-retype.mjs`
- Test: `tooling/scripts/tests/recordings-retype.test.mjs` (the pure planner)
- [ ] **Step 1: Failing test.** `planRetype(rows)` keeps rows whose `recording.fetch_state === "stored"` and whose
  mime does not start with `audio/`. It returns `{ id, tenant_id, storage_path, from }`. Everything else is left.
- [ ] **Step 2:** Implement the planner, exported from the script so the test imports it, and the script body:
  - it holds to the prod-script bar: dry run by default, printing the plan and writing nothing;
  - `--apply` downloads each object, sniffs it with the same rule, re-uploads with `upsert: true` and the right
    `contentType`, and sets `recording.mime`;
  - it writes a JSONL backup of every row's `recording` before writing, to `tooling/backups/`.

  The same rule means copying `sniffAudioType` in, with a comment naming call-recording.ts, because a tooling
  script cannot import the edge's TS.
- [ ] **Step 3:** Run the test. Expect PASS.
- [ ] **Step 4:** Commit: "A script that retypes stored recordings, dry run by default".

### Task 12: Ship PR 2

- [ ] Run the full suite and typecheck. Push, open the PR, then squash-merge on green (edge code, no migrations).
- [ ] Run `recordings-retype.mjs` in dry run against production with the service-role env (read-only). Show Ruben
  the plan. Only on his yes, run `--apply` and read back one object's `content-type`.
