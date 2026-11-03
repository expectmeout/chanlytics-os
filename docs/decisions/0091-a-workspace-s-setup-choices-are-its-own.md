# 0091 · A workspace's setup choices are its own, and money taken starts the service

**Status:** Decided on the onboarding PRD of 3 November 2026 (Ruben: "all is approved as you suggest"). Built on the
lane `onboarding/to-a-ten` from main's `6c4da4d1d`, with migrations 00513 and 00514 (working numbers). Amends decision
0073's items 1 and 2 (what a step is done by, and who buys the number).

## Context

- What the first run's Where it answers chose (the number kept, moved or new, and where WhatsApp answers) and the marks
  that say a step was done lived in the member's own saved view (`memberships.views.setup`). A partner who set a
  workspace up handed its owner a first run with nothing chosen; two owners could stand at two steps; the back office
  read a step nobody stood at.
- After payment the number was bought by the paying tab (a `useEffect` with a staleness timer): a tab closed after
  paying left a paid workspace with no number until someone came back.
- The calls choice had three ways, all a number. A business whose customers only write (WhatsApp, a website form) could
  not finish the first run, and "you're live" was mailed only on the first activation of calls.
- Finish's activation was two writes (the row on the member's session, the event on the service role), and the route
  said it "gates nothing at runtime yet" while its words said "switch it on".
- Four ways a workspace starts (the create screen, a lead's preview made theirs, a partner's set-up, a hand-over
  accepted) each repeated their own follow-ups, and a partner's set-up gave the workspace no alert address until its
  owner accepted.

## Decision

1. **The choices are the workspace's.** `setup_choices` (one row a workspace: `phone`, `whatsapp`, `marks`, `version`),
   read by members under RLS and by the service role, written through `setup_choice_set` (the settings permission, the
   version compared, `settings.changed` in the same transaction) from `PUT setup/choices`. Setup's DTO carries it as
   `workspace_choices`, and contracts' `withWorkspaceChoices` puts it over the member's view before every step is
   worked out, so every member and the back office stand at the same step. What a member puts off stays theirs. The
   row was copied once from each workspace's owner's view (else a partner's).
2. **Money taken starts the service.** Stripe's webhook turning billing to `trialing` or `active` asks
   `startChosenLine`: a new number picked is bought as picked; a kept number's receptionist gets one in its area code;
   a move, a person asked for, or Not by phone starts nothing. The lines sweep asks it again every quarter hour for each
   workspace with a number chosen, and tells the platform of a start that failed. The tab may still press: the line
   that already stands is its answer, not a refusal.
3. **Not by phone.** Where it answers offers "We don't take calls", kept as the number's choice
   (`phone: {way: "none"}`, `callsNotByPhone`). The step is then done, Go live starts the trial with no number and no
   forwarding, and is done once billing runs and a chosen channel answers. Setup's line row says Not by phone with a
   way back to a number.
4. **Going live is one write, and says what it is.** `capability_activate` / `capability_deactivate` write the row and
   its event in one transaction on the member's session. An activation is the owner's word that a channel is theirs:
   the receptionist answers a channel from the moment it connects, and nothing at runtime reads the row. Finish switches
   on every channel that answers; the workspace's first activation of any channel (calls or WhatsApp) mails "you're
   live", and the mail says each channel it answers.
5. **One way in.** `workspaceBegun` is what follows every workspace made, whichever door: the platform told, the first
   alert address (the creator's, or the owner's beside any the partner keeps, from the partner's set-up on), the marks a
   preview earned kept on the workspace, and sign-up's answers cleared.

## Not decided here

A runtime gate that holds a channel's messages until the owner switches it on: considered on the PRD and left out,
since it would hold real customers of every workspace answering today and needs its own design for calls.
