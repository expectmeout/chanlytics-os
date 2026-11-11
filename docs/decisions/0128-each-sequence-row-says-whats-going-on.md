# 0128 · Each sequence row says what's going on

**Status:** Accepted by Ruben, 11 November 2026 ("Yes, plan it" on the canvas _Sequences: lines that tell the truth_, calls S1 to S9). Stage 1 built; Stage 2 adds four facts to the list's read. Written against main at `873a8c23eb`.

## Context

On 11 November four of the five live rows on Ruben's Sequences list were true but left out what mattered: "2 wait for your OK" had waited three days, "1 held" was an email held since Oct 30 while 18 others had gone, "Nov 6 · 0 sent · 0 replied" was a sequence that had finished, and "3 in it" was a sequence that had never sent. Needs you followed Sort, newest made first, so a three-day wait sat above a twelve-day one. The groups said Leads and Dates where Type said Cold email and One-off sends, and Type called customers' sequences "Sequences".

## Decision

1. **One line, one answer** (`sequenceRowLine`, contracts `campaigns/sequences/words/row-line.ts`): what needs you, a twin, a one-off's day, a paused one's people, next, in it, every lead through, what it sent, what starts it. The first that is true.
2. **A Needs you line says what and since when** ("2 follow-ups wait for your OK · since Sun"; a customer's batch "until tonight", when the sweep lets it lapse). Two kinds and more keep the short words with no date, because the list's answer keeps one oldest time for all of them. Ask reads the same sentence (`needsWords`).
3. **"Held" says what it is:** "1 email held for your look".
4. **No bare zeros.** A cold email with every lead through says so, and whether it adds new ones by itself ("All leads through · waits for new ones").
5. **Next says how many:** "Next tomorrow 9:00 AM · 6 people".
6. **Needs you lists the longest wait first,** whatever Sort says (`byLongestWait`), and the Sort menu says so in one line.
7. **One set of names:** Your customers, Cold email, One-off sends, in the groups and in Type.
8. **Sort says its order** once one other than the first is picked; **search** also reads the lead search and the list (`sequenceMatches`).
9. **A one-off that failed needs you** ("Didn't go · 186 people · Mon", its red Failed kept).

## What it does not do

- **Ask's `needs_count` does not count a failed one-off.** It counts what an OK or an answer clears; a failed send is cleared by sending again. The row's group says it needs you.
- **Today and the bell word a waiting batch their own way** ("Win-back waits for your OK"). They could take the same "since" later.
- **A cold email's leads that never started still read "3 in it"** until Stage 2.

## Stage 2

The list's read adds leads that never started and the most common reason (an email that came back "Couldn't check", which nothing re-checks by itself), a customer's run that did nothing, the next person due between steps, and sent and replied counted from every send. Each joins the line above in its place; what should be going and isn't joins Needs you. One migration; the database before the build.

## Held by

`tests/sequences/list/each-line-says-whats-going-on.test.mjs`, `tests/sequences/sequence-words.test.mjs`.
