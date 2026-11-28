# 0154 · A booking is put down to one source, inside one window

**Status:** Built on one branch (`reports/what-brought`, lane 4 of the whole-system plan of 28 November 2026), for
Ruben to accept: it changes numbers an owner has seen, and three of its calls are his to reverse (below, "Ruben's
calls"). Written against main at `6be0c37e60`. One migration, `00732`, written and not applied. Either deploy order.

## Context

Two of the three outside reviews of 28 November 2026 rate what a page says a form, an ad or a post "brought" as the
weakest part of the product (R2.19, R2.20, R2.21, R3.16), and they are right. At `6be0c37e60` a booking was put down to
something by four rules that did not agree:

| Where                                                       | Whose booking counted                   | Which visits                                              | How long after |
| ----------------------------------------------------------- | --------------------------------------- | --------------------------------------------------------- | -------------- |
| Ads, "Booked" (`ad_people_in`, 00651; 0049, call 6)         | new people whose first touch was the ad | any visit, from any source, that starts after that touch  | for ever       |
| Ads, "wrote again … booked after" (`ad_people_back`, 00678) | known people who wrote from the ad      | asked for here or added by a member, made after           | for ever       |
| Forms, "visits" (`form_results`, 00709)                     | every person, on every form they filled | the time asked on the form, or one made here after        | for ever       |
| A piece, Reports › Content (contracts `creditOf`, PRD 9.3)  | anyone who answered the post            | asked for here or added by a member, made after the touch | 14 days        |

So one booking was counted once on every form its person had ever filled in; an ad's worth added every later visit of
its people; a form's "visits" was a count of people; and a sign-up was "confirmed" where the person's consent read so
today, whenever and however it came to. AI is about to be asked to learn from these numbers.

## Decision

1. **One rule, in the database.** `booking_sources(workspace, since, until, people)` answers, for each booking made
   in a span, every source its person touched inside the window before it, each source once at its first touch, one of
   them the booking's **main** source and the rest **helped**. Forms, Ads, a piece and Reports read it; none works out
   who booked a second way. Contracts' `creditOf` and `bookedAfterTouch` are gone: the rule had three homes and has one.
2. **A booking** is a visit neither cancelled nor only asked for, with a moment it was made that the record can prove:
   its row's own time where it was asked for here and confirmed or added by a member; the moment it arrived as a
   customer's booking (`appointments.arrived_at`, decision 0141) where it came from a booking page, its email or a
   calendar. A visit with neither, such as a calendar's first read, is put down to nothing. Its person is the one it
   names or, where it names none, the one its number or address is.
3. **A touch counts** when it is the same person's, not after the booking was made, inside the window, and before the
   visit starts. Touches are read from every home: `touches` (a post, a link, a comment left on an ad), `ad_entries`
   (a message that came from an ad), `contacts` (an ad as how the person first came, kept since before an ad's entries
   were) and `form_entries` (a form made here, or one the business's site sends; never a held entry or a test).
4. **The window is fourteen days,** said once: `credit_window_days()` in the database, `CREDIT_WINDOW_DAYS` on a page,
   held equal by a database test. It is the window Ruben took for a post (the content loop PRD's call 16).
5. **One main source a booking:** the one the booking itself names (the form its time was asked for on, the post or ad
   its conversation answered: `appointments.through_type`, `through_id`); where it names none, the first thing its
   person touched. Every other source on the way helped. Main rows are one a booking and may be added up; helped rows
   never are, and a page shows them beside, labelled.
6. **Names say what is counted.** A form's count of people is "N people booked", never "visits"; the bookings
   themselves are a number of their own (`appointments`); a form's own totals count each person once however many
   places they came through.
7. **A sign-up's confirmation is its own event,** counted once at its own time (`contact.consent_changed`, source
   `confirmed_signup`, written by the yes door alone) for the form whose entry asked for the email pressed. Who has
   said yes today (`subscribers`) is a second number, apart.

## What an owner sees change

On one seeded workspace (the engine proof, `dev-tools/db-without-docker/example-doors-what-brought.mjs`, 51 checks,
17 red on main):

| Number                                                      | Before | After |
| ----------------------------------------------------------- | ------ | ----- |
| Form 1, people who booked (was "visits")                    | 4      | 2     |
| Form 1, it helped                                           | —      | 1     |
| Form 2, people who booked                                   | 3      | 1     |
| Form 2, it helped                                           | —      | 2     |
| Both forms' booked, added (three bookings were a form's)    | 7      | 3     |
| Site form 1, confirmed                                      | 1      | 2     |
| Site form 1, subscribers today                              | —      | 2     |
| The ad, Booked (of 4 people it brought)                     | 4      | 2     |
| The ad, bookings left out of its worth for having no amount | 3      | 1     |
| The ad, wrote again and booked after (of 2)                 | 2      | 1     |

Where a number falls it is because a booking was counted more than once, was made past the window, or has no moment it
was made. Where one rises (confirmed) it is because the confirming was real and the old count missed it.

## Ruben's calls

- **The window: 14 days, not 30.** The plan's brief said 30 "unless the code's own facts argue another". The fact is the
  14 days already taken for a post. With 30, the seeded workspace's form 1 would say 3 people booked and the ad 3.
- **A booking's own word comes before the first touch.** The brief said "the first touch inside the window". Where a
  booking names its source (a time asked for on a form; a visit asked for in the conversation a post opened) that
  source is its main one even if something else was touched first, as the content loop's calls 31 and 36 already said
  of "from this post". Reversing it is one line of `booking_sources` (the order of its last window).
- **A booking that arrived from a booking page or a calendar counts,** at the moment it arrived. Before, a post never
  took credit for one and an ad always did. Now all three read it the same way.
- **Not decided here: a commenter's booking on the ad's own row** (decision 0049: an ad's people are those whose first
  message came from it). Nothing is built for it. The rule already knows the booking is the ad's; the row counts its
  people alone. On the seeded workspace the ad's Booked is 2 as built, and would be 3 with the commenter's and 4 with
  everyone's whose booking the ad is the main source of.

## Deploy order

Either. `form_results` keeps `visits` (holding the people who booked) and every key it had; `ads_page_counts` and
`ad_people_back` keep their shapes. A dashboard ahead of the database reads `visits` where `booked` is not there, a
form's totals as its places added, and no booking for a piece from `bookings_with_sources` it cannot find.

## Not decided here

How a reach-out, a review ask, or someone who simply wrote or walked in is read as a source: the plan's lane 4, part
3, maps what each leaves today and says what is unknown as unknown.
