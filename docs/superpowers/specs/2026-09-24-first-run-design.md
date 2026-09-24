# The first run: design

**Status:** approved by Ruben on 24 Sep 2026 ("go with the recommendations and start PR 1"), as Option A, refined.
The screens are on the design canvas https://claude.ai/artifact/9bvcfVCQU4A9HJscPJkbkj (version 2: R1–R11 desktop,
P1–P9 phone, V1–V8 the cases that branch, C1–C2 the parts and states). Checked against `origin/main` at `06ca4361`.

## The problem

A new owner signs in and lands on Settings › Setup: up to twelve rows in one list at one weight, most of whose
buttons send them to another Settings tab. Setup lives inside the whole app, lands once per session, and shows the
payoff ("try your receptionist") last. Settings is for changing things once you are set up, not for setting up.

## The design

A full-screen first run, one step per screen, steps named across the top on a desktop and "Step 2 of 4 · Your
phone" with a 2px bar and a sticky button on a phone. On the right on a desktop, the owner's own receptionist
fills in as they go (a strip on a phone). It is drawn over Setup's own view model (`contracts/setup.ts
setupSteps`), resumes from what is true, and stores no progress.

1. **Your business.** *Find:* the Google search has already run for the name typed at sign-up ("Is this Luna
   Studio?"); a Google sign-up names the business here instead. *Check:* hours, address and website from the
   listing; "How do customers buy?" (the workspace's `sells_by`: book an appointment, or some get a proposal
   first); the booking link only for businesses that book (found on their website when it is there); services
   suggested from the Google category; languages; the price rule shown as its default.
2. **Your phone.** Keep the number customers know (the default, pre-filled from the listing), get a new number,
   or move a number here (forwarding runs meanwhile). The trial starts here, with the plan's real price. While the
   number is set up (queued, a minute or two), the owner answers which phone rings (a mobile, a landline, an office
   phone system) and who the phone company is; then one code to dial, with an answering-machine warning. An office
   system is shown the number to forward to, with "we'll do it with you".
3. **Try it.** The owner calls their own number from their cell and does not pick up. The page moves the moment
   the call starts ("It picked up": forwarding verified), shows the words turn by turn, then the whole call. The
   transfer number is the cell they called from, or "take a message and email me"; never the forwarded number.
   Skippable after one nudge; Today keeps a "Try it" row until a call comes in.
4. **Live.** What it answers, where it puts callers through, where it emails the owner, what it knows; the real
   greeting word for word; "It will / Not yet" from the Business tab's own abilities. Finish records the
   activation and sends the "you're live" email.

After the first run, what is left (WhatsApp first, because the booking link goes out by WhatsApp on a call; then
the calendar; then someone to back you up) is one card on Today in the queue's own grammar, skippable, remembered
per person. The Setup tab leaves Settings; its address redirects. Texting is not offered (it is not sold yet).

## Decisions (24 Sep 2026)

1. The $1.15 number fee is **included in the plan**; nothing bills it, so nothing quotes it.
2. The booking link becomes **optional for a business that sells by proposal**; the receptionist takes their
   details for a deal instead.
3. An office phone system is **shown the number to forward to**, with a person offered to do it with them.
4. A new **"you're live" email** carries the test call.
5. The test call stays **skippable after one nudge**.

## What has to be true first (the fixes)

- **F1** A number the business keeps and forwards to the receptionist is not a "published number does not reach
  it" conflict.
- **F2** A transfer number that forwards to the receptionist is refused, from both sides (the transfer row, and
  forwarding a number that is the transfer number), because the call would come straight back.
- **F3** A new workspace's first alert address is its creator's, so the owner is emailed when someone needs them.
- **F4** Checkout can return to the first run (a closed list of places), not only to Settings › Billing.
- **F7** The Google details read keeps the listing's hours, phone, website, category, whether it serves an area rather than an address, and time zone,
  at no extra cost (the read is already billed at that tier for the reviews).
- **F5** (landing on the first run, one-press create) is the first run itself, so it is PR 2, not a fix.
- **F6** needs no fix: the server never forced a published number; only the Business tab's create fold does, and
  the first run does not use it.

## Delivery

One program, one review round per PR, each PR working on its own, either deploy order:

1. **PR 1, the groundwork:** F1, F2, F3, F4, F7 and decision 1. Nothing new appears.
2. **PR 2, the shell:** the full-screen `#/start` mode, resuming from Setup's state, the landing and the one-press
   create, Settings › Setup removed, the Today card replacing Setup's line.
3. **PR 3, your business:** Find and Check on the Business tab's record kit, Google's facts, category
   suggestions, how customers buy, decision 2. It ships as three parts, each on its own and in either deploy order:
   3a Find (the search already run, one finder, V1); 3b decision 2's reading half (a receptionist with no booking
   link parses, and the prompt, the voice tools and the Business tab say so; nothing saves one yet), because today a
   config with no link parses as broken and silences the receptionist; 3c Check (Google's facts become the
   receptionist's first config, the Business tab's own editors, how customers buy, category suggestions, languages,
   and proposal sellers saving with no link).
4. **PR 4, your phone:** the three ways, the trial with its price and return, the number getting ready, the codes,
   office systems.
5. **PR 5, try it and live:** the three-moment test, the transfer choice, nothing-came-through, the activation, the
   "you're live" email.

## Not in this program

Texting in the first run; choosing a voice; a browser test call before the card; asking for the business before
the account; any change to Retell's fixed greeting.
