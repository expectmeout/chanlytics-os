# 0122 · A thank-you waits for kept

**Status:** Accepted by Ruben, 10 November 2026 ("Wait for Kept"), and built the same day. No migration. Written against main at `1f5095c050`.

## Context

The message the day after a visit (`visited`: "thanks for coming to Maya Studio yesterday. How did everything go?", and one version asks for a Google review) looked once a day, at its hour, for yesterday's visits, and went to everyone who had one and had not booked again. It was held only for a visit the record said was missed or cancelled (contracts `appointmentHolds`).

A member can say whether someone came once the visit has begun (decision 0002, step 8), and Today asks "Did they come?" the next morning: the same morning the message goes. So a no-show nobody had marked by that hour was thanked for coming, and could be asked for a review. Marked missed later that day, the sequence on a missed visit (decision 0119) wrote to them as well.

Three ways were put to Ruben: wait for the word that they came; give the word a head start (ask the evening before, send at midday); or only stop the second message. He chose the first: it is the only one where a no-show is never thanked.

No workspace was running a sequence on the moment when this was built (production, 10 November: one draft never started, two paused samples), so nobody's messages changed under them.

## Decision

1. **The thank-you goes only for a visit a member said was kept** (contracts `waitsForKept`). The day's look names everyone with a visit yesterday as before, and leaves out each whose visit is not marked kept (`playbookRunReach`, by the latest visit of the day that is surely theirs, the one its words name). A person's visits already carry the word (`VisitDto.said`), so the look reads nothing new.
2. **The ones left out are counted, never dropped in silence.** `RunReach.unmarked` is how many wait on the owner's word, and the run's own list of who it leaves out says it with where to say it: "2 are not marked kept yet · Say who came" (contracts `reachLines`).
3. **The send asks the row once more.** A thank-you's recipient keeps `visit_was: "kept"`, and `appointmentHolds` lets it go only while the record still says kept: a Kept corrected to Missed between the look and the send, or a row that is gone, holds it.
4. **A visit marked kept after the day's look is thanked on its own.** The look is once a day, so a word said after it found nobody to send. The subscriber `visit_reminder` hears the Kept (`appointment.changed`, change `kept`) and asks the edge's door (`apps/edge/lib/campaigns/late-thanks.ts`), which runs the workspace's step on `visited` for that one person through the run a late booking's reminder uses (decision 0118: a batch with no day, once per visit). One rule says when (contracts `keptThanksAt`): said on the visit's own day, tomorrow's look names it; said the day after before that day's look, the look names it; said after the look, it goes now, while the day's sending hours last; said later, nothing goes, because its words say "yesterday".
5. **The word says what it sets going.** `POST calendar/visits/:id` answers `follows` for a Kept as it does for a Missed (decision 0119's loose end): the sequence by name, when its thank-you goes, whether it waits for an OK. Today's row says it: "Kept · “After the appointment” thanks them tomorrow 10:00 AM."
6. **The moment says what sends it.** Its hint is "The day after an appointment you mark kept, when nothing is booked next", its schedule "everyone whose appointment yesterday you marked kept", and Ask reads both.

## What it does not do

- **A workspace that never marks its visits sends no thank-you.** That is the choice: the message thanks someone for coming, and nobody said they came. The run's left-out line and Today's "Did they come?" are what tell the owner; nothing reminds them beyond those.
- **No press marks a whole day kept.** Each visit is one press on Today or the Calendar. Offered to Ruben as a follow-up, not built.
- **A visit marked kept two days on is not thanked.** Its words say "yesterday". A message that names the day ("on Monday") would be a second message to write and approve.
- **The moment is still a daily look, not an occasion's.** It keeps its count, its daily batch and its three modes. Moving it to decision 0119's engine (enrolled by the Kept, at a time of its own) was weighed and left: forty test files and every page that counts the moment read it as a visit's.
- **A late thank-you under Ask me is an approval of its own**, as a late booking's reminder is (0118).

## Deploy order

Either. The edge's look and send, and the dashboard's counts and door, each read the rule from contracts; until the edge is out the look names unmarked visits as before, and until the dashboard is out its pages say the old words.

## Held by

`tests/playbooks/visit-playbooks.test.mjs` (who the look names and leaves out, and the send's check), `tests/campaigns/late-reminders/a-late-kept-is-thanked.test.mjs` (the rule, and the door over a database in memory), `tests/events/a-late-booking-is-reminded.test.mjs` (the subscriber), `tests/calendar/calendar-feed.test.mjs` (the door's answer), `tests/today/record/a-visit-to-mark-is-a-row-of-the-queue.test.mjs` (Today's row), `tests/playbooks/playbooks.test.mjs` (the left-out line).
