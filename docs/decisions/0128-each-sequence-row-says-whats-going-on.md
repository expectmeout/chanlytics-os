# 0128 · Each sequence row says what's going on

**Status:** Accepted by Ruben, 11 November 2026 ("Yes, plan it" on the canvas _Sequences: lines that tell the truth_, calls S1 to S9). Stage 1 built; Stage 2 built ("Yes, build Stage 2", 11 November, with the corrections below). Written against main at `873a8c23eb`; stage 2 against `a591e77196`.

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

- **Ask's `needs_count` does not count a failed one-off, nor a stuck sequence.** It counts the people and emails an OK or an answer clears; a failed send is cleared by sending again, a stuck lead by Check again. What needs you is still said of each (stage 2, point 4).
- **Today and the bell word a waiting batch their own way** ("Win-back waits for your OK"). They could take the same "since" later.
- **A lead refused for good is still counted in it.** One written to already, a customer, or on the never-again list stands on its list and reads "in it"; it asks nothing of its owner, so it is not said as stuck. Taking such leads out of the count is its own change.
- **No totals over thirty days.** The canvas drew "40 sent · 6 replied · last 30 days". A customer's reply is found by reading each thread a message reached, so counting a month of them for every row would make the list slower as a business sends more. The row keeps its last batch's own numbers; a month's are Reports'.

## Stage 2: the list sees what is stuck

One change to the list's read (`sequence_overview`) adds three facts, and the line each gives. A sequence that should be going and isn't joins Needs you, in its place by how long (`sequenceStuckOf`, contracts `campaigns/sequences/run-off.ts`, which the group, the order and the line all ask).

1. **Leads that could not be checked** (`stuck`): "3 leads couldn't be checked · since Oct 28". A lead whose email came back "Couldn't check" is left out of every batch, and nothing checks it again by itself, so it stood on its list for good and the row said "3 in it". It is mended by Check again on the sequence's People, and the leads clock asks again by itself (decision 0131); Leads' own Check again refused such a lead until then, since it had been kept.
2. **A run that did nothing** (`last_run_off`, `last_run_for`): "Didn't run · no calendar is connected", by the reasons the record already says (`sequenceRunOff`), read for every row that is on and runs by its hour.
3. **Who is between two steps** (`between`): "Next tomorrow 9:30 AM · 9 people" in place of "18 in it": the first of those with a time to come, and how many have one.

4. **Ask counts what the list counts.** Ask's read of the list says what needs you in every sequence the list files under Needs you: the sentence of who waits where someone does, else the row's own line (a one-off that failed, leads that could not be checked, a run that did nothing). Its number on top is the page's, the sequences under Needs you, as the list's header counts them; it summed people and emails before, so a stuck sequence added nothing.

And `last` counts a batch still going that has sent some: one held email kept a batch open for days, and its 18 sent were counted nowhere (Sort by last sent, and what Ask reads).

**The list hears what it now says.** The page hears a lead's own row while it is on screen (it left the `leads` table unheard before: a sequence was named by its list alone), so a check that lands takes the stuck line away without the page being opened again. The three tables the reason's door reads beside it (the caller's seat, People for "a customer is never written to", the never-again list) are said in `tests/baselines/reads-not-heard.json`, beside the Leads page's own entries for the same door. `last_run_off` answers the run's `skipped` only where it is a reason: a run that went writes a count there.

**Corrected from the canvas, by what the code and production said:**

- **Waiting more than a day is not stuck.** A cold email's first step takes a day's worth of leads, so most of a long list has stood there for days, and goes. "N leads haven't started" would have been said of every large sequence. Stuck is a lead its first step refuses for a reason its owner can mend; today that is one reason.
- **The reason is asked, never worked out again,** through the door a member already has (`sequence_queued_why_not`, which asks `reach_out_why_not` at the list's own setting), and of at most the 200 leads that have stood longest on each list, past a day: the reason costs a lead at a time, and a list of 50,000 must cost what a list of 200 does. Asked by no member (the service role), the door answers nothing and nothing is said to be stuck.
- **Between two steps is three kinds of people:** a time to come, a time already past (their step's next run makes their batch), and no step left. Only the first is counted.
- **Where each one stands is still read once** (`sequence_places`): the new counts come from that one read. On production's largest workspace the read ran in 16 ms.

Either deploy order: the function keeps its name, its arguments and its jsonb answer, which gains keys; a dashboard before it ignores them, and one after it, on a database before it, says of each row what it said.

## Held by

`tests/sequences/list/each-line-says-whats-going-on.test.mjs`, `tests/sequences/sequence-words.test.mjs`; stage 2 by `tests/sequences/list/the-list-sees-what-is-stuck.test.mjs`, `tests/sequences/list/ask-counts-what-the-list-counts.test.mjs` and `tests/shell/hearing/declared-reads-are-what-was-heard.test.mjs` (the page hears a lead's row), and on a database by `tests/leads/workbench/one-road-to-a-sequence.db.test.mjs` (leads that could not be checked) and `tests/sequences/sequence-doors.db.test.mjs` (a run that did nothing, a batch still going, between two steps).
