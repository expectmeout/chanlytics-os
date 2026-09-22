# Today and the Calendar on a phone: fewer words, one font, one bar

**Date:** 2026-09-22 · **Status:** approved by Ruben ("continue as you suggest") · **Scope:** one PR

## What Ruben saw

On a phone, Today's "Worth a look" band reads as wordy and cluttered, and one of its lines is set in a different
font from the rest of the site. The period sentence under the day's card ("Last 90 days: 30 customer messages, 70%
answered by the receptionist, median reply 1m 00s, 34 calls.") runs three lines. On the Calendar, the service picker
looks useless and the head takes more room than it should before the first day.

His standing rules apply: the work first on a phone, numbers as one quiet sentence, no second typeface, no technical
data an owner does not need, explanations one tap away ([`.impeccable.md`](../../../.impeccable.md)).

## What is there

- **Worth a look** (`pages/dashboard-a-week.jsx`, `styles/dashboard-a-v2.css`): each row is a tag, a sentence, an
  arithmetic line (`.tl-math`, Geist Mono 11.5px since the 19 Sep canvas), "Waiting now" chips, and two or three
  doors. The card head carries the subtitle "from Reports and People, read together". At 390px the two rows measure
  168px and 117px with the doors wrapped under the text.
- **The period sentence** (`todayPeriodLine`, `packages/contracts/src/today.ts`) is the foot of the day's card,
  beside Open Reports; three lines at 390px.
- **The Calendar head** (`pages/calendar-real.jsx`, `styles/calendar.css`, `styles/mobile.css`): on a phone four rows
  before the first day: the range and the steps; the four views plus the service picker; the three counts over two
  lines, each with a tail ("on your calendar", "that fit Balayage", "at least 2h notice"). The picker filters open
  times to slots long enough for a service; the rule tail is the first booking rule, already under Hours and rules.

## The design

### Worth a look

1. **Every width:** the arithmetic line uses the page's own type (`font-family: inherit`), muted, tabular numerals
   kept. The subtitle is removed.
2. **Phone (≤720px):** the arithmetic is a receipt, not a decision, so it is hidden until asked for. The sentence is
   a button (`aria-expanded`, `aria-controls`) that reveals the arithmetic under it; "Ask why" carries it anyway. The
   markup keeps the arithmetic in the DOM with the `hidden` attribute so tests and Ask read the same words. On a desk
   the sentence stays a span and the arithmetic is always shown, as the day's figures show their receipts on hover.
   Width is read once per render through `matchMedia("(max-width: 720px)")`, the Calendar's own idiom (`crPhone`).
3. The tag, the waiting names and the doors are unchanged.

### The period sentence

One derivation, shorter at every width: `Last 90 days: 30 messages, 70% answered by the receptionist, 34 calls.`
The comparison in brackets stays when Reports has one. **Median reply is dropped from Today**; it remains on
Reports, which is the sentence's one door. The quiet form ("nobody wrote or called") is unchanged.

### The Calendar head

1. **Phone:** the service picker is hidden below 900px (CSS only; the desk keeps it, with the tests and the
   consultation note that depend on it).
2. **Counts:** `CrCount` gains a `note` beside `meta`. `meta` explains a missing number or a read in progress ("no
   calendar connected", "could not be read", "reading those days", "these days have passed", "it offers times up to
   14 days ahead") and always shows. `note` is the happy-path tail ("on your calendar", "that fit Balayage", "for a
   consultation", "at least 2h notice") and is hidden on a phone. On a phone the three counts run as one muted line
   separated by middots and may wrap once at a separator.
3. **Spacing:** the head's vertical gaps come down to the 4px scale (bar row gap `--space-2`, head top padding
   `--space-2`), measured before and after.

### Not changed

The doors and their words (#813/#821/#825), the leak rules and their sentences, the Calendar's desk layout beyond the
count words, the Booking link button, the day's figures.

## Proof

- `today-leaks.test.mjs` and `today-page.test.mjs`: the period sentence's new words; a phone case for the receipt
  door (matchMedia stubbed) proving the arithmetic is hidden until the sentence is pressed and that its words are the
  row's `math`.
- `calendar-honest.test.mjs`: the split between `meta` and `note`; the problem states still read as `meta`.
- `e2e/signals.ts` reads the arithmetic by `textContent`, so a phone run reads it hidden.
- Measured on the local e2e harness at 390px before and after: each leak row's height and word count, the foot's
  line count, the Calendar head's height and the first day's top.

## Plan

1. Contracts: `todayPeriodLine` words + doc comment; tests.
2. Worth a look: JSX (subtitle gone, phone receipt door), CSS (font, door reset, hidden state); tests; `signals.ts`.
3. Calendar: `CrCount` note/meta; JSX passes; mobile.css (picker, note, middots, gaps); tests.
4. Measure after; PR with before/after numbers; merge on green.

## Measured (22 Sep, built)

The local e2e harness serves no calendar read, so the real Calendar never mounts there; its head was measured as its
exact markup inside the mockup harness with the real stylesheets, main's and this branch's. Worth a look and the foot
were measured on the mockup harness's Today sample, which draws the same page.

| At 390px                          | Before                                           | After                                   |
| --------------------------------- | ------------------------------------------------ | --------------------------------------- |
| Worth a look, row 1 / row 2       | 168px / 117px                                    | 150px / 99px                            |
| The card head's subtitle          | "from Reports and People, read together"         | gone                                    |
| The arithmetic line               | Geist Mono, always shown                         | page type; on a phone behind the sentence |
| The foot (sample)                 | 19 words, "…, median reply 45s, 6 calls."        | 15 words, "…, 6 calls."                 |
| Calendar head                     | 140px, counts on 2 lines, service picker shown   | 114px, counts on 1 line, picker hidden  |
| Calendar head at 1280px           | 85px                                             | 85px                                    |
