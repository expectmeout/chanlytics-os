# 0030 · A campaign is counted by its channel

**Status:** Decided on 6 October 2026 (Ruben, on #18 of the 4 October campaigns wiring review: "go with the best
recommendations you ultimately suggest"). Built, steps 1 to 4 (6 October 2026), with their tests (migration 00329).
Written against `81d8455ca` (main, 6 October 2026) with [0029](0029-a-person-s-every-open-deal-is-worked.md)'s branch
beneath it, and verified against the code and the schema snapshot; where this note and the code disagree, the code
wins. It answers the review's #18 ("campaign figures have no per-channel split").

## Context

- **What a campaign sent is counted over every channel at once.** `campaign_series` (00320) counts what the broadcasts
  and playbook runs sent, and what came of it: sent, delivered (a delivered or read status), read (a read status),
  replied, by day over two periods and by source. `broadcast_recipients.channel` (00298) names the channel each went
  by; a row naming none is from before channels, when every run went by WhatsApp.
- **Only WhatsApp gives read receipts.** An email has no read status (nothing tracks an open), and a plain text has
  none either. So every share of reads over sends fell with each text or email sent and said nothing true of
  WhatsApp's: Campaigns' home funnel (`packages/contracts/src/playbooks/lifecycle-tiles.ts`, read over every send) and a
  run's read share (`toBroadcastVM`, which Ask's campaigns tool says).
- **Nothing said how each channel did.** Reports' Campaigns lens (`apps/dashboard/src/surfaces/reports/lenses/campaigns.tsx`),
  Campaigns' home and Ask counted a period as one.
- **Ask did not hear the Campaigns lens.** Its report tool (`apps/dashboard/src/server/ask/tools/read/report.ts`) read
  the Reports page's main figures, never the campaigns'.

## Decision

1. **`campaign_series` returns `by_channel`**: the current period's sent, delivered, read and replied for each channel
   that sent, the most first. Everything else it returns is unchanged.
2. **A read is a share of WhatsApp's own sends**, wherever it is a share: the report's `totals.read` and `totals.readOf`
   (`toCampaignReportVM`), the home funnel's read step (a line under it where a text or an email went too, and no read
   step where nothing went by WhatsApp), and a run's read share (`toBroadcastVM`, from its counts' `sent_by`, a read
   counted on WhatsApp alone, so a text a carrier marked read never takes a run past the whole). A source's sends are
   every channel's, so a source says no read share.
3. **Reports' Campaigns lens draws a "By channel" card where more than one channel sent**: a bar per channel in the
   colour the channel wears across Reports (`RPT_CHANNEL_COLORS`), its delivered share beside it, every figure in its
   table (the card's own Chart and Table switch), and what a read is under it. It is the kit's `ChartCard` and
   `BarList`, in Reports' own channel words (`REPORT_CHANNELS`). Campaigns' home funnel says its steps to a screen
   reader as they are, a read only where there is one.
4. **Ask hears the same.** The report tool carries the Campaigns lens: its tiles, the read of WhatsApp's sends (where
   the channels were counted), `by_channel` where more than one sent, and its sources, each with its shares; where its
   numbers could not be read it says so as an error, never as nothing sent. The campaigns tool says a run's split
   (`sent_by_channel`) and its read over WhatsApp's sends.

## Shape

- **Database.** 00329 creates `campaign_series` again with a `by_channel` CTE over the rows it already reads; its grants
  and comment restated.
- **Contracts.** `CampaignChannelDto`, `CampaignChannelVM`, and `CampaignReportVM`'s `channels`, `channelTable`,
  `lines.channels` and `totals.readOf`; `LifecycleReport.totals.readOf`, `LifecycleResultsTile.readNote` and its words;
  `BroadcastCounts.sent_by` (the wire's snake_case), `sentByWords` and `toBroadcastVM`'s read share;
  `CampaignSourceVM` loses its read share; `LifecycleResultsTile.funnelLabel`.
- **Dashboard.** The runs' list read takes each recipient's channel and counts what each sent; Reports' Campaigns lens
  card and the Reports sample's split (each count shared under each channel's own sends); Campaigns' home's read note
  and the funnel's label; Ask's report and campaigns tools.

## Steps

All four are built, in one pull request:

1. 00329: `campaign_series` by channel.
2. The report's channels, and a read over WhatsApp's sends.
3. The pages: Reports' card and Campaigns' home funnel.
4. A run's split, and Ask.

## Tests

- `tooling/scripts/tests/reports/report-days.db.test.mjs`: on the stack, each channel's own sends, receipts and replies
  in the current period; a row naming none went by WhatsApp; the period before is not in it.
- `tooling/scripts/tests/reports/campaign-report.test.mjs`: the channels, the read over WhatsApp's sends, the table and
  the line; one channel, none by WhatsApp, a channel the report has no word for.
- `tooling/scripts/tests/playbooks/home/lifecycle.test.mjs`, `campaigns-home.test.mjs`: the funnel's read step, its line
  and its absence.
- `tooling/scripts/tests/reports/lenses/reports-lens-page.test.mjs`: the card where more than one channel sent, and none
  where one did or a report predates the channels.
- `tooling/scripts/tests/broadcasts/broadcasts.test.mjs`, `broadcast-counts-are-whole.test.mjs`,
  `tooling/scripts/tests/playbooks/send-rails.test.mjs`: a run's counts by channel and its read share.
- `tooling/scripts/tests/ask/ask-turn.test.mjs`, `tooling/scripts/tests/broadcasts/ask-broadcasts-reads.test.mjs`: Ask's
  report and a run's line; `ask-registry.test.mjs` and `ask-tool-names.test.mjs` hold the two tools' changed words and
  the report's one change of bytes.

## Risks

- **Either deploy order works.** Code before 00329 reads no `by_channel` and counts a read over every send, as before;
  00329 before the code adds a key nobody reads.
- **The read share rises where texts and emails went.** It is now WhatsApp's own; the home's line and the lens's card
  say why.
- **The runs' list reads one more column per recipient**, which every database has had since 00298.

## Still held

- **The days' chart and the sources' table are not split by channel.** The card is the period's.
- **No change against the period before** is said per channel.
- **A text's read receipt** (a line that gives one, as RCS may) is not counted: a text's read is no figure.

## Open questions for the owner

None.
