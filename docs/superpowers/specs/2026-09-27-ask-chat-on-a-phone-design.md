# Ask on a phone: one thread, and the three lead each answer

Status: approved 27 Sep 2026. Ruben chose **D** from the canvas "Ask Chat on a Phone"
(https://claude.ai/artifact/98zQrUJusNYgMQtRdXfNhT), after A · Thread, B · Chapters and C · Spotlight, and asked for it
"end to end cleanly without overlapping the other agent's work". Read against main at 08b830b1f (Ask Rewired 4.7).
It changes the phone's takeover (720px and under) only; the desktop Line, the home, Earlier, voice, the cards and the
keys stay as the Stage built them (docs/superpowers/specs/2026-09-23-ask-the-stage-design.md).

## 1. What is wrong today

- **An earlier answer needs a tap.** The phone draws only the latest turn. Every earlier one is a 40px fold (its
  question, its answer's first words, a chevron) that opens one at a time, and after three the rest hide behind
  "+N earlier in this conversation" (`ask-real.jsx` `arFolds`, `AR_FOLDED`; the Line's spec, 6.4).
- **A list arrives as a paragraph.** The prompt forbids lists (`server/ask/prompt.ts`, ASK_RULES), the format has one
  `say.detail` string (`contracts/ask/answer-format.ts`), `clip()` collapses every line break (`ask-answer.ts`), and
  the page draws one `<p>`. `show.items` take only rows read this turn, so what Ask can do, or what to say to it, has
  nowhere to go but a run-on sentence (Ruben's two screenshots, 27 Sep). Fixed by part B (section 7), not here.
- **The answer is heavy on a phone.** A 19px headline of up to 160 characters, a rail of 12px squares with a 14px
  gutter beside every part, figures as stat cards, and follow-up chips that cut off inside the answer.

## 2. Decisions

- **D1 One thread.** On a phone every earlier turn is drawn in full, oldest first, in the one scroller: its question,
  then its answer, its cards in the state they were left, its Open. No folds and no "+N earlier". The desktop keeps its
  folds above the band.
- **D2 Your words are a sent bubble.** Each question stands at the right in the Inbox's own sent bubble
  (`--bubble-us-bg`, 15px, radius 20 with the corner under the words at 6). It is the only bubble: answers are open.
- **D3 The three lead each answer.** One face, the hero's, stands between the newest question and its answer:
  - reading (a turn with no words yet, or a quick answer on its way): large, the reading line under it;
  - answering (the words streaming): small, beating over the words;
  - answered: a small still mark at the answer's start, left. Older answers carry none: the face moves to each new
    turn, and a turn left behind keeps only its words.
- **D4 The three come forward to listen.** In a conversation, while the field is in use or a held mic listens, the
  thread dims and a band above the field holds the three, listening (and the words heard, while a mic listens). The
  thread's own face is hidden meanwhile: one character on screen.
- **D5 A new question pins to the top.** Sending scrolls the thread so the question stands at the top of the screen;
  the newest turn is at least the screen's height, so its answer grows down into the room below. Opening a
  conversation from Earlier lands the same way, on its newest question.
- **D6 The next questions ride above the field.** The newest answer's `do.next` leave the answer and stand in one row
  over the field that scrolls sideways, never cut to an ellipsis. Older answers show none. Not while a turn runs, and
  not while the field is in use (the keyboard's room).
- **D7 Latest.** Scrolled up past the newest question, a "Latest" pill with the three's still mark (`Icon three`)
  stands over the field; a press pins the newest question again.
- **D8 The answer, lighter.** On a phone: no rail squares and no gutter; the headline at 17px; the detail at 15px in
  ink; the rows it names as bordered rows; each figure one line (the value in weight, what it counts, how it moved,
  and its source under it on a press). Cards as they are.
- **D9 New.** In a conversation the head's "Clear" reads "New", with the plus. It does what Clear did: the
  conversation ends and stays in Earlier.
- **D10 Unchanged:** the home at rest (the three large, Right now, the page's questions), composing on the home
  (the Stage's 5.9), Earlier, hold to talk, Stop, the swipe and Back, the cards' verbs, the keys, the desktop Line.

## 3. The phone, state by state

| State | The thread | The three | Above the field |
| --- | --- | --- | --- |
| Home (no conversation) | the rows | the hero, large, pills under | nothing |
| Reading | earlier turns; the question pinned | large, under the question, the reading line | nothing |
| Answering | earlier turns; the question; the words | small, beating | nothing |
| Answered | earlier turns; the question; the answer | a small still mark at its start | the next questions |
| Answered, words left in the field | the same (a draft never brings the rows over a conversation) | the same | the next questions |
| Field in use / mic held | the same, dimmed | hidden | the band: the three listening |
| Scrolled up | every earlier turn in full | out of sight with the newest | Latest |
| Earlier | the list | small, with the question under them, as before | nothing |

A question asked from the keyboard lets it go, so its answer lands Answered, never dimmed; a tap on the field brings the
three forward again. Earlier and the home after New open at their top; a thread opens at its newest question.

Motion: the hero's stage eases between its sizes over 200ms (the Stage's own), and the canvas fits its box every frame,
so the squares shrink with it. Under reduced motion there is no easing and no smooth scroll.

## 4. Where it goes

- `pages/ask-turn.jsx` (the answer kit, `window.AskAnswerKit`): `AskQuestion` (the bubble), `AskThread` (the earlier
  turns), `AskNextRow`, and the `next` prop that keeps the next questions out of an answer.
- `pages/ask-hooks.jsx` (`window.AskHooks`): `useAskPin` (D5) and `useAskLatest` (D7), with their arithmetic pure.
- `pages/ask-real.jsx`: the shell chooses the thread on a phone and draws the band, the row and the pill. It may not
  grow: `file-length.json` holds it at 1,055 lines, so the phone's folds leave it for the kit.
- `styles/ask.css`: the phone block only. `pages/ask-text.jsx`: New, Latest, Listening's band label.
- No new file, no new window global or publisher; top-level names unique across the tree (legacy/CLAUDE.md).
  `Chanlytics.html` bumps each edited file one past main's key, checked again right before the merge.

## 5. Tests

`tooling/scripts/tests/ask/ask-palette.test.mjs`, on the stub React through the real palette:
- a phone follow-up keeps the earlier turn drawn in full, its question a bubble; no fold on a phone; the desktop still
  folds (the existing fold tests run as the desktop);
- the three's states: large with the reading line while it reads, small while the words stream, the still mark once
  answered, and one face in the thread at a time;
- the field in use in a conversation: the band listens, the thread dims and is still drawn, the thread's face hidden;
- the next questions stand above the field for the newest answer only, and nowhere while a turn runs or the field is
  in use; the walk's ids unchanged;
- the head says New in a conversation and does what Clear did;
- `useAskPin` and `useAskLatest`'s arithmetic, pure.
`e2e/`: nothing pins a fold, the hero or the phone's Clear (checked); the desktop's `ask-clear` is unchanged.

## 6. Proof

Run the dashboard from the worktree, the e2e owner signed in, 390×844, light and dark: the home, a question reading,
answering, answered with its next questions, a follow-up with the earlier answer above it, the field in use, scrolled up
with Latest. The turns' words come from a stand-in `window.__ask.send` in the page (no model spend), and one real
question proves the wire. Ruben sees the captures and says yes before the merge (his rule for a new design).

## 7. Part B: answers shape themselves

A second pull request, after Ask Rewired's Phase 4 closes (4.8) and after the open pull requests on `prompt.ts`
(#1206, the health-rule fix) land, rebased onto them. It touches the program's files, so it goes alone and small.

- **The format.** `say` becomes `{ headline, body }`: `body` is up to five blocks, each
  `{ kind: "text" | "points" | "steps" | "asks", label, text, entries: [{ lead, text }] }` (every field present, empty
  when unused, as the format's rule is). The model picks the blocks; one renderer draws any mix, so no answer has a
  template of its own.
- **Stored answers.** `AskAnswer.say` keeps `detail` as the body's plain words (copy, reading aloud, the v1 text, the
  "not from your data" check read it unchanged) and gains `body` for the renderer. An answer stored before part B has
  no body and draws its detail as today.
- **The prompt.** The rule "no markdown, lists, headings" becomes: no markdown in any string; three or more parallel
  things are points (a lead when they group), a sequence is steps, things they could ask next are asks, a label only
  over a group; a sentence or two stays text. The examples show one body.
- **Streaming.** `partialSay` reads the body as far as it has arrived, so points appear one by one.
- **The renderer.** Points with a 6px square (the three's tile) and a bold lead; steps numbered; asks as chips that
  ask; a label over a group.
- **Caps** in `ASK_ANSWER_CAPS`, said in the format's descriptions, as today.

## 7a. D, refined (Ruben, 27 Sep late: "approved perfect lets do it")

Drawn on the canvas's second page, "D · refined" (the as-built captures numbered, R1–R5, the cards sheet). What ships
with part A, in the UI alone: the phone's screen, and the card and the answer's two acts, which a desktop draws from
the same kit (its card as a phone's, but for the 40px acts; its acts where they stood, at the field's end):

- **D11. One move for the three.** Large while Ask reads; the moment words arrive they stand at the answer's start,
  speaking (`.ask-hero.sig.speaking`), until it is whole; then still. They no longer shrink to the middle first.
- **D12. Reading says what Ask has read.** The turn's last three reads (the Line already keeps them, `live.traces`),
  a repeat said once: the earlier ones dim after a small square, the newest live after the reading dot; "Thinking…"
  before the first (`AskReads` in the kit).
- **D13. The field says "Follow up…" while Ask answers** in a conversation; the question is the bubble above.
- **D14. Copy and Read aloud under the newest answer** (`AskActs`): the desktop's two acts, which stand beside its
  field; a phone had neither. Never under an earlier answer, never while one is written.
- **D15. Two quiet signals.** A number with a source is underlined dotted; the next questions' row fades at its right
  edge, with room at its end so the last question is never faded when scrolled to.
- **D16. The card.** The kind's mark in a tile, the title over the kind, the change on the sunken ground (a reply as
  the sent bubble it will be), under a reply the undo's own words for what follows ("Sends 15 seconds after you
  approve; cancel within them"), Not now apart from the act; 40px acts on a phone. After the act, one line on the sunken
  ground; a send that can still be taken back leads with a ring emptying over its own window (`cancelable_until`) and
  its button says Undo; when the window closes the ring and the Undo go. The card keeps what it sent above the line.
  The ring's end is its own animation's (no timer): under reduced motion it holds still for as long, so the Undo still
  goes with the window.

Not taken, each for a rule another program holds:

- **Faces on a row** (the canvas's R3): every row wears its kind's mark (Ask Rewired PR 4.2 pins it).
- **Before → after on a settings card** (the Hours card): the card carries the change, not what it replaces; its
  words would be a contracts helper in the Ask program's files. The card says the change, as today.
- **The reason beside a gated Approve**: the reason is the control's, shown at a press (Ask Rewired Phase 3, D8).
- **The card's Open in its head**: Open stays a button (a pinned test on the deal card).
- **"Sent" once the window closes** (the canvas's R5 sheet): the line keeps the receipt the reply's spec writes
  (contracts ask-proposals, the Ask program's), which still says "sends in 15 seconds unless you cancel" once the ring
  has emptied. Words for after the window are that program's to add.

## 8. Risks

- **Another session edits the same files.** Checked before the branch, before the push and before the merge:
  `gh pr list` on these files, the Ask worktrees, `ListAgents`. The version keys go one past the highest in main and in
  every open pull request.
- **The keyboard.** The band stands over the field inside the room the Stage already makes for the keys (`--ask-keys`);
  nothing new moves the view.
- **A long conversation.** Every earlier turn is drawn, and a thread read holds at most 60 messages (`store.ts`
  `MESSAGES_CAP`), so the page never holds more than thirty turns. Since Ask Rewired 5.1 (#1251) that read takes the
  NEWEST sixty and says when older ones were left out (`truncated`); before, it took the oldest, and a reopened long
  conversation missed its newest. It is the Ask program's file and stays theirs; the thread draws whatever the read
  returns.

## 9. Out of scope

Earlier grouped by day with each answer's first line (it needs the thread list to carry the headline: server work);
the desktop Line; the ✦; voice everywhere.
