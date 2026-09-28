# Decisions

Designs that have been decided, one numbered file per decision, and whether the code has them yet. A note stays here
once it is built: it is the record of why the code has that shape.

| Note                                                            | Decides                                                    | Status                                                                                                                                                            |
| --------------------------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [0001](0001-channel-neutral-inbound.md)                         | A channel-neutral inbound pipeline                         | Decided, not built                                                                                                                                                |
| [0002](0002-appointments-record.md)                             | An appointments record                                     | Decided, not built                                                                                                                                                |
| [0003](0003-team-assignment.md)                                 | Team assignment                                            | Decided, not built                                                                                                                                                |
| [0004](0004-deals-record.md)                                    | A deal is a record                                         | Built, steps 1 to 4; step 5's three items are 0005, 0006 and 0002                                                                                                 |
| [0005](0005-a-payment-writes-won.md)                            | A payment writes won                                       | Decided, not built                                                                                                                                                |
| [0006](0006-a-proposal-follow-up.md)                            | A proposal waiting gets a follow-up                        | Built                                                                                                                                                             |
| [0007](0007-person-notes.md)                                    | A note is a record                                         | Built: its three phases and the day a note may have                                                                                                               |
| [0008](0008-a-proposal-is-part-of-the-deal.md)                  | A proposal is part of the deal                             | Built, all but step 7: the person's own proposal link (`contacts.proposal_url`, `set_person_proposal`) has not retired                                            |
| [0009](0009-one-idea-of-a-list.md)                              | One idea of a list                                         | Built, steps 1 to 4; step 5 (the server's count past the page's bound) waits until a workspace nears it, and the end-to-end journey its Tests name is not written |
| [0010](0010-leads-are-paid-per-verified-lead.md)                | Leads are paid for per verified lead                       | Decided, not built                                                                                                                                                |
| [0011](0011-a-bearer-token-beside-the-cookie.md)                | A bearer token beside the cookie                           | Built with the note (the phone app's PR 8)                                                                                                                        |
| [0012](0012-partners.md)                                        | A partner brings a workspace, sets it up and earns a share | Built, P1 to P5; step 6's items are each a later note of their own                                                                                                |
| [0013](0013-a-partner-signs-in-with-a-second-factor.md)         | A partner signs in with a second factor                    | M1 and M2 built (00217); M3, the enforcement, built (00218), merged only once TOTP is on in the hosted project                                                    |
| [0014](0014-a-partner-hears-what-changed.md)                    | A partner hears what changed, once a day                   | Built with the note (00209, #1165)                                                                                                                                |
| [0015](0015-the-shell-leaves-surface-by-surface.md)             | The shell leaves, one surface at a time                    | Proposed, not built; Ruben's to accept                                                                                                                            |
| [0016](0016-a-partner-sets-up-a-workspace-and-hands-it-over.md) | A partner sets up a workspace and hands it to its owner    | Built with the note (00214, #1177)                                                                                                                                |
| [0017](0017-a-lead-reply-is-drafted-on-its-reading.md)          | A lead's reply is drafted on its reading                   | Decided, not built (Reach out Part 5's PR 5 builds it)                                                                                                            |
| [0021](0021-people-are-paged-by-a-moment-the-database-keeps.md) | People are paged by a moment the database keeps            | Proposed, not built; Ruben's to accept                                                                                                                            |

Open pull request #1039, the pricing note, is written as 0011, which the bearer token has held since #1149: it
takes the next free number when it lands. A number never changes once it is on `main`.

A superseded note is edited in place. Each opens with a **Status and commit** line, then Context (what the code does
today, with the file and line that proves it), Decision, Shape, Steps, Tests, Risks, Open questions. Every note is
written against a **named commit** and verified against the code at it, not against the plans. When a note's status
changes, its status line and this table change in the same pull request, and say the commit the status was read at.
The code moves; where a note and the code disagree, the code wins.
