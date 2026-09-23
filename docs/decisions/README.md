# Decisions

Designs that have been decided and are not yet built. One numbered file per decision:
[0001](0001-channel-neutral-inbound.md) a channel-neutral inbound pipeline,
[0002](0002-appointments-record.md) an appointments record, [0003](0003-team-assignment.md)
team assignment, [0004](0004-deals-record.md) a deals record, [0005](0005-a-payment-writes-won.md) a payment that writes won, and [0006](0006-a-proposal-follow-up.md) a follow-up on a proposal waiting. A number never changes, and a superseded note is edited in place. Each
opens with a **Status and commit** line, then Context (what the code does today, with the
file and line that proves it), Decision, Shape, Steps, Tests, Risks, Open questions. Every
note is written against a **named commit** and verified against the code at it, not against
the plans. The code moves; where a note and the code disagree, the code wins.
