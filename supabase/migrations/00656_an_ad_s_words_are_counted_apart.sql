-- An ad's words are counted apart (the Ads plan's 6.7 and G19; decision 0050, Routes).
--
-- New ad's draft is written by the model: three versions of an ad's words, by the ad writer, when an owner opens
-- New ad or tells AI what to change. It is the one route of Ads that spends Chanlytics' own money.
-- ai_usage.purpose takes ad_draft, so what ad writing costs is a line of the ledger of its own and never mixed into
-- the other drafts: the figure its price is set from.
-- Deploy order: this first. An edge that asks before it is applied still gets its answer; only the ledger's row is
-- refused (ai_usage_write_failed). Re-runnable.

set local lock_timeout = '3s';

-- contracts AI_USAGE_PURPOSES (ai/hearing.ts): 00642's set, with an ad's words last of Anthropic's.
alter table public.ai_usage drop constraint if exists ai_usage_purpose_check;
alter table public.ai_usage add constraint ai_usage_purpose_check
  check (purpose in ('receptionist', 'reply_draft', 'ask', 'lead_json', 'template_draft', 'review_reply',
                     'lead_judge', 'note_suggest', 'reach_out_check', 'reply_read', 'booking_read', 'lead_suggest',
                     'ask_journal', 'receptionist_review', 'fix_route', 'website_read', 'sender_read', 'file_look',
                     'preview_starters', 'ad_draft', 'file_words', 'file_hear'));
